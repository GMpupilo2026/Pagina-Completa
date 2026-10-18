/* ===== Ajedrez Integral — El estilo en las partidas de verdad =====
 *
 * Una prueba mide lo que la persona CONTESTA; sus partidas, lo que HACE. Se
 * puede contestar «atacar» porque suena valiente y cambiar piezas en cada
 * partida. Este módulo busca, en sus partidas de Lichess y Chess.com, los
 * momentos que son una pregunta de estilo de verdad: tenía dos jugadas que el
 * motor valora casi igual, de carácter opuesto, y jugó una de ellas.
 *
 *   - Las mismas reglas que el banco (js/estilo-medidas.js y el generador):
 *     las dos jugadas a 30 centipeones o menos de la mejor, la posición sin
 *     decidir (±1,5), sin venir de una captura ni de un jaque, sin estar en
 *     jaque, de la jugada 8 a la 30, y el carácter medido con `poloDe`. Si la
 *     jugada que hizo no estaba entre las buenas, el momento no cuenta: un
 *     error no dice qué prefiere.
 *   - El motor es el del navegador (SharedEngine), con MultiPV y poca
 *     profundidad (12): son muchas posiciones en la computadora de quien mira.
 *     Por eso cada momento pesa la mitad que una pregunta de la prueba
 *     (js/estilo-perfil.js).
 *   - Hasta 2 posiciones por partida, de las más nuevas a las más viejas, y
 *     hasta `maximo` posiciones en total: el estilo de hoy, no el de hace
 *     tres años.
 *
 * El RENDIMIENTO según el tipo de partida: en qué partidas le va mejor, para
 * sumarlo a la recomendación (js/estilo-aperturas.js). Solo en los dos ejes
 * que describen la partida y no a quien va ganando:
 *   - `estructura` (columnas abiertas menos peones bloqueados, promediado en
 *     las medias jugadas 24, 32 y 40) y `cambios` (piezas que salieron del
 *     tablero hasta la 40) valen lo mismo para los dos bandos.
 *   - El ataque y el material NO: quien va ganando presiona más al rey y
 *     tiene más material, así que «rinde mejor cuando ataca» diría solo que
 *     gana cuando va ganando.
 * Sus partidas de 40 medias jugadas o más se parten por la mitad en cada eje
 * (las más abiertas y las más cerradas, de las SUYAS) y se comparan los
 * puntos. Cuenta solo con 15 partidas o más en cada mitad y una diferencia
 * que el azar daría menos de una vez en veinte (|z| ≥ 1,96).
 *
 * Y el SEGUIMIENTO de la recomendación: cómo le fue con la apertura que se le
 * recomendó desde ese día, contra antes y contra el resto de sus partidas de
 * esos meses (si todo le va mejor, no es la apertura: es que mejoró).
 *
 *   EstiloPartidas.momentos(partidas, jugador, { evaluar, maximo, alAvanzar, parar })
 *     → [{ eje, primero, fen, jugada, otra }]
 *   EstiloPartidas.seguimiento(partidas, jugador, recomendacion, desde)
 *     → { blancas: {...}, e4: {...}, d4: {...} } con { id, antes, despues, resto }
 *   EstiloPartidas.rendimiento(partidas, jugador)
 *     → { n, ejes: { estructura: {...}, cambios: {...} } } con
 *       { alto: {n, puntos}, bajo: {n, puntos}, d, z, cuenta }
 *   EstiloPartidas.evaluarConSharedEngine(fen, lineas, profundidad)
 *     → [{ uci, score (cp, desde quien mueve), pv }]
 */
(function () {
  "use strict";

  const PAREJAS = 30, DECIDIDA = 150, PROF = 12, LINEAS = 4;
  const PLY_DESDE = 14, PLY_HASTA = 60, POR_PARTIDA = 2;

  const G = typeof window !== "undefined" ? window : globalThis;
  const medidas = () => G.EstiloMedidas || (typeof require === "function" ? require("./estilo-medidas.js") : null);
  const aperturas = () => G.EstiloAperturas || (typeof require === "function" ? require("./estilo-aperturas.js") : null);
  const ChessDe = () => G.Chess || (typeof require === "function" ? require("chess.js").Chess : null);

  const clave = (n) => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const colorDe = (p, jugador) => {
    const j = clave(jugador);
    if (clave(p.etiquetas.White) === j) return "w";
    if (clave(p.etiquetas.Black) === j) return "b";
    return null;
  };
  /* La fecha de la partida, AAAA-MM-DD (UTCDate en Lichess, Date en Chess.com). */
  const fechaDe = (p) => {
    const f = String(p.etiquetas.UTCDate || p.etiquetas.Date || "").replace(/\./g, "-");
    return /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null;
  };
  const puntosDe = (p, color) => {
    const r = p.etiquetas.Result;
    if (r === "1/2-1/2") return 0.5;
    if (r === "1-0") return color === "w" ? 1 : 0;
    if (r === "0-1") return color === "b" ? 1 : 0;
    return null;
  };

  /* Las posiciones de sus partidas que pueden ser un momento de estilo. */
  function candidatas(partidas, jugador, maximo) {
    const Chess = ChessDe();
    const ordenadas = partidas.slice().sort((x, y) => String(fechaDe(y) || "").localeCompare(String(fechaDe(x) || "")));
    const out = [];
    for (const p of ordenadas) {
      const color = colorDe(p, jugador);
      if (!color || !Array.isArray(p.jugadas)) continue;
      const c = new Chess();
      let previa = null, deEsta = 0;
      for (let i = 0; i < Math.min(p.jugadas.length, PLY_HASTA); i++) {
        const turno = c.turn();
        if (turno === color && i >= PLY_DESDE && deEsta < POR_PARTIDA && i % 4 < 2
            && !(previa && /[x+#]/.test(previa.san)) && !c.in_check()) {
          const fen = c.fen();
          const m = new Chess(fen).move(p.jugadas[i], { sloppy: true });
          if (m) { out.push({ fen, jugada: m.from + m.to + (m.promotion || "") }); deEsta++; }
        }
        previa = c.move(p.jugadas[i], { sloppy: true });
        if (!previa) break;
      }
      if (out.length >= maximo) break;
    }
    return out.slice(0, maximo);
  }

  /* Un momento de estilo en una posición, con las líneas del motor. */
  function momentoDe(cand, lineas) {
    const Chess = ChessDe(), M = medidas();
    if (!lineas || !lineas.length || Math.abs(lineas[0].score) > DECIDIDA) return [];
    const buenas = lineas.filter((l) => lineas[0].score - l.score <= PAREJAS && Math.abs(l.score) < 50000);
    const suya = buenas.find((l) => l.uci === cand.jugada);
    if (!suya) return [];
    const out = [];
    for (const otra of buenas) {
      if (otra.uci === suya.uci) continue;
      let ma, mb;
      try { ma = M.medir(Chess, cand.fen, suya.pv); mb = M.medir(Chess, cand.fen, otra.pv); } catch (e) { continue; }
      const ta = M.tipoDeJugada(Chess, cand.fen, suya.uci), tb = M.tipoDeJugada(Chess, cand.fen, otra.uci);
      for (const eje of Object.keys(M.POLOS)) {
        if (out.some((x) => x.eje === eje)) continue;
        const polo = M.poloDe(eje, ma, mb, ta, tb);
        if (polo) out.push({ eje, primero: polo === "a", fen: cand.fen, jugada: suya.uci, otra: otra.uci });
      }
    }
    return out;
  }

  async function momentos(partidas, jugador, o) {
    const opt = o || {};
    // Se busca al llamar (y no al cargar) para que un verificador pueda poner su motor de mentira.
    const evaluar = opt.evaluar || ((fen, n, prof) => api.evaluarConSharedEngine(fen, n, prof));
    const cands = candidatas(partidas, jugador, opt.maximo || 60);
    const out = [];
    for (let i = 0; i < cands.length; i++) {
      if (opt.parar && opt.parar()) break;
      let lineas;
      try { lineas = await evaluar(cands[i].fen, LINEAS, PROF); } catch (e) { continue; }
      out.push(...momentoDe(cands[i], lineas));
      if (opt.alAvanzar) opt.alAvanzar(i + 1, cands.length, out.length);
    }
    return out;
  }

  /* MultiPV con la línea entera de cada jugada, con el Stockfish del sitio. */
  function evaluarConSharedEngine(fen, lineas, profundidad) {
    const SE = G.SharedEngine;
    if (!SE) return Promise.reject(new Error("Falta el motor"));
    return SE.runTask(async () => {
      const motor = await SE.ensureEngine();
      if (!motor) throw new Error("No se pudo cargar Stockfish");
      return new Promise((res, rej) => {
        const porPv = {};
        const espera = setTimeout(() => {
          SE.setMessageHandler(null);
          SE.discardEngine();
          rej(new Error("Stockfish no respondió"));
        }, 30000);
        SE.setMessageHandler((ev) => {
          const l = typeof ev.data === "string" ? ev.data : "";
          if (l.startsWith("info") && / pv /.test(l) && / score /.test(l) && !/bound/.test(l)) {
            const prof = +((/ depth (\d+)/.exec(l) || [])[1] || 0);
            const k = +((/ multipv (\d+)/.exec(l) || [0, 1])[1]);
            const m = / score (cp|mate) (-?\d+)/.exec(l);
            if (m && prof >= 1) {
              const v = m[1] === "cp" ? +m[2] : (+m[2] > 0 ? 100000 - +m[2] : -100000 - +m[2]);
              porPv[k] = { uci: l.split(" pv ")[1].trim().split(/\s+/)[0], score: v, pv: l.split(" pv ")[1].trim().split(/\s+/).slice(0, 6) };
            }
          } else if (l.startsWith("bestmove")) {
            clearTimeout(espera);
            SE.setMessageHandler(null);
            motor.postMessage("setoption name MultiPV value 1");
            res(Object.keys(porPv).sort((a, b) => a - b).map((k) => porPv[k]));
          }
        });
        motor.postMessage("setoption name MultiPV value " + lineas);
        motor.postMessage("position fen " + fen);
        motor.postMessage("go depth " + profundidad);
      });
    });
  }

  /* -------- El rendimiento según el tipo de partida -------- */
  const RINDE_MUESTRAS = [24, 32, 40], RINDE_MINIMO = 15, RINDE_Z = 1.96;
  const r3 = (x) => Math.round(x * 1000) / 1000;

  /* Cómo fue la partida, igual para los dos bandos: null si es corta. Se
     recuerda por la lista de jugadas: no cambia, y volver a jugarla cuesta. */
  const tipos = new WeakMap();
  function tipoDePartida(p) {
    if (!Array.isArray(p.jugadas)) return null;
    if (!tipos.has(p.jugadas)) tipos.set(p.jugadas, tipoSinGuardar(p));
    return tipos.get(p.jugadas);
  }
  function tipoSinGuardar(p) {
    const Chess = ChessDe(), M = medidas();
    if (p.jugadas.length < RINDE_MUESTRAS[RINDE_MUESTRAS.length - 1]) return null;
    const c = new Chess();
    const inicio = M.piezas(c.fen());
    const fens = [];
    for (let i = 0; i < RINDE_MUESTRAS[RINDE_MUESTRAS.length - 1]; i++) {
      if (!c.move(p.jugadas[i], { sloppy: true })) return null;
      if (RINDE_MUESTRAS.includes(i + 1)) fens.push(c.fen());
    }
    return {
      estructura: fens.reduce((s, f) => s + M.apertura(f), 0) / fens.length,
      cambios: inicio - M.piezas(fens[fens.length - 1]),
    };
  }

  function rendimiento(partidas, jugador) {
    const filas = [];
    for (const p of partidas || []) {
      const color = colorDe(p, jugador);
      const pts = color && puntosDe(p, color);
      if (pts == null) continue;
      const tipo = tipoDePartida(p);
      if (tipo) filas.push({ tipo, pts });
    }
    const ejes = {};
    for (const e of ["estructura", "cambios"]) {
      // La mitad de arriba y la de abajo, de SUS partidas.
      const orden = filas.slice().sort((x, y) => x.tipo[e] - y.tipo[e]);
      const corte = Math.floor(orden.length / 2);
      const bajo = orden.slice(0, corte).map((x) => x.pts), alto = orden.slice(corte).map((x) => x.pts);
      const media = (l) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
      const todo = media(orden.map((x) => x.pts));
      const d = alto.length && bajo.length ? media(alto) - media(bajo) : 0;
      const se = alto.length && bajo.length ? Math.sqrt(Math.max(1e-9, todo * (1 - todo)) * (1 / alto.length + 1 / bajo.length)) : Infinity;
      const z = d / se;
      ejes[e] = {
        alto: { n: alto.length, puntos: alto.length ? r3(media(alto)) : null },
        bajo: { n: bajo.length, puntos: bajo.length ? r3(media(bajo)) : null },
        d: r3(d), z: Math.round(z * 100) / 100,
        cuenta: alto.length >= RINDE_MINIMO && bajo.length >= RINDE_MINIMO && Math.abs(z) >= RINDE_Z,
      };
    }
    return { n: filas.length, ejes };
  }

  /* -------- El seguimiento de la recomendación -------- */
  function pasaPor(p, define) {
    const Chess = ChessDe();
    const c = new Chess();
    for (const san of define) if (!c.move(san)) return false;
    const objetivo = c.fen().split(" ").slice(0, 2).join(" ");
    const g = new Chess();
    for (let i = 0; i < Math.min(30, p.jugadas.length); i++) {
      if (!g.move(p.jugadas[i], { sloppy: true })) return false;
      if (g.fen().split(" ").slice(0, 2).join(" ") === objetivo) return true;
    }
    return false;
  }
  const resumen = (lista) => ({ n: lista.length, puntos: lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : null });

  function seguimiento(partidas, jugador, recomendacion, desde) {
    const A = aperturas();
    const out = {};
    for (const g of Object.keys(A.GRUPOS)) {
      const rec = recomendacion && recomendacion[g] && recomendacion[g].principal;
      const m = rec && A.medidaDe(rec.id);
      if (!m) continue;
      const def = A.GRUPOS[g];
      const antes = [], despues = [], resto = [];
      for (const p of partidas) {
        const color = colorDe(p, jugador);
        const f = fechaDe(p);
        const pts = color && puntosDe(p, color);
        if (pts == null || !f || color !== def.color) continue;
        if (def.contra && p.jugadas[0] !== def.contra) continue;
        const esta = pasaPor(p, m.define);
        if (f >= desde) (esta ? despues : resto).push(pts);
        else if (esta) antes.push(pts);
      }
      out[g] = { id: rec.id, nombre: rec.nombre, antes: resumen(antes), despues: resumen(despues), resto: resumen(resto) };
    }
    return out;
  }

  /* Lo que se dice del seguimiento: solo lo que alcanza la muestra. */
  const MINIMO_SEGUIMIENTO = 5;
  const pct = (x) => Math.round(100 * x) + " %";
  function fraseSeguimiento(s, tu) {
    if (!s || s.despues.n < MINIMO_SEGUIMIENTO) {
      return `${s ? s.nombre : "La apertura recomendada"}: ${s && s.despues.n ? "solo " + s.despues.n + (s.despues.n === 1 ? " partida" : " partidas") : "ninguna partida"} desde la recomendación; hacen falta ${MINIMO_SEGUIMIENTO} para decir algo.`;
    }
    let t = `Con ${s.nombre}: ${s.despues.n} partidas desde la recomendación, ${pct(s.despues.puntos)} de los puntos`;
    if (s.antes.n >= MINIMO_SEGUIMIENTO) t += ` (antes, ${pct(s.antes.puntos)} en ${s.antes.n})`;
    if (s.resto.n >= MINIMO_SEGUIMIENTO) t += `; en ${tu ? "tus" : "sus"} otras partidas de esos meses, ${pct(s.resto.puntos)}`;
    return t + ".";
  }

  const api = { PAREJAS, DECIDIDA, PROF, MINIMO_SEGUIMIENTO, RINDE_MINIMO, RINDE_Z, tipoDePartida, rendimiento, candidatas, momentoDe, momentos, evaluarConSharedEngine, seguimiento, fraseSeguimiento, pasaPor, colorDe, fechaDe };
  if (typeof window !== "undefined") window.EstiloPartidas = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
