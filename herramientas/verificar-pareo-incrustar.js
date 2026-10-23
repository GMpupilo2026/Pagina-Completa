/* «Torneos en Pareo Integral»: la clasificación para incrustar en la página
 * de un club (/incrustar/<id>, que arma worker.js y pinta
 * js/pareo-incrustar.js), y el código que da torneos-pareo.html. Lo que se
 * prueba, porque se rompe sin dar ningún error:
 *   - la página deja que otra la meta en un iframe (frame-ancestors *, sin
 *     X-Frame-Options) y es la única: lo demás sigue con frame-ancestors
 *     'self' en _headers;
 *   - el torneo viaja como JSON que no se ejecuta: un nombre con
 *     «</script>» no corta el bloque ni corre nada;
 *   - la clasificación es la misma que calcula Pareo Integral, con ?n= y
 *     ?ver=ronda, y se ve DENTRO de un iframe de otro sitio;
 *   - sin torneo, 404; con Supabase caído, 503 y vuelve a intentar;
 *   - el código para copiar lleva la dirección y el título, y cambia con lo
 *     que se elige mostrar.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-incrustar.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const PP = require(path.join(RAIZ, "js/pareo/publicar.js"));

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), m, "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));

const ID = "88888888-8888-4888-8888-888888888888";
const ids = ["a", "b", "c", "d", "e", "f"];
const t = T.nuevo({ nombre: "PRUEBA </script><script>window.__colado=1</script>", rondasTotales: 3, mesaInicial: 1, fechaInicio: "2026-10-22",
  jugadores: ids.map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase() + (id === "c" ? " <b>negrita</b>" : ""), elo: 1900 - 100 * k, institucion: "LICEO " + id.toUpperCase() })) });
t.rondas = [
  { mesas: [{ b: "a", n: "d", r: "1-0" }, { b: "e", n: "b", r: "1-0" }, { b: "c", n: "f", r: "=" }], ausencias: {} },
  { mesas: [{ b: "e", n: "a", r: "" }, { b: "b", n: "c", r: "0-1" }, { b: "f", n: "d", r: "" }], ausencias: {} },
];
const FILA = { id: ID, nombre: t.nombre, evento: "", lugar: "San José", fecha: "2026-10-22", datos: PP.datosPublicos(t) };

async function cargarWorker() {
  const fuente = fs.readFileSync(path.join(RAIZ, "worker.js"), "utf8");
  return (await import("data:text/javascript;base64," + Buffer.from(fuente).toString("base64"))).default;
}

(async () => {
  const worker = await cargarWorker();
  const env = { ASSETS: { fetch: () => new Response("archivo", { status: 200 }) } };
  const pedirWorker = async (ruta, contesta) => {
    const preguntas = [];
    globalThis.fetch = async (u) => { preguntas.push(String(u)); return contesta(String(u)); };
    const res = await worker.fetch(new Request("https://ajedrez-integral.com" + ruta), env);
    return { estado: res.status, html: await res.text(), cabeceras: Object.fromEntries(res.headers), preguntas };
  };
  const conFila = () => new Response(JSON.stringify([FILA]), { status: 200 });

  console.log("\n=== Lo que arma el worker ===");
  const r = await pedirWorker("/incrustar/" + ID, conFila);
  igual("contesta 200 con la página", r.estado, 200);
  const csp = r.cabeceras["content-security-policy"] || "";
  ok(/frame-ancestors \*/.test(csp) && !r.cabeceras["x-frame-options"], "otra página la puede meter en un iframe (frame-ancestors *, sin X-Frame-Options)", csp);
  ok(/script-src 'self'(;|$)/.test(csp) && !/unsafe-inline'[^;]*;?\s*$/.test(csp.split(";").find((x) => /script-src/.test(x)) || ""), "y solo corre sus propios archivos");
  const headers = fs.readFileSync(path.join(RAIZ, "_headers"), "utf8");
  ok(/frame-ancestors 'self'/.test(headers) && !/frame-ancestors \*/.test(headers), "el resto del sitio sigue sin dejarse meter en iframes (_headers)");
  const wr = JSON.parse(fs.readFileSync(path.join(RAIZ, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
  ok(wr.assets.run_worker_first.includes("/incrustar/*"), "wrangler.jsonc hace correr el worker en /incrustar/ (sin eso, 404)");
  ok(!/<\/script><script>window\.__colado/.test(r.html) && /\\u003c\/script>/.test(r.html), "el nombre con «</script>» va escapado dentro del JSON");
  ok(/<meta http-equiv="refresh" content="60">/.test(r.html), "se vuelve a pedir sola cada minuto");
  ok(/pareo_publicados\?select=id,nombre,evento,lugar,fecha,datos&id=eq\.88888888-/.test(r.preguntas[0] || ""), "pregunta por ese torneo, a la tabla pública");
  const r404 = await pedirWorker("/incrustar/" + ID, () => new Response("[]", { status: 200 }));
  ok(r404.estado === 404 && /no está publicado/.test(r404.html) && !/refresh/.test(r404.html), "un torneo que no está: 404, lo dice y no se queda pidiendo");
  const r503 = await pedirWorker("/incrustar/" + ID, () => { throw new Error("caído"); });
  ok(r503.estado === 503 && /refresh/.test(r503.html), "Supabase caído: 503 y vuelve a intentar en un minuto");
  const rMal = await pedirWorker("/incrustar/no-es-un-id", conFila);
  ok(rMal.preguntas.length === 0, "lo que no es un id no pregunta nada");
  const rOsc = await pedirWorker("/incrustar/" + ID + "?tema=oscuro", conFila);
  ok(/<html lang="es" class="oscuro">/.test(rOsc.html), "?tema=oscuro le pone el fondo oscuro");

  console.log("\n=== Dentro del iframe de otra página ===");
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  // El worker contesta /incrustar/ (con sus cabeceras); el resto, el sitio de siempre.
  await page.route(/\/incrustar\//, async (route) => {
    const u = new URL(route.request().url());
    globalThis.fetch = async () => conFila();
    const res = await worker.fetch(new Request("https://ajedrez-integral.com" + u.pathname + u.search), env);
    route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
  await page.route("https://club-prueba.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html",
    body: `<!DOCTYPE html><html><body><h1>Club PRUEBA</h1><iframe id="f" src="${BASE}/incrustar/${ID}?n=4" title="Clasificación" width="600" height="500"></iframe></body></html>` }));
  await page.goto("https://club-prueba.test/", { waitUntil: "load" });
  const marco = page.frame({ url: /\/incrustar\// });
  await marco.waitForSelector("#pi-inc-tabla");
  const esperado = V.aplicarDesempate(FILA.datos, E.clasificacion(Object.assign({}, FILA.datos, { rondas: FILA.datos.rondas.slice(0, V.rondasCompletas(FILA.datos)) }), FILA.datos.desempates))
    .slice(0, 4).map((f) => [String(f.puesto), f.id]);
  igual("se ve la clasificación de Pareo Integral, los primeros 4 (?n=4)", await marco.$$eval("#pi-inc-tabla tbody tr", (l) => l.map((x) => [x.cells[0].textContent, x.dataset.id])), esperado);
  ok(/Clasificación tras la ronda 1 \(provisional\)/.test(await marco.textContent("#pi-inc-tabla caption")), "dice tras qué ronda y que es provisional");
  ok(await marco.evaluate(() => window.__colado === undefined && !document.querySelector("#pi-inc b")), "nada de lo escrito por personas se ejecuta ni se vuelve HTML");
  ok((await marco.textContent("#pi-inc")).includes("PRUEBA C <b>negrita</b>"), "el nombre con etiquetas se lee como texto");
  const pie = await marco.$eval(".pie a", (a) => [a.href, a.target, a.rel]);
  igual("«Ver todo en Pareo Integral» lleva al torneo en otra pestaña", pie, ["https://ajedrez-integral.com/torneos-pareo.html#t=" + ID, "_blank", "noopener"]);
  const visible = await marco.$eval("#pi-inc-tabla", (x) => x.checkVisibility() && x.getBoundingClientRect().height > 50);
  ok(visible, "y se ve de verdad, no solo está en el DOM");

  console.log("\n=== Las mesas de la ronda (?ver=ronda) y el tema oscuro ===");
  await page.goto("about:blank");
  await page.goto(BASE + "/incrustar/" + ID + "?ver=ronda&tema=oscuro");
  await page.waitForSelector("#pi-inc-tabla");
  igual("las mesas de la última ronda, con su resultado o «jugando»", await page.$$eval("#pi-inc-tabla tbody tr", (l) => l.map((x) => x.cells[2].textContent)), ["jugando", "0 – 1", "jugando"]);
  const colores = await page.evaluate(() => {
    const c = (x) => getComputedStyle(x);
    return { fondo: c(document.body).backgroundColor, texto: c(document.querySelector("td")).color, nota: c(document.querySelector(".pie")).color };
  });
  const lum = (rgb) => { const v = rgb.match(/\d+/g).slice(0, 3).map((n) => n / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  ok(contraste(colores.texto, colores.fondo) >= 4.5 && contraste(colores.nota, colores.fondo) >= 4.5, "en oscuro, el texto y las notas pasan AA contra su fondo real", JSON.stringify(colores));
  await page.goto("about:blank");
  await page.goto(BASE + "/incrustar/" + ID);
  await page.waitForSelector("#pi-inc-tabla");
  const claros = await page.evaluate(() => ({ fondo: getComputedStyle(document.body).backgroundColor, texto: getComputedStyle(document.querySelector("td")).color, nota: getComputedStyle(document.querySelector(".pie")).color }));
  ok(contraste(claros.texto, claros.fondo) >= 4.5 && contraste(claros.nota, claros.fondo) >= 4.5, "y en claro también", JSON.stringify(claros));
  ok(!errores.length, "sin errores en la consola", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El código para copiar, en torneos-pareo.html ===");
  {
    const ctx2 = await browser.newContext({ serviceWorkers: "block" });
    const p2 = await ctx2.newPage();
    const errores2 = [];
    p2.on("pageerror", (e) => errores2.push(String(e)));
    const columnas = require("./lib/pareo-pruebas").columnasPedidas;
    await p2.route("**/rest/v1/pareo_publicados**", (route) => {
      const u = new URL(route.request().url());
      const fila = Object.assign({ rondas: 2, rondas_total: 3, jugadores: 6, actualizado: "2026-10-22T15:00:00Z", organizador_id: null }, FILA);
      const objeto = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
      const cuerpo = objeto ? columnas(u.searchParams.get("select") || "", fila) : [columnas(u.searchParams.get("select") || "", fila)];
      route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(cuerpo) });
    });
    await p2.goto(BASE + "/torneos-pareo.html#t=" + ID, { waitUntil: "networkidle" });
    await p2.waitForSelector("#tp-incrustar");
    igual("«Ponerlo en tu página» empieza cerrado y lo dice", [await p2.getAttribute("#tp-incrustar", "aria-expanded"), await p2.locator("#tp-incrustar-caja").evaluate((x) => x.checkVisibility())], ["false", false]);
    await p2.click("#tp-incrustar");
    igual("al tocarlo se abre, con el foco en el código", [await p2.getAttribute("#tp-incrustar", "aria-expanded"), await p2.locator("#tp-incrustar-caja").evaluate((x) => x.checkVisibility()), await p2.evaluate(() => document.activeElement.id)], ["true", true, "tp-incrustar-codigo"]);
    const codigo = await p2.inputValue("#tp-incrustar-codigo");
    ok(codigo.startsWith('<iframe src="https://ajedrez-integral.com/incrustar/' + ID + '"') && /title="Clasificación de PRUEBA &lt;\/script&gt;/.test(codigo) && /loading="lazy"/.test(codigo), "el código lleva la dirección y un título escapado", codigo);
    await p2.check("#tp-incrustar-ver-ronda");
    ok(/\/incrustar\/[^"]+\?ver=ronda"/.test(await p2.inputValue("#tp-incrustar-codigo")) && /title="Mesas de la ronda de /.test(await p2.inputValue("#tp-incrustar-codigo")), "elegir «Las mesas de la última ronda» cambia el código");
    await p2.evaluate(() => { window.__copiado = []; navigator.clipboard.writeText = async (x) => { window.__copiado.push(x); }; });
    await p2.click("#tp-incrustar-copiar");
    igual("«Copiar el código» copia lo que se ve", await p2.evaluate(() => window.__copiado[0]), await p2.inputValue("#tp-incrustar-codigo"));
    ok(!errores2.length, "sin errores en la consola", errores2.join(" | "));
    await ctx2.close();
  }

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
