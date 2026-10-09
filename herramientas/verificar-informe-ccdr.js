#!/usr/bin/env node
/* El informe mensual del CCDR San José (herramientas/informe-ccdr.js), armado
 * con datos inventados: ningún nombre real entra al repositorio.
 *
 * Lo que se rompe acá se rompe CALLADO: el Word abre perfecto y le falta una
 * de las nueve preguntas de la guía del comité, o lo que había que confirmar
 * sale sin el amarillo y se manda como si fuera un dato, o una foto no entra
 * y el anexo queda con un hueco. Esto lo arma y lo abre por dentro.
 *
 * Uso:  node herramientas/verificar-informe-ccdr.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const JSZip = require("jszip");
const { Packer } = require("docx");
const { armar } = require("./informe-ccdr.js");

let fallos = 0;
function ok(nombre, cumple, detalle = "") {
  if (cumple) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

// Un JPEG de 40×30, para no depender de ninguna foto de verdad.
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwClRRRXtHjhRRRQAUUUUAFFFFABRRRQAUUUUAf/2Q==", "base64");

const PREGUNTAS = [
  "Indique los nombres de los atletas que está entrenando",
  "Lugar y horarios de entrenamientos realizados",
  "en qué etapa del macrociclo se encuentra",
  "Indique las pruebas, test pedagógicos",
  "ha sufrido lesiones",
  "análisis de la forma deportiva actual",
  "Requerimientos y necesidades para el próximo mes.",
  "Otros aspectos que considere de interés",
];

function datosDePrueba() {
  const atletas = Array.from({ length: 7 }, (_, i) => `Atleta Prueba ${i + 1}`);
  return {
    periodo: "1 al 31 de enero de 2030", anio: 2030, mes: "Enero", entrenador: "Entrenador Prueba", asistente: "Asistente Prueba",
    atletas,
    lugar: { bloques: [{ vi: [{ b: "Clases presenciales: " }, "sábados de prueba."] }],
      sesiones: [["Mar 01/01", "Virtual", "6:00 p. m.", "Sesión de prueba", "3"]], nota: "Nota de prueba." },
    macrociclo: [{ p: "Etapa de prueba." }],
    pruebas: { bloques: [{ vi: "Control de prueba." }], resultados: [["Torneo X", "Sede X", "Atleta Prueba 1", "Abierto", "1.er lugar"]] },
    lesiones: [{ p: [{ pend: "MARCA-PENDIENTE" }] }],
    forma: [{ p: "Forma de prueba." }], requerimientos: [{ vi: "Requerimiento." }], otros: [{ vi: "Otro." }],
    anexoAsistencia: { meet: [["Mar 01/01", ["Atleta Prueba 1", "Atleta Prueba 2"], ["Cuenta Familiar"]]], plataforma: [["Atleta Prueba 3", 2]] },
    fotos: [{ archivo: "a.jpg", pie: "Foto de prueba uno" }, { archivo: "a.jpg", pie: "Foto de prueba dos" }, { archivo: "a.jpg", pie: "Foto de prueba tres" }],
  };
}

async function main() {
  console.log("\nEl informe del CCDR, armado con datos inventados");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "informe-ccdr-"));
  fs.writeFileSync(path.join(dir, "a.jpg"), JPEG);
  const buf = await Packer.toBuffer(armar(datosDePrueba(), dir));
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  const texto = xml.replace(/<[^>]+>/g, "");

  for (const p of PREGUNTAS) ok(`trae la pregunta «${p}»`, texto.includes(p));
  ok("los siete atletas, numerados", texto.includes("1. Atleta Prueba 1") && texto.includes("7. Atleta Prueba 7"));
  ok("dice cuántos atletas hay", texto.includes("7 atletas inscritos"));
  const marca = xml.indexOf("MARCA-PENDIENTE");
  const run = xml.lastIndexOf("<w:r>", marca) >= 0 ? xml.slice(xml.lastIndexOf("<w:r>", marca), marca) : "";
  ok("lo que hay que confirmar sale en amarillo", /<w:highlight w:val="yellow"\/>/.test(run), "el trozo {pend} perdió el resaltado");
  ok("el anexo de asistencia cuenta las otras cuentas", texto.includes("Otras cuentas: Cuenta Familiar"));
  const fotos = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
  ok("las fotos entran al Word", fotos.length >= 1, `word/media trae ${fotos.length}`);
  ok("las tres fotos con su pie", ["uno", "dos", "tres"].every((n) => texto.includes("Foto de prueba " + n)));
  ok("la firma lleva el nombre del entrenador", texto.includes("Firma del entrenador") && texto.includes("Entrenador Prueba"));

  let lanzo = false;
  try { armar({ ...datosDePrueba(), forma: [{ p: [{ negrita: "mal escrito" }] }] }, dir); } catch { lanzo = true; }
  ok("un trozo mal escrito en el JSON da error, no un texto vacío", lanzo);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
}
main();
