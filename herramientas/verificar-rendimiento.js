#!/usr/bin/env node
/**
 * Comprueba las dos cosas que hacen que el sitio se sienta rápido, en un
 * navegador de verdad:
 *
 *   1. Las fuentes salen del propio sitio y NO de Google, con su respaldo
 *      ajustado para que el texto no salte al llegar la buena.
 *   2. Cada página declara la navegación anticipada, y es `prefetch` —nunca
 *      `prerender`—, que ejecutaría el JavaScript de páginas que nadie abrió
 *      e inflaría los minutos de actividad del alumno.
 *
 * Existe porque NADA de esto da error si se rompe:
 *
 *   - una etiqueta de Google Fonts que se cuele al clonar la cabecera de otra
 *     página funciona igual: vuelven las dos conexiones a terceros y el salto
 *     del texto, y la página se ve bien;
 *   - `css/fuentes.css` con la ruta relativa equivocada en una subcarpeta es
 *     un 404 que deja esa página SIN los respaldos, o sea peor que antes, y
 *     se ve igual de bien;
 *   - un `preload` que apunte a un archivo que se renombró no rompe nada: la
 *     fuente llega igual, un viaje más tarde;
 *   - y si alguien cambia `prefetch` por `prerender` para ganar velocidad, lo
 *     que se rompe son los informes que llegan a la casa, en silencio.
 *
 *   Con el sitio en localhost:8777:
 *     node herramientas/verificar-rendimiento.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE || "http://localhost:8777";

// Una de cada profundidad: la ruta relativa de la hoja se calcula con eso.
const PAGINAS = [
  "/index.html",
  "/cursos.html",
  "/clases.html",
  "/cursos/fundamentos-del-ajedrez.html",
  "/cursos/academia/fundamentos-del-ajedrez.html",
];

// Las 16 que registran tiempo de actividad: son la razón de que sea prefetch.
const CON_REGISTRO = "js/tiempo-plataforma.js";

let fallos = 0;
const mal = (m) => { console.log(`  ✗ ${m}`); fallos++; };
const bien = (m) => console.log(`  ✓ ${m}`);

(async () => {
  // ---- 1. En los archivos: que no se haya colado Google Fonts ----
  console.log("\nGoogle Fonts en el código");
  const htmls = [];
  (function barrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) barrer(p);
      else if (e.name.endsWith(".html")) htmls.push(p);
    }
  })(RAIZ);

  const colados = htmls.filter((f) =>
    /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(f, "utf8"))
  );
  if (colados.length) {
    colados.forEach((f) => mal(`${path.relative(RAIZ, f)} todavía le pide la fuente a Google`));
  } else bien(`ninguna de las ${htmls.length} páginas le pide la fuente a Google`);

  // Solo la directiva, no los comentarios: el archivo EXPLICA por qué Google
  // ya no está, y esa explicación nombra los dominios.
  const headers = fs.readFileSync(path.join(RAIZ, "_headers"), "utf8");
  const csp = headers
    .split("\n")
    .filter((l) => l.trim().startsWith("Content-Security-Policy:"))
    .join("\n");
  if (!csp) mal("_headers no tiene Content-Security-Policy");
  if (/fonts\.(googleapis|gstatic)\.com/.test(csp))
    mal("_headers todavía permite Google Fonts en el CSP: una etiqueta que se cuele funcionaría");
  else bien("el CSP ya no permite Google Fonts, así que una que se cuele se bloquea y se ve");

  if (!/^\/fonts\/\*/m.test(headers)) mal("_headers no le pone caché a /fonts/");
  else bien("/fonts/ tiene caché larga en _headers");

  // ---- 2. Que el prefetch no se haya vuelto prerender ----
  console.log("\nNavegación anticipada");
  const conPrerender = htmls.filter((f) => {
    const t = fs.readFileSync(f, "utf8");
    const m = t.match(/<script type="speculationrules">(.*?)<\/script>/s);
    return m && m[1].includes('"prerender"');
  });
  if (conPrerender.length) {
    conPrerender.forEach((f) =>
      mal(
        `${path.relative(RAIZ, f)} usa PRERENDER. Ejecuta el JavaScript de la página ` +
          `destino, así que ${CON_REGISTRO} le apuntaría al alumno minutos de páginas ` +
          `que nunca abrió — y eso llega a los informes de la casa. Tiene que ser prefetch.`
      )
    );
  } else bien("todas usan prefetch, ninguna prerender");

  // ---- 3. En el navegador ----
  const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--no-sandbox"],
  });

  for (const ruta of PAGINAS) {
    console.log(`\n${ruta}`);
    // Sin service worker: al recargar es él quien sirve, y lo que pide no pasa
    // por las rutas del contexto (misma piedra que documentó verificar-reportes.js).
    const ctx = await navegador.newContext({ serviceWorkers: "block" });
    const pagina = await ctx.newPage();
    const rotos = [];
    pagina.on("response", (r) => { if (r.status() >= 400) rotos.push(`${r.status()} ${r.url().replace(BASE, "")}`); });

    await pagina.goto(BASE + ruta, { waitUntil: "load" });
    await pagina.waitForTimeout(500);

    const r = await pagina.evaluate(async () => {
      await document.fonts.ready;
      const titulo = document.querySelector("h1, h2");
      return {
        cuerpo: getComputedStyle(document.body).fontFamily,
        titulo: titulo ? getComputedStyle(titulo).fontFamily : "",
        cargadas: [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family))],
        preloads: [...document.querySelectorAll("link[rel=preload][as=font]")].map((l) => l.getAttribute("href")),
        hojaFuentes: [...document.styleSheets].some((h) => (h.href || "").includes("fuentes.css")),
        reglas: document.querySelector('script[type="speculationrules"]')?.textContent || "",
      };
    });

    if (rotos.length) rotos.forEach((x) => mal(`pide algo que no está: ${x}`));
    else bien("ningún archivo falta");

    // La hoja tiene que haber CARGADO, no solo estar declarada: una ruta
    // relativa mal calculada en subcarpeta es un 404 y la página se ve igual.
    if (!r.hojaFuentes) mal("css/fuentes.css no cargó (¿ruta relativa mal en esta profundidad?)");
    else bien("css/fuentes.css cargó");

    // El respaldo ajustado tiene que estar en la pila, no solo definido.
    if (!/Inter respaldo/.test(r.cuerpo))
      mal(`el cuerpo no lleva el respaldo ajustado en su pila: ${r.cuerpo}`);
    else bien("el cuerpo usa Inter con su respaldo ajustado");

    if (r.titulo && /serif/.test(r.titulo) && !/Merriweather respaldo/.test(r.titulo))
      mal(`el título serif no lleva su respaldo: ${r.titulo}`);

    if (!r.cargadas.length) mal("no cargó ninguna fuente");
    else bien(`fuentes cargadas: ${r.cargadas.join(", ")}`);

    // Las fuentes NO se precargan, y es a propósito: medido en la portada con
    // 4G lenta, precargar las dos deja el LCP en 1488 ms y no precargar
    // ninguna en 1060 ms. Acá lo más grande de la pantalla es texto y lo que
    // demora en pintarlo es tailwind.css; un preload de 95 KB con prioridad
    // alta le saca banda justo a eso. Lo que evitaba el salto no era el
    // preload sino el respaldo ajustado, que ya está.
    //
    // Se comprueba porque «precargá tus fuentes» es el consejo de manual, así
    // que es exactamente lo que alguien va a agregar para optimizar — y el
    // sitio se pondría más lento sin que nada avise.
    if (r.preloads.length)
      mal(
        `precarga ${r.preloads.length} fuente(s). Medido: precargarlas atrasa el ` +
          `LCP de 1060 ms a 1488 ms, porque le quitan ancho de banda a tailwind.css, ` +
          `que es lo que bloquea el pintado. El salto del texto ya lo evita el ` +
          `respaldo ajustado. Si se quiere volver a poner, hay que volver a medir.`
      );
    else bien("no precarga fuentes (medido: precargarlas atrasa el pintado)");

    // Los .woff2 que pide la hoja sí tienen que existir.
    const hoja = fs.readFileSync(path.join(RAIZ, "css", "fuentes.css"), "utf8");
    for (const m of hoja.matchAll(/url\('(\/fonts\/[^']+)'\)/g)) {
      if (!fs.existsSync(path.join(RAIZ, m[1].replace(/^\//, ""))))
        mal(`css/fuentes.css pide un archivo que no está: ${m[1]}`);
    }

    if (!r.reglas) mal("no declara navegación anticipada");
    else if (r.reglas.includes('"prerender"')) mal("declara PRERENDER (ver arriba por qué no)");
    else bien("declara prefetch");

    await ctx.close();
  }

  // ---- 4. Que la anticipación SE DISPARE, no solo que esté escrita ----
  //
  // Esta es la comprobación que importa, y existe porque ya falló: la primera
  // versión de la regla excluía el sitio entero por un patrón mal escrito
  // (`/*\\?*`, que en URLPattern coincide con TODO). La regla estaba ahí,
  // bien formada y con JSON válido; el navegador la aceptaba y no la aplicaba
  // nunca. Mirar que el <script> exista habría dado verde sobre un sitio que
  // no anticipa nada.
  console.log("\n¿Se adelanta la descarga de verdad?");
  {
    const ctx = await navegador.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
    const pagina = await ctx.newPage();
    const adelantados = [];
    pagina.on("request", (r) => {
      if ((r.headers()["sec-purpose"] || "").includes("prefetch"))
        adelantados.push(r.url().replace(BASE, ""));
    });
    await pagina.goto(BASE + "/index.html", { waitUntil: "load" });
    await pagina.waitForTimeout(400);

    const interno = pagina.locator('a[href="cursos.html"]').first();
    const antes = adelantados.length;
    await interno.hover();
    await pagina.waitForTimeout(1500);
    if (adelantados.length > antes)
      bien(`al pasar el mouse por un enlace interno se adelanta: ${adelantados.slice(antes).join(", ")}`);
    else
      mal(
        "pasar el mouse por un enlace interno NO adelanta nada. La regla existe " +
          "pero el navegador no la aplica — casi siempre es un patrón de " +
          "href_matches mal escrito (ojo con el `?`, que en URLPattern separa " +
          "los parámetros y hace que el patrón coincida con todo)."
      );

    // Y lo de afuera no se toca: traerse WhatsApp de antemano no tiene sentido.
    const externo = pagina.locator('a[href^="https://wa.me"]').first();
    if ((await externo.count()) > 0) {
      const antes2 = adelantados.length;
      await externo.hover();
      await pagina.waitForTimeout(1200);
      if (adelantados.length > antes2) mal("se está adelantando un enlace que sale del sitio");
      else bien("los enlaces que salen del sitio no se adelantan");
    }
    await ctx.close();
  }

  await navegador.close();
  console.log(fallos ? `\n${fallos} fallo(s)\n` : "\nTodo bien\n");
  process.exit(fallos ? 1 : 0);
})();
