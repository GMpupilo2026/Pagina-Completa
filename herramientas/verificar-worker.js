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
    igual("y en material/ (los libros que se venden sueltos)", primero.includes("/material/*"), true);
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
  const PDF = "/cursos/recursos/el-mapa-de-los-finales/01-rey-y-peon-contra-rey-material.pdf";
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
      r.cuerpo.includes("login.html?next=cursos%2Fel-mapa-de-los-finales.html"), true);
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
    // Un recurso de un curso se vende suelto: se pregunta por ESE producto, y
    // con el acceso vigente basta (lo bajan también los alumnos).
    igual("le pregunta a puede_bajar() del proyecto", p.u, URL_SB + "/rest/v1/rpc/puede_bajar");
    igual("por el producto de la carpeta, y con el acceso basta", p.opciones.body,
      JSON.stringify({ p_producto: "el-mapa-de-los-finales", p_basta_acceso: true }));
    igual("con el token de la persona", p.opciones.headers.Authorization, "Bearer " + bueno);
    igual("y con la clave pública", p.opciones.headers.apikey === valor(fuenteCliente, "SUPABASE_ANON_KEY"), true);
    igual("el navegador tiene que volver a preguntar antes de reusarlo", r.cache, "private, no-cache");
  }
  {
    const r = await abrir("/cursos/recursos/el-mapa-de-los-finales/02-otro-archivo.pdf", { cookie: bueno });
    igual("el mismo token no vuelve a preguntar en cada archivo del producto", r.estado + "/" + r.preguntas.length, "200/0");
  }
  {
    // La respuesta se guarda por token Y producto: guardada solo por token,
    // haber comprado un material abría todos los demás.
    const r = await abrir("/cursos/recursos/partidas-modelo/01.pdf", { cookie: bueno });
    igual("otro producto vuelve a preguntar", r.preguntas.length, 1);
    igual("por ESE producto", (r.preguntas[0] || {}).opciones && r.preguntas[0].opciones.body,
      JSON.stringify({ p_producto: "partidas-modelo", p_basta_acceso: true }));
  }
  {
    const r = await abrir("/cursos/protegido/el-mapa-de-los-finales.html", { cookie: token() });
    igual("el contenido de los cursos sigue preguntando acceso_vigente()", (r.preguntas[0] || {}).u, URL_SB + "/rest/v1/rpc/acceso_vigente");
  }
  {
    const r = await abrir("/material/libro-de-diagnostico/libro-de-diagnostico.pdf", { cookie: token() });
    igual("un libro suelto pregunta por su compra, sin que el acceso baste", (r.preguntas[0] || {}).opciones && r.preguntas[0].opciones.body,
      JSON.stringify({ p_producto: "libro-de-diagnostico", p_basta_acceso: false }));
    const s2 = await abrir("/material/libro-de-diagnostico/libro-de-diagnostico.pdf");
    igual("y sin sesión no se sirve", s2.estado + "/" + s2.aArchivos, "401/false");
    const s3 = await abrir("/material/suelto.pdf", { cookie: token() });
    igual("material/ sin carpeta de producto no es nada que se venda: no se sirve ni se pregunta", s3.estado + "/" + s3.preguntas.length, "403/0");
    contesta = () => new Response("false", { status: 200 });
    const n = await abrir("/material/examen-de-arbitraje/examen-de-arbitraje.pdf", { cookie: token(), pagina: true });
    igual("sin compra, como página dice que se compra aparte", n.estado + "/" + n.cuerpo.includes("se compra aparte"), "403/true");
    contesta = () => new Response("true", { status: 200 });
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
    // Los cursos escondidos: la lista del worker es la de js/cursos-ocultos.js.
    // Si se separan, uno se pinta escondido y se sigue bajando (o al revés).
    const delCliente = (fs.readFileSync(path.join(raiz, "js", "cursos-ocultos.js"), "utf8").match(/var SLUGS = \[([^\]]*)\]/) || [])[1] || "";
    const delWorker = (fuenteWorker.match(/const OCULTOS = new Set\(\[([^\]]*)\]/) || [])[1] || "";
    const lista = (t) => (t.match(/"[a-z0-9-]+"/g) || []).sort().join(",");
    igual("los cursos escondidos son los mismos en el worker y en el navegador", lista(delWorker), lista(delCliente));
    igual("y la lista no está vacía", lista(delCliente).length > 0, true);

    contesta = () => new Response("false", { status: 200 });
    const r = await abrir("/cursos/protegido/fundamentos-del-ajedrez.html", { cookie: token() });
    igual("el contenido de un curso escondido pregunta puede_bajar()", (r.preguntas[0] || {}).u, URL_SB + "/rest/v1/rpc/puede_bajar");
    igual("sin que el acceso a la Academia baste", (r.preguntas[0] || {}).opciones && r.preguntas[0].opciones.body,
      JSON.stringify({ p_producto: "fundamentos-del-ajedrez", p_basta_acceso: false }));
    igual("y a quien no es de administración no se le sirve", r.estado + "/" + r.aArchivos, "403/false");
    const d = await abrir("/cursos/recursos/preparacion-para-torneos/01.pdf", { cookie: token() });
    igual("su material tampoco, aunque tenga el acceso vigente", d.estado + "/" + (d.preguntas[0] || {}).opciones.body,
      "403/" + JSON.stringify({ p_producto: "preparacion-para-torneos", p_basta_acceso: false }));
    const n = await abrir("/cursos/protegido/finales-practicos.html", { cookie: token(), pagina: true });
    igual("como página dice que el curso no está disponible", n.cuerpo.includes("no está disponible") && n.cuerpo.includes("/cursos/academia/index.html"), true);
    contesta = () => new Response("true", { status: 200 });
    const a = await abrir("/cursos/protegido/estrategia-y-tactica.html", { cookie: token() });
    igual("administración (puede_bajar dice que sí) lo sigue abriendo", a.estado + "/" + a.aArchivos, "200/true");
    const v = await abrir("/cursos/protegido/el-mapa-de-los-finales.html", { cookie: token() });
    igual("un curso que no está escondido sigue con acceso_vigente()", (v.preguntas[0] || {}).u, URL_SB + "/rest/v1/rpc/acceso_vigente");
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

  console.log("\n=== La tarjeta de un torneo de Pareo Integral (/t/<id>) ===");
  {
    const wr = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
    igual("wrangler.jsonc hace correr el worker en /t/ (sin esa línea la dirección da 404)", wr.assets.run_worker_first.includes("/t/*"), true);
    const ID = "11111111-1111-4111-8111-111111111111";
    let preguntas = [];
    const tarjeta = async (url, contesta) => {
      preguntas = [];
      globalThis.fetch = async (u, opciones) => { preguntas.push({ u: String(u), opciones }); return contesta(); };
      pedido = null;
      const res = await worker.fetch(new Request(url), env);
      return { estado: res.status, html: await res.text(), cabeceras: res.headers, aArchivos: pedido };
    };
    const fila = { nombre: "Abierto <de> Prueba", evento: "Festival", lugar: "San José", fecha: "2026-10-22", fin: "2026-10-24", rondas: 3, rondas_total: 7, jugadores: 55, elo: "fide", ritmo: "90 min + 30 s" };
    const r = await tarjeta("https://ajedrez-integral.com/t/" + ID, () => new Response(JSON.stringify([fila]), { status: 200 }));
    igual("contesta el worker, no los archivos", r.estado + "/" + r.aArchivos, "200/null");
    igual("pregunta a la tabla pública por ese id, solo unas columnas", /pareo_publicados\?select=nombre,.*&id=eq\.11111111-/.test(preguntas[0] && preguntas[0].u) && !/select=[^&]*\bdatos(,|&|$)/.test(preguntas[0].u), true);
    const meta = (p) => (r.html.match(new RegExp('<meta property="' + p + '" content="([^"]*)"')) || [])[1];
    igual("el título de la vista previa es el torneo (escapado)", meta("og:title"), "Abierto &lt;de&gt; Prueba — Festival");
    igual("y la línea dice fechas, lugar, cómo va, si da Elo y el ritmo", meta("og:description"),
      "Del 22 al 24 de octubre de 2026 · San José · Ronda 3 de 7 · 55 participantes · Válido para Elo FIDE · 90 min + 30 s");
    igual("con la imagen de Pareo Integral", meta("og:image"), "https://ajedrez-integral.com/img/og-torneos-pareo.jpg");
    igual("y manda a la página del torneo", (r.html.match(/http-equiv="refresh" content="0;url=([^"]*)"/) || [])[1], "/torneos-pareo.html#t=" + ID);
    igual("con sus propias cabeceras de seguridad", !!(r.cabeceras.get("content-security-policy") || "").includes("default-src 'none'"), true);
    igual("ningún <script> (la CSP no lo dejaría)", /<script/i.test(r.html), false);
    const r2 = await tarjeta("https://ajedrez-integral.com/t/" + ID, () => { throw new Error("caído"); });
    igual("si Supabase no contesta, igual manda al torneo", (r2.html.match(/http-equiv="refresh" content="0;url=([^"]*)"/) || [])[1] + " " + r2.estado, "/torneos-pareo.html#t=" + ID + " 200");
    const r3 = await tarjeta("https://ajedrez-integral.com/t/no-es-un-id", () => new Response("[]"));
    igual("lo que no es un id pasa a los archivos, sin preguntar", r3.aArchivos + " " + preguntas.length, "https://ajedrez-integral.com/t/no-es-un-id 0");
  }

  console.log("\n=== La tarjeta de un organizador (/o/<id>) ===");
  {
    const wr = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
    igual("wrangler.jsonc hace correr el worker en /o/ y /calendario/", ["/o/*", "/calendario/*"].every((x) => wr.assets.run_worker_first.includes(x)), true);
    const ID = "22222222-2222-4222-8222-222222222222";
    let preguntas = [];
    const pedirCon = async (url, contesta) => {
      preguntas = [];
      globalThis.fetch = async (u, opciones) => { preguntas.push({ u: String(u), opciones }); return contesta(String(u), opciones); };
      pedido = null;
      const res = await worker.fetch(new Request(url), env);
      return { estado: res.status, texto: await res.text(), cabeceras: res.headers, aArchivos: pedido };
    };
    const r = await pedirCon("https://ajedrez-integral.com/o/" + ID, (u) => /pareo_organizadores/.test(u)
      ? new Response(JSON.stringify([{ nombre: "Club <PRUEBA>", verificado: true }]), { status: 200 })
      : new Response("[]", { status: 206, headers: { "Content-Range": "0-0/12" } }));
    const meta = (p) => (r.texto.match(new RegExp('<meta property="' + p + '" content="([^"]*)"')) || [])[1];
    igual("contesta el worker", r.estado + "/" + r.aArchivos, "200/null");
    igual("el título es el organizador (escapado)", meta("og:title"), "Club &lt;PRUEBA&gt;");
    igual("la línea dice el sello y cuántos torneos publicó", meta("og:description"), "Organizador verificado · 12 torneos publicados · Sus próximos torneos y los resultados en Pareo Integral");
    igual("su dirección propia", meta("og:url"), "https://ajedrez-integral.com/o/" + ID);
    igual("y manda a su página", (r.texto.match(/http-equiv="refresh" content="0;url=([^"]*)"/) || [])[1], "/torneos-pareo.html#o=" + ID);
    igual("la cuenta se pide sola, sin bajar los torneos", preguntas.some((q) => /pareo_publicados\?select=id&organizador_id=eq\./.test(q.u) && q.opciones.headers.Prefer === "count=exact"), true);
    igual("sin <script> y con su CSP", !/<script/i.test(r.texto) && (r.cabeceras.get("content-security-policy") || "").includes("default-src 'none'"), true);
    const r2 = await pedirCon("https://ajedrez-integral.com/o/" + ID, () => { throw new Error("caído"); });
    igual("si Supabase no contesta, igual manda a su página", (r2.texto.match(/http-equiv="refresh" content="0;url=([^"]*)"/) || [])[1], "/torneos-pareo.html#o=" + ID);
  }

  console.log("\n=== El calendario para suscribirse (/calendario/torneos.ics) ===");
  {
    const CalendarioIcs = require("../js/calendario-ics.js");
    const ID = "33333333-3333-4333-8333-333333333333";
    const ORG = "44444444-4444-4444-8444-444444444444";
    // Hoy, en la prueba: 23/10/2026 a las 8 de la noche de Costa Rica (ya es el 24 en UTC).
    const AHORA = new Date("2026-10-24T02:00:00Z");
    const RealDate = Date;
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [AHORA.getTime()])); } static now() { return AHORA.getTime(); } };
    const propios = [
      { id: ID, nombre: "Abierto PRUEBA, con coma; y punto y coma", evento: "Festival PRUEBA", lugar: "San José", fecha: "2026-11-01", fin: "2026-11-02", ciudad: "Heredia", elo: "fide", ritmo: "90 min + 30 s", hora: "08:30" },
      // Terminó ayer: no va.
      { id: "55555555-5555-4555-8555-555555555555", nombre: "PRUEBA terminado", fecha: "2026-10-20", fin: "2026-10-22", lugar: "", ciudad: "", elo: "", ritmo: "", hora: null },
      // Hoy es su último día: va.
      { id: "66666666-6666-4666-8666-666666666666", nombre: "PRUEBA de hoy", fecha: "2026-10-21", fin: "2026-10-23", lugar: "Cartago", ciudad: "", elo: "no", ritmo: "", hora: null },
    ];
    const afuera = [
      { id_externo: 901, titulo: "PRUEBA nocturno", inicio: "2026-11-02T03:00:00+00:00", fin: "2026-11-02T05:00:00+00:00", provincia: "San José", lugar: "Salón", elo: "ambos", organizador: "Club", url: "https://ajedrezcostarica.com/es/tournaments/901" },
      { id_externo: 903, titulo: "PRUEBA ya publicado acá", inicio: "2026-11-01T15:00:00+00:00", fin: null, provincia: "", lugar: "", elo: "", organizador: "", url: "https://ajedrezcostarica.com/es/tournaments/903", repetido_de: ID },
      { id_externo: 902, titulo: "PRUEBA enlace raro", inicio: "2026-11-05T15:00:00+00:00", fin: null, provincia: "", lugar: "", elo: "", organizador: "", url: "https://otro.com/x" },
      // De chess-results: solo el día (medianoche de Costa Rica), sin final.
      { id_externo: 1234567, titulo: "PRUEBA de chess-results", inicio: "2026-11-03T06:00:00+00:00", fin: null, provincia: "Heredia", lugar: "Heredia", elo: "", organizador: "FCA", url: "https://chess-results.com/tnr1234567.aspx?lan=2", fuente: "chess-results" },
      { id_externo: 904, titulo: "PRUEBA chess-results raro", inicio: "2026-11-04T06:00:00+00:00", fin: null, provincia: "", lugar: "", elo: "", organizador: "", url: "https://chess-results.com.otro.com/tnr904.aspx?lan=2", fuente: "chess-results" },
    ];
    let preguntas = [];
    const contesta = (u) => /pareo_organizadores/.test(u) ? new Response(JSON.stringify([{ nombre: "Club PRUEBA" }]), { status: 200 })
      : /torneos_externos/.test(u) ? new Response(JSON.stringify(afuera), { status: 200 })
      : new Response(JSON.stringify(propios), { status: 200 });
    const pedirCal = async (url, f) => {
      preguntas = [];
      globalThis.fetch = async (u, o) => { preguntas.push(String(u)); return (f || contesta)(String(u), o); };
      pedido = null;
      const res = await worker.fetch(new Request(url), env);
      return { estado: res.status, texto: await res.text(), cabeceras: res.headers, aArchivos: pedido };
    };
    const r = await pedirCal("https://ajedrez-integral.com/calendario/torneos.ics");
    igual("contesta el worker con un calendario", r.estado + " " + r.cabeceras.get("content-type") + " " + r.aArchivos, "200 text/calendar; charset=utf-8 null");
    igual("pide solo los torneos desde hace un mes (no la tabla entera) y con tope", /pareo_publicados\?select=[^&]*&fecha=gte\.2026-09-22&order=fecha\.asc&limit=\d+$/.test(preguntas.find((u) => /pareo_publicados/.test(u)) || ""), true);
    igual("sin la columna entera de datos", /select=[^&]*\bdatos(,|&)/.test(preguntas.find((u) => /pareo_publicados/.test(u)) || ""), false);
    const uids = (t) => (t.match(/^UID:.*$/gm) || []).map((x) => x.slice(4));
    igual("los que vienen (y el de hoy), con los mismos UID que «Agregar a mi calendario»; el terminado, el enlace raro y el que ya está publicado en Pareo Integral no",
      uids(r.texto).join(" "), "torneo-66666666-6666-4666-8666-666666666666@ajedrez-integral.com torneo-" + ID + "@ajedrez-integral.com ajedrezcostarica-901@ajedrez-integral.com chess-results-1234567@ajedrez-integral.com");
    igual("el nocturno de afuera es del 1.° de noviembre (hora de Costa Rica)", /UID:ajedrezcostarica-901@[^]*?DTSTART;VALUE=DATE:20261101/.test(r.texto), true);
    igual("la app lo vuelve a leer sola", /REFRESH-INTERVAL;VALUE=DURATION:PT12H/.test(r.texto), true);
    // El mismo texto que arma js/calendario-ics.js con los mismos eventos: el
    // worker no puede importar ese archivo, así que se comparan las salidas.
    const ev = (e) => Object.assign({ aviso: "-PT15H" }, e);
    const esperado = CalendarioIcs.armarDias({ nombre: "Torneos de ajedrez en Costa Rica", ahora: AHORA, eventos: [
      ev({ uid: "torneo-66666666-6666-4666-8666-666666666666@ajedrez-integral.com", desde: "2026-10-21", hasta: "2026-10-23", resumen: "PRUEBA de hoy", lugar: "Cartago",
        descripcion: "No varía el Elo. Rondas y resultados: https://ajedrez-integral.com/t/66666666-6666-4666-8666-666666666666", url: "https://ajedrez-integral.com/t/66666666-6666-4666-8666-666666666666" }),
      ev({ uid: "torneo-" + ID + "@ajedrez-integral.com", desde: "2026-11-01", hasta: "2026-11-02", resumen: propios[0].nombre, lugar: "Heredia",
        descripcion: "Festival PRUEBA. Empieza a las 08:30. Ritmo: 90 min + 30 s. Válido para Elo FIDE. Rondas y resultados: https://ajedrez-integral.com/t/" + ID, url: "https://ajedrez-integral.com/t/" + ID }),
      ev({ uid: "ajedrezcostarica-901@ajedrez-integral.com", desde: "2026-11-01", hasta: "2026-11-01", resumen: "PRUEBA nocturno", lugar: "Salón, San José",
        descripcion: "Organiza: Club. Válido para Elo FIDE y Nacional. Inscripción y detalles: https://ajedrezcostarica.com/es/tournaments/901", url: "https://ajedrezcostarica.com/es/tournaments/901" }),
      ev({ uid: "chess-results-1234567@ajedrez-integral.com", desde: "2026-11-03", hasta: "2026-11-03", resumen: "PRUEBA de chess-results", lugar: "Heredia, Heredia",
        descripcion: "Organiza: FCA. Inscripción y detalles: https://chess-results.com/tnr1234567.aspx?lan=2", url: "https://chess-results.com/tnr1234567.aspx?lan=2" }),
    ] }).texto;
    const sinSuscripcion = (t) => t.replace(/^(REFRESH-INTERVAL|X-PUBLISHED-TTL)[^\r\n]*\r\n/gm, "");
    igual("el texto es línea por línea el de js/calendario-ics.js (escapes, líneas dobladas, días enteros)", sinSuscripcion(r.texto) === esperado, true);
    if (sinSuscripcion(r.texto) !== esperado) console.log(sinSuscripcion(r.texto).split("\r\n").filter((l, i) => l !== esperado.split("\r\n")[i]).slice(0, 5));
    const rO = await pedirCal("https://ajedrez-integral.com/calendario/torneos.ics?o=" + ORG);
    igual("con ?o=, solo los de ese organizador y sin los de afuera", preguntas.some((u) => u.includes("organizador_id=eq." + ORG)) && !preguntas.some((u) => /torneos_externos/.test(u)), true);
    igual("y con su nombre", /X-WR-CALNAME:Torneos de Club PRUEBA/.test(rO.texto), true);
    const rX = await pedirCal("https://ajedrez-integral.com/calendario/torneos.ics?o=no-es-un-id");
    igual("un ?o= que no es un id: 404 sin preguntar", rX.estado + " " + preguntas.length, "404 0");
    const rC = await pedirCal("https://ajedrez-integral.com/calendario/torneos.ics", () => { throw new Error("caído"); });
    igual("si Supabase no contesta, 503 (la app se queda con lo que tenía), nunca un calendario vacío", rC.estado, 503);
    globalThis.Date = RealDate;
  }

  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
