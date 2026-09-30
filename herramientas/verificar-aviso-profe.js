/* Comprueba el aviso del profe a sus alumnos: la ventana que el alumno no se
   puede saltar (js/aviso-profe.js) y la caja del profe en su panel, con
   quiénes lo leyeron (js/clases.js, pintarAvisoAlumnos).

   Lo que se rompe acá no da ningún error:
   1. QUE EL SCRIPT ESTÉ EN TODA PÁGINA DE LA ACADEMIA menos examen.html. Un
      aviso que solo sale en el panel no le llega a quien entra directo a
      Entrenamiento desde el celular.
   2. QUE LA VENTANA NO SE PUEDA SALTAR: modal de verdad (`:modal`, lo de
      afuera inerte), Escape no la cierra, y el foco arranca en el botón.
   3. QUE «MARCAR COMO LEÍDO» LO ANOTE EN LA BASE, con el aviso correcto, y
      que después venga el siguiente; y que si la base no contesta, la
      ventana se cierre igual (nadie queda encerrado).
   4. QUE EL TEXTO DEL PROFE VAYA COMO TEXTO, no como HTML.
   5. EL LADO DEL PROFE: los grupos y subgrupos para elegir, cuántos lo
      leyeron, la lista de quiénes (con aria-expanded), y que mandar pase el
      grupo elegido a enviar_aviso(). Al alumno la caja no le sale.

   Uso:  node herramientas/verificar-todo.js aviso-profe                     */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { panel, ALUMNA, PROFE, CHROME } = require("./verificar-panel.js");

const RAIZ = path.dirname(__dirname);
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

function pruebaPaginas() {
  console.log("\n=== El script está en toda página de la Academia menos el examen ===");
  const cab = fs.readFileSync(path.join(RAIZ, "herramientas/academia-cabecera.py"), "utf8");
  const lista = ((cab.match(/^PAGINAS = \[([\s\S]*?)\]/m) || [])[1] || "").match(/"[^"]+"/g).map((x) => x.slice(1, -1));
  const sin = [], con = [];
  lista.forEach((p) => {
    const s = fs.readFileSync(path.join(RAIZ, p), "utf8");
    (s.includes("js/aviso-profe.js") ? con : sin).push(p);
  });
  igual("solo examen.html se queda sin la ventana", sin, ["examen.html"]);
  igual("y son todas las demás (" + con.length + ")", con.length, lista.length - 1);
}

const AVISOS = [
  { id: "av-1", texto: "Mañana no hay clase.\nNos vemos el jueves <b>temprano</b>.", created_at: "2026-09-30T20:00:00Z", profesor: "Karina Rojas" },
  { id: "av-2", texto: "Traigan la tarea de finales.", created_at: "2026-09-30T21:00:00Z", profesor: "Karina Rojas" },
];
const DIALOGO = () => {
  const d = document.querySelector("dialog[data-aviso-profe]");
  return d ? { id: d.dataset.avisoProfe, modal: d.matches(":modal"), foco: document.activeElement && document.activeElement.hasAttribute("data-aviso-leido"),
               titulo: d.querySelector("h2").textContent, texto: d.querySelector("#aviso-profe-texto").textContent,
               cuando: d.querySelector("p").textContent } : null;
};

async function pruebaAlumno(browser) {
  console.log("\n=== La ventana del alumno ===");
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { rpc: { mis_avisos_sin_leer: AVISOS } });
  await r.page.waitForSelector("dialog[data-aviso-profe]", { timeout: 10000 }).catch(() => {});
  let d = await r.page.evaluate(DIALOGO);
  igual("sale el primero (el más viejo), modal de verdad y con el foco en el botón",
    d && [d.id, d.modal, d.foco], ["av-1", true, true]);
  igual("dice de quién es", d && d.titulo, "📣 Aviso de Karina Rojas");
  igual("el texto del profe va como texto, no como HTML",
    d && [d.texto, await r.page.evaluate(() => !!document.querySelector("#aviso-profe-texto b"))],
    ["Mañana no hay clase.\nNos vemos el jueves <b>temprano</b>.", false]);
  igual("y cuántos tiene", d && / · 1 de 2$/.test(d.cuando), true);
  igual("lo de afuera no se puede tocar (inerte)",
    await r.page.evaluate(() => { const a = document.querySelector('#tile-grid a[href]'); return document.elementFromPoint(a.getBoundingClientRect().left + 5, a.getBoundingClientRect().top + 5) === a; }), false);
  await r.page.keyboard.press("Escape");
  igual("Escape no la cierra", await r.page.evaluate(() => !!document.querySelector("dialog[data-aviso-profe][open]")), true);
  await r.page.click("[data-aviso-leido]");
  await r.page.waitForFunction(() => { const d = document.querySelector("dialog[data-aviso-profe]"); return d && d.dataset.avisoProfe === "av-2"; }, null, { timeout: 5000 }).catch(() => {});
  igual("«Marcar como leído» lo anota en la base, con ESE aviso",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "marcar_aviso_leido").map((c) => c.args)), [{ p_aviso: "av-1" }]);
  d = await r.page.evaluate(DIALOGO);
  igual("y viene el siguiente", d && [d.id, / · 2 de 2$/.test(d.cuando)], ["av-2", true]);
  await r.page.click("[data-aviso-leido]");
  await r.page.waitForFunction(() => !document.querySelector("dialog[data-aviso-profe]"), null, { timeout: 5000 }).catch(() => {});
  igual("con el último, la página vuelve a quedar libre",
    await r.page.evaluate(() => [!!document.querySelector("dialog[data-aviso-profe]"), window.__consultas.filter((c) => c.tabla === "marcar_aviso_leido").length]), [false, 2]);
  igual("al alumno no le sale la caja del profe", await r.page.evaluate(() => document.getElementById("aviso-alumnos").checkVisibility()), false);
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();

  // Si la base no contesta, se cierra igual: nadie queda encerrado.
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { rpc: { mis_avisos_sin_leer: [AVISOS[0]] }, lanzar: ["marcar_aviso_leido"] });
  await r.page.waitForSelector("dialog[data-aviso-profe]", { timeout: 10000 }).catch(() => {});
  await r.page.click("[data-aviso-leido]");
  const dice = await r.page.evaluate(() => document.querySelector("dialog[data-aviso-profe] [role=status]").textContent);
  await r.page.waitForFunction(() => !document.querySelector("dialog[data-aviso-profe]"), null, { timeout: 5000 }).catch(() => {});
  igual("si no se pudo anotar, lo dice y se cierra igual",
    [dice, await r.page.evaluate(() => !!document.querySelector("dialog[data-aviso-profe]"))],
    ["No se pudo anotar: te lo vamos a volver a mostrar.", false]);
  await r.ctx.close();

  // Sin avisos no hay ventana.
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {});
  await r.page.waitForTimeout(500);
  igual("sin avisos, no hay ventana", await r.page.evaluate(() => !!document.querySelector("dialog[data-aviso-profe]")), false);
  await r.ctx.close();
}

async function pruebaProfe(browser) {
  console.log("\n=== La caja del profe ===");
  const r = await panel(browser, [PROFE, ALUMNA], "u-profe", null, {
    rpc: {
      grupos_de_mis_alumnos: [{ grupo: "7B", alumnos: 12 }],
      mis_subgrupos: [{ id: "sg-1", nombre: "Avanzados", alumnos: ["u-ana"], cuantos: 3 }],
      mis_avisos_enviados: [{ id: "av-1", texto: "Mañana no hay clase.", para: "Grupo 7B", created_at: "2026-09-30T20:00:00Z", total: 4, leidos: 3 }],
      lectores_de_aviso: [
        { alumno_id: "u-bruno", nombre: "Bruno Mora", leido_at: null },
        { alumno_id: "u-ana", nombre: "Ana Rojas", leido_at: "2026-09-30T21:15:00Z" },
      ],
    },
  });
  await r.page.waitForFunction(() => document.querySelector("#aviso-lista [data-leidos]"), null, { timeout: 10000 }).catch(() => {});
  igual("la caja se ve", await r.page.evaluate(() => document.getElementById("aviso-alumnos").checkVisibility()), true);
  igual("se elige para quién: todos, sus grupos y sus subgrupos",
    await r.page.evaluate(() => Array.from(document.querySelectorAll("#aviso-para option")).map((o) => [o.value, o.textContent])),
    [["", "Todos tus alumnos"], ["g:7B", "Grupo 7B (12)"], ["s:sg-1", "Avanzados (3)"]]);
  igual("de cada aviso, cuántos lo leyeron", await r.page.evaluate(() => document.querySelector("#aviso-lista [data-leidos]").textContent), "3 de 4 lo leyeron");
  const ver = "#aviso-lista button[aria-controls]";
  igual("«Ver quiénes» arranca cerrado", await r.page.getAttribute(ver, "aria-expanded"), "false");
  await r.page.click(ver);
  await r.page.waitForFunction(() => document.querySelectorAll("#aviso-lista ul li").length === 2, null, { timeout: 5000 }).catch(() => {});
  igual("al abrirlo lo dice, y trae quién lo leyó y quién no, escrito",
    [await r.page.getAttribute(ver, "aria-expanded"),
     await r.page.evaluate(() => Array.from(document.querySelectorAll("#aviso-lista ul li")).map((l) => l.textContent.replace(/ — lo leyó el .*/, " — lo leyó")))],
    ["true", ["○ Bruno Mora — sin leer", "✓ Ana Rojas — lo leyó"]]);
  igual("pide los lectores de ESE aviso",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "lectores_de_aviso").map((c) => c.args)), [{ p_aviso: "av-1" }]);

  // Vacío: no se manda nada y se dice por qué.
  await r.page.click("#aviso-mandar");
  igual("sin texto no se manda, y dice por qué",
    [await r.page.textContent("#aviso-estado"), await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "enviar_aviso").length)],
    ["Escribe el aviso antes de mandarlo.", 0]);
  await r.page.fill("#aviso-texto", "Traigan la tarea de finales.");
  igual("cuenta los caracteres", await r.page.textContent("#aviso-cuenta"), "28 de 1000 caracteres");
  await r.page.selectOption("#aviso-para", "g:7B");
  await r.page.click("#aviso-mandar");
  await r.page.click("[data-avisos-aceptar]");
  await r.page.waitForFunction(() => /Listo/.test(document.getElementById("aviso-estado").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("manda al grupo elegido, pidiéndolo a la base",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "enviar_aviso").map((c) => c.args)),
    [{ p_texto: "Traigan la tarea de finales.", p_grupo: "7B", p_subgrupo: null }]);
  igual("y dice a quién se lo mandó", await r.page.textContent("#aviso-estado"), "Listo: se lo mandaste a Grupo 7B (12).");
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();
}

(async () => {
  pruebaPaginas();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumno(browser);
    await pruebaProfe(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl aviso del profe está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
