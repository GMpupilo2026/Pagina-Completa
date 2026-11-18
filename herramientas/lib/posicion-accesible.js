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

module.exports = { piezasHtml, posicionHtml };

/*! rev bfb5bbb0d2d82f9f */
