/* Lo que comparten las sesiones intensivas (herramientas/sesion-*-intensiva.js):
 * leer la posición y la línea de su banco, armar el plan de clase con su
 * chuleta y su nota «El cálculo», y escribir el JSON y el SQL.
 *
 * Cada sesión es un archivo con sus diez ejercicios, sus textos y sus umbrales
 * (lo que cuenta como «gana» y como «no gana» para Stockfish). El motor
 * (herramientas/sesion-intensiva-motor.js) y el verificador
 * (verificar-sesiones-intensivas.js) las encuentran solas por el nombre.
 *
 * NINGUNA POSICIÓN SE INVENTA: cada ejercicio dice de qué banco sale, con un
 * prefijo, y la FEN y la línea se leen de ahí:
 *   mapa:F3-5     «El mapa de los finales» (verificado con Stockfish 16)
 *   gp:GP-6       «Ganar con poco» (ejercicios de Lichess, comprobados)
 *   ucd:ej212-r0  «Una clase al día» (partidas leídas jugada a jugada,
 *                 ejercicios contrastados con Stockfish 16)
 *   lt:2mxHX      los ejercicios de Lichess de Entrenamiento
 *                 (entreno/data/temas.json, base abierta CC0)
 *   ucdp:ml001-1@18  una PARTIDA de «Una clase al día», después de sus
 *                 primeras 18 medias jugadas: la línea es la que siguió en la
 *                 partida. Trae además su apertura y las jugadas que llevaron
 *                 a la posición (para la sesión de aperturas)
 *
 * Cada ejercicio:
 *   banco      de dónde sale, con su prefijo
 *   saltar     jugadas de la línea del banco que se juegan antes de dar la
 *              posición (Lucena empieza con jugada negra; se da después)
 *   hasta      cuántas jugadas de la línea del banco se usan (si es larga)
 *   extra      jugadas que siguen a las del banco (de Stockfish)
 *   unicas     jugadas de la línea (contadas desde 0) que son la ÚNICA buena
 *   tambien    otras jugadas que la explicación dice que también ganan
 *   trampas    { jugada (índice en la línea), san, refuta, resultado }: la
 *              jugada tentadora en lugar de la de la línea, y cómo se contesta.
 *              Si `jugada` es del rival, es SU error («castiga»: la
 *              refutación deja al que tiene la ventaja todavía mejor)
 *   umbral     { gana, noGana } propios, si los de la sesión no le sirven
 *              (una ventaja más chica que las demás, pero igual de única)
 *   minutos    tiempo de cálculo en silencio
 *   explicacion  la nota «El cálculo», con la notación de acá
 * Todo SAN va en inglés (lo que entiende chess.js) y se traduce al escribirse.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const { RAIZ, Chess, fenUsable, leerJSON, aEspanol, recorta } = require("./planes-banco");

/* La nota de lib/planes-banco.js aplana los saltos de línea (es para una
   frase). Acá cada nota es un paso a paso, y planes.html y la clase en vivo
   la muestran con pre-wrap: se guardan tal cual, como en los proyectos. La
   base no deja más de 2000 caracteres, y eso lo exige el verificador. */
const nota = (titulo, texto) => ({ tipo: "nota", titulo: recorta(titulo, 200), nota: String(texto).trim() });

/* Los planes son de quien administra, como los de arranque y los de los
   proyectos: un plan es del profesor que lo escribió (la RLS no deja firmar
   por otro). Desde planes.html se comparte con quien haga falta. */
const PROFESOR_ID = process.env.PROFESOR_ID || "5fc884eb-5374-4353-9a5d-60454c0be6c9";

// ------------------------------------------------------------------ los bancos

const cache = {};
const datos = (archivo) => cache[archivo] || (cache[archivo] = leerJSON(archivo));

function deDiagramas(archivo, id) {
  for (const f of datos(archivo).finales) for (const d of f.diagramas || []) if (d.id === id) return d;
  return null;
}

function leerUnaClase() {
  const dir = path.join(RAIZ, "cursos/protegido/data/una-clase-al-dia");
  if (!cache.ucd) {
    cache.ucd = {};
    cache.ucdp = {};
    for (const f of fs.readdirSync(dir)) {
      const l = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const e of Object.values(l.ejercicios || {})) cache.ucd[e.id] = e;
      for (const p of Object.values(l.partidas || {})) cache.ucdp[p.id] = p;
    }
  }
}
function deUnaClase(id) { leerUnaClase(); return cache.ucd[id] || null; }
function partidaDeUnaClase(id) { leerUnaClase(); return cache.ucdp[id] || null; }

/* { fen, jugadas (SAN), origen } de un ejercicio del banco. El origen es la
   partida que dice el banco, tal cual: no se escribe a mano un resultado ni
   un año que el banco no trae. */
function fuente(banco) {
  const [tipo, id] = String(banco).split(":");
  if (tipo === "mapa" || tipo === "gp") {
    const d = deDiagramas(tipo === "mapa" ? "cursos/protegido/data/el-mapa-de-los-finales.json"
                                          : "cursos/protegido/data/ganar-con-poco.json", id);
    if (!d) throw new Error("No está en el banco: " + banco);
    const lichess = /Ejercicio (\S+) de la base abierta de Lichess/.exec(d.comentario || "");
    return { fen: d.fen, jugadas: d.jugadas.map((j) => j.san),
             origen: lichess ? "ejercicio " + lichess[1] + " de la base abierta de Lichess" : null };
  }
  if (tipo === "lt") {
    const p = (datos("entreno/data/temas.json").puzzles || {})[id];
    if (!p) throw new Error("No está en los ejercicios de Lichess: " + banco);
    return { fen: p.fen, jugadas: p.solution.slice(), origen: "ejercicio " + id + " de la base abierta de Lichess" };
  }
  if (tipo === "ucd") {
    const e = deUnaClase(id);
    if (!e) throw new Error("No está en «Una clase al día»: " + banco);
    const origen = String(e.explicacion || "").replace(/^anterior:\s*/, "").replace(/\s*Stockfish.*$/, "").trim();
    return { fen: e.fen, jugadas: e.solucion.map((s) => s.san), origen: origen || null };
  }
  if (tipo === "ucdp") {
    const [pid, ply] = id.split("@");
    const p = partidaDeUnaClase(pid);
    if (!p || !(+ply >= 0) || +ply >= p.moves.length) throw new Error("No está en las partidas de «Una clase al día»: " + banco);
    const c = new Chess();
    if (!c.load(p.start_fen)) throw new Error(banco + ": la FEN de salida de la partida no carga");
    const sans = p.moves.map((m) => m.san);
    for (const san of sans.slice(0, +ply)) if (!c.move(san)) throw new Error(banco + ": no se puede jugar " + san);
    return { fen: c.fen(), jugadas: sans.slice(+ply), inicio: p.start_fen, previas: sans.slice(0, +ply),
             apertura: p.apertura + (p.eco ? " (" + p.eco + ")" : ""),
             origen: p.blancas + "–" + p.negras + ", " + p.evento };
  }
  throw new Error("Banco desconocido: " + banco);
}

// ------------------------------------------------------------------ la línea

/* La posición y la línea de un ejercicio, leídas del banco y vueltas a jugar
   con chess.js. Devuelve también la FEN ANTES de cada jugada de la línea: ahí
   es donde se comprueban las únicas y las trampas. */
function armar(ej) {
  const f = fuente(ej.banco);
  const c = new Chess();
  if (!c.load(f.fen)) throw new Error(ej.banco + ": la FEN del banco no carga");
  const saltar = ej.saltar || 0;
  for (const san of f.jugadas.slice(0, saltar)) {
    if (!c.move(san)) throw new Error(ej.banco + ": no se puede jugar " + san);
  }
  const fen = c.fen();
  const delBanco = f.jugadas.slice(saltar, ej.hasta ? saltar + ej.hasta : undefined);
  const linea = delBanco.concat(ej.extra || []);
  const antes = [];
  for (const san of linea) {
    antes.push(c.fen());
    if (!c.move(san)) throw new Error(ej.banco + ": la línea no se puede jugar en " + san);
  }
  return { fen, linea, antes, final: c.fen(), origen: f.origen, delBanco: delBanco.length,
           apertura: f.apertura, inicio: f.inicio, previas: f.previas };
}

/* El número de la jugada `i` de una línea que empieza en `fen`, y de quién es. */
function numero(fen, i) {
  const [, turno, , , , n] = fen.split(" ");
  const negras = turno === "b";
  return { n: +n + Math.floor((i + (negras ? 1 : 0)) / 2), color: (i % 2 === 0) === !negras ? "w" : "b" };
}

/* "1.Rg3 Rb7 2.Rf4" con la notación de acá, a partir de la FEN de salida. */
function numerar(fen, sans, marca) {
  const out = [];
  sans.forEach((san, i) => {
    const { n, color } = numero(fen, i);
    const es = aEspanol(san) + (i === 0 && marca ? marca : "");
    if (color === "w") out.push(n + "." + es);
    else out.push(i === 0 ? n + "..." + es : es);
  });
  return out.join(" ");
}

// ------------------------------------------------------------------ la sesión

function crear(s) {
  function chuleta(ej, a) {
    const unicas = ej.unicas.map((i) => numerar(a.antes[i], [a.linea[i]]).replace(/\s.*/, "")).join(", ");
    const trampas = ej.trampas.map((t) =>
      numerar(a.antes[t.jugada], [t.san].concat(t.refuta), "?") + " (" + s.resultados[t.resultado] + ")");
    let texto = s.consigna(ej, a) + " Línea: " + numerar(a.fen, a.linea) + (unicas ? " · Únicas: " + unicas : "");
    // Lo que no cabe en los 500 de la base es la lista de trampas, nunca la línea:
    // las trampas están completas en la nota «El cálculo».
    for (const t of trampas) {
      const mas = texto + (texto.includes("· Trampa") ? "; " : " · Trampa: ") + t;
      if (mas.length > 500) break;
      texto = mas;
    }
    return texto;
  }

  function armarPlan() {
    const items = [nota("Cómo se trabaja esta sesión", s.intro)];
    const salida = [];
    s.ejercicios.forEach((ej, i) => {
      for (const r of ej.trampas) if (!s.resultados[r.resultado]) throw new Error(ej.banco + ": resultado desconocido " + r.resultado);
      const a = armar(ej);
      const n = i + 1;
      if (!fenUsable(a.fen)) throw new Error(ej.banco + ": la clase en vivo rechazaría la posición");
      items.push({ tipo: "posicion", titulo: recorta("Ejercicio " + n + " · " + ej.nombre, 200), fen: a.fen,
                   pregunta: chuleta(ej, a) });
      const deDonde = s.conOrigen && a.origen ? "\nDe: " + a.origen.replace(/\.+$/, "") + "." : "";
      // En la sesión de aperturas, la nota empieza por cómo se llegó: la apertura y sus jugadas.
      const llegada = s.conLlegada && a.previas ? "Cómo se llegó · " + a.apertura + ": " + numerar(a.inicio, a.previas) + "\n\n" : "";
      items.push(nota("Ejercicio " + n + " · El cálculo", llegada + ej.explicacion + deDonde));
      salida.push({ n, banco: ej.banco, saltar: ej.saltar || 0, delBanco: a.delBanco, fen: a.fen,
                    linea: a.linea, antes: a.antes, final: a.final,
                    umbral: ej.umbral || s.umbral,
                    unicas: ej.unicas, tambien: ej.tambien || [], trampas: ej.trampas,
                    explicacion: ej.explicacion });
    });
    items.push(nota("Cierre", s.cierre));
    items.forEach((it, i) => { it.orden = i; });
    return { titulo: s.titulo, notas: recorta(s.notas, 4000), items, ejercicios: salida };
  }

  function aSQL(plan) {
    const esc = (v) => (v === null || v === undefined ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");
    const out = [];
    out.push("-- " + s.titulo + ". Generado por herramientas/sesion-" + s.slug + "-intensiva.js.");
    out.push("-- Se puede correr las veces que haga falta: borra primero el plan por su título.");
    out.push("begin;");
    out.push("delete from public.planes_clase where profesor_id = " + esc(PROFESOR_ID) + " and titulo = " + esc(plan.titulo) + ";");
    out.push("with p as (insert into public.planes_clase (profesor_id, titulo, notas) values (" +
             esc(PROFESOR_ID) + ", " + esc(plan.titulo) + ", " + esc(plan.notas) + ") returning id)");
    out.push("insert into public.plan_items (plan_id, orden, tipo, titulo, fen, pregunta, nota) select p.id, x.orden, x.tipo, x.titulo, x.fen, x.pregunta, x.nota from p, (values");
    out.push(plan.items.map((it) => "  (" + it.orden + ", " + esc(it.tipo) + ", " + esc(it.titulo) + ", " +
             esc(it.fen || null) + ", " + esc(it.pregunta || null) + ", " + esc(it.nota || null) + ")").join(",\n"));
    out.push(") as x(orden, tipo, titulo, fen, pregunta, nota);");
    out.push("commit;");
    return out.join("\n") + "\n";
  }

  /* Escribe herramientas/planes/sesion-<slug>-intensiva.json (lo que revisa el
     verificador) y .sql (lo que se aplica). */
  function escribir() {
    const plan = armarPlan();
    const dir = path.join(RAIZ, "herramientas", "planes");
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, "sesion-" + s.slug + "-intensiva");
    fs.writeFileSync(base + ".json", JSON.stringify({ profesor_id: PROFESOR_ID, umbral: s.umbral, planes: [plan] }, null, 2));
    fs.writeFileSync(base + ".sql", aSQL(plan));
    console.log(plan.items.length + " renglones (" + plan.ejercicios.length + " ejercicios)");
    console.log("Escritos:\n  " + path.relative(RAIZ, base + ".json") + "\n  " + path.relative(RAIZ, base + ".sql"));
  }

  return Object.assign({}, s, { armarPlan, aSQL, escribir });
}

module.exports = { crear, armar, fuente, numero, numerar };
