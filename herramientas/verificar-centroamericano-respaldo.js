/* La copia de seguridad de la tablet del árbitro (js/centroamericano-respaldo.js), sin navegador. Ver «La copia de seguridad de la
   tablet» en docs/decisiones/juegos-y-torneos.md. La parte con navegador (bajarla sin señal y cargarla en otra tablet) está en
   verificar-centroamericano-cola.js.

   Lo que se comprueba:
   - lo que se arma se vuelve a leer igual (ida y vuelta), en el orden en que se anotó;
   - el archivo se lee en español y no lleva el token;
   - un archivo cambiado, cortado o ajeno NO se carga, y no se carga NADA si una sola anotación no se reconoce;
   - solo se aceptan las acciones que la tablet anota por la cola: la lista de `PERMITIDAS` es exactamente la de las llamadas
     a `escribir("…")` de js/centroamericano-arbitro.js (si alguien agrega una acción nueva a la cola y se olvida de aquí, esto falla);
   - la página de la tablet carga el módulo.

       node herramientas/verificar-todo.js centroamericano-respaldo */
"use strict";
const fs = require("fs");
const path = require("path");
const R = require("../js/centroamericano-respaldo.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

const item = (n, accion, etiqueta, cuerpo, meta, creado) => ({ id: "00000000-0000-4000-8000-00000000000" + n, accion, cuerpo, etiqueta, meta: meta || {}, creado });
const ITEMS = [
  item(1, "guardar", "Resultado de la mesa 12", { ronda: 7, cambios: [{ mesa: 12, blancas: "A", negras: "B", valor: "1" }] }, { mesa: 12, valor: "1" }, 2000),
  item(2, "anotar", "Jugada ilegal de Pérez (mesa 4)", { ronda: 7, mesa: 4, color: "blancas", tipo: "ilegal", texto: "Enroque" }, { mesa: 4 }, 1000),
  item(3, "planilla", "Foto de las planillas de la mesa 5", { ronda: 7, mesa: 5, imagen: "data:image/jpeg;base64,/9j/AAAA" }, { mesa: 5 }, 3000),
];
const DATOS = { items: ITEMS, dueno: "a1b2c3d4e5f60718", ronda: 7, categoria: "Sub-8 Absoluto", ahora: Date.UTC(2026, 10, 6, 3, 42), mesas: [
  { mesa: 4, blancas: "Pérez", negras: "Soto", resultado: "sin resultado", pendiente: "" },
  { mesa: 12, blancas: "A", negras: "B", resultado: "sin resultado", pendiente: "1-0" },
  { mesa: 13, blancas: "C", negras: "D", resultado: "½-½", pendiente: "" },
] };
const FMT = { fechaHora: () => "5 de noviembre de 2026, 9:42 p. m.", hora: (ms) => "h" + ms };

console.log("=== Armar y volver a leer ===");
const texto = R.armar(DATOS, FMT);
const L = R.leer(texto);
igual("lo que se arma se vuelve a leer: mismas anotaciones, ordenadas por cuándo se hicieron (no por cuándo se listaron)", [L.ok, L.items.map((x) => x.id.slice(-1)), L.items.map((x) => x.accion)], [true, ["2", "1", "3"], ["anotar", "guardar", "planilla"]]);
igual("trae el cuerpo y la meta intactos (la foto incluida) y la huella del enlace", [L.items[1].cuerpo.cambios[0].valor, L.items[2].cuerpo.imagen, L.items[0].meta.mesa, L.dueno], ["1", "data:image/jpeg;base64,/9j/AAAA", 4, "a1b2c3d4e5f60718"]);
igual("una cola vacía también se arma y se lee: «nada pendiente»", [R.armar({ items: [], dueno: "x", ahora: 1 }, FMT).includes("Nada: todo lo que anotaste ya salió."), R.leer(R.armar({ items: [], dueno: "x", ahora: 1 }, FMT)).items.length], [true, 0]);

console.log("\n=== Lo que dice en palabras (para leerlo o pasarlo a mano) ===");
const arriba = texto.slice(0, texto.indexOf(R.MARCA));
igual("dice qué es, la categoría, la ronda y cuándo se hizo", [arriba.startsWith("COPIA DE SEGURIDAD DE LA TABLET DEL ÁRBITRO\nCentroamericano 2026 · Sub-8 Absoluto · Ronda 7\nHecha el 5 de noviembre de 2026, 9:42 p. m."), true], [true, true]);
igual("lista cada pendiente numerado, con su hora, en el orden en que se anotó", arriba.split("\n").filter((l) => /^\d+\. /.test(l)), ["1. h1000 — Jugada ilegal de Pérez (mesa 4)", "2. h2000 — Resultado de la mesa 12", "3. h3000 — Foto de las planillas de la mesa 5"]);
igual("lista las mesas: sin resultado, con el que ya tenían y con el pendiente de enviar dicho con palabras", arriba.split("\n").filter((l) => /^Mesa /.test(l)), ["Mesa 4: Pérez – Soto — sin resultado", "Mesa 12: A – B — 1-0 (pendiente de enviar)", "Mesa 13: C – D — ½-½"]);
igual("la parte para leer no lleva la foto (solo los datos de abajo)", arriba.includes("base64"), false);
igual("nombre del archivo: «respaldo-mesas-AAAAMMDD-HHMM.txt» (distinto cada vez)", [R.nombreArchivo(Date.UTC(2026, 10, 6, 3, 42)), R.nombreArchivo(Date.UTC(2026, 10, 6, 3, 43)) !== R.nombreArchivo(Date.UTC(2026, 10, 6, 3, 42))], ["respaldo-mesas-20261106-0342.txt", true]);
igual("sin darle el formateador de horas, igual arma el archivo (en UTC, y lo dice)", R.armar({ items: [ITEMS[0]], dueno: "x", ahora: Date.UTC(2026, 10, 6, 3, 42) }).includes("UTC"), true);

console.log("\n=== Nunca el token ===");
const TOKEN = "TOKEN-SECRETO-DEL-ENLACE-1234567890";
igual("el archivo solo trae la huella: si el token no está en lo que anotó el árbitro, no está en el archivo", R.armar(DATOS, FMT).includes(TOKEN), false);

console.log("\n=== Un archivo malo NO se carga ===");
const cuerpoDe = (t) => JSON.parse(t.slice(t.indexOf(R.MARCA) + R.MARCA.length).trim());
const con = (cambiar) => { const c = cuerpoDe(texto); cambiar(c); return texto.slice(0, texto.indexOf(R.MARCA)) + R.MARCA + "\n" + JSON.stringify(c); };
const malo = (nombre, t, parte) => { const r = R.leer(t); igual(nombre, [r.ok, typeof r.error === "string" && r.error.includes(parte), r.items], [false, true, undefined]); };
malo("un texto cualquiera", "hola", "no es una copia");
malo("vacío", "", "no es una copia");
malo("cortado a la mitad", texto.slice(0, texto.length - 60), "incompleta");
malo("sin el formato", con((c) => { c.formato = "otro"; }), "no es una copia");
malo("de otra versión", con((c) => { c.version = 99; }), "otra versión");
malo("sin decir de qué enlace es", con((c) => { c.dueno = ""; }), "enlace");
malo("sin lista", con((c) => { delete c.items; }), "lista");
malo("con una acción que la tablet no anota (como «concluir»)", con((c) => { c.items[1].accion = "concluir"; }), "no reconoce");
malo("con una acción inventada en la 3.ª anotación: no se carga NI la 1.ª ni la 2.ª", con((c) => { c.items[2].accion = "borrar_todo"; }), "no reconoce");
malo("con un id raro", con((c) => { c.items[0].id = "../../etc"; }), "no reconoce");
malo("con un cuerpo que no es un objeto", con((c) => { c.items[0].cuerpo = "texto"; }), "no reconoce");
malo("con un cuerpo nulo", con((c) => { c.items[0].cuerpo = null; }), "no reconoce");
malo("con una etiqueta que no es texto", con((c) => { c.items[0].etiqueta = 5; }), "no reconoce");
malo("con una etiqueta larguísima", con((c) => { c.items[0].etiqueta = "x".repeat(301); }), "no reconoce");
malo("con más de 500 anotaciones", con((c) => { c.items = new Array(501).fill(c.items[0]); }), "demasiadas");
malo("con un elemento que no es un objeto", con((c) => { c.items[0] = 7; }), "no reconoce");
igual("sin `meta` o sin `creado` se acepta (se completan)", (() => { const r = R.leer(con((c) => { delete c.items[0].meta; delete c.items[0].creado; })); return [r.ok, r.items[0].meta, r.items[0].creado]; })(), [true, {}, 0]);

console.log("\n=== Qué dice el aviso al cargar ===");
igual("sumadas, repetidas, las dos cosas y nada", [R.resumenCarga(2, 0), R.resumenCarga(0, 3), R.resumenCarga(1, 1), R.resumenCarga(0, 0)], [
  "Se cargaron 2 anotaciones. Se mandan solas cuando haya señal.",
  "Esas 3 anotaciones ya estaban en la tablet: no se sumó nada.",
  "Se cargaron 1 anotación (1 ya estaba). Se mandan solas cuando haya señal.",
  "La copia no traía nada pendiente.",
]);

console.log("\n=== Las acciones permitidas son las de la cola de la tablet ===");
const fuente = fs.readFileSync(path.join(RAIZ, "js/centroamericano-arbitro.js"), "utf8");
const enLaTablet = [...new Set([...fuente.matchAll(/\bescribir\("([a-z_]+)"/g)].map((m) => m[1]))].sort();
igual("PERMITIDAS = las acciones de `escribir(\"…\")` de la tablet (ni una más, ni una menos)", R.PERMITIDAS.slice().sort(), enLaTablet);

console.log("\n=== La página de la tablet ===");
const html = fs.readFileSync(path.join(RAIZ, "centroamericano-arbitro.html"), "utf8");
const pos = (nombre) => html.indexOf('<script src="js/' + nombre + '"></script>');
igual("carga el módulo después de la cola y antes de la página", pos("centroamericano-cola.js") >= 0 && pos("centroamericano-cola.js") < pos("centroamericano-respaldo.js") && pos("centroamericano-respaldo.js") < pos("centroamericano-arbitro.js"), true);
igual("tiene los dos botones y el selector de archivo (que solo acepta texto)", [/id="bajar-copia"/.test(html), /id="cargar-copia"/.test(html), /<input type="file" id="archivo-copia" accept="\.txt,text\/plain"/.test(html)], [true, true, true]);
const modulo = fs.readFileSync(path.join(RAIZ, "js/centroamericano-respaldo.js"), "utf8");
igual("el módulo no guarda ni manda nada por sí solo (sin red, sin almacenamiento)", /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.cookie|console)\b/.test(modulo.replace(/\/\*[\s\S]*?\*\//g, "")), false);

console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
