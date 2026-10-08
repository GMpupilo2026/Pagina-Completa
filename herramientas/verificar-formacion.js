#!/usr/bin/env node
/* Comprueba el curso «Formación Ajedrez» (herramientas/cursos/formacion-ajedrez.json
 * y lo que genera herramientas/curso-generar-formacion.py).
 *
 * Cada sesión está calculada para 5 horas y trae su cronograma, temas con su
 * fuente, casos, ejercicios con respuesta y quiz. Lo que se rompe acá no da
 * ningún error en pantalla:
 *
 *  - Un cronograma que suma 290 o 315 minutos se ve perfecto y le arruina la
 *    clase a quien la dicta. Se suma.
 *  - La respuesta de un ejercicio con posición («es ahogado») se escribió una
 *    vez con chess.js; si alguien toca la FEN, la respuesta queda mintiendo. Se
 *    vuelve a calcular.
 *  - El fragmento protegido y los PDF se generan: si se edita el JSON y no se
 *    vuelve a correr el generador, el alumno ve el curso viejo. Se compara el
 *    fragmento con lo que el generador armaría hoy, y se busca en cada PDF el
 *    texto nuevo.
 *  - reportlab cambia en silencio por otra letra cualquier carácter que no
 *    exista en las fuentes base (WinAnsi): «−» o «→» salen como basura en el
 *    PDF. Se revisa todo el texto que va a los PDF.
 *
 *   node herramientas/verificar-formacion.js      (necesita python3 y pypdf)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const DATOS = path.join(RAIZ, "herramientas", "cursos", "formacion-ajedrez.json");
const RECURSOS = path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez");
const curso = JSON.parse(fs.readFileSync(DATOS, "utf8"));
const lecciones = curso.bloques.flatMap((b) => b.lecciones);
const virtuales = lecciones.filter((l) => !l.presencial);
const presencial = lecciones.find((l) => l.presencial);

let fallos = 0;
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

console.log("1. Cada sesión dura 5 horas");
virtuales.forEach((l) => {
  const total = l.cronograma.reduce((a, [m]) => a + m, 0);
  cierto(`${l.archivo}: el cronograma suma 300 minutos`, total === 300, `suma ${total}`);
});
const aMin = (h) => {
  const m = h.match(/^(\d+):(\d\d) ([ap])\. m\.$/);
  const hora = (+m[1] % 12) + (m[3] === "p" ? 12 : 0);
  return hora * 60 + +m[2];
};
const agenda = presencial.agenda.map(([h]) => aMin(h));
cierto("la sesión presencial va de la primera a la última hora en 5 horas",
  agenda[agenda.length - 1] - agenda[0] === 300, `dura ${agenda[agenda.length - 1] - agenda[0]} minutos`);
cierto("la agenda presencial está en orden", agenda.every((m, i) => i === 0 || m > agenda[i - 1]));
cierto("la portada del curso dice 40 horas", /^40 horas/.test(curso.duracion_texto));

console.log("\n2. Cada sesión virtual trae todas sus partes");
virtuales.forEach((l) => {
  const falta = ["objetivos", "cronograma", "temas", "casos", "ejercicios", "quiz", "tarea"].filter((k) => !l[k] || !l[k].length);
  cierto(`${l.archivo}: objetivos, cronograma, temas, casos, ejercicios, quiz y tarea`, falta.length === 0, "falta: " + falta.join(", "));
  cierto(`${l.archivo}: cada tema cita su fuente`, l.temas.every((t) => t.fuente && t.fuente.length > 5));
  cierto(`${l.archivo}: cada caso trae situación, decisión y fuente`, l.casos.every((c) => c.situacion && c.decision && c.fuente));
  cierto(`${l.archivo}: cada ejercicio trae su respuesta`, l.ejercicios.every((e) => e.respuesta && e.respuesta.length > 10));
});

console.log("\n3. Las posiciones, contra chess.js");
const ESTADO = (g) => g.in_checkmate() ? "mate" : g.in_stalemate() ? "ahogado"
  : g.insufficient_material() ? "muerta" : g.in_check() ? "jaque" : "sigue";
const PALABRA = { mate: "Jaque mate", ahogado: "Ahogado", muerta: "Posición muerta", jaque: "Jaque, pero no mate", sigue: "No hay jaque" };
virtuales.flatMap((l) => l.ejercicios.filter((e) => e.fen)).forEach((e) => {
  const g = new Chess();
  const valida = g.validate_fen(e.fen).valid && g.load(e.fen);
  cierto(`FEN legal: ${e.fen}`, valida);
  if (!valida) return;
  const estado = ESTADO(g);
  cierto(`  el estado guardado (${e.estado}) es el que calcula chess.js (${estado})`, e.estado === estado);
  cierto("  la respuesta dice lo mismo", e.respuesta.startsWith(PALABRA[estado]), e.respuesta);
});

console.log("\n4. El texto de los PDF existe en las fuentes base");
const malos = new Set();
(function recorrer(x) {
  if (typeof x === "string") { for (const ch of x) if (!/[\u0000-ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(ch)) malos.add(ch); }
  else if (Array.isArray(x)) x.forEach(recorrer);
  else if (x && typeof x === "object") Object.entries(x).forEach(([k, v]) => { if (k !== "emoji") recorrer(v); });
})(curso);
cierto("sin caracteres que reportlab cambia por otros", malos.size === 0, "encontrados: " + [...malos].join(" "));

console.log("\n5. Lo generado está al día");
const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("gen", sys.argv[1])
gen = importlib.util.module_from_spec(spec); spec.loader.exec_module(gen)
curso = json.load(open(gen.DATOS, encoding="utf-8")); gen.numerar(curso["bloques"])
sys.stdout.write(gen.protegido(curso))`;
const esperado = execFileSync("python3", ["-c", py, path.join(__dirname, "curso-generar-formacion.py")], { encoding: "utf8" });
const fragmento = fs.readFileSync(path.join(RAIZ, "cursos", "protegido", "formacion-ajedrez.html"), "utf8");
cierto("cursos/protegido/formacion-ajedrez.html es lo que arma hoy el generador (si no: python3 herramientas/curso-generar-formacion.py)",
  fragmento === esperado);
cierto("el fragmento ya no habla de 8 horas presenciales", !/8 horas/.test(fragmento));

const leerPdf = (f) => execFileSync("python3", ["-c",
  "import sys, pypdf; print('\\n'.join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))", f], { encoding: "utf8" });
const sinEspacios = (t) => t.replace(/\s+/g, "");
virtuales.forEach((l) => {
  const material = sinEspacios(leerPdf(path.join(RECURSOS, l.archivo + "-material.pdf")));
  cierto(`${l.archivo}-material.pdf trae el cronograma, los casos y los ejercicios resueltos`,
    material.includes("CRONOGRAMA") && material.includes(sinEspacios(l.casos[0].titulo)) && material.includes("EJERCICIOSRESUELTOS"));
  const ejercicios = sinEspacios(leerPdf(path.join(RECURSOS, l.archivo + "-ejercicios.pdf")));
  const ultimo = l.ejercicios[l.ejercicios.length - 1].enunciado.slice(0, 40);
  cierto(`${l.archivo}-ejercicios.pdf trae los ejercicios de la sesión`, ejercicios.includes(sinEspacios(ultimo)));
  cierto(`${l.archivo}-ejercicios.pdf no trae las respuestas`, !ejercicios.includes("Respuesta:"));
  cierto(`${l.archivo}.pptx existe`, fs.existsSync(path.join(RECURSOS, l.archivo + ".pptx")));
});

console.log("\n6. Las presentaciones de la clase en vivo y la guía rápida");
const modClase = fs.readFileSync(path.join(RAIZ, "js", "clase-presentacion.js"), "utf8");
virtuales.forEach((l) => {
  const deck = "formacion-ajedrez/clase-" + String(lecciones.indexOf(l) + 1).padStart(2, "0");
  const dir = path.join(RECURSOS, "presentaciones", deck.split("/")[1]);
  const json = path.join(dir, "diapositivas.json");
  cierto(`${l.archivo}: tiene su presentación para la clase en vivo (${deck})`, fs.existsSync(json));
  cierto(`${l.archivo}: y se ofrece en la clase`, modClase.includes('deck: "' + deck + '"'));
  if (l.presentacion_clase === "propia" || !fs.existsSync(json)) return;
  const d = JSON.parse(fs.readFileSync(json, "utf8")).diapositivas;
  cierto(`${l.archivo}: la presentación de clase trae los casos de la sesión`,
    l.casos.every((c) => d.some((x) => x.texto.includes(c.situacion.slice(0, 40)))));
  const fens = l.ejercicios.filter((e) => e.fen).map((e) => e.fen);
  cierto(`${l.archivo}: y sus posiciones, para mandarlas al tablero`,
    fens.every((f) => d.some((x) => (x.posiciones || []).some((p) => p.fen === f))));
});
const guia = sinEspacios(leerPdf(path.join(RECURSOS, "guia-rapida-arbitro-jde.pdf")));
cierto("la guía rápida existe y dice que la Regional se juega a ritmo rápido (A.1)",
  guia.includes(sinEspacios("Rápida (A.1)")) && guia.includes(sinEspacios("Normativa PJDE 2026")));
cierto("la Sesión 1 la ofrece para bajar", fragmento.includes("guia-rapida-arbitro-jde.pdf"));

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
