/* Comprueba, en un navegador de verdad, que las TRES páginas de Juegos se
   puedan jugar sin ver la pantalla: estandar.html, niebla.html y tablero.html.

   Desde que ¡Te reto! y Racha táctica montan el mismo teclado, también las
   comprueba a ellas (una parada de Tab, las preguntas, el tiempo del Modo
   Adaptado), y en las partidas el turno, el reloj, la última jugada y la
   coronación.

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
window.__escrituras = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};
  // Para cambiar la base «desde otra pantalla» (el rival juega) sin pasar por
  // Realtime, que en este doble no avisa nada (verificar-sala-respaldo.js).
  window.__tablas = DATOS.tablas;
  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, resultado = null, cambio = null;
    const cmp = (a, b) => String(a) === String(b);
    const b = {
      select() { window.__consultas.push(tabla); return b; },
      eq(col, val) { filas2 = filas2.filter((r) => cmp(r[col], val)); return b; },
      neq(col, val) { filas2 = filas2.filter((r) => !cmp(r[col], val)); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => (vals || []).some((v) => cmp(r[col], v))); return b; },
      is() { return b; }, not() { return b; }, or() { return b; },
      order() { return b; }, limit(n) { filas2 = filas2.slice(0, n); return b; }, range() { return b; },
      insert(fila) { resultado = fila; return b; },
      upsert(fila) { resultado = fila; return b; },   // Racha táctica guarda la mejor racha así
      // Como la base: devuelve las filas que cumplen los filtros, ya actualizadas.
      // Las páginas encadenan .eq("status", "playing").select("id") y miran si volvió
      // alguna: devolver el parche suelto las haría creer que no se guardó nada.
      update(fila) { cambio = fila; return b; },
      delete() { resultado = null; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        // Lo que la página escribe, para mirar qué mandó (estoy listo, rendirse).
        if (cambio !== null) window.__escrituras.push({ tabla, cambio, filas: filas2.length });
        let d = cambio !== null ? filas2.map((r) => Object.assign({}, r, cambio)) : (resultado !== null ? resultado : filas2);
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
    /* Elegir la pieza repinta el tablero entero, y la casilla que tenía el foco
       sale del documento: sin cuidarlo, el foco se iba al <body> y quien juega
       con el teclado quedaba fuera del tablero a mitad de la jugada. */
    const trasElegir = await page.evaluate(() => (document.activeElement && document.activeElement.dataset || {}).square || document.activeElement.tagName);
    igual("    al elegir la pieza, el foco se queda en su casilla", trasElegir, "g1");
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

/* «Revisa tus errores en esta partida»: al terminar, quien jugó tiene el enlace a
   «Tus propios errores» con ESA partida (?revisar=juego:<id>). Quien solo mira
   no lo tiene, ni en una partida en curso ni en una de menos de 10 jugadas. Se
   mide si se ve (checkVisibility), no la clase. */
async function pruebaRevisarLaPartida(browser) {
  console.log("\n— Revisa tus errores en esta partida —");
  const JUGADAS = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+"];
  const terminada = (moves) => Object.assign(sala("r1", "estandar", INICIAL), { status: "finished", result: "black", moves });
  const caso = async (room, usuario) => {
    const { ctx, page, errores } = await abrir(browser, "/estandar.html?room=r1", { tablas: { game_rooms: [room], profiles: PERFILES } }, usuario, false);
    const r = await page.evaluate(() => { const a = document.getElementById("revisar-partida"); return a ? [a.checkVisibility(), a.getAttribute("href")] : null; });
    await ctx.close();
    return { r, errores };
  };
  const jugo = await caso(terminada(JUGADAS), "u-ana");
  ok("quien jugó ve el enlace al terminar", !!jugo.r && jugo.r[0] === true, JSON.stringify(jugo.r));
  ok("y lleva a revisar ESA partida", !!jugo.r && jugo.r[1] === "entreno/tipos.html?revisar=juego%3Ar1#errores", jugo.r && jugo.r[1]);
  ok("sin errores de la página", !jugo.errores.length, jugo.errores.join(" | "));
  const mira = await caso(terminada(JUGADAS), "u-profe");
  ok("quien solo mira no lo ve", !!mira.r && mira.r[0] === false, JSON.stringify(mira.r));
  const enCurso = await caso(Object.assign(sala("r1", "estandar", INICIAL), { moves: JUGADAS }), "u-ana");
  ok("en una partida en curso no se ve", !!enCurso.r && enCurso.r[0] === false, JSON.stringify(enCurso.r));
  const corta = await caso(terminada(JUGADAS.slice(0, 4)), "u-ana");
  ok("con menos de 10 jugadas no se ve", !!corta.r && corta.r[0] === false, JSON.stringify(corta.r));
}

// ====================== 9. ¡Te reto! y Racha táctica: el mismo teclado y el recuadro
/* Las dos páginas de racha pintaban 64 botones sueltos, cada uno una parada de
   Tab con un rótulo en inglés ("Casilla e4: Blanco n"), y su recuadro no sabía
   contestar preguntas. Con diez segundos por ejercicio, además, quien usa lector
   de pantalla perdía por tiempo antes de terminar de oír la posición. Nada de eso
   daba error: la página se veía perfecta. */
const RACHA_FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
const RACHA_EJERCICIO = [RACHA_FEN, "f1c4", "Bc4", 500];

async function pruebaLasRachas(browser) {
  console.log("\n▶ ¡Te reto! y Racha táctica: una parada de Tab, preguntas y tiempo");
  const RACHAS = [
    { nombre: "te-reto.html", url: "/te-reto.html",
      datos: { tablas: { public_streak_leaderboard: [] } },
      empezar: async (page) => { await page.fill("#name-input", "Ana"); await page.press("#name-input", "Enter"); } },
    { nombre: "racha-tactica.html", url: "/racha-tactica.html",
      datos: { tablas: { profiles: PERFILES, puzzle_rush_scores: [] } },
      empezar: async (page) => { await page.click("#start-btn"); } },
  ];
  for (const r of RACHAS) {
    console.log("  — " + r.nombre);
    const { ctx, page, errores } = await abrir(browser, r.url, r.datos, "u-ana", true);
    // Un solo ejercicio conocido, para que lo que se pregunta tenga respuesta fija.
    await page.evaluate((ej) => { window.PUZZLE_RUSH_DATA = [ej]; }, RACHA_EJERCICIO);
    await r.empezar(page);
    await page.waitForTimeout(500);
    igual("    carga sin errores de JavaScript", errores.length, 0);

    const t = await page.evaluate(() => {
      const cs = Array.from(document.querySelectorAll("#board [data-square]"));
      const e4 = document.querySelector('#board [data-square="e4"]');
      const res = document.getElementById("result-text");
      const bar = document.getElementById("timer-bar");
      return {
        casillas: cs.length,
        paradas: cs.filter((c) => c.tabIndex === 0).length,
        eningles: cs.filter((c) => /Casilla|Blanco [a-z]\b|Negro [a-z]\b/.test(c.getAttribute("aria-label") || "")).length,
        e4: e4 ? e4.getAttribute("aria-label") : null,
        rolTablero: document.getElementById("board").getAttribute("role"),
        rolResultado: res ? res.getAttribute("role") : null,
        resultado: res ? res.textContent : "",
        barra: bar ? bar.style.transition : "",
      };
    });
    igual("    el tablero tiene sus 64 casillas", t.casillas, 64);
    igual("    y UNA sola parada de tabulador", t.paradas, 1);
    igual("    ninguna casilla habla en inglés ni deletreada", t.eningles, 0);
    ok("    la casilla dice su pieza en español", /eva 4/.test(t.e4 || "") && /pe[oó]n blanco/.test(t.e4 || ""), t.e4);
    igual("    en Modo Adaptado el tablero es application", t.rolTablero, "application");
    igual("    el renglón del resultado es región viva", t.rolResultado, "status");
    /* Diez segundos alcanzan para MIRAR un tablero, no para oírlo. */
    ok("    en Modo Adaptado el ejercicio da 60 segundos", /60000ms/.test(t.barra), t.barra);
    ok("    y lo dice", /60 segundos/.test(t.resultado), t.resultado);

    await page.fill(".cc-input", "caballos");
    await page.press(".cc-input", "Enter");
    await page.waitForTimeout(250);
    const cab = await page.evaluate(() => (document.querySelector(".cc-msg") || {}).textContent || "");
    ok("    «caballos» contesta dónde están", /caballo/i.test(cab) && /bella/i.test(cab) && /felix/i.test(cab), cab);

    /* «tiempo»: la barra que se achica no la oye nadie. Los segundos que
       quedan, dichos (js/reloj-hablado.js), con cualquiera de las formas de
       preguntarlo. */
    for (const pide of ["tiempo", "cuánto tiempo", "segundos"]) {
      await page.fill(".cc-input", pide);
      await page.press(".cc-input", "Enter");
      await page.waitForTimeout(200);
      const t2 = await page.evaluate(() => (document.querySelector(".cc-msg") || {}).textContent || "");
      ok("    «" + pide + "» dice los segundos que quedan", /^Te quedan (5\d|60) segundos\.$/.test(t2), t2);
    }
    // Lo que no es una jugada no es «ilegal»: no se entendió.
    await page.fill(".cc-input", "hola");
    await page.press(".cc-input", "Enter");
    await page.waitForTimeout(200);
    const hola = await page.evaluate(() => (document.querySelector(".cc-msg") || {}).textContent || "");
    ok("    «hola» dice que no se entendió (no «no es legal»)", /^No entendí «hola»/.test(hola) && !/legal/.test(hola), hola);
    await page.fill(".cc-input", "Dh5");
    await page.press(".cc-input", "Enter");
    await page.waitForTimeout(200);
    const ilegal = await page.evaluate(() => (document.querySelector(".cc-msg") || {}).textContent || "");
    ok("    una jugada que no se puede hacer: «no es una jugada legal»", /«Dh5» no es una jugada legal/.test(ilegal), ilegal);
    if (r.nombre === "te-reto.html") {
      const cambiar = await page.evaluate(() => (document.getElementById("change-name-btn") || {}).getAttribute("aria-label"));
      igual("    el botón «(cambiar)» dice qué cambia", cambiar, "Cambiar el nombre");
    }

    // Las flechas mueven el foco de verdad, también acá.
    await page.focus('#board [data-square="a1"]');
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
    const tras = await page.evaluate(() => (document.activeElement && document.activeElement.dataset || {}).square || null);
    ok("    la flecha derecha mueve el foco", tras === "b1", tras);

    // Elegir una pieza con Intro repinta el tablero: el foco no se puede ir al <body>.
    await page.focus('#board [data-square="f1"]');
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    const elegida = await page.evaluate(() => {
      const a = document.activeElement;
      return { sq: (a && a.dataset || {}).square || a.tagName, rotulo: a && a.getAttribute ? a.getAttribute("aria-label") : "" };
    });
    ok("    al elegir la pieza, el foco se queda en su casilla", elegida.sq === "f1", elegida);
    ok("    y la casilla dice que está elegida", /elegida/.test(elegida.rotulo || ""), elegida.rotulo);
    await page.keyboard.press("Enter");   // se suelta, para seguir con el recuadro
    await page.waitForTimeout(150);

    /* Fallar a propósito: la respuesta correcta tiene que llegar DICHA, "alfil
       cesar 4", no "Bc4", que el lector de pantalla deletrea en inglés. */
    await page.fill(".cc-input", "Cg5");
    await page.press(".cc-input", "Enter");
    await page.waitForTimeout(400);
    const fallo = await page.evaluate(() => document.getElementById("result-text").textContent);
    ok("    al fallar, la jugada correcta va en palabras", /alfil cesar 4/.test(fallo) && !/Bc4/.test(fallo), fallo);
    /* Legal pero no era la del ejercicio: empieza por «Respuesta incorrecta» y
       dice la jugada que se hizo, en palabras. */
    ok("    y empieza por «Respuesta incorrecta: caballo gustav 5»", /^Respuesta incorrecta: caballo gustav 5 /.test(fallo), fallo);
    /* Terminada la racha, todo contestaba «Ahora mismo no se puede contestar» y
       quien no ve tenía que salir a buscar el botón «Jugar de nuevo». El final
       dice qué escribir, y «otra vez» / «siguiente» arrancan otra racha. */
    ok("    el final dice qué escribir para seguir", /Escribe «otra vez» para jugar de nuevo\.$/.test(fallo), fallo);
    const dice = async (texto, espera) => {
      await page.fill(".cc-input", texto);
      await page.press(".cc-input", "Enter");
      await page.waitForTimeout(espera || 250);
      return page.evaluate(() => ({ msg: (document.querySelector(".cc-msg") || {}).textContent || "",
        res: document.getElementById("result-text").textContent }));
    };
    let d = await dice("Ac4");
    ok("    una jugada con la racha terminada lo dice (no «Ahora mismo no se puede»)", /^La racha terminó\. Escribe «otra vez»/.test(d.msg), d.msg);
    d = await dice("otra vez", 500);
    ok("    «otra vez» empieza otra racha", /Ejercicio nuevo/.test(d.res) && !/no se puede/.test(d.msg), d);
    // Un acierto y un fallo: con racha 1 se guarda el récord (Racha táctica, upsert).
    await dice("Ac4", 700);
    d = await dice("Cg5", 700);
    ok("    se puede volver a fallar", /^Respuesta incorrecta/.test(d.res) && /Racha final: 1\./.test(d.res), d.res);
    d = await dice("siguiente", 500);
    ok("    y «siguiente» también empieza otra", /Ejercicio nuevo/.test(d.res), d);
    igual("    sin errores de JavaScript en todo el ida y vuelta", errores.length, 0);
    await ctx.close();
  }

  // Fuera del Modo Adaptado el reloj sigue siendo de diez segundos.
  const { ctx, page } = await abrir(browser, RACHAS[1].url, RACHAS[1].datos, "u-ana", false);
  await page.evaluate((ej) => { window.PUZZLE_RUSH_DATA = [ej]; }, RACHA_EJERCICIO);
  await page.click("#start-btn");
  await page.waitForTimeout(300);
  const barra = await page.evaluate(() => document.getElementById("timer-bar").style.transition);
  ok("  fuera del modo, siguen siendo 10 segundos", /10000ms/.test(barra), barra);
  await ctx.close();
}

/* Los avisos de mitad de tiempo y de los 10 segundos (js/reloj-hablado.js),
   medidos sin esperar un minuto: se carga el módulo con un setTimeout que
   anota cuándo se pidió cada aviso. */
function pruebaElRelojHablado() {
  console.log("\n▶ ¡Te reto! y Racha táctica: los avisos del reloj");
  const vm = require("vm");
  const pedidos = [];
  const caja = { window: {}, Date, setTimeout: (f, ms) => { pedidos.push({ f, ms }); return pedidos.length; }, clearTimeout: () => {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "reloj-hablado.js"), "utf8"), caja);
  const dichos = [];
  const reloj = caja.window.RelojHablado.crear({ hablar: () => true, decir: (t) => dichos.push(t) });
  reloj.empezar(60000);
  igual("  con 60 segundos avisa a la mitad y a los 10 que quedan", pedidos.map((p) => p.ms), [30000, 50000]);
  pedidos.forEach((p) => p.f());
  ok("  y lo dice", /^Mitad del tiempo\. Te quedan/.test(dichos[0] || "") && dichos[1] === "Quedan 10 segundos.", dichos);
  ok("  «¿cuánto tiempo me queda?» se reconoce", reloj.esPregunta("¿Cuánto tiempo me queda?") && reloj.esPregunta("reloj") && !reloj.esPregunta("Cf3"));
  pedidos.length = 0;
  caja.window.RelojHablado.crear({ hablar: () => false, decir: () => {} }).empezar(60000);
  igual("  fuera del Modo Adaptado no avisa solo", pedidos.length, 0);
}

/* «enroque corto» y «enroque largo», dichos como se dicen, en Estándar y
   contra Oscar; y los tres mensajes de lo que no se jugó. */
async function pruebaElEnroqueDichoYLosMensajes(browser) {
  console.log("\n▶ Partidas: «enroque corto» y lo que se dice cuando no se juega");
  const ENROQUES = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
  let a = await abrir(browser, "/estandar.html?room=r1", { tablas: { game_rooms: [sala("r1", "estandar", ENROQUES)], profiles: PERFILES } }, "u-ana", true);
  await escribir(a.page, "hola");
  let d = await loQueDijoElRecuadro(a.page);
  ok("estandar: «hola» no se entendió (no es «no válida» ni «no legal»)", /^No entendí «hola»/.test(d) && !/v[aá]lida|legal/.test(d), d);
  await escribir(a.page, "Dh5");
  d = await loQueDijoElRecuadro(a.page);
  ok("estandar: una jugada imposible, «no es una jugada legal»", /«Dh5» no es una jugada legal/.test(d), d);
  await escribir(a.page, "enroque corto");
  d = await loQueDijoElRecuadro(a.page);
  const rey = await a.page.evaluate(() => (document.querySelector('#board [data-square="g1"]') || {}).getAttribute("aria-label"));
  ok("estandar: «enroque corto» enroca", /rey blanco/.test(rey || "") && !/legal|no entend/i.test(d), { rey, d });
  await a.ctx.close();

  a = await abrir(browser, "/tablero.html", null, "u-ana", true);
  await a.page.evaluate((f) => document.getElementById("chessboard").__tableroAccesibleCfg.juego().load(f), ENROQUES);
  await escribir(a.page, "hola");
  d = await loQueDijoElRecuadro(a.page);
  ok("tablero.html: «hola» no se entendió", /^No entendí «hola»/.test(d), d);
  await a.page.fill("#move-input", "enroque largo");
  await a.page.press("#move-input", "Enter");
  d = "";
  for (let i = 0; i < 10 && !/enroque/.test(d); i++) { await a.page.waitForTimeout(100); d = await loQueDijoElRecuadro(a.page); }
  const reyC1 = await a.page.evaluate(() => { const p = document.getElementById("chessboard").__tableroAccesibleCfg.juego().get("c1"); return p ? p.type + p.color : null; });
  ok("tablero.html: «enroque largo» enroca contra Oscar", reyC1 === "kw" && /enroque largo/.test(d) && !/legal|entend/i.test(d), { reyC1, d });
  await a.ctx.close();
}

/* «siguiente» contra Oscar con la cuenta ciega. La capa del recuadro aprieta el
   botón que «hace siguiente», y en tablero.html ese botón es «🎲 Otra posición»
   del Modo Desafío: a mitad de una partida normal cambiaba la tarjeta del
   desafío sin decir nada. En una partida no hay «siguiente»; con el Modo
   Desafío activo, sí. */
async function pruebaSiguienteContraOscar(browser) {
  console.log("\n▶ Contra Oscar: «siguiente» en una partida y en el Modo Desafío");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(preferencias(true));
  await ctx.addInitScript(() => { try { localStorage.setItem("ai_vision_v1", JSON.stringify({ persona: "u-ana", vision: "ciego" })); } catch (e) {} });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/tablero.html");
  await page.waitForFunction(() => document.documentElement.classList.contains("modo-ciego"), { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  const tarjeta = () => page.evaluate(() => document.getElementById("challenge-info").textContent);
  const antes = await tarjeta();
  await escribir(page, "e4");
  await page.waitForTimeout(1500);   // Oscar contesta
  const jugadas = await page.evaluate(() => document.getElementById("chessboard").__tableroAccesibleCfg.juego().history().length);
  await escribir(page, "siguiente");
  let d = await loQueDijoElRecuadro(page);
  ok("en una partida normal «siguiente» dice que no hay siguiente y cómo empezar otra",
    /^En una partida no hay «siguiente»/.test(d) && /escribe «rendirse» y después «nueva partida»/.test(d), d);
  igual("  y no cambia la tarjeta del Modo Desafío", await tarjeta(), antes);
  igual("  ni la partida", await page.evaluate(() => document.getElementById("chessboard").__tableroAccesibleCfg.juego().history().length), jugadas);

  await escribir(page, "jugar esta posición");
  await page.waitForTimeout(600);
  const fen1 = await page.evaluate(() => document.getElementById("chessboard").__tableroAccesibleCfg.juego().fen());
  await escribir(page, "siguiente");
  await page.waitForTimeout(600);
  d = await loQueDijoElRecuadro(page);
  const fen2 = await page.evaluate(() => document.getElementById("chessboard").__tableroAccesibleCfg.juego().fen());
  ok("con el Modo Desafío activo «siguiente» trae otra posición y la dice", /^Otra posición del Modo Desafío/.test(d) && fen1 !== fen2, { d, fen1, fen2 });
  // Lo que se le dice que escriba funciona: «rendirse» y después «nueva partida».
  await escribir(page, "rendirse");
  d = await loQueDijoElRecuadro(page);
  ok("«rendirse» termina la partida y dice qué escribir", /^Te rendiste: Oscar gana\. Escribe «nueva partida»/.test(d), d);
  await escribir(page, "nueva partida");
  await page.waitForTimeout(600);
  d = await loQueDijoElRecuadro(page);
  ok("«nueva partida» empieza otra", /^Partida nueva contra Oscar/.test(d), d);
  igual("sin errores de la página", errores.length, 0);
  await ctx.close();
}

// ======================= 10. estandar y niebla: turno, reloj, última jugada, coronar
async function pruebaElTurnoElRelojYLaUltima(browser) {
  console.log("\n▶ Partidas: fuera de turno, el reloj, la última jugada y la coronación");

  /* Fuera de turno la jugada no es «no válida»: decirlo manda a revisar una
     jugada que estaba bien, y quien no ve no sabe que solo tenía que esperar. */
  const datosInicial = { tablas: { game_rooms: [sala("r1", "estandar", INICIAL)], profiles: PERFILES } };
  let a = await abrir(browser, "/estandar.html?room=r1", datosInicial, "u-bruno", true);
  await escribir(a.page, "e5");
  const turno = await loQueDijoElRecuadro(a.page);
  ok("fuera de turno se dice que no es tu turno", /no es tu turno/i.test(turno) && !/no v[aá]lida/i.test(turno), turno);

  await escribir(a.page, "reloj");
  const reloj = await loQueDijoElRecuadro(a.page);
  ok("«reloj» dice cuánto le queda a cada uno", /te quedan 10 minutos/i.test(reloj) && /rival, 10 minutos/i.test(reloj), reloj);
  await escribir(a.page, "tiempo");
  ok("y «tiempo» también", /te quedan/i.test(await loQueDijoElRecuadro(a.page)));

  const rotulo = await a.page.evaluate(() => (document.getElementById("bottom-clock") || {}).getAttribute("aria-label"));
  ok("el reloj de abajo dice de quién es", /tu reloj/i.test(rotulo || "") && /negras/.test(rotulo || ""), rotulo);
  const rotulo2 = await a.page.evaluate(() => (document.getElementById("top-clock") || {}).getAttribute("aria-label"));
  ok("y el de arriba también", /rival/i.test(rotulo2 || "") && /blancas/.test(rotulo2 || ""), rotulo2);

  await escribir(a.page, "ultima jugada");
  ok("«última jugada» sin jugadas dice que no hay", /todav[ií]a no/i.test(await loQueDijoElRecuadro(a.page)));
  await a.ctx.close();

  /* El reloj es de js/sala-juego.js para todas las salas. Antes cada una tenía
     su copia y solo Estándar y Niebla decían de quién era: en Crazyhouse,
     Cartas y las variantes el lector de pantalla leía «10:00» suelto. */
  const CON_RELOJ = [
    ["/crazyhouse.html?room=r1", "crazyhouse", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1"],
    ["/cartas.html?room=r1", "cartas", INICIAL],
    ["/variante.html?room=r1", "camaleon", INICIAL],
  ];
  // La de Cartas necesita también su mano y su mazo, como la crea juegos-comun.js.
  // Su motor espera un `window`: se carga aparte, sin tocar el de esta prueba.
  const caja = { window: {}, Chess: require("chess.js").Chess };
  require("vm").runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "cartas-engine.js"), "utf8"), caja);
  const Cartas = caja.window.CartasChess;
  for (const [url, variant, fen] of CON_RELOJ) {
    const fila = sala("r1", variant, fen);
    if (variant === "cartas") fila.cartas_state = Cartas.Game.iniciar().toJSON();
    const b = await abrir(browser, url, { tablas: { game_rooms: [fila], profiles: PERFILES } }, "u-bruno", true);
    const abajo = await b.page.evaluate(() => (document.getElementById("bottom-clock") || {}).getAttribute("aria-label"));
    const arriba = await b.page.evaluate(() => (document.getElementById("top-clock") || {}).getAttribute("aria-label"));
    ok(variant + ": el reloj de abajo dice que es el tuyo, de negras", /tu reloj/i.test(abajo || "") && /negras/.test(abajo || ""), abajo);
    ok(variant + ": y el de arriba, que es el del rival", /rival/i.test(arriba || "") && /blancas/.test(arriba || ""), arriba);
    ok(variant + ": sin errores de la página", b.errores.length === 0, b.errores);
    await b.ctx.close();
  }

  const TRAS_E4_D5 = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2";
  const conJugadas = (variant) => ({ tablas: { game_rooms: [Object.assign(sala("r1", variant, TRAS_E4_D5), { moves: ["e4", "d5"] })], profiles: PERFILES } });
  a = await abrir(browser, "/estandar.html?room=r1", conJugadas("estandar"), "u-ana", true);
  await escribir(a.page, "última jugada");
  const ult = await loQueDijoElRecuadro(a.page);
  ok("«última jugada» la dice en palabras", /negras/.test(ult) && /david 5/.test(ult), ult);
  await a.ctx.close();

  /* En la niebla la jugada del rival no se dice: sería levantarla por el recuadro. */
  a = await abrir(browser, "/niebla.html?room=r1", conJugadas("niebla"), "u-ana", true);
  await escribir(a.page, "ultima");
  const ultN = await loQueDijoElRecuadro(a.page);
  ok("en la niebla, la del rival NO se dice", /niebla/i.test(ultN) && !/david|d5/i.test(ultN), ultN);
  await a.ctx.close();

  /* El aviso de tiempo: con 32 segundos y el reloj corriendo, al pasar de 30 se
     tiene que oír, sin que nadie pregunte. */
  const apurada = Object.assign(sala("r1", "estandar", INICIAL), { white_time_left: 32, clock_updated_at: new Date().toISOString() });
  a = await abrir(browser, "/estandar.html?room=r1", { tablas: { game_rooms: [apurada], profiles: PERFILES } }, "u-ana", true);
  let aviso = "";
  for (let i = 0; i < 20 && !/te quedan/i.test(aviso); i++) { await a.page.waitForTimeout(250); aviso = await loQueDijoElRecuadro(a.page); }
  ok("a los 30 segundos se avisa solo", /te quedan (30|29|28) segundos/i.test(aviso), aviso);
  await a.ctx.close();

  /* La coronación: el diálogo de todo el sitio (js/coronacion.js), con el foco
     adentro, cada pieza con su nombre, y el foco de vuelta al tablero. */
  const CORONA = "8/4P3/8/8/8/8/k7/4K3 w - - 0 1";
  for (const pagina of ["estandar", "niebla"]) {
    a = await abrir(browser, "/" + pagina + ".html?room=r1", { tablas: { game_rooms: [sala("r1", pagina, CORONA)], profiles: PERFILES } }, "u-ana", true);
    await a.page.focus('#board [data-square="e7"]');
    await a.page.keyboard.press("Enter");
    await a.page.waitForTimeout(150);
    await a.page.focus('#board [data-square="e8"]');
    await a.page.keyboard.press("Enter");
    await a.page.waitForTimeout(250);
    const d = await a.page.evaluate(() => {
      const dlg = document.querySelector("dialog[open]");
      const f = document.activeElement;
      return { abierto: !!dlg, focoAdentro: !!(dlg && dlg.contains(f)), foco: f ? f.textContent.trim() : "",
        nombres: dlg ? Array.from(dlg.querySelectorAll("button")).map((b) => b.textContent.trim()) : [] };
    });
    ok(pagina + ": coronar abre un diálogo con el foco adentro", d.abierto && d.focoAdentro, d);
    ok(pagina + ": y cada pieza dice su nombre", ["Dama", "Torre", "Alfil", "Caballo"].every((n) => d.nombres.includes(n)), d.nombres);
    await a.page.keyboard.press("ArrowRight");
    await a.page.keyboard.press("Enter");
    await a.page.waitForTimeout(400);
    const tras = await a.page.evaluate(() => ({
      e8: (document.querySelector('#board [data-square="e8"]') || {}).getAttribute("aria-label"),
      foco: document.activeElement && document.activeElement.closest ? !!document.activeElement.closest("#board") : false,
    }));
    ok(pagina + ": se corona en la pieza elegida (torre)", /torre blanca/.test(tras.e8 || ""), tras.e8);
    ok(pagina + ": y el foco vuelve al tablero", tras.foco === true, tras);
    await a.ctx.close();
  }
}

// ============== 11. lo que no se entendió, el historial, y la coronación dicha
async function pruebaLoQueQuedaEscritoYLoQueSeDice(browser) {
  console.log("\n▶ Lo que no se pudo jugar queda seleccionado; historial; coronación y enroque dichos");

  /* Lo que no se entiende (o no se puede jugar ahora) se queda en el recuadro,
     pero SELECCIONADO: si no, lo siguiente se pegaba detrás («e4e5») y volvía a
     fallar, y sin ver el recuadro no hay cómo saberlo. */
  /* Se envía y se mira EN EL MISMO instante: js/vision-cuenta.js también
     selecciona lo que quedó, pero 60 ms después y solo con la cuenta ciega. Lo
     que se prueba acá es que la página lo haga sola. */
  const enviarYVer = (page, texto) => page.evaluate((t) => {
    const i = document.getElementById("move-input");
    i.focus();
    i.value = t;
    i.form.requestSubmit();
    return { valor: i.value, todo: i.selectionStart === 0 && i.selectionEnd === i.value.length && i.value.length > 0 };
  }, texto);
  let a = await abrir(browser, "/estandar.html?room=r1", { tablas: { game_rooms: [sala("r1", "estandar", INICIAL)], profiles: PERFILES } }, "u-bruno", true);
  let sel = await enviarYVer(a.page, "e5");
  ok("estandar: fuera de turno, lo escrito queda seleccionado", sel.valor === "e5" && sel.todo, sel);
  await a.page.keyboard.type("reloj");
  ok("  y lo siguiente lo reemplaza (no «e5reloj»)", (await a.page.inputValue("#move-input")) === "reloj", await a.page.inputValue("#move-input"));
  await escribir(a.page, "mis jugadas");
  const mias = await loQueDijoElRecuadro(a.page);
  ok("«mis jugadas» fuera de turno no da las del rival", /le toca al rival/i.test(mias) && !/tienes \d+ jugadas/i.test(mias), mias);
  await a.ctx.close();

  a = await abrir(browser, "/estandar.html?room=r1", { tablas: { game_rooms: [sala("r1", "estandar", INICIAL)], profiles: PERFILES } }, "u-ana", true);
  sel = await enviarYVer(a.page, "xx9");
  ok("estandar: una jugada no válida queda seleccionada", sel.valor === "xx9" && sel.todo, sel);
  await a.ctx.close();

  /* El historial de Estándar: el tablero se carga desde la FEN, y load() borra
     la historia de chess.js. Tiene que salir de las jugadas guardadas. */
  const TRAS_E4_D5 = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2";
  const conJugadas = (variant) => ({ tablas: { game_rooms: [Object.assign(sala("r1", variant, TRAS_E4_D5), { moves: ["e4", "d5"] })], profiles: PERFILES } });
  a = await abrir(browser, "/estandar.html?room=r1", conJugadas("estandar"), "u-ana", true);
  await escribir(a.page, "historial");
  const hist = await loQueDijoElRecuadro(a.page);
  ok("estandar: «historial» dice las jugadas de la partida", /2 jugadas/.test(hist) && /eva 4/.test(hist) && /david 5/.test(hist), hist);
  await a.ctx.close();

  // En la niebla: solo las tuyas, y no se toma como una jugada.
  a = await abrir(browser, "/niebla.html?room=r1", conJugadas("niebla"), "u-ana", true);
  await escribir(a.page, "historial");
  const histN = await loQueDijoElRecuadro(a.page);
  ok("niebla: «historial» dice solo tus jugadas", /eva 4/.test(histN) && !/david|no v[aá]lida/i.test(histN), histN);
  await a.ctx.close();

  /* Contra Oscar: la coronación dice la pieza nueva y el enroque su nombre. La
     posición se pone con la partida que el tablero deja para Alt + Mayúscula + B
     (__tableroAccesibleCfg.juego), que es la misma que juega la página. */
  a = await abrir(browser, "/tablero.html", null, "u-ana", true);
  sel = await enviarYVer(a.page, "xx9");
  ok("tablero.html: una jugada que no se entiende queda seleccionada", sel.valor === "xx9" && sel.todo, sel);
  const hayJuego = await a.page.evaluate(() => {
    const t = document.getElementById("chessboard");
    const g = t && t.__tableroAccesibleCfg && t.__tableroAccesibleCfg.juego();
    return !!(g && g.fen);
  });
  ok("tablero.html: deja su partida para Alt + Mayúscula + B", hayJuego);
  await a.page.evaluate(() => document.getElementById("chessboard").__tableroAccesibleCfg.juego().load("8/4P3/8/8/8/8/k7/4K3 w - - 0 1"));
  await a.page.fill("#move-input", "e8=D");
  await a.page.press("#move-input", "Enter");
  let dicho = "";
  for (let i = 0; i < 10 && !/corona/.test(dicho); i++) { await a.page.waitForTimeout(100); dicho = await loQueDijoElRecuadro(a.page); }
  ok("tablero.html: la coronación dice la pieza nueva", /corona dama/.test(dicho), dicho);
  await a.ctx.close();
  a = await abrir(browser, "/tablero.html", null, "u-ana", true);
  await a.page.evaluate(() => document.getElementById("chessboard").__tableroAccesibleCfg.juego().load("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1"));
  await a.page.fill("#move-input", "O-O");
  await a.page.press("#move-input", "Enter");
  dicho = "";
  for (let i = 0; i < 10 && !/enroque/.test(dicho); i++) { await a.page.waitForTimeout(100); dicho = await loQueDijoElRecuadro(a.page); }
  ok("tablero.html: el enroque se dice como enroque corto", /enroque corto/.test(dicho), dicho);
  await a.ctx.close();
}

/* Un ejercicio de mate con DOS mates (Tf8# es la guardada; Td8# también es
   mate). Racha táctica y Te reto comparten el tablero (js/racha-tablero.js):
   cuando cada una tenía su copia, Te reto marcaba «Respuesta incorrecta» a un
   mate perfecto, y no daba ningún error. Las dos tienen que darlo por bueno. */
const DOS_MATES = ["6k1/p1p3pp/4N3/1p6/2q1r1n1/2B5/PP4PP/3R1R1K w - - 0 29", "f1f8", "Rf8#", 1500];

async function pruebaElOtroMate(browser) {
  console.log("\n▶ ¡Te reto! y Racha táctica: otro mate también es acierto");
  const RACHAS = [
    { nombre: "te-reto.html", url: "/te-reto.html",
      datos: { tablas: { public_streak_leaderboard: [] } },
      empezar: async (page) => { await page.fill("#name-input", "Ana"); await page.press("#name-input", "Enter"); } },
    { nombre: "racha-tactica.html", url: "/racha-tactica.html",
      datos: { tablas: { profiles: PERFILES, puzzle_rush_scores: [] } },
      empezar: async (page) => { await page.click("#start-btn"); } },
  ];
  for (const r of RACHAS) {
    for (const jugada of ["Tf8#", "Td8#"]) {
      const { ctx, page, errores } = await abrir(browser, r.url, r.datos, "u-ana", true);
      await page.evaluate((ej) => { window.PUZZLE_RUSH_DATA = [ej]; }, DOS_MATES);
      await r.empezar(page);
      await page.waitForTimeout(400);
      await page.fill(".cc-input", jugada);
      await page.press(".cc-input", "Enter");
      await page.waitForTimeout(250);
      const racha = await page.evaluate(() => document.getElementById("current-streak").textContent);
      igual("  " + r.nombre + ": " + jugada + " cuenta como acierto", racha, "1");
      igual("  " + r.nombre + ": sin errores de JavaScript", errores.length, 0);
      await ctx.close();
    }
  }
}

/* «Estoy listo» y «Rendirse» son de js/sala-juego.js para todas las salas
   (antes, seis copias). Se aprietan como una persona y se mira lo que se
   escribió en la sala: el que confirma segundo arranca el reloj en la misma
   escritura, y rendirse le da la partida al rival solo si sigue en juego. */
async function pruebaListoYRendirse(browser) {
  console.log("\n▶ Salas: «Estoy listo» y «Rendirse»");
  const SALAS = [["/estandar.html?room=r1", "estandar"], ["/variante.html?room=r1", "camaleon"], ["/duelo.html?room=r1", "duelo"]];
  for (const [url, variant] of SALAS) {
    const fila = Object.assign(sala("r1", variant, INICIAL), { black_ready: false });
    if (variant === "duelo") {
      // Como cartas: el duelo lleva su estado, armado con su motor y aparte.
      const caja = { window: {}, Chess: require("chess.js").Chess };
      require("vm").runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "duelo-engine.js"), "utf8"), caja);
      fila.duelo_state = new caja.window.DueloSimultaneo.Game().toJSON();
    }
    const a = await abrir(browser, url, { tablas: { game_rooms: [fila], profiles: PERFILES } }, "u-bruno", false);
    const listo = a.page.locator("#ready-btn");
    if (await listo.count() && await listo.isVisible()) {
      await listo.click();
      await a.page.waitForTimeout(300);
      const e = await a.page.evaluate(() => window.__escrituras.filter((x) => x.tabla === "game_rooms").map((x) => x.cambio));
      const c = e[e.length - 1] || {};
      ok(variant + ": «Estoy listo» marca a negras listas", c.black_ready === true, e);
      ok(variant + ": y, como blancas ya estaban, arranca el reloj ahí mismo", typeof c.clock_updated_at === "string", e);
    }
    await a.page.click("#resign-btn");
    await a.page.getByRole("button", { name: "Rendirme" }).click();
    await a.page.waitForTimeout(300);
    const r = await a.page.evaluate(() => window.__escrituras.filter((x) => x.tabla === "game_rooms").map((x) => x.cambio));
    const ult = r[r.length - 1] || {};
    ok(variant + ": rendirse con negras le da la partida a blancas", ult.status === "finished" && ult.result === "white", r);
    ok(variant + ": sin errores de la página", a.errores.length === 0, a.errores);
    await a.ctx.close();
  }
}

// El doble y la sala los usa también verificar-niebla-reglas.js.
module.exports = { doble, sala, abrir, PERFILES, CHROME, BASE };

if (require.main === module) (async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaLaRegionVivaYElInterruptor(browser);
    await pruebaElTeclado(browser);
    await pruebaLasPreguntas(browser);
    await pruebaLaNiebla(browser);
    await pruebaLaAyuda(browser);
    await pruebaLaPosicionNoSeDicta(browser);
    await pruebaLosComandosDeSiempre(browser);
    await pruebaRevisarLaPartida(browser);
    await pruebaLasRachas(browser);
    await pruebaElOtroMate(browser);
    pruebaElRelojHablado();
    await pruebaElEnroqueDichoYLosMensajes(browser);
    await pruebaSiguienteContraOscar(browser);
    await pruebaElTurnoElRelojYLaUltima(browser);
    await pruebaListoYRendirse(browser);
    await pruebaLoQueQuedaEscritoYLoQueSeDice(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n❌ ${fallos} comprobación(es) fallaron.` : "\n✅ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
