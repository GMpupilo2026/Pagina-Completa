/* Lo que comparten las pruebas de Pareo Integral con navegador que juegan
 * un evento de los JDE (verificar-pareo-jde-dia.js y
 * verificar-pareo-jde-sala.js): el doble de Supabase Realtime, abrir la
 * página, anotar resultados y jugar todas las rondas.
 */
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Un doble de Supabase Realtime: cada canal anota lo que manda y deja
// disparar lo que le llega (window.__llega(nombre, evento, payload)).
function dobleSupabase() {
  window.__enviados = [];
  const handlers = {};
  window.__llega = (canal, evento, payload) => (handlers[canal + "|" + evento] || []).forEach((f) => f({ payload }));
  window.sb = {
    channel(nombre) {
      return {
        on(tipo, filtro, f) { (handlers[nombre + "|" + filtro.event] = handlers[nombre + "|" + filtro.event] || []).push(f); return this; },
        subscribe(cb) { if (cb) setTimeout(() => cb("SUBSCRIBED"), 0); return this; },
        send(m) { window.__enviados.push({ canal: nombre, evento: m.event, payload: m.payload }); return Promise.resolve("ok"); },
        unsubscribe() { return Promise.resolve(); },
      };
    },
  };
}

// La confirmación de «cambiar un resultado ya anotado» (la prueba
// verificar-pareo-adjuntos.js, que pone window.__sinAutoConfirmar): en las
// demás pruebas, que cambian resultados a propósito, se acepta sola.
function autoConfirmarCambios() {
  new MutationObserver(() => {
    if (window.__sinAutoConfirmar) return;
    const d = document.querySelector("dialog[data-avisos][open]");
    if (d && !d.__aceptado && /¿Cambiar el resultado de la mesa/.test(d.textContent)) {
      const b = d.querySelector("[data-avisos-aceptar]");
      if (b) { d.__aceptado = true; b.click(); }
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
}

async function abrirPagina(browser, BASE, hash, antes) {
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.addInitScript(dobleSupabase);
  await page.addInitScript(autoConfirmarCambios);
  if (antes) await antes(page);
  await page.goto(BASE + "/pareo.html" + (hash || ""), { waitUntil: "networkidle" });
  await page.evaluate(() => { window.print = () => {}; });
  return { ctx, page, errores };
}

const leerTodos = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("pareo_lista_v1")).map((x) => Object.assign({ idLista: x.id }, JSON.parse(localStorage.getItem("pareo_torneo_v1_" + x.id)))));
const vis = (page, sel) => page.$eval(sel, (n) => n.checkVisibility()).catch(() => false);

// La ronda en pantalla se vuelve a pintar con cada resultado (en equipos,
// entera): cada select se busca de nuevo antes de tocarlo.
async function anotar(page, resultado) {
  const n = await page.$$eval("#pi-ronda select", (l) => l.length);
  for (let i = 0; i < n; i++) {
    const s = (await page.$$("#pi-ronda select"))[i];
    if (!s) break;
    if ((await s.$$eval("option", (o) => o.map((x) => x.value))).includes(resultado)) await s.selectOption(resultado);
  }
}

// Empareja y anota todas las rondas que falten.
async function jugarRondas(page, resultado) {
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const botones = await page.$$("#pi-rondas-nav button");
    if (!botones.length) return;
    await botones[botones.length - 1].click();
    const emparejar = await page.$("#pi-emparejar");
    if (emparejar) {
      await emparejar.click();
      // (Un encuentro perdido por no presentarse no tiene nada que anotar.)
      await page.waitForFunction(() => !document.getElementById("pi-emparejar") && document.querySelector("#pi-rondas-nav"));
    }
    await anotar(page, resultado);
    const nav = await page.$$eval("#pi-rondas-nav button", (l) => l.map((b) => b.textContent));
    if (!nav.some((x) => /por emparejar/.test(x))) return;
  }
  throw new Error("jugarRondas no terminó");
}


// Esperar a que lo guardado cumpla algo: después de cerrar un diálogo, la
// página guarda un instante más tarde (leerlo enseguida es una carrera que
// en el CI a veces se pierde). `cumple` recibe la lista de torneos.
// (La condición va como texto: Playwright la evalúa por su cuenta, así que
// la CSP de la página, que no deja `new Function`, no la frena.)
async function esperarGuardado(page, cumple, arg) {
  const lista = 'JSON.parse(localStorage.getItem("pareo_lista_v1") || "[]").map((x) => Object.assign({ idLista: x.id }, JSON.parse(localStorage.getItem("pareo_torneo_v1_" + x.id))))';
  await page.waitForFunction("(" + cumple.toString() + ")(" + lista + ", " + JSON.stringify(arg) + ")");
  return leerTodos(page);
}

// Las columnas que pide un select de PostgREST a pareo_publicados, como las
// contestaría la base: «id,nombre» y también «alias:datos->>campo» (texto) o
// «alias:datos->campo» (JSON), que la lista usa para no bajarse cada torneo.
function columnasPedidas(sel, fila) {
  const out = {};
  for (const parte of String(sel || "").split(",")) {
    const m = parte.match(/^(\w+):(\w+)->(>?)(\w+)$/);
    if (m) {
      const v = fila[m[2]] ? fila[m[2]][m[4]] : undefined;
      out[m[1]] = v == null ? null : m[3] ? (typeof v === "object" ? JSON.stringify(v) : String(v)) : v;
    } else if (parte in fila) out[parte] = fila[parte];
  }
  return out;
}

module.exports = { columnasPedidas, autoConfirmarCambios, XLSX, dobleSupabase, abrirPagina, leerTodos, vis, anotar, jugarRondas, esperarGuardado };
