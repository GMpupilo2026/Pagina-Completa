/* Compila el CSS de Tailwind del sitio a css/tailwind.css.
 *
 * El sitio cargaba Tailwind desde cdn.tailwindcss.com, que es el modo de
 * juguete: baja ~400 KB de JavaScript y compila el CSS DENTRO del navegador, en
 * cada carga y de cada visitante. Por eso se veía ese parpadeo sin estilos al
 * entrar. Compilado una vez, el sitio entero son unos 55 KB de CSS que el
 * navegador cachea.
 *
 *   npm install tailwindcss@3
 *   node herramientas/css-construir.js
 *
 * **Al agregar una clase que no estaba en ninguna parte, hay que volver a
 * correrlo**: el compilador solo escribe las clases que encuentra en el código.
 * herramientas/verificar-css.js comprueba justamente eso, mirando las clases
 * que aparecen en el navegador con las páginas ya funcionando.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const CSS = path.join(RAIZ, "css");

// La paleta del sitio. Es la misma que estaba repetida en el <head> de las 72
// páginas: después vivió acá, y ahora vive en js/temas-plataforma.js — porque
// dejó de haber UNA paleta y hay una por tema (Clásico, Princesas, Bosque…).
//
// Los tonos ya NO se compilan dentro de cada clase: `bg-brand-800` pasó de
// valer `#102a43` a valer `rgb(var(--c-brand-800))`. Eso es lo que hace posible
// que un tema cambie la plataforma entera — las 2.628 veces que esa clase
// aparece escrita en el sitio se enteran de una, redefiniendo la variable — y
// es un cambio sin riesgo para el tema Clásico, que define esas variables con
// exactamente los mismos hex de siempre.
//
// <alpha-value> es lo que deja seguir usando `bg-brand-800/50` y
// `border-accent-400/30`: Tailwind lo reemplaza por la opacidad de la clase.
const { TEMAS, LETRAS } = require("../js/temas-plataforma.js");

function variables(familia) {
    const salida = {};
    for (const tono of Object.keys(TEMAS.clasico[familia])) {
        salida[tono] = `rgb(var(--c-${familia}-${tono}) / <alpha-value>)`;
    }
    return salida;
}
const PALETA = { brand: variables("brand"), accent: variables("accent") };

// inscripcion.html es un formulario aparte, con su propio verde y sin el
// encabezado del sitio: lleva su propio archivo para que los dos "brand" no
// choquen.
// Le faltaban 300, 400 y 950, que la página sí usa (el borde de los campos, el
// fondo del encabezado en modo oscuro), y el ámbar del botón.
// Va con los hex escritos y NO con variables, a propósito: es una página
// pública, sin sesión, a la que no le llega ningún tema — quien la abre todavía
// no es alumno de nadie.
// La página y su código, que desde «El código de las páginas sale del HTML»
// vive en js/inscripcion.js: sin él, las clases que pone el script se
// quedarían sin CSS sin que nada avisara.
const INSCRIPCION = ["inscripcion.html", "js/inscripcion.js", "js/inscripcion-fondo.js", "js/inscripcion-datos.js", "js/inscripcion-tema.js"];
const PALETA_INSCRIPCION = {
    brand: { 50:"#f0fdf4", 100:"#dcfce7", 200:"#bbf7d0", 300:"#86efac", 400:"#4ade80",
             500:"#22c55e", 600:"#16a34a", 700:"#15803d", 800:"#166534",
             900:"#14532d", 950:"#052e16" },
    accent: TEMAS.clasico.accent,
};

/* ===== Las variables de cada tema, al final del archivo compilado =====
 *
 * Van DENTRO de css/tailwind.css y no en una hoja aparte por una razón
 * práctica: esa hoja la cargan ya las 100 páginas del sitio, y un <link> nuevo
 * habría que ponerlo en las 100 (y acordarse en la 101). Van al FINAL y con
 * selectores de más especificidad que una utilidad (`:root[data-tema="x"] .rounded-2xl`
 * es 0,2,1 contra 0,1,0) porque la decoración tiene que ganarle a las clases de
 * Tailwind que ya están escritas en el HTML.
 *
 * El color de las casillas que propone cada tema se escribe acá como
 * --sq-light/--sq-dark, y NO lo pone el JavaScript: así la elección explícita
 * de cada quien —que js/board-color-themes.js escribe como estilo en línea
 * sobre <html>— le gana siempre, sin que ninguno de los dos tenga que
 * preguntarle nada al otro (ver el comentario de AUTO en ese archivo).
 */
const CASILLAS = require("../js/board-color-themes.js");

function rgb(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}

function tonos(tema) {
    const fuera = [];
    for (const familia of ["brand", "accent"]) {
        for (const [tono, hex] of Object.entries(tema[familia])) {
            fuera.push(`--c-${familia}-${tono}:${rgb(hex)}`);
        }
    }
    const casillas = CASILLAS.THEMES[tema.casillas];
    if (casillas) fuera.push(`--sq-light:${casillas.light}`, `--sq-dark:${casillas.dark}`);
    const adaptadas = CASILLAS.ADAPTIVE_THEMES[tema.casillasAdaptado];
    if (adaptadas) {
        fuera.push(`--sq-light-adaptive:${adaptadas.light}`,
                   `--sq-dark-adaptive:${adaptadas.dark}`);
    }
    return fuera.join(";") + ";";
}

/* Los patrones son SVG escritos acá mismo y no archivos de img/: son 400 bytes
 * cada uno, así que una petición por tema costaría más que el CSS entero. Van
 * muy tenues (la figura al 7-10 % de opacidad) porque tienen que quedar DEBAJO
 * del texto de una página de trabajo: un fondo decorativo que se note de más
 * es un fondo que hay que apagar para poder leer. Y por eso mismo el patrón
 * NUNCA lleva información: es adorno, no dato. */
const PATRONES = {
    corazones: (c, o) =>
        `<path d='M15 25c-5-3.6-8-6.7-8-10a4.6 4.6 0 0 1 8-2.8A4.6 4.6 0 0 1 23 15c0 3.3-3 6.4-8 10z' fill='${c}' opacity='${o}'/>` +
        `<path d='M45 55c-3.5-2.5-5.6-4.7-5.6-7a3.2 3.2 0 0 1 5.6-2 3.2 3.2 0 0 1 5.6 2c0 2.3-2.1 4.5-5.6 7z' fill='${c}' opacity='${o}'/>`,
    estrellas: (c, o) =>
        `<path d='M16 6l2.6 6.4L25 15l-6.4 2.6L16 24l-2.6-6.4L7 15l6.4-2.6z' fill='${c}' opacity='${o}'/>` +
        `<path d='M46 40l1.8 4.4L52 46l-4.4 1.8L46 52l-1.8-4.4L40 46l4.4-1.8z' fill='${c}' opacity='${o}'/>` +
        `<circle cx='52' cy='14' r='1.8' fill='${c}' opacity='${o}'/>` +
        `<circle cx='12' cy='48' r='1.4' fill='${c}' opacity='${o}'/>`,
    burbujas: (c, o) =>
        `<circle cx='16' cy='16' r='7' fill='none' stroke='${c}' stroke-width='1.6' opacity='${o}'/>` +
        `<circle cx='46' cy='44' r='10' fill='none' stroke='${c}' stroke-width='1.6' opacity='${o}'/>` +
        `<circle cx='48' cy='13' r='3' fill='none' stroke='${c}' stroke-width='1.4' opacity='${o}'/>` +
        `<circle cx='13' cy='45' r='2' fill='${c}' opacity='${o}'/>`,
    hojas: (c, o) =>
        `<path d='M8 22c0-8 6-14 14-14 0 8-6 14-14 14z' fill='${c}' opacity='${o}'/>` +
        `<path d='M52 38c0 8-6 14-14 14 0-8 6-14 14-14z' fill='${c}' opacity='${o}'/>`,
    // Magia: una luna creciente y estrellitas. La luna son dos arcos (el de
    // afuera y el de adentro), no un círculo tapado con otro del color del
    // fondo: acá no hay un fondo fijo debajo.
    lunas: (c, o) =>
        `<path d='M22 5 A11 11 0 0 0 22 27 A14 14 0 0 1 22 5 Z' fill='${c}' opacity='${o}'/>` +
        `<path d='M46 38l1.5 3.7L51 43l-3.5 1.4L46 48l-1.5-3.6L41 43l3.5-1.3z' fill='${c}' opacity='${o}'/>` +
        `<circle cx='50' cy='14' r='1.6' fill='${c}' opacity='${o}'/>` +
        `<circle cx='12' cy='50' r='1.3' fill='${c}' opacity='${o}'/>`,
    escamas: (c, o) =>
        `<path d='M0 20a15 15 0 0 1 30 0M30 20a15 15 0 0 1 30 0M-15 50a15 15 0 0 1 30 0M15 50a15 15 0 0 1 30 0M45 50a15 15 0 0 1 30 0' fill='none' stroke='${c}' stroke-width='1.6' opacity='${o}'/>`,
};

/* ===== Los que VUELAN =====
 * El patrón de arriba se queda quieto (las estrellas de Galaxia, las escamas de
 * Dragones); esto es una capa aparte que cruza la pantalla. Son dos capas y no
 * una a propósito: con una sola, todas las figuras se mueven a la misma
 * velocidad y lo que se ve es un papel tapiz deslizándose. Con dos —las
 * pequeñas despacio detrás, las grandes más rápido delante— el ojo lo lee como
 * profundidad, que es lo que hace que parezca que vuelan.
 *
 * Cada figura mira a la derecha y el fuego (o la llama del cohete) va en el
 * color de ACENTO, no en el de la silueta: a esta opacidad es lo único que
 * distingue «un dragón» de «un dragón tirando fuego».
 */
const VOLADORES = {
    // El agujero de la ventana es un subpath cerrado con fill-rule evenodd: con
    // un círculo relleno del color del fondo se vería un parche opaco, porque
    // acá no hay un fondo fijo debajo — hay lo que traiga la página.
    cohetes: (c, a) =>
        `<path d='M0 9 C0 4 5 0 13 0 C22 0 31 4 36 9 C31 14 22 18 13 18 C5 18 0 14 0 9 Z` +
        `M25 9 a3.4 3.4 0 1 0 0.01 0 Z' fill='${c}' fill-rule='evenodd'/>` +
        `<path d='M10 2 L4 -7 L1 3 Z' fill='${c}'/>` +
        `<path d='M10 16 L4 25 L1 15 Z' fill='${c}'/>` +
        `<path d='M0 4 L-13 9 L0 14 C-4 12 -4 6 0 4 Z' fill='${a}'/>`,
    dragones: (c, a) =>
        // El ala va PRIMERO, o sea detrás: dibujada encima le corta el cuello y
        // sus muescas se leen como agujeros en el cuerpo.
        `<path d='M43 31 C46 14 56 4 69 0 C63 9 60 16 62 23 L54 20 L55 27 Z' fill='${c}'/>` +
        // La cola larga y fina es la mitad de lo que hace que se lea «dragón».
        `<path d='M29 45 C20 49 11 54 2 61 C9 58 13 57 18 55 C23 53 27 49 31 46 Z' fill='${c}'/>` +
        `<path d='M0 63 L10 55 L9 61 L2 64 Z' fill='${c}'/>` +
        `<path d='M26 42 C31 31 42 27 53 30 C59 32 61 36 58 41 C52 48 36 51 28 47 Z' fill='${c}'/>` +
        `<path d='M41 48 L38 57 L46 50 Z' fill='${c}'/>` +
        `<path d='M51 36 C54 28 59 23 65 21 L68 27 C63 29 59 33 56 40 Z' fill='${c}'/>` +
        `<path d='M67 19 L63 10 L73 18 Z' fill='${c}'/>` +
        // La boca va en dos mitades: el hueco entre ellas es lo que dice que
        // está abierta, y por ahí sale el fuego.
        `<path d='M62 19 C69 16 78 18 88 22 L76 25 L63 25 Z' fill='${c}'/>` +
        `<path d='M64 27 C71 27 79 28 86 30 L74 31 L64 30 Z' fill='${c}'/>` +
        // El fuego ARRANCA DENTRO de la boca: despegado se lee como otro bicho
        // volando al lado.
        `<path d='M82 22 C95 18 107 21 118 28 C107 26 98 27 89 31 C95 27 92 25 82 27 Z' fill='${a}'/>` +
        `<path d='M86 17 C94 14 101 14 108 16 C100 18 94 20 89 23 Z' fill='${a}'/>`,
    magos: (c, a) =>
        // La capa va PRIMERO (detrás), ondeando hacia atrás: es lo que dice
        // que el mago vuela y no que está sentado.
        `<path d='M30 24 C22 27 14 31 4 31 C10 35 9 39 2 43 C12 44 22 42 32 38 Z' fill='${c}'/>` +
        // La escoba: el palo y las cerdas abiertas atrás.
        `<path d='M8 49 L74 41 L74 44 L8 52 Z' fill='${c}'/>` +
        `<path d='M10 47 L-10 40 L-6 48 L-12 53 L-5 55 L-9 61 L11 54 Z' fill='${c}'/>` +
        // La túnica, sentada sobre la escoba.
        `<path d='M30 22 C38 20 46 22 49 28 L52 46 L26 50 C27 40 27 30 30 22 Z' fill='${c}'/>` +
        // La cabeza, la barba (hacia adelante) y el sombrero de punta doblada.
        `<circle cx='42' cy='16' r='5.5' fill='${c}'/>` +
        `<path d='M44 19 C50 20 53 25 54 31 C49 28 45 25 42 21 Z' fill='${c}'/>` +
        `<path d='M31 13 L55 11 L54 14 L32 16 Z' fill='${c}'/>` +
        `<path d='M36 13 L50 12 C47 4 42 -2 33 -6 C37 0 38 6 36 13 Z' fill='${c}'/>` +
        // El brazo estirado y la varita.
        `<path d='M44 26 L62 22 L63 26 L46 31 Z' fill='${c}'/>` +
        `<path d='M61 23 L80 14 L81 16 L62 25 Z' fill='${c}'/>` +
        // El hechizo ARRANCA EN LA PUNTA de la varita, como el fuego en la boca
        // del dragón: despegado se leería como una estrella más del fondo.
        `<path d='M79 14 C86 11 92 11 98 12 C92 14 87 16 81 17 Z' fill='${a}'/>` +
        `<path d='M106 3 L109 10 L116 12 L109 14 L106 21 L103 14 L96 12 L103 10 Z' fill='${a}'/>` +
        `<circle cx='92' cy='5' r='1.8' fill='${a}'/>` +
        `<circle cx='95' cy='20' r='1.5' fill='${a}'/>` +
        `<circle cx='119' cy='4' r='1.3' fill='${a}'/>`,
};

/* Cada capa es un mosaico con dos figuras puestas a mano: una sola en el
 * centro deja un ritmo de cuadrícula que se nota enseguida. */
const CAPAS = {
    cohetes: {
        lejos: { w: 420, h: 300, seg: 34, figuras: [[30, 40, 1.5, -20], [250, 190, 1.05, -14]] },
        cerca: { w: 560, h: 380, seg: 22, figuras: [[70, 250, 2.6, -24]] },
    },
    dragones: {
        lejos: { w: 460, h: 320, seg: 40, figuras: [[20, 40, 1.15, -8], [250, 200, 0.85, -4]] },
        cerca: { w: 620, h: 400, seg: 26, figuras: [[60, 250, 1.9, -10]] },
    },    magos: {
        lejos: { w: 460, h: 320, seg: 40, figuras: [[30, 50, 1.1, -8], [260, 210, 0.85, -4]] },
        cerca: { w: 620, h: 400, seg: 26, figuras: [[70, 250, 1.8, -10]] },
    },
};

function capa(nombre, capa, color, acento, opacidad) {
    const piezas = capa.figuras
        .map(([x, y, escala, giro]) =>
            `<g transform='translate(${x},${y}) rotate(${giro}) scale(${escala})'>` +
            VOLADORES[nombre](color, acento) + "</g>")
        .join("");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${capa.w}' height='${capa.h}' ` +
                `viewBox='0 0 ${capa.w} ${capa.h}'><g opacity='${opacidad}'>${piezas}</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/* El recorrido de cada vuelta es UN mosaico exacto (o dos a lo ancho, para que
 * la diagonal quede más tendida): así el bucle no tiene salto — al volver a
 * cero la figura de al lado está justo donde estaba la anterior. */
function vuelo(id, nombre, tema) {
    const sel = `:root[data-tema="${id}"]`;
    const tramos = { cohetes: 1, dragones: 2, magos: 2 };
    let css =
        `${sel} body::before,${sel} body::after{content:"";position:fixed;top:-50%;left:-50%;` +
        `width:200%;height:200%;pointer-events:none;z-index:-1;background-repeat:repeat}`;
    for (const cual of ["lejos", "cerca"]) {
        const c = CAPAS[nombre][cual];
        const clara = capa(nombre, c, tema.brand[400], tema.accent[500], 0.11);
        const oscura = capa(nombre, c, tema.brand[300], tema.accent[400], 0.1);
        const pseudo = cual === "lejos" ? "::before" : "::after";
        const anim = `vuela-${id}-${cual}`;
        css += `${sel} body${pseudo}{background-image:${clara};background-size:${c.w}px ${c.h}px;` +
               `animation:${anim} ${c.seg}s linear infinite}` +
               `${sel}.dark body${pseudo}{background-image:${oscura}}` +
               `@keyframes ${anim}{to{transform:translate3d(${c.w * tramos[nombre]}px,-${c.h}px,0)}}`;
    }
    return css;
}

function fondo(nombre, color, opacidad) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'>` +
                PATRONES[nombre](color, opacidad) + `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function decoracion(id, tema) {
    if (!tema.decorado) return "";
    const sel = `:root[data-tema="${id}"]`;
    let css = `${sel} body{background-image:${fondo(tema.decorado, tema.brand[400], 0.1)}}` +
              `${sel}.dark body{background-image:${fondo(tema.decorado, tema.brand[300], 0.09)}}` +
              // Las esquinas más redondas son la mitad de lo que hace que un tema
              // se sienta "de niñas" y no "el sitio con otro color". Se retocan
              // las tres utilidades que el sitio usa para las tarjetas, así
              // alcanza a todas sin tocar ni una página.
              `${sel} .rounded-2xl{border-radius:1.75rem}` +
              `${sel} .rounded-xl{border-radius:1.15rem}` +
              `${sel} .rounded-lg{border-radius:0.85rem}` +
              // El encabezado y el pie en degradado. Los tres tonos que se mezclan
              // son brand-900/700/600, que son los tres que ya llevan texto blanco
              // en el sitio: el degradado no puede bajar el contraste de lo que va
              // encima de él, y así no hay ningún tramo donde lo baje.
              `${sel} #header{background-image:linear-gradient(120deg,rgb(var(--c-brand-900)),rgb(var(--c-brand-700)) 55%,rgb(var(--c-brand-600)))}` +
              `${sel} footer{background-image:linear-gradient(120deg,rgb(var(--c-brand-950)),rgb(var(--c-brand-800)))}`;
    if (tema.vuelan) css += vuelo(id, tema.vuelan, tema);
    if (tema.fuente) {
        // Solo los TÍTULOS cambian de letra. El cuerpo se queda en Inter a
        // propósito: es el texto que hay que poder leer en una tarea de veinte
        // minutos, y la fuente redondeada de un tema no se eligió por
        // legibilidad. La baja js/temas-plataforma.js, y solo si el tema está
        // puesto.
        css += `${sel} .font-serif{font-family:"${tema.fuente}",Merriweather,"Merriweather respaldo",serif;letter-spacing:-0.01em}`;
    }
    return css;
}

/* La LETRA que eligió la persona (js/temas-plataforma.js, LETRAS). Va DESPUÉS
 * de los temas y con la misma especificidad que la letra de un tema
 * (:root[data-letra] .font-serif, 0,3,0): así la que se eligió a mano le gana
 * a la del tema, sin que ninguno de los dos pregunte por el otro — igual que
 * las casillas. El respaldo de cada pila es el ajustado de css/fuentes.css. */
function cssDeLetras() {
    let css = "";
    for (const [id, letra] of Object.entries(LETRAS)) {
        const sel = `:root[data-letra="${id}"]`;
        if (letra.titulos) {
            css += `${sel} .font-serif{font-family:"${letra.titulos}",Merriweather,"Merriweather respaldo",serif;` +
                   `letter-spacing:${letra.titulos === "Quicksand" ? "-0.01em" : "normal"}}`;
        }
        if (letra.texto) {
            css += `${sel},${sel} .font-sans{font-family:"${letra.texto}",Inter,"Inter respaldo",sans-serif}`;
        }
    }
    return css;
}

function cssDeTemas() {
    let css = `:root{${tonos(TEMAS.clasico)}}`;
    for (const [id, tema] of Object.entries(TEMAS)) {
        if (id === "clasico") continue;
        css += `:root[data-tema="${id}"]{${tonos(tema)}}` + decoracion(id, tema);
    }
    css += cssDeLetras();
    return "\n" + css + "\n";
}

function binario() {
    const candidatos = [
        path.join(RAIZ, "node_modules/.bin/tailwindcss"),
        ...(process.env.NODE_PATH || "").split(":").filter(Boolean)
            .map((p) => path.join(p, ".bin/tailwindcss")),
    ];
    for (const c of candidatos) if (fs.existsSync(c)) return c;
    console.error("No encuentro tailwindcss. Corré: npm install tailwindcss@3");
    process.exit(1);
}

// Qué archivos mira el compilador para saber qué clases escribir. Los de datos
// (el libro de aperturas, los bancos de preguntas) no traen clases y son
// enormes: con ellos el extractor se queda colgado.
//
// El tope es de 350 KB y no de 300 KB porque `sesion.html` —la pantalla más
// cargada del sitio— ya pasó los 300 KB. Con el tope viejo quedaba EXCLUIDA
// del compilado sin ningún aviso: sus clases exclusivas (el ancho de los
// paneles flotantes del profesor, con `min` y `vw`) desaparecían de
// `tailwind.css` y esos paneles quedaban sin ancho, invadiendo el tablero.
// 350 KB deja margen para que ese archivo siga creciendo y sigue por debajo de
// los bancos de datos de verdad (`js/arbitraje-items.js`, 396 KB;
// `data/puzzle-rush-data.js`, 363 KB), que son los que de verdad hay que dejar
// afuera.
//
// OJO al escribir este comentario: un ancho arbitrario de Tailwind escrito
// acá mismo, entre corchetes, es candidato a clase para el propio compilador
// — ya generó una vez una regla inválida con puntos suspensivos adentro. Por
// eso ninguna forma de esas va entre corchetes en este bloque.
function contenido(excluir) {
    const fuera = new Set(excluir || []);
    const lista = [];
    (function anda(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".") || e.name === "node_modules") continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { anda(p); continue; }
            if (!/\.(html|js)$/.test(e.name)) continue;
            const rel = path.relative(RAIZ, p);
            if (fuera.has(rel)) continue;
            if (rel.startsWith("herramientas/") && !rel.startsWith("herramientas/css")) continue;
            if (fs.statSync(p).size > 350_000) continue;
            lista.push(p);
        }
    })(RAIZ);
    return lista;
}

function compilar(nombre, paleta, archivos, extra) {
    const cfg = path.join(RAIZ, ".tailwind." + nombre + ".cjs");
    fs.writeFileSync(cfg, "module.exports = " + JSON.stringify({
        darkMode: "class",
        content: archivos,
        theme: { extend: { colors: paleta,
                 fontFamily: {
                     // El respaldo NO es "sans-serif" a secas: es el @font-face
                     // ajustado de css/fuentes.css, que ocupa el mismo espacio
                     // que Inter. Sin él, el primer cuadro se pinta con la
                     // fuente del sistema y al llegar la buena el texto se
                     // reacomoda un 5,9 % (12,6 % en las serif). Los números los
                     // mide herramientas/fuentes-metricas.js.
                     sans: ["Inter", "Inter respaldo", "sans-serif"],
                     serif: ["Merriweather", "Merriweather respaldo", "serif"],
                 } } },
    }, null, 1) + ";\n");
    const salida = path.join(CSS, nombre + ".css");
    execFileSync(binario(), ["-c", cfg, "-i", path.join(__dirname, "css/entrada.css"),
                             "-o", salida, "--minify"], { stdio: ["ignore", "ignore", "pipe"] });
    fs.unlinkSync(cfg);
    if (extra) fs.appendFileSync(salida, extra);
    const kb = (fs.statSync(salida).size / 1024).toFixed(1);
    console.log(`css/${nombre}.css  ${kb.padStart(7)} KB  (${archivos.length} archivos mirados)`);
}

if (require.main === module) {
    fs.mkdirSync(CSS, { recursive: true });
    compilar("tailwind", PALETA, contenido(INSCRIPCION), cssDeTemas());
    compilar("tailwind-inscripcion", PALETA_INSCRIPCION,
        INSCRIPCION.map((rel) => path.join(RAIZ, rel)));
} else {
    // herramientas/verificar-temas-plataforma.js arma el bloque con ESTA
    // función y no con una copia: comprobar una copia no comprobaría nada.
    module.exports = { PALETA, cssDeTemas, rgb, CAPAS };
}
