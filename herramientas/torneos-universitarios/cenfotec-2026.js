/* La configuración de cenfotec-2026.html, la página del Desafío Mentes
 * Maestras CENFOTEC 2026. De aquí salen la página y js/cenfotec.js con
 * herramientas/torneo-universitario.js (ver su cabecera).
 *
 * Los datos del torneo (fecha, sala, ritmo, rondas, árbitros) son los de su
 * ficha de chess-results (tnr1503400). La edición 2025 (tnr1259931) es su
 * clasificación final de chess-results, como la guarda uni_clasificacion
 * (herramientas/universidades/clasificacion.sql), copiada el 25/10/2026.
 */
module.exports = {
  pagina: "cenfotec-2026.html",
  config: "js/cenfotec.js",
  clase: "cft",
  foco: "#23acf4",
  titulo: "Desafío Mentes Maestras CENFOTEC 2026 — resultados y clasificación",
  descripcion: "El Desafío Mentes Maestras 2026 de la Universidad CENFOTEC: el podio, la clasificación final, las rondas y el rendimiento de cada jugador, las partidas, el video de la transmisión y la comparación con la edición 2025.",
  nombrePie: "Desafío Mentes Maestras 2026",
  comentario: `La página del Desafío Mentes Maestras CENFOTEC 2026: la misma que la del
Centroamericano (css/centroamericano.css, js/centroamericano-vivo.js y
js/centroamericano-tablas.js), con la cara de la Universidad CENFOTEC
(css/universidades.css, js/cenfotec.js, js/torneo-podio.js). Los datos del torneo (fecha, sala,
ritmo, rondas, árbitros) salen de su ficha de chess-results (tnr1503400);
los resultados, de la Edge Function sala-jugadores con la sala «cenfotec».
Ver «La página del Desafío Mentes Maestras» en
docs/decisiones/juegos-y-torneos.md.`,
  logo: { src: "img/cenfotec/logo.png", ancho: 566, alto: 256, alt: "Universidad CENFOTEC: somos lo que sabemos" },
  portada: {
    pildora: "Universidad CENFOTEC",
    titulo: "Desafío Mentes Maestras",
    subtitulo: "CENFOTEC 2026",
    caja: ["Torneo", "terminado"],
    datos: [
      ["📅", "Fecha", "Domingo 27 de setiembre de 2026"],
      ["📍", "Sede", "Auditorio Richard Beck Student Center, Universidad CENFOTEC, San José"],
      ["♟️", "Ritmo", "7 rondas, 10 minutos + 5 segundos por jugada"],
    ],
  },
  organiza: "Universidad CENFOTEC",
  equipo: [
    ["Dirección del torneo", "Laura Gamboa"],
    ["Árbitro principal", "FA Jean Quesada Arauz"],
    ["Árbitro", "Allan Quiros Cajina"],
  ],
  buscador: {
    texto: "Escribe su nombre o su apellido: te decimos en qué puesto quedó, sus puntos, contra quién jugó cada ronda, su rendimiento y cómo le fue en 2025.",
    ejemplo: "Ortega",
  },
  // Las fichas, en orden. `ventana`: se abre encima (js/ventana-enlace.js);
  // `externo`: sin JavaScript, en otra pestaña; `despues`: va detrás de
  // «Ediciones anteriores».
  fichas: [
    { href: "https://s1.chess-results.com/tnr1503400.aspx?lan=2", id: "ficha-resultados", externo: true, ventana: "Resultados en chess-results", color: "morado", icono: "📊", titulo: "Resultados en chess-results", texto: "La ficha oficial del torneo: inscritos, pareos, resultados y clasificación de cada ronda.", accion: "Abrir chess-results" },
    { href: "transmision.html?torneo=cenfotec", id: "ficha-partidas", ventana: "Las partidas", color: "azul", icono: "♟️", titulo: "Las partidas", texto: "La sala de la transmisión de Lichess: cada tablero, jugada a jugada, en la pantalla grande.", accion: "Entrar a la sala" },
    { href: "https://www.youtube-nocookie.com/embed/QPOZrd7IFrg", id: "ficha-video", externo: true, ventana: "El video de la transmisión", color: "rojo", icono: "🎥", titulo: "El video de la transmisión", texto: "La transmisión del torneo en YouTube, para volver a verla.", accion: "Ver el video" },
    { href: "#clasificacion", color: "morado", icono: "🏆", titulo: "Clasificación final", texto: "Los 34 jugadores en su puesto, con los puntos y el rendimiento de cada uno.", accion: "Ver la clasificación" },
    { href: "#medallero", color: "naranja", icono: "🥇", titulo: "El podio", texto: "Los tres primeros lugares del torneo, con sus puntos.", accion: "Ver el podio" },
    { href: "#proyector", color: "azul", icono: "📺", titulo: "Para proyectar", texto: "La clasificación final en letra grande, para una pantalla o una premiación.", accion: "Abrir en grande" },
    { href: "#ajedrez-cenfotec", color: "verde", icono: "🎓", titulo: "El ajedrez en CENFOTEC", texto: "El otro torneo de la universidad, el FedeU-CENFOTEC, y cómo se inscribe.", accion: "Ver la información", despues: true },
    { href: "#contacto", color: "verde", icono: "✉️", titulo: "Contacta a la organización", texto: "El correo de ajedrez de la Universidad CENFOTEC.", accion: "Ver el contacto", despues: true },
    { href: "torneos-en-vivo.html", ventana: "Más torneos", color: "naranja", icono: "🏁", titulo: "Más torneos", texto: "Los demás torneos que se transmiten en Ajedrez Integral.", accion: "Ver los torneos", despues: true },
  ],
  colorEdiciones: "rojo",
  textoEdiciones: "Los campeones de cada año y quién volvió de 2025, con su puesto en cada edición.",
  despedida: { href: "#contacto", texto: "¿Te quedó alguna duda del torneo? Aquí está el correo de la organización.", accion: "Ver el contacto" },
  dialogos: {
    podio: "Los tres primeros lugares, según la clasificación final de chess-results.",
    clasificacion: "Todos los jugadores, en el orden de chess-results, con los puntos y el rendimiento de cada uno.",
    ediciones: "Los campeones de cada edición y los jugadores que volvieron, con su puesto en cada una, según las clasificaciones finales de chess-results.",
    propios: [
      {
        id: "contacto", icono: "✉️", titulo: "Contacta a la organización",
        comentario: `El contacto: el correo de ajedrez que publica la universidad en
ucenfotec.ac.cr/ajedrez. Ningún teléfono: no hay uno confirmado para
este torneo, y no se pone uno que no sea.`,
        cuerpo: `<p class="text-brand-600 dark:text-brand-300 mt-2">Las consultas sobre el torneo, sus reglas o un resultado van al correo de ajedrez de la Universidad CENFOTEC.</p>
<div class="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 shadow-sm p-5 sm:p-6">
    <span class="cac-icono shrink-0" aria-hidden="true">✉️</span>
    <div class="flex-1 min-w-0">
        <h3 class="font-bold text-lg text-brand-800 dark:text-white">Correo de ajedrez de CENFOTEC</h3>
        <p class="text-sm text-brand-600 dark:text-brand-300 break-all">ajedrez@ucenfotec.ac.cr</p>
    </div>
    <a href="mailto:ajedrez@ucenfotec.ac.cr" class="shrink-0 text-center bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2">Escribir un correo</a>
</div>
<p class="mt-4 text-sm text-brand-600 dark:text-brand-300">El otro torneo de la universidad y cómo se inscribe están en la ficha «El ajedrez en CENFOTEC».</p>`,
      },
      {
        id: "ajedrez-cenfotec", icono: "🎓", titulo: "El ajedrez en CENFOTEC",
        comentario: `«El ajedrez en CENFOTEC»: ucenfotec.ac.cr no se deja mostrar dentro de
otra página (X-Frame-Options: SAMEORIGIN), así que lo que dice su
página de ajedrez va aquí, encima, copiado tal cual de ella (octubre de
2026). Su página queda para abrirla aparte, sin dejar esta.`,
        cuerpo: `<p class="text-brand-600 dark:text-brand-300 mt-2">Además del Desafío Mentes Maestras, la universidad organiza con la Federación Deportiva Universitaria (FedeU) el <strong>Torneo Ajedrez FedeU-CENFOTEC</strong>: un torneo individual universitario, femenino y masculino. Esto es lo que publica su página para la edición 2026.</p>
<dl class="mt-5 grid sm:grid-cols-2 gap-4">
    <div class="rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 p-5"><dt class="text-sm font-bold text-brand-600 dark:text-brand-300">Fecha y horario</dt><dd class="mt-1 font-semibold">Sábado 23 de mayo de 2026, de 8:00 a.m. a 4:00 p.m.</dd></div>
    <div class="rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 p-5"><dt class="text-sm font-bold text-brand-600 dark:text-brand-300">Lugar</dt><dd class="mt-1 font-semibold">Auditorio de la Universidad CENFOTEC, Barrio Francisco Peralta, San José</dd></div>
    <div class="rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 p-5"><dt class="text-sm font-bold text-brand-600 dark:text-brand-300">Inscripción</dt><dd class="mt-1 font-semibold">₡5000 (no afiliados a FedeU) y ₡3000 (afiliados a FedeU). Cerraba el 15 de mayo a las 5:00 p.m.</dd></div>
    <div class="rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 p-5"><dt class="text-sm font-bold text-brand-600 dark:text-brand-300">Premios</dt><dd class="mt-1 font-semibold">En cada categoría (femenina y masculina): trofeo al primer lugar y medalla al segundo y al tercero</dd></div>
</dl>
<p class="mt-5 text-sm text-brand-600 dark:text-brand-300">La inscripción la hace la coordinación deportiva de cada universidad, a nombre de sus atletas, con la planilla y las normas específicas que publica la universidad. Las consultas van a <a href="mailto:ajedrez@ucenfotec.ac.cr" class="text-accent-700 dark:text-accent-400 font-semibold underline underline-offset-2 hover:no-underline">ajedrez@ucenfotec.ac.cr</a>.</p>
<p class="mt-4"><a href="https://ucenfotec.ac.cr/ajedrez/" target="_blank" rel="noopener" class="inline-block bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2">Ver su página en otra pestaña ↗<span class="sr-only"> (esta página queda abierta)</span></a></p>`,
      },
    ],
  },
  pie: [
    { href: "#clasificacion", texto: "Clasificación final" },
    { href: "#ediciones", texto: "Ediciones anteriores" },
    { href: "transmision.html?torneo=cenfotec", ventana: "Las partidas", texto: "Las partidas" },
    { href: "https://s1.chess-results.com/tnr1503400.aspx?lan=2", externo: true, ventana: "Resultados en chess-results", texto: "chess-results" },
  ],
  cabeceraJs: `La página del Desafío Mentes Maestras CENFOTEC 2026 (cenfotec-2026.html).

Usa las mismas piezas que la del Centroamericano: el buscador, «Mis
jugadores», el podio, la clasificación, el proyector y la imagen para
compartir salen de js/centroamericano-vivo.js y js/centroamericano-tablas.js
(«El podio» de arriba, de js/torneo-podio.js, y «Ediciones anteriores», de
js/torneo-ediciones.js), con los datos de chess-results que lee la Edge
Function sala-jugadores para la sala «cenfotec» de Torneos. Lo único propio
es window.TorneoPagina: la sala, el prefijo de lo guardado en el aparato, la
cara de la imagen para compartir (el azul y el logo de CENFOTEC) y la
edición 2025.`,
  contraste: "blanco sobre #233065 12,48; #233065 sobre blanco 12,48 y sobre #EEF6FD 11,44.",
  torneoPagina: {
    sala: "cenfotec",
    guardado: "cft",
    nombreCorto: "Mentes Maestras",
    imgSub: "Desafío Mentes Maestras 2026 · Universidad CENFOTEC",
    compartir: "en el Desafío Mentes Maestras CENFOTEC 2026:",
    imagen: { banda: "#233065", tinta: "#233065", acento: "#233065", suave: "#eef6fd", archivo: "mentes-maestras-2026", franjas: [["#23acf4", 1046], ["#233065", 1060]] },
  },
  edicion: "2026",
  // En 2025 chess-results lo escribió «Ocontrillo»; en 2026, «Oconitrillo»
  // (el apellido de verdad): los mismos dos apellidos salvo una letra y el
  // mismo nombre.
  mismaPersona: { "Ocontrillo Rodriguez, Gerald": "Oconitrillo Rodriguez, Gerald" },
  ediciones: [
    {
      nombre: "2025", fecha: "2025-09-28",
      grupos: {
        "—": {
          tnr: 1259931,
          jugadores: [
            [1, "Ulloa Jimenez, Santiago", 6], [2, "Barrantes Granados, Ian Daniel", 5.5], [3, "Gutierrez Chavarria, Joseph", 5.5],
            [4, "Ramos Rodriguez, Daniel", 5], [5, "Miranda Flores, Samy Manuel", 5], [6, "Brizuela Hidalgo, Sebastian", 5],
            [7, "Aguirre Moya, David Andres", 5], [8, "Rojas Ordonez, Christian Gabriel", 4.5], [9, "Salazar Delgado, Aylin Naomi", 4.5],
            [10, "Hernandez Brenes, Keicy", 4.5], [11, "Gonzalez Barrantes, Aaron Yoreth", 4.5], [12, "Valverde Vega, Santiago", 4],
            [13, "Hincapie Salazar, Daniel", 4], [14, "Soto Sandi, Fabian", 4], [15, "Velasquez Mora, Steven Daniel", 4],
            [16, "Esquivel Elizondo, Jeremy", 4], [17, "Reyes Sarmiento, Aaron", 4], [18, "Castro Meza, Jose Alfredo", 4],
            [19, "Herrera Bonilla, Keison Jesus", 3.5], [20, "Dodaro Gamez, Alessandro", 3.5], [21, "Yep Chaves, Jesus Allen", 3.5],
            [22, "Malavasi Castro, Stefano", 3], [23, "Valverde Cordero, Juan Pablo", 3], [24, "Morales Monge, Andrey", 3],
            [25, "Leiton Rivas, Mariana", 3], [26, "Hernandez Zuniga, Mathias Alberto", 3], [27, "Vindas Gomez, Ashlie Valeria", 3],
            [28, "Ocontrillo Rodriguez, Gerald", 3], [29, "Miranda Fonseca, Gian Francisco", 3], [30, "Lopez Perez, Heddly Jefte", 2.5],
            [31, "Pictan, Esteban Guillermo", 2.5], [32, "Perez Franco, Andrew De Dojshua", 2], [33, "Munoz Araya, Dereck Daniel", 2],
            [34, "Jaubert Escudero, Mariam", 2], [35, "Jimenez Pacheco, Luis Esteban", 2], [36, "Mora Vasquez, Gabriel", 1.5],
            [37, "Murillo Lara, Kheysi Camila", 1], [38, "Calderon Brenes, Tiffany", 0], [39, "Ardon Porras, Andres", 0],
            [40, "Ortiz Montenegro, Yoycel", 0], [41, "Marin Gonzalez, Roncey", 0], [42, "Serrano Ruiz, Felipe", 0],
          ],
        },
      },
    },
  ],
};
