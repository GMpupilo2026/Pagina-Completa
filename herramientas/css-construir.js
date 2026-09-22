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
const TEMAS = require("../js/temas-plataforma.js").TEMAS;

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
    escamas: (c, o) =>
        `<path d='M0 20a15 15 0 0 1 30 0M30 20a15 15 0 0 1 30 0M-15 50a15 15 0 0 1 30 0M15 50a15 15 0 0 1 30 0M45 50a15 15 0 0 1 30 0' fill='none' stroke='${c}' stroke-width='1.6' opacity='${o}'/>`,
};

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
    if (tema.fuente) {
        // Solo los TÍTULOS cambian de letra. El cuerpo se queda en Inter a
        // propósito: es el texto que hay que poder leer en una tarea de veinte
        // minutos, y la fuente redondeada de un tema no se eligió por
        // legibilidad. La baja js/temas-plataforma.js, y solo si el tema está
        // puesto.
        css += `${sel} .font-serif{font-family:"${tema.fuente}",Merriweather,serif;letter-spacing:-0.01em}`;
    }
    return css;
}

function cssDeTemas() {
    let css = `:root{${tonos(TEMAS.clasico)}}`;
    for (const [id, tema] of Object.entries(TEMAS)) {
        if (id === "clasico") continue;
        css += `:root[data-tema="${id}"]{${tonos(tema)}}` + decoracion(id, tema);
    }
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
            if (fs.statSync(p).size > 300_000) continue;
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
                 fontFamily: { sans: ["Inter", "sans-serif"], serif: ["Merriweather", "serif"] } } },
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
    compilar("tailwind", PALETA, contenido(["inscripcion.html"]), cssDeTemas());
    compilar("tailwind-inscripcion", PALETA_INSCRIPCION, [path.join(RAIZ, "inscripcion.html")]);
} else {
    // herramientas/verificar-temas-plataforma.js arma el bloque con ESTA
    // función y no con una copia: comprobar una copia no comprobaría nada.
    module.exports = { PALETA, cssDeTemas, rgb };
}
