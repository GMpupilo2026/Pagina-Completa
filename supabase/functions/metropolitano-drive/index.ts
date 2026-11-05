// Edge Function: metropolitano-drive
//
// Pasa al Drive lo que llega por la inscripción del Metropolitano 2026 (la
// foto, el comprobante de pago, el tiquete y el pasaporte de los titulados, y
// una ficha con los datos), ordenado por torneo y por delegación:
//
//   Inscripciones Metropolitano 2026 / Torneo A / MET-0012 - Mora Solís, Ana / …
//   Inscripciones Metropolitano 2026 / Delegación - Club Ajedrez Heredia /
//       Comprobante de pago.pdf
//       MET-0013 - Rojas Vega, Carlos (Delegado) / …
//
// Ver «Las inscripciones en el Drive» en docs/decisiones/cuentas-y-formularios.md.
//
// EL DRIVE LO TOCA UN APPS SCRIPT, NO ESTA FUNCIÓN
// Como el de los JDN y el del Centroamericano: los archivos tienen que ser de
// la dueña del Drive y gastar su espacio. El puente es
// documentos/metropolitano-2026/puente-drive.gs; esta función le pasa cada
// archivo con un secreto. La dirección y el secreto viven en la bóveda
// (metropolitano_drive_leer / metropolitano_drive_guardar, solo service_role).
//
// LO QUE SE QUEDA EN LA BASE SIEMPRE ES LA COPIA BUENA
// Los archivos viven en el bucket privado «metropolitano-2026»; el Drive es una
// copia ordenada para la organización. Si el Drive falla o no está conectado,
// no se pierde nada: la fila queda sin `drive_en` y se reintenta.
//
// QUIÉN LA LLAMA: verify_jwt en FALSE
// - Quien administra, desde metropolitano-inscritos.html: «estado»,
//   «conectar» y «enviar» (las que faltan). Exige su sesión, el aal2 (esta
//   función mira el permiso con la clave de servicio, así que el candado de la
//   base no la alcanza) e is_admin.
// - La base, cada 10 minutos (interno.metropolitano_drive_tocar, pg_net), sin
//   sesión de persona: por eso verify_jwt va en false. Trae en `x-aviso` el
//   secreto `metropolitano_drive_aviso` de la bóveda y solo puede «enviar».
//
// Acciones:
//   "estado"   {}               -> { conectado, carpeta?, pendientes, con_error }
//   "conectar" { url, secreto } -> lo prueba y, si contesta, lo guarda
//   "enviar"   {}               -> { ok, enviados, errores, quedan }

import { createClient } from "npm:@supabase/supabase-js@2";
import { aBase64, llamarPuente } from "./drive-puente.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const BUCKET = "metropolitano-2026";
const POR_VUELTA = 12;   // inscripciones por llamada: el tope de tiempo de una Edge Function
const URL_SCRIPT = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Tiene la verificación en dos pasos y el token todavía no la pasó (aal1).
function sesionAMedias(factores: { status: string }[] | undefined, jwt: string): boolean {
  if (!(factores ?? []).some((f) => f.status === "verified")) return false;
  try {
    const b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4))).aal !== "aal2";
  } catch {
    return true;
  }
}

function mismoSecreto(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const TORNEO: Record<string, string> = { A: "Torneo A", B: "Torneo B", U14: "Torneo U14", BLITZ: "Torneo Blitz" };
const ROL: Record<string, string> = { jugador: "Jugador", entrenador: "Entrenador", acompanante: "Acompañante", delegado: "Delegado", arbitro: "Árbitro" };
const TIPO_DE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

type Fila = Record<string, any>;

const codigo = (x: Fila) => "MET-" + String(x.numero).padStart(4, "0");
const quienEs = (x: Fila) => (x.rol === "jugador" ? (x.clasico ? TORNEO[x.clasico] : "Torneo Blitz") : (x.es_delegado ? "Delegado" : ROL[x.rol] ?? x.rol));

// Dónde va cada persona: por torneo, o dentro de su delegación.
export function carpetasDe(x: Fila): string[] {
  const persona = codigo(x) + " - " + x.apellidos + ", " + x.nombre;
  if (x.grupo && x.delegacion) return ["Delegación - " + x.delegacion, persona + " (" + quienEs(x) + ")"];
  if (x.rol === "jugador") return [x.clasico ? TORNEO[x.clasico] : "Torneo Blitz", persona];
  // Los árbitros, en su carpeta: la organización los coordina aparte.
  if (x.rol === "arbitro") return ["Árbitros", persona];
  return ["Entrenadores, acompañantes y delegados", persona + " (" + quienEs(x) + ")"];
}

// La ficha en texto, para tener todo a mano en el Drive.
export function fichaDe(x: Fila): string {
  const l = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? null : k + ": " + v);
  const torneos = (x.torneos ?? []).map((t: string) => TORNEO[t] ?? t).join(" + ");
  return [
    "XLVII Torneo Internacional Metropolitano 2026 — inscripción " + codigo(x),
    "",
    l("Nombre", x.nombre + " " + x.apellidos),
    l("Se inscribe como", quienEs(x)),
    l("Torneos", torneos),
    l("Delegación", x.delegacion),
    l("ID FIDE", x.fide_id ? x.fide_id + (x.titulo ? " (" + x.titulo + ")" : "") : "No tiene"),
    l("Nombre en FIDE", x.nombre_fide),
    l("Federación", x.federacion),
    l("Nacimiento", x.nacimiento),
    l("Sexo", x.sexo === "f" ? "Femenino" : "Masculino"),
    l("Nacionalidad / vive en", x.nacionalidad + " / " + x.pais_residencia),
    l("De dónde viene", x.provincia ? x.canton + ", " + x.provincia : null),
    l("Documento", x.documento_tipo + " " + x.documento),
    l("Correo", x.correo),
    l("Teléfono", x.telefono),
    l("Club", x.club),
    l("Responsable", x.responsable ? [x.responsable.nombre, x.responsable.telefono].filter(Boolean).join(" · ") : null),
    l("Emergencias", x.emergencia ? [x.emergencia.nombre, x.emergencia.parentesco, x.emergencia.telefono].filter(Boolean).join(" · ") : null),
    l("Viaje", x.viaje ? [x.viaje.llegada && "llega " + x.viaje.llegada, x.viaje.salida && "sale " + x.viaje.salida, x.viaje.vuelo, x.viaje.traslado && "pide transporte del aeropuerto"].filter(Boolean).join(" · ") : null),
    l("Hospedaje", x.hospedaje ? x.hospedaje_desde + " a " + x.hospedaje_hasta + " (" + x.habitacion + ")" : null),
    l("Acompañantes", (x.acompanantes_detalle ?? []).map((a: Fila) => [a.nombre, a.parentesco, a.documento, a.nacimiento].filter(Boolean).join(", ")).join(" | ")),
    l("Alimentación", (x.comidas ?? []).length ? x.comidas.join(", ") + " del " + x.comidas_desde + " al " + x.comidas_hasta : null),
    l("Dieta", x.dieta),
    l("Condición", (x.condicion ?? []).join(", ")),
    l("Accesibilidad", x.accesibilidad),
    l("Monto", "USD " + x.monto_usd + (Number(x.iva_usd) ? " (incluye IVA " + x.iva_usd + ")" : "")),
    l("Código de descuento", x.codigo_descuento ? x.codigo_descuento + " (" + x.descuento_pct + " %)" : null),
    l("Pago", x.pago_metodo ? x.pago_metodo + (x.pago_referencia ? " · ref. " + x.pago_referencia : "") : "Sin costo"),
    l("Publicidad", x.acepta_publicidad ? "Autoriza nombre y foto" : "No autoriza"),
    l("Seguro y exoneración", x.acepta_seguro ? "Aceptó (" + x.exoneracion_version + ")" : null),
    l("Se inscribió", x.creado),
  ].filter((s) => s !== null).join("\n") + "\n";
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
  const accion = String(body.accion ?? body.action ?? "");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: filasBoveda } = await admin.rpc("metropolitano_drive_leer");
  const guardado = (Array.isArray(filasBoveda) ? filasBoveda[0] : filasBoveda) ?? {};

  // La base (cada 10 minutos) con su aviso, o quien administra con su sesión.
  const aviso = req.headers.get("x-aviso") ?? "";
  const esLaBase = !!aviso && mismoSecreto(aviso, String(guardado.aviso ?? ""));
  if (!esLaBase) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Falta la sesión." }, 401);
    const { data: usuario, error } = await admin.auth.getUser(jwt);
    if (error || !usuario?.user) return json({ error: "La sesión no es válida." }, 401);
    if (sesionAMedias(usuario.user.factors, jwt)) return json({ error: "Falta el segundo paso de la verificación: vuelve a entrar y escribe el código de tu app." }, 401);
    const { data: perfil } = await admin.from("profiles").select("is_admin").eq("id", usuario.user.id).maybeSingle();
    if (!perfil?.is_admin) return json({ error: "Solo quien administra maneja el Drive de las inscripciones." }, 403);
  } else if (accion !== "enviar") {
    return json({ error: "La base solo puede mandar lo que falta." }, 403);
  }

  const contar = async () => {
    const p = await admin.from("metropolitano_inscripciones").select("id", { count: "exact", head: true }).is("drive_en", null).eq("estado", "activa");
    const e = await admin.from("metropolitano_inscripciones").select("id", { count: "exact", head: true }).is("drive_en", null).eq("estado", "activa").not("drive_error", "is", null);
    return { pendientes: p.count ?? 0, con_error: e.count ?? 0 };
  };

  if (accion === "estado") {
    if (!guardado.url || !guardado.secreto) return json({ conectado: false, ...(await contar()) });
    const r = await llamarPuente(guardado.url, guardado.secreto, { accion: "probar" });
    return json({ conectado: !!r.ok, carpeta: r.carpeta, error: r.ok ? undefined : r.error, ...(await contar()) });
  }

  if (accion === "conectar") {
    const url = String(body.url ?? "").trim();
    const secreto = String(body.secreto ?? "").trim();
    if (!URL_SCRIPT.test(url)) return json({ error: "La dirección tiene que ser la de la aplicación web: https://script.google.com/macros/s/…/exec" }, 400);
    if (secreto.length < 32) return json({ error: "El secreto es el que dejó escrito «configurar» en el registro del Apps Script." }, 400);
    const r = await llamarPuente(url, secreto, { accion: "probar" });
    if (!r.ok) return json({ error: r.error === "secreto" ? "El Apps Script no reconoce ese secreto." : (r.error || "El Drive no contestó.") }, 400);
    const { error } = await admin.rpc("metropolitano_drive_guardar", { p_url: url, p_secreto: secreto });
    if (error) return json({ error: "Se probó bien, pero no se pudo guardar. Intenta de nuevo." }, 500);
    return json({ conectado: true, carpeta: r.carpeta, ...(await contar()) });
  }

  if (accion === "enviar") {
    if (!guardado.url || !guardado.secreto) return json({ error: "Todavía no está conectado el Drive: usa «Conectar con Drive»." }, 409);
    const { data: filas, error } = await admin.from("metropolitano_inscripciones").select("*")
      .is("drive_en", null).eq("estado", "activa")
      // Primero las que nunca se intentaron: una que falla siempre no tapa a las demás.
      .order("drive_error", { ascending: true, nullsFirst: true }).order("numero").limit(POR_VUELTA);
    if (error) return json({ error: "No se pudieron leer las inscripciones." }, 500);
    let enviados = 0, errores = 0;
    // Un comprobante por delegación: va una vez, a la carpeta de la delegación.
    const comprobantesYa = new Set<string>();
    for (const x of filas ?? []) {
      const carpetas = carpetasDe(x);
      const archivos: { ruta: string | null; nombre: string; carpetas: string[] }[] = [
        { ruta: x.foto, nombre: "Foto", carpetas },
        { ruta: x.tiquete, nombre: "Tiquete aéreo", carpetas },
        { ruta: x.pasaporte, nombre: "Pasaporte", carpetas },
      ];
      if (x.comprobante) {
        if (x.grupo) {
          if (!comprobantesYa.has(x.grupo)) archivos.push({ ruta: x.comprobante, nombre: "Comprobante de pago", carpetas: carpetas.slice(0, 1) });
          comprobantesYa.add(x.grupo);
        } else archivos.push({ ruta: x.comprobante, nombre: "Comprobante de pago", carpetas });
      }
      let fallo: string | null = null;
      for (const a of archivos) {
        if (!a.ruta) continue;
        const ext = (/\.([a-z0-9]+)$/i.exec(a.ruta) ?? [])[1]?.toLowerCase() ?? "";
        const tipo = TIPO_DE[ext];
        if (!tipo) { fallo = "Un archivo no es una foto ni un PDF: " + a.ruta; break; }
        const { data: blob, error: e2 } = await admin.storage.from(BUCKET).download(a.ruta);
        if (e2 || !blob) { fallo = "No se pudo leer " + a.ruta + " del bucket."; break; }
        const r = await llamarPuente(guardado.url, guardado.secreto, {
          accion: "archivo", carpetas: a.carpetas, nombre: a.nombre + "." + (ext === "jpeg" ? "jpg" : ext), tipo,
          contenido: aBase64(new Uint8Array(await blob.arrayBuffer())),
        }, 60000);
        if (!r.ok) { fallo = r.error || "El Drive no guardó " + a.nombre + "."; break; }
      }
      if (!fallo) {
        const r = await llamarPuente(guardado.url, guardado.secreto, {
          accion: "archivo", carpetas, nombre: "Ficha de inscripción.txt", tipo: "text/plain",
          contenido: aBase64(new TextEncoder().encode(fichaDe(x))),
        });
        if (!r.ok) fallo = r.error || "El Drive no guardó la ficha.";
      }
      await admin.from("metropolitano_inscripciones").update(fallo ? { drive_error: fallo.slice(0, 300) } : { drive_en: new Date().toISOString(), drive_error: null }).eq("id", x.id);
      if (fallo) errores++; else enviados++;
    }
    const { pendientes } = await contar();
    return json({ ok: true, enviados, errores, quedan: pendientes });
  }

  return json({ error: "Acción desconocida." }, 400);
});
