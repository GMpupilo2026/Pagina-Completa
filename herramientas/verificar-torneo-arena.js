/* Comprueba el formato «Arena» de los torneos de la Academia: lo que se crea en
   torneos.html, y en torneo.html la cuenta regresiva, la cola, la
   clasificación y el cierre. Con un Supabase de mentira que apunta cada
   llamada: acá se mira lo que la página MANDA y lo que pinta.

   Lo que decide algo en una arena lo lleva la base (con quién te toca, a qué
   hora termina, los puntos, el cierre). Eso se comprobó impersonando roles en
   SQL dentro de una transacción que se deshizo (ver «El formato Arena dentro
   de los torneos de la Academia» en docs/decisiones/juegos-y-torneos.md), y de
   la migración acá se lee lo que no puede faltar: la cola sin políticas, el
   execute de cada función, el search_path, el candado del emparejamiento.

   Sin navegador:
     1. js/torneo-arena.js: las duraciones (dentro de lo que acepta la base),
        los textos y la cuenta regresiva.
     2. La cola: pregunta ya mismo y sigue preguntando, manda la posición de
        salida, se detiene con la partida, con un error de la base y al salir
        (y al salir avisa a la base).
     3. La migración.
   En un navegador:
     4. Crear una arena: aparece la duración, «Aleatorio» se apaga, y lo que
        se inserta lleva format arena y sus minutos.
     5. Empezarla: una sola llamada a arena_empezar aunque se haga doble clic,
        y la página no arma rondas ni partidas por su cuenta.
     6. En curso, una alumna inscrita: el reloj, la clasificación en el orden
        de la base con la racha ESCRITA, un nombre con HTML como texto, las
        partidas en vivo, las últimas con su resultado, ni rondas ni la tabla
        de los otros formatos, y sin el botón de terminar. «Entrar a jugar»
        llama a arena_buscar con el torneo y la posición; «Dejar de buscar», a
        arena_salir; y cuando la base contesta «emparejado», va a la partida.
     7. Quien no está inscrita puede entrar con la arena empezada.
     8. Con una partida propia en juego: el enlace a la partida, y con
        ?jugar=1 (la vuelta desde una partida) va sola.
     9. Se acabó el tiempo: no se ofrece jugar y se pide el cierre a la base.
    10. Quien organiza la termina antes: confirma y manda p_ahora.
    11. Terminada: el campeón y nada que jugar.
    12. js/torneo-sync.js no cierra una arena por rondas ni le escribe el
        resultado, y al terminar una partida ofrece «otra partida» (arena en
        curso, a quien jugó) o «volver al torneo».

   Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
         node herramientas/verificar-torneo-arena.js                          */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : ""));
}

/* ---------- 1 y 2. El módulo, sin navegador ---------- */

function cargarModulo(extra) {
  const ctx = Object.assign({ window: {}, setInterval: setInterval, clearInterval: clearInterval, Date: Date }, extra || {});
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "torneo-arena.js"), "utf8"), ctx);
  return ctx.window.TorneoArena;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pruebaModulo() {
  console.log("\n▶ js/torneo-arena.js");
  const A = cargarModulo();
  ok("las duraciones caben en lo que acepta la base (5 a 240 minutos)", A.DURACIONES.length > 3 && A.DURACIONES.every((m) => Number.isInteger(m) && m >= 5 && m <= 240), A.DURACIONES);
  ok("la duración por omisión es una de la lista", A.DURACIONES.includes(A.DURACION_POR_OMISION), A.DURACION_POR_OMISION);
  ok("30 → «30 minutos», 60 → «1 hora», 90 → «1 hora y 30 minutos», 120 → «2 horas»",
    A.etiquetaDuracion(30) === "30 minutos" && A.etiquetaDuracion(60) === "1 hora" && A.etiquetaDuracion(90) === "1 hora y 30 minutos" && A.etiquetaDuracion(120) === "2 horas",
    [30, 60, 90, 120].map(A.etiquetaDuracion));
  ok("el formato se lee «Arena de 45 minutos»", A.etiqueta({ arena_minutos: 45 }) === "Arena de 45 minutos", A.etiqueta({ arena_minutos: 45 }));
  ok("la cuenta regresiva: 12:34, 1:02:03 y nunca negativa",
    A.textoFaltan(754000) === "12:34" && A.textoFaltan(3723000) === "1:02:03" && A.textoFaltan(-5000) === "0:00",
    [A.textoFaltan(754000), A.textoFaltan(3723000), A.textoFaltan(-5000)]);
  const en5 = new Date(Date.now() + 5 * 60000).toISOString();
  const f = A.faltan({ arena_termina: en5 });
  ok("lo que falta sale de arena_termina", f > 290000 && f <= 300000, f);
  ok("sin hora de cierre no inventa una", A.faltan({ arena_termina: null }) === null);
  // Con el reloj de la base 10 minutos adelantado, esa arena ya terminó.
  ok("cuenta con la hora de la base, no con la de la computadora", cargarModuloCon(600000).faltan({ arena_termina: en5 }) < 0);
}

function cargarModuloCon(desfase) {
  const win = { RelojServidor: { ahora: () => Date.now() + desfase } };
  const ctx = { window: win, RelojServidor: win.RelojServidor, setInterval: setInterval, clearInterval: clearInterval, Date: Date };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "torneo-arena.js"), "utf8"), ctx);
  return win.TorneoArena;
}

async function pruebaCola() {
  console.log("\n▶ La cola");
  const A = cargarModulo();
  const hacer = (respuestas) => {
    const llamadas = [], cambios = [];
    let i = 0;
    const sb = { rpc: (n, args) => {
      llamadas.push({ n: n, args: args });
      if (n !== "arena_buscar") return Promise.resolve({ data: null, error: null });
      const r = respuestas[Math.min(i++, respuestas.length - 1)];
      return Promise.resolve(r);
    } };
    const cola = A.cola({ sb: sb, torneoId: "t1", cadaMs: 40, estadoInicial: () => ({ fen: "FEN-DE-SALIDA", variant_state: { w_unlocks: 5 } }), alCambiar: (r) => cambios.push(r) });
    return { cola, llamadas, cambios, buscar: () => llamadas.filter((l) => l.n === "arena_buscar") };
  };

  let p = hacer([{ data: { estado: "esperando", esperan: 0 }, error: null }]);
  p.cola.entrar();
  await espera(150);
  ok("al entrar pregunta ya mismo y sigue preguntando (el «sigo aquí»)", p.buscar().length >= 3, p.buscar().length);
  ok("manda el torneo y la posición de salida", p.buscar()[0].args.p_torneo === "t1" && p.buscar()[0].args.p_fen === "FEN-DE-SALIDA"
    && p.buscar()[0].args.p_variant && p.buscar()[0].args.p_cartas === null && p.buscar()[0].args.p_duelo === null, p.buscar()[0].args);
  ok("mientras espera, sigue activa", p.cola.activa());
  p.cola.salir();
  const hasta = p.buscar().length;
  await espera(120);
  ok("al salir deja de preguntar", p.buscar().length === hasta && !p.cola.activa(), [hasta, p.buscar().length]);
  ok("y le avisa a la base (arena_salir)", p.llamadas.some((l) => l.n === "arena_salir" && l.args.p_torneo === "t1"), p.llamadas.map((l) => l.n));

  p = hacer([{ data: { estado: "esperando", esperan: 2 }, error: null }, { data: { estado: "emparejado", sala: "s9", modalidad: "estandar" }, error: null }]);
  p.cola.entrar();
  await espera(200);
  ok("con la partida, deja de preguntar", p.buscar().length === 2 && !p.cola.activa(), p.buscar().length);
  ok("y entrega la sala a la página", p.cambios.length === 2 && p.cambios[1].sala === "s9", p.cambios);

  p = hacer([{ data: null, error: { code: "42501", message: "Tu acceso a la Academia no está activo." } }]);
  p.cola.entrar();
  await espera(150);
  ok("un «no» de la base no se reintenta para siempre", p.buscar().length === 1 && !p.cola.activa(), p.buscar().length);
  ok("y se le dice a la página con el mensaje de la base", p.cambios.length === 1 && p.cambios[0].estado === "error" && /acceso/.test(p.cambios[0].mensaje), p.cambios);

  p = hacer([{ data: null, error: { message: "Failed to fetch" } }]);
  p.cola.entrar();
  await espera(250);
  ok("un corte de red se reintenta, tres veces", p.buscar().length === 3 && !p.cola.activa(), p.buscar().length);

  p = hacer([{ data: { estado: "terminada" }, error: null }]);
  p.cola.entrar();
  await espera(120);
  ok("con la arena terminada, se detiene", p.buscar().length === 1 && !p.cola.activa(), p.buscar().length);
}

/* ---------- 3. La migración ---------- */

function pruebaMigracion() {
  console.log("\n▶ La migración");
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const archivo = fs.readdirSync(dir).filter((f) => /_torneo_arena\.sql$/.test(f)).sort().pop();
  ok("está guardada en supabase/migraciones (…_torneo_arena.sql)", !!archivo);
  if (!archivo) return;
  const sql = fs.readFileSync(path.join(dir, archivo), "utf8");
  const sinComentarios = sql.replace(/^\s*--.*$/gm, "");

  ok("el formato «arena» entra en tournaments_format_check", /tournaments_format_check[\s\S]{0,200}'arena'/.test(sinComentarios));
  ok("una arena lleva duración (5 a 240), reloj y no es aleatoria", /arena_minutos between 5 and 240/.test(sinComentarios) && /variant <> 'aleatorio'/.test(sinComentarios) && /initial_seconds is not null/.test(sinComentarios));
  ok("la cola tiene RLS", /alter table public\.tournament_arena_cola enable row level security/.test(sinComentarios));
  ok("la cola no tiene NINGUNA política: solo la tocan las funciones", !/create policy[^;]*tournament_arena_cola/i.test(sinComentarios));
  ok("y se le quitan los permisos a anon y authenticated", /revoke all on public\.tournament_arena_cola from anon, authenticated/.test(sinComentarios));

  // Cada función: su search_path y su execute.
  const funciones = [...sinComentarios.matchAll(/create (?:or replace )?function ((?:public|interno)\.\w+)\(([\s\S]*?)\)\s*returns[\s\S]*?\$function\$[\s\S]*?\$function\$;/g)];
  const nombres = funciones.map((m) => m[1]);
  ok("están las cinco funciones de la arena y el trigger del resultado",
    ["public.arena_empezar", "public.arena_buscar", "public.arena_salir", "public.arena_clasificacion", "public.arena_cerrar", "interno.arena_anotar_resultado"].every((n) => nombres.includes(n)), nombres);
  const sinPath = funciones.filter((m) => !/set search_path to ''/.test(m[0])).map((m) => m[1]);
  ok("todas con search_path vacío", sinPath.length === 0, sinPath);
  const abiertas = nombres.filter((n) => /^public\.arena_/.test(n) && !new RegExp("revoke execute on function " + n.replace(".", "\\.") + "\\([^)]*\\) from public, anon;").test(sinComentarios));
  ok("ninguna arena_* se puede ejecutar sin sesión (revoke … from public, anon)", abiertas.length === 0, abiertas);
  ok("la del trigger no la ejecuta nadie desde afuera", /revoke execute on function interno\.arena_anotar_resultado\(\) from public, anon, authenticated;/.test(sinComentarios));

  const cuerpo = (n) => (funciones.find((m) => m[1] === n) || [""])[0];
  ok("el emparejamiento va con un candado por torneo", /pg_advisory_xact_lock/.test(cuerpo("public.arena_buscar")));
  ok("pide el acceso vigente y estar en la lista", /acceso_vigente\(\)/.test(cuerpo("public.arena_buscar")) && /tournament_registrations/.test(cuerpo("public.arena_buscar")));
  ok("la partida nace con los dos listos y el reloj andando", /white_ready, black_ready, clock_updated_at/.test(cuerpo("public.arena_buscar")) && /true, true, now\(\)/.test(cuerpo("public.arena_buscar")));
  ok("la clasificación corre con los permisos de quien llama", !/security definer/.test(cuerpo("public.arena_clasificacion")));
  ok("lo que termina después de la hora no cuenta", /finished_at <= \(select t\.arena_termina/.test(cuerpo("public.arena_clasificacion")));
  ok("cerrar antes de tiempo es solo de quien organiza, y el permiso va en coalesce", /if not coalesce\(v_manda or exists/.test(cuerpo("public.arena_cerrar")) && /if not v_manda then/.test(cuerpo("public.arena_cerrar")));
  ok("el cierre también va con candado", /pg_advisory_xact_lock/.test(cuerpo("public.arena_cerrar")));
  ok("a un inscrito se le revierten la duración y la hora de cierre", /new\.arena_minutos := old\.arena_minutos;/.test(cuerpo("public.proteger_torneo")) && /new\.arena_termina := old\.arena_termina;/.test(cuerpo("public.proteger_torneo")));
  ok("el resultado pasa al cruce solo en las arenas, al terminar la partida",
    /t\.format = 'arena'/.test(cuerpo("interno.arena_anotar_resultado")) && /when \(new\.status = 'finished' and old\.status is distinct from 'finished'\)/.test(sinComentarios));
  ok("la política nueva pregunta por (select auth.uid())", !/[^(]\bauth\.uid\(\)/.test((sinComentarios.match(/alter policy[\s\S]*?;/) || [""])[0].replace(/\(select auth\.uid\(\)\)/g, "")));
}

/* ---------- El Supabase de mentira ---------- */

function doble(datos, usuarioId, opciones) {
  return `
(function () {
  const T = ${JSON.stringify(datos)};
  const OPC = ${JSON.stringify(opciones || {})};
  window.__T = T;
  window.__escrituras = [];
  window.__rpc = [];
  let siguiente = 1, buscadas = 0;
  const cmp = (a, b) => String(a) === String(b);
  const nulo = (v) => v === undefined || v === null;

  // Los filtros se apuntan y se aplican en el RESOLVER, también en update y delete.
  function constructor(tabla) {
    const filtros = [];
    let op = "select", carga = null, unica = false, devolver = false, orden = null, rango = null;
    const b = {
      select() { devolver = true; return b; },
      eq(c, v) { filtros.push((r) => cmp(r[c], v)); return b; },
      neq(c, v) { filtros.push((r) => !cmp(r[c], v)); return b; },
      in(c, vs) { filtros.push((r) => (vs || []).some((v) => cmp(r[c], v))); return b; },
      is(c, v) { filtros.push((r) => (nulo(r[c]) ? null : r[c]) === v); return b; },
      not(c, o, v) { if (o === "is" && v === null) filtros.push((r) => !nulo(r[c])); return b; },
      // or("white_id.eq.X,black_id.eq.X"): filtra de verdad. Sin esto, el aviso
      // de «te asignaron una partida» recibía las partidas de otros y se
      // llevaba la página a una partida ajena.
      or(expresion) {
        const partes = String(expresion).split(",").map((x) => x.split("."));
        filtros.push((r) => partes.some((x) => x[1] === "eq" && cmp(r[x[0]], x.slice(2).join("."))));
        return b;
      },
      limit() { return b; },
      range(a, z) { rango = [a, z]; return b; },
      order(c, o) { orden = { c: c, asc: !o || o.ascending !== false }; return b; },
      insert(f) { op = "insert"; carga = f; return b; },
      update(f) { op = "update"; carga = f; return b; },
      delete() { op = "delete"; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) { return resolver().then(res, rej); },
    };
    async function resolver() {
      const filas = T[tabla] || (T[tabla] = []);
      const pasa = (r) => filtros.every((f) => f(r));
      if (op === "insert") {
        const nuevas = (Array.isArray(carga) ? carga : [carga]).map((f) => Object.assign({ id: tabla + "-" + (siguiente++) }, f));
        nuevas.forEach((n) => { filas.push(n); window.__escrituras.push({ tabla: tabla, op: "insert", fila: n }); });
        return { data: unica ? nuevas[0] : nuevas, error: null };
      }
      if (op === "update") {
        const tocadas = filas.filter(pasa);
        tocadas.forEach((r) => Object.assign(r, carga));
        window.__escrituras.push({ tabla: tabla, op: "update", carga: carga, filas: tocadas.length });
        return { data: devolver ? tocadas.map((r) => Object.assign({}, r)) : null, error: null };
      }
      if (op === "delete") {
        const quedan = filas.filter((r) => !pasa(r));
        window.__escrituras.push({ tabla: tabla, op: "delete", filas: filas.length - quedan.length });
        T[tabla] = quedan;
        return { data: null, error: null };
      }
      let d = filas.filter(pasa).map((r) => Object.assign({}, r));
      if (orden) d.sort((x, y) => (x[orden.c] < y[orden.c] ? -1 : x[orden.c] > y[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1));
      if (rango) d = d.slice(rango[0], rango[1] + 1);
      if (unica) d = d.length ? d[0] : null;
      return { data: d, error: null };
    }
    return b;
  }

  /* Las funciones de la arena: se apunta cada llamada. Lo que contestan lo
     dice la prueba (OPC); arena_empezar hace lo de la base, lo justo para que
     la página vuelva a pintar. */
  async function rpc(n, args) {
    window.__rpc.push({ n: n, args: args || null });
    if (n === "hora_servidor_ms") return { data: Date.now(), error: null };
    if (n === "arena_clasificacion") return { data: OPC.tabla || [], error: null };
    if (n === "arena_empezar") {
      await new Promise((r) => setTimeout(r, 150));
      const t = T.tournaments.find((x) => x.id === args.p_torneo);
      if (t.status !== "registration") return { data: null, error: { code: "42501", message: "Esta arena ya empezó, o no la organizas tú." } };
      t.status = "in_progress";
      t.arena_termina = new Date(Date.now() + t.arena_minutos * 60000).toISOString();
      return { data: t.arena_termina, error: null };
    }
    if (n === "arena_buscar") {
      const lista = OPC.buscar || [{ estado: "esperando", esperan: 0 }];
      return { data: lista[Math.min(buscadas++, lista.length - 1)], error: null };
    }
    if (n === "arena_cerrar") {
      if (!OPC.cierra) return { data: false, error: null };
      const t = T.tournaments.find((x) => x.id === args.p_torneo);
      t.status = "finished"; t.winner_ids = OPC.ganadores || [];
      return { data: true, error: null };
    }
    return { data: [], error: null };
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t),
    rpc: rpc,
    channel: () => {
      const c = { on() { return c; }, subscribe(cb) { if (cb) cb("SUBSCRIBED"); return c; },
                  track() { return Promise.resolve(); }, presenceState() { return {}; } };
      return c;
    },
    removeChannel: () => {},
  };
})();
`;
}

const PROFE = { id: "u-profe", full_name: "Profe Oscar", email: "profe@x.cr", role: "profesor", is_admin: false };
const ANA = { id: "u-ana", full_name: "Ana Rojas", email: "ana@x.cr", role: "alumno", is_admin: false };
const BRUNO = { id: "u-bruno", full_name: "Bruno Mena", email: "bruno@x.cr", role: "alumno", is_admin: false };
const CARLA = { id: "u-carla", full_name: "<b>Carla</b> Soto", email: "carla@x.cr", role: "alumno", is_admin: false };
const DIEGO = { id: "u-diego", full_name: "Diego Paz", email: "diego@x.cr", role: "alumno", is_admin: false };
const ELENA = { id: "u-elena", full_name: "Elena Vargas", email: "elena@x.cr", role: "alumno", is_admin: false };
const GENTE = [PROFE, ANA, BRUNO, CARLA, DIEGO, ELENA];

const EN_30 = () => new Date(Date.now() + 30 * 60000).toISOString();
const HACE = (min) => new Date(Date.now() - min * 60000).toISOString();
const FEN_ITALIANA = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

function datos(torneo, mas) {
  const inscritos = (mas && mas.inscritos) || [ANA, BRUNO, CARLA, DIEGO];
  return Object.assign({
    tournaments: [Object.assign({
      id: "t1", name: "Arena del viernes", format: "arena", variant: "estandar", arena_minutos: 30, arena_termina: null,
      created_by: PROFE.id, initial_seconds: 180, increment_seconds: 2, winner_ids: [], status: "registration",
    }, torneo)],
    tournament_registrations: inscritos.map((p, i) => ({ tournament_id: "t1", player_id: p.id, registered_at: "2026-11-20T10:0" + i })),
    tournament_rounds: torneo && torneo.status && torneo.status !== "registration" ? [{ id: "rd1", tournament_id: "t1", round_number: 1, status: "pending" }] : [],
    tournament_pairings: [],
    game_rooms: [],
    profiles: GENTE,
    public_tournament_champions: [],
  }, (mas && mas.tablas) || {});
}

// Una arena en curso con una partida en juego (Carla y Diego) y dos terminadas.
function enCurso(mas) {
  return datos({ status: "in_progress", arena_termina: EN_30() }, Object.assign({ tablas: {
    tournament_pairings: [
      { id: "c1", round_id: "rd1", tournament_id: "t1", board_number: 1, white_id: ANA.id, black_id: BRUNO.id, is_bye: false, game_room_id: "s1", result: "white", jugadas: 41, created_at: HACE(12), finished_at: HACE(9) },
      { id: "c2", round_id: "rd1", tournament_id: "t1", board_number: 2, white_id: BRUNO.id, black_id: CARLA.id, is_bye: false, game_room_id: "s2", result: "draw", jugadas: 8, created_at: HACE(8), finished_at: HACE(7) },
      { id: "c3", round_id: "rd1", tournament_id: "t1", board_number: 3, white_id: CARLA.id, black_id: DIEGO.id, is_bye: false, game_room_id: "s3", result: null, created_at: HACE(2), finished_at: null },
    ],
    game_rooms: [
      { id: "s3", variant: "estandar", status: "playing", white_id: CARLA.id, black_id: DIEGO.id, white_ready: true, black_ready: true, fen: FEN_ITALIANA, moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
    ],
  } }, mas));
}

const TABLA = [
  { player_id: ANA.id, puntos: 8, partidas: 3, ganadas: 3, tablas: 0, perdidas: 0, en_racha: true },
  { player_id: CARLA.id, puntos: 3, partidas: 2, ganadas: 1, tablas: 1, perdidas: 0, en_racha: false },
  { player_id: BRUNO.id, puntos: 1, partidas: 3, ganadas: 0, tablas: 1, perdidas: 2, en_racha: false },
  { player_id: DIEGO.id, puntos: 0, partidas: 0, ganadas: 0, tablas: 0, perdidas: 0, en_racha: false },
];

async function abrir(browser, pagina, base, quien, opciones) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(doble(base, quien.id, opciones));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/" + pagina);
  await page.waitForTimeout(1500);
  return { ctx, page, errores };
}

const seVe = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
}, selector);
// Lo que la página escribió en las tablas del torneo y de las partidas (el
// resto —el tiempo en la plataforma, por ejemplo— no es de esta prueba).
const DEL_TORNEO = () => window.__escrituras
  .filter((e) => /^(tournaments|tournament_|game_rooms|public_tournament_champions)/.test(e.tabla))
  .map((e) => e.tabla + ":" + e.op);
const rpcs = (page, nombre) => page.evaluate((n) => window.__rpc.filter((l) => l.n === n), nombre);

/* ---------- 4. Crear ---------- */

async function pruebaCrear(browser) {
  console.log("\n▶ Crear una arena (torneos.html)");
  const base = datos({}, {});
  base.tournaments = [];
  base.tournament_registrations = [];
  const { ctx, page, errores } = await abrir(browser, "torneos.html", base, PROFE);
  ok("«Arena» está entre los formatos", await page.evaluate(() => [...document.querySelectorAll("#format-select option")].some((o) => o.value === "arena" && o.textContent.trim() === "Arena")));
  ok("la duración no se ve con otro formato", !(await seVe(page, "#arena-campo")));
  await page.selectOption("#variant-select", "aleatorio");
  await page.selectOption("#format-select", "arena");
  ok("al elegir Arena aparece la duración", await seVe(page, "#arena-campo"));
  ok("y se explica cómo se juega", /dos victorias seguidas/.test(await page.textContent("#format-desc")));
  const mod = await page.evaluate(() => ({ valor: document.getElementById("variant-select").value, apagada: document.querySelector('#variant-select option[value="aleatorio"]').disabled, sorteo: document.getElementById("modos-campo").hidden }));
  ok("«Aleatorio» se apaga y deja de estar elegido", mod.apagada && mod.valor !== "aleatorio" && mod.sorteo, mod);
  await page.selectOption("#arena-minutos", "45");
  await page.fill("#name-input", "Arena del viernes");
  await page.click("#create-form button[type=submit]");
  await page.waitForTimeout(1200);
  ok("lleva a la página del torneo creado", /torneo\.html\?id=/.test(page.url()), page.url());
  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  await ctx.close();

  // Lo insertado se mira sin dejar que la página se vaya.
  const otra = await abrir(browser, "torneos.html", base, PROFE);
  await otra.page.selectOption("#format-select", "arena");
  await otra.page.selectOption("#arena-minutos", "45");
  await otra.page.fill("#name-input", "Arena del viernes");
  const insertada = await otra.page.evaluate(() => new Promise((resolve) => {
    const original = window.sb.from;
    window.sb.from = (t) => {
      const b = original(t);
      if (t !== "tournaments") return b;
      const insertar = b.insert;
      b.insert = (f) => { resolve(f); return insertar(f); };
      return b;
    };
    document.querySelector("#create-form button[type=submit]").click();
    setTimeout(() => resolve(null), 2000);
  }));
  ok("lo que se inserta: format arena, 45 minutos y su ritmo", !!insertada && insertada.format === "arena" && insertada.arena_minutos === 45
    && insertada.initial_seconds > 0 && insertada.modos_aleatorio === null && insertada.variant !== "aleatorio", insertada);
  await otra.ctx.close();

  // Un suizo no manda minutos de arena (la base lo rechazaría).
  const suizo = await abrir(browser, "torneos.html", base, PROFE);
  await suizo.page.fill("#name-input", "Copa");
  const comun = await suizo.page.evaluate(() => new Promise((resolve) => {
    const original = window.sb.from;
    window.sb.from = (t) => {
      const b = original(t);
      if (t !== "tournaments") return b;
      const insertar = b.insert;
      b.insert = (f) => { resolve(f); return insertar(f); };
      return b;
    };
    document.querySelector("#create-form button[type=submit]").click();
    setTimeout(() => resolve(null), 2000);
  }));
  ok("un Suizo no lleva minutos de arena", !!comun && comun.format === "swiss" && !("arena_minutos" in comun), comun);
  await suizo.ctx.close();
}

/* ---------- 5. Empezar ---------- */

async function pruebaEmpezar(browser) {
  console.log("\n▶ Empezar la arena");
  const { ctx, page, errores } = await abrir(browser, "torneo.html?id=t1", datos({ status: "registration" }), PROFE);
  ok("la cabecera dice «Arena de 30 minutos»", /Arena de 30 minutos/.test(await page.textContent("#t-meta")), await page.textContent("#t-meta"));
  ok("el botón dice «Empezar la arena»", (await page.textContent("#start-btn")).trim() === "Empezar la arena", await page.textContent("#start-btn"));
  ok("no pide número de rondas", !(await seVe(page, "#rounds-field")));
  ok("la nota habla del reloj de la arena, no de rondas", /reloj de la arena/.test(await page.textContent("#start-nota")) && !/ronda/.test(await page.textContent("#start-nota")));
  await page.click("#start-btn");
  await page.waitForTimeout(40);
  await page.click("#start-btn", { force: true }).catch(() => {});
  await page.waitForTimeout(2000);
  const llamadas = await rpcs(page, "arena_empezar");
  ok("con doble clic, UNA llamada a arena_empezar", llamadas.length === 1 && llamadas[0].args.p_torneo === "t1", llamadas);
  const escritas = await page.evaluate(DEL_TORNEO);
  ok("la página no arma rondas, partidas ni toca el torneo por su cuenta", escritas.length === 0, escritas);
  ok("queda en curso: se ve la arena con su reloj", (await seVe(page, "#arena-section")) && /^Quedan (29:5\d|30:00)$/.test(await page.textContent("#arena-reloj")), await page.textContent("#arena-reloj"));
  ok("quien organiza ve «Terminar la arena ahora»", await seVe(page, "#arena-terminar"));
  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  await ctx.close();

  const alumna = await abrir(browser, "torneo.html?id=t1", datos({ status: "registration" }), ANA);
  ok("a una alumna no se le ofrece empezarla", !(await seVe(alumna.page, "#start-btn")));
  await alumna.ctx.close();
}

/* ---------- 6. En curso ---------- */

async function pruebaEnCurso(browser) {
  console.log("\n▶ La arena en curso, una alumna inscrita");
  const { ctx, page, errores } = await abrir(browser, "torneo.html?id=t1", enCurso(), ANA, { tabla: TABLA });
  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  ok("el reloj cuenta lo que queda", /^Quedan (29:5\d|30:00)$/.test(await page.textContent("#arena-reloj")), await page.textContent("#arena-reloj"));
  const antes = await page.textContent("#arena-reloj");
  await page.waitForTimeout(2100);
  ok("y baja solo", (await page.textContent("#arena-reloj")) !== antes, [antes, await page.textContent("#arena-reloj")]);
  ok("no se ven las rondas ni la tabla de los otros formatos", !(await seVe(page, "#rounds-section")) && !(await seVe(page, "#standings-section")) && !(await seVe(page, "#generate-round-btn")));
  ok("la clasificación se pidió a la base", (await rpcs(page, "arena_clasificacion")).some((l) => l.args.p_torneo === "t1"));

  const filas = await page.evaluate(() => [...document.querySelectorAll("#arena-tabla li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  ok("cuatro filas, en el orden que dio la base", filas.length === 4 && filas[0].includes("1. Ana Rojas") && filas[1].includes("2. ") && filas[2].includes("3. Bruno Mena") && filas[3].includes("4. Diego Paz"), filas);
  ok("los puntos y las partidas van escritos", filas[0].includes("8 puntos") && filas[0].includes("3 partidas") && filas[2].includes("1 punto") && !filas[2].includes("1 puntos") && filas[3].includes("0 puntos"), filas);
  ok("la racha se dice con palabras, y solo a quien la tiene", filas[0].includes("en racha") && !filas[1].includes("en racha"), filas);
  ok("la llama es adorno: va en aria-hidden", await page.evaluate(() => { const r = document.querySelector("#arena-tabla [data-racha] span"); return !!r && r.getAttribute("aria-hidden") === "true"; }));
  ok("un nombre con HTML se pinta como texto", (await page.evaluate(() => document.querySelectorAll("#arena-section b").length)) === 0 && filas[1].includes("<b>Carla</b> Soto"), filas[1]);

  const vivo = await page.evaluate(() => {
    const t = document.querySelector('#arena-en-vivo [data-tablero-sala="s3"]');
    if (!t) return null;
    const tarjeta = t.closest("a");
    return { casillas: t.children.length, href: tarjeta.getAttribute("href"), rotulo: tarjeta.querySelector("p").textContent, aria: tarjeta.getAttribute("aria-label"), alfil: t.innerHTML.length };
  });
  ok("la partida en juego se dibuja, con su tablero", !!vivo && vivo.casillas >= 64, vivo);
  ok("dice «Partida 3», no «Tablero 3», y lleva a la partida", !!vivo && /^Partida 3 · /.test(vivo.rotulo) && vivo.href === "estandar.html?room=s3" && /la partida 3:/.test(vivo.aria), vivo);

  const ultimas = await page.evaluate(() => [...document.querySelectorAll("#arena-ultimas li")].map((li) => li.textContent));
  ok("las últimas partidas, la más reciente primero", ultimas.length === 2 && /Bruno Mena \(blancas\) vs <b>Carla<\/b> Soto \(negras\): tablas/.test(ultimas[0]) && /Ana Rojas ganó/.test(ultimas[1]), ultimas);
  ok("unas tablas rápidas dicen que no dan puntos", /antes de la jugada 10: no dan puntos/.test(ultimas[0]) && !/no dan puntos/.test(ultimas[1]), ultimas);
  ok("a la alumna no se le ofrece terminar la arena", !(await seVe(page, "#arena-terminar")));
  ok("ni inscribirse (ya está) ni «volver a mi partida» (no tiene)", !(await seVe(page, "#arena-inscribirme")) && !(await seVe(page, "#arena-mi-partida")));

  ok("antes de entrar no se le pregunta nada a la base", (await rpcs(page, "arena_buscar")).length === 0);
  ok("el botón dice «Entrar a jugar»", (await page.textContent("#arena-entrar")).trim() === "Entrar a jugar");
  await page.click("#arena-entrar");
  await page.waitForTimeout(500);
  const buscar = await rpcs(page, "arena_buscar");
  ok("«Entrar a jugar» llama a arena_buscar con el torneo y la posición de salida", buscar.length >= 1 && buscar[0].args.p_torneo === "t1" && /^rnbqkbnr\/pppppppp/.test(buscar[0].args.p_fen || ""), buscar[0]);
  ok("dice que está buscando, en una región viva", /^Buscando rival…/.test(await page.textContent("#arena-estado")) && (await page.getAttribute("#arena-estado", "role")) === "status", await page.textContent("#arena-estado"));
  ok("el botón pasa a «Dejar de buscar» y dice que está apretado", (await page.textContent("#arena-entrar")).trim() === "Dejar de buscar" && (await page.getAttribute("#arena-entrar", "aria-pressed")) === "true");
  await page.waitForTimeout(3300);
  ok("y sigue preguntando cada pocos segundos", (await rpcs(page, "arena_buscar")).length >= 2, (await rpcs(page, "arena_buscar")).length);
  await page.click("#arena-entrar");
  await page.waitForTimeout(300);
  const tras = (await rpcs(page, "arena_buscar")).length;
  ok("«Dejar de buscar» llama a arena_salir", (await rpcs(page, "arena_salir")).length === 1, await rpcs(page, "arena_salir"));
  await page.waitForTimeout(3300);
  ok("y deja de preguntar", (await rpcs(page, "arena_buscar")).length === tras && (await page.textContent("#arena-entrar")).trim() === "Entrar a jugar");
  await ctx.close();

  console.log("\n▶ La base la sienta: a la partida");
  const b = await abrir(browser, "torneo.html?id=t1", enCurso(), ANA, { tabla: TABLA, buscar: [{ estado: "esperando", esperan: 2 }, { estado: "emparejado", sala: "s9", modalidad: "estandar" }] });
  await b.page.click("#arena-entrar");
  await b.page.waitForTimeout(400);
  ok("mientras espera dice cuántos más hay", /Hay 2 personas más esperando/.test(await b.page.textContent("#arena-estado")), await b.page.textContent("#arena-estado"));
  await b.page.waitForURL(/estandar\.html\?room=s9/, { timeout: 8000 }).catch(() => {});
  ok("con «emparejado», va sola a su partida", /estandar\.html\?room=s9$/.test(b.page.url()), b.page.url());
  await b.ctx.close();

  // Una variante de variante.html: la página correcta, y su posición viaja.
  const v = await abrir(browser, "torneo.html?id=t1", datos({ status: "in_progress", arena_termina: EN_30(), variant: "camaleon" }), ANA,
    { tabla: TABLA, buscar: [{ estado: "emparejado", sala: "s7", modalidad: "camaleon" }] });
  await v.page.click("#arena-entrar");
  await v.page.waitForURL(/variante\.html\?room=s7/, { timeout: 8000 }).catch(() => {});
  ok("en otra modalidad, a la página de esa modalidad", /variante\.html\?room=s7$/.test(v.page.url()), v.page.url());
  await v.ctx.close();
}

/* ---------- 7. Entrar con la arena empezada ---------- */

async function pruebaEntrarTarde(browser) {
  console.log("\n▶ Quien no está inscrita, con la arena ya empezada");
  const { ctx, page } = await abrir(browser, "torneo.html?id=t1", enCurso(), ELENA, { tabla: TABLA });
  ok("se le ofrece inscribirse, no «Entrar a jugar»", (await seVe(page, "#arena-inscribirme")) && !(await seVe(page, "#arena-entrar")));
  ok("y se le dice que todavía puede", /todavía puedes entrar/.test(await page.textContent("#arena-estado")), await page.textContent("#arena-estado"));
  await page.click("#arena-inscribirme");
  await page.waitForTimeout(1200);
  const ins = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "tournament_registrations" && e.op === "insert").map((e) => e.fila));
  ok("se inscribe a sí misma en este torneo", ins.length === 1 && ins[0].tournament_id === "t1" && ins[0].player_id === "u-elena", ins);
  ok("y ya puede entrar a jugar", (await seVe(page, "#arena-entrar")) && !(await seVe(page, "#arena-inscribirme")));
  await ctx.close();

  const lista = await abrir(browser, "torneos.html", enCurso(), ELENA, { tabla: TABLA });
  const boton = await lista.page.evaluate(() => [...document.querySelectorAll("#tournament-list button")].map((b) => b.textContent.trim()));
  ok("en la lista de torneos, una arena en curso ofrece «Inscribirme»", boton.length === 1 && boton[0] === "Inscribirme", boton);
  ok("y dice «Arena de 30 minutos»", /Arena de 30 minutos/.test(await lista.page.textContent("#tournament-list")));
  await lista.ctx.close();
  const ya = await abrir(browser, "torneos.html", enCurso(), ANA, { tabla: TABLA });
  ok("a quien ya está inscrita no le ofrece retirarse a media arena", (await ya.page.evaluate(() => document.querySelectorAll("#tournament-list button").length)) === 0);
  await ya.ctx.close();
}

/* ---------- 8. Con una partida propia en juego ---------- */

async function pruebaMiPartida(browser) {
  console.log("\n▶ Con una partida propia en juego");
  const { ctx, page } = await abrir(browser, "torneo.html?id=t1", enCurso(), CARLA, { tabla: TABLA });
  ok("se queda en la arena (nadie pidió rival)", /torneo\.html\?id=t1$/.test(page.url()), page.url());
  ok("se le ofrece volver a su partida, no buscar otra", (await seVe(page, "#arena-mi-partida")) && !(await seVe(page, "#arena-entrar")) && (await page.getAttribute("#arena-mi-partida", "href")) === "estandar.html?room=s3");
  ok("y no se llamó a arena_buscar", (await rpcs(page, "arena_buscar")).length === 0);
  await ctx.close();

  const v = await abrir(browser, "torneo.html?id=t1&jugar=1", enCurso(), CARLA, { tabla: TABLA });
  await v.page.waitForURL(/estandar\.html\?room=s3/, { timeout: 8000 }).catch(() => {});
  ok("con ?jugar=1 va sola a la partida que tiene", /estandar\.html\?room=s3$/.test(v.page.url()), v.page.url());
  await v.ctx.close();

  const libre = await abrir(browser, "torneo.html?id=t1&jugar=1", enCurso(), ANA, { tabla: TABLA });
  await libre.page.waitForTimeout(500);
  ok("con ?jugar=1 y sin partida, entra a la cola sola", (await rpcs(libre.page, "arena_buscar")).length >= 1 && /^Buscando rival…/.test(await libre.page.textContent("#arena-estado")));
  await libre.ctx.close();

  const fuera = await abrir(browser, "torneo.html?id=t1&jugar=1", enCurso(), ELENA, { tabla: TABLA });
  await fuera.page.waitForTimeout(500);
  ok("con ?jugar=1, quien no está inscrita no entra a ninguna cola", (await rpcs(fuera.page, "arena_buscar")).length === 0);
  await fuera.ctx.close();
}

/* ---------- 9 a 11. El final ---------- */

async function pruebaFinal(browser) {
  console.log("\n▶ Se acabó el tiempo");
  const { ctx, page, errores } = await abrir(browser, "torneo.html?id=t1", datos({ status: "in_progress", arena_termina: HACE(1) }), ANA, { tabla: TABLA });
  await page.waitForTimeout(1500);
  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  ok("dice que se acabó el tiempo", (await page.textContent("#arena-reloj")) === "Se acabó el tiempo", await page.textContent("#arena-reloj"));
  ok("ya no se ofrece jugar", !(await seVe(page, "#arena-entrar")) && !(await seVe(page, "#arena-jugar")));
  const cerrar = await rpcs(page, "arena_cerrar");
  ok("se le pide a la base que cierre, sin forzar", cerrar.length >= 1 && cerrar[0].args.p_torneo === "t1" && cerrar[0].args.p_ahora === false, cerrar);
  ok("la página no cierra el torneo por su cuenta", (await page.evaluate(DEL_TORNEO)).length === 0);
  await ctx.close();

  const mira = await abrir(browser, "torneo.html?id=t1", datos({ status: "in_progress", arena_termina: HACE(1) }), ELENA, { tabla: TABLA });
  await mira.page.waitForTimeout(1500);
  ok("quien solo mira no pide el cierre (la base se lo negaría)", (await rpcs(mira.page, "arena_cerrar")).length === 0);
  await mira.ctx.close();

  const c = await abrir(browser, "torneo.html?id=t1", datos({ status: "in_progress", arena_termina: HACE(1) }), ANA, { tabla: TABLA, cierra: true, ganadores: [ANA.id] });
  await c.page.waitForTimeout(2500);
  ok("cuando la base cierra, se pinta terminada con su campeona", (await seVe(c.page, "#finished-banner")) && /Ana Rojas/.test(await c.page.textContent("#champion-names")) && (await c.page.textContent("#arena-reloj")) === "La arena terminó",
    [await c.page.textContent("#champion-names"), await c.page.textContent("#arena-reloj")]);
  await c.ctx.close();

  console.log("\n▶ Quien organiza la termina antes");
  const p = await abrir(browser, "torneo.html?id=t1", enCurso(), PROFE, { tabla: TABLA, cierra: true, ganadores: [ANA.id] });
  await p.page.click("#arena-terminar");
  await p.page.waitForTimeout(500);
  ok("antes pregunta, sin llamar a nada", (await rpcs(p.page, "arena_cerrar")).length === 0);
  const dialogo = await p.page.evaluate(() => {
    const d = document.querySelector("dialog[open], [role=dialog], [role=alertdialog]");
    return d ? { texto: d.textContent, botones: [...d.querySelectorAll("button")].map((b) => b.textContent.trim()) } : null;
  });
  ok("la pregunta es de la página y el botón dice lo que hace", !!dialogo && /Terminar la arena ahora/.test(dialogo.texto) && dialogo.botones.includes("Terminar la arena"), dialogo);
  await p.page.evaluate(() => { [...document.querySelectorAll("dialog[open] button, [role=dialog] button, [role=alertdialog] button")].find((b) => b.textContent.trim() === "Terminar la arena").click(); });
  await p.page.waitForTimeout(1500);
  const forzado = await rpcs(p.page, "arena_cerrar");
  ok("al confirmar, arena_cerrar con p_ahora", forzado.length === 1 && forzado[0].args.p_ahora === true && forzado[0].args.p_torneo === "t1", forzado);
  ok("y queda terminada", (await seVe(p.page, "#finished-banner")) && !(await seVe(p.page, "#arena-terminar")));
  await p.ctx.close();

  console.log("\n▶ Una arena terminada");
  const base = enCurso();
  base.tournaments[0].status = "finished"; base.tournaments[0].arena_termina = HACE(5); base.tournaments[0].winner_ids = [ANA.id];
  base.tournament_pairings[2].result = "black"; base.tournament_pairings[2].finished_at = HACE(1); base.tournament_pairings[2].jugadas = 50;
  base.game_rooms = [];
  const t = await abrir(browser, "torneo.html?id=t1&jugar=1", base, ANA, { tabla: TABLA });
  ok("no hay nada que jugar, ni con ?jugar=1", !(await seVe(t.page, "#arena-jugar")) && (await rpcs(t.page, "arena_buscar")).length === 0 && (await rpcs(t.page, "arena_cerrar")).length === 0);
  ok("se ve la clasificación final y la campeona", (await t.page.evaluate(() => document.querySelectorAll("#arena-tabla li").length)) === 4 && /Ana Rojas/.test(await t.page.textContent("#champion-names")));
  const ult = await t.page.evaluate(() => [...document.querySelectorAll("#arena-ultimas li")].map((li) => li.textContent));
  ok("la partida que terminó después de la hora dice que no suma", /Diego Paz ganó · terminó después de la hora: no suma/.test(ult[0]), ult);
  ok("ya no se ofrece cambiar el tiempo", !(await seVe(t.page, "#ritmo-seccion")));
  await t.ctx.close();
}

/* ---------- 12. js/torneo-sync.js ---------- */

async function pruebaSync(browser) {
  console.log("\n▶ js/torneo-sync.js con una arena");
  const base = enCurso();
  base.tournament_pairings[2].result = null;
  base.game_rooms[0].status = "finished"; base.game_rooms[0].result = "white";
  const { ctx, page } = await abrir(browser, "torneo.html?id=t1", base, CARLA, { tabla: TABLA });
  await page.evaluate(async () => {
    window.__escrituras.length = 0;
    await TorneoSync.onRoomUpdate(sb, window.__T.game_rooms[0]);
    await new Promise((r) => setTimeout(r, 400));
  });
  let escritas = await page.evaluate(DEL_TORNEO);
  ok("no le escribe el resultado al cruce (lo anota la base, con su hora)", escritas.length === 0, escritas);
  const vuelta = await page.evaluate(() => { const c = document.getElementById("vuelta-al-torneo"); return c ? { href: c.querySelector("a").getAttribute("href"), texto: c.querySelector("a").textContent, rol: c.getAttribute("role"), cerrar: c.querySelector("button").getAttribute("aria-label") } : null; });
  ok("a quien jugó, con la arena en curso: «Jugar otra partida» y vuelve entrando a la cola", !!vuelta && vuelta.href === "torneo.html?id=t1&jugar=1" && /Jugar otra partida/.test(vuelta.texto) && vuelta.rol === "status", vuelta);
  ok("el aviso se puede cerrar, y el botón dice qué hace", !!vuelta && vuelta.cerrar === "Cerrar este aviso");
  await page.evaluate(async () => { await TorneoSync.onRoomUpdate(sb, window.__T.game_rooms[0]); await new Promise((r) => setTimeout(r, 300)); });
  ok("se ofrece una sola vez", (await page.evaluate(() => document.querySelectorAll("#vuelta-al-torneo").length)) === 1);

  // Con todos los cruces resueltos, la «ronda» de la arena no se cierra sola.
  await page.evaluate(async () => {
    window.__T.tournament_pairings.forEach((p) => { if (!p.result) p.result = "white"; });
    window.__escrituras.length = 0;
    await TorneoSync.maybeFinishRound(sb, "rd1");
  });
  escritas = await page.evaluate(DEL_TORNEO);
  const estado = await page.evaluate(() => ({ torneo: window.__T.tournaments[0].status, ronda: window.__T.tournament_rounds[0].status, campeones: window.__T.public_tournament_champions.length }));
  ok("con todos los cruces resueltos NO cierra la ronda ni el torneo ni nombra campeón", escritas.length === 0 && estado.torneo === "in_progress" && estado.ronda === "pending" && estado.campeones === 0, { escritas, estado });
  await ctx.close();

  // Quien miraba (no jugó): solo «volver al torneo».
  const m = await abrir(browser, "torneo.html?id=t1", base, ANA, { tabla: TABLA });
  await m.page.evaluate(async () => { await TorneoSync.ofrecerVuelta(sb, window.__T.game_rooms[0]); });
  const mira = await m.page.evaluate(() => { const c = document.getElementById("vuelta-al-torneo"); return c ? c.querySelector("a").getAttribute("href") + "|" + c.querySelector("a").textContent : null; });
  ok("a quien solo miraba: «Volver al torneo», sin entrar a la cola", mira === "torneo.html?id=t1|Volver al torneo →", mira);
  await m.ctx.close();

  // Un suizo: también hay vuelta, y el resultado lo sigue escribiendo la página.
  const suizo = enCurso();
  suizo.tournaments[0].format = "swiss"; suizo.tournaments[0].arena_minutos = null; suizo.tournaments[0].arena_termina = null; suizo.tournaments[0].total_rounds = 3;
  suizo.game_rooms[0].status = "finished"; suizo.game_rooms[0].result = "white";
  const s = await abrir(browser, "torneo.html?id=t1", suizo, CARLA);
  await s.page.evaluate(async () => {
    window.__escrituras.length = 0;
    await TorneoSync.onRoomUpdate(sb, window.__T.game_rooms[0]);
    await new Promise((r) => setTimeout(r, 400));
  });
  const enSuizo = await s.page.evaluate(() => ({
    cruce: window.__T.tournament_pairings.find((p) => p.id === "c3").result,
    vuelta: (document.querySelector("#vuelta-al-torneo a") || {}).textContent || null,
    href: document.querySelector("#vuelta-al-torneo a") ? document.querySelector("#vuelta-al-torneo a").getAttribute("href") : null,
  }));
  ok("en un Suizo el resultado lo sigue escribiendo la página", enSuizo.cruce === "white", enSuizo);
  ok("y la vuelta es «Volver al torneo»", enSuizo.vuelta === "Volver al torneo →" && enSuizo.href === "torneo.html?id=t1", enSuizo);
  ok("un Suizo no muestra la sección de la arena", !(await seVe(s.page, "#arena-section")) && (await seVe(s.page, "#rounds-section")));
  await s.ctx.close();
}

(async () => {
  await pruebaModulo();
  await pruebaCola();
  pruebaMigracion();

  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaCrear(browser);
    await pruebaEmpezar(browser);
    await pruebaEnCurso(browser);
    await pruebaEntrarTarde(browser);
    await pruebaMiPartida(browser);
    await pruebaFinal(browser);
    await pruebaSync(browser);
  } finally {
    await browser.close();
  }

  console.log(fallos ? "\n❌ " + fallos + " comprobación(es) fallaron." : "\n✅ Todo en orden.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
