#!/usr/bin/env node
/* Arma data/contenido-panel.json: qué contenido hay detrás de cada tarjeta del
 * panel del alumno que se agranda con el tiempo (artículos, cursos, lecciones
 * de Aprender y las fichas de Estudio de cada categoría).
 *
 *     node herramientas/contenido-panel.js            # lo escribe
 *     node herramientas/contenido-panel.js --comprobar # falla si está viejo
 *
 * Con eso el panel pone «Nuevo» en la tarjeta que trae algo que el alumno no
 * había visto la última vez (js/clases.js, marcarContenidoNuevo). Se guardan
 * los IDENTIFICADORES y no una cuenta: con una cuenta, quitar una ficha y
 * agregar otra el mismo día no se notaría.
 *
 * No se escribe a mano: sale de los mismos archivos que pintan cada página, y
 * herramientas/verificar-contenido-panel.js falla si alguien agrega contenido
 * y no lo vuelve a armar. Ver «La marca «Nuevo»» en docs/decisiones/paneles.md.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "data", "contenido-panel.json");

const paginas = (carpeta) => fs.readdirSync(path.join(RAIZ, carpeta))
  .filter((f) => f.endsWith(".html") && f !== "index.html")
  .map((f) => f.replace(/\.html$/, ""))
  .sort();

function lecciones() {
  const js = fs.readFileSync(path.join(RAIZ, "js", "aprender-lecciones.js"), "utf8");
  const inicio = js.indexOf("const LESSONS = [");
  const fin = js.indexOf("\n];", inicio);
  if (inicio < 0 || fin < 0) throw new Error("No encuentro LESSONS en js/aprender-lecciones.js");
  const ids = [...js.slice(inicio, fin).matchAll(/\bid\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  if (!ids.length) throw new Error("LESSONS vino vacío");
  return ids;
}

function armar() {
  const { FICHAS } = require(path.join(RAIZ, "js", "fichas-estudio.js"));
  const fichas = (cat) => FICHAS.filter((f) => f.categoria === cat).map((f) => f.id);
  const salida = {
    "articulos.html": paginas("articulos"),
    "cursos/academia/index.html": paginas("cursos/academia"),
    "entreno/aprender.html": lecciones(),
  };
  ["apertura", "defensa", "tactica", "concepto", "final"].forEach((cat) => {
    const ids = fichas(cat);
    if (!ids.length) throw new Error("No hay fichas de «" + cat + "»");
    salida["entreno/estudio.html?cat=" + cat] = ids;
  });
  return JSON.stringify(salida, null, 1) + "\n";
}

module.exports = { armar, SALIDA };

if (require.main === module) {
  const nuevo = armar();
  if (process.argv.includes("--comprobar")) {
    const viejo = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, "utf8") : "";
    if (viejo !== nuevo) {
      console.error("✗ data/contenido-panel.json está viejo: corre node herramientas/contenido-panel.js");
      process.exit(1);
    }
    console.log("✓ data/contenido-panel.json al día");
  } else {
    fs.writeFileSync(SALIDA, nuevo);
    console.log("✓ data/contenido-panel.json");
  }
}
