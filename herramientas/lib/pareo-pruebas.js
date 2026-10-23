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
// demás pruebas, que cambian resultados a propósito, se acepta sola. También
// «Antes de emparejar la ronda…»: los datos de prueba traen sorpresas de Elo.
function autoConfirmarCambios() {
  new MutationObserver(() => {
    if (window.__sinAutoConfirmar) return;
    const d = document.querySelector("dialog[data-avisos][open]");
    if (d && !d.__aceptado && /Cambiar el resultado de la mesa|Antes de emparejar la ronda/.test(d.textContent)) {
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
// entera), y también cuando llega algo de afuera (un adjunto, el respaldo):
// cada select se busca de nuevo antes de tocarlo, y si se repintó justo entre
// buscarlo y tocarlo, se vuelve a buscar.
async function anotar(page, resultado) {
  const n = await page.$$eval("#pi-ronda select", (l) => l.length);
  for (let i = 0; i < n; i++) {
    for (let intento = 0; ; intento++) {
      try {
        const s = (await page.$$("#pi-ronda select"))[i];
        if (!s) return;
        if ((await s.$$eval("option", (o) => o.map((x) => x.value))).includes(resultado)) await s.selectOption(resultado, { timeout: 5000 });
        break;
      } catch (e) {
        if (intento >= 4 || !/not attached|detached|Timeout/i.test(String(e))) throw e;
      }
    }
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

// El doble de public.pareo_lista y public.pareo_lista_resumen (la lista
// pública de 50 en 50, supabase/migraciones/20261023152708_pareo_lista.sql):
// filtra, agrupa y pagina como la función de la base, que se comprobó
// aparte contra la base de verdad. `filas` como las guarda la base (con
// `datos`); `orgs`, los organizadores (para «Solo verificados»); `hoy`, el
// día de Costa Rica que tiene la página. Anota cada llamada en `pedidos`.
const clavePareo = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
function respuestaLista(filas, orgs, hoy, a) {
  const ayer = new Date(Date.parse(hoy + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  const marcadas = filas.filter((f) => !f.oculto).map((f) => {
    const d = f.datos || {};
    const x = { id: f.id, nombre: f.nombre, evento: f.evento || "", lugar: f.lugar || "", fecha: f.fecha || null, rondas: f.rondas || 0, rondas_total: f.rondas_total || 0,
      jugadores: f.jugadores || 0, actualizado: f.actualizado, organizador_id: f.organizador_id || null, ritmo: d.ritmo == null ? null : d.ritmo, fin: d.fechaFin == null ? null : d.fechaFin,
      fed: d.federacion == null ? null : d.federacion, sistema: d.sistema == null ? null : d.sistema, tipo: d.tipo == null ? null : d.tipo, inscripcion: d.inscripcion || null,
      elo: d.validoElo == null ? null : d.validoElo, ritmo_tipo: d.ritmoTipo || null,
      // Como la base: la que eligió quien organiza (el doble no deduce del lugar).
      provincia: d.provincia || "" };
    const proximo = !x.jugadores || (!!x.fecha && x.fecha > hoy);
    x.en_curso = !proximo && x.rondas_total > 0 && x.rondas < x.rondas_total && (x.fin || x.fecha || "") >= ayer;
    const inscribe = !!(x.inscripcion && x.inscripcion.abierta && (!x.inscripcion.hasta || x.inscripcion.hasta >= hoy));
    return { x, proximo, inscribe, grupo: x.evento ? x.evento + "|" + (x.fecha || "") : x.id };
  });
  const q = clavePareo(a.p_buscar);
  const cuales = marcadas.filter((m) => m.proximo === (a.p_parte === "proximos")
    && (!q || clavePareo([m.x.nombre, m.x.evento, m.x.lugar].filter(Boolean).join(" ")).includes(q))
    && (!a.p_ritmo || m.x.ritmo_tipo === a.p_ritmo)
    && (!a.p_lugar || m.x.lugar === a.p_lugar || m.x.provincia === a.p_lugar)
    && (!a.p_elo || (a.p_elo === "sin" ? !["fide", "nacional"].includes(m.x.elo || "") : m.x.elo === a.p_elo))
    && (!a.p_abierta || m.inscribe) && (!a.p_curso || m.x.en_curso)
    && (!a.p_verificado || orgs.some((o) => o.id === m.x.organizador_id && o.verificado && !o.oculto)));
  const grupos = new Map();
  for (const m of cuales) if (!grupos.has(m.grupo) || (m.x.fecha || "") < (grupos.get(m.grupo) || "")) grupos.set(m.grupo, m.x.fecha);
  const prox = a.p_parte === "proximos";
  const orden = [...grupos].sort(([ga, fa], [gb, fb]) => (!fa && !fb ? 0 : !fa ? 1 : !fb ? -1 : prox ? fa.localeCompare(fb) : fb.localeCompare(fa)) || (ga < gb ? -1 : ga > gb ? 1 : 0));
  const desde = Math.max(a.p_desde || 0, 0), cuantos = Math.min(Math.max(a.p_cuantos || 50, 1), 100);
  const pagina = new Set(orden.slice(desde, desde + cuantos).map(([g]) => g));
  return { filas: cuales.filter((m) => pagina.has(m.grupo)).map((m) => m.x), grupos: grupos.size, torneos: cuales.length };
}
async function dobleListaPareo(page, filas, opciones) {
  const o = Object.assign({ orgs: [], hoy: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()) }, opciones);
  const pedidos = [];
  const json = (route, x) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
  await page.route("**/rest/v1/rpc/pareo_lista_resumen", (route) => {
    pedidos.push({ fn: "resumen" });
    const vis = filas.filter((f) => !f.oculto);
    return json(route, { total: vis.length, lugares: [...new Set(vis.map((f) => f.lugar).filter(Boolean))].sort() });
  });
  await page.route("**/rest/v1/rpc/pareo_lista", (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    pedidos.push(Object.assign({ fn: "lista" }, a));
    return json(route, respuestaLista(filas, o.orgs, o.hoy, a));
  });
  return pedidos;
}

module.exports = { dobleListaPareo, respuestaLista, columnasPedidas, autoConfirmarCambios, XLSX, dobleSupabase, abrirPagina, leerTodos, vis, anotar, jugarRondas, esperarGuardado };
