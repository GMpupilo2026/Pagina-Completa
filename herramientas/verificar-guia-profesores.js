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
const RAIZ = path.join(__dirname, "..");

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

  /* Portada, índice, un separador por capítulo, un apartado por lámina y una
     diapositiva más por cada apartado que enseña su pantalla. */
  const conCaptura = guia.CAPITULOS.flatMap((c) => c.laminas).filter((l) => l.captura).length;
  const esperadas = titulos.length + guia.CAPITULOS.length + 2 + conCaptura;
  comprobar(diapos.length === esperadas,
    `hay una diapositiva por apartado, por capítulo, por captura, la portada y el índice (${diapos.length})`,
    `esperaba ${esperadas}`);

  const desbordadas = diapos.filter((d) => d.desborde > 1);
  comprobar(desbordadas.length === 0,
    "ninguna diapositiva se sale de su página",
    desbordadas.slice(0, 5).map((d) => `#${d.i} «${d.titulo.trim()}» se pasa ${d.desborde}px (${d.clase})`).join("\n         "));

  /* ---------------------------------------------- las capturas de pantalla */
  console.log("\nLas capturas de pantalla");
  const declaradas = [];
  guia.CAPITULOS.forEach((c) => c.laminas.forEach((l) => { if (l.captura) declaradas.push(l); }));

  const sinArchivo = declaradas
    .map((l) => l.captura)
    .filter((slug) => !fs.existsSync(path.join(RAIZ, "img/guia", slug + ".jpg")));
  comprobar(sinArchivo.length === 0,
    `los ${declaradas.length} apartados que enseñan su pantalla tienen su archivo`,
    "falta img/guia/" + sinArchivo.join(".jpg, img/guia/") + ".jpg — corre node herramientas/guia-capturas.js");

  /* Y al revés: una captura que ya no usa ningún apartado es peso muerto en el
     repositorio y nadie la vuelve a mirar, así que tampoco se entera de que se
     quedó vieja. */
  const enDisco = fs.existsSync(path.join(RAIZ, "img/guia"))
    ? fs.readdirSync(path.join(RAIZ, "img/guia")).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4))
    : [];
  const usadas = new Set(declaradas.map((l) => l.captura));
  const sobran = enDisco.filter((slug) => !usadas.has(slug));
  comprobar(sobran.length === 0, "no sobra ninguna captura en img/guia/", sobran.join(", "));

  /* Una captura declarada que no se pinta no da ningún error: la diapositiva
     simplemente no está y el apartado se queda contando una pantalla que nadie
     ve. Se cuentan las que de verdad quedaron en el documento. */
  const pantallas = await pPres.evaluate(() =>
    [...document.querySelectorAll(".diapo.pantalla")].map((d) => ({
      titulo: (d.querySelector("h2") || {}).textContent || "",
      alt: (d.querySelector("img") || {}).alt || "",
      src: ((d.querySelector("img") || {}).getAttribute ? d.querySelector("img").getAttribute("src") : "") || "",
    })));
  comprobar(pantallas.length === declaradas.length - sinArchivo.length,
    `hay una diapositiva de pantalla por cada captura (${pantallas.length})`,
    `esperaba ${declaradas.length - sinArchivo.length}`);

  comprobar(pantallas.every((p) => p.alt && p.alt.length > 10),
    "cada captura lleva su texto alternativo",
    pantallas.filter((p) => !p.alt || p.alt.length <= 10).map((p) => p.titulo).join(" · "));

  comprobar(pantallas.every((p) => p.src.startsWith("data:image/jpeg")),
    "las capturas van incrustadas y no enlazadas (la maqueta se imprime desde /tmp)");

  /* Que la imagen quepa en su diapositiva se MIDE, no se deduce del CSS: una
     captura que se sale por abajo se imprime cortada y se ve perfecta en el
     código. */
  const capturasQueSeSalen = await pPres.evaluate(() =>
    [...document.querySelectorAll(".diapo.pantalla")].filter((d) => {
      const img = d.querySelector("img");
      if (!img) return false;
      const caja = d.getBoundingClientRect(), foto = img.getBoundingClientRect();
      return foto.bottom > caja.bottom + 1 || foto.right > caja.right + 1 || foto.height < 50;
    }).map((d) => (d.querySelector("h2") || {}).textContent));
  comprobar(capturasQueSeSalen.length === 0,
    "ninguna captura se sale de su diapositiva ni queda aplastada",
    capturasQueSeSalen.join(" · "));

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

  const figuras = await pMan.evaluate(() => document.querySelectorAll("figure.pantalla img").length);
  const cuantasCapturas = guia.CAPITULOS.flatMap((c) => c.laminas).filter((l) => l.captura).length;
  comprobar(figuras === cuantasCapturas,
    `el manual enseña las mismas ${cuantasCapturas} pantallas que la presentación`,
    `enseña ${figuras}`);

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
