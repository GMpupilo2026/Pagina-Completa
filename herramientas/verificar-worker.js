/* Comprueba lo que decide worker.js: a qué dirección manda cada petición.
 *
 * Es poco código pero decide TODO lo que entra al sitio, y sus fallos son de
 * los que no se ven: una redirección que se come la parte de la dirección
 * después del dominio manda a la portada a quien venía a un curso, y nadie se
 * entera salvo la persona que se quedó mirando la página que no era.
 *
 * No hace falta ni Cloudflare ni internet: el worker es una función que recibe
 * una petición y devuelve una respuesta, así que se la llama y se mira qué
 * contesta. `env.ASSETS` se reemplaza por uno de mentira que solo apunta lo que
 * le pidieron.
 *
 * Uso:  node herramientas/verificar-worker.js
 */
const fs = require("fs");
const path = require("path");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = String(hallado), b = String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* worker.js es un módulo ES y este archivo no lo es, así que se carga por una
   dirección `data:`. Es el camino más corto para importarlo tal cual está, sin
   tener que cambiar el worker ni agregarle un package.json al repositorio. */
async function cargarWorker() {
  const fuente = fs.readFileSync(path.join(__dirname, "..", "worker.js"), "utf8");
  const mod = await import("data:text/javascript;base64," + Buffer.from(fuente).toString("base64"));
  return mod.default;
}

(async () => {
  const worker = await cargarWorker();

  // Un ASSETS de mentira: no sirve archivos, solo apunta qué le pidieron.
  let pedido = null;
  const env = { ASSETS: { fetch: (req) => { pedido = req.url; return new Response("ok", { status: 200 }); } } };
  const pedir = async (url) => {
    pedido = null;
    const res = await worker.fetch(new Request(url), env);
    return { estado: res.status, destino: res.headers.get("location"), aArchivos: pedido };
  };

  console.log("=== Lo normal pasa de largo ===");
  {
    const r = await pedir("https://ajedrez-integral.com/cursos/finales-practicos.html");
    igual("una dirección cualquiera se sirve, no se redirige", r.estado, 200);
    igual("y se le pide tal cual a los archivos", r.aArchivos,
      "https://ajedrez-integral.com/cursos/finales-practicos.html");
  }

  console.log("\n=== www manda al dominio sin www ===");
  {
    const r = await pedir("https://www.ajedrez-integral.com/");
    igual("redirige permanente", r.estado, 301);
    igual("al mismo sitio sin www", r.destino, "https://ajedrez-integral.com/");
  }
  {
    // Lo que más se rompe en estas redirecciones: perder lo que va después del
    // dominio y mandar a todo el mundo a la portada.
    const r = await pedir("https://www.ajedrez-integral.com/cursos/finales-practicos.html?de=whatsapp#tema3");
    igual("se conserva la dirección completa, con sus parámetros", r.destino,
      "https://ajedrez-integral.com/cursos/finales-practicos.html?de=whatsapp#tema3");
  }
  {
    const r = await pedir("https://ajedrez-integral.com/");
    igual("y el dominio sin www NO se redirige a sí mismo", r.estado, 200);
  }

  console.log("\n=== El curso que cambió de nombre ===");
  {
    const r = await pedir("https://ajedrez-integral.com/cursos/los-100-finales.html");
    igual("la dirección vieja sigue funcionando", r.estado, 301);
    igual("y lleva a la nueva", r.destino, "https://ajedrez-integral.com/cursos/el-mapa-de-los-finales.html");
  }
  {
    /* Las dos correcciones a la vez tienen que resolverse en UNA respuesta.
       Encadenadas, quien entra paga dos viajes y Google lo cuenta como salto
       de más — y es el error natural si cada arreglo devuelve lo suyo. */
    const r = await pedir("https://www.ajedrez-integral.com/cursos/los-100-finales.html");
    igual("www + dirección vieja se arreglan de una sola vez", r.destino,
      "https://ajedrez-integral.com/cursos/el-mapa-de-los-finales.html");
    igual("y en una sola redirección", r.estado, 301);
  }

  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
