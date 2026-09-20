/* ===== Comprueba la guía del profesor: las maquetas, en un navegador =====
 *
 * Lo que se rompe acá no da ningún error: el archivo se genera igual y se
 * descarga igual.
 *
 *  - Una diapositiva con demasiado texto NO avisa: se imprime cortada, y de eso
 *    se entera quien está proyectando, delante de todo el equipo. Por eso se
 *    mide el desborde de CADA diapositiva en un navegador de verdad, no se
 *    confía en el cálculo de densidad del generador — que es justamente lo que
 *    hay que comprobar.
 *  - Un apartado que se quede fuera de una de las tres salidas tampoco avisa:
 *    la presentación diría una cosa y el manual otra. Se cuentan los títulos
 *    del contenido en las tres.
 *  - La versión accesible con una imagen, o con un nivel de encabezado saltado,
 *    se ve perfecta y es justo lo que la deja inservible para quien la lee con
 *    lector de pantalla.
 *
 * Se corre:  node herramientas/verificar-guia-profesores.js
 * Necesita playwright. No necesita el sitio servido ni pypdf: mide las maquetas
 * que arma el generador, no los PDF ya escritos (de eso se encarga
 * verificar-guia-profesores.py).
 *
 * Con CHROMIUM=/ruta/al/chrome se le indica un Chromium ya instalado.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const guia = require("./guia-profesores.js");

let fallos = 0;
function comprobar(bien, que, detalle) {
  if (bien) { console.log("  ok   " + que); return; }
  fallos++;
  console.log("  FALLA " + que + (detalle ? "\n         " + detalle : ""));
}

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verificar-guia-"));
  const archivos = {
    presentacion: path.join(tmp, "presentacion.html"),
    manual: path.join(tmp, "manual.html"),
    accesible: path.join(tmp, "accesible.html"),
  };
  fs.writeFileSync(archivos.presentacion, guia.presentacionHTML());
  fs.writeFileSync(archivos.manual, guia.manualHTML());
  fs.writeFileSync(archivos.accesible, guia.accesibleHTML());

  const titulos = [];
  guia.CAPITULOS.forEach((c) => c.laminas.forEach((l) => titulos.push(l.titulo)));

  /* ---------------------------------------------- la presentación, medida */
  console.log("\nLa presentación (diapositivas 16:9)");
  const pPres = await navegador.newPage({ viewport: { width: 1280, height: 720 } });
  await pPres.goto("file://" + archivos.presentacion, { waitUntil: "load" });

  const diapos = await pPres.evaluate(() =>
    [...document.querySelectorAll(".diapo")].map((d, i) => ({
      i,
      titulo: (d.querySelector("h1, h2") || {}).textContent || "",
      desborde: d.scrollHeight - d.clientHeight,
      clase: d.className,
    })));

  comprobar(diapos.length === titulos.length + guia.CAPITULOS.length + 2,
    `hay una diapositiva por apartado, por capítulo, la portada y el índice (${diapos.length})`,
    `esperaba ${titulos.length + guia.CAPITULOS.length + 2}`);

  const desbordadas = diapos.filter((d) => d.desborde > 1);
  comprobar(desbordadas.length === 0,
    "ninguna diapositiva se sale de su página",
    desbordadas.slice(0, 5).map((d) => `#${d.i} «${d.titulo.trim()}» se pasa ${d.desborde}px (${d.clase})`).join("\n         "));

  /* El fondo de la portada tiene que pintarse de verdad: si se imprimiera sin
     `printBackground`, o si la clase no existiera, la portada saldría en
     blanco con letras blancas encima — invisible, y sin ningún error. */
  const fondoPortada = await pPres.evaluate(() =>
    getComputedStyle(document.querySelector(".portada")).backgroundColor);
  comprobar(fondoPortada !== "rgba(0, 0, 0, 0)" && fondoPortada !== "rgb(255, 255, 255)",
    "la portada tiene fondo propio (no queda letra blanca sobre blanco)", fondoPortada);

  const textoPres = await pPres.evaluate(() => document.body.innerText);
  const faltanPres = titulos.filter((t) => !textoPres.includes(t));
  comprobar(faltanPres.length === 0,
    `los ${titulos.length} apartados están en la presentación`,
    faltanPres.slice(0, 4).join(" · "));

  /* ------------------------------------------------------------ el manual */
  console.log("\nEl manual (A4)");
  const pMan = await navegador.newPage({ viewport: { width: 900, height: 1200 } });
  await pMan.goto("file://" + archivos.manual, { waitUntil: "load" });
  const textoMan = await pMan.evaluate(() => document.body.innerText);
  const faltanMan = titulos.filter((t) => !textoMan.includes(t));
  comprobar(faltanMan.length === 0,
    `los ${titulos.length} apartados están en el manual`,
    faltanMan.slice(0, 4).join(" · "));

  const indiceMan = await pMan.evaluate(() =>
    [...document.querySelectorAll("table.indice td:nth-child(2) strong")].map((e) => e.textContent));
  comprobar(indiceMan.length === guia.CAPITULOS.length,
    `el índice del manual nombra los ${guia.CAPITULOS.length} capítulos`,
    `nombra ${indiceMan.length}`);

  /* ------------------------------------------------- la versión accesible */
  console.log("\nLa versión accesible");
  const pAcc = await navegador.newPage();
  await pAcc.goto("file://" + archivos.accesible, { waitUntil: "load" });

  const imagenes = await pAcc.evaluate(() => document.querySelectorAll("img, svg, picture").length);
  comprobar(imagenes === 0, "no depende de ninguna imagen", `encontré ${imagenes}`);

  const idioma = await pAcc.evaluate(() => document.documentElement.lang);
  comprobar(idioma === "es", "declara el idioma", idioma || "(vacío)");

  const encabezados = await pAcc.evaluate(() =>
    [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .map((e) => ({ n: +e.tagName[1], t: e.textContent.trim() })));
  comprobar(encabezados.filter((e) => e.n === 1).length === 1,
    "tiene un solo h1", `tiene ${encabezados.filter((e) => e.n === 1).length}`);

  let salto = null;
  for (let i = 1; i < encabezados.length; i++) {
    if (encabezados[i].n > encabezados[i - 1].n + 1) { salto = encabezados[i]; break; }
  }
  comprobar(!salto, "no salta ningún nivel de encabezado",
    salto ? `h${salto.n} «${salto.t}» después de un nivel más alto` : "");

  const textoAcc = await pAcc.evaluate(() => document.body.innerText);
  const faltanAcc = titulos.filter((t) => !textoAcc.includes(t));
  comprobar(faltanAcc.length === 0,
    `los ${titulos.length} apartados están en la versión accesible`,
    faltanAcc.slice(0, 4).join(" · "));

  /* El índice enlaza a cada capítulo: un ancla que no existe manda al principio
     de la página y no avisa. */
  const anclasRotas = await pAcc.evaluate(() =>
    [...document.querySelectorAll("nav a[href^='#']")]
      .filter((a) => !document.getElementById(a.getAttribute("href").slice(1)))
      .map((a) => a.getAttribute("href")));
  comprobar(anclasRotas.length === 0, "cada enlace del índice llega a su capítulo",
    anclasRotas.join(" "));

  comprobar(/noindex/.test(await pAcc.evaluate(() =>
    (document.querySelector('meta[name="robots"]') || {}).content || "")),
    "lleva noindex (es un documento suelto, no una página del sitio)");

  /* ------------------------------------- el contenido, mirado por su forma */
  console.log("\nEl contenido");
  const sinPasos = [];
  const largos = [];
  guia.CAPITULOS.forEach((c) => c.laminas.forEach((l) => {
    if (!(l.pasos || []).length && !(l.ojo || []).length) sinPasos.push(l.titulo);
    if (l.titulo.length > 60) largos.push(l.titulo);
  }));
  comprobar(sinPasos.length === 0, "ningún apartado se queda sin nada que decir",
    sinPasos.join(" · "));
  comprobar(largos.length === 0, "ningún título se pasa de largo para la cinta",
    largos.join(" · "));

  const capsSinResumen = guia.CAPITULOS.filter((c) => !c.resumen || !c.titulo);
  comprobar(capsSinResumen.length === 0, "cada capítulo tiene título y resumen",
    capsSinResumen.map((c) => c.id).join(" "));

  await navegador.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(fallos === 0
    ? `\nTodo bien. ${guia.CAPITULOS.length} capítulos y ${guia.TOTAL_LAMINAS} apartados en las tres salidas.`
    : `\n${fallos} ${fallos === 1 ? "problema" : "problemas"}.`);
  process.exit(fallos === 0 ? 0 : 1);
})();
