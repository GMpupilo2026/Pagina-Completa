/* «Tus horas del taller»: la barra de lo que lleva cada asesor de las horas
 * del taller y lo que le falta, y la práctica de la sesión presencial.
 *
 * Lo que se rompe acá se rompe callado:
 *
 *  - La cuenta se muda al navegador (o se copia a medias) y la barra dice una
 *    cosa mientras administración ve otra: la regla de cuánto vale cada cosa
 *    vive SOLO en la base (taller_horas / interno.taller_horas_de).
 *  - Cualquiera se aprueba su práctica desde la consola: la tabla no puede
 *    tener política de escritura, y las funciones exigen permiso con coalesce.
 *  - Una sesión cuenta más de lo que dura (clase + grabación), y alguien
 *    «cumple» las 30 horas sin estar.
 *  - La barra o lo que le falta deja de decirse escrito, o el botón de subir la
 *    práctica no dice si está abierto.
 *
 * Lo de la base se mira leyendo supabase/ (sin red ni base); además se comprobó
 * impersonando roles en SQL (ver «Las horas del taller» en
 * docs/decisiones/paneles.md). En el navegador se arma la tarjeta con
 * js/horas-taller.js y filas de ejemplo.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-horas-taller.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* ==================================================================
   1. Sin navegador: la base y la página
   ================================================================== */
function pruebaBase() {
  console.log("=== La base (supabase/migraciones) ===");
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  cierto("taller_practicas tiene RLS", /alter\s+table\s+public\.taller_practicas\s+enable\s+row\s+level\s+security/i.test(sql));
  cierto("authenticated solo la lee", /revoke\s+all\s+on\s+public\.taller_practicas\s+from\s+public,\s*anon,\s*authenticated/i.test(sql)
    && /grant\s+select\s+on\s+public\.taller_practicas\s+to\s+authenticated/i.test(sql));
  const politicas = [...sql.matchAll(/create\s+policy\s+\w+\s+on\s+public\.taller_practicas\s+for\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
  igual("sus políticas: una sola, de lectura", politicas, ["select"]);
  cierto("aprobarla queda en la bitácora (trigger auditar)", /create\s+trigger\s+auditar\s+after\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.taller_practicas/i.test(sql));
  cierto("el bucket es privado", /\('taller-practicas',\s*'taller-practicas',\s*false/i.test(sql));
  const politicasBucket = sql.match(/create\s+policy\s+taller_practicas_(subir|bajar)\s+on\s+storage\.objects[\s\S]*?;/gi) || [];
  igual("el bucket tiene una política para subir y una para bajar", politicasBucket.length, 2);
  cierto("la carpeta se compara como texto, nunca convertida a uuid (la política corre con objetos de otros buckets)",
    politicasBucket.length === 2 && politicasBucket.every((p) => !/::uuid/i.test(p)));
  cierto("la cuenta sin permiso (interno.taller_horas_de) no se le abre a authenticated",
    /revoke\s+execute\s+on\s+function\s+interno\.taller_horas_de\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i.test(sql));
  cierto("taller_horas() pide ser la persona, administrar o ser su profe, con coalesce",
    /function\s+public\.taller_horas\([\s\S]{0,900}if\s+not\s+coalesce\(p_persona\s*=\s*\(select\s+auth\.uid\(\)\)\s+or\s+public\.soy_admin\(\)\s+or\s+public\.soy_profesor_de\(p_persona\),\s*false\)/i.test(sql));
  cierto("taller_practica_revisar() pide administrar o ser el profe de la clase, con coalesce",
    /function\s+public\.taller_practica_revisar[\s\S]{0,500}if\s+not\s+coalesce\(public\.soy_admin\(\)/i.test(sql));
  cierto("una sesión en línea cuenta, como mucho, lo que dura (clase + grabación)",
    /else\s+least\(c\.duracion_min,\s*c\.m_clase\s*\+\s*c\.m_video\)/i.test(sql));
  cierto("la presencial cuenta solo con la práctica aprobada",
    /when\s+c\.modalidad\s*=\s*'presencial'\s+then\s+case\s+when\s+c\.practica\s*=\s*'aprobada'\s+then\s+c\.duracion_min\s+else\s+0\s+end/i.test(sql));
  ["taller_horas(uuid)", "asesores_horas(text)", "taller_practica_enviar(uuid, text[], text)", "taller_practica_revisar(uuid, boolean, text)"].forEach((f) => {
    const re = new RegExp("revoke\\s+execute\\s+on\\s+function\\s+public\\." + f.replace(/[()[\]]/g, "\\$&") + "\\s+from\\s+public,\\s*anon", "i");
    cierto("a " + f + " se le quita el execute a public y anon", re.test(sql));
  });

  console.log("\n=== clases.html y js/clases.js ===");
  const html = fs.readFileSync(path.join(RAIZ, "clases.html"), "utf8");
  cierto("tiene la sección, escondida hasta que la base conteste", /<section id="horas-taller" hidden aria-labelledby="horas-taller-titulo"/.test(html));
  cierto("carga js/adjuntos.js y js/horas-taller.js", /<script src="js\/adjuntos\.js"/.test(html) && /<script src="js\/horas-taller\.js"/.test(html));
  const js = fs.readFileSync(path.join(RAIZ, "js", "clases.js"), "utf8");
  cierto("el panel pide las horas a la base (taller_horas)", /sb\.rpc\("taller_horas",\s*\{\s*p_persona:\s*profile\.id\s*\}\)/.test(js));
  const modulo = fs.readFileSync(path.join(RAIZ, "js", "horas-taller.js"), "utf8");
  cierto("js/horas-taller.js no cuenta clase ni grabación: suma lo que ya contó la base (min_contados)",
    /min_contados/.test(modulo) && !/min_clase\s*\+|min_grabacion\s*\+/.test(modulo));
}

/* ==================================================================
   2. En un navegador
   ================================================================== */
function contrasteEnPagina(el) {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  let fondo = null;
  for (let n = el; n; n = n.parentElement) {
    const c = rgb(getComputedStyle(n).backgroundColor);
    if (c.length >= 3 && (c.length === 3 || c[3] === 1)) { fondo = c; break; }
  }
  if (!fondo) fondo = [255, 255, 255];
  const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(fondo)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${BASE}/css/tailwind.css"></head>
<body class="bg-brand-50 dark:bg-brand-950 p-4">
<section id="horas-taller" hidden aria-labelledby="horas-taller-titulo" class="mb-8 bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6"></section>
<script charset="utf-8" src="${BASE}/js/hora-cr.js"></script>
<script charset="utf-8" src="${BASE}/js/adjuntos.js"></script>
<script charset="utf-8" src="${BASE}/js/horas-taller.js"></script>
</body></html>`;

// Las filas como las devuelve taller_horas(): ya contadas por la base.
function filas() {
  const d = (dia, h) => new Date("2026-" + dia + "T" + h + ":00-06:00").toISOString();
  const s = (id, titulo, dia, ini, fin, mod, dura, clase, video, cuenta, extra) => Object.assign({
    horario_id: id, titulo, fecha: "2026-" + dia, inicio: d(dia, ini), fin: d(dia, fin), modalidad: mod, duracion_min: dura,
    min_clase: clase, min_grabacion: video, conectado: clase > 0, completa_por_asistencia: false, practica_estado: null, min_contados: cuenta,
  }, extra || {});
  return [
    s("h1", "Sesión I", "10-12", "08:00", "12:00", "en_linea", 240, 235, 0, 235),
    s("h2", "<b>Sesión</b> II", "10-20", "08:00", "12:00", "en_linea", 240, 0, 70, 70),
    s("h4", "Sesión IV", "11-11", "08:00", "12:00", "en_linea", 240, 50, 0, 240, { completa_por_asistencia: true }),
    s("h6", "Sesión VI", "11-24", "08:00", "11:00", "en_linea", 180, 0, 0, 0),
    s("h7", "Sesión presencial de cierre", "12-14", "07:00", "15:00", "presencial", 480, 0, 0, 0),
  ];
}

async function pruebaNavegador() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/robots.txt");
  await page.setContent(PAGINA, { waitUntil: "load" });
  const AHORA = new Date("2026-11-16T15:00:00-06:00").toISOString();
  const pintar = (f, opc) => page.evaluate(([f, o, ahora]) => {
    window.enviados = [];
    return HorasTaller.pintar(document.getElementById("horas-taller"), f, Object.assign({
      ahora: new Date(ahora),
      grabaciones: [{ horario_id: "h1" }, { horario_id: "h2" }],
      enviarPractica: async (h, selector, comentario, avisar) => { avisar("Subiendo…"); window.enviados.push([h, selector.cantidad(), comentario]); },
    }, o || {}));
  }, [f, opc || {}, AHORA]);

  console.log("\n=== La tarjeta ===");
  await pintar(filas());
  const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
  igual("se ve", await vis("#horas-taller"), true);
  const texto = await page.evaluate(() => document.getElementById("horas-taller").innerText.replace(/\s+/g, " "));
  cierto("dice lo que lleva y de cuánto: 545 min = 9 h 5 min de 23 h", /Llevas 9 h 5 min de 23 h\./.test(texto), texto.slice(0, 200));
  cierto("y lo que le falta, escrito", /Te faltan 13 h 55 min para cumplir las 23 h\./.test(texto));
  igual("la barra grande es una barra de progreso con su valor", await page.evaluate(() => {
    const b = document.querySelector("#horas-taller [role=progressbar]");
    return [b.getAttribute("aria-valuenow"), b.getAttribute("aria-valuetext")];
  }), ["39", "Llevas 9 h 5 min de 23 h (39 %)"]);
  cierto("una sesión a la que faltó dice cuánto le falta y que lo repone con la grabación",
    /Viendo la grabación: 1 h 10 min\. Te faltan 2 h 50 min: repónlos viendo la grabación/.test(texto), texto);
  cierto("el título del profe va como texto, sin interpretar el HTML", texto.includes("<b>Sesión</b> II"));
  cierto("la sesión que vale completa por asistencia lo dice", /Te conectaste a la clase: cuenta la sesión entera\./.test(texto));
  cierto("la que no ha pasado lo dice", /Sesión VI .*Todavía no ha pasado\./.test(texto));
  cierto("la presencial dice que vale con la práctica aprobada", /Esta sesión vale 8 h cuando subas la práctica que te vamos a pedir y la aprobemos\./.test(texto));

  console.log("\n=== Subir la práctica ===");
  const boton = 'li[data-sesion="h7"] button[aria-controls]';
  igual("el botón dice que el formulario está cerrado, y no se ve", [await page.getAttribute(boton, "aria-expanded"), await vis('li[data-sesion="h7"] form')], ["false", false]);
  await page.click(boton);
  igual("al tocarlo se abre y lo dice", [await page.getAttribute(boton, "aria-expanded"), await vis('li[data-sesion="h7"] form')], ["true", true]);
  await page.click('li[data-sesion="h7"] button[type=submit]');
  cierto("sin archivos no manda y lo dice", /Elige al menos un archivo/.test(await page.textContent('li[data-sesion="h7"] [role=status]')));
  await page.setInputFiles('li[data-sesion="h7"] input[type=file]', { name: "practica final.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") });
  await page.fill('li[data-sesion="h7"] textarea', "Adjunto la práctica.");
  await page.click('li[data-sesion="h7"] button[type=submit]');
  await page.waitForFunction(() => window.enviados.length === 1);
  igual("manda la sesión, el archivo y el comentario", await page.evaluate(() => window.enviados[0]), ["h7", 1, "Adjunto la práctica."]);
  cierto("y dice que quedó enviada", /quedó enviada para revisión/.test(await page.textContent('li[data-sesion="h7"] [role=status]')));

  await pintar(filas(), { practicas: [{ horario_id: "h7", estado: "devuelta", nota_revision: "Falta la <i>planilla</i>." }] });
  const devuelta = await page.evaluate(() => document.querySelector('li[data-sesion="h7"]').innerText.replace(/\s+/g, " "));
  cierto("devuelta: lo dice, enseña la nota como texto y deja subirla corregida",
    /Te devolvimos la práctica/.test(devuelta) && devuelta.includes("Falta la <i>planilla</i>.") && /Subir la práctica corregida/.test(devuelta), devuelta);
  await pintar(filas().map((f) => (f.horario_id === "h7" ? Object.assign({}, f, { min_contados: 480, practica_estado: "aprobada" }) : f)),
    { practicas: [{ horario_id: "h7", estado: "aprobada" }] });
  const aprobada = await page.evaluate(() => document.querySelector('li[data-sesion="h7"]').innerText.replace(/\s+/g, " "));
  cierto("aprobada: cuenta la sesión entera y ya no ofrece subir nada", /8 h de 8 h/.test(aprobada) && /aprobada: cuenta la sesión entera/.test(aprobada)
    && !(await page.$('li[data-sesion="h7"] form')), aprobada);

  console.log("\n=== Lo que dice la base manda ===");
  await pintar(filas().map((f) => Object.assign({}, f, { min_contados: f.duracion_min + 30 })));
  const lleno = await page.evaluate(() => document.getElementById("horas-taller").innerText.replace(/\s+/g, " "));
  cierto("una sesión no cuenta más de lo que dura, y con todo completo dice que cumplió", /Llevas 23 h de 23 h\./.test(lleno) && /✓ Cumpliste las 23 h del taller\./.test(lleno), lleno.slice(0, 200));
  igual("sin filas no se pinta nada", await pintar([]), false);
  igual("y queda escondida", await vis("#horas-taller"), false);

  console.log("\n=== Contraste y celular ===");
  await pintar(filas());
  const medir = () => page.evaluate((fn) => {
    const contraste = new Function("return " + fn)();
    return [...document.querySelectorAll("#horas-taller h2, #horas-taller p, #horas-taller strong, #horas-taller span, #horas-taller button, #horas-taller label")]
      .filter((e) => e.checkVisibility() && e.textContent.trim() && !e.querySelector("p, span, strong"))
      .map((e) => [e.textContent.trim().slice(0, 30), contraste(e)]);
  }, contrasteEnPagina.toString());
  const claro = await medir();
  const malos = claro.filter(([, c]) => c < 4.5);
  cierto("contraste del texto ≥ 4,5 en claro (" + claro.length + " textos, el menor " + Math.min(...claro.map((x) => x[1])) + ")", !malos.length, JSON.stringify(malos));
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(400);
  const oscuro = await medir();
  const malosO = oscuro.filter(([, c]) => c < 4.5);
  cierto("y en oscuro (el menor " + Math.min(...oscuro.map((x) => x[1])) + ")", !malosO.length, JSON.stringify(malosO));
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(200);
  igual("en el celular la página no se desborda", await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

  igual("sin errores en la página", errores, []);
  await browser.close();
}

(async () => {
  pruebaBase();
  try {
    await pruebaNavegador();
  } catch (e) {
    console.log("  ✗ falló la prueba en el navegador: " + (e && e.stack || e));
    fallos += 1;
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
