/* El horario del Centroamericano 2026 y el tiempo de espera, para el botón «Horarios» de la
   página del árbitro (centroamericano-arbitro.html). Los datos son los de la tabla
   «Calendario del Festival» de centroamericano-2026.html (hora de Costa Rica); lo comprueba
   herramientas/verificar-centroamericano-mesas.js, así que si cambia el calendario y no esto,
   el CI falla. La tolerancia (30 minutos desde el inicio de la ronda) es la de las bases del
   torneo, en esa misma página.

       CentroamericanoHorario.EVENTOS            → [{ inicio, minutos, nombre, ronda? }]
       CentroamericanoHorario.estado(ahora, inicios)      → { ronda, empezo, quedan, hasta, siguiente, enCurso, marcada }
       CentroamericanoHorario.lineas(ahora, fmt, fmtDia, inicios) → texto para mostrar
       CentroamericanoHorario.inicioDe(evento, inicios)   → el momento (ms) en que empezó esa ronda

   `inicios` (opcional) = { [ronda]: "2026-11-02T16:48:00Z" }: la hora REAL en que la organización marcó que empezó la
   ronda («Inició la ronda»). Si una ronda no está ahí, vale la del calendario. Desde esa hora se cuentan la ronda en
   juego y el tiempo de espera.

   Costa Rica no tiene horario de verano: -06:00 todo el año. */
(function (raiz) {
  "use strict";
  const TOLERANCIA_MIN = 30;
  const EVENTOS = [
    { inicio: "2026-11-01T15:00", minutos: 240, nombre: "Llegada y acreditación (en los hoteles)" },
    { inicio: "2026-11-01T19:00", minutos: 120, nombre: "Congresillo" },
    { inicio: "2026-11-02T09:00", minutos: 30, nombre: "Inauguración" },
    { inicio: "2026-11-02T09:30", minutos: 300, nombre: "Ronda 1", ronda: 1 },
    { inicio: "2026-11-02T15:30", minutos: 300, nombre: "Ronda 2", ronda: 2 },
    { inicio: "2026-11-03T09:00", minutos: 300, nombre: "Ronda 3", ronda: 3 },
    { inicio: "2026-11-03T15:00", minutos: 240, nombre: "Torneo Rapid" },
    { inicio: "2026-11-04T09:00", minutos: 300, nombre: "Ronda 4", ronda: 4 },
    { inicio: "2026-11-04T15:00", minutos: 300, nombre: "Ronda 5", ronda: 5 },
    { inicio: "2026-11-05T09:00", minutos: 300, nombre: "Ronda 6", ronda: 6 },
    { inicio: "2026-11-05T15:00", minutos: 240, nombre: "Torneo Blitz" },
    { inicio: "2026-11-06T09:00", minutos: 300, nombre: "Ronda 7", ronda: 7 },
    { inicio: "2026-11-06T15:00", minutos: 300, nombre: "Ronda 8", ronda: 8 },
    { inicio: "2026-11-07T09:00", minutos: 300, nombre: "Ronda 9", ronda: 9 },
    { inicio: "2026-11-07T17:00", minutos: 120, nombre: "Clausura" },
    { inicio: "2026-11-08T11:00", minutos: 60, nombre: "Salida" },
  ];
  const ms = (e) => new Date(e.inicio + ":00-06:00").getTime();
  // Cuándo empezó de verdad la ronda: la hora que marcó el árbitro de la categoría o, si no marcó ninguna, la del calendario.
  function inicioDe(e, inicios) {
    const marcada = e.ronda && inicios ? Date.parse(inicios[e.ronda]) : NaN;
    return Number.isFinite(marcada) ? marcada : ms(e);
  }
  const esMarcada = (e, inicios) => !!(e.ronda && inicios && Number.isFinite(Date.parse(inicios[e.ronda])));

  // Dónde estamos: la ronda que está en juego (con cuánto le queda a la tolerancia) y la
  // próxima actividad.
  function estado(ahora, inicios) {
    const t = (ahora instanceof Date ? ahora : new Date(ahora)).getTime();
    const rondas = EVENTOS.filter((e) => e.ronda);
    let enCurso = null;
    for (const e of rondas) if (t >= inicioDe(e, inicios) && t < inicioDe(e, inicios) + e.minutos * 60000) enCurso = e;
    const siguiente = EVENTOS.find((e) => inicioDe(e, inicios) > t) || null;
    if (!enCurso) return { enCurso: null, ronda: null, empezo: null, quedan: null, hasta: null, siguiente, marcada: false };
    const inicio = inicioDe(enCurso, inicios);
    const empezo = Math.floor((t - inicio) / 60000);
    const hasta = new Date(inicio + TOLERANCIA_MIN * 60000);
    // Negativo = la tolerancia ya pasó (quedan < 0: «pasaron N min»).
    return { enCurso, ronda: enCurso.ronda, empezo, quedan: TOLERANCIA_MIN - empezo, hasta, siguiente, inicio: new Date(inicio), marcada: esMarcada(enCurso, inicios) };
  }

  function minutosTexto(min) {
    min = Math.max(0, Math.round(min));
    if (min < 60) return min + " min";
    const h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }

  // El texto del botón «Horarios». `fmt(fecha)` da la hora de Costa Rica (HoraCR.hora).
  function lineas(ahora, fmt, fmtDia, inicios) {
    const t = (ahora instanceof Date ? ahora : new Date(ahora)).getTime();
    const e = estado(ahora, inicios);
    const out = [];
    if (e.enCurso) {
      out.push("Ahora: " + e.enCurso.nombre + " (empezó a las " + fmt(e.inicio) + (e.marcada ? ", la hora que marcó el árbitro de la categoría" : "") + ", hace " + minutosTexto(e.empezo) + ").");
      out.push(e.quedan > 0
        ? "Tiempo de espera: quedan " + minutosTexto(e.quedan) + " de tolerancia (hasta las " + fmt(e.hasta) + ", " + TOLERANCIA_MIN + " minutos desde el inicio)."
        : "Tiempo de espera: la tolerancia de " + TOLERANCIA_MIN + " minutos ya pasó (terminó a las " + fmt(e.hasta) + ").");
    } else out.push("Ahora no hay ronda en juego.");
    if (e.siguiente) out.push("Sigue: " + e.siguiente.nombre + ", " + fmtDia(new Date(ms(e.siguiente))) + " a las " + fmt(new Date(ms(e.siguiente))) + " (en " + minutosTexto((ms(e.siguiente) - t) / 60000) + ").");
    out.push("Tolerancia de las bases: " + TOLERANCIA_MIN + " minutos desde el inicio de cada ronda.");
    out.push("");
    out.push("Todo el calendario:");
    for (const x of EVENTOS) out.push((x === e.enCurso ? "▶ " : "· ") + x.nombre + " — " + fmtDia(new Date(ms(x))) + ", " + fmt(new Date(ms(x))));
    return out.join("\n");
  }

  const api = { TOLERANCIA_MIN, EVENTOS, estado, lineas, minutosTexto, inicioDe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CentroamericanoHorario = api;
})(typeof self !== "undefined" ? self : this);
