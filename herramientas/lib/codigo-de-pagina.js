/* El código de una página, esté donde esté: su HTML más el que se mudó a js/.
 *
 * Con «El código de las páginas sale del HTML»
 * (docs/decisiones/sitio-e-infraestructura.md) el código de una pantalla deja
 * de estar dentro de su .html y pasa a js/<pagina>.js. Un verificador que
 * busca algo en el código leyendo solo el .html deja de encontrarlo, y según
 * cómo esté escrito falla (lo que pasó con verificar-admin.js al mudar
 * informes.html) o, peor, pasa sin comprobar nada.
 *
 * leer("informes.html") devuelve el HTML seguido del código mudado: los
 * archivos que la página carga con <script src> y que empiezan diciendo que
 * son su código (la cabecera que escribe herramientas/mudar-script.py).
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");

function leer(pagina) {
  const ruta = path.join(RAIZ, pagina);
  const html = fs.readFileSync(ruta, "utf8");
  const partes = [html];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
    if (/^(https?:)?\/\//.test(m[1])) continue;
    const js = path.resolve(path.dirname(ruta), m[1].split("?")[0]);
    if (!fs.existsSync(js)) continue;
    const texto = fs.readFileSync(js, "utf8");
    const cabecera = texto.slice(0, 300);
    if (cabecera.includes("El código de " + pagina) || cabecera.includes("(" + pagina + ")")) partes.push(texto);
  }
  return partes.join("\n");
}

module.exports = { leer };
