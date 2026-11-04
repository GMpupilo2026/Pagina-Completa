/**
 * El puente entre las inscripciones del Metropolitano 2026 y el Drive.
 *
 * Es un Apps Script que corre COMO LA DUEÑA DEL DRIVE (los archivos son suyos y
 * gastan su espacio; no hay cuentas de servicio ni llaves de Google Cloud en el
 * sitio). Lo llama solo la Edge Function `metropolitano-drive`, con un secreto
 * que vive en las propiedades de este script y en la bóveda de la base.
 *
 * Todo va ordenado así (lo decide la función; aquí solo se crean las carpetas):
 *
 *   Inscripciones Metropolitano 2026 / Torneo A / MET-0012 - Mora Solís, Ana /
 *       Foto.jpg · Comprobante de pago.pdf · Ficha de inscripción.txt
 *   Inscripciones Metropolitano 2026 / Torneo B / …   Torneo U14 / …   Torneo Blitz / …
 *   Inscripciones Metropolitano 2026 / Entrenadores, acompañantes y delegados / …
 *   Inscripciones Metropolitano 2026 / Delegación - Club Ajedrez Heredia /
 *       Comprobante de pago.pdf
 *       MET-0013 - Rojas Vega, Carlos (Delegado) / …
 *       MET-0014 - Mora Solís, Andrea (Torneo B) / …
 *
 * El número MET-… va delante: en el Drive, ordenadas por nombre, quedan en el
 * orden en que se inscribieron. Un archivo que vuelve a llegar con el mismo
 * nombre manda el anterior a la papelera (nunca quedan dos).
 *
 * CÓMO SE INSTALA (una sola vez; está también en
 * docs/decisiones/cuentas-y-formularios.md, «Las inscripciones en el Drive»):
 *   1. script.google.com → Proyecto nuevo, con la cuenta dueña del Drive. Pegar
 *      este archivo entero en Código.gs.
 *   2. Ejecutar la función `configurar` una vez y aceptar los permisos. En el
 *      registro de ejecución quedan la carpeta y el SECRETO.
 *   3. Implementar → Nueva implementación → Aplicación web. Ejecutar como: Yo.
 *      Quién tiene acceso: Cualquier persona. Copiar la URL (termina en /exec).
 *   4. En metropolitano-inscritos.html → «Inscripciones en el Drive» →
 *      «Conectar con Drive»: pegar la URL y el secreto. Se prueba antes de
 *      guardarse.
 *   (Si ya estaba instalado y hay código nuevo: pegarlo, «Implementar» →
 *   «Gestionar implementaciones» → editar → Versión: «Nueva versión». La URL no
 *   cambia.)
 *
 * «Cualquier persona» puede LLAMAR la URL, pero sin el secreto no hace nada: lo
 * compara antes de tocar el Drive.
 */

var NOMBRE_RAIZ = "Inscripciones Metropolitano 2026";
var TIPOS = { "image/jpeg": true, "image/png": true, "image/webp": true, "application/pdf": true, "text/plain": true };

function configurar() {
  var props = PropertiesService.getScriptProperties();
  var secreto = props.getProperty("SECRETO");
  if (!secreto) {
    secreto = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
    props.setProperty("SECRETO", secreto);
  }
  var raiz = carpetaRaiz();
  Logger.log("Carpeta: " + raiz.getName() + " (" + raiz.getUrl() + ")");
  Logger.log("SECRETO (pégalo en «Conectar con Drive»): " + secreto);
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Comparar sin cortar en la primera diferencia.
function mismoSecreto(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || !b || a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Para comparar nombres de carpeta: sin mayúsculas, tildes ni espacios de más.
function clave(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Un nombre de archivo o de carpeta seguro.
function limpio(s, largo) {
  return String(s || "").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, largo || 120);
}

function subcarpeta(madre, nombre) {
  var buscada = clave(nombre);
  var hijas = madre.getFolders();
  while (hijas.hasNext()) {
    var h = hijas.next();
    if (clave(h.getName()) === buscada) return h;
  }
  return madre.createFolder(nombre);
}

// «Inscripciones Metropolitano 2026» en «Mi unidad»: si ya existe se usa, si no se crea.
function carpetaRaiz() {
  return subcarpeta(DriveApp.getRootFolder(), NOMBRE_RAIZ);
}

function guardarArchivo(d) {
  var carpetas = d.carpetas;
  if (!carpetas || !carpetas.length || carpetas.length > 4) throw new Error("carpetas no válidas");
  var tipo = String(d.tipo || "");
  if (!TIPOS[tipo]) throw new Error("tipo de archivo no válido");
  var nombre = limpio(d.nombre, 120);
  if (!nombre) throw new Error("falta el nombre");
  var bytes = Utilities.base64Decode(String(d.contenido || ""));
  if (bytes.length < 1 || bytes.length > 15 * 1024 * 1024) throw new Error("archivo no válido");
  var carpeta = carpetaRaiz();
  for (var i = 0; i < carpetas.length; i++) {
    var n = limpio(carpetas[i], 120);
    if (!n) throw new Error("carpeta sin nombre");
    carpeta = subcarpeta(carpeta, n);
  }
  // El mismo archivo vuelto a mandar: el anterior a la papelera.
  var viejos = carpeta.getFilesByName(nombre);
  while (viejos.hasNext()) viejos.next().setTrashed(true);
  var archivo = carpeta.createFile(Utilities.newBlob(bytes, tipo, nombre));
  return { ok: true, enlace: archivo.getUrl() };
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!mismoSecreto(d.secreto, PropertiesService.getScriptProperties().getProperty("SECRETO"))) return responder({ ok: false, error: "secreto" });
    if (d.accion === "probar") return responder({ ok: true, carpeta: carpetaRaiz().getName() });
    if (d.accion === "archivo") return responder(guardarArchivo(d));
    return responder({ ok: false, error: "acción desconocida" });
  } catch (err) {
    return responder({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 200) });
  }
}
