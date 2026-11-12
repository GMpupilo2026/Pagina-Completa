/* La configuración de jdn-pz-2026.html, la página de la Eliminatoria Cantonal
 * JDN CCDRPZ – ADAPZ 2026 (Pérez Zeledón). De aquí salen la página y
 * js/jdn-pz.js con herramientas/torneo-universitario.js (ver su cabecera).
 * No es un torneo universitario, pero es la misma página (la del
 * Centroamericano) y la misma plantilla.
 *
 * A diferencia de las universitarias, este torneo todavía no se juega
 * (domingo 22 de noviembre de 2026): lleva «Hoy en el torneo» con la cuenta
 * regresiva (`hoy`, js/torneo-hoy.js) en lugar de «El podio», y lo de antes
 * del torneo en diálogos propios (inscripciones, categorías, calendario,
 * reglamento). Todo sale de las bases que firmó el árbitro principal el
 * 11/11/2026 (documentos/jdn-pz-2026/); lo que las bases no traen (teléfono,
 * correo, enlace de chess-results, transmisión) no se pone.
 *
 * - El congresillo: las bases dicen «viernes 20 de junio», una errata (el
 *   torneo es en noviembre). No se le pone fecha ni hora hasta que la
 *   organización la confirme: el calendario dice que es virtual y que el
 *   enlace llega por el chat oficial.
 * - Sin chess-results (lo decidió el dueño): el torneo se dirige en Pareo
 *   Integral, dos torneos (U12, y U20 con la U16), publicados por la
 *   organización ADAPZ con el sello «Organizador verificado». Con
 *   `resultados: "pareo"` la página no lleva el buscador ni la clasificación
 *   de chess-results; sus fichas de resultados abren encima la página pública
 *   de cada torneo en Pareo, y el formulario de «Inscribirme» manda cada
 *   inscripción al torneo de su categoría. Lo hace js/jdn-pz-inscripcion.js,
 *   que encuentra los dos torneos solo (ver su cabecera).
 */
const tarjeta = "rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 p-6";
const h3 = '<h3 class="font-bold text-brand-800 dark:text-white">';
const texto = "mt-2 text-sm text-brand-600 dark:text-brand-300";
// Un campo del formulario de inscripción: borde visible y el foco en el azul de la página.
const campo = "mt-1 w-full rounded-lg border border-brand-300 dark:border-brand-700 bg-white dark:bg-brand-950 px-3 py-2 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d64b0]";

// Las filas del calendario: [actividad, data-inicio (hora de Costa Rica), minutos, ronda, hora escrita].
const CALENDARIO = [
  ["Ronda 1", "2026-11-22T08:00", 120, 1, "8:00 a.m."],
  ["Ronda 2", "2026-11-22T10:00", 120, 2, "10:00 a.m."],
  ["Almuerzo", "2026-11-22T12:00", 60, 0, "12:00 p.m."],
  ["Ronda 3", "2026-11-22T13:00", 120, 3, "1:00 p.m."],
  ["Ronda 4", "2026-11-22T15:00", 120, 4, "3:00 p.m."],
  ["Ronda 5", "2026-11-22T17:00", 120, 5, "5:00 p.m."],
  ["Clausura", "2026-11-22T19:30", 60, 0, "7:30 p.m."],
];

const filas = CALENDARIO.map(([actividad, inicio, minutos, ronda, hora]) =>
  '            <tr data-inicio="' + inicio + '" data-minutos="' + minutos + '"' + (ronda ? ' data-ronda="' + ronda + '"' : "") + (ronda === 1 ? " data-primera-ronda" : "") + ">"
  + '<th scope="row" class="text-left font-semibold px-4 py-2">' + actividad + "</th>"
  + '<td class="px-4 py-2">Domingo 22 de noviembre</td><td class="px-4 py-2">' + hora + "</td></tr>").join("\n");

module.exports = {
  pagina: "jdn-pz-2026.html",
  config: "js/jdn-pz.js",
  clase: "pz",
  foco: "#1d64b0",
  titulo: "Eliminatoria Cantonal JDN Pérez Zeledón 2026 — ADAPZ",
  descripcion: "La Eliminatoria Cantonal de ajedrez de los Juegos Deportivos Nacionales en Pérez Zeledón, domingo 22 de noviembre de 2026 en el Hotel del Sur: categorías U12, U16 y U20, calendario, reglamento, bases y resultados.",
  nombrePie: "Eliminatoria JDN Pérez Zeledón",
  grupoNombre: "Categoría",
  comentario: `La página de la Eliminatoria Cantonal JDN CCDRPZ – ADAPZ 2026: la
misma que la del Centroamericano (css/centroamericano.css y
css/universidades.css; js/centroamericano-vivo.js, -tablas.js y
js/torneo-hoy.js, configurados por js/jdn-pz.js), con el azul y el logo
de la Asociación Deportiva de Ajedrez de Pérez Zeledón. Los datos salen de
las bases (documentos/jdn-pz-2026/). Ver «La de la Eliminatoria Cantonal
JDN de Pérez Zeledón» en docs/decisiones/juegos-y-torneos.md.`,
  logo: { src: "img/adapz/logo.jpg", ancho: 349, alto: 349, alt: "Asociación Deportiva de Ajedrez de Pérez Zeledón", redondo: true },
  aliados: [{ src: "img/adapz/ccdr-pz.jpg", ancho: 404, alto: 404, alt: "CCDR Pérez Zeledón" }],
  portada: {
    pildora: "Juegos Deportivos Nacionales 2026",
    titulo: "Eliminatoria Cantonal de Ajedrez",
    subtitulo: "Pérez Zeledón 2026",
    caja: ["U12 · U16 · U20", "Absoluto y Femenino"],
    datos: [
      ["📅", "Fecha", "Domingo 22 de noviembre de 2026"],
      ["📍", "Sede", "Hotel del Sur, Pérez Zeledón"],
      ["♟️", "Ritmo", "Suizo a 5 rondas, 30 minutos + 30 segundos por jugada"],
    ],
  },
  textoOrganiza: "Quién organiza, quién dirige y quién arbitra, como lo dicen las bases.",
  organiza: "ADAPZ, con el aval de la asociación El Guarco (AGUA)",
  equipo: [
    ["Dirección del torneo", "Itzel Karina Rojas Acuña"],
    ["Árbitro principal", "FA Jean Carlo Quesada Arauz"],
  ],
  resultados: "pareo",
  scripts: ["js/pareo/publicar.js", "js/jdn-pz-inscripcion.js"],
  menu: [["index.html", "Inicio"], ["#fichas", "Fichas"], ["#inscribirme", "Inscribirme"], ["torneos-pareo.html", "Torneos"]],
  hoy: {
    etiqueta: "La eliminatoria",
    principal: "Domingo 22 de noviembre de 2026",
    detalle: "La ronda 1 se juega a las 8:00 a.m., hora de Costa Rica, en el Hotel del Sur.",
    enlaces: [["#calendario", "Ver el calendario completo"], ["#inscribirme", "Inscribirme", "📝"]],
    termino: "La eliminatoria terminó",
    gracias: "¡Gracias por jugar!",
    final: "La clasificación final de cada categoría está en «Resultados U12» y «Resultados U20».",
  },
  fichas: [
    { href: "#inscribirme", id: "ficha-inscribirme", color: "rojo", icono: "📝", titulo: "Inscribirme", texto: "El formulario de inscripción: con el año de nacimiento va solo al torneo de su categoría, y el árbitro lo aprueba.", accion: "Inscribirme" },
    { href: "documentos/jdn-pz-2026/bases-eliminatoria-cantonal-jdn-pz-2026.pdf", id: "ficha-bases", externo: true, ventana: "Bases de la eliminatoria", color: "morado", icono: "📄", titulo: "Bases de la eliminatoria", texto: "Las bases oficiales completas: inscripciones, categorías, sistema, horario, desempates y organización.", accion: "Abrir el PDF" },
    { href: "torneos-pareo.html", id: "ficha-resultados-u12", ventana: "Resultados U12", color: "morado", icono: "♟️", titulo: "Resultados U12", texto: "El torneo U12 en Pareo Integral: inscritos, pareos de cada ronda, resultados y clasificación.", accion: "Ver el torneo U12" },
    { href: "torneos-pareo.html", id: "ficha-resultados-u20", ventana: "Resultados U20", color: "azul", icono: "♞", titulo: "Resultados U20", texto: "El torneo U20 (con la U16) en Pareo Integral: inscritos, pareos de cada ronda, resultados y clasificación.", accion: "Ver el torneo U20" },
    { href: "#inscripciones", color: "rojo", icono: "✅", titulo: "Quién puede jugar", texto: "Quién puede inscribirse, cuánto cuesta y hasta cuándo hay tiempo.", accion: "Ver las condiciones" },
    { href: "#categorias", color: "naranja", icono: "🎂", titulo: "Categorías", texto: "U12, U16 y U20, en Absoluto y Femenino, con los años de nacimiento de cada una.", accion: "Ver las categorías" },
    { href: "#calendario", color: "naranja", icono: "🗓️", titulo: "Calendario de rondas", texto: "La hora de cada una de las cinco rondas, el almuerzo y la clausura.", accion: "Ver el calendario" },
    { href: "#reglamento", color: "azul", icono: "📋", titulo: "Reglamento", texto: "El sistema, el ritmo de juego, la tolerancia, los desempates y lo que dicen las bases al final.", accion: "Ver el reglamento" },
    { href: "https://maps.app.goo.gl/VhAZtamiKgvUeNp86", externo: true, color: "verde", icono: "📍", titulo: "Cómo llegar", texto: "El Hotel del Sur, en Pérez Zeledón: la ubicación que dan las bases.", accion: "Abrir el mapa" },
  ],
  despedida: { href: "torneos-pareo.html", ventana: "Más torneos", titulo: "¡Nos vemos en el Hotel del Sur!", texto: "¿Quieres ver más? Aquí están los demás torneos de Costa Rica en Pareo Integral.", accion: "Ver los torneos" },
  dialogos: {
    propios: [
      {
        id: "inscribirme", icono: "📝", titulo: "Inscribirme", ancho: "max-w-3xl",
        comentario: `El formulario de inscripción (js/jdn-pz-inscripcion.js): busca los dos torneos
de Pareo Integral de la ADAPZ, elige el de la categoría por el año de
nacimiento y manda la inscripción a pareo-publicar («inscribir»). Queda
pendiente hasta que el árbitro la acepta en Pareo: entonces entra sola al
torneo. Los datos personales no se guardan en el navegador.`,
        cuerpo: `<p id="insc-estado-torneos" class="mt-2 text-sm font-semibold" role="status">Buscando los torneos de la eliminatoria en Pareo Integral…</p>
<form id="insc-form" class="mt-4 grid gap-4" novalidate>
    <fieldset class="${tarjeta} grid gap-4 sm:grid-cols-2">
        <legend class="font-bold text-brand-800 dark:text-white px-1">Quién juega</legend>
        <label class="block text-sm font-semibold">Apellidos
            <input id="insc-apellidos" name="apellidos" required maxlength="60" autocomplete="off" class="${campo}">
        </label>
        <label class="block text-sm font-semibold">Nombre
            <input id="insc-nombre" name="nombre" required maxlength="40" autocomplete="off" class="${campo}">
        </label>
        <label class="block text-sm font-semibold">Fecha de nacimiento
            <input id="insc-nacimiento" name="nacimiento" type="date" required min="2007-01-01" max="2020-12-31" class="${campo}">
        </label>
        <fieldset class="text-sm">
            <legend class="font-semibold">Rama</legend>
            <div class="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                <label class="inline-flex items-center gap-2"><input type="radio" name="sexo" value="M" required class="w-5 h-5"> Absoluto (masculino)</label>
                <label class="inline-flex items-center gap-2"><input type="radio" name="sexo" value="F" class="w-5 h-5"> Femenino</label>
            </div>
        </fieldset>
        <p id="insc-categoria" class="sm:col-span-2 text-sm font-bold" role="status" aria-live="polite"></p>
        <label class="block text-sm font-semibold">Club, colegio o escuela
            <input id="insc-institucion" name="institucion" maxlength="100" autocomplete="off" class="${campo}">
        </label>
        <div class="grid grid-cols-2 gap-3">
            <label class="block text-sm font-semibold">ID FIDE <span class="font-normal">(si tiene)</span>
                <input id="insc-fide" name="fide" inputmode="numeric" maxlength="12" autocomplete="off" class="${campo}">
            </label>
            <label class="block text-sm font-semibold">Elo <span class="font-normal">(si tiene)</span>
                <input id="insc-elo" name="elo" inputmode="numeric" maxlength="4" autocomplete="off" class="${campo}">
            </label>
        </div>
    </fieldset>
    <fieldset class="${tarjeta} grid gap-4 sm:grid-cols-2">
        <legend class="font-bold text-brand-800 dark:text-white px-1">Quién inscribe</legend>
        <label class="block text-sm font-semibold">Nombre de quien inscribe
            <input id="insc-responsable" name="responsable" required maxlength="100" autocomplete="name" class="${campo}">
        </label>
        <label class="block text-sm font-semibold">Correo o teléfono
            <input id="insc-contacto" name="contacto" required maxlength="120" autocomplete="email" class="${campo}">
        </label>
    </fieldset>
    <div class="${tarjeta} grid gap-3 text-sm">
        <label class="flex items-start gap-2"><input id="insc-afiliado" type="checkbox" required class="mt-0.5 w-5 h-5 shrink-0"> <span>Quien juega está afiliado a la ADAPZ y al día con la asociación (el torneo es cerrado: las bases lo piden).</span></label>
        <label class="flex items-start gap-2"><input id="insc-consentimiento" type="checkbox" required class="mt-0.5 w-5 h-5 shrink-0"> <span>Soy quien juega, su encargado o tengo su permiso, y acepto que estos datos se usen para inscribirlo en el torneo, como dice la <a href="privacidad.html" target="_blank" rel="noopener" class="underline underline-offset-2 hover:no-underline">política de privacidad<span class="sr-only"> (se abre en otra pestaña)</span></a>.</span></label>
    </div>
    <div>
        <button id="insc-enviar" type="submit" class="bg-accent-500 hover:bg-accent-600 text-brand-900 font-bold px-6 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50" disabled>Mandar la inscripción</button>
        <p id="insc-estado" class="mt-3 text-sm font-semibold" role="status" aria-live="polite"></p>
    </div>
</form>
<p class="mt-4 text-sm">La inscripción queda pendiente hasta que el árbitro la revisa; cuando la aprueba, el jugador aparece en «Resultados U12» o «Resultados U20». Las inscripciones cierran a las 10:00 p.m. del sábado 21 de noviembre.</p>
`,
      },
      {
        id: "inscripciones", icono: "📝", titulo: "Inscripciones",
        comentario: "Las inscripciones, como las dicen las bases.",
        cuerpo: `<div class="mt-6 grid sm:grid-cols-2 gap-5">
    <div class="${tarjeta}">
        ${h3}Quién puede jugar</h3>
        <p class="${texto}">Cualquier jugador o jugadora que se inscriba dentro del plazo y que no esté suspendido por la ADAPZ, la FCA o la FIDE. El torneo es cerrado: no está abierto al público.</p>
    </div>
    <div class="${tarjeta}">
        ${h3}Costo</h3>
        <p class="${texto}">Sin costo para los afiliados a la ADAPZ que estén al día con la asociación.</p>
    </div>
    <div class="${tarjeta} sm:col-span-2">
        ${h3}Hasta cuándo</h3>
        <p class="${texto}">Las inscripciones cierran a las 10:00 p.m. del sábado 21 de noviembre de 2026.</p>
    </div>
</div>
`,
      },
      {
        id: "categorias", icono: "♟️", titulo: "Categorías",
        comentario: "Las categorías y los torneos en que se juegan, como los dicen las bases.",
        cuerpo: `<div class="mt-6 overflow-x-auto rounded-2xl border border-brand-100 dark:border-brand-800 bg-white dark:bg-brand-900">
    <table class="w-full text-sm">
        <caption class="sr-only">Categorías de la Eliminatoria Cantonal JDN de Pérez Zeledón 2026</caption>
        <thead class="bg-brand-100 dark:bg-brand-800 text-brand-800 dark:text-white">
            <tr><th scope="col" class="text-left px-4 py-3">Categoría</th><th scope="col" class="text-left px-4 py-3">Nacidos de</th><th scope="col" class="text-left px-4 py-3">Edad</th></tr>
        </thead>
        <tbody class="divide-y divide-brand-100 dark:divide-brand-800">
            <tr><th scope="row" class="text-left font-semibold px-4 py-2">U12 Absoluto y Femenino</th><td class="px-4 py-2">2015 a 2020</td><td class="px-4 py-2">7 a 12 años</td></tr>
            <tr><th scope="row" class="text-left font-semibold px-4 py-2">U16 Absoluto y Femenino</th><td class="px-4 py-2">2011 a 2014</td><td class="px-4 py-2">13 a 16 años</td></tr>
            <tr><th scope="row" class="text-left font-semibold px-4 py-2">U20 Absoluto y Femenino</th><td class="px-4 py-2">2007 a 2010</td><td class="px-4 py-2">17 a 20 años</td></tr>
        </tbody>
    </table>
</div>
<p class="mt-4 text-sm">Se juegan <strong>dos torneos</strong>: U12 Absoluto y U20 Absoluto, con las categorías U16 y U20 en el mismo torneo. La organización puede fusionar las categorías según la cantidad de participantes.</p>
`,
      },
      {
        id: "calendario", icono: "🗓️", titulo: "Calendario", ancho: "max-w-3xl",
        comentario: "El calendario: de aquí lee js/torneo-hoy.js las horas (data-inicio, hora de\nCosta Rica, y data-minutos, lo que dura) para «Hoy en el torneo». Una sola\ncopia de las horas: la tabla.",
        cuerpo: `<p class="text-brand-600 dark:text-brand-300 mt-2">Todas las horas son de Costa Rica. El congresillo es virtual: el enlace se envía por el chat oficial.</p>
<div class="mt-6 overflow-x-auto rounded-2xl border border-brand-100 dark:border-brand-800 bg-white dark:bg-brand-900">
    <table class="w-full text-sm">
        <caption class="sr-only">Calendario de la Eliminatoria Cantonal JDN de Pérez Zeledón 2026</caption>
        <thead class="bg-brand-100 dark:bg-brand-800 text-brand-800 dark:text-white">
            <tr><th scope="col" class="text-left px-4 py-3">Actividad</th><th scope="col" class="text-left px-4 py-3">Día</th><th scope="col" class="text-left px-4 py-3">Hora</th></tr>
        </thead>
        <tbody class="divide-y divide-brand-100 dark:divide-brand-800">
${filas}
        </tbody>
    </table>
</div>
<p class="mt-4 text-sm">La clausura se adelanta si las rondas terminan antes.</p>
`,
      },
      {
        id: "reglamento", icono: "📋", titulo: "Lo esencial del reglamento", ancho: "max-w-5xl",
        comentario: "Lo esencial de las bases: sistema, ritmo, desempates, resultados y lo de\nal final.",
        cuerpo: `<div class="mt-6 grid sm:grid-cols-2 gap-5">
    <div class="${tarjeta}">
        ${h3}Sistema y ritmo</h3>
        <ul class="mt-2 space-y-1 text-sm text-brand-600 dark:text-brand-300 list-disc pl-5">
            <li>Suizo a 5 rondas (sistema holandés), con Swiss-Manager. La organización puede ajustar el número de rondas según los participantes de cada categoría.</li>
            <li>30 minutos con 30 segundos de incremento por jugada desde la primera.</li>
            <li>Tolerancia de 30 minutos desde el inicio de la sesión.</li>
            <li>Con las reglas de la FIDE, válido para el ranking internacional y el nacional.</li>
        </ul>
    </div>
    <div class="${tarjeta}">
        ${h3}Desempates, en orden</h3>
        <ol class="mt-2 space-y-1 text-sm text-brand-600 dark:text-brand-300 list-decimal pl-5">
            <li>Encuentro directo</li>
            <li>Buchholz con corte −1</li>
            <li>Buchholz</li>
            <li>Sonneborn-Berger</li>
            <li>Mayor número de victorias (cuentan las ganadas por ausencia)</li>
        </ol>
    </div>
    <div class="${tarjeta}">
        ${h3}Resultados y objeciones</h3>
        <p class="${texto}">Los pareos y resultados se publican durante el torneo, en Pareo Integral (las fichas «Resultados U12» y «Resultados U20» de esta página). Cada jugador revisa que su resultado quede bien anotado: no se aceptan objeciones después de publicada la ronda siguiente. En la última ronda hay cinco minutos para objetar, desde que termina la categoría.</p>
    </div>
    <div class="${tarjeta}">
        ${h3}Implementos</h3>
        <p class="${texto}">La organización pone los juegos y los relojes de ajedrez.</p>
    </div>
    <div class="${tarjeta} sm:col-span-2">
        ${h3}Derechos de imagen y aspectos finales</h3>
        <p class="${texto}">Con la inscripción, el jugador y su encargado autorizan a la ADAPZ a usar su imagen en sus publicaciones oficiales. El evento se rige por estas bases y por las bases generales de torneos individuales; lo que no contemplen lo resuelve el comité organizador.</p>
    </div>
</div>
`,
      },
    ],
  },
  pie: [
    { href: "documentos/jdn-pz-2026/bases-eliminatoria-cantonal-jdn-pz-2026.pdf", externo: true, ventana: "Bases de la eliminatoria", texto: "Bases de la eliminatoria" },
    { href: "#calendario", texto: "Calendario" },
    { href: "#reglamento", texto: "Reglamento" },
    { href: "#inscribirme", texto: "Inscribirme" },
  ],
  cabeceraJs: `La página de la Eliminatoria Cantonal JDN CCDRPZ – ADAPZ 2026
(jdn-pz-2026.html). La misma que la del Centroamericano: todo lo arman
js/centroamericano-vivo.js, js/centroamericano-tablas.js y
js/torneo-hoy.js; los resultados, Pareo Integral. Lo propio:

- La cara de la imagen para compartir: el azul y el logo de la ADAPZ,
  redondo (el logo es un JPG con su fondo blanco).
- Los textos de «Hoy en el torneo» cuando el torneo ya terminó (\`hoy\`).`,
  contraste: "blanco sobre #1F3A7A 10,80; #1F3A7A sobre blanco 10,80 y sobre #EEF6FD 9,89.",
  torneoPagina: {
    sala: "jdn-pz-2026",
    guardado: "jdnpz",
    nombreCorto: "Eliminatoria JDN Pérez Zeledón 2026",
    imgSub: "Eliminatoria Cantonal JDN · CCDR Pérez Zeledón · ADAPZ",
    compartir: "en la Eliminatoria Cantonal JDN de Pérez Zeledón 2026:",
    imagen: { banda: "#1f3a7a", tinta: "#1f3a7a", acento: "#1f3a7a", suave: "#eef6fd", archivo: "eliminatoria-jdn-pz-2026", franjas: [["#4aa3e3", 1046], ["#1f3a7a", 1060]] },
  },
};

/*! rev bfb5bbb0d2d82f9f */
