#!/usr/bin/env node
/* data/contenido-panel.json (la marca «Nuevo» del panel del alumno) está al
 * día con los archivos de los que sale. Si alguien agrega un artículo, un
 * curso, una lección o una ficha y no lo vuelve a armar, el panel nunca le
 * diría «Nuevo» a nadie, sin ningún error. */
const fs = require("fs");
const { armar, SALIDA } = require("./contenido-panel");

let fallos = 0;
function cierto(txt, ok) { console.log((ok ? "  ✓ " : "  ✗ ") + txt); if (!ok) fallos += 1; }

const hecho = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, "utf8") : "";
cierto("data/contenido-panel.json está al día (si no: node herramientas/contenido-panel.js)", hecho === armar());
const d = JSON.parse(hecho || "{}");
cierto("trae las siete tarjetas", Object.keys(d).length === 7);
cierto("ninguna viene vacía", Object.values(d).every((ids) => Array.isArray(ids) && ids.length > 0));
cierto("sin identificadores repetidos en una tarjeta", Object.values(d).every((ids) => new Set(ids).size === ids.length));

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
