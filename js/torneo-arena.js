/* ===== Torneos — el formato «Arena» =====
 *
 * Una arena no tiene rondas: dura un tiempo y, mientras dura, cada quien pide
 * rival y juega con el siguiente que espera. Lo que decide algo lo lleva la
 * BASE (migración *_torneo_arena.sql): con quién te toca (arena_buscar), a
 * qué hora termina (arena_empezar), los puntos (arena_clasificacion) y el
 * cierre (arena_cerrar). Acá va solo lo que comparten torneos.html (crear una)
 * y torneo.html (jugarla): las duraciones, los textos, la cuenta regresiva y
 * la cola, que es volver a preguntarle a la base cada pocos segundos.
 *
 * Ver «El formato Arena dentro de los torneos de la Academia» en
 * docs/decisiones/juegos-y-torneos.md.
 */
window.TorneoArena = (function () {
  "use strict";

  // En minutos. La base acepta de 5 a 240 (tournaments_arena_check).
  const DURACIONES = [10, 15, 20, 30, 45, 60, 90, 120];
  const DURACION_POR_OMISION = 30;

  const EXPLICACION = "Se juega mientras dura el tiempo: al terminar una partida pides otra y te toca " +
    "el siguiente que espera. Victoria 2 puntos, tablas 1; con dos victorias seguidas, la partida " +
    "siguiente vale el doble.";

  function etiquetaDuracion(minutos) {
    const m = Number(minutos);
    if (!m) return "";
    if (m < 60) return m + " minutos";
    const horas = Math.floor(m / 60), resto = m % 60;
    return (horas === 1 ? "1 hora" : horas + " horas") + (resto ? " y " + resto + " minutos" : "");
  }

  function etiqueta(torneo) {
    const d = etiquetaDuracion(torneo && torneo.arena_minutos);
    return d ? "Arena de " + d : "Arena";
  }

  /* Cuánto falta, en milisegundos, con la hora de la BASE (js/reloj-servidor.js
     si la página lo carga): la computadora de cada quien puede ir adelantada,
     y con la suya a secas la arena «terminaría» distinto en cada pantalla. */
  function faltan(torneo) {
    if (!torneo || !torneo.arena_termina) return null;
    const ahora = window.RelojServidor ? RelojServidor.ahora() : Date.now();
    return new Date(torneo.arena_termina).getTime() - ahora;
  }

  function textoFaltan(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const dos = (n) => String(n).padStart(2, "0");
    return h ? h + ":" + dos(m) + ":" + dos(s) : m + ":" + dos(s);
  }

  /* La cola. `entrar()` le pregunta a la base ya mismo y después cada
     `cadaMs`: esa misma llamada es el «sigo aquí» (quien deja de llamar 12
     segundos ya no se empareja). Se detiene sola cuando hay partida, cuando la
     arena terminó o cuando la base dice que no (un permiso, el acceso): un
     error de la base no se reintenta para siempre. Uno de red sí, tres veces.

     La posición de salida viaja con el pedido, como al aceptar un reto: la de
     Cartas, Duelo y las variantes vive en el navegador (estadoInicial()). */
  function cola(opciones) {
    const sb = opciones.sb, torneoId = opciones.torneoId;
    const cadaMs = opciones.cadaMs || 3000;
    let reloj = null, ocupada = false, fallos = 0, inicial = null;

    function detener() {
      if (reloj) { clearInterval(reloj); reloj = null; }
    }

    async function preguntar() {
      if (ocupada || !reloj) return;
      ocupada = true;
      let respuesta;
      try {
        respuesta = await sb.rpc("arena_buscar", {
          p_torneo: torneoId,
          p_fen: inicial.fen || null,
          p_cartas: inicial.cartas_state || null,
          p_duelo: inicial.duelo_state || null,
          p_variant: inicial.variant_state || null,
        });
      } catch (e) {
        respuesta = { data: null, error: { message: e && e.message ? e.message : String(e) } };
      }
      ocupada = false;
      if (!reloj) return;   // se salió mientras la base contestaba
      if (respuesta.error) {
        fallos++;
        // Con código, lo dijo la base (un permiso, un dato): no va a cambiar sola.
        if (respuesta.error.code || fallos >= 3) {
          detener();
          opciones.alCambiar({ estado: "error", mensaje: respuesta.error.message || "sin conexión" });
        }
        return;
      }
      fallos = 0;
      const r = respuesta.data || {};
      if (r.estado !== "esperando") detener();
      opciones.alCambiar(r);
    }

    return {
      entrar() {
        if (reloj) return;
        inicial = opciones.estadoInicial() || {};
        fallos = 0;
        reloj = setInterval(preguntar, cadaMs);
        preguntar();
      },
      // Sale de la cola también en la base: si no, en los 12 segundos que
      // tarda en vencer su «sigo aquí» le podría tocar una partida que no ve.
      salir() {
        const estaba = !!reloj;
        detener();
        if (estaba) {
          try {
            const pedido = sb.rpc("arena_salir", { p_torneo: torneoId });
            if (pedido && pedido.then) pedido.then(() => {}, () => {});
          } catch (e) {}
        }
      },
      activa: () => !!reloj,
    };
  }

  return {
    DURACIONES: DURACIONES,
    DURACION_POR_OMISION: DURACION_POR_OMISION,
    EXPLICACION: EXPLICACION,
    etiquetaDuracion: etiquetaDuracion,
    etiqueta: etiqueta,
    faltan: faltan,
    textoFaltan: textoFaltan,
    cola: cola,
  };
})();

/*! rev bfb5bbb0d2d82f9f */
