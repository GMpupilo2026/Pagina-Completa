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

   De quien supervisa (sesion.html?observar=)
   - ve las partidas de la práctica y abre una igual que el profe;
   - lo que manda es SOLO la ayuda, y no crea ninguna partida (no queda
     anotada como alumna);
   - su presencia dice que es supervisión y a quién mira; el profe lo lee.

   De quien coordina (lo mismo, con su nombre)
   - entra a mirar, se nombra «Coordinación» y vuelve a coordinacion.html;
   - su presencia dice «coordinación», y el profe y la alumna lo leen así;
   - sin clase abierta, lo manda de vuelta a Coordinación y no a Supervisión.

   De quien administra (entra desde Supervisión, que le lista a todos)
   - se nombra «Administración», no «Supervisión», y ayuda igual.

   El alumno pide ayuda desde su partida
   - «🙋 Pedir ayuda» manda SOLO su pedido; el botón dice que pidió y deja
     cancelar; cuando alguien lo atiende, se lo dice;
   - al profe la tarjeta se le marca con texto, sube al principio, se dice en
     voz y la cuenta de arriba la suma; «✔ Marcar como atendido» lo apaga.

   Una pista para todos a la vez
   - va en UNA consulta filtrada por la ronda, solo texto y marcada para todos;
   - dice a cuántos les llegó, y si la base no la guardó (ronda terminada), lo
     dice en vez de «le llegó»; sin texto no manda nada;
   - la alumna la lee como «Pista de tu profe para toda la clase».

   El alumno le contesta a quien lo ayudó
   - el campo sale solo con una ayuda a la vista; manda SOLO su respuesta, a su
     partida; sin texto no manda nada; se le dice qué contestó, y una ayuda
     nueva (que la base le borra) la quita de la pantalla;
   - al profe le aparece en la miniatura y en el diálogo, como texto (no como
     HTML), y se dice en voz.

   Del lado de la alumna
   - la pista se pinta como texto, y las flechas en su tablero Y en palabras;
   - escucha SU partida con filtro;
   - ve quién la está mirando, y deja de verlo cuando se va; si es alguien de
     supervisión, lo dice;
   - una ayuda de quien supervisa dice de quién es, no «de tu profe»;
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
const COORD = { id: "u-coord", role: "profesor", is_admin: false, es_coordinador: true, es_supervisor: false,
                full_name: "Luis Vega", email: "luis@x.cr", grupo: null };
const ADMIN = { id: "u-oscar", role: "admin", is_admin: true, es_coordinador: false, es_supervisor: false,
                full_name: "Oscar Angulo", email: "oscar@x.cr", grupo: null };
const SUP = { id: "u-sup", role: "profesor", is_admin: false, es_coordinador: false, es_supervisor: true,
              full_name: "Marta Solano", email: "marta@x.cr", grupo: null };

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
  cumple("la miniatura dice que tiene ayuda", /con (tu )?ayuda/.test(await texto(page, "#practice-boards-grid .practice-mini-status")));

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

async function pruebaSupervision(browser) {
  console.log("\n=== Quien supervisa mira la partida de Ana y la ayuda ===");
  const semillaSup = Object.assign(semilla(), { profiles: [R.PROFE, R.ALUMNA, SUP] });
  const { page, ctx, errores } = await abrir(browser, SUP.id, CLASE, semillaSup, { ruta: "/sesion.html?observar=u-profe" });
  cumple("se monta como supervisión", await seVe(page, "#observador-panel"));
  cumple("el panel dice que puede ayudar en la práctica", /puedes ayudar a uno con flechas y una pista/.test(await texto(page, "#observador-texto")));
  await page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  cumple("ve la partida de cada alumno", await seVe(page, "#practice-boards-section"));
  cumple("sin las herramientas del profe", !(await seVe(page, "#teacher-toolbar")));
  cumple("ni la tarjeta de práctica de alumna", !(await seVe(page, "#practice-card")));

  await page.click("#practice-boards-grid .practice-mini-mirar");
  cumple("abre su partida en grande", await seVe(page, "#practica-mirar"));
  igual("su presencia dice que es supervisión y que mira a Ana",
    await ultimoTrack(page).then((t) => t && { role: t.role, mirando_a: t.mirando_a }), { role: "supervision", mirando_a: "u-ana" });
  await page.click('#practica-mirar-tablero [data-square="g1"]');
  await page.click('#practica-mirar-tablero [data-square="f3"]');
  await page.fill("#practica-mirar-pista", "Cuenta los defensores de e5.");
  await page.click("#practica-mirar-mandar");
  await page.waitForFunction(() => /Le llegó/.test(document.getElementById("practica-mirar-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("manda SOLO la ayuda, a la partida de Ana", (await updatesDePartida(page)).map((u) => ({ campos: Object.keys(u.campos), donde: u.donde })),
    [{ campos: ["ayuda"], donde: [["id", "g-1"]] }]);
  cumple("dice que le llegó", /^Le llegó a /.test(await texto(page, "#practica-mirar-aviso")), await texto(page, "#practica-mirar-aviso"));
  igual("no crea ninguna partida ni se anota en nada", await page.evaluate(() => window.__inserts.map((i) => i.tabla)), []);
  await page.keyboard.press("Escape");
  igual("al cerrar, deja de mirar", (await ultimoTrack(page) || {}).mirando_a, null);
  igual("sin errores en la página", errores.filter((e) => !/stockfish|Worker|wasm/i.test(e)), []);
  await ctx.close();

  console.log("\n=== El profe sabe que supervisión mira la partida de Ana ===");
  const profe = await abrir(browser, "u-profe", CLASE, semilla());
  await profe.page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  await profe.page.evaluate(() => window.__presencia("u-sup", { role: "supervision", full_name: "Marta Solano", mirando_a: "u-ana" }));
  igual("lo dice arriba", await texto(profe.page, "#observadores"),
    "👁 Marta Solano (supervisión) está mirando la clase. Marta Solano está en la partida de " + NOMBRE + ".");
  await profe.ctx.close();
}

async function pruebaCoordinacion(browser) {
  console.log("\n=== Quien coordina mira la partida de Ana y la ayuda ===");
  const semillaCoord = Object.assign(semilla(), { profiles: [R.PROFE, R.ALUMNA, COORD] });
  const { page, ctx, errores } = await abrir(browser, COORD.id, CLASE, semillaCoord, { ruta: "/sesion.html?observar=u-profe" });
  cumple("se monta como observador", await seVe(page, "#observador-panel"));
  igual("se nombra coordinación, no supervisión", (await texto(page, "#role-badge")).trim(), "👁 Coordinación");
  igual("y vuelve a su pantalla", await page.getAttribute("#observador-panel a[href]", "href"), "coordinacion.html");
  cumple("la franja de arriba dice que mira", /^Estás mirando la clase de Karina Rojas/.test(await texto(page, "#status-banner")));
  await page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  await page.click("#practice-boards-grid .practice-mini-mirar");
  igual("su presencia dice que viene de coordinación y a quién mira",
    await ultimoTrack(page).then((t) => t && { role: t.role, como: t.como, mirando_a: t.mirando_a }),
    { role: "supervision", como: "coordinación", mirando_a: "u-ana" });
  await page.fill("#practica-mirar-pista", "¿Qué pieza no está defendida?");
  await page.click("#practica-mirar-mandar");
  await page.waitForFunction(() => /Le llegó/.test(document.getElementById("practica-mirar-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("manda SOLO la ayuda, a la partida de Ana", (await updatesDePartida(page)).map((u) => ({ campos: Object.keys(u.campos), donde: u.donde })),
    [{ campos: ["ayuda"], donde: [["id", "g-1"]] }]);
  igual("no crea ninguna partida ni se anota en nada", await page.evaluate(() => window.__inserts.map((i) => i.tabla)), []);
  igual("sin errores en la página", errores.filter((e) => !/stockfish|Worker|wasm/i.test(e)), []);
  await ctx.close();

  console.log("\n=== Sin clase abierta, vuelve a Coordinación ===");
  const sin = await abrir(browser, COORD.id, null, { profiles: [R.PROFE, R.ALUMNA, COORD] }, { ruta: "/sesion.html?observar=u-profe" });
  cumple("dice que no hay clase", await seVe(sin.page, "#sin-clase"));
  igual("y el enlace lleva a Coordinación", await sin.page.$eval("#sin-clase a[href]", (a) => ({ href: a.getAttribute("href"), texto: a.textContent })),
    { href: "coordinacion.html", texto: "← Volver a Coordinación" });
  await sin.ctx.close();

  console.log("\n=== El profe y la alumna leen «coordinación» ===");
  const profe = await abrir(browser, "u-profe", CLASE, semilla());
  await profe.page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  await profe.page.evaluate(() => window.__presencia("u-coord", { role: "supervision", como: "coordinación", full_name: "Luis Vega", mirando_a: "u-ana" }));
  igual("el profe lo lee", await texto(profe.page, "#observadores"),
    "👁 Luis Vega (coordinación) está mirando la clase. Luis Vega está en la partida de " + NOMBRE + ".");
  await profe.ctx.close();
  const ana = await abrir(browser, "u-ana", CLASE, semilla());
  await ana.page.waitForSelector("#practice-card:not(.hidden) #practice-board [data-square]", { timeout: 30000 });
  await ana.page.evaluate(() => window.__presencia("u-coord", { role: "supervision", como: "coordinación", full_name: "Luis Vega", mirando_a: "u-ana" }));
  igual("la alumna lo lee", await texto(ana.page, "#practica-te-miran"), "👁 Luis Vega (coordinación) está mirando tu partida.");
  await ana.ctx.close();
}

async function pruebaAdministracion(browser) {
  console.log("\n=== Quien administra mira la partida de Ana y la ayuda ===");
  const semillaAdmin = Object.assign(semilla(), { profiles: [R.PROFE, R.ALUMNA, ADMIN] });
  const { page, ctx, errores } = await abrir(browser, ADMIN.id, CLASE, semillaAdmin, { ruta: "/sesion.html?observar=u-profe" });
  cumple("se monta como observador", await seVe(page, "#observador-panel"));
  igual("se nombra administración", (await texto(page, "#role-badge")).trim(), "👁 Administración");
  igual("y vuelve a Supervisión, por donde entró", await page.getAttribute("#observador-panel a[href]", "href"), "supervision.html");
  cumple("sin las herramientas de dar clase", !(await seVe(page, "#teacher-toolbar")));
  await page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  await page.click("#practice-boards-grid .practice-mini-mirar");
  igual("su presencia dice que viene de administración y a quién mira",
    await ultimoTrack(page).then((t) => t && { role: t.role, como: t.como, mirando_a: t.mirando_a }),
    { role: "supervision", como: "administración", mirando_a: "u-ana" });
  await page.fill("#practica-mirar-marcas", "g1-f3");
  await page.click("#practica-mirar-mandar");
  await page.waitForFunction(() => /Le llegó/.test(document.getElementById("practica-mirar-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("manda SOLO la ayuda, a la partida de Ana", (await updatesDePartida(page)).map((u) => ({ campos: Object.keys(u.campos), donde: u.donde })),
    [{ campos: ["ayuda"], donde: [["id", "g-1"]] }]);
  igual("no crea ninguna partida ni se anota en nada", await page.evaluate(() => window.__inserts.map((i) => i.tabla)), []);
  igual("sin errores en la página", errores.filter((e) => !/stockfish|Worker|wasm/i.test(e)), []);
  await ctx.close();
}

async function pruebaPedidoProfe(browser) {
  console.log("\n=== Ana pide ayuda: el profe lo ve y lo atiende ===");
  const sem = semilla();
  sem.practice_games[0].pide_ayuda_at = new Date().toISOString();
  // Beto va primero en la lista y no pidió nada: Ana tiene que subir igual.
  sem.practice_games.unshift({ id: "g-2", session_id: "p-1", student_id: "u-beto", student_color: "w", fen: INICIAL,
    moves: [], status: "playing", eval_cp: null, attempts: 1, reloj_ms: null, ayuda: null, pide_ayuda_at: null,
    created_at: new Date().toISOString(), profiles: { full_name: "Beto Mora", email: "beto@x.cr" } });
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, sem);
  await page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  await page.waitForTimeout(200);
  const tarjetas = await page.evaluate(() => [...document.querySelectorAll("#practice-boards-grid > div")].map((d) => ({
    nombre: d.querySelector(".practice-mini-name").textContent,
    pide: d.querySelector(".practice-mini-pide").checkVisibility(),
    arriba: d.getBoundingClientRect().top, izq: d.getBoundingClientRect().left,
  })));
  const ana = tarjetas.find((t) => t.nombre === NOMBRE), beto = tarjetas.find((t) => t.nombre === "Beto Mora");
  cumple("la tarjeta de Ana dice que pide ayuda, escrito", ana && ana.pide, tarjetas);
  cumple("la de Beto no", beto && !beto.pide);
  cumple("Ana sube antes que Beto", ana && beto && (ana.arriba < beto.arriba || (ana.arriba === beto.arriba && ana.izq < beto.izq)), tarjetas);
  cumple("la cuenta de arriba lo suma", /· 🙋 1 pide ayuda$/.test(await texto(page, "#practice-boards-hint")), await texto(page, "#practice-boards-hint"));
  igual("se dice en voz", await texto(page, "#practica-pedidos-aviso"), NOMBRE + " pide ayuda en su partida.");
  const botonAna = await page.$$eval("#practice-boards-grid .practice-mini-mirar", (bs) => bs.map((b) => b.getAttribute("aria-label")));
  cumple("su botón lo dice", botonAna.includes("Mirar y ayudar a " + NOMBRE + " (pide ayuda)"), botonAna);

  await page.click('#practice-boards-grid .practice-mini-mirar[aria-label$="(pide ayuda)"]');
  cumple("el diálogo lo dice", /^🙋 Pidió ayuda\./.test(await texto(page, "#practica-mirar-estado")), await texto(page, "#practica-mirar-estado"));
  cumple("y ofrece «Marcar como atendido»", await seVe(page, "#practica-mirar-atendido"));
  await page.click("#practica-mirar-atendido");
  await page.waitForFunction(() => /atendido/.test(document.getElementById("practica-mirar-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  const u = await updatesDePartida(page);
  igual("«Marcar como atendido» manda solo apagar el pedido, a la partida de Ana", u.map((x) => ({ campos: x.campos, donde: x.donde })),
    [{ campos: { pide_ayuda_at: null }, donde: [["id", "g-1"]] }]);
  igual("y lo dice", await texto(page, "#practica-mirar-aviso"), "Marcaste como atendido el pedido de " + NOMBRE + ".");
  cumple("la tarjeta deja de marcarlo", !(await page.evaluate(() => [...document.querySelectorAll(".practice-mini-pide")].some((p) => p.checkVisibility()))));
  cumple("y el botón desaparece", !(await seVe(page, "#practica-mirar-atendido")));
  igual("sin errores en la página", errores.filter((e) => !/stockfish|Worker|wasm/i.test(e)), []);
  await ctx.close();
}

async function pruebaPistaATodos(browser) {
  console.log("\n=== Una pista para toda la ronda ===");
  const sem = semilla();
  sem.practice_games.push({ id: "g-2", session_id: "p-1", student_id: "u-beto", student_color: "w", fen: INICIAL,
    moves: ["d4"], status: "playing", eval_cp: null, attempts: 1, reloj_ms: null, ayuda: null, pide_ayuda_at: null,
    created_at: new Date().toISOString(), profiles: { full_name: "Beto Mora", email: "beto@x.cr" } });
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, sem);
  await page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  cumple("el campo para todos se ve", await seVe(page, "#practica-todos-pista"));

  await page.click("#practica-todos-mandar");
  igual("sin texto no manda nada", (await updatesDePartida(page)).length, 0);
  igual("y lo dice", await texto(page, "#practica-todos-aviso"), "Escribe la pista antes de mandarla.");

  await page.fill("#practica-todos-pista", "Antes de mover, busquen los jaques del rival.");
  await page.click("#practica-todos-mandar");
  await page.waitForFunction(() => /Le llegó/.test(document.getElementById("practica-todos-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  const u = await updatesDePartida(page);
  igual("va en UNA consulta, filtrada por la ronda, solo texto y para todos", u.map((x) => ({ campos: x.campos, donde: x.donde })), [{
    campos: { ayuda: { jugadas: 0, flechas: [], circulos: [], texto: "Antes de mover, busquen los jaques del rival.", para_todos: true } },
    donde: [["session_id", "p-1"]],
  }]);
  igual("dice a cuántos les llegó", await texto(page, "#practica-todos-aviso"), "Le llegó a los 2 alumnos.");
  igual("las dos miniaturas lo muestran", await page.$$eval("#practice-boards-grid .practice-mini-status", (ps) => ps.map((p) => /con (tu )?ayuda/.test(p.textContent))), [true, true]);
  igual("y el campo se vacía", await page.inputValue("#practica-todos-pista"), "");

  // La base no la guardó (ronda terminada): no puede decir «le llegó».
  await page.evaluate(() => {
    const orig = window.sb.from;
    window.sb.from = (t) => {
      const b = orig(t);
      if (t === "practice_games") { const up = b.update; b.update = () => up.call(b, {}); }
      return b;
    };
  });
  await page.fill("#practica-todos-pista", "Otra pista");
  await page.click("#practica-todos-mandar");
  await page.waitForFunction(() => /nadie/.test(document.getElementById("practica-todos-aviso").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("si la base no la guardó, lo dice", await texto(page, "#practica-todos-aviso"), "No le llegó a nadie: la ronda de práctica ya terminó.");
  igual("sin errores en la página", errores.filter((e) => !/stockfish|Worker|wasm/i.test(e)), []);
  await ctx.close();

  console.log("\n=== La alumna lee la pista para toda la clase ===");
  const ana = await abrir(browser, "u-ana", CLASE, semilla({ jugadas: 0, flechas: [], circulos: [], texto: "Busquen los jaques.",
    para_todos: true, de: "u-profe", nombre: "Karina Rojas" }));
  await ana.page.waitForSelector("#practice-card:not(.hidden) #practice-board [data-square]", { timeout: 30000 });
  await ana.page.waitForFunction(() => /para toda la clase/.test(document.getElementById("practica-ayuda").textContent), null, { timeout: 5000 }).catch(() => {});
  cumple("se lee como pista para toda la clase", /^💡 Pista de tu profe para toda la clase/.test(await texto(ana.page, "#practica-ayuda")), await texto(ana.page, "#practica-ayuda"));
  cumple("con su texto", (await texto(ana.page, "#practica-ayuda")).includes("Busquen los jaques."));
  igual("sin flechas en su tablero", await marcasDibujadas(ana.page, "practice-board"), { flechas: 0, circulos: 0 });
  await ana.ctx.close();
}

async function pruebaRespuesta(browser) {
  console.log("\n=== Ana le contesta a la ayuda ===");
  const sinAyuda = await abrir(browser, "u-ana", CLASE, semilla());
  await sinAyuda.page.waitForSelector("#practice-card:not(.hidden) #practice-board [data-square]", { timeout: 30000 });
  cumple("sin ayuda no se ofrece contestar", !(await seVe(sinAyuda.page, "#practica-contestar-texto")));
  await sinAyuda.ctx.close();

  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE,
    semilla({ jugadas: 2, flechas: [], circulos: [], texto: "Mira el caballo", de: "u-profe", nombre: "Karina Rojas" }));
  await page.waitForSelector("#practice-card:not(.hidden) #practice-board [data-square]", { timeout: 30000 });
  await page.waitForFunction(() => document.getElementById("practica-contestar-texto").checkVisibility(), null, { timeout: 5000 }).catch(() => {});
  cumple("con ayuda se ofrece contestar", await seVe(page, "#practica-contestar-texto"));
  await page.click("#practica-contestar-mandar");
  igual("sin texto no manda nada", (await updatesDePartida(page)).length, 0);
  await page.fill("#practica-contestar-texto", "¿El de f3?");
  await page.click("#practica-contestar-mandar");
  await page.waitForFunction(() => /Le contestaste/.test(document.getElementById("practica-contestado").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("manda SOLO su respuesta, a su partida", (await updatesDePartida(page)).map((u) => ({ campos: u.campos, donde: u.donde })),
    [{ campos: { respuesta: "¿El de f3?" }, donde: [["id", "g-1"]] }]);
  igual("se le dice qué contestó", await texto(page, "#practica-contestado"), "Le contestaste: «¿El de f3?».");
  // Le llega una ayuda nueva: la base le borró la respuesta.
  await page.evaluate(() => {
    const g = Object.assign({}, window.__tablas.practice_games[0], { respuesta: null,
      ayuda: { jugadas: 2, flechas: [], circulos: [], texto: "Sí, ese", de: "u-profe", nombre: "Karina Rojas" } });
    window.__cambioEnBase("practice_games", g);
  });
  await page.waitForFunction(() => document.getElementById("practica-contestado").textContent === "", null, { timeout: 5000 }).catch(() => {});
  igual("con la ayuda nueva la respuesta vieja se va", await texto(page, "#practica-contestado"), "");
  igual("sin errores en la página", errores.filter((e) => !/stockfish|Worker|wasm/i.test(e)), []);
  await ctx.close();

  console.log("\n=== El profe lee lo que contestó Ana ===");
  const sem = semilla({ jugadas: 2, flechas: [], circulos: [], texto: "Mira el caballo", de: "u-profe" });
  sem.practice_games[0].respuesta = "¿El <b>de</b> f3?";
  sem.practice_games[0].respuesta_at = new Date().toISOString();
  const profe = await abrir(browser, "u-profe", CLASE, sem);
  await profe.page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  igual("la miniatura la muestra, como texto", await profe.page.$eval(".practice-mini-respuesta", (p) => ({ texto: p.textContent, seVe: p.checkVisibility(), etiquetas: p.querySelectorAll("*").length })),
    { texto: "💬 «¿El <b>de</b> f3?»", seVe: true, etiquetas: 0 });
  igual("se dice en voz", await texto(profe.page, "#practica-pedidos-aviso"), NOMBRE + " contestó: ¿El <b>de</b> f3?");
  await profe.page.click("#practice-boards-grid .practice-mini-mirar");
  igual("el diálogo la muestra", await texto(profe.page, "#practica-mirar-respuesta"), "💬 " + NOMBRE + " contestó: «¿El <b>de</b> f3?»");
  igual("sin errores en la página", profe.errores.filter((e) => !/stockfish|Worker|wasm/i.test(e)), []);
  await profe.ctx.close();
}

async function pruebaPedidoAlumna(browser) {
  console.log("\n=== Ana pide ayuda desde su partida ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, semilla());
  await page.waitForSelector("#practice-card:not(.hidden) #practice-board [data-square]", { timeout: 30000 });
  igual("el botón se ofrece", await page.$eval("#practica-pedir-ayuda", (b) => ({ texto: b.textContent, pulsado: b.getAttribute("aria-pressed"), seVe: b.checkVisibility() })),
    { texto: "🙋 Pedir ayuda", pulsado: "false", seVe: true });
  await page.click("#practica-pedir-ayuda");
  await page.waitForFunction(() => document.getElementById("practica-pedir-ayuda").getAttribute("aria-pressed") === "true", null, { timeout: 5000 }).catch(() => {});
  const u = await updatesDePartida(page);
  cumple("manda SOLO su pedido, a su partida", u.length === 1 && JSON.stringify(Object.keys(u[0].campos)) === '["pide_ayuda_at"]'
    && typeof u[0].campos.pide_ayuda_at === "string" && JSON.stringify(u[0].donde) === '[["id","g-1"]]', u);
  igual("el botón dice que pidió y deja cancelar", await page.$eval("#practica-pedir-ayuda", (b) => ({ texto: b.textContent, pulsado: b.getAttribute("aria-pressed") })),
    { texto: "✋ Pediste ayuda · Cancelar", pulsado: "true" });
  cumple("y se lo dice", /Le avisamos a tu profe/.test(await texto(page, "#practica-pedido")));

  // Alguien lo atiende: le llega la ayuda y el pedido se apaga.
  await page.evaluate(() => {
    const g = Object.assign({}, window.__tablas.practice_games[0], { pide_ayuda_at: null,
      ayuda: { jugadas: 2, flechas: [], circulos: [], texto: "Mira el caballo", de: "u-profe", nombre: "Karina Rojas" } });
    window.__cambioEnBase("practice_games", g);
  });
  await page.waitForFunction(() => document.getElementById("practica-pedir-ayuda").getAttribute("aria-pressed") === "false", null, { timeout: 5000 }).catch(() => {});
  igual("cuando lo atienden, el botón vuelve", await page.$eval("#practica-pedir-ayuda", (b) => b.textContent), "🙋 Pedir ayuda");
  igual("y se le dice", await texto(page, "#practica-pedido"), "Tu pedido de ayuda ya no está activo.");
  cumple("con la ayuda en su tablero", (await texto(page, "#practica-ayuda")).includes("Mira el caballo"));

  // Pedir y cancelar.
  await page.click("#practica-pedir-ayuda");
  await page.waitForFunction(() => document.getElementById("practica-pedir-ayuda").getAttribute("aria-pressed") === "true", null, { timeout: 5000 }).catch(() => {});
  await page.click("#practica-pedir-ayuda");
  await page.waitForFunction(() => document.getElementById("practica-pedir-ayuda").getAttribute("aria-pressed") === "false", null, { timeout: 5000 }).catch(() => {});
  const u2 = await updatesDePartida(page);
  igual("cancelar manda el pedido en null", u2[u2.length - 1] && u2[u2.length - 1].campos, { pide_ayuda_at: null });
  igual("sin errores en la página", errores.filter((e) => !/stockfish|Worker|wasm/i.test(e)), []);
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
  await page.evaluate(() => window.__presencia("u-sup", { role: "supervision", full_name: "Marta Solano", mirando_a: "u-ana" }));
  igual("si es supervisión, lo dice", await texto(page, "#practica-te-miran"), "👁 Marta Solano (supervisión) está mirando tu partida.");
  await page.evaluate(() => window.__presencia("u-sup", null));

  // Una ayuda de quien supervisa dice de quién es.
  await page.evaluate(() => {
    const g = Object.assign({}, window.__tablas.practice_games[0]);
    g.ayuda = { jugadas: 2, flechas: [], circulos: [], texto: "Cuenta los defensores.", de: "u-sup", nombre: "Marta Solano" };
    window.__cambioEnBase("practice_games", g);
  });
  await page.waitForFunction(() => /Marta Solano/.test(document.getElementById("practica-ayuda").textContent), null, { timeout: 5000 }).catch(() => {});
  cumple("una ayuda de supervisión dice de quién es", /^💡 Ayuda de Marta Solano/.test(await texto(page, "#practica-ayuda")), await texto(page, "#practica-ayuda"));

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
    await pruebaSupervision(browser);
    await pruebaCoordinacion(browser);
    await pruebaAdministracion(browser);
    await pruebaPedidoProfe(browser);
    await pruebaPedidoAlumna(browser);
    await pruebaPistaATodos(browser);
    await pruebaRespuesta(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
