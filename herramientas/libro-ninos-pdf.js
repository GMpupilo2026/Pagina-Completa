/* ===== Los cuentos de Peonita, de Oscar Angulo Cubero =====
 *
 * Libros para que niñas y niños de 4 a 8 años aprendan ajedrez con un cuento:
 * Peonita, un peón blanco, y su amigo Tizón aprenden con Don Lento, un
 * perezoso del guarumo. Cada capítulo trae su ilustración, el cuento, «Lo que
 * aprendí» y una página de «¡A jugar!»; al final, el diploma y las soluciones.
 *
 * Cada libro es un módulo de herramientas/libro-ninos/ (la lista está en
 * libros.js) con su cuento, sus ejercicios y respuestas, su tapa y sus
 * secretos; los dibujos están en dibujos.js. Este script los pone en papel,
 * todos con la MISMA maqueta: material/<slug>/<slug>.pdf,
 * <slug>-accesible.html, y <slug>-adaptado.pdf y <slug>-adaptado.docx (letra
 * grande y listos para lector de pantalla, para quien ve poco o no ve). Las respuestas las comprueba verificar-libro-ninos.js.
 *
 * Se cierra como los otros libros (tapa a página completa, marca de agua con
 * el logo, firma del autor y PDF protegido: herramientas/lib/pdf-armar.js),
 * pero SE DEJA IMPRIMIR: las páginas de «¡A jugar!» se pintan y se escriben
 * con lápiz.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/libro-ninos-pdf.js                   # todos los libros
 *     node herramientas/libro-ninos-pdf.js peonita-trucos    # uno solo, por su slug
 *     node herramientas/libro-ninos-pdf.js --solo-accesible   # sin PDF ni pypdf
 *     node herramientas/libro-ninos-pdf.js --solo-adaptado    # solo los adaptados (PDF y Word)
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
const { unir, proteger, datosAdaptado } = require("./lib/pdf-armar.js");
const N = require("./lib/notacion.js");
const D = require("./libro-ninos/dibujos.js");
const LIBROS = require("./libro-ninos/libros.js");

const RAIZ = path.join(__dirname, "..");
/* El libro que se está armando. Las funciones de abajo lo leen de acá: se
   arma uno por vez. */
let L;
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
    destacar: o.casilla ? [o.casilla] : [], estrellas: o.estrellas || [], flechas: o.flechas || [],
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
    case "gana": return { q: e.pregunta || "Juegan las blancas. ¿Qué jugada hace el truco?", a: LINEA() };
    case "amenaza": return { q: e.pregunta || "Le toca a Peonita, pero antes mira: ¿qué jugada quiere hacer Tizón?", a: LINEA() };
    case "mate2": return { q: e.pregunta || "Juegan las blancas y dan jaque mate en dos jugadas. ¿Cuál es la primera?", a: LINEA("1.ª jugada:") };
    case "elige": {
      const [x, y] = Object.keys(e.opciones);
      return { q: e.pregunta || `Juegan las blancas. Una de estas jugadas da jaque mate y la otra ahoga al rey. ¿Cuál da mate: ${x} o ${y}?`, a: `<p class="opciones">${Object.keys(e.opciones).map((j) => `<span class="caja-op">${esc(j)}</span>`).join("")}</p>` };
    }
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
  if (e.solucion) return e.solucion;
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
      return `${e.respuesta}: ${pieza} va a ${e.respuesta.slice(-2)} y da jaque mate.` + expl;
    }
    case "final": return { mate: "Jaque mate.", ahogado: "Ahogado: la partida termina en tablas.", ninguno: "Ninguno de los dos: la partida sigue." }[e.respuesta] + expl;
    case "enroque": return (e.respuesta ? "Sí." : "No.") + expl;
    case "puntos": {
      const sum = (g) => [...g.piezas].reduce((s, x) => s + L.VALOR[x], 0);
      return `${e.respuesta}. ` + e.grupos.map((g) => `${g.nombre} tiene ${sum(g)} puntos`).join(" y ") + ".";
    }
    case "cambio": return `${conMayuscula(e.respuesta)}: das ${L.VALOR[e.das]} puntos y recibes ${L.VALOR[e.recibes]}.`;
    case "suma": return `${e.respuesta} puntos: 8 peones (8), 2 caballos (6), 2 alfiles (6), 2 torres (10) y la dama (9).`;
    case "gana": return `${e.respuesta}.` + expl;
    case "amenaza": return `Tizón quiere jugar ${e.respuesta}.` + expl;
    case "mate2": return `${e.respuesta}.` + expl;
    case "elige": return `${e.respuesta} da jaque mate.` + expl;
    default: return e.respuesta;
  }
}

/* ---------------------------------------------------------- el libro */
function parrafo(t) {
  const dialogo = /^—/.test(t);
  return `<p class="${dialogo ? "dialogo" : ""}">${esc(t)}</p>`;
}

function muestraHTML(m) {
  return `<figure class="muestra"><div class="diag">${diagrama(m.fen, { casilla: m.casilla, mostrar: !!m.casilla, flechas: m.flechas, titulo: m.pie })}</div><figcaption>${esc(m.pie)}</figcaption></figure>`;
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
  .diploma .firmas { margin-top: auto; padding-top: 14mm; display: flex; justify-content: space-between; gap: 12mm; font-size: 11pt; }
  .diploma .firmas div { flex: 1; border-top: 1.5px solid #5b4636; padding-top: 2mm; }
  .diploma .firmas strong { font-family: "Quicksand"; display: block; font-size: 12pt; }
  /* La firma de los personajes va arriba de la línea, como hecha a mano; abajo,
     el nombre impreso. El autor va aparte, abajo al centro con el logo: el
     logo es el gris de la marca de agua, porque el crema no se ve sobre el
     fondo crema del diploma. */
  .diploma .firma-mano { display: block; font-family: "Comic Neue"; font-weight: 700; font-style: italic; font-size: 16pt; color: #1864ab; margin: -11mm 0 3mm; transform: rotate(-5deg); white-space: nowrap; }
  .diploma .autoria { display: flex; align-items: center; justify-content: center; gap: 2.5mm; margin-top: 7mm; font-family: "Quicksand"; font-weight: 700; font-size: 9.5pt; color: #7a5c3e; }
  .diploma .autoria img { width: 11mm; height: auto; }
  /* La colección: cada diploma con su número y su medalla, la de este libro
     en grande sobre el dibujo, y abajo la fila con todas (la de este libro
     resaltada) y un «?» para el próximo. */
  .diploma .medalla-grande { position: absolute; top: 6mm; right: 8mm; width: 26mm; transform: rotate(8deg); }
  .diploma .medalla-grande svg { width: 26mm; height: auto; }
  .diploma .coleccion-n { font-family: "Quicksand"; font-weight: 700; font-size: 11pt; color: #9a4f00; letter-spacing: .04em; text-transform: uppercase; margin: 5mm 0 0; }
  .diploma .coleccion { display: flex; align-items: flex-end; justify-content: center; gap: 3mm; margin-top: 6mm; font-family: "Quicksand"; font-weight: 700; font-size: 9.5pt; color: #5b4636; }
  .diploma .coleccion-t { align-self: center; margin-right: 1mm; }
  .diploma .coleccion figure { margin: 0; text-align: center; font-size: 7.5pt; line-height: 1.15; width: 18mm; }
  .diploma .coleccion figure svg { width: 9mm; height: auto; margin: 0 auto 1mm; }
  .diploma .coleccion figure.esta svg { width: 12mm; }
  .diploma .coleccion figure.esta { color: #a61e4d; }
`;

/* La fila de «Mi colección» del diploma: un lugar por libro de libros.js, en
   orden, y uno más con «?» para el próximo cuento. */
function coleccion() {
  return LIBROS.map((l) => `<figure class="${l === L ? "esta" : ""}">${D.medalla(l.DIPLOMA.medalla)}<figcaption>n.º ${l.DIPLOMA.numero}<br>${esc(l.DIPLOMA.nombre)}</figcaption></figure>`).join("") +
    `<figure>${D.medalla("?", { apagada: true })}<figcaption>n.º ${LIBROS.length + 1}<br>¡El próximo!</figcaption></figure>`;
}

function soluciones() {
  return `<section class="soluciones"><h2>Soluciones</h2>
    <p>Para leerlas con un adulto después de intentarlo. Las casillas se nombran con su letra y su número.</p>
    ${L.CAPITULOS.map((c) => `<h3>Capítulo ${c.n} · ${esc(c.titulo)}</h3><ol>${c.ejercicios.map((e) => `<li>${esc(solucion(e))}</li>`).join("")}</ol>`).join("")}
  </section>`;
}

function cuerpo() {
  const PRES = L.PRESENTACION;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(L.TITULO)}</title><style>${ESTILO}</style></head><body>
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
  <li><span class="n">★</span>Mi diploma n.º ${L.DIPLOMA.numero}: ${esc(L.DIPLOMA.nombre)}</li><li><span class="n">✓</span>Soluciones</li></ol>
</section>
${L.CAPITULOS.map(capituloHTML).join("")}
<section class="capitulo final">
  <header class="cab-cap"><span class="insignia">Fin</span><h2>${esc(L.FINAL_TITULO)}</h2></header>
  <div class="ilustracion">${D.escena(L.ESCENA_FINAL)}</div>
  ${L.FINAL.map((t) => `<p>${esc(t)}</p>`).join("")}
</section>
<section class="diploma">
  <div class="dibujo">${D.escena(L.ESCENA_DIPLOMA)}</div>
  <div class="medalla-grande">${D.medalla(L.DIPLOMA.medalla)}</div>
  <p class="coleccion-n">Colección de diplomas de Peonita · Diploma n.º ${L.DIPLOMA.numero}</p>
  <h2>${esc(L.DIPLOMA.nombre)}</h2>
  <p class="sub">${esc(L.DIPLOMA.sub)}</p>
  <div class="nombre"></div>
  <p class="texto">${L.DIPLOMA.texto.map(esc).join("<br>")}</p>
  <div class="firmas"><div><strong>Fecha</strong></div><div><span class="firma-mano">${esc(L.DIPLOMA.firmaMano)}</span><strong>${esc(L.DIPLOMA.firma)}</strong></div></div>
  <div class="coleccion"><span class="coleccion-t">Mi colección:</span>${coleccion()}</div>
  <div class="autoria"><img src="${LOGO_MARCA}" alt="">${esc(L.AUTOR)}</div>
</section>
${soluciones()}
</body></html>`;
}

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
    ${L.TAPA.dibujo}
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
  <div class="titulo"><h1>${esc(L.TAPA.arriba)}<span class="chico">${esc(L.TAPA.medio)}</span>${esc(L.TAPA.abajo)}</h1><p>${esc(L.SUBTITULO)}</p></div>
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
  const PRES = L.PRESENTACION;
  const capitulos = L.CAPITULOS.map((c) => `<section>
    <h2>Capítulo ${c.n}. ${esc(c.titulo)}</h2>
    <p class="dibujo"><strong>El dibujo.</strong> ${esc(c.escena.alt)}</p>
    ${c.cuento.map((t) => `<p>${esc(t)}</p>`).join("")}
    ${c.muestras.map((m) => `<div class="diagrama"><p><strong>Diagrama.</strong> ${esc(N.textoHablado(m.pie, "espanol"))}</p>${posicionEnPalabras(m.fen, [
      m.casilla ? `Puede ir a: ${lista(destinos(m.fen, m.casilla))}.` : "",
      m.flechas && m.flechas.length ? `${m.flechas.length === 1 ? "La flecha va" : "Las flechas van"} ${lista(m.flechas.map(([x, y]) => `de ${x} a ${y}`))}.` : "",
    ].filter(Boolean).join(" "))}</div>`).join("")}
    <h3>Lo que aprendí</h3><ul>${c.aprendi.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    <h3>¡A jugar!</h3><ol>${c.ejercicios.map((e) => `<li>${e.fen ? posicionEnPalabras(e.fen) : ""}<p>${esc(N.textoHablado(preguntaAccesible(e), "espanol"))}</p></li>`).join("")}</ol>
  </section>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(L.TITULO)} — versión accesible</title>
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
<h2>${esc(PRES.titulo)}</h2>
<p class="dibujo"><strong>El dibujo.</strong> ${esc(PRES.escena.alt)}</p>
${PRES.parrafos.map((t) => `<p>${esc(t)}</p>`).join("")}
${capitulos}
<h2>${esc(L.FINAL_TITULO)}</h2>
<p class="dibujo"><strong>El dibujo.</strong> ${esc(L.ESCENA_FINAL.alt)}</p>
${L.FINAL.map((t) => `<p>${esc(t)}</p>`).join("")}
<h2>Soluciones</h2>
${L.CAPITULOS.map((c) => `<h3>Capítulo ${c.n}. ${esc(c.titulo)}</h3><ol>${c.ejercicios.map((e) => `<li>${esc(N.textoHablado(solucion(e), "espanol"))}</li>`).join("")}</ol>`).join("")}
<footer><p>${esc(L.AUTOR)} · Academia Ajedrez Integral · ${ANIO}.</p></footer>
</body></html>`;
}

/* ---------------------------------------------------------- adaptado */
/* La versión ADAPTADA, para quien ve poco o no ve, en PDF y en Word: el mismo
   libro con letra grande, negro sobre blanco, un tablero grande por página y
   todo escrito. El contenido se arma UNA vez, como una lista de bloques
   (bloquesAdaptado), y de ahí salen los dos formatos: adaptadoHTML() para el
   PDF (Chromium) y adaptadoDocx() para el Word. Si cada formato armara su
   propio contenido, el primer arreglo en uno dejaría al otro atrás.

   Los dibujos y los tableros van escondidos del lector de pantalla
   (aria-hidden en el PDF, «decorativo» en el Word) porque al lado está escrito
   lo que muestran —el dibujo contado, la posición pieza por pieza—: con el
   texto alternativo además, el lector lo diría dos veces. El que ve poco mira
   el tablero grande; el que no ve, oye el texto. Sin marca de agua ni
   cifrado: las dos cosas estorban a la lupa y al lector. */
const NEGRO = "#000", AZUL = "#0b2e6b"; // 21:1 y 13,4:1 contra el blanco
/* Los tableros del adaptado: las casillas oscuras más oscuras que la madera
   del libro, para que la pieza blanca se recorte, y el borde casi negro. Los
   puntos (#0b4a1f) siguen dando más de 3:1 contra las dos casillas. */
const MADERA_ADAPTADA = { clara: "#fbf1dc", oscura: "#b07f4f", borde: "#2b1a0b", marca: "#ffd43b" };
/* El ancho de cada dibujo en la página, en mm (A4 con 18 mm de margen: caben
   174). El tablero de un ejercicio es menor que el de un diagrama para que la
   pregunta y la raya de la respuesta quepan en la misma hoja. */
const ANCHO = { dibujo: 174, diagrama: 150, ejercicio: 108, dos: 166, colorear: 165, medalla: 60 };

function diagramaAdaptado(fen, o) {
  const extra = {};
  if (o.casilla && o.mostrar) {
    const mov = new Chess(fen).moves({ square: o.casilla, verbose: true });
    extra.puntos = [...new Set(mov.filter((m) => !m.captured).map((m) => m.to))];
    extra.capturas = [...new Set(mov.filter((m) => m.captured).map((m) => m.to))];
  }
  return tablero(fen, Object.assign({
    colores: MADERA_ADAPTADA, coordenadas: true, titulo: "Diagrama",
    destacar: o.casilla ? [o.casilla] : [], estrellas: o.estrellas || [], flechas: o.flechas || [],
  }, extra));
}

/* La posición en palabras, como texto (posicionEnPalabras la da en HTML). */
function posicionTexto(fen, extra) {
  const d = describir(fen);
  const partes = [];
  if (d.blancas) partes.push(`Piezas blancas: ${d.blancas}.`);
  if (d.negras) partes.push(`Piezas negras: ${d.negras}.`);
  if (!partes.length) partes.push("El tablero está vacío.");
  return partes.join(" ") + (extra ? " " + extra : "");
}

/* Los bloques. Cada uno es { t, … }:
     h       { nivel 1–4, texto }
     p       { texto, fuerte }                 un párrafo (fuerte: en negrita)
     cuadro  { lead, texto }                   un párrafo con marco
     lista   { items, ordenada }
     verso   { lineas }                        renglones de un poema
     img     { html, ancho, clase }            un dibujo, escondido del lector
     raya    { antes, ancho }                  para escribir la respuesta
     grupo   { clase, salto, hijos }           lo que va junto (salto: en hoja nueva)
   El texto va crudo: cada formato lo escapa a su manera. */
const h = (nivel, texto) => ({ t: "h", nivel, texto });
const p = (texto, fuerte) => ({ t: "p", texto, fuerte: !!fuerte });
const cuadro = (lead, texto) => ({ t: "cuadro", lead, texto });
const listaB = (items, ordenada) => ({ t: "lista", items, ordenada: !!ordenada });
const img = (html, ancho, clase) => ({ t: "img", html, ancho, clase });
const grupo = (clase, salto, hijos) => ({ t: "grupo", clase, salto: !!salto, hijos });
const hab = (t) => N.textoHablado(t, "espanol");
const dibujoB = (def) => [img(D.escena(def), ANCHO.dibujo, "dibujo-a"), cuadro("El dibujo.", def.alt)];

function ejercicioB(e, num) {
  const hijos = [h(4, `Ejercicio ${num}`)];
  // Las promesas y los consejos van en lista, uno por renglón, y no pegados a
  // la pregunta como en la versión accesible: en letra grande, un párrafo así
  // ocupa media página y no se sabe dónde termina cada uno.
  if (e.tipo === "promesas" || e.tipo === "partida") {
    hijos.push(p(e.pregunta, true), listaB(e.tipo === "promesas" ? L.PROMESAS : L.CONSEJOS_PARTIDA));
    return grupo("ej-a", true, hijos);
  }
  if (e.fen) {
    hijos.push(img(diagramaAdaptado(e.fen, {
      casilla: ["contar", "comer", "destinos", "color", "saltos", "corona"].includes(e.tipo) ? e.casilla : null,
      estrellas: e.estrellas || (e.meta ? [e.meta] : []),
    }), ANCHO.ejercicio, "tablero-a"), cuadro("La posición.", posicionTexto(e.fen)));
  } else if (e.tipo === "tableros") {
    hijos.push(img(`<div class="dos-a"><figure>${tableroVacio(true)}<figcaption>A</figcaption></figure><figure>${tableroVacio(false)}<figcaption>B</figcaption></figure></div>`, ANCHO.dos, "dos-a-caja"));
  } else if (e.tipo === "colorear") {
    hijos.push(img(tableroColorear(), ANCHO.colorear, "colorear-a"));
  }
  hijos.push(p(hab(preguntaAccesible(e)), true));
  if (e.tipo !== "colorear") hijos.push({ t: "raya", antes: "Mi respuesta:" });
  return grupo("ej-a", true, hijos);
}

function bloquesAdaptado() {
  const PRES = L.PRESENTACION;
  const B = [];
  B.push(grupo("portada", false, [
    h(1, L.TITULO),
    p(L.SUBTITULO, true),
    p(`De ${L.AUTOR}. Academia Ajedrez Integral, Costa Rica, ${ANIO}.`),
    cuadro("Versión adaptada.", "Es el mismo libro, hecho para quien ve poco o no ve: letra grande, negro sobre blanco, un tablero grande en cada página y todo escrito, para leerlo con lupa o con lector de pantalla. Cada dibujo va contado en palabras y cada posición, pieza por pieza."),
    p("Las casillas se nombran con una letra de la a a la h, que dice la columna, y un número del 1 al 8, que dice la fila. En los tableros, la casilla de la pregunta va pintada de amarillo, los puntos dicen adónde puede ir la pieza y el aro, qué puede comer."),
    p("Las jugadas van escritas como se dicen en voz alta, con un nombre para cada letra: anna, bella, cesar, david, eva, felix, gustav y hector. «Torre anna 8» quiere decir que la torre va a la casilla a8."),
    p(`© ${ANIO} ${L.AUTOR}. Todos los derechos reservados. Este libro se puede imprimir para usarlo en casa o en la clase.`),
  ]));
  B.push(grupo("pagina", true, [
    h(2, "Los capítulos"),
    listaB(L.CAPITULOS.map((c) => c.titulo), true),
    p(`Al final: ${L.FINAL_TITULO}, el diploma n.º ${L.DIPLOMA.numero} («${L.DIPLOMA.nombre}») y las soluciones.`),
  ]));
  B.push(grupo("pagina", true, [h(2, "Para las familias y el personal docente"), ...L.NOTA_ADULTOS.map((t) => p(t)), p(L.AUTOR)]));
  B.push(grupo("pagina", true, [h(2, "Dedicatoria"), { t: "verso", lineas: L.DEDICATORIA }]));
  B.push(grupo("pagina", true, [h(2, PRES.titulo), ...dibujoB(PRES.escena), ...PRES.parrafos.map((t) => p(t))]));
  L.CAPITULOS.forEach((c) => {
    B.push(grupo("cap-a", true, [
      h(2, `Capítulo ${c.n}. ${c.titulo}`),
      ...dibujoB(c.escena),
      ...c.cuento.map((t) => p(t)),
      ...c.muestras.map((m) => grupo("muestra-a", true, [
        h(3, "Diagrama"),
        img(diagramaAdaptado(m.fen, { casilla: m.casilla, mostrar: !!m.casilla, flechas: m.flechas }), ANCHO.diagrama, "tablero-a"),
        p(hab(m.pie), true),
        cuadro("La posición.", posicionTexto(m.fen, [
          m.casilla ? `Puede ir a: ${lista(destinos(m.fen, m.casilla))}.` : "",
          m.flechas && m.flechas.length ? `${m.flechas.length === 1 ? "La flecha va" : "Las flechas van"} ${lista(m.flechas.map(([x, y]) => `de ${x} a ${y}`))}.` : "",
        ].filter(Boolean).join(" "))),
      ])),
      grupo("aprendi-a", false, [h(3, "Lo que aprendí"), listaB(c.aprendi)]),
    ]));
    B.push(grupo("jugar-a", true, [
      h(3, `¡A jugar! Capítulo ${c.n}`),
      // El primer ejercicio va debajo del título, sin hoja nueva.
      ...c.ejercicios.map((e, i) => Object.assign(ejercicioB(e, i + 1), i ? {} : { salto: false })),
    ]));
  });
  B.push(grupo("final-a", true, [h(2, L.FINAL_TITULO), ...dibujoB(L.ESCENA_FINAL), ...L.FINAL.map((t) => p(t))]));
  B.push(grupo("diploma-a", true, [
    h(2, `Diploma n.º ${L.DIPLOMA.numero}: ${L.DIPLOMA.nombre}`),
    img(D.medalla(L.DIPLOMA.medalla), ANCHO.medalla, "medalla-a"),
    p(L.DIPLOMA.sub, true),
    { t: "raya", antes: "Nombre:" },
    p(L.DIPLOMA.texto.join(" ")),
    p(`Firman: ${L.DIPLOMA.firma}.`),
    { t: "raya", antes: "Fecha:" },
    p(`Es el diploma n.º ${L.DIPLOMA.numero} de la colección de Peonita. La colección: ${lista(LIBROS.map((l) => `n.º ${l.DIPLOMA.numero}, «${l.DIPLOMA.nombre}»`))}.`),
  ]));
  B.push(grupo("soluciones-a", true, [
    h(2, "Soluciones"),
    p("Para leerlas con una persona adulta después de intentarlo."),
    ...L.CAPITULOS.flatMap((c) => [h(3, `Capítulo ${c.n}. ${c.titulo}`), listaB(c.ejercicios.map((e) => hab(solucion(e))), true)]),
  ]));
  return B;
}

/* ---- el PDF: los bloques en HTML, que Chromium etiqueta */
function bloqueHTML(b) {
  switch (b.t) {
    case "h": return `<h${b.nivel}>${esc(b.texto)}</h${b.nivel}>`;
    case "p": return `<p${b.fuerte ? ' class="fuerte"' : ""}>${esc(b.texto)}</p>`;
    case "cuadro": return `<p class="cuadro"><strong>${esc(b.lead)}</strong> ${esc(b.texto)}</p>`;
    case "lista": { const e = b.ordenada ? "ol" : "ul"; return `<${e}>${b.items.map((t) => `<li>${esc(t)}</li>`).join("")}</${e}>`; }
    case "verso": return `<p>${b.lineas.map(esc).join("<br>")}</p>`;
    case "img": return `<div class="img-a ${b.clase}" style="width:${b.ancho}mm" aria-hidden="true">${b.html}</div>`;
    case "raya": return `<p class="resp">${esc(b.antes)} <span class="raya-a"></span></p>`;
    case "grupo": return `<section class="${b.clase}${b.salto ? " salto" : ""}">${b.hijos.map(bloqueHTML).join("\n")}</section>`;
  }
  throw new Error("Bloque desconocido: " + b.t);
}

function estiloAdaptado() {
  const f = (peso, archivo, rango) => `@font-face { font-family: "Atkinson"; font-weight: ${peso}; src: url("${incrustar("fonts/" + archivo, "font/woff2")}") format("woff2");${rango ? " unicode-range: U+0100-024F, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;" : ""} }`;
  return `${FUENTES}
  ${f(400, "atkinson-hyperlegible-400-latin.woff2")}
  ${f(400, "atkinson-hyperlegible-400-latin-ext.woff2", true)}
  ${f(700, "atkinson-hyperlegible-700-latin.woff2")}
  ${f(700, "atkinson-hyperlegible-700-latin-ext.woff2", true)}
  @page { size: A4; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #fff; color: ${NEGRO}; font-family: "Atkinson", Verdana, sans-serif; font-size: 20pt; line-height: 1.5; letter-spacing: .01em; }
  p, li { margin: 0 0 5mm; text-align: left; hyphens: none; }
  ul, ol { padding-left: 16mm; margin: 0 0 5mm; }
  h1, h2, h3, h4 { color: ${AZUL}; line-height: 1.2; font-weight: 700; break-after: avoid; }
  h1 { font-size: 36pt; margin: 25mm 0 8mm; }
  h2 { font-size: 30pt; margin: 0 0 8mm; padding-bottom: 3mm; border-bottom: 1.5mm solid ${AZUL}; }
  h3 { font-size: 25pt; margin: 9mm 0 5mm; }
  h4 { font-size: 23pt; margin: 0 0 5mm; }
  .fuerte { font-weight: 700; }
  .portada > .fuerte:nth-child(2) { font-size: 24pt; }
  .salto { break-before: page; }
  .cuadro { border: 1mm solid ${NEGRO}; padding: 4mm 5mm; border-radius: 3mm; }
  .img-a { margin: 0 auto 6mm; break-inside: avoid; }
  .img-a > svg, .img-a .dos-a svg { width: 100%; height: auto; display: block; }
  .dos-a { display: flex; gap: 16mm; justify-content: center; }
  .dos-a figure { margin: 0; text-align: center; flex: 1; }
  .dos-a figcaption { font-size: 26pt; font-weight: 700; }
  .muestra-a > h3, .jugar-a > h3 { margin-top: 0; }
  .jugar-a > h3 { font-size: 30pt; margin-bottom: 6mm; }
  .aprendi-a { border: 1.5mm solid ${AZUL}; border-radius: 4mm; padding: 2mm 7mm 3mm; margin-top: 8mm; break-inside: avoid; }
  .aprendi-a h3 { margin-top: 4mm; }
  .ej-a { break-inside: avoid; }
  .resp { display: flex; align-items: flex-end; gap: 4mm; margin-top: 8mm; }
  .raya-a { flex: 1; border-bottom: 1mm solid ${NEGRO}; height: 14mm; }
  .soluciones-a ol > li { margin-bottom: 4mm; }`;
}

function adaptadoHTML() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(L.TITULO)} — versión adaptada</title>
<style>${estiloAdaptado()}</style>
</head><body>
${bloquesAdaptado().map(bloqueHTML).join("\n")}
</body></html>`;
}

/* ---- el Word: los mismos bloques con la librería docx
   Lo accesible en Word: los títulos con los estilos Título 1–4 de Word (el
   panel de navegación y el lector de pantalla saltan de uno a otro), las
   listas con su numeración de verdad, el idioma español (Costa Rica) en todo
   el texto, el título del documento en sus propiedades y cada imagen marcada
   como DECORATIVA (el Comprobador de accesibilidad de Word no pide texto
   alternativo para una imagen decorativa, y el lector la salta). Letra
   Verdana a 18 pt: Atkinson Hyperlegible no viene en Windows ni en Mac, y una
   letra que la computadora no tiene se cambia por otra sin avisar; Verdana
   está en todas y es de las que se recomiendan para baja visión. Las
   imágenes se sacan de los mismos SVG, con Chromium, a 3 píxeles por píxel
   de CSS (unos 290 ppp): se imprimen nítidas. */
async function adaptadoDocx(navegador, destino) {
  const X = require("docx");
  const JSZip = require("jszip");
  const PT = (n) => n * 2; // docx mide la letra en medios puntos
  const MM = (n) => Math.round(n * 56.693); // y la página en veinteavos de punto
  const AZ = AZUL.slice(1), NE = "000000";
  const IDIOMA = { value: "es-CR" };
  const bloques = bloquesAdaptado();

  // Las imágenes: cada SVG en una página con el mismo estilo (las letras de
  // los dibujos), fotografiado a su ancho en la hoja.
  const pagina = await navegador.newPage({ deviceScaleFactor: 3 });
  const fotos = new Map();
  async function foto(b) {
    if (fotos.has(b)) return fotos.get(b);
    await pagina.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${estiloAdaptado()} body{margin:0} .img-a{margin:0}</style></head>
      <body><div id="x" class="img-a ${b.clase}" style="width:${b.ancho}mm">${b.html}</div></body></html>`, { waitUntil: "load" });
    await pagina.evaluate(() => document.fonts.ready);
    const caja = await pagina.locator("#x").boundingBox();
    const data = await pagina.locator("#x").screenshot({ type: "png", omitBackground: false });
    const r = { data, ancho: caja.width, alto: caja.height };
    fotos.set(b, r);
    return r;
  }

  const LETRA = "Verdana";
  const borde = (color, grosor) => ({ style: X.BorderStyle.SINGLE, size: grosor, color, space: 6 });
  const marco = (color, grosor) => ({ top: borde(color, grosor), left: borde(color, grosor), bottom: borde(color, grosor), right: borde(color, grosor) });
  const ANCHO_UTIL = MM(174);
  let instancia = 0;

  // Cada bloque da las OPCIONES de sus párrafos (no los párrafos): así un
  // grupo todavía puede soltar el «mantener con el siguiente» del último.
  // ctx: { salto, junto, marco } que el grupo le pasa a sus hijos.
  async function aParrafos(b, ctx) {
    const base = (extra) => Object.assign({
      pageBreakBefore: ctx.salto ? (ctx.salto = false, true) : undefined,
      keepNext: ctx.junto || undefined,
      keepLines: true,
      border: ctx.marco,
    }, extra);
    switch (b.t) {
      case "h": {
        const nivel = [null, X.HeadingLevel.HEADING_1, X.HeadingLevel.HEADING_2, X.HeadingLevel.HEADING_3, X.HeadingLevel.HEADING_4][b.nivel];
        return [(base({ heading: nivel, keepNext: true, children: [new X.TextRun(b.texto)] }))];
      }
      case "p": return [(base({ children: [new X.TextRun({ text: b.texto, bold: b.fuerte })] }))];
      case "cuadro": return [(base({ border: marco(NE, 12), children: [new X.TextRun({ text: b.lead + " ", bold: true }), new X.TextRun(b.texto)] }))];
      case "verso": return [(base({ children: b.lineas.map((t, i) => new X.TextRun({ text: t, break: i ? 1 : 0 })) }))];
      case "lista": {
        const inst = ++instancia;
        return b.items.map((t, i) => (base({
          keepNext: ctx.junto && i < b.items.length - 1 ? true : ctx.junto || undefined,
          numbering: { reference: b.ordenada ? "numeros" : "vinetas", level: 0, instance: b.ordenada ? inst : undefined },
          children: [new X.TextRun(t)],
        })));
      }
      case "img": {
        const f = await foto(b);
        return [(base({
          alignment: X.AlignmentType.CENTER, keepNext: true,
          children: [new X.ImageRun({ type: "png", data: f.data, transformation: { width: f.ancho, height: f.alto }, altText: { name: "Dibujo decorativo", title: "", description: "" } })],
        }))];
      }
      case "raya": return [(base({
        spacing: { before: 360 },
        tabStops: [{ type: X.TabStopType.RIGHT, position: ANCHO_UTIL }],
        children: [new X.TextRun(b.antes + " "), new X.TextRun({ text: "\t", underline: { type: X.UnderlineType.SINGLE, color: NE } })],
      }))];
      case "grupo": {
        const sub = { salto: b.salto || ctx.salto, junto: b.clase === "ej-a" || b.clase === "muestra-a" || b.clase === "aprendi-a" || ctx.junto, marco: ctx.marco };
        // «Lo que aprendí» va sin marco en el Word: Word une los bordes solo
        // entre párrafos con la misma sangría, y el título y la lista quedaban
        // en dos recuadros separados. El título solo ya lo distingue.
        ctx.salto = false;
        const salida = [];
        for (const hijo of b.hijos) salida.push(...await aParrafos(hijo, sub));
        // El último párrafo de un grupo no se ata al que sigue.
        if (sub.junto && !ctx.junto && salida.length) salida[salida.length - 1].keepNext = undefined;
        return salida;
      }
    }
    throw new Error("Bloque desconocido: " + b.t);
  }

  const hijos = [];
  for (const b of bloques) hijos.push(...await aParrafos(b, { salto: false, junto: false, marco: undefined }));
  const parrafos = hijos.map((o) => new X.Paragraph(o));
  await pagina.close();

  // El interlineado, siempre «automático» (múltiplo de la letra): sin decirlo,
  // LibreOffice lo toma como exacto, recorta cada imagen a la altura de un
  // renglón y encima los títulos de dos renglones.
  const AUTO = X.LineRuleType.AUTO;
  // Los títulos, en los estilos de Word (default.heading1…): con
  // paragraphStyles quedaban DOS estilos «Heading1», el de la librería y el
  // propio.
  const titulo = (tam) => ({
    run: { font: LETRA, size: PT(tam), bold: true, color: AZ, language: IDIOMA },
    paragraph: { spacing: { before: 240, after: 240, line: 276, lineRule: AUTO }, keepNext: true, keepLines: true },
  });
  const doc = new X.Document({
    title: L.TITULO + " — versión adaptada",
    subject: L.ASUNTO,
    creator: L.AUTOR,
    description: "Versión adaptada: letra grande, alto contraste y lista para lector de pantalla.",
    styles: {
      default: {
        document: { run: { font: LETRA, size: PT(18), color: NE, language: IDIOMA }, paragraph: { spacing: { after: 240, line: 360, lineRule: AUTO } } },
        heading1: titulo(32), heading2: titulo(26), heading3: titulo(22), heading4: titulo(20),
      },
    },
    numbering: {
      config: [
        { reference: "vinetas", levels: [{ level: 0, format: X.LevelFormat.BULLET, text: "•", alignment: X.AlignmentType.LEFT, style: { paragraph: { indent: { left: MM(12), hanging: MM(7) } } } }] },
        { reference: "numeros", levels: [{ level: 0, format: X.LevelFormat.DECIMAL, text: "%1.", alignment: X.AlignmentType.LEFT, style: { paragraph: { indent: { left: MM(14), hanging: MM(10) } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: MM(210), height: MM(297) }, margin: { top: MM(16), bottom: MM(20), left: MM(18), right: MM(18), footer: MM(8) } } },
      footers: {
        default: new X.Footer({ children: [new X.Paragraph({
          alignment: X.AlignmentType.CENTER,
          children: [new X.TextRun({ text: "Página ", size: PT(14) }), new X.TextRun({ children: [X.PageNumber.CURRENT], size: PT(14) }), new X.TextRun({ text: " de ", size: PT(14) }), new X.TextRun({ children: [X.PageNumber.TOTAL_PAGES], size: PT(14) })],
        })] }),
      },
      children: parrafos,
    }],
  });
  const buf = await X.Packer.toBuffer(doc);

  // Cada imagen, marcada como decorativa: la librería no lo trae, se agrega
  // a mano la extensión de Office 2019 que usa Word («Marcar como decorativa»).
  const zip = await JSZip.loadAsync(buf);
  const DEC = '<a:extLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>';
  let xml = await zip.file("word/document.xml").async("string");
  let decorativas = 0;
  xml = xml.replace(/<wp:docPr\b([^>]*?)(\/>|>([\s\S]*?)<\/wp:docPr>)/g, (todo, attrs, cierre, dentro) => {
    decorativas++;
    return `<wp:docPr${attrs}>${dentro || ""}${DEC}</wp:docPr>`;
  });
  // Los bordes de un párrafo, en el orden que pide el esquema de Word (top,
  // left, bottom, right). docx 9.7.1 los escribe top, bottom, left, right
  // los pida uno como los pida: Word lo abre igual, pero el archivo no valida.
  xml = xml.replace(/<w:pBdr>([\s\S]*?)<\/w:pBdr>/g, (todo, dentro) => {
    const lado = (n) => (dentro.match(new RegExp(`<w:${n}\\b[^>]*/>`)) || [""])[0];
    return `<w:pBdr>${["top", "left", "bottom", "right", "between", "bar"].map(lado).join("")}</w:pBdr>`;
  });
  zip.file("word/document.xml", xml);
  fs.writeFileSync(destino, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }));
  return { imagenes: fotos.size, decorativas };
}

/* ---------------------------------------------------------- generar */
const elegidos = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const aArmar = elegidos.length ? LIBROS.filter((l) => elegidos.includes(l.SLUG)) : LIBROS;
if (!aArmar.length) { console.error("No hay ningún libro con ese slug. Los libros: " + LIBROS.map((l) => l.SLUG).join(", ")); process.exit(1); }
const tmp = os.tmpdir();

function archivos(libro) {
  const carpeta = path.join(RAIZ, "material", libro.SLUG);
  return {
    carpeta,
    accesible: path.join(carpeta, libro.SLUG + "-accesible.html"),
    pdf: path.join(carpeta, libro.SLUG + ".pdf"),
    adaptado: path.join(carpeta, libro.SLUG + "-adaptado.pdf"),
    adaptadoDocx: path.join(carpeta, libro.SLUG + "-adaptado.docx"),
    htmlAdaptado: path.join(tmp, libro.SLUG + "-adaptado.html"),
    htmlCuerpo: path.join(tmp, libro.SLUG + "-cuerpo.html"),
    htmlTapa: path.join(tmp, libro.SLUG + "-tapa.html"),
    htmlSello: path.join(tmp, libro.SLUG + "-marca.html"),
  };
}

for (const libro of aArmar) {
  L = libro;
  const a = archivos(libro);
  fs.mkdirSync(a.carpeta, { recursive: true });
  fs.writeFileSync(a.htmlCuerpo, cuerpo());
  fs.writeFileSync(a.htmlTapa, tapa());
  fs.writeFileSync(a.htmlSello, htmlMarca);
  fs.writeFileSync(a.accesible, accesible());
  fs.writeFileSync(a.htmlAdaptado, adaptadoHTML());
  console.log(`${libro.TITULO}: ${libro.CAPITULOS.length} capítulos · ${libro.CAPITULOS.reduce((s, c) => s + c.ejercicios.length, 0)} ejercicios\n  Maqueta: ${a.htmlCuerpo}\n  Accesible: ${a.accesible}`);
}
if (process.argv.includes("--solo-accesible")) process.exit(0);
const soloAdaptado = process.argv.includes("--solo-adaptado");

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const sinMargen = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const libro of aArmar) {
    const a = archivos(libro);
    // El adaptado: etiquetado (tagged) y con marcadores (outline) para el
    // lector de pantalla; sin cifrar ni marca de agua. datosAdaptado() le pone
    // el idioma, el título que se muestra y los datos del documento.
    const pAdap = await navegador.newPage();
    await pAdap.goto("file://" + a.htmlAdaptado, { waitUntil: "load" });
    await pAdap.evaluate(() => document.fonts.ready);
    await pAdap.pdf({
      path: a.adaptado, format: "A4", printBackground: true, tagged: true, outline: true,
      margin: { top: "16mm", bottom: "20mm", left: "18mm", right: "18mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width:100%;font-size:14pt;color:#000;font-family:Verdana,sans-serif;text-align:center;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
    });
    await pAdap.close();
    datosAdaptado(a.adaptado, { titulo: libro.TITULO + " — versión adaptada", autor: libro.AUTOR, asunto: libro.ASUNTO });
    console.log("PDF adaptado listo:", a.adaptado);
    // bloquesAdaptado() lee el libro de L, y el primer recorrido lo dejó en
    // el último: sin esto, los tres Word salían con el cuento del último.
    L = libro;
    const w = await adaptadoDocx(navegador, a.adaptadoDocx);
    console.log(`Word adaptado listo: ${a.adaptadoDocx} (${w.imagenes} imágenes, ${w.decorativas} marcadas como decorativas)`);
    if (soloAdaptado) continue;
    const pdfTapa = path.join(tmp, libro.SLUG + "-tapa.pdf");
    const pdfCuerpo = path.join(tmp, libro.SLUG + "-cuerpo.pdf");
    const pdfMarca = path.join(tmp, libro.SLUG + "-marca.pdf");

    const pTapa = await navegador.newPage();
    await pTapa.goto("file://" + a.htmlTapa, { waitUntil: "load" });
    await pTapa.evaluate(() => document.fonts.ready);
    await pTapa.pdf({ path: pdfTapa, format: "A4", printBackground: true, margin: sinMargen });

    const pMarca = await navegador.newPage();
    await pMarca.goto("file://" + a.htmlSello, { waitUntil: "load" });
    await pMarca.pdf({ path: pdfMarca, format: "A4", printBackground: true, margin: sinMargen });

    const pagina = await navegador.newPage();
    await pagina.goto("file://" + a.htmlCuerpo, { waitUntil: "load" });
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.pdf({
      path: pdfCuerpo, format: "A4", printBackground: true,
      margin: { top: "14mm", bottom: "15mm", left: "16mm", right: "16mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#7a5c3e;font-family:Arial,sans-serif;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;"><span>${esc(libro.TITULO)}</span><span style="font-weight:700;">${esc(libro.AUTOR)}</span><span class="pageNumber"></span></div>`,
    });
    await Promise.all([pTapa.close(), pMarca.close(), pagina.close()]);
    unir(pdfTapa, pdfCuerpo, pdfMarca, a.pdf);
    proteger(a.pdf, { clave: libro.CLAVE, autor: libro.AUTOR, imprimir: true, titulo: libro.TITULO_PDF, asunto: libro.ASUNTO });
    console.log("PDF listo:", a.pdf);
  }
  await navegador.close();
})();
