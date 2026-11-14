/* Pareo Integral: los torneos guardados en la cuenta (js/pareo/nube.js).
 *
 * La base (public.pareo_nube_*) se reemplaza por un doble en Node que hace lo
 * mismo que las funciones de la migración —versión, conflicto, marca de
 * borrado, consentimiento— y que comparten todas las «computadoras» (cada una
 * un contexto de navegador, con su propio localStorage). Lo que se prueba,
 * porque se rompe sin dar ningún error:
 *   1. sin sesión con auth (el doble de Realtime de las demás pruebas) no se ve
 *      nada nuevo ni se llama a la base: Pareo sigue como siempre;
 *   2. apagado se ofrece con su botón (aria-expanded) y su casilla con enlace a
 *      privacidad.html; sin marcarla NO se activa;
 *   3. al activarlo se suben los torneos de este navegador, salvo el vacío
 *      que la página crea sola, y el aviso «solo en este navegador» se esconde;
 *   4. un cambio se sube solo unos segundos después, con la versión que tenía;
 *   5. en otra computadora, con la misma cuenta, los torneos aparecen solos,
 *      iguales, y el torneo vacío del arranque se quita;
 *   6. si otra computadora guardó antes, no se pisa nada: queda la versión de
 *      la cuenta y lo de aquí como «(copia de esta computadora)»;
 *   7. un torneo borrado en una computadora se quita en la otra;
 *   8. una computadora que ya tenía torneos pregunta antes de subirlos, y
 *      «Dejarlos solo aquí» no los sube;
 *   9. otra cuenta en el mismo navegador no recibe los torneos de la primera;
 *  10. apagarlo deja de subir y, si se pide, borra las copias de la cuenta.
 *
 * Lo que hace cumplir la BASE (solo la cuenta dueña lee y escribe; sin
 * consentimiento o sin licencia no acepta torneos) se comprobó impersonando
 * roles en SQL: acá la base es de mentira.
 *
 * Se corre con verificar-todo.js (abre Pareo con el candado de prueba):
 *       node herramientas/verificar-todo.js pareo-nube
 */
const path = require("path");
const { chromium } = require("playwright");
const P = require("./lib/pareo-pruebas");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const X = require(path.join(RAIZ, "js/pareo/textos.js"));

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(f, ms) {
  const fin = Date.now() + (ms || 15000);
  while (Date.now() < fin) { if (await f()) return true; await esperar(150); }
  return false;
}

const U1 = "00000000-0000-4000-8000-0000000000a1";
const U2 = "00000000-0000-4000-8000-0000000000b2";

// JSON con las claves en orden, como compara la nube (la base reordena).
const canon = (x) => Array.isArray(x) ? "[" + x.map(canon).join(",") + "]"
  : x && typeof x === "object" ? "{" + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(x[k])).join(",") + "}"
    : JSON.stringify(x === undefined ? null : x);

// ---------- El doble de la base: las funciones de la migración ----------
const base = { cuentas: new Set(), torneos: new Map(), llamadas: [] };
const clave = (u, id) => u + "|" + id;
function rpc(uid, nombre, a) {
  base.llamadas.push({ uid, nombre, a });
  a = a || {};
  if (nombre === "tengo_herramienta") return true;
  if (nombre === "pareo_nube_estado") return { activa: base.cuentas.has(uid), consentido_en: null };
  if (nombre === "pareo_nube_activar") { base.cuentas.add(uid); return { activa: true }; }
  if (nombre === "pareo_nube_apagar") {
    base.cuentas.delete(uid);
    let n = 0;
    if (a.p_borrar) for (const k of [...base.torneos.keys()]) if (k.startsWith(uid + "|")) { base.torneos.delete(k); n++; }
    return { activa: false, borrados: n };
  }
  const mios = () => [...base.torneos.entries()].filter(([k]) => k.startsWith(uid + "|")).map(([, v]) => v);
  if (nombre === "pareo_nube_lista") return mios().map((t) => ({ id: t.id, nombre: t.nombre, evento: t.evento, version: t.version, borrado: t.borrado, actualizado: t.actualizado }));
  if (nombre === "pareo_nube_traer") {
    if ((a.p_ids || []).length > 20) throw new Error("Hasta 20 torneos por pedido");
    return mios().filter((t) => a.p_ids.includes(t.id)).map((t) => JSON.parse(JSON.stringify(t)));
  }
  const puedeEscribir = () => { if (!base.cuentas.has(uid)) throw new Error("new row violates row-level security policy"); };
  if (nombre === "pareo_nube_guardar") {
    const t = base.torneos.get(clave(uid, a.p_id));
    if (!t) {
      puedeEscribir();
      base.torneos.set(clave(uid, a.p_id), { id: a.p_id, nombre: a.p_nombre, evento: a.p_evento, datos: a.p_datos, version: 1, borrado: false, actualizado: Date.now() });
      return { ok: true, version: 1 };
    }
    if (t.version !== (a.p_version || 0)) return { conflicto: true, version: t.version };
    puedeEscribir();
    Object.assign(t, { nombre: a.p_nombre, evento: a.p_evento, datos: a.p_datos, borrado: false, version: t.version + 1, actualizado: Date.now() });
    return { ok: true, version: t.version };
  }
  if (nombre === "pareo_nube_borrar") {
    const t = base.torneos.get(clave(uid, a.p_id));
    if (!t) return { ok: true, version: 0 };
    if (t.version !== (a.p_version || 0)) return { conflicto: true, version: t.version };
    puedeEscribir();
    Object.assign(t, { datos: null, evento: null, borrado: true, version: t.version + 1, actualizado: Date.now() });
    return { ok: true, version: t.version };
  }
  throw new Error("función desconocida " + nombre);
}

// Una «computadora»: un contexto con su localStorage, la sesión de `uid` y el
// doble de la base. `torneos`: lo que ya tenía guardado ese navegador.
async function computadora(browser, uid, torneos, conDoble = true) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    if (conDoble) {
      await p.exposeFunction("__nubeRpc", (u, n, a) => {
        try { return { data: rpc(u, n, a), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; }
      });
      await p.addInitScript((u) => {
        const canales = window.sb;
        window.sb = Object.assign({}, canales, {
          auth: { getSession: async () => ({ data: { session: { user: { id: u } } } }) },
          rpc: (n, a) => window.__nubeRpc(u, n, a),
        });
      }, uid);
    }
    await p.addInitScript((lista) => {
      if (localStorage.getItem("pareo_lista_v1") || !lista) return;
      localStorage.setItem("pareo_lista_v1", JSON.stringify(lista.map((t, i) => ({ id: t.__id, nombre: t.nombre, actualizado: 100 + i }))));
      for (const t of lista) localStorage.setItem("pareo_torneo_v1_" + t.__id, JSON.stringify(Object.assign({}, t, { __id: undefined })));
    }, torneos || null);
  });
  return { ctx, page, errores };
}
const leerLocal = (page) => page.evaluate(() => {
  const lista = JSON.parse(localStorage.getItem("pareo_lista_v1") || "[]");
  return lista.map((x) => ({ id: x.id, nombre: x.nombre, t: JSON.parse(localStorage.getItem("pareo_torneo_v1_" + x.id) || "null") }));
});
const estadoNube = (page) => page.evaluate(() => window.PareoNube.estado);

function torneo(id, nombre, n) {
  const t = T.nuevo({ nombre, rondasTotales: 3,
    jugadores: Array.from({ length: n || 4 }, (_, k) => ({ id: id + "j" + k, nombre: "PRUEBA " + nombre + " " + k, elo: 1800 - k * 50, nacimiento: "2014-01-0" + (k + 1) })) });
  return Object.assign(t, { __id: id });
}
async function renombrar(page, nombre) {
  await page.click('[data-ficha="torneo"]');
  await page.fill('#pi-form-torneo [name="nombre"]', nombre);
  await page.press('#pi-form-torneo [name="nombre"]', "Tab");
}
async function aceptarDialogo(page, texto, boton) {
  const d = await page.waitForSelector("dialog[data-avisos][open]", { timeout: 8000 });
  const t = await d.textContent();
  if (texto && !texto.test(t)) mal("el diálogo dice lo esperado", t.slice(0, 200));
  await d.$(boton === "cancelar" ? "[data-avisos-cancelar]" : "[data-avisos-aceptar]").then((b) => b.click());
  // Se espera a que se vaya ESTE diálogo, no a que no quede ninguno: cuando
  // detrás viene otro (apagar pregunta dos veces), el segundo se abre antes
  // del primer sondeo y «ninguno abierto» no llega nunca.
  await page.waitForFunction((el) => !el.isConnected, d);
}

(async () => {
  console.log("=== 0. Los textos de la nube ===");
  {
    const fs = require("fs");
    const js = fs.readFileSync(path.join(RAIZ, "js/pareo/nube.js"), "utf8");
    const usadas = [...new Set([...js.matchAll(/\btx\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]))];
    const faltan = usadas.filter((k) => !X.TEXTOS[k]);
    ok(usadas.length > 20 && !faltan.length, `las ${usadas.length} claves de nube.js están en textos.js`, faltan.join(", "));
  }

  const browser = await chromium.launch({ executablePath: require("fs").existsSync(CHROME) ? CHROME : undefined });

  console.log("\n=== 1. Sin sesión con auth: nada cambia ===");
  {
    const { ctx, page, errores } = await computadora(browser, U1, [torneo("tz1", "SIN NUBE")], false);
    await esperar(800);
    ok(!(await P.vis(page, "#pi-nube")), "la caja de la nube no se ve");
    ok(await P.vis(page, '[data-t="privado"]'), "sigue el aviso «queda guardado solo en este navegador»");
    ok(!base.llamadas.length, "no se llamó a la base", JSON.stringify(base.llamadas.slice(0, 2)));
    ok(!errores.length, "sin errores en la página", errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== 2-4. Computadora A: activar y subir ===");
  const A1 = torneo("ta1", "ABIERTO SUB-12");
  const A2 = torneo("ta2", "ABIERTO SUB-16", 6);
  const A = await computadora(browser, U1, [A1, A2]);
  await A.page.waitForSelector("#pi-nube-abrir");
  ok(await P.vis(A.page, "#pi-nube"), "se ve «Guardar mis torneos en mi cuenta»");
  ok(await A.page.$eval("#pi-nube-abrir", (b) => b.getAttribute("aria-expanded")) === "false", "el botón dice que está cerrado (aria-expanded)");
  await A.page.click("#pi-nube-abrir");
  ok(await A.page.$eval("#pi-nube-abrir", (b) => b.getAttribute("aria-expanded")) === "true" && await P.vis(A.page, "#pi-nube-caja"), "al tocarlo se abre la explicación y dice que está abierta");
  ok(await A.page.$eval('#pi-nube-caja a[href="privacidad.html"]', (a) => a.checkVisibility()).catch(() => false), "la casilla lleva el enlace a privacidad.html");
  await A.page.click("#pi-nube-activar");
  await A.page.waitForSelector('.avisos-mensaje[data-tipo="error"]');
  ok(!base.cuentas.has(U1) && !base.llamadas.some((x) => x.nombre === "pareo_nube_activar"), "sin marcar la casilla no se activa (y lo dice)");
  await A.page.check("#pi-nube-acepto");
  await A.page.click("#pi-nube-activar");
  ok(await hasta(() => base.torneos.size === 2), "al activarlo se suben los dos torneos", [...base.torneos.keys()].join(", "));
  const vacioDeA = (await leerLocal(A.page)).filter((x) => !["ta1", "ta2"].includes(x.id));
  ok(![...base.torneos.values()].some((t) => !t.nombre), "el torneo vacío del arranque no se sube", JSON.stringify(vacioDeA.map((x) => x.id)));
  const subidoA2 = base.torneos.get(clave(U1, "ta2"));
  ok(subidoA2 && canon(subidoA2.datos) === canon((await leerLocal(A.page)).find((x) => x.id === "ta2").t), "lo subido es el torneo tal cual está en el navegador");
  ok(await A.page.waitForSelector("#pi-nube-apagar").then(() => true), "ahora ofrece «Dejar de guardar en mi cuenta»");
  ok(!(await P.vis(A.page, '[data-t="privado"]')), "el aviso «solo en este navegador» ya no se ve");
  ok(await hasta(async () => /Todo guardado/.test(await A.page.$eval("#pi-nube-estado", (p) => p.textContent))), "el estado dice que está todo guardado");

  // El torneo abierto en A es el último que se usó; se abre ta1 y se renombra.
  await A.page.selectOption("#pi-lista", "ta1");
  await renombrar(A.page, "ABIERTO SUB-12 FINAL");
  ok(await hasta(() => { const t = base.torneos.get(clave(U1, "ta1")); return t && t.version === 2 && t.nombre === "ABIERTO SUB-12 FINAL"; }), "un cambio se sube solo unos segundos después (versión 2)",
    JSON.stringify(base.torneos.get(clave(U1, "ta1")) || {}).slice(0, 200));

  console.log("\n=== 5. Computadora B, la misma cuenta: aparecen solos ===");
  const B = await computadora(browser, U1, null);
  ok(await hasta(async () => (await leerLocal(B.page)).length === 2), "B tiene los dos torneos de la cuenta", JSON.stringify((await leerLocal(B.page)).map((x) => x.nombre)));
  const enB = await leerLocal(B.page);
  ok(enB.every((x) => x.t && canon(x.t) === canon(base.torneos.get(clave(U1, x.id)).datos)), "iguales a los de la cuenta (con jugadores y fechas)");
  ok(!enB.some((x) => !x.t || !x.t.nombre), "el torneo vacío del arranque se quitó");
  ok(await B.page.$$eval("#pi-lista option", (o) => o.map((x) => x.textContent).join("|")).then((s) => /SUB-12 FINAL/.test(s) && /SUB-16/.test(s)), "la lista «Torneo abierto» los muestra");
  ok(await P.vis(B.page, "#pi-nube-apagar"), "B guarda en la cuenta sin volver a preguntar el consentimiento");
  ok(!base.llamadas.some((x) => x.nombre === "pareo_nube_guardar" && x.a.p_nombre === ""), "B no subió ningún torneo vacío");

  console.log("\n=== 6. Las dos cambian lo mismo: nada se pisa ===");
  // B renombra ta2 y lo sube; A, que no se enteró, también lo cambia.
  await B.page.selectOption("#pi-lista", "ta2");
  await renombrar(B.page, "SUB-16 DESDE B");
  ok(await hasta(() => base.torneos.get(clave(U1, "ta2")).version === 2), "B sube su cambio (versión 2)");
  await A.page.selectOption("#pi-lista", "ta2");
  await renombrar(A.page, "SUB-16 DESDE A");
  ok(await hasta(async () => (await leerLocal(A.page)).some((x) => /copia de esta computadora/.test(x.nombre))), "en A, lo suyo quedó como «(copia de esta computadora)»",
    JSON.stringify((await leerLocal(A.page)).map((x) => x.nombre)));
  const enA = await leerLocal(A.page);
  ok(enA.find((x) => x.id === "ta2").nombre === "SUB-16 DESDE B", "y ta2 en A es la versión de la cuenta (la de B)");
  ok(base.torneos.get(clave(U1, "ta2")).nombre === "SUB-16 DESDE B", "la cuenta no se pisó");
  ok(await hasta(() => [...base.torneos.values()].some((t) => /SUB-16 DESDE A \(copia/.test(t.nombre))), "la copia también se sube a la cuenta");

  console.log("\n=== 7. Borrar en una, se quita en la otra ===");
  await A.page.selectOption("#pi-lista", "ta1");
  await A.page.click('[data-ficha="archivos"]');
  await A.page.click("#pi-borrar");
  await aceptarDialogo(A.page, /SUB-12 FINAL/);
  ok(await hasta(() => base.torneos.get(clave(U1, "ta1")).borrado), "en la cuenta queda la marca de borrado");
  await B.page.click("#pi-nube-ahora");
  ok(await hasta(async () => !(await leerLocal(B.page)).some((x) => x.id === "ta1")), "B lo quita al revisar");
  await esperar(500);
  ok(base.torneos.get(clave(U1, "ta1")).borrado, "y B no lo vuelve a subir");

  console.log("\n=== 8. Una computadora con torneos propios pregunta ===");
  const C = await computadora(browser, U1, [torneo("tc1", "TORNEO DEL CLUB")]);
  await aceptarDialogo(C.page, /ya tiene 1 torneo/, "cancelar");
  ok(await hasta(async () => (await leerLocal(C.page)).length >= 3), "C trae los de la cuenta", JSON.stringify((await leerLocal(C.page)).map((x) => x.nombre)));
  await esperar(4000);
  ok(!base.torneos.has(clave(U1, "tc1")), "«Dejarlos solo aquí»: el torneo de C no se sube");
  ok((await leerLocal(C.page)).some((x) => x.id === "tc1"), "y sigue en C");
  await C.page.selectOption("#pi-lista", "tc1");
  await renombrar(C.page, "TORNEO DEL CLUB 2");
  await esperar(4000);
  ok(!base.torneos.has(clave(U1, "tc1")), "aunque se cambie, sigue solo en C");
  ok(!C.errores.length, "sin errores en C", C.errores.join(" | "));
  await C.ctx.close();

  console.log("\n=== 9. Otra cuenta en el mismo navegador ===");
  // El mismo localStorage de A, con otra sesión.
  base.cuentas.add(U2);
  const estadoA = await A.ctx.storageState();
  await A.ctx.close();
  const ctx2 = await browser.newContext({ storageState: estadoA, serviceWorkers: "block", viewport: { width: 1280, height: 1000 } });
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => { window.sb = { channel() { return { on() { return this; }, subscribe() { return this; }, send() { return Promise.resolve(); }, unsubscribe() { return Promise.resolve(); } }; } }; });
  await p2.exposeFunction("__nubeRpc", (u, n, a) => { try { return { data: rpc(u, n, a), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } });
  await p2.addInitScript((u) => { window.sb = Object.assign({}, window.sb, { auth: { getSession: async () => ({ data: { session: { user: { id: u } } } }) }, rpc: (n, a) => window.__nubeRpc(u, n, a) }); }, U2);
  await p2.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await p2.goto(BASE + "/pareo.html", { waitUntil: "networkidle" });
  await p2.waitForSelector("#pi-nube-usar");
  ok(/otra cuenta/.test(await p2.$eval("#pi-nube", (c) => c.textContent)), "dice que este navegador guarda en otra cuenta");
  await esperar(4000);
  ok(![...base.torneos.keys()].some((k) => k.startsWith(U2 + "|")), "a la otra cuenta no se le sube nada");
  await ctx2.close();

  console.log("\n=== 10. Apagarlo ===");
  await B.page.click("#pi-nube-apagar");
  await aceptarDialogo(B.page, /dejan de guardarse/);
  await aceptarDialogo(B.page, /Borro también/, "cancelar");
  ok(await hasta(() => !base.cuentas.has(U1)), "la cuenta queda apagada");
  ok([...base.torneos.keys()].some((k) => k.startsWith(U1 + "|")), "«Dejarlas»: las copias de la cuenta siguen");
  await B.page.waitForSelector("#pi-nube-abrir");
  const antes = base.llamadas.length;
  await B.page.selectOption("#pi-lista", "ta2");
  await renombrar(B.page, "YA NO SE SUBE");
  await esperar(4000);
  ok(!base.llamadas.slice(antes).some((x) => x.nombre === "pareo_nube_guardar"), "apagado, un cambio ya no se sube");
  // Volver a activarlo y apagarlo borrando.
  await B.page.click("#pi-nube-abrir");
  await B.page.check("#pi-nube-acepto");
  await B.page.click("#pi-nube-activar");
  ok(await hasta(() => base.torneos.get(clave(U1, "ta2")).nombre === "YA NO SE SUBE"), "al volver a activarlo, sube lo que cambió mientras");
  await B.page.waitForSelector("#pi-nube-apagar");
  await B.page.click("#pi-nube-apagar");
  await aceptarDialogo(B.page, /dejan de guardarse/);
  await aceptarDialogo(B.page, /Borro también/);
  ok(await hasta(() => ![...base.torneos.keys()].some((k) => k.startsWith(U1 + "|"))), "«Borrar las copias de mi cuenta» las borra");
  ok((await leerLocal(B.page)).length >= 2, "y los de este navegador se quedan");
  ok(!B.errores.length, "sin errores en B", B.errores.join(" | "));
  await B.ctx.close();

  await browser.close();
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
