#!/usr/bin/env node
/**
 * Verifica que la cuenta regresiva de las preguntas de la clase cuente con la
 * hora de la BASE, no con la de la computadora del alumno.
 *
 *   node herramientas/verificar-pregunta-reloj.js
 *
 * No necesita navegador, ni red, ni el sitio servido. `created_at` de una
 * pregunta lo pone la base; si el «ahora» sale de Date.now(), a un alumno
 * cuyo celular anda adelantado más que el plazo le sale «Se acabó el tiempo»
 * desde el primer segundo, en todas las preguntas. No da ningún error. Se mira:
 *
 *   - que PreguntaClase.segundosRestantes() use RelojServidor cuando lo hay,
 *     con un celular adelantado y uno atrasado;
 *   - que sin RelojServidor siga contando con la hora local (como antes);
 *   - que sesion.html cargue js/reloj-servidor.js y sesion.js lo arranque.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function ok(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) fallos++;
}

global.window = global;
require(path.join(RAIZ, "js", "pregunta-clase.js"));

// La base: la pregunta se creó hace 5 segundos (hora del servidor), con 30 s de plazo.
const SERVIDOR = Date.parse("2026-10-02T15:00:05Z");
const pregunta = { tiempo_limite: 30, created_at: "2026-10-02T15:00:00.000000+00:00" };

console.log("La cuenta regresiva con la hora de la base");
function conAparatoCorrido(ms) {
  const desfase = -ms;   // lo que hay que sumarle a la hora del aparato para tener la del servidor
  const realNow = Date.now;
  Date.now = () => SERVIDOR + ms;
  global.RelojServidor = { ahora: () => Date.now() + desfase };
  try { return PreguntaClase.segundosRestantes(pregunta); }
  finally { Date.now = realNow; delete global.RelojServidor; }
}
ok(conAparatoCorrido(0) === 25, "con la hora bien: quedan 25 s");
ok(conAparatoCorrido(10 * 60 * 1000) === 25, "con el celular 10 minutos adelantado: quedan 25 s, no «se acabó»");
ok(conAparatoCorrido(-10 * 60 * 1000) === 25, "con el celular 10 minutos atrasado: quedan 25 s, no 10 min de más");
ok(PreguntaClase.segundosRestantes(pregunta, SERVIDOR + 40000) === 0, "pasado el plazo: 0, nunca negativo");
ok(PreguntaClase.segundosRestantes({ tiempo_limite: null, created_at: pregunta.created_at }) === null, "sin límite: null");

console.log("Sin RelojServidor, cuenta con la hora local");
{
  const realNow = Date.now;
  Date.now = () => SERVIDOR;
  try { ok(PreguntaClase.segundosRestantes(pregunta) === 25, "quedan 25 s con Date.now()"); }
  finally { Date.now = realNow; }
}

console.log("La página de la clase lo carga y lo arranca");
const html = fs.readFileSync(path.join(RAIZ, "sesion.html"), "utf8");
ok(/<script src="js\/reloj-servidor\.js(\?[^"]*)?"><\/script>/.test(html), "sesion.html carga js/reloj-servidor.js");
const sesion = fs.readFileSync(path.join(RAIZ, "js", "sesion.js"), "utf8");
const init = sesion.slice(sesion.indexOf("async function init()"));
ok(/RelojServidor\.iniciar\(sb\)/.test(init.slice(0, 1500)), "sesion.js mide el desfase al empezar init()");

if (fallos) { console.log("\n✗ " + fallos + " comprobación(es) fallaron."); process.exit(1); }
console.log("\n✓ La cuenta regresiva de las preguntas usa la hora de la base.");
