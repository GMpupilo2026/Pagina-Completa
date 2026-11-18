#!/usr/bin/env node
/* Verifica el puzzle del día (js/entreno-temas.js, temas.html?del-dia=1).

   Sin navegador: saca del archivo el bloque «El puzzle del día» y lo corre
   con el banco de verdad (entreno/data/temas.json).
   - La misma fecha da siempre el mismo ejercicio (es el mismo para todos), y
     días distintos dan ejercicios distintos casi siempre.
   - El elegido existe en el banco, tiene rating dentro de la banda y viene de
     un tema de motivo concreto (no de «Mezcla», las fases o el largo), que
     además lo contiene: así se anota bajo ese tema y cuenta para él.
   - El día es el de Costa Rica: a las 23:30 de allá (05:30 UTC del día
     siguiente) sigue siendo el mismo día.
   - Al resolverlo se anota con el tema de origen (no con «__del_dia»), lleva
     la fecha en el detalle, y el hub de Entrenamiento tiene su tarjeta.

     node herramientas/verificar-puzzle-del-dia.js */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const RAIZ = path.join(__dirname, "..");

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const fuente = fs.readFileSync(path.join(RAIZ, "js/entreno-temas.js"), "utf8");
const ini = fuente.indexOf("/* ---------------- El puzzle del día");
const fin = fuente.indexOf("function solvedCountFor(");
ok(ini > 0 && fin > ini, "no encuentro el bloque «El puzzle del día» en js/entreno-temas.js");

const DATA = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
const grupos = fuente.match(/const GRUPOS_DE_MOTIVO = (\[[^\]]*\]);/);
ok(!!grupos, "no encuentro GRUPOS_DE_MOTIVO");

if (ini > 0 && fin > ini && grupos) {
  const ctx = { Intl, Math, JSON, Set, Object, Date,
    TEMAS_DE_TACTICA: new Set(((DATA.groups || []).find((g) => g.id === "tactica") || { themes: [] }).themes.map((t) => t.key)) };
  vm.createContext(ctx);
  vm.runInContext("const GRUPOS_DE_MOTIVO = " + grupos[1] + ";\n" + fuente.slice(ini, fin)
    + "\nthis.API = { elegirDelDia, candidatosDelDia, fechaCR, DEL_DIA_MIN, DEL_DIA_MAX, GRUPOS_DE_MOTIVO };", ctx);
  const A = ctx.API;

  const candidatos = A.candidatosDelDia(DATA);
  ok(candidatos.length >= 300, `debería haber cientos de candidatos y hay ${candidatos.length}`);
  const deMotivo = new Set((DATA.groups || []).filter((g) => A.GRUPOS_DE_MOTIVO.includes(g.id)).flatMap((g) => g.themes.map((t) => t.key)));
  const malos = candidatos.filter((c) => {
    const p = DATA.puzzles[c.id];
    return !p || p.rating < A.DEL_DIA_MIN || p.rating > A.DEL_DIA_MAX || !deMotivo.has(c.tema) || !(DATA.themes[c.tema] || []).includes(c.id);
  });
  ok(!malos.length, `${malos.length} candidatos fuera de la banda, de un tema que no es de motivo o que no los contiene (p. ej. ${JSON.stringify(malos[0])})`);
  ok(new Set(candidatos.map((c) => c.id)).size === candidatos.length, "un mismo ejercicio aparece dos veces entre los candidatos");

  const a = A.elegirDelDia(DATA, "2026-11-17"), b = A.elegirDelDia(DATA, "2026-11-17");
  ok(a && b && a.id === b.id && a.tema === b.tema, "la misma fecha tiene que dar el mismo ejercicio");
  const dias = [];
  for (let d = 1; d <= 30; d++) dias.push(A.elegirDelDia(DATA, "2026-12-" + String(d).padStart(2, "0")).id);
  ok(new Set(dias).size >= 27, `30 días seguidos deberían dar casi siempre ejercicios distintos: dieron ${new Set(dias).size}`);

  // 23:30 en Costa Rica (UTC-6) del 17 = 05:30 UTC del 18.
  ok(A.fechaCR(new Date("2026-11-18T05:30:00Z")) === "2026-11-17", `a las 23:30 de Costa Rica tiene que seguir siendo el 17: dio ${A.fechaCR(new Date("2026-11-18T05:30:00Z"))}`);
  ok(A.fechaCR(new Date("2026-11-18T06:30:00Z")) === "2026-11-18", "a las 00:30 de Costa Rica ya es el 18");
}

// Se anota con el tema de origen y la fecha, y el hub lo ofrece.
ok(/const temaDeOrigen = enDelDia\(\) \? delDia\.tema : currentTheme;/.test(fuente), "finishPuzzle tiene que calcular el tema de origen del puzzle del día");
ok(/theme: temaDeOrigen/.test(fuente) && /del_dia: delDia\.fecha/.test(fuente), "el ejercicio se tiene que anotar con el tema de origen y la fecha del día");
ok(/TEMAS_DE_TACTICA\.has\(temaDeOrigen\)/.test(fuente), "la actividad (tactica o temas) tiene que salir del tema de origen");
ok(/has\('del-dia'\)\)\{ abrirDelDia\(\); return; \}/.test(fuente), "temas.html?del-dia=1 tiene que abrir el puzzle del día");
const hub = fs.readFileSync(path.join(RAIZ, "entreno/index.html"), "utf8");
ok(/<a href="temas\.html\?del-dia=1"[^>]*>Puzzle del día<\/a>/.test(hub), "el hub de Entrenamiento tiene que tener la tarjeta «Puzzle del día»");

if (fallos.length) {
  console.error("✗ puzzle del día:\n  - " + fallos.join("\n  - "));
  process.exit(1);
}
console.log("✓ puzzle del día: el mismo para todos cada día de Costa Rica, del banco, de un tema de motivo y bien anotado.");

/*! rev bfb5bbb0d2d82f9f */
