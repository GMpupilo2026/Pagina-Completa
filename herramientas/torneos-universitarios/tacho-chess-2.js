/* La configuración de tacho-chess-2.html, la página del Torneo Intereducativo
 * Tacho Chess 2 del Liceo Anastasio Alfaro (sábado 14 de noviembre de 2026).
 * De aquí salen la página y js/tacho-chess.js con
 * herramientas/torneo-universitario.js (ver su cabecera), y las bases en PDF
 * con herramientas/tacho-chess-2-bases.js. No es un torneo universitario,
 * pero es la misma página (la del Centroamericano) y la misma plantilla.
 *
 * Lo pidió el dueño el 12/11/2026: «crear este torneo igual siguiendo todas
 * las características del torneo centroamericano […] las bases todas tienen
 * que ser interpretadas de este afiche», con el ritmo de 10 minutos + 2
 * segundos y 5 partidas (eso lo dijo él; no viene en el afiche; el 13/11
 * corrigió: son 7 rondas). Todo lo
 * demás sale del afiche: la fecha, la hora, la sede, que es gratis, el
 * formulario (leído del código QR), la premiación por nivel y lo que hay
 * además del torneo. La mascota (Tacho, el mapache con la camiseta 52) y el
 * escudo del liceo están recortados del afiche, sin redibujarlos.
 *
 * - Una sola copia de los datos: `bases` (abajo) la leen el calendario de la
 *   página y el PDF de las bases (BasesTorneo de js/bases-torneo.js, el del
 *   «Generador de bases del torneo»).
 * - El afiche dice «A PARTIR DE 8:30 A.M.»: es la llegada y la
 *   confirmación; la ronda 1 es a las 9:00 y el árbitro principal es el FA
 *   Jean Carlo Quesada Arauz (los dos datos los dio el dueño después). Las
 *   otras horas no las dice nadie: salen del horario de BasesTorneo (cada ronda dura el tiempo
 *   de los dos jugadores más 40 jugadas de incremento, y la siguiente
 *   empieza a la media hora siguiente) y se escriben «aprox.».
 * - El contacto de la organización es Adriana, +506 8912-2033 (lo dio el
 *   dueño; el afiche no trae teléfono). Lo que nadie dio (correo, cierre de
 *   la inscripción) no se pone.
 * - Los resultados van en Pareo Integral (lo dijo el dueño): la ficha
 *   «Resultados» va «Pronto» hasta que el torneo está publicado, y
 *   js/tacho-chess-resultados.js la cambia por el enlace a ESE torneo.
 */
const B = require("../../js/bases-torneo.js");

const tarjeta = "rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 p-6";
const h3 = '<h3 class="font-bold text-brand-800 dark:text-white">';
const texto = "mt-2 text-sm text-brand-600 dark:text-brand-300";
const FORMULARIO = "https://forms.gle/bLTnu979f2aj7kUUA";
const BASES_PDF = "documentos/tacho-chess-2/bases-tacho-chess-2.pdf";

// Los niveles que se premian: «de primer grado a undécimo año».
const NIVELES = ["Primer grado", "Segundo grado", "Tercer grado", "Cuarto grado", "Quinto grado", "Sexto grado",
  "Sétimo año", "Octavo año", "Noveno año", "Décimo año", "Undécimo año"];
// Los cuatro torneos en que se juntan los niveles (lo dijo el dueño el 13/11,
// con los inscritos a la vista): [nombre, primer nivel, último nivel] (índices de NIVELES).
const TORNEOS = [["Primero a tercer grado", 0, 2], ["Cuarto a sexto grado", 3, 5], ["Sétimo y octavo año", 6, 7], ["Noveno a undécimo año", 8, 10]];
const nivelesDe = ([, desde, hasta]) => NIVELES.slice(desde, hasta + 1);
const listaY = (xs) => xs.length > 1 ? xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1] : xs[0];
// La premiación (lo aclaró el dueño el 13/11): cada nivel por separado, con
// su 1.º, 2.º y 3.º lugar, aunque se juegue mezclado con otros niveles.
const PREMIO_TEXTO = "Aunque jueguen mezclados, se premia por separado el 1.er, 2.º y 3.er lugar de cada nivel (primer grado, segundo grado, tercer grado y así hasta undécimo año), según su puesto en la clasificación final de su torneo.";
const TORNEOS_TEXTO = "Se juegan cuatro torneos, cada uno con sus niveles: " + TORNEOS.map((t) => t[0].toLowerCase() + " (" + listaY(nivelesDe(t).map((n) => n.toLowerCase())) + ")").join("; ") + ". " + PREMIO_TEXTO;

// Los datos del torneo, como los lee BasesTorneo.documento().
const bases = {
  nombre: "Torneo Intereducativo Tacho Chess 2",
  organizador: "el Liceo Anastasio Alfaro (San José)",
  fechaInicio: "2026-11-14",
  lugar: "el Gimnasio del Centro, Liceo Anastasio Alfaro, San José",
  participantes: "Estudiantes de centros educativos, de primer grado a undécimo año. Cada participante juega por su centro educativo.",
  categorias: NIVELES.join("\n"),
  costo: 0,
  contacto: "Adriana, +506 8912-2033 (teléfono y WhatsApp)",
  arbitro: "FA Jean Carlo Quesada Arauz",
  comoInscribirse: "Con el formulario en línea de la organización: " + FORMULARIO.replace("https://", "") + " (el código QR del afiche)",
  sistema: "suizo", rondas: 7, rondasPorDia: 7, horaInicio: "09:00", descanso: 5,
  ritmoMin: 10, ritmoInc: 2, tolerancia: 10,
  eloFide: false, eloNacional: false,
  desempates: B.DESEMPATES_SUGERIDOS.suizo.slice(),
  byes: 0,
  calendarioNota: "Las horas son de Costa Rica. De 8:30 a 9:00 a. m., llegada y confirmación de los inscritos. La ronda 1 empieza a las 9:00 a. m.; las demás son aproximadas: cada una empieza cuando termina la anterior y el árbitro publica el emparejamiento.",
  premios: "Primero, segundo y tercer lugar de cada uno de los once niveles, de primer grado a undécimo año (33 premios).\nEl lugar de cada nivel sale de la clasificación final de su torneo: aunque jueguen mezclados, cada nivel se premia por separado.",
  otras: [
    TORNEOS_TEXTO,
    "Los emparejamientos de cada ronda, los resultados y la clasificación se publican en Pareo Integral, en la página del torneo (ajedrez-integral.com/tacho-chess-2, ficha «Resultados»).",
    "Durante el torneo hay feria de comerciantes de la comunidad, open house del Liceo Anastasio Alfaro y venta de comida.",
  ].join("\n"),
};

// El calendario de la página sale del mismo horario que el de las bases.
const HORARIO = B.horario(bases);
const ULTIMA = HORARIO[HORARIO.length - 1];
const PREMIACION = Math.ceil((ULTIMA.min + Math.ceil(2 * (bases.ritmoMin + 40 * bases.ritmoInc / 60)) + bases.descanso) / 30) * 30;
const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
const horaTexto = (min) => { const h = Math.floor(min / 60); return (h % 12 || 12) + ":" + String(min % 60).padStart(2, "0") + (h < 12 ? " a. m." : " p. m."); };
const CICLO = HORARIO.length > 1 ? HORARIO[1].min - HORARIO[0].min : 30;
// [actividad, data-inicio (hora de Costa Rica), minutos, ronda, hora escrita]
const CALENDARIO = [["Llegada y confirmación", bases.fechaInicio + "T08:30", HORARIO[0].min - 8 * 60 - 30, 0, "8:30 a. m."]].concat(HORARIO.map((x, i) => ["Ronda " + x.ronda, bases.fechaInicio + "T" + hhmm(x.min), CICLO, x.ronda, x.hora + (i ? " (aprox.)" : "")]))
  .concat([["Premiación", bases.fechaInicio + "T" + hhmm(PREMIACION), 60, 0, horaTexto(PREMIACION) + " (aprox.)"]]);

const filas = CALENDARIO.map(([actividad, inicio, minutos, ronda, hora]) =>
  '            <tr data-inicio="' + inicio + '" data-minutos="' + minutos + '"' + (ronda ? ' data-ronda="' + ronda + '"' : "") + (ronda === 1 ? " data-primera-ronda" : "") + ">"
  + '<th scope="row" class="text-left font-semibold px-4 py-2">' + actividad + "</th>"
  + '<td class="px-4 py-2">Sábado 14 de noviembre</td><td class="px-4 py-2">' + hora + "</td></tr>").join("\n");

const desempates = bases.desempates.map((c) => "            <li>" + B.NOMBRE_DESEMPATE[c] + "</li>").join("\n");

module.exports = {
  bases,
  pagina: "tacho-chess-2.html",
  config: "js/tacho-chess.js",
  clase: "tacho",
  foco: "#064ca7",
  titulo: "Torneo Intereducativo Tacho Chess 2 — Liceo Anastasio Alfaro",
  descripcion: "Torneo Intereducativo de ajedrez Tacho Chess 2 del Liceo Anastasio Alfaro: sábado 14 de noviembre de 2026, ronda 1 a las 9:00 a.m. en el Gimnasio del Centro; 7 rondas a 10 minutos + 2 segundos, inscripción gratuita y premios por nivel, de primer grado a undécimo año.",
  nombrePie: "Tacho Chess 2",
  grupoNombre: "Nivel",
  comentario: `La página del Torneo Intereducativo Tacho Chess 2 del Liceo Anastasio
Alfaro: la misma que la del Centroamericano (css/centroamericano.css y
css/universidades.css), con el azul y el rojo del afiche y Tacho, su
mascota. Todo sale del afiche, salvo el ritmo y las rondas, que dio el
dueño; la cuenta regresiva es de js/torneo-hoy.js. Ver «La del Tacho Chess
2» en docs/decisiones/juegos-y-torneos.md.`,
  logo: { src: "img/tacho-chess-2/mascota.png", ancho: 450, alto: 755, alt: "Tacho, la mascota del torneo: un mapache con la camiseta del número 52 y un rey negro en la mano" },
  aliados: [{ src: "img/tacho-chess-2/logo-liceo.png", ancho: 276, alto: 276, alt: "Liceo Anastasio Alfaro, San José, 1952" }],
  portada: {
    pildora: "El Liceo Anastasio Alfaro te invita al",
    titulo: "Torneo Intereducativo",
    subtitulo: "Tacho Chess 2",
    caja: ["¡Inscripción gratuita!", "De primer grado a undécimo año"],
    datos: [
      ["📅", "Fecha", "Sábado 14 de noviembre de 2026"],
      ["🕣", "Hora", "A partir de las 8:30 a.m."],
      ["📍", "Sede", "Gimnasio del Centro, Liceo Anastasio Alfaro"],
    ],
  },
  textoOrganiza: "Quién organiza (el afiche) y quién arbitra (lo dio el dueño).",
  organiza: "Liceo Anastasio Alfaro (San José, 1952)",
  equipo: [
    ["Árbitro principal", "FA Jean Carlo Quesada Arauz"],
    ["Ritmo", "7 rondas a 10 minutos + 2 segundos"],
  ],
  // Los resultados, como en el Centroamericano (el buscador, la clasificación
  // y el podio por nivel, el proyector), con los datos de Pareo Integral:
  // js/torneo-pareo-datos.js los lee y los entrega a js/centroamericano-vivo.js.
  scriptsAntes: ["js/torneo-pareo-datos.js"],
  buscador: {
    texto: "Escribe su nombre o su apellido: te decimos su nivel, su puesto en el nivel, sus puntos, su mesa y su rival en la ronda que se juega, y contra quién jugó cada ronda.",
    ejemplo: "Solano",
  },
  // El profe ayuda en la página (js/tacho-chess-profe.js): va después de los
  // resultados, porque lee lo que esos pintan; sus dibujos, de js/avatar-profe-oscar.js.
  scripts: ["js/tacho-chess-resultados.js", "js/avatar-profe-oscar.js", "js/tacho-chess-profe.js"],
  menu: [["index.html", "Inicio"], ["#fichas", "Fichas"], ["#clasificacion", "Clasificación"], ["#inscribirme", "Inscribirme"], ["#calendario", "Calendario"]],
  hoy: {
    etiqueta: "El torneo",
    principal: "Sábado 14 de noviembre de 2026",
    detalle: "La llegada es a las 8:30 a.m. y la ronda 1 se juega a las 9:00 a.m., hora de Costa Rica, en el Gimnasio del Centro del Liceo Anastasio Alfaro.",
    enlaces: [["#calendario", "Ver el calendario completo"], ["#inscribirme", "Inscribirme gratis", "📝"]],
    termino: "Tacho Chess 2 terminó",
    gracias: "¡Gracias por jugar!",
    final: "Los mejores de cada nivel, de primer grado a undécimo año, reciben su premio.",
  },
  fichas: [
    { href: "#inscribirme", id: "ficha-inscribirme", color: "rojo", icono: "📝", titulo: "Inscribirme", texto: "La inscripción es gratuita: se hace con el formulario de la organización, el del código QR del afiche.", accion: "Inscribirme" },
    { href: BASES_PDF, id: "ficha-bases", externo: true, ventana: "Bases de Tacho Chess 2", color: "morado", icono: "📄", titulo: "Bases del torneo", texto: "Las bases completas: participantes, inscripción, sistema, ritmo, calendario, desempates y premiación.", accion: "Abrir el PDF" },
    { href: "#calendario", color: "naranja", icono: "🗓️", titulo: "Calendario de rondas", texto: "La hora de cada una de las siete rondas y de la premiación.", accion: "Ver el calendario" },
    { href: "#premios", color: "rojo", icono: "🏆", titulo: "Niveles y premios", texto: "Cuatro torneos: de primero a tercer grado, de cuarto a sexto, sétimo y octavo, y de noveno a undécimo. 1.º, 2.º y 3.º lugar de cada nivel.", accion: "Ver los torneos" },
    { href: "#reglamento", color: "azul", icono: "📋", titulo: "Reglamento", texto: "El sistema, el ritmo de juego, la tolerancia, los desempates y los celulares.", accion: "Ver el reglamento" },
    // «Pronto» hasta que el torneo esté publicado en Pareo Integral: entonces
    // js/tacho-chess-resultados.js la cambia por el enlace a ESE torneo.
    { href: "#clasificacion", color: "morado", icono: "🏆", titulo: "Clasificación por nivel", texto: "Cada nivel con su puesto, sus puntos y su rendimiento, como se premia.", accion: "Ver la clasificación" },
    { href: "#medallero", color: "naranja", icono: "🥇", titulo: "El podio de cada nivel", texto: "El 1.º, 2.º y 3.º lugar de cada nivel, con sus puntos.", accion: "Ver el podio" },
    { href: "#proyector", color: "azul", icono: "📺", titulo: "Para proyectar", texto: "Los pareos y la clasificación en letra grande, para una pantalla en el gimnasio.", accion: "Abrir en grande" },
    { id: "ficha-resultados", pronto: "aparece cuando el torneo se publique en Pareo Integral", color: "azul", icono: "♟️", titulo: "Los torneos en Pareo Integral", texto: "Cada torneo completo en Pareo Integral: los emparejamientos de cada ronda y la clasificación general." },
    { href: "#ademas", color: "verde", icono: "🎉", titulo: "Además disfruta de", texto: "Feria de comerciantes de la comunidad, open house del liceo y venta de comida.", accion: "Ver qué hay" },
    { href: "#contacto", color: "rojo", icono: "📞", titulo: "Contacta a la organización", texto: "Adriana, de la organización: llámala o escríbele por WhatsApp.", accion: "Ver el contacto" },
    { href: "https://www.google.com/maps/search/?api=1&query=Liceo+Anastasio+Alfaro+San+Jos%C3%A9+Costa+Rica", externo: true, color: "verde", icono: "📍", titulo: "Cómo llegar", texto: "El Gimnasio del Centro, en el Liceo Anastasio Alfaro (San José).", accion: "Abrir el mapa" },
  ],
  despedida: { href: "#inscribirme", titulo: "¡Te esperamos, haz tu mejor jugada!", texto: "Ven, juega y diviértete el sábado 14 de noviembre. La inscripción es gratuita.", accion: "Inscribirme" },
  dialogos: {
    tituloClasificacion: "Clasificación por nivel",
    podio: "El 1.º, 2.º y 3.º lugar de cada nivel, según la clasificación de su torneo en Pareo Integral. Es provisional hasta la última ronda.",
    clasificacion: "Cada nivel por separado, en el orden de la clasificación de su torneo en Pareo Integral (con sus desempates), con los puntos y el rendimiento.",
    propios: [
      {
        id: "inscribirme", icono: "📝", titulo: "Inscribirme",
        comentario: `La inscripción: el formulario es de la organización (Google Forms), el del
código QR del afiche. Se abre encima con js/ventana-enlace.js; la página no
guarda nada.`,
        cuerpo: `<div class="mt-6 grid gap-5">
    <div class="${tarjeta}">
        ${h3}Es gratis</h3>
        <p class="${texto}">La inscripción no cuesta nada. Se hace con el formulario en línea de la organización del Liceo Anastasio Alfaro: es el mismo del código QR del afiche.</p>
        <p class="mt-4"><a href="${FORMULARIO}" target="_blank" rel="noopener" data-ventana="Inscripción a Tacho Chess 2" class="tacho-boton">Abrir el formulario de inscripción</a></p>
    </div>
    <div class="${tarjeta}">
        ${h3}Quién puede jugar</h3>
        <p class="${texto}">Estudiantes de centros educativos, de primer grado a undécimo año. Se premia a los mejores de cada nivel.</p>
    </div>
</div>
<p class="mt-4 text-sm">El formulario es de la organización: lo que se escribe ahí lo recibe el liceo, no Ajedrez Integral (ver la <a href="privacidad.html" target="_blank" rel="noopener" class="underline underline-offset-2 hover:no-underline">política de privacidad<span class="sr-only"> (se abre en otra pestaña)</span></a>).</p>
`,
      },
      {
        id: "premios", icono: "🏆", titulo: "Niveles y premios",
        comentario: "Los cuatro torneos y sus niveles (TORNEOS, arriba). Se premia por nivel, como\ndice el afiche: «los mejores de cada nivel de primer grado a undécimo año».",
        cuerpo: `<p class="text-brand-600 dark:text-brand-300 mt-2">Los once niveles se juntan en cuatro torneos para jugar.</p>
<p class="mt-2 font-semibold">${PREMIO_TEXTO}</p>
<div class="mt-6 grid sm:grid-cols-2 gap-5">
${TORNEOS.map((t) => `    <div class="${tarjeta}" data-torneo>
        ${h3}${t[0]}</h3>
        <ul class="mt-2 space-y-1 text-sm text-brand-600 dark:text-brand-300 list-disc pl-5">
${nivelesDe(t).map((n) => "            <li>" + n + "</li>").join("\n")}
        </ul>
    </div>`).join("\n")}
</div>
`,
      },
      {
        id: "calendario", icono: "🗓️", titulo: "Calendario", ancho: "max-w-3xl",
        comentario: "El calendario: de aquí lee js/torneo-hoy.js las horas (data-inicio, hora de\nCosta Rica, y data-minutos, lo que dura) para «Hoy en el torneo». Sale del\nhorario de las bases (BasesTorneo.horario), el mismo del PDF.",
        cuerpo: `<p class="text-brand-600 dark:text-brand-300 mt-2">Todas las horas son de Costa Rica. De 8:30 a 9:00 a.m., llegada y confirmación de los inscritos. La ronda 1 empieza a las 9:00 a.m.; las demás son aproximadas: cada una empieza cuando termina la anterior.</p>
<div class="mt-6 overflow-x-auto rounded-2xl border border-brand-100 dark:border-brand-800 bg-white dark:bg-brand-900">
    <table class="w-full text-sm">
        <caption class="sr-only">Calendario del Torneo Intereducativo Tacho Chess 2</caption>
        <thead class="bg-brand-100 dark:bg-brand-800 text-brand-800 dark:text-white">
            <tr><th scope="col" class="text-left px-4 py-3">Actividad</th><th scope="col" class="text-left px-4 py-3">Día</th><th scope="col" class="text-left px-4 py-3">Hora</th></tr>
        </thead>
        <tbody class="divide-y divide-brand-100 dark:divide-brand-800">
${filas}
        </tbody>
    </table>
</div>
<p class="mt-4 text-sm">Cada partida dura como mucho unos 25 minutos: 10 minutos por jugador, más 2 segundos por cada jugada.</p>
`,
      },
      {
        id: "reglamento", icono: "📋", titulo: "Lo esencial del reglamento", ancho: "max-w-5xl",
        comentario: "Lo esencial de las bases (el PDF sale de los mismos datos).",
        cuerpo: `<div class="mt-6 grid sm:grid-cols-2 gap-5">
    <div class="${tarjeta}">
        ${h3}Sistema y ritmo</h3>
        <ul class="mt-2 space-y-1 text-sm text-brand-600 dark:text-brand-300 list-disc pl-5">
            <li>Sistema suizo a 7 rondas, con el Sistema Holandés de la FIDE.</li>
            <li>10 minutos por jugador para toda la partida, con 2 segundos de incremento por jugada desde la primera: ajedrez rápido (Apéndice A de las Leyes del Ajedrez).</li>
            <li>Árbitro principal: FA Jean Carlo Quesada Arauz.</li>
            <li>Tolerancia de 10 minutos desde la hora de inicio de la ronda.</li>
            <li>Ganada, 1 punto; tablas, ½; perdida, 0. El bye del emparejamiento vale 1 punto.</li>
        </ul>
    </div>
    <div class="${tarjeta}">
        ${h3}Desempates, en orden</h3>
        <ol class="mt-2 space-y-1 text-sm text-brand-600 dark:text-brand-300 list-decimal pl-5">
${desempates}
        </ol>
    </div>
    <div class="${tarjeta}">
        ${h3}Resultados</h3>
        <p class="${texto}">Los emparejamientos de cada ronda, los resultados y la clasificación se publican en Pareo Integral: la ficha «Resultados» de esta página los abre.</p>
    </div>
    <div class="${tarjeta}">
        ${h3}Celulares</h3>
        <p class="${texto}">Durante la partida, el celular va completamente apagado y guardado en el bolso (Leyes del Ajedrez, 11.3.2). Quien lo tenga encendido pierde la partida.</p>
    </div>
    <div class="${tarjeta}">
        ${h3}Cuatro torneos y premiación</h3>
        <p class="${texto}">${TORNEOS_TEXTO}</p>
    </div>
    <div class="${tarjeta}">
        ${h3}Lo que no esté en las bases</h3>
        <p class="${texto}">Se resuelve con las Leyes del Ajedrez de la FIDE vigentes. Participar en el torneo es aceptar las bases.</p>
    </div>
</div>
`,
      },
      {
        id: "resultados", icono: "♟️", titulo: "Resultados",
        comentario: `Los resultados, en Pareo Integral. Solo se abre si la organización juega los
niveles en varios torneos: js/tacho-chess-resultados.js pone aquí un enlace
por torneo (con uno solo, la ficha lleva directo a él).`,
        cuerpo: `<p id="resultados-estado" class="text-brand-600 dark:text-brand-300 mt-2">Los resultados se publican en Pareo Integral cuando empieza el torneo.</p>
<ul id="resultados-lista" class="mt-4 grid gap-3"></ul>
`,
      },
      {
        id: "contacto", icono: "📞", titulo: "Contacta a la organización",
        comentario: "El contacto de la organización: Adriana (lo dio el dueño). Sin foto, sus\niniciales; WhatsApp y el teléfono se van afuera (no se dejan enmarcar).",
        cuerpo: `<p class="text-brand-600 dark:text-brand-300 mt-2">¿Tienes alguna pregunta sobre el torneo o la inscripción? Llama o escribe por WhatsApp.</p>
<div class="mt-6 flex flex-col items-center text-center rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 shadow-sm p-6 max-w-sm mx-auto">
    <span class="tacho-iniciales" aria-hidden="true">A</span>
    <h3 class="mt-4 font-bold text-lg text-brand-800 dark:text-white">Adriana</h3>
    <p class="tacho-cargo text-sm font-semibold uppercase tracking-wide">Organización</p>
    <p class="mt-3 text-sm text-brand-600 dark:text-brand-300"><a href="tel:+50689122033" class="tacho-enlace font-semibold underline underline-offset-2 hover:no-underline rounded">+506 8912-2033</a></p>
    <a href="https://wa.me/50689122033" target="_blank" rel="noopener" class="tacho-boton mt-4 w-full">WhatsApp<span class="sr-only"> de Adriana (se abre en otra pestaña)</span></a>
</div>
`,
      },
      {
        id: "ademas", icono: "🎉", titulo: "Además disfruta de",
        comentario: "Lo que el afiche anuncia además del torneo.",
        cuerpo: `<div class="mt-6 grid sm:grid-cols-3 gap-5">
    <div class="${tarjeta}">
        ${h3}<span aria-hidden="true">🏪 </span>Feria de comerciantes de la comunidad</h3>
        <p class="${texto}">Apoyemos lo nuestro.</p>
    </div>
    <div class="${tarjeta}">
        ${h3}<span aria-hidden="true">🚪 </span>Open house</h3>
        <p class="${texto}">Conoce nuestro centro educativo.</p>
    </div>
    <div class="${tarjeta}">
        ${h3}<span aria-hidden="true">🍴 </span>Venta de comida</h3>
        <p class="${texto}">Deliciosas opciones para todos.</p>
    </div>
</div>
<p class="mt-4 text-sm font-semibold">Estrategia · Disciplina · Respeto · Pasión · Comunidad</p>
`,
      },
    ],
  },
  pie: [
    { href: BASES_PDF, externo: true, ventana: "Bases de Tacho Chess 2", texto: "Bases del torneo" },
    { href: "#calendario", texto: "Calendario" },
    { href: "#reglamento", texto: "Reglamento" },
    { href: "#inscribirme", texto: "Inscribirme" },
  ],
  cabeceraJs: `La página del Torneo Intereducativo Tacho Chess 2 del Liceo Anastasio
Alfaro (tacho-chess-2.html). La misma que la del Centroamericano: la cuenta
regresiva la arma js/torneo-hoy.js. Lo propio:

- La cara de la imagen para compartir: el azul y el rojo del afiche y Tacho.
- Los textos de «Hoy en el torneo» cuando el torneo ya terminó (\`hoy\`).`,
  contraste: "blanco sobre #064CA7 8,08 y sobre #042A69 13,63; blanco sobre el rojo #DC0D19 5,1; #B80F1C sobre #EEF3FB 6,1.",
  torneoPagina: {
    sala: "tacho-chess-2",
    fuente: "pareo",
    fuenteNombre: "Pareo Integral",
    pareo: { nombre: "tacho", desde: "2026-10-01" },
    ordenGrupos: NIVELES,
    guardado: "tacho",
    nombreCorto: "Tacho Chess 2",
    imgSub: "Torneo Intereducativo · Liceo Anastasio Alfaro",
    compartir: "en el Torneo Intereducativo Tacho Chess 2:",
    imagen: { banda: "#042a69", tinta: "#042a69", acento: "#dc0d19", suave: "#eef3fb", archivo: "tacho-chess-2", franjas: [["#dc0d19", 1046], ["#042a69", 1060]] },
  },
};

/*! rev bfb5bbb0d2d82f9f */
