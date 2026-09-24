#!/usr/bin/env node
/* ===========================================================================
   Los temas de TODA la plataforma
   ===========================================================================

   Lo que se rompe acá se rompe callado, y son cuatro cosas distintas:

   1. UNA VARIABLE QUE FALTA. Desde que la paleta son variables CSS,
      `bg-brand-800` vale `rgb(var(--c-brand-800))`. Si un tema se olvida de
      definir ese tono, el navegador se queda con una declaración inválida y
      pinta el color heredado: una barra transparente, texto del color del
      fondo. No hay ningún error en consola.

   2. UN CONTRASTE PERDIDO. Un rosa elegido a ojo deja el texto secundario en
      3,2 sobre el fondo de la tarjeta. La página se ve preciosa y hay quien ya
      no la puede leer. Por eso las paletas de js/temas-plataforma.js tienen
      cada tono con la MISMA luminancia WCAG que el tono equivalente del tema
      Clásico, y acá se comprueban los 49 pares de color que el sitio usa de
      verdad, en los siete temas: ninguno puede quedar por debajo de AA, y
      ninguno puede quedar peor que el Clásico en los pares donde el propio
      Clásico no llega (`text-accent-600` sobre blanco está en 3,63 desde
      siempre, y esto no es el lugar donde se arregla eso).

   3. EL CSS SIN RECOMPILAR. La tabla de temas es JavaScript, pero lo que el
      navegador lee es css/tailwind.css. Cambiar una paleta y no correr
      `node herramientas/css-construir.js` deja la vista previa de
      Configuración enseñando un rosa y la plataforma pintando otro — es la
      misma clase de falla que ya tuvo el sitio con una clase de Tailwind sin
      compilar, que no pinta nada y no avisa.

   4. EL PARPADEO. El script que pone `data-tema` va EN LÍNEA y en el <head> de
      las 95 páginas (ver herramientas/tema-cabecera.py). Si a una le falta,
      esa página se ve del color de siempre; si se cargara tarde, se pintaría
      primero azul y después rosada en cada visita.

   Se corre con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-temas-plataforma.js
   =========================================================================== */

const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { clienteFalso, PROFE, ALUMNOS } = require("./guia-capturas.js");
const { cssDeTemas } = require("./css-construir.js");
const { TEMAS } = require("../js/temas-plataforma.js");
const CASILLAS = require("../js/board-color-themes.js");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(que, real, esperado) {
  const ok = String(real) === String(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${que}${ok ? ": " + real : `\n      esperaba ${esperado}, llegó ${real}`}`);
}
function cierto(que, condicion, detalle) {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? "✓" : "✗"} ${que}${condicion ? "" : "\n      " + (detalle || "")}`);
}

/* ---------- contraste ---------- */
const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
function luminancia(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contraste(a, b) {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* Los pares que el sitio usa DE VERDAD. Salieron de contar las clases escritas
   en las páginas (`text-brand-600` aparece 2.489 veces, `dark:text-brand-300`
   3.248) cruzadas con los fondos que llevan encima: blanco y brand-50/100/200
   en modo claro, brand-800/900/950 en oscuro, y el ámbar de los botones. */
const PARES = [
  ["brand.600", "#ffffff"], ["brand.600", "brand.50"], ["brand.600", "brand.100"],
  ["brand.700", "#ffffff"], ["brand.700", "brand.50"], ["brand.700", "brand.100"], ["brand.700", "brand.200"],
  ["brand.800", "#ffffff"], ["brand.800", "brand.50"], ["brand.800", "brand.100"], ["brand.800", "brand.200"],
  ["brand.500", "#ffffff"], ["brand.500", "brand.50"], ["brand.500", "brand.100"],
  ["brand.450", "#ffffff"], ["brand.450", "brand.50"], ["brand.450", "brand.100"],
  ["brand.400", "#ffffff"], ["brand.400", "brand.50"],
  ["brand.900", "accent.500"], ["brand.900", "accent.400"], ["brand.900", "accent.300"],
  ["accent.700", "#ffffff"], ["accent.700", "brand.50"], ["accent.700", "accent.50"],
  ["accent.600", "#ffffff"], ["accent.600", "brand.50"], ["accent.500", "#ffffff"],
  ["#ffffff", "brand.600"], ["#ffffff", "brand.700"], ["#ffffff", "brand.800"], ["#ffffff", "brand.900"],
  ["brand.300", "brand.900"], ["brand.300", "brand.800"], ["brand.300", "brand.950"], ["brand.300", "brand.700"],
  ["brand.350", "brand.900"], ["brand.350", "brand.950"], ["brand.350", "brand.800"],
  ["brand.100", "brand.900"], ["brand.100", "brand.800"], ["brand.100", "brand.700"],
  ["brand.200", "brand.900"], ["brand.200", "brand.800"],
  ["accent.400", "brand.900"], ["accent.400", "brand.800"], ["accent.400", "brand.950"], ["accent.400", "brand.700"],
  ["brand.500", "brand.100"],
];
const tono = (tema, clave) =>
  clave.startsWith("#") ? clave : tema[clave.split(".")[0]][clave.split(".")[1]];

function pruebaContraste() {
  console.log("\n=== Ningún tema pierde contraste contra el Clásico ===");
  const base = PARES.map(([a, b]) => contraste(tono(TEMAS.clasico, a), tono(TEMAS.clasico, b)));
  for (const [id, tema] of Object.entries(TEMAS)) {
    const malos = [];
    PARES.forEach(([a, b], i) => {
      const v = contraste(tono(tema, a), tono(tema, b));
      // AA, o al menos no peor que el Clásico en los pares donde el Clásico
      // tampoco llega. El margen de 0,05 es por el redondeo del hex.
      if (v < 4.5 && v < base[i] - 0.05) {
        malos.push(`${a} sobre ${b}: ${v.toFixed(2)} (Clásico ${base[i].toFixed(2)})`);
      }
    });
    igual(`${id}: los ${PARES.length} pares del sitio`, malos.length ? malos.join(" · ") : "0 peores", "0 peores");
  }
}

/* ---------- la tabla está completa ---------- */
function pruebaTabla() {
  console.log("\n=== Cada tema define todos los tonos y unas casillas que existen ===");
  const esperados = {
    brand: Object.keys(TEMAS.clasico.brand),
    accent: Object.keys(TEMAS.clasico.accent),
  };
  for (const [id, tema] of Object.entries(TEMAS)) {
    const faltan = [];
    for (const familia of ["brand", "accent"]) {
      for (const t of esperados[familia]) {
        if (!/^#[0-9a-f]{6}$/.test(String((tema[familia] || {})[t]))) faltan.push(`${familia}-${t}`);
      }
      for (const t of Object.keys(tema[familia] || {})) {
        if (!esperados[familia].includes(t)) faltan.push(`${familia}-${t} (sobra)`);
      }
    }
    igual(`${id}: tonos`, faltan.length ? faltan.join(", ") : "completos", "completos");
    cierto(`${id}: el color de casillas que propone existe`,
           !!CASILLAS.THEMES[tema.casillas],
           `"${tema.casillas}" no está en board-color-themes.js`);
    cierto(`${id}: el de Modo Adaptado también`,
           !tema.casillasAdaptado || !!CASILLAS.ADAPTIVE_THEMES[tema.casillasAdaptado],
           `"${tema.casillasAdaptado}" no está en ADAPTIVE_THEMES`);
  }
}

/* ---------- el CSS del repositorio dice lo mismo que la tabla ---------- */
function pruebaCompilado() {
  console.log("\n=== css/tailwind.css está al día con la tabla ===");
  const css = fs.readFileSync(path.join(RAIZ, "css/tailwind.css"), "utf8");
  // El bloque se arma con la MISMA función que lo escribió: comprobar una copia
  // no comprobaría nada.
  cierto("el bloque de variables de los temas está compilado",
         css.includes(cssDeTemas().trim()),
         "hay que correr: node herramientas/css-construir.js");
  // Y que se compiló con la paleta de variables, no con la de hex: si alguien
  // vuelve a poner los hex en el tema de Tailwind, los temas dejan de existir
  // y ninguna página se queja.
  const utilidad = (css.match(/\.bg-brand-800\{[^}]*\}/) || [""])[0];
  cierto("las utilidades leen la variable y no un hex",
         /var\(--c-brand-800\)/.test(utilidad), utilidad);
  cierto("y la opacidad de Tailwind sigue funcionando (bg-…/10)",
         /\.bg-accent-500\\\/10\{[^}]*var\(--c-accent-500\)\s*\/\s*\.1\)/.test(css),
         (css.match(/\.bg-accent-500\\\/10\{[^}]*\}/) || ["no está"])[0]);

  // Todo tono que una clase del sitio nombre tiene que existir en la paleta.
  // Un `bg-accent-900` que no está en la tabla no pinta nada: así vivieron dos
  // clases durante meses.
  const usados = new Set();
  (function anda(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { anda(p); continue; }
      if (!/\.(html|js)$/.test(e.name)) continue;
      if (fs.statSync(p).size > 300_000) continue;
      const txt = fs.readFileSync(p, "utf8");
      for (const m of txt.matchAll(/\b(?:bg|text|border|ring|from|via|to|divide|placeholder|decoration|outline|shadow|fill|stroke|accent)-(brand|accent)-(\d{2,3})\b/g)) {
        usados.add(m[1] + "-" + m[2]);
      }
    }
  })(RAIZ);
  const huerfanos = [...usados].filter((u) => {
    const [familia, t] = u.split("-");
    return !(TEMAS.clasico[familia] || {})[t];
  });
  igual("ninguna clase nombra un tono que la paleta no tiene",
        huerfanos.length ? huerfanos.sort().join(", ") : "ninguna", "ninguna");
}

/* ---------- el script del <head> ---------- */
function pruebaCabecera() {
  console.log("\n=== El script que aplica el tema está en el <head> de todas ===");
  const pwa = fs.readFileSync(path.join(__dirname, "pwa-cabecera.py"), "utf8");
  const fuera = [...pwa.matchAll(/"([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
  const paginas = [];
  (function anda(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      const rel = path.relative(RAIZ, p).replace(/\\/g, "/");
      if (e.isDirectory()) {
        if (/^(herramientas|cursos\/recursos|cursos\/protegido)$/.test(rel)) continue;
        anda(p);
        continue;
      }
      if (e.name.endsWith(".html")) paginas.push(rel);
    }
  })(RAIZ);

  const sinScript = [], conScript = [];
  for (const rel of paginas) {
    const txt = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    (txt.includes("<!-- tema: inicio -->") ? conScript : sinScript).push(rel);
  }
  const deberian = paginas.filter((r) => !fuera.includes(path.basename(r)));
  igual("páginas con el script", conScript.length, deberian.length);
  igual("a ninguna de la lista le falta",
        deberian.filter((r) => sinScript.includes(r)).join(", ") || "ninguna", "ninguna");
  igual("y no se le puso a las que quedan fuera (inscripción, los documentos sueltos)",
        conScript.filter((r) => fuera.includes(path.basename(r))).join(", ") || "ninguna", "ninguna");

  // Va EN LÍNEA: un archivo más en el <head> de las 95 bloquea el primer
  // pintado de todas para cuatro líneas.
  const una = fs.readFileSync(path.join(RAIZ, "clases.html"), "utf8");
  const bloque = una.slice(una.indexOf("<!-- tema: inicio -->"), una.indexOf("<!-- tema: fin -->"));
  cierto("es un script en línea, sin src", !/src=/.test(bloque), bloque.slice(0, 120));
  cierto("y está dentro del <head>",
         una.indexOf("<!-- tema: inicio -->") < una.indexOf("</head>"), "quedó fuera del head");

  // La fuente decorativa se baja solo con el tema puesto. Declarada en el
  // <head> se bajaría siempre, también a quien no eligió ningún tema.
  const fuentes = new Set(Object.values(TEMAS).map((t) => t.fuente).filter(Boolean));
  const fijas = paginas.filter((rel) => {
    const txt = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    return [...fuentes].some((f) => new RegExp(`<link[^>]*family=${f}`).test(txt));
  });
  igual("ninguna página pide la fuente decorativa de fijo",
        fijas.join(", ") || "ninguna", "ninguna");
}

/* ---------- en el navegador ---------- */
const PERFILES = [PROFE].concat(ALUMNOS);

async function abrir(navegador, url, sembrar) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block",
                                          reducedMotion: (sembrar || {}).quieto ? "reduce" : "no-preference" });
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript",
                body: clienteFalso({ perfiles: PERFILES, yo: PROFE }) }));
  if (sembrar) {
    await ctx.addInitScript(`try{
      localStorage.setItem("plataforma_tema_v1", ${JSON.stringify(sembrar.tema || "")});
      ${sembrar.fuente ? `localStorage.setItem("plataforma_tema_fuente_v1", ${JSON.stringify(sembrar.fuente)});` : ""}
      ${sembrar.casillas ? `localStorage.setItem("board_color_theme_v1", ${JSON.stringify(sembrar.casillas)});` : ""}
      ${sembrar.oscuro ? `localStorage.setItem("theme","dark");` : ""}
    }catch(e){}`);
  }
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, ctx };
}

/* Lo que ve quien entra, medido en el navegador: el color con el que el
   navegador pintó de verdad cada cosa, no la clase que lleva puesta. */
async function mirarColores(page) {
  return page.evaluate(() => {
    const cs = (sel, prop) => {
      const n = document.querySelector(sel);
      return n ? getComputedStyle(n)[prop] : null;
    };
    const raiz = getComputedStyle(document.documentElement);
    return {
      tema: document.documentElement.getAttribute("data-tema"),
      header: cs("#header", "backgroundColor"),
      bodyFondo: cs("body", "backgroundColor"),
      bodyImagen: cs("body", "backgroundImage"),
      sqLight: raiz.getPropertyValue("--sq-light").trim(),
      sqDark: raiz.getPropertyValue("--sq-dark").trim(),
      radio2xl: cs(".rounded-2xl", "borderRadius"),
      tituloFuente: cs("h1.font-serif, .font-serif", "fontFamily"),
      barra: (document.querySelector('meta[name="theme-color"]') || {}).content,
      guardado: (() => { try { return localStorage.getItem("plataforma_tema_v1"); } catch (e) { return "?"; } })(),
    };
  });
}

const aRgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
/* Un color se compara por sus tres números y no por cómo está escrito: el
   navegador devuelve `rgb(71, 23, 44)`, el <meta> puede llevar el hex o la
   forma moderna sin comas, y las tres son el mismo rosa. */
const nums = (c) => String(c || "").match(/\d+/g);
const mismoColor = (a, b) => JSON.stringify(nums(a)) === JSON.stringify(nums(b));

async function pruebaConfiguracion(navegador) {
  console.log("\n=== Configuración: elegir un tema pinta el sitio ===");
  const { page, ctx } = await abrir(navegador, "/configuracion.html");
  await page.waitForSelector("#tema-plataforma-grid button", { timeout: 15000 });

  const cuantos = await page.locator("#tema-plataforma-grid button").count();
  igual("se ofrecen todos los temas", cuantos, Object.keys(TEMAS).length);
  const marcados = await page.locator('#tema-plataforma-grid button[aria-checked="true"]').count();
  igual("y arranca marcado uno solo (el Clásico)", marcados, 1);

  const antes = await mirarColores(page);
  igual("sin tema, el encabezado es el azul de siempre", antes.header, aRgb(TEMAS.clasico.brand[800]));
  igual("y sin decoración de fondo", antes.bodyImagen, "none");

  // Se toca la tarjeta como la toca una persona.
  await page.locator("#tema-plataforma-grid button", { hasText: "Princesas" }).click();
  await page.waitForTimeout(400);
  const p = TEMAS.princesas;
  const d = await mirarColores(page);
  igual("al tocar Princesas queda puesto el atributo", d.tema, "princesas");
  igual("se guarda para la próxima visita", d.guardado, "princesas");
  igual("el encabezado se pinta rosado DE VERDAD", d.header, aRgb(p.brand[800]));
  igual("el fondo de la página también", d.bodyFondo, aRgb(p.brand[50]));
  igual("las casillas del tablero pasan a rosado", d.sqLight, CASILLAS.THEMES[p.casillas].light);
  igual("y las oscuras", d.sqDark, CASILLAS.THEMES[p.casillas].dark);
  cierto("las tarjetas se redondean más", d.radio2xl === "28px", d.radio2xl);
  cierto("aparece el fondo decorativo", /url\(/.test(d.bodyImagen || ""), d.bodyImagen);
  cierto("y se pide la letra del tema", (await page.locator(`link[href*="${p.fuente}"]`).count()) > 0,
         "no se agregó el <link> de " + p.fuente);
  // La familia DECLARADA, no la dibujada: acá la red a Google Fonts está
  // cortada a propósito, así que lo que se comprueba es que la regla del tema
  // llegue al título — y que detrás quede la de siempre por si la fuente no
  // baja.
  cierto("y los títulos la piden, con la de siempre detrás",
         /^["']?Quicksand/.test(d.tituloFuente || "") && /Merriweather/.test(d.tituloFuente || ""),
         d.tituloFuente);

  // La vista previa de cada tarjeta enseña el color del tema y no uno escrito
  // a mano: con un rosa "parecido" se elegiría a ciegas.
  const previa = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("#tema-plataforma-grid button"))
      .find((x) => /Princesas/.test(x.textContent));
    const barra = b.querySelector(".tema-previa-barra");
    return getComputedStyle(barra).backgroundColor;
  });
  igual("la vista previa usa el color del tema", previa, aRgb(p.brand[800]));

  await ctx.close();
}

async function pruebaTodaLaPlataforma(navegador) {
  console.log("\n=== El tema alcanza a las demás páginas, no solo a Configuración ===");
  for (const url of ["/clases.html", "/informes.html", "/entreno/index.html", "/cursos.html"]) {
    const { page, ctx } = await abrir(navegador, url, { tema: "princesas", fuente: "Quicksand" });
    const d = await mirarColores(page);
    igual(`${url}: el encabezado`, d.header, aRgb(TEMAS.princesas.brand[800]));
    igual(`${url}: el atributo ya está puesto al pintar`, d.tema, "princesas");
    // La barra del sistema en el celular: pwa-cabecera.py la deja escrita con
    // el azul de siempre, y una barra azul sobre un encabezado rosado se ve
    // como una app a medio pintar.
    cierto(`${url}: la barra del sistema acompaña`,
           mismoColor(d.barra, aRgb(TEMAS.princesas.brand[800])), d.barra);
    await ctx.close();
  }

  // En oscuro el tema tiene que seguir siendo el tema: los fondos oscuros
  // salen de los mismos tonos 900/950 de su paleta.
  const { page, ctx } = await abrir(navegador, "/clases.html", { tema: "princesas", oscuro: true });
  const d = await mirarColores(page);
  igual("en modo oscuro el fondo es el rosa oscuro del tema", d.bodyFondo, aRgb(TEMAS.princesas.brand[950]));
  await ctx.close();
}

/* Modo Adaptado se enciende por baja visión, y el patrón de fondo de un tema
   es ruido visual justo ahí. Lo que se apaga es el ADORNO, no el tema: los
   colores se quedan. */
async function pruebaModoAdaptado(navegador) {
  console.log("\n=== En Modo Adaptado se va el adorno, no el tema ===");
  const { page, ctx } = await abrir(navegador, "/clases.html", { tema: "princesas" });
  await page.evaluate(() => document.documentElement.classList.add("adaptive-mode"));
  await page.waitForTimeout(200);
  const d = await mirarColores(page);
  igual("el fondo decorativo se apaga", d.bodyImagen, "none");
  igual("y el color del tema se queda", d.header, aRgb(TEMAS.princesas.brand[800]));
  await ctx.close();
}

async function pruebaCasillasElegidas(navegador) {
  console.log("\n=== La elección de casillas del alumno le gana al tema ===");
  const { page, ctx } = await abrir(navegador, "/configuracion.html",
                                    { tema: "princesas", casillas: "madera" });
  await page.waitForSelector("#board-color-theme-grid button", { timeout: 15000 });
  let d = await mirarColores(page);
  igual("con Madera elegido a mano, las casillas son de madera",
        d.sqLight, CASILLAS.THEMES.madera.light);

  // Y el camino de vuelta, que es el que se rompe callado: quien vuelve a
  // "Como el tema" se quedaría con la madera escrita en línea para siempre.
  await page.locator("#board-color-theme-grid button", { hasText: "Como el tema" }).first().click();
  await page.waitForTimeout(300);
  d = await mirarColores(page);
  igual('al volver a "Como el tema" mandan las del tema',
        d.sqLight, CASILLAS.THEMES[TEMAS.princesas.casillas].light);
  await ctx.close();
}

/* Los que VUELAN (js/temas-plataforma.js → `vuelan`). Son dos capas fijas
   colgadas de body, así que lo que se comprueba es lo que ve quien entra: que
   estén, que se muevan DE VERDAD —una animación declarada que el navegador no
   corre se ve exactamente igual que un fondo quieto—, que no se coman ningún
   clic, y que las dos formas de decir «menos movimiento» hagan cada una lo
   suyo: Modo Adaptado se las lleva enteras, y `prefers-reduced-motion` solo
   las frena. */
async function capasDe(page) {
  return page.evaluate(() => {
    const leer = (p) => {
      const cs = getComputedStyle(document.body, p);
      return { content: cs.content, anim: cs.animationName, z: cs.zIndex,
               clics: cs.pointerEvents, img: cs.backgroundImage.slice(0, 30),
               transform: cs.transform };
    };
    return { antes: leer("::before"), despues: leer("::after") };
  });
}

async function pruebaVuelan(navegador) {
  console.log("\n=== Los cohetes y los dragones cruzan el fondo ===");
  for (const [id, tema] of Object.entries(TEMAS)) {
    if (!tema.vuelan) continue;
    const { page, ctx } = await abrir(navegador, "/clases.html", { tema: id });
    const c = await capasDe(page);
    igual(`${id}: las dos capas existen`,
          [c.antes.content, c.despues.content].join(" · "), '"" · ""');
    igual(`${id}: y llevan su animación`,
          [c.antes.anim, c.despues.anim].join(" · "),
          `vuela-${id}-lejos · vuela-${id}-cerca`);
    cierto(`${id}: las dos van detrás del contenido y no se comen los clics`,
           c.antes.z === "-1" && c.despues.z === "-1" &&
           c.antes.clics === "none" && c.despues.clics === "none",
           JSON.stringify([c.antes.z, c.antes.clics, c.despues.z, c.despues.clics]));
    cierto(`${id}: cada capa dibuja algo`,
           /^url\(/.test(c.antes.img) && /^url\(/.test(c.despues.img),
           c.antes.img + " · " + c.despues.img);

    // Que se MUEVAN: la matriz del transform tiene que haber cambiado sola.
    const antes = c.antes.transform;
    await page.waitForTimeout(1200);
    const despues = (await capasDe(page)).antes.transform;
    cierto(`${id}: y se mueven de verdad (el navegador corre la animación)`,
           antes !== despues, `se quedó en ${despues}`);
    await ctx.close();
  }

  // Un tema decorado que NO declara `vuelan` no puede traerlas: si las trajera,
  // Princesas tendría cohetes.
  const { page, ctx } = await abrir(navegador, "/clases.html", { tema: "princesas" });
  const c = await capasDe(page);
  igual("un tema sin `vuelan` no pinta ninguna capa",
        [c.antes.content, c.despues.content].join(" · "), "none · none");
  await ctx.close();
}

async function pruebaMenosMovimiento(navegador) {
  console.log("\n=== Las dos formas de pedir menos movimiento ===");
  // Modo Adaptado se las lleva enteras: apagar el patrón y dejar los cohetes
  // cruzando la pantalla sería lo contrario de lo que hace ese modo.
  let { page, ctx } = await abrir(navegador, "/clases.html", { tema: "galaxia" });
  await page.evaluate(() => document.documentElement.classList.add("adaptive-mode"));
  await page.waitForTimeout(200);
  let c = await capasDe(page);
  igual("en Modo Adaptado no queda ninguna capa",
        [c.antes.content, c.despues.content].join(" · "), "none · none");
  await ctx.close();

  // prefers-reduced-motion las deja quietas, no las borra: quien pidió menos
  // movimiento no pidió menos tema.
  ({ page, ctx } = await abrir(navegador, "/clases.html", { tema: "galaxia", quieto: true }));
  c = await capasDe(page);
  igual("con «menos movimiento» del sistema, las capas siguen ahí",
        [c.antes.content, c.despues.content].join(" · "), '"" · ""');
  igual("pero ya no se animan",
        [c.antes.anim, c.despues.anim].join(" · "), "none · none");
  await ctx.close();
}

/* Lo de arriba mide colores contra la tabla; esto mide lo único que de verdad
   importa de un color: que el texto se lea sobre lo que tiene detrás. Se hace
   con la cadena entera puesta (tema + CSS compilado + navegador), porque un
   contraste correcto en la tabla y una variable mal escrita dan una página
   ilegible sin ningún error. */
async function pruebaLegibilidad(navegador) {
  console.log("\n=== Con el tema puesto, el texto se sigue leyendo ===");
  for (const oscuro of [false, true]) {
    const { page, ctx } = await abrir(navegador, "/clases.html", { tema: "princesas", oscuro });
    const peor = await page.evaluate(() => {
      const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      const lum = (c) => {
        const [r, g, b] = c.match(/[\d.]+/g).map(Number);
        return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
      };
      const fondoDe = (n) => {
        for (let e = n; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor;
          const a = c.match(/[\d.]+/g);
          if (a && (a.length < 4 || Number(a[3]) > 0.9)) return c;
        }
        return "rgb(255, 255, 255)";
      };
      let peor = { v: 99, texto: "" };
      for (const n of document.querySelectorAll("p, h1, h2, h3, a, span, li")) {
        if (!n.checkVisibility || !n.checkVisibility()) continue;
        const t = (n.textContent || "").trim();
        if (!t || t.length < 4 || n.children.length) continue;
        const cs = getComputedStyle(n);
        const px = parseFloat(cs.fontSize);
        const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
        const l1 = lum(cs.color), l2 = lum(fondoDe(n));
        const v = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const minimo = grande ? 3 : 4.5;
        if (v / minimo < peor.v / (peor.minimo || 4.5)) peor = { v, minimo, texto: t.slice(0, 40) };
      }
      return peor;
    });
    cierto(`${oscuro ? "oscuro" : "claro"}: el texto peor parado llega a su mínimo` +
           ` (${peor.v.toFixed(2)} contra ${peor.minimo})`,
           peor.v >= peor.minimo - 0.05, `«${peor.texto}» se quedó en ${peor.v.toFixed(2)}`);
    await ctx.close();
  }
}

(async () => {
  pruebaTabla();
  pruebaContraste();
  pruebaCompilado();
  pruebaCabecera();

  const navegador = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  try {
    await pruebaConfiguracion(navegador);
    await pruebaTodaLaPlataforma(navegador);
    await pruebaCasillasElegidas(navegador);
    await pruebaModoAdaptado(navegador);
    await pruebaVuelan(navegador);
    await pruebaMenosMovimiento(navegador);
    await pruebaLegibilidad(navegador);
  } finally {
    await navegador.close();
  }

  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron\n` : "\n✓ Todo bien\n");
  process.exit(fallos ? 1 : 0);
})();
