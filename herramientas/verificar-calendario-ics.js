#!/usr/bin/env node
/* Comprueba js/calendario-ics.js, el archivo de «Agregar a mi calendario».
 *
 * Un .ics mal armado no da ningún error: el calendario del celular lo abre,
 * agrega cero eventos o los pone a otra hora, y nadie se entera hasta que el
 * alumno llega tarde a clase. Acá se mira lo que de verdad rompe:
 * - la hora de la clase, en hora de Costa Rica con su zona escrita;
 * - lo que escribe una persona escapado (un «;» o una coma en un título);
 * - las líneas largas dobladas a 75 bytes sin partir una tilde;
 * - los UID estables (bajarlo otra vez actualiza, no duplica);
 * - lo vencido, entregado o congelado no entra.
 *
 *   node herramientas/verificar-calendario-ics.js
 */
const Cal = require("../js/calendario-ics.js");

let fallos = 0;
function igual(n, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log(`  ✗ ${n}\n      esperaba: ${b}\n      salió:    ${a}`); fallos++; }
  else console.log(`  ✓ ${n}`);
}

// Desdobla y separa en eventos, como lo lee un calendario.
function leer(texto) {
  const lineas = texto.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
  const eventos = [];
  let actual = null;
  for (const l of lineas) {
    if (l === "BEGIN:VEVENT") actual = {};
    else if (l === "END:VEVENT") { eventos.push(actual); actual = null; }
    else if (actual && !actual._alarma) {
      if (l === "BEGIN:VALARM") actual._alarma = true;
      else { const i = l.indexOf(":"); actual[l.slice(0, i)] = l.slice(i + 1); }
    } else if (actual && l === "END:VALARM") actual._alarma = false;
    else if (actual && actual._alarma && l.startsWith("TRIGGER:")) actual.TRIGGER = l.slice(8);
  }
  return { lineas, eventos };
}

const AHORA = new Date("2026-10-04T15:00:00Z");   // 9:00 a. m. en Costa Rica
// El martes 6 a las 4:00 p. m. de Costa Rica son las 22:00 UTC.
const clases = [
  { horario_id: "h-1", inicio: "2026-10-06T22:00:00Z", fin: "2026-10-06T23:30:00Z", titulo: "Finales; torres, y peones", modalidad: "en_linea", profesor: "Karina Rojas" },
  { horario_id: "h-2", inicio: "2026-10-09T15:00:00Z", fin: "2026-10-09T16:00:00Z", titulo: null, modalidad: "presencial", profesor: null },
];
const tareas = [
  { id: "t-1", titulo: "Mates en dos, versión «larga» con muchísimas palabras para que la línea pase de setenta y cinco bytes ñandú", vence_at: "2026-10-08T05:59:00Z" },
  { id: "t-vieja", titulo: "Vencida", vence_at: "2026-10-01T05:59:00Z" },
  { id: "t-sin", titulo: "Sin fecha", vence_at: null },
];
const examenes = [
  { id: "e-1", titulo: "Examen de octubre", estado: "pendiente", vence_at: "2026-10-10T18:00:00Z" },
  { id: "e-hecho", titulo: "Entregado", estado: "entregado", vence_at: "2026-10-10T18:00:00Z" },
  { id: "e-cong", titulo: "Congelado", estado: "congelado", vence_at: "2026-10-10T18:00:00Z" },
];

console.log("\n=== El archivo ===");
const { texto, eventos } = Cal.armar({ clases, tareas, examenes, ahora: AHORA });
const { lineas, eventos: ev } = leer(texto);
igual("cuenta 4 fechas: 2 clases, 1 tarea y 1 examen (lo vencido, entregado o congelado no entra)", [eventos, ev.length], [4, 4]);
igual("empieza y termina como un calendario", [lineas[0], lineas[lineas.length - 1]], ["BEGIN:VCALENDAR", "END:VCALENDAR"]);
igual("las líneas terminan en CRLF", /\r\n$/.test(texto) && !/[^\r]\n/.test(texto), true);
igual("trae la zona de Costa Rica, siempre UTC−6",
  ["TZID:America/Costa_Rica", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0600"].every((l) => lineas.includes(l)), true);

console.log("\n=== Las clases ===");
const c1 = ev[0], c2 = ev[1];
igual("la clase de las 4 p. m. de Costa Rica dice 16:00 con su zona", [c1["DTSTART;TZID=America/Costa_Rica"], c1["DTEND;TZID=America/Costa_Rica"]], ["20261006T160000", "20261006T173000"]);
igual("el título escapado: «;» y «,» no cortan el campo", c1.SUMMARY, "Clase de ajedrez: Finales\\; torres\\, y peones");
igual("en línea, con el profe y el enlace al panel", [c1.LOCATION, c1.DESCRIPTION], ["En línea", "Con Karina Rojas. Entra a la clase desde tu panel: https://ajedrez-integral.com/clases.html"]);
igual("avisa 30 minutos antes", c1.TRIGGER, "-PT30M");
igual("el UID es el horario y el día: no cambia al bajarlo otra vez", c1.UID, "clase-h-1-20261006@ajedrez-integral.com");
igual("sin título ni profe, dice lo justo", [c2.SUMMARY, c2.LOCATION, c2.DESCRIPTION, c2["DTSTART;TZID=America/Costa_Rica"]],
  ["Clase de ajedrez", "Presencial", "Tu panel: https://ajedrez-integral.com/clases.html", "20261009T090000"]);

console.log("\n=== Tareas y exámenes ===");
const t1 = ev[2], e1 = ev[3];
igual("la tarea vence a las 11:59 p. m. del 7 en Costa Rica (no el 8)", t1["DTEND;TZID=America/Costa_Rica"], "20261007T235900");
igual("el título largo llega entero, con su tilde", t1.SUMMARY, "Vence la tarea «" + tareas[0].titulo.replace(/,/g, "\\,") + "»");
igual("avisa un día antes", [t1.TRIGGER, e1.TRIGGER], ["-P1D", "-P1D"]);
igual("el examen lleva su enlace", e1.URL, "https://ajedrez-integral.com/examen.html?id=e-1");
igual("los UID de tarea y examen son su id", [t1.UID, e1.UID], ["tarea-t-1@ajedrez-integral.com", "examen-e-1@ajedrez-integral.com"]);

console.log("\n=== Las líneas largas ===");
const crudas = texto.split("\r\n");
igual("ninguna línea pasa de 75 bytes", crudas.every((l) => Buffer.byteLength(l) <= 75), true);
igual("las que siguen empiezan con un espacio", crudas.some((l) => l.startsWith(" ")), true);
igual("ninguna tilde quedó partida", !texto.includes("�") && Buffer.from(texto).toString("utf8") === texto, true);

console.log("\n=== Lo de una persona ===");
igual("una barra y un salto de línea se escapan", Cal.escapar("a\\b\nc"), "a\\\\b\\nc");
igual("sin nada, el archivo no trae eventos", Cal.armar({ ahora: AHORA }).eventos, 0);

console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl calendario sale bien armado.");
process.exit(fallos ? 1 : 0);
