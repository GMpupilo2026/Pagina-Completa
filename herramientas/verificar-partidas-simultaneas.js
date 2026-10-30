/* 50 partidas a la vez entre alumnos, en navegadores de verdad, con una red
   que se porta mal: ¿cada jugada le llega al rival al instante, y ninguna
   partida se queda trabada?

   POR QUÉ EXISTE
   En un torneo pasó que el reloj corría y al alumno no le aparecía la jugada
   del rival (o la suya no le llegaba al otro). No daba ningún error: la jugada
   estaba guardada en la base y la pantalla no se enteraba, porque la sala solo
   escuchaba Realtime, y Realtime no avisa lo que pasó mientras el canal estuvo
   caído (un celular que bloqueó la pantalla, una pestaña en segundo plano, un
   cambio de red, Realtime atrasado con la base cargada). Ver «Las jugadas
   llegan siempre» en docs/decisiones/juegos-y-torneos.md.

   CÓMO
   Un servidor de mentira, en este proceso, hace de base y de Realtime para
   todas las pestañas a la vez (una sola `game_rooms` compartida): aplica las
   reglas del trigger del reloj (la hora la pone el servidor, la bandera
   cantada antes de tiempo se rechaza) y reparte cada cambio a quien escucha
   esa sala. Se abren 100 pestañas de estandar.html —dos por partida— y en
   cada una un jugador automático mueve al azar cuando le toca, pensando entre
   0,2 y 1,2 segundos. Cada pestaña avisa al servidor en cuanto su tablero
   muestra una posición nueva, y así se mide cuánto tarda cada jugada en
   verse del otro lado.

   Tres rondas:
     1. Al instante (10 partidas, red sana): cada jugada se ve del otro lado
        en menos de 1 s, la mitad en menos de 300 ms.
     2. Muchas a la vez (50 partidas, red sana): ninguna se pierde ni se traba
        y ninguna tarda más de 6 s. Con 100 pestañas en UNA computadora, los
        milisegundos los pone sobre todo la computadora (cada alumno tiene su
        aparato): por eso se mide también cuánto atrasaba ella los relojes de
        cada pestaña, y se imprime al lado. Con 4 procesadores, la mediana
        anda por el medio segundo y el atraso propio de la computadora explica
        casi todo.
     3. Muchas a la vez con red mala: Realtime pierde el 15 % de los avisos,
        entrega otro 10 % tarde y desordenado, corta los canales a ratos
        (también los cierra del todo), y una de cada diez respuestas de la
        base tarda hasta 2,5 s. Aun así ninguna jugada tarda más de 15 s en
        verse (lo peor: un aviso perdido, 5 s de espera y dos respuestas
        lentas, más la computadora), ninguna partida se traba, y al final
        todas las pantallas muestran lo mismo que la base.
     4 y 5. Ajedrez para 4 (cuatro-jugadores.html), 12 partidas, red sana y
        red mala: los cuatro tocan «Estoy listo» casi a la vez (y una sola
        vez) y todas arrancan; cada jugada la ven los otros tres.
     3 bis. Una jugada avisada por el canal rápido que la base no guarda, y
        nadie vuelve a mover: del otro lado se pintó como provisional, y tiene
        que desaparecer sola (la relectura a los 4 s).
     6 y 7 (las corre verificar-partidas-modalidades.js: todas juntas pasan de
        los 10 minutos de verificar-todo). Las demás modalidades con turno (Niebla, Crazyhouse, Cartas,
        Abrazos, Camaleón, Vampiro, Volcanes, Misiones), dos partidas de cada
        una, con red sana y mala: además de lo de siempre, en cada modalidad la
        jugada del rival tiene que llegar también por el canal rápido (si la
        página no la puede rehacer con su motor, todas llegarían por la base).
        Duelo no: ahí no hay turno ni canal rápido.
   En todas: la lista de jugadas guardada lleva siempre a la posición
   guardada (ninguna jugada se pisa ni se pierde), ninguna pestaña se va a
   otra sala, y no hay errores de JavaScript en las salas.

   EL CANAL RÁPIDO Y LAS PRE-JUGADAS (ver «La jugada viaja por Broadcast, y las
   pre-jugadas» en docs/decisiones/juegos-y-torneos.md). El servidor reparte
   también Broadcast (con la misma red: se pierde, llega tarde, desordenado),
   los jugadores dejan pre-jugadas al azar en el turno del rival, y la demora
   se cuenta desde que QUIEN MUEVE ve su jugada: entra lo que tarda guardarla.
   En la red mala, la base rechaza además el 3 % de las jugadas ya avisadas.
   SIN_RAPIDA=1 hace de base sin la política (el canal privado no abre: todo
   tiene que seguir por postgres_changes) y SIN_PREMOVIDAS=1, sin pre-jugadas.
   RONDAS=6,7 corre solo esas rondas, y SOLO_MODALIDADES=cartas,niebla, solo
   esas modalidades (DEPURAR=1 muestra además lo que la página anota con
   «DBG» en la consola).

   Con la sala de antes (solo Realtime, sin volver a leer), la red mala deja
   partidas trabadas para siempre (una jugada tardó 5 minutos en verse y otras
   no llegaron nunca): probado.

   Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
         npm install
         node herramientas/verificar-partidas-simultaneas.js
         PARTIDAS=10 node herramientas/verificar-partidas-simultaneas.js   (las rondas 2 y 3 con 10)
         MESAS4=4, SOLO_CUATRO=1 o SIN_CUATRO=1 para Ajedrez para 4
*/
"use strict";

const { chromium } = require("playwright");
const { Chess } = require("chess.js");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// El motor de Ajedrez para 4 de la página, para armar el tablero inicial.
const FourPlayerChess = (() => {
  const caja = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "fourplayer-engine.js"), "utf8"), caja);
  return caja.window.FourPlayerChess;
})();
const ASIENTOS = ["red", "blue", "yellow", "green"];

// Los motores de las demás modalidades, para armar la sala inicial como la arma
// juegos.html (estadoInicial en js/juegos-comun.js).
const Motores = (() => {
  const caja = { window: {}, Chess, console, Math };
  vm.createContext(caja);
  for (const f of ["crazyhouse-engine.js", "cartas-engine.js", "variantes-engines.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), caja);
  }
  return caja.window;
})();
// Cada modalidad de a dos: su página y lo que trae la sala al crearse. Duelo no
// está: ahí los dos juegan a la vez, sin turno ni canal rápido (la jugada va
// escondida hasta que confirman los dos). Ni A ciegas, que se juega escribiendo.
const MODALIDADES = {
  estandar: { pagina: "estandar.html", inicial: () => ({ fen: INICIAL_ESTANDAR }) },
  niebla: { pagina: "niebla.html", inicial: () => ({ fen: INICIAL_ESTANDAR }) },
  crazyhouse: { pagina: "crazyhouse.html", inicial: () => ({ fen: Motores.Crazyhouse.START_FEN }) },
  cartas: { pagina: "cartas.html", inicial: () => ({ fen: Motores.Crazyhouse.START_FEN, cartas_state: Motores.CartasChess.Game.iniciar().toJSON() }) },
  abrazos: { pagina: "variante.html", inicial: () => ({ fen: Motores.Variantes.inicio("abrazos") }) },
  camaleon: { pagina: "variante.html", inicial: () => ({ fen: Motores.Variantes.inicio("camaleon") }) },
  vampiro: { pagina: "variante.html", inicial: () => ({ fen: Motores.Variantes.inicio("vampiro") }) },
  volcanes: { pagina: "variante.html", inicial: () => ({ fen: INICIAL_ESTANDAR, variant_state: { volcanes: Motores.Variantes.Volcanes.sorteo() } }) },
  misiones: { pagina: "variante.html", inicial: () => ({ fen: INICIAL_ESTANDAR }) },
};
// Dónde va la posición y de quién es el turno (lo mismo que SalaJuego.turnoDe):
// Cartas la guarda en cartas_state (su columna fen no cambia) y Abrazos en JSON.
const posDe = (f) => String((f.cartas_state && f.cartas_state.fen) || f.fen || "");
function turnoDe(f) {
  const fen = posDe(f);
  if (fen.charAt(0) === "{") { try { return JSON.parse(fen).t === "b" ? "b" : "w"; } catch (e) { return "w"; } }
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const PARTIDAS = Math.max(1, parseInt(process.env.PARTIDAS || "50", 10));
// La ronda que mide «al instante»: pocas, para que la computadora que corre la
// prueba no sea el cuello de botella (ver la cabecera).
const PARTIDAS_RAPIDAS = Math.min(PARTIDAS, 10);
const JUGADAS = Math.max(4, parseInt(process.env.JUGADAS || "40", 10)); // medias jugadas por partida
const MESAS4 = Math.max(1, parseInt(process.env.MESAS4 || "12", 10));     // partidas de Ajedrez para 4
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const INICIAL_ESTANDAR = INICIAL;

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + (typeof detalle === "string" ? detalle : JSON.stringify(detalle)) : ""));
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const entre = (a, b) => a + Math.random() * (b - a);

/* ============================================================ el servidor
   Una base y un Realtime de mentira, compartidos por todas las pestañas. */
function crearServidor(red) {
  const salas = new Map();          // id → fila (de game_rooms o de fourplayer_games)
  const tablaDe = new Map();        // id → tabla
  const canales = new Map();        // clave → { page, id, salaId, vivo }
  const confirmadas = new Map();    // salaId → [{ clave, t, autor, vistos }] cada posición guardada y cuándo
  const vistas = [];                // { salaId, color, demora }
  const rechazos = [];
  const atrasos = [];               // cuánto se atrasaba el reloj de la pestaña (la computadora, no la sala)
  const movidas = new Map();        // salaId|posición → cuándo la mostró por primera vez quien movió
  const antesDeGuardar = new Map(); // salaId|posición → { color: cuándo } vistas por el canal rápido, antes de la base
  const rapidas = { enviadas: 0, recibidas: 0, premovidas: 0, premovidasDescartadas: 0 };
  const historia = new Map();      // salaId → las escrituras de jugadas, para depurar
  const devueltos = [];             // ms que el reloj de quien movió quedó por encima de lo que dice la base
  const recortes = [];              // relojes de más que la base recortó: { lenta } (si la escritura tardó en llegar)
  // El rival que se va (latido_de_partida y reclamar_por_abandono): cuándo vio
  // la base a cada jugador, y los segundos de la base (la ronda 8 los acorta).
  const latidos = new Map();        // salaId/usuario → { desde, visto }
  const AUSENCIA = red.ausencia || { latido_s: 10, aviso_s: 20, reclamar_s: 40 };
  const reclamos = [];              // { salaId, usuario, error }
  const mediciones = new Map();     // salaId/usuario → lo que mandó anotar_medicion_partida
  function ausencia(f, yo) {
    const rival = yo === f.white_id ? f.black_id : f.white_id;
    const suyo = latidos.get(f.id + "/" + rival), mio = latidos.get(f.id + "/" + yo);
    return (Date.now() - (suyo ? suyo.visto : (mio ? mio.desde : Date.now()))) / 1000;
  }
  const provisionales = new Map(); // salaId → cuántas jugadas del rival se pintaron como provisionales
  let cerrado = false;

  const ahoraIso = () => new Date().toISOString();

  function sala(id, blancas, negras, variante) {
    variante = variante || "estandar";
    return Object.assign({
      id, variant: variante, white_id: blancas, black_id: negras, status: "playing", result: null,
      moves: [], fen: INICIAL, initial_seconds: 300, increment_seconds: 2,
      white_time_left: 300, black_time_left: 300, clock_updated_at: null,
      white_ready: false, black_ready: false, created_by: "u-profe", updated_at: ahoraIso(),
    }, MODALIDADES[variante].inicial());
  }

  // Ajedrez para 4: como la crea juegos.html.
  function mesa4(id, ids) {
    const seats = {};
    ASIENTOS.forEach((a, i) => { seats[a] = { player_id: ids[i], ready: false, score: 0, time_left: 300 }; });
    return {
      id, mode: "ffa", seats, turn: "red", board: new FourPlayerChess.Game("ffa").toJSON(), moves: [],
      status: "playing", result: null, initial_seconds: 300, increment_seconds: 2, clock_updated_at: null,
      created_by: "u-profe", updated_at: ahoraIso(),
    };
  }
  function agregar(tabla, fila) { salas.set(fila.id, fila); tablaDe.set(fila.id, tabla); }

  // Qué se ve de una fila: la posición (dos jugadores) o cuántas jugadas y la
  // última (cuatro). Y de quién era el turno antes de guardarla.
  const claveDe = (f) => (f.seats ? f.moves.length + "|" + JSON.stringify(f.moves[f.moves.length - 1] || null) : posDe(f));
  const autorDe = (f) => (f.seats ? f.turn : turnoDe(f));
  const necesitan = (f) => (f.seats ? 3 : 1);

  // Lo mismo que hace public.proteger_reloj_de_partida() (lo que importa acá).
  function trigger(viejo, nuevo) {
    const ahora = Date.now();
    if (nuevo.clock_updated_at !== viejo.clock_updated_at && nuevo.clock_updated_at) nuevo.clock_updated_at = ahoraIso();
    if (viejo.seats) return null;
    if (!viejo.clock_updated_at && !nuevo.clock_updated_at && nuevo.initial_seconds != null && nuevo.white_ready && nuevo.black_ready) {
      nuevo.clock_updated_at = ahoraIso();
    }
    const pasado = viejo.clock_updated_at ? Math.max(0, (ahora - Date.parse(viejo.clock_updated_at)) / 1000) : 0;
    const mueve = turnoDe(viejo);
    const tol = 2;
    const retrasoMaximo = 1; // lo que el navegador devuelve como máximo por la jugada que tardó en llegarle
    // Con jugada, el tope deja el margen; sin jugada, el reloj no sube (ver
    // «El reloj de más se recorta, no se rechaza»).
    const commit = (f) => JSON.stringify(f.duelo_state && f.duelo_state.commit);
    const esJugada = nuevo.fen !== viejo.fen || JSON.stringify(nuevo.cartas_state) !== JSON.stringify(viejo.cartas_state) ||
      (viejo.variant === "duelo" && commit(nuevo) !== commit(viejo));
    for (const [c, clave] of [["w", "white_time_left"], ["b", "black_time_left"]]) {
      if (nuevo[clave] === viejo[clave] || viejo[clave] == null) continue;
      const corre = viejo.status === "playing" && viejo.clock_updated_at && mueve === c ? pasado : 0;
      if ((nuevo[clave] || 0) < viejo[clave] - corre - tol) return "Todavía le queda tiempo a las " + (c === "w" ? "blancas" : "negras");
      const justo = Math.max(viejo[clave] - pasado, 0) + (viejo.increment_seconds || 0);
      // Cuánto le devolvió el navegador por encima de lo que pasó según la base
      // (el retraso de la red, más lo que tardó la escritura en llegar).
      if (mueve === c && viejo.status === "playing" && viejo.clock_updated_at) devueltos.push(Math.round((nuevo[clave] - justo) * 1000));
      const tope = esJugada ? justo + tol + retrasoMaximo : viejo[clave];
      if (nuevo[clave] > tope) { nuevo[clave] = tope; recortes.push({ lenta: false }); }
    }
    // (5) El reloj lo lleva la base: la jugada que pasa el turno (no en el
    // Duelo) arranca el reloj del rival con la hora de la base, y el de quien
    // movió no queda por encima del tope aunque la pantalla no lo mande.
    const turno = (f) => String((f.cartas_state && f.cartas_state.fen) || f.fen || "").split(" ")[1];
    if (viejo.variant !== "duelo" && viejo.status === "playing" && viejo.clock_updated_at && viejo.initial_seconds != null &&
        esJugada && turno(nuevo) !== turno(viejo)) {
      nuevo.clock_updated_at = ahoraIso();
      const m = turno(viejo), k = m === "w" ? "white_time_left" : m === "b" ? "black_time_left" : null;
      if (k && viejo[k] != null) {
        const tope = Math.max(viejo[k] - pasado, 0) + (viejo.increment_seconds || 0) + tol + 1;
        if (nuevo[k] > tope) { nuevo[k] = tope; recortes.push({ lenta: false }); }
      }
    }
    return null;
  }

  function cumple(fila, filtros) {
    return filtros.every(([op, col, val]) => {
      if (op === "eq") return String(fila[col]) === String(val);
      if (op === "neq") return String(fila[col]) !== String(val);
      if (op === "in") return (val || []).map(String).includes(String(fila[col]));
      // "white_id.eq.X,black_id.eq.X" (el aviso de pareo): se entiende ese caso.
      if (op === "or") return String(col).split(",").some((p) => { const [c, o, v] = p.split("."); return o === "eq" && String(fila[c]) === v; });
      return true;
    });
  }

  async function entregar(c, tipo, dato) {
    if (cerrado || c.page.isClosed()) return;
    try { await c.page.evaluate(([id, t, d]) => window.__entregar && window.__entregar(id, t, d), [c.id, tipo, dato]); } catch (e) { /* pestaña cerrada */ }
  }

  function repartir(fila) {
    for (const c of canales.values()) {
      if (c.salaId !== fila.id) continue;
      if (!c.vivo) continue;                        // canal caído: el aviso se pierde
      if (Math.random() < red.perdidos) continue;   // Realtime atrasado: se pierde igual
      const tarde = Math.random() < red.tarde;
      const demora = tarde ? entre(1000, 3000) : entre(20, 120);
      const copia = JSON.parse(JSON.stringify(fila));
      setTimeout(() => { if (c.vivo) entregar(c, "cambio", copia); }, demora);
    }
  }

  // Cortes de canal: a cada rato, alguno se cae unos segundos y vuelve solo
  // (como hace la librería), o se cierra del todo y la página tiene que abrir otro.
  let cortes = null;
  if (red.cortes) {
    cortes = setInterval(() => {
      for (const c of canales.values()) {
        if (!c.vivo || Math.random() > red.cortes) continue;
        c.vivo = false;
        if (Math.random() < 0.3) { entregar(c, "estado", "CLOSED"); continue; }
        entregar(c, "estado", Math.random() < 0.5 ? "CHANNEL_ERROR" : "TIMED_OUT");
        setTimeout(() => { if (canales.has(c.clave)) { c.vivo = true; entregar(c, "estado", "SUBSCRIBED"); } }, entre(1500, 6000));
      }
    }, 1000);
  }

  async function atender(page, pedido) {
    // La respuesta de la base tarda: casi siempre poco, a veces mucho.
    const lenta = Math.random() < red.lentas;
    await esperar(lenta ? entre(800, 2500) : entre(20, 120));
    const { op } = pedido;

    if (op === "rpc") {
      if (pedido.nombre === "hora_servidor_ms") return { data: Date.now(), error: null };
      if (pedido.nombre === "anotar_medicion_partida") {
        const f = salas.get(pedido.args.p_room_id);
        if (!f || (pedido.usuario !== f.white_id && pedido.usuario !== f.black_id)) return { data: null, error: { message: "Solo quien juega esta partida" } };
        mediciones.set(f.id + "/" + pedido.usuario, pedido.args.p_datos);
        return { data: null, error: null };
      }
      // Lo mismo que hacen las de la base (ver «El rival que se va»).
      if (pedido.nombre === "latido_de_partida" || pedido.nombre === "reclamar_por_abandono") {
        const f = salas.get(pedido.args.p_room_id);
        const yo = pedido.usuario;
        if (!f || (yo !== f.white_id && yo !== f.black_id)) return { data: null, error: { message: "Solo quien juega esta partida" } };
        if (pedido.nombre === "latido_de_partida") {
          const k = f.id + "/" + yo, antes = latidos.get(k);
          latidos.set(k, { desde: antes ? antes.desde : Date.now(), visto: Date.now() });
          const seg = f.status === "playing" ? ausencia(f, yo) : 0;
          return { data: Object.assign({ segundos: Math.floor(seg), puede_reclamar: seg >= AUSENCIA.reclamar_s }, AUSENCIA), error: null };
        }
        let error = null;
        if (f.status !== "playing") error = "La partida ya terminó";
        else if (ausencia(f, yo) < AUSENCIA.reclamar_s) error = "Tu rival sigue conectado";
        reclamos.push({ salaId: f.id, usuario: yo, error });
        if (error) return { data: null, error: { message: error } };
        const nueva = Object.assign({}, f, { status: "finished", result: pedido.args.p_tablas ? "draw" : (yo === f.white_id ? "white" : "black"), updated_at: ahoraIso() });
        salas.set(f.id, nueva);
        repartir(nueva);
        return { data: null, error: null };
      }
      if (pedido.nombre === "nombres_de_jugadores") {
        return { data: (pedido.args.p_ids || []).map((id) => ({ id, nombre: "Alumno " + id.slice(2) })), error: null };
      }
      return { data: null, error: null };
    }
    if (op === "suscribir") {
      const clave = pedido.pagina + "/" + pedido.id;
      const filtro = (pedido.filtros || []).find((f) => (f.table === "game_rooms" || f.table === "fourplayer_games") && f.filter && f.filter.startsWith("id=eq."));
      // El canal rápido (Broadcast privado «sala-juego:<id>»). Con SIN_RAPIDA=1
      // la base no tiene la política: el canal no se abre, y la sala tiene que
      // seguir igual por la base.
      const rapido = pedido.privado && String(pedido.topic || "").startsWith("sala-juego:");
      const c = { clave, page, id: pedido.id, salaId: filtro ? filtro.filter.slice(6) : null, topic: rapido ? pedido.topic : null, vivo: true };
      if (rapido && process.env.SIN_RAPIDA) {
        setTimeout(() => entregar(c, "estado", "CHANNEL_ERROR"), entre(50, 300));
        return { data: null, error: null };
      }
      canales.set(clave, c);
      setTimeout(() => entregar(c, "estado", "SUBSCRIBED"), entre(50, 300));
      return { data: null, error: null };
    }
    if (op === "difundir") {
      // Broadcast: a los otros que escuchan el mismo canal (no al que lo manda),
      // con la misma red que Realtime: se pierde, llega tarde, desordenado.
      const desde = pedido.pagina + "/" + pedido.id;
      rapidas.enviadas++;
      for (const c of canales.values()) {
        if (c.topic !== pedido.topic || c.clave === desde || !c.vivo) continue;
        if (Math.random() < red.perdidos) continue;
        const demora = Math.random() < red.tarde ? entre(1000, 3000) : entre(20, 120);
        setTimeout(() => { if (c.vivo) { rapidas.recibidas++; entregar(c, "broadcast", { event: pedido.event, payload: pedido.payload }); } }, demora);
      }
      return { data: null, error: null };
    }
    if (op === "provisional") { provisionales.set(pedido.salaId, (provisionales.get(pedido.salaId) || 0) + 1); return { data: null, error: null }; }
    if (op === "premovi") { rapidas[pedido.ok ? "premovidas" : "premovidasDescartadas"]++; return { data: null, error: null }; }
    if (op === "movi") {
      const k = pedido.salaId + "|" + pedido.clave;
      movidas.set(k, pedido.t);
      return { data: null, error: null };
    }
    if (op === "quitar") { canales.delete(pedido.pagina + "/" + pedido.id); return { data: null, error: null }; }
    if (op === "vi") {
      atrasos.push(pedido.atraso || 0);
      // La pestaña ya muestra esta posición: ¿cuánto tardó desde que se guardó?
      // Ver una posición es ver también las anteriores: en Ajedrez para 4, quien
      // espera puede pasar de una vez a la más nueva (dos jugadas de otros que
      // llegaron juntas), y eso es lo correcto. La demora de cada una se cuenta
      // desde que ELLA se guardó.
      const lista = confirmadas.get(pedido.salaId) || [];
      let hasta = -1;
      lista.forEach((x, i) => { if (x.clave === pedido.clave && !x.vistos.has(pedido.color)) hasta = i; });
      // Una posición que la base todavía no guardó: llegó por el canal rápido.
      // Se anota, y se cuenta cuando se guarde. Las guardadas antes, ya se vieron.
      if (hasta === -1 && !lista.some((x) => x.clave === pedido.clave)) {
        const k = pedido.salaId + "|" + pedido.clave;
        if (!antesDeGuardar.has(k)) antesDeGuardar.set(k, {});
        if (!(pedido.color in antesDeGuardar.get(k))) antesDeGuardar.get(k)[pedido.color] = pedido.t;
        hasta = lista.length - 1;
      }
      for (let i = 0; i <= hasta; i++) {
        const x = lista[i];
        if (x.autor === pedido.color || x.vistos.has(pedido.color)) continue;
        x.vistos.add(pedido.color);
        vistas.push({ salaId: pedido.salaId, color: pedido.color, demora: pedido.t - x.t, por: "base", n: i + 1, guardada: x.tGuardada - x.t });
      }
      return { data: null, error: null };
    }

    const { tabla, filtros } = pedido;
    // El aviso de pareo y demás módulos de la página preguntan por «mis
    // partidas»: sin el usuario en el filtro, se les contesta solo lo suyo.
    const mias = (f) => f.white_id === pedido.usuario || f.black_id === pedido.usuario ||
      (f.seats && ASIENTOS.some((a) => f.seats[a].player_id === pedido.usuario));
    if (tabla === "profiles") {
      const yo = pedido.usuario;
      const fila = { id: yo, full_name: "Alumno " + yo.slice(2), email: yo + "@x.cr", role: "alumno", is_admin: false };
      return { data: pedido.unica ? fila : [fila], error: null };
    }
    if (tabla !== "game_rooms" && tabla !== "fourplayer_games") return { data: pedido.unica ? null : [], error: null };
    const deLaTabla = () => [...salas.values()].filter((f) => tablaDe.get(f.id) === tabla);

    if (op === "select") {
      const porId = filtros.some(([op, col]) => op === "eq" && col === "id");
      const filas = deLaTabla().filter((f) => cumple(f, filtros) && (porId || mias(f))).map((f) => JSON.parse(JSON.stringify(f)));
      return { data: pedido.unica ? (filas[0] || null) : filas, error: null };
    }
    if (op === "update") {
      // Una jugada que la base no guarda (un error de red al escribir, el acceso
      // vencido…), aunque ya se avisó por el canal rápido: del otro lado se
      // pintó como provisional, y tiene que desaparecer.
      if (red.rechazadas && pedido.cambio && pedido.cambio.moves && Math.random() < red.rechazadas) {
        rechazos.push("rechazada a propósito");
        const id = (filtros.find(([o, c]) => c === "id") || [])[2];
        if (id) { if (!historia.has(id)) historia.set(id, []); historia.get(id).push({ quien: pedido.usuario + "-RECHAZADA", n: pedido.cambio.moves.length, ult: pedido.cambio.moves[pedido.cambio.moves.length - 1] }); }
        return { data: null, error: { message: "Rechazada a propósito (prueba)" } };
      }
      // La ronda del abandono: la jugada número N no se guarda, y quien la hizo
      // ya no vuelve a mover (cerró la pestaña, se quedó sin señal).
      if (red.abandonaEn && pedido.cambio && pedido.cambio.moves && pedido.cambio.moves.length === red.abandonaEn) {
        rechazos.push("abandono");
        await page.evaluate(() => { window.__parado = true; }).catch(() => {});
        return { data: null, error: { message: "Sin señal (prueba)" } };
      }
      const tocadas = [];
      for (const vieja of deLaTabla()) {
        if (!cumple(vieja, filtros)) continue;
        const nueva = Object.assign({}, vieja, pedido.cambio);
        const antes = recortes.length;
        const error = trigger(vieja, nueva);
        // Una escritura que tardó en llegar se cobra entera en la base: el
        // navegador no la puede descontar, y eso no lo arregla el retraso.
        if (lenta) recortes.slice(antes).forEach((x) => { x.lenta = true; });
        if (error) { rechazos.push(error); return { data: null, error: { message: error } }; }
        salas.set(nueva.id, nueva);
        tocadas.push(nueva);
        if (pedido.cambio && pedido.cambio.moves) {
          if (!historia.has(nueva.id)) historia.set(nueva.id, []);
          historia.get(nueva.id).push({ quien: pedido.usuario, n: nueva.moves.length, ult: nueva.moves[nueva.moves.length - 1], fenAntes: String(vieja.fen).split(" ")[0], filtros: filtros.filter(([o, c]) => c === "fen").map((x) => String(x[2]).split(" ")[0]) });
        }
        if (claveDe(nueva) !== claveDe(vieja)) {
          if (!confirmadas.has(nueva.id)) confirmadas.set(nueva.id, []);
          // La demora se cuenta desde que quien movió la vio en SU tablero (si se
          // sabe): así entra también lo que tarda guardarla.
          const k = nueva.id + "|" + claveDe(nueva);
          const x = { clave: claveDe(nueva), t: movidas.get(k) || Date.now(), tGuardada: Date.now(), autor: autorDe(vieja), vistos: new Set(), necesita: necesitan(nueva) };
          confirmadas.get(nueva.id).push(x);
          // Quien ya la había visto por el canal rápido, antes de que la base la guardara.
          for (const [color, cuando] of Object.entries(antesDeGuardar.get(k) || {})) {
            if (color === x.autor || x.vistos.has(color)) continue;
            x.vistos.add(color);
            vistas.push({ salaId: nueva.id, color, demora: Math.max(0, cuando - x.t), por: "canal rápido", n: nueva.moves && nueva.moves.length });
          }
          antesDeGuardar.delete(k);
        }
        repartir(nueva);
      }
      const data = pedido.select ? tocadas.map((f) => JSON.parse(JSON.stringify(f))) : null;
      return { data, error: null };
    }
    return { data: null, error: null };
  }

  return {
    salas, confirmadas, vistas, rechazos, atrasos, rapidas, provisionales, historia, devueltos, recortes, reclamos, latidos, mediciones, sala, mesa4, agregar, atender,
    cerrar() { cerrado = true; if (cortes) clearInterval(cortes); },
  };
}

/* ============================================================ la pestaña
   El Supabase de mentira: todo lo manda al servidor de arriba. */
function doble(usuario, pagina) {
  return `
(function () {
  const USUARIO = ${JSON.stringify(usuario)}, PAGINA = ${JSON.stringify(pagina)};
  const canales = {};
  let siguiente = 0;
  window.__entregar = (id, tipo, dato) => {
    const c = canales[id];
    if (!c) return;
    if (tipo === "estado") { if (c.cb) c.cb(dato); return; }
    if (tipo === "broadcast") { c.difusion.forEach((o) => { if (o.event === dato.event) o.fn({ event: dato.event, payload: dato.payload }); }); return; }
    c.oyentes.forEach((o) => { if (o.event === "UPDATE" || o.event === "*") o.fn({ new: dato }); });
  };
  function constructor(tabla) {
    const pedido = { op: "select", tabla, filtros: [], unica: false, select: false, usuario: USUARIO };
    const b = {
      select() { if (pedido.op === "update") pedido.select = true; return b; },
      eq(c, v) { pedido.filtros.push(["eq", c, v]); return b; },
      neq(c, v) { pedido.filtros.push(["neq", c, v]); return b; },
      in(c, v) { pedido.filtros.push(["in", c, v]); return b; },
      is() { return b; }, not() { return b; }, or(x) { pedido.filtros.push(["or", x]); return b; }, gte() { return b; }, lte() { return b; },
      gt() { return b; }, lt() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      update(cambio) { pedido.op = "update"; pedido.cambio = cambio; return b; },
      insert() { pedido.op = "insert"; return b; }, upsert() { pedido.op = "insert"; return b; },
      delete() { pedido.op = "delete"; return b; },
      maybeSingle() { pedido.unica = true; return b; }, single() { pedido.unica = true; return b; },
      then(res, rej) { return window.__srv(pedido).then(res, rej); },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: USUARIO }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: USUARIO } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t),
    rpc: (nombre, args) => {
      const p = window.__srv({ op: "rpc", nombre, args: args || {}, usuario: USUARIO });
      return { then: (a, b) => p.then(a, b), maybeSingle: () => p, single: () => p };
    },
    channel: (topic, opciones) => {
      const id = "c" + (++siguiente);
      const privado = !!(opciones && opciones.config && opciones.config.private);
      const c = { id, oyentes: [], filtros: [], difusion: [], cb: null };
      const api = {
        on(tipo, cfg, fn) {
          if (tipo === "postgres_changes") { c.oyentes.push({ event: cfg.event, fn }); c.filtros.push({ table: cfg.table, filter: cfg.filter || null }); }
          if (tipo === "broadcast") c.difusion.push({ event: cfg.event, fn });
          return api;
        },
        subscribe(cb) { c.cb = cb || null; canales[id] = c; window.__srv({ op: "suscribir", id, filtros: c.filtros, topic, privado, pagina: PAGINA }); return api; },
        unsubscribe() { delete canales[id]; window.__srv({ op: "quitar", id, pagina: PAGINA }); return Promise.resolve(); },
        track() { return Promise.resolve(); }, presenceState() { return {}; },
        send(m) { window.__srv({ op: "difundir", id, topic, event: m.event, payload: m.payload, pagina: PAGINA }); return Promise.resolve("ok"); },
        __id: id,
      };
      return api;
    },
    removeChannel: (api) => { if (api && api.unsubscribe) api.unsubscribe(); return Promise.resolve(); },
    getChannels: () => [],
  };
})();
`;
}

/* El jugador automático y el ojo que avisa cuándo se ve cada posición. Usa las
   variables de estandar.js (room, board, myColor), que son globales del script. */
const JUGADOR = `
(function () {
  const TOPE = window.__tope || ${JUGADAS};
  const PREMOVIDAS = ${!process.env.SIN_PREMOVIDAS};
  /* Cada tablero con su motor: chess.js (Estándar, Niebla), Crazyhouse y
     Cartas en board.game; las de variante.html en board.engine. Se arma en
     cada vuelta: Cartas cambia board.game con cada estado que carga. */
  window.__motor = (b) => {
    if (b.engine) {
      const e = b.engine;
      return {
        pos: () => e.serialize(), turno: () => e.turn(),
        pieza: (sq) => { const p = e.get(sq); return p ? { tipos: p.types || [], color: p.color } : null; },
        jugadas: () => { const out = []; for (const f of "abcdefgh") for (let n = 1; n <= 8; n++) { const p = e.get(f + n); if (p && p.color === e.turn()) out.push.apply(out, e.movesFrom(f + n)); } return out; },
        jugar: (m) => b._apply(m.from, m.to, m.promotion),
      };
    }
    const g = b.game;
    return {
      pos: () => g.fen(), turno: () => g.turn(),
      pieza: (sq) => { const p = g.get(sq); return p ? { tipos: [p.type], color: p.color } : null; },
      jugadas: () => (g.legalMoves ? g.legalMoves() : g.moves({ verbose: true })),
      jugar: (m) => b._applyMove(m.from, m.to, m.promotion),
    };
  };
  let ultimaVista = null, pensandoHasta = 0, listoPedido = false, ultimoTic = Date.now(), premovidaPuesta = false, ultimaProvisional = null;
  setInterval(() => {
    const atraso = Math.max(0, Date.now() - ultimoTic - 30);
    ultimoTic = Date.now();
    let r, b, c;
    try { r = room; b = board; c = myColor; } catch (e) { return; }
    if (window.__parado) return;
    if (!r || !b || !c) return;
    // Cuenta las pre-jugadas que salieron solas (y las que ya no eran legales).
    if (!b.__contada && b.jugarPremovida) {
      b.__contada = true;
      const original = b.jugarPremovida.bind(b);
      b.jugarPremovida = function () {
        // La posición del rival se ve un instante, y la pre-jugada sale encima:
        // el ojo de 30 ms no alcanzaría a anotarla.
        if (b.premove && b._canActNow()) {
          try { window.__srv({ op: "vi", salaId: room.id, clave: window.__motor(b).pos(), color: myColor, t: Date.now(), atraso: 0 }); } catch (e) {}
        }
        const h = original();
        if (h) window.__srv({ op: "premovi", ok: h.ok });
        return h;
      };
    }
    const motor = window.__motor(b);
    // Una jugada del rival pintada como provisional: llegó por el canal rápido
    // y la página la pudo rehacer con su motor.
    if (r._provisional && r !== ultimaProvisional) {
      ultimaProvisional = r;
      window.__srv({ op: "provisional", salaId: r.id });
    }
    const fen = motor.pos();
    if (fen !== ultimaVista) {
      ultimaVista = fen;
      // La posición nueva es una jugada PROPIA si ahora le toca al rival (con una
      // pre-jugada, la del rival puede no haberse visto sola: verla después
      // cuenta como haberla visto).
      if (motor.turno() !== c) window.__srv({ op: "movi", salaId: r.id, clave: fen, t: Date.now() });
      window.__srv({ op: "vi", salaId: r.id, clave: fen, color: c, t: Date.now(), atraso });
    }
    if (r.status !== "playing") return;
    if (!(r.white_ready && r.black_ready)) {
      const mio = c === "w" ? r.white_ready : r.black_ready;
      if (!mio && !listoPedido) { listoPedido = true; setTimeout(() => document.getElementById("ready-btn").click(), 100 + Math.random() * 600); }
      return;
    }
    // En el turno del rival, a veces deja una pre-jugada (al azar: muchas no
    // van a ser legales cuando llegue el turno, y se descartan).
    if (PREMOVIDAS && !b._canActNow() && b.pre && b.pre.puede() && !b.premove && !premovidaPuesta && (r.moves || []).length < TOPE - 1) {
      premovidaPuesta = true;
      if (Math.random() < 0.4) {
        const mias = [];
        for (const f of "abcdefgh") for (let n = 1; n <= 8; n++) { const p = motor.pieza(f + n); if (p && p.color === c) mias.push({ sq: f + n, p }); }
        const elegida = mias[Math.floor(Math.random() * mias.length)];
        const destinos = elegida ? Premovidas.destinos(elegida.p.tipos, c, elegida.sq) : [];
        // Como una persona: se toca la pieza y después el destino.
        if (destinos.length) { b._onSquareClick(elegida.sq); b._onSquareClick(destinos[Math.floor(Math.random() * destinos.length)]); }
      }
    }
    if (b._canActNow()) premovidaPuesta = false;
    if (!b._canActNow() || (r.moves || []).length >= TOPE) { pensandoHasta = 0; return; }
    if (!pensandoHasta) { pensandoHasta = Date.now() + 200 + Math.random() * 1000; return; }
    if (Date.now() < pensandoHasta) return;
    pensandoHasta = 0;
    const jugadas = motor.jugadas();
    if (!jugadas.length) return;
    const m = jugadas[Math.floor(Math.random() * jugadas.length)];
    motor.jugar(m);
  }, 30);
})();
`;

/* El de Ajedrez para 4 (cuatro-jugadores.js: room, board, game, mySeat). Los
   cuatro tocan «Estoy listo» casi a la vez: es justo el caso en que uno
   borraba el «listo» de otro. */
const JUGADOR4 = `
(function () {
  const TOPE = ${JUGADAS};
  let ultimaVista = null, pensandoHasta = 0, ultimoListo = 0, ultimoTic = Date.now();
  setInterval(() => {
    const atraso = Math.max(0, Date.now() - ultimoTic - 30);
    ultimoTic = Date.now();
    let r, b, g, s;
    try { r = room; b = board; g = game; s = mySeat; } catch (e) { return; }
    if (!r || !b || !g || !s) return;
    const jug = b.game.moves;
    const clave = jug.length + "|" + JSON.stringify(jug[jug.length - 1] || null);
    if (clave !== ultimaVista) {
      ultimaVista = clave;
      window.__srv({ op: "vi", salaId: r.id, clave, color: s, t: Date.now(), atraso });
    }
    if (r.status !== "playing") return;
    if (!r.seats[s].ready) {
      // Se toca UNA vez: si el «listo» se pierde, la partida no arranca nunca.
      if (!ultimoListo) {
        ultimoListo = Date.now();
        setTimeout(() => document.getElementById("ready-btn").click(), 50 + Math.random() * 300);
      }
      return;
    }
    if (!b._canActNow() || (r.moves || []).length >= TOPE) { pensandoHasta = 0; return; }
    if (!pensandoHasta) { pensandoHasta = Date.now() + 200 + Math.random() * 800; return; }
    if (Date.now() < pensandoHasta) return;
    pensandoHasta = 0;
    const jugadas = b.game.allLegalMoves(s);
    if (!jugadas.length) return;
    const m = jugadas[Math.floor(Math.random() * jugadas.length)];
    b._applyMove(m.from, m.to, "q");
  }, 30);
})();
`;

async function ronda(browser, nombre, PARTIDAS, red, limites, variantes) {
  variantes = variantes || ["estandar"];
  console.log("\n▶ " + nombre + " — " + PARTIDAS + " partidas a la vez (" + PARTIDAS * 2 + " pestañas)" + (variantes.length > 1 ? ": " + variantes.join(", ") : ""));
  const srv = crearServidor(red);
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 900 } });
  await ctx.exposeBinding("__srv", (fuente, pedido) => srv.atender(fuente.page, pedido));
  await ctx.addInitScript(() => {
    try { localStorage.setItem("oscarMoveHelpShown_v1", "1"); } catch (e) {}
  });

  const pestañas = [];
  const errores = [];
  for (let g = 0; g < PARTIDAS; g++) {
    const id = "sala-" + g;
    const variante = variantes[g % variantes.length];
    srv.agregar("game_rooms", srv.sala(id, "u-b" + g, "u-n" + g, variante));
    for (const [usuario, color] of [["u-b" + g, "w"], ["u-n" + g, "b"]]) {
      const page = await ctx.newPage();
      const pagina = id + "-" + variante + "-" + color;
      await page.addInitScript(doble(usuario, pagina));
      await page.addInitScript(JUGADOR);
      page.on("pageerror", (e) => errores.push(pagina + ": " + String(e)));
      if (process.env.DEPURAR) page.on("console", (m) => { if (m.text().startsWith("DBG")) console.log("    " + variante + " " + Date.now() % 100000 + " " + m.text()); });
      pestañas.push({ page, salaId: id, color, pagina, variante });
    }
  }
  // Se abren de a diez: cien a la vez ahogan el servidor de archivos de prueba,
  // no la sala.
  for (let i = 0; i < pestañas.length; i += 10) {
    await Promise.all(pestañas.slice(i, i + 10).map((p) => p.page.goto(BASE + "/" + MODALIDADES[p.variante].pagina + "?room=" + p.salaId, { waitUntil: "load" })));
  }

  if (process.env.DEPURAR) console.log("    pestañas abiertas");
  // Se juega hasta que todas lleguen al tope (o terminen), con un tope de tiempo.
  const inicio = Date.now();
  const TOPE_MS = limites.topeMs;
  const terminada = (f) => f.status !== "playing" || f.moves.length >= JUGADAS;
  while (Date.now() - inicio < TOPE_MS) {
    if ([...srv.salas.values()].every(terminada)) break;
    if (process.env.DEPURAR) console.log("    " + [...srv.salas.values()].map((f) => f.moves.length + (f.white_ready ? "B" : "") + (f.black_ready ? "N" : "")).join(" "));
    await esperar(1000);
  }
  const trabadas = [...srv.salas.values()].filter((f) => !terminada(f));
  // Un rato de calma para que lo último que esté viajando llegue.
  await esperar(limites.calmaMs);

  // ---------------- lo que se ve en cada pestaña contra lo que hay en la base
  const desfasadas = [];
  for (const p of pestañas) {
    const enBase = srv.salas.get(p.salaId);
    let visto = null;
    try {
      if (!p.page.url().includes("room=" + p.salaId)) throw new Error("la pestaña se fue a " + p.page.url());
      visto = await p.page.evaluate(() => ({ fen: window.__motor(board).pos(), sala: String((room.cartas_state && room.cartas_state.fen) || room.fen), jugadas: (room.moves || []).length, estado: room.status, lista: document.querySelectorAll("#moves-list li").length }));
    } catch (e) { visto = { error: String(e) }; }
    // Niebla no muestra la lista de jugadas mientras se juega (levantaría la niebla).
    const conLista = !(p.variante === "niebla" && enBase.status === "playing");
    if (!visto || visto.fen !== posDe(enBase) || visto.sala !== posDe(enBase) || visto.jugadas !== enBase.moves.length || visto.estado !== enBase.status ||
        (conLista && visto.lista !== Math.ceil(enBase.moves.length / 2))) {
      desfasadas.push({ pestaña: p.pagina, visto, base: { fen: posDe(enBase), jugadas: enBase.moves.length, estado: enBase.status } });
    }
  }

  // ---------------- con los dos en la sala, nadie ve «Tu rival se desconectó»
  const avisosDeMas = [];
  for (const p of pestañas) {
    try {
      if (await p.page.evaluate(() => { const c = document.getElementById("rival-ausente"); return !!c && c.checkVisibility(); })) avisosDeMas.push(p.pagina);
    } catch (e) { /* pestaña cerrada */ }
  }

  // ---------------- la lista de jugadas lleva a la posición guardada
  const rotas = [];
  for (const f of srv.salas.values()) {
    // Con chess.js se rejuegan las de ajedrez de siempre; las demás tienen su
    // motor y su planilla (la guarda de la posición las cuida igual).
    if (f.variant !== "estandar" && f.variant !== "niebla") continue;
    const ch = new Chess();
    const todas = f.moves.every((san) => ch.move(san));
    const pos = (x) => String(x).split(" ").slice(0, 4).join(" ");
    if (!todas || pos(ch.fen()) !== pos(f.fen)) {
      rotas.push(f.id);
      if (process.env.DEPURAR) console.log("    rota " + f.id + ": " + f.moves.join(" ") + " | " + f.fen + " | historia: " + (srv.historia.get(f.id) || []).map((h) => h.n + h.quien.slice(2, 3) + ":" + h.ult).join(" "));
    }
  }

  const demoras = srv.vistas.map((v) => v.demora).sort((a, b) => a - b);
  const pct = (q) => demoras.length ? demoras[Math.min(demoras.length - 1, Math.floor(q * demoras.length))] : 0;
  const totalJugadas = [...srv.salas.values()].reduce((a, f) => a + f.moves.length, 0);
  const sinVer = [...srv.confirmadas.values()].reduce((a, l) => a + l.filter((x) => !x.vistos.size).length, 0);
  console.log("    " + totalJugadas + " jugadas en " + Math.round((Date.now() - inicio) / 1000) + " s · vistas del otro lado: mediana " +
    pct(0.5) + " ms, 99 % " + pct(0.99) + " ms, la más lenta " + (demoras[demoras.length - 1] || 0) + " ms");
  if (process.env.DEPURAR) srv.vistas.filter((v) => v.demora > 800).forEach((v) => console.log("    lenta:", JSON.stringify(v)));
  const atr = srv.atrasos.slice().sort((a, b) => a - b);
  console.log("    canal rápido: " + srv.rapidas.enviadas + " jugadas avisadas, " + srv.rapidas.recibidas + " avisos entregados" + (process.env.SIN_RAPIDA ? " (SIN_RAPIDA: canal cerrado)" : "") +
    " · pre-jugadas: " + srv.rapidas.premovidas + " jugadas solas, " + srv.rapidas.premovidasDescartadas + " descartadas (ya no eran legales)" +
    (srv.rechazos.length ? " · " + srv.rechazos.length + " escrituras rechazadas" : ""));
  console.log("    (la computadora de la prueba atrasaba los relojes de cada pestaña: mediana " + (atr[Math.floor(atr.length / 2)] || 0) +
    " ms, la peor " + (atr[atr.length - 1] || 0) + " ms)");

  ok("ninguna partida se trabó (todas llegaron a " + JUGADAS + " medias jugadas o terminaron)", !trabadas.length,
    trabadas.slice(0, 5).map((f) => f.id + " en " + f.moves.length));
  ok("cada jugada guardada la vio el rival", sinVer === 0, sinVer + " sin ver");
  ok("la jugada del rival se ve en menos de " + limites.maxMs + " ms (todas)", (demoras[demoras.length - 1] || 0) < limites.maxMs, demoras.slice(-5));
  if (limites.medianaMs) ok("la mediana es de menos de " + limites.medianaMs + " ms", pct(0.5) < limites.medianaMs, pct(0.5));
  ok("al final cada pestaña muestra lo mismo que la base (tablero, sala, lista de jugadas, estado)", !desfasadas.length, desfasadas.slice(0, 3));
  ok("la lista de jugadas guardada lleva a la posición guardada en todas las partidas", !rotas.length, rotas.slice(0, 5));
  ok("sin errores de JavaScript en las salas", !errores.length, errores.slice(0, 3));
  ok("cada pestaña le avisó a la base que seguía ahí (latido_de_partida)", srv.latidos.size === pestañas.length, srv.latidos.size + " de " + pestañas.length);
  ok("con los dos en la sala, nadie ve «Tu rival se desconectó»", !avisosDeMas.length, avisosDeMas.slice(0, 5));
  // Lo que mide cada pantalla y le manda a la base (ver «Cómo andan las
  // partidas en línea»): con 40 medias jugadas, cada una vio 20 del rival.
  const medidas = [...srv.mediciones.values()];
  const medianas = medidas.map((m) => m.mediana_ms).sort((a, b) => a - b);
  if (medidas.length) console.log("    lo que midieron las pantallas: " + medidas.length + " de " + pestañas.length + ", la mitad de las medianas por debajo de " + medianas[Math.floor(medianas.length / 2)] + " ms, la peor demora " + Math.max(...medidas.map((m) => m.max_ms)) + " ms");
  ok("la mayoría de las pantallas mandó lo que midió", medidas.length >= pestañas.length * 0.8, medidas.length + " de " + pestañas.length);
  ok("y lo que mandó tiene sentido (demoras de 0 al tope de la ronda)", medidas.every((m) => m.jugadas > 0 && m.mediana_ms >= 0 && m.mediana_ms <= m.p95_ms && m.p95_ms <= m.max_ms && m.max_ms < limites.maxMs), medidas.slice(0, 3));
  if (!process.env.SIN_PREMOVIDAS) ok("las pre-jugadas salieron solas al llegar el turno", srv.rapidas.premovidas > 0, srv.rapidas);
  // El retraso que devuelve el navegador (ver «El retraso de la red no se
  // cobra en el reloj»): nunca más de lo que la base deja pasar.
  const dev = srv.devueltos.slice().sort((a, b) => a - b);
  if (dev.length) console.log("    reloj de quien mueve, por encima de lo que dice la base: mediana " + dev[Math.floor(dev.length / 2)] + " ms, el máximo " + dev[dev.length - 1] + " ms");
  const lentas = srv.recortes.filter((x) => x.lenta).length;
  if (lentas) console.log("    " + lentas + " reloj(es) recortados por la base tras una escritura que tardó más de 0,8 s en llegar (la jugada se guardó igual)");
  ok("ningún reloj que llegó a tiempo a la base hubo que recortarlo", !srv.recortes.some((x) => !x.lenta), srv.recortes.filter((x) => !x.lenta).length);
  // Cada modalidad tiene que poder rehacer con su motor la jugada que llega por
  // el canal rápido: si no, todas llegarían por la base y nada saltaría.
  if (!process.env.SIN_RAPIDA) {
    const porModalidad = {};
    for (const f of srv.salas.values()) {
      const x = porModalidad[f.variant] || (porModalidad[f.variant] = { provisionales: 0, jugadas: 0 });
      x.provisionales += srv.provisionales.get(f.id) || 0;
      x.jugadas += f.moves.length;
    }
    const sinRapida = Object.keys(porModalidad).filter((v) => porModalidad[v].jugadas >= 10 && porModalidad[v].provisionales === 0);
    if (Object.keys(porModalidad).length > 1) console.log("    pintadas como provisionales: " + Object.keys(porModalidad).map((v) => v + " " + porModalidad[v].provisionales + "/" + porModalidad[v].jugadas).join(", "));
    ok("en cada modalidad, la jugada del rival llega también por el canal rápido", !sinRapida.length, sinRapida);
  }

  srv.cerrar();
  await ctx.close();
}

/* El abandono: la jugada ABANDONA de cada partida se avisa por el canal rápido
   pero la base no la guarda, y quien la hizo ya no mueve más. Del otro lado se
   pintó como provisional; en unos segundos tiene que volver a lo que dice la
   base. (Con la red mala esto casi nunca se ve: la jugada siguiente de quien
   movió lo arregla sola.) */
const ABANDONA = 7;
async function rondaAbandono(browser, nombre, PARTIDAS) {
  console.log("\n▶ " + nombre + " — " + PARTIDAS + " partidas");
  const srv = crearServidor({ perdidos: 0, tarde: 0, lentas: 0, cortes: 0, abandonaEn: ABANDONA });
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 900 } });
  await ctx.exposeBinding("__srv", (fuente, pedido) => srv.atender(fuente.page, pedido));
  const pestañas = [];
  for (let g = 0; g < PARTIDAS; g++) {
    const id = "sala-" + g;
    srv.agregar("game_rooms", srv.sala(id, "u-b" + g, "u-n" + g));
    for (const [usuario, color] of [["u-b" + g, "w"], ["u-n" + g, "b"]]) {
      const page = await ctx.newPage();
      await page.addInitScript(doble(usuario, id + "-" + color));
      // Nadie mueve después de la jugada abandonada: ni quien la hizo ni el
      // rival, que se queda pensando frente a ella. Solo la espera de lo
      // provisional la puede deshacer.
      await page.addInitScript((tope) => { window.__tope = tope; }, ABANDONA);
      await page.addInitScript(JUGADOR);
      pestañas.push({ page, salaId: id, color });
    }
  }
  await Promise.all(pestañas.map((p) => p.page.goto(BASE + "/estandar.html?room=" + p.salaId, { waitUntil: "load" })));
  const inicio = Date.now();
  while (Date.now() - inicio < 60000 && srv.rechazos.filter((x) => x === "abandono").length < PARTIDAS) await esperar(500);
  await esperar(7000); // 4 s de espera de lo provisional, más la relectura
  const colgadas = [];
  for (const p of pestañas) {
    const enBase = srv.salas.get(p.salaId);
    const visto = await p.page.evaluate(() => ({ fen: board.game.fen(), sala: room.fen, provisional: !!room._provisional }));
    if (visto.fen !== enBase.fen || visto.sala !== enBase.fen || visto.provisional) colgadas.push({ sala: p.salaId, color: p.color, visto, base: enBase.fen });
  }
  ok("las " + PARTIDAS + " jugadas abandonadas no se guardaron", srv.rechazos.filter((x) => x === "abandono").length === PARTIDAS);
  ok("del otro lado, la jugada provisional que la base no guardó desapareció sola", !colgadas.length, colgadas.slice(0, 3));
  srv.cerrar();
  await ctx.close();
}

/* Ajedrez para 4: MESAS4 partidas, cuatro pestañas cada una. */
/* 8. El rival que se va (ver «El rival que se va»): una partida por
   modalidad; a media partida se cierra la pestaña de las negras. Las blancas
   tienen que ver «Tu rival se desconectó», no poder reclamar antes de tiempo
   (lo rechaza la base, no la pantalla) y, pasado el plazo, reclamar la
   victoria con el botón y ver la partida terminada. Los segundos de la base
   van acortados (el doble los dice, como la base de verdad: la pantalla
   solo los recibe). */
async function rondaAusente(browser, nombre, variantes) {
  console.log("\n▶ " + nombre + " — " + variantes.length + " partidas: " + variantes.join(", "));
  const srv = crearServidor({ perdidos: 0, tarde: 0, lentas: 0, cortes: 0, ausencia: { latido_s: 1, aviso_s: 2, reclamar_s: 5 } });
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 900 } });
  await ctx.exposeBinding("__srv", (fuente, pedido) => srv.atender(fuente.page, pedido));
  await ctx.addInitScript(() => { try { localStorage.setItem("oscarMoveHelpShown_v1", "1"); } catch (e) {} });
  const errores = [];
  const mesas = [];
  for (let g = 0; g < variantes.length; g++) {
    const id = "ausente-" + g, variante = variantes[g];
    srv.agregar("game_rooms", srv.sala(id, "u-b" + g, "u-n" + g, variante));
    const mesa = { id, variante };
    for (const [usuario, color] of [["u-b" + g, "w"], ["u-n" + g, "b"]]) {
      const page = await ctx.newPage();
      await page.addInitScript(doble(usuario, id + "-" + color));
      await page.addInitScript(JUGADOR);
      page.on("pageerror", (e) => errores.push(id + "-" + color + ": " + String(e)));
      mesa[color] = page;
    }
    mesas.push(mesa);
  }
  await Promise.all(mesas.flatMap((m) => ["w", "b"].map((c) => m[c].goto(BASE + "/" + MODALIDADES[m.variante].pagina + "?room=" + m.id, { waitUntil: "load" }))));
  // Que se jueguen unas jugadas con los dos en la sala.
  const inicio = Date.now();
  while (Date.now() - inicio < 30000 && mesas.some((m) => (srv.salas.get(m.id).moves || []).length < 4)) await esperar(500);
  const visible = (page) => page.evaluate(() => { const c = document.getElementById("rival-ausente"); return !!c && c.checkVisibility(); });
  const conAviso = [];
  for (const m of mesas) if (await visible(m.w) || await visible(m.b)) conAviso.push(m.id);
  ok("con los dos en la sala, nadie ve el aviso", !conAviso.length, conAviso);

  // Las negras se van.
  for (const m of mesas) await m.b.close();
  const temprano = [];
  for (const m of mesas) {
    const r = await m.w.evaluate((id) => sb.rpc("reclamar_por_abandono", { p_room_id: id, p_tablas: false }), m.id);
    if (!r.error) temprano.push(m.id);
  }
  ok("reclamar enseguida lo rechaza la base", !temprano.length, temprano);

  const sinBoton = [];
  for (const m of mesas) {
    try {
      await m.w.waitForSelector("#rival-ausente button:has-text('Reclamar la victoria')", { state: "visible", timeout: 20000 });
    } catch (e) { sinBoton.push(m.id); }
  }
  ok("a las blancas les llega «Tu rival se desconectó» y, pasado el plazo, el botón", !sinBoton.length, sinBoton);
  const texto = await mesas[0].w.textContent("#rival-ausente");
  ok("el aviso dice cuánto hace", /Tu rival se desconectó hace \d+ s/.test(texto), texto);
  // CAPTURA=archivo.png guarda cómo se ve, para mirarlo.
  if (process.env.CAPTURA) await (await mesas[0].w.$("#rival-ausente")).screenshot({ path: process.env.CAPTURA });

  for (const m of mesas) {
    if (sinBoton.includes(m.id)) continue;
    await m.w.click("#rival-ausente button:has-text('Reclamar la victoria')");
    await m.w.click("dialog[open] button:has-text('Reclamar la victoria')");
  }
  const fin = Date.now();
  while (Date.now() - fin < 15000 && mesas.some((m) => srv.salas.get(m.id).status !== "finished")) await esperar(300);
  const mal = mesas.filter((m) => { const f = srv.salas.get(m.id); return f.status !== "finished" || f.result !== "white"; }).map((m) => m.id);
  ok("cada reclamo terminó la partida con la victoria de quien se quedó", !mal.length, mal);
  await esperar(1500);
  const pantallas = [];
  for (const m of mesas) {
    const v = await m.w.evaluate(() => ({ estado: room.status, aviso: (() => { const c = document.getElementById("rival-ausente"); return !!c && c.checkVisibility(); })() }));
    if (v.estado !== "finished" || v.aviso) pantallas.push({ id: m.id, v });
  }
  ok("y en su pantalla la partida terminó y el aviso se fue", !pantallas.length, pantallas);
  ok("sin errores de JavaScript en las salas", !errores.length, errores.slice(0, 3));
  await ctx.close();
}

async function ronda4(browser, nombre, MESAS, red, limites) {
  console.log("\n▶ " + nombre + " — " + MESAS + " partidas de 4 a la vez (" + MESAS * 4 + " pestañas)");
  const srv = crearServidor(red);
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 900 } });
  await ctx.exposeBinding("__srv", (fuente, pedido) => srv.atender(fuente.page, pedido));
  const pestañas = [];
  const errores = [];
  for (let g = 0; g < MESAS; g++) {
    const id = "mesa4-" + g;
    const ids = ASIENTOS.map((a) => "u-" + a + g);
    srv.agregar("fourplayer_games", srv.mesa4(id, ids));
    for (let i = 0; i < 4; i++) {
      const page = await ctx.newPage();
      const pagina = id + "-" + ASIENTOS[i];
      await page.addInitScript(doble(ids[i], pagina));
      await page.addInitScript(JUGADOR4);
      page.on("pageerror", (e) => errores.push(pagina + ": " + String(e)));
      pestañas.push({ page, salaId: id, asiento: ASIENTOS[i], pagina });
    }
  }
  for (let i = 0; i < pestañas.length; i += 8) {
    await Promise.all(pestañas.slice(i, i + 8).map((p) => p.page.goto(BASE + "/cuatro-jugadores.html?room=" + p.salaId, { waitUntil: "load" })));
  }

  const inicio = Date.now();
  const terminada = (f) => f.status !== "playing" || f.moves.length >= JUGADAS;
  while (Date.now() - inicio < limites.topeMs) {
    if ([...srv.salas.values()].every(terminada)) break;
    if (process.env.DEPURAR) console.log("    " + [...srv.salas.values()].map((f) => f.moves.length + ":" + ASIENTOS.filter((a) => f.seats[a].ready).length).join(" "));
    await esperar(1000);
  }
  const sinArrancar = [...srv.salas.values()].filter((f) => !ASIENTOS.every((a) => f.seats[a].ready));
  const trabadas = [...srv.salas.values()].filter((f) => !terminada(f));
  await esperar(limites.calmaMs);

  const desfasadas = [];
  for (const p of pestañas) {
    const enBase = srv.salas.get(p.salaId);
    let visto = null;
    try {
      if (!p.page.url().includes("room=" + p.salaId)) throw new Error("la pestaña se fue a " + p.page.url());
      visto = await p.page.evaluate(() => ({ tablero: board.game.moves.length, turno: board.game.turn, sala: (room.moves || []).length, estado: room.status, lista: document.querySelectorAll("#moves-list li").length }));
    } catch (e) { visto = { error: String(e) }; }
    if (!visto || visto.tablero !== enBase.moves.length || visto.sala !== enBase.moves.length || visto.turno !== enBase.turn ||
        visto.estado !== enBase.status || visto.lista !== enBase.moves.length) {
      desfasadas.push({ pestaña: p.pagina, visto, base: { jugadas: enBase.moves.length, turno: enBase.turn, estado: enBase.status } });
    }
  }
  // La lista de jugadas de la columna es la del tablero guardado: ninguna se pisó.
  const rotas = [...srv.salas.values()].filter((f) => JSON.stringify(f.moves) !== JSON.stringify(f.board.moves) || f.turn !== f.board.turn).map((f) => f.id);

  const demoras = srv.vistas.map((v) => v.demora).sort((a, b) => a - b);
  const pct = (q) => demoras.length ? demoras[Math.min(demoras.length - 1, Math.floor(q * demoras.length))] : 0;
  const total = [...srv.salas.values()].reduce((a, f) => a + f.moves.length, 0);
  const sinVer = [...srv.confirmadas.values()].reduce((a, l) => a + l.reduce((b, x) => b + (x.necesita - x.vistos.size), 0), 0);
  console.log("    " + total + " jugadas en " + Math.round((Date.now() - inicio) / 1000) + " s · vistas por los otros tres: mediana " +
    pct(0.5) + " ms, 99 % " + pct(0.99) + " ms, la más lenta " + (demoras[demoras.length - 1] || 0) + " ms");

  ok("todas arrancaron: los cuatro «Estoy listo» quedaron guardados aunque se tocaron casi a la vez", !sinArrancar.length,
    sinArrancar.slice(0, 5).map((f) => f.id + ": " + ASIENTOS.filter((a) => f.seats[a].ready).join(",")));
  ok("ninguna partida se trabó (todas llegaron a " + JUGADAS + " jugadas o terminaron)", !trabadas.length, trabadas.slice(0, 5).map((f) => f.id + " en " + f.moves.length));
  ok("cada jugada guardada la vieron los otros tres", sinVer === 0, sinVer + " sin ver");
  ok("la jugada se ve en menos de " + limites.maxMs + " ms (todas)", (demoras[demoras.length - 1] || 0) < limites.maxMs, demoras.slice(-5));
  if (limites.medianaMs) ok("la mediana es de menos de " + limites.medianaMs + " ms", pct(0.5) < limites.medianaMs, pct(0.5));
  ok("al final cada pestaña muestra lo mismo que la base (tablero, turno, lista de jugadas, estado)", !desfasadas.length, desfasadas.slice(0, 3));
  ok("la lista de jugadas guardada es la del tablero guardado en todas las partidas", !rotas.length, rotas.slice(0, 5));
  ok("sin errores de JavaScript en las salas", !errores.length, errores.slice(0, 3));

  srv.cerrar();
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  try {
    // RONDAS=1,3bis corre solo esas (para buscar un caso raro sin esperar a las demás).
    // Sin RONDAS corren todas menos la 6 y la 7, las de las demás modalidades:
    // esas las corre verificar-partidas-modalidades.js, porque todas juntas
    // pasan de los 10 minutos que verificar-todo le da a cada verificador.
    const toca = (n) => (process.env.RONDAS ? process.env.RONDAS.split(",").includes(n) : n !== "6" && n !== "7");
    if (!process.env.SOLO_CUATRO) {
    if (toca("1")) await ronda(browser, "1. Al instante: red sana", PARTIDAS_RAPIDAS, { perdidos: 0, tarde: 0, lentas: 0, cortes: 0 },
      { topeMs: 4 * 60 * 1000, calmaMs: 3000, maxMs: 1000, medianaMs: 300 });
    // Con 100 pestañas en una sola computadora, lo que se mide en milisegundos
    // es sobre todo la computadora (cada alumno tiene su propio aparato): acá
    // lo que se exige es que nada se pierda ni se trabe, con un tope holgado.
    if (toca("2")) await ronda(browser, "2. Muchas a la vez: red sana", PARTIDAS, { perdidos: 0, tarde: 0, lentas: 0, cortes: 0 },
      { topeMs: 6 * 60 * 1000, calmaMs: 3000, maxMs: 6000 });
    if (toca("3")) await ronda(browser, "3. Muchas a la vez: red mala (avisos perdidos, desordenados, canales que se caen, respuestas lentas)", PARTIDAS,
      { perdidos: 0.15, tarde: 0.10, lentas: 0.10, cortes: 0.01, rechazadas: 0.03 },
      { topeMs: 8 * 60 * 1000, calmaMs: 10000, maxMs: 15000 });
    if (!process.env.SIN_RAPIDA && toca("3bis")) await rondaAbandono(browser, "3 bis. Una jugada avisada que la base no guarda, y quien la hizo se va", PARTIDAS_RAPIDAS);
    // Las demás modalidades con turno (dos partidas de cada una): el canal rápido
    // y las pre-jugadas, cada una con su motor.
    // SOLO_MODALIDADES=cartas,niebla para mirar unas pocas.
    const OTRAS = Object.keys(MODALIDADES).filter((v) => v !== "estandar" && (!process.env.SOLO_MODALIDADES || process.env.SOLO_MODALIDADES.split(",").includes(v)));
    if (toca("6")) await ronda(browser, "6. Las demás modalidades: red sana", OTRAS.length * 2, { perdidos: 0, tarde: 0, lentas: 0, cortes: 0 },
      { topeMs: 4 * 60 * 1000, calmaMs: 3000, maxMs: 6000 }, OTRAS);
    if (toca("7")) await ronda(browser, "7. Las demás modalidades: red mala", OTRAS.length * 2,
      { perdidos: 0.15, tarde: 0.10, lentas: 0.10, cortes: 0.01, rechazadas: 0.03 },
      { topeMs: 6 * 60 * 1000, calmaMs: 10000, maxMs: 15000 }, OTRAS);
    if (toca("8")) await rondaAusente(browser, "8. El rival se va", ["estandar"].concat(OTRAS));
    }
    if (!process.env.SIN_CUATRO) {
      if (toca("4")) await ronda4(browser, "4. Ajedrez para 4: red sana", MESAS4, { perdidos: 0, tarde: 0, lentas: 0, cortes: 0 },
        { topeMs: 4 * 60 * 1000, calmaMs: 3000, maxMs: 6000 });
      if (toca("5")) await ronda4(browser, "5. Ajedrez para 4: red mala", MESAS4, { perdidos: 0.15, tarde: 0.10, lentas: 0.10, cortes: 0.01 },
        { topeMs: 6 * 60 * 1000, calmaMs: 10000, maxMs: 15000 });
    }
  } finally {
    await browser.close();
  }
  if (fallos) { console.log("\n" + fallos + " comprobación(es) fallaron."); process.exit(1); }
  console.log("\nTodo bien: " + PARTIDAS + " partidas a la vez, sin jugadas perdidas.");
})().catch((e) => { console.error(e); process.exit(1); });
