/* Aprende a jugar en el navegador (entreno/aprende-a-jugar.html).

   verificar-aprende-a-jugar.js ya juega cada nivel con el motor; acá se mira
   que la PÁGINA haga lo que el motor dice, en pantalla:

   - La presentación de la etapa sale encima del tablero y «¡Vamos!» la saca.
   - La estrella se VE (checkVisibility) en su casilla y el lector la oye
     («estrella» en el estado de la casilla), sin que diga «peón negro».
   - Torre a la estrella: el nivel se gana con tres estrellas, el progreso
     queda guardado y pasa solo al nivel 2.
   - Capturar 2: comer f7 con la dama deja la pieza colgada: el nivel se
     pierde, la casilla que castiga lleva «!» y la torre se come la dama.
   - «Reintentar» devuelve la posición.
   - Se juega escribiendo: «Te7» en el recuadro gana el nivel 1.
   - El enlace #al-paso/1 abre esa etapa y las negras juegan solas d7-d5.

   Uso:  node herramientas/verificar-todo.js aprende-a-jugar-pagina          */
const { chromium } = require("./lib/playwright-con-sesion");
const doble = require("./lib/doble-entreno");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fallos = 0;
function cierto(nombre, v, detalle) {
  if (v) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      salió: " + detalle : "")); fallos += 1; }
}
const RUTA = "/entreno/aprende-a-jugar.html";
async function abrir(browser, hash, local) {
  const r = await doble.abrir(browser, RUTA + (hash || ""), {}, local || {});
  r.page.on("pageerror", (e) => cierto("sin errores de JavaScript", false, e.message));
  await r.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await r.page.waitForTimeout(300);
  return r;
}
const estado = (page) => page.textContent("#aj-estado");

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("La torre, haciendo clic");
    let { page } = await abrir(browser);
    cierto("la presentación de la etapa se ve", await page.evaluate(() => document.getElementById("tarjeta").checkVisibility()));
    await page.click("#tarjeta-botones .primary");
    cierto("«¡Vamos!» la saca", !(await page.evaluate(() => document.getElementById("tarjeta").checkVisibility())));
    const e7 = await page.evaluate(() => {
      const b = document.querySelector('[data-square="e7"]');
      const s = b.querySelector(".estrella");
      return { ve: !!s && s.checkVisibility(), estado: b.dataset.estado || "", piezas: b.querySelectorAll("[class*=piece], svg:not(.estrella svg)").length };
    });
    cierto("la estrella de e7 se ve", e7.ve);
    cierto("la casilla dice «estrella»", /estrella/.test(e7.estado), e7.estado);
    cierto("la estrella no se pinta como un peón negro", !(await page.evaluate(() => /peón/.test(document.querySelector('[data-square="e7"]').getAttribute("aria-label") || ""))));
    await page.click('[data-square="e2"]');
    await page.click('[data-square="e7"]');
    await page.waitForTimeout(200);
    const t = await estado(page);
    cierto("gana el nivel con tres estrellas", /Nivel terminado con 3 estrellas/.test(t), t);
    const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("entreno_aprende_jugar_v1") || "{}"));
    cierto("guarda los puntos del nivel", guardado["torre:1"] === 550, JSON.stringify(guardado));
    await page.waitForTimeout(1700);
    cierto("pasa solo al nivel 2", /Junta todas las estrellas/.test(await page.textContent("#nivel-meta")));
    await page.context().close();

    console.log("Capturar 2: la dama colgada");
    ({ page } = await abrir(browser, "#capturar/2"));
    await page.click('[data-square="f4"]');
    await page.click('[data-square="f7"]');
    await page.waitForTimeout(150);
    const t2 = await estado(page);
    cierto("el nivel se pierde y dice por qué", /te comen una pieza sin proteger/.test(t2), t2);
    cierto("la torre que castiga lleva «!»", await page.evaluate(() => document.querySelector('[data-square="c7"]').classList.contains("castigo")));
    await page.waitForTimeout(900);
    const f7 = await page.evaluate(() => document.querySelector('[data-square="f7"]').getAttribute("aria-label") || "");
    cierto("la torre se come la dama", /torre/i.test(f7) && /negr/i.test(f7), f7);
    await page.click("#btn-reintentar");
    await page.waitForTimeout(150);
    const f4 = await page.evaluate(() => document.querySelector('[data-square="f4"]').getAttribute("aria-label") || "");
    cierto("«Reintentar» devuelve la dama a f4", /dama/i.test(f4), f4);
    await page.context().close();

    console.log("Escribiendo (Modo Adaptado)");
    ({ page } = await abrir(browser, "#torre/1", { oscarBlindMode_v1: "1" }));
    const ok = await page.evaluate(() => { const c = document.querySelector("#q-comandos .cc-input"); if (!c || !c.checkVisibility()) return false; c.focus(); return true; });
    cierto("el recuadro se ve en Modo Adaptado", ok);
    await page.keyboard.type("Te7");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const t3 = await estado(page);
    cierto("«Te7» escrito gana el nivel", /Nivel terminado/.test(t3), t3);
    await page.context().close();

    console.log("Captura al paso: el rival empieza");
    ({ page } = await abrir(browser, "#al-paso/1"));
    await page.waitForTimeout(1400);
    const d5 = await page.evaluate(() => document.querySelector('[data-square="d5"]').getAttribute("aria-label") || "");
    cierto("las negras juegan d7-d5 solas", /peón/i.test(d5) && /negr/i.test(d5), d5);
    await page.click('[data-square="c5"]');
    await page.click('[data-square="d6"]');
    await page.waitForTimeout(200);
    const t4 = await estado(page);
    cierto("comer al paso gana el nivel", /Nivel terminado/.test(t4), t4);
    await page.context().close();
  } finally {
    await browser.close();
  }
  if (fallos) { console.log("\n✗ " + fallos + " problema(s)."); process.exit(1); }
  console.log("\n✓ Aprende a jugar funciona en pantalla.");
})();
