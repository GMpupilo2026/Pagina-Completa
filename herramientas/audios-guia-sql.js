/* Revisa la guía de estudio de una clase (un .json) y escribe el SQL que la
   guarda en la base, para cargarla sin pasar por «Subir audios».

   Es la misma revisión que hace la página al subir una guía
   (AudiosGuia.leerGuia: las partidas se cortan en la primera jugada ilegal,
   nada pasa de su largo), y además se niega a seguir si:

   - un minuto (tema o partida) cae fuera de la clase,
   - un tema no trae su concepto o su cita (lo que se dijo justo ahí: con ella
     se vuelve a encontrar el minuto cuando llega la transcripción de Whisper
     con sus minutos),
   - una partida tenía jugadas que chess.js no aceptó (se cortaría callada),
   - el texto tiene voseo (verificar-voseo.py) o dice «horquilla».

   Las partidas se guardan sin publicar: el profe las oye y las publica.
   El SQL no borra nada (ver abajo): reemplaza por número.
   El texto de la clase (segmentos, transcripción) no se toca.

   Uso:  node herramientas/audios-guia-sql.js <guia.json> <id del audio> <duración en segundos>  > guia.sql
   Ver «Las guías armadas sin los minutos de Whisper» en docs/decisiones/accesibilidad.md. */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const [archivo, audioId, durTexto] = process.argv.slice(2);
if (!archivo || !/^[0-9a-f-]{36}$/.test(audioId || "") || !(+durTexto > 0)) {
  console.error("Uso: node herramientas/audios-guia-sql.js <guia.json> <id del audio> <duración en segundos>");
  process.exit(2);
}
const duracion = +durTexto;

/* AudiosGuia y chess.js tal como los carga la página. */
function cargarGuia() {
  const window = {};
  const { Chess } = require(path.join(RAIZ, "node_modules", "chess.js"));
  const codigo = fs.readFileSync(path.join(RAIZ, "js", "audios-clase-guia.js"), "utf8");
  return new Function("window", "Chess", codigo + "\nreturn window.AudiosGuia;")(window, Chess);
}
const G = cargarGuia();

const obj = JSON.parse(fs.readFileSync(archivo, "utf8"));
const g = G.leerGuia(obj);
const fallas = [];

if (!g.resumen) fallas.push("no trae resumen");
if (g.indice.length < 4) fallas.push("trae " + g.indice.length + " temas (van de 6 a 12)");
g.indice.forEach((t) => {
  if (t.seg >= duracion) fallas.push("el tema «" + t.titulo + "» cae en el segundo " + t.seg + ", después del final (" + duracion + ")");
  if (!t.concepto) fallas.push("el tema «" + t.titulo + "» no trae concepto");
  if (!t.cita) fallas.push("el tema «" + t.titulo + "» no trae cita");
});
if (g.preguntas.length < 3) fallas.push("trae " + g.preguntas.length + " preguntas (van de 5 a 8)");
(Array.isArray(obj.partidas) ? obj.partidas : []).forEach((p) => {
  const dadas = String(Array.isArray(p.jugadas) ? p.jugadas.join(" ") : p.jugadas || "")
    .replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(Boolean);
  const buenas = G.jugadasLegales(dadas.join(" "));
  if (buenas.length !== dadas.length) {
    fallas.push("la partida «" + p.titulo + "» se corta en la jugada " + (buenas.length + 1) + " («" + dadas[buenas.length] + "»): chess.js no la acepta");
  }
  if (p.seg != null && +p.seg >= duracion) fallas.push("la partida «" + p.titulo + "» cae después del final");
});

/* El voseo, con la misma regla que verificar-voseo.py, sobre el texto. */
const texto = [g.resumen || ""].concat(
  g.indice.map((t) => t.titulo + " " + t.concepto),
  g.preguntas.map((q) => [q.pregunta].concat(q.opciones, q.explicacion || "").join(" ")),
  g.partidas.map((p) => p.titulo)).join("\n");
if (/horquilla/i.test(texto)) fallas.push("dice «horquilla»: en el sitio es «tenedor»");
const tmp = path.join(require("os").tmpdir(), "guia-voseo-" + process.pid + ".txt");
fs.writeFileSync(tmp, texto);
try {
  const salida = execFileSync("python3", ["-c",
    "import runpy,sys; m=runpy.run_path('herramientas/verificar-voseo.py', run_name='x'); [print(p) for p,_ in m['hallazgos'](sys.argv[1])]", tmp],
    { cwd: RAIZ, encoding: "utf8" }).trim();
  if (salida) fallas.push("tiene voseo: " + salida.split("\n").join(", "));
} finally { fs.unlinkSync(tmp); }

if (fallas.length) {
  console.error("✗ " + path.basename(archivo) + ":\n  - " + fallas.join("\n  - "));
  process.exit(1);
}

/* El SQL: con $guia$…$guia$ no hay que escapar comillas. */
const lit = (v) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s.includes("$guia$")) throw new Error("el texto trae $guia$");
  return "$guia$" + s + "$guia$";
};
const arr = (xs) => "array[" + xs.map(lit).join(", ") + "]::text[]";
const sql = [];
sql.push("begin;");
sql.push("update public.audios_clase set resumen = " + lit(g.resumen) + ", indice = " + lit(g.indice) + "::jsonb where id = '" + audioId + "';");
/* Sin delete: la herramienta de Supabase pide confirmar cada delete, y una
   carga sin nadie mirando se queda esperando. Se inserta o se reemplaza por
   número; si la guía vieja traía más preguntas o partidas, se quitan en
   «Subir audios» (que sí las cambia todas). */
g.preguntas.forEach((q) => {
  sql.push("insert into public.audios_clase_preguntas (audio_id, n, pregunta, opciones, correcta, explicacion) values ('" + audioId + "', "
    + q.n + ", " + lit(q.pregunta) + ", " + arr(q.opciones) + ", " + q.correcta + ", " + (q.explicacion ? lit(q.explicacion) : "null")
    + ") on conflict (audio_id, n) do update set pregunta = excluded.pregunta, opciones = excluded.opciones, correcta = excluded.correcta, explicacion = excluded.explicacion;");
});
g.partidas.forEach((p) => {
  sql.push("insert into public.audios_clase_partidas (audio_id, orden, seg, titulo, jugadas, revisada) values ('" + audioId + "', "
    + p.orden + ", " + (p.seg == null ? "null" : p.seg) + ", " + lit(p.titulo) + ", " + lit(p.jugadas)
    + ", false) on conflict (audio_id, orden) do update set seg = excluded.seg, titulo = excluded.titulo, jugadas = excluded.jugadas, revisada = false;");
});
sql.push("commit;");
process.stdout.write(sql.join("\n") + "\n");
console.error("✓ " + path.basename(archivo) + ": " + g.indice.length + " temas, " + g.preguntas.length + " preguntas, "
  + g.partidas.length + " partidas (sin publicar)" + (Array.isArray(obj.momentos) ? ", " + obj.momentos.length + " momentos para ejercicios" : "") + ".");

/*! rev bfb5bbb0d2d82f9f */
