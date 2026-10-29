/* ===== Bases del torneo: el documento, sin pantalla =====
 *
 * Lo que llena quien organiza en bases-torneo.html se convierte en el
 * documento neutral que leen js/reporte-pdf.js y js/reporte-docx.js (los
 * dos el mismo, así el PDF y el Word no se separan): un artículo por tema,
 * numerado, en el orden en que los busca un jugador o un árbitro.
 *
 * Lo que dice el texto sale de las Leyes del Ajedrez de la FIDE y de sus
 * reglamentos, y por eso se revisa antes de bajar (revisar()):
 *   - la modalidad sale del tiempo para 60 jugadas (base + 60 × incremento;
 *     Leyes, A.1 y B.1): 10 minutos o menos, relámpago; menos de 60, rápido;
 *     60 o más, clásico;
 *   - para Elo FIDE clásico (B.02, 1.1): 120 minutos por jugador para 60
 *     jugadas si alguno tiene 2400 o más, 90 si alguno tiene 1800 o más, 60
 *     si los dos tienen menos de 1800;
 *   - la tolerancia: si las bases no la dicen, es cero (Leyes, 6.7.1);
 *   - los desempates, por su nombre en el Reglamento de desempates de FIDE
 *     (C.07), con el catálogo de Pareo Integral (js/pareo/desempates.js).
 * Ver «Generador de bases del torneo» en docs/decisiones/juegos-y-torneos.md.
 *
 *   BasesTorneo.documento(datos) → { titulo, subtitulo, bloques: [...] }
 *   BasesTorneo.revisar(datos)   → [{ tipo: "error"|"aviso", texto }]
 *   BasesTorneo.horario(datos)   → [{ ronda, dia, hora }]
 */
(function (raiz) {
  "use strict";

  const D = typeof module !== "undefined" && module.exports ? require("./pareo/desempates.js") : raiz.PareoDesempates;
  const NOMBRE_DESEMPATE = {};
  ((D && D.CATALOGO) || []).forEach((c) => { NOMBRE_DESEMPATE[c.codigo] = c.es; });

  const SISTEMAS = {
    suizo: "Sistema suizo",
    todos: "Todos contra todos a una vuelta",
    doble: "Todos contra todos a doble vuelta",
  };
  // Los de Pareo Integral (js/pareo/torneo.js y js/pareo/grupos.js).
  const DESEMPATES_SUGERIDOS = { suizo: ["BH-C1", "BH", "SB", "DE", "WIN"], todos: ["DE", "SB", "WIN", "KS"], doble: ["DE", "SB", "WIN", "KS"] };

  const ZONA = "America/Costa_Rica";
  const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

  // Un día de calendario («2026-03-07») se lee al mediodía de Costa Rica: nunca corre de día.
  function fechaLarga(dia, conDiaSemana) {
    if (!SOLO_DIA.test(String(dia || ""))) return "";
    const d = new Date(dia + "T12:00:00-06:00");
    return d.toLocaleDateString("es-CR", Object.assign({ day: "numeric", month: "long", year: "numeric", timeZone: ZONA }, conDiaSemana ? { weekday: "long" } : {}));
  }
  // «7 de marzo de 2026», «7 al 8 de marzo de 2026», «28 de febrero al 1 de marzo de 2026».
  function rango(desde, hasta) {
    const a = fechaLarga(desde);
    if (!SOLO_DIA.test(String(hasta || "")) || hasta === desde || !a) return a;
    const b = fechaLarga(hasta);
    if (desde.slice(0, 7) === hasta.slice(0, 7)) return Number(desde.slice(8)) + " al " + b;
    if (desde.slice(0, 4) === hasta.slice(0, 4)) return a.replace(/ de \d{4}$/, "") + " al " + b;
    return a + " al " + b;
  }
  function sumarDias(dia, n) {
    const [y, m, d] = dia.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);   // calendario en UTC
  }
  // «14:30» → «2:30 p. m.»
  function horaTexto(minutos) {
    const h = Math.floor(minutos / 60) % 24, m = minutos % 60;
    return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + (h < 12 ? " a. m." : " p. m.");
  }
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const limpio = (s) => String(s == null ? "" : s).trim();
  const lineas = (s) => limpio(s).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  // El tiempo de cada jugador para 60 jugadas, en minutos (Leyes A.1, B.1; B.02 1.1).
  function minutosPara60(d) { return num(d.ritmoMin) + num(d.ritmoInc) * 60 / 60; }
  function modalidad(d) {
    const t = minutosPara60(d);
    if (!(num(d.ritmoMin) > 0)) return null;
    return t <= 10 ? "relampago" : t < 60 ? "rapido" : "clasico";
  }
  const NOMBRE_MODALIDAD = { relampago: "ajedrez relámpago", rapido: "ajedrez rápido", clasico: "ajedrez clásico" };

  function ritmoTexto(d) {
    const base = num(d.ritmoMin), inc = num(d.ritmoInc);
    if (!base) return "";
    return base + " minutos para toda la partida" + (inc ? ", con un incremento de " + inc + " segundos por jugada desde la primera" : ", sin incremento");
  }

  /* El horario: las rondas en orden, `rondasPorDia` cada día desde la fecha de
     inicio; cada ronda dura el tiempo de los dos jugadores más 40 jugadas de
     incremento (como el horario de Pareo Integral), y la siguiente empieza
     después del descanso, a la media hora siguiente. */
  function horario(d) {
    const rondas = Math.max(0, Math.floor(num(d.rondas)));
    const porDia = Math.max(1, Math.floor(num(d.rondasPorDia)) || 1);
    const [hh, mm] = String(d.horaInicio || "09:00").split(":").map(Number);
    const inicio = (hh || 0) * 60 + (mm || 0);
    const dura = Math.ceil(2 * (num(d.ritmoMin) + (40 * num(d.ritmoInc)) / 60));
    const descanso = num(d.descanso);
    const fuera = [];
    for (let r = 0; r < rondas; r++) {
      const enElDia = r % porDia;
      const dia = SOLO_DIA.test(d.fechaInicio || "") ? sumarDias(d.fechaInicio, Math.floor(r / porDia)) : "";
      const min = enElDia === 0 ? inicio : Math.ceil((fuera[r - 1].min + dura + descanso) / 30) * 30;
      fuera.push({ ronda: r + 1, dia, min, hora: horaTexto(min) });
    }
    return fuera;
  }

  function revisar(d) {
    const fuera = [];
    const error = (texto) => fuera.push({ tipo: "error", texto });
    const aviso = (texto) => fuera.push({ tipo: "aviso", texto });
    if (!limpio(d.nombre)) error("Falta el nombre del torneo.");
    if (!SOLO_DIA.test(d.fechaInicio || "")) error("Falta la fecha de inicio.");
    if (!limpio(d.lugar)) error("Falta el lugar.");
    if (!(num(d.rondas) >= 1)) error("Falta el número de rondas.");
    if (!(num(d.ritmoMin) > 0)) error("Falta el ritmo de juego.");
    if (!(d.desempates || []).length) aviso("No elegiste desempates: las bases tienen que decir cómo se desempata antes de empezar (C.07, art. 4).");
    const mod = modalidad(d);
    if (mod && d.eloFide) {
      const t = minutosPara60(d);
      if (mod !== "clasico") aviso("Con este ritmo es " + NOMBRE_MODALIDAD[mod] + ": vale para el Elo FIDE " + (mod === "rapido" ? "de rápidas" : "de relámpago") + ", no para el clásico.");
      else if (t < 90) aviso("Con " + t + " minutos para 60 jugadas, el Elo FIDE clásico solo cuenta las partidas entre dos jugadores de menos de 1800 (B.02, 1.1: 90 minutos si alguno tiene 1800 o más; 120 si alguno tiene 2400 o más).");
      else if (t < 120) aviso("Con " + t + " minutos para 60 jugadas, el Elo FIDE clásico no cuenta las partidas donde alguno tiene 2400 o más (B.02, 1.1: hacen falta 120).");
    }
    if (d.sistema === "suizo" && num(d.rondas) >= 1 && num(d.byes) > 0 && num(d.byesHasta) >= num(d.rondas)) aviso("Los byes de medio punto se pueden pedir hasta la última ronda: lo usual es cerrarlos antes de las dos últimas, para que no cambien el podio.");
    if (SOLO_DIA.test(d.fechaFin || "") && SOLO_DIA.test(d.fechaInicio || "") && d.fechaFin < d.fechaInicio) error("La fecha de cierre es antes que la de inicio.");
    if (SOLO_DIA.test(d.inscripcionHasta || "") && SOLO_DIA.test(d.fechaInicio || "") && d.inscripcionHasta > d.fechaInicio) aviso("La inscripción cierra después de que empieza el torneo.");
    const h = horario(d);
    if (h.some((x) => x.min >= 22 * 60)) aviso("Alguna ronda empieza a las 10 de la noche o más tarde: revisa las rondas por día, la hora de inicio o el descanso.");
    return fuera;
  }

  function documento(d) {
    const bloques = [];
    let n = 0;
    const articulo = (titulo) => bloques.push({ tipo: "subtitulo", texto: ++n + ". " + titulo });
    const parrafo = (texto) => { if (limpio(texto)) bloques.push({ tipo: "parrafo", texto: limpio(texto) }); };
    const lista = (items) => { if (items.length) bloques.push({ tipo: "lista", items }); };
    const fechas = rango(d.fechaInicio, d.fechaFin);

    articulo("Organización");
    parrafo(limpio(d.organizador) ? "Organiza " + limpio(d.organizador) + "." : "");
    parrafo(limpio(d.director) ? "Director del torneo: " + limpio(d.director) + "." : "");
    parrafo(limpio(d.contacto) ? "Información: " + limpio(d.contacto) + "." : "");

    articulo("Fecha y lugar");
    parrafo((SOLO_DIA.test(d.fechaFin || "") && d.fechaFin !== d.fechaInicio ? "Del " : "El ") + fechas + ", en " + limpio(d.lugar) + ".");

    articulo("Participantes");
    parrafo(limpio(d.participantes) || "Abierto a todas las personas que se inscriban en el plazo.");
    const cats = lineas(d.categorias);
    if (cats.length) { parrafo("Categorías:"); lista(cats); }

    articulo("Inscripción");
    const ins = [];
    if (num(d.costo) > 0) ins.push("Costo: ₡" + num(d.costo).toLocaleString("es-CR") + ".");
    else ins.push("La inscripción es gratuita.");
    if (SOLO_DIA.test(d.inscripcionHasta || "")) ins.push("Se cierra el " + fechaLarga(d.inscripcionHasta) + ".");
    if (num(d.cupo) > 0) ins.push("Cupo máximo: " + num(d.cupo) + " participantes, por orden de inscripción.");
    if (limpio(d.comoInscribirse)) ins.push(limpio(d.comoInscribirse).replace(/\.?$/, "."));
    parrafo(ins.join(" "));

    articulo("Sistema de juego");
    parrafo((SISTEMAS[d.sistema] || SISTEMAS.suizo) + ", a " + num(d.rondas) + (num(d.rondas) === 1 ? " ronda" : " rondas") +
      (d.sistema === "suizo" ? ". El emparejamiento se hace con el Sistema Holandés de la FIDE (C.04.3), con un programa avalado." : "."));

    articulo("Ritmo de juego");
    const mod = modalidad(d);
    parrafo(ritmoTexto(d) + "." + (mod ? " Modalidad: " + NOMBRE_MODALIDAD[mod] + "." : ""));
    if (mod && mod !== "clasico") parrafo("Se aplican las reglas del Apéndice " + (mod === "rapido" ? "A (ajedrez rápido)" : "B (ajedrez relámpago)") + " de las Leyes del Ajedrez de la FIDE.");

    articulo("Calendario");
    const h = horario(d);
    if (h.length) {
      bloques.push({ tipo: "tabla", encabezados: ["Ronda", "Día", "Hora"], anchos: [1, 3, 2],
        filas: h.map((x) => [String(x.ronda), x.dia ? fechaLarga(x.dia, true) : "", x.hora]) });
    }
    parrafo(limpio(d.calendarioNota) || "Las horas son de Costa Rica. Si una ronda termina antes, la siguiente puede adelantarse con aviso a todos los participantes.");

    articulo("Puntuación y desempates");
    parrafo("Partida ganada, 1 punto; tablas, ½ punto; perdida, 0." + (d.sistema === "suizo" ? " El bye que asigna el emparejamiento vale 1 punto." : ""));
    const des = (d.desempates || []).filter((c) => NOMBRE_DESEMPATE[c]);
    if (des.length) {
      parrafo("Los empates en puntos se resuelven, en este orden, con el Reglamento de desempates de la FIDE (C.07):");
      lista(des.map((c, i) => (i + 1) + ". " + NOMBRE_DESEMPATE[c] + " (" + c + ")"));
    }

    if (d.sistema === "suizo" && num(d.byes) > 0) {
      articulo("Byes de medio punto");
      parrafo("Cada participante puede pedir hasta " + num(d.byes) + (num(d.byes) === 1 ? " bye" : " byes") + " de medio punto" +
        (num(d.byesHasta) > 0 ? ", de la ronda 1 a la " + num(d.byesHasta) : "") + ", al árbitro y antes de que se publique el emparejamiento de esa ronda.");
    }

    articulo("Tolerancia");
    const tol = num(d.tolerancia);
    parrafo(tol > 0 ? "Pierde la partida quien llegue al tablero más de " + tol + " minutos después de la hora de inicio de la ronda (Leyes del Ajedrez, 6.7.1)."
      : "Pierde la partida quien no esté en el tablero a la hora de inicio de la ronda: la tolerancia es cero (Leyes del Ajedrez, 6.7.1).");

    articulo("Dispositivos electrónicos");
    parrafo(limpio(d.dispositivos) || "Durante la partida está prohibido tener un teléfono celular u otro dispositivo electrónico en la sala de juego, salvo que esté completamente apagado y guardado en un bolso u otra pertenencia (Leyes del Ajedrez, 11.3.2). Quien lo tenga encendido pierde la partida.");

    articulo("Validez para Elo");
    const elos = [];
    if (d.eloFide) elos.push("el Elo FIDE" + (mod ? " " + (mod === "clasico" ? "clásico" : mod === "rapido" ? "de rápidas" : "de relámpago") : ""));
    if (d.eloNacional) elos.push("el Elo nacional");
    parrafo(elos.length ? "El torneo es válido para " + elos.join(" y ") + "." : "El torneo no es válido para Elo.");

    const premios = lineas(d.premios);
    if (premios.length) { articulo("Premios"); lista(premios); parrafo("Los premios no se dividen ni se acumulan: quien gane dos recibe el de mayor valor."); }

    articulo("Arbitraje y reclamos");
    parrafo(limpio(d.arbitro) ? "Árbitro principal: " + limpio(d.arbitro) + "." : "");
    parrafo("Las decisiones del árbitro se pueden apelar por escrito ante el comité de apelaciones" + (num(d.plazoApelacion) > 0 ? ", hasta " + num(d.plazoApelacion) + " minutos después de terminada la partida" : "") + ". El comité se forma antes de la primera ronda.");

    const otras = lineas(d.otras);
    articulo("Disposiciones finales");
    lista(otras);
    parrafo("Lo que no esté previsto en estas bases se resuelve con las Leyes del Ajedrez de la FIDE vigentes. Participar en el torneo es aceptar estas bases.");

    return {
      titulo: "Bases del " + (limpio(d.nombre) || "torneo"),
      subtitulo: [fechas, limpio(d.lugar)].filter(Boolean).join(" · "),
      bloques,
    };
  }

  const api = { rango, documento, revisar, horario, modalidad, minutosPara60, DESEMPATES_SUGERIDOS, SISTEMAS, NOMBRE_DESEMPATE, fechaLarga };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BasesTorneo = api;
})(typeof self !== "undefined" ? self : this);
