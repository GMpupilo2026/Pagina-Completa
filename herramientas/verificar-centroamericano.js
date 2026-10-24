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
ok("el reglamento, el calendario, los hoteles, los contactos, el medallero, la clasificación, los países, las sorpresas y el proyector van en ventanas",
  JSON.stringify(dialogos.map((m) => m[1]).sort()) === JSON.stringify(["calendario", "clasificacion", "contacto", "delegaciones", "hoteles", "medallero", "proyector", "reglamento", "sorpresas"]), dialogos.map((m) => m[1]).join(", "));
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
    // Ningún botón de la ficha del torneo saca a nadie del sitio: la página
    // en la misma pestaña, y los resultados y las bases, a su ficha de la página.
    const destinos = await p3.evaluate(() => [...document.querySelectorAll('li[data-sala="centroamericano-2026"] a')]
      .map((a) => a.getAttribute("href") + (a.target ? " target=" + a.target : "")));
    ok("en Torneos, ningún botón del Centroamericano se va del sitio",
       JSON.stringify(destinos) === JSON.stringify(["/" + PAGINA, "/" + PAGINA + "#ficha-resultados"]), JSON.stringify(destinos));
    const otraSala = await p3.evaluate(() => [...document.querySelectorAll('li[data-sala="utn"] a')].map((a) => a.target));
    ok("las otras salas: el sitio en la misma pestaña, lo de afuera en otra", JSON.stringify(otraSala) === JSON.stringify(["", "_blank"]), JSON.stringify(otraSala));
    await ctx3.close();
    for (const [id, titulo, src] of [["ficha-resultados", "Resultados en vivo", /chess-results\.com\/tnr1494141/], ["ficha-bases", "Bases del campeonato", /bases-cac-2026\.pdf$/]]) {
      const c = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      const pg = await c.newPage();
      await pg.route(/chess-results\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>cr</p>" }));
      await pg.goto(BASE + "/" + PAGINA + "#" + id, { waitUntil: "load" });
      const v = await pg.waitForFunction(() => {
        const d = document.querySelector("dialog.ventana-enlace");
        return d && d.open && { titulo: d.querySelector("h2").textContent, src: d.querySelector("iframe").src };
      }, null, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
      ok("entrar con #" + id + " abre «" + titulo + "» encima", !!v && v.titulo === titulo && src.test(v.src), JSON.stringify(v));
      if (v) {
        await pg.keyboard.press("Escape");
        await pg.waitForFunction(() => !document.querySelector("dialog.ventana-enlace"));
        ok("y al cerrar se quita el #" + id, await pg.evaluate(() => location.hash === ""));
      }
      await c.close();
    }

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
        { puesto: 1, no: 2, titulo: "WIM", nombre: "Mayorga Araya, Sofia", fed: "CRC", elo: 2215, grupo: "U18", puntos: "3", r: ["1w1", "3b1", "24w1"] },
        { puesto: 2, no: 1, titulo: "FM", nombre: "Guevara Ruiz, Santiago Jose", fed: "ESA", elo: 2252, grupo: "U18", puntos: "2½", r: ["2b0", "50w1", "31b1"] },
        { puesto: 3, no: 3, titulo: "FM", nombre: "Ordonez Bonilla, Ricardo Andres", fed: "GUA", elo: 2145, grupo: "U18", puntos: "2" },
        { puesto: 4, no: 4, titulo: "IM", nombre: "Castillo Beitia, Ashley Alexandra", fed: "PAN", elo: 2141, grupo: "U18F", puntos: "3", r: ["31w1", "24b0", "3w½"] },
        { puesto: 5, no: 24, titulo: "WFM", nombre: "Ferrer Naranjo, Liennys", fed: "CUB", elo: 1994, grupo: "U18F", puntos: "2" },
        { puesto: 6, no: 31, titulo: "WFM", nombre: "Wilson, Hannah", fed: "BAR", elo: 1920, grupo: "U18F", puntos: "1½" },
        { puesto: 7, no: 50, titulo: "", nombre: "Muñoz Solís, José", fed: "CRC", elo: 0, grupo: "U08", puntos: "2", r: ["-1", "31b½", "-0"] },
      ],
      pareo: { ronda: 4, mesas: [
        { mesa: 1, blancas: { no: 2, titulo: "WIM", nombre: "Mayorga Araya, Sofia" }, negras: { no: 1, titulo: "FM", nombre: "Guevara Ruiz, Santiago Jose" }, resultado: "" },
        { mesa: 7, blancas: { no: 31, titulo: "WFM", nombre: "Wilson, Hannah" }, negras: { no: 4, titulo: "IM", nombre: "Castillo Beitia, Ashley Alexandra" }, resultado: "0 - 1" },
        { mesa: 40, blancas: { no: 50, titulo: "", nombre: "Muñoz Solís, José" }, negras: null, resultado: "bye" },
      ] } }] };
    const ctx6 = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: true });
    await ctx6.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await ctx6.addInitScript((d) => {
      window.__pedidos = [];
      window.__falla = localStorage.getItem("__falla") === "1";
      window.sb = { functions: { invoke: async (nombre, op) => {
        window.__pedidos.push([nombre, op.body]);
        if (window.__falla) return { data: null, error: new Error("sin red") };
        const a = op.body && op.body.accion;
        if (a === "push_llave") return { data: { ok: true, llave: "BAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" }, error: null };
        if (a === "seguir" || a === "baja") return { data: { ok: true }, error: null };
        return { data: d, error: null };
      } } };
      // Los avisos sin un servicio de push de verdad: el permiso se concede y
      // la suscripción la da este doble (el contexto bloquea el service worker).
      let permiso = localStorage.getItem("__permiso") || "default";
      Object.defineProperty(Notification, "permission", { get: () => permiso });
      Notification.requestPermission = async () => { permiso = "granted"; localStorage.setItem("__permiso", permiso); return permiso; };
      // La suscripción dura entre recargas, como la de verdad.
      const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/prueba", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
      let sub = localStorage.getItem("__sub") ? { toJSON: () => SUB } : null;
      const reg = { pushManager: {
        getSubscription: async () => sub,
        subscribe: async (op) => { window.__llave = op.applicationServerKey.length; localStorage.setItem("__sub", "1"); sub = { toJSON: () => SUB }; return sub; },
      } };
      Object.defineProperty(navigator, "serviceWorker", { value: { ready: Promise.resolve(reg), register: async () => reg, controller: null, addEventListener() {} } });
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

    // Mis jugadores: la estrella lo pone arriba, guardado en el aparato.
    const seguidosVis = () => p6.evaluate(() => ({ visible: document.getElementById("seguidos").checkVisibility(),
      tarjetas: [...document.querySelectorAll("#seguidos-lista li")].map((l) => l.innerText.replace(/\s+/g, " ").trim()),
      guardado: JSON.parse(localStorage.getItem("cac_seguidos_v1") || "[]"),
      avisos: document.getElementById("avisos").checkVisibility(), boton: document.getElementById("avisos-boton").textContent,
      pulsado: document.getElementById("avisos-boton").getAttribute("aria-pressed") }));
    ok("sin nadie seguido, «Mis jugadores» no se ve", !(await seguidosVis()).visible);
    await buscar("mayorga");
    ok("la estrella dice a quién sigue (para el lector)", await p6.evaluate(() => { const b = document.querySelector("#buscador-resultados .cac-estrella"); return b.getAttribute("aria-label") === "Seguir a Mayorga Araya, Sofia" && b.getAttribute("aria-pressed") === "false"; }));
    await p6.click("#buscador-resultados .cac-estrella");
    let sg = await seguidosVis();
    ok("al tocar la estrella sale arriba, en «Mis jugadores», con su mesa", sg.visible && sg.tarjetas.length === 1 && /Mesa 1 · Juega con blancas/.test(sg.tarjetas[0]), JSON.stringify(sg));
    ok("y queda guardado en el aparato: el torneo, su número y su nombre", JSON.stringify(sg.guardado) === JSON.stringify([{ tnr: "1494141", no: 2, nombre: "Mayorga Araya, Sofia" }]), JSON.stringify(sg.guardado));
    ok("el foco sigue en la estrella, que ahora dice «Dejar de seguir»", await p6.evaluate(() => { const b = document.activeElement; return b.classList.contains("cac-estrella") && b.closest("#buscador-resultados") && b.getAttribute("aria-pressed") === "true" && /^Dejar de seguir/.test(b.getAttribute("aria-label")); }));

    // Avisarme en este celular: pide el permiso al tocar y manda la lista.
    ok("el botón de avisos aparece, apagado", sg.avisos && /Avisarme en este celular/.test(sg.boton) && sg.pulsado === "false", JSON.stringify(sg));
    ok("y el permiso no se pidió solo", await p6.evaluate(() => Notification.permission === "default"));
    await p6.evaluate(() => { window.__pedidos = []; });
    await p6.click("#avisos-boton");
    await p6.waitForFunction(() => document.getElementById("avisos-boton").getAttribute("aria-pressed") === "true", null, { timeout: 5000 }).catch(() => {});
    let ped = await p6.evaluate(() => window.__pedidos.map((x) => x[1]));
    const seguir = ped.find((b) => b.accion === "seguir");
    ok("pide la llave y se suscribe con ella", ped.some((b) => b.accion === "push_llave") && await p6.evaluate(() => window.__llave === 65), JSON.stringify(ped));
    ok("manda la sala, la suscripción, el jugador y el idioma", seguir && seguir.clave === "centroamericano-2026" && seguir.idioma === "es"
      && seguir.suscripcion.endpoint === "https://fcm.googleapis.com/fcm/send/prueba" && seguir.suscripcion.keys.auth
      && JSON.stringify(seguir.jugadores) === JSON.stringify([{ tnr: "1494141", no: 2, nombre: "Mayorga Araya, Sofia" }]), JSON.stringify(seguir));
    sg = await seguidosVis();
    ok("y el botón dice que están encendidos", sg.pulsado === "true" && /encendidos/.test(sg.boton) && /aviso de prueba/.test(await p6.textContent("#avisos-estado")), JSON.stringify(sg));

    // Mi delegación: los países de la clasificación; todos los suyos, por categoría.
    const opciones = await p6.evaluate(() => [...document.querySelectorAll("#delegacion option")].map((o) => o.value + "=" + o.textContent));
    ok("la lista de países sale de la clasificación, con su nombre", opciones[0] === "=Elige el país…" && opciones.includes("CRC=Costa Rica (CRC)") && opciones.includes("BAR=Barbados (BAR)") && opciones.length === 7, JSON.stringify(opciones));
    await p6.selectOption("#delegacion", "CRC");
    const deleg = () => p6.evaluate(() => ({ estado: document.getElementById("delegacion-estado").textContent,
      grupos: [...document.querySelectorAll("#delegacion-lista section")].map((sec) => sec.innerText.replace(/\s+/g, " ").trim()) }));
    let dl = await deleg();
    ok("Mi delegación muestra a todos sus jugadores, de la categoría menor a la mayor", /^2 jugadores de Costa Rica \(CRC\)\./.test(dl.estado) && dl.grupos.length === 2
      && /^Sub-8 Absoluto · 1 jugador ☆ Muñoz Solís, José .*tiene bye/.test(dl.grupos[0]) && /^Sub-18 Absoluto · 1 jugador ★ WIM Mayorga Araya, Sofia .*Mesa 1/.test(dl.grupos[1]), JSON.stringify(dl));
    ok("con la estrella de cada uno (y la de quien ya sigue, encendida)", await p6.evaluate(() => document.querySelector('#delegacion-lista .cac-estrella[data-clave="1494141-2"]').getAttribute("aria-pressed") === "true"));

    // Seguir a otro con los avisos encendidos: se le manda la lista entera.
    await p6.evaluate(() => { window.__pedidos = []; });
    await p6.click('#delegacion-lista .cac-estrella[data-clave="1494141-50"]');
    await p6.waitForFunction(() => window.__pedidos.some((x) => x[1].accion === "seguir"), null, { timeout: 5000 }).catch(() => {});
    ped = await p6.evaluate(() => window.__pedidos.map((x) => x[1]));
    ok("al seguir a otro, la función recibe la lista entera (no solo el nuevo)", ped.length === 1 && JSON.stringify(ped[0].jugadores.map((j) => j.no)) === "[2,50]", JSON.stringify(ped));

    // En inglés: el botón y la delegación.
    await p6.evaluate(() => { window.__pedidos = []; });
    await p6.click("#cac-idioma");
    await p6.waitForFunction(() => window.__pedidos.some((x) => x[1].accion === "seguir"), null, { timeout: 5000 }).catch(() => {});
    ok("en inglés, el botón, la delegación y los avisos cambian de idioma", await p6.evaluate(() => /Notifications on this phone: on/.test(document.getElementById("avisos-boton").textContent)
      && /^2 players from Costa Rica \(CRC\)/.test(document.getElementById("delegacion-estado").textContent)
      && window.__pedidos.some((x) => x[1].accion === "seguir" && x[1].idioma === "en")));
    await p6.click("#cac-idioma");

    // La delegación elegida y los seguidos se recuerdan; si chess-results le
    // cambió el número a un seguido, se lo encuentra por su nombre.
    await p6.evaluate(() => localStorage.setItem("cac_seguidos_v1", JSON.stringify([{ tnr: "1494141", no: 99, nombre: "Wilson, Hannah" }])));
    await p6.reload({ waitUntil: "load" });
    await p6.waitForFunction(() => document.querySelectorAll("#delegacion-lista section").length === 2, null, { timeout: 5000 }).catch(() => {});
    ok("al volver, su país sigue elegido y ya se ve", await p6.evaluate(() => document.getElementById("delegacion").value === "CRC" && document.querySelectorAll("#delegacion-lista section").length === 2));
    sg = await seguidosVis();
    ok("un seguido al que le cambiaron el número se encuentra por su nombre", sg.tarjetas.length === 1 && /Mesa 7/.test(sg.tarjetas[0]) && sg.guardado[0].no === 31, JSON.stringify(sg));

    // Dejar de seguir a todos con los avisos encendidos: se da de baja.
    await p6.evaluate(() => { window.__pedidos = []; });
    await p6.click("#seguidos-lista .cac-estrella");
    await p6.waitForFunction(() => window.__pedidos.some((x) => x[1].accion === "baja"), null, { timeout: 5000 }).catch(() => {});
    sg = await seguidosVis();
    ok("sin nadie a quien seguir, se da de baja y «Mis jugadores» se esconde", !sg.visible && !sg.guardado.length
      && await p6.evaluate(() => window.__pedidos.some((x) => x[1].accion === "baja" && x[1].suscripcion.endpoint === "https://fcm.googleapis.com/fcm/send/prueba") && localStorage.getItem("cac_avisos_v1") === null), JSON.stringify(sg));
    await p6.selectOption("#delegacion", "");

    // Sus rondas: del cuadro cruzado y la de hoy del pareo, con el rendimiento de FIDE.
    await buscar("mayorga");
    await p6.click('#buscador-resultados [data-rondas="1494141-2"]');
    const rondas = await p6.evaluate(() => {
      const b = document.querySelector('#buscador-resultados [data-rondas="1494141-2"]');
      const caja = document.getElementById(b.getAttribute("aria-controls"));
      return { abierto: b.getAttribute("aria-expanded"), foco: document.activeElement === b, filas: caja ? [...caja.querySelectorAll("li")].map((l) => l.textContent) : [],
        rend: caja ? caja.querySelector("p").textContent : "" };
    });
    ok("«Sus rondas» se abre, dice que está abierta y no pierde el foco", rondas.abierto === "true" && rondas.foco, JSON.stringify(rondas));
    ok("cada ronda con su color, lo que hizo y el rival; la de hoy, «juega contra»", JSON.stringify(rondas.filas) === JSON.stringify([
      "Ronda 1 · blancas · ganó a FM Guevara Ruiz, Santiago Jose (ESA, 2252)",
      "Ronda 2 · negras · ganó a FM Ordonez Bonilla, Ricardo Andres (GUA, 2145)",
      "Ronda 3 · blancas · ganó a WFM Ferrer Naranjo, Liennys (CUB, 1994)",
      "Ronda 4 · blancas · juega contra FM Guevara Ruiz, Santiago Jose (ESA, 2252)"]), JSON.stringify(rondas.filas));
    // 2252, 2145 y 1994: promedio 2130 (2130,3), con 3 de 3 → +800 (tabla 8.1b de FIDE).
    ok("y su rendimiento según FIDE (promedio de los rivales + dp)", rondas.rend === "Rendimiento: 2930 en 3 partidas (sus rivales tienen 2130 de promedio).", rondas.rend);

    // La imagen para compartir: un PNG de 1080 × 1080 con la marca de agua.
    await p6.evaluate(() => { const m = window.TablaImagen.marcar; window.__marcas = 0; window.TablaImagen.marcar = (c) => { window.__marcas++; return m(c); }; });
    const [descarga] = await Promise.all([p6.waitForEvent("download", { timeout: 15000 }), p6.click('#buscador-resultados [data-accion="compartir"]')]);
    const png = fs.readFileSync(await descarga.path());
    const anchoPng = png.readUInt32BE(16), altoPng = png.readUInt32BE(20);
    ok("«Compartir» da una imagen de 1080 × 1080 con su nombre de archivo", png.slice(1, 4).toString() === "PNG" && anchoPng === 1080 && altoPng === 1080 && /^centroamericano-2026-mayorga-araya-sofia\.png$/.test(descarga.suggestedFilename()), anchoPng + "×" + altoPng + " " + descarga.suggestedFilename());
    ok("y lleva la marca de agua de Ajedrez Integral", await p6.evaluate(() => window.__marcas === 1));

    // El resumen de la ronda de una delegación, listo para WhatsApp.
    await p6.selectOption("#delegacion", "CRC");
    const resumen = await p6.evaluate(() => { const r = document.querySelector("#delegacion-lista .cac-resumen"); return r ? { texto: r.innerText.replace(/\s+/g, " "), copia: r.dataset.texto } : null; });
    ok("Mi delegación trae el resumen de la última ronda con resultados («-0» es «sin jugar», no un bye)", resumen && /^Ronda 3: 1 ganada, 1 sin jugar\. 1 de 2 puntos posibles\./.test(resumen.texto), JSON.stringify(resumen));
    await p6.click("#delegacion-lista .cac-resumen button");
    const copiado = await p6.evaluate(() => navigator.clipboard.readText());
    ok("«Copiar para WhatsApp» copia el resumen con cada jugador y el enlace", copiado.split("\n")[0] === "Costa Rica (CRC) — Ronda 3, Centroamericano 2026"
      && copiado.includes("✅ Mayorga Araya, Sofia (Sub-18 Absoluto) ganó a WFM Ferrer Naranjo, Liennys (CUB, 1994)")
      && copiado.includes("➖ Muñoz Solís, José (Sub-8 Absoluto) no jugó") && /https:\/\/ajedrez-integral\.com\/centroamericano-2026\.html$/.test(copiado), copiado);
    await p6.selectOption("#delegacion", "");

    // La clasificación completa de una categoría.
    await p6.click('a[href="#clasificacion"]');
    await p6.waitForFunction(() => document.querySelectorAll("#clasificacion-contenido tbody tr").length > 0);
    await p6.selectOption("#clasificacion-categoria", "U18");
    const clasif = await p6.evaluate(() => [...document.querySelectorAll("#clasificacion-contenido tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent).join("|")));
    ok("la clasificación completa, por categoría, con puntos y rendimiento", JSON.stringify(clasif) === JSON.stringify(["1|WIM Mayorga Araya, Sofia|CRC|2215|3|2930", "2|FM Guevara Ruiz, Santiago Jose|ESA|2252|2½|2068", "3|FM Ordonez Bonilla, Ricardo Andres|GUA|2145|2|—"]), JSON.stringify(clasif));
    await p6.fill("#clasificacion-buscar", "guevara");
    ok("y se puede buscar dentro de la tabla", await p6.evaluate(() => document.querySelectorAll("#clasificacion-contenido tbody tr").length === 1));
    // Escape en el campo de búsqueda primero lo borra (así es el navegador): se cierra con «Cerrar».
    await p6.click("#clasificacion [data-cerrar]");

    // La tabla por país, ronda a ronda (con la ronda de hoy si ya tiene resultado).
    await p6.click('a[href="#delegaciones"]');
    await p6.waitForFunction(() => document.querySelectorAll("#delegaciones-contenido tbody tr").length > 0);
    const paises = await p6.evaluate(() => [...document.querySelectorAll("#delegaciones-contenido tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent).join("|")));
    ok("la tabla por país: puntos, posibles, porcentaje y cada ronda, ordenada por porcentaje", JSON.stringify(paises.slice(0, 4)) === JSON.stringify([
      "1|Costa Rica (CRC)|2|4½|6|75 %|2|1½|1|—", "2|El Salvador (ESA)|1|2|3|67 %|0|1|1|—", "3|Panamá (PAN)|1|2½|4|63 %|1|0|½|1", "4|Barbados (BAR)|1|0|1|0 %|—|—|—|0"]), JSON.stringify(paises));
    await p6.keyboard.press("Escape");

    // El pareo para proyectar: por categoría, con «Siguiente» y la pausa.
    await p6.click('a[href="#proyector"]');
    await p6.waitForFunction(() => /Ronda 4/.test(document.getElementById("proyector-titulo").textContent));
    const proy = () => p6.evaluate(() => ({ titulo: document.getElementById("proyector-titulo").textContent,
      filas: [...document.querySelectorAll("#proyector-contenido tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent).join("|")),
      grande: parseFloat(getComputedStyle(document.querySelector("#proyector-contenido table")).fontSize), visible: document.getElementById("proyector").checkVisibility() }));
    let pr = await proy();
    ok("el proyector empieza por la categoría menor, con el bye dicho", pr.visible && pr.titulo === "Ronda 4 · Sub-8 Absoluto" && JSON.stringify(pr.filas) === JSON.stringify(["40|Muñoz Solís, José (CRC)||bye (descansa)"]), JSON.stringify(pr));
    ok("en letra grande (más de 20 px en una pantalla de 1280)", pr.grande > 20, String(pr.grande));
    await p6.click("#proyector-siguiente");
    pr = await proy();
    ok("después del pareo de una categoría va su clasificación, con el rendimiento", pr.titulo === "Clasificación · Sub-8 Absoluto · tras la ronda 3" && JSON.stringify(pr.filas) === JSON.stringify(["1|Muñoz Solís, José (CRC)|2|1920"]), JSON.stringify(pr));
    await p6.click("#proyector-siguiente");
    pr = await proy();
    ok("y luego la otra categoría, con la mesa y los dos jugadores", pr.titulo === "Ronda 4 · Sub-18 Absoluto" && pr.filas[0] === "1|WIM Mayorga Araya, Sofia (CRC)|–|FM Guevara Ruiz, Santiago Jose (ESA)", JSON.stringify(pr));
    ok("el proyector dice cómo va la ronda y trae el QR a la página", await p6.evaluate(() => document.getElementById("proyector-progreso").textContent === "Ronda 4: 1 de 2 partidas terminadas."
      && !!document.querySelector("#proyector-qr svg path") && document.querySelector(".cac-proyector-qr").checkVisibility()));
    await p6.selectOption("#proyector-modo", "pareo");
    const soloPareo = [];
    for (let i = 0; i < 3; i++) { soloPareo.push((await proy()).titulo); await p6.click("#proyector-siguiente"); }
    ok("«Solo el pareo» salta las clasificaciones (y se recuerda)", JSON.stringify(soloPareo) === JSON.stringify(["Ronda 4 · Sub-8 Absoluto", "Ronda 4 · Sub-18 Absoluto", "Ronda 4 · Sub-18 Femenino"])
      && await p6.evaluate(() => localStorage.getItem("cac_proyector_modo_v1") === "pareo"), JSON.stringify(soloPareo));
    await p6.selectOption("#proyector-modo", "clasif");
    const soloClasif = [];
    for (let i = 0; i < 3; i++) { soloClasif.push((await proy()).titulo); await p6.click("#proyector-siguiente"); }
    ok("«Solo la clasificación» salta los pareos", soloClasif.every((x) => /^Clasificación · /.test(x)), JSON.stringify(soloClasif));
    await p6.selectOption("#proyector-modo", "todo");
    await p6.click("#proyector-pausa");
    ok("y se puede poner en pausa (y lo dice)", await p6.evaluate(() => document.getElementById("proyector-pausa").getAttribute("aria-pressed") === "true" && document.getElementById("proyector-pausa").textContent === "Seguir"));
    await p6.keyboard.press("Escape");

    // Cómo va la ronda, arriba del buscador.
    ok("arriba del buscador, cómo va la ronda (escrito, con su barra)", await p6.evaluate(() => document.getElementById("ronda-progreso").checkVisibility()
      && document.getElementById("ronda-progreso-texto").textContent === "Ronda 4: 1 de 2 partidas terminadas."
      && document.querySelector("#ronda-progreso .cac-progreso-barra span").style.width === "50%"));

    // Sorpresas e invictos.
    await p6.click('a[href="#sorpresas"]');
    await p6.waitForFunction(() => document.querySelectorAll("#sorpresas-contenido h3").length >= 3);
    const sorp = await p6.evaluate(() => ({ titulos: [...document.querySelectorAll("#sorpresas-contenido h3")].map((h) => h.textContent),
      listas: [...document.querySelectorAll("#sorpresas-contenido ol")].map((o) => [...o.children].map((l) => l.textContent)),
      parrafos: [...document.querySelectorAll("#sorpresas-contenido > p")].map((p) => p.textContent),
      invictos: [...document.querySelectorAll("#sorpresas-contenido .cac-podio")].map((c) => c.innerText.replace(/\s+/g, " ").trim()) }));
    ok("las sorpresas de la última ronda (ninguna) y del torneo, de la más grande a la más chica", sorp.titulos[0] === "Las sorpresas de la ronda 4" && sorp.parrafos[0] === "Ninguna todavía: hasta ahora ganó siempre el de más Elo."
      && JSON.stringify(sorp.listas[0]) === JSON.stringify(["Ronda 1 · Sub-18 Absoluto: WIM Mayorga Araya, Sofia (CRC, 2215) le ganó a FM Guevara Ruiz, Santiago Jose (ESA, 2252), 37 puntos de Elo más.",
        "Ronda 3 · Sub-18 Femenino: IM Castillo Beitia, Ashley Alexandra (PAN, 2141) hizo tablas con FM Ordonez Bonilla, Ricardo Andres (GUA, 2145), 4 puntos de Elo más."]), JSON.stringify(sorp));
    ok("y los invictos de cada categoría (un bye o una ronda sin jugar no cuentan como partida)", JSON.stringify(sorp.invictos) === JSON.stringify(["Sub-8 Absoluto Muñoz Solís, José (CRC) · 2 puntos", "Sub-18 Absoluto WIM Mayorga Araya, Sofia (CRC) · 3 puntos"]), JSON.stringify(sorp.invictos));
    await p6.keyboard.press("Escape");

    // El enlace directo a un jugador: se copia y abre su tarjeta, con sus rondas.
    await buscar("mayorga");
    await p6.click('#buscador-resultados [data-accion="enlace"]');
    const enlaceCopiado = await p6.evaluate(() => navigator.clipboard.readText());
    ok("«Copiar enlace» copia la dirección directa a ese jugador", /\/centroamericano-2026\.html#jugador=1494141-2-mayorga-araya-sofia$/.test(enlaceCopiado), enlaceCopiado);
    await p6.fill("#buscador-nombre", "");
    await p6.goto(BASE + "/" + PAGINA + "#jugador=1494141-2-mayorga-araya-sofia", { waitUntil: "load" });
    await p6.reload({ waitUntil: "load" });
    await p6.waitForFunction(() => document.querySelector('#buscador-resultados [data-rondas="1494141-2"]'), null, { timeout: 5000 }).catch(() => {});
    const directo = await p6.evaluate(() => { const b = document.querySelector('#buscador-resultados [data-rondas="1494141-2"]');
      return { campo: document.getElementById("buscador-nombre").value, abierta: b && b.getAttribute("aria-expanded"), foco: document.activeElement === b }; });
    ok("el enlace abre su tarjeta con las rondas abiertas y el foco en ella", directo.campo === "Mayorga Araya, Sofia" && directo.abierta === "true" && directo.foco, JSON.stringify(directo));
    await p6.evaluate(() => { location.hash = "#jugador=1494141-99-wilson-hannah"; });
    await p6.waitForFunction(() => document.getElementById("buscador-nombre").value === "Wilson, Hannah", null, { timeout: 5000 }).catch(() => {});
    ok("si el número cambió, lo encuentra por el nombre del enlace", await p6.evaluate(() => document.getElementById("buscador-nombre").value === "Wilson, Hannah"));
    await p6.evaluate(() => { history.replaceState(null, "", location.pathname); });

    // El resumen de la delegación como imagen.
    await p6.selectOption("#delegacion", "CRC");
    await p6.evaluate(() => { const m = window.TablaImagen.marcar; window.__marcas = 0; window.TablaImagen.marcar = (c) => { window.__marcas++; return m(c); }; });
    const [descarga2] = await Promise.all([p6.waitForEvent("download", { timeout: 15000 }), p6.click("#delegacion-lista .cac-resumen .cac-jugador-boton")]);
    const png2 = fs.readFileSync(await descarga2.path());
    ok("el resumen de la delegación también sale como imagen, con la marca de agua", png2.slice(1, 4).toString() === "PNG" && png2.readUInt32BE(16) === 1080 && png2.readUInt32BE(20) >= 1080
      && descarga2.suggestedFilename() === "centroamericano-2026-costa-rica-crc-ronda-3.png" && await p6.evaluate(() => window.__marcas === 1), descarga2.suggestedFilename());

    // Seguir a toda la delegación: un aviso por ronda con su resumen.
    await p6.evaluate(() => { window.__pedidos = []; });
    ok("el botón de la delegación dice el país", await p6.evaluate(() => /Avisarme del resumen de Costa Rica \(CRC\) en cada ronda/.test(document.getElementById("delegacion-avisos").textContent)));
    await p6.click("#delegacion-avisos");
    await p6.waitForFunction(() => document.getElementById("delegacion-avisos").getAttribute("aria-pressed") === "true", null, { timeout: 5000 }).catch(() => {});
    let pedDel = await p6.evaluate(() => window.__pedidos.map((x) => x[1]).filter((b) => b.accion === "seguir"));
    ok("se suscribe con el país (y sin jugadores, si no sigue a nadie)", pedDel.length === 1 && pedDel[0].delegacion === "CRC" && Array.isArray(pedDel[0].jugadores) && pedDel[0].jugadores.length === 0, JSON.stringify(pedDel));
    await p6.evaluate(() => { window.__pedidos = []; });
    await p6.click("#delegacion-avisos");
    await p6.waitForFunction(() => window.__pedidos.some((x) => x[1].accion === "baja"), null, { timeout: 5000 }).catch(() => {});
    ok("tocarlo otra vez lo apaga (y sin nada que seguir, se da de baja)", await p6.evaluate(() => window.__pedidos.some((x) => x[1].accion === "baja") && document.getElementById("delegacion-avisos").getAttribute("aria-pressed") === "false"));
    await p6.selectOption("#delegacion", "");

    // Sin señal: lo último que llegó, guardado en el aparato, con la hora en que se leyó.
    await p6.evaluate(() => localStorage.setItem("__falla", "1"));
    await p6.reload({ waitUntil: "load" });
    r = await buscar("mayorga");
    ok("sin señal, muestra lo último que llegó y lo dice", r.tarjetas.length === 1 && /Sin conexión/.test(r.estado), JSON.stringify(r));
    await ctx6.close();

    // Instalar en iPhone: Safari no avisa, así que se explica cómo, una vez.
    const ctxIos = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
    const pIos = await ctxIos.newPage();
    await pIos.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    ok("en iPhone explica cómo instalarla (y el botón de Android no sale)", await pIos.evaluate(() => document.getElementById("instalar-ios").checkVisibility() && !document.getElementById("instalar-app").checkVisibility()));
    await pIos.click("[data-instalar-ios-no]");
    await pIos.reload({ waitUntil: "load" });
    ok("«Entendido» no lo vuelve a mostrar", await pIos.evaluate(() => !document.getElementById("instalar-ios").checkVisibility()));
    await ctxIos.close();
    const pNoIos = await (await nav.newContext({ serviceWorkers: "block" })).newPage();
    await pNoIos.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    ok("fuera del iPhone, la ayuda de iPhone no sale", await pNoIos.evaluate(() => !document.getElementById("instalar-ios").checkVisibility()));
    ok("la página se instala como su propia app (su manifest y su ícono)", await pNoIos.evaluate(async () => {
      const m = await (await fetch(document.querySelector('link[rel="manifest"]').href)).json();
      return m.start_url === "/centroamericano-2026.html" && m.short_name === "Centroamericano" && /centroamericano-2026\/app\/apple-touch-icon\.png$/.test(document.querySelector('link[rel="apple-touch-icon"]').href);
    }));
    await pNoIos.context().close();

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
