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
// páginas: ahora vive acá y en un solo lugar.
const PALETA = {
    brand: { 50:"#f0f4f8", 100:"#d9e2ec", 200:"#bcccdc", 300:"#9fb3c8", 350:"#8aa1b8",
             400:"#627d98", 450:"#55708a", 500:"#486581", 600:"#334e68", 700:"#243b53",
             800:"#102a43", 900:"#0a1f33", 950:"#071527" },
    // accent-50 y 300 no estaban y sí se usaban: "bg-accent-50" (el aviso de un
    // reto, la caja de ayuda del examen) y "hover:text-accent-300" no pintaban
    // nada. Con el CDN pasaba igual — la configuración que venía en el <head>
    // tenía los mismos tres tonos.
    accent: { 50:"#fffbea", 300:"#f7c948", 400:"#f0b429", 500:"#de911d",
              600:"#cb6e17", 700:"#a85a0d" },
};
// inscripcion.html es un formulario aparte, con su propio verde y sin el
// encabezado del sitio: lleva su propio archivo para que los dos "brand" no
// choquen.
// Le faltaban 300, 400 y 950, que la página sí usa (el borde de los campos, el
// fondo del encabezado en modo oscuro), y el ámbar del botón.
const PALETA_INSCRIPCION = {
    brand: { 50:"#f0fdf4", 100:"#dcfce7", 200:"#bbf7d0", 300:"#86efac", 400:"#4ade80",
             500:"#22c55e", 600:"#16a34a", 700:"#15803d", 800:"#166534",
             900:"#14532d", 950:"#052e16" },
    accent: PALETA.accent,
};

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

function compilar(nombre, paleta, archivos) {
    const cfg = path.join(RAIZ, ".tailwind." + nombre + ".cjs");
    fs.writeFileSync(cfg, "module.exports = " + JSON.stringify({
        darkMode: "class",
        content: archivos,
        theme: { extend: { colors: paleta,
                 fontFamily: {
                     // El respaldo NO es "sans-serif" a secas: es el @font-face
                     // ajustado de css/fuentes.css, que ocupa exactamente el
                     // mismo espacio que Inter. Sin él, el primer cuadro se
                     // pinta con la fuente del sistema y al llegar la buena el
                     // texto se reacomoda un 5,9 % (12,6 % en las serif), que
                     // es el brinco que se lee como «página barata». Los
                     // números los mide herramientas/fuentes-metricas.js.
                     sans: ["Inter", "Inter respaldo", "sans-serif"],
                     serif: ["Merriweather", "Merriweather respaldo", "serif"],
                 } } },
    }, null, 1) + ";\n");
    const salida = path.join(CSS, nombre + ".css");
    execFileSync(binario(), ["-c", cfg, "-i", path.join(__dirname, "css/entrada.css"),
                             "-o", salida, "--minify"], { stdio: ["ignore", "ignore", "pipe"] });
    fs.unlinkSync(cfg);
    const kb = (fs.statSync(salida).size / 1024).toFixed(1);
    console.log(`css/${nombre}.css  ${kb.padStart(7)} KB  (${archivos.length} archivos mirados)`);
}

fs.mkdirSync(CSS, { recursive: true });
compilar("tailwind", PALETA, contenido(["inscripcion.html"]));
compilar("tailwind-inscripcion", PALETA_INSCRIPCION, [path.join(RAIZ, "inscripcion.html")]);
