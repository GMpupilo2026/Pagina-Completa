/* La página del Centroamericano 2026 (centroamericano-2026.html).
 *
 * Lo que se rompe acá no da error: una ficha que se ve linda y no lleva a
 * ningún lado, una apagada que no se alcanza con Tab, un teléfono de hotel
 * copiado de un directorio que no es del hotel o una ronda que se cae del
 * calendario. Dos partes:
 *
 *   1. EL HTML, leído: el PDF de las bases existe, cada ficha tiene enlace o va
 *      apagada (sin href, tabindex="0", aria-disabled), lo que abre otra
 *      pestaña lleva rel="noopener", el calendario trae las nueve rondas y
 *      ningún tel: sale de la lista de teléfonos confirmados.
 *   2. LA PÁGINA, en un navegador: las fichas se ven y en un celular no hay
 *      scroll de costado.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-centroamericano.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PAGINA = "centroamericano-2026.html";
const html = fs.readFileSync(path.join(RAIZ, PAGINA), "utf8");

// Los teléfonos que se confirmaron (ver «La página del Centroamericano 2026»).
// Uno nuevo se agrega acá solo después de confirmarlo.
const TELEFONOS = ["+50622321266", "+50621065100", "+50622961001",
  // Los de «Contacta a la organización», que dio el dueño.
  "+50689604707", "+50688200156", "+50661298565"];

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { fallos++; console.log("  ✗ " + nombre + (detalle ? " — " + detalle : "")); }
}

console.log("1. El HTML");
ok("el PDF de las bases existe", fs.existsSync(path.join(RAIZ, "documentos/centroamericano-2026/bases-cac-2026.pdf")));

const fichas = (html.match(/<section id="fichas"[\s\S]*?<\/section>/) || [""])[0];
const items = fichas.match(/<li>[\s\S]*?<\/li>/g) || [];
ok("hay fichas", items.length >= 5, items.length + " fichas");
for (const li of items) {
  const titulo = (li.match(/font-bold text-lg[^>]*>([^<]+)</) || [, "?"])[1];
  const enlace = /<a href="[^"#][^"]*"|<a href="#[a-z]/.test(li);
  const apagada = /tabindex="0"/.test(li) && /aria-disabled="true"/.test(li) && !/href=/.test(li) && /Pronto/.test(li);
  ok("ficha «" + titulo + "»: con enlace o apagada", enlace || apagada);
}
for (const [, destino] of html.matchAll(/href="#([a-z-]+)"/g)) {
  ok("el ancla #" + destino + " existe", html.includes('id="' + destino + '"'));
}
const blancos = [...html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
ok("lo que abre otra pestaña lleva rel=noopener", blancos.every((a) => /rel="noopener"/.test(a)),
   blancos.filter((a) => !/rel="noopener"/.test(a)).join(" "));
for (let r = 1; r <= 9; r++) ok("el calendario tiene la ronda " + r, html.includes(">Ronda " + r + "</th>"));
const tels = [...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);
ok("ningún teléfono sin confirmar", tels.every((t) => TELEFONOS.includes(t)), tels.filter((t) => !TELEFONOS.includes(t)).join(", "));
const contacto = (html.match(/<dialog id="contacto"[\s\S]*?<\/dialog>/) || [""])[0];
// Toda la información va en fichas: cada ventana de la página tiene su ficha y su «Cerrar».
const dialogos = [...html.matchAll(/<dialog id="([a-z-]+)" class="ficha-dialogo[^"]*" aria-labelledby="\1-titulo">([\s\S]*?)<\/dialog>/g)];
ok("el reglamento, el calendario, los hoteles y los contactos van en ventanas", JSON.stringify(dialogos.map((m) => m[1]).sort()) === JSON.stringify(["calendario", "contacto", "hoteles", "reglamento"]), dialogos.map((m) => m[1]).join(", "));
for (const [, id, cuerpo] of dialogos) {
  ok("la ventana «" + id + "» tiene su ficha", fichas.includes('href="#' + id + '"'));
  ok("y su título y su botón «Cerrar»", cuerpo.includes('id="' + id + '-titulo"') && /data-cerrar[^>]*>Cerrar</.test(cuerpo));
}
ok("no queda información desplegada fuera de las fichas", !/<section id="(contacto|reglamento|calendario|hoteles)"/.test(html));
const personas = [...contacto.matchAll(/<h3[^>]*>([^<]+)<\/h3>\s*<p[^>]*>([^<]+)<\/p>/g)].map((m) => m[1] + " — " + m[2]);
ok("Contacta a la organización: árbitra principal, organizadora y árbitro de pareo", JSON.stringify(personas) === JSON.stringify(["Carolina Muñoz — Árbitra principal", "Vivian Víquez Miranda — Organizadora", "Jean Quesada — Árbitro de pareo"]), JSON.stringify(personas));
const fotos = [...contacto.matchAll(/<img src="([^"]+)"[^>]*alt="Foto de ([^"]+)"/g)];
ok("las fotos de Carolina y Vivian están en el sitio", fotos.length >= 2 && fotos.every(([, src]) => fs.existsSync(path.join(RAIZ, src))), fotos.map((f) => f[1]).join(", "));
ok("cada contacto con su teléfono y su WhatsApp", (contacto.match(/href="tel:/g) || []).length === 3 && (contacto.match(/href="https:\/\/wa\.me\/506\d{8}"/g) || []).length === 3);
ok("la reserva con la organización está avisada", /penalidad de 200 USD/.test(html));

// Lo que se abre en la ventana (js/ventana-enlace.js) tiene que estar en
// frame-src: si no, la ventana sale en blanco sin dar ningún error.
const frameSrc = ((fs.readFileSync(path.join(RAIZ, "_headers"), "utf8").match(/frame-src ([^;]+)/) || [])[1] || "").split(/\s+/);
const permitido = (u) => frameSrc.some((f) => {
  if (f === "'self'") return !/^https?:/.test(u);
  const m = f.match(/^https:\/\/(\*\.)?(.+)$/);
  if (!m || !/^https:/.test(u)) return false;
  const host = new URL(u).hostname;
  return m[1] ? host.endsWith("." + m[2]) : host === m[2];
});
const ventanas = [...html.matchAll(/<a href="([^"]+)"[^>]*data-ventana="([^"]+)"/g)].map((m) => [m[1].replace(/&amp;/g, "&"), m[2]]);
ok("las bases, el bye y los resultados se abren en la ventana", ["Bases del campeonato", "Pedir un bye", "Resultados en vivo"].every((t) => ventanas.some(([, v]) => v === t)), JSON.stringify(ventanas));
for (const [u, t] of ventanas) ok("«" + t + "» está permitido en frame-src", permitido(u), u);
ok("la página carga js/ventana-enlace.js", html.includes('<script src="js/ventana-enlace.js"></script>'));

(async () => {
  console.log("2. La página en un navegador");
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    const ctx = await nav.newContext({ viewport: { width: 375, height: 800 }, serviceWorkers: "block" });
    const p = await ctx.newPage();
    await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    const vistas = await p.$$eval("#fichas li", (ls) => ls.filter((l) => l.checkVisibility()).length);
    ok("las fichas se ven", vistas === items.length, vistas + " de " + items.length);
    const ancho = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok("en el celular no hay scroll de costado", ancho <= 0, ancho + " px de más");
    await p.keyboard.press("Tab");
    let alcanzada = false;
    for (let i = 0; i < 40 && !alcanzada; i++) {
      alcanzada = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-disabled") === "true");
      if (!alcanzada) await p.keyboard.press("Tab");
    }
    ok("una ficha apagada se alcanza con Tab", alcanzada);

    await p.click('#fichas a[href="#contacto"]');
    await p.waitForFunction(() => [...document.querySelectorAll("#contacto img")].every((i) => i.complete));
    ok("las fotos de los contactos cargan", await p.$$eval("#contacto img", (is) => is.length >= 2 && is.every((i) => i.naturalWidth > 0 && i.checkVisibility())));
    await p.keyboard.press("Escape");

    // Los hoteles no se ven hasta tocar su ficha, y se abren encima.
    ok("los hoteles no se ven al entrar", !(await p.evaluate(() => document.getElementById("hoteles").checkVisibility())));
    await p.click('#fichas a[href="#hoteles"]');
    await p.waitForFunction(() => document.getElementById("hoteles").open);
    ok("al tocar su ficha se abren encima", await p.evaluate(() => document.getElementById("hoteles").checkVisibility() && document.activeElement.matches("#hoteles [data-cerrar]")));
    await p.click("#hoteles [data-cerrar]");
    ok("«Cerrar» la cierra y el foco vuelve a la ficha", await p.evaluate(() => !document.getElementById("hoteles").open && document.activeElement.getAttribute("href") === "#hoteles"));
    const ctx2 = await nav.newContext({ viewport: { width: 375, height: 800 }, serviceWorkers: "block" });
    const p2 = await ctx2.newPage();
    await p2.goto(BASE + "/" + PAGINA + "#contacto", { waitUntil: "load" });
    ok("entrar con «#contacto» en la dirección abre los contactos", await p2.evaluate(() => document.getElementById("contacto").open && document.getElementById("contacto").checkVisibility()));
    await ctx2.close();

    // Las bases se abren encima, sin salir de la página.
    const antes = p.url();
    await p.click('#fichas a[data-ventana="Bases del campeonato"]');
    await p.waitForSelector("dialog.ventana-enlace[open]");
    const v = await p.evaluate(() => {
      const d = document.querySelector("dialog.ventana-enlace");
      const f = d.querySelector("iframe");
      return { abierta: d.checkVisibility(), marco: f && f.checkVisibility(), src: f && f.getAttribute("src"), titulo: d.querySelector("h2").textContent, afuera: d.querySelector('a[target="_blank"]').getAttribute("href") };
    });
    ok("la ventana se abre encima, con el marco", v.abierta && v.marco && v.src === "documentos/centroamericano-2026/bases-cac-2026.pdf".replace(/^/, new URL(antes).origin + "/"), JSON.stringify(v));
    ok("y no se sale de la página", p.url() === antes, p.url());
    ok("trae su título y «Abrir en otra pestaña»", v.titulo === "Bases del campeonato" && /bases-cac-2026\.pdf$/.test(v.afuera), JSON.stringify(v));
    await p.keyboard.press("Escape");
    await p.waitForFunction(() => !document.querySelector("dialog.ventana-enlace"));
    ok("con Escape se cierra y el foco vuelve a la ficha", await p.evaluate(() => document.activeElement && document.activeElement.dataset.ventana === "Bases del campeonato"));
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
