/* Comprueba, en un navegador, la cola de «Repasar fallados» de Ejercicios por
   tema y de Mates (js/repaso-fallados.js) y el bloque «Hoy te toca» del hub de
   Entrenamiento (js/entreno-index.js).

   - Un ejercicio resuelto con error entra a la cola y vuelve HOY; uno limpio a
     la primera no entra.
   - La cola se ofrece en la lista de temas, se abre, trae el que costó, y al
     repasarlo limpio se reprograma para más adelante. Repasar no vuelve a
     registrar el ejercicio en training_progress (ya contó la primera vez).
   - Tres repasos limpios seguidos lo sacan de la cola, con una marca y no un
     borrado (la cola se funde entre aparatos sumando fichas).
   - El hub dice qué toca hoy: la semana del plan del diagnóstico (primero,
     con a dónde ir y cuánto lleva ahí), repasos de Temas, líneas de Aperturas
     vencidas (no las nuevas) y el diagnóstico si falta o tiene más de cuatro
     semanas. Arriba, la meta del día (de Logros); sin nada pendiente queda
     solo esa.

   - Visualización y Practicar tienen la misma cola (Practicar, por ronda,
     y en el repaso vale el motivo de la serie de origen), y el hub la
     propone. También Tipos de entrenamiento (de todos los tipos, en #repaso)
     y Finales (la pestaña lo marca; ?repaso=1 lo abre).
   - Tipos, Practicar y 4×4 registran `limpio` en training_progress.

   Nada de esto da un error si se rompe: el ejercicio fallado simplemente no
   vuelve nunca, que es lo que pasaba antes.

   Uso:  npm install; node herramientas/verificar-todo.js entreno-repaso       */
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir } = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CLAVE = "entreno_temas_repaso_v1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function sinErrores(errores, pagina) {
  igual(`${pagina}: sin errores en la página`, errores.length ? errores.join(" | ") : "ninguno", "ninguno");
}
const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const inserts = (page) => page.evaluate(() => window.__inserts.filter((i) => i.tabla === "training_progress").length);

async function temas(browser) {
  console.log("\n=== Ejercicios por tema: la cola de «Repasar fallados» ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=fork&desde=0", {}, { entreno_temas_desde: "0" });
  await page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, { timeout: 20000 });

  // El primero, con un error; el segundo, limpio.
  const fallado = await page.evaluate(() => { const id = currentId(); missedThisPuzzle = true; finishPuzzle(); return id; });
  await page.click("#fin-ejercicio .primary");   // «Siguiente ejercicio →»: ya no salta solo
  await page.waitForFunction((id) => currentId() !== id && !locked, fallado, { timeout: 5000 });
  const limpio = await page.evaluate(() => { const id = currentId(); missedThisPuzzle = false; usedHintThisPuzzle = false; finishPuzzle(); return id; });
  const cola = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), CLAVE);
  igual("el resuelto con error entra a la cola, con su tema", cola[fallado] && cola[fallado].tema, "fork");
  igual("y vuelve hoy mismo", cola[fallado] && cola[fallado].vence, hoy());
  igual("el resuelto limpio a la primera no entra", limpio in cola, "false");

  // La lista de temas ofrece el repaso.
  await page.evaluate(() => showThemes());
  igual("la lista de temas ofrece el repaso",
    await page.evaluate(() => document.getElementById("repaso-caja").checkVisibility()), "true");
  igual("y dice cuántos", await page.evaluate(() => document.getElementById("repaso-texto").textContent),
    "Hoy toca repasar 1 ejercicio que te costó (lo resolviste con un error o con una pista).");

  // Se abre y trae el que costó, sin selector de dificultad.
  await page.click("#repaso-btn");
  igual("el repaso trae el que costó", await page.evaluate(() => currentId()), fallado);
  igual("con su título", await page.evaluate(() => document.getElementById("play-title").textContent), "Repasar fallados");
  igual("y sin selector de dificultad",
    await page.evaluate(() => document.getElementById("nivel-desde-caja").checkVisibility()), "false");

  // Repasarlo limpio: se reprograma para más adelante y no se vuelve a registrar.
  const antes = await inserts(page);
  await page.evaluate(() => { missedThisPuzzle = false; usedHintThisPuzzle = false; finishPuzzle(); });
  const ficha = await page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k))[id], [CLAVE, fallado]);
  igual("repasado limpio, vuelve más adelante", ficha.vence > hoy(), "true");
  igual("y no se registra otra vez en training_progress", (await inserts(page)) - antes, "0");
  await page.click("#fin-ejercicio .primary");   // «Siguiente ejercicio →»: ya no salta solo
  await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), { timeout: 5000 });
  igual("al terminar, «¡Repaso terminado!»",
    await page.evaluate(() => document.getElementById("celebration-title").textContent), "¡Repaso terminado!");
  await page.click("#celebration-back-btn");
  igual("y la lista ya no ofrece repaso (no queda nada para hoy)",
    await page.evaluate(() => document.getElementById("repaso-caja").checkVisibility()), "false");

  // Tres limpios seguidos lo sacan de la cola, con una marca.
  const salida = await page.evaluate(([k, id]) => {
    RepasoFallados.anotar(k, id, false, false);
    const r = RepasoFallados.anotar(k, id, false, false);
    return { devuelve: r, ficha: JSON.parse(localStorage.getItem(k))[id], enLaCola: RepasoFallados.enLaCola(k) };
  }, [CLAVE, fallado]);
  igual("con tres repasos limpios seguidos sale de la cola", [salida.devuelve, salida.enLaCola], [null, 0]);
  igual("marcado como fuera, no borrado", salida.ficha && salida.ficha.fuera, "true");
  const vuelve = await page.evaluate(([k, id]) => RepasoFallados.anotar(k, id, false, true) !== null, [CLAVE, fallado]);
  igual("y si se vuelve a sacar con pista, entra de nuevo", vuelve, "true");

  // `entraLimpio` (Tus propios errores): la primera vez entra aunque salga
  // limpio; uno que ya salió de la cola no vuelve a entrar por salir limpio.
  const conLimpio = await page.evaluate((k) => {
    const sin = RepasoFallados.anotar(k, "sin-opcion", false, false);
    const con = RepasoFallados.anotar(k, "con-opcion", false, false, null, { entraLimpio: true });
    ["x", "y", "z"].forEach(() => RepasoFallados.anotar(k, "ya-salio", false, false, null, { entraLimpio: true }));
    const antes = localStorage.getItem(k) && JSON.stringify(JSON.parse(localStorage.getItem(k))["ya-salio"]);
    const otraVez = RepasoFallados.anotar(k, "ya-salio", false, false, null, { entraLimpio: true });
    const despues = JSON.stringify(JSON.parse(localStorage.getItem(k))["ya-salio"]);
    return { sin, con: con && { intervalo: con.intervalo, racha: con.limpiosSeguidos }, otraVez, igual: antes === despues };
  }, CLAVE);
  igual("sin la opción, limpio a la primera no entra", conLimpio.sin, null);
  igual("con entraLimpio entra, y vuelve en un día", conLimpio.con, { intervalo: 1, racha: 1 });
  igual("y el que ya salió con su racha no vuelve a entrar por salir limpio (ni se toca su ficha)", [conLimpio.otraVez, conLimpio.igual], [null, true]);
  sinErrores(errores, "temas");
  await ctx.close();

  // ?repaso=1 (el enlace del hub) abre la cola directo.
  const cola1 = { [fallado]: { facilidad: 2.5, intervalo: 0, repasos: 0, fallos: 1, vence: hoy(), ultimo: new Date().toISOString(), tema: "fork" } };
  const d = await abrir(browser, "/entreno/temas.html?repaso=1", {}, { [CLAVE]: JSON.stringify(cola1) });
  await d.page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, { timeout: 20000 });
  igual("?repaso=1 abre la cola directo", await d.page.evaluate(() => [enRepaso(), currentId()]), [true, fallado]);
  sinErrores(d.errores, "temas con ?repaso=1");
  await d.ctx.close();
}

async function mates(browser) {
  console.log("\n=== Mates: la misma cola, en su pestaña ===");
  const CLAVE_M = "entreno_mates_repaso_v1";
  const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html");
  await page.waitForFunction(() => PUZZLES.mate1.length > 0 && game !== null, { timeout: 20000 });
  igual("sin nada que repasar, no hay pestaña de repaso",
    await page.evaluate(() => [...document.querySelectorAll("#tabs .tab")].some((b) => b.textContent.includes("Repasar"))), "false");

  // Con error vuelve hoy mismo (con solo pista, mañana: hoy no habría pestaña).
  const fallado = await page.evaluate(() => { const id = currentPuzzle().id; missedThisPuzzle = true; finishPuzzle(); return id; });
  const cola = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), CLAVE_M);
  igual("el resuelto con error entra a la cola de Mates, para hoy", cola[fallado] && cola[fallado].vence, hoy());
  igual("y aparece la pestaña, con cuántos", await page.evaluate(() =>
    [...document.querySelectorAll("#tabs .tab")].map((b) => b.textContent.trim()).find((t) => t.includes("Repasar"))), "🔁 Repasar fallados 1 para hoy");

  await page.click("#fin-ejercicio .primary");   // «Siguiente ejercicio →»: ya no salta solo
  await page.waitForFunction(() => !locked, { timeout: 5000 });
  await page.evaluate(() => [...document.querySelectorAll("#tabs .tab")].find((b) => b.textContent.includes("Repasar")).click());
  igual("la pestaña trae el que costó", await page.evaluate(() => [currentCategory, currentPuzzle().id]), ["__repaso", fallado]);
  const antes = await inserts(page);
  await page.evaluate(() => { missedThisPuzzle = false; usedHintThisPuzzle = false; finishPuzzle(); });
  igual("repasado limpio, vuelve más adelante",
    await page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k))[id].vence, [CLAVE_M, fallado]) > hoy(), "true");
  igual("y no se registra otra vez", (await inserts(page)) - antes, "0");
  await page.click("#fin-ejercicio .primary");   // «Siguiente ejercicio →»: ya no salta solo
  await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), { timeout: 5000 });
  igual("al terminar, «¡Repaso terminado!» y sin «volver a empezar»", await page.evaluate(() =>
    [document.getElementById("celebration-title").textContent, document.getElementById("celebration-replay-btn").checkVisibility()]),
    ["¡Repaso terminado!", false]);
  sinErrores(errores, "mates");
  await ctx.close();
}

async function hub(browser) {
  console.log("\n=== El hub: «Hoy te toca» ===");
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const ficha = (vence, ultimo) => ({ facilidad: 2.5, intervalo: 1, repasos: 1, fallos: 0, vence, ultimo });
  const local = {
    [CLAVE]: JSON.stringify({ a: Object.assign(ficha(ayer, "2026-01-01T00:00:00Z"), { tema: "fork" }), b: Object.assign(ficha(hoy(), "2026-01-01T00:00:00Z"), { tema: "pin" }), c: Object.assign(ficha(manana, "2026-01-01T00:00:00Z"), { tema: "pin" }) }),
    // Dos vencidas ya empezadas, una al día y una nueva (sin `ultimo`): cuentan dos.
    entreno_mates_repaso_v1: JSON.stringify({ "mate1-0001": Object.assign(ficha(hoy(), "2026-01-01T00:00:00Z"), { category: "mate1" }) }),
    aperturas_srs_v1: JSON.stringify({ l1: ficha(ayer, "2026-01-01T00:00:00Z"), l2: ficha(hoy(), "2026-01-01T00:00:00Z"), l3: ficha(manana, "2026-01-01T00:00:00Z"), l4: { vence: hoy() } }),
  };
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/index.html", {}, local);
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    const items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
    igual("se ve", await page.evaluate(() => document.getElementById("hoy").checkVisibility()), "true");
    igual("los repasos de Temas que vencieron (2 de 3)", items[0], ["🔁Repasar 2 ejercicios que te costaron", "temas.html?repaso=1"]);
    igual("los mates que costaron", items[1], ["♚Repasar 1 mate que te costó", "mates.html?repaso=1"]);
    igual("las líneas de Aperturas vencidas, sin contar la nueva", items[2], ["📖2 líneas de aperturas para repasar", "aperturas.html"]);
    igual("y nunca más de tres: el diagnóstico queda para cuando haya lugar", items.length, "3");
    igual("el título es un encabezado del nivel correcto (h2, bajo el h1)",
      await page.evaluate(() => document.getElementById("hoy-titulo").tagName), "H2");
    sinErrores(errores, "hub");
    await ctx.close();
  }
  {
    const viejo = new Date(Date.now() - 40 * 86400000).toISOString();
    const { page, ctx } = await abrir(browser, "/entreno/index.html", {}, { diagnostico_resultado_v1: JSON.stringify({ fecha: viejo }) });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    igual("con un diagnóstico de hace 40 días, pide repetirlo",
      await page.evaluate(() => document.querySelector("#hoy-lista a").textContent.includes("Repetir el diagnóstico")), "true");
    await ctx.close();
  }
  /* Partidas sin revisar en «Tus propios errores»: las de la Academia (el
     doble filtra de verdad: la ajena, la de otra variante y la que sigue en
     curso no cuentan; la ya revisada tampoco) y las de Lichess del usuario
     guardado, a quien se le pregunta una sola vez cada 6 horas. */
  {
    const J = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4", "exd4", "cxd4", "Bb4+"];
    const sala = (id, extra) => Object.assign({ id, variant: "estandar", status: "finished", white_id: "u-ana", black_id: "u-otro", moves: J, updated_at: "2026-09-20T10:00:00Z" }, extra);
    const tablas = {
      game_rooms: [sala("g-nueva"), sala("g-negras", { white_id: "u-otro", black_id: "u-ana" }), sala("g-revisada"), sala("g-corta", { moves: J.slice(0, 8) }),
        sala("g-ajena", { white_id: "u-x", black_id: "u-y" }), sala("g-crazy", { variant: "crazyhouse" }), sala("g-curso", { status: "playing" })],
      practice_games: [],
    };
    const cuerpo = J.map((m, i) => (i % 2 ? "" : (i / 2 + 1) + ". ") + m).join(" ") + " 1-0";
    const pgn = ["Nuev0001", "Nuev0002", "Visto000"].map((id) => '[Event "x"]\n[Site "https://lichess.org/' + id + '"]\n[UTCDate "2026.09.25"]\n[UTCTime "10:00:00"]\n[White "Ana_R"]\n[Black "otro"]\n[Variant "Standard"]\n\n' + cuerpo + "\n").join("\n");
    let pedidos = 0;
    const lichess = async (ctx) => {
      await ctx.route("https://lichess.org/api/games/user/**", (r) => { pedidos++; r.fulfill({ status: 200, contentType: "application/x-chess-pgn", headers: { "Access-Control-Allow-Origin": "*" }, body: pgn }); });
    };
    const localErr = {
      errores_analizadas_v1: JSON.stringify({ "juego:g-revisada": { r: "x", f: "2026-09-20T10:00:00Z", e1: 0, e2: 0 }, "lichess:Visto000": "2026-09-26T00:00:00Z" }),
      errores_cuenta_web_v1: JSON.stringify({ sitio: "lichess", usuario: "Ana_R" }),
    };
    const verAviso = (page) => page.evaluate(() => { const a = [...document.querySelectorAll("#hoy-lista a")].find((x) => /sin revisar/.test(x.textContent)); return a ? [a.textContent.replace("→", "").trim(), a.getAttribute("href")] : null; });
    const { page, ctx, errores } = await abrir(browser, "/entreno/index.html", tablas, localErr, lichess);
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => [...document.querySelectorAll("#hoy-lista a")].some((a) => /sin revisar/.test(a.textContent)), null, { timeout: 15000 }).catch(() => {});
    igual("avisa las partidas sin revisar: 2 de Lichess y 2 de la Academia (ni la revisada, ni la corta, ni la ajena, ni otra variante, ni en curso)",
      await verAviso(page), ["🪞4 partidas sin revisar en «Tus propios errores» (2 de Lichess, 2 de la Academia)", "tipos.html?traer=web#errores"]);
    igual("a Lichess se le preguntó una vez", pedidos, 1);
    // Revisa una de Lichess: al volver a pintar deja de contar, sin volver a preguntar.
    await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("errores_analizadas_v1")); v["lichess:Nuev0001"] = { r: "x", f: "2026-09-25T10:00:00Z", e1: 0, e2: 0 }; localStorage.setItem("errores_analizadas_v1", JSON.stringify(v)); });
    // (Sin recargar: el doble vuelve a escribir el localStorage en cada carga.)
    await page.evaluate(() => pintarHoy("u-ana"));
    await page.waitForFunction(() => [...document.querySelectorAll("#hoy-lista a")].some((a) => /3 partidas sin revisar/.test(a.textContent)), null, { timeout: 15000 }).catch(() => {});
    igual("al volver, la revisada ya no cuenta", (await verAviso(page) || [""])[0], "🪞3 partidas sin revisar en «Tus propios errores» (1 de Lichess, 2 de la Academia)");
    igual("y a Lichess no se le volvió a preguntar (una vez cada 6 horas)", pedidos, 1);
    sinErrores(errores, "hub con partidas sin revisar");
    await ctx.close();
  }
  {
    // Sin usuario guardado no se le pregunta a nadie de afuera.
    let pedidos = 0;
    const { page, ctx } = await abrir(browser, "/entreno/index.html", { game_rooms: [], practice_games: [] }, {},
      async (c) => { await c.route("https://lichess.org/**", (r) => { pedidos++; r.abort(); }); await c.route("https://api.chess.com/**", (r) => { pedidos++; r.abort(); }); });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForTimeout(1500);
    igual("sin usuario guardado, ni Lichess ni Chess.com reciben nada", pedidos, 0);
    igual("y sin partidas nuevas no hay aviso", await page.evaluate(() => [...document.querySelectorAll("#hoy-lista a")].some((a) => /sin revisar/.test(a.textContent))), "false");
    await ctx.close();
  }
  /* La semana del plan. El diagnóstico se guarda como lo deja
     entreno/diagnostico.html ({ fecha, detalle: { areas, fecha } }), y lo
     esperado se lee de PlanEntrenamiento, no se escribe a mano. */
  {
    const g = { window: {} };
    new Function("window", require("fs").readFileSync(require("path").join(__dirname, "..", "js", "plan-entrenamiento.js"), "utf8"))(g.window);
    const PE = g.window.PlanEntrenamiento;
    const areas = {};
    PE.AREAS.forEach((a) => { areas[a.id] = { peso: 100, logrado: a.id === "tactica" ? 20 : 95, aciertos: 0, total: 7, nosabe: 0 }; });
    const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
    const guardado = (fecha) => JSON.stringify({ fecha, detalle: { fecha, areas, perfil: {} } });
    const plan = PE.generarPlan(PE.resumir({ fecha: hace(2), areas, perfil: {} }));
    const recurso = PE.recursoPrincipal(plan.semanas[0]);

    let { page, ctx, errores } = await abrir(browser, "/entreno/index.html",
      { "rpc:avance_del_plan": [{ clave: PE.claveDeAvance(recurso.href), hechos: 3 }] },
      Object.assign({}, local, { diagnostico_resultado_v1: guardado(hace(2)) }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    let items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
    igual("el plan va primero, con su semana, a dónde ir y cuánto lleva", items[0],
      [`📅Tu plan, semana 1 de ${plan.semanas.length} · Táctica: ${recurso.texto} (✓ 3 hechos)`, "../" + recurso.href]);
    igual("y sigue sin pasar de tres cosas", items.length, "3");
    sinErrores(errores, "hub con plan");
    await ctx.close();

    // La última semana manda a repetir el diagnóstico: sin «✓ 1 hecho», que
    // contaría el mismo diagnóstico del que salió el plan.
    const ultima = plan.semanas.length;
    ({ page, ctx } = await abrir(browser, "/entreno/index.html",
      { "rpc:avance_del_plan": [{ clave: "actividad:diagnostico", hechos: 1 }] },
      { diagnostico_resultado_v1: guardado(hace(7 * (ultima - 1) + 1)) }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => a.textContent.replace("→", "").trim()));
    igual("la última semana pide repetir el diagnóstico, sin contar el que ya hizo",
      items[0], `📅Tu plan, semana ${ultima} de ${ultima} · Juntar todo y volver a medir: Repetir el diagnóstico`);
    await ctx.close();

    // El plan que compartió el profesor manda sobre el recalculado.
    ({ page, ctx } = await abrir(browser, "/entreno/index.html",
      { training_plans: [{ student_id: "u-ana", shared: true, nota: "", plan: { diagnostico_fecha: hace(2), generado: { semanas: [
        { titulo: "Semana 1 · 👑 Mates", recursos: [{ texto: "Mates en uno", href: "entreno/mates.html?cat=mate1" }] }] } } }] },
      { diagnostico_resultado_v1: guardado(hace(2)) }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
    igual("con el plan del profe, sale el suyo", items[0],
      ["📅Tu plan, semana 1 de 1 · Mates: Mates en uno (todavía nada)", "../entreno/mates.html?cat=mate1"]);
    await ctx.close();

    /* El primer paso, en la misma página del diagnóstico: lo que toca hoy,
       arriba de todo y con un botón directo (el mismo hoyDelPlan que el hub),
       y la meta del día de Logros. */
    ({ page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html",
      { "rpc:progreso_dias_y_racha": [{ hoy_ejercicios: 1, racha_actual: 0 }] },
      { diagnostico_resultado_v1: guardado(hace(0)) }));
    await page.waitForFunction(() => { const b = document.getElementById("ver-previo-btn"); return b && b.checkVisibility(); }, null, { timeout: 20000 });
    await page.click("#ver-previo-btn");
    await page.waitForFunction(() => !document.getElementById("result-primer-paso").hidden, null, { timeout: 10000 });
    const paso = await page.evaluate(() => ({
      titulo: document.getElementById("primer-paso-titulo").textContent,
      texto: document.getElementById("primer-paso-texto").textContent,
      meta: document.getElementById("primer-paso-meta").textContent,
      ir: [document.getElementById("primer-paso-ir").textContent, document.getElementById("primer-paso-ir").getAttribute("href")],
      primero: document.querySelector("#result-view > div:not([hidden]):not(.hidden)").id || "sin id",
    }));
    igual("al terminar el diagnóstico, el primer paso es hoy", paso.titulo, "Tu primer paso: hoy mismo");
    igual("dice qué y cuánto", paso.texto,
      `La semana 1 de tu plan es Táctica. Empieza ya con «${recurso.texto}»: 5 ejercicios hoy y el día cuenta para tu racha.`);
    igual("con la meta del día de Logros", paso.meta, "Hoy llevas 1 de 5.");
    igual("y un botón directo al ejercicio", paso.ir, ["Empezar ahora →", "../" + recurso.href]);
    sinErrores(errores, "diagnóstico con primer paso");
    await ctx.close();

    // Ya en la semana 2, y con trabajo hecho, dice cómo va en vez de «primer paso».
    ({ page, ctx } = await abrir(browser, "/entreno/diagnostico.html",
      { "rpc:avance_del_plan": [{ clave: PE.claveDeAvance(PE.recursoPrincipal(plan.semanas[1]).href), hechos: 4 }] },
      { diagnostico_resultado_v1: guardado(hace(8)) }));
    await page.waitForFunction(() => { const b = document.getElementById("ver-previo-btn"); return b && b.checkVisibility(); }, null, { timeout: 20000 });
    await page.click("#ver-previo-btn");
    await page.waitForFunction(() => !document.getElementById("result-primer-paso").hidden, null, { timeout: 10000 });
    igual("en la semana 2, lo que toca y cuánto lleva",
      await page.evaluate(() => [document.getElementById("primer-paso-titulo").textContent, document.getElementById("primer-paso-ir").textContent]),
      [`Esta semana te toca: ${plan.semanas[1].titulo.split(" · ").slice(1).join(" · ").replace(/^[^\p{L}\p{N}]+/u, "")}`, "Seguir →"]);
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/entreno/index.html", {}, { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForTimeout(500);
    /* Cambió a propósito: sin nada pendiente, el bloque ya no se calla. Queda
       la meta del día, que cambia de un día a otro y dice qué hacer. */
    igual("sin nada pendiente, el bloque trae solo la meta del día",
      await page.evaluate(() => [document.getElementById("hoy").checkVisibility(), document.getElementById("hoy-lista").checkVisibility(),
        document.getElementById("hoy-meta-texto").textContent]),
      [true, false, "Hoy llevas 0 de 5 ejercicios para que el día cuente. Con eso empiezas una racha."]);
    await ctx.close();
  }
  /* El tipo de entrenamiento más flojo (js/tipo-flojo.js): igual que el tema,
     por debajo del 70 % y solo el del alumno de la sesión. */
  {
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) };
    const flojo = (pct) => ({ "rpc:informes_tipo_mas_flojo": [
      { student_id: "otra", tipo: "detective", intentos: 9, limpios: 1, porcentaje: 11 },
      { student_id: "u-ana", tipo: "balanza", intentos: 8, limpios: Math.round(8 * pct / 100), porcentaje: pct }] });
    const ver = async (pct) => {
      const { page, ctx, errores } = await abrir(browser, "/entreno/index.html", flojo(pct), fresco);
      await page.waitForFunction(() => { const l = document.getElementById("hoy-lista"); return l.hidden || l.querySelector("a"); }, { timeout: 20000 });
      const items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
      sinErrores(errores, "hub con tipo flojo");
      await ctx.close();
      return items;
    };
    igual("propone el tipo más flojo del alumno, con el nombre del catálogo y a su ficha", await ver(38),
      [["📉Tu tipo de entrenamiento más flojo, «La balanza»: tres estrellas en 3 de 8", "tipos.html#balanza"]]);
    igual("con 75 % no lo propone", await ver(75), []);
  }
  /* El tema más flojo (js/tema-flojo.js): lo propone si está por debajo del 70 %,
     y solo el del alumno de la sesión (la base puede devolver más filas). */
  {
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) };
    const flojo = (pct) => ({ "rpc:informes_tema_mas_flojo": [
      { student_id: "otra", tema: "fork", intentos: 9, limpios: 1, porcentaje: 11 },
      { student_id: "u-ana", tema: "pin", intentos: 11, limpios: Math.round(11 * pct / 100), porcentaje: pct }] });
    let { page, ctx, errores } = await abrir(browser, "/entreno/index.html", flojo(36), fresco);
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    const items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
    igual("propone el tema más flojo del alumno, con su nombre y a dónde ir", items,
      [["🎯Tu tema más flojo, «Clavada»: limpio en 4 de 11", "temas.html?tema=pin"]]);
    sinErrores(errores, "hub con tema flojo");
    await ctx.close();
    ({ page, ctx } = await abrir(browser, "/entreno/index.html", flojo(80), fresco));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForTimeout(600);
    igual("con 80 % limpio no lo propone", await page.evaluate(() => document.querySelectorAll("#hoy-lista a").length), "0");
    await ctx.close();
  }
  /* Los repasos de Visualización y de Practicar también se proponen. */
  {
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) };
    const ficha = (vence) => ({ facilidad: 2.5, intervalo: 1, repasos: 1, fallos: 0, vence, ultimo: "2026-01-01T00:00:00Z" });
    const { page, ctx } = await abrir(browser, "/entreno/index.html", {}, Object.assign({}, fresco, {
      entreno_visualizacion_repaso_v1: JSON.stringify({ a: ficha(hoy()), b: ficha(hoy()) }),
      entreno_practicas_repaso_v1: JSON.stringify({ "pasillo:0": ficha(hoy()) }),
    }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    igual("propone los repasos de Visualización y de Practicar, con a dónde ir", await page.evaluate(() =>
      Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")])),
      [["👁️Repasar 2 ejercicios de Visualización que te costaron", "visualizacion.html?repaso=1"], ["♞Repasar 1 posición de Practicar que te costó", "practicas.html?repaso=1"]]);
    await ctx.close();
  }
  /* Y los de Tipos y de Finales. */
  {
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) };
    const ficha = (vence) => ({ facilidad: 2.5, intervalo: 1, repasos: 1, fallos: 0, vence, ultimo: "2026-01-01T00:00:00Z" });
    const { page, ctx } = await abrir(browser, "/entreno/index.html", {}, Object.assign({}, fresco, {
      entreno_tipos_repaso_v1: JSON.stringify({ "detective:a": ficha(hoy()), "amenaza:b": ficha(hoy()) }),
      entreno_finales_repaso_v1: JSON.stringify({ lucena: ficha(hoy()) }),
    }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    igual("propone los repasos de Tipos y de Finales, con a dónde ir", await page.evaluate(() =>
      Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")])),
      [["🧩Repasar 2 ejercicios de Tipos que te costaron", "tipos.html#repaso"], ["🏁Volver a jugar 1 final que te costó", "finales.html?repaso=1"]]);
    await ctx.close();
  }
  /* Lo empezado que no vence: los finales contra la máquina a medias y una
     tanda de Precisión si la última fue hace una semana o más. */
  {
    const fs = require("fs"), path = require("path");
    const banco = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "entreno", "data", "finales.json"), "utf8")).finales;
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) };
    const historial = (dias) => [{ student_id: "u-ana", key: "precision_posicional_historial_v1",
      value: { raw: JSON.stringify([{ fecha: new Date(Date.now() - dias * 86400000 - 3600000).toISOString(), porcentaje: 60 }]) } }];
    const hoyTe = async (tablas, local) => {
      const { page, ctx, errores } = await abrir(browser, "/entreno/index.html", tablas, Object.assign({}, fresco, local));
      await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      // La lista ya se pintó cuando tiene enlaces o quedó `hidden` (vacía): al
      // abrir no lleva el atributo. Si no, «no propone nada» pasaría solo por
      // mirar antes de tiempo.
      await page.waitForFunction(() => { const l = document.getElementById("hoy-lista"); return l.hidden || l.querySelector("a"); }, { timeout: 10000 });
      const items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
      sinErrores(errores, "hub");
      await ctx.close();
      return items;
    };
    igual("con un final logrado, propone seguir con el primero sin lograr, con cuántos lleva",
      await hoyTe({}, { entreno_finales_solved: JSON.stringify({ [banco[0].id]: true }) }),
      [[`🏁Seguir con los finales contra la máquina: «${banco[1].titulo}» (1 de ${banco.length} logrados)`, "finales.html?final=" + banco[1].id]]);
    igual("a quien nunca jugó un final no se lo propone", await hoyTe({}, {}), []);
    igual("con todos logrados, tampoco", await hoyTe({}, { entreno_finales_solved: JSON.stringify(Object.fromEntries(banco.map((f) => [f.id, true]))) }), []);
    igual("la última tanda de Precisión fue hace 10 días: la propone",
      await hoyTe({ training_state: historial(10) }, {}), [["🧭Una tanda de Precisión posicional: la última fue hace 10 días", "precision-posicional.html"]]);
    igual("hace 3 días: todavía no", await hoyTe({ training_state: historial(3) }, {}), []);
  }
  /* El resumen del día, debajo de la meta: lo de hoy por actividad, cuántos
     limpios y los repasos de mañana. */
  {
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) };
    const dia = (n) => { const d = new Date(Date.now() + n * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    const ficha = (vence) => ({ facilidad: 2.5, intervalo: 1, repasos: 1, fallos: 0, vence, ultimo: "2026-01-01T00:00:00Z" });
    const local = Object.assign({}, fresco, {
      // Mañana tocan dos: el que vence mañana y el de hoy (si no se hace); el de pasado mañana y el que ya salió, no.
      entreno_mates_repaso_v1: JSON.stringify({ a: ficha(dia(1)), b: ficha(dia(2)), c: Object.assign(ficha(dia(1)), { fuera: true }) }),
      entreno_tipos_repaso_v1: JSON.stringify({ "detective:x": ficha(dia(0)) }),
    });
    const resumen = async (tablas) => {
      const { page, ctx, errores } = await abrir(browser, "/entreno/index.html", tablas, local);
      await page.waitForFunction(() => { const l = document.getElementById("hoy-lista"); return l.hidden || l.querySelector("a"); }, { timeout: 10000 });
      const r = await page.evaluate(() => { const p = document.getElementById("hoy-resumen"); return p.checkVisibility() ? p.textContent : null; });
      sinErrores(errores, "hub (resumen)");
      await ctx.close();
      return r;
    };
    igual("con algo hecho hoy, el resumen dice qué, cuántos limpios y los repasos de mañana",
      await resumen({ "rpc:progreso_dias_y_racha": [{ hoy_ejercicios: 3, racha_actual: 2 }],
        "rpc:entreno_resumen_hoy": { total: 3, por_actividad: { memoria: 1, mates: 2 }, con_como_salio: 2, limpios: 1 } }),
      "Hoy: Mates 2, Memoria 1 · 1 de 2 sin error ni pista · Para mañana: 2 repasos.");
    igual("sin nada hecho hoy, no hay resumen",
      await resumen({ "rpc:progreso_dias_y_racha": [{ hoy_ejercicios: 0, racha_actual: 2 }],
        "rpc:entreno_resumen_hoy": { total: 0, por_actividad: {}, con_como_salio: 0, limpios: 0 } }), null);
  }
  /* En el celular, lo que toca hacer hoy va antes que el botón de avisos:
     arriba, lo empujaba fuera de la pantalla. Se mide en la pantalla. */
  {
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }),
      entreno_mates_repaso_v1: JSON.stringify({ a: { facilidad: 2.5, intervalo: 1, repasos: 1, fallos: 0, vence: "2026-01-01", ultimo: "2026-01-01T00:00:00Z" } }) };
    const { page, ctx, errores } = await abrir(browser, "/entreno/index.html",
      { "rpc:progreso_dias_y_racha": [{ hoy_ejercicios: 7, racha_actual: 5 }] }, fresco);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector("#hoy-lista a") && !document.getElementById("hoy-avisos").hidden, null, { timeout: 10000 });
    const m = await page.evaluate(() => {
      const lista = document.querySelector("#hoy-lista a").getBoundingClientRect();
      const avisos = document.getElementById("hoy-avisos").getBoundingClientRect();
      return { lista: lista.top, avisos: avisos.top, ancho: document.documentElement.scrollWidth };
    });
    igual("en el celular, la lista de hoy va antes que el botón de avisos", String(m.lista < m.avisos), "true");
    igual("y no hay desplazamiento de lado", String(m.ancho <= 390), "true");
    sinErrores(errores, "hub (celular)");
    await ctx.close();
  }
  /* Tu semana: los últimos 7 días contra los 7 anteriores. */
  {
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) };
    const semana = async (s) => {
      const { page, ctx, errores } = await abrir(browser, "/entreno/index.html",
        { "rpc:progreso_dias_y_racha": [{ hoy_ejercicios: 0, racha_actual: 0 }], "rpc:entreno_mi_semana": s }, fresco);
      await page.waitForFunction(() => { const l = document.getElementById("hoy-lista"); return l.hidden || l.querySelector("a"); }, { timeout: 10000 });
      const r = await page.evaluate(() => { const p = document.getElementById("hoy-semana"); return p.checkVisibility() ? p.textContent : null; });
      sinErrores(errores, "hub (semana)");
      await ctx.close();
      return r;
    };
    igual("compara la semana con la anterior, en ejercicios y en limpios",
      await semana({ esta: 48, esta_con: 40, esta_limpios: 28, anterior: 31, anterior_con: 29, anterior_limpios: 18 }),
      "Esta semana: 48 ejercicios (la anterior, 31) · 70 % sin error ni pista (la anterior, 62 %).");
    igual("si la anterior no entrenó, lo dice",
      await semana({ esta: 1, esta_con: 0, esta_limpios: 0, anterior: 0, anterior_con: 0, anterior_limpios: 0 }),
      "Esta semana: 1 ejercicio (la anterior no entrenaste).");
    igual("sin nada en las dos semanas, no se pinta",
      await semana({ esta: 0, esta_con: 0, esta_limpios: 0, anterior: 0, anterior_con: 0, anterior_limpios: 0 }), null);
  }
  /* El nivel de Tipos que quedó a medias (tipos_ultimo_v1, lo anota la página
     al jugar): se propone seguirlo; uno completo, no. */
  {
    const fresco = { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) };
    const ultimo = (hechos) => Object.assign({}, fresco, { tipos_ultimo_v1: JSON.stringify({ tipo: "detective", nombre: "El Detective", nivel: 2, hechos, total: 20 }) });
    let { page, ctx, errores } = await abrir(browser, "/entreno/index.html", {}, ultimo(7));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    igual("propone seguir el nivel de Tipos a medias, con cuánto lleva", await page.evaluate(() =>
      Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")])),
      [["🧩Seguir con El Detective, nivel 2 (7 de 20)", "tipos.html#detective/2"]]);
    sinErrores(errores, "hub con Tipos a medias");
    await ctx.close();
    ({ page, ctx } = await abrir(browser, "/entreno/index.html", {}, ultimo(20)));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForTimeout(600);
    igual("un nivel completo no se propone", await page.evaluate(() => document.querySelectorAll("#hoy-lista a").length), "0");
    await ctx.close();
  }
  /* La meta del día sale de progreso_dias_y_racha, la misma cuenta de Logros. */
  {
    const racha = (hoy, actual) => ({ "rpc:progreso_dias_y_racha": [{ dias_activos: 9, racha_actual: actual, racha_record: 7,
      total_ejercicios: 120, tipos_distintos: 4, hoy_ejercicios: hoy, primer_dia: "2026-09-01", por_actividad: {} }] });
    let { page, ctx } = await abrir(browser, "/entreno/index.html", racha(3, 4), {});
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => !document.getElementById("hoy-meta").hidden, null, { timeout: 10000 });
    igual("a mitad del día: cuántos lleva, cuántos faltan y la racha",
      await page.evaluate(() => document.getElementById("hoy-meta-texto").textContent),
      "Hoy llevas 3 de 5 ejercicios para que el día cuente. Tu racha: 4 días 🔥 — no la cortes.");
    igual("la barra lo dice también para el lector de pantalla",
      await page.evaluate(() => { const b = document.getElementById("hoy-meta-barra"); return [b.getAttribute("aria-valuenow"), b.getAttribute("aria-valuemax")]; }), ["3", "5"]);
    await ctx.close();
    ({ page, ctx } = await abrir(browser, "/entreno/index.html", racha(7, 5), {}));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => !document.getElementById("hoy-meta").hidden, null, { timeout: 10000 });
    igual("con la meta cumplida, lo celebra con la racha",
      await page.evaluate(() => document.getElementById("hoy-meta-texto").textContent),
      "✅ Hoy ya cuenta para tu racha: 7 ejercicios. Llevas 5 días seguidos 🔥");
    await ctx.close();
  }
}

async function visualizacion(browser) {
  console.log("\n=== Visualización: la misma cola ===");
  const C = "entreno_visualizacion_repaso_v1";
  const { page, ctx, errores } = await abrir(browser, "/entreno/visualizacion.html");
  await page.waitForFunction(() => typeof NIVELES !== "undefined" && DATA && typeof openLevel === "function", { timeout: 20000 });
  await page.evaluate(() => openLevel(NIVELES[0].id));
  await page.waitForFunction(() => game !== null && currentId() !== undefined, { timeout: 15000 });
  const fallado = await page.evaluate(() => { const id = currentId(); missedThisPuzzle = true; finishPuzzle(); return id; });
  igual("con un error entra a la cola, para hoy", await page.evaluate(([k, id]) => (JSON.parse(localStorage.getItem(k) || "{}")[id] || {}).vence, [C, fallado]), hoy());
  await page.waitForFunction(() => !locked, { timeout: 5000 });
  await page.evaluate(() => showLevels());
  igual("la lista de niveles ofrece el repaso", await page.evaluate(() => [document.getElementById("repaso-caja").checkVisibility(), document.getElementById("repaso-texto").textContent]),
    [true, "Hoy toca repasar 1 ejercicio que te costó (lo resolviste con un error o con una pista)."]);
  await page.click("#repaso-btn");
  igual("el repaso trae el que costó", await page.evaluate(() => [currentLevel, currentId(), document.getElementById("play-title").textContent]), ["__repaso", fallado, "Repasar fallados — lo que te costó"]);
  const antes = await inserts(page);
  await page.evaluate(() => { missedThisPuzzle = false; usedHintThisPuzzle = false; finishPuzzle(); });
  igual("repasado limpio, vuelve más adelante", await page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k))[id].vence, [C, fallado]) > hoy(), "true");
  igual("y ahora sí cuenta como resuelto (con error no había contado)", [await page.evaluate((id) => isSolved(id), fallado), (await inserts(page)) - antes], [true, 1]);
  await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), { timeout: 5000 });
  igual("al terminar, «¡Repaso terminado!» y sin «volver a empezar»", await page.evaluate(() =>
    [document.getElementById("celebration-title").textContent, document.getElementById("celebration-replay-btn").checkVisibility()]), ["¡Repaso terminado!", false]);
  sinErrores(errores, "visualización");
  await ctx.close();
}

async function practicar(browser) {
  console.log("\n=== Practicar: la cola por ronda ===");
  const C = "entreno_practicas_repaso_v1";
  const { page, ctx, errores } = await abrir(browser, "/entreno/practicas.html");
  await page.waitForFunction(() => typeof SETS !== "undefined" && document.getElementById("set-list").children.length > 0, { timeout: 20000 });
  // La primera ronda del descubierto, con un error: entra como "descubierto:0".
  await page.evaluate(() => { openSet(SETS.find((x) => x.id === "descubierto")); errorsThisRound = 1; finishRound(false); });
  igual("una ronda con error entra a la cola, con su serie y su número", await page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) || "{}")), C), ["descubierto:0"]);
  await page.evaluate(() => showList());
  igual("la lista de series ofrece el repaso", await page.evaluate(() => [document.getElementById("repaso-caja").checkVisibility(), document.getElementById("repaso-texto").textContent]),
    [true, "Hoy toca repasar 1 posición que te costó (la resolviste con un error o con una pista)."]);
  await page.click("#repaso-btn");
  igual("el repaso es una serie con esa ronda", await page.evaluate(() => [currentSet.id, currentSet.rounds.length, currentSet.rounds[0]._rid, game.fen() === SETS.find((x) => x.id === "descubierto").rounds[0].fen]),
    ["__repaso", 1, "descubierto:0", true]);
  // En el repaso vale el motivo de su serie: otro salto que descubre el jaque.
  await page.click('#board [data-square="c3"]'); await page.click('#board [data-square="e4"]');
  igual("otra jugada que cumple el motivo de su serie también vale en el repaso", await page.evaluate(() => /¡Correcto!/.test(document.getElementById("round-status").textContent)), "true");
  igual("repasada limpia, vuelve más adelante", await page.evaluate((k) => JSON.parse(localStorage.getItem(k))["descubierto:0"].vence, C) > hoy(), "true");
  await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), { timeout: 5000 });
  igual("al terminar, «¡Repaso terminado!», sin «siguiente serie» ni estrellas guardadas", await page.evaluate(() =>
    [document.getElementById("celebration-title").textContent, document.getElementById("celebration-next-btn").checkVisibility(), getSetStars("__repaso"),
     window.__inserts.some((i) => i.tabla === "training_progress" && JSON.stringify(i.rows).includes("__repaso"))]),
    ["¡Repaso terminado!", false, 0, false]);
  sinErrores(errores, "practicar");
  await ctx.close();
}

async function tipos(browser) {
  console.log("\n=== Tipos de entrenamiento: la misma cola, de todos los tipos ===");
  const C = "entreno_tipos_repaso_v1";
  const { page, ctx, errores } = await abrir(browser, "/entreno/tipos.html");
  await page.waitForSelector("#fichas li", { timeout: 20000 });
  igual("sin nada que repasar, la portada no ofrece el repaso", await page.evaluate(() => document.getElementById("repaso-tipos").checkVisibility()), false);
  // Se juega el primero de Detective, nivel 1, y sale con una estrella.
  await page.evaluate(() => { location.hash = "#detective/1"; });
  await page.waitForSelector("#vista-juego:not(.hidden) #controles input[type=radio]", { timeout: 15000 });
  const det = await page.evaluate(() => TiposEntreno.datos().detective.filter((x) => x.nivel === 1));
  await page.evaluate((it) => TiposUI.terminar(it, 1), det[0]);
  // Y el segundo, con tres: limpio a la primera, no entra.
  await page.evaluate(() => document.getElementById("btn-siguiente").click());
  await page.waitForFunction(() => /Ejercicio 2 de/.test(document.getElementById("juego-progreso").textContent), null, { timeout: 8000 });
  await page.evaluate((it) => TiposUI.terminar(it, 3), det[1]);
  igual("con una estrella entra a la cola, para hoy, como «tipo:id»; con tres no",
    await page.evaluate((k) => { const o = JSON.parse(localStorage.getItem(k) || "{}"); return Object.keys(o).map((id) => [id, o[id].vence, o[id].tipo]); }, C),
    [["detective:" + det[0].id, hoy(), "detective"]]);
  const reg = () => page.evaluate(() => window.__inserts.filter((i) => i.tabla === "training_progress").map((i) => [].concat(i.rows)[0].detail).map((d) => [d.puzzle_id, d.estrellas, d.limpio]));
  igual("y se registra con `limpio` (tres estrellas) la primera vez que se resuelve", await reg(),
    [["detective:" + det[0].id, 1, false], ["detective:" + det[1].id, 3, true]]);
  await page.evaluate(() => { location.hash = "#"; });
  await page.waitForSelector("#vista-fichas:not(.hidden)", { timeout: 8000 });
  igual("la portada ofrece el repaso, con cuántos y a dónde lleva", await page.evaluate(() => {
    const c = document.getElementById("repaso-tipos");
    return [c.checkVisibility(), c.querySelector("p").textContent, c.querySelector("a").getAttribute("href")];
  }), [true, "🔁 Hoy toca repasar 1 ejercicio que te costó", "#repaso"]);
  // Lo que el hub propone seguir (otro tipo): el repaso no lo tiene que pisar.
  await page.evaluate(() => localStorage.setItem("tipos_ultimo_v1", JSON.stringify({ tipo: "amenaza", nombre: "La amenaza", nivel: 2, hechos: 1, total: 10 })));
  await page.click("#repaso-tipos a");
  await page.waitForSelector("#vista-juego:not(.hidden) #controles input[type=radio]", { timeout: 15000 });
  igual("el repaso trae ese ejercicio, con el juego de su tipo", await page.evaluate(() =>
    [document.getElementById("titulo-juego").textContent, document.getElementById("juego-progreso").textContent, document.getElementById("btn-siguiente").textContent]),
    ["🔁 Repasar fallados", "Repaso · El Detective · Ejercicio 1 de 1 · tu mejor: ★☆☆", "Terminar el repaso"]);
  const antes = (await reg()).length;
  await page.evaluate((it) => TiposUI.terminar(it, 3), det[0]);
  igual("repasado limpio, vuelve más adelante", await page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k))[id].vence, [C, "detective:" + det[0].id]) > hoy(), "true");
  igual("y repasar no lo vuelve a registrar (ya contó)", (await reg()).length - antes, "0");
  igual("el repaso no pasa a ser «el nivel que quedó a medias» del hub", await page.evaluate(() => JSON.parse(localStorage.getItem("tipos_ultimo_v1")).tipo), "amenaza");
  await page.evaluate(() => document.getElementById("btn-siguiente").click());
  await page.waitForSelector("#vista-fichas:not(.hidden)", { timeout: 8000 });
  igual("al terminar vuelve a la portada, que ya no ofrece el repaso", await page.evaluate(() => document.getElementById("repaso-tipos").checkVisibility()), false);
  sinErrores(errores, "tipos");
  await ctx.close();
}

async function finales(browser) {
  console.log("\n=== Finales contra la máquina: la misma cola ===");
  const C = "entreno_finales_repaso_v1";
  let { page, ctx, errores } = await abrir(browser, "/entreno/finales.html");
  await page.waitForFunction(() => typeof FINALES !== "undefined" && FINALES.length > 1 && document.getElementById("tabs").children.length > 1, { timeout: 20000 });
  const [f0, f1] = await page.evaluate(() => [FINALES[0].id, FINALES[1].id]);
  // Se pierde el SEGUNDO: así ?repaso=1 no puede acertar por casualidad (el
  // primero sin lograr sería el primero).
  await page.evaluate(() => { actual = 1; loadFinal(); fallado("Te dieron mate."); });
  igual("un final perdido entra a la cola, para hoy", await page.evaluate(([k, id]) => (JSON.parse(localStorage.getItem(k) || "{}")[id] || {}).vence, [C, f1]), hoy());
  igual("y no cuenta como logrado", await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "training_progress").length), "0");
  await page.evaluate(() => { actual = 0; loadFinal(); logrado("¡Jaque mate!"); });
  igual("uno logrado limpio a la primera no entra", await page.evaluate(([k, id]) => id in JSON.parse(localStorage.getItem(k) || "{}"), [C, f0]), false);
  igual("la pestaña del que toca repasar lo dice, escrito", await page.evaluate(() => {
    const b = document.querySelectorAll("#tabs button")[1];
    return [/🔁$/.test(b.textContent), /toca repasarlo hoy$/.test(b.getAttribute("aria-label")), document.getElementById("progress-label").textContent];
  }), [true, true, "1 de " + (await page.evaluate(() => FINALES.length)) + " finales logrados · 1 para repasar hoy (🔁)"]);
  sinErrores(errores, "finales");
  const guardado = await page.evaluate((k) => localStorage.getItem(k), C);
  await ctx.close();
  // ?repaso=1 (el enlace del hub) abre el que toca, aunque haya otro sin lograr antes.
  ({ page, ctx, errores } = await abrir(browser, "/entreno/finales.html?repaso=1", {}, { [C]: guardado }));
  await page.waitForFunction(() => typeof FINALES !== "undefined" && FINALES.length > 1 && document.getElementById("final-titulo").textContent, { timeout: 20000 });
  igual("?repaso=1 abre el final que toca repasar (no el primero sin lograr)", await page.evaluate(() => finalActual().id), f1);
  await page.evaluate(() => { usedHint = true; logrado("¡Jaque mate!"); });
  igual("logrado con pista sigue en la cola, pero para pronto", await page.evaluate(([k, id]) => { const f = JSON.parse(localStorage.getItem(k))[id]; return [f.fuera, f.limpiosSeguidos]; }, [C, f1]), [false, 0]);
  sinErrores(errores, "finales ?repaso=1");
  await ctx.close();
}

/* `limpio` en Practicar (por serie) y en 4×4 (sin trabarse ni reiniciar). */
async function limpios(browser) {
  console.log("\n=== Cómo salió: Practicar y 4×4 ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/practicas.html");
    await page.waitForFunction(() => typeof SETS !== "undefined" && document.getElementById("set-list").children.length > 0, { timeout: 20000 });
    const n = await page.evaluate(() => {
      const set = SETS.find((x) => x.rounds.length >= 2);
      openSet(set);
      // Todas limpias menos la primera, con una pista.
      setStarsEarned = set.rounds.map((r, i) => (i === 0 ? 2 : 3));
      finishSet();
      return set.rounds.length;
    });
    igual("la serie se registra con cuántas posiciones salieron limpias, y si fue toda", await page.evaluate(() => {
      const d = [].concat(window.__inserts.filter((i) => i.tabla === "training_progress").pop().rows)[0].detail;
      return [d.rondas, d.rondas_limpias, d.limpio];
    }), [n, n - 1, false]);
    sinErrores(errores, "practicar (limpio)");
    await ctx.close();
  }
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/4x4.html");
    await page.waitForFunction(() => typeof boardExList !== "undefined" && boardExList.length > 1 && Object.keys(boardState).length > 1, { timeout: 20000 });
    const ultimo = () => page.evaluate(() => { const d = [].concat(window.__inserts.filter((i) => i.tabla === "training_progress").pop().rows)[0].detail; return [d.limpio, d.con_error]; });
    // Resuelto sin tropiezos (se deja una sola pieza y se revisa).
    await page.evaluate(() => { const k = Object.keys(boardState)[0]; boardState = { [k]: boardState[k] }; checkWin(); });
    igual("resuelto sin trabarse: limpio", await ultimo(), [true, false]);
    // Otro, reiniciado a medio camino.
    await page.evaluate(() => { document.getElementById("win-overlay").classList.remove("open"); loadPuzzleAt(1); captureLog.push({}); });
    await page.click("#board-reset");
    await page.evaluate(() => { const k = Object.keys(boardState)[0]; boardState = { [k]: boardState[k] }; checkWin(); });
    igual("reiniciado a medio camino: no limpio", await ultimo(), [false, true]);
    // «Reintentar» después de ganarlo es un intento nuevo.
    await page.click("#win-retry");
    await page.evaluate(() => { const k = Object.keys(boardState)[0]; boardState = { [k]: boardState[k] }; checkWin(); });
    igual("volver a empezarlo después de ganarlo es un intento nuevo, limpio otra vez", await ultimo(), [true, false]);
    sinErrores(errores, "4×4 (limpio)");
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await temas(browser);
    await mates(browser);
    await visualizacion(browser);
    await practicar(browser);
    await tipos(browser);
    await finales(browser);
    await limpios(browser);
    await hub(browser);
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
