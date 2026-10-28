#!/usr/bin/env node
/* El orden de las reuniones de Meet (herramientas/meet-ordenar.gs), con un
 * Drive de mentira: el Apps Script corre en Google y aquí no hay cómo
 * ejecutarlo de verdad, así que se carga el .gs en una caja de arena con
 * DriveApp, Utilities y SpreadsheetApp imitados.
 *
 * Lo que se rompe acá se rompe CALLADO: una grabación que cae en el grupo
 * equivocado no da ningún error, y entonces una clase de Campeones Colegiales
 * termina en el informe del CCDR (meet-clase-a-clase.py vigila solo la
 * carpeta de ese grupo). Se comprueba:
 * - el grupo, el mes y la sesión de cada forma de nombre que pone Meet (las
 *   nuevas, las viejas con el código de la reunión, el chat viejo, sin fecha);
 * - que la sesión sin fecha en el nombre salga en hora de Costa Rica;
 * - que «probar» no mueva nada y «ordenar» lo deje todo en su lugar, también
 *   lo que ya estaba ordenado por grupo y le faltaba el mes, y que los
 *   accesos directos se queden donde estaban;
 * - que el índice no use fórmulas (=HYPERLINK con «,» dio #ERROR! en una hoja
 *   en español) y tenga una fila por sesión.
 *
 * Uso:  node herramientas/verificar-meet-ordenar.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let fallos = 0;
function ok(nombre, cumple, detalle = "") {
  if (cumple) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------ un Drive de mentira
let siguiente = 1;
class Archivo {
  constructor(nombre, padre, o = {}) {
    this.id = "a" + siguiente++; this.nombre = nombre; this.padre = padre;
    this.mime = o.mime || "video/mp4"; this.creado = o.creado || new Date("2030-01-01T12:00:00Z");
    padre.archivos.push(this);
  }
  getName() { return this.nombre; }
  getId() { return this.id; }
  getMimeType() { return this.mime; }
  getDateCreated() { return this.creado; }
  getUrl() { return "https://drive/" + this.id; }
  moveTo(c) { this.padre.archivos.splice(this.padre.archivos.indexOf(this), 1); this.padre = c; c.archivos.push(this); }
}
class Carpeta {
  constructor(nombre, padre) {
    this.id = "c" + siguiente++; this.nombre = nombre; this.padre = padre;
    this.carpetas = []; this.archivos = [];
    if (padre) padre.carpetas.push(this);
    todas[this.id] = this;
  }
  getName() { return this.nombre; }
  getId() { return this.id; }
  getUrl() { return "https://drive/" + this.id; }
  getFolders() { return it([...this.carpetas]); }
  getFiles() { return it([...this.archivos]); }
  getFoldersByName(n) { return it(this.carpetas.filter((c) => c.nombre === n)); }
  createFolder(n) { return new Carpeta(n, this); }
  moveTo(c) { this.padre.carpetas.splice(this.padre.carpetas.indexOf(this), 1); this.padre = c; c.carpetas.push(this); }
  ruta(a) { const r = []; for (let c = a.padre; c && c !== this; c = c.padre) r.unshift(c.nombre); return r.join("/"); }
}
const todas = {};
function it(lista) { let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; }

function mundo() {
  for (const k in todas) delete todas[k];
  const raiz = new Carpeta("Mi unidad", null);
  const meet = new Carpeta("Google Meet", raiz);
  const ordenado = new Carpeta("Meet ordenado", raiz);
  return { raiz, meet, ordenado };
}

const hoja = { filas: null, formulas: 0 };
function sandbox() {
  const ctx = {
    Logger: { log: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }) }) }) },
    MimeType: { SHORTCUT: "application/vnd.google-apps.shortcut" },
    DriveApp: { getFolderById: (id) => todas[id] },
    Utilities: {
      formatDate(fecha, zona, patron) {
        const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit",
          day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(fecha).map((x) => [x.type, x.value]));
        return { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute }[patron];
      },
    },
    SpreadsheetApp: {
      newRichTextValue() {
        const v = {};
        const b = { setText: (t) => ((v.texto = t), b), setLinkUrl: (u) => ((v.url = u), b), build: () => v };
        return b;
      },
      openById: () => ({ getSheets: () => [{
        clear: () => { hoja.filas = []; },
        setFrozenRows: () => {},
        getRange: (f, c, nf, nc) => {
          const r = {
            setValues: (vs) => { vs.forEach((fila, i) => { hoja.filas[f - 1 + i] = hoja.filas[f - 1 + i] || []; fila.forEach((v, j) => (hoja.filas[f - 1 + i][c - 1 + j] = v)); }); return r; },
            setRichTextValues: (vs) => r.setValues(vs),
            setFontWeight: () => r, setNumberFormat: () => r,
            setFormula: () => { hoja.formulas++; return r; }, setFormulas: () => { hoja.formulas++; return r; },
          };
          return r;
        },
      }] }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "meet-ordenar.gs"), "utf8"), ctx);
  return ctx;
}

// ------------------------------------------------------------ los nombres
console.log("\nEl orden de las reuniones de Meet (meet-ordenar.gs)");
const ctx = sandbox();
const casos = [
  ["Clase SJ Octubre - 2030/10/03 09:29 CST - Recording", ["Entrenamiento CCDR San José", "2030-10", "2030-10-03 09.29"]],
  ["Entreno SJ Martes - 2030/10/01 18:00 CST - Chat", ["Entrenamiento CCDR San José", "2030-10", "2030-10-01 18.00"]],
  ["Entrenamiento CCDR San Jose - 2030/06/13 08:58 CST - Transcript", ["Entrenamiento CCDR San José", "2030-06", "2030-06-13 08.58"]],
  ["Reunión Campeones Colegiales - 2030/10/09 08:52 CST - Transcript", ["Campeones Colegiales", "2030-10", "2030-10-09 08.52"]],
  ["Campeones Colegiales Profesores - 2030/07/29 18:30 CST - Recording 2", ["Campeones Colegiales Profesores", "2030-07", "2030-07-29 18.30"]],
  ["Club de Prueba (recurring) - 2030/10/05 10:00 CST - Recording", ["Club de Prueba", "2030-10", "2030-10-05 10.00"]],
  ["Clase Prueba - 2030/09/21 16:04 CST - Notas de Gemini", ["Clase Prueba", "2030-09", "2030-09-21 16.04"]],
  ["hiz-cejh-rbe (2030-06-18 14:26 GMT-6) - Transcript", ["Otras", "2030-06", "2030-06-18 14.26"]],
  ["Transcripción del chat: zpy-puco-ocd (2029-11-27 09:35 GMT-6)", ["Otras", "2029-11", "2029-11-27 09.35"]],
  ["Informe de asistencia de ikm-anac-nhd (2030-03-05 17:58 GMT-6)", ["Otras", "2030-03", "2030-03-05 17.58"]],
  ["Entrenamiento CCDR San José - 2030/09/19 08:57 CST - Asistencia", ["Entrenamiento CCDR San José", "2030-09", "2030-09-19 08.57"]],
  ["ADAES 2030 - 2030/05/07 18:32 CST - Recording", ["Clase Selección ADAES", "2030-05", "2030-05-07 18.32"]],
  ["Clases ADAES - 2029/07/04 18:26 CST - Transcript", ["Clase Selección ADAES", "2029-07", "2029-07-04 18.26"]],
  ["Clases Sele - 2029/09/25 18:30 CST - Asistencia", ["Clase Selección ADAES", "2029-09", "2029-09-25 18.30"]],
  ["Clases Escuelas ADAES - 2029/11/05 10:00 CST - Asistencia", ["Clases Escuelas ADAES", "2029-11", "2029-11-05 10.00"]],
  ["Clase de Ajedrez SJ - 2029/06/23 18:00 CST - Asistencia", ["Entrenamiento CCDR San José", "2029-06", "2029-06-23 18.00"]],
];
for (const [nombre, esperado] of casos) {
  const d = ctx.leerNombre_({ getName: () => nombre, getDateCreated: () => new Date() });
  ok(`«${nombre}» → ${esperado.join("/")}`, igual([d.grupo, d.mes, d.sesion], esperado), JSON.stringify(d));
}
// Sin fecha en el nombre: la de creación, en hora de Costa Rica (las 02:00 UTC del 10 son las 20:00 del 9).
const sinFecha = ctx.leerNombre_({ getName: () => "Clase Prueba", getDateCreated: () => new Date("2029-09-10T02:00:00Z") });
ok("sin fecha en el nombre: a «Otras», con la fecha de creación en hora de Costa Rica",
  igual([sinFecha.grupo, sinFecha.mes, sinFecha.sesion], ["Otras", "2029-09", "2029-09-09 20.00"]), JSON.stringify(sinFecha));

// ------------------------------------------------------------ el orden de verdad
const { meet, ordenado } = mundo();
const ctx2 = sandbox();
const informes = new Carpeta("Informes de reuniones", null);
ctx2.ORIGENES = [meet.id, informes.id]; ctx2.DESTINO = ordenado.id;
// La asistencia, en otra carpeta de origen: llega a la misma sesión que su grabación.
const reunion = new Carpeta("2030-10-03 09:29 Clase SJ Octubre", informes);
new Archivo("Clase SJ Octubre - 2030/10/03 09:29 CST - Asistencia", reunion, { mime: "application/vnd.google-apps.spreadsheet" });
// En «Google Meet»: una carpeta por reunión recurrente, con varias sesiones.
const sj = new Carpeta("Clase SJ Octubre - 2030/10/03 09:29 CST", meet);
new Archivo("Clase SJ Octubre - 2030/10/03 09:29 CST - Recording", sj);
new Archivo("Clase SJ Octubre - 2030/10/03 09:29 CST - Transcript", sj, { mime: "application/vnd.google-apps.document" });
new Archivo("Clase SJ Octubre - 2030/10/21 18:57 CST - Recording", sj);
const club = new Carpeta("Club de Prueba (recurring)", meet);
const atajo = new Archivo("Club de Prueba - 2030/10/05 10:00 CST - Recording", club, { mime: "application/vnd.google-apps.shortcut" });
const viejas = new Carpeta("Meet Recordings", meet);
new Archivo("hiz-cejh-rbe (2030-06-18 14:26 GMT-6)", viejas);
// En «Meet ordenado»: lo que ya estaba por grupo, sin el mes.
const cc = new Carpeta("Campeones Colegiales", ordenado);
const vieja = new Carpeta("2030-07-22 17.30", cc);
new Archivo("Campeones Colegiales - 2030/07/22 17:30 CST - Recording", vieja);

const antes = JSON.stringify(Object.values(todas).map((c) => [c.nombre, c.carpetas.length, c.archivos.length]));
ctx2.probar();
ok("«probar» no mueve nada", JSON.stringify(Object.values(todas).map((c) => [c.nombre, c.carpetas.length, c.archivos.length])) === antes);

ctx2.ordenar();
const dondeEsta = (nombre) => {
  for (const c of Object.values(todas)) for (const a of c.archivos) if (a.nombre === nombre) return ordenado.ruta(a);
  return null;
};
ok("cada sesión de una reunión recurrente, en su propia carpeta de grupo y mes, con la asistencia de la otra carpeta",
  dondeEsta("Clase SJ Octubre - 2030/10/03 09:29 CST - Recording") === "Entrenamiento CCDR San José/2030-10/2030-10-03 09.29"
  && dondeEsta("Clase SJ Octubre - 2030/10/03 09:29 CST - Transcript") === "Entrenamiento CCDR San José/2030-10/2030-10-03 09.29"
  && dondeEsta("Clase SJ Octubre - 2030/10/21 18:57 CST - Recording") === "Entrenamiento CCDR San José/2030-10/2030-10-21 18.57"
  && dondeEsta("Clase SJ Octubre - 2030/10/03 09:29 CST - Asistencia") === "Entrenamiento CCDR San José/2030-10/2030-10-03 09.29",
  dondeEsta("Clase SJ Octubre - 2030/10/21 18:57 CST - Recording"));
ok("lo viejo con el código de la reunión va a «Otras»", dondeEsta("hiz-cejh-rbe (2030-06-18 14:26 GMT-6)") === "Otras/2030-06/2030-06-18 14.26");
ok("lo que ya estaba por grupo recibe su mes", vieja.padre.nombre === "2030-07" && vieja.padre.padre === cc, vieja.padre.nombre);
ok("los accesos directos se quedan donde estaban", atajo.padre === club);

ok("el índice: una fila por sesión, sin fórmulas", hoja.formulas === 0 && hoja.filas.length === 1 + 4, `${hoja.filas.length - 1} filas, ${hoja.formulas} fórmulas`);
const fila = hoja.filas.find((f) => f[1] === "2030-10-03");
ok("el índice enlaza la grabación, la transcripción y la asistencia de la sesión",
  fila && fila[0] === "Entrenamiento CCDR San José" && fila[4].url && fila[5].url && fila[4].texto === "Ver" && fila[8].url && fila[8].texto === "Lista", JSON.stringify(fila));
ok("el índice va de lo más nuevo a lo más viejo", hoja.filas[1][1] === "2030-10-21", hoja.filas[1][1]);

const otraVez = JSON.stringify(Object.values(todas).map((c) => [c.nombre, c.carpetas.length, c.archivos.length]));
ctx2.ordenar();
ok("ordenar otra vez no cambia nada", JSON.stringify(Object.values(todas).map((c) => [c.nombre, c.carpetas.length, c.archivos.length])) === otraVez);

console.log("\n" + (fallos ? `${fallos} fallo(s).` : "Todo bien."));
process.exit(fallos ? 1 : 0);
