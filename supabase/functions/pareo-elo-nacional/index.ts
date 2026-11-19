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
// NUNCA SE INVENTA UN NÚMERO NI SE ADIVINA UN HOMÓNIMO: solo un nombre igual
// (las mismas palabras) se da por «encontrado». Un nombre que solo se parece
// (le falta el segundo apellido, por ejemplo) vuelve como «parecido» o
// «ambiguo», con los candidatos, y quien organiza elige (emparejar.ts).
//
// Reusa el mismo lector de ajedrezcostarica.com que ya prueba
// herramientas/verificar-elo-fide.js (`_compartido/ajedrezcostarica.ts`,
// copiado acá por herramientas/funciones-armar.js al desplegar).
//
// Ver «Pareo Integral: institución, listas y Elo Nacional» en
// docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { busquedasPorNombre, leerListaNacional, type FilaNacional } from "./ajedrezcostarica.ts";
import { emparejar, type Candidato, type Estado } from "./emparejar.ts";

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

type Resultado = {
  nombre: string; estado: Estado; nacional: number | null; fideEstandar: number | null; fideId: string | null;
  candidatos: Candidato[]; totalCandidatos: number;
};

// Primero el nombre tal como está escrito, con todas sus palabras: el buscador
// de ajedrezcostarica.com trae a quien tenga TODAS, en cualquier orden, así
// que esa búsqueda ya incluye a cualquier candidato. Solo si no trae a nadie
// se prueba con los apellidos y el primer apellido (busquedasPorNombre). Antes
// se empezaba por los apellidos: con «Rodriguez, Jose», la búsqueda
// «Rodriguez» trae 372 y la página muestra solo los 50 de más Elo, así que un
// alumno nunca salía.
function busquedas(nombre: string): string[] {
  const completo = nombre.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return [...new Set([completo, ...busquedasPorNombre(nombre)].filter((x) => x.length >= 3))];
}

async function buscarUno(nombreOriginal: string): Promise<Resultado> {
  const filas: FilaNacional[] = [];
  let r = emparejar(nombreOriginal, filas);
  for (const q of busquedas(nombreOriginal)) {
    const html = await traer(`${NACIONAL}?name=${encodeURIComponent(q)}`);
    if (!html) continue;
    filas.push(...leerListaNacional(html));
    r = emparejar(nombreOriginal, filas);
    if (r.estado !== "no_encontrado") break;   // ya hay a quién mostrar; no hace falta la siguiente
  }
  const f = r.fila;
  return {
    nombre: nombreOriginal, estado: r.estado,
    nacional: f ? f.nacional : null, fideEstandar: f ? f.fideEstandar : null, fideId: f ? f.fideId : null,
    candidatos: r.candidatos, totalCandidatos: r.totalCandidatos,
  };
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
