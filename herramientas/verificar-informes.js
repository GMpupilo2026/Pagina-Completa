/* Comprueba informes.html en un navegador de verdad, con un cliente de Supabase
   de mentira: las consultas devuelven datos inventados de forma conocida, así
   que se puede comprobar número por número que la página pinta lo que la base le
   manda, sin depender de lo que haya hoy en la base ni de tener sesión.

   Existe porque informes.html dejó de contar en el navegador: ahora la cuenta la
   hacen tres funciones de la base (informes_resumen_alumnos,
   informes_cursos_alumnos, informes_diagnosticos_alumnos) y la página solo pone
   los números en su lugar. Lo que se puede romper al tocarla es justamente eso —
   un campo mal escrito, una columna que cambió de nombre— y no da error: pinta
   un cero o un "—" y nadie se entera.

   También comprueba el pedido por páginas: una tabla con 1005 filas tiene que
   llegar entera, en dos pedidos, y no cortada en mil.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-informes.js
   Necesita playwright instalado.  */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const AREAS = ["reglas", "material", "apertura", "tactica", "mate", "finales", "estrategia", "calculo"];
const DIAGNOSTICO = {
  fecha: "2026-09-10T12:00:00Z",
  areas: Object.fromEntries(AREAS.map((a, i) => [a, { peso: 20, total: 7, nosabe: 0, aciertos: 4 + (i % 3), logrado: 12 + (i % 5) }])),
  dificultad: { 1: { total: 8, aciertos: 7, nosabe: 0 }, 2: { total: 16, aciertos: 12, nosabe: 0 },
                3: { total: 16, aciertos: 9, nosabe: 1 }, 4: { total: 8, aciertos: 3, nosabe: 1 },
                5: { total: 8, aciertos: 1, nosabe: 2 } },
  perfil: { tiempo: "Más de 2 años", torneos: "No", practica: "Una vez por semana" },
  porcentaje: 68, version: 3,
};

const ANA = {
  id: "a-1", full_name: "Ana Rojas", email: "ana@x.cr", grupo: "7A",
  elo: null, elo_tipo: null, elo_actualizado: null,
  respuestas: 10, correctas: 7, calificadas: 9, clases_asistidas: 3,
  minutos_clase: 65, minutos_ejercicios: 30,
  puzzles: 12, lecciones: 4, mejor_coord: 18, practicar_series: 2, practicar_estrellas: 5,
  mate1: 1, mate2: 2, mate3: 3, tactica: 7, concentracion: 4, cursos_temas: 3,
};
const BRUNO = {
  id: "a-2", full_name: "Bruno Mena", email: "bruno@x.cr", grupo: "7B",
  elo: null, elo_tipo: null, elo_actualizado: null,
  respuestas: 4, correctas: 1, calificadas: 4, clases_asistidas: 1,
  minutos_clase: 10, minutos_ejercicios: 0,
  puzzles: 3, lecciones: 0, mejor_coord: 0, practicar_series: 0, practicar_estrellas: 0,
  mate1: 0, mate2: 0, mate3: 0, tactica: 0, concentracion: 0, cursos_temas: 0,
};
const CARLA = {
  id: "a-3", full_name: "Carla Soto", email: "carla@x.cr", grupo: null,
  elo: null, elo_tipo: null, elo_actualizado: null,
  respuestas: 0, correctas: 0, calificadas: 0, clases_asistidas: 0,
  minutos_clase: 0, minutos_ejercicios: 0,
  puzzles: 0, lecciones: 0, mejor_coord: 0, practicar_series: 0, practicar_estrellas: 0,
  mate1: 0, mate2: 0, mate3: 0, tactica: 0, concentracion: 0, cursos_temas: 0,
};
const CURSOS_ANA = [
  { student_id: "a-1", slug: "finales-practicos", titulo: "Finales prácticos", total: 8, hechos: 3, ultimo_titulo: "La oposición", ultima_fecha: "2026-09-09T10:00:00Z" },
  { student_id: "a-1", slug: "tactica-basica", titulo: "Táctica básica", total: 0, hechos: 1, ultimo_titulo: "La horquilla", ultima_fecha: "2026-09-08T10:00:00Z" },
];
const RESPUESTAS = [
  { created_at: "2026-09-12T10:00:00Z", is_correct: true },
  { created_at: "2026-09-11T10:00:00Z", is_correct: false },
  { created_at: "2026-09-10T10:00:00Z", is_correct: null },
];

// El cliente de mentira: los mismos métodos encadenados que usa la página
// (select/eq/order/limit/range/maybeSingle) sobre listas fijas, apuntando qué se
// pidió para poder comprobar el pedido por páginas.
function clienteFalso(datos, usuarioId) {
  return `
window.__consultas = [];
window.__escrituras = [];
window.__funcion = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};
  function constructor(filas, etiqueta) {
    let desde = null, hasta = null, limite = null, unica = false;
    const b = {
      select() { return b; }, eq() { return b; }, order() { return b; }, in() { return b; },
      limit(n) { limite = n; return b; },
      range(a, z) { desde = a; hasta = z; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      insert(fila) { window.__escrituras.push({ etiqueta: etiqueta, accion: "insert", fila: fila }); return b; },
      update(fila) { window.__escrituras.push({ etiqueta: etiqueta, accion: "update", fila: fila }); return b; },
      delete() { window.__escrituras.push({ etiqueta: etiqueta, accion: "delete" }); return b; },
      then(res, rej) {
        window.__consultas.push(etiqueta);
        let d = filas;
        if (Array.isArray(d)) {
          if (desde !== null) d = d.slice(desde, hasta + 1);
          if (limite !== null) d = d.slice(0, limite);
          if (unica) d = d.length ? d[0] : null;
        }
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  // La Edge Function de los informes a la casa se atiende acá.
  const fetchReal = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/informes-encargados") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__funcion.push(cuerpo);
      return Promise.resolve(new Response(JSON.stringify({ ok: true, html: "<p>informe</p>", alumno: "Ana Rojas" }),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return fetchReal.apply(this, arguments);
  };
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }) },
    from: (t) => constructor(DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : [], "from:" + t),
    rpc: (n) => constructor(DATOS.rpc[n] !== undefined ? DATOS.rpc[n] : [], "rpc:" + n),
  };
})();
`;
}

/* Tareas y exámenes, tal como los devuelve public.resumen_tareas_examenes().
   Lleva una vencida de cada cosa a propósito: es el único renglón de ese bloque
   que pide hacer algo hoy, y el que se pinta en rojo. */
const DEBERES = {
  tareas:   { puestas: 4, completadas: 2, vencidas: 1, sin_hacer_hoy: 1, pendientes: 1,
              proxima_vence: "2026-09-25T18:00:00Z", renglones: 9, cumplidos: 5 },
  examenes: { rendidos: 3, nota_media: 7.5, mejor_nota: 9.25, sin_hacer_hoy: 1,
              pendientes: 1, proximo_vence: "2026-09-27T18:00:00Z" },
};

let fallos = 0;
function igual(nombre, hallado, esperado) {
  if (String(hallado) !== String(esperado)) {
    console.log("  ✗ " + nombre + "\n      esperaba: " + esperado + "\n      salió:    " + hallado);
    fallos += 1;
  } else {
    console.log("  ✓ " + nombre + ": " + hallado);
  }
}

async function abrir(browser, datos, usuarioId) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  // Lo que el navegador no puede alcanzar acá se sirve vacío; el cliente de
  // Supabase se cambia por el de mentira.
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, usuarioId) }));
  await page.goto(BASE + "/informes.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, errores };
}

const tarjeta = (page, etiqueta) => page.evaluate((e) => {
  const t = [...document.querySelectorAll("#stat-cards > div")].find((d) => d.lastElementChild.textContent.trim() === e);
  return t ? t.children[1].textContent.trim() : null;
}, etiqueta);

const fila = (page, tbody, n) => page.evaluate(([t, i]) => {
  const tr = document.querySelectorAll("#" + t + " tr")[i];
  return tr ? [...tr.children].map((c) => c.textContent.trim()).join(" | ") : null;
}, [tbody, n]);

async function pruebaProfesor(browser) {
  console.log("\n=== Vista del profesor ===");
  // 1005 exámenes obligan a pedir dos páginas de mil. Si se quedara con la
  // primera, la página diría 1000 sin que nada falle: ese es el fallo callado
  // que este cambio viene a quitar.
  const arbitrajes = Array.from({ length: 1005 }, (_, i) => ({
    id: "e" + i, created_at: "2026-09-01T00:00:00Z", nombre: "Persona " + i, email: "p" + i + "@x.cr",
    porcentaje: 50, nivel: "Árbitro de club", revisado: i % 2 === 0, revisado_at: null, detalle: { areas: {} },
  }));
  const { page, errores } = await abrir(browser, {
    rpc: {
      informes_resumen_alumnos: [ANA, BRUNO, CARLA],
      informes_cursos_alumnos: CURSOS_ANA,
      informes_diagnosticos_alumnos: [
        { student_id: "a-1", detalle: DIAGNOSTICO, fecha: "2026-09-10T12:00:00Z", a_medias_pregunta: null, a_medias_fecha: null },
        { student_id: "a-2", detalle: null, fecha: null, a_medias_pregunta: 13, a_medias_fecha: "2026-09-11T12:00:00Z" },
      ],
      informes_totales: { clases_cerradas: 4, preguntas: 10, partidas: 2 },
      resumen_tareas_examenes: DEBERES,
    },
    tablas: {
      profiles: [{ id: "prof-1", role: "profesor", is_admin: true, full_name: "Oscar", email: "o@x.cr" }],
      training_plans: [], diagnosticos_publicos: [], arbitrajes_publicos: arbitrajes,
      question_answers: RESPUESTAS,
      encargados: [{ id: "enc-1", student_id: "a-1", nombre: "Mamá de Ana", email: "mama@x.cr",
                     frecuencia: "semanal", activo: true, ultimo_envio_at: "2026-09-08T12:00:00Z" }],
    },
  }, "prof-1");

  console.log("-- Resumen general");
  igual("Clases cerradas", await tarjeta(page, "Clases cerradas"), "4");
  igual("Preguntas planteadas", await tarjeta(page, "Preguntas planteadas"), "10");
  igual("Partidas guardadas", await tarjeta(page, "Partidas guardadas"), "2");
  igual("Alumnos", await tarjeta(page, "Alumnos"), "3");
  igual("asistencia · Ana", await fila(page, "attendance-table-body", 0), "Ana Rojas | 7A | 3/4 | 1 h 5 min | 30 min | 1 h 35 min");
  igual("asistencia · Bruno", await fila(page, "attendance-table-body", 1), "Bruno Mena | 7B | 1/4 | 10 min | 0 min | 10 min");
  igual("asistencia · Carla", await fila(page, "attendance-table-body", 2), "Carla Soto | — | 0/4 | 0 min | 0 min | 0 min");
  igual("entreno · Ana", await fila(page, "entreno-table-body", 0), "Ana Rojas | 12 | 4 | 18 | 2 (5⭐) | 6 (1·2·3) | 7 | 4");
  igual("entreno · Bruno", await fila(page, "entreno-table-body", 1), "Bruno Mena | 3 | 0 | — | — | — | — | —");
  igual("ranking · primera fila", await page.textContent("#leaderboard > div:first-child"), "Ana Rojas7/10 · 70%");

  console.log("-- Pedido por páginas");
  igual("exámenes recibidos (1005, no 1000)", await page.evaluate(() => {
    const c = [...document.querySelectorAll("#arbitrajes-publicos p")].find((p) => p.textContent.trim() === "exámenes recibidos");
    return c ? c.previousElementSibling.textContent.trim() : null;
  }), "1005");
  igual("páginas pedidas", await page.evaluate(() =>
    window.__consultas.filter((c) => c === "from:arbitrajes_publicos").length), 2);

  console.log("-- Un alumno puntual");
  await page.selectOption("#student-filter", "a-1");
  await page.waitForFunction(() => !document.getElementById("student-report").classList.contains("hidden"));
  igual("Asignaciones respondidas", await tarjeta(page, "Asignaciones respondidas"), "10");
  igual("Correctas", await tarjeta(page, "Correctas"), "7");
  igual("Precisión", await tarjeta(page, "Precisión"), "78%");
  igual("Pendientes de revisar", await tarjeta(page, "Pendientes de revisar"), "1");
  igual("Asistencia", await tarjeta(page, "Asistencia (75%)"), "3/4");
  igual("Tiempo total en la plataforma", await tarjeta(page, "Tiempo total en la plataforma"), "1 h 35 min");
  igual("Temas de cursos estudiados", await tarjeta(page, "Temas de cursos estudiados"), "3");
  igual("historial (quince como mucho)", await page.evaluate(() => document.querySelectorAll("#student-history li").length), 3);
  // Se comprueban los hechos, no el texto entero de la tarjeta: ahí conviven
  // otros controles (desbloquear temas) que van creciendo y no son de esta
  // prueba. Una comprobación que se rompe cuando alguien agrega un botón al
  // lado deja de decir nada.
  igual("cursos del alumno", await page.evaluate(() => {
    const t = [...document.querySelectorAll("#cursos-report-body > div")]
      .map((d) => d.textContent.replace(/\s+/g, " "));
    return [
      t.length,
      t[0].includes("Finales prácticos3/8 · 38%"),
      t[0].includes("Último tema estudiado: La oposición (09 sept 2026)"),
      t[1].includes("Táctica básica1/1 · 100%"),
      t[1].includes("Último tema estudiado: La horquilla (08 sept 2026)"),
    ].join(",");
  }), "2,true,true,true,true");
  igual("ficha de diagnóstico visible", await page.evaluate(() => !document.getElementById("diagnostico-report").classList.contains("hidden")), "true");

  console.log("-- Tareas y exámenes");
  await page.waitForFunction(() => !document.getElementById("deberes-report").classList.contains("hidden"));
  igual("tareas del alumno", await page.evaluate(() => {
    const c = [...document.querySelectorAll("#deberes-body > div > div")].find((d) => d.querySelector("h3").textContent === "Tareas");
    return [...c.querySelectorAll("li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()).join(" // ");
  }), "Le pusieron4 tareas // Terminadas2 de 4 // Renglones cumplidos5 de 9 // Se le pasó la fecha de1 tarea // Por hacer1 tarea · la próxima vence el 25 de septiembre");
  igual("exámenes del alumno", await page.evaluate(() => {
    const c = [...document.querySelectorAll("#deberes-body > div > div")].find((d) => d.querySelector("h3").textContent === "Exámenes");
    return [...c.querySelectorAll("li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()).join(" // ");
  }), "Rendidos3 exámenes // Nota promedio7,50 de 10 // Mejor nota9,25 de 10 // Se le pasó la fecha de1 examen // Por rendir1 examen · hasta el 27 de septiembre");
  // Lo vencido se dice arriba y con todas las letras: si solo fuera un color,
  // quien no distingue el rojo no se entera de lo único urgente del bloque.
  igual("el aviso de lo vencido va primero", await page.evaluate(() => {
    const p = document.querySelector("#deberes-body > p");
    return p ? p.textContent.trim() : null;
  }), "Tiene 2 entregas vencidas sin hacer.");
  // LO QUE DE VERDAD IMPORTA: los números salen del RPC, no se cuentan acá.
  // Contándolos en la página, un profesor que comparte alumno con un colega
  // vería "0 tareas" sobre un alumno que tiene cuatro, y la página se vería
  // igual de bien.
  igual("los pide al RPC y no a las tablas", await page.evaluate(() =>
    [window.__consultas.filter((c) => c === "rpc:resumen_tareas_examenes").length,
     window.__consultas.filter((c) => c === "from:tareas" || c === "from:examenes" || c === "from:tarea_items").length].join(",")),
    "1,0");

  console.log("-- Informes a la casa");
  igual("el encargado aparece con su frecuencia y su último envío", await page.evaluate(() => {
    const f = document.querySelector("#encargados-lista > div");
    return [f.children[0].textContent.replace(/\s+/g, " ").trim(), f.querySelector("select").value].join(" | ");
  }), "Mamá de Anamama@x.cr · último envío el 08 sept 2026 | semanal");

  await page.evaluate(() => { window.__escrituras.length = 0; });
  await page.fill("#enc-nombre", "Papá de Ana");
  await page.fill("#enc-email", "papa@x.cr");
  await page.selectOption("#enc-frecuencia", "mensual");
  await page.click("#enc-agregar");
  await page.waitForFunction(() => window.__escrituras.length > 0);
  igual("agregar un encargado manda lo correcto", await page.evaluate(() => window.__escrituras[0]),
    { etiqueta: "from:encargados", accion: "insert",
      fila: { student_id: "a-1", nombre: "Papá de Ana", email: "papa@x.cr", frecuencia: "mensual", creado_por: "prof-1" } });

  page.on("dialog", (d) => d.accept());
  await page.evaluate(() => {
    window.__funcion.length = 0;
    [...document.querySelectorAll("#encargados-lista button")].find((b) => b.textContent === "Enviar ahora").click();
  });
  await page.waitForFunction(() => window.__funcion.length > 0);
  igual("«enviar ahora» le pide a la función ese encargado", await page.evaluate(() => window.__funcion[0]),
    { action: "enviar_ahora", encargado_id: "enc-1" });

  await page.evaluate(() => { window.__funcion.length = 0; });
  await page.selectOption("#enc-ver-frecuencia", "mensual");
  await page.click("#enc-descargar");
  await page.waitForFunction(() => window.__funcion.length > 0);
  igual("descargar pide el MISMO informe que sale por correo, del periodo elegido",
    await page.evaluate(() => window.__funcion[0]),
    { action: "vista_previa", student_id: "a-1", frecuencia: "mensual" });

  console.log("-- Filtros de grupo y de tema");
  await page.selectOption("#student-filter", "");
  await page.selectOption("#group-filter", "7B");
  await page.waitForFunction(() => document.querySelectorAll("#attendance-table-body tr").length === 1);
  igual("solo 7B", await fila(page, "attendance-table-body", 0), "Bruno Mena | 7B | 1/4 | 10 min | 0 min | 10 min");
  await page.selectOption("#group-filter", "");
  await page.selectOption("#topic-filter", "4x4");
  await page.waitForFunction(() => !document.getElementById("topic-report").classList.contains("hidden"));
  igual("tema 4×4, de mayor a menor", await page.evaluate(() =>
    [...document.querySelectorAll("#topic-report-body > div")].map((d) => d.textContent.replace(/\s+/g, " ").trim()).join(" // ")),
    "Ana Rojas12 ejercicios // Bruno Mena3 ejercicios // Carla Soto—");
  await page.selectOption("#topic-filter", "diagnostico");
  await page.waitForFunction(() => document.getElementById("topic-report-body").textContent.includes("Ana Rojas"));
  igual("diagnósticos: hecho, a medias y sin empezar", await page.evaluate(() => {
    const t = document.getElementById("topic-report-body").textContent.replace(/\s+/g, " ");
    return [t.includes("Ana Rojas"), t.includes("va en la pregunta 13"), t.includes("Carla Soto")].join(",");
  }), "true,true,true");

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();
}

async function pruebaAlumno(browser) {
  console.log("\n=== Vista del propio alumno ===");
  const { page, errores } = await abrir(browser, {
    rpc: {
      informes_resumen_alumnos: [ANA],
      informes_cursos_alumnos: [CURSOS_ANA[0]],
      informes_diagnosticos_alumnos: [{ student_id: "a-1", detalle: DIAGNOSTICO, fecha: "2026-09-10T12:00:00Z", a_medias_pregunta: null, a_medias_fecha: null }],
      informes_totales: { clases_cerradas: 4, preguntas: 10, partidas: 2 },
      resumen_tareas_examenes: DEBERES,
    },
    tablas: {
      profiles: [{ id: "a-1", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" }],
      training_plans: [], question_answers: RESPUESTAS.slice(0, 2),
    },
  }, "a-1");

  igual("Asignaciones respondidas", await tarjeta(page, "Asignaciones respondidas"), "10");
  igual("Correctas", await tarjeta(page, "Correctas"), "7");
  igual("Precisión", await tarjeta(page, "Precisión"), "78%");
  igual("Pendientes de revisar", await tarjeta(page, "Pendientes de revisar"), "1");
  igual("Asistencia", await tarjeta(page, "Asistencia (75%)"), "3/4");
  igual("Tiempo en clase", await tarjeta(page, "Tiempo en clase"), "1 h 5 min");
  igual("Tiempo en ejercicios", await tarjeta(page, "Tiempo en ejercicios"), "30 min");
  igual("Tiempo total en la plataforma", await tarjeta(page, "Tiempo total en la plataforma"), "1 h 35 min");
  igual("Ejercicios 4×4 resueltos", await tarjeta(page, "Ejercicios 4×4 resueltos"), "12");
  igual("Mates resueltos", await tarjeta(page, "Mates resueltos (1·2·3 en 1/2/3)"), "6");
  igual("Temas de cursos estudiados", await tarjeta(page, "Temas de cursos estudiados"), "3");
  igual("historial", await page.evaluate(() => document.querySelectorAll("#student-history li").length), 2);
  igual("filtros de profesor escondidos",
    await page.evaluate(() => document.getElementById("teacher-filters").classList.contains("hidden")), "true");
  // El alumno ve sus tareas y sus exámenes con los MISMOS números que su
  // profesor —es el mismo RPC y la misma función que los pinta—, y el texto le
  // habla a él: "Tienes", no "Tiene".
  await page.waitForFunction(() => !document.getElementById("deberes-report").classList.contains("hidden"));
  igual("el alumno ve sus tareas", await page.evaluate(() => {
    const c = [...document.querySelectorAll("#deberes-body > div > div")].find((d) => d.querySelector("h3").textContent === "Tareas");
    return [...c.querySelectorAll("li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()).join(" // ");
  }), "Le pusieron4 tareas // Terminadas2 de 4 // Renglones cumplidos5 de 9 // Se le pasó la fecha de1 tarea // Por hacer1 tarea · la próxima vence el 25 de septiembre");
  igual("al alumno se le habla de tú", await page.evaluate(() => {
    const p = document.querySelector("#deberes-body > p");
    return p ? p.textContent.trim() : null;
  }), "Tienes 2 entregas vencidas sin hacer.");
  // Lo que este cambio vino a quitar: ninguna de las tablas de actividad se baja
  // ya desde la página, ni entera ni por alumno.
  igual("no pide ninguna tabla de actividad", await page.evaluate(() =>
    window.__consultas.filter((c) => /class_presence_log|platform_activity_log|training_progress|training_state|class_attendance|class_sessions|saved_games/.test(c)).length), 0);

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumno(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: informes.html pinta lo que la base le manda.");
  process.exit(fallos ? 1 : 0);
})();
