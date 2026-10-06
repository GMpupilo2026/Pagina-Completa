/* ===== «Peonita y el reino de las 64 casillas», de Oscar Angulo Cubero =====
 *
 * Un libro para que niñas y niños de 4 a 8 años aprendan a jugar ajedrez con
 * un cuento: Peonita, un peón blanco, sale de noche de la caja de ajedrez de
 * una escuela y Don Lento, un perezoso del guarumo, le enseña a mover cada
 * pieza. Cada capítulo trae su ilustración, el cuento, «Lo que aprendí» y una
 * página de «¡A jugar!»; al final, el diploma y las soluciones.
 *
 * Arma material/peonita/peonita.pdf y peonita-accesible.html. El contenido
 * (cuento, ejercicios y respuestas) vive en herramientas/libro-ninos/contenido.js
 * y los dibujos en herramientas/libro-ninos/dibujos.js: este script solo lo pone
 * en papel. Las respuestas las comprueba verificar-libro-ninos.js con chess.js.
 *
 * Se cierra como los otros libros (tapa a página completa, marca de agua con
 * el logo, firma del autor y PDF protegido: herramientas/lib/pdf-armar.js),
 * pero SE DEJA IMPRIMIR: las páginas de «¡A jugar!» se pintan y se escriben
 * con lápiz.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/libro-ninos-pdf.js
 *     node herramientas/libro-ninos-pdf.js --solo-accesible   # sin PDF ni pypdf
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Chess } = require("chess.js");
const { tablero } = require("./lib/tablero-svg.js");
const { describir } = require("./lib/describir-fen.js");
const { unir, proteger } = require("./lib/pdf-armar.js");
const N = require("./lib/notacion.js");
const D = require("./libro-ninos/dibujos.js");
const L = require("./libro-ninos/contenido.js");

const RAIZ = path.join(__dirname, "..");
const CARPETA = path.join(RAIZ, "material", "peonita");
const CLAVE_PROPIETARIO = "peonita-oac-2026";
const ANIO = 2026;

/* La madera de los tableros del libro. Los contrastes están medidos (WCAG,
   contra el fondo real): los puntos de «puede ir» (#0b4a1f, en
   lib/tablero-svg.js) dan 8,5:1 contra la casilla clara y 4,1:1 contra la
   oscura, y el aro de «puede comer» (#7f1d1d) 8,2:1 y 3,9:1; un objeto
   gráfico pide 3:1. El primer verde (#2b8a3e) daba 1,7:1 en la casilla oscura:
   el punto casi no se veía justo en la mitad de las casillas. Y el color no va
   solo: el pie de cada diagrama dice qué son los puntos. */
const MADERA = { clara: "#f6e7c8", oscura: "#c79a6b", borde: "#6b4a2e", marca: "#ffd43b" };

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function incrustar(relativo, tipo) {
  return `data:${tipo || "image/png"};base64,` + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO = incrustar("img/logo-oscar-angulo.png");
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");
const FUENTES = `
  @font-face { font-family: "Quicksand"; font-weight: 700; src: url("${incrustar("fonts/quicksand-700-latin.woff2", "font/woff2")}") format("woff2"); }
  @font-face { font-family: "Comic Neue"; font-weight: 400; src: url("${incrustar("fonts/comic-neue-400-latin.woff2", "font/woff2")}") format("woff2"); }
  @font-face { font-family: "Comic Neue"; font-weight: 700; src: url("${incrustar("fonts/comic-neue-700-latin.woff2", "font/woff2")}") format("woff2"); }`;

/* ---------------------------------------------------------- las piezas en palabras */
const FEMENINO = { r: true, q: true };
const NOMBRE_FEN = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
const LETRA_ESP = { R: "k", D: "q", T: "r", A: "b", C: "n", P: "p" };

function piezaEn(fen, casilla) {
  const g = new Chess(fen);
  return g.get(casilla);
}
/* «la torre blanca», «el caballo negro»… */
function nombrePieza(p, conColor) {
  const f = FEMENINO[p.type];
  const art = f ? "la" : "el";
  const col = conColor ? " " + (p.color === "w" ? (f ? "blanca" : "blanco") : (f ? "negra" : "negro")) : "";
  return `${art} ${NOMBRE_FEN[p.type]}${col}`;
}
const conMayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
/* «al peón negro», «a la dama negra» */
const aLa = (p) => (FEMENINO[p.type] ? "a " : "a") + nombrePieza(p, true).replace(/^el /, "l ");
function lista(cosas) {
  return cosas.length < 2 ? cosas.join("") : cosas.slice(0, -1).join(", ") + " y " + cosas[cosas.length - 1];
}

function destinos(fen, casilla) {
  const g = new Chess(fen);
  return [...new Set(g.moves({ square: casilla, verbose: true }).map((m) => m.to))].sort();
}

/* El camino más corto del caballo, para mostrarlo en la solución. */
function caminoCaballo(desde, hasta) {
  const xy = (s) => ["abcdefgh".indexOf(s[0]), +s[1] - 1];
  const previo = { [desde]: null };
  let frente = [desde];
  while (frente.length && !(hasta in previo)) {
    const sig = [];
    frente.forEach((s) => {
      const [x, y] = xy(s);
      [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx > 7 || ny < 0 || ny > 7) return;
        const k = "abcdefgh"[nx] + (ny + 1);
        if (!(k in previo)) { previo[k] = s; sig.push(k); }
      });
    });
    frente = sig;
  }
  const camino = [];
  for (let s = hasta; s; s = previo[s]) camino.unshift(s);
  return camino;
}

/* ---------------------------------------------------------- diagramas */
function diagrama(fen, opciones) {
  const o = opciones || {};
  const extra = {};
  if (o.casilla && o.mostrar) {
    const g = new Chess(fen);
    const mov = g.moves({ square: o.casilla, verbose: true });
    extra.puntos = [...new Set(mov.filter((m) => !m.captured).map((m) => m.to))];
    extra.capturas = [...new Set(mov.filter((m) => m.captured).map((m) => m.to))];
  }
  return tablero(fen, Object.assign({
    colores: MADERA, coordenadas: true, titulo: o.titulo || "Diagrama",
    destacar: o.casilla ? [o.casilla] : [], estrellas: o.estrellas || [],
  }, extra));
}

function tableroVacio(bien) {
  // A: la casilla de abajo a la derecha es clara. B: girado, es oscura.
  const c = 12, s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" aria-hidden="true"><rect width="108" height="108" rx="4" fill="${MADERA.borde}"/>`];
  for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) {
    const clara = ((r + k) % 2 === 0) === bien;
    s.push(`<rect x="${6 + k * c}" y="${6 + r * c}" width="${c}" height="${c}" fill="${clara ? MADERA.clara : MADERA.oscura}"/>`);
  }
  s.push(`<circle cx="${6 + 7 * c + 6}" cy="${6 + 7 * c + 6}" r="7.5" fill="none" stroke="#7f1d1d" stroke-width="1.6" stroke-dasharray="2 1.5"/>`);
  return s.join("") + "</svg>";
}

function tableroColorear() {
  const c = 12, s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 116" aria-hidden="true">`];
  for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) {
    const pista = r === 7 && k === 0;
    s.push(`<rect x="${10 + k * c}" y="${4 + r * c}" width="${c}" height="${c}" fill="${pista ? MADERA.oscura : "#fff"}" stroke="${MADERA.borde}" stroke-width=".7"/>`);
  }
  for (let i = 0; i < 8; i++) {
    s.push(`<text x="${10 + i * c + 6}" y="${4 + 8 * c + 8}" text-anchor="middle" font-family="Quicksand" font-weight="700" font-size="5.5" fill="${MADERA.borde}">${"abcdefgh"[i]}</text>`);
    s.push(`<text x="6" y="${4 + i * c + 8}" text-anchor="middle" font-family="Quicksand" font-weight="700" font-size="5.5" fill="${MADERA.borde}">${8 - i}</text>`);
  }
  s.push(`<rect x="10" y="4" width="96" height="96" fill="none" stroke="${MADERA.borde}" stroke-width="1.6"/>`);
  return s.join("") + "</svg>";
}

/* Una pieza dibujada como personaje, en chiquito, para los ejercicios de puntos. */
const LETRA_DIBUJO = { P: "p", C: "c", A: "a", T: "t", D: "d", R: "r" };
function filaDePiezas(piezas, color) {
  return `<span class="fila-piezas">${[...piezas].map((p) => `<span class="mini">${D.piezaSola(LETRA_DIBUJO[p], color || "b")}</span>`).join("")}</span>`;
}

/* ---------------------------------------------------------- los ejercicios */
const SI_NO = `<p class="opciones"><span class="caja-op">Sí</span><span class="caja-op">No</span></p>`;
const LINEA = (antes, despues) => `<p class="linea">${antes || "Respuesta:"} <span class="raya"></span>${despues ? " " + despues : ""}</p>`;

function preguntaDe(e) {
  const p = e.casilla ? piezaEn(e.fen, e.casilla) : null;
  switch (e.tipo) {
    case "contar": return { q: `¿A cuántas casillas puede ir ${nombrePieza(p, true)} de la casilla amarilla?`, a: LINEA("", "casillas") };
    case "comer": return { q: `¿Qué pieza negra se puede comer ${nombrePieza(p, true)}? Enciérrala en un círculo.`, a: "" };
    case "color": return { q: `¿Puede el alfil llegar alguna vez a la casilla de la estrella?`, a: SI_NO };
    case "saltos": return { q: `¿Cuántos saltos necesita el caballo para llegar a la estrella?`, a: LINEA("", e.respuesta === 1 ? "salto(s)" : "salto(s)") };
    case "destinos": return { q: `Marca con una ✗ las casillas adonde puede ir ${nombrePieza(p, true)}. Si no se puede mover, escribe «ninguna».`, a: LINEA() };
    case "jaque": return { q: "¿Está en jaque el rey blanco?", a: SI_NO };
    case "salida": return { q: "El rey blanco está en jaque. ¿Cómo se salva?", a: `<p class="opciones"><span class="caja-op">Huir</span><span class="caja-op">Tapar</span><span class="caja-op">Comer</span></p>` };
    case "mate": return { q: "Juegan las blancas. ¿Qué jugada da jaque mate?", a: LINEA() };
    case "final": return { q: "Le toca mover al rey negro. ¿Qué pasó?", a: `<p class="opciones"><span class="caja-op">Jaque mate</span><span class="caja-op">Ahogado</span><span class="caja-op">Ninguno</span></p>` };
    case "enroque": return { q: "¿Puede enrocar corto el rey blanco ahora mismo?", a: SI_NO };
    case "corona": return { q: "El peón llega a la estrella. ¿En qué pieza se puede convertir?", a: LINEA() };
    case "casilla": return { q: e.pregunta, a: LINEA() };
    default: return { q: e.pregunta, a: LINEA() };
  }
}

function ejercicioHTML(e, num) {
  const cab = `<span class="num">${num}</span>`;
  if (e.tipo === "tableros") {
    return `<div class="ej ancho">${cab}<p class="preg">${esc(e.pregunta)}</p>
      <div class="dos"><figure>${tableroVacio(true)}<figcaption>A</figcaption></figure><figure>${tableroVacio(false)}<figcaption>B</figcaption></figure></div>
      ${LINEA("El tablero bien puesto es el:")}</div>`;
  }
  if (e.tipo === "colorear") {
    return `<div class="ej ancho">${cab}<p class="preg">${esc(e.pregunta)}</p><div class="colorear">${tableroColorear()}</div></div>`;
  }
  if (e.tipo === "unir") {
    const tipos = ["t", "c", "a", "d", "r", "p"];
    const nombres = ["el alfil", "el peón", "la torre", "el rey", "el caballo", "la dama"];
    return `<div class="ej ancho">${cab}<p class="preg">${esc(e.pregunta)}</p>
      <div class="unir"><ul class="col-piezas">${tipos.map((t) => `<li><span class="mini grande">${D.piezaSola(t, "b", t === "p" ? { mono: true } : {})}</span><span class="punto"></span></li>`).join("")}</ul>
      <ul class="col-nombres">${nombres.map((n) => `<li><span class="punto"></span>${n}</li>`).join("")}</ul></div></div>`;
  }
  if (e.tipo === "promesas" || e.tipo === "partida") {
    const items = e.tipo === "promesas" ? L.PROMESAS : L.CONSEJOS_PARTIDA;
    return `<div class="ej ancho">${cab}<p class="preg">${esc(e.pregunta)}</p>
      <ul class="lista-marcar">${items.map((t) => `<li><span class="casilla-marcar"></span>${esc(t)}</li>`).join("")}</ul>
      ${e.tipo === "partida" ? `<p class="linea">Jugué con: <span class="raya larga"></span></p><p class="linea">¿Cómo terminó? <span class="raya larga"></span></p>` : ""}</div>`;
  }
  if (e.tipo === "puntos") {
    return `<div class="ej">${cab}<p class="preg">¿Quién tiene más puntos?</p>
      ${e.grupos.map((g, i) => `<p class="grupo"><strong>${esc(g.nombre)}:</strong> ${filaDePiezas(g.piezas, i ? "n" : "b")}</p>`).join("")}${LINEA()}</div>`;
  }
  if (e.tipo === "cambio") {
    return `<div class="ej">${cab}<p class="preg">Das ${nombreCorto(e.das)} y recibes ${nombreCorto(e.recibes)}. ¿Es un buen cambio?</p>
      <p class="grupo">Das: ${filaDePiezas(e.das)} &nbsp; Recibes: ${filaDePiezas(e.recibes)}</p>
      <p class="opciones"><span class="caja-op">Bueno</span><span class="caja-op">Malo</span></p></div>`;
  }
  if (e.tipo === "suma") {
    return `<div class="ej ancho">${cab}<p class="preg">¿Cuántos puntos suman todas estas piezas? Son las de un bando, sin el rey.</p>
      <p class="grupo">${filaDePiezas(e.piezas)}</p>${LINEA("", "puntos")}</div>`;
  }
  const { q, a } = preguntaDe(e);
  const fig = e.fen ? `<div class="diag">${diagrama(e.fen, { casilla: ["contar", "comer", "destinos", "color", "saltos", "corona"].includes(e.tipo) ? e.casilla : null, estrellas: e.estrellas || (e.meta ? [e.meta] : []), titulo: q })}</div>` : "";
  return `<div class="ej">${cab}${fig}<p class="preg">${esc(q)}</p>${a}</div>`;
}

const UN = { P: "un peón", C: "un caballo", A: "un alfil", T: "una torre", D: "una dama" };
function nombreCorto(letra) { return UN[letra]; }

/* La solución de cada ejercicio, en una frase para leerle al niño. */
function solucion(e) {
  const p = e.casilla ? piezaEn(e.fen, e.casilla) : null;
  const expl = e.explica ? " " + e.explica : "";
  switch (e.tipo) {
    case "tableros": return "El tablero A: tiene la casilla clara abajo, a la derecha.";
    case "colorear": return "Quedan pintadas a1, c1, e1, g1, b2, d2… una sí y una no, como un piso de baldosas.";
    case "unir": return "Torre, caballo, alfil, dama, rey y peón, en ese orden de arriba hacia abajo.";
    case "promesas": case "partida": return "¡No hay respuestas malas! Lo importante es jugar y cumplir las promesas.";
    case "contar": {
      const d = destinos(e.fen, e.casilla);
      return `${conMayuscula(nombrePieza(p))} puede ir a ${e.respuesta} casillas: ${lista(d)}.`;
    }
    case "comer": return `${conMayuscula(nombrePieza(p))} se come ${aLa(piezaEn(e.fen, e.respuesta))} de ${e.respuesta}.`;
    case "color": return e.respuesta
      ? `Sí. La estrella está en una casilla del mismo color que el alfil.`
      : `No. La estrella está en una casilla de otro color, y el alfil nunca cambia de color.`;
    case "saltos": {
      const c = caminoCaballo(e.casilla, e.meta);
      return `${e.respuesta === 1 ? "Un salto" : e.respuesta + " saltos"}: ${c.join(" → ")}.`;
    }
    case "destinos": return e.respuesta.length ? `A ${lista(e.respuesta)}.` : `A ninguna: tiene el camino tapado de frente y no hay nada para comer.`;
    case "jaque": return (e.respuesta ? "Sí." : "No.") + expl;
    case "salida": return `${conMayuscula(e.respuesta)}.` + expl;
    case "mate": {
      const pieza = { k: "el rey", q: "la dama", r: "la torre", b: "el alfil", n: "el caballo", p: "el peón" }[LETRA_ESP[e.respuesta[0]] || "p"];
      return `${e.respuesta}: ${pieza} va a ${e.respuesta.slice(-2)} y da jaque mate.`;
    }
    case "final": return { mate: "Jaque mate.", ahogado: "Ahogado: la partida termina en tablas.", ninguno: "Ninguno de los dos: la partida sigue." }[e.respuesta] + expl;
    case "enroque": return (e.respuesta ? "Sí." : "No.") + expl;
    case "puntos": {
      const sum = (g) => [...g.piezas].reduce((s, x) => s + L.VALOR[x], 0);
      return `${e.respuesta}. ` + e.grupos.map((g) => `${g.nombre} tiene ${sum(g)} puntos`).join(" y ") + ".";
    }
    case "cambio": return `${conMayuscula(e.respuesta)}: das ${L.VALOR[e.das]} puntos y recibes ${L.VALOR[e.recibes]}.`;
    case "suma": return `${e.respuesta} puntos: 8 peones (8), 2 caballos (6), 2 alfiles (6), 2 torres (10) y la dama (9).`;
    default: return e.respuesta;
  }
}

/* ---------------------------------------------------------- el libro */
function parrafo(t) {
  const dialogo = /^—/.test(t);
  return `<p class="${dialogo ? "dialogo" : ""}">${esc(t)}</p>`;
}

function muestraHTML(m) {
  return `<figure class="muestra"><div class="diag">${diagrama(m.fen, { casilla: m.casilla, mostrar: !!m.casilla, titulo: m.pie })}</div><figcaption>${esc(m.pie)}</figcaption></figure>`;
}

/* Con un solo diagrama, el diagrama y «Lo que aprendí» van lado a lado: así el
   capítulo no deja una página casi vacía con el recuadro solo. */
function cierre(c) {
  const aprendi = `<aside class="aprendi"><h3><span aria-hidden="true">⭐</span> Lo que aprendí</h3><ul>${c.aprendi.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></aside>`;
  if (c.muestras.length === 1) return `<div class="cierre">${muestraHTML(c.muestras[0])}${aprendi}</div>`;
  return (c.muestras.length ? `<div class="muestras">${c.muestras.map(muestraHTML).join("")}</div>` : "") + aprendi;
}

function capituloHTML(c) {
  let numEj = 0;
  return `<section class="capitulo">
    <header class="cab-cap"><span class="insignia">Capítulo ${c.n}</span><h2>${esc(c.titulo)}</h2></header>
    <div class="ilustracion">${D.escena(c.escena)}</div>
    <div class="cuento">${c.cuento.map(parrafo).join("")}</div>
    ${cierre(c)}
  </section>
  <section class="jugar">
    <header class="cab-jugar"><h2>¡A jugar!</h2><p>Capítulo ${c.n} · ${esc(c.titulo)}</p></header>
    <div class="ejercicios">${c.ejercicios.map((e) => ejercicioHTML(e, ++numEj)).join("")}</div>
  </section>`;
}

const PRES = L.PRESENTACION;
const ESTILO = `
  ${FUENTES}
  @page { size: A4; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Comic Neue", "Comic Sans MS", sans-serif; font-size: 13.5pt; line-height: 1.45; color: #2b2233; }
  h1, h2, h3, .insignia, .num, figcaption, .caja-op { font-family: "Quicksand", sans-serif; font-weight: 700; }
  svg { display: block; }
  p { margin: 0 0 2.6mm; }
  .pagina { break-after: page; }
  .capitulo { break-before: page; }
  .cab-cap { text-align: center; margin: 0 0 4mm; }
  .insignia { display: inline-block; background: #ffd43b; color: #5c3d00; border-radius: 99px; padding: 1mm 5mm; font-size: 11pt; letter-spacing: .06em; text-transform: uppercase; }
  .cab-cap h2 { font-size: 26pt; line-height: 1.15; margin: 2mm 0 0; color: #a61e4d; }
  .ilustracion { margin: 0 0 5mm; break-inside: avoid; }
  .ilustracion svg { width: 100%; height: auto; }
  .capitulo > .ilustracion { width: 140mm; margin-left: auto; margin-right: auto; }
  .cuento p { text-align: left; }
  .cuento p.dialogo { padding-left: 4mm; }
  .muestras { display: flex; flex-wrap: wrap; gap: 6mm; justify-content: center; margin: 4mm 0; break-inside: avoid; }
  .muestra { margin: 0; width: 72mm; break-inside: avoid; }
  .muestra .diag svg { width: 72mm; height: auto; margin: 0 auto; }
  .muestra figcaption { font-size: 10.5pt; line-height: 1.35; text-align: center; color: #5b4636; margin-top: 1.5mm; font-weight: 700; }
  .cierre { display: flex; gap: 6mm; align-items: center; margin-top: 4mm; break-inside: avoid; }
  .cierre .muestra { flex: none; width: 54mm; }
  .cierre .muestra .diag svg { width: 54mm; }
  .cierre .aprendi { flex: 1; margin-top: 0; }
  .aprendi { break-inside: avoid; background: #fff9db; border: 2.5px dashed #f59f00; border-radius: 6mm; padding: 4mm 6mm 3mm; margin-top: 5mm; }
  .aprendi h3 { margin: 0 0 2mm; color: #9a4f00; font-size: 15pt; }
  .aprendi ul { margin: 0; padding-left: 6mm; }
  .aprendi li { margin-bottom: 1mm; }
  .jugar { break-before: page; }
  .cab-jugar { background: linear-gradient(90deg, #d0ebff, #e5dbff); border-radius: 6mm; padding: 3mm 6mm; margin-bottom: 5mm; display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; }
  .cab-jugar h2 { margin: 0; font-size: 24pt; color: #1864ab; }
  .cab-jugar p { margin: 0; font-size: 10.5pt; color: #364fc7; font-family: "Quicksand"; font-weight: 700; text-align: right; }
  .ejercicios { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .ej { position: relative; border: 2px solid #d0bfa6; border-radius: 5mm; padding: 4mm 4mm 3mm 13mm; break-inside: avoid; background: #fffdf8; }
  .ej.ancho { grid-column: 1 / -1; }
  .num { position: absolute; top: 2mm; left: 2mm; width: 9mm; height: 9mm; border-radius: 50%; background: #1864ab; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12pt; }
  .ej .diag svg { width: 62mm; height: auto; margin: 0 auto 2mm; }
  .preg { font-weight: 700; font-size: 12.5pt; line-height: 1.35; }
  .linea { font-size: 12pt; display: flex; align-items: flex-end; gap: 2mm; margin: 2mm 0 0; }
  .raya { flex: 1; border-bottom: 1.5px dotted #5b4636; height: 6mm; min-width: 20mm; }
  .opciones { display: flex; gap: 3mm; flex-wrap: wrap; margin: 2mm 0 0; }
  .caja-op { border: 2px solid #5b4636; border-radius: 99px; padding: .6mm 4mm; font-size: 11.5pt; }
  .dos { display: flex; gap: 14mm; justify-content: center; }
  .dos figure { margin: 0; text-align: center; }
  .dos svg { width: 48mm; height: auto; }
  .dos figcaption { font-size: 16pt; margin-top: 1mm; }
  .colorear svg { width: 92mm; height: auto; margin: 0 auto; }
  .unir { display: flex; justify-content: space-around; align-items: stretch; }
  .unir ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 1mm; }
  .col-piezas li { display: flex; align-items: center; gap: 3mm; }
  .col-nombres li { display: flex; align-items: center; gap: 3mm; font-size: 15pt; font-family: "Quicksand"; font-weight: 700; height: 17mm; }
  .punto { width: 3.2mm; height: 3.2mm; border-radius: 50%; background: #5b4636; display: inline-block; }
  .fila-piezas { display: inline-flex; flex-wrap: wrap; gap: 0; vertical-align: middle; }
  .mini svg { width: 10mm; height: auto; }
  .mini.grande svg { width: 12mm; }
  .grupo { margin: 1mm 0 2mm; display: flex; align-items: center; gap: 2mm; flex-wrap: wrap; }
  .lista-marcar { list-style: none; padding: 0; margin: 2mm 0; }
  .lista-marcar li { display: flex; align-items: center; gap: 4mm; margin-bottom: 3mm; font-size: 14pt; }
  .casilla-marcar { width: 7mm; height: 7mm; border: 2.5px solid #5b4636; border-radius: 1.5mm; flex: none; }
  .raya.larga { min-width: 90mm; }
  /* páginas sueltas */
  .creditos { padding-top: 40mm; font-size: 11pt; line-height: 1.6; color: #5b4636; }
  .creditos .dedica { font-size: 14pt; line-height: 1.7; font-style: italic; margin-bottom: 40mm; text-align: center; color: #a61e4d; padding-top: 0; }
  .creditos h1 { font-size: 16pt; margin: 0 0 2mm; color: #2b2233; }
  .nota h2, .indice h2, .soluciones h2, .final h2 { font-size: 24pt; color: #a61e4d; margin: 0 0 5mm; }
  .nota p { font-size: 13pt; }
  .nota .firma { text-align: right; font-family: "Quicksand"; font-weight: 700; margin-top: 6mm; }
  .presenta .ilustracion { margin-bottom: 7mm; }
  .presenta p { font-size: 16pt; line-height: 1.55; }
  .indice ol { list-style: none; padding: 0; margin: 0; columns: 1; }
  .indice li { display: flex; gap: 4mm; align-items: baseline; padding: 2.4mm 0; border-bottom: 2px dotted #e9dcc6; font-size: 14pt; }
  .indice .n { font-family: "Quicksand"; font-weight: 700; color: #fff; background: #c2255c; border-radius: 99px; min-width: 9mm; text-align: center; font-size: 11pt; padding: .5mm 0; }
  .final .ilustracion { margin-bottom: 6mm; }
  .final p { font-size: 15pt; }
  .soluciones { break-before: page; }
  .soluciones h3 { font-size: 13pt; color: #1864ab; margin: 5mm 0 1.5mm; break-after: avoid; }
  .soluciones ol { margin: 0; padding-left: 7mm; font-size: 11.5pt; line-height: 1.45; }
  .soluciones li { margin-bottom: 1mm; break-inside: avoid; }
  .diploma { break-before: page; height: 262mm; border: 3mm double #f59f00; border-radius: 8mm; padding: 12mm 14mm; text-align: center; display: flex; flex-direction: column; position: relative; background: #fffdf3; }
  .diploma h2 { font-size: 34pt; color: #a61e4d; margin: 4mm 0 2mm; }
  .diploma .sub { font-size: 14pt; color: #5b4636; margin-bottom: 8mm; }
  .diploma .nombre { border-bottom: 2px solid #5b4636; height: 14mm; margin: 4mm 10mm 6mm; }
  .diploma .texto { font-size: 15pt; line-height: 1.6; }
  .diploma .dibujo svg { width: 100%; height: auto; }
  .diploma .firmas { margin-top: auto; display: flex; justify-content: space-between; gap: 12mm; font-size: 11pt; }
  .diploma .firmas div { flex: 1; border-top: 1.5px solid #5b4636; padding-top: 2mm; }
  .diploma .firmas strong { font-family: "Quicksand"; display: block; font-size: 12pt; }
`;

function soluciones() {
  return `<section class="soluciones"><h2>Soluciones</h2>
    <p>Para leerlas con un adulto después de intentarlo. Las casillas se nombran con su letra y su número, como aprendimos en el capítulo 1.</p>
    ${L.CAPITULOS.map((c) => `<h3>Capítulo ${c.n} · ${esc(c.titulo)}</h3><ol>${c.ejercicios.map((e) => `<li>${esc(solucion(e))}</li>`).join("")}</ol>`).join("")}
  </section>`;
}

const escenaFinal = {
  id: "final", fondo: "noche",
  alt: "Todos celebran juntos bajo la luna: Peonita, Tizón, el rey, la dama, la torre, el alfil y el caballo, con confeti de colores. Don Lento sonríe desde su rama.",
  contenido: D.confeti(5, 50, 600, 320) + D.perezoso(500, 40, 0.5) +
    [["t", "b"], ["c", "n"], ["r", "b"], ["d", "n"], ["a", "b"]].map(([t, col], i) => D.pieza(t, col, 70 + i * 82, 225, 0.55, { espejo: i > 2 })).join("") +
    D.pieza("p", "b", 230, 300, 0.8, { mono: true }) + D.pieza("p", "n", 360, 300, 0.8, { bufanda: true, espejo: true }) + D.corazon(295, 205, 1.1),
};

const escenaDiploma = {
  id: "diploma", fondo: "dia",
  alt: "Peonita y Don Lento felicitan a quien recibe el diploma.",
  contenido: D.perezoso(470, 40, 0.55) + D.pieza("p", "b", 150, 290, 1, { mono: true }) + D.trofeo(300, 280, 1.4) +
    D.estrella(240, 90, 12) + D.estrella(360, 70, 9) + D.estrella(300, 120, 7),
};

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(L.TITULO)}</title><style>${ESTILO}</style></head><body>
<section class="pagina creditos">
  <p class="dedica">${L.DEDICATORIA.map(esc).join("<br>")}</p>
  <h1>${esc(L.TITULO)}</h1>
  <p>${esc(L.SUBTITULO)}</p>
  <p>Texto e ilustraciones: ${esc(L.AUTOR)}<br>Academia Ajedrez Integral · Costa Rica · ${ANIO}</p>
  <p>© ${ANIO} ${esc(L.AUTOR)}. Todos los derechos reservados.<br>Este libro se puede imprimir para usarlo en casa o en la clase.</p>
</section>
<section class="pagina nota">
  <h2>Para las familias y el personal docente</h2>
  ${L.NOTA_ADULTOS.map((t) => `<p>${esc(t)}</p>`).join("")}
  <p class="firma">${esc(L.AUTOR)}</p>
</section>
<section class="pagina presenta">
  <div class="ilustracion">${D.escena(PRES.escena)}</div>
  ${PRES.parrafos.map((t) => `<p>${esc(t)}</p>`).join("")}
</section>
<section class="pagina indice">
  <h2>Los capítulos</h2>
  <ol>${L.CAPITULOS.map((c) => `<li><span class="n">${c.n}</span>${esc(c.titulo)}</li>`).join("")}
  <li><span class="n">★</span>Mi diploma de ajedrez</li><li><span class="n">✓</span>Soluciones</li></ol>
</section>
${L.CAPITULOS.map(capituloHTML).join("")}
<section class="capitulo final">
  <header class="cab-cap"><span class="insignia">Fin</span><h2>¡Ya sabes jugar ajedrez!</h2></header>
  <div class="ilustracion">${D.escena(escenaFinal)}</div>
  ${L.FINAL.map((t) => `<p>${esc(t)}</p>`).join("")}
</section>
<section class="diploma">
  <div class="dibujo">${D.escena(escenaDiploma)}</div>
  <h2>Diploma de ajedrez</h2>
  <p class="sub">El reino de las 64 casillas reconoce a</p>
  <div class="nombre"></div>
  <p class="texto">porque aprendió a mover todas las piezas, a dar jaque mate<br>y a jugar con la cabeza y con el corazón.</p>
  <div class="firmas"><div><strong>Fecha</strong></div><div><strong>Peonita y Don Lento</strong>${esc(L.AUTOR)}</div></div>
</section>
${soluciones()}
</body></html>`;

/* ---------------------------------------------------------- la tapa */
function tapa() {
  const W = 600, H = 848;
  let filas = "";
  // El piso de tablero en perspectiva, de la mitad para abajo.
  const y0 = 560, y1 = H, n = 8;
  for (let f = 0; f < 6; f++) {
    const ta = f / 6, tb = (f + 1) / 6;
    const ya = y0 + (y1 - y0) * ta * ta * 0.6 + (y1 - y0) * ta * 0.4, yb = y0 + (y1 - y0) * tb * tb * 0.6 + (y1 - y0) * tb * 0.4;
    const ancho = (t) => 300 + 520 * t;
    for (let c = 0; c < n; c++) {
      const xa1 = W / 2 - ancho(ta) + (2 * ancho(ta) / n) * c, xa2 = xa1 + 2 * ancho(ta) / n;
      const xb1 = W / 2 - ancho(tb) + (2 * ancho(tb) / n) * c, xb2 = xb1 + 2 * ancho(tb) / n;
      filas += `<path d="M${xa1.toFixed(1)},${ya.toFixed(1)} L${xa2.toFixed(1)},${ya.toFixed(1)} L${xb2.toFixed(1)},${yb.toFixed(1)} L${xb1.toFixed(1)},${yb.toFixed(1)} Z" fill="${(f + c) % 2 ? MADERA.oscura : MADERA.clara}"/>`;
    }
  }
  const dibujo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="cielo-tapa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4dabf7"/><stop offset=".55" stop-color="#d0ebff"/><stop offset="1" stop-color="#fff4e6"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#cielo-tapa)"/>
    ${D.nube(110, 300, 1.2)}${D.nube(500, 250, 0.9)}
    <path d="M0,520 C120,470 220,480 320,505 C420,530 500,470 600,490 L600,600 L0,600 Z" fill="#8ce99a"/>
    ${D.guarumo(80, 560, 1.15)}
    ${filas}
    ${D.perezoso(470, 360, 0.75)}
    ${D.pieza("t", "b", 95, 720, 0.6)}${D.pieza("c", "n", 505, 720, 0.6, { espejo: true })}
    ${D.pieza("p", "n", 380, 790, 1.15, { bufanda: true, espejo: true })}
    ${D.pieza("p", "b", 235, 815, 1.55, { mono: true })}
    ${D.estrella(60, 470, 10)}${D.estrella(560, 600, 8)}${D.estrella(330, 420, 7)}
  </svg>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(L.TITULO)}</title><style>
  ${FUENTES}
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; position: relative; }
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .fondo svg { width: 210mm; height: 297mm; display: block; }
  .titulo { position: absolute; left: 0; right: 0; top: 16mm; text-align: center; font-family: "Quicksand"; font-weight: 700; }
  .titulo h1 { margin: 0; font-size: 52pt; line-height: .98; color: #fff; -webkit-text-stroke: 1.2mm #a61e4d; paint-order: stroke fill; letter-spacing: .01em; }
  .titulo h1 .chico { display: block; font-size: 25pt; color: #fff3bf; -webkit-text-stroke: .9mm #1864ab; margin: 3mm 0; }
  .titulo p { margin: 5mm auto 0; display: inline-block; background: rgba(255,255,255,.9); color: #1864ab; border-radius: 99px; padding: 1.6mm 6mm; font-size: 13pt; }
  .autor { position: absolute; right: 12mm; bottom: 10mm; text-align: right; font-family: "Quicksand"; font-weight: 700; color: #fff; font-size: 17pt; text-shadow: 0 .6mm 1.6mm rgba(60,30,0,.75); }
  .autor img { display: block; width: 26mm; margin: 0 0 2mm auto; filter: drop-shadow(0 .5mm 1mm rgba(0,0,0,.4)); }
</style></head><body>
  <div class="fondo">${dibujo}</div>
  <div class="titulo"><h1>Peonita<span class="chico">y el reino de las</span>64 casillas</h1><p>${esc(L.SUBTITULO)}</p></div>
  <div class="autor"><img src="${LOGO}" alt="">${esc(L.AUTOR)}</div>
</body></html>`;
}

/* La marca de agua de los libros, más suave: acá va encima de ilustraciones
   de colores y a la opacidad de los otros libros ensuciaba los dibujos. */
const htmlMarca = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; }
  .sello { position: absolute; left: 52.5mm; top: 109mm; width: 105mm; transform: rotate(-15deg); opacity: .07; }
  .sello img { display: block; width: 105mm; height: auto; }
</style>
</head><body><div class="sello"><img src="${LOGO_MARCA}" alt=""></div></body></html>`;

/* ---------------------------------------------------------- accesible */
/* Sin una sola imagen: cada dibujo se cuenta en palabras, cada posición
   pieza por pieza y cada jugada dicha («torre anna 8», no «Ta8»), que es como
   se entiende con lector de pantalla. */
function posicionEnPalabras(fen, extra) {
  const d = describir(fen);
  const partes = [];
  if (d.blancas) partes.push(`Piezas blancas: ${d.blancas}.`);
  if (d.negras) partes.push(`Piezas negras: ${d.negras}.`);
  if (!partes.length) partes.push("El tablero está vacío.");
  return `<p class="posicion"><strong>La posición.</strong> ${esc(partes.join(" "))}${extra ? " " + esc(extra) : ""}</p>`;
}

function preguntaAccesible(e) {
  if (e.tipo === "tableros") return "Imagina dos tableros: en el A, la casilla de abajo a la derecha es clara; en el B, es oscura. " + e.pregunta;
  if (e.tipo === "colorear") return "Con un tablero de papel o de verdad: " + e.pregunta;
  if (e.tipo === "unir") return "Di el nombre de cada pieza de tu juego de ajedrez: torre, caballo, alfil, dama, rey y peón. ¿Cuál es cuál?";
  if (e.tipo === "promesas") return e.pregunta + " " + L.PROMESAS.join(" ");
  if (e.tipo === "partida") return e.pregunta + " " + L.CONSEJOS_PARTIDA.join(" ");
  if (e.tipo === "puntos") return "¿Quién tiene más puntos? " + e.grupos.map((g) => `${g.nombre} tiene: ${lista([...g.piezas].map((x) => L.NOMBRE[x]))}.`).join(" ");
  if (e.tipo === "cambio") return `Das ${nombreCorto(e.das)} y recibes ${nombreCorto(e.recibes)}. ¿Es un buen cambio?`;
  if (e.tipo === "suma") return "¿Cuántos puntos suman todas las piezas de un bando, sin el rey? Son 8 peones, 2 caballos, 2 alfiles, 2 torres y la dama.";
  const { q } = preguntaDe(e);
  const marcas = [];
  if (e.casilla && ["contar", "comer", "destinos", "color", "saltos", "corona"].includes(e.tipo)) marcas.push(`La pieza de la pregunta está en ${e.casilla}.`);
  const estrellas = e.estrellas || (e.meta ? [e.meta] : []);
  if (estrellas.length) marcas.push(`La estrella está en ${lista(estrellas)}.`);
  return q.replace(" de la casilla amarilla", "").replace(" Enciérrala en un círculo.", "").replace("Marca con una ✗ las casillas adonde", "¿A qué casillas").replace(". Si no se puede mover, escribe «ninguna».", "? Si no se puede mover, di «ninguna».") +
    (marcas.length ? " " + marcas.join(" ") : "") +
    ({ salida: " ¿Huir, tapar o comer?", final: " ¿Jaque mate, ahogado o ninguno?" }[e.tipo] || "");
}

function accesible() {
  const capitulos = L.CAPITULOS.map((c) => `<section>
    <h2>Capítulo ${c.n}. ${esc(c.titulo)}</h2>
    <p class="dibujo"><strong>El dibujo.</strong> ${esc(c.escena.alt)}</p>
    ${c.cuento.map((t) => `<p>${esc(t)}</p>`).join("")}
    ${c.muestras.map((m) => `<div class="diagrama"><p><strong>Diagrama.</strong> ${esc(m.pie)}</p>${posicionEnPalabras(m.fen, m.casilla ? `Puede ir a: ${lista(destinos(m.fen, m.casilla))}.` : "")}</div>`).join("")}
    <h3>Lo que aprendí</h3><ul>${c.aprendi.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    <h3>¡A jugar!</h3><ol>${c.ejercicios.map((e) => `<li>${e.fen ? posicionEnPalabras(e.fen) : ""}<p>${esc(preguntaAccesible(e))}</p></li>`).join("")}</ol>
  </section>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Peonita y el reino de las 64 casillas — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.2rem; line-height: 1.8; }
  h1 { font-size: 2rem; line-height: 1.25; }
  h2 { font-size: 1.5rem; margin-top: 2.8rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.15rem; margin: 1.6rem 0 .3rem; font-family: system-ui, sans-serif; }
  .dibujo, .posicion { background: #f1f5f8; padding: .7rem .9rem; }
  ol > li { margin-bottom: 1rem; }
  footer { margin-top: 3rem; border-top: 1px solid #c9d4de; padding-top: 1rem; font-size: 1rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #10202e; color: #eef3f7; }
    h2 { border-color: #eef3f7; }
    .dibujo, .posicion { background: #1b3145; }
    footer { border-color: #3b5165; }
  }
</style>
</head><body>
<h1>${esc(L.TITULO)}</h1>
<p>${esc(L.SUBTITULO)}, de ${esc(L.AUTOR)}. Es el mismo libro que el PDF, escrito para leerse con lector de pantalla
o con la letra agrandada: cada dibujo va contado en palabras, cada posición pieza por pieza y no hay ninguna imagen.
Las casillas se nombran con una letra de la a a la h, que dice la columna, y un número del 1 al 8, que dice la fila.</p>
<h2>Para las familias y el personal docente</h2>
${L.NOTA_ADULTOS.map((t) => `<p>${esc(t)}</p>`).join("")}
<h2>Dedicatoria</h2>
<p>${L.DEDICATORIA.map(esc).join("<br>")}</p>
<h2>Hola, soy Peonita</h2>
<p class="dibujo"><strong>El dibujo.</strong> ${esc(PRES.escena.alt)}</p>
${PRES.parrafos.map((t) => `<p>${esc(t)}</p>`).join("")}
${capitulos}
<h2>¡Ya sabes jugar ajedrez!</h2>
<p class="dibujo"><strong>El dibujo.</strong> ${esc(escenaFinal.alt)}</p>
${L.FINAL.map((t) => `<p>${esc(t)}</p>`).join("")}
<h2>Soluciones</h2>
${L.CAPITULOS.map((c) => `<h3>Capítulo ${c.n}. ${esc(c.titulo)}</h3><ol>${c.ejercicios.map((e) => `<li>${esc(N.textoHablado(solucion(e), "espanol"))}</li>`).join("")}</ol>`).join("")}
<footer><p>${esc(L.AUTOR)} · Academia Ajedrez Integral · ${ANIO}.</p></footer>
</body></html>`;
}

/* ---------------------------------------------------------- generar */
fs.mkdirSync(CARPETA, { recursive: true });
const tmp = os.tmpdir();
const htmlCuerpo = path.join(tmp, "peonita-cuerpo.html");
const htmlTapa = path.join(tmp, "peonita-tapa.html");
const htmlSello = path.join(tmp, "peonita-marca.html");
fs.writeFileSync(htmlCuerpo, html);
fs.writeFileSync(htmlTapa, tapa());
fs.writeFileSync(htmlSello, htmlMarca);
const destinoAccesible = path.join(CARPETA, "peonita-accesible.html");
fs.writeFileSync(destinoAccesible, accesible());
console.log(`Maqueta: ${htmlCuerpo}\nAccesible: ${destinoAccesible}`);
console.log(`${L.CAPITULOS.length} capítulos · ${L.CAPITULOS.reduce((s, c) => s + c.ejercicios.length, 0)} ejercicios`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(CARPETA, "peonita.pdf");
  const pdfTapa = path.join(tmp, "peonita-tapa.pdf");
  const pdfCuerpo = path.join(tmp, "peonita-cuerpo.pdf");
  const pdfMarca = path.join(tmp, "peonita-marca.pdf");
  const sinMargen = { top: 0, bottom: 0, left: 0, right: 0 };

  const pTapa = await navegador.newPage();
  await pTapa.goto("file://" + htmlTapa, { waitUntil: "load" });
  await pTapa.evaluate(() => document.fonts.ready);
  await pTapa.pdf({ path: pdfTapa, format: "A4", printBackground: true, margin: sinMargen });

  const pMarca = await navegador.newPage();
  await pMarca.goto("file://" + htmlSello, { waitUntil: "load" });
  await pMarca.pdf({ path: pdfMarca, format: "A4", printBackground: true, margin: sinMargen });

  const pagina = await navegador.newPage();
  await pagina.goto("file://" + htmlCuerpo, { waitUntil: "load" });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.pdf({
    path: pdfCuerpo, format: "A4", printBackground: true,
    margin: { top: "14mm", bottom: "15mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#7a5c3e;font-family:Arial,sans-serif;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;"><span>Peonita y el reino de las 64 casillas</span><span style="font-weight:700;">${esc(L.AUTOR)}</span><span class="pageNumber"></span></div>`,
  });
  await navegador.close();
  unir(pdfTapa, pdfCuerpo, pdfMarca, destino);
  proteger(destino, {
    clave: CLAVE_PROPIETARIO, autor: L.AUTOR, imprimir: true,
    titulo: "Peonita y el reino de las 64 casillas",
    asunto: "Cuento para que ninas y ninos aprendan a jugar ajedrez",
  });
  console.log("PDF listo:", destino);
})();
