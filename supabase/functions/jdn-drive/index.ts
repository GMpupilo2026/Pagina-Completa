// Edge Function: jdn-drive
//
// Guarda la ficha de inscripción de los Juegos Deportivos Nacionales 2027 en
// el Drive: una carpeta con el nombre de la persona dentro de «JDN 2027», con
// la ficha llena (la arma el navegador, js/jdn-consentimiento.js), la
// fotografía y la cédula. Ver «La ficha de los JDN 2027» en
// docs/decisiones/cuentas-y-formularios.md.
//
// EL DRIVE LO TOCA UN APPS SCRIPT, NO ESTA FUNCIÓN
// Los archivos tienen que ser de la dueña del Drive y gastar su espacio. Una
// cuenta de servicio de Google no tiene espacio propio en «Mi unidad», y una
// llave de Google Cloud acá sería una credencial más que cuidar. El puente es
// herramientas/jdn-drive.gs, publicado como aplicación web que corre como su
// dueña; esta función le pasa los archivos con un secreto. La dirección y el
// secreto viven en la bóveda (jdn_drive_leer / jdn_drive_guardar), y los pone
// quien administra desde jdn.html con «Conectar con Drive»: antes de guardarlos
// se prueban.
//
// SOLO QUIEN ADMINISTRA, CON SU SEGUNDO PASO
// Son datos de menores de edad y fotos de su cédula. Va con verify_jwt en
// true, se comprueba is_admin del perfil y el aal del token: esta función mira
// el permiso con la clave de servicio, así que el candado de la base
// (public.antes_de_cada_pedido) no la alcanza.
//
// Acciones:
//   "estado"   {}                         -> { conectado, carpeta?, url? }
//   "conectar" { url, secreto }           -> lo prueba y, si contesta, lo guarda
//   "guardar"  { persona, archivos, nota, privacidad_version }
//                                         -> { carpeta, archivos, pdf }

import { createClient } from "npm:@supabase/supabase-js@2";
import { fechaCR } from "./hora-cr.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const MAX_BASE64 = 24 * 1024 * 1024;   // la ficha y tres imágenes ya achicadas pesan ~2 MB
const TIPOS = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "application/pdf",
]);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Falta la sesión." }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: quien, error: quienError } = await admin.auth.getUser(jwt);
  if (quienError || !quien?.user) return json({ error: "La sesión no es válida." }, 401);
  if (sesionAMedias(quien.user.factors, jwt)) {
    return json({ error: "Falta el segundo paso de la verificación: vuelve a entrar y escribe el código de tu app." }, 401);
  }
  const { data: perfil } = await admin.from("profiles").select("is_admin").eq("id", quien.user.id).maybeSingle();
  if (!perfil?.is_admin) return json({ error: "Solo quien administra guarda las fichas de los JDN." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const { data: filas } = await admin.rpc("jdn_drive_leer");
  const guardado = Array.isArray(filas) ? filas[0] : filas;
  const accion = body.action;

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
    if (!guardado?.url || !guardado?.secreto) return json({ error: "Todavía no está conectado el Drive: usa «Conectar con Drive»." }, 409);
    // El consentimiento de quien entrega los datos: la versión de la política
    // que se le mostró (AAAA-MM-DD, de js/legal-version.js).
    const version = String(body.privacidad_version ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) {
      return json({ error: "Falta marcar que la persona aceptó la Política de privacidad." }, 400);
    }
    const persona = String(body.persona ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if ((persona.match(/\p{L}/gu) || []).length < 2) return json({ error: "Falta el nombre de la persona." }, 400);
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
    if (total > MAX_BASE64) return json({ error: "Los archivos pesan demasiado: usa fotos más livianas." }, 413);

    const nota = `Ficha JDN 2027 guardada desde Ajedrez Integral por ${quien.user.email ?? quien.user.id} ` +
      `(${fechaCR(new Date(), { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })}). ` +
      `Consentimiento: Política de privacidad versión ${version}.`;
    const r = await alPuente(guardado.url, { secreto: guardado.secreto, accion: "guardar", persona, archivos: limpios, nota });
    if (!r.ok) return json({ error: r.error || "El Drive no guardó los archivos." }, 502);
    return json({ ok: true, carpeta: r.carpeta, nombre: r.nombre, archivos: r.archivos, pdf: r.pdf ?? null });
  }

  return json({ error: "Acción desconocida" }, 400);
});
