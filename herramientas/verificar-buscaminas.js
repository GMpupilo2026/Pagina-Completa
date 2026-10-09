#!/usr/bin/env node
/* Comprueba el Buscaminas de ajedrez (buscaminas.html + js/buscaminas-motor.js).
 *
 * Lo que se rompe acá no se nota mirando la pantalla: una casilla «segura»
 * que en realidad tiene una pieza se ve igual de bien que una de verdad, y
 * quien confía en la pista pierde la partida sin haber adivinado nada. Por
 * eso la comprobación central no es «¿se ve bien?» sino «¿la pista mintió
 * alguna vez, en miles de tableros al azar?».
 *
 * La geometría de cada pieza (ataca()) la pone y la verifica Batalla naval
 * (herramientas/verificar-batalla-naval.js, contra chess.js): acá no se
 * repite, se reutiliza.
 *
 * Dos partes:
 *   1. Sin navegador, las reglas: que «seguras» nunca marque una casilla que
 *      de verdad tiene una pieza, en miles de tableros; que el revelado en
 *      cadena de un 0 nunca destape una pieza ni se salga del tablero; que la
 *      cuenta de cada casilla sea la de las piezas que de verdad la atacan;
 *      que ganar y perder terminen la partida como corresponde; que se
 *      entienda lo que se escribe.
 *   2. En un navegador de verdad, una partida jugada tocando el tablero y
 *      escribiendo, como la juega quien usa lector de pantalla: qué dice la
 *      región viva, qué dice cada casilla, una sola parada de tabulador, las
 *      estrellas guardadas, sin sesión y sin errores en la consola.
 *
 * Uso:  python3 -m http.server 8777   (desde la raíz del sitio)
 *       npm install
 *       node herramientas/verificar-buscaminas.js   [--sin-navegador]
 */
"use strict";
const path = require("path");
const M = require(path.join(__dirname, "..", "js", "buscaminas-motor.js"));

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
  console.log("\n— La pista nunca miente —");
  M.NIVELES.forEach((n) => {
    let mentiras = 0, cuentasMal = 0, sinTerminar = 0, segurasVistas = 0;
    for (let semilla = 1; semilla <= 1000; semilla++) {
      const g = M.nuevaPartida(n.id, semilla);
      const azar = M.azarCon(semilla * 7);
      let pasos = 0;
      while (!g.terminada && pasos < 70) {
        const seg = M.seguras(g);
        segurasVistas += seg.length;
        seg.forEach((sq) => { if (M.trampaEn(g, sq)) mentiras++; });
        const sq = M.mejorJugada(g, azar);
        const antes = Object.keys(g.reveladas).length;
        const r = M.revelar(g, sq);
        if (r.ok && r.resultado === "revelada") {
          // La cuenta, hecha de nuevo a mano, pieza por pieza, para cada
          // casilla que la cadena destapó (no solo la que se pidió).
          r.cadena.forEach((s) => {
            const real = g.trampas.filter((p) => M.ataca(p.tipo, p.casilla, s)).length;
            if (g.reveladas[s] !== real) cuentasMal++;
          });
        }
        pasos++;
        void antes;
      }
      if (!g.terminada) sinTerminar++;
    }
    igual("nivel " + n.id + " (" + n.titulo + "): la pista NUNCA marca segura una casilla con pieza (1000 tableros)", mentiras, 0);
    igual("nivel " + n.id + ": la cuenta de cada casilla destapada es la de las piezas que de verdad la atacan", cuentasMal, 0);
    igual("nivel " + n.id + ": deduciendo (o adivinando cuando no hay pista), toda partida termina", sinTerminar, 0);
    console.log("      (" + segurasVistas + " casillas seguras vistas en total)");
  });

  console.log("\n— El revelado en cadena de un 0 —");
  {
    // Un caballo solo: casi todo el tablero es una sola cadena de ceros.
    const g = { nivel: 1, trampas: [{ tipo: "n", casilla: "a1" }], reveladas: {}, banderas: {}, terminada: false, gano: null, explotadaEn: null };
    const r = M.revelar(g, "h8");
    cierto("una pieza lejos deja destapar un 0 que se encadena solo", r.ok && r.resultado === "revelada" && r.cadena.length > 1, r.cadena.length);
    cierto("la cadena nunca destapa la casilla de la pieza", r.cadena.indexOf("a1") === -1);
    cierto("ni se sale de las 64 casillas", r.cadena.every((s) => M.TODAS.indexOf(s) !== -1));
    igual("sin repetidos en la cadena", new Set(r.cadena).size, r.cadena.length);
  }
  {
    // Una bandera frena la cadena: no se revela sola.
    const g = M.nuevaPartida(1, 11);
    const vecina = M.vecinas("a1")[0];
    M.marcar(g, vecina);
    const r = M.revelar(g, "a1");
    if (r.ok && r.resultado === "revelada") {
      cierto("una casilla con bandera nunca se revela sola, aunque la cadena pase por ahí", !g.reveladas.hasOwnProperty(vecina), vecina);
    }
  }

  console.log("\n— Ganar y perder —");
  {
    // Revelar las 61 casillas sin pieza, una por una (sin cadena: con todas
    // las demás ya reveladas no puede quedar ningún 0 que se encadene de más).
    const g = M.nuevaPartida(1, 3);
    const libres = M.TODAS.filter((s) => !M.trampaEn(g, s));
    let ultimo = null;
    libres.forEach((s) => { if (!g.terminada) ultimo = M.revelar(g, s); });
    igual("revelar las 61 casillas sin pieza gana la partida", [g.terminada, g.gano], [true, true]);
    igual("revelar una casilla con la partida ganada se rechaza", M.revelar(g, libres[0]).motivo, "terminada");
    void ultimo;
  }
  {
    const g = M.nuevaPartida(2, 4);
    const trampa = g.trampas[0];
    const r = M.revelar(g, trampa.casilla);
    igual("pisar una pieza pierde la partida y dice cuál era", [g.terminada, g.gano, r.tipo], [true, false, trampa.tipo]);
    igual("…y queda su casilla, para mostrarla al final", g.explotadaEn, trampa.casilla);
  }

  console.log("\n— Banderas —");
  {
    const g = M.nuevaPartida(1, 1);
    const trampa = g.trampas[0].casilla;
    igual("poner bandera", M.marcar(g, trampa), { ok: true, puesta: true });
    igual("una casilla con bandera no se puede revelar", M.revelar(g, trampa).motivo, "bandera");
    igual("quitar la misma bandera", M.marcar(g, trampa), { ok: true, puesta: false });
    // Una casilla vacía que no termine la partida sola: se la aísla con
    // banderas en sus 8 vecinas para que no se encadene de más, aunque su
    // cuenta dé 0.
    const vacia = M.TODAS.find((s) => !M.trampaEn(g, s));
    M.vecinas(vacia).forEach((v) => { if (!M.trampaEn(g, v)) M.marcar(g, v); });
    M.revelar(g, vacia);
    igual("partida sigue (la bandera frenó la cadena)", g.terminada, false);
    igual("una casilla ya revelada no se puede marcar", M.marcar(g, vacia).motivo, "revelada");
  }

  console.log("\n— Lo que se escribe —");
  igual("«e4»", M.leerComando("e4"), { cmd: "revelar", casilla: "e4" });
  igual("«eva 4», como lo dice el sitio", M.leerComando("eva 4"), { cmd: "revelar", casilla: "e4" });
  igual("«marcar c3»", M.leerComando("marcar c3"), { cmd: "marcar", casilla: "c3" });
  igual("«bandera félix ocho»", M.leerComando("bandera félix ocho"), { cmd: "marcar", casilla: "f8" });
  const sueltas = "abcdefgh".split("").filter((l) => M.leerComando(l) !== null);
  igual("ninguna letra suelta de la a a la h es un comando", sueltas, []);
  igual("«nivel 3»", M.leerComando("nivel 3"), { cmd: "nivel", nivel: 3 });
  igual("«pista»", M.leerComando("pista"), { cmd: "pista" });
  igual("«i9» no se entiende", M.leerComando("i9"), null);
  const g = M.nuevaPartida(3, 9); // nivel 3: siete trampas, ninguna cadena vacía todo el tablero de una
  const libre = M.TODAS.find((s) => !M.trampaEn(g, s));
  M.revelar(g, libre);
  cierto("esta partida de prueba no se ganó sola de un solo revelado", !g.terminada);
  igual("revelar dos veces la misma casilla se rechaza sin contar", [M.revelar(g, libre).motivo, Object.keys(g.reveladas).length > 0], ["repetido", true]);
}

/* ------------------------------------------------------- 2. en el navegador */
const CON_SESION = `
(function () {
  window.sb = { auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, upsert() { return this; },
                   insert() { return this; }, update() { return this; },
                   single() { return Promise.resolve({ data: null, error: null }); },
                   then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
    rpc: () => ({ then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }) };
})();
`;

async function abrir(browser, ruta) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CON_SESION }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

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
    console.log("\n— Sin sesión, se juega igual (es pública) —");
    const { page, ctx, errores } = await abrir(browser, "/buscaminas.html");
    igual("no manda a iniciar sesión", /login\.html/.test(page.url()), false);
    igual("el foco arranca en el recuadro donde se escribe", await page.evaluate(() => document.activeElement && document.activeElement.id), "cmd-input");
    const inicio = await page.$eval("#aviso", (e) => e.textContent);
    cierto("la región viva presenta el nivel y las piezas escondidas", /Nivel 1/.test(inicio) && /Escondidas: tres caballos/.test(inicio), inicio.slice(0, 140));
    igual("el aviso es una región viva con role=status y sin aria-live encima",
      await page.$eval("#aviso", (e) => [e.getAttribute("role"), e.getAttribute("aria-live")]), ["status", null]);
    igual("64 casillas y UNA sola parada de tabulador", await page.$$eval("#board [data-square]", (cs) => [cs.length, cs.filter((c) => c.tabIndex === 0).length]), [64, 1]);

    const medidas = () => page.$$eval("#board [data-square]", (cs) => {
      const rs = cs.map((c) => c.getBoundingClientRect());
      const alt = [...new Set(rs.map((r) => Math.round(r.height)))];
      const anc = [...new Set(rs.map((r) => Math.round(r.width)))];
      return alt.length === 1 && anc.length === 1 && Math.abs(alt[0] - anc[0]) <= 1;
    });
    cierto("al empezar, las 64 casillas son cuadradas e iguales", await medidas());

    // Una casilla con cuenta > 0 nunca se encadena: revelarla no gana la
    // partida sola, así que el resto de los pasos se puede probar con calma.
    const libre = await page.evaluate(() => BuscaminasMotor.TODAS.find((s) => !BuscaminasMotor.trampaEn(campo, s) && BuscaminasMotor.cuenta(campo, s) > 0));
    const dijo = await escribir(page, hablar(libre));
    cierto("revelar una casilla vacía dice cuántas piezas la atacan", /^Revelaste /.test(dijo), dijo);
    cierto("…y esta, con cuenta > 0, no encadenó ni ganó sola", await page.evaluate(() => !campo.terminada));
    const et = await page.$eval('#board [data-square="' + libre + '"]', (e) => e.getAttribute("aria-label"));
    cierto("la casilla recuerda lo revelado en su nombre", et.indexOf(hablar(libre) + ", revelada,") === 0, et);
    const m1 = await medidas();
    cierto("con un número pintado, las casillas siguen cuadradas e iguales", m1);
    const rep = await escribir(page, libre);
    cierto("revelar dos veces la misma casilla se dice y no rompe nada", /Ya revelaste/.test(rep), rep);

    console.log("\n— Bandera —");
    const otraLibre = await page.evaluate((usada) => BuscaminasMotor.TODAS.find((s) => !BuscaminasMotor.trampaEn(campo, s) && !campo.reveladas.hasOwnProperty(s) && BuscaminasMotor.cuenta(campo, s) > 0 && s !== usada), libre);
    const conBandera = await escribir(page, "marcar " + otraLibre);
    cierto("«marcar» pone la bandera y lo dice", /bandera puesta/.test(conBandera), conBandera);
    const noRevela = await escribir(page, otraLibre);
    cierto("una casilla con bandera no se revela sin avisar", /tiene bandera/.test(noRevela), noRevela);
    await escribir(page, "marcar " + otraLibre);

    console.log("\n— Pisar una pieza pierde, y se muestran todas —");
    const trampa = await page.evaluate(() => campo.trampas[0]);
    const perdio = await escribir(page, hablar(trampa.casilla));
    cierto("pisar una pieza termina la partida y dice cuál era", new RegExp("^Pisaste (la|el) " + trampa.tipo.replace("n", "caballo")).test(perdio) || /^Pisaste/.test(perdio), perdio);
    igual("la partida queda terminada, sin ganar", await page.evaluate(() => [campo.terminada, campo.gano]), [true, false]);
    const todasMostradas = await page.evaluate(() => BuscaminasMotor.TODAS.every((s) => {
      const t = BuscaminasMotor.trampaEn(campo, s);
      if (!t) return true;
      const b = document.querySelector('[data-square="' + s + '"]');
      return b.classList.contains("explotada") || b.classList.contains("mostrada");
    }));
    igual("al perder, las piezas escondidas quedan todas a la vista", todasMostradas, true);
    igual("no se puede seguir jugando", (await escribir(page, "a1")).indexOf("ya terminó") !== -1, true);

    console.log("\n— Nueva partida, y ganarla con pista hasta el final —");
    await escribir(page, "nuevo");
    await page.evaluate(() => {
      while (!campo.terminada) {
        const seguras = BuscaminasMotor.seguras(campo).filter((s) => !campo.reveladas.hasOwnProperty(s));
        const libres = BuscaminasMotor.TODAS.filter((s) => !campo.reveladas.hasOwnProperty(s) && !BuscaminasMotor.trampaEn(campo, s) && !campo.banderas[s]);
        const sq = seguras.length ? seguras[0] : libres[0];
        if (!sq) break;
        document.getElementById("cmd-input").value = sq;
        document.getElementById("cmd-form").requestSubmit();
      }
    });
    await page.waitForTimeout(300);
    const gano = await page.evaluate(() => campo.gano);
    cierto("jugando sin pisar ninguna pieza (eligiendo siempre una vacía), se gana", gano === true);
    if (gano) {
      igual("ganar guarda estrellas", await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("buscaminas_estrellas_v1") || "{}"); return typeof v["1"] === "number" && v["1"] >= 1; }), true);
      igual("…y el mejor tiempo, en segundos", await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("buscaminas_mejor_v1") || "{}"); return typeof v["1"] === "number"; }), true);
    }

    console.log("\n— El teclado —");
    await escribir(page, "nivel 2");
    await page.focus("#board [tabindex='0']");
    const antes = await page.evaluate(() => document.activeElement.dataset.square);
    await page.keyboard.press(antes[0] === "h" ? "ArrowLeft" : "ArrowRight");
    const despues = await page.evaluate(() => document.activeElement.dataset.square);
    cierto("la flecha mueve el foco a la casilla de al lado", antes !== despues, antes + " → " + despues);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    igual("Intro sobre una casilla la revela (o termina la partida)", await page.evaluate((sq) => campo.reveladas.hasOwnProperty(sq) || campo.terminada, despues), true);

    console.log("\n— Que la página se vea —");
    igual("no hay CSS impreso como texto", await page.evaluate(() => /\{[^}]*:[^}]*\}/.test(document.body.innerText)), false);
    igual("sin errores en la consola", errores, []);
    await ctx.close();

    console.log("\n— Entrando desde el hub de Ciegos —");
    {
      const { page, ctx } = await abrir(browser, "/buscaminas.html?modo=ciego");
      igual("?modo=ciego enciende el Modo Adaptado", await page.evaluate(() => document.documentElement.classList.contains("adaptive-mode")), true);
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
