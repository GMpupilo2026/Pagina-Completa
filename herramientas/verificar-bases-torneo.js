/* Comprueba js/bases-torneo.js (BasesTorneo), el documento del «Generador de
   bases del torneo», sin navegador: lo que dice tiene que coincidir con las
   Leyes del Ajedrez y los reglamentos de FIDE que cita.

   - La modalidad sale del tiempo para 60 jugadas (Leyes A.1 y B.1): 10
     minutos o menos, relámpago; menos de 60, rápido; 60 o más, clásico.
   - El Elo FIDE clásico pide 120 minutos para 60 jugadas si alguno tiene
     2400 o más, y 90 si alguno tiene 1800 o más (B.02, 1.1).
   - La tolerancia cero se dice como cero (Leyes 6.7.1).
   - El calendario: las rondas por día, el día de calendario que no corre
     (se lee al mediodía de Costa Rica) y la hora siguiente redondeada a la
     media hora.
   - Los desempates, con los nombres del catálogo de Pareo Integral.
   - Lo que falta se dice antes de bajar.

   Ver «Generador de bases del torneo» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-bases-torneo.js */
"use strict";
const B = require("../js/bases-torneo.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}
const BASE = {
  nombre: "Abierto de Prueba", organizador: "Club Peón Pasado", fechaInicio: "2026-03-07", fechaFin: "2026-03-08", lugar: "San José",
  sistema: "suizo", rondas: 7, rondasPorDia: 4, horaInicio: "08:30", descanso: 15, ritmoMin: 60, ritmoInc: 30, tolerancia: 30,
  eloFide: true, desempates: ["BH-C1", "BH", "SB"], byes: 1, byesHasta: 5,
};
const con = (x) => Object.assign({}, BASE, x);
const texto = (d) => { const doc = B.documento(d); return [doc.titulo, doc.subtitulo].concat(doc.bloques.map((b) => b.texto || (b.items || []).join(" | ") || JSON.stringify(b.filas))).join("\n"); };

console.log("\n=== La modalidad (Leyes A.1 y B.1) ===");
igual("3 + 2 → 5 min para 60 jugadas: relámpago", B.modalidad(con({ ritmoMin: 3, ritmoInc: 2 })), "relampago");
igual("10 + 0 → relámpago (10 o menos)", B.modalidad(con({ ritmoMin: 10, ritmoInc: 0 })), "relampago");
igual("10 + 5 → 15: rápido", B.modalidad(con({ ritmoMin: 10, ritmoInc: 5 })), "rapido");
igual("45 + 15 → 60: clásico (60 o más)", B.modalidad(con({ ritmoMin: 45, ritmoInc: 15 })), "clasico");
igual("50 + 0 → rápido", B.modalidad(con({ ritmoMin: 50, ritmoInc: 0 })), "rapido");

console.log("\n=== El Elo FIDE clásico (B.02, 1.1) ===");
const avisos = (d) => B.revisar(d).map((x) => x.texto);
igual("90 + 30 → 120: sin aviso", avisos(con({ ritmoMin: 90, ritmoInc: 30 })).some((t) => t.includes("B.02")), false);
igual("60 + 30 → 90: avisa que no cuenta con 2400 o más", avisos(con({})).some((t) => t.includes("2400") && t.includes("hacen falta 120")), true);
igual("45 + 30 → 75: avisa que solo cuenta entre menores de 1800", avisos(con({ ritmoMin: 45 })).some((t) => t.includes("menos de 1800")), true);
igual("15 + 10 con Elo FIDE: avisa que es Elo de rápidas, no clásico", avisos(con({ ritmoMin: 15, ritmoInc: 10 })).some((t) => t.includes("de rápidas")), true);
igual("sin Elo FIDE: ningún aviso de Elo", avisos(con({ eloFide: false, ritmoMin: 15, ritmoInc: 10 })).some((t) => /Elo/.test(t)), false);
igual("y en el documento dice para qué Elo vale", texto(con({ eloNacional: true })).includes("válido para el Elo FIDE clásico y el Elo nacional"), true);

console.log("\n=== El calendario ===");
igual("4 rondas por día desde las 8:30, con rondas de 160 min y 15 de descanso: a la media hora siguiente",
  B.horario(con({})).map((x) => x.dia.slice(5) + " " + x.hora),
  ["03-07 8:30 a. m.", "03-07 11:30 a. m.", "03-07 2:30 p. m.", "03-07 5:30 p. m.", "03-08 8:30 a. m.", "03-08 11:30 a. m.", "03-08 2:30 p. m."]);
igual("el día de calendario no corre: la ronda 1 es el sábado 7 de marzo", B.documento(con({})).bloques.find((b) => b.tipo === "tabla").filas[0], ["1", "sábado, 7 de marzo de 2026", "8:30 a. m."]);
igual("las fechas, juntas cuando son del mismo mes", [B.rango("2026-03-07", "2026-03-08"), B.rango("2026-02-28", "2026-03-01"), B.rango("2026-12-31", "2027-01-01")],
  ["7 al 8 de marzo de 2026", "28 de febrero al 1 de marzo de 2026", "31 de diciembre de 2026 al 1 de enero de 2027"]);
igual("avisa si una ronda empieza de noche", avisos(con({ rondasPorDia: 7 })).some((t) => t.includes("10 de la noche")), true);

console.log("\n=== Lo que dice ===");
igual("tolerancia cero, dicha como cero (6.7.1)", texto(con({ tolerancia: 0 })).includes("la tolerancia es cero (Leyes del Ajedrez, 6.7.1)"), true);
igual("tolerancia de 30 minutos", texto(con({})).includes("más de 30 minutos después"), true);
igual("los desempates por su nombre, en orden", B.documento(con({})).bloques.find((b) => b.tipo === "lista" && b.items[0].startsWith("1.")).items,
  ["1. Buchholz sin el peor (BH-C1)", "2. Buchholz (BH)", "3. Sonneborn-Berger (SB)"]);
igual("en un suizo, los byes de medio punto; en todos contra todos, no", [texto(con({})).includes("bye de medio punto"), texto(con({ sistema: "todos" })).includes("bye de medio punto")], [true, false]);
igual("rápido: cita el Apéndice A", texto(con({ ritmoMin: 15, ritmoInc: 10 })).includes("Apéndice A (ajedrez rápido)"), true);
igual("los artículos van numerados seguido", B.documento(con({ sistema: "todos" })).bloques.filter((b) => b.tipo === "subtitulo").every((b, i) => b.texto.startsWith((i + 1) + ". ")), true);
igual("el costo en colones", texto(con({ costo: 5000 })).includes("Costo: ₡5"), true);

console.log("\n=== Lo que falta ===");
igual("sin nombre, fecha, lugar, rondas ni ritmo: cinco errores", B.revisar({}).filter((x) => x.tipo === "error").length, 5);
igual("sin desempates: aviso", avisos(con({ desempates: [] })).some((t) => t.includes("C.07")), true);
igual("cierre antes del inicio: error", B.revisar(con({ fechaFin: "2026-03-01" })).some((x) => x.tipo === "error" && x.texto.includes("cierre")), true);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
