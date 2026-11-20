/* Los niveles de la academia (js/niveles.js, niveles_academia y niveles_alumno).
 *
 *   1. LAS CUENTAS (en Node): validar() dice en palabras lo que la base va a
 *      rechazar (sin nombre, repetido sin importar mayúsculas, más de 30,
 *      muy largo); actual() lee el nivel de hoy de la última fila del
 *      historial y avisa si ese nivel ya se borró.
 *   2. EL EDITOR (en el navegador, con el marcado de academias.html y un
 *      doble): carga en orden; agregar, subir y quitar; Guardar manda la
 *      lista ENTERA y en orden (set_niveles_academia deja la lista como
 *      llega); pinta lo que devolvió la base; uno sin nombre no se manda; y
 *      montarlo otra vez (otra academia) no duplica los guardados.
 *   3. LA FICHA DEL ALUMNO: dice el nivel y desde cuándo (día de Costa Rica);
 *      su profe lo cambia con poner_nivel_alumno y se vuelve a leer; el
 *      alumno lo ve sin poder cambiarlo; sin nivel ni niveles no ocupa lugar.
 *   4. EL CABLEADO: la migración no deja escribir las tablas desde afuera, las
 *      funciones validan con coalesce y no son de anon; academias.html e
 *      informes.html cargan el módulo antes que su código.
 *
 * Uso:  node herramientas/verificar-niveles.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
require("./lib/navegador-local");

const RAIZ = path.join(__dirname, "..");
const N = require(path.join(RAIZ, "js", "niveles.js"));

let fallos = 0;
function ok(cond, msg, detalle) {
  if (cond) console.log("  ✓ " + msg);
  else { console.log("  ✗ " + msg + (detalle !== undefined ? "\n      salió: " + JSON.stringify(detalle) : "")); fallos++; }
}

console.log("Las cuentas:");
ok(N.validar([{ nombre: "Iniciación" }, { nombre: "Básico" }]) === null, "una lista buena pasa");
ok(N.validar([{ nombre: "Iniciación" }, { nombre: "  " }]) === "El nivel 2 no tiene nombre.", "sin nombre, dice cuál");
ok(/dos niveles que se llaman «básico»/.test(N.validar([{ nombre: "Básico" }, { nombre: "básico" }])), "repetido aunque cambien las mayúsculas", N.validar([{ nombre: "Básico" }, { nombre: "básico" }]));
ok(N.validar(Array.from({ length: 31 }, (_, i) => ({ nombre: "N" + i }))) === "Como mucho 30 niveles.", "más de 30, no");
ok(/muy largo/.test(N.validar([{ nombre: "x".repeat(61) }])), "un nombre de más de 60 letras, no");
ok(N.actual([]) === null, "sin historial, sin nivel");
const act = N.actual([{ nivel_id: "n2", nivel_nombre: "Básico", created_at: "2026-11-03T05:30:00Z" }, { nivel_id: "n1", nivel_nombre: "Iniciación", created_at: "2026-09-01T12:00:00Z" }]);
ok(act && act.nombre === "Básico" && act.id === "n2" && !act.borrado, "el actual es la última fila");
ok(N.actual([{ nivel_id: null, nivel_nombre: "Avanzado", created_at: "2026-11-03T12:00:00Z" }]).borrado === true, "si ese nivel se borró, lo sabe");
ok(N.actual([{ nivel_id: null, nivel_nombre: null, created_at: "2026-11-03T12:00:00Z" }]) === null, "quitado (sin nivel), sin nivel");
ok(N.fecha("2026-11-03T05:30:00Z") === "2 de noviembre de 2026", "la fecha es la de Costa Rica (5:30 UTC todavía es el día anterior)", N.fecha("2026-11-03T05:30:00Z"));

console.log("El cableado:");
{
  const mig = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => /_niveles_academia\.sql$/.test(f));
  const sql = mig.length ? fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", mig[mig.length - 1]), "utf8") : "";
  ok(!!sql, "la migración está guardada", mig);
  ok(/revoke insert, update, delete, truncate on public\.niveles_academia from authenticated/.test(sql)
     && /revoke insert, update, delete, truncate on public\.niveles_alumno from authenticated/.test(sql)
     && !/create policy [a-z_]+ on public\.niveles_[a-z]+\s+for (insert|update|delete)/.test(sql),
     "las tablas no se escriben desde afuera: solo por las funciones");
  ok(/revoke execute on function public\.set_niveles_academia\(uuid, jsonb\) from public, anon/.test(sql)
     && /revoke execute on function public\.poner_nivel_alumno\(uuid, uuid\) from public, anon/.test(sql), "las funciones no son de anon");
  ok((sql.match(/not coalesce\(\s*\(select public\.soy_admin\(\)\)/g) || []).length === 2, "las dos validan el permiso con coalesce (con auth.uid() nulo, rechaza)");
  ok(/m\.persona_id = p_alumno/.test(sql), "el nivel tiene que ser de una academia del alumno");
  ok(!/auth\.uid\(\)\s*\)/.test(sql.split("create policy")[1] || "") || /\(select auth\.uid\(\)\)/.test(sql), "en las políticas, auth.uid() va envuelto");
  const ac = fs.readFileSync(path.join(RAIZ, "academias.html"), "utf8");
  ok(ac.indexOf('src="js/niveles.js"') > 0 && ac.indexOf('src="js/niveles.js"') < ac.indexOf('src="js/academias.js"'), "academias.html carga niveles.js antes que academias.js");
  const inf = fs.readFileSync(path.join(RAIZ, "informes.html"), "utf8");
  ok(inf.indexOf('src="js/niveles.js"') > 0 && inf.indexOf('src="js/niveles.js"') < inf.indexOf('src="js/informes.js"'), "informes.html carga niveles.js antes que informes.js");
  const ij = fs.readFileSync(path.join(RAIZ, "js", "informes.js"), "utf8");
  ok(/puedeCambiar: esOtro && \(profile\.role === "profesor" \|\| profile\.is_admin\) && !profile\._persona/.test(ij), "en el informe, cambia el nivel quien da clase o administra, no mirando como otro ni el propio alumno");
}

// Un doble de Supabase: filtra de verdad y anota lo que se le pide.
function doble() {
  return `
  window.__rpc = [];
  window.D = {
    academias: [{ id: "a1", nombre: "Torre" }, { id: "a2", nombre: "Alfil" }],
    niveles_academia: [
      { id: "n2", academia_id: "a1", nombre: "Básico", descripcion: "", orden: 2 },
      { id: "n1", academia_id: "a1", nombre: "Iniciación", descripcion: "Las piezas", orden: 1 },
      { id: "n3", academia_id: "a1", nombre: "Intermedio", descripcion: null, orden: 3 },
    ],
    niveles_alumno: [
      { alumno_id: "u-ana", nivel_id: "n1", nivel_nombre: "Iniciación", created_at: "2026-09-01T18:00:00Z" },
    ],
  };
  function q(tabla) {
    const f = []; let ord = null, desc = false, lim = null;
    const o = {
      select() { return o; }, eq(c, v) { f.push([c, v]); return o; },
      order(c, op) { ord = c; desc = !!(op && op.ascending === false); return o; }, limit(n) { lim = n; return o; },
      then(res, rej) {
        let d = (D[tabla] || []).filter((r) => f.every(([c, v]) => r[c] === v));
        if (ord) d = d.slice().sort((a, b) => (a[ord] < b[ord] ? -1 : 1) * (desc ? -1 : 1));
        if (lim) d = d.slice(0, lim);
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return o;
  }
  window.sb = {
    from: q,
    rpc: async (n, a) => {
      window.__rpc.push([n, JSON.parse(JSON.stringify(a))]);
      if (n === "set_niveles_academia") {
        const viejos = D.niveles_academia.filter((x) => x.academia_id !== a.p_academia);
        const nuevos = a.p_niveles.map((x, i) => ({ id: x.id || "nuevo" + i, academia_id: a.p_academia, nombre: x.nombre, descripcion: x.descripcion, orden: i + 1 }));
        D.niveles_academia = viejos.concat(nuevos);
        return { data: nuevos, error: null };
      }
      if (n === "poner_nivel_alumno") {
        const niv = D.niveles_academia.find((x) => x.id === a.p_nivel);
        D.niveles_alumno.push({ alumno_id: a.p_alumno, nivel_id: a.p_nivel, nivel_nombre: niv ? niv.nombre : null, created_at: "2026-11-18T15:00:00Z" });
        return { data: [{ nivel_id: a.p_nivel, nivel_nombre: niv ? niv.nombre : null, desde: "2026-11-18T15:00:00Z" }], error: null };
      }
      return { data: null, error: { code: "PGRST202" } };
    },
  };`;
}

async function navegador() {
  const ac = fs.readFileSync(path.join(RAIZ, "academias.html"), "utf8");
  const seccion = ac.match(/<section id="caja-niveles"[\s\S]*?<\/section>/)[0];
  const modulo = fs.readFileSync(path.join(RAIZ, "js", "niveles.js"), "utf8");
  const css = fs.readFileSync(path.join(RAIZ, "css", "tailwind.css"), "utf8");
  const browser = await chromium.launch();

  console.log("El editor:");
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${seccion}<div id="ficha"></div></body></html>`);
  await page.addScriptTag({ content: doble() });
  await page.addScriptTag({ content: modulo });
  await page.evaluate(() => { window.ed = Niveles.montarEditor({ caja: document.getElementById("caja-niveles"), academiaId: "a1" }); });
  await page.waitForFunction(() => document.querySelectorAll("[data-niveles-lista] > li input[id^=nivel-nombre]").length === 3);
  const nombres = () => page.$$eval("[data-niveles-lista] input[id^=nivel-nombre]", (ns) => ns.map((n) => n.value));
  ok(JSON.stringify(await nombres()) === JSON.stringify(["Iniciación", "Básico", "Intermedio"]), "carga los niveles en su orden", await nombres());
  ok(await page.$eval("#caja-niveles", (n) => n.checkVisibility()), "la sección se ve");
  ok(await page.$eval("[data-niveles-guardar]", (b) => b.disabled), "sin cambios, Guardar está apagado");
  ok(await page.$eval('label[for="nivel-nombre-0"]', (l) => l.textContent) === "Nombre del nivel 1", "cada campo tiene su etiqueta");

  await page.click('button[aria-label="Subir el nivel 3"]');
  ok(JSON.stringify(await nombres()) === JSON.stringify(["Iniciación", "Intermedio", "Básico"]), "subir cambia el orden", await nombres());
  ok(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label")) === "Subir el nivel 2", "y el foco sigue al nivel que se movió");
  await page.click('button[aria-label="Quitar el nivel 3"]');
  await page.click("[data-niveles-agregar]");
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === "nivel-nombre-2", "agregar lleva el foco al nombre nuevo");
  await page.click("[data-niveles-guardar]");
  ok(/El nivel 3 no tiene nombre/.test(await page.textContent("[data-niveles-estado]")), "uno sin nombre no se manda, y lo dice");
  ok((await page.evaluate(() => window.__rpc.length)) === 0, "(no se llamó a la base)");
  await page.fill("#nivel-nombre-2", "Competitivo <b>A</b>");
  await page.click("[data-niveles-guardar]");
  await page.waitForFunction(() => /^Listo/.test(document.querySelector("[data-niveles-estado]").textContent));
  const llamada = await page.evaluate(() => window.__rpc[0]);
  ok(llamada[0] === "set_niveles_academia" && llamada[1].p_academia === "a1"
     && JSON.stringify(llamada[1].p_niveles.map((x) => [x.id, x.nombre])) === JSON.stringify([["n1", "Iniciación"], ["n3", "Intermedio"], [null, "Competitivo <b>A</b>"]]),
     "Guardar manda la lista ENTERA, en orden, con los ids de los que ya estaban", llamada);
  ok(JSON.stringify(await nombres()) === JSON.stringify(["Iniciación", "Intermedio", "Competitivo <b>A</b>"]), "y pinta lo que devolvió la base");
  ok((await page.$$("[data-niveles-lista] b")).length === 0, "lo escrito por una persona va como texto, no como HTML");

  // Otra academia: montar de nuevo no duplica los guardados.
  await page.evaluate(() => Niveles.montarEditor({ caja: document.getElementById("caja-niveles"), academiaId: "a2" }));
  await page.waitForFunction(() => /Todavía no hay niveles/.test(document.querySelector("[data-niveles-lista]").textContent));
  await page.click("[data-niveles-agregar]");
  ok((await page.evaluate(() => ed.niveles().length)) === 3, "el editor de la academia anterior ya no se entera de los clics", await page.evaluate(() => ed.niveles().length));
  await page.fill("#nivel-nombre-0", "Peones");
  await page.click("[data-niveles-guardar]");
  await page.waitForFunction(() => window.__rpc.length >= 2);
  await page.waitForTimeout(100);
  const llamadas = await page.evaluate(() => window.__rpc.map((r) => r[1].p_academia));
  ok(JSON.stringify(llamadas) === JSON.stringify(["a1", "a2"]), "al abrir otra academia, Guardar guarda UNA vez y en la nueva", llamadas);

  console.log("La ficha del alumno:");
  await page.evaluate(() => { window.__rpc = []; });
  await page.evaluate(() => Niveles.montarFicha({ caja: document.getElementById("ficha"), alumnoId: "u-ana", puedeCambiar: true }));
  ok(await page.textContent("#ficha [data-nivel-actual]") === "Nivel: Iniciación · desde el 1 de septiembre de 2026", "dice el nivel y desde cuándo", await page.textContent("#ficha [data-nivel-actual]"));
  const opciones = await page.$$eval("#ficha select option", (os) => os.map((o) => o.textContent));
  ok(opciones[0] === "Sin nivel" && opciones.some((t) => /Torre · Iniciación/.test(t)) && opciones.some((t) => /Alfil · Peones/.test(t)), "ofrece los niveles, con la academia si hay más de una", opciones);
  ok(await page.$eval("#ficha select", (s) => !!document.querySelector('label[for="' + s.id + '"]')), "el selector tiene su etiqueta");
  await page.selectOption("#ficha select", "n3");
  await page.click("#ficha button");
  await page.waitForFunction(() => /Intermedio/.test(document.querySelector("#ficha [data-nivel-actual]").textContent));
  ok(JSON.stringify(await page.evaluate(() => window.__rpc[0])) === JSON.stringify(["poner_nivel_alumno", { p_alumno: "u-ana", p_nivel: "n3" }]), "cambiarlo llama a poner_nivel_alumno con su id");
  ok(/Listo: ahora va en «Intermedio»/.test(await page.textContent("#ficha")), "y lo dice");
  ok(await page.$eval("#ficha details", (d) => d.textContent.includes("Iniciación") && d.textContent.includes("Intermedio")), "con su historial");

  // El alumno mirando su propio informe: lo ve, sin cambiarlo.
  await page.evaluate(() => Niveles.montarFicha({ caja: document.getElementById("ficha"), alumnoId: "u-ana", puedeCambiar: false }));
  ok((await page.$$("#ficha select")).length === 0 && /Intermedio/.test(await page.textContent("#ficha")), "el alumno lo ve sin poder cambiarlo");
  // Sin nivel y sin poder cambiar: no ocupa lugar.
  await page.evaluate(() => Niveles.montarFicha({ caja: document.getElementById("ficha"), alumnoId: "u-otro", puedeCambiar: false }));
  ok(!(await page.$eval("#ficha", (n) => n.checkVisibility())), "sin nivel y sin poder ponerlo, no ocupa lugar");
  ok(errores.length === 0, "sin errores en la página", errores);
  await browser.close();
}

navegador().then(() => {
  if (fallos) { console.log("\n✗ " + fallos + " comprobación(es) fallaron."); process.exit(1); }
  console.log("\n✓ Todo bien.");
}).catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
