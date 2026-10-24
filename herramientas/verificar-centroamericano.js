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
 *      scroll de costado; «Hoy en el torneo» dice lo que toca en cada momento
 *      del festival (con el reloj puesto); en inglés ningún texto se queda en
 *      español y al volver queda igual; y la segunda vez abre sin internet.
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
const items = fichas.match(/<li[^>]*>[\s\S]*?<\/li>/g) || [];
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
ok("el reglamento, el calendario, los hoteles, los contactos y el medallero van en ventanas", JSON.stringify(dialogos.map((m) => m[1]).sort()) === JSON.stringify(["calendario", "contacto", "hoteles", "medallero", "reglamento"]), dialogos.map((m) => m[1]).join(", "));
for (const [, id, cuerpo] of dialogos) {
  ok("la ventana «" + id + "» tiene su ficha", fichas.includes('href="#' + id + '"'));
  ok("y su título y su botón «Cerrar»", cuerpo.includes('id="' + id + '-titulo"') && /data-cerrar[^>]*>Cerrar</.test(cuerpo));
}
ok("no queda información desplegada fuera de las fichas", !/<section id="(contacto|reglamento|calendario|hoteles)"/.test(html));
const personas = [...((contacto.match(/<ul[\s\S]*?<\/ul>/) || [""])[0]).matchAll(/<h3[^>]*>([^<]+)<\/h3>\s*<p[^>]*>([^<]+)<\/p>/g)].map((m) => m[1] + " — " + m[2]);
ok("Contacta a la organización: árbitra principal, organizadora y árbitro de pareo", JSON.stringify(personas) === JSON.stringify(["Carolina Muñoz — Árbitra principal", "Vivian Víquez Miranda — Organizadora", "Jean Quesada — Árbitro de pareo"]), JSON.stringify(personas));
const fotos = [...contacto.matchAll(/<img src="([^"]+)"[^>]*alt="Foto de ([^"]+)"/g)];
ok("las fotos de los tres contactos están en el sitio", fotos.length === 3 && fotos.every(([, src]) => fs.existsSync(path.join(RAIZ, src))), fotos.map((f) => f[1]).join(", "));
const pie = (html.match(/<footer[\s\S]*?<\/footer>/) || [""])[0];
ok("el pie de página no trae otro contacto que el de la organización", !/mailto:|wa\.me|tel:/.test(pie));
ok("el correo de la organización va en los contactos, no en una ficha aparte", contacto.includes('href="mailto:torneos_internacionales_costarica@fcacostarica.com"') && !/<li[^>]*>\s*<a href="mailto:/.test(fichas));
ok("cada contacto con su teléfono y su WhatsApp", (contacto.match(/href="tel:/g) || []).length === 3 && (contacto.match(/href="https:\/\/wa\.me\/506\d{8}"/g) || []).length === 3);
// La cara de las bases: su hoja de estilos, la mascota, la bandera y los logos.
ok("la página carga css/centroamericano.css y el cuerpo lleva la clase cac", html.includes('<link rel="stylesheet" href="css/centroamericano.css">') && /<body class="cac /.test(html));
for (const img of ["mascota.jpg", "mascota-trofeo.png", "mascota-asoma.png", "hojas.png", "bandera-cr.svg", "cca-logo.png"]) {
  ok("la imagen " + img + " existe y se usa", fs.existsSync(path.join(RAIZ, "img/centroamericano-2026", img)) && html.includes("img/centroamericano-2026/" + img));
}
ok("la mascota tiene su texto alternativo", /src="img\/centroamericano-2026\/mascota\.jpg"[^>]*alt="[^"]{20,}"/.test(html));
// Los pizotes de más: uno se asoma en «Pedir un bye», otro festeja en «Resultados» y otro despide.
ok("el pizote se asoma en «Pedir un bye»", /data-ventana="Pedir un bye"[^>]*cac-con-asoma[\s\S]*?mascota-asoma\.png[\s\S]*?<\/a>/.test(html));
ok("el pizote del trofeo festeja en «Resultados en vivo»", /data-ventana="Resultados en vivo"[^>]*cac-con-festejo[\s\S]*?cac-festejo[\s\S]*?<\/a>/.test(html));
ok("el pizote despide y lleva a los contactos", /<a href="#contacto" class="cac-despedida[\s\S]*?cac-despedida-foto[\s\S]*?Nos vemos en La Sabana/.test(html));
ok("lo que solo adorna no lo lee el lector de pantalla", [...html.matchAll(/<img [^>]*(hojas\.png|bandera-cr\.svg|mascota-trofeo\.png|mascota-asoma\.png|cac-despedida-foto)[^>]*>/g)].every((m) => /alt=""/.test(m[0]) && /aria-hidden="true"/.test(m[0])));
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


// Lo que se comparte: la imagen de WhatsApp (1200 × 630) y el cartel con QR,
// los dos de herramientas/centroamericano-imagenes.js.
function tamanoJpeg(buf) {
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) return null;
    const tipo = buf[i + 1], largo = buf.readUInt16BE(i + 2);
    if (tipo >= 0xc0 && tipo <= 0xc3) return buf.readUInt16BE(i + 7) + "x" + buf.readUInt16BE(i + 5);
    i += 2 + largo;
  }
  return null;
}
const og = (html.match(/<meta property="og:image" content="https:\/\/ajedrez-integral\.com\/([^"]+)">/) || [])[1];
ok("al compartir, la imagen propia del torneo", og === "img/centroamericano-2026/compartir.jpg", og);
ok("y mide 1200 × 630", og && fs.existsSync(path.join(RAIZ, og)) && tamanoJpeg(fs.readFileSync(path.join(RAIZ, og))) === "1200x630");
const CARTEL = "documentos/centroamericano-2026/cartel-centroamericano-2026.pdf";
ok("el cartel con QR existe y la página lo enlaza", fs.existsSync(path.join(RAIZ, CARTEL)) && html.includes('href="' + CARTEL + '"'));
// Las horas del calendario: cada fila con su hora de Costa Rica, en orden, y la ronda 1 marcada.
const horas = [...html.matchAll(/<tr data-inicio="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})" data-minutos="(\d+)"/g)].map((m) => m[1]);
ok("cada actividad del calendario lleva su hora (16), en orden", horas.length === 16 && horas.every((h, i) => !i || h > horas[i - 1]), horas.join(" "));
ok("la ronda 1 va marcada para la cuenta regresiva", /data-inicio="2026-11-02T09:30"[^>]*data-primera-ronda><th[^>]*>Ronda 1</.test(html));
// Cómo llegar: cada hotel con dirección trae su ruta en Google Maps hasta el Gimnasio Nacional.
const hotelesHtml = (html.match(/<dialog id="hoteles"[\s\S]*?<\/dialog>/) || [""])[0];
const rutas = [...hotelesHtml.matchAll(/href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;origin=[^"&]+&amp;destination=Gimnasio\+Nacional[^"]*"/g)].length;
ok("los seis hoteles con dirección traen su ruta a la sala", rutas === 6, rutas + " rutas");
ok("y la ruta en Waze, una vez", /href="https:\/\/waze\.com\/ul\?q=Gimnasio%20Nacional[^"]*navigate=yes"/.test(hotelesHtml));
ok("la página carga su traducción y su código, en ese orden", html.indexOf('<script src="js/centroamericano-en.js"></script>') > 0 && html.indexOf('<script src="js/centroamericano-en.js"></script>') < html.indexOf('<script src="js/centroamericano.js"></script>'));


// «Agregar a mi calendario»: el .ics sale de la tabla, con las mismas horas.
const ICS = "documentos/centroamericano-2026/calendario-centroamericano-2026.ics";
const ics = fs.existsSync(path.join(RAIZ, ICS)) ? fs.readFileSync(path.join(RAIZ, ICS), "utf8") : "";
const comienzos = [...ics.matchAll(/^DTSTART:(\d{8}T\d{6}Z)/gm)].map((m) => m[1]);
const esperados = horas.map((h) => new Date(h + ":00-06:00").toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""));
ok("el calendario .ics trae cada actividad a su hora (en UTC)", comienzos.length === 16 && JSON.stringify(comienzos) === JSON.stringify(esperados), comienzos.join(" "));
ok("con un aviso 30 minutos antes de cada una de las 9 rondas", (ics.match(/TRIGGER:-PT30M/g) || []).length === 9);
ok("con sus líneas partidas como pide el formato (75 bytes)", ics.length > 0 && ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75) && !/[^\r]\n/.test(ics));
ok("y la página lo ofrece en la franja de hoy y en el calendario", (html.match(new RegExp('href="' + ICS + '" download', "g")) || []).length === 2);
// «Busca a tu jugador» y el medallero, por la Edge Function sala-jugadores.
ok("la función sala-jugadores está guardada en supabase/functions", fs.existsSync(path.join(RAIZ, "supabase/functions/sala-jugadores/index.ts")));
ok("la página carga el cliente de Supabase antes que su código en vivo", html.indexOf('<script src="js/supabase-client.js"></script>') > 0 && html.indexOf('<script src="js/supabase-client.js"></script>') < html.indexOf('<script src="js/centroamericano-vivo.js"></script>'));

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
    ok("las fotos de los contactos cargan", await p.$$eval("#contacto img", (is) => is.length === 3 && is.every((i) => i.naturalWidth > 0 && i.checkVisibility())));
    await p.keyboard.press("Escape");

    const portada = await p.evaluate(() => {
      const h = document.querySelector(".cac-portada"), m = document.querySelector(".cac-mascota");
      return { fondo: getComputedStyle(h).backgroundImage, mascota: m.checkVisibility() && m.naturalWidth > 0 };
    });
    ok("la portada lleva el morado de las bases y se ve la mascota", /64, 71, 143/.test(portada.fondo) && portada.mascota, JSON.stringify(portada));

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

    // La ficha de afuera, en Torneos, lleva la cara del torneo; las demás salas, la de siempre.
    const ctx3 = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const sala = (clave, nombre) => ({ id: clave, clave, nombre, descripcion: "", emoji: "🏆", tipo: "enlaces", lichess_id: null, enlaces: [{ url: "https://ajedrez-integral.com/" + PAGINA, texto: "Toda la información del torneo" }, { url: "https://s1.chess-results.com/x", texto: "Resultados en vivo" }], pizarras: null, video_url: null, quiniela: false, tema: "cine", visible: true, orden: 0 });
    await ctx3.route(/supabase\.co\/rest\/v1\/salas_torneo/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([sala("centroamericano-2026", "XXI Festival"), sala("utn", "Torneo UTN")]) }));
    const p3 = await ctx3.newPage();
    await p3.goto(BASE + "/torneos-en-vivo.html", { waitUntil: "load" });
    await p3.waitForSelector('#salas-lista li[data-sala="utn"]');
    const fichaSala = await p3.evaluate(() => {
      const mira = (li) => {
        const m = li.querySelector(".cac-sala-mascota");
        const botones = [...li.querySelectorAll("a")].map((a) => getComputedStyle(a).backgroundColor);
        return { fondo: getComputedStyle(li).backgroundImage, mascota: !!(m && m.checkVisibility() && m.complete && m.naturalWidth > 0 && m.getAttribute("aria-hidden") === "true" && m.alt === ""), botones };
      };
      return { cac: mira(document.querySelector('li[data-sala="centroamericano-2026"]')), otra: mira(document.querySelector('li[data-sala="utn"]')) };
    });
    ok("en Torneos, la ficha del Centroamericano lleva el morado de las bases y el pizote", /gradient/.test(fichaSala.cac.fondo) && fichaSala.cac.mascota, JSON.stringify(fichaSala.cac));
    ok("y sus botones: el primero rojo, el resto blancos", JSON.stringify(fichaSala.cac.botones) === JSON.stringify(["rgb(206, 19, 40)", "rgb(255, 255, 255)"]), JSON.stringify(fichaSala.cac.botones));
    ok("las demás salas siguen con su ficha de siempre", fichaSala.otra.fondo === "none" && !fichaSala.otra.mascota, JSON.stringify(fichaSala.otra));
    await ctx3.close();

    // «Hoy en el torneo», con el reloj puesto en cada momento del festival.
    const hoyEn = async (momento, idioma) => {
      const c = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      const pg = await c.newPage();
      await pg.clock.install({ time: new Date(momento) });
      await pg.goto(BASE + "/" + PAGINA + (idioma ? "?lang=" + idioma : ""), { waitUntil: "load" });
      const r = await pg.evaluate(() => ({ estado: document.getElementById("hoy").dataset.estado,
        texto: ["hoy-etiqueta", "hoy-principal", "hoy-detalle"].map((id) => document.getElementById(id).textContent).join(" | ") }));
      await c.close();
      return r;
    };
    let h = await hoyEn("2026-10-24T10:00:00-06:00");
    ok("antes del festival, la cuenta regresiva", h.estado === "antes" && /Faltan 8 días/.test(h.texto) && /ronda 1 se juega el lunes 2 de noviembre a las 9:30/.test(h.texto), h.texto);
    h = await hoyEn("2026-11-02T10:15:00-06:00");
    ok("durante una ronda, lo que se juega ahora y lo que sigue", h.estado === "durante" && /Ahora: Ronda 1/.test(h.texto) && /Después: Ronda 2, hoy a las 3:30/.test(h.texto), h.texto);
    h = await hoyEn("2026-11-03T21:00:00-06:00");
    ok("entre rondas, lo próximo con cuánto falta", /Lo próximo: Ronda 4/.test(h.texto) && /Mañana, miércoles 4 de noviembre, a las 9:00/.test(h.texto) && /faltan 12 h/.test(h.texto), h.texto);
    h = await hoyEn("2026-11-08T13:00:00-06:00");
    ok("después, el cierre", h.estado === "despues" && /terminó/.test(h.texto), h.texto);
    h = await hoyEn("2026-11-02T10:15:00-06:00", "en");
    ok("y en inglés", /Now: Round 1/.test(h.texto) && /Then: Round 2, today at 3:30/.test(h.texto), h.texto);

    // El inglés: todo texto de la página tiene el suyo, y al volver queda igual que antes.
    const ctx4 = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const p4 = await ctx4.newPage();
    // El aviso de «quedó guardada» llega un rato después de cargar: se espera, para comparar lo mismo.
    const guardada = (pg) => pg.waitForFunction(() => !document.getElementById("hoy-sin-red").hidden, null, { timeout: 15000 }).catch(() => {});
    await p4.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    await guardada(p4);
    const textoEs = await p4.evaluate(() => document.body.innerText);
    await p4.click("#cac-idioma");
    const en = await p4.evaluate(() => {
      const valores = new Set(Object.values(window.CentroamericanoEN.textos));
      const sinTraducir = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (n.parentElement.closest("script, style, [data-no-traducir]")) continue;
        const t = n.nodeValue.replace(/\s+/g, " ").trim();
        if (/[A-Za-zÁÉÍÓÚáéíóúñ]/.test(t) && !valores.has(t)) sinTraducir.push(t);
      }
      document.querySelectorAll("[alt], [aria-label], [title], [data-ventana]").forEach((e) => {
        if (e.closest("[data-no-traducir]")) return;
        ["alt", "aria-label", "title", "data-ventana"].forEach((a) => { const v = e.getAttribute(a); if (v && /[A-Za-z]/.test(v) && !valores.has(v)) sinTraducir.push(a + "=" + v); });
      });
      const b = document.getElementById("cac-idioma");
      return { sinTraducir, lang: document.documentElement.lang, boton: b.textContent, titulo: document.title };
    });
    ok("en inglés, ningún texto se queda en español", en.sinTraducir.length === 0, JSON.stringify(en.sinTraducir.slice(0, 8)));
    ok("y la página lo dice (lang=en, el título, el botón ofrece «Español»)", en.lang === "en" && /^Central American/.test(en.titulo) && /Español/.test(en.boton), JSON.stringify(en));
    await p4.click('#fichas a[data-ventana="Championship regulations"]');
    await p4.waitForSelector("dialog.ventana-enlace[open]");
    ok("lo que se abre después también va en inglés", await p4.evaluate(() => { const d = document.querySelector("dialog.ventana-enlace"); return d.querySelector("h2").textContent === "Championship regulations" && /Close/.test(d.textContent) && /Open in a new tab/.test(d.textContent); }));
    await p4.keyboard.press("Escape");
    await p4.waitForFunction(() => !document.querySelector("dialog.ventana-enlace"));
    await p4.reload({ waitUntil: "load" });
    await guardada(p4);
    ok("la elección se recuerda al volver", await p4.evaluate(() => document.documentElement.lang === "en"));
    await p4.click("#cac-idioma");
    ok("y al volver al español queda exactamente como estaba", (await p4.evaluate(() => document.body.innerText)) === textoEs && await p4.evaluate(() => document.documentElement.lang === "es"));
    await ctx4.close();

    // «Busca a tu jugador» y el medallero, con un doble de la función (datos con la forma de sala-jugadores).
    const DATOS = { torneos: [{ tnr: "1494141", url: "x", leido_en: "2026-11-03T16:05:00Z", ronda: 3, rondas: 9,
      jugadores: [
        { puesto: 1, no: 2, titulo: "WIM", nombre: "Mayorga Araya, Sofia", fed: "CRC", elo: 2215, grupo: "U18", puntos: "3" },
        { puesto: 2, no: 1, titulo: "FM", nombre: "Guevara Ruiz, Santiago Jose", fed: "ESA", elo: 2252, grupo: "U18", puntos: "2½" },
        { puesto: 3, no: 3, titulo: "FM", nombre: "Ordonez Bonilla, Ricardo Andres", fed: "GUA", elo: 2145, grupo: "U18", puntos: "2" },
        { puesto: 4, no: 4, titulo: "IM", nombre: "Castillo Beitia, Ashley Alexandra", fed: "PAN", elo: 2141, grupo: "U18F", puntos: "3" },
        { puesto: 5, no: 24, titulo: "WFM", nombre: "Ferrer Naranjo, Liennys", fed: "CUB", elo: 1994, grupo: "U18F", puntos: "2" },
        { puesto: 6, no: 31, titulo: "WFM", nombre: "Wilson, Hannah", fed: "BAR", elo: 1920, grupo: "U18F", puntos: "1½" },
        { puesto: 7, no: 50, titulo: "", nombre: "Muñoz Solís, José", fed: "CRC", elo: 0, grupo: "U08", puntos: "2" },
      ],
      pareo: { ronda: 4, mesas: [
        { mesa: 1, blancas: { no: 2, titulo: "WIM", nombre: "Mayorga Araya, Sofia" }, negras: { no: 1, titulo: "FM", nombre: "Guevara Ruiz, Santiago Jose" }, resultado: "" },
        { mesa: 7, blancas: { no: 31, titulo: "WFM", nombre: "Wilson, Hannah" }, negras: { no: 4, titulo: "IM", nombre: "Castillo Beitia, Ashley Alexandra" }, resultado: "0 - 1" },
        { mesa: 40, blancas: { no: 50, titulo: "", nombre: "Muñoz Solís, José" }, negras: null, resultado: "bye" },
      ] } }] };
    const ctx6 = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctx6.addInitScript((d) => {
      window.__pedidos = [];
      window.__falla = localStorage.getItem("__falla") === "1";
      window.sb = { functions: { invoke: async (nombre, op) => { window.__pedidos.push([nombre, op.body]); return window.__falla ? { data: null, error: new Error("sin red") } : { data: d, error: null }; } } };
    }, DATOS);
    const p6 = await ctx6.newPage();
    await p6.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    const buscar = async (q) => {
      await p6.fill("#buscador-nombre", q);
      await p6.waitForTimeout(450);
      return p6.evaluate(() => ({ estado: document.getElementById("buscador-estado").textContent,
        tarjetas: [...document.querySelectorAll("#buscador-resultados li")].map((l) => l.innerText.replace(/\s+/g, " ").trim()) }));
    };
    let r = await buscar("mayorga");
    ok("buscar por el apellido da su mesa, su color y su rival", r.tarjetas.length === 1 && /Ronda 4 · Mesa 1 · Juega con blancas contra FM Guevara Ruiz, Santiago Jose \(ESA, 2252\)/.test(r.tarjetas[0]), JSON.stringify(r));
    ok("y su categoría, su puesto en ella y sus puntos", /Sub-18 Absoluto · Elo 2215 · Puesto 1 de 3 en Sub-18 Absoluto · 3 puntos/.test(r.tarjetas[0]), r.tarjetas[0]);
    ok("le pide a la función la sala del torneo, no una dirección", await p6.evaluate(() => JSON.stringify(window.__pedidos[0]) === JSON.stringify(["sala-jugadores", { clave: "centroamericano-2026" }])));
    r = await buscar("munoz jose");
    ok("sin tildes y en cualquier orden, y el bye se dice", r.tarjetas.length === 1 && /tiene bye/.test(r.tarjetas[0]), JSON.stringify(r));
    r = await buscar("castillo");
    ok("con el resultado si ya lo hay", /Juega con negras contra WFM Wilson, Hannah \(BAR, 1920\)/.test(r.tarjetas[0]) && /Resultado: 0 - 1/.test(r.tarjetas[0]), JSON.stringify(r));
    r = await buscar("zzzz");
    ok("y si no hay nadie, lo dice", !r.tarjetas.length && /No encontramos/.test(r.estado), r.estado);
    await p6.click('a[href="#medallero"]');
    await p6.waitForFunction(() => /Provisional/.test(document.getElementById("medallero-contenido").textContent));
    const med = await p6.evaluate(() => ({ filas: [...document.querySelectorAll("#medallero-contenido tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()),
      podios: [...document.querySelectorAll("#medallero-contenido .cac-podio")].map((c) => c.innerText.replace(/\s+/g, " ").trim()) }));
    ok("el medallero cuenta los tres primeros de cada categoría por federación", JSON.stringify(med.filas) === JSON.stringify(["CRC 2 0 0 2", "PAN 1 0 0 1", "CUB 0 1 0 1", "ESA 0 1 0 1", "BAR 0 0 1 1", "GUA 0 0 1 1"]), JSON.stringify(med.filas));
    ok("y los podios van por categoría, de la menor a la mayor", med.podios.length === 3 && /^Sub-8 Absoluto/.test(med.podios[0]) && /^Sub-18 Femenino .*1\. IM Castillo/.test(med.podios[2]), JSON.stringify(med.podios));
    await p6.keyboard.press("Escape");
    await p6.click("#cac-idioma");
    r = await buscar("mayorga");
    ok("en inglés, el buscador también", /Round 4 · Board 1 · Plays white against/.test(r.tarjetas[0]) && /U18 Open · Rating 2215 · Place 1 of 3/.test(r.tarjetas[0]), JSON.stringify(r));
    await p6.click("#cac-idioma");
    // Sin señal: lo último que llegó, guardado en el aparato, con la hora en que se leyó.
    await p6.evaluate(() => localStorage.setItem("__falla", "1"));
    await p6.reload({ waitUntil: "load" });
    r = await buscar("mayorga");
    ok("sin señal, muestra lo último que llegó y lo dice", r.tarjetas.length === 1 && /Sin conexión/.test(r.estado), JSON.stringify(r));
    await ctx6.close();

    // Sin internet: con el service worker de verdad, la segunda vez abre sin red.
    const ctx5 = await nav.newContext({ viewport: { width: 390, height: 800 } });
    const p5 = await ctx5.newPage();
    await p5.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    await p5.waitForFunction(() => !document.getElementById("hoy-sin-red").hidden, null, { timeout: 15000 }).catch(() => {});
    ok("la página avisa que quedó guardada para abrir sin internet", await p5.evaluate(() => document.getElementById("hoy-sin-red").checkVisibility()));
    await p5.evaluate(() => navigator.serviceWorker.ready);
    await ctx5.setOffline(true);
    await p5.reload({ waitUntil: "load" }).catch(() => {});
    const sinRed = await p5.evaluate(() => ({ titulo: (document.querySelector("h1") || {}).textContent || "", fichas: document.querySelectorAll("#fichas .cac-ficha").length,
      css: getComputedStyle(document.querySelector(".cac-portada") || document.body).backgroundImage })).catch((e) => ({ error: String(e) }));
    ok("sin red, abre entera: el título, las fichas y su hoja de estilos", /Centroamericano/.test(sinRed.titulo) && sinRed.fichas === 9 && /gradient/.test(sinRed.css), JSON.stringify(sinRed));
    await ctx5.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
