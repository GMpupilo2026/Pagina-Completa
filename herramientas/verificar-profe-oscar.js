/* Comprueba al profe Oscar como ayudante del alumno en los ejercicios
   (js/profe-oscar.js, enganchado en js/ejercicio-tablero.js), en un navegador
   de verdad y con el doble de Supabase de Entrenamiento.

   Lo que se rompe acá no da ningún error: un globo que tapa el tablero, una
   pista que Oscar dice distinta de la que dijo la página, un globo que se
   queda con la pista del ejercicio anterior, o un dibujo que se pinta igual
   con la cuenta ciega o con Oscar escondido. Por eso:

   1. Las poses que usa (las del módulo y las de la franja del panel) están
      todas en la lista de js/avatar-profe-oscar.js y tienen su imagen.
   2. La pista: Oscar dice LA MISMA frase que la página (sin «Pista:»), su
      globo va debajo del tablero, la pose es la de la etapa, y el globo se va
      con el ejercicio siguiente.
   3. La racha: felicita a las 3 y avisa el récord desde 5; no felicita cada
      acierto.
   4. Escondido (desde «Pregúntale al profe») o con la cuenta ciega, no sale.
   5. La búsqueda de «Pregúntale al profe»: las palabras que importan y que
      «finales» encuentre «final».

   El panel (la franja con su pose y el chat entero) lo comprueba
   verificar-panel.js, que tiene el doble del panel.

   Uso:  npm install; node herramientas/verificar-todo.js profe-oscar
         (levanta el sitio en el 8777 si no está)                              */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require("./lib/playwright-con-sesion");
const doble = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* 1. Las poses: todas en la lista, todas con su imagen. Se leen del código
   (los "pose" del módulo y de la franja, y las imagen("…")), así que una pose
   nueva mal escrita salta acá y no en la pantalla del alumno. */
function poses() {
  console.log("\n=== Las poses del profe Oscar existen ===");
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js/avatar-profe-oscar.js"), "utf8"), ctx);
  const ids = new Set(ctx.window.AvatarProfeOscar.LISTA.map((a) => a.id));
  const usadas = new Set();
  const leer = (f, re) => { const s = fs.readFileSync(path.join(RAIZ, f), "utf8"); let m; while ((m = re.exec(s))) usadas.add(m[1]); };
  leer("js/profe-oscar.js", /pose:\s*"([a-z-]+)"/g);
  leer("js/profe-oscar.js", /imagen\("([a-z-]+)"/g);
  leer("js/profe-oscar.js", /"(excelente|tu-puedes)"/g);
  leer("js/clases.js", /pose(?::|\s*=)\s*"([a-z-]+)"/g);
  const faltan = [...usadas].filter((id) => !ids.has(id) || !fs.existsSync(path.join(RAIZ, "img/avatar-profe-oscar", id + ".webp")));
  igual("se usan varias poses", usadas.size >= 15, true);
  igual("ninguna falta en la lista ni en img/avatar-profe-oscar/", faltan, []);
}

async function abrirMates(browser, local) {
  const r = await doble.abrir(browser, "/entreno/mates.html", {}, Object.assign({ entreno_mates_streak: "0", entreno_mates_best: "0" }, local || {}));
  await r.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await r.page.waitForFunction(() => typeof PUZZLES !== "undefined" && PUZZLES.mate1.length > 0 && game !== null, { timeout: 20000 });
  await r.page.evaluate(() => { currentCategory = "mate1"; currentIndex = 0; loadPuzzle(); });
  return r;
}
const globo = (page) => page.evaluate(() => {
  const g = document.getElementById("profe-oscar-globo");
  if (!g || !g.checkVisibility()) return null;
  const img = g.querySelector("img");
  const b = document.getElementById("board").getBoundingClientRect();
  const r = g.getBoundingClientRect();
  return {
    titulo: g.querySelector("p").textContent,
    texto: g.querySelectorAll("p")[1].textContent,
    pose: img ? img.dataset.profeOscar : null,
    imagenCargo: !!(img && img.complete && img.naturalWidth > 0),
    debajoDelTablero: r.top >= b.bottom - 1,
  };
});
const aviso = (page) => page.evaluate(() => document.getElementById("round-status").textContent);
const resolver = (page, i) => page.evaluate((i) => {
  currentCategory = "mate1"; currentIndex = i; loadPuzzle();
  const j = jugadaEsperada(); playMove(j.from, j.to, j.promotion);
}, i);

async function pista(browser) {
  console.log("\n=== La pista, en boca del profe Oscar ===");
  const { page, ctx, errores } = await abrirMates(browser);
  igual("sin pedir nada, Oscar no dice nada", await globo(page), null);
  await page.click("#hint-btn");
  await page.waitForFunction(() => { const g = document.getElementById("profe-oscar-globo"); return g && g.checkVisibility(); }, { timeout: 5000 });
  let g = (await globo(page)) || {};
  const dicho = await aviso(page);
  igual("dice la misma pista que la página, sin «Pista:»", g.texto.toLowerCase(), dicho.replace(/^Pista:\s*/, "").toLowerCase());
  igual("con la pose de su etapa", ["idea", "mmm", "te-toca"].includes(g.pose), true);
  igual("la imagen cargó", g.imagenCargo, true);
  igual("el globo va debajo del tablero, sin taparlo", g.debajoDelTablero, true);

  // Hasta la solución: «Así se resolvía» y la frase de la página.
  for (let i = 0; i < 4; i++) {
    const t = await page.evaluate(() => document.getElementById("hint-btn").textContent);
    await page.click("#hint-btn");
    if (/solución/.test(t)) break;
  }
  await page.waitForTimeout(200);
  g = await globo(page);
  igual("con la solución, Oscar dice cómo se resolvía (y no se borra al jugarla)", g && [g.titulo, /^La solución era: /.test(g.texto), g.pose], ["Así se resolvía", true, "a-repasar"]);

  await page.evaluate(() => { currentIndex = 1; loadPuzzle(); });
  igual("el ejercicio siguiente arranca sin el globo del anterior", await globo(page), null);
  igual("sin errores en la página", errores.length ? errores.join(" | ") : "ninguno", "ninguno");
  await ctx.close();
}

async function racha(browser) {
  console.log("\n=== La racha: felicita a las 3 y avisa el récord ===");
  {
    const { page, ctx, errores } = await abrirMates(browser);
    await resolver(page, 0);
    await page.waitForFunction(() => !locked || document.getElementById("fin-ejercicio").checkVisibility(), { timeout: 5000 });
    igual("con 1 acertada, nada", await globo(page), null);
    await resolver(page, 1);
    await page.waitForTimeout(100);
    igual("con 2, nada", await globo(page), null);
    await resolver(page, 2);
    await page.waitForFunction(() => { const g = document.getElementById("profe-oscar-globo"); return g && g.checkVisibility(); }, { timeout: 5000 });
    const g = (await globo(page)) || {};
    igual("con 3 seguidas, «¡Muy bien!»", [g.titulo, g.texto, g.pose], ["¡Muy bien!", "Llevas 3 seguidas. ¡Sigue así!", "muy-bien"]);
    igual("debajo del tablero", g.debajoDelTablero, true);
    igual("sin errores en la página", errores.length ? errores.join(" | ") : "ninguno", "ninguno");
    await ctx.close();
  }
  {
    // La mejor era 6: la séptima seguida es récord y no es un número redondo.
    const { page, ctx } = await abrirMates(browser, { entreno_mates_streak: "6", entreno_mates_best: "6" });
    await resolver(page, 0);
    await page.waitForFunction(() => { const g = document.getElementById("profe-oscar-globo"); return g && g.checkVisibility(); }, { timeout: 5000 });
    const g = (await globo(page)) || {};
    igual("al pasar su mejor racha, «¡Nuevo récord!»", [g.titulo, g.texto, g.pose], ["¡Nuevo récord!", "Tu mejor racha aquí ahora es de 7.", "felicidades"]);
    await resolver(page, 1);
    await page.waitForTimeout(150);
    igual("la siguiente (8) ya no lo repite", await globo(page), null);
    await ctx.close();
  }
}

async function apagado(browser) {
  console.log("\n=== Escondido o con la cuenta ciega, no sale ===");
  {
    const { page, ctx, errores } = await abrirMates(browser, { profe_oscar_v1: "oculto" });
    await page.click("#hint-btn");
    await page.waitForTimeout(400);
    igual("escondido: la pista se dice igual", (await aviso(page)).startsWith("Pista"), true);
    igual("escondido: sin globo", await globo(page), null);
    igual("sin errores en la página", errores.length ? errores.join(" | ") : "ninguno", "ninguno");
    await ctx.close();
  }
  {
    const { page, ctx } = await abrirMates(browser);
    await page.evaluate(() => document.documentElement.classList.add("modo-ciego"));
    await page.click("#hint-btn");
    await page.waitForTimeout(400);
    igual("con la cuenta ciega: sin globo", await globo(page), null);
    igual("y sin ningún dibujo de Oscar", await page.evaluate(() => document.querySelectorAll("img[data-profe-oscar]").length), 0);
    await ctx.close();
  }
}

async function busqueda(browser) {
  console.log("\n=== «Pregúntale al profe»: qué palabras cuentan ===");
  const { page, ctx } = await abrirMates(browser);
  await page.evaluate(() => new Promise((listo) => {
    if (window.ProfeOscar) return listo();
    const s = document.createElement("script"); s.src = "../js/profe-oscar.js"; s.onload = listo; document.head.appendChild(s);
  }));
  const r = await page.evaluate(() => {
    const c = (texto, buscar) => ({ texto, href: "#", buscar: " " + buscar, orden: 0 });
    const lista = [
      c("Tareas", "tareas lo que te pidio tu profe deberes"),
      c("Finales contra la máquina", "finales contra la maquina rey peon torre"),
      c("Mates", "mates jaque mate en uno dos tres"),
      c("Aperturas y celadas", "aperturas celadas italiana"),
    ];
    const nombres = (q) => ProfeOscar._buscar(q, lista).map((x) => x.texto);
    return {
      palabras: ProfeOscar._palabras("¿Dónde están mis tareas, profe?"),
      finales: nombres("quiero practicar finales"),
      tarea: nombres("¿y mi tarea?"),
      nada: nombres("¿cómo hago?"),
      orden: nombres("mate en dos"),
    };
  });
  igual("de «¿Dónde están mis tareas, profe?» queda solo «tarea»", r.palabras, ["tarea"]);
  igual("«quiero practicar finales» encuentra los finales", r.finales, ["Finales contra la máquina"]);
  igual("«¿y mi tarea?» encuentra Tareas", r.tarea, ["Tareas"]);
  igual("una pregunta sin nada que buscar no inventa resultados", r.nada, []);
  igual("«mate en dos» pone primero Mates", r.orden[0], "Mates");
  await ctx.close();
}

(async () => {
  poses();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pista(browser);
    await racha(browser);
    await apagado(browser);
    await busqueda(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl profe Oscar ayuda en los ejercicios como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
