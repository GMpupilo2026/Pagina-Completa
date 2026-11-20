#!/usr/bin/env node
/* La sala de seminario de arbitraje (arbitro.html). Ver «La sala de seminario
 * de arbitraje» en docs/decisiones/permisos-y-roles.md.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - una política de escritura, o una función sin su revoke, deja que un
 *    árbitro se admita solo o se ponga la nota que quiera;
 *  - la opción buena viaja con la pregunta y cualquiera la lee antes de
 *    contestar;
 *  - una diapositiva o pregunta con una posición inventada (ilegal);
 *  - la pantalla manda la respuesta buena equivocada al barajar las opciones,
 *    o pinta el nombre de un árbitro como HTML.
 *
 * Primero lee las promesas en la migración y el contenido; después abre
 * arbitro.html con un Supabase de mentira, como instructor y como árbitro.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-seminario-arbitraje.js
 */
const fs = require("fs");
const path = require("path");
// El contenido es un archivo del propio repositorio: se corre en un contexto
// aparte (vm) solo para leer su objeto, como hace verificar-aula-arbitraje.js.
const vm = require("vm");
const { Chess } = require("chess.js");
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

// ---------------------------------------------------------------- la base
console.log("\nLa base (migración seminario_arbitraje)");
const mig = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => /_seminario_arbitraje\.sql$/.test(f));
ok(mig.length === 1, "hay una migración seminario_arbitraje");
const sql = mig.length ? leer("supabase/migraciones/" + mig[0]) : "";
const sinComentarios = sql.replace(/^\s*--.*$/gm, "");
const funcion = (nombre) => (sql.match(new RegExp("create or replace function " + nombre.replace(/\./g, "\\.") + "\\([\\s\\S]*?\\$function\\$;")) || [""])[0];
const TABLAS = ["seminario_salas", "seminario_participantes", "seminario_respuestas", "seminario_examenes"];
ok(/revoke all on public\.seminario_salas, public\.seminario_participantes,\s*public\.seminario_respuestas, public\.seminario_examenes from public, anon, authenticated;/.test(sql),
  "las cuatro tablas: nada para anon, y authenticated solo lee");
ok(!/create policy [a-z_]+ on public\.seminario_[a-z]+\s+for (insert|update|delete|all)/.test(sinComentarios), "ninguna política de escritura");
TABLAS.forEach((t) => ok(new RegExp("alter table public\\." + t + " enable row level security").test(sql), t + " tiene RLS"));
["seminario_salas", "seminario_participantes", "seminario_respuestas"].forEach((t) => {
  ok(new RegExp("create policy verificacion_en_dos_pasos on public\\." + t + " as restrictive").test(sql), t + ": verificación en dos pasos (está en Realtime)");
  ok(new RegExp("alter publication supabase_realtime add table public\\." + t).test(sql), t + " está en Realtime");
});
ok(/create trigger auditar after insert or update or delete on public\.seminario_participantes/.test(sql), "quién entra queda en la bitácora");
ok(/"seminario_participantes"/.test(leer("herramientas/verificar-auditoria.js")), "seminario_participantes está en VIGILADAS");
const preguntar = funcion("public.seminario_preguntar");
ok(/correcta = null/.test(preguntar) && !/p_correcta/.test(preguntar), "lanzar una pregunta NO manda la buena, y la borra");
ok(/pregunta_hasta = least\(pregunta_hasta, now\(\)\)/.test(funcion("public.seminario_revelar")), "mostrar la respuesta cierra la pregunta");
ok(/s\.correcta is not null/.test(funcion("public.seminario_responder")) && /seminario_admitido_en/.test(funcion("public.seminario_responder")),
  "contestar: solo admitido y solo antes de que se muestre la buena");
ok(/seminario_admitido_en/.test(funcion("public.seminario_entregar_examen")) && /do nothing;\s*if not found then raise/.test(funcion("public.seminario_entregar_examen")),
  "el examen: solo admitido y una sola vez");
ok(/c\.organizador_id = s\.instructor_id/.test(funcion("interno.seminario_puede_pedir")) && /yo\.role = 'arbitro'/.test(funcion("interno.seminario_puede_pedir")),
  "pedir entrar: solo una cuenta de árbitro, y a la sala de su organizador (o de administración)");
ok(/coalesce\(cardinality\(public\.arbitros_puedo_dar\(\)\) > 0, false\)/.test(funcion("interno.seminario_puedo_instruir")),
  "abrir una sala: quien puede dar herramientas (con coalesce)");
ok(/seminario_mia_abierta/.test(funcion("public.seminario_decidir")) && /seminario_mia_abierta/.test(funcion("public.seminario_mostrar")),
  "decidir y proyectar: solo el instructor de esa sala abierta");
ok(/revoke execute on function interno\.seminario_puede_pedir\(uuid, uuid\) from public, anon, authenticated/.test(sql), "seminario_puede_pedir no la llama nadie de afuera");
ok(/execute format\('revoke execute on function %s from public, anon', f\)/.test(sql), "las funciones públicas: revoke de public y anon");
ok(/cron\.schedule\('cerrar-seminarios-inactivos'/.test(sql), "la sala sin movimiento se cierra sola");

// ---------------------------------------------------------------- el contenido
console.log("\nEl contenido (js/arbitro-seminario/contenido.js)");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(leer("js/arbitro-seminario/contenido.js"), ctx);
const C = ctx.window.SEMINARIO_CONTENIDO;
const temas = [];
C.modulos.forEach((m) => m.temas.forEach((t) => temas.push(t)));
igual("tres días con cinco temas cada uno", C.modulos.map((m) => m.temas.length), [5, 5, 5]);
const ids = temas.map((t) => t.id);
ok(ids.every((id) => /^[a-z0-9-]{1,64}$/.test(id)) && new Set(ids).size === ids.length, "los ids de los temas son únicos y caben en seminario_salas.tema");
ok(temas.every((t) => t.diapositivas.length > 0 && t.diapositivas.length <= 200), "cada tema tiene diapositivas (y menos de 200)");
const fens = [];
temas.forEach((t) => { t.diapositivas.forEach((d) => d.fen && fens.push([t.id, d.fen])); t.preguntas.forEach((q) => q.fen && fens.push([t.id, q.fen])); });
const ilegales = fens.filter(([, f]) => { const v = new Chess().validate_fen(f); if (!v.valid) return true; const g = new Chess(f); return !g.fen(); });
igual("cada posición es un FEN legal (" + fens.length + ")", ilegales, []);
// Un rey en jaque del bando que no mueve es ilegal aunque el FEN sea válido.
const reyColgado = fens.filter(([, f]) => { const g = new Chess(f); const p = f.split(" "); p[1] = p[1] === "w" ? "b" : "w"; p[3] = "-"; const h = new Chess(); return h.load(p.join(" ")) && h.in_check(); });
igual("ningún bando que no mueve está en jaque", reyColgado, []);
const malas = [];
temas.forEach((t) => t.preguntas.forEach((q, i) => { if (!(q.opciones.length >= 2 && q.opciones.length <= 6 && q.correcta >= 0 && q.correcta < q.opciones.length)) malas.push(t.id + "#" + (i + 1)); }));
C.examen.forEach((q, i) => { if (!(q.opciones.length >= 2 && q.opciones.length <= 6 && q.correcta >= 0 && q.correcta < q.opciones.length)) malas.push("examen#" + (i + 1)); });
igual("cada pregunta tiene de 2 a 6 opciones y su buena existe", malas, []);
ok(C.examen.length >= 25, "el banco del examen alcanza para 25 preguntas (" + C.examen.length + ")");
ok(!/<[a-z]/i.test(JSON.stringify(C)), "el contenido no trae HTML");

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
              signOut: () => Promise.resolve({ error: null }) },
      from: (t) => chain(t === "profiles" ? C.perfil : (C.tablas && C.tablas[t]) || null),
      rpc: (nombre, args) => { window.__rpc.push([nombre, args || null]);
        if (nombre === "seminario_entregar_examen") return Promise.resolve({ data: Math.round(args.p_aciertos * 10000 / args.p_total) / 100, error: null });
        return Promise.resolve({ data: nombre in C.rpc ? C.rpc[nombre] : null, error: null }); },
      channel: () => canal, removeChannel: () => {},
    };
  })();`;
}
async function abrir(browser, c) {
  const ctx2 = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx2.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/vendor/supabase.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente(c) }));
  await page.route("https://prueba.supabase.co/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.goto(BASE + "/arbitro.html", { waitUntil: "domcontentloaded" });
  return { ctx: ctx2, page, errores };
}
const llamadas = (page, n) => page.evaluate((x) => window.__rpc.filter((r) => r[0] === x).map((r) => r[1]), n);
const NOMBRE_RARO = '<img src=x onerror="window.__xss=1">Luis';
const ARB = { full_name: "Luis Mora", role: "arbitro", is_admin: false };
const SALA = { id: "sala-1", instructor_id: "otro", titulo: "Seminario AF", cerrada_en: null, tema: "ilegal", diapositiva: 3,
  pregunta_id: null, pregunta: null, pregunta_hasta: null, correcta: null, examen_abierto: false };

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\narbitro.html, árbitro sin sala abierta");
  {
    const { ctx: c, page, errores } = await abrir(browser, { perfil: ARB, rpc: { mis_herramientas: [], mi_acceso: { vigente: false, motivo: "arbitro" }, seminario_salas_para_mi: [] } });
    await page.waitForFunction(() => !document.getElementById("seminario-caja").hidden, null, { timeout: 15000 });
    igual("ve la sección y que no hay sala", (await page.textContent("#seminario")).includes("No hay ninguna sala abierta"), true);
    igual("sin errores en la consola", errores, []);
    await c.close();
  }

  console.log("\narbitro.html, árbitro con una sala abierta");
  {
    const { ctx: c, page, errores } = await abrir(browser, { perfil: ARB, rpc: { mis_herramientas: [], mi_acceso: { vigente: false, motivo: "arbitro" },
      seminario_salas_para_mi: [{ sala_id: "sala-1", titulo: NOMBRE_RARO, instructor: "Oscar", abierta_en: "2026-11-16T10:00:00Z", mi_estado: null }],
      seminario_pedir_entrar: "esperando" } });
    await page.waitForSelector("#seminario button:has-text('Pedir entrar')", { timeout: 15000 });
    igual("el título se pinta literal, nunca como HTML", await page.evaluate(() => [!!window.__xss, document.querySelectorAll("#seminario img").length]), [false, 0]);
    await page.click("#seminario button:has-text('Pedir entrar')");
    await page.waitForFunction(() => window.__rpc.some((r) => r[0] === "seminario_pedir_entrar"));
    igual("«Pedir entrar» manda la sala", await llamadas(page, "seminario_pedir_entrar"), [{ p_sala: "sala-1" }]);
    igual("sin errores en la consola", errores, []);
    await c.close();
  }

  console.log("\narbitro.html, árbitro admitido: diapositiva y pregunta");
  {
    const hasta = new Date(Date.now() + 60000).toISOString();
    const sala = Object.assign({}, SALA, { pregunta_id: "ilegal#1-x", pregunta: { texto: "¿Qué decide el árbitro?", opciones: ["Uno", "Dos", "Tres"] }, pregunta_hasta: hasta });
    const { ctx: c, page, errores } = await abrir(browser, { perfil: ARB,
      rpc: { mis_herramientas: [], mi_acceso: { vigente: false, motivo: "arbitro" },
        seminario_salas_para_mi: [{ sala_id: "sala-1", titulo: "Seminario AF", instructor: "Oscar", abierta_en: "2026-11-16T10:00:00Z", mi_estado: "admitido" }] },
      tablas: { seminario_salas: sala } });
    await page.waitForSelector(".sem-diapositiva .sem-diap-titulo", { timeout: 15000 });
    const titulo = C.modulos[0].temas.find((t) => t.id === "ilegal").diapositivas[3].titulo;
    igual("ve la diapositiva que proyecta el instructor", (await page.textContent(".sem-diap-titulo")).includes(titulo), true);
    igual("el tablero de la diapositiva se pinta", await page.evaluate(() => document.querySelectorAll(".sem-diapositiva .example-board *").length > 20), true);
    await page.waitForSelector(".sem-opcion", { timeout: 10000 });
    igual("ve las tres opciones", await page.$$eval(".sem-opcion", (bs) => bs.length), 3);
    await page.click(".sem-opcion >> nth=1");
    await page.waitForFunction(() => window.__rpc.some((r) => r[0] === "seminario_responder"));
    igual("contestar manda sala, pregunta y opción", await llamadas(page, "seminario_responder"), [{ p_sala: "sala-1", p_pregunta_id: "ilegal#1-x", p_opcion: 1 }]);
    igual("la opción elegida queda marcada", await page.$$eval(".sem-opcion", (bs) => bs.map((b) => b.getAttribute("aria-pressed"))), ["false", "true", "false"]);
    igual("sin errores en la consola", errores, []);
    await c.close();
  }

  console.log("\narbitro.html, árbitro admitido: el examen");
  {
    const sala = Object.assign({}, SALA, { examen_abierto: true });
    const { ctx: c, page, errores } = await abrir(browser, { perfil: ARB,
      rpc: { mis_herramientas: [], mi_acceso: { vigente: false, motivo: "arbitro" },
        seminario_salas_para_mi: [{ sala_id: "sala-1", titulo: "Seminario AF", instructor: "Oscar", abierta_en: "2026-11-16T10:00:00Z", mi_estado: "admitido" }] },
      tablas: { seminario_salas: sala, seminario_examenes: null } });
    await page.waitForSelector("button:has-text('Empezar el examen')", { timeout: 15000 });
    await page.click("button:has-text('Empezar el examen')");
    igual("25 preguntas", await page.$$eval(".sem-examen-preg", (f) => f.length), 25);
    // Contesta bien todas: la buena es la opción con el texto de `correcta`.
    const banco = C.examen.map((q) => [q.texto, q.opciones[q.correcta]]);
    await page.evaluate((b) => {
      const mapa = new Map(b);
      document.querySelectorAll(".sem-examen-preg").forEach((fs) => {
        const texto = fs.querySelector("legend").textContent.replace(/^\d+\.\s/, "");
        const buena = mapa.get(texto);
        [...fs.querySelectorAll("label")].find((l) => l.textContent.slice(4) === buena).querySelector("input").click();
      });
    }, banco);
    await page.click("button:has-text('Entregar el examen')");
    await page.waitForFunction(() => window.__rpc.some((r) => r[0] === "seminario_entregar_examen"));
    igual("todo bien: entrega 25 de 25", await llamadas(page, "seminario_entregar_examen"), [{ p_sala: "sala-1", p_aciertos: 25, p_total: 25 }]);
    await page.waitForSelector(".sem-nota-grande");
    igual("y enseña la nota exacta", (await page.textContent(".sem-nota-grande")).trim(), "Tu nota: 100,00 / 100");
    igual("sin errores en la consola", errores, []);
    await c.close();
  }

  const ORG = { full_name: "Oscar", role: "profesor", is_admin: false };
  console.log("\narbitro.html, instructor sin sala");
  {
    const { ctx: c, page, errores } = await abrir(browser, { perfil: ORG, rpc: { mis_herramientas: [], mi_acceso: { vigente: true, motivo: "equipo" }, arbitros_puedo_dar: ["pareo"], seminario_abrir: "sala-1" } });
    await page.waitForSelector("#seminario button:has-text('Abrir la sala')", { timeout: 15000 });
    igual("dice que está cerrada", (await page.textContent("#seminario")).includes("La sala está cerrada"), true);
    await page.click("#seminario button:has-text('Abrir la sala')");
    await page.waitForFunction(() => window.__rpc.some((r) => r[0] === "seminario_abrir"));
    igual("«Abrir la sala» manda el nombre", await llamadas(page, "seminario_abrir"), [{ p_titulo: "Seminario de Árbitro FIDE" }]);
    igual("sin errores en la consola", errores, []);
    await c.close();
  }

  console.log("\narbitro.html, instructor con la sala abierta");
  {
    const sala = Object.assign({}, SALA, { instructor_id: "yo", tema: "tocada", diapositiva: 0 });
    const { ctx: c, page, errores } = await abrir(browser, { perfil: ORG,
      rpc: { mis_herramientas: [], mi_acceso: { vigente: true, motivo: "equipo" }, arbitros_puedo_dar: ["pareo"],
        seminario_participantes_de: [
          { arbitro_id: "a1", nombre: NOMBRE_RARO, estado: "esperando", pedido_en: "2026-11-16T10:01:00Z" },
          { arbitro_id: "a2", nombre: "Ana", estado: "admitido", pedido_en: "2026-11-16T10:00:00Z" }],
        seminario_examenes_de: [] },
      tablas: { seminario_salas: sala } });
    await page.waitForSelector("#seminario button:has-text('Dejar entrar')", { timeout: 15000 });
    igual("la sala de espera pinta el nombre literal", await page.evaluate(() => [!!window.__xss, document.querySelectorAll("#seminario img").length,
      [...document.querySelectorAll(".sem-persona-nombre")].some((s) => s.textContent.startsWith("<img"))]), [false, 0, true]);
    await page.click("#seminario button:has-text('Dejar entrar')");
    await page.waitForFunction(() => window.__rpc.some((r) => r[0] === "seminario_decidir"));
    igual("«Dejar entrar» admite a esa persona", await llamadas(page, "seminario_decidir"), [{ p_sala: "sala-1", p_arbitro: "a1", p_estado: "admitido" }]);
    await page.click("#seminario button:has-text('Siguiente')");
    await page.waitForFunction(() => window.__rpc.some((r) => r[0] === "seminario_mostrar"));
    igual("«Siguiente» proyecta la diapositiva 2 del tema", await llamadas(page, "seminario_mostrar"), [{ p_sala: "sala-1", p_tema: "tocada", p_diapositiva: 1 }]);
    // Lanzar la primera pregunta del tema: mismas opciones, barajadas, sin la buena.
    await page.click("details.sem-tarjeta > summary");
    await page.click("details.sem-tarjeta button:has-text('Lanzar') >> nth=0");
    await page.waitForFunction(() => window.__rpc.some((r) => r[0] === "seminario_preguntar"));
    const lanz = (await llamadas(page, "seminario_preguntar"))[0];
    const q = C.modulos[0].temas[0].preguntas[0];
    igual("lanza la pregunta con las mismas opciones (barajadas) y sin la buena",
      [lanz.p_texto, lanz.p_opciones.slice().sort(), "p_correcta" in lanz, lanz.p_segundos], [q.texto, q.opciones.slice().sort(), false, 45]);
    // «Mostrar la respuesta» tiene que mandar el índice de la buena YA barajada.
    const buenaBarajada = lanz.p_opciones.indexOf(q.opciones[q.correcta]);
    igual("recuerda la buena tal como quedó al barajar", await page.evaluate(() => JSON.parse(sessionStorage.getItem("seminario_pregunta_sala-1") || "{}").buena), buenaBarajada);
    igual("sin errores en la consola", errores, []);
    await c.close();

    // Con la pregunta ya en la sala (otra apertura, con la misma pestaña recordada).
    const sala2 = Object.assign({}, sala, { pregunta_id: lanz.p_pregunta_id, pregunta: { texto: lanz.p_texto, opciones: lanz.p_opciones },
      pregunta_hasta: new Date(Date.now() + 60000).toISOString() });
    const r2 = await abrir(browser, { perfil: ORG,
      rpc: { mis_herramientas: [], mi_acceso: { vigente: true, motivo: "equipo" }, arbitros_puedo_dar: ["pareo"], seminario_participantes_de: [],
        seminario_respuestas_de: [{ arbitro_id: "a2", nombre: "Ana", opcion: buenaBarajada, respondida_en: "2026-11-16T10:05:00Z" }], seminario_examenes_de: [] },
      tablas: { seminario_salas: sala2 } });
    await r2.page.evaluate(([id, buena]) => sessionStorage.setItem("seminario_pregunta_sala-1", JSON.stringify({ id, buena, explicacion: "", fen: null })),
      [lanz.p_pregunta_id, buenaBarajada]);
    await r2.page.reload({ waitUntil: "domcontentloaded" });
    await r2.page.waitForSelector("button:has-text('Mostrar la respuesta')", { timeout: 15000 });
    igual("el conteo dice cuántos contestaron", (await r2.page.textContent(".sem-pregunta-viva")).includes("1 persona contestó"), true);
    await r2.page.click("button:has-text('Mostrar la respuesta')");
    await r2.page.waitForFunction(() => window.__rpc.some((r) => r[0] === "seminario_revelar"));
    igual("«Mostrar la respuesta» manda la buena tal como se barajó", await llamadas(r2.page, "seminario_revelar"), [{ p_sala: "sala-1", p_correcta: buenaBarajada }]);
    igual("sin errores en la consola", r2.errores, []);
    await r2.ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nLa sala de seminario está como se pidió.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
