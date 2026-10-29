/* Comprueba la sala de arena (sala.html) como la vería un estudiante: entrar con
   su usuario y su clave, ver las arenas, esperar rival, jugar con el tablero y
   el reloj, ofrecer tablas, ver cómo termina la partida y que la bandera la
   cante la base.

   El cliente de la base es un doble puesto ANTES de cargar la página
   (`window.sbSala`; ver «Los dobles de Supabase»). Lo que se mira es lo que se
   MANDA —los argumentos de `arena_mover`, `arena_tablas`…— y lo que se VE, con
   `checkVisibility()`, no la clase ni el atributo:

     · entrar: usuario que se vuelve correo en minúsculas, clave mala, cuenta
       que no es de la sala (se cierra la sesión);
     · la lista de arenas y su botón según el estado de cada una;
     · la arena: la tabla de equipos y de jugadores con el propio resaltado, la
       racha 🔥 dicha también con texto, Jugar / Pausar y «todavía no empieza»;
     · la partida: el tablero se mira desde el color propio, las jugadas del
       rival llegan solas, una jugada tocada y una escrita («Cc6», en español)
       viajan con su SAN y su FEN, una ilegal no viaja, las tablas, el final
       con los puntos y la bandera;
     · en el celular, sin barra de desplazamiento horizontal y con el tablero
       cuadrado.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-sala.js                                */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

global.window = global;
const { Chess } = require(path.join(__dirname, "..", "js", "vendor", "chess.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + detalle : "")); fallos++; }
}
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  ok(nombre, a === b, "esperaba: " + b + "\n      salió:    " + a);
}

const g = new Chess();
const FEN = { inicial: g.fen() };
g.move("e4"); FEN.e4 = g.fen();
g.move("e5"); FEN.e5 = g.fen();
g.move("Nf3"); FEN.cf3 = g.fen();
const g2 = new Chess(FEN.cf3); g2.move("Nc6"); FEN.cc6 = g2.fen();

/* ---------------------------------------------------------- el doble de la base */
const DOBLE = `(() => {
  const ahora = Date.now();
  const B = window.__base = {
    usuarios: {
      "ana_r@sala.ajedrez-integral.com": { clave: "clave-ana", id: "u-ana" },
      "intruso@sala.ajedrez-integral.com": { clave: "clave-x", id: "u-x" },
    },
    sesion: null, llamadas: [], rivalListo: false, colorAna: "b", bandera: false,
    equipos: [{ id: "e1", nombre: "Equipo A" }, { id: "e2", nombre: "Equipo B" }],
    jugadores: [{ id: "u-ana", nombre: "Ana Rojas", equipo_id: "e1" }, { id: "u-bruno", nombre: "Bruno Mena", equipo_id: "e2" }],
    torneos: [
      { id: "t1", nombre: "Arena de prueba", inicia: new Date(ahora - 5 * 60000).toISOString(), minutos: 60, inicial_seg: 180, incremento_seg: 0, por_equipos: true, mejores: 5 },
      { id: "t2", nombre: "Arena de mañana", inicia: new Date(ahora + 3600000).toISOString(), minutos: 30, inicial_seg: 300, incremento_seg: 3, por_equipos: false, mejores: 5 },
      { id: "t3", nombre: "Arena de ayer", inicia: new Date(ahora - 86400000).toISOString(), minutos: 30, inicial_seg: 180, incremento_seg: 0, por_equipos: true, mejores: 5 },
    ],
    partidas: [],
    racha: ["u-bruno"],
    clasificacion: {
      jugadores: [
        { id: "u-bruno", nombre: "Bruno Mena", equipo_id: "e2", equipo: "Equipo B", puntos: 6, partidas: 3, victorias: 3 },
        { id: "u-ana", nombre: "Ana Rojas", equipo_id: "e1", equipo: "Equipo A", puntos: 2, partidas: 2, victorias: 1 },
      ],
      equipos: [{ id: "e2", nombre: "Equipo B", puntos: 6, jugadores: 1 }, { id: "e1", nombre: "Equipo A", puntos: 2, jugadores: 1 }],
    },
  };
  const clon = (x) => JSON.parse(JSON.stringify(x));
  const iso = () => new Date().toISOString();
  const TABLAS = { arena_jugadores: "jugadores", arena_equipos: "equipos", arena_torneos: "torneos", arena_partidas: "partidas" };

  function consulta(tabla) {
    const filas = B[TABLAS[tabla]] || [];
    const filtros = []; let unica = false, orden = null, tope = null;
    const b = {
      select() { return b; },
      eq(c, v) { filtros.push((f) => f[c] === v); return b; },
      or(txt) { const partes = txt.split(",").map((p) => p.split(".")); filtros.push((f) => partes.some((p) => f[p[0]] === p[2])); return b; },
      order(c, o) { orden = [c, !(o && o.ascending === false)]; return b; },
      limit(n) { tope = n; return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        let d = filas.filter((f) => filtros.every((p) => p(f)));
        if (orden) d = d.slice().sort((x, y) => (x[orden[0]] > y[orden[0]] ? 1 : -1) * (orden[1] ? 1 : -1));
        if (tope) d = d.slice(0, tope);
        d = clon(d);
        return Promise.resolve({ data: unica ? (d[0] || null) : d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  function cerrar(p, resultado, motivo, pb, pn) {
    p.estado = "terminada"; p.resultado = resultado; p.motivo = motivo; p.oferta_tablas = null;
    p.puntos_blancas = pb || 0; p.puntos_negras = pn || 0; p.terminada_en = iso();
  }
  const activa = () => B.partidas.filter((p) => p.estado === "en_juego").pop();
  const porId = (id) => B.partidas.find((p) => p.id === id);

  const rpcs = {
    hora_servidor_ms: () => Date.now(),
    arena_clasificacion: () => clon(B.clasificacion),
    arena_en_racha: () => B.racha,
    arena_salir: () => null,
    arena_entrar: () => {
      if (!B.rivalListo) return null;
      if (!activa()) {
        const n = B.partidas.length + 1;
        const blancas = B.colorAna === "w" ? "u-ana" : "u-bruno", negras = B.colorAna === "w" ? "u-bruno" : "u-ana";
        B.partidas.push({ id: "p" + n, torneo_id: "t1", blancas, negras, fen: ${JSON.stringify(FEN.inicial)}, jugadas: [], ms_blancas: 180000, ms_negras: 180000,
          reloj_desde: iso(), estado: "en_juego", resultado: null, motivo: null, oferta_tablas: null, puntos_blancas: 0, puntos_negras: 0, creada_en: iso(), terminada_en: null });
      }
      return activa().id;
    },
    arena_mover: (a) => {
      const p = porId(a.p_partida);
      p.jugadas.push({ s: a.p_san, f: a.p_desde, t: a.p_hasta });
      p.fen = a.p_fen; p.reloj_desde = iso(); p.oferta_tablas = null;
      if (a.p_fin === "mate") cerrar(p, p.fen.split(" ")[1] === "b" ? "1-0" : "0-1", "mate", 2, 0);
      return clon(p);
    },
    arena_bandera: (a) => {
      const p = porId(a.p_partida);
      if (B.bandera && p.estado === "en_juego") cerrar(p, p.blancas === "u-ana" ? "0-1" : "1-0", "tiempo", 0, 2);
      return clon(p);
    },
    arena_rendirse: (a) => { const p = porId(a.p_partida); cerrar(p, p.blancas === "u-ana" ? "0-1" : "1-0", "abandono", 0, 2); return clon(p); },
    arena_tablas: (a) => {
      const p = porId(a.p_partida); const color = p.blancas === "u-ana" ? "w" : "b";
      if (!p.oferta_tablas) p.oferta_tablas = color;
      else if (p.oferta_tablas !== color) { if (a.p_aceptar === false) p.oferta_tablas = null; else cerrar(p, "1/2-1/2", "acuerdo", 1, 1); }
      return clon(p);
    },
  };

  const oyentes = [];
  window.sbSala = {
    auth: {
      // La sesión sobrevive a recargar la página, como la de supabase-js (localStorage).
      getSession: async () => { try { B.sesion = JSON.parse(sessionStorage.getItem("__ses") || "null"); } catch (e) { B.sesion = null; } return { data: { session: B.sesion } }; },
      signInWithPassword: async (c) => {
        B.llamadas.push(["signIn", c.email]);
        const u = B.usuarios[c.email];
        if (!u || u.clave !== c.password) return { data: {}, error: { message: "Invalid login credentials" } };
        B.sesion = { access_token: "t", user: { id: u.id } };
        sessionStorage.setItem("__ses", JSON.stringify(B.sesion));
        return { data: { session: B.sesion, user: B.sesion.user }, error: null };
      },
      signOut: async () => { B.llamadas.push(["signOut"]); B.sesion = null; sessionStorage.removeItem("__ses"); oyentes.forEach((f) => f("SIGNED_OUT")); return { error: null }; },
      onAuthStateChange: (f) => { oyentes.push(f); return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from: (t) => consulta(t),
    rpc: (n, a) => {
      B.llamadas.push([n, a || {}]);
      try { return Promise.resolve({ data: rpcs[n] ? rpcs[n](a || {}) : null, error: null }); }
      catch (e) { return Promise.resolve({ data: null, error: { message: e.message } }); }
    },
    channel: () => { const c = { on() { return c; }, subscribe() { return c; } }; return c; },
    removeChannel() {},
  };
})();`;

async function abrir(browser, ancho, alto) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho || 1280, height: alto || 900 } });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.addInitScript(DOBLE);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/sala.html", { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

const visible = (page, sel) => page.$eval(sel, (e) => e.checkVisibility());
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
const llamadas = (page, nombre) => page.evaluate((n) => window.__base.llamadas.filter((l) => l[0] === n).map((l) => l[1]), nombre);
const cambiar = (page, fn, arg) => page.evaluate(fn, arg);

async function entrar(page) {
  await page.fill("#usuario", "Ana_R");
  await page.fill("#clave", "clave-ana");
  await page.click("#boton-entrar");
  await page.waitForSelector("#vista-lobby:not([hidden])", { timeout: 8000 });
}

async function pruebaEntrada(browser) {
  console.log("\n=== Entrar a la sala ===");
  const { page, ctx, errores } = await abrir(browser);
  ok("sin sesión se ve la pantalla de entrar y nada más", (await visible(page, "#vista-entrada")) && !(await visible(page, "#vista-lobby")) && !(await visible(page, "#vista-partida")));
  ok("no se ve el botón de Salir", !(await visible(page, "#salir")));

  await page.fill("#usuario", "Ana_R");
  await page.fill("#clave", "mala");
  await page.click("#boton-entrar");
  await page.waitForSelector("#error-entrada:not([hidden])");
  igual("una clave mala se dice sin decir cuál de las dos falló", await texto(page, "#error-entrada"), "Usuario o clave incorrectos.");
  ok("el aviso de error se lee en voz (role=alert)", (await page.getAttribute("#error-entrada", "role")) === "alert");
  igual("el usuario se vuelve un correo en minúsculas", (await llamadas(page, "signIn"))[0], "ana_r@sala.ajedrez-integral.com");

  await page.fill("#usuario", "intruso");
  await page.fill("#clave", "clave-x");
  await page.click("#boton-entrar");
  await page.waitForFunction(() => /no es de la sala/.test(document.getElementById("error-entrada").textContent));
  ok("una cuenta que no es de la sala no entra y se le cierra la sesión", (await llamadas(page, "signOut")).length === 1 && (await visible(page, "#vista-entrada")));

  await page.fill("#usuario", "Ana_R");
  await page.fill("#clave", "clave-ana");
  await page.click("#boton-entrar");
  await page.waitForSelector("#vista-lobby:not([hidden])");
  igual("entra y saluda", await texto(page, "#saludo"), "Hola, Ana Rojas");
  ok("ya se ve Salir", await visible(page, "#salir"));
  igual("dice de qué equipo es", await texto(page, "#lobby-equipo"), "Tu equipo: Equipo A.");
  ok("la clave escrita se borra del campo", (await page.inputValue("#clave")) === "");
  const botones = await page.$$eval("#lista-torneos button", (bs) => bs.map((b) => b.textContent.trim()));
  const tarjetas = await page.$$eval("#lista-torneos h2", (hs) => hs.map((h) => h.textContent.trim()));
  igual("las arenas salen de la más nueva a la más vieja", tarjetas, ["Arena de mañana", "Arena de prueba", "Arena de ayer"]);
  igual("el botón de cada arena depende de su estado", botones, ["Ver la arena", "Entrar a la arena", "Ver resultados"]);
  const estados = await page.$$eval("#lista-torneos .font-semibold.text-sm", (ps) => ps.map((p) => p.textContent.trim()));
  ok("cada arena dice en palabras si va, no empieza o terminó", estados.includes("En curso ahora") && estados.includes("Todavía no empieza") && estados.includes("Terminó"), JSON.stringify(estados));

  // Recargar con la sesión guardada: no pide entrar otra vez.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#vista-lobby:not([hidden])");
  ok("con la sesión guardada, recargar no pide la clave otra vez", !(await visible(page, "#vista-entrada")));

  await page.click("#salir");
  await page.waitForSelector("#vista-entrada:not([hidden])");
  ok("Salir cierra la sesión y vuelve a pedir la clave", (await llamadas(page, "signOut")).length === 1 && !(await visible(page, "#salir")));
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaArena(browser) {
  console.log("\n=== Una arena ===");
  const { page, ctx, errores } = await abrir(browser);
  await entrar(page);
  await page.click('#lista-torneos button[aria-label="Entrar a la arena: Arena de prueba"]');
  await page.waitForSelector("#vista-arena:not([hidden])");
  igual("el título es el de la arena", await texto(page, "#h-arena"), "Arena de prueba");
  ok("el título recibe el foco (quien usa lector de pantalla sabe dónde está)", await page.evaluate(() => document.activeElement.id === "h-arena"));
  ok("el reloj dice cuánto queda", /^Quedan \d+:\d\d$/.test(await texto(page, "#arena-reloj")), await texto(page, "#arena-reloj"));
  await page.waitForFunction(() => document.querySelectorAll("#tabla-equipos tr").length === 2);
  const equipos = await page.$$eval("#tabla-equipos tr", (rs) => rs.map((r) => Array.from(r.children).map((c) => c.textContent.trim())));
  igual("la tabla de equipos va del que más puntos tiene al que menos y marca el propio", equipos, [["1", "Equipo B", "6"], ["2", "Equipo A (tu equipo)", "2"]]);
  const jugadores = await page.$$eval("#tabla-jugadores tr", (rs) => rs.map((r) => r.textContent.replace(/\s+/g, " ").trim()));
  ok("el jugador en racha lleva 🔥 y también lo dice con texto", /Bruno Mena 🔥 en racha/.test(jugadores[0]), jugadores[0]);
  ok("el propio se marca con «(tú)»", /Ana Rojas \(tú\)/.test(jugadores[1]), jugadores[1]);
  ok("la tabla de equipos se ve en una arena por equipos", await visible(page, "#card-equipos"));
  igual("Jugar está habilitado", [await texto(page, "#btn-jugar"), await page.isDisabled("#btn-jugar")], ["Jugar", false]);

  await page.click("#btn-jugar");
  await page.waitForFunction(() => document.getElementById("btn-jugar").textContent === "Pausar");
  ok("al jugar dice que busca rival", /Buscando rival/.test(await texto(page, "#arena-aviso")));
  igual("pide entrar a ESA arena", (await llamadas(page, "arena_entrar"))[0], { p_torneo: "t1" });
  await page.click("#btn-jugar");
  await page.waitForFunction(() => document.getElementById("btn-jugar").textContent === "Jugar");
  igual("Pausar saca de la cola", (await llamadas(page, "arena_salir")).pop(), { p_torneo: "t1" });

  await page.click("#volver-lobby");
  await page.waitForSelector("#vista-lobby:not([hidden])");
  await page.click('#lista-torneos button[aria-label="Ver la arena: Arena de mañana"]');
  await page.waitForSelector("#vista-arena:not([hidden])");
  ok("una arena que no empezó no se puede jugar", await page.isDisabled("#btn-jugar"));
  ok("y lo dice", /Todavía no empieza/.test(await texto(page, "#arena-aviso")));
  ok("empieza en…", /^Empieza en \d+:\d\d(:\d\d)?$/.test(await texto(page, "#arena-reloj")), await texto(page, "#arena-reloj"));
  ok("una arena individual no muestra la tabla de equipos", !(await visible(page, "#card-equipos")));
  await page.click("#volver-lobby");
  await page.waitForSelector("#vista-lobby:not([hidden])");
  await page.click('#lista-torneos button[aria-label="Ver resultados: Arena de ayer"]');
  await page.waitForSelector("#vista-arena:not([hidden])");
  ok("una arena que terminó no se puede jugar y lo dice", (await page.isDisabled("#btn-jugar")) && /terminó/.test(await texto(page, "#arena-aviso")) && (await texto(page, "#arena-reloj")) === "Terminó");
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

const casilla = (page, sq) => page.locator('#tablero [data-square="' + sq + '"]');
async function clic(page, desde, hasta) { await casilla(page, desde).click(); await casilla(page, hasta).click(); }

/* Lo que hace el rival: se escribe en la «base» y la página lo recibe al releer. */
const jugarRival = (page, o) => page.evaluate((o) => {
  const p = window.__base.partidas[0];
  p.jugadas.push({ s: o.san, f: o.desde, t: o.hasta }); p.fen = o.fen; p.reloj_desde = new Date().toISOString();
}, o);

async function pruebaPartida(browser) {
  console.log("\n=== Una partida ===");
  const { page, ctx, errores } = await abrir(browser);
  await entrar(page);
  await page.click('#lista-torneos button[aria-label="Entrar a la arena: Arena de prueba"]');
  await page.waitForSelector("#vista-arena:not([hidden])");
  await page.click("#btn-jugar");
  await cambiar(page, () => { window.__base.rivalListo = true; });
  await page.waitForSelector("#vista-partida:not([hidden])", { timeout: 10000 });
  ok("al emparejarlo, la página pasa sola a la partida", !(await visible(page, "#vista-arena")));
  igual("el rival", [await texto(page, "#nombre-rival"), await texto(page, "#equipo-rival")], ["Bruno Mena", "· Equipo B"]);
  igual("yo", [await texto(page, "#nombre-yo"), await texto(page, "#equipo-yo")], ["Ana Rojas (tú)", "· Equipo A"]);
  igual("con negras el tablero se mira desde las negras (la primera casilla es h1)", await page.$eval("#tablero [data-square]", (b) => b.dataset.square), "h1");
  igual("el reloj propio arranca en 3:00", await texto(page, "#reloj-yo"), "3:00");
  igual("de quién es el turno", await texto(page, "#turno"), "Es el turno de Bruno Mena.");
  ok("no es mi turno: el tablero no responde", await page.$eval("#tablero", (t) => t.classList.contains("sin-turno")));
  await casilla(page, "e7").click();
  ok("tocar una pieza fuera de turno no la selecciona", (await page.$$("#tablero .selected")).length === 0);
  ok("los botones de tablas y rendirse se ven", (await visible(page, "#btn-tablas")) && (await visible(page, "#btn-rendirse")));

  // Llega la jugada del rival.
  await jugarRival(page, { san: "e4", desde: "e2", hasta: "e4", fen: FEN.e4 });
  await page.waitForFunction(() => document.getElementById("turno").textContent.indexOf("Es tu turno") === 0, null, { timeout: 8000 });
  igual("la jugada del rival llega sola y dice el plazo de la primera jugada", await texto(page, "#turno"), "Es tu turno: tienes 30 segundos para esta jugada.");
  ok("el peón aparece en e4", (await casilla(page, "e4").locator("span").count()) === 1);
  ok("la casilla de la última jugada se marca", (await page.$$("#tablero .last")).length === 2);
  igual("se anuncia para quien no ve el tablero", await texto(page, "#anuncio"), "Bruno Mena jugó e4.");
  igual("la lista de jugadas", await texto(page, "#lista-jugadas"), "1. e4");
  const etiqueta = await casilla(page, "e4").getAttribute("aria-label");
  ok("cada casilla se lee con su pieza y su estado", etiqueta === "e4, peón blanco, de la última jugada", etiqueta);
  ok("y una casilla vacía también", (await casilla(page, "e5").getAttribute("aria-label")) === "e5, vacía");

  // Una jugada ilegal no viaja.
  await casilla(page, "e7").click();
  ok("tocar mi peón lo selecciona", (await page.$$("#tablero .selected")).length === 1);
  ok("y marca adónde puede ir", (await page.$$("#tablero .target")).length === 2);
  await casilla(page, "e4").click();
  ok("una casilla a la que no puede ir no manda nada", (await llamadas(page, "arena_mover")).length === 0);

  // La jugada tocada.
  await casilla(page, "e5").click();
  await page.waitForFunction(() => window.__base.llamadas.some((l) => l[0] === "arena_mover"));
  const mover = (await llamadas(page, "arena_mover"))[0];
  igual("la jugada tocada manda de dónde a dónde, su SAN, la posición y que no acaba la partida",
    mover, { p_partida: "p1", p_desde: "e7", p_hasta: "e5", p_san: "e5", p_fen: FEN.e5, p_fin: null });
  await page.waitForFunction(() => document.getElementById("turno").textContent.indexOf("Es el turno de") === 0);
  igual("tras mover, el turno pasa al rival", await texto(page, "#turno"), "Es el turno de Bruno Mena.");
  igual("las jugadas, en español", await texto(page, "#lista-jugadas"), "1. e4 e5");

  // La jugada escrita, en español: Cc6 (caballo).
  await jugarRival(page, { san: "Nf3", desde: "g1", hasta: "f3", fen: FEN.cf3 });
  await page.waitForFunction(() => document.getElementById("turno").textContent.indexOf("Es tu turno") === 0, null, { timeout: 8000 });
  igual("el SAN del rival se lee en español (Cf3, no Nf3)", await texto(page, "#lista-jugadas"), "1. e4 e5 2. Cf3");
  await page.fill("#jugada", "Zz9");
  await page.click("#form-jugada button");
  ok("una jugada que no se entiende lo dice y no manda nada", (await visible(page, "#jugada-error")) && (await llamadas(page, "arena_mover")).length === 1);
  await page.fill("#jugada", "Cc6");
  await page.click("#form-jugada button");
  await page.waitForFunction(() => window.__base.llamadas.filter((l) => l[0] === "arena_mover").length === 2);
  const escrita = (await llamadas(page, "arena_mover"))[1];
  igual("«Cc6» viaja como Nc6 con su posición", [escrita.p_desde, escrita.p_hasta, escrita.p_san, escrita.p_fen], ["b8", "c6", "Nc6", FEN.cc6]);
  ok("el campo se vacía", (await page.inputValue("#jugada")) === "");

  // Tablas: yo ofrezco; luego el rival ofrece y las rechazo.
  await page.click("#btn-tablas");
  await page.waitForFunction(() => document.getElementById("btn-tablas").textContent === "Tablas ofrecidas…");
  ok("ofrecer tablas lo manda y deja el botón apagado", (await llamadas(page, "arena_tablas")).length === 1 && (await page.isDisabled("#btn-tablas")));
  await cambiar(page, () => { window.__base.partidas[0].oferta_tablas = "w"; });
  await page.waitForSelector("#oferta:not([hidden])", { timeout: 8000 });
  ok("la oferta del rival se ve y se anuncia en voz (role=alert)", (await visible(page, "#oferta")) && (await page.getAttribute("#oferta", "role")) === "alert");
  await page.click("#rechazar-tablas");
  await page.waitForFunction(() => window.__base.llamadas.filter((l) => l[0] === "arena_tablas").length === 2);
  igual("rechazar las tablas lo dice con p_aceptar false", (await llamadas(page, "arena_tablas"))[1], { p_partida: "p1", p_aceptar: false });
  await page.waitForSelector("#oferta[hidden]", { state: "attached", timeout: 8000 });

  // El final: el rival se rinde y suma puntos.
  await cambiar(page, () => {
    const p = window.__base.partidas[0];
    p.estado = "terminada"; p.resultado = "0-1"; p.motivo = "abandono"; p.puntos_negras = 2; p.jugadas.push({ s: "Cg1", f: "f3", t: "g1" });
  });
  await page.waitForSelector("#resultado:not([hidden])", { timeout: 8000 });
  igual("al terminar dice quién ganó, cómo y los puntos", [await texto(page, "#resultado-titulo"), await texto(page, "#resultado-detalle")], ["¡Ganaste!", "Ganaste por abandono. Sumaste 2 puntos."]);
  ok("los controles de la partida se esconden", !(await visible(page, "#controles")));
  ok("el foco va al resultado", await page.evaluate(() => document.activeElement.id === "resultado-titulo"));
  ok("el tablero ya no responde", await page.$eval("#tablero", (t) => t.classList.contains("sin-turno")));
  ok("«Jugar otra» se ofrece porque la arena sigue", await visible(page, "#otra-partida"));
  await cambiar(page, () => { window.__base.partidas[0].estado = "terminada"; });

  // Jugar otra: vuelve a la arena y busca.
  await page.click("#otra-partida");
  await page.waitForFunction(() => window.__base.llamadas.filter((l) => l[0] === "arena_entrar").length >= 2, null, { timeout: 8000 });
  await page.waitForSelector("#vista-partida:not([hidden])", { timeout: 10000 });
  ok("«Jugar otra» busca y entra a la partida siguiente", (await texto(page, "#h-partida")) === "Tu partida" && (await casilla(page, "e2").count()) === 1);
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaBandera(browser) {
  console.log("\n=== El reloj y la bandera ===");
  const { page, ctx, errores } = await abrir(browser);
  await cambiar(page, () => { window.__base.colorAna = "w"; window.__base.rivalListo = true; });
  await entrar(page);
  await page.click('#lista-torneos button[aria-label="Entrar a la arena: Arena de prueba"]');
  await page.waitForSelector("#vista-arena:not([hidden])");
  await page.click("#btn-jugar");
  await page.waitForSelector("#vista-partida:not([hidden])", { timeout: 10000 });
  igual("con blancas se mira desde la fila 8 (la primera casilla es a8)", await page.$eval("#tablero [data-square]", (b) => b.dataset.square), "a8");
  ok("con el turno propio el tablero responde", !(await page.$eval("#tablero", (t) => t.classList.contains("sin-turno"))));
  // Se le acabó el tiempo a quien tiene el turno: la página se lo avisa a la base, que decide.
  await cambiar(page, () => {
    const p = window.__base.partidas[0];
    p.jugadas = [{ s: "e4", f: "e2", t: "e4" }, { s: "e5", f: "e7", t: "e5" }];
    p.fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
    p.ms_blancas = 1000; p.reloj_desde = new Date(Date.now() - 5000).toISOString();
    window.__base.bandera = true;
  });
  await page.waitForFunction(() => window.__base.llamadas.some((l) => l[0] === "arena_bandera"), null, { timeout: 10000 });
  igual("la página canta la bandera con el id de la partida", (await llamadas(page, "arena_bandera"))[0], { p_partida: "p1" });
  await page.waitForSelector("#resultado:not([hidden])", { timeout: 8000 });
  igual("la partida perdida por tiempo se dice", [await texto(page, "#resultado-titulo"), await texto(page, "#resultado-detalle")], ["Perdiste", "Perdiste por tiempo. Esta partida no suma puntos."]);
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaCelular(browser) {
  console.log("\n=== En el celular ===");
  const { page, ctx, errores } = await abrir(browser, 390, 800);
  await cambiar(page, () => { window.__base.rivalListo = true; });
  await entrar(page);
  const sinBarra = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok("el lobby no se desborda a los lados", await sinBarra());
  await page.click('#lista-torneos button[aria-label="Entrar a la arena: Arena de prueba"]');
  await page.waitForSelector("#vista-arena:not([hidden])");
  await page.waitForFunction(() => document.querySelectorAll("#tabla-jugadores tr").length === 2);
  ok("la arena no se desborda a los lados", await sinBarra());
  await page.click("#btn-jugar");
  await page.waitForSelector("#vista-partida:not([hidden])", { timeout: 10000 });
  ok("la partida no se desborda a los lados", await sinBarra());
  const caja = await page.$eval("#tablero", (t) => { const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), filas: getComputedStyle(t).gridTemplateRows.split(" ").length }; });
  ok("el tablero sale cuadrado y con ocho filas", Math.abs(caja.w - caja.h) <= 1 && caja.filas === 8, JSON.stringify(caja));
  ok("cabe en el ancho de la pantalla", caja.w <= 390, JSON.stringify(caja));
  const filas = await page.$eval("#tablero", (t) => getComputedStyle(t).gridTemplateRows.split(" ").map((x) => parseFloat(x)));
  ok("las ocho filas miden lo mismo (ninguna se estira por la pieza)", Math.max.apply(null, filas) - Math.min.apply(null, filas) <= 1, JSON.stringify(filas));
  ok("sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaEntrada(browser);
    await pruebaArena(browser);
    await pruebaPartida(browser);
    await pruebaBandera(browser);
    await pruebaCelular(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\n✓ todo bien");
  process.exit(fallos ? 1 : 0);
})();
