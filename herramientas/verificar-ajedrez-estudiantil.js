/* ajedrez-estudiantil.html: la participación en los torneos estudiantiles de
   Costa Rica, con sus filtros: una o varias regiones, categoría, etapa,
   modalidad, rama y años.

   Lo que comprueba:
   - que data/ajedrez-estudiantil.json esté al día con su fuente
     (herramientas/ajedrez-estudiantil.py --comprobar);
   - que las cifras que pinta la página sean las que salen de contar el CSV
     acá, por otro camino (sin el código de la página): total por año, el de
     una región, el de una categoría, el de las dos juntas;
   - que los filtros cambien todo (cifras, título del gráfico, tabla) y vayan
     en la dirección, y que un enlace con ?region=…&categoria=… abra esa vista;
   - el panel de regiones: dice si está abierto, se elige más de una región
     (la cifra es la suma de las dos en el CSV y abajo sale cada una), y
     Escape lo cierra y devuelve el foco al botón;
   - la etapa, la modalidad, la rama (sacada del nombre, en el JSON) y los
     años: cada uno da la cifra que sale del CSV, y el rango nunca queda al
     revés;
   - el aviso de la final alterna al comparar una categoría;
   - que cada año del gráfico se alcance con Tab y diga su valor, y que la
     ventanita se vea de verdad (getComputedStyle, no el atributo);
   - que a 400 px no haya desplazamiento horizontal y el gráfico se vea;
   - el modo oscuro (la tarjeta no queda blanca);
   - que si el JSON no llega, la página lo diga en vez de quedarse cargando.

   Ver «Ajedrez estudiantil en Costa Rica: los torneos de chess-results» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-ajedrez-estudiantil.js                    */
"use strict";
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const PAGINA = BASE + "/ajedrez-estudiantil.html";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

// ---- 1. El JSON, al día con su fuente ----
console.log("Los datos");
try {
  execFileSync("python3", [path.join(RAIZ, "herramientas", "ajedrez-estudiantil.py"), "--comprobar"], { stdio: "pipe" });
  cierto("data/ajedrez-estudiantil.json está al día con el CSV", true);
} catch (e) {
  cierto("data/ajedrez-estudiantil.json está al día con el CSV", false, String(e.stderr || e.message).trim());
}

// ---- Las cuentas, por otro camino: directo del CSV ----
function leerCSV(ruta) {
  const lineas = fs.readFileSync(ruta, "utf8").trim().split("\n");
  const partir = (l) => { const o = []; let c = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { o.push(c); c = ""; } else c += ch; } o.push(c); return o; };
  const cols = partir(lineas[0]);
  return lineas.slice(1).map((l) => Object.fromEntries(partir(l).map((v, i) => [cols[i], v])));
}
const TORNEOS = leerCSV(path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-torneos.csv"));
const JDE = ["Institucional o circuital", "Regional", "Interregional", "Nacional"];
// La rama no está en el CSV: sale del nombre y va en el JSON (por clave).
const JSON_DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "ajedrez-estudiantil.json"), "utf8"));
const RAMA = Object.fromEntries(JSON_DATOS.torneos.map((f) => [String(f[0]), f[JSON_DATOS.columnas.indexOf("rama")]]));
// Participaciones: torneos de ritmo clásico de los JDE; con regiones, sin la final.
function cuenta(anio, f) {
  const o = f || {};
  return TORNEOS.filter((t) => JDE.includes(t.etapa) && t.ritmo === "Clásico" && Number(t.anio) === anio
    && (!o.regiones || (o.regiones.includes(t.region) && t.etapa !== "Nacional")) && (!o.categoria || t.categoria === o.categoria)
    && (!o.etapa || t.etapa === o.etapa) && (!o.modalidad || t.modalidad === o.modalidad) && (!o.rama || RAMA[t.clave] === o.rama))
    .reduce((s, t) => s + Number(t.jugadores), 0);
}
const participaciones = (anio, region, categoria) => cuenta(anio, { regiones: region ? [region] : null, categoria });
// El separador de miles de es-CR es un espacio que no corta: se compara como espacio común.
const limpio = (s) => (s || "").replace(/[\s\u202f]+/g, " ").trim();
const num = (n) => limpio(new Intl.NumberFormat("es-CR").format(n));
cierto("el CSV no trae el torneo de Ecuador (17778)", !TORNEOS.some((t) => t.clave === "17778"));
cierto("todo torneo de los JDE tiene categoría", TORNEOS.filter((t) => JDE.includes(t.etapa)).every((t) => /^([A-E]|Sin dato)$/.test(t.categoria)));

(async () => {
  const browser = await chromium.launch();

  async function abrir(consulta, opciones) {
    const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
    await ctx.route("**/*", (ruta) => (ruta.request().url().startsWith(BASE) ? ruta.continue() : ruta.fulfill({ status: 200, body: "", contentType: "text/plain" })));
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.goto(PAGINA + (consulta || ""), { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll("#ae-tabla-torneos tbody tr").length > 0, null, { timeout: 15000 });
    return { ctx, page, errores };
  }
  const textoDe = (page, sel) => page.$eval(sel, (n) => n.textContent).then(limpio);

  // ---- 2. Sin filtros ----
  console.log("Sin filtros");
  {
    const { ctx, page, errores } = await abrir();
    const p23 = participaciones(2023), p26 = participaciones(2026);
    cierto("la cifra de 2026 es la del CSV (" + num(p26) + ")", (await textoDe(page, "#ae-c1")) === num(p26), await textoDe(page, "#ae-c1"));
    const tesis = await textoDe(page, "#ae-tesis");
    cierto("la frase de arriba dice 2023 y 2026", tesis.includes(num(p23)) && tesis.includes(num(p26)), tesis);
    const tabla = await page.$$eval("#ae-tabla-etapas tbody tr", (trs) => Object.fromEntries(trs.map((tr) => { const c = [...tr.children].map((x) => x.textContent.replace(/[\s\u202f]+/g, " ").trim()); return [c[0], c[c.length - 2]]; })));
    const anios = [2011, 2015, 2019, 2023, 2024, 2025, 2026];
    const mal = anios.filter((y) => tabla[y] !== num(participaciones(y)));
    cierto("la tabla del gráfico da el total de cada año como el CSV", mal.length === 0, mal.map((y) => y + ": " + tabla[y] + " ≠ " + num(participaciones(y))).join("; "));
    cierto("2020 y 2021 no tienen torneos (la tabla no los trae)", !("2020" in tabla) && !("2021" in tabla));
    const barras = await page.$$eval("#ae-graf-etapas rect.ae-barra", (rs) => rs.filter((r) => r.checkVisibility() && Number(r.getAttribute("height")) > 0).length);
    cierto("el gráfico por etapas tiene barras que se ven", barras > 20, "barras: " + barras);
    const leyenda = await page.$$eval("#ae-leyenda span", (ss) => ss.map((s) => s.textContent.trim()));
    cierto("la leyenda nombra las cuatro etapas (el color no va solo)", leyenda.join("|") === "Institucional o circuital|Regional|Interregional|Nacional", leyenda.join("|"));
    const int = await page.$$eval("#ae-tabla-int tbody tr", (trs) => trs.map((tr) => tr.textContent));
    cierto("la tabla internacional trae los CODICADER de 2009, 2019 y 2025", ["2009", "2019", "2025"].every((y) => int.some((t) => t.startsWith(y) && t.includes("CODICADER"))));
    cierto("la página dice el día de la consulta, en hora de Costa Rica", (await textoDe(page, "#ae-consulta")).includes("8 de octubre de 2026"));
    // La búsqueda filtra la tabla.
    await page.fill("#ae-buscar", "Sabalito");
    const filas = await page.$$eval("#ae-tabla-torneos tbody tr", (trs) => trs.map((tr) => tr.textContent));
    cierto("buscar «Sabalito» deja solo esos torneos", filas.length > 0 && filas.every((t) => /sabalito/i.test(t)), filas.length + " filas");
    // Teclado: cada año es un blanco que se alcanza con Tab y dice su valor.
    const etiqueta = limpio(await page.$eval("#ae-graf-etapas .ae-blanco:last-of-type", (b) => b.getAttribute("aria-label")));
    cierto("el último año dice su total al lector de pantalla", etiqueta.startsWith("2026") && etiqueta.includes("Total " + num(p26)), etiqueta);
    await page.focus("#ae-graf-etapas .ae-blanco:last-of-type");
    const tip = await page.$eval("#ae-graf-etapas .ae-tip", (t) => ({ ve: t.checkVisibility(), texto: t.textContent }));
    tip.texto = limpio(tip.texto);
    cierto("con el foco en 2026 la ventanita se ve y trae el total", tip.ve && tip.texto.includes(num(p26)), JSON.stringify(tip));
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));
    await ctx.close();
  }

  // ---- 3. Los filtros ----
  console.log("Los filtros");
  {
    const { ctx, page } = await abrir();
    const panelVisible = () => page.$eval("#ae-regiones-panel", (n) => n.checkVisibility());
    cierto("el panel de regiones empieza cerrado", !(await panelVisible()) && (await page.getAttribute("#ae-regiones-boton", "aria-expanded")) === "false");
    await page.click("#ae-regiones-boton");
    cierto("al abrirlo se ve y el botón lo dice (aria-expanded)", (await panelVisible()) && (await page.getAttribute("#ae-regiones-boton", "aria-expanded")) === "true");
    cierto("el foco pasa a la primera región", await page.evaluate(() => document.activeElement.type === "checkbox"));
    await page.check("#ae-regiones-lista input[value='Cartago']");
    await page.keyboard.press("Escape");
    cierto("Escape cierra el panel y devuelve el foco al botón", !(await panelVisible()) && (await page.evaluate(() => document.activeElement.id)) === "ae-regiones-boton");
    cierto("el botón dice la región elegida", (await textoDe(page, "#ae-regiones-boton")) === "Cartago");
    const c26 = participaciones(2026, "Cartago");
    cierto("con Cartago, la cifra de 2026 es la de Cartago en el CSV (" + num(c26) + ")", (await textoDe(page, "#ae-c1")) === num(c26), await textoDe(page, "#ae-c1"));
    cierto("el título del gráfico nombra la región", (await textoDe(page, "#ae-etapas-t")).includes("Cartago"));
    cierto("la región va en la dirección", new URL(page.url()).searchParams.get("region") === "Cartago", page.url());
    const regiones = await page.$$eval("#ae-tabla-torneos tbody tr", (trs) => [...new Set(trs.map((tr) => tr.children[5].textContent))]);
    cierto("la tabla de torneos queda solo con Cartago", regiones.length === 1 && regiones[0] === "Cartago", regiones.join(", "));
    cierto("la nota de la final nacional se ve", await page.$eval("#ae-nacional-nota", (n) => n.checkVisibility()));
    const leyenda = await page.$$eval("#ae-leyenda span", (ss) => ss.map((s) => s.textContent.trim()));
    cierto("con una región la leyenda ya no trae la etapa nacional", !leyenda.includes("Nacional"), leyenda.join("|"));

    // Dos regiones a la vez: la cifra es la suma y abajo sale cada una.
    await page.click("#ae-regiones-boton");
    await page.check("#ae-regiones-lista input[value='Heredia']");
    await page.click("#ae-regiones-listo");
    const dos = cuenta(2026, { regiones: ["Cartago", "Heredia"] });
    cierto("con Cartago y Heredia, la cifra es la suma del CSV (" + num(dos) + ")", (await textoDe(page, "#ae-c1")) === num(dos), await textoDe(page, "#ae-c1"));
    cierto("las dos van en la dirección", new URL(page.url()).searchParams.getAll("region").join("|") === "Cartago|Heredia", page.url());
    cierto("el botón dice «Cartago y Heredia»", (await textoDe(page, "#ae-regiones-boton")) === "Cartago y Heredia");
    const cajas = await page.$$eval("#ae-multi figcaption", (fs) => fs.map((f) => f.textContent));
    cierto("abajo sale cada región elegida y solo esas", cajas.slice().sort().join("|") === "Cartago|Heredia", cajas.join("|"));
    await page.click("#ae-regiones-boton");
    await page.uncheck("#ae-regiones-lista input[value='Heredia']");
    await page.click("#ae-regiones-listo");

    await page.selectOption("#ae-categoria", "D");
    const cd = participaciones(2026, "Cartago", "D");
    cierto("con Cartago y D, la cifra es la del CSV (" + num(cd) + ")", (await textoDe(page, "#ae-c1")) === num(cd), await textoDe(page, "#ae-c1"));
    const cats = await page.$$eval("#ae-tabla-torneos tbody tr", (trs) => [...new Set(trs.map((tr) => tr.children[2].textContent))]);
    cierto("la tabla queda solo con la categoría D", cats.length === 1 && cats[0] === "D", cats.join(", "));

    await page.click("#ae-quitar");
    cierto("«Quitar los filtros» vuelve a todo el país", (await textoDe(page, "#ae-c1")) === num(participaciones(2026)) && !new URL(page.url()).search);
    cierto("y el botón se esconde", !(await page.$eval("#ae-quitar", (b) => b.checkVisibility())));

    // La etapa, para todo.
    await page.selectOption("#ae-etapa", "regional");
    const reg = cuenta(2026, { etapa: "Regional" });
    cierto("con la etapa regional, la cifra es la del CSV (" + num(reg) + ")", (await textoDe(page, "#ae-c1")) === num(reg), await textoDe(page, "#ae-c1"));
    const leyEt = await page.$$eval("#ae-leyenda span", (ss) => ss.map((s) => s.textContent.trim()));
    cierto("y el gráfico queda solo con esa etapa", leyEt.join("|") === "Regional", leyEt.join("|"));
    const etapasTabla = await page.$$eval("#ae-tabla-torneos tbody tr", (trs) => [...new Set(trs.map((tr) => tr.children[1].textContent))]);
    cierto("y la tabla de torneos también", etapasTabla.join("|") === "Regional", etapasTabla.join("|"));
    await page.selectOption("#ae-etapa", "");
    // Modalidad y rama.
    await page.selectOption("#ae-modalidad", "Equipos");
    const eq = cuenta(2026, { modalidad: "Equipos" });
    cierto("por equipos, la cifra es la del CSV (" + num(eq) + ")", (await textoDe(page, "#ae-c1")) === num(eq), await textoDe(page, "#ae-c1"));
    await page.selectOption("#ae-modalidad", "");
    await page.selectOption("#ae-rama", "Femenina");
    const fem = cuenta(2026, { rama: "Femenina" });
    cierto("en la rama femenina, la cifra es la de los torneos femeninos (" + num(fem) + ")", (await textoDe(page, "#ae-c1")) === num(fem), await textoDe(page, "#ae-c1"));
    cierto("y avisa cuántos torneos no dicen su rama", await page.$eval("#ae-filtros-nota", (n) => n.checkVisibility() && /no dicen su rama/.test(n.textContent)));
    await page.selectOption("#ae-rama", "");
    // Los años.
    await page.selectOption("#ae-desde", "2024");
    await page.selectOption("#ae-hasta", "2025");
    const p25 = participaciones(2025), p24 = participaciones(2024);
    cierto("de 2024 a 2025, la cifra es la de 2025 en el CSV (" + num(p25) + ")", (await textoDe(page, "#ae-c1")) === num(p25) && (await textoDe(page, "#ae-c1-et")).includes("2025"), await textoDe(page, "#ae-c1-et"));
    cierto("y el crecimiento se mide contra 2024", (await textoDe(page, "#ae-c2-et")) === "Crecimiento desde 2024" && (await textoDe(page, "#ae-c2-nota")).includes(num(p24)));
    const aniosTabla = await page.$$eval("#ae-tabla-torneos tbody tr", (trs) => [...new Set(trs.map((tr) => tr.children[0].textContent))].sort());
    cierto("la tabla de torneos queda con 2024 y 2025", aniosTabla.join("|") === "2024|2025", aniosTabla.join("|"));
    const url = new URL(page.url()).searchParams;
    cierto("los años van en la dirección", url.get("desde") === "2024" && url.get("hasta") === "2025", page.url());
    await page.selectOption("#ae-hasta", "2019");
    cierto("si «hasta» queda antes de «desde», «desde» lo sigue", (await page.$eval("#ae-desde", (s) => s.value)) === "2019");
    await page.click("#ae-quitar");

    await page.selectOption("#ae-categoria", "D");
    const tesis = await textoDe(page, "#ae-tesis");
    cierto("con la categoría D avisa que la final está en 2026 y no en 2023", tesis.includes("Ojo al comparar") && tesis.includes("2026 y no en 2023"), tesis);
    cierto("con la categoría D la cifra es la del CSV", (await textoDe(page, "#ae-c1")) === num(participaciones(2026, null, "D")));
    await ctx.close();
  }

  // ---- 4. Un enlace con los filtros puestos ----
  console.log("Un enlace con filtros");
  {
    const { ctx, page } = await abrir("?region=Coto&categoria=B");
    cierto("abre con Coto y B elegidos", (await textoDe(page, "#ae-regiones-boton")) === "Coto" && (await page.$eval("#ae-categoria", (s) => s.value)) === "B");
    cierto("y la cifra es la de Coto, categoría B", (await textoDe(page, "#ae-c1")) === num(participaciones(2026, "Coto", "B")));
    await ctx.close();
    const todo = await abrir("?region=Coto&region=Cartago&etapa=regional&modalidad=Individual&rama=Femenina&desde=2023&hasta=2025");
    const esperado = cuenta(2025, { regiones: ["Coto", "Cartago"], etapa: "Regional", modalidad: "Individual", rama: "Femenina" });
    cierto("un enlace con todos los filtros abre esa vista (" + num(esperado) + ")", (await textoDe(todo.page, "#ae-c1")) === num(esperado)
      && (await todo.page.$eval("#ae-desde", (s) => s.value)) === "2023" && (await todo.page.$eval("#ae-rama", (s) => s.value)) === "Femenina", await textoDe(todo.page, "#ae-c1"));
    await todo.ctx.close();
    const otro = await abrir("?region=<b>x</b>&categoria=Z&etapa=x&rama=Mixta&desde=1990&hasta=abc");
    cierto("un filtro que no existe se ignora", (await textoDe(otro.page, "#ae-regiones-boton")) === "Todo el país" && (await textoDe(otro.page, "#ae-c1")) === num(participaciones(2026))
      && !(await otro.page.$eval("#ae-quitar", (b) => b.checkVisibility())));
    await otro.ctx.close();
  }

  // ---- 5. Celular y modo oscuro ----
  console.log("Celular y modo oscuro");
  {
    const { ctx, page } = await abrir("", { viewport: { width: 400, height: 800 } });
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    cierto("a 400 px no hay desplazamiento horizontal", ancho <= 400, "scrollWidth " + ancho);
    const svg = await page.$eval("#ae-graf-etapas svg", (s) => s.checkVisibility() && s.getBoundingClientRect().width <= 400);
    cierto("el gráfico se ve y cabe", svg);
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir("", { colorScheme: "dark" });
    const fondo = await page.$eval(".ae-tarjeta", (n) => getComputedStyle(n).backgroundColor);
    cierto("en modo oscuro la tarjeta no queda blanca", fondo !== "rgb(255, 255, 255)", fondo);
    await ctx.close();
  }

  // ---- 6. Si los datos no llegan ----
  console.log("Sin datos");
  {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/data/ajedrez-estudiantil.json*", (r) => r.fulfill({ status: 500, body: "" }));
    const page = await ctx.newPage();
    await page.goto(PAGINA, { waitUntil: "load" });
    await page.waitForTimeout(800);
    cierto("si el JSON falla, la página lo dice", (await textoDe(page, "#ae-tesis")).startsWith("No se pudieron cargar los datos"));
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
