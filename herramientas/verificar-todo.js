/* Corre las comprobaciones de herramientas/ de una sola vez.

   Hay más de setenta verificadores y cada uno dice en su cabecera qué
   necesita: unos no piden nada, otros un navegador y el sitio servido en
   localhost:8777, otros pypdf. Correr «el que toca» dependía de acordarse de
   cuál era, y eso no da ningún error: el día que alguien se olvida, el
   verificador que habría saltado simplemente no corre. Este script los junta
   para que sean UN comando, y es lo que corre el CI en cada PR.

   La lista NO está escrita acá: se lee de la carpeta. Una lista a mano se
   queda vieja, y el verificador nuevo que no se sumó a ella no corre nunca
   sin que nada lo avise. Qué necesita cada uno también se lee del archivo:

     - navegador: hace require("playwright"). Si el sitio no está servido en
       localhost:8777 (o en BASE), se levanta un servidor y se apaga al final.
     - Python: los .py. Usan PYTHON si está puesta, si no python3.

   Uso:
     node herramientas/verificar-todo.js                  todos
     node herramientas/verificar-todo.js --sin-navegador  solo los que no abren navegador
                                                          (los que aceptan --sin-navegador
                                                          corren su parte sin navegador)
     node herramientas/verificar-todo.js --solo-navegador solo los de navegador
     node herramientas/verificar-todo.js --parte=2/4      la segunda de cuatro tandas
                                                          (para repartir en el CI)
     node herramientas/verificar-todo.js --paralelo=3     de a tres a la vez
     node herramientas/verificar-todo.js panel tareas     solo los que se llaman así
*/
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const RAIZ = path.resolve(__dirname, "..");
const CARPETA = __dirname;
const BASE = process.env.BASE || "http://localhost:8777";
const PYTHON = process.env.PYTHON || "python3";
const TOPE_MS = 10 * 60 * 1000;

/* Lo que tiene que correr ANTES de un verificador, porque comprueba algo que
   se genera y no se commitea (herramientas/planes/ está en .gitignore). */
const ANTES = {
  "verificar-planes-semilla.js": [["node", ["herramientas/planes-semilla.js"]]],
};

/* verificar-reportes.py no corre solo: revisa los archivos que deja
   verificar-reportes.js en una carpeta temporal, y esa carpeta la dice el de
   JavaScript al terminar. Se encadena ahí (ver DESPUES) y no se lista aparte,
   o fallaría siempre por no tener carpeta que mirar. */
const ENCADENADOS = new Set(["verificar-reportes.py"]);
const DESPUES = {
  "verificar-reportes.js": (salida) => {
    const m = salida.match(/Los dos archivos quedaron en: (.+)/);
    if (!m) return null;
    return [PYTHON, ["herramientas/verificar-reportes.py", m[1].trim()]];
  },
};

// ------------------------------------------------------------ argumentos
const args = process.argv.slice(2);
const bandera = (n) => args.includes(n);
const valor = (n) => {
  const a = args.find((x) => x.startsWith(n + "="));
  return a ? a.slice(n.length + 1) : null;
};
const sinNavegador = bandera("--sin-navegador");
const soloNavegador = bandera("--solo-navegador");
const paralelo = Math.max(1, parseInt(valor("--paralelo") || "1", 10));
const parte = valor("--parte");
const nombres = args.filter((a) => !a.startsWith("--"));

// ------------------------------------------------------------ la lista
function leerVerificadores() {
  return fs.readdirSync(CARPETA)
    .filter((f) => /^verificar-.+\.(js|py)$/.test(f))
    .filter((f) => f !== "verificar-todo.js" && !ENCADENADOS.has(f))
    .sort()
    .map((archivo) => {
      const texto = fs.readFileSync(path.join(CARPETA, archivo), "utf8");
      const py = archivo.endsWith(".py");
      return {
        archivo,
        nombre: archivo.replace(/^verificar-/, "").replace(/\.(js|py)$/, ""),
        py,
        navegador: !py && /require\(\s*["']playwright["']\s*\)/.test(texto),
        aceptaSinNavegador: /--sin-navegador/.test(texto),
      };
    });
}

let lista = leerVerificadores();
if (nombres.length) {
  lista = lista.filter((v) => nombres.some((n) => v.nombre === n || v.archivo === n));
  const faltan = nombres.filter((n) => !lista.some((v) => v.nombre === n || v.archivo === n));
  if (faltan.length) { console.error("No existe: " + faltan.join(", ")); process.exit(2); }
}
if (sinNavegador) lista = lista.filter((v) => !v.navegador || v.aceptaSinNavegador);
if (soloNavegador) lista = lista.filter((v) => v.navegador);
if (parte) {
  const [i, n] = parte.split("/").map((x) => parseInt(x, 10));
  if (!(i >= 1 && n >= 1 && i <= n)) { console.error("--parte va como 2/4"); process.exit(2); }
  lista = lista.filter((_, k) => k % n === i - 1);
}

// ------------------------------------------------------------ correr
function correr(cmd, argv, extraEnv) {
  return new Promise((resolve) => {
    let salida = "";
    const hijo = spawn(cmd, argv, { cwd: RAIZ, env: Object.assign({}, process.env, extraEnv) });
    const tope = setTimeout(() => { salida += "\n[verificar-todo] pasó de 10 minutos, se cortó\n"; hijo.kill("SIGKILL"); }, TOPE_MS);
    hijo.stdout.on("data", (d) => { salida += d; });
    hijo.stderr.on("data", (d) => { salida += d; });
    hijo.on("error", (e) => { salida += "\n" + e.message; });
    hijo.on("close", (codigo) => { clearTimeout(tope); resolve({ codigo: codigo === null ? 1 : codigo, salida }); });
  });
}

async function uno(v) {
  const inicio = Date.now();
  let salida = "";
  for (const [cmd, argv] of ANTES[v.archivo] || []) {
    const r = await correr(cmd, argv);
    salida += r.salida;
    if (r.codigo !== 0) return { v, codigo: r.codigo, salida, ms: Date.now() - inicio };
  }
  const argv = [path.join("herramientas", v.archivo)];
  if (sinNavegador && v.navegador) argv.push("--sin-navegador");
  let r = await correr(v.py ? PYTHON : "node", argv, { BASE });
  salida += r.salida;
  let codigo = r.codigo;
  const siguiente = codigo === 0 && DESPUES[v.archivo] && !(sinNavegador && v.navegador) ? DESPUES[v.archivo](r.salida) : null;
  if (siguiente) {
    r = await correr(siguiente[0], siguiente[1]);
    salida += "\n--- " + siguiente[1][0] + " ---\n" + r.salida;
    codigo = r.codigo;
  }
  return { v, codigo, salida, ms: Date.now() - inicio };
}

// ------------------------------------------------------------ el sitio
function responde(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

async function asegurarSitio() {
  if (await responde(BASE + "/index.html")) return null;
  const puerto = new URL(BASE).port || "80";
  const servidor = spawn(PYTHON, ["-m", "http.server", puerto, "--bind", "127.0.0.1"], { cwd: RAIZ, stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    if (await responde(BASE + "/index.html")) {
      console.log("Sitio servido en " + BASE + " (se apaga al terminar)\n");
      return servidor;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  servidor.kill();
  console.error("No se pudo servir el sitio en " + BASE);
  process.exit(2);
}

// ------------------------------------------------------------ todo junto
(async () => {
  if (!lista.length) { console.log("No hay nada que correr con esos filtros."); return; }
  const servidor = lista.some((v) => v.navegador && !sinNavegador) ? await asegurarSitio() : null;

  console.log("Corriendo " + lista.length + " verificador(es)" + (paralelo > 1 ? ", de a " + paralelo : "") + "\n");
  const resultados = [];
  const cola = lista.slice();
  async function obrero() {
    while (cola.length) {
      const res = await uno(cola.shift());
      resultados.push(res);
      const seg = (res.ms / 1000).toFixed(0).padStart(4) + " s";
      console.log((res.codigo === 0 ? "  ✓ " : "  ✗ ") + seg + "  " + res.v.archivo);
    }
  }
  await Promise.all(Array.from({ length: Math.min(paralelo, lista.length) }, obrero));
  if (servidor) servidor.kill();

  const malos = resultados.filter((r) => r.codigo !== 0);
  for (const r of malos) {
    const cola = r.salida.trimEnd().split("\n").slice(-40).join("\n");
    console.log("\n──────── " + r.v.archivo + " (salida " + r.codigo + ") ────────\n" + cola);
  }
  console.log("\n" + (malos.length
    ? malos.length + " de " + resultados.length + " fallaron: " + malos.map((r) => r.v.nombre).join(", ")
    : "Todo bien: " + resultados.length + " verificador(es)."));
  process.exit(malos.length ? 1 : 0);
})();
