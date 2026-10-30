/* Verifica los casos del VAR para el curso de árbitros (arbitraje.html,
 * js/arbitraje-casos-var.js; la tabla y el bucket en
 * supabase/migraciones/*_arbitraje_casos_var.sql). Con un doble de Supabase:
 *
 *   - un profesor ve los casos con su video (dirección firmada), elige y ve si
 *     era eso, por qué y el artículo; no puede agregar ni borrar;
 *   - quien administra agrega un caso (sube el video y guarda la fila con el
 *     MISMO id), no sin confirmar el permiso de quienes salen, y lo borra
 *     (la fila y el video);
 *   - lo que escribe la gente va como texto;
 *   - la RLS de la migración: leer, profesores y administración; escribir,
 *     solo administración; el bucket, privado.
 * Ver «Los casos del VAR para el curso de árbitros» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   node herramientas/verificar-casos-var.js   (con el sitio en el 8777)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : "\n      esperaba: " + JSON.stringify(esperado) + "\n      salió:    " + JSON.stringify(hallado)));
}

console.log("\n=== La base: quién lee y quién escribe ===");
{
  const archivo = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).find((f) => /_arbitraje_casos_var\.sql$/.test(f));
  const sql = archivo ? fs.readFileSync(path.join(RAIZ, "supabase/migraciones", archivo), "utf8") : "";
  igual("la migración está guardada", !!archivo, true);
  igual("leer: profesores y administración", /arbitraje_casos_var_select[\s\S]*?is_admin from public\.my_profile\(\)\) or \(select role from public\.my_profile\(\)\) = 'profesor'/.test(sql), true);
  igual("agregar, cambiar y borrar: solo administración", ["insert", "update", "delete"].every((x) => new RegExp("arbitraje_casos_var_" + x + "[\\s\\S]*?coalesce\\(\\(select is_admin from public\\.my_profile\\(\\)\\), false\\)").test(sql)), true);
  igual("el bucket del video es privado", /values \('arbitraje-var', 'arbitraje-var', false,/.test(sql), true);
  igual("y su lectura, también solo profesores y administración", /arbitraje_var_select on storage\.objects[\s\S]*?bucket_id = 'arbitraje-var'[\s\S]*?'profesor'/.test(sql), true);
}

// El doble de Supabase: lo justo para arbitraje.html, con los casos y el bucket.
function cliente(yo) {
  return `(() => {
    const yo = ${JSON.stringify(yo)};
    const casos = window.__casos = ${JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", titulo: "¿Tocó el caballo? <img src=x onerror=\"window.__xss=1\">", pregunta: "Las negras reclaman que las blancas tocaron el caballo de g1. ¿Qué decides?", opciones: ["Debe jugar el caballo", "No pasa nada", "Pierde la partida"], correcta: 0, explicacion: "Si tocó una pieza propia con intención de moverla, la tiene que mover.", articulo: "art. 4.3", video: "11111111-1111-4111-8111-111111111111.webm", desde: 2, created_at: "2026-10-30T00:00:00Z" }])};
    window.__subidas = []; window.__borrados = []; window.__insertados = [];
    const consulta = (tabla) => {
      const q = { filtros: [], op: "select", fila: null };
      const resolver = () => {
        if (tabla === "profiles") return { data: q.una ? yo : [yo], error: null };
        if (tabla === "arbitraje_casos_var") {
          if (q.op === "insert") { if (!yo.is_admin) return { data: null, error: { message: "RLS" } }; window.__insertados.push(q.fila); casos.unshift(Object.assign({ desde: 0, created_at: new Date().toISOString() }, q.fila)); return { data: null, error: null }; }
          if (q.op === "delete") { if (!yo.is_admin) return { data: null, error: { message: "RLS" } }; const id = (q.filtros.find((f) => f[0] === "id") || [])[1]; const i = casos.findIndex((c) => c.id === id); if (i >= 0) casos.splice(i, 1); return { data: null, error: null }; }
          return { data: casos.slice(), error: null };
        }
        return { data: q.una ? null : [], error: null, count: 0 };
      };
      const p = {
        select() { return p; }, order() { return p; }, range() { return p; }, limit() { return p; }, in() { return p; }, gte() { return p; }, neq() { return p; }, is() { return p; },
        eq(c, v) { q.filtros.push([c, v]); return p; },
        insert(f) { q.op = "insert"; q.fila = f; return p; }, delete() { q.op = "delete"; return p; }, update() { q.op = "update"; return p; }, upsert() { q.op = "upsert"; return p; },
        maybeSingle() { q.una = true; return Promise.resolve(resolver()); }, single() { q.una = true; return Promise.resolve(resolver()); },
        then(a, b) { return Promise.resolve(resolver()).then(a, b); },
      };
      return p;
    };
    window.sb = {
      auth: { getSession: async () => ({ data: { session: { user: { id: yo.id } } } }), getUser: async () => ({ data: { user: { id: yo.id } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      from: consulta,
      rpc: async () => ({ data: null, error: null }),
      functions: { invoke: async () => ({ data: null, error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
      storage: { from: (b) => ({
        createSignedUrls: async (ps) => ({ data: ps.map((p) => ({ path: p, signedUrl: "https://firmada.test/" + b + "/" + p + "?token=1" })), error: null }),
        upload: async (p, archivo, o) => { if (!yo.is_admin) return { error: { message: "RLS" } }; window.__subidas.push({ b, p, tipo: o && o.contentType, tam: archivo.size }); return { data: { path: p }, error: null }; },
        remove: async (ps) => { window.__borrados.push(...ps.map((p) => b + "/" + p)); return { data: null, error: null }; },
      }) },
    };
  })();`;
}

async function abrir(browser, yo) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente(yo) }));
  await ctx.route("https://firmada.test/**", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.addInitScript(contestarAvisos);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/arbitraje.html", { waitUntil: "load" });
  return { ctx, page, errores };
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    console.log("\n=== Un profesor: mira el caso y decide ===");
    {
      const { ctx, page, errores } = await abrir(browser, { id: "u-profe", role: "profesor", is_admin: false, full_name: "Profe" });
      await page.waitForSelector('#casos-var-lista article[data-caso]', { timeout: 8000 }).catch(() => {});
      const vis = (s) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, s);
      igual("ve la sección con el caso", [await vis("#casos-var"), await page.$$eval("#casos-var-lista article", (a) => a.length)], [true, 1]);
      igual("el título va como texto, sin ejecutar nada", [await page.textContent("#casos-var-lista h3"), await page.evaluate(() => window.__xss || 0)], ["¿Tocó el caballo? <img src=x onerror=\"window.__xss=1\">", 0]);
      igual("el video, con su dirección firmada del bucket privado", await page.getAttribute("#casos-var-lista video", "src"), "https://firmada.test/arbitraje-var/11111111-1111-4111-8111-111111111111.webm?token=1");
      await page.click('#casos-var-lista [data-opcion="1"]');
      igual("eligiendo mal: lo que correspondía, por qué y el artículo", await page.$$eval("#casos-var-lista [role=status] p", (p) => p.map((x) => x.textContent)),
        ["❌ No: lo que corresponde es «Debe jugar el caballo».", "Si tocó una pieza propia con intención de moverla, la tiene que mover.", "Leyes del Ajedrez de la FIDE, art. 4.3."]);
      await page.click('#casos-var-lista [data-opcion="0"]');
      igual("eligiendo bien: «Así es», y la elegida queda marcada", [await page.textContent("#casos-var-lista [role=status] p"), await page.getAttribute('#casos-var-lista [data-opcion="0"]', "aria-pressed"), await page.getAttribute('#casos-var-lista [data-opcion="1"]', "aria-pressed")], ["✅ Así es.", "true", "false"]);
      igual("no puede agregar ni borrar casos", [await vis("#casos-var-nuevo"), await page.$$eval("#casos-var-lista button", (b) => b.some((x) => /Borrar/.test(x.textContent)))], [false, false]);
      igual("sin errores en la consola (profesor)", errores, []);
      await ctx.close();
    }

    console.log("\n=== Quien administra: agrega un caso y lo borra ===");
    {
      const { ctx, page, errores } = await abrir(browser, { id: "u-admin", role: "profesor", is_admin: true, full_name: "Admin" });
      await page.waitForSelector('#casos-var-lista article[data-caso]', { timeout: 8000 }).catch(() => {});
      await page.click("#casos-var-nuevo summary");
      const video = { name: "var-mesa-3.webm", mimeType: "video/webm", buffer: Buffer.alloc(4000, 1) };
      await page.setInputFiles("#caso-video", video);
      await page.fill("#caso-titulo", "La soltó en otra casilla");
      await page.fill("#caso-pregunta", "¿Qué pasa si soltó la torre en d1?");
      await page.fill("#caso-op1", "Queda en d1");
      await page.fill("#caso-op2", "La puede cambiar");
      await page.selectOption("#caso-correcta", "0");
      await page.fill("#caso-explicacion", "Al soltar la pieza en una casilla, la jugada queda hecha.");
      await page.fill("#caso-articulo", "art. 4.6");
      await page.fill("#caso-desde", "3");
      await page.click("#form-caso-var button[type=submit]");
      igual("sin confirmar el permiso de quienes salen, no se sube nada", [await page.textContent("#casos-var-msg"), await page.evaluate(() => window.__subidas.length)], ["Falta confirmar el permiso de quienes salen.", 0]);
      await page.check("#caso-permiso");
      await page.click("#form-caso-var button[type=submit]");
      await page.waitForFunction(() => document.querySelectorAll("#casos-var-lista article").length === 2, null, { timeout: 5000 }).catch(() => {});
      const [subida, fila] = await page.evaluate(() => [window.__subidas[0], window.__insertados[0]]);
      igual("sube el video al bucket privado y guarda el caso con el MISMO id", [subida && subida.b, subida && /^[0-9a-f-]{36}\.webm$/.test(subida.p), subida && subida.tipo, fila && fila.video === subida.p && fila.id + ".webm" === subida.p], ["arbitraje-var", true, "video/webm", true]);
      igual("con lo que se escribió", fila && [fila.titulo, fila.opciones, fila.correcta, fila.articulo, fila.desde], ["La soltó en otra casilla", ["Queda en d1", "La puede cambiar"], 0, "art. 4.6", 3]);
      igual("y aparece primero en la lista", await page.textContent("#casos-var-lista article h3"), "La soltó en otra casilla");
      await page.click('#casos-var-lista article:first-child button:has-text("Borrar este caso")');
      await page.waitForFunction(() => document.querySelectorAll("#casos-var-lista article").length === 1, null, { timeout: 5000 }).catch(() => {});
      igual("«Borrar este caso» (con confirmación) borra la fila y el video", [await page.$$eval("#casos-var-lista article", (a) => a.length), await page.evaluate(() => window.__borrados)], [1, ["arbitraje-var/" + subida.p]]);
      igual("sin errores en la consola (administración)", errores, []);
      await ctx.close();
    }

    console.log("\n=== Un alumno no entra ===");
    {
      const { ctx, page } = await abrir(browser, { id: "u-alumno", role: "alumno", is_admin: false, full_name: "Ana" });
      await page.waitForSelector("#denegado:not(.hidden)", { timeout: 8000 }).catch(() => {});
      igual("ve el aviso de acceso, no los casos", [await page.evaluate(() => !document.getElementById("denegado").classList.contains("hidden")), await page.evaluate(() => document.getElementById("casos-var").checkVisibility())], [true, false]);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobaciones fallaron." : "\nLos casos del VAR están como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
