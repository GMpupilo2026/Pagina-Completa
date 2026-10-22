/* La marca de agua de todo lo que sale del sitio es la de Ajedrez Integral
 * (img/marca-agua-ajedrez-integral.png: el caballo con «AJEDREZ INTEGRAL»
 * debajo), no el logo con el nombre de Oscar. Lo pidió el dueño del sitio:
 * «toda la documentación de todo con marca de agua de AJEDREZ INTEGRAL».
 *
 * Lo que se revisa, sin navegador:
 *   - ningún generador, página ni módulo vuelve a usar
 *     img/logo-oscar-angulo-marca.png, salvo los pocos que lo usan como logo
 *     de quien escribe (no como marca de agua) y lo dicen en PERMITIDOS;
 *   - los generadores toman la marca de una sola copia
 *     (herramientas/lib/marca-agua.js) y las páginas de js/marca-agua.js;
 *   - la de los Word de los Programas de Estudio es la nueva (más chica y
 *     lavada: la arma herramientas/marca-agua-ajedrez-integral.js);
 *   - los libros que se publican la llevan de verdad: su PDF trae la imagen
 *     de la marca nueva (760 × 564; la vieja medía 760 × 571).
 *
 * Uso:  node herramientas/verificar-marca-agua.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const RAIZ = path.join(__dirname, "..");
const VIEJA = "logo-oscar-angulo-marca.png";
const NUEVA = "img/marca-agua-ajedrez-integral.png";

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 600) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));

// Los que pueden nombrar el logo viejo, y por qué.
const PERMITIDOS = {
  "herramientas/logo-encabezado.py": "arma el logo del encabezado del sitio",
  "herramientas/archivos-catalogo.js": "lo lista en Archivos",
  "herramientas/marca-agua-ajedrez-integral.js": "recorta su dibujo para armar la marca nueva",
  "herramientas/fichas-estudio-pdf.js": "la firma chica de cada carta, junto a «Ajedrez Integral»",
  "herramientas/libro-ninos-pdf.js": "el logo de quien escribe, junto a su nombre en el diploma",
  "herramientas/verificar-marca-agua.js": "este archivo",
};

function archivos(dir, ext, profundo) {
  const out = [];
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (profundo && !["node_modules", "vendor", "datos"].includes(e.name)) out.push(...archivos(rel, ext, profundo)); }
    else if (ext.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

console.log("=== Nadie usa la marca vieja ===");
const revisar = [...archivos(".", [".html"], false), ...archivos("entreno", [".html"], false), ...archivos("js", [".js"], true),
  ...archivos("herramientas", [".js", ".py"], true)].map((f) => f.replace(/^\.\//, ""));
const usan = revisar.filter((f) => !PERMITIDOS[f] && fs.readFileSync(path.join(RAIZ, f), "utf8").includes(VIEJA));
ok(revisar.length > 100 && !usan.length, "ninguna página, módulo ni generador usa " + VIEJA + " (" + revisar.length + " archivos)", usan.join(", "));

console.log("\n=== Una sola copia ===");
ok(require("./lib/marca-agua").MARCA_AGUA === NUEVA && fs.existsSync(path.join(RAIZ, NUEVA)), "herramientas/lib/marca-agua.js da la marca nueva, y existe");
const conSello = revisar.filter((f) => f.startsWith("herramientas/") && /LOGO_MARCA|class="sello"/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")) && !/verificar-/.test(f));
// (Los dos del libro de examen la reciben de lib/libro-examen-comun.js.)
const tomaLaCopia = (f) => /require\("\.\/(lib\/)?(marca-agua|libro-examen-comun)"\)/.test(fs.readFileSync(path.join(RAIZ, f), "utf8"));
const sinCopia = conSello.filter((f) => !tomaLaCopia(f));
ok(conSello.length >= 15 && !sinCopia.length, "los generadores con marca de agua la toman de lib/marca-agua.js (" + conSello.length + ")", sinCopia.join(", "));
ok(fs.readFileSync(path.join(RAIZ, "js/marca-agua.js"), "utf8").includes("marca-agua-ajedrez-integral.png"), "js/marca-agua.js, la de las páginas, es la nueva");
ok(/documento\.marca === undefined && window\.MarcaAgua/.test(fs.readFileSync(path.join(RAIZ, "js/reporte-pdf.js"), "utf8")), "y un PDF que arma una página la lleva aunque no la pida");
for (const pagina of ["jdn-comites.html", "universidades.html", "arbitros-cr.html", "reportes.html", "pareo.html"]) {
  const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
  ok(!html.includes("js/reporte-pdf.js") || html.includes("js/marca-agua.js"), pagina + ": si arma PDF, carga la marca");
}

console.log("\n=== Los Word de los Programas de Estudio ===");
const png = fs.readFileSync(path.join(RAIZ, "herramientas/programas-estudio/marca.png"));
const ancho = png.readUInt32BE(16), alto = png.readUInt32BE(20);
ok(ancho === 380 && alto === 282, "la marca de los Word es la nueva, a la mitad (" + ancho + " × " + alto + "; la vieja medía 380 × 285)");

console.log("\n=== Los libros publicados la llevan ===");
// Las dimensiones de las imágenes del PDF, también las que van dentro de
// flujos de objetos comprimidos.
function tamanos(pdf) {
  const texto = pdf.toString("latin1");
  const vistos = [];
  const buscar = (s) => { for (const m of s.matchAll(/\/Width (\d+)\s*\/Height (\d+)|\/Height (\d+)\s*\/Width (\d+)/g)) vistos.push(m[1] ? m[1] + "x" + m[2] : m[4] + "x" + m[3]); };
  buscar(texto);
  const re = /\/Type\s*\/ObjStm[^]*?stream\r?\n/g;
  let m;
  while ((m = re.exec(texto))) {
    const fin = texto.indexOf("endstream", re.lastIndex);
    try { buscar(zlib.inflateSync(pdf.subarray(re.lastIndex, fin)).toString("latin1")); } catch (e) { /* no comprimido con zlib */ }
  }
  return vistos;
}
const LIBROS = ["material/rompe-el-estancamiento/rompe-el-estancamiento.pdf", "material/guia-del-profesor", "material/peonita", "material/ponte-a-prueba", "material/mide-tu-fuerza"]
  .flatMap((r) => (r.endsWith(".pdf") ? [r] : archivos(r, [".pdf"], false)))
  // La versión adaptada (para lector de pantalla y baja visión) va sin marca
  // a propósito: una imagen detrás del texto le estorba a quien ve poco.
  .filter((f) => !/-adaptado\.pdf$/.test(f));
for (const f of LIBROS) {
  const t = tamanos(fs.readFileSync(path.join(RAIZ, f)));
  // (La vieja puede seguir adentro como logo de quien escribe: ver PERMITIDOS.)
  ok(t.includes("760x564"), f + ": con la marca nueva", t.join(" "));
}

console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
