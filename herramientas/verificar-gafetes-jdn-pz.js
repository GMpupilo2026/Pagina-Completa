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
    // Los ID FIDE de las inscripciones aceptadas (public.pareo_fide_de_aceptados).
    rpc(fn, a) {
      window.__pedidos.push({ tabla: "rpc:" + fn, cols: JSON.stringify(a) });
      if (fn === "pareo_fide_de_aceptados") return Promise.resolve({ data: (D.fide || {})[a.p_publicado] || [], error: null });
      return Promise.resolve({ data: null, error: { message: "no existe" } });
    },
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
  // El ID FIDE de la inscripción: el nombre escrito distinto (mayúsculas, sin
  // tildes) igual empareja; Mateo y Ana no tienen.
  const FIDE = { [U12]: [{ nombre: "ARIAS MORA, SOFIA", fide_id: "6512345" }], [U20]: [{ nombre: "Vargas Solís, Daniel", fide_id: "6599999" }] };
  const { page, errores } = await abrir(ctx, { orgs: ORGS, publicados: PUBLICADOS, fide: FIDE });
  await page.click("#g-ejemplo-pz");
  await aceptar(page, "Usar ese diseño");
  await page.waitForFunction(() => window.Gafetes._estado().diseno.nombreDiseno === "Eliminatoria JDN PZ 2026");
  const d = await page.evaluate(() => {
    const x = window.Gafetes._estado().diseno;
    return { imgs: ["logoIzq", "logoDer", "ilustracion", "ilustracionDorso"].map((k) => x.imagenes[k] && x.imagenes[k].nombre), filas: x.dorso.horario.length, qr: x.dorso.qr, texto: x.dorso.qrTexto, campo: document.getElementById("g-qr").value, tam: [x.tamano.ancho, x.tamano.alto] };
  });
  igual("los logos de la ADAPZ y del CCDR, la profe Karina al frente (sin foto) y mostrando el QR atrás", d.imgs, ["logo.jpg", "ccdr-pz.jpg", "bienvenidos.webp", "presentando.webp"]);
  igual("5,5 × 8,5 cm", d.tam, [55, 85]);
  // Los dos logos del mismo alto, medido en el píxel de la vista previa: lo
  // dibujado (no el archivo, que trae márgenes distintos) en cada esquina.
  await page.waitForTimeout(700);
  const altos = await page.evaluate(() => {
    const c = document.getElementById("g-lienzo-frente");
    const ctx = c.getContext("2d");
    const alto = (x0f, x1f) => {
      const x0 = Math.round(c.width * x0f), w = Math.round(c.width * (x1f - x0f)), h = Math.round(c.height * 20 / 140);
      const px = ctx.getImageData(x0, 0, w, h).data;
      let y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < 230) { if (y < y0) y0 = y; y1 = y; }
      }
      return y1 - y0 + 1;
    };
    return [alto(0.03, 0.37), alto(0.63, 0.97)];
  });
  igual("el logo de la ADAPZ y el del CCDR, del mismo alto (±3 %)", Math.abs(altos[0] - altos[1]) <= 0.03 * Math.max(...altos), true);
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
  igual("debajo del nombre, la categoría y el ID FIDE de la inscripción (sin él, la línea no sale); sin Elo ni «Juega el torneo»", [g[0].d, g[2].d, g[3].d],
    [["U12 Femenino", "ID FIDE: 6512345"], ["U16 Femenino"], ["U20 Absoluto", "ID FIDE: 6599999"]]);
  igual("los ID FIDE se pidieron a la función de los aceptados, por torneo", await page.evaluate(() => window.__pedidos.filter((p) => p.tabla === "rpc:pareo_fide_de_aceptados").length), 2);
  igual("la franja dice el club", g.map((x) => x.f), ["ESCUELA PEDREGOSO", "ADAPZ", "ADAPZ", "ADAPZ"]);
  igual("el horario va centrado en el dorso", await page.evaluate(() => window.Gafetes._estado().diseno.dorso.horarioCentro), true);
  igual("un color por edad (U12, U16, U20)", g.map((x) => x.color), ["#1d64b0", "#1d64b0", "#1873b4", "#1b2a4a"]);
  igual("abajo del dorso, la categoría sola (sin número)", g.map((x) => x.c), ["U12", "U12", "U16", "U20"]);
  // El nombre en negro (para el árbitro), aunque la franja vaya del color de la edad.
  const colores = await page.evaluate(async () => {
    const { diseno, datos } = window.Gafetes._estado();
    const D = window.GafetesDibujo, r = await D.preparar(diseno);
    const g = D.gafetes(diseno, datos.filas)[2];
    return (await D.cara(diseno, r, g, "frente")).textos.map((t) => t.color);
  });
  igual("el nombre va en negro", colores.includes("#000000"), true);

  // La franja del frente, medida en el píxel (no la clase): la de la U16.
  await page.click("#g-siguiente"); await page.click("#g-siguiente");
  await page.waitForTimeout(700);
  const franja = await page.evaluate(() => {
    const c = document.getElementById("g-lienzo-frente");
    const px = c.getContext("2d").getImageData(Math.round(c.width * 0.5), Math.round(c.height * 0.83), 1, 1).data;
    return "#" + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  });
  igual("la franja de la U16 se pinta de su color (celeste oscuro)", franja, "#1873b4");
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
  const geo = await page.evaluate(() => {
    const { diseno, datos } = window.Gafetes._estado();
    const M = window.GafetesDibujo.medidas(diseno);
    return { qr: [M.qr.w, M.qr.h].map((v) => Math.round(v * 100) / 100), poses: window.GafetesDibujo.gafetes(diseno, datos.filas).map((g) => g.ilustracionDorso) };
  });
  igual("el QR es cuadrado aunque el gafete no sea de 10 × 14", geo.qr[0] === geo.qr[1], true);
  igual("la profe Karina cambia de pose en cada dorso, por turno", geo.poses, ["ilustracionDorso", "karina2", "karina3", "karina4"]);

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
  // Como quedó la carpeta de la PZ: el apellido solo en la versión con la
  // marca del fotógrafo (se usa la foto limpia, buscada con el nombre
  // completo), y un archivo con un nombre de más (dos palabras alcanzan).
  const izq = Buffer.from((await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 300; c.height = 450;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 300, 450); x.fillStyle = "#b91c1c"; x.fillRect(10, 250, 120, 200);
    return c.toDataURL("image/jpeg", 0.95);
  })).split(",")[1], "base64");
  await page.setInputFiles("#g-fotos", [archivo("7 DANIEL.jpg"), archivo("7 DANIEL Vargas MEDIOS DIGITALES.jpg"), { name: "8 Ana PEREZ Mora Cespedes.jpg", mimeType: "image/jpeg", buffer: izq }]);
  await page.waitForFunction(() => /2 de 4 con foto/.test(document.getElementById("g-fotos-estado").textContent));
  // La 8 tiene a la persona corrida a la izquierda: el recorte la centra.
  const corrida = await page.evaluate(() => {
    const f = window.Gafetes._estado().fotos.find((x) => /^8 /.test(x.nombre));
    const c = f.lienzo, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let suma = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 90) { suma += (i / 4) % c.width; n++; }
    return n ? Math.abs(suma / n / c.width - 0.5) : 1;
  });
  igual("una persona corrida a un lado de la foto queda centrada en el recorte (±10 %)", corrida < 0.1, true);
  igual("el apellido de la versión con marca sirve para buscar la limpia; dos palabras alcanzan", await emparejadas(),
    ["Arias Mora, Sofía → sin foto", "ZÚÑIGA ROJAS, MATEO → sin foto", "Mora Céspedes, Ana Lucía → 8 Ana PEREZ Mora Cespedes.jpg", "Vargas Solís, Daniel → 7 DANIEL.jpg"]);

  console.log("\nLa hoja carta para imprimir en casa (frente y dorso)");
  igual("el diseño de la PZ sale en hoja carta", await page.inputValue("#g-formato"), "carta");
  await page.click("#g-aprobar");
  const [hoja] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#g-crear")]);
  const hp = fs.readFileSync(await hoja.path()).toString("latin1");
  igual("un solo PDF", hoja.suggestedFilename(), "Gafetes carta - Eliminatoria JDN PZ 2026.pdf");
  const objs = new Map([...hp.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj\n/g)].map((m) => [Number(m[1]), m[2]]));
  const pags = [...objs.values()].filter((o) => /\/Type \/Page\b/.test(o));
  igual("cuatro gafetes: una hoja, dos páginas (frentes y dorsos)", pags.length, 2);
  igual("la página mide carta (21,59 × 27,94 cm)", [...new Set(pags.map((p) => (p.match(/\/MediaBox \[([^\]]+)\]/) || [])[1]))], ["0 0 612 792"]);
  const contenido = (p) => {
    const o = objs.get(Number(p.match(/\/Contents (\d+) 0 R/)[1]));
    const i = o.indexOf("stream\n"), largo = Number(o.match(/\/Length (\d+)/)[1]);
    return require("zlib").inflateSync(Buffer.from(o.slice(i + 7, i + 7 + largo), "latin1")).toString("latin1");
  };
  // Dónde pone cada cara: x e y (abajo a la izquierda, en mm) de cada «cm … Do».
  const ubicar = (c) => [...c.matchAll(/q ([\d.]+) 0 0 ([\d.]+) ([\d.-]+) ([\d.-]+) cm \/F\d+ Do Q/g)].map((m) => [m[1], m[2], m[3], m[4]].map((v) => Number(v) * 25.4 / 72));
  const [cf, cd] = pags.map(contenido);
  const fr = ubicar(cf), ds = ubicar(cd);
  igual("cada cara mide 5,5 × 8,5 cm", [...new Set([...fr, ...ds].map((u) => u[0].toFixed(1) + "×" + u[1].toFixed(1)))], ["55.0×85.0"]);
  // Volteando por el borde largo, el dorso de cada uno cae en el espejo de su
  // frente (misma fila, columna al revés): x del frente + x del dorso = ancho
  // de la hoja − ancho del gafete, y la misma altura.
  igual("cada dorso queda detrás de su frente al voltear por el borde largo", fr.every((f, k) => Math.abs(f[2] + ds[k][2] - (215.9 - 55)) < 0.05 && Math.abs(f[3] - ds[k][3]) < 0.05), true);
  // Tres columnas centradas: (215,9 − 3 × 55) / 2 = 25,45 mm de margen a cada lado.
  igual("los primeros tres, en la primera fila de izquierda a derecha", fr.slice(0, 3).every((f, k) => Math.abs(f[2] - (25.45 + 55 * k)) < 0.05), true);
  igual("las marcas de corte, solo en la página de los frentes", [/ RG 0\.25 w/.test(cf), / RG 0\.25 w/.test(cd)], [true, false]);
  const lineas = [...cf.matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g)].map((m) => m.slice(1).map((v) => Number(v) * 25.4 / 72));
  const enGafete = (x, y) => fr.some((f) => x > f[2] + 0.1 && x < f[2] + 54.9 && y > f[3] + 0.1 && y < f[3] + 84.9);
  igual("ninguna marca pisa un gafete", lineas.some(([x1, y1, x2, y2]) => [0, 0.25, 0.5, 0.75, 1].some((t) => enGafete(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))), false);
  // El corrimiento del dorso, por si la impresora no calza exacto.
  await page.click("#g-aprobar");
  await aceptar(page, "Cambiar el diseño");
  await page.fill("#g-dorso-x", "1.5");
  await page.click("#g-aprobar");
  const [hoja2] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#g-crear")]);
  const hp2 = fs.readFileSync(await hoja2.path()).toString("latin1");
  const objs2 = new Map([...hp2.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj\n/g)].map((m) => [Number(m[1]), m[2]]));
  const pags2 = [...objs2.values()].filter((o) => /\/Type \/Page\b/.test(o));
  const cont2 = (p) => { const o = objs2.get(Number(p.match(/\/Contents (\d+) 0 R/)[1])); const i = o.indexOf("stream\n"), largo = Number(o.match(/\/Length (\d+)/)[1]); return require("zlib").inflateSync(Buffer.from(o.slice(i + 7, i + 7 + largo), "latin1")).toString("latin1"); };
  const ds2 = ubicar(cont2(pags2[1])), fr2 = ubicar(cont2(pags2[0]));
  igual("«a la derecha 1,5 mm» corre solo los dorsos", [Math.round((ds2[0][2] - ds[0][2]) * 10) / 10, Math.round((fr2[0][2] - fr[0][2]) * 10) / 10], [1.5, 0]);

  console.log("\nEl PDF para la imprenta");
  await page.click("#g-aprobar");
  await aceptar(page, "Cambiar el diseño");
  await page.fill("#g-dorso-x", "0");
  await page.selectOption("#g-formato", "imprenta");
  await page.selectOption("#g-separar", "Torneo");
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
