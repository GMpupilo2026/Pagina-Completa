/* La ficha de los JDN 2027 (jdn.html, js/jdn-consentimiento.js, la Edge
 * Function jdn-drive y el puente documentos/jdn/puente-drive.gs).
 *
 * Lo que se rompe acá no da error: la página se ve perfecta y la ficha sale
 * con la categoría equivocada, con una opción marcada en el renglón de al lado,
 * con un espacio en blanco que el Comité Cantonal rechaza o con un .docx que
 * Word no abre. Y lo que se guarda son fotos de cédulas de menores de edad: la
 * función no puede dejar de preguntar quién llama. Por eso, tres partes:
 *
 *   1. LA FICHA, en Node: la categoría en los bordes de la tabla de la
 *      convocatoria, lo que se exige según la edad y la condición, y el .docx
 *      lleno, abierto de nuevo y revisado (cada dato en su renglón, cada «(X)»
 *      en su opción, el XML bien formado, el resto de la plantilla intacto).
 *   2. LA FUNCIÓN y el PUENTE, leyéndolos: sesión, segundo paso e is_admin
 *      ANTES de tocar la bóveda; el secreto se compara antes de tocar el Drive.
 *   3. LA PÁGINA, en un navegador con un Supabase y una función de mentira.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-jdn.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

globalThis.window = globalThis;
require("../js/reporte-excel.js");
require("../js/reporte-docx.js");
const J = require("../js/jdn-consentimiento.js");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PLANTILLA = path.join(RAIZ, "documentos", "jdn", "consentimiento-jdn-2027.docx");
const PLANTILLA_ENT = path.join(RAIZ, "documentos", "jdn", "consentimiento-entrenador-jdn-2027.docx");
const HOY = "2026-10-05";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre);
}
function cierto(nombre, v, detalle) {
  if (v) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
}
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

/* ==================================================================
   1. La ficha
   ================================================================== */

const MENOR = {
  rol: "atleta", comite: "CCDR Montes de Oca", condicion: "atleta", identificacion: "1-2345-0678",
  tipoDocumento: "Nacional", nombre: "Sofía Pérez & <Mora>", nacimiento: "2012-03-09", nacionalidad: "Costarricense",
  estadoCivil: "Soltero(a)", telefono: "88881234", sexo: "mujer", lateralidad: "Izquierdo", correo: "familia@ejemplo.cr",
  escolaridad: "Secundaria incompleta", provincia: "San José", canton: "Montes de Oca", distrito: "San Pedro",
  direccion: "200 m norte de la iglesia", beneficiarioCedula: "1-1111-1111", beneficiarioNombre: "Ana Mora Solís",
  parentesco: "Madre",
  tutorNombre: "Ana Mora Solís", tutorEstadoCivil: "casada", tutorProfesion: "docente", tutorCedula: "1-1111-1111",
  tutorCondicion: "madre", autorizadoNombre: "Oscar Angulo Cubero", autorizadoRol: "entrenador",
};
const MAYOR = Object.assign({}, MENOR, {
  condicion: "paratleta", nombre: "Carlos Jiménez", nacimiento: "2007-01-20", sexo: "hombre",
  tipoDocumento: "Nacionalizado", estadoCivil: "Desconocido", lateralidad: "Derecho", parentesco: "Otros",
  discapacidad: ["Discapacidad visual", "Deterioro en el rango de movimiento pasivo"], perroGuia: "sí", silla: "Eléctrica",
});
["tutorNombre", "tutorEstadoCivil", "tutorProfesion", "tutorCedula", "tutorCondicion", "autorizadoNombre", "autorizadoRol"]
  .forEach((k) => delete MAYOR[k]);

// El texto de un trozo de XML, sin etiquetas.
const texto = (xml) => xml.replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

// Los párrafos de primer nivel (el del recuadro de las pruebas lleva otro adentro).
function parrafos(xml) {
  const cuerpo = xml.slice(xml.indexOf("<w:body>"));
  const out = [];
  let i = 0;
  while (true) {
    const a = cuerpo.indexOf("<w:p ", i), b = cuerpo.indexOf("<w:p>", i);
    const ini = a < 0 ? b : b < 0 ? a : Math.min(a, b);
    if (ini < 0) break;
    let nivel = 0, j = ini;
    const re = /<w:p[ >]|<\/w:p>/g;
    re.lastIndex = ini;
    let m;
    while ((m = re.exec(cuerpo))) {
      nivel += m[0] === "</w:p>" ? -1 : 1;
      if (nivel === 0) { j = re.lastIndex; break; }
    }
    out.push(texto(cuerpo.slice(ini, j)));
    i = j;
  }
  return out;
}

// XML bien formado: cada etiqueta que abre, cierra, y en orden.
function bienFormado(xml) {
  const pila = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g;
  let m;
  const sinCabecera = xml.replace(/<\?[^>]*\?>/g, "");
  while ((m = re.exec(sinCabecera))) {
    if (m[3]) continue;
    if (!m[1]) pila.push(m[2]);
    else if (pila.pop() !== m[2]) return false;
  }
  return pila.length === 0 && !/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(sinCabecera);
}

const linea = (ps, inicio) => ps.find((p) => p.startsWith(inicio)) || "";

async function pruebaFicha() {
  console.log("\n=== La categoría (tabla de la convocatoria) ===");
  const cat = (d) => (J.categoria(d) || {}).codigo || null;
  igual("2006 queda fuera", cat("2006-12-31"), null);
  igual("2007 y 2010 son U-20", [cat("2007-01-01"), cat("2010-12-31")], ["U-20", "U-20"]);
  igual("2011 y 2014 son U-16", [cat("2011-01-01"), cat("2014-12-31")], ["U-16", "U-16"]);
  igual("2015 y 2020 son U-12", [cat("2015-01-01"), cat("2020-12-31")], ["U-12", "U-12"]);
  igual("2021 queda fuera", cat("2021-01-01"), null);
  igual("la edad cuenta el cumpleaños (día de calendario, sin zona)", [J.edad("2008-10-05", HOY), J.edad("2008-10-06", HOY)], [18, 17]);

  console.log("\n=== Lo que se exige ===");
  igual("la ficha completa de una menor no pide nada más", J.validar(MENOR, HOY), []);
  igual("la de un mayor no pide tutor", J.validar(MAYOR, HOY), []);
  const sinTutor = Object.assign({}, MENOR, { tutorNombre: "", autorizadoNombre: "" });
  cierto("a una menor sin tutor le falta el tutor y el entrenador al que autoriza",
    J.validar(sinTutor, HOY).some((f) => /padre, madre o tutor/.test(f)) && J.validar(sinTutor, HOY).some((f) => /entrenador al que autoriza/.test(f)));
  cierto("pide el comité que representa",
    J.validar(Object.assign({}, MENOR, { comite: "  " }), HOY).some((f) => /comité/.test(f)));
  cierto("pide si es atleta o entrenador", J.validar(Object.assign({}, MENOR, { rol: "" }), HOY).some((f) => /atleta o entrenador/.test(f)));
  igual("el teléfono: 8 números exactos", ["88881234", "8888-1234", "8888123", "888812345", "8888 1234", "abcdefgh"].map(J.telefonoValido),
    [true, false, false, false, false, false]);
  igual("el correo: con su forma", ["a@b.cr", "nombre.apellido@gmail.com", "a@b", "a b@c.com", "a@@b.com", "a@b.c", "a@b.com,c@d.com"].map(J.correoValido),
    [true, true, false, false, false, false, false]);
  cierto("nacer en 2021 no tiene categoría",
    J.validar(Object.assign({}, MENOR, { nacimiento: "2021-02-02" }), HOY).some((f) => /entre 2007 y 2020/.test(f)));
  cierto("un paratleta sin tipo de discapacidad no pasa",
    J.validar(Object.assign({}, MAYOR, { discapacidad: [] }), HOY).some((f) => /discapacidad/.test(f)));

  console.log("\n=== La ficha llena (una menor, atleta) ===");
  const plantilla = fs.readFileSync(PLANTILLA);
  const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const original = await window.ReporteExcel.abrirZip(ab(plantilla));
  const llena = await J.generar(plantilla, MENOR, HOY);
  const zip = await window.ReporteExcel.abrirZip(ab(Buffer.from(llena)));
  igual("trae las mismas partes que la plantilla", zip.nombres().sort(), original.nombres().filter((n) => !n.endsWith("/")).sort());
  igual("[Content_Types].xml va primero (si no, LibreOffice no la abre)", zip.nombres()[0], "[Content_Types].xml");
  let intactas = true;
  for (const n of original.nombres()) {
    if (n === "word/document.xml" || n.endsWith("/")) continue;
    if (Buffer.compare(Buffer.from(await original.bytes(n)), Buffer.from(await zip.bytes(n))) !== 0) intactas = false;
  }
  cierto("el logo, la letra y el resto de la plantilla quedan byte a byte", intactas);
  const xml = await zip.texto("word/document.xml");
  cierto("document.xml bien formado (y el «&» y los «<» del nombre, escapados)", bienFormado(xml));
  const ps = parrafos(xml);
  igual("condición", linea(ps, "Mi persona en condición de").slice(0, 50), "Mi persona en condición de (X)atleta (  )paratleta");
  cierto("tutor: nombre, estado civil, profesión, cédula, quién es, la atleta y a quién autoriza",
    linea(ps, "Yo ").startsWith("Yo Ana Mora Solís, mayor, casada, docente, cédula de identidad 1-1111-1111 en mi condición de madre, " +
      "en mi ejercicio pleno de la patria potestad del atleta Sofía Pérez & <Mora> menor de edad, autorizo a Oscar Angulo Cubero (entrenador) para que"),
    linea(ps, "Yo "));
  igual("1. deporte", linea(ps, "1-"), "1-Indique el deporte en el cual se inscribe: Ajedrez");
  igual("2. el comité que representa", linea(ps, "2-").trim(),
    "2-Indique el nombre del Comité Cantonal / Concejo de Distrito con el cual se inscribe: CCDR Montes de Oca");
  igual("4. identificación", linea(ps, "4-").trim(), "4-Número de identificación: 1-2345-0678");
  cierto("5. tipo de documento: solo «Nacional», no «Nacionalizado»",
    /\(X\) Nacional,/.test(linea(ps, "5-")) && (linea(ps, "5-").match(/\(X\)/g) || []).length === 1, linea(ps, "5-"));
  igual("6. nombre", linea(ps, "6-"), "6-Nombre y apellidos: Sofía Pérez & <Mora>");
  igual("7. nacimiento en día/mes/año", linea(ps, "7-"), "7-Fecha de nacimiento formato (día/mes/año): 09/03/2012");
  igual("8. nacionalidad", linea(ps, "8-"), "8-Nacionalidad: Costarricense");
  cierto("9. estado civil", /\(X\) Soltero\(a\)/.test(linea(ps, "9-")) && !/\(X\)/.test(linea(ps, "( ) Unión")));
  igual("10. teléfono", linea(ps, "10-"), "10-Teléfono del atleta o tutor: 88881234");
  cierto("11. sexo", /\( \) hombre, \(X\) mujer/.test(linea(ps, "11-")));
  cierto("12. lateralidad", /\( \) Derecho, \(X\) Izquierdo/.test(linea(ps, "12-")));
  igual("13. correo", linea(ps, "13-").trim(), "13-Correo electrónico del atleta o tutor: familia@ejemplo.cr");
  igual("14. escolaridad", linea(ps, "14-"), "14-Escolaridad: Secundaria incompleta");
  const prov = linea(ps, "Provincia");
  cierto("15. provincia, cantón y distrito, cada uno en su lugar",
    /^Provincia: San José\s+Cantón: Montes de Oca\s+Distrito: San Pedro\s*$/.test(prov) && prov.length < 90, prov);
  igual("15. dirección", linea(ps, "Dirección exacta"), "Dirección exacta: 200 m norte de la iglesia");
  igual("16. cédula del beneficiario", linea(ps, "16-"), "16-Número de cédula: 1-1111-1111");
  cierto("17. beneficiario", linea(ps, "17-").startsWith("17-Nombre y apellidos del beneficiario: Ana Mora Solís"));
  cierto("18. parentesco: la madre, no el padre", /\(X\) Madre, \( \)Padre/.test(linea(ps, "18-")), linea(ps, "18-"));
  cierto("19. una atleta no marca nada de paratleta",
    !/\(X\)/.test(linea(ps, "Tipo de discapacidad")) && !/\(X\)/.test(linea(ps, "Perro guía")));
  igual("20. categoría", linea(ps, "Categoría Deportiva"), "Categoría Deportiva (Deporte colectivo o individual): Individual. Ajedrez U-16");
  igual("recuadro de las pruebas: Clásico, Rápido y Relámpago, sin la categoría",
    texto(xml.slice(xml.indexOf("<w:txbxContent>"), xml.indexOf("</w:txbxContent>"))),
    "Clásico, Rápido, Relámpago.");
  igual("20. «Nombre del equipo»: el comité", linea(ps, "Nombre del equipo").trim(), "Nombre del equipo: CCDR Montes de Oca");
  cierto("la fecha de la firma queda en blanco (se firma a mano)", /^Firmado el día___/.test(linea(ps, "Firmado")));
  igual("en total, 6 «(X)»: condición, documento, estado civil, sexo, lateralidad y parentesco", (ps.join("\n").match(/\(X\)/g) || []).length, 6);

  console.log("\n=== La ficha llena (un mayor, paratleta) ===");
  const xml2 = await (await window.ReporteExcel.abrirZip(ab(Buffer.from(await J.generar(plantilla, MAYOR, HOY))))).texto("word/document.xml");
  const ps2 = parrafos(xml2);
  cierto("bien formado", bienFormado(xml2));
  cierto("un mayor de edad deja el párrafo del tutor como viene", linea(ps2, "Yo (").startsWith("Yo (indicar nombre completo y calidades) mayor, indicar estado civil"));
  cierto("paratleta", /\(  \)atleta \(X\)paratleta/.test(linea(ps2, "Mi persona")));
  cierto("5. «Nacionalizado», no «Nacional»", /\( \) Nacional, .*\(X\) Nacionalizado/.test(linea(ps2, "5-")) && (linea(ps2, "5-").match(/\(X\)/g) || []).length === 1);
  cierto("9. «Desconocido», en el segundo renglón", /\(X\)Desconocido/.test(linea(ps2, "( ) Unión de hecho")) && !/\(X\)/.test(linea(ps2, "9-")));
  const disc = linea(ps2, "Tipo de discapacidad");
  cierto("19. las dos discapacidades, aunque una esté partida en dos runs",
    /\(X\)Discapacidad visual/.test(disc) && /\(X\) Deterioro en el rango/.test(disc) && (disc.match(/\(X\)/g) || []).length === 2, disc);
  cierto("19. perro guía y silla", /\(X\) sí, \( \) no/.test(linea(ps2, "Perro guía")) && /\(X\) Eléctrica/.test(linea(ps2, "Perro guía")));
  cierto("20. U-20, con las tres pruebas",
    /Ajedrez U-20$/.test(linea(ps2, "Categoría Deportiva")) &&
    J.PRUEBAS.every((p) => texto(xml2.slice(xml2.indexOf("<w:txbxContent>"), xml2.indexOf("</w:txbxContent>"))).includes(p)));

  console.log("\n=== La fotografía en el punto 3 ===");
  // Un JPEG de verdad no hace falta: Word solo lo abre al pintarlo. Lo que se
  // comprueba es que el .docx lo apunte bien (relación, tipo y parte).
  const FOTO = { bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]), ancho: 600, alto: 800 };
  const zf = await window.ReporteExcel.abrirZip(ab(Buffer.from(await J.generar(plantilla, MENOR, HOY, FOTO))));
  const xf = await zf.texto("word/document.xml");
  cierto("bien formado con la foto", bienFormado(xf));
  igual("la foto queda como parte del .docx, tal cual", Buffer.compare(Buffer.from(await zf.bytes("word/media/foto-jdn.jpeg")), Buffer.from(FOTO.bytes)), 0);
  cierto("con su relación y el tipo JPEG declarado",
    /Id="rIdFotoJdn"[^>]*Target="media\/foto-jdn\.jpeg"|Target="media\/foto-jdn\.jpeg"[^>]*Id="rIdFotoJdn"/.test(await zf.texto("word/_rels/document.xml.rels")) &&
    /Extension="jpeg" ContentType="image\/jpeg"/i.test(await zf.texto("[Content_Types].xml")));
  const tres = xf.indexOf("otografía y cédula (frente"), cuatro = xf.indexOf("4-Número de identificación");
  const dibujo = xf.indexOf('r:embed="rIdFotoJdn"');
  cierto("la foto va entre el punto 3 y el 4, una sola vez", tres >= 0 && dibujo > tres && dibujo < cuatro && xf.split('r:embed="rIdFotoJdn"').length === 2);
  const ext = xf.slice(dibujo - 2000, dibujo).match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
  cierto("cabe en 3,5 × 4,5 cm sin deformarse (600 × 800 → 3,375 × 4,5 cm)",
    ext && +ext[2] === 4.5 * 360000 && Math.abs(+ext[1] / +ext[2] - 600 / 800) < 0.001, ext && ext[0]);
  igual("sin foto, el .docx no cambia de partes", (await window.ReporteExcel.abrirZip(ab(Buffer.from(llena)))).nombres().includes("word/media/foto-jdn.jpeg"), false);

  console.log("\n=== La ficha del entrenador (su propio consentimiento) ===");
  const ENT = Object.assign({}, MAYOR, { rol: "entrenador", nombre: "Oscar Angulo Cubero", nacimiento: "1980-04-02", condicion: "",
    discapacidad: [], perroGuia: "", estadoCivil: "Casado(a)", comite: "CCDR Heredia", sexo: "hombre", parentesco: "Hijos" });
  igual("un entrenador no pide categoría, tutor ni condición", J.validar(ENT, HOY), []);
  const xe = await (await window.ReporteExcel.abrirZip(ab(Buffer.from(await J.generar(fs.readFileSync(PLANTILLA_ENT), ENT, HOY, FOTO))))).texto("word/document.xml");
  const pe = parrafos(xe);
  cierto("bien formado", bienFormado(xe));
  cierto("función: ENTRENADOR(A), y solo esa", /^\(X\) ENTRENADOR\(A\)/.test(linea(pe, "(")) && (linea(pe, "(").match(/\(X\)/g) || []).length === 1, linea(pe, "("));
  igual("1. deporte", linea(pe, "1-").trim(), "1-Indique el deporte en el cual se inscribe: Ajedrez");
  igual("2. comité", linea(pe, "2-").trim(), "2-Indique el nombre del Comité Cantonal / Concejo de Distrito con el cual se inscribe: CCDR Heredia");
  igual("4. identificación", linea(pe, "4-").trim(), "4-Número de identificación: 1-2345-0678");
  igual("6. nombre", linea(pe, "6-").trim(), "6-Nombre y apellidos: Oscar Angulo Cubero");
  igual("7. nacimiento", linea(pe, "7-").trim(), "7-Fecha de nacimiento formato (día/mes/año): 02/04/1980");
  cierto("9. casado", /\(X\)Casado\(a\)/.test(linea(pe, "9-")) && (linea(pe, "9-").match(/\(X\)/g) || []).length === 1, linea(pe, "9-"));
  igual("10. teléfono", linea(pe, "10-").trim(), "10-Teléfono: 88881234");
  cierto("11. hombre", /\(X\) hombre, \( \) mujer/.test(linea(pe, "11-")), linea(pe, "11-"));
  igual("13. correo", linea(pe, "13-").trim(), "13-Correo electrónico: familia@ejemplo.cr");
  cierto("15. provincia, cantón y distrito", /^Provincia: San José\s+Cantón: Montes de Oca\s+Distrito: San Pedro\s*$/.test(linea(pe, "Provincia")), linea(pe, "Provincia"));
  cierto("18. parentesco: hijos", /\(X\) Hijos/.test(linea(pe, "18-")) && (linea(pe, "18-").match(/\(X\)/g) || []).length === 1, linea(pe, "18-"));
  igual("«Nombre del equipo»: el comité", linea(pe, "Nombre del equipo").trim(), "Nombre del equipo: CCDR Heredia");
  cierto("su foto también va en el punto 3", xe.indexOf('r:embed="rIdFotoJdn"') > xe.indexOf("otografía y cédula (frente"));
  cierto("ninguna línea de la ficha del atleta se coló (tutor, recuadro)", !/patria potestad/.test(xe) && !/Relámpago/.test(xe));

  let rota = null;
  try { J.llenar("<w:body><w:p><w:r><w:t>otra cosa</w:t></w:r></w:p></w:body>", MENOR, HOY); } catch (e) { rota = e.message; }
  cierto("si el ICODER cambia la plantilla, avisa qué falta en vez de llenar a medias", rota && /plantilla de la ficha no tiene/.test(rota), rota);
}

/* ==================================================================
   1b. Provincias, cantones y distritos (TSE)
   ================================================================== */
function pruebaDivision() {
  console.log("\n=== Provincia, cantón y distrito (División Territorial Electoral del TSE) ===");
  // js/division-territorial.js es generado: volver a generarlo no lo cambia.
  const antes = leer("js/division-territorial.js");
  require("child_process").execFileSync("node", [path.join(__dirname, "division-territorial-generar.js")]);
  cierto("js/division-territorial.js está al día con su generador (no se editó a mano)", leer("js/division-territorial.js") === antes);
  const D = require("../js/division-territorial.js");
  const nC = D.reduce((s, p) => s + p.cantones.length, 0);
  const nD = D.reduce((s, p) => s + p.cantones.reduce((t, c) => t + c.distritos.length, 0), 0);
  igual("7 provincias, 84 cantones y 492 distritos", [D.length, nC, nD], [7, 84, 492]);
  igual("las provincias, en el orden del decreto", D.map((p) => p.provincia),
    ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"]);
  cierto("ningún cantón repetido en su provincia, ni distrito en su cantón",
    D.every((p) => new Set(p.cantones.map((c) => c.canton)).size === p.cantones.length &&
      p.cantones.every((c) => c.distritos.length && new Set(c.distritos).size === c.distritos.length)));
  const de = (p, c) => D.find((x) => x.provincia === p).cantones.find((x) => x.canton === c);
  cierto("con su ortografía: tildes, «de», «de la» y nombres propios",
    !!de("San José", "Pérez Zeledón") && de("San José", "Pérez Zeledón").distritos[0] === "San Isidro de El General" &&
    !!de("San José", "Vázquez de Coronado") && de("Heredia", "Barva").distritos.includes("San José de la Montaña") &&
    de("Limón", "Limón").distritos.includes("Valle La Estrella") && de("San José", "Tibás").distritos.includes("León XIII") &&
    !!de("Alajuela", "Río Cuarto") && !!de("Puntarenas", "Puerto Jiménez"));
}

/* ==================================================================
   2. La función y el puente
   ================================================================== */
function pruebaFuncion() {
  console.log("\n=== La Edge Function (supabase/functions/jdn-drive) ===");
  const ts = leer("supabase/functions/jdn-drive/index.ts");
  const pos = (re) => ts.search(re);
  const publico = pos(/const publico = accion === "guardar" && body\.modo !== "admin"/);
  const soloAdmin = pos(/if \(!publico\) \{/);
  const usuario = pos(/auth\.getUser\(jwt\)/);
  const aal = pos(/if \(sesionAMedias\(/);
  const esAdmin = pos(/if \(!perfil\?\.is_admin\) return/);
  const boveda = pos(/rpc\("jdn_drive_leer"\)/);
  cierto("mira la sesión, el segundo paso e is_admin ANTES de leer la bóveda",
    usuario >= 0 && aal > usuario && esAdmin > aal && boveda > esAdmin);
  cierto("lo único que se puede sin cuenta es «guardar» (estado y conectar son de administración)",
    publico >= 0 && soloAdmin > publico && usuario > soloAdmin);
  const frenoPos = pos(/rpc\("jdn_frenar", \{ p_ip: ipDe\(req\), p_correo: correo \}\)/);
  const puentePos = ts.search(/const r = await alPuente\(guardado\.url, \{\s*secreto: guardado\.secreto, accion: "guardar"/);
  cierto("sin cuenta: el freno (IP y correo) va ANTES de tocar el Drive, y si frena no sigue",
    frenoPos >= 0 && puentePos > frenoPos && /if \(freno\) return json\(\{ error: freno \}, 429\)/.test(ts));
  cierto("sin cuenta: exige UNA ficha", /filter\(\(a\) => a\.ficha\)\.length !== 1/.test(ts));
  const correoPos = pos(/if \(!\(await dominioRecibe\(correo\.split\("@"\)\[1\]\)\)\)/);
  cierto("el correo: con su forma y un dominio que reciba correo, ANTES del freno y del Drive",
    /if \(!\/\^\[\^\\s@,;\]\+@/.test(ts) && correoPos >= 0 && frenoPos > correoPos && puentePos > correoPos);
  cierto("el DNS: NXDOMAIN o el MX nulo dicen que no; si no contesta, se deja pasar",
    /mx\.Status === 3\) return false/.test(ts) && /\^0\\s\+\\\.\$/.test(ts) && /catch \{\s*return true;/.test(ts) && /AbortSignal\.timeout\(4_000\)/.test(ts));
  cierto("el dominio de los alumnos sin correo (sin MX a propósito) no vale", /SIN_CORREO = \/\(\^\|\\\.\)alumno\\\.ajedrez-integral\\\.com\$\/i/.test(ts) && /if \(SIN_CORREO\.test\(dominio\)\) return false/.test(ts));
  cierto("exige el comité, el rol y el sexo (deciden la carpeta)",
    /Falta el comité que representa/.test(ts) && /ROLES\.has\(rol\)/.test(ts) && /SEXOS\.has\(sexo\)/.test(ts));
  cierto("el resumen solo lleva los campos de la lista, recortados", /for \(const k of CAMPOS_RESUMEN\) resumen\[k\] = String\(r0\[k\] \?\? ""\)[^\n]*slice\(0, 200\)/.test(ts));
  cierto("sin cuenta: los archivos llevan fecha y hora (el puente no le borra la ficha a nadie)",
    /for \(const a of limpios\) a\.nombre = a\.nombre\.replace\(\/\(\\\.\[a-z\]\+\)\$\/i, ` \(enviada \$\{marca\}\)\$1`\)/.test(ts));
  cierto("a nadie le devuelve los enlaces del Drive (solo se descarga la ficha)",
    /return json\(\{ ok: true \}\);\s*\}\s*return json\(\{ error: "Acción desconocida" \}/.test(ts) && !/carpeta: r\.carpeta, nombre/.test(ts));
  cierto("«guardar» exige la versión de la política aceptada", /accion === "guardar"[\s\S]*privacidad_version[\s\S]*\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(ts));
  cierto("solo deja pasar la ficha, JPEG y PDF", /TIPOS = new Set\(\[\s*"application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document",\s*"image\/jpeg",\s*"application\/pdf",?\s*\]\)/.test(ts));
  cierto("solo conecta con una aplicación web de Apps Script", /URL_SCRIPT = \/\^https:\\\/\\\/script\\\.google\\\.com/.test(ts));
  cierto("prueba la conexión ANTES de guardarla", pos(/accion: "probar"/) >= 0 && ts.indexOf('rpc("jdn_drive_guardar"') > ts.indexOf('const r = await alPuente(url, { secreto, accion: "probar" })'));
  cierto("funciones-armar.js la arma con hora-cr.ts", /"jdn-drive":\s*\["hora-cr\.ts"\]/.test(leer("herramientas/funciones-armar.js")));
  cierto("está en la lista de desplegadas con verify_jwt en false (la puerta sin cuenta)", /^jdn-drive\s+false\s/m.test(leer("supabase/esquema/funciones-desplegadas.txt")));

  const sql = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /jdn_/.test(f)).map((f) => leer("supabase/migraciones/" + f)).join("\n");
  cierto("la bóveda solo la abre la service role (revoke a public, anon y authenticated)",
    /revoke all on function public\.jdn_drive_leer\(\) from public, anon, authenticated/.test(sql) &&
    /revoke all on function public\.jdn_drive_guardar\(text, text\) from public, anon, authenticated/.test(sql));
  cierto("el freno de la ficha: topes propios por IP, correo y total, y después el de los formularios (que anota el envío)",
    /ambito = 'jdn-2027' and ip = v_ip[\s\S]*>= \d+ then/.test(sql) &&
    /ambito = 'jdn-2027' and correo = v_correo[\s\S]*>= \d+ then/.test(sql) &&
    /return interno\.frenar_envio_publico\('formulario', 'jdn-2027', v_correo, v_ip\)/.test(sql));
  cierto("y su puerta la llama solo la service role",
    /revoke all on function public\.jdn_frenar\(text, text\) from public, anon, authenticated/.test(sql));

  console.log("\n=== Lo que baja la página, sin candado ===");
  // La página es pública: lo que baja no puede caer bajo una ruta que el
  // worker cierra (run_worker_first). La plantilla estuvo en material/, que es
  // de lo que se vende, y a una familia sin cuenta le salía «No se pudo leer
  // la plantilla de la ficha»; con el sitio servido sin worker, aquí no se veía.
  const cerradas = (JSON.parse(leer("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "")).assets || {}).run_worker_first || [];
  const deLaPagina = [
    ...[...((leer("js/jdn.js").match(/const PLANTILLA = \{[\s\S]*?\};/) || [""])[0]).matchAll(/"([^"]+\.docx)"/g)].map((m) => m[1]),
    (leer("jdn.html").match(/href="([^"]*puente-drive\.gs)"/) || [])[1],
  ];
  for (const ruta of deLaPagina) {
    const cerrada = !ruta || cerradas.some((g) => new RegExp("^" + g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test("/" + ruta));
    cierto("«" + ruta + "» existe y el worker no le pone candado", ruta && fs.existsSync(path.join(RAIZ, ruta)) && !cerrada, cerradas.join(", "));
  }

  console.log("\n=== El puente (documentos/jdn/puente-drive.gs) ===");
  const gs = leer("documentos/jdn/puente-drive.gs");
  cierto("compara el secreto antes de abrir el Drive", gs.indexOf("mismoSecreto(pedido.secreto") < gs.indexOf("DriveApp.getFolderById(CARPETA_JDN)", gs.indexOf("function doPost")));
  cierto("guarda dentro de «JDN 2027»", /CARPETA_JDN = "15YupRymnvhqmSCbD6OLL-Vvpn_g65FMg"/.test(gs));
  cierto("por comité / Atletas o Entrenadores / Mujeres u Hombres / persona",
    /carpetaComite = subcarpeta\(raiz, comite\)/.test(gs) &&
    /carpetaRol = subcarpeta\(carpetaComite, pedido\.rol === "entrenador" \? "Entrenadores" : "Atletas"\)/.test(gs) &&
    /carpetaSexo = subcarpeta\(carpetaRol, pedido\.sexo === "mujer" \? "Mujeres" : "Hombres"\)/.test(gs));
  cierto("una carpeta por persona, la misma si se vuelve a mandar", /carpetaSexo\.getFoldersByName\(nombre\)[\s\S]{0,80}hasNext\(\) \? existentes\.next\(\) : carpetaSexo\.createFolder\(nombre\)/.test(gs));
  cierto("el comité se encuentra aunque cambien mayúsculas o tildes", /normalize\("NFD"\)/.test(gs) && /clave\(h\.getName\(\)\) === buscada/.test(gs));
  cierto("la hoja «Resumen» del comité: una fila por identificación, y lo escrito no se vuelve fórmula",
    /"Resumen - " \+ carpetaComite\.getName\(\)/.test(gs) && /clave\(ids\[i\]\[0\]\) === clave\(resumen\.identificacion\)/.test(gs) &&
    /\^\[=\+\\-@\]/.test(gs) && /COLUMNAS\.map\(function \(c\) \{ return celda\(/.test(gs));
  cierto("si la hoja falla, los archivos ya quedaron guardados", gs.indexOf("anotar(carpetaComite, pedido") > gs.lastIndexOf("carpeta.createFile(blob)") && /catch \(err\) \{\s*hojaError/.test(gs));
  cierto("lo que se reemplaza va a la papelera (no quedan dos fichas)", /getFilesByName\(nombreArchivo\)[\s\S]{0,80}setTrashed\(true\)/.test(gs));
  cierto("en el puente no hay ningún secreto escrito", !/SECRETO\s*=\s*"[^"]+"/.test(gs) && /getScriptProperties\(\)\.getProperty\("SECRETO"\)/.test(gs));
}

/* ==================================================================
   3. La página
   ================================================================== */
function clienteFalso(cfg) {
  return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const CFG = ${JSON.stringify(cfg)};
  function b(filas) {
    let datos = Array.isArray(filas) ? filas.slice() : filas, unica = false;
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      eq(c, v) { if (Array.isArray(datos)) datos = datos.filter((f) => String(f[c]) === String(v)); return q; },
      then(res, rej) {
        let d = datos;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: d == null && unica ? { message: "no hay fila" } : null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: CFG.yo ? { user: { id: CFG.yo }, access_token: window.__token || "token-de-prueba" } : null } }),
      getUser: () => Promise.resolve({ data: { user: { id: CFG.yo } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (t) => b((CFG.tablas || {})[t] || []),
    rpc: () => b(null),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

// Una imagen PNG de verdad (2400 × 1200, roja), para ver que se pasa a JPEG y se achica.
async function pngDePrueba(page) {
  return Buffer.from(await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 2400; c.height = 1200;
    const x = c.getContext("2d"); x.fillStyle = "#c00"; x.fillRect(0, 0, 2400, 1200);
    const b = await new Promise((ok) => c.toBlob(ok, "image/png"));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  }));
}

async function abrir(browser, cfg, drive) {
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
  const page = await ctx.newPage();
  const errores = [], pedidos = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  await page.route("https://falso.supabase.co/functions/v1/jdn-drive", (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    pedidos.push({ body, auth: r.request().headers()["authorization"] || null });
    const [status, resp] = drive(body);
    r.fulfill({ status, contentType: "application/json", body: JSON.stringify(resp) });
  });
  await page.goto(BASE + "/jdn.html", { waitUntil: "networkidle" });
  return { ctx, page, errores, pedidos };
}
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

// Una menor de 12, con su tutora (los mismos datos en las dos puertas).
async function llenarMenor(page) {
  const llenar = async (sel, v) => page.fill(sel, v);
  await page.check('input[name="rol"][value="atleta"]');
  await page.check('input[name="condicion"][value="atleta"]');
  await llenar("#f-comite", "CCDR Barva");
  await llenar("#f-nombre", "Valeria Solano Ruiz");
  await llenar("#f-identificacion", "1-2222-3333");
  await page.selectOption("#f-tipoDocumento", "Nacional");
  await llenar("#f-nacimiento", "2016-05-10");
  await page.selectOption("#f-estadoCivil", "Soltero(a)");
  await page.check('input[name="sexo"][value="mujer"]');
  await page.check('input[name="lateralidad"][value="Derecho"]');
  await llenar("#f-escolaridad", "Primaria incompleta");
  await llenar("#f-telefono", "8888-0000x9");
  if (!page.__ya) igual("el teléfono solo deja números, y 8 (con guion y de más, se limpia)", await page.inputValue("#f-telefono"), "88880000");
  await llenar("#f-correo", "casa@ejemplo.cr");
  await page.selectOption("#f-provincia", "Heredia");
  await page.selectOption("#f-canton", "Barva");
  await page.selectOption("#f-distrito", "San Pablo");
  await llenar("#f-direccion", "Del parque 100 m sur");
  await llenar("#f-tutorNombre", "Marta Ruiz Mora");
  await page.selectOption("#f-tutorCondicion", "madre");
  await llenar("#f-tutorCedula", "2-3333-4444");
  await llenar("#f-tutorEstadoCivil", "divorciada");
  await llenar("#f-tutorProfesion", "contadora");
  await llenar("#f-autorizadoNombre", "Pedro Mora");
  igual("«Que es» trae solo «Entrenador», ya elegido",
    await page.$$eval("#f-autorizadoRol option", (os) => os.map((o) => o.value + (o.selected ? "*" : ""))), ["entrenador*"]);
  if (!page.__ya) igual("el ejemplo del entrenador", await page.getAttribute("#f-autorizadoNombre", "placeholder"), "ej. Oscar Angulo Cubero");
  await page.click("#jdn-mismo-tutor");
  if (!page.__ya) igual("«Usar los datos del tutor» llena el beneficiario",
    [await page.inputValue("#f-beneficiarioNombre"), await page.inputValue("#f-beneficiarioCedula"), await page.inputValue("#f-parentesco")],
    ["Marta Ruiz Mora", "2-3333-4444", "Madre"]);

}

const PERFILES = { profiles: [{ id: "u-admin", is_admin: true }, { id: "u-profe", is_admin: false }] };

async function pruebaPagina(browser) {
  console.log("\n=== jdn.html ===");
  // Sin cuenta (y con una que no administra): el formulario, sin «El Drive».
  for (const [quien, cfg] of [["sin cuenta", { tablas: PERFILES }], ["con una cuenta que no administra", { yo: "u-profe", tablas: PERFILES }]]) {
    const { ctx, page, pedidos, errores } = await abrir(browser, cfg,
      (b) => b.action === "guardar" ? [200, { ok: true }] : [403, { error: "Solo quien administra" }]);
    cierto(quien + ": se ve el formulario y no «El Drive», y no le pregunta nada a la función",
      await vis(page, "#jdn-form") && !(await vis(page, "#caja-drive")) && pedidos.length === 0);
    igual(quien + ": el botón dice «Enviar la ficha» y está encendido",
      [(await page.textContent("#jdn-guardar")).trim(), await page.isDisabled("#jdn-guardar")], ["Enviar la ficha", false]);
    page.__ya = true;
    await llenarMenor(page);
    await page.setInputFiles("#f-foto", { name: "foto.png", mimeType: "image/png", buffer: await pngDePrueba(page) });
    await page.setInputFiles("#f-certificacion", { name: "cert.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") });
    await page.check("#jdn-acepto");
    const descarga = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await page.click("#jdn-guardar");
    const bajada = await descarga;
    if (!bajada) console.log("      (error en la página: " + await page.textContent("#jdn-error") + " | " + await page.textContent("#jdn-progreso") + ")");
    igual(quien + ": la ficha se descarga para imprimirla", bajada && bajada.suggestedFilename(), "Ficha JDN 2027 - Valeria Solano Ruiz.docx");
    await page.waitForSelector("#jdn-listo:not([hidden])");
    const g = pedidos.find((x) => x.body.action === "guardar");
    cierto(quien + ": manda por la puerta pública, sin token, con el correo",
      g && g.body.modo === "publico" && g.auth === null && g.body.correo === "casa@ejemplo.cr", JSON.stringify(g && { modo: g.body.modo, auth: g.auth }));
    cierto(quien + ": manda el comité, el rol y el sexo (deciden la carpeta) y la fila del resumen",
      g && g.body.comite === "CCDR Barva" && g.body.rol === "atleta" && g.body.sexo === "mujer" &&
      g.body.resumen.categoria === "U-12" && g.body.resumen.rol === "Atleta" && g.body.resumen.telefono === "88880000",
      JSON.stringify(g && [g.body.comite, g.body.rol, g.body.sexo, g.body.resumen]));
    cierto(quien + ": al terminar dice que la imprima y la firme, y solo deja descargarla u otra",
      /imprímela y fírmala a mano/.test(await page.textContent("#listo-texto")) &&
      await page.$$eval("#jdn-listo a, #jdn-listo button", (es) => es.filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()).join("|")) === "Descargar la ficha|Llenar otra ficha");
    cierto(quien + ": sin errores en la página", errores.length === 0, errores.join(" | "));
    await ctx.close();
  }

  let conectadoYa = false;
  const drive = (b) => {
    if (b.action === "estado") return [200, conectadoYa ? { conectado: true, carpeta: "JDN 2027", url: "https://drive.google.com/x" } : { conectado: false }];
    if (b.action === "conectar") { conectadoYa = true; return [200, { conectado: true, carpeta: "JDN 2027", url: "https://drive.google.com/x" }]; }
    if (b.action === "guardar") return [200, { ok: true, carpeta: "https://drive.google.com/carpeta", nombre: b.persona, archivos: b.archivos.map((a) => ({ nombre: a.nombre })), pdf: "https://drive.google.com/pdf" }];
    return [400, { error: "?" }];
  };
  const { ctx, page, errores, pedidos } = await abrir(browser, { yo: "u-admin", tablas: PERFILES }, drive);
  await page.waitForFunction(() => !/Revisando/.test(document.getElementById("drive-estado").textContent));
  cierto("sin Drive conectado: lo dice, abre «Conectar con Drive» y apaga «Guardar»",
    /no está conectado/.test(await page.textContent("#drive-estado")) &&
    await page.evaluate(() => document.getElementById("drive-conectar").open) &&
    await page.isDisabled("#jdn-guardar"));

  await page.fill("#drive-url", "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxx/exec");
  await page.fill("#drive-secreto", "a".repeat(64));
  await page.click("#drive-probar");
  await page.waitForFunction(() => /Conectado/.test(document.getElementById("drive-estado").textContent));
  const con = pedidos.find((p) => p.body.action === "conectar");
  cierto("conectar manda la URL y el secreto con la sesión", con && con.body.secreto === "a".repeat(64) && con.auth === "Bearer token-de-prueba");
  igual("quien administra ve «Guardar en el Drive»", (await page.textContent("#jdn-guardar")).trim(), "Guardar en el Drive");
  cierto("y ya conectado se puede guardar (el secreto no queda escrito)", !(await page.isDisabled("#jdn-guardar")) && (await page.inputValue("#drive-secreto")) === "");

  // La categoría y lo que se abre según la fecha
  await page.fill("#f-nacimiento", "2016-05-10");
  igual("2016: U-12, y la edad", (await page.textContent("#jdn-categoria")).trim(), "U-12 (nacidos de 2015 a 2020) · 10 años");
  cierto("menor de 12: pide tutor y certificación de nacimiento, la cédula ya no es obligatoria",
    await vis(page, "#caja-tutor") && await vis(page, "#caja-certificacion") && !(await vis(page, ".jdn-oblig")));
  await page.fill("#f-nacimiento", "2008-01-10");
  cierto("2008 (18 años): U-20, sin tutor ni certificación",
    /^U-20/.test(await page.textContent("#jdn-categoria")) && !(await vis(page, "#caja-tutor")) && !(await vis(page, "#caja-certificacion")));
  await page.fill("#f-nacimiento", "2005-01-10");
  cierto("2005: fuera de las categorías, y se dice", /Fuera de las categorías/.test(await page.textContent("#jdn-categoria")));
  await page.check('input[name="condicion"][value="paratleta"]');
  cierto("paratleta abre su recuadro", await vis(page, "#caja-paratleta"));
  await page.check('input[name="condicion"][value="atleta"]');
  cierto("pide el comité, y no la rama ni las pruebas",
    await vis(page, "#f-comite") && !(await page.$('input[name="rama"]')) && !(await page.$('input[name="pruebas"]')));
  cierto("la foto y la cédula dicen que son del atleta",
    /Fotografía y cédula del atleta/.test(await page.textContent("#jdn-form")) &&
    /Fotografía del atleta/.test(await page.textContent('label[for="f-foto"]')) &&
    /Cédula del atleta, frente/.test(await page.textContent('label[for="f-frente"]')));

  // Provincia → cantón → distrito: solo lo de la provincia y el cantón elegidos.
  cierto("antes de la provincia, el cantón y el distrito están apagados",
    await page.isDisabled("#f-canton") && await page.isDisabled("#f-distrito"));
  igual("la provincia trae las siete", (await page.$$eval("#f-provincia option", (os) => os.map((o) => o.value))).filter(Boolean).length, 7);
  await page.selectOption("#f-provincia", "Heredia");
  igual("Heredia: sus 10 cantones, y el distrito sigue apagado",
    [(await page.$$eval("#f-canton option", (os) => os.map((o) => o.value))).filter(Boolean).length, await page.isDisabled("#f-distrito")], [10, true]);
  await page.selectOption("#f-canton", "Barva");
  igual("Barva: sus distritos",
    (await page.$$eval("#f-distrito option", (os) => os.map((o) => o.value))).filter(Boolean),
    ["Barva", "San Pedro", "San Pablo", "San Roque", "Santa Lucía", "San José de la Montaña", "Puente Salas"]);
  await page.selectOption("#f-distrito", "San Pablo");
  await page.selectOption("#f-provincia", "Limón");
  cierto("cambiar de provincia borra el cantón y el distrito elegidos",
    (await page.inputValue("#f-canton")) === "" && (await page.inputValue("#f-distrito")) === "" && await page.isDisabled("#f-distrito") &&
    !(await page.$$eval("#f-canton option", (os) => os.map((o) => o.value))).includes("Barva"));
  igual("el comité se puede elegir de los 84 comités cantonales",
    [await page.$$eval("#lista-comites option", (os) => os.length), await page.getAttribute("#f-comite", "list")], [84, "lista-comites"]);

  // Guardar sin llenar: dice qué falta y no llama
  const antes = pedidos.length;
  await page.click("#jdn-guardar");
  cierto("guardar sin llenar dice qué falta y no manda nada",
    /^Falta: /.test(await page.textContent("#jdn-error")) && pedidos.length === antes);

  await llenarMenor(page);
  const png = await pngDePrueba(page);
  await page.setInputFiles("#f-foto", { name: "foto.png", mimeType: "image/png", buffer: png });
  cierto("la foto se ve antes de mandarla, con su texto", await vis(page, '[data-doc="foto"] .jdn-vista') &&
    /Fotografía/.test(await page.getAttribute('[data-doc="foto"] .jdn-vista', "alt")));
  await page.click("#jdn-guardar");
  cierto("sin la certificación de nacimiento (menor de 12) no manda nada", /certificación de nacimiento/.test(await page.textContent("#jdn-error")));
  await page.setInputFiles("#f-certificacion", { name: "cert.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") });
  await page.click("#jdn-guardar");
  cierto("sin la casilla de la privacidad no manda nada", /Política de privacidad/.test(await page.textContent("#jdn-error")));
  await page.check("#jdn-acepto");

  // supabase-js renovó el token (pasó más de una hora): «Guardar» tiene que mandar el nuevo.
  await page.evaluate(() => { window.__token = "token-renovado"; });
  const descarga = page.waitForEvent("download");
  await page.click("#jdn-guardar");
  const d = await descarga;
  await page.waitForSelector("#jdn-listo:not([hidden])");
  igual("la ficha se descarga con el nombre de la persona", d.suggestedFilename(), "Ficha JDN 2027 - Valeria Solano Ruiz.docx");
  const g = pedidos.find((p) => p.body.action === "guardar");
  igual("manda el token del momento, no el de cuando se abrió la página", g.auth, "Bearer token-renovado");
  igual("y por la puerta de administración", g.body.modo, "admin");
  igual("manda la carpeta con el nombre", g.body.persona, "Valeria Solano Ruiz");
  igual("y la versión de la política", g.body.privacidad_version, leer("js/legal-version.js").match(/PRIVACIDAD: "([\d-]+)"/)[1]);
  igual("los archivos: la ficha, la foto en JPEG y la certificación en PDF",
    g.body.archivos.map((a) => [a.nombre, a.tipo, !!a.ficha]),
    [["Ficha JDN 2027 - Valeria Solano Ruiz.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true],
      ["Fotografía - Valeria Solano Ruiz.jpg", "image/jpeg", false],
      ["Certificación de nacimiento - Valeria Solano Ruiz.pdf", "application/pdf", false]]);
  const foto = Buffer.from(g.body.archivos[1].base64, "base64");
  const ancho = (() => { for (let i = 2; i < foto.length - 9; i++) if (foto[i] === 0xff && (foto[i + 1] === 0xc0 || foto[i + 1] === 0xc2)) return foto.readUInt16BE(i + 7); return 0; })();
  cierto("la foto es un JPEG de verdad, achicado a 2000 px", foto[0] === 0xff && foto[1] === 0xd8 && ancho === 2000, "ancho " + ancho);
  const docx = Buffer.from(g.body.archivos[0].base64, "base64");
  const fichaXml = await (await window.ReporteExcel.abrirZip(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength))).texto("word/document.xml");
  const fp = parrafos(fichaXml);
  cierto("la ficha que se manda es la llena: U-12, con su tutora y su comité",
    /Ajedrez U-12$/.test(linea(fp, "Categoría Deportiva")) && /^Yo Marta Ruiz Mora, mayor, divorciada, contadora/.test(linea(fp, "Yo ")) &&
    linea(fp, "Nombre del equipo").trim() === "Nombre del equipo: CCDR Barva");
  const zipFicha = await window.ReporteExcel.abrirZip(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength));
  cierto("y lleva adentro la misma foto que se guarda (en JPEG)",
    await zipFicha.bytes("word/media/foto-jdn.jpeg").then((m) => !!m && Buffer.compare(Buffer.from(m), foto) === 0, () => false) &&
    fichaXml.includes('r:embed="rIdFotoJdn"'));
  cierto("al terminar, tampoco quien administra recibe enlaces al Drive: solo descargar",
    (await page.$$("#jdn-listo a")).length === 0 && await vis(page, "#listo-descargar") && !(await vis(page, "#jdn-form")));
  cierto("el foco pasa al aviso de «Ficha guardada»", await page.evaluate(() => document.activeElement && document.activeElement.id === "jdn-listo"));

  await page.click("#jdn-otra");
  cierto("«Llenar otra ficha» deja el formulario limpio",
    (await page.inputValue("#f-nombre")) === "" && await vis(page, "#jdn-form"));
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await ctx.close();

  // Un entrenador: su consentimiento, sin categoría, tutor ni condición.
  {
    const { ctx, page, pedidos, errores } = await abrir(browser, { tablas: PERFILES }, () => [200, { ok: true }]);
    page.__ya = true;
    await llenarMenor(page);
    await page.check('input[name="rol"][value="entrenador"]');
    await page.fill("#f-nombre", "Pedro Mora Vega");
    await page.fill("#f-nacimiento", "1985-02-03");
    await page.check('input[name="sexo"][value="hombre"]');
    cierto("entrenador: sin categoría, condición, tutor ni certificación",
      !(await vis(page, "#caja-categoria")) && !(await vis(page, "#caja-condicion")) && !(await vis(page, "#caja-tutor")) &&
      !(await vis(page, "#caja-certificacion")) && !(await vis(page, "#jdn-mismo-tutor")));
    cierto("entrenador: la fecha de nacimiento no se limita a 2007-2020", (await page.getAttribute("#f-nacimiento", "min")) === null);
    cierto("entrenador: la foto y la cédula dicen «del entrenador»",
      /Fotografía del entrenador/.test(await page.textContent('label[for="f-foto"]')) && /Cédula del entrenador, frente/.test(await page.textContent('label[for="f-frente"]')));
    await page.setInputFiles("#f-foto", { name: "foto.png", mimeType: "image/png", buffer: await pngDePrueba(page) });
    await page.setInputFiles("#f-frente", { name: "f.png", mimeType: "image/png", buffer: await pngDePrueba(page) });
    await page.setInputFiles("#f-reverso", { name: "r.png", mimeType: "image/png", buffer: await pngDePrueba(page) });
    await page.check("#jdn-acepto");
    const descarga = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await page.click("#jdn-guardar");
    const bajada = await descarga;
    if (!bajada) console.log("      (error en la página: " + await page.textContent("#jdn-error") + ")");
    igual("entrenador: se descarga su ficha", bajada && bajada.suggestedFilename(), "Ficha entrenador JDN 2027 - Pedro Mora Vega.docx");
    const g = pedidos.find((x) => x.body.action === "guardar");
    const b = g && Buffer.from(g.body.archivos[0].base64, "base64");
    const xe = b ? await (await window.ReporteExcel.abrirZip(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))).texto("word/document.xml") : "";
    cierto("entrenador: manda su consentimiento (no el del atleta), con rol, sexo y comité",
      g && g.body.rol === "entrenador" && g.body.sexo === "hombre" && g.body.resumen.rol === "Entrenador(a)" && g.body.resumen.categoria === "" &&
      /\(X\) ENTRENADOR\(A\)/.test(texto(xe)) && !/patria potestad/.test(xe));
    cierto("entrenador: sin errores en la página", errores.length === 0, errores.join(" | "));
    await ctx.close();
  }

  // La sesión cerrada en otro aparato: la función contesta 401 aunque el token parezca bueno.
  {
    const { ctx, page } = await abrir(browser, { yo: "u-admin", tablas: PERFILES },
      () => [401, { error: "La sesión no es válida." }]);
    await page.waitForFunction(() => !/Revisando/.test(document.getElementById("drive-estado").textContent));
    cierto("con la sesión cerrada, dice que hay que volver a entrar (no «el Drive no contesta»)",
      /^Tu sesión se cerró/.test(await page.textContent("#drive-estado")), await page.textContent("#drive-estado"));
    await page.fill("#drive-url", "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxx/exec");
    await page.fill("#drive-secreto", "a".repeat(64));
    await page.click("#drive-probar");
    await page.waitForFunction(() => document.getElementById("drive-msg").textContent && !/Probando/.test(document.getElementById("drive-msg").textContent));
    cierto("y al conectar, lo mismo", /^Tu sesión se cerró/.test(await page.textContent("#drive-msg")));
    await ctx.close();
  }
}

(async () => {
  await pruebaFicha();
  pruebaDivision();
  pruebaFuncion();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaPagina(browser);
  } finally {
    await browser.close();
  }
  terminar();
})().catch((e) => { console.error(e); process.exit(1); });

function terminar() {
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron` : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
}
