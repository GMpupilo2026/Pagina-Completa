/* «¿Te ayudo?» de la profe Karina en la página de la Eliminatoria Cantonal JDN
 * de Pérez Zeledón 2026 (jdn-pz-2026.html, js/jdn-pz-profe.js).
 *
 * Lo que se pidió es que ella se actualice sola conforme sale más del torneo,
 * así que lo que más se prueba es que NADA de lo que dice esté escrito en su
 * código: cada respuesta sale de la página en ese momento.
 *   - el botón se ve, con su cara (los dibujos de img/avatar-profe-karina/),
 *     y la página carga la ayuda después de la inscripción y del avatar;
 *   - la próxima ronda según la hora (antes del torneo, durante la ronda 2,
 *     entre la ronda 5 y la clausura, y cuando ya terminó);
 *   - si se cambia la página (una fila «Congresillo» en el calendario, otra
 *     sede en la portada, otra categoría), la respuesta cambia;
 *   - la inscripción y los resultados siguen lo que pinta
 *     js/jdn-pz-inscripcion.js: sin los torneos en Pareo dice que todavía no,
 *     con ellos lleva a cada uno;
 *   - los botones tocan la ficha de la página (el calendario se abre);
 *   - Escape lo cierra y devuelve el foco; en el celular no hay scroll de
 *     costado.
 *
 * Ver «La profe Karina ayuda en la página» en docs/decisiones/juegos-y-torneos.md.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-jdn-pz-profe.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const U12 = "11111111-1111-4111-8111-111111111111";
const U20 = "22222222-2222-4222-8222-222222222222";

let fallos = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : " — " + detalle));
  if (!cond) fallos++;
}

// La base de mentira (la misma forma que en verificar-jdn-pz-inscripcion.js).
function doble(datos) {
  return `(function(){
  const D = ${JSON.stringify(datos)};
  window.sb = { from(tabla) {
    const filas = (D[tabla] || []).slice();
    const f = [];
    const q = {
      select() { return q; },
      eq(c, v) { f.push((r) => r[c] === v); return q; },
      in(c, vs) { f.push((r) => vs.includes(r[c])); return q; },
      order() { return q; },
      range() { return q; },
      then(okf, ko) { return Promise.resolve({ data: filas.filter((r) => f.every((g) => g(r))), error: null }).then(okf, ko); },
    };
    return q;
  } };
})();`;
}
const ORGS = [{ id: "org-adapz", nombre: "ADAPZ", verificado: true }];
const abierta = { abierta: true, hasta: "2026-11-21" };
const CON_TORNEOS = { pareo_organizadores: ORGS, pareo_publicados: [
  { id: U12, nombre: "Eliminatoria JDN PZ U12", creado: "2026-11-15T10:00:00Z", organizador_id: "org-adapz", inscripcion: abierta },
  { id: U20, nombre: "Eliminatoria JDN PZ U20", creado: "2026-11-15T10:05:00Z", organizador_id: "org-adapz", inscripcion: abierta },
] };
const SIN_TORNEOS = { pareo_organizadores: ORGS, pareo_publicados: [] };

async function abrir(nav, datos, cuando, ancho) {
  const ctx = await nav.newContext({ viewport: { width: ancho || 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(datos) }));
  await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.clock.setFixedTime(new Date(cuando || "2026-11-16T12:00:00-06:00"));
  await p.goto(BASE + "/jdn-pz-2026.html", { waitUntil: "load" });
  await p.waitForFunction(() => !/Buscando/.test(document.getElementById("insc-estado-torneos").textContent), null, { timeout: 5000 }).catch(() => {});
  return { ctx, p, errores };
}
const texto = (p, k) => p.evaluate((k) => window.JdnPzProfe.texto(k), k);

(async () => {
  console.log("La página la carga");
  const html = fs.readFileSync(path.join(RAIZ, "jdn-pz-2026.html"), "utf8");
  const i = (s) => html.indexOf(s);
  ok("después de la inscripción y del avatar", i("js/jdn-pz-inscripcion.js") > 0 && i("js/jdn-pz-inscripcion.js") < i("js/avatar-profe-oscar.js") && i("js/avatar-profe-oscar.js") < i("js/jdn-pz-profe.js"));
  const codigo = fs.readFileSync(path.join(RAIZ, "js/jdn-pz-profe.js"), "utf8");
  const poses = [...codigo.matchAll(/pose: "([a-z-]+)"/g)].map((m) => m[1]).concat(["hola", "presentando"]);
  ok("cada dibujo es de la profe Karina", poses.every((x) => fs.existsSync(path.join(RAIZ, "img/avatar-profe-karina", x + ".webp"))), poses.join(", "));
  ok("ningún dato del torneo escrito en su código (horas, fechas, la sede)", !/\d{1,2}:\d{2}|noviembre|Hotel del Sur|2015|U16:/.test(codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));

  const nav = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  try {
    console.log("\nAntes del torneo, con los torneos en Pareo");
    let x = await abrir(nav, CON_TORNEOS);
    const visible = await x.p.$eval("#profe-boton", (b) => b.checkVisibility() && b.querySelector("img").getAttribute("src"));
    ok("el botón se ve, con la cara de la profe Karina", visible === "img/avatar-profe-karina/hola.webp", String(visible));
    await x.p.click("#profe-boton");
    ok("abre con su nombre y dice que dirige el torneo (lo saca de la portada)",
      /Soy la profe Karina/.test(await x.p.textContent("#profe-panel")) && /Dirijo la eliminatoria/.test(await x.p.textContent("#profe-panel")));
    ok("la próxima ronda es la 1, con su día y su hora del calendario", /próxima es la Ronda 1: domingo 22 de noviembre a las 8:00 a\.m\. Todas/.test(await texto(x.p, "hora")), await texto(x.p, "hora"));
    ok("la inscripción dice lo que dice su ventana", /Inscripción abierta hasta las 10:00 p\.m\./.test(await texto(x.p, "inscribir")), await texto(x.p, "inscribir"));
    ok("los resultados, en los dos torneos de Pareo", /«Resultados U12» y «Resultados U20», en Pareo Integral/.test(await texto(x.p, "resultados")), await texto(x.p, "resultados"));
    ok("las categorías, de su tabla", /U12: nacidos de 2015 a 2020; U16: nacidos de 2011 a 2014; U20: nacidos de 2007 a 2010/.test(await texto(x.p, "categoria")), await texto(x.p, "categoria"));
    ok("la sede, de la portada", /La sede: Hotel del Sur, Pérez Zeledón\./.test(await texto(x.p, "llegar")), await texto(x.p, "llegar"));
    ok("el ritmo y la tolerancia", /30 minutos \+ 30 segundos.*Tolerancia de 30 minutos/.test(await texto(x.p, "ritmo")), await texto(x.p, "ritmo"));

    console.log("\nSe actualiza sola cuando la página cambia");
    ok("sin hora del congresillo, dice que llega por el chat y que aparecerá en el calendario", /virtual.*chat oficial.*aparece en el calendario/.test(await texto(x.p, "congresillo")), await texto(x.p, "congresillo"));
    await x.p.evaluate(() => {
      const tb = document.querySelector("#calendario tbody");
      const tr = document.createElement("tr");
      tr.dataset.inicio = "2026-11-20T19:00"; tr.dataset.minutos = "60";
      tr.innerHTML = '<th scope="row">Congresillo</th><td>Viernes 20 de noviembre</td><td>7:00 p.m.</td>';
      tb.prepend(tr);
      document.querySelectorAll(".cac-dato dd")[1].textContent = "Gimnasio de San Isidro";
      document.querySelector("#categorias tbody tr th").textContent = "U10 Absoluto y Femenino";
    });
    ok("una fila «Congresillo» en el calendario: dice su día y su hora", /congresillo es viernes 20 de noviembre a las 7:00 p\.m\./.test(await texto(x.p, "congresillo")), await texto(x.p, "congresillo"));
    ok("la sede nueva", /Gimnasio de San Isidro/.test(await texto(x.p, "llegar")), await texto(x.p, "llegar"));
    ok("la categoría nueva", /U10: nacidos de 2015/.test(await texto(x.p, "categoria")), await texto(x.p, "categoria"));
    ok("el congresillo no cuenta como ronda", /próxima es la Ronda 1/.test(await texto(x.p, "hora")), await texto(x.p, "hora"));

    console.log("\nLos botones tocan la página");
    await x.p.click('#profe-panel [data-pregunta="hora"]');
    await x.p.click('#profe-panel [data-accion="hora"]');
    ok("«Ver el calendario» abre el calendario", await x.p.$eval("#calendario", (d) => d.open));
    await x.p.keyboard.press("Escape");
    await x.p.click("#profe-boton");
    await x.p.keyboard.press("Escape");
    ok("Escape lo cierra y el foco vuelve al botón", await x.p.evaluate(() => document.getElementById("profe-panel").hidden && document.activeElement.id === "profe-boton"));
    ok("sin errores en la página", !x.errores.length, x.errores.join(" | "));
    await x.ctx.close();

    console.log("\nSin los torneos en Pareo todavía");
    x = await abrir(nav, SIN_TORNEOS);
    ok("los resultados dicen que se publican cuando la organización arme los torneos", /cuando la organización arme los torneos/.test(await texto(x.p, "resultados")), await texto(x.p, "resultados"));
    ok("la inscripción dice que todavía no está abierta", /todavía no está abierta/.test(await texto(x.p, "inscribir")), await texto(x.p, "inscribir"));
    await x.ctx.close();

    console.log("\nEl día del torneo");
    x = await abrir(nav, CON_TORNEOS, "2026-11-22T10:30:00-06:00");
    ok("durante la ronda 2: la que se juega y la siguiente", /Ahora se juega la Ronda 2, que empezó a las 10:00 a\.m\. La siguiente es la Ronda 3: domingo 22 de noviembre a las 1:00 p\.m\./.test(await texto(x.p, "hora")), await texto(x.p, "hora"));
    await x.ctx.close();
    x = await abrir(nav, CON_TORNEOS, "2026-11-22T19:10:00-06:00");
    ok("después de la ronda 5, antes de la clausura", /Ya se jugaron todas las rondas/.test(await texto(x.p, "hora")), await texto(x.p, "hora"));
    await x.ctx.close();
    x = await abrir(nav, CON_TORNEOS, "2026-11-22T21:00:00-06:00");
    ok("cuando terminó: la clasificación final", /ya terminó/.test(await texto(x.p, "hora")) && /clasificación final/.test(await texto(x.p, "resultados")), await texto(x.p, "hora"));
    await x.ctx.close();

    console.log("\nEn el celular");
    x = await abrir(nav, CON_TORNEOS, null, 375);
    await x.p.click("#profe-boton");
    await x.p.click('#profe-panel [data-pregunta="ritmo"]');
    ok("sin scroll de costado con el panel abierto", await x.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    ok("el panel entra en la pantalla", await x.p.$eval("#profe-panel", (d) => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
    await x.ctx.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
