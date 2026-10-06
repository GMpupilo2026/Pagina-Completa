/* ===== Las versiones de «Ponte a prueba» como cuestionarios =====
 *
 * Cada prueba del libro sale en tres versiones (A, B y C) para usar como
 * cuestionario —en la clase en vivo, al estilo Kahoot, o como tarea—, así un
 * grupo no recibe el mismo examen que otro y repetirlo no es repetir lo mismo:
 *
 *   - las 30 posiciones de la prueba se reparten en tres tandas de 10 que NO se
 *     repiten, cada una con la misma mezcla de dificultad (se ordenan por
 *     dificultad y se reparten de a una, rotando);
 *   - cada posición trae sus dos preguntas, como en el libro: cuánto ganan las
 *     blancas y cuál es la mejor jugada. 20 preguntas por versión;
 *   - las opciones de la jugada se barajan distinto en cada versión.
 *
 * Son cuestionarios LISTOS (sin dueño) con `material = 'ponte-a-prueba'`: la
 * base solo se los deja leer a los profesores que pueden bajar ese material
 * (ver «Los materiales de clase» en docs/decisiones/cursos-y-material.md).
 *
 * Sale herramientas/cuestionarios/ponte-a-prueba.sql, que se aplica en el editor
 * SQL de Supabase. Se puede aplicar las veces que haga falta: actualiza por
 * título, no borra, y así no rompe las tareas que ya apuntan a una versión.
 *
 *   node herramientas/libro-examen-cuestionarios.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const { banco } = require("./lib/libro-examen-comun.js");
const MATERIAL = "ponte-a-prueba";
const VERSIONES = ["A", "B", "C"];
const TIEMPO_EVALUACION = 30;
const TIEMPO_JUGADA = 60;

/* Un sorteo que se repite: la misma semilla da el mismo orden, así aplicar el
   SQL dos veces deja las versiones iguales. */
function azar(texto) {
  let s = 2166136261;
  for (const c of texto) s = Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function barajar(lista, rnd) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nivelDe(eloMedio) {
  return eloMedio < 1000 ? "inicial" : eloMedio < 1400 ? "intermedio" : "avanzado";
}

function preguntasDe(it, LIBRO, rnd) {
  const antes = `Las negras jugaron …${it.ultima}.`;
  const evaluacion = {
    texto: `${antes} Con la mejor jugada, ¿cuánto ganan las blancas?`,
    opciones: LIBRO.EVALUACION_CORTA.slice(),
    correcta: it.evaluacion.correcta,
    tiempo: TIEMPO_EVALUACION,
    fen: it.fen,
  };
  const mezcladas = barajar(it.jugada.opciones.map((t, i) => ({ t, i })), rnd);
  const jugada = {
    texto: `${antes} ¿Cuál es la mejor jugada de las blancas?`,
    opciones: mezcladas.map((o) => o.t),
    correcta: mezcladas.findIndex((o) => o.i === it.jugada.correcta),
    tiempo: TIEMPO_JUGADA,
    fen: it.fen,
  };
  return [evaluacion, jugada];
}

function cuestionarios() {
  const { LIBRO, ITEMS } = banco();
  const salida = [];
  for (let p = 1; p <= LIBRO.PRUEBAS; p++) {
    const delas = ITEMS.filter((i) => i.prueba === p).sort((a, b) => a.elo - b.elo || (a.id < b.id ? -1 : 1));
    const tandas = VERSIONES.map(() => []);
    delas.forEach((it, i) => tandas[(i % VERSIONES.length + Math.floor(i / VERSIONES.length)) % VERSIONES.length].push(it));
    tandas.forEach((tanda, v) => {
      const titulo = `${LIBRO.TITULO} · Prueba ${p} · versión ${VERSIONES[v]}`;
      const rnd = azar(titulo);
      const eloMedio = tanda.reduce((s, it) => s + it.elo, 0) / tanda.length;
      salida.push({
        titulo,
        prueba: p,
        version: VERSIONES[v],
        nivel: nivelDe(eloMedio),
        posiciones: tanda.map((it) => it.id),
        preguntas: tanda.flatMap((it) => preguntasDe(it, LIBRO, rnd)),
      });
    });
  }
  return salida;
}

function sql() {
  const filas = cuestionarios().map((c) =>
    `($q$${c.titulo}$q$, '${c.nivel}', $q$${JSON.stringify(c.preguntas)}$q$::jsonb)`);
  return [
    "-- Generado por herramientas/libro-examen-cuestionarios.js: no se edita a mano.",
    "-- Las versiones de «Ponte a prueba» como cuestionarios listos del material.",
    "-- Actualiza por título y no borra: las tareas que ya apuntan a una versión siguen.",
    "insert into public.cuestionarios (titulo, nivel, listo, profesor_id, material, preguntas)",
    "select d.titulo, d.nivel, true, null, '" + MATERIAL + "', d.preguntas from (values",
    filas.join(",\n"),
    ") as d(titulo, nivel, preguntas)",
    "on conflict (titulo) where listo do update",
    "  set preguntas = excluded.preguntas, nivel = excluded.nivel, material = excluded.material, updated_at = now();",
    "",
  ].join("\n");
}

module.exports = { cuestionarios, sql, MATERIAL, VERSIONES };

if (require.main === module) {
  const dir = path.join(__dirname, "cuestionarios");
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, "ponte-a-prueba.sql");
  fs.writeFileSync(destino, sql());
  const cs = cuestionarios();
  console.log(`${path.relative(RAIZ, destino)}: ${cs.length} cuestionarios, ${cs.reduce((a, c) => a + c.preguntas.length, 0)} preguntas.`);
}
