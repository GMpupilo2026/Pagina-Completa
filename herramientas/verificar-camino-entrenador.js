#!/usr/bin/env node
/* ===========================================================================
   El camino del entrenador, de punta a punta
   ===========================================================================

   Cada pieza de la plataforma tiene su verificador —tareas, planes, la clase
   en vivo, la bitácora, informes— y todos comprueban SU pantalla. Lo que no
   comprobaba ninguno es la COSTURA: que un entrenador pueda recorrer el camino
   entero sin encontrarse una puerta cerrada.

   Y ese es justo el hueco que se ve en los datos: de siete cuentas del equipo
   docente, el que más alumnos tiene llevaba 49 entradas y ni una tarea, ni una
   clase, ni un plan. No sabemos dónde se corta porque nadie lo ha recorrido
   seguido.

   Lo que se mide acá, con una profesora que NO administra —que es la cara que
   ningún verificador mira, porque los dobles suelen ponerle `is_admin`—:

   1. que cada pantalla del camino ABRA para ella: que no se vaya al login, que
      no se quede en «Comprobando tu sesión…», que no le diga acceso denegado y
      que no pinte «undefined» en ninguna parte;
   2. que ninguna sea un CALLEJÓN: que desde todas se pueda volver al panel;
   3. y —lo que de verdad encadena— que el destino que el panel le PROPONE en
      cada uno de sus seis peldaños abra de verdad para ella. Un peldaño que
      mande a una pantalla que le rebota no da ningún error: la franja se ve
      perfecta y el clic termina en el aviso de acceso denegado.

   Reusa el doble de `guia-capturas.js` (las cuentas de mentira y el cliente de
   Supabase): uno escrito aparte se iría separando del de verdad a la primera
   corrección, que es la regla de esta carpeta.

   Se corre con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-camino-entrenador.js
   =========================================================================== */

const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { clienteFalso, DEMO, PROFE, ALUMNOS } = require("./guia-capturas.js");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(que, real, esperado) {
  const ok = String(real) === String(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${que}${ok ? ": " + real : `\n      esperaba ${esperado}, llegó ${real}`}`);
}

/* La profesora del camino NO administra ni coordina. El doble de las capturas
   usa una con `is_admin` puesto —la guía tiene que enseñar todas las pantallas—
   y con eso los permisos no se prueban: quien administra pasa por todas
   partes. */
const ENTRENADORA = Object.assign({}, PROFE, {
  id: "demo-entrenadora", full_name: "Karina Rojas",
  email: "karina@ejemplo.test", is_admin: false, es_coordinador: false,
});
const PERFILES = [ENTRENADORA].concat(
  ALUMNOS.map((a) => Object.assign({}, a, { teacher_id: ENTRENADORA.id })));

/* Lo que descalifica una pantalla. Todas se ven igual de bien que la de
   verdad, y por eso se buscan escritas: una pantalla de espera que nunca se
   destapa no tira ningún error. */
const MUDA = [
  /comprobando tu sesión/i,
  /necesitas iniciar sesión/i,
  /acceso denegado/i,
  /no tienes permiso/i,
  /esta página es de coordinación/i,
  /solo para quien coordina/i,
];
const ROTOS = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/];

/* El camino, en el orden en que lo recorre quien da clase: mirar a sus
   alumnos, ponerles trabajo, preparar la clase, darla, y las herramientas de
   al lado. `vuelta` en false es para el documento que se abre suelto. */
const CAMINO = [
  { que: "el panel",              url: "/clases.html",   espera: "#tile-grid" },
  { que: "Informes",              url: "/informes.html", espera: "main" },
  { que: "Tareas",                url: "/tareas.html",   espera: "main" },
  { que: "Exámenes",              url: "/examenes.html", espera: "main" },
  { que: "Mis subgrupos",         url: "/subgrupos.html", espera: "main" },
  { que: "Planes de clase",       url: "/planes.html",   espera: "main" },
  { que: "la clase en vivo",      url: "/sesion.html",   espera: "#board, .board, #chessboard" },
  { que: "la caja de partidas",   url: "/partidas.html", espera: "main" },
  { que: "Torneos",               url: "/torneos.html",  espera: "main" },
  { que: "Juegos",                url: "/juegos.html",   espera: "main" },
  { que: "el lector de planilla", url: "/lector-planilla.html", espera: "main" },
  { que: "Configuración",         url: "/configuracion.html", espera: "main" },
  { que: "la guía del profesor",  url: "/guia-del-profesor-accesible.html", espera: "main, body", vuelta: true },
];

async function abrir(navegador, pagina, rpc) {
  const ctx = await navegador.newContext({
    viewport: { width: 1280, height: 900 },
    // Al recargar es el service worker quien sirve los archivos, y lo que él
    // pide no pasa por las rutas del contexto: volvería el supabase-client de
    // verdad y la pantalla moriría con "sb is not defined".
    serviceWorkers: "block",
  });
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdn.jsdelivr.net/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  // chess.js no se intercepta: vive en js/vendor/chess.js y lo sirve el sitio.
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript",
                body: clienteFalso({ perfiles: PERFILES, yo: ENTRENADORA, rpc: rpc || {} }) }));

  const page = await ctx.newPage();
  await page.goto(BASE + pagina.url, { waitUntil: "networkidle", timeout: 30000 });
  if (pagina.espera) await page.waitForSelector(pagina.espera, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(700);
  return { page, ctx };
}

async function mirar(page) {
  return page.evaluate(() => {
    const texto = (document.body.innerText || "").trim();
    // La vuelta al panel: cualquier enlace a clases.html que se vea de verdad
    // —el logo del encabezado de la Academia es el de siempre—.
    const vuelta = Array.from(document.querySelectorAll('a[href]'))
      .some((a) => /(^|\/)clases\.html($|[?#])/.test(a.getAttribute("href"))
                   && a.checkVisibility && a.checkVisibility());
    return { texto, vuelta, donde: location.pathname };
  });
}

/* ---------- 1 y 2: cada pantalla abre y tiene vuelta ---------- */
async function pruebaPantallas(navegador) {
  console.log("\n=== El camino abre entero para quien da clase y no administra ===");
  for (const p of CAMINO) {
    const { page, ctx } = await abrir(navegador, p);
    const v = await mirar(page);

    const problema =
      (/login\.html$/.test(v.donde) && "se fue al login")
      || (v.texto.length < 150 && `casi no tiene texto (${v.texto.length} caracteres)`)
      || ((MUDA.find((re) => re.test(v.texto.slice(0, 500))) || "") && "la pantalla la rechaza o se queda esperando")
      || ((ROTOS.find((re) => re.test(v.texto)) || "") && "pinta undefined/NaN en la pantalla")
      || "abre";
    igual(`${p.que} abre`, problema, "abre");
    igual(`y desde ${p.que} se puede volver al panel`, v.vuelta, "true");
    await ctx.close();
  }
}

/* ---------- 3: lo que el panel PROPONE, abre ----------
   Los seis peldaños de `primerPasoDelProfesor()`. Se lee el destino de la
   propia franja —no una lista copiada acá, que se quedaría vieja— y se abre
   esa página con el MISMO perfil. Un peldaño que mande a una pantalla que le
   rebota no da ningún error: la franja se ve perfecta y el clic termina en el
   aviso de acceso denegado. */
const ESTADOS = [
  ["sin alumnos", { alumnos: 0, activos_7d: 0, tareas_puestas: 0, clases_dadas: 0, con_diagnostico: 0, con_plan: 0 }],
  ["sin diagnósticos", { con_diagnostico: 0, con_plan: 0 }],
  ["con planes sin compartir", { con_diagnostico: 8, con_plan: 0 }],
  ["sin ninguna tarea puesta", { tareas_puestas: 0 }],
  ["sin ninguna clase dada", { clases_dadas: 0, clases_30d: 0 }],
  ["con diagnósticos a medias", { con_diagnostico: 8, con_plan: 8 }],
];
const BASE_PANEL = {
  alumnos: 10, activos_7d: 10, tareas_pendientes: 0, tareas_vencidas: 0,
  tareas_puestas: 5, clases_30d: 1, clases_dadas: 3, con_diagnostico: 10, con_plan: 10,
};

async function pruebaLoQuePropone(navegador) {
  console.log("\n=== Lo que el panel le propone, abre de verdad ===");
  for (const [nombre, fila] of ESTADOS) {
    const rpc = { panel_profesor: [Object.assign({}, BASE_PANEL, fila)] };
    const { page, ctx } = await abrir(navegador, CAMINO[0], rpc);
    const propuesta = await page.evaluate(() => {
      const caja = document.getElementById("pendientes-aviso");
      if (!caja || getComputedStyle(caja).display === "none") return null;
      return { destino: caja.getAttribute("href"),
               titulo: document.getElementById("pendientes-aviso-titulo").textContent };
    });
    await ctx.close();

    if (!propuesta) { igual(`${nombre}: el panel dice algo`, "no dice nada", "algo"); continue; }

    if (!propuesta.destino) {
      /* El único peldaño sin destino es a propósito: asignar alumnos es de
         quien administra, y un botón que va a fallar es peor que ninguno. */
      igual(`${nombre}: no se le ofrece ninguna página`, propuesta.titulo.slice(0, 30), "Todavía no tienes alumnos");
      continue;
    }

    const { page: p2, ctx: c2 } = await abrir(navegador, { url: "/" + propuesta.destino, espera: "main" }, rpc);
    const v = await mirar(p2);
    const abre = (/login\.html$/.test(v.donde) && "se fue al login")
      || ((MUDA.find((re) => re.test(v.texto.slice(0, 500))) || "") && "la rechaza o se queda esperando")
      || "abre";
    igual(`${nombre} → ${propuesta.destino}`, abre, "abre");
    await c2.close();
  }
}

(async () => {
  const navegador = await chromium.launch({ executablePath: CHROME });
  await pruebaPantallas(navegador);
  await pruebaLoQuePropone(navegador);
  await navegador.close();

  console.log(fallos
    ? `\nEl camino del entrenador se corta en ${fallos} ${fallos === 1 ? "sitio" : "sitios"}.`
    : "\nEl camino del entrenador se recorre entero.");
  process.exit(fallos ? 1 : 0);
})();
