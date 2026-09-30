/* Comprueba, en un navegador de verdad y con un Supabase de mentira, la foto de
   perfil: subirla en `configuracion.html`, quitarla, y que se pinte donde iba
   la inicial. Ver «La foto de perfil» en docs/decisiones/permisos-y-roles.md.

   Lo que se mira acá es lo que se rompe callado:

   1. EL CONSENTIMIENTO ANTES QUE EL DATO. Sin la casilla no se abre el
      selector ni se sube nada: subir la foto ya es tratarla.
   2. LO QUE SE SUBE ES CHICO Y LIMPIO: un JPEG cuadrado de 320 px, rehecho en
      el navegador (sin los EXIF del original, entre ellos el lugar), a la
      carpeta de quien sube y con un nombre al azar.
   3. SE GUARDA CON LA VERSIÓN DE LA POLÍTICA, y la foto vieja se borra.
   4. SI LA BASE LA RECHAZA, EL ARCHIVO NO QUEDA HUÉRFANO y se dice por qué.
   5. SE VE: la <img> dentro del círculo, medida con checkVisibility; y si la
      dirección no carga, vuelve la inicial.
   6. QUITARLA pregunta con los avisos de la página, llama a quitar_foto y
      borra el archivo.
   7. LAS FIRMAS SALEN JUNTAS: diez fotos pedidas a la vez son UN pedido.
   8. EL PANEL (clases.html) pinta la foto en su avatar.
   9. LA CLASE EN VIVO (sesion.html): la lista de conectados del profe, el
      elegido (al profe, grande; a los compañeros, en el aviso), los tableros
      de respuesta y el podio — y en el podio SIN nombres, ninguna cara.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-foto-perfil.js                            */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

// Un PNG de 1×1 que el navegador sí abre: la «dirección firmada» del doble.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ANA = { id: "u-ana", role: "alumno", is_admin: false, es_coordinador: false, full_name: "Ana Rojas", email: "ana@x.cr", grupo: "7B", foto_path: null };

function clienteFalso(perfil, opciones) {
  return `
window.__subidas = []; window.__borrados = []; window.__firmas = []; window.__rpc = [];
(function () {
  const OPC = ${JSON.stringify(opciones || {})};
  const PNG = ${JSON.stringify(PNG)};
  const PERFILES = [${JSON.stringify(perfil)}];

  function constructor(tabla, filasBase) {
    let filas = (filasBase || []).slice(), unica = false;
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      eq(col, val) { filas = filas.filter((r) => String(r[col]) === String(val)); return b; },
      in(col, vals) { filas = filas.filter((r) => vals.includes(r[col])); return b; },
      update() { return b; }, upsert() { return b; }, delete() { return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      then(res, rej) {
        const d = unica ? (filas.length ? filas[0] : null) : filas;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(perfil.id)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      mfa: { listFactors: () => Promise.resolve({ data: { totp: [] }, error: null }),
             getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
    from: (t) => constructor(t, t === "profiles" ? PERFILES : []),
    rpc: (n, args) => {
      window.__rpc.push({ n, a: args });
      if (n === "guardar_mi_foto") {
        if (OPC.rechazar) return Promise.resolve({ data: null, error: { message: "La foto no terminó de subirse. Vuelve a elegirla." } });
        PERFILES[0].foto_path = args.p_ruta;
        return Promise.resolve({ data: args.p_ruta, error: null });
      }
      if (n === "quitar_foto") {
        const vieja = PERFILES[0].foto_path; PERFILES[0].foto_path = null;
        return Promise.resolve({ data: vieja, error: null });
      }
      return constructor(n, []);
    },
    storage: {
      from: (bucket) => ({
        upload: async (ruta, blob, opts) => {
          const dims = await createImageBitmap(blob).then((i) => [i.width, i.height]).catch(() => null);
          window.__subidas.push({ bucket, ruta, tipo: blob.type, peso: blob.size, dims, opts });
          return { data: { path: ruta }, error: null };
        },
        remove: (rutas) => { window.__borrados.push({ bucket, rutas }); return Promise.resolve({ data: [], error: null }); },
        createSignedUrls: (rutas, dura) => {
          window.__firmas.push({ bucket, rutas, dura });
          return Promise.resolve({ data: rutas.map((r) => ({ path: r, signedUrl: OPC.rota ? "https://bgtijpimpcokxatxxbki.supabase.co/rota.jpg" : PNG + "#" + r, error: null })), error: null });
        },
      }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); } }),
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

async function abrir(browser, perfil, opciones, pagina) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/rota.jpg", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil, opciones) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(BASE + "/" + (pagina || "configuracion.html"), { waitUntil: "networkidle" });
  if (!pagina) await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx, errores };
}

/* Elige un archivo como lo haría la persona: una foto grande y apaisada (con
   un PNG de 1600×900 hecho en el navegador), por el mismo <input>. */
async function elegirFoto(page) {
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 900;
    const x = c.getContext("2d");
    for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${i * 7},70%,50%)`; x.fillRect((i * 37) % 1600, (i * 53) % 900, 90, 90); }
    const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "mi-foto.png", { type: "image/png" }));
    const input = document.getElementById("foto-archivo");
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => /Listo|No se|pudo|no terminó/.test(document.getElementById("foto-msg").textContent), null, { timeout: 10000 });
}

const vista = () => {
  const caja = document.getElementById("foto-vista");
  const img = caja.querySelector("img");
  // La inicial la dibuja el CSS: se mide lo que pinta el ::before, no el texto.
  const antes = getComputedStyle(caja, "::before").content;
  return { img: !!img && img.checkVisibility() && img.complete && img.naturalWidth > 0,
           texto: img ? "" : (antes && antes !== "none" ? antes.replace(/"/g, "") : "") };
};

async function pruebas(browser) {
  console.log("\n=== La foto de perfil, en Configuración ===");

  // Sin foto: la inicial, y nada que quitar.
  let r = await abrir(browser, { ...ANA });
  igual("sin foto se ve la inicial", await r.page.evaluate(vista), { img: false, texto: "A" });
  igual("…y «Quitar mi foto» no se ve",
    await r.page.evaluate(() => document.getElementById("foto-quitar").checkVisibility()), false);

  // 1. Sin la casilla no se sube.
  await r.page.click("#foto-elegir");
  await r.page.waitForTimeout(150);
  igual("sin la casilla no se sube nada", await r.page.evaluate(() => window.__subidas.length), 0);
  igual("…se dice por qué y el foco va a la casilla",
    [/marca la casilla/.test(await r.page.textContent("#foto-msg")), await r.page.evaluate(() => document.activeElement.id)],
    [true, "foto-acepto"]);

  // 2 y 3. Con la casilla, sube chica, limpia y en su carpeta.
  await r.page.check("#foto-acepto");
  await elegirFoto(r.page);
  const sub = (await r.page.evaluate(() => window.__subidas))[0];
  igual("se sube al bucket privado, a SU carpeta, con nombre al azar",
    sub && [sub.bucket, /^u-ana\/foto-[a-z0-9]{16}\.jpg$/.test(sub.ruta), sub.opts.upsert], ["fotos-perfil", true, false]);
  igual("…rehecha como JPEG cuadrado de 320 px y de menos de 300 KB",
    sub && [sub.tipo, sub.dims, sub.peso <= 300 * 1024], ["image/jpeg", [320, 320], true]);
  const g = (await r.page.evaluate(() => window.__rpc.filter((x) => x.n === "guardar_mi_foto")))[0];
  igual("se guarda con la ruta subida y la versión vigente de la política",
    g && [g.a.p_ruta === sub.ruta, g.a.p_version_privacidad === (await r.page.evaluate(() => window.LegalVersion.PRIVACIDAD))], [true, true]);
  igual("la foto nueva se ve en el círculo", (await r.page.evaluate(vista)).img, true);
  igual("…y ahora se ofrece cambiarla y quitarla",
    [await r.page.textContent("#foto-elegir"), await r.page.evaluate(() => document.getElementById("foto-quitar").checkVisibility())],
    ["Cambiar la foto", true]);

  // Cambiarla borra la anterior.
  const primera = sub.ruta;
  await r.page.evaluate(() => { document.getElementById("foto-msg").textContent = ""; });
  await elegirFoto(r.page);
  igual("al cambiarla, la anterior se borra del bucket",
    await r.page.evaluate((p) => window.__borrados.some((b) => b.bucket === "fotos-perfil" && b.rutas.includes(p)), primera), true);

  // 6. Quitarla.
  const segunda = (await r.page.evaluate(() => window.__subidas))[1].ruta;
  await r.page.click("#foto-quitar");
  await r.page.waitForSelector("[data-avisos-aceptar]");
  igual("quitarla se pregunta con los avisos de la página, con un botón que dice lo que hace",
    (await r.page.textContent("[data-avisos-aceptar]")).trim(), "Quitar mi foto");
  await r.page.click("[data-avisos-aceptar]");
  await r.page.waitForFunction(() => /quitaste/.test(document.getElementById("foto-msg").textContent));
  igual("…llama a quitar_foto con su id y borra el archivo",
    await r.page.evaluate((p) => [window.__rpc.filter((x) => x.n === "quitar_foto").map((x) => x.a.p_persona),
      window.__borrados.some((b) => b.rutas.includes(p))], segunda), [["u-ana"], true]);
  igual("…y vuelve la inicial", await r.page.evaluate(vista), { img: false, texto: "A" });
  igual("sin errores en la página", r.errores, []);

  // 7. Las firmas salen juntas.
  await r.page.evaluate(() => { window.__firmas.length = 0; try { sessionStorage.clear(); } catch (e) {} });
  const n = await r.page.evaluate(async () => {
    const ps = [];
    for (let i = 0; i < 10; i++) ps.push(FotoPerfil.url("u-" + i, "u-" + i + "/foto-aaaaaaaaaaaa" + i + ".jpg"));
    const urls = await Promise.all(ps);
    return [window.__firmas.length, window.__firmas[0].rutas.length, urls.filter(Boolean).length];
  });
  igual("diez fotos pedidas a la vez salen en UN pedido de firmas", n, [1, 10, 10]);
  const n2 = await r.page.evaluate(async () => {
    await FotoPerfil.url("u-3", "u-3/foto-aaaaaaaaaaaa3.jpg");
    return window.__firmas.length;
  });
  igual("…y una ya firmada no se vuelve a pedir", n2, 1);
  await r.ctx.close();

  // 4. Si la base la rechaza, el archivo no queda huérfano.
  r = await abrir(browser, { ...ANA }, { rechazar: true });
  await r.page.check("#foto-acepto");
  await elegirFoto(r.page);
  const huerfana = (await r.page.evaluate(() => window.__subidas))[0].ruta;
  igual("si guardar falla, lo subido se borra",
    await r.page.evaluate((p) => window.__borrados.some((b) => b.rutas.includes(p)), huerfana), true);
  igual("…y se dice por qué", /no terminó de subirse/.test(await r.page.textContent("#foto-msg")), true);
  await r.ctx.close();

  // 5. Con foto que ya estaba; y una dirección que no carga deja la inicial.
  r = await abrir(browser, { ...ANA, foto_path: "u-ana/foto-bbbbbbbbbbbbbbbb.jpg", foto_privacidad_version: "2026-09-30" });
  await r.page.waitForFunction(() => document.querySelector("#foto-vista img"));
  await r.page.waitForTimeout(100);
  igual("la foto guardada se ve al abrir", (await r.page.evaluate(vista)).img, true);
  igual("…con la casilla ya marcada (ya la aceptó)", await r.page.isChecked("#foto-acepto"), true);
  await r.ctx.close();

  r = await abrir(browser, { ...ANA, foto_path: "u-ana/foto-bbbbbbbbbbbbbbbb.jpg" }, { rota: true });
  await r.page.waitForFunction(() => document.getElementById("foto-vista").textContent.trim() === "A", null, { timeout: 5000 }).catch(() => {});
  igual("si la foto no carga, vuelve la inicial", await r.page.evaluate(vista), { img: false, texto: "A" });
  await r.ctx.close();

  // 8. El panel.
  console.log("\n=== La foto en el panel (clases.html) ===");
  r = await abrir(browser, { ...ANA, foto_path: "u-ana/foto-bbbbbbbbbbbbbbbb.jpg" }, {}, "clases.html");
  await r.page.waitForFunction(() => document.querySelector("#avatar img"), null, { timeout: 20000 }).catch(() => {});
  await r.page.waitForTimeout(150);
  igual("el avatar del panel lleva la foto, y se ve",
    await r.page.evaluate(() => { const i = document.querySelector("#avatar img"); return !!i && i.checkVisibility() && i.naturalWidth > 0; }), true);
  igual("…como decoración: el avatar sigue aria-hidden y la foto sin texto alternativo",
    await r.page.evaluate(() => [document.getElementById("avatar").getAttribute("aria-hidden"), document.querySelector("#avatar img") && document.querySelector("#avatar img").alt]), ["true", ""]);
  await r.ctx.close();
}

/* La clase usa el doble de verificar-clase-registrada.js, que no trae Storage:
   se le pone uno después de cargar, y las fotos en su tabla de perfiles. Las
   fotos se piden recién cuando alguien se conecta, así que llega a tiempo. */
const R = require("./verificar-clase-registrada.js");
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const fila = (elegido) => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido });
async function conFotos(page, fotos) {
  await page.evaluate(({ fotos, PNG }) => {
    window.__firmas = [];
    Object.keys(fotos).forEach((id) => {
      let p = window.__tablas.profiles.find((x) => x.id === id);
      if (!p) { p = { id, role: "alumno", full_name: id, email: id + "@x.cr" }; window.__tablas.profiles.push(p); }
      p.foto_path = fotos[id];
    });
    window.sb.storage = { from: () => ({
      createSignedUrls: (rutas) => { window.__firmas.push(rutas); return Promise.resolve({ data: rutas.map((r) => ({ path: r, signedUrl: PNG + "#" + r })), error: null }); },
    }) };
  }, { fotos, PNG });
}
const fotoVisible = (page, sel) => page.evaluate((s) => {
  const i = document.querySelector(s + " img");
  return !!(i && i.checkVisibility() && i.complete && i.naturalWidth > 0);
}, sel);

async function pruebasClase(browser) {
  console.log("\n=== La foto en la clase en vivo (sesion.html) ===");
  // El profe: la lista de conectados y el elegido.
  let r = await R.abrir(browser, "u-profe", CLASE, { game_state: [fila(null)] });
  await r.page.emulateMedia({ reducedMotion: "reduce" });
  await r.page.waitForSelector("#elegir-azar-btn", { state: "attached", timeout: 10000 });
  await conFotos(r.page, { "u-ana": "u-ana/foto-aaaaaaaaaaaaaaaa.jpg" });
  await r.page.evaluate(() => { activateTeacherTab("alumnos"); window.__entraAlumno(); window.__entraOtroAlumno(); });
  await r.page.waitForFunction(() => document.querySelector("#students-list img"), null, { timeout: 5000 }).catch(() => {});
  await r.page.waitForTimeout(150);
  const lista = await r.page.evaluate(() => [...document.querySelectorAll("#students-list li")].map((li) => {
    const i = li.querySelector("img");
    return [li.textContent.includes("Ana") ? "Ana" : "Beto", !!(i && i.checkVisibility() && i.naturalWidth > 0)];
  }).sort());
  igual("en la lista de conectados, Ana con su foto y Beto (sin foto) con su inicial", lista, [["Ana", true], ["Beto", false]]);
  igual("…la inicial de Beto se ve (la dibuja el CSS)", await r.page.evaluate(() => {
    const li = [...document.querySelectorAll("#students-list li")].find((x) => x.textContent.includes("Beto"));
    const caja = li && li.querySelector("[data-foto-de]");
    return caja ? getComputedStyle(caja, "::before").content : null;
  }), '"B"');
  igual("…y no se cuela en el texto de la fila", await r.page.evaluate(() =>
    [...document.querySelectorAll("#students-list li")].some((x) => /^\s*B\s*Beto/.test(x.textContent) || /^\s*A\s*Ana/.test(x.textContent))), false);
  const firmas = await r.page.evaluate(() => window.__firmas.length);
  await r.page.evaluate(() => window.__avisoDePresencia());
  await r.page.waitForTimeout(150);
  igual("repintar la lista (cada latido de presencia) no vuelve a pedir la foto",
    await r.page.evaluate(() => window.__firmas.length), firmas);
  igual("…ni la hace parpadear: sigue ahí", await fotoVisible(r.page, "#students-list li"), true);

  await r.page.click("#elegir-azar-btn");
  await r.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.elegido), null, { timeout: 5000 });
  const quien = await r.page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.elegido).pop().campos.elegido.id);
  await r.page.waitForTimeout(150);
  igual("el elegido sale con su foto (o su inicial) al lado del nombre, en grande",
    [await fotoVisible(r.page, "#elegido-foto"), await r.page.evaluate(() => {
      const c = document.getElementById("elegido-foto");
      return c.querySelector("img") ? "" : getComputedStyle(c, "::before").content.replace(/"/g, "");
    })],
    quien === "u-ana" ? [true, ""] : [false, "B"]);
  igual("…y la foto es decoración: aria-hidden", await r.page.getAttribute("#elegido-foto", "aria-hidden"), "true");
  // Y siempre el caso con foto: darle el turno a Ana a mano.
  await r.page.evaluate(() => darTurno("u-ana", "azar"));
  await r.page.waitForTimeout(150);
  igual("dándole el turno a Ana, su foto grande al lado de su nombre",
    [await fotoVisible(r.page, "#elegido-foto"), await r.page.textContent("#elegido-nombre")], [true, "Ana Rojas"]);
  igual("sin errores en la clase del profe", r.errores, []);
  await r.ctx.close();

  // Un compañero ve la foto del elegido en el aviso.
  r = await R.abrir(browser, "u-ana", CLASE, { game_state: [fila(null)] });
  await r.page.waitForSelector("#chessboard [data-square]", { timeout: 10000 });
  await conFotos(r.page, { "u-beto": "u-beto/foto-bbbbbbbbbbbbbbbb.jpg" });
  await r.page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ id: "u-beto", at: new Date().toISOString(), nombre: "Beto Mora" }));
  await r.page.waitForFunction(() => document.querySelector("#elegido-otro-foto img"), null, { timeout: 5000 }).catch(() => {});
  await r.page.waitForTimeout(150);
  igual("la compañera ve la foto de Beto en «Tu profe eligió a…»", await fotoVisible(r.page, "#elegido-otro-foto"), true);
  igual("…y el aviso sigue diciendo el nombre escrito", (await r.page.textContent("#elegido-otro")).trim(), "🎯 Tu profe eligió a Beto Mora para responder.");

  // El podio: con nombres, caras; sin nombres, ninguna.
  await r.page.evaluate(() => pintarPodio({ lineas: [{ id: "u-beto", nombre: "Beto Mora", puntos: 5, puesto: 1 }] }));
  await r.page.waitForTimeout(150);
  igual("en el podio con nombres, la foto del primero", await fotoVisible(r.page, "#podio-lineas li"), true);
  await r.page.evaluate(() => pintarPodio({ lineas: [{ id: "u-beto", nombre: null, puntos: 5, puesto: 1 }] }));
  await r.page.waitForTimeout(150);
  igual("en el podio SIN nombres, ninguna foto (una cara diría quién es)",
    await r.page.evaluate(() => document.querySelectorAll("#podio-lineas img, #podio-lineas [data-foto-de]").length), 0);
  igual("sin errores en la clase de la alumna", r.errores, []);
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try { await pruebas(browser); await pruebasClase(browser); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
