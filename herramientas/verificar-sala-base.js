/* Comprueba lo que NO se ve de la sala de arena: la migración, la Edge Function
   que crea las cuentas y lo que une una cosa con otra.

   Lo que se rompe acá no da ningún error: una tabla sin RLS se lee desde la
   consola, un usuario cuyo dominio no coincide con el de la Edge Function no
   puede entrar jamás (y el mensaje sería «usuario o clave incorrectos»), y una
   clave que se vuelve a poder leer es una clave publicada.

   1. La migración (`supabase/migraciones-colegios/*sala_arena*.sql`), leída:
      cada tabla `arena_*` con RLS y SIN política de escritura; cada función
      SECURITY DEFINER con `set search_path` y sin execute para `public`/`anon`;
      las internas sin execute para nadie más.
   2. Las dos copias del dominio de los correos (js/sala-cliente.js y la Edge
      Function) dicen lo mismo.
   3. Sala.html no carga el cliente de la Academia ni usa su `sb`.
   4. La Edge Function, EJECUTADA contra una base de mentira (se le inventa
      `Deno` y `fetch`): sin sesión o con una que la Academia no reconoce no
      deja pasar; crea la cuenta con el usuario de la inscripción, una clave de
      8 letras sin las ambiguas; al segundo del mismo usuario le agrega un
      número; deshace la cuenta de Auth si no pudo crear al jugador; y no
      devuelve cédulas ni contactos.

   Uso:  node herramientas/verificar-sala-base.js                           */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos++; }
}
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

/* ---------------------------------------------------------- 1. la migración */
console.log("=== La migración de la sala ===");
const carpeta = path.join(RAIZ, "supabase", "migraciones-colegios");
const archivo = fs.readdirSync(carpeta).find((f) => /sala_arena\.sql$/.test(f));
ok("existe la migración de la sala", !!archivo);
const sql = archivo ? fs.readFileSync(path.join(carpeta, archivo), "utf8") : "";
const sinComentarios = sql.replace(/--[^\n]*/g, "");

const tablas = [...sinComentarios.matchAll(/create table public\.(arena_\w+)/g)].map((m) => m[1]);
ok("crea las cinco tablas", tablas.length === 5, tablas.join(", "));
tablas.forEach((t) => {
  ok(t + " tiene RLS", new RegExp("alter table public\\." + t + " enable row level security").test(sinComentarios));
});
ok("ninguna política de escritura (ni insert, ni update, ni delete, ni all)",
  !/create policy[^;]*for\s+(insert|update|delete|all)\b/i.test(sinComentarios));
ok("la lectura de las tablas pide ser jugador de la sala",
  (sinComentarios.match(/using \(\(select public\.soy_jugador_de_sala\(\)\)\)/g) || []).length === 4);
ok("arena_cola solo deja leer la fila propia", /arena_cola_select[^;]*jugador_id = \(select auth\.uid\(\)\)/.test(sinComentarios));
ok("auth.uid() va envuelto en cada política", !/create policy[^;]*[^(]auth\.uid\(\)[^)]/.test(sinComentarios.replace(/\(select auth\.uid\(\)\)/g, "")));
ok("quien juega no lee el usuario de los demás (permiso por columna)",
  /grant select \(id, nombre, equipo_id\) on public\.arena_jugadores to authenticated/.test(sinComentarios)
  && !/grant select on[^;]*arena_jugadores[^;]*to authenticated/.test(sinComentarios.replace(/grant select \(id, nombre, equipo_id\) on public\.arena_jugadores/, "")));
ok("a anon no se le da nada", /revoke all on[^;]*from anon, authenticated/.test(sinComentarios) && !/grant[^;]*to[^;]*\banon\b/.test(sinComentarios));
ok("los jugadores nuevos se oyen por Realtime", /alter publication supabase_realtime add table public\.arena_partidas/.test(sinComentarios));
ok("una sola partida activa por color: índice único, no un if",
  /create unique index arena_partidas_una_activa_blancas[^;]*where estado = 'en_juego'/.test(sinComentarios)
  && /create unique index arena_partidas_una_activa_negras[^;]*where estado = 'en_juego'/.test(sinComentarios));

const funciones = [...sinComentarios.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\)\s+returns[\s\S]*?\$function\$[\s\S]*?\$function\$;/g)];
ok("encuentra las funciones", funciones.length >= 14, String(funciones.length));
funciones.forEach((m) => {
  const nombre = m[1], texto = m[0];
  if (/security definer/i.test(texto)) ok(nombre + ": SECURITY DEFINER con search_path vacío", /set search_path to ''/.test(texto));
});
const INTERNAS = ["arena_puntos", "arena_cerrar", "arena_vencer", "arena_emparejar"];
INTERNAS.forEach((f) => {
  ok(f + " (interna) sin execute para public, anon ni authenticated",
    new RegExp("revoke execute on function public\\." + f + "\\([^)]*\\) from public, anon, authenticated").test(sinComentarios));
  ok(f + " (interna) no se le da a nadie", !new RegExp("grant execute on function public\\." + f + "\\b").test(sinComentarios));
});
["arena_entrar", "arena_salir", "arena_mover", "arena_bandera", "arena_rendirse", "arena_tablas", "arena_clasificacion", "arena_en_racha"].forEach((f) => {
  ok(f + " (de quien juega) sin execute para public ni anon, con execute para authenticated",
    new RegExp("revoke execute on function public\\." + f + "\\([^)]*\\) from public, anon;").test(sinComentarios)
    && new RegExp("grant execute on function public\\." + f + "\\([^)]*\\) to authenticated").test(sinComentarios));
});
ok("soy_jugador_de_sala conserva el execute de authenticated (la usan las políticas)",
  /grant execute on function public\.soy_jugador_de_sala\(\) to authenticated/.test(sinComentarios));
// El if del permiso va con coalesce: con auth.uid() nulo `not (null)` no rechaza.
ok("el permiso de las funciones va envuelto en coalesce", (sinComentarios.match(/not coalesce\(public\.soy_jugador_de_sala\(\), false\)/g) || []).length >= 2);

/* ------------------------------------------------ 2 y 3. lo que las une */
console.log("\n=== Lo que une la página y la función ===");
const cliente = leer("js/sala-cliente.js");
const funcion = leer("supabase/functions-colegios/arena-admin/index.ts");
const dominioCliente = (cliente.match(/DOMINIO: "([^"]+)"/) || [])[1];
const dominioFuncion = (funcion.match(/const DOMINIO = "([^"]+)"/) || [])[1];
ok("el dominio de los correos es el mismo en la página y en la Edge Function", !!dominioCliente && dominioCliente === dominioFuncion, dominioCliente + " ≠ " + dominioFuncion);
const sala = leer("sala.html");
const salaJs = leer("js/sala.js");
ok("sala.html no carga el cliente de la Academia", !/js\/supabase-client\.js/.test(sala));
ok("sala.html carga el cliente de la sala antes que el código", sala.indexOf("js/sala-cliente.js") > 0 && sala.indexOf("js/sala-cliente.js") < sala.indexOf("js/sala.js"));
const sinComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
ok("sala.js solo usa el cliente de la sala (nunca el de la Academia)", !/\bwindow\.sb\b/.test(sinComent(salaJs).replace(/window\.sbSala/g, "")) && /const sb = window\.sbSala;/.test(salaJs));
ok("sala.html no tiene scripts escritos adentro ni atributos on…", !/<script>[^<]*[a-z]/.test(sala.replace(/<!-- (guardia|tema|oscuro)[^]*?<!-- \1: fin -->/g, "").replace(/<script>\(function[^]*?<\/script>/g, "")) && !/\son[a-z]+="/.test(sala));
ok("la sala es noindex", /<meta name="robots" content="noindex">/.test(sala));
ok("la sala no tiene guardia de sesión de la Academia (entra con su propia cuenta)", !/guardia: inicio/.test(sala));
ok("sala-admin sí exige la sesión de la Academia", /guardia: inicio/.test(leer("sala-admin.html")));
ok("sala-admin no toca las tablas desde el navegador", !/\bsb\.from\(/.test(sinComent(leer("js/sala-admin.js"))));

/* ---------------------------------------------- 4. la Edge Function, ejecutada */
console.log("\n=== La Edge Function, contra una base de mentira ===");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sala-fn-"));
const modulo = path.join(dir, "arena-admin.mts");
fs.writeFileSync(modulo, funcion.replace(/^import "jsr:[^"]+";\s*$/m, ""));
const prueba = path.join(dir, "prueba.mjs");
fs.writeFileSync(prueba, `
const salida = { cuentasCreadas: [] };
let manejador = null;
globalThis.Deno = { serve: (h) => { manejador = h; }, env: { get: (k) => ({ SUPABASE_URL: "https://base.test", SUPABASE_SERVICE_ROLE_KEY: "clave-de-servicio" })[k] } };

/* La base de mentira: lo justo de PostgREST y de Auth admin. */
const db = { equipos: [], jugadores: [], torneos: [], inscripciones: [
  { id: "00000000-0000-4000-8000-000000000001", nombre: "Ana María", apellido1: "Rojas", apellido2: "Cruz", usuario: "Ana_Rojas_C", centro: "Liceo A", grado: "7", cedula: "1-1111-1111", contacto: "8888", creado_en: "2026-10-01" },
  { id: "00000000-0000-4000-8000-000000000002", nombre: "Ana", apellido1: "Rojas", apellido2: "Campos", usuario: "Ana_Rojas_C", centro: "Liceo A", grado: "7", cedula: "2", contacto: "9", creado_en: "2026-10-02" },
  { id: "00000000-0000-4000-8000-000000000003", nombre: "José Ángel", apellido1: "Peña", apellido2: "Vega", usuario: null, centro: "Liceo B", grado: "8", cedula: "3", contacto: "7", creado_en: "2026-10-03" },
] };
const cuentas = new Map();
let fallarProximoJugador = false;
const llamadas = [];
const resp = (cuerpo, estado = 200) => new Response(cuerpo === undefined ? "" : JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
let seq = 0;
const uid = () => "10000000-0000-4000-8000-" + String(++seq).padStart(12, "0");

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const m = (init.method || "GET").toUpperCase();
  const auth = (init.headers || {}).Authorization || "";
  if (url.startsWith("https://bgtijpimpcokxatxxbki.supabase.co/rest/v1/rpc/soy_coordinador")) {
    return resp(auth === "Bearer sesion-buena" ? true : (auth === "Bearer sesion-rara" ? "true" : null), auth === "Bearer vencida" ? 401 : 200);
  }
  llamadas.push(m + " " + url.replace("https://base.test", ""));
  if (auth !== "Bearer clave-de-servicio") return resp({ message: "sin clave de servicio" }, 401);
  const u = new URL(url);
  if (u.pathname.startsWith("/auth/v1/admin/users")) {
    const cuerpo = init.body ? JSON.parse(init.body) : {};
    const id = u.pathname.split("/")[5];
    if (m === "POST") {
      if ([...cuentas.values()].some((c) => c.email === cuerpo.email)) return resp({ msg: "ya existe" }, 422);
      const nueva = { id: uid(), email: cuerpo.email, password: cuerpo.password };
      cuentas.set(nueva.id, nueva); salida.cuentasCreadas.push({ ...nueva });
      return resp({ id: nueva.id });
    }
    if (m === "PUT") { cuentas.get(id).password = cuerpo.password; return resp({ id }); }
    if (m === "DELETE") { cuentas.delete(id); return resp({}); }
  }
  const tabla = u.pathname.replace("/rest/v1/", "");
  const clave = { arena_equipos: "equipos", arena_jugadores: "jugadores", arena_torneos: "torneos", inscripciones: "inscripciones" }[tabla];
  if (!clave) return resp({ message: "tabla desconocida " + tabla }, 404);
  const filas = db[clave];
  const filtro = (f) => [...u.searchParams.entries()].every(([k, v]) => {
    if (["select", "order"].includes(k)) return true;
    if (v.startsWith("eq.")) return String(f[k]) === v.slice(3);
    if (v.startsWith("in.(")) return v.slice(4, -1).split(",").includes(String(f[k]));
    return true;
  });
  const cols = (u.searchParams.get("select") || "*").split(",");
  const recorta = (f) => cols[0] === "*" ? f : Object.fromEntries(cols.map((c) => [c, f[c]]));
  if (m === "GET") return resp(filas.filter(filtro).map(recorta));
  const cuerpo = init.body ? JSON.parse(init.body) : {};
  if (m === "POST") {
    if (clave === "equipos" && filas.some((f) => f.nombre.toLowerCase() === String(cuerpo.nombre).toLowerCase())) return resp({ code: "23505", message: "duplicate key" }, 409);
    if (clave === "jugadores" && fallarProximoJugador) { fallarProximoJugador = false; return resp({ code: "23514", message: "check violation" }, 400); }
    const fila = { id: uid(), ...cuerpo }; filas.push(fila); return resp([fila], 201);
  }
  if (m === "PATCH") { const af = filas.filter(filtro); af.forEach((f) => Object.assign(f, cuerpo)); return resp(af); }
  if (m === "DELETE") { db[clave] = filas.filter((f) => !filtro(f)); return resp([]); }
  return resp({}, 405);
};

await import(${JSON.stringify("file://" + modulo)});
const llamar = async (cuerpo, jwt = "sesion-buena") => {
  const r = await manejador(new Request("https://f.test/arena-admin", { method: "POST", headers: { Authorization: "Bearer " + jwt, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }));
  return { estado: r.status, cuerpo: await r.json() };
};
const IDS = db.inscripciones.map((i) => i.id);
const R = {};

R.sinSesion = (await manejador(new Request("https://f.test/x", { method: "POST", body: "{}" }))).status;
R.sesionVencida = (await llamar({ accion: "estado" }, "vencida")).estado;
R.sesionRara = (await llamar({ accion: "estado" }, "sesion-rara")).estado;
R.get = (await manejador(new Request("https://f.test/x", { method: "GET", headers: { Authorization: "Bearer sesion-buena" } }))).status;
R.accionRara = (await llamar({ accion: "borrar_todo" })).estado;

const eq = await llamar({ accion: "crear_equipo", nombre: "  Los   Alfiles " });
R.equipo = eq.cuerpo.equipo && eq.cuerpo.equipo.nombre;
R.equipoRepetido = (await llamar({ accion: "crear_equipo", nombre: "los alfiles" })).cuerpo.error;
R.equipoVacio = (await llamar({ accion: "crear_equipo", nombre: "   " })).cuerpo.error;
const equipoId = eq.cuerpo.equipo.id;

const a = await llamar({ accion: "agregar_jugadores", equipo_id: equipoId, inscripciones: IDS });
R.cuentas = a.cuerpo.cuentas.map((c) => ({ usuario: c.usuario, nombre: c.nombre, clave: c.clave }));
R.fallos = a.cuerpo.fallos;
R.jugadores = db.jugadores.map((j) => ({ usuario: j.usuario, nombre: j.nombre, equipo_id: j.equipo_id === equipoId, inscripcion_id: !!j.inscripcion_id }));
R.correos = salida.cuentasCreadas.map((c) => c.email);
R.clavesGuardadasSonLasEntregadas = salida.cuentasCreadas.every((c) => a.cuerpo.cuentas.some((x) => x.clave === c.password));

// Volver a agregar a los mismos: solo cambian de equipo, sin cuenta nueva ni clave nueva.
const antes = salida.cuentasCreadas.length;
const eq2 = await llamar({ accion: "crear_equipo", nombre: "Las Torres" });
const b = await llamar({ accion: "agregar_jugadores", equipo_id: eq2.cuerpo.equipo.id, inscripciones: [IDS[0]] });
R.reagregar = { cuentasNuevas: b.cuerpo.cuentas.length, movidos: b.cuerpo.movidos.length, cuentasEnAuth: salida.cuentasCreadas.length - antes };

// Si el jugador no se puede crear, la cuenta de Auth no queda suelta.
db.inscripciones.push({ id: "00000000-0000-4000-8000-000000000004", nombre: "Luis", apellido1: "Mora", apellido2: "", usuario: "Luis_Mora", centro: "x", grado: "7", creado_en: "2026-10-04" });
fallarProximoJugador = true;
const c = await llamar({ accion: "agregar_jugadores", equipo_id: null, inscripciones: ["00000000-0000-4000-8000-000000000004"] });
R.sinCuentaSuelta = { fallos: c.cuerpo.fallos.length, cuentasVivas: cuentas.size, jugadores: db.jugadores.length };

// Una clave nueva: otra, y solo la del jugador pedido.
const jugadorAna = db.jugadores.find((j) => j.usuario === "Ana_Rojas_C");
const antesClave = cuentas.get(jugadorAna.id).password;
const k = await llamar({ accion: "reiniciar_clave", jugador_id: jugadorAna.id });
R.claveNueva = { cambio: cuentas.get(jugadorAna.id).password !== antesClave, devuelta: k.cuerpo.clave === cuentas.get(jugadorAna.id).password, usuario: k.cuerpo.usuario };

// Lo que sale en «estado»: nada de cédulas ni contactos.
const e = await llamar({ accion: "estado" });
R.estadoSinDatosPersonales = JSON.stringify(e.cuerpo.inscripciones).match(/cedula|contacto|1-1111/) === null;
R.estadoTrae = Object.keys(e.cuerpo).sort();

// Validaciones de arena
R.arenaMala = (await llamar({ accion: "crear_torneo", nombre: "x", inicia: "mañana", minutos: 60, inicial_seg: 180 })).cuerpo.error;
R.arenaMinutos = (await llamar({ accion: "crear_torneo", nombre: "x", inicia: "2026-11-01T01:00:00Z", minutos: 5, inicial_seg: 180 })).cuerpo.error;
const t = await llamar({ accion: "crear_torneo", nombre: "Arena", inicia: "2026-11-01T01:00:00Z", minutos: 60, inicial_seg: 180, incremento_seg: 2 });
R.arena = t.cuerpo.torneo && { minutos: t.cuerpo.torneo.minutos, inicial: t.cuerpo.torneo.inicial_seg, inc: t.cuerpo.torneo.incremento_seg, equipos: t.cuerpo.torneo.por_equipos, mejores: t.cuerpo.torneo.mejores };

// Quitar un jugador borra su cuenta de Auth.
const vivas = cuentas.size;
await llamar({ accion: "quitar_jugador", jugador_id: jugadorAna.id });
R.quitar = { cuentasMenos: vivas - cuentas.size };
R.uuidMalo = (await llamar({ accion: "quitar_jugador", jugador_id: "no-es-uuid" })).cuerpo.error;
console.log(JSON.stringify(R));
`);
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", prueba], { encoding: "utf8", timeout: 60000 });
let R = null;
try { R = JSON.parse((r.stdout || "").trim().split("\n").pop()); } catch (e) { /* abajo */ }
if (!R) {
  ok("la Edge Function se ejecuta", false, (r.stderr || r.stdout || "sin salida").slice(0, 600));
} else {
  ok("sin sesión: 401", R.sinSesion === 401);
  ok("sesión que la Academia no reconoce: 403", R.sesionVencida === 403);
  ok("una respuesta que dice «true» pero no lo es (texto) tampoco deja pasar", R.sesionRara === 403);
  ok("solo se acepta POST", R.get === 405);
  ok("una acción que no existe se rechaza", R.accionRara === 400);
  ok("el nombre del equipo se limpia de espacios", R.equipo === "Los Alfiles", String(R.equipo));
  ok("un equipo repetido se dice en español", R.equipoRepetido === "Ya hay un equipo con ese nombre.", String(R.equipoRepetido));
  ok("un equipo sin nombre se rechaza", /Falta/.test(R.equipoVacio || ""));
  ok("a cada inscripción nueva le crea una cuenta", R.cuentas.length === 3, JSON.stringify(R.cuentas));
  ok("usa el usuario de la inscripción", R.cuentas[0].usuario === "Ana_Rojas_C");
  ok("al segundo igual le agrega un número, sin pisar al primero", R.cuentas[1].usuario === "Ana_Rojas_C2", R.cuentas[1].usuario);
  ok("sin usuario en la inscripción lo arma sin tildes ni espacios", R.cuentas[2].usuario === "Jose_Pena_V", R.cuentas[2].usuario);
  ok("el nombre que se muestra es nombre y primer apellido", R.cuentas[0].nombre === "Ana María Rojas", R.cuentas[0].nombre);
  ok("la clave tiene 8 letras sin 0, O, 1, l ni i", R.cuentas.every((c) => /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/.test(c.clave)), JSON.stringify(R.cuentas.map((c) => c.clave)));
  ok("las claves no se repiten", new Set(R.cuentas.map((c) => c.clave)).size === 3);
  ok("el correo es el usuario en minúsculas en el dominio de la sala", R.correos[0] === "ana_rojas_c@" + dominioFuncion, R.correos[0]);
  ok("la clave que se entrega es la que quedó en Auth", R.clavesGuardadasSonLasEntregadas);
  ok("los jugadores quedan en el equipo y ligados a su inscripción", R.jugadores.length === 3 && R.jugadores.every((j) => j.equipo_id && j.inscripcion_id));
  ok("volver a agregar a alguien con cuenta solo lo cambia de equipo (sin clave nueva)", R.reagregar.cuentasNuevas === 0 && R.reagregar.movidos === 1 && R.reagregar.cuentasEnAuth === 0, JSON.stringify(R.reagregar));
  ok("si el jugador no se puede crear, no queda una cuenta de Auth suelta", R.sinCuentaSuelta.fallos === 1 && R.sinCuentaSuelta.cuentasVivas === 3 && R.sinCuentaSuelta.jugadores === 3, JSON.stringify(R.sinCuentaSuelta));
  ok("una clave nueva cambia la de Auth y se devuelve", R.claveNueva.cambio && R.claveNueva.devuelta && R.claveNueva.usuario === "Ana_Rojas_C", JSON.stringify(R.claveNueva));
  ok("«estado» no trae cédulas ni contactos", R.estadoSinDatosPersonales);
  ok("«estado» trae lo que pinta la pantalla", JSON.stringify(R.estadoTrae) === JSON.stringify(["dominio", "equipos", "inscripciones", "jugadores", "ok", "torneos"]), JSON.stringify(R.estadoTrae));
  ok("una fecha que no es fecha se rechaza", /fecha y la hora/.test(R.arenaMala || ""), String(R.arenaMala));
  ok("una arena de menos de 10 minutos se rechaza", /entre 10 y 240/.test(R.arenaMinutos || ""), String(R.arenaMinutos));
  ok("una arena válida queda con lo pedido (por equipos y los 5 mejores por omisión)", R.arena && R.arena.minutos === 60 && R.arena.inicial === 180 && R.arena.inc === 2 && R.arena.equipos === true && R.arena.mejores === 5, JSON.stringify(R.arena));
  ok("quitar a un jugador borra su cuenta de Auth", R.quitar.cuentasMenos === 1);
  ok("un id que no es uuid se rechaza", /Falta el jugador/.test(R.uuidMalo || ""), String(R.uuidMalo));
}
fs.rmSync(dir, { recursive: true, force: true });

console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\n✓ todo bien");
process.exit(fallos ? 1 : 0);
