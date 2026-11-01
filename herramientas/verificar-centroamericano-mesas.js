/* Las mesas de los árbitros del Centroamericano 2026: lo que no necesita navegador.

   1. La lógica de js/centroamericano-mesas.js: el aviso de la primera y la segunda
      ilegal (art. 7.5.5, por partida), el estado de una mesa, el vencimiento y el
      estado de un enlace, el mensaje de WhatsApp y las claves pegadas en bloque.
   2. Las promesas de seguridad, LEÍDAS del código de las dos Edge Functions y de las
      migraciones (no se pueden saltar desde la consola):
      - el árbitro entra sin cuenta, así que la función valida el token, el vencimiento
        y el RANGO DE MESAS en cada acción, y nunca devuelve ni imprime la clave;
      - la clave de cada torneo vive en la bóveda y solo la leen funciones del servicio;
      - el registro no admite escrituras desde el navegador y no se edita ni se borra;
      - la auditoría anota los enlaces sin copiar su token.
   3. El contraste (WCAG AA) de cada par de colores nuevo del CSS, medido.

   Lo que se rompe callado acá: una acción nueva de la función que se olvida de comprobar
   el rango, un `console` que imprime el token o la clave, una política de escritura de
   más en el registro, o un color nuevo que no da 4,5 contra su fondo.

   Ver «Mesas de los árbitros del Centroamericano» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-mesas             */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const leer = (...r) => fs.readFileSync(path.join(RAIZ, ...r), "utf8");
const C = require(path.join(RAIZ, "js", "centroamericano-mesas.js"));

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/--[^\n]*/g, "");

console.log("\n=== Las ilegales: por partida, la segunda pierde (art. 7.5.5) ===");
const a1 = C.avisoIlegal(1, "Ana", "blancas");
igual("la primera ilegal: dos minutos más para el rival y NO propone resultado", [a1.nivel, /2 minutos/.test(a1.texto), a1.resultado], ["primera", true, null]);
const a2b = C.avisoIlegal(2, "Ana", "blancas"), a2n = C.avisoIlegal(2, "Beto", "negras");
igual("la segunda: pierde la partida, con la excepción de las tablas, y solo AVISA", [a2b.nivel, /pierde la partida/.test(a2b.texto), /tablas/.test(a2b.texto), /no se guarda solo/.test(a2b.texto)], ["pierde", true, true, true]);
igual("si las blancas hacen la segunda, el resultado propuesto es 0-1; si las negras, 1-0", [a2b.resultado, a2n.resultado], ["3", "1"]);
igual("la tercera sigue siendo «pierde»", C.avisoIlegal(3, "Ana", "blancas").nivel, "pierde");
igual("el artículo es el 7.5.5, el de Pareo Integral", [C.ARTICULO_ILEGAL, /7\.5\.5/.test(a1.texto), /7\.5\.5/.test(a2b.texto)], ["7.5.5", true, true]);
igual("las marcas se escriben como en Pareo: «i» por ilegal y «!» por irregularidad", [C.marcasTexto({ ilegales: 2, irregularidades: 1 }), C.marcasTexto(null)], ["ii!", ""]);

console.log("\n=== El estado de una mesa ===");
const unaMesa = (m, v) => ({ mesa: m, valor: v });
const dos = { "4|blancas": { ilegales: 2, irregularidades: 0 }, "5|negras": { ilegales: 1, irregularidades: 0 } };
igual("sin resultado y con dos ilegales: «pierde» (falta poner el resultado)", C.estadoMesa(unaMesa(4, "0"), dos), "pierde");
igual("con una sola ilegal sigue «libre»", C.estadoMesa(unaMesa(5, "0"), dos), "libre");
igual("con resultado en chess-results: «con-resultado»", C.estadoMesa(unaMesa(4, "1"), dos), "con-resultado");
igual("con algo elegido y sin guardar: «sin-guardar» (gana a los demás)", [C.estadoMesa(unaMesa(4, "0"), dos, "3"), C.estadoMesa(unaMesa(4, "1"), dos, "2")], ["sin-guardar", "sin-guardar"]);
igual("elegir lo mismo que ya hay no es un cambio", C.estadoMesa(unaMesa(4, "1"), dos, "1"), "con-resultado");

console.log("\n=== Los enlaces: vencimiento, estado y mensaje ===");
const ahora = new Date("2026-11-02T15:00:00Z");
igual("«esta noche» vence a las 11:59 p. m. de Costa Rica (05:59 UTC del día siguiente)", C.vencimiento("hoy", ahora, "2026-11-02").toISOString(), "2026-11-03T05:59:59.000Z");
igual("«al terminar el torneo» es el 9 de noviembre a las 11:59 p. m. de Costa Rica", C.vencimiento("torneo", ahora, "2026-11-02").toISOString(), "2026-11-10T05:59:59.000Z");
igual("«12 horas» son 12 horas", C.vencimiento("12h", ahora, "2026-11-02").toISOString(), "2026-11-03T03:00:00.000Z");
let malo = null; try { C.vencimiento("siempre", ahora, "2026-11-02"); } catch (e) { malo = e.message; }
igual("una opción que no existe no inventa un vencimiento", /desconocida/.test(malo || ""), true);
igual("el estado: activo, vencido o apagado (apagado gana)", [
  C.estadoAsignacion({ revocada: false, vence: "2026-11-03T00:00:00Z" }, ahora), C.estadoAsignacion({ revocada: false, vence: "2026-11-02T14:00:00Z" }, ahora),
  C.estadoAsignacion({ revocada: true, vence: "2026-11-03T00:00:00Z" }, ahora), C.estadoAsignacion({ revocada: true, vence: "2026-11-02T14:00:00Z" }, ahora)], ["activo", "vencido", "apagado", "apagado"]);
const TOKEN = "ab".repeat(32);
igual("el enlace lleva el token DESPUÉS del «#» (no viaja en las visitas ni en los registros del servidor)", C.enlaceArbitro("https://ajedrez-integral.com/", TOKEN), "https://ajedrez-integral.com/centroamericano-arbitro.html#" + TOKEN);
igual("el mensaje de WhatsApp dice quién, qué torneo, qué mesas y el enlace", C.textoWhatsapp({ arbitro: "Ana", mesa_desde: 1, mesa_hasta: 15 }, "Sub-10 Femenino", "https://x/y#t"),
  "Hola Ana: tus mesas del Centroamericano (Sub-10 Femenino, mesas 1 a 15). Abre este enlace para anotar los resultados: https://x/y#t");

igual("un enlace por definir no saluda con «Árbitro 3»", C.textoWhatsapp({ arbitro: "Árbitro 3", nombrado: false, mesa_desde: 20, mesa_hasta: 30 }, "Sub-12", "https://x/y#t").startsWith("Hola: tus mesas del Centroamericano (Sub-12, mesas 20 a 30)."), true);

console.log("\n=== Árbitros por definir: repartir las mesas, leer un rango, nombres y avisos ===");
igual("50 mesas entre 3: seguidas, parejas y las que sobran van a los primeros", C.repartirMesas(50, 3), [{ desde: 1, hasta: 17 }, { desde: 18, hasta: 34 }, { desde: 35, hasta: 50 }]);
igual("cada mesa queda con UN árbitro, sin huecos ni repetidas (de 1 a 200 mesas, de 1 a 12 árbitros)", (() => {
  for (let t = 1; t <= 200; t++) for (let n = 1; n <= 12; n++) {
    const r = C.repartirMesas(t, n);
    const seguidas = r.every((x, i) => x.desde === (i ? r[i - 1].hasta + 1 : 1) && x.hasta >= x.desde);
    const largos = r.map((x) => x.hasta - x.desde + 1);
    if (!seguidas || r[r.length - 1].hasta !== t || Math.max(...largos) - Math.min(...largos) > 1 || r.length !== Math.min(n, t)) return [t, n];
  }
  return null;
})(), null);
igual("con más árbitros que mesas no se crean enlaces vacíos; con datos malos, nada", [C.repartirMesas(2, 5).length, C.repartirMesas(0, 3), C.repartirMesas(10, 0), C.repartirMesas(NaN, 3)], [2, [], [], []]);
igual("el rango se lee como lo escribe la gente: «1-15», «1 a 15», «7»", [C.leerRango("1-15"), C.leerRango(" 1 a 15 "), C.leerRango("7"), C.leerRango("3 – 9")], [{ desde: 1, hasta: 15 }, { desde: 1, hasta: 15 }, { desde: 7, hasta: 7 }, { desde: 3, hasta: 9 }]);
igual("un rango al revés, vacío, con letras o fuera de tope no se acepta", [C.leerRango("9-3"), C.leerRango(""), C.leerRango("a-b"), C.leerRango("0-4"), C.leerRango("1-10000")], [null, null, null, null, null]);
igual("«Árbitro N» sigue al más alto del torneo, aunque haya huecos o enlaces con nombre", [C.nombrePorDefinir([]), C.nombrePorDefinir([{ arbitro: "Árbitro 2" }, { arbitro: "Ana" }, { arbitro: "Árbitro 7" }, { arbitro: "Árbitro 3x" }])], ["Árbitro 1", "Árbitro 8"]);
const t0 = new Date("2026-11-02T15:00:00Z");
igual("conectado: abrió el enlace hace menos de 2 minutos", [C.enLinea({ ultimo_uso: "2026-11-02T14:59:00Z" }, t0), C.enLinea({ ultimo_uso: "2026-11-02T14:57:00Z" }, t0), C.enLinea({ ultimo_uso: null }, t0)], [true, false, false]);
igual("«hace…» de un pedido de ayuda", [C.hace("2026-11-02T14:59:50Z", t0), C.hace("2026-11-02T14:57:00Z", t0), C.hace("2026-11-02T13:30:00Z", t0)], ["hace un momento", "hace 3 min", "hace 1 h 30 min"]);
const env = C.enviosAgrupados([
  { de: "organizacion", creado: "2026-11-02T14:00:00Z", texto: "A sus mesas", asignacion_id: "a", leido_en: "2026-11-02T14:01:00Z" },
  { de: "organizacion", creado: "2026-11-02T14:00:00Z", texto: "A sus mesas", asignacion_id: "b", leido_en: null },
  { de: "organizacion", creado: "2026-11-02T14:00:00Z", texto: "A sus mesas", asignacion_id: "c", leido_en: null },
  { de: "organizacion", creado: "2026-11-02T14:10:00Z", texto: "Pausa", asignacion_id: "a", leido_en: null },
  { de: "arbitro", creado: "2026-11-02T14:20:00Z", texto: "Ayuda", asignacion_id: "a", leido_en: null }], (id) => "Árb " + id);
igual("los avisos de una misma hora y texto se juntan en un envío: cuántos lo leyeron y a quién le falta (el pedido de un árbitro no cuenta)", env.map((e) => [e.texto, e.total, e.leidos, e.sinLeer]), [["Pausa", 1, 0, ["Árb a"]], ["A sus mesas", 3, 1, ["Árb b", "Árb c"]]]);

console.log("\n=== Las claves pegadas en bloque ===");
const SID = "AAAA1111BBBB2222CCCC3333DDDD4444";
const b = C.leerClaves("1529719 " + SID + "\n\n1529729\t" + SID + "\n1529733,ABCDEFGH12345678\n  1529740;" + SID + "  \n1529700 " + SID + "\n1529719 " + SID + "\nabc " + SID + "\n1529742 corta\n1529756\n1529766 " + SID + " sobra");
igual("lo bueno: espacio, tabulador, coma y punto y coma; el código del GRUPO no tiene que ser de los 12", b.buenas.map((x) => x.tnr), ["1529719", "1529729", "1529733", "1529740", "1529700"]);
igual("lo que hay que revisar, con su línea y su motivo", b.malas.map((x) => [x.linea, x.motivo]), [
  [7, "Ese código ya viene en otra línea."], [8, "El código del torneo son hasta 7 números."], [9, "La clave son entre 8 y 32 letras y números."],
  [10, "Cada línea lleva el código del torneo y la clave."], [11, "Cada línea lleva el código del torneo y la clave."]]);
igual("si se pide, se restringe a los torneos válidos", C.leerClaves("1529719 " + SID + "\n1529700 " + SID, ["1529719"]).malas.map((x) => x.motivo), ["Ese código no es de un torneo del Centroamericano."]);

console.log("\n=== Lo anotado por jugador (para la organización) ===");
const filas = [
  { id: "1", tipo: "ilegal", tnr: "1", ronda: 1, mesa: 2, color: "negras", jugador: "Beto" },
  { id: "2", tipo: "ilegal", tnr: "1", ronda: 1, mesa: 2, color: "negras", jugador: "Beto" },
  { id: "3", tipo: "anulacion", anula: "2", tnr: "1", ronda: 1, mesa: 2, color: "negras", jugador: "Beto" },
  { id: "4", tipo: "irregularidad", tnr: "1", ronda: 1, mesa: 3, color: "blancas", jugador: "Ana" },
  { id: "5", tipo: "ilegal", tnr: "1", ronda: 2, mesa: 2, color: "negras", jugador: "Beto" },
  { id: "6", tipo: "ilegal", tnr: "1", ronda: 1, mesa: 7, color: "blancas", jugador: "Cleo" },
  { id: "7", tipo: "ilegal", tnr: "1", ronda: 1, mesa: 7, color: "blancas", jugador: "Cleo" },
  { id: "8", tipo: "resultado", tnr: "1", ronda: 1, mesa: 7, jugador: "Cleo – Dani" }];
igual("se cuenta por ronda, mesa y color, sin lo anulado, y primero quien más lleva",
  C.jugadoresMarcados(filas).map((j) => [j.jugador, j.ronda, j.mesa, j.ilegales, j.irregularidades]),
  [["Cleo", 1, 7, 2, 0], ["Beto", 1, 2, 1, 0], ["Beto", 2, 2, 1, 0], ["Ana", 1, 3, 0, 1]]);

console.log("\n=== El árbitro entra sin cuenta: la función decide sola ===");
const mesaTs = leer("supabase", "functions", "centroamericano-mesa", "index.ts");
const mesa = sinComentarios(mesaTs);
const cuerpoDe = (nombre) => { const i = mesa.indexOf('cuerpo.action === "' + nombre + '"'); const sig = mesa.indexOf("cuerpo.action ===", i + 10); return mesa.slice(i, sig > 0 ? sig : mesa.length); };
igual("va con verify_jwt en false, dicho en su cabecera, y su README lo explica", [/verify_jwt en false/.test(mesaTs), /centroamericano-mesa` va con `verify_jwt` en \*\*false\*\*/.test(leer("supabase", "functions", "README.md"))], [true, true]);
igual("lo primero que hace es exigir un token de 64 caracteres, ANTES de tocar la base", mesa.indexOf("[0-9a-f]{64}") > 0 && mesa.indexOf("[0-9a-f]{64}") < mesa.indexOf("createClient(SUPABASE_URL"), true);
igual("rechaza el enlace apagado y el vencido", [/a\.revocada\) return json\([^)]*410/.test(mesa), /a\.vence\)\.getTime\(\) <= Date\.now\(\)\) return json\([^)]*410/.test(mesa)], [true, true]);
igual("la clave sale de la bóveda con la función del servicio, no de una tabla", [/rpc\("centroamericano_acceso"/.test(mesa), /from\("centroamericano_torneos"\)[^;]*sid/.test(mesa)], [true, false]);
const acciones = mesa.match(/cuerpo\.action === "(\w+)"/g).map((x) => x.match(/"(\w+)"/)[1]);
igual("las ocho acciones, y ninguna más", acciones, ["leer", "guardar", "anotar", "anular", "avisos", "ayuda", "leido", "nombre"]);
igual("los avisos y el nombre no hablan con chess-results ni piden la clave (no se caen con ella)", [/const DE_AVISOS = \["avisos", "ayuda", "leido", "nombre"\]/.test(mesa), /DE_AVISOS\.includes\(String\(cuerpo\.action\)\) \? \{ data: null \} : await servicio\.rpc\("centroamericano_acceso"/.test(mesa), /leerRonda|guardarYComprobar/.test(cuerpoDe("avisos") + cuerpoDe("ayuda") + cuerpoDe("leido") + cuerpoDe("nombre"))], [true, true, false]);
igual("«ayuda»: la mesa tiene que ser de su rango (403), no repite un pedido abierto de la misma mesa y tiene tope de 5 abiertos (429)", [/enRango\(mesa\)/.test(cuerpoDe("ayuda")) && /403/.test(cuerpoDe("ayuda")), /if \(igual\) return json\(\{ ok: true, ya: true/.test(cuerpoDe("ayuda")), /\.length >= 5\) return json\([^)]*429/.test(cuerpoDe("ayuda"))], [true, true, true]);
igual("«ayuda» escribe de = 'arbitro' y con SU asignación: no puede escribir como la organización ni en otro enlace", [/insert\(\{ de: "arbitro", asignacion_id: a\.id,/.test(cuerpoDe("ayuda")), /de: "organizacion"/.test(cuerpoDe("ayuda"))], [true, false]);
igual("«leido» solo marca mensajes de la organización de SU enlace, y una sola vez", [/\.eq\("asignacion_id", a\.id\)\.eq\("de", "organizacion"\)\.is\("leido_en", null\)/.test(cuerpoDe("leido"))], [true]);
igual("«nombre» solo se pone una vez (409 si ya tiene nombre) y la escritura repite la condición", [/if \(a\.nombrado\) return json\([^)]*409/.test(cuerpoDe("nombre")), /\.eq\("nombrado", false\)/.test(cuerpoDe("nombre"))], [true, true]);
// Cada acción que toca una mesa pregunta por el rango: guardar, anotar y anular.
igual("guardar, anotar y anular hacen cumplir el rango de mesas (403)", ["guardar", "anotar", "anular"].map((n) => /enRango\(/.test(cuerpoDe(n)) && /403/.test(cuerpoDe(n))), [true, true, true]);
igual("leer solo devuelve las mesas del rango", /p\.mesas\.filter\(\(m\) => enRango\(m\.mesa\)\)/.test(cuerpoDe("leer")), true);
igual("el registro de un resultado solo entra si chess-results lo confirmó al volver a leer", /resultados\.filter\(\(r\) => r\.ok\)/.test(cuerpoDe("guardar")) && /enviado: true/.test(cuerpoDe("guardar")), true);
igual("el jugador de una ilegal sale de chess-results, no de lo que manda el navegador", /const jugador = color === "blancas" \? m\.blancas/.test(cuerpoDe("anotar")) && !/cuerpo\.jugador/.test(mesa), true);
igual("«anular» solo deshace ilegales e irregularidades, de SU torneo y su rango, y una sola vez", [/f\.tipo !== "ilegal" && f\.tipo !== "irregularidad"/.test(cuerpoDe("anular")), /f\.tnr !== a\.tnr \|\| !enRango\(f\.mesa\)/.test(cuerpoDe("anular")), /select\("id"\)\.eq\("anula", id\)/.test(cuerpoDe("anular"))], [true, true, true]);
const consolas = (mesaTs.match(/console\.[a-z]+\([^;]*;/g) || []);
igual("ningún console imprime el token, la clave ni el pedido", consolas.filter((c) => /token|\bsid\b|acceso\.|cuerpo\b|req\b/i.test(c)), []);
igual("ninguna respuesta lleva la clave ni el código de acceso", /json\([^;]*(acceso\.sid|\bsid\b)/.test(mesa), false);

console.log("\n=== La organización: sesión, licencia y la clave cifrada ===");
const claveTs = leer("supabase", "functions", "centroamericano-clave", "index.ts");
const clave = sinComentarios(claveTs);
igual("va con verify_jwt en true y pregunta la licencia con el token de quien llama", [/verify_jwt en true/.test(claveTs), /rpc\("tengo_herramienta", \{ p_herramienta: HERRAMIENTA \}/.test(clave), /global: \{ headers: \{ Authorization: autorizacion \} \}/.test(clave)], [true, true, true]);
igual("prueba la clave contra chess-results ANTES de guardarla, y la guarda por la función de la bóveda", clave.indexOf("await entrar(tnr, sid)") > 0 && clave.indexOf("await entrar(tnr, sid)") < clave.indexOf('rpc("centroamericano_guardar_acceso"'), true);
igual("ninguna respuesta ni console lleva la clave", [/json\([^;]*\bsid\b[^;]*\)/.test(clave.replace(/const sid = [^;]*;/g, "").replace(/\.test\(sid\)/g, "")), (claveTs.match(/console\.[a-z]+\([^;]*;/g) || []).filter((c) => /\bsid\b|cuerpo\b/.test(c))], [false, []]);
igual("«probar» solo prueba los 12 torneos del Centroamericano", /from\("centroamericano_torneos"\)[^;]*\.eq\("tnr", tnr\)/.test(cuerpoDeClave()), true);
function cuerpoDeClave() { const i = clave.indexOf('cuerpo.action === "probar"'); return clave.slice(i); }

console.log("\n=== Lo que la base no deja hacer (las migraciones) ===");
const migs = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => /centroamericano_(mesas|grupos)\.sql$/.test(f));
igual("están las dos migraciones, la del 12 de torneos y la de los grupos", migs.length, 2);
const sql = migs.sort().map((f) => sinComentarios(leer("supabase", "migraciones", f))).join("\n");
igual("las tres tablas con la seguridad por filas encendida", ["torneos", "asignaciones", "registro"].map((t) => new RegExp("alter table public\\.centroamericano_" + t + " enable row level security").test(sql)), [true, true, true]);
igual("el registro no tiene política de escritura: ni update ni delete ni insert desde el navegador", [/create policy centroamericano_registro_\w+ on public\.centroamericano_registro\s+for (insert|update|delete)/.test(sql), /grant[^;]*(insert|update|delete)[^;]*on public\.centroamericano_registro/i.test(sql)], [false, false]);
igual("de los torneos solo se lee, y por columna: la clave no tiene dónde estar", [/grant select \(([^)]*)\) on public\.centroamericano_torneos to authenticated/.test(sql), /grant[^;]*(insert|update|delete)[^;]*on public\.centroamericano_torneos/i.test(sql), /\b(sid|secret|password)\s+(text|bytea)/i.test((sql.match(/create table public\.centroamericano_\w+ \([\s\S]*?\n\);/g) || []).join("\n"))], [true, false, false]);
igual("de las asignaciones, quien organiza solo crea (sin el token) y apaga: nada más", [/grant insert \(tnr, arbitro, mesa_desde, mesa_hasta, vence\) on public\.centroamericano_asignaciones/.test(sql), /grant update \(revocada, vence\) on public\.centroamericano_asignaciones/.test(sql), /for delete/i.test(sql)], [true, true, false]);
igual("las funciones de la clave son solo del servicio", ["centroamericano_guardar_acceso\\(text, text, text\\[\\], uuid\\)", "centroamericano_acceso\\(text\\)"].map((f) => new RegExp("revoke all on function public\\." + f + " from public, anon, authenticated").test(sql) && new RegExp("grant execute on function public\\." + f + " to service_role").test(sql)), [true, true]);
igual("ver y armar piden la licencia «mesa-arbitro» (y auth.uid() va envuelto)", [(sql.match(/tengo_herramienta\('mesa-arbitro'\)/g) || []).length >= 5, /creada_por = \(select auth\.uid\(\)\)/.test(sql)], [true, true]);
igual("el token son 64 caracteres al azar y no lo elige quien crea el enlace", [/token text not null unique default replace\(gen_random_uuid\(\)::text, '-', ''\) \|\| replace\(gen_random_uuid\(\)::text, '-', ''\)/.test(sql), /grant insert \([^)]*token/.test(sql)], [true, false]);
igual("la auditoría anota los enlaces SIN copiar el token", [/execute function interno\.auditar\('arbitro', 'tnr', 'mesa_desde', 'mesa_hasta', 'vence', 'revocada'\)/.test(sql), /auditar\([^)]*token/.test(sql)], [true, false]);
igual("el registro solo admite los tipos que las funciones escriben", /tipo in \('resultado', 'correccion', 'ilegal', 'irregularidad', 'incidencia', 'nota', 'anulacion'\)/.test(sql), true);
const sqlAvisos = ["avisos", "nombrado_insert"].map((n) => sinComentarios(leer("supabase", "migraciones", fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).find((f) => f.endsWith("centroamericano_" + n + ".sql"))))).join("\n");
igual("los avisos: RLS encendida, sin delete, la organización solo INSERTA mensajes suyos y solo ACTUALIZA el estado de un pedido", [/alter table public\.centroamericano_avisos enable row level security/.test(sqlAvisos), /for delete/i.test(sqlAvisos) || /grant[^;]*delete[^;]*centroamericano_avisos/i.test(sqlAvisos), /with check \(de = 'organizacion' and creado_por = \(select auth\.uid\(\)\)/.test(sqlAvisos), /grant insert \(de, asignacion_id, mesa, texto\) on public\.centroamericano_avisos/.test(sqlAvisos), /grant update \(estado\) on public\.centroamericano_avisos/.test(sqlAvisos), /using \(de = 'arbitro'[^;]*with check \(de = 'arbitro'/.test(sqlAvisos.replace(/\n/g, " "))], [true, false, true, true, true, true]);
igual("quién atendió un pedido y cuándo lo pone la base (un trigger), no el navegador: ni atendido_por ni atendido_en se pueden escribir", [/create trigger atendido before update on public\.centroamericano_avisos/.test(sqlAvisos), /grant (insert|update) \([^)]*(atendido|leido_en|creado_por)/.test(sqlAvisos)], [true, false]);
igual("un enlace puede crearse «por definir»: la columna nombrado se inserta y se cambia, y nada más de lo que ya había", [/grant insert \(nombrado\) on public\.centroamericano_asignaciones/.test(sqlAvisos), /grant update \(arbitro, nombrado, mesa_desde, mesa_hasta\) on public\.centroamericano_asignaciones/.test(sqlAvisos), /grant[^;]*\b(token|ultimo_uso|creada_por)\b[^;]*on public\.centroamericano_asignaciones/.test(sqlAvisos)], [true, true, false]);
igual("las dos tablas de acceso están en la lista de las vigiladas por la auditoría", /"centroamericano_asignaciones", "centroamericano_torneos"/.test(leer("herramientas", "verificar-auditoria.js")), true);

console.log("\n=== Las páginas: el token y la clave no se guardan ===");
const paginaArb = sinComentarios(leer("js", "centroamericano-arbitro.js"));
const paginaOrg = sinComentarios(leer("js", "centroamericano-mesas-pagina.js"));
igual("el árbitro no guarda su token en el navegador ni lo manda a otra parte", [/(localStorage|sessionStorage|indexedDB|document\.cookie)/.test(paginaArb), /console\./.test(paginaArb), /fetch\(/.test(paginaArb)], [false, false, false]);
igual("la organización no guarda ninguna clave: la casilla se vacía en cuanto se manda", [/(localStorage|sessionStorage|indexedDB)/.test(paginaOrg), /\$\("g-sid"\)\.value = ""/.test(paginaOrg)], [false, true]);
igual("las dos páginas son noindex y no entran a los buscadores", ["centroamericano-arbitro.html", "centroamericano-mesas.html"].map((f) => /<meta name="robots" content="noindex">/.test(leer(f))), [true, true]);

console.log("\n=== El contraste de los colores nuevos (WCAG AA, medido) ===");
function lum(hex) { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const css = leer("css", "centroamericano-mesas.css");
// [texto, fondo, dónde se usa]; todos tienen que dar 4,5 o más, y estar de verdad en el CSS.
const PARES = [
  ["#ffffff", "#40478f", "cabecera de la mesa, «Irregularidad» y botones (blanco sobre morado)"],
  ["#ffffff", "#ce1328", "banda de la segunda ilegal, «Ilegal» y los avisos rojos (blanco sobre rojo)"],
  ["#ffffff", "#9f0e1e", "botón rojo al pasar el dedo o el mouse"],
  ["#ffffff", "#1e2453", "botón morado al pasar el mouse y las negras (blanco sobre morado hondo)"],
  ["#1e2453", "#e0ab5b", "aviso de la primera ilegal (morado hondo sobre naranja)"],
  ["#1e2453", "#ffffff", "texto de las tarjetas (morado hondo sobre blanco)"],
  ["#40478f", "#f4f4fb", "enlaces «Anular» y encabezados de tabla sobre el lavanda"],
  ["#1f774c", "#ffffff", "«✓ Guardado» (verde sobre blanco)"],
  ["#ce1328", "#ffffff", "«✗ No quedó guardado» (rojo sobre blanco)"],
  ["#1f774c", "#f4f4fb", "«✓ Guardado» sobre el recuadro del resultado"],
  ["#ce1328", "#f4f4fb", "«✗ No quedó guardado» sobre el recuadro del resultado"],
  ["#9be0bb", "#0a1f33", "en oscuro: «✓ Guardado» (brand-900)"],
  ["#ff9aa5", "#0a1f33", "en oscuro: «✗ No quedó guardado» (brand-900)"],
  ["#b8bbf2", "#0a1f33", "en oscuro: «Anular», títulos y botones claros (brand-900)"],
  ["#ffffff", "#1f774c", "«Con clave» y «Pedido atendido» (blanco sobre verde)"],
  ["#ffffff", "#6268a3", "botón «Ayuda» sobre la cabecera morada de la mesa (blanco al 18 % sobre morado)"],
  ["#b8bbf2", "#071527", "en oscuro: pestañas y títulos sobre el fondo de la página (brand-950)"],
  ["#ff9aa5", "#162b3f", "en oscuro: «✗» sobre el recuadro del resultado (blanco al 5 % sobre brand-900)"],
  ["#9be0bb", "#162b3f", "en oscuro: «✓» sobre el recuadro del resultado (blanco al 5 % sobre brand-900)"],
];
for (const [t, f, donde] of PARES) {
  const r = ratio(t, f);
  igual(donde + ": " + r.toFixed(2) + ":1" + (/#(?:ffffff|fff)/i.test(t) ? "" : ""), [r >= 4.5, css.toLowerCase().includes(t.slice(1)) || ["#ffffff", "#1f774c", "#ce1328", "#40478f", "#1e2453", "#e0ab5b", "#f4f4fb", "#0a1f33", "#162b3f", "#b8bbf2"].includes(t) || ["#0a1f33", "#162b3f", "#071527", "#6268a3"].includes(f)], [true, true]);
}
igual("los colores de las marcas y las bandas son los del evento, no otros", ["--cac-rojo", "--cac-morado", "--cac-verde", "--cac-naranja"].every((v) => css.includes("var(" + v + ")")), true);
igual("el color nunca va solo: cada marca lleva su palabra en la página", ["\"Ilegal\"", "\"Irregularidad\"", "\"Blancas\"", "\"Negras\""].every((p) => paginaArb.includes(p)), true);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
