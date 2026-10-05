/* La ficha de los JDN 2027 (jdn.html, js/jdn-consentimiento.js, la Edge
 * Function jdn-drive y el puente material/jdn/puente-drive.gs).
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
const PLANTILLA = path.join(RAIZ, "material", "jdn", "consentimiento-jdn-2027.docx");
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
  condicion: "atleta", comite: "Comité Cantonal de Deportes y Recreación de Montes de Oca", identificacion: "1-2345-0678",
  tipoDocumento: "Nacional", nombre: "Sofía Pérez & <Mora>", nacimiento: "2012-03-09", nacionalidad: "Costarricense",
  estadoCivil: "Soltero(a)", telefono: "8888-1234", sexo: "mujer", lateralidad: "Izquierdo", correo: "familia@ejemplo.cr",
  escolaridad: "Secundaria incompleta", provincia: "San José", canton: "Montes de Oca", distrito: "San Pedro",
  direccion: "200 m norte de la iglesia", beneficiarioCedula: "1-1111-1111", beneficiarioNombre: "Ana Mora Solís",
  parentesco: "Madre", rama: "femenina", pruebas: ["Clásico individual", "Rápido por equipos"],
  tutorNombre: "Ana Mora Solís", tutorEstadoCivil: "casada", tutorProfesion: "docente", tutorCedula: "1-1111-1111",
  tutorCondicion: "madre", autorizadoNombre: "Luis Rojas Vega", autorizadoRol: "subdelegado",
};
const MAYOR = Object.assign({}, MENOR, {
  condicion: "paratleta", nombre: "Carlos Jiménez", nacimiento: "2007-01-20", sexo: "hombre", rama: "abierta",
  tipoDocumento: "Nacionalizado", estadoCivil: "Desconocido", lateralidad: "Derecho", parentesco: "Otros",
  discapacidad: ["Discapacidad visual", "Deterioro en el rango de movimiento pasivo"], perroGuia: "sí", silla: "Eléctrica",
  pruebas: J.PRUEBAS.slice(),
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
  const sinTutor = Object.assign({}, MENOR, { tutorNombre: "", autorizadoRol: "" });
  cierto("a una menor sin tutor le falta el tutor y a quién autoriza",
    J.validar(sinTutor, HOY).some((f) => /padre, madre o tutor/.test(f)) && J.validar(sinTutor, HOY).some((f) => /delegado o subdelegado/.test(f)));
  cierto("un hombre no entra en la rama femenina",
    J.validar(Object.assign({}, MAYOR, { rama: "femenina" }), HOY).some((f) => /rama abierta/.test(f)));
  cierto("nacer en 2021 no tiene categoría",
    J.validar(Object.assign({}, MENOR, { nacimiento: "2021-02-02" }), HOY).some((f) => /entre 2007 y 2020/.test(f)));
  cierto("un paratleta sin tipo de discapacidad no pasa",
    J.validar(Object.assign({}, MAYOR, { discapacidad: [] }), HOY).some((f) => /discapacidad/.test(f)));
  cierto("sin pruebas no pasa", J.validar(Object.assign({}, MENOR, { pruebas: [] }), HOY).some((f) => /prueba/.test(f)));

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
      "en mi ejercicio pleno de la patria potestad del atleta Sofía Pérez & <Mora> menor de edad, autorizo a Luis Rojas Vega (subdelegado) para que"),
    linea(ps, "Yo "));
  igual("1. deporte", linea(ps, "1-"), "1-Indique el deporte en el cual se inscribe: Ajedrez");
  cierto("2. comité", linea(ps, "2-").endsWith("con el cual se inscribe: " + MENOR.comite));
  igual("4. identificación", linea(ps, "4-").trim(), "4-Número de identificación: 1-2345-0678");
  cierto("5. tipo de documento: solo «Nacional», no «Nacionalizado»",
    /\(X\) Nacional,/.test(linea(ps, "5-")) && (linea(ps, "5-").match(/\(X\)/g) || []).length === 1, linea(ps, "5-"));
  igual("6. nombre", linea(ps, "6-"), "6-Nombre y apellidos: Sofía Pérez & <Mora>");
  igual("7. nacimiento en día/mes/año", linea(ps, "7-"), "7-Fecha de nacimiento formato (día/mes/año): 09/03/2012");
  igual("8. nacionalidad", linea(ps, "8-"), "8-Nacionalidad: Costarricense");
  cierto("9. estado civil", /\(X\) Soltero\(a\)/.test(linea(ps, "9-")) && !/\(X\)/.test(linea(ps, "( ) Unión")));
  igual("10. teléfono", linea(ps, "10-"), "10-Teléfono del atleta o tutor: 8888-1234");
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
  igual("20. categoría", linea(ps, "Categoría Deportiva"), "Categoría Deportiva (Deporte colectivo o individual): Individual. Ajedrez U-16, rama femenina");
  igual("recuadro de las pruebas: solo las elegidas",
    texto(xml.slice(xml.indexOf("<w:txbxContent>"), xml.indexOf("</w:txbxContent>"))),
    "Ajedrez U-16, rama femenina: Clásico individual, Rápido por equipos.");
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
  cierto("20. U-20, rama abierta, las seis pruebas",
    /Ajedrez U-20, rama abierta$/.test(linea(ps2, "Categoría Deportiva")) &&
    J.PRUEBAS.every((p) => texto(xml2.slice(xml2.indexOf("<w:txbxContent>"), xml2.indexOf("</w:txbxContent>"))).includes(p)));

  let rota = null;
  try { J.llenar("<w:body><w:p><w:r><w:t>otra cosa</w:t></w:r></w:p></w:body>", MENOR, HOY); } catch (e) { rota = e.message; }
  cierto("si el ICODER cambia la plantilla, avisa qué falta en vez de llenar a medias", rota && /plantilla de la ficha no tiene/.test(rota), rota);
}

/* ==================================================================
   2. La función y el puente
   ================================================================== */
function pruebaFuncion() {
  console.log("\n=== La Edge Function (supabase/functions/jdn-drive) ===");
  const ts = leer("supabase/functions/jdn-drive/index.ts");
  const pos = (re) => ts.search(re);
  const usuario = pos(/auth\.getUser\(jwt\)/);
  const aal = pos(/if \(sesionAMedias\(/);
  const esAdmin = pos(/if \(!perfil\?\.is_admin\) return/);
  const boveda = pos(/rpc\("jdn_drive_leer"\)/);
  cierto("mira la sesión, el segundo paso e is_admin ANTES de leer la bóveda",
    usuario >= 0 && aal > usuario && esAdmin > aal && boveda > esAdmin);
  cierto("«guardar» exige la versión de la política aceptada", /accion === "guardar"[\s\S]*privacidad_version[\s\S]*\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(ts));
  cierto("solo deja pasar la ficha, JPEG y PDF", /TIPOS = new Set\(\[\s*"application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document",\s*"image\/jpeg",\s*"application\/pdf",?\s*\]\)/.test(ts));
  cierto("solo conecta con una aplicación web de Apps Script", /URL_SCRIPT = \/\^https:\\\/\\\/script\\\.google\\\.com/.test(ts));
  cierto("prueba la conexión ANTES de guardarla", pos(/accion: "probar"/) >= 0 && ts.indexOf('rpc("jdn_drive_guardar"') > ts.indexOf('const r = await alPuente(url, { secreto, accion: "probar" })'));
  cierto("funciones-armar.js la arma con hora-cr.ts", /"jdn-drive":\s*\["hora-cr\.ts"\]/.test(leer("herramientas/funciones-armar.js")));
  cierto("está en la lista de desplegadas con verify_jwt en true", /^jdn-drive\s+true\s/m.test(leer("supabase/esquema/funciones-desplegadas.txt")));

  const sql = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /jdn_drive/.test(f)).map((f) => leer("supabase/migraciones/" + f)).join("\n");
  cierto("la bóveda solo la abre la service role (revoke a public, anon y authenticated)",
    /revoke all on function public\.jdn_drive_leer\(\) from public, anon, authenticated/.test(sql) &&
    /revoke all on function public\.jdn_drive_guardar\(text, text\) from public, anon, authenticated/.test(sql));

  console.log("\n=== El puente (material/jdn/puente-drive.gs) ===");
  const gs = leer("material/jdn/puente-drive.gs");
  cierto("compara el secreto antes de abrir el Drive", gs.indexOf("mismoSecreto(pedido.secreto") < gs.indexOf("DriveApp.getFolderById(CARPETA_JDN)", gs.indexOf("function doPost")));
  cierto("guarda dentro de «JDN 2027»", /CARPETA_JDN = "15YupRymnvhqmSCbD6OLL-Vvpn_g65FMg"/.test(gs));
  cierto("una carpeta por persona, la misma si se vuelve a mandar", /getFoldersByName\(nombre\)[\s\S]{0,80}hasNext\(\) \? existentes\.next\(\) : raiz\.createFolder\(nombre\)/.test(gs));
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
      getSession: () => Promise.resolve({ data: { session: { user: { id: CFG.yo }, access_token: "token-de-prueba" } } }),
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

const PERFILES = { profiles: [{ id: "u-admin", is_admin: true }, { id: "u-profe", is_admin: false }] };

async function pruebaPagina(browser) {
  console.log("\n=== jdn.html ===");
  {
    const { ctx, page, pedidos } = await abrir(browser, { yo: "u-profe", tablas: PERFILES }, () => [200, {}]);
    cierto("a quien no administra le dice que no, y no llama a la función",
      await vis(page, "#denied") && !(await vis(page, "#jdn-form")) && pedidos.length === 0);
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
  await page.check('input[name="sexo"][value="hombre"]');
  cierto("un hombre no puede elegir la rama femenina", await page.isDisabled('input[name="rama"][value="femenina"]'));
  await page.check('input[name="sexo"][value="mujer"]');

  // Guardar sin llenar: dice qué falta y no llama
  const antes = pedidos.length;
  await page.click("#jdn-guardar");
  cierto("guardar sin llenar dice qué falta y no manda nada",
    /^Falta: /.test(await page.textContent("#jdn-error")) && pedidos.length === antes);

  // Llenar una menor de 12
  const llenar = async (sel, v) => page.fill(sel, v);
  await page.check('input[name="condicion"][value="atleta"]');
  await llenar("#f-nombre", "Valeria Solano Ruiz");
  await llenar("#f-identificacion", "1-2222-3333");
  await page.selectOption("#f-tipoDocumento", "Nacional");
  await llenar("#f-nacimiento", "2016-05-10");
  await page.selectOption("#f-estadoCivil", "Soltero(a)");
  await page.check('input[name="lateralidad"][value="Derecho"]');
  await llenar("#f-escolaridad", "Primaria incompleta");
  await llenar("#f-telefono", "8888-0000");
  await llenar("#f-correo", "casa@ejemplo.cr");
  await page.selectOption("#f-provincia", "Heredia");
  await llenar("#f-canton", "Barva");
  await llenar("#f-distrito", "San Pablo");
  await llenar("#f-direccion", "Del parque 100 m sur");
  await llenar("#f-comite", "CCDR de Barva");
  await page.check('input[name="rama"][value="femenina"]');
  await llenar("#f-tutorNombre", "Marta Ruiz Mora");
  await page.selectOption("#f-tutorCondicion", "madre");
  await llenar("#f-tutorCedula", "2-3333-4444");
  await llenar("#f-tutorEstadoCivil", "divorciada");
  await llenar("#f-tutorProfesion", "contadora");
  await llenar("#f-autorizadoNombre", "Pedro Mora");
  await page.selectOption("#f-autorizadoRol", "delegado");
  await page.click("#jdn-mismo-tutor");
  igual("«Usar los datos del tutor» llena el beneficiario",
    [await page.inputValue("#f-beneficiarioNombre"), await page.inputValue("#f-beneficiarioCedula"), await page.inputValue("#f-parentesco")],
    ["Marta Ruiz Mora", "2-3333-4444", "Madre"]);

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

  const descarga = page.waitForEvent("download");
  await page.click("#jdn-guardar");
  const d = await descarga;
  await page.waitForSelector("#jdn-listo:not([hidden])");
  igual("la ficha se descarga con el nombre de la persona", d.suggestedFilename(), "Ficha JDN 2027 - Valeria Solano Ruiz.docx");
  const g = pedidos.find((p) => p.body.action === "guardar");
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
  cierto("la ficha que se manda es la llena: U-12, con su tutora",
    /Ajedrez U-12, rama femenina$/.test(linea(fp, "Categoría Deportiva")) && /^Yo Marta Ruiz Mora, mayor, divorciada, contadora/.test(linea(fp, "Yo ")));
  cierto("al terminar: el PDF para imprimir y la carpeta",
    await vis(page, "#listo-pdf") && (await page.getAttribute("#listo-pdf", "href")) === "https://drive.google.com/pdf" &&
    (await page.getAttribute("#listo-carpeta", "href")) === "https://drive.google.com/carpeta" && !(await vis(page, "#jdn-form")));
  cierto("el foco pasa al aviso de «Ficha guardada»", await page.evaluate(() => document.activeElement && document.activeElement.id === "jdn-listo"));

  await page.click("#jdn-otra");
  cierto("«Llenar otra ficha» limpia todo menos el comité",
    (await page.inputValue("#f-nombre")) === "" && (await page.inputValue("#f-comite")) === "CCDR de Barva" && await vis(page, "#jdn-form"));
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

(async () => {
  await pruebaFicha();
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
