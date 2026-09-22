/* Comprueba, en un navegador de verdad, que las TRES páginas de Juegos se
   puedan jugar sin ver la pantalla: estandar.html, niebla.html y tablero.html.

   Existe porque todo lo que se rompe acá se rompe callado y no lo ve ningún
   otro verificador — estandar.html y niebla.html están detrás del login y de
   una sala, así que verificar-css.js no las abre nunca, y lo que se mide no es
   si la página "funciona" sino si se puede usar a ciegas:

     · un tablero con las 64 casillas tabbables se ve perfecto y cuesta sesenta
       y cinco Tab llegar al botón de abajo;
     · un tablero con rol de grupo se ve perfecto y NVDA y JAWS se quedan con
       todas las teclas de una letra, así que ningún atajo llega nunca;
     · un interruptor que guarda la preferencia sin encender la clase del <html>
       se marca como activado y deja la mitad del modo apagada;
     · y una casilla que la niebla tapa, contestada como "vacía", es información
       falsa dicha con total aplomo — y encima distinta de lo que el tablero
       visual enseña con su 🌫️.

   Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
         npm install playwright chess.js@0.10.3
         node herramientas/verificar-juegos-accesible.js                       */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

/* chess.js llega por CDN en la página; acá se sirve el de node_modules, igual
   que en el resto de los verificadores. Sin él las páginas de partida se quedan
   en "Cargando…" y esta prueba no mediría nada. */
let CHESSJS = null;
for (const base of (module.paths || []).concat([path.join(RAIZ, "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (fs.existsSync(f)) { CHESSJS = fs.readFileSync(f, "utf8"); break; }
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }

const ANA   = { id: "u-ana",   full_name: "Ana Rojas",  email: "ana@x.cr",   role: "alumno", is_admin: false };
const BRUNO = { id: "u-bruno", full_name: "Bruno Mena", email: "bruno@x.cr", role: "alumno", is_admin: false };
const PERFILES = [ANA, BRUNO];

const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/* Después de 1.e4 d5 2.Cf3, con las negras para mover. Elegida a propósito: el
   peón blanco de e4 VE el peón negro de d5 (lo vigila en diagonal), así que hay
   una pieza del rival a la vista sobre la que preguntar — y es el turno del
   rival, que es cuando contar sus jugadas sería la fuga. */
const CON_PIEZA_RIVAL_A_LA_VISTA = "rnbqkbnr/ppp1pppp/8/3p4/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";

function sala(id, variant, fen) {
  return {
    id, variant, white_id: "u-ana", black_id: "u-bruno", status: "playing", result: null,
    moves: [], fen, initial_seconds: 600, increment_seconds: 0,
    white_time_left: 600, black_time_left: 600, clock_updated_at: null,
    white_ready: true, black_ready: true, created_by: "u-profe",
  };
}

/* El modo se deja elegido ANTES de cargar, porque cada página lo lee al
   arrancar. Va aparte del Supabase de mentira a propósito: tablero.html no
   necesita ninguna sala, y atarlo al doble dejaba esa página abriéndose siempre
   en modo normal — la prueba se quedaba esperando un recuadro que nunca se
   destapa, que es exactamente el fallo que vino a buscar. */
function preferencias(modoAdaptado) {
  return `
try { localStorage.setItem("oscarBlindMode_v1", ${modoAdaptado ? '"1"' : '"0"'}); } catch (e) {}
/* La ayuda de tablero.html se anuncia sola la primera vez por navegador, y ese
   anuncio pisa la región viva que esta prueba mide. Se marca como ya vista. */
try { localStorage.setItem("oscarMoveHelpShown_v1", "1"); } catch (e) {}
`;
}

function doble(datos, usuarioId) {
  return `
window.__consultas = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};
  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, resultado = null;
    const cmp = (a, b) => String(a) === String(b);
    const b = {
      select() { window.__consultas.push(tabla); return b; },
      eq(col, val) { filas2 = filas2.filter((r) => cmp(r[col], val)); return b; },
      neq(col, val) { filas2 = filas2.filter((r) => !cmp(r[col], val)); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => (vals || []).some((v) => cmp(r[col], v))); return b; },
      is() { return b; }, not() { return b; }, or() { return b; },
      order() { return b; }, limit(n) { filas2 = filas2.slice(0, n); return b; }, range() { return b; },
      insert(fila) { resultado = fila; return b; },
      update(fila) { resultado = fila; return b; },
      delete() { resultado = null; return b; },
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
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t, DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : []),
    rpc: (n, args) => {
      if (n === "nombres_de_jugadores") {
        const pedidos = (args && args.p_ids) || [];
        return constructor(n, (DATOS.tablas.profiles || [])
          .filter((p) => pedidos.indexOf(p.id) >= 0)
          .map((p) => ({ id: p.id, nombre: p.full_name })));
      }
      return constructor(n, []);
    },
    channel: () => {
      const c = {
        on() { return c; }, subscribe(cb) { if (cb) cb("SUBSCRIBED"); return c; },
        track() { return Promise.resolve(); }, presenceState() { return {}; },
      };
      return c;
    },
    removeChannel: () => {},
  };
})();
`;
}

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : ""));
}
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  ok(nombre + " (" + b + ")", a === b, a);
}

async function abrir(browser, url, datos, usuarioId, modoAdaptado) {
  const ctx = await browser.newContext();
  await ctx.route("**/cdnjs.cloudflare.com/**/chess*.js",
    (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.addInitScript(preferencias(modoAdaptado));
  if (datos) await ctx.addInitScript(doble(datos, usuarioId));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + url);
  await page.waitForTimeout(1600);
  return { ctx, page, errores };
}

/* Lo que se acaba de decir por la región viva del tablero. Es lo que oye quien
   usa lector de pantalla, y por eso se mide eso y no una variable interna: una
   prueba que espiara el estado daría verde sobre una página que no dice nada. */
async function loQueDijoElTablero(page) {
  return (await page.evaluate(() => {
    const p = document.querySelector(".ta-dice");
    return p ? p.textContent : "";
  })) || "";
}
async function loQueDijoElRecuadro(page) {
  return (await page.evaluate(() => {
    const p = document.getElementById("move-input-status");
    return p ? p.textContent : "";
  })) || "";
}
async function escribir(page, texto) {
  await page.fill("#move-input", texto);
  await page.press("#move-input", "Enter");
  await page.waitForTimeout(250);
}

// ============================================================ 1. las tres páginas
const PAGINAS = [
  { nombre: "estandar.html", url: "/estandar.html?room=r1", tablero: "#board",
    datos: { tablas: { game_rooms: [sala("r1", "estandar", INICIAL)], profiles: PERFILES } } },
  { nombre: "niebla.html", url: "/niebla.html?room=r1", tablero: "#board",
    datos: { tablas: { game_rooms: [sala("r1", "niebla", INICIAL)], profiles: PERFILES } } },
  { nombre: "tablero.html", url: "/tablero.html", tablero: "#chessboard", datos: null },
];

async function pruebaLaRegionVivaYElInterruptor(browser) {
  console.log("\n▶ La región viva, el interruptor y el rol del tablero");

  for (const pag of PAGINAS) {
    console.log("  — " + pag.nombre);
    // Se abre en modo NORMAL a propósito: lo que se mide es que el interruptor
    // de la página encienda el modo entero, no que ya estuviera encendido.
    const { ctx, page, errores } = await abrir(browser, pag.url, pag.datos, "u-ana", false);
    igual("    carga sin errores de JavaScript", errores.length, 0);

    const antes = await page.evaluate((sel) => {
      const st = document.getElementById("move-input-status");
      const bo = document.querySelector(sel);
      return {
        rol: st ? st.getAttribute("role") : null,
        live: st ? st.getAttribute("aria-live") : null,
        rolTablero: bo ? bo.getAttribute("role") : null,
        claseHtml: document.documentElement.classList.contains("adaptive-mode"),
      };
    }, pag.tablero);

    /* Las dos cosas juntas se contradicen: `role="status"` ya vale por una
       región viva cortés y "assertive" manda interrumpir. JAWS corta con eso la
       frase que venía leyendo y VoiceOver a veces directamente no lo lee. */
    igual("    el aviso va con role=status", antes.rol, "status");
    ok("    y SIN aria-live encima", antes.live === null, antes.live);
    igual("    fuera del modo, el tablero es un grupo", antes.rolTablero, "group");
    igual("    y la clase del <html> está apagada", antes.claseHtml, false);

    await page.click("#mode-blind-btn");
    await page.waitForTimeout(350);

    const despues = await page.evaluate((sel) => {
      const bo = document.querySelector(sel);
      const inp = document.getElementById("move-input");
      return {
        claseHtml: document.documentElement.classList.contains("adaptive-mode"),
        rolTablero: bo ? bo.getAttribute("role") : null,
        recuadroVisible: !!(inp && inp.checkVisibility()),
      };
    }, pag.tablero);

    /* El interruptor de la página escribía la preferencia y NO encendía la clase
       del <html>: el botón se marcaba como activado y todo lo que cuelga de esa
       clase —el contraste, el tamaño de letra, los atajos— seguía apagado hasta
       recargar. No daba ningún error. */
    igual("    el interruptor enciende la clase del <html>", despues.claseHtml, true);
    /* Con rol de grupo, NVDA y JAWS están en modo lectura y se quedan ellos con
       las teclas de una letra ("p" es "párrafo siguiente"), así que ni un atajo
       llega al tablero — y quien los intenta no tiene forma de saber por qué. */
    igual("    y el tablero pasa a anunciarse como application", despues.rolTablero, "application");
    ok("    el recuadro para escribir se ve de verdad", despues.recuadroVisible === true, despues);

    /* Y al revés: el interruptor del encabezado, otra pestaña o la detección
       automática encienden el modo sin pasar por el botón de esta página. */
    await page.click("#mode-normal-btn");
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      document.documentElement.classList.add("adaptive-mode");
      document.dispatchEvent(new CustomEvent("adaptivemode:change", { detail: { activo: true } }));
    });
    await page.waitForTimeout(350);
    const deFuera = await page.evaluate((sel) => ({
      recuadroVisible: (() => { const i = document.getElementById("move-input"); return !!(i && i.checkVisibility()); })(),
      rolTablero: (document.querySelector(sel) || {}).getAttribute ? document.querySelector(sel).getAttribute("role") : null,
    }), pag.tablero);
    ok("    encendido desde fuera, la página se entera", deFuera.recuadroVisible === true, deFuera);
    igual("    y el tablero cambia de rol también así", deFuera.rolTablero, "application");

    await ctx.close();
  }
}

// ================================= 2. los tableros de partida, con el teclado
async function pruebaElTeclado(browser) {
  console.log("\n▶ El tablero se recorre con el teclado (estandar y niebla)");

  for (const pag of PAGINAS.filter((p) => p.datos)) {
    console.log("  — " + pag.nombre);
    const { ctx, page, errores } = await abrir(browser, pag.url, pag.datos, "u-ana", true);
    igual("    carga sin errores de JavaScript", errores.length, 0);

    const t = await page.evaluate((sel) => {
      const cs = Array.from(document.querySelectorAll(sel + " [data-square]"));
      return {
        casillas: cs.length,
        paradas: cs.filter((c) => c.tabIndex === 0).length,
        mudas: cs.filter((c) => !(c.getAttribute("aria-label") || "").trim()).length,
        distintas: new Set(cs.map((c) => c.getAttribute("aria-label"))).size,
        ejemplo: (cs.find((c) => c.dataset.square === "e2") || {}).getAttribute
          ? document.querySelector(sel + ' [data-square="e2"]').getAttribute("aria-label") : null,
      };
    }, pag.tablero);

    igual("    el tablero tiene sus 64 casillas", t.casillas, 64);
    /* Es un número: o está bien o no. Con las 64 tabbables, pasar del tablero al
       botón de abajo costaba sesenta y cinco Tab — nadie hace eso. */
    igual("    y UNA sola parada de tabulador", t.paradas, 1);
    igual("    ninguna casilla queda muda", t.mudas, 0);
    /* 64 casillas diciendo todas "Casilla" es tan inservible como 64 mudas, y se
       ve exactamente igual de bien. */
    ok("    y no dicen todas lo mismo", t.distintas >= 8, t.distintas);
    /* Las columnas se dicen "eva 4" y no "e4": "b4" y "v4" suenan igual leídos
       en voz alta, y equivocarse de columna es equivocarse de jugada. */
    ok("    la columna va hablada, no deletreada", /eva/i.test(t.ejemplo || ""), t.ejemplo);

    // Las flechas mueven el foco DE VERDAD: un keydown declarado que no mueve
    // nada se ve exactamente igual que un tablero que sí se recorre.
    await page.focus(pag.tablero + ' [data-square="a1"]');
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
    const tras = await page.evaluate(() => (document.activeElement || {}).dataset
      ? document.activeElement.dataset.square : null);
    ok("    la flecha derecha mueve el foco a la casilla de al lado", tras && tras !== "a1", tras);

    /* Y la jugada se puede hacer ENTERA con el teclado: llegar a la pieza con las
       flechas, elegirla con Intro y soltarla en su destino. Es el camino por el
       que se juega sin ver, y con el teclado montado encima del tablero había que
       comprobar que Intro siga llegando al clic de la casilla. */
    await page.focus(pag.tablero + ' [data-square="g1"]');
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    await page.focus(pag.tablero + ' [data-square="f3"]');
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const conTeclado = await page.evaluate((sel) =>
      (document.querySelector(sel + ' [data-square="f3"]') || {}).getAttribute("aria-label") || "", pag.tablero);
    ok("    una jugada entera se puede hacer con el teclado", /caballo/i.test(conTeclado), conTeclado);

    await ctx.close();
  }

  /* Y el ratón sigue funcionando igual: montar un teclado encima del tablero no
     puede costarle la partida a quien juega con el ratón, y eso tampoco daría
     ningún error — las casillas se pintarían igual y no pasaría nada al tocarlas. */
  console.log("  — el ratón sigue jugando igual");
  const pag = PAGINAS[0];
  const { ctx, page } = await abrir(browser, pag.url, pag.datos, "u-ana", false);
  await page.click(pag.tablero + ' [data-square="e2"]');
  await page.waitForTimeout(150);
  await page.click(pag.tablero + ' [data-square="e4"]');
  await page.waitForTimeout(400);
  const conRaton = await page.evaluate((sel) =>
    (document.querySelector(sel + ' [data-square="e4"]') || {}).getAttribute("aria-label") || "", pag.tablero);
  ok("    dos clics mueven la pieza", /pe[oó]n/i.test(conRaton), conRaton);
  await ctx.close();
}

// ================================== 3. al tablero se le puede PREGUNTAR
async function pruebaLasPreguntas(browser) {
  console.log("\n▶ Al tablero se le puede preguntar");

  for (const pag of PAGINAS) {
    console.log("  — " + pag.nombre);
    const { ctx, page } = await abrir(browser, pag.url, pag.datos, "u-ana", true);

    await escribir(page, "caballos");
    const caballos = await loQueDijoElRecuadro(page);
    ok("    «caballos» contesta dónde están", /caballo/i.test(caballos) && /bella|gustav/i.test(caballos), caballos);

    await escribir(page, "que hay en e2");
    const casilla = await loQueDijoElRecuadro(page);
    ok("    «qué hay en e2» contesta la casilla", /pe[oó]n/i.test(casilla), casilla);

    /* Una jugada NO es una pregunta: quedarse con todo dejaría "Ra1" leído como
       la pregunta por el rey, y la jugada no se haría nunca. */
    await escribir(page, "e4");
    await page.waitForTimeout(400);
    const trasJugada = await page.evaluate((sel) => {
      const c = document.querySelector(sel + ' [data-square="e4"]');
      return (c ? c.getAttribute("aria-label") : "") || "";
    }, pag.tablero);
    ok("    una jugada escrita se JUEGA, no se lee como pregunta",
      /pe[oó]n/i.test(trasJugada), trasJugada);

    await ctx.close();
  }
}

// ============================================ 4. la niebla no se puede escapar
async function pruebaLaNiebla(browser) {
  console.log("\n▶ Niebla de Guerra: lo que no se ve, no se cuenta");

  const datos = { tablas: { game_rooms: [sala("r1", "niebla", INICIAL)], profiles: PERFILES } };
  const { ctx, page } = await abrir(browser, "/niebla.html?room=r1", datos, "u-ana", true);

  /* En la posición inicial, las blancas ven las filas 1 a 4 y nada más: sus
     piezas, lo que vigilan sus peones y las casillas del salto doble. Todo lo
     negro queda tapado. */
  await escribir(page, "que hay en e8");
  const tapada = await loQueDijoElRecuadro(page);
  ok("una casilla con niebla NO se contesta como «vacía»", !/vac[ií]a/i.test(tapada), tapada);
  ok("se dice que está cubierta por la niebla", /niebla/i.test(tapada), tapada);

  await escribir(page, "posicion");
  const posicion = await loQueDijoElRecuadro(page);
  ok("la posición no cuenta ni una pieza negra", !/negras: (?!sin piezas)/i.test(posicion), posicion);
  ok("y avisa de que es solo lo que ves", /solo lo que ves/i.test(posicion), posicion);

  await escribir(page, "torres");
  const torres = await loQueDijoElRecuadro(page);
  ok("«torres» solo cuenta las que ves", !/negr/i.test(torres), torres);

  /* La marca del tablero también: el rótulo de una casilla con niebla no puede
     decir "vacía" — es la misma mentira, dicha por el otro camino. */
  const rotulo = await page.evaluate(() =>
    (document.querySelector('#board [data-square="e8"]') || {}).getAttribute("aria-label"));
  ok("y el rótulo de esa casilla tampoco dice «vacía»", /niebla/i.test(rotulo || ""), rotulo);

  await ctx.close();

  // ---- una pieza del rival A LA VISTA, en el turno del rival
  const datos2 = { tablas: { game_rooms: [sala("r1", "niebla", CON_PIEZA_RIVAL_A_LA_VISTA)], profiles: PERFILES } };
  const b = await abrir(browser, "/niebla.html?room=r1", datos2, "u-ana", true);
  await escribir(b.page, "que hay en d5");
  const ve = await loQueDijoElRecuadro(b.page);
  ok("una pieza del rival que SÍ se ve, se dice", /pe[oó]n negro/i.test(ve), ve);

  await escribir(b.page, "jugadas de d5");
  const jug = await loQueDijoElRecuadro(b.page);
  /* Contarlas sería la fuga entera de la variante: el camino de una pieza del
     rival pasa por casillas que no ves. Y decir "no tiene jugadas ahora" —que es
     lo que sale si la lista llega vacía y nadie lo explica— es peor todavía:
     suena a información buena y es falsa. */
  ok("pero sus jugadas NO se listan", !/puede ir a/i.test(jug), jug);
  ok("y no se dice que «no tiene jugadas»", !/no tiene jugadas/i.test(jug), jug);
  ok("se explica que es del rival y hay niebla", /rival/i.test(jug) && /niebla/i.test(jug), jug);
  await b.ctx.close();
}

// ========================================================= 5. la ayuda plegada
async function pruebaLaAyuda(browser) {
  console.log("\n▶ La ayuda: está, y nace plegada");

  for (const pag of PAGINAS.filter((p) => p.datos)) {
    const { ctx, page } = await abrir(browser, pag.url, pag.datos, "u-ana", true);
    const a = await page.evaluate(() => {
      const d = document.querySelector(".cc-ayuda-det");
      return { hay: !!d, abierta: d ? d.open : null, texto: d ? (d.textContent || "").length : 0 };
    });
    ok(pag.nombre + ": la ayuda está escrita", a.hay && a.texto > 200, a);
    /* Plegada porque quien entra a una partida quiere jugarla, no oír el manual.
       Y escrita al montar aunque esté cerrada: si solo se escribiera al pedirla
       con el comando, abrirla a mano mostraría una caja vacía. */
    igual(pag.nombre + ": y nace plegada", a.abierta, false);

    await escribir(page, "ayuda");
    const b = await page.evaluate(() => (document.querySelector(".cc-ayuda-det") || {}).open);
    igual(pag.nombre + ": el comando «ayuda» la despliega", b, true);
    await ctx.close();
  }
}

// ======================= 6. la posición entera no se dicta en cada jugada
async function pruebaLaPosicionNoSeDicta(browser) {
  console.log("\n▶ La posición entera no se anuncia sola en cada jugada");

  /* Solo las dos páginas de partida: en tablero.html ese bloque SÍ es región
     viva y está bien que lo sea, porque ahí solo se rellena cuando se pide con
     el comando "T" — nunca se dicta sola. */
  for (const pag of PAGINAS.filter((p) => p.datos)) {
    const { ctx, page } = await abrir(browser, pag.url, pag.datos, "u-ana", true);
    const live = await page.evaluate(() =>
      (document.getElementById("position-readout") || {}).getAttribute("aria-live"));
    /* Vivía en una región viva, así que cada jugada —la propia y la del rival—
       volvía a dictar las treinta y dos piezas: para enterarse de que el rival
       jugó Cf3 había que oírse el tablero entero. Lo que se anuncia es la
       JUGADA; la posición se queda escrita ahí y se pide a demanda. */
    ok(pag.nombre + ": el bloque de la posición NO es región viva", live === null, live);
    const texto = await page.evaluate(() =>
      ((document.getElementById("position-readout") || {}).textContent || "").length);
    ok(pag.nombre + ": pero la posición SÍ está escrita ahí", texto > 40, texto);
    await ctx.close();
  }
}

// ============================ 7. tablero.html conserva sus comandos de siempre
async function pruebaLosComandosDeSiempre(browser) {
  console.log("\n▶ tablero.html: los comandos cortos de siempre siguen funcionando");

  const { ctx, page } = await abrir(browser, "/tablero.html", null, "u-ana", true);
  /* "T" escribe en el bloque de la posición, que en ESTA página sí es región
     viva — y con razón: acá solo se rellena cuando se pide, así que nunca se
     dicta sola. En estandar.html y niebla.html se rellenaba en cada jugada, que
     es lo que la volvía insufrible y lo que se quitó. */
  await escribir(page, "T");
  const t = await page.evaluate(() =>
    ((document.getElementById("position-readout") || {}).textContent || ""));
  ok("«T» sigue diciendo la posición", /blanc/i.test(t) && /negr/i.test(t), t.slice(0, 120));

  await escribir(page, "p n");
  const pn = await loQueDijoElRecuadro(page);
  ok("«p n» sigue diciendo dónde están los caballos", /caballo/i.test(pn), pn.slice(0, 120));

  /* Y conviven con las palabras del resto del sitio: dos vocabularios para lo
     mismo es justo el lío que había antes de js/comandos-tablero.js. */
  await escribir(page, "turno");
  const turno = await loQueDijoElRecuadro(page);
  ok("y «turno» —la palabra del resto del sitio— también contesta", /juegan/i.test(turno), turno);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaLaRegionVivaYElInterruptor(browser);
    await pruebaElTeclado(browser);
    await pruebaLasPreguntas(browser);
    await pruebaLaNiebla(browser);
    await pruebaLaAyuda(browser);
    await pruebaLaPosicionNoSeDicta(browser);
    await pruebaLosComandosDeSiempre(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n❌ ${fallos} comprobación(es) fallaron.` : "\n✅ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
