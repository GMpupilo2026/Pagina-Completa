/* Comprueba, en un navegador de verdad y con un Supabase de mentira, la
   burbuja de "quién está conectado" (js/burbuja-en-linea.js).

   Existe porque TODO lo que se rompe acá se rompe callado, y lo descubre la
   persona que no puede arreglarlo:

   1. QUE LO QUE LLEGA POR EL CANAL NO SE CREA. Un canal de presencia de
      Supabase lo escucha y lo escribe cualquiera con sesión: no pasa por la
      RLS. Si la lista pintara lo que le llega, un intruso saldría en la
      burbuja del profesor con el nombre que él mismo eligiera, y la pantalla
      se vería perfecta — el fallo aparecería recién al mandarle un mensaje
      que la base rechaza, sin que nadie entienda por qué. El nombre que se
      pinta sale de `profiles`, donde la RLS solo le devuelve sus alumnos.
   2. QUE EL MENSAJE VAYA AL HILO CORRECTO. Un `student_id` equivocado deja el
      mensaje en la conversación de otro alumno: se manda, se guarda, y el que
      tenía que leerlo nunca se entera.
   3. QUE AL ALUMNO NO LE ESTORBE. Sin mensajes no se le pinta nada — se mide
      lo que calcula el navegador, no la clase, que es la lección que dejó el
      cartel de instalar la app.
   4. QUE EL ALUMNO SE ANUNCIE A TODOS SUS PROFESORES, no solo al principal:
      con dos, al segundo la burbuja le diría "0 alumnos en línea" para
      siempre y no fallaría nada.
   5. QUE "CONECTADO" SIGNIFIQUE LO MISMO que en el resto del sitio: con la
      pestaña de fondo se deja de anunciar, como en js/tiempo-plataforma.js.
   6. QUE EL NOMBRE AJENO NO SE EJECUTE: lo escribe el propio alumno.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-burbuja.js                              */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.dirname(__dirname);
const PAGINA = "/subgrupos.html";   // liviana y de la Academia: la burbuja va en todas

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "karina@x.cr" };
const OTRA_PROFE = { id: "u-profe2", role: "profesor", is_admin: false, full_name: "Laura Mena", email: "laura@x.cr" };
const ANA = { id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" };
/* Su nombre ataca de las dos formas a la vez: una etiqueta para el cuerpo y
   una comilla para un atributo. La misma trampa que ya se le puso a Informes. */
const SOFIA = {
  id: "u-sofia", role: "alumno", is_admin: false, email: "sofia@x.cr",
  full_name: 'Sofía <img src=x onerror="window.__xss=1"> "Muñoz"',
};

function clienteFalso(cfg) {
  return `
window.__consultas = [];
window.__canales = {};
(function () {
  const PERFILES = ${JSON.stringify(cfg.perfiles || [])};
  const YO = ${JSON.stringify(cfg.yo)};
  const CLASES = ${JSON.stringify(cfg.clases || [])};
  let CHAT = ${JSON.stringify(cfg.chat || [])};

  function constructor(tabla, filasBase) {
    const anotado = { tabla: tabla, eq: {}, in: null, gt: null, insert: null, limite: null };
    window.__consultas.push(anotado);
    let filas = (filasBase || []).slice(), unica = false;
    const b = {
      select() { return b; },
      eq(col, val) { anotado.eq[col] = val; filas = filas.filter((r) => String(r[col]) === String(val)); return b; },
      /* Filtra DE VERDAD: un doble que devolviera siempre la tabla entera
         daría por buena una burbuja que mezcla los hilos de dos alumnos. */
      in(col, vals) { anotado.in = { col: col, vals: vals }; filas = filas.filter((r) => vals.indexOf(r[col]) >= 0); return b; },
      gt(col, val) { anotado.gt = { col: col, val: val }; filas = filas.filter((r) => String(r[col]) > String(val)); return b; },
      order(col, o) { const asc = !o || o.ascending !== false;
        filas = filas.slice().sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : 1) * (asc ? 1 : -1)); return b; },
      limit(n) { anotado.limite = n; filas = filas.slice(0, n); return b; },
      insert(obj) { anotado.insert = obj; CHAT = CHAT.concat([Object.assign({
        id: "m" + (CHAT.length + 1), created_at: new Date().toISOString(),
      }, obj)]); filas = []; return b; },
      single() { unica = true; return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        const d = unica ? (filas.length ? filas[0] : null) : filas;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  function tablaDe(t) {
    if (t === "profiles") return PERFILES;
    if (t === "class_chat_messages") {
      // Como lo devuelve PostgREST con el join a profiles por sender_id.
      return CHAT.map((m) => Object.assign({}, m, {
        profiles: PERFILES.filter((p) => p.id === m.sender_id)[0] || null,
      }));
    }
    return [];
  }

  /* El doble de un canal de presencia. Guarda lo que se anuncia (track) para
     poder comprobar A QUIÉN se anuncia el alumno, y deja sembrar presencia
     ajena desde la prueba para ver qué hace la pantalla con ella. */
  function canalFalso(nombre) {
    const c = {
      nombre: nombre, syncs: [], cambios: [], tracks: [], untracks: 0, estado: {},
      on(tipo, a, b) {
        if (tipo === "presence") c.syncs.push(b || a);
        else c.cambios.push({ opciones: a, cb: b });
        return c;
      },
      subscribe(cb) { if (cb) cb("SUBSCRIBED"); return c; },
      presenceState() { return c.estado; },
      track(meta) { c.tracks.push(meta); return Promise.resolve("ok"); },
      untrack() { c.untracks += 1; return Promise.resolve("ok"); },
      unsubscribe() { return Promise.resolve("ok"); },
    };
    window.__canales[nombre] = c;
    return c;
  }

  /* Siembra quién está conectado y dispara el sync, como haría Realtime. */
  window.__sembrar = function (nombre, metas) {
    const c = window.__canales[nombre];
    if (!c) return "no existe el canal " + nombre;
    c.estado = {};
    metas.forEach((m) => { c.estado[m.id] = [m]; });
    c.syncs.forEach((f) => f());
    return "ok";
  };

  /* Un mensaje nuevo que llega por Realtime. */
  window.__mensajeNuevo = function (fila) {
    CHAT = CHAT.concat([fila]);
    Object.keys(window.__canales).forEach((n) => {
      window.__canales[n].cambios.forEach((x) => {
        const f = x.opciones && x.opciones.filter;
        if (f && f.indexOf("student_id=eq.") === 0 && f.slice(14) !== fila.student_id) return;
        x.cb({ new: fila, eventType: "INSERT" });
      });
    });
    return "ok";
  };

  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO }, access_token: "t" } } }),
            signOut: () => Promise.resolve({}) },
    from: (t) => constructor(t, tablaDe(t)),
    rpc: (n) => constructor(n, n === "mis_clases" ? CLASES : []),
    channel: ${JSON.stringify(!!cfg.sinCanales)} ? undefined : (n) => canalFalso(n),
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

async function abrir(browser, cfg) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  const page = await ctx.newPage();
  await page.goto(BASE + PAGINA, { waitUntil: "networkidle" });
  // La burbuja se monta sola; se espera a que exista o a que se decida no pintarla.
  await page.waitForTimeout(1200);
  return { page, ctx };
}

/* Lo que se VE de la burbuja, leído de la pantalla y no de ninguna variable. */
const LEER = () => {
  const b = document.getElementById("burbuja-boton");
  const panel = document.getElementById("burbuja-panel");
  return {
    hayBurbuja: !!document.getElementById("burbuja-en-linea"),
    botonVisible: !!b && b.checkVisibility(),
    etiqueta: b ? b.innerText.replace(/\s+/g, " ").trim() : null,
    panelVisible: !!panel && panel.checkVisibility(),
    titulo: panel ? (panel.querySelector("#burbuja-titulo") || {}).textContent : null,
    filas: Array.from(document.querySelectorAll("#burbuja-cuerpo [data-alumno]"))
      .map((f) => ({ id: f.dataset.alumno, texto: f.innerText.replace(/\s+/g, " ").trim() })),
    mensajes: Array.from(document.querySelectorAll("#burbuja-cuerpo .max-w-\\[85\\%\\]"))
      .map((m) => m.innerText.replace(/\s+/g, " ").trim()),
  };
};

const ENVIOS = () => window.__consultas.filter((c) => c.tabla === "class_chat_messages" && c.insert)
  .map((c) => c.insert);

async function pruebaProfesor(browser) {
  console.log("\n=== La burbuja de quien da clase ===");
  const r = await abrir(browser, {
    yo: "u-profe", perfiles: [PROFE, ANA, SOFIA],
    chat: [],
  });
  const p = r.page;

  igual("la burbuja se monta", (await p.evaluate(LEER)).hayBurbuja, "true");
  igual("sin nadie conectado dice cero",
    (await p.evaluate(LEER)).etiqueta, "🟢 0 alumnos en línea");

  /* Se anuncian dos alumnos suyos Y UN INTRUSO que no lo es. El intruso manda
     el nombre que quiere: es lo que puede hacer cualquiera con sesión, porque
     un canal de presencia no pasa por la RLS. */
  igual("se siembra la presencia en el canal del profesor",
    await p.evaluate(() => window.__sembrar("academia-en-linea:u-profe", [
      { id: "u-ana", nombre: "Ana Rojas", pagina: "Mates", desde: new Date().toISOString() },
      { id: "u-sofia", nombre: "NOMBRE FALSO DEL CANAL", pagina: "4×4", desde: new Date().toISOString() },
      { id: "u-intruso", nombre: "Soy tu alumno", pagina: "Informes", desde: new Date().toISOString() },
    ])), "ok");
  await p.waitForTimeout(400);

  igual("cuenta SOLO a los alumnos que la base reconoce",
    (await p.evaluate(LEER)).etiqueta, "🟢 2 alumnos en línea");
  igual("los nombres se piden acotados con .in, nunca la tabla entera",
    await p.evaluate(() => {
      const c = window.__consultas.filter((x) => x.tabla === "profiles" && x.in);
      return c.length ? c[c.length - 1].in.vals.slice().sort().join(",") : "(sin .in)";
    }), "u-ana,u-intruso,u-sofia");

  // Se abre el panel.
  await p.click("#burbuja-boton");
  await p.waitForTimeout(300);
  let v = await p.evaluate(LEER);
  igual("el panel se ve", v.panelVisible, "true");
  igual("el intruso NO se pinta", v.filas.map((f) => f.id).sort().join(","), "u-ana,u-sofia");
  igual("el nombre que se pinta es el de la BASE, no el del canal",
    v.filas.some((f) => f.texto.indexOf("NOMBRE FALSO") >= 0) ? "salió el del canal" : "el de la base",
    "el de la base");
  igual("el nombre ajeno no se ejecuta",
    await p.evaluate(() => window.__xss === undefined ? "no se ejecutó" : "SE EJECUTÓ"), "no se ejecutó");
  igual("…y se sigue viendo, literal",
    v.filas.some((f) => f.texto.indexOf('Sofía <img src=x onerror="window.__xss=1"> "Muñoz"') >= 0), "true");
  igual("dice en qué página anda cada uno",
    v.filas.filter((f) => /Mates|4×4/.test(f.texto)).length, "2");

  // Se le escribe a Ana.
  await p.click('#burbuja-cuerpo [data-alumno="u-ana"]');
  await p.waitForTimeout(300);
  igual("el hilo se abre con su nombre", (await p.evaluate(LEER)).titulo, "Ana Rojas");
  await p.fill("#burbuja-texto", "¿Cómo vas con los finales?");
  await p.click('#burbuja-form button[type="submit"]');
  await p.waitForTimeout(400);
  igual("el mensaje se manda al hilo de ESE alumno y firmado por quien escribe",
    await p.evaluate(ENVIOS),
    [{ sender_id: "u-profe", student_id: "u-ana", body: "¿Cómo vas con los finales?" }]);
  igual("y se ve en la conversación",
    (await p.evaluate(LEER)).mensajes.join(" | "), "Tú ¿Cómo vas con los finales?");

  /* Le contesta Sofía, que es OTRO hilo: no puede pisar la conversación
     abierta, pero sí tiene que avisar. */
  await p.evaluate(() => window.__mensajeNuevo({
    id: "mx", student_id: "u-sofia", sender_id: "u-sofia", body: "Profe, no entendí", created_at: new Date().toISOString(),
  }));
  await p.waitForTimeout(400);
  v = await p.evaluate(LEER);
  igual("el mensaje de otro alumno avisa sin cambiar de conversación", v.titulo, "Ana Rojas");
  igual("…y se cuenta como sin leer", /1 sin leer/.test(v.etiqueta), "true");

  await r.ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La burbuja de la alumna ===");
  const DOS_PROFES = [
    { profesor_id: "u-profe", profesor: "Karina Rojas", es_principal: true, clase_abierta: false },
    { profesor_id: "u-profe2", profesor: "Laura Mena", es_principal: false, clase_abierta: false },
  ];

  // 1. Sin mensajes, nada que estorbe.
  let r = await abrir(browser, { yo: "u-ana", perfiles: [ANA, PROFE, OTRA_PROFE], clases: DOS_PROFES, chat: [] });
  let v = await r.page.evaluate(LEER);
  igual("sin mensajes no se le pinta ningún botón", v.botonVisible, "false");

  /* El error fácil: anunciarse solo al profesor principal. Al segundo la
     burbuja le diría "0 alumnos en línea" para siempre y no fallaría nada. */
  igual("se anuncia a SUS DOS profesores",
    await r.page.evaluate(() => Object.keys(window.__canales)
      .filter((n) => n.indexOf("academia-en-linea:") === 0).sort().join(",")),
    "academia-en-linea:u-profe,academia-en-linea:u-profe2");
  igual("y en los dos manda su página, no su correo",
    await r.page.evaluate(() => {
      const t = (window.__canales["academia-en-linea:u-profe2"].tracks || [])[0] || {};
      return [t.id, !!t.pagina, t.email === undefined].join("|");
    }), "u-ana|true|true");

  // 2. Le llega un mensaje de su profe: ahí sí se le pinta.
  await r.page.evaluate(() => window.__mensajeNuevo({
    id: "m9", student_id: "u-ana", sender_id: "u-profe", body: "Nos vemos a las 3", created_at: new Date().toISOString(),
  }));
  await r.page.waitForTimeout(400);
  v = await r.page.evaluate(LEER);
  igual("con un mensaje sin leer sí se le pinta", v.botonVisible, "true");
  igual("…y dice de quién es", v.etiqueta, "🟢 1 mensaje de tu profe");

  await r.page.click("#burbuja-boton");
  await r.page.waitForTimeout(300);
  v = await r.page.evaluate(LEER);
  igual("al abrirlo ve el mensaje", v.mensajes.join(" | "), "Karina Rojas Nos vemos a las 3");
  igual("y no se le ofrece elegir con quién hablar", v.filas.length, "0");

  await r.page.fill("#burbuja-texto", "Ahí estaré");
  await r.page.click('#burbuja-form button[type="submit"]');
  await r.page.waitForTimeout(400);
  igual("contesta en SU propio hilo", await r.page.evaluate(ENVIOS),
    [{ sender_id: "u-ana", student_id: "u-ana", body: "Ahí estaré" }]);
  await r.ctx.close();

  // 3. Un alumno sin ningún profesor no tiene a quién anunciarse.
  r = await abrir(browser, { yo: "u-ana", perfiles: [ANA], clases: [], chat: [] });
  igual("sin profesores no se monta nada", (await r.page.evaluate(LEER)).hayBurbuja, "false");
  await r.ctx.close();
}

async function pruebaInactividad(browser) {
  console.log("\n=== \"Conectado\" quiere decir lo mismo que en el resto del sitio ===");
  const r = await abrir(browser, {
    yo: "u-ana", perfiles: [ANA, PROFE], chat: [],
    clases: [{ profesor_id: "u-profe", profesor: "Karina Rojas", es_principal: true, clase_abierta: false }],
  });
  const canal = "academia-en-linea:u-profe";
  igual("con la pestaña visible se anuncia",
    await r.page.evaluate((c) => window.__canales[c].tracks.length > 0, canal), "true");

  /* Con la pestaña de fondo se deja de anunciar, igual que
     js/tiempo-plataforma.js deja de tocar su fila: si no, el profesor vería
     "conectado" a quien dejó la página abierta y se fue. */
  await r.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await r.page.waitForTimeout(400);
  igual("con la pestaña de fondo se deja de anunciar",
    await r.page.evaluate((c) => window.__canales[c].untracks > 0, canal), "true");
  await r.ctx.close();
}

/* Sin navegador: que la línea esté donde tiene que estar y no donde no. */
function pruebaPaginas() {
  console.log("\n=== Dónde va y dónde no ===");
  const cab = fs.readFileSync(path.join(RAIZ, "herramientas/academia-cabecera.py"), "utf8");
  const lista = (cab.match(/^PAGINAS = \[([\s\S]*?)\]/m) || [])[1] || "";
  const paginas = (lista.match(/"([^"]+\.html)"/g) || []).map((s) => s.slice(1, -1));
  const sin = (((cab.match(/^SIN_BURBUJA = \{([^}]*)\}/m) || [])[1] || "").match(/"([^"]+)"/g) || [])
    .map((s) => s.slice(1, -1));

  igual("la lista de páginas de la Academia no está vacía", paginas.length > 40, "true");
  igual("las dos exceptuadas están escritas", sin.slice().sort().join(","), "examen.html,sesion.html");

  const malas = [], sinScript = [];
  for (const p of paginas) {
    const s = fs.readFileSync(path.join(RAIZ, p), "utf8");
    const m = s.match(/<!-- burbuja: inicio -->([\s\S]*?)<!-- burbuja: fin -->/);
    if (sin.indexOf(p) >= 0) { if (m) malas.push(p); continue; }
    if (!m) { sinScript.push(p); continue; }
    // La ruta relativa tiene que llegar de verdad al archivo: un 404 no avisa.
    const src = (m[1].match(/src="([^"]+)"/) || [])[1] || "";
    const destino = path.resolve(path.dirname(path.join(RAIZ, p)), src);
    if (!fs.existsSync(destino)) malas.push(p + " (la ruta " + src + " no llega al archivo)");
  }
  igual("todas las páginas de la Academia la llevan", sinScript.join(", ") || "(todas)", "(todas)");
  igual("ninguna la lleva donde no debe y ninguna ruta es un 404", malas.join(", ") || "(ninguna)", "(ninguna)");
}

/* La burbuja se agrega a 56 páginas que ya funcionaban. Si revienta, no solo
   no aparece: deja un TypeError en la consola de páginas que no tienen nada
   que ver con ella — y ahí es donde se esconden los errores de verdad. Pasó:
   los dobles de media docena de verificadores no tienen canales de presencia,
   y `verificar-notas.js` empezó a fallar por «sin errores en la consola». */
async function pruebaNoEnsucia(browser) {
  console.log("\n=== Un cliente recortado no la hace reventar ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const errores = [];
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({
    status: 200, contentType: "application/javascript",
    body: clienteFalso({ yo: "u-profe", perfiles: [PROFE], chat: [], sinCanales: true }),
  }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  await page.goto(BASE + PAGINA, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  igual("sin canales de presencia no se monta", (await page.evaluate(LEER)).hayBurbuja, "false");
  igual("…y no deja ni un error en la consola",
    errores.filter((e) => /burbuja|sb\.|is not a function/i.test(e)).join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  pruebaPaginas();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
    await pruebaInactividad(browser);
    await pruebaNoEnsucia(browser);
  } finally { await browser.close(); }
  console.log(fallos ? `\n❌ ${fallos} comprobaciones fallaron.` : "\n✅ La burbuja hace lo que promete.");
  process.exit(fallos ? 1 : 0);
})();
