#!/usr/bin/env node
/* Trae chess.js a `js/vendor/chess.js`.
 *
 * Se pedía a cdnjs (`chess.js/0.10.3/chess.min.js`) desde 43 archivos, casi
 * siempre como script SÍNCRONO. Eso cuesta en dos frentes:
 *
 * - Velocidad: cdnjs es otro origen, y la primera vez que la página lo pide el
 *   celular tiene que abrir una conexión nueva (DNS, TCP y TLS) antes de bajar
 *   un solo byte. Con 4G son unos 600 ms, y como el script es síncrono, la
 *   página no pinta nada mientras tanto. Servido desde el sitio viaja por la
 *   conexión que ya está abierta.
 * - Lo mismo que con Supabase (ver "La librería de Supabase tampoco viene de
 *   un CDN"): sin `integrity`, cada visita ejecutaba lo que hubiera ahí.
 *
 * Es el `chess.js` del paquete de npm 0.10.3 —el mismo que los verificadores
 * ya servían en lugar del de cdnjs—, byte a byte y sin cabecera, para que
 * `verificar-vendor.js` pueda compararlo. No es la versión minificada: npm no
 * la trae, y comprimido por Cloudflare la diferencia son unos KB, bastante
 * menos que abrir la conexión.
 *
 * Se corre después de `npm install` (la versión la fija package.json).
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const destino = path.join(raiz, "js/vendor/chess.js");
let origen;
try {
  origen = require.resolve("chess.js/chess.js", { paths: [raiz] });
} catch {
  console.error("Falta el paquete. Corre primero:  npm install");
  process.exit(1);
}
const version = JSON.parse(fs.readFileSync(path.join(path.dirname(origen), "package.json"), "utf8")).version;
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.copyFileSync(origen, destino);
console.log("js/vendor/chess.js ← chess.js " + version + " de npm");
console.log("Correr después: node herramientas/verificar-vendor.js");
