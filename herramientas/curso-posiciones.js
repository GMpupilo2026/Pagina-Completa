/* ===== Posiciones interactivas de un curso =====
 *
 * Convierte los diagramas que trae el contenido de un curso
 * (herramientas/cursos/<slug>.json, campo `diagramas` de cada lección) en el
 * archivo de datos que lee el visor: cursos/protegido/data/<slug>.json.
 *
 * De cada diagrama solo hay que escribir la posición (FEN), el resultado y la
 * línea en notación inglesa; acá se expande a lo que el visor necesita: cada
 * jugada con su SAN, su UCI y la FEN que queda, más la línea en español.
 *
 * Verifica de paso lo que no puede salir mal: que la FEN cargue, que la
 * posición sea legal (el bando que no mueve no puede estar en jaque) y que
 * cada jugada de la línea exista de verdad. Si algo falla, no escribe nada.
 *
 * El resultado que promete cada posición ("1-0", "½") se comprueba aparte con
 * el propio Stockfish del sitio: ver herramientas/verificador-motor.html.
 *
 *     npm install chess.js@0.10.3
 *     node herramientas/curso-posiciones.js estrategia-en-el-final
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

let Chess;
try { ({ Chess } = require("chess.js")); }
catch (e) { console.error("Falta chess.js: npm install chess.js@0.10.3"); process.exit(2); }

const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
const esSan = (san) => san.replace(/^([KQRBN])/, (m, p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]);
const TEXTO = { "1-0": "Ganan blancas", "0-1": "Ganan negras", "½": "Tablas" };

function expandir(diag, fallos) {
  const g = new Chess();
  if (!g.load(diag.fen)) { fallos.push(diag.id + ": la FEN no carga"); return null; }
  const partes = diag.fen.split(" ");
  partes[1] = partes[1] === "w" ? "b" : "w";
  const otro = new Chess();
  if (otro.load(partes.join(" ")) && otro.in_check()) {
    fallos.push(diag.id + ": posición ilegal, el bando que no mueve está en jaque");
    return null;
  }
  const jugadas = [];
  for (const san of diag.linea || []) {
    const mv = g.move(san);
    if (!mv) { fallos.push(diag.id + ": la jugada " + san + " no es legal"); return null; }
    jugadas.push({ san: mv.san, uci: mv.from + mv.to + (mv.promotion || ""), fen: g.fen() });
  }
  const numerada = (fn) => {
    let salida = "", n = parseInt(diag.fen.split(" ")[5] || "1", 10);
    let turno = diag.fen.split(" ")[1];
    jugadas.forEach((j) => {
      if (turno === "w") salida += (salida ? " " : "") + n + "." + fn(j.san);
      else { salida += (salida ? " " : "") + (jugadas[0] === j ? n + "..." : "") + fn(j.san); }
      if (turno === "b") n++;
      turno = turno === "w" ? "b" : "w";
    });
    return salida;
  };
  return {
    id: diag.id,
    idx: 0,
    fen: diag.fen,
    turno: diag.turno || diag.fen.split(" ")[1],
    titulo: diag.pregunta,
    resultado: diag.resultado,
    resultado_texto: TEXTO[diag.resultado] || "",
    linea: numerada((s) => s),
    linea_es: numerada(esSan),
    jugadas,
    comentario: diag.comentario,
    clave: true,
    marcas: [],
  };
}

function main(slug) {
  const curso = JSON.parse(fs.readFileSync(path.join(RAIZ, "herramientas", "cursos", slug + ".json"), "utf8"));
  const fallos = [];
  const finales = [];
  let n = 0, total = 0;
  curso.bloques.forEach((bloque) => {
    bloque.lecciones.forEach((leccion) => {
      n += 1;
      if (!leccion.diagramas || !leccion.diagramas.length) return;
      const diagramas = leccion.diagramas.map((d) => expandir(d, fallos)).filter(Boolean);
      total += diagramas.length;
      finales.push({ n, cap: bloque.n, capitulo: bloque.titulo, titulo: leccion.titulo, leccion: n, diagramas });
    });
  });
  if (fallos.length) {
    console.error("No se escribió nada:\n- " + fallos.join("\n- "));
    process.exit(1);
  }
  const destino = path.join(RAIZ, "cursos", "protegido", "data", slug + ".json");
  fs.writeFileSync(destino, JSON.stringify({
    curso: { slug, titulo: curso.titulo, nivel: curso.nivel, descripcion: curso.resumen, emoji: curso.emoji },
    finales,
    meta: { generado: "herramientas/curso-posiciones.js", posiciones: total },
  }, null, 1) + "\n");
  console.log("cursos/protegido/data/" + slug + ".json · " + total + " posiciones en " + finales.length + " lecciones");
}

main(process.argv[2] || "estrategia-en-el-final");
