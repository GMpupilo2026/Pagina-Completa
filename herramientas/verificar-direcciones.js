/* Comprueba las direcciones del entrenamiento (js/direcciones-entrenamiento.js).
 *
 *     node herramientas/verificar-direcciones.js
 *
 * No necesita navegador ni red. Lo que se rompe acá se rompe callado: una
 * herramienta nueva en Tareas o una sección nueva de tiempo que nadie puso en
 * las tablas queda fuera del reparto (o, peor, cae en la dirección
 * equivocada), y el informe se ve perfecto diciendo otra cosa. Por eso toda
 * herramienta de MaterialPlataforma y toda sección de TiempoSecciones tiene
 * que estar nombrada en las tablas, aunque sea con null, y todo recorte que
 * las tablas nombran tiene que existir en entreno/data/metas.json.
 *
 * Los bloques en pantalla (Informes y el armado de Tareas) los miran
 * verificar-informes.js y verificar-tareas.js, con navegador.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function igual(nombre, salio, esperaba) {
  const a = JSON.stringify(salio), b = JSON.stringify(esperaba);
  if (a === b) console.log("  ✓ " + nombre);
  else { fallos++; console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); }
}

const ctx = { window: {}, document: {}, fetch: () => Promise.reject(new Error("sin red")) };
vm.createContext(ctx);
["js/tiempo-secciones.js", "js/material-plataforma.js", "js/direcciones-entrenamiento.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx, { filename: f }));
const D = ctx.window.DireccionesEntrenamiento;
const SECCIONES = ctx.window.TiempoSecciones.SECCIONES;
const HERRAMIENTAS = ctx.window.MaterialPlataforma.HERRAMIENTAS;
const METAS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/metas.json"), "utf8"));
const claves = new Set(D.DIRECCIONES.map((d) => d.clave).concat([D.CONTROL.clave]));
const plano = (x) => JSON.parse(JSON.stringify(x));

console.log("-- Nada queda fuera de las tablas");
igual("cada sección de TiempoSecciones tiene su dirección (o null)",
  Object.keys(SECCIONES).filter((s) => !(s in D.POR_SECCION)), []);
igual("las tablas no nombran secciones que no existen",
  Object.keys(D.POR_SECCION).filter((s) => !(s in SECCIONES)), []);
igual("cada herramienta de Tareas tiene su dirección (o null)",
  HERRAMIENTAS.map((h) => h.slug).filter((s) => !(s in D.POR_HERRAMIENTA)), []);
igual("las tablas no nombran herramientas que no existen",
  Object.keys(D.POR_HERRAMIENTA).filter((s) => !HERRAMIENTAS.some((h) => h.slug === s)), []);
igual("toda dirección nombrada existe",
  [].concat(Object.values(D.POR_SECCION), Object.values(D.POR_HERRAMIENTA), Object.values(D.POR_GRUPO_DE_ESTUDIO),
    ...Object.values(D.POR_RECORTE).map((o) => Object.values(o))).filter((c) => c !== null && !claves.has(c)), []);

console.log("-- Los recortes que nombran las tablas existen");
const faltan = [];
Object.keys(D.POR_RECORTE).forEach((slug) => {
  const h = HERRAMIENTAS.find((x) => x.slug === slug);
  const lista = (h && METAS[h.recortes]) || [];
  Object.keys(D.POR_RECORTE[slug]).forEach((c) => { if (!lista.some((r) => r.clave === c)) faltan.push(slug + ":" + c); });
});
igual("cada recorte de POR_RECORTE está en metas.json", faltan, []);
const gruposEstudio = [...new Set(METAS.estudio.map((r) => r.grupo))].sort();
igual("cada grupo de fichas de Estudio tiene su dirección", gruposEstudio.filter((g) => !(g in D.POR_GRUPO_DE_ESTUDIO)), []);
igual("las tablas no nombran grupos de Estudio que no existen",
  Object.keys(D.POR_GRUPO_DE_ESTUDIO).filter((g) => !gruposEstudio.includes(g)), []);

console.log("-- Un renglón va a la dirección de su contenido");
const dir = (r, g) => { const d = D.deRenglon(r, g); return d ? d.clave : null; };
igual("10 de clavada: solución de ejercicios", dir({ material_slug: "temas", filtro_clave: "pin" }), "ejercicios");
igual("10 de final de torres: finales", dir({ material_slug: "temas", filtro_clave: "rookEndgame" }), "finales");
igual("temas sin recorte: solución de ejercicios", dir({ material_slug: "temas", filtro_clave: "" }), "ejercicios");
igual("una línea de la italiana: aperturas", dir({ material_slug: "aperturas", filtro_clave: "italiana-giuoco" }), "aperturas");
igual("Tus propios errores: análisis de partidas", dir({ material_slug: "tipos", filtro_clave: "errores" }), "analisis");
igual("la ficha de la oposición: finales", dir({ material_slug: "estudio", filtro_clave: "oposicion" }, "Finales"), "finales");
igual("una ficha de Estudio sin grupo: varias", dir({ material_slug: "estudio", filtro_clave: "oposicion" }), null);
igual("un curso: varias", dir({ material_tipo: "curso", material_slug: "temas" }), null);
igual("el diagnóstico: prueba de control", dir({ material_slug: "diagnostico" }), "control");

console.log("-- El reparto del tiempo");
const r = D.reparto([
  { seccion: "temas", minutos: 30 }, { seccion: "mates", minutos: 10 },
  { seccion: "finales", minutos: 20 }, { seccion: "aperturas", minutos: 20 },
  { seccion: "clase", minutos: 90 }, { seccion: "curso:calculo-y-visualizacion", minutos: 15 },
  { seccion: "diagnostico", minutos: 25 },
]);
igual("de mayor a menor (un empate, en el orden de la lista), con su parte del tiempo repartido",
  plano(r.direcciones).map((d) => [d.clave, d.minutos, d.pct]),
  [["ejercicios", 40, 50], ["aperturas", 20, 25], ["finales", 20, 25]]);
igual("la clase, el curso y el diagnóstico quedan aparte, sin inflar el reparto",
  plano(r.aparte).map((a) => [a.seccion, a.control]),
  [["clase", false], ["curso:calculo-y-visualizacion", false], ["diagnostico", true]]);
igual("solo clase: no hay nada que repartir", plano(D.reparto([{ seccion: "clase", minutos: 60 }]).direcciones), []);

console.log("-- El reparto de una tarea");
const t = D.contarRenglones([
  { renglon: { material_slug: "temas", filtro_clave: "pin" } },
  { renglon: { material_slug: "mates" } },
  { renglon: { material_slug: "temas", filtro_clave: "pawnEndgame" } },
  { renglon: { material_tipo: "curso", material_slug: "x" } },
]);
igual("cuenta renglones por dirección, en el orden de la lista, y aparte los que mezclan",
  [plano(t.direcciones).map((d) => [d.clave, d.renglones]), t.sin],
  [[["finales", 1], ["ejercicios", 2]], 1]);

console.log("-- Las páginas que lo usan lo cargan antes de usarlo");
const antes = (pagina, primero, despues) => {
  const s = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
  const a = s.indexOf(`src="${primero}"`), b = s.indexOf(`src="${despues}"`);
  return a > 0 && b > a;
};
igual("informes.html carga las direcciones antes de tiempo-secciones.js", antes("informes.html", "js/direcciones-entrenamiento.js", "js/tiempo-secciones.js"), true);
igual("tareas.html carga las direcciones antes de tareas.js", antes("tareas.html", "js/direcciones-entrenamiento.js", "js/tareas.js"), true);

if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron.`); process.exit(1); }
console.log("\nTodo en orden.");

/*! rev bfb5bbb0d2d82f9f */
