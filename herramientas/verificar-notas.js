/* La bitácora del profesor, comprobada en un navegador de verdad con un
   cliente de Supabase de mentira.
 *
 * Existe porque todo lo que se rompe acá se rompe CALLADO:
 *
 *  - una nota que se manda con el `alumno_id` equivocado queda en la ficha de
 *    otro alumno y la pantalla se ve perfecta;
 *  - un bloque de lectura que se destapa vacío le dice al alumno que su
 *    profesor no le escribió nada, cuando lo que pasó es que no se pudo leer;
 *  - un botón de compartir o de borrar ofrecido al alumno no rompe nada
 *    tampoco: lo aprieta y la base lo rechaza, así que el fallo lo descubre él;
 *  - y el enlace de "convertir en tarea" con el texto adentro deja lo que el
 *    profesor anotó de un alumno en el historial del navegador.
 *
 * Lo que la BASE hace cumplir (el aislamiento por profesor, que el alumno solo
 * vea las compartidas y no pueda escribir ninguna) está comprobado aparte,
 * impersonando roles en SQL — acá el cliente es de mentira, así que una prueba
 * de permisos no probaría nada.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-notas.js
 * Necesita playwright instalado.  */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ANA = {
  id: "a-1", full_name: "Ana Rojas", email: "ana@x.cr", grupo: "7A",
  elo: null, elo_tipo: null, elo_actualizado: null,
  respuestas: 0, correctas: 0, calificadas: 0, clases_asistidas: 0,
  minutos_clase: 0, minutos_ejercicios: 0,
  puzzles: 0, lecciones: 0, mejor_coord: 0, practicar_series: 0, practicar_estrellas: 0,
  mate1: 0, mate2: 0, mate3: 0, tactica: 0, concentracion: 0, cursos_temas: 0,
};
const BRUNO = Object.assign({}, ANA, { id: "a-2", full_name: "Bruno Mena", email: "bruno@x.cr", grupo: "7B" });

const NOTA_DE_ANA = {
  id: "n-ana", alumno_id: "a-1", profesor_id: "prof-1",
  texto: "Le cuesta el final de rey y peón; repasar la oposición.",
  etiqueta: "finales", compartida: false,
  created_at: "2026-09-18T12:00:00Z", updated_at: null,
};
const NOTA_DE_BRUNO = {
  id: "n-bruno", alumno_id: "a-2", profesor_id: "prof-1",
  texto: "Va muy rápido en las aperturas, se salta el desarrollo.",
  etiqueta: null, compartida: false,
  created_at: "2026-09-17T12:00:00Z", updated_at: null,
};

/* El cliente de mentira FILTRA de verdad por `eq`: sin eso, pedir las notas de
   Bruno devolvería también las de Ana y la prueba de que no se mezclan daría
   verde sobre una página que sí las mezcla. */
function clienteFalso(datos, usuarioId) {
  return `
window.__escrituras = [];
window.__consultas = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};
  let contador = 0;
  function constructor(filas, etiqueta) {
    let condiciones = [], limite = null, unica = false, pendiente = null, desde = null, hasta = null;
    const b = {
      select() { return b; }, order() { return b; }, in() { return b; }, or() { return b; },
      eq(col, val) { condiciones.push([col, val]); return b; },
      limit(n) { limite = n; return b; },
      range(a, z) { desde = a; hasta = z; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      insert(fila) {
        window.__escrituras.push({ tabla: etiqueta, accion: "insert", fila: fila });
        contador += 1;
        pendiente = Object.assign({ id: "nueva-" + contador, created_at: new Date().toISOString(), updated_at: null }, fila);
        filas.unshift(pendiente);
        return b;
      },
      update(campos) {
        window.__escrituras.push({ tabla: etiqueta, accion: "update", fila: campos });
        pendiente = { __update: campos };
        return b;
      },
      delete() { window.__escrituras.push({ tabla: etiqueta, accion: "delete" }); pendiente = { __delete: true }; return b; },
      then(res, rej) {
        window.__consultas.push({ tabla: etiqueta, condiciones: condiciones.slice() });
        let d = filas;
        if (pendiente && pendiente.__update) {
          const id = (condiciones.find((c) => c[0] === "id") || [])[1];
          const f = filas.find((x) => x.id === id);
          if (f) Object.assign(f, pendiente.__update, { updated_at: new Date().toISOString() });
          return Promise.resolve({ data: f || null, error: null }).then(res, rej);
        }
        if (pendiente && pendiente.__delete) {
          const id = (condiciones.find((c) => c[0] === "id") || [])[1];
          const i = filas.findIndex((x) => x.id === id);
          if (i >= 0) filas.splice(i, 1);
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        }
        if (pendiente) return Promise.resolve({ data: pendiente, error: null }).then(res, rej);
        if (Array.isArray(d)) {
          condiciones.forEach(([col, val]) => { d = d.filter((f) => f[col] === val); });
          if (desde !== null) d = d.slice(desde, hasta + 1);
          if (limite !== null) d = d.slice(0, limite);
          if (unica) d = d.length ? d[0] : null;
        }
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }) },
    from: (t) => constructor(DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : [], t),
    rpc: (n) => constructor(DATOS.rpc[n] !== undefined ? DATOS.rpc[n] : [], "rpc:" + n),
  };
})();
`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  if (String(hallado) !== String(esperado)) {
    console.log("  ✗ " + nombre + "\n      esperaba: " + esperado + "\n      salió:    " + hallado);
    fallos += 1;
  } else {
    console.log("  ✓ " + nombre + ": " + hallado);
  }
}

async function abrir(browser, pagina, datos, usuarioId) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, usuarioId) }));
  await page.goto(BASE + pagina, { waitUntil: "networkidle" });
  try {
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  } catch (e) {
    // Si la página ni siquiera arranca, lo que hace falta saber es por qué:
    // sin esto queda un "timeout" pelado que no dice nada.
    const enPantalla = await page.evaluate(() => {
      const l = document.getElementById("loading");
      return l ? l.textContent.trim().slice(0, 300) : "(sin #loading)";
    });
    throw new Error("No arrancó " + pagina + ": " + (errores.join(" | ") || "sin errores en la consola") +
                    " — en pantalla: " + enPantalla);
  }
  return { page, errores };
}

/* "Se ve" se mide con el display que CALCULA el navegador, nunca con la clase
   ni con el atributo: es la lección que dejó el cartel de instalar la app, que
   estuvo meses saliendo en cada carga con su `hidden` puesto. */
const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return "no existe";
  return getComputedStyle(el).display === "none" ? "no" : "sí";
}, sel);

const datosProfesor = () => ({
  rpc: {
    informes_resumen_alumnos: [ANA, BRUNO],
    informes_cursos_alumnos: [],
    informes_diagnosticos_alumnos: [],
    informes_totales: { clases_cerradas: 0, preguntas: 0, partidas: 0 },
    resumen_tareas_examenes: { tareas: {}, examenes: {} },
  },
  tablas: {
    profiles: [{ id: "prof-1", role: "profesor", is_admin: false, full_name: "Sebastián", email: "s@x.cr" }],
    notas_alumno: [JSON.parse(JSON.stringify(NOTA_DE_ANA)), JSON.parse(JSON.stringify(NOTA_DE_BRUNO))],
    question_answers: [], course_unlocks: [], encargados: [], training_plans: [],
    arbitrajes_publicos: [], diagnosticos_publicos: [],
  },
});

async function pruebaProfesor(browser) {
  console.log("\n=== La bitácora, desde el informe del profesor ===");
  const { page, errores } = await abrir(browser, "/informes.html", datosProfesor(), "prof-1");

  await page.selectOption("#student-filter", "a-1");
  await page.waitForSelector("#notas-report:not(.hidden)", { timeout: 10000 });
  igual("el bloque se ve", await seVe(page, "#notas-report"), "sí");

  // Lo que ya estaba anotado de Ana, y SOLO lo de Ana.
  await page.waitForFunction(() => document.querySelectorAll("#notas-body li[data-nota-id]").length > 0);
  igual("pinta las notas de Ana", await page.locator("#notas-body li[data-nota-id]").count(), 1);
  igual("y no las de Bruno",
    (await page.locator("#notas-body").textContent()).includes("aperturas") ? "las mezcla" : "no",
    "no");

  // Escribir una nota: lo que importa es lo que se MANDA, no lo que se pinta.
  await page.fill("#notas-body textarea", "Hoy resolvió la clavada sin ayuda.");
  await page.fill("#notas-body input[type=text]", "táctica");
  await page.check("#notas-body input[type=checkbox]");
  await page.click("#notas-body button[type=submit]");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "insert"));
  const insert = await page.evaluate(() => window.__escrituras.find((e) => e.accion === "insert"));
  igual("manda el insert a notas_alumno", insert.tabla, "notas_alumno");
  igual("con el alumno que se está mirando", insert.fila.alumno_id, "a-1");
  igual("firmada por quien la escribe", insert.fila.profesor_id, "prof-1");
  igual("con el texto tal cual", insert.fila.texto, "Hoy resolvió la clavada sin ayuda.");
  igual("con su etiqueta", insert.fila.etiqueta, "táctica");
  igual("y compartida, que se marcó", insert.fila.compartida, "true");
  igual("el campo queda limpio para la siguiente", await page.inputValue("#notas-body textarea"), "");

  // Compartir una que estaba privada.
  const filaAna = page.locator('#notas-body li[data-nota-id="n-ana"]');
  await filaAna.getByRole("button", { name: "Compartir" }).click();
  await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "update"));
  const update = await page.evaluate(() => window.__escrituras.find((e) => e.accion === "update"));
  igual("compartir manda compartida = true", update.fila.compartida, "true");
  // Escrito, no solo de otro color: el color solo no se lee.
  igual("y lo dice con todas las letras",
    (await filaAna.textContent()).includes("La ve el alumno") ? "sí" : "no", "sí");

  // El enlace que convierte la nota en tarea.
  const href = await filaAna.getByRole("link", { name: /Convertir en tarea/ }).getAttribute("href");
  igual("el enlace lleva el alumno", href.includes("alumno=a-1") ? "sí" : "no", "sí");
  igual("y el id de la nota", href.includes("nota=n-ana") ? "sí" : "no", "sí");
  igual("pero NO su texto",
    /oposici|cuesta|final/i.test(decodeURIComponent(href)) ? "lo lleva (mal)" : "no", "no");

  // Cambiar de alumno tiene que cambiar la bitácora. Quedarse con la del
  // anterior dejaría al profesor escribiendo sobre quien no era.
  await page.selectOption("#student-filter", "a-2");
  await page.waitForFunction(() => {
    const t = document.getElementById("notas-body").textContent;
    return t.includes("aperturas");
  }, null, { timeout: 10000 });
  const textoBruno = await page.locator("#notas-body").textContent();
  igual("al cambiar de alumno trae la suya", textoBruno.includes("se salta el desarrollo") ? "sí" : "no", "sí");
  igual("y suelta la del anterior", textoBruno.includes("oposición") ? "sigue (mal)" : "no", "no");

  igual("sin errores en la consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();
}

async function pruebaAlumno(browser) {
  console.log("\n=== Lo que ve el alumno ===");
  const compartida = Object.assign({}, NOTA_DE_ANA, { compartida: true });
  const datos = {
    rpc: {
      informes_resumen_alumnos: [ANA], informes_cursos_alumnos: [], informes_diagnosticos_alumnos: [],
      informes_totales: { clases_cerradas: 0, preguntas: 0, partidas: 0 },
      resumen_tareas_examenes: { tareas: {}, examenes: {} },
    },
    tablas: {
      profiles: [{ id: "a-1", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" }],
      notas_alumno: [compartida],
      question_answers: [], course_unlocks: [], encargados: [], training_plans: [],
      arbitrajes_publicos: [], diagnosticos_publicos: [],
    },
  };
  const { page, errores } = await abrir(browser, "/informes.html", datos, "a-1");
  await page.waitForSelector("#notas-alumno-report:not(.hidden)", { timeout: 10000 });
  igual("el bloque se ve de verdad", await seVe(page, "#notas-alumno-report"), "sí");
  igual("con la nota que le compartieron",
    (await page.locator("#notas-alumno-body").textContent()).includes("la oposición") ? "sí" : "no", "sí");
  // Ofrecerle botones que la base va a rechazar es peor que no ponerlos.
  igual("sin botones de profesor", await page.locator("#notas-alumno-body button").count(), 0);
  igual("sin el enlace de convertir en tarea", await page.locator("#notas-alumno-body a").count(), 0);
  igual("sin errores en la consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();

  console.log("\n=== El alumno al que no le compartieron nada ===");
  const datosVacio = JSON.parse(JSON.stringify(datos));
  datosVacio.tablas.notas_alumno = [];
  const r2 = await abrir(browser, "/informes.html", datosVacio, "a-1");
  await r2.page.waitForTimeout(600);
  // Un bloque que diga "tu profesor no te ha escrito nada" es ruido en todas
  // las visitas menos una.
  igual("el bloque NO se destapa", await seVe(r2.page, "#notas-alumno-report"), "no");
  await r2.page.close();
}

async function pruebaTarea(browser) {
  console.log("\n=== Convertir la nota en tarea ===");
  const datos = {
    rpc: { tareas_con_avance: [] },
    tablas: {
      profiles: [ANA, BRUNO],
      notas_alumno: [JSON.parse(JSON.stringify(NOTA_DE_ANA))],
      tareas: [],
    },
  };
  // El perfil de quien entra se pide por id; con dos filas de profiles el
  // doble filtra por eq y devuelve la que toca.
  datos.tablas.profiles = [
    { id: "prof-1", role: "profesor", is_admin: false, full_name: "Sebastián", email: "s@x.cr" },
    Object.assign({}, ANA, { role: "alumno" }), Object.assign({}, BRUNO, { role: "alumno" }),
  ];
  const { page, errores } = await abrir(browser, "/tareas.html?alumno=a-1&nota=n-ana", datos, "prof-1");
  await page.waitForSelector("#vista-profesor:not(.hidden)", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll(".alumno-check").length > 0);
  igual("marca al alumno de la nota",
    await page.isChecked('.alumno-check[value="a-1"]') ? "sí" : "no", "sí");
  igual("y no marca a los demás",
    await page.isChecked('.alumno-check[value="a-2"]') ? "también (mal)" : "no", "no");
  igual("pone la nota que ya estaba escrita",
    await page.inputValue("#t-instrucciones"), NOTA_DE_ANA.texto);
  // El título lo propone la página desde el renglón: venir de una nota no
  // puede pisárselo, o el profesor tendría que corregir a mano un campo que
  // antes salía bien.
  igual("y no le pisa el título que la página propone",
    await page.inputValue("#t-titulo"), "Ejercicios por tema");
  igual("sin errores en la consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumno(browser);
    await pruebaTarea(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
