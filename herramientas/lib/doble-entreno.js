/* El doble de Supabase de los verificadores de Entrenamiento
 * (verificar-entreno-arreglos, -nivel y -repaso): una sola copia.
 *
 * - Hay una sesión (u-ana); con `tablas.sesion = null`, no (la sesión venció).
 * - Cada insert queda anotado en window.__inserts ({ tabla, rows }), y cada
 *   update en window.__updates ({ tabla, campos, filtros, filas }): cambia de
 *   verdad las filas que pasan los filtros.
 * - Cada tabla devuelve las filas que se le pasen en `tablas`, filtradas de
 *   verdad en el RESOLVER: .eq() solo anota el filtro.
 * - sb.rpc("x") devuelve lo que traiga tablas["rpc:x"] (lista vacía si no).
 *
 * abrir(browser, ruta, tablas, local) abre la página en un contexto nuevo
 * (con serviceWorkers: "block"), con `local` ya puesto en localStorage antes de
 * que cargue nada. Devuelve { page, ctx, errores }.
 */
const BASE = process.env.BASE_URL || "http://localhost:8777";

/* El doble: una sesión (u-ana), anota los insert, y cada tabla devuelve las
   filas que se le pasen, filtradas de verdad en el RESOLVER. */
function clienteFalso(tablas) {
  return `
(function () {
  window.__inserts = [];
  const TABLAS = ${JSON.stringify(tablas || {})};
  function consulta(tabla) {
    const filtros = [];
    let porActualizar = null;
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; },
      // .in(c, valores): filtra de verdad, como los demás.
      in(c, vals) { filtros.push([c, (vals || []).map(String), "en"]); return q; },
      eq(c, v) { filtros.push([c, v]); return q; },
      neq(c, v) { filtros.push([c, v, "distinto"]); return q; },
      // .or("white_id.eq.u,black_id.eq.u"): basta con que pase uno (solo .eq).
      or(expr) { filtros.push([null, String(expr).split(",").map((t) => { const m = t.match(/^([a-z_]+)\.eq\.(.*)$/); return m ? [m[1], m[2]] : null; }).filter(Boolean), "o"]); return q; },
      // .is(c, null): las que no tienen nada en c.
      is(c, v) { if (v === null) filtros.push([c, undefined, "nulo"]); return q; },
      // .not(c, "is", null): solo las filas que tienen algo en c.
      not(c, op, v) { if (op === "is" && v === null) filtros.push([c, undefined, "noNulo"]); return q; },
      upsert() { return Promise.resolve({ data: null, error: null }); },
      insert(rows) {
        window.__inserts.push({ tabla, rows });
        return { select() { return this; }, single() { return Promise.resolve({ data: { id: 1 }, error: null }); },
                 then(r) { return Promise.resolve({ data: null, error: null }).then(r); } };
      },
      // El filtro se apunta al RESOLVER: .update(x).eq(...) encadena, y acá
      // todavía no hay ninguno. Se anota en window.__updates y cambia las filas.
      update(campos) { porActualizar = campos; return q; },
      filas() { return (TABLAS[tabla] || []).filter((f) => filtros.every(([c, v, modo]) => modo === "noNulo" ? f[c] != null : modo === "nulo" ? f[c] == null : modo === "en" ? v.includes(String(f[c])) : modo === "distinto" ? f[c] !== v : modo === "o" ? v.some(([k, x]) => String(f[k]) === x) : f[c] === v)); },
      maybeSingle() { return Promise.resolve({ data: q.filas()[0] || null, error: null }); },
      single() { return Promise.resolve({ data: q.filas()[0] || null, error: null }); },
      then(r) {
        if (porActualizar) {
          const cambiadas = q.filas();
          (window.__updates = window.__updates || []).push({ tabla, campos: porActualizar, filtros: filtros.slice(), filas: cambiadas.length });
          cambiadas.forEach((f) => Object.assign(f, porActualizar));
          porActualizar = null;
          return Promise.resolve({ data: cambiadas, error: null }).then(r);
        }
        return Promise.resolve({ data: q.filas(), error: null }).then(r);
      },
    };
    return q;
  }
  window.sb = {
    auth: {
      // tablas.sesion === null: la sesión venció (el token sigue guardado).
      getSession: () => Promise.resolve({ data: { session: TABLAS.sesion === null ? null : { user: { id: "u-ana" }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: "u-ana" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: consulta,
    // Una función de la base devuelve lo que traiga tablas["rpc:<nombre>"].
    // Anota con qué argumentos se llamó (window.__rpcArgs) y admite .range().
    rpc: (n, args) => {
      (window.__rpcArgs = window.__rpcArgs || []).push([n, args || null]);
      const r = { range() { return r; }, then(res) { return Promise.resolve({ data: TABLAS["rpc:" + n] || [], error: null }).then(res); } };
      return r;
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  };
})();
`;
}

// `preparar(ctx)`, opcional: rutas de más (un Lichess de mentira, por ejemplo).
async function abrir(browser, ruta, tablas, local, preparar) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  if (preparar) await preparar(ctx);
  if (local) await ctx.addInitScript((l) => { for (const k in l) localStorage.setItem(k, l[k]); }, local);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(tablas) }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}
module.exports = { clienteFalso, abrir, BASE };
