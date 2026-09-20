/* ===== El informe que llega a la casa =====
 *
 *   node herramientas/verificar-informe-casa.js
 *
 * No necesita navegador, ni red, ni el sitio servido: `informe-html.ts` es una
 * función que recibe los datos de `public.informe_de_alumno()` y devuelve HTML,
 * así que se la llama y se mira qué contesta.
 *
 * POR QUÉ EXISTE. Lo que se rompe en este archivo no da ningún error: el correo
 * sale igual, Resend lo acepta, y a la casa le llega un informe al que le falta
 * media página o que dice "va bien" de un alumno que no entró en toda la
 * semana. Nadie se entera hasta que una madre pregunta.
 *
 * Lo que se comprueba es lo que decide el tono del correo:
 *
 *  - Que las CUATRO situaciones se distingan (va bien, practicó poco, no entró,
 *    tiene entregas vencidas) y que el orden de prioridad se respete: lo
 *    vencido manda aunque haya practicado todos los días.
 *  - Que los números de tareas y exámenes lleguen al HTML con los nombres que
 *    de verdad usa la base. Una clave mal escrita —`asignadas` por `puestas`—
 *    no rompe nada: la sección simplemente no aparece.
 *  - Que el periodo diario no hable de "practicó 1 día de 1", que se lee como
 *    un error de cuentas.
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

/* Los datos van con las mismas claves que devuelve public.informe_de_alumno().
   Están copiadas de una llamada de verdad a la base, no inventadas: si alguien
   le cambia el nombre a una, esta prueba deja de encontrar su texto. */
const BASE = {
  alumno: "Sofía Muñoz", grupo: "7° B",
  desde: "2026-09-13T00:00:00Z", hasta: "2026-09-20T00:00:00Z",
  dias_del_periodo: 7, clases: 2, respuestas: 10, correctas: 8,
  minutos_clase: 55, minutos_ejercicios: 40,
  entreno: { mates: { cuantos: 25, mejor: null } },
  diagnostico: null,
};
const SIN_DEBERES = { puestas: 0, completadas: 0, vencidas: 0, sin_hacer_hoy: 0, pendientes: 0 };

const CASOS = [
  { nombre: "va-bien", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: { ...SIN_DEBERES, puestas: 2, completadas: 2, pendientes: 1,
                proxima_vence: "2026-09-25T18:00:00Z", renglones: 4, cumplidos: 4 },
      examenes: { rendidos: 2, nota_media: 8.5, mejor_nota: 9, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "practico-poco", frecuencia: "semanal", datos: { ...BASE, dias_activos: 1,
      tareas: { ...SIN_DEBERES, puestas: 1, completadas: 0, pendientes: 1 },
      examenes: { rendidos: 0, nota_media: null, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "no-entro", frecuencia: "semanal", datos: { ...BASE, dias_activos: 0,
      clases: 0, respuestas: 0, correctas: 0, minutos_clase: 0, minutos_ejercicios: 0, entreno: {},
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  // Practicó los siete días Y tiene cosas vencidas: lo vencido manda.
  { nombre: "vencido-aunque-practique", frecuencia: "semanal", datos: { ...BASE, dias_activos: 7,
      tareas: { ...SIN_DEBERES, puestas: 3, completadas: 1, vencidas: 2, sin_hacer_hoy: 2 },
      examenes: { rendidos: 1, nota_media: 4, mejor_nota: 4, sin_hacer_hoy: 1, pendientes: 0 } } },
  { nombre: "diario-si", frecuencia: "diario", datos: { ...BASE, dias_del_periodo: 1, dias_activos: 1,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "diario-no", frecuencia: "diario", datos: { ...BASE, dias_del_periodo: 1, dias_activos: 0,
      clases: 0, respuestas: 0, correctas: 0, minutos_clase: 0, minutos_ejercicios: 0, entreno: {},
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
];

const r = spawnSync(process.execPath,
  ["--experimental-strip-types", "--no-warnings",
   path.join(__dirname, "casos-informe-casa.mts"), JSON.stringify(CASOS)],
  { cwd: RAIZ, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
if (r.status !== 0) {
  console.error("No se pudo generar el informe:\n" + (r.stderr || r.stdout));
  process.exit(1);
}
const { html, periodos } = JSON.parse(r.stdout);

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };
// Se mira el TEXTO que va a leer quien abre el correo, no las etiquetas: un
// informe puede tener el dato en el HTML y no enseñarlo.
const texto = (k) => html[k].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ---------- Las cuatro situaciones ----------
ok(/Va bien/.test(texto("va-bien")), "quien practicó 5 de 7 días debería leer «Va bien»");
ok(/Practicó 5 días de 7/.test(texto("va-bien")), "no dice cuántos días practicó");
ok(/Practicó poco/.test(texto("practico-poco")), "quien practicó 1 de 7 días debería leer «Practicó poco»");
ok(/no entró a practicar/.test(texto("no-entro")), "quien no entró debería leerlo con todas las letras");
ok(/Sofía no entró/.test(texto("no-entro")), "el aviso de «no entró» debería llamar al alumno por su nombre");
ok(!/Va bien|Practicó poco/.test(texto("no-entro")), "a quien no entró no se le puede decir que va bien");

// El orden de prioridad: practicó los SIETE días y aun así lo vencido manda.
const v = texto("vencido-aunque-practique");
ok(/Se le pasó la fecha de 2 tareas y 1 examen/.test(v),
  "con cosas vencidas, el titular debería decir qué venció: " + v.slice(0, 200));
ok(!/Va bien/.test(v), "con entregas vencidas no se puede encabezar con «Va bien»");
ok(/Practicó 7 días de 7/.test(v), "lo vencido no debería tapar que sí practicó");

// El diario no cuenta días: "practicó 1 día de 1" se lee como un error.
ok(/Hoy sí se sentó a practicar/.test(texto("diario-si")), "el informe diario debería hablar de hoy");
ok(!/de 1\./.test(texto("diario-si")), "el informe diario no debería decir «de 1»");
ok(/Hoy no entró a practicar|no entró a practicar/.test(texto("diario-no")), "el informe diario en cero debería decirlo");

// ---------- Tareas y exámenes ----------
const b = texto("va-bien");
ok(/Sus tareas/.test(b), "falta la sección de tareas");
ok(/Le pusieron 2 tareas/.test(b), "no dice cuántas tareas le pusieron");
ok(/Terminó 2 de 2/.test(b), "no dice cuántas terminó");
ok(/la próxima vence el 25 de septiembre/.test(b), "no dice cuándo vence la próxima");
ok(/Sus exámenes/.test(b), "falta la sección de exámenes");
ok(/Hizo 2 exámenes/.test(b), "no dice cuántos exámenes hizo");
ok(/Nota promedio 8,50 de 10/.test(b), "la nota debería ir con coma decimal y sobre 10");
ok(/mejor: 9,00/.test(b), "con más de un examen debería decir la mejor nota");
ok(/Nota 8,50/.test(texto("practico-poco")) === false, "sin exámenes rendidos no debería inventar una nota");

// Un alumno sin nada no tiene por qué ver secciones vacías.
ok(!/Sus tareas|Sus exámenes/.test(texto("no-entro")),
  "sin tareas ni exámenes, esas secciones no deberían aparecer");

// ---------- Los umbrales ----------
ok(periodos.semanal.esperados > 0 && periodos.semanal.esperados < periodos.semanal.dias,
  "el umbral semanal debería estar entre 1 y los días del periodo");
Object.keys(periodos).forEach((k) => {
  ok(periodos[k].esperados <= periodos[k].dias,
    `el umbral de ${k} (${periodos[k].esperados}) no cabe en sus ${periodos[k].dias} días`);
});

if (fallos.length) {
  console.error(`❌ ${fallos.length} fallo(s):\n` + fallos.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log("✅ El informe de la casa: todo bien.");
