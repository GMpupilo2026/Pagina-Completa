#!/usr/bin/env node
/* Arma la lista de prácticas de «Formación Ajedrez» para la clase en vivo:
 * cursos/recursos/formacion-ajedrez/practicas.json.
 *
 *   node herramientas/formacion-practicas.js            la escribe
 *   node herramientas/formacion-practicas.js --revisar  dice si está al día (sin escribir)
 *
 * Cada sesión virtual tiene, entre sus láminas, las de la práctica: la que la
 * presenta («Práctica · …»), «Ejercicio k de N» y, en la Sesión 1, las
 * estaciones de las salas de trabajo. Este script las saca de la
 * diapositivas.json de cada sesión (las mismas láminas que el profe proyecta),
 * y js/clase-practica.js se las manda a los alumnos para que cada uno las pase
 * a su ritmo y marque cuáles ya hizo. Ver «Las prácticas de Formación Ajedrez
 * en la clase» en docs/decisiones/clase-en-vivo.md.
 *
 * Nunca entran las láminas de respuestas, del quiz ni de la tarea: la lámina
 * de una práctica se le entrega al alumno entera, y una respuesta ahí sería
 * adelantársela. verificar-formacion-practicas.js lo comprueba.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CURSO = "formacion-ajedrez";
const CARPETA = path.join(RAIZ, "cursos", "recursos", CURSO);
const SALIDA = path.join(CARPETA, "practicas.json");

// Lo que es de la práctica y lo que nunca se le manda al alumno.
const ES_PRACTICA = [/^Práctica\b/, /^Ejercicio \d+ de \d+$/, /^Estación \d+:/];
const NUNCA = /respuestas|^Quiz\b|^Tarea\b|^Receso$/i;

function armar() {
  const sesiones = JSON.parse(fs.readFileSync(path.join(CARPETA, "sesiones.json"), "utf8")).sesiones;
  const practicas = [];
  for (const s of sesiones) {
    if (!s.presentacion) continue;
    const clase = s.presentacion.split("/")[1];
    const diapos = JSON.parse(fs.readFileSync(path.join(CARPETA, "presentaciones", clase, "diapositivas.json"), "utf8")).diapositivas;
    const laminas = [];
    diapos.forEach((d, i) => {
      if (NUNCA.test(d.titulo) || !ES_PRACTICA.some((r) => r.test(d.titulo))) return;
      laminas.push({ n: i + 1, titulo: d.titulo });
    });
    if (!laminas.length) continue;
    practicas.push({ n: s.n, deck: s.presentacion, titulo: "Sesión " + s.n + ": " + s.titulo, laminas });
  }
  return {
    _comentario: "Generado por herramientas/formacion-practicas.js: no se edita a mano.",
    curso: CURSO,
    practicas,
  };
}

if (require.main === module) {
  const texto = JSON.stringify(armar(), null, 2) + "\n";
  if (process.argv.includes("--revisar")) {
    const hay = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, "utf8") : "";
    process.exit(hay === texto ? 0 : 1);
  }
  fs.writeFileSync(SALIDA, texto);
  console.log("Escrito " + path.relative(RAIZ, SALIDA));
}
module.exports = { armar, SALIDA, ES_PRACTICA, NUNCA };
