/* «Tus propios errores» (tipo 18 de entreno/tipos.html): los errores de las
 * partidas del alumno, convertidos en ejercicios.
 *
 * De dónde salen las partidas (las dos las deja leer la RLS al propio alumno):
 *   - game_rooms: Juegos, retos, parejas de la clase y torneos. Solo las de
 *     ajedrez normal (variant = 'estandar') y terminadas. No guarda la posición
 *     de inicio: se reproduce desde la inicial y, si alguna jugada no es legal
 *     (la partida empezó «desde el tablero»), la partida se deja fuera.
 *   - practice_games: la práctica contra el motor en la clase. La posición de
 *     inicio está en practice_sessions (la leen los alumnos de quien la creó).
 *
 * El análisis corre en el navegador del alumno (PreparacionMotor: el mismo
 * Stockfish de la preparación de rivales). Primero una pasada corta por
 * todas las posiciones; en las jugadas donde la evaluación se cayó, una
 * mirada más honda con varias líneas, que decide cuáles jugadas «también
 * servían». Un error que la mirada honda no confirma se descarta.
 *
 * Lo que queda (los ejercicios y qué partidas ya se miraron) va en dos claves
 * de localStorage que viajan con la cuenta (js/progreso-usuario.js): el
 * alumno las ve en cualquier aparato y su profesor las puede leer
 * (training_state). No se guarda el nombre del rival: solo la posición, la
 * jugada que se hizo y las buenas.
 *
 * `detectar()` y `ejercicio()` son puras (sin DOM ni motor): las prueba
 * herramientas/verificar-errores-propios.js en Node.
 */
(function (raiz) {
  "use strict";

  const CLAVE_EJERCICIOS = "errores_propios_v1";   // id → ejercicio
  const CLAVE_VISTAS = "errores_analizadas_v1";    // "juego:<id>" / "practica:<id>" → cuándo se miró
  const MAX_PARTIDAS = 10;                         // por cada vez que se busca
  const MAX_EJERCICIOS = 60;                       // los más recientes
  const POR_PARTIDA = 3;                           // los errores más grandes de cada partida
  const PROF_PASADA = 10;
  const PROF_HONDA = 14;
  /* Los cortes, en centipeones desde el lado del alumno. */
  const CORTE = {
    tope: 1000,          // un mate cuenta como ±10: más no cambia nada
    caida: 200,          // perder 2 peones o más en una jugada
    ok: -150,            // «estaba bien»: no peor que −1,5
    malo: -100,          // y quedó mal: −1 o peor
    ganaba: 200,         // «ganaba»: +2 o más
    yaNo: 150,           // y ya no: menos de +1,5
    buena: 50,           // una jugada «también sirve» si queda a menos de 0,5 de la mejor
  };

  const tope = (cp) => Math.max(-CORTE.tope, Math.min(CORTE.tope, Math.round(cp)));

  /* evals[i]: evaluación en centipeones DESDE LAS BLANCAS de la posición antes
     de la media jugada i (hay una más que jugadas: la del final). `turno0` es
     quién mueve en la posición inicial. Devuelve los errores del alumno:
     [{ ply, antes, despues, perdida, nivel }] con antes/despues desde su lado.
       nivel 1 «Lo que regalaste»: estaba bien y quedó mal.
       nivel 2 «Lo que se te escapó»: ganaba y ya no. */
  function detectar(evals, colorAlumno, turno0) {
    const s = colorAlumno === "w" ? 1 : -1;
    const out = [];
    for (let i = 0; i + 1 < evals.length; i++) {
      const mueve = (i % 2 === 0) ? turno0 : (turno0 === "w" ? "b" : "w");
      if (mueve !== colorAlumno) continue;
      if (evals[i] === null || evals[i + 1] === null || evals[i] === undefined || evals[i + 1] === undefined) continue;
      const antes = tope(s * evals[i]), despues = tope(s * evals[i + 1]);
      const perdida = antes - despues;
      if (perdida < CORTE.caida) continue;
      let nivel = null;
      if (antes >= CORTE.ok && antes < CORTE.ganaba && despues <= CORTE.malo) nivel = 1;
      else if (antes >= CORTE.ganaba && despues < CORTE.yaNo) nivel = 2;
      if (nivel) out.push({ ply: i, antes, despues, perdida, nivel });
    }
    return out.sort((a, b) => b.perdida - a.perdida).slice(0, POR_PARTIDA).sort((a, b) => a.ply - b.ply);
  }

  /* Con lo que dijo la mirada honda ([{ san, eval desde las blancas, en
     peones }], de la mejor a la peor), arma el ejercicio o dice que no:
     la jugada que se hizo no puede estar entre las buenas, y la mejor tiene
     que dejar al alumno 2 peones o más por encima de lo que jugó. */
  function ejercicio(partida, error, fen, jugada, opciones) {
    if (!opciones || !opciones.length) return null;
    const s = partida.color === "w" ? 1 : -1;
    const cp = (o) => tope(s * o.eval * 100);
    const mejor = cp(opciones[0]);
    const limpia = (san) => String(san).replace(/[+#]$/, "");
    const buenas = opciones.filter((o) => cp(o) >= mejor - CORTE.buena).map((o) => limpia(o.san));
    if (buenas.indexOf(limpia(jugada)) >= 0) return null;          // la honda dice que no era error
    if (mejor - error.despues < CORTE.caida) return null;          // ni tan grave
    const numero = Math.floor(error.ply / 2) + 1;
    return {
      id: partida.clave.replace(":", "-") + "-" + error.ply, nivel: error.nivel,
      fen, jugada: limpia(jugada), buenas, mejor: buenas[0],
      antes: mejor, despues: error.despues, fecha: partida.fecha, origen: partida.origen,
      resumen: (partida.origen === "practica" ? "Práctica en clase" : "Partida") + " del " + fechaCorta(partida.fecha) + " · jugada " + numero,
    };
  }
  function fechaCorta(iso) {
    try { return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }); } catch (e) { return ""; }
  }

  /* ---------- lo guardado ---------- */
  function leer(clave) {
    try { const v = JSON.parse(localStorage.getItem(clave) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
  }
  function escribir(clave, obj) { try { localStorage.setItem(clave, JSON.stringify(obj)); } catch (e) {} }
  /* Los ejercicios, del más reciente al más viejo, a lo sumo MAX_EJERCICIOS. */
  function ejercicios() {
    return Object.values(leer(CLAVE_EJERCICIOS))
      .filter((x) => x && x.id && x.fen && Array.isArray(x.buenas))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.id < b.id ? -1 : 1)))
      .slice(0, MAX_EJERCICIOS);
  }
  function guardar(nuevos) {
    const o = leer(CLAVE_EJERCICIOS);
    nuevos.forEach((x) => { o[x.id] = x; });
    const quedan = Object.values(o).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, MAX_EJERCICIOS);
    const out = {};
    quedan.forEach((x) => { out[x.id] = x; });
    escribir(CLAVE_EJERCICIOS, out);
  }
  function vistas() { return leer(CLAVE_VISTAS); }

  /* ---------- las partidas ---------- */
  /* [{ clave, origen, color, turno0, fenInicial, jugadas, fecha }] de las
     terminadas, de la más reciente a la más vieja. */
  async function traerPartidas(sb, uid) {
    const out = [];
    const [juegos, practicas] = await Promise.all([
      sb.from("game_rooms").select("id, white_id, black_id, moves, updated_at")
        .eq("variant", "estandar").eq("status", "finished")
        .or("white_id.eq." + uid + ",black_id.eq." + uid)
        .order("updated_at", { ascending: false }).range(0, 29),
      sb.from("practice_games").select("id, session_id, moves, student_color, status, updated_at")
        .eq("student_id", uid).neq("status", "playing")
        .order("updated_at", { ascending: false }).range(0, 29),
    ]);
    if (juegos.error) throw juegos.error;
    if (practicas.error) throw practicas.error;
    (juegos.data || []).forEach((r) => {
      out.push({ clave: "juego:" + r.id, origen: "juego", color: r.white_id === uid ? "w" : "b", turno0: "w",
        fenInicial: null, jugadas: Array.isArray(r.moves) ? r.moves : [], fecha: r.updated_at });
    });
    const conSesion = (practicas.data || []).filter((r) => r.session_id);
    if (conSesion.length) {
      const ids = [...new Set(conSesion.map((r) => r.session_id))];
      const { data: sesiones, error } = await sb.from("practice_sessions").select("id, fen").in("id", ids);
      if (error) throw error;
      const fenDe = {};
      (sesiones || []).forEach((s) => { fenDe[s.id] = s.fen; });
      conSesion.forEach((r) => {
        const fen = fenDe[r.session_id];
        if (!fen) return;          // la sesión ya no se puede leer: sin posición de inicio, no se analiza
        out.push({ clave: "practica:" + r.id, origen: "practica", color: r.student_color, turno0: fen.split(" ")[1] || "w",
          fenInicial: fen, jugadas: Array.isArray(r.moves) ? r.moves : [], fecha: r.updated_at });
      });
    }
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }

  /* Las posiciones de una partida, o null si alguna jugada no es legal. */
  function posiciones(Chess, p) {
    const g = new Chess();
    if (p.fenInicial && !g.load(p.fenInicial)) return null;
    const fens = [g.fen()];
    for (const san of p.jugadas) {
      if (!g.move(san)) return null;
      fens.push(g.fen());
    }
    return fens;
  }

  /* Busca errores en las partidas que todavía no se miraron.
     o: { motor (PreparacionMotor), alAvanzar(texto, hechas, total), parar() }
     → { partidas, nuevos } */
  async function analizar(sb, uid, o) {
    const motor = o.motor;
    const yaVistas = vistas();
    const todas = await traerPartidas(sb, uid);
    const pendientes = todas.filter((p) => !yaVistas[p.clave]).slice(0, MAX_PARTIDAS);
    const nuevos = [];
    let hechas = 0;
    for (const p of pendientes) {
      if (o.parar && o.parar()) break;
      const marcar = () => { const v = vistas(); v[p.clave] = new Date().toISOString(); escribir(CLAVE_VISTAS, v); };
      const fens = posiciones(raiz.Chess, p);
      if (!fens || p.jugadas.length < 10) { marcar(); hechas++; continue; }   // no se puede reproducir, o muy corta
      const evals = [];
      for (let i = 0; i < fens.length; i++) {
        if (o.parar && o.parar()) return { partidas: hechas, nuevos };
        if (o.alAvanzar) o.alAvanzar("Partida " + (hechas + 1) + " de " + pendientes.length + ": jugada " + (Math.floor(i / 2) + 1) + " de " + Math.ceil(fens.length / 2) + ".", hechas, pendientes.length);
        const r = await motor.evaluar(fens[i], PROF_PASADA);
        evals.push(r && typeof r.eval === "number" ? r.eval * 100 : null);
      }
      const deEsta = [];
      for (const e of detectar(evals, p.color, p.turno0)) {
        const ops = await motor.opciones(fens[e.ply], 4, PROF_HONDA);
        const x = ejercicio(p, e, fens[e.ply], p.jugadas[e.ply], ops);
        if (x) deEsta.push(x);
      }
      guardar(deEsta);
      nuevos.push(...deEsta);
      marcar();
      hechas++;
    }
    return { partidas: hechas, pendientesAntes: pendientes.length, nuevos };
  }

  /* ¿La jugada del alumno es una de las buenas? */
  function acierta(Chess, item, mov) {
    const g = new Chess(item.fen);
    const m = g.move(mov);
    if (!m) return { legal: false, ok: false };
    const san = m.san.replace(/[+#]$/, "");
    return { legal: true, ok: item.buenas.indexOf(san) >= 0, san: m.san, esLaDeLaPartida: san === item.jugada };
  }

  const ErroresPropios = {
    CLAVE_EJERCICIOS, CLAVE_VISTAS, CORTE, MAX_PARTIDAS, MAX_EJERCICIOS,
    detectar, ejercicio, posiciones, acierta, ejercicios, guardar, vistas, traerPartidas, analizar,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = ErroresPropios;
  else raiz.ErroresPropios = ErroresPropios;
})(typeof window !== "undefined" ? window : globalThis);
