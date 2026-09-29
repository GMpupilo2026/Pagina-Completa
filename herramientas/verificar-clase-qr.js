#!/usr/bin/env node
/* Entrar a la clase desde el celular con un código QR (sesion.html).

   - En el proyector (sesion.html?proyector=1), «📱 Código para entrar» muestra
     un código QR que abre sesion.html?profe=<id del profe>. Se comprueba LEYENDO
     el código de una captura de la pantalla (jsQR), en modo claro y en modo
     oscuro: que se vea no alcanza, tiene que decir la dirección correcta y la
     cámara tiene que poder leerlo (negro sobre blanco, con su margen).
   - Al lado, la dirección escrita y cuántos alumnos ya entraron.
   - La librería (js/vendor/qrcode.js) se pide recién al mostrarlo: la ventana
     de siempre del profe no la carga, y ahí el botón no está.
   - El alumno que llega con ?profe= entra a la clase de ESE profe si es uno de
     los suyos (y queda recordada); con un id que no es de sus profes, no pasa
     nada. El parámetro se quita de la dirección.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-qr.js
*/
const fs = require("fs");
const path = require("path");
const jsQR = require("jsqr");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME, BASE } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const CLASE2 = { id: "c-otra", created_by: "u-profe2", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const fila = (extra) => Object.assign({ id: 7, owner_id: "u-profe", fen: INICIO, moves: [], start_fen: INICIO, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null, podio: null, equipos: null }, extra || {});

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);

// Lee el código de una captura de lo que se ve en pantalla, como la cámara.
async function leerQr(page, sel) {
  const png = await page.locator(sel || "#entrar-qr-caja").screenshot();
  const img = await page.evaluate(async (b64) => {
    const i = new Image();
    i.src = "data:image/png;base64," + b64;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = i.naturalWidth; c.height = i.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(i, 0, 0);
    return { w: c.width, h: c.height, datos: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
  }, png.toString("base64"));
  const r = jsQR(Uint8ClampedArray.from(img.datos), img.w, img.h);
  return r ? r.data : null;
}

function laParteQueNoTocaLaPagina() {
  console.log("\n=== EntrarConQr, solo ===");
  global.window = { qrcode: require("qrcode-generator") };
  const s = fs.readFileSync(path.join(__dirname, "..", "js", "clase-qr.js"), "utf8");
  const i = s.indexOf("window."), j = s.indexOf("})();", i) + 5;
  eval(s.slice(i, j));
  const { EntrarConQr } = global.window;
  igual("la dirección lleva el id del profe", EntrarConQr.enlace("https://ajedrez-integral.com/", "u-profe"), "https://ajedrez-integral.com/sesion.html?profe=u-profe");
  const m = EntrarConQr.modulos(EntrarConQr.enlace("https://ajedrez-integral.com", "3f0c8a52-6f7e-4d7b-9a51-0c1f1c7c9e11"));
  igual("con un id de verdad, el código es cuadrado y chico (≤ 41 módulos, versión 6)", [m.length === m[0].length, m.length <= 41], [true, true]);
}

async function pruebaProyector(browser) {
  console.log("\n=== El código en el proyector ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] }, { ruta: "/sesion.html?proyector=1" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
  igual("el botón está en la barra del proyector", await seVe(page, "#proyector-qr-btn"), true);
  igual("el código no está hasta que se pide, y el botón lo dice", [await seVe(page, "#entrar-qr-caja"),
    await page.getAttribute("#proyector-qr-btn", "aria-expanded")], [false, "false"]);
  igual("y la librería del QR todavía no se cargó", await page.evaluate(() => typeof window.qrcode), "undefined");
  await page.getByRole("button", { name: "📱 Código para entrar" }).click();
  await page.waitForFunction(() => document.getElementById("entrar-qr-caja").checkVisibility(), null, { timeout: 10000 });
  igual("al pedirlo se ve, y el botón dice que está abierto", [await seVe(page, "#entrar-qr-caja"),
    await page.getAttribute("#proyector-qr-btn", "aria-expanded")], [true, "true"]);
  igual("la cámara lo lee y abre la clase de este profe", await leerQr(page), BASE + "/sesion.html?profe=u-profe");
  igual("la dirección también va escrita", await page.textContent("#entrar-qr-direccion"), new URL(BASE).host + "/sesion.html");
  igual("dice que todavía no entró nadie", await page.textContent("#entrar-qr-cuenta"), "Todavía no entró nadie.");
  await page.evaluate(() => window.__entraAlumno());
  await page.waitForFunction(() => /1 alumno/.test(document.getElementById("entrar-qr-cuenta").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("y cuenta a quien entra", await page.textContent("#entrar-qr-cuenta"), "Ya entró 1 alumno.");
  igual("el código tiene nombre para el lector de pantalla", await page.getAttribute("#entrar-qr-dibujo svg", "aria-label"), "Código QR para entrar a la clase desde el celular");

  // En modo oscuro el código sigue negro sobre blanco: invertido, muchas cámaras no lo leen.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  igual("en modo oscuro se sigue leyendo", await leerQr(page), BASE + "/sesion.html?profe=u-profe");
  igual("y la caja sigue blanca (el texto oscuro se lee sobre ella)", await page.evaluate(() =>
    getComputedStyle(document.querySelector("#entrar-qr-caja > div")).backgroundColor), "rgb(255, 255, 255)");
  /* El dibujo solo, con lo de alrededor en negro: tiene que traer su propio
     fondo blanco y su margen de 4 módulos, que son parte del código. Si los
     pusiera la caja, bastaría con que ella cambiara para que la cámara no lo
     encontrara. */
  await page.evaluate(() => { document.querySelector("#entrar-qr-caja > div").style.background = "#000"; });
  // jsQR lee hasta sin margen; las cámaras de los celulares, no siempre: se mide.
  igual("el dibujo trae su margen blanco de 4 módulos por lado", await page.evaluate(() => {
    const s = document.querySelector("#entrar-qr-dibujo svg");
    const lado = Number(s.getAttribute("viewBox").split(" ")[2]);
    const xy = [...s.querySelector("path").getAttribute("d").matchAll(/M(\d+) (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const min = Math.min(...xy.flat()), max = Math.max(...xy.flat()) + 1;
    return Math.min(min, lado - max);
  }), 4);
  igual("el dibujo se lee solo, aunque alrededor quede oscuro", await leerQr(page, "#entrar-qr-dibujo"), BASE + "/sesion.html?profe=u-profe");
  await page.evaluate(() => { document.querySelector("#entrar-qr-caja > div").style.background = ""; });

  await page.getByRole("button", { name: "Ocultar el código" }).click();
  igual("se oculta, y el botón lo dice", [await seVe(page, "#entrar-qr-caja"), await page.getAttribute("#proyector-qr-btn", "aria-expanded")], [false, "false"]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaVentanaDeSiempre(browser) {
  console.log("\n=== En la ventana de siempre del profe ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
  igual("el botón no está (es del proyector)", await seVe(page, "#proyector-qr-btn"), false);
  igual("y no carga la librería", await page.evaluate(() => typeof window.qrcode), "undefined");
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaAlumno(browser) {
  console.log("\n=== El alumno que escanea el código ===");
  const CLASES = [
    { profesor_id: "u-profe", profesor: "Karina Rojas", es_principal: true, clase_abierta: true },
    { profesor_id: "u-profe2", profesor: "Luis Mora", es_principal: false, clase_abierta: true },
  ];
  const semilla = { mis_clases: CLASES, game_state: [fila(), fila({ id: 8, owner_id: "u-profe2" })], class_sessions: [CLASE, CLASE2] };
  {
    const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, semilla, { ruta: "/sesion.html?profe=u-profe2" });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
    igual("entra a la clase del profe del código, no a la del principal", await page.inputValue("#selector-clase"), "u-profe2");
    igual("y queda recordada", await page.evaluate(() => localStorage.getItem("clase_elegida_v1")), "u-profe2");
    igual("el ?profe= se quita de la dirección (si no, mandaría al cambiar de clase)", await page.evaluate(() => location.search), "");
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }
  {
    const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, semilla, { ruta: "/sesion.html?profe=u-ajeno" });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
    igual("con un profe que no es suyo no pasa nada: entra a la de siempre", await page.inputValue("#selector-clase"), "u-profe");
    igual("y no se recuerda el id ajeno", await page.evaluate(() => localStorage.getItem("clase_elegida_v1")), null);
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }
}

(async () => {
  laParteQueNoTocaLaPagina();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProyector(browser);
    await pruebaVentanaDeSiempre(browser);
    await pruebaAlumno(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el código QR lleva a la clase.");
  process.exit(fallos ? 1 : 0);
})();
