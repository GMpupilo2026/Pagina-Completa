#!/usr/bin/env node
/* Las Edge Functions se llaman con el token de AHORA, no con el que había al
   cargar la página. Ver «El token de una Edge Function se pide en el momento»
   en docs/decisiones/sitio-e-infraestructura.md.

   Lo que se rompe callado: una página guarda `session` al cargar y después
   manda `Bearer ${session.access_token}`. A la hora ese token vence
   (supabase-js lo renueva por dentro, la variable no se entera) y la puerta de
   Supabase contesta 401 sin el campo `error`: la pantalla decía «Error
   desconocido» al crear una cuenta en admin.html (6 de octubre).

   Revisa:
   - que ningún archivo de js/ mande `session.access_token` en un
     Authorization ni se lo pase a PlanillaOcr.leerFoto;
   - que toda página que carga un js/ que usa tokenDeSesion/errorDeFuncion
     cargue también js/token-sesion.js, y después de supabase-client.js.

       node herramientas/verificar-token-sesion.js
*/
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const JS = path.join(RAIZ, "js");
let fallas = 0;
const mal = (m) => { fallas++; console.log("  ✗ " + m); };
const bien = (m) => console.log("  ✓ " + m);

const PROHIBIDO = [
  /Bearer \$\{session\.access_token\}/,
  /leerFoto\([^)]*session\.access_token/,
];

const usan = [];
for (const nombre of fs.readdirSync(JS)) {
  if (!nombre.endsWith(".js") || nombre === "token-sesion.js") continue;
  const texto = fs.readFileSync(path.join(JS, nombre), "utf8");
  texto.split("\n").forEach((linea, i) => {
    for (const re of PROHIBIDO) if (re.test(linea)) mal(`js/${nombre}:${i + 1} usa el token guardado al cargar: ${linea.trim()}`);
  });
  if (/window\.(tokenDeSesion|errorDeFuncion)\b/.test(texto)) usan.push(nombre);
}
bien(`ningún js/ manda el token guardado al cargar (${usan.length} usan tokenDeSesion)`);

const paginas = [];
const recorrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/^(node_modules|\.git|docs|supabase|herramientas)$/.test(e.name)) recorrer(p); }
    else if (e.name.endsWith(".html")) paginas.push(p);
  }
};
recorrer(RAIZ);

for (const p of paginas) {
  const html = fs.readFileSync(p, "utf8");
  const rel = path.relative(RAIZ, p);
  const necesita = usan.filter((n) => new RegExp(`src="[^"]*js/${n.replace(/\./g, "\\.")}"`).test(html));
  if (!necesita.length) continue;
  const iToken = html.search(/src="[^"]*js\/token-sesion\.js"/);
  const iCliente = html.search(/src="[^"]*js\/supabase-client\.js"/);
  if (iToken < 0) mal(`${rel} carga ${necesita.join(", ")} y no js/token-sesion.js`);
  else if (iCliente < 0 || iToken < iCliente) mal(`${rel}: js/token-sesion.js va después de js/supabase-client.js`);
  else bien(`${rel} carga js/token-sesion.js`);
}

if (fallas) { console.log(`\n${fallas} problema(s).`); process.exit(1); }
console.log("\nTodo bien.");
