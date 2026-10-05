/* Comprueba «Mi libreta de torneos» (libreta-torneos.html, js/libreta-torneos.js).
   Ver «Mi libreta de torneos» en docs/decisiones/entrenamiento.md.

   Sin navegador:
   - La migración del aviso: avisar_partida_torneo() marca la partida antes de
     avisar, solo la de su dueño y una sola vez, y no se le puede ejecutar a
     `anon`; el permiso de corregir es por columna (ronda, evento, comentarios).

   Con navegador y el doble de Supabase de Entrenamiento (sesión u-ana):
   - La alumna ve SU libreta: por torneo (el más reciente arriba), las rondas
     en orden, sus puntos, cómo cambió su Elo FIDE y Nacional, lo que encontró
     el motor; nada de otra persona; lo que escribió (el torneo) va como texto.
   - Comenta una jugada: se guarda solo `comentarios`, la UNIÓN con lo que ya
     había, de ESA partida; se ve en la lista y en la nota del tablero, junto a
     lo que dijo el motor.
   - Su profesor, con ?alumno=: el título con el nombre, sin formulario para
     comentar, y «Llevar sus errores a un plan de clase» arma el plan con la
     posición del error.
   - Su profesor, sin ?alumno=: la lista de las últimas de sus alumnos, que
     lleva a la libreta de cada uno en esa partida.
   - Al imprimir no salen los botones ni el tablero.

   Uso:  npm install; node herramientas/verificar-todo.js libreta-torneos   */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir } = require("./lib/doble-entreno");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const cierto = (nombre, v, detalle) => igual(nombre + (detalle ? " (" + detalle + ")" : ""), !!v, true);

function estatico() {
  console.log("\n=== La base: el aviso y el permiso de corregir ===");
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const sql = fs.readdirSync(dir).filter((f) => /libreta_de_torneos/.test(f)).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  const aviso = sql.slice(sql.indexOf("function public.avisar_partida_torneo"));
  cierto("marca la partida (solo la suya y sin avisar todavía) ANTES de avisar",
    /where id = p_id and student_id = yo and avisada_at is null/.test(aviso) && aviso.indexOf("avisada_at = now()") < aviso.indexOf("avisar_push"));
  cierto("si no marcó nada (ajena o ya avisada), se va sin avisar", /if not found then return false;/.test(aviso));
  cierto("anon no la ejecuta (se le quita a public y a anon)", /revoke execute on function public\.avisar_partida_torneo\(uuid, integer\) from public, anon;/.test(sql));
  cierto("corregir es solo ronda, evento y comentarios", /grant update \(ronda, evento, comentarios\) on public\.partidas_torneo to authenticated;/.test(sql) && !/grant update on public\.partidas_torneo/.test(sql));
}

const JUGADAS = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+"];
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const ID4 = "44444444-4444-4444-8444-444444444444";
const partida = (o) => Object.assign({ color: "w", resultado: "1-0", rival_elo: null, ronda: null, comentarios: {}, errores: null, jugadas: JUGADAS, created_at: "2026-10-01T12:00:00Z" }, o);
// El error de la partida 1 (ronda 2): en la media jugada 6 jugó Cxe5.
const FEN6 = "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
const ESTADO = [{ key: "errores_propios_v1", value: { raw: JSON.stringify({
  ["torneo-" + ID1 + "-6"]: { id: "torneo-" + ID1 + "-6", fen: FEN6, nivel: 1, jugada: "Nxe5", buenas: ["c3", "O-O"], antes: 20, despues: -300, fecha: "2026-09-13T18:00:00Z", resumen: "Partida de torneo del 13 sept · jugada 4", tema: null },
}) } }];
const TABLAS_ANA = {
  profiles: [{ id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas" }],
  partidas_torneo: [
    partida({ id: ID1, student_id: "u-ana", evento: "Abierto de Heredia", ronda: 2, fecha: "2026-09-13", resultado: "1/2-1/2", errores: 1, comentarios: { "3": "quería atacar f7" } }),
    partida({ id: ID2, student_id: "u-ana", evento: "abierto de heredia ", ronda: 1, fecha: "2026-09-12", color: "b", resultado: "0-1", rival_elo: 1620,
      preparacion: { origen: "propio", rival: "PedroP", lado: "conNegras", hasta: 3, salio: "rival", jugada: "Nf6", ultima: "Nf3", esperadas: ["Nc6"] } }),
    partida({ id: ID3, student_id: "u-ana", evento: "<img src=x onerror=window.__xss=1>", fecha: "2026-10-03", resultado: "0-1" }),
    partida({ id: ID4, student_id: "u-bea", evento: "De Bea", fecha: "2026-10-04" }),
  ],
  elo_historial: [
    { student_id: "u-ana", periodo: "2026-08-01", fide_estandar: 1490, nacional: 1600 },
    { student_id: "u-ana", periodo: "2026-09-01", fide_estandar: 1500, nacional: 1610 },
    { student_id: "u-ana", periodo: "2026-10-01", fide_estandar: 1520, nacional: 1605 },
  ],
  training_state: ESTADO.map((x) => Object.assign({ student_id: "u-ana" }, x)),
};

async function laAlumna(browser) {
  console.log("\n=== La alumna: su libreta ===");
  const { page, ctx, errores } = await abrir(browser, "/libreta-torneos.html", TABLAS_ANA);
  await page.waitForFunction(() => !document.getElementById("app").hidden && !document.getElementById("app").classList.contains("hidden"), null, { timeout: 15000 });
  const v = await page.evaluate(() => ({
    titulo: document.getElementById("titulo").textContent,
    torneos: [...document.querySelectorAll("#torneos > section > h2")].map((h) => h.textContent),
    puntos: [...document.querySelectorAll("[data-puntos]")].map((p) => p.textContent),
    elo: [...document.querySelectorAll("[data-elo]")].map((p) => p.textContent),
    heredia: [...document.querySelectorAll("#torneos > section")].find((s) => /Heredia/.test(s.querySelector("h2").textContent)),
    texto: document.getElementById("torneos").textContent,
    xss: window.__xss || 0, img: !!document.querySelector("#torneos img"),
  }));
  igual("el título", v.titulo, "📒 Mi libreta de torneos");
  igual("por torneo, el más reciente arriba; el mismo torneo escrito distinto va junto", v.torneos, ["<img src=x onerror=window.__xss=1>", "Abierto de Heredia"]);
  igual("lo que escribió va como texto", [v.xss, v.img], [0, false]);
  igual("sus puntos en cada torneo", v.puntos, ["Hiciste 0 de 1 punto (0 ganadas, 0 tablas, 1 perdida).", "Hiciste 1½ de 2 puntos (1 ganada, 1 tablas, 0 perdidas)."]);
  igual("cómo cambió su Elo con el torneo de septiembre", v.elo, ["Elo FIDE: 1500 → 1520 (+20) · Elo Nacional: 1610 → 1605 (−5)."]);
  const rondas = await page.evaluate(() => [...document.querySelectorAll("#torneos > section")][1].querySelectorAll("li[id^=partida-] > p:first-child").length
    && [...[...document.querySelectorAll("#torneos > section")][1].querySelectorAll("li[id^=partida-] > p:first-child")].map((p) => p.textContent));
  igual("las rondas en orden, con color, resultado, Elo del rival y jugadas", rondas,
    ["Ronda 1 · 12 sept 2026 · con negras · ganaste · rival de 1620 Elo · 6 jugadas", "Ronda 2 · 13 sept 2026 · con blancas · tablas · 6 jugadas"]);
  cierto("nada de la partida de otra persona", !/De Bea/.test(v.texto));
  igual("lo que encontró el motor", await page.textContent("#partida-" + ID1 + " > p:nth-child(2)"), "El motor encontró 1 error.");
  igual("cómo le fue con lo que había preparado", await page.textContent("#partida-" + ID2 + " [data-preparacion]"),
    "🎯 La partida siguió tu preparación contra PedroP hasta 2.Cf3; ahí tu rival jugó 2…Cf6, que el plan no esperaba (el plan decía 2…Cc6).");
  igual("sin preparación, no dice nada", await page.locator("#partida-" + ID1 + " [data-preparacion]").count(), 0);
  igual("lo que ya pensaba, a la vista", await page.textContent("#partida-" + ID1 + " [data-comentarios]"), "2.Cf3: «quería atacar f7»");

  // Comentar la jugada 7 (4.Cxe5, el error).
  await page.click("#partida-" + ID1 + " summary");
  const caja = page.locator("#partida-" + ID1);
  await caja.getByRole("button", { name: "Jugada siguiente" }).waitFor();
  igual("en la posición de salida no se puede comentar", await caja.locator("form[data-comentar] textarea").isDisabled(), true);
  for (let i = 0; i < 7; i++) await caja.getByRole("button", { name: "Jugada siguiente" }).click();
  igual("el formulario dice qué jugada comenta", await caja.locator("form[data-comentar] label").textContent(), "Lo que pensabas en 4.Cxe5");
  igual("y el tablero, lo que dijo el motor de esa jugada", await caja.locator(".visor-nota").textContent(), "El motor: regalaste. Lo bueno era c3 o 0-0.");
  await caja.locator("form[data-comentar] textarea").fill("Pensé que ganaba un peón");
  await caja.getByRole("button", { name: "Guardar lo que pensabas" }).click();
  await page.waitForFunction(() => /Guardado/.test(document.querySelector("#partida-" + "11111111-1111-4111-8111-111111111111" + " form[data-comentar] [role=status]").textContent), null, { timeout: 8000 }).catch(() => {});
  const upd = await page.evaluate(() => (window.__updates || []).filter((u) => u.tabla === "partidas_torneo"));
  igual("se guarda solo `comentarios`, la unión con lo que había, de ESA partida",
    upd.map((u) => [Object.keys(u.campos), u.campos.comentarios, u.filtros, u.filas]),
    [[["comentarios"], { "3": "quería atacar f7", "7": "Pensé que ganaba un peón" }, [["id", "11111111-1111-4111-8111-111111111111"]], 1]]);
  igual("la lista lo muestra", await page.textContent("#partida-" + ID1 + " [data-comentarios]"), "2.Cf3: «quería atacar f7»4.Cxe5: «Pensé que ganaba un peón»");
  igual("y la nota del tablero junta lo que pensaba y lo que dijo el motor", await caja.locator(".visor-nota").textContent(),
    "Lo que pensabas: «Pensé que ganaba un peón» El motor: regalaste. Lo bueno era c3 o 0-0.");
  // Borrarlo: dejarlo vacío.
  await caja.locator("form[data-comentar] textarea").fill("");
  await caja.getByRole("button", { name: "Guardar lo que pensabas" }).click();
  await page.waitForFunction(() => /borrado/.test(document.querySelector("#partida-11111111-1111-4111-8111-111111111111 form[data-comentar] [role=status]").textContent), null, { timeout: 8000 }).catch(() => {});
  igual("vacío lo borra", await page.textContent("#partida-" + ID1 + " [data-comentarios]"), "2.Cf3: «quería atacar f7»");
  await (await page.$("main")).screenshot({ path: "/tmp/libreta.png" }).catch(() => {});
  // Al imprimir: sin botón de imprimir ni tablero.
  await page.emulateMedia({ media: "print" });
  igual("al imprimir no salen el botón ni el tablero, sí lo que pensaba", await page.evaluate(() =>
    [document.getElementById("imprimir").checkVisibility(), document.querySelector("#partida-11111111-1111-4111-8111-111111111111 details").checkVisibility(),
     document.querySelector("#partida-11111111-1111-4111-8111-111111111111 [data-comentarios]").checkVisibility()]), [false, false, true]);
  igual("sin errores (alumna)", errores.join(" | "), "");
  await ctx.close();
}

async function elProfe(browser) {
  console.log("\n=== Su profesor ===");
  const tablas = JSON.parse(JSON.stringify(TABLAS_ANA));
  // u-ana es ahora la profesora y u-bea su alumna (el doble siempre es u-ana).
  tablas.profiles = [{ id: "u-ana", role: "profesor", is_admin: false, full_name: "Profe Ana" }, { id: "u-bea", role: "alumno", full_name: "Bea Mora" }];
  tablas.partidas_torneo = tablas.partidas_torneo.map((p) => Object.assign(p, { student_id: p.student_id === "u-ana" ? "u-bea" : "u-otra" }));
  tablas.training_state = tablas.training_state.map((x) => Object.assign(x, { student_id: "u-bea" }));
  {
    const { page, ctx, errores } = await abrir(browser, "/libreta-torneos.html?alumno=u-bea".replace("u-bea", "u-bea"), tablas);
    await page.waitForFunction(() => !document.getElementById("loading").checkVisibility(), null, { timeout: 15000 });
    igual("un ?alumno= que no tiene forma de id no se pide: se queda en la suya", await page.textContent("#titulo"), "📒 Mi libreta de torneos");
    await ctx.close();
  }
  const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const t2 = JSON.parse(JSON.stringify(tablas).replace(/u-bea/g, BEA));
  {
    const { page, ctx, errores } = await abrir(browser, "/libreta-torneos.html?alumno=" + BEA, t2);
    await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"), null, { timeout: 15000 });
    igual("el título con su nombre", await page.textContent("#titulo"), "📒 Libreta de torneos de Bea Mora");
    igual("habla de ella, no de «tú»", (await page.textContent("[data-puntos]")).slice(0, 6), "Hizo 0");
    await page.click("#partida-" + ID1 + " summary");
    igual("sin formulario para comentar", await page.locator("#partida-" + ID1 + " form").count(), 0);
    const boton = page.getByRole("button", { name: "Llevar su error a un plan de clase" });
    igual("y el botón para llevar su error a la clase", await boton.count(), 1);
    await boton.click();
    await page.waitForFunction(() => /Listo|No se pudo/.test(document.querySelector("#partida-11111111-1111-4111-8111-111111111111 [data-plan-estado]").textContent), null, { timeout: 8000 }).catch(() => {});
    const ins = await page.evaluate(() => window.__inserts.map((i) => [i.tabla, i.rows]));
    const plan = ins.filter((x) => /plan/.test(x[0]));
    cierto("arma el plan con su nombre y el torneo, y una posición por error: " + JSON.stringify(plan).slice(0, 300),
      plan.length === 2 && /Errores de Bea Mora en su partida de «Abierto de Heredia»/.test(JSON.stringify(plan[0][1])) && plan[1][1].fen === "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4");
    igual("sin errores (profe, libreta de la alumna)", errores.join(" | "), "");
    await ctx.close();
  }
  {
    const { page, ctx, errores } = await abrir(browser, "/libreta-torneos.html", t2);
    await page.waitForFunction(() => !document.getElementById("alumnos").classList.contains("hidden"), null, { timeout: 15000 });
    const filas = await page.evaluate(() => [...document.querySelectorAll("#alumnos-lista a")].map((a) => [a.querySelector("p").textContent, a.getAttribute("href")]));
    cierto("sin ?alumno=: las últimas de sus alumnos, que llevan a esa partida en su libreta: " + JSON.stringify(filas[0]),
      filas.length === 4 && filas.some(([t, h]) => t === "Bea Mora · Abierto de Heredia" && h === "libreta-torneos.html?alumno=" + "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" + "#partida-11111111-1111-4111-8111-111111111111"));
    igual("sin errores (profe, lista)", errores.join(" | "), "");
    await ctx.close();
  }
}

(async () => {
  estatico();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await laAlumna(browser);
    await elProfe(browser);
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
