/* Las librerías de terceros que se sirven desde `js/vendor/` y no desde un CDN.
 *
 * La leen vendor.js (que las copia de node_modules) y verificar-vendor.js (que
 * comprueba que ninguna página las pida a un CDN y que sigan siendo las de npm).
 * La versión la fija package.json; acá no se repite.
 *
 *   npm      el archivo dentro del paquete instalado
 *   archivo  dónde queda en el sitio
 *   cdn      cómo se reconoce en una página que la pide de afuera
 */
module.exports = [
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
];
