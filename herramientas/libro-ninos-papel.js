/* El papel de un personaje del audiolibro, en PDF, para quien lo va a grabar.
 *
 * Del guion (herramientas/libro-ninos/guion/<slug>.json, que escribe
 * libro-ninos-pdf.js) saca solo las líneas de ese personaje, numeradas para
 * grabarlas una por una, y a cada una le pone:
 *   - lo que se dice justo antes (el pie, para entrar a tiempo);
 *   - cómo se dice, que es lo que cuenta el narrador al lado («preguntó,
 *     frotándose los ojos», «susurró»): para una niña es la mejor indicación
 *     de actuación, y ya está escrita en el cuento.
 * Al principio, la ficha del personaje (de voces.js) y consejos para grabar.
 *
 *   node herramientas/libro-ninos-papel.js peonita Peonita salida.pdf
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const D = require("./libro-ninos/dibujos.js");
const LIBROS = require("./libro-ninos/libros.js");
const VOCES = require("./libro-ninos/voces.js");

const [slug, quien, salida] = process.argv.slice(2);
if (!slug || !quien || !salida) { console.error("Uso: node herramientas/libro-ninos-papel.js <slug> <personaje> <salida.pdf>"); process.exit(1); }
const L = LIBROS.find((l) => l.SLUG === slug);
const g = JSON.parse(fs.readFileSync(path.join(__dirname, "libro-ninos", "guion", slug + ".json"), "utf8"));
const ficha = VOCES.PERSONAJES[quien];
if (!L || !ficha) { console.error("No hay libro «" + slug + "» o personaje «" + quien + "» en voces.js."); process.exit(1); }

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nombreVoz = (v) => (v === "narrador" ? "la narración" : v);
// Un trozo que va pegado al anterior en el mismo párrafo (pausa corta): el
// inciso del narrador que dice cómo se habla.
const pegado = (s) => s && s.pausa < 0.5;

/* Las líneas, por pista: { pista, lineas: [{ n, trozos, pie, como }] }.
   Si el narrador interrumpe al personaje en medio de una frase («Cada bando
   tiene dieciséis piezas —contó Peonita con los dedos—: un rey…»), es UNA
   línea con sus trozos: quien graba la dice seguida, y el inciso va como
   nota entre los trozos (lo lee la narración, no ella). */
let n = 0;
const partes = g.pistas.map((p) => {
  const lineas = [];
  const S = p.segmentos;
  for (let i = 0; i < S.length; i++) {
    if (S[i].voz !== quien) continue;
    const ant = S[i - 1];
    // El pie: lo último que se oye antes (si es otro personaje o la narración).
    const pie = ant && ant.voz !== quien ? { voz: ant.voz, texto: ant.texto.length > 140 ? "…" + ant.texto.slice(-140) : ant.texto } : null;
    // Lo que se dice antes, tras dos puntos («Peonita levantó la mano:»), dice cómo.
    let como = ant && ant.voz === "narrador" && pegado(ant) && /:$/.test(ant.texto) ? ant.texto.replace(/:$/, "") : null;
    const trozos = [{ texto: S[i].texto }];
    let j = i;
    while (pegado(S[j]) && S[j + 1] && S[j + 1].voz === "narrador") {
      const inciso = S[j + 1];
      if (!como && inciso.texto.length < 120) como = inciso.texto;
      if (pegado(inciso) && S[j + 2] && S[j + 2].voz === quien) {
        trozos.push({ inciso: inciso.texto }, { texto: S[j + 2].texto });
        j += 2;
      } else break;
    }
    i = j;
    // Si el cómo ya está como nota entre los trozos, no se repite abajo.
    if (trozos.some((t) => t.inciso === como)) como = null;
    lineas.push({ n: ++n, trozos, pie, como });
  }
  return { pista: p, lineas };
}).filter((x) => x.lineas.length);

const total = n;
const portada = L.PRESENTACION.escena;
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(quien)}: tu papel</title><style>
  @font-face { font-family: "Atkinson"; font-weight: 400; src: url("data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, "..", "fonts", "atkinson-hyperlegible-400-latin.woff2")).toString("base64")}") format("woff2"); }
  @font-face { font-family: "Atkinson"; font-weight: 700; src: url("data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, "..", "fonts", "atkinson-hyperlegible-700-latin.woff2")).toString("base64")}") format("woff2"); }
  @font-face { font-family: "Quicksand"; font-weight: 700; src: url("data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, "..", "fonts", "quicksand-700-latin.woff2")).toString("base64")}") format("woff2"); }
  @page { size: A4; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Atkinson", Verdana, sans-serif; color: #1d1530; font-size: 15pt; line-height: 1.45; }
  h1, h2, h3, .num { font-family: "Quicksand", sans-serif; font-weight: 700; }
  h1 { font-size: 30pt; color: #a61e4d; margin: 0 0 2mm; line-height: 1.1; }
  h2 { font-size: 19pt; color: #1864ab; margin: 8mm 0 3mm; break-after: avoid; }
  .sub { font-size: 14pt; color: #5c4b6e; margin: 0 0 5mm; }
  .portada svg { width: 95mm; height: auto; display: block; border-radius: 4mm; margin: 0 auto 3mm; }
  .ficha, .consejos { font-size: 13pt; }
  .ficha { background: #fff0f6; border: 2px solid #f783ac; border-radius: 5mm; padding: 4mm 6mm; margin-bottom: 5mm; }
  .ficha p { margin: 0 0 2mm; }
  .consejos { background: #edf2ff; border: 2px solid #748ffc; border-radius: 5mm; padding: 3mm 6mm; }
  .consejos li { margin-bottom: 1.5mm; }
  .salto { break-before: page; }
  .linea { display: flex; gap: 4mm; margin: 0 0 5mm; break-inside: avoid; }
  .num { flex: none; width: 13mm; height: 13mm; border-radius: 50%; background: #f783ac; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14pt; }
  .cuerpo { flex: 1; }
  .pie { font-size: 11.5pt; color: #6b6280; margin: 0 0 1mm; }
  .pie b { color: #4a4060; }
  .dice { font-size: 19pt; font-weight: 700; margin: 0; }
  .como { font-size: 12.5pt; color: #a61e4d; font-style: italic; margin: 1mm 0 0; }
  .corte { font-size: 11.5pt; color: #6b6280; font-style: italic; margin: 1mm 0; }
  .lista { color: #6b6280; font-size: 11pt; }
</style></head><body>
<section class="portada">
  <div>${D.escena(portada)}</div>
  <h1>Tu papel: ${esc(quien)}</h1>
  <p class="sub">${esc(L.TITULO)} · audiolibro · ${total} líneas para grabar</p>
  <div class="ficha">
    ${ficha.es ? `<p><b>¿Quién es ${esc(quien)}?</b> ${esc(ficha.es)}</p>` : ""}
    <p><b>¿Cómo suena?</b> ${esc(ficha.como.charAt(0).toUpperCase() + ficha.como.slice(1))}. Habla con su voz de siempre, sin imitar a nadie.</p>
  </div>
  <div class="consejos"><b>Para grabar</b><ul>
    <li>Cada línea tiene su número: di el número antes de leerla («línea cinco…») y después, la línea. Así se encuentra fácil al editar.</li>
    <li>En gris está lo que dice otro personaje justo antes: es tu pie para entrar.</li>
    <li>En rosado está <i>cómo</i> lo dice ${esc(quien)}: susurrando, preguntando, contenta… Hazle caso, como en una obra de teatro.</li>
    <li>A veces la narración habla en medio de tu frase: la nota te avisa. Tú la dices seguida, como si nadie te interrumpiera.</li>
    <li>Si te equivocas, no pasa nada: espera un ratito y vuelve a leer la línea entera desde el principio.</li>
    <li>Habla despacio y sonriendo: ¡la sonrisa se oye!</li>
  </ul></div>
</section>
${partes.map((x, i) => `<section${i === 0 ? ' class="salto"' : ""}>
  <h2>${esc(x.pista.titulo)}</h2>
  ${x.lineas.map((l) => `<div class="linea"><div class="num">${l.n}</div><div class="cuerpo">
    ${l.pie ? `<p class="pie"><b>${esc(nombreVoz(l.pie.voz).replace(/^la n/, "La n"))}:</b> ${esc(l.pie.texto)}</p>` : ""}
    ${l.trozos.map((t) => t.inciso ? `<p class="corte">↳ aquí la narración dice «${esc(t.inciso)}», y tú sigues:</p>` : `<p class="dice">${esc(t.texto)}</p>`).join("")}
    ${l.como ? `<p class="como">Cómo: ${esc(l.como)}</p>` : ""}
  </div></div>`).join("")}
</section>`).join("")}
</body></html>`;

(async () => {
  const { chromium } = require("playwright");
  const nav = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const pag = await nav.newPage();
  await pag.setContent(html, { waitUntil: "load" });
  await pag.evaluate(() => document.fonts.ready);
  await pag.pdf({
    path: salida, format: "A4", printBackground: true, tagged: true,
    margin: { top: "14mm", bottom: "16mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true, headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;font-size:9pt;color:#6b6280;font-family:Arial,sans-serif;padding:0 16mm;display:flex;justify-content:space-between;"><span>${esc(quien)} · ${esc(L.TITULO)}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
  });
  await nav.close();
  console.log(`${quien}: ${total} líneas en ${partes.length} pistas → ${salida}`);
})();
