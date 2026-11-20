/* Pareo Integral: el enlace en vivo antes de la ronda 1 muestra los
 * inscritos (js/pareo/evento.js: inscritosVista; js/pareo/pagina.js:
 * datosLecturaActual y difundirEnVivo; js/pareo/ver.js: bloqueInscritos).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - sin rondas, la página del árbitro manda el estado igual (antes no
 *     mandaba nada y el celular se quedaba en «Conectando…»);
 *   - el celular pide el estado al entrar y el árbitro le contesta;
 *   - la lista sale en orden alfabético y se puede ordenar por Elo, y el
 *     orden elegido se queda cuando llega otra novedad;
 *   - en el enlace del evento, un torneo sin rondas dice cuántos inscritos.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-vivo-inscritos.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const P = require("./lib/pareo-pruebas");
let fallos = 0;
const ok = (c, m, d) => { console.log((c ? "  ✓ " : "  ✗ ") + m + (c || !d ? "" : "\n      " + String(d).slice(0, 500))); if (!c) fallos++; };

const jugadores = [["ZÚÑIGA PEDRO", 1500], ["ARAYA ANA", 1800], ["MORA LUIS", 0], ["BRENES SOFÍA", 2000]]
  .map(([nombre, elo], k) => ({ id: "j" + k, nombre, elo, institucion: "COLEGIO " + k }));
const torneo = T.nuevo({ nombre: "PRUEBA INSCRITOS", jugadores });

// 1. La vista del evento lleva los inscritos sin rondas.
const vt = V.vistaTorneo(torneo);
ok(vt.inscritos && vt.inscritos.length === 4 && vt.inscritos[0].n === "ARAYA ANA", "vistaTorneo: inscritos en orden alfabético", JSON.stringify(vt.inscritos));
ok(vt.inscritos[2].e === undefined, "sin Elo no manda e", JSON.stringify(vt.inscritos[2]));

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    const sembrar = (page) => page.addInitScript((t) => {
      if (localStorage.getItem("pareo_lista_v1")) return;
      localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "prueba", nombre: t.nombre, actualizado: 1 }]));
      localStorage.setItem("pareo_torneo_v1_prueba", JSON.stringify(t));
      localStorage.setItem("pareo_abierto_v1", "prueba");
    }, torneo);
    const org = await P.abrirPagina(browser, BASE, "", sembrar);
    const page = org.page;
    await page.evaluate(() => document.getElementById("pi-f-torneo").click()); await page.evaluate(() => document.getElementById("pi-tv-boton").click());
    await page.waitForFunction(() => window.__enviados.some((x) => /^pareo-vivo-/.test(x.canal) && x.evento === "estado"), null, { timeout: 8000 });
    const env = await page.evaluate(() => window.__enviados.filter((x) => /^pareo-vivo-/.test(x.canal) && x.evento === "estado"));
    ok(env.length >= 1, "el árbitro manda el estado en vivo sin rondas");
    const canal = env[0].canal;
    // Llega un «pedir»: vuelve a mandar.
    await page.evaluate((c) => window.__llega(c, "pedir", {}), canal);
    await page.waitForTimeout(500);
    const env2 = await page.evaluate(() => window.__enviados.filter((x) => /^pareo-vivo-/.test(x.canal) && x.evento === "estado").length);
    ok(env2 > env.length, "responde a «pedir»", env.length + " -> " + env2);
    ok(!org.errores.length, "sin errores en la página del árbitro", org.errores.join(" | "));
    await org.ctx.close();

    const cod = canal.replace("pareo-vivo-", "");
    const cel = await P.abrirPagina(browser, BASE, "#vivo=" + cod);
    const p = cel.page;
    await p.setViewportSize({ width: 390, height: 840 });
    await p.waitForTimeout(300);
    ok(await p.evaluate((c) => window.__enviados.some((x) => x.canal === c && x.evento === "pedir"), canal), "el celular pide el estado al entrar");
    await p.evaluate((x) => window.__llega(x.canal, "estado", x.payload), env[0]);
    await p.waitForSelector("#pi-ver [data-inscritos]");
    const nombres = () => p.$$eval("#pi-ver [data-bloque-inscritos] tbody tr td:nth-child(2) span.font-semibold", (l) => l.map((x) => x.textContent));
    ok(JSON.stringify(await nombres()) === JSON.stringify(["ARAYA ANA", "BRENES SOFÍA", "MORA LUIS", "ZÚÑIGA PEDRO"]), "el celular ve los inscritos en orden alfabético", JSON.stringify(await nombres()));
    ok(/Inscritos \(4\)/.test(await p.textContent("#pi-ver")), "con cuántos son");
    await p.selectOption("#pi-ver [data-orden-inscritos]", "elo");
    ok(JSON.stringify(await nombres()) === JSON.stringify(["BRENES SOFÍA", "ARAYA ANA", "ZÚÑIGA PEDRO", "MORA LUIS"]), "por Elo, de mayor a menor", JSON.stringify(await nombres()));
    // Llega otra novedad: el orden elegido se queda.
    await p.evaluate((x) => window.__llega(x.canal, "estado", x.payload), env[0]);
    await p.waitForTimeout(200);
    ok(JSON.stringify(await nombres()) === JSON.stringify(["BRENES SOFÍA", "ARAYA ANA", "ZÚÑIGA PEDRO", "MORA LUIS"]), "el orden por Elo se queda al llegar otra novedad");
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "cabe en el celular");
    ok(!cel.errores.length, "sin errores en el celular", cel.errores.join(" | "));
    await cel.ctx.close();

    // Enlace del evento: un torneo sin rondas muestra sus inscritos.
    const ev = await P.abrirPagina(browser, BASE, "#evento=prueba99");
    await ev.page.waitForTimeout(300);
    const payload = await ev.page.evaluate((d) => window.PareoVer.paraMandar(d), V.vistaEvento({ nombre: "EVENTO" }, [torneo], null));
    await ev.page.evaluate((d) => window.__llega("pareo-evento-prueba99", "estado", d), payload);
    await ev.page.waitForSelector("details[data-torneo]");
    const resumen = await ev.page.textContent("details[data-torneo] summary");
    ok(/Inscritos \(4\)/.test(resumen), "evento: el torneo dice cuántos inscritos", resumen);
    await ev.page.click("details[data-torneo] summary");
    ok(await P.vis(ev.page, "details[data-torneo] [data-bloque-inscritos]"), "evento: al abrirlo se ven los inscritos");
    ok(!ev.errores.length, "sin errores en el enlace del evento", ev.errores.join(" | "));
  } catch (e) { ok(false, "se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
