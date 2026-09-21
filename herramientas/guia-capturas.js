/* ===== Las capturas de pantalla de la guía del profesor =====
 *
 * Fotografía cada página de la plataforma y deja los archivos en `img/guia/`,
 * para que las diapositivas y el manual enseñen la pantalla de la que están
 * hablando. Una guía que dice «abre Tareas y marca a qué alumnos» y no enseña
 * la pantalla obliga a quien la lee a imaginársela.
 *
 * **Casi todas estas páginas están detrás del login**, así que no se pueden
 * abrir y fotografiar sin más: sin sesión redirigen a `login.html` y la foto
 * saldría del formulario de acceso, una y otra vez, sin que nada fallara. Se
 * usa el mismo truco que los verificadores del repositorio: se intercepta
 * `js/supabase-client.js` y se le sirve un cliente de mentira con una sesión de
 * profesora y datos de demostración.
 *
 * **Los datos son inventados y eso no es un detalle.** Acá no puede salir el
 * nombre de un alumno real, ni su correo, ni su progreso: la guía se imprime,
 * se proyecta delante de todo el equipo y se manda por correo. Las cuentas de
 * mentira viven todas en `DEMO`, en un solo lugar, para que se vea de un
 * vistazo que ninguna es de verdad.
 *
 * **Lo que se rompe acá se rompe callado**: una página que se quedó en
 * «Comprobando tu sesión…» se fotografía igual, y la diapositiva queda con una
 * pantalla en blanco que nadie mira hasta que está proyectada. Por eso cada
 * captura se REVISA antes de guardarse —que tenga texto de verdad, que no sea
 * el gate ni un aviso de acceso denegado— y la que no pasa no se guarda: el
 * generador la echa de menos y lo dice.
 *
 * Cómo se corre (con el sitio servido en localhost:8777):
 *
 *     python3 -m http.server 8777        # en otra terminal, desde la raíz
 *     npm install playwright
 *     node herramientas/guia-capturas.js
 *
 * Con CHROMIUM=/ruta/al/chrome se le indica un Chromium ya instalado, y con
 * SOLO=clases,tareas se rehacen únicamente esas.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const SALIDA = path.join(RAIZ, "img/guia");
const SOLO = (process.env.SOLO || "").split(",").map((s) => s.trim()).filter(Boolean);

/* La foto es del tamaño de una pantalla y no de la página entera: lo que la
   guía está enseñando es «esto es lo que ves al entrar», y una captura de tres
   metros de alto encogida para caber en una diapositiva no se lee.

   Y va en 16:9, la misma proporción que la diapositiva que la va a enseñar:
   con otra forma, la imagen entra por el lado que le sobra y deja dos franjas
   en blanco a los costados — se ve ordenada y se lee peor, que es justo lo
   contrario de para lo que está puesta. */
const PANTALLA = { width: 1440, height: 810 };

/* ==========================================================================
   Las cuentas y los datos de demostración — TODOS inventados
   ========================================================================== */
const PROFE = {
  id: "demo-profe", full_name: "Karina Rojas", email: "karina@ejemplo.test",
  role: "profesor", is_admin: true, es_coordinador: true, grupo: null,
  teacher_id: null, invitaciones_max: 20, invitaciones_usadas: 3, elo: null,
};
const ALUMNOS = [
  ["demo-a1", "Sofía Muñoz", "7° B", 1240],
  ["demo-a2", "Mateo Vargas", "7° B", 1105],
  ["demo-a3", "Valeria Solano", "8° A", 1380],
  ["demo-a4", "Diego Campos", "8° A", 980],
  ["demo-a5", "Luciana Brenes", "7° B", 1060],
  ["demo-a6", "Emilio Quesada", "9° A", 1455],
].map(([id, nombre, grupo, elo]) => ({
  id, full_name: nombre, email: id + "@alumno.ejemplo.test", role: "alumno",
  is_admin: false, es_coordinador: false, grupo, teacher_id: PROFE.id, elo,
  invitaciones_max: 0, invitaciones_usadas: 0,
}));

const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
const dentro = (dias) => new Date(Date.now() + dias * 86400000).toISOString();

const DEMO = {
  perfiles: [PROFE].concat(ALUMNOS),

  class_sessions: [0, 2, 5, 9, 14, 21].map((d, i) => ({
    id: "demo-c" + i, created_by: PROFE.id,
    title: ["Finales de torre", "La clavada", "Apertura italiana", "Mates en dos",
            "El peón pasado", "Repaso de táctica"][i],
    notes: i === 0 ? "repasamos la posición de Lucena" : null,
    started_at: hace(d), ended_at: new Date(Date.parse(hace(d)) + 55 * 60000).toISOString(),
  })),

  tareas: [
    { id: "demo-t1", alumno_id: "demo-a1", profesor_id: PROFE.id, titulo: "Táctica de la semana",
      estado: "pendiente", vence_at: dentro(2), created_at: hace(3) },
    { id: "demo-t2", alumno_id: "demo-a2", profesor_id: PROFE.id, titulo: "Coordenadas y mates",
      estado: "pendiente", vence_at: dentro(5), created_at: hace(1) },
  ],

  /* Lo que contestan las funciones de la base. Los números son de mentira pero
     coherentes entre sí: un informe que se contradiga consigo mismo en una
     captura es peor que no tener captura. */
  rpc: {
    panel_profesor: [{ alumnos: 6, activos_7d: 4, tareas_pendientes: 3, tareas_vencidas: 1, clases_30d: 6 }],
    mis_clases: [{ profesor_id: PROFE.id, profesor_nombre: PROFE.full_name, es_principal: true, clase_abierta: false }],
    progreso_dias_y_racha: [{
      dias_activos: 34, racha_actual: 5, racha_record: 12, total_ejercicios: 418,
      tipos_distintos: 7, hoy_ejercicios: 3, primer_dia: hace(90),
      por_actividad: { temas: 120, mates: 96, coordenadas: 40, practicar: 62, puzzles: 70, tactica: 20, lecciones: 10 },
    }],
    informes_totales: [{ clases_cerradas: 6, preguntas: 24, partidas: 11 }],
    informes_resumen_alumnos: ALUMNOS.map((a, i) => ({
      student_id: a.id, full_name: a.full_name, grupo: a.grupo, elo: a.elo,
      respuestas: 30 + i * 7, correctas: 20 + i * 5, aciertos: 20 + i * 5,
      clases: 5 - (i % 3), clases_asistidas: 5 - (i % 3),
      minutos_clase: 180 + i * 25, minutos_ejercicios: 90 + i * 30,
      puzzles: 30 + i * 6, lecciones: 4 + i, mejor_coord: 18 + i,
      practicar: 6 + i, estrellas: 2, mate1: 20 + i, mate2: 8 + i, mate3: 3,
      tactica: 25 + i * 4, concentracion: 5, cursos_temas: 2,
    })),
    informes_cursos_alumnos: ALUMNOS.slice(0, 4).map((a, i) => ({
      student_id: a.id, curso: ["el-mapa-de-los-finales", "estrategia-en-el-final",
        "partidas-modelo", "aperturas-y-defensas"][i],
      total: 20, hechas: 6 + i * 3, ultimo_tema: 6 + i * 3, ultimo_at: hace(i + 1),
    })),
    informes_diagnosticos_alumnos: ALUMNOS.slice(0, 3).map((a, i) => ({
      student_id: a.id, nivel: ["Básico", "Intermedio", "Avanzado"][i],
      porcentaje: 42 + i * 18, elo_estimado: 1450 + i * 200, fecha: hace(10 + i),
      areas: { finales: 40 + i * 10, tactica: 55 + i * 8, aperturas: 38 + i * 12 },
      pendiente: null,
    })),
    /* Los nombres son los que lee `tarjetaEnviada()` de tareas.html, uno por
       uno. Con otros, la tarjeta se pinta igual y dice «undefined/undefined»:
       la captura sale perfecta salvo por eso. */
    tareas_con_avance: [
      { id: "demo-t1", alumno_id: "demo-a1", alumno_nombre: "Sofía Muñoz",
        titulo: "Táctica de la semana", vence_at: dentro(2), situacion: "pendiente",
        cumplidos: 0, renglones: 2, created_at: hace(3),
        items: [
          { id: "i1", material_label: "Ejercicios por tema", filtro_label: "Ataque doble",
            meta_tipo: "cantidad", meta_cantidad: 10, hecho: 6, cumplido: false },
          { id: "i2", material_label: "Coordenadas", filtro_label: null,
            meta_tipo: "minutos", meta_cantidad: 10, hecho: 7, cumplido: false },
        ] },
      { id: "demo-t2", alumno_id: "demo-a2", alumno_nombre: "Mateo Vargas",
        titulo: "Coordenadas y mates", vence_at: dentro(5), situacion: "pendiente",
        cumplidos: 1, renglones: 2, created_at: hace(1),
        items: [
          { id: "i3", material_label: "Coordenadas", filtro_label: null,
            meta_tipo: "minutos", meta_cantidad: 10, hecho: 10, cumplido: true },
          { id: "i4", material_label: "Mates", filtro_label: "Mate en 1",
            meta_tipo: "cantidad", meta_cantidad: 25, hecho: 11, cumplido: false },
        ] },
    ],
    resumen_tareas_examenes: [{
      tareas_puestas: 4, tareas_terminadas: 2, sin_hacer_hoy: 1, proxima_vence: dentro(2),
      examenes_rendidos: 2, nota_promedio: 8.4,
    }],
    cobros_resumen: [{ moneda: "CRC", cobrado_mes: 180000, pendiente: 60000, vencido: 20000, alumnos_morosos: 1 }],
  },

  /* `reporte_actividades()` no devuelve filas: devuelve UN objeto con el
     periodo, los totales, las clases y los estudiantes. Pasado por el mismo
     camino que los demás RPC llegaría como arreglo y el informe saldría
     diciendo «del undefined al undefined». */
  rpcObjeto: {
    reporte_actividades: {
      desde: null, hasta: null, generado: null,     // los pone la corrida
      totales: { clases: 6, asistencias: 27, estudiantes: 6, minutos: 330, preguntas: 24 },
      clases: [0, 2, 5, 9, 14, 21].map((d, i) => ({
        id: "demo-c" + i,
        title: ["Finales de torre", "La clavada", "Apertura italiana", "Mates en dos",
                "El peón pasado", "Repaso de táctica"][i],
        started_at: hace(d), duracion_min: 55, notes: i === 0 ? "repasamos la posición de Lucena" : null,
        presentes: 6 - (i % 3), ausentes: i % 3,
        asistentes: ALUMNOS.slice(0, 6 - (i % 3)).map((a) => a.full_name),
      })),
      estudiantes: ALUMNOS.map((a, i) => ({
        student_id: a.id, full_name: a.full_name, grupo: a.grupo,
        clases: 6 - (i % 3), posibles: 6, porcentaje: Math.round((6 - (i % 3)) / 6 * 100),
        minutos: 180 + i * 25,
      })),
    },
  },

  /* Las tablas que las páginas piden directo. Lo justo para que la pantalla se
     vea como se ve de verdad. */
  tablas: {
    profiles: null,          // se rellena con los perfiles
    class_sessions: null,    // idem
    planes_clase: [
      { id: "demo-p1", profesor_id: PROFE.id, titulo: "Finales de torre · clase 1",
        notas: "Arrancar con la posición de Lucena.", compartido_todos: false, created_at: hace(4) },
      { id: "demo-p2", profesor_id: PROFE.id, titulo: "La clavada · AI",
        notas: null, compartido_todos: true, created_at: hace(12) },
    ],
    plan_items: [
      { id: "demo-pi1", plan_id: "demo-p1", orden: 0, tipo: "posicion", titulo: "Posición de Lucena",
        fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", pregunta: "¿Cómo se construye el puente?" },
      { id: "demo-pi2", plan_id: "demo-p1", orden: 1, tipo: "nota", titulo: "Recordar la regla de la sexta fila",
        fen: null, pregunta: null },
    ],
    examenes: [
      { id: "demo-e1", alumno_id: "demo-a1", profesor_id: PROFE.id, titulo: "Examen de finales y reglamento",
        estado: "entregado", nota: 8.5, respondidas: 12, total_items: 12, minutos: 18,
        salidas: 0, salidas_permitidas: 2, created_at: hace(6) },
      { id: "demo-e2", alumno_id: "demo-a3", profesor_id: PROFE.id, titulo: "Examen de táctica",
        estado: "asignado", nota: null, respondidas: null, total_items: 10, minutos: 15,
        salidas: 0, salidas_permitidas: 2, created_at: hace(1) },
    ],
    notas_alumno: [
      { id: "demo-n1", alumno_id: "demo-a1", profesor_id: PROFE.id, compartida: false,
        etiqueta: "Finales", texto: "Le cuesta el final de torre: revisarlo en dos semanas.",
        created_at: hace(2), updated_at: hace(2) },
    ],
    encargados: [
      { id: "demo-en1", alumno_id: "demo-a1", nombre: "Marcela Muñoz",
        email: "familia@ejemplo.test", frecuencia: "semanal", activo: true, ultimo_envio_at: hace(3) },
    ],
    formularios: [
      { id: "demo-f1", slug: "torneo-abierto", titulo: "Torneo abierto de la Academia",
        equipo: "Academia", abierto: true, cierre: dentro(20), creado_por: PROFE.id,
        campos: [
          { id: "nombre", etiqueta: "Nombre del alumno", tipo: "texto", obligatorio: true, papel: "alumno_nombre" },
          { id: "correo", etiqueta: "Correo electrónico", tipo: "correo", obligatorio: false, papel: "alumno_correo" },
          { id: "enc", etiqueta: "Nombre de la persona encargada", tipo: "texto", obligatorio: true, papel: "encargado_nombre" },
          { id: "enccorreo", etiqueta: "Correo de la persona encargada", tipo: "correo", obligatorio: true, papel: "encargado_correo" },
        ], created_at: hace(9) },
    ],
    formulario_respuestas: [
      { id: "demo-fr1", formulario_id: "demo-f1", created_at: hace(2), cuenta_id: null,
        respuestas: { nombre: "Ana Jiménez", correo: "", enc: "Rosa Jiménez", enccorreo: "rosa@ejemplo.test" } },
    ],
    archivos_pgn: [
      { id: "demo-g1", titulo: "Position 2, 1 Move", nombre_archivo: "ejercicios-octubre.pgn", created_by: PROFE.id, move_count: 3,
        fen_final: null, pgn: "[Event \"Ejercicio\"]\n1. e4 e5 2. Nf3", created_at: hace(5) },
      { id: "demo-g2", titulo: "Capablanca - Tartakower, 1924", nombre_archivo: "clasicas.pgn", created_by: PROFE.id, move_count: 68,
        fen_final: null, pgn: "[Event \"New York\"]\n1. d4 d5", created_at: hace(20) },
    ],
    tournaments: [
      { id: "demo-to1", name: "Torneo relámpago de octubre", created_by: PROFE.id,
        format: "suizo", variant: "estandar", status: "inscripcion", rounds: 5,
        initial_seconds: 300, increment_seconds: 3, created_at: hace(3) },
    ],
    /* El tablero de la clase. Sin esta fila, `loadGameState()` intenta crearla
       —y el doble no inserta nada— así que la página se queda en «Cargando…»
       para siempre. La posición es la de Lucena, que es la que la guía cuenta
       en el capítulo de la clase en vivo. */
    game_state: [{
      id: "demo-gs", owner_id: PROFE.id,
      start_fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", moves: [],
      arrows: [], circles: [], pieces_hidden: false,
      active_player_id: null, active_player_color: "both",
      shown_curso: null, shown_leccion: null,
    }],
    game_rooms: [],
    desafios: [],
    push_suscripciones: [],
    planes_cobro: [
      { id: "demo-pc1", nombre: "Mensualidad general", monto: 20000, moneda: "CRC", periodicidad: "mensual", activo: true },
    ],
    cobros_vista: [
      { id: "demo-co1", student_id: "demo-a1", consecutivo: "AI-2026-000121", concepto: "Mensualidad de setiembre",
        periodo_inicio: hace(20), periodo_fin: dentro(10), vence: dentro(4), dias_atraso: 0,
        monto: 20000, moneda: "CRC", pagado: 0, saldo: 20000, situacion: "pendiente" },
      { id: "demo-co2", student_id: "demo-a2", consecutivo: "AI-2026-000122", concepto: "Mensualidad de setiembre",
        periodo_inicio: hace(20), periodo_fin: dentro(10), vence: hace(4), dias_atraso: 0,
        monto: 20000, moneda: "CRC", pagado: 20000, saldo: 0, situacion: "pagado" },
    ],
  },
};
DEMO.tablas.profiles = DEMO.perfiles;
DEMO.tablas.class_sessions = DEMO.class_sessions;
DEMO.tablas.tareas = DEMO.tareas;

/* ==========================================================================
   El cliente de Supabase de mentira
   ==========================================================================
   Filtra de verdad por `eq` —un doble que devolviera siempre la tabla entera
   pintaría la ficha de un alumno con las filas de otro— y contesta a cualquier
   tabla que no conozca con una lista vacía, en vez de reventar: una página que
   pida algo que acá no está tiene que seguir pintando su estructura, que es lo
   que se está fotografiando. */
/* El periodo del informe es el mes pasado contado desde HOY, no una fecha
   escrita: con una fija, la captura envejece sola y en tres meses enseña un
   informe de un periodo que no tiene nada que ver — el mismo problema del
   almanaque que ya tuvo `verificar-panel.js`. */
function rpcObjetoConFechas() {
  const copia = JSON.parse(JSON.stringify(DEMO.rpcObjeto));
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  copia.reporte_actividades.desde = primero.toISOString().slice(0, 10);
  copia.reporte_actividades.hasta = hoy.toISOString().slice(0, 10);
  copia.reporte_actividades.generado = hoy.toISOString();
  return copia;
}

/* `ajustes` es lo que deja reusar este doble desde otro verificador sin
   escribir un segundo doble que se iría separando de este a la primera
   corrección (verificar-camino-entrenador.js lo usa con una profesora que NO
   administra, que es justo la cara que las capturas no enseñan). Sin ajustes
   hace exactamente lo de siempre, que es lo que las capturas necesitan. */
function clienteFalso(ajustes) {
  const a = ajustes || {};
  const perfiles = a.perfiles || DEMO.perfiles;
  const yo = a.yo || PROFE;
  const rpc = Object.assign({}, DEMO.rpc, a.rpc || {});
  /* `profiles` se rellena con los perfiles y no es una tabla suelta: quien
     cambia las cuentas tiene que cambiar las dos cosas o la página no
     encuentra a quien dice ser —y eso se ve como «No se pudo cargar tu
     perfil», no como un doble incompleto—. */
  const tablas = Object.assign({}, DEMO.tablas, { profiles: perfiles }, a.tablas || {});
  return `
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  const TABLAS = ${JSON.stringify(tablas)};
  const RPC = ${JSON.stringify(rpc)};
  const RPC_OBJETO = ${JSON.stringify(rpcObjetoConFechas())};
  const YO = ${JSON.stringify(yo.id)};

  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false;
    const valor = (fila, col) => String(col).split(".").reduce((o, k) => (o == null ? o : o[k]), fila);
    const b = {
      select() { return b; },
      eq(col, val) { filas2 = filas2.filter((r) => String(valor(r, col)) === String(val)); return b; },
      neq(col, val) { filas2 = filas2.filter((r) => String(valor(r, col)) !== String(val)); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => vals.map(String).includes(String(valor(r, col)))); return b; },
      gt() { return b; }, gte() { return b; }, lt() { return b; }, lte() { return b; },
      is(col, val) { if (val === null) filas2 = filas2.filter((r) => r[col] === null || r[col] === undefined); return b; },
      not() { return b; }, or() { return b; }, ilike() { return b; }, like() { return b; },
      contains() { return b; }, overlaps() { return b; }, filter() { return b; },
      order(col, opts) {
        const asc = !opts || opts.ascending !== false;
        filas2.sort((x, y) => (String(valor(x, col)) < String(valor(y, col)) ? -1 : 1) * (asc ? 1 : -1));
        return b;
      },
      limit(n) { filas2 = filas2.slice(0, n); return b; },
      range(a, z) { filas2 = filas2.slice(a, z + 1); return b; },
      /* Un insert devuelve la fila que se le mandó, no null: las páginas que
         crean su fila al entrar (el tablero de la clase, por ejemplo) la
         insertan y la vuelven a leer con single(), y con null revientan con
         "Cannot read properties of null" dejando la pantalla en Cargando. */
      insert(fila) { filas2 = [Object.assign({ id: "demo-nuevo" }, Array.isArray(fila) ? fila[0] : fila)]; return b; },
      upsert(fila) { return b.insert(fila); },
      update() { return b; }, delete() { return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      csv() { return b; },
      then(res, rej) {
        let d = filas2;
        if (unica) d = filas2.length ? filas2[0] : null;
        return Promise.resolve({ data: d, error: null, count: filas2.length }).then(res, rej);
      },
      catch(f) { return Promise.resolve({ data: filas2, error: null }).catch(f); },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: YO, email: ${JSON.stringify(yo.email)} }, access_token: "demo" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: YO, email: ${JSON.stringify(yo.email)} } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    rpc: (n) => (n in RPC_OBJETO
      ? { then: (res, rej) => Promise.resolve({ data: RPC_OBJETO[n], error: null }).then(res, rej) }
      : constructor(n, RPC[n] || [])),
    functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; },
                      track() { return Promise.resolve(); }, presenceState: () => ({}), send() {} }),
    removeChannel: () => {},
  };
  window.PERFILES_DEMO = PERFILES;
})();
`;
}

/* ==========================================================================
   Qué se fotografía
   ==========================================================================
   `espera` es el selector que dice que la página ya terminó de montarse. Sin
   él la foto sale del esqueleto —la pantalla de «Comprobando tu sesión…»— y
   eso no da ningún error: se guarda un JPEG perfectamente válido de una página
   que no había cargado. */
const PAGINAS = [
  { slug: "login", url: "/login.html", espera: "form, input[type=password]", sesion: false },
  { slug: "panel", url: "/clases.html", espera: "#tile-grid" },
  { slug: "sesion", url: "/sesion.html", espera: "#board, .board" },
  { slug: "planes", url: "/planes.html", espera: "main" },
  { slug: "tareas", url: "/tareas.html", espera: "main" },
  { slug: "examenes", url: "/examenes.html", espera: "main" },
  { slug: "informes", url: "/informes.html", espera: "main" },
  { slug: "cursos-academia", url: "/cursos/academia/index.html", espera: "main" },
  { slug: "entreno", url: "/entreno/index.html", espera: "main" },
  { slug: "estudio", url: "/entreno/estudio.html", espera: "main" },
  { slug: "temas", url: "/entreno/temas.html", espera: "main" },
  { slug: "aperturas", url: "/entreno/aperturas.html", espera: "main" },
  { slug: "diagnostico", url: "/entreno/diagnostico.html", espera: "main", sesion: false },
  { slug: "arbitraje", url: "/arbitraje.html", espera: "main" },
  { slug: "juegos", url: "/juegos.html", espera: "main" },
  { slug: "torneos", url: "/torneos.html", espera: "main" },
  { slug: "partidas", url: "/partidas.html", espera: "main" },
  { slug: "logros", url: "/logros.html", espera: "main" },
  { slug: "bot", url: "/bot.html", espera: "main", sesion: false },
  { slug: "lector-planilla", url: "/lector-planilla.html", espera: "main" },
  { slug: "formularios", url: "/formularios.html", espera: "main" },
  { slug: "cobros", url: "/cobros.html", espera: "main" },
  /* El reporte pinta su vista previa a partir del periodo del formulario, que
     al entrar está vacío: sin rellenarlo, la captura sale diciendo «del
     undefined al undefined». Se le ponen las fechas, que es lo primero que
     hace quien arma un informe. */
  /* El informe se pinta al apretar «Traer»: la página abre con el formulario y
     la vista previa vacía, y una captura de eso no enseña lo que el apartado
     está contando. Las fechas ya vienen puestas (el mes en curso). */
  { slug: "reportes", url: "/reportes.html", espera: "main",
    antes: () => { const b = document.getElementById("traer"); if (b) b.click(); } },
  { slug: "admin", url: "/admin.html", espera: "main" },
  { slug: "configuracion", url: "/configuracion.html", espera: "main" },
];

/* Lo que descalifica una captura. Son las pantallas de espera y de rechazo:
   todas se fotografían igual de bien que la página de verdad. */
const NO_SIRVE = [
  /comprobando tu sesión/i,
  /necesitas iniciar sesión/i,
  /acceso denegado/i,
  /esta página es de coordinación/i,
  /solo para quien coordina/i,
  /cargando/i,
];

/* Y esto descalifica una captura por lo contrario: la pantalla cargó entera y
   se ve bien, pero uno de los números salió «undefined». Pasa cuando los datos
   de demostración traen un campo con otro nombre que el que la página lee —así
   salió la primera captura de Informes, con tres tarjetas diciendo undefined— y
   no da ningún error: la foto se guarda y el fallo se descubre proyectada.
   Se busca en TODO el texto de la pantalla, no en el principio. */
const NUMEROS_ROTOS = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/];

async function capturar(navegador, pagina) {
  const ctx = await navegador.newContext({
    viewport: PANTALLA,
    deviceScaleFactor: 1.5,        // que el texto de la captura no salga borroso al imprimir
    serviceWorkers: "block",       // al recargar sirve él los archivos y no pasan por las rutas
    colorScheme: "light",
  });
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());

  await ctx.route("**/cdn.jsdelivr.net/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/cdnjs.cloudflare.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));

  /* chess.js se sirve DE VERDAD desde node_modules, y esta ruta va DESPUÉS de
     las dos de arriba a propósito: playwright resuelve la última que se
     registró, así que puesta antes la tapaba la de cdnjs y la clase en vivo se
     quedaba en «Cargando…» para siempre —su tablero no llega a montarse— sin
     dar ningún error. Es la misma razón por la que `verificar-planes.js` lo
     sirve en lugar de simularlo. */
  await ctx.route("**/chess.js/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript",
                body: fs.readFileSync(path.join(RAIZ, "node_modules/chess.js/chess.js"), "utf8") }));

  if (pagina.sesion !== false) {
    await ctx.route("**/js/supabase-client.js", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso() }));
  }

  const page = await ctx.newPage();
  let problema = null;
  try {
    await page.goto(BASE + pagina.url, { waitUntil: "networkidle", timeout: 30000 });
    if (pagina.espera) {
      await page.waitForSelector(pagina.espera, { timeout: 12000 }).catch(() => {});
    }
    if (pagina.antes) {
      await page.evaluate(pagina.antes);
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(1200);   // que terminen las animaciones de entrada

    /* Si la página se fue al login, la foto sería del formulario de acceso con
       el nombre de otra pantalla debajo. Es el fallo callado de esto. */
    const donde = new URL(page.url()).pathname;
    if (pagina.sesion !== false && /login\.html$/.test(donde) && !/login/.test(pagina.slug)) {
      problema = "se fue a login.html";
    }

    const texto = (await page.evaluate(() => document.body.innerText || "")).trim();
    if (!problema && texto.length < 150) problema = `casi no tiene texto (${texto.length} caracteres)`;
    if (!problema) {
      const malo = NO_SIRVE.find((re) => re.test(texto.slice(0, 400)));
      if (malo) problema = `la pantalla dice ${malo}`;
    }
    if (!problema) {
      const roto = NUMEROS_ROTOS.find((re) => re.test(texto));
      if (roto) problema = `hay un ${roto} en la pantalla (falta un dato de demostración)`;
    }

    if (!problema) {
      fs.mkdirSync(SALIDA, { recursive: true });
      await page.screenshot({
        path: path.join(SALIDA, pagina.slug + ".jpg"),
        type: "jpeg", quality: 76,
      });
    }
  } catch (e) {
    problema = String(e.message || e).split("\n")[0];
  }
  await ctx.close();

  /* Si la captura no sirve, se borra la que hubiera de antes. Dejarla sería lo
     peor de los dos mundos: la corrida avisa de que falló y el generador
     encuentra el archivo igual, así que la guía sale con la pantalla vieja
     —la que tenía el «undefined»— y nadie se entera. */
  if (problema) {
    const viejo = path.join(SALIDA, pagina.slug + ".jpg");
    if (fs.existsSync(viejo)) { fs.unlinkSync(viejo); problema += " · se borró la captura anterior"; }
  }
  return problema;
}

/* Se exporta para poder depurar una página suelta con EL MISMO doble que usan
   las capturas: uno escrito aparte para depurar se separa del de verdad y se
   termina arreglando un problema que no existe. */
module.exports = { clienteFalso, capturar, PAGINAS, DEMO, PROFE, ALUMNOS };
if (require.main !== module) return;

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  const lista = SOLO.length ? PAGINAS.filter((p) => SOLO.includes(p.slug)) : PAGINAS;
  const fallaron = [];
  for (const pagina of lista) {
    const problema = await capturar(navegador, pagina);
    if (problema) {
      fallaron.push({ slug: pagina.slug, problema });
      console.log(`  ✗ ${pagina.slug.padEnd(18)} ${problema}`);
    } else {
      const kb = Math.round(fs.statSync(path.join(SALIDA, pagina.slug + ".jpg")).size / 1024);
      console.log(`  ✓ ${pagina.slug.padEnd(18)} ${kb} KB`);
    }
  }
  await navegador.close();

  console.log(`\n${lista.length - fallaron.length} de ${lista.length} capturas en img/guia/`);
  if (fallaron.length) {
    console.log("Sin captura: " + fallaron.map((f) => f.slug).join(", "));
    console.log("La guía lo dice en vez de dejar un hueco, pero conviene mirarlo.");
  }
})();
