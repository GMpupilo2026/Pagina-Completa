#!/usr/bin/env node
/* Comprueba la Batalla naval de ajedrez (batalla-naval.html + js/batalla-naval-motor.js).
 *
 * Lo que se rompe acá no se nota mirando la pantalla: un disparo que dice «2
 * piezas apuntan ahí» cuando apunta una se ve igual de bien que uno que dice
 * la verdad, y la partida se vuelve imposible de deducir sin ningún error.
 *
 * Dos partes:
 *   1. Sin navegador, las reglas: que «esta pieza apunta a esa casilla» sea lo
 *      mismo que dice chess.js en las 64 × 63 casillas de las cuatro piezas;
 *      que la pieza escondida NUNCA quede fuera de sus casillas posibles (si
 *      no, el disparo mintió); que un jugador que solo deduce hunda la flota
 *      en los tres niveles y pueda sacar tres estrellas; que la computadora del
 *      duelo no mire la flota escondida y se le pueda ganar; y que se entienda
 *      lo que se escribe.
 *   2. En un navegador de verdad, una partida jugada ESCRIBIENDO, como la juega
 *      quien usa lector de pantalla: qué dice la región viva, qué dice cada
 *      casilla, una sola parada de tabulador, las estrellas guardadas, el
 *      duelo, y que sin sesión mande a iniciarla.
 *
 * Uso:  python3 -m http.server 8777   (desde la raíz del sitio)
 *       npm install
 *       node herramientas/verificar-batalla-naval.js   [--sin-navegador]
 */
"use strict";
const path = require("path");
const B = require(path.join(__dirname, "..", "js", "batalla-naval-motor.js"));
const { Chess } = require("chess.js");

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

/* ------------------------------------------- chess.js, la vara de la geometría
   Una pieza blanca sola en `desde`, el rey negro en `hasta`, negras mueven:
   ¿está en jaque? El rey blanco va donde no estorbe: ni entre las dos, ni al
   lado del rey negro (lo atacaría él). */
function entre(a, b) {
  const c = (s) => s.charCodeAt(0) - 97, f = (s) => Number(s[1]);
  const dc = Math.sign(c(b) - c(a)), df = Math.sign(f(b) - f(a));
  const rectaODiagonal = c(a) === c(b) || f(a) === f(b) || Math.abs(c(a) - c(b)) === Math.abs(f(a) - f(b));
  const out = [];
  if (!rectaODiagonal) return out;
  let x = c(a) + dc, y = f(a) + df;
  while (x !== c(b) || y !== f(b)) { out.push(String.fromCharCode(97 + x) + y); x += dc; y += df; }
  return out;
}
function ataqueSegunChessJs(tipo, desde, hasta) {
  const lejos = B.TODAS.find((w) => w !== desde && w !== hasta && entre(desde, hasta).indexOf(w) === -1 &&
    Math.max(Math.abs(w.charCodeAt(0) - hasta.charCodeAt(0)), Math.abs(Number(w[1]) - Number(hasta[1]))) >= 2);
  const g = new Chess();
  g.clear();
  g.put({ type: tipo, color: "w" }, desde);
  g.put({ type: "k", color: "w" }, lejos);
  g.put({ type: "k", color: "b" }, hasta);
  const fen = g.fen().replace(" w ", " b ");
  if (!g.load(fen)) throw new Error("chess.js no cargó " + fen);
  return g.in_check();
}

/* ------------------------------------------------------------ 1. las reglas */
function reglas() {
  console.log("\n— La geometría, contra chess.js —");
  ["q", "r", "b", "n"].forEach((t) => {
    let distintas = 0, cuantas = 0;
    B.TODAS.forEach((s) => B.TODAS.forEach((x) => {
      if (s === x) return;
      cuantas++;
      if (B.ataca(t, s, x) !== ataqueSegunChessJs(t, s, x)) distintas++;
    }));
    igual(B.PIEZAS[t].nombre + ": coincide con chess.js en las " + cuantas + " parejas de casillas", distintas, 0);
  });
  igual("una pieza no se apunta a sí misma", B.ataca("q", "d4", "d4"), false);

  console.log("\n— El disparo no miente, y se gana deduciendo —");
  B.NIVELES.filter((n) => !n.duelo).forEach((n) => {
    let mentiras = 0, sinTerminar = 0, repetidos = 0, cuentasMal = 0, estrellas3 = 0;
    const tiros = [];
    for (let semilla = 1; semilla <= 300; semilla++) {
      const g = B.nuevaPartida(n.id, semilla);
      const azar = B.azarCon(semilla * 7);
      const vistas = {};
      let pasos = 0;
      while (!g.terminada && pasos < 64) {
        const k = B.conocimiento(g.mar);
        B.aFlote(g.mar).forEach((p) => { if (k.posibles[p.tipo].indexOf(p.casilla) === -1) mentiras++; });
        const sq = B.mejorDisparo(g.mar, azar, 0);
        if (vistas[sq]) repetidos++;
        vistas[sq] = true;
        const r = B.disparar(g, sq);
        // La cuenta, hecha de nuevo acá a mano, pieza por pieza.
        if (r.disparo.resultado === "agua" && r.disparo.cuenta !== g.mar.flota.filter((p) => B.ataca(p.tipo, p.casilla, sq)).length) cuentasMal++;
        pasos++;
      }
      if (!g.terminada) sinTerminar++;
      tiros.push(g.mar.disparos.length);
      if (B.estrellas(g) === 3) estrellas3++;
    }
    tiros.sort((a, b) => a - b);
    igual("nivel " + n.id + ": ninguna pieza sale de sus casillas posibles (300 partidas)", mentiras, 0);
    igual("nivel " + n.id + ": la cuenta de cada disparo es la de la flota entera", cuentasMal, 0);
    igual("nivel " + n.id + ": nunca se dispara dos veces a la misma casilla", repetidos, 0);
    igual("nivel " + n.id + ": deduciendo, se hunden las 300 flotas", sinTerminar, 0);
    console.log("      (mediana " + tiros[150] + " disparos; tres estrellas hasta " + n.estrellas3 + ", en " + estrellas3 + " de 300)");
    cierto("nivel " + n.id + ": las tres estrellas se pueden sacar jugando bien", estrellas3 > 200, estrellas3 + " de 300");
    cierto("nivel " + n.id + ": …pero no disparando a ciegas por todo el tablero", n.estrellas3 < 64 * 0.6);
  });

  console.log("\n— La pista —");
  {
    // Un 0 con solo una torre a flote despeja su fila y su columna enteras.
    const mar = { flota: [{ tipo: "r", casilla: "h8", hundida: false }], disparos: [] };
    B.dispararEn(mar, "a1");
    const k = B.conocimiento(mar);
    igual("tras un 0 en anna 1, la torre no puede estar en su fila ni su columna", ["a5", "e1"].map((s) => k.posibles.r.indexOf(s) !== -1), [false, false]);
    igual("…y esas 14 casillas quedan como agua segura", k.seguras.length, 14);
    const mar2 = { flota: [{ tipo: "n", casilla: "f6", hundida: false }], disparos: [] };
    B.dispararEn(mar2, "e4");
    igual("un 1 con solo el caballo a flote lo deja en sus 8 saltos", B.conocimiento(mar2).posibles.n.slice().sort(), ["c3", "c5", "d2", "d6", "f2", "f6", "g3", "g5"]);
  }

  console.log("\n— El duelo —");
  {
    // La computadora no mira la flota escondida: si se mueven las piezas que
    // siguen a flote a otras casillas sin disparar, con el mismo azar dispara
    // al mismo lugar.
    let mira = 0;
    for (let semilla = 1; semilla <= 60; semilla++) {
      const g = B.nuevaPartida(4, semilla);
      const azar = B.azarCon(semilla);
      for (let i = 0; i < 6 && !g.terminada; i++) B.turnoComputadora(g, azar);
      const copia = JSON.parse(JSON.stringify(g.miMar));
      const libres = B.TODAS.filter((s) => !B.disparoEn(copia, s) && !B.piezaEn(copia, s));
      B.aFlote(copia).forEach((p, i) => { p.casilla = libres[(semilla * 5 + i * 11) % libres.length]; });
      if (B.mejorDisparo(g.miMar, B.azarCon(99), 0.6) !== B.mejorDisparo(copia, B.azarCon(99), 0.6)) mira++;
    }
    igual("la computadora dispara igual aunque la flota escondida esté en otro lado", mira, 0);
    let gano = 0, largas = 0;
    for (let semilla = 1; semilla <= 200; semilla++) {
      const g = B.nuevaPartida(4, semilla);
      const azar = B.azarCon(semilla * 3);
      let turnos = 0;
      while (!g.terminada && turnos < 70) {
        B.disparar(g, B.mejorDisparo(g.mar, azar, 0));
        B.turnoComputadora(g, azar);
        turnos++;
      }
      if (!g.terminada) largas++;
      if (g.ganador === "yo") gano++;
    }
    igual("todos los duelos terminan", largas, 0);
    cierto("a la computadora se le gana jugando bien, pero no siempre", gano > 100 && gano < 180, gano + " de 200");
    const g = B.nuevaPartida(4, 5);
    const antes = JSON.stringify(g.miMar.flota);
    igual("«acomodar» cambia tu flota antes de empezar", B.acomodar(g, 77) && JSON.stringify(g.miMar.flota) !== antes, true);
    B.disparar(g, B.TODAS.find((s) => !B.piezaEn(g.mar, s)));
    igual("…y ya no, con la batalla empezada", B.acomodar(g, 78), false);
  }

  console.log("\n— Lo que se escribe —");
  igual("«e4»", B.leerComando("e4"), { cmd: "disparar", casilla: "e4" });
  igual("«eva 4», como lo dice el sitio", B.leerComando("eva 4"), { cmd: "disparar", casilla: "e4" });
  igual("«disparo a félix ocho»", B.leerComando("disparo a félix ocho"), { cmd: "disparar", casilla: "f8" });
  igual("«fuego en c3»", B.leerComando("fuego en c3"), { cmd: "disparar", casilla: "c3" });
  const sueltas = "abcdefgh".split("").filter((l) => B.leerComando(l) !== null);
  igual("ninguna letra suelta de la a a la h es un comando", sueltas, []);
  igual("«Mi flota»", B.leerComando("Mi flota"), { cmd: "mia" });
  igual("«nivel 4»", B.leerComando("nivel 4"), { cmd: "nivel", nivel: 4 });
  igual("«i9» no se entiende", B.leerComando("i9"), null);
  const g = B.nuevaPartida(1, 3);
  B.disparar(g, "a1");
  igual("un disparo repetido se rechaza sin contar", [B.disparar(g, "a1").motivo, g.mar.disparos.length], ["repetido", 1]);
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
const hablar = (sq) => ({ a: "anna", b: "bella", c: "cesar", d: "david", e: "eva", f: "felix", g: "gustav", h: "hector" })[sq[0]] + " " + sq[1];

async function navegador() {
  const { chromium } = require("./lib/playwright-con-sesion");
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n— Sin sesión —");
    {
      const { page, ctx } = await abrir(browser, "/batalla-naval.html", SIN_SESION);
      await page.waitForTimeout(400);
      cierto("manda a iniciar sesión", /login\.html/.test(page.url()), page.url());
      await ctx.close();
    }

    console.log("\n— Una partida del nivel 1, jugada escribiendo —");
    const { page, ctx, errores } = await abrir(browser, "/batalla-naval.html");
    await page.waitForSelector("#app:not(.hidden)");
    await page.waitForTimeout(200);
    igual("el foco arranca en el recuadro donde se escribe", await page.evaluate(() => document.activeElement && document.activeElement.id), "cmd-input");
    const inicio = await page.$eval("#aviso", (e) => e.textContent);
    cierto("la región viva presenta el nivel y la flota", /Nivel 1/.test(inicio) && /la torre, el alfil y el caballo/.test(inicio), inicio.slice(0, 120));
    igual("el aviso es una región viva con role=status y sin aria-live encima",
      await page.$eval("#aviso", (e) => [e.getAttribute("role"), e.getAttribute("aria-live")]), ["status", null]);
    igual("el recuadro se VE sin Modo Adaptado", await page.$eval("#cmd-form", (e) => e.checkVisibility()), true);
    igual("tu flota no se ve fuera del duelo", await page.$eval("#mi-zona", (e) => e.checkVisibility()), false);
    igual("64 casillas y UNA sola parada de tabulador", await page.$$eval("#board [data-square]", (cs) => [cs.length, cs.filter((c) => c.tabIndex === 0).length]), [64, 1]);

    const medidas = () => page.$$eval("#board [data-square]", (cs) => {
      const rs = cs.map((c) => c.getBoundingClientRect());
      const alt = [...new Set(rs.map((r) => Math.round(r.height)))];
      const anc = [...new Set(rs.map((r) => Math.round(r.width)))];
      return { alturas: alt, anchos: anc, cuadradas: alt.length === 1 && anc.length === 1 && Math.abs(alt[0] - anc[0]) <= 1 };
    });
    const m0 = await medidas();
    cierto("al empezar, las 64 casillas son cuadradas e iguales", m0.cuadradas, JSON.stringify(m0));

    const flota = await page.evaluate(() => partida.mar.flota.map((p) => ({ tipo: p.tipo, casilla: p.casilla })));
    const mar = { flota: flota.map((p) => Object.assign({ hundida: false }, p)), disparos: [] };
    const agua = B.TODAS.find((s) => !B.piezaEn(mar, s) && B.cuenta(mar, s) >= 2) || B.TODAS.find((s) => !B.piezaEn(mar, s));
    const n = B.cuenta(mar, agua);
    const dijo = await escribir(page, hablar(agua));
    cierto("un disparo al agua dice cuántas piezas apuntan ahí", new RegExp("Disparaste a " + hablar(agua) + "\\. Agua: " + n + " piezas apuntan ahí").test(dijo), dijo);
    const et = await page.$eval('#board [data-square="' + agua + '"]', (e) => e.getAttribute("aria-label"));
    igual("la casilla recuerda el disparo en su nombre", et, hablar(agua) + ", agua, " + n + " piezas apuntan ahí");
    const sinTiro = B.TODAS.find((s) => s !== agua);
    igual("una casilla sin disparar no dice «vacía»", await page.$eval('#board [data-square="' + sinTiro + '"]', (e) => e.getAttribute("aria-label")), hablar(sinTiro) + ", sin disparar");
    const m1 = await medidas();
    cierto("con un número pintado, las casillas siguen cuadradas e iguales", m1.cuadradas, JSON.stringify(m1));
    const rep = await escribir(page, agua);
    cierto("un disparo repetido se dice y no cuenta", /Ya disparaste a/.test(rep) && (await page.$eval("#m-disparos", (e) => e.textContent)) === "1", rep.slice(0, 80));

    let ultimo = "";
    for (let i = 0; i < flota.length; i++) {
      ultimo = await escribir(page, "disparo a " + flota[i].casilla);
      if (i === 0) {
        cierto("un disparo que da dice qué pieza se hundió", new RegExp("¡Hundido! Era (la|el) " + B.PIEZAS[flota[0].tipo].nombre).test(ultimo), ultimo);
        const vis = await page.$eval('#board [data-square="' + flota[0].casilla + '"]', (e, glifo) => [e.textContent.includes(glifo), getComputedStyle(e).backgroundColor], B.PIEZAS[flota[0].tipo].glifo);
        igual("…y la casilla se pinta hundida, con la pieza dibujada", vis, [true, "rgb(166, 27, 27)"]);
      }
    }
    cierto("al hundir la última, lo dice con las estrellas escritas", /Hundiste toda la flota con 4 disparos/.test(ultimo) && /3 estrellas de 3/.test(ultimo), ultimo.slice(0, 160));
    igual("las estrellas quedan guardadas", await page.evaluate(() => JSON.parse(localStorage.getItem("batalla_estrellas_v1"))), { 1: 3 });
    igual("y la mejor marca, en disparos", await page.evaluate(() => JSON.parse(localStorage.getItem("batalla_mejor_v1"))), { 1: 4 });
    const hist = await escribir(page, "historial");
    cierto("«historial» repasa los disparos", /^Tus disparos\. /.test(hist) && hist.indexOf(hablar(agua) + ": agua, " + n) !== -1, hist.slice(0, 90));
    const nivelBtn = await page.$eval("#niveles button[aria-pressed='true']", (b) => b.textContent);
    cierto("el botón del nivel dice las estrellas en palabras", /3 de 3 estrellas/.test(nivelBtn), nivelBtn);

    console.log("\n— La pista y el teclado —");
    await escribir(page, "nivel 2");
    await escribir(page, "a1");
    const pista = await escribir(page, "pista");
    cierto("la pista dice dónde puede estar cada pieza", /^Pista\. La dama puede estar en/.test(pista), pista.slice(0, 90));
    const seguras = await page.evaluate(() => BatallaNavalMotor.conocimiento(partida.mar).seguras);
    if (seguras.length) {
      igual("las casillas de agua segura quedan marcadas y dicho", await page.$eval('#board [data-square="' + seguras[0] + '"]', (e) => e.getAttribute("aria-label")), hablar(seguras[0]) + ", sin disparar, la pista dice que es agua segura");
    }
    await page.focus("#board [tabindex='0']");
    const antes = await page.evaluate(() => document.activeElement.dataset.square);
    await page.keyboard.press(antes[0] === "h" ? "ArrowLeft" : "ArrowRight");
    const despues = await page.evaluate(() => document.activeElement.dataset.square);
    cierto("la flecha mueve el foco a la casilla de al lado", antes !== despues, antes + " → " + despues);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    igual("Intro sobre una casilla dispara ahí", await page.evaluate((sq) => !!BatallaNavalMotor.disparoEn(partida.mar, sq), despues), true);

    console.log("\n— El duelo —");
    const d0 = await escribir(page, "nivel 4");
    cierto("el nivel 4 presenta el duelo", /Duelo contra la computadora/.test(d0), d0.slice(0, 80));
    igual("tu flota se ve", await page.$eval("#mi-zona", (e) => e.checkVisibility()), true);
    igual("…y el botón de acomodarla", await page.$eval("#btn-acomodar", (e) => e.checkVisibility()), true);
    const antesMia = await page.evaluate(() => JSON.stringify(partida.miMar.flota));
    const aco = await escribir(page, "acomodar");
    cierto("«acomodar» cambia tu flota y dice dónde quedó", /^Acomodaste tu flota/.test(aco) && (await page.evaluate(() => JSON.stringify(partida.miMar.flota))) !== antesMia, aco.slice(0, 80));
    const libre = await page.evaluate(() => BatallaNavalMotor.TODAS.find((s) => !BatallaNavalMotor.piezaEn(partida.mar, s)));
    const t1 = await escribir(page, libre);
    cierto("después de tu disparo, dice dónde disparó la computadora", /La computadora dispara a \S+ \d\./.test(t1), t1);
    igual("la computadora disparó una vez a tu flota", await page.evaluate(() => partida.miMar.disparos.length), 1);
    igual("ya no se puede acomodar", await page.$eval("#btn-acomodar", (e) => e.checkVisibility()), false);
    const mia = await escribir(page, "mi flota");
    cierto("«mi flota» dice dónde están tus piezas", /^Tu flota: la dama en /.test(mia), mia.slice(0, 80));

    const raro = await escribir(page, "hola");
    cierto("lo que no se entiende se dice", /No entendí/.test(raro), raro);

    console.log("\n— Que la página se vea —");
    igual("no hay CSS impreso como texto", await page.evaluate(() => /\{[^}]*:[^}]*\}/.test(document.body.innerText)), false);
    igual("sin errores en la consola", errores, []);
    await ctx.close();

    console.log("\n— Entrando desde el hub de Ciegos —");
    {
      const { page, ctx } = await abrir(browser, "/batalla-naval.html?modo=ciego");
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
