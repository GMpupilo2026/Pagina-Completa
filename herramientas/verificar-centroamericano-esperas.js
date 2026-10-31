/* «Mientras esperas» en la página del Centroamericano 2026 y el modo invitado
 * de Batalla naval y «Aprende a jugar» (js/invitado-centroamericano.js).
 *
 * Lo que se rompe acá no da error: un enlace que manda al login a un niño sin
 * cuenta, o el modo invitado que queda abierto para siempre y regala la
 * Academia. Se comprueba:
 *
 *   1. LA PÁGINA: la ficha abre la ventana con sus seis juegos; los dos de la
 *      Academia llevan `?invitado=centroamericano`, los demás son páginas
 *      públicas (sin la guardia de sesión), y cada uno se abre encima.
 *   2. EL MODO INVITADO, sin sesión y con el reloj del navegador puesto:
 *      durante el festival las dos páginas abren con su aviso; sin el
 *      `?invitado` o fuera de las fechas, mandan al login como siempre.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-centroamericano-esperas.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { fallos++; console.log("  ✗ " + nombre + (detalle ? " — " + String(detalle).slice(0, 500) : "")); }
}

// Las páginas de la Academia y las que van sin guardia, del generador.
const gen = fs.readFileSync(path.join(__dirname, "academia-cabecera.py"), "utf8");
const lista = (nombre) => { const m = gen.match(new RegExp(nombre + " = [\\[{]([\\s\\S]*?)[\\]}]")); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []; };
const ACADEMIA = new Set(lista("PAGINAS"));
const SIN_GUARDIA = new Set(lista("SIN_GUARDIA"));
const DE_LA_ACADEMIA = ["batalla-naval.html", "entreno/aprende-a-jugar.html"];

console.log("1. La página");
const html = fs.readFileSync(path.join(RAIZ, "centroamericano-2026.html"), "utf8");
const dialogo = (html.match(/<dialog id="esperas"[\s\S]*?<\/dialog>/) || [""])[0];
const tarjetas = [...dialogo.matchAll(/<a href="([^"]+)"([^>]*)class="cac-espera">/g)].map((m) => ({ href: m[1], ventana: /data-ventana="/.test(m[2]) }));
ok("la ventana trae seis juegos: Aprende a jugar, Confites, Batalla naval, Buscaminas, el estilo y los ejercicios de la ronda",
   JSON.stringify(tarjetas.map((t) => t.href.replace(/\?.*$/, ""))) === JSON.stringify(["entreno/aprende-a-jugar.html", "confites.html", "batalla-naval.html", "buscaminas.html", "estilo-muestra.html", "#ejercicios"]), JSON.stringify(tarjetas));
ok("cada juego existe y se abre encima de la página", tarjetas.filter((t) => t.href[0] !== "#").every((t) => t.ventana && fs.existsSync(path.join(RAIZ, t.href.replace(/\?.*$/, "")))));
ok("los dos de la Academia van como invitado; los demás son públicos",
   tarjetas.every((t) => { const f = t.href.replace(/\?.*$/, ""); if (t.href[0] === "#") return true;
     return DE_LA_ACADEMIA.includes(f) ? /\?invitado=centroamericano$/.test(t.href) && ACADEMIA.has(f) : !ACADEMIA.has(f) && !/\?/.test(t.href); }));
ok("y esos dos no llevan la guardia de sesión (decide su script)", DE_LA_ACADEMIA.every((f) => SIN_GUARDIA.has(f) && !fs.readFileSync(path.join(RAIZ, f), "utf8").includes("guardia: inicio")));
ok("la ficha y la línea de «Hoy en el torneo» llevan a la ventana", /id="ficha-esperas"[^>]*/.test(html) && /<a href="#esperas" id="ficha-esperas"/.test(html) && /id="hoy-ejercicios"[\s\S]{0,400}href="#esperas"/.test(html));

(async () => {
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    // Una pestaña sin sesión y con el reloj en `cuando` (hora de Costa Rica).
    async function pestana(cuando) {
      const ctx = await nav.newContext({ viewport: { width: 430, height: 900 }, serviceWorkers: "block" });
      const p = await ctx.newPage();
      p.errores = [];
      p.on("pageerror", (e) => p.errores.push(e.message));
      await p.route(/supabase\.co|lichess\.org|chess-results/, (r) => r.abort());
      if (cuando) await p.clock.install({ time: new Date(cuando) });
      return p;
    }
    async function abrir(p, ruta) {
      await p.goto(BASE + "/" + ruta, { waitUntil: "load" }).catch(() => {});
      await p.waitForTimeout(1500);
      return { url: p.url(), app: await p.evaluate(() => { const a = document.getElementById("app"); return !!a && a.checkVisibility(); }).catch(() => false),
        franja: await p.evaluate(() => { const f = document.getElementById("franja-invitado"); return f && f.checkVisibility() ? f.textContent : ""; }).catch(() => "") };
    }

    // La ventana de la página, con el clic de verdad.
    const p0 = await pestana("2026-11-03T15:00:00-06:00");
    await p0.goto(BASE + "/centroamericano-2026.html", { waitUntil: "load" });
    await p0.click("#ficha-esperas");
    await p0.waitForTimeout(300);
    const v = await p0.evaluate(() => { const d = document.getElementById("esperas"); return { abierta: d.open, ve: [...d.querySelectorAll(".cac-espera")].filter((a) => a.checkVisibility()).length }; });
    ok("la ficha abre «Mientras esperas» con los seis juegos a la vista", v.abierta && v.ve === 6, JSON.stringify(v));
    await p0.click('#esperas a[href^="batalla-naval.html"]');
    await p0.waitForSelector("dialog.ventana-enlace iframe", { timeout: 5000 }).catch(() => {});
    const marco = await p0.evaluate(() => { const f = document.querySelector("dialog.ventana-enlace[open] iframe"); return f ? f.getAttribute("src") : ""; });
    ok("Batalla naval se abre encima, como invitado", /batalla-naval\.html\?invitado=centroamericano$/.test(marco), marco);
    await p0.context().close();

    console.log("2. El modo invitado");
    for (const ruta of DE_LA_ACADEMIA) {
      const nombre = ruta.includes("batalla") ? "Batalla naval" : "«Aprende a jugar»";
      const p1 = await pestana("2026-11-03T15:00:00-06:00");
      const r1 = await abrir(p1, ruta + "?invitado=centroamericano");
      ok(nombre + ": durante el festival abre sin cuenta, con el aviso de que el progreso queda en el celular",
         r1.app && !/login\.html/.test(r1.url) && /Juegas como invitado del Centroamericano 2026/.test(r1.franja) && /Volver al Centroamericano/.test(r1.franja), JSON.stringify(r1));
      ok(nombre + ": sin errores en la página", !p1.errores.length, p1.errores.join(" | "));
      await p1.context().close();

      const p2 = await pestana("2026-11-03T15:00:00-06:00");
      const r2 = await abrir(p2, ruta);
      ok(nombre + ": sin el ?invitado, pide cuenta como siempre", /login\.html/.test(r2.url) && !r2.franja, JSON.stringify(r2));
      await p2.context().close();

      const p3 = await pestana("2026-11-10T09:00:00-06:00");
      const r3 = await abrir(p3, ruta + "?invitado=centroamericano");
      ok(nombre + ": pasado el festival (10 de noviembre), el ?invitado ya no abre nada", /login\.html/.test(r3.url) && !r3.franja, JSON.stringify(r3));
      await p3.context().close();

      const p4 = await pestana("2026-10-31T23:30:00-06:00");
      const r4 = await abrir(p4, ruta + "?invitado=centroamericano");
      ok(nombre + ": antes del festival tampoco (31 de octubre, 11:30 p. m. en Costa Rica, ya 1.º en UTC)", /login\.html/.test(r4.url), JSON.stringify(r4));
      await p4.context().close();
    }
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
