#!/usr/bin/env node
/* «Explícame esta posición» (Mis estudios), comprobado desde afuera.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - que la explicación hable de una jugada que el motor no calculó y se
 *    muestre igual (la Edge Function la rechaza: se prueba su revisión con
 *    las mismas expresiones que usa);
 *  - que los precios de esta función y los de «Mejorar informe» se separen:
 *    el mismo tope se cobraría distinto según el botón;
 *  - que el botón aparezca sin IA, o con las líneas a medio calcular, o que
 *    quede a la vista la explicación de OTRA posición;
 *  - que viaje algo más que la posición y las líneas (el estudio, los
 *    comentarios, el nombre);
 *  - que la R del rey se lea como torre inglesa al mostrar el texto.
 *
 * Lo que hace cumplir la BASE (ia_para_explicar() solo de la service role, la
 * casilla de los alumnos, el tope del día) se comprobó impersonando roles en
 * SQL; acá se revisa que la migración lo diga.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-explicar-posicion.js [--sin-navegador]
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const CHROME_LINUX = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CHROME = process.env.CHROME_PATH || (fs.existsSync(CHROME_LINUX) ? CHROME_LINUX : undefined);

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre);
}
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

function precios(ts) {
  const bloque = (ts.match(/const PRECIOS[^{]*\{([\s\S]*?)\};/) || [])[1] || "";
  const m = {};
  for (const [, id, a, b] of bloque.matchAll(/"([^"]+)":\s*\[(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\]/g)) m[id] = [Number(a), Number(b)];
  return m;
}

function pruebaSinNavegador() {
  console.log("\nLa función y la base");
  const fn = leer("supabase", "functions", "explicar-posicion", "index.ts");
  const informe = leer("supabase", "functions", "mejorar-informe", "index.ts");
  const p = precios(fn);
  igual("los precios son los de «Mejorar informe»", p, precios(informe));
  igual("y hay precios", Object.keys(p).length > 0, true);
  igual("se anota como explicar_posicion", /que: "explicar_posicion"/.test(fn), true);
  igual("comprueba el segundo paso de la verificación", /sesionAMedias\(/.test(fn), true);
  igual("rejuega las líneas con chess.js", /import \{ Chess \} from "npm:chess\.js@0\.10\.3"/.test(fn), true);

  const dir = path.join(RAIZ, "supabase", "migraciones");
  const sql = fs.readdirSync(dir).filter((f) => /explicar_posicion\.sql$/.test(f)).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  igual("ia_para_explicar() solo la llama la service role",
    /revoke execute on function public\.ia_para_explicar\(uuid\) from public, anon, authenticated;/.test(sql) &&
    /grant execute on function public\.ia_para_explicar\(uuid\) to service_role;/.test(sql), true);
  igual("a un alumno solo le sirven las academias que lo permiten", /\(coalesce\(\(select da_clase from yo\), false\) or g\.alumnos\)/.test(sql), true);
  const topes = (sql.match(/case when \(select da_clase from yo\) then (\d+) else (\d+) end/) || []).slice(1).map(Number);
  igual("el tope del día: 50 quien da clase, 15 un alumno", topes, [50, 15]);
  const pantalla = leer("js", "academias.js");
  igual("y la pantalla de quien administra dice esos mismos números",
    pantalla.includes("15 al día por alumno (50 para quien da clase)") && pantalla.includes("hasta 15 al día cada uno"), true);

  console.log("\nLa revisión de la explicación: ninguna jugada que no esté en las líneas");
  const re = (nombre) => {
    const m = fn.match(new RegExp("const " + nombre + " = /(.+)/(\\w*);"));
    return m ? new RegExp(m[1], m[2]) : null;
  };
  const RES = ["JUGADA_PIEZA", "CAPTURA_PEON", "ENROQUE"].map(re);
  igual("se encuentran las tres expresiones de la función", RES.every(Boolean), true);
  if (!RES.every(Boolean)) return;
  const sinSignos = (s) => s.replace(/[+#!?]+$/, "");
  const ajenas = (texto, permitidas) => RES.flatMap((r) => texto.match(r) || []).filter((j) => !permitidas.has(sinSignos(j)));
  const lineas = new Set(["Ta8#", "Rf1", "exd5", "O-O", "e8=D"].map(sinSignos));
  igual("lo que está en las líneas pasa (con o sin jaque)", ajenas("Con Ta8# das mate; si no, Ta8 igual amenaza. Después Rf1 y exd5, O-O y e8=D.", lineas), []);
  igual("una jugada de pieza que no está, no", ajenas("Si las negras contestan Cf6, todo cambia.", lineas), ["Cf6"]);
  igual("en inglés tampoco", ajenas("Then Nf3 and Qd1.", lineas), ["Nf3", "Qd1"]);
  igual("una captura de peón que no está, no", ajenas("Ojo con dxe5.", lineas), ["dxe5"]);
  igual("un enroque que no está, no", ajenas("Lo mejor es O-O-O.", lineas), ["O-O-O"]);
  igual("las casillas y las palabras no son jugadas", ajenas("El caballo va a f5. La Dama, el Rey y la torre en la fila 8. A3 no.", lineas), []);
}

const YO = "00000000-0000-4000-8000-0000000000a1";
const ID1 = "11111111-1111-4111-8111-111111111111";
const MATE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const FILAS = [{
  id: ID1, alumno_id: YO, titulo: "Mates", descripcion: "Mis notas secretas", compartido: false, n_capitulos: 1,
  capitulos: [{ titulo: "Mate del pasillo", orientacion: "w", pgn: '[FEN "' + MATE + '"]\n[SetUp "1"]\n\n*\n' }],
  created_at: "2026-10-01T15:00:00Z", updated_at: "2026-10-03T15:00:00Z",
}];

// quedan: lo que contesta ia_explicar_quedan(); respuesta: lo que contesta la función.
function clienteFalso(quedan, respuesta) {
  return `
(function () {
  window.__invocaciones = []; window.__rpc = [];
  window.__respuesta = ${JSON.stringify(respuesta)};
  const TABLAS = { estudios: ${JSON.stringify(FILAS)}, repertorio: [], profiles: [{ id: ${JSON.stringify(YO)}, full_name: "Ana Rojas" }] };
  function consulta(tabla) {
    const filtros = []; let unica = false, accion = null, datos = null;
    const q = {
      select() { return q; }, eq(c, v) { filtros.push([c, v]); return q; }, order() { return q; }, limit() { return q; },
      range() { return q; }, insert(f) { accion = "insert"; datos = f; return q; }, update(f) { accion = "update"; datos = f; return q; },
      delete() { accion = "delete"; return q; }, maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        let f = (TABLAS[tabla] || []).filter((x) => filtros.every(([c, v]) => String(x[c]) === String(v)));
        if (accion === "update") f.forEach((x) => Object.assign(x, datos));
        return Promise.resolve({ data: unica ? (f[0] || null) : f, error: null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(YO)} }, access_token: "t" } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => consulta(t),
    rpc: (nombre) => { window.__rpc.push(nombre);
      if (nombre === "ia_explicar_quedan") return Promise.resolve({ data: ${JSON.stringify(quedan)}, error: null });
      return consulta("rpc"); },
    functions: { invoke: (nombre, opciones) => {
      window.__invocaciones.push({ nombre, body: JSON.parse(JSON.stringify(opciones.body)) });
      const r = window.__respuesta;
      return Promise.resolve(r.error ? { data: null, error: { context: { json: () => Promise.resolve(r) } } } : { data: r, error: null });
    } },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, quedan, respuesta) {
  const { contestarAvisos } = require("./lib/avisos-prueba.js");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(quedan, respuesta) }));
  await ctx.addInitScript(contestarAvisos);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await page.goto(BASE + "/entreno/mis-estudios.html?id=" + ID1, { waitUntil: "networkidle" });
  await page.waitForSelector("#vista-estudio:not(.hidden) #tablero .sq", { timeout: 10000 }).catch(() => {});
  return { page, ctx, errores };
}

const visible = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return !!n && n.checkVisibility(); }, sel);
async function motorTermina(page) {
  await page.click("#motor-boton");
  await page.waitForFunction(() => { const b = document.getElementById("explicar-boton"); return b && !b.disabled; }, null, { timeout: 40000 }).catch(() => {});
}

async function pruebaNavegador() {
  const { chromium } = require("./lib/playwright-con-sesion");
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  try {
    console.log("\nSin IA, no hay botón");
    {
      const { page, ctx, errores } = await abrir(browser, null, { ok: true, texto: "x" });
      await page.waitForTimeout(500);
      igual("preguntó si hay IA", await page.evaluate(() => window.__rpc.includes("ia_explicar_quedan")), true);
      igual("y como no hay, el botón no existe", await page.evaluate(() => !!document.getElementById("explicar-boton")), false);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\nCon IA: la explicación de las líneas que se ven");
    {
      const texto = "Con Ta8# das mate: el rey no tiene casillas porque sus propios peones lo encierran. Es el mate del pasillo. Re1 no hace falta.";
      const { page, ctx, errores } = await abrir(browser, 3, { ok: true, texto, quedan: 2 });
      await page.waitForSelector("#explicar-boton", { timeout: 5000 }).catch(() => {});
      igual("el botón está, pero apagado hasta que el motor termine",
        [await visible(page, "#explicar-boton"), await page.evaluate(() => document.getElementById("explicar-boton").disabled)], [true, true]);
      igual("y dice por qué", await page.textContent("#explicar-estado"), "Analiza la posición con el motor y espera a que termine para pedir la explicación.");
      await motorTermina(page);
      igual("con las líneas terminadas se enciende y dice cuántas quedan", [await page.evaluate(() => document.getElementById("explicar-boton").disabled), await page.textContent("#explicar-estado")],
        [false, "Te quedan 3 explicaciones hoy."]);
      await page.click("#explicar-boton");
      await page.waitForFunction(() => { const s = document.getElementById("explicar-salida"); return s && !s.hidden; }, null, { timeout: 5000 }).catch(() => {});
      const inv = await page.evaluate(() => window.__invocaciones);
      igual("llama una vez a explicar-posicion", inv.map((i) => i.nombre), ["explicar-posicion"]);
      const body = inv[0] && inv[0].body;
      igual("viaja SOLO la posición y las líneas", body && Object.keys(body), ["fen", "lineas"]);
      igual("la posición es la del tablero", body && body.fen, MATE);
      igual("las líneas van en UCI, con su puntaje desde las blancas", body && [body.lineas[0].pv[0], body.lineas[0].puntaje], ["a1a8", { mate: 1 }]);
      igual("ni el título ni la descripción del estudio", JSON.stringify(body).includes("Mis notas") || JSON.stringify(body).includes("Mates\""), false);
      igual("el texto se muestra tal cual (la R es el rey, no una torre)", await page.textContent("#explicar-texto"), texto);
      igual("con el aviso de que la cuenta una IA", /inteligencia artificial/.test(await page.textContent("#explicar-salida")), true);
      igual("y ahora le quedan 2", await page.textContent("#explicar-estado"), "Te quedan 2 explicaciones hoy.");
      // «Agregar» deja la línea como variante SIN mover el tablero: la
      // explicación sigue siendo de esta posición.
      await page.click("#motor-lineas li button");
      await page.waitForTimeout(300);
      igual("agregar la línea no mueve el tablero: la explicación sigue", await visible(page, "#explicar-salida"), true);
      // Ir a la jugada: otra posición, y la explicación ya no es de este tablero.
      await page.click("#arbol .jug");
      await page.waitForTimeout(300);
      igual("al cambiar de posición, la explicación vieja se va", await visible(page, "#explicar-salida"), false);
      igual("y el botón se apaga hasta que el motor termine otra vez", await page.evaluate(() => document.getElementById("explicar-boton").disabled), true);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\nSe acabaron las de hoy");
    {
      const { page, ctx, errores } = await abrir(browser, 1, { error: "tope_dia", mensaje: "Ya usaste las explicaciones de hoy." });
      await page.waitForSelector("#explicar-boton", { timeout: 5000 }).catch(() => {});
      await motorTermina(page);
      igual("con una sola, lo dice en singular", await page.textContent("#explicar-estado"), "Te queda 1 explicación hoy.");
      await page.click("#explicar-boton");
      await page.waitForFunction(() => document.getElementById("explicar-boton").disabled, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(200);
      igual("el botón se apaga y dice que mañana hay más", [await page.evaluate(() => document.getElementById("explicar-boton").disabled), await page.textContent("#explicar-estado")],
        [true, "Ya usaste las explicaciones de hoy. Mañana tienes más."]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\nLa IA se apagó mientras tanto");
    {
      const { page, ctx, errores } = await abrir(browser, 5, { error: "no_disponible" });
      await page.waitForSelector("#explicar-boton", { timeout: 5000 }).catch(() => {});
      await motorTermina(page);
      await page.click("#explicar-boton");
      await page.waitForFunction(() => !document.getElementById("explicar-posicion"), null, { timeout: 5000 }).catch(() => {});
      igual("el botón desaparece", await page.evaluate(() => !!document.getElementById("explicar-posicion")), false);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\nUna explicación rechazada por la función");
    {
      const { page, ctx, errores } = await abrir(browser, 5, { error: "La explicación no salió bien, así que no te la mostramos. Prueba otra vez." });
      await page.waitForSelector("#explicar-boton", { timeout: 5000 }).catch(() => {});
      await motorTermina(page);
      await page.click("#explicar-boton");
      await page.waitForFunction(() => /no salió bien/.test(document.getElementById("explicar-estado").textContent), null, { timeout: 5000 }).catch(() => {});
      igual("no muestra nada y dice por qué", [await visible(page, "#explicar-salida"), await page.textContent("#explicar-estado")],
        [false, "La explicación no salió bien, así que no te la mostramos. Prueba otra vez."]);
      igual("y se puede volver a pedir", await page.evaluate(() => document.getElementById("explicar-boton").disabled), false);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  pruebaSinNavegador();
  if (!process.argv.includes("--sin-navegador")) await pruebaNavegador();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\n«Explícame esta posición» hace lo que debe.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
