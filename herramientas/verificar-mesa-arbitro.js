/* «Mesa del árbitro»: lo que no necesita navegador.

   1. El lector de la Edge Function mesa-arbitro
      (supabase/functions/mesa-arbitro/index.ts), sin red y sin Deno: se sacan
      del archivo sus lectores, se les quitan los tipos con el propio Node y
      se corren contra HTML con la FORMA de la pantalla real «Enter Results
      Online» de chess-results (comprobada con un torneo de prueba: el
      código, el SID, la ronda en un campo de solo lectura, una fila por mesa
      con un desplegable GridErg$ctlNN$combo_erg de valores 0-6 y D, y los
      botones Save y Search/Reload).
   2. El módulo js/mesa-arbitro.js (qué mesas cambió el árbitro, las líneas de
      la bitácora, el documento).
   3. Las promesas que no se pueden saltar, leídas del código: la base no deja
      editar ni borrar la bitácora, ni escribir la hora o el autor; y la clave
      (SID) nunca se imprime ni se guarda.

   Lo que se rompe callado acá: guardar el valor de una mesa en el desplegable
   de OTRA (los campos se llaman por la posición de la fila, no por la mesa),
   mandar una ronda distinta de la que vio el árbitro, pisar con «0» las mesas
   que no se tocaron, o dejar la clave en un registro.

   Ver «Mesa del árbitro: resultados y bitácora» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js mesa-arbitro                      */
"use strict";
const fs = require("fs");
const path = require("path");
const { stripTypeScriptTypes } = require("module");

const RAIZ = path.join(__dirname, "..");
// Lo que habla con chess-results vive en UNA copia compartida (la usan mesa-arbitro y las
// dos funciones del Centroamericano): se saca de ahí, con los tipos quitados por Node.
const fuente = fs.readFileSync(path.join(RAIZ, "supabase", "functions", "mesa-arbitro", "index.ts"), "utf8");
const compartido = fs.readFileSync(path.join(RAIZ, "supabase", "functions", "_compartido", "chess-results-ingreso.ts"), "utf8");
const desde = compartido.indexOf("function texto(");
const js = stripTypeScriptTypes(compartido.slice(desde).replace(/^export /gm, ""));
const VALORES = ["0", "1", "2", "3", "4", "5", "6", "D"];
const CR_UA = "Mozilla/5.0 (verificador)";
const construir = (fetchFalso) => new Function("VALORES", "MAX_CAMBIOS", "CR_USER_AGENT", "URL_INGRESO", "fetch", js +
  "\nreturn { leerPantalla, camposDelFormulario, armarGuardado, mismoNombre, nombreDeBoton, entrar, leerRonda, guardarYComprobar };")(VALORES, 400, CR_UA, "https://chess-results.com/Results.aspx", fetchFalso);
const L = construir(() => { throw new Error("sin red"); });
const M = require(path.join(RAIZ, "js", "mesa-arbitro.js"));

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

// La pantalla de ingreso, con la forma de la real. `valores` es el valor
// elegido de cada fila (por posición).
const OPCIONES = [["0", "No"], ["1", "1 - 0"], ["2", "Draw"], ["3", "0 - 1"], ["4", "1f-0f"], ["5", "0f-1f"], ["6", "0f-0f"], ["D", "Delete"]];
function pantalla(filas, { ronda = 3, tnr = "1532448", valores = [], opciones = null, torneo = "Torneo de Prueba ", grupo = null } = {}) {
  const combo = (opciones || [[tnr, torneo]]).map(([v, n]) => `<option ${v === tnr ? 'selected="selected" ' : ""}value="${v}">${n}</option>`).join("");
  const fila = (f, i) => {
    const nn = String(i + 2).padStart(2, "0");
    const sel = valores[i] == null ? "0" : valores[i];
    return `<tr>\r\n<td style="white-space:nowrap;">${f[0]}</td><td style="white-space:nowrap;">${f[1]} </td><td style="white-space:nowrap;">${f[2]} </td><td style="white-space:nowrap;">` +
      `<select name="ctl00$P1$GridErg$ctl${nn}$combo_erg" id="P1_GridErg_combo_erg_${i}" style="width:140px;">` +
      OPCIONES.map(([v, t]) => `<option ${v === sel ? 'selected="selected" ' : ""}value="${v}">${t}</option>`).join("") + `</select></td></tr>`;
  };
  return `<html><body><form method="post" action="./Results.aspx" id="form1">
<input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET" value="" />
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="/wEPDwUJ+abc/def=&amp;x" />
<input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="/wEdAP0B" />
<input type="submit" name="ctl00$P1$cb_save" value="Save" id="P1_cb_save" class="CRButton" />
<input type="submit" name="ctl00$P1$cb_search" value="Search/Reload" id="P1_cb_search" class="CRButton" />
<select name="ctl00$P1$combo_Tournament" onchange="javascript:setTimeout(&#39;__doPostBack(\\&#39;ctl00$P1$combo_Tournament\\&#39;,\\&#39;\\&#39;)&#39;, 0)" id="P1_combo_Tournament">${combo}</select>
<input id="P1_cbox_fehlende_erg" type="checkbox" name="ctl00$P1$cbox_fehlende_erg" onclick="x" />
<input id="P1_cbox_show_names" type="checkbox" name="ctl00$P1$cbox_show_names" checked="checked" />
<input name="ctl00$P1$txt_rd" type="text" value="${ronda}" readonly="readonly" id="P1_txt_rd" disabled="disabled" class="aspNetDisabled" />
<input name="ctl00$P1$txt_tnr" type="text" value="${tnr}" readonly="readonly" id="P1_txt_tnr" disabled="disabled" class="aspNetDisabled" />
${grupo ? `<input name="ctl00$P1$txt_groupID" type="text" value="${grupo}" readonly="readonly" id="P1_txt_groupID" disabled="disabled" class="aspNetDisabled" />` : ""}
<input name="ctl00$P1$txt_board_from" type="text" value="1" id="P1_txt_board_from" />
<input name="ctl00$P1$txt_board_to" type="text" value="9999" id="P1_txt_board_to" />
<input name="ctl00$P1$txt_name" type="text" id="P1_txt_name" />
<table><tr><td>M.</td><td>Nombre de blancas</td><td>Name Black</td><td>Res.</td></tr>
${filas.map(fila).join("\n")}
</table></form></body></html>`;
}
const LOGIN = `<html><body><form method="post" action="./Results.aspx"><input type="hidden" name="__VIEWSTATE" value="v" />
<input type="submit" name="ctl00$P1$cb_login" value="Login" />
<input name="ctl00$P1$txt_tnr_login" type="text" maxlength="7" /><input name="ctl00$P1$txt_SID" type="text" maxlength="32" /></form></body></html>`;

const FILAS = [[1, "Muñoz Feliz Alejandro", "Gramajo Tovar Marco"], [2, "Harvey Ian", "Acuña Porras Fabio"], [3, "Hopkins John", "Baquero Graterol"]];

console.log("\n=== La pantalla de ingreso: mesas, ronda y torneo ===");
const html = pantalla(FILAS, { valores: [undefined, "2", "D"] });
const p = L.leerPantalla(html);
igual("entró, con el torneo, el código y la ronda abierta", [p.entro, p.tnr, p.torneo, p.ronda], [true, "1532448", "Torneo de Prueba", 3]);
igual("cada mesa con sus jugadores, el valor que tiene y el campo POR POSICIÓN",
  p.mesas.map((m) => [m.mesa, m.blancas, m.negras, m.valor, m.campo]),
  [[1, "Muñoz Feliz Alejandro", "Gramajo Tovar Marco", "0", "ctl00$P1$GridErg$ctl02$combo_erg"],
   [2, "Harvey Ian", "Acuña Porras Fabio", "2", "ctl00$P1$GridErg$ctl03$combo_erg"],
   [3, "Hopkins John", "Baquero Graterol", "D", "ctl00$P1$GridErg$ctl04$combo_erg"]]);
igual("la página de login (sin grilla) no cuenta como haber entrado", L.leerPantalla(LOGIN).entro, false);
igual("una ronda sin mesas: entró, pero la lista viene vacía", (({ entro, mesas }) => [entro, mesas.length])(L.leerPantalla(pantalla([]))), [true, 0]);

console.log("\n=== Lo que el navegador mandaría ===");
const campos = L.camposDelFormulario(html);
const nombres = campos.map(([n]) => n);
igual("los ocultos viajan con su valor tal cual (entidades deshechas, sin perder nada)", campos.find(([n]) => n === "__VIEWSTATE")[1], "/wEPDwUJ+abc/def=&x");
igual("los campos «disabled» (la ronda y el código) y los botones NO viajan",
  [nombres.includes("ctl00$P1$txt_rd"), nombres.includes("ctl00$P1$txt_tnr"), nombres.includes("ctl00$P1$cb_save"), nombres.includes("ctl00$P1$cb_search")], [false, false, false, false]);
igual("la casilla sin marcar no viaja y la marcada sí", [nombres.includes("ctl00$P1$cbox_fehlende_erg"), nombres.includes("ctl00$P1$cbox_show_names")], [false, true]);
igual("el torneo elegido y los filtros viajan", [campos.find(([n]) => n.endsWith("combo_Tournament"))[1], campos.find(([n]) => n.endsWith("txt_board_to"))[1], campos.find(([n]) => n.endsWith("txt_name"))[1]], ["1532448", "9999", ""]);
igual("cada mesa viaja con el valor que ya tenía", campos.filter(([n]) => n.includes("combo_erg")).map(([, v]) => v), ["0", "2", "D"]);

console.log("\n=== Guardar: lo que se manda y lo que NO se manda ===");
const pedido = (mesa, valor, extra) => Object.assign({ mesa, blancas: (FILAS[mesa - 1] || [])[1] || "x", negras: (FILAS[mesa - 1] || [])[2] || "y", valor }, extra || {});
let g = L.armarGuardado(html, p, 3, [pedido(1, "1")]);
igual("manda UN cambio, en el campo de ESA mesa, y las demás quedan como estaban",
  g.pares.filter(([n]) => n.includes("combo_erg")), [["ctl00$P1$GridErg$ctl02$combo_erg", "1"], ["ctl00$P1$GridErg$ctl03$combo_erg", "2"], ["ctl00$P1$GridErg$ctl04$combo_erg", "D"]]);
igual("al final va el botón de guardar, con el valor que trae la página", g.pares[g.pares.length - 1], ["ctl00$P1$cb_save", "Save"]);
igual("y el estado de la página viaja", g.pares.some(([n, v]) => n === "__VIEWSTATE" && v.startsWith("/wEPD")), true);
g = L.armarGuardado(html, p, 3, [pedido(3, "3"), pedido(2, "D")]);
igual("dos cambios: cada uno en su campo", g.pares.filter(([n]) => n.includes("combo_erg")).map(([, v]) => v), ["0", "D", "3"]);
igual("una ronda distinta de la que vio el árbitro: no se manda nada", L.armarGuardado(html, p, 2, [pedido(1, "1")]).error, "La ronda abierta en chess-results es la 3, no la 2. No se guardó nada.");
igual("una mesa con otros jugadores (la lista se corrió): no se manda nada", /ahora juegan otros/.test(L.armarGuardado(html, p, 3, [pedido(1, "1", { blancas: "Otra Persona" })]).error), true);
igual("una mesa que no existe", /no está en la ronda 3/.test(L.armarGuardado(html, p, 3, [pedido(9, "1")]).error), true);
igual("un valor que no es de la lista", /no válido/.test(L.armarGuardado(html, p, 3, [pedido(1, "7")]).error), true);
igual("la misma mesa dos veces", /dos veces/.test(L.armarGuardado(html, p, 3, [pedido(1, "1"), pedido(1, "3")]).error), true);
igual("sin cambios", L.armarGuardado(html, p, 3, []).error, "No hay nada que guardar.");
igual("sin haber entrado, no se guarda", /No se pudo entrar/.test(L.armarGuardado(LOGIN, L.leerPantalla(LOGIN), 3, [pedido(1, "1")]).error), true);
igual("sin el botón de guardar (chess-results cambió su pantalla), no se manda a ciegas", /no encuentro el botón/.test(L.armarGuardado(html.replace(/ctl00\$P1\$cb_save/g, "otro"), p, 3, [pedido(1, "1")]).error), true);
igual("los nombres se comparan sin tildes ni mayúsculas", [L.mismoNombre("Muñoz  FELIZ", "munoz feliz"), L.mismoNombre("A", "B"), L.mismoNombre("", "")], [true, false, false]);

console.log("\n=== El módulo: qué cambió el árbitro y la bitácora ===");
const mesas = [{ mesa: 1, blancas: "A", negras: "B", valor: "0" }, { mesa: 2, blancas: "C", negras: "D", valor: "1" }, { mesa: 3, blancas: "E", negras: "F", valor: "0" }, { mesa: 4, blancas: "G", negras: "H", valor: "2" }];
const cs = M.cambios(mesas, { 1: "3", 2: "1", 3: "D", 4: "D", 5: "1" });
igual("un cambio es lo distinto de lo que ya hay: lo igual, el «borrar» de una mesa vacía y una mesa que no existe no cuentan", cs.map((c) => [c.mesa, c.valor, c.antes]), [[1, "3", "0"], [4, "D", "2"]]);
igual("sin elegir nada, nada cambia", M.cambios(mesas, {}), []);
const lin = M.lineasDeCambios(M.cambios(mesas, { 1: "3", 2: "2" }), { tnr: "1532448", torneo: "Torneo de Prueba", ronda: 3 }, true);
igual("una mesa sin resultado da un «resultado»; una con otro da una «corrección» con el anterior",
  lin.map((l) => [l.mesa, l.tipo, l.resultado, l.anterior, l.enviado, l.texto]), [[1, "resultado", "0-1", null, true, "A – B"], [2, "correccion", "1/2", "1-0", true, "C – D"]]);
igual("la línea no trae la clave ni más columnas de las que la base deja escribir",
  Object.keys(lin[0]).sort(), ["anterior", "articulo", "enviado", "mesa", "resultado", "ronda", "texto", "tipo", "tnr", "torneo"]);
igual("la lista para teclear va ordenada por mesa y con las palabras", M.listaParaTeclear([{ mesa: 4, valor: "D" }, { mesa: 1, valor: "2" }]), "Mesa 1: ½-½ (tablas)\nMesa 4: Borrar el resultado");
const doc = M.documento({ tnr: "1532448", torneo: "Torneo de Prueba" }, [
  { ocurrio: "2026-11-01T20:00:00Z", tipo: "resultado", ronda: 3, mesa: 1, resultado: "0-1", enviado: true, texto: "A – B", articulo: "" },
  { ocurrio: "2026-11-01T19:00:00Z", tipo: "incidencia", ronda: 3, mesa: 2, texto: "Sonó un celular.", articulo: "art. 11.3.2" },
  { ocurrio: "2026-11-01T21:00:00Z", tipo: "correccion", ronda: 3, mesa: 1, resultado: "1-0", anterior: "0-1", enviado: false, texto: "A – B", articulo: "" },
], "Ana Árbitra", (x) => "H:" + x.slice(11, 13));
const tabla = doc.bloques.find((b) => b.tipo === "tabla");
igual("el documento: título y torneo", [doc.titulo, doc.subtitulo], ["Bitácora del árbitro", "Torneo de Prueba · chess-results 1532448"]);
igual("las líneas salen en orden de hora, con la hora ya en hora de Costa Rica", tabla.filas.map((f) => [f[0], f[3]]), [["H:19", "Incidencia"], ["H:20", "Resultado"], ["H:21", "Corrección"]]);
igual("el detalle dice si se mandó o solo se anotó", [tabla.filas[1][4], tabla.filas[2][4]],
  ["0-1 (ganan negras) — A – B · enviado a chess-results", "De «0-1 (ganan negras)» a «1-0 (ganan blancas)» — A – B · solo anotado"]);
igual("el resumen cuenta lo que hay", doc.bloques.find((b) => b.tipo === "lista").items[0], "Resultados anotados: 1 (1 enviados a chess-results, contando las correcciones).");
igual("y la firma lleva el nombre", doc.bloques[doc.bloques.length - 1].texto.endsWith("Árbitro: Ana Árbitra"), true);
igual("sin nada anotado, lo dice", M.documento({ tnr: "1" }, [], "").bloques.some((b) => b.texto === "No se anotó nada en este torneo."), true);

console.log("\n=== Lo que la base no deja hacer (la migración) ===");
const sql = fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => /mesa_arbitro_bitacora/.test(f))[0]), "utf8");
const sinComentarios = sql.replace(/--[^\n]*/g, "");
igual("la tabla tiene la seguridad por filas encendida", /alter table public\.arbitro_bitacora enable row level security/.test(sinComentarios), true);
igual("no hay política de update ni de delete: una bitácora solo se agrega", [/for update/i.test(sinComentarios), /for delete/i.test(sinComentarios), /grant[^;]*\b(update|delete)\b/i.test(sinComentarios)], [false, false, false]);
const insertable = (sinComentarios.match(/grant insert \(([^)]*)\)/) || [])[1] || "";
igual("el permiso de insert es por columna: la hora y el autor los pone la base", [/ocurrio/.test(insertable), /creada_por/.test(insertable), /\bid\b/.test(insertable), insertable.includes("tnr")], [false, false, false, true]);
igual("ver y anotar piden la licencia «mesa-arbitro» (y ver, también quien administra)",
  [(sinComentarios.match(/tengo_herramienta\('mesa-arbitro'\)/g) || []).length, /soy_admin\(\)/.test(sinComentarios)], [2, true]);
igual("auth.uid() siempre envuelto en (select …)", (sinComentarios.match(/auth\.uid\(\)/g) || []).length, (sinComentarios.match(/\(select auth\.uid\(\)\)/g) || []).length + 1 /* el default de la columna */);
igual("la tabla no tiene dónde guardar la clave", /\b(sid|clave|password|secret)/i.test(sinComentarios.replace(/comment on table[^;]*;/i, "")), false);


(async () => {
console.log("\n=== Torneos ligados en un grupo: una clave abre todos ===");
const grp = L.leerPantalla(pantalla(FILAS, { tnr: "100", torneo: "Grupo A", grupo: "100", opciones: [["100", "Grupo A"], ["200", "Grupo B"]] }));
igual("el desplegable trae los torneos del grupo y cuál está elegido", [grp.grupo, grp.torneos], ["100", [{ tnr: "100", nombre: "Grupo A", elegido: true }, { tnr: "200", nombre: "Grupo B", elegido: false }]]);
igual("un torneo suelto trae solo el suyo y ningún grupo", [p.grupo, p.torneos.length], ["", 1]);

// Un chess-results de mentira con la conducta que se COMPROBÓ con un grupo real:
//   - elegir un torneo en el desplegable solo cambia el encabezado: la tabla de mesas sigue
//     siendo la del torneo anterior, hasta apretar «Search/Reload»;
//   - un «Save» escribe en la tabla que se está mostrando;
//   - al grupo se entra con el código del GRUPO.
//
// Con `ignorar` el desplegable NO cambia de torneo (una falla en silencio de chess-results o
// un cambio en su pantalla) y los dos torneos tienen los MISMOS jugadores: lo único que
// frena un «Save» en el torneo equivocado es comprobar cuál quedó abierto.
function chessResultsFalso(ignorar = false) {
  const filasA = [[1, "Ana Uno", "Beto Dos"], [2, "Cleo Tres", "Dani Cuatro"]];
  const T = {
    "100": { nombre: "Grupo A", filas: filasA },
    "200": { nombre: "Grupo B", filas: ignorar ? filasA : [[1, "Eli Cinco", "Fran Seis"], [2, "Gus Siete", "Hana Ocho"], [3, "Ivo Nueve", "Jana Diez"]] },
  };
  const guardados = { "100": {}, "200": {} };
  const sesion = { elegido: "100", mostrado: "100" };
  const pagina = () => pantalla(T[sesion.mostrado].filas, {
    tnr: sesion.elegido, torneo: T[sesion.elegido].nombre, grupo: "100", ronda: 1, opciones: [["100", "Grupo A"], ["200", "Grupo B"]],
    valores: T[sesion.mostrado].filas.map((f) => guardados[sesion.mostrado][f[0]] || "0"),
  });
  const respuesta = (html) => Promise.resolve({ status: 200, ok: true, headers: { getSetCookie: () => [], get: () => null }, text: () => Promise.resolve(html) });
  const falso = (url, init) => {
    if (!init || init.method !== "POST") return respuesta(LOGIN);
    const f = new URLSearchParams(init.body);
    if (f.has("ctl00$P1$cb_login")) {
      if (f.get("ctl00$P1$txt_tnr_login") !== "100" || f.get("ctl00$P1$txt_SID") !== "GRUPOGRUPO1234") return respuesta(LOGIN);
      sesion.elegido = sesion.mostrado = "100";
      return respuesta(pagina());
    }
    if (f.get("__EVENTTARGET") === "ctl00$P1$combo_Tournament") { if (!ignorar) sesion.elegido = f.get("ctl00$P1$combo_Tournament"); return respuesta(pagina()); }
    if (f.has("ctl00$P1$cb_search")) { if (!ignorar) sesion.mostrado = sesion.elegido = f.get("ctl00$P1$combo_Tournament"); return respuesta(pagina()); }
    if (f.has("ctl00$P1$cb_save")) {
      T[sesion.mostrado].filas.forEach((fila, i) => {
        const v = f.get("ctl00$P1$GridErg$ctl" + String(i + 2).padStart(2, "0") + "$combo_erg");
        if (v === "D") delete guardados[sesion.mostrado][fila[0]];
        else if (v && v !== "0") guardados[sesion.mostrado][fila[0]] = v;
      });
      return respuesta(pagina());
    }
    return respuesta(LOGIN);
  };
  return { falso, guardados };
}
{
  const cr = chessResultsFalso();
  const G = construir(cr.falso);
  const leido = async (...a) => { const r = await G.leerRonda(...a); return "error" in r ? [r.estado, r.error.slice(0, 31)] : [r.pantalla.tnr, r.pantalla.mesas.length, r.pantalla.mesas[0].blancas]; };
  igual("sin decir torneo, se lee el que abre el código", await leido("100", "GRUPOGRUPO1234"), ["100", 2, "Ana Uno"]);
  igual("el segundo torneo del grupo se lee con SUS mesas (no las del primero)", await leido("100", "GRUPOGRUPO1234", "200"), ["200", 3, "Eli Cinco"]);
  igual("un torneo que no es del grupo se rechaza y dice cuáles abre la clave", await leido("100", "GRUPOGRUPO1234", "300"), [409, "Esa clave no abre el torneo 300"]);
  igual("una clave mala se rechaza", await leido("100", "MALAMALAMALA1234", "200"), [401, "chess-results no aceptó el códi"]);
  igual("el código del segundo torneo no entra: se entra por el del grupo", await leido("200", "GRUPOGRUPO1234", "200"), [401, "chess-results no aceptó el códi"]);

  const pide = (mesa, bl, ne, valor) => ({ mesa, blancas: bl, negras: ne, valor });
  let res = await G.guardarYComprobar("100", "GRUPOGRUPO1234", "200", 1, [pide(2, "Gus Siete", "Hana Ocho", "3")]);
  igual("guardar en el 2.º torneo del grupo: queda ahí, comprobado al volver a leer", [res.estado, res.cuerpo.ok, res.cuerpo.resultados.map((r) => [r.mesa, r.quedo, r.ok])], [200, true, [[2, "3", true]]]);
  igual("…y NO se escribió nada en el primer torneo", [cr.guardados["200"], cr.guardados["100"]], [{ 2: "3" }, {}]);
  res = await G.guardarYComprobar("100", "GRUPOGRUPO1234", "200", 1, [pide(1, "Ana Uno", "Beto Dos", "1")]);
  igual("una mesa con los jugadores del OTRO torneo se rechaza sin escribir", [res.estado, /ahora juegan otros/.test(res.error), cr.guardados["100"], cr.guardados["200"]], [409, true, {}, { 2: "3" }]);
  res = await G.guardarYComprobar("100", "GRUPOGRUPO1234", "100", 1, [pide(1, "Ana Uno", "Beto Dos", "2")]);
  igual("guardar en el 1.er torneo sigue funcionando y no toca el 2.º", [res.estado, res.cuerpo.ok, cr.guardados["100"], cr.guardados["200"]], [200, true, { 1: "2" }, { 2: "3" }]);
  res = await G.guardarYComprobar("100", "GRUPOGRUPO1234", "200", 1, [pide(2, "Gus Siete", "Hana Ocho", "D")]);
  igual("borrar un resultado deja la mesa en «0» (sin resultado)", [res.estado, res.cuerpo.ok, cr.guardados["200"]], [200, true, {}]);

  // El caso peligroso: el desplegable no cambia y los jugadores son los mismos.
  const mal = chessResultsFalso(true);
  const GM = construir(mal.falso);
  res = await GM.guardarYComprobar("100", "GRUPOGRUPO1234", "200", 1, [pide(1, "Ana Uno", "Beto Dos", "1")]);
  igual("si chess-results NO cambia de torneo, no se guarda (aunque los jugadores coincidan)", [res.estado, /abrió el torneo 100 y no el 200/.test(res.error), mal.guardados["100"], mal.guardados["200"]], [409, true, {}, {}]);
  const leida = await GM.leerRonda("100", "GRUPOGRUPO1234", "200");
  igual("y leer tampoco da por bueno el torneo equivocado", [leida.estado, /No se pudo abrir el torneo 200 dentro del grupo/.test(leida.error)], [502, true]);
}

console.log("\n=== La clave (SID) nunca se imprime ni se guarda ===");
const fn = fuente.replace(/\/\/[^\n]*/g, "");
const fnCompartida = compartido.replace(/\/\/[^\n]*/g, "");
const consolas = fn.match(/console\.[a-z]+\([^;]*;/g) || [];
igual("ningún console menciona la clave ni el pedido entero", consolas.filter((c) => /\bsid\b|cuerpo|req\b/i.test(c)), []);
igual("el módulo compartido no imprime nada ni habla con la base", [/console\./.test(fnCompartida), /\.from\(|createClient|SERVICE_ROLE/i.test(fnCompartida)], [false, false]);
igual("la clave no va a la base ni a la caché desde la función", [/\.from\(/.test(fn), /service_role|SERVICE_ROLE/i.test(fn)], [false, false]);
igual("mesa-arbitro usa el módulo compartido y no lleva su propio lector de chess-results", [/from "\.\/chess-results-ingreso\.ts"/.test(fn), /function leerPantalla|class Sesion|__VIEWSTATE/.test(fn)], [true, false]);
igual("la función pide la licencia con el token de quien llama", /rpc\("tengo_herramienta", \{ p_herramienta: HERRAMIENTA \}/.test(fn) && /global: \{ headers: \{ Authorization: autorizacion \} \}/.test(fn), true);
const pagina = fs.readFileSync(path.join(RAIZ, "js", "mesa-arbitro-pagina.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
igual("la página no guarda la clave en el navegador", /(localStorage|sessionStorage|indexedDB|cookie)[^;\n]*sid/i.test(pagina) || /\bsid\b[^;\n]*(localStorage|sessionStorage|indexedDB)/i.test(pagina), false);



console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
