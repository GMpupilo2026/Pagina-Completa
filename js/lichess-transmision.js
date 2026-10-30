/* Lo que se lee de una transmisión de Lichess («broadcast») para mostrar sus
 * partidas dentro de una página del sitio (la del Centroamericano 2026, por
 * js/centroamericano-partidas.js). Sin nada de la pantalla: se prueba con node
 * en herramientas/verificar-centroamericano-partidas.js.
 *
 * Todo sale de la API pública de Lichess, sin cuenta y desde el navegador
 * (contesta con «Access-Control-Allow-Origin: *»):
 *   /api/broadcast/<torneo>              un torneo, sus rondas y su grupo
 *   /api/broadcast/-/-/<ronda>           una ronda: sus partidas (FEN, jugadores,
 *                                        relojes, resultado), su torneo y su grupo
 *   /api/broadcast/round/<ronda>.pgn     el PGN de la ronda, con la evaluación
 *                                        de Lichess ([%eval]) y el reloj ([%clk])
 *                                        después de cada jugada
 * Un evento con varias categorías es en Lichess un GRUPO de torneos, uno por
 * categoría («Open U15», «Girls U15»…): con el enlace de cualquiera de ellos
 * (o de una de sus rondas) se llega a todos. Ver «Las partidas en vivo, dentro
 * de la página» en docs/decisiones/juegos-y-torneos.md.
 *
 *   LichessTransmision.idDeEnlace(url)      → { id, es: "torneo" | "ronda" } o null
 *   LichessTransmision.torneosDelEvento(e)  → { grupo, torneos: [{ id, nombre }] }
 *   LichessTransmision.rondas(idTorneo)     → { rondas: [...], porDefecto }
 *   LichessTransmision.rondaDeAhora(r)      → la ronda que se está jugando (o la última)
 *   LichessTransmision.partidas(idRonda)    → las partidas de la ronda, sin las jugadas
 *   LichessTransmision.pgn(idRonda)         → el PGN de la ronda, en texto
 *   LichessTransmision.leerPgn(texto, Chess)→ cada partida con sus jugadas y posiciones
 *   LichessTransmision.porcentaje(ev)       → cuánto de la barra es de las blancas
 */
(function (raiz) {
  "use strict";

  const LICHESS = "https://lichess.org";
  const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  // lichess.org/broadcast/<torneo>/<id>          → el id del torneo
  // lichess.org/broadcast/<torneo>/<ronda>/<id>  → el id de una ronda
  // (y con la partida al final, /<ronda>/<id>/<partida>, también la ronda).
  function idDeEnlace(url) {
    let u;
    try { u = new URL(String(url || "")); } catch (e) { return null; }
    if (!/(^|\.)lichess\.org$/.test(u.hostname)) return null;
    const p = u.pathname.split("/").filter(Boolean);
    if (p[0] !== "broadcast") return null;
    const ok = (s) => /^[A-Za-z0-9]{8}$/.test(s || "");
    if (p.length === 3 && ok(p[2])) return { id: p[2], es: "torneo" };
    if (p.length === 4 && ok(p[3])) return { id: p[3], es: "ronda" };
    if (p.length === 5 && ok(p[3])) return { id: p[3], es: "ronda" };
    return null;
  }

  async function pedir(ruta, comoTexto) {
    const res = await fetch(LICHESS + ruta, { headers: { Accept: comoTexto ? "application/x-chess-pgn" : "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error("Lichess respondió " + res.status + " a " + ruta);
    return comoTexto ? res.text() : res.json();
  }

  // Los torneos del evento: los del grupo, o el torneo solo si no tiene grupo.
  async function torneosDelEvento(enlace) {
    const d = enlace.es === "ronda" ? await pedir("/api/broadcast/-/-/" + enlace.id) : await pedir("/api/broadcast/" + enlace.id);
    const tour = d.tour || {};
    const grupo = d.group && Array.isArray(d.group.tours) && d.group.tours.length ? d.group : null;
    const torneos = grupo
      ? grupo.tours.map((x) => ({ id: x.id, nombre: String(x.name || "") }))
      : [{ id: tour.id, nombre: String(tour.name || "") }];
    return { grupo: grupo ? String(grupo.name || "") : String(tour.name || ""), torneos: torneos.filter((x) => /^[A-Za-z0-9]{8}$/.test(x.id || "")) };
  }

  // «Round 7» → 7. Sin número, el orden en la lista.
  const numeroDe = (nombre, i) => Number((String(nombre || "").match(/(\d+)/) || [])[1]) || i + 1;

  async function rondas(idTorneo) {
    const d = await pedir("/api/broadcast/" + idTorneo);
    const lista = (d.rounds || []).map((r, i) => ({
      id: r.id, nombre: String(r.name || ""), numero: numeroDe(r.name, i),
      enCurso: !!r.ongoing, terminada: !!r.finished, empieza: r.startsAt || null, url: r.url || "",
    }));
    return { rondas: lista, porDefecto: d.defaultRoundId || null, url: (d.tour && d.tour.url) || "" };
  }

  // La que se está jugando; si ninguna, la que Lichess marca, la última que
  // empezó o la primera.
  function rondaDeAhora(r, ahora) {
    const t = ahora == null ? Date.now() : ahora;
    const l = (r && r.rondas) || [];
    return l.find((x) => x.enCurso)
      || l.find((x) => x.id === r.porDefecto)
      || l.slice().reverse().find((x) => x.terminada || (x.empieza && x.empieza <= t))
      || l[0] || null;
  }

  async function partidas(idRonda) {
    const d = await pedir("/api/broadcast/-/-/" + idRonda);
    return (d.games || []).map((g, i) => ({
      id: g.id, mesa: i + 1, fen: g.fen || INICIAL, ultima: g.lastMove || "", resultado: resultadoDe(g.status),
      piensa: typeof g.thinkTime === "number" ? g.thinkTime : null,
      blancas: jugadorDe((g.players || [])[0]), negras: jugadorDe((g.players || [])[1]),
    }));
  }

  function jugadorDe(p) {
    p = p || {};
    return { nombre: String(p.name || ""), titulo: String(p.title || ""), elo: Number(p.rating) || 0, fed: String(p.fed || ""),
      fide: Number(p.fideId) || 0, reloj: typeof p.clock === "number" ? p.clock : null };
  }

  // «1-0», «0-1», «½-½» (o «1/2-1/2»); en curso, «».
  function resultadoDe(s) {
    const t = String(s || "").replace("1/2-1/2", "½-½");
    return /^(1-0|0-1|½-½)$/.test(t) ? t : "";
  }

  const pgn = (idRonda) => pedir("/api/broadcast/round/" + idRonda + ".pgn", true);

  // [%eval 0.15] → 0.15 peones para las blancas; [%eval #-3] → mate en 3 de
  // las negras, que se guarda como −97 (la misma cuenta que js/preparacion-motor.js:
  // ±100 menos las jugadas que faltan, así un mate siempre pesa más que todo).
  function evalDe(c) {
    const m = String(c || "").match(/\[%eval\s+(#?)(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const v = Number(m[2]);
    if (!m[1]) return v;
    return v > 0 ? 100 - v : v < 0 ? -100 - v : 0;
  }
  // [%clk 1:02:36] → segundos.
  function relojDe(c) {
    const m = String(c || "").match(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2})/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  }

  // Las partidas de un PGN de Lichess, cada una con sus jugadas: la SAN, de
  // dónde a dónde, la posición que deja, y la evaluación y el reloj que trae.
  // Solo la línea principal: las variantes (que una transmisión casi nunca
  // trae) se saltan. Una jugada que chess.js no acepta corta ahí la partida.
  function leerPgn(texto, Chess) {
    const bloques = String(texto || "").replace(/\r/g, "").split(/\n\s*\n(?=\[)/).filter((b) => /\[\w+\s+"/.test(b));
    return bloques.map((b) => {
      const tags = {};
      b.replace(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm, (_, k, v) => { tags[k] = v.replace(/\\(.)/g, "$1"); return ""; });
      const cuerpo = b.replace(/^\[.*\]\s*$/gm, "");
      const fenInicial = tags.FEN || INICIAL;
      const juego = new Chess(fenInicial);
      const jugadas = [];
      let i = 0, prof = 0, roto = false;
      while (i < cuerpo.length && !roto) {
        const ch = cuerpo[i];
        if (ch === "{") {
          const fin = cuerpo.indexOf("}", i);
          const c = cuerpo.slice(i + 1, fin < 0 ? undefined : fin);
          const ultima = jugadas[jugadas.length - 1];
          if (ultima && prof === 0) {
            const e = evalDe(c), r = relojDe(c);
            if (e !== null) ultima.eval = e;
            if (r !== null) ultima.reloj = r;
          }
          i = fin < 0 ? cuerpo.length : fin + 1;
          continue;
        }
        if (ch === "(") { prof++; i++; continue; }
        if (ch === ")") { prof = Math.max(0, prof - 1); i++; continue; }
        if (ch === ";") { const fin = cuerpo.indexOf("\n", i); i = fin < 0 ? cuerpo.length : fin + 1; continue; }
        if (/\s/.test(ch)) { i++; continue; }
        const m = cuerpo.slice(i).match(/^[^\s{}();]+/);
        const tok = m ? m[0] : ch;
        i += tok.length;
        if (prof > 0) continue;
        if (/^\d+\.+$/.test(tok) || /^\$\d+$/.test(tok) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
        const san = tok.replace(/^\d+\.+/, "").replace(/[!?]+$/, "");
        if (!san) continue;
        const mov = juego.move(san, { sloppy: true });
        if (!mov) { roto = true; break; }
        jugadas.push({ san: mov.san, de: mov.from, a: mov.to, fen: juego.fen(), color: mov.color, eval: null, reloj: null });
      }
      const mesa = Number((String(tags.Round || "").match(/\.(\d+)$/) || [])[1]) || 0;
      const id = (String(tags.GameURL || tags.Site || "").match(/\/([A-Za-z0-9]{8})$/) || [])[1] || "";
      return {
        id, mesa, tags, fenInicial, jugadas, resultado: resultadoDe(tags.Result),
        blancas: { nombre: tags.White || "", titulo: tags.WhiteTitle || "", elo: Number(tags.WhiteElo) || 0, fed: tags.WhiteFed || "", fide: Number(tags.WhiteFideId) || 0 },
        negras: { nombre: tags.Black || "", titulo: tags.BlackTitle || "", elo: Number(tags.BlackElo) || 0, fed: tags.BlackFed || "", fide: Number(tags.BlackFideId) || 0 },
        url: tags.GameURL || "",
      };
    });
  }

  // La barra de la evaluación: cuánto de ella es de las blancas, de 0 a 100.
  // La misma curva que usa Lichess (una ventaja de un peón ya se nota, pero
  // ninguna llena la barra salvo el mate).
  function porcentaje(ev) {
    if (ev == null || !isFinite(ev)) return 50;
    if (ev >= 90) return 100;
    if (ev <= -90) return 0;
    const cp = Math.max(-1000, Math.min(1000, ev * 100));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }

  const api = { LICHESS, INICIAL, idDeEnlace, torneosDelEvento, rondas, rondaDeAhora, partidas, pgn, leerPgn, porcentaje, evalDe, relojDe, resultadoDe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.LichessTransmision = api;
})(typeof window !== "undefined" ? window : globalThis);
