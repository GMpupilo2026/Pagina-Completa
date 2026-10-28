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
   - **El circuito y el tipo de cada centro salen de los listados oficiales del
     MEP** (herramientas/mep-centros-leer.py → herramientas/datos/mep-centros.csv):
     código, nombre, Dirección Regional, circuito y si es escuela o colegio. Cada
     colegio de chess-results se junta con su centro del MEP por el nombre, dentro
     de su Dirección Regional, y solo si es una coincidencia segura (la misma
     palabra clave, o un solo candidato): una coincidencia dudosa no se hace, y el
     centro queda sin circuito para que lo elija quien inscribe. Los centros del
     MEP que nunca jugaron los JDE también entran: el docente de una escuela nueva
     tiene que poder encontrarla.
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

// ---- Los nombres de los centros, para juntar el de chess-results con el del MEP
const sinTildes = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e"]);
// Lo que dice «es una escuela» o «es un colegio» y no distingue a un centro de otro.
const GENERICAS = new Set(["escuela", "esc", "liceo", "colegio", "ctp", "cindea", "ipec", "rural", "nocturno", "diurno", "unidad", "pedagogica", "pedag", "unid", "centro", "educativo", "ce", "cnv", "iegb", "telesecundaria", "tecnico", "profesional", "academico", "bilingue", "experimental", "cientifico", "indigena", "preescolar", "jardin", "ninos", "nuevo", "numero", "n"]);
// Las palabras de un nombre sin las vacías ni el «escuela» del principio: «Escuela La Carpio» y «LA CARPIO» son «carpio».
function nucleo(nombre) {
  let s = sinTildes(nombre).replace(/colegio tecnico profesional/g, "ctp").replace(/\bc\.?\s?t\.?\s?p\b\.?/g, " ctp ").replace(/\bc\.?\s?n\.?\s?v\b\.?/g, " ").replace(/\bc\.?\s?e\b\.?/g, " ");
  const palabras = s.replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((w) => w && !VACIAS.has(w));
  while (palabras.length > 1 && ["escuela", "esc", "centro", "educativo"].includes(palabras[0])) palabras.shift();
  return palabras.join(" ");
}
const especificas = (k) => k.split(" ").filter((w) => w && !GENERICAS.has(w));
function tipoDeNombre(nombre) {
  const s = sinTildes(nombre);
  if (/\b(liceo|colegio|c\.?\s?t\.?\s?p|cindea|ipec|nocturno|telesecundaria|bachillerato)\b/.test(s)) return "c";
  if (/\b(escuela|esc|c\.?\s?e\.?|unid\.?\s?pedag|iegb|jardin)\b/.test(s)) return "e";
  return "";
}
// La Dirección Regional como la escribe el listado del MEP («GRANDE DE TERRABA», «ZONA NORTE NORTE») → la de js/pareo/grupos.js.
const sinGuiones = (s) => sinTildes(s).replace(/[^a-z]+/g, " ").trim();
function dreDeMep(texto) {
  const t = sinGuiones(texto);
  return G.JDE_DIRECCIONES.find((d) => sinGuiones(d) === t) || "";
}

// Un CSV con comillas, como el que escribe herramientas/mep-centros-leer.py.
function leerCsv(texto) {
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const [cabecera, ...datos] = filas;
  return datos.filter((f) => f.length === cabecera.length).map((f) => Object.fromEntries(cabecera.map((c, i) => [c, f[i]])));
}

function armar(torneosJson, jugadoresJson, mepFilas = []) {
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

  // ---- Se juntan con los centros del MEP (circuito y tipo)
  const finales = instituciones.map((x) => ({ n: x.n, d: x.d, p: x.p, u: x.u, t: tipoDeNombre(x.n), c: "", cod: "", delMep: false }));
  const remap = new Map(); // índice de `instituciones` → índice en `finales`
  const resumenMep = { centros: 0, juntados: 0, sinJuntar: 0 };
  if (mepFilas.length) {
    const mep = [];
    for (const f of mepFilas) {
      const d = dreDeMep(f.dre);
      const k = nucleo(f.nombre);
      if (!d || !k) continue;
      mep.push({ n: f.nombre, d, p: 0, u: 0, t: f.tipo === "colegio" ? "c" : "e", c: f.circuito, cod: f.codigo, delMep: true, k, fichas: especificas(k) });
    }
    resumenMep.centros = mep.length;
    const porDreK = new Map(), porDre = new Map(), porK = new Map();
    const meter = (m, i, mapa, llave) => { if (!mapa.has(llave)) mapa.set(llave, []); mapa.get(llave).push(i); };
    mep.forEach((m, i) => { meter(m, i, porDreK, m.d + "|" + m.k); meter(m, i, porDre, m.d); meter(m, i, porK, m.k); });
    const compatibles = (m, chess) => !chess.t || chess.t === m.t || (m.t === "c" && chess.t === "c");
    const unico = (ids) => (ids.length === 1 ? ids[0] : -1);
    function buscar(chess) {
      const k = nucleo(chess.n);
      if (!k) return -1;
      const mismos = (porDreK.get(chess.d + "|" + k) || []).filter((i) => compatibles(mep[i], chess));
      if (mismos.length) return mismos[0];
      // Sin región, o con una región donde ese nombre no está (la de chess-results es la del torneo que
      // jugó, no la suya: el «C.T.P. de Osa» jugó en Pérez Zeledón y es de Grande de Térraba), vale si
      // en todo el país hay UN solo centro con exactamente ese nombre. Con varios no se junta: hay cientos
      // de «Escuela Santa Elena» y juntar con otro le pondría a alguien un circuito que no es el suyo.
      const global = () => unico((porK.get(k) || []).filter((i) => compatibles(mep[i], chess)));
      if (!chess.d) return global();
      // Sin el nombre igual: las palabras que distinguen a uno están todas en el otro, y es el único candidato.
      const f = especificas(k);
      if (!f.length) return -1;
      const candidatos = (porDre.get(chess.d) || []).filter((i) => compatibles(mep[i], chess) && (f.every((w) => mep[i].fichas.includes(w)) || (mep[i].fichas.length && mep[i].fichas.every((w) => f.includes(w)))));
      return candidatos.length ? unico(candidatos) : global();
    }
    for (const [j, x] of finales.entries()) {
      const i = buscar(x);
      if (i < 0) { resumenMep.sinJuntar += 1; continue; }
      const m = mep[i];
      m.p += x.p; m.u = Math.max(m.u, x.u);
      remap.set(j, i);
      resumenMep.juntados += 1;
    }
    // Los centros del MEP primero; los de chess-results que no se juntaron, detrás.
    const resto = finales.filter((_, j) => !remap.has(j));
    finales.length = 0;
    finales.push(...mep, ...resto);
    const nuevoDe = new Map([...remap].map(([j, i]) => [j, i]));
    let sig = mep.length;
    for (let j = 0; j < instituciones.length; j++) if (!remap.has(j)) nuevoDe.set(j, sig++);
    remap.clear();
    for (const [j, i] of nuevoDe) remap.set(j, i);
  } else {
    instituciones.forEach((_, j) => remap.set(j, j));
  }
  // De las del MEP, las que ninguna lista dice a qué región pertenecen ya se descartaron arriba.
  const orden = finales.map((x, i) => i).sort((a, b) => clave(finales[a].n).localeCompare(clave(finales[b].n), "es") || finales[a].d.localeCompare(finales[b].d, "es") || a - b);
  const posicion = new Map(orden.map((i, pos) => [i, pos]));

  const vistos = new Map();
  const lista = [];
  for (const e of [...estudiantes.values()].sort((a, b) => b.ultimo - a.ultimo || clave(jugadoresJson.jugadores[a.jugador][0]).localeCompare(clave(jugadoresJson.jugadores[b.jugador][0]), "es"))) {
    const previo = indice.get(e.inst);
    if (previo == null) continue;
    const ni = posicion.get(remap.get(previo));
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
    fuente: "chess-results.com (leído para ajedrez-estudiantil.html) y los listados de centros educativos del MEP",
    // t: «e» escuela o «c» colegio, vacío si no se sabe; c: el circuito, vacío si ningún listado lo dice.
    columnas_instituciones: ["n", "d", "p", "u", "t", "c"],
    instituciones: orden.map((i) => [finales[i].n, finales[i].d, finales[i].p, finales[i].u, finales[i].t, finales[i].c]),
    columnas_estudiantes: ["nombre", "institucion", "ultimo", "sexo"],
    estudiantes: lista,
    _resumen: resumenMep,
  };
}

module.exports = { armar, leerCsv, nucleo, dreDeMep };

if (require.main === module) {
  const leer = (f) => JSON.parse(fs.readFileSync(path.join(RAIZ, f), "utf8"));
  const mep = leerCsv(fs.readFileSync(path.join(RAIZ, "herramientas/datos/mep-centros.csv"), "utf8"));
  const banco = armar(leer("data/ajedrez-estudiantil.json"), leer("data/ajedrez-estudiantil-jugadores.json"), mep);
  const r = banco._resumen;
  delete banco._resumen;
  const conRegion = banco.instituciones.filter((x) => x[1]).length;
  const conCircuito = banco.instituciones.filter((x) => x[5]).length;
  console.log(`${banco.instituciones.length} instituciones (${conRegion} con Dirección Regional, ${conCircuito} con circuito) y ${banco.estudiantes.length} estudiantes de los últimos años.`);
  console.log(`MEP: ${r.centros} centros; de chess-results se juntaron ${r.juntados} y ${r.sinJuntar} quedaron aparte.`);
  if (!process.argv.includes("--revisar")) {
    fs.writeFileSync(path.join(RAIZ, "data/jde-banco.json"), JSON.stringify(banco) + "\n");
    console.log("data/jde-banco.json escrito.");
  }
}
