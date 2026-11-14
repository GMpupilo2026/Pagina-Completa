/* El programa para Windows de Ajedrez Integral: una ventana con todas las
 * herramientas para organizar un torneo (Pareo Integral y el Centro del
 * evento, la Mesa del árbitro, las mesas de un evento, las cámaras de Notara,
 * el Fair Play y los torneos publicados).
 *
 * Abre ajedrez-integral.com: la sesión, la licencia, la base y lo que se
 * guarda para usar sin internet son los del sitio. Las reglas (qué se abre
 * adentro, qué en el navegador, qué permisos se dan) están en reglas.js, que
 * prueba herramientas/verificar-escritorio.js. Sin internet y con el sitio
 * todavía sin guardar, muestra sin-conexion.html.
 *
 * Seguridad: las páginas corren aisladas (contextIsolation, sandbox, sin
 * Node), no navegan fuera del sitio y solo el sitio recibe permisos.
 * Ver «El programa para Windows» en docs/decisiones/sitio-e-infraestructura.md.
 */
"use strict";

const path = require("path");
const { app, BrowserWindow, Menu, shell, session, dialog } = require("electron");
const R = require("./reglas");

const TITULO = "Ajedrez Integral · Organización de torneos";
const ICONO = path.join(__dirname, "icono.png");
const SIN_CONEXION = path.join(__dirname, "sin-conexion.html");
// Las páginas de una herramienta se dan por cargadas a los 4 segundos de
// terminar (sus scripts piden lo suyo después de «load»).
const ESPERA_PREPARAR_MS = 4000;

let ventana = null;

// Una sola copia del programa: abrirlo otra vez trae la ventana al frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  });
}

const preferencias = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: true,
};

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: TITULO,
    icon: ICONO,
    backgroundColor: "#f0f4f8",
    show: false,
    webPreferences: preferencias,
  });
  ventana.once("ready-to-show", () => ventana.show());
  ventana.on("closed", () => { ventana = null; });
  ventana.loadURL(R.INICIO);
}

// Sin internet (y sin la página guardada por el sitio): la página propia, con
// «Volver a intentar» hacia la dirección que falló.
function mostrarSinConexion(contenidos, fallida) {
  contenidos.loadFile(SIN_CONEXION, { query: { volver: R.esDelSitio(fallida) ? fallida : R.INICIO } });
}

// Cada ventana y cada página que se abra pasa por acá.
app.on("web-contents-created", (_e, contenidos) => {
  // Las ventanas nuevas: del sitio, adentro (el proyector, una hoja para
  // imprimir); lo demás, al navegador de la computadora.
  contenidos.setWindowOpenHandler(({ url }) => {
    if (R.esDelSitio(url)) return { action: "allow", overrideBrowserWindowOptions: { icon: ICONO, webPreferences: preferencias } };
    if (R.puedeAbrirAfuera(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Navegar: solo dentro del sitio o a la página propia de sin conexión.
  contenidos.on("will-navigate", (evento, url) => {
    if (R.esDelSitio(url) || R.esPaginaPropia(url)) return;
    evento.preventDefault();
    if (R.puedeAbrirAfuera(url)) shell.openExternal(url);
  });
  contenidos.on("will-attach-webview", (evento) => evento.preventDefault());
  contenidos.on("did-fail-load", (_ev, codigo, _desc, url, esPrincipal) => {
    // -3 = se canceló (una navegación tapó a otra): no es falta de internet.
    if (!esPrincipal || codigo === -3 || !R.esDelSitio(url)) return;
    mostrarSinConexion(contenidos, url);
  });
});

function configurarSesion() {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((contenidos, permiso, responder) => responder(R.permisoPermitido(contenidos.getURL(), permiso)));
  s.setPermissionCheckHandler((_contenidos, permiso, origen) => R.permisoPermitido(origen, permiso));
  // Que el sitio pueda saber que lo abre el programa (para avisos propios, más adelante).
  s.setUserAgent(s.getUserAgent() + " AjedrezIntegralEscritorio/" + app.getVersion());
}

function ir(url) {
  if (!ventana) crearVentana();
  ventana.loadURL(url);
  ventana.focus();
}

// «Preparar para usar sin internet»: abre cada herramienta una vez, en una
// ventana escondida, para que el sitio guarde sus páginas y sus scripts.
// Dos vueltas: en una computadora nueva, la primera página instala el
// guardado del sitio (sw.js) y recién desde ahí se guarda lo que pasa; la
// segunda vuelta pasa todo por él. Probado así, con una computadora nueva y
// después sin red: Pareo abrió desde lo guardado.
async function prepararSinInternet() {
  const oculta = new BrowserWindow({ show: false, webPreferences: preferencias });
  let listas = 0;
  for (const vuelta of [1, 2]) {
    listas = 0;
    for (const url of R.PARA_SIN_INTERNET) {
      try {
        await oculta.loadURL(url);
        await new Promise((listo) => setTimeout(listo, vuelta === 1 ? ESPERA_PREPARAR_MS : ESPERA_PREPARAR_MS / 2));
        listas++;
      } catch (e) { /* sin internet o la página falló: se sigue con la siguiente */ }
    }
  }
  oculta.destroy();
  const todas = listas === R.PARA_SIN_INTERNET.length;
  dialog.showMessageBox(ventana, {
    type: todas ? "info" : "warning",
    title: "Usar sin internet",
    message: todas ? "Listo: las herramientas quedaron guardadas en esta computadora."
      : "Se guardaron " + listas + " de " + R.PARA_SIN_INTERNET.length + " páginas. Revisa la conexión y vuelve a intentarlo.",
    detail: "Hazlo con internet antes de cada torneo, y abre en cada herramienta el torneo con el que vas a trabajar.",
    buttons: ["Entendido"],
  });
}

function menu() {
  const plantilla = [
    {
      label: "Archivo",
      submenu: [
        { label: "Inicio", accelerator: "CmdOrCtrl+H", click: () => ir(R.INICIO) },
        { label: "Preparar para usar sin internet", click: () => prepararSinInternet() },
        { type: "separator" },
        { label: "Imprimir…", accelerator: "CmdOrCtrl+P", click: () => ventana && ventana.webContents.print() },
        { type: "separator" },
        { label: "Salir", role: "quit" },
      ],
    },
    {
      label: "Herramientas",
      submenu: R.HERRAMIENTAS.map((h) => ({ label: h.nombre, accelerator: h.tecla, click: () => ir(R.direccionDe(h.ruta)) })),
    },
    {
      label: "Ver",
      submenu: [
        { label: "Atrás", accelerator: "Alt+Left", click: () => ventana && ventana.webContents.navigationHistory.canGoBack() && ventana.webContents.navigationHistory.goBack() },
        { label: "Adelante", accelerator: "Alt+Right", click: () => ventana && ventana.webContents.navigationHistory.canGoForward() && ventana.webContents.navigationHistory.goForward() },
        { label: "Volver a cargar", role: "reload" },
        { type: "separator" },
        { label: "Agrandar", role: "zoomIn" },
        { label: "Achicar", role: "zoomOut" },
        { label: "Tamaño normal", role: "resetZoom" },
        { type: "separator" },
        { label: "Pantalla completa", role: "togglefullscreen" },
      ],
    },
    {
      label: "Ayuda",
      submenu: [
        { label: "Manual de Pareo Integral", click: () => ir(R.SITIO + "/pareo-manual.html") },
        { label: "Abrir esta página en el navegador", click: () => ventana && R.esDelSitio(ventana.webContents.getURL()) && shell.openExternal(ventana.webContents.getURL()) },
        { type: "separator" },
        { label: "Herramientas de desarrollo (soporte)", role: "toggleDevTools" },
        {
          label: "Acerca del programa",
          click: () => dialog.showMessageBox(ventana, { type: "info", title: "Acerca del programa", message: TITULO, detail: "Versión " + app.getVersion() + "\n" + R.SITIO, buttons: ["Cerrar"] }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

app.whenReady().then(() => {
  configurarSesion();
  menu();
  crearVentana();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) crearVentana(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

/*! rev bfb5bbb0d2d82f9f */
