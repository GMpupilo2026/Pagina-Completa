/* Comprueba, en un navegador, «Tu mes en ajedrez» (js/tu-mes.js).

   - Logros lo pinta con el mes de hoy (en hora de Costa Rica), pide a la base
     ESE mes (entreno_mi_mes con p_mes = día 1), y deja ir a los meses de antes
     pero no a uno que todavía no llega. ?mes=AAAA-MM abre ese mes; uno del
     futuro, o que no es un mes, abre el de hoy.
   - Cada número va con lo que significa; lo que no hay no se dice. Un mes sin
     ejercicios lo dice y no ofrece compartir nada.
   - «Compartir mi mes» copia el texto (sin navigator.share) y avisa.
   - Lo que trae la base va como texto: una actividad que es un <img> no se pinta.
   - «Hoy te toca» avisa los primeros 7 días del mes del resumen del mes que
     pasó, y lleva a logros.html?mes=…#mes; después del día 7, o si el mes
     pasado no tuvo nada, no.

   Uso:  npm install; node herramientas/verificar-todo.js tu-mes           */
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir } = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function sinErrores(errores, pagina) {
  igual(`${pagina}: sin errores en la página`, errores.length ? errores.join(" | ") : "ninguno", "ninguno");
}

const SEPTIEMBRE = {
  mes: "2026-09", ejercicios: 876, dias_con_algo: 7, dias_activos: 6, racha_mejor: 2,
  mejor_dia: { dia: "2026-09-30", n: 378 }, con_como_salio: 457, limpios: 9, anterior: 300,
  por_actividad: { temas: 449, mates: 306, "4x4": 42, coordenadas: 33 },
};
const VACIO = { mes: "2026-10", ejercicios: 0, dias_con_algo: 0, dias_activos: 0, racha_mejor: 0, mejor_dia: null, con_como_salio: 0, limpios: 0, anterior: 876, por_actividad: {} };

// Un día fijo, en hora de Costa Rica. Solo el reloj: los temporizadores corren solos.
const aLas = (iso) => async (ctx) => {
  await ctx.clock.setFixedTime(new Date(iso));
  // Sin navigator.share (como en una computadora): se copia. El portapapeles queda anotado.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => { window.__copiado = t; return Promise.resolve(); } }, configurable: true });
  });
};

const leer = (page) => page.evaluate(() => ({
  titulo: document.getElementById("mes-titulo").textContent,
  lineas: Array.from(document.querySelectorAll("#mes-lineas li")).map((l) => l.textContent),
  compartir: document.getElementById("mes-compartir").checkVisibility(),
  antes: document.querySelector('#mes-body [data-mes="-1"]').disabled,
  despues: document.querySelector('#mes-body [data-mes="1"]').disabled,
}));
const pedidos = (page) => page.evaluate(() => (window.__rpcArgs || []).filter((a) => a[0] === "entreno_mi_mes").map((a) => a[1] && a[1].p_mes));

async function logros(browser) {
  console.log("\n=== Logros: «Tu mes en ajedrez» ===");
  const base = { "rpc:progreso_dias_y_racha": [{ racha_actual: 2, racha_record: 4, hoy_ejercicios: 3 }], "rpc:entreno_mi_mes": SEPTIEMBRE };
  {
    const { page, ctx, errores } = await abrir(browser, "/logros.html", base, null, aLas("2026-10-04T20:00:00-06:00"));
    await page.waitForFunction(() => document.querySelectorAll("#mes-lineas li").length > 0, null, { timeout: 15000 });
    let m = await leer(page);
    igual("abre el mes de hoy en Costa Rica (el 4 a las 8 p. m., en UTC ya es el 5)", m.titulo, "Tu octubre de 2026 en ajedrez");
    igual("y le pide a la base ese mes, desde el día 1", await pedidos(page), ["2026-10-01"]);
    igual("no deja ir a un mes que todavía no llega, sí a los de antes", [m.antes, m.despues], [false, true]);
    igual("cada número dice lo que es", m.lineas, [
      "876 ejercicios en 7 días de práctica.",
      "6 días contaron para la racha (5 o más ejercicios), con una racha de 2 días seguidos.",
      "576 más que el mes anterior (300).",
      "2 % salieron sin error ni pista (de 457 que lo dicen).",
      "Lo más entrenado: Ejercicios por tema (449), Mates (306), Ejercicios 4×4 (42).",
      "El mejor día: el miércoles 30, con 378 ejercicios.",
    ]);
    await page.click('#mes-body [data-mes="-1"]');
    await page.waitForFunction(() => /septiembre/.test(document.getElementById("mes-titulo").textContent));
    m = await leer(page);
    igual("‹ va al mes anterior y lo pide", [m.titulo, (await pedidos(page)).pop(), m.despues], ["Tu septiembre de 2026 en ajedrez", "2026-09-01", false]);
    // Compartir: sin navigator.share, se copia y se avisa.
    await page.click("#mes-compartir");
    await page.waitForFunction(() => document.getElementById("mes-msg").textContent);
    const copiado = await page.evaluate(() => [window.__copiado, document.getElementById("mes-msg").textContent]);
    igual("«Compartir mi mes» copia el resumen con su título", copiado[0].split("\n").slice(0, 2),
      ["♟️ Mi septiembre de 2026 en ajedrez (Ajedrez Integral)", "• 876 ejercicios en 7 días de práctica."]);
    igual("y avisa que lo copió", copiado[1], "Copiado: ya lo puedes pegar en un mensaje.");
    sinErrores(errores, "logros");
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/logros.html?mes=2026-08", base, null, aLas("2026-10-04T12:00:00-06:00"));
    await page.waitForFunction(() => document.querySelectorAll("#mes-lineas li").length > 0, null, { timeout: 15000 });
    igual("?mes=2026-08 abre agosto", [(await leer(page)).titulo, await pedidos(page)], ["Tu agosto de 2026 en ajedrez", ["2026-08-01"]]);
    await ctx.close();
  }
  for (const malo of ["2027-01", "2026-13", "x"]) {
    const { page, ctx } = await abrir(browser, "/logros.html?mes=" + malo, base, null, aLas("2026-10-04T12:00:00-06:00"));
    await page.waitForFunction(() => document.querySelectorAll("#mes-lineas li").length > 0, null, { timeout: 15000 });
    igual(`?mes=${malo} (futuro o no es un mes) abre el de hoy`, (await leer(page)).titulo, "Tu octubre de 2026 en ajedrez");
    await ctx.close();
  }
  {
    const { page, ctx, errores } = await abrir(browser, "/logros.html", Object.assign({}, base, { "rpc:entreno_mi_mes": VACIO }), null, aLas("2026-10-04T12:00:00-06:00"));
    await page.waitForFunction(() => document.querySelectorAll("#mes-lineas li").length > 0, null, { timeout: 15000 });
    const m = await leer(page);
    igual("un mes sin ejercicios lo dice y no ofrece compartir", [m.lineas, m.compartir],
      [["Este mes todavía no tiene ejercicios. Con 5 en un día, ese día ya cuenta."], false]);
    sinErrores(errores, "logros (mes vacío)");
    await ctx.close();
  }
  {
    // Lo que trae la base va como texto, también el nombre de una actividad.
    const raro = Object.assign({}, SEPTIEMBRE, { anterior: 0, con_como_salio: 0, mejor_dia: null, por_actividad: { "<img src=x onerror=window.__xss=1>": 5 } });
    const { page, ctx, errores } = await abrir(browser, "/logros.html", Object.assign({}, base, { "rpc:entreno_mi_mes": raro }), null, aLas("2026-10-04T12:00:00-06:00"));
    await page.waitForFunction(() => document.querySelectorAll("#mes-lineas li").length > 0, null, { timeout: 15000 });
    const r = await page.evaluate(() => [document.querySelectorAll("#mes-lineas img").length, window.__xss || 0,
      Array.from(document.querySelectorAll("#mes-lineas li")).map((l) => l.textContent)]);
    igual("una actividad que es un <img> se escribe, no se pinta", [r[0], r[1]], [0, 0]);
    igual("sin mes anterior lo dice, y sin «cómo salió» no inventa un porcentaje", r[2].slice(1, 3),
      ["6 días contaron para la racha (5 o más ejercicios), con una racha de 2 días seguidos.", "El mes anterior no hubo ejercicios: este es el primero."]);
    igual("ni una línea de porcentaje", r[2].some((l) => /%/.test(l)), false);
    sinErrores(errores, "logros (texto ajeno)");
    await ctx.close();
  }
}

async function hub(browser) {
  console.log("\n=== «Hoy te toca»: el aviso de los primeros días del mes ===");
  const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: "2026-10-01T00:00:00Z" }) };
  const tablas = (mes) => ({ "rpc:progreso_dias_y_racha": [{ hoy_ejercicios: 0, racha_actual: 0 }], "rpc:entreno_mi_mes": mes });
  const aviso = async (cuando, mes) => {
    const { page, ctx, errores } = await abrir(browser, "/entreno/index.html", tablas(mes), fresco, aLas(cuando));
    await page.waitForFunction(() => !document.getElementById("hoy-meta").hidden, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const a = document.getElementById("hoy-mes"); return a.checkVisibility() ? [a.textContent, a.getAttribute("href")] : null; });
    const p = await pedidos(page);
    sinErrores(errores, "hub (" + cuando.slice(0, 10) + ")");
    await ctx.close();
    return [r, p];
  };
  let [r, p] = await aviso("2026-10-04T12:00:00-06:00", SEPTIEMBRE);
  igual("el 4 de octubre avisa del resumen de septiembre y lleva a Logros", r,
    ["📅 Tu septiembre en ajedrez: 876 ejercicios en 7 días. Míralo y compártelo →", "../logros.html?mes=2026-09#mes"]);
  igual("y pidió septiembre", p, ["2026-09-01"]);
  [r, p] = await aviso("2026-10-12T12:00:00-06:00", SEPTIEMBRE);
  igual("el 12 ya no avisa, ni le pide nada a la base", [r, p], [null, []]);
  [r] = await aviso("2026-10-04T12:00:00-06:00", Object.assign({}, VACIO, { mes: "2026-09" }));
  igual("si el mes que pasó no tuvo nada, no avisa", r, null);
  // El 1 de enero, el mes que pasó es diciembre del año anterior.
  [r, p] = await aviso("2027-01-01T12:00:00-06:00", Object.assign({}, SEPTIEMBRE, { mes: "2026-12" }));
  igual("el 1 de enero pide diciembre del año anterior", [p, r && r[1]], [["2026-12-01"], "../logros.html?mes=2026-12#mes"]);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await logros(browser);
    await hub(browser);
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
