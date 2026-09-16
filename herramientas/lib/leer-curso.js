/* Lee las lecciones de un curso desde cursos/protegido/<slug>.html.
 *
 * El contenido de las lecciones vive en ese HTML y no en un JSON: los cursos se
 * escribieron ahí a mano o los generó herramientas/curso-generar.py, y no hay
 * una fuente anterior. Así que se parsea el HTML, que es la fuente de verdad.
 *
 * Devuelve, por lección: número, título, los párrafos de texto, la tarea de
 * "Practica:" si la trae, y los archivos que ya tiene enlazados.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");

function sinEtiquetas(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Los <details> de primer nivel: las lecciones. Los de dentro son otra cosa.
function detallesDePrimerNivel(html) {
  const trozos = [];
  const re = /<details\b|<\/details>/g;
  let nivel = 0, inicio = -1, m;
  while ((m = re.exec(html)) !== null) {
    if (m[0] === "</details>") {
      nivel -= 1;
      if (nivel === 0 && inicio >= 0) { trozos.push(html.slice(inicio, re.lastIndex)); inicio = -1; }
    } else {
      if (nivel === 0) inicio = m.index;
      nivel += 1;
    }
  }
  return trozos;
}

function lecciones(slug) {
  const archivo = path.join(RAIZ, "cursos", "protegido", slug + ".html");
  const html = fs.readFileSync(archivo, "utf8");
  return detallesDePrimerNivel(html).map((trozo, i) => {
    const sum = trozo.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    const tituloCrudo = sum ? sinEtiquetas(sum[1]) : "Lección " + (i + 1);
    // El título viene como "3. Oposición de reyes": se separa el número.
    const conNumero = tituloCrudo.match(/^\s*(\d+)\s*[.\-–]\s*(.+)$/);
    // El texto de la lección va PRIMERO; después vienen los visores
    // interactivos (f100-, cp-) y la fila de enlaces. Si no se corta ahí, el
    // material se lleva el aviso de "Activa JavaScript…" y, peor, la respuesta
    // del diagrama, que además se repite más abajo en el propio cuadernillo.
    const corte = trozo.search(/class="(?:[^"]*\s)?(?:f100|cp|ac)-/);
    const soloTexto = corte > 0 ? trozo.slice(0, corte) : trozo;
    const parrafos = [];
    const rp = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
    let p;
    while ((p = rp.exec(soloTexto)) !== null) {
      const t = sinEtiquetas(p[1]);
      // Los avisos de "hace falta JavaScript" son del visor, no de la lección.
      if (t && !/activa javascript|necesitas javascript/i.test(t)) parrafos.push(t);
    }
    // "Practica: …" es la tarea de la lección; el resto es la explicación.
    const tarea = parrafos.find((t) => /^practica\s*:/i.test(t));
    const texto = parrafos.filter((t) => t !== tarea);
    const enlaces = [...trozo.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
    return {
      n: conNumero ? Number(conNumero[1]) : i + 1,
      titulo: conNumero ? conNumero[2] : tituloCrudo,
      texto,
      tarea: tarea ? tarea.replace(/^practica\s*:\s*/i, "") : null,
      video: enlaces.find((h) => /youtube|youtu\.be|vimeo/.test(h)) || null,
      pptx: enlaces.find((h) => h.endsWith(".pptx")) || null,
      pdf: enlaces.find((h) => h.endsWith(".pdf")) || null,
      idxDetalle: i,
    };
  });
}

// Las posiciones verificadas del curso. Cada curso guardó su archivo de datos
// con una forma distinta —unos listas, otros objetos; unos con `leccion`, otros
// con `cap` o solo con el título—, así que en vez de un lector por curso se
// recorre todo el árbol y se recoge cualquier objeto que tenga una FEN.
// Son posiciones ya verificadas con motor: no se inventa ninguna acá.
function posiciones(slug) {
  const archivo = path.join(RAIZ, "cursos", "protegido", "data", slug + ".json");
  if (!fs.existsSync(archivo)) return [];
  const d = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const salida = [];
  const recorrer = (nodo, heredado) => {
    if (Array.isArray(nodo)) { nodo.forEach((x) => recorrer(x, heredado)); return; }
    if (!nodo || typeof nodo !== "object") return;
    const contexto = {
      leccion: nodo.leccion != null ? nodo.leccion : heredado.leccion,
      titulo: nodo.titulo || heredado.titulo,
      capitulo: nodo.capitulo || heredado.capitulo,
      tema: nodo.tema || heredado.tema,
    };
    if (typeof nodo.fen === "string" && nodo.fen.indexOf("/") !== -1) {
      salida.push({
        fen: nodo.fen,
        titulo: nodo.titulo || nodo.pregunta || contexto.titulo || "",
        pregunta: nodo.pregunta || "",
        comentario: nodo.comentario || nodo.nota || nodo.resumen || "",
        linea: nodo.linea_es || nodo.linea || "",
        resultado: nodo.resultado_texto || nodo.resultado || "",
        leccion: contexto.leccion,
        capitulo: contexto.capitulo,
        tema: contexto.tema,
        contexto: [contexto.titulo, contexto.capitulo, contexto.tema].filter(Boolean).join(" · "),
      });
    }
    Object.keys(nodo).forEach((k) => {
      if (k === "jugadas" || k === "moves") return;   // los pasos de una línea, no posiciones sueltas
      recorrer(nodo[k], contexto);
    });
  };
  recorrer(d, {});
  return salida;
}

// Las partidas comentadas de un curso, cuando las tiene. En partidas-modelo el
// texto de la lección NO está en el HTML —la lección es el visor de la partida—,
// así que el resumen, las ideas y lo que deja cada partida viven acá.
function partidas(slug) {
  const archivo = path.join(RAIZ, "cursos", "protegido", "data", slug + ".json");
  if (!fs.existsSync(archivo)) return [];
  const d = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const crudas = d.partidas;
  if (!crudas) return [];
  const lista = Array.isArray(crudas) ? crudas : Object.values(crudas);
  return lista.filter((p) => p && typeof p === "object").map((p) => ({
    id: p.id, titulo: p.titulo || "", tema: p.tema || "",
    blancas: p.blancas || "", negras: p.negras || "",
    evento: p.evento || "", resultado: p.resultado || "",
    resumen: p.resumen || "", teoria: p.teoria || "",
    ideas: Array.isArray(p.ideas) ? p.ideas : [],
    lecciones: Array.isArray(p.lecciones) ? p.lecciones : [],
    // Las jugadas comentadas son los ejemplos: posición + por qué.
    comentadas: (Array.isArray(p.moves) ? p.moves : [])
      .filter((m) => m && m.comentario && m.fen)
      .map((m) => ({ n: m.n, color: m.color, san: m.san, fen: m.fen, comentario: m.comentario })),
  }));
}

module.exports = { lecciones, posiciones, partidas, sinEtiquetas, detallesDePrimerNivel };
