/* Comprueba los certificados de curso (ver «Los certificados de curso» en
   docs/decisiones/cursos-y-material.md).

   Sin navegador:
   - Las lecciones de cada curso que conoce la base (interno.curso_lecciones,
     en la migración que la llena) son las que tiene cursos/protegido/<slug>.html:
     un <details> de primer nivel por lección, lo mismo que cuenta
     js/curso-academia.js. Si un curso suma una lección y la base no se
     entera, nadie podría completar ese curso para la base, o se completaría
     antes de tiempo; no da ningún error.
   - Están todos los cursos del catálogo, y ninguno de más.

   Con navegador, certificado.html?c=<código>:
   - Pinta lo que devuelve certificado_publico, con el QR que lleva a ESE
     enlace, los dos logos y «auténtico».
   - Anulado: lo dice arriba y cruzado encima, y no ofrece imprimir.
   - Un código que no tiene forma de código ni se le pregunta a la base; uno
     que no existe lo dice.
   - Lo que trae la base va como texto (un nombre que es un <img> no se pinta).
   - Al imprimir sale solo el papel, y el papel es blanco también en modo oscuro.

   Uso:  npm install; node herramientas/verificar-todo.js certificados       */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir } = require("./lib/doble-entreno");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* Las lecciones que la base cree que tiene cada curso: la ÚLTIMA migración que
   llena interno.curso_lecciones manda (una posterior puede corregir un total). */
function leccionesDeLaBase() {
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const total = {};
  archivos.forEach((f) => {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const i = sql.indexOf("insert into interno.curso_lecciones");
    if (i >= 0) {
      const bloque = sql.slice(i, sql.indexOf(";", i));
      for (const m of bloque.matchAll(/\('([a-z0-9-]+)',\s*'[^']*',\s*(\d+)\)/g)) total[m[1]] = Number(m[2]);
    }
    // Un curso que cambió de slug («mil-y-una-lecciones» pasó a
    // «una-clase-al-dia») se lleva su total.
    for (const m of sql.matchAll(/update interno\.curso_lecciones set slug = '([a-z0-9-]+)' where slug = '([a-z0-9-]+)'/g)) {
      if (m[2] in total) { total[m[1]] = total[m[2]]; delete total[m[2]]; }
    }
  });
  return total;
}

// Un <details> de primer nivel por lección (los de adentro son pistas o soluciones).
function leccionesDelCurso(slug) {
  const html = fs.readFileSync(path.join(RAIZ, "cursos", "protegido", slug + ".html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  let nivel = 0, n = 0;
  for (const m of html.matchAll(/<(\/?)details\b/gi)) {
    if (m[1]) nivel--; else { if (nivel === 0) n++; nivel++; }
  }
  return n;
}

function estatico() {
  console.log("\n=== Las lecciones de cada curso, en la base y en la página ===");
  const base = leccionesDeLaBase();
  const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, "herramientas", "cursos", "catalogo.json"), "utf8")).cursos.map((c) => c.slug).sort();
  // Una fila que la base tiene sin curso publicado: «cambio-o-no-cambio» lo
  // dio de alta otra sesión y nunca se publicó (ver «Hubo otro curso del mismo
  // tema a la vez»). No da certificado porque ninguna página lo pide; si se
  // borra con su migración, se saca de acá. Lo mismo los siete cursos que se
  // borraron del sitio en octubre de 2026 (ver «Los cursos borrados»): ninguno
  // tiene un certificado emitido, y siguen en interno.curso_lecciones hasta que
  // se aplique la migración que los quita.
  const SIN_CURSO = ["cambio-o-no-cambio",
    "fundamentos-del-ajedrez", "aperturas-y-defensas", "calculo-y-visualizacion", "finales-practicos",
    "estrategia-y-tactica", "estrategia-en-el-final", "preparacion-para-torneos"];
  igual("las filas sin curso no están en el catálogo", SIN_CURSO.filter((s) => catalogo.includes(s)), []);
  SIN_CURSO.forEach((slug) => delete base[slug]);
  igual("la base conoce exactamente los cursos del catálogo", Object.keys(base).sort(), catalogo);
  catalogo.forEach((slug) => igual(`${slug}: lecciones en la base = en la página`, base[slug], leccionesDelCurso(slug)));
}

const CERT = {
  alumno_nombre: "Ana Rojas", curso_titulo: "Finales Prácticos", lecciones: 14,
  academia_nombre: "CENFOTEC", academia_logo_path: "b105ee8a-18d4-4a81-b839-e9fd56741a02/logo-47abe3476a364a39.webp",
  profesor_nombre: "Profe Oscar", emitido_at: "2026-10-04T05:46:27Z", anulado: false,
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// El logo de la academia sale del bucket público: acá, un PNG de mentira.
const conLogo = async (ctx) => {
  await ctx.addInitScript(() => { window.SUPABASE_URL = "https://proyecto.supabase.co"; });
  await ctx.route("https://proyecto.supabase.co/storage/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
};

const leer = (page) => page.evaluate(() => {
  const vis = (id) => { const e = document.getElementById(id); return !!(e && e.checkVisibility()); };
  const t = (id) => document.getElementById(id).textContent;
  return {
    estado: vis("estado") ? t("estado") : null,
    papel: vis("certificado"),
    alumno: t("cert-alumno"), curso: t("cert-curso"), lecciones: t("cert-lecciones"), fecha: t("cert-fecha"),
    profesor: t("cert-profesor"), academia: vis("cert-academia-fila") ? t("cert-academia") : null, codigo: t("cert-codigo"),
    validez: vis("validez") ? t("validez-texto") : null,
    logoAcademia: vis("logo-academia") ? document.getElementById("logo-academia").alt : null,
    qr: !!document.querySelector("#cert-qr svg path"),
    anulado: vis("cert-anulado"), imprimir: vis("imprimir"),
    titulo: document.title,
  };
});
const pedidos = (page) => page.evaluate(() => (window.__rpcArgs || []).filter((a) => a[0] === "certificado_publico").map((a) => a[1]));

async function pagina(browser) {
  console.log("\n=== certificado.html ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/certificado.html?c=0123456789", { "rpc:certificado_publico": [CERT] }, null, conLogo);
    await page.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 15000 });
    const r = await leer(page);
    igual("pide ESE código a la base", await pedidos(page), [{ p_codigo: "0123456789" }]);
    igual("el papel dice lo que guardó la base", [r.alumno, r.curso, r.lecciones, r.fecha, r.profesor, r.academia, r.codigo],
      ["Ana Rojas", "Finales Prácticos", "14 lecciones", "3 de octubre de 2026", "Profe Oscar", "CENFOTEC", "0123456789"]);
    igual("con el logo de su academia y el QR", [r.logoAcademia, r.qr], ["Logo de CENFOTEC", true]);
    igual("y arriba, que es auténtico", r.validez, "✅ Certificado auténtico.");
    igual("el título de la pestaña lo nombra", r.titulo, "Certificado: Finales Prácticos — Ana Rojas");
    // El QR lleva a ESTE certificado: se lee de vuelta con la misma librería.
    igual("el QR lleva a este mismo enlace", await page.evaluate(() => {
      const q = window.qrcode(0, "M"); q.addData(location.origin + "/certificado.html?c=0123456789"); q.make();
      return document.querySelector("#cert-qr svg").getAttribute("viewBox") === "0 0 " + (q.getModuleCount() + 8) + " " + (q.getModuleCount() + 8);
    }), true);
    // Papel blanco también en modo oscuro.
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    igual("en modo oscuro el papel sigue blanco", await page.evaluate(() => getComputedStyle(document.getElementById("certificado")).backgroundColor), "rgb(255, 255, 255)");
    // Al imprimir, solo el papel.
    await page.emulateMedia({ media: "print" });
    igual("al imprimir no salen la franja ni los botones, sí el papel", await page.evaluate(() =>
      [document.getElementById("validez").checkVisibility(), document.getElementById("imprimir").checkVisibility(), document.getElementById("certificado").checkVisibility()]), [false, false, true]);
    igual("sin errores en la página", errores.join(" | "), "");
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/certificado.html?c=0123456789", { "rpc:certificado_publico": [Object.assign({}, CERT, { anulado: true, academia_nombre: null, academia_logo_path: null })] });
    await page.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 15000 });
    const r = await leer(page);
    igual("anulado: lo dice arriba, cruzado encima y sin imprimir", [r.validez, r.anulado, r.imprimir], ["⚠️ Este certificado fue anulado y ya no vale.", true, false]);
    igual("sin academia no hay logo ni fila de academia", [r.logoAcademia, r.academia], [null, null]);
    await ctx.close();
  }
  for (const [c, nombre] of [["xyz", "no tiene forma de código"], ["0123456789abc", "es más largo"]]) {
    const { page, ctx } = await abrir(browser, "/certificado.html?c=" + c, { "rpc:certificado_publico": [CERT] });
    await page.waitForFunction(() => !/Buscando/.test(document.getElementById("estado").textContent), null, { timeout: 15000 });
    const r = await leer(page);
    igual(`un código que ${nombre} ni se le pregunta a la base`, [await pedidos(page), r.papel, /no es de un certificado/.test(r.estado)], [[], false, true]);
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/certificado.html?c=9999999999", { "rpc:certificado_publico": [] });
    await page.waitForFunction(() => !/Buscando/.test(document.getElementById("estado").textContent), null, { timeout: 15000 });
    const r = await leer(page);
    igual("un código que no existe lo dice", [r.papel, /No encontramos un certificado/.test(r.estado)], [false, true]);
    await ctx.close();
  }
  {
    const raro = Object.assign({}, CERT, { alumno_nombre: "<img src=x onerror=window.__xss=1>", curso_titulo: "<b>x</b>" });
    const { page, ctx, errores } = await abrir(browser, "/certificado.html?c=0123456789", { "rpc:certificado_publico": [raro] });
    await page.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 15000 });
    igual("lo que trae la base se escribe, no se pinta", await page.evaluate(() =>
      [document.querySelectorAll("#cert-alumno img, #cert-curso b").length, window.__xss || 0, document.getElementById("cert-alumno").textContent]),
      [0, 0, "<img src=x onerror=window.__xss=1>"]);
    igual("sin errores (texto ajeno)", errores.join(" | "), "");
    await ctx.close();
  }
}

(async () => {
  estatico();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pagina(browser);
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
