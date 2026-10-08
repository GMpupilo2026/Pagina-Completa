/* ===== Los cuestionarios de «Formación Ajedrez», sesión por sesión =====
 *
 * La fuente es herramientas/cursos/formacion-ajedrez-kahoot.json: cada pregunta
 * con su correcta aparte y tres distractores. Este script reparte el lugar de la
 * correcta PAREJO entre A, B, C y D dentro de cada sesión (no al azar: con 22
 * preguntas el azar deja una letra con ocho y la sala aprende «es la C»). El
 * orden del reparto sale del texto de cada pregunta, así que correrlo dos veces
 * da lo mismo.
 *
 * Son cuestionarios LISTOS (sin dueño) con `material = 'formacion-ajedrez'`: la
 * base solo se los deja leer a quien administra y a quien tenga el curso
 * compartido (ver «Los materiales de clase» en docs/decisiones/cursos-y-material.md).
 *
 * Sale herramientas/cuestionarios/formacion-ajedrez.sql (no se commitea), que se
 * aplica en el editor SQL de Supabase o con execute_sql. Actualiza por título y
 * no borra, así no rompe una tarea que ya apunte a uno.
 *
 *   node herramientas/formacion-cuestionarios.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.join(__dirname, "..");
const FUENTE = path.join(__dirname, "cursos", "formacion-ajedrez-kahoot.json");

function fuente() {
  return JSON.parse(fs.readFileSync(FUENTE, "utf8"));
}

const huella = (t) => crypto.createHash("sha1").update(t).digest("hex");

function armarSesion(s) {
  // Se ordenan por la huella del texto y se reparte A, B, C, D, A, B…
  const lugar = new Map();
  s.preguntas.map((p) => p.texto).sort((a, b) => (huella(a) < huella(b) ? -1 : 1))
    .forEach((t, i) => lugar.set(t, i % 4));
  return {
    sesion: s.sesion,
    titulo: s.titulo,
    preguntas: s.preguntas.map((p) => {
      const correcta = lugar.get(p.texto);
      const opciones = p.distractores.slice();
      opciones.splice(correcta, 0, p.correcta);
      return { texto: p.texto, opciones, correcta, tiempo: p.tiempo, fen: p.fen || null };
    }),
  };
}

function cuestionarios() {
  return fuente().sesiones.map(armarSesion);
}

function sql() {
  const { material } = fuente();
  const filas = cuestionarios().map((c) => `($q$${c.titulo}$q$, $q$${JSON.stringify(c.preguntas)}$q$::jsonb)`);
  return [
    "-- Generado por herramientas/formacion-cuestionarios.js: no se edita a mano.",
    "-- Los cuestionarios de «Formación Ajedrez», listos del material del curso.",
    "-- Actualiza por título y no borra: las tareas que ya apuntan a uno siguen.",
    "insert into public.cuestionarios (titulo, nivel, listo, profesor_id, material, preguntas)",
    "select d.titulo, null, true, null, '" + material + "', d.preguntas from (values",
    filas.join(",\n"),
    ") as d(titulo, preguntas)",
    "on conflict (titulo) where listo do update",
    "  set preguntas = excluded.preguntas, material = excluded.material, updated_at = now();",
    "",
  ].join("\n");
}

module.exports = { fuente, cuestionarios, sql };

if (require.main === module) {
  const dir = path.join(__dirname, "cuestionarios");
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, "formacion-ajedrez.sql");
  fs.writeFileSync(destino, sql());
  const cs = cuestionarios();
  console.log(`${path.relative(RAIZ, destino)}: ${cs.length} cuestionarios, ${cs.reduce((a, c) => a + c.preguntas.length, 0)} preguntas.`);
}
