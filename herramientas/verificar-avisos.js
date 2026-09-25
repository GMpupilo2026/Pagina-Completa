/* Los avisos propios (js/avisos.js) y las migas de pan de la Academia.

   Lo que comprueba:

   1. Que ninguna página vuelva a usar alert(), confirm() ni prompt() del
      navegador. Esas ventanas no siguen el modo oscuro ni el tema, congelan la
      página (el reloj de una partida incluido) y no dejan ofrecer «Deshacer».
      Una nueva se cuela con un copiar y pegar sin que nada falle: por eso se
      barre todo el sitio, no una lista.
   2. Que toda página que llama a Avisos cargue js/avisos.js, y sin defer: un
      aviso que se pide antes de que el archivo esté es un error en la consola
      y un botón que no hace nada.
   3. Que los avisos funcionen en el navegador como se promete: el mensaje se
      ve y se va solo, el de error se queda, «Deshacer» llama a su función, la
      confirmación devuelve sí/no, Escape cancela, el foco arranca en
      «Cancelar» cuando lo que sigue no tiene vuelta atrás y vuelve al botón
      que abrió el diálogo, y los colores pasan WCAG AA medidos contra el
      fondo real, en claro y en oscuro.
   4. Que toda página de la Academia (las del encabezado mínimo) tenga sus
      migas, que cada paso lleve a una página que existe, que la última diga
      aria-current="page", que se vean de verdad y que no desborden en un
      celular.

       node herramientas/verificar-avisos.js                                */
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
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

// ------------------------------------------------------------ archivos
const FUERA = new Set(["node_modules", ".git", "herramientas", "supabase", "docs"]);
function archivosDelSitio() {
  const lista = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = path.relative(RAIZ, p);
      if (e.isDirectory()) {
        if (FUERA.has(e.name) || rel === path.join("js", "vendor")) continue;
        recorrer(p);
      } else if (/\.(html|js)$/.test(e.name) && !/\.min\.js$/.test(e.name) && rel !== "sw.js") {
        lista.push(rel);
      }
    }
  })(RAIZ);
  return lista;
}

/* Sin comentarios: un comentario que CUENTA que antes había un prompt() no es
   un prompt(). El `//` solo cuenta como comentario después de un espacio o al
   empezar la línea, para no comerse las direcciones https://. */
function sinComentarios(s) {
  return s.replace(/<!--[\s\S]*?-->/g, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

const NATIVO = /(?<![\w.$])(?:window\.)?(alert|confirm|prompt)\s*\(/g;

function pruebaEstatica() {
  console.log("\n=== Ni alert(), ni confirm(), ni prompt() en el sitio ===");
  const archivos = archivosDelSitio();
  const hallados = [];
  for (const rel of archivos) {
    const s = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
    let m;
    NATIVO.lastIndex = 0;
    while ((m = NATIVO.exec(s))) {
      const linea = s.slice(0, m.index).split("\n").length;
      hallados.push(`${rel}: ${m[1]}() cerca de la línea ${linea}`);
    }
  }
  cierto(`ninguno en los ${archivos.length} archivos del sitio`, hallados.length === 0,
    "usar Avisos.avisar / Avisos.confirmar / Avisos.pedir (js/avisos.js):\n      " + hallados.join("\n      "));

  console.log("\n=== Quien llama a Avisos, carga js/avisos.js ===");
  const sinCargar = [];
  let usan = 0;
  for (const rel of archivos.filter((r) => r.endsWith(".html"))) {
    const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    // El uso se busca también en su código mudado a js/; la etiqueta, en el HTML.
    if (!/\bAvisos\./.test(sinComentarios(require("./lib/codigo-de-pagina").leer(rel)))) continue;
    usan += 1;
    const arriba = "../".repeat(rel.split("/").length - 1);
    const etiqueta = new RegExp(`<script src="${arriba.replace(/\./g, "\\.")}js/avisos\\.js"\\s*></script>`);
    if (!etiqueta.test(s)) sinCargar.push(rel);
  }
  cierto(`las ${usan} páginas que lo usan lo cargan, sin defer ni async`, sinCargar.length === 0,
    "falta <script src=\"js/avisos.js\"></script> en el <head> de: " + sinCargar.join(", "));
  cierto("y son de verdad varias (si esto da cero, el barrido está roto)", usan >= 20, "encontró " + usan);
}

// ------------------------------------------------------------ contraste
/* Contraste WCAG entre el color del texto y el primer fondo opaco hacia
   arriba. Se corre dentro de la página. */
function contrasteEnPagina(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  let fondo = null;
  for (let n = el; n; n = n.parentElement) {
    const c = rgb(getComputedStyle(n).backgroundColor);
    if (c.length >= 3 && (c.length === 3 || c[3] === 1)) { fondo = c; break; }
  }
  if (!fondo) fondo = [255, 255, 255];
  const texto = rgb(getComputedStyle(el).color);
  const [a, b] = [lum(texto), lum(fondo)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

// ------------------------------------------------------------ avisos
async function pruebaAvisos(browser) {
  console.log("\n=== Los avisos, en el navegador ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.clock.install();
  await page.goto(BASE + "/offline.html", { waitUntil: "load" });
  await page.addScriptTag({ url: "/js/avisos.js" });
  cierto("js/avisos.js deja window.Avisos", await page.evaluate(() => typeof window.Avisos === "object"));

  // Un mensaje de "listo": se ve, lo anuncia el lector sin interrumpir y se va solo.
  await page.evaluate(() => Avisos.avisar("Guardado para Ana <b>Rojas</b>."));
  const msg = page.locator(".avisos-mensaje").last();
  cierto("el mensaje se ve de verdad", await msg.evaluate((m) => m.checkVisibility()));
  igual("con role=status", await msg.getAttribute("role"), "status");
  cierto("el texto va como texto, no como HTML", await msg.evaluate((m) => m.textContent.includes("<b>Rojas</b>") && !m.querySelector("b")));
  const cOk = await page.evaluate(contrasteEnPagina, ".avisos-mensaje:last-child p");
  cierto(`contraste del mensaje ≥ 4.5 (${cOk})`, cOk >= 4.5);
  await page.clock.runFor(6500);
  igual("a los 6 segundos ya no está", await page.locator(".avisos-mensaje").count(), 0);

  // Un error: interrumpe y NO se va solo.
  await page.evaluate(() => Avisos.avisar("No se pudo guardar: sin conexión", { tipo: "error" }));
  igual("el de error va con role=alert", await page.locator(".avisos-mensaje").last().getAttribute("role"), "alert");
  const cErr = await page.evaluate(contrasteEnPagina, ".avisos-mensaje:last-child p");
  cierto(`contraste del error ≥ 4.5 (${cErr})`, cErr >= 4.5);
  await page.clock.runFor(60000);
  igual("un minuto después el error sigue ahí", await page.locator(".avisos-mensaje").count(), 1);
  await page.click('.avisos-mensaje button[aria-label="Cerrar aviso"]');
  igual("y se cierra con su ✕", await page.locator(".avisos-mensaje").count(), 0);

  // Deshacer.
  await page.evaluate(() => { window.__deshecho = 0; Avisos.avisar("PGN eliminado.", { deshacer: () => { window.__deshecho += 1; } }); });
  await page.click("[data-avisos-deshacer]");
  igual("«Deshacer» llama a su función una vez", await page.evaluate(() => window.__deshecho), 1);
  await page.clock.runFor(1000);
  cierto("y el mensaje se cierra, para no deshacer dos veces",
    await page.evaluate(() => ![...document.querySelectorAll(".avisos-mensaje")].some((m) => m.textContent.includes("PGN eliminado"))));
  await page.evaluate(() => document.querySelectorAll(".avisos-mensaje").forEach((m) => m.remove()));

  // Confirmar: sí.
  await page.evaluate(() => {
    const b = document.createElement("button"); b.id = "abridor"; b.textContent = "Borrar"; document.body.appendChild(b); b.focus();
    window.__r = Avisos.confirmar("Esta acción no se puede deshacer.", { titulo: "¿Borrar esto?", aceptar: "Borrar", peligro: true });
  });
  const dlg = page.locator("dialog[data-avisos]");
  cierto("la confirmación se ve de verdad", await dlg.evaluate((d) => d.open && d.checkVisibility()));
  igual("es modal (el resto de la página queda inerte)", await dlg.evaluate((d) => d.matches(":modal")), "true");
  igual("con peligro, el foco arranca en «Cancelar»", await page.evaluate(() => document.activeElement.textContent), "Cancelar");
  igual("el botón dice lo que va a pasar", await page.locator("[data-avisos-aceptar]").textContent(), "Borrar");
  cierto("el diálogo tiene nombre accesible", await dlg.evaluate((d) => {
    const id = d.getAttribute("aria-labelledby"); return !!(id && document.getElementById(id).textContent.includes("¿Borrar esto?"));
  }));
  const cBoton = await page.evaluate(contrasteEnPagina, "[data-avisos-aceptar]");
  cierto(`contraste del botón rojo ≥ 4.5 (${cBoton})`, cBoton >= 4.5);
  const cTexto = await page.evaluate(contrasteEnPagina, "dialog[data-avisos] p");
  cierto(`contraste del texto del diálogo en claro ≥ 4.5 (${cTexto})`, cTexto >= 4.5);
  await page.click("[data-avisos-aceptar]");
  igual("«Borrar» devuelve true", await page.evaluate(() => window.__r), "true");
  igual("el diálogo se va", await page.locator("dialog[data-avisos]").count(), 0);
  igual("y el foco vuelve al botón que lo abrió", await page.evaluate(() => document.activeElement.id), "abridor");

  // Confirmar: Escape es no.
  await page.evaluate(() => { window.__r = Avisos.confirmar("¿Seguir?", { aceptar: "Seguir" }); });
  igual("sin peligro, el foco arranca en el botón de seguir", await page.evaluate(() => document.activeElement.textContent), "Seguir");
  await page.keyboard.press("Escape");
  igual("Escape devuelve false", await page.evaluate(() => window.__r), "false");

  // En oscuro.
  await page.evaluate(() => { document.documentElement.classList.add("dark"); window.__r = Avisos.confirmar("Texto en oscuro.", { titulo: "Oscuro" }); });
  const cOscuro = await page.evaluate(contrasteEnPagina, "dialog[data-avisos] p");
  cierto(`contraste del texto del diálogo en oscuro ≥ 4.5 (${cOscuro})`, cOscuro >= 4.5);
  const cTitulo = await page.evaluate(contrasteEnPagina, "dialog[data-avisos] h2");
  cierto(`contraste del título en oscuro ≥ 4.5 (${cTitulo})`, cTitulo >= 4.5);
  await page.click("[data-avisos-cancelar]");
  igual("«Cancelar» devuelve false", await page.evaluate(() => window.__r), "false");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  // Dos confirmaciones seguidas: la segunda espera a la primera.
  await page.evaluate(() => { window.__a = Avisos.confirmar("Uno"); window.__b = Avisos.confirmar("Dos"); });
  igual("de a un diálogo por vez", await page.locator("dialog[data-avisos]").count(), 1);
  await page.click("[data-avisos-aceptar]");
  await page.waitForFunction(() => document.querySelector("dialog[data-avisos]") && document.querySelector("dialog[data-avisos]").textContent.includes("Dos"));
  await page.click("[data-avisos-cancelar]");
  igual("y cada uno contesta lo suyo", await page.evaluate(async () => [await window.__a, await window.__b]), [true, false]);

  // Pedir: escribir y Enter.
  await page.evaluate(() => { window.__r = Avisos.pedir("", { titulo: "Carpeta nueva", etiqueta: "Nombre de la carpeta", aceptar: "Crear" }); });
  igual("el foco arranca en el campo", await page.evaluate(() => document.activeElement.tagName), "INPUT");
  cierto("el campo tiene su etiqueta", await page.evaluate(() => document.activeElement.labels[0].textContent === "Nombre de la carpeta"));
  await page.keyboard.type("Finales de torre");
  await page.keyboard.press("Enter");
  igual("Enter devuelve lo escrito", await page.evaluate(() => window.__r), "Finales de torre");
  await page.evaluate(() => { window.__r = Avisos.pedir("¿Por qué?"); });
  await page.keyboard.press("Escape");
  igual("cancelar devuelve null", await page.evaluate(() => window.__r), null);

  // Formulario.
  await page.evaluate(() => { window.__r = Avisos.formulario({ titulo: "Registrar un pago", campos: [
    { nombre: "monto", etiqueta: "¿Cuánto entró?", valor: "12500" },
    { nombre: "metodo", etiqueta: "¿Cómo pagó?", tipo: "select", valor: "sinpe", opciones: [["sinpe", "SINPE Móvil"], ["efectivo", "Efectivo"]] },
  ] }); });
  await page.selectOption("dialog[data-avisos] select", "efectivo");
  await page.click("[data-avisos-aceptar]");
  igual("el formulario devuelve cada campo por su nombre", await page.evaluate(() => window.__r), { monto: "12500", metodo: "efectivo" });

  // Con un diálogo abierto, los mensajes se ven y se tocan: afuera quedarían
  // detrás del diálogo, inertes.
  await page.evaluate(() => {
    window.__deshecho2 = 0;
    Avisos.avisar("Ya estaba a la vista.");
    window.__r = Avisos.confirmar("¿Seguir?", { aceptar: "Seguir" });
    Avisos.avisar("PGN eliminado.", { deshacer: () => { window.__deshecho2 += 1; } });
  });
  cierto("con un diálogo abierto, los mensajes van adentro de él",
    await page.evaluate(() => document.querySelectorAll("dialog[data-avisos] .avisos-mensaje").length === 2));
  cierto("y se ven de verdad", await page.evaluate(() =>
    [...document.querySelectorAll(".avisos-mensaje")].every((m) => m.checkVisibility())));
  await page.click("[data-avisos-deshacer]", { timeout: 3000 });
  igual("su «Deshacer» se puede tocar con el diálogo abierto", await page.evaluate(() => window.__deshecho2), 1);
  await page.click("[data-avisos-aceptar]");
  await page.waitForFunction(() => !document.querySelector("dialog[data-avisos]"));
  igual("al cerrar el diálogo, el que quedaba vuelve a la página",
    await page.evaluate(() => [...document.querySelectorAll(".avisos-mensaje")].map((m) => !m.closest("dialog") && m.checkVisibility())), [true]);
  await page.evaluate(() => document.querySelectorAll(".avisos-mensaje").forEach((m) => m.remove()));

  // Alerta: un solo botón.
  await page.evaluate(() => { window.__fin = false; Avisos.alerta("Esto queda anotado.", { titulo: "Saliste del examen" }).then(() => { window.__fin = true; }); });
  igual("la alerta no ofrece cancelar", await page.locator("[data-avisos-cancelar]").count(), 0);
  await page.click("[data-avisos-aceptar]");
  await page.waitForFunction(() => window.__fin);
  cierto("y termina al apretar «Entendido»", true);

  cierto("la página no tiró ningún error", errores.length === 0, errores.join("\n      "));
  await ctx.close();
}

// ------------------------------------------------------------ migas
function paginasConEncabezadoDeAcademia() {
  return archivosDelSitio().filter((rel) => rel.endsWith(".html") &&
    fs.readFileSync(path.join(RAIZ, rel), "utf8").includes('id="marca-enlace"'));
}

function pruebaMigasEstatica() {
  console.log("\n=== Las migas, en el HTML ===");
  const paginas = paginasConEncabezadoDeAcademia();
  const problemas = [];
  for (const rel of paginas) {
    const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    const bloques = s.split("<!-- migas: inicio -->").length - 1;
    if (rel === "clases.html") { if (bloques) problemas.push("clases.html es la raíz y no lleva migas"); continue; }
    if (bloques !== 1) { problemas.push(`${rel}: ${bloques} bloques de migas`); continue; }
    const bloque = s.slice(s.indexOf("<!-- migas: inicio -->"), s.indexOf("<!-- migas: fin -->"));
    const hrefs = [...bloque.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    if (!hrefs.length) problemas.push(`${rel}: las migas no tienen ningún enlace`);
    for (const h of hrefs) {
      const destino = path.normalize(path.join(path.dirname(rel), h));
      if (!fs.existsSync(path.join(RAIZ, destino))) problemas.push(`${rel}: el paso ${h} no existe`);
    }
    if (hrefs.length && path.normalize(path.join(path.dirname(rel), hrefs[0])) !== "clases.html")
      problemas.push(`${rel}: el primer paso no es el panel`);
    if ((bloque.match(/aria-current="page"/g) || []).length !== 1) problemas.push(`${rel}: sin aria-current="page"`);
    if (!/aria-label="Estás en"/.test(bloque)) problemas.push(`${rel}: el <nav> no dice que es el camino`);
    const fin = s.indexOf("</header>", s.indexOf('<header id="header"'));
    if (s.indexOf("<!-- migas: inicio -->") !== fin + "</header>".length) problemas.push(`${rel}: las migas no van justo debajo del encabezado`);
  }
  cierto(`las ${paginas.length} páginas de la Academia tienen sus migas bien armadas`, problemas.length === 0,
    "corre python3 herramientas/academia-cabecera.py:\n      " + problemas.join("\n      "));
  cierto("y son de verdad muchas (si esto da pocas, el barrido está roto)", paginas.length >= 60, "encontró " + paginas.length);
}

async function pruebaMigasEnPantalla(browser) {
  console.log("\n=== Las migas, en la pantalla ===");
  for (const [rel, esperado] of [
    ["entreno/mates.html", ["Academia", "Entrenamiento", "Mates"]],
    ["niebla.html", ["Academia", "Juegos", "Niebla de Guerra"]],
    ["sesion.html", ["Academia", "Sesión en vivo"]],
  ]) {
    for (const [ancho, oscuro] of [[1280, false], [360, true]]) {
      // Sin JavaScript de la página: las migas son HTML y tienen que estar
      // aunque no cargue nada más (ni la sesión, ni Supabase). Con JavaScript,
      // la página sin sesión se va a login.html antes de poder mirarla.
      const ctx = await browser.newContext({ serviceWorkers: "block", javaScriptEnabled: false, viewport: { width: ancho, height: 800 } });
      const page = await ctx.newPage();
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await page.goto(BASE + "/" + rel, { waitUntil: "load" });
      if (oscuro) await page.evaluate(() => document.documentElement.classList.add("dark"));
      const pasos = await page.evaluate(() => [...document.querySelectorAll("#migas li")].map((li) => li.textContent.replace(/[›🏛️]/gu, "").trim()));
      igual(`${rel} (${ancho}px): el camino`, pasos, esperado);
      cierto(`${rel} (${ancho}px): se ven de verdad`, await page.evaluate(() => document.getElementById("migas").checkVisibility()));
      cierto(`${rel} (${ancho}px): no desbordan`, await page.evaluate(() => {
        const n = document.getElementById("migas"); return n.scrollWidth <= n.clientWidth;
      }));
      const cEnlace = await page.evaluate(contrasteEnPagina, "#migas a");
      const cActual = await page.evaluate(contrasteEnPagina, '#migas [aria-current="page"]');
      cierto(`${rel} (${ancho}px${oscuro ? ", oscuro" : ""}): contraste de enlace ${cEnlace} y actual ${cActual} ≥ 4.5`, cEnlace >= 4.5 && cActual >= 4.5);
      cierto(`${rel} (${ancho}px): los enlaces van subrayados, no solo de otro color`,
        await page.evaluate(() => getComputedStyle(document.querySelector("#migas a")).textDecorationLine.includes("underline")));
      await ctx.close();
    }
  }
}

(async () => {
  pruebaEstatica();
  pruebaMigasEstatica();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAvisos(browser);
    await pruebaMigasEnPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
