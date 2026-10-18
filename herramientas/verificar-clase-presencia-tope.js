#!/usr/bin/env node
/* Que ningún alumno desaparezca de «Alumnos conectados» por anunciarse de más.

   Realtime deja a cada uno 5 anuncios de presencia (track) cada 30 s por
   canal, y con el sexto CIERRA el canal: el alumno sigue en la clase, con su
   latido de asistencia, pero el profe ya no lo ve conectado hasta que recarga.
   No da ningún error. El 17/10/2026, en una competencia, a siete alumnos les
   pasó (cada ejercicio resuelto era un anuncio). Ver «La presencia tiene un
   tope de anuncios» en docs/decisiones/clase-en-vivo.md.

   Se comprueba, contra el doble de verificar-clase-registrada.js:

   - que en las partes de la clase nadie llame a track() suelto: todo sale por
     anunciarPresencia();
   - que el tope de la página quede por debajo del de Realtime (5 en 30 s);
   - que diez anuncios seguidos (la mano arriba y abajo) no pasen del tope, y
     que el que esperaba salga después con lo ÚLTIMO (la mano arriba);
   - que si Realtime cierra el canal igual, la página arme otro y se vuelva a
     anunciar, y que no lo haga si al alumno lo sacaron de la clase.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-presencia-tope.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const CANAL = "clases-presence:u-profe";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

function sinTrackSuelto() {
  console.log("\n=== Ningún track() suelto en la clase ===");
  const raiz = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(raiz, "sesion.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1])
    .filter((s) => !s.startsWith("js/vendor/"));
  const sueltos = [];
  for (const s of scripts) {
    const archivo = path.join(raiz, s);
    if (!fs.existsSync(archivo)) continue;
    fs.readFileSync(archivo, "utf8").split("\n").forEach((linea, i) => {
      // El único permitido: el de enviarAnuncioDePresencia, en js/sesion.js.
      if (/presenceChannel\.track\(/.test(linea) && !/if \(presenceChannel\) await presenceChannel\.track\(metaDePresencia\(\)\);/.test(linea)) {
        sueltos.push(s + ":" + (i + 1));
      }
    });
  }
  igual("todo anuncio sale por anunciarPresencia()", sueltos, []);
  const sesion = fs.readFileSync(path.join(raiz, "js/sesion.js"), "utf8");
  igual("y track() aparece una sola vez en js/sesion.js", (sesion.match(/presenceChannel\.track\(/g) || []).length, 1);
}

async function pruebaTope(browser) {
  console.log("\n=== Diez anuncios seguidos no pasan del tope ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {});
  await page.waitForFunction(() => window.__suscritos && window.__suscritos["clases-presence:u-profe"], null, { timeout: 15000 });
  igual("el tope de la página queda por debajo del de Realtime (5 en 30 s)",
    await page.evaluate(() => cupoDePresencia.tope < 5 && cupoDePresencia.ventanaMs >= 30000), true);

  // La misma regla con una ventana corta, para no esperar 31 s.
  await page.evaluate(() => {
    // setTimeout puede saltar un milisegundo antes (pasó en el CI: salió un
    // anuncio de más en la ventana). Acá se adelanta siempre 3 ms, para que la
    // prueba lo vea cada vez y no una de cada tantas.
    const st = window.setTimeout;
    window.setTimeout = (f, ms, ...a) => st(f, Math.max(0, (ms || 0) - 3), ...a);
    cupoDePresencia.ventanaMs = 1500;
    reiniciarCupoDePresencia();
    window.__horas = [];
    const canal = presenceChannel;
    const track = canal.track.bind(canal);
    canal.track = (m) => { window.__horas.push(Date.now()); return track(m); };
    for (let i = 0; i < 9; i++) setHandRaised(!handRaised); // termina con la mano arriba
  });
  igual("salen solo los del tope, en el acto", await page.evaluate(() => window.__horas.length), 4);
  await page.waitForFunction(() => window.__horas.length >= 5, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);
  igual("el resto espera y sale en UN solo anuncio", await page.evaluate(() => window.__horas.length), 5);
  igual("con lo último: la mano arriba", await page.evaluate(() => window.__tracks.slice(-1)[0].hand_raised), true);
  igual("ninguna ventana lleva más que el tope", await page.evaluate(() => {
    const h = window.__horas;
    let max = 0;
    for (let i = 0; i < h.length; i++) max = Math.max(max, h.filter((t) => t >= h[i] && t - h[i] < 1500).length);
    return max <= cupoDePresencia.tope;
  }), true);

  console.log("\n=== Realtime cierra el canal: la página arma otro ===");
  await page.evaluate(() => { window.__antes = presenceChannel; window.__nTracks = window.__tracks.length; });
  await page.evaluate((c) => window.__suscritos[c]("CLOSED"), CANAL);
  await page.waitForFunction(() => presenceChannel !== window.__antes, null, { timeout: 6000 }).catch(() => {});
  igual("hay un canal nuevo", await page.evaluate(() => presenceChannel !== window.__antes), true);
  igual("y se vuelve a anunciar en él, con la mano como estaba", await page.evaluate(() =>
    window.__tracks.length > window.__nTracks && window.__tracks.slice(-1)[0].hand_raised), true);

  console.log("\n=== Si lo sacaron de la clase, no vuelve ===");
  await page.evaluate(() => { meSacaron = true; window.__antes = presenceChannel; });
  await page.evaluate((c) => window.__suscritos[c]("CLOSED"), CANAL);
  await page.waitForTimeout(4500);
  igual("el canal queda cerrado", await page.evaluate(() => presenceChannel === window.__antes), true);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  sinTrackSuelto();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaTope(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: nadie se queda fuera de la presencia por anunciarse de más.");
  process.exit(fallos ? 1 : 0);
})();
