#!/usr/bin/env node
/* Los tramos sin clase de una grabación, medidos en su audio.
 *
 *   node herramientas/grabaciones-silencios.js <archivo o id de YouTube> …
 *        [--umbral -30] [--minimo 30] [--juntar 60] [--navegador chrome]
 *
 * Para cada grabación busca los silencios largos (recesos, esperas, ratos en
 * que solo hablaban los participantes y su micrófono no quedó grabado) con el
 * `silencedetect` de ffmpeg, y escribe los tramos en segundos del video, listos
 * para marcarlos como «sin clase» (ver «Lo que no es clase no se le exige a
 * nadie» en docs/decisiones/paneles.md). Así todas las grabaciones se miden con
 * la MISMA regla, en vez de tramos anotados a ojo en unas sí y en otras no.
 *
 * Por qué así:
 *   · Se corre en la computadora del dueño: desde el contenedor de Claude,
 *     YouTube pide confirmar que no es un robot, y los originales de Teams
 *     están allá. Con un id de YouTube baja SOLO el audio con yt-dlp, con la
 *     sesión del navegador (`--navegador`, chrome por omisión), a una carpeta
 *     temporal que borra al terminar; con un archivo, lo lee directo.
 *     En Windows, yt-dlp no puede leer la sesión del Chrome nuevo («Could not
 *     copy Chrome cookie database»): ahí se bajan antes los audios sin sesión
 *     (yt-dlp -f bestaudio -o "%(id)s.%(ext)s" <ids>) y se le dan los
 *     archivos.
 *   · El original de Teams y el video de YouTube duran lo mismo (ver
 *     video-con-fondo.js: la duración no cambia a propósito), así que los
 *     segundos sirven para los dos.
 *   · Umbral −30 dB, 30 s como mínimo, y los pedazos a menos de 60 s entre sí
 *     se juntan: un silencio más corto es una pausa de quien expone, no un
 *     tramo sin clase, y un receso sale cortado en pedacitos por cada ruido
 *     de un segundo. Con −40 dB (lo primero que se probó, el 17/11/2026) no
 *     salían los silencios en que hablaban los participantes, que tienen el
 *     ruido de fondo del micrófono de quien expone; con −30 dB salieron los
 *     recesos donde las notas de los subtítulos dicen. Se pueden cambiar,
 *     pero para que sea parejo, con los mismos valores en todas.
 *   · Mide silencio, no «falta de clase»: una conversación informal en un
 *     receso (como la Sesión I, 2:24:08-2:27:41) tiene sonido y no sale. Esos
 *     se agregan a mano, y se revisa la lista antes de marcarla.
 *
 * Solo pide ffmpeg (y yt-dlp para los ids de YouTube).
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function salir(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

const args = process.argv.slice(2);
const opcion = (nombre, porOmision) => {
  const i = args.indexOf("--" + nombre);
  if (i < 0) return porOmision;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const UMBRAL = Number(opcion("umbral", "-30"));
const MINIMO = Number(opcion("minimo", "30"));
const JUNTAR = Number(opcion("juntar", "60"));
const NAVEGADOR = opcion("navegador", "chrome");
if (!Number.isFinite(UMBRAL) || UMBRAL >= 0) salir("--umbral va en dB, negativo (por ejemplo -40)");
if (!Number.isFinite(MINIMO) || MINIMO < 5) salir("--minimo va en segundos, de 5 para arriba");
if (!Number.isFinite(JUNTAR) || JUNTAR < 0) salir("--juntar va en segundos, de 0 para arriba");
if (!args.length) salir("Uso: node herramientas/grabaciones-silencios.js <archivo o id de YouTube> … [--umbral -30] [--minimo 30] [--juntar 60] [--navegador chrome]");

const ID = /^[A-Za-z0-9_-]{11}$/;

function hms(seg) {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// Baja solo el audio de un video de YouTube a una carpeta temporal.
function bajarAudio(id, carpeta) {
  const r = spawnSync("yt-dlp", ["--cookies-from-browser", NAVEGADOR, "-f", "bestaudio", "-o", path.join(carpeta, "%(id)s.%(ext)s"),
    "--no-playlist", "https://www.youtube.com/watch?v=" + id], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.error) salir("No se encontró yt-dlp (en Windows: winget install yt-dlp.yt-dlp; si no, pip install yt-dlp)");
  if (r.status !== 0) salir("yt-dlp no pudo bajar el audio de " + id);
  const archivo = fs.readdirSync(carpeta).find((f) => f.startsWith(id + "."));
  if (!archivo) salir("yt-dlp terminó sin dejar el audio de " + id);
  return path.join(carpeta, archivo);
}

function duracionDe(archivo) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", archivo], { encoding: "utf8" });
  if (r.error) salir("No se encontró ffprobe (viene con ffmpeg)");
  return Math.round(Number(r.stdout.trim()));
}

// Los silencios de al menos MINIMO segundos, en segundos enteros hacia adentro
// (el borde dudoso queda como clase: es mejor exigir un segundo de más que
// regalar uno de clase).
function silencios(archivo) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", archivo, "-vn", "-af", `silencedetect=n=${UMBRAL}dB:d=${MINIMO}`, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) salir("No se encontró ffmpeg");
  const tramos = [];
  let desde = null;
  for (const linea of r.stderr.split("\n")) {
    const a = linea.match(/silence_start: ([\d.]+)/);
    if (a) desde = Number(a[1]);
    const b = linea.match(/silence_end: ([\d.]+)/);
    if (b && desde != null) {
      const d = Math.ceil(desde), h = Math.floor(Number(b[1]));
      if (h - d >= MINIMO) tramos.push([d, h]);
      desde = null;
    }
  }
  // Un receso sale cortado por cada ruido corto: lo que queda a menos de
  // JUNTAR segundos del anterior va en el mismo tramo.
  const juntos = [];
  for (const [a, b] of tramos) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && a - ultimo[1] <= JUNTAR) ultimo[1] = Math.max(ultimo[1], b);
    else juntos.push([a, b]);
  }
  return juntos;
}

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "silencios-"));
const resultado = {};
try {
  for (const cual of args) {
    const archivo = ID.test(cual) && !fs.existsSync(cual) ? bajarAudio(cual, temporal) : cual;
    if (!fs.existsSync(archivo)) salir("No existe " + cual);
    const dura = duracionDe(archivo);
    const tramos = silencios(archivo);
    const total = tramos.reduce((s, [a, b]) => s + b - a, 0);
    console.log(`\n${cual} · dura ${hms(dura)} · ${tramos.length} silencio(s), ${hms(total)} en total`);
    tramos.forEach(([a, b]) => console.log(`  ${hms(a)} a ${hms(b)}  (${b - a} s)`));
    resultado[cual] = { duracion: dura, sin_clase: tramos };
  }
} finally {
  fs.rmSync(temporal, { recursive: true, force: true });
}
console.log(`\nCon umbral ${UMBRAL} dB, ${MINIMO} s como mínimo y juntando lo que queda a ${JUNTAR} s o menos. Para pasárselo a Claude, copia esto:\n`);
console.log(JSON.stringify(resultado));


/*! rev bfb5bbb0d2d82f9f */
