/* Comprueba que el CSS compilado tenga TODAS las clases que el sitio usa.
 *
 * El riesgo de compilar Tailwind es que el compilador solo escribe las clases
 * que encuentra leyendo el código. Si una clase se arma en JavaScript, o solo
 * aparece después de una interacción, puede faltar: la página se ve mal y nada
 * falla ni avisa.
 *
 * Por eso esto no lee los archivos: abre cada página en un navegador de verdad,
 * deja correr el JavaScript, enciende el modo oscuro y el adaptado, abre los
 * <details> y destapa lo escondido, y recorre el DOM juntando TODAS las clases
 * que quedaron puestas. Después comprueba que cada una esté definida en alguna
 * de las hojas que el navegador cargó.
 *
 *   npm install playwright && node herramientas/verificar-css.js
 *
 * Necesita el sitio servido en localhost:8777 (o BASE=<url>), y CHROME_PATH si
 * el Chromium no está donde playwright lo busca.
 */
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8777";

// Páginas representativas: las públicas, las de juego, las que piden sesión (se
// ven en su pantalla de carga) y las de curso, que inyectan HTML traído aparte.
const PAGINAS = [
    "/index.html", "/cursos.html", "/articulos.html", "/sobre-oscar.html", "/tablero.html",
    "/te-reto.html", "/campeones.html", "/tv.html", "/nivel-de-arbitraje.html", "/login.html",
    "/juegos.html", "/bot.html", "/confites.html", "/ilumina-tablero.html", "/clases.html",
    "/admin.html", "/admin-jugador.html", "/admin-jugador.html", "/informes.html", "/sesion.html", "/arbitraje.html", "/configuracion.html",
    "/formularios.html", "/formulario.html", "/cobros.html", "/offline.html",
    "/crazyhouse.html", "/cartas.html", "/duelo.html", "/niebla.html", "/estandar.html",
    "/variante.html", "/cuatro-jugadores.html", "/partidas.html", "/torneo.html", "/torneos.html",
    "/lector-planilla.html", "/racha-tactica.html", "/concentracion.html", "/ciegos.html",
    "/articulos/la-clavada.html", "/cursos/fundamentos-del-ajedrez.html",
    "/cursos/el-mapa-de-los-finales.html", "/cursos/academia/index.html",
    "/entreno/index.html", "/entreno/diagnostico.html", "/entreno/mates.html", "/entreno/aperturas.html",
    "/entreno/aprender.html", "/entreno/estudio.html", "/entreno/4x4.html",
    // entreno/tactica.html ya no se abre: sus ejercicios viven dentro de
    // temas.html y esa dirección ahora solo redirige. Abrirla acá mediría el CSS
    // de temas.html dos veces.
    "/entreno/temas.html", "/entreno/practicas.html", "/entreno/desafios.html",
    "/entreno/coordenadas.html", "/inscripcion.html",
];

// Clases que a propósito no definen ningún estilo: son ganchos para el
// JavaScript o marcadores de estado que otra regla usa como parte del selector.
const SIN_ESTILO = new Set([
    // Marcadores de estado que otra regla usa como parte de su selector.
    "group", "peer", "dark", "adaptive-mode", "scrolled",
    // Ganchos: solo existen para que un querySelectorAll los encuentre.
    "filtro-nivel", "filter-btn", "active", "article-card", "color-opt",
    "example-card", "example-board-wrap",
    "example-mode-btn", "blind-mode-only", "normal-mode-only", "teacher-tab-btn",
    "practice-level-btn", "edit-piece-btn", "edit-turn-btn", "cf-turnstile",
    "ficha-btn",
    // Clases descriptivas del set SVG de piezas (js/chess-piece-svg.js): vienen
    // en el <g class="white king"> de cada pieza tal como las trae el arte
    // original — nadie las usa para dar estilo, solo identifican qué es cada
    // <g> dentro del propio SVG. Antes solo se veían en Cursos (con sesión,
    // fuera del alcance de este chequeo); ahora también en la vista previa de
    // "Estilo de pieza" de configuracion.html.
    "white", "black", "king", "queen", "rook", "bishop", "knight", "pawn",
    // Sin CSS en ninguna parte: quedó de algo que ya no está.
    "prose-chess",
]);

// Se leen del navegador y no del texto de los archivos porque en el CSS los
// caracteres raros van escapados —una coma dentro de un valor arbitrario se
// escribe "\2c "— y compararlos a mano se equivoca. Van como funciones y no
// como texto: dentro de una plantilla de texto las barras de las expresiones
// regulares se pierden y el detector empieza a mentir.
function conocidas() {
    const desescapar = (s) => s
        .replace(/\\([0-9a-fA-F]{1,6})[ ]?/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\\(.)/g, "$1");
    const set = new Set();
    const mirar = (reglas) => {
        for (const r of reglas) {
            if (r.selectorText) {
                // El token termina en el primer carácter SIN escapar que no
                // puede ser parte de un nombre de clase: otro punto (".a.b" son
                // dos clases), un ":" de pseudoclase (Tailwind 3.4 escribe el
                // modo oscuro como ".dark\\:text-white:is(.dark *)", con los dos
                // puntos de la variante escapados y los de :is sin escapar), un
                // corchete de atributo (".open\\:shadow-md[open]")...
                for (const m of r.selectorText.matchAll(/\.((?:\\.|[^\s,{}()>+~.:#*'"\[\]])+)/g)) {
                    set.add(desescapar(m[1]));
                }
            }
            if (r.cssRules) mirar(r.cssRules);
        }
    };
    for (const hoja of document.styleSheets) {
        try { mirar(hoja.cssRules); } catch (e) { /* hoja de otro origen */ }
    }
    return Array.from(set);
}

// Se enciende todo lo que pone clases distintas: modo oscuro, modo adaptado,
// los <details> abiertos y lo que está escondido.
function destapar() {
    document.documentElement.classList.add("dark", "adaptive-mode");
    document.querySelectorAll("details").forEach((d) => { d.open = true; });
    document.querySelectorAll("[hidden]").forEach((e) => { e.hidden = false; });
    document.querySelectorAll(".hidden").forEach((e) => e.classList.remove("hidden"));
}

function usadas() {
    const s = new Set();
    document.querySelectorAll("*").forEach((el) => {
        const c = el.getAttribute && el.getAttribute("class");
        if (c) String(c).split(/\s+/).forEach((t) => t && s.add(t));
    });
    return Array.from(s);
}

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
    const faltan = new Map();
    let total = 0, cargas = 0;

    for (const url of PAGINAS) {
        for (const ancho of [1280, 390]) {
            const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
            // Nada hacia afuera: acá se miden las clases del DOM, no la red.
            await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE)
                ? r.continue() : r.fulfill({ status: 200, body: "", contentType: "text/plain" })));
            const page = await ctx.newPage();
            page.on("pageerror", () => {});
            try {
                await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 20000 });
                await page.waitForTimeout(700);
                await page.evaluate(destapar);
                await page.waitForTimeout(400);
                const definidas = new Set(await page.evaluate(conocidas));
                const enUso = await page.evaluate(usadas);
                enUso.forEach((t) => {
                    total++;
                    if (SIN_ESTILO.has(t) || definidas.has(t)) return;
                    if (!faltan.has(t)) faltan.set(t, new Set());
                    faltan.get(t).add(url);
                });
                cargas++;
            } catch (e) {
                console.log("no se pudo abrir", url, String(e).slice(0, 70));
            }
            await ctx.close();
        }
    }
    await browser.close();

    console.log(`${cargas} cargas de página · ${total} clases vistas en el DOM`);
    if (!faltan.size) {
        console.log("Todas las clases que el sitio usa tienen su CSS.");
        process.exit(0);
    }
    console.log(`\nSIN CSS: ${faltan.size} clases\n`);
    for (const [t, urls] of [...faltan].sort()) {
        console.log(`  ${t.padEnd(42)} ${[...urls].slice(0, 3).join(", ")}`);
    }
    console.log("\nSi son de Tailwind, corre herramientas/css-construir.js.");
    console.log("Si no hacen nada a propósito (un gancho para el JavaScript), van a SIN_ESTILO.");
    process.exit(1);
})();
