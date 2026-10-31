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
   5. El juego limpio (`*_sala_arena_juego_limpio.sql`, `arena-admin/revision.ts`):
      la tabla de revisiones que ningún jugador lee, la salida de la pantalla
      que solo suma a su color, el tiempo de cada jugada, lo anulado que deja
      de contar; la revisión con chess.js (jugada ilegal, posición que no
      cuadra, un fin declarado que no es, el resultado contra el mate) y los
      indicios; y la función: revisa una sola vez, anular pide motivo y deja
      constancia, devolver también, y una partida en juego no se anula.

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

/* ------------------------------------------- 1b. la migración del juego limpio */
console.log("\n=== La migración del juego limpio ===");
const archivoJl = fs.readdirSync(carpeta).find((f) => /sala_arena_juego_limpio\.sql$/.test(f));
ok("existe la migración del juego limpio", !!archivoJl);
const jl = archivoJl ? fs.readFileSync(path.join(carpeta, archivoJl), "utf8").replace(/--[^\n]*/g, "") : "";
ok("arena_revisiones tiene RLS", /alter table public\.arena_revisiones enable row level security/.test(jl));
ok("y ninguna política: ningún jugador la lee ni la escribe", !/create policy/i.test(jl));
ok("a anon y authenticated no se les da nada de ella", /revoke all on public\.arena_revisiones from anon, authenticated/.test(jl) && !/grant[^;]*arena_revisiones/.test(jl));
const anotar = (jl.match(/create or replace function public\.arena_anotar_salida[\s\S]*?\$function\$;/) || [""])[0];
ok("arena_anotar_salida: SECURITY DEFINER con search_path vacío", /security definer/.test(anotar) && /set search_path to ''/.test(anotar));
ok("arena_anotar_salida pide ser jugador de la sala (con coalesce) y de ESA partida", /not coalesce\(public\.soy_jugador_de_sala\(\), false\)/.test(anotar) && /yo not in \(p\.blancas, p\.negras\)/.test(anotar));
ok("solo suma en una partida en juego, a su propio color y con tope", /if p\.estado <> 'en_juego' then return; end if;/.test(anotar) && /least\(r\.salidas_blancas \+ case when yo = p\.blancas/.test(anotar));
ok("arena_anotar_salida sin execute para public ni anon, con execute para authenticated",
  /revoke execute on function public\.arena_anotar_salida\(uuid\) from public, anon;/.test(jl) && /grant execute on function public\.arena_anotar_salida\(uuid\) to authenticated/.test(jl));
ok("cada jugada guarda el tiempo que usó, medido por la base", /'ms', least\(greatest\(usado, 0\)/.test(jl));
ok("la partida anulada no cuenta en la clasificación ni en la racha",
  (jl.match(/and not p\.anulada/g) || []).length === 5);


/* ------------------------------------ 1c. la migración del control y la fuerza */
console.log("\n=== La migración del control, la fuerza y la jugada validada ===");
const archivoCf = fs.readdirSync(carpeta).find((f) => /sala_arena_control_y_fuerza\.sql$/.test(f));
ok("existe la migración del control y la fuerza", !!archivoCf);
const cf = archivoCf ? fs.readFileSync(path.join(carpeta, archivoCf), "utf8").replace(/--[^\n]*/g, "") : "";
ok("agrega la pausa y el cierre anticipado a la arena", /alter table public\.arena_torneos\s+add column pausada boolean not null default false,\s+add column cerrada_en timestamptz/.test(cf));
ok("agrega la fuerza, entre 100 y 3500", /add column fuerza integer not null default 1000 check \(fuerza between 100 and 3500\)/.test(cf));
ok("y lo que movió cada partida, para devolverlo si se anula", /add column cambio_blancas integer not null default 0,\s+add column cambio_negras integer not null default 0/.test(cf));
ok("arena_fuera tiene RLS, ninguna política y nada para anon ni authenticated",
  /alter table public\.arena_fuera enable row level security/.test(cf) && !/create policy/i.test(cf) && /revoke all on public\.arena_fuera from anon, authenticated/.test(cf) && !/grant[^;]*arena_fuera/.test(cf));
ok("la fuerza NO entra al permiso por columna de arena_jugadores (nadie ve el nivel de nadie)", !/grant\s+select[^;]*arena_jugadores/i.test(cf));
const cfFunciones = [...cf.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\)\s+returns[\s\S]*?\$function\$[\s\S]*?\$function\$;/g)];
ok("redefine las funciones del emparejamiento, la jugada y el cierre", ["arena_cerrar", "arena_abortar", "arena_fuerza_al_anular", "arena_emparejar", "arena_entrar", "arena_aplicar_jugada"].every((f) => cfFunciones.some((m) => m[1] === f)), cfFunciones.map((m) => m[1]).join(", "));
cfFunciones.forEach((m) => ok(m[1] + ": SECURITY DEFINER con search_path vacío", /security definer/i.test(m[0]) && /set search_path to ''/.test(m[0])));
const aplicar = (cf.match(/create or replace function public\.arena_aplicar_jugada[\s\S]*?\$function\$;/) || [""])[0];
ok("arena_aplicar_jugada solo la ejecuta la service role",
  /revoke execute on function public\.arena_aplicar_jugada\(uuid, uuid, text, text, text, text, text\) from public, anon, authenticated;/.test(cf)
  && /grant execute on function public\.arena_aplicar_jugada\(uuid, uuid, text, text, text, text, text\) to service_role;/.test(cf)
  && !/grant execute on function public\.arena_aplicar_jugada[^;]*to[^;]*(authenticated|anon|public)/.test(cf));
ok("arena_abortar solo la ejecuta la service role",
  /revoke execute on function public\.arena_abortar\(uuid\) from public, anon, authenticated;/.test(cf) && /grant execute on function public\.arena_abortar\(uuid\) to service_role;/.test(cf) && !/grant execute on function public\.arena_abortar[^;]*to[^;]*authenticated/.test(cf));
ok("la función del trigger de la fuerza no la ejecuta nadie más", /revoke execute on function public\.arena_fuerza_al_anular\(\) from public, anon, authenticated;/.test(cf));
ok("la antigua arena_mover se borra (nadie puede saltarse la validación llamando a la base)", /drop function public\.arena_mover\(uuid, text, text, text, text, text\);/.test(cf) && !/create (or replace )?function public\.arena_mover\b/.test(cf));
ok("la jugada aplicada conserva el tiempo de cada jugada (el juego limpio lo necesita)", /'ms', least\(greatest\(usado, 0\)/.test(aplicar));
ok("y quien juega viene como argumento y se comprueba que exista, no que lo diga auth.uid()", /p_jugador uuid/.test(aplicar) && /where j\.id = p_jugador/.test(aplicar) && !/auth\.uid\(\)/.test(aplicar));
ok("comprueba el turno y la forma de la jugada y del FEN", /Todavía no es tu turno/.test(aplicar) && /Esa jugada no es válida/.test(aplicar) && /p_fin not in \('mate', 'ahogado', 'material', 'repeticion', 'cincuenta'\)/.test(aplicar));
const entrar = (cf.match(/create or replace function public\.arena_entrar[\s\S]*?\$function\$;/) || [""])[0];
ok("arena_entrar sigue pidiendo ser jugador de la sala (con coalesce)", /not coalesce\(public\.soy_jugador_de_sala\(\), false\)/.test(entrar));
ok("y respeta a quien administración sacó y la hora de cierre", /arena_fuera f where f\.torneo_id = p_torneo and f\.jugador_id = yo/.test(entrar) && /coalesce\(t\.cerrada_en/.test(entrar));
const emparejar = (cf.match(/create or replace function public\.arena_emparejar[\s\S]*?\$function\$;/) || [""])[0];
ok("arena_emparejar no empareja en pausa ni a quien está fuera", /if t\.pausada then return; end if;/.test(emparejar) && /not exists \(select 1 from public\.arena_fuera/.test(emparejar));
ok("en una arena por equipos NUNCA junta a dos del mismo equipo (regla, no preferencia: no se afloja con la espera)",
  /and not \(t\.por_equipos and j\.equipo_id is not distinct from c\.equipo_id\)/.test(emparejar) && !/order by \(t\.por_equipos/.test(emparejar) && /if r\.jugador_id is not distinct from ultimo and espera < 10 then/.test(emparejar));
ok("y empareja por fuerza, aflojando el criterio con la espera", /abs\(j\.fuerza - c\.fuerza\)/.test(emparejar) && /150 \+ 40 \* espera/.test(emparejar));
const cerrar = (cf.match(/create or replace function public\.arena_cerrar[\s\S]*?\$function\$;/) || [""])[0];
ok("arena_cerrar mueve la fuerza con K = 32 y suma cero, y unas tablas cortas no la mueven", /32 \* \(logrado - esperado\)/.test(cerrar) && /fuerza \+ db/.test(cerrar) && /fuerza - db/.test(cerrar) && /not \(p_resultado = '1\/2-1\/2' and n < 20\)/.test(cerrar));
ok("anular una partida devuelve la fuerza que había movido, y devolverla la vuelve a mover", /signo := case when new\.anulada then -1 else 1 end/.test(cf) && /after update of anulada on public\.arena_partidas/.test(cf));

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
ok("sala.js manda las jugadas a arena-jugar (de dónde a dónde) y ya no llama a arena_mover", /functions\/v1\/arena-jugar/.test(salaJs) && !/arena_mover/.test(sinComent(salaJs)));
ok("y no manda al servidor el FEN, el SAN ni el final de la partida (eso lo calcula arena-jugar)", !/\bp_fen\b|\bp_san\b|\bp_fin\b/.test(sinComent(salaJs)));
ok("sala.html no tiene scripts escritos adentro ni atributos on…", !/<script>[^<]*[a-z]/.test(sala.replace(/<!-- (guardia|tema|oscuro)[^]*?<!-- \1: fin -->/g, "").replace(/<script>\(function[^]*?<\/script>/g, "")) && !/\son[a-z]+="/.test(sala));
ok("la sala es noindex", /<meta name="robots" content="noindex">/.test(sala));
ok("la sala no tiene guardia de sesión de la Academia (entra con su propia cuenta)", !/guardia: inicio/.test(sala));
ok("sala-admin sí exige la sesión de la Academia", /guardia: inicio/.test(leer("sala-admin.html")));
ok("sala-admin no toca las tablas desde el navegador", !/\bsb\.from\(/.test(sinComent(leer("js/sala-admin.js"))));

/* ---------------------------------------------- 4. la Edge Function, ejecutada */
console.log("\n=== La Edge Function, contra una base de mentira ===");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sala-fn-"));
const modulo = path.join(dir, "arena-admin.mts");
// chess.js de npm se cambia por el del sitio (el mismo 0.10.3), y revision.ts
// va al lado, como en la función.
const chessLocal = require.resolve("chess.js");
fs.writeFileSync(modulo, funcion.replace(/^import "jsr:[^"]+";\s*$/m, "")
  .replace(/^import \{ Chess \} from "npm:chess\.js@[^"]+";\s*$/m,
    `import { createRequire } from "node:module"; const { Chess } = createRequire(import.meta.url)(${JSON.stringify(chessLocal)});`));
fs.copyFileSync(path.join(RAIZ, "supabase/functions-colegios/arena-admin/revision.ts"), path.join(dir, "revision.ts"));
const prueba = path.join(dir, "prueba.mjs");
fs.writeFileSync(prueba, `
const salida = { cuentasCreadas: [] };
let manejador = null;
globalThis.Deno = { serve: (h) => { manejador = h; }, env: { get: (k) => ({ SUPABASE_URL: "https://base.test", SUPABASE_SERVICE_ROLE_KEY: "clave-de-servicio" })[k] } };

/* La base de mentira: lo justo de PostgREST y de Auth admin. */
const db = { equipos: [], jugadores: [], torneos: [], partidas: [], revisiones: [], fuera: [], cola: [], inscripciones: [
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
  if (u.pathname.startsWith("/rest/v1/rpc/")) {
    const nombre = u.pathname.split("/").pop();
    const cuerpoRpc = init.body ? JSON.parse(init.body) : {};
    (salida.rpcs = salida.rpcs || []).push({ nombre, cuerpo: cuerpoRpc });
    if (nombre === "arena_abortar") {
      const x = db.partidas.find((f) => f.id === cuerpoRpc.p_partida);
      if (x && x.estado === "en_juego") Object.assign(x, { estado: "terminada", resultado: null, motivo: "abortada" });
      return resp(undefined);
    }
    if (nombre === "arena_clasificacion" || nombre === "arena_en_racha") return resp([]);
    return resp({ message: "función desconocida " + nombre }, 404);
  }
  const tabla = u.pathname.replace("/rest/v1/", "");
  const clave = { arena_equipos: "equipos", arena_jugadores: "jugadores", arena_torneos: "torneos", inscripciones: "inscripciones", arena_partidas: "partidas", arena_revisiones: "revisiones", arena_fuera: "fuera", arena_cola: "cola" }[tabla];
  if (!clave) return resp({ message: "tabla desconocida " + tabla }, 404);
  const filas = db[clave];
  const filtro = (f) => [...u.searchParams.entries()].every(([k, v]) => {
    if (["select", "order", "limit"].includes(k)) return true;
    if (k === "or") return [...v.matchAll(/(\\w+)\\.eq\\.([^,)]+)/g)].some((x) => String(f[x[1]]) === x[2]);
    if (v === "not.is.null") return f[k] != null;
    if (v.startsWith("eq.")) return String(f[k]) === v.slice(3);
    if (v.startsWith("in.(")) return v.slice(4, -1).split(",").includes(String(f[k]));
    return true;
  });
  const cols = (u.searchParams.get("select") || "*").split(",");
  const recorta = (f) => cols[0] === "*" ? f : Object.fromEntries(cols.map((c) => [c, f[c]]));
  if (m === "GET") return resp(filas.filter(filtro).map(recorta));
  const cuerpo = init.body ? JSON.parse(init.body) : {};
  if (m === "POST" && u.searchParams.get("on_conflict")) {
    // Un upsert: solo cambia las columnas que llegan (merge-duplicates).
    const k = u.searchParams.get("on_conflict");
    const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    const hechas = lista.map((x) => {
      const ya = filas.find((f) => f[k] === x[k]);
      if (ya) return Object.assign(ya, x);
      const nueva = Object.assign({ salidas_blancas: 0, salidas_negras: 0, historial: [] }, x); filas.push(nueva); return nueva;
    });
    salida.upserts = (salida.upserts || 0) + 1;
    return resp(hechas, 201);
  }
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

// ---- El juego limpio: las funciones puras, con el chess.js del sitio.
const { revisarArena, indiciosArena } = await import(${JSON.stringify("file://" + path.join(dir, "revision.ts"))});
const { createRequire } = await import("node:module");
const { Chess } = createRequire(import.meta.url)(${JSON.stringify(require.resolve("chess.js"))});
const J = (lista) => lista.map(([s, f, t, ms]) => ({ s, f, t, ms }));
const MATE = J([["f3", "f2", "f3"], ["e5", "e7", "e5"], ["g4", "g2", "g4"], ["Qh4#", "d8", "h4"]]);
const FEN_MATE = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
R.rev = {
  bien: revisarArena(Chess, { jugadas: MATE, fen: FEN_MATE, resultado: "0-1", motivo: "mate" }),
  ilegal: revisarArena(Chess, { jugadas: J([["e4", "e2", "e4"], ["e5", "e7", "e5"], ["Qh5", "d1", "h5"], ["Kxe2", "e7", "e2"]]), fen: "x w - - 0 1", resultado: "0-1", motivo: "mate" }),
  casillaCambiada: revisarArena(Chess, { jugadas: J([["e4", "d2", "d4"]]), fen: "", resultado: "1-0", motivo: "abandono" }),
  fenDistinta: revisarArena(Chess, { jugadas: J([["e4", "e2", "e4"]]), fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1", resultado: "1-0", motivo: "abandono" }),
  mateFalso: revisarArena(Chess, { jugadas: J([["e4", "e2", "e4"]]), fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", resultado: "1-0", motivo: "mate" }),
  contraElMate: revisarArena(Chess, { jugadas: MATE, fen: FEN_MATE, resultado: "1-0", motivo: "tiempo" }),
};
const parejas = Array.from({ length: 50 }, (_, i) => ({ s: "x", ms: i % 2 === 0 ? 8000 + (i % 4) * 100 : 1000 + (i % 7) * 900 }));
R.ind = {
  salidas: indiciosArena({ jugadas: [] }, { salidas_blancas: 4, salidas_negras: 2 }),
  tiempos: indiciosArena({ jugadas: parejas }, {}),
  pocas: indiciosArena({ jugadas: parejas.slice(0, 20) }, {}),
};

// ---- El juego limpio en la función.
const T1 = "20000000-0000-4000-8000-000000000001";
db.jugadores.push({ id: "30000000-0000-4000-8000-000000000001", usuario: "a", nombre: "Ana", equipo_id: null }, { id: "30000000-0000-4000-8000-000000000002", usuario: "b", nombre: "Beto", equipo_id: null });
const base = { torneo_id: T1, blancas: "30000000-0000-4000-8000-000000000001", negras: "30000000-0000-4000-8000-000000000002", anulada: false, terminada_en: "2026-10-30T12:00:00Z" };
db.partidas.push(
  Object.assign({ id: "40000000-0000-4000-8000-000000000001", estado: "terminada", jugadas: MATE, fen: FEN_MATE, resultado: "0-1", motivo: "mate" }, base),
  Object.assign({ id: "40000000-0000-4000-8000-000000000002", estado: "terminada", jugadas: J([["e4", "e2", "e4"]]), fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", resultado: "1-0", motivo: "mate" }, base),
  Object.assign({ id: "40000000-0000-4000-8000-000000000003", estado: "en_juego", jugadas: [], fen: "", resultado: null, motivo: null }, base),
);
db.revisiones.push({ partida_id: "40000000-0000-4000-8000-000000000001", salidas_blancas: 0, salidas_negras: 5, historial: [] });
const jl1 = await llamar({ accion: "juego_limpio", torneo_id: T1 });
R.jl = {
  estado: jl1.estado, revisadas: jl1.cuerpo.revisadas,
  partidas: (jl1.cuerpo.partidas || []).map((x) => ({ id: x.id.slice(-1), problemas: x.problemas.map((p) => p.tipo), indicios: x.indicios, salidas: [x.salidas_blancas, x.salidas_negras], blancas: x.blancas })),
  guardadas: db.revisiones.filter((r) => r.revision).length,
};
R.jl.otraVez = (await llamar({ accion: "juego_limpio", torneo_id: T1 })).cuerpo.revisadas;
R.jl.sinMotivo = (await llamar({ accion: "anular", partida_id: "40000000-0000-4000-8000-000000000002", motivo: "  " })).cuerpo.error;
R.jl.sinMotivoNoAnula = db.partidas[1].anulada;
await llamar({ accion: "anular", partida_id: "40000000-0000-4000-8000-000000000002", motivo: "Declaró un mate que no era." });
const revAnulada = db.revisiones.find((r) => r.partida_id === "40000000-0000-4000-8000-000000000002");
R.jl.anulada = { partida: db.partidas[1].anulada, motivo: revAnulada.anulada_motivo, por: revAnulada.anulada_por, en: !!revAnulada.anulada_en, revisionSigue: !!revAnulada.revision };
await llamar({ accion: "devolver", partida_id: "40000000-0000-4000-8000-000000000002" });
R.jl.devuelta = { partida: db.partidas[1].anulada, motivo: revAnulada.anulada_motivo, historial: revAnulada.historial.map((h) => h.accion) };
R.jl.enJuego = (await llamar({ accion: "anular", partida_id: "40000000-0000-4000-8000-000000000003", motivo: "x" })).estado;
R.jl.sinPermiso = (await llamar({ accion: "juego_limpio", torneo_id: T1 }, "vencida")).estado;

// ---- El control de una arena.
const ARENA = t.cuerpo.torneo.id;
const A = "30000000-0000-4000-8000-000000000001", B = "30000000-0000-4000-8000-000000000002";
const pausa = (await llamar({ accion: "pausar_arena", id: ARENA })).cuerpo.torneo;
const reanuda = (await llamar({ accion: "pausar_arena", id: ARENA, pausada: false })).cuerpo.torneo;
const cierra = (await llamar({ accion: "terminar_arena", id: ARENA })).cuerpo.torneo;
const futura = (await llamar({ accion: "crear_torneo", nombre: "Futura", inicia: "2099-01-01T00:00:00Z", minutos: 60, inicial_seg: 180 })).cuerpo.torneo;
await llamar({ accion: "terminar_arena", id: futura.id });
const suma = (await llamar({ accion: "extender_arena", id: futura.id, minutos: 30 })).cuerpo.torneo;
const tope = (await llamar({ accion: "extender_arena", id: futura.id, minutos: 120 })).cuerpo.torneo;
const pasada = (await llamar({ accion: "crear_torneo", nombre: "Pasada", inicia: "2020-01-01T00:00:00Z", minutos: 60, inicial_seg: 180 })).cuerpo.torneo;
R.ctl = {
  pausa: pausa.pausada, reanuda: reanuda.pausada,
  cierra: { cerrada: !!cierra.cerrada_en, pausada: cierra.pausada },
  suma: { minutos: suma.minutos, cerrada: suma.cerrada_en },
  tope: tope.minutos,
  extenderMucho: (await llamar({ accion: "extender_arena", id: futura.id, minutos: 500 })).cuerpo.error,
  extenderPasada: (await llamar({ accion: "extender_arena", id: pasada.id, minutos: 5 })).cuerpo.error,
  extenderInexistente: (await llamar({ accion: "extender_arena", id: "50000000-0000-4000-8000-000000000009", minutos: 5 })).estado,
  pausarMalId: (await llamar({ accion: "pausar_arena", id: "x" })).cuerpo.error,
  sinPermiso: (await llamar({ accion: "terminar_arena", id: ARENA }, "vencida")).estado,
};

// Cancelar una partida en juego, y sacar a un jugador de una arena.
db.partidas.push(
  { id: "60000000-0000-4000-8000-000000000001", torneo_id: ARENA, blancas: A, negras: B, estado: "en_juego", jugadas: [], fen: "", resultado: null, motivo: null, anulada: false, creada_en: "2026-11-01T01:05:00Z" },
  { id: "60000000-0000-4000-8000-000000000002", torneo_id: ARENA, blancas: B, negras: A, estado: "terminada", jugadas: MATE, fen: FEN_MATE, resultado: "1-0", motivo: "mate", anulada: false, terminada_en: "2026-11-01T01:20:00Z", creada_en: "2026-11-01T01:10:00Z" },
);
db.cola.push({ torneo_id: ARENA, jugador_id: A }, { torneo_id: ARENA, jugador_id: B });
const cuentaPartidas = async () => (await llamar({ accion: "partidas_arena", torneo_id: ARENA })).cuerpo;
const antesPgn = await cuentaPartidas();
R.ctl.aborta = (await llamar({ accion: "abortar_partida", id: "40000000-0000-4000-8000-000000000003" })).estado;
const ab = db.partidas.find((x) => x.id === "40000000-0000-4000-8000-000000000003");
R.ctl.abortada = { estado: ab.estado, resultado: ab.resultado, motivo: ab.motivo };
R.ctl.abortarMalId = (await llamar({ accion: "abortar_partida", id: "x" })).cuerpo.error;

db.partidas.push({ id: "60000000-0000-4000-8000-000000000005", torneo_id: T1, blancas: A, negras: B, estado: "en_juego", jugadas: [], fen: "", resultado: null, motivo: null, anulada: false, creada_en: "2026-11-01T01:06:00Z" });
const antesFuera = db.partidas.find((x) => x.id === "60000000-0000-4000-8000-000000000001");
const ex1 = await llamar({ accion: "expulsar", torneo_id: ARENA, jugador_id: A });
await llamar({ accion: "expulsar", torneo_id: ARENA, jugador_id: A });
R.ctl.expulsa = {
  canceladas: ex1.cuerpo.canceladas, fila: db.fuera.filter((f) => f.jugador_id === A).length,
  colaDeA: db.cola.filter((f) => f.jugador_id === A).length, colaDeB: db.cola.filter((f) => f.jugador_id === B).length,
  partida: [antesFuera.estado, antesFuera.motivo, antesFuera.resultado],
  otraArena: db.partidas.filter((x) => x.torneo_id === T1 && x.estado === "en_juego").length,
};
await llamar({ accion: "expulsar", torneo_id: ARENA, jugador_id: A, fuera: false });
R.ctl.vuelve = db.fuera.filter((f) => f.jugador_id === A).length;
R.ctl.expulsarMalo = (await llamar({ accion: "expulsar", torneo_id: ARENA, jugador_id: "x" })).cuerpo.error;

// El nivel de partida.
await llamar({ accion: "fijar_nivel", jugador_id: A, fuerza: 1500 });
R.ctl.nivel = db.jugadores.find((j) => j.id === A).fuerza;
R.ctl.nivelBajo = (await llamar({ accion: "fijar_nivel", jugador_id: A, fuerza: 50 })).cuerpo.error;
R.ctl.nivelDecimal = (await llamar({ accion: "fijar_nivel", jugador_id: A, fuerza: 1500.5 })).cuerpo.error;
R.ctl.nivelInexistente = (await llamar({ accion: "fijar_nivel", jugador_id: "50000000-0000-4000-8000-000000000009", fuerza: 1500 })).estado;

// Lo que se ve mientras corre, y las partidas para bajar en PGN.
db.partidas.push({ id: "60000000-0000-4000-8000-000000000004", torneo_id: ARENA, blancas: A, negras: B, estado: "en_juego", jugadas: J([["e4", "e2", "e4"]]), fen: "x", resultado: null, motivo: null, anulada: false, creada_en: "2026-11-01T01:30:00Z" });
const ctl = await llamar({ accion: "control", torneo_id: ARENA });
R.ctl.control = {
  estado: ctl.estado, torneo: ctl.cuerpo.torneo && ctl.cuerpo.torneo.id === ARENA,
  enJuego: (ctl.cuerpo.en_juego || []).map((x) => [x.nombre_blancas, x.nombre_negras, x.jugadas]),
  recientes: (ctl.cuerpo.recientes || []).map((x) => [x.nombre_blancas, x.resultado, x.motivo]),
  fuera: ctl.cuerpo.fuera, esperando: ctl.cuerpo.esperando, trae: Object.keys(ctl.cuerpo).sort(),
  sinUsuarios: !/usuario/.test(JSON.stringify(ctl.cuerpo)),
};
R.ctl.controlMalo = (await llamar({ accion: "control", torneo_id: "x" })).cuerpo.error;
R.ctl.controlInexistente = (await llamar({ accion: "control", torneo_id: "50000000-0000-4000-8000-000000000009" })).estado;
const pgn = await cuentaPartidas();
R.ctl.pgn = { antes: antesPgn.partidas.length, ahora: pgn.partidas.map((x) => [x.blancas, x.negras, x.resultado]) };
await llamar({ accion: "anular", partida_id: "60000000-0000-4000-8000-000000000002", motivo: "Prueba." });
R.ctl.pgnSinAnuladas = (await cuentaPartidas()).partidas.length;
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

  console.log("\n=== La revisión con chess.js y los indicios ===");
  const tipos = (l) => (l || []).map((x) => x.tipo).join(",");
  ok("una partida bien jugada hasta el mate no tiene problemas", tipos(R.rev.bien) === "", JSON.stringify(R.rev.bien));
  ok("una jugada ilegal se marca con su número", tipos(R.rev.ilegal) === "jugada_ilegal" && R.rev.ilegal[0].jugada === 4, JSON.stringify(R.rev.ilegal));
  ok("una jugada que dice salir de otra casilla también", tipos(R.rev.casillaCambiada) === "jugada_ilegal", JSON.stringify(R.rev.casillaCambiada));
  ok("una posición guardada que no es la de las jugadas", tipos(R.rev.fenDistinta) === "posicion_distinta", JSON.stringify(R.rev.fenDistinta));
  ok("un mate declarado que no es mate", tipos(R.rev.mateFalso) === "fin_falso", JSON.stringify(R.rev.mateFalso));
  ok("un resultado contra el mate del tablero", tipos(R.rev.contraElMate) === "resultado_contra_el_mate", JSON.stringify(R.rev.contraElMate));
  ok("salir de la pantalla 3 veces o más es un indicio; 2, no", R.ind.salidas.w.length === 1 && R.ind.salidas.w[0].veces === 4 && R.ind.salidas.b.length === 0, JSON.stringify(R.ind.salidas));
  ok("tiempos muy parejos en muchas jugadas son un indicio solo de quien los tuvo", R.ind.tiempos.w.length === 1 && R.ind.tiempos.w[0].tipo === "tiempos_parejos" && R.ind.tiempos.b.length === 0, JSON.stringify(R.ind.tiempos));
  ok("con pocas jugadas no se dice nada", R.ind.pocas.w.length === 0 && R.ind.pocas.b.length === 0, JSON.stringify(R.ind.pocas));

  console.log("\n=== El juego limpio en la Edge Function ===");
  const jl = R.jl;
  ok("revisa las partidas terminadas (no la que se está jugando)", jl.estado === 200 && jl.revisadas === 2 && jl.partidas.length === 2, JSON.stringify(jl));
  ok("y guarda la revisión", jl.guardadas === 2);
  ok("trae el mate falso, con los nombres", jl.partidas.some((x) => x.id === "2" && x.problemas.join() === "fin_falso" && x.blancas === "Ana"), JSON.stringify(jl.partidas));
  ok("y las salidas de la pantalla de quien las tuvo", jl.partidas.some((x) => x.id === "1" && x.salidas[1] === 5 && x.indicios.b.length === 1 && x.indicios.w.length === 0), JSON.stringify(jl.partidas));
  ok("lo ya revisado no se vuelve a revisar", jl.otraVez === 0);
  ok("anular sin motivo se rechaza y no anula", /Falta el motivo/.test(jl.sinMotivo || "") && jl.sinMotivoNoAnula === false, String(jl.sinMotivo));
  ok("anular marca la partida, con su motivo, quién y cuándo", jl.anulada.partida === true && jl.anulada.motivo === "Declaró un mate que no era." && !!jl.anulada.por && jl.anulada.en, JSON.stringify(jl.anulada));
  ok("y no borra la revisión", jl.anulada.revisionSigue);
  ok("devolver la deja contando otra vez, con las dos cosas en el historial", jl.devuelta.partida === false && jl.devuelta.motivo === null && jl.devuelta.historial.join() === "anular,devolver", JSON.stringify(jl.devuelta));
  ok("una partida que se está jugando no se anula", jl.enJuego === 404, String(jl.enJuego));
  ok("sin permiso de la Academia, el juego limpio tampoco se ve", jl.sinPermiso === 403);

  console.log("\n=== El control en vivo en la Edge Function ===");
  const cl = R.ctl;
  ok("pausar y reanudar", cl.pausa === true && cl.reanuda === false, JSON.stringify([cl.pausa, cl.reanuda]));
  ok("terminar antes de tiempo anota la hora de cierre y quita la pausa", cl.cierra.cerrada && cl.cierra.pausada === false, JSON.stringify(cl.cierra));
  ok("sumar minutos reabre una arena cerrada a mano", cl.suma.minutos === 90 && cl.suma.cerrada === null, JSON.stringify(cl.suma));
  ok("sumar de a poco suma", cl.tope === 210, String(cl.tope));
  ok("sumar demasiado se rechaza", /entre 1 y 120/.test(cl.extenderMucho || ""), String(cl.extenderMucho));
  ok("sumar a una arena pasada que seguiría terminada se rechaza", /seguiría terminada/.test(cl.extenderPasada || ""), String(cl.extenderPasada));
  ok("una arena que no existe da 404", cl.extenderInexistente === 404, String(cl.extenderInexistente));
  ok("un id que no es uuid se rechaza", /Falta la arena/.test(cl.pausarMalId || ""), String(cl.pausarMalId));
  ok("sin permiso de la Academia no se controla nada", cl.sinPermiso === 403);
  ok("cancelar una partida en juego la deja abortada, sin resultado", cl.aborta === 200 && cl.abortada.estado === "terminada" && cl.abortada.motivo === "abortada" && cl.abortada.resultado === null, JSON.stringify(cl.abortada));
  ok("cancelar con un id malo se rechaza", /Falta la partida/.test(cl.abortarMalId || ""), String(cl.abortarMalId));
  ok("sacar a alguien lo anota UNA sola vez aunque se pida dos", cl.expulsa.fila === 1, JSON.stringify(cl.expulsa));
  ok("y lo saca de la cola, sin tocar a los demás", cl.expulsa.colaDeA === 0 && cl.expulsa.colaDeB === 1, JSON.stringify(cl.expulsa));
  ok("y cancela su partida en juego de ESA arena, no las de otra", cl.expulsa.canceladas === 1 && cl.expulsa.partida.join() === "terminada,abortada," && cl.expulsa.otraArena === 1, JSON.stringify(cl.expulsa));
  ok("«Dejarlo volver» lo quita de la lista", cl.vuelve === 0, String(cl.vuelve));
  ok("sacar con un id malo se rechaza", /Falta el jugador/.test(cl.expulsarMalo || ""), String(cl.expulsarMalo));
  ok("fijar el nivel lo guarda", cl.nivel === 1500, String(cl.nivel));
  ok("un nivel fuera de 100–3500 o con decimales se rechaza", /entre 100 y 3500/.test(cl.nivelBajo || "") && /entre 100 y 3500/.test(cl.nivelDecimal || ""), JSON.stringify([cl.nivelBajo, cl.nivelDecimal]));
  ok("fijar el nivel de quien no existe da 404", cl.nivelInexistente === 404, String(cl.nivelInexistente));
  ok("«control» trae la arena, lo que se juega, lo reciente y cuántos esperan",
    cl.control.estado === 200 && cl.control.torneo && cl.control.esperando === 1
    && JSON.stringify(cl.control.trae) === JSON.stringify(["ahora", "clasificacion", "en_juego", "esperando", "fuera", "ok", "racha", "recientes", "torneo"]), JSON.stringify(cl.control));
  ok("lo que se juega trae los nombres y cuántas jugadas van", JSON.stringify(cl.control.enJuego) === JSON.stringify([["Ana", "Beto", 1]]), JSON.stringify(cl.control.enJuego));
  ok("y lo reciente trae el resultado y el motivo (también lo abortado, sin resultado)", cl.control.recientes.some((x) => x.join() === "Beto,1-0,mate") && cl.control.recientes.some((x) => x.join() === "Ana,,abortada"), JSON.stringify(cl.control.recientes));
  ok("«control» nunca trae el usuario de nadie (se proyecta en la pared)", cl.control.sinUsuarios);
  ok("«control» con un id malo se rechaza, y con uno que no existe da 404", /Falta la arena/.test(cl.controlMalo || "") && cl.controlInexistente === 404);
  ok("el PGN trae solo lo terminado con resultado, con los nombres", cl.pgn.antes === 1 && JSON.stringify(cl.pgn.ahora) === JSON.stringify([["Beto", "Ana", "1-0"]]), JSON.stringify(cl.pgn));
  ok("y no trae lo anulado", cl.pgnSinAnuladas === 0, String(cl.pgnSinAnuladas));
}
fs.rmSync(dir, { recursive: true, force: true });

/* ------------------------------------------ 6. arena-jugar, ejecutada */
console.log("\n=== La jugada validada por el servidor (arena-jugar) ===");
{
  const dirJ = fs.mkdtempSync(path.join(os.tmpdir(), "sala-jugar-"));
  const fuenteJ = leer("supabase/functions-colegios/arena-jugar/index.ts");
  const moduloJ = path.join(dirJ, "arena-jugar.mts");
  fs.writeFileSync(moduloJ, fuenteJ.replace(/^import "jsr:[^"]+";\s*$/m, "")
    .replace(/^import chessjs from "npm:chess\.js@[^"]+";\s*$/m,
      `import { createRequire } from "node:module"; const chessjs = createRequire(import.meta.url)(${JSON.stringify(require.resolve("chess.js"))});`));
  const pruebaJ = path.join(dirJ, "prueba.mjs");
  fs.writeFileSync(pruebaJ, `
let manejador = null;
globalThis.Deno = { serve: (h) => { manejador = h; }, env: { get: (k) => ({ SUPABASE_URL: "https://base.test", SUPABASE_SERVICE_ROLE_KEY: "clave-de-servicio" })[k] } };
import { createRequire } from "node:module";
const { Chess } = createRequire(import.meta.url)(${JSON.stringify(require.resolve("chess.js"))});

const ANA = "10000000-0000-4000-8000-000000000001", BETO = "10000000-0000-4000-8000-000000000002", CARLA = "10000000-0000-4000-8000-000000000003";
const TOKENS = { "tok-ana": ANA, "tok-beto": BETO, "tok-carla": CARLA };
const partidas = new Map();
const llamadasRpc = [];
let rpcRespuesta = null;
const resp = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

/* Arma una partida en juego con las jugadas dichas en SAN (la FEN sale de chess.js). */
let n = 0;
function partida(sans, extra = {}) {
  const g = new Chess();
  for (const s of sans) g.move(s);
  const id = "20000000-0000-4000-8000-" + String(++n).padStart(12, "0");
  const fila = Object.assign({ id, blancas: ANA, negras: BETO, estado: "en_juego", jugadas: sans.map((s) => ({ s })), fen: g.fen() }, extra);
  partidas.set(id, fila);
  return fila;
}

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const auth = (init.headers || {}).Authorization || "";
  if (url === "https://base.test/auth/v1/user") {
    const id = TOKENS[auth.replace("Bearer ", "")];
    return id ? resp({ id }) : resp({ msg: "invalid" }, 401);
  }
  if (auth !== "Bearer clave-de-servicio") return resp({ message: "sin clave de servicio" }, 401);
  const u = new URL(url);
  if (u.pathname === "/rest/v1/arena_partidas") {
    const id = u.searchParams.get("id").replace("eq.", "");
    return resp(partidas.has(id) ? [partidas.get(id)] : []);
  }
  if (u.pathname === "/rest/v1/rpc/arena_aplicar_jugada") {
    const cuerpo = JSON.parse(init.body);
    llamadasRpc.push(cuerpo);
    if (rpcRespuesta) return resp(rpcRespuesta.cuerpo, rpcRespuesta.estado);
    return resp({ id: cuerpo.p_partida, fen: cuerpo.p_fen, devuelta: true });
  }
  return resp({ message: "ruta desconocida " + u.pathname }, 404);
};

await import(${JSON.stringify("file://" + moduloJ)});
const llamar = async (cuerpo, token = "tok-ana", metodo = "POST") => {
  const cabeceras = { "Content-Type": "application/json" };
  if (token) cabeceras.Authorization = "Bearer " + token;
  const r = await manejador(new Request("https://f.test/arena-jugar", { method: metodo, headers: cabeceras, body: metodo === "POST" ? (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) : undefined }));
  return { estado: r.status, cuerpo: await r.json() };
};
const R = {};
const inicio = partida([]);
const rpcs = () => llamadasRpc.length;

R.sinSesion = (await llamar({ partida: inicio.id, desde: "e2", hasta: "e4" }, null)).estado;
R.tokenFalso = (await llamar({ partida: inicio.id, desde: "e2", hasta: "e4" }, "tok-falso")).estado;
R.get = (await llamar(null, "tok-ana", "GET")).estado;
R.jsonRoto = (await llamar("{no es json")).estado;
R.partidaMala = (await llamar({ partida: "x", desde: "e2", hasta: "e4" })).cuerpo.error;
R.casillaMala = (await llamar({ partida: inicio.id, desde: "e9", hasta: "e4" })).cuerpo.error;
R.casillaInyeccion = (await llamar({ partida: inicio.id, desde: "e2", hasta: "e4&x=1" })).estado;
R.piezaMala = (await llamar({ partida: inicio.id, desde: "e2", hasta: "e4", promocion: "k" })).cuerpo.error;
R.noExiste = (await llamar({ partida: "20000000-0000-4000-8000-0000000000ff", desde: "e2", hasta: "e4" })).estado;
R.ajena = (await llamar({ partida: inicio.id, desde: "e2", hasta: "e4" }, "tok-carla")).estado;
R.turnoAjeno = (await llamar({ partida: inicio.id, desde: "e7", hasta: "e5" }, "tok-beto")).cuerpo.error;
R.ilegal = (await llamar({ partida: inicio.id, desde: "e2", hasta: "e5" })).cuerpo.error;
R.piezaAjena = (await llamar({ partida: inicio.id, desde: "e7", hasta: "e5" })).cuerpo.error;
R.hastaAhoraRpc = rpcs();

// Una jugada legal: el SERVIDOR calcula el SAN y la FEN; la identidad sale del token, no del cuerpo.
const buena = await llamar({ partida: inicio.id, desde: "e2", hasta: "e4", jugador: BETO, p_jugador: BETO, fen: "inventada", san: "Qh5#", fin: "mate" });
const c1 = llamadasRpc[0] || {};
R.buena = { estado: buena.estado, ok: buena.cuerpo.ok, san: c1.p_san, desde: c1.p_desde, hasta: c1.p_hasta, jugador: c1.p_jugador, fen: c1.p_fen, fin: c1.p_fin, devuelve: buena.cuerpo.partida && buena.cuerpo.partida.devuelta };

// Una coronación: sin la pieza se pide; con ella, el SAN lo arma el servidor.
const coronar = partida(["a4", "b5", "axb5", "a6", "bxa6", "Bb7", "axb7", "Nc6"]);
R.coronarSinPieza = (await llamar({ partida: coronar.id, desde: "b7", hasta: "b8" })).cuerpo.error;
const antesC = rpcs();
await llamar({ partida: coronar.id, desde: "b7", hasta: "b8", promocion: "Q" });
R.coronar = { san: llamadasRpc[antesC] && llamadasRpc[antesC].p_san, fin: llamadasRpc[antesC] && llamadasRpc[antesC].p_fin };

// El mate: lo dice el servidor, no el navegador.
const mate = partida(["f3", "e5", "g4"]);
await llamar({ partida: mate.id, desde: "d8", hasta: "h4" }, "tok-beto");
const cm = llamadasRpc[llamadasRpc.length - 1];
R.mate = { san: cm.p_san, fin: cm.p_fin, jugador: cm.p_jugador };

// Tablas por repetición: la octava jugada cierra la tercera repetición de la posición inicial.
const rep = partida(["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1"]);
await llamar({ partida: rep.id, desde: "f6", hasta: "g8" }, "tok-beto");
R.repeticion = llamadasRpc[llamadasRpc.length - 1].p_fin;
const noRep = partida(["Nf3", "Nf6", "Ng1"]);
await llamar({ partida: noRep.id, desde: "f6", hasta: "g8" }, "tok-beto");
R.sinRepeticion = llamadasRpc[llamadasRpc.length - 1].p_fin;

// Una partida terminada se devuelve como está, sin llamar a la base.
const hecha = partida(["e4"], { estado: "terminada", resultado: "1-0" });
const antesH = rpcs();
const rh = await llamar({ partida: hecha.id, desde: "e7", hasta: "e5" }, "tok-beto");
R.terminada = { estado: rh.estado, ok: rh.cuerpo.ok, resultado: rh.cuerpo.partida.resultado, rpc: rpcs() - antesH };

// Lo guardado que no cuadra: se dice y no se mueve.
const rota = partida(["e4"], { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1" });
const rr = await llamar({ partida: rota.id, desde: "e7", hasta: "e5" }, "tok-beto");
R.noCuadra = { estado: rr.estado, error: rr.cuerpo.error };
const sanRota = partida(["e4"]); sanRota.jugadas = [{ s: "Zz9" }];
R.sanRota = (await llamar({ partida: sanRota.id, desde: "e7", hasta: "e5" }, "tok-beto")).estado;

// Si la base rechaza la jugada (reloj, turno…), se dice lo que ella dijo.
const noPasa = partida([]);
rpcRespuesta = { estado: 400, cuerpo: { message: "Todavía no es tu turno." } };
const rn = await llamar({ partida: noPasa.id, desde: "e2", hasta: "e4" });
R.baseRechaza = { estado: rn.estado, error: rn.cuerpo.error };
rpcRespuesta = { estado: 500, cuerpo: { message: "boom interno" } };
R.baseCae = (await llamar({ partida: noPasa.id, desde: "e2", hasta: "e4" })).estado;
rpcRespuesta = null;
R.rpcsEnIlegales = R.hastaAhoraRpc;
console.log(JSON.stringify(R));
`);
  const rj = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", pruebaJ], { encoding: "utf8", timeout: 60000 });
  let J = null;
  try { J = JSON.parse((rj.stdout || "").trim().split("\n").pop()); } catch (e) { /* abajo */ }
  if (!J) {
    ok("arena-jugar se ejecuta", false, (rj.stderr || rj.stdout || "sin salida").slice(0, 800));
  } else {
    ok("sin sesión: 401; con un token que Auth no reconoce: 401", J.sinSesion === 401 && J.tokenFalso === 401);
    ok("solo se acepta POST y un cuerpo que sea JSON", J.get === 405 && J.jsonRoto === 400);
    ok("una partida o casilla mal escritas se rechazan (nada llega a la base)", /Falta la partida/.test(J.partidaMala || "") && /no es válida/.test(J.casillaMala || "") && J.casillaInyeccion === 400);
    ok("una pieza de coronación que no existe se rechaza", /no existe/.test(J.piezaMala || ""), String(J.piezaMala));
    ok("una partida que no existe da 404; una en la que no juegas, 403", J.noExiste === 404 && J.ajena === 403, JSON.stringify([J.noExiste, J.ajena]));
    ok("mover cuando no es tu turno se rechaza", /no es tu turno/.test(J.turnoAjeno || ""), String(J.turnoAjeno));
    ok("una jugada ilegal se rechaza, y mover una pieza del rival también", /no es legal/.test(J.ilegal || "") && /no es legal/.test(J.piezaAjena || ""), JSON.stringify([J.ilegal, J.piezaAjena]));
    ok("y ninguna de esas llegó a la base", J.hastaAhoraRpc === 0, String(J.hastaAhoraRpc));
    ok("una jugada legal llega a la base con el SAN y la FEN que calculó el servidor, no los del cuerpo",
      J.buena.estado === 200 && J.buena.ok === true && J.buena.san === "e4" && J.buena.desde === "e2" && J.buena.hasta === "e4"
      && J.buena.fen === "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1" && J.buena.fin === null, JSON.stringify(J.buena));
    ok("y quien juega sale del token (Ana), aunque el cuerpo diga que es Beto", J.buena.jugador === "10000000-0000-4000-8000-000000000001", String(J.buena.jugador));
    ok("devuelve la partida que contestó la base", J.buena.devuelve === true);
    ok("coronar sin decir la pieza lo pide", /pieza en que coronas/.test(J.coronarSinPieza || ""), String(J.coronarSinPieza));
    ok("y con la pieza (aunque llegue en mayúscula) arma el SAN de la coronación", J.coronar.san === "b8=Q" && J.coronar.fin === null, JSON.stringify(J.coronar));
    ok("el mate lo declara el servidor", J.mate.san === "Qh4#" && J.mate.fin === "mate" && J.mate.jugador === "10000000-0000-4000-8000-000000000002", JSON.stringify(J.mate));
    ok("la triple repetición también (repite la partida entera)", J.repeticion === "repeticion" && J.sinRepeticion === null, JSON.stringify([J.repeticion, J.sinRepeticion]));
    ok("una partida terminada se devuelve como está, sin tocar la base", J.terminada.estado === 200 && J.terminada.ok === true && J.terminada.resultado === "1-0" && J.terminada.rpc === 0, JSON.stringify(J.terminada));
    ok("si lo guardado no cuadra con sus jugadas, no deja mover y lo dice", J.noCuadra.estado === 500 && /no coincide/.test(J.noCuadra.error || "") && J.sanRota === 500, JSON.stringify([J.noCuadra, J.sanRota]));
    ok("si la base rechaza la jugada, se dice lo que ella dijo; si se cae, 502", J.baseRechaza.estado === 400 && J.baseRechaza.error === "Todavía no es tu turno." && J.baseCae === 502, JSON.stringify([J.baseRechaza, J.baseCae]));
  }
  fs.rmSync(dirJ, { recursive: true, force: true });
}

console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\n✓ todo bien");
process.exit(fallos ? 1 : 0);
