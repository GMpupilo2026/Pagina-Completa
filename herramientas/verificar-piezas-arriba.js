#!/usr/bin/env node
/* La lista de piezas va ARRIBA del tablero.

   Lo pidió la Academia para quien no ve: primero se lee la posición y después
   se resuelve. Con la lista debajo, el lector de pantalla pasaba por las 64
   casillas del tablero antes de llegar a «Piezas», y quien juega sin ver no
   sabía todavía qué había en él. Ver «Las piezas, arriba del tablero» en
   docs/decisiones/accesibilidad.md.

   Revisa, sin navegador, cada página que tiene las dos cosas —la lectura de la
   posición (`id="position-readout"`) y el tablero (`id="board"`)— y exige que
   la lectura venga antes en el HTML, que es el orden en que la lee el lector.

   Uso: node herramientas/verificar-piezas-arriba.js */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const FUERA = new Set(["node_modules", ".git", ".claude", "docs", "supabase", "herramientas", "prueba-reloj", "prueba-voz"]);

function paginas(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!FUERA.has(e.name)) paginas(path.join(dir, e.name), out); }
    else if (e.name.endsWith(".html")) out.push(path.join(dir, e.name));
  }
  return out;
}

let fallos = 0;
let revisadas = 0;
for (const f of paginas(RAIZ, [])) {
  const s = fs.readFileSync(f, "utf8");
  const lectura = s.search(/id="position-readout"/);
  const tablero = s.search(/id="board"/);
  if (lectura < 0 || tablero < 0) continue;
  revisadas += 1;
  const rel = path.relative(RAIZ, f).split(path.sep).join("/");
  if (lectura > tablero) {
    console.log("  ✗ " + rel + ": la lista de piezas (#position-readout) está debajo del tablero (#board)");
    fallos += 1;
  } else {
    console.log("  ✓ " + rel);
  }
}
if (revisadas < 8) {
  console.log("  ✗ solo " + revisadas + " páginas con lista de piezas y tablero: ¿cambió el id de alguna?");
  fallos += 1;
}
console.log(fallos ? `\n✗ ${fallos} problema(s).` : `\n✓ Todo bien: en las ${revisadas} páginas las piezas van arriba del tablero.`);
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
