#!/usr/bin/env node
/* El profe Oscar como rival (js/rival-profe.js), sin navegador.

   Se comprueba:
   - que cada frase use una cara que existe en js/avatar-profe-oscar.js, que
     ninguna esté vacía ni repetida, y que cada evento tenga al menos dos
     (para no decir siempre lo mismo; las de una sola cara son la excepción);
   - cuándo comenta un intercambio (juzgarIntercambio): 2,5 peones o más es
     regalo o golpe; menos es ruido y no se dice nada;
   - que el regalo a propósito (buscarRegalo) sea de verdad: una jugada del bot
     tras la cual el rival gana entre 2,5 y 6 peones con chess.js, y que no
     regale la dama;
   - que bot.js llame al rival solo a través de `rival(...)` (que no hace nada
     si la cuenta no está en la prueba) y que bot.html cargue el módulo después
     de los dibujos;
   - que la migración que habilita «rival_profe» exista.

       node herramientas/verificar-rival-profe.js
*/
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + JSON.stringify(detalle) : "")); fallos += 1; }
}

// Carga los dos módulos con un window y un document de mentira: sin sesión,
// el rival no se activa y no toca la pantalla.
const w = { localStorage: { length: 0, key: () => null, getItem: () => null } };
const doc = { readyState: "complete", getElementById: () => null, addEventListener() {} };
new Function("window", leer("js/avatar-profe-oscar.js"))(w);
new Function("window", "document", "AvatarProfeOscar", leer("js/rival-profe.js"))(w, doc, w.AvatarProfeOscar);
const R = w.RivalProfe;

console.log("Las frases");
const caras = new Set(w.AvatarProfeOscar.LISTA.map((a) => a.id));
const todas = [];
Object.entries(R.FRASES).forEach(([evento, lista]) => {
  lista.forEach((f) => {
    todas.push(f.texto);
    if (!caras.has(f.cara)) ok(`«${evento}» usa una cara que existe (${f.cara})`, false);
    if (!f.texto || !f.texto.trim()) ok(`«${evento}» no tiene frases vacías`, false);
  });
  if (lista.length < 2 && evento !== "dormido") ok(`«${evento}» tiene al menos dos frases`, false, lista.length);
});
ok("todas las caras existen en js/avatar-profe-oscar.js", Object.values(R.FRASES).every((l) => l.every((f) => caras.has(f.cara))));
ok("ninguna frase se repite", new Set(todas).size === todas.length);
ok("tutea y no vosea", !todas.some((t) => /(podés|tenés|sabés|querés|jugás|mirá\b|\bvos\b)/i.test(t)));
ok("los eventos que llama el código existen",
  ["saludo", "regalo", "golpe", "jaqueTuyo", "jaqueMio", "charla", "esperando", "dormido", "pista", "laViste", "noLaViste", "ganoYo", "ganasTu", "tablas", "rendicion"]
    .every((e) => Array.isArray(R.FRASES[e])));

console.log("Cuándo comenta un intercambio");
ok("ganar una pieza (3) es regalo", R.juzgarIntercambio(0, 3) === "regalo");
ok("perder una torre (5) es golpe", R.juzgarIntercambio(1, -4) === "golpe");
ok("justo 2,5 cuenta", R.juzgarIntercambio(0, 2.5) === "regalo" && R.juzgarIntercambio(0, -2.5) === "golpe");
ok("un peón (1) o la posición (2,4) no se comentan", R.juzgarIntercambio(0, 1) === null && R.juzgarIntercambio(0, -2.4) === null);

console.log("El regalo a propósito");
const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function adaptador(juego) {
  return {
    turno: () => juego.turn(),
    jugadas: () => juego.moves({ verbose: true }),
    probar(j) { const c = new Chess(juego.fen()); return c.move(j) ? adaptador(c) : null; },
    material() {
      let v = 0;
      juego.board().forEach((fila) => fila.forEach((p) => { if (p) v += (p.color === "w" ? 1 : -1) * VALOR[p.type]; }));
      return v;
    },
  };
}
let semilla = 7;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
// 1.e4 Cc6 2.Cf3: las negras (el bot) pueden colgar el caballo en d4 o e5.
const juego = new Chess();
["e4", "Nc6", "Nf3"].forEach((m) => juego.move(m));
const regalo = R.buscarRegalo(adaptador(juego), -1, azar);
ok("encuentra un regalo", !!regalo, regalo);
// La ganancia de verdad: el rival come lo mejor, el bot contesta lo mejor.
function gananciaReal(fen, jugadaBot) {
  const tras = new Chess(fen); tras.move(jugadaBot);
  const antes = -adaptador(new Chess(fen)).material();   // para el bot (negras)
  let peor = antes;
  tras.moves({ verbose: true }).forEach((r) => {
    const c = new Chess(tras.fen()); c.move(r);
    let mejor = -adaptador(c).material();
    c.moves({ verbose: true }).forEach((b) => { const d = new Chess(c.fen()); d.move(b); mejor = Math.max(mejor, -adaptador(d).material()); });
    peor = Math.min(peor, mejor);
  });
  return antes - peor;
}
if (regalo) {
  const g = gananciaReal(juego.fen(), regalo.jugada);
  ok("el rival gana de verdad entre 2,5 y 6 peones, aun con la recaptura", g >= 2.5 && g <= 6, { jugada: regalo.jugada.san, ganancia: g });
  ok("anota lo que queda al comerla y después de la respuesta", regalo.valor <= regalo.queda, regalo);
}
// Una pieza defendida no es regalo: en esta Italiana, ...Ae6 se come pero
// se recaptura (fxe6). Lo que elija tiene que perder material de verdad.
const italiana = new Chess();
["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "d6", "d3", "Nf6", "O-O", "O-O", "h3", "h6", "Re1", "a6", "Nbd2"].forEach((m) => italiana.move(m));
let malo = null;
for (let i = 0; i < 8 && !malo; i++) {
  const r = R.buscarRegalo(adaptador(italiana), -1, azar);
  if (r && gananciaReal(italiana.fen(), r.jugada) < 2.5) malo = { jugada: r.jugada.san, ganancia: gananciaReal(italiana.fen(), r.jugada) };
}
ok("una pieza defendida no cuenta como regalo (ocho sorteos)", !malo, malo);
// Solo la dama se puede perder: no hay regalo (no regala la dama).
const soloDama = new Chess("4k3/8/8/8/8/8/3q4/R3K3 b - - 0 1");
const conDama = R.buscarRegalo(adaptador(soloDama), -1, azar);
ok("no regala la dama", !conDama || conDama.jugada.piece !== "q", conDama && conDama.jugada.san);
// Sin ninguna pieza que colgar: null.
const reyes = new Chess("4k3/8/8/8/8/8/8/4K3 b - - 0 1");
ok("sin nada que colgar, no hay regalo", R.buscarRegalo(adaptador(reyes), -1, azar) === null);

console.log("Las conexiones");
const bot = leer("js/bot.js");
const llamadas = [...bot.matchAll(/RivalProfe\.(\w+)/g)].map((m) => m[1]);
ok("bot.js solo nombra RivalProfe dentro de rival(...)", llamadas.every((n) => n === "activo"), llamadas);
["alEmpezar", "trasTuJugada", "elegirJugada", "trasSuJugada", "alTerminar", "alRendirte"].forEach((f) => {
  ok(`bot.js llama a rival("${f}")`, bot.includes(`rival("${f}"`));
  ok(`js/rival-profe.js exporta ${f}`, typeof R[f] === "function");
});
ok("las tres jugadas humanas (tablero, variante, escrita) avisan al rival", (bot.match(/rival\("trasTuJugada"/g) || []).length === 3);
ok("el bot calcula su jugada una sola vez por turno", !/rival\("elegirJugada", ad, BotOscar\.jugar/.test(bot));
const html = leer("bot.html");
const iAvatar = html.indexOf('src="js/avatar-profe-oscar.js"'), iRival = html.indexOf('src="js/rival-profe.js"'), iBot = html.indexOf('src="js/bot.js"');
ok("bot.html carga el rival después de los dibujos y antes de bot.js", iAvatar > 0 && iRival > iAvatar && iBot > iRival);
ok("bot.html carga css/rival-profe.css", html.includes('href="css/rival-profe.css"'));
ok("el rival pregunta por «rival_profe» en vistas_en_prueba", /from\("vistas_en_prueba"\)[^;]*"rival_profe"/.test(leer("js/rival-profe.js")));
ok("una migración agrega «rival_profe» al check de vistas_en_prueba",
  fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).some((f) => /'rival_profe'/.test(leer("supabase/migraciones/" + f)) && /vistas_en_prueba_vista_check/.test(leer("supabase/migraciones/" + f))));
ok("con «reducir movimiento» la cara no se mueve", /prefers-reduced-motion: reduce[\s\S]*animation: none/.test(leer("css/rival-profe.css")));

console.log("La voz y los cuadros");
const ids = Object.values(R.FRASES).flat().map((f) => f.id);
ok("cada frase tiene un nombre de archivo en minúsculas y guiones", ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id || "")), ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id || "")));
ok("ningún nombre de archivo se repite", new Set(ids).size === ids.length);
ok("las frases del profe están", ["¡esa vara!", "esa y no otra", "huelo algo en la posición", "huelo peligro", "¿y esa jugada de dónde salió?"].every((t) => todas.some((x) => x.toLowerCase().includes(t))));
const m = {};
new Function("window", leer("js/rival-profe-medios.js"))(m);
const medios = m.RivalProfeMedios;
const enDisco = (dir, ext) => (fs.existsSync(path.join(RAIZ, dir)) ? fs.readdirSync(path.join(RAIZ, dir)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort() : []);
ok("la lista de grabaciones es la de audio/rival-profe", JSON.stringify(medios.voces.slice().sort()) === JSON.stringify(enDisco("audio/rival-profe", ".mp3")), { lista: medios.voces, disco: enDisco("audio/rival-profe", ".mp3") });
ok("cada grabación es de una frase que existe", medios.voces.every((v) => ids.includes(v)), medios.voces.filter((v) => !ids.includes(v)));
["oscar", "pame", "karina"].forEach((p) => {
  const lista = (medios.cuadros[p] || []).slice().sort();
  ok(`los cuadros de ${p} en la lista son los de img/avatar-profe-${p}/cuadros`, JSON.stringify(lista) === JSON.stringify(enDisco(`img/avatar-profe-${p}/cuadros`, ".webp")));
  ok(`cada cuadro de ${p} es <cara>-ojos o <cara>-boca de una cara que existe`, lista.every((c) => { const x = /^(.+)-(ojos|boca)$/.exec(c); return x && caras.has(x[1]); }), lista);
});
const iMedios = html.indexOf('src="js/rival-profe-medios.js"');
ok("bot.html carga la lista de medios antes que el rival", iMedios > 0 && iMedios < iRival);
ok("la voz del sitio no vuelve a leer el globo del profe", /closest\("\[data-voz-propia\]"\)/.test(leer("js/voz-pagina.js")) && /data-voz-propia/.test(leer("js/rival-profe.js")));
ok("con «reducir movimiento» la cara no se mece al hablar", /prefers-reduced-motion: reduce[\s\S]*rival-hablando[\s\S]*animation: none/.test(leer("css/rival-profe.css")));
ok("la voz de la profe Pame no usa las grabaciones del profe", /PROFE_ACTUAL === "oscar" \? MEDIOS\.voces/.test(leer("js/rival-profe.js")));

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
