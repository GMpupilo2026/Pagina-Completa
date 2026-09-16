/* Comprueba, en un navegador de verdad y con un Supabase de mentira, que el
   contenido que se abre de a poco esté TODO abierto para quien administra y
   siga abriéndose una a una para el resto.

   Son los cuatro lugares donde el sitio esconde lo que viene después:

     1. cursos/academia/<curso>.html  — las lecciones del curso (js/curso-academia.js)
     2. entreno/aprender.html         — las lecciones de Aprende
     3. concentracion.html            — los niveles de Concentración
     4. ilumina-tablero.html          — los niveles de Ilumina el tablero

   En cada uno se abre la página tres veces con el MISMO progreso (ninguno) y
   lo único que cambia es quién mira. Lo que se mide es cuántas quedaron
   abiertas: con administración, todas; con perfil de alumno o de PROFESOR,
   solo la primera — al profesor esto no le cambia nada, para eso tiene
   "Desbloquear hasta el tema" en Informes.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-contenido-admin.js                     */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

// Un Supabase de mentira: sesión iniciada, sin nada de progreso, y profiles
// devolviendo el is_admin que se le pida. Todo lo demás responde vacío.
function clienteFalso(quien) {
  return `
(function () {
  const PERFIL = ${JSON.stringify(quien.perfil)};
  function constructor(filas) {
    let unica = false;
    const b = {
      select() { return b; }, eq() { return b; }, order() { return b; }, in() { return b; },
      limit() { return b; }, range() { return b; }, is() { return b; }, not() { return b; },
      gte() { return b; }, lte() { return b; }, upsert() { return b; }, insert() { return b; },
      update() { return b; }, delete() { return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = filas;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u-quien" }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: "u-quien" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t === "profiles" ? [PERFIL] : []),
    rpc: () => constructor([]),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

// chess.js local, si está (npm install chess.js@0.10.3).
let CHESSJS = "";
for (const dir of [process.env.NODE_PATH || "", path.join(__dirname, "..", "node_modules")]) {
  for (const base of String(dir).split(path.delimiter).filter(Boolean)) {
    const f = path.join(base, "chess.js", "chess.js");
    if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
  }
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = String(hallado), b = String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const QUIENES = [
  { nombre: "alumno",         abreTodo: false, perfil: { id: "u-quien", is_admin: false, role: "alumno",   full_name: "Ana Rojas",    email: "ana@x.cr" } },
  { nombre: "profesor",       abreTodo: false, perfil: { id: "u-quien", is_admin: false, role: "profesor", full_name: "Karina Rojas", email: "karina@x.cr" } },
  { nombre: "administración", abreTodo: true,  perfil: { id: "u-quien", is_admin: true,  role: "profesor", full_name: "Oscar Angulo", email: "oscar@x.cr" } },
];

async function abrir(browser, ruta, quien) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  // chess.js viene de cdnjs y acá no hay salida a internet: se sirve el que
  // esté instalado, o nada (las listas se pintan igual).
  await page.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(quien) }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, errores };
}

// Cada caso dice a dónde ir, cómo esperar a que pinte y cómo contar
// "cuántas hay" y "cuántas están abiertas".
const CASOS = [
  {
    nombre: "Curso en Academia (Finales prácticos)",
    ruta: "/cursos/academia/finales-practicos.html",
    listo: () => document.querySelectorAll("#course-content-body details > summary > .ac-marca").length > 0,
    contar: () => {
      // Las lecciones van dentro de su bloque, así que no son hijas directas:
      // son los <details> que js/curso-academia.js marcó con su ✔/🔒.
      const d = [...document.querySelectorAll("#course-content-body details")]
        .filter((x) => x.querySelector(":scope > summary > .ac-marca"));
      return { total: d.length, abiertas: d.filter((x) => !x.classList.contains("ac-bloqueada")).length };
    },
  },
  {
    nombre: "Aprende (lecciones)",
    ruta: "/entreno/aprender.html",
    listo: () => document.querySelectorAll("#lesson-list .lesson-item").length > 0,
    contar: () => {
      const b = [...document.querySelectorAll("#lesson-list .lesson-item")];
      return { total: b.length, abiertas: b.filter((x) => !x.disabled).length };
    },
  },
  {
    nombre: "Concentración (niveles)",
    ruta: "/concentracion.html",
    listo: () => document.querySelectorAll("#levels-grid button").length > 0,
    contar: () => {
      const b = [...document.querySelectorAll("#levels-grid button")];
      return { total: b.length, abiertas: b.filter((x) => !x.disabled).length };
    },
  },
  {
    nombre: "Ilumina el tablero (niveles)",
    ruta: "/ilumina-tablero.html",
    listo: () => document.querySelectorAll("#levels-groups button").length > 0,
    contar: () => {
      const b = [...document.querySelectorAll("#levels-groups button")];
      return { total: b.length, abiertas: b.filter((x) => !x.disabled).length };
    },
  },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    for (const caso of CASOS) {
      console.log("\n=== " + caso.nombre + " ===");
      for (const quien of QUIENES) {
        const { page, errores } = await abrir(browser, caso.ruta, quien);
        try {
          await page.waitForFunction(caso.listo, { timeout: 20000 });
          const { total, abiertas } = await page.evaluate(caso.contar);
          if (total < 2) { console.log("  ✗ " + quien.nombre + ": hacen falta al menos 2 para probar el orden (" + total + ")"); fallos += 1; }
          else igual(quien.nombre + ": abiertas de " + total, abiertas, quien.abreTodo ? total : 1);
          if (errores.length) { console.log("  ✗ errores en la página (" + quien.nombre + "): " + errores.join(" | ")); fallos += 1; }
        } catch (e) {
          console.log("  ✗ " + quien.nombre + ": no pintó — " + e.message + (errores.length ? " | " + errores.join(" | ") : ""));
          fallos += 1;
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
