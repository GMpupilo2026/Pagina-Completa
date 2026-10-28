/**
 * Ordena las reuniones de Google Meet del Drive de Cenfotec por grupo y por mes.
 *
 * Es un Apps Script que corre COMO LA CUENTA DUEÑA DE LAS GRABACIONES
 * (oanguloc@ucenfotec.ac.cr). Meet deja cada reunión en «Google Meet», en una
 * carpeta por reunión recurrente que junta TODAS sus sesiones; este script las
 * lleva a:
 *
 *   Meet ordenado / <grupo> / AAAA-MM / AAAA-MM-DD HH.MM / grabación, transcripción, chat…
 *
 * y vuelve a armar la hoja «Indice de reuniones» (una fila por sesión, con
 * enlaces que funcionan). Corre solo cada hora: una grabación nueva cae en su
 * grupo sin que nadie la toque. Así herramientas/meet-clase-a-clase.py puede
 * vigilar SOLO «Meet ordenado/Entrenamiento CCDR San José» y al informe del
 * CCDR no entran las clases de otros grupos.
 *
 * El porqué, en «Las reuniones de Meet, ordenadas por grupo y por mes»
 * (docs/decisiones/informes.md).
 *
 * CÓMO SE INSTALA (una sola vez):
 *   1. script.google.com → Proyecto nuevo, con la cuenta de Cenfotec.
 *      Pegar este archivo entero en Código.gs (en lugar de lo que trae).
 *   2. Elegir la función `probar` y «Ejecutar». La primera vez pide permisos
 *      (Drive y Hojas de cálculo): aceptarlos. No mueve nada: en el registro
 *      de ejecución dice qué haría con cada archivo.
 *   3. Si lo que dice está bien: elegir `instalar` y «Ejecutar». Ordena todo
 *      (si son muchos archivos, sigue solo en la hora siguiente) y deja el
 *      orden automático cada hora.
 * Para quitarlo: ejecutar `desinstalar`.
 */

// De dónde se sacan los archivos de Meet:
// - «Google Meet», donde Meet deja las reuniones;
// - «CLASES ADAES», con grabaciones y transcripciones de «ADAES 2026»;
// - «Informes de reuniones», con la asistencia de cada reunión desde 2023
//   (una carpeta «AAAA-MM-DD HH:MM Nombre» por reunión).
var ORIGENES = [
  "1uJ20WG1P2OJNRq4s1o_1a1UWCHebvqbp",
  "1xi2CM4K4bZUoG8YTMJmfBqySlzw2fJzw",
  "1qB7TKc0VNya-LlfLMZa3kFx3_XxUmyzP",
];
// «Meet ordenado»: donde quedan por grupo y por mes.
var DESTINO = "1B9ArrKDiCbZEPmSL-xeX-VwyG3FQ-WX2";
// La hoja «Indice de reuniones», dentro de «Meet ordenado».
var INDICE = "1QxIQYFCi0ZA9Qkujesx5xXiRqVzcWSkck_KkYmgAiEY";

var ZONA = "America/Costa_Rica";

// El grupo de cada reunión. Lo que no está aquí va a un grupo con el nombre
// de la reunión (sin «(recurring)»). Se compara sin mayúsculas ni tildes.
var GRUPOS = [
  [/^clase sj octubre/, "Entrenamiento CCDR San José"],
  [/^entreno sj martes/, "Entrenamiento CCDR San José"],
  [/^entrenamiento ccdr san jose/, "Entrenamiento CCDR San José"],
  [/^clase de ajedrez sj/, "Entrenamiento CCDR San José"],
  [/^reunion campeones colegiales/, "Campeones Colegiales"],
  // La selección de ADAES cambió de nombre con los años: «Clases Sele» (2024),
  // «Clases ADAES» (2025), «ADAES 2026» y «Clase Selección ADAES». La carpeta
  // del mes ya las separa por año.
  [/^(adaes 20\d\d|clases adaes|clases sele)$/, "Clase Selección ADAES"],
];
// Lo que no se puede leer (sin fecha, o con nombre de código de Meet como
// «hiz-cejh-rbe») va aquí.
var OTRAS = "Otras";

// Apps Script corta una ejecución a los 6 minutos: se deja de mover a los 5 y
// lo que falte sigue en la vuelta de la hora siguiente. Ordenar dos veces lo
// mismo no hace nada, así que cortar a la mitad no deja nada roto.
var TOPE_MS = 5 * 60 * 1000;

// ------------------------------------------------------------ lo que se ejecuta

function probar() {
  ordenarTodo_(true);
}

function ordenar() {
  ordenarTodo_(false);
}

function instalar() {
  desinstalar();
  ScriptApp.newTrigger("ordenar").timeBased().everyHours(1).create();
  ordenar();
  Logger.log("Instalado: ordena cada hora.");
}

function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "ordenar") ScriptApp.deleteTrigger(t);
  });
}

// ------------------------------------------------------------ el orden

function ordenarTodo_(soloMirar) {
  // Dos vueltas a la vez (la de la hora y una a mano) moverían lo mismo.
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(1000)) { Logger.log("Ya hay otra vuelta corriendo."); return; }
  try {
    var inicio = Date.now();
    var destino = DriveApp.getFolderById(DESTINO);
    var cache = {};
    var movidos = 0;

    // 1. Lo que ya estaba en «Meet ordenado/<grupo>/AAAA-MM-DD HH.MM»: le falta el mes.
    var grupos = destino.getFolders();
    while (grupos.hasNext()) {
      var grupo = grupos.next();
      // Primero la lista y después mover: mover mientras se recorre el
      // iterador de Drive puede saltarse carpetas.
      var sesiones = [];
      var it = grupo.getFolders();
      while (it.hasNext()) sesiones.push(it.next());
      for (var j = 0; j < sesiones.length; j++) {
        var s = sesiones[j];
        var m = /^(\d{4})-(\d{2})-\d{2} \d{2}\.\d{2}$/.exec(s.getName());
        if (!m) continue;
        if (Date.now() - inicio > TOPE_MS) return seguir_(movidos);
        var mes = m[1] + "-" + m[2];
        Logger.log((soloMirar ? "[probar] " : "") + grupo.getName() + "/" + s.getName() + " → " + grupo.getName() + "/" + mes + "/");
        if (!soloMirar) { s.moveTo(carpeta_(grupo, mes, cache)); movidos++; }
      }
    }

    // 2. Lo de «Google Meet», archivo por archivo (una carpeta de reunión
    //    junta varias sesiones). Los accesos directos se dejan: son archivos
    //    de otras personas.
    var archivos = [];
    ORIGENES.forEach(function (id) { archivos = archivos.concat(archivosDe_(DriveApp.getFolderById(id))); });
    for (var i = 0; i < archivos.length; i++) {
      if (Date.now() - inicio > TOPE_MS) return seguir_(movidos);
      var f = archivos[i];
      if (f.getMimeType() === MimeType.SHORTCUT) continue;
      var d = leerNombre_(f);
      var ruta = [d.grupo, d.mes, d.sesion];
      Logger.log((soloMirar ? "[probar] " : "") + f.getName() + " → " + ruta.join("/"));
      if (!soloMirar) {
        var c = destino;
        for (var k = 0; k < ruta.length; k++) c = carpeta_(c, ruta[k], cache);
        f.moveTo(c);
        movidos++;
      }
    }

    if (!soloMirar) armarIndice_(destino);
    Logger.log((soloMirar ? "[probar] Nada se movió." : "Listo: " + movidos + " movidos."));
  } finally {
    candado.releaseLock();
  }
}

function seguir_(movidos) {
  Logger.log("Se acabó el tiempo de esta vuelta (" + movidos + " movidos): sigue en la próxima hora.");
}

// Todos los archivos de una carpeta y sus subcarpetas.
function archivosDe_(carpeta) {
  var lista = [];
  var fs = carpeta.getFiles();
  while (fs.hasNext()) lista.push(fs.next());
  var cs = carpeta.getFolders();
  while (cs.hasNext()) lista = lista.concat(archivosDe_(cs.next()));
  return lista;
}

// La subcarpeta con ese nombre, o una nueva. El caché evita preguntarle a
// Drive lo mismo doscientas veces.
function carpeta_(padre, nombre, cache) {
  var clave = padre.getId() + "/" + nombre;
  if (cache[clave]) return cache[clave];
  var it = padre.getFoldersByName(nombre);
  var c = it.hasNext() ? it.next() : padre.createFolder(nombre);
  cache[clave] = c;
  return c;
}

/**
 * Lo que dice el nombre que pone Meet:
 *   «Clase SJ Octubre - 2026/10/03 09:29 CST - Recording»
 *   «hiz-cejh-rbe (2026-06-18 14:26 GMT-6) - Transcript»
 *   «Transcripción del chat: zpy-puco-ocd (2025-11-27 09:35 GMT-6)»
 *   «Informe de asistencia de ikm-anac-nhd (2026-03-05 17:58 GMT-6)»
 * Sin fecha en el nombre, la de creación del archivo, y va a «Otras».
 */
function leerNombre_(f) {
  var nombre = f.getName().replace(/^(Transcripción del chat|Informe de asistencia de)[:\s]*/i, "");
  var m = /(\d{4})[\/\-_](\d{2})[\/\-_](\d{2})[ T]+(\d{1,2})[:.](\d{2})/.exec(nombre);
  var a, me, d, h, mi, reunion;
  if (m) {
    a = m[1]; me = m[2]; d = m[3]; h = ("0" + m[4]).slice(-2); mi = m[5];
    reunion = nombre.slice(0, m.index).replace(/[\s\-–(]+$/, "");
  } else {
    var t = f.getDateCreated();
    a = Utilities.formatDate(t, ZONA, "yyyy"); me = Utilities.formatDate(t, ZONA, "MM");
    d = Utilities.formatDate(t, ZONA, "dd"); h = Utilities.formatDate(t, ZONA, "HH");
    mi = Utilities.formatDate(t, ZONA, "mm");
    reunion = "";
  }
  return { grupo: grupoDe_(reunion), mes: a + "-" + me, sesion: a + "-" + me + "-" + d + " " + h + "." + mi };
}

function grupoDe_(reunion) {
  var limpio = reunion.replace(/\s*\(recurring\)\s*$/i, "").trim();
  // Sin nombre, o con el código de Meet en vez de un nombre («abc-defg-hij»).
  if (!limpio || /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(limpio)) return OTRAS;
  var plano = limpio.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (var i = 0; i < GRUPOS.length; i++) if (GRUPOS[i][0].test(plano)) return GRUPOS[i][1];
  return limpio;
}

// ------------------------------------------------------------ el índice

/**
 * Una fila por sesión. Los enlaces van como texto con enlace (RichText), no
 * como fórmula =HYPERLINK: con la hoja en español la fórmula pide «;» y no
 * «,», y por eso el índice anterior quedó entero en #ERROR!.
 */
function armarIndice_(destino) {
  var filas = [];
  var grupos = destino.getFolders();
  while (grupos.hasNext()) {
    var g = grupos.next();
    var meses = g.getFolders();
    while (meses.hasNext()) {
      var mes = meses.next();
      var sesiones = mes.getFolders();
      while (sesiones.hasNext()) {
        var s = sesiones.next();
        var p = /^(\d{4}-\d{2}-\d{2}) (\d{2})\.(\d{2})$/.exec(s.getName());
        if (!p) continue;
        var fila = { grupo: g.getName(), fecha: p[1], hora: p[2] + ":" + p[3], carpeta: s.getUrl(),
                     grabacion: [], transcripcion: [], chat: [], notas: [], asistencia: [], otro: [] };
        var fs = s.getFiles();
        while (fs.hasNext()) {
          var f = fs.next(), n = f.getName();
          var tipo = /Recording/i.test(n) ? "grabacion" : /Transcript|Transcripción/i.test(n) ? "transcripcion"
            : /Chat/i.test(n) ? "chat" : /Notas|Gemini|Notes/i.test(n) ? "notas"
            : /Asistencia|Attendance/i.test(n) ? "asistencia" : "otro";
          fila[tipo].push(f.getUrl());
        }
        filas.push(fila);
      }
    }
  }
  filas.sort(function (x, y) { return (y.fecha + y.hora).localeCompare(x.fecha + x.hora); });

  var hoja = SpreadsheetApp.openById(INDICE).getSheets()[0];
  hoja.clear();
  var titulos = ["Grupo", "Fecha", "Hora", "Carpeta", "Grabación", "Transcripción", "Chat", "Notas de Gemini", "Asistencia", "Otro"];
  hoja.getRange(1, 1, 1, titulos.length).setValues([titulos]).setFontWeight("bold");
  if (!filas.length) return;
  var enlace = function (urls, texto) {
    if (!urls.length) return SpreadsheetApp.newRichTextValue().setText("").build();
    var t = urls.length > 1 ? texto + " (" + urls.length + ")" : texto;
    return SpreadsheetApp.newRichTextValue().setText(t).setLinkUrl(urls[0]).build();
  };
  var valores = filas.map(function (f) { return [f.grupo, f.fecha, f.hora]; });
  var ricos = filas.map(function (f) {
    return [enlace([f.carpeta], "Abrir"), enlace(f.grabacion, "Ver"), enlace(f.transcripcion, "Leer"),
            enlace(f.chat, "Chat"), enlace(f.notas, "Notas"), enlace(f.asistencia, "Lista"), enlace(f.otro, "Otro")];
  });
  // La fecha y la hora como texto: si no, la hoja las convierte a su manera.
  hoja.getRange(2, 1, filas.length, 3).setNumberFormat("@").setValues(valores);
  hoja.getRange(2, 4, filas.length, 7).setRichTextValues(ricos);
  hoja.setFrozenRows(1);
}
