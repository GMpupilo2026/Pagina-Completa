// Edge Function: jde-publicar (verify_jwt en false)
//
// «Juegos Estudiantiles MEP, modo árbitro» (jde-arbitro.html): quien organiza
// una fase de los Juegos Deportivos Estudiantiles la arma con el motor ya
// comprobado de Pareo Integral y, al cerrarla, publica el resumen acá SIN
// CUENTA —lo pidió el dueño del sitio— para que aparezca de inmediato en la
// página pública juegos-estudiantiles.html.
//
// No hay sesión que comprobar, así que el candado está todo adentro: el
// freno de los envíos públicos (jde_frenar, antes de escribir nada) y la
// validación de la forma del evento. Escribe con la clave de servicio porque
// jde_eventos no tiene ninguna política de escritura (la lectura sí es
// pública, sin candado: es justo lo que debe ver cualquier familia que busca
// el resultado de su regional).
//
// Ver «Juegos Estudiantiles MEP, modo árbitro» en
// docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";

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

function ipDe(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
  return ip?.trim() || null;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const FASES = ["institucional", "regional", "interregional", "nacional"] as const;
type Fase = typeof FASES[number];
const RAMAS = ["", "masculina", "femenina", "mixta"] as const;

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Cuerpo JSON inválido" }, 400); }

  const anio = Number(body.anio);
  const fase = texto(body.fase, 20) as Fase;
  const region = texto(body.region, 80);
  const categoria = texto(body.categoria, 40);
  const rama = texto(body.rama, 20);
  const nombre = texto(body.nombre, 160);
  const sede = texto(body.sede, 120);
  const fecha = texto(body.fecha, 10);
  const arbitro = texto(body.arbitro, 80);
  const correo = texto(body.correo, 160);
  const clasificacion = Array.isArray(body.clasificacion) ? body.clasificacion : [];

  if (!Number.isInteger(anio) || anio < 2024 || anio > 2100) {
    return json({ ok: false, error: "El año no es válido." }, 400);
  }
  if (!(FASES as readonly string[]).includes(fase)) {
    return json({ ok: false, error: "La fase no es ninguna de las cuatro de los JDE." }, 400);
  }
  if (fase !== "nacional" && region.length < 2) {
    return json({ ok: false, error: "Escribe la región o el comité que organiza esta fase." }, 400);
  }
  if (!(RAMAS as readonly string[]).includes(rama)) {
    return json({ ok: false, error: "La rama no es válida." }, 400);
  }
  if (nombre.length < 3) {
    return json({ ok: false, error: "Escribe el nombre del evento (al menos 3 letras)." }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha !== "") {
    return json({ ok: false, error: "La fecha no tiene el formato correcto." }, 400);
  }
  if (arbitro.length < 2) {
    return json({ ok: false, error: "Escribe el nombre de quien arbitra o publica este evento." }, 400);
  }
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    return json({ ok: false, error: "Ese correo no es válido." }, 400);
  }
  if (clasificacion.length < 1 || clasificacion.length > 300) {
    return json({ ok: false, error: "La clasificación debe traer de 1 a 300 puestos." }, 400);
  }

  const filas: { puesto: number; nombre: string; puntos: number; institucion: string }[] = [];
  for (const fila of clasificacion) {
    if (typeof fila !== "object" || fila === null) {
      return json({ ok: false, error: "Un puesto de la clasificación llegó con una forma inválida." }, 400);
    }
    const f = fila as Record<string, unknown>;
    const puesto = Number(f.puesto);
    const nombreFila = texto(f.nombre, 120);
    const puntos = Number(f.puntos);
    if (!Number.isInteger(puesto) || puesto < 1) {
      return json({ ok: false, error: "Un puesto de la clasificación no tiene un número de puesto válido." }, 400);
    }
    if (nombreFila.length < 1) {
      return json({ ok: false, error: "Un puesto de la clasificación llegó sin nombre." }, 400);
    }
    if (!Number.isFinite(puntos) || puntos < 0) {
      return json({ ok: false, error: "Un puesto de la clasificación no tiene puntos válidos." }, 400);
    }
    filas.push({ puesto, nombre: nombreFila, puntos, institucion: texto(f.institucion, 120) });
  }

  // El freno de los envíos públicos, ANTES de escribir nada.
  const { data: freno, error: frenoError } = await admin.rpc("jde_frenar", {
    p_ip: ipDe(req), p_correo: correo || null,
  });
  if (frenoError) return json({ ok: false, error: "No se pudo publicar el evento. Intenta de nuevo." }, 502);
  if (freno) return json({ ok: false, error: freno }, 429);

  const { data, error } = await admin.from("jde_eventos").insert({
    anio, fase, region, categoria, rama, nombre, sede,
    fecha: fecha || null, arbitro, clasificacion: filas,
  }).select("id").single();

  if (error) {
    return json({ ok: false, error: "No se pudo guardar el evento. Intenta de nuevo." }, 502);
  }
  return json({ ok: true, id: data?.id });
});
