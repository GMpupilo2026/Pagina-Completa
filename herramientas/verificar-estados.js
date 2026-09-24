/* Las pantallas de carga y las listas vacías, iguales en todo el sitio.

   Lo que comprueba:

   1. Que toda pantalla de carga (#loading) tenga la MISMA forma: role="status"
      para que el lector de pantalla diga que está cargando, la ruedita
      escondida del lector (aria-hidden) y quieta para quien pidió menos
      movimiento (motion-reduce:animate-none), y el texto aparte. Eran cinco
      formas distintas escritas a mano, y una nueva se copiaría de cualquiera.
   2. Que las listas vacías de las páginas de trabajo digan QUÉ HACER, con el
      nombre del botón entre comillas latinas. «Todavía no hay nada» a secas
      deja a la persona mirando una caja vacía sin saber si está rota.
   3. En el navegador: que la ruedita se vea y gire, que con «reducir
      movimiento» se quede quieta, y que el texto tenga contraste AA contra el
      fondo real, en claro y en oscuro.

       node herramientas/verificar-estados.js                                */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

function paginas() {
  const lista = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "herramientas", "supabase", "docs"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith(".html")) lista.push(path.relative(RAIZ, p));
    }
  })(RAIZ);
  return lista;
}

const RUEDITA = /<span aria-hidden="true" class="[^"]*\banimate-spin\b[^"]*\bmotion-reduce:animate-none\b[^"]*"><\/span>/;

function pruebaCarga() {
  console.log("\n=== Toda pantalla de carga tiene la misma forma ===");
  const problemas = [];
  let n = 0;
  for (const rel of paginas()) {
    const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    const i = s.indexOf('id="loading"');
    if (i < 0) continue;
    n += 1;
    // clases.html la lleva en #loading-spinner, porque #loading también
    // contiene su pantalla de error.
    const j = rel === "clases.html" ? s.indexOf('id="loading-spinner"') : i;
    const trozo = s.slice(s.lastIndexOf("<", j), s.indexOf("</div>", j) + 6);
    if (!/role="status"/.test(trozo)) problemas.push(`${rel}: sin role="status"`);
    if (!RUEDITA.test(trozo)) problemas.push(`${rel}: sin la ruedita compartida (animate-spin + motion-reduce:animate-none, aria-hidden)`);
    if (!/<p class="text-sm">[^<]+<\/p>/.test(trozo)) problemas.push(`${rel}: sin el texto aparte`);
  }
  cierto(`las ${n} pantallas de carga usan la forma compartida`, problemas.length === 0, problemas.join("\n      "));
  cierto("y son de verdad muchas (si esto da pocas, el barrido está roto)", n >= 40, "encontró " + n);
}

/* Cada lista vacía de trabajo, con el botón que la llena. El texto tiene que
   nombrarlo tal como se llama en la pantalla. */
const VACIAS = [
  ["tareas.html", "enviadas-vacia", "Asignar una tarea"],
  ["examenes.html", "puestos-vacia", "Poner un examen"],
  ["planes.html", "sin-planes", "Plan nuevo"],
  ["asistencia.html", "horario-vacio", "➕ Agregar una clase a tu horario"],
  ["partidas.html", "archivos-empty-state", "Elegir uno o más archivos PGN"],
  ["partidas.html", "empty-state", "💾 Guardar PGN"],
];

function pruebaVacias() {
  console.log("\n=== Las listas vacías dicen qué hacer ===");
  for (const [rel, id, boton] of VACIAS) {
    const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    const i = s.indexOf(`id="${id}"`);
    // El elemento entero: de su etiqueta hasta la que lo cierra (un <p> o un
    // <div> con sus <p> adentro, que no anidan otro <div>).
    const inicio = s.lastIndexOf("<", i);
    const etiqueta = s.slice(inicio + 1, s.indexOf(" ", inicio));
    const trozo = i < 0 ? "" : s.slice(inicio, s.indexOf(`</${etiqueta}>`, i));
    cierto(`${rel} #${id} nombra «${boton}»`, trozo.includes(`«${boton}»`), trozo.slice(0, 200));
  }
  // Y el botón nombrado existe de verdad en su página (o en la clase en vivo).
  const nombrados = [
    ["tareas.html", "Asignar una tarea"], ["examenes.html", "Poner un examen"], ["planes.html", "Plan nuevo"],
    ["asistencia.html", "➕ Agregar una clase a tu horario"], ["partidas.html", "Elegir uno o más archivos PGN"],
    ["sesion.html", "💾 Guardar PGN"],
  ];
  for (const [rel, texto] of nombrados) {
    const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    cierto(`«${texto}» existe en ${rel}`, new RegExp(`>\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*<`).test(s));
  }
}

function contrasteEnPagina(sel) {
  const el = document.querySelector(sel);
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  let fondo = null;
  for (let n = el; n && !fondo; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length === 3 || c[3] === 1) fondo = c; }
  if (!fondo) fondo = [255, 255, 255];
  const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(fondo)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

async function pruebaEnPantalla(browser) {
  console.log("\n=== La pantalla de carga, a la vista ===");
  for (const [movimiento, oscuro] of [["no-preference", false], ["reduce", true]]) {
    // Sin JavaScript la página se queda en su pantalla de carga: es justo lo
    // que hay que mirar.
    const ctx = await browser.newContext({ serviceWorkers: "block", javaScriptEnabled: false, reducedMotion: movimiento, colorScheme: oscuro ? "dark" : "light" });
    const page = await ctx.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(BASE + "/tareas.html", { waitUntil: "load" });
    // El <body> cambia de color con transición (300 ms): se mide cuando terminó,
    // no a mitad de camino entre el fondo claro y el oscuro.
    if (oscuro) { await page.evaluate(() => document.documentElement.classList.add("dark")); await page.waitForTimeout(500); }
    const r = await page.evaluate(() => {
      const rueda = document.querySelector("#loading span[aria-hidden]");
      return { seVe: rueda.checkVisibility(), anim: getComputedStyle(rueda).animationName, texto: document.querySelector("#loading p").textContent };
    });
    cierto(`${movimiento}: la ruedita se ve`, r.seVe);
    if (movimiento === "reduce") cierto("con «reducir movimiento» se queda quieta", r.anim === "none", "animación: " + r.anim);
    else cierto("y gira", r.anim === "spin", "animación: " + r.anim);
    const c = await page.evaluate(contrasteEnPagina, "#loading p");
    cierto(`${oscuro ? "oscuro" : "claro"}: el texto «${r.texto}» tiene contraste ≥ 4.5 (${c})`, c >= 4.5);
    await ctx.close();
  }
}

(async () => {
  pruebaCarga();
  pruebaVacias();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaEnPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
