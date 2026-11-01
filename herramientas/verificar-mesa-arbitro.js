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
const fuente = fs.readFileSync(path.join(RAIZ, "supabase", "functions", "mesa-arbitro", "index.ts"), "utf8");
const desde = fuente.indexOf("function texto(");
const hasta = fuente.indexOf("// ------------------------------------------------------------- la red");
const js = stripTypeScriptTypes(fuente.slice(desde, hasta).replace(/export function/g, "function"));
const L = new Function("VALORES", js + "\nreturn { leerPantalla, camposDelFormulario, armarGuardado, mismoNombre, nombreDeBoton };")(["0", "1", "2", "3", "4", "5", "6", "D"]);
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
function pantalla(filas, { ronda = 3, tnr = "1532448", valores = [] } = {}) {
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
<select name="ctl00$P1$combo_Tournament" onchange="javascript:setTimeout(&#39;__doPostBack(\\&#39;ctl00$P1$combo_Tournament\\&#39;,\\&#39;\\&#39;)&#39;, 0)" id="P1_combo_Tournament"><option selected="selected" value="${tnr}">Torneo de Prueba </option></select>
<input id="P1_cbox_fehlende_erg" type="checkbox" name="ctl00$P1$cbox_fehlende_erg" onclick="x" />
<input id="P1_cbox_show_names" type="checkbox" name="ctl00$P1$cbox_show_names" checked="checked" />
<input name="ctl00$P1$txt_rd" type="text" value="${ronda}" readonly="readonly" id="P1_txt_rd" disabled="disabled" class="aspNetDisabled" />
<input name="ctl00$P1$txt_tnr" type="text" value="${tnr}" readonly="readonly" id="P1_txt_tnr" disabled="disabled" class="aspNetDisabled" />
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

console.log("\n=== La clave (SID) nunca se imprime ni se guarda ===");
const fn = fuente.replace(/\/\/[^\n]*/g, "");
const consolas = fn.match(/console\.[a-z]+\([^;]*;/g) || [];
igual("ningún console menciona la clave ni el pedido entero", consolas.filter((c) => /\bsid\b|cuerpo|req\b/i.test(c)), []);
igual("la clave no va a la base ni a la caché desde la función", [/\.from\(/.test(fn), /service_role|SERVICE_ROLE/i.test(fn)], [false, false]);
igual("la función pide la licencia con el token de quien llama", /rpc\("tengo_herramienta", \{ p_herramienta: HERRAMIENTA \}/.test(fn) && /global: \{ headers: \{ Authorization: autorizacion \} \}/.test(fn), true);
const pagina = fs.readFileSync(path.join(RAIZ, "js", "mesa-arbitro-pagina.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
igual("la página no guarda la clave en el navegador", /(localStorage|sessionStorage|indexedDB|cookie)[^;\n]*sid/i.test(pagina) || /\bsid\b[^;\n]*(localStorage|sessionStorage|indexedDB)/i.test(pagina), false);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
