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
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// El módulo se carga tal cual, el MISMO archivo que sirve la página: probar una
// copia de la cuenta no probaría nada.
global.window = global.window || {};
new Function(require("fs").readFileSync(require("path").join(__dirname, "..", "js", "evolucion-alumno.js"), "utf8")).call(global);
const EvolucionAlumno = global.window.EvolucionAlumno;
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
  { student_id: "a-1", created_at: "2026-09-12T10:00:00Z", is_correct: true },
  { student_id: "a-1", created_at: "2026-09-11T10:00:00Z", is_correct: false },
  { student_id: "a-1", created_at: "2026-09-10T10:00:00Z", is_correct: null },
  // De otro alumno: con el doble filtrando de verdad, esta NO puede colarse en
  // el historial de Ana. Sin ella, la prueba no comprobaría el filtro.
  { student_id: "a-2", created_at: "2026-09-13T10:00:00Z", is_correct: true },
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
    let condiciones = [], dentro = [], orden = null, pendiente = null;
    // El doble FILTRA Y ORDENA de verdad. Uno que devolviera siempre la tabla
    // entera daría por buena una página que mezcla las filas de dos alumnos, y
    // uno que ignorara el orden daría por bueno un código que se quedara con la
    // fila que no era, que es justo lo que hay que mirar al elegir "el
    // diagnóstico anterior".
    const b = {
      select() { return b; },
      eq(col, val) { condiciones.push([col, val]); return b; },
      in(col, vals) { dentro.push([col, vals.map(String)]); return b; },
      order(col, o) { orden = [col, !o || o.ascending !== false]; return b; },
      limit(n) { limite = n; return b; },
      range(a, z) { desde = a; hasta = z; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      /* La escritura se anota EN EL RESOLVER, no aquí: .update(x).in("id", y)
         encadena, así que un doble que la apuntara en el update() se quedaría
         sin saber SOBRE QUIÉN se escribió — y daría por bueno un lote que
         comparte el plan del alumno que no era. Es la misma trampa que ya
         documentó verificar-clase-registrada.js. */
      insert(fila) { pendiente = { accion: "insert", fila: fila }; return b; },
      update(fila) { pendiente = { accion: "update", fila: fila }; return b; },
      upsert(filas, opciones) { pendiente = { accion: "upsert", fila: filas, opciones: opciones || null }; return b; },
      delete() { pendiente = { accion: "delete" }; return b; },
      then(res, rej) {
        if (pendiente) {
          window.__escrituras.push(Object.assign({ etiqueta: etiqueta,
            donde: condiciones.slice(), dentro: dentro.slice() }, pendiente));
        }
        window.__consultas.push({ etiqueta: etiqueta, donde: condiciones.slice(), limite: limite });
        let d = filas;
        /* Un insert/upsert con .select() devuelve LO ESCRITO, no la tabla: es
           de donde la página refresca su estado, y un doble que devolviera la
           tabla entera daría por bueno un recuento equivocado. */
        if (pendiente && (pendiente.accion === "insert" || pendiente.accion === "upsert")) {
          d = Array.isArray(pendiente.fila) ? pendiente.fila : [pendiente.fila];
          return Promise.resolve({ data: unica ? (d[0] || null) : d, error: null }).then(res, rej);
        }
        if (pendiente && pendiente.accion === "update" && Array.isArray(filas)) {
          let tocadas = filas;
          condiciones.forEach(([c, v]) => { tocadas = tocadas.filter((f) => String(f[c]) === String(v)); });
          dentro.forEach(([c, vs]) => { tocadas = tocadas.filter((f) => vs.indexOf(String(f[c])) !== -1); });
          tocadas = tocadas.map((f) => Object.assign({}, f, pendiente.fila));
          return Promise.resolve({ data: unica ? (tocadas[0] || null) : tocadas, error: null }).then(res, rej);
        }
        if (Array.isArray(d)) {
          condiciones.forEach(([c, v]) => { d = d.filter((f) => String(f[c]) === String(v)); });
          dentro.forEach(([c, vs]) => { d = d.filter((f) => vs.indexOf(String(f[c])) !== -1); });
          if (orden) {
            const [c, asc] = orden;
            d = d.slice().sort((x, y) => (x[c] < y[c] ? -1 : x[c] > y[c] ? 1 : 0) * (asc ? 1 : -1));
          }
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
    if (String(url).indexOf("/functions/v1/correos-alumno") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__funcion.push(Object.assign({ url: String(url) }, cuerpo));
      return Promise.resolve(new Response(JSON.stringify({ ok: true, usuario: "tito.vargas@alumno.ajedrez-integral.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
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

/* En qué se fue el tiempo, tal como lo devuelve public.tiempo_por_seccion():
   una sección con ejercicios, un curso (contenido: solo tiempo), una
   herramienta sin conteo, y una de medio minuto sin nada hecho que NO se pinta
   (alguien que pasó por la página no la usó). */
const SECCIONES_ANA = [
  { seccion: "4x4", minutos: 62.4, ejercicios: 12 },
  { seccion: "curso:el-mapa-de-los-finales", minutos: 25, ejercicios: 0 },
  { seccion: "estudio", minutos: 8, ejercicios: 0 },
  { seccion: "mates", minutos: 0.2, ejercicios: 1 },
  { seccion: "bot", minutos: 0.3, ejercicios: 0 },
];

/* Tareas y exámenes, tal como los devuelve public.resumen_tareas_examenes().
   Lleva una vencida de cada cosa a propósito: es el único renglón de ese bloque
   que pide hacer algo hoy, y el que se pinta en rojo. */
const DEBERES = {
  tareas:   { puestas: 4, completadas: 2, vencidas: 1, sin_hacer_hoy: 1, pendientes: 1,
              proxima_vence: "2026-09-25T18:00:00Z", renglones: 9, cumplidos: 5 },
  examenes: { rendidos: 3, nota_media: 7.5, mejor_nota: 9.25, sin_hacer_hoy: 1,
              pendientes: 1, proximo_vence: "2026-09-27T18:00:00Z" },
};

/* La curva semanal, tal como la devuelve public.evolucion_alumno(): la rejilla
   COMPLETA, con las semanas vacías en cero. Esa rejilla es media función: sin
   ella el gráfico pega dos semanas separadas por un mes en blanco y dibuja una
   línea que sube, cuando lo que pasó fue que el alumno no entró.

   Está armada para que el veredicto sea "va subiendo": 4 ejercicios en las 4
   semanas que se comparan contra 40 en las 4 últimas. */
const CURVA = [
  { semana: "2026-07-06", ejercicios: 0,  dias_activos: 0, dias_tocados: 0, minutos: 0,   respuestas: 0, aciertos: 0 },
  { semana: "2026-07-13", ejercicios: 0,  dias_activos: 0, dias_tocados: 0, minutos: 0,   respuestas: 0, aciertos: 0 },
  { semana: "2026-07-20", ejercicios: 0,  dias_activos: 0, dias_tocados: 0, minutos: 0,   respuestas: 0, aciertos: 0 },
  { semana: "2026-07-27", ejercicios: 0,  dias_activos: 0, dias_tocados: 0, minutos: 0,   respuestas: 0, aciertos: 0 },
  { semana: "2026-08-03", ejercicios: 4,  dias_activos: 0, dias_tocados: 2, minutos: 12,  respuestas: 0, aciertos: 0 },
  { semana: "2026-08-10", ejercicios: 0,  dias_activos: 0, dias_tocados: 0, minutos: 0,   respuestas: 0, aciertos: 0 },
  { semana: "2026-08-17", ejercicios: 0,  dias_activos: 0, dias_tocados: 0, minutos: 0,   respuestas: 0, aciertos: 0 },
  { semana: "2026-08-24", ejercicios: 0,  dias_activos: 0, dias_tocados: 0, minutos: 0,   respuestas: 0, aciertos: 0 },
  { semana: "2026-08-31", ejercicios: 12, dias_activos: 2, dias_tocados: 3, minutos: 40,  respuestas: 0, aciertos: 0 },
  { semana: "2026-09-07", ejercicios: 8,  dias_activos: 1, dias_tocados: 2, minutos: 25,  respuestas: 0, aciertos: 0 },
  { semana: "2026-09-14", ejercicios: 0,  dias_activos: 0, dias_tocados: 0, minutos: 0,   respuestas: 0, aciertos: 0 },
  { semana: "2026-09-21", ejercicios: 20, dias_activos: 4, dias_tocados: 4, minutos: 95,  respuestas: 3, aciertos: 2 },
];

/* Dos diagnósticos del MISMO alumno para poder compararlos, y uno de otro que no
   se puede colar. El de antes tiene los finales flojos y la táctica fuerte; el
   de ahora, al revés: así la comparación tiene una subida y una bajada de verdad
   que mirar, y no solo ceros. */
function diagnosticoCon(finales, tactica) {
  const d = JSON.parse(JSON.stringify(DIAGNOSTICO));
  d.areas.finales = { peso: 20, total: 7, nosabe: 0, aciertos: 3, logrado: Math.round(finales * 0.2) };
  d.areas.tactica = { peso: 20, total: 7, nosabe: 0, aciertos: 3, logrado: Math.round(tactica * 0.2) };
  return d;
}
const DIAGNOSTICOS = [
  { student_id: "a-1", activity: "diagnostico", created_at: "2026-09-18T12:00:00Z", detail: diagnosticoCon(70, 40) },
  { student_id: "a-1", activity: "diagnostico", created_at: "2026-06-02T12:00:00Z", detail: diagnosticoCon(30, 60) },
  { student_id: "a-2", activity: "diagnostico", created_at: "2026-09-19T12:00:00Z", detail: diagnosticoCon(10, 10) },
];

let fallos = 0;
function igual(nombre, hallado, esperado) {
  if (String(hallado) !== String(esperado)) {
    console.log("  ✗ " + nombre + "\n      esperaba: " + esperado + "\n      salió:    " + hallado);
    fallos += 1;
  } else {
    console.log("  ✓ " + nombre + ": " + hallado);
  }
}

async function abrir(browser, datos, usuarioId, ruta) {
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
  // Las confirmaciones son de js/avisos.js: se aprietan como una persona, en
  // TODAS las páginas que abre este verificador.
  await page.addInitScript(contestarAvisos);
  await page.goto(BASE + (ruta || "/informes.html"), { waitUntil: "networkidle" });
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

// Igual, pero juntando los espacios: en el índice de la clase el grupo va en su
// propio renglón dentro de la celda del nombre.
const filaLimpia = (page, tbody, n) => page.evaluate(([t, i]) => {
  const tr = document.querySelectorAll("#" + t + " tr")[i];
  return tr ? [...tr.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()).join(" | ") : null;
}, [tbody, n]);

/* El veredicto es la línea que de verdad se lee, y es lógica pura: se prueba sin
   navegador, con las cuatro situaciones que tiene que distinguir. Lo que se
   rompe acá no da ningún error — el gráfico se dibuja igual de bien y la frase
   de arriba dice lo contrario de lo que pasó. */
function pruebaVeredicto() {
  console.log("\n=== El veredicto ===");
  const sem = (n) => ({ semana: "2026-01-01", ejercicios: n, dias_activos: n ? 2 : 0, dias_tocados: n ? 2 : 0, minutos: n * 2, respuestas: 0, aciertos: 0 });
  const curva = (antes, ahora) => antes.concat(ahora).map(sem);
  const t = (antes, ahora) => EvolucionAlumno.resumir(curva(antes, ahora), 4).titulo;

  igual("sube de verdad", t([1, 1, 1, 1], [5, 5, 5, 5]), "Va subiendo");
  igual("baja de verdad", t([5, 5, 5, 5], [1, 1, 1, 1]), "Va bajando");
  // El vaivén normal de cualquiera no puede leerse como una alarma: con un ±15%
  // el profesor recibiría "va bajando" cada mes sin ningún motivo.
  igual("un vaivén del 10% no es «bajando»", t([10, 10, 10, 10], [9, 9, 9, 9]), "Se mantiene");
  // Los dos casos que más importan, y que un porcentaje a secas no sabe decir:
  // de 0 a 40 no es "+∞%", y caer a cero es lo único que pide hacer algo hoy.
  igual("de cero a algo es «empezó», no +∞%", t([0, 0, 0, 0], [5, 5, 5, 5]), "Empezó a entrenar");
  igual("caer a cero se dice con todas las letras", t([5, 5, 5, 5], [0, 0, 0, 0]), "Dejó de entrenar");
  igual("sin nada en ningún lado no se inventa nada", t([0, 0, 0, 0], [0, 0, 0, 0]), "Todavía no hay con qué comparar");
  igual("y el detalle da los DOS números, no solo el de ahora",
    EvolucionAlumno.resumir(curva([5, 5, 5, 5], [0, 0, 0, 0]), 4).detalle,
    "Nada en las últimas 4 semanas; antes llevaba 20 ejercicios.");
}

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
      evolucion_alumno: CURVA,
      tiempo_por_seccion: SECCIONES_ANA,
    },
    tablas: {
      profiles: [{ id: "prof-1", role: "profesor", is_admin: true, full_name: "Oscar", email: "o@x.cr" }],
      training_plans: [], diagnosticos_publicos: [], arbitrajes_publicos: arbitrajes,
      question_answers: RESPUESTAS,
      training_progress: DIAGNOSTICOS,
      encargados: [{ id: "enc-1", student_id: "a-1", nombre: "Mamá de Ana", email: "mama@x.cr",
                     frecuencia: "semanal", activo: true, ultimo_envio_at: "2026-09-08T12:00:00Z", creado_por: "otra" },
                   { id: "enc-2", student_id: "a-1", nombre: "Tía de Ana", email: "tia@x.cr", frecuencia: "mensual",
                     activo: true, hora_envio: 18, dia_semana: null, ultimo_envio_at: "2026-09-01T12:00:00Z",
                     creado_por: "prof-1", created_at: "2026-09-02T10:00:00Z" }],
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

  /* EL ÍNDICE DE LA CLASE. Antes acá salían tres listas de los mismos alumnos
     —precisión, asistencia y entrenamiento— una detrás de otra y sin corte: con
     cien alumnos son trescientas filas y no se encuentra a nadie. Lo que se
     comprueba es que el índice diga lo de cada quien y que se pueda entrar
     tocándolo, que es lo que reemplaza al <select> de cien nombres. */
  console.log("-- El índice de la clase");
  igual("una fila por alumno, con su nivel y si está entrenando",
    await filaLimpia(page, "alumnos-tbody", 0), "Ana Rojas 7A | 3/4 | 1 h 35 min | 7/10 · 70% | Intermedio | ✅ Esta semana");
  igual("y a quien no hizo el diagnóstico se le dice, no se le pinta un hueco",
    await filaLimpia(page, "alumnos-tbody", 1), "Bruno Mena 7B | 1/4 | 10 min | 1/4 · 25% | Sin diagnóstico | ✅ Esta semana");
  igual("con todos a la vista, el conteo no habla de corte",
    await page.textContent("#alumnos-cuenta"), "3 alumnos");

  /* Los dos paneles del público van plegados —no son sus alumnos y ocupaban el
     primer lugar de la página—, así que su conteo TIENE que leerse sin abrirlos:
     si no, hay que abrir los dos en cada visita solo para saber si llegó algo. */
  console.log("-- Lo que no es de sus alumnos, plegado");
  igual("el panel de arbitraje arranca cerrado",
    await page.evaluate(() => document.getElementById("arbitrajes-publicos").closest("details").open), false);
  igual("pero dice cuántos hay y cuántos faltan por responder sin abrirlo",
    await page.textContent("#arbitrajes-resumen"), "1005 exámenes recibidos · 502 sin responder");
  igual("y el de visitantes también arranca cerrado",
    await page.evaluate(() => document.getElementById("diagnosticos-visitantes").closest("details").open), false);

  /* La franja de lo que pide actuar: los datos ya estaban cargados y no se
     decían en ninguna parte. Se mide el display que CALCULA el navegador, no la
     clase — la lección que dejó el cartel de instalar la app. */
  console.log("-- Qué pide atención");
  igual("la franja se ve de verdad", await page.evaluate(() =>
    getComputedStyle(document.getElementById("atencion")).display === "none" ? "no" : "sí"), "sí");
  igual("y dice qué falta, con su número", await page.evaluate(() =>
    [...document.querySelectorAll("#atencion-botones button")].map((b) => b.textContent)),
    ["🧭 2 sin diagnóstico", "📤 1 plan sin compartir"]);
  await page.click("#atencion-botones button");
  await page.waitForFunction(() => !document.getElementById("topic-report").classList.contains("hidden"));
  igual("y tocarla deja el filtro puesto, no solo avisa",
    await page.inputValue("#topic-filter"), "diagnostico");
  await page.selectOption("#topic-filter", "");
  await page.waitForFunction(() => !document.getElementById("teacher-report").classList.contains("hidden"));

  // Tocar a un alumno es lo que reemplaza a buscarlo dentro del <select>.
  console.log("-- Entrar a un alumno desde el índice");
  await page.click("#alumnos-tbody button[data-abrir]");
  await page.waitForFunction(() => !document.getElementById("student-report").classList.contains("hidden"));
  igual("abre SU informe y deja el filtro donde corresponde",
    [await page.inputValue("#student-filter"), await page.textContent("#student-report-title")].join(" | "),
    "a-1 | 🚩 Últimas asignaciones de Ana Rojas");

  /* Dieciséis números de golpe no los lee nadie: las ocho de segunda fila nacen
     escondidas. Se mide el display que calcula el navegador, no la clase. */
  const escondidas = () => page.evaluate(() =>
    [...document.querySelectorAll("#stat-cards [data-extra]")]
      .filter((d) => getComputedStyle(d).display === "none").length);
  igual("las ocho secundarias nacen escondidas", await escondidas(), 8);
  igual("y las que se miran siguen a la vista", await page.evaluate(() =>
    [...document.querySelectorAll("#stat-cards > div")].filter((d) => getComputedStyle(d).display !== "none").length), 8);
  await page.click("#stat-cards-ver");
  igual("el botón las destapa todas", await escondidas(), 0);
  await page.click("#stat-cards-ver");
  igual("y las vuelve a guardar", await escondidas(), 8);
  await page.selectOption("#student-filter", "");
  await page.waitForFunction(() => !document.getElementById("teacher-report").classList.contains("hidden"));

  console.log("-- Pedido por páginas");
  igual("exámenes recibidos (1005, no 1000)", await page.evaluate(() => {
    const c = [...document.querySelectorAll("#arbitrajes-publicos p")].find((p) => p.textContent.trim() === "exámenes recibidos");
    return c ? c.previousElementSibling.textContent.trim() : null;
  }), "1005");
  igual("páginas pedidas", await page.evaluate(() =>
    window.__consultas.filter((c) => c.etiqueta === "from:arbitrajes_publicos").length), 2);

  console.log("-- Un alumno puntual");
  /* Se vuelve a cero antes de entrar: más arriba ya se entró a este mismo
     alumno desde el índice, y lo que se mira abajo es cuántas consultas cuesta
     UNA visita — no cuántas van en toda la corrida. */
  await page.evaluate(() => { window.__consultas.length = 0; });
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

  /* En qué usó su tiempo. Lo que se rompe callado acá: un curso que no sale
     porque no tiene ejercicios (que es justo lo que el pedido vino a sumar), un
     conteo inventado sobre una sección de contenido, o el nombre del curso
     escrito como su dirección. */
  console.log("-- En qué usó su tiempo");
  await page.waitForFunction(() => document.querySelectorAll("#tiempo-body tbody tr").length > 0);
  igual("se ve de verdad", await page.evaluate(() =>
    getComputedStyle(document.getElementById("tiempo-report")).display === "none" ? "no" : "sí"), "sí");
  igual("una fila por sección usada, y la de paso no", await page.evaluate(() =>
    [...document.querySelectorAll("#tiempo-body tbody tr")].map((tr) =>
      [...tr.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()).join(" | "))),
    ["🧩 Ejercicios 4×4 | 1 h 2 min | 12 ejercicios",
     "🏛️ Curso: El mapa de los finales | 25 min | Estudió el contenido",
     "📚 Estudio (fichas) | 8 min | —",
     "♚ Mates | menos de 1 min | 1 mate"]);
  igual("pide el periodo de siempre al abrir y lo marca", await page.evaluate(() =>
    document.querySelector('#tiempo-body button[aria-pressed="true"]').textContent), "Desde siempre");
  // Se cuenta antes y después, sin vaciar la lista: lo que viene más abajo
  // mira las consultas de esta misma visita.
  const pedidasTiempo = () => page.evaluate(() =>
    window.__consultas.filter((c) => c.etiqueta === "rpc:tiempo_por_seccion").length);
  const antesTiempo = await pedidasTiempo();
  await page.click('#tiempo-body button[data-periodo="7"]');
  await page.waitForFunction(() => document.querySelector('#tiempo-body button[data-periodo="7"]').getAttribute("aria-pressed") === "true");
  igual("cambiar de periodo vuelve a preguntarle a la base", (await pedidasTiempo()) - antesTiempo, 1);
  await page.click('#tiempo-body button[data-periodo="siempre"]');

  /* "Cómo viene" es lo único del informe que contesta si MEJORA, y todo lo que
     se rompe acá se rompe callado: una semana vacía que desaparece hace subir
     una curva que en realidad se cayó, y un veredicto calculado sobre el
     periodo que no era se lee perfecto y dice lo contrario. */
  console.log("-- Cómo viene (la curva semanal)");
  await page.waitForFunction(() => !document.getElementById("evolucion-report").classList.contains("hidden")
    && document.querySelectorAll("#evolucion-body table tbody tr").length > 0);

  igual("se ve de verdad, no solo sin la clase", await page.evaluate(() =>
    getComputedStyle(document.getElementById("evolucion-report")).display === "none" ? "no" : "sí"), "sí");
  igual("el veredicto va escrito, no solo en color", await page.evaluate(() =>
    document.querySelector("#evolucion-body p").textContent.replace(/\s+/g, " ").trim()), "📈 Va subiendo");
  igual("y dice contra qué mes se compara", await page.evaluate(() =>
    document.querySelectorAll("#evolucion-body p")[1].textContent.replace(/\s+/g, " ").trim()),
    "40 ejercicios este último mes contra 4 el anterior (+900%).");

  // Las 12 semanas tienen que estar TODAS, vacías incluidas.
  igual("pinta las 12 semanas, vacías incluidas", await page.evaluate(() =>
    document.querySelectorAll("#evolucion-body table tbody tr").length), 12);
  igual("y el gráfico tiene una columna por semana", await page.evaluate(() =>
    document.querySelectorAll("#evolucion-body [data-semana]").length), 12);

  /* Una semana en cero se queda en CERO: se mide el alto que calcula el
     navegador, no la clase. Darle un mínimo visible la haría parecer una semana
     con algo, que es exactamente lo contrario de lo que pasó. */
  igual("una semana sin nada no dibuja barra", await page.evaluate(() => {
    const barra = (sem) => document.querySelector('[data-semana="' + sem + '"] [data-barra]')
      .getBoundingClientRect().height;
    return [Math.round(barra("2026-07-13")),          // vacía
            Math.round(barra("2026-09-21")) > 0,      // la mayor
            Math.round(barra("2026-09-07")) < Math.round(barra("2026-09-21"))].join(",");
  }), "0,true,true");

  // La tabla es la versión accesible, así que tiene que decir los MISMOS
  // números que la barra — y el gráfico va aria-hidden para no dejar doce
  // paradas de tabulador que leen peor que la tabla.
  igual("la tabla dice lo que devolvió la base", await page.evaluate(() => {
    const tr = document.querySelectorAll("#evolucion-body table tbody tr")[11];
    return [...tr.children].map((c) => c.textContent.trim()).join(" | ");
  }), "Semana del 21 sep | 20 | 4 | 1 h 35 min");

  console.log("-- Comparación de los dos diagnósticos");
  igual("compara con el anterior y dice las dos fechas", await page.evaluate(() => {
    const p = [...document.querySelectorAll("#evolucion-body p")].find((x) => x.textContent.includes("Del "));
    return p ? p.textContent.replace(/\s+/g, " ").trim().slice(0, 40) : null;
  }), "Del 2 de junio de 2026 al 18 de septiemb");
  igual("y en qué área subió, con los puntos escritos", await page.evaluate(() => {
    const f = [...document.querySelectorAll("#evolucion-body .grid")]
      .find((d) => d.firstElementChild.textContent.trim() === "Finales");
    return f ? f.textContent.replace(/\s+/g, " ").trim() : null;
  }), "Finales ▲ +40 puntos (30% → 70%)");
  igual("y en cuál bajó", await page.evaluate(() => {
    const f = [...document.querySelectorAll("#evolucion-body .grid")]
      .find((d) => d.firstElementChild.textContent.trim() === "Táctica");
    return f ? f.textContent.replace(/\s+/g, " ").trim() : null;
  }), "Táctica ▼ -20 puntos (60% → 40%)");
  // El diagnóstico del OTRO alumno no puede entrar en esta comparación.
  igual("no se cuela el diagnóstico de otro alumno", await page.evaluate(() =>
    window.__consultas.filter((c) => c.etiqueta === "from:training_progress")
      .every((c) => c.donde.some((d) => d[0] === "student_id" && d[1] === "a-1"))), "true");
  igual("y no se baja la tabla entera: va con límite", await page.evaluate(() =>
    window.__consultas.filter((c) => c.etiqueta === "from:training_progress")
      .every((c) => c.limite !== null)), "true");

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
    [window.__consultas.filter((c) => c.etiqueta === "rpc:resumen_tareas_examenes").length,
     window.__consultas.filter((c) => c === "from:tareas" || c === "from:examenes" || c === "from:tarea_items").length].join(",")),
    "1,0");

  console.log("-- Informes a la casa");
  /* Este panel y el de «Acceso a la cuenta» van PLEGADOS: son de administración
     y se usan una vez cada tanto, así que abiertos en cada informe de alumno son
     media pantalla de formulario que no se venía a ver. Se abren como los abre
     una persona —tocando el encabezado—, y eso comprueba de paso que se pueda
     llegar a ellos: un panel plegado que no abre se ve igual que uno que no
     está. */
  await page.click("#encargados-report > summary");
  await page.waitForSelector("#enc-nombre", { state: "visible" });
  igual("y el de acceso a la cuenta también abre", await (async () => {
    await page.click("#acceso-report > summary");
    return page.isVisible("#acceso-reenviar");
  })(), true);
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
      fila: { student_id: "a-1", nombre: "Papá de Ana", email: "papa@x.cr", frecuencia: "mensual",
              hora_envio: 7, dia_semana: null, creado_por: "prof-1" } });

  await page.evaluate(() => {
    window.__funcion.length = 0;
    [...document.querySelectorAll("#encargados-lista button")].find((b) => b.textContent === "Enviar ahora").click();
  });
  await page.waitForFunction(() => window.__funcion.length > 0);
  igual("«enviar ahora» le pide a la función ese encargado", await page.evaluate(() => window.__funcion[0]),
    { action: "enviar_ahora", encargado_id: "enc-1" });

  /* Quitar el que uno apuntó no pregunta: se quita, y «Deshacer» lo devuelve
     TAL CUAL (mismo id, hora y último envío). El que apuntó otra persona sí se
     pregunta, porque la política de insert no dejaría devolverlo. */
  const quitarA = (correo) => page.evaluate((c) => {
    window.__escrituras.length = 0; window.__avisos.length = 0;
    [...document.querySelectorAll("#encargados-lista button")].find((b) => b.getAttribute("aria-label") === "Quitar a " + c).click();
  }, correo);
  await quitarA("Tía de Ana");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "delete"));
  igual("quitar el propio: sin preguntar, borra ESE", await page.evaluate(() =>
    [window.__avisos.filter((a) => /¿Quitar/.test(a)).length, JSON.stringify(window.__escrituras[0].donde)]), [0, '[["id","enc-2"]]']);
  await page.waitForSelector("[data-avisos-deshacer]", { state: "visible" });
  await page.click("[data-avisos-deshacer]");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "insert"));
  igual("«Deshacer» lo vuelve a insertar tal cual", await page.evaluate(() =>
    window.__escrituras.find((e) => e.accion === "insert").fila),
    { id: "enc-2", student_id: "a-1", nombre: "Tía de Ana", email: "tia@x.cr", frecuencia: "mensual",
      activo: true, hora_envio: 18, dia_semana: null, ultimo_envio_at: "2026-09-01T12:00:00Z",
      creado_por: "prof-1", created_at: "2026-09-02T10:00:00Z" });
  await page.waitForFunction(() => window.__avisos.some((a) => /vuelve a recibir/.test(a)));
  await page.evaluate(() => { window.__cancelarAvisos = true; });
  await quitarA("Mamá de Ana");
  await page.waitForFunction(() => window.__avisos.some((a) => /¿Quitar a mama@x\.cr\?/.test(a)));
  await page.waitForTimeout(200);
  igual("el que apuntó otra persona se pregunta, y cancelar no borra nada",
    await page.evaluate(() => window.__escrituras.length), 0);
  await page.evaluate(() => { window.__cancelarAvisos = false; });

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
      // A propósito: la rejilla llega COMPLETA pero sin un solo ejercicio. Es
      // el alumno recién inscrito, y en su página el bloque no se puede
      // destapar — "todavía no hay datos" es ruido en todas las visitas menos
      // una, la misma decisión que la bitácora.
      evolucion_alumno: CURVA.map((x) => Object.assign({}, x, { ejercicios: 0, dias_activos: 0, minutos: 0 })),
    },
    tablas: {
      profiles: [{ id: "a-1", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" }],
      training_plans: [], question_answers: RESPUESTAS.slice(0, 2),
      // Un solo diagnóstico: no hay con qué comparar y no se pinta nada de eso.
      training_progress: [DIAGNOSTICOS[0]],
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

  /* Sin ninguna semana con algo y con un solo diagnóstico no hay nada que
     mirar, así que el bloque no se destapa. Se mide el `display` que calcula el
     navegador y no la clase: la lección que dejó el cartel de instalar la app,
     que llevaba `hidden` puesto y salía igual. */
  await page.waitForFunction(() => !document.getElementById("deberes-report").classList.contains("hidden"));
  igual("sin nada que mostrar, «Cómo vienes» no se destapa", await page.evaluate(() =>
    getComputedStyle(document.getElementById("evolucion-report")).display === "none" ? "no se ve" : "se ve"),
    "no se ve");
  igual("y no se inventa una comparación con un solo diagnóstico", await page.evaluate(() =>
    document.getElementById("evolucion-body").textContent.includes("diagnóstico anterior") ? "sí" : "no"), "no");
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

/* El nombre de un alumno lo escribe él: `profiles_update_own` le deja editar su
   propia fila y el trigger de identidad solo revierte role, email, is_admin y
   compañía — `full_name` no. Así que es texto ajeno, y esta página lo pinta con
   innerHTML en una docena de sitios, incluidos dos atributos (el `title=` de una
   barra y el `aria-label=` del perfil por área).

   Lo que se rompe acá NO da ningún error: la página se ve perfecta y el código
   del alumno corre en la pantalla de SU PROFESOR, con la sesión del profesor
   puesta — o la de quien administra, que lo ve todo. Por eso se prueba con un
   nombre que ataca las dos formas a la vez (una etiqueta para el cuerpo, una
   comilla para el atributo) y se mira lo que pasó DE VERDAD en el navegador:
   si algo se ejecutó, si nació algún elemento que no estaba en la página.

   Y se comprueba además que el nombre SE SIGA VIENDO, literal. Borrarlo también
   quitaría el ataque, y dejaría al profesor sin saber de quién es esa fila. */
/* ---------------- Compartir los planes de una vez ----------------
   `training_plans` estuvo en CERO desde que la tabla existe, y no porque
   faltara el botón: el de compartir vivía dentro del informe de CADA alumno,
   o sea veintitantas visitas. Este lo hace de una.

   Lo que se rompe acá se rompe callado y le cuesta al profesor su trabajo: un
   lote que REGENERE el plan de quien ya lo tenía ajustado a mano le borra la
   nota, y la pantalla se ve perfecta. Por eso lo que se mira es QUÉ se manda,
   no que el botón cambie de texto. */
async function pruebaCompartirPlanes(browser) {
  console.log("\n=== Compartir los planes de una vez ===");

  // Tres alumnos con diagnóstico. El de a-3 sirve para el caso del borrador.
  const diagnosticos = ["a-1", "a-2", "a-3"].map((id) => ({
    student_id: id, detalle: DIAGNOSTICO, fecha: "2026-09-10T12:00:00Z",
    a_medias_pregunta: null, a_medias_fecha: null,
  }));
  const base = (planes) => ({
    rpc: {
      informes_resumen_alumnos: [ANA, BRUNO, CARLA],
      informes_cursos_alumnos: [], informes_diagnosticos_alumnos: diagnosticos,
      informes_totales: { clases_cerradas: 0, preguntas: 0, partidas: 0 },
      resumen_tareas_examenes: DEBERES, evolucion_alumno: CURVA,
    },
    tablas: {
      profiles: [{ id: "prof-1", role: "profesor", is_admin: true, full_name: "Oscar", email: "o@x.cr" }],
      training_plans: planes, diagnosticos_publicos: [], arbitrajes_publicos: [],
      question_answers: [], training_progress: [], encargados: [],
    },
  });
  const escrituras = (page) => page.evaluate(() =>
    window.__escrituras.filter((e) => e.etiqueta === "from:training_plans"));

  // ---- Ninguno compartido: el bloque se ve y dice los dos números ----
  let { page, errores } = await abrir(browser, base([]), "prof-1");
  igual("el bloque se ve cuando falta alguno",
    await page.evaluate(() => {
      const b = document.getElementById("compartir-planes");
      return !!b && getComputedStyle(b).display !== "none";
    }), "true");
  igual("dice cuántos tienen plan de cuántos",
    (await page.textContent("#diagnosticos-clase")).includes("0 de 3 tienen su plan compartido"), "true");

  /* Un primer toque NO escribe nada: confirma. Se confirma en el propio botón
     y no con un diálogo del navegador —la misma decisión que borrar una nota—
     y acá pesa más, porque esto publica material de varios alumnos de una vez. */
  await page.click("#compartir-planes");
  igual("el primer toque no manda nada a la base", (await escrituras(page)).length, 0);
  igual("y el botón dice con cuántos va", await page.textContent("#compartir-planes"), "Sí, compartir con los 3");
  igual("y avisa de que lo verán sus casas",
    (await page.textContent("#compartir-planes-estado")).includes("informes que llegan a sus casas"), "true");

  // ---- El segundo toque sí ----
  await page.click("#compartir-planes");
  await page.waitForFunction(() => {
    // Que el renglón DESAPAREZCA es la señal de éxito: al terminar se repinta el
    // panel y el bloque pasa a la línea de "todos al día", botón incluido.
    const el = document.getElementById("compartir-planes-estado");
    return !el || /Listo|No se pudo/.test(el.textContent);
  }, null, { timeout: 10000 });
  let esc = await escrituras(page);
  igual("se manda UNA sola escritura para los tres", esc.length, 1);
  igual("y es un upsert, no tres inserts sueltos", esc[0].accion, "upsert");
  igual("con los tres alumnos", esc[0].fila.map((f) => f.student_id).sort(), ["a-1", "a-2", "a-3"]);
  igual("todos compartidos", esc[0].fila.every((f) => f.shared === true), "true");
  igual("y a nombre de quien aprieta el botón", esc[0].fila.every((f) => f.teacher_id === "prof-1"), "true");
  /* Cada plan es EL SUYO, armado de su propio diagnóstico: un lote que mandara
     el mismo plan a los tres se vería igual de bien en pantalla. */
  igual("cada uno lleva su plan armado, con sus semanas",
    esc[0].fila.every((f) => f.plan && f.plan.generado && Array.isArray(f.plan.generado.semanas)
                             && f.plan.generado.semanas.length > 0), "true");
  igual("y la fecha del diagnóstico del que sale",
    esc[0].fila.every((f) => f.plan.diagnostico_fecha === "2026-09-10T12:00:00Z"), "true");
  /* `ignoreDuplicates`: si entre que se pintó la pantalla y se apretó el botón
     alguien le guardó un plan a alguno, se salta en vez de pisárselo. */
  igual("y no pisa a quien ya tuviera uno", esc[0].opciones && esc[0].opciones.ignoreDuplicates, "true");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();

  /* ---- Con un borrador guardado: se COMPARTE, no se regenera ----
     Es lo que de verdad importa. A quien ya tiene un plan guardado con su nota
     solo se le cambia la marca; regenerarlo le borraría al profesor lo que
     ajustó a mano, y nadie se enteraría. */
  ({ page, errores } = await abrir(browser, base([
    { id: "pl-3", student_id: "a-3", teacher_id: "prof-1", shared: false,
      nota: "Empieza por los finales.", plan: { generado: { semanas: [{ numero: 1, titulo: "A mano" }] } } },
  ]), "prof-1"));
  igual("cuenta el borrador como NO compartido",
    (await page.textContent("#diagnosticos-clase")).includes("0 de 3 tienen su plan compartido"), "true");
  await page.click("#compartir-planes");
  await page.click("#compartir-planes");
  /* Se espera a que el botón TERMINE, no a que aparezcan N escrituras: si
     faltara una, esperarla por número deja la prueba treinta segundos colgada y
     acaba en un timeout que no dice cuál falta. Así falla en seco y se lee. */
  await page.waitForFunction(() => {
    // Que el renglón DESAPAREZCA es la señal de éxito: al terminar se repinta el
    // panel y el bloque pasa a la línea de "todos al día", botón incluido.
    const el = document.getElementById("compartir-planes-estado");
    return !el || /Listo|No se pudo/.test(el.textContent);
  }, null, { timeout: 10000 });
  esc = await escrituras(page);
  const upd = esc.find((e) => e.accion === "update");
  const ups = esc.find((e) => e.accion === "upsert");
  igual("al del borrador se le hace update, no upsert", !!upd, "true");
  igual("y el update filtra por ÉL, no por todos", upd && upd.dentro[0] ? upd.dentro[0][1] : "(no hubo update)", ["a-3"]);
  igual("lo único que se le cambia es la marca de compartido",
    upd ? Object.keys(upd.fila).sort() : "(no hubo update)", ["shared", "updated_at"]);
  igual("no se le toca el plan ni la nota que el profesor ajustó",
    upd ? ("plan" in upd.fila || "nota" in upd.fila) : "(no hubo update)", "false");
  igual("y a los otros dos se les arma el suyo",
    ups ? ups.fila.map((f) => f.student_id).sort() : "(no hubo upsert)", ["a-1", "a-2"]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();

  /* ---- Con todos compartidos: no hay botón ----
     Un control que no cambia nada es peor que no tenerlo. */
  ({ page } = await abrir(browser, base(["a-1", "a-2", "a-3"].map((id, i) => ({
    id: "pl-" + i, student_id: id, teacher_id: "prof-1", shared: true, nota: null,
    plan: { generado: { semanas: [] } },
  }))), "prof-1"));
  igual("con todos al día no se ofrece el botón",
    await page.evaluate(() => !!document.getElementById("compartir-planes")), "false");
  igual("y se dice en una línea, sin números que pidan nada",
    (await page.textContent("#diagnosticos-clase")).includes("tienen su plan compartido"), "true");
  await page.close();
}

async function pruebaNombreAjeno(browser) {
  console.log("\n=== Un nombre con una etiqueta adentro ===");
  const NOMBRE = 'Eva" onmouseover="window.__xss=1" z="<img src=x onerror="window.__xss=1">';
  const conNombre = (a) => ({ ...a, full_name: NOMBRE });
  const { page, errores } = await abrir(browser, {
    rpc: {
      /* A las DOS: una con diagnóstico y otra sin él. Carla cae en la lista de
         «Sin diagnóstico todavía», que es el único sitio de esa función que se
         había quedado sin escapar — y no saltaba porque el nombre atacante se le
         ponía solo a una alumna que SÍ lo tenía. */
      informes_resumen_alumnos: [conNombre(ANA), BRUNO, conNombre(CARLA)],
      informes_cursos_alumnos: CURSOS_ANA,
      informes_diagnosticos_alumnos: [
        { student_id: "a-1", detalle: DIAGNOSTICO, fecha: "2026-09-10T12:00:00Z", a_medias_pregunta: null, a_medias_fecha: null },
      ],
      informes_totales: { clases_cerradas: 4, preguntas: 10, partidas: 2 },
      resumen_tareas_examenes: DEBERES,
      evolucion_alumno: CURVA,
    },
    tablas: {
      profiles: [{ id: "prof-1", role: "profesor", is_admin: true, full_name: "Oscar", email: "o@x.cr" }],
      training_plans: [], diagnosticos_publicos: [], arbitrajes_publicos: [],
      question_answers: RESPUESTAS, training_progress: DIAGNOSTICOS, encargados: [],
    },
  }, "prof-1");

  // Lo que el nombre trae adentro no puede haber corrido ni haber nacido como
  // elemento. Se mira en las dos vistas: la del grupo y la de ese alumno, que
  // es donde se pintan los cursos, el diagnóstico y el perfil por área.
  const sucio = () => page.evaluate(() => ({
    ejecutado: window.__xss === undefined ? "no" : "SÍ",
    inyectados: document.querySelectorAll('img[src="x"], [onmouseover], [z]').length,
  }));

  const general = await sucio();
  igual("en la vista del grupo no se ejecutó nada", general.ejecutado, "no");
  igual("ni nació ningún elemento del nombre", general.inyectados, 0);
  igual("y el nombre se sigue leyendo entero", await page.evaluate(() =>
    document.querySelector("#attendance-table-body tr").children[0].textContent), NOMBRE);
  igual("y en «Sin diagnóstico todavía» también se lee entero", await page.evaluate(() =>
    document.querySelector("#diagnosticos-clase [data-pend-todos], #diagnosticos-clase [data-pend-corto]")
      .textContent.includes('onmouseover="window.__xss=1"')), true);

  await page.selectOption("#student-filter", "a-1");
  await page.waitForTimeout(400);
  const alumno = await sucio();
  igual("en el informe de ese alumno tampoco se ejecutó nada", alumno.ejecutado, "no");
  igual("ni nació ningún elemento del nombre", alumno.inyectados, 0);

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();
}

/* UNA CLASE DE VERDAD, que es donde esta página se rompía callada: con tres
   alumnos todo se ve bien, y el problema empieza a los cincuenta. Lo que se
   comprueba es lo que no se nota mirando una clase chica — que el índice corte,
   que el buscador filtre de verdad (uno que no filtra enseña la clase entera y
   se ve igual de bien) y que las tildes no lo dejen sin encontrar a nadie. */
async function pruebaClaseGrande(browser) {
  console.log("\n=== Una clase de cincuenta ===");
  const alumno = (i, nombre) => ({
    id: "g" + i, full_name: nombre, email: "g" + i + "@x.cr", grupo: i % 2 ? "7A" : "7B",
    elo: null, elo_tipo: null, elo_actualizado: null,
    respuestas: i, correctas: Math.floor(i / 2), calificadas: i, clases_asistidas: i % 5,
    minutos_clase: i, minutos_ejercicios: i,
    puzzles: i, lecciones: 0, mejor_coord: 0, practicar_series: 0, practicar_estrellas: 0,
    mate1: 0, mate2: 0, mate3: 0, tactica: 0, concentracion: 0, cursos_temas: 0,
  });
  // Se mandan desordenados a propósito: el orden por nombre lo tiene que poner
  // la página, no venir regalado por la base.
  const nombres = Array.from({ length: 44 }, (_, i) => "Alumna " + String(i + 1).padStart(2, "0"));
  const alumnos = nombres.map((n, i) => alumno(i + 1, n)).reverse();
  alumnos.push(alumno(45, "Sofía Núñez"));

  const { page, errores } = await abrir(browser, {
    rpc: {
      informes_resumen_alumnos: alumnos,
      informes_cursos_alumnos: [],
      // Cinco con diagnóstico: los suficientes para que «Nivel por alumno» tenga
      // que cortar en tres y ofrecer el resto.
      informes_diagnosticos_alumnos: ["g1", "g2", "g3", "g4", "g5"].map((id) => (
        { student_id: id, detalle: DIAGNOSTICO, fecha: "2026-09-10T12:00:00Z", a_medias_pregunta: null, a_medias_fecha: null })),
      informes_totales: { clases_cerradas: 4, preguntas: 10, partidas: 2 },
      // Tres que llevan tiempo sin entrenar, el de en medio hace más que el resto.
      informes_inactivos: [
        { id: "g45", full_name: "Sofía Núñez", email: "g45@x.cr", grupo: "7A", ultima_actividad: null },
        { id: "g2", full_name: "Alumna 02", email: "g2@x.cr", grupo: "7B", ultima_actividad: "2026-08-01T10:00:00Z" },
        { id: "g3", full_name: "Alumna 03", email: "g3@x.cr", grupo: "7A", ultima_actividad: "2026-09-10T10:00:00Z" },
      ],
    },
    tablas: {
      profiles: [{ id: "prof-1", role: "profesor", is_admin: false, full_name: "Oscar", email: "o@x.cr" }],
      training_plans: [], diagnosticos_publicos: [], arbitrajes_publicos: [],
      question_answers: [], training_progress: [], encargados: [],
    },
  }, "prof-1");

  const filas = (t) => page.evaluate((x) => document.querySelectorAll("#" + x + " tr").length, t);
  const primera = () => page.evaluate(() =>
    document.querySelector("#alumnos-tbody tr button[data-abrir]").textContent);

  igual("el índice corta en tres, que es lo que se ve sin bajar", await filas("alumnos-tbody"), 3);
  igual("y lo dice, con el total de verdad", await page.textContent("#alumnos-cuenta"), "Mostrando 3 de 45");
  igual("por nombre, y el orden lo pone la página", await primera(), "Alumna 01");
  /* Las tablas completas viven dentro de un <details> cerrado: no cuestan
     pantalla, así que se pintan enteras. Son las que sirven para comparar
     columna a columna, que es lo único que un índice de una fila no da. */
  igual("las tablas completas siguen trayendo a todos", await filas("attendance-table-body"), 45);

  await page.click("#alumnos-mas");
  igual("«ver más» trae los siguientes tres", await filas("alumnos-tbody"), 6);
  igual("y dice cuántos faltan", await page.textContent("#alumnos-mas"), "Ver más alumnos (faltan 39)");

  /* Buscar "nunez" tiene que encontrar a "Núñez": nadie escribe las tildes en un
     buscador, y quedarse sin resultados se lee como "esa alumna no está". */
  await page.fill("#alumnos-buscar", "nunez");
  await page.waitForFunction(() => document.querySelectorAll("#alumnos-tbody tr").length === 1);
  igual("el buscador no se pierde con las tildes", await primera(), "Sofía Núñez");
  igual("y filtra TAMBIÉN las tablas de abajo", await filas("attendance-table-body"), 1);
  igual("y el corte vuelve a empezar, no se queda en los seis de antes",
    await page.textContent("#alumnos-cuenta"), "1 alumno");

  await page.fill("#alumnos-buscar", "no existe nadie así");
  await page.waitForFunction(() => document.getElementById("alumnos-tbody").textContent.includes("Ningún"));
  igual("y sin resultados lo dice en vez de quedarse en blanco",
    (await page.textContent("#alumnos-tbody")).trim(), "Ningún alumno con ese nombre.");

  await page.fill("#alumnos-buscar", "");
  await page.waitForFunction(() => document.querySelectorAll("#alumnos-tbody tr").length === 3);
  await page.selectOption("#alumnos-orden", "inactivos");
  igual("ordenando por quien lleva más sin entrenar, «nunca» va antes que «hace mes y medio»",
    await page.evaluate(() => [...document.querySelectorAll("#alumnos-tbody tr")].slice(0, 3)
      .map((tr) => tr.querySelector("button[data-abrir]").textContent)),
    ["Sofía Núñez", "Alumna 02", "Alumna 03"]);
  igual("y se dice desde cuándo, en rojo", await page.evaluate(() => {
    const td = document.querySelector("#alumnos-tbody tr:nth-child(2) td:last-child");
    return [td.textContent.trim().startsWith("⚠️ Hace"), /rgb\(220|rgb\(248|rgb\(185/.test(getComputedStyle(td).color)].join(",");
  }), "true,true");

  /* Los cuarenta que no lo hicieron eran media pantalla de nombres de corrido
     —lo más largo del panel, justo después de acortar todo lo demás—. Lo que
     hace falta saber es CUÁNTOS son; los nombres se destapan a pedido. */
  console.log("-- Los que todavía no lo hicieron");
  const lineaPend = () => page.evaluate(() =>
    [...document.querySelectorAll("#diagnosticos-clase p")]
      .find((x) => x.textContent.includes("Sin diagnóstico todavía"))
      .innerText.replace(/\s+/g, " ").trim());
  igual("se dice cuántos son y se nombran tres", await lineaPend(),
    "Sin diagnóstico todavía (40): Alumna 44, Alumna 43, Alumna 42 y 37 más. Ver los 40");
  await page.click("#pendientes-mas");
  igual("tocarlo los destapa todos", await page.evaluate(() =>
    document.querySelector("#diagnosticos-clase [data-pend-todos]").textContent.split(",").length), 40);
  igual("y el botón vuelve a guardarlos, no desaparece dejando el foco en el aire",
    await page.evaluate(() => {
      const b = document.getElementById("pendientes-mas");
      if (!b || b.textContent !== "Ver solo los primeros") return "no";
      b.click();
      return document.querySelector("#diagnosticos-clase [data-pend-corto]").classList.contains("hidden") ? "no" : "sí";
    }), "sí");

  igual("la franja dice los tres que no entrenan", await page.evaluate(() =>
    [...document.querySelectorAll("#atencion-botones button")].map((b) => b.textContent)),
    ["😴 3 sin entrenar hace 4 días o más", "🧭 40 sin diagnóstico", "📤 5 planes sin compartir"]);

  /* La lista de «sin entrenar» y su botón de invitar a la casa: no es el
     informe programado, es el empujón puntual que agrega este cambio. Lo que
     se comprueba es que el botón le pida a la función el ALUMNO CORRECTO —
     el primero de la lista, que es quien nunca entrenó, no cualquiera. */
  console.log("-- La lista de «sin entrenar» y el botón de invitar");
  await page.click("#atencion-botones button");
  await page.waitForFunction(() => !document.getElementById("topic-report").classList.contains("hidden"));
  igual("el clic deja el filtro en «inactivos»", await page.inputValue("#topic-filter"), "inactivos");
  igual("lista a los tres, el que nunca entrenó primero", await page.evaluate(() =>
    [...document.querySelectorAll("#topic-report-body > div")].map((d) => d.querySelector("span").textContent.trim())),
    ["Sofía Núñez · 7A", "Alumna 02 · 7B", "Alumna 03 · 7A"]);
  await page.evaluate(() => { window.__funcion.length = 0; });
  await page.click("#topic-report-body > div:first-child button");
  await page.waitForFunction(() => window.__funcion.length > 0);
  igual("«invitar a practicar» le pide a la función ese alumno", await page.evaluate(() => window.__funcion[0]),
    { action: "invitar_practicar", student_id: "g45" });
  await page.selectOption("#topic-filter", "");
  await page.waitForFunction(() => !document.getElementById("teacher-report").classList.contains("hidden"));

  /* El selector de temas, ordenado en bloques, y las preguntas de siempre
     encima: cada pregunta deja puesto el tema que la contesta. */
  console.log("-- El selector en bloques y las preguntas de siempre");
  igual("el selector va en bloques, y a un profesor no le queda el del público",
    await page.evaluate(() => [...document.querySelectorAll("#topic-filter optgroup")].map((g) => g.label)),
    ["Cómo van tus alumnos", "Lo que entrenaron, tema por tema"]);
  igual("ningún tema se perdió al agruparlos", await page.evaluate(() =>
    [...document.querySelectorAll("#topic-filter option")].map((o) => o.value).sort().join(",")),
    ["", "4x4", "aprender", "asignaciones", "asistencia", "concentracion", "coordenadas", "cursos", "diagnostico", "inactivos", "mates", "practicar", "tactica"].sort().join(","));
  const preguntas = () => page.evaluate(() => [...document.querySelectorAll("#preguntas-rapidas button")]
    .filter((b) => b.checkVisibility()).map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? " [marcada]" : "")));
  igual("se ven las cuatro preguntas, ninguna marcada", await preguntas(),
    ["¿Quién no está entrenando?", "¿Quién viene a clase?", "¿Cómo contestan en clase?", "¿Qué nivel tiene cada uno?"]);
  await page.click('#preguntas-rapidas button[data-tema="inactivos"]');
  await page.waitForFunction(() => !document.getElementById("topic-report").classList.contains("hidden"));
  igual("«¿Quién no está entrenando?» deja puesto su tema", await page.inputValue("#topic-filter"), "inactivos");
  igual("y queda marcada, dicho con aria-pressed", await preguntas(),
    ["¿Quién no está entrenando? [marcada]", "¿Quién viene a clase?", "¿Cómo contestan en clase?", "¿Qué nivel tiene cada uno?"]);
  await page.selectOption("#topic-filter", "asistencia");
  igual("cambiar el tema en el selector mueve la marca", (await preguntas())[1], "¿Quién viene a clase? [marcada]");
  await page.selectOption("#topic-filter", "");
  await page.waitForFunction(() => !document.getElementById("teacher-report").classList.contains("hidden"));
  igual("con el resumen general, ninguna marcada", (await preguntas()).filter((t) => t.includes("[marcada]")), []);

  /* «Nivel por alumno» corta igual que el índice: con cuarenta diagnósticos era
     una pared de barras antes de llegar a lo que de verdad se mira, que es el
     promedio del grupo. Se mide el display que CALCULA el navegador. */
  console.log("-- Nivel por alumno: los tres primeros");
  const nivelesALaVista = () => page.evaluate(() =>
    [...document.querySelectorAll("#diagnosticos-clase [data-nivel-fila]")]
      .filter((d) => getComputedStyle(d).display !== "none").length);
  igual("se ven tres de los cinco", await nivelesALaVista(), 3);
  igual("y el botón dice cuántos faltan", await page.textContent("#niveles-mas"), "Ver más alumnos (faltan 2)");
  await page.click("#niveles-mas");
  igual("tocarlo los destapa", await nivelesALaVista(), 5);
  igual("y con todos a la vista el botón se va, no se queda sin hacer nada",
    await page.evaluate(() => !!document.getElementById("niveles-mas")), false);

  /* Las nueve áreas NO se cortan ni se pliegan: son nueve renglones fijos y es
     lo que contesta "¿qué doy la clase que viene?". */
  igual("el promedio del grupo va completo y con su nombre nuevo", await page.evaluate(() => {
    const h = [...document.querySelectorAll("#diagnosticos-clase h3")]
      .find((x) => x.textContent.trim() === "Dónde se debe mejorar");
    if (!h) return "no está";
    let n = 0;
    for (let e = h.nextElementSibling; e; e = e.nextElementSibling) {
      if (e.tagName === "DIV") { n = e.children.length; break; }
    }
    return n;
  }), 9);
  igual("y ya no se llama «Dónde está floja la clase»",
    (await page.textContent("#diagnosticos-clase")).includes("floja la clase"), false);

  /* Lo que se hace FUERA de la plataforma es de administración: son visitantes
     del sitio, no alumnos de nadie, y lo que dejan son contactos. A un profesor
     no se le pinta —y se QUITA, no se esconde: un <details> escondido sigue
     recibiendo el foco— ni se le baja. */
  console.log("-- Lo de fuera de la plataforma es de administración");
  igual("a un profesor no se le pintan los dos paneles del público", await page.evaluate(() =>
    [!!document.getElementById("arbitrajes-publicos"), !!document.getElementById("diagnosticos-visitantes")]), [false, false]);
  igual("ni le quedan sus dos temas en el filtro", await page.evaluate(() =>
    [...document.querySelectorAll("#topic-filter option")].map((o) => o.value)
      .filter((v) => v === "arbitraje" || v === "diagnostico-publico")), []);
  igual("y tampoco se le bajan: son dos páginas de mil filas que no va a mirar",
    await page.evaluate(() => window.__consultas
      .filter((c) => c.etiqueta === "from:arbitrajes_publicos" || c.etiqueta === "from:diagnosticos_publicos").length), 0);
  igual("dentro del tema «Diagnóstico» tampoco salen los visitantes", await (async () => {
    await page.selectOption("#topic-filter", "diagnostico");
    await page.waitForFunction(() => !document.getElementById("topic-report").classList.contains("hidden"));
    return (await page.textContent("#topic-report-body")).includes("Visitantes");
  })(), false);

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

/* EL PDF DEL DIAGNÓSTICO DE UN VISITANTE. Se descarga de verdad, apretando el
   botón, y se mira el archivo que salió — no la función que lo arma. Lo que se
   rompe acá no da ningún error: un PDF sin la marca de agua se ve perfecto y
   circula igual, y uno con el nombre de otro visitante también.

   Los flujos de contenido de js/reporte-pdf.js van sin comprimir, así que se
   pueden leer sin ninguna librería: cada página dice «/Marca Do» si lleva la
   marca, y el texto va entre paréntesis en WinAnsi (o sea, en latin1). */
/* informes.html?alumno=<id>: así llega el buscador del panel. Abre el informe
   de ese alumno si está en la lista de quien mira; si no, el resumen. */
async function pruebaAlumnoPorEnlace(browser) {
  console.log("\n=== Llegar al informe de un alumno por su enlace ===");
  const datos = () => ({
    rpc: { informes_resumen_alumnos: [ANA, BRUNO, CARLA], informes_totales: { clases_cerradas: 0, preguntas: 0, partidas: 0 } },
    tablas: { profiles: [{ id: "prof-1", role: "profesor", is_admin: false, full_name: "Karina", email: "k@x.cr" }],
              training_plans: [], diagnosticos_publicos: [], arbitrajes_publicos: [] },
  });
  let r = await abrir(browser, datos(), "prof-1", "/informes.html?alumno=a-1");
  await r.page.waitForFunction(() => !document.getElementById("student-report").classList.contains("hidden"), null, { timeout: 10000 });
  igual("?alumno= deja elegido a ese alumno y abre su informe", await r.page.inputValue("#student-filter"), "a-1");
  await r.page.close();
  r = await abrir(browser, datos(), "prof-1", "/informes.html?alumno=alguien-ajeno");
  await r.page.waitForTimeout(500);
  igual("con un alumno que no es suyo, se queda el resumen de siempre", await r.page.inputValue("#student-filter"), "");
  await r.page.close();
}

async function pruebaPdfVisitante(browser) {
  console.log("\n=== El diagnóstico de un visitante, en PDF ===");
  const VISITANTES = [
    { id: "v-1", created_at: "2026-09-20T15:00:00Z", nombre: "Lucía Fernández (visitante)", email: "lucia@x.cr",
      telefono: "8888-1111", nivel: "Intermedio", porcentaje: 68, elo: null, atendido: false, detalle: DIAGNOSTICO },
    { id: "v-2", created_at: "2026-09-12T15:00:00Z", nombre: "Otro Visitante", email: "otro@x.cr",
      telefono: null, nivel: "Básico", porcentaje: 40, elo: null, atendido: true, detalle: DIAGNOSTICO },
  ];
  const { page, errores } = await abrir(browser, {
    rpc: {
      informes_resumen_alumnos: [ANA], informes_cursos_alumnos: [], informes_diagnosticos_alumnos: [],
      informes_totales: { clases_cerradas: 0, preguntas: 0, partidas: 0 },
    },
    tablas: {
      profiles: [{ id: "prof-1", role: "profesor", is_admin: true, full_name: "Oscar", email: "o@x.cr" }],
      training_plans: [], diagnosticos_publicos: VISITANTES, arbitrajes_publicos: [],
      ajustes_academia: [{ clave: "whatsapp_consultas", valor: "8309 2291" }],
    },
  }, "prof-1");

  igual("a administración sí le queda el bloque del público en el selector",
    await page.evaluate(() => [...document.querySelectorAll("#topic-filter optgroup")].map((g) => g.label)),
    ["Cómo van tus alumnos", "Lo que entrenaron, tema por tema", "Visitantes del sitio (sin cuenta)"]);
  igual("al abrir Informes no se baja el generador de PDF", await page.evaluate(() =>
    typeof window.ReportePDF + " " + typeof window.DiagnosticoVisitantePDF), "undefined undefined");
  await page.evaluate(() => document.getElementById("diagnosticos-visitantes").closest("details").querySelector("summary").click());
  const botones = page.locator("#diagnosticos-visitantes [data-pdf]");
  igual("cada visitante tiene su botón de PDF", await botones.count(), 2);
  igual("y el botón dice de quién es", await botones.first().getAttribute("aria-label"),
    "Descargar en PDF el diagnóstico de Lucía Fernández (visitante)");

  const [descarga] = await Promise.all([page.waitForEvent("download"), botones.first().click()]);
  igual("el archivo se llama como el visitante y el día", descarga.suggestedFilename(), "diagnostico-lucia-fernandez-visitante-2026-09-20.pdf");
  const ruta = await descarga.path();
  if (process.env.GUARDAR_PDF) require("fs").copyFileSync(ruta, process.env.GUARDAR_PDF);
  const bytes = require("fs").readFileSync(ruta);
  const pdf = bytes.toString("latin1");
  const paginas = (pdf.match(/\/Type \/Page\b(?!s)/g) || []).length;
  igual("es un PDF", pdf.slice(0, 5), "%PDF-");
  igual("tiene más de una página (el plan no entra en una)", paginas > 1, true);
  igual("y la marca de agua está en TODAS", (pdf.match(/\/Marca Do/g) || []).length, paginas);
  igual("la marca lleva su canal alfa, o taparía el texto", /\/SMask \d+ 0 R/.test(pdf), true);
  const tiene = (t) => pdf.includes(Buffer.from(t, "latin1").toString("latin1"));
  igual("firma de Oscar en los datos del archivo", /\/Author \(Oscar Angulo Cubero\)/.test(pdf), true);
  igual("y en el pie", tiene("Oscar Angulo Cubero · Ajedrez Integral · ajedrez-integral.com"), true);
  igual("con su cargo", tiene("Entrenador FIDE y Árbitro Internacional"), true);
  igual("el WhatsApp sale de los ajustes, no escrito en la página", tiene("WhatsApp: 8309 2291"), true);
  igual("el nombre del visitante está, con su paréntesis escapado", tiene("Lucía Fernández \\(visitante\\)"), true);
  igual("y NO se cuela el del otro visitante", tiene("Otro Visitante"), false);
  igual("dice el nivel que cuenta la pantalla", tiene("Resultado") && tiene("Área por área"), true);
  igual("el estado de cada área va escrito, no solo en color", tiene("A trabajar") || tiene("En camino") || tiene("Firme"), true);
  igual("y avisa que no es un rating oficial", tiene("no son un rating oficial"), true);
  igual("la pantalla dice que se descargó", await page.textContent("#diagnosticos-visitantes [data-pdf-estado]"),
    "Listo, se descargó diagnostico-lucia-fernandez-visitante-2026-09-20.pdf.");

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

/* A un alumno que entra con usuario de la Academia también su profesor le pone
   la contraseña: es quien lo tiene en la clase. Un profesor que NO coordina ve
   solo eso de la tarjeta «Acceso a la cuenta» —reenviar el enlace sigue siendo
   de coordinación— y a un alumno con correo propio no se le ofrece nada. */
async function pruebaContrasenaProfesor(browser) {
  console.log("\n=== La contraseña que pone el profesor ===");
  const TITO = Object.assign({}, BRUNO, { id: "a-9", full_name: "Tito Vargas", email: "tito.vargas@alumno.ajedrez-integral.com" });
  const { page, errores } = await abrir(browser, {
    rpc: {
      informes_resumen_alumnos: [ANA, TITO],
      informes_totales: { clases_cerradas: 4, preguntas: 10, partidas: 2 },
    },
    tablas: {
      profiles: [{ id: "prof-2", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Luis", email: "luis@x.cr" }],
    },
  }, "prof-2");
  const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

  await page.selectOption("#student-filter", "a-1");
  await page.waitForFunction(() => !document.getElementById("student-report").classList.contains("hidden"));
  igual("con correo propio, el profesor no ve «Acceso a la cuenta»", await visible("#acceso-report"), false);

  await page.selectOption("#student-filter", "a-9");
  await page.waitForFunction(() => !document.getElementById("acceso-report").classList.contains("hidden"));
  await page.evaluate(() => { document.getElementById("acceso-report").open = true; });
  igual("con usuario de la Academia, sí: con «Su contraseña»",
    await page.evaluate(() => [...document.querySelectorAll("#acceso-clave h3")].some((h) => h.textContent === "Su contraseña" && h.checkVisibility())), true);
  igual("pero sin «Reenviar enlace», que es de coordinación", await visible("#acceso-reenviar"), false);

  await page.evaluate(() => { window.__funcion.length = 0; });
  await page.fill("#acceso-clave input", "caballo482");
  await page.click("#acceso-clave button:text-is('Poner esta contraseña')");
  await page.waitForFunction(() => window.__funcion.some((f) => f.action === "contrasena"));
  const envio = await page.evaluate(() => window.__funcion.find((f) => f.action === "contrasena"));
  igual("la pone correos-alumno, con ESE alumno y lo escrito",
    [envio.url.indexOf("correos-alumno") !== -1, envio.alumno_id, envio.contrasena], [true, "a-9", "caballo482"]);
  await page.waitForFunction(() => [...document.querySelectorAll(".avisos-mensaje")].some((m) => m.checkVisibility() && m.textContent.indexOf("«tito.vargas»") !== -1), { timeout: 10000 });
  igual("y el aviso dice el usuario sin dominio y la contraseña",
    await page.evaluate(() => [...document.querySelectorAll(".avisos-mensaje")].some((m) => m.textContent.indexOf("«caballo482»") !== -1 && m.textContent.indexOf("@") === -1)), true);

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    pruebaVeredicto();
    await pruebaProfesor(browser);
    await pruebaClaseGrande(browser);
    await pruebaAlumno(browser);
    await pruebaCompartirPlanes(browser);
    await pruebaNombreAjeno(browser);
    await pruebaPdfVisitante(browser);
    await pruebaAlumnoPorEnlace(browser);
    await pruebaContrasenaProfesor(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: informes.html pinta lo que la base le manda.");
  process.exit(fallos ? 1 : 0);
})();
