/* El programa para Windows (escritorio/), sin abrir Electron:
 *
 *   - las reglas (escritorio/reglas.js): qué es del sitio (solo https y el
 *     dominio exacto), qué se abre en el navegador (solo https de afuera;
 *     nunca file:, javascript: ni data:), qué permisos se dan (los cuatro de la
 *     lista y solo al sitio) y que cada herramienta del menú sea una página
 *     que existe;
 *   - la seguridad de main.js: páginas aisladas (contextIsolation, sandbox,
 *     sin Node, webSecurity), toda ventana nueva y toda navegación pasan por
 *     las reglas, se niegan los webview, y los permisos los decide reglas.js;
 *   - el paquete: versiones fijas (sin ^ ni ~), lo que se empaqueta existe, y
 *     la carpeta no se publica en el sitio (.assetsignore);
 *   - sin-conexion.html: su CSP y nada de código escrito dentro.
 *
 * Ver «El programa para Windows» en docs/decisiones/sitio-e-infraestructura.md.
 *
 *       node herramientas/verificar-todo.js escritorio
 */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DIR = path.join(RAIZ, "escritorio");
const R = require(path.join(DIR, "reglas.js"));
let fallos = 0;
const ok = (c, m, d) => { console.log("  " + (c ? "✓" : "✗") + " " + m + (c || d === undefined ? "" : "\n      " + d)); if (!c) fallos++; };

console.log("\n=== Las reglas ===");
ok(R.esDelSitio("https://ajedrez-integral.com/pareo.html#codigo"), "una página del sitio es del sitio");
ok(!R.esDelSitio("http://ajedrez-integral.com/pareo.html"), "sin https, no");
ok(!R.esDelSitio("https://ajedrez-integral.com.malo.com/"), "un dominio que solo empieza igual, no");
ok(!R.esDelSitio("https://otro.ajedrez-integral.com/"), "un subdominio, no");
ok(!R.esDelSitio("https://ajedrez-integral.com:8443/"), "otro puerto, no");
ok(!R.esDelSitio("no es una dirección"), "algo que no es una dirección, no");
ok(R.puedeAbrirAfuera("https://wa.me/50683092291"), "un enlace https de afuera se abre en el navegador");
for (const malo of ["javascript:alert(1)", "file:///C:/Windows/System32/cmd.exe", "data:text/html,hola", "http://ejemplo.com", "ms-settings:", "https://ajedrez-integral.com/pareo.html"]) {
  ok(!R.puedeAbrirAfuera(malo), "no se manda afuera: " + malo);
}
ok(R.esPaginaPropia("file:///C:/Programas/escritorio/sin-conexion.html?volver=x") && !R.esPaginaPropia("file:///C:/otra.html"), "la página propia es solo sin-conexion.html");
for (const p of ["media", "notifications", "clipboard-sanitized-write", "fullscreen"]) ok(R.permisoPermitido("https://ajedrez-integral.com/camaras.html", p), "el sitio puede pedir " + p);
for (const p of ["geolocation", "midi", "openExternal", "hid", "serial"]) ok(!R.permisoPermitido("https://ajedrez-integral.com/", p), "ni el sitio recibe " + p);
ok(!R.permisoPermitido("https://otro.com/", "media"), "otro sitio no recibe la cámara");
ok(R.HERRAMIENTAS.length >= 6 && R.HERRAMIENTAS.every((h) => fs.existsSync(path.join(RAIZ, h.ruta))), "cada herramienta del menú es una página que existe",
  R.HERRAMIENTAS.filter((h) => !fs.existsSync(path.join(RAIZ, h.ruta))).map((h) => h.ruta).join(", "));
ok(new Set(R.HERRAMIENTAS.map((h) => h.tecla)).size === R.HERRAMIENTAS.length, "sin dos atajos de teclado iguales");
ok(R.PARA_SIN_INTERNET.every((u) => R.esDelSitio(u) && fs.existsSync(path.join(RAIZ, new URL(u).pathname))), "lo que se prepara para usar sin internet son páginas del sitio que existen");
ok(R.esDelSitio(R.INICIO) && R.direccionDe("/pareo.html") === "https://ajedrez-integral.com/pareo.html" && R.direccionDe("/x.html") === null, "el inicio y las direcciones del menú");

console.log("\n=== La seguridad de main.js ===");
const main = fs.readFileSync(path.join(DIR, "main.js"), "utf8");
const pref = (main.match(/const preferencias = \{([^}]*)\}/) || [])[1] || "";
ok(/contextIsolation:\s*true/.test(pref) && /sandbox:\s*true/.test(pref) && /nodeIntegration:\s*false/.test(pref) && /webSecurity:\s*true/.test(pref),
  "las páginas corren aisladas: contextIsolation, sandbox, sin Node, webSecurity", pref.trim());
ok(!/webSecurity:\s*false|nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|allowRunningInsecureContent/.test(main), "nada lo desactiva en ningún lado");
ok((main.match(/webPreferences:\s*preferencias/g) || []).length >= 3, "toda ventana (la principal, las que abre el sitio, la escondida) usa esas preferencias");
ok(/setWindowOpenHandler\([\s\S]*?R\.esDelSitio\(url\)[\s\S]*?R\.puedeAbrirAfuera\(url\)[\s\S]*?action: "deny"/.test(main), "una ventana nueva: del sitio adentro, https de afuera al navegador, lo demás se niega");
ok(/"will-navigate"[\s\S]*?R\.esDelSitio\(url\) \|\| R\.esPaginaPropia\(url\)[\s\S]*?preventDefault\(\)/.test(main), "navegar fuera del sitio se corta");
ok(/"will-attach-webview"[\s\S]*?preventDefault\(\)/.test(main), "se niegan los webview");
ok(/setPermissionRequestHandler\([^)]*\)\s*=>\s*responder\(R\.permisoPermitido\(/.test(main) && /setPermissionCheckHandler\([\s\S]*?R\.permisoPermitido\(/.test(main), "los permisos los decide reglas.js");
ok((main.match(/shell\.openExternal\(/g) || []).length === (main.match(/R\.puedeAbrirAfuera\(url\)\) shell\.openExternal\(url\)|R\.esDelSitio\(ventana\.webContents\.getURL\(\)\) && shell\.openExternal\(/g) || []).length,
  "todo openExternal pasa antes por las reglas");
ok(/requestSingleInstanceLock\(\)/.test(main), "una sola copia del programa abierta");

console.log("\n=== El paquete ===");
const pkg = JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8"));
const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
ok(Object.values(deps).every((v) => /^\d+\.\d+\.\d+$/.test(v)), "versiones fijas, sin ^ ni ~", JSON.stringify(deps));
ok(fs.existsSync(path.join(DIR, "package-lock.json")), "con su package-lock.json");
ok(pkg.main === "main.js" && pkg.build.files.every((f) => fs.existsSync(path.join(DIR, f))), "lo que se empaqueta existe", pkg.build.files.join(", "));
ok(pkg.build.files.includes("reglas.js") && pkg.build.files.includes("sin-conexion.js"), "y va lo que main.js y sin-conexion.html usan");
const ignora = fs.readFileSync(path.join(RAIZ, ".assetsignore"), "utf8").split("\n").map((l) => l.trim());
ok(ignora.includes("escritorio"), "escritorio/ no se publica en el sitio (.assetsignore)");
const gi = fs.readFileSync(path.join(DIR, ".gitignore"), "utf8");
ok(/node_modules/.test(gi) && /dist/.test(gi), "node_modules y el instalador no van al repositorio");

console.log("\n=== sin-conexion.html ===");
const sc = fs.readFileSync(path.join(DIR, "sin-conexion.html"), "utf8");
ok(/Content-Security-Policy" content="default-src 'none'; script-src 'self'/.test(sc), "con su CSP: nada de afuera");
ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(sc) && !/\son[a-z]+=/i.test(sc), "sin código escrito dentro ni atributos on…");
ok(/https:\\\/\\\/ajedrez-integral\\\.com\\\//.test(fs.readFileSync(path.join(DIR, "sin-conexion.js"), "utf8")), "«Volver a intentar» solo lleva al sitio");

console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
