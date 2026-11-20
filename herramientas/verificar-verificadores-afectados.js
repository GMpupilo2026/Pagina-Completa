/* Verifica la elección de verificadores por cambio (lib/verificadores-afectados.js).

   El CI corre en cada PR solo los verificadores que leen algo de lo que
   cambió. Si esa elección deja afuera uno que hacía falta, la página rota se
   mergea con el CI en verde y nadie se entera: por eso lo que importa acá es
   que ANTE LA DUDA corran todos. Se comprueba con el repositorio real:

     1. lo que usan todos (el corredor, package.json) hace correr todos;
     2. un archivo nuevo que ningún verificador nombra hace correr todos;
     3. un módulo hace correr a quien lo carga A TRAVÉS de una página, aunque
        el verificador no lo nombre (la cadena verificador → HTML → JS);
     4. los que recorren carpetas corren siempre;
     5. lo que no afecta a nadie (documentación, una foto) no hace correr todos,
        y un cambio chico elige pocos (si no, no sirve de nada).

   Uso: node herramientas/verificar-verificadores-afectados.js */
"use strict";

const fs = require("fs");
const path = require("path");
const { afectados, crearLector, archivosDelRepo } = require("./lib/verificadores-afectados");

const RAIZ = path.resolve(__dirname, "..");
let fallos = 0;
const bien = (m) => console.log("  ✓ " + m);
const mal = (m) => { fallos += 1; console.log("  ✗ " + m); };
const comprobar = (ok, m) => (ok ? bien(m) : mal(m));

const verificadores = fs.readdirSync(__dirname)
  .filter((f) => /^verificar-.+\.(js|py)$/.test(f) && f !== "verificar-todo.js");
const lector = crearLector(archivosDelRepo());
const barren = verificadores.filter((v) => lector.barre("herramientas/" + v));

console.log("Lo que usan todos:");
for (const f of ["herramientas/verificar-todo.js", "package.json", "package-lock.json", ".github/workflows/verificar.yml", "herramientas/lib/navegador-local.js"]) {
  comprobar(afectados([f], verificadores).todos, f + " hace correr todos");
}

console.log("Un archivo que nadie nombra:");
const nuevo = path.join(RAIZ, "js", "zz-prueba-que-nadie-nombra.js");
try {
  fs.writeFileSync(nuevo, "// prueba de verificar-verificadores-afectados.js\n");
  const r = afectados(["js/zz-prueba-que-nadie-nombra.js"], verificadores);
  comprobar(r.todos, "un .js nuevo que ningún verificador nombra hace correr todos");
} finally {
  fs.unlinkSync(nuevo);
}

console.log("La cadena verificador → página → módulo:");
{
  const r = afectados(["js/vendor/chess.js"], verificadores);
  const porCadena = r.todos ? [] : [...r.elegidos].filter((v) =>
    !barren.includes(v) && !fs.readFileSync(path.join(__dirname, v), "utf8").includes("chess.js"));
  comprobar(!r.todos && porCadena.length > 0,
    "js/vendor/chess.js elige verificadores que no lo nombran pero abren una página que lo carga (" + porCadena.length + ", p. ej. " + (porCadena[0] || "ninguno") + ")");
}
{
  // Un verificador que abre una página por su nombre: cambiar el JS de esa
  // página tiene que elegirlo.
  const r = afectados(["js/torneos-pareo-pagina.js"], verificadores);
  const quienAbre = verificadores.filter((v) => !barren.includes(v) &&
    /goto\([^)\n]*torneos-pareo\.html/.test(fs.readFileSync(path.join(__dirname, v), "utf8")));
  const faltan = quienAbre.filter((v) => r.todos || !r.elegidos.has(v));
  comprobar(quienAbre.length > 0 && !faltan.length,
    "js/torneos-pareo-pagina.js elige a los " + quienAbre.length + " que abren torneos-pareo.html (también con `${BASE}/torneos-pareo.html`)" + (faltan.length ? "; faltan: " + faltan.join(", ") : ""));
}

console.log("Los que recorren carpetas:");
{
  const r = afectados(["docs/decisiones/paneles.md"], verificadores);
  comprobar(barren.length > 0 && !r.todos && barren.every((v) => r.elegidos.has(v)),
    "los " + barren.length + " que recorren carpetas corren aunque solo cambie la documentación");
}

console.log("Lo que no afecta a nadie:");
{
  const r = afectados(["docs/decisiones/paneles.md", "img/herramientas/reclamos-tablas.jpg"], verificadores);
  comprobar(!r.todos && [...r.elegidos].every((v) => barren.includes(v)),
    "documentación y una foto que nadie nombra: corren solo los que recorren carpetas");
}
{
  const r = afectados(["js/torneos-pareo-pagina.js"], verificadores);
  const n = r.todos ? verificadores.length : r.elegidos.size;
  comprobar(n < verificadores.length / 2, "un cambio en una sola página elige menos de la mitad (" + n + " de " + verificadores.length + ")");
}
{
  // Un comentario que nombra un archivo no es cargarlo («ver js/x.js»): si
  // contara, cada módulo arrastraría a decenas de verificadores de más. Una
  // ruta en una cadena, aunque sea de plantilla, sí cuenta.
  const prueba = "js/zz-prueba-comentarios.js";
  const repo = archivosDelRepo();
  repo.add(prueba);
  try {
    fs.writeFileSync(path.join(RAIZ, prueba),
      "/* ver js/hora-cr.js */\n// y js/avisos.js\nconst a = \"js/marca-agua.js\";\nconst b = `${base}/js/errores.js?v=2`;\n");
    const n = crearLector(repo).nombrados(prueba, false);
    comprobar(!n.has("js/hora-cr.js") && !n.has("js/avisos.js"), "lo que un comentario nombra no es dependencia");
    comprobar(n.has("js/marca-agua.js") && n.has("js/errores.js"), "lo que una cadena nombra sí (también `${base}/js/errores.js?v=2`)");
  } finally {
    fs.unlinkSync(path.join(RAIZ, prueba));
  }
}

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
