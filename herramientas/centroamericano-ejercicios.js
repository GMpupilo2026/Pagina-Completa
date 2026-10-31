#!/usr/bin/env node
/* «Ejercicios de la ronda» del Centroamericano 2026: los busca y los deja en
 * data/centroamericano-ejercicios.json, que lee la página
 * (js/centroamericano-ejercicios.js). Lo corre solo, cada media hora del 1 al
 * 9 de noviembre, .github/workflows/centroamericano-ejercicios.yml, que abre
 * el PR, corre «Verificar» y lo mergea: el dueño pidió que se publiquen solos.
 * Ver «Los ejercicios de la ronda» en docs/decisiones/juegos-y-torneos.md.
 *
 *   node --experimental-strip-types herramientas/centroamericano-ejercicios.js
 *        [--ronda N] [--enlace <transmisión de Lichess>] [--profundidad 18]
 *        [--cuantos 10] [--resumen archivo.md]
 *
 * 1. Qué se transmite lo dice la sala (salas_torneo.enlaces, la que edita
 *    administración), igual que en la página; --enlace lo cambia para probar.
 *    La categoría y la modalidad de cada torneo de Lichess salen de
 *    supabase/functions/sala-jugadores/torneos-sala.ts, la misma regla de la
 *    página (verificar-centroamericano-partidas.js comprueba que coinciden).
 * 2. Una ronda está lista cuando terminó en todos los torneos de partidas
 *    clásicas que la tienen y Lichess ya evaluó el 80 % de sus jugadas (o
 *    empezó hace más de 8 horas). Las que ya están en el archivo no se vuelven
 *    a buscar, salvo con --ronda.
 * 3. De las partidas de la ronda, js/ejercicios-partidas.js elige las
 *    posiciones donde el rival acaba de equivocarse y Stockfish (el de la
 *    máquina) confirma que hay UNA sola jugada que gana. Se quedan las 10
 *    mejores, repartidas entre las categorías.
 * 4. Nada de quién jugó: ni el nombre, ni la mesa, ni el enlace a la partida.
 *    Solo la categoría y, si en la partida se jugó la jugada buena, el
 *    apellido de quien la encontró.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const { Chess } = require(path.join(RAIZ, "node_modules/chess.js"));
const L = require(path.join(RAIZ, "js/lichess-transmision.js"));
const E = require(path.join(RAIZ, "js/ejercicios-partidas.js"));
const ARCHIVO = path.join(RAIZ, "data/centroamericano-ejercicios.json");
const SALA = "centroamericano-2026";   // la clave de la sala en salas_torneo (la de la página)
const HORAS_RONDA = 8;
const CANDIDATAS_MAX = 160;

function arg(nombre, defecto) {
  const i = process.argv.indexOf("--" + nombre);
  return i === -1 ? defecto : process.argv[i + 1];
}

// La dirección y la clave pública de la base, de js/supabase-client.js (la
// clave «anon» es pública por diseño: lo que se lee lo decide la RLS).
function base() {
  const t = fs.readFileSync(path.join(RAIZ, "js/supabase-client.js"), "utf8");
  const url = (t.match(/SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
  const clave = (t.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/) || [])[1];
  if (!url || !clave) throw new Error("No encontré la dirección de la base en js/supabase-client.js");
  return { url, clave };
}

async function enlacesDeLaSala() {
  const b = base();
  const res = await fetch(b.url + "/rest/v1/salas_torneo?select=enlaces&clave=eq." + SALA, { headers: { apikey: b.clave, Authorization: "Bearer " + b.clave } });
  if (!res.ok) throw new Error("La base respondió " + res.status + " al leer la sala");
  const filas = await res.json();
  const enlaces = filas[0] && Array.isArray(filas[0].enlaces) ? filas[0].enlaces : [];
  return enlaces.map((e) => ({ texto: String((e && e.texto) || ""), lichess: L.idDeEnlace(e && e.url) })).filter((e) => e.lichess);
}

// Stockfish de la máquina: analizar(fen, multipv) → [{ cp, mate, pv }], desde quien mueve.
function motor(profundidad) {
  const ruta = process.env.STOCKFISH || ["/usr/games/stockfish", "/usr/bin/stockfish", "/usr/local/bin/stockfish"].find((r) => fs.existsSync(r)) || "stockfish";
  const sf = spawn(ruta);
  sf.on("error", (e) => { console.error("No pude abrir Stockfish (" + ruta + "): " + e.message); process.exit(1); });
  let buf = "", espera = null;
  sf.stdout.on("data", (d) => { buf += d; if (espera && /bestmove/.test(buf)) { const t = buf; buf = ""; const e = espera; espera = null; e(t); } });
  sf.stdin.write("uci\nsetoption name Threads value 2\nsetoption name Hash value 128\n");
  let cola = Promise.resolve();
  function analizar(fen, mpv) {
    const p = cola.then(() => new Promise((ok) => {
      buf = ""; espera = ok;
      sf.stdin.write("setoption name MultiPV value " + mpv + "\nposition fen " + fen + "\ngo depth " + profundidad + "\n");
    })).then((t) => {
      const res = [];
      t.split("\n").forEach((l) => {
        const m = l.match(/ depth (\d+) .*multipv (\d+) score (cp|mate) (-?\d+).* pv (.+)$/);
        if (m && +m[1] === profundidad) res[+m[2] - 1] = { cp: m[3] === "cp" ? +m[4] : null, mate: m[3] === "mate" ? +m[4] : null, pv: m[5].trim().split(/\s+/) };
      });
      return res.filter(Boolean);
    });
    cola = p.catch(() => {});
    return p;
  }
  analizar.cerrar = () => sf.kill();
  return analizar;
}

function leerArchivo() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO, "utf8")); } catch (e) { return { sala: SALA, rondas: {} }; }
}

async function main() {
  const { codigoCategoria, modalidadDe } = await import(path.join(RAIZ, "supabase/functions/sala-jugadores/torneos-sala.ts"));
  const profundidad = Number(arg("profundidad", 18));
  const cuantos = Number(arg("cuantos", 10));
  const soloRonda = Number(arg("ronda", 0)) || 0;
  const resumen = [];
  const datos = leerArchivo();
  datos.rondas = datos.rondas || {};

  const enlaces = arg("enlace") ? [{ texto: "", lichess: L.idDeEnlace(arg("enlace")) }].filter((e) => e.lichess) : await enlacesDeLaSala();
  if (!enlaces.length) { console.log("La sala todavía no tiene una transmisión de Lichess: nada que buscar."); return; }

  // Los torneos de partidas clásicas, cada uno con su categoría.
  const torneos = new Map();
  for (const e of enlaces) {
    const ev = await L.torneosDelEvento(e.lichess);
    ev.torneos.forEach((t) => {
      const solo = ev.torneos.length === 1;
      const modalidad = modalidadDe(t.nombre + " " + (solo ? e.texto : ""));
      if (modalidad !== "clasico" || torneos.has(t.id)) return;
      torneos.set(t.id, { id: t.id, nombre: t.nombre, categoria: codigoCategoria(t.nombre) || (solo ? codigoCategoria(e.texto) : "") });
    });
  }
  for (const t of torneos.values()) t.rondas = (await L.rondas(t.id)).rondas;

  // Las rondas listas: terminadas en todos los torneos que las tienen.
  const ahora = Date.now();
  const numeros = new Set();
  torneos.forEach((t) => t.rondas.forEach((r) => numeros.add(r.numero)));
  const listas = [...numeros].sort((a, b) => a - b).filter((n) => {
    if (soloRonda) return n === soloRonda;
    if (datos.rondas[n]) return false;
    const deN = [...torneos.values()].map((t) => t.rondas.find((r) => r.numero === n)).filter(Boolean);
    return deN.length && deN.every((r) => r.terminada || (r.empieza && ahora - r.empieza > HORAS_RONDA * 3600000));
  });
  if (!listas.length) { console.log("Ninguna ronda nueva terminada."); return; }

  const analizar = motor(profundidad);
  try {
    for (const n of listas) {
      const juegos = [];
      for (const t of torneos.values()) {
        const r = t.rondas.find((x) => x.numero === n);
        if (!r) continue;
        L.leerPgn(await L.pgn(r.id), Chess).forEach((g) => { g.categoria = t.categoria; juegos.push(g); });
      }
      // La evaluación de Lichess llega un rato después de cada partida: sin
      // ella casi no hay de dónde elegir. Mientras falte en muchas jugadas,
      // se espera a la vuelta siguiente (hasta las 8 horas).
      const plies = juegos.reduce((a, g) => a + g.jugadas.length, 0);
      const conEval = juegos.reduce((a, g) => a + g.jugadas.filter((j) => j.eval != null).length, 0);
      const empezo = Math.min(...[...torneos.values()].map((t) => (t.rondas.find((x) => x.numero === n) || {}).empieza || ahora));
      if (!soloRonda && (!plies || conEval / plies < 0.8) && ahora - empezo < HORAS_RONDA * 3600000) {
        console.log("Ronda " + n + ": Lichess todavía no evaluó sus partidas (" + Math.round(100 * conEval / (plies || 1)) + " %); se espera.");
        continue;
      }
      const cands = E.candidatas(juegos).slice(0, CANDIDATAS_MAX);
      const ok = [];
      for (const c of cands) {
        const e = await E.verificar(c, analizar, { Chess });
        if (e) ok.push(e);
      }
      const elegidos = E.elegir(ok, cuantos).map((e) => {
        const x = { categoria: e.categoria, fen: e.fen, solucion: e.solucion, despues: e.despues, tema: e.tema.tipo };
        if (e.tema.tipo === "mate") x.mate = e.tema.n;
        if (e.logro) x.logro = e.logro;
        return x;
      });
      datos.rondas[n] = elegidos;
      const linea = "Ronda " + n + ": " + juegos.length + " partidas, " + cands.length + " posiciones revisadas, " + ok.length + " con una sola jugada que gana; se publican " + elegidos.length + ".";
      console.log(linea);
      resumen.push("- " + linea);
    }
  } finally {
    analizar.cerrar();
  }

  // El archivo, siempre igual de ordenado: una ronda y un ejercicio por línea.
  const rondas = Object.keys(datos.rondas).map(Number).sort((a, b) => a - b);
  const texto = "{\n  \"sala\": \"" + SALA + "\",\n  \"rondas\": {" + rondas.map((n) =>
    "\n    \"" + n + "\": [" + datos.rondas[n].map((e) => "\n      " + JSON.stringify(e)).join(",") + (datos.rondas[n].length ? "\n    " : "") + "]").join(",") + (rondas.length ? "\n  " : "") + "}\n}\n";
  fs.writeFileSync(ARCHIVO, texto);
  const r = arg("resumen");
  if (r) fs.appendFileSync(r, "Ejercicios de la ronda del Centroamericano 2026, buscados en las partidas de Lichess y confirmados con Stockfish (profundidad " + profundidad + ").\n\n" + resumen.join("\n") + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
