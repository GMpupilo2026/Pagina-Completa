/* Pareo Integral, el Centro del evento (pintarCentro en js/pareo/pagina.js):
 *
 *   - sin rondas, dice que se llena al emparejar la ronda 1;
 *   - la ronda en juego con cuántas mesas van terminadas (escrito, no solo la
 *     barra);
 *   - «Para confirmar»: lo que leyó la cámara (se anota desde aquí, con la
 *     misma regla que en la ficha Rondas) y la segunda ilegal sin resultado;
 *   - los árbitros adjuntos con sus mesas, su código (deletreado para el
 *     lector de pantalla), cuánto anotaron y la última vez que la base supo de
 *     ellos (lo que devuelve la cola de pareo-publicar);
 *   - las cámaras de Notara mesa por mesa: transmite, terminó y sin señal,
 *     con el latido que llega por el canal de las cámaras;
 *   - los códigos en papel, sin el enlace;
 *   - al adjunto le manda el código de las cámaras y el torneo publicado (para
 *     que vea sus mesas en vivo: js/pareo/camaras-adjunto.js);
 *   - se pone al día sola cuando llega un resultado de la cola, sin ids
 *     repetidos con la ficha Rondas, y a 390 px no se desplaza a lo ancho.
 *
 * Ver «Pareo Integral: el Centro del evento» en docs/decisiones/juegos-y-torneos.md.
 *
 *       node herramientas/verificar-todo.js pareo-centro
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const ok = (c, m, detalle) => { console.log("  " + (c ? "✓" : "✗") + " " + m + (c || !detalle ? "" : "\n      " + String(detalle).slice(0, 400))); if (!c) fallos += 1; };
const igual = (m, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); ok(ja === jb, m, "esperaba " + jb + ", salió " + ja); };

const PUB = "11111111-2222-3333-4444-555555555555";
function torneo(conRondas) {
  const t = T.nuevo({ nombre: "PRUEBA CENTRO", arbitro: "PRUEBA PRINCIPAL", rondasTotales: 5,
    jugadores: ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), elo: 1800 - 50 * k, retiradoDespuesDe: null })) });
  T.fijarNumeracion(t);
  if (!conRondas) return t;
  t.publicado = { id: PUB, clave: "PRUEBA-CLAVE", hora: Date.now() };
  t.rondas = [{ ausencias: {},
    mesas: [{ b: "a", n: "e", r: "1-0", adjunto: "prueba23" }, { b: "f", n: "b", r: null }, { b: "c", n: "g", r: null }, { b: "h", n: "d", r: null }],
    deCamaras: [{ hora: Date.now(), mesa: 2, r: "0-1" }],
    incidencias: [{ hora: 1, tipo: "sancion", autor: "X", texto: "Ilegal", articulo: "ilegal", mesa: 3, jugador: "g" },
      { hora: 2, tipo: "sancion", autor: "X", texto: "Ilegal", articulo: "ilegal", mesa: 3, jugador: "g" }] }];
  t.adjuntos = [{ codigo: "prueba23", rango: "1-2", activo: true, nombre: "PRUEBA ADJUNTA" }, { codigo: "otra2345", rango: "3-4", activo: true, nombre: "PRUEBA SEGUNDA" }];
  t.camaras = { codigo: "camprue2", activo: true };
  return t;
}
const sembrar = (t) => (page) => page.addInitScript((x) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1 }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
  localStorage.setItem("pareo_ficha_v1", "centro");
}, t);

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("\n=== Sin rondas ===");
    {
      const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(torneo(false)));
      await page.click('[data-ficha="centro"]');
      await page.waitForSelector("#pi-centro p");
      ok(/se llena cuando emparejas la ronda 1/.test(await page.textContent("#pi-centro")), "sin rondas, dice que se llena al emparejar la ronda 1");
      ok(!errores.length, "sin errores en la página", errores.join(" | "));
      await ctx.close();
    }

    console.log("\n=== Con la ronda en juego ===");
    let cola = [];
    const pedidos = [];
    const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
      await sembrar(torneo(true))(p);
      await p.route("**/functions/v1/pareo-publicar", (r) => {
        const b = JSON.parse(r.request().postData() || "{}");
        pedidos.push(b.accion);
        const responder = (x) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
        if (b.accion === "cola") return responder({ ok: true, cola, vistos: [{ codigo: "prueba23", visto: new Date(Date.now() - 3 * 60000).toISOString() }] });
        if (b.accion === "cola_borrar") { cola = cola.filter((x) => x.id > b.hasta); return responder({ ok: true }); }
        return responder({ ok: true });
      });
    });
    await page.click('[data-ficha="centro"]');
    await page.waitForSelector("#pi-centro-ronda");
    const vis = (sel) => page.$eval(sel, (n) => n.checkVisibility()).catch(() => false);
    ok(await vis("#pi-p-centro") && !(await vis("#pi-p-rondas")), "la ficha se ve, y la de Rondas no");
    igual("la ronda en juego, con las mesas terminadas escritas", await page.$eval("#pi-centro-ronda", (n) => [n.querySelector("p").textContent, n.querySelector("h3").textContent, n.querySelector("progress").value, n.querySelector("progress").max]),
      ["Ronda 1 de 5 · en juego", "1 de 4 mesas terminadas", 1, 4]);
    const pend = await page.textContent("#pi-centro-pendientes");
    ok(/Mesa 3: segunda jugada ilegal de PRUEBA G/.test(pend), "la segunda ilegal sin resultado espera al principal", pend);
    ok(await page.$('#pi-centro-pendientes [data-camara-anotar="0"]'), "lo que leyó la cámara se puede anotar desde aquí");

    await page.waitForFunction(() => /Última vez en la base: hace 3 min/.test(document.getElementById("pi-centro-adjuntos").textContent), null, { timeout: 8000 }).catch(() => {});
    const adj = await page.$$eval("[data-centro-adjunto]", (l) => l.map((x) => [x.dataset.centroAdjunto, x.querySelector("strong").textContent, x.querySelector("strong").getAttribute("aria-label"), x.textContent]));
    igual("cada adjunto con su código, deletreado para el lector de pantalla", adj.map((x) => [x[0], x[1], x[2]]),
      [["prueba23", "PRUE-BA23", "Código para la Mesa del árbitro: P R U E B A 2 3"], ["otra2345", "OTRA-2345", "Código para la Mesa del árbitro: O T R A 2 3 4 5"]]);
    ok(/mesas 1-2/.test(adj[0][3]) && /anotó 1 · 1 de 2 mesas con resultado/.test(adj[0][3]) && /Última vez en la base: hace 3 min/.test(adj[0][3]), "sus mesas, cuánto anotó y la última vez que la base supo de él", adj[0][3]);
    ok(/Todavía no ha entrado/.test(adj[1][3]), "el que no ha entrado lo dice", adj[1][3]);

    // Las cámaras: la mesa 3 manda su latido; la 1 ya terminó; la 4 no da señales.
    await page.waitForFunction(() => window.__enviados.some((x) => x.canal === "tablero-vivo-camprue2" && x.evento === "pedir"), null, { timeout: 8000 }).catch(() => {});
    await page.evaluate((pub) => window.__llega("tablero-vivo-camprue2", "latido", { torneo: pub, ronda: 1, mesa: 3 }), PUB);
    await page.waitForFunction(() => (document.querySelector('[data-centro-camara="3"]') || {}).dataset?.estado === "transmite", null, { timeout: 8000 }).catch(() => {});
    igual("las cámaras mesa por mesa, con el estado escrito", await page.$$eval("[data-centro-camara]", (l) => l.map((x) => [x.dataset.centroCamara, x.dataset.estado, x.textContent])),
      [["1", "termino", "Mesa 1Terminó"], ["2", "sinSenal", "Mesa 2Sin señal"], ["3", "transmite", "Mesa 3Transmite"], ["4", "sinSenal", "Mesa 4Sin señal"]]);

    await page.waitForFunction(() => window.__enviados.some((x) => x.canal === "pareo-adjunto-prueba23" && x.evento === "estado"), null, { timeout: 8000 }).catch(() => {});
    igual("al adjunto le manda el código de las cámaras y el torneo publicado", await page.evaluate(() => { const x = window.__enviados.filter((y) => y.canal === "pareo-adjunto-prueba23" && y.evento === "estado").pop(); return x && [x.payload.camaras, x.payload.torneo]; }), ["camprue2", PUB]);

    console.log("\n=== Se pone al día sola ===");
    cola = [{ id: 5, codigo: "otra2345", evento: "resultado", ronda: 1, datos: { mesa: 4, r: "=" } }];
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.evaluate(() => window.__llega("pareo-adjunto-otra2345", "cola", {}));
    await page.waitForFunction(() => /2 de 4 mesas terminadas/.test(document.getElementById("pi-centro-ronda").textContent), null, { timeout: 10000 }).catch(() => {});
    ok(/2 de 4 mesas terminadas/.test(await page.textContent("#pi-centro-ronda")), "un resultado que llega de la cola cambia el Centro sin tocar nada");
    igual("y la cámara de esa mesa pasa a «Terminó»", await page.$eval('[data-centro-camara="4"]', (x) => x.dataset.estado), "termino");

    await page.click('#pi-centro-pendientes [data-camara-anotar="0"]');
    await page.waitForFunction(() => /3 de 4 mesas terminadas/.test(document.getElementById("pi-centro-ronda").textContent), null, { timeout: 5000 }).catch(() => {});
    const [g] = await P.leerTodos(page);
    ok(g.rondas[0].mesas[1].r === "0-1" && g.rondas[0].deCamaras[0].resuelta === "anotado", "anotar lo de la cámara desde el Centro lo pone en la mesa", JSON.stringify(g.rondas[0].mesas[1]));
    ok(/3 de 4 mesas terminadas/.test(await page.textContent("#pi-centro-ronda")), "y el Centro se vuelve a pintar");

    console.log("\n=== Los códigos en papel y lo demás ===");
    await page.click("#pi-centro-codigos");
    const hoja = await page.textContent("#pi-plantilla");
    ok(/Códigos de los árbitros adjuntos/.test(hoja) && /PRUEBA ADJUNTA/.test(hoja) && /PRUE-BA23/.test(hoja) && /mesa-arbitro\.html/.test(hoja) && !/#adjunto=/.test(hoja), "la hoja trae nombre, mesas y código, sin el enlace", hoja);
    await page.evaluate(() => document.body.classList.remove("pi-imprimiendo-plantilla"));
    igual("sin ids repetidos con la ficha Rondas", await page.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map((n) => n.id); return ids.filter((x, k) => ids.indexOf(x) !== k); }), []);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "a 390 px no se desplaza a lo ancho");
    ok(!errores.length, "sin errores en la página", errores.join(" | "));
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
