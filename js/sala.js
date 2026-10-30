/* sala.html: la sala de arena para los estudiantes.

   Es una sala APARTE de la Academia: entra quien tiene un usuario y una clave de
   la sala (los da administración desde sala-admin.html), contra el proyecto
   «Base de Colegios», con su propio cliente (`window.sbSala`, js/sala-cliente.js).

   QUIÉN DECIDE QUÉ. La base lleva el emparejamiento, de quién es el turno, el
   reloj de cada quien (con SU hora, js/reloj-servidor.js), la bandera y los
   puntos; esta página solo pide y pinta. La legalidad de la jugada y el mate los
   calcula chess.js acá y viajan con la jugada: es el mismo modelo de confianza
   de las partidas de la Academia, dicho en la migración de `arena_*`.

   LAS JUGADAS LLEGAN SIEMPRE. Realtime avisa de cada cambio de la partida, y
   además se vuelve a leer cada pocos segundos: un aviso perdido no deja a nadie
   mirando una posición vieja. Lo que llega más viejo que lo que ya se pintó se
   descarta (una jugada menos, o una partida que ya terminó), y mientras la
   jugada propia viaja se ignora lo que llegue igual de viejo, para que el
   tablero no salte hacia atrás y vuelva.

   Todo texto de una persona (nombres, equipos) entra por `textContent`. */
(function () {
  "use strict";

  const sb = window.sbSala;
  const $ = (id) => document.getElementById(id);

  const LATIDO_MS = 3000;        // «sigo esperando rival»
  const CLASIFICACION_MS = 5000;
  const RELEER_MS = 2500;
  const TIC_MS = 250;
  const PRIMERA_JUGADA_MS = 30000;
  const JUGADORES_VISIBLES = 15;
  const VISTAS = ["entrada", "lobby", "arena", "partida"];

  const S = {
    yo: null,            // { id, nombre, equipo_id }
    equipos: {},         // id → nombre
    torneos: [],
    torneo: null,
    partida: null,       // la fila de arena_partidas que se está jugando
    juego: null,         // chess.js con la posición de esa fila
    color: "w",
    rival: null,
    seleccionada: null,
    enviando: false,
    buscando: false,
    latiendo: false,
    leyendo: false,
    verTodos: false,
    ultimaBandera: 0,
    canal: null,
    coordenadas: false,
    t: {},               // los temporizadores
  };

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  /* ------------------------------------------------------------- pantallas */

  function mostrar(nombre, enfocar) {
    $("cargando").hidden = true;
    VISTAS.forEach((v) => { $("vista-" + v).hidden = v !== nombre; });
    if (enfocar) { const h = $("h-" + nombre); if (h) h.focus({ preventScroll: false }); }
  }

  function mmss(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const dos = (n) => String(n).padStart(2, "0");
    return h ? h + ":" + dos(m) + ":" + dos(r) : m + ":" + dos(r);
  }

  function ritmoTexto(t) {
    const m = t.inicial_seg / 60;
    return (Number.isInteger(m) ? m : t.inicial_seg + " s") + "+" + t.incremento_seg;
  }

  function estadoDe(t) {
    const ahora = RelojServidor.ahora();
    const ini = Date.parse(t.inicia), fin = ini + t.minutos * 60000;
    return ahora < ini ? "proxima" : ahora < fin ? "en_curso" : "terminada";
  }

  /* ---------------------------------------------------------------- sesión */

  async function cargarYo(user) {
    const { data, error } = await sb.from("arena_jugadores").select("id,nombre,equipo_id").eq("id", user.id).maybeSingle();
    if (error || !data) return false;
    S.yo = data;
    const eq = await sb.from("arena_equipos").select("id,nombre");
    S.equipos = {};
    ((eq && eq.data) || []).forEach((e) => { S.equipos[e.id] = e.nombre; });
    return true;
  }

  function errorEntrada(texto) {
    const p = $("error-entrada");
    p.textContent = texto || "";
    p.hidden = !texto;
  }

  async function entrar(ev) {
    ev.preventDefault();
    const usuario = $("usuario").value.trim();
    const clave = $("clave").value;
    if (!usuario || !clave) { errorEntrada("Escribe tu usuario y tu clave."); return; }
    const boton = $("boton-entrar");
    boton.disabled = true;
    errorEntrada("");
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: window.SALA.correoDe(usuario), password: clave });
      if (error || !data || !data.session) { errorEntrada("Usuario o clave incorrectos."); return; }
      if (!(await cargarYo(data.session.user))) {
        await sb.auth.signOut();
        errorEntrada("Esa cuenta no es de la sala. Pídele a tu profe tu usuario y tu clave.");
        return;
      }
      $("clave").value = "";
      await alLobby(true);
    } catch (e) {
      errorEntrada("No se pudo entrar. Revisa tu conexión e intenta otra vez.");
    } finally {
      boton.disabled = false;
    }
  }

  function limpiarTodo() {
    detenerBusqueda(false);
    cerrarPartida();
    Object.keys(S.t).forEach((k) => { clearInterval(S.t[k]); delete S.t[k]; });
    S.torneo = null; S.partida = null; S.juego = null; S.yo = null;
  }

  async function salir() {
    if (S.buscando && S.torneo) { try { await sb.rpc("arena_salir", { p_torneo: S.torneo.id }); } catch (e) { /* se va igual */ } }
    limpiarTodo();
    try { await sb.auth.signOut(); } catch (e) { /* la sesión local se borra igual */ }
    $("saludo").textContent = "";
    $("salir").hidden = true;
    mostrar("entrada", true);
  }

  /* ----------------------------------------------------------- las arenas */

  async function alLobby(enfocar) {
    RelojServidor.iniciar(sb);
    $("saludo").textContent = "Hola, " + S.yo.nombre;
    $("salir").hidden = false;
    const mio = S.yo.equipo_id ? S.equipos[S.yo.equipo_id] : "";
    $("lobby-equipo").textContent = mio
      ? "Tu equipo: " + mio + "."
      : "Todavía no estás en un equipo: avísale a tu profe para poder jugar las arenas por equipos.";
    // Si ya había una partida en juego (cerró la pestaña, se le cayó el celular), vuelve a ella.
    if (await buscarPartidaActiva()) return;
    await cargarTorneos();
    mostrar("lobby", enfocar);
    clearInterval(S.t.lobby);
    S.t.lobby = setInterval(() => { if (!$("vista-lobby").hidden) pintarTorneos(); }, 15000);
  }

  async function buscarPartidaActiva() {
    const { data } = await sb.from("arena_partidas").select("*").eq("estado", "en_juego")
      .or("blancas.eq." + S.yo.id + ",negras.eq." + S.yo.id).order("creada_en", { ascending: false }).limit(1);
    if (data && data[0]) { await abrirPartida(data[0]); return true; }
    return false;
  }

  async function cargarTorneos() {
    const { data, error } = await sb.from("arena_torneos").select("*").order("inicia", { ascending: false }).limit(20);
    S.torneos = error ? [] : (data || []);
    pintarTorneos(error ? "No se pudieron cargar las arenas. Vuelve a abrir la página." : "");
  }

  function pintarTorneos(mensaje) {
    const caja = $("lista-torneos");
    caja.textContent = "";
    if (!S.torneos.length) {
      caja.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", mensaje || "Todavía no hay arenas programadas. Tu profe te avisa cuando haya una."));
      return;
    }
    S.torneos.forEach((t) => {
      const estado = estadoDe(t);
      const tarjeta = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 flex flex-wrap items-center justify-between gap-3");
      const info = el("div");
      info.appendChild(el("h2", "font-serif text-lg font-bold text-brand-800 dark:text-white", t.nombre));
      info.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300",
        HoraCR.fechaHora(t.inicia, { dateStyle: "medium", timeStyle: "short" }) + " · " + t.minutos + " min · " + ritmoTexto(t)
        + (t.por_equipos ? " · por equipos" : " · individual")));
      info.appendChild(el("p", "text-sm font-semibold " + (estado === "en_curso" ? "text-green-700 dark:text-green-400" : "text-brand-600 dark:text-brand-200"),
        estado === "en_curso" ? "En curso ahora" : estado === "proxima" ? "Todavía no empieza" : "Terminó"));
      tarjeta.appendChild(info);
      const b = el("button", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
        estado === "en_curso" ? "Entrar a la arena" : estado === "proxima" ? "Ver la arena" : "Ver resultados");
      b.type = "button";
      b.setAttribute("aria-label", b.textContent + ": " + t.nombre);
      b.addEventListener("click", () => abrirArena(t));
      tarjeta.appendChild(b);
      caja.appendChild(tarjeta);
    });
  }

  function abrirArena(t) {
    detenerBusqueda(true);
    S.torneo = t;
    S.verTodos = false;
    clearInterval(S.t.clasificacion);
    clearInterval(S.t.arena);
    $("h-arena").textContent = t.nombre;
    $("arena-detalle").textContent = t.minutos + " minutos · partidas de " + ritmoTexto(t)
      + (t.por_equipos ? " · por equipos: cuentan los " + t.mejores + " mejores de cada uno" : " · individual");
    $("card-equipos").hidden = !t.por_equipos;
    $("tabla-equipos").textContent = "";
    $("tabla-jugadores").textContent = "";
    $("arena-aviso").textContent = "";
    mostrar("arena", true);
    pintarRelojArena();
    refrescarClasificacion();
    S.t.clasificacion = setInterval(refrescarClasificacion, CLASIFICACION_MS);
    S.t.arena = setInterval(pintarRelojArena, 1000);
  }

  function pintarRelojArena() {
    const t = S.torneo;
    if (!t || $("vista-arena").hidden) return;
    const ahora = RelojServidor.ahora();
    const ini = Date.parse(t.inicia), fin = ini + t.minutos * 60000;
    const estado = estadoDe(t);
    $("arena-reloj").textContent = estado === "proxima" ? "Empieza en " + mmss(ini - ahora)
      : estado === "en_curso" ? "Quedan " + mmss(fin - ahora) : "Terminó";
    if (estado === "terminada" && S.buscando) detenerBusqueda(true);
    pintarBotonJugar();
  }

  function pintarBotonJugar() {
    const b = $("btn-jugar");
    const abierta = S.torneo && estadoDe(S.torneo) === "en_curso";
    b.textContent = S.buscando ? "Pausar" : "Jugar";
    b.disabled = !abierta;
    if (S.buscando) $("arena-aviso").textContent = "Buscando rival… Te emparejamos apenas haya alguien esperando.";
    else if (!abierta) $("arena-aviso").textContent = S.torneo && estadoDe(S.torneo) === "proxima" ? "Todavía no empieza." : "La arena terminó.";
    else if ($("arena-aviso").textContent.indexOf("Buscando") === 0) $("arena-aviso").textContent = "";
  }

  async function refrescarClasificacion() {
    const t = S.torneo;
    if (!t) return;
    const [c, r] = await Promise.all([
      sb.rpc("arena_clasificacion", { p_torneo: t.id }),
      sb.rpc("arena_en_racha", { p_torneo: t.id }),
    ]);
    if (!S.torneo || S.torneo.id !== t.id || c.error || !c.data) return;
    const racha = new Set(((r && r.data) || []).map((x) => (typeof x === "string" ? x : Object.values(x)[0])));
    pintarClasificacion(c.data, racha);
  }

  function celda(texto, clase) { return el("td", "py-1.5 pr-2 " + (clase || ""), texto); }

  function pintarClasificacion(datos, racha) {
    const miEquipo = S.yo.equipo_id;
    const eq = $("tabla-equipos");
    eq.textContent = "";
    (datos.equipos || []).forEach((e, i) => {
      const suyo = e.id === miEquipo;
      const tr = el("tr", "border-b border-brand-50 dark:border-brand-800/60" + (suyo ? " bg-accent-50 dark:bg-brand-800 font-semibold" : ""));
      tr.appendChild(celda(String(i + 1)));
      tr.appendChild(celda(e.nombre + (suyo ? " (tu equipo)" : "")));
      tr.appendChild(celda(String(e.puntos), "text-right tabular-nums"));
      eq.appendChild(tr);
    });
    if (!(datos.equipos || []).length) {
      const tr = el("tr");
      const td = celda("Todavía no hay puntos.", "text-brand-500 dark:text-brand-300");
      td.colSpan = 3;
      tr.appendChild(td);
      eq.appendChild(tr);
    }
    const lista = datos.jugadores || [];
    const visibles = S.verTodos ? lista : lista.slice(0, JUGADORES_VISIBLES);
    const ju = $("tabla-jugadores");
    ju.textContent = "";
    visibles.forEach((j, i) => {
      const yo = j.id === S.yo.id;
      const tr = el("tr", "border-b border-brand-50 dark:border-brand-800/60" + (yo ? " bg-accent-50 dark:bg-brand-800 font-semibold" : ""));
      tr.appendChild(celda(String(i + 1)));
      const nombre = celda(j.nombre + (yo ? " (tú)" : ""));
      if (racha.has(j.id)) {
        nombre.appendChild(el("span", null, " 🔥"));
        nombre.appendChild(el("span", "sr-only", " en racha"));
      }
      tr.appendChild(nombre);
      tr.appendChild(celda(j.equipo || "—", "text-xs"));
      tr.appendChild(celda(String(j.puntos), "text-right tabular-nums"));
      ju.appendChild(tr);
    });
    if (!lista.length) {
      const tr = el("tr");
      const td = celda("Nadie ha jugado todavía.", "text-brand-500 dark:text-brand-300");
      td.colSpan = 4;
      tr.appendChild(td);
      ju.appendChild(tr);
    }
    const mas = $("ver-todos");
    mas.hidden = lista.length <= JUGADORES_VISIBLES;
    mas.textContent = S.verTodos ? "Ver solo los primeros" : "Ver todos los jugadores (" + lista.length + ")";
  }

  /* ----------------------------------------------------- buscar un rival */

  async function buscar() {
    if (S.buscando || !S.torneo) return;
    S.buscando = true;
    pintarBotonJugar();
    await latir();
    if (S.buscando) S.t.latido = setInterval(latir, LATIDO_MS);
  }

  async function latir() {
    if (!S.buscando || S.latiendo || !S.torneo) return;
    S.latiendo = true;
    try {
      const { data, error } = await sb.rpc("arena_entrar", { p_torneo: S.torneo.id });
      if (error) throw error;
      if (!S.buscando) return;
      if (data) {
        detenerBusqueda(false);
        const fila = await leerPartida(data);
        if (fila) await abrirPartida(fila);
      }
    } catch (e) {
      detenerBusqueda(false);
      $("arena-aviso").textContent = (e && e.message) || "No se pudo buscar rival.";
    } finally {
      S.latiendo = false;
    }
  }

  function detenerBusqueda(salirDeLaCola) {
    clearInterval(S.t.latido);
    const estaba = S.buscando;
    S.buscando = false;
    if (salirDeLaCola && estaba && S.torneo) {
      Promise.resolve(sb.rpc("arena_salir", { p_torneo: S.torneo.id })).catch(() => {});
    }
    if (!$("vista-arena").hidden) pintarBotonJugar();
  }

  /* ----------------------------------------------------------- la partida */

  async function leerPartida(id) {
    const { data, error } = await sb.from("arena_partidas").select("*").eq("id", id).maybeSingle();
    return error ? null : data;
  }

  async function datosDeJugador(id) {
    const { data } = await sb.from("arena_jugadores").select("id,nombre,equipo_id").eq("id", id).maybeSingle();
    return data || { id: id, nombre: "Tu rival", equipo_id: null };
  }

  function cerrarPartida() {
    clearInterval(S.t.tic);
    clearInterval(S.t.releer);
    if (S.canal) { try { sb.removeChannel(S.canal); } catch (e) { /* ya estaba cerrado */ } S.canal = null; }
  }

  async function abrirPartida(fila) {
    cerrarPartida();
    clearInterval(S.t.clasificacion);
    clearInterval(S.t.arena);
    clearInterval(S.t.lobby);
    S.partida = null;
    S.enviando = false;
    S.seleccionada = null;
    S.color = fila.blancas === S.yo.id ? "w" : "b";
    S.rival = await datosDeJugador(S.color === "w" ? fila.negras : fila.blancas);
    if (!S.torneo || S.torneo.id !== fila.torneo_id) {
      const t = await sb.from("arena_torneos").select("*").eq("id", fila.torneo_id).maybeSingle();
      S.torneo = (t && t.data) || null;
    }
    $("nombre-yo").textContent = S.yo.nombre + " (tú)";
    $("equipo-yo").textContent = S.yo.equipo_id ? "· " + (S.equipos[S.yo.equipo_id] || "") : "";
    $("nombre-rival").textContent = S.rival.nombre;
    $("equipo-rival").textContent = S.rival.equipo_id ? "· " + (S.equipos[S.rival.equipo_id] || "") : "";
    $("resultado").hidden = true;
    $("oferta").hidden = true;
    $("controles").hidden = false;
    mostrar("partida", true);
    aplicarFila(fila, true);
    // Una partida que ya terminó no necesita reloj ni avisos.
    if (!S.partida || S.partida.estado !== "en_juego") return;
    if (typeof sb.channel === "function") {
      S.canal = sb.channel("sala-partida-" + fila.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "arena_partidas", filter: "id=eq." + fila.id },
          (p) => { if (p && p.new && p.new.id) aplicarFila(p.new); })
        .subscribe();
    }
    S.t.tic = setInterval(tic, TIC_MS);
    S.t.releer = setInterval(releer, RELEER_MS);
  }

  /* Cuán avanzada va una versión de la partida: terminada, y cuántas jugadas. */
  function avance(f) { return [f.estado === "terminada" ? 1 : 0, (f.jugadas || []).length]; }
  function comparar(a, b) { return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]; }

  function reconstruir(fila) {
    const g = new Chess();
    try {
      for (const j of fila.jugadas || []) if (!g.move(j.s)) throw new Error("jugada que no entra");
      if (g.fen() === fila.fen) return g;
    } catch (e) { /* cae a la posición guardada */ }
    return new Chess(fila.fen);
  }

  function aplicarFila(fila, forzar) {
    if (!fila || (S.partida && fila.id !== S.partida.id)) return;
    if (!forzar && S.partida) {
      const c = comparar(avance(fila), avance(S.partida));
      if (c < 0 || (S.enviando && c === 0)) return;
    }
    const previa = S.partida;
    S.partida = fila;
    S.enviando = false;
    S.juego = reconstruir(fila);
    S.seleccionada = null;
    pintarPartida();
    anunciar(previa, fila);
    if (fila.estado === "terminada") finDePartida(previa);
  }

  async function releer() {
    if (!S.partida || S.partida.estado === "terminada" || S.enviando || S.leyendo) return;
    S.leyendo = true;
    try {
      const fila = await leerPartida(S.partida.id);
      if (fila) aplicarFila(fila);
    } finally { S.leyendo = false; }
  }

  /* ------------------------------------------------------------- el reloj */

  function turnoDe(fila) { return String(fila.fen || "").split(" ")[1] === "b" ? "b" : "w"; }

  function usadoMs(fila) { return Math.max(0, RelojServidor.ahora() - Date.parse(fila.reloj_desde)); }

  function relojes(fila) {
    let w = fila.ms_blancas, b = fila.ms_negras;
    if (fila.estado === "en_juego") {
      if (turnoDe(fila) === "w") w -= usadoMs(fila); else b -= usadoMs(fila);
    }
    return { w: Math.max(0, w), b: Math.max(0, b) };
  }

  function pintarRelojes() {
    const p = S.partida;
    if (!p) return;
    const r = relojes(p);
    const enJuego = p.estado === "en_juego";
    const turno = turnoDe(p);
    [["yo", S.color], ["rival", S.color === "w" ? "b" : "w"]].forEach(([quien, color]) => {
      const caja = $("reloj-" + quien);
      const ms = r[color];
      caja.textContent = mmss(ms);
      caja.classList.toggle("corre", enJuego && turno === color);
      caja.classList.toggle("poco", enJuego && ms < 10000);
    });
  }

  /* Cada tic: pinta los relojes y, si a quien tiene el turno se le acabó el
     tiempo, se lo avisa a la base. Ella decide con su hora: si todavía quedaba,
     no hace nada. */
  function tic() {
    const p = S.partida;
    if (!p) return;
    pintarRelojes();
    if (p.estado !== "en_juego" || S.enviando) return;
    const reloj = turnoDe(p) === "w" ? p.ms_blancas : p.ms_negras;
    const limite = (p.jugadas || []).length < 2 ? Math.min(PRIMERA_JUGADA_MS, reloj) : reloj;
    if (limite - usadoMs(p) > 0 || Date.now() - S.ultimaBandera < 2500) return;
    S.ultimaBandera = Date.now();
    Promise.resolve(sb.rpc("arena_bandera", { p_partida: p.id })).then((r) => { if (r && r.data) aplicarFila(r.data); }).catch(() => {});
  }

  /* ------------------------------------------------------------ el tablero */

  const PIEZA = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
  const FEMENINA = { r: true, q: true };
  const LETRA_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  const LETRA_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };

  function sanEs(san) {
    return String(san || "").replace(/^[KQRBN]/, (c) => LETRA_ES[c]).replace(/=([KQRBN])/, (_, c) => "=" + LETRA_ES[c]);
  }

  function etiquetaCasilla(g, sq) {
    const p = g.get(sq);
    if (!p) return sq + ", vacía";
    const blanca = p.color === "w";
    const f = !!FEMENINA[p.type];
    return sq + ", " + PIEZA[p.type] + " " + (blanca ? (f ? "blanca" : "blanco") : (f ? "negra" : "negro"));
  }

  function casillaDelRey(g) {
    const filas = g.board();
    for (let f = 0; f < 8; f++) for (let c = 0; c < 8; c++) {
      const p = filas[f][c];
      if (p && p.type === "k" && p.color === g.turn()) return "abcdefgh"[c] + (8 - f);
    }
    return null;
  }

  function ultimaJugada() {
    const j = S.partida && S.partida.jugadas;
    const u = j && j[j.length - 1];
    return u ? { from: u.f, to: u.t } : null;
  }

  function puedoMover() {
    return !!(S.partida && S.partida.estado === "en_juego" && S.juego && S.juego.turn() === S.color && !S.enviando);
  }

  function pintarTablero() {
    const t = $("tablero");
    const g = S.juego;
    if (!g) return;
    const marcas = {};
    if (g.in_check()) {
      const rey = casillaDelRey(g);
      if (rey) marcas[rey] = { clase: "en-jaque", estado: "en jaque" };
    }
    EjercicioTablero.dibujar(t, { juego: g, orientacion: S.color, seleccionada: S.seleccionada, ultima: ultimaJugada(), marcas: marcas, alTocar: alTocar });
    if (S.seleccionada) EjercicioTablero.marcarDestinos(t, g, S.seleccionada);
    t.querySelectorAll("[data-square]").forEach((b) => {
      const extra = b.dataset.estado ? ", " + b.dataset.estado : "";
      b.setAttribute("aria-label", etiquetaCasilla(g, b.dataset.square) + extra);
    });
    t.classList.toggle("sin-turno", !puedoMover());
    if (window.Coordenadas && !S.coordenadas) { window.Coordenadas.aplicar(t); S.coordenadas = true; }
  }

  function alTocar(sq) {
    if (!puedoMover()) return;
    const g = S.juego;
    const p = g.get(sq);
    if (!S.seleccionada) {
      if (p && p.color === S.color) { S.seleccionada = sq; pintarTablero(); }
      return;
    }
    if (sq === S.seleccionada) { S.seleccionada = null; pintarTablero(); return; }
    if (p && p.color === S.color) { S.seleccionada = sq; pintarTablero(); return; }
    const desde = S.seleccionada;
    if (!g.moves({ square: desde, verbose: true }).some((m) => m.to === sq)) {
      const c = $("tablero").querySelector('[data-square="' + sq + '"]');
      EjercicioTablero.destello(c);
      return;
    }
    EjercicioTablero.jugarCoronando(g, desde, sq, (pieza) => jugar(desde, sq, pieza));
  }

  /* El final de la partida que dejó esta jugada, para que la base la cierre. */
  function finDe(g) {
    if (g.in_checkmate()) return "mate";
    if (g.in_stalemate()) return "ahogado";
    if (g.insufficient_material()) return "material";
    if (g.in_threefold_repetition()) return "repeticion";
    if (g.in_draw()) return "cincuenta";
    return null;
  }

  async function jugar(desde, hasta, pieza) {
    if (!puedoMover()) return;
    const g = S.juego;
    const pedido = { from: desde, to: hasta };
    if (pieza) pedido.promotion = pieza;
    const m = g.move(pedido);
    if (!m) return;
    S.enviando = true;
    S.seleccionada = null;
    const id = S.partida.id;
    pintarTablero();
    pintarTurno();
    try {
      const { data, error } = await sb.rpc("arena_mover", { p_partida: id, p_desde: m.from, p_hasta: m.to, p_san: m.san, p_fen: g.fen(), p_fin: finDe(g) });
      if (error) throw error;
      aplicarFila(data, true);
    } catch (e) {
      S.enviando = false;
      Avisos.avisar("No se pudo enviar la jugada: " + ((e && e.message) || "intenta otra vez."), { tipo: "error" });
      const fila = await leerPartida(id);
      if (fila) aplicarFila(fila, true);
    }
  }

  /* «Cf3», «e4», «O-O»: la jugada escrita, con las letras en español (R rey,
     D dama, T torre, A alfil, C caballo). Si no entra así, se prueba tal cual
     (por si alguien escribe Nf3 o Be2). */
  function entenderJugada(texto) {
    const limpio = texto.replace(/\s+/g, "").replace(/0/g, "O");
    const es = limpio.replace(/^[RDTAC]/, (c) => LETRA_EN[c]).replace(/=([RDTAC])/, (_, c) => "=" + LETRA_EN[c]);
    for (const intento of [es, limpio]) {
      const prueba = new Chess(S.juego.fen());
      const m = prueba.move(intento, { sloppy: true });
      if (m) return m;
    }
    return null;
  }

  function errorJugada(texto) {
    const p = $("jugada-error");
    p.textContent = texto || "";
    p.hidden = !texto;
  }

  function alEscribirJugada(ev) {
    ev.preventDefault();
    const texto = $("jugada").value.trim();
    if (!texto) return;
    errorJugada("");
    if (!puedoMover()) { errorJugada("Todavía no es tu turno."); return; }
    const m = entenderJugada(texto);
    if (!m) { errorJugada("No entiendo esa jugada, o no se puede hacer. Prueba con e4, Cf3 u O-O."); return; }
    $("jugada").value = "";
    jugar(m.from, m.to, m.promotion);
  }

  /* ------------------------------------------------- lo que dice la partida */

  function pintarTurno() {
    const p = S.partida;
    const caja = $("turno");
    if (!p || p.estado === "terminada") { caja.textContent = ""; return; }
    if (S.enviando) { caja.textContent = "Enviando tu jugada…"; return; }
    if (S.juego.turn() === S.color) {
      caja.textContent = (p.jugadas || []).length < 2 ? "Es tu turno: tienes 30 segundos para esta jugada." : "Es tu turno.";
    } else {
      caja.textContent = "Es el turno de " + S.rival.nombre + ".";
    }
  }

  function pintarJugadas() {
    const caja = $("lista-jugadas");
    caja.textContent = "";
    const js = (S.partida && S.partida.jugadas) || [];
    if (!js.length) { caja.textContent = "Todavía no hay jugadas."; return; }
    js.forEach((j, i) => {
      if (i % 2 === 0) caja.appendChild(document.createTextNode((i / 2 + 1) + ". "));
      const s = el("span", i === js.length - 1 ? "ultima" : null, sanEs(j.s));
      caja.appendChild(s);
      caja.appendChild(document.createTextNode(" "));
    });
  }

  function pintarControles() {
    const p = S.partida;
    const enJuego = p.estado === "en_juego";
    $("controles").hidden = !enJuego;
    const ofertaRival = enJuego && p.oferta_tablas && p.oferta_tablas !== S.color;
    $("oferta").hidden = !ofertaRival;
    const t = $("btn-tablas");
    const mia = enJuego && p.oferta_tablas === S.color;
    t.disabled = mia;
    t.textContent = mia ? "Tablas ofrecidas…" : "Ofrecer tablas";
  }

  function pintarPartida() {
    pintarTablero();
    pintarRelojes();
    pintarJugadas();
    pintarTurno();
    pintarControles();
  }

  function anunciar(previa, fila) {
    const antes = previa ? (previa.jugadas || []).length : (fila.jugadas || []).length;
    const ahora = (fila.jugadas || []).length;
    if (ahora > antes) {
      const u = fila.jugadas[ahora - 1];
      const delRival = (ahora % 2 === 1) === (S.color === "b");
      if (delRival) $("anuncio").textContent = S.rival.nombre + " jugó " + sanEs(u.s) + ".";
    }
  }

  const MOTIVO = {
    mate: "por jaque mate",
    ahogado: "por rey ahogado",
    material: "por material insuficiente",
    repeticion: "por repetición de posición",
    cincuenta: "por la regla de las 50 jugadas",
    tiempo: "por tiempo",
    abandono: "por abandono",
    acuerdo: "por acuerdo",
  };

  function finDePartida(previa) {
    const p = S.partida;
    clearInterval(S.t.tic);
    clearInterval(S.t.releer);
    if (S.canal) { try { sb.removeChannel(S.canal); } catch (e) { /* ya estaba cerrado */ } S.canal = null; }
    const mios = S.color === "w" ? p.puntos_blancas : p.puntos_negras;
    let titulo, detalle;
    if (!p.resultado) {
      titulo = "Partida cancelada";
      detalle = "No se llegó a jugar, así que no cuenta para nadie.";
    } else if (p.resultado === "1/2-1/2") {
      titulo = "Tablas";
      detalle = "Empate " + (MOTIVO[p.motivo] || "") + ". ";
    } else {
      const gane = (p.resultado === "1-0") === (S.color === "w");
      titulo = gane ? "¡Ganaste!" : "Perdiste";
      detalle = (gane ? "Ganaste " : "Perdiste ") + (MOTIVO[p.motivo] || "") + ". ";
    }
    if (p.resultado) detalle += mios ? "Sumaste " + mios + (mios === 1 ? " punto." : " puntos.") : "Esta partida no suma puntos.";
    $("resultado-titulo").textContent = titulo;
    $("resultado-detalle").textContent = detalle;
    $("resultado").hidden = false;
    $("controles").hidden = true;
    $("oferta").hidden = true;
    const abierta = S.torneo && estadoDe(S.torneo) === "en_curso";
    $("otra-partida").hidden = !abierta;
    $("anuncio").textContent = titulo + ". " + detalle;
    // Solo se le quita el foco a quien estaba jugando: no a quien abre una partida ya terminada.
    if (previa && previa.estado === "en_juego") $("resultado-titulo").focus();
    pintarTurno();
  }

  /* ---------------------------------------------------- acciones del jugador */

  async function accion(rpc, args) {
    try {
      const { data, error } = await sb.rpc(rpc, args);
      if (error) throw error;
      if (data) aplicarFila(data, true);
    } catch (e) {
      Avisos.avisar((e && e.message) || "No se pudo completar la acción.", { tipo: "error" });
    }
  }

  async function volverAArena() {
    cerrarPartida();
    S.partida = null;
    S.juego = null;
    if (S.torneo) abrirArena(S.torneo);
    else { await cargarTorneos(); mostrar("lobby", true); }
  }

  async function volverAlLobby() {
    detenerBusqueda(true);
    clearInterval(S.t.clasificacion);
    clearInterval(S.t.arena);
    S.torneo = null;
    await alLobby(true);
  }

  /* ---------------------------------------------------------------- arranque */

  function conectar() {
    $("form-entrada").addEventListener("submit", entrar);
    $("salir").addEventListener("click", salir);
    $("volver-lobby").addEventListener("click", volverAlLobby);
    $("btn-jugar").addEventListener("click", () => { if (S.buscando) detenerBusqueda(true); else buscar(); });
    $("ver-todos").addEventListener("click", () => { S.verTodos = !S.verTodos; refrescarClasificacion(); });
    $("form-jugada").addEventListener("submit", alEscribirJugada);
    $("btn-tablas").addEventListener("click", () => { if (S.partida) accion("arena_tablas", { p_partida: S.partida.id }); });
    $("aceptar-tablas").addEventListener("click", () => { if (S.partida) accion("arena_tablas", { p_partida: S.partida.id, p_aceptar: true }); });
    $("rechazar-tablas").addEventListener("click", () => { if (S.partida) accion("arena_tablas", { p_partida: S.partida.id, p_aceptar: false }); });
    $("btn-rendirse").addEventListener("click", async () => {
      if (!S.partida || S.partida.estado !== "en_juego") return;
      const si = await Avisos.confirmar("Esta partida cuenta como perdida.", { titulo: "¿Te rindes?", aceptar: "Sí, me rindo", peligro: true });
      if (si && S.partida) accion("arena_rendirse", { p_partida: S.partida.id });
    });
    $("otra-partida").addEventListener("click", async () => { await volverAArena(); buscar(); });
    $("resultado-volver").addEventListener("click", volverAArena);
    document.addEventListener("visibilitychange", () => {
      // Juego limpio: salir de la pantalla en medio de una partida queda
      // anotado (lo cuenta la base; la pantalla de la arena lo avisa). Si no
      // llega, no se reintenta: es un indicio, no un castigo.
      if (document.visibilityState === "hidden") {
        if (S.partida && S.partida.estado === "en_juego") Promise.resolve(sb.rpc("arena_anotar_salida", { p_partida: S.partida.id })).catch(() => {});
        return;
      }
      if (document.visibilityState !== "visible") return;
      if (S.partida && S.partida.estado === "en_juego") releer();
      if (S.buscando) latir();
    });
    sb.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT" && S.yo) { limpiarTodo(); $("salir").hidden = true; $("saludo").textContent = ""; mostrar("entrada", true); }
    });
  }

  async function arrancar() {
    conectar();
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session && (await cargarYo(data.session.user))) { await alLobby(false); return; }
    } catch (e) { /* sin sesión: se pide entrar */ }
    mostrar("entrada", false);
  }

  arrancar();
})();
