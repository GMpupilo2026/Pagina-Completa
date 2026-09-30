// Edge Function: elo-fide
//
// Lee el Elo oficial de una persona a partir de su código FIDE y lo guarda en
// `elo_historial`, una fila por mes:
//   - FIDE Estándar, de su ficha pública en ratings.fide.com;
//   - Nacional de Costa Rica, de la clasificación de ajedrezcostarica.com.
// Con dos meses guardados, el informe a la casa dice si subió o bajó. Ver
// «El Elo oficial, mes a mes» en docs/decisiones/informes.md.
//
// Dos acciones:
//   "actualizar" { student_id } -> lo lee ya (la llama Configuración al guardar
//                                  el código). Con el JWT de quien llama.
//   "tanda"      {}             -> la dispara pg_cron cada día y lee a quien le
//                                  toque: sin lectura este mes, o con la última
//                                  de hace más de una semana.
//
// QUIÉN PUEDE QUÉ. "actualizar" pregunta puedo_cambiar_fide_id() con el JWT de
// quien llama (la propia persona, uno de sus profesores o administración); el
// permiso vive en la base, no se reescribe aquí. "tanda" va con verify_jwt en
// false porque el disparador no trae sesión de persona: a cambio exige el
// secreto `tanda_elo_secreto` de la bóveda, que esta función vuelve a leer con
// la service role para compararlo.
//
// NUNCA SE INVENTA UN NÚMERO. Si una página no contesta o cambió su HTML, ese
// Elo queda en null en la fila del mes (y el informe no dice nada de él). Si
// NINGUNO de los dos se pudo leer, no se escribe nada y la próxima tanda lo
// vuelve a intentar.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  busquedasPorNombre, leerFichaFide, leerListaNacional, periodoCostaRica,
  type FichaFide, type FilaNacional,
} from "./leer-elo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const FIDE = "https://ratings.fide.com/profile/";
const NACIONAL = "https://ajedrezcostarica.com/es/national-rating";
const MAX_POR_TANDA = 60;          // techo de cordura por corrida
const TIEMPO_TANDA_MS = 100_000;   // y de tiempo: la función tiene ~150 s
const CADA_DIAS = 7;               // una lectura por semana basta: las listas son mensuales
const PAGINAS_NACIONAL = 4;        // un apellido común no llena más de 200 filas

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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function traer(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AjedrezIntegral/1.0 (+https://ajedrez-integral.com)", "Accept": "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fichaFide(fideId: string): Promise<FichaFide | null> {
  const html = await traer(FIDE + encodeURIComponent(fideId));
  return html ? leerFichaFide(html) : null;
}

/* La lista nacional no se deja buscar por código FIDE, solo por nombre: se
   busca por los apellidos y se elige la fila con ESE código. Sin nombre (la
   ficha FIDE no contestó y nunca se leyó antes) se prueba con el nombre de la
   cuenta. */
async function filaNacional(fideId: string, nombres: Array<string | null | undefined>): Promise<FilaNacional | null> {
  const probadas = new Set<string>();
  for (const nombre of nombres) {
    for (const q of busquedasPorNombre(nombre)) {
      if (probadas.has(q)) continue;
      probadas.add(q);
      for (let pagina = 1; pagina <= PAGINAS_NACIONAL; pagina++) {
        const html = await traer(`${NACIONAL}?name=${encodeURIComponent(q)}${pagina > 1 ? `&page=${pagina}` : ""}`);
        if (!html) return null;   // la página no contesta: no sirve seguir probando
        const filas = leerListaNacional(html);
        const fila = filas.find((f) => f.fideId === fideId);
        if (fila) return fila;
        if (filas.length < 50) break;   // era la última página de esa búsqueda
      }
    }
  }
  return null;
}

type Resultado = { ok: boolean; periodo?: string; fide?: number | null; nacional?: number | null; nombre?: string | null; error?: string };

async function leerYGuardar(studentId: string, fideId: string, nombreCuenta: string | null): Promise<Resultado> {
  const { data: previo } = await admin.from("elo_historial")
    .select("nombre").eq("student_id", studentId).not("nombre", "is", null)
    .order("periodo", { ascending: false }).limit(1).maybeSingle();

  const ficha = await fichaFide(fideId);
  const nacional = await filaNacional(fideId, [ficha?.nombre, previo?.nombre, nombreCuenta]);

  // Si la ficha de la FIDE no contestó, la lista nacional trae también el
  // Estándar (copiado de la FIDE): mejor ese que ninguno.
  const fide = ficha ? ficha.estandar : (nacional?.fideEstandar ?? null);
  const nac = nacional?.nacional ?? null;
  const nombre = ficha?.nombre ?? nacional?.nombre ?? previo?.nombre ?? null;
  if (!ficha && !nacional) {
    return { ok: false, error: "No se pudo leer el Elo: ni la FIDE ni la lista nacional encontraron ese código" };
  }

  const periodo = periodoCostaRica(new Date());
  const { error } = await admin.from("elo_historial").upsert({
    student_id: studentId, periodo, fide_estandar: fide, nacional: nac, fide_id: fideId, nombre,
    leido_at: new Date().toISOString(),
  }, { onConflict: "student_id,periodo" });
  if (error) return { ok: false, error: error.message };

  /* El Elo que usa el diagnóstico de nivel (profiles.elo) pasa a ser el
     oficial: el FIDE si lo tiene (se le cree ± 100), si no el nacional
     (± 150). Uno declarado a mano o «en línea» es menos preciso que estos. */
  const elo = fide ?? nac;
  if (elo) {
    await admin.from("profiles").update({
      elo, elo_tipo: fide ? "fide" : "nacional", elo_actualizado: new Date().toISOString(),
    }).eq("id", studentId).eq("fide_id", fideId);
  }
  return { ok: true, periodo, fide, nacional: nac, nombre };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const accion = body.action;

  // ------------------------------------------------------------- la tanda
  if (accion === "tanda") {
    const { data: esperado } = await admin.rpc("secreto_tanda_elo");
    if (!esperado || !jwt || jwt !== esperado) {
      return json({ error: "Esta acción solo la dispara el programador de tareas" }, 401);
    }
    const inicio = Date.now();
    const periodo = periodoCostaRica(new Date());
    const hace = Date.now() - CADA_DIAS * 86400000;

    const { data: personas, error } = await admin.from("profiles")
      .select("id, fide_id, full_name").not("fide_id", "is", null).limit(1000);
    if (error) return json({ error: error.message }, 500);
    const ids = (personas ?? []).map((p) => p.id);
    const { data: lecturas } = ids.length
      ? await admin.from("elo_historial").select("student_id, periodo, leido_at")
          .in("student_id", ids).eq("periodo", periodo)
      : { data: [] };
    const leidoEsteMes = new Map((lecturas ?? []).map((l) => [l.student_id, new Date(l.leido_at).getTime()]));

    // Primero quien no tiene lectura este mes; después la más vieja.
    const toca = (personas ?? [])
      .filter((p) => (leidoEsteMes.get(p.id) ?? 0) < hace)
      .sort((a, b) => (leidoEsteMes.get(a.id) ?? 0) - (leidoEsteMes.get(b.id) ?? 0))
      .slice(0, MAX_POR_TANDA);

    let leidos = 0, pendientes = 0;
    const fallos: string[] = [];
    for (const p of toca) {
      if (Date.now() - inicio > TIEMPO_TANDA_MS) { pendientes += 1; continue; }
      const r = await leerYGuardar(p.id, p.fide_id, p.full_name);
      if (r.ok) leidos += 1; else fallos.push(`${p.fide_id}: ${r.error}`);
    }
    return json({ ok: true, leidos, pendientes, fallos });
  }

  // ------------------------------------------- lo que pide una persona
  if (accion === "actualizar") {
    if (!jwt) return json({ error: "Falta token de autorización" }, 401);
    const studentId = typeof body.student_id === "string" ? body.student_id : "";
    if (!studentId) return json({ error: "student_id es requerido" }, 400);

    // Con el JWT de quien llama: el permiso lo contesta la base (y de paso
    // pasa por la verificación en dos pasos de antes_de_cada_pedido()).
    const comoQuienLlama = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: puede, error: errPuede } = await comoQuienLlama.rpc("puedo_cambiar_fide_id", { p_persona: studentId });
    if (errPuede) return json({ error: errPuede.message }, 401);
    if (!puede) return json({ error: "Solo la propia persona, uno de sus profesores o administración" }, 403);

    const { data: persona } = await admin.from("profiles")
      .select("fide_id, full_name").eq("id", studentId).maybeSingle();
    if (!persona?.fide_id) return json({ error: "Esa cuenta todavía no tiene código FIDE" }, 400);

    // Un botón apretado dos veces seguidas no vuelve a leer las dos páginas.
    const { data: reciente } = await admin.from("elo_historial")
      .select("periodo, fide_estandar, nacional, nombre, leido_at")
      .eq("student_id", studentId).eq("periodo", periodoCostaRica(new Date()))
      .gte("leido_at", new Date(Date.now() - 2 * 60000).toISOString()).maybeSingle();
    if (reciente) {
      return json({ ok: true, periodo: reciente.periodo, fide: reciente.fide_estandar, nacional: reciente.nacional, nombre: reciente.nombre });
    }

    const r = await leerYGuardar(studentId, persona.fide_id, persona.full_name);
    return r.ok ? json(r) : json({ error: r.error }, 502);
  }

  return json({ error: "Acción desconocida" }, 400);
});
