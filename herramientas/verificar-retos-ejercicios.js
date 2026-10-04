#!/usr/bin/env node
/* Comprueba los retos de ejercicios entre compañeros: la lógica de
 * js/reto-ejercicios.js (qué ejercicios se eligen y quién ganó), la página de
 * los retos (reto-ejercicios.html) y el reto jugado dentro de Ejercicios por
 * tema (entreno/temas.html?reto=<id>), con un Supabase de mentira que FILTRA
 * en el resolver y anota lo que se escribe.
 *
 * Lo que se rompe acá no da ningún error: un ganador mal contado, un ejercicio
 * fuera de la dificultad elegida, un segundo intento que se cuela recargando la
 * página, o una pista en un reto que es sin pistas. Quién puede retar a quién y
 * qué se ve del otro lo decide la RLS (probada impersonando roles, ver «Retos
 * de ejercicios entre compañeros» en docs/decisiones/juegos-y-torneos.md).
 *
 *   python3 -m http.server 8777    (desde la raíz del sitio)
 *   node herramientas/verificar-retos-ejercicios.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");
const R = require("../js/reto-ejercicios.js");
const BANCO = require("../entreno/data/temas.json").puzzles;

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(n, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log(`  ✗ ${n}\n      esperaba: ${b}\n      salió:    ${a}`); fallos++; }
  else console.log(`  ✓ ${n}`);
}

function pruebaLogica() {
  console.log("\n=== Qué se elige y quién gana ===");
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
  for (const nivel of ["facil", "medio", "dificil"]) {
    const ids = R.elegir(BANCO, nivel, azar);
    const n = R.NIVELES[nivel];
    igual(`${n.nombre}: cinco distintos del banco, todos en su dificultad`,
      [ids.length, new Set(ids).size, ids.every((id) => BANCO[id] && BANCO[id].rating >= n.desde && BANCO[id].rating <= n.hasta)], [5, 5, true]);
  }
  igual("un nivel que no existe no elige nada", R.elegir(BANCO, "imposible"), []);
  const f = (o) => Object.assign({ vence_at: "2099-01-01T00:00:00Z", mias: 5, mis_aciertos: 3, mi_ms: 60000, del_otro: 5, sus_aciertos: 3, su_ms: 90000, otro_nombre: "Bea" }, o);
  igual("con menos de 5, te toca jugar", R.estado(f({ mias: 2 })).tipo, "jugar");
  igual("terminaste y el otro no: se espera, sin decir cómo le fue", R.estado(f({ del_otro: 2, sus_aciertos: null })).texto, "Resolviste 3 de 5 en 1:00. Esperando a Bea (2 de 5)");
  igual("más aciertos gana", R.estado(f({ mis_aciertos: 4 })).texto, "Ganaste 4 a 3");
  igual("menos aciertos pierde, dicho con el nombre", R.estado(f({ mis_aciertos: 2 })).texto, "Ganó Bea, 3 a 2");
  igual("empatados, desempata el tiempo", R.estado(f({})).texto, "Ganaste por tiempo: 3 a 3, 1:00 contra 1:30");
  igual("empatados en todo, empate", R.estado(f({ su_ms: 60000 })).tipo, "empate");
  igual("vencido sin terminar: se cuenta lo que hay", R.estado(f({ vence_at: "2000-01-01T00:00:00Z", mias: 3, mis_aciertos: 2, del_otro: 1, sus_aciertos: 1 })).texto, "Ganaste 2 a 1");
}

const RETO_ID = "11111111-2222-4333-8444-555555555555";
const IDS = ["0000D", "001xl", "00ZeT", "00rwh", "00voi"];

function clienteFalso(yo, datos) {
  return `
(function () {
  window.__escrituras = []; window.__consultas = [];
  const D = ${JSON.stringify(datos)};
  function consulta(tabla, args) {
    const filtros = []; let accion = null, fila = null, unica = false;
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; }, in() { return q; },
      eq(c, v) { filtros.push(["eq", c, v]); return q; }, neq(c, v) { filtros.push(["neq", c, v]); return q; },
      gte() { return q; },
      insert(f) { accion = "insert"; fila = f; return q; },
      upsert() { return q; }, update() { return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        let f = (D[tabla] || []).filter((x) => filtros.every(([op, c, v]) => op === "eq" ? String(x[c]) === String(v) : String(x[c]) !== String(v)));
        window.__consultas.push({ tabla, filtros: filtros.slice(), args: args || null });
        if (accion === "insert") {
          window.__escrituras.push({ tabla, fila });
          const nueva = Object.assign({ id: "reto-nuevo" }, fila);
          if (tabla === "retos_ejercicios_respuestas") (D[tabla] = D[tabla] || []).push(Object.assign({ alumno_id: ${JSON.stringify(yo)} }, fila));
          f = [nueva];
        }
        return Promise.resolve({ data: unica ? (f[0] || null) : f, error: null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(yo)} }, access_token: "t" } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => consulta(t),
    rpc: (n, a) => consulta("rpc:" + n, a),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel() {},
  };
})();`;
}

async function abrir(browser, ruta, yo, datos, ctxExistente) {
  const ctx = ctxExistente || await browser.newContext({ serviceWorkers: "block" });
  if (!ctxExistente) {
    await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(yo, datos) }));
    await ctx.addInitScript(contestarAvisos);
  }
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

async function pruebaPagina(browser) {
  console.log("\n=== La página de los retos ===");
  const futuro = "2099-01-01T00:00:00Z";
  const fila = (o) => Object.assign({ retador_id: "u-ana", rival_id: "u-bea", retador: "Ana Rojas", rival: "Bea Mora", nivel: "medio", ejercicios: IDS, created_at: "2026-10-01T15:00:00Z", vence_at: futuro, mias: 0, mis_aciertos: 0, mi_ms: 0, del_otro: 0, sus_aciertos: null, su_ms: null }, o);
  const datos = {
    profiles: [{ id: "u-ana", full_name: "Ana Rojas", role: "alumno" }, { id: "u-bea", full_name: "Bea Mora", role: "alumno" }, { id: "u-carlos", full_name: "Carlos Vega", role: "alumno" }, { id: "u-profe", full_name: "Karina", role: "profesor" }],
    "rpc:mis_retos_de_ejercicios": [
      fila({ id: "r1", retador_id: "u-bea", rival_id: "u-ana", retador: "Bea Mora", rival: "Ana Rojas" }),
      fila({ id: "r2", mias: 5, mis_aciertos: 4, mi_ms: 95000, del_otro: 2 }),
      fila({ id: "r3", mias: 5, mis_aciertos: 3, mi_ms: 60000, del_otro: 5, sus_aciertos: 4, su_ms: 50000, rival: "Carlos Vega", rival_id: "u-carlos" }),
    ],
  };
  const { page, ctx, errores } = await abrir(browser, "/reto-ejercicios.html", "u-ana", datos);
  await page.waitForSelector("#mis-retos > li", { timeout: 10000 }).catch(() => {});
  igual("los compañeros para retar: alumnos, sin uno mismo ni el profe",
    await page.evaluate(() => [...document.querySelectorAll("#retar-rival option")].map((o) => o.textContent)), ["Bea Mora", "Carlos Vega"]);
  const retos = await page.evaluate(() => [...document.querySelectorAll("#mis-retos > li")].map((li) => [li.dataset.estado, li.querySelector("p").textContent.trim(), li.querySelectorAll("p")[2].textContent, (li.querySelector("a") || {}).getAttribute ? li.querySelector("a").getAttribute("href") : null]));
  igual("cada reto con su estado, de quién es y a dónde jugarlo", retos, [
    ["jugar", "♟️ Te retó Bea Mora", "Te toca jugar", "entreno/temas.html?reto=r1"],
    ["esperando", "⏳ Retaste a Bea Mora", "Resolviste 4 de 5 en 1:35. Esperando a Bea Mora (2 de 5)", null],
    ["perdiste", "🤝 Retaste a Carlos Vega", "Ganó Carlos Vega, 4 a 3", null],
  ]);

  await page.selectOption("#retar-rival", "u-carlos");
  await page.selectOption("#retar-nivel", "dificil");
  await page.click("#retar-boton");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "retos_ejercicios"), null, { timeout: 15000 }).catch(() => {});
  const ins = await page.evaluate(() => (window.__escrituras.find((e) => e.tabla === "retos_ejercicios") || {}).fila);
  igual("manda el reto al elegido, con 5 ejercicios del banco en la dificultad elegida y sin decir quién reta (lo pone la base)",
    ins && [Object.keys(ins).sort(), ins.rival_id, ins.nivel, ins.ejercicios.length, ins.ejercicios.every((id) => BANCO[id] && BANCO[id].rating >= 1600 && BANCO[id].rating <= 2100)],
    [["ejercicios", "nivel", "rival_id"], "u-carlos", "dificil", 5, true]);
  igual("y ofrece jugarlo ya", await page.evaluate(() => [document.getElementById("retar-estado").textContent, document.querySelector("#retar-estado a").getAttribute("href")]),
    ["Listo: le mandaste el reto a Carlos Vega. Juega tus 5 ahora →", "entreno/temas.html?reto=reto-nuevo"]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaJugar(browser) {
  console.log("\n=== El reto, jugado en Ejercicios por tema ===");
  const datos = {
    retos_ejercicios: [{ id: RETO_ID, retador_id: "u-bea", rival_id: "u-ana", nivel: "medio", ejercicios: IDS, vence_at: "2099-01-01T00:00:00Z" }],
    retos_ejercicios_respuestas: [],
    profiles: [{ id: "u-bea", full_name: "Bea Mora", role: "alumno" }],
  };
  let { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?reto=" + RETO_ID, "u-ana", datos);
  await page.waitForFunction(() => /Reto con Bea Mora/.test(document.getElementById("play-title").textContent), null, { timeout: 20000 }).catch(() => {});
  igual("abre el reto, con el rival y sin pistas, reintentos ni saltar",
    await page.evaluate(() => [document.getElementById("play-title").textContent, document.getElementById("progress-label").textContent,
      ["hint-btn", "retry-btn", "skip-btn"].map((id) => document.getElementById(id).checkVisibility())]),
    ["Reto con Bea Mora", "Reto · ejercicio 1 de 5", [false, false, false]]);

  // Ejercicio 1: la línea entera (Td8, el rival come, Axd8).
  const jugar = (san) => page.evaluate((s) => { const m = game.moves({ verbose: true }).find((x) => x.san === s); playMove(m.from, m.to, m.promotion); }, san);
  await jugar("Rd8");
  await page.waitForTimeout(900);
  await jugar("Bxd8");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "retos_ejercicios_respuestas"), null, { timeout: 5000 }).catch(() => {});
  let r = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "retos_ejercicios_respuestas").map((e) => [e.fila.idx, e.fila.acierto, e.fila.ms >= 0]));
  igual("resuelto: se guarda el 1 como acierto, con su tiempo", r, [[0, true, true]]);
  await page.click("#fin-ejercicio .bctrl.primary");

  // Ejercicio 2: una jugada que no es: un solo intento.
  await page.waitForFunction(() => /ejercicio 2 de 5/.test(document.getElementById("progress-label").textContent), null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { const m = game.moves({ verbose: true }).find((x) => x.san !== "Rf7+"); playMove(m.from, m.to, m.promotion); });
  await page.waitForTimeout(300);
  r = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "retos_ejercicios_respuestas").map((e) => [e.fila.idx, e.fila.acierto]));
  igual("una jugada equivocada termina el ejercicio y cuenta como no resuelto", r, [[0, true], [1, false]]);
  igual("y dice cuál era", /la jugada era Tf7\+\. En el reto hay un solo intento\./.test(await page.textContent("#round-status")), true);
  await page.click("#fin-ejercicio .bctrl.primary");
  await page.waitForFunction(() => /ejercicio 3 de 5/.test(document.getElementById("progress-label").textContent), null, { timeout: 5000 }).catch(() => {});

  // Ejercicio 3 empezado y se recarga: ese ya se jugó.
  igual("pedir pista no hace nada en el reto", await page.evaluate(() => { giveHint(); return usedHintThisPuzzle; }), false);
  await page.close();
  ({ page, errores } = await abrir(browser, "/entreno/temas.html?reto=" + RETO_ID, "u-ana", datos, ctx));
  await page.waitForFunction(() => /ejercicio 4 de 5/.test(document.getElementById("progress-label").textContent), null, { timeout: 20000 }).catch(() => {});
  r = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "retos_ejercicios_respuestas").map((e) => [e.fila.idx, e.fila.acierto]));
  igual("recargar a mitad de uno no da otro intento: cuenta como no resuelto y sigue en el 4", r, [[2, false]]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

(async () => {
  pruebaLogica();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPagina(browser);
    await pruebaJugar(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nLos retos entre compañeros se juegan y se cuentan como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
