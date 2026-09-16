/**
 * Ajedrez Integral — aviso y traslado automático a una partida recién asignada.
 *
 * Cuando el profesor asigna una partida (Crazyhouse, Ajedrez de abrazos,
 * Camaleón, A ciegas o de 4 jugadores) desde Juegos, el alumno que esté en el
 * panel de Academia o en Juegos no tiene que enterarse solo: en cuanto la
 * partida aparece en la base (realtime de Supabase), se le muestra un aviso
 * ("Tu profesor te asignó…") y unos segundos después se lo lleva a la página de
 * la partida. También sirve si el alumno abre el panel y ya tiene una partida en
 * curso que todavía no empezó (los dos sin marcar "listo").
 *
 * Uso: JuegoAviso.iniciar({ sb, userId, esProfesor }) — a los profesores no se les
 * traslada a nada. Requiere window.sb (js/supabase-client.js).
 */
window.JuegoAviso = (function () {
  "use strict";

  const PAGINA = { crazyhouse: "crazyhouse.html", estandar: "estandar.html", cartas: "cartas.html", duelo: "duelo.html", niebla: "niebla.html",
                   abrazos: "variante.html", camaleon: "variante.html", ciegas: "variante.html", vampiro: "variante.html" };
  const ETIQUETA = { crazyhouse: "♞ Crazyhouse", estandar: "♟️ Ajedrez estándar", cartas: "🃏 Ajedrez de Cartas", duelo: "⚡ Duelo Simultáneo", niebla: "🌫️ Niebla de Guerra",
                     abrazos: "🤗 Ajedrez de abrazos", camaleon: "🦎 Camaleón", ciegas: "🙈 A ciegas", vampiro: "🧛 Ajedrez Vampiro" };
  const SEATS = ["red", "blue", "yellow", "green"];
  const ESPERA_MS = 4000;
  let sb = null, userId = null, yaAvisado = false;

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

  function mostrarAviso(row, tabla) {
    if (yaAvisado) return;
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
      const { data } = await sb.from("game_rooms").select("*").eq("status", "playing")
        .or("white_id.eq." + userId + ",black_id.eq." + userId).order("created_at", { ascending: false }).limit(1);
      const row = data && data[0];
      const miReady = row && (row.white_id === userId ? row.white_ready : row.black_ready);
      if (row && !miReady && !vista(row.id)) { mostrarAviso(row, "game_rooms"); return; }
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
    sb = opts.sb || window.sb; userId = opts.userId;
    if (!sb || !userId || opts.esProfesor) return;
    suscribir();
    if (opts.revisarPendientes !== false) revisarPendientes();
  }

  return { iniciar };
})();
