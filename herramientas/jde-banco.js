/* El banco de la inscripción de los JDE (data/jde-banco.json).

   Lo lee inscripcion-jde.html para que quien inscribe elija su colegio de una
   lista, vea de una vez a qué Dirección Regional pertenece y pueda traer a los
   estudiantes que ya jugaron los JDE con ese colegio, en vez de escribirlos
   uno por uno. Sale de lo que ya se leyó de chess-results para
   ajedrez-estudiantil.html (data/ajedrez-estudiantil.json y
   data/ajedrez-estudiantil-jugadores.json), así que no se edita a mano: se
   vuelve a armar con este script, y el flujo mensual de «Ajedrez estudiantil»
   lo corre después de leer los torneos nuevos.

     node herramientas/jde-banco.js            arma data/jde-banco.json
     node herramientas/jde-banco.js --revisar  solo cuenta, sin escribir

   Lo que decide, y por qué:
   - Solo entran las instituciones con al menos un torneo de los JDE
     (institucional, regional, interregional o nacional). Los países y clubes
     de los torneos internacionales y federativos no son centros educativos.
   - La Dirección Regional de un colegio es la que más se repite entre sus
     torneos, y solo cuenta si es una de las 27 de la Normativa (art. 56):
     chess-results trae también «Esparza» o «Bagaces», que son circuitos y no
     sirven para decir a cuál pertenece. Sin región clara queda vacía y la
     elige quien inscribe; nunca se adivina.
   - Los estudiantes son los de los JDE de los últimos tres años: son los que
     pueden volver a inscribirse. Es lo que chess-results ya publica, sin cédula
     ni fecha de nacimiento, y los nombres que pidieron salir ya no están en la
     fuente (herramientas/datos/ajedrez-estudiantil-excluidos.txt). El sexo solo
     se guarda cuando es seguro: haber jugado un torneo femenino.
   Ver «La inscripción de los JDE» en docs/decisiones/juegos-y-torneos.md. */
"use strict";
const fs = require("fs");
const path = require("path");
const G = require("../js/pareo/grupos.js");

const RAIZ = path.resolve(__dirname, "..");
const ETAPAS_JDE = ["Institucional o circuital", "Regional", "Interregional", "Nacional"];
const AÑOS_DE_ESTUDIANTES = 3;

// Lo que chess-results trae en «Club/Ciudad» y no es un centro educativo: la
// sección de un grupo («10-4», «7 1»), un país o el nombre de una región.
const PAISES = ["costa rica", "nicaragua", "guatemala", "honduras", "el salvador", "panama", "belice", "mexico", "espana", "estados unidos de america", "republica dominicana", "colombia", "venezuela", "cuba"];
const LUGARES_SUELTOS = ["esparza", "escazu", "belen", "deportivo", "laboratorio"];
function noEsCentro(clave) {
  return clave.length < 3 || /^\d+( \d+)?( ?[a-z]{1,3})?$/.test(clave) || PAISES.includes(clave) || LUGARES_SUELTOS.includes(clave);
}

function armar(torneosJson, jugadoresJson) {
  const columnas = torneosJson.columnas;
  const torneos = new Map();
  for (const fila of torneosJson.torneos) {
    const t = {};
    columnas.forEach((c, i) => { t[c] = fila[i]; });
    torneos.set(t.clave, t);
  }
  const anioActual = Math.max(...[...torneos.values()].map((t) => t.anio));
  const desde = anioActual - AÑOS_DE_ESTUDIANTES + 1;

  const porInstitucion = new Map(); // índice en jugadoresJson.instituciones → datos
  const estudiantes = new Map();    // "inst|jugador" → datos
  const col = {};
  jugadoresJson.columnas_participaciones.forEach((c, i) => { col[c] = i; });

  for (const p of jugadoresJson.participaciones) {
    const t = torneos.get(p[col.clave]);
    const inst = p[col.institucion];
    if (!t || inst == null || !ETAPAS_JDE.includes(t.etapa)) continue;
    let d = porInstitucion.get(inst);
    if (!d) porInstitucion.set(inst, (d = { torneos: new Set(), regiones: new Map(), ultimo: 0 }));
    d.torneos.add(t.clave);
    d.ultimo = Math.max(d.ultimo, t.anio);
    const region = G.direccionDe(t.region);
    if (region) d.regiones.set(region, (d.regiones.get(region) || 0) + 1);

    if (t.anio < desde) continue;
    const llave = inst + "|" + p[col.jugador];
    let e = estudiantes.get(llave);
    if (!e) estudiantes.set(llave, (e = { inst, jugador: p[col.jugador], ultimo: 0, mujer: false }));
    e.ultimo = Math.max(e.ultimo, t.anio);
    if (/femenin/i.test(t.rama || "")) e.mujer = true;
  }

  // Una misma institución escrita igual (sin tildes ni mayúsculas) es una sola.
  const clave = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const instituciones = [];
  const indice = new Map(); // índice original → índice nuevo
  const porClave = new Map();
  for (const [i, d] of [...porInstitucion].sort((a, b) => clave(jugadoresJson.instituciones[a[0]][0]).localeCompare(clave(jugadoresJson.instituciones[b[0]][0]), "es"))) {
    const nombre = jugadoresJson.instituciones[i][0].trim();
    const k = clave(nombre);
    if (!k || noEsCentro(k)) continue;
    const region = [...d.regiones].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0];
    if (porClave.has(k)) {
      const otra = instituciones[porClave.get(k)];
      otra.p += d.torneos.size; otra.u = Math.max(otra.u, d.ultimo);
      if (!otra.d && region) otra.d = region[0];
      indice.set(i, porClave.get(k));
      continue;
    }
    porClave.set(k, instituciones.length);
    indice.set(i, instituciones.length);
    instituciones.push({ n: nombre, d: region ? region[0] : "", p: d.torneos.size, u: d.ultimo });
  }

  const vistos = new Map();
  const lista = [];
  for (const e of [...estudiantes.values()].sort((a, b) => b.ultimo - a.ultimo || clave(jugadoresJson.jugadores[a.jugador][0]).localeCompare(clave(jugadoresJson.jugadores[b.jugador][0]), "es"))) {
    const ni = indice.get(e.inst);
    if (ni == null) continue;
    const nombre = jugadoresJson.jugadores[e.jugador][0].trim();
    const llave = ni + "|" + clave(nombre);
    // La misma persona en dos escrituras del colegio: una sola, y si en alguna
    // jugó un torneo femenino, ese dato se conserva.
    if (vistos.has(llave)) { if (e.mujer) vistos.get(llave).splice(3, 1, "w"); continue; }
    const fila = e.mujer ? [nombre, ni, e.ultimo, "w"] : [nombre, ni, e.ultimo];
    vistos.set(llave, fila);
    lista.push(fila);
  }
  return {
    actualizado: jugadoresJson.actualizado || torneosJson.actualizado || "",
    fuente: "chess-results.com, leído para ajedrez-estudiantil.html",
    columnas_instituciones: ["n", "d", "p", "u"],
    instituciones: instituciones.map((x) => [x.n, x.d, x.p, x.u]),
    columnas_estudiantes: ["nombre", "institucion", "ultimo", "sexo"],
    estudiantes: lista,
  };
}

module.exports = { armar };

if (require.main === module) {
  const leer = (f) => JSON.parse(fs.readFileSync(path.join(RAIZ, f), "utf8"));
  const banco = armar(leer("data/ajedrez-estudiantil.json"), leer("data/ajedrez-estudiantil-jugadores.json"));
  const conRegion = banco.instituciones.filter((x) => x[1]).length;
  console.log(`${banco.instituciones.length} instituciones (${conRegion} con Dirección Regional) y ${banco.estudiantes.length} estudiantes de los últimos años.`);
  if (!process.argv.includes("--revisar")) {
    fs.writeFileSync(path.join(RAIZ, "data/jde-banco.json"), JSON.stringify(banco) + "\n");
    console.log("data/jde-banco.json escrito.");
  }
}
