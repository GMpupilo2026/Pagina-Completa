/* El rating táctico (js/rating-tactico.js, public.rating_tactico).
 *
 *   1. LO QUE SE DICE (en Node): el número, el cambio de hoy con su signo de
 *      verdad («−8», nunca «-8» ni «+0»), el mejor solo si es más alto, el
 *      aviso de provisional los primeros 20 ejercicios, y que NO es el Elo.
 *   2. LA PÁGINA (en el navegador, con el marcado de entreno/temas.html):
 *      se pide al cargar; cuando EntrenoProgress anota un ejercicio de temas
 *      se vuelve a pedir y cambia; uno que la base RECHAZÓ no dispara nada;
 *      otra actividad tampoco; y sin ejercicios, la barra del ejercicio no
 *      muestra nada (no un «Rating táctico: 1200» inventado).
 *   3. EL CABLEADO: temas.html carga el módulo después de entreno-progress;
 *      el informe de un alumno lo pide con SU id; la migración es INVOKER (la
 *      RLS de training_progress decide quién ve el de quién) y no es de anon.
 *
 * Uso:  node herramientas/verificar-rating-tactico.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
require("./lib/navegador-local");

const RAIZ = path.join(__dirname, "..");
const R = require(path.join(RAIZ, "js", "rating-tactico.js"));

let fallos = 0;
function ok(cond, msg, detalle) {
  if (cond) console.log("  ✓ " + msg);
  else { console.log("  ✗ " + msg + (detalle !== undefined ? "\n      salió: " + JSON.stringify(detalle) : "")); fallos++; }
}

console.log("Lo que se dice:");
{
  const f = R.frase({ rating: 1871, ejercicios: 1540, cambio_hoy: 12, mejor: 2001 });
  ok(f.corto === "Rating táctico: 1871 (+12 hoy)", "el corto: número y cambio de hoy", f.corto);
  ok(f.largo.startsWith("Tu rating táctico: 1871 · +12 hoy · tu mejor: 2001."), "el largo: número, hoy y su mejor", f.largo);
  ok(/No es tu Elo\.$/.test(f.largo), "dice que no es el Elo");
  const baja = R.frase({ rating: 1300, ejercicios: 100, cambio_hoy: -8, mejor: 1300 });
  ok(baja.corto === "Rating táctico: 1300 (−8 hoy)", "una baja va con el signo menos de verdad", baja.corto);
  ok(!/tu mejor/.test(baja.largo), "si está en su mejor, no lo repite");
  const quieto = R.frase({ rating: 1300, ejercicios: 100, cambio_hoy: 0, mejor: 1350 });
  ok(quieto.corto === "Rating táctico: 1300" && !/hoy/.test(quieto.largo), "sin cambio hoy no dice «+0»", quieto);
  const nuevo = R.frase({ rating: 1240, ejercicios: 3, cambio_hoy: 40, mejor: 1240 });
  ok(/17 ejercicios más y se asienta/.test(nuevo.largo), "los primeros 20 avisa que se está acomodando", nuevo.largo);
  ok(/1 ejercicio más y se asienta/.test(R.frase({ rating: 1240, ejercicios: 19, cambio_hoy: 0, mejor: 1240 }).largo), "y en singular");
  const cero = R.frase({ rating: 1200, ejercicios: 0, cambio_hoy: 0, mejor: 1200 });
  ok(cero.corto === "" && /primer ejercicio/.test(cero.largo), "sin ejercicios no inventa un número", cero);
  ok(R.frase(null).corto === "", "sin respuesta, nada");
}

console.log("El cableado:");
{
  const html = fs.readFileSync(path.join(RAIZ, "entreno", "temas.html"), "utf8");
  const iP = html.indexOf('src="../js/entreno-progress.js"'), iR = html.indexOf('src="../js/rating-tactico.js"');
  ok(iP > 0 && iR > iP, "temas.html carga rating-tactico.js después de entreno-progress.js");
  ok(/data-rating-tactico="largo"/.test(html) && /data-rating-tactico="corto"/.test(html), "y tiene dónde decirlo: en la portada y en la barra del ejercicio");
  const inf = fs.readFileSync(path.join(RAIZ, "js", "informes.js"), "utf8");
  ok(/pintarRatingTactico\(persona\.id\)/.test(inf) && /RatingTactico\.leer\(sb, alumnoId\)/.test(inf), "el informe de un alumno lo pide con SU id");
  const infHtml = fs.readFileSync(path.join(RAIZ, "informes.html"), "utf8");
  ok(infHtml.indexOf('src="js/rating-tactico.js"') > 0 && infHtml.indexOf('src="js/rating-tactico.js"') < infHtml.indexOf('src="js/informes.js"'), "informes.html lo carga antes que informes.js");
  const mig = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => /_rating_tactico\.sql$/.test(f));
  const sql = mig.length ? fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", mig[mig.length - 1]), "utf8") : "";
  ok(/security invoker/.test(sql), "la función es INVOKER: la RLS de training_progress decide quién ve el de quién");
  ok(/revoke execute on function public\.rating_tactico\(uuid\) from public, anon/.test(sql), "y no es de anon");
  ok(/jsonb_typeof\(t\.detail->'limpio'\) = 'boolean'/.test(sql), "las filas sin «limpio» no cuentan");
}

async function pagina() {
  console.log("La página:");
  const html = fs.readFileSync(path.join(RAIZ, "entreno", "temas.html"), "utf8");
  const portada = html.match(/<p class="rating-tactico" data-rating-tactico="largo" hidden><\/p>/)[0];
  const barra = html.match(/<span class="rating-tactico-corto" data-rating-tactico="corto" hidden><\/span>/)[0];
  const progreso = fs.readFileSync(path.join(RAIZ, "js", "entreno-progress.js"), "utf8");
  const modulo = fs.readFileSync(path.join(RAIZ, "js", "rating-tactico.js"), "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><body>${portada}<div>${barra}</div></body></html>`);
  // El doble: cada llamada a rating_tactico devuelve el siguiente de la lista; insert acepta o rechaza.
  await page.evaluate(() => {
    window.__pedidos = 0;
    window.__respuestas = [
      { rating: 1500, ejercicios: 40, cambio_hoy: 0, mejor: 1520 },
      { rating: 1512, ejercicios: 41, cambio_hoy: 12, mejor: 1520 },
    ];
    window.__insertOk = true;
    window.sb = {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u-ana" } } } }) },
      rpc: async (n) => {
        if (n === "rating_tactico") { const r = window.__respuestas[Math.min(window.__pedidos, window.__respuestas.length - 1)]; window.__pedidos++; return { data: [r], error: null }; }
        return { data: [], error: null };
      },
      from: () => ({ insert: async () => (window.__insertOk ? { error: null } : { error: { message: "rechazado" } }) }),
    };
  });
  await page.addScriptTag({ content: progreso });
  await page.addScriptTag({ content: modulo });
  await page.waitForFunction(() => window.__pedidos === 1);
  const texto = (sel) => page.$eval(sel, (n) => n.checkVisibility() ? n.textContent : "(no se ve)");
  ok((await texto(".rating-tactico")).startsWith("Tu rating táctico: 1500 · tu mejor: 1520."), "se pide al cargar y se ve en la portada");
  ok((await texto(".rating-tactico-corto")) === "Rating táctico: 1500", "y en la barra del ejercicio");

  await page.evaluate(() => EntrenoProgress.log("temas", { puzzle_id: "x", rating: 1400, limpio: true }));
  await page.waitForFunction(() => window.__pedidos === 2);
  await page.waitForTimeout(50);
  ok((await texto(".rating-tactico-corto")) === "Rating táctico: 1512 (+12 hoy)", "un ejercicio anotado lo vuelve a pedir y cambia");

  await page.evaluate(async () => { window.__insertOk = false; await EntrenoProgress.log("temas", { puzzle_id: "y" }); });
  await page.waitForTimeout(150);
  ok((await page.evaluate(() => window.__pedidos)) === 2, "uno que la base rechazó no lo vuelve a pedir");
  await page.evaluate(async () => { window.__insertOk = true; await EntrenoProgress.log("coordenadas", { aciertos: 3 }); });
  await page.waitForTimeout(150);
  ok((await page.evaluate(() => window.__pedidos)) === 2, "otra actividad (coordenadas) tampoco");

  // Sin ejercicios: la barra no inventa un número.
  const p2 = await browser.newPage();
  await p2.setContent(`<!doctype html><html><body>${portada}<div>${barra}</div></body></html>`);
  await p2.evaluate(() => {
    window.__pedidos = 0;
    window.sb = { rpc: async () => { window.__pedidos++; return { data: [{ rating: 1200, ejercicios: 0, cambio_hoy: 0, mejor: 1200 }], error: null }; } };
  });
  await p2.addScriptTag({ content: modulo });
  await p2.waitForFunction(() => window.__pedidos === 1);
  await p2.waitForTimeout(50);
  ok(!(await p2.$eval(".rating-tactico-corto", (n) => n.checkVisibility())), "sin ejercicios, la barra no muestra nada");
  ok(/primer ejercicio/.test(await p2.$eval(".rating-tactico", (n) => n.textContent)), "y la portada dice cuándo aparece");
  await browser.close();
}

pagina().then(() => {
  if (fallos) { console.log("\n✗ " + fallos + " comprobación(es) fallaron."); process.exit(1); }
  console.log("\n✓ Todo bien.");
}).catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
