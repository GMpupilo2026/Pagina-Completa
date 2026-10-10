// Edge Function: pareo-elo-nacional (verify_jwt en false)
//
// «Pareo Integral» (pareo.html) es sin cuenta y vive en el navegador de quien
// organiza: el torneo no sale de ahí. Esta función es la ÚNICA excepción, y a
// propósito: busca en ajedrezcostarica.com/es/national-rating si cada jugador
// de la lista ya tiene Elo Nacional, porque ese sitio no manda CORS y el
// navegador no lo puede leer directo. Se manda SOLO el nombre de cada
// jugador —nada de fecha de nacimiento, cédula ni ningún otro dato— y no se
// guarda nada acá ni del lado de quien llama: ni cuenta, ni tabla, ni
// bitácora de qué se buscó.
//
// NUNCA SE INVENTA UN NÚMERO NI SE ADIVINA UN HOMÓNIMO: si la búsqueda trae
// más de una persona con el mismo nombre normalizado, se devuelve «ambiguo»
// en vez de elegir cualquiera.
//
// Reusa el mismo lector de ajedrezcostarica.com que ya prueba
// herramientas/verificar-elo-fide.js (`_compartido/ajedrezcostarica.ts`,
// copiado acá por herramientas/funciones-armar.js al desplegar).
//
// Ver «Pareo Integral: institución, listas y Elo Nacional» en
// docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { busquedasPorNombre, leerListaNacional, type FilaNacional } from "./ajedrezcostarica.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const NACIONAL = "https://ajedrezcostarica.com/es/national-rating";
const MAX_JUGADORES = 40;       // techo de cordura por pedido
const CONCURRENCIA = 4;         // cuántas búsquedas a la vez

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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

async function traer(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AjedrezIntegral/1.0 (+https://ajedrez-integral.com)", "Accept": "text/html" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// El bolsillo de palabras, sin tildes ni comas: "Angulo Cubero, Oscar" y
// "Oscar Angulo Cubero" dan el mismo bolsillo, así que da igual el orden.
function bolsillo(nombre: string): string {
  const limpio = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z ,]/g, " ").replace(/,/g, " ");
  return limpio.split(/\s+/).filter(Boolean).sort().join(" ");
}

type Estado = "encontrado" | "no_encontrado" | "ambiguo";
type Resultado = { nombre: string; estado: Estado; nacional: number | null; fideEstandar: number | null; fideId: string | null };

async function buscarUno(nombreOriginal: string): Promise<Resultado> {
  const buscado = bolsillo(nombreOriginal);
  const vistos = new Map<string, FilaNacional>();
  for (const q of busquedasPorNombre(nombreOriginal)) {
    const html = await traer(`${NACIONAL}?name=${encodeURIComponent(q)}`);
    if (!html) continue;
    for (const fila of leerListaNacional(html)) {
      if (bolsillo(fila.nombre) === buscado) vistos.set(fila.fideId, fila);
    }
    if (vistos.size) break;   // ya encontró con esta búsqueda; no hace falta la siguiente
  }
  if (vistos.size === 0) return { nombre: nombreOriginal, estado: "no_encontrado", nacional: null, fideEstandar: null, fideId: null };
  if (vistos.size > 1) return { nombre: nombreOriginal, estado: "ambiguo", nacional: null, fideEstandar: null, fideId: null };
  const fila = [...vistos.values()][0];
  return { nombre: nombreOriginal, estado: "encontrado", nacional: fila.nacional, fideEstandar: fila.fideEstandar, fideId: fila.fideId };
}

async function enTandas<T, R>(items: T[], tamano: number, hacer: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = [];
  for (let i = 0; i < items.length; i += tamano) {
    salida.push(...await Promise.all(items.slice(i, i + tamano).map(hacer)));
  }
  return salida;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Cuerpo JSON inválido" }, 400); }

  const nombres = Array.isArray(body.nombres)
    ? body.nombres.filter((n): n is string => typeof n === "string").map((n) => n.trim()).filter((n) => n.length >= 2 && n.length <= 80)
    : [];
  if (nombres.length < 1) return json({ ok: false, error: "Manda al menos un nombre." }, 400);
  if (nombres.length > MAX_JUGADORES) {
    return json({ ok: false, error: `No se pueden buscar más de ${MAX_JUGADORES} jugadores de una vez.` }, 400);
  }

  const { data: freno, error: frenoError } = await admin.rpc("pareo_elo_frenar", { p_ip: ipDe(req) });
  if (frenoError) return json({ ok: false, error: "No se pudo buscar el Elo Nacional. Intenta de nuevo." }, 502);
  if (freno) return json({ ok: false, error: freno }, 429);

  const resultados = await enTandas(nombres, CONCURRENCIA, buscarUno);
  return json({ ok: true, resultados });
});
