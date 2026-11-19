#!/usr/bin/env node
/* Quien entra por www.ajedrez-integral.com termina en ajedrez-integral.com,
 * también en las páginas que no pasan por el worker.
 *
 * El 301 de worker.js solo corre en las rutas de run_worker_first: las páginas
 * las sirve Cloudflare directo, por www también. Entonces lo que sí pasa por el
 * worker (cursos/recursos/, cursos/protegido/, material/) contesta con el 301
 * al otro dominio y la CSP (connect-src 'self') lo corta: el 16/11 la
 * presentación de la clase no abrió para un profe que entró por www. Ahora lo
 * arregla js/errores.js, el primer script, síncrono, de todas las páginas
 * (que todas lo cargan lo revisa verificar-errores.js).
 *
 * Sin navegador: se corre el principio de js/errores.js con una dirección de
 * mentira y se mira adónde manda.
 *
 *     node herramientas/verificar-www.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const codigo = fs.readFileSync(path.join(__dirname, "..", "js", "errores.js"), "utf8");
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fallas++; };

function adonde(direccion) {
  const u = new URL(direccion);
  let destino = null;
  const location = {
    protocol: u.protocol, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash,
    replace: (x) => { destino = x; },
  };
  const window = { location, addEventListener() {}, document: {} };
  try {
    vm.runInNewContext(codigo, { window, location, document: { currentScript: null, addEventListener() {} },
      navigator: { userAgent: "" }, console, setTimeout, clearTimeout, URL });
  } catch (e) { /* el resto del archivo puede pedir más del navegador: solo interesa la redirección */ }
  return destino;
}

console.log("www manda al dominio sin www, con la dirección entera:");
ok(adonde("https://www.ajedrez-integral.com/sesion.html") === "https://ajedrez-integral.com/sesion.html", "una página");
ok(adonde("https://www.ajedrez-integral.com/cursos/formacion-ajedrez.html?leccion=5#tema-3")
  === "https://ajedrez-integral.com/cursos/formacion-ajedrez.html?leccion=5#tema-3", "con sus parámetros y su #");
ok(adonde("https://www.ajedrez-integral.com/") === "https://ajedrez-integral.com/", "la portada");
console.log("y donde ya está bien, no hace nada:");
ok(adonde("https://ajedrez-integral.com/sesion.html") === null, "el dominio sin www");
ok(adonde("http://localhost:8777/sesion.html") === null, "la computadora de quien programa");

if (fallas) { console.error("\n" + fallas + " falla(s)"); process.exit(1); }
console.log("\nTodo bien.");

/*! rev bfb5bbb0d2d82f9f */
