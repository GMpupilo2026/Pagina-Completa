// Edge Function: torneos-externos (verify_jwt en false)
//
// Lee los torneos próximos de Costa Rica que se anuncian en
// ajedrezcostarica.com (la portada /es/tournaments y la ficha de cada uno) y
// los que ya están cargados en chess-results (su buscador, con Costa Rica y
// los tocados más recientemente), y los guarda en public.torneos_externos,
// para que «Torneos en Pareo Integral» y su calendario muestren todo lo que
// viene. Lo pidió el dueño del sitio.
//
// La dispara pg_cron una vez al día (torneos-externos →
// public.disparar_torneos_externos). Va con verify_jwt en FALSE porque la
// base no trae sesión de persona; a cambio exige el secreto
// `torneos_externos_secreto` de la bóveda, que vuelve a leer con la service
// role (public.secreto_torneos_externos), como arbitros-avisos.
//
// Lee con calma: una ficha a la vez, con medio segundo entre una y otra, y
// como mucho 40. Cada fuente va por su lado: si una no contesta o cambió de
// forma, sus filas se quedan como estaban (mejor la lista de ayer que una
// vacía) y la otra se pone al día igual. Lo que ya terminó hace más de un día
// se borra. Los lectores están en leer.ts y chessresults.ts (los prueba
// herramientas/verificar-torneos-externos.js con Node).
//
// De chess-results se guardan solo los que empiezan de hoy en adelante, y de
// cada uno solo lo que el buscador ya muestra (nombre, día, lugar, quién
// organiza, rondas e inscritos). El buscador corta el nombre a 50 letras: de
// esos, se lee el completo en la página del torneo (como mucho 20).
//
// Ver «Torneos en Pareo Integral: los torneos de ajedrezcostarica.com» y
// «…los torneos de chess-results» en docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { leerLista, leerTorneo } from "./leer.ts";
import { camposOcultos, cortado, formularioBusqueda, leerBusqueda, leerTitulo, ritmoDelTitulo, urlTorneo } from "./chessresults.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGEN = "https://ajedrezcostarica.com";
const AGENTE = "Mozilla/5.0 (compatible; AjedrezIntegral/1.0; +https://ajedrez-integral.com)";
const MAXIMO = 40;
const BUSCADOR_CR = "https://chess-results.com/TurnierSuche.aspx?lan=2";
// chess-results trata distinto a lo que no parece un navegador.
const AGENTE_CR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAXIMO_TITULOS = 20;

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

// ---- ajedrezcostarica.com ----
async function deAjedrezCostaRica(ahora: string) {
  const portada = await bajar("/es/tournaments");
  const tarjetas = portada ? leerLista(portada).slice(0, MAXIMO) : [];
  if (!tarjetas.length) return { ok: false, error: "La portada no contestó o no trajo torneos: no se tocó nada." };
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
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, tarjetas: tarjetas.length, guardados: filas.length };
}

// ---- chess-results ----
// El buscador es un formulario ASP.NET: se pide, se le devuelven sus campos
// ocultos con la búsqueda y se manda al MISMO servidor que lo dio (s1, s2…),
// con sus cookies. Las redirecciones se siguen a mano para no perder ninguna.
function clienteCR() {
  const galletas = new Map<string, string>();
  async function pedir(url: string, cuerpo?: Record<string, string>): Promise<{ url: string; texto: string } | null> {
    let actual = url;
    let datos = cuerpo;
    for (let salto = 0; salto < 5; salto += 1) {
      const headers: Record<string, string> = { "User-Agent": AGENTE_CR, Accept: "text/html" };
      if (galletas.size) headers.Cookie = [...galletas].map(([k, v]) => k + "=" + v).join("; ");
      if (datos) headers["Content-Type"] = "application/x-www-form-urlencoded";
      let res: Response;
      try {
        res = await fetch(actual, { method: datos ? "POST" : "GET", headers, body: datos ? new URLSearchParams(datos).toString() : undefined, redirect: "manual", signal: AbortSignal.timeout(30000) });
      } catch {
        return null;
      }
      for (const c of res.headers.getSetCookie()) {
        const m = /^([^=;\s]+)=([^;]*)/.exec(c);
        if (m) galletas.set(m[1], m[2]);
      }
      const destino = res.headers.get("Location");
      if (res.status >= 300 && res.status < 400 && destino) {
        await res.body?.cancel();
        actual = new URL(destino, actual).toString();
        datos = undefined;
        continue;
      }
      if (!res.ok) return null;
      return { url: actual, texto: await res.text() };
    }
    return null;
  }
  return pedir;
}

async function deChessResults(ahora: string) {
  const pedir = clienteCR();
  const form = await pedir(BUSCADOR_CR);
  const ocultos = form ? camposOcultos(form.texto) : {};
  if (!form || !ocultos.__VIEWSTATE) return { ok: false, error: "El buscador de chess-results no trajo su formulario: no se tocó nada." };
  const res = await pedir(form.url, formularioBusqueda(ocultos));
  const filas = res ? leerBusqueda(res.texto) : null;
  if (!filas || !filas.length) return { ok: false, error: "El buscador de chess-results no devolvió la tabla de siempre: no se tocó nada." };
  const servidor = new URL(form.url).origin;
  // Solo lo que empieza de hoy en adelante (el día en Costa Rica).
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
  const proximos = filas.filter((f) => f.inicio >= hoy);
  let leidos = 0;
  const guardar = [];
  for (const f of proximos) {
    let titulo = f.titulo;
    if (cortado(titulo) && leidos < MAXIMO_TITULOS) {
      leidos += 1;
      const p = await pedir(servidor + "/tnr" + f.id + ".aspx?lan=2");
      const completo = p ? leerTitulo(p.texto) : "";
      if (completo) titulo = completo;
      await dormir(500);
    }
    guardar.push({
      fuente: "chess-results", id_externo: f.id, titulo,
      // Solo el día: la medianoche de Costa Rica (06:00 UTC), y sin final.
      inicio: f.inicio + "T06:00:00Z", fin: null,
      lugar: f.lugar, ritmo: ritmoDelTitulo(titulo), organizador: f.organizador,
      rondas: f.rondas || null, jugadores: f.jugadores || null,
      url: urlTorneo(f.id), visto: ahora,
    });
  }
  if (guardar.length) {
    const { error } = await admin.from("torneos_externos").upsert(guardar, { onConflict: "fuente,id_externo" });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, buscados: filas.length, guardados: guardar.length, titulos: leidos };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: esperado } = await admin.rpc("secreto_torneos_externos");
  if (!esperado || !jwt || jwt !== esperado) return json({ error: "Esto lo dispara solo la base" }, 401);

  const ahora = new Date().toISOString();
  const acr = await deAjedrezCostaRica(ahora);
  const cr = await deChessResults(ahora);
  // Lo que terminó hace más de un día ya no es «próximo»; lo que hace una
  // semana no sale en la portada de allá, se canceló o se quitó. Lo de una
  // fuente que hoy no contestó no se borra por viejo: se queda hasta mañana.
  const ayer = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const semana = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  await admin.from("torneos_externos").delete().lt("fin", ayer);
  await admin.from("torneos_externos").delete().is("fin", null).lt("inicio", ayer);
  for (const [fuente, r] of [["ajedrezcostarica", acr], ["chess-results", cr]] as const) {
    if (r.ok) await admin.from("torneos_externos").delete().eq("fuente", fuente).lt("visto", semana);
  }
  return json({ ok: acr.ok || cr.ok, ajedrezcostarica: acr, chessResults: cr }, acr.ok || cr.ok ? 200 : 502);
});
