/* Verifica la logística de la sala (ver «La logística de la sala: medidas,
 * borrador y material» en docs/decisiones/juegos-y-torneos.md):
 *   - la cuenta (js/plano-logistica.js): cuántas mesas caben por fila y cuántas
 *     filas, el borrador que parte las filas donde se acaba el ancho, las mesas
 *     de los jugadores con discapacidad visual al final y sin marca, si el plano
 *     cabe y el material que hay que llevar;
 *   - la organización (centroamericano-mesas.html, «Plano de la sala»): con las
 *     medidas, el borrador sale partido, abajo dice si cabe y el material, y
 *     las medidas se guardan con el plano; sin tocarlas, el plano se guarda
 *     como antes;
 *   - la página pública no muestra nada de esto.
 *
 * Con el sitio servido (npm run verificar lo levanta solo):
 *   python3 -m http.server 8777
 *   node herramientas/verificar-plano-logistica.js
 */
"use strict";
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { dobleOrganizacion } = require("./lib/doble-centroamericano-organizacion");
const L = require("../js/plano-logistica.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + String(detalle).slice(0, 600) : "")); fallos++; }
}

/* ---------------- la cuenta ---------------- */
console.log("La cuenta (js/plano-logistica.js)");
// Un salón de 25 × 45 m con la mesa de la casa (180 × 74 cm).
const SALON = { largo: 45, ancho: 25, dv: { Absoluto: 2, Femenino: 1 } };
const c = L.capacidad(SALON);
// Ancho útil 22 m: 5 mesas (9 m) + pasillo 1,5 + 5 mesas = 19,5; la tercera no entra.
// Fondo útil 45 − 3 − 4 = 38 m; cada fila 0,74 + 1,2 de sillas + 1 de pasillo.
ok("en 25 × 45 m caben dos tramos de 5 mesas por fila y 13 filas", JSON.stringify(c.tramos) === "[5,5]" && c.filas === 13 && c.mesas === 130, JSON.stringify(c));
ok("sin medidas del salón no hay capacidad", L.capacidad({}) === null);
ok("un tramo que no se llena queda con lo que alcanza", JSON.stringify(L.capacidad({ largo: 20, ancho: 10 }).tramos) === "[3]");

const TORNEOS = [{ torneo: "Absoluto", tableros: 80, dv: 2 }, { torneo: "Sub-16", tableros: 42 }, { torneo: "Sub-12", tableros: 48 }, { torneo: "Femenino", tableros: 19, dv: 1 }];
const b = L.borrador(TORNEOS, SALON);
const forma = b.plano.filas.map((f) => f.grupos.map((g) => g.torneo[0] + g.mesas.length).join(","));
ok("el borrador parte las filas en el ancho y cada torneo empieza en fila nueva", JSON.stringify(forma) === JSON.stringify(["A5,A5", "A5,A5", "A5,A5", "A5,A5", "A1", "S5,S5", "S5,S5", "S1", "S5,S5", "S5,S5", "S4", "F5,F5"]), JSON.stringify(forma));
const abs = b.plano.filas.slice(0, 5).flatMap((f) => f.grupos.flatMap((g) => g.mesas));
ok("las 78 partidas normales van de a dos y las 2 de discapacidad visual al final, una por mesa", JSON.stringify(abs.slice(0, 2).map((m) => m.t)) === "[[1,2],[3,4]]" && JSON.stringify(abs.slice(-3).map((m) => m.t)) === "[[77,78],[79,null],[80,null]]", JSON.stringify(abs.slice(-3)));
ok("ninguna mesa lleva una marca de discapacidad visual (el plano es público)", b.plano.filas.every((f) => f.grupos.every((g) => g.mesas.every((m) => Object.keys(m).sort().join() === "duda,t"))));
ok("todo el borrador sale con duda, para revisarlo en la sala", b.plano.filas.every((f) => f.grupos.every((g) => g.mesas.every((m) => m.duda))) && b.sobran === 0);
const sinSeparar = L.borrador([{ torneo: "A", tableros: 12 }, { torneo: "B", tableros: 6 }], { largo: 45, ancho: 25, separar: false });
ok("sin fila nueva por torneo, el siguiente empieza en el tramo siguiente", JSON.stringify(sinSeparar.plano.filas.map((f) => f.grupos.map((g) => g.torneo + g.mesas.length))) === '[["A5","A1"],["B3"]]', JSON.stringify(sinSeparar.plano.filas));
const chico = L.borrador([{ torneo: "A", tableros: 80 }], { largo: 10, ancho: 25 });
ok("si no cabe, el borrador dice cuántas mesas quedan afuera", chico.sobran === 30 && chico.capacidad.filas === 1, JSON.stringify({ sobran: chico.sobran, filas: chico.capacidad.filas }));
ok("si a lo ancho no cabe ni una mesa, no hay borrador", L.borrador(TORNEOS, { largo: 45, ancho: 3 }) === null);

const m = L.medir(b.plano, SALON);
ok("el plano cabe: 19,5 m de 22 de ancho, 34,28 m de 38 de fondo, 96 de 130 mesas", m.cabe && m.anchoMax === 19.5 && m.fondo === 34.28 && m.mesas === 96 && m.ocupacion === 74, JSON.stringify(m));
const ancho = JSON.parse(JSON.stringify(b.plano));
ancho.filas[0].grupos[0].mesas.push({ t: [null, null] }, { t: [null, null] });
ancho.filas[0].grupos.push({ torneo: "Absoluto", mesas: [{ t: [null, null] }] });
const ma = L.medir(ancho, SALON);
ok("una fila corregida a mano que se sale por los lados se nota", !ma.cabe && JSON.stringify(ma.filasAnchas) === "[1]", JSON.stringify(ma));
ok("con más filas de las que caben, no cabe", !L.medir(b.plano, { largo: 30, ancho: 25 }).cabe);

const inv = L.inventario(b.plano, SALON);
ok("189 partidas en 96 mesas, 3 con discapacidad visual", inv.partidas === 189 && inv.mesas === 96 && inv.mesasDv === 3, JSON.stringify(inv));
ok("tableros, piezas y relojes con 10 % de reserva (208, 208, 205)", inv.tableros === 208 && inv.piezas === 208 && inv.relojes === 205, JSON.stringify(inv));
ok("tableros adaptados y relojes parlantes (4 y 4)", inv.adaptados === 4 && inv.parlantes === 4, JSON.stringify(inv));
ok("planillas: 189 partidas × 7 rondas + 10 % = 1456", inv.planillas === 1456, inv.planillas);
ok("11 árbitros: principal, adjunto y 9 de sector (uno cada 25 partidas por torneo)", inv.arbitros.total === 11 && inv.arbitros.sector === 9 && inv.arbitros.adjunto === 1, JSON.stringify(inv.arbitros));
ok("sillas: dos por partida, más árbitros y las de más (378 + 11 + 10)", inv.sillas === 399, inv.sillas);
ok("medidas raras se limpian (negativas, texto, de más)", JSON.stringify(L.limpiarSalon({ largo: -3, ancho: "x", mesasPorTramo: 2.6, otro: 1, dv: { A: "2", B: 0 } })) === JSON.stringify({ ...L.limpiarSalon({}), mesasPorTramo: 3, dv: { A: 2 } }));

/* ---------------- la organización ---------------- */
(async () => {
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    console.log("La organización (centroamericano-mesas.html, «Plano de la sala»)");
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
    await ctx.route("**/js/supabase-client.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: dobleOrganizacion(true) }));
    await ctx.route("**/js/vendor/supabase.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|lichess\.org/, (rr) => rr.abort());
    const q = await ctx.newPage();
    const errs = [];
    q.on("pageerror", (e) => errs.push(e.message));
    await q.goto(BASE + "/centroamericano-mesas.html#plano", { waitUntil: "load" });
    await q.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 8000 }).catch(() => {});
    await q.click("#pest-plano");
    await q.waitForFunction(() => window.CentroamericanoPlanoEditor.estado().listo, null, { timeout: 5000 }).catch(() => {});
    ok("sin plano, la sección del material dice qué falta", await q.evaluate(() => document.getElementById("pl-logistica").checkVisibility() && /Cuando haya plano/.test(document.getElementById("pl-log-contenido").textContent)));
    await q.click("#pl-salon-caja summary");
    const dvCampos = await q.evaluate(() => [...document.querySelectorAll("#pl-s-dv [data-torneo]")].map((c) => c.dataset.torneo));
    ok("un campo de discapacidad visual por torneo de la sala", dvCampos.length >= 3 && dvCampos.indexOf("Sub-16 Femenino") !== -1, JSON.stringify(dvCampos));
    // Un salón angosto (10 m: 3 mesas por fila) y corto (20 m: 4 filas).
    await q.fill("#pl-s-ancho", "10");
    await q.fill("#pl-s-largo", "20");
    await q.fill('#pl-s-dv [data-torneo="Sub-16 Femenino"]', "1");
    await q.check("#pl-s-usar");
    await q.click("#pl-borrador");
    await q.waitForFunction(() => document.querySelector("#pl-dibujo .cac-plano-svg"), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(300);
    const r1 = await q.evaluate(() => {
      const e = window.CentroamericanoPlanoEditor.estado();
      return { filas: e.plano.filas.map((f) => f.grupos.map((g) => g.torneo + ":" + g.mesas.length).join(",")), salon: e.plano.salon,
        cabe: document.getElementById("pl-log-cabe").dataset.cabe, texto: document.getElementById("pl-log-cabe").textContent,
        avisos: [...document.querySelectorAll("[role=alert], [role=status]")].map((x) => x.textContent).join(" | "),
        visible: document.getElementById("pl-log-cabe").checkVisibility() };
    });
    ok("con las medidas, el borrador parte las filas en 3 mesas", JSON.stringify(r1.filas) === JSON.stringify(["Sub-18 Femenino:3", "Sub-18 Absoluto:3", "Sub-18 Absoluto:3", "Sub-18 Absoluto:3", "Sub-18 Absoluto:1", "Sub-16 Femenino:3", "Sub-16 Femenino:2"]), JSON.stringify(r1.filas));
    ok("y dice que no cabe, por el fondo, con cuántas filas caben", r1.visible && r1.cabe === "no" && /caben 4 filas/.test(r1.texto), r1.texto);
    ok("al armarlo avisa que quedan mesas afuera", /quedan en filas que ya no caben/.test(r1.avisos), r1.avisos);
    ok("las medidas viajan con el plano", r1.salon && r1.salon.ancho === 10 && r1.salon.usar === true && r1.salon.dv["Sub-16 Femenino"] === 1, JSON.stringify(r1.salon));
    // Más largo: ahora cabe, y el material se recalcula sin volver a armar.
    await q.fill("#pl-s-largo", "40");
    await q.waitForTimeout(200);
    const r2 = await q.evaluate(() => ({ cabe: document.getElementById("pl-log-cabe").dataset.cabe, texto: document.getElementById("pl-log-cabe").textContent,
      material: [...document.querySelectorAll("#pl-log-material tbody tr")].map((tr) => tr.textContent),
      arbitros: [...document.querySelectorAll("#pl-log-arbitros tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent).join("|")),
      equipo: document.getElementById("pl-log-equipo").textContent }));
    ok("con 40 m de largo ya cabe, sin volver a armar el borrador", r2.cabe === "si" && /✓ Cabe en el salón/.test(r2.texto), r2.texto);
    // 6 + 19 + 9 tableros = 34 partidas (el borrador: 3 + 10 + 5 = 18 mesas).
    ok("el material sale del plano: 18 mesas, 38 tableros (34 + 10 %), el adaptado y el reloj parlante (1 + reserva)", r2.material.indexOf("Mesas de juego (180 × 74 cm)18") !== -1 && r2.material.indexOf("Tableros38") !== -1 && r2.material.indexOf("Tableros adaptados2") !== -1 && r2.material.indexOf("Relojes parlantes2") !== -1, JSON.stringify(r2.material));
    ok("los árbitros por torneo, con la mesa de discapacidad visual", r2.arbitros.indexOf("Sub-16 Femenino|9|5|1|1") !== -1, JSON.stringify(r2.arbitros));
    ok("y el equipo arbitral completo", /Equipo arbitral: 5 árbitros \(principal, adjunto y 3 de sector/.test(r2.equipo), r2.equipo);
    // Guardar: las medidas se guardan con el plano.
    await q.click("#pl-guardar");
    await q.waitForFunction(() => (window.__planos || []).length > 0, null, { timeout: 5000 }).catch(() => {});
    const g = await q.evaluate(() => (window.__planos || []).slice(-1)[0]);
    ok("«Guardar el plano» manda las medidas en plano.salon", g && g.salon && g.salon.largo === 40 && g.salon.ancho === 10 && g.salon.dv["Sub-16 Femenino"] === 1, JSON.stringify(g && g.salon));
    ok("y ninguna mesa guardada dice cuál es de discapacidad visual", g && g.filas.every((f) => f.grupos.every((gr) => gr.mesas.every((mm) => !("dv" in mm)))));
    ok("sin errores en la página", !errs.length, errs.join(" | "));
    await ctx.close();

    // Al volver a abrir, los campos traen lo guardado.
    const ctx2 = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });
    const conPlano = dobleOrganizacion(true).replace('salas_torneo: [{ clave: "centroamericano-2026", plano: null', 'salas_torneo: [{ clave: "centroamericano-2026", plano: ' + JSON.stringify(g));
    ok("(el doble trae el plano guardado)", conPlano.indexOf('"salon"') !== -1);
    await ctx2.route("**/js/supabase-client.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: conPlano }));
    await ctx2.route("**/js/vendor/supabase.js", (rr) => rr.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx2.route(/supabase\.co|sentry|googletagmanager|lichess\.org/, (rr) => rr.abort());
    const q2 = await ctx2.newPage();
    await q2.goto(BASE + "/centroamericano-mesas.html#plano", { waitUntil: "load" });
    await q2.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 8000 }).catch(() => {});
    await q2.click("#pest-plano");
    await q2.waitForFunction(() => window.CentroamericanoPlanoEditor.estado().listo, null, { timeout: 5000 }).catch(() => {});
    const r3 = await q2.evaluate(() => ({ abierta: document.getElementById("pl-salon-caja").open, largo: document.getElementById("pl-s-largo").value, usar: document.getElementById("pl-s-usar").checked,
      dv: document.querySelector('#pl-s-dv [data-torneo="Sub-16 Femenino"]').value, cambios: window.CentroamericanoPlanoEditor.estado().hayCambios, cabe: (document.getElementById("pl-log-cabe") || {}).textContent }));
    ok("al volver, las medidas guardadas están en sus campos y no cuentan como cambio", r3.abierta && r3.largo === "40" && r3.usar && r3.dv === "1" && !r3.cambios && /Cabe en el salón/.test(r3.cabe), JSON.stringify(r3));
    await ctx2.close();
  } finally {
    await nav.close();
  }
  if (fallos) { console.log("\n✗ " + fallos + (fallos === 1 ? " comprobación falló." : " comprobaciones fallaron.")); process.exit(1); }
  console.log("\n✓ La logística de la sala está bien.");
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
