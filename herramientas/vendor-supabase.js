#!/usr/bin/env node
/* Trae la librería de Supabase a `js/vendor/supabase.js`.
 *
 * Estaba pedida a un CDN como `@supabase/supabase-js@2` —un RANGO, y sin
 * `integrity`— desde las 77 páginas que la cargan. O sea que cada visita
 * ejecutaba lo que hubiera publicado ahí en ese momento, con la sesión de quien
 * entrara: un alumno, un profesor o quien administra. Eso no es una posibilidad
 * teórica; es lo que pasó con polyfill.io en 2024, y no habría dado ningún
 * error — las páginas se seguirían viendo igual mientras las sesiones se van.
 *
 * Con el archivo en el repositorio, lo que corre es lo que está commiteado y
 * actualizarlo se lee en el diff. Es la misma decisión que ya se tomó con
 * Tailwind ("El CSS va compilado, no por CDN") y con Stockfish, que vive al
 * lado en esta misma carpeta.
 *
 * Se corre después de `npm install @supabase/supabase-js@2`, y NO se le pone
 * ninguna cabecera al archivo: se deja byte a byte como viene de npm, para que
 * `verificar-vendor.js` pueda compararlo contra el paquete y decir si alguien
 * lo editó a mano. La versión no se anota aparte porque el propio bundle la
 * lleva dentro (`supabase-js/X.Y.Z`).
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const destino = path.join(raiz, "js/vendor/supabase.js");
let origen;
try {
  origen = require.resolve("@supabase/supabase-js/dist/umd/supabase.js", { paths: [raiz] });
} catch {
  console.error("Falta el paquete. Corré primero:  npm install @supabase/supabase-js@2");
  process.exit(1);
}

const antes = fs.existsSync(destino) ? version(fs.readFileSync(destino, "utf8")) : null;
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.copyFileSync(origen, destino);
const ahora = version(fs.readFileSync(destino, "utf8"));

console.log(antes === ahora
  ? `js/vendor/supabase.js sigue en ${ahora} (sin cambios)`
  : `js/vendor/supabase.js: ${antes || "nuevo"} → ${ahora}`);
console.log("Correr después: node herramientas/verificar-vendor.js");

function version(texto) {
  const m = texto.match(/supabase-js\/(\d+\.\d+\.\d+)/);
  return m ? m[1] : "desconocida";
}
