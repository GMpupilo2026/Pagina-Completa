/* historial-jugador.html y estadisticas-colegios.html: el historial de un
   jugador en los juegos estudiantiles y las estadísticas por colegio y región.

   Con datos inventados (los dos JSON se cambian por unos de prueba, así las
   cuentas no dependen de lo que traiga chess-results ese día), comprueba:
   - el historial: buscar (con y sin tildes, al menos tres letras), la ficha
     con sus cifras (torneos, etapa más alta, mejor puesto), la tabla del más
     nuevo al más viejo con el puesto «de cuántos», el camino por etapas con
     su texto para el lector de pantalla, el enlace ?j=… que abre a la persona;
   - que un nombre con HTML se pinte como texto, sin ejecutar nada;
   - las estadísticas: las cuentas de cada institución contadas a mano
     (estudiantes distintos, participaciones, podios regionales y nacionales,
     individuales y por equipos, finalistas), que el blitz no cuente, los
     filtros de región, categoría y año y que vayan en la dirección, el
     detalle de una institución (aria-expanded, sus años, sus podios con el
     enlace al historial), la tabla de regiones y ordenar por una columna;
   - que a 400 px no haya desplazamiento horizontal, el modo oscuro y que, si
     los datos no llegan, cada página lo diga.

   Ver «Historial del jugador y estadísticas por colegio» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-jde-jugadores.js                          */
"use strict";
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}
const limpio = (s) => (s || "").replace(/[\s ]+/g, " ").trim();

// ---- Los datos de prueba ----
const T = (clave, anio, etapa, categoria, nombre, inicio, region, jugadores, modalidad, ritmo) =>
  [clave, anio, etapa, categoria, nombre, inicio, "San José", region, jugadores, 5, modalidad, ritmo];
const TORNEOS = {
  actualizado: "2026-10-08",
  columnas: ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar", "region", "jugadores", "rondas", "modalidad", "ritmo"],
  torneos: [
    T(101, 2024, "Regional", "C", "JDE Regional Cartago C 2024", "2024-05-10", "Cartago", 3, "Individual", "Clásico"),
    T(106, 2024, "Regional", "C", "JDE Regional Heredia C 2024", "2024-05-12", "Heredia", 2, "Individual", "Clásico"),
    T(102, 2025, "Regional", "D", "JDE Regional Cartago D 2025", "2025-05-10", "Cartago", 3, "Individual", "Clásico"),
    T(104, 2025, "Regional", "D", "JDE Regional Cartago D Equipos 2025", "2025-05-11", "Cartago", 3, "Equipos", "Clásico"),
    T(105, 2025, "Regional", "D", "JDE Regional Cartago D Blitz 2025", "2025-05-12", "Cartago", 2, "Individual", "Blitz o rápido"),
    T(103, 2025, "Nacional", "D", "Etapa Nacional JDE D 2025", "2025-09-20", "", 2, "Individual", "Clásico"),
  ],
};
const MALO = "<img src=x id=inyectado onerror=\"window.__inyectado=1\">";
const JUGADORES = {
  actualizado: "2026-10-08",
  jugadores: [["Solano Mora, Ana Lucía", "solano mora ana lucia"], ["Quesada Rojas, Pablo", "quesada rojas pablo"],
    ["Vargas Núñez, Sofía", "vargas nunez sofia"], ["Brenes Soto, Laura", "brenes soto laura"], [MALO, "img src x id inyectado"]],
  instituciones: [["Liceo de Muestra", "liceo de muestra"], ["C.T.P. Ejemplo", "ctp ejemplo"], ["Escuela Heredia", "esc heredia"]],
  columnas_participaciones: ["clave", "jugador", "institucion", "puesto", "puntos", "elo"],
  participaciones: [
    [101, 0, 0, 1, 4, null], [101, 1, 1, 2, 3, null], [101, 2, 0, 3, 2, null],
    [106, 3, 2, 1, 3, null], [106, 4, 2, 2, 1, null],
    [102, 0, 0, 2, 3.5, 1500], [102, 1, 1, 1, 4, null], [102, 2, 0, 3, 1, null],
    [104, 0, 0, 1, null, null], [104, 2, 0, 1, null, null], [104, 1, 1, 2, null, null],
    [105, 0, 0, 1, 5, null], [105, 2, 0, 2, 4, null],
    [103, 0, 0, 1, 4.5, 1520], [103, 1, 1, 2, 3, null],
  ],
  columnas_equipos: ["clave", "institucion", "puesto", "puntos"],
  equipos: [[104, 0, 1, 4], [104, 1, 2, 2]],
};

(async () => {
  const browser = await chromium.launch();

  async function abrir(pagina, consulta, opciones, espera) {
    const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
    await ctx.route("**/*", (ruta) => {
      const url = ruta.request().url();
      if (url.includes("/data/ajedrez-estudiantil.json")) return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TORNEOS) });
      if (url.includes("/data/ajedrez-estudiantil-jugadores.json")) return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(JUGADORES) });
      return url.startsWith(BASE) ? ruta.continue() : ruta.fulfill({ status: 200, body: "", contentType: "text/plain" });
    });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("dialog", (d) => { errores.push("diálogo: " + d.message()); d.dismiss(); });
    await page.goto(BASE + "/" + pagina + (consulta || ""), { waitUntil: "load" });
    if (espera !== false) await page.waitForFunction((sel) => document.querySelector(sel), espera || "#hj-buscar:not([disabled]), #ec-tabla tbody tr", { timeout: 15000 });
    return { ctx, page, errores };
  }
  const textoDe = (page, sel) => page.$eval(sel, (n) => n.textContent).then(limpio);
  const seVe = (page, sel) => page.$eval(sel, (n) => n.checkVisibility());

  // ---- 1. El historial ----
  console.log("Historial de un jugador");
  {
    const { ctx, page, errores } = await abrir("historial-jugador.html");
    cierto("dice entre cuántos nombres busca", (await textoDe(page, "#hj-estado")).includes("5 nombres de 6 torneos"), await textoDe(page, "#hj-estado"));
    cierto("la ficha no se ve antes de elegir", !(await seVe(page, "#hj-ficha")));
    await page.fill("#hj-buscar", "so");
    await page.waitForTimeout(300);
    cierto("con menos de tres letras pide más", (await textoDe(page, "#hj-cuenta")).includes("al menos tres letras"));
    await page.fill("#hj-buscar", "vargas nuñez");
    await page.waitForTimeout(300);
    let nombres = await page.$$eval("#hj-resultados .hj-resultado-n", (ns) => ns.map((n) => n.textContent));
    cierto("busca sin importar las tildes", nombres.length === 1 && nombres[0] === "Vargas Núñez, Sofía", nombres.join(", "));
    await page.fill("#hj-buscar", "SOLANO");
    await page.waitForTimeout(300);
    nombres = await page.$$eval("#hj-resultados .hj-resultado-n", (ns) => ns.map((n) => n.textContent));
    cierto("busca sin importar las mayúsculas", nombres.join("|") === "Solano Mora, Ana Lucía", nombres.join(", "));
    const det = await textoDe(page, "#hj-resultados .hj-resultado-d");
    cierto("el resultado dice sus años, sus torneos y su colegio", det === "2024–2025 · 5 torneos · Liceo de Muestra", det);
    await page.click("#hj-resultados .hj-resultado");
    cierto("al elegirla se ve la ficha", await seVe(page, "#hj-ficha"));
    cierto("el foco va al nombre", await page.evaluate(() => document.activeElement && document.activeElement.id === "hj-nombre"));
    cierto("la dirección guarda a la persona", new URL(page.url()).searchParams.get("j") === "solano mora ana lucia", page.url());
    const cifras = await page.$$eval("#hj-cifras .ae-cifra", (cs) => cs.map((c) => c.textContent.replace(/\s+/g, " ").trim()));
    cierto("cuenta sus 5 torneos, todos de los JDE", cifras[0] && cifras[0].includes("5") && cifras[0].includes("todos de los JDE"), cifras[0]);
    cierto("la etapa más alta es la nacional, por primera vez en 2025", cifras[2] && cifras[2].includes("Nacional") && cifras[2].includes("2025"), cifras[2]);
    cierto("el mejor puesto es el 1.º de la final (no el 1.º regional)", cifras[3] && cifras[3].includes("1.º") && cifras[3].includes("Nacional, categoría D, 2025"), cifras[3]);
    cierto("dice su institución", (await textoDe(page, "#hj-instituciones")) === "Institución: Liceo de Muestra");
    cierto("dice el último Elo publicado", (await textoDe(page, "#hj-elo")).includes("1520 (2025)"), await textoDe(page, "#hj-elo"));
    const filas = await page.$$eval("#hj-tabla tbody tr", (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, " ").trim())));
    cierto("la tabla trae sus 5 torneos, del más nuevo al más viejo", filas.length === 5 && filas[0][3].startsWith("Etapa Nacional") && filas[4][3].startsWith("JDE Regional Cartago C 2024"), filas.map((f) => f[3]).join(" | "));
    cierto("el puesto dice «de cuántos»", filas[0][5] === "1.º de 2" && filas[4][5] === "1.º de 3", filas[0][5] + " / " + filas[4][5]);
    const equipo = filas.find((f) => f[3].includes("Equipos"));
    cierto("en el de equipos, el puesto es el del equipo, entre los equipos", equipo && equipo[5] === "1.º de 2 (equipo)", equipo && equipo[5]);
    cierto("los puntos van con medio punto y «de» las rondas (una raya si no hay)", filas[3][6] === "3,5 de 5" && filas[2][6] === "—", filas.map((f) => f[6]).join(" | "));
    cierto("cada torneo enlaza a chess-results", await page.$eval("#hj-tabla tbody tr a", (a) => a.href.startsWith("https://chess-results.com/tnr103.aspx")));
    const etapa = await page.$eval("#hj-tabla tbody tr td:nth-child(2)", (td) => td.textContent.trim());
    cierto("la etapa va escrita junto a su color", etapa === "Nacional", etapa);
    const camino = await page.$eval("#hj-camino", (c) => ({ ve: !!c.querySelector("svg") && c.querySelector("svg").checkVisibility(), puntos: c.querySelectorAll("circle").length, texto: c.getAttribute("aria-label") }));
    cierto("el camino por etapas se ve, con un punto por torneo de los JDE", camino.ve && camino.puntos === 5, JSON.stringify(camino));
    cierto("y dice en texto la etapa más alta de cada año", (camino.texto || "").includes("2024: regional; 2025: nacional"), camino.texto);
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));
    await ctx.close();
  }
  {
    const { ctx, page, errores } = await abrir("historial-jugador.html", "?j=Quesada%20Rojas,%20Pablo", null, "#hj-nombre:not(:empty)");
    cierto("un enlace con ?j= abre a esa persona (aunque venga escrita distinto)", (await textoDe(page, "#hj-nombre")) === "Quesada Rojas, Pablo");
    await page.fill("#hj-buscar", "img");
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ img: !!document.querySelector("#inyectado"), flag: !!window.__inyectado, texto: document.querySelector("#hj-resultados .hj-resultado-n") && document.querySelector("#hj-resultados .hj-resultado-n").textContent }));
    cierto("un nombre con HTML se pinta como texto y no ejecuta nada", !r.img && !r.flag && r.texto && r.texto.startsWith("<img"), JSON.stringify(r));
    cierto("sin errores ni diálogos", errores.length === 0, errores.join("; "));
    await ctx.close();
  }

  // ---- 2. Las estadísticas por colegio ----
  console.log("Estadísticas por colegio y región");
  const filaDe = (page, nombre) => page.$$eval("#ec-tabla tbody tr", (trs, n) => {
    const tr = trs.find((t) => t.children[0].textContent.trim() === n);
    return tr ? [...tr.children].map((td) => td.textContent.replace(/\s+/g, " ").trim()) : null;
  }, nombre);
  {
    const { ctx, page, errores } = await abrir("estadisticas-colegios.html");
    cierto("la frase cuenta 3 instituciones y 5 estudiantes", (await textoDe(page, "#ec-tesis")).startsWith("3 instituciones llevaron a 5 estudiantes"), await textoDe(page, "#ec-tesis"));
    const liceo = await filaDe(page, "Liceo de Muestra");
    // Clásico de los JDE: 101 (Ana 1.º, Sofía 3.º), 102 (Ana 2.º, Sofía 3.º),
    // 104 por equipos (1.º), 103 la final (Ana 1.º). El blitz 105 no cuenta.
    cierto("Liceo de Muestra: región, 2 estudiantes, 7 participaciones (sin el blitz)", liceo && liceo[1] === "Cartago" && liceo[2] === "2" && liceo[3] === "7", JSON.stringify(liceo));
    cierto("Liceo de Muestra: 5 podios regionales (4 individuales y 1 por equipos), 1 nacional, 1 en la final", liceo && liceo[4] === "5" && liceo[5] === "1" && liceo[6] === "1", JSON.stringify(liceo));
    cierto("Liceo de Muestra: sus años", liceo && liceo[7] === "2024, 2025", JSON.stringify(liceo));
    const ctp = await filaDe(page, "C.T.P. Ejemplo");
    cierto("C.T.P. Ejemplo: 1 estudiante, 4 participaciones, 3 podios regionales (uno por equipos), 1 nacional", ctp && ctp.slice(2, 7).join(",") === "1,4,3,1,1", JSON.stringify(ctp));
    const esc = await filaDe(page, "Escuela Heredia");
    cierto("Escuela Heredia queda en Heredia, sin podios nacionales", esc && esc[1] === "Heredia" && esc[5] === "0", JSON.stringify(esc));
    const orden = await page.$$eval("#ec-tabla tbody tr", (trs) => trs.map((t) => t.children[0].textContent.trim()));
    cierto("ordena por estudiantes, de más a menos", orden[2] === "C.T.P. Ejemplo", orden.join(" | "));
    cierto("la de más podios en la final desempata por estudiantes", (await textoDe(page, "#ec-c4")) === "Liceo de Muestra", await textoDe(page, "#ec-c4"));
    const barras = await page.$$eval("#ec-graf rect", (rs) => rs.filter((r) => r.checkVisibility()).length);
    cierto("el gráfico tiene una barra por institución", barras === 3, String(barras));
    cierto("el gráfico dice sus valores en texto", (await page.$eval("#ec-graf", (g) => g.getAttribute("aria-label"))).includes("Liceo de Muestra, 2"));
    const regiones = await page.$$eval("#ec-regiones tbody tr", (trs) => trs.map((t) => [...t.children].map((c) => c.textContent.trim()).join(",")));
    cierto("la tabla de regiones: Cartago 2 instituciones, 3 estudiantes, 2 en la final, 2 podios nacionales", regiones[0] === "Cartago,2,3,2,2" && regiones[1] === "Heredia,1,2,0,0", regiones.join(" | "));

    await page.click("#ec-tabla thead button[data-col='nacionales']");
    cierto("ordenar por podios nacionales lo marca en el encabezado", (await page.$eval("#ec-tabla thead button[data-col='nacionales']", (b) => b.parentElement.getAttribute("aria-sort"))) === "descending");

    await page.click("#ec-tabla tbody button.ec-abrir >> text=Liceo de Muestra");
    cierto("al abrir una institución se ve su detalle", await seVe(page, "#ec-detalle"));
    cierto("y su botón dice que está abierto", (await page.$eval("button.ec-abrir[data-clave='liceo de muestra']", (b) => b.getAttribute("aria-expanded"))) === "true");
    cierto("la dirección guarda la institución", new URL(page.url()).searchParams.get("i") === "liceo de muestra");
    const anios = await page.$$eval("#ec-anios tbody tr", (trs) => trs.map((t) => [...t.children].map((c) => c.textContent.trim()).join(",")));
    cierto("año por año: 2025 con 2 estudiantes, la final y 4 podios; 2024 con 2 y 2", anios.join(" | ") === "2025,2,Nacional,4 | 2024,2,Regional,2", anios.join(" | "));
    const podios = await page.$$eval("#ec-podios li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    cierto("sus podios empiezan por la final", podios[0] && podios[0].startsWith("1.º Nacional D 2025"), podios[0]);
    cierto("cada podio enlaza al historial del estudiante", await page.$eval("#ec-podios a[href^='historial-jugador.html?j=']", (a) => a.getAttribute("href") === "historial-jugador.html?j=solano%20mora%20ana%20lucia"));
    cierto("sin errores de la página", errores.length === 0, errores.join("; "));

    await page.selectOption("#ec-region", "Heredia");
    cierto("con Heredia queda una institución", (await page.$$("#ec-tabla tbody tr")).length === 1 && (await textoDe(page, "#ec-tesis")).includes("de la región Heredia"));
    cierto("la región va en la dirección", new URL(page.url()).searchParams.get("region") === "Heredia");
    await page.selectOption("#ec-region", "");
    await page.selectOption("#ec-categoria", "D");
    const liceoD = await filaDe(page, "Liceo de Muestra");
    cierto("con la categoría D, Liceo de Muestra cuenta solo 2025 (5 participaciones)", liceoD && liceoD[3] === "5" && liceoD[7] === "2025", JSON.stringify(liceoD));
    cierto("y Escuela Heredia (solo C) no sale", !(await filaDe(page, "Escuela Heredia")));
    await page.selectOption("#ec-categoria", "");
    await page.selectOption("#ec-anio", "2024");
    const ctp24 = await filaDe(page, "C.T.P. Ejemplo");
    cierto("con 2024, C.T.P. Ejemplo tiene 1 participación y ningún podio nacional", ctp24 && ctp24[3] === "1" && ctp24[5] === "0", JSON.stringify(ctp24));
    await page.click("#ec-quitar");
    cierto("«Quitar los filtros» vuelve a las 3 y se esconde", (await page.$$("#ec-tabla tbody tr")).length === 3 && !(await seVe(page, "#ec-quitar")));
    await page.fill("#ec-buscar", "ctp");
    cierto("buscar «ctp» encuentra «C.T.P. Ejemplo»", (await page.$$eval("#ec-tabla tbody tr", (t) => t.map((x) => x.children[0].textContent.trim()))).join("|") === "C.T.P. Ejemplo");
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir("estadisticas-colegios.html", "?region=Cartago&anio=2025&i=ctp%20ejemplo&categoria=Z", null, "#ec-detalle-t:not(:empty)");
    cierto("un enlace abre los filtros, la institución, e ignora lo que no existe",
      (await page.$eval("#ec-region", (s) => s.value)) === "Cartago" && (await page.$eval("#ec-anio", (s) => s.value)) === "2025"
      && (await page.$eval("#ec-categoria", (s) => s.value)) === "" && (await textoDe(page, "#ec-detalle-t")) === "C.T.P. Ejemplo");
    await ctx.close();
  }

  // ---- 3. Celular, modo oscuro y sin datos ----
  console.log("Celular, modo oscuro y sin datos");
  for (const pagina of ["historial-jugador.html", "estadisticas-colegios.html"]) {
    const consulta = pagina.startsWith("historial") ? "?j=solano%20mora%20ana%20lucia" : "?i=liceo%20de%20muestra";
    const { ctx, page } = await abrir(pagina, consulta, { viewport: { width: 400, height: 800 } }, pagina.startsWith("historial") ? "#hj-nombre:not(:empty)" : "#ec-detalle-t:not(:empty)");
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    cierto(pagina + ": a 400 px no hay desplazamiento horizontal", ancho <= 400, "scrollWidth " + ancho);
    const graf = await page.$eval(pagina.startsWith("historial") ? "#hj-camino svg" : "#ec-graf svg", (s) => s.checkVisibility() && s.getBoundingClientRect().width <= 400);
    cierto(pagina + ": el gráfico se ve y cabe", graf);
    await ctx.close();
    const oscuro = await abrir(pagina, consulta, { colorScheme: "dark" });
    const fondo = await oscuro.page.$eval(".ae-tarjeta", (n) => getComputedStyle(n).backgroundColor);
    cierto(pagina + ": en modo oscuro la tarjeta no queda blanca", fondo !== "rgb(255, 255, 255)", fondo);
    await oscuro.ctx.close();

    const c = await browser.newContext({ serviceWorkers: "block" });
    await c.route("**/data/ajedrez-estudiantil-jugadores.json*", (r) => r.fulfill({ status: 500, body: "" }));
    const p = await c.newPage();
    await p.goto(BASE + "/" + pagina, { waitUntil: "load" });
    await p.waitForTimeout(800);
    const aviso = await textoDe(p, pagina.startsWith("historial") ? "#hj-estado" : "#ec-tesis");
    cierto(pagina + ": si los datos no llegan, lo dice", aviso.startsWith("No se pudieron cargar los datos"), aviso);
    await c.close();
  }

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
