/* Comprueba, en un navegador de verdad y con un Supabase de mentira, la OTRA
   mitad de la videollamada de la clase: la tarjeta de `configuracion.html`
   donde el profesor pega el enlace de su sala.

   El botón del alumno lo comprueba `verificar-panel.js`, que es donde vive. Sin
   esta mitad esa no sirve de nada: si guardar no manda lo que tiene que mandar,
   el botón del panel se queda con el candado puesto para siempre y el alumno no
   tiene forma de saber que el problema no es suyo.

   Lo que se mira acá es lo que se rompe callado:

   1. QUE LA TARJETA SEA DE QUIEN DA CLASE. A un alumno no se le pinta: la base
      le rechazaría el insert igual, pero el fallo lo descubriría él.
   2. QUE UN ENLACE MALO NO VIAJE. `javascript:` y `http://` se paran acá con
      una explicación; si viajaran, volverían con el error del CHECK justo
      cuando quien lo apretó ya no sabe qué arreglar.
   3. QUE SE MANDE LO CORRECTO: un upsert sobre `profesor_videollamada` con el
      id de QUIEN GUARDA. Con otro id se estaría escribiendo la sala de otra
      persona, y la pantalla se vería igual de bien.
   4. QUE SE ENSEÑE LO QUE QUEDÓ GUARDADO, no lo que se escribió: el servidor
      le quita los espacios, y enseñar lo propuesto deja a quien guarda
      creyendo que guardó otra cosa.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-videollamada.js                           */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE  = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null };
const ALUMNA = { id: "u-ana",   role: "alumno",   is_admin: false, es_coordinador: false, full_name: "Ana Rojas",    email: "ana@x.cr",    grupo: "7B" };

function clienteFalso(perfiles, usuarioId, sala) {
  return `
window.__consultas = [];
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  let SALA = ${JSON.stringify(sala || null)};

  function constructor(tabla) {
    const anotado = { tabla: tabla, eq: {}, upsert: null, borro: false };
    window.__consultas.push(anotado);
    let filas = tabla === "profiles" ? PERFILES.slice()
      : (tabla === "profesor_videollamada" && SALA ? [SALA] : []);
    let unica = false;
    const b = {
      select() { return b; },
      eq(col, val) { anotado.eq[col] = val; filas = filas.filter((r) => String(r[col]) === String(val)); return b; },
      // El servidor le quita los espacios, como hace el trigger de la tabla:
      // así la prueba puede exigir que se enseñe lo GUARDADO y no lo escrito.
      upsert(obj, opts) {
        anotado.upsert = { obj: obj, opts: opts || null };
        SALA = { profesor_id: obj.profesor_id, enlace: String(obj.enlace).trim() };
        filas = [SALA];
        return b;
      },
      delete() { anotado.borro = true; SALA = null; filas = []; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        const d = unica ? (filas.length ? filas[0] : null) : filas;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t),
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
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

async function abrir(browser, perfiles, quien, sala) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfiles, quien, sala) }));
  const page = await ctx.newPage();
  await page.goto(BASE + "/configuracion.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx };
}

// Lo que se mandó a la base, ya filtrado: la tabla que importa.
const ESCRITURAS = () => window.__consultas.filter((c) => c.tabla === "profesor_videollamada");

async function pruebas(browser) {
  console.log("\n=== La sala de videollamada, en Configuración ===");

  // 1. La tarjeta es de quien da clase.
  let r = await abrir(browser, [ALUMNA], "u-ana", null);
  /* Se mide el `display` que calcula el navegador y no el atributo: la lección
     que dejó el cartel de instalar la app, que llevaba meses saliendo siempre
     porque `hidden` perdía contra una clase de Tailwind. */
  igual("a la alumna no se le pinta la tarjeta",
    await r.page.evaluate(() => document.getElementById("videollamada").checkVisibility()), "false");
  igual("…ni se le pide nada a esa tabla",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "profesor_videollamada").length), "0");
  await r.ctx.close();

  // 2. A la profesora sí, y con lo que ya tenía puesto.
  r = await abrir(browser, [PROFE], "u-profe", { profesor_id: "u-profe", enlace: "https://meet.google.com/vieja-sala" });
  igual("a la profesora se le pinta",
    await r.page.evaluate(() => document.getElementById("videollamada").checkVisibility()), "true");
  igual("…y se le enseña la sala que ya tenía",
    await r.page.inputValue("#videollamada-input"), "https://meet.google.com/vieja-sala");
  igual("…con la opción de quitarla",
    await r.page.evaluate(() => !document.getElementById("videollamada-quitar").hidden), "true");
  await r.ctx.close();

  // 3. Un enlace que no sirve no viaja, y se dice por qué.
  for (const malo of ["javascript:alert(1)", "http://meet.google.com/abc", "meet.google.com/abc", "no es un enlace"]) {
    r = await abrir(browser, [PROFE], "u-profe", null);
    await r.page.fill("#videollamada-input", malo);
    await r.page.click("#videollamada-save");
    await r.page.waitForTimeout(150);
    const escrituras = await r.page.evaluate(ESCRITURAS);
    igual(`«${malo}» no se manda a la base`, escrituras.filter((c) => c.upsert).length, "0");
    igual("…y se dice qué tiene que ser",
      /empezar con https:\/\//.test(await r.page.textContent("#videollamada-msg")), "true");
    await r.ctx.close();
  }

  // 4. El bueno se manda, con el id de quien guarda.
  r = await abrir(browser, [PROFE], "u-profe", null);
  await r.page.fill("#videollamada-input", "  https://zoom.us/j/123456789  ");
  await r.page.click("#videollamada-save");
  await r.page.waitForTimeout(200);
  const escrituras = await r.page.evaluate(ESCRITURAS);
  const up = escrituras.find((c) => c.upsert);
  igual("el enlace bueno se guarda con el id de quien lo guarda",
    up && [up.upsert.obj.profesor_id, up.upsert.obj.enlace],
    ["u-profe", "https://zoom.us/j/123456789"]);
  /* Sin `onConflict`, guardar por segunda vez sería un insert repetido sobre la
     clave primaria y el error saldría en la cara de quien solo quería corregir
     su enlace. */
  igual("…y reemplazando la que hubiera, no insertando otra",
    up && up.upsert.opts && up.upsert.opts.onConflict, "profesor_id");
  igual("…y lo que queda en pantalla es lo que devolvió el servidor",
    await r.page.inputValue("#videollamada-input"), "https://zoom.us/j/123456789");
  igual("…diciendo qué van a ver los alumnos y cuándo",
    /Entrar a Zoom[\s\S]*mientras tengas una clase abierta/.test(await r.page.textContent("#videollamada-msg")), "true");

  // 5. Quitarla borra la suya, no la de cualquiera.
  await r.page.click("#videollamada-quitar");
  await r.page.waitForTimeout(200);
  const borrados = (await r.page.evaluate(ESCRITURAS)).filter((c) => c.borro);
  igual("quitar borra la fila propia, filtrada por su id",
    borrados.length === 1 && borrados[0].eq.profesor_id, "u-profe");
  igual("…y la pantalla queda vacía", await r.page.inputValue("#videollamada-input"), "");
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try { await pruebas(browser); } finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nLa sala de videollamada se guarda como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
