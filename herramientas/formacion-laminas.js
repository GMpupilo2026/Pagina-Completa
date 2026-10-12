#!/usr/bin/env node
/* Dibuja las láminas de una presentación de Formación Ajedrez.
 *
 *   node herramientas/formacion-laminas.js clase-01          las escribe
 *   node herramientas/formacion-laminas.js clase-01 --a DIR  las deja en DIR
 *
 * Lee lo que se ve en cada lámina de herramientas/datos/formacion-laminas-<clase>.js
 * y el título y las posiciones del diapositivas.json de esa clase, arma cada
 * una en HTML (1600 × 900) y la saca en WebP con Chromium. Así una lámina se
 * cambia en un solo lugar y nunca más hay que rehacer una imagen a mano.
 *
 * Los tableros los dibuja lib/tablero-svg.js con las posiciones del JSON: la
 * lámina no tiene una copia propia que se pueda separar de la que se manda al
 * tablero de la clase. La letra es la del sitio (fonts/), y los íconos, Noto
 * Color Emoji, que viene en Ubuntu.
 *
 * Ver «Las láminas dicen poco» en docs/decisiones/clase-en-vivo.md.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { tablero } = require("./lib/tablero-svg");
const { huella, archivo } = require("./lib/formacion-huella");

const RAIZ = path.join(__dirname, "..");
const clase = process.argv[2];
if (!clase) { console.error("Uso: node herramientas/formacion-laminas.js clase-01 [--a carpeta]"); process.exit(1); }
const iA = process.argv.indexOf("--a");
const CARPETA = path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez", "presentaciones", clase);
const DESTINO = iA > 0 ? path.resolve(process.argv[iA + 1]) : CARPETA;
const DATOS = require(path.join(__dirname, "datos", "formacion-laminas-" + clase + ".js"));
const JSON_CLASE = JSON.parse(fs.readFileSync(path.join(CARPETA, "diapositivas.json"), "utf8"));
const DIAPOS = JSON_CLASE.diapositivas;
if (DATOS.length !== DIAPOS.length) {
  console.error("Hay " + DATOS.length + " láminas en los datos y " + DIAPOS.length + " en diapositivas.json");
  process.exit(1);
}

// Las piezas, del mismo archivo que usan los tableros del sitio.
const PIEZAS = JSON.parse(fs.readFileSync(path.join(RAIZ, "js", "chess-piece-svg.js"), "utf8")
  .match(/const PIECE_DEFS = ("(?:[^"\\]|\\.)*");/)[1]);

const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fuente = (archivo) => "url(file://" + path.join(RAIZ, "fonts", archivo) + ")";

// Colores medidos contra su fondo real (WCAG AA): el texto oscuro de cada tono
// sobre su fondo claro pasa de 7:1, y el blanco del encabezado sobre #1d5c99,
// de 6,5:1. El tono nunca va solo: cada marca lleva su palabra.
const CSS = `
@font-face{font-family:A;src:${fuente("atkinson-hyperlegible-400-latin.woff2")};font-weight:400}
@font-face{font-family:A;src:${fuente("atkinson-hyperlegible-400-latin-ext.woff2")};font-weight:400;unicode-range:U+0100-024F}
@font-face{font-family:A;src:${fuente("atkinson-hyperlegible-700-latin.woff2")};font-weight:700}
@font-face{font-family:A;src:${fuente("atkinson-hyperlegible-700-latin-ext.woff2")};font-weight:700;unicode-range:U+0100-024F}
:root{--azul:#1d5c99;--tinta:#14233a;--gris:#3b4a5e;--fondo:#f4f7fb}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1600px;height:900px;overflow:hidden;font-family:A,"Noto Color Emoji",sans-serif;background:var(--fondo);color:var(--tinta);display:flex;flex-direction:column}
header{background:var(--azul);color:#fff;padding:30px 70px 26px;flex:none}
header small{display:block;font-size:30px;letter-spacing:.3px;opacity:.95}
header h1{font-size:64px;line-height:1.08}
header h1.largo{font-size:54px}header h1.muy-largo{font-size:44px}
main{flex:1;min-height:0;padding:42px 70px 40px;display:flex;flex-direction:column;gap:30px}
.ic{font-family:"Noto Color Emoji";line-height:1;display:inline-flex;align-items:center;justify-content:center}
.ic svg{width:1.2em;height:1.2em}
.art{display:inline-block;font-size:26px;color:var(--gris);background:#e9eef5;border-radius:8px;padding:2px 12px;font-weight:400;white-space:nowrap}
.caja{background:#fff;border-radius:22px;box-shadow:0 3px 14px #1d3a5a24}
.clave{flex:none;background:#e3edf8;border-left:12px solid var(--azul);border-radius:12px;padding:20px 30px;font-size:38px;font-weight:700}
.si{--tf:#e6f4ea;--tt:#14532d;--tb:#2f8a4a}.no{--tf:#fdecea;--tt:#7f1d1d;--tb:#c0392b}
.ojo{--tf:#fff3d1;--tt:#6b4200;--tb:#d49b00}.info{--tf:#e3edf8;--tt:#163f6b;--tb:#1d5c99}
.marca{display:inline-block;background:var(--tf);color:var(--tt);border:3px solid var(--tb);border-radius:999px;padding:4px 20px;font-weight:700;font-size:32px}
/* tarjetas */
.grid{flex:1;min-height:0;display:grid;gap:30px}
.tarj{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:18px;padding:26px 28px;position:relative}
.tarj .ic{font-size:96px}
.tarj b{font-size:44px;line-height:1.12}
.tarj span.s{font-size:31px;color:var(--gris);line-height:1.25}
.tarj.tono{background:var(--tf);outline:4px solid var(--tb);outline-offset:-4px}
.tarj.tono b{color:var(--tt)}
.compacto .tarj{gap:10px;padding:18px 22px}.compacto .tarj .ic{font-size:72px}.compacto .tarj b{font-size:38px}.compacto .tarj span.s{font-size:28px}
.num{position:absolute;top:16px;left:20px;width:52px;height:52px;border-radius:50%;background:var(--azul);color:#fff;font-size:30px;font-weight:700;display:flex;align-items:center;justify-content:center}
/* filas */
.filas{flex:1;min-height:0;display:grid;gap:22px;align-content:center}
.fila{display:flex;align-items:center;gap:30px;padding:16px 32px;min-height:0}
.fila .ic{font-size:64px;flex:none;width:80px}
.fila .num{position:static;flex:none}
.fila b{font-size:40px;line-height:1.15;display:block}
.fila span.s{font-size:30px;color:var(--gris);display:block;margin-top:2px}
.fila .art{margin-left:auto;flex:none}
.fila.tono{background:var(--tf);outline:4px solid var(--tb);outline-offset:-4px}
.dos-col .fila b{font-size:35px}.dos-col .fila .ic{font-size:54px;width:66px}.dos-col .fila span.s{font-size:27px}
/* dos columnas */
.dos{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:34px}
.col{display:flex;flex-direction:column;overflow:hidden}
.col h2{font-size:44px;padding:18px 30px;background:#e3edf8;color:#163f6b}
.col.si h2,.col.no h2{background:var(--tf);color:var(--tt);border-bottom:4px solid var(--tb)}
.col ul{list-style:none;flex:1;display:flex;flex-direction:column;justify-content:space-evenly;padding:10px 30px}
.col li{font-size:35px;font-weight:700;line-height:1.2;display:flex;gap:16px;align-items:baseline}
.col li .art{margin-left:auto}
.col li.tono{background:var(--tf);color:var(--tt);border-left:10px solid var(--tb);border-radius:10px;padding:8px 14px;margin:0 -14px}
.punto{flex:none;font-family:"Noto Color Emoji";font-size:30px}
/* tableros */
.tabs{flex:1;min-height:0;display:flex;gap:36px;justify-content:center;align-items:stretch}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 18px 20px;max-width:620px;min-width:0}
.tab svg.tablero{flex:1 1 0;min-height:0;width:100%;height:100%}
.tab b{font-size:36px}.tab span.s{font-size:28px;color:var(--gris);text-align:center;line-height:1.2}
.tab .cab{display:flex;gap:16px;align-items:center;white-space:nowrap}
.tabs.cuatro{gap:22px}.cuatro .tab{padding:14px 10px}.cuatro .tab{justify-content:center}.cuatro .tab svg.tablero{flex:none;height:auto}.cuatro .tab b{font-size:34px}
.lado{flex:1;min-height:0;display:flex;gap:44px;align-items:stretch}
.lado .tabcaja{flex:none;padding:18px;display:flex}
.lado svg.tablero{height:100%;width:auto}
.lado .filas{flex:1}
/* tabla */
table{width:100%;border-collapse:separate;border-spacing:0 8px;font-size:32px}
th{text-align:left;font-size:28px;color:var(--gris);font-weight:700;padding:0 22px}
td{background:#fff;padding:11px 22px}
td:first-child{border-radius:12px 0 0 12px;font-weight:700}td:last-child{border-radius:0 12px 12px 0;color:var(--gris)}
td .art{margin-left:10px;font-size:22px}
td .marca{font-size:28px;padding:2px 16px;border-width:2px}
/* frase: una sola idea grande (un caso, una decisión) */
.frase{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:26px;padding:40px 90px}
.frase .ic{font-size:120px}.frase p{font-size:52px;font-weight:700;line-height:1.2;max-width:1200px}
.frase span.s{font-size:36px;color:var(--gris);max-width:1150px;line-height:1.25}
.frase.tono{background:var(--tf);outline:4px solid var(--tb);outline-offset:-4px}.frase.tono p{color:var(--tt)}
/* chips */
.chips{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:20px;align-content:center}
.chip{display:flex;align-items:center;gap:18px;padding:18px 22px;font-size:32px;font-weight:700;line-height:1.15}
.chip .ic{font-size:50px;flex:none}
/* cronograma */
.crono{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-auto-flow:column;gap:16px 40px}
.hito{display:flex;align-items:center;gap:26px;padding:0 28px;font-size:36px;font-weight:700}
.hito time{font-size:34px;color:var(--azul);width:100px;flex:none;font-variant-numeric:tabular-nums}
.hito.receso{background:#fff3d1;outline:3px solid #d49b00;outline-offset:-3px;color:#6b4200}
.hito.receso time{color:#6b4200}
/* cita, portada, receso */
.cita{flex:1;display:flex;flex-direction:column;justify-content:center;gap:40px}
.cita blockquote{font-size:66px;font-weight:700;line-height:1.15;border-left:16px solid var(--azul);padding-left:40px}
.cita p{font-size:40px;color:var(--gris);padding-left:56px}
.cita .fila3{display:flex;gap:30px;padding-left:56px}
.cita .chip{font-size:38px}
.portada{background:var(--azul);color:#fff;justify-content:center;padding:0 110px;gap:26px}
.portada small{font-size:34px;opacity:.95}
.portada h1{font-size:150px;line-height:1}
.portada p{font-size:64px;font-weight:700;line-height:1.15;max-width:1000px}
.portada .deco{position:absolute;right:-80px;top:120px;width:640px;height:auto;opacity:.16;transform:rotate(-12deg)}
.recesob{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;text-align:center}
.recesob .ic{font-size:200px}.recesob b{font-size:110px}.recesob p{font-size:44px;color:var(--gris)}
/* notación y planilla */
.nota3{display:grid;grid-template-columns:repeat(3,1fr);gap:30px}
.nota3 .tarj{padding:24px}
.ej{font-size:76px;font-weight:700;color:var(--azul);font-variant-numeric:tabular-nums;letter-spacing:1px}
.signos{display:grid;grid-template-columns:repeat(4,auto);justify-content:space-between;gap:14px 26px;flex:1;align-content:center}
.signo{display:flex;align-items:center;gap:18px;font-size:31px;color:var(--gris)}
.signo code{font-family:A;font-weight:700;font-size:40px;color:var(--tinta);background:#fff;border-radius:12px;padding:4px 16px;min-width:120px;text-align:center;white-space:nowrap;box-shadow:0 2px 8px #1d3a5a1f}
.planilla{display:flex;gap:44px;flex:1;min-height:0}
.hoja{flex:none;width:560px;padding:20px 30px;display:flex;flex-direction:column}
.hoja table{border-spacing:0;font-size:40px}
.hoja th{font-size:28px;padding:8px 18px;border-bottom:3px solid var(--azul)}
.hoja td{padding:10px 18px;border-bottom:2px solid #e3e9f1;background:none;border-radius:0!important;color:var(--tinta)!important;font-weight:400}
.hoja td:first-child{color:var(--gris)!important;width:70px}
.hoja p{margin-top:auto;font-size:28px;color:var(--gris)}
.planilla .grid{grid-template-rows:1fr 1fr}
.planilla .tarj{flex-direction:row;justify-content:flex-start;text-align:left;gap:26px;padding:20px 34px}
.planilla .tarj .ic{font-size:70px}
.planilla .tarj div{display:flex;flex-direction:column;gap:6px}
.planilla .ej{font-size:46px}
/* ciclo */
.ciclo{display:flex;align-items:center;gap:12px;flex:none}
.paso{flex:1;padding:26px 14px;text-align:center;font-size:34px;font-weight:700;line-height:1.15}
.paso.final{background:var(--azul);color:#fff}
.flecha{font-size:44px;color:var(--azul);font-weight:700}
`;

function icono(ic, usadas) {
  if (!ic) return "";
  const m = /^pieza:([wb][KQRBNP])$/.exec(ic);
  if (m) { usadas.add(m[1]); return '<span class="ic" aria-hidden="true"><svg viewBox="0 0 45 45"><use href="#' + m[1] + '"/></svg></span>'; }
  return '<span class="ic" aria-hidden="true">' + ic + "</span>";
}
const art = (a) => (a ? '<span class="art">' + esc(a) + "</span>" : "");
const tono = (t) => (t ? " tono " + t : "");
const MARCA = { si: "✓", no: "✗", ojo: "=", info: "→" };

function tableroDe(diapo, i, opciones) {
  const p = (diapo.posiciones || [])[i];
  if (!p) throw new Error("La lámina «" + diapo.titulo + "» pide la posición " + i + " y no la tiene");
  return tablero(p.fen, Object.assign({ coordenadas: true, titulo: p.nombre }, opciones || {}))
    .replace("<svg ", '<svg class="tablero" ');
}

function cuerpo(d, diapo, usadas) {
  const ic = (x) => icono(x, usadas);
  switch (d.tipo) {
    case "tarjetas": {
      const n = d.items.length, cols = d.cols || n;
      const filas = Math.ceil(n / cols);
      return '<div class="grid' + (d.compacto ? " compacto" : "") + '" style="grid-template-columns:repeat(' + cols + ",1fr);grid-template-rows:repeat(" + filas + ',1fr)">' +
        d.items.map((x, k) => '<div class="caja tarj' + tono(x.tono) + '">' + (d.numerar ? '<span class="num">' + (k + 1) + "</span>" : "") +
          ic(x.ic) + "<b>" + esc(x.t) + "</b>" + (x.s ? '<span class="s">' + esc(x.s) + "</span>" : "") + art(x.a) + "</div>").join("") +
        "</div>" + (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "");
    }
    case "filas": {
      const cols = d.cols || 1;
      return '<div class="filas' + (cols > 1 ? " dos-col" : "") + '" style="grid-template-columns:repeat(' + cols + ',1fr)">' +
        d.items.map((x, k) => '<div class="caja fila' + tono(x.tono) + '"' + (d.escalera ? ' style="margin-left:' + k * 60 + 'px"' : "") + ">" +
          (d.numerar ? '<span class="num">' + (k + 1) + "</span>" : "") + ic(x.ic) +
          "<div><b>" + esc(x.t) + "</b>" + (x.s ? '<span class="s">' + esc(x.s) + "</span>" : "") + "</div>" + art(x.a) + "</div>").join("") +
        "</div>" + (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "");
    }
    case "dos": {
      const col = (c, defecto) => '<div class="caja col ' + (c.tono || "") + '"><h2>' +
        (c.tono ? MARCA[c.tono] + " " : "") + esc(c.t) + "</h2><ul>" +
        c.items.map(([t, a, tn]) => '<li class="' + (tn ? "tono " + tn : "") + '"><span class="punto" aria-hidden="true">' + (tn === "no" ? "🟥" : tn === "ojo" ? "🟨" : defecto) + "</span><span>" + esc(t) + "</span>" + art(a) + "</li>").join("") +
        "</ul></div>";
      return '<div class="dos">' + col(d.izq, d.izq.tono === "si" ? "✅" : "▪️") + col(d.der, d.der.tono === "no" ? "⛔" : "▪️") + "</div>" +
        (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "");
    }
    case "tableros":
      return '<div class="tabs' + (d.items.length > 3 ? " cuatro" : "") + '">' + d.items.map((x) =>
        '<div class="caja tab">' + tableroDe(diapo, x.pos, x.opciones) +
        '<div class="cab"><b>' + esc(x.t) + "</b>" + (x.marca ? '<span class="marca ' + x.tono + '">' + MARCA[x.tono] + " " + esc(x.marca) + "</span>" : "") + "</div>" +
        (x.s ? '<span class="s">' + esc(x.s) + "</span>" : "") + "</div>").join("") + "</div>" +
        (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "");
    case "tablero":
      return '<div class="lado"><div class="caja tabcaja">' + tableroDe(diapo, d.pos, d.opciones) + "</div>" +
        '<div class="filas">' + d.items.map((x) => '<div class="caja fila' + tono(x.tono) + '">' + ic(x.ic) +
          "<div><b>" + esc(x.t) + "</b>" + (x.s ? '<span class="s">' + esc(x.s) + "</span>" : "") + "</div></div>").join("") +
        (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "") + "</div></div>";
    case "tabla":
      return "<table><thead><tr>" + d.cab.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" +
        d.filas.map(([sit, a, res, tn, que]) => "<tr><td>" + esc(sit) + art(a) + "</td><td>" +
          (tn ? '<span class="marca ' + tn + '">' + MARCA[tn] + " " + esc(res) + "</span>" : esc(res)) + "</td><td>" + esc(que) + "</td></tr>").join("") +
        "</tbody></table>";
    case "frase":
      return '<div class="frase caja' + tono(d.tono) + '">' + ic(d.ic) + "<p>" + esc(d.t) + "</p>" +
        (d.s ? '<span class="s">' + esc(d.s) + "</span>" : "") + art(d.a) + "</div>" +
        (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "");
    case "chips":
      return '<div class="chips">' + d.items.map((x) => '<div class="caja chip">' + ic(x.ic) + "<span>" + esc(x.t) + "</span></div>").join("") + "</div>";
    case "crono":
      // Dos columnas, la izquierda con la mitad de arriba (o una más).
      return '<div class="crono" style="grid-template-rows:repeat(' + Math.ceil(d.items.length / 2) + ',1fr)">' + d.items.map(([h, t, r]) => '<div class="caja hito' + (r ? " receso" : "") + '"><time>' + esc(h) + "</time>" +
        (r ? '<span class="ic" aria-hidden="true">☕</span>' : "") + "<span>" + esc(t) + (r ? " · 10 min" : "") + "</span></div>").join("") + "</div>";
    case "cita":
      return '<div class="cita"><blockquote>' + esc(d.cita) + "</blockquote><p>" + esc(d.s) + '</p><div class="fila3">' +
        d.items.map((x) => '<div class="caja chip">' + ic(x.ic) + "<span>" + esc(x.t) + "</span></div>").join("") + "</div></div>";
    case "receso":
      return '<div class="recesob"><span class="ic" aria-hidden="true">☕</span><b>10 minutos</b><p>Pausa los relojes. Nos vemos en breve.</p></div>';
    case "notacion":
      return '<div class="nota3">' + d.items.map((x) => '<div class="caja tarj"><b>' + esc(x.t) + '</b><span class="ej">' + esc(x.ej) + '</span><span class="s">' + esc(x.s) + "</span></div>").join("") + "</div>" +
        '<div class="signos">' + d.signos.map(([s, t]) => '<div class="signo"><code>' + esc(s) + "</code><span>" + esc(t) + "</span></div>").join("") + "</div>";
    case "planilla":
      return '<div class="planilla"><div class="caja hoja"><table><thead><tr><th>N.º</th><th>Blancas</th><th>Negras</th></tr></thead><tbody>' +
        d.jugadas.map(([b, n], k) => "<tr><td>" + (k + 1) + "</td><td>" + esc(b) + "</td><td>" + esc(n) + "</td></tr>").join("") +
        "</tbody></table><p>" + esc(d.pie) + '</p></div><div class="grid">' +
        d.items.map((x) => '<div class="caja tarj' + tono(x.tono) + '">' + ic(x.ic) + "<div><b>" + esc(x.t) + '</b><span class="ej">' + esc(x.ej) + '</span><span class="s">' + esc(x.s) + "</span></div></div>").join("") +
        "</div></div>";
    case "ciclo":
      return '<div class="ciclo">' + d.pasos.map((p, k) => (k ? '<span class="flecha" aria-hidden="true">→</span>' : "") +
        '<div class="caja paso' + (k === d.pasos.length - 1 ? " final" : "") + '">' + esc(p) + "</div>").join("") + "</div>" +
        '<div class="filas">' + d.items.map((x) => '<div class="caja fila">' + ic(x.ic) + "<div><b>" + esc(x.t) + '</b><span class="s">' + esc(x.s) + "</span></div></div>").join("") + "</div>";
    default:
      throw new Error("Tipo de lámina desconocido: " + d.tipo);
  }
}

function defsPiezas(usadas) {
  const trozos = [];
  usadas.forEach((id) => {
    const i = PIEZAS.indexOf('<g id="' + id + '"');
    let nivel = 0, j = i;
    for (; j < PIEZAS.length; j++) {
      if (PIEZAS.startsWith("<g", j)) nivel++;
      else if (PIEZAS.startsWith("</g>", j)) { nivel--; if (nivel === 0) { j += 4; break; } }
    }
    trozos.push(PIEZAS.slice(i, j));
  });
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><style>:root{--piece-white:#fff;--piece-black:#17202a}</style><defs>' + trozos.join("") + "</defs></svg>";
}

function html(d, diapo) {
  const usadas = new Set();
  if (d.tipo === "portada") {
    const deco = tablero("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", { colores: { clara: "#ffffff", oscura: "#9fc3e6", borde: "#ffffff" } }).replace("<svg ", '<svg class="deco" aria-hidden="true" ');
    return "<!doctype html><meta charset=utf-8><style>" + CSS + '</style><body class="portada">' + deco +
      "<small>" + esc(d.k) + "</small><h1>" + esc(d.t) + "</h1><p>" + esc(d.s) + "</p></body>";
  }
  const c = cuerpo(d, diapo, usadas);
  const titulo = diapo.titulo;
  return "<!doctype html><meta charset=utf-8><style>" + CSS + "</style><body>" + defsPiezas(usadas) +
    "<header>" + (d.k ? "<small>" + esc(d.k) + "</small>" : "") + '<h1 class="' + (titulo.length > 52 ? "muy-largo" : titulo.length > 38 ? "largo" : "") + '">' + esc(titulo) + "</h1></header><main>" + c + "</main></body>";
}

(async () => {
  fs.mkdirSync(DESTINO, { recursive: true });
  const opciones = {};
  const local = "/opt/pw-browsers/chromium";
  if (fs.existsSync(local)) opciones.executablePath = local;
  const navegador = await chromium.launch(opciones);
  const pagina = await navegador.newPage({ viewport: { width: 1600, height: 900 } });
  // Uno por proceso: dos clases se pueden dibujar a la vez.
  const tmp = path.join(require("os").tmpdir(), "formacion-lamina-" + clase + "-" + process.pid + ".html");
  for (let i = 0; i < DATOS.length; i++) {
    fs.writeFileSync(tmp, html(DATOS[i], DIAPOS[i]));
    await pagina.goto("file://" + tmp);
    await pagina.evaluate(() => document.fonts.ready);
    // Nada se sale de la lámina: un texto que no cabe se corta en silencio.
    const fuera = await pagina.evaluate(() => [...document.querySelectorAll("main *")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > 1601 || r.bottom > 901); })
      .map((e) => e.tagName + "." + e.className).slice(0, 3));
    if (fuera.length) console.warn("⚠ Lámina " + (i + 1) + ": se sale de la página: " + fuera.join(", "));
    const png = await pagina.screenshot({ type: "png" });
    // Chromium no saca capturas en WebP, pero sí lo codifica en un canvas.
    const webp = await pagina.evaluate(async (b64) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.9));
      const buf = new Uint8Array(await blob.arrayBuffer()); let s = "";
      for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(k, k + 0x8000));
      return btoa(s);
    }, png.toString("base64"));
    fs.writeFileSync(path.join(DESTINO, DIAPOS[i].imagen), Buffer.from(webp, "base64"));
  }
  await navegador.close();
  // Solo las que quedan en su lugar cuentan como dibujadas.
  if (DESTINO === CARPETA) fs.writeFileSync(archivo(clase), huella(clase) + "\n");
  console.log("✓ " + DATOS.length + " láminas en " + path.relative(RAIZ, DESTINO));
})().catch((e) => { console.error(e); process.exit(1); });
