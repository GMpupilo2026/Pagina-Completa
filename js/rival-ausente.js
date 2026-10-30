/* El rival se desconectó: avisarlo y dejar reclamar la victoria o las tablas,
   como en lichess. Ver «El rival que se va» en
   docs/decisiones/juegos-y-torneos.md.

   Lo pone en marcha SalaJuego.suscribir en toda sala de a dos (game_rooms)
   donde quien mira juega. Cada tanto llama a latido_de_partida(): la base
   anota que sigue ahí y contesta cuánto hace que no ve al rival, cada cuánto
   volver a latir, desde cuándo avisar y si ya se puede reclamar. Las cuentas
   son de la base, con su hora: reclamar_por_abandono() lo vuelve a comprobar
   antes de terminar la partida, así que desde la consola no se gana nada.

   Si el que no llega es el pedido propio (sin red), no se avisa nada: no se
   acusa al rival de lo que es la conexión de uno. */
(function () {
  "use strict";

  function vigilar(salaId, opciones) {
    let caja = null, timer = null, parada = false, ultimo = null, latidoMs = 10000;

    function juego() {
      const sala = opciones.sala();
      const color = opciones.miColor && opciones.miColor();
      return sala && sala.status === "playing" && (color === "w" || color === "b");
    }

    function armarCaja() {
      if (caja) return caja;
      const estado = document.getElementById("status-banner");
      if (!estado) return null;
      caja = document.createElement("div");
      caja.id = "rival-ausente";
      caja.setAttribute("role", "status");
      caja.setAttribute("aria-live", "polite");
      caja.className = "hidden mb-4 rounded-xl bg-brand-100 dark:bg-brand-900 px-4 py-2.5 text-sm text-red-700 dark:text-red-300";
      const texto = document.createElement("p");
      texto.className = "font-semibold";
      const botones = document.createElement("div");
      botones.className = "hidden flex-wrap gap-2 mt-2";
      const boton = (rotulo, tablas) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 transition-colors";
        b.textContent = rotulo;
        b.addEventListener("click", () => reclamar(tablas, rotulo, b));
        return b;
      };
      botones.append(boton("Reclamar la victoria", false), boton("Declarar tablas", true));
      caja.append(texto, botones);
      estado.insertAdjacentElement("afterend", caja);
      return caja;
    }

    function pintar(d) {
      const c = armarCaja();
      if (!c) return;
      const ver = !!(d && juego() && d.segundos >= d.aviso_s);
      c.classList.toggle("hidden", !ver);
      if (!ver) return;
      const puede = !!d.puede_reclamar;
      c.firstChild.textContent = "Tu rival se desconectó hace " + d.segundos + " s." +
        (puede ? " Puedes reclamar la victoria o declarar tablas, o seguir esperando." :
          " Si no vuelve, en " + Math.max(1, d.reclamar_s - d.segundos) + " s podrás reclamar la victoria.");
      c.lastChild.classList.toggle("hidden", !puede);
      c.lastChild.classList.toggle("flex", puede);
    }

    async function latir() {
      if (parada) return;
      clearTimeout(timer);
      timer = setTimeout(latir, latidoMs);
      if (!juego()) { pintar(null); return; }
      let r;
      try { r = await sb.rpc("latido_de_partida", { p_room_id: salaId }); } catch (e) { r = { error: e }; }
      if (parada) return;
      if (r.error || !r.data) { pintar(null); return; }
      ultimo = r.data;
      if (ultimo.latido_s > 0 && ultimo.latido_s * 1000 !== latidoMs) {
        latidoMs = ultimo.latido_s * 1000;
        clearTimeout(timer);
        timer = setTimeout(latir, latidoMs);
      }
      pintar(ultimo);
    }

    async function reclamar(tablas, rotulo, boton) {
      const ok = await Avisos.confirmar(tablas
        ? "La partida termina en tablas."
        : "La partida termina y la ganas tú.", { titulo: "¿" + rotulo + "?", aceptar: rotulo });
      if (!ok) return;
      boton.disabled = true;
      const { error } = await sb.rpc("reclamar_por_abandono", { p_room_id: salaId, p_tablas: tablas });
      boton.disabled = false;
      if (error) {
        Avisos.avisar("No se pudo: " + error.message);
        latir();
        return;
      }
      pintar(null);
      if (opciones.refrescar) opciones.refrescar();
    }

    // Al volver a la pestaña, enseguida: el navegador frena los relojes de
    // las pestañas escondidas.
    const alVolver = () => { if (document.visibilityState === "visible") latir(); };
    document.addEventListener("visibilitychange", alVolver);
    latir();

    return {
      parar() { parada = true; clearTimeout(timer); document.removeEventListener("visibilitychange", alVolver); },
      latir,
    };
  }

  window.RivalAusente = { vigilar };
})();
