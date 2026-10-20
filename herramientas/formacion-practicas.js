#!/usr/bin/env node
/* Arma las prácticas de «Formación Ajedrez» para la clase en vivo.
 *
 *   node herramientas/formacion-practicas.js            escribe todo lo de abajo
 *   node herramientas/formacion-practicas.js --revisar  dice si está al día (sin escribir)
 *   node herramientas/formacion-practicas.js --sql      imprime el SQL de las claves de corrección
 *
 * Cada sesión virtual tiene una práctica: sus láminas de ejercicios, que cada
 * alumno pasa a su ritmo, con su respuesta en cada una, y que js/clase-formacion.js
 * manda a la clase. De acá salen:
 *
 *   cursos/recursos/formacion-ajedrez/practicas.json
 *       Lo que ve el alumno: las láminas de cada práctica y, en cada una, sus
 *       preguntas (de opciones, de texto o la planilla del dictado). NUNCA lleva
 *       la respuesta correcta: se baja a todo navegador con acceso a la Academia.
 *   <SQL de --sql>
 *       Las claves de corrección (tabla practica_claves): la opción correcta, la
 *       partida dictada y la respuesta modelo para analizar en clase. Solo las
 *       lee quien da clase, y quien califica es la base (responder_practica()),
 *       no el navegador del alumno.
 *   cursos/recursos/formacion-ajedrez/presentaciones/practica-01/
 *       La Sesión 1 no usa las láminas de su presentación: en salas, cada
 *       estación se resolvía de a grupos y sus láminas no traen la pregunta de
 *       cada posición ni el caso de cada reclamo. Para la práctica individual
 *       se arma una presentación aparte (las 8 posiciones, el dictado, los tres
 *       reclamos con la persona árbitra y los cuatro casos del laboratorio, uno
 *       por lámina) con el mismo dibujador de las demás (formacion-laminas.js).
 *       Las posiciones y los casos salen del curso: no hay una segunda copia.
 *
 * Las láminas de las sesiones 2 a 6 son las que ya se proyectan («Práctica ·»,
 * «Ejercicio k de N»): cada ejercicio trae su caja de texto y su respuesta modelo
 * es la del curso. Nunca entran las láminas de respuestas, quiz, tarea ni
 * receso. Ver «Las prácticas de Formación Ajedrez en la clase» en
 * docs/decisiones/clase-en-vivo.md.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const CURSO = "formacion-ajedrez";
const CARPETA = path.join(RAIZ, "cursos", "recursos", CURSO);
const SALIDA = path.join(CARPETA, "practicas.json");
const DATOS_CURSO = path.join(RAIZ, "herramientas", "cursos", "formacion-ajedrez.json");
const DECK_PROPIO = "practica-01";
// El mismo que lleva PresentacionClase.LISTA (js/clase-presentacion.js): lo comprueba verificar-clase-presentacion.js.
const TITULO_PROPIO = "Formación Ajedrez · Sesión 1: la práctica (posiciones, dictado y reclamos)";
const CARPETA_PROPIA = path.join(CARPETA, "presentaciones", DECK_PROPIO);
const JSON_PROPIO = path.join(CARPETA_PROPIA, "diapositivas.json");
const DATOS_PROPIO = path.join(RAIZ, "herramientas", "datos", "formacion-laminas-" + DECK_PROPIO + ".js");

// Lo que es de la práctica y lo que nunca se le manda al alumno.
const ES_PRACTICA = [/^Práctica\b/, /^Ejercicio \d+ de \d+$/, /^Estación \d+:/];
const NUNCA = /respuestas|^Quiz\b|^Tarea\b|^Receso$/i;

/* Las cinco situaciones de la Estación 1: las mismas opciones para las ocho
   posiciones, en este orden. La correcta sale del `estado` de cada ejercicio
   del curso, y arriba se vuelve a calcular con chess.js. */
const ESTADOS = [
  { v: "mate", t: "Jaque mate: la partida terminó" },
  { v: "ahogado", t: "Ahogado: tablas" },
  { v: "jaque", t: "Jaque, pero la partida sigue" },
  { v: "muerta", t: "Posición muerta: tablas" },
  { v: "sigue", t: "No hay jaque ni final: la partida sigue" },
];

/* La partida del dictado (Estación 2), en notación algebraica española: lleva
   capturas, un jaque y el mate. Es la del ejemplo de las notas de la lámina 45
   de la Clase 1 (el mate de Légal), comprobada con chess.js al armar. */
const DICTADO = "e4 e5 Cf3 d6 Ac4 Ag4 Cc3 g6 Cxe5 Axd1 Axf7+ Re7 Cd5#".split(" ");
const FILAS_PLANILLA = 10;

/* Los tres reclamos del juego de roles (Estación 3), de las notas de la lámina
   46 de la Clase 1. El alumno es siempre la persona árbitra; el título no dice
   de qué reclamo se trata (el árbitro no lo sabe de antemano). */
const RECLAMOS = [
  { situacion: "Un jugador toca su alfil y mueve el caballo. Su rival reclama.",
    modelo: "Pieza tocada: debe mover el alfil si tiene una jugada legal (art. 4.3)." },
  { situacion: "Un jugador deja su rey en jaque y presiona el reloj.",
    modelo: "Jugada ilegal: se vuelve a la posición anterior, juega con la pieza que tocó si tiene jugada legal y su rival recibe 2 minutos (art. 7.5)." },
  { situacion: "Un jugador acomoda una pieza sin decir nada antes. Su rival reclama.",
    modelo: "Pieza tocada: «compongo» solo vale en su turno y avisando antes de tocar la pieza (art. 4.2.1)." },
];

// «Cxe5» → «Nxe5»: chess.js solo entiende la inglesa.
function aIngles(san) {
  const m = /^([CATDR])(.*)$/.exec(san);
  if (!m) return san.replace("=D", "=Q").replace("=T", "=R").replace("=A", "=B").replace("=C", "=N");
  return { C: "N", A: "B", T: "R", D: "Q", R: "K" }[m[1]] + m[2];
}

function estadoDe(fen) {
  const g = new Chess(fen);
  if (g.in_checkmate()) return "mate";
  if (g.in_stalemate()) return "ahogado";
  if (g.in_check()) return "jaque";
  if (g.insufficient_material()) return "muerta";
  return "sigue";
}

function lineaDelDictado(jugadas) {
  const partes = [];
  jugadas.forEach((j, i) => partes.push((i % 2 ? "" : (i / 2 + 1) + ". ") + j));
  return partes.join(" ");
}

function comprobarElDictado() {
  const g = new Chess();
  DICTADO.forEach((san, i) => {
    if (!g.move(aIngles(san))) throw new Error("La partida del dictado no se puede jugar: la jugada " + (i + 1) + " («" + san + "») es ilegal");
  });
  if (!g.in_checkmate()) throw new Error("La partida del dictado tiene que terminar en mate");
  // Cada captura, jaque y mate lleva su signo: es lo que el alumno suele olvidar.
  const sinSigno = DICTADO.filter((san, i) => { const h = new Chess(); DICTADO.slice(0, i).forEach((x) => h.move(aIngles(x))); const m = h.move(aIngles(san)); return (m.flags.includes("c") && !san.includes("x")) || (h.in_check() && !/[+#]$/.test(san)); });
  if (sinSigno.length) throw new Error("Jugadas del dictado sin su x, + o #: " + sinSigno.join(", "));
}

const frase = (k, ic, t, s) => ({ tipo: "frase", k, ic, t, s });

/* La presentación de la práctica de la Sesión 1: las láminas, su texto para
   el Modo Adaptado y sus datos para dibujarlas. */
function presentacionDeLaSesion1(curso, clase1) {
  const lec = curso.bloques.flatMap((b) => b.lecciones)[0];
  const diapoClase = clase1.diapositivas;
  const e1 = diapoClase.find((d) => /^Estación 1: posiciones 1 a 4$/.test(d.titulo));
  const e2 = diapoClase.find((d) => /^Estación 1: posiciones 5 a 8$/.test(d.titulo));
  if (!e1 || !e2) throw new Error("No encuentro las láminas de la Estación 1 en la Clase 1");
  const lados = (fen) => (fen.split(" ")[1] === "w" ? "juegan las blancas" : "juegan las negras");
  const tablero = (d, k) => ({
    tipo: "tableros", k: "Estación 1 · ¿jaque, mate, ahogado, posición muerta o sigue?",
    items: d.posiciones.map((p, i) => ({ pos: i, t: "Posición " + (k + i), s: lados(p.fen) })),
  });
  const diapositivas = [], datos = [], laminas = [];
  const poner = (titulo, texto, dato, extra, preguntas) => {
    const n = diapositivas.length + 1;
    diapositivas.push(Object.assign({ titulo, texto, imagen: String(n).padStart(2, "0") + ".webp" }, extra || {}));
    datos.push(dato);
    laminas.push({ n, titulo, preguntas: preguntas || [] });
  };
  const claves = [];
  const clave = (n, pregunta, tipo, c, modelo) => claves.push({ deck: CURSO + "/" + DECK_PROPIO, lamina: n, pregunta, tipo, clave: c, modelo });

  // Estación 1: las ocho posiciones, cuatro por lámina.
  [[e1, 1], [e2, 5]].forEach(([d, desde]) => {
    const n = diapositivas.length + 1;
    const preguntas = d.posiciones.map((p, i) => {
      const num = desde + i;
      const ej = lec.ejercicios[num - 1];
      if (!ej || ej.fen !== p.fen) throw new Error("La posición " + num + " de la lámina no es la del ejercicio " + num + " del curso");
      const calculado = estadoDe(p.fen);
      if (calculado !== ej.estado) throw new Error("Posición " + num + ": chess.js dice «" + calculado + "» y el curso «" + ej.estado + "»");
      clave(n, "p" + num, "opciones", { correcta: ej.estado }, ej.respuesta);
      return { id: "p" + num, tipo: "opciones", texto: "Posición " + num + " (" + lados(p.fen) + ")", opciones: ESTADOS };
    });
    poner("Estación 1: posiciones " + desde + " a " + (desde + 3),
      "Estación 1. Posiciones " + desde + " a " + (desde + 3) + ": " + d.posiciones.map((p, i) => "posición " + (desde + i) + ", " + lados(p.fen)).join("; ")
      + ". Para cada una, indica si es jaque mate, ahogado, jaque con la partida en marcha, posición muerta o si la partida sigue.",
      tablero(d, desde), { posiciones: d.posiciones }, preguntas);
  });

  // Estación 2: el dictado.
  comprobarElDictado();
  {
    const n = diapositivas.length + 1;
    clave(n, "planilla", "planilla", DICTADO, "La partida dictada: " + lineaDelDictado(DICTADO));
    poner("Estación 2: dictado de planilla",
      "Estación 2. Dictado de planilla: tu profe dicta una partida en voz alta, sin mostrar el tablero. Anótala jugada a jugada en la planilla de abajo, con notación algebraica española: capturas, jaque y mate.",
      { tipo: "filas", k: "Estación 2 · una persona dicta, todas anotan", items: [
        { ic: "🗣️", t: "Tu profe dicta la partida", s: "en voz alta, sin mostrar el tablero" },
        { ic: "✍️", t: "Tú la anotas", s: "jugada a jugada, en la planilla de la pantalla" },
        { ic: "🔎", t: "Con capturas, jaque y mate", s: "cada signo cuenta: x, + y #" },
      ], clave: "7 jugadas. Cuando termines, marca la lámina como completada." }, null,
      [{ id: "planilla", tipo: "planilla", texto: "Tu planilla", filas: FILAS_PLANILLA }]);
  }

  // Estación 3: tres reclamos, la persona árbitra eres tú.
  RECLAMOS.forEach((r, i) => {
    const n = diapositivas.length + 1;
    clave(n, "decision", "texto", null, r.modelo);
    poner("Reclamo " + (i + 1) + " de " + RECLAMOS.length,
      "Estación 3. Reclamo " + (i + 1) + ". Tú eres la persona árbitra. " + r.situacion + " ¿Qué decides y con qué artículo? Discútelo con tu grupo y escribe tu decisión; luego lo analizamos en clase.",
      frase("Estación 3 · tú eres la persona árbitra", "🧑‍⚖️", r.situacion, "¿Qué decides y con qué artículo?"), null,
      [{ id: "decision", tipo: "texto", texto: "Tu decisión y el artículo que aplicas" }]);
  });

  // Estación 4: los cuatro casos del laboratorio, uno por lámina.
  lec.casos.forEach((c, i) => {
    const n = diapositivas.length + 1;
    clave(n, "decision", "texto", null, c.decision + " (" + c.fuente + ")");
    poner("Caso " + (i + 1) + " de " + lec.casos.length,
      "Estación 4. Caso " + (i + 1) + ". " + c.situacion + " ¿Qué decides y con qué artículo? Discútelo con tu grupo y escribe tu decisión; luego lo analizamos en clase.",
      frase("Estación 4 · los casos del laboratorio", "📖", c.situacion, "¿Qué decides y con qué artículo?"), null,
      [{ id: "decision", tipo: "texto", texto: "Tu decisión y el artículo que aplicas" }]);
  });

  return { diapositivas, datos, laminas, claves };
}

function armar() {
  const sesiones = JSON.parse(fs.readFileSync(path.join(CARPETA, "sesiones.json"), "utf8")).sesiones;
  const curso = JSON.parse(fs.readFileSync(DATOS_CURSO, "utf8"));
  const lecciones = curso.bloques.flatMap((b) => b.lecciones);
  const clase1 = JSON.parse(fs.readFileSync(path.join(CARPETA, "presentaciones", "clase-01", "diapositivas.json"), "utf8"));
  const practicas = [];
  const claves = [];
  let propia = null;
  for (const s of sesiones) {
    if (!s.presentacion) continue;
    if (s.n === 1) {
      propia = presentacionDeLaSesion1(curso, clase1);
      claves.push(...propia.claves);
      practicas.push({ n: 1, deck: CURSO + "/" + DECK_PROPIO, titulo: "Sesión 1: " + s.titulo, laminas: propia.laminas });
      continue;
    }
    const clase = s.presentacion.split("/")[1];
    const diapos = JSON.parse(fs.readFileSync(path.join(CARPETA, "presentaciones", clase, "diapositivas.json"), "utf8")).diapositivas;
    const ejercicios = lecciones[s.n - 1].ejercicios || [];
    const laminas = [];
    diapos.forEach((d, i) => {
      if (NUNCA.test(d.titulo) || !ES_PRACTICA.some((r) => r.test(d.titulo))) return;
      const lamina = { n: i + 1, titulo: d.titulo, preguntas: [] };
      const k = /^Ejercicio (\d+) de \d+$/.exec(d.titulo);
      if (k) {
        const ej = ejercicios[+k[1] - 1];
        if (!ej) throw new Error("Sesión " + s.n + ": la lámina «" + d.titulo + "» no tiene su ejercicio en el curso");
        lamina.preguntas.push({ id: "respuesta", tipo: "texto", texto: "Tu respuesta" });
        claves.push({ deck: s.presentacion, lamina: i + 1, pregunta: "respuesta", tipo: "texto", clave: null, modelo: ej.respuesta });
      }
      laminas.push(lamina);
    });
    if (laminas.length) practicas.push({ n: s.n, deck: s.presentacion, titulo: "Sesión " + s.n + ": " + s.titulo, laminas });
  }
  return {
    publico: {
      _comentario: "Generado por herramientas/formacion-practicas.js: no se edita a mano.",
      curso: CURSO,
      practicas,
    },
    claves,
    propia,
  };
}

const escSql = (t) => "'" + String(t).replace(/'/g, "''") + "'";

function sqlDeClaves(claves) {
  const filas = claves.map((c) => "  (" + [escSql(c.deck), c.lamina, escSql(c.pregunta), escSql(c.tipo),
    c.clave === null ? "null" : escSql(JSON.stringify(c.clave)) + "::jsonb", escSql(c.modelo)].join(", ") + ")");
  return "insert into public.practica_claves (deck, lamina, pregunta, tipo, clave, modelo) values\n" + filas.join(",\n")
    + "\non conflict (deck, lamina, pregunta) do update\n  set tipo = excluded.tipo, clave = excluded.clave, modelo = excluded.modelo;\n";
}

const aTexto = (o) => JSON.stringify(o, null, 2) + "\n";
const datosComoModulo = (datos) => "/* Generado por herramientas/formacion-practicas.js: no se edita a mano. */\nmodule.exports = "
  + JSON.stringify(datos, null, 1) + ";\n";

function archivos() {
  const r = armar();
  return {
    r,
    esperado: [
      [SALIDA, aTexto(r.publico)],
      [JSON_PROPIO, aTexto({ titulo: TITULO_PROPIO, curso: CURSO, diapositivas: r.propia.diapositivas })],
      [DATOS_PROPIO, datosComoModulo(r.propia.datos)],
    ],
  };
}

if (require.main === module) {
  const { r, esperado } = archivos();
  if (process.argv.includes("--sql")) {
    process.stdout.write(sqlDeClaves(r.claves));
  } else if (process.argv.includes("--revisar")) {
    const alDia = esperado.every(([f, t]) => fs.existsSync(f) && fs.readFileSync(f, "utf8") === t);
    process.exit(alDia ? 0 : 1);
  } else {
    let cambio = false;
    for (const [f, t] of esperado) {
      if (fs.existsSync(f) && fs.readFileSync(f, "utf8") === t) continue;
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, t);
      console.log("Escrito " + path.relative(RAIZ, f));
      cambio = true;
    }
    // Las imágenes de la presentación propia, con el dibujador de las demás.
    const imgs = fs.existsSync(CARPETA_PROPIA) ? fs.readdirSync(CARPETA_PROPIA).filter((f) => f.endsWith(".webp")).length : 0;
    if (cambio || imgs !== r.propia.diapositivas.length || process.argv.includes("--imagenes")) {
      const p = spawnSync("node", [path.join(__dirname, "formacion-laminas.js"), DECK_PROPIO], { stdio: "inherit" });
      if (p.status !== 0) process.exit(p.status || 1);
    }
  }
}
module.exports = { TITULO_PROPIO, armar, archivos, sqlDeClaves, SALIDA, JSON_PROPIO, DATOS_PROPIO, DECK_PROPIO, CARPETA_PROPIA, ES_PRACTICA, NUNCA, ESTADOS, DICTADO, FILAS_PLANILLA, aIngles, estadoDe, lineaDelDictado };
