/* El premio por terminar un tema de Entrenamiento (el doble de lo que valen
   sus ejercicios, hasta 500): lo paga la base (interno.premiar_tema_terminado,
   20261024200705_premio_temas.sql) con la lista de ejercicios de cada tema que
   carga de entreno/data/premio-temas.json. Acá se comprueba lo que puede
   quedar mal sin dar ningún error:

   1. Que premio-temas.json sea lo que hoy dan las fuentes: si se agrega un
      ejercicio a un tema y no se vuelve a generar, el tema no se termina
      nunca (le falta un ejercicio que la base no conoce) o se termina antes.
   2. Que cada tema tenga los mismos ejercicios que dice metas.json (lo que
      usan las tareas): dos cuentas distintas del mismo tema serían dos
      verdades.
   3. Que el trigger reconozca cada actividad del archivo (premio_grupo) y
      lea el id que de verdad anota cada página (premio_item).
   4. Que el aviso «¡Terminaste el tema!» salga en la página al anotar el
      ejercicio, dicho con role=status, y una sola vez.

   Lo que NO comprueba: que la base pague (eso se probó en la base dentro de
   un bloque que se deshace; ver la decisión). Y que la base tenga cargada la
   última versión del archivo: eso se hace a mano al publicarlo.

   Uso:  node herramientas/verificar-todo.js premio-temas                   */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

// ---------- 1) el archivo, al día con las fuentes ----------
const ARCHIVO = path.join(RAIZ, "entreno/data/premio-temas.json");
const antes = fs.readFileSync(ARCHIVO, "utf8");
execFileSync("python3", [path.join(__dirname, "premio-temas.py")], { cwd: RAIZ, stdio: "pipe" });
const despues = fs.readFileSync(ARCHIVO, "utf8");
if (antes !== despues) {
  fs.writeFileSync(ARCHIVO, antes);
  ok(false, "entreno/data/premio-temas.json no está al día con las fuentes: correr python3 herramientas/premio-temas.py (y cargarlo en la base)");
}
const datos = JSON.parse(antes);

// ---------- 2) los mismos totales que metas.json ----------
{
  const metas = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/metas.json"), "utf8"));
  const de = (g, t) => datos.temas.find((x) => x.grupo === g && x.tema === t);
  const pares = [["temas", "temas"], ["mates", "mates"], ["4x4", "4x4"], ["tipos", "tipos"], ["aprender", "aprender"], ["practicas", "practicar"]];
  for (const [seccion, grupo] of pares) {
    for (const r of metas[seccion] || []) {
      if (r.total == null || r.total < 2) continue;
      const t = de(grupo, r.clave);
      ok(t, `el tema ${grupo}/${r.clave} está en metas.json pero no paga premio al terminarlo`);
      if (t) ok(t.items.length === r.total, `${grupo}/${r.clave}: metas.json dice ${r.total} ejercicios y el premio cuenta ${t.items.length}`);
    }
  }
  datos.temas.forEach((t) => {
    ok(t.items.length >= 2, `${t.grupo}/${t.tema} tiene un solo ejercicio: no es un tema`);
    ok(new Set(t.items).size === t.items.length, `${t.grupo}/${t.tema} tiene ejercicios repetidos`);
  });
}

// ---------- 3) el trigger conoce cada grupo y lee el id que anota cada página ----------
{
  const sql = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261024200705_premio_temas.sql"), "utf8");
  const grupos = [...new Set(datos.temas.map((t) => t.grupo))];
  grupos.forEach((g) => ok(new RegExp("'" + g + "'").test(sql.slice(sql.indexOf("premio_grupo"), sql.indexOf("premiar_tema_terminado"))),
    `premio_grupo()/premio_item() no conocen el grupo «${g}»`));
  // El id que anota cada página, leído de su código.
  const anota = {
    "js/entreno-mates.js": /log\('mates', \{ puzzle_id:/,
    "js/entreno-temas.js": /log\(actividad, \{ puzzle_id:/,
    "js/entreno-4x4.js": /log\('4x4', \{ puzzle_id: puz\.id/,
    "js/entreno-tipos.js": /log\("tipos", \{ puzzle_id: k,/,
    "js/entreno-aprender.js": /log\('aprender', \{ lesson_id:/,
    "js/entreno-practicas.js": /log\('practicar', \{ set_id:/,
    "js/entreno-aperturas.js": /log\("aperturas", \{ linea_id:/,
  };
  for (const [archivo, re] of Object.entries(anota)) {
    ok(re.test(fs.readFileSync(path.join(RAIZ, archivo), "utf8")), `${archivo} ya no anota el id que espera premio_item(): el tema no se terminaría nunca`);
  }
}

// ---------- 4) el aviso en la página ----------
async function main() {
  const navegador = await chromium.launch({ executablePath: CHROME });
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(`
    window.__llamadas = [];
    (function () {
      function tabla() {
        const b = { select() { return b; }, eq() { return b; }, neq() { return b; }, in() { return b; }, gte() { return b; }, lte() { return b; },
          order() { return b; }, limit() { return b; }, maybeSingle() { return b; }, single() { return b; },
          upsert() { return b; }, insert(f) { window.__llamadas.push({ insert: f }); return b; }, update() { return b; },
          then(resolve) { resolve({ data: [], error: null }); } };
        return b;
      }
      window.sb = {
        auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" } } } }),
          getUser: () => Promise.resolve({ data: { user: { id: "u-ana" } } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
        from: tabla,
        channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
        removeChannel() {},
        rpc(nombre, args) {
          window.__llamadas.push({ rpc: nombre, args });
          if (nombre === "mis_temas_terminados") return Promise.resolve({ data: [{ nombre: "Mate en 1", cantidad: 500, created_at: "2026-10-24T20:00:00Z" }], error: null });
          return Promise.resolve({ data: [], error: null });
        },
      };
    })();`);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/entreno/mates.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.EntrenoProgress, null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => window.EntrenoProgress.log("mates", { puzzle_id: "mate1-0306", category: "mate1" }));
  await page.waitForSelector("[data-tema-terminado]", { timeout: 4000 }).catch(() => {});
  const aviso = await page.$eval("[data-tema-terminado]", (a) => ({ texto: a.textContent, rol: a.getAttribute("role"), ve: a.checkVisibility() })).catch(() => null);
  ok(aviso && aviso.ve && /Terminaste el tema «Mate en 1».*500 Puntos Ajedrez/.test(aviso.texto), "no sale el aviso del tema terminado con su nombre y sus puntos: " + JSON.stringify(aviso));
  ok(aviso && aviso.rol === "status", "el aviso del tema terminado no se anuncia (role=status)");
  await page.evaluate(() => window.EntrenoProgress.log("mates", { puzzle_id: "mate1-0305", category: "mate1" }));
  await page.waitForTimeout(800);
  ok(await page.$$eval("[data-tema-terminado]", (l) => l.length) === 1, "el aviso del mismo tema terminado se repite");
  await navegador.close();

  console.log(fallos.length ? fallos.map((f) => "✗ " + f).join("\n") : `✓ Todo bien: ${datos.temas.length} temas al día con sus fuentes y con metas.json, y el aviso sale una vez.`);
  process.exit(fallos.length ? 1 : 0);
}

main();
