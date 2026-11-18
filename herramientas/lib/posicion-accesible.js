/* Una posición para la versión ACCESIBLE de un material: cada pieza en su
 * propio renglón de lista.
 *
 * La queja de los alumnos ciegos era que la posición «se lee muy rápido» para
 * ponerla en el tablero. Iba en un párrafo («Piezas blancas: rey en g1; torres
 * en a1, f1; peones en a2, b2…»), y un párrafo el lector de pantalla lo dice de
 * un tirón: no hay forma de pararse en una pieza ni de volver a UNA. En una
 * lista se avanza de a una con las flechas, al ritmo de quien la va poniendo, y
 * el rótulo dice cuántas son antes de empezar.
 *
 * Vive acá porque lo usan todos los generadores que escriben un «-accesible»
 * (el material de cada lección, los libros, el diagnóstico, las fichas, los
 * tomos de «Una clase al día»): una copia por generador se habría ido
 * separando a la primera corrección. Las casillas van DICHAS («gustav 1»),
 * igual que las de las jugadas del mismo documento.
 *
 * describir() de lib/describir-fen.js sigue como estaba: es la frase corrida
 * de los PDF y de los títulos de los diagramas.
 */
const { describir, piezasUnaPorUna } = require("./describir-fen.js");
const N = require("./notacion.js");

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function mayuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

/* Las dos listas, «Piezas blancas: 6» y «Piezas negras: 5».
   `encabezado`: la etiqueta del rótulo ("h4") donde el documento tiene lugar
   para un encabezado más; sin él va en negrita, que no rompe el árbol de
   encabezados de un libro que ya tiene el suyo.
   `sinVacias`: un lado sin piezas no se nombra (los cuentos para niños, con
   tableros de una sola pieza). */
function piezasHtml(fen, o) {
  o = o || {};
  const lados = piezasUnaPorUna(fen);
  return [["blancas", "Piezas blancas"], ["negras", "Piezas negras"]].map(([lado, nombre]) => {
    const ps = lados[lado];
    if (!ps.length && o.sinVacias) return "";
    const rotulo = `${nombre}: ${ps.length}`;
    return `  ${o.encabezado ? `<${o.encabezado}>${rotulo}</${o.encabezado}>` : `<p class="piezas-de"><strong>${rotulo}</strong></p>`}
  ${ps.length
    ? `<ul>\n${ps.map((x) => `    <li>${mayuscula(x.pieza)} en ${N.casillaHablada(x.casilla)}.</li>`).join("\n")}\n  </ul>`
    : "<p>Ninguna.</p>"}`;
  }).filter(Boolean).join("\n");
}

/* El bloque entero de un libro:
     La posición. [antes] Juegan las blancas.
     Piezas blancas: 6 … Piezas negras: 5 …
     [despues]
     FEN: …
   `antes` y `despues` llegan ya escapados (traen jugadas dichas y, a veces,
   etiquetas). `turno: false` no dice quién juega; `fen: false` no la escribe. */
function posicionHtml(fen, o) {
  o = o || {};
  const d = describir(fen);
  const lados = piezasUnaPorUna(fen);
  const vacio = !lados.blancas.length && !lados.negras.length;
  const cabeza = [o.antes, o.turno === false ? "" : esc(d.turno), vacio ? "El tablero está vacío." : ""].filter(Boolean).join(" ");
  return `<div class="posicion">
  <p><strong>${esc(o.rotulo || "La posición.")}</strong>${cabeza ? " " + cabeza : ""}</p>
${vacio ? "" : piezasHtml(fen, o)}
  ${o.despues ? `<p>${o.despues}</p>` : ""}
  ${o.fen === false ? "" : `<p class="fen">FEN: ${esc(fen)}</p>`}
</div>`;
}

/* ------------------------------------------------ la línea, jugada por jugada
   Lo mismo con las jugadas: «Solución. 32… torre eva 1, 33. dama captura eva
   1, dama captura eva 1» en un párrafo se oye de un tirón, y no se puede
   volver a UNA jugada mientras se mueve la pieza en el tablero. Cada jugada va
   en su renglón («32. Negras: torre eva 1.»), con cuántas son en el rótulo.

   jugadasDeLinea() parte una línea YA DICHA («1. anna 4, rey felix 7, 2. anna
   5»; «32… torre eva 1, 33. …») en [{ n, bando, texto }]. Si algo no tiene la
   forma esperada devuelve null y la línea se queda en su párrafo: mejor
   corrida que mal partida. */
function jugadasDeLinea(dicha) {
  const trozos = String(dicha).trim().replace(/\.$/, "").split(/,\s+/);
  const out = [];
  let n = null, tocaNegras = false;
  for (const crudo of trozos) {
    const t = crudo.trim();
    const m = t.match(/^(\d+)\s?(\.|…)\s+(.+)$/);
    if (m) {
      n = Number(m[1]);
      const negras = m[2] === "…";
      out.push({ n, bando: negras ? "Negras" : "Blancas", texto: m[3] });
      tocaNegras = !negras;
    } else {
      if (n === null || !tocaNegras || /^\d/.test(t) || !t) return null;
      out.push({ n, bando: "Negras", texto: t.replace(/^…\s*/, "") });
      tocaNegras = false;
    }
  }
  // Una «jugada» larga es prosa que se coló en la línea: no se parte.
  if (out.some((j) => j.texto.split(" ").length > 9)) return null;
  return out.length ? out : null;
}
/* Las jugadas ya separadas, en su lista. `rotulo`: «Solución», «La línea»,
   «Las jugadas». `encabezado`: como en piezasHtml(). Las jugadas llegan dichas
   y sin escapar. */
function jugadasHtml(js, o) {
  o = o || {};
  const rotulo = o.rotulo || "La línea";
  const fin = (t) => esc(String(t).replace(/[.,]$/, ""));
  if (js.length === 1) return `<p><strong>${esc(rotulo)}.</strong> ${js[0].n}, ${js[0].bando.toLowerCase()}: ${fin(js[0].texto)}.</p>`;
  const cabeza = `${esc(rotulo)}: ${js.length} jugadas`;
  return `${o.encabezado ? `<${o.encabezado}>${cabeza}</${o.encabezado}>` : `<p class="linea-de"><strong>${cabeza}</strong></p>`}
  <ul>
${js.map((j) => `    <li>${j.n}. ${j.bando}: ${fin(j.texto)}.</li>`).join("\n")}
  </ul>`;
}
// Una línea dicha, partida; si no se puede partir, en su párrafo de siempre.
function lineaHtml(dicha, o) {
  o = o || {};
  const js = jugadasDeLinea(dicha);
  if (!js) return `<p><strong>${esc(o.rotulo || "La línea")}.</strong> ${esc(String(dicha).replace(/\.$/, ""))}.</p>`;
  return jugadasHtml(js, o);
}

module.exports = { piezasHtml, posicionHtml, jugadasDeLinea, jugadasHtml, lineaHtml };

/*! rev bfb5bbb0d2d82f9f */
