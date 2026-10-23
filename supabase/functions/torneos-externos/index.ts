// Edge Function: torneos-externos (verify_jwt en false)
//
// Lee los torneos próximos de Costa Rica que se anuncian en
// ajedrezcostarica.com (la portada /es/tournaments y la ficha de cada uno) y
// los guarda en public.torneos_externos, para que «Torneos en Pareo Integral»
// y su calendario muestren todo lo que viene. Lo pidió el dueño del sitio.
//
// La dispara pg_cron una vez al día (torneos-externos →
// public.disparar_torneos_externos). Va con verify_jwt en FALSE porque la
// base no trae sesión de persona; a cambio exige el secreto
// `torneos_externos_secreto` de la bóveda, que vuelve a leer con la service
// role (public.secreto_torneos_externos), como arbitros-avisos.
//
// Lee con calma: una ficha a la vez, con medio segundo entre una y otra, y
// como mucho 40. Si la portada no contesta o cambió de forma (ninguna
// tarjeta), no toca nada: mejor la lista de ayer que una vacía. Lo que ya
// terminó hace más de un día se borra. El lector está en leer.ts (lo prueba
// herramientas/verificar-torneos-externos.js con Node).
//
// Ver «Torneos en Pareo Integral: los torneos de ajedrezcostarica.com» en
// docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { leerLista, leerTorneo } from "./leer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGEN = "https://ajedrezcostarica.com";
const AGENTE = "Mozilla/5.0 (compatible; AjedrezIntegral/1.0; +https://ajedrez-integral.com)";
const MAXIMO = 40;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bajar(ruta: string): Promise<string | null> {
  try {
    const res = await fetch(ORIGEN + ruta, { headers: { "User-Agent": AGENTE, Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: esperado } = await admin.rpc("secreto_torneos_externos");
  if (!esperado || !jwt || jwt !== esperado) return json({ error: "Esto lo dispara solo la base" }, 401);

  const portada = await bajar("/es/tournaments");
  const tarjetas = portada ? leerLista(portada).slice(0, MAXIMO) : [];
  if (!tarjetas.length) return json({ ok: false, error: "La portada no contestó o no trajo torneos: no se tocó nada." }, 502);

  const ahora = new Date().toISOString();
  const filas = [];
  for (const c of tarjetas) {
    const html = await bajar("/es/tournaments/" + c.id);
    const t = html ? leerTorneo(html, c.id) : null;
    if (t) {
      filas.push({
        fuente: "ajedrezcostarica", id_externo: t.id, titulo: t.titulo,
        // La tarjeta de la portada dice de qué día a qué día; si no, el horario de la ficha.
        inicio: c.inicio ?? t.inicio, fin: c.fin ?? t.fin,
        provincia: t.provincia, lugar: t.lugar, ritmo: t.ritmo, minutos: t.minutos, incremento: t.incremento,
        elo: t.elo, precio: t.precio, moneda: t.moneda, modalidad: t.modalidad, formato: t.formato,
        organizador: t.organizador, inscripcion_abierta: t.inscripcionAbierta, chess_results: t.chessResults,
        url: ORIGEN + "/es/tournaments/" + t.id, visto: ahora,
      });
    }
    await dormir(500);
  }
  if (filas.length) {
    const { error } = await admin.from("torneos_externos").upsert(filas, { onConflict: "fuente,id_externo" });
    if (error) return json({ ok: false, error: error.message }, 500);
  }
  // Lo que terminó hace más de un día ya no es «próximo»; lo que hace una
  // semana no sale en la portada de allá, se canceló o se quitó.
  const ayer = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const semana = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  await admin.from("torneos_externos").delete().lt("fin", ayer);
  await admin.from("torneos_externos").delete().is("fin", null).lt("inicio", ayer);
  await admin.from("torneos_externos").delete().lt("visto", semana);
  return json({ ok: true, tarjetas: tarjetas.length, guardados: filas.length });
});
