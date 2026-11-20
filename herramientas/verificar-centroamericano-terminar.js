/* «Terminé mi ronda completa» (js/centroamericano-terminar.js y la tablet del árbitro), sin navegador. Ver «La tablet del árbitro: el clásico siempre
   confirma el resultado…» en docs/decisiones/juegos-y-torneos.md. El cuadro en pantalla (radios, casillas, cancelar, Escape) lo prueba
   verificar-centroamericano-mesas-pagina.js.

   Lo que se comprueba aquí:
   - los motivos y las casillas de cada uno (el de «terminé todas mis partidas» pide tres; los demás, una);
   - `puedeConfirmar`: sin motivo no; con motivo pero una casilla sin marcar no; con TODAS marcadas sí; un motivo que no existe no; una lista del largo
     equivocado no (por ejemplo, las casillas de otro motivo);
   - la tablet usa este cuadro (y ya no el «confirmar» de una línea) y carga el módulo antes de la página;
   - el módulo no guarda ni manda nada (sin red ni almacenamiento: el motivo se queda en memoria).

       node herramientas/verificar-todo.js centroamericano-terminar */
"use strict";
const fs = require("fs");
const path = require("path");
const T = require("../js/centroamericano-terminar.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

console.log("=== Los motivos ===");
igual("cuatro motivos, en este orden", T.MOTIVOS.map((m) => m.id), ["termine", "almuerzo", "reasignado", "otro"]);
igual("«terminé todas mis partidas» pide tres casillas y los otros tres motivos una cada uno", T.MOTIVOS.map((m) => m.casillas.length), [3, 1, 1, 1]);
igual("las casillas de «terminé» hablan de las planillas, de las partidas con su resultado y de que no hay nada pendiente", T.MOTIVOS[0].casillas.map((c) => [/planillas/.test(c), /partidas.*resultado/.test(c), /nada pendiente/.test(c)]), [[true, false, false], [false, true, false], [false, false, true]]);
igual("almorzar, reasignado y otro piden que no deja partidas en juego ni nada pendiente", T.MOTIVOS.slice(1).every((m) => /partidas en juego/.test(m.casillas[0]) && /pendiente/.test(m.casillas[0])), true);
igual("el motivo de almorzar y el de reasignado están escritos como los pidió la organización", [T.MOTIVOS[1].texto, T.MOTIVOS[2].texto], ["Me enviaron a almorzar o a descansar", "Me reasignaron a otras mesas o a otra tarea"]);

console.log("\n=== Cuándo se puede confirmar ===");
igual("sin motivo, no (aunque haya casillas marcadas)", [T.puedeConfirmar(null, [true, true, true]), T.puedeConfirmar("", []), T.puedeConfirmar(undefined, undefined)], [false, false, false]);
igual("un motivo que no existe, no", T.puedeConfirmar("vacaciones", [true]), false);
igual("«terminé» con las tres marcadas, sí; con una sin marcar, no; con ninguna, no", [T.puedeConfirmar("termine", [true, true, true]), T.puedeConfirmar("termine", [true, false, true]), T.puedeConfirmar("termine", [false, false, false])], [true, false, false]);
igual("los de una casilla: marcada, sí; sin marcar, no", ["almuerzo", "reasignado", "otro"].map((id) => [T.puedeConfirmar(id, [true]), T.puedeConfirmar(id, [false])]), [[true, false], [true, false], [true, false]]);
igual("la lista del largo equivocado no vale (las casillas de otro motivo no sirven): una marcada para «terminé», o tres para «almuerzo»", [T.puedeConfirmar("termine", [true]), T.puedeConfirmar("almuerzo", [true, true, true])], [false, false]);
igual("solo vale `true` de verdad (no un texto ni un 1)", [T.puedeConfirmar("almuerzo", ["si"]), T.puedeConfirmar("almuerzo", [1])], [false, false]);

console.log("\n=== La tablet lo usa ===");
const arbitro = fs.readFileSync(path.join(RAIZ, "js/centroamericano-arbitro.js"), "utf8");
const cuerpo = arbitro.slice(arbitro.indexOf("async function concluirLabores"), arbitro.indexOf("async function concluirLabores") + 2600);
igual("«Terminé mi ronda completa» abre el cuadro de motivo y casillas (CentroamericanoTerminar.preguntar), no un confirmar de una línea", [/CentroamericanoTerminar/.test(cuerpo), /\.preguntar\(/.test(cuerpo), /Avisos\.confirmar\(/.test(cuerpo)], [true, true, false]);
igual("solo manda «concluir» si confirmó (sigue a `if (!sigue) return`)", /if \(!sigue\) return;[\s\S]{0,200}invocar\("concluir"/.test(cuerpo), true);
const html = fs.readFileSync(path.join(RAIZ, "centroamericano-arbitro.html"), "utf8");
const pos = (n) => html.indexOf('<script src="js/' + n + '"></script>');
igual("la página carga el módulo antes de js/centroamericano-arbitro.js", pos("centroamericano-terminar.js") > 0 && pos("centroamericano-terminar.js") < pos("centroamericano-arbitro.js"), true);
const modulo = fs.readFileSync(path.join(RAIZ, "js/centroamericano-terminar.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
igual("el módulo no manda ni guarda nada (sin red, sin almacenamiento, sin console)", /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.cookie|console|innerHTML)\b/.test(modulo), false);

console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
