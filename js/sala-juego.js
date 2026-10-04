/* Lo que comparten las salas de partida en línea: el reloj, la caída de
   bandera, volver a leer la sala y escuchar sus cambios. Lo usan estandar,
   niebla, crazyhouse, cartas y variante (los cinco con reloj) y, para la sala,
   también duelo.

   Eran seis copias de las mismas funciones, ya separadas entre sí: solo
   Estándar y Niebla decían de quién es cada reloj («Tu reloj, blancas: 4
   minutos 5 segundos»); en Crazyhouse, Cartas y las variantes el lector de
   pantalla leía «4:05» suelto, sin decir si era el propio o el del rival ni
   cuál estaba arriba. Una sola copia, y las cinco lo dicen.

   Lo único que cambia de un juego a otro es a quién se le pregunta de quién es
   el turno (board.game en las de tablero normal, engine en las variantes):
   por eso se pasa `turno`, ya calculado. Script clásico, sin estado propio:
   cada página sigue teniendo su `room`, su `myColor` y sus nombres. */
(function () {
  "use strict";

  const SEGUNDOS_POCOS = 30;

  function formatear(segundos) {
    if (segundos == null) return "";
    const s = Math.max(0, Math.ceil(segundos));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* De quién es el turno según la SALA guardada, no según el tablero. Mientras
     la jugada propia viaja a la base, el tablero ya la muestra (es el turno del
     rival), pero para la base el reloj que corre sigue siendo el propio: con el
     turno del tablero, el reloj del rival bajaba todo lo que uno había
     pensado, de golpe, hasta que llegaba la respuesta. En Cartas la posición va
     en cartas_state.fen (la columna fen no se actualiza), y Abrazos guarda la
     suya en JSON, con el turno en `t`. */
  function turnoDe(room) {
    const fen = String((room && room.cartas_state && room.cartas_state.fen) || (room && room.fen) || "");
    if (fen.charAt(0) === "{") {
      try { return JSON.parse(fen).t === "b" ? "b" : "w"; } catch (e) { return "w"; }
    }
    return fen.split(" ")[1] === "b" ? "b" : "w";
  }

  /* Cuán avanzada va una versión de la sala. Lo que Realtime entrega puede
     llegar tarde y desordenado (el eco de la jugada propia después de la
     respuesta del rival, una relectura que salió antes de una jugada y volvió
     después): sin esto, una versión vieja pisaba a una nueva y el tablero
     volvía atrás una jugada, o el reloj corría para quien ya había jugado. */
  function avance(room) {
    const d = room.duelo_state;
    const contar = (o) => (o ? (o.w ? 1 : 0) + (o.b ? 1 : 0) : 0);
    return [
      room.status === "finished" ? 1 : 0,
      (room.moves || []).length,
      d ? (d.round || 0) * 10 + contar(d.commit) + contar(d.reveal) : 0,
      (room.white_ready ? 1 : 0) + (room.black_ready ? 1 : 0),
      room.clock_updated_at ? Date.parse(room.clock_updated_at) || 0 : 0,
    ];
  }
  // ¿`fila` es más vieja que `actual`? Igual no es más vieja: se aplica.
  function esAnterior(fila, actual) {
    if (!fila || !actual) return false;
    const a = avance(fila), b = avance(actual);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }
  function laMasNueva(actual, fila) { return fila && !esAnterior(fila, actual) ? fila : actual; }

  /* Lo que le queda a `color`, contando lo que corre desde la última jugada
     si es su turno. La hora es la del servidor (js/reloj-servidor.js): la del
     celular de cada uno puede estar adelantada. */
  function restante(room, color, turno) {
    const guardado = color === "w" ? room.white_time_left : room.black_time_left;
    if (guardado == null) return null;
    const corre = room.status === "playing" && room.clock_updated_at && turno === color;
    if (!corre) return guardado;
    return Math.max(0, guardado - RelojServidor.desde(room.clock_updated_at));
  }

  /* De quién es cada reloj, dicho: "4:05" suelto no dice si es el tuyo o el
     del rival, y quien no ve la pantalla no sabe cuál está arriba. */
  function rotular(el, color, segundos, miColor, nombreDe) {
    const lado = color === "w" ? "blancas" : "negras";
    const dueno = miColor ? (color === miColor ? "tu reloj" : "reloj del rival") : "reloj de " + nombreDe(color);
    const tiempo = window.JuegosBlind && JuegosBlind.tiempoDicho ? JuegosBlind.tiempoDicho(segundos) : formatear(segundos);
    const etiqueta = dueno.charAt(0).toUpperCase() + dueno.slice(1) + ", " + lado + ": " + tiempo;
    if (el.getAttribute("aria-label") !== etiqueta) el.setAttribute("aria-label", etiqueta);
  }

  /* Los dos relojes (#top-clock y #bottom-clock). Abajo va el propio; quien
     mira la partida ve las blancas abajo. `nombreDe(color)` da el nombre del
     jugador de ese color, para el rótulo de quien mira. */
  function pintarRelojes(room, opciones) {
    const arriba = document.getElementById("top-clock");
    const abajo = document.getElementById("bottom-clock");
    if (!arriba || !abajo) return;
    if (room.initial_seconds == null) {
      arriba.classList.add("hidden");
      abajo.classList.add("hidden");
      return;
    }
    const colorAbajo = opciones.miColor || "w";
    const colorArriba = colorAbajo === "w" ? "b" : "w";
    const segArriba = restante(room, colorArriba, opciones.turno);
    const segAbajo = restante(room, colorAbajo, opciones.turno);
    arriba.textContent = formatear(segArriba);
    abajo.textContent = formatear(segAbajo);
    rotular(arriba, colorArriba, segArriba, opciones.miColor, opciones.nombreDe);
    rotular(abajo, colorAbajo, segAbajo, opciones.miColor, opciones.nombreDe);
    arriba.classList.remove("hidden");
    abajo.classList.remove("hidden");
    [[arriba, segArriba], [abajo, segAbajo]].forEach(([el, s]) => {
      const pocos = room.status === "playing" && s != null && s <= SEGUNDOS_POCOS;
      el.classList.toggle("text-red-600", pocos);
      el.classList.toggle("dark:text-red-400", pocos);
    });
  }

  /* Si al que le toca se le acabó el tiempo, la partida termina. La escritura
     solo pega si la partida sigue en juego (.eq("status", "playing")): los dos
     navegadores la ven caer a la vez y no se pisan.
     Si la base la rechaza («Todavía le queda tiempo»), lo que se ve está
     atrasado: casi siempre, una jugada del rival que no llegó. Se vuelve a leer
     la sala en vez de insistir cada 250 ms (cuatro pedidos por segundo por
     cada pantalla trabada, justo cuando la base anda lenta). */
  const banderaEnPausa = {};
  async function revisarBandera(room, salaId, turno) {
    if (room.status !== "playing" || room.initial_seconds == null) return;
    turno = turno || turnoDe(room);
    const quedan = restante(room, turno, turno);
    if (quedan === null || quedan > 0) return;
    if (banderaEnPausa[salaId] && Date.now() < banderaEnPausa[salaId]) return;
    banderaEnPausa[salaId] = Date.now() + 60000; // una a la vez
    const ganador = turno === "w" ? "black" : "white";
    const clave = turno === "w" ? "white_time_left" : "black_time_left";
    const { error } = await sb.from("game_rooms")
      .update({ status: "finished", result: ganador, [clave]: 0, updated_at: new Date().toISOString() })
      .eq("id", salaId).eq("status", "playing");
    banderaEnPausa[salaId] = Date.now() + (error ? 1000 : 250);
    if (error) {
      console.error(error);
      if (vigilantes[salaId]) vigilantes[salaId].refrescar();
    }
  }

  /* La sala como está en la base, tras una escritura que no quedó. */
  async function releer(salaId) {
    const { data: fila, error } = await sb.from("game_rooms").select("*").eq("id", salaId).single();
    if (error || !fila) { console.error(error); return null; }
    return fila;
  }

  /* Cada cambio de la sala, filtrado a ESTA sala (ver «Realtime escucha solo
     lo que la pantalla muestra»), y sin perderse ninguno (ver «Las jugadas
     llegan siempre» en docs/decisiones/juegos-y-torneos.md).

     Realtime solo avisa lo que pasa MIENTRAS el canal está conectado, y no
     dice nada de lo que se perdió: un celular que bloqueó la pantalla, una
     pestaña en segundo plano a la que el navegador le frenó el latido, un
     cambio de wifi a datos, o el propio Realtime atrasado con la base
     cargada. La jugada del rival quedaba guardada en la base y la pantalla no
     se enteraba nunca: el reloj del rival seguía corriendo en una pantalla
     mientras en la otra corría el propio. Por eso:
       · cada vez que el canal queda conectado (también al reconectarse, y la
         primera vez: entre leer la sala y quedar suscrito pudo pasar una
         jugada) se vuelve a leer la sala;
       · al volver a la pestaña, al recuperar la red y si el canal se cae;
       · y, de respaldo, si pasa un rato sin noticias con la partida en juego:
         5 s si se espera al rival, 15 s si es el turno propio, 3 s con el
         canal caído. Cada lectura es UNA fila por su llave.
     Lo que llega viejo o repetido no se aplica (esAnterior, y la misma fila
     dos veces no repinta nada).

     opciones: sala() → la sala que se ve; miColor() → "w", "b" o null;
     esperando() (opcional) → si se espera algo del otro lado. */
  const vigilantes = {};
  const ESPERA_RIVAL_MS = 5000, ESPERA_PROPIA_MS = 15000, ESPERA_SIN_CANAL_MS = 3000, ESPERA_MIRANDO_MS = 8000;

  function suscribir(salaId, alCambiar, opciones) {
    opciones = opciones || {};
    const sala = opciones.sala || (() => null);
    let canal = null, vuelta = 0, conectada = false, caidaDesde = Date.now(), ultimoContacto = Date.now(), leyendo = null;

    function aplicar(fila) {
      ultimoContacto = Date.now();
      if (!fila) return;
      const actual = sala();
      if (actual && esAnterior(fila, actual)) return;
      if (actual && JSON.stringify(actual) === JSON.stringify(fila)) return;
      alCambiar(fila);
    }

    function refrescar() {
      if (leyendo) return leyendo;
      leyendo = (async () => {
        try {
          const { data, error } = await sb.from("game_rooms").select("*").eq("id", salaId).maybeSingle();
          if (error) console.error(error);
          else aplicar(data);
        } catch (e) { console.error(e); }
        ultimoContacto = Date.now();
        leyendo = null;
      })();
      return leyendo;
    }

    function pintarConexion() {
      const banner = document.getElementById("status-banner");
      if (!banner || !banner.parentNode) return;
      let aviso = document.getElementById("sala-conexion");
      const mostrar = !conectada && Date.now() - caidaDesde > 4000;
      if (!aviso) {
        if (!mostrar) return;
        aviso = document.createElement("p");
        aviso.id = "sala-conexion";
        aviso.setAttribute("role", "status");
        aviso.className = "mb-2 rounded-xl bg-brand-100 dark:bg-brand-900 px-4 py-2 text-sm text-brand-600 dark:text-brand-300";
        banner.parentNode.insertBefore(aviso, banner.nextSibling);
      }
      const texto = mostrar ? "📶 Reconectando… Las jugadas se siguen leyendo de la base cada pocos segundos." : "";
      if (aviso.textContent !== texto) aviso.textContent = texto;
      aviso.classList.toggle("hidden", !mostrar);
    }

    function abrir() {
      const propio = ++vuelta;
      canal = sb.channel("game-room-" + salaId + (propio > 1 ? "-" + propio : ""))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: "id=eq." + salaId },
          (payload) => aplicar(payload.new))
        .subscribe((estado) => {
          if (propio !== vuelta) return; // un canal viejo que todavía no terminó de cerrarse
          if (estado === "SUBSCRIBED") {
            conectada = true;
            refrescar();
          } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
            // CHANNEL_ERROR y TIMED_OUT los reintenta solo la librería. CLOSED no:
            // ahí se abre otro canal.
            if (conectada) caidaDesde = Date.now();
            conectada = false;
            if (estado === "CLOSED") {
              setTimeout(() => {
                if (propio !== vuelta) return;
                try { sb.removeChannel(canal); } catch (e) {}
                abrir();
              }, 2000);
            }
          }
          pintarConexion();
        });
    }

    setInterval(() => {
      pintarConexion();
      if (document.visibilityState === "hidden") return;
      const actual = sala();
      if (!actual || actual.status !== "playing") return;
      const color = opciones.miColor ? opciones.miColor() : null;
      let espera;
      if (!conectada) espera = ESPERA_SIN_CANAL_MS;
      else if (!color) espera = ESPERA_MIRANDO_MS;
      else if (opciones.esperando) espera = opciones.esperando() ? ESPERA_RIVAL_MS : ESPERA_PROPIA_MS;
      else espera = (!actual.white_ready || !actual.black_ready || turnoDe(actual) !== color) ? ESPERA_RIVAL_MS : ESPERA_PROPIA_MS;
      if (Date.now() - ultimoContacto >= espera) refrescar();
    }, 1000);

    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refrescar(); });
    window.addEventListener("online", () => refrescar());
    window.addEventListener("pageshow", (e) => { if (e.persisted) refrescar(); });

    vigilantes[salaId] = { refrescar };
    abrir();
    return vigilantes[salaId];
  }

  /* «Estoy listo». Si el rival ya estaba listo, esta confirmación es la que
     hace falta para arrancar: el reloj se pone en marcha en la misma
     actualización, para no depender de una segunda ida y vuelta (y para que
     los dos no intenten arrancarlo a la vez si confirman casi juntos).
     Devuelve { cambio, error }: lo que se escribió, para que la página lo
     sume a su `room` y repinte lo suyo. */
  async function marcarListo(room, salaId, miColor) {
    const cambio = { [miColor === "w" ? "white_ready" : "black_ready"]: true };
    const elOtroYaEstaba = miColor === "w" ? room.black_ready : room.white_ready;
    if (elOtroYaEstaba && room.initial_seconds != null && !room.clock_updated_at) {
      cambio.clock_updated_at = new Date().toISOString();
    }
    // Se pide la fila de vuelta: el reloj arranca con la hora de la BASE (la
    // pone el trigger), no con la de esta computadora.
    const { data, error } = await sb.from("game_rooms").update(cambio).eq("id", salaId).select("*");
    if (error) console.error(error);
    const fila = Array.isArray(data) ? data[0] : null;
    return { cambio: fila ? laMasNueva(room, fila) : cambio, error };
  }

  /* El botón «Rendirse» (#resign-btn). `sala()` y `miColor()` se leen al
     apretarlo, no al montarlo: la sala cambia con cada jugada. */
  function montarRendirse(opciones) {
    const boton = document.getElementById("resign-btn");
    if (!boton) return;
    boton.addEventListener("click", async () => {
      const miColor = opciones.miColor();
      if (!miColor || opciones.sala().status !== "playing") return;
      if (!(await Avisos.confirmar("La partida se termina y la gana tu rival.", { titulo: "¿Rendirte?", aceptar: "Rendirme", peligro: true }))) return;
      // El diálogo pudo quedar abierto un buen rato: si mientras tanto la partida
      // terminó (por ejemplo, al rival se le cayó la bandera), rendirse no puede
      // pisar ese resultado. Por eso se vuelve a mirar, y la base lo exige también.
      if (opciones.sala().status !== "playing") { opciones.decir("La partida ya había terminado."); return; }
      const resultado = miColor === "w" ? "black" : "white";
      const { data: rendida, error } = await sb.from("game_rooms")
        .update({ status: "finished", result: resultado, updated_at: new Date().toISOString() })
        .eq("id", opciones.salaId).eq("status", "playing").select("id");
      if (error) { console.error(error); opciones.decir("No se pudo registrar la rendición: " + error.message); return; }
      if (!rendida || !rendida.length) await opciones.releer("La partida ya había terminado: la rendición no se registró.");
    });
  }

  const SALIDA = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  function esTripleRepeticion(jugadas, fen) {
    return !!window.Repeticion && Repeticion.esTriple(SALIDA, jugadas, (f) => new Chess(f), fen);
  }

  window.SalaJuego = { formatear, turnoDe, esAnterior, laMasNueva, restante, pintarRelojes, revisarBandera, releer, suscribir, marcarListo, montarRendirse, esTripleRepeticion };
})();
