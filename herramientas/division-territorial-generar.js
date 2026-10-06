/* Genera js/division-territorial.js (provincia → cantón → distrito, para las
 * listas en cascada de jdn.html) desde herramientas/division-territorial-tse.json,
 * que saca del PDF del TSE herramientas/division-territorial-extraer.py.
 *
 *   node herramientas/division-territorial-generar.js
 *
 * El TSE escribe todo en mayúsculas y sin tildes («PEREZ ZELEDON»). Los
 * nombres no se cambian: solo se pasan a mayúscula inicial y se les ponen las
 * tildes con la tabla TILDES, palabra por palabra. Una palabra con tilde que
 * no esté en la tabla sale sin tilde (no rompe nada); una palabra que no
 * existe en la lista del TSE no puede entrar en la tabla: el generador falla.
 * js/division-territorial.js no se edita a mano.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ENTRADA = path.join(__dirname, "division-territorial-tse.json");
const SALIDA = path.join(RAIZ, "js", "division-territorial.js");

const TILDES = {
  ALEGRIA: "Alegría", ANDRES: "Andrés", ANGELES: "Ángeles", ASERRI: "Aserrí", ASUNCION: "Asunción",
  BAHIA: "Bahía", BARBARA: "Bárbara", BARU: "Barú", BATAN: "Batán", BELEN: "Belén", BOLIVAR: "Bolívar",
  BOLSON: "Bolsón", CAJON: "Cajón", CARRANDI: "Carrandí", CHIRRIPO: "Chirripó", COBANO: "Cóbano",
  COLON: "Colón", CONCEPCION: "Concepción", CORTES: "Cortés", CRISTOBAL: "Cristóbal", DIRIA: "Diriá",
  DUACARI: "Duacarí", ESCAZU: "Escazú", ESPIRITU: "Espíritu", GUACIMA: "Guácima", GUACIMO: "Guácimo",
  GUAPILES: "Guápiles", GUAYCARA: "Guaycará", GUTIERREZ: "Gutiérrez", JACO: "Jacó", JARDIN: "Jardín",
  JERONIMO: "Jerónimo", JESUS: "Jesús", JIMENEZ: "Jiménez", JOAQUIN: "Joaquín", JOSE: "José",
  LEON: "León", LIBANO: "Líbano", LIMON: "Limón", LUCIA: "Lucía", MANSION: "Mansión", MARIA: "María",
  MATAMBU: "Matambú", NICOLAS: "Nicolás", PARA: "Pará", PARAISO: "Paraíso", PARAMO: "Páramo",
  PATARRA: "Patarrá", PAVON: "Pavón", PEREZ: "Pérez", PLATANO: "Plátano", POAS: "Poás", POCOCI: "Pococí",
  PURABA: "Purabá", RAMON: "Ramón", REVENTAZON: "Reventazón", RINCON: "Rincón", RIO: "Río", RIOS: "Ríos",
  RODRIGUEZ: "Rodríguez", SAMARA: "Sámara", SANCHEZ: "Sánchez", SARAPIQUI: "Sarapiquí", SARCHI: "Sarchí",
  SEBASTIAN: "Sebastián", TARCOLES: "Tárcoles", TARRAZU: "Tarrazú", TIBAS: "Tibás", TILARAN: "Tilarán",
  TOMAS: "Tomás", UNION: "Unión", VAZQUEZ: "Vázquez", VOLCAN: "Volcán", ZELEDON: "Zeledón",
};
// En minúscula en medio del nombre: «Montes de Oca», «San José o Pizote». El
// artículo, solo detrás de «de» («San José de la Montaña»): «Valle La Estrella»
// y «Los Guido» lo llevan con mayúscula. «El General» es un nombre propio:
// «San Isidro de El General».
const MENORES = new Set(["DE", "DEL", "O", "Y"]);
const ARTICULOS = new Set(["LA", "LAS", "LOS", "EL"]);

function nombre(tse) {
  const ps = tse.split(" ");
  return ps.map((p, i) => {
    if (TILDES[p]) return TILDES[p];
    if (/^[IVX]+$/.test(p)) return p;   // León XIII
    if (i > 0 && MENORES.has(p)) return p.toLowerCase();
    if (i > 0 && ARTICULOS.has(p) && ps[i - 1] === "DE" && !(p === "EL" && ps[i + 1] === "GENERAL")) return p.toLowerCase();
    return p.charAt(0) + p.slice(1).toLowerCase();
  }).join(" ");
}

const { fuente, provincias } = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));
const palabras = new Set();
for (const [p, cs] of Object.entries(provincias)) {
  for (const [c, ds] of Object.entries(cs)) for (const n of [p, c, ...ds]) n.split(" ").forEach((w) => palabras.add(w));
}
const sobran = Object.keys(TILDES).filter((w) => !palabras.has(w));
if (sobran.length) throw new Error("TILDES tiene palabras que no están en la lista del TSE: " + sobran.join(", "));

const lista = Object.entries(provincias).map(([p, cs]) => ({
  provincia: nombre(p),
  cantones: Object.entries(cs).map(([c, ds]) => ({ canton: nombre(c), distritos: ds.map(nombre) })),
}));

const js = `/* GENERADO por herramientas/division-territorial-generar.js: no se edita a mano.
 * ${fuente}.
 * Provincia → cantón → distrito, en el orden del decreto. */
(function (raiz) {
  "use strict";
  const DIVISION = ${JSON.stringify(lista)};
  raiz.DivisionTerritorial = DIVISION;
  if (typeof module !== "undefined" && module.exports) module.exports = DIVISION;
})(typeof window !== "undefined" ? window : globalThis);
`;
fs.writeFileSync(SALIDA, js);
const nC = lista.reduce((s, p) => s + p.cantones.length, 0);
const nD = lista.reduce((s, p) => s + p.cantones.reduce((t, c) => t + c.distritos.length, 0), 0);
console.log(`${lista.length} provincias, ${nC} cantones, ${nD} distritos → js/division-territorial.js`);
