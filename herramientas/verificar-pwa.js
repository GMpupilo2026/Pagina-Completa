/* Comprueba, en un navegador de verdad, que el sitio se pueda instalar como app
   y —lo que de verdad importa— que el service worker NO se guarde lo que no
   debe.

   El peligro de un service worker no es que falle: es que funcione demasiado.
   Si se guarda una hoja de estilos vieja, la página se ve mal sin dar ningún
   error. Si se guarda el contenido de un curso o el material de uso docente,
   queda en el teléfono después de cerrar sesión. Ninguna de las dos avisa.

   De una corrida:
     - el manifest existe, es JSON válido y trae lo que Android y Play exigen;
     - los iconos existen de verdad y miden lo que el manifest promete;
     - el service worker se registra y queda mandando;
     - NO guarda cursos/protegido/, cursos/recursos/ ni nada de otro dominio;
     - sin red, una página del sitio cae en offline.html;
     - todas las páginas del sitio declaran el manifest (si no, entrar por un
       enlace directo no ofrece instalar).

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-pwa.js                                   */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function mal(que) { console.log("  ✗ " + que); fallos += 1; }

// El tamaño de un PNG está en los 24 primeros bytes de la cabecera IHDR.
function tamanoPng(archivo) {
  const b = fs.readFileSync(archivo);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return b.readUInt32BE(16) + "x" + b.readUInt32BE(20);
}

/* El cartel de "Instala la Academia".
 *
 * `beforeinstallprompt` no se dispara en un navegador sin cabeza —hace falta
 * que el navegador decida que el sitio merece instalarse—, así que se dispara a
 * mano. Lo que se prueba es la DECISIÓN de mostrarlo o no, que es donde está la
 * lógica, y se prueba con el cartel de verdad: se saca de clases.html, no se
 * inventa uno, para que renombrar un botón allá se note acá.
 *
 * El paso del tiempo se simula moviendo la fecha guardada, no un reloj falso:
 * es lo mismo que le pasa a quien vuelve una semana después, y no depende de
 * ninguna trampa del navegador. */
async function probarCartelDeInstalar(navegador) {
  console.log("\n=== El cartel de instalar ===");
  const fs = require("fs");
  const path = require("path");
  const clases = fs.readFileSync(path.join(__dirname, "..", "clases.html"), "utf8");
  // Se corta contando <div> y </div>, no a ojo: así aguanta que alguien le
  // agregue una capa más al cartel.
  const desde = clases.indexOf('<div id="instalar-app"');
  if (desde < 0) { console.log("  ✗ clases.html ya no tiene el cartel #instalar-app"); fallos += 1; return; }
  let nivel = 0, i = desde, fin = -1;
  const etiquetas = /<\/?div\b/g;
  etiquetas.lastIndex = desde;
  let m;
  while ((m = etiquetas.exec(clases))) {
    nivel += m[0][1] === "/" ? -1 : 1;
    if (nivel === 0) { fin = clases.indexOf(">", m.index) + 1; break; }
  }
  const cartel = fin > 0 ? clases.slice(desde, fin) : "";
  if (!/data-instalar\b/.test(cartel) || !/data-instalar-no\b/.test(cartel)) {
    console.log("  ✗ el cartel de clases.html no trae sus dos botones"); fallos += 1; return;
  }

  const contexto = await navegador.newContext();
  const p = await contexto.newPage();
  await p.goto(BASE + "/offline.html", { waitUntil: "load" });

  const preparar = async () => {
    await p.evaluate((cartel) => {
      document.querySelectorAll("#instalar-app").forEach((n) => n.remove());
      document.body.insertAdjacentHTML("afterbegin", cartel);
      // Se pregunta por lo que SE VE, no por el atributo: el cartel lleva la
      // clase `flex` de Tailwind, que tiene la misma especificidad que
      // `[hidden]` y va después en la hoja. Durante meses el atributo estuvo
      // puesto y el cartel igual se veía — con `.hidden` a secas, esta
      // comprobación daba verde sobre una página rota.
      window.seVe = (n) => getComputedStyle(n).display !== "none";
    }, cartel);
    await p.addScriptTag({ url: "/js/pwa.js" });
  };

  // Lo que el navegador dispararía si decidiera que se puede instalar.
  const disparar = () => p.evaluate(() => {
    const e = new Event("beforeinstallprompt");
    e.prompt = () => {};
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(e);
    return seVe(document.getElementById("instalar-app"));
  });

  await p.evaluate(() => localStorage.clear());
  await preparar();
  igual("la primera vez, se muestra", await disparar(), "true");

  // Otra visita: la página se recarga y el evento vuelve a dispararse.
  await p.reload({ waitUntil: "load" });
  await preparar();
  igual("la segunda visita ya NO lo muestra: se da una sola vez", await disparar(), "false");

  // Ahora una persona que sí aprieta "Ahora no".
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await preparar();
  await disparar();
  await p.click("#instalar-app [data-instalar-no]");
  igual("al apretar «Ahora no» se cierra de verdad (se MIRA la pantalla, no `.hidden`)",
    await p.evaluate(() => !seVe(document.getElementById("instalar-app"))), "true");

  // Seis días después: todavía no.
  await p.evaluate(() => {
    const e = JSON.parse(localStorage.getItem("app_instalar_v2"));
    e.rechazado = Date.now() - 6 * 86400000;
    e.visto = e.rechazado - 1000;
    localStorage.setItem("app_instalar_v2", JSON.stringify(e));
  });
  await p.reload({ waitUntil: "load" });
  await preparar();
  igual("a los seis días todavía no lo molesta", await disparar(), "false");

  // A los ocho, sí.
  await p.evaluate(() => {
    const e = JSON.parse(localStorage.getItem("app_instalar_v2"));
    e.rechazado = Date.now() - 8 * 86400000;
    e.visto = e.rechazado - 1000;
    localStorage.setItem("app_instalar_v2", JSON.stringify(e));
  });
  await p.reload({ waitUntil: "load" });
  await preparar();
  igual("a los ocho días se lo vuelve a ofrecer, una vez", await disparar(), "true");

  // Y quien ya la instaló no lo ve nunca.
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.evaluate(() => { window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} }); });
  await preparar();
  igual("y a quien ya la instaló no se le ofrece", await disparar(), "false");

  await contexto.close();
}

(async () => {
  console.log("=== El manifest ===");
  const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
  ["name", "short_name", "start_url", "scope", "display", "theme_color", "background_color", "icons"]
    .forEach((c) => { if (!manifest[c]) mal("al manifest le falta " + c); });
  igual("se abre como app y no como pestaña", manifest.display, "standalone");
  igual("arranca en la Academia", manifest.start_url, "/clases.html");
  igual("el alcance es el sitio entero", manifest.scope, "/");
  // Android pide un icono de 192 y uno de 512; el "maskable" es el que evita
  // que al recortarlo en círculo le coma las orejas al caballo.
  const medidas = manifest.icons.map((i) => i.sizes);
  igual("trae los tamaños que pide Android", medidas.includes("192x192") && medidas.includes("512x512"), "true");
  igual("trae un icono maskable", manifest.icons.some((i) => (i.purpose || "").includes("maskable")), "true");

  console.log("\n=== Los iconos ===");
  manifest.icons.forEach((i) => {
    const archivo = path.join(RAIZ, i.src.replace(/^\//, ""));
    if (!fs.existsSync(archivo)) { mal("el icono no existe: " + i.src); return; }
    const real = tamanoPng(archivo);
    if (real !== i.sizes) mal(`${i.src} dice medir ${i.sizes} y mide ${real}`);
    else console.log(`  ✓ ${i.src} · ${real}`);
  });

  console.log("\n=== Todas las páginas lo declaran ===");
  const paginas = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = path.relative(RAIZ, p).replace(/\\/g, "/");
      if (e.isDirectory()) {
        if (/^(node_modules|\.git|herramientas)$/.test(e.name)) continue;
        if (rel.startsWith("cursos/recursos") || rel.startsWith("cursos/protegido")) continue;
        recorrer(p);
      } else if (e.name.endsWith(".html")) {
        /* Las que a propósito NO son parte de la app: inscripcion.html y
           formulario.html tienen su propio diseño, y el libro accesible es un
           documento que se descarga y se abre suelto —incluso por correo y sin
           red—, así que declarar un manifest que no va a poder cargar sería
           peor que no declararlo. */
        if (["inscripcion.html", "formulario.html", "libro-de-diagnostico-accesible.html"].includes(e.name)) continue;
        paginas.push(rel);
      }
    }
  })(RAIZ);
  const sinManifest = paginas.filter((r) => {
    const s = fs.readFileSync(path.join(RAIZ, r), "utf8");
    return !/rel="manifest"/.test(s) || !/name="theme-color"/.test(s);
  });
  igual("páginas que declaran el manifest", paginas.length - sinManifest.length, paginas.length);
  sinManifest.slice(0, 5).forEach((r) => mal("sin manifest: " + r));

  console.log("\n=== El service worker, en un navegador ===");
  const navegador = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const contexto = await navegador.newContext();
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(String(e)));
  await pagina.goto(BASE + "/", { waitUntil: "load" });
  await pagina.waitForFunction(
    () => navigator.serviceWorker && navigator.serviceWorker.controller !== null,
    { timeout: 20000 }).catch(() => mal("el service worker no llegó a tomar el control"));

  igual("queda registrado y mandando",
    await pagina.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)), "true");

  // --- lo que NO debe guardarse
  const prohibidas = [
    "/cursos/protegido/finales-practicos.html",
    "/cursos/recursos/finales-practicos/01-la-regla-del-cuadrado-y-el-peon-pasado-material.pdf",
  ];
  for (const ruta of prohibidas) {
    await pagina.evaluate(async (u) => { try { await fetch(u); } catch (e) {} }, ruta);
  }
  await pagina.waitForTimeout(600);
  const guardadas = await pagina.evaluate(async () => {
    const nombres = await caches.keys();
    const todo = [];
    for (const n of nombres) {
      const c = await caches.open(n);
      (await c.keys()).forEach((r) => todo.push(new URL(r.url).pathname));
    }
    return todo;
  });
  igual("no guarda el contenido de los cursos",
    guardadas.filter((u) => u.startsWith("/cursos/protegido/")).length, 0);
  igual("no guarda el material de uso docente",
    guardadas.filter((u) => u.startsWith("/cursos/recursos/")).length, 0);
  igual("no guarda nada de otro dominio",
    guardadas.filter((u) => /^https?:/.test(u)).length, 0);
  igual("sí guarda la página de sin conexión", guardadas.includes("/offline.html"), "true");

  // --- sin red, una página del sitio cae en offline.html
  console.log("\n=== Sin red ===");
  await contexto.setOffline(true);
  const respuesta = await pagina.goto(BASE + "/una-que-no-existe-y-no-esta-en-cache.html",
    { waitUntil: "load" }).catch(() => null);
  const texto = respuesta ? await pagina.evaluate(() => document.body.innerText) : "";
  igual("cae en la página de sin conexión", /sin internet/i.test(texto), "true");
  await contexto.setOffline(false);

  if (errores.length) mal("errores en la página: " + errores.join(" | "));
  await probarCartelDeInstalar(navegador);

  await navegador.close();

  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
