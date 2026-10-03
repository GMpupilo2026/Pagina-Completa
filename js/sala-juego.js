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
     navegadores la ven caer a la vez y no se pisan. */
  async function revisarBandera(room, salaId, turno) {
    if (room.status !== "playing" || room.initial_seconds == null) return;
    const quedan = restante(room, turno, turno);
    if (quedan === null || quedan > 0) return;
    const ganador = turno === "w" ? "black" : "white";
    const clave = turno === "w" ? "white_time_left" : "black_time_left";
    const { error } = await sb.from("game_rooms")
      .update({ status: "finished", result: ganador, [clave]: 0, updated_at: new Date().toISOString() })
      .eq("id", salaId).eq("status", "playing");
    if (error) console.error(error);
  }

  /* La sala como está en la base, tras una escritura que no quedó. */
  async function releer(salaId) {
    const { data: fila, error } = await sb.from("game_rooms").select("*").eq("id", salaId).single();
    if (error || !fila) { console.error(error); return null; }
    return fila;
  }

  /* Cada cambio de la sala, filtrado a ESTA sala (ver «Realtime escucha solo
     lo que la pantalla muestra»). */
  /* Y un respaldo por si un aviso de Realtime no llega: el 3/10, en un torneo,
     el rival jugaba y al otro no le llegaba la jugada, y su reloj seguía
     corriendo — sin ningún error en la pantalla (era una política de la base
     que hacía fallar a Realtime: ver «Realtime perdía jugadas» en
     docs/decisiones/juegos-y-torneos.md). Por cualquier causa que se repita,
     la página vuelve a leer la sala:
       - cada RESPALDO_MS mientras la partida sigue y la pestaña está a la vista
         (una sola fila por su clave: barato);
       - al volver a la pestaña;
       - si el canal se cae (error, se agotó el tiempo o se cerró).
     Lo que llega por Realtime se entrega siempre, tal cual; lo releído, solo si
     la fila cambió desde lo último que se entregó (la fila entera: Cartas y
     Duelo cambian su estado sin tocar la posición). */
  const RESPALDO_MS = 15000;
  function claveDeSala(fila) { return fila ? JSON.stringify(fila) : ""; }
  function suscribir(salaId, alCambiar) {
    let ultima = null, enJuego = true, leyendo = false, ultimaHora = 0;
    const hora = (fila) => (fila && fila.updated_at ? new Date(fila.updated_at).getTime() || 0 : 0);
    const entregar = (fila, siempre) => {
      if (!fila) return;
      // Una lectura que salió antes de la última jugada y volvió después no la pisa.
      if (!siempre && hora(fila) < ultimaHora) return;
      ultimaHora = Math.max(ultimaHora, hora(fila));
      enJuego = fila.status === "playing";
      const clave = claveDeSala(fila);
      if (!siempre && clave === ultima) return;
      ultima = clave;
      alCambiar(fila);
    };
    async function revisar() {
      if (leyendo || document.hidden) return;
      leyendo = true;
      try { entregar(await releer(salaId), false); } finally { leyendo = false; }
    }
    // Lo que había al abrir: el respaldo compara contra esto, no avisa por ello.
    releer(salaId).then((fila) => {
      if (fila && ultima === null) { ultima = claveDeSala(fila); ultimaHora = hora(fila); enJuego = fila.status === "playing"; }
    });
    setInterval(() => { if (enJuego) revisar(); }, RESPALDO_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) revisar(); });
    return sb.channel("game-room-" + salaId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: "id=eq." + salaId },
        (payload) => entregar(payload.new, true))
      .subscribe((estado) => {
        if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") revisar();
      });
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
    const { error } = await sb.from("game_rooms").update(cambio).eq("id", salaId);
    if (error) console.error(error);
    return { cambio, error };
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

  window.SalaJuego = { formatear, restante, pintarRelojes, revisarBandera, releer, suscribir, marcarListo, montarRendirse, esTripleRepeticion };
})();
