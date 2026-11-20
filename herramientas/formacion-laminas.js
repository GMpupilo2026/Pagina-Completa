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
/* Más de 8 filas: más juntas, para que entren sin achicar la letra. */
table.larga{border-spacing:0 6px}table.larga td{padding:8px 22px}table.larga td .marca{padding:0 14px}
/* cuadro cruzado: números centrados, el jugador a la izquierda; los empatados en negrita y con fondo (lo dice la clave) */
table.cruzado{border-spacing:0 6px;font-size:30px;font-variant-numeric:tabular-nums}
table.cruzado th{text-align:center;padding:0 10px;font-size:24px}
table.cruzado td{text-align:center;padding:9px 10px;white-space:nowrap;color:var(--tinta)}
table.cruzado td:last-child{color:var(--tinta)}
table.cruzado th.j,table.cruzado td.j{text-align:left;padding-left:18px}
table.cruzado td:first-child{font-weight:400}
table.cruzado tr.emp td{background:#fdf3d7;font-weight:700}
.pregunta{font-size:40px;font-weight:700;line-height:1.2;color:var(--tinta);margin-bottom:6px;text-wrap:balance}
.cruzado-nota{font-size:24px;color:var(--gris);margin-top:4px}
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
/* traslado: un tablero con su planilla al lado, dos veces (el mal colocado → el bien colocado) */
.tras{flex:1;min-height:0;display:flex;gap:12px;align-items:stretch}
.trasc{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;padding:14px 18px 16px}
.trasc .cab{display:flex;gap:14px;align-items:center;white-space:nowrap}.trasc .cab b{font-size:32px}
.trasc .marca{font-size:26px;padding:2px 14px}
.trasf{flex:1;min-height:0;display:flex;gap:14px;align-items:center}
.trasf svg.tablero{height:100%;width:auto;flex:none;max-width:62%}
.trasc span.s{font-size:24px;color:var(--gris);line-height:1.2}
table.mini{border-spacing:0;font-size:22px;width:auto;flex:1}
table.mini th{font-size:18px;padding:2px 8px;border-bottom:3px solid var(--azul)}
table.mini td{padding:2px 8px;border-bottom:1px solid #e3e9f1;background:none;border-radius:0!important;color:var(--tinta)!important;font-weight:400;white-space:nowrap}
table.mini td:first-child{color:var(--gris)!important;font-weight:400}
.tras-f{align-self:center;font-size:56px;color:var(--azul);font-weight:700;flex:none}
/* foto: una foto real a la izquierda (herramientas/datos/fotos/) y filas a la derecha */
.lado .fotocaja{flex:none;width:55%;padding:0;overflow:hidden;display:flex;flex-direction:column}
.fotocaja img{width:100%;flex:1;min-height:0;object-fit:cover;display:block}
.fotocaja .pie{font-size:22px;color:var(--gris);padding:12px 20px;line-height:1.25}
/* fotos: dos fotos reales lado a lado, cada una con su marca (✓ bien, ✗ mal) escrita */
.fotos2{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:32px}
.fotocaja2{margin:0;padding:0;overflow:hidden;display:flex;flex-direction:column;min-height:0}
.fotocaja2 img{width:100%;flex:1;min-height:0;object-fit:cover;display:block}
.fotocaja2 figcaption{padding:14px 22px 16px;display:flex;flex-direction:column;gap:6px}
.fotocaja2 .marca{font-size:32px;align-self:flex-start}
.fotocaja2 .s{font-size:24px;color:var(--gris);line-height:1.2}
.fotocaja2 .credito{font-size:17px;color:var(--gris)}
/* mesa: una mesa lista, vista desde arriba, con las reglas al lado */
.lado .mesacaja{flex:none;width:50%;padding:14px;display:flex}
.mesacaja svg{width:100%;height:100%}
/* sala: el plano de un salón visto desde arriba */
.sala{flex:1;min-height:0;display:flex}
.sala svg{width:100%;height:100%}
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
      // `p`: la pregunta arriba de las filas; `letras`: las filas son opciones A, B, C, D.
      return (d.p ? '<p class="pregunta">' + esc(d.p) + "</p>" : "") +
        '<div class="filas' + (cols > 1 ? " dos-col" : "") + '" style="grid-template-columns:repeat(' + cols + ',1fr)">' +
        d.items.map((x, k) => '<div class="caja fila' + tono(x.tono) + '"' + (d.escalera ? ' style="margin-left:' + k * 60 + 'px"' : "") + ">" +
          (d.numerar ? '<span class="num">' + (k + 1) + "</span>" : d.letras ? '<span class="num">' + "ABCD"[k] + "</span>" : "") + ic(x.ic) +
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
      return "<table" + (d.filas.length > 8 ? ' class="larga"' : "") + "><thead><tr>" + d.cab.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" +
        d.filas.map(([sit, a, res, tn, que]) => "<tr><td>" + esc(sit) + art(a) + "</td><td>" +
          (tn ? '<span class="marca ' + tn + '">' + MARCA[tn] + " " + esc(res) + "</span>" : esc(res)) + "</td><td>" + esc(que) + "</td></tr>").join("") +
        "</tbody></table>";
    case "cruzado": {
      // El cuadro sale del tema del curso (formacion-ajedrez.json): no hay una segunda copia.
      const c = d.cuadro, jug = c.cab.indexOf("Jugador"), emp = new Set(c.resaltar || []);
      return '<table class="cruzado"><thead><tr>' + c.cab.map((x, k) => "<th" + (k === jug ? ' class="j"' : "") + ">" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
        c.filas.map((f, i) => "<tr" + (emp.has(i) ? ' class="emp"' : "") + ">" + f.map((x, k) => "<td" + (k === jug ? ' class="j"' : "") + ">" + esc(x) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table>" + (d.nota ? '<p class="cruzado-nota">' + esc(d.nota) + "</p>" : "") +
        (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "");
    }
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
    case "traslado":
      // `jugadas`: [[blancas, negras], …], la misma planilla al lado de cada tablero.
      return '<div class="tras">' + d.items.map((x, k) => (k ? '<span class="tras-f" aria-hidden="true">→</span>' : "") +
        '<div class="caja trasc"><div class="cab"><b>' + esc(x.t) + "</b>" +
        (x.marca ? '<span class="marca ' + x.tono + '">' + MARCA[x.tono] + " " + esc(x.marca) + "</span>" : "") + "</div>" +
        '<div class="trasf">' + tableroDe(diapo, x.pos, x.opciones) +
        '<table class="mini"><thead><tr><th>N.º</th><th>Blancas</th><th>Negras</th></tr></thead><tbody>' +
        d.jugadas.map(([b, n], j) => "<tr><td>" + (j + 1) + "</td><td>" + esc(b) + "</td><td>" + esc(n) + "</td></tr>").join("") +
        "</tbody></table></div>" + (x.s ? '<span class="s">' + esc(x.s) + "</span>" : "") + "</div>").join("") + "</div>" +
        (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "");
    case "ciclo":
      return '<div class="ciclo">' + d.pasos.map((p, k) => (k ? '<span class="flecha" aria-hidden="true">→</span>' : "") +
        '<div class="caja paso' + (k === d.pasos.length - 1 ? " final" : "") + '">' + esc(p) + "</div>").join("") + "</div>" +
        '<div class="filas">' + d.items.map((x) => '<div class="caja fila">' + ic(x.ic) + "<div><b>" + esc(x.t) + '</b><span class="s">' + esc(x.s) + "</span></div></div>").join("") + "</div>";
    case "foto":
      // La foto es de una sala real; se mete en la lámina como data: para que no dependa de rutas.
      return '<div class="lado"><figure class="caja fotocaja"><img alt="" src="data:image/jpeg;base64,' +
        fs.readFileSync(path.join(__dirname, "datos", "fotos", d.foto)).toString("base64") + '">' +
        (d.pie ? '<figcaption class="pie">' + esc(d.pie) + "</figcaption>" : "") + "</figure>" +
        '<div class="filas">' + d.items.map((x) => '<div class="caja fila' + tono(x.tono) + '">' + ic(x.ic) +
          "<div><b>" + esc(x.t) + "</b>" + (x.s ? '<span class="s">' + esc(x.s) + "</span>" : "") + "</div></div>").join("") +
        (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "") + "</div></div>";
    case "fotos":
      // Cada foto lleva su crédito: son de otros (la del autor, si la trae, queda en la imagen).
      return '<div class="fotos2">' + d.items.map((x) => '<figure class="caja fotocaja2"><img alt="" src="data:image/jpeg;base64,' +
        fs.readFileSync(path.join(__dirname, "datos", "fotos", x.foto)).toString("base64") + '"><figcaption>' +
        '<span class="marca ' + x.tono + '">' + MARCA[x.tono] + " " + esc(x.t) + "</span>" +
        (x.s ? '<span class="s">' + esc(x.s) + "</span>" : "") + (x.credito ? '<span class="credito">' + esc(x.credito) + "</span>" : "") +
        "</figcaption></figure>").join("") + "</div>" + (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "");
    case "mesa":
      return '<div class="lado"><div class="caja mesacaja">' + mesa(usadas) + '</div><div class="filas">' +
        d.items.map((x) => '<div class="caja fila' + tono(x.tono) + '">' + ic(x.ic) +
          "<div><b>" + esc(x.t) + "</b>" + (x.s ? '<span class="s">' + esc(x.s) + "</span>" : "") + "</div>" + art(x.a) + "</div>").join("") +
        (d.clave ? '<div class="clave">' + esc(d.clave) + "</div>" : "") + "</div></div>";
    case "sala":
      return '<div class="sala">' + plano(d) + "</div>";
    default:
      throw new Error("Tipo de lámina desconocido: " + d.tipo);
  }
}

// Una mesa lista para jugar, vista desde arriba y desde donde está el árbitro
// (abajo), de frente al reloj: las blancas a su izquierda, las negras a su
// derecha y el reloj a la derecha de las negras. Así, al anotar un resultado,
// izquierda es blancas y derecha es negras en toda la sala. La casilla de la
// esquina a la derecha de cada jugador es blanca (Leyes FIDE, art. 2.1).
function mesa(usadas) {
  const W = 700, H = 640, L = 40, bx = 190, by = 150;
  const p = [];
  const t = (x, y, txt, extra) => '<text x="' + x + '" y="' + y + '" ' + (extra || "") + ">" + esc(txt) + "</text>";
  p.push('<rect x="110" y="80" width="480" height="460" rx="10" fill="#dbe7f5" stroke="#1f5c99" stroke-width="3"/>');
  // Las sillas y quién se sienta en cada una.
  p.push('<rect x="38" y="225" width="56" height="150" rx="12" fill="#4a5a6a"/><rect x="606" y="225" width="56" height="150" rx="12" fill="#4a5a6a"/>');
  p.push(t(60, 405, "Blancas", 'text-anchor="middle" font-size="22" font-weight="700" fill="#17202a"'));
  p.push(t(640, 405, "Negras", 'text-anchor="middle" font-size="22" font-weight="700" fill="#17202a"'));
  // El tablero: la columna de la izquierda es la fila 1 (blancas), y arriba va la columna a.
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++)
    p.push('<rect x="' + (bx + i * L) + '" y="' + (by + j * L) + '" width="' + L + '" height="' + L + '" fill="' + ((i + j) % 2 === 0 ? "#9fc3e6" : "#ffffff") + '"/>');
  p.push('<rect x="' + bx + '" y="' + by + '" width="' + 8 * L + '" height="' + 8 * L + '" fill="none" stroke="#17202a" stroke-width="2"/>');
  const fondo = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  const pieza = (id, i, j) => { usadas.add(id); p.push('<use href="#' + id + '" transform="translate(' + (bx + i * L + 2) + "," + (by + j * L + 2) + ") scale(" + (L - 4) / 45 + ')"/>'); };
  fondo.forEach((f, j) => { pieza("w" + f, 0, j); pieza("wP", 1, j); pieza("bP", 6, j); pieza("b" + f, 7, j); });
  // El reloj, en el borde de enfrente: a la derecha de las negras.
  p.push('<rect x="296" y="92" width="108" height="46" rx="8" fill="#b42318"/><rect x="304" y="100" width="42" height="30" rx="4" fill="#e9f0e4"/><rect x="354" y="100" width="42" height="30" rx="4" fill="#e9f0e4"/>');
  p.push(t(350, 70, "Reloj", 'text-anchor="middle" font-size="24" font-weight="700" fill="#17202a"'));
  // La planilla de cada uno a su lado, con el lapicero listo.
  [[122, 300], [524, 300]].forEach(([x, y]) => {
    p.push('<rect x="' + x + '" y="' + y + '" width="54" height="150" rx="3" fill="#fff" stroke="#4a5a6a" stroke-width="2"/>');
    for (let k = 0; k < 7; k++) p.push('<line x1="' + (x + 6) + '" y1="' + (y + 20 + k * 18) + '" x2="' + (x + 48) + '" y2="' + (y + 20 + k * 18) + '" stroke="#9aa7b4" stroke-width="2"/>');
    p.push('<rect x="' + (x + 20) + '" y="' + (y + 156) + '" width="14" height="40" rx="3" fill="#1f5c99"/>');
  });
  // El número de la mesa, a la vista del árbitro.
  p.push('<rect x="300" y="490" width="100" height="36" rx="6" fill="#17202a"/>');
  p.push(t(350, 516, "Mesa 7", 'text-anchor="middle" font-size="22" font-weight="700" fill="#fff"'));
  // El árbitro, de frente al reloj.
  p.push('<circle cx="350" cy="596" r="22" fill="#fde9c8" stroke="#7a4b00" stroke-width="3"/>');
  p.push(t(350, 603, "A", 'text-anchor="middle" font-size="20" font-weight="700" fill="#5a3700"'));
  p.push(t(388, 604, "Árbitro, de frente al reloj", 'font-size="22" fill="#17202a"'));
  return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Una mesa lista: blancas a la izquierda del árbitro, reloj a la derecha de las negras" font-family="A, sans-serif">' + p.join("") + "</svg>";
}

// El plano de una sala vista desde arriba (tipo "sala"). Cada fila de mesas es
// un torneo: `filas` = [{t, mesas, tableros, eq}], en el orden en que se
// acomodan; `zonas` = cuántas filas vecinas cuida cada árbitro de sala, en
// orden. Debajo de cada fila van sus tableros y sus mesas dobles, escritos:
// el color (individual o equipos) nunca va solo.
function plano(d) {
  const W = 1460, H = 650, n = d.filas.length;
  const x0 = 70, ancho = W - 2 * x0, paso = ancho / n;
  const MESA_W = 40, MESA_H = 38, yMesas = 140, yTela = H - 74;
  const maxMesas = Math.max(...d.filas.map((f) => f.mesas));
  // Las filas, sus dos rótulos y la tela caben siempre: la mesa se achica si hace falta.
  const alto = Math.min(MESA_H, (yTela - 70 - yMesas) / maxMesas);
  const partes = [];
  const t = (x, y, txt, extra) => '<text x="' + x + '" y="' + y + '" ' + (extra || "") + ">" + esc(txt) + "</text>";
  // El salón, la mesa de control al frente y el público detrás de la tela.
  partes.push('<rect x="4" y="4" width="' + (W - 8) + '" height="' + (H - 8) + '" rx="18" fill="#fff" stroke="#1d3a5a" stroke-width="4"/>');
  partes.push('<rect x="' + (W / 2 - 190) + '" y="22" width="380" height="46" rx="8" fill="#1f5c99"/>');
  partes.push(t(W / 2, 53, d.control, 'text-anchor="middle" font-size="22" font-weight="700" fill="#fff"'));
  partes.push('<line x1="20" y1="' + yTela + '" x2="' + (W - 20) + '" y2="' + yTela + '" stroke="#b42318" stroke-width="6" stroke-dasharray="18 10"/>');
  partes.push('<text x="' + W / 2 + '" y="' + (yTela + 34) + '" text-anchor="middle" font-size="22"><tspan fill="#b42318" font-weight="700">' +
    esc(d.tela) + '</tspan><tspan fill="#4a5a6a"> · ' + esc(d.publico) + "</tspan></text>");
  // Las zonas de cada árbitro de sala: un corchete arriba de sus filas.
  let k = 0;
  (d.zonas || []).forEach((cuantas, z) => {
    const xa = x0 + k * paso + 6, xb = x0 + (k + cuantas) * paso - 6;
    partes.push('<path d="M' + xa + " " + (yMesas - 20) + " V" + (yMesas - 32) + " H" + xb + " V" + (yMesas - 20) + '" fill="none" stroke="#7a4b00" stroke-width="3"/>');
    partes.push('<circle cx="' + (xa + xb) / 2 + '" cy="' + (yMesas - 52) + '" r="17" fill="#fde9c8" stroke="#7a4b00" stroke-width="3"/>');
    partes.push(t((xa + xb) / 2, yMesas - 45, "A" + (z + 1), 'text-anchor="middle" font-size="18" font-weight="700" fill="#5a3700"'));
    k += cuantas;
  });
  // Las filas: cada mesa doble con sus dos tableros y una silla a cada lado de cada tablero.
  d.filas.forEach((f, i) => {
    const cx = x0 + i * paso + paso / 2, x = cx - MESA_W / 2;
    const relleno = f.eq ? "#fde9c8" : "#dbe7f5", borde = f.eq ? "#9a5b00" : "#1f5c99";
    for (let m = 0; m < f.mesas; m++) {
      const y = yMesas + m * alto;
      partes.push('<rect x="' + x + '" y="' + y + '" width="' + MESA_W + '" height="' + (alto - 2) + '" fill="' + relleno + '" stroke="' + borde + '" stroke-width="2"/>');
      const usados = Math.min(2, f.tableros - 2 * m);
      for (let b = 0; b < 2; b++) {
        const by = y + 3 + b * (alto - 2) / 2, lado = (alto - 2) / 2 - 6;
        if (b < usados) {
          partes.push('<rect x="' + (cx - lado / 2) + '" y="' + by + '" width="' + lado + '" height="' + lado + '" fill="#fff" stroke="#17202a" stroke-width="1.5"/>');
          partes.push('<rect x="' + (x - 9) + '" y="' + (by + 2) + '" width="7" height="' + (lado - 4) + '" rx="2" fill="#4a5a6a"/>');
          partes.push('<rect x="' + (x + MESA_W + 2) + '" y="' + (by + 2) + '" width="7" height="' + (lado - 4) + '" rx="2" fill="#4a5a6a"/>');
        }
      }
    }
    const yPie = yMesas + maxMesas * alto + 26;
    partes.push(t(cx, yPie, f.t, 'text-anchor="middle" font-size="17" font-weight="700" fill="#17202a"'));
    partes.push(t(cx, yPie + 23, f.tableros + " · " + f.mesas, 'text-anchor="middle" font-size="18" fill="#17202a"'));
  });
  partes.push(t(W / 2, H - 14, d.leyenda, 'text-anchor="middle" font-size="19" fill="#4a5a6a"'));
  return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(d.k || "Plano de la sala") + '" font-family="A, sans-serif">' + partes.join("") + "</svg>";
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

/*! rev bfb5bbb0d2d82f9f */
