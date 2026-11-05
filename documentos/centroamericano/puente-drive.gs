/**
 * El puente entre la Mesa del árbitro del Centroamericano 2026 y el Drive.
 *
 * Es un Apps Script que corre COMO LA DUEÑA DEL DRIVE (los archivos son suyos y gastan su
 * espacio; no hay cuentas de servicio ni llaves de Google Cloud en el sitio). Lo llaman solo
 * la Edge Function `centroamericano-mesa` (la foto de cada planilla, apenas el árbitro la
 * sube), `centroamericano-clave` (probar la conexión y reintentar lo que no llegó) y la base
 * (la copia de seguridad cada 10 minutos), siempre con un secreto que vive en las
 * propiedades de este script y en la bóveda de la base.
 *
 * Todo va ordenado así:
 *
 *   Planillas Centroamericano / Centroamericano 2026 / <torneo y categoría> / Ronda <n> /
 *       Mesa 07 - <blancas> vs <negras> - Planillas (las dos).jpg
 *   Planillas Centroamericano / Ensayo (pruebas) / PRUEBA grupo A / Ronda <n> / …   (los torneos de ensayo, aparte)
 *   Planillas Centroamericano / _Copias de seguridad / copia-AAAA-MM-DD-HHMM.json
 *
 * «<torneo y categoría>» es el nombre del torneo de chess-results: «Sub-18 Femenino», «Sub-8 Absoluto»…
 *
 * Si se vuelve a subir la foto de la misma mesa, la anterior va a la papelera: nunca
 * quedan dos fotos de las planillas de la misma mesa. Las copias de seguridad no se pisan:
 * cada una lleva su hora (se pueden borrar a mano cuando termine el torneo).
 *
 * CÓMO SE INSTALA (una sola vez; está también en docs/decisiones/juegos-y-torneos.md,
 * «Terminar la ronda, planillas y respaldo»):
 *   1. script.google.com → Proyecto nuevo, con la cuenta dueña del Drive. Pegar este archivo
 *      entero en Código.gs.
 *   2. Ejecutar la función `configurar` una vez y aceptar los permisos. En el registro de
 *      ejecución quedan la carpeta y el SECRETO.
 *   3. Implementar → Nueva implementación → Aplicación web. Ejecutar como: Yo. Quién tiene
 *      acceso: Cualquier persona. Copiar la URL (termina en /exec).
 *   4. En centroamericano-mesas.html → pestaña «Planillas y Drive» → «Conectar con Drive»:
 *      pegar la URL y el secreto. Se prueba antes de guardarse.
 *   (Si ya estaba instalado y hay código nuevo: pegarlo, «Implementar» → «Gestionar
 *   implementaciones» → editar → Versión: «Nueva versión». La URL no cambia.)
 *   (Si las carpetas ya estaban creadas con el orden de antes —Planillas Centroamericano / Sub-18 Femenino / …—:
 *   ejecutar UNA vez la función `reorganizar`: las mete dentro de «Centroamericano 2026» (o «Ensayo (pruebas)») y junta
 *   las que hayan quedado repetidas. No borra ninguna foto.)
 *
 * «Cualquier persona» puede LLAMAR la URL, pero sin el secreto no hace nada: lo compara
 * antes de tocar el Drive.
 */

var NOMBRE_RAIZ = "Planillas Centroamericano";
var NOMBRE_EVENTO = "Centroamericano 2026";
var NOMBRE_ENSAYO = "Ensayo (pruebas)";

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
  return String(s || "").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, largo || 100);
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

// Los torneos de ensayo (PRUEBA grupo A y B) van en su propia carpeta, para no mezclarse con las planillas de verdad.
function esEnsayo(nombre) { return /^prueba\b/i.test(String(nombre || "").trim()); }

// La carpeta del evento (o la de ensayos) dentro de «Planillas Centroamericano».
function carpetaEvento(torneo) {
  return subcarpeta(carpetaRaiz(), esEnsayo(torneo) ? NOMBRE_ENSAYO : NOMBRE_EVENTO);
}

// «Planillas Centroamericano» en «Mi unidad»: si ya existe se usa, si no se crea.
function carpetaRaiz() {
  var raiz = DriveApp.getRootFolder();
  return subcarpeta(raiz, NOMBRE_RAIZ);
}

function dosCifras(n) { n = Number(n) || 0; return (n < 10 ? "0" : "") + n; }

function guardarPlanilla(d) {
  var ronda = Number(d.ronda), mesa = Number(d.mesa);
  if (!(ronda >= 1 && ronda <= 99) || !(mesa >= 1 && mesa <= 9999)) throw new Error("ronda o mesa no válidas");
  // «ambas»: una sola foto con las dos planillas (lo normal desde el 1 de noviembre).
  if (d.lado !== "ambas" && d.lado !== "blancas" && d.lado !== "negras") throw new Error("lado no válido");
  var bytes = Utilities.base64Decode(String(d.imagen || ""));
  if (bytes.length < 2000 || bytes.length > 8 * 1024 * 1024) throw new Error("imagen no válida");
  var torneo = subcarpeta(carpetaEvento(d.torneo), limpio(d.torneo || "Sin torneo", 60));
  var rondaCarpeta = subcarpeta(torneo, "Ronda " + ronda);
  var ambas = d.lado === "ambas";
  var nombre = "Mesa " + dosCifras(mesa) + " - " + limpio(d.blancas, 45) + " vs " + limpio(d.negras, 45) +
    (ambas ? " - Planillas (las dos).jpg" : " - Planilla de " + d.lado + " (" + limpio(d.jugador, 45) + ").jpg");
  // La misma foto vuelta a subir: la anterior (misma mesa) a la papelera.
  var prefijo = "Mesa " + dosCifras(mesa) + " - ";
  var sufijo = ambas ? " - Planillas (las dos)" : " - Planilla de " + d.lado + " (";
  var archivos = rondaCarpeta.getFiles();
  while (archivos.hasNext()) {
    var f = archivos.next();
    var n = f.getName();
    if (n.indexOf(prefijo) === 0 && n.indexOf(sufijo) > 0) f.setTrashed(true);
  }
  var archivo = rondaCarpeta.createFile(Utilities.newBlob(bytes, "image/jpeg", nombre));
  return { ok: true, enlace: archivo.getUrl(), carpeta: rondaCarpeta.getName() };
}

// Pasa lo de `origen` a `destino` sin pisar nada: una carpeta que ya existe en el destino se junta con la de
// origen (se vuelve a llamar con sus cosas) y las demás se mueven enteras. Las fotos no se borran nunca.
function fusionar(origen, destino) {
  var archivos = origen.getFiles(), pasar = [];
  while (archivos.hasNext()) pasar.push(archivos.next());
  pasar.forEach(function (f) { f.moveTo(destino); });
  var hijas = origen.getFolders(), carpetas = [];
  while (hijas.hasNext()) carpetas.push(hijas.next());
  carpetas.forEach(function (h) {
    var igual = null, existentes = destino.getFolders();
    while (existentes.hasNext()) { var e = existentes.next(); if (clave(e.getName()) === clave(h.getName())) { igual = e; break; } }
    if (igual) { fusionar(h, igual); } else { h.moveTo(destino); }
  });
  // Solo se manda a la papelera la carpeta que quedó vacía.
  if (!origen.getFiles().hasNext() && !origen.getFolders().hasNext()) origen.setTrashed(true);
}

// UNA sola vez, si las carpetas ya estaban creadas con el orden de antes (Planillas Centroamericano / Sub-18 Femenino /
// Ronda 1): las mete dentro de «Centroamericano 2026» (o de «Ensayo (pruebas)») y junta las repetidas.
function reorganizar() {
  var raiz = carpetaRaiz();
  var evento = subcarpeta(raiz, NOMBRE_EVENTO), ensayo = subcarpeta(raiz, NOMBRE_ENSAYO);
  var hijas = raiz.getFolders(), mover = [];
  while (hijas.hasNext()) {
    var h = hijas.next(), n = h.getName();
    if (n.charAt(0) === "_" || clave(n) === clave(NOMBRE_EVENTO) || clave(n) === clave(NOMBRE_ENSAYO)) continue;
    mover.push(h);
  }
  mover.forEach(function (h) {
    var destino = esEnsayo(h.getName()) ? ensayo : evento, existente = null, existentes = destino.getFolders();
    while (existentes.hasNext()) { var e = existentes.next(); if (clave(e.getName()) === clave(h.getName())) { existente = e; break; } }
    if (existente) { fusionar(h, existente); } else { h.moveTo(destino); }
  });
  Logger.log("Carpetas puestas en orden: " + mover.length);
}

function guardarCopia(d) {
  var carpeta = subcarpeta(carpetaRaiz(), "_Copias de seguridad");
  var nombre = limpio(d.nombre || ("copia-" + new Date().toISOString() + ".json"), 80);
  if (!/\.json$/.test(nombre)) nombre += ".json";
  var archivo = carpeta.createFile(nombre, JSON.stringify(d.copia), "application/json");
  return { ok: true, enlace: archivo.getUrl() };
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!mismoSecreto(d.secreto, PropertiesService.getScriptProperties().getProperty("SECRETO"))) return responder({ ok: false, error: "secreto" });
    if (d.accion === "probar") return responder({ ok: true, carpeta: carpetaRaiz().getName() });
    if (d.accion === "planilla") return responder(guardarPlanilla(d));
    if (d.accion === "copia") return responder(guardarCopia(d));
    return responder({ ok: false, error: "acción desconocida" });
  } catch (err) {
    return responder({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 200) });
  }
}

/*! rev bfb5bbb0d2d82f9f */
