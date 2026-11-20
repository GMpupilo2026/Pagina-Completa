/* El Supabase de mentira del panel de la Academia (clases.html), de una sola
   copia: lo usan verificar-panel.js y verificar-panel-jornada.js. Filtra y
   corta de verdad y anota cada consulta en window.__consultas (ver la cabecera
   de verificar-panel.js). */
/* 47 clases repartidas en cinco meses: más de una página (van de 20 en 20) y
   más de un mes, que es lo que hace falta para probar el agrupado. */
/* Las clases de mentira se cuelgan de HOY, no de una fecha escrita a mano.
   Con la fecha fija esta prueba se pudría sola: el filtro de "últimos 3 meses"
   se mide contra el día en que se corre, así que cuando el calendario pasaba
   de esa fecha las clases se iban cayendo del filtro de a una y la prueba
   fallaba por el almanaque y no por el código. Con 30 clases cada 3 días entran
   87 días, que siempre caben en los 90 del filtro. */
const HOY = (() => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); })();
function clasesDeMentira() {
  const filas = [];
  for (let i = 0; i < 47; i += 1) {
    const dia = new Date(HOY - i * 3 * 86400000);
    const fin = new Date(dia.getTime() + 60 * 60000);
    filas.push({
      id: "c-" + i,
      created_by: "u-profe",
      title: i === 0 ? "Finales de torre" : "Clase " + i,
      notes: i === 0 ? "repasamos la posición de Lucena" : null,
      started_at: dia.toISOString(),
      ended_at: fin.toISOString(),
      // En la base nunca es null (default 'en_linea'): «Tu última clase» filtra por ella.
      modalidad: "en_linea",
    });
  }
  return filas;
}

/* `datos` trae lo que cada prueba quiere que la base conteste: las tareas del
   alumno y lo que devuelve cada RPC. Sin eso no se puede probar lo que el panel
   AHORA hace, que es pedirle a la base los números ya contados en vez de
   bajarse las tablas y sumarlas acá. */
function clienteFalso(perfiles, usuarioId, clases, datos) {
  return `
window.__consultas = [];
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  const CLASES = ${JSON.stringify(clases)};
  const DATOS = ${JSON.stringify(datos || {})};

  /* Un constructor que de verdad FILTRA y de verdad CORTA, y que además deja
     anotado lo que se le pidió. Un doble que devolviera siempre la tabla entera
     daría por buena una página que no filtra nada. */
  function constructor(tabla, filas, args) {
    const anotado = { tabla: tabla, eq: {}, gte: null, or: null, range: null, limit: null, count: false, args: args || null };
    window.__consultas.push(anotado);
    let filas2 = (filas || []).slice(), unica = false;
    const cmp = (a, b) => String(a) === String(b);
    // "profiles.grupo" es como PostgREST nombra una columna de la tabla
    // relacionada; sin resolver el punto, ese filtro no encuentra nunca nada.
    const valor = (fila, col) => String(col).split(".").reduce((o, k) => (o == null ? o : o[k]), fila);
    const b = {
      select(_cols, opts) { if (opts && opts.count) anotado.count = true; if (opts && opts.head) anotado.head = true; return b; },
      eq(col, val) { anotado.eq[col] = val; filas2 = filas2.filter((r) => cmp(valor(r, col), val)); return b; },
      neq(col, val) { anotado.neq = Object.assign(anotado.neq || {}, { [col]: val }); filas2 = filas2.filter((r) => !cmp(valor(r, col), val)); return b; },
      gte(col, val) { anotado.gte = { col: col, val: val }; filas2 = filas2.filter((r) => String(valor(r, col)) >= String(val)); return b; },
      lt(col, val) { anotado.lt = { col: col, val: val }; filas2 = filas2.filter((r) => String(valor(r, col)) < String(val)); return b; },
      lte(col, val) { anotado.lte = { col: col, val: val }; filas2 = filas2.filter((r) => String(valor(r, col)) <= String(val)); return b; },
      is(col, val) { if (val === null) filas2 = filas2.filter((r) => r[col] === null || r[col] === undefined); return b; },
      not(col, op, val) { if (op === "is" && val === null) filas2 = filas2.filter((r) => r[col] !== null && r[col] !== undefined); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => vals.map(String).includes(String(valor(r, col)))); return b; },
      or(expr) {
        anotado.or = expr;
        // title.ilike.%x%,notes.ilike.%x%
        const partes = String(expr).split(",").map((p) => p.split("."));
        filas2 = filas2.filter((r) => partes.some(([col, op, val]) =>
          op === "ilike" && String(r[col] || "").toLowerCase().includes(String(val).replace(/%/g, "").toLowerCase())));
        return b;
      },
      order(col, opts) {
        const asc = !opts || opts.ascending !== false;
        filas2.sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : 1) * (asc ? 1 : -1));
        return b;
      },
      limit(n) { anotado.limit = n; filas2 = filas2.slice(0, n); return b; },
      range(a, z) { anotado.range = [a, z]; anotado.total = filas2.length; filas2 = filas2.slice(a, z + 1); return b; },
      // Un insert queda anotado (window.__inserts) y devuelve la fila con su id,
      // como PostgREST con .select(): sin id no se puede seguir (un plan y sus renglones).
      insert(fila) {
        window.__inserts = window.__inserts || [];
        window.__inserts.push({ tabla: tabla, fila: fila });
        filas2 = [Object.assign({ id: tabla + "-" + window.__inserts.length }, fila)];
        return b;
      },
      // Como insert: Racha táctica guarda la mejor racha con upsert().
      upsert(fila) {
        window.__upserts = window.__upserts || [];
        window.__upserts.push({ tabla: tabla, fila: fila });
        filas2 = [fila];
        return b;
      },
      update() { return b; },
      delete() { return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = filas2;
        const total = anotado.total !== undefined ? anotado.total : filas2.length;
        if (unica) d = filas2.length ? filas2[0] : null;
        // { head: true } es contar sin traer ninguna fila, como PostgREST.
        if (anotado.head) d = null;
        return Promise.resolve({ data: d, error: null, count: anotado.count ? total : null }).then(res, rej);
      },
    };
    return b;
  }

  /* Un renglón de mis_clases() como lo devuelve la base, con los nombres de
     columna DE VERDAD (la columna se llama profesor, no profesor_nombre: con
     el nombre equivocado el botón diría "tu profe" y la prueba daría por bueno
     algo que en producción no se ve así).

     Y la videollamada SOLO llega con la clase abierta, porque así lo hace
     cumplir la RLS de profesor_videollamada. Un doble que la mandara siempre
     daría por buena una página que ofrece entrar a una llamada que no está
     pasando. */
  /* Se arma CADA VEZ que se pide, y no una sola al inyectar, porque abrir la
     clase en medio de la prueba es justo lo que hay que poder simular: lo que
     se rompe callado es que el aviso llegue y la pantalla no se entere. */
  let claseAbierta = !!DATOS.clase_abierta;
  const MI_CLASE = () => ({ profesor_id: "u-profe", profesor: "Karina Rojas", es_principal: true,
                     clase_abierta: claseAbierta, titulo_clase: null,
                     videollamada: claseAbierta ? (DATOS.videollamada || null) : null });
  window.__abrirClase = () => { claseAbierta = true; };

  const TABLAS = {
    profiles: PERFILES,
    /* Una clase EN CURSO es una fila sin ended_at: la página la busca con
       .is("ended_at", null). Va primera para que el .limit(1) la encuentre. */
    class_sessions: (DATOS.clase_abierta
      ? [{ id: "c-viva", created_by: "u-profe", title: "Finales de torre", notes: null,
           started_at: new Date(Date.now() - 20 * 60000).toISOString(), ended_at: null }]
      : []).concat(CLASES),
    puzzle_rush_scores: DATOS.puzzle_rush_scores || [],
    // El último ejercicio de la alumna (marcarLoUltimo pide UNA fila).
    training_progress: DATOS.training_progress || [],
    // El plan que el profesor le compartió (la RLS solo lo devuelve compartido).
    training_plans: DATOS.training_plans || [],
    /* La sala de videollamada del profesor. Al equipo docente se la sirve esta
       tabla (es SUYA); al alumnado le llega por mis_clases(), que es donde la
       RLS decide si se la entrega. */
    /* Una fila por (profesor, grupo): «» es la sala de todas sus clases.
       Al alumnado no se le sirve de acá —le llega por mis_clases(), que es
       donde la RLS decide cuál le toca—; esto es lo que ve el equipo docente
       de lo SUYO. */
    profesor_videollamada: DATOS.profesor_videollamada || [],
    // Lo que se preguntó en una clase y lo que contestó cada uno («Tu última clase»).
    questions: DATOS.questions || [],
    question_answers: DATOS.question_answers || [],
    solicitudes_academia: DATOS.solicitudes_academia || [],
    // Los recibos que quien supervisa tiene por revisar y entregar.
    recibos: DATOS.recibos || [],
    informes_profesor: DATOS.informes_profesor || [],
    /* La visión que marcó administración (verificar-vision-cuenta.js). */
    vision_personas: DATOS.vision_personas || [],
    // Lo que avisa la tarjeta de Competir: retos sin contestar y torneos de su profe.
    desafios: DATOS.desafios || [],
    tournaments: DATOS.tournaments || [],
    tournament_registrations: DATOS.tournament_registrations || [],
    // Lo que junta la campana del alumno (la RLS le da solo lo suyo).
    tareas: DATOS.tareas || [],
    examenes: DATOS.examenes || [],
    avisos_profesor: DATOS.avisos_profesor || [],
    notas_alumno: DATOS.notas_alumno || [],
    // El horario de quien da clase (asistencia.html → «Tu horario»).
    horario_clases: DATOS.horario_clases || [],
    // La prueba de estilo: su última fecha (a los tres meses, repetirla) y
    // quién ya jugó 5 partidas con la apertura recomendada (la campana del profe).
    estilo_pruebas: DATOS.estilo_pruebas || [],
    estilo_seguimiento: DATOS.estilo_seguimiento || [],
    // Las cuentas que prueban una forma nueva de una pantalla (verificar-panel-jornada.js).
    vistas_en_prueba: DATOS.vistas_en_prueba || [],
  };

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    /* Los RPC contestan lo que la prueba les puso, y pasan por el MISMO
       constructor que las tablas: así quedan anotados en window.__consultas y
       se puede exigir, por ejemplo, que los tres números de Entrenamiento
       salgan de mi_entreno_resumen() y no de bajarse training_progress.

       Un solo profesor en mis_clases: el selector de clase no aparece, que es
       lo correcto. */
    rpc: (n, args, opciones) => {
      /* Una base saturada: la consulta no contesta nunca (colgar) o revienta
         antes de salir (lanzar). pruebaBaseLenta() exige que el panel igual
         aparezca, o que al menos diga qué pasa y ofrezca volver a intentar. */
      if ((DATOS.colgar || []).includes(n)) return new Promise(() => {});
      if ((DATOS.lanzar || []).includes(n)) throw new Error("se cayó " + n);
      if (n === "mis_funciones_coordinacion") {
        return Promise.resolve({ data: (window.__misFunciones || ["formularios","altas","solicitudes","cuentas","acceso","roles","cobros","equipos","subgrupos"]), error: null });
      }
      /* Un RPC que devuelve un valor suelto (un booleano, como
         puedo_preparar_rivales) y no filas: se contesta tal cual. */
      if (DATOS.rpc && DATOS.rpc[n] !== undefined && !Array.isArray(DATOS.rpc[n])) {
        window.__consultas.push({ tabla: n, args: args || null });
        return Promise.resolve({ data: DATOS.rpc[n], error: null });
      }
      const c = constructor(n, n === "mis_clases"
        ? (DATOS.mis_clases || [MI_CLASE()])
        : (DATOS.rpc && DATOS.rpc[n]) || [], args);
      // sb.rpc(nombre, args, { count: "exact", head: true }): cuenta sin traer filas.
      if (opciones && opciones.count) c.select(null, { count: opciones.count });
      if (opciones && opciones.head) window.__consultas[window.__consultas.length - 1].head = true;
      return c;
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}


module.exports = { HOY, clasesDeMentira, clienteFalso };

/*! rev bfb5bbb0d2d82f9f */
