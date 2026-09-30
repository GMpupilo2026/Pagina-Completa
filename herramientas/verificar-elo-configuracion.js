/* Comprueba, en un navegador de verdad y con un Supabase de mentira, el código
   FIDE en `configuracion.html`: guardarlo, que se lea el Elo en ese momento y
   que se vea. Ver «El Elo oficial, mes a mes» en docs/decisiones/informes.md.

   Lo que se mira acá es lo que se rompe callado:

   1. AL ENTRAR se ve el código guardado y el último Elo leído, con su mes.
   2. UN CÓDIGO CON LETRAS no llega a la base: se dice por qué, en la página.
   3. GUARDAR va por guardar_fide_id() (no un update suelto a profiles) y
      DESPUÉS pide la lectura a elo-fide con el id de la persona; lo leído se
      ve y pasa al «Tu Elo» que usa el diagnóstico.
   4. SI LAS PÁGINAS NO CONTESTAN, el código queda guardado igual y se dice
      el motivo que dio la función, no un error genérico.
   5. BORRARLO (dejarlo vacío) manda null y esconde el Elo.
   6. SIN FIDE ESTÁNDAR, no se escribe «FIDE Estándar 0».

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-elo-configuracion.js                      */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ANA = { id: "u-ana", role: "alumno", is_admin: false, es_coordinador: false, full_name: "Ana Rojas",
  email: "ana@x.cr", grupo: "7B", foto_path: null, elo: null, elo_tipo: null, fide_id: "6501435" };

function clienteFalso(perfil, opciones) {
  return `
window.__rpc = []; window.__invocadas = [];
(function () {
  const OPC = ${JSON.stringify(opciones || {})};
  const PERFILES = [${JSON.stringify(perfil)}];
  const HISTORIAL = ${JSON.stringify((opciones && opciones.historial) || [])};

  function constructor(tabla, filasBase) {
    let filas = (filasBase || []).slice(), unica = false;
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      eq(col, val) { filas = filas.filter((r) => String(r[col]) === String(val)); return b; },
      in(col, vals) { filas = filas.filter((r) => vals.includes(r[col])); return b; },
      update() { return b; }, upsert() { return b; }, delete() { return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      then(res, rej) {
        const d = unica ? (filas.length ? filas[0] : null) : filas;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(perfil.id)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      mfa: { listFactors: () => Promise.resolve({ data: { totp: [] }, error: null }),
             getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
    from: (t) => constructor(t, t === "profiles" ? PERFILES : t === "elo_historial" ? HISTORIAL : []),
    rpc: (n, args) => {
      window.__rpc.push({ n, a: args });
      if (n === "guardar_fide_id") {
        PERFILES[0].fide_id = args.p_fide_id;
        return Promise.resolve({ data: args.p_fide_id, error: null });
      }
      return constructor(n, []);
    },
    functions: {
      invoke: (nombre, opts) => {
        window.__invocadas.push({ nombre, body: opts && opts.body });
        if (OPC.falla) {
          const cuerpo = { error: "No se pudo leer el Elo: ni la FIDE ni la lista nacional encontraron ese código" };
          return Promise.resolve({ data: null, error: { message: "Edge Function returned a non-2xx status code",
            context: { json: () => Promise.resolve(cuerpo) } } });
        }
        return Promise.resolve({ data: Object.assign({ ok: true, periodo: "2026-09-01", fide: 2152, nacional: 2268, nombre: "Angulo Cubero, Oscar" }, OPC.leido), error: null });
      },
    },
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); } }),
    removeChannel: () => {},
  };
})();
`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function abrir(browser, perfil, opciones) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil, opciones) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(BASE + "/configuracion.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx, errores };
}

const eloVisible = (page) => page.evaluate(() => {
  const el = document.getElementById("fide-elo");
  return el.checkVisibility() ? el.textContent : null;
});
const mensaje = (page) => page.evaluate(() => document.getElementById("fide-msg").textContent);
async function guardar(page, codigo) {
  await page.fill("#fide-input", codigo);
  await page.click("#save-fide-btn");
  await page.waitForFunction(() => !document.getElementById("save-fide-btn").disabled
    && document.getElementById("fide-msg").textContent && !/Leyendo/.test(document.getElementById("fide-msg").textContent),
    null, { timeout: 10000 });
}

(async () => {
  const fs = require("fs");
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\n=== Al entrar ===");
  {
    const { page, ctx, errores } = await abrir(browser, ANA, {
      historial: [{ student_id: "u-ana", periodo: "2026-08-01", fide_estandar: 2140, nacional: 2275 }] });
    igual("se ve el código guardado", await page.inputValue("#fide-input"), "6501435");
    igual("y el último Elo leído, con su mes", await eloVisible(page), "Tu Elo oficial (agosto): FIDE Estándar 2140 · Nacional 2275.");
    igual("el campo dice para qué es (aria-describedby)",
      await page.evaluate(() => document.getElementById(document.getElementById("fide-input").getAttribute("aria-describedby")).textContent.includes("ratings.fide.com")), true);

    console.log("\n=== Un código con letras ===");
    await page.fill("#fide-input", "65O1435");
    await page.click("#save-fide-btn");
    igual("se dice en la página qué está mal", /solo números/.test(await mensaje(page)), true);
    igual("y no llega a la base", await page.evaluate(() => window.__rpc.filter((r) => r.n === "guardar_fide_id").length), 0);

    console.log("\n=== Guardar un código nuevo ===");
    await guardar(page, " 6530133 ");
    igual("se guarda con guardar_fide_id, sin espacios y para quien es",
      await page.evaluate(() => window.__rpc.filter((r) => r.n === "guardar_fide_id").map((r) => r.a)), [{ p_persona: "u-ana", p_fide_id: "6530133" }]);
    igual("después se pide la lectura a elo-fide",
      await page.evaluate(() => window.__invocadas), [{ nombre: "elo-fide", body: { action: "actualizar", student_id: "u-ana" } }]);
    igual("lo leído se ve", await eloVisible(page), "Tu Elo oficial (septiembre): FIDE Estándar 2152 · Nacional 2268.");
    igual("y pasa al «Tu Elo» del diagnóstico", [await page.inputValue("#elo-input"), await page.inputValue("#elo-tipo")], ["2152", "fide"]);
    igual("el mensaje dice que se actualiza solo", /se va a actualizar solo cada mes/.test(await mensaje(page)), true);

    console.log("\n=== Borrarlo ===");
    await guardar(page, "");
    igual("manda null", await page.evaluate(() => window.__rpc.filter((r) => r.n === "guardar_fide_id").pop().a.p_fide_id), null);
    igual("y el Elo oficial ya no se ve", await eloVisible(page), null);
    igual("ni se vuelve a leer", await page.evaluate(() => window.__invocadas.length), 1);
    igual("sin errores de la página", errores, []);
    await ctx.close();
  }

  console.log("\n=== Las páginas no contestan ===");
  {
    const { page, ctx, errores } = await abrir(browser, { ...ANA, fide_id: null }, { falla: true });
    igual("sin código y sin historial no se ve ningún Elo", await eloVisible(page), null);
    await guardar(page, "99999999");
    const m = await mensaje(page);
    igual("el código queda guardado", /quedó guardado/.test(m), true);
    igual("y se dice el motivo que dio la función", /ni la FIDE ni la lista nacional/.test(m), true);
    igual("sin errores de la página", errores, []);
    await ctx.close();
  }

  console.log("\n=== Sin FIDE Estándar ===");
  {
    const { page, ctx, errores } = await abrir(browser, { ...ANA, fide_id: null }, { leido: { fide: null, nacional: 1400, nombre: "Salazar Perez, Aldana Maria" } });
    await guardar(page, "6530133");
    igual("solo el Nacional, sin «FIDE Estándar 0»", await eloVisible(page), "Tu Elo oficial (septiembre): Nacional 1400.");
    igual("el Elo del diagnóstico pasa a ser el nacional", [await page.inputValue("#elo-input"), await page.inputValue("#elo-tipo")], ["1400", "nacional"]);
    igual("sin errores de la página", errores, []);
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron` : "\n✓ El código FIDE en Configuración: todo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
