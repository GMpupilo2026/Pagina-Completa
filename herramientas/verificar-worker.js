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

  console.log("\n=== El candado de los cursos ===");
  /* Sin red: el worker le pregunta a Supabase con fetch(), así que se cambia
     fetch por uno de mentira que apunta qué le pidieron y contesta lo que
     cada caso necesita. */
  const raiz = path.join(__dirname, "..");
  const fuenteWorker = fs.readFileSync(path.join(raiz, "worker.js"), "utf8");
  const fuenteCliente = fs.readFileSync(path.join(raiz, "js", "supabase-client.js"), "utf8");
  const valor = (fuente, nombre) => ((fuente.match(new RegExp(nombre + "\\s*=\\s*\"([^\"]+)\"")) || [])[1]);
  const URL_SB = valor(fuenteWorker, "SUPABASE_URL");
  {
    // Si se separan, el worker le pregunta a otro proyecto (o con una clave
    // vieja) y rechaza a todo el mundo: exactamente la falla del candado de antes.
    igual("la dirección de Supabase es la misma que usa el sitio", URL_SB, valor(fuenteCliente, "SUPABASE_URL"));
    igual("la clave pública también", valor(fuenteWorker, "SUPABASE_ANON_KEY") === valor(fuenteCliente, "SUPABASE_ANON_KEY"), true);
    igual("y el nombre de la cookie", valor(fuenteWorker, "COOKIE"), (fuenteCliente.match(/var NOMBRE = "([^"]+)"/) || [])[1]);
    // Sin run_worker_first, Cloudflare sirve el archivo sin pasar por el
    // worker: el candado está escrito pero no existe.
    const wr = JSON.parse(fs.readFileSync(path.join(raiz, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
    const primero = (wr.assets && wr.assets.run_worker_first) || [];
    igual("wrangler.jsonc hace correr el worker en cursos/protegido/", primero.includes("/cursos/protegido/*"), true);
    igual("y en cursos/recursos/", primero.includes("/cursos/recursos/*"), true);
  }

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = (extra = {}) => b64({ alg: "HS256", typ: "JWT" }) + "." + b64({
    iss: URL_SB + "/auth/v1", role: "authenticated", sub: "u-" + Math.random(),
    exp: Math.floor(Date.now() / 1000) + 3600, ...extra }) + ".firma";

  let preguntas = [];
  let contesta = () => new Response("true", { status: 200 });
  globalThis.fetch = async (u, opciones) => { preguntas.push({ u: String(u), opciones }); return contesta(); };
  const abrir = async (ruta, { cookie, pagina } = {}) => {
    pedido = null; preguntas = [];
    const headers = {};
    if (cookie) headers.Cookie = "otra=1; ai_sesion_cursos=" + cookie + "; y=2";
    if (pagina) { headers["Sec-Fetch-Mode"] = "navigate"; headers.Accept = "text/html"; }
    const res = await worker.fetch(new Request("https://ajedrez-integral.com" + ruta, { headers }), env);
    return { estado: res.status, aArchivos: !!pedido, preguntas, cuerpo: await res.text(), cache: res.headers.get("cache-control"),
      csp: res.headers.get("content-security-policy"), xfo: res.headers.get("x-frame-options") };
  };
  const PDF = "/cursos/recursos/finales-practicos/01-la-oposicion-material.pdf";
  {
    const r = await abrir(PDF);
    igual("sin cookie, el material no se sirve", r.estado, 401);
    igual("ni se le pide a los archivos", r.aArchivos, false);
    igual("ni se le pregunta a Supabase", r.preguntas.length, 0);
  }
  {
    const r = await abrir(PDF, { pagina: true });
    igual("abierto como página, explica y ofrece iniciar sesión", r.cuerpo.includes("Iniciar sesión"), true);
    igual("y vuelve a la portada de SU curso (el login solo acepta .html)",
      r.cuerpo.includes("login.html?next=cursos%2Ffinales-practicos.html"), true);
    // _headers no se aplica a lo que arma el worker: sin esto la página sale
    // sin CSP ni X-Frame-Options, y nada lo avisa.
    igual("con sus propias cabeceras de seguridad", !!(r.csp && r.csp.includes("frame-ancestors 'none'")) && r.xfo === "DENY", true);
  }
  {
    // Con Supabase contestando, decide Supabase: si el "iss" de los tokens
    // cambiara de forma, el worker no puede dejar afuera a todo el mundo.
    contesta = () => new Response("true", { status: 200 });
    const r = await abrir(PDF, { cookie: token({ iss: "https://auth.otra-forma.com" }) });
    igual("un iss de otra forma no decide si Supabase dice que vale", r.estado, 200);
  }
  {
    const r = await abrir(PDF, { cookie: token({ exp: Math.floor(Date.now() / 1000) - 10 }) });
    igual("uno vencido también", r.estado + "/" + r.preguntas.length, "401/0");
  }
  {
    const r = await abrir(PDF, { cookie: "esto-no-es-un-token" });
    igual("y una cookie que no es un token", r.estado + "/" + r.preguntas.length, "401/0");
  }
  const bueno = token();
  {
    contesta = () => new Response("true", { status: 200 });
    const r = await abrir(PDF, { cookie: bueno });
    igual("con sesión y acceso vigente, se sirve", r.estado, 200);
    igual("desde los archivos", r.aArchivos, true);
    const p = r.preguntas[0] || { opciones: { headers: {} } };
    igual("le pregunta a acceso_vigente() del proyecto", p.u, URL_SB + "/rest/v1/rpc/acceso_vigente");
    igual("con el token de la persona", p.opciones.headers.Authorization, "Bearer " + bueno);
    igual("y con la clave pública", p.opciones.headers.apikey === valor(fuenteCliente, "SUPABASE_ANON_KEY"), true);
    igual("el navegador tiene que volver a preguntar antes de reusarlo", r.cache, "private, no-cache");
  }
  {
    const r = await abrir("/cursos/protegido/finales-practicos.html", { cookie: bueno });
    igual("el mismo token no vuelve a preguntar en cada archivo", r.estado + "/" + r.preguntas.length, "200/0");
  }
  {
    contesta = () => new Response("false", { status: 200 });
    const r = await abrir("/cursos/protegido/data/partidas-modelo.json", { cookie: token() });
    igual("con sesión pero sin acceso vigente: 403", r.estado, 403);
    const n = await abrir("/cursos/protegido/partidas-modelo.html", { cookie: token(), pagina: true });
    igual("y como página lo dice y manda al panel", n.cuerpo.includes("no está activo") && n.cuerpo.includes("/clases.html"), true);
  }
  {
    contesta = () => new Response('{"code":"PGRST301","message":"JWT expired"}', { status: 401 });
    const r = await abrir(PDF, { cookie: token() });
    igual("un token que Supabase rechaza: 401", r.estado, 401);
  }
  {
    /* Si Supabase no contesta, se deja pasar: una red caída no puede dejar sin
       su material a todos los que pagaron (la regla de acceso-vigente.js). */
    contesta = () => { throw new Error("red caída"); };
    const r = await abrir(PDF, { cookie: token() });
    igual("Supabase sin red: pasa", r.estado, 200);
    contesta = () => new Response("", { status: 503 });
    const r2 = await abrir(PDF, { cookie: token() });
    igual("Supabase con un 5xx: pasa", r2.estado, 200);
    const r3 = await abrir(PDF, { cookie: token({ iss: "https://otro.supabase.co/auth/v1" }) });
    igual("pero ni así pasa un token que no es de este proyecto", r3.estado, 401);
  }
  {
    const r = await abrir("/cursos/finales-practicos.html");
    igual("la portada del curso sigue pública", r.estado + "/" + r.preguntas.length, "200/0");
    const r2 = await abrir("/cursos.html");
    igual("y el catálogo", r2.estado, 200);
  }
  {
    const r = await pedir("https://ajedrez-integral.com/cursos/recursos/los-100-finales/01.pdf");
    igual("la dirección vieja de un recurso redirige antes del candado", r.estado, 301);
  }

  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
