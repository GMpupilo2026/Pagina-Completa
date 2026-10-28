/* Las bromas del profe: el profe les manda bromas a sus alumnos, gratis y con
   su nombre (ver «Las bromas del profe» en docs/decisiones/puntos-y-premios.md).

   Quién puede mandarle a quién, que no le cobre y los frenos de quien la
   recibe los decide la base (mandar_broma(), probado impersonando roles en
   SQL). Acá, lo de la página, que se rompe sin dar ningún error:

   1. configuracion.html carga js/puntos-regalos.js (antes que
      js/configuracion.js) y tiene el botón; configuracion.js manda con
      `profe: true`.
   2. PuntosRegalos.regalar({ profe: true }): la lista es la de SUS alumnos
      (alumnos_del_profesor, no la de profiles), no dice que cueste puntos y
      la llamada lleva a quién, dónde y si suena.
   3. En la clase en vivo: el botón del profe no se ve con las bromas
      apagadas, se ve al encenderlas, no muestra precios y la manda a la
      clase.

   Uso:  node herramientas/verificar-todo.js bromas-profe                   */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

// El doble de Supabase: lo justo para la tienda de bromas, la lista de
// alumnos y el interruptor de la clase. `hasta` lo cambia el verificador.
const DOBLE = `
window.__llamadas = [];
window.__hasta = null;
(function () {
  const BROMAS = [
    { id: "p-confeti", nombre: "Lluvia de confeti", categoria: "broma", costo_puntos: 75, activo: true, parametros: { tipo: "confeti" } },
    { id: "p-payaso", nombre: "Gorro de payaso", categoria: "broma", costo_puntos: 90, activo: true, parametros: { tipo: "payaso" } },
  ];
  const PERFILES = [{ id: "u-otro", full_name: "Alguien Ajeno", role: "alumno" }];
  function consulta(nombre) {
    const filtros = [];
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; }, neq() { return q; },
      eq(c, v) { filtros.push([c, v]); return q; },
      maybeSingle() { return resolver().then((r) => ({ data: r.data[0] || null, error: null })); },
      then(a, b) { return resolver().then(a, b); },
    };
    function resolver() {
      window.__llamadas.push({ tabla: nombre, filtros: filtros.slice() });
      let filas = [];
      if (nombre === "premios_catalogo") filas = BROMAS;
      else if (nombre === "profiles") filas = PERFILES;
      else if (nombre === "bromas_clase") filas = window.__hasta ? [{ hasta: window.__hasta }] : [];
      filas = filas.filter((f) => filtros.every(([c, v]) => !(c in f) || f[c] === v));
      return Promise.resolve({ data: filas, error: null });
    }
    return q;
  }
  window.__sb = {
    from: consulta,
    rpc(nombre, args) {
      window.__llamadas.push({ rpc: nombre, args });
      if (nombre === "alumnos_del_profesor") {
        return Promise.resolve({ data: [{ id: "u-ana", full_name: "Ana Solís" }, { id: "u-beto", full_name: "Beto Rojas" }], error: null });
      }
      if (nombre === "mandar_broma") return Promise.resolve({ data: [{ broma_id: "b-1", saldo_restante: null }], error: null });
      if (nombre === "bromas_en_esta_clase") return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    channel() { const c = { on() { return c; }, subscribe() { return c; }, send() { window.__llamadas.push({ canal: "send" }); } }; return c; },
  };
})();
`;

const PAGINA = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/tailwind.css"></head><body>'
  + '<div id="students-panel"></div>'
  + '<script src="/js/avisos.js"></script><script src="/js/puntos-regalos.js"></script><script src="/js/clase-bromas.js"></script>'
  + '</body></html>';

async function abrir(navegador) {
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.route("**/bromas-profe-prueba.html*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: PAGINA }));
  await ctx.addInitScript(DOBLE);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/bromas-profe-prueba.html`, { waitUntil: "load" });
  return { page, ctx };
}

async function main() {
  // ---------- 1) Configuración ----------
  const html = fs.readFileSync(path.join(RAIZ, "configuracion.html"), "utf8");
  const iRegalos = html.indexOf('src="js/puntos-regalos.js"');
  ok(iRegalos > 0 && iRegalos < html.indexOf('src="js/configuracion.js"'), "configuracion.html no carga js/puntos-regalos.js antes de js/configuracion.js");
  ok(html.includes('id="bromas-profe-mandar"'), "configuracion.html no tiene el botón para que el profe mande una broma");
  const conf = fs.readFileSync(path.join(RAIZ, "js/configuracion.js"), "utf8");
  ok(/PuntosRegalos\.regalar\(\{[^}]*profe: true/.test(conf), "configuracion.js no manda la broma como profe (profe: true)");

  const navegador = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  // ---------- 2) el diálogo del profe ----------
  {
    const { page, ctx } = await abrir(navegador);
    const promesa = page.evaluate(() => window.PuntosRegalos.regalar({
      sb: window.__sb, alumnoId: "u-profe", profe: true,
      premio: { id: "p-confeti", nombre: "Lluvia de confeti", categoria: "broma", costo_puntos: 75, parametros: { tipo: "confeti" } },
    }));
    const dialogo = page.locator("dialog[open]");
    await dialogo.waitFor({ timeout: 5000 });
    const texto = await dialogo.textContent();
    ok(!/75 puntos|Cuesta/.test(texto), "al profe le dice que la broma cuesta puntos: " + texto);
    ok(/no te cuesta puntos/.test(texto), "el diálogo del profe no dice que no le cuesta puntos");
    const gente = await dialogo.locator("select").first().locator("option").allTextContents();
    ok(gente.join("|") === "Ana Solís|Beto Rojas", "la lista del profe no es la de sus alumnos: " + JSON.stringify(gente));
    ok(await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "alumnos_del_profesor" && l.args.p_profesor === "u-profe")),
      "la lista del profe no sale de alumnos_del_profesor");
    ok(!(await page.evaluate(() => window.__llamadas.some((l) => l.tabla === "profiles"))), "la lista del profe no debería leer profiles directo");
    await dialogo.locator("select").first().selectOption("u-beto", { timeout: 3000 }).catch(() => {});
    await dialogo.locator("select").nth(1).selectOption("entreno", { timeout: 3000 }).catch(() => {});
    await dialogo.locator('button:has-text("Mandar la broma")').click({ timeout: 3000 }).catch(() => {});
    const res = await Promise.race([promesa, new Promise((r) => setTimeout(() => r(null), 3000))]);
    const llamada = await page.evaluate(() => window.__llamadas.find((l) => l.rpc === "mandar_broma"));
    ok(llamada && llamada.args.p_para === "u-beto" && llamada.args.p_donde === "entreno" && llamada.args.p_con_sonido === true,
      "la broma del profe no llevó a quién, dónde y si suena: " + JSON.stringify(llamada));
    ok(res && res.para === "Beto Rojas" && res.saldo == null, "regalar() del profe no devolvió a quién: " + JSON.stringify(res));
    await ctx.close();
  }

  // ---------- 3) en la clase en vivo ----------
  {
    const { page, ctx } = await abrir(navegador);
    await page.evaluate(() => window.ClaseBromas.montar({ sb: window.__sb, profe: "u-profe", yo: "u-profe", esProfe: true }));
    await page.waitForFunction(() => window.__llamadas.some((l) => l.tabla === "bromas_clase"), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
    const seVe = () => page.evaluate(() => { const b = document.getElementById("clase-bromas-mandar-profe"); return !!b && b.checkVisibility(); });
    ok(await page.$("#clase-bromas-mandar-profe") !== null, "en la clase el profe no tiene el botón para mandar una broma");
    ok(!(await seVe()), "el botón del profe se ve con las bromas apagadas");
    // Se encienden: la próxima lectura trae la hora.
    await page.evaluate(() => { window.__hasta = new Date(Date.now() + 3600000).toISOString(); });
    await page.evaluate(() => { window.__sb.rpc = ((orig) => function (n, a) {
      if (n === "bromas_en_esta_clase") { window.__llamadas.push({ rpc: n, args: a }); return Promise.resolve({ data: window.__hasta, error: null }); }
      return orig.call(this, n, a);
    })(window.__sb.rpc); });
    await page.click("#clase-bromas-interruptor");
    await page.waitForFunction(() => { const b = document.getElementById("clase-bromas-mandar-profe"); return b && b.checkVisibility(); }, null, { timeout: 5000 }).catch(() => {});
    ok(await seVe(), "con las bromas encendidas el profe no ve su botón para mandar una");
    await page.click("#clase-bromas-mandar-profe");
    const dialogo = page.locator("dialog[open]");
    await dialogo.waitFor({ timeout: 5000 });
    const ops = await dialogo.locator("select").first().locator("option").allTextContents();
    ok(ops.length && !ops.some((o) => /puntos/.test(o)), "en la clase el profe ve precios en las bromas: " + JSON.stringify(ops));
    ok(!ops.some((o) => /payaso/i.test(o)), "el gorro de payaso no es de la clase: " + JSON.stringify(ops));
    await dialogo.locator("button:has-text('Elegir a quién')").click();
    await page.waitForFunction(() => document.querySelectorAll("dialog[open] select").length >= 2, null, { timeout: 5000 }).catch(() => {});
    const d2 = page.locator("dialog[open]");
    await d2.locator("select").first().selectOption("u-ana", { timeout: 3000 }).catch(() => {});
    await d2.locator('button:has-text("Mandar la broma")').click({ timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "mandar_broma"), null, { timeout: 5000 }).catch(() => {});
    const llamada = await page.evaluate(() => window.__llamadas.find((l) => l.rpc === "mandar_broma"));
    ok(llamada && llamada.args.p_para === "u-ana" && llamada.args.p_donde === "clase", "la broma del profe en la clase no va a la clase: " + JSON.stringify(llamada));
    await ctx.close();
  }

  await navegador.close();
  console.log(fallos.length ? fallos.map((f) => "✗ " + f).join("\n") : "✓ Todo bien: el profe les manda bromas a sus alumnos, sin precio, desde Configuración y desde la clase.");
  process.exit(fallos.length ? 1 : 0);
}

main();
