/* Pareo Integral: los premios especiales, compartir por WhatsApp, la
 * clasificación para la pared y el sorteo en el proyector
 * (js/pareo/premios.js, js/pareo/compartir.js, js/pareo/evento.js,
 * js/pareo/pagina.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - nadie se lleva dos premios: el podio (con sus empatados) primero y
 *     después cada premio en su orden; un premio sin candidatos dice por qué;
 *   - los premios especiales salen en la clasificación, en la premiación del
 *     evento y en los diplomas;
 *   - el mensaje de WhatsApp: la mesa de la sala (no su posición), los
 *     puntos de antes de la ronda, los libres, sin asteriscos sueltos en los
 *     nombres, y el enlace a wa.me con todo el texto;
 *   - la clasificación para la pared sale en UNA hoja A3 con la hora;
 *   - el sorteo en el proyector: se ve a pantalla completa, anota los
 *     números o el color, el acta lo trae y Escape devuelve el foco;
 *   - la ronda atrasada nombra las mesas de la sala.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-premios.js
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const PR = require(path.join(RAIZ, "js/pareo/premios.js"));
const CO = require(path.join(RAIZ, "js/pareo/compartir.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

// Ocho jugadores, una ronda jugada: ganan los de las blancas.
function torneo() {
  const datos = [
    ["a", "PRUEBA ANA", 1900, "w", "Sub-12"], ["b", "PRUEBA BETO", 1700, "m", "Sub-12"],
    ["c", "PRUEBA CAROL", 1650, "w", "Sub-10"], ["d", "PRUEBA DIEGO", 1500, "m", "Sub-10"],
    ["e", "PRUEBA *EVA*", 1450, "w", "Sub-10"], ["f", "PRUEBA FER", 0, "m", "Sub-12"],
    ["g", "PRUEBA GABY", 0, "w", "Sub-10"], ["h", "PRUEBA HUGO", 1200, "m", "Sub-12"],
  ];
  const t = T.nuevo({ nombre: "PRUEBA ABIERTO", rondasTotales: 3, mesaInicial: 11,
    jugadores: datos.map(([id, nombre, elo, sexo, categoria]) => ({ id, nombre, elo, sexo, categoria, institucion: "LICEO " + id.toUpperCase() })) });
  t.rondas = [{ mesas: [{ b: "a", n: "e", r: "1-0" }, { b: "c", n: "b", r: "1-0" }, { b: "d", n: "h", r: "=" }, { b: "f", n: "g", r: "1-0" }], ausencias: {} }];
  return t;
}

function pruebaSinNavegador() {
  console.log("\n=== Nadie se lleva dos premios ===");
  const t = torneo();
  const filas = V.aplicarDesempate(t, E.clasificacion(t, t.desempates));
  const de = (id) => t.jugadores.find((j) => j.id === id);
  t.premiosEspeciales = [{ tipo: "mujer" }, { tipo: "elo", desde: 1400, hasta: 1800, cuantos: 2 }, { tipo: "sinElo" }, { tipo: "categoria", valor: "sub-12" }];
  const r = PR.asignar(t, filas, de);
  const podio = r.generales.map((g) => g.id);
  ok(podio.length >= 3, "el podio son los puestos 1 a 3", JSON.stringify(r.generales));
  const todos = podio.concat(...r.especiales.map((x) => x.ganadores.map((g) => g.id)));
  igual("nadie aparece dos veces", todos.length, new Set(todos).size);
  const mujer = r.especiales[0].ganadores.map((g) => g.id);
  ok(mujer.length === 1 && de(mujer[0]).sexo === "w" && !podio.includes(mujer[0]), "la mejor mujer es una que no está en el podio", JSON.stringify(mujer));
  ok(r.especiales[1].ganadores.every((g) => de(g.id).elo >= 1400 && de(g.id).elo <= 1800), "la franja de Elo respeta desde y hasta");
  ok(r.especiales[3].ganadores.every((g) => de(g.id).categoria === "Sub-12"), "la categoría se compara sin importar mayúsculas");
  // Dos premios que puede ganar la misma persona: el segundo es para otra.
  const dos = PR.asignar(Object.assign({}, t, { premiosEspeciales: [{ tipo: "mujer" }, { tipo: "mujer" }] }), filas, de).especiales.map((x) => x.ganadores.map((g) => g.id));
  ok(dos[0].length === 1 && dos[1].length === 1 && dos[0][0] !== dos[1][0], "el mismo premio dos veces va a dos personas distintas", JSON.stringify(dos));
  const sinCandidatos = PR.asignar(Object.assign({}, t, { premiosEspeciales: [{ tipo: "elo", desde: 2500 }] }), filas, de).especiales[0];
  igual("un premio que nadie cumple queda vacío y lo dice", [sinCandidatos.ganadores.length, sinCandidatos.candidatos], [0, 0]);
  igual("una franja al revés no se acepta", PR.normalizar({ tipo: "elo", desde: 1800, hasta: 1400 }), null);
  igual("las etiquetas", [PR.etiqueta({ tipo: "elo", desde: 1400, hasta: 1800 }, "es"), PR.etiqueta({ tipo: "elo", desde: 1600 }, "es"), PR.etiqueta({ tipo: "sinElo" }, "en")],
    ["Elo de 1400 a 1800", "Elo de 1600 o más", "Best unrated"]);

  console.log("\n=== En la premiación y los diplomas del evento ===");
  t.rondasTotales = 1;
  // (En una tabla: premio, lugar, nombre, centro y puntos.)
  const prem = V.premiacion({ nombre: "PRUEBA EVENTO" }, [t]).bloques.filter((b) => b.tipo === "tabla" && b.encabezados[0] === "Premio especial").flatMap((b) => b.filas);
  ok(prem.some((x) => x[0] === "Mejor mujer" && /^PRUEBA /.test(x[2])), "la premiación trae los premios especiales", JSON.stringify(prem));
  const dip = V.diplomas({ nombre: "PRUEBA EVENTO" }, [t]).map((d) => V.textoDiploma(d).motivo);
  ok(dip.some((x) => /^por obtener el premio especial «Mejor mujer» en PRUEBA ABIERTO\.$/.test(x)), "y su diploma dice el premio", dip.join(" | "));

  console.log("\n=== El mensaje de WhatsApp ===");
  const u = torneo();
  u.rondas.push({ mesas: [{ b: "e", n: "a", r: null }, { b: "b", n: "c", r: "=" }, { b: "h", n: "d", r: null }, { b: "g", n: null, r: null }], ausencias: {} });
  const msg = CO.textoRonda(u, 1, {});
  ok(/^♟️ \*PRUEBA ABIERTO\*\n\*Ronda 2\* · 3 mesas\n/.test(msg), "el torneo y la ronda en negrita, con cuántas mesas", msg.split("\n").slice(0, 2).join(" | "));
  ok(/\n\*Mesa 11\*\n⚪ Prueba Eva \(0\)\n⚫ Prueba Ana \(1\)\n/.test(msg), "una mesa por bloque: la de la sala (11, no 1), cada uno en su línea con su color y sus puntos de antes", msg);
  ok(/\n\*Mesa 12\* · \*½-½\*\n⚪ Prueba Beto \(0\)\n⚫ Prueba Carol \(1\)/.test(msg), "el resultado junto a la mesa, si ya está", msg);
  ok(/\n\*Libre:\* Prueba Gaby \(0\)\n/.test(msg), "el libre al final", msg);
  ok(!/\*EVA\*/.test(msg) && !/\*Eva\*/.test(msg), "un asterisco en un nombre no abre una negrita");
  igual("los nombres en mayúsculas se leen con mayúscula inicial; las siglas y lo escrito a mano quedan", ["CENTRO EDUCATIVO DE LA CRUZ", "CTP DE PURISCAL", "IPEC SANTA BÁRBARA", "LICEO SAN JOSÉ II", "Pérez Solís, Ana", "UNED"].map(CO.legible),
    ["Centro Educativo de la Cruz", "CTP de Puriscal", "IPEC Santa Bárbara", "Liceo San José II", "Pérez Solís, Ana", "UNED"]);
  const clas = CO.textoClasificacion(u, { enlace: "https://ajedrez-integral.com/pareo.html#vivo=ABC" });
  ok(/Clasificación tras la ronda 1\*/.test(clas) && /\(provisional: faltan resultados\)/.test(clas), "la clasificación dice la ronda y que es provisional", clas);
  ok(/\n🔴 En vivo: https:\/\/ajedrez-integral\.com\/pareo\.html#vivo=ABC\n/.test(clas), "y lleva el enlace en vivo", clas);
  const enlace = CO.enlaceWhatsapp(msg);
  ok(enlace.startsWith("https://wa.me/?text=") && decodeURIComponent(enlace.slice(20)) === msg, "el enlace a wa.me lleva todo el texto");

  console.log("\n=== El sorteo queda en el acta ===");
  const s = torneo();
  s.rondas = [];
  T.sortearNumeracion(s);
  s.sorteo = { tipo: "numeros", hora: Date.parse("2026-10-22T08:05:00-06:00"), orden: s.numeracion.slice() };
  const acta = V.acta({ nombre: "PRUEBA" }, [s]).bloques.filter((b) => b.items).flatMap((b) => b.items);
  ok(acta.some((x) => /^PRUEBA ABIERTO, a las 8:05\sa\.\sm\.: 1\. PRUEBA /.test(x)), "los números sorteados, con la hora de Costa Rica", acta.join(" | "));
  s.sorteo = { tipo: "color", hora: Date.parse("2026-10-22T08:06:00-06:00"), color: "b" };
  const acta2 = V.acta({ nombre: "PRUEBA" }, [s]).bloques.filter((b) => b.items).flatMap((b) => b.items);
  const uno = s.jugadores.find((j) => j.id === T.ordenInicial(s)[0]).nombre;
  ok(acta2.some((x) => x.endsWith("el n.º 1 (" + uno + ") empieza con negras en la ronda 1.")), "y el color sorteado", acta2.join(" | "));
}

const sembrar = (t) => (page) => page.addInitScript((x) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1 }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
}, t);

async function pruebaClasificacion(browser) {
  const t = torneo();
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  console.log("\n=== Los premios especiales en la pantalla ===");
  await page.click('[data-ficha="clasificacion"]');
  ok(await P.vis(page, "#pi-premio-tipo"), "la clasificación trae dónde agregar premios");
  await page.selectOption("#pi-premio-tipo", "mujer");
  ok(!(await P.vis(page, "#pi-premio-desde")), "«Mejor mujer» no pide Elo");
  await page.click("#pi-premio-agregar");
  await page.waitForSelector("#pi-premios-lista li");
  const li = await page.textContent("#pi-premios-lista li");
  ok(/Mejor mujer/.test(li) && /PRUEBA \*?(CAROL|GABY|ANA|EVA)/.test(li), "el premio dice quién lo gana", li);
  await page.selectOption("#pi-premio-tipo", "elo");
  await page.click("#pi-premio-agregar");
  ok(await page.$eval("#pi-premios-lista", (u) => u.children.length) === 1, "una franja sin Elo no se agrega");
  await page.fill("#pi-premio-desde", "1400");
  await page.fill("#pi-premio-hasta", "1800");
  await page.selectOption("#pi-premio-cuantos", "2");
  await page.click("#pi-premio-agregar");
  await page.waitForFunction(() => document.querySelectorAll("#pi-premios-lista li").length === 2);
  const guardado = await P.esperarGuardado(page, (l) => (l[0].premiosEspeciales || []).length === 2);
  igual("quedan guardados en el torneo", guardado[0].premiosEspeciales, [{ tipo: "mujer", cuantos: 1 }, { tipo: "elo", desde: 1400, hasta: 1800, cuantos: 2 }]);
  await page.click('#pi-premios-lista li[data-premio="0"] button');
  await page.waitForFunction(() => document.querySelectorAll("#pi-premios-lista li").length === 1);
  ok(/Elo de 1400 a 1800/.test(await page.textContent("#pi-premios-lista")), "«Quitar» saca solo ese premio");

  console.log("\n=== Compartir por WhatsApp ===");
  await page.click("#pi-clas-whatsapp");
  ok(await P.vis(page, "#pi-clas-compartir-texto"), "aparece el mensaje para revisar");
  igual("el botón dice que está abierto", await page.getAttribute("#pi-clas-whatsapp", "aria-expanded"), "true");
  const texto = await page.inputValue("#pi-clas-compartir-texto");
  ok(/^🏆 \*PRUEBA ABIERTO\*\n\*Clasificación tras la ronda 1\*/.test(texto), "es la clasificación", texto.slice(0, 80));
  const href = await page.getAttribute("#pi-clas-compartir [data-whatsapp]", "href");
  ok(href === "https://wa.me/?text=" + encodeURIComponent(texto), "«Abrir WhatsApp» lleva ese texto");
  await page.click("#pi-clas-whatsapp");
  ok(!(await P.vis(page, "#pi-clas-compartir-texto")), "tocarlo otra vez lo cierra");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-rondas-nav button >> nth=0");
  await page.click("#pi-ronda-whatsapp");
  ok(/\*Mesa 11\* · \*1-0\*\n⚪ Prueba Ana\n⚫ Prueba Eva/.test(await page.inputValue("#pi-ronda-compartir-texto")), "y desde la ronda, el pareo con la mesa de la sala");

  console.log("\n=== La clasificación para la pared ===");
  await page.click('[data-ficha="clasificacion"]');
  await page.click("#pi-clas-pared");
  ok(await page.evaluate(() => document.body.classList.contains("pi-imprimiendo-pared")), "se imprime con su clase");
  igual("trae a los ocho", await page.$$eval(".pi-pared-tabla tbody tr", (l) => l.length), 8);
  ok(/^Impresa a las \d{1,2}:\d{2}/.test(await page.textContent(".pi-pared-hora")), "con la hora en que se imprimió");
  await page.emulateMedia({ media: "print" });
  ok(await P.vis(page, ".pi-pared-tabla"), "al imprimir se ve la hoja");
  ok(!(await P.vis(page, "#pi-tabla-clas")), "y no la ficha de la pantalla");
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const caja = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString("latin1"));
  ok(caja && Math.abs(Number(caja[1]) - 841.89) < 2 && Math.abs(Number(caja[2]) - 1190.55) < 2, "la hoja es A3", caja && caja[0]);
  igual("y es una sola", (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length, 1);
  await page.emulateMedia({ media: "screen" });
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaSorteo(browser) {
  console.log("\n=== El sorteo de los números en el proyector ===");
  const t = torneo();
  t.rondas = [];
  t.sistema = "todos";
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-sortear-proyector");
  ok(await P.vis(page, "#pi-sorteo"), "se abre a pantalla completa");
  igual("el foco está en «Sortear»", await page.evaluate(() => document.activeElement.id), "pi-sorteo-sortear");
  await page.click("#pi-sorteo-sortear");
  await page.waitForFunction(() => /Sorteo terminado/.test(document.getElementById("pi-sorteo-estado").textContent));
  const visto = await page.$$eval("#pi-sorteo .pi-sorteo-lista li", (l) => l.map((x) => x.textContent));
  igual("anuncia a los ocho con su número escrito", visto.map((x) => x.match(/^\d+/)[0]), ["1", "2", "3", "4", "5", "6", "7", "8"]);
  const [g] = await P.esperarGuardado(page, (l) => l[0].sorteo && l[0].sorteo.tipo === "numeros");
  igual("y lo que se ve es lo que queda guardado", visto.map((x) => x.replace(/^\d+/, "")), g.numeracion.map((id) => g.jugadores.find((j) => j.id === id).nombre));
  await page.keyboard.press("Escape");
  ok(!(await P.vis(page, "#pi-sorteo")), "Escape lo cierra");
  igual("y el foco vuelve al botón", await page.evaluate(() => document.activeElement.id), "pi-sortear-proyector");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El sorteo del color ===");
  const s = torneo();
  s.rondas = [];
  const b = await P.abrirPagina(browser, BASE, "", sembrar(s));
  await b.page.emulateMedia({ reducedMotion: "reduce" });
  await b.page.click('[data-ficha="rondas"]');
  await b.page.click("#pi-sortear-color");
  await b.page.click("#pi-sorteo-sortear");
  await b.page.waitForSelector(".pi-sorteo-resultado");
  const dice = await b.page.textContent(".pi-sorteo-resultado");
  const [h] = await P.esperarGuardado(b.page, (l) => l[0].sorteo && l[0].sorteo.tipo === "color");
  ok(new RegExp("empieza con " + (h.colorInicial === "b" ? "negras" : "blancas")).test(dice), "dice el color que quedó anotado", dice + " / " + h.colorInicial);
  await b.page.click("#pi-sorteo-cerrar");
  ok(/empieza con/.test(await b.page.textContent("#pi-ronda")), "la ronda 1 dice con qué color empieza el n.º 1");
  ok(!b.errores.length, "sin errores en la página", b.errores.join(" | "));
  await b.ctx.close();
}

async function pruebaAtrasada(browser) {
  console.log("\n=== La ronda atrasada nombra las mesas de la sala ===");
  const t = torneo();
  t.ritmo = "10 min + 2 s";
  t.rondas[0].mesas[1].r = null;
  t.rondas[0].inicio = Date.now() - 90 * 60000;
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="rondas"]');
  const txt = await page.textContent("#pi-reloj-atrasada");
  ok(/siguen jugando las mesas 12\./.test(txt), "la mesa 12 (la segunda, empezando en la 11)", txt);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaClasificacion(browser);
    await pruebaSorteo(browser);
    await pruebaAtrasada(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
