/* El entrenador de IA: el botón «¿Por qué?» al fallar un ejercicio
 * (js/entrenador-ia.js, supabase/functions/entrenador-ia/, la migración
 * 20261118204456_entrenador_ia.sql y el interruptor de js/admin.js).
 *
 * Lo que se rompe acá no da ningún error: el botón que le sale a quien no se
 * le encendió (y gasta), la IA explicando una jugada que no existe, un
 * puntaje con el signo al revés que hace decir «tu jugada era buena» de una
 * que pierde, el nombre del alumno viajando al proveedor. Tres partes:
 *
 *   1. La base y la función, leídas del repositorio: quién puede encenderlo,
 *      quién puede preguntar el presupuesto, los dos pasos, los precios
 *      iguales a los de «Mejorar informe», y que nada de la persona viaje.
 *   2. La lógica de la función, corrida de verdad: las jugadas que la IA no
 *      puede nombrar y cuánto vale un puntaje para quien juega.
 *   3. La página, en un navegador: el botón solo para quien lo tiene; el
 *      motor de verdad sobre un mate en una; lo que se le manda a la función
 *      (con el puntaje desde las blancas); la explicación como texto; el tope
 *      del día; y que al pasar de ejercicio se borra.
 *
 * Uso:  node herramientas/verificar-todo.js entrenador-ia
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

let fallos = 0;
const mal = (m, d) => { console.log("  ✗ " + m + (d ? "\n      " + String(d).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, d) => (c ? bien(m) : mal(m, d));

function laBase() {
  console.log("=== La base ===");
  const sql = leer("supabase/migraciones/20261118204456_entrenador_ia.sql");
  ok(/alter table public\.entrenador_ia_personas enable row level security/.test(sql) && /revoke all on public\.entrenador_ia_personas from anon, authenticated/.test(sql)
    && (sql.match(/create policy/g) || []).length === 1 && /for select to authenticated/.test(sql),
    "la tabla de a quién se le encendió solo se puede LEER (uno mismo o quien administra): no tiene política de escritura");
  ok(/create trigger auditar[^;]*on public\.entrenador_ia_personas[^;]*interno\.auditar\(\)/.test(sql), "y lleva el trigger de auditoría");
  const cuerpo = (n) => { const a = sql.indexOf("function public." + n + "("); return sql.slice(a, sql.indexOf("$$;", a)); };
  const act = cuerpo("activar_entrenador_ia");
  ok(/if not coalesce\(\(select public\.soy_admin\(\)\), false\) then\s+raise exception/.test(act) && act.indexOf("soy_admin") < act.indexOf("insert into"),
    "encenderlo o apagarlo: solo quien administra, con el permiso envuelto en coalesce y antes de escribir");
  ok(/return exists \(select 1 from public\.entrenador_ia_personas/.test(act), "y devuelve cómo quedó, leído de la tabla");
  ok(/revoke all on function public\.ia_para_entrenador\(uuid\) from public, anon, authenticated/.test(sql) && /grant execute on function public\.ia_para_entrenador\(uuid\) to service_role/.test(sql),
    "el modelo y el presupuesto (ia_para_entrenador) no los puede preguntar nadie desde el navegador");
  const para = cuerpo("ia_para_entrenador");
  ok(/exists \(select 1 from public\.entrenador_ia_personas e where e\.persona_id = p\.id\)\) as encendido/.test(para) && /where coalesce\(\(select encendido from yo\), false\)/.test(para),
    "y sin el interruptor encendido no devuelve nada, tenga o no presupuesto su academia");
  ok(/u\.que = 'entrenador'/.test(para) && /America\/Costa_Rica/.test(para) && /then 50 else 15 end/.test(para), "el tope es por persona y por día de Costa Rica: 15, o 50 para quien da clase");
  ok(/revoke execute on function public\.tengo_entrenador_ia\(\) from public, anon/.test(sql) && /revoke execute on function public\.activar_entrenador_ia\(uuid, boolean\) from public, anon/.test(sql),
    "ninguna de las funciones es para quien no tiene cuenta");
}

function laFuncion() {
  console.log("\n=== La función ===");
  const fn = leer("supabase/functions/entrenador-ia/index.ts");
  const mi = leer("supabase/functions/mejorar-informe/index.ts");
  const precios = (s) => (s.match(/const PRECIOS[^=]*=\s*\{([\s\S]*?)\};/) || [])[1].replace(/\s+/g, "");
  ok(precios(fn) && precios(fn) === precios(mi), "los precios por modelo son los mismos de «Mejorar informe»", precios(fn) + " / " + precios(mi));
  ok(/admin\.auth\.getUser\(jwt\)/.test(fn) && /if \(sesionAMedias\(/.test(fn), "valida el token y exige el segundo paso a quien lo tiene");
  ok(/admin\.rpc\("ia_para_entrenador", \{ p_usuario: usuario \}\)/.test(fn) && /if \(confError \|\| !c \|\| !c\.modelo\) return json\(\{ error: "no_disponible" \}, 403\)/.test(fn),
    "pregunta a la base si esa persona lo tiene, y sin eso contesta «no disponible»");
  const iRpc = fn.indexOf('admin.rpc("ia_para_entrenador"'), iTope = fn.indexOf('"tope_dia"'), iIgual = fn.indexOf("DIFERENCIA_MINIMA) {"), iClave = fn.indexOf('Deno.env.get("ANTHROPIC_API_KEY")'), iModelo = fn.indexOf("new Anthropic(");
  ok(iRpc > 0 && iRpc < iTope && iTope < iIgual && iIgual < iClave && iClave < iModelo, "el orden: permiso, tope del día, «¿de verdad es peor?» y recién entonces el modelo");
  ok(/sinGasto: true/.test(fn.slice(iIgual, iClave)) && !/anotar\(/.test(fn.slice(iIgual, iClave)), "una jugada que el motor ve casi igual de buena se contesta sin llamar al modelo y sin gastar");
  ok(/tras\.move\(\{ from: jugada\.slice\(0, 2\)/.test(fn) && /rejugar\(fen, mejor\.pv, 1\)/.test(fn) && /rejugar\(tras\.fen\(\), despues\.pv, 1\)/.test(fn),
    "la jugada del alumno y las dos líneas del motor se vuelven a jugar con chess.js antes de usarlas");
  ok(/const ajenas = jugadasAjenas\(texto, permitidas\)/.test(fn) && /if \(detalle\) \{\s+return json\(\{ error: "La explicación no salió bien/.test(fn),
    "la explicación que nombra una jugada que no está en las líneas se descarta entera");
  const pedido = fn.slice(fn.indexOf("const pedidoTexto = ["), fn.indexOf("].join(\"\\n\");", fn.indexOf("const pedidoTexto = [")));
  ok(pedido.length > 100 && !/usuario|userData|email|full_name|nombre|grupo|profiles/.test(pedido) && !/from\("profiles"\)/.test(fn),
    "al modelo viajan la posición y las jugadas: nada de la persona (la función ni siquiera lee su perfil)");
  ok(/tuteando \(nunca voseo\)/.test(fn) && /tenedor \(nunca «horquilla»\)/.test(fn) && /sin regañarlo/.test(fn), "las instrucciones piden tuteo, «tenedor» y no regañar");
  ok(/que: "entrenador"/.test(fn) && /await anotar\(\{ \.\.\.base, modelo, ok: false/.test(fn) && /costo_usd: costo, ok: !detalle, detalle/.test(fn), "cada llamada al modelo queda anotada con lo que costó, también la que falló o se descartó");
  ok(/^entrenador-ia\s+true\s/m.test(leer("supabase/esquema/funciones-desplegadas.txt")) && /"entrenador-ia": \[\]/.test(leer("herramientas/funciones-armar.js")), "está en la lista de funciones que se despliegan, con verify_jwt en true");
  ok(/<strong>Anthropic \(entrenador de inteligencia artificial\):<\/strong>/.test(leer("privacidad.html")), "la política de privacidad dice qué se le manda al proveedor");
}

// Los pedazos puros de la función, corridos de verdad (Node les quita los tipos).
async function laLogica() {
  console.log("\n=== La lógica de la función ===");
  const fn = leer("supabase/functions/entrenador-ia/index.ts");
  const trozo = (desde, hasta) => { const a = fn.indexOf(desde); return fn.slice(a, fn.indexOf(hasta, a) + hasta.length); };
  const fuente = [
    "const sinSignos = (s: string) => s.replace(/[+#!?]+$/, \"\");",
    "type Puntaje = { cp?: number; mate?: number };",
    trozo("export function valorPara(", "\n}\n"),
    trozo("const JUGADA_PIEZA =", "\n}\n"),
  ].join("\n");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "entrenador-ia-"));
  const archivo = path.join(dir, "logica.ts");
  fs.writeFileSync(archivo, fuente);
  let M;
  try { M = await import(pathToFileURL(archivo).href); }
  catch (e) { mal("no se pudo correr la lógica de la función", e.message); return; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const permitidas = new Set(["Cf3", "Dxe5", "exd5", "O-O", "Te8"]);
  const ajenas = (t) => M.jugadasAjenas(t, permitidas);
  ok(ajenas("Con Cf3 defiendes el peón y después de Dxe5+ la dama queda expuesta. Luego O-O.").length === 0, "una explicación que solo nombra jugadas de las líneas pasa");
  ok(ajenas("Era mejor Cg5 para atacar.").join() === "Cg5", "una jugada de pieza que no está en las líneas se detecta", ajenas("Era mejor Cg5 para atacar.").join());
  ok(ajenas("Podías capturar con dxe5.").join() === "dxe5" && ajenas("Mejor O-O-O.").join() === "O-O-O", "también una captura de peón y un enroque largo que no estaban");
  ok(ajenas("La idea era Nf3 o Qxe5.").length === 2, "y las jugadas escritas en inglés (Nf3, Qxe5), que no son las de las líneas");
  ok(ajenas("El caballo va a f5 y la torre a la columna e.").length === 0, "una idea dicha con palabras, sin escribir la jugada, pasa");
  ok(M.valorPara({ cp: 150 }, "w") === 150 && M.valorPara({ cp: 150 }, "b") === -150, "un puntaje vale lo contrario para las negras");
  ok(M.valorPara({ mate: 2 }, "w") > M.valorPara({ cp: 900 }, "w") && M.valorPara({ mate: 1 }, "w") > M.valorPara({ mate: 3 }, "w"), "un mate a favor vale más que cualquier ventaja, y más cuanto más cerca");
  ok(M.valorPara({ mate: -2 }, "w") < M.valorPara({ cp: -900 }, "w") && M.valorPara({ mate: -2 }, "b") > 0, "y que te den mate es lo peor (para quien lo recibe)");
}

function elCodigo() {
  console.log("\n=== El código de las páginas ===");
  const js = leer("js/entrenador-ia.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(js) && !/\balert\(|\bconfirm\(|\bprompt\(/.test(js), "lo que contesta la IA se pinta como texto, y sin alert() ni confirm()");
  ok(/sb\.rpc\("tengo_entrenador_ia"\)/.test(js) && /if \(!\(await tengo\(\)\) \|\| esta !== vuelta\) return;/.test(js), "antes de pintar nada pregunta a la base si esa persona lo tiene");
  for (const [archivo, html] of [["js/entreno-temas.js", "entreno/temas.html"], ["js/entreno-mates.js", "entreno/mates.html"]]) {
    const s = leer(archivo);
    const i = s.indexOf("EntrenadorIA.fallo({ fen: game.fen(), uci: from + to + (moveResult.promotion || '') })");
    ok(i > 0 && s.lastIndexOf("game.undo();", i) > s.lastIndexOf("function playMove", i), archivo + ": al fallar le pasa la posición de ANTES de la jugada (después de deshacerla) y la jugada");
    ok((s.match(/EntrenadorIA\.limpiar\(\)/g) || []).length >= 2, archivo + ": lo borra al acertar y al pasar de ejercicio");
    const h = leer(html);
    ok(h.indexOf("js/shared-engine.js") > 0 && h.indexOf("js/shared-engine.js") < h.indexOf("js/entrenador-ia.js") && h.indexOf("js/entrenador-ia.js") < h.lastIndexOf('<script src="../' + archivo + '">'), html + ": carga el motor y el entrenador antes que el ejercicio");
  }
  const adm = leer("js/admin.js");
  ok(/sb\.rpc\("activar_entrenador_ia", \{ p_persona: u\.id, p_activa: quiere \}\)/.test(adm) && /pintarIA\(data === true\)/.test(adm) && /setAttribute\("role", "switch"\)/.test(adm),
    "la ficha de administración lo enciende con un interruptor que se pinta con lo que devuelve la base");
}

async function laPagina(browser) {
  console.log("\n=== La página ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  // Una página del sitio sin sesión, para tener su origen (el motor es un worker).
  await page.goto(BASE + "/offline.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.body.replaceChildren();
    const p = document.createElement("p"); p.id = "round-status"; p.textContent = "Respuesta incorrecta."; document.body.append(p);
    window.__encendido = false; window.__pedidos = []; window.__respuesta = null;
    window.sb = {
      rpc: async (fn) => ({ data: fn === "tengo_entrenador_ia" ? window.__encendido : null, error: null }),
      functions: { invoke: async (nombre, o) => { window.__pedidos.push({ nombre, body: o.body }); return window.__respuesta; } },
    };
  });
  for (const src of ["/js/vendor/chess.js", "/js/shared-engine.js", "/js/entrenador-ia.js"]) await page.addScriptTag({ url: BASE + src });

  // Apagado: no pinta nada.
  const FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";   // Ta8 es mate del pasillo
  await page.evaluate((fen) => window.EntrenadorIA.fallo({ fen, uci: "g1h1" }), FEN);
  ok((await page.locator("#entrenador-ia-boton").count()) === 0, "a quien no se le encendió no le aparece el botón");

  // Encendido (otra carga: la respuesta de la base se guarda una vez por página).
  await page.evaluate(() => { window.__encendido = true; });
  await page.evaluate(() => { delete window.EntrenadorIA; });
  await page.addScriptTag({ url: BASE + "/js/entrenador-ia.js?otra" });
  await page.evaluate((fen) => window.EntrenadorIA.fallo({ fen, uci: "g1h1" }), FEN);
  await page.waitForSelector("#entrenador-ia-boton");
  ok(await page.locator("#entrenador-ia-boton").evaluate((b) => b.checkVisibility() && b.textContent === "¿Por qué?"), "a quien lo tiene encendido le aparece «¿Por qué?» debajo del aviso");
  ok(/inteligencia artificial/.test(await page.textContent("#entrenador-ia-nota")) && /Puede equivocarse/.test(await page.textContent("#entrenador-ia-nota")), "y dice que contesta una inteligencia artificial y que puede equivocarse");

  // El motor de verdad, sobre un mate en una y sobre la misma posición dada vuelta.
  const blancas = await page.evaluate((fen) => window.EntrenadorIA.analizar(fen), FEN);
  ok(blancas && blancas.pv[0] === "a1a8" && blancas.puntaje.mate === 1, "el motor de verdad encuentra el mate en una, con el puntaje a favor de las blancas", JSON.stringify(blancas));
  const negras = await page.evaluate(() => window.EntrenadorIA.analizar("r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1"));
  ok(negras && negras.pv[0] === "a8a1" && negras.puntaje.mate === -1, "y cuando juegan las negras el puntaje va igual desde las blancas (mate −1)", JSON.stringify(negras));

  // El pedido a la función y la explicación.
  await page.evaluate(() => { window.__respuesta = { data: { ok: true, texto: "Con Rh1 <b>no pasa nada</b>, pero Ta8# era mate del pasillo.", quedan: 14 }, error: null }; });
  await page.click("#entrenador-ia-boton");
  await page.waitForFunction(() => document.getElementById("entrenador-ia-texto").textContent.length > 10, null, { timeout: 60000 });
  const pedido = (await page.evaluate(() => window.__pedidos))[0];
  ok(pedido && pedido.nombre === "entrenador-ia" && pedido.body.fen === FEN && pedido.body.jugada === "g1h1" && pedido.body.mejor.pv[0] === "a1a8" && pedido.body.mejor.puntaje.mate === 1
    && Array.isArray(pedido.body.despues.pv) && pedido.body.despues.pv.length >= 1 && Object.keys(pedido.body).sort().join() === "despues,fen,jugada,mejor",
    "a la función le manda la posición, la jugada, la mejor línea y cómo sigue el motor después: nada más", JSON.stringify(pedido && pedido.body).slice(0, 300));
  const texto = await page.textContent("#entrenador-ia-texto");
  ok(/<b>no pasa nada<\/b>/.test(texto) && (await page.locator("#entrenador-ia-texto b").count()) === 0, "la explicación se pinta como texto, sin interpretar etiquetas", texto);
  ok(/Te quedan 14 explicaciones hoy/.test(await page.textContent("#entrenador-ia")), "y dice cuántas le quedan hoy");
  const contraste = await page.evaluate(() => {
    const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const de = (n) => getComputedStyle(n).color;
    return { boton: de(document.getElementById("entrenador-ia-texto")), pagina: de(document.getElementById("round-status")), op: getComputedStyle(document.getElementById("entrenador-ia-nota")).opacity, l: lum(de(document.getElementById("round-status"))) };
  });
  ok(contraste.boton === contraste.pagina && contraste.op === "1", "el texto hereda el color de la página, sin transparencia: no hay un color nuevo que medir", JSON.stringify(contraste));

  // Al pasar de ejercicio se borra; el tope del día se dice.
  await page.evaluate(() => window.EntrenadorIA.limpiar());
  ok((await page.locator("#entrenador-ia > *").count()) === 0, "al pasar de ejercicio se borra todo");
  await page.evaluate((fen) => {
    window.__respuesta = { data: null, error: { context: { json: async () => ({ error: "tope_dia", mensaje: "Ya usaste las explicaciones de hoy. Mañana tienes más." }) } } };
    return window.EntrenadorIA.fallo({ fen, uci: "g1h1" });
  }, FEN);
  await page.click("#entrenador-ia-boton");
  await page.waitForFunction(() => /Mañana tienes más/.test(document.getElementById("entrenador-ia-texto").textContent), null, { timeout: 60000 });
  ok(await page.locator("#entrenador-ia-boton").evaluate((b) => !b.disabled && b.textContent === "¿Por qué?"), "con el tope del día dice que mañana tiene más, y el botón vuelve a estar listo");
  ok(errores.length === 0, "sin errores de JavaScript", errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { laBase(); laFuncion(); await laLogica(); elCodigo(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await laPagina(browser); } catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\n✓ Todo bien");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
