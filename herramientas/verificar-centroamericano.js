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
// El menú de idiomas del encabezado: lo abre y elige otro idioma. Sin
// decir cuál, alterna entre el español y el inglés (como el botón de antes).
async function cambiarIdioma(pg, cual) {
  const ahora = await pg.evaluate(() => document.documentElement.lang);
  await pg.click("#cac-idioma");
  await pg.click('#cac-idiomas [data-idioma="' + (cual || (ahora === "es" ? "en" : "es")) + '"]');
}

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
ok("el reglamento, el calendario, los hoteles, los paseos, los contactos, el medallero, la clasificación, los países, las sorpresas, el cara a cara, los números, la elección de categoría, las partidas en vivo, los ejercicios de la ronda, los juegos para los que esperan y el proyector van en ventanas",
  JSON.stringify(dialogos.map((m) => m[1]).sort()) === JSON.stringify(["calendario", "cara-a-cara", "categoria", "clasificacion", "contacto", "delegaciones", "ejercicios", "esperas", "hoteles", "medallero", "numeros", "partidas", "paseos", "proyector", "reglamento", "resultados", "sorpresas"]), dialogos.map((m) => m[1]).join(", "));
for (const [, id, cuerpo] of dialogos) {
  // La elección de categoría la abre la ficha «Resultados en vivo», que sin
  // JavaScript sigue llevando a chess-results (js/centroamericano-tablas.js).
  if (id === "resultados") { ok("la ventana «resultados» la abre la ficha «Resultados en vivo»", fichas.includes('id="ficha-resultados"') && /\$\("ficha-resultados"\), dialogoResultados = \$\("resultados"\)/.test(fs.readFileSync(path.join(RAIZ, "js/centroamericano-tablas.js"), "utf8"))); }
  // La de las partidas en vivo la abre la ficha «Partidas en vivo», que
  // queda en «Pronto» hasta que la sala tenga la transmisión de Lichess y
  // entonces la enciende js/centroamericano-partidas.js.
  // La de cada categoría la abren los botones de «Resultados en vivo».
  else if (id === "categoria") { ok("la ventana «categoria» la abren las categorías de «Resultados en vivo»", /abrirCategoria\(tor\.categoria, b\)/.test(fs.readFileSync(path.join(RAIZ, "js/centroamericano-tablas.js"), "utf8"))); }
  // La de los ejercicios de la ronda, la ficha «Ejercicios de la ronda», que
  // queda en «Pronto» hasta que hay alguno (js/centroamericano-ejercicios.js).
  else if (id === "ejercicios") { ok("la ventana «ejercicios» la abre la ficha «Ejercicios de la ronda», cuando hay alguno", fichas.includes('id="ficha-ejercicios"') && /a\.href = "#ejercicios"/.test(fs.readFileSync(path.join(RAIZ, "js/centroamericano-ejercicios.js"), "utf8"))); }
  else if (id === "partidas") { ok("la ventana «partidas» la abre la ficha «Partidas en vivo», cuando hay transmisión", fichas.includes('id="ficha-partidas"') && /a\.href = "#partidas"/.test(fs.readFileSync(path.join(RAIZ, "js/centroamericano-partidas.js"), "utf8"))); }
  else ok("la ventana «" + id + "» tiene su ficha", fichas.includes('href="#' + id + '"'));
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
for (const img of ["mascota.jpg", "mascota-trofeo.png", "mascota-asoma.png", "hojas.png", "bandera-cr.svg"]) {
  ok("la imagen " + img + " existe y se usa", fs.existsSync(path.join(RAIZ, "img/centroamericano-2026", img)) && html.includes("img/centroamericano-2026/" + img));
}
// La firma de la página es de la academia, no de la organización del torneo
// (lo pidió el dueño): el logo de Ajedrez Integral y «Academia Ajedrez
// Integral», sin «Organiza» ni los logos de la CCA y la FCA.
const firma = (html.match(/<section class="cac-academia"[\s\S]*?<\/section>/) || [""])[0];
ok("la franja de arriba es de la Academia Ajedrez Integral, sin «Organiza» ni los logos de la CCA y la FCA",
   /src="img\/logo-marca\.png"/.test(firma) && /Academia Ajedrez <span[^>]*>Integral<\/span>/.test(firma) && !/class="cac-organiza"/.test(html) && !/cca-logo\.png|fca-logo\.png/.test(html));
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
{
  // El francés trae las mismas claves que el inglés, y cada módulo de la
  // página sus textos en los tres idiomas (si falta una, la página muestra
  // «undefined» en francés sin dar ningún error). El francés de los módulos
  // vive en js/centroamericano-fr.js.
  global.window = global.window || {};
  require(path.join(RAIZ, "js/centroamericano-en.js"));
  require(path.join(RAIZ, "js/centroamericano-fr.js"));
  const kEn = Object.keys(window.CentroamericanoEN.textos), kFr = Object.keys(window.CentroamericanoFR.textos);
  ok("el francés trae las mismas claves que el inglés", kEn.length === kFr.length && kEn.every((k) => kFr.includes(k)), JSON.stringify(kEn.filter((k) => !kFr.includes(k)).slice(0, 5)));
  const faltan = [];
  for (const f of ["centroamericano-vivo.js", "centroamericano-tablas.js", "centroamericano-partidas.js", "centroamericano.js"]) {
    const s = fs.readFileSync(path.join(RAIZ, "js", f), "utf8");
    const i = s.indexOf("const TEXTOS = {"), j = s.indexOf("\n  };", i);
    const T = new Function("window", "categoria", "MAX_SEGUIDOS", "fmtPuntos", "NOMBRE_CORTO", "return " + s.slice(i + 15, j + 4))(window, () => "", 20, String, "x");
    ["en", "fr"].forEach((l) => Object.keys(T.es).forEach((k) => { if (!T[l] || !(k in T[l])) faltan.push(f + ":" + l + ":" + k); }));
  }
  ok("cada módulo de la página trae sus textos en español, inglés y francés", !faltan.length, faltan.slice(0, 6).join(" "));
}
ok("la página carga sus traducciones y su código, en ese orden", html.indexOf('<script src="js/centroamericano-fr.js"></script>') > 0 && html.indexOf('<script src="js/centroamericano-fr.js"></script>') < html.indexOf('<script src="js/centroamericano.js"></script>') && html.indexOf('<script src="js/centroamericano-en.js"></script>') > 0 && html.indexOf('<script src="js/centroamericano-en.js"></script>') < html.indexOf('<script src="js/centroamericano.js"></script>'));


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

// Un torneo por categoría: lo que arma la función (torneos-sala.ts), con node.
{
  const J = (no, fed) => ({ puesto: no, no, titulo: "", nombre: "J" + no, fed, elo: 0, grupo: "", puntos: "0" });
  const mesa = (res) => ({ mesa: 1, blancas: { no: 1, titulo: "", nombre: "J1" }, negras: { no: 2, titulo: "", nombre: "J2" }, resultado: res });
  const casos = {
    // CRC juega en dos categorías (blancas en una, negras en la otra).
    juntos: [{ tnr: "1", rondas: 9, categoria: "U10", jugadores: [J(1, "CRC"), J(2, "PAN")], pareo: { ronda: 3, mesas: [mesa("1 - 0")] } },
             { tnr: "2", rondas: 9, categoria: "U10F", jugadores: [J(1, "PAN"), J(2, "CRC")], pareo: { ronda: 3, mesas: [mesa("½ - ½")] } }],
    falta: [{ tnr: "1", rondas: 9, jugadores: [J(1, "CRC"), J(2, "PAN")], pareo: { ronda: 3, mesas: [mesa("1 - 0")] } },
            { tnr: "2", rondas: 9, jugadores: [J(1, "PAN"), J(2, "CRC")], pareo: { ronda: 3, mesas: [mesa("")] } }],
    atras: [{ tnr: "1", rondas: 9, jugadores: [J(1, "CRC"), J(2, "PAN")], pareo: { ronda: 3, mesas: [mesa("1 - 0")] } },
            { tnr: "2", rondas: 9, jugadores: [J(1, "PAN"), J(2, "CRC")], pareo: { ronda: 2, mesas: [mesa("1 - 0")] } }],
    // Un Round Robin de pocos ya jugó su última ronda (la 2): no hace esperar.
    rr: [{ tnr: "1", rondas: 9, jugadores: [J(1, "CRC"), J(2, "PAN")], pareo: { ronda: 3, mesas: [mesa("1 - 0")] } },
         { tnr: "2", rondas: 2, jugadores: [J(1, "PAN"), J(2, "CRC")], pareo: { ronda: 2, mesas: [mesa("1 - 0")] } }],
  };
  const textos = ["Sub-10 Femenino", "U08", "U10F", "Resultados U12 Girls", "Sub 8 Absoluto", "Sub-14 Niñas", "Lista general", "Rapid", "Toda la información del torneo"];
  const r = require("child_process").spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
    `import { codigoCategoria, deCategorias, modalidadDe, resumenDelegacion } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/sala-jugadores/torneos-sala.ts"))};
     const [casos, textos] = JSON.parse(process.argv[1]);
     const out = { modos: [...textos, "Blitz Sub-10 Absoluto", "Rápidas Sub-12 Femenino", "RAPIDAS U14", "Rápida Sub-8", "Blitz-U16F", "Sub-10 Blitzkrieg", "Torneo Rapidito"].map(modalidadDe), codigos: textos.map(codigoCategoria), solo: deCategorias([{ tnr: "g" }, ...casos.juntos]).map((t) => t.tnr), sinCat: deCategorias(casos.falta).length };
     for (const k of Object.keys(casos)) out[k] = resumenDelegacion("es", "CRC", casos[k]);
     out.en = resumenDelegacion("en", "CRC", casos.juntos);
     process.stdout.write(JSON.stringify(out));`, JSON.stringify([casos, textos])], { encoding: "utf8" });
  const o = r.status === 0 ? JSON.parse(r.stdout) : null;
  ok("la función se deja importar con node para probarla", !!o, r.stderr);
  if (o) {
    ok("la categoría sale del texto del enlace, con el código de chess-results",
       JSON.stringify(o.codigos) === JSON.stringify(["U10F", "U08", "U10F", "U12F", "U08", "U14F", "", "", ""]), JSON.stringify(o.codigos));
    ok("la modalidad sale del texto del enlace: Blitz, Rápidas o, sin ninguna, Clásico",
       JSON.stringify(o.modos) === JSON.stringify(["clasico", "clasico", "clasico", "clasico", "clasico", "clasico", "clasico", "rapidas", "clasico", "blitz", "rapidas", "rapidas", "rapidas", "blitz", "clasico", "clasico"]), JSON.stringify(o.modos));
    ok("con torneos de categoría, los otros (la lista general) no se cuentan; sin ellos, todos", JSON.stringify(o.solo) === JSON.stringify(["1", "2"]) && o.sinCat === 2, JSON.stringify(o));
    ok("el resumen de un país junta todas sus categorías en UN aviso por ronda",
       !!o.juntos && o.juntos.ronda === 3 && o.juntos.titulo === "CRC · Ronda 3" && o.juntos.cuerpo === "1 ganada, 1 en tablas: 1½ de 2 puntos en sus partidas.", JSON.stringify(o.juntos));
    ok("y en inglés", !!o.en && o.en.cuerpo === "1 win, 1 draw: 1½ of 2 points in their games.", JSON.stringify(o.en));
    ok("no sale mientras falte una partida en cualquiera de sus categorías", o.falta === null, JSON.stringify(o.falta));
    ok("ni mientras una categoría vaya atrás (todavía sin emparejar esa ronda)", o.atras === null, JSON.stringify(o.atras));
    ok("salvo que esa ya haya terminado (un Round Robin de pocos)", !!o.rr && o.rr.cuerpo === "1 ganada: 1 de 1 puntos en sus partidas.", JSON.stringify(o.rr));
  }
  const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/sala-jugadores/index.ts"), "utf8");
  ok("la función manda un solo resumen por país y ronda (tnr «0»), no uno por torneo",
     /avisar\(s, "delegacion", "0", 0, r\.ronda/.test(fn) && !/for \(const t of torneos\)[\s\S]{0,200}resumenDelegacion/.test(fn));
  ok("y a cada jugador sin «Gr» le pone la categoría de su enlace", /grupo: j\.grupo \|\| t\.categoria/.test(fn));
  ok("la función lee solo los torneos de la modalidad que pide la página, y dice cuáles tiene la sala",
     /sala\.torneos\.filter\(\(t\) => t\.modalidad === modalidad\)\.slice\(0, 15\)/.test(fn) && /json\(\{ torneos, modalidad, modalidades: sala\.modalidades \}\)/.test(fn));
  ok("y los avisos al celular siguen con el clásico", /const torneos = await datosDeSala\(admin, sala\);/.test(fn));
  ok("y manda cada aviso de la organización una vez a cada aparato que ya estaba suscrito, en su idioma",
     /avisar\(s, "anuncio", "0", 0, Number\(a\.id\)/.test(fn) && /new Date\(s\.creada\)\.getTime\(\) > new Date\(a\.creado\)\.getTime\(\)/.test(fn) && /en && a\.texto_en \? a\.texto_en : a\.texto/.test(fn));
}

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

    // En el celular, un PDF dentro del marco no se ve (Chrome en Android dice
    // «Este contenido está bloqueado»): las bases se abren en su pestaña.
    const ctxCel = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const pCel = await ctxCel.newPage();
    await pCel.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    const [pestana] = await Promise.all([ctxCel.waitForEvent("page", { timeout: 10000 }).catch(() => null), pCel.tap('#fichas a[data-ventana="Bases del campeonato"]')]);
    ok("en el celular, las bases se abren en otra pestaña y no en el marco", !!pestana && /bases-cac-2026\.pdf$/.test(pestana.url() || (await pestana.waitForEvent("framenavigated").then((f) => f.url()).catch(() => "")))
      && await pCel.evaluate(() => !document.querySelector("dialog.ventana-enlace")), pestana ? pestana.url() : "sin pestaña nueva");
    // En una página nueva: cambiar solo el «#» no la vuelve a cargar.
    const pCel2 = await ctxCel.newPage();
    await pCel2.goto(BASE + "/" + PAGINA + "#ficha-bases", { waitUntil: "load" });
    ok("y entrar con #ficha-bases no abre el marco vacío", await pCel2.evaluate(() => !document.querySelector("dialog.ventana-enlace")));
    await pCel2.close();
    // Lo que no es PDF (el formulario del bye) sí se sigue abriendo encima.
    await pCel.route(/forms\.gle|docs\.google\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>form</p>" }));
    await pCel.tap('a[data-ventana="Pedir un bye"]');
    ok("lo que no es PDF se sigue abriendo encima en el celular", await pCel.waitForSelector("dialog.ventana-enlace[open]", { timeout: 5000 }).then(() => true).catch(() => false));
    await ctxCel.close();

    // La ficha de afuera, en Torneos, lleva la cara del torneo; las demás salas, la de siempre.
    const ctx3 = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const sala = (clave, nombre) => ({ id: clave, clave, nombre, descripcion: "", emoji: "🏆", tipo: "enlaces", lichess_id: null, enlaces: [{ url: "https://ajedrez-integral.com/" + PAGINA, texto: "Toda la información del torneo" }, { url: "https://s1.chess-results.com/x", texto: "Resultados en vivo" }], pizarras: null, video_url: null, quiniela: false, tema: "cine", visible: true, orden: 0 });
    // El del Centroamericano, ya partido en un torneo por categoría: un enlace de chess-results por cada una.
    const cac = { ...sala("centroamericano-2026", "XXI Festival"), enlaces: [{ url: "https://ajedrez-integral.com/" + PAGINA, texto: "Toda la información del torneo" },
      { url: "https://s1.chess-results.com/tnr1494141.aspx", texto: "Resultados en vivo" }, { url: "https://s1.chess-results.com/tnr1600001.aspx", texto: "Sub-8 Absoluto" }, { url: "https://s1.chess-results.com/tnr1600002.aspx", texto: "Sub-8 Femenino" }] };
    await ctx3.route(/supabase\.co\/rest\/v1\/salas_torneo/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([cac, sala("otra", "Otro torneo"), { ...sala("utn", "Torneo UTN 2026"), tipo: "lichess", lichess_id: "2zDqylwI" }, { ...sala("cenfotec", "Desafío Mentes Maestras"), tipo: "lichess", lichess_id: "s7NfNv6H", enlaces: [{ url: "https://s1.chess-results.com/y", texto: "Posiciones" }] }]) }));
    const p3 = await ctx3.newPage();
    await p3.goto(BASE + "/torneos-en-vivo.html", { waitUntil: "load" });
    await p3.waitForSelector('#salas-lista li[data-sala="otra"]');
    // La marca de agua de Ajedrez Integral en la ficha del Centroamericano: se
    // ve, suave y detrás del texto (lo pidió el dueño); las demás no la llevan.
    const marca = await p3.evaluate(() => {
      const m = document.querySelector('#salas-lista li[data-sala="centroamericano-2026"] .cac-sala-marca');
      const h = document.querySelector('#salas-lista li[data-sala="centroamericano-2026"] h2');
      return { ve: !!m && m.checkVisibility(), op: m ? Number(getComputedStyle(m).opacity) : 1, src: m ? m.getAttribute("src") : "",
        detras: !!m && !!h && Number(getComputedStyle(m).zIndex) < Number(getComputedStyle(h).zIndex), otras: document.querySelectorAll('#salas-lista li:not([data-sala="centroamericano-2026"]) .cac-sala-marca').length };
    });
    ok("la ficha del Centroamericano en Torneos lleva la marca de agua de Ajedrez Integral, suave y detrás del texto",
       marca.ve && marca.op > 0 && marca.op <= 0.2 && /marca-agua-ajedrez-integral\.png$/.test(marca.src) && marca.detras && marca.otras === 0, JSON.stringify(marca));
    const fichaSala = await p3.evaluate(() => {
      const mira = (li) => {
        const m = li.querySelector(".cac-sala-imagen");
        const botones = [...li.querySelectorAll("a")].map((a) => getComputedStyle(a).backgroundColor);
        return { fondo: getComputedStyle(li).backgroundImage, mascota: !!(m && m.checkVisibility() && m.complete && m.naturalWidth > 0 && m.getAttribute("aria-hidden") === "true" && m.alt === ""), botones };
      };
      const cft = document.querySelector('li[data-sala="cenfotec"]');
      const logo = cft.querySelector(".u-sala-imagen");
      return { cac: mira(document.querySelector('li[data-sala="centroamericano-2026"]')), otra: mira(document.querySelector('li[data-sala="otra"]')),
        utn: (() => { const u = document.querySelector('li[data-sala="utn"]'); const i = u.querySelector(".u-sala-imagen");
          return { fondo: getComputedStyle(u).backgroundImage, logo: !!(i && i.checkVisibility() && i.complete && i.naturalWidth > 0 && i.alt === ""),
            boton: [getComputedStyle(u.querySelector("a")).backgroundColor, getComputedStyle(u.querySelector("a")).color] }; })(),
        cft: { fondo: getComputedStyle(cft).backgroundImage, logo: !!(logo && logo.checkVisibility() && logo.complete && logo.naturalWidth > 0 && logo.getAttribute("aria-hidden") === "true" && logo.alt === ""),
          emoji: [...cft.querySelectorAll("p")].some((p) => p.textContent === "🏆"),
          botones: [...cft.querySelectorAll("a")].map((a) => [a.textContent.split(" de ")[0], getComputedStyle(a).backgroundColor, getComputedStyle(a).color]) } };
    });
    ok("en Torneos, la ficha del Centroamericano lleva el morado de las bases y el pizote", /gradient/.test(fichaSala.cac.fondo) && fichaSala.cac.mascota, JSON.stringify(fichaSala.cac));
    ok("y sus botones: el primero rojo, el resto blancos", JSON.stringify(fichaSala.cac.botones) === JSON.stringify(["rgb(206, 19, 40)", "rgb(255, 255, 255)"]), JSON.stringify(fichaSala.cac.botones));
    ok("la del Desafío Mentes Maestras lleva el azul de CENFOTEC y su logo, sin el emoji", /gradient/.test(fichaSala.cft.fondo) && /35, 48, 101/.test(fichaSala.cft.fondo) && fichaSala.cft.logo && !fichaSala.cft.emoji, JSON.stringify(fichaSala.cft));
    ok("y sus botones: «Entrar a la sala» celeste con letra oscura, los enlaces blancos", JSON.stringify(fichaSala.cft.botones) === JSON.stringify([["Entrar a la sala", "rgb(35, 172, 244)", "rgb(20, 28, 64)"], ["Posiciones", "rgb(255, 255, 255)", "rgb(35, 48, 101)"]]), JSON.stringify(fichaSala.cft.botones));
    ok("la de la UTN lleva su azul, su logo y «Entrar a la sala» en el celeste de sus puntos con letra oscura", /25, 58, 112/.test(fichaSala.utn.fondo) && fichaSala.utn.logo
      && JSON.stringify(fichaSala.utn.boton) === JSON.stringify(["rgb(191, 207, 232)", "rgb(15, 42, 85)"]), JSON.stringify(fichaSala.utn));
    ok("las demás salas siguen con su ficha de siempre", fichaSala.otra.fondo === "none" && !fichaSala.otra.mascota, JSON.stringify(fichaSala.otra));
    // Ningún botón de la ficha del torneo saca a nadie del sitio: la página
    // en la misma pestaña, y los resultados y las bases, a su ficha de la página.
    const destinos = await p3.evaluate(() => [...document.querySelectorAll('li[data-sala="centroamericano-2026"] a')]
      .map((a) => a.getAttribute("href") + (a.target ? " target=" + a.target : "") + " | " + a.textContent.split(" de ")[0]));
    ok("en Torneos, ningún botón del Centroamericano se va del sitio, y los resultados de todas las categorías son UN botón",
       JSON.stringify(destinos) === JSON.stringify(["/" + PAGINA + " | Toda la información del torneo", "/" + PAGINA + "#resultados | Resultados en vivo"]), JSON.stringify(destinos));
    const otraSala = await p3.evaluate(() => [...document.querySelectorAll('li[data-sala="otra"] a')].map((a) => a.target));
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
      const leer = () => pg.evaluate(() => { const rel = document.getElementById("hoy-reloj");
        return { estado: document.getElementById("hoy").dataset.estado,
          texto: ["hoy-etiqueta", "hoy-principal", "hoy-detalle"].map((id) => document.getElementById(id).textContent).join(" | "),
          reloj: rel.checkVisibility() ? { etiqueta: rel.querySelector("[data-reloj-etiqueta]").textContent,
            cifras: [...rel.querySelectorAll(".cac-hoy-reloj-casilla")].map((c) => c.innerText.replace(/\s+/g, " ")).join(" | "),
            sr: rel.querySelector("[data-reloj-texto]").textContent, oculto: rel.querySelector("[data-reloj-cifras]").getAttribute("aria-hidden") } : null }; });
      const r = await leer();
      // Un segundo después, la cuenta bajó un segundo.
      await pg.clock.runFor(1000);
      r.despues = await leer();
      await c.close();
      return r;
    };
    let h = await hoyEn("2026-10-24T10:00:00-06:00");
    const hAntes = h;
    ok("antes del festival, la cuenta regresiva", h.estado === "antes" && /Faltan 8 días/.test(h.texto) && /ronda 1 se juega el lunes 2 de noviembre a las 9:30/.test(h.texto), h.texto);
    h = await hoyEn("2026-11-02T10:15:00-06:00");
    ok("durante una ronda, lo que se juega ahora y lo que sigue", h.estado === "durante" && /Ahora: Ronda 1/.test(h.texto) && /Después: Ronda 2, hoy a las 3:30/.test(h.texto), h.texto);
    h = await hoyEn("2026-11-03T21:00:00-06:00");
    ok("entre rondas, lo próximo, y cuánto falta lo dice el reloj (sin repetir la fecha)", /Lo próximo: Ronda 4/.test(h.texto) && /Mañana, miércoles 4 de noviembre, a las 9:00/.test(h.texto) && !/faltan/.test(h.texto) && h.reloj && h.reloj.etiqueta === "Faltan:" && /^1[12] HORAS/i.test(h.reloj.cifras), h.texto + " " + JSON.stringify(h.reloj));
    // La cuenta regresiva a la próxima ronda, con días, horas, minutos y segundos.
    ok("antes del festival, la cuenta regresiva a la ronda 1 con sus días",
       hAntes.reloj && /^Faltan para la ronda 1 \(el lunes 2 de noviembre a las 9:30/.test(hAntes.reloj.etiqueta) && /^(9 DÍAS \| 00 HORAS \| 30|8 DÍAS \| 23 HORAS \| 29) MIN \| \d\d SEG$/i.test(hAntes.reloj.cifras), JSON.stringify(hAntes.reloj));
    h = await hoyEn("2026-11-02T10:15:00-06:00");
    ok("durante la ronda 1, la cuenta va a la ronda 2, sin días", h.reloj && /ronda 2 \(hoy a las 3:30/.test(h.reloj.etiqueta) && /^05 HORAS \| 1[45] MIN \| \d\d SEG$/i.test(h.reloj.cifras), JSON.stringify(h.reloj));
    // Cuántos segundos faltan, leído de las casillas.
    const segs = (c) => c.split(" | ").map((x) => parseInt(x, 10)).reduce((a, v, i, l) => a + v * [3600, 60, 1].slice(-l.length)[i], 0);
    ok("cambia cada segundo, y los números no se leen: el lector de pantalla oye una frase",
       h.despues.reloj && segs(h.reloj.cifras) - segs(h.despues.reloj.cifras) === 1 && h.reloj.oculto === "true" && /^Faltan 5 horas, 1[45] minutos para la ronda 2\.$/.test(h.reloj.sr), JSON.stringify(h.despues.reloj) + " " + h.reloj.sr);
    h = await hoyEn("2026-11-07T10:00:00-06:00");
    ok("en la última ronda ya no hay cuenta regresiva", h.reloj === null, JSON.stringify(h.reloj));
    h = await hoyEn("2026-11-03T21:00:00-06:00", "fr");
    ok("y en francés", h.reloj && /^Commence dans :$/.test(h.reloj.etiqueta) && /HEURES/i.test(h.reloj.cifras), JSON.stringify(h.reloj));
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
    // Sin los números de la cuenta regresiva, que cambian cada segundo.
    const textoSinReloj = () => p4.evaluate(() => document.body.innerText.replace((document.querySelector("#hoy-reloj [data-reloj-cifras]") || {}).innerText || "\u0000", ""));
    const textoEs = await textoSinReloj();
    await cambiarIdioma(p4);
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
    ok("y la página lo dice (lang=en, el título, el botón dice «English»)", en.lang === "en" && /^Central American/.test(en.titulo) && /English/.test(en.boton), JSON.stringify(en));
    await p4.click('#fichas a[data-ventana="Championship regulations"]');
    await p4.waitForSelector("dialog.ventana-enlace[open]");
    ok("lo que se abre después también va en inglés", await p4.evaluate(() => { const d = document.querySelector("dialog.ventana-enlace"); return d.querySelector("h2").textContent === "Championship regulations" && /Close/.test(d.textContent) && /Open in a new tab/.test(d.textContent); }));
    await p4.keyboard.press("Escape");
    await p4.waitForFunction(() => !document.querySelector("dialog.ventana-enlace"));
    await p4.reload({ waitUntil: "load" });
    await guardada(p4);
    ok("la elección se recuerda al volver", await p4.evaluate(() => document.documentElement.lang === "en"));
    await cambiarIdioma(p4);
    ok("y al volver al español queda exactamente como estaba", (await textoSinReloj()) === textoEs && await p4.evaluate(() => document.documentElement.lang === "es"));

    // El francés: el menú de idiomas, y todo texto de la página con el suyo.
    await p4.click("#cac-idioma");
    const menu = await p4.evaluate(() => ({ abierto: document.getElementById("cac-idiomas").checkVisibility(), expandido: document.getElementById("cac-idioma").getAttribute("aria-expanded"),
      opciones: [...document.querySelectorAll("#cac-idiomas [data-idioma]")].map((b) => b.textContent + (b.getAttribute("aria-current") ? "*" : "") + "|" + b.lang),
      foco: document.activeElement && document.activeElement.dataset.idioma }));
    ok("el botón del idioma abre la lista de los tres, cada uno en su idioma, con el de ahora marcado y el foco en él",
       menu.abierto && menu.expandido === "true" && JSON.stringify(menu.opciones) === JSON.stringify(["Español*|es", "English|en", "Français|fr"]) && menu.foco === "es", JSON.stringify(menu));
    await p4.keyboard.press("Escape");
    ok("Escape la cierra y deja el foco en el botón", await p4.evaluate(() => !document.getElementById("cac-idiomas").checkVisibility() && document.activeElement.id === "cac-idioma"
       && document.getElementById("cac-idioma").getAttribute("aria-expanded") === "false"));
    await cambiarIdioma(p4, "fr");
    const fr = await p4.evaluate(() => {
      const valores = new Set(Object.values(window.CentroamericanoFR.textos));
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
      return { sinTraducir, lang: document.documentElement.lang, boton: document.getElementById("cac-idioma").textContent, titulo: document.title,
        hoy: document.getElementById("hoy-etiqueta").textContent, calendario: document.getElementById("hoy-calendario").textContent };
    });
    ok("en francés, ningún texto se queda en español", fr.sinTraducir.length === 0, JSON.stringify(fr.sinTraducir.slice(0, 8)));
    ok("y la página lo dice (lang=fr, el título, el botón y «Hoy en el torneo»)", fr.lang === "fr" && /^Championnat d'Amérique centrale/.test(fr.titulo) && /Français/.test(fr.boton)
       && /^(Compte à rebours|Aujourd'hui au tournoi|Le festival est terminé)$/.test(fr.hoy) && fr.calendario === "Voir tout le calendrier →", JSON.stringify(fr));
    await cambiarIdioma(p4, "en");
    ok("de francés a inglés pasa por el español: ningún texto queda en francés", await p4.evaluate(() => {
      const fr = new Set(Object.values(window.CentroamericanoFR.textos)), en = new Set(Object.values(window.CentroamericanoEN.textos));
      return document.documentElement.lang === "en" && ![...document.querySelectorAll("#fichas h3, #fichas p")].some((e) => fr.has(e.textContent.trim()) && !en.has(e.textContent.trim()));
    }));
    await cambiarIdioma(p4, "es");
    ok("y al volver al español, otra vez exactamente como estaba", (await textoSinReloj()) === textoEs);

    // Qué hacer en el tiempo libre: la ficha abre la ventana y los botones filtran.
    await p4.click('#fichas a[href="#paseos"]');
    await p4.waitForFunction(() => document.getElementById("paseos").open, null, { timeout: 5000 }).catch(() => {});
    const visibles = () => p4.evaluate(() => [...document.querySelectorAll("#paseos .cac-paseo")].filter((li) => li.checkVisibility()).map((li) => li.querySelector("h3").textContent.replace(/^\S+ /, "")));
    const todos = await visibles();
    await p4.click('#paseos [data-paseo-filtro="techo"]');
    const techo = await visibles();
    const puesto = await p4.evaluate(() => [...document.querySelectorAll("#paseos [data-paseo-filtro]")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.paseoFiltro));
    await p4.click('#paseos [data-paseo-filtro="excursion"]');
    const excursion = await visibles();
    ok("la ficha «Qué hacer en el tiempo libre» abre sus 14 paseos, cada uno con su mapa y cómo llegar", todos.length === 14 && await p4.evaluate(() =>
      [...document.querySelectorAll("#paseos .cac-paseo")].every((li) => li.querySelectorAll('a[href^="https://www.google.com/maps/"]').length === 2)), JSON.stringify(todos));
    ok("«Si llueve» deja solo los bajo techo, y el botón dice que está puesto", techo.length === 9 && !techo.includes("Parque Metropolitano La Sabana") && techo.includes("Museo de los Niños") && JSON.stringify(puesto) === '["techo"]', JSON.stringify([techo, puesto]));
    ok("«Excursión de medio día», los tres de lejos", JSON.stringify(excursion) === JSON.stringify(["Volcán Poás", "Volcán Irazú", "La Paz Waterfall Gardens"]), JSON.stringify(excursion));
    await p4.click('#paseos [data-paseo-filtro="todos"]');
    ok("«Todos» los vuelve a mostrar", (await visibles()).length === 14);
    await p4.keyboard.press("Escape");
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
    ok("le pide a la función la sala del torneo, no una dirección", await p6.evaluate(() => JSON.stringify(window.__pedidos[0]) === JSON.stringify(["sala-jugadores", { clave: "centroamericano-2026", modalidad: "clasico" }])));
    r = await buscar("munoz jose");
    ok("sin tildes y en cualquier orden, y el bye se dice", r.tarjetas.length === 1 && /tiene bye/.test(r.tarjetas[0]), JSON.stringify(r));
    r = await buscar("castillo");
    ok("con el resultado si ya lo hay", /Juega con negras contra WFM Wilson, Hannah \(BAR, 1920\)/.test(r.tarjetas[0]) && /Resultado: 0 - 1/.test(r.tarjetas[0]), JSON.stringify(r));
    r = await buscar("zzzz");
    ok("y si no hay nadie, lo dice", !r.tarjetas.length && /No encontramos/.test(r.estado), r.estado);
    // El profe (js/centroamericano-profe.js): cara de «mmm» al lado de «nadie», y se va al encontrar.
    const caraProfe = () => p6.evaluate(() => { const e = document.getElementById("buscador-estado");
      return (e.dataset.profe || "") + "|" + getComputedStyle(e, "::before").backgroundImage; });
    let cp = await caraProfe();
    ok("sin nadie, el profe pone su cara de «mmm» al lado (se ve: el dibujo en ::before)", /^mmm\|url\(.*avatar-profe-oscar\/mmm\.webp/.test(cp), cp);
    await buscar("mayorga");
    cp = await caraProfe();
    ok("y al encontrar a alguien, la cara se va", cp === "|none", cp);
    // «¿Te ayudo?»: el botón con su cara abre el panel con las preguntas.
    const pf = await p6.evaluate(() => { const b = document.getElementById("profe-boton");
      return { ve: !!b && b.checkVisibility(), globo: b && b.querySelector(".cac-profe-globo").checkVisibility(), texto: b && b.textContent.trim(),
        aria: b && b.getAttribute("aria-expanded"), panel: document.getElementById("profe-panel").checkVisibility(), fijo: b && getComputedStyle(b).position }; });
    ok("el botón del profe está abajo, fijo, con «¿Te ayudo?» la primera vez y el panel cerrado",
       pf.ve && pf.globo && pf.texto === "¿Te ayudo?" && pf.aria === "false" && !pf.panel && pf.fijo === "fixed", JSON.stringify(pf));
    await p6.click("#profe-boton");
    // El dibujo puede tardar en llegar (en el CI tarda): se espera a que cargue, con un tope.
    await p6.waitForFunction(() => { const i = document.querySelector("#profe-panel img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
    const lp = await p6.evaluate(() => { const pn = document.getElementById("profe-panel");
      return { ve: pn.checkVisibility(), aria: document.getElementById("profe-boton").getAttribute("aria-expanded"), titulo: pn.querySelector("#profe-titulo").textContent,
        preguntas: [...pn.querySelectorAll("[data-pregunta]")].map((b) => b.textContent), foco: document.activeElement.dataset.pregunta,
        img: [...pn.querySelectorAll("img")].map((i) => i.alt + ":" + i.complete + ":" + i.naturalWidth), globo: document.querySelector(".cac-profe-globo").checkVisibility(),
        nombre: /Oscar/.test(pn.textContent + document.getElementById("profe-boton").textContent + document.getElementById("profe-boton").getAttribute("aria-label")) }; });
    ok("al tocarlo: el panel abierto, «¡Hola! Soy el profe» y las seis preguntas, con el foco en la primera",
       lp.ve && lp.aria === "true" && lp.titulo === "¡Hola! Soy el profe" && lp.preguntas.length === 6 && /¿En qué mesa juega mi hijo\?/.test(lp.preguntas[0]) && lp.foco === "mesa", JSON.stringify(lp));
    ok("dice «el profe», nunca su nombre (lo pidió el dueño)", !lp.nombre);
    ok("su dibujo carga y es de adorno (alt vacío): lo que dice va escrito", lp.img.length === 1 && /^:true:[1-9]\d+$/.test(lp.img[0]), JSON.stringify(lp.img));
    ok("y el globito ya no vuelve a salir", !lp.globo);
    await p6.click('[data-pregunta="hora"]');
    const rp = await p6.evaluate(() => ({ titulo: document.getElementById("profe-titulo").textContent, foco: document.activeElement.id,
      img: document.querySelector("#profe-panel img").getAttribute("src"), boton: (document.querySelector("#profe-panel [data-accion]") || {}).textContent }));
    ok("una pregunta: su respuesta, la pose que le toca y el botón que lleva", rp.titulo === "¿A qué hora es la ronda?" && rp.foco === "profe-titulo" && /reloj-de-ajedrez\.webp$/.test(rp.img) && rp.boton === "Ver el calendario", JSON.stringify(rp));
    await p6.click("#profe-panel [data-accion]");
    await p6.waitForTimeout(200);
    const cal = await p6.evaluate(() => ({ abierto: document.getElementById("calendario").open, panel: document.getElementById("profe-panel").checkVisibility(), boton: document.getElementById("profe-boton").checkVisibility() }));
    ok("«Ver el calendario» lo abre, y con la ventana abierta el profe se aparta", cal.abierto && !cal.panel && !cal.boton, JSON.stringify(cal));
    await p6.keyboard.press("Escape");
    await p6.waitForTimeout(200);
    await p6.click("#profe-boton");
    await p6.click('[data-pregunta="mesa"]');
    await p6.click("#profe-panel [data-accion]");
    ok("«Llévame al buscador» cierra el panel y pone el foco en el campo",
       await p6.evaluate(() => document.activeElement.id === "buscador-nombre" && !document.getElementById("profe-panel").checkVisibility() && document.getElementById("profe-boton").getAttribute("aria-expanded") === "false"));
    await p6.click("#profe-boton");
    await p6.click('[data-pregunta="instalar"]');
    await p6.click("[data-volver]");
    ok("«← Otras preguntas» vuelve a la lista, con el foco en la que se abrió", await p6.evaluate(() => document.activeElement.dataset.pregunta === "instalar"));
    await p6.keyboard.press("Escape");
    ok("Escape lo cierra y devuelve el foco al botón", await p6.evaluate(() => document.activeElement.id === "profe-boton" && !document.getElementById("profe-panel").checkVisibility()));
    await p6.click('a[href="#medallero"]');
    await p6.waitForFunction(() => /Provisional/.test(document.getElementById("medallero-contenido").textContent));
    const med = await p6.evaluate(() => ({ filas: [...document.querySelectorAll("#medallero-contenido tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()),
      podios: [...document.querySelectorAll("#medallero-contenido .cac-podio")].map((c) => c.innerText.replace(/\s+/g, " ").trim()) }));
    ok("el medallero cuenta los tres primeros de cada categoría por federación", JSON.stringify(med.filas) === JSON.stringify(["CRC 2 0 0 2", "PAN 1 0 0 1", "CUB 0 1 0 1", "ESA 0 1 0 1", "BAR 0 0 1 1", "GUA 0 0 1 1"]), JSON.stringify(med.filas));
    ok("y los podios van por categoría, de la menor a la mayor", med.podios.length === 3 && /^Sub-8 Absoluto/.test(med.podios[0]) && /^Sub-18 Femenino .*1\. IM Castillo/.test(med.podios[2]), JSON.stringify(med.podios));
    await p6.keyboard.press("Escape");
    await cambiarIdioma(p6);
    r = await buscar("mayorga");
    ok("en inglés, el buscador también", /Round 4 · Board 1 · Plays white against/.test(r.tarjetas[0]) && /U18 Open · Rating 2215 · Place 1 of 3/.test(r.tarjetas[0]), JSON.stringify(r));
    await cambiarIdioma(p6);

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
    await cambiarIdioma(p6);
    await p6.waitForFunction(() => window.__pedidos.some((x) => x[1].accion === "seguir"), null, { timeout: 5000 }).catch(() => {});
    ok("en inglés, el botón, la delegación y los avisos cambian de idioma", await p6.evaluate(() => /Notifications on this phone: on/.test(document.getElementById("avisos-boton").textContent)
      && /^2 players from Costa Rica \(CRC\)/.test(document.getElementById("delegacion-estado").textContent)
      && window.__pedidos.some((x) => x[1].accion === "seguir" && x[1].idioma === "en")));
    await cambiarIdioma(p6);

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
    // Su Elo con las reglas de FIDE (js/pareo/elo.js): lo esperado de la tabla
    // 8.1.2 contra 2252, 2145 y 1994 es 0,45 + 0,60 + 0,78 = 1,83, y con K 40
    // (Sub-18 con menos de 2300), 40 × (3 − 1,83) = +46,8.
    const extra = await p6.evaluate(() => { const c = document.querySelector("#buscador-resultados .cac-jugador-rondas");
      return { elo: (c.querySelector(".cac-elo") || {}).textContent, colores: (c.querySelector(".cac-colores") || {}).textContent }; });
    ok("«Sus rondas» trae el Elo FIDE que gana en el torneo, con las reglas de FIDE", extra.elo === "Elo FIDE: +46,8 en 3 partidas con rivales con Elo (K 40).", extra.elo);
    ok("y lo que hizo con blancas y con negras (sin la ronda de hoy, que no tiene resultado)", extra.colores === "Con blancas: 2 de 2 · con negras: 1 de 1.", extra.colores);
    // Su puesto después de cada ronda, por puntos y del cuadro cruzado (la ronda 4 todavía no).
    await buscar("guevara");
    await p6.click('#buscador-resultados [data-rondas="1494141-1"]');
    const puestos = await p6.evaluate(() => { const c = document.querySelector("#buscador-resultados .cac-jugador-rondas"); return { linea: c.querySelector(".cac-puestos").textContent, nota: c.textContent.includes("se comparte el puesto") }; });
    ok("«Sus rondas» trae su puesto ronda a ronda; empatado en puntos, el puesto compartido", puestos.linea === "Su puesto en la categoría después de cada ronda: R1 2.º–3.º · R2 2.º · R3 2.º" && puestos.nota, JSON.stringify(puestos));
    await cambiarIdioma(p6);
    const puestosEn = await p6.evaluate(() => document.querySelector("#buscador-resultados .cac-puestos").textContent);
    ok("y en inglés, con sus ordinales", puestosEn === "Their place in the section after each round: R1 2nd–3rd · R2 2nd · R3 2nd", puestosEn);
    await cambiarIdioma(p6);
    await p6.click('#buscador-resultados [data-rondas="1494141-1"]');
    await buscar("mayorga");

    // La imagen para compartir: un PNG de 1080 × 1080 con la marca de agua.
    await p6.evaluate(() => { const m = window.TablaImagen.marcar; window.__marcas = 0; window.TablaImagen.marcar = (c) => { window.__marcas++; return m(c); }; });
    const [descarga] = await Promise.all([p6.waitForEvent("download", { timeout: 15000 }), p6.click('#buscador-resultados [data-accion="compartir"]')]);
    const png = fs.readFileSync(await descarga.path());
    const anchoPng = png.readUInt32BE(16), altoPng = png.readUInt32BE(20);
    ok("«Compartir» da una imagen de 1080 × 1080 con su nombre de archivo", png.slice(1, 4).toString() === "PNG" && anchoPng === 1080 && altoPng === 1080 && /^centroamericano-2026-mayorga-araya-sofia\.png$/.test(descarga.suggestedFilename()), anchoPng + "×" + altoPng + " " + descarga.suggestedFilename());
    ok("y lleva la marca de agua de Ajedrez Integral", await p6.evaluate(() => window.__marcas === 1));

    // «¡Hoy juega!»: la tarjeta de antes de la ronda, con el QR de su enlace
    // directo y el mensaje con el enlace que se toca. Sin el puesto.
    const hj = await p6.evaluate(async () => {
      const V = window.CentroamericanoVivo, x = V.jugadores().find((y) => /Mayorga/.test(y.j.nombre));
      const b = document.querySelector('#buscador-resultados [data-accion="hoy-juega"]');
      let marcas = 0; const orig = window.TablaImagen.marcar;
      window.TablaImagen.marcar = async (c) => { marcas++; return orig(c); };
      const escrito = [], fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { escrito.push(String(t)); return fill.call(this, t, ...r); };
      const qr = [], qrOrig = window.qrcode;
      window.qrcode = (...a) => { const q = qrOrig(...a); const add = q.addData.bind(q); q.addData = (t) => { qr.push(t); return add(t); }; return q; };
      const blob = await window.CentroamericanoTablas.imagenHoyJuega(x);
      window.TablaImagen.marcar = orig; CanvasRenderingContext2D.prototype.fillText = fill; window.qrcode = qrOrig;
      const img = await createImageBitmap(blob);
      return { boton: b && b.checkVisibility() ? b.textContent : null, w: img.width, h: img.height, tipo: blob.type, marcas, escrito, qr, enlace: V.enlaceDe(x),
        mensaje: window.CentroamericanoTablas.mensajeHoyJuega(x), ronda: x.ronda, mesa: x.partida && x.partida.mesa };
    });
    ok("con la ronda emparejada y sin resultado, la tarjeta trae «📣 ¡Hoy juega!»", hj.boton === "📣 ¡Hoy juega!", JSON.stringify(hj.boton));
    ok("su imagen es de 1080 × 1920, en PNG y con la marca de agua", hj.w === 1080 && hj.h === 1920 && hj.tipo === "image/png" && hj.marcas === 1, JSON.stringify([hj.w, hj.h, hj.tipo, hj.marcas]));
    ok("dice la ronda y la mesa, el rival, a quién seguir y el logo; el puesto no", hj.escrito.includes("Ronda " + hj.ronda + " · Mesa " + hj.mesa) && hj.escrito.some((t) => /^Con (blancas|negras) contra$/.test(t))
      && hj.escrito.includes("Sigue a Sofia en vivo") && hj.escrito.includes("Ajedrez Integral") && !hj.escrito.some((t) => /Puesto|\.º/.test(t)), JSON.stringify(hj.escrito));
    ok("el QR lleva su enlace directo (#jugador=…)", hj.qr.length === 1 && hj.qr[0] === hj.enlace && /#jugador=1494141-2-/.test(hj.enlace), JSON.stringify([hj.qr, hj.enlace]));
    ok("y el mensaje que va con la imagen trae el enlace, que en un chat se toca", hj.mensaje.includes(hj.enlace) && /^📣 ¡(Hoy juega|Mañana juega|Juega) Sofia! Ronda \d+, mesa \d+/.test(hj.mensaje), hj.mensaje);

    // Sus rondas en el calendario del celular: un .ics con cada ronda de su
    // torneo a la hora del calendario de la página (en hora de Costa Rica),
    // lo que hizo en las jugadas, su mesa y rival en la emparejada, y el aviso
    // 30 minutos antes. El UID fijo deja ponerlo al día bajándolo otra vez.
    const [dIcs] = await Promise.all([p6.waitForEvent("download", { timeout: 15000 }), p6.click('#buscador-resultados [data-accion="calendario"]')]);
    const ics = fs.readFileSync(await dIcs.path(), "utf8").replace(/\r\n /g, "");
    const evs = ics.split("BEGIN:VEVENT").slice(1);
    const deRonda = (n) => (evs.find((e) => e.includes("SUMMARY:Ronda " + n + " ·")) || "").replace(/\\,/g, ",");
    const rondasTorneo = await p6.evaluate(() => window.CentroamericanoVivo.jugadores().find((y) => /Mayorga/.test(y.j.nombre)).torneo.rondas);
    ok("«Sus rondas en mi calendario» baja un .ics con una ronda por evento, con su nombre de archivo",
      dIcs.suggestedFilename() === "centroamericano-2026-rondas-mayorga-araya-sofia.ics" && evs.length === rondasTorneo && rondasTorneo > 0, dIcs.suggestedFilename() + " · " + evs.length + " de " + rondasTorneo);
    ok("cada ronda a la hora del calendario, en hora de Costa Rica, con el aviso 30 minutos antes",
      /DTSTART;TZID=America\/Costa_Rica:20261102T093000/.test(deRonda(1)) && /DTEND;TZID=America\/Costa_Rica:20261102T143000/.test(deRonda(1))
      && evs.every((e) => /TRIGGER:-PT30M/.test(e)) && /UID:cac2026-1494141-\d+-r1@ajedrez-integral\.com/.test(deRonda(1)), deRonda(1));
    ok("la jugada dice lo que hizo; la emparejada, su mesa, color y rival; la que falta, que se vuelva a bajar",
      /ganó a FM Guevara Ruiz|ganó a/.test(deRonda(1)) && /Mesa \d+, con blancas contra FM Guevara Ruiz, Santiago Jose \(ESA, 2252\)/.test(deRonda(4))
      && /vuelve a bajar el calendario/.test(deRonda(5)) && /SUMMARY:Ronda 4 · Sofia Mayorga Araya — Centroamericano 2026/.test(deRonda(4)), deRonda(4));

    // El resumen de la ronda de una delegación, listo para WhatsApp.
    await p6.selectOption("#delegacion", "CRC");
    const resumen = await p6.evaluate(() => { const r = document.querySelector("#delegacion-lista .cac-resumen"); return r ? { texto: r.innerText.replace(/\s+/g, " "), copia: r.dataset.texto } : null; });
    ok("Mi delegación trae el resumen de la última ronda con resultados («-0» es «sin jugar», no un bye)", resumen && /^Ronda 3: 1 ganada, 1 sin jugar\. 1 de 2 puntos posibles\./.test(resumen.texto), JSON.stringify(resumen));
    await p6.click("#delegacion-lista .cac-resumen button");
    const copiado = await p6.evaluate(() => navigator.clipboard.readText());
    ok("«Copiar para WhatsApp» copia el resumen con cada jugador y el enlace", copiado.split("\n")[0] === "Costa Rica (CRC) — Ronda 3, Centroamericano 2026"
      && copiado.includes("✅ Mayorga Araya, Sofia (Sub-18 Absoluto) ganó a WFM Ferrer Naranjo, Liennys (CUB, 1994)")
      && copiado.includes("➖ Muñoz Solís, José (Sub-8 Absoluto) no jugó") && /https:\/\/ajedrez-integral\.com\/centroamericano-2026\.html$/.test(copiado), copiado);

    // «Así terminó el día»: la ronda 4 va por la mitad, así que el día cerrado es
    // el de la ronda 3 (martes 3, la única de ese día en el calendario).
    const dia = await p6.evaluate(() => window.CentroamericanoTablas.resumenDelDia());
    ok("el día es el de la última ronda con todas sus partidas terminadas", dia && dia.titulo === "Así terminó el día" && dia.fecha === "Martes 3 de noviembre · ronda 3", JSON.stringify(dia));
    ok("con el líder de cada categoría después de esa ronda (no del pareo a medias)", dia && JSON.stringify(dia.lideres) === JSON.stringify([
      "Sub-8 Absoluto: Muñoz Solís, José (CRC) · 1½ puntos",
      "Sub-18 Absoluto: WIM Mayorga Araya, Sofia (CRC) · 3 puntos",
      "Sub-18 Femenino: IM Castillo Beitia, Ashley Alexandra (PAN) · 1½ puntos"]), JSON.stringify(dia && dia.lideres));
    ok("la sorpresa del día y cómo le fue a la delegación elegida", dia && /^Ronda 3 · Sub-18 Femenino: IM Castillo Beitia.* hizo tablas con FM Ordonez Bonilla/.test(dia.sorpresa)
      && dia.delegacion === "Costa Rica (CRC) hoy: 1 de 2 puntos (1 ganada)", JSON.stringify(dia));
    await p6.evaluate(() => { window.__marcas = 0; });
    const [descDia] = await Promise.all([p6.waitForEvent("download", { timeout: 15000 }), p6.click("#imagen-dia")]);
    const pngDia = fs.readFileSync(await descDia.path());
    ok("el botón baja la imagen del día, de 1080 de ancho, con la marca de agua", pngDia.slice(1, 4).toString() === "PNG" && pngDia.readUInt32BE(16) === 1080 && pngDia.readUInt32BE(20) >= 1080
      && descDia.suggestedFilename() === "centroamericano-2026-2026-11-03.png" && await p6.evaluate(() => window.__marcas === 1), descDia.suggestedFilename());
    await cambiarIdioma(p6);
    const diaEn = await p6.evaluate(() => ({ boton: document.getElementById("imagen-dia").textContent, d: window.CentroamericanoTablas.resumenDelDia() }));
    ok("y en inglés", /Today's image to share/.test(diaEn.boton) && diaEn.d.titulo === "How the day ended" && diaEn.d.fecha === "Tuesday, November 3 · round 3"
      && diaEn.d.delegacion === "Costa Rica (CRC) today: 1 of 2 points (1 win)", JSON.stringify(diaEn));
    await cambiarIdioma(p6);

    // La hoja de la delegación en PDF: sus jugadores en la ronda emparejada, por categoría.
    const hoja = await p6.evaluate(() => {
      const d = window.CentroamericanoTablas.documentoDelegacion("CRC");
      return { titulo: d.titulo, nota: d.bloques.find((b) => b.tipo === "nota").texto, tablas: d.bloques.filter((b) => b.tipo !== "nota").map((b) => b.tipo === "tabla" ? b.filas : b.texto) };
    });
    ok("y dice cuándo se leyó, sin puntos de más", /^Leído en chess-results: .*\d\S*\sa\.\sm\. Lo oficial es lo que publica el árbitro en chess-results\.$/.test(hoja.nota) && !/\.\./.test(hoja.nota), hoja.nota);
    ok("la hoja de la delegación trae a cada uno con mesa, color, rival y resultado", hoja.titulo === "Costa Rica (CRC) · Ronda 4" && JSON.stringify(hoja.tablas) === JSON.stringify([
      "2 jugadores · pareo de la ronda 4",
      "Sub-8 Absoluto", [["—", "Muñoz Solís, José", "2", "—", "bye (descansa)", ""]],
      "Sub-18 Absoluto", [["1", "WIM Mayorga Araya, Sofia", "3", "Blancas", "FM Guevara Ruiz, Santiago Jose (ESA, 2252)", ""]]]), JSON.stringify(hoja));
    const [descPdf] = await Promise.all([p6.waitForEvent("download", { timeout: 15000 }), p6.click("#delegacion-pdf")]);
    const pdf = fs.readFileSync(await descPdf.path()).toString("latin1");
    ok("el botón baja el PDF con su nombre, los jugadores y la marca de agua", pdf.startsWith("%PDF-") && descPdf.suggestedFilename() === "centroamericano-2026-crc-ronda-4.pdf"
      && pdf.includes("Mayorga Araya, Sofia") && pdf.includes("FM Guevara Ruiz, Santiago Jose \\(ESA, 2252\\)") && pdf.includes("/Marca Do")
      && /Listo: la hoja se bajó/.test(await p6.textContent("#delegacion-lista .cac-hoja [role=status]")), descPdf.suggestedFilename());
    await cambiarIdioma(p6);
    const hojaEn = await p6.evaluate(() => { const d = window.CentroamericanoTablas.documentoDelegacion("CRC"); return { t: d.titulo, p: d.pagina(1, 2), boton: document.getElementById("delegacion-pdf").textContent }; });
    ok("y en inglés, también el número de página", hojaEn.t === "Costa Rica (CRC) · Round 4" && hojaEn.p === "Page 1 of 2" && /Delegation sheet to print/.test(hojaEn.boton), JSON.stringify(hojaEn));
    await cambiarIdioma(p6);
    // Con cada color, el país entero: Mayorga 2 de 2 con blancas y 1 de 1 con
    // negras; Muñoz ½ de 1 con negras (su bye y su «-0» no son partidas).
    ok("el resumen de la delegación dice cómo le fue al país con cada color",
       await p6.textContent("#delegacion-lista .cac-colores-pais") === "En el torneo, con blancas 2 de 2 y con negras 1½ de 2.", await p6.textContent("#delegacion-lista .cac-colores-pais"));
    const inf = await p6.evaluate(() => { const d = window.CentroamericanoTablas.documentoInforme("CRC");
      return { titulo: d.titulo, parrafos: d.bloques.filter((b) => b.tipo === "parrafo").map((b) => b.texto), filas: d.bloques.find((b) => b.tipo === "tabla").filas, final: d.final }; });
    ok("el informe de la delegación: provisional, sus puntos, sus medallas, sus colores y su Elo",
       inf.titulo === "Costa Rica (CRC) · Informe de la delegación" && !inf.final && JSON.stringify(inf.parrafos) === JSON.stringify([
         "Provisional: así va después de la ronda 3.", "2 jugadores · 4½ de 6 puntos en sus partidas.", "Medallas (si terminara hoy): 2 de oro.",
         "En el torneo, con blancas 2 de 2 y con negras 1½ de 2.", "Elo FIDE de la delegación: +46,8 entre 1 jugador con Elo (una cuenta de este torneo; lo oficial lo publica FIDE)."]), JSON.stringify(inf));
    ok("y cada jugador con su categoría, puesto (y medalla), rendimiento, Elo y colores", JSON.stringify(inf.filas) === JSON.stringify([
      ["Sub-8 Absoluto", "Muñoz Solís, José", "2", "1.º · oro", "1920", "—", "—", "½/1"],
      ["Sub-18 Absoluto", "WIM Mayorga Araya, Sofia", "3", "1.º · oro", "2930", "+46,8", "2/2", "1/1"]]), JSON.stringify(inf.filas));
    const [descInf] = await Promise.all([p6.waitForEvent("download", { timeout: 15000 }), p6.click("#delegacion-informe")]);
    const pdfInf = fs.readFileSync(await descInf.path()).toString("latin1");
    ok("el botón baja el informe en PDF, con la marca de agua", pdfInf.startsWith("%PDF-") && descInf.suggestedFilename() === "centroamericano-2026-crc-informe-ronda-3.pdf"
      && pdfInf.includes("Mayorga Araya, Sofia") && pdfInf.includes("/Marca Do") && /Listo: el informe se bajó/.test(await p6.textContent("#delegacion-lista .cac-hoja [role=status]")), descInf.suggestedFilename());
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
    await p6.selectOption("#proyector-modo", "todo");
    // Una sola categoría, para la pantalla de su sala.
    ok("el proyector ofrece elegir la categoría (con todas las que hay)", await p6.evaluate(() => { const s = document.getElementById("proyector-categoria");
      return s.checkVisibility() && JSON.stringify([...s.options].map((o) => o.textContent)) === JSON.stringify(["Todas las categorías", "Sub-8 Absoluto", "Sub-18 Absoluto", "Sub-18 Femenino"]); }));
    await p6.selectOption("#proyector-categoria", "U18F");
    const solaCat = [];
    for (let i = 0; i < 3; i++) { solaCat.push((await proy()).titulo); await p6.click("#proyector-siguiente"); }
    ok("con una categoría, solo pasa la suya: su pareo y su clasificación (y se recuerda)", solaCat.every((x) => /Sub-18 Femenino/.test(x)) && solaCat.some((x) => /^Ronda 4/.test(x)) && solaCat.some((x) => /^Clasificación/.test(x))
      && await p6.evaluate(() => localStorage.getItem("cac_proyector_categoria_v1") === "U18F"), JSON.stringify(solaCat));
    await p6.selectOption("#proyector-categoria", "");
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

    // «El festival en números». Las partidas, contadas una vez desde las
    // blancas: Mayorga 2 (ganó las 2), Guevara 1 (ganó), Castillo 2 (ganó y
    // tablas) y Wilson 1 (perdió con blancas en la ronda 4): 6 partidas, 4 de
    // las blancas, 1 en tablas, 1 de las negras.
    await p6.click('a[href="#numeros"]');
    await p6.waitForFunction(() => document.getElementById("numeros").open && document.querySelector("#numeros-contenido .cac-numeros"), null, { timeout: 5000 }).catch(() => {});
    const num = await p6.evaluate(() => ({ cifras: [...document.querySelectorAll("#numeros-contenido .cac-numero")].map((d) => d.querySelector("dd").textContent + " " + d.querySelector("dt").textContent),
      parrafos: [...document.querySelectorAll("#numeros-contenido > p")].map((p) => p.textContent) }));
    ok("«El festival en números»: jugadores, países, categorías y partidas", JSON.stringify(num.cifras) === JSON.stringify(["7 jugadores", "6 países", "3 categorías", "6 partidas jugadas"]), JSON.stringify(num));
    ok("y cómo les fue a las blancas, la sorpresa más grande y el país con más medallas", JSON.stringify(num.parrafos.slice(0, 5)) === JSON.stringify([
      "Hasta la ronda 4: se pone al día con cada ronda.", "Ganaron las blancas el 67 % · tablas el 17 % · ganaron las negras el 17 %.",
      "Ronda 1 · Sub-18 Absoluto: WIM Mayorga Araya, Sofia (CRC, 2215) le ganó a FM Guevara Ruiz, Santiago Jose (ESA, 2252), 37 puntos de Elo más.",
      "Todavía ninguna.", "Costa Rica (CRC): 2 de oro (si terminara hoy)."]), JSON.stringify(num.parrafos));
    // La mejor remontada, con los puestos de una jugadora puestos a mano: del
    // 12.º tras la ronda 2 al 2.º (la subida más grande gana, aunque no sea la primera de la lista).
    const remonta = await p6.evaluate(() => {
      const V = window.CentroamericanoVivo, antes = V.puestosDe;
      // El primero de la lista (Mayorga) sube 3; el segundo (Guevara), 10.
      V.puestosDe = (x) => (x.j.no === 1 ? [{ ronda: 1, desde: 9, hasta: 9 }, { ronda: 2, desde: 12, hasta: 12 }, { ronda: 3, desde: 2, hasta: 2 }]
        : x.j.no === 2 ? [{ ronda: 1, desde: 5, hasta: 5 }, { ronda: 2, desde: 2, hasta: 2 }] : []);
      const r = window.CentroamericanoTablas.numerosDelFestival().remontada;
      V.puestosDe = antes;
      return r;
    });
    ok("la mejor remontada es la subida más grande desde su peor puesto", remonta === "FM Guevara Ruiz, Santiago Jose (ESA), Sub-18 Absoluto: del 12.º tras la ronda 2 al 2.º.", remonta);
    // La marca ya la cuenta lo que se instaló para la imagen de la delegación: solo se pone en cero.
    await p6.evaluate(() => { window.__marcas = 0; });
    const [descNum] = await Promise.all([p6.waitForEvent("download", { timeout: 15000 }), p6.click("#numeros-imagen")]);
    const pngNum = fs.readFileSync(await descNum.path());
    ok("y se comparte como imagen, con la marca de agua", pngNum.slice(1, 4).toString() === "PNG" && pngNum.readUInt32BE(16) === 1080
      && descNum.suggestedFilename() === "centroamericano-2026-en-numeros-ronda-4.png" && await p6.evaluate(() => window.__marcas === 1), descNum.suggestedFilename() + " " + pngNum.readUInt32BE(16) + " marcas " + await p6.evaluate(() => window.__marcas));
    await p6.keyboard.press("Escape");

    // Cara a cara: dos jugadores lado a lado, con su partida y cada ronda.
    await p6.click('a[href="#cara-a-cara"]');
    await p6.waitForFunction(() => document.getElementById("cara-a-cara").open && document.querySelectorAll("#cara-lista option").length === 7);
    const cara = async (a, b) => {
      await p6.fill("#cara-a", a); await p6.fill("#cara-b", b);
      return p6.evaluate(() => ({ frase: [...document.querySelectorAll("#cara-a-cara-contenido > p")].map((p) => p.textContent).join(" | "),
        fichas: [...document.querySelectorAll("#cara-a-cara-contenido .cac-cara section")].map((f) => [f.querySelector("h3").textContent, ...[...f.querySelectorAll("dt")].map((dt) => dt.textContent + "|" + dt.nextElementSibling.textContent)]),
        rondas: [...document.querySelectorAll("#cara-a-cara-contenido .cac-cara-rondas > li")].map((li) => [...li.querySelectorAll("p, li")].map((x) => x.textContent)) }));
    };
    let cc = await cara("", "");
    ok("sin elegir, dice cómo se usa", cc.frase === "Escribe el apellido de cada uno y elígelo de la lista." && !cc.fichas.length, JSON.stringify(cc));
    cc = await cara("mayorga", "WIM Mayorga Araya, Sofia · CRC · Sub-18 Absoluto");
    ok("el mismo dos veces, lo avisa", cc.frase === "Elige dos jugadores distintos.", JSON.stringify(cc));
    cc = await cara("mayorga", "guevara");
    ok("con dos de la misma categoría, sus datos lado a lado", JSON.stringify(cc.fichas) === JSON.stringify([
      ["WIM Mayorga Araya, Sofia", "Categoría|Sub-18 Absoluto", "País|Costa Rica (CRC)", "Elo|2215", "Puesto|1 / 3", "Puntos|3", "Rendimiento|2930"],
      ["FM Guevara Ruiz, Santiago Jose", "Categoría|Sub-18 Absoluto", "País|El Salvador (ESA)", "Elo|2252", "Puesto|2 / 3", "Puntos|2½", "Rendimiento|2068"]]), JSON.stringify(cc.fichas));
    ok("la partida entre los dos (la primera vez que se enfrentaron)", cc.frase === "Se enfrentaron en la ronda 1: WIM Mayorga Araya, Sofia (con blancas) le ganó a FM Guevara Ruiz, Santiago Jose.", cc.frase);
    ok("y cada ronda de los dos, con su puesto después", cc.rondas.length === 4 && JSON.stringify(cc.rondas[0]) === JSON.stringify(["Ronda 1",
      "Mayorga Araya: ganó a FM Guevara Ruiz, Santiago Jose (ESA, 2252) · 1.º", "Guevara Ruiz: perdió con WIM Mayorga Araya, Sofia (CRC, 2215) · 2.º–3.º"])
      && /^Mayorga Araya: juega contra FM Guevara/.test(cc.rondas[3][1]), JSON.stringify(cc.rondas));
    ok("las dos fichas quedan una al lado de la otra en la computadora", await p6.evaluate(() => { const f = document.querySelectorAll("#cara-a-cara-contenido .cac-cara section"); return f.length === 2 && Math.abs(f[0].getBoundingClientRect().top - f[1].getBoundingClientRect().top) < 2 && f[1].getBoundingClientRect().right <= document.getElementById("cara-a-cara").getBoundingClientRect().right; }));
    cc = await cara("mayorga", "castillo");
    ok("de categorías distintas, dice que no se pueden enfrentar", /^Juegan en categorías distintas/.test(cc.frase), cc.frase);
    cc = await cara("zzzz", "castillo");
    ok("y si no hay nadie con ese nombre, lo dice", cc.frase === "No encontramos a nadie con ese nombre.", cc.frase);
    await p6.click("#cara-a-cara [data-cerrar]");

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
    ok("mientras el torneo no termina, no hay certificado", await p6.evaluate(() => !document.querySelector('#buscador-resultados [data-accion^="diploma"]')));
    // Con un solo torneo (todas las categorías juntas), la ficha lo abre directo, como siempre.
    await p6.route(/chess-results\.com/, (rt) => rt.fulfill({ status: 200, contentType: "text/html", body: "<p>cr</p>" }));
    await p6.click("#ficha-resultados");
    const unoSolo = await p6.waitForFunction(() => { const d = document.querySelector("dialog.ventana-enlace"); return d && d.open && !document.getElementById("resultados").open && d.querySelector("iframe").src; }, null, { timeout: 5000 }).then((h) => h.jsonValue()).catch(() => null);
    ok("con un solo torneo, «Resultados en vivo» lo abre directo, sin elegir categoría", !!unoSolo && /tnr1494141/.test(unoSolo), String(unoSolo));
    await p6.keyboard.press("Escape");
    await ctx6.close();

    // Un torneo por categoría: doce torneos de prueba con la forma que les da
    // la función (la categoría del texto de su enlace), más la lista general.
    // Cada uno a su paso: el Sub-8 es un Round Robin que ya terminó (3 rondas),
    // el Sub-10 va atrás (ronda 4 sin terminar), los demás en la 5, y al
    // Sub-12 le falta una partida.
    {
      const CATS = ["U08", "U08F", "U10", "U10F", "U12", "U12F", "U14", "U14F", "U16", "U16F", "U18", "U18F"];
      const nombreCat = (c) => "Sub-" + Number(c.slice(1, 3)) + (c.endsWith("F") ? " Femenino" : " Absoluto");
      const urlDe = (tnr) => "https://s1.chess-results.com/tnr" + tnr + ".aspx?lan=2&turdet=YES&art=1";
      const mesaDe = (c, res) => ({ mesa: 1, blancas: { no: 1, titulo: "", nombre: "Primero " + c + ", Ana" }, negras: { no: 2, titulo: "", nombre: "Segundo " + c + ", Luis" }, resultado: res });
      const DOCE = { torneos: [
        { tnr: "1494141", url: urlDe(1494141), texto: "Lista general", categoria: "", leido_en: "2026-11-04T16:05:00Z", ronda: 0, rondas: 9,
          jugadores: [{ puesto: 1, no: 7, titulo: "WIM", nombre: "Mayorga Araya, Sofia", fed: "CRC", elo: 2215, grupo: "U18F", puntos: "0" }], pareo: null },
        ...CATS.map((c, i) => ({ tnr: String(1600001 + i), url: urlDe(1600001 + i), texto: nombreCat(c), categoria: c, leido_en: "2026-11-04T16:05:00Z",
          ronda: c === "U08" ? 3 : 4, rondas: c === "U08" ? 3 : 9,
          jugadores: [{ puesto: 1, no: 1, titulo: "", nombre: c === "U18F" ? "Mayorga Araya, Sofia" : "Primero " + c + ", Ana", fed: "CRC", elo: 0, grupo: c, puntos: "4" },
                      { puesto: 2, no: 2, titulo: "", nombre: "Segundo " + c + ", Luis", fed: "PAN", elo: 0, grupo: c, puntos: "3" }],
          pareo: c === "U08" ? { ronda: 3, mesas: [mesaDe(c, "1 - 0")] } : c === "U10" ? { ronda: 4, mesas: [mesaDe(c, "")] } : { ronda: 5, mesas: [mesaDe(c, c === "U12" ? "" : "1 - 0")] } })),
      ] };
      const ctx12 = await nav.newContext({ viewport: { width: 375, height: 800 }, serviceWorkers: "block" });
      await ctx12.addInitScript((d) => {
        // Los avisos de la organización (sala_anuncios): la base da los vigentes.
        window.__anunciosPedidos = [];
        const anuncios = { select() { return this; }, eq(c, v) { window.__anunciosPedidos.push([c, v]); return this; }, order() { return this; }, limit() { return this; },
          then(ok) { return Promise.resolve({ data: [{ id: 1, texto: "La ronda 6 se atrasa 30 minutos.", texto_en: "Round 6 is delayed by 30 minutes.", creado: "2026-11-04T15:00:00Z" }], error: null }).then(ok); } };
        window.sb = { functions: { invoke: async () => ({ data: d, error: null }) }, from: (t) => (t === "sala_anuncios" ? anuncios : null) };
        // Alguien que seguía a una jugadora en la lista general, de antes de partir el torneo.
        if (!localStorage.getItem("cac_seguidos_v1")) localStorage.setItem("cac_seguidos_v1", JSON.stringify([{ tnr: "1494141", no: 7, nombre: "Mayorga Araya, Sofia" }]));
      }, DOCE);
      const pd = await ctx12.newPage();
      await pd.route(/chess-results\.com/, (rt) => rt.fulfill({ status: 200, contentType: "text/html", body: "<p>cr</p>" }));
      await pd.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
      await pd.waitForFunction(() => !document.getElementById("anuncios").hidden, null, { timeout: 5000 }).catch(() => {});
      const aviso = await pd.evaluate(() => { const a = document.querySelector("#anuncios .cac-anuncio"); const cs = a && getComputedStyle(a);
        return { ve: !!a && a.checkVisibility(), texto: a ? a.textContent : "", colores: cs ? [cs.backgroundColor, cs.color] : [], arriba: !!a && a.compareDocumentPosition(document.querySelector(".cac-hoy")) === Node.DOCUMENT_POSITION_FOLLOWING, pedido: window.__anunciosPedidos }; });
      ok("el aviso de la organización sale arriba de «Hoy en el torneo», con su hora (pedido solo de esta sala)", aviso.ve && aviso.arriba
        && aviso.texto.replace(/\s/g, " ") === "📢 Aviso de la organización · 4 nov, 9:00 a. m.La ronda 6 se atrasa 30 minutos." && JSON.stringify(aviso.pedido) === JSON.stringify([["sala", "centroamericano-2026"]]), JSON.stringify(aviso));
      ok("en blanco sobre el rojo de las bases (5,6)", JSON.stringify(aviso.colores) === JSON.stringify(["rgb(206, 19, 40)", "rgb(255, 255, 255)"]), JSON.stringify(aviso.colores));
      await cambiarIdioma(pd);
      ok("y en inglés, con su texto en inglés", /Notice from the organizers .*Round 6 is delayed by 30 minutes\.$/.test(await pd.textContent("#anuncios .cac-anuncio")), await pd.textContent("#anuncios .cac-anuncio"));
      await cambiarIdioma(pd);
      await pd.fill("#buscador-nombre", "mayorga");
      await pd.waitForTimeout(450);
      const encontrados = await pd.evaluate(() => [...document.querySelectorAll("#buscador-resultados li")].map((l) => l.innerText.replace(/\s+/g, " ").trim()));
      ok("con un torneo por categoría, cada jugador sale UNA vez (la lista general no se cuenta)", encontrados.length === 1 && /Sub-18 Femenino/.test(encontrados[0]), JSON.stringify(encontrados));
      await pd.waitForFunction(() => JSON.parse(localStorage.getItem("cac_seguidos_v1") || "[]")[0]?.tnr === "1600012", null, { timeout: 5000 }).catch(() => {});
      const seguida = await pd.evaluate(() => JSON.parse(localStorage.getItem("cac_seguidos_v1") || "[]"));
      ok("quien la seguía en la lista general pasa a seguirla en su categoría (torneo y número nuevos)",
         seguida.length === 1 && seguida[0].tnr === "1600012" && seguida[0].no === 1, JSON.stringify(seguida));
      const hoyCat = await pd.evaluate(() => { const p = document.getElementById("hoy-categorias"); return { ve: p.checkVisibility(), texto: p.textContent }; });
      ok("«Hoy en el torneo» dice qué categorías van a otro paso (solo esas)",
         hoyCat.ve && hoyCat.texto === "A otro paso: Sub-8 Absoluto ya terminó sus 3 rondas · Sub-10 Absoluto va en la ronda 4.", JSON.stringify(hoyCat));
      const prog = await pd.evaluate(() => window.CentroamericanoVivo.progresoRonda());
      ok("la barra de la ronda cuenta solo las mesas de la ronda más alta (10 de las 12 categorías van en la 5)", !!prog && prog.ronda === 5 && prog.total === 10 && prog.hechas === 9, JSON.stringify(prog));
      ok("y la ronda cerrada espera a la categoría que va atrás, no al Round Robin que ya terminó", !!prog && prog.cerrada === 3, JSON.stringify(prog));

      // La ficha «Resultados en vivo» abre la elección de categoría, no un torneo.
      await pd.click("#ficha-resultados");
      await pd.waitForFunction(() => document.getElementById("resultados").open && document.querySelector("#resultados .cac-categorias"), null, { timeout: 5000 }).catch(() => {});
      const eleccion = await pd.evaluate(() => {
        const d = document.getElementById("resultados");
        const filas = [...d.querySelectorAll(".cac-categorias > li")].map((li) => [li.querySelector(".cac-categoria-edad").textContent,
          ...[...li.querySelectorAll(".cac-categoria")].map((a) => a.textContent + "|" + a.getAttribute("aria-label") + "|" + a.dataset.categoria)]);
        const b = d.querySelector(".cac-categoria"), cs = b ? getComputedStyle(b) : {};
        return { abierta: d.checkVisibility(), ventana: !!document.querySelector("dialog.ventana-enlace"), filas,
          otros: [...d.querySelectorAll(".cac-otros a")].map((a) => a.textContent), afuera: [...d.querySelectorAll("a[href]")].map((a) => a.href),
          colores: [cs.backgroundColor, cs.color],
          costado: d.scrollWidth - d.clientWidth, enPantalla: [...d.querySelectorAll(".cac-categoria")].every((a) => a.checkVisibility() && a.getBoundingClientRect().right <= window.innerWidth) };
      });
      const filasEsperadas = [8, 10, 12, 14, 16, 18].map((n) => ["Sub-" + n, "Absoluto|Sub-" + n + " Absoluto|U" + String(n).padStart(2, "0"), "Femenino|Sub-" + n + " Femenino|U" + String(n).padStart(2, "0") + "F"]);
      ok("«Resultados en vivo» abre la elección de categoría encima (no un torneo)", eleccion.abierta && !eleccion.ventana, JSON.stringify(eleccion));
      ok("una fila por edad, Absoluto y Femenino lado a lado, cada uno con su nombre entero para el lector",
         JSON.stringify(eleccion.filas) === JSON.stringify(filasEsperadas), JSON.stringify(eleccion.filas));
      ok("ningún enlace a chess-results: ni las categorías ni la lista general (quien mira no sale de la página)",
         !eleccion.afuera.length && !eleccion.otros.length, JSON.stringify(eleccion));
      ok("blanco sobre el morado de las bases (8,35)", JSON.stringify(eleccion.colores) === JSON.stringify(["rgb(64, 71, 143)", "rgb(255, 255, 255)"]), JSON.stringify(eleccion.colores));
      ok("en un celular cabe entero, sin scroll de costado", eleccion.costado <= 0 && eleccion.enPantalla, JSON.stringify(eleccion));
      // Cada categoría abre SU ventana: el pareo de la ronda y la clasificación,
      // con el diseño de la página.
      await pd.click('#resultados [aria-label="Sub-10 Femenino"]', { timeout: 5000 }).catch(() => {});
      await pd.waitForFunction(() => document.getElementById("categoria").open && document.querySelector("#categoria-contenido .cac-cat-mesa"), null, { timeout: 5000 }).catch(() => {});
      const vCat = () => pd.evaluate(() => {
        const d = document.getElementById("categoria");
        return { abierta: !!d && d.open && d.checkVisibility(), titulo: document.getElementById("categoria-titulo").textContent,
          estado: (d.querySelector("[data-cat-estado]") || {}).textContent,
          puesta: [...d.querySelectorAll("[data-cat-vista]")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent),
          filas: [...d.querySelectorAll("#categoria-contenido tbody tr, #categoria-contenido .cac-cat-mesa")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()),
          marco: !!document.querySelector("dialog.ventana-enlace"), afuera: [...d.querySelectorAll("a[href]")].map((a) => a.href),
          costado: d.scrollWidth - d.clientWidth };
      });
      let vc = await vCat();
      ok("cada categoría abre su ventana en la página, sin chess-results ni un marco", vc.abierta && vc.titulo === "Sub-10 Femenino" && !vc.marco && !vc.afuera.length, JSON.stringify(vc));
      ok("con el pareo de la ronda: mesa, blancas, resultado y negras, con país y puntos", vc.estado === "Ronda 5 · 1 de 1 partida terminada."
         && JSON.stringify(vc.puesta) === JSON.stringify(["Pareo"]) && vc.filas.length === 1
         && /^Mesa 1 Blancas: ♔ Primero U10F, Ana CRC · 4 puntos 1 - 0 Negras: ♚ Segundo U10F, Luis PAN · 3 puntos$/.test(vc.filas[0]), JSON.stringify(vc));
      ok("y en el celular cabe sin scroll de costado", vc.costado <= 0, JSON.stringify(vc));
      await pd.click('#categoria [data-cat-vista="clasificacion"]');
      vc = await vCat();
      ok("«Clasificación»: la de la categoría, en el orden de chess-results", JSON.stringify(vc.puesta) === JSON.stringify(["Clasificación"]) && vc.filas.length === 2 && /^1 Primero U10F, Ana CRC/.test(vc.filas[0]), JSON.stringify(vc));
      await pd.fill("#categoria [data-cat-buscar]", "segundo");
      vc = await vCat();
      ok("el buscador de la categoría deja solo a quien se busca", vc.filas.length === 1 && /Segundo U10F, Luis/.test(vc.filas[0]), JSON.stringify(vc));
      await pd.fill("#categoria [data-cat-buscar]", "");
      await pd.keyboard.press("Escape");
      await pd.waitForFunction(() => !document.getElementById("categoria").open, null, { timeout: 5000 }).catch(() => {});
      ok("al cerrarla se vuelve a la elección, con el foco en su botón", await pd.evaluate(() => document.getElementById("resultados").open && document.activeElement && document.activeElement.getAttribute("aria-label") === "Sub-10 Femenino"));
      // Tocar un jugador lleva a sus rondas, en «Busca a tu jugador».
      await pd.click('#resultados [aria-label="Sub-10 Femenino"]');
      await pd.waitForSelector("#categoria-contenido .cac-cat-jugador");
      await pd.click('#categoria-contenido .cac-cat-jugador[aria-label="Ver las rondas de Primero U10F, Ana"]');
      await pd.waitForFunction(() => document.querySelector('#buscador-resultados [data-rondas="1600004-1"][aria-expanded="true"]'), null, { timeout: 5000 }).catch(() => {});
      ok("tocar un jugador cierra las ventanas y abre su tarjeta con «Sus rondas»", await pd.evaluate(() => !document.getElementById("categoria").open && !document.getElementById("resultados").open
         && !!document.querySelector('#buscador-resultados [data-rondas="1600004-1"][aria-expanded="true"]') && location.hash.startsWith("#jugador=1600004-1-")));
      await pd.evaluate(() => { history.replaceState(null, "", location.pathname); document.getElementById("buscador-nombre").value = ""; });
      // Una categoría que todavía no publicaron deja su hueco: la fila no se corre.
      await pd.evaluate(() => { const d = window.CentroamericanoVivo.datos(); d.torneos = d.torneos.filter((t) => t.categoria !== "U16F"); document.getElementById("resultados").close(); });
      await pd.click("#ficha-resultados");
      await pd.waitForFunction(() => document.getElementById("resultados").open, null, { timeout: 5000 }).catch(() => {});
      const hueco = await pd.evaluate(() => { const li = [...document.querySelectorAll("#resultados .cac-categorias > li")][4]; if (!li) return null; return [li.children.length, li.querySelectorAll(".cac-categoria").length, li.lastElementChild.className]; });
      ok("una categoría sin torneo todavía deja su hueco en la fila", JSON.stringify(hueco) === JSON.stringify([3, 1, "cac-categoria-falta"]), JSON.stringify(hueco));
      await pd.keyboard.press("Escape");
      // En inglés.
      await cambiarIdioma(pd);
      await pd.click("#ficha-resultados");
      await pd.waitForFunction(() => document.getElementById("resultados").open, null, { timeout: 5000 }).catch(() => {});
      ok("y en inglés", await pd.evaluate(() => { const li = document.querySelector("#resultados .cac-categorias > li"); return !!li && li.innerText.replace(/\s+/g, " ").trim() === "U8 Open Girls" && document.querySelector("#resultados h2").textContent.includes("Live results"); }),
         await pd.evaluate(() => document.querySelector("#resultados").innerText.slice(0, 200)));
      await pd.keyboard.press("Escape");
      await cambiarIdioma(pd);
      // Desde Torneos se entra con «#resultados»: abre la elección ya llena.
      const pe = await ctx12.newPage();
      await pe.goto(BASE + "/" + PAGINA + "#resultados", { waitUntil: "load" });
      ok("entrar con #resultados (el botón de Torneos) abre la elección de categoría", await pe.waitForFunction(() => document.getElementById("resultados").open && document.querySelectorAll("#resultados .cac-categorias .cac-categoria").length === 12, null, { timeout: 5000 }).then(() => true).catch(() => false));
      // El medallero: final solo cuando terminaron TODOS.
      await pe.keyboard.press("Escape");
      await pe.click('a[href="#medallero"]');
      await pe.waitForFunction(() => /Provisional|Final/i.test(document.getElementById("medallero-contenido").textContent), null, { timeout: 5000 }).catch(() => {});
      const medallero = await pe.evaluate(() => ({ estado: document.querySelector("#medallero-contenido > p").textContent, podios: document.querySelectorAll("#medallero-contenido .cac-podio").length,
        listos: (document.querySelector("#medallero-contenido .cac-podios-listos") || {}).textContent,
        cada: [...document.querySelectorAll("#medallero-contenido .cac-podio")].slice(0, 2).map((c) => c.querySelector("h3").textContent + " | " + c.querySelector(".cac-podio-estado").textContent) }));
      ok("el medallero sigue provisional mientras alguna categoría juega (el Sub-8 ya terminó), con sus 12 podios",
         /Provisional/.test(medallero.estado) && medallero.podios === 12, JSON.stringify(medallero));
      ok("cada podio dice si ya es final o hasta qué ronda va, y cuántas categorías ya están definidas",
         JSON.stringify(medallero.cada) === JSON.stringify(["Sub-8 Absoluto | Final", "Sub-8 Femenino | Provisional, tras la ronda 4"])
         && medallero.listos === "1 de 12 categorías ya tiene su podio final; las medallas de las demás todavía pueden cambiar.", JSON.stringify(medallero));
      // El proyector pasa los podios solo de las categorías que terminaron.
      await pe.keyboard.press("Escape");
      await pe.click('a[href="#proyector"]');
      await pe.waitForFunction(() => document.getElementById("proyector").open && document.getElementById("proyector-categoria").options.length > 1, null, { timeout: 5000 }).catch(() => {});
      const titulos = async (cat) => {
        await pe.selectOption("#proyector-categoria", cat);
        const out = [];
        for (let i = 0; i < 3; i++) { out.push(await pe.textContent("#proyector-titulo") + " | " + (await pe.textContent("#proyector-contenido")).slice(0, 40)); await pe.click("#proyector-siguiente"); }
        return out;
      };
      const enJuego = await titulos("U12F"), terminada = await titulos("U08");
      ok("el proyector no pasa el podio de una categoría que sigue jugando", enJuego.every((x) => !/podio/i.test(x)), JSON.stringify(enJuego));
      ok("y sí el de la que ya terminó", terminada.some((x) => /podio/i.test(x) && /Sub-8 Absoluto/.test(x)), JSON.stringify(terminada));
      await pe.selectOption("#proyector-categoria", "");
      await ctx12.close();
    }

    // El diploma: con la clasificación final (chess-results ya no dice la ronda
    // ni trae pareo, y normalizar() lo marca terminado), en imagen y en PDF.
    const FINAL = JSON.parse(JSON.stringify(DATOS));
    FINAL.torneos[0].ronda = 0; FINAL.torneos[0].pareo = null;
    const ctxDip = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: true });
    await ctxDip.addInitScript((d) => { window.sb = { functions: { invoke: async () => ({ data: d, error: null }) } }; }, FINAL);
    const pDip = await ctxDip.newPage();
    await pDip.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    await pDip.fill("#buscador-nombre", "mayorga");
    await pDip.waitForSelector('#buscador-resultados [data-accion="diploma-pdf"]', { timeout: 10000 }).catch(() => {});
    const botonesDip = await pDip.evaluate(() => [...document.querySelectorAll('#buscador-resultados [data-accion^="diploma"]')].map((b) => b.textContent + (b.checkVisibility() ? "" : " (oculto)")));
    ok("con el torneo terminado, cada tarjeta trae su certificado en PDF y en imagen", JSON.stringify(botonesDip) === JSON.stringify(["Certificado (PDF)", "Certificado (imagen)"]), JSON.stringify(botonesDip));
    // «Así terminó mi torneo»: la imagen final, del tamaño del estado de WhatsApp y con la marca de agua.
    ok("con el torneo terminado, la tarjeta trae «Así terminó mi torneo»", await pDip.evaluate(() => { const b = document.querySelector('#buscador-resultados [data-accion="asi-termino"]'); return !!b && b.checkVisibility() && b.textContent === "🏁 Así terminó mi torneo"; }));
    const fin = await pDip.evaluate(async () => {
      let marcas = 0; const orig = window.TablaImagen.marcar;
      window.TablaImagen.marcar = async (c) => { marcas++; return orig(c); };
      const x = window.CentroamericanoVivo.jugadores().find((y) => /Mayorga/.test(y.j.nombre));
      const b = await window.CentroamericanoTablas.imagenFinal(x);
      window.TablaImagen.marcar = orig;
      const img = await createImageBitmap(b);
      return { w: img.width, h: img.height, tipo: b.type, marcas };
    });
    ok("y su imagen es de 1080 × 1920 (el estado de WhatsApp), en PNG y con la marca de agua", fin.w === 1080 && fin.h === 1920 && fin.tipo === "image/png" && fin.marcas === 1, JSON.stringify(fin));
    ok("el nombre va al derecho, con el título adelante", await pDip.evaluate(() => window.CentroamericanoTablas.nombreAlDerecho({ titulo: "WIM", nombre: "Mayorga Araya, Sofia" }) === "WIM Sofia Mayorga Araya"
      && window.CentroamericanoTablas.nombreAlDerecho({ titulo: "", nombre: "Wilson Hannah" }) === "Wilson Hannah"));
    // Con la cara de las bases: el morado del fondo (arriba #40478F, abajo
    // #5A5FA3) y la píldora roja del evento, medidos en el lienzo.
    const colores = await pDip.evaluate(async () => {
      const V = window.CentroamericanoVivo;
      // Lo que se escribe en el lienzo, para ver que dice «certificado».
      const escrito = [], fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { escrito.push(String(t)); return fill.call(this, t, ...r); };
      const c = await window.CentroamericanoTablas.diploma(V.jugadores().find((y) => y.j.no === 2));
      CanvasRenderingContext2D.prototype.fillText = fill;
      const px = (x, y) => Array.from(c.getContext("2d").getImageData(x, y, 1, 1).data.slice(0, 3));
      return { arriba: px(1169, 40), abajo: px(1169, 1620), pildora: px(c.width / 2 - 700, 650), escrito };
    });
    const cerca = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 14);
    ok("el certificado lleva el morado de las bases y la píldora roja del evento", cerca(colores.arriba, [64, 71, 143]) && cerca(colores.abajo, [90, 95, 163]) && cerca(colores.pildora, [206, 19, 40]), JSON.stringify(colores));
    ok("dice «CERTIFICADO» arriba y en ningún lado «diploma»", colores.escrito.includes("CERTIFICADO") && !colores.escrito.some((t) => /diploma/i.test(t)), JSON.stringify(colores.escrito));
    await pDip.evaluate(() => { const m = window.TablaImagen.marcar; window.__marcas = 0; window.TablaImagen.marcar = (c) => { window.__marcas++; return m(c); }; });
    const [dImg] = await Promise.all([pDip.waitForEvent("download", { timeout: 20000 }), pDip.click('#buscador-resultados [data-accion="diploma-imagen"]')]);
    const pngDip = fs.readFileSync(await dImg.path());
    ok("«Certificado (imagen)» da un A4 acostado (2339 × 1654) con la marca de agua", pngDip.slice(1, 4).toString() === "PNG" && pngDip.readUInt32BE(16) === 2339 && pngDip.readUInt32BE(20) === 1654
      && dImg.suggestedFilename() === "centroamericano-2026-certificado-mayorga-araya-sofia.png" && await pDip.evaluate(() => window.__marcas === 1), dImg.suggestedFilename());
    const [dPdf] = await Promise.all([pDip.waitForEvent("download", { timeout: 20000 }), pDip.click('#buscador-resultados [data-accion="diploma-pdf"]')]);
    const pdfDip = fs.readFileSync(await dPdf.path()).toString("latin1");
    ok("«Certificado (PDF)» da una página A4 acostada con la imagen de borde a borde", pdfDip.startsWith("%PDF-") && pdfDip.includes("/MediaBox [0 0 841.89 595.28]")
      && pdfDip.includes("/DCTDecode") && pdfDip.includes("/Count 1") && pdfDip.includes("(Certificado · WIM Sofia Mayorga Araya)".replace("·", "\xb7"))
      && dPdf.suggestedFilename() === "centroamericano-2026-certificado-mayorga-araya-sofia.pdf" && await pDip.evaluate(() => window.__marcas === 2), dPdf.suggestedFilename());
    // Todos los diplomas de la delegación en un PDF: los dos de Costa Rica.
    await pDip.selectOption("#delegacion", "CRC");
    await pDip.waitForSelector("#delegacion-diplomas", { timeout: 10000 }).catch(() => {});
    const [dTodos] = await Promise.all([pDip.waitForEvent("download", { timeout: 30000 }), pDip.click("#delegacion-diplomas")]);
    const pdfTodos = fs.readFileSync(await dTodos.path()).toString("latin1");
    ok("«Todos los certificados» da un PDF con una hoja por jugador de la delegación, cada uno con su marca de agua",
      pdfTodos.startsWith("%PDF-") && pdfTodos.includes("/Count 2") && (pdfTodos.match(/\/Subtype \/Image/g) || []).length === 2
      && dTodos.suggestedFilename() === "centroamericano-2026-crc-certificados.pdf" && await pDip.evaluate(() => window.__marcas === 4)
      && /los 2 certificados se bajaron/.test(await pDip.textContent("#delegacion-lista .cac-hoja [role=status]")), dTodos.suggestedFilename());
    await ctxDip.close();

    // El modo de prueba: ?sala=<clave> pide los torneos de esa sala con
    // «prueba: true» (la función la lee solo si quien pide administra), lo
    // dice arriba en rojo, guarda aparte y no enciende los avisos al celular.
    const ctxPr = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctxPr.addInitScript((d) => {
      window.__pedidos = [];
      window.sb = { functions: { invoke: async (nombre, op) => {
        window.__pedidos.push(op.body);
        return window.__negar ? { data: null, error: new Error("403") } : { data: d, error: null };
      } } };
      if (sessionStorage.getItem("negar") === "1") window.__negar = true;
    }, DATOS);
    const pPr = await ctxPr.newPage();
    await pPr.goto(BASE + "/" + PAGINA + "?sala=centroamericano-prueba", { waitUntil: "load" });
    await pPr.waitForFunction(() => window.__pedidos.length > 0, null, { timeout: 10000 }).catch(() => {});
    const prb = await pPr.evaluate(() => {
      const c = document.getElementById("cac-prueba");
      const s = c && getComputedStyle(c);
      return { visible: !!c && c.checkVisibility(), texto: c && c.textContent, fondo: s && s.backgroundColor, letra: s && s.color, salir: c && c.querySelector("a").getAttribute("href"),
        pedido: window.__pedidos[0], propio: !!localStorage.getItem("cac_prueba_jugadores_v1"), real: !!localStorage.getItem("cac_jugadores_v1") };
    });
    ok("?sala= pide esa sala en modo de prueba, en cuanto se abre la página", JSON.stringify(prb.pedido) === JSON.stringify({ clave: "centroamericano-prueba", modalidad: "clasico", prueba: true }), JSON.stringify(prb.pedido));
    ok("y lo dice arriba, en rojo con letra blanca, con un enlace para salir", prb.visible && /Modo de prueba: esta página muestra los torneos de la sala «centroamericano-prueba»/.test(prb.texto)
      && prb.fondo === "rgb(206, 19, 40)" && prb.letra === "rgb(255, 255, 255)" && prb.salir === "/" + PAGINA, JSON.stringify(prb));
    ok("lo de la prueba se guarda aparte: no pisa lo guardado del festival", prb.propio && !prb.real, JSON.stringify(prb));
    // Con alguien seguido aparece «Avisarme en este celular»: en la prueba no se enciende.
    await pPr.evaluate(() => localStorage.setItem("cac_prueba_seguidos_v1", JSON.stringify([{ tnr: "1494141", no: 2, nombre: "Mayorga Araya, Sofia" }])));
    await pPr.reload({ waitUntil: "load" });
    await pPr.click("#avisos-boton", { timeout: 5000 }).catch(() => {});
    ok("en el modo de prueba los avisos al celular no se encienden", /los avisos al celular están apagados/.test(await pPr.textContent("#avisos-estado")));
    // Sin permiso (la función contesta 403 a quien no administra): lo explica.
    await pPr.evaluate(() => { sessionStorage.setItem("negar", "1"); localStorage.clear(); });
    await pPr.reload({ waitUntil: "load" });
    await pPr.waitForFunction(() => /revisa que exista/.test((document.getElementById("cac-prueba") || {}).textContent || ""), null, { timeout: 10000 }).catch(() => {});
    ok("si la función no deja (no administra o la sala no existe), el aviso lo explica", /revisa que exista en administración \(Torneos\) y que entraste con tu cuenta de administración/.test(await pPr.textContent("#cac-prueba")));
    // Sin ?sala=, o con la del festival, nada de eso.
    await pPr.goto(BASE + "/" + PAGINA + "?sala=centroamericano-2026", { waitUntil: "load" });
    ok("con la sala del festival (o sin ?sala=) no hay modo de prueba", await pPr.evaluate(() => !document.getElementById("cac-prueba")));
    await pPr.goto(BASE + "/" + PAGINA + "?sala=" + encodeURIComponent("<script>"), { waitUntil: "load" });
    ok("y una clave rara se ignora", await pPr.evaluate(() => !document.getElementById("cac-prueba")));
    await ctxPr.close();

    // Clásico · Rápidas · Blitz: una modalidad a la vez. La página le pide a la
    // función solo la elegida; el selector sale solo si la sala tiene más de una,
    // es el mismo en el buscador y en cada ventana, y lo de una modalidad no se
    // pinta como de otra aunque llegue tarde.
    const BLITZ = { modalidad: "blitz", modalidades: ["clasico", "rapidas", "blitz"], torneos: [{ tnr: "2000001", url: "x", leido_en: "2026-11-07T16:05:00Z", ronda: 1, rondas: 9, categoria: "U10",
      jugadores: [{ puesto: 1, no: 1, titulo: "", nombre: "Blitzer Rojas, Ana", fed: "CRC", elo: 1500, grupo: "U10", puntos: "1", r: ["2w1"] },
                  { puesto: 2, no: 2, titulo: "", nombre: "Zeta Mora, Luis", fed: "PAN", elo: 1400, grupo: "U10", puntos: "0", r: ["1b0"] }], pareo: null }] };
    const RAPIDAS = { ...BLITZ, modalidad: "rapidas", torneos: [{ ...BLITZ.torneos[0], tnr: "2000002", jugadores: [{ ...BLITZ.torneos[0].jugadores[0], nombre: "Rapidez Vargas, Eva" }] }] };
    const ctxMod = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctxMod.addInitScript(([d, b, rp]) => {
      window.__pedidos = [];
      const solo = sessionStorage.getItem("solo") === "1", sinBlitz = sessionStorage.getItem("sinBlitz") === "1";
      window.sb = { functions: { invoke: async (nombre, op) => {
        const m = op.body && op.body.modalidad;
        window.__pedidos.push(m);
        if (solo) return { data: { ...d, modalidad: "clasico", modalidades: ["clasico"] }, error: null };
        const todas = sinBlitz ? ["clasico", "rapidas"] : ["clasico", "rapidas", "blitz"];
        if (m === "rapidas") { await new Promise((r) => setTimeout(r, 900)); return { data: { ...rp, modalidades: todas }, error: null }; }
        if (m === "blitz" && !sinBlitz) return { data: b, error: null };
        return { data: { ...d, modalidad: "clasico", modalidades: todas }, error: null };
      } } };
    }, [DATOS, BLITZ, RAPIDAS]);
    const pMod = await ctxMod.newPage();
    const estadoMod = () => pMod.evaluate(() => ({
      cajas: [...document.querySelectorAll("[data-modalidades]")].filter((c) => c.checkVisibility()).map((c) => c.closest("dialog") ? c.closest("dialog").id : "buscador"),
      puesta: [...document.querySelectorAll("#buscador [data-modalidad][aria-pressed=true]")].map((b) => b.textContent + "|" + getComputedStyle(b, "::before").content),
      botones: [...document.querySelectorAll("#buscador [data-modalidad]")].map((b) => b.textContent),
      tarjetas: [...document.querySelectorAll("#buscador-resultados li")].map((l) => l.innerText.replace(/\s+/g, " ").trim()),
      pedidos: window.__pedidos.slice(), elegida: localStorage.getItem("cac_modalidad_v1"),
      foco: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.modalidad : null,
    }));
    const buscarMod = async (q) => { await pMod.fill("#buscador-nombre", q); await pMod.waitForTimeout(500); return estadoMod(); };
    await pMod.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    await pMod.evaluate(() => sessionStorage.setItem("solo", "1"));
    await pMod.reload({ waitUntil: "load" });
    let em = await buscarMod("mayorga");
    ok("con una sola modalidad en la sala, el selector no se ve", em.tarjetas.length === 1 && !em.cajas.length, JSON.stringify(em));
    await pMod.evaluate(() => { sessionStorage.removeItem("solo"); localStorage.clear(); });
    await pMod.reload({ waitUntil: "load" });
    em = await buscarMod("mayorga");
    ok("con Rápidas y Blitz en la sala, sale «Clásico · Rápidas · Blitz» y empieza en el clásico",
       JSON.stringify(em.cajas) === JSON.stringify(["buscador"]) && JSON.stringify(em.botones) === JSON.stringify(["Clásico", "Rápidas", "Blitz"]) && JSON.stringify(em.puesta) === JSON.stringify(['Clásico|"✓ "']) && em.pedidos[0] === "clasico", JSON.stringify(em));
    ok("la elegida no va solo con color: va rellena y con «✓»", await pMod.evaluate(() => {
      const [a, b] = ["clasico", "blitz"].map((m) => getComputedStyle(document.querySelector('#buscador [data-modalidad="' + m + '"]')));
      return a.backgroundColor !== b.backgroundColor && a.color === "rgb(255, 255, 255)";
    }));
    ok("en el clásico, la tarjeta trae «Agregar a mi calendario»", await pMod.evaluate(() => !!document.querySelector('#buscador-resultados [data-accion="calendario"]')));
    await pMod.click('#buscador [data-modalidad="blitz"]');
    await pMod.waitForTimeout(400);
    em = await buscarMod("blitzer");
    ok("al tocar Blitz se pide solo el Blitz y todo pasa a sus torneos", em.pedidos[em.pedidos.length - 1] === "blitz" && em.tarjetas.length === 1 && /Blitzer Rojas, Ana/.test(em.tarjetas[0])
       && JSON.stringify(em.puesta) === JSON.stringify(['Blitz|"✓ "']) && em.elegida === '"blitz"', JSON.stringify(em));
    ok("y los del clásico ya no salen", (await buscarMod("mayorga")).tarjetas.length === 0);
    ok("en el Blitz no hay calendario de rondas (el de la página es el del clásico)", await buscarMod("blitzer").then(() => pMod.evaluate(() => !document.querySelector('#buscador-resultados [data-accion="calendario"]'))));
    ok("lo que sale de la página dice la modalidad: «Sub-10 Absoluto (Blitz)»", await pMod.evaluate(() => window.CentroamericanoVivo.conModalidad("Sub-10 Absoluto") === "Sub-10 Absoluto (Blitz)"));
    ok("cada modalidad se guarda aparte: el clásico no se pisa", await pMod.evaluate(() => /Mayorga/.test(localStorage.getItem("cac_jugadores_v1") || "") && /Blitzer/.test(localStorage.getItem("cac_jugadores_v1_blitz") || "")));
    await pMod.focus('#buscador [data-modalidad="clasico"]');
    await pMod.keyboard.press("Enter");
    await pMod.waitForTimeout(300);
    ok("se cambia con el teclado y el foco no se pierde", (await estadoMod()).foco === "clasico");
    await pMod.click('a[href="#clasificacion"]');
    await pMod.waitForTimeout(500);
    em = await estadoMod();
    ok("cada ventana trae el mismo selector, con la misma puesta", em.cajas.includes("clasificacion") && await pMod.evaluate(() => document.querySelector('#clasificacion [data-modalidad="clasico"]').getAttribute("aria-pressed") === "true"), JSON.stringify(em));
    await pMod.click('#clasificacion [data-modalidad="blitz"]');
    await pMod.waitForFunction(() => /Blitzer/.test(document.getElementById("clasificacion-contenido").textContent), null, { timeout: 5000 }).catch(() => {});
    ok("y cambiarla ahí cambia la ventana y la página", await pMod.evaluate(() => /Blitzer/.test(document.getElementById("clasificacion-contenido").textContent) && !/Mayorga/.test(document.getElementById("clasificacion-contenido").textContent)
       && document.querySelector('#buscador [data-modalidad="blitz"]').getAttribute("aria-pressed") === "true"));
    await pMod.keyboard.press("Escape");
    // Rápidas tarda; antes de que llegue se toca Blitz: lo de Rápidas no se pinta.
    await pMod.click('#buscador [data-modalidad="rapidas"]');
    await pMod.click('#buscador [data-modalidad="clasico"]');
    await pMod.waitForTimeout(1300);
    em = await buscarMod("rapidez");
    ok("lo que llega tarde de otra modalidad no se pinta ni se guarda", em.tarjetas.length === 0 && JSON.stringify(em.puesta) === JSON.stringify(['Clásico|"✓ "'])
       && await pMod.evaluate(() => !localStorage.getItem("cac_jugadores_v1_rapidas")), JSON.stringify(em));
    await pMod.click('#buscador [data-modalidad="blitz"]');
    await pMod.waitForTimeout(400);
    await pMod.reload({ waitUntil: "load" });
    em = await buscarMod("blitzer");
    ok("la elegida se recuerda en este aparato", em.pedidos[0] === "blitz" && em.tarjetas.length === 1, JSON.stringify(em));
    // La sala ya no tiene Blitz: la función manda el clásico y ese queda puesto.
    await pMod.evaluate(() => sessionStorage.setItem("sinBlitz", "1"));
    await pMod.reload({ waitUntil: "load" });
    em = await buscarMod("mayorga");
    ok("si la sala ya no tiene la elegida, queda la que manda la función", em.tarjetas.length === 1 && JSON.stringify(em.botones) === JSON.stringify(["Clásico", "Rápidas"])
       && JSON.stringify(em.puesta) === JSON.stringify(['Clásico|"✓ "']) && em.elegida === '"clasico"', JSON.stringify(em));
    await pMod.setViewportSize({ width: 320, height: 800 });
    ok("en el celular el selector cabe en una fila, sin scroll de costado ni texto cortado", await pMod.evaluate(() => {
      const bs = [...document.querySelectorAll("#buscador [data-modalidad]")];
      return document.documentElement.scrollWidth <= window.innerWidth && bs.every((b) => b.scrollWidth <= b.clientWidth && b.offsetTop === bs[0].offsetTop);
    }));
    await ctxMod.close();

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
    ok("sin red, abre entera: el título, las fichas y su hoja de estilos", /Centroamericano/.test(sinRed.titulo) && sinRed.fichas === 12 && /gradient/.test(sinRed.css), JSON.stringify(sinRed));
    await ctx5.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
