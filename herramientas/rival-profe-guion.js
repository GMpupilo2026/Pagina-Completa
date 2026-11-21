#!/usr/bin/env node
/* El guion para que el profe grabe las frases del rival (js/rival-profe.js).

   Lo saca de las mismas frases del código (una sola copia) y marca cuáles ya
   tienen grabación (js/rival-profe-medios.js). Escribe
   herramientas/rival-profe/guion.md, que no se publica.

       node herramientas/rival-profe-guion.js
*/
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");
const w = { localStorage: { length: 0, key: () => null, getItem: () => null } };
const doc = { readyState: "complete", getElementById: () => null, addEventListener() {} };
new Function("window", leer("js/avatar-profe-oscar.js"))(w);
new Function("window", leer("js/rival-profe-medios.js"))(w);
new Function("window", "document", leer("js/rival-profe.js"))(w, doc);
const grabadas = new Set(w.RivalProfeMedios.voces);

const CUANDO = {
  saludo: "Al empezar la partida",
  regalo: "Le regalaron una pieza (se la comió)",
  golpe: "Le ganaron material (se queja)",
  jaqueTuyo: "El alumno le da jaque",
  jaqueMio: "Él da jaque",
  charla: "A veces, sin motivo",
  esperando: "El alumno tarda 30 segundos",
  dormido: "El alumno tarda 70 segundos",
  pista: "Dejó una pieza colgando a propósito (niveles 1 y 2)",
  laViste: "El alumno encontró la pieza colgando",
  noLaViste: "El alumno no la vio",
  ganoYo: "Ganó él",
  ganasTu: "Ganó el alumno",
  tablas: "Tablas",
  rendicion: "El alumno se rindió",
};

const total = Object.values(w.RivalProfe.FRASES).reduce((n, l) => n + l.length, 0);
let n = 0;
const lineas = [
  "# Guion del profe rival",
  "",
  `${total} frases · ${grabadas.size} grabadas. Lo arma \`herramientas/rival-profe-guion.js\`; no se edita a mano.`,
  "",
  "## Cómo grabar",
  "",
  "- Con el celular (nota de voz) en un cuarto sin eco ni ruido, a un palmo de la boca.",
  "- **Una grabación por frase**, con el nombre de archivo de la tabla (por ejemplo `golpe-esa-vara.m4a`). Si es más fácil, todo seguido en una sola grabación, en este orden, con **dos segundos de silencio** entre frase y frase, y yo la corto.",
  "- Dila a tu manera, con tu tono de clase. Si cambias las palabras, avísame: el globo tiene que decir lo mismo que se oye (quien no oye lo lee).",
  "- Los archivos van en `herramientas/rival-profe/grabaciones/` y se convierten con `py -3 herramientas/rival-profe-medios.py`.",
  "",
];
for (const [evento, lista] of Object.entries(w.RivalProfe.FRASES)) {
  lineas.push(`## ${CUANDO[evento] || evento}`, "", "| # | Archivo | Frase | ✓ |", "|---|---|---|---|");
  for (const f of lista) {
    n += 1;
    lineas.push(`| ${n} | \`${f.id}\` | ${f.texto} | ${grabadas.has(f.id) ? "✓" : ""} |`);
  }
  lineas.push("");
}
const destino = path.join(RAIZ, "herramientas", "rival-profe", "guion.md");
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, lineas.join("\n"));
console.log(`${path.relative(RAIZ, destino)}: ${total} frases, ${grabadas.size} grabadas.`);

/*! rev bfb5bbb0d2d82f9f */
