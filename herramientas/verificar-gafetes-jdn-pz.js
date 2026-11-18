#!/usr/bin/env node
/* Los gafetes de la Eliminatoria Cantonal JDN de Pérez Zeledón 2026
 * (gafetes.html: «Partir de la Eliminatoria JDN PZ 2026» y «Traer los
 * jugadores de la Eliminatoria JDN PZ»), en un navegador de verdad con un
 * doble de Supabase que FILTRA de verdad.
 *
 * Lo que se mira:
 *  - el diseño: 5,5 × 8,5 cm, los logos de la ADAPZ y del CCDR, la profe
 *    Karina (al frente sin foto y mostrando el QR atrás), el horario de las
 *    bases y el QR de cada persona ({QR});
 *  - las fotos: se emparejan solas por el nombre del archivo (la más
 *    precisa gana, la de «MEDIOS DIGITALES» no entra si está la otra), la
 *    que falta se elige a mano, y va en el marco recortada desde la cabeza;
 *  - los jugadores salen solo de los dos torneos de la organización con el
 *    sello (una «ADAPZ» sin sello no cuenta), sin los retirados, por torneo y
 *    por nombre, con «Apellidos, Nombre» partido en dos;
 *  - el color y la franja por categoría (la U16 juega el torneo U20 y lleva
 *    su color), el Elo 0 no deja «Elo» colgando, el código cuenta por edad;
 *  - el QR del dorso de cada uno, leído con jsQR (con la marca encima),
 *    lleva a SU ficha en Pareo (torneos-pareo#t=<torneo>&j=<jugador>), y dos
 *    jugadores no comparten fondo de dorso;
 *  - el PDF: un .zip con un PDF por torneo, dos páginas por jugador;
 *  - sin torneos publicados, lo dice y no carga nada.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-gafetes-jdn-pz.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
const ok = (c, m) => igual(m, !!c, true);
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const U12 = "11111111-1111-4111-8111-111111111111";
const U20 = "22222222-2222-4222-8222-222222222222";
const FALSO = "33333333-3333-4333-8333-333333333333";
const ORGS = [
  { id: "org-ai", nombre: "Ajedrez Integral", verificado: true },
  { id: "org-falsa", nombre: "ADAPZ", verificado: false },
];
const jug = (id, nombre, categoria, extra) => Object.assign({ id, nombre, categoria, institucion: "ADAPZ", elo: 0, fed: "" }, extra || {});
const PUBLICADOS = [
  { id: U12, nombre: "Eliminatoria Cantonal JDN CCDRPZ – U12", organizador_id: "org-ai", creado: "2026-11-12T04:31:54Z",
    datos: { inscripcion: { abierta: true, hasta: "2026-11-20" }, rondas: [], jugadores: [
      jug("j-zz", "ZÚÑIGA ROJAS, MATEO", "U12 Absoluto", { elo: 1400 }),
      jug("j-aa", "Arias Mora, Sofía", "U12 Femenino", { institucion: "Escuela Pedregoso" }),
      jug("j-rr", "Retirado Pérez, Juan", "U12 Absoluto", { retiradoDespuesDe: 0 }),
    ] } },
  { id: U20, nombre: "Eliminatoria Cantonal JDN CCDRPZ – U20-U16", organizador_id: "org-ai", creado: "2026-11-12T04:32:06Z",
    datos: { inscripcion: { abierta: true, hasta: "2026-11-20" }, rondas: [], jugadores: [
      jug("j-u20", "Vargas Solís, Daniel", "U20 Absoluto", { elo: 1694 }),
      jug("j-u16", "Mora Céspedes, Ana Lucía", "U16 Femenino", { elo: 1431 }),
    ] } },
  // Otra «ADAPZ», sin el sello: nunca cuenta, aunque sea más nueva.
  { id: FALSO, nombre: "Eliminatoria JDN PZ U12 (copia)", organizador_id: "org-falsa", creado: "2026-11-15T00:00:00Z",
    datos: { rondas: [], jugadores: [jug("j-x", "Intruso, Pedro", "U12 Absoluto")] } },
];

// El doble: apunta los filtros y los aplica al resolver (como PostgREST).
function cliente(datos) {
  return `(() => {
  const D = ${JSON.stringify(datos)};
  window.__pedidos = [];
  const tablas = { profiles: [{ id: "u", is_admin: true }], pareo_organizadores: D.orgs, pareo_publicados: D.publicados };
  function consulta(tabla) {
    const f = [];
    let cols = "*", orden = null, rango = null;
    const b = {
      select(c) { cols = c || "*"; return b; },
      eq(k, v) { f.push((x) => x[k] === v); return b; },
      in(k, l) { f.push((x) => l.includes(x[k])); return b; },
      order(k, o) { orden = [k, o && o.ascending === false ? -1 : 1]; return b; },
      range(a, z) { rango = [a, z]; return b; },
      maybeSingle() { return b.then((r) => ({ data: (r.data || [])[0] || null, error: null })); },
      then(ok, mal) {
        window.__pedidos.push({ tabla, cols });
        let l = (tablas[tabla] || []).filter((x) => f.every((g) => g(x)));
        if (orden) l = l.slice().sort((a, c) => (a[orden[0]] < c[orden[0]] ? -1 : a[orden[0]] > c[orden[0]] ? 1 : 0) * orden[1]);
        if (rango) l = l.slice(rango[0], rango[1] + 1);
        // «inscripcion:datos->inscripcion»: el alias que pide el buscador.
        l = l.map((x) => /inscripcion:datos->inscripcion/.test(cols) ? Object.assign({}, x, { inscripcion: (x.datos || {}).inscripcion || null }) : x);
        return Promise.resolve({ data: JSON.parse(JSON.stringify(l)), error: null }).then(ok, mal);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u" }, access_token: "t" } } }) },
    from: consulta,
  };
})();`;
}

async function abrir(ctx, datos) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente(datos) }));
  await page.goto(BASE + "/gafetes.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)");
  return { page, errores };
}
async function aceptar(page, boton) {
  await page.click(`dialog[open] button:has-text("${boton}")`);
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\nSin torneos publicados");
  {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const { page, errores } = await abrir(ctx, { orgs: ORGS, publicados: [] });
    await page.click("#g-pareo-pz");
    await page.waitForFunction(() => /No se pudieron traer/.test((document.getElementById("avisos-zona") || {}).textContent || ""));
    igual("lo dice y no carga nada", [await page.evaluate(() => window.Gafetes._estado().datos), /todavía no hay torneos/.test(await page.textContent("#avisos-zona"))], [null, true]);
    igual("sin errores en la consola", errores, []);
    await ctx.close();
  }

  console.log("\nEl diseño de la eliminatoria");
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
  const { page, errores } = await abrir(ctx, { orgs: ORGS, publicados: PUBLICADOS });
  await page.click("#g-ejemplo-pz");
  await aceptar(page, "Usar ese diseño");
  await page.waitForFunction(() => window.Gafetes._estado().diseno.nombreDiseno === "Eliminatoria JDN PZ 2026");
  const d = await page.evaluate(() => {
    const x = window.Gafetes._estado().diseno;
    return { imgs: ["logoIzq", "logoDer", "ilustracion", "ilustracionDorso"].map((k) => x.imagenes[k] && x.imagenes[k].nombre), filas: x.dorso.horario.length, qr: x.dorso.qr, texto: x.dorso.qrTexto, campo: document.getElementById("g-qr").value, tam: [x.tamano.ancho, x.tamano.alto] };
  });
  igual("los logos de la ADAPZ y del CCDR, la profe Karina al frente (sin foto) y mostrando el QR atrás", d.imgs, ["logo.jpg", "ccdr-pz.jpg", "bienvenidos.webp", "presentando.webp"]);
  igual("5,5 × 8,5 cm", d.tam, [55, 85]);
  igual("el horario de las bases: cinco rondas, el almuerzo y la clausura", d.filas, 7);
  igual("el QR es de cada persona", [d.qr, d.campo], ["{QR}", "{QR}"]);
  igual("y dice para qué es", d.texto, "Escanéalo: | tu mesa en cada ronda, | tus puntos y tu puesto");

  console.log("\nLos jugadores, de Pareo Integral");
  await page.click("#g-pareo-pz");
  await page.waitForFunction(() => window.Gafetes._estado().datos);
  const filas = await page.evaluate(() => window.Gafetes._estado().datos.filas.map((f) => [f.Apellidos, f.Nombre, f.Categoría, f.Edad, f.Torneo, f.Club, f.Elo, f.QR]));
  igual("solo los dos torneos con el sello, sin el retirado, por torneo y por nombre",
    filas.map((f) => f[0] + "|" + f[1]), ["Arias Mora|Sofía", "ZÚÑIGA ROJAS|MATEO", "Mora Céspedes|Ana Lucía", "Vargas Solís|Daniel"]);
  igual("la U16 juega el torneo U20", filas[2].slice(2, 5), ["U16 Femenino", "U16", "U20"]);
  igual("el QR de cada uno lleva a su ficha en su torneo", filas.map((f) => f[7]), [
    "https://ajedrez-integral.com/torneos-pareo#t=" + U12 + "&j=j-aa", "https://ajedrez-integral.com/torneos-pareo#t=" + U12 + "&j=j-zz",
    "https://ajedrez-integral.com/torneos-pareo#t=" + U20 + "&j=j-u16", "https://ajedrez-integral.com/torneos-pareo#t=" + U20 + "&j=j-u20"]);
  igual("de Pareo solo se leyó lo publicado (organizaciones y torneos)", [...new Set(await page.evaluate(() => window.__pedidos.map((p) => p.tabla).filter((t) => /^pareo/.test(t))))].sort(), ["pareo_organizadores", "pareo_publicados"]);

  const g = await page.evaluate(() => {
    const { diseno, datos } = window.Gafetes._estado();
    return window.GafetesDibujo.gafetes(diseno, datos.filas).map((x) => ({ n: x.nombre, d: x.detalles, f: x.franja, c: x.codigo, color: x.color, qr: x.qr }));
  });
  igual("el nombre en MAYÚSCULAS pasa a Nombre Propio", g[1].n, ["Zúñiga Rojas", "Mateo"]);
  igual("los detalles: categoría, Elo y torneo; sin Elo no queda «Elo» colgando", [g[0].d, g[2].d], [["U12 Femenino", "Juega el torneo U12"], ["U16 Femenino", "Elo 1431", "Juega el torneo U20"]]);
  igual("la franja dice el club", g.map((x) => x.f), ["ESCUELA PEDREGOSO", "ADAPZ", "ADAPZ", "ADAPZ"]);
  igual("el horario va centrado en el dorso", await page.evaluate(() => window.Gafetes._estado().diseno.dorso.horarioCentro), true);
  igual("un color por edad (U12, U16, U20)", g.map((x) => x.color), ["#1d64b0", "#1d64b0", "#0e7490", "#1b2a4a"]);
  igual("el código cuenta por edad", g.map((x) => x.c), ["U12 01", "U12 02", "U16 01", "U20 01"]);

  // La franja del frente, medida en el píxel (no la clase): la de la U16.
  await page.click("#g-siguiente"); await page.click("#g-siguiente");
  await page.waitForTimeout(700);
  const franja = await page.evaluate(() => {
    const c = document.getElementById("g-lienzo-frente");
    const px = c.getContext("2d").getImageData(Math.round(c.width * 0.5), Math.round(c.height * 0.83), 1, 1).data;
    return "#" + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  });
  igual("la franja de la U16 se pinta de su color", franja, "#0e7490");
  igual("la vista previa dice a quién muestra", await page.textContent("#g-fila"), "3 de 4: Mora Céspedes Ana Lucía");
  igual("sin avisos en la vista previa", await page.locator("#g-avisos li").allInnerTexts(), []);

  // El QR del dorso de dos jugadores, leído con un lector de verdad.
  await page.addScriptTag({ path: require.resolve("jsqr/dist/jsQR.js", { paths: [RAIZ] }) });
  const leidos = await page.evaluate(async () => {
    const { diseno, datos } = window.Gafetes._estado();
    const D = window.GafetesDibujo;
    const r = await D.preparar(diseno);
    const M = D.medidas(diseno);
    const todos = D.gafetes(diseno, datos.filas);
    const out = [];
    for (const i of [0, 3]) {
      const c = await D.cara(diseno, r, todos[i], "dorso");
      const lienzo = document.createElement("canvas");
      const px = 450 / 25.4;
      lienzo.width = Math.round(M.W * px); lienzo.height = Math.round(M.H * px);
      const ctx = lienzo.getContext("2d");
      ctx.setTransform(px, 0, 0, px, 0, 0);
      c.fondo(ctx);
      const x = Math.round((M.qr.x - 2) * px), y = Math.round((M.qr.y - 2) * px), w = Math.round((M.qr.w + 4) * px);
      const im = ctx.getImageData(x, y, w, w);
      const l = window.jsQR(im.data, w, w);
      out.push({ qr: l && l.data, clave: c.clave });
    }
    return out;
  });
  igual("el QR del dorso se lee y lleva a su ficha", leidos.map((x) => x.qr), [
    "https://ajedrez-integral.com/torneos-pareo#t=" + U12 + "&j=j-aa", "https://ajedrez-integral.com/torneos-pareo#t=" + U20 + "&j=j-u20"]);
  igual("cada uno tiene su propio fondo de dorso", leidos[0].clave !== leidos[1].clave, true);

  console.log("\nLas fotos");
  // Fotos de mentira como las del fotógrafo: fondo blanco y la persona (un
  // bloque rojo) que empieza bajito, a 5/9 del alto, como un niño.
  const foto = async () => Buffer.from((await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 300; c.height = 450;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 300, 450); x.fillStyle = "#b91c1c"; x.fillRect(60, 250, 180, 200);
    return c.toDataURL("image/jpeg", 0.95);
  })).split(",")[1], "base64");
  const jpg = await foto();
  const archivo = (name) => ({ name, mimeType: "image/jpeg", buffer: jpg });
  await page.setInputFiles("#g-fotos", [archivo("1 SOFIA.jpg"), archivo("1 SOFIA MEDIOS DIGITALES.jpg"), archivo("2 MATEO.jpg"), archivo("3 ANA.jpg"), archivo("4 ANA LUCIA.jpg")]);
  await page.waitForFunction(() => /con foto/.test(document.getElementById("g-fotos-estado").textContent));
  igual("la de «MEDIOS DIGITALES» no entra si está la otra", await page.evaluate(() => window.Gafetes._estado().fotos.map((f) => f.nombre)), ["1 SOFIA.jpg", "2 MATEO.jpg", "3 ANA.jpg", "4 ANA LUCIA.jpg"]);
  const emparejadas = () => page.$$eval("#g-fotos-lista li", (l) => l.map((x) => x.querySelector("label").textContent + " → " + (x.dataset.foto || "sin foto")));
  igual("se emparejan solas por el nombre; la más precisa gana; sin foto, ninguna", await emparejadas(),
    ["Arias Mora, Sofía → 1 SOFIA.jpg", "ZÚÑIGA ROJAS, MATEO → 2 MATEO.jpg", "Mora Céspedes, Ana Lucía → 4 ANA LUCIA.jpg", "Vargas Solís, Daniel → sin foto"]);
  ok(/3 de 4 con foto/.test(await page.textContent("#g-fotos-estado")) && /3 ANA\.jpg/.test(await page.textContent("#g-fotos-estado")), "dice cuántas tienen foto y cuál sobró");
  await page.selectOption("#g-fotos-lista li:nth-child(4) select", { label: "3 ANA.jpg" });
  igual("la que falta se elige a mano", (await emparejadas())[3], "Vargas Solís, Daniel → 3 ANA.jpg");
  await page.waitForTimeout(900);
  // El gafete 3 (Ana Lucía) en la vista previa: en el centro del marco, la
  // persona (el recorte empieza en su cabeza, no arriba en el fondo blanco).
  const enElMarco = await page.evaluate(() => {
    const c = document.getElementById("g-lienzo-frente");
    const px = c.getContext("2d").getImageData(Math.round(c.width * 0.5), Math.round(c.height * 0.42), 1, 1).data;
    return px[0] > 150 && px[1] < 90 && px[2] < 90;
  });
  igual("la foto va en el medio, recortada desde la cabeza", enElMarco, true);
  const claves = await page.evaluate(async () => {
    const { diseno, datos, fotos, fotoDe } = window.Gafetes._estado();
    const D = window.GafetesDibujo;
    const r = await D.preparar(diseno);
    const todos = D.gafetes(diseno, datos.filas);
    return Promise.all(todos.map(async (g) => {
      const i = fotoDe.get(g.fila.QR);
      if (i >= 0) { g.foto = fotos[i].lienzo; g.fotoClave = "foto-" + i; }
      return (await D.cara(diseno, r, g, "frente")).clave;
    }));
  });
  igual("cada frente con foto tiene su propio fondo", new Set(claves).size, 4);

  console.log("\nEl PDF");
  await page.click("#g-aprobar");
  const [zip] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#g-crear")]);
  const z = fs.readFileSync(await zip.path()).toString("latin1");
  const dentro = [...z.matchAll(/PK\x01\x02[\s\S]{42}([^\x00]*?\.pdf)/g)].map((m) => Buffer.from(m[1], "latin1").toString("utf8")).sort();
  igual("un .zip con un PDF por torneo", [zip.suggestedFilename(), dentro], ["Gafetes 5,5x8,5 - Eliminatoria JDN PZ 2026.zip", ["Gafetes 5,5x8,5 - U12.pdf", "Gafetes 5,5x8,5 - U20.pdf"]]);
  igual("ocho páginas en total (frente y dorso de cuatro)", (z.match(/\/Type \/Page\b/g) || []).length, 8);

  igual("sin errores en la consola", errores, []);
  await ctx.close();
  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nLos gafetes de la eliminatoria de PZ están como se pidió.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
