/* Pone en cada lección de cada curso los dos enlaces al material de estudio que
 * genera herramientas/curso-material-generar.js.
 *
 * Se puede correr todas las veces que se quiera: si los enlaces ya están, no
 * los duplica — los reemplaza. Eso importa porque el nombre del archivo sale
 * del título de la lección, así que al corregirle una tilde a un título el
 * enlace viejo quedaría apuntando a un archivo que ya no existe.
 *
 *     node herramientas/curso-material-enlazar.js [curso]
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const M = require("./curso-material.js");
const { lecciones, detallesDePrimerNivel } = require("./lib/leer-curso.js");

const CLASE = "inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-700 text-brand-700 dark:text-brand-100 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-brand-200 dark:hover:bg-brand-600 transition-colors";
// La marca con la que se reconocen los enlaces ya puestos, para poder
// reemplazarlos en vez de sumar otros al lado.
const MARCA_INICIO = "<!-- material: inicio -->";
const MARCA_FIN = "<!-- material: fin -->";

function bloque(slug, leccion) {
  const base = String(leccion.n).padStart(2, "0") + "-" + M.slugDe(leccion.titulo) + "-material";
  const pdf = `../recursos/${slug}/${base}.pdf`;
  const acc = `../recursos/${slug}/${base}-accesible.html`;
  return MARCA_INICIO +
    `<a href="${pdf}" class="${CLASE}">📚 Material de estudio (PDF)</a>` +
    `<a href="${acc}" class="${CLASE}">🔊 Material en formato accesible</a>` +
    MARCA_FIN;
}

let cambiados = 0, armadas = 0;
const cursos = process.argv.slice(2).length ? process.argv.slice(2) : M.CURSOS;

cursos.forEach((slug) => {
  const archivo = path.join(RAIZ, "cursos", "protegido", slug + ".html");
  let html = fs.readFileSync(archivo, "utf8");
  const lista = lecciones(slug);
  // Se recorre de atrás hacia adelante para que los índices de los <details>
  // que faltan por tocar no se muevan al insertar texto.
  const detalles = detallesDePrimerNivel(html);
  let puestos = 0;
  for (let i = detalles.length - 1; i >= 0; i--) {
    const trozo = detalles[i];
    const leccion = lista[i];
    if (!leccion) continue;
    // Se quita lo que hubiera puesto una corrida anterior.
    let limpio = trozo;
    const desde = limpio.indexOf(MARCA_INICIO);
    if (desde >= 0) {
      const hasta = limpio.indexOf(MARCA_FIN, desde);
      limpio = limpio.slice(0, desde) + limpio.slice(hasta + MARCA_FIN.length);
    }

    const FILA = '<div class="mt-3 flex flex-wrap gap-2">';
    const abre = limpio.lastIndexOf(FILA);
    let nuevo;
    if (abre >= 0) {
      const corte = abre + FILA.length;
      nuevo = limpio.slice(0, corte) + bloque(slug, leccion) + limpio.slice(corte);
    } else {
      // Alguna lección no trae fila de enlaces (el examen de diagnóstico de
      // "El mapa de los finales"). Se le arma una, para que su material
      // también se pueda bajar.
      const cierre = limpio.lastIndexOf("</details>");
      nuevo = limpio.slice(0, cierre) + FILA + bloque(slug, leccion) + "</div>" + limpio.slice(cierre);
      armadas += 1;
    }

    const pos = html.indexOf(trozo);
    html = html.slice(0, pos) + nuevo + html.slice(pos + trozo.length);
    puestos += 1;
  }
  fs.writeFileSync(archivo, html);
  cambiados += puestos;
  console.log(`  ${slug.padEnd(28)} ${puestos} lecciones enlazadas`);
});

console.log(`\n${cambiados} lecciones con su material enlazado` + (armadas ? ` · a ${armadas} hubo que armarle la fila de enlaces` : ""));
