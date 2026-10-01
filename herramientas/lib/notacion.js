/* Las jugadas que se ESCRIBEN en el contenido del sitio (artículos, cursos,
 * materiales, libros).
 *
 * Regla del dueño: todo se escribe en algebraica española —R rey, D dama,
 * T torre, A alfil, C caballo: «Cf3», «Axc6», «Txe8+», «e8=D», «O-O»— y en lo
 * que se hace para quien no ve (los archivos «-accesible») en el formato de
 * ajedrez para ciegos, con las columnas dichas: «caballo felix 3», «alfil
 * captura cesar 6 jaque», «eva 8 corona dama», «Enroque corto».
 *
 * Los bancos y los archivos de datos guardan el SAN inglés que necesita
 * chess.js; NO se tocan. Se convierte acá, al escribir el texto. El formato
 * hablado no se inventa: lo da BlindNotation.sanSpoken de js/blind-notation.js,
 * el mismo que oye el alumno en el sitio.
 *
 * Uso:
 *   const N = require("./lib/notacion.js");
 *   N.textoEspanol("Tras 2.Nf3 Nc6 3.Bb5", "ingles")   // "Tras 2.Cf3 Cc6 3.Ab5"
 *   N.textoHablado("Tras 15.Axd5+ Rg7", "espanol")    // "Tras 15. alfil captura david 5 jaque, rey gustav 7"
 *
 * El origen importa por la R: en inglés es la torre y en español el rey. Con
 * "auto" se decide por las letras que no dejan duda (N, B, Q, K son inglesas;
 * C, A, D, T españolas); si un texto trae de las dos, cada jugada se decide
 * por su propia letra, y una R ahí (torre o rey) no se adivina: se avisa con
 * un error que lleva `mezcla`.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..", "..");

// BlindNotation vive en el navegador (window.BlindNotation). Se carga igual,
// con un window de mentira: así el formato hablado es UNA sola copia.
let BN = null;
function blind() {
  if (BN) return BN;
  const ctx = { window: {}, document: undefined, localStorage: undefined };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "js", "blind-notation.js"), "utf8"), ctx);
  BN = ctx.window.BlindNotation;
  return BN;
}

const EN_A_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
const ES_A_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };

// Una jugada suelta, en cualquiera de las dos notaciones.
const PIEZA = "[KQRBNCADT]";
const JUGADA_CUERPO =
  "(?:O-O-O|O-O|0-0-0|0-0" +
  "|" + PIEZA + "[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBNDTAC])?" +
  "|[a-h]x[a-h][1-8](?:=[QRBNDTAC])?" +
  "|[a-h][1-8]=[QRBNDTAC]" +
  "|[a-h][1-8])[+#]?";
const ANTES = "(?<![\\w/\\-–])";
const DESPUES = "(?![\\w/\\-–]|=)";
// Número de jugada: «1.», «1…», «1...», «13…» y con espacio o sin él.
const NUMERO = "\\d+\\s?(?:\\.\\.\\.|…|\\.)\\s*";
const ANOT = "[!?]{0,2}";

// Una jugada que NO es un peón que avanza: esas se reconocen en cualquier
// parte del texto. «e4» a secas puede ser una casilla («el peón de e4»), así
// que solo se toma por jugada dentro de una línea numerada («1.e4 e5»).
const SIN_PEON_SOLO = new RegExp(ANTES + "(?:\\.\\.\\.|…)?" +
  "(O-O-O|O-O|0-0-0|0-0|" + PIEZA + "[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBNDTAC])?|[a-h]x[a-h][1-8](?:=[QRBNDTAC])?|[a-h][1-8]=[QRBNDTAC])([+#]?)" + DESPUES, "g");

// Una línea: jugadas separadas por espacios con al menos un número de jugada.
const LINEA = new RegExp(ANTES + "(?:(?:" + NUMERO + ")?(?:\\.\\.\\.|…)?" + JUGADA_CUERPO + ANOT + DESPUES + ")" +
  "(?:[ \\t]+(?:" + NUMERO + ")?(?:\\.\\.\\.|…)?" + JUGADA_CUERPO + ANOT + DESPUES + ")*", "g");

// Una maniobra: la pieza y su camino, «Ce4-d2-b1».
const MANIOBRA = new RegExp(ANTES + "(\\.\\.\\.|…)?(" + PIEZA + ")([a-h][1-8](?:-[a-h][1-8])+)" + DESPUES, "g");

// Una letra que decide también en una maniobra («Bg5-d2»).
const INGLESA = new RegExp(ANTES + "(?:[NBQK][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8]=[QRBN])(?:" + DESPUES + "|(?=-[a-h][1-8]))");
const ESPANOLA = new RegExp(ANTES + "(?:[CADT][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8]=[DTAC])(?:" + DESPUES + "|(?=-[a-h][1-8]))");

/* ¿En qué notación está este texto? "ingles", "espanol", "ninguna" (sin
   letras que decidan: solo peones, enroques o la R) o "mezcla". */
function origenDe(texto) {
  const en = INGLESA.test(texto), es = ESPANOLA.test(texto);
  if (en && es) return "mezcla";
  if (en) return "ingles";
  if (es) return "espanol";
  return "ninguna";
}

/* Pasa UNA jugada (sin número) a SAN inglés, según su origen. */
function aIngles(jugada, origen) {
  if (origen === "ingles") return jugada;
  return jugada.replace(/^([RDTAC])/, (l) => ES_A_EN[l]).replace(/=([RDTAC])/, (m, l) => "=" + ES_A_EN[l]);
}
function aEspanol(jugada, origen) {
  if (origen !== "ingles") return jugada;
  return jugada.replace(/^([KQRBN])/, (l) => EN_A_ES[l]).replace(/=([KQRBN])/, (m, l) => "=" + EN_A_ES[l]);
}
function hablada(jugada, origen, texto) {
  const m = jugada.match(/^(.*?)([!?]{0,2})$/);
  origen = origenDeJugada(m[1], origen, texto || jugada);
  const san = aIngles(m[1].replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O"), origen);
  return blind().sanSpoken(san) + m[2];
}

/* El origen efectivo de un texto: el que se pidió o, con "auto", el que dicen
   sus letras. En un texto sin letras que decidan, la R queda como rey. Con
   "mezcla" cada jugada se decide por su propia letra; una R ahí no se puede
   decidir y se avisa en vez de adivinar. */
function resolver(texto, origen) {
  if (origen && origen !== "auto") return origen;
  const o = origenDe(texto);
  if (o === "mezcla") return "mezcla";
  return o === "ingles" ? "ingles" : "espanol";
}
function origenDeJugada(j, o, texto) {
  if (o !== "mezcla") return o;
  const l = (j.match(/^([KQRBNCADT])/) || j.match(/=([QRBNDTAC])/) || [])[1];
  if (!l) return "espanol";
  if (/[NBQK]/.test(l)) return "ingles";
  if (/[CADT]/.test(l)) return "espanol";
  const e = new Error("Texto con jugadas en las dos notaciones: la R de «" + j + "» no se puede decidir: " + String(texto).slice(0, 160));
  e.mezcla = true;
  throw e;
}

/* El texto, con cada jugada en algebraica española. */
function textoEspanol(texto, origen) {
  if (texto == null) return texto;
  const t = String(texto);
  const o = resolver(t, origen);
  if (o === "espanol") return t;
  return t.replace(SIN_PEON_SOLO, (todo, j, jaque) => todo.replace(j, aEspanol(j, origenDeJugada(j, o, t))))
    .replace(MANIOBRA, (todo, puntos, pieza, camino) => (puntos || "") + aEspanol(pieza, origenDeJugada(pieza + camino.slice(0, 2), o, t)) + camino);
}

/* El texto, con cada jugada en el formato de ajedrez para ciegos. */
function textoHablado(texto, origen) {
  if (texto == null) return texto;
  const t = String(texto);
  const o = resolver(t, origen);
  // «el enroque largo (O-O-O)» explica cómo se anota: decir «el enroque largo
  // (Enroque largo)» no dice nada. Ese signo se deja escrito.
  const guardados = [];
  const protegido = t.replace(/((?:enroque\s+)?(?:corto|largo)\s*\(\s*)(O-O(?:-O)?)/gi, (todo, antes, signo) => {
    guardados.push(signo);
    return antes + "\u0003" + (guardados.length - 1) + "\u0004";
  });
  // Una maniobra se dice pieza y camino: «caballo eva 4, david 2, bella 1».
  const conManiobras = protegido.replace(MANIOBRA, (todo, puntos, pieza, camino, donde, entero) => {
    const [primera, ...resto] = camino.split("-");
    const dicha = hablada(pieza + primera, o, t) + resto.map((c) => ", " + blind().squareSpoken(c)).join("");
    const trasNumero = /\d(?:\.|…)$/.test(entero.slice(0, donde)) ? " " : "";
    return trasNumero + "\u0001" + (puntos ? "… " : "") + dicha + "\u0002";
  });
  // Primero las líneas numeradas: ahí cada palabra es una jugada, también «e4».
  const marcado = conManiobras.split(/(\u0001[^\u0002]*\u0002)/).map((parte) => parte.startsWith("\u0001") ? parte : parte.replace(LINEA, (linea) => {
    const trozos = linea.trim().split(/[ \t]+/);
    const numerada = trozos.some((x) => /^\d+\s?(?:\.|…)/.test(x));
    const unaSola = trozos.length === 1;
    if (!numerada && !(unaSola && linea.trim() === t.trim())) {
      // Sin número de jugada: los peones que avanzan pueden ser casillas.
      return linea.replace(SIN_PEON_SOLO, (todo, j, jaque) => "\u0001" + todo.replace(/^(?:\.\.\.|…)/, "… ").replace(j + jaque, hablada(j + jaque, o, t)) + "\u0002");
    }
    const salida = [];
    let pendienteNumero = "";
    // «1.e4» viene pegado; se separa el número de la jugada.
    const piezas = [];
    trozos.forEach((x) => {
      const m = x.match(/^(\d+\s?(?:\.\.\.|…|\.))(.*)$/);
      if (m) { piezas.push({ num: m[1] }); if (m[2]) piezas.push({ j: m[2] }); } else piezas.push({ j: x });
    });
    piezas.forEach((p) => {
      if (p.num) { pendienteNumero = p.num.replace(/\.\.\.|…/, "…"); return; }
      const suspensivos = /^(?:\.\.\.|…)/.test(p.j);
      const j = p.j.replace(/^(?:\.\.\.|…)/, "");
      const dicha = hablada(j, o, t);
      salida.push((pendienteNumero ? pendienteNumero + " " : suspensivos ? "… " : "") + dicha);
      pendienteNumero = "";
    });
    return "\u0001" + salida.join(", ") + "\u0002";
  })).join("");
  // Lo que quedó fuera de las líneas: las jugadas de pieza sueltas en la prosa.
  const dicho = marcado.split(/(\u0001[^\u0002]*\u0002)/).map((parte) => {
    if (parte.startsWith("\u0001")) return parte;
    return parte.replace(SIN_PEON_SOLO, (todo, j, jaque) =>
      "\u0001" + todo.replace(/^(?:\.\.\.|…)/, "… ").replace(j + jaque, hablada(j + jaque, o, t)) + "\u0002");
  }).join("");
  // Una jugada que abría la oración («Df7 es el ahogado…») arranca con
  // mayúscula también dicha: «Dama felix 7 es el ahogado…».
  return dicho
    .replace(/(^|(?<!\d)[.!?¡¿]\s+)\u0001([a-záéíóú])/g, (todo, antes, letra) => antes + letra.toUpperCase())
    .replace(/[\u0001\u0002]/g, "")
    .replace(/\u0003(\d+)\u0004/g, (todo, i) => guardados[Number(i)]);
}

/* ¿Este texto ENSEÑA a anotar? Ahí «Cf3» es lo que se aprende a escribir, no
   una jugada que decir, y se deja escrito también en lo accesible. */
function ensenaNotacion(texto) {
  return /notaci[oó]n|se escribe|se anota|en ingl[eé]s/i.test(String(texto || ""));
}

/* Una jugada SAN inglesa (la de chess.js) para escribirla. */
function sanEspanol(san) { return aEspanol(String(san), "ingles"); }
function sanHablada(san) { return hablada(String(san), "ingles"); }

module.exports = { origenDe, textoEspanol, textoHablado, sanEspanol, sanHablada, ensenaNotacion, INGLESA, ESPANOLA };
