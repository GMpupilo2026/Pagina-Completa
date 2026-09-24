#!/usr/bin/env node
/* Trae a `js/vendor/` las librerías de terceros que usan las páginas.
 *
 * Estaban pedidas a un CDN. La de Supabase como `@supabase/supabase-js@2` —un
 * RANGO, y sin `integrity`— desde las 77 páginas que la cargan; chess.js y
 * three.js desde cdnjs, con la versión fija pero también sin `integrity`. O sea
 * que cada visita ejecutaba lo que hubiera publicado ahí en ese momento, con la
 * sesión de quien entrara: un alumno, un profesor o quien administra. Eso no es
 * una posibilidad teórica; es lo que pasó con polyfill.io en 2024, y no habría
 * dado ningún error — las páginas se seguirían viendo igual mientras las
 * sesiones se van. Y el CDN caído tampoco avisa: sin chess.js la portada se
 * queda sin el tablero de prueba.
 *
 * Con los archivos en el repositorio, lo que corre es lo que está commiteado y
 * actualizarlo se lee en el diff. Es la misma decisión que ya se tomó con
 * Tailwind ("El CSS va compilado, no por CDN") y con Stockfish, que vive al
 * lado en esta misma carpeta.
 *
 * Se corre después de `npm install` (package.json fija las versiones), y NO se
 * le pone ninguna cabecera a los archivos: se dejan byte a byte como vienen de
 * npm, para que `verificar-vendor.js` pueda compararlos contra el paquete y
 * decir si alguien los editó a mano.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");

// La lista la comparte verificar-vendor.js: una librería nueva va solo acá.
const LIBRERIAS = require("./lib/librerias-vendor.js");

let faltan = 0;
for (const lib of LIBRERIAS) {
  let origen;
  try {
    origen = require.resolve(lib.npm, { paths: [raiz] });
  } catch {
    console.error(`Falta el paquete de ${lib.nombre}. Corre primero:  npm install`);
    faltan += 1;
    continue;
  }
  const destino = path.join(raiz, lib.archivo);
  const antes = fs.existsSync(destino) ? fs.readFileSync(destino) : null;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origen, destino);
  const version = require(path.join(raiz, "node_modules", lib.paquete, "package.json")).version;
  console.log(antes && Buffer.compare(antes, fs.readFileSync(destino)) === 0
    ? `${lib.archivo} sigue en ${version} (sin cambios)`
    : `${lib.archivo}: ahora es la ${version}`);
}
console.log("Correr después: node herramientas/verificar-vendor.js");
process.exit(faltan ? 1 : 0);
