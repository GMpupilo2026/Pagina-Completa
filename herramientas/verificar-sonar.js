#!/usr/bin/env node
/* Comprueba El Sonar (sonar.html + js/sonar-motor.js).
 *
 * Es un juego que se juega SIN VER, así que lo que se rompe acá no se nota
 * mirando la pantalla: un sonar que miente se oye igual de bien que uno que
 * dice la verdad, y una casilla escrita que no se entiende deja a quien no ve
 * el tablero sin forma de jugar, sin ningún error a la vista.
 *
 * Dos partes:
 *   1. Sin navegador, las reglas: las distancias del caballo y del rey, que el
 *      tesoro SIEMPRE siga entre las casillas posibles según lo que dijo el
 *      sonar (si no, el sonar miente), que un jugador que solo deduce termine
 *      todas las partidas de los cuatro niveles, y que se entienda lo que se
 *      escribe ("eva 4", "félix ocho") y NO una letra suelta.
 *   2. En un navegador de verdad, la partida entera jugada ESCRIBIENDO, como la
 *      juega quien usa lector de pantalla: qué dice la región viva, qué dice
 *      cada casilla, que el tablero sea una sola parada de tabulador, que se
 *      guarden las estrellas, y que sin sesión mande a iniciarla.
 *
 * Uso:  python3 -m http.server 8777   (desde la raíz del sitio)
 *       npm install playwright
 *       node herramientas/verificar-sonar.js
 */
"use strict";
const path = require("path");
const S = require(path.join(__dirname, "..", "js", "sonar-motor.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + (a.length > 90 ? a.slice(0, 90) + "…" : a));
}
function cierto(nombre, cond, detalle) { igual(nombre + (detalle ? " (" + detalle + ")" : ""), !!cond, true); }

/* ------------------------------------------------------------ 1. las reglas */
function reglas() {
  console.log("\n— Las distancias —");
  const N = S.PIEZAS.n, K = S.PIEZAS.k;
  // Hechos conocidos del caballo, que no salen de la misma cuenta que se prueba.
  igual("caballo: a1 → b2 son 4 saltos (la diagonal de al lado es de las peores)", N.distancia("a1", "b2"), 4);
  igual("caballo: a1 → h8 son 6 saltos", N.distancia("a1", "h8"), 6);
  igual("caballo: e4 → e5, la casilla de al lado, son 3 saltos", N.distancia("e4", "e5"), 3);
  igual("caballo: e4 → f6 es un salto", N.distancia("e4", "f6"), 1);
  igual("rey: a1 → h8 son 7 pasos", K.distancia("a1", "h8"), 7);
  let simetrica = true, max = 0, una = true;
  S.TODAS.forEach((a) => S.TODAS.forEach((b) => {
    const d = N.distancia(a, b);
    if (d !== N.distancia(b, a)) simetrica = false;
    max = Math.max(max, d);
    // Coherencia con las jugadas: a distancia 1 ⇔ es un salto legal.
    if ((d === 1) !== (N.jugadas(a).indexOf(b) !== -1)) una = false;
  }));
  cierto("la distancia del caballo es simétrica", simetrica);
  igual("ninguna casilla queda a más de 6 saltos", max, 6);
  cierto("distancia 1 es exactamente un salto legal", una);

  console.log("\n— El sonar no miente, y se gana deduciendo —");
  S.NIVELES.forEach((n) => {
    let mentiras = 0, sinTerminar = 0, lejosMal = 0, jugadasTotal = 0, estrellas3 = 0;
    for (let semilla = 1; semilla <= 300; semilla++) {
      const g = S.nuevaPartida(n.id, semilla);
      const p = S.PIEZAS[g.pieza];
      if (g.tesoros.some((t) => t === g.inicio || p.distancia(g.inicio, t) < n.distanciaMin)) lejosMal++;
      let pasos = 0;
      while (!g.terminada && pasos < 80) {
        const cand = S.candidatas(g);
        if (cand && g.tesoros.some((t) => cand.indexOf(t) === -1)) mentiras++;
        const legales = S.jugadasLegales(g);
        let destino;
        if (cand && cand.length) {
          // Un jugador que DEDUCE: si ya sabe dónde está, va; si no, elige la
          // jugada que mejor parte las casillas posibles (la que deja el grupo
          // más grande lo más chico posible). Nunca mira el tesoro.
          const directas = legales.filter((s) => cand.indexOf(s) !== -1);
          if (cand.length === 1 && directas.length) destino = directas[0];
          else {
            // Lo primero, que el grupo más grande quede lo más chico posible;
            // a igualdad, acercarse a las casillas posibles. Sin eso el jugador
            // se queda yendo y viniendo entre dos casillas que no enseñan nada.
            let mejor = Infinity;
            legales.forEach((s) => {
              const grupos = {};
              let suma = 0;
              cand.forEach((c) => { const k = c === s ? "aqui" : p.distancia(s, c); grupos[k] = (grupos[k] || 0) + 1; suma += p.distancia(s, c); });
              const peor = Math.max.apply(null, Object.values(grupos)) - (cand.indexOf(s) !== -1 ? 0.5 : 0);
              const puntaje = peor * 100 + suma / cand.length;
              if (puntaje < mejor) { mejor = puntaje; destino = s; }
            });
          }
        } else {
          // Dos tesoros sin recoger ninguno: bajar el número del sonar.
          let mejor = Infinity;
          legales.forEach((s) => { const d = Math.min.apply(null, g.tesoros.map((t) => p.distancia(s, t))); if (d < mejor) { mejor = d; destino = s; } });
        }
        S.mover(g, destino);
        pasos++;
      }
      if (!g.terminada) sinTerminar++;
      jugadasTotal += g.jugadas;
      if (S.estrellas(g) === 3) estrellas3++;
    }
    igual("nivel " + n.id + ": el tesoro nace lejos de la salida (300 partidas)", lejosMal, 0);
    igual("nivel " + n.id + ": el tesoro nunca sale de las casillas posibles", mentiras, 0);
    igual("nivel " + n.id + ": deduciendo, se terminan las 300", sinTerminar, 0);
    console.log("      (promedio " + (jugadasTotal / 300).toFixed(1) + " jugadas, tres estrellas en " + estrellas3 + " de 300)");
    cierto("nivel " + n.id + ": las tres estrellas se pueden sacar jugando bien", estrellas3 > 150, estrellas3 + " de 300");
  });

  console.log("\n— Lo que se escribe —");
  igual("«e4»", S.leerCasilla("e4"), "e4");
  igual("«E4 »", S.leerCasilla("E4 "), "e4");
  igual("«eva 4», como lo dice el sitio", S.leerCasilla("eva 4"), "e4");
  igual("«félix ocho»", S.leerCasilla("félix ocho"), "f8");
  igual("«anna uno»", S.leerCasilla("anna uno"), "a1");
  igual("«e 4»", S.leerCasilla("e 4"), "e4");
  igual("«i9» no es una casilla", S.leerCasilla("i9"), null);
  const sueltas = "abcdefgh".split("").filter((l) => S.leerComando(l) !== null);
  igual("ninguna letra suelta de la a a la h es un comando", sueltas, []);
  igual("«historial»", S.leerComando("historial"), { cmd: "historial" });
  igual("«Dónde estoy»", S.leerComando("Dónde estoy"), { cmd: "donde" });
  igual("«nivel 3»", S.leerComando("nivel 3"), { cmd: "nivel", nivel: 3 });
  const g = S.nuevaPartida(2, 7);
  const r = S.mover(g, g.inicio === "a1" ? "b1" : "a1");
  igual("un salto imposible se rechaza sin mover nada", [r.ok, g.jugadas, g.pos === g.inicio], [false, 0, true]);
}

/* ------------------------------------------------------- 2. en el navegador */
const CON_SESION = `
(function () {
  window.sb = { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" } } } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, insert() { return this; }, upsert() { return this; },
                   update() { return this; }, single() { return Promise.resolve({ data: null, error: null }); },
                   then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
    rpc: () => ({ then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }) };
})();
`;
const SIN_SESION = CON_SESION.replace('session: { user: { id: "u-ana" } }', "session: null");

async function abrir(browser, ruta, cliente) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente || CON_SESION }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

// La región viva se vacía y se vuelve a llenar con un respiro: hay que esperar
// a que diga algo NUEVO, no leerla en el mismo instante.
async function escribir(page, texto) {
  await page.fill("#cmd-input", texto);
  await page.press("#cmd-input", "Enter");
  await page.waitForTimeout(150);
  return page.$eval("#aviso", (e) => e.textContent);
}

async function navegador() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n— Sin sesión —");
    {
      const { page, ctx } = await abrir(browser, "/sonar.html", SIN_SESION);
      await page.waitForTimeout(400);
      cierto("manda a iniciar sesión", /login\.html/.test(page.url()), page.url());
      await ctx.close();
    }

    console.log("\n— Una partida del rey, jugada escribiendo —");
    const { page, ctx, errores } = await abrir(browser, "/sonar.html");
    await page.waitForSelector("#app:not(.hidden)");
    await page.waitForTimeout(200);
    igual("el foco arranca en el recuadro donde se escribe", await page.evaluate(() => document.activeElement && document.activeElement.id), "cmd-input");
    const inicio = await page.$eval("#aviso", (e) => e.textContent);
    cierto("la región viva presenta el nivel y dice dónde empieza el rey", /Nivel 1/.test(inicio) && /empieza en (anna|bella|cesar|david|eva|felix|gustav|hector) \d/.test(inicio), inicio.slice(0, 120));
    igual("el aviso es una región viva con role=status y sin aria-live encima",
      await page.$eval("#aviso", (e) => [e.getAttribute("role"), e.getAttribute("aria-live")]), ["status", null]);
    igual("el recuadro se VE sin Modo Adaptado", await page.$eval("#cmd-form", (e) => e.checkVisibility()), true);

    const celdas = await page.$$eval("#board [data-square]", (cs) => [cs.length, cs.filter((c) => c.tabIndex === 0).length]);
    igual("64 casillas y UNA sola parada de tabulador", celdas, [64, 1]);

    // El tablero tiene que seguir siendo un TABLERO: 64 casillas cuadradas y
    // del mismo tamaño. Con las filas en `auto`, la del rey o la de un número
    // se estiraba y aplastaba a las demás — se veía mal y no fallaba nada.
    // Se mide lo que calcula el navegador, antes y después de moverse, porque
    // es al pintar una lectura cuando una fila crece.
    const medidas = () => page.$$eval("#board [data-square]", (cs) => {
      const rs = cs.map((c) => c.getBoundingClientRect());
      const alt = [...new Set(rs.map((r) => Math.round(r.height)))];
      const anc = [...new Set(rs.map((r) => Math.round(r.width)))];
      return { alturas: alt, anchos: anc, cuadradas: alt.length === 1 && anc.length === 1 && Math.abs(alt[0] - anc[0]) <= 1 };
    });
    const m0 = await medidas();
    cierto("al empezar, las 64 casillas son cuadradas e iguales", m0.cuadradas, JSON.stringify(m0));

    const est = await page.evaluate(() => ({ pos: partida.pos, t: partida.tesoros.slice(), pieza: partida.pieza }));
    // Una jugada imposible: la casilla más lejana del rey.
    const lejos = S.TODAS.filter((s) => S.PIEZAS.k.distancia(est.pos, s) >= 2)[0];
    const rech = await escribir(page, lejos);
    cierto("una jugada imposible se rechaza diciendo a dónde sí puede ir", /no llega a/.test(rech) && /Puede ir a/.test(rech), rech.slice(0, 90));
    igual("…y no cuenta como jugada", await page.$eval("#m-jugadas", (e) => e.textContent), "0");

    // El camino más corto al tesoro, escrito como lo dice el sitio: "eva 4".
    const hablar = (sq) => ({ a: "anna", b: "bella", c: "cesar", d: "david", e: "eva", f: "felix", g: "gustav", h: "hector" })[sq[0]] + " " + sq[1];
    const K = S.PIEZAS.k;
    let pos = est.pos, ultimo = "", primeraCasilla = null;
    while (pos !== est.t[0]) {
      const sig = K.jugadas(pos).filter((s) => K.distancia(s, est.t[0]) === K.distancia(pos, est.t[0]) - 1)[0];
      ultimo = await escribir(page, hablar(sig));
      if (!primeraCasilla && sig !== est.t[0]) {
        primeraCasilla = sig;
        const d = K.distancia(sig, est.t[0]);
        cierto("después de moverse, el sonar dice la distancia de verdad", new RegExp("Fuiste a " + hablar(sig) + "\\.").test(ultimo) && (d === 1 ? /¡a 1 paso!/.test(ultimo) : new RegExp("a " + d + " pasos").test(ultimo)), ultimo);
      }
      pos = sig;
      if (!primeraCasilla || pos === primeraCasilla) {
        const m1 = await medidas();
        cierto("después de moverse, las casillas siguen cuadradas e iguales", m1.cuadradas, JSON.stringify(m1));
      }
    }
    cierto("al llegar al tesoro lo dice, con las estrellas escritas", /¡Tesoro!/.test(ultimo) && /3 estrellas de 3/.test(ultimo), ultimo.slice(0, 140));
    if (primeraCasilla) {
      const et = await page.$eval('#board [data-square="' + primeraCasilla + '"]', (e) => e.getAttribute("aria-label"));
      cierto("la casilla por donde pasó recuerda qué marcó el sonar", /ya estuviste, el sonar marcó \d/.test(et), et);
    }
    igual("las estrellas quedan guardadas", await page.evaluate(() => JSON.parse(localStorage.getItem("sonar_estrellas_v1"))), { 1: 3 });
    igual("y la mejor marca, en jugadas", await page.evaluate(() => JSON.parse(localStorage.getItem("sonar_mejor_v1"))), { 1: K.distancia(est.pos, est.t[0]) });
    const hist = await escribir(page, "historial");
    cierto("«historial» repasa las lecturas, empezando por la salida", /^Historial del sonar\. Empezaste en /.test(hist), hist.slice(0, 90));
    const nivelBtn = await page.$eval("#niveles button[aria-pressed='true']", (b) => b.textContent);
    cierto("el botón del nivel dice las estrellas en palabras", /3 de 3 estrellas/.test(nivelBtn), nivelBtn);

    console.log("\n— Cambiar de nivel, y jugar con el tablero —");
    const n3 = await escribir(page, "nivel 3");
    cierto("«nivel 3» empieza la partida de dos tesoros", /Dos tesoros/.test(n3) && (await page.evaluate(() => partida.tesoros.length)) === 2, n3.slice(0, 80));
    const pista = await escribir(page, "pista");
    cierto("la pista con dos tesoros explica por qué todavía no puede contar", /dos tesoros/.test(pista), pista.slice(0, 80));
    const legal = await page.evaluate(() => SonarMotor.jugadasLegales(partida)[0]);
    await page.click('#board [data-square="' + legal + '"]');
    await page.waitForTimeout(150);
    igual("tocar una casilla con el ratón también mueve", await page.evaluate(() => [partida.pos, partida.jugadas]), [legal, 1]);
    // El teclado del tablero: la flecha mueve el foco de verdad.
    await page.focus("#board [tabindex='0']");
    const antes = await page.evaluate(() => document.activeElement.dataset.square);
    /* La casilla la elige el azar de la partida: en la columna h no hay «a la
       derecha» y la prueba fallaba sola una vez de cada tantas. */
    await page.keyboard.press(antes && antes[0] === "h" ? "ArrowLeft" : "ArrowRight");
    const despues = await page.evaluate(() => document.activeElement.dataset.square);
    cierto("la flecha mueve el foco a la casilla de al lado", antes !== despues && despues, antes + " → " + despues);
    const raro = await escribir(page, "hola");
    cierto("lo que no se entiende se dice", /No entendí/.test(raro), raro);

    console.log("\n— Que la página se vea —");
    igual("no hay CSS impreso como texto", await page.evaluate(() => /\{[^}]*:[^}]*\}/.test(document.body.innerText)), false);
    igual("sin errores en la consola", errores, []);
    await ctx.close();

    console.log("\n— Entrando desde el hub de Ciegos —");
    {
      const { page, ctx } = await abrir(browser, "/sonar.html?modo=ciego");
      await page.waitForSelector("#app:not(.hidden)");
      igual("?modo=ciego enciende el Modo Adaptado", await page.evaluate(() => document.documentElement.classList.contains("adaptive-mode")), true);
      igual("…y el tablero pasa a anunciarse como aplicación", await page.$eval("#board", (b) => b.getAttribute("role")), "application");
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  reglas();
  if (!process.argv.includes("--sin-navegador")) {
    try { await navegador(); }
    catch (e) { console.log("  ✗ el navegador no pudo correr: " + e.message); fallos++; }
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo en orden.");
  process.exit(fallos ? 1 : 0);
})();
