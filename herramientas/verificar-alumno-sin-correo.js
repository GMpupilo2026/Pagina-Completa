/* Comprueba el alta de un alumno QUE NO TIENE CORREO PROPIO.
 *
 * POR QUÉ EXISTE
 * Una familia con dos hijos pequeños tiene UN correo y quiere inscribir a los
 * dos con él. No se puede —el correo es la llave con la que se inicia sesión y
 * Supabase Auth lo exige único—, así que esos alumnos entran con un USUARIO del
 * dominio de la academia y todo el correo de esa familia va a la persona
 * encargada.
 *
 * Todo lo que se rompe acá se rompe CALLADO, y por eso se mira desde afuera:
 *   · el dominio escrito distinto en alguna de sus tres copias — el sitio
 *     crearía usuarios que la base no reconoce como internos y volvería a
 *     mandarles correo a un buzón que no existe;
 *   · el alta mandando el correo del alumno en vez del usuario, o sin avisar a
 *     dónde salió de verdad el enlace;
 *   · el login sin pegarle el dominio al usuario — el niño escribe lo que le
 *     dijeron y le contesta "incorrectos";
 *   · el olvido de contraseña saliendo hacia el buzón inexistente: la página
 *     dice igual que el correo salió, y el alumno se queda fuera para siempre.
 *
 * Estas páginas están detrás del login, así que verificar-css.js no ve nada de
 * esto.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-alumno-sin-correo.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { instalarAvisos } = require("./lib/avisos-prueba.js");
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
function cierto(nombre, condicion, detalle) {
  if (condicion) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* ------------------------------------------------------------------ 1. el dominio
   Está escrito en tres tiempos de ejecución que no pueden leerse entre sí
   —navegador, Deno y Postgres—, así que la única forma de que no se separen es
   comprobarlo. El de la base no se consulta desde acá (haría falta credencial):
   se lee del texto de la migración tal como quedó documentada en CLAUDE.md. */
function pruebaDominio() {
  console.log("\n=== El dominio dice lo mismo en los tres lugares ===");
  const navegador = fs.readFileSync(path.join(RAIZ, "js/usuario-alumno.js"), "utf8");
  const funcion = fs.readFileSync(path.join(RAIZ, "supabase/functions/_compartido/usuario-alumno.ts"), "utf8");
  const claude = fs.readFileSync(path.join(RAIZ, "CLAUDE.md"), "utf8");

  const delNavegador = (navegador.match(/var DOMINIO = "([^"]+)"/) || [])[1];
  const deLaFuncion = (funcion.match(/DOMINIO_ALUMNO = "([^"]+)"/) || [])[1];

  cierto("js/usuario-alumno.js declara un dominio", !!delNavegador);
  cierto("la Edge Function declara un dominio", !!deLaFuncion);
  igual("navegador y Edge Function coinciden", delNavegador, deLaFuncion);
  cierto("CLAUDE.md nombra ese mismo dominio", claude.includes(delNavegador),
    "CLAUDE.md tiene que documentar el dominio que de verdad se usa");
  cierto("el dominio NO es el del sitio (no debe recibir correo)",
    delNavegador !== "ajedrez-integral.com",
    "un usuario en el dominio raíz recibiría correo de verdad y se perdería la separación");
}

/* --------------------------------------------- 2. el usuario que se propone
   La pantalla propone el usuario y la Edge Function lo vuelve a armar si no
   viene. Si las dos reglas se separan, lo que el profesor ve enseñado no es lo
   que queda guardado — y el usuario es lo que el niño escribe todos los días. */
async function pruebaMismaRegla(browser) {
  console.log("\n=== La pantalla propone el mismo usuario que arma el servidor ===");

  // La de la Edge Function, ejecutada de verdad desde su propio archivo.
  const ts = fs.readFileSync(path.join(RAIZ, "supabase/functions/_compartido/usuario-alumno.ts"), "utf8");
  const js = ts
    .replace(/export /g, "")
    .replace(/type BuscadorDeCorreo[^;]*;/g, "")
    .replace(/: Promise<[^>]*>/g, "").replace(/: BuscadorDeCorreo/g, "")
    .replace(/: string \| null \| undefined/g, "").replace(/\?: string \| null/g, "")
    .replace(/: boolean/g, "").replace(/: string/g, "").replace(/: number/g, "");
  const delServidor = new Function(js + "\nreturn baseDeUsuario;")();

  // La de la pantalla, sacada de la página tal como la carga el navegador.
  const page = await browser.newPage();
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  /* Con sesión: sin ella la página se va a login.html y no habría nada que
     mirar — el error sería "baseDeUsuarioEnPantalla no existe", que suena a que
     la función falta cuando lo que pasó es que la página ni siquiera es esa. */
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({
    status: 200, contentType: "application/javascript",
    body: clienteFalso({
      rpc: {}, tablas: {
        profiles: [{ id: "u-karina", role: "profesor", is_admin: false, es_coordinador: true, full_name: "Karina" }],
        formularios: [], formulario_respuestas: [],
      },
    }, "u-karina"),
  }));
  await page.goto(BASE + "/formularios.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const nombres = [
    "Sofía Muñoz Pérez", "Juan Pérez", "José Andrés Rodríguez Mora",
    "María José Vargas", "Ana", "  ", "O'Brien Smith", "Ñoño Ñáñez",
  ];
  const deLaPantalla = await page.evaluate(
    (ns) => ns.map((n) => baseDeUsuarioEnPantalla(n)), nombres);

  let separadas = 0;
  nombres.forEach((n, i) => {
    if (deLaPantalla[i] !== delServidor(n)) {
      separadas += 1;
      console.log(`      "${n}": pantalla "${deLaPantalla[i]}" vs servidor "${delServidor(n)}"`);
    }
  });
  cierto(`las dos reglas dan lo mismo en ${nombres.length} nombres`, separadas === 0);
  igual("y el usuario sale sin tildes ni eñes", deLaPantalla[7], "nono.nanez");
  await page.close();
}

/* ----------------------------------------------------- 3. entrar con usuario */
async function pruebaLogin(browser) {
  console.log("\n=== Se entra escribiendo el usuario, sin el dominio ===");
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({
    status: 200, contentType: "application/javascript",
    body: `
      window.__login = [];
      window.sb = {
        auth: {
          getSession: () => Promise.resolve({ data: { session: null } }),
          signInWithPassword: (c) => { window.__login.push(c); return Promise.resolve({ error: { message: "no" } }); },
        },
      };`,
  }));
  await page.goto(BASE + "/login.html", { waitUntil: "networkidle" });

  /* type="email" rechazaría "sofia.munoz" con el aviso DEL NAVEGADOR, en su
     idioma, antes de que la página pueda hacer nada: el usuario no podría ni
     mandarse. Se mira el campo, no el código. */
  igual("el campo acepta algo que no es un correo",
    await page.evaluate(() => document.getElementById("email").type), "text");
  igual("y no autocapitaliza (en el celular, «Sofia.Munoz» no entra)",
    await page.evaluate(() => document.getElementById("email").getAttribute("autocapitalize")), "none");

  const entrar = async (escrito) => {
    await page.fill("#email", escrito);
    await page.fill("#password", "12345678");
    await page.click("#submit-btn");
    await page.waitForFunction(() => window.__login.length > 0);
    const ultimo = await page.evaluate(() => window.__login[window.__login.length - 1].email);
    await page.evaluate(() => { window.__login = []; });
    return ultimo;
  };

  const dominio = await page.evaluate(() => window.UsuarioAlumno.DOMINIO);
  igual("escribiendo el usuario pelado, se manda con el dominio",
    await entrar("sofia.munoz"), "sofia.munoz@" + dominio);
  igual("escribiendo el usuario entero, se manda igual",
    await entrar("sofia.munoz@" + dominio), "sofia.munoz@" + dominio);
  igual("un correo de verdad NO se toca",
    await entrar("mama@gmail.com"), "mama@gmail.com");
  igual("con mayúsculas y espacios, también entra",
    await entrar("  Sofia.Munoz  "), "sofia.munoz@" + dominio);

  cierto("la página no tiró ningún error", errores.length === 0, errores.join("\n      "));
  await page.close();
}

/* ------------------------------------- 4. el olvido de contraseña, los dos caminos
   Un correo de verdad sigue por `resetPasswordForEmail`, que está probado. Un
   usuario de la academia NO puede ir por ahí: el enlace saldría hacia un buzón
   que no existe y la página diría igual que salió — el niño se queda fuera para
   siempre y nadie se entera. Ese caso tiene que ir por `recuperar-acceso`. */
async function pruebaOlvido(browser) {
  console.log("\n=== El olvido de contraseña sale por donde de verdad llega ===");
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({
    status: 200, contentType: "application/javascript",
    body: `
      window.SUPABASE_URL = "https://ejemplo.supabase.co";
      window.SUPABASE_ANON_KEY = "anon-de-mentira";
      window.__reset = [];
      window.__edge = [];
      (function () {
        const original = window.fetch;
        window.fetch = function (url, opciones) {
          if (String(url).indexOf("/functions/v1/") !== -1) {
            window.__edge.push({ url: String(url), cuerpo: JSON.parse((opciones && opciones.body) || "{}") });
            return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } }));
          }
          return original.apply(this, arguments);
        };
      })();
      window.sb = {
        auth: {
          getSession: () => Promise.resolve({ data: { session: null } }),
          resetPasswordForEmail: (correo) => { window.__reset.push(correo); return Promise.resolve({ error: null }); },
        },
      };`,
  }));
  await page.goto(BASE + "/bienvenida.html?recuperar=1", { waitUntil: "networkidle" });
  await page.waitForSelector("#paso-sin-enlace:not(.hidden)", { timeout: 20000 });

  igual("el campo acepta un usuario, no solo un correo",
    await page.evaluate(() => document.getElementById("correo-otro").type), "text");

  const pedir = async (escrito) => {
    await page.fill("#correo-otro", escrito);
    await page.click("#pedir-otro");
    await page.waitForFunction(() => document.getElementById("otro-msg").textContent.includes("Si esa cuenta existe"));
    const salida = await page.evaluate(() => ({
      reset: window.__reset.slice(), edge: window.__edge.slice(),
      dice: document.getElementById("otro-msg").textContent.trim(),
    }));
    await page.evaluate(() => { window.__reset = []; window.__edge = []; document.getElementById("otro-msg").textContent = ""; });
    return salida;
  };

  const dominio = await page.evaluate(() => window.UsuarioAlumno.DOMINIO);

  const conUsuario = await pedir("sofia.munoz");
  igual("un usuario NO va por resetPasswordForEmail (iría a un buzón que no existe)",
    conUsuario.reset.length, 0);
  igual("un usuario va por recuperar-acceso",
    conUsuario.edge.map((e) => e.url.replace("https://ejemplo.supabase.co", "")),
    ["/functions/v1/recuperar-acceso"]);
  igual("y se manda con el dominio pegado",
    conUsuario.edge[0] && conUsuario.edge[0].cuerpo.usuario, "sofia.munoz@" + dominio);

  const conCorreo = await pedir("mama@gmail.com");
  igual("un correo de verdad sigue por el camino de siempre", conCorreo.reset, ["mama@gmail.com"]);
  igual("y NO llama a la función nueva", conCorreo.edge.length, 0);

  /* Las dos respuestas tienen que ser IDÉNTICAS: si una dijera algo distinto,
     se podría averiguar quién tiene cuenta acá probando correos — y son
     menores de edad. */
  igual("los dos caminos contestan exactamente lo mismo", conUsuario.dice, conCorreo.dice);

  cierto("la página no tiró ningún error", errores.length === 0, errores.join("\n      "));
  await page.close();
}

/* ------------------------------------------------- 5. el alta, en formularios.html
   Lo que de verdad importa acá es QUÉ cuerpo se manda: un alta que mande el
   correo del alumno cuando no tiene, o que no mande el usuario, no da ningún
   error — crea la cuenta que no era. */
const CAMPOS = [
  { id: "nombre", etiqueta: "Nombre completo", tipo: "texto", requerido: true, ayuda: "", opciones: [], papel: "alumno_nombre" },
  { id: "correo_alumno", etiqueta: "Correo del alumno", tipo: "correo", requerido: false, ayuda: "", opciones: [], papel: "alumno_correo" },
  { id: "enc_nombre", etiqueta: "Nombre de la persona encargada", tipo: "texto", requerido: false, ayuda: "", opciones: [], papel: "encargado_nombre" },
  { id: "enc_correo", etiqueta: "Correo de la persona encargada", tipo: "correo", requerido: true, ayuda: "", opciones: [], papel: "encargado_correo" },
];
const FORM = {
  id: "form-1", slug: "inscripcion-ab12", titulo: "Inscripción", descripcion: "", grupo: "7A",
  campos: CAMPOS, abierto: true, cierra_el: null, creado_por: "u-karina",
  created_at: "2026-09-01T00:00:00Z", formulario_respuestas: [{ count: 3 }],
};
/* Los dos hermanos, con el ÚNICO correo de la mamá. Ninguno de los dos trajo
   correo propio, que es lo que de verdad pasa con los pequeños. */
const RESPUESTAS = [
  { id: "resp-juan", created_at: "2026-09-10T10:00:00Z", cuenta_id: null, cuenta_creada_at: null,
    respuestas: { nombre: "Juan Muñoz Pérez", enc_nombre: "Ana Pérez", enc_correo: "mama@gmail.com" } },
  { id: "resp-sofia", created_at: "2026-09-10T10:05:00Z", cuenta_id: null, cuenta_creada_at: null,
    respuestas: { nombre: "Sofía Muñoz Pérez", enc_nombre: "Ana Pérez", enc_correo: "mama@gmail.com" } },
  // Un tercer hermano, para probar el desempate del servidor: una respuesta ya
  // dada de alta deja de ofrecer el botón, así que no se puede reusar.
  { id: "resp-pedro", created_at: "2026-09-10T10:09:00Z", cuenta_id: null, cuenta_creada_at: null,
    respuestas: { nombre: "Pedro Muñoz Pérez", enc_nombre: "Ana Pérez", enc_correo: "mama@gmail.com" } },
];

function clienteFalso(datos, usuarioId) {
  return `
window.__edge = [];
window.SUPABASE_URL = "https://ejemplo.supabase.co";
window.SUPABASE_ANON_KEY = "anon-de-mentira";
(function () {
  const original = window.fetch;
  window.fetch = function (url, opciones) {
    const u = String(url);
    if (u.indexOf("/functions/v1/") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__edge.push({ url: u, cuerpo: cuerpo });
      /* El servidor contesta con el usuario que de verdad quedó, que puede no
         ser el propuesto (si ya estaba tomado, lleva número). La pantalla tiene
         que enseñar ESE y no el suyo. */
      const usuario = cuerpo.sin_correo ? (window.__usuarioQueQueda || cuerpo.usuario + "@alumno.ajedrez-integral.com") : cuerpo.alumno_email;
      return Promise.resolve(new Response(JSON.stringify({
        ok: true, alumno_id: "u-nuevo", email: usuario, usuario: usuario,
        sin_correo: !!cuerpo.sin_correo, correo_destino: cuerpo.sin_correo ? cuerpo.encargado_email : usuario,
        ya_tenia_cuenta: false, encargado_guardado: !!cuerpo.encargado_email, correo_enviado: true,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return original.apply(this, arguments);
  };
})();
(function () {
  const DATOS = ${JSON.stringify(datos)};
  function constructor(nombre, filas) {
    let unica = false;
    const b = {
      select() { return b; }, eq() { return b; }, order() { return b; }, in() { return b; },
      limit() { return b; }, range() { return b; }, is() { return b; }, not() { return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      insert() { return b; }, update() { return b; }, delete() { return b; },
      then(res, rej) {
        let d = filas;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }) },
    from: (t) => constructor(t, DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : []),
    /* Quien coordina sin academia recibe TODAS sus funciones. Con el [] de
       siempre, la página lo lee como «le quitaron todas» y no pinta nada: era
       el doble el que estaba incompleto, no la página (ver CLAUDE.md). */
    rpc: (n) => constructor("rpc:" + n, DATOS.rpc[n] !== undefined ? DATOS.rpc[n]
      : n === "mis_funciones_coordinacion" ? ["formularios","altas","solicitudes","cuentas","acceso","roles","cobros","equipos","subgrupos"] : []),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  };
})();
`;
}

async function pruebaAlta(browser) {
  console.log("\n=== Dos hermanos, un solo correo: el alta manda lo correcto ===");
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  // Lo que la página le muestra a quien da de alta (js/avisos.js) queda en
  // window.__avisos; el diálogo se cierra apretando su botón.
  await instalarAvisos(page);
  const avisos = () => page.evaluate(() => window.__avisos);
  const esperarAviso = async (antes) => page.waitForFunction((n) => window.__avisos.length > n, antes, { timeout: 10000 });
  const cuantos = () => page.evaluate(() => window.__avisos.length);
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({
    status: 200, contentType: "application/javascript",
    body: clienteFalso({
      rpc: { informes_resumen_alumnos: [{ id: "a1", grupo: "7A" }] },
      tablas: {
        profiles: [{ id: "u-karina", role: "profesor", is_admin: false, es_coordinador: true, full_name: "Karina" }],
        formularios: [FORM],
        formulario_respuestas: RESPUESTAS,
      },
    }, "u-karina"),
  }));
  await page.goto(BASE + "/formularios.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  // Entrar a las respuestas del formulario.
  await page.evaluate(() => [...document.querySelectorAll("#lista button")]
    .find((b) => /respuestas/i.test(b.textContent)).click());
  await page.waitForFunction(() => document.querySelectorAll("#respuestas-cuerpo tr").length > 0, null, { timeout: 20000 });

  const abrirAltaDe = async (nombre) => {
    await page.evaluate((n) => {
      const fila = [...document.querySelectorAll("#respuestas-cuerpo tr")]
        .find((tr) => tr.textContent.includes(n));
      [...fila.querySelectorAll("button")].find((b) => /Crear cuenta/.test(b.textContent)).click();
    }, nombre);
    await page.waitForSelector("#alta-fondo:not(.hidden)");
  };

  // ---- el primer hermano ----
  await abrirAltaDe("Juan Muñoz");
  igual("sin correo en la respuesta, la casilla arranca marcada",
    await page.evaluate(() => document.getElementById("alta-sin-correo").checked), "true");
  igual("el usuario se propone del nombre",
    await page.evaluate(() => document.getElementById("alta-usuario").value), "juan.munoz");
  cierto("el campo del usuario SE VE de verdad",
    await page.evaluate(() => document.getElementById("alta-usuario").checkVisibility()),
    "se mide con checkVisibility(), no con la clase");
  cierto("el campo del correo queda apagado",
    await page.evaluate(() => document.getElementById("alta-alumno-correo").disabled));
  igual("la ayuda del encargado dice que ahí va el enlace",
    await page.evaluate(() => /enlace para crear la contraseña/.test(
      document.getElementById("alta-encargado-ayuda").textContent)), "true");

  const antesDeJuan = await cuantos();
  await page.click("#alta-enviar");
  await page.waitForFunction(() => window.__edge.length > 0);
  await esperarAviso(antesDeJuan);
  const deJuan = await page.evaluate(() => window.__edge[0].cuerpo);
  igual("se manda sin_correo", deJuan.sin_correo, "true");
  igual("se manda el usuario, no un correo del alumno", deJuan.usuario, "juan.munoz");
  igual("el correo del alumno va vacío", deJuan.alumno_email, "");
  igual("y va el correo de la mamá", deJuan.encargado_email, "mama@gmail.com");
  cierto("el aviso enseña el usuario con el que entra",
    (await avisos()).some((a) => a.includes("juan.munoz@")),
    "quien da de alta tiene que poder decírselo a la familia: nadie lo adivina");
  cierto("y dice que el correo salió a la casa, no al alumno",
    (await avisos()).some((a) => a.includes("mama@gmail.com")));

  // ---- el segundo hermano, con EL MISMO correo de la mamá ----
  await page.evaluate(() => { window.__edge = []; });
  await abrirAltaDe("Sofía Muñoz");
  igual("al abrir otra respuesta, el usuario se vuelve a proponer",
    await page.evaluate(() => document.getElementById("alta-usuario").value), "sofia.munoz");
  const antesDeSofia = await cuantos();
  await page.click("#alta-enviar");
  await page.waitForFunction(() => window.__edge.length > 0);
  await esperarAviso(antesDeSofia);
  const deSofia = await page.evaluate(() => window.__edge[0].cuerpo);
  igual("el segundo hermano manda SU propio usuario", deSofia.usuario, "sofia.munoz");
  igual("con el MISMO correo de la casa", deSofia.encargado_email, "mama@gmail.com");
  cierto("los dos hermanos NO comparten usuario", deJuan.usuario !== deSofia.usuario,
    "si lo compartieran, el segundo alta pisaría la cuenta del primero");

  /* Lo que se enseña es lo que el servidor devolvió, no lo que la pantalla
     propuso: si ya había otro "sofia.munoz", el de verdad lleva número. */
  await page.evaluate(() => { window.__edge = []; window.__usuarioQueQueda = "pedro.munoz2@alumno.ajedrez-integral.com"; });
  await page.evaluate(() => { window.__avisos.length = 0; });
  await abrirAltaDe("Pedro Muñoz");
  igual("el tercer hermano también propone el suyo",
    await page.evaluate(() => document.getElementById("alta-usuario").value), "pedro.munoz");
  await page.click("#alta-enviar");
  await page.waitForFunction(() => window.__edge.length > 0);
  await esperarAviso(0);
  const avisosDePedro = await avisos();
  cierto("si el servidor desempató, la pantalla enseña el usuario que QUEDÓ",
    avisosDePedro.some((a) => a.includes("pedro.munoz2@")),
    "enseñar el propuesto dejaría a la familia intentando entrar con uno que no es: " + JSON.stringify(avisosDePedro));

  cierto("la página no tiró ningún error", errores.length === 0, errores.join("\n      "));
  await page.close();
}

(async () => {
  pruebaDominio();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaMismaRegla(browser);
    await pruebaLogin(browser);
    await pruebaOlvido(browser);
    await pruebaAlta(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos === 0 ? "\n✅ Todo bien." : `\n❌ ${fallos} fallo(s).`);
  process.exit(fallos === 0 ? 0 : 1);
})();
