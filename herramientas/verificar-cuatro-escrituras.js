#!/usr/bin/env node
/* Ajedrez para 4: lo que se cruza mientras se guarda.
 *
 * Abre cuatro-jugadores.html con un doble de Supabase dentro de la página
 * (window.sb puesto antes de cargar) y arma a mano los dos cruces que
 * verificar-partidas-simultaneas.js casi nunca acierta por azar:
 *
 *   1. La jugada propia se está guardando y llega una relectura de la sala
 *      (el reloj de 15 s de SalaJuego.suscribir, volver a la pestaña, volver
 *      la red) con la fila de ANTES de la jugada. Se aplicaba (el reloj local
 *      ya había cambiado, así que no era «la misma»), la jugada desaparecía
 *      del tablero, y al quedar guardada nada la traía de vuelta: «Es tu
 *      turno» y el reloj del siguiente corriendo.
 *   2. La rendición choca con la jugada de otro (persist solo escribe sobre
 *      la versión de la sala que se tenía, `updated_at`). Decía «La partida ya
 *      había terminado: la rendición no se registró» con la partida en juego,
 *      y la rendición se perdía. Ahora se vuelve a intentar sobre la sala nueva.
 *
 *   Uso: con el sitio en localhost:8777,  node herramientas/verificar-cuatro-escrituras.js
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FourPlayerChess = (() => {
  const caja = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "fourplayer-engine.js"), "utf8"), caja);
  return caja.window.FourPlayerChess;
})();

const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
let fallos = 0;
function ok(cond, msg, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg + (!cond && detalle !== undefined ? "  →  " + JSON.stringify(detalle) : ""));
  if (!cond) fallos++;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// La sala ya arrancada: los cuatro listos, reloj corriendo. `turno` dice a
// quién le toca; si no es rojo, juegan antes los que hagan falta.
function salaInicial(turno) {
  const game = new FourPlayerChess.Game("ffa");
  const orden = ["red", "blue", "yellow", "green"];
  const moves = [];
  for (const s of orden) {
    if (s === turno) break;
    const m = game.allLegalMoves(s)[0];
    const res = game.applyMove(s, m.from, m.to, "q");
    if (!res.ok) throw new Error("jugada inicial inválida");
  }
  const seats = {};
  orden.forEach((s, i) => { seats[s] = { player_id: "u-" + s, ready: true, score: 0, status: "active", time_left: 300 }; });
  const ahora = new Date().toISOString();
  return {
    id: "sala-4", mode: "ffa", seats, turn: game.turn, board: game.toJSON(), moves: game.moves || moves,
    status: "playing", result: null, initial_seconds: 300, increment_seconds: 2, clock_updated_at: ahora,
    created_by: "u-profe", updated_at: ahora,
  };
}

/* El doble: la sala vive en la página (window.__db.sala). Antes de aplicar un
   update se llama a window.__antesDeGuardar(cambio), que el caso usa para
   demorar la respuesta o para que «otro» juegue primero. */
function doble(usuario, sala) {
  return `
(function () {
  window.__db = { sala: ${JSON.stringify(sala)}, updates: 0 };
  window.__antesDeGuardar = null;
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const cumple = (f, filtros) => filtros.every(([c, v]) => String(f[c]) === String(v));
  function constructor(tabla) {
    const p = { op: "select", filtros: [], unica: false };
    const b = {
      select() { return b; }, eq(c, v) { p.filtros.push([c, v]); return b; },
      neq() { return b; }, in() { return b; }, is() { return b; }, not() { return b; }, or() { return b; },
      gte() { return b; }, lte() { return b; }, gt() { return b; }, lt() { return b; },
      order() { return b; }, limit() { return b; }, range() { return b; },
      update(c) { p.op = "update"; p.cambio = c; return b; },
      insert() { p.op = "insert"; return b; }, upsert() { p.op = "insert"; return b; }, delete() { p.op = "delete"; return b; },
      maybeSingle() { p.unica = true; return b; }, single() { p.unica = true; return b; },
      then(res, rej) { return resolver(tabla, p).then(res, rej); },
    };
    return b;
  }
  async function resolver(tabla, p) {
    await new Promise((r) => setTimeout(r, 10));
    if (tabla === "profiles") {
      const fila = { id: ${JSON.stringify(usuario)}, full_name: "Rojo", role: "alumno", is_admin: false };
      return { data: p.unica ? fila : [fila], error: null };
    }
    if (tabla !== "fourplayer_games") return { data: p.unica ? null : [], error: null };
    if (p.op === "select") {
      const filas = cumple(window.__db.sala, p.filtros) ? [copia(window.__db.sala)] : [];
      return { data: p.unica ? (filas[0] || null) : filas, error: null };
    }
    if (p.op === "update") {
      window.__db.updates++;
      if (window.__antesDeGuardar) await window.__antesDeGuardar(p.cambio);
      if (!cumple(window.__db.sala, p.filtros)) return { data: [], error: null };
      const nueva = Object.assign({}, window.__db.sala, copia(p.cambio));
      nueva.updated_at = new Date(Date.parse(window.__db.sala.updated_at) + 1000).toISOString();
      if (p.cambio.clock_updated_at) nueva.clock_updated_at = new Date().toISOString();
      window.__db.sala = nueva;
      return { data: [copia(nueva)], error: null };
    }
    return { data: null, error: null };
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuario)} }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: ${JSON.stringify(usuario)} } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t),
    rpc: (nombre) => {
      const pr = Promise.resolve(nombre === "hora_servidor_ms" ? { data: Date.now(), error: null }
        : nombre === "nombres_de_jugadores" ? { data: [], error: null } : { data: null, error: null });
      return { then: (a, b) => pr.then(a, b), maybeSingle: () => pr, single: () => pr };
    },
    channel: () => {
      const api = { on() { return api; }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 20); return api; },
        unsubscribe() { return Promise.resolve(); }, track() { return Promise.resolve(); }, presenceState() { return {}; }, send() { return Promise.resolve(); } };
      return api;
    },
    removeChannel: () => Promise.resolve(),
    getChannels: () => [],
  };
})();
`;
}

async function abrir(browser, sala) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1000, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("oscarMoveHelpShown_v1", "1"); } catch (e) {} });
  await ctx.addInitScript(doble("u-red", sala));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/cuatro-jugadores.html?room=sala-4", { waitUntil: "load" });
  await page.waitForFunction(() => { try { return !!(board && room && game && mySeat); } catch (e) { return false; } }, null, { timeout: 15000 });
  return { ctx, page, errores };
}

(async () => {
  const browser = await chromium.launch();

  console.log("\n▶ La jugada propia se guarda mientras llega una relectura vieja");
  {
    const { ctx, page, errores } = await abrir(browser, salaInicial("red"));
    await page.evaluate(() => {
      // El guardado tarda; mientras tanto, la página vuelve a leer la sala
      // (lo mismo que hace el reloj de 15 s o volver a la pestaña) y la base
      // todavía tiene la de antes de la jugada.
      window.__antesDeGuardar = async () => {
        window.__antesDeGuardar = null;
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((r) => setTimeout(r, 400));
      };
      const m = board.game.allLegalMoves("red")[0];
      board._applyMove(m.from, m.to, "q");
    });
    await page.waitForFunction(() => window.__db.updates >= 1 && window.__antesDeGuardar === null, null, { timeout: 5000 });
    await esperar(900);
    const r = await page.evaluate(() => ({
      enBase: window.__db.sala.moves.length, turnoBase: window.__db.sala.turn,
      tablero: board.game.moves.length, juego: game.moves.length, sala: room.moves.length, turnoVisto: game.turn,
    }));
    ok(r.enBase === 1 && r.turnoBase === "blue", "la jugada quedó guardada", r);
    ok(r.tablero === 1 && r.juego === 1 && r.sala === 1, "y se sigue viendo en el tablero (no la borró la relectura vieja)", r);
    ok(r.turnoVisto === "blue", "el turno que se ve es el del siguiente", r);
    ok(!errores.length, "sin errores en la página", errores);
    await ctx.close();
  }

  console.log("\n▶ La rendición choca con la jugada de otro");
  {
    const { ctx, page, errores } = await abrir(browser, salaInicial("blue"));
    await page.evaluate(() => {
      // Justo antes de que llegue la rendición, azul juega: la sala cambia y
      // la rendición (que exige la versión que se tenía) no encuentra la fila.
      window.__antesDeGuardar = async () => {
        window.__antesDeGuardar = null;
        const s = window.__db.sala;
        const g = FourPlayerChess.Game.fromJSON(s.board);
        const m = g.allLegalMoves("blue")[0];
        g.applyMove("blue", m.from, m.to, "q");
        window.__db.sala = Object.assign({}, s, { board: g.toJSON(), turn: g.turn, moves: g.moves,
          clock_updated_at: new Date().toISOString(), updated_at: new Date(Date.parse(s.updated_at) + 500).toISOString() });
      };
    });
    await page.click("#resign-btn");
    await page.click("[data-avisos-aceptar]");
    await page.waitForFunction(() => window.__db.updates >= 2, null, { timeout: 5000 }).catch(() => {});
    await esperar(600);
    const r = await page.evaluate(() => ({
      rojo: window.__db.sala.seats.red.status, jugadasBase: window.__db.sala.moves.length,
      aviso: document.getElementById("status-banner").textContent, intentos: window.__db.updates,
      visto: game.status.red,
    }));
    ok(r.rojo && r.rojo !== "active", "la rendición quedó guardada al volver a intentarla", r);
    ok(r.jugadasBase === 2, "sin borrar la jugada de azul que se cruzó", r);
    ok(!/ya había terminado/.test(r.aviso), "no dice que la partida había terminado (sigue en juego)", r.aviso);
    ok(r.visto !== "active", "el tablero muestra a rojo rendido", r);
    ok(!errores.length, "sin errores en la página", errores);
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo en orden");
  process.exit(fallos ? 1 : 0);
})();
