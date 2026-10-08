/* Genera entreno/data/temas-motivos.json: { clave → nombre } de los temas que
 * son MOTIVOS (clavada, tenedor, mate del pasillo…), sacados de
 * entreno/data/temas.json.
 *
 * Lo usan Informes y el hub de Entrenamiento para el «tema más flojo»
 * (informes_tema_mas_flojo(p_temas) en la base): la lista de claves va como
 * parámetro y los nombres se pintan con este archivo. temas.json pesa casi dos
 * megas; esto, dos kilos. «Mezcla equilibrada», las fases, las duraciones o el
 * origen no son motivos: no dicen qué practicar, y por eso quedan fuera.
 *
 * No se edita a mano: al cambiar temas.json se vuelve a correr
 *     node herramientas/temas-motivos.js
 * y verificar-tema-flojo.js falla si el archivo quedó viejo.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const GRUPOS = ["tactica", "motifs", "advanced", "mateThemes", "specialMoves"];

function armar() {
  const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
  const salida = {};
  datos.groups.filter((g) => GRUPOS.includes(g.id)).forEach((g) => {
    g.themes.forEach((t) => { if (datos.themes[t.key] && datos.themes[t.key].length) salida[t.key] = t.name; });
  });
  return JSON.stringify(salida, null, 1) + "\n";
}

module.exports = { armar, GRUPOS, DESTINO: path.join(RAIZ, "entreno/data/temas-motivos.json") };
if (require.main === module) {
  fs.writeFileSync(module.exports.DESTINO, armar());
  console.log("entreno/data/temas-motivos.json: " + Object.keys(JSON.parse(armar())).length + " motivos.");
}
