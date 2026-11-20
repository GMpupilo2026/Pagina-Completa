#!/usr/bin/env node
/*
 * El despliegue de las Edge Functions desde GitHub (.github/workflows/funciones.yml).
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - una función nueva sin anotar en funciones-desplegadas.txt hace fallar el
 *    despliegue el día que se mergea, no antes;
 *  - un archivo de _compartido/ que cambia y no redespliega a las funciones que
 *    lo llevan deja corriendo la copia vieja;
 *  - el flujo desplegando al proyecto equivocado, o con una versión de la
 *    herramienta que cambia sola.
 *
 * Sin red ni navegador.  node herramientas/verificar-funciones-despliegue.js
 * Ver «Las Edge Functions se despliegan solas desde GitHub» en
 * docs/decisiones/sitio-e-infraestructura.md.
 */
const fs = require("fs");
const path = require("path");
const { deCambios, verifyJwtDe } = require("./funciones-desplegar.js");
const { FUNCIONES } = require("./funciones-armar.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function ok(cond, texto, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + texto + (cond || !detalle ? "" : "\n      " + detalle));
  if (!cond) fallos++;
}

const FUNC = path.join(RAIZ, "supabase", "functions");
const carpetas = fs.readdirSync(FUNC).filter((d) => fs.existsSync(path.join(FUNC, d, "index.ts")));
const jwt = verifyJwtDe();

console.log("\nLa lista de funciones desplegadas");
const sinAnotar = carpetas.filter((d) => !jwt.has(d));
ok(!sinAnotar.length, "cada función del repositorio está anotada con su verify_jwt", "faltan: " + sinAnotar.join(", "));
ok(jwt.get("centroamericano-mesa") === false && jwt.get("arbitro-cuentas") === true && jwt.get("centroamericano-clave") === true,
  "lee bien el verify_jwt (centroamericano-mesa en false; arbitro-cuentas y centroamericano-clave en true)");

console.log("\nQué se despliega");
ok(JSON.stringify(deCambios(["supabase/functions/centroamericano-clave/index.ts", "docs/x.md"])) === '["centroamericano-clave"]',
  "un cambio en la carpeta de una función despliega esa función");
const conIngreso = Object.entries(FUNCIONES).filter(([, l]) => l.includes("chess-results-ingreso.ts")).map(([n]) => n).sort();
ok(conIngreso.length >= 3 && JSON.stringify(deCambios(["supabase/functions/_compartido/chess-results-ingreso.ts"])) === JSON.stringify(conIngreso),
  "un archivo de _compartido/ despliega todas las que lo llevan (" + conIngreso.join(", ") + ")");
ok(deCambios(["supabase/functions/README.md"]).length === 0, "el README de la carpeta no despliega nada");

console.log("\nEl flujo");
const flujo = fs.readFileSync(path.join(RAIZ, ".github", "workflows", "funciones.yml"), "utf8");
const proyecto = (fs.readFileSync(path.join(RAIZ, "js", "supabase-client.js"), "utf8").match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
ok(proyecto && new RegExp("PROYECTO: " + proyecto + "\\b").test(flujo), "despliega al proyecto de la Academia (" + proyecto + ")");
ok(/branches: \[main\]/.test(flujo) && /paths: \["supabase\/functions\/\*\*"\]/.test(flujo), "corre al entrar a main un cambio en supabase/functions/");
ok(/node herramientas\/funciones-desplegar\.js --cambios/.test(flujo) && /--no-verify-jwt/.test(flujo) && /"\$jwt" = "false"/.test(flujo),
  "arma con funciones-desplegar.js y pone --no-verify-jwt solo a las que van en false");
ok(/version: \d+\.\d+\.\d+/.test(flujo), "la herramienta de Supabase va con su versión fijada");
ok(/secrets\.SUPABASE_ACCESS_TOKEN/.test(flujo) && !/sbp_[A-Za-z0-9]/.test(flujo), "la clave sale del secreto del repositorio, nunca escrita en el flujo");
// Las líneas de cada `run:` (las más indentadas que siguen) no llevan ningún ${{ … }}: todo entra por env.
const lineasRun = [];
{
  let sangria = -1;
  for (const l of flujo.split("\n")) {
    const m = l.match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (m) { sangria = m[1].length; lineasRun.push(m[2]); continue; }
    if (sangria >= 0 && l.trim() && l.match(/^\s*/)[0].length > sangria) lineasRun.push(l);
    else if (l.trim()) sangria = -1;
  }
}
ok(lineasRun.length > 10 && !lineasRun.some((l) => /\$\{\{/.test(l)),
  "lo que llega de afuera (el pedido a mano) entra por variables de entorno, nunca pegado en un comando", lineasRun.filter((l) => /\$\{\{/.test(l)).join(" | "));
ok(/cancel-in-progress: false/.test(flujo), "nunca dos despliegues a la vez");

console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nEl despliegue de las funciones está como se pidió.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
