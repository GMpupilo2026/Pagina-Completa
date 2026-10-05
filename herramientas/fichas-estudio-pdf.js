/* ===== Las fichas de Estudio en papel: el libro y las cartas =====
 *
 * Arma dos archivos en material/fichas-de-estudio/:
 *
 *   fichas-de-estudio-libro.pdf    Todas las fichas como un libro, en hoja carta:
 *                                  tapa, presentación, índice (una o más páginas), una portadilla
 *                                  por categoría y una ficha por página, con
 *                                  su número.
 *   fichas-de-estudio-cartas.pdf   Las mismas como cartas de 63 × 88 mm
 *                                  (el tamaño de una carta de juego), nueve por
 *                                  hoja carta, con marcas de corte. Frente: el
 *                                  título, el tablero y la idea principal.
 *                                  Reverso: los cuatro bloques. Las hojas van
 *                                  frente, reverso, frente, reverso…, y el
 *                                  reverso va en espejo, para imprimir a doble
 *                                  cara volteando por el borde largo.
 *
 * Las páginas de ficha del libro NO se dibujan acá: son la ficha impresa de
 * entreno/estudio.html, tal cual sale al apretar «Imprimir esta ficha». Una
 * segunda maqueta del mismo mapa se iría separando de la primera a la primera
 * corrección. Por eso este generador necesita el sitio levantado en el 8777,
 * como los verificadores. Las cartas sí tienen su maqueta propia, porque en
 * 63 × 88 mm no cabe el mapa: salen del mismo banco (js/fichas-estudio.js) y
 * con el mismo dibujante de tableros que el material de los cursos
 * (herramientas/lib/tablero-svg.js).
 *
 * En los dos, el tablero muestra la posición del FINAL de la línea, que es la
 * que describe el pie de la ficha (igual que al imprimir desde la página).
 *
 *   fichas-de-estudio-accesible.html
 *                                  Las mismas fichas para quien no ve: sin una
 *                                  sola imagen, con un índice por categoría y
 *                                  otro alfabético que llevan directo a cada
 *                                  ficha, cada posición contada pieza por pieza
 *                                  y cada jugada dicha («caballo felix 3»). Sale
 *                                  del mismo banco, así que dice lo mismo que el
 *                                  papel. La página de Estudio también se lee con
 *                                  lector de pantalla, pero es una ficha por vez:
 *                                  el dueño pidió un documento entero, con índice,
 *                                  para buscar y llegar directo.
 *
 * Al tocar el banco de fichas, o la ficha impresa, hay que volver a correrlo o
 * el papel deja de coincidir con la pantalla.
 *
 * Cómo se corre (además de npm install, necesita pypdf para unir las partes):
 *
 *     pip install pypdf
 *     python3 -m http.server 8777          # desde la raíz del sitio
 *     node herramientas/fichas-estudio-pdf.js
 *     node herramientas/fichas-estudio-pdf.js --solo-cartas
 *     node herramientas/fichas-estudio-pdf.js --solo-libro
 *     node herramientas/fichas-estudio-pdf.js --solo-accesible   # sin sitio, sin PDF
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("./lib/playwright-con-sesion");
const { tablero } = require("./lib/tablero-svg.js");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DESTINO = path.join(RAIZ, "material", "fichas-de-estudio");
const { FICHAS, CATEGORIAS, TITULOS } = require(path.join(RAIZ, "js", "fichas-estudio.js"));
const { LINEAS } = require(path.join(RAIZ, "js", "aperturas-lineas.js"));
const CJS = require("chess.js");
const Chess = CJS.Chess || CJS;

const NIVEL = { 1: "Principiante", 2: "Intermedio", 3: "Avanzado" };
// Los colores de cada categoría y de cada bloque son los de la ficha en
// pantalla (entreno/estudio.html); los de los finales y los mates son
// propios del papel (el de los mates, #a01a6b, da 7,4:1).
// Todos medidos contra blanco, en los dos sentidos (texto de color sobre
// blanco y letra blanca sobre el color de la banda): de 4,7:1 a 8,4:1.
const COLOR_CAT = { apertura: "#a1670f", defensa: "#2c5f7f", tactica: "#8c2f3f", mate: "#a01a6b", concepto: "#2c6b4f", final: "#5b3e8a" };
const COLOR_BLOQUE = ["#486581", "#2c6b4f", "#a8371a", "#2c5f7f", "#8c2f3f"];

const solo = process.argv.includes("--solo-cartas") ? "cartas" : process.argv.includes("--solo-libro") ? "libro" : process.argv.includes("--solo-accesible") ? "accesible" : "";

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const incrustar = (rel) => "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, rel)).toString("base64");
const SELLO = incrustar("img/logo-oscar-angulo-marca.png");
const LOGO_CREMA = incrustar("img/logo-oscar-angulo.png");

/* La posición que se imprime: el final de la línea (o la FEN de estudio con
   su línea jugada), la misma que pone la página al imprimir. */
const POR_ID = new Map(LINEAS.map((L) => [L.id, L]));
function jugadasDe(F) {
  if (F.fen) return F.linea || [];
  if (F.jugadas) return F.jugadas;
  const L = POR_ID.get(F.lineaId);
  if (!L) throw new Error(`La ficha ${F.id} apunta a una línea que no existe: ${F.lineaId}`);
  return L.jugadas;
}
function fenFinal(F) {
  const g = new Chess();
  if (F.fen && !g.load(F.fen)) throw new Error(`FEN inválida en la ficha ${F.id}`);
  for (const j of jugadasDe(F)) {
    if (!g.move(j, { sloppy: true })) throw new Error(`Jugada ilegal ${j} en la ficha ${F.id}`);
  }
  return g.fen();
}

// El orden del libro y de las cartas: el de la página, categoría por categoría.
const ORDEN = CATEGORIAS.map((c) => ({ cat: c, fichas: FICHAS.filter((F) => F.categoria === c.id) }));

/* El doble de Supabase, para abrir la página de Estudio sin cuenta: solo
   hace falta que diga que hay sesión. */
const CLIENTE = `window.sb={auth:{getSession:()=>Promise.resolve({data:{session:{user:{id:"generador"}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`;

async function contexto(browser) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CLIENTE }));
  return ctx;
}

/* Una página suelta (tapa, índice, cartas) se sirve desde el mismo sitio para
   que cargue las letras de css/fuentes.css. */
async function pdfDeHtml(ctx, html, opciones) {
  const ruta = "/__generador-fichas/" + Math.random().toString(36).slice(2) + ".html";
  await ctx.route("**" + ruta, (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  const page = await ctx.newPage();
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const antes = opciones.antes ? await page.evaluate(opciones.antes) : null;
  const pdf = await page.pdf(Object.assign({ printBackground: true, preferCSSPageSize: true }, opciones.pdf));
  await page.close();
  return opciones.antes ? { pdf, antes } : pdf;
}

const hojas = (pdf) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

/* ------------------------------------------------------------------ libro */
const PIE = (n) => `<div style="width:100%;font-size:8px;color:#486581;font-family:Inter,Arial,sans-serif;display:flex;justify-content:space-between;padding:0 12mm">` +
  `<span>Fichas de estudio · Ajedrez Integral</span><span>${n}</span></div>`;
const MARGEN = { top: "12mm", bottom: "14mm", left: "12mm", right: "12mm" };

const ESTILO_LIBRO = `
  <link rel="stylesheet" href="/css/fuentes.css">
  <style>
    @page{size:letter; margin:12mm 12mm 14mm;}
    *{box-sizing:border-box; print-color-adjust:exact; -webkit-print-color-adjust:exact;}
    body{margin:0; font-family:'Inter',Arial,sans-serif; color:#102a43; font-size:11pt; line-height:1.5;}
    h1,h2,h3{font-family:'Merriweather',Georgia,serif; color:#102a43; line-height:1.2; margin:0;}
    p{margin:0 0 8px;}
  </style>`;

function htmlTapa() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tapa</title>${ESTILO_LIBRO}
  <style>
    @page{margin:0;}
    body{width:216mm; height:279.4mm; background:#102a43; color:#f0f4f8; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;}
    .marco{position:absolute; inset:10mm; border:1.5px solid #de911d; border-radius:6mm;}
    img{width:120mm; height:auto;}
    h1{color:#f0f4f8; font-size:38pt; margin-top:14mm;}
    .sub{color:#f0b429; font-size:13pt; letter-spacing:0.12em; text-transform:uppercase; margin-top:6mm;}
    .cats{margin-top:16mm; font-size:11pt; color:#d9e2ec;}
    .autor{position:absolute; bottom:22mm; left:0; right:0; font-size:10.5pt; color:#bcccdc;}
  </style></head><body>
    <div class="marco"></div>
    <img src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez">
    <h1>Fichas de estudio</h1>
    <p class="sub">${FICHAS.length} ideas de ajedrez en una página cada una</p>
    <p class="cats">${CATEGORIAS.map((c) => esc(c.etiqueta)).join(" · ")}</p>
    <p class="autor">Ajedrez Integral · Oscar Angulo Cubero, Entrenador FIDE y Árbitro Internacional</p>
  </body></html>`;
}

function htmlPresentacion() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Presentación</title>${ESTILO_LIBRO}
  <style>
    h1{font-size:22pt; margin-bottom:6mm; padding-bottom:3mm; border-bottom:3px double #de911d;}
    h2{font-size:13pt; margin:7mm 0 2mm;}
    ul{margin:0 0 6px; padding-left:1.2em;} li{margin-bottom:4px;}
    .sello{display:block; width:45mm; margin:12mm auto 0; opacity:0.85;}
  </style></head><body>
    <h1>Cómo usar este libro</h1>
    <p>Cada ficha cabe en una página y se lee como un mapa: la idea principal arriba, el tablero en el medio y, alrededor, cuatro bloques que la explican. Las flechas salen del sello del centro hacia cada bloque, y cada bloque tiene su color y su título escrito.</p>
    <h2>Qué trae cada ficha</h2>
    <ul>
      <li><strong>La idea principal</strong>: lo que hay que recordar aunque se olvide todo lo demás.</li>
      <li><strong>El tablero</strong>: la posición del final de la línea, la que cuenta el texto de abajo.</li>
      <li><strong>Los cuatro bloques</strong>: en las aperturas y defensas, los planes, las ideas tácticas, el medio juego y el final; en la táctica, cómo se reconoce, quién la hace, los errores frecuentes y cómo practicarla; en los conceptos, cuándo aparece, qué hacer, los errores frecuentes y qué pasa en el final; en los finales, cuándo aparece, cómo se juega, los errores frecuentes y cómo practicarlo.</li>
      <li><strong>Las jugadas</strong>: la línea completa, abajo, para jugarla en un tablero de verdad.</li>
    </ul>
    <h2>Cómo estudiarlas</h2>
    <ul>
      <li>Coloca la posición en un tablero y juega la línea desde el principio, en voz alta.</li>
      <li>Tapa los bloques y trata de decir qué dicen antes de leerlos.</li>
      <li>Cada ficha está también en la Academia, en Entrenamiento › Estudio, donde se recorre jugada a jugada y se practica contra la máquina.</li>
    </ul>
    <img class="sello" src="${SELLO}" alt="">
  </body></html>`;
}

/* El índice se reparte por categorías enteras, hasta unos setenta títulos por
   página (dos columnas de 35 renglones): con 98 fichas ya no entraba en una,
   y una categoría partida entre dos páginas se busca mal. Dentro de la página
   sí puede seguir en la otra columna: con 184 fichas, Táctica sola tiene 48
   títulos y no cabe en una columna (el título de la sección no se separa de
   sus primeras líneas). */
const POR_PAGINA_INDICE = 70;
function paginasDelIndice() {
  const out = [];
  let actual = [], cuenta = 0;
  for (const grupo of ORDEN) {
    if (actual.length && cuenta + grupo.fichas.length > POR_PAGINA_INDICE) { out.push(actual); actual = []; cuenta = 0; }
    actual.push(grupo);
    cuenta += grupo.fichas.length;
  }
  if (actual.length) out.push(actual);
  return out;
}

function htmlIndice(paginas, grupos, primera) {
  const bloques = grupos.map(({ cat, fichas }) => `
    <section><h2>${esc(cat.etiqueta)} <span>${esc(cat.sub)}</span></h2><ol>
    ${fichas.map((F) => `<li><span class="t">${esc(F.titulo)}</span><span class="p">${paginas[F.id]}</span></li>`).join("")}
    </ol></section>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Índice</title>${ESTILO_LIBRO}
  <style>
    h1{font-size:22pt; margin-bottom:5mm; padding-bottom:3mm; border-bottom:3px double #de911d;}
    .cols{columns:2; column-gap:10mm;}
    section{margin-bottom:5mm;}
    h2{font-size:11.5pt; margin-bottom:1.5mm; break-after:avoid;} h2 span{font-family:'Inter',Arial,sans-serif; font-weight:400; font-size:8.5pt; color:#486581;}
    ol{list-style:none; margin:0; padding:0;}
    li{display:flex; align-items:baseline; font-size:9.5pt; line-height:1.55;}
    .t{flex:0 1 auto;} .p{margin-left:auto; padding-left:2mm; font-variant-numeric:tabular-nums;}
    li::after{content:""; order:1; flex:1; border-bottom:1px dotted #9fb3c8; margin:0 1.5mm; transform:translateY(-3px);}
    .p{order:2;}
  </style></head><body><h1>${primera ? "Índice" : "Índice <span style=\"font-size:13pt;color:#486581\">(sigue)</span>"}</h1><div class="cols">${bloques}</div></body></html>`;
}

function htmlPortadilla({ cat, fichas }) {
  const color = COLOR_CAT[cat.id];
  // Hasta unas 44 entran con la letra grande; Conceptos llegó a 52 y se iba a
  // una segunda hoja: con más de 44, la lista va más apretada.
  const apretada = fichas.length > 44;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(cat.etiqueta)}</title>${ESTILO_LIBRO}
  <style>
    body{height:252mm; display:flex; flex-direction:column; justify-content:center; padding:0 12mm;}
    .raya{width:40mm; height:2.5mm; background:${color}; margin-bottom:8mm;}
    h1{font-size:40pt; color:${color};}
    .sub{font-size:13pt; color:#486581; margin:4mm 0 12mm;}
    ol{margin:0; padding-left:1.4em; columns:2; column-gap:10mm; font-size:${apretada ? "9.5pt" : "10.5pt"};} li{margin-bottom:${apretada ? "1.2mm" : "2.5mm"};}
  </style></head><body>
    <div class="raya"></div><h1>${esc(cat.etiqueta)}</h1>
    <p class="sub">${esc(cat.sub)} · ${fichas.length} fichas</p>
    <ol>${fichas.map((F) => `<li>${esc(F.titulo)}</li>`).join("")}</ol>
  </body></html>`;
}

async function libro(browser) {
  const ctx = await contexto(browser);
  const piezas = [];   // { pdf, nombre } en orden

  // La numeración: tapa (sin número), presentación 2, el índice (las
  // páginas que ocupe) y después una portadilla y las fichas de cada categoría.
  const indice = paginasDelIndice();
  const paginas = {};
  let n = 2 + indice.length;
  const portadillas = {};
  for (const grupo of ORDEN) {
    portadillas[grupo.cat.id] = ++n;
    for (const F of grupo.fichas) paginas[F.id] = ++n;
  }

  piezas.push({ nombre: "tapa", pdf: await pdfDeHtml(ctx, htmlTapa(), { pdf: { format: "Letter" } }) });
  piezas.push({ nombre: "presentación", pdf: await pdfDeHtml(ctx, htmlPresentacion(), { pdf: { format: "Letter", displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: PIE(2), margin: MARGEN, preferCSSPageSize: false } }) });
  for (let i = 0; i < indice.length; i++) {
    piezas.push({ nombre: "índice " + (i + 1), pdf: await pdfDeHtml(ctx, htmlIndice(paginas, indice[i], i === 0), { pdf: { format: "Letter", displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: PIE(3 + i), margin: MARGEN, preferCSSPageSize: false } }) });
  }

  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  for (const grupo of ORDEN) {
    piezas.push({ nombre: "portadilla " + grupo.cat.id, pdf: await pdfDeHtml(ctx, htmlPortadilla(grupo), { pdf: { format: "Letter", displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: PIE(portadillas[grupo.cat.id]), margin: MARGEN, preferCSSPageSize: false } }) });
    for (const F of grupo.fichas) {
      await page.goto(BASE + "/entreno/estudio.html?ficha=" + F.id, { waitUntil: "networkidle" });
      await page.waitForSelector("#ficha-vista", { state: "visible", timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      const pdf = await page.pdf({ format: "Letter", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: PIE(paginas[F.id]), margin: MARGEN });
      piezas.push({ nombre: F.id, pdf });
      process.stdout.write(".");
    }
  }
  process.stdout.write("\n");
  await ctx.close();
  if (errores.length) throw new Error("La página de Estudio dio errores:\n" + errores.join("\n"));

  // Cada parte es UNA hoja: si una ficha se pasara a dos, el índice mentiría.
  const largas = piezas.filter((p) => hojas(p.pdf) !== 1).map((p) => `${p.nombre} (${hojas(p.pdf)})`);
  if (largas.length) throw new Error("Estas partes no caben en una hoja: " + largas.join(", "));

  const salida = path.join(DESTINO, "fichas-de-estudio-libro.pdf");
  unir(piezas.map((p) => p.pdf), salida, "Fichas de estudio — libro");
  return { salida, paginas: piezas.length };
}

/* ----------------------------------------------------------------- cartas */
/* 63 × 88 mm, nueve por hoja carta (3 × 3 = 189 × 264 mm), centradas. Las
   cartas van pegadas unas a otras: se corta UNA vez entre dos, por la línea
   gris, y las marcas de corte del margen dicen dónde. Cada carta deja 3 mm de
   aire por dentro: si al cortar o al imprimir a doble cara se corre un poco,
   no se come el texto. */
const CARTA = { ancho: 63, alto: 88 }, COLS = 3, FILAS = 3;
const HOJA = { ancho: 215.9, alto: 279.4 };
const IZQ = (HOJA.ancho - COLS * CARTA.ancho) / 2, ARR = (HOJA.alto - FILAS * CARTA.alto) / 2;

function frente(F) {
  const color = COLOR_CAT[F.categoria];
  const cat = CATEGORIAS.find((c) => c.id === F.categoria);
  const titulos = TITULOS[F.categoria];
  return `<div class="carta frente" style="--c:${color}">
    <div class="banda"><span>${esc(cat.etiqueta)}</span><span>${esc(NIVEL[F.nivel])}</span></div>
    <div class="ajustable">
      <h2>${esc(F.titulo)}</h2>
      <p class="sub">${esc(F.subtitulo)}</p>
      <div class="tablero">${tablero(fenFinal(F), { titulo: F.diagrama, coordenadas: true })}</div>
      <h3 style="--b:${COLOR_BLOQUE[0]}">${esc(titulos[0])}</h3>
      <ul style="--b:${COLOR_BLOQUE[0]}">${F.centro.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </div>
    <div class="firma"><img src="${SELLO}" alt=""><span>Ajedrez Integral</span></div>
  </div>`;
}

function reverso(F) {
  const color = COLOR_CAT[F.categoria];
  const titulos = TITULOS[F.categoria];
  return `<div class="carta reverso" style="--c:${color}">
    <div class="banda"><span>${esc(F.titulo)}</span></div>
    <div class="ajustable">
      ${F.bloques.map((b, i) => `<h3 style="--b:${COLOR_BLOQUE[i + 1]}">${esc(titulos[i + 1])}</h3>
      <ul style="--b:${COLOR_BLOQUE[i + 1]}">${b.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`).join("")}
    </div>
  </div>`;
}

function marcasDeCorte() {
  // Una raya corta en el margen, a la altura de cada línea de corte.
  const m = [];
  for (let c = 0; c <= COLS; c++) {
    const x = IZQ + c * CARTA.ancho;
    m.push(`<i class="mv" style="left:${x}mm; top:${ARR - 6}mm"></i><i class="mv" style="left:${x}mm; top:${ARR + FILAS * CARTA.alto + 1}mm"></i>`);
  }
  for (let f = 0; f <= FILAS; f++) {
    const y = ARR + f * CARTA.alto;
    m.push(`<i class="mh" style="top:${y}mm; left:${IZQ - 6}mm"></i><i class="mh" style="top:${y}mm; left:${IZQ + COLS * CARTA.ancho + 1}mm"></i>`);
  }
  return m.join("");
}

function htmlCartas() {
  const lista = ORDEN.flatMap((g) => g.fichas);
  const porHoja = COLS * FILAS;
  const paginas = [];
  for (let i = 0; i < lista.length; i += porHoja) {
    const tanda = lista.slice(i, i + porHoja);
    const celdas = (fn, espejo) => {
      const out = [];
      for (let f = 0; f < FILAS; f++) for (let c = 0; c < COLS; c++) {
        // En el reverso, la carta de la columna 1 va en la 3: al voltear la
        // hoja por el borde largo, izquierda y derecha se cambian.
        const k = f * COLS + (espejo ? COLS - 1 - c : c);
        out.push(tanda[k] ? fn(tanda[k]) : '<div class="carta vacia"></div>');
      }
      return out.join("");
    };
    const n = i / porHoja + 1;
    paginas.push(`<section class="hoja">${marcasDeCorte()}<div class="rejilla">${celdas(frente, false)}</div><p class="nota">Hoja ${n} · frente</p></section>`);
    paginas.push(`<section class="hoja">${marcasDeCorte()}<div class="rejilla">${celdas(reverso, true)}</div><p class="nota">Hoja ${n} · reverso (voltear por el borde largo)</p></section>`);
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cartas</title>
  <link rel="stylesheet" href="/css/fuentes.css">
  <style>
    @page{size:letter; margin:0;}
    *{box-sizing:border-box; print-color-adjust:exact; -webkit-print-color-adjust:exact;}
    body{margin:0; font-family:'Inter',Arial,sans-serif; color:#102a43;}
    .hoja{position:relative; width:${HOJA.ancho}mm; height:${HOJA.alto}mm; break-after:page; overflow:hidden;}
    .hoja:last-child{break-after:auto;}
    .rejilla{position:absolute; left:${IZQ}mm; top:${ARR}mm; display:grid;
      grid-template-columns:repeat(${COLS}, ${CARTA.ancho}mm); grid-template-rows:repeat(${FILAS}, ${CARTA.alto}mm);}
    .mv, .mh{position:absolute; background:#102a43;}
    .mv{width:0.2mm; height:5mm; margin-left:-0.1mm;}
    .mh{height:0.2mm; width:5mm; margin-top:-0.1mm;}
    .nota{position:absolute; bottom:1.5mm; left:0; right:0; margin:0; text-align:center; font-size:6.5pt; color:#829ab1;}

    .carta{position:relative; width:${CARTA.ancho}mm; height:${CARTA.alto}mm; overflow:hidden;
      outline:0.15mm solid #d9e2ec; outline-offset:-0.075mm; padding:3mm; display:flex; flex-direction:column; background:#fff;}
    .carta::before{content:""; position:absolute; inset:2mm; border:0.5mm solid var(--c); border-radius:2.5mm; pointer-events:none;}
    .vacia::before{display:none;}
    .banda{position:relative; display:flex; justify-content:space-between; align-items:center; gap:2mm;
      background:var(--c); color:#fff; margin:-1mm -1mm 0; padding:1mm 2.2mm; border-radius:1.8mm 1.8mm 0 0;
      font-size:5.6pt; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; flex:none;}
    .reverso .banda{text-transform:none; letter-spacing:0; font-family:'Merriweather',Georgia,serif; font-size:7pt; justify-content:center; text-align:center;}
    .ajustable{flex:1; min-height:0; overflow:hidden; padding:1.6mm 1mm 0; font-size:var(--letra, 6.6pt); line-height:1.28;}
    h2{font-family:'Merriweather',Georgia,serif; font-size:1.55em; line-height:1.15; margin:0; color:#102a43;}
    .sub{margin:0.6mm 0 1.2mm; color:#334e68; font-size:0.92em;}
    .tablero{width:var(--tablero, 41mm); margin:0 auto 1.2mm;}
    .tablero svg{display:block; width:100%; height:auto;}
    h3{margin:1.3mm 0 0.5mm; font-size:0.9em; text-transform:uppercase; letter-spacing:0.05em; color:var(--b);}
    .frente h3{margin-top:0.4mm;}
    ul{margin:0; padding-left:1.05em;} li{margin:0 0 0.45mm;} li::marker{color:var(--b);}
    .firma{position:relative; flex:none; display:flex; align-items:center; justify-content:center; gap:1.2mm; padding-top:0.6mm;
      font-size:5.2pt; color:#486581; letter-spacing:0.05em;}
    .firma img{height:4.2mm; width:auto;}
  </style></head><body>${paginas.join("")}</body></html>`;
}

/* El texto de cada carta se achica de a poco hasta que entra, y en el frente
   también el tablero. Ninguna carta baja de 5,6 pt: si alguna no entrara ni
   así, el generador se detiene en vez de imprimir una carta cortada. */
function ajustarCartas() {
  const problemas = [], letras = [];
  document.querySelectorAll(".carta:not(.vacia)").forEach((carta) => {
    const caja = carta.querySelector(".ajustable");
    const tab = carta.querySelector(".tablero");
    const sobra = () => caja.scrollHeight > caja.clientHeight + 0.5;
    let letra = 6.8, lado = 41;
    caja.style.setProperty("--letra", letra + "pt");
    if (tab) caja.style.setProperty("--tablero", lado + "mm");
    while (sobra() && (letra > 5.6 || (tab && lado > 34))) {
      if (tab && lado > 34 && (letra <= 6.2 || lado > 38)) { lado -= 1; caja.style.setProperty("--tablero", lado + "mm"); }
      else { letra = Math.round((letra - 0.1) * 10) / 10; caja.style.setProperty("--letra", letra + "pt"); }
    }
    if (sobra()) problemas.push(carta.querySelector(".banda").textContent.trim() + " / " + (carta.querySelector("h2") || {}).textContent);
    letras.push(letra);
  });
  return { problemas, letras };
}

async function cartas(browser) {
  const ctx = await contexto(browser);
  const { pdf, antes } = await pdfDeHtml(ctx, htmlCartas(), {
    antes: ajustarCartas,
    pdf: { width: "215.9mm", height: "279.4mm", preferCSSPageSize: true },
  });
  const { problemas, letras } = antes;
  if (problemas.length) throw new Error("Estas cartas no entran ni con la letra más chica: " + problemas.join("; "));
  await ctx.close();
  const salida = path.join(DESTINO, "fichas-de-estudio-cartas.pdf");
  unir([pdf], salida, "Fichas de estudio — cartas para recortar");
  return { salida, paginas: hojas(pdf), letraMinima: Math.min(...letras) };
}

/* ------------------------------------------------------------------ unir */
function unir(partes, destino, titulo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fichas-pdf-"));
  const archivos = partes.map((pdf, i) => {
    const f = path.join(tmp, String(i).padStart(3, "0") + ".pdf");
    fs.writeFileSync(f, pdf);
    return f;
  });
  const guion = `
import sys
from pypdf import PdfWriter
destino, titulo, *partes = sys.argv[1:]
w = PdfWriter()
for p in partes:
    w.append(p)
w.add_metadata({"/Title": titulo, "/Author": "Oscar Angulo Cubero · Ajedrez Integral", "/Subject": "Fichas de estudio de ajedrez"})
w.page_layout = "/SinglePage"
# Cada ficha trae su copia del sello y de las letras: sin esto el libro pesa
# 13 MB, con esto la mitad.
w.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
with open(destino, "wb") as f:
    w.write(f)
`;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try {
    execFileSync("python3", ["-c", guion, destino, titulo, ...archivos], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    console.error(String(e.stderr || e.message));
    console.error("\nNo se pudieron unir las partes. ¿Falta pypdf? pip install pypdf");
    process.exit(1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ===================== La versión accesible =====================
   Un HTML sin una sola imagen, hecho para leerse con lector de pantalla (o con
   la letra agrandada). Es la misma decisión del material de los cursos y del
   libro del diagnóstico: un PDF con diagramas es lo peor que se le puede dar a
   un lector de pantalla.

   Cómo se llega a una ficha sin leer todo:
   - los encabezados van en orden (h1 el documento, h2 cada parte y cada
     categoría, h3 cada ficha, h4 cada bloque), así que con la tecla H del
     lector se salta de ficha en ficha y con 2 o 3, por niveles;
   - hay dos índices con enlaces: por categoría (en el orden del libro) y
     alfabético por la palabra que importa («Horquilla, la»), con las letras
     como atajos;
   - cada ficha lleva su número («Ficha 37»), así que se encuentra buscando
     «Ficha 37» o su nombre, y termina con «Volver al índice».
   No lleva buscador con código: un documento que se baja y se abre suelto,
   hasta sin red, no puede depender de un script. La búsqueda del navegador y
   la lista de enlaces del lector (Insert + F7) hacen ese trabajo. */
const N = require("./lib/notacion.js");
const { describir } = require("./lib/describir-fen.js");

/* La línea de la ficha, numerada y dicha: «1. peón eva 4, peón eva 5, 2. …».
   Sale de chess.js y no del texto, para que la jugada sea la que se jugó. */
function lineaDicha(fenInicio, jugadas) {
  const g = new Chess();
  if (fenInicio) g.load(fenInicio);
  const partes = [];
  let num = fenInicio ? +fenInicio.split(" ")[5] : 1;
  jugadas.forEach((j, i) => {
    const blancas = g.turn() === "w";
    const m = g.move(j, { sloppy: true });
    if (!m) throw new Error(`Jugada ilegal ${j}`);
    const dicha = N.sanHablada(m.san);
    if (blancas) partes.push(`${num}. ${dicha}`);
    else partes.push(i === 0 ? `${num}… ${dicha}` : dicha);
    if (!blancas) num += 1;
  });
  return partes.join(", ");
}

function posicionContada(fen) {
  const d = describir(fen);
  return `${d.turno} Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.`;
}

// Para el índice alfabético: «La horquilla» se busca por «horquilla».
const ARTICULO = /^(el|la|los|las)\s+/i;
const sinTilde = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
function claveAlfabetica(titulo) {
  const m = titulo.match(ARTICULO);
  const resto = titulo.replace(ARTICULO, "");
  const nombre = resto.charAt(0).toUpperCase() + resto.slice(1) + (m ? ", " + m[1].toLowerCase() : "");
  return { nombre, orden: sinTilde(resto).toLowerCase(), letra: sinTilde(resto).charAt(0).toUpperCase() };
}

function htmlAccesible() {
  const todas = ORDEN.flatMap((g) => g.fichas);
  const numero = new Map(todas.map((F, i) => [F.id, i + 1]));
  const NIVEL_MIN = { 1: "principiante", 2: "intermedio", 3: "avanzado" };

  const indiceCategorias = ORDEN.map(({ cat, fichas }) => `
    <h3 id="indice-${cat.id}">${esc(cat.etiqueta)}: ${esc(cat.sub)}, ${fichas.length} fichas</h3>
    <ol>${fichas.map((F) => `<li value="${numero.get(F.id)}"><a href="#ficha-${F.id}">${esc(F.titulo)}</a>, nivel ${NIVEL_MIN[F.nivel]}</li>`).join("")}</ol>
    <p><a href="#cat-${cat.id}">Ir a las fichas de ${esc(cat.etiqueta)}</a></p>`).join("");

  const alfa = todas.map((F) => ({ F, ...claveAlfabetica(F.titulo) })).sort((a, b) => a.orden.localeCompare(b.orden, "es"));
  const letras = [...new Set(alfa.map((x) => x.letra))];
  const indiceAlfabetico = `
    <p>Saltar a una letra: ${letras.map((l) => `<a href="#letra-${l}">${l}</a>`).join(" · ")}.</p>
    ${letras.map((l) => `<h3 id="letra-${l}">Letra ${l}</h3><ul>${alfa.filter((x) => x.letra === l)
      .map((x) => `<li><a href="#ficha-${x.F.id}">${esc(x.nombre)}</a>, ficha ${numero.get(x.F.id)}, ${esc(etiquetaCat(x.F.categoria))}</li>`).join("")}</ul>`).join("")}`;

  const fichas = ORDEN.map(({ cat, fichas }) => `
  <section aria-labelledby="cat-${cat.id}">
    <h2 id="cat-${cat.id}">${esc(cat.etiqueta)}: ${esc(cat.sub)}</h2>
    <p>${fichas.length} fichas. <a href="#indice-${cat.id}">Ver la lista de ${esc(cat.etiqueta)} en el índice</a>.</p>
    ${fichas.map((F) => fichaAccesible(F, cat, numero.get(F.id), todas.length)).join("")}
  </section>`).join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fichas de estudio — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 44rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.2rem; line-height: 1.8; }
  h1 { font-size: 2rem; line-height: 1.25; }
  h2 { font-size: 1.55rem; margin-top: 3rem; border-bottom: 3px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.3rem; margin-top: 2.4rem; }
  h4 { font-size: 1.05rem; margin: 1.4rem 0 .3rem; font-family: system-ui, sans-serif; letter-spacing: .02em; }
  section.ficha { border-top: 2px solid #c9d4de; margin-top: 2rem; }
  .posicion { background: #f1f5f8; padding: .7rem .9rem; }
  .fen { display: block; font-family: ui-monospace, monospace; font-size: .85em; word-break: break-all; }
  a { color: #0b4f8a; text-underline-offset: .2em; }
  a:focus-visible { outline: 3px solid #b35c00; outline-offset: 3px; }
  ul, ol { padding-left: 1.6rem; } li { margin-bottom: .35rem; }
  .volver { font-family: system-ui, sans-serif; font-size: 1rem; }
  footer { margin-top: 3rem; border-top: 1px solid #c9d4de; padding-top: 1rem; font-size: 1rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #10202e; color: #eef3f7; }
    h2 { border-color: #eef3f7; }
    .posicion { background: #1b3145; }
    a { color: #9fd0ff; }
    a:focus-visible { outline-color: #ffc46b; }
    section.ficha, footer { border-color: #3b5165; }
  }
</style>
</head><body>
<nav aria-label="Volver a Estudio"><p><a href="../../entreno/estudio.html">Volver a Estudio, en Entrenamiento</a></p></nav>
<main>
<h1>Fichas de estudio de Ajedrez Integral</h1>
<p>Las ${todas.length} fichas de Estudio, escritas para leerse con lector de pantalla o con la letra agrandada.
Es el mismo contenido del libro en papel, sin una sola imagen: cada posición va contada pieza por pieza
y cada jugada va dicha en palabras.</p>

<h2 id="como-usar">Cómo moverse por este documento</h2>
<ul>
  <li>Cada ficha es un encabezado de nivel 3, y cada categoría, uno de nivel 2. Con el lector de pantalla,
  la tecla H salta de encabezado en encabezado; la tecla 2 salta de categoría en categoría y la tecla 3,
  de ficha en ficha.</li>
  <li>Hay dos índices con enlaces que llevan directo a cada ficha: uno por categoría, en el orden del libro,
  y otro alfabético. La lista de enlaces del lector (Insert más F7 en NVDA y JAWS, o el rotor en VoiceOver)
  también sirve para buscar una ficha por su nombre.</li>
  <li>Cada ficha tiene su número, del 1 al ${todas.length}. Para llegar a una, se puede buscar «Ficha 37»
  o su nombre con la búsqueda del navegador (Control más F, o Comando más F en Mac).</li>
  <li>Al final de cada ficha hay un enlace para volver al índice.</li>
  <li>Cada ficha trae: de qué trata, su nivel, la idea principal, cuatro bloques, la posición contada
  pieza por pieza, las jugadas dichas y lo que muestra la posición. Al final va la FEN, por si se quiere
  cargar la posición en un programa de ajedrez.</li>
</ul>

<nav aria-labelledby="indice">
<h2 id="indice">Índice por categoría</h2>
<p>Seis categorías: ${ORDEN.map(({ cat, fichas }) => `<a href="#indice-${cat.id}">${esc(cat.etiqueta)}</a> (${fichas.length})`).join(", ")}.
También hay un <a href="#indice-alfabetico">índice alfabético</a>.</p>
${indiceCategorias}
</nav>

<nav aria-labelledby="indice-alfabetico">
<h2 id="indice-alfabetico">Índice alfabético</h2>
<p>Las fichas ordenadas por la palabra que importa: «La horquilla» está en la H, como «Horquilla, la».</p>
${indiceAlfabetico}
<p><a href="#indice">Volver al índice por categoría</a></p>
</nav>

${fichas}
</main>
<footer>
  <p>Ajedrez Integral · Oscar Angulo Cubero. Las posiciones están comprobadas con chess.js, y las que
  prometen un resultado (mate, gana o tablas), con el motor Stockfish.</p>
  <p><a href="#indice">Volver al índice</a> · <a href="../../entreno/estudio.html">Volver a Estudio, en Entrenamiento</a></p>
</footer>
</body></html>
`;
}

const etiquetaCat = (id) => (CATEGORIAS.find((c) => c.id === id) || {}).etiqueta || id;

function fichaAccesible(F, cat, n, total) {
  // La ficha que enseña a anotar deja sus jugadas escritas: ahí «Cf3» es lo que
  // se aprende. Lo respeta verificar-notacion-espanola.js.
  const escrita = F.id === "notacion-algebraica";
  const decir = (t) => esc(escrita ? t : N.textoHablado(t, "espanol"));
  const titulos = TITULOS[F.categoria];
  const NIVEL_MIN = { 1: "principiante", 2: "intermedio", 3: "avanzado" };
  const jugadas = jugadasDe(F);
  let posicion;
  if (F.fen) {
    posicion = `<p class="posicion"><strong>La posición de partida.</strong> ${posicionContada(F.fen)}</p>` +
      (jugadas.length ? `<p><strong>Las jugadas.</strong> ${esc(lineaDicha(F.fen, jugadas))}.</p>
        <p class="posicion"><strong>Cómo queda al final.</strong> ${posicionContada(fenFinal(F))}</p>` : "");
  } else {
    posicion = `<p><strong>Las jugadas, desde el principio.</strong> ${esc(lineaDicha(null, jugadas))}.</p>
      <p class="posicion"><strong>La posición al final de la línea.</strong> ${posicionContada(fenFinal(F))}</p>`;
  }
  return `
    <section class="ficha" id="ficha-${F.id}" aria-labelledby="titulo-${F.id}"${escrita ? ' data-notacion="escrita"' : ""}>
      <h3 id="titulo-${F.id}">Ficha ${n}. ${esc(F.titulo)}</h3>
      <p>${esc(cat.etiqueta)}, nivel ${NIVEL_MIN[F.nivel]}. ${decir(F.subtitulo)}.</p>
      <p>${decir(F.resumen)}</p>
      <h4>${esc(titulos[0])}</h4>
      <ul>${F.centro.map((r) => `<li>${decir(r)}</li>`).join("")}</ul>
      ${F.bloques.map((b, i) => `<h4>${esc(titulos[i + 1])}</h4><ul>${b.map((r) => `<li>${decir(r)}</li>`).join("")}</ul>`).join("")}
      <h4>La posición</h4>
      ${posicion}
      <p><strong>Qué muestra.</strong> ${decir(F.diagrama)}</p>
      <p class="fen">FEN de la posición final, para cargarla en un programa: ${esc(fenFinal(F))}</p>
      <p class="volver"><a href="#indice">Volver al índice</a> · <a href="#indice-${cat.id}">Volver a la lista de ${esc(cat.etiqueta)}</a> · ficha ${n} de ${total}</p>
    </section>`;
}

const DESTINO_ACCESIBLE = path.join(DESTINO, "fichas-de-estudio-accesible.html");
function escribirAccesible() {
  fs.mkdirSync(DESTINO, { recursive: true });
  fs.writeFileSync(DESTINO_ACCESIBLE, htmlAccesible());
  return DESTINO_ACCESIBLE;
}

module.exports = { htmlAccesible, DESTINO_ACCESIBLE };

if (require.main === module) {
  if (solo === "" || solo === "accesible") console.log(`✓ ${path.relative(RAIZ, escribirAccesible())}`);
  if (solo !== "accesible") generarPapel();
}

function generarPapel() {
(async () => {
  try {
    await fetch(BASE + "/entreno/estudio.html").then((r) => { if (!r.ok) throw new Error(r.status); });
  } catch (e) {
    console.error(`No se pudo abrir ${BASE}. Levanta el sitio antes: python3 -m http.server 8777`);
    process.exit(1);
  }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    if (solo !== "cartas") {
      const r = await libro(browser);
      console.log(`✓ ${path.relative(RAIZ, r.salida)}: ${r.paginas} páginas`);
    }
    if (solo !== "libro") {
      const r = await cartas(browser);
      console.log(`✓ ${path.relative(RAIZ, r.salida)}: ${r.paginas} páginas (la letra más chica, ${r.letraMinima} pt)`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error("✗ " + e.message); process.exit(1); });
}
