/* Que "Vaciar esta conversación" VACÍE la conversación, en la pantalla de quien
 * aprieta el botón.
 *
 * La base siempre lo permitió: `class_chat_messages_delete` deja borrar el hilo
 * entero del alumno a quien es su profesor. Lo que fallaba era lo que se veía.
 * La lista se recargaba SOLO cuando llegaba el aviso de Realtime, y ese aviso
 * decide a qué conversación pertenece cada cambio por `student_id` — una
 * columna que en un DELETE no viaja si la tabla está con la replica identity
 * por omisión (solo manda la clave primaria). Así que el profesor apretaba,
 * confirmaba, y los mensajes seguían ahí: la lectura natural es "no me deja
 * vaciarlos". Y al alumno le quedaban a la vista mensajes que ya no existían.
 *
 * Dos cosas se comprueban acá, y son las dos mitades del arreglo:
 *
 *   1. SE BORRA EL HILO ENTERO, no solo lo que escribió el profesor. Un vaciar
 *      que deje los mensajes del alumno no vacía nada, y el filtro que manda es
 *      el que lo decide: student_id, no sender_id.
 *
 *   2. LA PANTALLA QUEDA VACÍA SIN NINGÚN AVISO DE REALTIME. El doble de acá no
 *      dispara ninguno —igual que la base cuando el DELETE va sin su fila—, así
 *      que si la página volviera a depender del aviso, esta comprobación falla.
 *
 * Reusa el Supabase de mentira de verificar-clase-registrada.js: dos copias del
 * mismo doble se irían separando a la primera corrección.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       npm install playwright chess.js@0.10.3
 *       node herramientas/verificar-chat-clase.js                            */
const { chromium } = require("playwright");
const { clienteFalso, abrir, igual, CHROME, fallos } = require("./verificar-clase-registrada.js");

const CLASE_ABIERTA = { id: "s-1", title: null, created_by: "u-profe",
                        ended_at: null, started_at: "2026-09-20T15:00:00Z", notes: null };

const PROFE_MIN = { full_name: "Karina Rojas", email: "karina@x.cr", role: "profesor" };
const ALUMNA_MIN = { full_name: "Ana Rojas", email: "ana@x.cr", role: "alumno" };

// Tres mensajes del hilo de Ana: dos suyos y una respuesta del profesor. Que
// haya de los dos lados es el punto — el filtro equivocado (sender_id) dejaría
// los de ella en pantalla y se vería como que "no se puede".
function mensajes() {
  return [
    { id: "m-1", student_id: "u-ana", sender_id: "u-ana", body: "Profe, no entendí el final de torre.",
      created_at: "2026-09-20T15:01:00Z", profiles: ALUMNA_MIN },
    { id: "m-2", student_id: "u-ana", sender_id: "u-profe", body: "Lo vemos en la próxima clase.",
      created_at: "2026-09-20T15:02:00Z", profiles: PROFE_MIN },
    { id: "m-3", student_id: "u-ana", sender_id: "u-ana", body: "Gracias.",
      created_at: "2026-09-20T15:03:00Z", profiles: ALUMNA_MIN },
  ];
}

const textoDelChat = (page) => page.evaluate(() =>
  document.getElementById("chat-messages").textContent.trim());

async function prueba(browser) {
  console.log("\n=== El profesor vacía la conversación de un alumno ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE_ABIERTA,
    { class_chat_messages: mensajes() });
  await page.waitForSelector("#teacher-toolbar:not(.hidden)", { timeout: 15000 });

  // El alumno tiene que estar conectado: la lista de "con quién chatear" solo
  // ofrece a quien está en la clase ahora mismo. Después se elige en el
  // selector, que es lo que hace el profesor para abrir esa conversación.
  await page.evaluate(() => window.__entraAlumno());
  await page.waitForFunction(() =>
    document.querySelectorAll("#chat-student-select option").length > 0, null, { timeout: 10000 });
  await page.selectOption("#chat-student-select", "u-ana");
  await page.waitForFunction(() =>
    document.getElementById("chat-messages").textContent.includes("final de torre"), null, { timeout: 10000 });

  igual("el botón de vaciar se le ofrece al profesor", await page.evaluate(() => {
    const b = document.getElementById("clear-chat-btn");
    return b && getComputedStyle(b).display !== "none" ? "sí" : "no";
  }), "sí");
  igual("y la conversación se ve con los mensajes de los dos lados", await page.evaluate(() => {
    const t = document.getElementById("chat-messages").textContent;
    return [t.includes("final de torre"), t.includes("próxima clase"), t.includes("Gracias")].join(",");
  }), "true,true,true");

  // Confirmar: el aviso es del navegador, así que se acepta desde acá.
  page.on("dialog", (d) => d.accept());
  await page.click("#clear-chat-btn");
  await page.waitForFunction(() =>
    window.__deletes.some((d) => d.tabla === "class_chat_messages"), null, { timeout: 10000 });

  const borrado = await page.evaluate(() =>
    window.__deletes.find((d) => d.tabla === "class_chat_messages"));
  igual("borra por la conversación y no por quién escribió",
    (borrado.donde[0] || [])[0], "student_id");
  igual("y la conversación que estaba abierta", (borrado.donde[0] || [])[1], "u-ana");
  igual("un solo filtro, o se dejaría media conversación", borrado.donde.length, 1);

  /* Lo que de verdad fallaba: la pantalla. Este doble no dispara ningún aviso de
     Realtime —igual que la base cuando el DELETE viaja sin su fila—, así que si
     la página volviera a esperarlo, acá se quedarían los tres mensajes. */
  await page.waitForFunction(() =>
    document.getElementById("chat-messages").textContent.includes("Todavía no hay mensajes"), null, { timeout: 10000 })
    .catch(() => {});
  const despues = await textoDelChat(page);
  if (despues.includes("Todavía no hay mensajes") && !despues.includes("final de torre")) {
    console.log("  ✓ la pantalla queda vacía sin esperar ningún aviso de Realtime");
  } else {
    console.log("  ✗ la pantalla NO se vació sola: " + JSON.stringify(despues.slice(0, 120)));
    process.exitCode = 1;
  }

  igual("y se dice con todas las letras que se vació", await page.evaluate(() =>
    document.getElementById("status-banner").textContent.includes("vaciada") ? "lo dice"
      : document.getElementById("status-banner").textContent), "lo dice");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== A la alumna no se le ofrece vaciar nada ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE_ABIERTA,
    { class_chat_messages: mensajes() });
  await page.waitForFunction(() =>
    document.getElementById("chat-messages").textContent.includes("final de torre"), null, { timeout: 15000 });

  igual("ve su conversación", await page.evaluate(() =>
    document.getElementById("chat-messages").textContent.includes("próxima clase") ? "sí" : "no"), "sí");
  // La base la rechazaría igual (no tiene política de delete), pero el fallo lo
  // descubriría ella: un botón que va a fallar es peor que no tenerlo.
  igual("pero no el botón de vaciar", await page.evaluate(() => {
    const b = document.getElementById("clear-chat-btn");
    return b && getComputedStyle(b).display !== "none" ? "sí" : "no";
  }), "no");
  igual("ni el selector de con quién hablar", await page.evaluate(() => {
    const b = document.getElementById("chat-student-picker");
    return b && getComputedStyle(b).display !== "none" ? "sí" : "no";
  }), "no");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await prueba(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  const n = fallos();
  console.log(n ? "\n" + n + " comprobación(es) fallaron" : "\nTodo bien: vaciar vacía de verdad.");
  process.exit(n || process.exitCode ? 1 : 0);
})();
