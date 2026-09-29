/* Las librerías de terceros que se sirven desde `js/vendor/` y no desde un CDN.
 *
 * La leen vendor.js (que las copia de node_modules) y verificar-vendor.js (que
 * comprueba que ninguna página las pida a un CDN y que sigan siendo las de npm).
 * La versión la fija package.json; acá no se repite.
 *
 *   npm       el archivo dentro del paquete instalado
 *   construir en vez de `npm`: la entrada que esbuild arma en un solo archivo,
 *             para las librerías que ya no traen en npm uno listo para el
 *             navegador (Sentry lo dejó de publicar ahí; solo queda en su CDN)
 *   archivo   dónde queda en el sitio
 *   cdn       cómo se reconoce en una página que la pide de afuera
 *
 * `contenido(lib)` da los bytes que TIENE que tener el archivo: los del
 * paquete, o lo que arma esbuild. Armar dos veces lo mismo da los mismos
 * bytes, así que verificar-vendor.js puede comparar igual que con las otras.
 */
const path = require("path");
const fs = require("fs");
const raiz = path.join(__dirname, "..", "..");

const LIBRERIAS = [
  {
    nombre: "Supabase",
    paquete: "@supabase/supabase-js",
    npm: "@supabase/supabase-js/dist/umd/supabase.js",
    archivo: "js/vendor/supabase.js",
    cdn: /https?:\/\/[^"']*supabase-js/,
  },
  {
    nombre: "chess.js",
    paquete: "chess.js",
    npm: "chess.js/chess.js",
    archivo: "js/vendor/chess.js",
    cdn: /https?:\/\/[^"']*chess(\.min)?\.js/,
  },
  {
    nombre: "three.js",
    paquete: "three",
    npm: "three/build/three.min.js",
    archivo: "js/vendor/three.min.js",
    cdn: /https?:\/\/[^"']*three(\.min)?\.js/,
  },
  {
    // El código QR para entrar a la clase desde el proyector (js/clase-qr.js
    // lo pide recién cuando el profe lo muestra; ver «Entrar desde el celular
    // con un código QR»).
    nombre: "qrcode-generator",
    paquete: "qrcode-generator",
    // Su `exports` no deja pedir dist/qrcode.js por la ruta: el nombre del
    // paquete resuelve (`require`) justo a ese archivo.
    npm: "qrcode-generator",
    archivo: "js/vendor/qrcode.js",
    cdn: /https?:\/\/[^"']*qrcode[^"']*\.js/,
  },
  {
    // Lo carga js/errores.js recién cuando hay un error que mandar (ver «Los
    // errores de la gente llegan a Sentry»): nadie más lo pide.
    nombre: "Sentry",
    paquete: "@sentry/browser",
    construir: "herramientas/lib/sentry-entrada.mjs",
    archivo: "js/vendor/sentry.js",
    cdn: /https?:\/\/[^"']*(sentry-cdn\.com|@sentry\/browser)/,
  },
];

// Lanza si falta el paquete (o esbuild): quien llama dice «npm install».
function contenido(lib) {
  if (!lib.construir) return fs.readFileSync(require.resolve(lib.npm, { paths: [raiz] }));
  require.resolve(lib.paquete, { paths: [raiz] });
  const esbuild = require(require.resolve("esbuild", { paths: [raiz] }));
  const r = esbuild.buildSync({
    entryPoints: [path.join(raiz, lib.construir)],
    absWorkingDir: raiz,
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "Sentry",
    target: "es2018",
    legalComments: "none",
    write: false,
    logLevel: "silent",
  });
  return Buffer.from(r.outputFiles[0].contents);
}

module.exports = LIBRERIAS;
module.exports.contenido = contenido;
