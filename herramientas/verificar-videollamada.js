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
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE  = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null };
const ALUMNA = { id: "u-ana",   role: "alumno",   is_admin: false, es_coordinador: false, full_name: "Ana Rojas",    email: "ana@x.cr",    grupo: "7B" };

function clienteFalso(perfiles, usuarioId, salas, grupos) {
  return `
window.__consultas = [];
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  let SALAS = ${JSON.stringify(salas || [])};
  const GRUPOS = ${JSON.stringify(grupos || [])};

  function constructor(tabla, filasBase) {
    const anotado = { tabla: tabla, eq: {}, upsert: null, borro: false };
    window.__consultas.push(anotado);
    let filas = (filasBase || []).slice(), unica = false;
    const b = {
      select() { return b; },
      eq(col, val) { anotado.eq[col] = val; filas = filas.filter((r) => String(r[col]) === String(val)); return b; },
      /* El servidor le quita los espacios, como hace el trigger de la tabla:
         así la prueba puede exigir que se enseñe lo GUARDADO y no lo escrito. */
      upsert(obj, opts) {
        anotado.upsert = { obj: obj, opts: opts || null };
        const guardada = { profesor_id: obj.profesor_id, grupo: obj.grupo || "", enlace: String(obj.enlace).trim() };
        SALAS = SALAS.filter((x) => (x.grupo || "") !== guardada.grupo).concat([guardada]);
        filas = [guardada];
        return b;
      },
      /* El delete recuerda TODOS sus filtros: con uno solo —el profesor— se
         llevaría por delante las salas de sus otras sedes, y la pantalla se
         vería igual de bien. */
      delete() { anotado.borro = true; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        if (anotado.borro) {
          SALAS = SALAS.filter((x) => Object.keys(anotado.eq).some((c) => String(x[c] || "") !== String(anotado.eq[c])));
        }
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
    from: (t) => constructor(t, t === "profiles" ? PERFILES : (t === "profesor_videollamada" ? SALAS : [])),
    rpc: (n) => constructor(n, n === "grupos_de_mis_alumnos" ? GRUPOS : []),
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

async function abrir(browser, perfiles, quien, salas, grupos) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfiles, quien, salas, grupos) }));
  const page = await ctx.newPage();
  await page.goto(BASE + "/configuracion.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx };
}

const GRUPOS = [{ grupo: "SJ", alumnos: 12 }, { grupo: "CENFO", alumnos: 3 }];

// Lo que se mandó a esa tabla, que es lo único que de verdad importa acá.
const ESCRITURAS = () => window.__consultas.filter((c) => c.tabla === "profesor_videollamada");

// Las filas de la tarjeta, en el orden en que se ven.
const LEER_FILAS = () => Array.from(document.querySelectorAll("#videollamada-lista > [data-fila]")).map((f) => ({
  grupo: f.dataset.fila,
  etiqueta: f.querySelector("label").innerText.replace(/\s+/g, " ").trim(),
  valor: f.querySelector("input").value,
  tieneQuitar: !!f.querySelector("[data-quitar]"),
}));

async function pruebas(browser) {
  console.log("\n=== Las salas de videollamada, en Configuración ===");

  // 1. La tarjeta es de quien da clase.
  let r = await abrir(browser, [ALUMNA], "u-ana", [], GRUPOS);
  /* Se mide el `display` que calcula el navegador y no el atributo: la lección
     que dejó el cartel de instalar la app, que llevaba meses saliendo siempre
     porque `hidden` perdía contra una clase de Tailwind. */
  igual("a la alumna no se le pinta la tarjeta",
    await r.page.evaluate(() => document.getElementById("videollamada").checkVisibility()), "false");
  igual("…ni se le pide nada a esa tabla",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "profesor_videollamada").length), "0");
  await r.ctx.close();

  // 2. A la profesora, una fila por sede y la general al final.
  r = await abrir(browser, [PROFE], "u-profe",
    [{ profesor_id: "u-profe", grupo: "SJ", enlace: "https://meet.google.com/sj" }], GRUPOS);
  igual("a la profesora se le pinta",
    await r.page.evaluate(() => document.getElementById("videollamada").checkVisibility()), "true");
  let filas = await r.page.evaluate(LEER_FILAS);
  /* Los grupos primero y la general AL FINAL: es el respaldo —la reciben los
     grupos que no tengan sala propia— y arriba haría pensar que manda. */
  igual("una fila por grupo con alumnos suyos, y la general al final",
    filas.map((f) => f.grupo), ["SJ", "CENFO", ""]);
  /* Cuántos alumnos la van a recibir: sin ese número, «CENFO» y «CENFO con un
     solo alumno» se ven igual y no se sabe cuál vale la pena llenar. */
  igual("…cada una dice de qué clase es y a cuántos les llega",
    filas.slice(0, 2).map((f) => f.etiqueta), ["Clase de SJ · 12 alumnos", "Clase de CENFO · 3 alumnos"]);
  igual("…con lo que ya estaba guardado en su fila, y solo ahí",
    filas.map((f) => f.valor), ["https://meet.google.com/sj", "", ""]);
  igual("…y solo la que tiene algo ofrece quitarlo",
    filas.map((f) => f.tieneQuitar), [true, false, false]);
  await r.ctx.close();

  // 3. Un enlace que no sirve no viaja, y se dice por qué.
  for (const malo of ["javascript:alert(1)", "http://meet.google.com/abc", "meet.google.com/abc"]) {
    r = await abrir(browser, [PROFE], "u-profe", [], GRUPOS);
    await r.page.fill("#vll-SJ", malo);
    await r.page.click('[data-guardar="SJ"]');
    await r.page.waitForTimeout(150);
    igual(`«${malo}» no se manda a la base`,
      (await r.page.evaluate(ESCRITURAS)).filter((c) => c.upsert).length, "0");
    igual("…y se dice qué tiene que ser",
      /empezar con https:\/\//.test(await r.page.textContent('[data-msg="SJ"]')), "true");
    await r.ctx.close();
  }

  // 4. El bueno se manda, con su grupo y el id de quien guarda.
  r = await abrir(browser, [PROFE], "u-profe", [], GRUPOS);
  await r.page.fill("#vll-SJ", "  https://zoom.us/j/123456789  ");
  await r.page.click('[data-guardar="SJ"]');
  await r.page.waitForTimeout(200);
  const up = (await r.page.evaluate(ESCRITURAS)).find((c) => c.upsert);
  igual("la sala de SJ se guarda con SU grupo y el id de quien la guarda",
    up && [up.upsert.obj.profesor_id, up.upsert.obj.grupo, up.upsert.obj.enlace],
    ["u-profe", "SJ", "https://zoom.us/j/123456789"]);
  /* Sin `onConflict` con las DOS columnas, corregir el enlace de SJ sería un
     insert repetido sobre la clave y el error saldría en la cara de quien solo
     quería cambiarlo. */
  igual("…reemplazando la de ese grupo, no insertando otra",
    up && up.upsert.opts && up.upsert.opts.onConflict, "profesor_id,grupo");
  igual("…y lo que queda en pantalla es lo que devolvió el servidor",
    await r.page.inputValue("#vll-SJ"), "https://zoom.us/j/123456789");
  igual("…diciendo a quiénes les va a llegar",
    /alumnos de SJ[\s\S]*mientras tengas una clase abierta/.test(await r.page.textContent('[data-msg="SJ"]')), "true");
  await r.ctx.close();

  // 5. Quitar una sala se lleva ESA, no las demás. Con el filtro incompleto
  //    —solo el profesor— se borrarían las de todas sus sedes de una vez, y la
  //    pantalla se vería igual de bien.
  r = await abrir(browser, [PROFE], "u-profe", [
    { profesor_id: "u-profe", grupo: "SJ", enlace: "https://meet.google.com/sj" },
    { profesor_id: "u-profe", grupo: "", enlace: "https://meet.google.com/todas" },
  ], GRUPOS);
  await r.page.click('[data-quitar="SJ"]');
  await r.page.waitForTimeout(200);
  const borrados = (await r.page.evaluate(ESCRITURAS)).filter((c) => c.borro);
  igual("quitar filtra por profesor Y grupo",
    borrados.length === 1 && [borrados[0].eq.profesor_id, borrados[0].eq.grupo], ["u-profe", "SJ"]);
  filas = await r.page.evaluate(LEER_FILAS);
  igual("…así que la de SJ queda vacía y la general sigue puesta",
    filas.map((f) => f.valor), ["", "", "https://meet.google.com/todas"]);
  /* El aviso de lo que acaba de pasar sobrevive al repintado: guardar vuelve a
     pintar la lista entera —es la única forma de que el botón de quitar quede
     al día sin olvidos—, así que escrito antes se muere con la fila que lo
     llevaba y no lo lee nadie. */
  igual("…y se dice qué pasa ahora con esos alumnos",
    /pasan a ver la sala de todas tus clases/.test(await r.page.textContent('[data-msg="SJ"]')), "true");
  await r.ctx.close();

  // 6. Sin grupos, la tarjeta sigue sirviendo: una sola sala, la de siempre.
  r = await abrir(browser, [PROFE], "u-profe", [], []);
  filas = await r.page.evaluate(LEER_FILAS);
  igual("sin grupos que repartir, queda una sola fila", filas.map((f) => f.grupo), [""]);
  igual("…y sin la coletilla de los grupos que no tienen sala",
    /Para todas tus clases$/.test(filas[0].etiqueta), "true");
  await r.ctx.close();
}

/* Se exporta para que otra herramienta reuse este Supabase de mentira en vez
   de escribir una segunda copia: dos dobles de la misma pantalla se irían
   separando a la primera corrección. Al importarlo, las pruebas no corren. */
module.exports = { clienteFalso, abrir, igual, PROFE, ALUMNA, GRUPOS, CHROME, BASE };
if (require.main !== module) return;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try { await pruebas(browser); } finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nLa sala de videollamada se guarda como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
