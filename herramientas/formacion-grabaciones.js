#!/usr/bin/env node
/* Las grabaciones de Formación Ajedrez con capítulos y su lámina.
 *
 * Lee herramientas/datos/formacion-grabaciones.json (a mano: en qué segundo de
 * cada grabación empieza cada tema y qué lámina se estaba explicando) y
 * escribe, junto a la presentación de cada sesión,
 * cursos/recursos/formacion-ajedrez/presentaciones/clase-NN/grabacion.json,
 * que lee el modo cine del panel de taller (js/calendario-taller.js, ver «La
 * grabación con capítulos y su lámina» en docs/decisiones/paneles.md).
 *
 * Por qué así:
 *   · La fuente va en herramientas/datos/ (no se publica) y el archivo
 *     publicado lleva SOLO lo que la página pinta: la duración, los capítulos y
 *     la línea de láminas. Ni el id de YouTube (un video no listado lo ve
 *     cualquiera que tenga el id, y la carpeta del curso la sirve el worker a
 *     toda cuenta con acceso a la Academia) ni las notas de cómo se sacó.
 *   · Los minutos salieron de los subtítulos de cada video, leídos de punta a
 *     punta: la frase en que se pasa a la lámina o se empieza el tema. La
 *     imagen del video no se pudo bajar (YouTube contesta 403 al contenedor).
 *   · La duración va en el archivo y la página la compara con la de la
 *     grabación: si se sube otro video, los minutos ya no le sirven y no se
 *     pinta nada, en vez de mandar a la gente a cualquier parte.
 *   · Las aclaraciones del profe (lo que el video dice mal, con la regla
 *     buena y su fuente) salen con el avatar del profe Oscar en el minuto en
 *     que se dice; cada una lleva su fuente, que se comprobó contra las
 *     láminas y el banco ya revisado.
 *   · Falla si algo no cuadra (un capítulo fuera del video, fuera de orden,
 *     una lámina que no existe) en vez de escribir un archivo que se ve bien y
 *     lleva a otro lado.
 *
 *   node herramientas/formacion-grabaciones.js            escribe los archivos
 *   node herramientas/formacion-grabaciones.js --comprobar  falla si no están al día
 *   node herramientas/formacion-grabaciones.js --sql        las correctas, para la base
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.join(__dirname, "..");
const FUENTE = path.join(__dirname, "datos", "formacion-grabaciones.json");
const PRESENTACIONES = path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez", "presentaciones");
const BANCO = path.join(__dirname, "cursos", "formacion-ajedrez-kahoot.json");
const COMENTARIO = "Generado por herramientas/formacion-grabaciones.js desde herramientas/datos/formacion-grabaciones.json: no se edita a mano.";

function fallar(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

const entero = (n) => Number.isInteger(n) && n >= 0;

/* Lo que va publicado de una sesión, comprobado. Devuelve el objeto. */
function armar(s) {
  const donde = "la grabación de " + s.presentacion;
  if (!/^clase-\d\d$/.test(s.presentacion || "")) fallar(`presentación con nombre raro: ${s.presentacion}`);
  const dj = path.join(PRESENTACIONES, s.presentacion, "diapositivas.json");
  if (!fs.existsSync(dj)) fallar(`${donde}: no existe ${path.relative(RAIZ, dj)}`);
  const laminas = JSON.parse(fs.readFileSync(dj, "utf8")).diapositivas;
  if (!entero(s.duracion) || s.duracion < 60) fallar(`${donde}: la duración tiene que ser un entero de segundos`);
  const enOrden = (lista, que) => {
    if (!Array.isArray(lista) || !lista.length) fallar(`${donde}: sin ${que}`);
    lista.forEach((x, i) => {
      if (!x || !entero(x.t) || x.t >= s.duracion) fallar(`${donde}: ${que} n.º ${i + 1} fuera del video (t = ${x && x.t})`);
      if (i && x.t <= lista[i - 1].t) fallar(`${donde}: ${que} n.º ${i + 1} no va después del anterior (${lista[i - 1].t} → ${x.t})`);
    });
  };
  enOrden(s.capitulos, "capítulo");
  enOrden(s.laminas, "lámina");
  if (s.capitulos[0].t !== 0) fallar(`${donde}: el primer capítulo tiene que empezar en 0`);
  s.capitulos.forEach((c, i) => {
    if (typeof c.titulo !== "string" || !c.titulo.trim() || c.titulo.length > 60) fallar(`${donde}: el capítulo n.º ${i + 1} necesita un título de hasta 60 caracteres`);
  });
  // Una entrada puede ser de la presentación de OTRA sesión (`clase`): la
  // Sesión II empezó terminando lo que quedó pendiente de la I, con sus láminas.
  const decks = { [s.presentacion]: laminas };
  const deDeck = (clase) => {
    if (!decks[clase]) {
      const otro = path.join(PRESENTACIONES, clase, "diapositivas.json");
      if (!/^clase-\d\d$/.test(clase) || !fs.existsSync(otro)) fallar(`${donde}: no existe la presentación ${clase}`);
      decks[clase] = JSON.parse(fs.readFileSync(otro, "utf8")).diapositivas;
    }
    return decks[clase];
  };
  s.laminas.forEach((x, i) => {
    if (x.clase === s.presentacion) delete x.clase;   // la propia no se escribe
    const lista = deDeck(x.clase || s.presentacion);
    if (!Number.isInteger(x.lamina) || !lista[x.lamina - 1]) fallar(`${donde}: la lámina ${x.lamina} (n.º ${i + 1} de la línea) no existe en ${x.clase || s.presentacion} (tiene ${lista.length})`);
    const prev = s.laminas[i - 1];
    if (prev && x.lamina === prev.lamina && (x.clase || "") === (prev.clase || "")) fallar(`${donde}: la lámina ${x.lamina} se repite seguida en ${x.t}: sobra una entrada`);
  });
  // Las aclaraciones del profe: lo que el video dice mal, corregido con su
  // fuente, con un dibujo del avatar del profe Oscar (js/avatar-profe-oscar.js).
  const avatares = new Set([...fs.readFileSync(path.join(RAIZ, "js", "avatar-profe-oscar.js"), "utf8").matchAll(/\{ id: "([a-z0-9-]+)"/g)].map((m) => m[1]));
  const aclaraciones = s.aclaraciones || [];
  if (aclaraciones.length) enOrden(aclaraciones, "aclaración");
  aclaraciones.forEach((a, i) => {
    const n = `${donde}: la aclaración n.º ${i + 1}`;
    if (!avatares.has(a.avatar)) fallar(`${n} usa un avatar que no existe: ${a.avatar}`);
    if (typeof a.titulo !== "string" || !a.titulo.trim() || a.titulo.length > 60) fallar(`${n} necesita un título de hasta 60 caracteres`);
    if (typeof a.texto !== "string" || a.texto.length < 20 || a.texto.length > 320) fallar(`${n} necesita un texto de 20 a 320 caracteres`);
    if (typeof a.fuente !== "string" || !a.fuente.trim() || a.fuente.length > 80) fallar(`${n} necesita su fuente (hasta 80 caracteres): ninguna se inventa`);
  });
  const preguntas = preguntasDe(s, donde, enOrden);
  return {
    _comentario: COMENTARIO,
    duracion: s.duracion,
    capitulos: s.capitulos.map((c) => ({ t: c.t, titulo: c.titulo.trim() })),
    laminas: s.laminas.map((x) => (x.clase ? { t: x.t, lamina: x.lamina, clase: x.clase } : { t: x.t, lamina: x.lamina })),
    aclaraciones: aclaraciones.map((a) => ({ t: a.t, avatar: a.avatar, titulo: a.titulo.trim(), texto: a.texto.trim(), fuente: a.fuente.trim() })),
    preguntas: preguntas.map((p) => Object.assign({ t: p.t, n: p.n, texto: p.texto, opciones: p.opciones }, p.fen ? { fen: p.fen } : {}, { fuente: p.fuente })),
  };
}

/* Las preguntas que pausan el video. Salen del banco ya revisado
   (herramientas/cursos/formacion-ajedrez-kahoot.json, que no se publica): la
   fuente solo dice en qué segundo va cada una y cuál del banco es. El lugar de
   la correcta se reparte parejo entre A, B, C y D (ordenadas por la huella del
   texto, como formacion-cuestionarios.js), y la correcta NO va en el archivo
   publicado: la sabe la base (grabacion_preguntas), que corrige. `n` es el
   número de la pregunta en su video (1, 2, 3… en orden de tiempo). */
let banco = null;
const huella = (t) => crypto.createHash("sha1").update(t).digest("hex");
function preguntasDe(s, donde, enOrden) {
  const lista = s.preguntas || [];
  if (!lista.length) return [];
  enOrden(lista, "pregunta");
  banco = banco || JSON.parse(fs.readFileSync(BANCO, "utf8"));
  const vistas = new Set();
  const desdeBanco = lista.map((q, i) => {
    const n = `${donde}: la pregunta n.º ${i + 1}`;
    const grupo = banco[q.banco] && banco[q.banco][q.k];
    const p = grupo && grupo.preguntas[q.i];
    if (!p) fallar(`${n} no existe en el banco (${q.banco}[${q.k}].preguntas[${q.i}])`);
    const clave = q.banco + "/" + q.k + "/" + q.i;
    if (vistas.has(clave)) fallar(`${n} se repite (${clave})`);
    vistas.add(clave);
    if (!Array.isArray(p.distractores) || p.distractores.length !== 3) fallar(`${n} necesita tres distractores en el banco`);
    const todas = [p.correcta].concat(p.distractores);
    if (new Set(todas).size !== 4) fallar(`${n} tiene opciones repetidas`);
    return { t: q.t, n: i + 1, p };
  });
  const lugar = new Map();
  desdeBanco.map((x) => x.p.texto).sort((a, b) => (huella(a) < huella(b) ? -1 : 1)).forEach((t, i) => lugar.set(t, i % 4));
  return desdeBanco.map(({ t, n, p }) => {
    const correcta = lugar.get(p.texto);
    const opciones = p.distractores.slice();
    opciones.splice(correcta, 0, p.correcta);
    return { t, n, texto: p.texto, opciones, correcta, fen: p.fen || null, fuente: p.fuente || "" };
  });
}

/* Lo que sabe la base: en qué lugar está la correcta de cada pregunta de cada
   video. Se aplica como migración (supabase/migraciones/) y
   verificar-grabacion-interactiva.js compara que la última diga esto mismo. */
function claves(fuente) {
  const filas = [];
  for (const s of fuente.sesiones || []) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(s.youtube_id || "")) fallar(`${s.presentacion}: falta el id de YouTube en la fuente`);
    preguntasDe(s, "la grabación de " + s.presentacion, () => {}).forEach((p) => filas.push({ youtube_id: s.youtube_id, n: p.n, correcta: p.correcta }));
  }
  return filas;
}

function sql(fuente) {
  const filas = claves(fuente);
  const ids = [...new Set(filas.map((f) => f.youtube_id))];
  return "-- Generado por node herramientas/formacion-grabaciones.js --sql: no se edita a mano.\n"
    + "insert into public.grabacion_preguntas (youtube_id, n, correcta) values\n"
    + filas.map((f) => `  ('${f.youtube_id}', ${f.n}, ${f.correcta})`).join(",\n")
    + "\non conflict (youtube_id, n) do update set correcta = excluded.correcta;\n"
    + ids.map((id) => `delete from public.grabacion_preguntas where youtube_id = '${id}' and n > ${filas.filter((f) => f.youtube_id === id).length};`).join("\n") + "\n";
}

function texto(obj) {
  return JSON.stringify(obj, null, 1) + "\n";
}

function main() {
  const comprobar = process.argv.includes("--comprobar");
  const fuente = JSON.parse(fs.readFileSync(FUENTE, "utf8"));
  if (process.argv.includes("--sql")) { process.stdout.write(sql(fuente)); return; }
  const vistas = new Set();
  let viejos = 0;
  for (const s of fuente.sesiones || []) {
    if (vistas.has(s.presentacion)) fallar(`${s.presentacion} está dos veces en la fuente`);
    vistas.add(s.presentacion);
    const destino = path.join(PRESENTACIONES, s.presentacion, "grabacion.json");
    const nuevo = texto(armar(s));
    const actual = fs.existsSync(destino) ? fs.readFileSync(destino, "utf8") : null;
    if (actual === nuevo) continue;
    if (comprobar) { console.error(`✗ ${path.relative(RAIZ, destino)} no está al día: correr node herramientas/formacion-grabaciones.js`); viejos++; continue; }
    fs.writeFileSync(destino, nuevo);
    console.log("✓ escrito " + path.relative(RAIZ, destino));
  }
  // Un grabacion.json que ya no tiene fuente quedaría pintando capítulos viejos.
  for (const carpeta of fs.readdirSync(PRESENTACIONES)) {
    if (vistas.has(carpeta)) continue;
    const sobra = path.join(PRESENTACIONES, carpeta, "grabacion.json");
    if (fs.existsSync(sobra)) fallar(`${path.relative(RAIZ, sobra)} no tiene fuente: bórralo o agrégalo a la fuente`);
  }
  if (viejos) process.exit(1);
  if (comprobar) console.log("✓ los archivos de las grabaciones están al día");
}

if (require.main === module) main();
module.exports = { armar, claves, sql };

/*! rev bfb5bbb0d2d82f9f */
