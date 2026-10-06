/**
 * El puente entre jdn.html y la carpeta «JDN 2027» del Drive.
 *
 * Es un Apps Script que corre COMO LA DUEÑA DEL DRIVE: así los archivos son
 * suyos y gastan su espacio, sin cuentas de servicio ni llaves de Google Cloud
 * en el sitio. Lo llama solo la Edge Function `jdn-drive` (que antes comprueba
 * que quien llama administre y entró con su código), con un secreto que vive en
 * las propiedades de este script y en la bóveda de la base.
 *
 * Por cada persona: una carpeta con su nombre dentro de «JDN 2027», con la
 * ficha llena (.docx y, si está el servicio avanzado de Drive, también en PDF
 * para imprimir), la fotografía y la cédula por los dos lados. Si la carpeta ya
 * existe (se volvió a mandar la ficha para corregir algo), se usa la misma y
 * los archivos con el mismo nombre se mandan a la papelera antes de subir los
 * nuevos: nunca quedan dos fichas distintas de la misma persona.
 *
 * CÓMO SE INSTALA (una sola vez; está también en
 * docs/decisiones/cuentas-y-formularios.md, «La ficha de los JDN 2027»):
 *   1. script.google.com → Proyecto nuevo, con la cuenta dueña de «JDN 2027».
 *      Pegar este archivo entero en Código.gs.
 *   2. Servicios (+) → «Drive API» → Agregar. Es lo que arma el PDF; sin él
 *      se guarda solo el .docx.
 *   3. Ejecutar la función `configurar` una vez y aceptar los permisos. En el
 *      registro de ejecución queda el SECRETO.
 *   4. Implementar → Nueva implementación → Aplicación web. Ejecutar como: Yo.
 *      Quién tiene acceso: Cualquier persona. Copiar la URL (termina en /exec).
 *   5. En jdn.html → «Conectar con Drive», pegar la URL y el secreto.
 *
 * «Cualquier persona» puede LLAMAR la URL, pero sin el secreto no hace nada: lo
 * compara antes de tocar el Drive.
 */

// La carpeta «JDN 2027» (https://drive.google.com/drive/folders/15YupRymnvhqmSCbD6OLL-Vvpn_g65FMg).
var CARPETA_JDN = "15YupRymnvhqmSCbD6OLL-Vvpn_g65FMg";
var TIPOS = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
  "image/jpeg": true,
  "application/pdf": true,
};

function configurar() {
  var props = PropertiesService.getScriptProperties();
  var secreto = props.getProperty("SECRETO");
  if (!secreto) {
    secreto = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
    props.setProperty("SECRETO", secreto);
  }
  var carpeta = DriveApp.getFolderById(CARPETA_JDN);
  Logger.log("Carpeta: " + carpeta.getName());
  Logger.log("SECRETO (pégalo en jdn.html → Conectar con Drive): " + secreto);
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

// Sin lo que un nombre de archivo no acepta, igual que js/jdn-consentimiento.js.
function nombreLimpio(s) {
  return String(s || "").replace(/\s+/g, " ").trim().replace(/[\\\/:*?"<>|#%]/g, "").slice(0, 120);
}

function doPost(e) {
  var pedido;
  try { pedido = JSON.parse(e.postData.contents); } catch (err) { return responder({ ok: false, error: "Pedido ilegible" }); }
  var secreto = PropertiesService.getScriptProperties().getProperty("SECRETO");
  if (!mismoSecreto(pedido.secreto, secreto)) return responder({ ok: false, error: "Secreto equivocado" });

  var raiz = DriveApp.getFolderById(CARPETA_JDN);
  if (pedido.accion === "probar") {
    return responder({ ok: true, carpeta: raiz.getName(), url: raiz.getUrl() });
  }
  if (pedido.accion !== "guardar") return responder({ ok: false, error: "Acción desconocida" });

  var nombre = nombreLimpio(pedido.persona);
  if (!nombre) return responder({ ok: false, error: "Falta el nombre de la persona" });
  var archivos = pedido.archivos || [];
  if (!archivos.length) return responder({ ok: false, error: "No llegó ningún archivo" });

  // Que no se crucen dos envíos de la misma persona a la vez (dos carpetas).
  var candado = LockService.getScriptLock();
  candado.waitLock(30000);
  try {
    var existentes = raiz.getFoldersByName(nombre);
    var carpeta = existentes.hasNext() ? existentes.next() : raiz.createFolder(nombre);
    if (pedido.nota) carpeta.setDescription(String(pedido.nota).slice(0, 2000));

    var guardados = [];
    var ficha = null;
    for (var i = 0; i < archivos.length; i++) {
      var a = archivos[i];
      var nombreArchivo = nombreLimpio(a.nombre);
      if (!nombreArchivo || !TIPOS[a.tipo]) continue;
      var viejos = carpeta.getFilesByName(nombreArchivo);
      while (viejos.hasNext()) viejos.next().setTrashed(true);
      var blob = Utilities.newBlob(Utilities.base64Decode(a.base64), a.tipo, nombreArchivo);
      var f = carpeta.createFile(blob);
      guardados.push({ nombre: nombreArchivo, url: f.getUrl() });
      if (a.ficha) ficha = { blob: blob, nombre: nombreArchivo };
    }

    // El PDF para imprimir: el .docx se convierte a un Documento de Google, se
    // exporta y el documento intermedio se borra. Necesita el servicio
    // avanzado «Drive API»; sin él, queda solo el .docx.
    var pdf = null;
    if (ficha && typeof Drive !== "undefined") {
      try {
        var nombrePdf = ficha.nombre.replace(/\.docx$/i, "") + ".pdf";
        var temporal = Drive.Files.create({ name: nombrePdf + " (temporal)", mimeType: "application/vnd.google-apps.document", parents: [carpeta.getId()] }, ficha.blob);
        var doc = DriveApp.getFileById(temporal.id);
        var viejosPdf = carpeta.getFilesByName(nombrePdf);
        while (viejosPdf.hasNext()) viejosPdf.next().setTrashed(true);
        var archivoPdf = carpeta.createFile(doc.getAs("application/pdf").setName(nombrePdf));
        doc.setTrashed(true);
        pdf = archivoPdf.getUrl();
      } catch (err) {
        pdf = null;
      }
    }
    return responder({ ok: true, carpeta: carpeta.getUrl(), nombre: nombre, archivos: guardados, pdf: pdf });
  } finally {
    candado.releaseLock();
  }
}
