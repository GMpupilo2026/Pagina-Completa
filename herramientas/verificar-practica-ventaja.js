#!/usr/bin/env node
/*
 * Practicar contra el motor: perder una ventaja de más de 3 resta 350 puntos
 * de la clase, una vez por ejercicio.
 *
 * La cuenta de quién la perdió la hace la base (ventajas_perdidas, comprobada
 * impersonando a una alumna: ver «Practicar: perder una ventaja de más de 3
 * resta 350 puntos» en docs/decisiones/clase-en-vivo.md). Esto revisa, sin
 * navegador, lo que pone la página encima:
 *   - la regla de js/puntos-clase.js resta 350 por cada una y lo dice con su
 *     signo («−350», «resta 350»), y quien queda en negativo sigue en el podio;
 *   - las dos puertas de los puntos (la clase y el mes) piden las ventajas
 *     perdidas, y «Ver como alumno» las deja pasar como lectura;
 *   - la posición de salida se evalúa (si no, la ventaja con la que arranca el
 *     ejercicio no cuenta) y el alumno ve el aviso;
 *   - la migración guardada lleva el trigger y las dos funciones.
 *
 *   node herramientas/verificar-practica-ventaja.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fallos++; };

console.log("La regla (js/puntos-clase.js)");
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(leer("js/puntos-clase.js"), ctx);
const P = ctx.window.PuntosClase;
const regla = P.REGLAS.find((r) => r.campo === "ventajas_perdidas");
ok(regla && regla.puntos === -350, "cada ventaja perdida resta 350");

const filas = P.juntar(
    [{ student_id: "a", nombre: "Ana", ganadas: 1 }, { student_id: "b", nombre: "Beto", ganadas: 0 }],
    [], [], [], [{ student_id: "a", perdidas: 2 }]);
const ana = filas.find((f) => f.student_id === "a");
ok(ana.ventajas_perdidas === 2, "juntar() le pone a cada alumno sus ventajas perdidas");
ok(P.puntos(ana) === 30 - 700, "los puntos restan: 1 práctica ganada y 2 ventajas perdidas = −670 (salió " + P.puntos(ana) + ")");
ok(filas.find((f) => f.student_id === "b").ventajas_perdidas === 0, "quien no perdió ninguna, 0");
ok(/\(−700\)/.test(P.desglose(ana)), "el desglose lo dice con su signo: " + P.desglose(ana));
ok(/resta 350 puntos/.test(P.reglaEscrita()), "la regla escrita dice «resta 350 puntos»");
const podio = P.podioParaLaClase([ana, { student_id: "c", nombre: "Cata", ganadas: 1 }], false);
ok(podio.lineas.some((l) => l.id === "a" && l.puntos === -670), "quien queda en negativo sigue en el podio, con su puesto");

console.log("\nLas puertas de los puntos");
const resumen = leer("js/resumen-clase.js");
ok(/sb\.rpc\("ventajas_perdidas", args\)/.test(resumen), "los puntos de la clase piden ventajas_perdidas");
ok(/sb\.rpc\("ventajas_perdidas_del_mes", args\)/.test(leer("js/puntos-clase.js")), "los del mes piden ventajas_perdidas_del_mes");
const sesion = leer("js/sesion.js");
const lectura = (sesion.match(/RPC_DE_LECTURA = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || "";
ok(/"ventajas_perdidas"/.test(lectura) && /"ventajas_perdidas_del_mes"/.test(lectura), "«Ver como alumno» las deja pasar como lectura");

console.log("\nLa práctica del alumno (js/sesion.js, sesion.html)");
ok((sesion.match(/evaluarPosicionDeSalida\(\);/g) || []).length >= 2, "la posición de salida se evalúa al abrir la práctica y al reintentar");
ok(/function evaluarPosicionDeSalida[\s\S]{0,400}updatePracticeGameEval\(latestPracticeSession\.fen/.test(sesion), "evalúa la posición de la ronda");
ok(/ventaja_max_cp: null/.test(sesion), "al reintentar, la ventaja del intento vuelve a empezar");
ok(/id="practice-ventaja-aviso"/.test(leer("sesion.html")), "la tarjeta tiene dónde avisarle");
ok(/350 puntos de la clase/.test(sesion), "el aviso dice cuánto se resta");

console.log("\nLa base (migración guardada)");
const dir = path.join(RAIZ, "supabase", "migraciones");
const mig = fs.readdirSync(dir).find((f) => /_practica_ventaja_perdida\.sql$/.test(f));
ok(!!mig, "la migración está guardada");
const sql = mig ? fs.readFileSync(path.join(dir, mig), "utf8") : "";
ok(/create or replace trigger practica_ventaja_maxima\s+before insert or update on public\.practice_games/.test(sql), "el trigger lleva la ventaja máxima en cada insert y update");
ok(/greatest\(old\.ventaja_max_cp, v\)/.test(sql), "se queda con la mayor del intento");
ok(/ventaja_max_cp > 300/.test(sql), "más de 3 es más de 300 centipeones");
ok(/status in \('draw', 'checkmate_loss', 'resigned', 'timeout'\)/.test(sql), "solo cuenta si el intento terminó sin ganar");
ok(/count\(distinct x\.session_id\)/.test(sql), "una vez por ejercicio, aunque la pierda en varios intentos");
ok(/old\.ventaja_max_cp\)\s+on conflict/.test(sql), "el intento guardado se lleva su ventaja");

console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron` : "\n✓ Todo bien");
process.exit(fallos ? 1 : 0);
