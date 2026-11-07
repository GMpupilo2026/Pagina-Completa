/* Verifica la Copa de naciones del Centroamericano 2026 (ver «La Copa de
 * naciones» en docs/decisiones/juegos-y-torneos.md):
 *   - los cinco primeros de cada categoría del Clásico dan 10, 8, 6, 4 y 2
 *     puntos a su país; el 6.° no da nada;
 *   - el empate se rompe con más primeros lugares, después más segundos…;
 *   - en el medallero sale el podio de los tres países (el 1.° en el medio)
 *     y la tabla de todos, con el puesto escrito;
 *   - en Rápidas o Blitz no se calcula: dice que cuenta solo el Clásico.
 *
 * Con el sitio servido (npm run verificar lo levanta solo):
 *   python3 -m http.server 8777
 *   node herramientas/verificar-centroamericano-copa.js
 */
"use strict";
const fs = require("fs");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + String(detalle).slice(0, 600) : "")); fallos++; }
}

// Dos categorías de seis jugadores. Sub-18 Absoluto: CRC, PAN, CRC, JAM, GUA, CUB.
// Sub-18 Femenino: PAN, CRC, JAM, PAN, CUB, CRC.
//   CRC: 10 + 6 + 8 = 24 (el 6.° del femenino no suma)  ·  PAN: 8 + 10 + 4 = 22
//   JAM: 4 + 6 = 10  ·  CUB: 2 (el 6.° del absoluto no suma)  ·  GUA: 2
// CUB y GUA empatan en 2 con un 5.° lugar cada uno: van en orden de código.
const j = (no, fed, grupo) => ({ puesto: no, no, titulo: "", nombre: "Jugador " + fed + " " + no, fed, elo: 1800, grupo, puntos: "3" });
const DATOS = { modalidad: "clasico", modalidades: ["clasico", "rapidas"], torneos: [
  { tnr: "1", texto: "Sub-18 Absoluto", url: "x", leido_en: "2026-11-07T15:00:00Z", ronda: 7, rondas: 9,
    jugadores: ["CRC", "PAN", "CRC", "JAM", "GUA", "CUB"].map((f, i) => j(i + 1, f, "U18")), pareo: { ronda: 7, mesas: [] } },
  { tnr: "2", texto: "Sub-18 Femenino", url: "x", leido_en: "2026-11-07T15:00:00Z", ronda: 7, rondas: 9,
    jugadores: ["PAN", "CRC", "JAM", "PAN", "CUB", "CRC"].map((f, i) => j(i + 1, f, "U18F")), pareo: { ronda: 7, mesas: [] } }] };

async function abrir(nav, modalidad) {
  const ctx = await nav.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: "block" });
  await ctx.route(/supabase\.co|lichess\.org|chess-results\.com/, (r) => r.abort());
  await ctx.addInitScript(({ d, m }) => {
    try { localStorage.setItem("cac_modalidad_v1", JSON.stringify(m)); } catch (e) { /* sin lugar */ }
    window.sb = { functions: { invoke: async (n, op) => ({ data: Object.assign({}, d, { modalidad: (op.body && op.body.modalidad) || "clasico" }), error: null }) } };
  }, { d: DATOS, m: modalidad });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(BASE + "/centroamericano-2026.html#medallero", { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelector("#medallero[open] .cac-copa"), null, { timeout: 10000 }).catch(() => {});
  return { ctx, p, errores };
}

(async () => {
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    console.log("La cuenta");
    const { ctx, p, errores } = await abrir(nav, "clasico");
    const c = await p.evaluate(() => {
      const V = window.CentroamericanoVivo;
      const grupos = {};
      V.datos().torneos.forEach((t) => t.jugadores.forEach((x) => (grupos[x.grupo] = grupos[x.grupo] || []).push(x)));
      // Desempate: QQQ y BBB con 18 puntos, QQQ con un 1.° y un 2.°, BBB con tres 3.°
      // (QQQ va después por código: si gana, es por el desempate).
      const g = (feds) => feds.map((fed, i) => ({ puesto: i + 1, fed }));
      const empate = V.copaDeNaciones({ A: g(["QQQ", "XXX", "BBB"]), B: g(["YYY", "QQQ", "BBB"]), C: g(["ZZZ", "WWW", "BBB"]) });
      return { tabla: V.copaDeNaciones(grupos).map((x) => [x.fed, x.puntos, x.lugares.join("")]), empate: empate.map((x) => [x.fed, x.puntos]) };
    });
    ok("cada país suma 10, 8, 6, 4 y 2 por los cinco primeros de cada categoría; el 6.° no suma",
      JSON.stringify(c.tabla) === JSON.stringify([["CRC", 24, "11100"], ["PAN", 22, "11010"], ["JAM", 10, "00110"], ["CUB", 2, "00001"], ["GUA", 2, "00001"]]), JSON.stringify(c.tabla));
    ok("con los mismos puntos va primero el que tiene más primeros lugares", JSON.stringify(c.empate) === JSON.stringify([["QQQ", 18], ["BBB", 18], ["YYY", 10], ["ZZZ", 10], ["WWW", 8], ["XXX", 8]]), JSON.stringify(c.empate));

    console.log("El medallero, en el Clásico");
    const m = await p.evaluate(() => {
      const s = document.querySelector(".cac-copa");
      const podio = [...s.querySelectorAll(".cac-copa-podio li")];
      return { titulo: s.querySelector("h3").textContent, se: s.checkVisibility(),
        podio: podio.map((li) => [li.value, li.querySelector(".cac-copa-fed").textContent, li.querySelector(".cac-copa-puntos").textContent, li.querySelector(".cac-copa-lugar").textContent]),
        alturas: podio.map((li) => Math.round(li.getBoundingClientRect().height)),
        filas: [...s.querySelectorAll(".cac-copa-tabla tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()),
        antesDeMedallas: s.compareDocumentPosition([...document.querySelectorAll("#medallero-contenido h3")].find((h) => /Medallas/.test(h.textContent))) === Node.DOCUMENT_POSITION_FOLLOWING };
    });
    ok("la Copa de naciones sale en el medallero, antes de las medallas", m.se && /Copa de naciones/.test(m.titulo) && m.antesDeMedallas, JSON.stringify(m));
    ok("el podio: el 2.° a la izquierda, el 1.° en el medio y el 3.° a la derecha, con su nombre, sus puntos y el puesto escrito",
      JSON.stringify(m.podio) === JSON.stringify([[2, "Panamá (PAN)", "22 puntos", "2.º lugar"], [1, "Costa Rica (CRC)", "24 puntos", "1.er lugar"], [3, "Jamaica (JAM)", "10 puntos", "3.er lugar"]]), JSON.stringify(m.podio));
    ok("y el 1.° más alto que el 2.°, y el 2.° más que el 3.°", m.alturas[1] > m.alturas[0] && m.alturas[0] > m.alturas[2], JSON.stringify(m.alturas));
    ok("la tabla de todos los países, con cuántos lugares tiene cada uno", m.filas.length === 5 && m.filas[0] === "1 Costa Rica (CRC) 1 1 1 0 0 24" && m.filas[4] === "5 Guatemala (GUA) 0 0 0 0 1 2", JSON.stringify(m.filas));
    ok("sin errores en la página", !errores.length, errores.join(" | "));
    await ctx.close();

    console.log("En Rápidas");
    const r = await abrir(nav, "rapidas");
    const rap = await r.p.evaluate(() => { const s = document.querySelector(".cac-copa"); return s ? { texto: s.innerText, podio: s.querySelectorAll(".cac-copa-podio li").length } : null; });
    ok("en Rápidas no se calcula: dice que la Copa cuenta solo el Clásico", rap && rap.podio === 0 && /cuenta solo el Clásico/.test(rap.texto), JSON.stringify(rap));
    await r.ctx.close();

    console.log("En inglés");
    const en = await nav.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: "block" });
    await en.route(/supabase\.co|lichess\.org|chess-results\.com/, (x) => x.abort());
    await en.addInitScript((d) => { window.sb = { functions: { invoke: async () => ({ data: d, error: null }) } }; }, DATOS);
    const pe = await en.newPage();
    await pe.goto(BASE + "/centroamericano-2026.html?lang=en#medallero", { waitUntil: "load" });
    await pe.waitForFunction(() => document.querySelector("#medallero[open] .cac-copa-podio li"), null, { timeout: 10000 }).catch(() => {});
    const ing = await pe.evaluate(() => { const s = document.querySelector(".cac-copa"); return s && [s.querySelector("h3").textContent, s.querySelector(".cac-copa-1 .cac-copa-puntos").textContent]; });
    ok("en inglés: «Nations Cup» y «24 points»", ing && /Nations Cup/.test(ing[0]) && ing[1] === "24 points", JSON.stringify(ing));
    await en.close();
  } finally {
    await nav.close();
  }
  if (fallos) { console.log("\n✗ " + fallos + (fallos === 1 ? " comprobación falló." : " comprobaciones fallaron.")); process.exit(1); }
  console.log("\n✓ La Copa de naciones está bien.");
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
