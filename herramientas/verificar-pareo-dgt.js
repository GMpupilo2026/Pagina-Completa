/* Pareo para DGT (pareo-dgt.html): el pareo de chess-results llega bien al
 * archivo de DGT LiveChess y a Lichess, una sola vez por ronda.
 *
 * Lo que se rompe callado acá, el día del torneo y con las rondas de blitz
 * corriendo:
 *  - una columna de chess-results que se corre y el archivo trae el Elo como
 *    nombre, o las negras de la mesa de al lado;
 *  - un bye o un «sin emparejar» que entra como partida (LiveChess espera
 *    dos jugadores por tablero);
 *  - recargar la página y que cree otra vez la ronda en Lichess;
 *  - un pareo corregido en chess-results que no se vuelve a armar;
 *  - una mesa que no se transmite metida en el archivo (de 100 mesas, se
 *    transmiten 2);
 *  - la herramienta, que es con licencia, abierta a cualquiera;
 *  - «Datos para LiveChess» (la pestaña Tournament no se puede escribir
 *    desde afuera: cada dato se copia): un dato de la ficha de chess-results
 *    leído de otra fila, un torneo viejo que borra lo que ya se sabía, la
 *    lista que se rehace cada 30 s y cierra la tarjeta o le quita el foco a
 *    quien estaba copiando.
 *
 * Sin navegador: el lector de la Edge Function (supabase/functions/pareo-dgt,
 * sacado del .ts y sin tipos, como verificar-pizarra-chess-results.js) contra
 * HTML con la FORMA de las páginas reales de tnr1498221 y tnr1498218
 * (UTN-CONARE 2026, leídas el 29/10/2026) y nombres inventados; y
 * js/pareo/dgt.js (el PGN, qué hacer con cada lectura, Lichess).
 * Con navegador: la página con un doble de la función y otro de Lichess.
 *
 * Ver «Pareo para DGT» en docs/decisiones/juegos-y-torneos.md.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-pareo-dgt.js [--sin-navegador]
 */
const fs = require("fs");
const path = require("path");
const { stripTypeScriptTypes } = require("module");
const { chromium } = require("./lib/playwright-con-sesion");
const DGT = require("../js/pareo/dgt.js");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre);
}
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

// ------------------------------------------------------------ el HTML de prueba

const fila = (clase, celdas) => `<tr class="${clase}">` + celdas.map((c) => `<td class="CRc">${c}</td>`).join("") + "</tr>";
const flag = '<div class="tn_CRC"></div>';
const CAB_CLUB = '<tr class="CRng1b"><th class="CRc">M.</th><th class="CRc">No.</th><th class="CRc">&nbsp;</th><th class="CR"></th><td class="CR">White</td><th class="CRc">Elo</th><th class="CR">Club/Ciudad</th><th class="CRc">Pts.</th> <th class="CRc">Resultado</th><th class="CRc">Pts.</th> <th class="CR"></th><td class="CR">Black</td><th class="CRc">Elo</th><th class="CR">Club/Ciudad</th><th class="CRc">&nbsp;</th><th class="CRc">No.</th></tr>';
const CAB_SIN_CLUB = '<tr class="CRng1b"><th class="CRc">M.</th><th class="CRc">No.</th><th class="CRc">&nbsp;</th><th class="CR"></th><td class="CR">White</td><th class="CRc">Elo</th><th class="CRc">Pts.</th> <th class="CRc">Resultado</th><th class="CRc">Pts.</th> <th class="CR"></th><td class="CR">Black</td><th class="CRc">Elo</th><th class="CRc">&nbsp;</th><th class="CRc">No.</th></tr>';
const pagina = (titulo, h3, cab, filas) => `<html><body><div class="defaultDialog"><h2>${titulo} </h2></div>
<div class="defaultDialog"><h2>Emparejamientos/Resultados</h2><h3>${h3}</h3>
<table class="CRs1" border="0">${cab}${filas.join("\n")}</table></div></body></html>`;

const HTML_CLUB = pagina("Torneo Blitz de Prueba - FEMENINO", "3. Ronda el 2026/11/07 a las 3:00pm", CAB_CLUB, [
  fila("CRng2", ["1", "1", flag, "WIM", "Rojas Mora, Ana Lucía", "2075", "Club Uno", "2", "", "2", "WCM", "Vargas Solís, Bea", "1890", "Club Dos", flag, "2"]),
  fila("CRng1", ["2", "3", flag, "", "Quesada \"La Torre\" Paz, Cris", "1726", "Club Uno", "1", "", "1", "", "Núñez Brenes, Dora", "1431", "Club Tres", flag, "9"]),
  // La fila de quien no juega: una celda de menos y el <td> mal escrito de chess-results.
  '<tr class="CRng2"><td class="CRc">3</td><td class="CRc">7</td><td class="CR">' + flag + '</td><td class="CR"></td><td class="CR">Soto Ríos, Eva</td><td class="CRc">1489</td><td class="CR">Club Dos</td><td class="CRc">0</td> <td class="CRc">0</td><td & colsp & class="CRc"></td> <td class="CR"></td><td class="CR">sin emparejar</td><td class="CRc">&nbsp;</td><td class="CRc">&nbsp;</td><td></td></tr>',
]);
const HTML_SIN_CLUB = pagina("Torneo Blitz de Prueba - ABSOLUTO", "6. Ronda el 2026/11/07 a las 11:00am", CAB_SIN_CLUB, [
  fila("CRng2", ["1", "8", flag, "", "López Bustos, Fabio", "1797", "3", "", "3", "FM", "Montero Romo, Gil", "1968", flag, "6"]),
  fila("CRng1", ["2", "18", flag, "", "Chaves Aragón, Hugo", "1461", "2", "", "", "", "bye", "", "", ""]),
]);
const HTML_LISTA = `<table class="CRs1"><tr class="CRng1b"><th class="CRc">No.</th><th class="CRc">&nbsp;</th><th class="CR"></th><th class="CR">Nombre</th><th class="CRr">FIDE-ID</th><th class="CR">FED</th><th class="CRr">EloN</th><th class="CR">Club/Ciudad</th></tr>
<tr class="CRng2 CRC"><td class="CRc">1</td><td class="CR">${flag}</td><td class="CR">WIM</td><td class="CR">Rojas Mora, Ana Lucía</td><td><a href="http://ratings.fide.com/profile/6500001" target="_blank">6500001</a></td><td class="CR">CRC</td><td class="CRr">2075</td><td class="CR">Club Uno</td></tr>
<tr class="CRng1 CRC"><td class="CRc">2</td><td class="CR">${flag}</td><td class="CR">WCM</td><td class="CR">Vargas Solís, Bea</td><td>0</td><td class="CR">CRC</td><td class="CRr">1890</td><td class="CR">Club Dos</td></tr>
</table>`;

// La ficha del torneo, con la forma de la página real (tnr1498221 con sus
// detalles y torneos en curso del 29/10/2026): filas de dos celdas, a veces con
// <tr valign="top">, el lugar dentro de un enlace, la federación con su código.
const HTML_FICHA = `<table border="0" cellpadding="1" cellspacing="1"><tr><td class="CR">Organizador</td><td class="CR">Universidad de Prueba</td></tr><tr><td class="CR">Federación</td><td class="CR">Costa Rica ( CRC )</td></tr><tr valign="top"><td class="CR">Árbitro principal</td><td class="CR">Perez Soto, Ana (6500000)</td></tr><tr valign="top"><td class="CR">Árbitro</td><td class="CR">Rojas, Luis; Mora, Eva ... <a Class="CRdb" href="https://chess-results.com/tnr1.aspx?turdet=ALL">All arbiters</a></td></tr><tr><td class="CR">Control de tiempo (Rapid)</td><td class="CR">15 min + 10 seg add</td></tr><tr><td class="CR">Lugar</td><td class="CR"><a Class="CRdb" href="https://www.google.com/maps/search/Liceo" target="_blank">Liceo de Prueba, San José</a></td></tr><tr><td class="CR">Número de rondas</td><td class="CR">6</td></tr><tr><td class="CR">Cálculo de elo</td><td class="CR"> - </td></tr><tr><td class="CR">Fecha</td><td class="CR">2026/09/27</td></tr></table>`;
const HTML_FICHA_MINIMA = `<table><tr><td class="CR">Federación</td><td class="CR">Vietnam ( VIE )</td></tr><tr><td class="CR">Número de rondas</td><td class="CR">7</td></tr><tr><td class="CR">Lugar</td><td class="CR"> - </td></tr></table>`;
const FICHA_DOBLE = { control: "15 min + 10 seg add", lugar: "Liceo de Prueba, San José", pais: "Costa Rica", rondas: 6 };
const FICHA_VACIA = { control: "", lugar: "", pais: "", rondas: 0 };

// ------------------------------------------------------------ 1. la función

function pruebaFuncion() {
  console.log("=== La Edge Function (supabase/functions/pareo-dgt) ===");
  const ts = fs.readFileSync(path.join(RAIZ, "supabase", "functions", "pareo-dgt", "index.ts"), "utf8");
  const desde = ts.indexOf("function texto(");
  const hasta = ts.indexOf("// ------------------------------------------------------------- la función");
  const MAX = (ts.match(/const MAX_MESAS = (\d+);/) || [])[1];
  const js = stripTypeScriptTypes("const MAX_MESAS = " + MAX + ";\n" + ts.slice(desde, hasta).replace(/export function/g, "function"));
  const { leerPareo, leerLista, leerFicha, tnrDe } = new Function(js + "\nreturn { leerPareo, leerLista, leerFicha, tnrDe };")();

  const a = leerPareo(HTML_CLUB);
  igual("el torneo, la ronda, la fecha y la hora del título", [a.torneo, a.ronda, a.fecha, a.hora],
    ["Torneo Blitz de Prueba - FEMENINO", 3, "2026.11.07", "3:00pm"]);
  igual("mesa 1: las blancas con su título, Elo, club y federación", a.mesas[0].blancas,
    { no: 1, titulo: "WIM", nombre: "Rojas Mora, Ana Lucía", elo: 2075, club: "Club Uno", fide: "", fed: "CRC" });
  igual("y las negras, leídas desde el final de la fila", a.mesas[0].negras,
    { no: 2, titulo: "WCM", nombre: "Vargas Solís, Bea", elo: 1890, club: "Club Dos", fide: "", fed: "CRC" });
  igual("mesa 2: nombres con comillas y eñes, tal cual", [a.mesas[1].blancas.nombre, a.mesas[1].negras.nombre, a.mesas[1].negras.no],
    ['Quesada "La Torre" Paz, Cris', "Núñez Brenes, Dora", 9]);
  igual("«sin emparejar» (con su <td> mal escrito) no es una partida", [a.mesas[2].mesa, a.mesas[2].negras, a.mesas[2].sinRival, a.mesas[2].blancas.nombre],
    [3, null, "sin emparejar", "Soto Ríos, Eva"]);

  const b = leerPareo(HTML_SIN_CLUB);
  igual("sin columna de club: la ronda y la hora de la mañana", [b.ronda, b.hora], [6, "11:00am"]);
  igual("las negras no se corren", [b.mesas[0].negras.nombre, b.mesas[0].negras.titulo, b.mesas[0].negras.elo, b.mesas[0].negras.no],
    ["Montero Romo, Gil", "FM", 1968, 6]);
  igual("el bye tampoco es una partida", [b.mesas[1].negras, b.mesas[1].sinRival], [null, "bye"]);

  igual("la lista inicial: el FIDE-ID de cada número (un 0 es «sin ID»)", leerLista(HTML_LISTA).jugadores,
    { 1: { fide: "6500001", fed: "CRC" }, 2: { fide: "", fed: "CRC" } });
  igual("la ficha: control de tiempo, lugar (aunque sea un enlace), país sin el código y rondas",
    leerFicha(HTML_FICHA), { control: "15 min + 10 seg add", lugar: "Liceo de Prueba, San José", pais: "Costa Rica", rondas: 6 });
  // tnr1529729 (Costa Rica, 29/10/2026): la «Federación» es una confederación, no el país.
  igual("la federación que es una confederación no es el país, pero el lugar sí se lee",
    leerFicha(`<table><tr><td class="CR">Federación</td><td class="CR">Confederation of Chess for Americas ( CCA )</td></tr><tr><td class="CR">Control de tiempo (Standard)</td><td class="CR">90 minutes + 30 second increment per move 1</td></tr>\n<tr><td class="CR">Lugar</td><td class="CR"><a Class="CRdb" href="https://www.google.com/maps/search/Gimnasio Nacional" target="_blank">Gimnasio Nacional</a></td></tr><tr><td class="CR">Número de rondas</td><td class="CR">9</td></tr></table>`),
    { control: "90 minutes + 30 second increment per move 1", lugar: "Gimnasio Nacional", pais: "", rondas: 9 });
  igual("y un país con «Federación» en el nombre o parecido sigue siendo país", ["Costa Rica ( CRC )", "Estados Unidos ( USA )", "Unión de Myanmar ( MYA )"].map((v) => leerFicha(`<table><tr><td class="CR">Federación</td><td class="CR">${v}</td></tr></table>`).pais).slice(0, 2), ["Costa Rica", "Estados Unidos"]);
  igual("una ficha a medias deja vacío lo que falta (un «-» no es un dato)", leerFicha(HTML_FICHA_MINIMA), { control: "", lugar: "", pais: "Vietnam", rondas: 7 });
  igual("una página sin ficha (torneo viejo) la deja vacía, sin inventar", leerFicha(HTML_CLUB), FICHA_VACIA);
  igual("la ficha viaja con el pareo, también cuando no hay mesas", [leerPareo(HTML_FICHA + HTML_CLUB).ficha.rondas, leerPareo(HTML_FICHA).ficha.pais, leerPareo(HTML_FICHA).mesas], [6, "Costa Rica", []]);
  igual("una página sin tabla no inventa mesas", leerPareo("<html><h2>Nada</h2></html>").mesas, []);

  igual("el torneo sale del número o de cualquier dirección de chess-results",
    [tnrDe("1498221"), tnrDe("https://chess-results.com/tnr1498221.aspx?lan=2&art=2&rd=3"), tnrDe("s3.chess-results.com/tnr12345.aspx")],
    ["1498221", "1498221", "12345"]);
  igual("y no de otro sitio, aunque se le parezca", [tnrDe("https://otro.com/tnr1498221.aspx"), tnrDe("https://chess-results.com.otro.com/tnr1498221.aspx"), tnrDe("12"), tnrDe("1; drop")],
    [null, null, null, null]);

  const pos = (re) => ts.search(re);
  const licencia = pos(/if\s*\(puede !== true\)\s*return json/);
  cierto("con licencia: pregunta tengo_herramienta('pareo-dgt') con el token de quien llama ANTES de pedir nada a chess-results",
    /const HERRAMIENTA = "pareo-dgt";/.test(ts) && /createClient\(SUPABASE_URL, ANON_KEY, \{[\s\S]*?Authorization: autorizacion/.test(ts) &&
      /comoQuienLlama\.rpc\("tengo_herramienta", \{ p_herramienta: HERRAMIENTA \}\)/.test(ts) && licencia >= 0 && licencia < pos(/await Promise\.all\(\[/));
  const enVitrina = (fs.readFileSync(path.join(RAIZ, "js", "herramientas-arbitraje.js"), "utf8").match(/id: "pareo-dgt",[\s\S]*?\},\n/) || [""])[0];
  cierto("está en la vitrina de herramientas, en Arbitraje, con licencia (no gratis)", /tema: "arbitraje"/.test(enVitrina) && /href: "pareo-dgt\.html"/.test(enVitrina) && !/gratis: true/.test(enVitrina));
  cierto("pide siempre a s3.chess-results.com, solo art=0 y art=2", /const CR_BASE = "https:\/\/s3\.chess-results\.com";/.test(ts) &&
    (ts.match(/&art=\d/g) || []).every((x) => x === "&art=2" || x === "&art=0"));
  cierto("guarda lo leído en pizarras_cache (no se le pide a chess-results en cada revisión)", /from\("pizarras_cache"\)\.upsert/.test(ts));

  // Crear el torneo y la ronda en Lichess pasa por la función (esas dos
  // direcciones no aceptan pedidos de otra página): solo esas dos, con licencia.
  const rutaLichess = new RegExp((ts.match(/const RUTA_LICHESS = \/(.+)\/;/) || [])[1] || "^$");
  igual("a Lichess, la función solo crea torneos y rondas",
    ["/broadcast/new", "/broadcast/AbCd1234/new", "/api/broadcast/round/x/push", "/api/account", "/broadcast/new/../../api/token", "/broadcast/AbCd1234/edit", "/team/x/kick"].map((r) => rutaLichess.test(r)),
    [true, true, false, false, false, false, false]);
  cierto("y solo después de comprobar la licencia", licencia >= 0 && licencia < pos(/if \(body\.accion === "lichess"\) return await aLichess\(body\)/));
  cierto("sin escribir el token en ningún registro", !/console\.\w+\([^)]*token/.test(ts));
}

// ------------------------------------------------------------ 2. js/pareo/dgt.js

const DATOS = {
  torneo: "Blitz de Prueba", ronda: 3, fecha: "2026.11.07", hora: "3:00pm",
  mesas: [
    { mesa: 2, blancas: { no: 3, titulo: "", nombre: "Quesada \"La Torre\" Paz, Cris", elo: 1726, fide: "" }, negras: { no: 9, titulo: "", nombre: "Núñez Brenes, Dora", elo: 0, fide: "" }, sinRival: "" },
    { mesa: 1, blancas: { no: 1, titulo: "WIM", nombre: "Rojas Mora, Ana Lucía", elo: 2075, fide: "6500001" }, negras: { no: 2, titulo: "WCM", nombre: "Vargas Solís, Bea", elo: 1890, fide: "" }, sinRival: "" },
    { mesa: 3, blancas: { no: 7, titulo: "", nombre: "Soto Ríos, Eva", elo: 1489, fide: "" }, negras: null, sinRival: "sin emparejar" },
  ],
};

function pruebaModulo() {
  console.log("\n=== El PGN y Lichess (js/pareo/dgt.js) ===");
  igual("solo van las mesas con dos jugadores, en orden de mesa", DGT.partidas(DATOS).map((m) => m.mesa), [1, 2]);
  igual("y solo las elegidas", [DGT.partidas(DATOS, { mesas: "2-5" }).map((m) => m.mesa), DGT.partidas(DATOS, { mesas: "1, 3" }).map((m) => m.mesa)], [[2], [1]]);
  igual("las mesas se escriben como en Lichess, y se ordenan y juntan",
    ["", "1-2", "5, 1-2 ,3", "2,1,1", "1-2;7", "Todas"].map((t) => DGT.leerMesas(t).mesas), ["", "1-2", "1-3, 5", "1-2", "1-2, 7", ""]);
  cierto("lo que no es una mesa se dice, con un ejemplo", ["a", "0", "10-4", "1000"].every((t) => DGT.leerMesas(t).error),
    ["a", "0", "10-4", "1000"].map((t) => DGT.leerMesas(t).error).join(" | "));

  const pgn = DGT.pgn(DATOS, { sitio: "Liceo de Prueba" });
  igual("el PGN de la ronda: una partida sin jugadas por mesa", pgn, [
    '[Event "Blitz de Prueba"]', '[Site "Liceo de Prueba"]', '[Date "2026.11.07"]', '[Round "3"]', '[Board "1"]',
    '[White "Rojas Mora, Ana Lucía"]', '[Black "Vargas Solís, Bea"]', '[Result "*"]', '[WhiteTitle "WIM"]', '[BlackTitle "WCM"]',
    '[WhiteElo "2075"]', '[BlackElo "1890"]', '[WhiteFideId "6500001"]', "", "*", "",
    '[Event "Blitz de Prueba"]', '[Site "Liceo de Prueba"]', '[Date "2026.11.07"]', '[Round "3"]', '[Board "2"]',
    '[White "Quesada \\"La Torre\\" Paz, Cris"]', '[Black "Núñez Brenes, Dora"]', '[Result "*"]', '[WhiteElo "1726"]', "", "*", "",
  ].join("\n"));
  cierto("sin tildes ni eñes, si se pide", /\[White "Rojas Mora, Ana Lucia"\]/.test(DGT.pgn(DATOS, { sinTildes: true })) &&
    /\[Black "Nunez Brenes, Dora"\]/.test(DGT.pgn(DATOS, { sinTildes: true })));
  igual("sin fecha, la de PGN para «no se sabe»", (DGT.pgn(Object.assign({}, DATOS, { fecha: "" })).match(/\[Date "[^"]*"\]/) || [])[0], '[Date "????.??.??"]');

  const hecho = { rondas: { 3: { firma: DGT.firma(DATOS), mesasElegidas: "" } } };
  igual("qué hacer: sin ronda emparejada, esperar", DGT.decidir({ rondas: {} }, { ronda: 1, mesas: [DATOS.mesas[2]] }), "esperar");
  igual("una ronda sin archivo es nueva", DGT.decidir({ rondas: {} }, DATOS), "nueva");
  igual("la misma ronda leída otra vez no hace nada", DGT.decidir(hecho, DATOS), "igual");
  const corregida = JSON.parse(JSON.stringify(DATOS));
  corregida.mesas[0].negras = { no: 11, titulo: "", nombre: "Otra Persona, Iris", elo: 1500, fide: "" };
  igual("si chess-results cambia el pareo de esa ronda, se avisa", DGT.decidir(hecho, corregida), "cambio");
  igual("la ronda siguiente es nueva", DGT.decidir(hecho, Object.assign({}, DATOS, { ronda: 4 })), "nueva");
  igual("si se eligen otras mesas, hay que volver a armarla", [DGT.decidir(hecho, DATOS, "1-2"), DGT.decidir({ rondas: { 3: { firma: DGT.firma(DATOS), mesasElegidas: "1-2" } } }, DATOS, "2, 1")], ["cambio", "igual"]);

  igual("el nombre del archivo", DGT.nombreArchivo("Torneo Blitz Sub-12 — Peñas", 3), "torneo-blitz-sub-12-penas-ronda-3.pgn");
  igual("la hora de la ronda, en hora de Costa Rica (UTC−6)",
    [DGT.inicioRonda("2026.11.07", "3:00pm"), DGT.inicioRonda("2026.11.07", "12:30am"), DGT.inicioRonda("2026.11.07", "12:05pm"), DGT.inicioRonda("", "3:00pm")],
    [Date.UTC(2026, 10, 7, 21, 0), Date.UTC(2026, 10, 7, 6, 30), Date.UTC(2026, 10, 7, 18, 5), null]);
  const campos = DGT.datosLiveChess("II Torneo UTN-CONARE 2026 - FEMENINO", FICHA_DOBLE);
  igual("datos para LiveChess: los seis campos de la pestaña Tournament, con su rótulo", campos.map((d) => d.campo),
    ["Short title", "Name", "Location", "Country", "Time control", "Number of rounds"]);
  igual("con el nombre de chess-results, el título corto sin tildes ni espacios, y lo que dice la ficha", campos.map((d) => d.valor),
    ["ii-torneo-utn-conare-2026-femenino", "II Torneo UTN-CONARE 2026 - FEMENINO", "Liceo de Prueba, San José", "Costa Rica", "15 min + 10 seg add", "6"]);
  igual("«Copiar todo» es una línea por dato", DGT.textoDatos(campos).split("\n").length, 6);
  const sinFicha = DGT.datosLiveChess("tnr777777", FICHA_VACIA);
  igual("sin leer todavía (el nombre es el número) y sin ficha, no se inventa nada", [sinFicha.map((d) => d.valor).join(""), DGT.textoDatos(sinFicha)], ["", ""]);
  igual("una ficha vacía no borra lo que ya se sabía, y lo nuevo la completa",
    [DGT.unirFicha(FICHA_DOBLE, FICHA_VACIA), DGT.unirFicha({ pais: "Costa Rica" }, { lugar: "Liceo", rondas: 5 })],
    [FICHA_DOBLE, { pais: "Costa Rica", lugar: "Liceo", rondas: 5 }]);
  igual("el torneo en Lichess: nombre, ritmo, zona y la clasificación en chess-results",
    DGT.formTorneo({ nombre: "Blitz de Prueba", ritmo: "blitz", visibilidad: "unlisted", tnr: "123456" }),
    [["name", "Blitz de Prueba"], ["visibility", "unlisted"], ["showScores", "true"], ["info.timeZone", "America/Costa_Rica"],
      ["info.tc", "Blitz"], ["info.fideTC", "blitz"], ["info.standings", "https://chess-results.com/tnr123456.aspx?lan=2"]]);
  igual("la ronda en Lichess, con su hora", DGT.formRonda({ ronda: 3, inicio: Date.UTC(2026, 10, 7, 21) }), [["name", "Ronda 3"], ["startsAt", String(Date.UTC(2026, 10, 7, 21))]]);
}

// ------------------------------------------------------------ 3. la página

function clienteFalso(cfg) {
  return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const CFG = ${JSON.stringify(cfg)};
  function b(filas) {
    let datos = filas.slice(), unica = false;
    const q = {
      select() { return q; },
      eq(c, v) { datos = datos.filter((f) => String(f[c]) === String(v)); return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) { const d = unica ? (datos[0] || null) : datos; return Promise.resolve({ data: d, error: unica && !d ? { message: "no" } : null }).then(res, rej); },
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: CFG.yo }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: CFG.yo } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (t) => b((CFG.tablas || {})[t] || []),
    rpc: (n) => ({ then(res, rej) { return Promise.resolve(n === "tengo_herramienta" ? { data: !!CFG.licencia, error: null } : { data: null, error: null }).then(res, rej); } }),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

// Lo que devuelve la función para cada lectura: se cambia desde la prueba.
function respuesta(ronda, mesas, ficha) {
  return { tnr: "777777", url: "https://chess-results.com/tnr777777.aspx?lan=2&art=2", torneo: "Blitz de Prueba", ficha: ficha || FICHA_DOBLE, ronda, fecha: "2026.11.07", hora: "3:00pm", mesas, leido_en: "2026-11-07T20:59:00Z" };
}

async function abrir(ctx, yo, licencia) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
    body: clienteFalso({ yo, licencia }) }));
  await page.goto(BASE + "/pareo-dgt.html", { waitUntil: "networkidle" });
  return { page, errores };
}
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
const bitacora = (page) => page.$$eval("#bitacora li", (ls) => ls.map((l) => l.textContent));

async function pruebaPagina(browser) {
  console.log("\n=== pareo-dgt.html ===");
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const pedidosFuncion = [];
  const lichess = [];
  const estado = { leer: respuesta(0, []), lichessFalla: false, rondas: 0 };
  // Lichess de mentira, como contesta el de verdad. Lo anota todo en `lichess`
  // (desde dónde llegó cada pedido: el navegador o la función).
  const bloqueados = [];
  function lichessContesta(ruta, metodo, auth, cuerpo, desde) {
    lichess.push({ ruta, metodo, auth, cuerpo, desde });
    if (ruta === "/api/account") return auth === "Bearer lip_bueno" ? [200, { id: "organiza", username: "Organiza" }] : [401, { error: "No such token" }];
    if (estado.lichessFalla) return [500, { error: "Lichess caído" }];
    if (ruta === "/broadcast/new") return [200, { tour: { id: "TOUR0001", url: "https://lichess.org/broadcast/blitz/TOUR0001" }, rounds: [] }];
    if (/^\/broadcast\/TOUR0001\/new$/.test(ruta)) { estado.rondas += 1; return [200, { round: { id: "RND" + String(estado.rondas).padStart(5, "0"), url: "https://lichess.org/broadcast/blitz/ronda/RND" } }]; }
    if (/^\/api\/broadcast\/round\/[^/]+\/push$/.test(ruta)) return [200, { games: [] }];
    return [404, { error: "no" }];
  }
  await ctx.route("https://falso.supabase.co/functions/v1/pareo-dgt", (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    pedidosFuncion.push({ body, headers: r.request().headers() });
    if (body.accion === "lichess") {
      const [status, datos] = lichessContesta(body.ruta, "POST", "Bearer " + body.token, new URLSearchParams(body.form).toString(), "funcion");
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status, datos }) });
    }
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(estado.leer) });
  });
  await ctx.route("https://lichess.org/**", (r) => {
    const q = r.request();
    const ruta = new URL(q.url()).pathname;
    // Lo que no está bajo /api/ no contesta la consulta previa de CORS (403
    // en el Lichess de verdad): el navegador corta con «Failed to fetch».
    if (!ruta.startsWith("/api/")) { bloqueados.push(ruta); return r.abort("failed"); }
    const [status, body] = lichessContesta(ruta, q.method(), q.headers()["authorization"] || "", q.postData() || "", "navegador");
    r.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
  });

  {
    const { page } = await abrir(ctx, "u-alumno", false);
    igual("sin licencia se ve el candado, con el camino para activarla, y no la herramienta",
      [await vis(page, "#denegado"), await vis(page, "#app"), await page.getAttribute("#denegado a", "href")], [true, false, "herramientas-arbitraje.html#activar"]);
    await page.close();
  }

  const { page, errores } = await abrir(ctx, "u-admin", true);
  igual("con licencia se ve la herramienta", await vis(page, "#app"), true);

  // Un torneo que todavía no tiene pareo.
  await page.fill("#tnr", "https://otro-sitio.com/tnr777777.aspx");
  await page.click("#form-torneo button[type=submit]");
  cierto("una dirección que no es de chess-results no se agrega, y se dice por qué", pedidosFuncion.length === 0 && /chess-results/.test(await page.textContent("#torneo-error")));
  await page.fill("#tnr", "https://chess-results.com/tnr777777.aspx?lan=2");
  await page.fill("#mesas", "1-2, x");
  await page.click("#form-torneo button[type=submit]");
  cierto("unas mesas mal escritas no se agregan, y se dice por qué", pedidosFuncion.length === 0 && /«x» no es una mesa/.test(await page.textContent("#torneo-error")));
  await page.fill("#mesas", "1");
  await page.click("#form-torneo button[type=submit]");
  await page.waitForFunction(() => /todavía no hay ronda emparejada/.test(document.getElementById("bitacora").textContent));
  igual("se le pide a la función el número del torneo, con la sesión", [pedidosFuncion[0].body, pedidosFuncion[0].headers.authorization], [{ tnr: "777777" }, "Bearer t"]);

  // Lichess: un token malo y uno bueno.
  await page.fill("#token", "lip_malo");
  await page.click("#form-lichess button[type=submit]");
  await page.waitForFunction(() => /No se conectó/.test(document.getElementById("lichess-estado").textContent));
  cierto("un token que Lichess no acepta se dice", /no aceptó el token/.test(await page.textContent("#lichess-estado")));
  await page.fill("#token", "lip_bueno");
  await page.click("#form-lichess button[type=submit]");
  await page.waitForFunction(() => /Conectado a Lichess como Organiza/.test(document.getElementById("lichess-estado").textContent));
  cierto("con el bueno, dice con qué cuenta quedó", true);
  cierto("el token de Lichess no va a la función para leer chess-results (solo para crear en Lichess)",
    pedidosFuncion.every((p) => !JSON.stringify(p).includes("lip_bueno") || p.body.accion === "lichess"));

  // Sale la ronda 3: el archivo, el torneo y la ronda en Lichess.
  estado.leer = respuesta(3, DATOS.mesas);
  const bajada = page.waitForEvent("download");
  await page.click("#btn-revisar");
  const archivo = await bajada;
  const contenido = fs.readFileSync(await archivo.path(), "utf8");
  igual("sale la ronda: se baja el archivo con su nombre", archivo.suggestedFilename(), "blitz-de-prueba-ronda-3.pgn");
  igual("con solo la mesa elegida (la 1)", contenido, DGT.pgn(respuesta(3, DATOS.mesas), { mesas: "1" }));
  await page.waitForFunction(() => /creada en Lichess con su pareo/.test(document.getElementById("bitacora").textContent));
  const rutas = lichess.map((l) => l.metodo + " " + l.ruta).filter((r) => !/api\/account/.test(r));
  igual("en Lichess: el torneo, la ronda y el pareo empujado, en ese orden", rutas,
    ["POST /broadcast/new", "POST /broadcast/TOUR0001/new", "POST /api/broadcast/round/RND00001/push"]);
  const formTorneo = new URLSearchParams(lichess.find((l) => l.ruta === "/broadcast/new").cuerpo);
  igual("el torneo lleva el nombre de chess-results, el ritmo y la zona", [formTorneo.get("name"), formTorneo.get("info.fideTC"), formTorneo.get("info.timeZone")],
    ["Blitz de Prueba", "blitz", "America/Costa_Rica"]);
  const formRonda = new URLSearchParams(lichess.find((l) => l.ruta === "/broadcast/TOUR0001/new").cuerpo);
  igual("la ronda, con su nombre y la hora de chess-results", [formRonda.get("name"), formRonda.get("startsAt")], ["Ronda 3", String(Date.UTC(2026, 10, 7, 21))]);
  igual("lo empujado es el mismo PGN del archivo", lichess.find((l) => /push$/.test(l.ruta)).cuerpo, contenido);
  cierto("con el token en la cabecera", lichess.filter((l) => l.ruta !== "/api/account").every((l) => l.auth === "Bearer lip_bueno"));
  igual("crear el torneo y la ronda va por la función (Lichess no acepta esos pedidos desde otra página); empujar el pareo, directo",
    [lichess.filter((l) => l.ruta !== "/api/account").map((l) => l.desde), bloqueados], [["funcion", "funcion", "navegador"], []]);

  // Volver a leer la misma ronda, y recargar la página: nada se repite.
  const antes = lichess.length;
  await page.click("#btn-revisar");
  await page.waitForFunction(() => /nada nuevo \(ronda 3\)/.test(document.getElementById("bitacora").textContent));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => /Conectado a Lichess/.test(document.getElementById("lichess-estado").textContent));
  await page.click("#btn-revisar");
  await page.waitForFunction(() => /nada nuevo \(ronda 3\)/.test(document.getElementById("bitacora").textContent));
  igual("ni leerla otra vez ni recargar la página la crean de nuevo en Lichess",
    lichess.slice(antes).map((l) => l.ruta).filter((r) => r !== "/api/account"), []);
  cierto("el torneo recuerda su ronda y su transmisión", /Ronda 3 \(1 partida\) · en Lichess/.test(await page.textContent("#torneos")) &&
    await page.$eval("#torneos", (u) => [...u.querySelectorAll("a")].some((a) => a.href === "https://lichess.org/broadcast/blitz/TOUR0001")));

  // chess-results corrige el pareo de la ronda 3.
  const corregida = JSON.parse(JSON.stringify(DATOS.mesas));
  corregida[1].negras = { no: 11, titulo: "", nombre: "Otra Persona, Iris", elo: 1500, fide: "" };
  estado.leer = respuesta(3, corregida);
  const otra = page.waitForEvent("download");
  await page.click("#btn-revisar");
  const archivo2 = await otra;
  cierto("si el pareo cambia, se vuelve a armar el archivo", /Otra Persona, Iris/.test(fs.readFileSync(await archivo2.path(), "utf8")));
  await page.waitForFunction(() => /el pareo cambió/.test(document.getElementById("bitacora").textContent));
  igual("pero a Lichess no se le manda solo (puede haber partidas empezadas)",
    lichess.slice(antes).map((l) => l.ruta).filter((r) => r !== "/api/account"), []);

  // Lichess falla con la ronda 4: queda pendiente y sale en la revisión siguiente.
  estado.leer = respuesta(4, DATOS.mesas);
  estado.lichessFalla = true;
  const tercera = page.waitForEvent("download");
  await page.click("#btn-revisar");
  await tercera;
  await page.waitForFunction(() => /ronda 4: no se pudo crear en Lichess/.test(document.getElementById("bitacora").textContent));
  estado.lichessFalla = false;
  const n = lichess.length;
  await page.click("#btn-revisar");
  await page.waitForFunction(() => /ronda 4: creada en Lichess/.test(document.getElementById("bitacora").textContent));
  igual("si Lichess falla, la ronda se crea en la revisión siguiente, sin volver a bajar el archivo",
    lichess.slice(n).map((l) => l.ruta).filter((r) => r !== "/api/account"), ["/broadcast/TOUR0001/new", "/api/broadcast/round/RND00002/push"]);

  // Cambiar las mesas de un torneo ya agregado: la ronda en curso se vuelve a armar.
  const conDos = page.waitForEvent("download");
  await page.fill("#mesas-777777", "2, 1");
  await page.click("#mesas-777777 + button");
  const archivo3 = fs.readFileSync(await (await conDos).path(), "utf8");
  igual("al cambiar las mesas, la ronda en curso se vuelve a armar con las nuevas", (archivo3.match(/\[Board "\d+"\]/g) || []), ['[Board "1"]', '[Board "2"]']);
  await page.waitForFunction(() => /con las mesas nuevas \(1-2\)/.test(document.getElementById("bitacora").textContent));
  igual("y el campo queda escrito en orden", await page.inputValue("#mesas-777777"), "1-2");

  // Datos para LiveChess: cada campo de la pestaña Tournament, para copiar.
  const filasLC = () => page.$$eval("#torneos details li", (ls) => ls.map((l) => l.querySelector("span").textContent));
  igual("«Datos para LiveChess» sale cerrado", await page.$eval("#torneos details", (d) => d.open), false);
  await page.click("#torneos summary");
  igual("y abierto muestra los seis datos, con lo que dijo chess-results", await filasLC(),
    ["blitz-de-prueba", "Blitz de Prueba", "Liceo de Prueba, San José", "Costa Rica", "15 min + 10 seg add", "6"]);
  await page.click('[data-foco="777777:Location"]');
  igual("«Copiar» deja el dato en el portapapeles y lo dice", [await page.evaluate(() => navigator.clipboard.readText()), await page.textContent("#torneos [role=status]")],
    ["Liceo de Prueba, San José", "Copiado: Location."]);
  await page.click('[data-foco="777777:todo"]');
  igual("«Copiar todo» deja una línea por dato", await page.evaluate(() => navigator.clipboard.readText()),
    "Short title: blitz-de-prueba\nName: Blitz de Prueba\nLocation: Liceo de Prueba, San José\nCountry: Costa Rica\nTime control: 15 min + 10 seg add\nNumber of rounds: 6");
  // La lista se rehace en cada revisión (cada 30 s): no debe cerrarse ni quitarle el foco a quien copia.
  await page.focus('[data-foco="777777:Country"]');
  const lineasAntes = (await bitacora(page)).length;
  await page.evaluate(() => document.getElementById("btn-revisar").click());   // como la revisión automática: sin mover el foco
  await page.waitForFunction((n) => document.querySelectorAll("#bitacora li").length > n, lineasAntes);
  igual("tras una revisión la tarjeta sigue abierta y el foco, en el mismo botón",
    [await page.$eval("#torneos details", (d) => d.open), await page.evaluate(() => document.activeElement.dataset.foco)], [true, "777777:Country"]);
  // Un torneo viejo: chess-results ya no muestra su ficha. Lo sabido no se borra, ni al recargar.
  estado.leer = respuesta(4, DATOS.mesas, FICHA_VACIA);
  await page.click("#btn-revisar");
  await page.waitForFunction(() => /nada nuevo/.test(document.getElementById("bitacora").textContent));
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#torneos summary");
  igual("una lectura sin ficha no borra la que ya estaba, tampoco al recargar", await filasLC(),
    ["blitz-de-prueba", "Blitz de Prueba", "Liceo de Prueba, San José", "Costa Rica", "15 min + 10 seg add", "6"]);
  // Y un torneo al que le falta un dato: se dice, sin botón de copiar.
  await page.evaluate(() => { const e = JSON.parse(localStorage.getItem("pareo-dgt")); e.torneos[0].ficha = { pais: "Costa Rica", rondas: 6 }; localStorage.setItem("pareo-dgt", JSON.stringify(e)); });
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#torneos summary");
  const textosLC = await page.$$eval("#torneos details li", (ls) => ls.map((l) => l.textContent));
  cierto("un dato que falta se dice (el lugar y el control de tiempo)", /chess-results no lo dice/.test(textosLC[2]) && /chess-results no lo dice/.test(textosLC[4]) && !/chess-results no lo dice/.test(textosLC[3]), textosLC.join(" | "));
  igual("y ese dato no tiene botón de copiar", await page.$$eval("#torneos details button", (bs) => bs.map((b) => b.dataset.foco)),
    ["777777:Short title", "777777:Name", "777777:Country", "777777:Number of rounds", "777777:todo"]);

  // Vigilar.
  await page.click("#btn-vigilar");
  igual("«Empezar a vigilar» dice que está encendido", [await page.getAttribute("#btn-vigilar", "aria-pressed"), (await page.textContent("#btn-vigilar")).trim()], ["true", "Dejar de vigilar"]);
  await page.click("#btn-vigilar");
  igual("y se apaga", await page.getAttribute("#btn-vigilar", "aria-pressed"), "false");

  const lineas = await bitacora(page);
  cierto("la bitácora lleva la hora de cada cosa", lineas.every((l) => /^\d{1,2}:\d{2}:\d{2}/.test(l)), lineas[0]);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaFuncion();
  pruebaModulo();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaPagina(browser);
  } finally {
    await browser.close();
  }
  terminar();
})().catch((e) => { console.error(e); process.exit(1); });

function terminar() {
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron` : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
}
