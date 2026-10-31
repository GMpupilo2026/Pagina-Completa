/* sala.html: la sala de arena para los estudiantes.

   Es una sala APARTE de la Academia: entra quien tiene un usuario y una clave de
   la sala (los da administración desde sala-admin.html), contra el proyecto
   «Base de Colegios», con su propio cliente (`window.sbSala`, js/sala-cliente.js).

   QUIÉN DECIDE QUÉ. La base lleva el emparejamiento, de quién es el turno, el
   reloj de cada quien (con SU hora, js/reloj-servidor.js), la bandera y los
   puntos; esta página solo pide y pinta. Las JUGADAS las valida el servidor: acá
   se manda solo de dónde a dónde (y la pieza en que corona) a la Edge Function
   `arena-jugar`, que repite la partida con chess.js, comprueba que sea legal y
   calcula ella el SAN, la posición y si hubo mate o tablas. chess.js acá solo
   sirve para dibujar, mostrar a dónde puede ir cada pieza y entender la jugada
   que se escribe; lo que el navegador diga del final de la partida no cuenta.

   LAS JUGADAS LLEGAN SIEMPRE. Realtime avisa de cada cambio de la partida, y
   además se vuelve a leer cada pocos segundos: un aviso perdido no deja a nadie
   mirando una posición vieja. Lo que llega más viejo que lo que ya se pintó se
   descarta (una jugada menos, o una partida que ya terminó), y mientras la
   jugada propia viaja se ignora lo que llegue igual de viejo, para que el
   tablero no salte hacia atrás y vuelva.

   MIRAR. Cualquiera puede mirar una partida en juego de su arena (la RLS ya
   deja leer las partidas a los jugadores de la sala): es la misma pantalla sin
   controles ni reloj que cante bandera (la canta quien juega).

   SONIDO Y AVISO DE TURNO. Un tono corto al mover, al capturar, al encontrar
   rival y al terminar, y vibración en el celular cuando es tu turno. Si la
   pestaña está escondida, el título de la página avisa. Se apaga con el botón
   del encabezado y se acuerda en el navegador.

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
    espectador: false,   // mirando la partida de otros
    jug: { w: null, b: null },   // los dos jugadores de la partida abierta
    sonido: true,
    titulo: document.title,
    t: {},               // los temporizadores
  };

  try { S.sonido = localStorage.getItem("sala_sonido") !== "0"; } catch (e) { /* sin almacenamiento: queda sí */ }

  /* ---------------------------------------------------------------- sonido */

  const Sonido = (function () {
    let ctx = null;
    function contexto() {
      if (ctx) return ctx;
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      try { ctx = new A(); } catch (e) { ctx = null; }
      return ctx;
    }
    function tono(frecuencia, duracion, inicio) {
      const c = contexto();
      if (!c) return;
      if (c.state === "suspended" && c.resume) c.resume().catch(() => {});
      const o = c.createOscillator(), g = c.createGain();
      const t0 = c.currentTime + inicio;
      o.type = "sine";
      o.frequency.value = frecuencia;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + duracion + 0.02);
    }
    // [frecuencia, duración, cuándo empieza], todo en segundos
    const SONIDOS = {
      mover: [[540, 0.07, 0]],
      captura: [[300, 0.12, 0]],
      turno: [[660, 0.09, 0], [880, 0.14, 0.11]],
      encontrado: [[587, 0.1, 0], [784, 0.2, 0.12]],
      fin: [[523, 0.14, 0], [659, 0.14, 0.15], [784, 0.3, 0.3]],
    };
    function sonar(nombre) {
      if (!S.sonido) return;
      (SONIDOS[nombre] || []).forEach((n) => tono(n[0], n[1], n[2]));
    }
    function vibrar(patron) {
      if (!S.sonido || typeof navigator.vibrate !== "function") return;
      try { navigator.vibrate(patron); } catch (e) { /* no todos los celulares */ }
    }
    return { sonar: sonar, vibrar: vibrar, preparar: contexto };
  })();

  /* Con la pestaña escondida, el título de la página avisa. */
  function avisarEnElTitulo(texto) {
    if (document.hidden) document.title = texto + " — Sala de arena";
  }

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

  /* Cuándo acaba la arena: lo previsto, o antes si administración la cerró. */
  function finDe(t) {
    const previsto = Date.parse(t.inicia) + t.minutos * 60000;
    return t.cerrada_en ? Math.min(previsto, Date.parse(t.cerrada_en)) : previsto;
  }

  function estadoDe(t) {
    const ahora = RelojServidor.ahora();
    return ahora < Date.parse(t.inicia) ? "proxima" : ahora < finDe(t) ? "en_curso" : "terminada";
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
    $("btn-clave").hidden = true;
    $("btn-sonido").hidden = true;
    mostrar("entrada", true);
  }

  /* ----------------------------------------------------------- las arenas */

  async function alLobby(enfocar) {
    RelojServidor.iniciar(sb);
    $("saludo").textContent = "Hola, " + S.yo.nombre;
    $("salir").hidden = false;
    $("btn-clave").hidden = false;
    $("btn-sonido").hidden = false;
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
    const ini = Date.parse(t.inicia), fin = finDe(t);
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
    const enPausa = !!(abierta && S.torneo.pausada);
    $("aviso-pausa").hidden = !enPausa;
    if (S.buscando) $("arena-aviso").textContent = enPausa
      ? "Buscando rival… La arena está en pausa: seguirás esperando hasta que se reanude."
      : S.torneo.por_equipos
        ? "Buscando rival… Te emparejamos con alguien de otro equipo apenas esté esperando."
        : "Buscando rival… Te emparejamos apenas haya alguien esperando.";
    else if (!abierta) $("arena-aviso").textContent = S.torneo && estadoDe(S.torneo) === "proxima" ? "Todavía no empieza." : "La arena terminó.";
    else if ($("arena-aviso").textContent.indexOf("Buscando") === 0) $("arena-aviso").textContent = "";
  }

  async function refrescarClasificacion() {
    const t = S.torneo;
    if (!t) return;
    const [c, r, vivo, fila] = await Promise.all([
      sb.rpc("arena_clasificacion", { p_torneo: t.id }),
      sb.rpc("arena_en_racha", { p_torneo: t.id }),
      sb.from("arena_partidas").select("id,blancas,negras,jugadas,creada_en").eq("torneo_id", t.id).eq("estado", "en_juego").order("creada_en"),
      sb.from("arena_torneos").select("*").eq("id", t.id).maybeSingle(),
    ]);
    if (!S.torneo || S.torneo.id !== t.id) return;
    // Administración puede pausarla, alargarla o cerrarla: se vuelve a leer ella.
    if (fila && fila.data) { S.torneo = fila.data; pintarRelojArena(); }
    if (c.error || !c.data) return;
    const racha = new Set(((r && r.data) || []).map((x) => (typeof x === "string" ? x : Object.values(x)[0])));
    pintarClasificacion(c.data, racha);
    pintarPartidasEnJuego((vivo && vivo.data) || [], c.data.jugadores || []);
    pintarPodio(c.data);
  }

  /* Las partidas que se están jugando en esta arena, para mirarlas. */
  function pintarPartidasEnJuego(partidas, jugadores) {
    const nombres = {};
    jugadores.forEach((j) => { nombres[j.id] = j; });
    const ajenas = partidas.filter((p) => p.blancas !== S.yo.id && p.negras !== S.yo.id);
    const caja = $("lista-en-juego");
    caja.textContent = "";
    $("titulo-en-juego").textContent = "Partidas en juego (" + partidas.length + ")";
    if (!ajenas.length) {
      caja.appendChild(el("li", "text-sm text-brand-500 dark:text-brand-300", partidas.length ? "Solo estás tú jugando ahora." : "No hay partidas en juego ahora."));
      return;
    }
    ajenas.slice(0, 12).forEach((p) => {
      const b = (nombres[p.blancas] || {}).nombre || "Jugador";
      const n = (nombres[p.negras] || {}).nombre || "Jugador";
      const li = el("li", "flex items-center justify-between gap-3 py-1.5 border-b border-brand-50 dark:border-brand-800/60 text-sm");
      li.appendChild(el("span", null, b + " – " + n + " · " + (p.jugadas || []).length + " jugadas"));
      const mirar = el("button", "text-sm font-semibold text-accent-700 dark:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded", "Mirar");
      mirar.type = "button";
      mirar.setAttribute("aria-label", "Mirar la partida de " + b + " contra " + n);
      mirar.addEventListener("click", () => mirarPartida(p.id));
      li.appendChild(mirar);
      caja.appendChild(li);
    });
    if (ajenas.length > 12) caja.appendChild(el("li", "text-xs text-brand-450 dark:text-brand-350 pt-1", "y " + (ajenas.length - 12) + " más."));
  }

  /* El podio: cuando la arena terminó, quién ganó y cómo te fue a ti. */
  const MEDALLA = ["🥇", "🥈", "🥉"];
  const PUESTO = ["primer lugar", "segundo lugar", "tercer lugar"];

  function pintarPodio(datos) {
    const t = S.torneo;
    const termino = !!t && estadoDe(t) === "terminada";
    $("podio").hidden = !termino;
    if (!termino) return;
    const cuerpo = $("podio-cuerpo");
    cuerpo.textContent = "";
    const equipos = (datos.equipos || []).filter((e) => e.puntos > 0);
    const jugadores = (datos.jugadores || []).filter((j) => j.puntos > 0);
    if (!equipos.length && !jugadores.length) {
      cuerpo.appendChild(el("p", "text-sm", "En esta arena no se jugó ninguna partida que sumara puntos."));
    }
    if (t.por_equipos && equipos.length) {
      cuerpo.appendChild(el("p", "text-lg font-bold", "🏆 Equipo ganador: " + equipos[0].nombre + " (" + equipos[0].puntos + " puntos)"));
      const ol = el("ol", "mt-2 space-y-1 text-sm");
      equipos.slice(0, 3).forEach((e, i) => {
        const li = el("li");
        li.appendChild(el("span", null, MEDALLA[i] + " "));
        li.appendChild(el("span", "sr-only", PUESTO[i] + ": "));
        li.appendChild(document.createTextNode(e.nombre + " · " + e.puntos + " puntos"));
        ol.appendChild(li);
      });
      cuerpo.appendChild(ol);
    }
    if (jugadores.length) {
      cuerpo.appendChild(el("p", "font-semibold mt-4", "Mejores jugadores"));
      const ol = el("ol", "mt-1 space-y-1 text-sm");
      jugadores.slice(0, 3).forEach((j, i) => {
        const li = el("li");
        li.appendChild(el("span", null, MEDALLA[i] + " "));
        li.appendChild(el("span", "sr-only", PUESTO[i] + ": "));
        li.appendChild(document.createTextNode(j.nombre + (j.equipo ? " (" + j.equipo + ")" : "") + " · " + j.puntos + " puntos"));
        ol.appendChild(li);
      });
      cuerpo.appendChild(ol);
    }
    const lugar = (datos.jugadores || []).findIndex((j) => j.id === S.yo.id);
    cuerpo.appendChild(el("p", "mt-4 text-sm font-semibold", lugar < 0
      ? "No jugaste partidas en esta arena."
      : "Tú: puesto " + (lugar + 1) + " de " + datos.jugadores.length + ", con " + datos.jugadores[lugar].puntos + " puntos en "
        + datos.jugadores[lugar].partidas + (datos.jugadores[lugar].partidas === 1 ? " partida." : " partidas.")));
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
        if (fila) {
          Sonido.sonar("encontrado");
          Sonido.vibrar([120, 60, 120]);
          avisarEnElTitulo("⚔️ ¡Tienes partida!");
          await abrirPartida(fila);
        }
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

  /* Abre una partida: la propia (se juega) o, si quien la abre no es ninguno de
     los dos, ajena (se mira). */
  async function abrirPartida(fila) {
    cerrarPartida();
    clearInterval(S.t.clasificacion);
    clearInterval(S.t.arena);
    clearInterval(S.t.lobby);
    S.partida = null;
    S.enviando = false;
    S.seleccionada = null;
    S.espectador = fila.blancas !== S.yo.id && fila.negras !== S.yo.id;
    S.color = fila.negras === S.yo.id ? "b" : "w";
    S.jug = {
      w: fila.blancas === S.yo.id ? S.yo : await datosDeJugador(fila.blancas),
      b: fila.negras === S.yo.id ? S.yo : await datosDeJugador(fila.negras),
    };
    S.rival = S.jug[S.color === "w" ? "b" : "w"];
    if (!S.torneo || S.torneo.id !== fila.torneo_id) {
      const t = await sb.from("arena_torneos").select("*").eq("id", fila.torneo_id).maybeSingle();
      S.torneo = (t && t.data) || null;
    }
    const abajo = S.jug[S.color], arriba = S.jug[S.color === "w" ? "b" : "w"];
    const equipoDe = (j) => (j.equipo_id ? "· " + (S.equipos[j.equipo_id] || "") : "");
    $("nombre-yo").textContent = S.espectador ? abajo.nombre + " (blancas)" : S.yo.nombre + " (tú)";
    $("equipo-yo").textContent = equipoDe(abajo);
    $("nombre-rival").textContent = S.espectador ? arriba.nombre + " (negras)" : S.rival.nombre;
    $("equipo-rival").textContent = equipoDe(arriba);
    $("reloj-yo").setAttribute("aria-label", S.espectador ? "Reloj de las blancas" : "Tu reloj");
    $("reloj-rival").setAttribute("aria-label", S.espectador ? "Reloj de las negras" : "Reloj de tu rival");
    $("aviso-espectador").hidden = !S.espectador;
    if (S.espectador) $("texto-espectador").textContent = "Estás mirando la partida de " + S.jug.w.nombre + " (blancas) contra " + S.jug.b.nombre + " (negras).";
    $("h-partida").textContent = S.espectador ? "Partida de otros jugadores" : "Tu partida";
    $("resultado").hidden = true;
    $("oferta").hidden = true;
    $("controles").hidden = S.espectador;
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
    if (p.estado !== "en_juego" || S.enviando || S.espectador) return;
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
    return !!(S.partida && S.partida.estado === "en_juego" && S.juego && S.juego.turn() === S.color && !S.enviando && !S.espectador);
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

  /* La jugada va a `arena-jugar`, que la valida con chess.js en el servidor.
     Solo viaja de dónde a dónde y la pieza en que se corona: el SAN, la
     posición y si la partida acabó los calcula el servidor. */
  async function mandarJugada(id, desde, hasta, pieza) {
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) throw new Error("Tu sesión venció. Vuelve a entrar.");
    const cuerpo = { partida: id, desde: desde, hasta: hasta };
    if (pieza) cuerpo.promocion = pieza;
    const res = await fetch(window.SALA.URL + "/functions/v1/arena-jugar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, apikey: window.SALA.KEY },
      body: JSON.stringify(cuerpo),
    });
    const respuesta = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(respuesta.error || "No se pudo enviar la jugada.");
    return respuesta.partida;
  }

  async function jugar(desde, hasta, pieza) {
    if (!puedoMover()) return;
    const g = S.juego;
    const pedido = { from: desde, to: hasta };
    if (pieza) pedido.promotion = pieza;
    // Se pinta enseguida para que se sienta inmediata; si el servidor dice
    // que no, se vuelve a leer la partida y el tablero vuelve a como estaba.
    const m = g.move(pedido);
    if (!m) return;
    S.enviando = true;
    S.seleccionada = null;
    const id = S.partida.id;
    Sonido.sonar(m.captured ? "captura" : "mover");
    pintarTablero();
    pintarTurno();
    try {
      aplicarFila(await mandarJugada(id, m.from, m.to, m.promotion), true);
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
    if (S.espectador) { caja.textContent = "Es el turno de " + S.jug[S.juego.turn()].nombre + " (" + (S.juego.turn() === "w" ? "blancas" : "negras") + ")."; return; }
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
    $("controles").hidden = !enJuego || S.espectador;
    if (S.espectador) { $("oferta").hidden = true; return; }
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
    if (ahora > antes && !S.espectador) {
      const u = fila.jugadas[ahora - 1];
      const delRival = (ahora % 2 === 1) === (S.color === "b");
      if (delRival) {
        $("anuncio").textContent = S.rival.nombre + " jugó " + sanEs(u.s) + ".";
        if (fila.estado === "en_juego") {
          Sonido.sonar(/x/.test(u.s) ? "captura" : "mover");
          Sonido.sonar("turno");
          Sonido.vibrar(80);
          avisarEnElTitulo("🔔 ¡Tu turno!");
        }
      }
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
    if (S.espectador) {
      titulo = "Terminó la partida";
      detalle = !p.resultado ? "Se canceló: no cuenta para nadie."
        : p.resultado === "1/2-1/2" ? "Empataron " + (MOTIVO[p.motivo] || "") + "."
        : "Ganaron las " + (p.resultado === "1-0" ? "blancas (" + S.jug.w.nombre + ")" : "negras (" + S.jug.b.nombre + ")") + " " + (MOTIVO[p.motivo] || "") + ".";
    } else if (!p.resultado) {
      titulo = p.motivo === "anulada" ? "Partida anulada" : "Partida cancelada";
      detalle = p.motivo === "anulada" ? "Tu profe la anuló: no cuenta para nadie."
        : p.motivo === "abortada" && (p.jugadas || []).length >= 2 ? "Tu profe la canceló: no cuenta para nadie."
        : "No se llegó a jugar, así que no cuenta para nadie.";
    } else if (p.resultado === "1/2-1/2") {
      titulo = "Tablas";
      detalle = "Empate " + (MOTIVO[p.motivo] || "") + ". ";
    } else {
      const gane = (p.resultado === "1-0") === (S.color === "w");
      titulo = gane ? "¡Ganaste!" : "Perdiste";
      detalle = (gane ? "Ganaste " : "Perdiste ") + (MOTIVO[p.motivo] || "") + ". ";
    }
    if (p.resultado && !S.espectador) detalle += mios ? "Sumaste " + mios + (mios === 1 ? " punto." : " puntos.") : "Esta partida no suma puntos.";
    $("resultado-titulo").textContent = titulo;
    $("resultado-detalle").textContent = detalle;
    $("resultado").hidden = false;
    $("controles").hidden = true;
    $("oferta").hidden = true;
    const abierta = S.torneo && estadoDe(S.torneo) === "en_curso";
    $("otra-partida").hidden = !abierta || S.espectador;
    $("anuncio").textContent = titulo + ". " + detalle;
    // Solo se le quita el foco a quien estaba jugando: no a quien abre una partida ya terminada.
    if (previa && previa.estado === "en_juego") {
      $("resultado-titulo").focus();
      if (!S.espectador) { Sonido.sonar("fin"); Sonido.vibrar([200, 80, 200]); avisarEnElTitulo("🏁 Terminó tu partida"); }
    }
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

  /* Mirar la partida de otros: la misma pantalla, sin controles. */
  async function mirarPartida(id) {
    const fila = await leerPartida(id);
    if (!fila) { Avisos.avisar("No se pudo abrir esa partida.", { tipo: "error" }); return; }
    await abrirPartida(fila);
  }

  /* ------------------------------------------------------------------- PGN */

  const TERMINACION = {
    mate: "Jaque mate", ahogado: "Rey ahogado", material: "Material insuficiente",
    repeticion: "Repetición de posición", cincuenta: "Regla de las 50 jugadas",
    tiempo: "Tiempo", abandono: "Abandono", acuerdo: "Acuerdo",
  };

  /* La partida en PGN, con sus datos: se abre en cualquier programa de ajedrez. */
  function pgnDe(fila, blancas, negras, torneo) {
    const g = new Chess();
    for (const j of fila.jugadas || []) if (!g.move(j.s)) break;
    const dia = (fila.creada_en ? HoraCR.dia(fila.creada_en) : HoraCR.dia()).replace(/-/g, ".");
    g.header("Event", (torneo && torneo.nombre) || "Arena", "Site", "ajedrez-integral.com/sala", "Date", dia, "Round", "-",
      "White", blancas, "Black", negras, "Result", fila.estado === "terminada" && fila.resultado ? fila.resultado : "*");
    if (torneo) g.header("TimeControl", torneo.inicial_seg + (torneo.incremento_seg ? "+" + torneo.incremento_seg : ""));
    if (fila.estado === "terminada" && TERMINACION[fila.motivo]) g.header("Termination", TERMINACION[fila.motivo]);
    return g.pgn({ max_width: 80, newline_char: "\n" }) + "\n";
  }

  function bajarPgn() {
    const p = S.partida;
    if (!p) return;
    const texto = pgnDe(p, S.jug.w.nombre, S.jug.b.nombre, S.torneo);
    const limpio = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "application/x-chess-pgn;charset=utf-8" }));
    a.download = "partida-" + limpio(S.jug.w.nombre) + "-contra-" + limpio(S.jug.b.nombre) + ".pgn";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* --------------------------------------------------------- cambiar la clave */

  const ERRORES_CLAVE = [
    [/same|different from the old/i, "La clave nueva tiene que ser distinta de la que tienes."],
    [/at least|short|least \d+/i, "La clave es muy corta. Usa al menos 8 caracteres."],
    [/weak|pwned|easy to guess/i, "Esa clave es muy fácil de adivinar. Prueba con otra."],
    [/reauth|recent|session/i, "Por seguridad, sal y vuelve a entrar antes de cambiar la clave."],
  ];

  function errorClave(texto) {
    const p = $("clave-error");
    p.textContent = texto || "";
    p.hidden = !texto;
  }

  async function cambiarClave(ev) {
    ev.preventDefault();
    const nueva = $("clave-nueva").value, repetida = $("clave-repetida").value;
    errorClave("");
    if (nueva.length < 8) { errorClave("La clave nueva tiene que tener al menos 8 caracteres."); return; }
    if (nueva !== repetida) { errorClave("Las dos claves no son iguales. Escríbelas otra vez."); return; }
    const boton = $("clave-guardar");
    boton.disabled = true;
    try {
      const { error } = await sb.auth.updateUser({ password: nueva });
      if (error) {
        const hallado = ERRORES_CLAVE.find((e) => e[0].test(error.message || ""));
        errorClave(hallado ? hallado[1] : "No se pudo cambiar la clave. Intenta otra vez.");
        return;
      }
      $("dialogo-clave").close();
      Avisos.avisar("Tu clave se cambió. Úsala la próxima vez que entres.");
    } catch (e) {
      errorClave("No se pudo cambiar la clave. Revisa tu conexión e intenta otra vez.");
    } finally {
      boton.disabled = false;
    }
  }

  function abrirClave() {
    $("form-clave").reset();
    errorClave("");
    $("dialogo-clave").showModal();
    $("clave-nueva").focus();
  }

  function ponerSonido(activo) {
    S.sonido = activo;
    try { localStorage.setItem("sala_sonido", activo ? "1" : "0"); } catch (e) { /* no se acuerda, pero funciona */ }
    const b = $("btn-sonido");
    b.setAttribute("aria-pressed", activo ? "true" : "false");
    b.setAttribute("aria-label", activo ? "Sonido activado. Pulsa para apagarlo" : "Sonido apagado. Pulsa para encenderlo");
    b.title = activo ? "Sonido activado" : "Sonido apagado";
    $("icono-sonido").textContent = activo ? "🔊" : "🔇";
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
    $("dejar-de-mirar").addEventListener("click", volverAArena);
    $("bajar-pgn").addEventListener("click", bajarPgn);
    $("btn-sonido").addEventListener("click", () => { ponerSonido(!S.sonido); if (S.sonido) Sonido.sonar("mover"); });
    $("btn-clave").addEventListener("click", abrirClave);
    $("form-clave").addEventListener("submit", cambiarClave);
    $("clave-cancelar").addEventListener("click", () => $("dialogo-clave").close());
    $("dialogo-clave").addEventListener("close", () => $("btn-clave").focus());
    ponerSonido(S.sonido);
    // El navegador solo deja sonar después de un toque de la persona.
    document.addEventListener("pointerdown", () => Sonido.preparar(), { once: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") document.title = S.titulo;
    });
    document.addEventListener("visibilitychange", () => {
      // Juego limpio: salir de la pantalla en medio de una partida queda
      // anotado (lo cuenta la base; la pantalla de la arena lo avisa). Si no
      // llega, no se reintenta: es un indicio, no un castigo.
      if (document.visibilityState === "hidden") {
        if (S.partida && S.partida.estado === "en_juego" && !S.espectador) Promise.resolve(sb.rpc("arena_anotar_salida", { p_partida: S.partida.id })).catch(() => {});
        return;
      }
      if (document.visibilityState !== "visible") return;
      if (S.partida && S.partida.estado === "en_juego") releer();
      if (S.buscando) latir();
    });
    sb.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT" && S.yo) { limpiarTodo(); $("salir").hidden = true; $("btn-clave").hidden = true; $("btn-sonido").hidden = true; $("saludo").textContent = ""; mostrar("entrada", true); }
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
