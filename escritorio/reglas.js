/* Las reglas del programa para Windows, aparte de Electron para poder
 * probarlas en Node (herramientas/verificar-escritorio.js).
 *
 * El programa es una ventana que abre ajedrez-integral.com: todo lo demás —la
 * sesión, la licencia, la base, la publicación de los torneos, lo que se
 * guarda para usar sin internet (sw.js y la caché «sin red» de Pareo)— es el
 * sitio de siempre. Lo único que decide el programa es:
 *   - qué direcciones se abren adentro (las del sitio) y cuáles en el
 *     navegador de la computadora (el resto, y solo si son https);
 *   - qué permisos se le dan a una página (la cámara para Notara, los avisos,
 *     copiar al portapapeles, la pantalla completa), y solo al sitio;
 *   - el menú de herramientas.
 * Ver «El programa para Windows» en docs/decisiones/sitio-e-infraestructura.md.
 */
"use strict";

const SITIO = "https://ajedrez-integral.com";
// La primera página que abre el programa.
const INICIO = SITIO + "/herramientas-arbitraje.html";

// Las herramientas del menú, en el orden en que se usan en un torneo. Cada
// ruta es una página del sitio (el verificador comprueba que exista).
const HERRAMIENTAS = [
  { nombre: "Pareo Integral y el Centro del evento", ruta: "/pareo.html", tecla: "CmdOrCtrl+1" },
  { nombre: "Mesa del árbitro", ruta: "/mesa-arbitro.html", tecla: "CmdOrCtrl+2" },
  { nombre: "Mesas y árbitros de un evento", ruta: "/centroamericano-mesas.html", tecla: "CmdOrCtrl+3" },
  { nombre: "Cámaras de Notara", ruta: "/camaras.html", tecla: "CmdOrCtrl+4" },
  { nombre: "Fair Play", ruta: "/centroamericano-fair-play.html", tecla: "CmdOrCtrl+5" },
  { nombre: "Torneos publicados", ruta: "/torneos-pareo.html", tecla: "CmdOrCtrl+6" },
];

// Lo que se abre al «Preparar para usar sin internet»: cada herramienta una
// vez, para que el sitio guarde sus páginas y sus scripts (sw.js va a la red
// primero y guarda lo que pasa), más el manual y la entrada del adjunto.
const PARA_SIN_INTERNET = [INICIO].concat(HERRAMIENTAS.map((h) => SITIO + h.ruta), [
  SITIO + "/pareo-manual.html",
  SITIO + "/pareo.html#codigo",
  SITIO + "/offline.html",
]);

// Los permisos que puede pedir una página del sitio. Todo lo demás se niega.
//   media: la cámara de Notara (y el micrófono de una llamada en la mesa);
//   notifications: los avisos de una ronda, un llamado o una cámara;
//   clipboard-sanitized-write: «Copiar el enlace», «Copiar el código»;
//   fullscreen: el proyector de la sala.
const PERMISOS = new Set(["media", "notifications", "clipboard-sanitized-write", "fullscreen"]);

function url(texto) {
  try { return new URL(String(texto)); } catch (e) { return null; }
}

// ¿Es una página del sitio? Solo https y el dominio exacto (ni
// «ajedrez-integral.com.otro.com» ni un subdominio).
function esDelSitio(texto) {
  const u = url(texto);
  return !!u && u.protocol === "https:" && u.host === "ajedrez-integral.com";
}

// La página que muestra el programa cuando no hay internet y el sitio todavía
// no se guardó (sin-conexion.html, dentro del programa).
function esPaginaPropia(texto) {
  const u = url(texto);
  return !!u && u.protocol === "file:" && /\/sin-conexion\.html$/.test(u.pathname);
}

// Lo que no es del sitio se abre en el navegador de la computadora, y solo si
// es https: nunca file:, javascript:, data: ni un programa de la computadora.
function puedeAbrirAfuera(texto) {
  const u = url(texto);
  return !!u && u.protocol === "https:" && !esDelSitio(texto);
}

function permisoPermitido(origen, permiso) {
  return esDelSitio(origen) && PERMISOS.has(permiso);
}

// La dirección de una herramienta del menú, o null si la ruta no está en la lista.
function direccionDe(ruta) {
  const h = HERRAMIENTAS.find((x) => x.ruta === ruta);
  return h ? SITIO + h.ruta : null;
}

module.exports = { SITIO, INICIO, HERRAMIENTAS, PARA_SIN_INTERNET, PERMISOS, esDelSitio, esPaginaPropia, puedeAbrirAfuera, permisoPermitido, direccionDe };

/*! rev bfb5bbb0d2d82f9f */
