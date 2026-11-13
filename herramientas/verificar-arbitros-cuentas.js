#!/usr/bin/env node
/* Las cuentas de árbitro: un organizador crea a sus árbitros, con usuario y
 * contraseña, y elige qué herramientas usa cada uno; el árbitro ve solo sus
 * herramientas, nada de la Academia. Ver «Las cuentas de árbitro» en
 * docs/decisiones/permisos-y-roles.md.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - una licencia dada que no depende de la de quien la dio sigue abierta
 *    cuando al organizador se le vence la suya;
 *  - una cuenta de árbitro para la que acceso_vigente() dice que sí entra a
 *    la Academia como un alumno más;
 *  - la Edge Function que fija las herramientas con la clave de servicio
 *    deja que un organizador dé herramientas que no tiene;
 *  - la pantalla que ofrece herramientas que no se pueden dar, o el árbitro
 *    que se queda en el panel de la Academia.
 *
 * Primero lee las promesas en la migración, la función y los scripts; después
 * abre las páginas con un Supabase de mentira.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-arbitros-cuentas.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

let fallos = 0;
function ok(cond, texto) {
  console.log((cond ? "  ✓ " : "  ✗ ") + texto);
  if (!cond) fallos++;
}
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

// ---------------------------------------------------------------- las promesas
console.log("\nLa base (migración cuentas_arbitro)");
const mig = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => /_cuentas_arbitro\.sql$/.test(f));
ok(mig.length === 1, "hay una migración cuentas_arbitro");
const sql = mig.length ? leer("supabase/migraciones/" + mig[0]) : "";
const funcion = (nombre) => (sql.match(new RegExp("create or replace function " + nombre.replace(/\./g, "\\.") + "\\([\\s\\S]*?\\$function\\$;")) || [""])[0];
ok(/profiles_role_check[\s\S]*'arbitro'::text/.test(sql), "profiles.role acepta 'arbitro'");
ok(/otorgada_por uuid references public\.profiles\(id\) on delete cascade/.test(sql), "la licencia dada sabe quién la dio y se va con su cuenta");
ok(/l\.otorgada_por is null or interno\.herramienta_propia\(l\.otorgada_por, p_herramienta\)/.test(funcion("public.tengo_herramienta")),
  "tengo_herramienta(): una licencia dada vale solo si quien la dio tiene la herramienta");
ok(/l\.otorgada_por is null/.test(funcion("interno.herramienta_propia")), "herramienta_propia() no cuenta las licencias dadas (una sola vuelta)");
ok(/revoke execute on function interno\.herramienta_propia\(uuid, text\) from public, anon, authenticated/.test(sql), "herramienta_propia() no la llama nadie de afuera");
ok(/pr\.role = 'arbitro'\) then false/.test(funcion("public.acceso_vigente")), "acceso_vigente() le dice que no a la cuenta de árbitro");
ok(/'motivo', 'arbitro'/.test(funcion("public.mi_acceso")), "mi_acceso() dice 'arbitro'");
ok(/pr\.role = 'arbitro'\) then '\{\}'::text\[\]/.test(funcion("public.arbitros_puedo_dar")), "un árbitro no puede dar herramientas");
ok(/revoke all on public\.arbitros_cuentas from public, anon, authenticated;\s*grant select on public\.arbitros_cuentas to authenticated;/.test(sql),
  "arbitros_cuentas: el navegador solo la lee");
ok(!/create policy [a-z_]+ on public\.arbitros_cuentas\s+for (insert|update|delete|all)/.test(sql), "arbitros_cuentas no tiene política de escritura");
ok(/create trigger auditar after insert or update or delete on public\.arbitros_cuentas/.test(sql), "arbitros_cuentas lleva la bitácora");
const fijar = funcion("public.arbitro_herramientas_fijar");
ok(/No puedes dar «%»/.test(fijar) && /h = 'todas' and not v_admin/.test(fijar), "fijar: solo lo que quien llama tiene, y «todas» solo administración");
ok(/and \(v_todas or l\.herramienta = any \(v_dar\)\)/.test(fijar), "fijar: no quita lo que quien llama no podría dar");
ok(/coalesce\(exists \(select 1 from public\.arbitros_cuentas a[\s\S]*?\), false\)/.test(fijar), "fijar: el permiso con coalesce (auth.uid() nulo no pasa)");
ok(/"arbitros_cuentas"/.test(leer("herramientas/verificar-auditoria.js")), "arbitros_cuentas está en VIGILADAS");

console.log("\nLa Edge Function arbitro-cuentas");
const ef = leer("supabase/functions/arbitro-cuentas/index.ts");
ok(/comoQuienLlama\.rpc\("arbitros_puedo_dar"\)/.test(ef), "pregunta si puede con el token de quien llama");
ok(/comoQuienLlama\s*\.rpc\("arbitro_herramientas_fijar"/.test(ef) && !/adminClient\s*\.rpc\("arbitro_herramientas_fijar"/.test(ef),
  "las herramientas las fija la base con la identidad de quien llama, nunca con la clave de servicio");
ok(/deleteUser\(id\)/.test(ef), "si algo falla después de crearla, la cuenta se borra");
ok(/perfil\?\.role !== "arbitro"/.test(ef), "la contraseña solo se cambia a una cuenta de árbitro");
ok(/comoQuienLlama\.rpc\("arbitros_mis"\)/.test(ef), "y solo a uno de sus árbitros (lo dice la base)");
ok(/"arbitro-cuentas": \["usuario-alumno\.ts"\]/.test(leer("herramientas/funciones-armar.js")), "funciones-armar.js la arma con usuario-alumno.ts");

console.log("\nLas páginas");
const acceso = leer("js/acceso-vigente.js");
ok(/a\.motivo === "arbitro"/.test(acceso) && /arbitro\.html/.test(acceso), "acceso-vigente.js lleva al árbitro a su panel");
const cab = leer("herramientas/academia-cabecera.py");
ok(/"mis-arbitros\.html": \("Mis árbitros"/.test(cab) && /"arbitro\.html": \("Mis herramientas"/.test(cab), "las dos páginas en las migas de la Academia");

// ---------------------------------------------------------------- en el navegador
function cliente(c) {
  return `(function(){
    const C = ${JSON.stringify(c)};
    window.__rpc = [];
    const chain = (data) => { const b = {}; ["select","eq","neq","in","is","or","order","limit","range","gte","lte","gt","lt","ilike","not","filter","contains","match"].forEach((m) => b[m] = () => b);
      b.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? (data[0] || null) : data, error: null });
      b.single = b.maybeSingle;
      b.then = (ok, ko) => Promise.resolve({ data: Array.isArray(data) ? data : [], error: null, count: 0 }).then(ok, ko);
      b.insert = b.update = b.upsert = b.delete = () => b; return b; };
    const canal = { on() { return canal; }, subscribe() { return canal; }, send() { return Promise.resolve(); }, track() { return Promise.resolve(); }, unsubscribe() {} };
    window.SUPABASE_URL = "https://prueba.supabase.co"; window.SUPABASE_ANON_KEY = "anon";
    window.sb = {
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "yo" }, access_token: "t" } } }),
              getUser: () => Promise.resolve({ data: { user: { id: "yo" } } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: () => { window.__salio = true; try { sessionStorage.setItem("__salio", "1"); } catch (e) {} return Promise.resolve({ error: null }); } },
      from: (t) => chain(t === "profiles" ? C.perfil : null),
      rpc: (nombre, args) => { window.__rpc.push([nombre, args || null]);
        if (nombre === "arbitro_herramientas_fijar") return Promise.resolve({ data: (args.p_herramientas || []).slice().sort(), error: null });
        return Promise.resolve({ data: nombre in C.rpc ? C.rpc[nombre] : null, error: null }); },
      channel: () => canal, removeChannel: () => {},
    };
  })();`;
}

async function abrir(browser, ruta, c) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  const llamadas = [];
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/vendor/supabase.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente(c) }));
  await page.route("https://prueba.supabase.co/**", async (r) => {
    const req = r.request();
    if (req.url().includes("/functions/v1/arbitro-cuentas")) {
      const cuerpo = JSON.parse(req.postData() || "{}");
      llamadas.push(cuerpo);
      return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(cuerpo.accion === "crear" ? { arbitro_id: "nuevo", usuario: "ana.solis", herramientas: cuerpo.herramientas } : { ok: true }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });
  await page.goto(BASE + "/" + ruta, { waitUntil: "domcontentloaded" });
  return { ctx, page, errores, llamadas };
}
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const ORG = { perfil: { is_admin: false, full_name: "Org", role: "profesor" }, rpc: {
    mi_acceso: { vigente: true, motivo: "equipo" },
    arbitros_puedo_dar: ["pareo", "notara"],
    arbitros_mis: [{ arbitro_id: "11111111-aaaa", nombre: '<img src=x onerror="window.__xss=1">Luis', usuario: "luis.mora@alumno.ajedrez-integral.com",
      organizador_id: "yo", organizador: "Org", creada_en: "2026-11-08T10:00:00Z", ultima_entrada: null, herramientas: ["pareo"], pausadas: [] }],
  } };

  console.log("\nmis-arbitros.html, un organizador con Pareo y Notara");
  {
    const { ctx, page, errores, llamadas } = await abrir(browser, "mis-arbitros.html", ORG);
    await page.waitForFunction(() => document.getElementById("app") && !document.getElementById("app").hidden, null, { timeout: 15000 });
    igual("ofrece solo las herramientas que tiene", await page.$$eval("#f-herramientas input[type=checkbox]", (cs) => cs.map((c) => c.value).sort()), ["notara", "pareo"]);
    await page.fill("#f-nombre", "Ana María Solís Vargas");
    igual("propone el usuario del nombre", (await page.textContent("#f-usuario-vista")).includes("«ana.solis»"), true);
    await page.click("#f-crear");
    igual("sin contraseña ni casilla, no manda nada y lo dice al pie", [llamadas.length, !!(await page.textContent("#f-clave-error")), !!(await page.textContent("#f-acepta-error"))], [0, true, true]);
    await page.click("#f-proponer");
    await page.check("#f-pareo");
    await page.check("#f-acepta");
    await page.click("#f-crear");
    await page.waitForFunction(() => !document.getElementById("recien").hidden);
    igual("manda nombre, contraseña y las herramientas marcadas", [llamadas[0].accion, llamadas[0].nombre, llamadas[0].herramientas, (llamadas[0].contrasena || "").length >= 8],
      ["crear", "Ana María Solís Vargas", ["pareo"], true]);
    igual("enseña el usuario que devolvió el servidor", await page.textContent("#recien-usuario"), "ana.solis");
    igual("el mensaje por WhatsApp lleva usuario y contraseña", decodeURIComponent(await page.getAttribute("#recien-whatsapp", "href")).includes("Usuario: ana.solis"), true);
    igual("la lista pinta al árbitro con su nombre literal", await page.evaluate(() => [!!window.__xss, document.querySelectorAll("#lista img").length, document.querySelector("#lista h3").textContent.startsWith("<img")]), [false, 0, true]);
    igual("y con sus herramientas marcadas", await page.$$eval("#lista li input[type=checkbox]", (cs) => cs.filter((c) => c.checked).map((c) => c.value)), ["pareo"]);
    await page.check('#lista li input[value="notara"]');
    await page.click("#lista li button:has-text('Guardar sus herramientas')");
    await page.waitForFunction(() => window.__rpc.some((r) => r[0] === "arbitro_herramientas_fijar"));
    igual("Guardar manda la lista entera", await page.evaluate(() => window.__rpc.find((r) => r[0] === "arbitro_herramientas_fijar")[1]),
      { p_arbitro: "11111111-aaaa", p_herramientas: ["pareo", "notara"] });
    const btn = page.locator("#lista li button:has-text('Cambiar su contraseña')");
    igual("«Cambiar su contraseña» dice si está abierto", await btn.getAttribute("aria-expanded"), "false");
    await btn.click();
    igual("y se abre", [await btn.getAttribute("aria-expanded"), await visible(page, "#lista li [id^=clave-in-]")], ["true", true]);
    igual("sin errores en la consola", errores, []);
    await ctx.close();
  }

  console.log("\nmis-arbitros.html, sin licencia propia");
  {
    const { ctx, page } = await abrir(browser, "mis-arbitros.html", { perfil: { is_admin: false, role: "alumno" }, rpc: { arbitros_puedo_dar: [], mi_acceso: { vigente: true, motivo: "sin_exigir" } } });
    await page.waitForFunction(() => !document.getElementById("denegado").hidden, null, { timeout: 15000 });
    igual("ve el aviso de la licencia y no el formulario", [await visible(page, "#denegado"), await visible(page, "#form")], [true, false]);
    await ctx.close();
  }

  const ARB = (mias) => ({ perfil: { full_name: "Luis Mora", role: "arbitro", is_admin: false }, rpc: { mis_herramientas: mias, mi_acceso: { vigente: false, motivo: "arbitro" } } });

  console.log("\narbitro.html, el panel del árbitro");
  {
    const { ctx, page, errores } = await abrir(browser, "arbitro.html", ARB(["pareo"]));
    await page.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 15000 });
    igual("una tarjeta, la de Pareo Integral", await page.$$eval("#lista > li > a:first-child", (as) => as.map((a) => a.getAttribute("href"))), ["pareo.html"]);
    igual("lo saluda por su nombre", await page.textContent("#saludo"), "Hola, Luis");
    await page.waitForFunction(() => document.querySelector('#header a[href$="arbitro.html"]'), null, { timeout: 10000 });
    igual("su «Academia» del encabezado es su panel", await page.$$eval('#header a[href$="clases.html"]', (as) => as.length), 0);
    igual("en sus migas no dice «Academia»", (await page.textContent("#migas")).includes("Academia"), false);
    // «Ver su manual» queda dentro de su li, no debajo de la tarjeta de la fila siguiente.
    igual("«Ver su manual» se ve entero, dentro de su tarjeta", await page.evaluate(() => {
      const m = [...document.querySelectorAll("#lista > li > a")].find((a) => a.textContent === "Ver su manual");
      if (!m) return "no hay manual";
      const r = m.getBoundingClientRect(), li = m.parentElement.getBoundingClientRect();
      return m.checkVisibility() && r.bottom <= li.bottom + 0.5 && r.height > 0;
    }), true);
    // La cuenta de árbitro no tiene el panel de la Academia: su salida está acá.
    igual("tiene «Cerrar sesión» a la vista", await visible(page, "#logout-btn"), true);
    await page.click("#logout-btn");
    await page.waitForURL("**/index.html", { timeout: 10000 }).catch(() => {});
    igual("«Cerrar sesión» cierra la sesión y lleva al inicio",
      [await page.evaluate(() => sessionStorage.getItem("__salio")), new URL(page.url()).pathname], ["1", "/index.html"]);
    igual("sin errores en la consola", errores, []);
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir(browser, "arbitro.html", ARB([]));
    await page.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 15000 });
    igual("sin herramientas, lo dice", [await visible(page, "#vacio"), await page.locator("#lista > li").count()], [true, 0]);
    await ctx.close();
  }

  console.log("\nEl árbitro fuera de la Academia (js/acceso-vigente.js)");
  for (const [ruta, queda] of [["licencias.html", false], ["desempates.html", true]]) {
    const { ctx, page } = await abrir(browser, ruta, ARB(["desempates"]));
    if (queda) {
      await page.waitForTimeout(2500);
      igual(ruta + ": página de una herramienta, se queda", new URL(page.url()).pathname, "/" + ruta);
      igual(ruta + ": su miga de partida dice «Mis herramientas» y lleva a su panel",
        await page.$eval("#migas li:first-child a", (a) => [a.textContent.trim(), a.getAttribute("href").endsWith("arbitro.html")]), ["Mis herramientas", true]);
    } else {
      await page.waitForURL("**/arbitro.html", { timeout: 15000 }).catch(() => {});
      igual(ruta + ": no es de sus herramientas, va a su panel", new URL(page.url()).pathname, "/arbitro.html");
    }
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nLas cuentas de árbitro están como se pidieron.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
