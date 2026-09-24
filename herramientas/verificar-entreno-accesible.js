/* Comprueba que TODOS los tableros de Entrenamiento se puedan recorrer y
   contestar sin ver la pantalla — el teclado que hasta ahora solo tenía el 4×4.

   Por qué hace falta, y por qué en un navegador de verdad:

   1. NADA DE ESTO DA UN ERROR. Un tablero de 64 botones mudos se ve perfecto,
      el ratón funciona igual y el ejercicio se resuelve — solo que con lector de
      pantalla es una pared de sesenta y cuatro "botón" y con teclado son sesenta
      y cinco Tab para llegar al botón de abajo. Es exactamente el tipo de falla
      que este repositorio colecciona: la descubre quien no puede arreglarla.

   2. QUE SE VEA Y QUE SE MUEVA, NO QUE ESTÉ. El cuadro donde se escribe lo
      destapa el CSS, así que preguntar por la clase daría verde sobre una página
      rota; se mide el `display` que calcula el navegador. Y las flechas se
      aprietan de verdad, mirando a dónde se fue el foco: un `keydown` declarado
      que no mueve nada se ve igual que un tablero que sí se recorre.

   3. SESENTA Y CUATRO PARADAS DE TABULADOR ES EL DEFECTO, Y SE CUENTA. Es un
      número, así que o está bien o no: si alguien vuelve a dibujar las casillas
      sin el tabindex, la página se ve igual de bien y esto salta.

   4. LAS LETRAS DE LAS OPCIONES NO SON PIEZAS. En el diagnóstico y en Precisión
      posicional se contesta escribiendo "C", y el mismo recuadro entiende
      preguntas: si "C" se leyera como "caballos", el alumno escribiría su letra,
      oiría algo sobre unos caballos y la prueba no avanzaría nunca.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         npm install playwright chess.js@0.10.3
         node herramientas/verificar-entreno-accesible.js                      */
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function mal(t) { console.log("  ✗ " + t); fallos += 1; }
function bien(t) { console.log("  ✓ " + t); }


const STUB = `
window.SUPABASE_URL = "https://ejemplo.supabase.co";
window.SUPABASE_ANON_KEY = "clave-de-mentira";
window.sb = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: { user: { id: "u-1", email: "a@ejemplo.com" }, access_token: "t" } } }),
    getUser: () => Promise.resolve({ data: { user: { id: "u-1", email: "a@ejemplo.com" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: () => Promise.resolve({ error: null }),
  },
  from: () => {
    const fila = { id: "u-1", role: "alumno", is_admin: false, full_name: "Alumna", elo: null, elo_tipo: "fide" };
    const b = {
      select: () => b, eq: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      range: () => b, gte: () => b, lte: () => b, ilike: () => b, upsert: () => b, insert: () => b,
      update: () => b, delete: () => b,
      single: () => Promise.resolve({ data: fila, error: null }),
      maybeSingle: () => Promise.resolve({ data: fila, error: null }),
      then: (r) => Promise.resolve({ data: [], error: null }).then(r),
    };
    return b;
  },
  rpc: () => Promise.resolve({ data: null, error: null }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
};`;

/* Sin service worker: al recargar es él quien sirve los archivos y lo que pide
   no pasa por las rutas del contexto, así que volvía el supabase-client de
   verdad y la página moría. La misma piedra que ya documentó
   verificar-reportes.js. */
async function abrir(browser, ruta, adaptado) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  await ctx.addInitScript(`localStorage.setItem("oscarBlindMode_v1", ${adaptado ? '"1"' : '"0"'});`);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errores.push("consola: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

/* Cuántas casillas del tablero están en el recorrido del tabulador, y qué dice
   cada una. Es la medida de las dos cosas que estaban rotas en todas las páginas
   menos el 4×4. */
async function mirarTablero(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { falta: true };
    const cs = [...el.querySelectorAll("[data-square]")];
    const etiquetas = cs.map((c) => c.getAttribute("aria-label") || "");
    return {
      casillas: cs.length,
      enElTabulador: cs.filter((c) => c.tabIndex >= 0).length,
      mudas: etiquetas.filter((t) => !t.trim()).length,
      distintas: new Set(etiquetas).size,
      ocultoAlLector: el.closest("[aria-hidden='true']") !== null,
      rol: el.getAttribute("role"),
    };
  }, sel);
}

// ====================================================================== 1
/* Las páginas con tablero, una por una. Se mira lo mismo en todas porque el
   teclado es el MISMO módulo: si alguna se queda sin él, es que se olvidó de
   montarlo y la página se ve exactamente igual de bien. */
const CON_TABLERO = [
  { nombre: "Ejercicios por tema", ruta: "/entreno/temas.html", sel: "#board", antes: async (p) => {
      await p.click(".theme-card, [data-theme]", { timeout: 4000 }).catch(() => {});
    } },
  { nombre: "Mates", ruta: "/entreno/mates.html", sel: "#board" },
  { nombre: "Aprender", ruta: "/entreno/aprender.html", sel: "#board", antes: async (p) => {
      await p.click(".lesson-item:not([disabled])", { timeout: 4000 }).catch(() => {});
    } },
  { nombre: "Practicar", ruta: "/entreno/practicas.html", sel: "#board", antes: async (p) => {
      await p.click(".set-card, [data-set]", { timeout: 4000 }).catch(() => {});
    } },
  { nombre: "Desafíos", ruta: "/entreno/desafios.html", sel: "#board", antes: async (p) => {
      await p.click(".set-card, [data-set]", { timeout: 4000 }).catch(() => {});
    } },
  { nombre: "Aperturas y celadas", ruta: "/entreno/aperturas.html", sel: "#board", antes: async (p) => {
      await p.click("button.ficha", { timeout: 4000 }).catch(() => {});
    } },
  /* Coordenadas se mira en MODO NORMAL, a propósito: su Modo Adaptado cambia el
     ejercicio entero —en vez de "toca e4" pregunta "¿e4 es blanca o negra?"— y
     esconde el tablero, que es la decisión correcta ahí. Lo que había que
     arreglar en esta página es lo de siempre para quien navega con teclado: las
     64 casillas decían "Casilla", todas igual, y eran 64 paradas de tabulador. */
  { nombre: "Coordenadas", ruta: "/entreno/coordenadas.html", sel: "#board", enModoNormal: true, antes: async (p) => {
      await p.click("#start-btn", { timeout: 4000 }).catch(() => {});
    } },
  { nombre: "Estudio", ruta: "/entreno/estudio.html", sel: "#tablero", antes: async (p) => {
      await p.click(".ficha-item", { timeout: 4000 }).catch(() => {});
    } },
];

async function pruebaTableros(browser) {
  console.log("\n=== Los tableros se recorren con el teclado ===");
  for (const caso of CON_TABLERO) {
    const adaptado = !caso.enModoNormal;
    const { page, ctx, errores } = await abrir(browser, caso.ruta, adaptado);
    if (caso.antes) { await caso.antes(page); await page.waitForTimeout(500); }
    const t = await mirarTablero(page, caso.sel);
    if (t.falta || !t.casillas) {
      mal(`${caso.nombre}: no se llegó a ver el tablero (${caso.sel})`);
      await ctx.close();
      continue;
    }
    // Una sola parada de tabulador: es el patrón de rejilla de ARIA, y es lo que
    // separa "se entra con Tab y se anda con flechas" de "sesenta y cinco Tab".
    if (t.enElTabulador !== 1) mal(`${caso.nombre}: ${t.enElTabulador} casillas en el recorrido del tabulador, tendría que ser 1`);
    else bien(`${caso.nombre}: una sola parada de tabulador en el tablero (${t.casillas} casillas)`);

    if (t.mudas) mal(`${caso.nombre}: ${t.mudas} casillas no dicen nada — un lector de pantalla solo diría "botón"`);
    else bien(`${caso.nombre}: ninguna casilla muda`);

    // Sesenta y cuatro casillas diciendo lo mismo ("Casilla") es tan inservible
    // como sesenta y cuatro mudas, y se ve igual de bien.
    if (t.distintas < Math.min(t.casillas, 8)) mal(`${caso.nombre}: solo ${t.distintas} etiquetas distintas entre ${t.casillas} casillas`);
    else bien(`${caso.nombre}: cada casilla dice cuál es (${t.distintas} etiquetas distintas)`);

    if (t.ocultoAlLector) mal(`${caso.nombre}: el tablero está dentro de un aria-hidden, o sea que no existe para el lector de pantalla`);
    else bien(`${caso.nombre}: el tablero existe para el lector de pantalla`);

    /* En Modo Adaptado el tablero se anuncia como `application`: con el rol de
       siempre, NVDA y JAWS están en su modo de lectura y se quedan ellos con las
       teclas de una letra, así que los atajos no llegarían nunca — y no fallaría
       nada, simplemente se movería el lector de pantalla y no el tablero. */
    igual(`${caso.nombre}: el tablero se anuncia como ${adaptado ? "aplicación" : "grupo"}`, t.rol, adaptado ? "application" : "group");

    // Las flechas, apretadas de verdad. Un keydown declarado que no mueve el
    // foco se ve exactamente igual que un tablero que sí se recorre.
    const antes = await page.evaluate((s) => {
      const c = document.querySelector(s + " [data-square][tabindex='0']");
      if (c) c.focus();
      return document.activeElement ? document.activeElement.dataset.square : null;
    }, caso.sel);
    await page.keyboard.press("ArrowRight");
    const derecha = await page.evaluate(() => document.activeElement && document.activeElement.dataset.square);
    await page.keyboard.press("ArrowDown");
    const abajo = await page.evaluate(() => document.activeElement && document.activeElement.dataset.square);
    if (!antes) mal(`${caso.nombre}: no se pudo enfocar ninguna casilla`);
    else if (derecha === antes || abajo === derecha) mal(`${caso.nombre}: las flechas no mueven el foco (${antes} → ${derecha} → ${abajo})`);
    else bien(`${caso.nombre}: las flechas mueven el foco de verdad (${antes} → ${derecha} → ${abajo})`);

    // Y después de moverse, el tabulador sigue teniendo UNA sola parada: si el
    // roving tabindex no se reparte, vuelven las 64.
    const t2 = await mirarTablero(page, caso.sel);
    igual(`${caso.nombre}: después de moverse sigue habiendo una sola parada`, t2.enElTabulador, 1);

    if (errores.length) mal(`${caso.nombre}: errores en la consola — ${errores.slice(0, 3).join(" | ")}`);
    else bien(`${caso.nombre}: sin errores en la consola`);
    await ctx.close();
  }
}

// ====================================================================== 2
/* El recuadro donde se escribe: que se VEA en Modo Adaptado (lo destapa el CSS,
   así que preguntar por la clase daría verde sobre una página rota) y que
   conteste una pregunta de verdad. */
async function pruebaRecuadro(browser) {
  console.log("\n=== El recuadro contesta preguntas y jugadas ===");
  for (const caso of CON_TABLERO) {
    if (caso.nombre === "Coordenadas") continue;   // su Modo Adaptado cambia el ejercicio entero
    const { page, ctx } = await abrir(browser, caso.ruta, true);
    if (caso.antes) { await caso.antes(page); await page.waitForTimeout(500); }
    const visible = await page.evaluate(() => {
      const c = document.querySelector(".cc-caja");
      if (!c) return "no existe";
      return getComputedStyle(c).display;
    });
    if (visible === "none" || visible === "no existe") { mal(`${caso.nombre}: el recuadro no se ve en Modo Adaptado (${visible})`); await ctx.close(); continue; }
    bien(`${caso.nombre}: el recuadro se ve en Modo Adaptado`);

    // Una pregunta: "caballos". Es la que contesta lo que un tablero deja ver de
    // un vistazo y que sin verlo no hay forma de saber.
    await page.fill(".cc-caja .cc-input", "caballos");
    await page.press(".cc-caja .cc-input", "Enter");
    await page.waitForTimeout(150);
    const resp = await page.textContent(".cc-caja .cc-msg");
    if (!/caballo/i.test(resp || "")) mal(`${caso.nombre}: preguntar "caballos" contestó "${resp}"`);
    else bien(`${caso.nombre}: "caballos" contesta dónde están`);

    // Y la ayuda tiene que estar PLEGADA: quien llega a un ejercicio quiere
    // contestarlo, no oír el manual.
    const plegada = await page.evaluate(() => {
      const d = document.querySelector(".cc-ayuda-det");
      return d ? !d.open : "no hay";
    });
    igual(`${caso.nombre}: la ayuda nace plegada`, plegada, true);
    await ctx.close();
  }
}

// ====================================================================== 3
/* Resolver ESCRIBIENDO, que es la prueba de fondo: que la página se pueda usar
   sin tocar el tablero ni una vez. Se hace en Aperturas porque ahí la jugada
   que toca está escrita en el banco (js/aperturas-lineas.js), así que se puede
   comprobar contra la página en vez de adivinar; y porque era la página que
   PEOR estaba —sus 64 casillas eran botones mudos y no tenía ningún recuadro—.

   Lo que se mira es lo que se VE cambiar, no una variable interna: una prueba
   que espiara el estado daría verde sobre una página donde la jugada no llega
   nunca a la pantalla. */
async function pruebaResolver(browser) {
  console.log("\n=== Resolver sin tocar el tablero ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/aperturas.html", true);
  await page.waitForTimeout(400);
  // Una línea que se juegue con blancas: si el alumno lleva negras, la primera
  // jugada la hace el rival y no habría nada que escribir todavía.
  const linea = await page.evaluate(() => {
    const L = (window.AperturasLineas ? window.AperturasLineas.LINEAS : []).find((x) => x.color === "w" && x.jugadas.length >= 3);
    return L ? { id: L.id, jugadas: L.jugadas.slice(0, 3) } : null;
  });
  if (!linea) { mal("no se encontró ninguna línea de blancas en el banco"); await ctx.close(); return; }
  await ctx.close();

  const dos = await abrir(browser, "/entreno/aperturas.html?linea=" + encodeURIComponent(linea.id), true);
  await dos.page.waitForTimeout(600);
  const antes = await dos.page.textContent("#jugadas-hechas");
  // La jugada del banco va en notación inglesa; se escribe en ESPAÑOL, que es
  // como la escribiría el alumno y lo que el recuadro de antes no entendía.
  const enEspanol = linea.jugadas[0].replace(/^N/, "C").replace(/^B/, "A").replace(/^R/, "T").replace(/^Q/, "D").replace(/^K/, "R");
  await dos.page.fill(".cc-caja .cc-input", enEspanol);
  await dos.page.press(".cc-caja .cc-input", "Enter");
  await dos.page.waitForTimeout(400);
  const despues = await dos.page.textContent("#jugadas-hechas");
  if (antes === despues) mal(`escribir "${enEspanol}" no jugó nada (la lista de jugadas no cambió)`);
  else bien(`la jugada escrita en español ("${enEspanol}") se juega de verdad`);

  /* Y una que no es legal tiene que rechazarse DICIÉNDOLO, no en silencio. Se
     espera primero a que conteste el rival: mientras contesta, el recuadro dice
     "ahora no te toca" —que también es una respuesta correcta, pero no la que
     esta comprobación viene a mirar, y daría verde sin probar nada—. */
  await dos.page.waitForFunction(() => {
    const m = document.querySelector(".cc-caja .cc-msg");
    return !m || !/no te toca/i.test(m.textContent || "");
  }, null, { timeout: 4000 }).catch(() => {});
  await dos.page.waitForTimeout(900);
  await dos.page.fill(".cc-caja .cc-input", "Th8");
  await dos.page.press(".cc-caja .cc-input", "Enter");
  await dos.page.waitForTimeout(200);
  const aviso = await dos.page.textContent(".cc-caja .cc-msg");
  if (!aviso || !aviso.trim()) mal("una jugada imposible no dijo nada: quien escribe se queda sin saber qué pasó");
  else bien("una jugada imposible se rechaza diciéndolo: " + JSON.stringify(aviso.slice(0, 60)));

  if (dos.errores.length) mal("Aperturas: errores en la consola — " + dos.errores.slice(0, 3).join(" | "));
  else bien("Aperturas: sin errores en la consola");
  await dos.ctx.close();
}

// ====================================================================== 4
/* Estudio: el tablero de una ficha era decorativo y la posición en palabras
   vivía plegada AL FINAL, debajo del pie de foto. Acá se mide lo que cambió:
   que se pueda recorrer la línea escribiendo y que la posición esté ANTES de la
   lista de jugadas, o sea pegada a los botones que la cambian. */
async function pruebaEstudio(browser) {
  console.log("\n=== Estudio: la ficha se recorre sin ver ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/estudio.html", true);
  await page.click(".ficha-item");
  await page.waitForTimeout(400);

  const orden = await page.evaluate(() => {
    const pos = document.getElementById("posicion-escrita");
    const jug = document.getElementById("jugadas");
    const ctrl = document.getElementById("controles");
    if (!pos || !jug || !ctrl) return "falta alguno";
    const antesDeJugadas = pos.compareDocumentPosition(jug) & Node.DOCUMENT_POSITION_FOLLOWING;
    const despuesDeControles = ctrl.compareDocumentPosition(pos) & Node.DOCUMENT_POSITION_FOLLOWING;
    return !!antesDeJugadas && !!despuesDeControles;
  });
  igual("la posición en palabras va pegada a los controles y antes de las jugadas", orden, true);

  // Región viva de verdad: sin esto hay que ir a buscarla después de cada jugada.
  const viva = await page.getAttribute("#posicion-escrita", "role");
  igual("la posición se lee sola en cada jugada (es región viva)", viva, "status");

  /* Y se ve, con algo escrito dentro. Se mide el `display` que calcula el
     navegador y no la clase: era un <details> plegado al final del bloque, y
     preguntar por el nodo daría verde sobre una ficha donde la posición sigue
     escondida. */
  const vista = await page.evaluate(() => {
    const p = document.getElementById("posicion-escrita");
    const todo = document.getElementById("posicion-completa");
    return {
      seVe: p ? getComputedStyle(p.parentElement).display !== "none" : false,
      dice: p ? p.textContent.trim().length > 5 : false,
      // La posición entera se queda ahí al lado, pero NO se dicta en cada paso:
      // doce jugadas por treinta y dos piezas no lo escucha nadie.
      enCadaPaso: p ? /Blancas:.*Negras:/.test(p.textContent) : false,
      aparte: todo ? /Blancas:.*Negras:/.test(todo.textContent) : false,
    };
  });
  igual("el bloque de la posición se ve", vista.seVe, true);
  igual("y dice algo", vista.dice, true);
  igual("no se dictan las 32 piezas en cada jugada", vista.enCadaPaso, false);
  igual("pero la posición entera está escrita ahí al lado", vista.aparte, true);

  // Recorrer la línea ESCRIBIENDO: quien contesta desde el recuadro no tendría
  // que salir de él, tabular hasta ▶ y volver, en cada jugada.
  const antes = await page.textContent("#posicion-escrita");
  await page.fill(".cc-caja .cc-input", "siguiente");
  await page.press(".cc-caja .cc-input", "Enter");
  await page.waitForTimeout(250);
  const despues = await page.textContent("#posicion-escrita");
  if (antes === despues) mal('escribir "siguiente" no avanzó la línea');
  else bien('escribir "siguiente" avanza la línea y la posición nueva se lee sola');

  await page.fill(".cc-caja .cc-input", "anterior");
  await page.press(".cc-caja .cc-input", "Enter");
  await page.waitForTimeout(250);
  const vuelta = await page.textContent("#posicion-escrita");
  igual('"anterior" vuelve a la posición de antes', vuelta.trim() === antes.trim(), true);

  if (errores.length) mal("Estudio: errores en la consola — " + errores.slice(0, 3).join(" | "));
  else bien("Estudio: sin errores en la consola");
  await ctx.close();
}

// ====================================================================== 5
/* La letra de una opción NO es una pieza. En el diagnóstico se contesta
   escribiendo "C", y el mismo recuadro entiende preguntas: si "C" se leyera como
   "caballos", el alumno escribiría su letra, oiría algo sobre unos caballos y la
   prueba no avanzaría nunca — sin un solo error en ninguna parte. */
async function pruebaLetrasNoSonPiezas(browser) {
  console.log("\n=== Las letras de las opciones no son piezas ===");
  const src = fs.readFileSync(path.join(RAIZ, "js", "comandos-tablero.js"), "utf8");
  const srcTA = fs.readFileSync(path.join(RAIZ, "js", "tablero-accesible.js"), "utf8");
  const w = { document: { documentElement: { classList: { contains: () => false } }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, getElementById: () => null } };
  new Function("window", "document", srcTA)(w, w.document);
  new Function("window", "document", src)(w, w.document);
  const CT = w.ComandosTablero;
  const { Chess } = require("chess.js");
  const g = new Chess();
  let malos = [];
  "abcdefghij".split("").forEach((l) => {
    [l, l.toUpperCase()].forEach((t) => {
      if (CT.interpretar(t, { juego: () => g }).manejado) malos.push(t);
    });
  });
  if (malos.length) mal("estas letras de opción se leen como una pregunta: " + malos.join(", "));
  else bien("ninguna letra suelta de la A a la J se lee como una pregunta");
  igual('pero el nombre entero sí: "caballos"', CT.interpretar("caballos", { juego: () => g }).manejado, true);
  igual('y "no lo sé" sigue pasando de largo, como respuesta que es', CT.interpretar("no lo sé", { juego: () => g }).manejado, false);

  // El intérprete de jugadas, que ahora vale también para los motores que no son
  // chess.js (Desafíos usa el suyo porque sus posiciones no siempre tienen reyes).
  const casos = [["Cf3", "g1f3"], ["Nf3", "g1f3"], ["e4", "e2e4"], ["e2 e4", "e2e4"], ["g1f3", "g1f3"]];
  let fallados = casos.filter(([t, esp]) => {
    const m = CT.jugadaEscrita(new Chess(), t);
    return !m || m.from + m.to !== esp;
  });
  if (fallados.length) mal("estas jugadas escritas no se entendieron: " + fallados.map((c) => c[0]).join(", "));
  else bien("la jugada se entiende en español, en inglés y como origen y destino");
  igual("y no toca la partida al interpretarla", (() => {
    const gg = new Chess(); const antes = gg.fen(); CT.jugadaEscrita(gg, "Cf3"); return gg.fen() === antes;
  })(), true);

  /* "R" es Rey en español y Rook (torre) en inglés: dos jugadas distintas
     escritas igual. Se prueban las dos y gana la que sea legal. Leído en un solo
     idioma no fallaría nada: movería la pieza que no era, legalmente, y quien
     escribió su jugada vería moverse otra cosa sin entender por qué. */
  const torres = new Chess("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
  const rd1 = CT.jugadaEscrita(torres, "Rd1");
  igual('"Rd1" donde la torre puede llegar es la TORRE (inglés)', rd1 && rd1.piece + rd1.from + rd1.to, "ra1d1");
  const re2 = CT.jugadaEscrita(torres, "Re2");
  igual('"Re2" donde la torre NO puede llegar es el REY (español)', re2 && re2.piece + re2.from + re2.to, "ke1e2");
  const td1 = CT.jugadaEscrita(torres, "Td1");
  igual('y la inicial española de torre nunca es ambigua', td1 && td1.piece + td1.from + td1.to, "ra1d1");
}

// ====================================================================== 5b
/* Los atajos de una tecla, apretados de verdad. Son lo que hace que un tablero
   se pueda MIRAR sin verlo —"¿qué hay alrededor?", "¿dónde están los caballos?",
   "¿a dónde puede ir esta pieza?"— y es justo lo que solo tenía el 4×4.
   Se mide lo que sale por la región viva, que es lo que oye quien usa lector de
   pantalla: un atajo que escribiera en una variable interna no le llegaría. */
async function pruebaAtajos(browser) {
  console.log("\n=== Los atajos del tablero contestan ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html", true);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const c = document.querySelector("#board [data-square][tabindex='0']");
    if (c) c.focus();
  });

  async function atajo(tecla, espera, queMira) {
    await page.evaluate(() => { const v = document.querySelector(".ta-dice"); if (v) v.textContent = ""; });
    await page.keyboard.press(tecla);
    await page.waitForTimeout(160);
    const dicho = await page.evaluate(() => { const v = document.querySelector(".ta-dice"); return v ? v.textContent : ""; });
    if (!espera.test(dicho || "")) mal(`el atajo "${tecla}" (${queMira}) contestó ${JSON.stringify((dicho || "").slice(0, 70))}`);
    else bien(`"${tecla}" — ${queMira}: ${JSON.stringify((dicho || "").slice(0, 60))}`);
  }

  await atajo("o", /\w+\s*\d/, "qué hay en esta casilla");
  await atajo("z", /Blancas|Negras/, "la posición entera");
  await atajo("x", /[Aa]lrededor/, "las casillas de alrededor");
  await atajo("m", /puede ir|vacía|no tiene jugadas/, "a dónde puede ir esta pieza");
  // Saltar a una pieza MUEVE el foco: sin eso hay que pasar por las 64 casillas
  // de una en una para encontrar la dama.
  const antesDeSaltar = await page.evaluate(() => document.activeElement.dataset.square);
  await page.keyboard.press("k");
  await page.waitForTimeout(160);
  const despuesDeSaltar = await page.evaluate(() => document.activeElement.dataset.square);
  if (antesDeSaltar === despuesDeSaltar) mal('"k" no saltó a ningún rey');
  else bien(`"k" salta al rey (${antesDeSaltar} → ${despuesDeSaltar})`);

  /* Y en modo normal los atajos NO valen: fuera del Modo Adaptado una "p" sobre
     el tablero es la tecla de navegación rápida del lector de pantalla de quien
     está leyendo la página, y robársela es peor que no tener el atajo. */
  await ctx.close();
  const normal = await abrir(browser, "/entreno/mates.html", false);
  await normal.page.waitForTimeout(500);
  await normal.page.evaluate(() => {
    const c = document.querySelector("#board [data-square][tabindex='0']");
    if (c) c.focus();
  });
  await normal.page.keyboard.press("z");
  await normal.page.waitForTimeout(150);
  const enNormal = await normal.page.evaluate(() => { const v = document.querySelector(".ta-dice"); return v ? v.textContent : ""; });
  igual("en modo normal los atajos se callan y le dejan las teclas al lector de pantalla", (enNormal || "").trim(), "");
  await normal.ctx.close();

  if (errores.length) mal("atajos: errores en la consola — " + errores.slice(0, 2).join(" | "));
}

// ====================================================================== 6
/* Fuera del Modo Adaptado el recuadro NO se ve —un campo de texto invisible pero
   enfocable es una parada de tabulador fantasma— pero el tablero se sigue
   recorriendo con las flechas: eso no es del modo, es de cualquiera que use
   teclado. */
async function pruebaModoNormal(browser) {
  console.log("\n=== En modo normal ===");
  const { page, ctx } = await abrir(browser, "/entreno/mates.html", false);
  await page.waitForTimeout(500);
  const display = await page.evaluate(() => {
    const c = document.querySelector(".cc-caja");
    return c ? getComputedStyle(c).display : "no existe";
  });
  igual("el recuadro no se ve", display, "none");
  const t = await mirarTablero(page, "#board");
  igual("pero el tablero sigue teniendo una sola parada de tabulador", t.enElTabulador, 1);
  igual("y fuera del modo el tablero vuelve a anunciarse como grupo", t.rol, "group");
  await ctx.close();
}

// ====================================================================== 7
/* Encender el Modo Adaptado desde el botón propio de la página tiene que
   encender la clase del <html>: de ella cuelga el recuadro. Estuvo roto —el
   botón se marcaba como activado y la mitad del modo no llegaba hasta recargar—
   y no daba ningún error. */
async function pruebaInterruptor(browser) {
  console.log("\n=== El interruptor de la página enciende el modo entero ===");
  const { page, ctx } = await abrir(browser, "/entreno/mates.html", false);
  await page.waitForTimeout(400);
  await page.click("#mode-blind-btn");
  await page.waitForTimeout(200);
  const clase = await page.evaluate(() => document.documentElement.classList.contains("adaptive-mode"));
  igual("el botón 🔊 Adaptado enciende la clase del <html>", clase, true);
  const display = await page.evaluate(() => getComputedStyle(document.querySelector(".cc-caja")).display);
  if (display === "none") mal("y sin embargo el recuadro sigue sin verse");
  else bien("y con eso el recuadro se destapa en el acto, sin recargar");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  await pruebaLetrasNoSonPiezas(browser);
  await pruebaTableros(browser);
  await pruebaRecuadro(browser);
  await pruebaResolver(browser);
  await pruebaEstudio(browser);
  await pruebaAtajos(browser);
  await pruebaModoNormal(browser);
  await pruebaInterruptor(browser);
  await browser.close();
  console.log(fallos ? `\n${fallos} comprobaciones fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
