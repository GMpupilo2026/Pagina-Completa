/* El control de tiempos que sale de la transmisión de Lichess (Centroamericano 2026).

   En las mesas que se transmiten (tableros electrónicos con reloj DGT), Lichess sabe la posición y lo que marca
   cada reloj después de cada jugada. La transmisión va con ATRASO a propósito (15 minutos, por juego limpio:
   nadie de afuera puede ayudar con la partida en vivo), y eso no estorba para el reloj que se apaga: un control
   de hace 15 minutos sigue siendo un control. Lo que importa es saber A QUÉ HORA de verdad marcaban eso los
   relojes, y eso sale de la misma transmisión:

     - la ronda dice su atraso (`round.delay`, en segundos: 900);
     - cada partida en curso dice cuánto lleva pensando quien tiene el turno (`thinkTime`);
     - y, si se sabe a qué hora empezó la ronda, los mismos relojes dicen cuánto tiempo jugaron los dos: con
       90 min + 30 s, lo gastado por los dos juntos es justo el tiempo que pasó desde el inicio.

   No está escrito en ningún lado si `thinkTime` ya incluye el atraso o no, así que se calculan las dos horas
   posibles y, con la hora de inicio, se elige la que cuadra con los relojes (y se avisa si ninguna cuadra). Sin
   hora de inicio se toma la de «atraso + lo que lleva pensando», avisado.

   Nada de esto escribe en la base: es una lectura más para la calculadora del reloj apagado
   (js/centroamericano-reloj-apagado.js), que el árbitro puede usar o no. Las cuentas son puras (se prueban en
   Node, herramientas/verificar-centroamericano-transmision-reloj.js); `buscar()` es lo único que habla con
   Lichess, desde el navegador (lichess.org ya está en el connect-src de _headers).

     CentroamericanoTransmisionReloj.mismoJugador(a, b)          → true si los dos nombres son de la misma persona
     CentroamericanoTransmisionReloj.jugadasDeFen(fen)           → { j_blancas, j_negras, turno }
     CentroamericanoTransmisionReloj.controlDe(partida, opciones)→ la lectura (con la forma de un control) o { error }
     CentroamericanoTransmisionReloj.buscar({ blancas, negras, ronda, inicio }) → Promise de lo mismo, o { error }
     CentroamericanoTransmisionReloj.buscarPartida({ blancas, negras, ronda, torneo }) → la partida en la transmisión, o { error }
     CentroamericanoTransmisionReloj.rondaTransmitida({ torneo, ronda }) → { idRonda, url, pgn, partidas } o null
     CentroamericanoTransmisionReloj.torneoDeCategoria(lista, nombre)     → el torneo de Lichess de esa categoría

   Ver «El control de tiempos desde la transmisión» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;
  const RITMO = { inicial: 90 * 60, incremento: 30 };
  const CUADRA_S = 180;          // la hora elegida y la que dicen los relojes desde el inicio: más de 3 min, se avisa
  const ATRASO_DEFECTO = 900;    // si la ronda no dice su atraso: el de la sala del Centroamericano

  // «Pérez Mora, María José» y «PEREZ MORA Maria Jose» son la misma persona: sin tildes, sin mayúsculas, sin comas.
  const palabras = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-zñ0-9\s]/g, " ").split(/\s+/).filter((x) => x.length > 1);

  // Dos nombres son de la misma persona si comparten al menos dos palabras (un apellido y un nombre, o los dos
  // apellidos), o una sola cuando uno de los dos tiene una sola palabra. Chess-results y Lichess escriben distinto
  // (a veces sin el segundo apellido o sin el segundo nombre); con dos palabras en común no se confunden dos
  // jugadores de la misma mesa.
  function mismoJugador(a, b) {
    const pa = new Set(palabras(a)), pb = palabras(b);
    if (!pa.size || !pb.length) return false;
    const comunes = pb.filter((x) => pa.has(x)).length;
    return comunes >= 2 || (comunes >= 1 && Math.min(pa.size, pb.length) === 1);
  }

  // Las jugadas que lleva cada color, de la FEN: «… w … 23» = las blancas van a hacer su jugada 23 (llevan 22, y
  // las negras 22); «… b … 23» = las blancas ya hicieron la 23 y las negras llevan 22.
  function jugadasDeFen(fen) {
    const p = String(fen || "").trim().split(/\s+/);
    const lado = p[1], n = Number(p[5]);
    if ((lado !== "w" && lado !== "b") || !Number.isInteger(n) || n < 1) return null;
    return lado === "w" ? { j_blancas: n - 1, j_negras: n - 1, turno: "blancas" } : { j_blancas: n, j_negras: n - 1, turno: "negras" };
  }

  // La partida de la transmisión (el JSON de /api/broadcast/-/-/<ronda>: fen, players[].clock en centésimas,
  // thinkTime en segundos, status) convertida en una lectura con la forma de un control de tiempos:
  // { ocurrio, t_blancas, t_negras, j_blancas, j_negras, turno, origen: "transmision", atraso, avisos: [...] }.
  //   ahora    ms de ahora
  //   atraso   segundos de atraso de la ronda (round.delay)
  //   inicio   ms de la hora en que empezó la ronda, o null
  //   bonos    los ajustes del reloj de la bitácora de la mesa (bonosIlegales): solo para comprobar con el inicio
  function controlDe(g, { ahora, atraso, inicio = null, bonos = [], ritmo = RITMO } = {}) {
    if (!g) return { error: "Esta mesa no está en la transmisión." };
    if (g.status && g.status !== "*") return { error: "En la transmisión esta partida ya terminó (" + g.status + ")." };
    const j = jugadasDeFen(g.fen);
    if (!j) return { error: "La transmisión no trae la posición de esta partida." };
    if (j.j_blancas + j.j_negras === 0) return { error: "En la transmisión todavía no se ha hecho ninguna jugada: no hay de dónde leer los relojes." };
    const pl = g.players || [];
    const cent = (x) => (typeof x === "number" && x >= 0 ? Math.round(x / 100) : null);
    const tB = cent(pl[0] && pl[0].clock), tN = cent(pl[1] && pl[1].clock);
    if (tB === null || tN === null) return { error: "Esta mesa se transmite sin el reloj (no tiene reloj electrónico conectado)." };
    const at = Number.isFinite(atraso) && atraso >= 0 ? atraso : ATRASO_DEFECTO;
    const piensa = typeof g.thinkTime === "number" && g.thinkTime >= 0 ? g.thinkTime : null;
    const avisos = [];
    // Las dos horas posibles de la última jugada que se ve: si `thinkTime` cuenta desde lo que se ve (con el atraso)
    // o desde ahora.
    const candidatas = piensa === null ? [ahora - at * 1000] : [ahora - (at + piensa) * 1000, ahora - piensa * 1000];
    if (piensa === null) avisos.push("La transmisión no dice cuánto lleva pensando quien tiene el turno: la hora del control es aproximada (puede ser algo más temprano).");
    // Lo que dicen los relojes: entre los dos gastaron justo el tiempo que pasó desde el inicio (sin los ajustes del
    // árbitro, que se suman a los relojes).
    let ms = candidatas[0], desdeInicio = null;
    if (inicio != null) {
      const ajustes = bonos.reduce((a, b) => a + (b.segundos == null ? 120 : b.segundos), 0);
      const gastado = 2 * ritmo.inicial + ritmo.incremento * (j.j_blancas + j.j_negras) + ajustes - tB - tN;
      desdeInicio = inicio + gastado * 1000;
      ms = candidatas.slice().sort((a, b) => Math.abs(a - desdeInicio) - Math.abs(b - desdeInicio))[0];
      const dif = Math.round((ms - desdeInicio) / 1000);
      if (Math.abs(dif) > CUADRA_S) avisos.push("La hora de la transmisión no cuadra con la hora de inicio de la ronda por " + Math.round(Math.abs(dif) / 60) + " min: ¿empezó a otra hora, hubo una pausa o el reloj electrónico se puso mal? Úsalo con cuidado.");
    }
    else if (piensa !== null) avisos.push("No se sabe a qué hora empezó la ronda: la hora del control no se pudo comprobar con los relojes.");
    if (ms > ahora) ms = ahora;
    return { ocurrio: new Date(ms).toISOString(), t_blancas: tB, t_negras: tN, j_blancas: j.j_blancas, j_negras: j.j_negras, turno: j.turno,
      origen: "transmision", atraso: at, avisos, desdeInicio: desdeInicio == null ? null : new Date(desdeInicio).toISOString() };
  }

  // ---- en el navegador: buscar la mesa en la transmisión de la sala

  const LICHESS = "https://lichess.org";
  const SALA = "centroamericano-2026";
  const TORNEOS_MS = 10 * 60 * 1000, RONDA_MS = 30 * 1000;
  let torneos = null, torneosLeidos = 0;
  const rondasDe = new Map();   // id del torneo → { leido, lista }
  const partidasDe = new Map(); // id de la ronda → { leido, datos }

  async function pedir(ruta) {
    const res = await fetch(LICHESS + ruta, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 429 ? "Lichess pide esperar un momento (muchas consultas seguidas): vuelve a intentarlo en un minuto." : "Lichess respondió " + res.status + ".");
    return res.json();
  }

  async function torneosDeLaSala() {
    if (torneos && Date.now() - torneosLeidos < TORNEOS_MS) return torneos;
    const L = raiz.LichessTransmision, C = raiz.CentroamericanoMesas;
    const { data, error } = await raiz.sb.from("salas_torneo").select("enlaces").eq("clave", SALA).maybeSingle();
    if (error) throw new Error("No se pudo leer qué se transmite: " + error.message);
    const enlaces = (data && Array.isArray(data.enlaces) ? data.enlaces : []).map((e) => L.idDeEnlace(e && e.url)).filter(Boolean);
    const vistos = new Map();
    for (const e of enlaces) {
      const ev = await L.torneosDelEvento(e);
      // Solo las partidas clásicas: el Rápido y el Blitz no tienen control de tiempos.
      for (const t of ev.torneos) if (!vistos.has(t.id) && !(C && C.ritmoRapido(t.nombre))) vistos.set(t.id, t);
    }
    torneos = [...vistos.values()];
    torneosLeidos = Date.now();
    return torneos;
  }

  async function rondaDelTorneo(id, numero) {
    let r = rondasDe.get(id);
    if (!r || Date.now() - r.leido > TORNEOS_MS) { r = { leido: Date.now(), lista: await raiz.LichessTransmision.rondas(id) }; rondasDe.set(id, r); }
    return r.lista.rondas.find((x) => x.numero === Number(numero)) || null;
  }

  async function partidasDeLaRonda(idRonda) {
    let p = partidasDe.get(idRonda);
    if (!p || Date.now() - p.leido > RONDA_MS) { p = { leido: Date.now(), datos: await pedir("/api/broadcast/-/-/" + idRonda) }; partidasDe.set(idRonda, p); }
    return p.datos;
  }

  // El torneo de Lichess de una categoría de chess-results: «Sub-18 Absoluto» es «… Open U18» y «Sub-8 Femenino»,
  // «… Girls U08». Con el torneo se busca en UNO, no en los doce: buscar en todos pedía dos consultas por categoría
  // y por foto, y con la tabla de «Planillas y Drive» entera Lichess frenaba («espera un momento») y la fila quedaba
  // en «No se pudo ver la transmisión». Sin categoría reconocible, se busca en todos, como antes.
  function torneoDeCategoria(lista, nombre) {
    const m = String(nombre || "").match(/sub[\s-]*(\d{1,2})\s+(absolut[oa]|femenin[oa])/i);
    if (!m) return lista;
    const quiere = (/^f/i.test(m[2]) ? "girls" : "open") + " u" + String(m[1]).padStart(2, "0");
    const uno = lista.filter((t) => String(t.nombre || "").toLowerCase().trim().endsWith(quiere));
    return uno.length ? uno : lista;
  }

  // La ronda transmitida de una categoría: { idRonda, url, pgn, partidas } (pgn: el enlace directo al PGN de todas
  // sus partidas en Lichess, para recolectarlas), o null si esa categoría o esa ronda no se transmite.
  async function rondaTransmitida({ torneo, ronda }) {
    if (!raiz.sb || !raiz.LichessTransmision) return null;
    const todos = await torneosDeLaSala();
    const lista = torneoDeCategoria(todos, torneo);
    if (lista === todos) return null;   // la categoría no se reconoce: no se adivina cuál es
    const r = await rondaDelTorneo(lista[0].id, ronda);
    if (!r) return null;
    const d = await partidasDeLaRonda(r.id);
    const n = (d.games || []).length;
    return n ? { idRonda: r.id, url: r.url || LICHESS + "/broadcast/-/-/" + r.id, pgn: LICHESS + "/api/broadcast/round/" + r.id + ".pgn", partidas: n } : null;
  }

  // La partida de ESA mesa (por los dos nombres, con los colores como en chess-results) en la ronda `ronda` de
  // los torneos clásicos que se transmiten (si se dice `torneo`, solo en el de su categoría):
  // { g, datos, torneo, idRonda, url } o { error }.
  // La usan buscar() (el reloj) y «Generar PGN» de la organización (js/centroamericano-leer-partida.js).
  async function buscarPartida({ blancas, negras, ronda, torneo }) {
    try {
      if (!raiz.sb || !raiz.LichessTransmision) return { error: "Esta página no puede leer la transmisión." };
      const todos = await torneosDeLaSala();
      if (!todos.length) return { error: "La sala del Centroamericano no tiene ninguna transmisión de Lichess.", noSeTransmite: true };
      const lista = torneoDeCategoria(todos, torneo);
      let alReves = false;
      for (const t of lista) {
        const r = await rondaDelTorneo(t.id, ronda);
        if (!r) continue;
        const d = await partidasDeLaRonda(r.id);
        for (const g of d.games || []) {
          const pl = g.players || [];
          const w = pl[0] && pl[0].name, b = pl[1] && pl[1].name;
          if (mismoJugador(blancas, w) && mismoJugador(negras, b)) return { g, datos: d, torneo: t.nombre, idRonda: r.id, url: (r.url || LICHESS + "/broadcast/-/-/" + r.id) + (g.id ? "/" + g.id : "") };
          if (mismoJugador(blancas, b) && mismoJugador(negras, w)) alReves = true;
        }
      }
      return alReves
        ? { error: "En la transmisión esta partida sale con los colores al revés: no se usa (revísalo con la organización).", alReves: true }
        : { error: "Esta mesa no se transmite (solo se transmiten las primeras mesas de cada categoría).", noSeTransmite: true };
    } catch (e) {
      return { error: "No se pudo leer la transmisión de Lichess: " + (e && e.message ? e.message : e) };
    }
  }

  async function buscar({ blancas, negras, ronda, inicio = null, bonos = [] }) {
    const h = await buscarPartida({ blancas, negras, ronda });
    if (h.error) return { error: h.error };
    const c = controlDe(h.g, { ahora: Date.now(), atraso: h.datos.round && h.datos.round.delay, inicio, bonos });
    return Object.assign(c, { torneo: h.torneo, url: h.url });
  }

  const api = { RITMO, CUADRA_S, mismoJugador, jugadasDeFen, controlDe, buscar, buscarPartida, rondaTransmitida, torneoDeCategoria };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoTransmisionReloj = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
