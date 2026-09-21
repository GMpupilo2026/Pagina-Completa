/* Comprueba, en un navegador de verdad y con un Supabase de mentira, que el
   profesor pueda SENTARSE a jugar y no solo repartir rivales:

   1. juegos.html — el formulario de "Asignar rivales" lo incluye a él, pero al
      final y en su propio grupo, para no cambiar el caso de todos los días
      (una partida entre dos alumnos, que tiene que seguir saliendo preseleccionada).
   2. juegos.html — la partida propia del profesor le aparece arriba, igual que
      al alumno, y en la lista de supervisión su botón dice "Jugar", no "Ver".
   3. juegos.html — el alumno no pierde nada de lo que tenía.
   4. torneos.html y torneo.html — el botón de inscribirse aparece también para
      quien organiza. Antes se le escondía, y esa era toda la razón por la que
      un profesor no podía jugar su propio torneo.

   Lo que hace cumplir la BASE (que la política deje crear esa partida) no se
   prueba acá: eso se comprobó impersonando roles en SQL, caso por caso. Esto es
   lo otro — que la página mande lo correcto y muestre lo correcto.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-profesor-juega.js                        */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "karina@x.cr" };
const ANA   = { id: "u-ana",   role: "alumno",   is_admin: false, full_name: "Ana Rojas",    email: "ana@x.cr" };
const BRUNO = { id: "u-bruno", role: "alumno",   is_admin: false, full_name: "Bruno Mena",   email: "bruno@x.cr" };
const CARLA = { id: "u-carla", role: "alumno",   is_admin: false, full_name: "Carla Soto",   email: "carla@x.cr" };

/* Una partida en curso del PROFESOR contra Ana, y otra entre dos alumnos: así
   se ve que el botón cambia de nombre solo en la suya. */
const PARTIDA_MIA   = { id: "r-mia",   variant: "estandar", white_id: "u-profe", black_id: "u-ana",   status: "playing", created_at: "2026-09-16T10:00:00Z", result: null, initial_seconds: 600, increment_seconds: 0 };
const PARTIDA_AJENA = { id: "r-ajena", variant: "estandar", white_id: "u-bruno", black_id: "u-carla", status: "playing", created_at: "2026-09-16T09:00:00Z", result: null, initial_seconds: 600, increment_seconds: 0 };

const TORNEO = {
  id: "t-1", name: "Copa de setiembre", format: "swiss", variant: "estandar", status: "registration",
  created_by: "u-profe", initial_seconds: 600, increment_seconds: 0, total_rounds: null, current_round: 0,
  winner_ids: null, created_at: "2026-09-10T00:00:00Z",
};

function clienteFalso(datos, usuarioId) {
  return `
window.__inserts = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};

  /* Un constructor que de verdad FILTRA. Sin esto no se puede probar nada de
     esta página: pide profiles tres veces seguidas con filtros distintos —mi
     perfil, mis alumnos, los nombres de unos ids— y un doble que devuelva
     siempre la tabla entera haría pasar la prueba con la página rota. */
  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, resultado = null;
    const cmp = (a, b) => String(a) === String(b);
    const b = {
      select() { return b; },
      eq(col, val) { filas2 = filas2.filter((r) => cmp(r[col], val)); return b; },
      neq(col, val) { filas2 = filas2.filter((r) => !cmp(r[col], val)); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => (vals || []).some((v) => cmp(r[col], v))); return b; },
      is() { return b; },
      not() { return b; },
      or(expr) {
        const partes = String(expr).split(",").map((p) => p.split("."));
        filas2 = filas2.filter((r) => partes.some(([col, op, val]) =>
          op === "eq" && col.indexOf("->") === -1 && cmp(r[col], val)));
        return b;
      },
      order(col, opts) {
        const asc = !opts || opts.ascending !== false;
        filas2.sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : 1) * (asc ? 1 : -1));
        return b;
      },
      limit(n) { filas2 = filas2.slice(0, n); return b; },
      range() { return b; },
      insert(fila) { window.__inserts.push({ tabla: tabla, fila: fila }); resultado = fila; return b; },
      update(fila) { window.__inserts.push({ tabla: tabla, update: fila }); resultado = fila; return b; },
      delete() { window.__inserts.push({ tabla: tabla, borra: true }); resultado = null; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = resultado !== null ? resultado : filas2;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }), signOut: () => Promise.resolve({}) },
    from: (t) => constructor(t, DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : []),
    rpc: (n) => constructor(n, DATOS.rpc[n] !== undefined ? DATOS.rpc[n] : []),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
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

async function pagina(browser, ruta, script) {
  const ctx = await browser.newContext();
  // Los de afuera se cortan: el cliente de Supabase se reemplaza por el doble
  // (abajo) y chess.js no lo usa ninguna de las tres páginas —los motores de
  // cartas y de 4 jugadores son archivos del sitio—. Cortarlos de verdad, en
  // vez de dejarlos fallar, es lo que permite exigir CERO errores de consola.
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/cdnjs.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: script }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx, errores };
}

const DATOS_JUEGOS = (alumnos, partidas) => ({
  rpc: { mis_clases: [] },
  tablas: {
    profiles: [PROFE, ANA, BRUNO, CARLA],
    game_rooms: partidas,
    fourplayer_games: [],
    desafios: [],
  },
  _alumnos: alumnos,
});

async function pruebaFormulario(browser) {
  console.log("\n=== juegos.html · el profesor entra en el formulario ===");
  const { page, ctx, errores } = await pagina(browser, "/juegos.html",
    clienteFalso(DATOS_JUEGOS(3, [PARTIDA_MIA, PARTIDA_AJENA]), "u-profe"));

  const opciones = await page.evaluate(() => {
    const sel = document.getElementById("white-select");
    return Array.from(sel.querySelectorAll("optgroup")).map((g) => ({
      grupo: g.label,
      items: Array.from(g.querySelectorAll("option")).map((o) => o.textContent),
    }));
  });
  igual("los alumnos van primero", opciones[0] && opciones[0].grupo, "Mis alumnos");
  igual("y el profesor al final, aparte", opciones[1] && opciones[1].grupo, "Yo");
  igual("con su nombre", opciones[1] && opciones[1].items.join(""), "Karina Rojas");

  // Lo que NO debe cambiar: la preselección de siempre.
  const pre = await page.evaluate(() => [
    document.getElementById("white-select").value,
    document.getElementById("black-select").value,
  ]);
  igual("blancas siguen arrancando en el primer alumno", pre[0], "u-ana");
  igual("negras en el segundo", pre[1], "u-bruno");

  // Armar la partida poniéndose él de blancas.
  await page.selectOption("#white-select", "u-profe");
  await page.selectOption("#black-select", "u-ana");
  await page.click("#create-room-form button[type=submit]");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "game_rooms"), { timeout: 10000 });
  const fila = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "game_rooms").pop().fila);
  igual("manda al profesor como blancas", fila.white_id, "u-profe");
  igual("y al alumno como negras", fila.black_id, "u-ana");
  igual("firmada por él", fila.created_by, "u-profe");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaUnSoloAlumno(browser) {
  console.log("\n=== juegos.html · con un solo alumno, el rival soy yo ===");
  const datos = DATOS_JUEGOS(1, []);
  datos.tablas.profiles = [PROFE, ANA];
  const { page, ctx } = await pagina(browser, "/juegos.html", clienteFalso(datos, "u-profe"));
  const pre = await page.evaluate(() => [
    document.getElementById("white-select").value,
    document.getElementById("black-select").value,
  ]);
  igual("blancas: el único alumno", pre[0], "u-ana");
  igual("negras: el profesor (antes quedaban las dos en el mismo alumno)", pre[1], "u-profe");
  await ctx.close();
}

async function pruebaPartidaPropia(browser) {
  console.log("\n=== juegos.html · su partida la tiene a mano ===");
  const { page, ctx } = await pagina(browser, "/juegos.html",
    clienteFalso(DATOS_JUEGOS(3, [PARTIDA_MIA, PARTIDA_AJENA]), "u-profe"));

  const arriba = await page.evaluate(() => {
    const caja = document.getElementById("my-active-games");
    return { visible: !caja.closest(".hidden"), texto: caja.textContent.trim(), tarjetas: caja.querySelectorAll("a").length };
  });
  igual("el bloque de sus partidas se ve", arriba.visible, "true");
  igual("con una sola tarjeta (la suya, no la de los alumnos)", arriba.tarjetas, 1);
  igual("y dice contra quién", /Contra Ana Rojas/.test(arriba.texto), "true");

  const botones = await page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll("#ongoing-list > div"));
    return filas.map((f) => ({ quienes: f.querySelector("h3").textContent, boton: f.querySelector("a").textContent }));
  });
  const mia = botones.find((b) => b.quienes.indexOf("Karina") !== -1);
  const ajena = botones.find((b) => b.quienes.indexOf("Karina") === -1);
  igual("en su partida el botón dice Jugar", mia && mia.boton, "♟️ Jugar");
  igual("en la de los alumnos sigue diciendo Ver", ajena && ajena.boton, "👀 Ver");
  await ctx.close();
}

async function pruebaAlumnoIntacto(browser) {
  console.log("\n=== juegos.html · al alumno no se le movió nada ===");
  const { page, ctx, errores } = await pagina(browser, "/juegos.html",
    clienteFalso(DATOS_JUEGOS(3, [PARTIDA_MIA]), "u-ana"));
  const v = await page.evaluate(() => ({
    partidas: document.getElementById("my-active-games").textContent.trim(),
    modalidades: document.querySelectorAll("#variant-grid > div").length,
    formulario: !!document.getElementById("teacher-view") && !document.getElementById("teacher-view").classList.contains("hidden"),
  }));
  igual("ve su partida contra el profesor", /Contra Karina Rojas/.test(v.partidas), "true");
  igual("y el catálogo de modalidades", v.modalidades > 5, "true");
  igual("sin el formulario del profesor", v.formulario, "false");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAlumnoSinPartidas(browser) {
  console.log("\n=== juegos.html · el aviso de 'espera a que te asignen' es solo del alumno ===");
  for (const [quien, esperado] of [["u-ana", "true"], ["u-profe", "false"]]) {
    const { page, ctx } = await pagina(browser, "/juegos.html", clienteFalso(DATOS_JUEGOS(3, []), quien));
    const hay = await page.evaluate(() => /Espera a que tu profesor/.test(document.getElementById("my-active-games").textContent));
    igual((quien === "u-ana" ? "al alumno" : "al profesor") + " se le dice", String(hay), esperado);
    await ctx.close();
  }
}

async function pruebaTorneos(browser) {
  console.log("\n=== torneos.html · quien organiza también se inscribe ===");
  const datos = { rpc: {}, tablas: { profiles: [PROFE, ANA, BRUNO, CARLA], tournaments: [TORNEO], tournament_registrations: [] } };
  const { page, ctx, errores } = await pagina(browser, "/torneos.html", clienteFalso(datos, "u-profe"));
  const botones = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tournament-list button")).map((b) => b.textContent));
  igual("el profesor ve el botón de inscribirse", botones.join(","), "Inscribirme");

  await page.click("#tournament-list button");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "tournament_registrations"), { timeout: 10000 });
  const fila = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "tournament_registrations").pop().fila);
  igual("y se inscribe a sí mismo", fila.player_id, "u-profe");
  igual("en ese torneo", fila.tournament_id, "t-1");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaTorneo(browser) {
  console.log("\n=== torneo.html · el botón ya no se le esconde al dueño ===");
  const datos = {
    rpc: {},
    tablas: {
      profiles: [PROFE, ANA, BRUNO, CARLA], tournaments: [TORNEO],
      tournament_registrations: [{ tournament_id: "t-1", player_id: "u-ana", registered_at: "2026-09-11T00:00:00Z" }],
      tournament_rounds: [], tournament_pairings: [],
    },
  };
  const { page, ctx, errores } = await pagina(browser, "/torneo.html?id=t-1", clienteFalso(datos, "u-profe"));
  const btn = await page.evaluate(() => {
    const b = document.getElementById("self-register-btn");
    return { escondido: b.classList.contains("hidden"), texto: b.textContent };
  });
  igual("el dueño ve el botón", btn.escondido, "false");
  igual("y dice Inscribirme", btn.texto, "Inscribirme");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaFormulario(browser);
    await pruebaUnSoloAlumno(browser);
    await pruebaPartidaPropia(browser);
    await pruebaAlumnoIntacto(browser);
    await pruebaAlumnoSinPartidas(browser);
    await pruebaTorneos(browser);
    await pruebaTorneo(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
