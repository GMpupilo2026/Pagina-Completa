/* Comprueba entreno/tipos.html en un navegador de verdad: la ficha de los
 * Tipos de entrenamiento y los dieciocho juegos, JUGADOS de punta a punta.
 *
 * Los bancos los comprueba herramientas/verificar-tipos.js sin navegador.
 * Esto es lo que solo se rompe mirando la pantalla:
 *   - sin sesión manda a iniciar sesión; con sesión, la ficha trae los dieciocho
 *     tipos, cada uno con su encabezado y su enlace;
 *   - cada juego pinta LA posición de su ejercicio (se compara casilla por
 *     casilla contra la FEN del banco, no contra la página);
 *   - contestar bien da estrellas y queda guardado en la cuenta
 *     (tipos_estrellas_v1), contestar mal no;
 *   - Fotografía de verdad esconde las piezas mientras se reconstruye (se
 *     miden las piezas visibles, no la clase);
 *   - Con lo justo se juega ESCRIBIENDO las jugadas, como lo juega quien usa
 *     lector de pantalla, hasta dar mate, y el mate llega en el mínimo exacto
 *     jugando perfecto (las jugadas las elige la tabla de finales en Node);
 *   - al resolver el último ejercicio que faltaba de un nivel, dice «¡Nivel
 *     completo!» y «Siguiente» lleva al nivel que sigue;
 *   - en el recuadro de la jugada también se le pregunta al tablero
 *     («reyes»), como en el resto de Entrenamiento.
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
  /* Las filas de cada tabla las pone la prueba (window.__filas); los
     filtros se aplican DE VERDAD al resolver, como la base. */
  function tabla(nombre) {
    let filas = ((window.__filas || {})[nombre] || []).slice();
    const filtros = [];
    let orden = null, desde = 0, hasta = Infinity;
    const api = {
      select() { return api; }, limit() { return api; },
      eq(c, v) { filtros.push((f) => f[c] === v); return api; },
      neq(c, v) { filtros.push((f) => f[c] !== v); return api; },
      in(c, vs) { filtros.push((f) => vs.indexOf(f[c]) >= 0); return api; },
      or(txt) {
        const partes = txt.split(",").map((p) => p.split("."));
        filtros.push((f) => partes.some(([c, op, v]) => op === "eq" && String(f[c]) === v));
        return api;
      },
      order(c, o) { orden = { c, asc: !o || o.ascending !== false }; return api; },
      range(a, b) { desde = a; hasta = b; return api; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      upsert(fila) { window.__escrituras.push({ tabla: nombre, fila }); return Promise.resolve({ error: null }); },
      insert(fila) { window.__escrituras.push({ tabla: nombre, fila }); return Promise.resolve({ error: null }); },
      then(res, rej) {
        let d = filas.filter((f) => filtros.every((fn) => fn(f)));
        if (orden) d.sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : a[orden.c] > b[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1));
        d = d.slice(desde, hasta + 1);
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
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

async function abrir(browser, conSesion, hash, preparar) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
  if (preparar) await preparar(ctx);
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
    ok("dieciocho fichas", fichas.length === 18, fichas.length);
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
    // En el mismo recuadro se le puede PREGUNTAR al tablero (js/comandos-tablero.js).
    // Las columnas se dicen como en todo el sitio (js/blind-notation.js): «gustav 1».
    const HABLADA = { a: "anna", b: "bella", c: "cesar", d: "david", e: "eva", f: "felix", g: "gustav", h: "hector" };
    const reyes = R.tablero(item.fenRival).map((p, i) => (p && p.t === "k" ? R.sq(i) : null)).filter(Boolean);
    await page.fill("#jugada-input", "reyes");
    await page.press("#jugada-input", "Enter");
    const t3 = await esperarEstado(page, /[Rr]ey/);
    ok("«reyes» contesta dónde están, sin tomarlo como jugada", reyes.length === 2 && reyes.every((sq) => t3.includes(sq) || t3.includes(HABLADA[sq[0]] + " " + sq[1])) && !/no es/.test(t3), t3 + " · reyes en " + reyes.join(","));
    ok("y el recuadro queda vacío para seguir", (await page.inputValue("#jugada-input")) === "");
    await page.fill("#jugada-input", item.amenazaEs);
    await page.press("#jugada-input", "Enter");
    const t2 = await esperarEstado(page, /Eso es lo que quiere/);
    ok("la amenaza, escrita en castellano, sí", /Eso es lo que quiere/.test(t2), t2);
    ok("dos estrellas (un error)", (await estrellas(page))["amenaza:" + item.id] === 2);
    // Y queda en training_progress (meta del día, racha, logros, tareas).
    const reg = await page.waitForFunction(() => window.__escrituras.filter((e) => e.tabla === "training_progress"), null, { timeout: 5000 })
      .then(() => page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "training_progress").map((e) => [].concat(e.fila)[0])), () => []);
    ok("se registra como actividad «tipos», con el ejercicio y su tipo",
      reg.length === 1 && reg[0].activity === "tipos" && reg[0].detail.puzzle_id === "amenaza:" + item.id && reg[0].detail.category === "amenaza" && reg[0].detail.nivel === 3,
      JSON.stringify(reg));
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

  /* ======================= 8 a 18 ======================= */
  const M = require("../js/tipos-reglas-mas.js");
  const escribir = async (page, txt) => { await page.fill("#jugada-input", txt); await page.press("#jugada-input", "Enter"); };

  console.log("\n=== El Barrido ===");
  {
    const item = DATOS.barrido.find((x) => x.nivel === 2);
    const { page, ctx, errores } = await abrir(browser, true, "#barrido/2/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    await mismaPosicion(page, item.fen, "pinta la posición");
    const esperadas = [].concat(...item.pide.map((c) => item.respuestas[c]));
    // una que no es: se anota y se quita con su ✖
    const sobra = new Chess(item.fen).moves().find((s) => !esperadas.includes(s));
    await escribir(page, R.sanEs(sobra));
    await page.getByRole("button", { name: "Quitar " + R.sanEs(sobra) }).click();
    for (const s of esperadas) await escribir(page, R.sanEs(s));
    const anotadas = await page.$$eval("#controles ul li span.font-semibold", (xs) => xs.map((x) => x.textContent));
    ok("se anotaron todas, y la que sobraba se quitó", anotadas.length === esperadas.length, anotadas.join(","));
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t = await esperarEstado(page, /encontraste todas|Encontraste/);
    ok("todas encontradas: tres estrellas", /encontraste todas/.test(t) && (await estrellas(page))["barrido:" + item.id] === 3, t);
    ok("no se movió ninguna pieza", Object.keys(await tableroVisto(page)).sort().join() === ocupadasDe(item.fen));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Intercambios ===");
  {
    const item = DATOS.intercambios.find((x) => x.nivel === 3);
    const { page, ctx, errores } = await abrir(browser, true, "#intercambios/3/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #controles button");
    await mismaPosicion(page, item.fen, "pinta la posición");
    const etiqueta = +item.valor > 0 ? "+" + item.valor : +item.valor < 0 ? "−" + (-item.valor) : "0 (queda igual)";
    await page.locator("#controles button", { hasText: etiqueta }).first().click();
    const t = await esperarEstado(page, /Correcto/);
    ok("el resultado exacto da tres estrellas", /Correcto/.test(t) && (await estrellas(page))["intercambios:" + item.id] === 3, t);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Constrúyela tú ===");
  {
    const item = DATOS.construye.find((x) => x.nivel === 2);
    const { page, ctx, errores } = await abrir(browser, true, "#construye/2/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    const tab = R.tablero(item.fen);
    const vacia = Array.from({ length: 64 }, (_, i) => R.sq(i)).find((s) => !tab[R.idx(s)] && !item.soluciones.includes(s));
    await escribir(page, vacia);
    const t1 = await esperarEstado(page, /✗/);
    ok("una casilla que no sirve se explica", /✗/.test(t1), t1);
    await page.click('#tablero [data-square="' + item.soluciones[0] + '"]');
    const t2 = await esperarEstado(page, /Eso es/);
    ok("la casilla buena, tocada en el tablero", /Eso es/.test(t2), t2);
    const visto = await tableroVisto(page);
    ok("y la pieza queda puesta ahí", !!visto[item.soluciones[0]]);
    ok("dos estrellas (un error)", (await estrellas(page))["construye:" + item.id] === 2);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Rey y peón ===");
  {
    const bits = M.bitsDeBase64(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "entreno/data/kpk.json"), "utf8")).bits);
    // nivel 2: gana o tablas
    const a = DATOS.peones.find((x) => x.nivel === 2);
    let { page, ctx, errores } = await abrir(browser, true, "#peones/2/" + a.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #controles button");
    await page.locator("#controles button", { hasText: a.gana ? "Ganan las blancas" : "Tablas" }).click();
    ok("nivel 2: la respuesta de la tabla es la correcta", /Correcto/.test(await esperarEstado(page, /Correcto/)));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
    // nivel 3: la única jugada, escrita
    const b = DATOS.peones.find((x) => x.nivel === 3);
    ({ page, ctx, errores } = await abrir(browser, true, "#peones/3/" + b.id));
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    await escribir(page, R.sanEs(b.jugada));
    ok("nivel 3: la única jugada que gana", /única que gana/.test(await esperarEstado(page, /única que gana|✗/)));
    await ctx.close();
    // nivel 4: se juega hasta coronar, siempre con una jugada que gana
    const c = DATOS.peones.find((x) => x.nivel === 4);
    ({ page, ctx, errores } = await abrir(browser, true, "#peones/4/" + c.id));
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    const vistas = new Set();
    let final = "";
    for (let k = 0; k < 60; k++) {
      const fen = await page.evaluate(() => TiposEntreno.fen());
      vistas.add(fen.split(" ")[0]);
      const g = new Chess(fen);
      const opciones = g.moves({ verbose: true }).map((m) => {
        g.move(m);
        const v = m.promotion ? (m.promotion === "q" && !g.in_stalemate() && !g.moves({ verbose: true }).some((x) => x.to === m.to)) : M.kpkGana(bits, g.fen());
        const nuevo = !vistas.has(g.fen().split(" ")[0]);
        g.undo();
        return { m, v, nuevo };
      }).filter((x) => x.v);
      // corona si puede; si no, avanza el peón; si no, una jugada de rey nueva
      const elegida = opciones.find((x) => x.m.promotion) || opciones.find((x) => x.m.piece === "p" && x.nuevo) || opciones.find((x) => x.nuevo) || opciones[0];
      await escribir(page, R.sanEs(elegida.m.san));
      if (elegida.m.promotion) { final = await esperarEstado(page, /Coronaste/); break; }
      await page.waitForFunction((f) => TiposEntreno.fen() !== f && TiposEntreno.fen().split(" ")[1] === "w", fen, { timeout: 5000 }).catch(() => {});
      if (!(await page.isVisible("#jugada-input"))) { final = await estado(page); break; }
    }
    ok("nivel 4: jugando lo que gana, se corona", /Coronaste/.test(final), final);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Adivina la jugada del maestro ===");
  {
    const completo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cursos/protegido/data/tipos-maestro.json"), "utf8")).maestro;
    const item = completo.find((x) => x.nivel === 1);
    let { page, ctx, errores } = await abrir(browser, true, "#maestro/1/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input", { timeout: 15000 });
    for (const pos of item.posiciones) {
      await page.waitForFunction((f) => TiposEntreno.fen() === f, pos.fen, { timeout: 8000 }).catch(() => {});
      await escribir(page, R.sanEs(pos.jugada));
    }
    const t = await esperarEstado(page, /Hiciste/);
    const max = item.posiciones.length * 3;
    ok("adivinando todas, puntaje completo", new RegExp("Hiciste " + max + " de " + max).test(t), t);
    ok("tres estrellas", (await estrellas(page))["maestro:" + item.id] === 3);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
    // sin acceso vigente, el servidor dice que no: se explica y no se rompe nada
    ({ page, ctx, errores } = await abrir(browser, true, "", async (c) => { await c.route("**/tipos-maestro.json", (r) => r.fulfill({ status: 403, body: "no" })); }));
    await page.waitForSelector("#fichas li");
    await page.evaluate((id) => { location.hash = "#maestro/1/" + id; }, item.id);
    const t2 = await esperarEstado(page, /acceso/);
    ok("sin acceso: dice que hace falta el acceso vigente", /acceso a la Academia vigente/.test(t2), t2);
    await ctx.close();
  }

  console.log("\n=== ¿Qué apertura es? ===");
  {
    const item = DATOS.apertura.find((x) => x.nivel === 3) || DATOS.apertura.find((x) => x.nivel === 2);
    const { page, ctx, errores } = await abrir(browser, true, "#apertura/" + item.nivel + "/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #controles button");
    if (item.nivel === 3) ok("en otro orden: el tablero no muestra la posición", Object.keys(await tableroVisto(page)).length === 0);
    await page.locator("#controles button", { hasText: item.correcta }).first().click();
    ok("el nombre correcto", /Correcto/.test(await esperarEstado(page, /Correcto/)));
    ok("tres estrellas", (await estrellas(page))["apertura:" + item.id] === 3);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== La ruta segura ===");
  {
    const item = DATOS.ruta.find((x) => x.nivel === 3);
    const { page, ctx, errores } = await abrir(browser, true, "#ruta/3/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    // una casilla que el rival ataca no se deja pisar
    const tab = R.tablero(item.fen);
    const sinElla = tab.slice(); sinElla[R.idx(item.desde)] = null;
    const atacadas = M.atacadas(sinElla, R.otro(item.fen.split(" ")[1]));
    const mala = [...atacadas].map(R.sq).find((s) => !tab[R.idx(s)]);
    if (mala) { await escribir(page, mala); ok("una casilla atacada se rechaza", /atacada|no llega/.test(await esperarEstado(page, /✗/))); }
    for (const s of item.camino) await page.click('#tablero [data-square="' + s + '"]');
    const t = await esperarEstado(page, /Llegaste|camino más corto/);
    ok("por el camino más corto: tres estrellas", /camino más corto/.test(t) && (await estrellas(page))["ruta:" + item.id] === 3, t);
    const visto = await tableroVisto(page);
    ok("la pieza quedó en el destino", !!visto[item.hasta] && !visto[item.desde]);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Aguanta ===");
  {
    const item = DATOS.aguanta.find((x) => x.fen.split(" ")[1] === "b") || DATOS.aguanta[0];
    const { page, ctx, errores } = await abrir(browser, true, "#aguanta/" + item.nivel + "/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    await mismaPosicion(page, item.fen, "pinta la posición del ejercicio");
    const primera = await page.$eval("#tablero [data-square]", (c) => c.dataset.square);
    ok("el tablero está del lado del alumno", primera === (item.fen.split(" ")[1] === "w" ? "a8" : "h1"), "arriba a la izquierda: " + primera);
    // ver la amenaza la marca en el tablero, con su signo escrito
    await page.getByRole("button", { name: /Qué quiere el rival/ }).click();
    const t0 = await esperarEstado(page, /El rival amenaza/);
    ok("«¿Qué quiere el rival?» dice la amenaza", t0.includes(item.amenazaEs), t0);
    const destino = new Chess(item.fenRival).move(item.amenaza).to;
    const marca = await page.$eval('#tablero [data-square="' + destino + '"]', (c) => ({ signo: c.dataset.marca || "", nombre: c.getAttribute("aria-label") || "" }));
    ok("y la marca en el tablero con su signo y dicha", marca.signo === "✕" && /quiere ir el rival/.test(marca.nombre), JSON.stringify(marca));
    // una jugada que pierde: se deshace y dice cómo castiga el rival
    const mala = Object.keys(item.refuta)[0];
    await page.fill("#jugada-input", R.sanEs(mala));
    await page.press("#jugada-input", "Enter");
    const t1 = await esperarEstado(page, /pierde/);
    ok("una jugada que pierde se explica con la respuesta del rival", /pierde/.test(t1) && (!item.refuta[mala].r || t1.includes(item.refuta[mala].r)), t1);
    await mismaPosicion(page, item.fen, "y el tablero vuelve a la posición");
    ok("no da estrellas todavía", !(await estrellas(page))["aguanta:" + item.id]);
    // la única defensa, escrita
    await page.fill("#jugada-input", item.defensaEs);
    await page.press("#jugada-input", "Enter");
    const t2 = await esperarEstado(page, /Aguanta/);
    ok("la única defensa es correcta", /era la única/.test(t2), t2);
    ok("con la amenaza vista y un error: una estrella", (await estrellas(page))["aguanta:" + item.id] === 1, JSON.stringify(await estrellas(page)));
    const g = new Chess(item.fen); g.move(item.defensa);
    await mismaPosicion(page, g.fen(), "la defensa queda jugada en el tablero");
    ok("explica la defensa y la línea", ((await page.textContent("#explicacion")) || "").includes("La única que aguanta: " + item.defensaEs));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }
  {
    // a la primera y sin pistas: tres estrellas
    const item = DATOS.aguanta.find((x) => x.nivel === 2) || DATOS.aguanta[1];
    const { page, ctx, errores } = await abrir(browser, true, "#aguanta/" + item.nivel + "/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    await page.fill("#jugada-input", item.defensaEs);
    await page.press("#jugada-input", "Enter");
    await esperarEstado(page, /Aguanta/);
    ok("a la primera: tres estrellas", (await estrellas(page))["aguanta:" + item.id] === 3, JSON.stringify(await estrellas(page)));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Remata la ventaja (con un motor de mentira) ===");
  {
    /* El motor de mentira: juega la primera jugada legal y evalúa lo que la
       prueba le pone (window.__evals, en orden; después window.__eval; null =
       el motor no contesta). Evalúa desde el que mueve, que tras la jugada del
       alumno es la máquina: −400 son +4 para el alumno. */
    const MOTOR_FALSO = `
window.PracticeEngine = {
  LEVELS: { max: {} }, preload() {}, jugadaDeRespaldo() { return null; },
  async getMove(fen) { const m = new Chess(fen).moves({ verbose: true })[0]; return m ? m.from + m.to + (m.promotion || "") : null; },
  async evaluate() { if (window.__evals && window.__evals.length) return window.__evals.shift(); return window.__eval === undefined ? { type: "cp", value: -400 } : window.__eval; },
};`;
    const conMotor = (evals, eval1) => async (ctx) => {
      await ctx.route("**/js/shared-engine.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
      await ctx.route("**/js/practice-engine.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: MOTOR_FALSO }));
      await ctx.addInitScript((v) => { window.__evals = v.evals; if (v.uno !== "nada") window.__eval = v.uno; }, { evals, uno: eval1 === undefined ? "nada" : eval1 });
    };
    /* Juega jugadas legales que no repitan posición, esperando el turno. */
    async function jugarHasta(page, item, re) {
      const vistas = new Set();
      for (let k = 0; k < item.jugadas + 2; k++) {
        const t = await esperarEstado(page, /Te toca|Remataste|✗|no cuenta|Vas ganando|^$/);
        if (/Remataste|✗|no cuenta/.test(t)) return t;
        await page.waitForFunction(() => document.querySelector("#tablero button[data-square]"), null, { timeout: 5000 }).catch(() => {});
        const fen = await page.evaluate(() => TiposEntreno.fen());
        const g = new Chess(fen);
        vistas.add(fen.split(" ").slice(0, 4).join(" "));
        const clave = (f) => f.split(" ").slice(0, 4).join(" ");
        const m = g.moves({ verbose: true }).find((x) => { const h = new Chess(fen); h.move(x); return !h.game_over() && !vistas.has(clave(h.fen())); });
        { const h = new Chess(fen); h.move(m); vistas.add(clave(h.fen())); }
        if (!(await page.isVisible("#jugada-input"))) return estado(page);
        await page.fill("#jugada-input", R.sanEs(m.san));
        await page.press("#jugada-input", "Enter");
        await page.waitForFunction((f) => TiposEntreno.fen() !== f, fen, { timeout: 5000 }).catch(() => {});
        await page.waitForFunction(() => !/revisa|piensa/.test(document.getElementById("estado").textContent), null, { timeout: 5000 }).catch(() => {});
      }
      return esperarEstado(page, re);
    }
    const item = DATOS.remata.find((x) => x.nivel === 1);
    {
      const { page, ctx, errores } = await abrir(browser, true, "#remata/1/" + item.id, conMotor([]));
      await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
      await mismaPosicion(page, item.fen, "pinta la posición del ejercicio");
      const primera = await page.$eval("#tablero [data-square]", (c) => c.dataset.square);
      ok("el tablero está del lado del alumno", primera === (item.fen.split(" ")[1] === "w" ? "a8" : "h1"), "arriba a la izquierda: " + primera);
      const t = await jugarHasta(page, item, /Remataste/);
      ok("siempre en +4: remata a las " + item.jugadas + " jugadas", /Remataste/.test(t), t);
      ok("sin bajar nunca de +3: tres estrellas", (await estrellas(page))["remata:" + item.id] === 3, JSON.stringify(await estrellas(page)));
      ok("sin errores en consola", !errores.length, errores.join(" | "));
      await ctx.close();
    }
    {
      // bajó a +2 una vez y volvió: lo logra, con dos estrellas
      const { page, ctx, errores } = await abrir(browser, true, "#remata/1/" + item.id, conMotor([{ type: "cp", value: -200 }]));
      await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
      const t = await jugarHasta(page, item, /Remataste/);
      ok("bajó a +2 y volvió: lo logra", /Remataste/.test(t), t);
      ok("con dos estrellas", (await estrellas(page))["remata:" + item.id] === 2, JSON.stringify(await estrellas(page)));
      ok("sin errores en consola", !errores.length, errores.join(" | "));
      await ctx.close();
    }
    {
      // a +0: se escapó a la primera
      const { page, ctx, errores } = await abrir(browser, true, "#remata/1/" + item.id, conMotor([], { type: "cp", value: 0 }));
      await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
      const t = await jugarHasta(page, item, /escapó/);
      ok("si baja de +1,5 se escapó", /se te escapó/.test(t), t);
      ok("y no da estrellas", !(await estrellas(page))["remata:" + item.id]);
      ok("sin errores en consola", !errores.length, errores.join(" | "));
      await ctx.close();
    }
    {
      // sin motor no se regala nada
      const { page, ctx, errores } = await abrir(browser, true, "#remata/1/" + item.id, conMotor([], null));
      await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
      const t = await jugarHasta(page, item, /no cuenta/);
      ok("si el motor no contesta, no cuenta", /no cuenta/.test(t), t);
      ok("y no da estrellas", !(await estrellas(page))["remata:" + item.id]);
      ok("sin errores en consola", !errores.length, errores.join(" | "));
      await ctx.close();
    }
  }

  console.log("\n=== Elige a tiempo ===");
  {
    const item = DATOS.tiempo.find((x) => x.nivel === 1);
    const mejor = item.candidatas.find((c) => c.clase === "mejor");
    const { page, ctx, errores } = await abrir(browser, true, "#tiempo/1/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #controles button");
    await mismaPosicion(page, item.fen, "pinta la posición del ejercicio");
    const opciones = await page.$$eval('#controles [role="group"] button', (b) => b.map((x) => x.textContent.trim()));
    ok("muestra las candidatas del banco", JSON.stringify(opciones) === JSON.stringify(item.candidatas.map((c) => c.sanEs)), JSON.stringify(opciones));
    ok("dice cuánto tiempo hay", /Tienes 30 segundos/.test(await estado(page)), await estado(page));
    await page.locator('#controles [role="group"] button', { hasText: mejor.sanEs }).first().click();
    const t = await esperarEstado(page, /La mejor/);
    ok("la mejor: tres estrellas", /La mejor/.test(t) && (await estrellas(page))["tiempo:" + item.id] === 3, t);
    const marcadas = await page.$$eval('#controles [role="group"] button', (b) => b.map((x) => x.textContent.trim()));
    ok("después cada candidata dice cuánto pierde, con su signo escrito", marcadas.every((x) => /^[✓≈✗] /.test(x) && /la mejor|pierde/.test(x)), JSON.stringify(marcadas));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }
  {
    // escrita, y una que pierde: sin estrellas
    const item = DATOS.tiempo.find((x) => x.nivel === 2);
    const error = item.candidatas.find((c) => c.clase === "error");
    const { page, ctx, errores } = await abrir(browser, true, "#tiempo/2/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    const otra = new Chess(item.fen).moves().find((s) => !item.candidatas.some((c) => c.san === s));
    if (otra) {
      await page.fill("#jugada-input", R.sanEs(otra));
      await page.press("#jugada-input", "Enter");
      ok("una jugada que no es candidata no cuenta", /no es una de las candidatas/.test(await esperarEstado(page, /candidatas/)));
    }
    await page.fill("#jugada-input", error.sanEs);
    await page.press("#jugada-input", "Enter");
    const t = await esperarEstado(page, /pierde/);
    ok("escribir una que pierde: se explica y no da estrellas", /Esa pierde/.test(t) && !(await estrellas(page))["tiempo:" + item.id], t);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }
  {
    // se acaba el reloj (el reloj de la página se adelanta, no se espera)
    const item = DATOS.tiempo.find((x) => x.nivel === 3);
    const { page, ctx, errores } = await abrir(browser, true, "#tiempo/3/" + item.id, async (c) => { await c.clock.install(); });
    await page.waitForSelector("#vista-juego:not(.hidden) #controles button");
    await page.clock.fastForward("00:09");
    const t = await esperarEstado(page, /acabó el tiempo/);
    ok("a los 8 segundos se acaba el tiempo", /Se acabó el tiempo/.test(t), t);
    ok("y no da estrellas", !(await estrellas(page))["tiempo:" + item.id]);
    const apagados = await page.$$eval('#controles [role="group"] button', (b) => b.every((x) => x.disabled));
    ok("y ya no se puede elegir", apagados);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }
  {
    // Modo Adaptado: el triple
    const item = DATOS.tiempo.find((x) => x.nivel === 3);
    const { page, ctx, errores } = await abrir(browser, true, "#tiempo/3/" + item.id, async (c) => {
      await c.addInitScript(() => { localStorage.setItem("oscarBlindMode_v1", "1"); });
      await c.clock.install();
    });
    await page.waitForSelector("#vista-juego:not(.hidden) #controles button");
    ok("en Modo Adaptado, el triple de tiempo", /Tienes 24 segundos \(el triple/.test(await estado(page)), await estado(page));
    await page.clock.fastForward("00:10");
    ok("a los 10 segundos todavía se puede elegir", !(await page.$eval('#controles [role="group"] button', (b) => b.disabled)));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Tus propios errores (partidas y motor de mentira) ===");
  {
    /* Una partida de Juegos de la alumna (u-1, blancas) donde se equivoca en
       la jugada 4 (Cxe5 regala el caballo: de 0 a −3), otra de ajedrez
       «desde el tablero» que no se puede reproducir, una de otra variante y
       una de otra persona (el doble filtra de verdad: esas no llegan). */
    const JUGADAS = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+"];
    const g = new Chess();
    const fens = [g.fen()];
    JUGADAS.forEach((s) => { g.move(s); fens.push(g.fen()); });
    const evals = {};
    fens.forEach((f, i) => { evals[f] = i <= 6 ? 0 : -3; });
    const opciones = { [fens[6]]: [{ san: "c3", eval: 0.2 }, { san: "O-O", eval: 0 }, { san: "Nxe5", eval: -3 }] };
    const filas = {
      game_rooms: [
        { id: "g-buena", variant: "estandar", status: "finished", white_id: "u-1", black_id: "u-2", moves: JUGADAS, updated_at: "2026-09-20T15:00:00Z" },
        { id: "g-tablero", variant: "estandar", status: "finished", white_id: "u-2", black_id: "u-1", moves: ["Ke2", "Ke7", "Ke3", "Ke6", "Ke4", "Ke5", "Kd3", "Kd6", "Kc3", "Kc6", "Kb3", "Kb6"], updated_at: "2026-09-19T15:00:00Z" },
        { id: "g-otra-variante", variant: "crazyhouse", status: "finished", white_id: "u-1", black_id: "u-2", moves: JUGADAS, updated_at: "2026-09-18T15:00:00Z" },
        { id: "g-ajena", variant: "estandar", status: "finished", white_id: "u-3", black_id: "u-2", moves: JUGADAS, updated_at: "2026-09-17T15:00:00Z" },
        { id: "g-en-curso", variant: "estandar", status: "playing", white_id: "u-1", black_id: "u-2", moves: JUGADAS, updated_at: "2026-09-16T15:00:00Z" },
      ],
      practice_games: [], practice_sessions: [],
    };
    const MOTOR_FALSO = `
window.PreparacionMotor = {
  disponible() { return true; },
  async evaluar(fen) { return { eval: (window.__evals || {})[fen] || 0, mejor: null }; },
  async opciones(fen) { return (window.__opciones || {})[fen] || []; },
};`;
    const preparar = async (ctx) => {
      await ctx.route("**/js/preparacion-motor.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: MOTOR_FALSO }));
      await ctx.addInitScript((v) => { window.__filas = v.filas; window.__evals = v.evals; window.__opciones = v.opciones; }, { filas, evals, opciones });
    };
    const { page, ctx, errores } = await abrir(browser, true, "#errores", preparar);
    await page.waitForSelector("#vista-tipo:not(.hidden) #tipo-extra button");
    const vacios = await page.$$eval("#niveles li", (l) => l.map((x) => x.textContent));
    ok("antes de buscar, los niveles están vacíos", vacios.length === 2 && vacios.every((t) => /0 de 0/.test(t)), JSON.stringify(vacios));
    await page.getByRole("button", { name: /Buscar errores en mis partidas/ }).click();
    await page.waitForFunction(() => /Listo|No hay|No se pudieron/.test(document.querySelector('#tipo-extra [role="status"]').textContent), null, { timeout: 15000 }).catch(() => {});
    const aviso = await page.textContent('#tipo-extra [role="status"]');
    ok("revisa las dos partidas suyas, estándar y terminadas, y saca 1 ejercicio", /se revisaron 2 partidas y salió 1 ejercicio nuevo/.test(aviso), aviso);
    const guardado = await page.evaluate(() => ({ ej: JSON.parse(localStorage.getItem("errores_propios_v1") || "{}"), vistas: JSON.parse(localStorage.getItem("errores_analizadas_v1") || "{}") }));
    const ej = Object.values(guardado.ej);
    ok("el ejercicio queda guardado con las buenas del motor", ej.length === 1 && ej[0].fen === fens[6] && ej[0].jugada === "Nxe5" && ej[0].buenas.join() === "c3,O-O" && ej[0].nivel === 1, JSON.stringify(ej));
    ok("la que no se puede reproducir también queda como revisada (no se vuelve a intentar)", Object.keys(guardado.vistas).sort().join() === "juego:g-buena,juego:g-tablero", JSON.stringify(guardado.vistas));
    ok("la de otra variante, la ajena y la que sigue en curso ni se piden", !Object.keys(guardado.vistas).some((k) => /otra|ajena|curso/.test(k)));
    const nivel1 = await page.textContent("#niveles li:first-child");
    ok("el nivel 1 ya tiene su ejercicio", /0 de 1 resueltos/.test(nivel1), nivel1);
    // Otra vez: no hay nada nuevo.
    await page.getByRole("button", { name: /Buscar errores en mis partidas/ }).click();
    await page.waitForFunction(() => /No hay partidas nuevas/.test(document.querySelector('#tipo-extra [role="status"]').textContent), null, { timeout: 8000 }).catch(() => {});
    ok("buscar otra vez no revisa lo ya revisado", /No hay partidas nuevas/.test(await page.textContent('#tipo-extra [role="status"]')));
    // Jugar el ejercicio.
    await page.evaluate((id) => { location.hash = "#errores/1/" + id; }, ej[0].id);
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    await mismaPosicion(page, fens[6], "pinta la posición de su partida");
    await page.fill("#jugada-input", "Cxe5");
    await page.press("#jugada-input", "Enter");
    ok("la jugada de la partida se reconoce como el error", /la que jugaste en la partida/.test(await esperarEstado(page, /partida/)));
    await page.fill("#jugada-input", "c3");
    await page.press("#jugada-input", "Enter");
    const t = await esperarEstado(page, /buena/);
    ok("una buena: con un error, dos estrellas", /Esa es buena/.test(t) && (await estrellas(page))["errores:" + ej[0].id] === 2, t + " " + JSON.stringify(await estrellas(page)));
    ok("y cuenta qué pasó en la partida", /En tu partida jugaste Cxe5 y la evaluación pasó de \+0,2 a −3,0/.test(await page.textContent("#explicacion")), await page.textContent("#explicacion"));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Nivel completo ===");
  {
    // Todo el nivel 1 de Amenaza resuelto menos el último: al resolverlo,
    // la página tiene que decir que se completó y ofrecer el nivel 2.
    const nivel = DATOS.amenaza.filter((x) => x.nivel === 1);
    const ultimo = nivel[nivel.length - 1];
    const previas = {};
    nivel.slice(0, -1).forEach((x) => { previas["amenaza:" + x.id] = 1; });
    const conPrevias = (o) => async (c) => { await c.addInitScript((v) => { if (!sessionStorage.getItem("__puesto")) { localStorage.setItem("tipos_estrellas_v1", v); sessionStorage.setItem("__puesto", "1"); } }, JSON.stringify(o)); };
    const { page, ctx, errores } = await abrir(browser, true, "#amenaza/1/" + ultimo.id, conPrevias(previas));
    await page.waitForSelector("#vista-juego:not(.hidden) #jugada-input");
    const aviso = () => page.evaluate(() => { const e = document.getElementById("nivel-completo"); return e.checkVisibility() ? e.textContent : ""; });
    ok("antes de resolver el último no dice nada", (await aviso()) === "");
    const ult = await page.evaluate(() => JSON.parse(localStorage.getItem("tipos_ultimo_v1") || "null"));
    ok("anota el nivel que se está jugando, para el «Hoy te toca» del hub",
      !!ult && ult.tipo === "amenaza" && ult.nivel === 1 && ult.hechos === nivel.length - 1 && ult.total === nivel.length, JSON.stringify(ult));
    await page.fill("#jugada-input", ultimo.amenazaEs);
    await page.press("#jugada-input", "Enter");
    await esperarEstado(page, /Eso es lo que quiere/);
    const t = await aviso();
    ok("al resolver el último dice «¡Nivel completo!» y ofrece el nivel 2", /Nivel completo/.test(t) && /Nivel 2: Mate en 1/.test(t), t);
    ok("el enlace lleva al nivel 2", (await page.evaluate(() => { const a = document.querySelector("#nivel-completo a"); return a && a.getAttribute("href"); })) === "#amenaza/2");
    ok("«Siguiente» dice adónde va", (await page.textContent("#btn-siguiente")).trim() === "Nivel 2 →", await page.textContent("#btn-siguiente"));
    await page.click("#btn-siguiente");
    await page.waitForFunction(() => /Nivel 2/.test(document.getElementById("titulo-juego").textContent), null, { timeout: 8000 }).catch(() => {});
    ok("y abre el nivel 2", /#amenaza\/2$/.test(page.url()) && /Nivel 2/.test(await page.textContent("#titulo-juego")), page.url());
    ok("el aviso no sigue puesto en el nivel nuevo", (await aviso()) === "");
    // Repasar un nivel que ya estaba completo no vuelve a festejar.
    await page.evaluate((id) => { location.hash = "#amenaza/1/" + id; }, ultimo.id);
    await page.waitForFunction(() => /Nivel 1/.test(document.getElementById("titulo-juego").textContent), null, { timeout: 8000 });
    await page.fill("#jugada-input", ultimo.amenazaEs);
    await page.press("#jugada-input", "Enter");
    await esperarEstado(page, /Eso es lo que quiere/);
    ok("repasar un nivel ya completo no vuelve a festejar", (await aviso()) === "");
    const registros = () => page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "training_progress").map((e) => [].concat(e.fila)[0].detail.puzzle_id));
    ok("resolver otra vez el mismo ejercicio no lo registra dos veces", JSON.stringify(await registros()) === JSON.stringify(["amenaza:" + ultimo.id]), JSON.stringify(await registros()));
    // El primero tenía estrellas de antes del registro: al resolverlo ahora, entra (una vez).
    const primero = nivel[0];
    await page.evaluate((id) => { location.hash = "#amenaza/1/" + id; }, primero.id);
    await page.waitForFunction((id) => /Ejercicio 1 de/.test(document.getElementById("juego-progreso").textContent), primero.id, { timeout: 8000 });
    await page.fill("#jugada-input", primero.amenazaEs);
    await page.press("#jugada-input", "Enter");
    await esperarEstado(page, /Eso es lo que quiere/);
    await page.waitForTimeout(300);
    ok("lo resuelto antes de que existiera el registro entra la próxima vez que se resuelve",
      (await registros()).includes("amenaza:" + primero.id), JSON.stringify(await registros()));
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
