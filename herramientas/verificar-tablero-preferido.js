#!/usr/bin/env node
/* Comprueba que el tablero que eligió el alumno sea el MISMO en todo el sitio.
 *
 * Todo lo que se rompe acá se rompe callado: un ejercicio que dibuja su propio
 * glifo en vez de preguntar por el estilo elegido se ve perfecto — solo que no
 * es el tablero del alumno —, y un Modo Adaptado que cambia los colores al
 * encenderse solo parece un tablero de otra persona.
 *
 * Dos partes:
 *   1. Sin navegador: que cada página con tablero cargue los seis módulos de
 *      preferencias (lo pone herramientas/tablero-cabecera.py), y que ningún
 *      archivo pinte una pieza con la clase piece-white/piece-black sin pasar
 *      antes por PiezaPreferida.
 *   2. En un navegador (sitio en localhost:8777, playwright, chess.js): con el
 *      dibujo, Madera y Azul y rojo elegidos, que las páginas los pinten, que
 *      encender Modo Adaptado NO los cambie, y que la pieza negra salga sin
 *      borde.
 *
 *   node herramientas/verificar-tablero-preferido.js [--sin-navegador]
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..");
const MODULOS = ["board-themes", "board-color-themes", "piece-color-themes", "piece-style-themes", "chess-piece-svg", "pieza-preferida"];
const TIENE_TABLERO = /piece-white|PiezaPreferida|js\/[a-z0-9-]*board\.js|tablero-pregunta\.js|ficha-render\.js|finales-100\.js|curso-partidas\.js/;
// Los que no pintan "blancas contra negras" o tienen su propia decisión escrita:
// el de 4 jugadores (rojo/azul/amarillo/verde), el 4×4 (una pieza dorada), la
// vista previa de Configuración, ClasesBoard (que además fuerza el dibujo en
// sus miniaturas) y los de Abrazos/Camaleón, con piezas fusionadas.
const EXCEPTUADOS = new Set([
  "js/fourplayer-board.js", "js/clases-board.js", "js/variantes-board.js", "js/ilumina-board.js",
  "js/configuracion.js", "entreno/4x4.html", "js/tv.js", "js/pieza-preferida.js",
]);

let fallos = 0;
function ok(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) fallos++;
}

function archivos(patron) {
  return execSync(`git ls-files '${patron}'`, { cwd: RAIZ, encoding: "utf8" }).split("\n").filter(Boolean);
}

console.log("1. Qué cargan y cómo pintan las páginas");
const htmls = archivos("*.html");
let conTablero = 0;
for (const f of htmls) {
  const txt = fs.readFileSync(path.join(RAIZ, f), "utf8");
  if (!TIENE_TABLERO.test(txt)) continue;
  conTablero++;
  const faltan = MODULOS.filter((m) => !new RegExp(`src="[^"]*js/${m}\\.js`).test(txt));
  if (faltan.length) ok(false, `${f} no carga ${faltan.join(", ")} (correr herramientas/tablero-cabecera.py)`);
}
ok(conTablero > 30, `${conTablero} páginas con tablero cargan los seis módulos`);

for (const f of htmls.concat(archivos("js/*.js"))) {
  if (EXCEPTUADOS.has(f)) continue;
  const txt = fs.readFileSync(path.join(RAIZ, f), "utf8");
  const pinta = /(className|class=)[^\n]*piece-white[^\n]*piece-black/.test(txt) && /GLYPH/.test(txt);
  if (pinta && !/PiezaPreferida/.test(txt)) ok(false, `${f} pinta el glifo sin preguntar a PiezaPreferida`);
}
ok(true, "ningún tablero pinta el glifo por su cuenta");

async function navegador() {
  console.log("2. En un navegador");
  const { chromium } = require(path.join(RAIZ, "node_modules/playwright"));
  const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const paginas = ["index.html", "tablero.html", "articulos/la-clavada.html"];
  for (const adaptado of [false, true]) {
    for (const estilo of ["ilustrado", "clasico"]) {
      const ctx = await b.newContext({ serviceWorkers: "block" });
      await ctx.addInitScript(([estilo, adaptado]) => {
        localStorage.setItem("piece_style_theme_v1", estilo);
        localStorage.setItem("board_color_theme_v1", "madera");
        localStorage.setItem("piece_color_theme_v1", "azulrojo");
        if (adaptado) localStorage.setItem("oscarBlindMode_v1", "1");
      }, [estilo, adaptado]);
      for (const p of paginas) {
        const page = await ctx.newPage();
        await page.goto("http://localhost:8777/" + p, { waitUntil: "load" });
        await page.waitForFunction(() => document.querySelector(".chess-piece-svg, .piece-white"), null, { timeout: 8000 }).catch(() => {});
        const r = await page.evaluate(() => {
          const cs = getComputedStyle(document.documentElement);
          const v = (n) => cs.getPropertyValue(n).trim();
          const negra = document.querySelector(".piece-black");
          return {
            adaptado: document.documentElement.classList.contains("adaptive-mode"),
            casillas: [v("--sq-light"), v("--sq-light-adaptive")],
            piezas: v("--piece-white"),
            svg: document.querySelectorAll(".chess-piece-svg").length,
            glifos: document.querySelectorAll(".piece-white, .piece-black").length,
            // El borde son las cuatro primeras sombras; la última es la sombra suave.
            bordeNegra: negra ? getComputedStyle(negra).textShadow.split("px,").slice(0, 4).every((s) => /rgba\(0, 0, 0, 0\)/.test(s)) : null,
          };
        });
        const etiqueta = `${p} · ${estilo}${adaptado ? " · Modo Adaptado" : ""}`;
        ok(r.adaptado === adaptado, `${etiqueta}: el modo quedó como se pidió`);
        ok(r.casillas.every((c) => c === "#f0d9b5"), `${etiqueta}: casillas Madera también en Modo Adaptado (${r.casillas.join(" / ")})`);
        ok(r.piezas === "#2563eb", `${etiqueta}: piezas Azul y rojo (${r.piezas})`);
        if (estilo === "ilustrado") ok(r.svg > 0 && r.glifos === 0, `${etiqueta}: dibujadas (${r.svg} dibujos, ${r.glifos} glifos)`);
        else {
          ok(r.glifos > 0 && r.svg === 0, `${etiqueta}: símbolos (${r.glifos})`);
          ok(r.bordeNegra === true, `${etiqueta}: la pieza negra sin borde`);
        }
        await page.close();
      }
      await ctx.close();
    }
  }
  await b.close();
}

(async () => {
  if (!process.argv.includes("--sin-navegador")) await navegador();
  console.log(fallos ? `\n${fallos} comprobaciones fallaron` : "\nTodo en orden");
  process.exit(fallos ? 1 : 0);
})();
