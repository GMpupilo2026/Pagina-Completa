#!/usr/bin/env node
/* «Creación de gafetes» (gafetes.html), comprobada en un navegador de verdad
 * con un cliente de Supabase de mentira, y el PDF que sale, abierto byte a byte.
 *
 * Lo que se rompe acá se rompe CALLADO: el PDF se ve perfecto en la pantalla
 * y la imprenta lo devuelve. Pasó con los del Centroamericano 2026 (ver
 * «Creación de gafetes» en docs/decisiones/paneles.md). Por eso se mira:
 *
 *  - que cada página mida EXACTO lo del gafete (10 × 14 cm), sin marcas;
 *  - que no lleve NINGUNA fuente (el texto va en curvas), ni máscaras, ni
 *    grupos: una imagen de fondo a 450 dpi por página y los trazos;
 *  - que los fondos iguales se compartan (500 gafetes no son 1000 imágenes);
 *  - que el QR se lea con la marca encima;
 *  - que el código cuente por grupo, salte a quien no lleva código y que
 *    una línea con un dato que falta no salga a medias;
 *  - que la bandera salga del código de FIDE, del ISO o del nombre del país;
 *  - que sin aprobar el diseño no se cree nada, y que el diseño aprobado
 *    sobreviva a cerrar la página (IndexedDB) y viaje en su archivo;
 *  - que un nombre con HTML se muestre literal y no se ejecute;
 *  - y que a quien no administra no se le pinte la herramienta.
 *
 * De paso: que las banderas de img/banderas/ sean las de flag-icons y las
 * dos fuentes de fonts/gafetes/ se puedan leer.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-gafetes.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");
const { chromium } = require("./lib/playwright-con-sesion");

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

/* ── Los archivos ── */
console.log("\nLas banderas y las fuentes");
try {
  execFileSync("node", [path.join(__dirname, "gafetes-banderas.js"), "--comprobar"], { stdio: "pipe" });
  igual("img/banderas/ son las de flag-icons, una por federación de la tabla", true, true);
} catch (e) {
  igual("img/banderas/ son las de flag-icons, una por federación de la tabla", String(e.stdout || e.message).trim(), "al día");
}
const opentype = require(require.resolve("opentype.js", { paths: [RAIZ] }));
for (const f of ["league-spartan-700.ttf", "quicksand-700.ttf"]) {
  const fuente = opentype.parse(fs.readFileSync(path.join(RAIZ, "fonts", "gafetes", f)).buffer);
  const faltan = [..."ÁÉÍÓÚÑÜáéíóúñü¿¡"].filter((c) => fuente.charToGlyphIndex(c) === 0);
  igual(`${f} trae las tildes, la ñ y la ü`, faltan, []);
}
igual("las licencias OFL de las dos fuentes van al lado", ["OFL-league-spartan.txt", "OFL-quicksand.txt"].every((f) => fs.existsSync(path.join(RAIZ, "fonts", "gafetes", f))), true);

/* ── El PDF, abierto a mano ── */
function leerPdf(buf) {
  const s = buf.toString("latin1");
  const objetos = new Map();
  const re = /(\d+) 0 obj\n([\s\S]*?)\nendobj\n/g;
  let m;
  while ((m = re.exec(s))) objetos.set(Number(m[1]), m[2]);
  const flujo = (cuerpo) => {
    const i = cuerpo.indexOf("stream\n");
    const largo = Number((cuerpo.match(/\/Length (\d+)/) || [])[1]);
    return Buffer.from(cuerpo.slice(i + 7, i + 7 + largo), "latin1");
  };
  const paginas = [...objetos.values()].filter((o) => /\/Type \/Page\b/.test(o));
  const imagenes = [...objetos.entries()].filter(([, o]) => /\/Subtype \/Image/.test(o));
  return { s, objetos, paginas, imagenes, flujo };
}

const PERSONAS = [
  ["Apellidos", "Nombre", "FIDE ID", "Categoría", "Federación", "Rol", "Atrás", "Teléfono", "Cámara", "Sin código"],
  ["PÉREZ MORA", "VALENTINA", "6512345", "U12 Femenino", "CRC", "Atleta", "", "", "", ""],
  ["Mike", "Sienna", "7718110", "U08 Femenino", "Trinidad y Tobago", "Atleta", "", "", "", ""],
  ["Núñez", "José Ángel", "", "", "pa", "Delegado", "", "Sí", "", ""],
  ["González Camacho", "Arleth", "", "", "CRC", "Organización", "PRENSA 1", "Sí", "Sí", ""],
  ['<img src=x onerror="window.__xss=1">', "John", "", "", "XYZ", "Árbitro", "", "no", "", "rojo"],
  ["Vargas", "Emma", "6599999", "U14 Femenino", "CRC", "Atleta", "", "", "", ""],
];

function cliente(admin) {
  return `window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u" }, access_token: "t" } } }) },
    from() { const b = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: { is_admin: ${admin} }, error: null }) }; return b; },
  };`;
}

async function abrir(ctx, admin) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente(admin) }));
  await page.goto(BASE + "/gafetes.html", { waitUntil: "networkidle" });
  return { page, errores };
}

async function aceptar(page, boton) {
  await page.click(`dialog[open] button:has-text("${boton}")`);
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\nQuien no administra");
  {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const { page } = await abrir(ctx, false);
    await page.waitForSelector("#denegado:not(.hidden)");
    igual("ve el aviso y no la herramienta", await page.evaluate(() => document.getElementById("app").classList.contains("hidden")), true);
    await ctx.close();
  }

  console.log("\nQuien administra: los datos y la vista previa");
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
  const { page, errores } = await abrir(ctx, true);
  await page.waitForSelector("#app:not(.hidden)");
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
  await page.click("#g-ejemplo");
  await aceptar(page, "Usar ese diseño");
  await page.waitForFunction(() => window.Gafetes._estado().diseno.nombreDiseno === "Centroamericano 2026");
  // Un Excel de verdad, con una fila de título suelta arriba (como los que llegan).
  const xlsx = await page.evaluate((filas) => Array.from(window.TablaExcel.armar([{ nombre: "Inscritos", filas: [["Lista de inscritos"], ...filas] }])), PERSONAS);
  await page.setInputFiles("#g-excel", { name: "inscritos.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(xlsx) });
  await page.waitForFunction(() => window.Gafetes._estado().datos);
  igual("encuentra sola la fila de los títulos (la 2)", await page.inputValue("#g-fila-titulos"), "2");
  igual("lee las seis personas", await page.evaluate(() => window.Gafetes._estado().datos.filas.length), PERSONAS.length - 1);
  await page.fill("#g-vertical", "{Atrás|Rol}");
  await page.selectOption("#g-icono0", "Teléfono");
  await page.selectOption("#g-icono1", "Cámara");
  await page.selectOption("#g-sin-codigo", "Sin código");
  await page.waitForTimeout(700);

  const calculo = await page.evaluate(() => {
    const { diseno, datos } = window.Gafetes._estado();
    return window.GafetesDibujo.gafetes(diseno, datos.filas).map((g) => ({ n: g.nombre, d: g.detalles, iso: g.iso, c: g.codigo, v: g.vertical, i: g.iconos }));
  });
  igual("el nombre en MAYÚSCULAS pasa a Nombre Propio", calculo[0].n, ["Pérez Mora", "Valentina"]);
  igual("sin FIDE ID, la línea «FIDE ID:» no sale", calculo[2].d, []);
  igual("la bandera: código de FIDE, nombre del país, ISO y uno que no existe", calculo.map((g) => g.iso), ["cr", "tt", "pa", "cr", null, "cr"]);
  igual("el código cuenta por país y salta a quien no lleva", calculo.map((g) => g.c), ["CRC 01", "TRINIDAD Y TOBAGO 01", "PA 01", "CRC 02", null, "CRC 03"]);
  igual("el texto de lado: «Atrás» y, si está vacía, el rol", calculo.map((g) => g.v), ["ATLETA", "ATLETA", "DELEGADO", "PRENSA 1", "ÁRBITRO", "ATLETA"]);
  igual("los íconos: «Sí» los pone, «no» y vacío no", calculo.map((g) => g.i), [[false, false], [false, false], [true, false], [true, true], [false, false], [false, false]]);

  // La franja del frente sale del color del rol (se mide el píxel, no la clase).
  const colorFranja = async () => page.evaluate(() => {
    const c = document.getElementById("g-lienzo-frente");
    const px = c.getContext("2d").getImageData(Math.round(c.width * 0.5), Math.round(c.height * 0.83), 1, 1).data;
    return "#" + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  });
  igual("la franja de una atleta es azul", await colorFranja(), "#1d4ed8");
  for (let i = 0; i < 3; i++) await page.click("#g-siguiente");
  await page.waitForTimeout(600);
  igual("la de Organización es verde", await colorFranja(), "#1e6b34");
  igual("la vista previa dice a quién muestra", await page.textContent("#g-fila"), "4 de 6: González Camacho Arleth");
  await page.click("#g-siguiente");
  await page.waitForTimeout(600);
  igual("el nombre con HTML se ve literal y no se ejecuta", await page.evaluate(() => [!!window.__xss, document.querySelectorAll("#g-datos-tabla img").length, document.getElementById("g-datos-tabla").textContent.includes("<img")]), [false, 0, true]);
  igual("avisa de la bandera que no encuentra", (await page.locator("#g-avisos li").allInnerTexts()).some((t) => t.includes("«XYZ»")), true);

  // El QR, con la marca en el centro, se lee (jsQR, de node_modules).
  await page.addScriptTag({ path: require.resolve("jsqr/dist/jsQR.js", { paths: [RAIZ] }) });
  const qr = await page.evaluate(async () => {
    const { diseno, datos } = window.Gafetes._estado();
    const D = window.GafetesDibujo;
    const r = await D.preparar(diseno);
    const g = D.gafetes(diseno, datos.filas)[0];
    const c = await D.cara(diseno, r, g, "dorso");
    const M = D.medidas(diseno);
    const lienzo = document.createElement("canvas");
    const px = 450 / 25.4;
    lienzo.width = Math.round(M.W * px); lienzo.height = Math.round(M.H * px);
    const ctx = lienzo.getContext("2d");
    ctx.setTransform(px, 0, 0, px, 0, 0);
    c.fondo(ctx);
    const x = Math.round((M.qr.x - 2) * px), y = Math.round((M.qr.y - 2) * px), w = Math.round((M.qr.w + 4) * px);
    const im = ctx.getImageData(x, y, w, w);
    const leido = window.jsQR(im.data, w, w);
    return leido && leido.data;
  });
  igual("el QR con la marca encima se lee", qr, "https://fcacostarica.com/campeonato-centroamericano-y-del-caribe-de-la-juventud-2026/");

  console.log("\nAprobar y crear el PDF");
  await page.click("#g-crear");
  await page.waitForTimeout(400);
  igual("sin aprobar, no crea nada y lo dice", [await page.isVisible("#g-resultado"), (await page.locator("#avisos-zona [role=alert]").allInnerTexts()).join(" ").includes("aprueba el diseño")], [false, true]);
  await page.click("#g-aprobar");
  igual("aprobado, los campos del diseño quedan quietos", await page.evaluate(() => document.getElementById("g-diseno-campos").disabled), true);
  const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#g-crear")]);
  const pdf = fs.readFileSync(await descarga.path());
  igual("el archivo se llama como el diseño", descarga.suggestedFilename(), "Gafetes 10x14 - Centroamericano 2026.pdf");
  const P = leerPdf(pdf);
  igual("dos páginas por persona", P.paginas.length, (PERSONAS.length - 1) * 2);
  igual("cada página mide 10 × 14 cm, sin marcas de corte", [...new Set(P.paginas.map((p) => (p.match(/\/MediaBox \[([^\]]+)\]/) || [])[1]))], ["0 0 283.46 396.85"]);
  igual("ninguna fuente: todo el texto va en curvas", /\/Font\b|\/FontFile/.test(P.s), false);
  igual("ni máscaras ni grupos", /\/SMask|\/Mask\b|\/Group\b|\/Subtype \/Form/.test(P.s), false);
  igual("una sola imagen por página", P.paginas.every((p) => (p.match(/\/XObject << ([^>]*) >>/) || [, ""])[1].trim().split(/\s+(?=\/)/).length === 1), true);
  igual("el fondo es un JPEG a 450 dpi (1772 × 2480)", [...new Set(P.imagenes.map(([, o]) => (o.match(/\/Width (\d+) \/Height (\d+)/) || []).slice(1).join("×") + (/DCTDecode/.test(o) ? " JPEG" : "")))], ["1772×2480 JPEG"]);
  igual("los fondos iguales se comparten (menos imágenes que páginas)", P.imagenes.length < P.paginas.length, true);
  const contenidos = P.paginas.map((p) => zlib.inflateSync(P.flujo(P.objetos.get(Number(p.match(/\/Contents (\d+) 0 R/)[1])))).toString("latin1"));
  igual("cada página pone su fondo y rellena las letras", contenidos.every((c) => /\/F Do/.test(c) && /\nf(\n|$)/.test(c) && / c\n/.test(c)), true);

  console.log("\nUn PDF por país, en un .zip");
  await page.click("#g-aprobar");
  await aceptar(page, "Cambiar el diseño");
  await page.selectOption("#g-separar", "Federación");
  await page.click("#g-aprobar");
  const [zip] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#g-crear")]);
  const z = fs.readFileSync(await zip.path()).toString("latin1");
  const dentro = [...z.matchAll(/PK\x01\x02[\s\S]{42}([^\x00]*?\.pdf)/g)].map((m) => Buffer.from(m[1], "latin1").toString("utf8"));
  igual("un .zip con un PDF por cada valor", [zip.suggestedFilename(), dentro.length], ["Gafetes 10x14 - Centroamericano 2026.zip", 4]);

  console.log("\nEl diseño se queda");
  const [archivo] = await Promise.all([page.waitForEvent("download"), page.click("#g-guardar")]);
  const json = JSON.parse(fs.readFileSync(await archivo.path(), "utf8"));
  igual("el archivo del diseño lleva sus logos y que está aprobado", [json.tipo, !!(json.imagenes.logoIzq && json.imagenes.logoIzq.datos.startsWith("data:image/")), json.aprobado], ["ajedrez-integral-gafetes", true, true]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)");
  await page.waitForFunction(() => window.Gafetes._estado().diseno.nombreDiseno === "Centroamericano 2026");
  igual("al volver a abrir la página sigue aprobado (y el Excel no quedó guardado)", await page.evaluate(() => [window.Gafetes._estado().diseno.aprobado, window.Gafetes._estado().datos]), [true, null]);
  await page.click("#g-aprobar");
  await aceptar(page, "Cambiar el diseño");
  await page.click("#g-nuevo");
  await aceptar(page, "Empezar de cero");
  igual("empezar de cero borra el diseño", await page.evaluate(() => window.Gafetes._estado().diseno.nombreDiseno), "Mi evento");
  await page.setInputFiles("#g-abrir", { name: "diseno.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(json)) });
  await page.waitForFunction(() => window.Gafetes._estado().diseno.nombreDiseno === "Centroamericano 2026");
  igual("abrir el archivo lo trae de vuelta, aprobado", await page.evaluate(() => window.Gafetes._estado().diseno.aprobado), true);

  igual("sin errores en la consola", errores, []);
  await ctx.close();
  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nLa creación de gafetes está como se pidió.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
