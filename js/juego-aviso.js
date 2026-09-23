/**
 * Ajedrez Integral — aviso y traslado automático a una partida recién asignada.
 *
 * Cuando el profesor arma un pareo desde "Asignar rivales" en Juegos (o
 * asigna un puesto de 4 jugadores), el alumno no tiene que estar mirando esa
 * pantalla para enterarse: en cuanto la partida aparece en la base (realtime
 * de Supabase) se le muestra un aviso ("Tu profesor te asignó…") EN
 * CUALQUIER PÁGINA de la Academia en la que esté, y unos segundos después —o
 * al tocar "Entrar ahora"— se lo lleva directo al tablero. También sirve si
 * el alumno abre una página y ya tiene una partida en curso que todavía no
 * empezó (los dos sin marcar "listo").
 *
 * Se autoarranca en TODA página de la Academia, con el mismo patrón de
 * `js/burbuja-en-linea.js`: busca su propia sesión y su propio rol, y si es
 * de un profesor (o administración) no hace nada — a ellos no se les
 * traslada a ningún lado, porque son quienes arman el pareo. La pone
 * `herramientas/academia-cabecera.py`, con `js/burbuja-en-linea.js`, en la
 * misma lista de páginas (menos `examen.html`, por la misma razón que la
 * burbuja: un aviso que aparece y traslada solo es justo la distracción que
 * el antitrampa del examen viene a evitar).
 *
 * Sigue admitiendo `JuegoAviso.iniciar({ sb, userId, esProfesor })` para
 * quien ya tiene esos datos a mano (evita una segunda consulta a `profiles`);
 * un segundo arranque —el automático o uno manual— no hace nada, porque el
 * primero que pasa la comprobación ya se quedó con el canal.
 */
window.JuegoAviso = (function () {
  "use strict";

  const PAGINA = { crazyhouse: "crazyhouse.html", estandar: "estandar.html", cartas: "cartas.html", duelo: "duelo.html", niebla: "niebla.html",
                   abrazos: "variante.html", camaleon: "variante.html", ciegas: "variante.html", vampiro: "variante.html" };
  const ETIQUETA = { crazyhouse: "♞ Crazyhouse", estandar: "♟️ Ajedrez estándar", cartas: "🃏 Ajedrez de Cartas", duelo: "⚡ Duelo Simultáneo", niebla: "🌫️ Niebla de Guerra",
                     abrazos: "🤗 Ajedrez de abrazos", camaleon: "🦎 Camaleón", ciegas: "🙈 A ciegas", vampiro: "🧛 Ajedrez Vampiro" };
  const SEATS = ["red", "blue", "yellow", "green"];
  // Las variantes cuya partida empieza cuando los dos marcan "listo".
  const CON_LISTO = { crazyhouse: 1, estandar: 1, cartas: 1, niebla: 1, abrazos: 1, camaleon: 1, ciegas: 1, vampiro: 1 };
  const ESPERA_MS = 4000;
  let sb = null, userId = null, yaAvisado = false, iniciado = false;

  function destinoDe(row, tabla) {
    if (tabla === "fourplayer_games") return "cuatro-jugadores.html?room=" + row.id;
    return (PAGINA[row.variant] || "crazyhouse.html") + "?room=" + row.id;
  }
  function esMia(row, tabla) {
    if (tabla === "fourplayer_games") return !!(row.seats && SEATS.some((s) => row.seats[s] && row.seats[s].player_id === userId));
    return row.white_id === userId || row.black_id === userId;
  }
  function etiqueta(row, tabla) {
    if (tabla === "fourplayer_games") return row.mode === "teams" ? "🤝 4 jugadores · Equipos" : "♟️ 4 jugadores · Todos contra todos";
    return ETIQUETA[row.variant] || row.variant;
  }

  // Para no perseguir al alumno: una partida ya avisada en esta pestaña no se vuelve a
  // avisar al entrar al panel (el aviso en vivo, al asignarla, siempre se muestra).
  function vista(id) { try { return sessionStorage.getItem("juego-aviso:" + id) === "1"; } catch (e) { return false; } }
  function marcarVista(id) { try { sessionStorage.setItem("juego-aviso:" + id, "1"); } catch (e) {} }

  // Quien ya está en el tablero de esa partida no necesita que lo lleven a él:
  // el aviso le taparía la partida y a los 4 s le recargaría la página.
  function yaEstaAhi(row) {
    try { return new URLSearchParams(location.search).get("room") === String(row.id); } catch (e) { return false; }
  }

  function mostrarAviso(row, tabla) {
    if (yaAvisado) return;
    if (yaEstaAhi(row)) { marcarVista(row.id); return; }
    yaAvisado = true;
    marcarVista(row.id);
    const destino = destinoDe(row, tabla);
    let box = document.getElementById("juego-aviso");
    if (!box) {
      box = document.createElement("div");
      box.id = "juego-aviso";
      box.setAttribute("role", "alert");
      box.className = "fixed inset-x-0 top-20 md:top-24 z-[60] px-4";
      document.body.appendChild(box);
    }
    box.innerHTML =
      '<div class="max-w-xl mx-auto bg-brand-800 text-white rounded-2xl shadow-2xl border-2 border-accent-500 p-4 sm:p-5">' +
      '<p class="text-accent-400 text-xs font-semibold uppercase tracking-wide">Partida asignada</p>' +
      '<p class="font-serif text-lg font-bold mt-1">Tu profesor te asignó una partida de ' + etiqueta(row, tabla) + '.</p>' +
      '<p class="text-sm text-brand-200 mt-1">Te llevamos al tablero en unos segundos…</p>' +
      '<div class="flex flex-wrap gap-2 mt-3">' +
      '<a id="juego-aviso-ir" href="' + destino + '" class="bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors">Entrar ahora →</a>' +
      '<button type="button" id="juego-aviso-quedarme" class="border border-brand-400 hover:border-accent-400 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">Quedarme aquí</button>' +
      "</div></div>";
    const timer = setTimeout(() => { window.location.href = destino; }, ESPERA_MS);
    document.getElementById("juego-aviso-quedarme").addEventListener("click", () => { clearTimeout(timer); box.remove(); yaAvisado = false; });
    document.getElementById("juego-aviso-ir").focus();
  }

  function suscribir() {
    sb.channel("juego-aviso-2p-" + userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_rooms" }, (payload) => {
        const row = payload.new;
        if (row && row.status === "playing" && esMia(row, "game_rooms")) mostrarAviso(row, "game_rooms");
      })
      .subscribe();
    sb.channel("juego-aviso-4p-" + userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fourplayer_games" }, (payload) => {
        const row = payload.new;
        if (row && row.status === "playing" && esMia(row, "fourplayer_games")) mostrarAviso(row, "fourplayer_games");
      })
      .subscribe();
  }

  // Partida en curso que todavía no arrancó (nadie marcó "listo"): se avisa igual al
  // entrar, por si el alumno no estaba conectado cuando se la asignaron.
  async function revisarPendientes() {
    try {
      // El filtro de variante va EN la consulta, antes del limit: si la partida más
      // nueva es un Duelo en curso, filtrarla después dejaba sin aviso a una más
      // vieja que sí espera su "listo".
      const { data } = await sb.from("game_rooms").select("*").eq("status", "playing")
        .in("variant", Object.keys(CON_LISTO))
        .or("white_id.eq." + userId + ",black_id.eq." + userId).order("created_at", { ascending: false }).limit(1);
      const row = data && data[0];
      const miReady = row && (row.white_id === userId ? row.white_ready : row.black_ready);
      // "Nadie marcó listo" solo significa "no arrancó" en las variantes que
      // tienen ese paso. Duelo no lo usa —sus dos banderas se quedan en false
      // toda la partida—, así que sin este filtro se le avisaría y se le
      // trasladaría a esa partida en cada pestaña nueva, hasta que terminara.
      if (row && CON_LISTO[row.variant] && !miReady && !vista(row.id)) { mostrarAviso(row, "game_rooms"); return; }
    } catch (e) {}
    try {
      const { data } = await sb.from("fourplayer_games").select("*").eq("status", "playing")
        .or(SEATS.map((s) => "seats->" + s + "->>player_id.eq." + userId).join(",")).order("created_at", { ascending: false }).limit(1);
      const row = data && data[0];
      const mio = row && SEATS.map((s) => row.seats[s]).find((x) => x && x.player_id === userId);
      if (row && mio && !mio.ready && !vista(row.id)) mostrarAviso(row, "fourplayer_games");
    } catch (e) {}
  }

  function iniciar(opts) {
    if (iniciado) return;
    const cliente = (opts && opts.sb) || window.sb;
    const id = opts && opts.userId;
    if (!cliente || !cliente.channel || !id || (opts && opts.esProfesor)) return;
    sb = cliente; userId = id; iniciado = true;
    suscribir();
    if (!opts || opts.revisarPendientes !== false) revisarPendientes();
  }

  /* Autoarranque: busca su propia sesión y su propio rol, igual que
     js/notificaciones.js y js/burbuja-en-linea.js — así cualquier página que
     cargue este script queda cubierta sin tener que acordarse de llamar a
     iniciar() con el profile a mano. Nunca revienta la página que lo carga:
     sin sb, sin sesión o sin perfil, se sale en silencio. */
  async function autoIniciar() {
    const cliente = window.sb;
    if (!cliente || !cliente.auth || !cliente.channel) return;
    try {
      const r = await cliente.auth.getSession();
      const sesion = r && r.data && r.data.session;
      if (!sesion) return;
      const perfil = await cliente.from("profiles").select("role, is_admin").eq("id", sesion.user.id).single();
      if (perfil.error || !perfil.data) return;
      // La regla permanente de la casa: lo que se hace para los profesores
      // se hace también para quien administra — y acá eso es NO trasladarlos.
      iniciar({ sb: cliente, userId: sesion.user.id, esProfesor: perfil.data.role === "profesor" || !!perfil.data.is_admin });
    } catch (e) { /* sin red o sin permiso: no hay aviso, no hay traslado */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoIniciar);
  else autoIniciar();

  return { iniciar };
})();
