/* Comprueba, en un navegador de verdad, el reloj de práctica de la clase en vivo
   (js/clase-reloj.js, RelojPractica): las situaciones de jugada ilegal, en las
   que el asesor detiene el reloj, entra a corrección y deja tiempos y jugadas
   como dicen las Leyes de la FIDE.

   Existe porque lo que se rompe acá no da ningún error: si «Comprobar» diera
   por buena cualquier corrección, o comparara contra el tiempo equivocado, el
   reto se vería perfecto y enseñaría mal la regla. Monta el reloj solo (sin la
   clase ni Supabase) y lo maneja con sus propios botones, dentro del Shadow
   DOM, como lo haría una persona.

   Lo que revisa:
   1. Cada situación arranca CORRIENDO, con el control y los tiempos de su
      enunciado, y las blancas a la izquierda.
   2. «Comprobar» sin detener el reloj no la da por buena.
   3. Detener y no tocar nada, cuando hay que sumar tiempo: no es buena.
   4. Sumarle el tiempo a quien hizo la ilegal: no es buena, y lo dice.
   5. La corrección justa (con el reloj corriendo después, a ×60) sí, y queda
      marcada como lograda y guardada en el aparato.
   6. Por períodos: con los tiempos bien pero el contador sin corregir, no.
   7. Segunda ilegal: sumar tiempo está mal; dejarlo como está, bien.
   8. Los datos de las situaciones cumplen la forma que exige la base. */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

let fallos = 0;
const ok = (cond, texto) => { console.log((cond ? "  ✓ " : "  ✗ ") + texto); if (!cond) fallos++; };

const CODIGO = fs.readFileSync(path.join(__dirname, "..", "js", "clase-reloj.js"), "utf8");

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  // Una página servida de mentira (no about:blank): sin origen no hay localStorage.
  await page.route("http://reloj.test/", (ruta) => ruta.fulfill({ contentType: "text/html; charset=utf-8",
    body: '<!doctype html><meta charset="utf-8"><div id="host"></div>' }));
  await page.goto("http://reloj.test/");
  await page.addScriptTag({ content: CODIGO });

  const montar = async () => page.evaluate(() => {
    localStorage.clear();
    const host = document.getElementById("host");
    if (window.__reloj) window.__reloj.destruir();
    host.replaceChildren();
    const nuevo = document.createElement("div"); host.appendChild(nuevo);
    window.__reloj = RelojPractica.montar(nuevo, { clave: "prueba-reloj" });
    window.__reloj.cargar({ modo: "fischer", base: 900, inc: 10, dly: 0, mv: 40, add: 0 });
    window.__raiz = nuevo.shadowRoot;
  });
  const r = (nombre) => page.evaluate((n) => !!window.__raiz.querySelector('[data-r="' + n + '"]'), nombre);
  const clic = (nombre) => page.evaluate((n) => window.__raiz.querySelector('[data-r="' + n + '"]').click(), nombre);
  // − y + responden a pointerdown (para poder mantenerlos); por teclado, a Enter.
  const tecla = (nombre, veces) => page.evaluate(([n, v]) => {
    const b = window.__raiz.querySelector('[data-r="' + n + '"]');
    for (let i = 0; i < v; i++) b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }, [nombre, veces]);
  const empezar = (i) => page.evaluate((k) => window.__raiz.querySelectorAll('[data-r="ilegales"] li button')[k].click(), i);
  const veredicto = () => page.evaluate(() => ({ texto: window.__raiz.querySelector('[data-r="veredictoI"]').textContent,
    clase: window.__raiz.querySelector('[data-r="veredictoI"]').className }));
  // La pantalla y la guía se repintan cada 50 ms (el ciclo del reloj): se leen después de un ciclo.
  const lectura = async () => { await page.waitForTimeout(120); return page.evaluate(() => window.__raiz.querySelector('[data-r="lectura"]').textContent); };
  const estado = async () => { await page.waitForTimeout(120); return page.evaluate(() => window.__raiz.querySelector('[data-r="estado"]').textContent); };
  const comprobar = async () => { await clic("comprobar"); return veredicto(); };
  // Corrección: ✓ entra; luego 8 pasos (LH LM LS Lmv RH RM RS Rmv), cada uno con − / + y ✓.
  // ajustes: { paso: cantidad } (positivo +, negativo −).
  const corregir = async (ajustes) => {
    await clic("ok");
    for (let p = 0; p < 8; p++) {
      const a = ajustes[p] || 0;
      if (a) await tecla(a > 0 ? "mas" : "menos", Math.abs(a));
      await clic("ok");
    }
  };
  const P = { LH: 0, LM: 1, LS: 2, Lmv: 3, RH: 4, RM: 5, RS: 6, Rmv: 7 };

  await montar();
  const ILEGALES = await page.evaluate(() => RelojPractica.ILEGALES);
  ok(ILEGALES.length >= 6, `hay al menos seis situaciones de jugada ilegal (${ILEGALES.length})`);
  ok(await r("ilegales") && await r("comprobar"), "la tarjeta de jugada ilegal está en el reloj");

  // 8. Forma de los datos.
  const formas = await page.evaluate(() => RelojPractica.ILEGALES.every((x) => RelojPractica.validoControl(x.control)
    && x.t.length === 2 && x.mv.length === 2 && (x.corre === 0 || x.corre === 1) && x.delta.length === 2
    && x.t.every((s) => Number.isInteger(s) && s > 0) && typeof x.regla === "string" && /art\.|Anexo/.test(x.regla)));
  ok(formas, "cada situación trae un control válido para la base, tiempos, quién corre, lo que cambia y su regla con el artículo");

  // 1 y 2. Situación 1 (clásica, ilegal de las negras: corre el de las blancas).
  await empezar(0);
  ok((await estado()).startsWith("En marcha · juegan las blancas"), `la situación 1 arranca con el reloj de las blancas corriendo (${await estado()})`);
  ok(/#24.*#24/.test(await lectura()), `con los contadores del enunciado (${await lectura()})`);
  ok(await page.evaluate(() => !window.__raiz.querySelector('[data-r="situacion"]').hidden), "se ve el enunciado de la situación");
  let v = await comprobar();
  ok(/detén el reloj/i.test(v.texto) && /alerta/.test(v.clase), `«Comprobar» con el reloj corriendo pide detenerlo: «${v.texto}»`);

  // 3. Detener y no tocar.
  await clic("marcha");
  v = await comprobar();
  ok(/quedó igual/.test(v.texto) && /alerta/.test(v.clase), `detenerlo sin sumar nada no es bueno: «${v.texto}»`);

  // 4. Sumar al infractor (negras, a la derecha): +2 min.
  await corregir({ [P.RM]: 2 });
  v = await comprobar();
  ok(/hicieron la ilegal/.test(v.texto) && /alerta/.test(v.clase), `sumarle a quien hizo la ilegal no es bueno, y lo dice: «${v.texto}»`);

  // 5. La corrección justa, y después el reloj sigue corriendo rápido.
  await empezar(0);
  await page.waitForTimeout(150);
  await clic("marcha");
  await corregir({ [P.LM]: 2 });
  await page.evaluate(() => window.__raiz.querySelector('[data-r="velocidad"] button[data-v="60"]').click());
  await clic("marcha");
  await page.waitForTimeout(400);
  v = await comprobar();
  ok(/^¡Bien!/.test(v.texto) && /7\.5\.5/.test(v.texto) && /ok/.test(v.clase), `+2:00 a las blancas es lo justo (aunque el reloj siga corriendo): «${v.texto.slice(0, 60)}…»`);
  const marcada = await page.evaluate(() => window.__raiz.querySelector('[data-r="ilegales"] li').className);
  ok(/\bok\b/.test(marcada), "la situación 1 queda marcada como lograda");
  const guardado = await page.evaluate(() => localStorage.getItem("prueba-reloj:ilegal"));
  ok(guardado === "[0]", `y queda guardada en el aparato (${guardado})`);
  await page.evaluate(() => window.__raiz.querySelector('[data-r="velocidad"] button[data-v="1"]').click());

  // Rápida: +1 min, no +2.
  await empezar(1);
  await clic("marcha");
  await corregir({ [P.RM]: 2 });
  v = await comprobar();
  ok(/alerta/.test(v.clase), `en rápidas, +2:00 no es bueno: «${v.texto}»`);
  await empezar(1);
  await clic("marcha");
  await corregir({ [P.RM]: 1 });
  v = await comprobar();
  ok(/^¡Bien!/.test(v.texto) && /A\.4\.2/.test(v.texto), `en rápidas, +1:00 al rival sí: «${v.texto.slice(0, 60)}…»`);

  // 6. Por períodos: hay que bajar el contador de las negras.
  const iPer = ILEGALES.findIndex((x) => x.mv2);
  ok(iPer >= 0, "hay una situación donde importa el contador de jugadas");
  await empezar(iPer);
  await clic("marcha");
  await corregir({ [P.LM]: 2 });
  v = await comprobar();
  ok(/contador de jugadas/.test(v.texto) && /alerta/.test(v.clase), `con los tiempos bien y el contador sin corregir, no: «${v.texto}»`);
  await empezar(iPer);
  await clic("marcha");
  await corregir({ [P.LM]: 2, [P.Rmv]: -1 });
  v = await comprobar();
  ok(/^¡Bien!/.test(v.texto), `con +2:00 y el contador de las negras en 37, sí: «${v.texto.slice(0, 60)}…»`);
  ok(/#38.*#37/.test(await lectura()), `la pantalla muestra los contadores corregidos (${await lectura()})`);

  // 7. Segunda ilegal: no se suma tiempo.
  const iSeg = ILEGALES.findIndex((x) => x.delta[0] === 0 && x.delta[1] === 0);
  ok(iSeg >= 0, "hay una situación de segunda ilegal, sin tiempo que sumar");
  await empezar(iSeg);
  await clic("marcha");
  await corregir({ [P.RM]: 1 });
  v = await comprobar();
  ok(/No hay que sumar tiempo/.test(v.texto), `en la segunda ilegal, sumar tiempo está mal: «${v.texto}»`);
  await empezar(iSeg);
  await clic("marcha");
  v = await comprobar();
  ok(/^¡Bien!/.test(v.texto) && /pierde/.test(v.texto), `detener y dejarlo como está, sí (y dice que pierde): «${v.texto.slice(0, 60)}…»`);

  // Cargar un escenario quita la situación en curso.
  await empezar(2);
  await clic("marcha");
  await page.evaluate(() => window.__raiz.querySelector(".escenario").click());
  ok(await page.evaluate(() => window.__raiz.querySelector('[data-r="situacion"]').hidden), "cargar un escenario quita la situación en curso");

  ok(errores.length === 0, "sin errores en la página" + (errores.length ? ": " + errores.join(" | ") : ""));
  await nav.close();
  console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
