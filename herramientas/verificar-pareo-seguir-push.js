/* «Torneos en Pareo Integral»: los avisos de quien sigue a un jugador, en el
 * celular (push): supabase/functions/pareo-publicar/index.ts, la migración
 * 20261023220000_pareo_seguir_push.sql y el botón «Avisarme en este celular»
 * de js/torneos-pareo-pagina.js.
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - la función: solo manda a los servicios de avisos de los navegadores
 *     (no a una dirección cualquiera), anota cada aviso ANTES de mandarlo
 *     (su clave única evita el doble), borra el aparato que el servicio ya no
 *     reconoce, y el de prueba («Listo») sale al suscribirse;
 *   - los avisos push salen con los mismos textos que el correo y llevan al
 *     torneo del propio sitio;
 *   - la base: nadie de afuera lee las suscripciones, el tope de 20 por
 *     aparato, y la baja con el endpoint;
 *   - webpush.ts tiene una sola copia (en _compartido) para notificar y
 *     pareo-publicar;
 *   - la página: el permiso se pide solo al tocar el botón; sin permiso, lo
 *     dice y no guarda nada; con permiso, manda la suscripción del navegador
 *     con el nombre y la huella; el botón dice si está encendido y apagarlo
 *     manda la baja; un navegador sin avisos no muestra el botón.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-seguir-push.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { columnasPedidas, dobleListaPareo } = require("./lib/pareo-pruebas");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const PP = require(path.join(RAIZ, "js/pareo/publicar.js"));

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), m, "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));

console.log("\n=== La función ===");
const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/pareo-publicar/index.ts"), "utf8");
const m = fn.match(/const SERVICIO_PUSH = (\/.*\/);/);
// La expresión tal cual está en la función (sin las barras de los extremos).
const SERVICIO = m ? new RegExp(m[1].slice(1, -1)) : null;
ok(SERVICIO && ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QK", "https://wns2-par02p.notify.windows.com/w/?t=1"].every((u) => SERVICIO.test(u)),
  "acepta los servicios de avisos de los navegadores");
ok(SERVICIO && ["https://evil.com/fcm.googleapis.com/", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.com/x", "https://push.apple.com.evil.com/x", "https://localhost/x"].every((u) => !SERVICIO.test(u)),
  "y ninguna otra dirección (la función no le manda nada a quien alguien escriba)");
const push = fn.slice(fn.indexOf("async function avisarPush"), fn.indexOf("function enSegundoPlano"));
const anota = push.indexOf('from("pareo_avisos_push_enviados").insert('), manda = push.indexOf("await mandarPush(");
ok(anota > 0 && manda > anota && /if \(error\) continue;/.test(push.slice(anota, manda)), "anota el aviso ANTES de mandarlo y, si ya estaba, no lo manda");
ok(/textoRonda\(ahora, s\.jugador, s\.nombre/.test(push) && /textoFin\(ahora, s\.jugador, s\.nombre\)/.test(push), "con los mismos textos que el correo");
ok(/url: "\/torneos-pareo\.html#t=" \+ pid/.test(push), "y lleva al torneo, en el propio sitio");
ok(/if \(!r\.ok && r\.caduca\) await admin\.from\("pareo_suscripciones_push"\)\.delete\(\)\.eq\("endpoint", s\.endpoint\)/.test(push), "el aparato que el servicio ya no reconoce se borra");
ok(/enSegundoPlano\(avisarPush\(pid, que, ahora\)\)/.test(fn), "sale junto con los correos, sin esperarlos");
const seguir = fn.slice(fn.indexOf('accion === "seguir_push"'), fn.indexOf('accion === "seguir_push_baja"'));
ok(/SERVICIO_PUSH\.test\(endpoint\)/.test(seguir) && /pareo_correo_frenar/.test(seguir), "suscribirse: con el servicio comprobado y con freno");
ok(/titulo: "Listo: sigues a "/.test(seguir) && /prueba\.caduca/.test(seguir), "manda el aviso de prueba y, si no llega, no deja la suscripción");
ok(/import \{ type LlavesVapid, mandar as mandarPush \} from "\.\/webpush\.ts"/.test(fn), "usa el webpush.ts de la Academia");

console.log("\n=== Una sola copia de webpush.ts ===");
ok(fs.existsSync(path.join(RAIZ, "supabase/functions/_compartido/webpush.ts")) && !fs.existsSync(path.join(RAIZ, "supabase/functions/notificar/webpush.ts"))
  && !fs.existsSync(path.join(RAIZ, "supabase/functions/pareo-publicar/webpush.ts")), "vive en _compartido, y ninguna función tiene la suya");
const armar = fs.readFileSync(path.join(RAIZ, "herramientas/funciones-armar.js"), "utf8");
ok(/"pareo-publicar": \["marca-correo\.ts", "webpush\.ts"\]/.test(armar) && /"notificar": \["webpush\.ts"\]/.test(armar), "y funciones-armar.js la copia a las dos");

console.log("\n=== La base ===");
const sql = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261023220000_pareo_seguir_push.sql"), "utf8");
ok(/revoke all on public\.pareo_suscripciones_push from anon, authenticated/.test(sql) && !/create policy/.test(sql), "nadie de afuera lee las suscripciones");
ok(/grant execute on function public\.pareo_suscriptores_push_de\(uuid\) to service_role/.test(sql) && /revoke all on function public\.pareo_suscriptores_push_de\(uuid\) from public, anon, authenticated/.test(sql), "ni los aparatos que siguen a un torneo");
ok(/>= 20 then\s+return 'tope'/.test(sql), "como mucho 20 jugadores por aparato");
ok(/primary key \(suscripcion_id, torneo_id, que\)/.test(sql), "la base no deja anotar el mismo aviso dos veces");
ok(!/correo|nombre text/.test(sql.split("create table public.pareo_suscripciones_push")[1].split(");")[0]), "la tabla no tiene dónde guardar un correo ni un nombre");

// ---- la página ----
const HA = "aaaaaaaaaaaaaaaaaaaaaaaa";
function torneo() {
  const t = T.nuevo({ nombre: "PRUEBA PUSH", rondasTotales: 1, mesaInicial: 1, fechaInicio: "2026-10-01", jugadores: [{ id: "a", nombre: "Ana Pérez", elo: 1700 }, { id: "b", nombre: "Beto", elo: 1600 }] });
  t.rondas = [{ mesas: [{ b: "a", n: "b", r: "1-0" }], ausencias: {} }];
  const datos = PP.datosPublicos(t);
  datos.jugadores.forEach((j) => { delete j.fideId; if (j.id === "a") j.ident = HA; });
  return { id: "33333333-3333-4333-8333-000000000001", nombre: "PRUEBA PUSH", evento: "", lugar: "", fecha: "2026-10-01", rondas: 1, rondas_total: 1, jugadores: 2, actualizado: "2026-10-01T20:00:00Z", organizador_id: null, datos };
}
const json = (route, x, status) => route.fulfill({ status: status || 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
// El navegador de mentira: el permiso, el service worker y el pushManager.
const NAVEGADOR = (permiso) => `
  window.__permisoPedido = 0;
  window.Notification = window.Notification || function () {};
  Notification.requestPermission = async () => { window.__permisoPedido++; return ${JSON.stringify(permiso)}; };
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/PRUEBA", toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "BPRUEBAPRUEBAPRUEBAPRUEBAPRUEBA", auth: "AUTHPRUEBA12" } }; } };
  // Como un navegador de verdad, la suscripción sigue ahí al volver.
  let suscrito = localStorage.getItem("__sub") ? sub : null;
  const reg = { pushManager: { getSubscription: async () => suscrito, subscribe: async (o) => { window.__llave = o.applicationServerKey && o.applicationServerKey.length; suscrito = sub; localStorage.setItem("__sub", "1"); return sub; } } };
  Object.defineProperty(navigator, "serviceWorker", { value: { ready: Promise.resolve(reg), register: async () => reg, addEventListener() {}, controller: null }, configurable: true });
  if (!("PushManager" in window)) window.PushManager = function () {};`;
async function abrir(browser, hash, permiso, sinPush) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [], pedidos = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.addInitScript(sinPush ? "delete window.PushManager;" : NAVEGADOR(permiso));
  const t = torneo();
  await page.route("**/rest/v1/pareo_publicados**", (route) => {
    const u = new URL(route.request().url());
    const sel = u.searchParams.get("select") || "";
    const objeto = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
    return objeto ? json(route, columnasPedidas(sel, t)) : json(route, [columnasPedidas(sel, t)]);
  });
  await page.route("**/rest/v1/pareo_organizadores**", (route) => json(route, []));
  await dobleListaPareo(page, [t], { hoy: "2026-10-23" });
  await page.route("**/rest/v1/rpc/torneos_externos_lista", (route) => json(route, []));
  await page.route("**/rest/v1/rpc/pareo_torneos_de", (route) => json(route, [t]));
  await page.route("**/functions/v1/pareo-publicar", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    const b = JSON.parse(route.request().postData() || "{}");
    pedidos.push(b);
    // Una llave pública de verdad tiene 65 bytes: en base64url, 87 letras.
    return json(route, b.accion === "push_llave" ? { ok: true, llave: "B" + "A".repeat(86) } : { ok: true });
  });
  await page.goto(BASE + "/torneos-pareo.html" + hash, { waitUntil: "networkidle" });
  return { ctx, page, errores, pedidos };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const FICHA = "#p=Ana+P%C3%A9rez&i=" + HA;

  console.log("\n=== La página: sin permiso ===");
  {
    const { ctx, page, errores, pedidos } = await abrir(browser, FICHA, "denied");
    await page.waitForSelector("#tp-push");
    ok(await page.evaluate(() => window.__permisoPedido) === 0, "abrir la ficha no pide el permiso: solo al tocar el botón");
    igual("el botón dice lo que hace, y que está apagado", [await page.textContent("#tp-push"), await page.getAttribute("#tp-push", "aria-pressed")], ["🔔Avisarme en este celular", "false"]);
    await page.click("#tp-push");
    await page.waitForFunction(() => /Sin el permiso/.test(document.getElementById("tp-push-estado").textContent));
    ok(!pedidos.some((p) => p.accion === "seguir_push"), "sin permiso no se guarda nada");
    ok(/privacidad\.html/.test(await page.innerHTML("#tp-push + p")), "y dice qué se guarda, con la política de privacidad");
    ok(!errores.length, "sin errores en la consola", errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== La página: con permiso ===");
  {
    const { ctx, page, errores, pedidos } = await abrir(browser, FICHA, "granted");
    await page.waitForSelector("#tp-push");
    await page.click("#tp-push");
    await page.waitForFunction(() => /Listo/.test(document.getElementById("tp-push-estado").textContent));
    ok(await page.evaluate(() => window.__llave) === 65, "se suscribe con la llave pública del sitio (65 bytes)");
    const s = pedidos.find((p) => p.accion === "seguir_push") || {};
    igual("manda el nombre, la huella y la suscripción del navegador", [s.nombre, s.ident, s.suscripcion && s.suscripcion.endpoint, s.suscripcion && s.suscripcion.keys && s.suscripcion.keys.auth],
      ["Ana Pérez", HA, "https://fcm.googleapis.com/fcm/send/PRUEBA", "AUTHPRUEBA12"]);
    ok(!("correo" in s), "sin ningún correo");
    igual("el botón dice que quedó encendido", [await page.textContent("#tp-push"), await page.getAttribute("#tp-push", "aria-pressed")], ["🔔Avisos en este celular: encendidos", "true"]);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#tp-push");
    igual("y se acuerda al volver", await page.getAttribute("#tp-push", "aria-pressed"), "true");
    await page.click("#tp-push");
    await page.waitForFunction(() => /ya no recibe/.test(document.getElementById("tp-push-estado").textContent));
    const b = pedidos.find((p) => p.accion === "seguir_push_baja") || {};
    igual("apagarlo manda la baja con el mismo aparato y el mismo jugador", [b.nombre, b.ident, b.suscripcion && b.suscripcion.endpoint], ["Ana Pérez", HA, "https://fcm.googleapis.com/fcm/send/PRUEBA"]);
    igual("y vuelve a decir «Avisarme»", await page.getAttribute("#tp-push", "aria-pressed"), "false");
    ok(!errores.length, "sin errores en la consola", errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== La página: un navegador sin avisos ===");
  {
    const { ctx, page } = await abrir(browser, FICHA, "granted", true);
    await page.waitForSelector("#tp-aviso-abrir");
    ok(!(await page.$("#tp-push")), "no muestra el botón (queda el del correo)");
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
