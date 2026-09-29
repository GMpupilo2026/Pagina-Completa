/* Comprueba «Repasar mis clases» (repasar-clases.html) en un navegador, con el
   doble de Supabase de Entrenamiento, y que la clase en vivo guarde lo que
   este visor necesita.

   - La lista trae solo lo ligado a una clase (.not class_session_id is null),
     con el nombre y la fecha de la clase.
   - El visor recorre la partida con el MISMO árbol del PGN (PgnClase.arbol):
     la línea principal, cada variante donde nace (entre paréntesis) y su
     continuación, en notación española.
   - El comentario del profe sale al mirar esa jugada, con el signo dicho en
     palabras, y por textContent: un comentario con HTML no crea ningún nodo.
   - Una partida de antes (sin `datos`) muestra la línea del PGN y lo dice.
   - (Sin sesión manda a iniciar sesión: lo cubre verificar-guardia-sesion.js,
     que recorre todas las páginas de la Academia.)
   - js/sesion.js guarda `datos` en los TRES inserts de saved_games (el botón,
     la línea archivada y el guardado al cerrar), y guarda sola la partida al
     cerrar la clase ANTES de marcarla cerrada (si no, el trigger no la liga).

   Uso:  npm install; node herramientas/verificar-todo.js repasar-clases        */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir } = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const MALICIOSO = '<img src=x onerror="window.__xss=1">';
const PARTIDAS = [
  { id: "p1", title: "Clase del 28 de septiembre", created_at: "2026-09-28T23:00:00Z", move_count: 4,
    class_session_id: "c1", class_sessions: { title: "La defensa de los dos caballos", started_at: "2026-09-28T22:00:00Z" },
    pgn: "", datos: {
      inicio: null, jugadas: ["e4", "e5", "Nf3", "Nc6"],
      variantes: [{ id: "v1", parent_id: null, root_ply: 2, san: "Bc4" }, { id: "v2", parent_id: "v1", root_ply: 2, san: "Nf6" }],
      comentarios: { "e4 e5 Nf3": { nag: 1, texto: MALICIOSO }, "e4 e5 Bc4": { nag: null, texto: "El alfil apunta a f7." } },
    } },
  { id: "p2", title: "Una partida de antes", created_at: "2026-09-01T23:00:00Z", move_count: 2,
    class_session_id: "c0", class_sessions: { title: null, started_at: "2026-09-01T22:00:00Z" },
    pgn: '[Event "?"]\n\n1. d4 d5 *\n', datos: null },
  // Guardada fuera de clase: la lista no la pide.
  { id: "p3", title: "Preparación", created_at: "2026-09-02T23:00:00Z", move_count: 1, class_session_id: null, pgn: "1. c4 *", datos: null },
];

const texto = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);

(async () => {
  console.log("\n=== js/sesion.js guarda lo que el visor necesita ===");
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "sesion.js"), "utf8");
    const inserts = src.split('sb.from("saved_games").insert(').slice(1).map((t) => t.slice(0, 400));
    igual("los tres inserts de saved_games llevan `datos`", inserts.map((t) => /datos: datosDeLaClase\(/.test(t)), [true, true, true]);
    const cerrar = src.slice(src.indexOf("async function cerrarClaseDesdeAqui"));
    igual("al cerrar, la partida se guarda ANTES de marcar la clase cerrada",
      cerrar.indexOf("guardarLaClaseAlCerrar(") > 0 && cerrar.indexOf("guardarLaClaseAlCerrar(") < cerrar.indexOf("ended_at: new Date()"), "true");
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== La lista ===");
    const { page, ctx, errores } = await abrir(browser, "/repasar-clases.html", { saved_games: PARTIDAS });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#lista-clases button").length > 0, null, { timeout: 10000 });
    const lista = await page.evaluate(() => Array.from(document.querySelectorAll("#lista-clases button")).map((b) => b.dataset.id));
    igual("solo lo ligado a una clase", lista, ["p1", "p2"]);
    igual("con el nombre de la clase", await texto(page, '#lista-clases [data-id="p1"] span'), "La defensa de los dos caballos");

    console.log("\n=== El visor ===");
    await page.click('#lista-clases [data-id="p1"]');
    const jugadas = await page.evaluate(() => document.getElementById("visor-jugadas").textContent.replace(/\s+/g, " ").trim());
    igual("la línea principal y la variante donde nace, en notación española",
      jugadas, "1. e41… e52. Cf3! 💬(2. Ac4 💬2… Cf6)2… Cc6");
    igual("arranca en la posición inicial", await texto(page, "#visor-estado"), "Posición de arranque");
    for (let i = 0; i < 3; i++) await page.click("#btn-siguiente");
    igual("tres adelante: 2. Cf3", await texto(page, "#visor-estado"), "Jugada 2. Cf3");
    const comentario = await texto(page, "#visor-comentario");
    igual("sale el comentario, con el signo dicho en palabras",
      comentario, `📝 Tu profe comentó 2. Cf3! (buena jugada): ${MALICIOSO}`);
    igual("y el HTML del comentario no crea ningún nodo", await page.evaluate(() => [document.querySelectorAll("#visor-comentario img").length, window.__xss || 0]), [0, 0]);
    await page.click('#visor-jugadas [data-camino="e4 e5 Bc4 Nf6"]');
    igual("una jugada dentro de la variante dice que es variante", await texto(page, "#visor-estado"), "Jugada 2… Cf6 (variante)");
    igual("y el tablero la muestra", await page.evaluate(() => !!document.querySelector('#board [data-square="c4"] span') && !!document.querySelector('#board [data-square="f6"] span')), "true");
    await page.click("#btn-anterior");
    igual("atrás vuelve a la jugada de la variante", await texto(page, "#visor-estado"), "Jugada 2. Ac4 (variante)");
    igual("con su comentario", await texto(page, "#visor-comentario"), "📝 Tu profe comentó 2. Ac4: El alfil apunta a f7.");
    await page.keyboard.press("End");
    igual("Fin (tecla) va al final de la línea que se mira", await texto(page, "#visor-estado"), "Jugada 2… Cf6 (variante)");
    await page.click("#btn-inicio"); await page.click("#btn-final");
    igual("⏭ desde el arranque va al final de la principal", await texto(page, "#visor-estado"), "Jugada 2… Cc6");
    await page.keyboard.press("ArrowLeft");
    igual("← retrocede", await texto(page, "#visor-estado"), "Jugada 2. Cf3");

    console.log("\n=== Una partida de antes, sin `datos` ===");
    await page.click('#lista-clases [data-id="p2"]');
    igual("dice que solo trae las jugadas", await page.evaluate(() => document.getElementById("visor-sin-datos").checkVisibility()), "true");
    igual("y las lee del PGN", await page.evaluate(() => document.getElementById("visor-jugadas").textContent.replace(/\s+/g, " ").trim()), "1. d41… d5");
    igual("sin nombre de clase, el de la partida", await texto(page, "#visor-titulo"), "Una partida de antes");
    igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();

    console.log("\n=== Sin clases ===");
    {
      const r = await abrir(browser, "/repasar-clases.html", { saved_games: [] });
      await r.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      await r.page.waitForFunction(() => !document.getElementById("lista-vacia").hidden, null, { timeout: 10000 });
      igual("dice que todavía no hay y cuándo aparecen", (await texto(r.page, "#lista-vacia")).startsWith("Todavía no hay clases para repasar"), "true");
      await r.ctx.close();
    }

  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
