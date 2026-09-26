/* Comprueba entreno/tipos.html en un navegador de verdad: la ficha de los
 * Tipos de entrenamiento y los siete juegos, JUGADOS de punta a punta.
 *
 * Los bancos los comprueba herramientas/verificar-tipos.js sin navegador.
 * Esto es lo que solo se rompe mirando la pantalla:
 *   - sin sesión manda a iniciar sesión; con sesión, la ficha trae los siete
 *     tipos, cada uno con su encabezado y su enlace;
 *   - cada juego pinta LA posición de su ejercicio (se compara casilla por
 *     casilla contra la FEN del banco, no contra la página);
 *   - contestar bien da estrellas y queda guardado en la cuenta
 *     (tipos_estrellas_v1), contestar mal no;
 *   - Fotografía de verdad esconde las piezas mientras se reconstruye (se
 *     miden las piezas visibles, no la clase);
 *   - Con lo justo se juega ESCRIBIENDO las jugadas, como lo juega quien usa
 *     lector de pantalla, hasta dar mate, y el mate llega en el mínimo exacto
 *     jugando perfecto (las jugadas las elige la tabla de finales en Node).
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-tipos-pagina.js
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { Chess } = require("chess.js");
const R = require("../js/tipos-reglas.js");
const FinalesDTM = require("./lib/finales-dtm.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "entreno/data/tipos.json"), "utf8"));

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

/* El doble de Supabase: la sesión de un alumno y training_state, que es donde
   js/progreso-usuario.js guarda el avance (se anota lo que llega al upsert). */
function clienteFalso(conSesion) {
  return `
(function () {
  window.__escrituras = [];
  function tabla(nombre) {
    let filas = [];
    const api = {
      select() { return api; }, eq() { return api; }, in() { return api; }, order() { return api; }, limit() { return api; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      upsert(fila) { window.__escrituras.push({ tabla: nombre, fila }); return Promise.resolve({ error: null }); },
      insert(fila) { window.__escrituras.push({ tabla: nombre, fila }); return Promise.resolve({ error: null }); },
      then(res, rej) { return Promise.resolve({ data: filas, error: null }).then(res, rej); },
    };
    return api;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: ${conSesion ? '{ user: { id: "u-1" }, access_token: "t" }' : "null"} } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (n) => tabla(n),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); } }),
    removeChannel: () => {},
  };
})();
`;
}

async function abrir(browser, conSesion, hash) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(conSesion) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  await page.goto(BASE + "/entreno/tipos.html" + (hash || ""), { waitUntil: "domcontentloaded" });
  return { page, ctx, errores };
}

/* Lo que se VE en el tablero: casilla → pieza, leyendo las piezas pintadas
   (visibles de verdad), no el estado de la página. */
async function tableroVisto(page) {
  return page.$$eval("#tablero [data-square]", (celdas) => {
    const out = {};
    celdas.forEach((c) => {
      const sp = c.querySelector(".tp-pieza");
      if (sp && sp.checkVisibility({ visibilityProperty: true })) out[c.dataset.square] = (c.getAttribute("aria-label") || "").split(", ")[1] || "?";
    });
    return out;
  });
}
function ocupadasDe(fen) {
  const t = R.tablero(fen), s = [];
  t.forEach((p, i) => { if (p) s.push(R.sq(i)); });
  return s.sort().join(",");
}
async function mismaPosicion(page, fen, nombre) {
  const visto = await tableroVisto(page);
  ok(nombre, Object.keys(visto).sort().join(",") === ocupadasDe(fen), "se ve " + Object.keys(visto).sort().join(",") + "\n      esperaba " + ocupadasDe(fen));
}
async function estrellas(page) {
  return page.evaluate(() => { try { return JSON.parse(localStorage.getItem("tipos_estrellas_v1") || "{}"); } catch (e) { return {}; } });
}
async function estado(page) { return (await page.textContent("#estado")) || ""; }
async function esperarEstado(page, re) {
  await page.waitForFunction((src) => new RegExp(src).test(document.getElementById("estado").textContent), re.source, { timeout: 10000 }).catch(() => {});
  return estado(page);
}

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\n=== Sin sesión ===");
  {
    const { page, ctx } = await abrir(browser, false);
    await page.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {});
    ok("manda a login.html", /login\.html/.test(page.url()), page.url());
    await ctx.close();
  }

  console.log("\n=== La ficha ===");
  {
    const { page, ctx, errores } = await abrir(browser, true);
    await page.waitForSelector("#fichas li", { timeout: 15000 });
    const fichas = await page.$$eval("#fichas li", (lis) => lis.map((li) => ({
      titulo: li.querySelector("h2").textContent.trim(),
      enlace: li.querySelector("h2 a").getAttribute("href"),
      visible: li.checkVisibility(),
    })));
    ok("siete fichas", fichas.length === 7, fichas.length);
    ok("cada una con su encabezado y su enlace", fichas.every((f) => f.titulo && /^#[a-z-]+$/.test(f.enlace) && f.visible), JSON.stringify(fichas));
    ok("un solo h1", (await page.$$eval("#vista-fichas h1", (h) => h.length)) === 1);
    await page.click('#fichas li:first-child h2 a');
    await page.waitForSelector("#vista-tipo:not(.hidden) #niveles li");
    const niveles = await page.$$eval("#niveles li", (l) => l.length);
    ok("el Detective abre sus 4 niveles", niveles === 4, niveles);
    await page.screenshot({ path: "/tmp/tipos-niveles.png", fullPage: true }).catch(() => {});
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== El Detective ===");
  {
    const item = DATOS.detective.find((x) => x.nivel === 2);
    const { page, ctx, errores } = await abrir(browser, true, "#detective/2/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #controles input[type=radio]");
    await mismaPosicion(page, item.fen, "pinta la posición del ejercicio");
    const mala = item.opciones.findIndex((o) => R.claveRetro(o) !== item.correcta);
    const buena = item.opciones.findIndex((o) => R.claveRetro(o) === item.correcta);
    await page.check("#det-op-" + mala);
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t1 = await esperarEstado(page, /Esa no pudo ser/);
    ok("una opción imposible se explica", /Imposible/.test(t1), t1);
    ok("y no da estrellas todavía", !(await estrellas(page))["detective:" + item.id]);
    await page.check("#det-op-" + buena);
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t2 = await esperarEstado(page, /Correcto/);
    ok("la buena es correcta", /Correcto/.test(t2), t2);
    ok("con un error, dos estrellas guardadas", (await estrellas(page))["detective:" + item.id] === 2, JSON.stringify(await estrellas(page)));
    await page.screenshot({ path: "/tmp/tipos-detective.png", fullPage: true }).catch(() => {});
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== ¿Qué quiere el rival? ===");
  {
    const item = DATOS.amenaza.find((x) => x.nivel === 3 && x.fen.split(" ")[1] === "b") || DATOS.amenaza.find((x) => x.nivel === 3);
    const { page, ctx, errores } = await abrir(browser, true, "#amenaza/3/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    await mismaPosicion(page, item.fen, "pinta la posición del ejercicio");
    const primera = await page.$eval("#tablero [data-square]", (c) => c.dataset.square);
    ok("el tablero está del lado del alumno", primera === (item.fen.split(" ")[1] === "w" ? "a8" : "h1"), "arriba a la izquierda: " + primera);
    // una jugada legal del rival que no es la amenaza
    const otra = new Chess(item.fenRival).moves().find((s) => s !== item.amenaza);
    await page.fill("#jugada-input", R.sanEs(otra));
    await page.press("#jugada-input", "Enter");
    const t1 = await esperarEstado(page, /no es lo que más le conviene/);
    ok("otra jugada del rival no cuenta", /no es lo que más/.test(t1), t1);
    await page.fill("#jugada-input", item.amenazaEs);
    await page.press("#jugada-input", "Enter");
    const t2 = await esperarEstado(page, /Eso es lo que quiere/);
    ok("la amenaza, escrita en castellano, sí", /Eso es lo que quiere/.test(t2), t2);
    ok("dos estrellas (un error)", (await estrellas(page))["amenaza:" + item.id] === 2);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Descarte ===");
  {
    const item = DATOS.descarte.find((x) => x.nivel === 2);
    const { page, ctx, errores } = await abrir(browser, true, "#descarte/2/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #controles input[type=checkbox]");
    await mismaPosicion(page, item.fen, "pinta la posición del ejercicio");
    for (let k = 0; k < item.candidatas.length; k++) if (item.candidatas[k].pierde) await page.check("#des-" + k);
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t = await esperarEstado(page, /Perfecto|Acertaste/);
    ok("tachar las que pierden es perfecto", /Perfecto/.test(t), t);
    ok("tres estrellas guardadas", (await estrellas(page))["descarte:" + item.id] === 3);
    const notas = await page.$$eval("#controles label", (ls) => ls.map((l) => l.textContent));
    ok("cada candidata dice si pierde o aguanta", notas.every((n) => /Pierde|Aguanta/.test(n)), notas.join(" | "));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Siete diferencias ===");
  {
    const item = DATOS.diferencias.find((x) => x.nivel === 2 && x.salvan);
    const { page, ctx, errores } = await abrir(browser, true, "#diferencias/2/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #tablero-a [data-square]");
    await mismaPosicion(page, item.fen, "el tablero B pinta la posición B");
    const vistoA = await page.$$eval("#tablero-a [data-square]", (cs) => cs.filter((c) => { const s = c.querySelector(".tp-pieza"); return s && s.checkVisibility(); }).map((c) => c.dataset.square).sort().join(","));
    ok("el tablero A pinta la posición A", vistoA === ocupadasDe(item.fenA), vistoA);
    ok("A se ve", await page.$eval("#tablero-a-caja", (e) => e.checkVisibility()));
    // una casilla igual en las dos
    const igual = ["a1", "h8", "d4", "e5", "b2"].find((s) => !item.cambio.casillas.includes(s));
    await page.fill("#jugada-input", igual);
    await page.press("#jugada-input", "Enter");
    const t1 = await esperarEstado(page, /son iguales/);
    ok("una casilla igual se rechaza", /son iguales/.test(t1), t1);
    await page.click('#tablero [data-square="' + item.cambio.casillas[0] + '"]');
    const t2 = await esperarEstado(page, /Ahí está/);
    ok("la casilla del cambio es la buena", /Ahí está/.test(t2), t2);
    // la refutación, escrita en castellano
    const despues = new Chess(item.fen); despues.move(item.golpe);
    await mismaPosicion(page, despues.fen(), "B después del golpe, para buscar la defensa");
    await page.fill("#jugada-input", R.sanEs(item.salvan[0]));
    await page.press("#jugada-input", "Enter");
    const t3 = await esperarEstado(page, /refuta el golpe/);
    ok("la refutación cuenta", /refuta el golpe/.test(t3), t3);
    ok("dos estrellas (un error)", (await estrellas(page))["diferencias:" + item.id] === 2, JSON.stringify(await estrellas(page)));
    const expl = await page.$eval("#explicacion", (e) => e.checkVisibility() ? e.textContent : "");
    ok("la explicación dice qué cambió", expl.includes(item.texto), expl);
    await page.screenshot({ path: "/tmp/tipos-diferencias.png", fullPage: true }).catch(() => {});
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== La balanza ===");
  {
    const item = DATOS.balanza.find((x) => x.nivel === 3);
    const { page, ctx, errores } = await abrir(browser, true, "#balanza/3/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #aguja");
    await mismaPosicion(page, item.fen, "pinta la posición del ejercicio");
    const v = Math.round(R.recortar(item.eval) * 2) / 2;
    await page.$eval("#aguja", (a, val) => { a.value = String(val); a.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    const dicho = await page.getAttribute("#aguja", "aria-valuetext");
    ok("la aguja dice su valor en palabras", /ventaja|igualdad/.test(dicho || ""), dicho);
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t = await esperarEstado(page, /El motor dice/);
    ok("dice el número del motor", /El motor dice/.test(t), t);
    ok("clavarla da tres estrellas", (await estrellas(page))["balanza:" + item.id] === 3, JSON.stringify(await estrellas(page)));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Fotografía ===");
  {
    const item = DATOS.fotografia.find((x) => x.nivel === 2);
    const { page, ctx, errores } = await abrir(browser, true, "#fotografia/2/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #controles button");
    await mismaPosicion(page, item.fen, "se ve la posición mientras se memoriza");
    await page.getByRole("button", { name: "Ya la tengo" }).click();
    await page.waitForSelector("#foto-w");
    const visto = await tableroVisto(page);
    ok("al reconstruir, no se ve ni una pieza", Object.keys(visto).length === 0, JSON.stringify(visto));
    const lectura = await page.$eval("#lectura", (p) => p.checkVisibility() ? p.textContent : "");
    ok("ni escrita debajo", !lectura, lectura);
    // escribirla, como la escribiría quien no ve el tablero
    const L = { k: "R", q: "D", r: "T", b: "A", n: "C", p: "" };
    const por = { w: [], b: [] };
    R.tablero(item.fen).forEach((p, i) => { if (p) por[p.c].push(L[p.t] + R.sq(i)); });
    await page.fill("#foto-w", por.w.join(" "));
    await page.fill("#foto-b", por.b.join(" "));
    await page.getByRole("button", { name: "Colocar lo escrito" }).click();
    await mismaPosicion(page, item.fen, "lo escrito se coloca en el tablero");
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t = await esperarEstado(page, /Perfecta|Acertaste/);
    ok("reconstruida entera, perfecta", /Perfecta/.test(t), t);
    ok("tres estrellas guardadas", (await estrellas(page))["fotografia:" + item.id] === 3);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }
  {
    const item = DATOS.fotografia.find((x) => x.nivel === 5);
    const { page, ctx, errores } = await abrir(browser, true, "#fotografia/5/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #controles button");
    await page.getByRole("button", { name: "Ya la tengo" }).click();
    await page.waitForSelector("#controles fieldset");
    const visto = await tableroVisto(page);
    ok("nivel 5: al preguntar, las piezas no se ven", Object.keys(visto).length === 0, JSON.stringify(visto));
    for (let k = 0; k < item.preguntas.length; k++) {
      await page.check(`input[name="foto-q${k}"][value="${item.preguntas[k].correcta}"]`);
    }
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t = await esperarEstado(page, /Acertaste/);
    ok("las tres preguntas bien", /Acertaste 3 de 3/.test(t), t);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Con lo justo (se juega escribiendo) ===");
  {
    const item = DATOS["con-lo-justo"].find((x) => x.nivel === 3);   // rey y torre
    const tabla = FinalesDTM.resolver(item.piezas);
    const { page, ctx, errores } = await abrir(browser, true, "#con-lo-justo/3/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    await mismaPosicion(page, item.fen, "pinta la posición del final");
    let jugadas = 0, t = "";
    for (; jugadas < 60; jugadas++) {
      const fen = await page.evaluate(() => TiposEntreno.fen());
      const g = new Chess(fen);
      // la jugada perfecta: la que deja el mate más corto
      let mejor = null, mejorD = Infinity;
      g.moves({ verbose: true }).forEach((m) => {
        g.move(m);
        const d = g.in_checkmate() ? -1 : (tabla.dtm(g.fen()) || Infinity);
        if (d > 0 || d === -1) { if (d < mejorD) { mejorD = d; mejor = m; } }
        g.undo();
      });
      await page.fill("#jugada-input", R.sanEs(mejor.san));
      await page.press("#jugada-input", "Enter");
      if (mejorD === -1) { t = await esperarEstado(page, /Jaque mate/); jugadas++; break; }
      if (!(await page.isVisible("#jugada-input"))) { t = await estado(page); break; }
      await page.waitForFunction((f) => TiposEntreno.fen() !== f && TiposEntreno.fen().split(" ")[1] === "w", fen, { timeout: 5000 });
    }
    ok("jugando perfecto se da mate", /Jaque mate en \d+/.test(t), t);
    const n = +((/Jaque mate en (\d+)/.exec(t) || [])[1]);
    ok("en el mínimo exacto o menos (" + item.minimo + ")", n <= item.minimo, "en " + n);
    ok("tres estrellas guardadas", (await estrellas(page))["con-lo-justo:" + item.id] === 3);
    const mejor = await page.evaluate(() => JSON.parse(localStorage.getItem("tipos_mejor_v1") || "{}"));
    ok("y la mejor marca", mejor[item.id] === n, JSON.stringify(mejor));
    // js/progreso-usuario.js junta los cambios y sube a los 1,2 s
    const subio = await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "training_state" && JSON.stringify(e.fila).includes("tipos_estrellas_v1")), null, { timeout: 5000 }).then(() => true, () => false);
    ok("el avance se sube a la cuenta (training_state)", subio);
    await page.screenshot({ path: "/tmp/tipos-final.png", fullPage: true }).catch(() => {});
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
