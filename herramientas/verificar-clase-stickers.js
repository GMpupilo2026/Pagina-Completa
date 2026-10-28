#!/usr/bin/env node
/* Los stickers del profe: el dibujo del profe Oscar con una frase, unos
   segundos encima de la clase en vivo.

   El profe aprieta «Mandar un sticker del profe» en «Alumnos conectados»,
   elige un dibujo (la frase viene sugerida y la cambia si quiere) y a quién:
   toda la clase o un alumno. Queda en game_state.sticker ({id, texto, para,
   at}); la hora la pone la base y solo el profe lo escribe
   (protect_game_state_teacher_columns, comprobado impersonando: lo del profe
   queda con la hora de la base, lo del alumno se revierte y una forma rara la
   rechaza el CHECK).

   Se comprueba:
   - que cada dibujo del catálogo tenga su imagen y cada imagen su dibujo, con
     su frase y su texto alternativo;
   - cuándo se ve uno (js/clase-stickers.js, vigente()), sin navegador;
   - que el profe lo elija y lo mande (con la frase cambiada y para un solo
     alumno), que el diálogo diga qué hay que hacer y se cierre, y que el
     profe vea lo que mandó con «Solo para …»;
   - que la alumna lo vea de verdad (no el atributo), con la frase y el dibujo
     con su texto alternativo, que se le diga en voz, que se pueda cerrar, que
     se vaya solo, que no vea uno viejo ni uno que era para otro, y que nunca
     escriba sticker.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-stickers.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const RAIZ = path.join(__dirname, "..");
const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (sticker) => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, sticker });
const hace = (ms) => new Date(Date.now() - ms).toISOString();
const stickers = (page) => page.evaluate(() =>
  window.__updates.filter((u) => u.tabla === "game_state" && "sticker" in u.campos).map((u) => u.campos.sticker));

// Los dos módulos del repositorio, como los carga sesion.html: primero el avatar.
function cargarModulo() {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, "js", "avatar-profe-oscar.js"), "utf8"))(w);
  new Function("window", fs.readFileSync(path.join(RAIZ, "js", "clase-stickers.js"), "utf8"))(w);
  return Object.assign(w.ClaseStickers, { avatar: w.AvatarProfeOscar });
}

function pruebaCatalogo() {
  console.log("\n=== El avatar del profe Oscar: el catálogo, los originales y la página ===");
  const S = cargarModulo();
  const A = S.avatar;
  const ids = A.LISTA.map((a) => a.id);
  const enCarpeta = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length));
  const web = enCarpeta(path.join(RAIZ, "img", "avatar-profe-oscar"), ".webp");
  const originales = enCarpeta(path.join(RAIZ, "herramientas", "avatar-profe-oscar", "originales"), ".png");
  igual("cada avatar tiene su original", ids.filter((id) => !originales.includes(id)), []);
  igual("cada original está en el catálogo", originales.filter((o) => !ids.includes(o)), []);
  igual("cada avatar tiene su versión para la página", ids.filter((id) => !web.includes(id)), []);
  igual("ninguna versión para la página sin su avatar", web.filter((w) => !ids.includes(w)), []);
  igual("sin repetidos", ids.length === new Set(ids).size, true);
  igual("ids que acepta el CHECK de la base", ids.filter((id) => !/^[a-z0-9-]{1,40}$/.test(id)), []);
  igual("todos con texto alternativo", A.LISTA.filter((a) => !a.alt || a.alt.length < 10).map((a) => a.id), []);
  // La versión para la página sale de los originales con su alto (avatar-profe-oscar.py).
  const py = fs.readFileSync(path.join(RAIZ, "herramientas", "avatar-profe-oscar.py"), "utf8");
  igual("el generador usa el mismo alto que el catálogo", new RegExp("ALTO = " + A.ALTO + "\\b").test(py), true);
  // Los originales no se publican.
  igual("los originales están en .assetsignore", /^herramientas\/avatar-profe-oscar$/m.test(fs.readFileSync(path.join(RAIZ, ".assetsignore"), "utf8")), true);
  // Livianas: la clase las baja en el celular.
  const dir = path.join(RAIZ, "img", "avatar-profe-oscar");
  igual("ninguna pasa de 60 KB", web.filter((a) => fs.statSync(path.join(dir, a + ".webp")).size > 60 * 1024), []);

  console.log("\n=== Los stickers: los avatares con frase ===");
  igual("los stickers son los avatares con frase", S.CATALOGO.map((s) => s.id), A.conFrase().map((a) => a.id));
  igual("hay de sobra para elegir", S.CATALOGO.length >= 20, true);
  igual("frases dentro del tope", S.CATALOGO.filter((s) => !s.texto || s.texto.length > S.MAX_TEXTO).map((s) => s.id), []);
  igual("con la ruta de la página", S.ruta("muy-bien"), "img/avatar-profe-oscar/muy-bien.webp");
  const sql = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", f), "utf8")).join("\n");
  igual("el CHECK de la base tiene el mismo tope de la frase", new RegExp("sticker->>'texto', ''\\)\\) <= " + S.MAX_TEXTO).test(sql), true);
  const html = fs.readFileSync(path.join(RAIZ, "sesion.html"), "utf8");
  igual("sesion.html carga el avatar antes que los stickers",
    html.indexOf("js/avatar-profe-oscar.js") > 0 && html.indexOf("js/avatar-profe-oscar.js") < html.indexOf("js/clase-stickers.js"), true);
}

function pruebaVigente() {
  console.log("\n=== Cuándo se ve ===");
  const S = cargarModulo();
  const at = new Date(1000000).toISOString();
  const base = { id: "muy-bien", texto: "¡Muy bien!", para: null, at };
  igual("recién mandado, se ve todo el tiempo", S.vigente(base, 1000000, {}), S.DURA);
  igual("a la mitad, lo que le queda", S.vigente(base, 1000000 + 3000, {}), S.DURA - 3000);
  igual("pasado el tiempo, ya no", S.vigente(base, 1000000 + S.DURA, {}), null);
  igual("un reloj apenas atrasado no lo esconde", S.vigente(base, 1000000 - 1000, {}), S.DURA);
  igual("un dibujo que no existe, nada", S.vigente(Object.assign({}, base, { id: "otro" }), 1000000, {}), null);
  const paraAna = Object.assign({}, base, { para: "u-ana" });
  igual("para Ana: Ana lo ve", S.vigente(paraAna, 1000000, { yo: "u-ana" }) != null, true);
  igual("para Ana: otro alumno no", S.vigente(paraAna, 1000000, { yo: "u-luis" }), null);
  igual("para Ana: el profe sí", S.vigente(paraAna, 1000000, { yo: "u-profe", esProfe: true }) != null, true);
  igual("sin sticker, nada", S.vigente(null, 0, {}), null);
}

async function pruebaProfe(browser) {
  console.log("\n=== El profe manda un sticker ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila(null)] });
  await page.waitForSelector("#clase-stickers-abrir", { state: "visible", timeout: 10000 });
  await page.evaluate(() => { window.__entraAlumno(); });
  igual("el botón dice lo que hace", (await page.textContent("#clase-stickers-abrir")).trim(), "😀 Mandar un sticker del profe");
  await page.click("#clase-stickers-abrir");
  await page.waitForSelector("#clase-stickers-dialogo", { state: "visible", timeout: 5000 });
  igual("el diálogo se ve, con el foco en el primer dibujo", [await seVe(page, "#clase-stickers-dialogo"),
    await page.evaluate(() => document.activeElement.dataset.sticker)], [true, "muy-bien"]);
  igual("sin elegir, no se puede mandar", await page.isDisabled("#clase-stickers-mandar"), true);
  igual("trae todos los dibujos", await page.locator(".clase-stickers-opcion").count(), cargarModulo().CATALOGO.length);
  igual("«Para» ofrece a la clase y a cada conectado", await page.$$eval("#clase-stickers-para option", (o) => o.map((x) => x.textContent)),
    ["Toda la clase", "Solo Ana Rojas"]);
  await page.click('[data-sticker="esfuerzate"]');
  igual("al elegir, se marca y trae su frase", [await page.getAttribute('[data-sticker="esfuerzate"]', "aria-pressed"),
    await page.inputValue("#clase-stickers-texto")], ["true", "¡Esfuérzate más!"]);
  await page.fill("#clase-stickers-texto", "¡Esfuérzate más, Ana!");
  await page.selectOption("#clase-stickers-para", "u-ana");
  await page.click("#clase-stickers-mandar");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.sticker), null, { timeout: 5000 });
  const s = (await stickers(page))[0];
  igual("manda el dibujo, la frase y para quién", [s.id, s.texto, s.para, typeof s.at], ["esfuerzate", "¡Esfuérzate más, Ana!", "u-ana", "string"]);
  igual("y el diálogo se cierra", await page.evaluate(() => !document.getElementById("clase-stickers-dialogo")), true);
  igual("el foco vuelve al botón", await page.evaluate(() => document.activeElement.id), "clase-stickers-abrir");
  await page.waitForTimeout(200);
  igual("el profe ve lo que mandó", await seVe(page, "#clase-sticker"), true);
  igual("con «Solo para …»", await page.textContent("#clase-sticker-para"), "Solo para Ana Rojas");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna lo ve ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE,
    { game_state: [fila({ id: "muy-bien", texto: "¡Muy bien!", para: null, at: hace(500) })] });
  await page.waitForFunction(() => { const c = document.getElementById("clase-sticker"); return c && !c.hidden; }, null, { timeout: 10000 });
  igual("se ve de verdad", await seVe(page, "#clase-sticker"), true);
  igual("con la frase", await page.textContent("#clase-sticker-texto"), "¡Muy bien!");
  igual("y el dibujo con su texto alternativo", [await page.getAttribute("#clase-sticker-img", "src"), (await page.getAttribute("#clase-sticker-img", "alt")).length > 10],
    ["img/avatar-profe-oscar/muy-bien.webp", true]);
  igual("la imagen cargó", await page.evaluate(() => { const i = document.getElementById("clase-sticker-img"); return i.complete && i.naturalWidth > 0; }), true);
  igual("sin «Solo para» (es de toda la clase)", await seVe(page, "#clase-sticker-para"), false);
  igual("se le dice en voz", await page.textContent("#clase-sticker-voz"), "Tu profe te manda un sticker: ¡Muy bien!.");
  igual("la voz es región viva", await page.getAttribute("#clase-sticker-voz", "aria-live"), "polite");
  await page.click("#clase-sticker-cerrar");
  igual("se puede cerrar", await seVe(page, "#clase-sticker"), false);

  // Uno viejo (de antes de entrar) no aparece.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ id: "wow", texto: "¡Wow!", para: null, at: hace(20000) }));
  await page.waitForTimeout(200);
  igual("uno viejo no aparece", await seVe(page, "#clase-sticker"), false);
  // Uno para otro alumno, tampoco.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ id: "wow", texto: "¡Wow!", para: "u-luis", at: hace(100) }));
  await page.waitForTimeout(200);
  igual("uno para otro alumno no aparece", await seVe(page, "#clase-sticker"), false);
  // Uno nuevo para ella, casi al final de su tiempo: aparece y se va solo.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ id: "nos-vemos", texto: "¡Nos vemos la próxima clase!", para: "u-ana", at: hace(7200) }));
  await page.waitForTimeout(200);
  igual("uno para ella aparece", [await seVe(page, "#clase-sticker"), await page.textContent("#clase-sticker-texto")],
    [true, "¡Nos vemos la próxima clase!"]);
  await page.waitForTimeout(1200);
  igual("y se va solo", await seVe(page, "#clase-sticker"), false);
  igual("la alumna nunca escribió sticker", (await stickers(page)).length, 0);
  igual("ni tiene el botón del profe", await page.evaluate(() => !!document.getElementById("clase-stickers-abrir")), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  try { pruebaCatalogo(); pruebaVigente(); } catch (e) { console.log("  ✗ se cayó: " + (e && e.stack || e)); fallos += 1; }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaAlumna(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el profe manda sus stickers y la clase los ve unos segundos.");
  process.exit(fallos ? 1 : 0);
})();
