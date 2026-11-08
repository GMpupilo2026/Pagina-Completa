/* Las partidas de LiveChess Cloud (los tableros DGT del Centroamericano) con
 * la MISMA forma que js/lichess-transmision.js, para que la página del torneo
 * (js/centroamericano-partidas.js) las muestre igual que las de Lichess: la
 * lista, los filtros, el visor, «En vivo ahora» y «Ver su partida en vivo».
 * Sin nada de la pantalla: se prueba con node en
 * herramientas/verificar-livechess-transmision.js.
 *
 * SIN ATRASO. Lichess va con 15 minutos por juego limpio; LiveChess no. El
 * dueño pidió el 7/11 el Blitz así, en vivo, sabiendo el riesgo. Qué torneo se
 * publica lo dice la base (centroamericano_livechess.publico, solo con SQL) y
 * se pide con centroamericano_livechess_publico(): el id de LiveChess nunca
 * está en el repositorio. Ver «El Blitz, directo de LiveChess y sin atraso» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 * LiveChess se lee sin cuenta y desde el navegador (CORS abierto):
 *   <pool>/get/<id>/tournament.json          las rondas: { count, live } cada una
 *   <pool>/get/<id>/round-N/index.json       los pareos: white/black (lname,
 *                                            fname, mname, fideid) y result
 *   <pool>/get/<id>/round-N/game-M.json      una partida: moves («Nf3 5482+5»:
 *                                            la jugada, el reloj de quien jugó
 *                                            después, en segundos, y lo que
 *                                            pensó), result, clock, live
 * El tablero M es la mesa (los tableros transmitidos empiezan en la mesa 1;
 * si no, en la primera de «tableros»), como en centroamericano-mesas-vivo.
 *
 * Los ids son nuestros, no de LiveChess: «lc-<tnr>» el torneo,
 * «lc-<tnr>-<ronda>» la ronda y «lc-<tnr>-<ronda>-<mesa>» la partida.
 *
 *   LiveChessTransmision.torneos(sb)        → [{ id, nombre, tnr, ritmo }] los publicados
 *   LiveChessTransmision.es(id)             → si un id (de torneo o de ronda) es de LiveChess
 *   LiveChessTransmision.rondas(idTorneo)   → { rondas: [...], porDefecto } (como Lichess)
 *   LiveChessTransmision.partidas(idRonda)  → las partidas de la ronda, sin las jugadas
 *   LiveChessTransmision.juegos(idRonda, Chess) → cada partida con sus jugadas (como leerPgn)
 *   LiveChessTransmision.leerPartida(...)   → una partida de LiveChess con chess.js (para probar)
 */
(function (raiz) {
  "use strict";

  const POOL = "https://1.pool.livechesscloud.com/get/";
  const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const RONDA_MS = 4000;   // la partida y el índice leídos sirven unos segundos (lista y jugadas a la vez)

  const torneosPorId = new Map();   // «lc-<tnr>» → { lc, primera }
  const es = (id) => /^lc-\d+(?:-\d+)?$/.test(String(id || ""));

  async function pedir(ruta) {
    const res = await fetch(POOL + ruta, { cache: "no-store" });
    if (!res.ok) throw new Error("LiveChess respondió " + res.status + " a " + ruta);
    return res.json();
  }

  // «Sub-14», «Absoluto» → «Blitz Sub-14 Absoluto»: el nombre que la página
  // entiende (codigoCategoria y modalidadDe de js/centroamericano-partidas.js).
  const MODALIDAD = { blitz: "Blitz", rapido: "Rápido", clasico: "" };
  async function torneos(sb) {
    if (!sb || !sb.rpc) return [];
    const { data, error } = await sb.rpc("centroamericano_livechess_publico");
    if (error) throw error;
    return (data || []).filter((f) => /^[0-9a-f-]{36}$/i.test(f.torneo_id || "") && /^\d+$/.test(f.tnr || "")).map((f) => {
      const id = "lc-" + f.tnr;
      const primera = Number((String(f.tableros || "").match(/\d+/) || [])[0]) || 1;
      torneosPorId.set(id, { lc: String(f.torneo_id).toLowerCase(), primera });
      const nombre = [MODALIDAD[f.ritmo] || "", f.categoria || "", f.rama === "Femenino" ? "Femenino" : f.rama || ""].filter(Boolean).join(" ") || String(f.nombre || "");
      return { id, nombre, tnr: String(f.tnr), ritmo: String(f.ritmo || "") };
    });
  }

  function partes(idRonda) {
    const m = String(idRonda || "").match(/^(lc-\d+)-(\d+)$/);
    const t = m && torneosPorId.get(m[1]);
    if (!t) throw new Error("La ronda " + idRonda + " no es de un torneo de LiveChess publicado.");
    return { t, idTorneo: m[1], numero: Number(m[2]) };
  }

  // Las rondas como las da Lichess. «En curso»: con alguna partida en vivo.
  // Por defecto, la última que ya tiene pareos (la de ahora o la que acaba de
  // terminar); terminada, una con pareos que ya no tiene nada en vivo y a la
  // que le sigue otra con pareos.
  async function rondas(idTorneo) {
    const t = torneosPorId.get(idTorneo);
    if (!t) throw new Error("El torneo " + idTorneo + " no es de LiveChess.");
    const d = await pedir(t.lc + "/tournament.json");
    const rs = Array.isArray(d.rounds) ? d.rounds : [];
    const conPareo = rs.map((r) => Number(r && r.count) > 0);
    const ultima = conPareo.lastIndexOf(true);
    const lista = rs.map((r, i) => ({
      id: idTorneo + "-" + (i + 1), nombre: "Ronda " + (i + 1), numero: i + 1,
      enCurso: Number(r && r.live) > 0, terminada: conPareo[i] && !(Number(r && r.live) > 0) && i < ultima,
      empieza: null, url: "",
    }));
    return { rondas: lista, porDefecto: ultima >= 0 ? lista[ultima].id : null, url: "" };
  }

  // «Apellidos, Nombre Segundo», como FIDE, chess-results y Lichess.
  function nombreDe(p) {
    p = p || {};
    const nom = [p.fname, p.mname].filter(Boolean).join(" ").trim();
    const ape = String(p.lname || "").trim();
    return ape && nom ? ape + ", " + nom : ape || nom;
  }

  function resultadoDe(pareo, juego) {
    const t = String((pareo && pareo.result) || "").replace("1/2-1/2", "½-½").replace(/\s/g, "");
    if (/^(1-0|0-1|½-½)$/.test(t)) return t;
    const r = String((juego && juego.result) || "").toUpperCase();
    return r === "WHITEWIN" ? "1-0" : r === "BLACKWIN" ? "0-1" : r === "DRAW" ? "½-½" : "";
  }

  // «Nf3 5482+5» → { san: "Nf3", reloj: 5482, piensa: 5 }. A veces viene solo
  // el reloj («Ba6 2912») o solo lo pensado («e4 +152»).
  function jugadaDe(texto) {
    const m = String(texto || "").trim().match(/^(\S+)(?:\s+(\d+)?(?:\+(\d+))?)?/);
    if (!m) return null;
    return { san: m[1], reloj: m[2] != null ? Number(m[2]) : null, piensa: m[3] != null ? Number(m[3]) : null };
  }

  // Una partida de LiveChess con sus jugadas, como las de leerPgn de
  // js/lichess-transmision.js. Una jugada que chess.js no acepta corta ahí.
  function leerPartida(id, mesa, pareo, juego, Chess) {
    const chess = new Chess(INICIAL);
    const jugadas = [];
    for (const t of (juego && Array.isArray(juego.moves) ? juego.moves : [])) {
      const j = jugadaDe(t);
      const mov = j && chess.move(j.san, { sloppy: true });
      if (!mov) break;
      jugadas.push({ san: mov.san, de: mov.from, a: mov.to, fen: chess.fen(), color: mov.color, eval: null, reloj: j.reloj, piensa: j.piensa });
    }
    const resultado = resultadoDe(pareo, juego);
    const b = (pareo && pareo.white) || {}, n = (pareo && pareo.black) || {};
    const blancas = { nombre: nombreDe(b), titulo: String(b.title || ""), elo: 0, fed: String(b.federation || ""), fide: Number(b.fideid) || 0 };
    const negras = { nombre: nombreDe(n), titulo: String(n.title || ""), elo: 0, fed: String(n.federation || ""), fide: Number(n.fideid) || 0 };
    const tags = { White: blancas.nombre, Black: negras.nombre, Result: resultado ? resultado.replace("½-½", "1/2-1/2") : "*" };
    return { id, mesa, tags, fenInicial: INICIAL, jugadas, resultado, blancas, negras, url: "" };
  }

  // El reloj de cada uno: el que da LiveChess de la partida (segundos) o, si no
  // lo trae, el de su última jugada. En centésimas, como Lichess.
  function relojes(juego, jugadas) {
    const c = juego && juego.clock;
    const ultimo = (color) => { for (let i = jugadas.length - 1; i >= 0; i--) if (jugadas[i].color === color && jugadas[i].reloj != null) return jugadas[i].reloj; return null; };
    const b = c && typeof c.white === "number" ? c.white : ultimo("w");
    const n = c && typeof c.black === "number" ? c.black : ultimo("b");
    return { b: b == null ? null : b * 100, n: n == null ? null : n * 100 };
  }

  // La ronda entera: el índice y cada partida. Una partida terminada no se
  // vuelve a pedir; las demás, a lo sumo cada pocos segundos (la lista y el
  // visor las piden juntas).
  const rondasLeidas = new Map();   // idRonda → { leido, promesa, pareos, juegos: Map(mesa → json) }
  function leerRonda(idRonda) {
    const { t, numero } = partes(idRonda);
    let r = rondasLeidas.get(idRonda);
    if (r && r.promesa) return r.promesa;
    if (r && Date.now() - r.leido < RONDA_MS) return Promise.resolve(r);
    r = r || { leido: 0, pareos: [], juegos: new Map() };
    rondasLeidas.set(idRonda, r);
    r.promesa = (async () => {
      try {
        const idx = await pedir(t.lc + "/round-" + numero + "/index.json");
        const pareos = Array.isArray(idx && idx.pairings) ? idx.pairings : [];
        await Promise.all(pareos.map(async (p, i) => {
          const ya = r.juegos.get(i);
          if (ya && resultadoDe(p, ya) && !ya.live) return;
          try { r.juegos.set(i, await pedir(t.lc + "/round-" + numero + "/game-" + (i + 1) + ".json?poll")); }
          catch (e) { /* esa mesa no contestó: queda la lectura anterior */ }
        }));
        r.pareos = pareos;
        r.leido = Date.now();
        return r;
      } finally {
        r.promesa = null;
      }
    })();
    return r.promesa;
  }

  async function juegos(idRonda, Chess) {
    const { t } = partes(idRonda);
    const r = await leerRonda(idRonda);
    return r.pareos.map((p, i) => leerPartida(idRonda + "-" + (t.primera + i), t.primera + i, p, r.juegos.get(i) || null, Chess));
  }

  async function partidas(idRonda, Chess) {
    Chess = Chess || raiz.Chess;
    const { t } = partes(idRonda);
    const lista = await juegos(idRonda, Chess);
    const leida = rondasLeidas.get(idRonda);
    return lista.map((g) => {
      const ult = g.jugadas[g.jugadas.length - 1];
      const r2 = relojes(leida ? leida.juegos.get(g.mesa - t.primera) : null, g.jugadas);
      return {
        id: g.id, mesa: g.mesa, fen: ult ? ult.fen : INICIAL, ultima: ult ? ult.de + ult.a : "", resultado: g.resultado,
        piensa: ult && ult.piensa != null ? ult.piensa : null,
        blancas: Object.assign({}, g.blancas, { reloj: r2.b }), negras: Object.assign({}, g.negras, { reloj: r2.n }),
      };
    });
  }

  const api = { POOL, INICIAL, es, torneos, rondas, partidas, juegos, leerPartida, jugadaDe, nombreDe, resultadoDe, relojes, _torneosPorId: torneosPorId };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.LiveChessTransmision = api;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
