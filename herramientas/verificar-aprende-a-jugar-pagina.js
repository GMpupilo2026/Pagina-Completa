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
   - Dentro de la clase en vivo (un marco con ?en-clase=1): solo el tablero y
     lo del ejercicio (sin menú, encabezado, descripción, modos, niveles ni
     puntos), y al ganar el nivel que mandó el profe NO pasa solo al
     siguiente: espera el que mande el profe.
   - Los sonidos de Lichess en sus momentos (js/sonidos.js): el acorde de la
     etapa, «tomar» al juntar una estrella sin terminar, «fin-nivel» al
     ganar, «fallo» al perder; y apagados con el botón «Sonido», no suena
     ninguno y la preferencia se recuerda.

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

    console.log("Los sonidos");
    ({ page } = await abrir(browser, "#torre/2"));
    const sonidos = () => page.evaluate(() => window.Sonidos.historial.slice());
    await page.evaluate(() => { window.Sonidos.historial.length = 0; });
    await page.click('[data-square="c7"]'); await page.click('[data-square="c5"]');
    await page.waitForTimeout(100);
    cierto("juntar una estrella sin terminar suena «tomar»", JSON.stringify(await sonidos()) === '["tomar"]', JSON.stringify(await sonidos()));
    // La torre sigue elegida después de juntar la estrella (como en Lichess): basta tocar g5.
    await page.click('[data-square="g5"]');
    await page.waitForTimeout(100);
    cierto("ganar el nivel suena «fin-nivel»", (await sonidos())[1] === "fin-nivel", JSON.stringify(await sonidos()));
    await page.waitForTimeout(1600);
    cierto("el nivel siguiente avisa con «inicio-nivel»", (await sonidos())[2] === "inicio-nivel", JSON.stringify(await sonidos()));
    const boton = await page.evaluate(() => { const b = document.getElementById("sonido-btn"); return [b.checkVisibility(), b.getAttribute("aria-pressed"), b.textContent.trim()]; });
    cierto("el botón «Sonido» se ve y dice que está encendido", boton[0] && boton[1] === "true" && /Sonido$/.test(boton[2]), JSON.stringify(boton));
    await page.click("#sonido-btn");
    await page.evaluate(() => { window.Sonidos.historial.length = 0; });
    await page.click('[data-square="d4"]'); await page.click('[data-square="a4"]');
    await page.waitForTimeout(100);
    cierto("apagado, no suena nada", (await sonidos()).length === 0, JSON.stringify(await sonidos()));
    cierto("y el botón dice que está apagado, y se recuerda", await page.evaluate(() =>
      document.getElementById("sonido-btn").getAttribute("aria-pressed") === "false" && localStorage.getItem("sonidos_apagados_v1") === "1"));
    await page.context().close();

    ({ page } = await abrir(browser, "#capturar/2"));
    await page.evaluate(() => { window.Sonidos.historial.length = 0; });
    await page.click('[data-square="f4"]'); await page.click('[data-square="f7"]');
    await page.waitForTimeout(100);
    cierto("perder el nivel suena «fallo»", (await page.evaluate(() => window.Sonidos.historial[0])) === "fallo");
    await page.context().close();

    ({ page } = await abrir(browser));
    await page.evaluate(() => { window.Sonidos.historial.length = 0; });
    await page.click("#tarjeta-botones .primary");
    cierto("«¡Vamos!» suena el acorde de la etapa, solo", JSON.stringify(await page.evaluate(() => window.Sonidos.historial.slice())) === '["inicio-etapa"]');
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

    console.log("La clase en vivo cambia de nivel con el fragmento");
    ({ page } = await abrir(browser, "#torre/1"));
    await page.evaluate(() => { location.hash = "caballo/2"; });
    await page.waitForTimeout(300);
    cierto("#caballo/2 abre ese nivel sin recargar", /El caballo/.test(await page.textContent("#etapa-titulo"))
      && (await page.getAttribute('#aj-niveles [aria-current="step"]', "aria-label") || "").startsWith("Nivel 2"));
    await page.context().close();

    console.log("Dentro de la clase en vivo");
    ({ page } = await abrir(browser, "#torre/1"));
    await page.evaluate(() => {
      document.body.innerHTML = '<iframe id="marco" style="width:1200px;height:900px" src="/entreno/aprende-a-jugar.html?en-clase=1#torre/1"></iframe>';
    });
    await page.waitForFunction(() => { const d = document.getElementById("marco").contentDocument; return d && d.getElementById("app") && !d.getElementById("app").classList.contains("hidden") && d.getElementById("nivel-meta").textContent; }, null, { timeout: 20000 });
    const marco = page.frames().find((f) => /en-clase=1/.test(f.url()));
    const visto = await marco.evaluate(() => {
      const ve = (sel) => { const el = document.querySelector(sel); return !!el && el.checkVisibility(); };
      return { tablero: ve("#board"), meta: ve("#nivel-meta"), reintentar: ve("#btn-reintentar"), tarjeta: ve("#tarjeta"),
        resto: ["#aj-menu", "#aj-cabecera", "#aj-descripcion", ".mode-bar", "#aj-niveles", "#aj-puntos"].filter(ve) };
    });
    cierto("se ve el tablero, lo que pide el nivel y «Reintentar»", visto.tablero && visto.meta && visto.reintentar, JSON.stringify(visto));
    cierto("y nada más: ni menú, ni encabezado, ni descripción, ni modos, ni niveles, ni puntos", visto.resto.length === 0, JSON.stringify(visto.resto));
    cierto("sin la presentación de la etapa", !visto.tarjeta);
    await marco.click('[data-square="e2"]'); await marco.click('[data-square="e7"]');
    await page.waitForTimeout(1800);
    const tras = await marco.evaluate(() => [document.getElementById("aj-estado").textContent, document.getElementById("nivel-meta").textContent]);
    cierto("al ganar, espera el ejercicio del profe y no pasa solo al siguiente",
      /Espera el siguiente ejercicio de tu profe/.test(tras[0]) && /llévala hasta la estrella/.test(tras[1]), JSON.stringify(tras));
    await page.evaluate(() => { document.getElementById("marco").src = "/entreno/aprende-a-jugar.html?en-clase=1#torre/3"; });
    await page.waitForTimeout(500);
    cierto("el profe manda otro y se abre ese", /Cuantas menos jugadas/.test(await marco.textContent("#nivel-meta")));
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
