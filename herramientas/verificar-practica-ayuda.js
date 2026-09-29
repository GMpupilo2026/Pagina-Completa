/* El profe mira la partida de práctica de un alumno y lo ayuda, sin jugar por él
   (sesion.html, pestaña Practicar). Ver «El profe mira la partida de un alumno y
   lo ayuda» en docs/decisiones/clase-en-vivo.md.

   Lo que se rompe acá no da ningún error: el profe abre la partida y la ve
   perfecta, pero la ayuda no le llega al alumno, o le llega con las flechas de
   una posición que ya no está, o el profe «mira» moviéndole las piezas. Se
   comprueba lo que la página MANDA y lo que se PINTA:

   Del lado del profesor
   - cada miniatura trae «Mirar y ayudar», y abre SU partida en grande, con el
     nombre como texto (no como HTML) y el foco en el título;
   - el tablero no se mueve: tocar una pieza y una casilla no manda nada;
   - la presencia dice a quién está mirando, y al cerrar vuelve a nadie;
   - las flechas escritas se dibujan, y lo que se manda es SOLO la ayuda, con
     el número de jugadas de la posición, filtrado por el id de esa partida;
   - lo que no se entiende se dice y no se manda;
   - si la base no la guardó (ronda terminada), lo dice en vez de «le llegó»;
   - cuando el alumno juega, avisa que las flechas eran de antes y las borra;
   - quitar la ayuda manda null; al terminar la ronda se deja de mirar.

   Del lado de la alumna
   - la pista se pinta como texto, y las flechas en su tablero Y en palabras;
   - escucha SU partida con filtro;
   - ve quién la está mirando, y deja de verlo cuando se va;
   - una ayuda de otra posición no pinta flechas; al jugar, se borran;
   - lo que ella guarda nunca lleva la ayuda;
   - no tiene nada de lo del profe.

   Que el alumno no pueda escribirse la ayuda, ni el profe tocarle las jugadas
   o el reloj, lo hace cumplir la base (trigger practica_ayuda_proteger),
   comprobado impersonando roles en SQL.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-practica-ayuda.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const NOMBRE = "Ana <i>Rojas</i>";

function semilla(ayuda) {
  return {
    practice_sessions: [{ id: "p-1", fen: INICIAL, level: "1500", created_by: "u-profe", ended_at: null,
      created_at: new Date().toISOString() }],
    practice_games: [{ id: "g-1", session_id: "p-1", student_id: "u-ana", student_color: "w", fen: INICIAL,
      moves: ["e4", "e5"], status: "playing", eval_cp: null, attempts: 1, reloj_ms: null, ayuda: ayuda || null,
      created_at: new Date().toISOString(), profiles: { full_name: NOMBRE, email: "ana@x.cr" } }],
  };
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cumple(nombre, ok, detalle) {
  if (!ok) { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      salió: " + JSON.stringify(detalle) : "")); fallos += 1; }
  else console.log("  ✓ " + nombre);
}

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return !!(el && el.checkVisibility());
}, sel);
const texto = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || "", sel);
// Lo que está dibujado encima del tablero: flechas (<line>/<path>/<polyline>) y círculos.
const marcasDibujadas = (page, tablero) => page.evaluate((t) => {
  const svg = document.querySelector("#" + t + " svg.marks-overlay");
  if (!svg) return { flechas: 0, circulos: 0 };
  const hijos = [...svg.children].filter((c) => c.tagName.toLowerCase() !== "defs");
  return {
    flechas: hijos.filter((c) => c.tagName.toLowerCase() !== "circle").length > 0 ? 1 : 0,
    circulos: hijos.filter((c) => c.tagName.toLowerCase() === "circle").length,
  };
}, tablero);
const updatesDePartida = (page) => page.evaluate(() =>
  window.__updates.filter((u) => u.tabla === "practice_games"));
const ultimoTrack = (page) => page.evaluate(() => {
  const t = window.__tracks || [];
  return t.length ? t[t.length - 1] : null;
});

async function pruebaProfesor(browser) {
  console.log("\n=== El profesor mira la partida de Ana y le manda una ayuda ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, semilla());
  await page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });

  const boton = await page.getAttribute("#practice-boards-grid .practice-mini-mirar", "aria-label");
  igual("la miniatura trae «Mirar y ayudar» con su nombre", boton, "Mirar y ayudar a " + NOMBRE);
  cumple("el diálogo no se ve antes de abrirlo", !(await seVe(page, "#practica-mirar")));

  await page.click("#practice-boards-grid .practice-mini-mirar");
  cumple("al tocarlo se ve su partida en grande", await seVe(page, "#practica-mirar"));
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "practica-mirar-titulo",
    null, { timeout: 5000 }).catch(() => {});
  igual("el foco va al título", await page.evaluate(() => document.activeElement && document.activeElement.id), "practica-mirar-titulo");
  igual("el nombre se escribe como texto, no como HTML", await page.evaluate(() => {
    const el = document.getElementById("practica-mirar-nombre");
    return { texto: el.textContent, etiquetas: el.querySelectorAll("*").length };
  }), { texto: NOMBRE, etiquetas: 0 });
  igual("su presencia dice que mira a Ana", (await ultimoTrack(page) || {}).mirando_a, "u-ana");
  igual("el tablero muestra su partida (e4 jugado)", await page.getAttribute('#practica-mirar-tablero [data-square="e4"]', "aria-label").then((s) => /peón blanco/.test(s || "")), true);
  cumple("el estado dice que le toca mover", /Le toca mover/.test(await texto(page, "#practica-mirar-estado")),
    await texto(page, "#practica-mirar-estado"));

  // Solo mira: tocar el caballo y una casilla no mueve nada ni manda nada.
  await page.click('#practica-mirar-tablero [data-square="g1"]');
  await page.click('#practica-mirar-tablero [data-square="f3"]');
  await page.waitForTimeout(200);
  igual("tocar sus piezas no mueve nada", await page.getAttribute('#practica-mirar-tablero [data-square="g1"]', "aria-label").then((s) => /caballo blanco/.test(s || "")), true);
  igual("ni manda nada a su partida", (await updatesDePartida(page)).length, 0);

  // Flechas escritas: se dibujan.
  await page.fill("#practica-mirar-marcas", "g1-f3 d7");
  igual("lo escrito se dibuja en el tablero", await marcasDibujadas(page, "practica-mirar-tablero"), { flechas: 1, circulos: 1 });
  await page.fill("#practica-mirar-pista", "¿Qué pieza tuya no está defendida?");
  await page.click("#practica-mirar-mandar");
  await page.waitForFunction(() => /Le llegó/.test(document.getElementById("practica-mirar-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  const u1 = await updatesDePartida(page);
  igual("manda SOLO la ayuda, y a la partida de Ana", u1.map((u) => ({ campos: Object.keys(u.campos), donde: u.donde })),
    [{ campos: ["ayuda"], donde: [["id", "g-1"]] }]);
  igual("la ayuda lleva la posición, las marcas y la pista", u1[0] && u1[0].campos.ayuda, {
    jugadas: 2, flechas: [{ from: "g1", to: "f3" }], circulos: [{ square: "d7" }], texto: "¿Qué pieza tuya no está defendida?",
  });
  igual("dice que le llegó, en palabras", await texto(page, "#practica-mirar-aviso"),
    "Le llegó a " + NOMBRE + ": una flecha de g1 a f3; un círculo en d7 y la pista.");
  cumple("la miniatura dice que tiene tu ayuda", /con tu ayuda/.test(await texto(page, "#practice-boards-grid .practice-mini-status")));

  // Lo que no se entiende se dice, y no se manda.
  await page.fill("#practica-mirar-marcas", "zz9 g1-f3");
  await page.click("#practica-mirar-mandar");
  cumple("lo que no entiende lo dice", /No entendí «zz9»/.test(await texto(page, "#practica-mirar-aviso")), await texto(page, "#practica-mirar-aviso"));
  igual("y no manda nada", (await updatesDePartida(page)).length, 1);

  // La base no la guardó (la ronda ya terminó): no puede decir «le llegó».
  await page.evaluate(() => {
    const orig = window.sb.from;
    window.__fromOriginal = orig;
    window.sb.from = (t) => {
      const b = orig(t);
      if (t === "practice_games") { const u = b.update; b.update = () => u.call(b, {}); }
      return b;
    };
  });
  await page.fill("#practica-mirar-marcas", "");
  await page.fill("#practica-mirar-pista", "Otra pista");
  await page.click("#practica-mirar-mandar");
  await page.waitForFunction(() => /ronda/.test(document.getElementById("practica-mirar-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("si la base no la guardó, lo dice", await texto(page, "#practica-mirar-aviso"), "No le llegó: la ronda de práctica ya terminó.");
  await page.evaluate(() => { window.sb.from = window.__fromOriginal; });

  // Ana juega: la ayuda era de la posición de antes.
  await page.fill("#practica-mirar-marcas", "b1-c3");
  await page.evaluate(() => {
    const g = window.__tablas.practice_games[0];
    g.moves = ["e4", "e5", "Nf3"];
    window.__cambioEnBase("practice_games", Object.assign({}, g));
  });
  await page.waitForFunction(() => /Ya jugó/.test(document.getElementById("practica-mirar-estado").textContent), null, { timeout: 5000 }).catch(() => {});
  const estado = await texto(page, "#practica-mirar-estado");
  cumple("avisa que su ayuda era para la posición anterior", /Ya jugó después de tu ayuda.*la pista sí/.test(estado), estado);
  cumple("y que se borraron las flechas dibujadas", /Se borraron las flechas/.test(estado), estado);
  igual("el tablero ya no tiene flechas", await marcasDibujadas(page, "practica-mirar-tablero"), { flechas: 0, circulos: 0 });
  igual("ni el campo", await page.inputValue("#practica-mirar-marcas"), "");

  // Quitar la ayuda.
  await page.click("#practica-mirar-quitar");
  await page.waitForFunction(() => /quitaste/.test(document.getElementById("practica-mirar-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  const u2 = await updatesDePartida(page);
  igual("quitar manda la ayuda en null", u2[u2.length - 1] && u2[u2.length - 1].campos, { ayuda: null });
  igual("y lo dice", await texto(page, "#practica-mirar-aviso"), "Le quitaste la ayuda a " + NOMBRE + ".");

  // Cerrar con Escape: deja de mirar y el foco vuelve a la miniatura.
  await page.focus("#practica-mirar-pista");
  await page.keyboard.press("Escape");
  cumple("Escape cierra el diálogo", !(await seVe(page, "#practica-mirar")));
  igual("su presencia vuelve a no mirar a nadie", (await ultimoTrack(page) || {}).mirando_a, null);
  igual("el foco vuelve a su botón", await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("practice-mini-mirar")), true);

  // Si la ronda termina mientras la mira, se deja de mirar.
  await page.click("#practice-boards-grid .practice-mini-mirar");
  cumple("se vuelve a abrir", await seVe(page, "#practica-mirar"));
  await page.evaluate(() => {
    const s = window.__tablas.practice_sessions[0];
    s.ended_at = new Date().toISOString();
    window.__cambioEnBase("practice_sessions", Object.assign({}, s));
  });
  await page.waitForTimeout(200);
  cumple("al terminar la ronda se cierra", !(await seVe(page, "#practica-mirar")));
  igual("y deja de mirar", (await ultimoTrack(page) || {}).mirando_a, null);

  const propios = errores.filter((e) => !/stockfish|Worker|wasm/i.test(e));
  igual("sin errores en la página", propios, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== Ana recibe la ayuda en su tablero ===");
  const ayuda = { jugadas: 2, flechas: [{ from: "g1", to: "f3" }], circulos: [], texto: "Mira <b>el</b> caballo",
    de: "u-profe", en: new Date().toISOString() };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, semilla(ayuda));
  await page.waitForSelector("#practice-card:not(.hidden) #practice-board [data-square]", { timeout: 30000 });
  await page.waitForFunction(() => /Ayuda de tu profe/.test(document.getElementById("practica-ayuda").textContent), null, { timeout: 5000 }).catch(() => {});

  igual("la pista se pinta como texto", await page.evaluate(() => {
    const el = document.getElementById("practica-ayuda");
    return { conPista: el.textContent.includes("Mira <b>el</b> caballo"), negritas: el.querySelectorAll("b").length };
  }), { conPista: true, negritas: 0 });
  cumple("las flechas se dicen en palabras", (await texto(page, "#practica-ayuda")).includes("En tu tablero: una flecha de g1 a f3."),
    await texto(page, "#practica-ayuda"));
  igual("y se dibujan en su tablero", await marcasDibujadas(page, "practice-board"), { flechas: 1, circulos: 0 });
  igual("la región de la ayuda es viva", await page.getAttribute("#practica-ayuda", "role"), "status");
  cumple("escucha SU partida, con filtro", await page.evaluate(() => (window.__escuchas || []).some((e) =>
    e.tabla === "practice_games" && e.filtro === "student_id=eq.u-ana")));

  // Quién la está mirando.
  cumple("sin nadie mirando, no dice nada", !(await seVe(page, "#practica-te-miran")));
  await page.evaluate(() => window.__presencia("u-profe", { role: "profesor", full_name: "Karina Rojas", mirando_a: "u-ana" }));
  cumple("ve que su profe la está mirando", await seVe(page, "#practica-te-miran"));
  igual("con su nombre", await texto(page, "#practica-te-miran"), "👁 Karina Rojas está mirando tu partida.");
  await page.evaluate(() => window.__presencia("u-profe", { role: "profesor", full_name: "Karina Rojas", mirando_a: "u-beto" }));
  cumple("si mira a otro, ya no lo dice", !(await seVe(page, "#practica-te-miran")));

  // Una ayuda para otra posición: no se pintan flechas.
  await page.evaluate(() => {
    const g = Object.assign({}, window.__tablas.practice_games[0]);
    g.ayuda = { jugadas: 6, flechas: [{ from: "d2", to: "d4" }], circulos: [], texto: "" };
    window.__cambioEnBase("practice_games", g);
  });
  await page.waitForFunction(() => /ya no se muestran/.test(document.getElementById("practica-ayuda").textContent), null, { timeout: 5000 }).catch(() => {});
  cumple("una ayuda de otra posición lo dice", /ya no se muestran/.test(await texto(page, "#practica-ayuda")), await texto(page, "#practica-ayuda"));
  igual("y no dibuja flechas", await marcasDibujadas(page, "practice-board"), { flechas: 0, circulos: 0 });

  // Vuelve la de esta posición, y Ana juega: las flechas se van.
  await page.evaluate((a) => {
    const g = Object.assign({}, window.__tablas.practice_games[0], { ayuda: a });
    window.__cambioEnBase("practice_games", g);
  }, ayuda);
  await page.waitForFunction(() => /En tu tablero/.test(document.getElementById("practica-ayuda").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("la ayuda nueva le llega por Realtime", await marcasDibujadas(page, "practice-board"), { flechas: 1, circulos: 0 });
  await page.click('#practice-board [data-square="g1"]');
  await page.click('#practice-board [data-square="f3"]');
  await page.waitForFunction(() => /ya no se muestran/.test(document.getElementById("practica-ayuda").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("al jugar, las flechas se borran", await marcasDibujadas(page, "practice-board"), { flechas: 0, circulos: 0 });
  cumple("y la pista sigue", (await texto(page, "#practica-ayuda")).includes("Mira <b>el</b> caballo"));
  const suyas = await updatesDePartida(page);
  cumple("guardó su jugada", suyas.some((u) => Array.isArray(u.campos.moves) && u.campos.moves.length === 3), suyas.map((u) => u.campos));
  cumple("y nunca manda la ayuda", suyas.every((u) => !("ayuda" in u.campos)), suyas.map((u) => Object.keys(u.campos)));

  // Nada de lo del profe.
  igual("no tiene «Mirar y ayudar»", await page.evaluate(() => document.querySelectorAll(".practice-mini-mirar").length), 0);
  cumple("ni el diálogo del profe", !(await seVe(page, "#practica-mirar")));

  const propios = errores.filter((e) => !/stockfish|Worker|wasm/i.test(e));
  igual("sin errores en la página", propios, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
