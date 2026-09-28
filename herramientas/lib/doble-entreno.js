/* El doble de Supabase de los verificadores de Entrenamiento
 * (verificar-entreno-arreglos, -nivel y -repaso): una sola copia.
 *
 * - Hay una sesión (u-ana).
 * - Cada insert queda anotado en window.__inserts ({ tabla, rows }).
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
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; }, in() { return q; },
      eq(c, v) { filtros.push([c, v]); return q; },
      upsert() { return Promise.resolve({ data: null, error: null }); },
      insert(rows) {
        window.__inserts.push({ tabla, rows });
        return { select() { return this; }, single() { return Promise.resolve({ data: { id: 1 }, error: null }); },
                 then(r) { return Promise.resolve({ data: null, error: null }).then(r); } };
      },
      update() { return q; },
      filas() { return (TABLAS[tabla] || []).filter((f) => filtros.every(([c, v]) => f[c] === v)); },
      maybeSingle() { return Promise.resolve({ data: q.filas()[0] || null, error: null }); },
      single() { return Promise.resolve({ data: q.filas()[0] || null, error: null }); },
      then(r) { return Promise.resolve({ data: q.filas(), error: null }).then(r); },
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: "u-ana" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: consulta,
    // Una función de la base devuelve lo que traiga tablas["rpc:<nombre>"].
    rpc: (n) => ({ then(r) { return Promise.resolve({ data: TABLAS["rpc:" + n] || [], error: null }).then(r); } }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  };
})();
`;
}

async function abrir(browser, ruta, tablas, local) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
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
