// Edge Function: jdn-drive
//
// Guarda la ficha de inscripción de los Juegos Deportivos Nacionales 2027 en
// el Drive, ordenada por comité: JDN 2027 / <comité> / <Atletas|Entrenadores> /
// <Mujeres|Hombres> / <persona>, con la ficha llena (la arma el navegador,
// js/jdn-consentimiento.js), la fotografía y la cédula; y una fila en la hoja
// «Resumen» del comité. Ver «La ficha de los JDN 2027» en
// docs/decisiones/cuentas-y-formularios.md.
//
// EL DRIVE LO TOCA UN APPS SCRIPT, NO ESTA FUNCIÓN
// Los archivos tienen que ser de la dueña del Drive y gastar su espacio. Una
// cuenta de servicio de Google no tiene espacio propio en «Mi unidad», y una
// llave de Google Cloud acá sería una credencial más que cuidar. El puente es
// documentos/jdn/puente-drive.gs, publicado como aplicación web que corre como su
// dueña; esta función le pasa los archivos con un secreto. La dirección y el
// secreto viven en la bóveda (jdn_drive_leer / jdn_drive_guardar), y los pone
// quien administra desde jdn.html con «Conectar con Drive»: antes de guardarlos
// se prueban.
//
// DOS PUERTAS: ADMINISTRACIÓN Y LA FAMILIA SIN CUENTA
// La ficha la puede mandar cualquiera desde jdn.html, sin cuenta (lo pidió el
// dueño del sitio: así la llena la familia). Por eso va con verify_jwt en
// FALSE: una página sin sesión no trae un JWT de persona, y la comprobación la
// hace esta función.
// - «estado», «conectar» y el «guardar» con modo "admin" exigen la sesión de
//   quien administra: getUser, el aal2 (esta función mira el permiso con la
//   clave de servicio, así que el candado de la base no la alcanza) e is_admin.
// - El «guardar» sin cuenta pasa por el freno de los envíos públicos
//   (jdn_frenar: por IP, por correo y en total) ANTES de tocar el Drive, y sus
//   archivos llevan la fecha y la hora en el nombre: el puente manda a la
//   papelera los que se llaman igual, y un envío anónimo con el nombre de otra
//   persona no puede borrarle su ficha. Tampoco recibe los enlaces del Drive.
//
// Acciones:
//   "estado"   {}                         -> { conectado, carpeta?, url? }
//   "conectar" { url, secreto }           -> lo prueba y, si contesta, lo guarda
//   "guardar"  { modo?, persona, correo, comite, rol, sexo, resumen, archivos,
//                privacidad_version }     -> { ok }
//
// A nadie se le devuelven los enlaces del Drive: quien llena solo descarga su
// ficha (lo pidió el dueño del sitio), y quien administra entra al Drive por
// su cuenta.
//
// EL CORREO SE COMPRUEBA CONTRA EL DNS
// Además de la forma, el dominio tiene que recibir correo (un MX, o al menos
// una dirección, como dice el RFC 5321). Se pregunta a dns.google con un tope
// de 4 segundos; si no contesta, se deja pasar: un DNS caído no frena una
// inscripción. «gmial.com» o «hotmail.co» sí se frenan.

import { createClient } from "npm:@supabase/supabase-js@2";
import { fechaCR, ZONA_CR } from "./hora-cr.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const MAX_BASE64 = 24 * 1024 * 1024;   // la ficha y tres imágenes ya achicadas pesan ~2 MB
const MAX_BASE64_PUBLICO = 12 * 1024 * 1024;   // sin cuenta, la mitad: alcanza de sobra
const TIPOS = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "application/pdf",
]);
const ROLES = new Set(["atleta", "entrenador"]);
const SEXOS = new Set(["mujer", "hombre"]);
const CAMPOS_RESUMEN = ["nombre", "rol", "sexo", "categoria", "identificacion", "nacimiento", "telefono", "correo", "canton"];
// El dominio de los alumnos sin correo no tiene MX a propósito (ver CLAUDE.md).
const SIN_CORREO = /(^|\.)alumno\.ajedrez-integral\.com$/i;
const URL_SCRIPT = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Tiene la verificación en dos pasos y el token todavía no la pasó (aal1).
// El token ya lo validó getUser(); acá solo se lee su «aal».
function sesionAMedias(factores: { status: string }[] | undefined, jwt: string): boolean {
  if (!(factores ?? []).some((f) => f.status === "verified")) return false;
  try {
    const b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4))).aal !== "aal2";
  } catch {
    return true;
  }
}

// El Apps Script contesta con una redirección a googleusercontent.com, que
// fetch sigue sola (y la sigue con GET, que es como la espera Google).
async function alPuente(url: string, cuerpo: Record<string, unknown>) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(cuerpo),
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    });
    const texto = await res.text();
    try {
      return JSON.parse(texto);
    } catch {
      return { ok: false, error: "El Drive no contestó como se esperaba (¿la aplicación web está implementada con acceso para «Cualquier persona»?)" };
    }
  } catch {
    return { ok: false, error: "No se pudo llegar al Drive. Intenta de nuevo en un momento." };
  }
}

// La IP de quien manda, para el freno: la pone Cloudflare delante de Supabase.
function ipDe(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
  return ip?.trim() || null;
}

// ¿El dominio del correo recibe correo? Ver «EL CORREO SE COMPRUEBA CONTRA EL
// DNS» arriba. Solo dice que no cuando el DNS lo dice claro.
async function dominioRecibe(dominio: string): Promise<boolean> {
  if (SIN_CORREO.test(dominio)) return false;
  const preguntar = async (tipo: string) => {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(dominio)}&type=${tipo}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) throw new Error("dns");
    return await res.json() as { Status: number; Answer?: { type: number; data: string }[] };
  };
  try {
    const mx = await preguntar("MX");
    if (mx.Status === 3) return false;          // NXDOMAIN: el dominio no existe
    if (mx.Status !== 0) return true;           // el DNS falló: no se frena a nadie
    const registros = (mx.Answer ?? []).filter((a) => a.type === 15);
    // «0 .» es el MX nulo: el dominio dice que no recibe correo (RFC 7505).
    if (registros.length) return registros.some((a) => !/^0\s+\.$/.test(a.data.trim()));
    const a = await preguntar("A");
    if (a.Status !== 0) return a.Status !== 3;
    return (a.Answer ?? []).some((r) => r.type === 1);
  } catch {
    return true;
  }
}

// «2026-10-05 17.04», en hora de Costa Rica, para el nombre de los archivos.
function marcaDeHora(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: ZONA_CR }).slice(0, 16).replace(":", ".");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }
  const accion = body.action;
  const publico = accion === "guardar" && body.modo !== "admin";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Administración: sesión, segundo paso e is_admin, ANTES de leer la bóveda.
  let quien: { id: string; email?: string } | null = null;
  if (!publico) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Falta la sesión." }, 401);
    const { data: usuario, error: quienError } = await admin.auth.getUser(jwt);
    if (quienError || !usuario?.user) return json({ error: "La sesión no es válida." }, 401);
    if (sesionAMedias(usuario.user.factors, jwt)) {
      return json({ error: "Falta el segundo paso de la verificación: vuelve a entrar y escribe el código de tu app." }, 401);
    }
    const { data: perfil } = await admin.from("profiles").select("is_admin").eq("id", usuario.user.id).maybeSingle();
    if (!perfil?.is_admin) return json({ error: "Solo quien administra guarda las fichas de los JDN." }, 403);
    quien = { id: usuario.user.id, email: usuario.user.email };
  }

  const { data: filas } = await admin.rpc("jdn_drive_leer");
  const guardado = Array.isArray(filas) ? filas[0] : filas;

  if (accion === "estado") {
    if (!guardado?.url || !guardado?.secreto) return json({ conectado: false });
    const r = await alPuente(guardado.url, { secreto: guardado.secreto, accion: "probar" });
    return json(r.ok ? { conectado: true, carpeta: r.carpeta, url: r.url } : { conectado: false, error: r.error });
  }

  if (accion === "conectar") {
    const url = String(body.url ?? "").trim();
    const secreto = String(body.secreto ?? "").trim();
    if (!URL_SCRIPT.test(url)) {
      return json({ error: "La dirección tiene que ser la de la aplicación web: https://script.google.com/macros/s/…/exec" }, 400);
    }
    if (secreto.length < 32) return json({ error: "El secreto es el que dejó escrito «configurar» en el registro del Apps Script." }, 400);
    const r = await alPuente(url, { secreto, accion: "probar" });
    if (!r.ok) return json({ error: r.error === "Secreto equivocado" ? "El Apps Script no reconoce ese secreto." : (r.error || "El Drive no contestó.") }, 400);
    const { error } = await admin.rpc("jdn_drive_guardar", { p_url: url, p_secreto: secreto });
    if (error) return json({ error: "Se probó bien, pero no se pudo guardar. Intenta de nuevo." }, 500);
    return json({ conectado: true, carpeta: r.carpeta, url: r.url });
  }

  if (accion === "guardar") {
    if (!guardado?.url || !guardado?.secreto) {
      return json({ error: publico
        ? "La academia todavía no está recibiendo fichas. Escríbele para avisarle."
        : "Todavía no está conectado el Drive: usa «Conectar con Drive»." }, 409);
    }
    // El consentimiento de quien entrega los datos: la versión de la política
    // que se le mostró (AAAA-MM-DD, de js/legal-version.js).
    const version = String(body.privacidad_version ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) {
      return json({ error: "Falta marcar que la persona aceptó la Política de privacidad." }, 400);
    }
    const persona = String(body.persona ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if ((persona.match(/\p{L}/gu) || []).length < 2) return json({ error: "Falta el nombre de la persona." }, 400);
    const comite = String(body.comite ?? "").replace(/[\\/]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if ((comite.match(/\p{L}/gu) || []).length < 2) return json({ error: "Falta el comité que representa." }, 400);
    const rol = String(body.rol ?? "");
    const sexo = String(body.sexo ?? "");
    if (!ROLES.has(rol)) return json({ error: "Falta si es atleta o entrenador." }, 400);
    if (!SEXOS.has(sexo)) return json({ error: "Falta el sexo biológico." }, 400);
    const r0 = (body.resumen && typeof body.resumen === "object") ? body.resumen as Record<string, unknown> : {};
    const resumen: Record<string, string> = {};
    for (const k of CAMPOS_RESUMEN) resumen[k] = String(r0[k] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

    // El correo es obligatorio en la ficha: con forma de correo y un dominio
    // que reciba correo.
    const correo = String(body.correo ?? "").trim().toLowerCase().slice(0, 200);
    if (!/^[^\s@,;]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(correo)) return json({ error: "Falta un correo válido." }, 400);
    if (!(await dominioRecibe(correo.split("@")[1]))) {
      return json({ error: `El correo ${correo} no puede recibir mensajes: revisa lo que va después de la @.` }, 400);
    }
    resumen.correo = correo;

    const archivos = Array.isArray(body.archivos) ? body.archivos : [];
    if (!archivos.length || archivos.length > 6) return json({ error: "Llegaron archivos de más o de menos." }, 400);
    let total = 0;
    const limpios = [];
    for (const a of archivos as Record<string, unknown>[]) {
      const tipo = String(a.tipo ?? "");
      const base64 = String(a.base64 ?? "");
      const nombre = String(a.nombre ?? "").slice(0, 160);
      if (!TIPOS.has(tipo) || !nombre || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
        return json({ error: "Uno de los archivos no es una ficha, una imagen JPEG ni un PDF." }, 400);
      }
      total += base64.length;
      limpios.push({ nombre, tipo, base64, ficha: a.ficha === true });
    }
    if (total > (publico ? MAX_BASE64_PUBLICO : MAX_BASE64)) return json({ error: "Los archivos pesan demasiado: usa fotos más livianas." }, 413);

    const cuando = fechaCR(new Date(), { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
    let nota: string;
    if (publico) {
      // Sin cuenta: el freno (que cuenta el correo) va ANTES de tocar el Drive.
      if (limpios.filter((a) => a.ficha).length !== 1) return json({ error: "Falta la ficha." }, 400);
      const { data: freno, error: frenoError } = await admin.rpc("jdn_frenar", { p_ip: ipDe(req), p_correo: correo });
      if (frenoError) return json({ error: "No se pudo recibir la ficha. Intenta de nuevo en un momento." }, 500);
      if (freno) return json({ error: freno }, 429);
      // Con la fecha y la hora en el nombre: nunca se llaman igual que los que
      // ya están, así que el puente no manda nada a la papelera.
      const marca = marcaDeHora();
      for (const a of limpios) a.nombre = a.nombre.replace(/(\.[a-z]+)$/i, ` (enviada ${marca})$1`);
      nota = `Ficha JDN 2027 enviada sin cuenta desde ajedrez-integral.com/jdn.html (${cuando}), correo de contacto ${correo}. ` +
        `Consentimiento: Política de privacidad versión ${version}.`;
    } else {
      nota = `Ficha JDN 2027 guardada desde Ajedrez Integral por ${quien!.email ?? quien!.id} (${cuando}). ` +
        `Consentimiento: Política de privacidad versión ${version}.`;
    }
    resumen.enviada = cuando;
    resumen.nota = publico ? "Sin cuenta" : `Por ${quien!.email ?? quien!.id}`;
    const r = await alPuente(guardado.url, {
      secreto: guardado.secreto, accion: "guardar", persona, comite, rol, sexo, resumen, archivos: limpios, nota,
    });
    if (!r.ok) return json({ error: publico ? "No se pudo guardar la ficha. Intenta de nuevo en un momento." : (r.error || "El Drive no guardó los archivos.") }, 502);
    // Los enlaces del Drive son de la academia: nadie los recibe de vuelta.
    return json({ ok: true });
  }

  return json({ error: "Acción desconocida" }, 400);
});
