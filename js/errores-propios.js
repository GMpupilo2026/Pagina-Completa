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
 *   - Lichess y Chess.com: si el alumno escribe su usuario, sus últimas
 *     partidas públicas (PreparacionDescarga, la misma de la preparación de
 *     rivales; solo sale el nombre de usuario). `deLaWeb()` las convierte.
 *
 * El análisis corre en el navegador del alumno (PreparacionMotor: el mismo
 * Stockfish de la preparación de rivales). Primero una pasada corta por
 * todas las posiciones; en las jugadas donde la evaluación se cayó, una
 * mirada más honda con varias líneas, que decide cuáles jugadas «también
 * servían». Un error que la mirada honda no confirma se descarta.
 *
 * Cada error lleva además su TEMA, con el mismo reconocedor de patrones de la
 * preparación de rivales (PreparacionTactica.temaDeJugada, sin motor): si se
 * le escapó la ventaja, el de la mejor jugada que no vio; si regaló, el de la
 * respuesta con que lo castiga el rival. `temasDe()` cuenta cuál se repite y
 * a qué tema de «Ejercicios por tema» manda a practicar.
 *
 * Lo que queda (los ejercicios y qué partidas ya se miraron) va en dos claves
 * de localStorage que viajan con la cuenta (js/progreso-usuario.js): el
 * alumno las ve en cualquier aparato y su profesor las puede leer
 * (training_state). No se guarda el nombre del rival: solo la posición, la
 * jugada que se hizo y las buenas.
 *
 * `detectar()`, `ejercicio()` y `deFilas()` son puras (sin DOM ni motor): las
 * prueba herramientas/verificar-errores-propios.js en Node.
 *
 * Informes (js/informes.js) lee lo mismo desde training_state para mostrárselo
 * al profesor: `deFilas()` convierte esas filas en la lista, sin creerle nada
 * (lo escribió el navegador del alumno).
 */
(function (raiz) {
  "use strict";

  const CLAVE_EJERCICIOS = "errores_propios_v1";   // id → ejercicio
  const CLAVE_VISTAS = "errores_analizadas_v1";    // "juego:<id>" / "practica:<id>" / "lichess:<id>" / "chesscom:<id>" → cuándo se miró
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
  /* `tema` (opcional): la clave de PreparacionTactica.TEMAS que ya se calculó;
     «otra» no se guarda (no dice nada). */
  function ejercicio(partida, error, fen, jugada, opciones, tema) {
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
      resumen: (ORIGEN[partida.origen] || "Partida") + " del " + fechaCorta(partida.fecha) + " · jugada " + numero,
      tema: tema && tema !== "otra" ? tema : null,
    };
  }

  /* El tema de un error, con el reconocedor de la preparación de rivales
     (T = PreparacionTactica). Nivel 2: la mejor jugada, la que no vio.
     Nivel 1: la respuesta del rival después de su jugada, la que lo castiga
     (`castigo`, en SAN; con chess.js se le devuelve el «#» si da mate). */
  function temaDelError(T, Chess, nivel, fen, mejor, jugada, castigo) {
    if (!T) return null;
    try {
      if (nivel === 2) return T.temaDeJugada(fen, sanCompleta(Chess, fen, mejor));
      const g = new Chess(fen);
      if (!g.move(jugada) || !castigo) return null;
      return T.temaDeJugada(g.fen(), sanCompleta(Chess, g.fen(), castigo));
    } catch (e) { return null; }
  }
  function sanCompleta(Chess, fen, san) {
    const m = new Chess(fen).move(san);
    return m ? m.san : san;
  }

  /* Los temas de una lista de ejercicios, del que más se repite al que menos:
     [{ tema, n, nombre, plural, practica }]. `TEMAS` es PreparacionTactica.TEMAS
     (los nombres y el tema de «Ejercicios por tema» para practicar). */
  function temasDe(ejercicios, TEMAS) {
    const cuenta = {};
    (ejercicios || []).forEach((x) => { if (x && x.tema && TEMAS && TEMAS[x.tema]) cuenta[x.tema] = (cuenta[x.tema] || 0) + 1; });
    return Object.keys(cuenta).map((t) => Object.assign({ tema: t, n: cuenta[t] }, TEMAS[t]))
      .sort((a, b) => b.n - a.n || (a.tema < b.tema ? -1 : 1));
  }
  function fechaCorta(iso) {
    try { return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }); } catch (e) { return ""; }
  }

  /* ---------- la apertura ----------
     Un error de las primeras 10 jugadas es de la apertura: ahí lo que ayuda
     no es tanto el tema táctico como saber la línea. Se mira con la POSICIÓN
     (piezas, turno, enroques y al paso), no con las jugadas: así sirve también
     para los ejercicios ya guardados, que no guardan la partida, y encuentra
     la línea aunque se haya llegado por otro orden. */
  const JUGADAS_DE_APERTURA = 10;
  function enLaApertura(fen) {
    const n = Number(String(fen || "").split(" ")[5]);
    return n >= 1 && n <= JUGADAS_DE_APERTURA;
  }
  const claveFen = (fen) => String(fen).split(" ").slice(0, 4).join(" ");
  const limpiaSan = (san) => String(san || "").replace(/[+#!?]+$/, "");
  const posicionesDeLineas = new Map();   // LINEAS → Map(clave de posición → [{ linea, jugada }])
  function indiceDeLineas(Chess, LINEAS) {
    if (posicionesDeLineas.has(LINEAS)) return posicionesDeLineas.get(LINEAS);
    const mapa = new Map();
    (LINEAS || []).forEach((L) => {
      const g = new Chess();
      for (const san of L.jugadas || []) {
        const k = claveFen(g.fen());
        if (!mapa.has(k)) mapa.set(k, []);
        mapa.get(k).push({ linea: L, jugada: limpiaSan(san) });
        if (!g.move(san)) break;
      }
    });
    posicionesDeLineas.set(LINEAS, mapa);
    return mapa;
  }
  /* La línea del banco de Aperturas (js/aperturas-lineas.js, LINEAS) que pasa
     por la posición de un error, o null:
       { caso: "celada", linea }   cayó en una celada del rival: la línea es
                                   del otro color y espera JUSTO la jugada que
                                   hizo el alumno;
       { caso: "teoria", linea, jugada, buena }   la línea es de su color y
                                   ahí sigue con `jugada` (`buena`: está entre
                                   las que el motor dio por buenas).
     Primero la celada (es lo que explica el error), después la teoría con una
     jugada buena, después cualquier teoría. Pura: sin DOM. */
  function lineaDeApertura(Chess, item, LINEAS) {
    if (!item || !item.fen || !LINEAS || !enLaApertura(item.fen)) return null;
    const turno = item.fen.split(" ")[1];
    const aca = indiceDeLineas(Chess, LINEAS).get(claveFen(item.fen)) || [];
    const hizo = limpiaSan(item.jugada);
    const buenas = (item.buenas || []).map(limpiaSan);
    const celada = aca.find((x) => x.linea.color !== turno && x.linea.tipo === "celada" && x.jugada === hizo);
    if (celada) return { caso: "celada", linea: celada.linea };
    const propias = aca.filter((x) => x.linea.color === turno && x.jugada !== hizo);
    const conBuena = propias.find((x) => buenas.indexOf(x.jugada) >= 0);
    const t = conBuena || propias[0];
    return t ? { caso: "teoria", linea: t.linea, jugada: t.jugada, buena: !!conBuena } : null;
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
      .map((x) => (x.tema && !/^[a-z-]{2,20}$/.test(x.tema) ? Object.assign({}, x, { tema: null }) : x))
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

  /* Cómo se nombra cada origen en el resumen de un ejercicio. */
  const ORIGEN = { juego: "Partida", practica: "Práctica en clase", lichess: "Partida de Lichess", chesscom: "Partida de Chess.com" };

  /* ---------- las partidas de Lichess o Chess.com ----------
     `partidas`: lo que devuelve PreparacionAnalisis.leerPgn() del PGN que bajó
     PreparacionDescarga ([{ etiquetas, jugadas }]). Devuelve las partidas en la
     misma forma que traerPartidas(), solo las de ajedrez normal desde la
     posición inicial en que jugó `usuario` (sin distinguir mayúsculas, como
     esos dos sitios), de la más reciente a la más vieja y sin repetir.
     La clave es el id del sitio («lichess:AbCd1234», «chesscom:123456»): es lo
     que marca la partida como revisada. Pura: la prueba verificar-errores-propios.js. */
  const ENLACE_WEB = {
    lichess: /^https:\/\/lichess\.org\/([A-Za-z0-9]{8})(?:[/?#]|$)/,
    chesscom: /^https:\/\/www\.chess\.com\/game\/(?:live|daily)\/(\d{1,15})(?:[/?#]|$)/,
  };
  function fechaDeEtiquetas(e) {
    const d = String(e.UTCDate || e.Date || "").match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (!d) return null;
    const h = String(e.UTCTime || "").match(/^(\d{2}):(\d{2}):(\d{2})$/);
    return d[1] + "-" + d[2] + "-" + d[3] + "T" + (h ? h[1] + ":" + h[2] + ":" + h[3] : "12:00:00") + "Z";
  }
  function deLaWeb(partidas, sitio, usuario) {
    const re = ENLACE_WEB[sitio];
    const yo = String(usuario || "").trim().replace(/^@/, "").toLowerCase();
    if (!re || !yo) return [];
    const vistas = {};
    const out = [];
    (partidas || []).forEach((p) => {
      const e = (p && p.etiquetas) || {};
      if (!/^(standard|chess)?$/i.test(String(e.Variant || "").trim())) return;     // Chess960, «From Position»…
      if (e.SetUp === "1" || e.FEN) return;                                         // no empezó en la inicial
      const color = String(e.White || "").toLowerCase() === yo ? "w" : String(e.Black || "").toLowerCase() === yo ? "b" : null;
      if (!color) return;
      const m = String(e.Link || e.Site || "").match(re);
      const fecha = fechaDeEtiquetas(e);
      if (!m || !fecha || !Array.isArray(p.jugadas)) return;
      const clave = sitio + ":" + m[1];
      if (vistas[clave]) return;
      vistas[clave] = true;
      out.push({ clave, origen: sitio, color, turno0: "w", fenInicial: null, jugadas: p.jugadas.slice(), fecha });
    });
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }

  /* ---------- las partidas ---------- */
  /* [{ clave, origen, color, turno0, fenInicial, jugadas, fecha }] de las
     terminadas, de la más reciente a la más vieja. */
  /* `solo`: la clave de UNA partida ("juego:<id>"), para «Revisa esta
     partida» al terminarla en Juegos; se pide esa sola, aunque no esté entre
     las 30 más recientes, y con los mismos filtros (suya, estándar, terminada). */
  async function traerPartidas(sb, uid, solo) {
    const out = [];
    const soloJuego = solo && /^juego:[0-9a-zA-Z-]{1,64}$/.test(solo) ? solo.slice(6) : null;
    let pedidoJuegos = sb.from("game_rooms").select("id, white_id, black_id, moves, updated_at")
      .eq("variant", "estandar").eq("status", "finished")
      .or("white_id.eq." + uid + ",black_id.eq." + uid);
    if (soloJuego) pedidoJuegos = pedidoJuegos.eq("id", soloJuego);
    const [juegos, practicas] = await Promise.all([
      pedidoJuegos.order("updated_at", { ascending: false }).range(0, 29),
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
     o: { motor (PreparacionMotor), alAvanzar(texto, hechas, total), parar(),
          solo (la clave de una partida de Juegos), externas (de deLaWeb) }
     → { partidas, nuevos } */
  async function analizar(sb, uid, o) {
    const motor = o.motor;
    const yaVistas = vistas();
    // `o.externas`: las de Lichess o Chess.com, ya convertidas (deLaWeb).
    const todas = o.externas ? o.externas : await traerPartidas(sb, uid, o.solo);
    if (o.solo) {
      // Revisar UNA partida: si no es suya (o no terminó, o no es estándar), no
      // llega; si ya se revisó, se dice cuáles salieron de ella.
      const esa = todas.find((p) => p.clave === o.solo);
      if (!esa) return { partidas: 0, pendientesAntes: 0, nuevos: [], noEncontrada: true };
      if (yaVistas[esa.clave]) return { partidas: 0, pendientesAntes: 0, nuevos: [], yaRevisada: true, deEsa: ejercicios().filter((x) => x.id.indexOf(esa.clave.replace(":", "-") + "-") === 0) };
      if (esa.jugadas.length < 10) return { partidas: 0, pendientesAntes: 0, nuevos: [], muyCorta: true };
    }
    const pendientes = (o.solo ? todas.filter((p) => p.clave === o.solo) : todas).filter((p) => !yaVistas[p.clave]).slice(0, MAX_PARTIDAS);
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
        // Nivel 1: con qué lo castiga el rival (la mejor en la posición de después).
        let castigo = null;
        if (e.nivel === 1 && fens[e.ply + 1]) { const r = await motor.evaluar(fens[e.ply + 1], PROF_HONDA); castigo = r && r.mejor; }
        const tema = ops && ops[0] ? temaDelError(o.tactica || raiz.PreparacionTactica, raiz.Chess, e.nivel, fens[e.ply], ops[0].san, p.jugadas[e.ply], castigo) : null;
        const x = ejercicio(p, e, fens[e.ply], p.jugadas[e.ply], ops, tema);
        if (x) deEsta.push(x);
      }
      guardar(deEsta);
      nuevos.push(...deEsta);
      marcar();
      hechas++;
    }
    return { partidas: hechas, pendientesAntes: pendientes.length, nuevos };
  }

  /* Para Informes: las filas de training_state del alumno (key, value.raw)
     → { ejercicios, revisadas, resueltos }. Lo que no tenga la forma de un
     ejercicio se ignora: el valor lo escribió el navegador del alumno y se
     puede tocar desde la consola. Los textos se pintan con textContent. */
  const SAN = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?$/;
  function deFilas(filas) {
    const raw = {};
    (filas || []).forEach((f) => {
      const v = f && f.value;
      if (v && typeof v.raw === "string") { try { raw[f.key] = JSON.parse(v.raw); } catch (e) { raw[f.key] = null; } }
    });
    const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
    const ejercicios = Object.values(obj(raw[CLAVE_EJERCICIOS])).filter((x) =>
      x && typeof x.id === "string" && typeof x.fen === "string" && x.fen.length < 100 &&
      (x.nivel === 1 || x.nivel === 2) && typeof x.jugada === "string" && SAN.test(x.jugada) &&
      Array.isArray(x.buenas) && x.buenas.length > 0 && x.buenas.length <= 6 && x.buenas.every((s) => typeof s === "string" && SAN.test(s)) &&
      typeof x.antes === "number" && typeof x.despues === "number" && typeof x.fecha === "string")
      .map((x) => (x.tema && !/^[a-z-]{2,20}$/.test(x.tema) ? Object.assign({}, x, { tema: null }) : x))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.id < b.id ? -1 : 1)))
      .slice(0, MAX_EJERCICIOS);
    const estrellas = obj(raw.tipos_estrellas_v1);
    const resueltos = {};
    ejercicios.forEach((x) => { const n = Number(estrellas["errores:" + x.id]); if (n >= 1) resueltos[x.id] = Math.min(3, n); });
    return { ejercicios, revisadas: Object.keys(obj(raw[CLAVE_VISTAS])).length, resueltos };
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
    detectar, ejercicio, temaDelError, temasDe, posiciones, acierta, ejercicios, guardar, vistas, traerPartidas, analizar, deFilas,
    deLaWeb, ORIGEN, enLaApertura, lineaDeApertura, JUGADAS_DE_APERTURA,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = ErroresPropios;
  else raiz.ErroresPropios = ErroresPropios;
})(typeof window !== "undefined" ? window : globalThis);
