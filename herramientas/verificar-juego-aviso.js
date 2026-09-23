/* Comprueba, en un navegador de verdad y con un Supabase de mentira, el aviso
   de partida asignada (js/juego-aviso.js).

   Existe porque hasta esta tanda el aviso solo funcionaba en juegos.html y
   clases.html —las dos únicas páginas que cargaban el script y llamaban a
   mano JuegoAviso.iniciar()—: un alumno resolviendo un ejercicio en cualquier
   otra página cuando el profesor lo pareaba no se enteraba de nada, sin que
   nada fallara. Ahora se autoarranca solo, en toda página de la Academia
   menos examen.html. Lo que se rompe acá se rompe callado:

   1. QUE LA LÍNEA ESTÉ DONDE TIENE QUE ESTAR (todas las páginas de la
      Academia menos examen.html, incluida sesion.html) Y NO DONDE NO.
   2. QUE A UN PROFESOR O A QUIEN ADMINISTRA NO SE LES SUSCRIBA NADA: a ellos
      no se les traslada a ningún lado, porque son quienes arman el pareo.
   3. QUE EL AVISO APAREZCA EN CUALQUIER PÁGINA, no solo en Juegos — es lo
      que este cambio viene a resolver, así que se prueba en una página que
      no es ni juegos.html ni clases.html.
   4. QUE "ENTRAR AHORA" LLEVE A LA PÁGINA Y LA SALA CORRECTAS, tanto para
      una partida de 2 como de 4 jugadores.
   5. QUE UNA PARTIDA AJENA NO DISPARE NADA.
   6. QUE UN CLIENTE RECORTADO (sin canales) no deje ni un error en la
      consola de una página que no tiene nada que ver con esto.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-juego-aviso.js                          */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.dirname(__dirname);
// Liviana y de la Academia, y —a propósito— NI juegos.html NI clases.html:
// esas dos ya probaban esto antes; lo nuevo es que llegue a cualquier otra.
const PAGINA = "/subgrupos.html";

const ANA = { id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" };
const PROFE = { id: "u-profe", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "karina@x.cr" };
const ADMIN = { id: "u-admin", role: "admin", is_admin: true, full_name: "Oscar Angulo", email: "oscar@x.cr" };

function clienteFalso(cfg) {
  return `
window.__consultas = [];
window.__canales = {};
(function () {
  const PERFILES = ${JSON.stringify(cfg.perfiles || [])};
  const YO = ${JSON.stringify(cfg.yo)};

  function constructor(tabla, filasBase) {
    const anotado = { tabla: tabla, eq: {} };
    window.__consultas.push(anotado);
    let filas = (filasBase || []).slice(), unica = false;
    const b = {
      select() { return b; },
      eq(col, val) { anotado.eq[col] = val; filas = filas.filter((r) => String(r[col]) === String(val)); return b; },
      or(expr) { anotado.or = expr; return b; },
      in(col, vals) { anotado.in = { col: col, vals: vals }; filas = filas.filter((r) => vals.map(String).includes(String(r[col]))); return b; },
      order() { return b; },
      limit(n) { filas = filas.slice(0, n); return b; },
      single() { unica = true; return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        const d = unica ? (filas.length ? filas[0] : null) : filas;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  function tablaDe(t) { return t === "profiles" ? PERFILES : []; }

  /* El doble de un canal: guarda los postgres_changes registrados para poder
     dispararlos desde la prueba, como haría Realtime. Sin filtro —igual que
     el código de verdad, que descarta del lado del cliente con esMia(). */
  function canalFalso(nombre) {
    const c = {
      nombre: nombre, cambios: [],
      on(tipo, opciones, cb) { c.cambios.push({ opciones: opciones, cb: cb }); return c; },
      subscribe(cb) { if (cb) cb("SUBSCRIBED"); return c; },
      unsubscribe() { return Promise.resolve("ok"); },
    };
    window.__canales[nombre] = c;
    return c;
  }

  /* Un INSERT que llega por Realtime a TODOS los canales suscritos a esa tabla. */
  window.__insertar = function (tabla, fila) {
    Object.keys(window.__canales).forEach((n) => {
      window.__canales[n].cambios.forEach((x) => {
        if (x.opciones.table !== tabla) return;
        x.cb({ new: fila, eventType: "INSERT" });
      });
    });
  };

  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: ${cfg.sinSesion ? "null" : "{ user: { id: YO } }"} } }) },
    from: (t) => constructor(t, tablaDe(t)),
    rpc: () => constructor("rpc", []),
    channel: ${cfg.sinCanal ? "undefined" : "(n) => canalFalso(n)"},
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

async function abrir(browser, cfg, capturarErrores) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const errores = [];
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  const page = await ctx.newPage();
  if (capturarErrores) {
    page.on("pageerror", (e) => errores.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  }
  await page.goto(BASE + PAGINA, { waitUntil: "networkidle" });
  // El script va con `defer` y se autoarranca: getSession → profiles → channel.
  await page.waitForTimeout(900);
  return { page, ctx, errores };
}

const LEER = () => {
  const box = document.getElementById("juego-aviso");
  const a = box ? box.querySelector("#juego-aviso-ir") : null;
  return {
    hayAviso: !!box,
    texto: box ? box.innerText.replace(/\s+/g, " ").trim() : null,
    href: a ? a.getAttribute("href") : null,
  };
};

const CANALES = () => Object.keys(window.__canales || {}).sort();

async function pruebaPaginas() {
  console.log("\n=== Dónde va y dónde no ===");
  const cab = fs.readFileSync(path.join(RAIZ, "herramientas/academia-cabecera.py"), "utf8");
  const lista = (cab.match(/^PAGINAS = \[([\s\S]*?)\]/m) || [])[1] || "";
  const paginas = (lista.match(/"([^"]+\.html)"/g) || []).map((s) => s.slice(1, -1));
  const sin = (((cab.match(/^SIN_JUEGO_AVISO = \{([^}]*)\}/m) || [])[1] || "").match(/"([^"]+)"/g) || [])
    .map((s) => s.slice(1, -1));

  igual("la lista de páginas de la Academia no está vacía", paginas.length > 40, "true");
  igual("solo examen.html se excluye (sesion.html SÍ lo lleva)", sin.slice().sort().join(","), "examen.html");

  const malas = [], sinScript = [];
  for (const p of paginas) {
    const s = fs.readFileSync(path.join(RAIZ, p), "utf8");
    const m = s.match(/<!-- juego-aviso: inicio -->([\s\S]*?)<!-- juego-aviso: fin -->/);
    if (sin.indexOf(p) >= 0) { if (m) malas.push(p); continue; }
    if (!m) { sinScript.push(p); continue; }
    const src = (m[1].match(/src="([^"]+)"/) || [])[1] || "";
    const destino = path.resolve(path.dirname(path.join(RAIZ, p)), src);
    if (!fs.existsSync(destino)) malas.push(p + " (la ruta " + src + " no llega al archivo)");
    if (!/\bdefer\b/.test(m[1])) malas.push(p + " (sin defer)");
  }
  igual("todas las páginas de la Academia la llevan, menos examen.html", sinScript.join(", ") || "(todas)", "(todas)");
  igual("ninguna ruta es un 404 y ninguna la lleva donde no debe", malas.join(", ") || "(ninguna)", "(ninguna)");
}

async function pruebaAlumnaEnOtraPagina(browser) {
  console.log("\n=== Le llega a la alumna en una página que NO es Juegos ni Clases ===");
  const r = await abrir(browser, { yo: "u-ana", perfiles: [ANA] });

  const canales = await r.page.evaluate(CANALES);
  igual("se suscribió a los dos canales de partida", canales, ["juego-aviso-2p-u-ana", "juego-aviso-4p-u-ana"]);
  igual("todavía no hay ningún aviso", (await r.page.evaluate(LEER)).hayAviso, "false");

  await r.page.evaluate(() => window.__insertar("game_rooms", {
    id: "sala-1", status: "playing", variant: "estandar", white_id: "u-ana", black_id: "u-profe",
  }));
  await r.page.waitForTimeout(300);
  const v = await r.page.evaluate(LEER);
  igual("aparece el aviso en ESTA página, sin estar en Juegos", v.hayAviso, "true");
  igual("dice de qué partida es", /Ajedrez estándar/.test(v.texto), "true");
  igual("\"Entrar ahora\" apunta a la página y la sala correctas", v.href, "estandar.html?room=sala-1");

  await r.ctx.close();
}

async function pruebaCuatroJugadores(browser) {
  console.log("\n=== También avisa de una partida de 4 jugadores ===");
  const r = await abrir(browser, { yo: "u-ana", perfiles: [ANA] });

  await r.page.evaluate(() => window.__insertar("fourplayer_games", {
    id: "sala-4", status: "playing", mode: "ffa",
    seats: { red: { player_id: "u-ana" }, blue: { player_id: "x" }, yellow: { player_id: "y" }, green: { player_id: "z" } },
  }));
  await r.page.waitForTimeout(300);
  const v = await r.page.evaluate(LEER);
  igual("aparece el aviso de 4 jugadores", v.hayAviso, "true");
  igual("lleva a cuatro-jugadores.html con SU sala", v.href, "cuatro-jugadores.html?room=sala-4");

  await r.ctx.close();
}

async function pruebaPartidaAjena(browser) {
  console.log("\n=== Una partida en la que no juega no dispara nada ===");
  const r = await abrir(browser, { yo: "u-ana", perfiles: [ANA] });

  await r.page.evaluate(() => window.__insertar("game_rooms", {
    id: "sala-9", status: "playing", variant: "estandar", white_id: "u-otro", black_id: "u-otro2",
  }));
  await r.page.waitForTimeout(300);
  igual("no le corresponde, no aparece nada", (await r.page.evaluate(LEER)).hayAviso, "false");

  await r.ctx.close();
}

async function pruebaProfesorYAdmin(browser) {
  console.log("\n=== A quien da clase o administra no se le suscribe nada ===");
  let r = await abrir(browser, { yo: "u-profe", perfiles: [PROFE] });
  igual("el profesor no tiene ningún canal de juego-aviso",
    (await r.page.evaluate(CANALES)).filter((n) => n.indexOf("juego-aviso") === 0), []);
  await r.ctx.close();

  r = await abrir(browser, { yo: "u-admin", perfiles: [ADMIN] });
  igual("quien administra tampoco (la regla permanente de la casa)",
    (await r.page.evaluate(CANALES)).filter((n) => n.indexOf("juego-aviso") === 0), []);
  await r.ctx.close();
}

async function pruebaSinSesion(browser) {
  console.log("\n=== Sin sesión no hace nada ===");
  const r = await abrir(browser, { yo: "u-ana", perfiles: [ANA], sinSesion: true });
  igual("no se suscribe a nada",
    (await r.page.evaluate(CANALES)).filter((n) => n.indexOf("juego-aviso") === 0), []);
  await r.ctx.close();
}

async function pruebaNoEnsucia(browser) {
  console.log("\n=== Un cliente recortado no la hace reventar ===");
  const r = await abrir(browser, { yo: "u-ana", perfiles: [ANA], sinCanal: true }, true);
  igual("sin `channel` no aparece ningún aviso", (await r.page.evaluate(LEER)).hayAviso, "false");
  igual("…y no deja ni un error en la consola",
    r.errores.filter((e) => /juego-aviso|sb\.|is not a function/i.test(e)).join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();
}

(async () => {
  await pruebaPaginas();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumnaEnOtraPagina(browser);
    await pruebaCuatroJugadores(browser);
    await pruebaPartidaAjena(browser);
    await pruebaProfesorYAdmin(browser);
    await pruebaSinSesion(browser);
    await pruebaNoEnsucia(browser);
  } finally { await browser.close(); }
  console.log(fallos ? `\n❌ ${fallos} comprobaciones fallaron.` : "\n✅ El aviso de partida asignada hace lo que promete.");
  process.exit(fallos ? 1 : 0);
})();
