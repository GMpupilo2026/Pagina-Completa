#!/usr/bin/env node
/* Comprueba js/calendario-inteligente.js, la cuenta de «Mi calendario».
 *
 * Lo que se rompe acá no da ningún error: una tarea que vence a las 11 p. m.
 * aparece al día siguiente (el día en UTC), el plan sugiere hacerla DESPUÉS de
 * que venció o antes de que se abra, una tarea a doce alumnos sale doce veces
 * en el calendario del profe, o el mes arranca en domingo y corre todo un día.
 * Ver «Mi calendario: clases, tareas y exámenes, con un plan» en
 * docs/decisiones/paneles.md.
 *
 *   node herramientas/verificar-calendario-inteligente.js
 */
const C = require("../js/calendario-inteligente.js");

let fallos = 0;
// El navegador escribe «p. m.» con espacios que no se parten (U+00A0, U+202F): acá se comparan como espacios.
const espacios = (t) => t.replace(/[\u00a0\u202f]/g, " ");
function igual(n, hallado, esperado) {
  const a = espacios(JSON.stringify(hallado)), b = JSON.stringify(esperado);
  if (a !== b) { console.log(`  ✗ ${n}\n      esperaba: ${b}\n      salió:    ${a}`); fallos++; }
  else console.log(`  ✓ ${n}`);
}

// Miércoles 14 de octubre de 2026, 3:00 p. m. en Costa Rica.
const AHORA = new Date("2026-10-14T15:00:00-06:00");
const CLASES = [
  { horario_id: "h1", inicio: "2026-10-15T16:00:00-06:00", fin: "2026-10-15T17:00:00-06:00", titulo: "7B", modalidad: "en_linea", profesor: "Karina Rojas" },
  { horario_id: "h1", inicio: "2026-10-22T16:00:00-06:00", fin: "2026-10-22T17:00:00-06:00", titulo: "7B", modalidad: "en_linea", profesor: "Karina Rojas" },
];
const TAREAS = [
  { id: "t1", titulo: "Mates", vence_at: "2026-10-17T23:00:00-06:00", renglones: 5, cumplidos: 1, situacion: "pendiente" },
  { id: "t2", titulo: "Aperturas", vence_at: "2026-10-17T20:00:00-06:00", renglones: 1, cumplidos: 0, situacion: "pendiente" },
  { id: "t3", titulo: "Vieja", vence_at: "2026-10-01T20:00:00-06:00", renglones: 1, cumplidos: 0, situacion: "vencida" },
  { id: "t4", titulo: "Hoy", vence_at: "2026-10-14T21:00:00-06:00", renglones: 2, cumplidos: 1, situacion: "pendiente" },
  { id: "t5", titulo: "Se abre el lunes", vence_at: "2026-10-21T20:00:00-06:00", disponible_desde: "2026-10-19T07:00:00-06:00", renglones: 1, cumplidos: 0, situacion: "programada" },
];
const EXAMENES = [
  { id: "e1", titulo: "Final", vence_at: "2026-10-20T08:00:00-06:00", estado: "asignado", minutos: 30 },
  { id: "e2", titulo: "Entregado", vence_at: "2026-10-16T08:00:00-06:00", estado: "entregado" },
];

console.log("\n=== Los días y las horas, en Costa Rica ===");
igual("las 11 p. m. del sábado son el sábado (en UTC ya es domingo)", C.dia("2026-10-17T23:00:00-06:00"), "2026-10-17");
igual("el mediodía se dice «12:00 m. d.»", C.hora("2026-10-15T12:00:00-06:00"), "12:00 m. d.");
igual("y una hora cualquiera, con a. m./p. m.", [C.hora("2026-10-15T16:00:00-06:00"), C.hora("2026-10-15T08:30:00-06:00")], ["4:00 p. m.", "8:30 a. m."]);
igual("el nombre del día, sin la coma del navegador", C.nombreDia("2026-10-15"), "jueves 15 de octubre");
igual("hoy, mañana y el resto con su nombre", ["2026-10-14", "2026-10-15", "2026-10-17"].map((d) => C.cuando(d, "2026-10-14")), ["hoy", "mañana", "el sábado 17 de octubre"]);
igual("sumar días cruza el mes y el año", [C.sumarDias("2026-10-31", 1), C.sumarDias("2026-12-31", 1), C.sumarDias("2027-03-01", -1)], ["2026-11-01", "2027-01-01", "2027-02-28"]);
igual("el mes vecino", [C.mesVecino("2026-12", 1), C.mesVecino("2026-01", -1)], ["2027-01", "2025-12"]);

console.log("\n=== El mes, de lunes a domingo ===");
const oct = C.semanasDelMes("2026-10");
igual("octubre de 2026 arranca el lunes 28 de septiembre y termina el domingo 1 de noviembre", [oct[0][0], oct[oct.length - 1][6], oct.length], ["2026-09-28", "2026-11-01", 5]);
igual("cada semana empieza en lunes", oct.every((s) => C.diaSemana(s[0]) === 1), true);
const feb = C.semanasDelMes("2027-02");
igual("febrero de 2027 (empieza en lunes) son cuatro semanas justas", [feb[0][0], feb.length], ["2027-02-01", 4]);
const ago = C.semanasDelMes("2026-08");
igual("un mes que empieza en sábado y tiene 31 días ocupa seis semanas", [ago[0][0], ago.length, ago[5][0]], ["2026-07-27", 6, "2026-08-31"]);

console.log("\n=== Los eventos del alumno ===");
const ev = C.eventosAlumno({ clases: CLASES, tareas: TAREAS, examenes: EXAMENES, ahora: AHORA });
igual("todo, en orden de día y hora", ev.map((e) => [e.dia, e.titulo]), [
  ["2026-10-01", "Tarea: Vieja"], ["2026-10-14", "Tarea: Hoy"], ["2026-10-15", "Clase: 7B"], ["2026-10-16", "Examen: Entregado"],
  ["2026-10-17", "Tarea: Aperturas"], ["2026-10-17", "Tarea: Mates"], ["2026-10-20", "Examen: Final"], ["2026-10-21", "Tarea: Se abre el lunes"], ["2026-10-22", "Clase: 7B"],
]);
igual("el estado va escrito", ev.map((e) => e.estado), ["Vencida", "Vence hoy", "", "Hecha", "", "", "", "Programada", ""]);
igual("la clase dice la hora, cómo es y con quién", ev[2].detalle, "4:00 p. m. a 5:00 p. m. · En línea · Con Karina Rojas");
igual("la tarea dice cuánto lleva", ev[5].detalle, "Vence a las 11:00 p. m. · 1 de 5 hechas");
igual("el examen lleva a su página", ev[6].href, "examen.html?id=e1");
const ahoraEnClase = new Date("2026-10-15T16:20:00-06:00");
igual("una clase en curso dice «Ahora»", C.eventosAlumno({ clases: CLASES, ahora: ahoraEnClase })[0].estado, "Ahora");

console.log("\n=== El plan del alumno ===");
const plan = C.planAlumno({ eventos: ev, tareas: TAREAS, examenes: EXAMENES, ahora: AHORA });
igual("reparte lo pendiente en los días más libres, de la entrega más cercana a la más lejana", plan.map((p) => [p.dia, p.texto]), [
  ["2026-10-14", "Haz la tarea «Hoy»"],
  ["2026-10-15", "Avanza la tarea «Mates» (2 de los 4 ejercicios que te faltan)"],
  ["2026-10-16", "Haz la tarea «Aperturas»"],
  ["2026-10-16", "Termina la tarea «Mates»"],
  ["2026-10-18", "Haz el examen «Final»"],
  ["2026-10-19", "Haz la tarea «Se abre el lunes»"],
]);
igual("dice por qué ese día", plan[2].motivo, "Vence mañana a las 8:00 p. m.; es tu día más libre antes de eso.");
igual("lo que vence ese mismo día lo dice, sin doblar el punto", plan[0].motivo, "Vence ese mismo día a las 9:00 p. m.");
igual("lo vencido, lo entregado y lo de otra persona no entra al plan", plan.some((p) => ["t3", "e2"].includes(p.id)), false);
igual("lo que vence en la mañana se hace el día anterior (el examen de las 8 a. m. del martes, a más tardar el lunes)", plan.find((p) => p.id === "e1").dia <= "2026-10-19", true);
const temprano = C.planAlumno({ eventos: [], examenes: [{ id: "e8", titulo: "Temprano", vence_at: "2026-10-15T07:00:00-06:00", estado: "asignado" }], ahora: AHORA });
igual("el examen de mañana a las 7 a. m. se sugiere hoy, no mañana", temprano.map((p) => p.dia), ["2026-10-14"]);
igual("lo que todavía no se abre no se sugiere antes de que se abra", plan.find((p) => p.id === "t5").dia >= "2026-10-19", true);

const empezado = C.planAlumno({ eventos: [], tareas: [], examenes: [{ id: "e9", titulo: "Ya", vence_at: "2026-10-25T20:00:00-06:00", estado: "en_curso" }], ahora: AHORA });
igual("un examen empezado va hoy y primero que todo", empezado.map((p) => [p.dia, p.texto, !!p.urgente]), [["2026-10-14", "Termina el examen «Ya»", true]]);

/* Con cualquier lote de tareas, nada se sugiere antes de abrirse, después de
   vencer ni antes de hoy. Al azar, con semilla fija para que el fallo se repita. */
let semilla = 7;
const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
let malos = [];
for (let vuelta = 0; vuelta < 300; vuelta++) {
  const tareas = [];
  const n = 1 + Math.floor(azar() * 8);
  for (let i = 0; i < n; i++) {
    const vence = new Date(AHORA.getTime() + (1 + azar() * 20 * 24) * 3600000);
    const abre = azar() < 0.3 ? new Date(AHORA.getTime() + azar() * (vence - AHORA)) : null;
    const renglones = 1 + Math.floor(azar() * 8);
    tareas.push({ id: "r" + i, titulo: "R" + i, vence_at: vence.toISOString(), disponible_desde: abre && abre.toISOString(), renglones, cumplidos: Math.floor(azar() * renglones), situacion: abre ? "programada" : "pendiente" });
  }
  const e = C.eventosAlumno({ clases: CLASES, tareas, ahora: AHORA });
  for (const p of C.planAlumno({ eventos: e, tareas, ahora: AHORA, dias: 60 })) {
    const t = tareas.find((x) => x.id === p.id);
    if (p.dia < "2026-10-14" || p.dia > C.dia(t.vence_at) || (t.disponible_desde && p.dia < C.dia(t.disponible_desde))) malos.push([vuelta, p.id, p.dia]);
  }
  if (malos.length) break;
}
igual("en 300 lotes al azar, nada antes de hoy, de que se abra ni después de que vence", malos, []);

console.log("\n=== Lo que conviene saber (alumno) ===");
const avisos = C.avisosAlumno({ eventos: ev, tareas: TAREAS, examenes: EXAMENES, ahora: AHORA });
igual("lo de hoy, los días cargados, lo vencido y la próxima clase", avisos.map((a) => [a.nivel, a.texto]), [
  ["alto", "Hoy vence la tarea «Hoy», a las 9:00 p. m."],
  ["medio", "El sábado 17 de octubre vencen 2 entregas juntas: el plan reparte el trabajo en los días de antes."],
  ["medio", "Tienes 1 tarea vencida sin terminar: todavía puedes hacerla en «Mis tareas»."],
  ["info", "Tu próxima clase es mañana a las 4:00 p. m."],
]);
igual("un examen empezado se avisa primero",
  C.avisosAlumno({ eventos: [], examenes: [{ id: "e9", titulo: "Ya", estado: "en_curso", vence_at: "2026-10-25T20:00:00-06:00" }], ahora: AHORA })[0].texto,
  "Tienes empezado el examen «Ya»: termínalo antes de que se acabe el tiempo.");

console.log("\n=== El horario del profe ===");
const HORARIO = [
  { id: "h1", dia_semana: 4, hora: "16:00:00", duracion_min: 90, grupo: "7B", titulo: null, modalidad: "presencial" },
  { id: "h2", dia_semana: 1, hora: "12:00", duracion_min: 60, subgrupo_id: "s1", titulo: null, modalidad: "en_linea", desde: "2026-10-19", hasta: "2026-10-26" },
];
const cl = C.clasesDelHorario(HORARIO, { desde: "2026-10-12", dias: 21, nombres: { s1: "Los peones" } });
igual("cada clase en su día, con su grupo, y lo de fuera de desde/hasta no entra", cl.map((c) => [C.dia(c.inicio), C.hora(c.inicio), c.titulo]), [
  ["2026-10-15", "4:00 p. m.", "Grupo 7B"], ["2026-10-19", "12:00 m. d.", "Los peones"], ["2026-10-22", "4:00 p. m.", "Grupo 7B"],
  ["2026-10-26", "12:00 m. d.", "Los peones"], ["2026-10-29", "4:00 p. m.", "Grupo 7B"],
]);
igual("con su duración", C.hora(cl[0].fin), "5:30 p. m.");

console.log("\n=== Las entregas del profe, juntas ===");
const DE_ALUMNOS = [
  { id: "a", titulo: "Mates", alumno_nombre: "Ana", vence_at: "2026-10-14T21:00:00-06:00", situacion: "pendiente" },
  { id: "b", titulo: "Mates", alumno_nombre: "Beto", vence_at: "2026-10-14T21:00:00-06:00", situacion: "pendiente" },
  { id: "c", titulo: "Mates", alumno_nombre: "Caro", vence_at: "2026-10-14T21:00:00-06:00", situacion: "pendiente" },
  { id: "d", titulo: "Finales", alumno_nombre: "Ana", vence_at: "2026-10-21T20:00:00-06:00", situacion: "pendiente" },
  { id: "e", titulo: "Torres", alumno_nombre: "Ana", vence_at: "2026-10-21T21:00:00-06:00", situacion: "pendiente" },
  { id: "f", titulo: "Alfiles", alumno_nombre: "Ana", vence_at: "2026-10-21T22:00:00-06:00", situacion: "pendiente" },
];
const evp = C.eventosProfe({ clases: cl, tareas: DE_ALUMNOS, examenes: [], ahora: AHORA });
const entregas = evp.filter((e) => e.tipo !== "clase");
igual("una tarea a tres alumnos es UNA cosa", entregas.map((e) => [e.dia, e.titulo, e.detalle]), [
  ["2026-10-14", "Tarea: Mates", "Vence a las 9:00 p. m. · 3 alumnos sin terminar"],
  ["2026-10-21", "Tarea: Finales", "Vence a las 8:00 p. m. · sin terminar: Ana"],
  ["2026-10-21", "Tarea: Torres", "Vence a las 9:00 p. m. · sin terminar: Ana"],
  ["2026-10-21", "Tarea: Alfiles", "Vence a las 10:00 p. m. · sin terminar: Ana"],
]);
const avp = C.avisosProfe({ eventos: evp, tareas: DE_ALUMNOS, hayHorario: true, ahora: AHORA });
igual("avisa lo que vence hoy, al alumno con tres entregas el mismo día y la próxima clase", avp.map((a) => a.texto), [
  "Hoy vence «Mates»: 3 alumnos todavía no terminan.",
  "Ana tiene 3 tareas tuyas que vencen el miércoles 21 de octubre: quizá convenga correr alguna.",
  "Tu próxima clase es mañana a las 4:00 p. m. (Grupo 7B).",
]);
igual("sin horario, lo invita a ponerlo", C.avisosProfe({ eventos: [], tareas: [], hayHorario: false, ahora: AHORA }).map((a) => a.nivel), ["info"]);
const pp = C.planProfe({ eventos: evp, ahora: AHORA });
igual("cada entrega, en la clase de antes (recordar) y en la de después (revisar)", pp.map((p) => [p.dia, p.texto]), [
  ["2026-10-15", "Revisa la tarea «Mates» en tu clase de las 4:00 p. m."],
  ["2026-10-19", "Recuérdales la tarea «Finales» en tu clase de las 12:00 m. d."],
  ["2026-10-19", "Recuérdales la tarea «Torres» en tu clase de las 12:00 m. d."],
  ["2026-10-19", "Recuérdales la tarea «Alfiles» en tu clase de las 12:00 m. d."],
  ["2026-10-22", "Revisa la tarea «Finales» en tu clase de las 4:00 p. m."],
  ["2026-10-22", "Revisa la tarea «Torres» en tu clase de las 4:00 p. m."],
  ["2026-10-22", "Revisa la tarea «Alfiles» en tu clase de las 4:00 p. m."],
]);
igual("y dice por qué", pp[1].motivo, "1 alumno no la ha terminado y vence el miércoles 21 de octubre.");

console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
