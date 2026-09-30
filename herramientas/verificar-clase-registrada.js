/* Que dar una clase la deje REGISTRADA, sin que el profesor tenga que
   acordarse de nada.
 *
 * Existe porque esto se rompe de la peor manera posible: en silencio y sin
 * vuelta atrás. La asistencia, los minutos en clase, el informe que le llega a
 * la casa y el reporte de actividades cuelgan TODOS de que haya una fila
 * abierta en `class_sessions`. Esa fila la abría un botón que vive en el panel
 * (clases.html), mientras que la clase se da en sesion.html — y al tablero se
 * entra directo desde el grid del panel, sin pasar por esa franja. Un
 * entrenador nuevo da su clase entera, con la pizarra y las preguntas, y nada
 * de eso queda: no da ningún error, la clase simplemente no existió, y eso no
 * se puede reconstruir después.
 *
 * Cinco cosas, por cinco peligros distintos:
 *
 *   1. QUE NO SE INVENTEN CLASES. Entrar a preparar algo no es dar clase: con
 *      el profesor solo, sin alumnos y sin tocar nada, no puede abrirse
 *      ninguna. Si se abriera al entrar, el registro se llenaría de clases de
 *      dos minutos que nadie dio y los informes contarían de más.
 *
 *   2. QUE SE ABRA SOLA AL ENTRAR UN ALUMNO. Es el momento en que hay alguien
 *      del otro lado, o sea el momento a partir del cual su asistencia importa.
 *
 *   3. QUE SE ABRA SOLA AL MANDAR UNA POSICIÓN. Una clase puede empezar antes
 *      de que se conecte nadie; las tres puertas del sitio pasan por
 *      aplicarPosicionEnClase(), así que alcanza con mirar esa.
 *
 *   4. QUE NO SE ABRAN DOS. Los dos disparadores pueden caer juntos. Con dos
 *      filas abiertas la asistencia se reparte entre las dos y cada informe
 *      cuenta la mitad — sin que nada falle. Acá se comprueba que la página
 *      pida UNA sola; que sea imposible de verdad lo garantiza el índice único
 *      parcial de la base (class_sessions_una_abierta_por_profesor), que no se
 *      puede probar contra un Supabase de mentira.
 *
 *   5. QUE LA FRANJA DIGA LA VERDAD. Un entrenador nuevo tiene que poder ver de
 *      un vistazo si se está registrando o no, ESCRITO y no con un color. Se
 *      mide el `display` que calcula el navegador, no la clase — la lección que
 *      dejó el cartel de instalar la app, que llevaba `hidden` puesto y salía
 *      igual.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       npm install playwright chess.js@0.10.3
 *       node herramientas/verificar-clase-registrada.js                      */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");


const PROFE = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false,
                full_name: "Karina Rojas", email: "karina@x.cr", grupo: null,
                invitaciones_max: 5, invitaciones_usadas: 0 };
const ALUMNA = { id: "u-ana", role: "alumno", is_admin: false, es_coordinador: false,
                 full_name: "Ana Rojas", email: "ana@x.cr", grupo: "7B" };

/* El Supabase de mentira. Apunta cada insert y cada update con su tabla y su
   filtro, que es lo único que se puede comprobar de verdad: lo que la página
   MANDA. Y el canal de presencia se puede empujar a mano desde la prueba
   (window.__entraAlumno) para simular que se conecta alguien — sin eso no hay
   forma de probar el disparador que más importa. */
function clienteFalso(quien, claseAbierta, semilla) {
  return `
window.__inserts = [];
window.__updates = [];
window.__deletes = [];
(function () {
  const PERFILES = ${JSON.stringify([PROFE, ALUMNA])};
  const SESIONES = ${JSON.stringify(claseAbierta ? [claseAbierta] : [])};
  // Filas de arranque para las tablas que la prueba quiera sembrar (mensajes de
  // chat, por ejemplo): así se puede ver una conversación con algo dentro.
  const SEMILLA = ${JSON.stringify(semilla || {})};
  const GAME_STATE = [{
    id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, last_move: null,
    arrows: [], circles: [], active_player_id: null, active_player_color: "both",
    shown_curso: null, shown_leccion: null, updated_by: "u-profe",
    updated_at: new Date().toISOString(),
  }];
  let nuevas = 0;

  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, pend = null, condiciones = [], porActualizar = null, porBorrar = false;
    let contar = false, soloContar = false;
    const b = {
      // select("id", { count: "exact", head: true }): cuenta sin traer filas,
      // como PostgREST. Sin esto el doble no contesta cuántas hay.
      select(_cols, opts) { if (opts && opts.count) contar = true; if (opts && opts.head) soloContar = true; return b; },
      eq(col, val) { condiciones.push([col, val]); filas2 = filas2.filter((r) => String(r[col]) === String(val)); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => vals.map(String).includes(String(r[col]))); return b; },
      is(col, val) { if (val === null) filas2 = filas2.filter((r) => r[col] === null || r[col] === undefined); return b; },
      // .not("ended_at", "is", null): las que sí tienen valor.
      not(col, op, val) { if (op === "is" && val === null) filas2 = filas2.filter((r) => r[col] !== null && r[col] !== undefined); return b; },
      gte() { return b; }, lte() { return b; }, or() { return b; },
      order() { return b; }, limit() { return b; }, range() { return b; },
      insert(fila) {
        window.__inserts.push({ tabla: tabla, fila: fila });
        nuevas += 1;
        pend = Object.assign({ id: "sesion-" + nuevas, started_at: new Date().toISOString(), created_at: new Date().toISOString(), ended_at: null }, fila);
        // Como ligar_a_la_clase_abierta: la pregunta nueva queda en la clase abierta.
        if (tabla === "questions" && !pend.class_session_id) {
          const abierta = SESIONES.find((c) => !c.ended_at);
          if (abierta) pend.class_session_id = abierta.id;
        }
        // La fila nueva entra a la tabla: una segunda consulta tiene que
        // encontrarla, como en la base de verdad.
        (filas || []).push(pend);
        filas2 = [pend];
        return b;
      },
      upsert(fila) { window.__inserts.push({ tabla: tabla, fila: fila, upsert: true }); pend = fila; return b; },
      // El filtro se apunta al RESOLVER y no acá: .update(x).eq("id", y)
      // encadena, así que en este momento condiciones todavía está vacío y el
      // doble daría por bueno un cierre sobre la clase que no era.
      update(campos) { pend = null; porActualizar = campos; return b; },
      // Igual que update: el filtro se apunta al RESOLVER, porque
      // .delete().eq(...) encadena y acá condiciones todavía está vacío. Y borra
      // de verdad de la tabla, para que una consulta posterior no encuentre lo
      // que ya no existe — es justo lo que hay que poder comprobar al vaciar una
      // conversación del chat.
      delete() { pend = null; porBorrar = true; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        if (porBorrar) {
          window.__deletes.push({ tabla: tabla, donde: condiciones.slice() });
          for (const fila of filas2) {
            const i = (filas || []).indexOf(fila);
            if (i >= 0) filas.splice(i, 1);
          }
          filas2 = [];
          porBorrar = false;
        }
        if (porActualizar) {
          window.__updates.push({ tabla: tabla, campos: porActualizar, donde: condiciones.slice() });
          // Como la base: el update cambia TODAS las filas que cumplen el filtro, no
          // solo la primera (un envío a toda la ronda lo dejaría en evidencia).
          filas2.forEach((f) => Object.assign(f, porActualizar));
          porActualizar = null;
        }
        let d = pend !== null && pend !== undefined ? (unica ? pend : [pend]) : filas2;
        if (unica && Array.isArray(d)) d = d.length ? d[0] : null;
        const cuantas = filas2.length;
        if (soloContar) d = null;
        return Promise.resolve({ data: d, error: null, count: contar ? cuantas : null }).then(res, rej);
      },
    };
    return b;
  }

  const TABLAS = {
    profiles: PERFILES, game_state: GAME_STATE, class_sessions: SESIONES,
    variant_nodes: [], questions: [], question_answers: [], question_engine_answers: [],
    class_attendance: [], class_presence_log: [], practice_sessions: [], practice_games: [], game_rooms: [],
    class_chat_messages: [], saved_games: [], archivos_pgn: [], planes_clase: [], plan_items: [],
    notas_alumno: [], trofeos_ajustes: [], insignias: [], respuestas_en_curso: [],
    // El enlace para invitados sin cuenta (verificar-clase-invitados.js).
    clase_enlaces: [], clase_espectadores: [],
    // El catálogo es de la base (insignias_tipos): dos de muestra alcanzan.
    insignias_tipos: [
      { tipo: "buen_estudiante", nombre: "Estrella de buen estudiante", emoji: "⭐", descripcion: "Por su actitud.", orden: 1 },
      { tipo: "buena_respuesta", nombre: "Buena respuesta", emoji: "💡", descripcion: "Por resolver bien.", orden: 2 },
    ],
  };
  for (const t of Object.keys(SEMILLA)) TABLAS[t] = SEMILLA[t].slice();
  TABLAS.preguntas_clave = TABLAS.preguntas_clave || [];
  TABLAS.clase_elegidos = TABLAS.clase_elegidos || [];
  // Para que una prueba cambie la base «desde otra pantalla» (el profe muestra
  // los resultados) y después avise con __cambioEnBase, como haría Realtime.
  window.__tablas = TABLAS;

  // El canal de presencia se puede empujar desde la prueba: __entraAlumno()
  // hace lo que haría Realtime cuando alguien se conecta a la clase.
  let estado = {};
  const oyentes = { presence: [], broadcast: [], pg: {} };
  window.__cambioEnBase = function (tabla, fila, evento) {
    (oyentes.pg[tabla] || []).forEach((f) => f({ eventType: evento || "UPDATE", new: fila, old: {} }));
  };
  // Un mensaje difundido por el canal de la presencia (lo que manda el profe
  // con send({type:"broadcast"}): bajar una mano, la Fotografía), como Realtime.
  window.__difundir = function (evento, payload) {
    oyentes.broadcast.forEach((o) => { if (!o.evento || o.evento === evento) o.f({ event: evento, payload }); });
  };
  window.__entraAlumno = function () {
    estado["u-ana"] = [{ email: "ana@x.cr", full_name: "Ana Rojas", role: "alumno", online_at: new Date().toISOString() }];
    oyentes.presence.forEach((f) => f());
  };
  // Un aviso de presencia SIN nadie nuevo: es el que llega solo, una y otra vez,
  // mientras los alumnos de la clase que se acaba de cerrar todavía no cierran su
  // pestaña. Es distinto de que entre alguien que no estaba.
  window.__avisoDePresencia = function () { oyentes.presence.forEach((f) => f()); };
  // Alguien de supervisión se pone a mirar la clase (sesion.html?observar=).
  window.__entraSupervision = function () {
    estado["u-sup"] = [{ email: "marta@x.cr", full_name: "Marta Solano", role: "supervision", online_at: new Date().toISOString() }];
    oyentes.presence.forEach((f) => f());
  };
  // Cualquier presencia a mano (o quitarla, con meta null): lo que otra persona
  // anuncia de sí misma, como a quién está mirando el profe en la práctica.
  window.__presencia = function (clave, meta) {
    if (meta) estado[clave] = [meta]; else delete estado[clave];
    oyentes.presence.forEach((f) => f());
  };
  // Cualquier presencia a mano (una mano levantada con su hora, por ejemplo).
  window.__ponerPresencia = function (key, meta) {
    estado[key] = [meta];
    oyentes.presence.forEach((f) => f());
  };
  window.__entraOtroAlumno = function () {
    estado["u-beto"] = [{ email: "beto@x.cr", full_name: "Beto Mora", role: "alumno", online_at: new Date().toISOString() }];
    oyentes.presence.forEach((f) => f());
  };

  // Lo que hizo cada alumno en UNA clase, contado como la base (resumen_de_la_clase).
  function resumenDeLaClase(clase) {
      const pq = TABLAS.questions.filter((q) => q.class_session_id === clase).map((q) => q.id);
      const ps = TABLAS.practice_sessions.filter((q) => q.class_session_id === clase).map((q) => q.id);
      const resp = TABLAS.question_answers.filter((a) => pq.includes(a.question_id));
      const prac = TABLAS.practice_games.filter((g) => ps.includes(g.session_id));
      // Cada partida entre alumnos cuenta para los dos, desde su lado.
      const lados = [];
      TABLAS.game_rooms.filter((r) => r.class_session_id === clase).forEach((r) => {
        lados.push({ id: r.white_id, res: r.result === "white" ? "g" : r.result === "black" ? "p" : r.result === "draw" ? "t" : null });
        lados.push({ id: r.black_id, res: r.result === "black" ? "g" : r.result === "white" ? "p" : r.result === "draw" ? "t" : null });
      });
      // Los turnos de palabra (al azar o por mano levantada) y cómo respondió.
      const turn = (TABLAS.clase_elegidos || []).filter((e) => e.class_session_id === clase);
      const gente = [...new Set(TABLAS.class_attendance.filter((a) => a.session_id === clase).map((a) => a.student_id)
        .concat(resp.map((a) => a.student_id), prac.map((g) => g.student_id), lados.map((l) => l.id), turn.map((e) => e.student_id)))]
        .filter((id) => id !== "u-profe");
      const filas = gente.map((id) => {
        const p = PERFILES.find((x) => x.id === id) || {};
        const r = resp.filter((a) => a.student_id === id), g = prac.filter((x) => x.student_id === id);
        // Las preguntas de todos y las dirigidas a él; las de otro, no.
        const suyas = TABLAS.questions.filter((q) => pq.includes(q.id) && (!q.para_alumno || q.para_alumno === id)).length;
        return { student_id: id, nombre: p.full_name || p.email || "Alumno", preguntas: suyas,
          respondidas: r.length, correctas: r.filter((a) => a.is_correct === true).length,
          incorrectas: r.filter((a) => a.is_correct === false).length, sin_calificar: r.filter((a) => a.is_correct == null).length,
          practicas: g.length, ganadas: g.filter((x) => x.status === "checkmate_win").length,
          tablas: g.filter((x) => x.status === "draw").length,
          perdidas: g.filter((x) => x.status === "checkmate_loss" || x.status === "resigned" || x.status === "timeout").length,
          partidas: lados.filter((l) => l.id === id).length, partidas_ganadas: lados.filter((l) => l.id === id && l.res === "g").length,
          partidas_tablas: lados.filter((l) => l.id === id && l.res === "t").length, partidas_perdidas: lados.filter((l) => l.id === id && l.res === "p").length,
          turnos: turn.filter((e) => e.student_id === id).length, turnos_bien: turn.filter((e) => e.student_id === id && e.resultado === "bien").length,
          turnos_casi: turn.filter((e) => e.student_id === id && e.resultado === "casi").length };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre));
      return filas;
  }
  const QUIEN = ${JSON.stringify(quien)};
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(quien)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    /* clase_abierta sale de las MISMAS filas que la tabla, como en la base:
       mis_clases() la calcula con un left join contra class_sessions. Un
       doble que la dejara fija en false le cerraría al alumno una clase que sí
       está abierta —hoy es lo que decide si puede entrar— y una que la dejara
       siempre en true daría por buena una página sin candado.

       Y la columna se llama "profesor", no "profesor_nombre": con el nombre
       equivocado la pantalla de espera diría «Tu profe» y la prueba daría por
       bueno algo que en producción no se ve así. */
    /* Los trofeos se CUENTAN como en la base (trofeos_de): respuestas
       marcadas correctas de ese alumno más la suma de sus ajustes. Y
       ajustar_trofeos agrega el ajuste de verdad a la tabla, para que la
       cuenta siguiente lo vea. Cada llamada queda anotada en __rpcs. */
    rpc: (n, args) => {
      (window.__rpcs = window.__rpcs || []).push({ n: n, args: args || {} });
      /* Las insignias, como en la base: otorgar_insignia agrega la fila,
         quitar_insignia la borra y premios_de_alumno las cuenta por tipo. */
      if (n === "otorgar_insignia") {
        const fila = { id: "ins-" + (TABLAS.insignias.length + 1), alumno_id: args.p_alumno, tipo: args.p_tipo,
          motivo: args.p_motivo || "", otorgada_por: ${JSON.stringify(quien)}, created_at: new Date().toISOString() };
        TABLAS.insignias.push(fila);
        return constructor(n, [fila]);
      }
      if (n === "quitar_insignia") {
        const i = TABLAS.insignias.findIndex((r) => r.id === args.p_id);
        if (i >= 0) TABLAS.insignias.splice(i, 1);
        return constructor(n, [true]);
      }
      if (n === "premios_de_alumno") {
        const alumno = args.p_alumno;
        const porClase = TABLAS.question_answers.filter((r) => r.student_id === alumno && r.is_correct === true).length;
        const ajustes = TABLAS.trofeos_ajustes.filter((r) => r.alumno_id === alumno).reduce((a, r) => a + r.cantidad, 0);
        const suyas = TABLAS.insignias.filter((r) => r.alumno_id === alumno);
        const porTipo = TABLAS.insignias_tipos.map((t) => {
          const k = suyas.filter((r) => r.tipo === t.tipo).length;
          return { tipo: t.tipo, nombre: t.nombre, emoji: t.emoji, periodo: k, total: k };
        }).filter((x) => x.total > 0);
        const ultimas = suyas.slice().reverse().slice(0, 5).map((r) => {
          const t = TABLAS.insignias_tipos.find((x) => x.tipo === r.tipo) || {};
          return { id: r.id, tipo: r.tipo, nombre: t.nombre, emoji: t.emoji, motivo: r.motivo, fecha: r.created_at };
        });
        const total = Math.max(0, porClase + ajustes);
        // Devuelve un objeto (jsonb), no una lista de filas: como PostgREST.
        const premios = { trofeos_periodo: total, trofeos_total: total, insignias_periodo: suyas.length,
          insignias_total: suyas.length, insignias: porTipo, ultimas: ultimas };
        return { then(res, rej) { return Promise.resolve({ data: { premios: premios }, error: null }).then(res, rej); } };
      }
      if (n === "trofeos_de" || n === "ajustar_trofeos") {
        const alumno = (args && args.p_alumno) || ${JSON.stringify(quien)};
        if (n === "ajustar_trofeos") {
          TABLAS.trofeos_ajustes.push({ id: "aj-" + TABLAS.trofeos_ajustes.length, alumno_id: alumno,
            cantidad: args.p_cantidad, motivo: args.p_motivo || "", created_at: new Date().toISOString() });
        }
        const porClase = TABLAS.question_answers.filter((r) => r.student_id === alumno && r.is_correct === true).length;
        const ajustes = TABLAS.trofeos_ajustes.filter((r) => r.alumno_id === alumno).reduce((a, r) => a + r.cantidad, 0);
        return constructor(n, [{ por_clase: porClase, ajustes: ajustes, total: Math.max(0, porClase + ajustes) }]);
      }
      /* Lo que hizo cada alumno en una clase, contado de las MISMAS tablas
         como en la base: sin trigger en el doble, las preguntas y prácticas
         sembradas traen su class_session_id. */
      /* Las preguntas de opciones, como en la base: la pregunta en questions y
         la correcta aparte (preguntas_clave), que el alumno no lee. */
      if (n === "hacer_pregunta_de_opciones") {
        TABLAS.questions.forEach((q) => { if (q.created_by === ${JSON.stringify(quien)} && !q.closed_at) q.closed_at = new Date().toISOString(); });
        const q = { id: "qo-" + (TABLAS.questions.length + 1), fen: args.p_fen, prompt: args.p_prompt, created_by: ${JSON.stringify(quien)},
          expected_plies: 1, tipo: "opciones", opciones: args.p_opciones, tiempo_limite: args.p_tiempo_limite,
          resultados_visibles: false, sin_tablero: !!args.p_sin_tablero, created_at: new Date().toISOString(), closed_at: null,
          class_session_id: (SESIONES.find((c) => !c.ended_at) || {}).id || null };
        TABLAS.questions.push(q);
        if (args.p_correcta !== null && args.p_correcta !== undefined) TABLAS.preguntas_clave.push({ question_id: q.id, correcta: args.p_correcta });
        return constructor(n, [q]);
      }
      /* Lo que contestó el grupo, sin nombres: quien la hizo lo ve siempre; los
         alumnos, solo con resultados_visibles. */
      if (n === "resultados_de_la_pregunta") {
        const q = TABLAS.questions.find((x) => x.id === args.p_pregunta);
        if (!q || !(q.created_by === ${JSON.stringify(quien)} || q.resultados_visibles)) return constructor(n, []);
        const resp = TABLAS.question_answers.filter((a) => a.question_id === q.id);
        const clave = (TABLAS.preguntas_clave.find((k) => k.question_id === q.id) || {}).correcta;
        let filas;
        if (q.tipo === "opciones") {
          filas = q.opciones.map((_, i) => ({ respuesta: String(i), cuantos: resp.filter((a) => a.opcion === i).length,
            es_correcta: clave === undefined ? null : clave === i }));
        } else {
          const cuenta = {};
          resp.forEach((a) => { const m = (a.moves || [])[0]; if (m) cuenta[m] = (cuenta[m] || 0) + 1; });
          filas = Object.keys(cuenta).map((k) => ({ respuesta: k, cuantos: cuenta[k], es_correcta: null }))
            .sort((a, b) => b.cuantos - a.cuantos || a.respuesta.localeCompare(b.respuesta));
        }
        return constructor(n, filas);
      }
      // La pregunta de salida: la última marcada de esa clase, contada como la base.
      if (n === "salida_de_la_clase") {
        const q = TABLAS.questions.filter((x) => x.class_session_id === args.p_clase && x.de_salida)
          .sort((x, y) => String(y.created_at || "").localeCompare(String(x.created_at || "")))[0];
        if (!q) return constructor(n, []);
        const a = TABLAS.question_answers.filter((x) => x.question_id === q.id);
        const porOpcion = q.tipo === "opciones" && !a.some((x) => x.is_correct != null);
        const asistentes = TABLAS.class_attendance.filter((x) => x.session_id === args.p_clase && x.student_id !== "u-profe").length;
        return constructor(n, [{ question_id: q.id, prompt: q.prompt, tipo: q.tipo, asistentes, respondieron: a.length,
          bien: a.filter((x) => porOpcion ? x.opcion === 0 : x.is_correct === true).length,
          medio: a.filter((x) => porOpcion && x.opcion === 1).length,
          mal: a.filter((x) => porOpcion ? x.opcion >= 2 : x.is_correct === false).length,
          sin_calificar: a.filter((x) => !porOpcion && x.is_correct == null).length }]);
      }
      /* El enlace para invitados, como en la base: uno vigente por profe;
         cambiarlo o apagarlo borra a sus invitados; sacar a uno lo bloquea. */
      const objeto = (d) => ({ then(res, rej) { return Promise.resolve({ data: d, error: null }).then(res, rej); } });
      if (n === "clase_enlace_obtener" || n === "clase_enlace_apagar") {
        if (n === "clase_enlace_apagar" || args.p_nuevo) {
          TABLAS.clase_enlaces.forEach((e) => { if (!e.apagado_at) e.apagado_at = new Date().toISOString(); });
          TABLAS.clase_espectadores.length = 0;
          if (n === "clase_enlace_apagar") return objeto(null);
        }
        let e = TABLAS.clase_enlaces.find((x) => !x.apagado_at);
        if (!e) { e = { id: "enl-" + (TABLAS.clase_enlaces.length + 1), owner_id: QUIEN, token: "tok" + (TABLAS.clase_enlaces.length + 1), apagado_at: null }; TABLAS.clase_enlaces.push(e); }
        return objeto({ token: e.token });
      }
      if (n === "clase_enlace_adaptado") {
        const i = TABLAS.clase_espectadores.find((x) => x.id === args.p_espectador && !x.bloqueado_at);
        if (i) i.adaptado = !!args.p_adaptado;
        return objeto(null);
      }
      if (n === "clase_enlace_sacar") {
        const i = TABLAS.clase_espectadores.find((x) => x.id === args.p_espectador);
        if (i && !i.bloqueado_at) i.bloqueado_at = new Date().toISOString();
        return objeto(null);
      }
      if (n === "resumen_de_la_clase") return constructor(n, resumenDeLaClase(args.p_clase));
      /* Los puntos del mes: la suma de resumen_de_la_clase de las clases de
         este mes (del profe que se pide), y solo filas de quien pregunta o de
         una clase suya, como la base. */
      if (n === "resumen_del_mes") {
        const desde = new Date(); desde.setDate(1); desde.setHours(0, 0, 0, 0);
        const clases = SESIONES.concat(TABLAS.clases_del_mes || []).filter((c) => new Date(c.started_at) >= desde
          && (!args.p_profesor || c.created_by === args.p_profesor));
        const suma = {};
        const CAMPOS = ["respondidas", "correctas", "turnos_bien", "turnos_casi", "ganadas", "tablas", "partidas_ganadas", "partidas_tablas"];
        clases.forEach((c) => resumenDeLaClase(c.id).forEach((f) => {
          if (f.student_id !== QUIEN && c.created_by !== QUIEN) return;
          const x = suma[f.student_id] = suma[f.student_id] || { student_id: f.student_id, nombre: f.nombre, clases: 0 };
          x.clases += 1;
          CAMPOS.forEach((k) => { x[k] = (x[k] || 0) + (f[k] || 0); });
        }));
        return constructor(n, Object.values(suma));
      }
      // Una semilla puede traer sus propias clases (un alumno con dos profes).
      if (n === "mis_clases" && TABLAS.mis_clases) return constructor(n, TABLAS.mis_clases);
      return constructor(n, n === "mis_clases"
      ? [{ profesor_id: "u-profe", profesor: "Karina Rojas", es_principal: true,
           clase_abierta: SESIONES.some((c) => c.created_by === "u-profe" && !c.ended_at) }]
      : n === "alumnos_del_profesor"
      ? [{ id: "u-ana", full_name: "Ana Rojas", email: "ana@x.cr" }]
      : []);
    },
    channel: (nombre) => ({
      on(tipo, ev, f) {
        if (tipo === "presence") oyentes.presence.push(typeof ev === "function" ? ev : f);
        if (tipo === "broadcast") oyentes.broadcast.push({ evento: ev && ev.event, f });
        // Los cambios de la base también se pueden empujar desde la prueba
        // (window.__cambioEnBase), como haría Realtime: así se comprueba lo que
        // pasa en la pantalla del ALUMNO cuando el profesor mueve.
        if (tipo === "postgres_changes" && ev && ev.table) {
          (oyentes.pg[ev.table] = oyentes.pg[ev.table] || []).push(f);
          // Con qué filtro escucha cada canal: es lo que decide qué le llega.
          (window.__escuchas = window.__escuchas || []).push({ canal: nombre, tabla: ev.table, evento: ev.event, filtro: ev.filter || null });
        }
        return this;
      },
      subscribe(cb) { if (cb) cb("SUBSCRIBED"); return this; },
      // Lo que cada uno anuncia de sí mismo al conectarse: con qué rol entra.
      track(meta) { (window.__tracks = window.__tracks || []).push(meta); return Promise.resolve(); },
      untrack() { return Promise.resolve(); },
      // Lo que se difunde queda anotado (window.__difusiones), para ver qué mandó el profe.
      send(msg) { (window.__difusiones = window.__difusiones || []).push(msg); return Promise.resolve(); },
      presenceState: () => estado,
    }),
    removeChannel: () => {},
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

/* `modoSencillo` es la preferencia guardada en el aparato: por defecto "0"
   (todas las herramientas, como quien ya da clases), para que las pruebas de
   siempre encuentren cada botón. `null` no guarda nada y deja que decida la
   cuenta de clases, que es lo que prueba verificar-sesion-orden.js. */
async function abrir(browser, quien, claseAbierta, semilla, opciones) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const modo = opciones && "modoSencillo" in opciones ? opciones.modoSencillo : "0";
  await ctx.addInitScript((m) => {
    try {
      if (m === null) localStorage.removeItem("sesion_modo_sencillo_v1");
      else localStorage.setItem("sesion_modo_sencillo_v1", m);
    } catch (e) {}
  }, modo);
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(quien, claseAbierta, semilla) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + ((opciones && opciones.ruta) || "/sesion.html"), { waitUntil: "domcontentloaded" });
  /* O la sesión, o la pantalla de espera: desde que la clase la abre el
     profesor, un alumno sin clase abierta NO monta #app — y esperarlo a secas
     dejaría la prueba colgada treinta segundos por algo que es lo correcto. */
  await page.waitForSelector("#app:not(.hidden), #sin-clase:not(.hidden)", { timeout: 30000 });
  return { page, ctx, errores };
}

const seVe = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  return el && getComputedStyle(el).display !== "none" ? "sí" : "no";
}, id);

const sesionesAbiertas = (page) => page.evaluate(() =>
  window.__inserts.filter((i) => i.tabla === "class_sessions").length);

async function pruebaSinAlumnos(browser) {
  console.log("\n=== El profesor entra solo: no se inventa ninguna clase ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", null);
  await page.waitForSelector("#clase-estado:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(600);

  igual("no se abre ninguna clase por entrar", await sesionesAbiertas(page), 0);
  igual("la franja se ve de verdad", await seVe(page, "clase-estado"), "sí");
  /* Y dice la CONSECUENCIA, no el mecanismo: mientras no la abra, sus alumnos
     no pueden entrar y no se registra nada. Un «todavía no hay clase abierta»
     a secas no le dice a un entrenador nuevo que la clase que está por dar no
     la va a ver nadie. */
  const franja = await page.textContent("#clase-estado-texto");
  igual("y dice con todas las letras que no hay clase",
    /todavía no está abierta/.test(franja) ? "lo dice" : franja, "lo dice");
  igual("…y que por eso sus alumnos no pueden entrar",
    /no pueden entrar/.test(franja) ? "lo dice" : franja, "lo dice");
  igual("ofrece abrirla a mano", await seVe(page, "clase-abrir-btn"), "sí");
  igual("y no ofrece cerrar lo que no está abierto", await seVe(page, "clase-cerrar-btn"), "no");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Antes la clase la abría el primer alumno que se conectaba, y eso es
   justamente lo que se quitó: la sesión en vivo empieza cuando el profesor la
   abre. El disparador de presencia dejaba dos agujeros a la vez — un alumno
   asomándose un domingo abría una clase que nadie dio, y al cerrar, el aviso
   siguiente la reabría porque los alumnos no cierran su pestaña en el mismo
   segundo, dejando una fila abierta que crece sola hasta el día siguiente. */
async function pruebaLaAbreElProfesor(browser) {
  console.log("\n=== La clase la abre el profesor, no el alumno que entra ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", null);
  await page.waitForSelector("#clase-estado:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(400);
  igual("antes de nada, ninguna", await sesionesAbiertas(page), 0);

  await page.evaluate(() => window.__entraAlumno());
  await page.waitForTimeout(800);
  igual("que se conecte un alumno NO abre ninguna clase", await sesionesAbiertas(page), 0);
  await page.evaluate(() => window.__entraOtroAlumno());
  await page.waitForTimeout(800);
  igual("ni que se conecte un segundo", await sesionesAbiertas(page), 0);
  igual("…y la franja sigue diciendo que está cerrada",
    (await page.textContent("#clase-estado-texto")).includes("todavía no está abierta") ? "lo dice" : "no", "lo dice");

  // La puerta que sí existe: el botón. Es un acto deliberado suyo.
  await page.click("#clase-abrir-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "class_sessions"), null, { timeout: 8000 });
  igual("el botón sí la abre", await sesionesAbiertas(page), 1);
  igual("y queda a nombre de quien da la clase", await page.evaluate(() =>
    window.__inserts.find((i) => i.tabla === "class_sessions").fila.created_by), "u-profe");

  await page.waitForFunction(() =>
    document.getElementById("clase-estado-texto").textContent.includes("Clase en curso"), null, { timeout: 8000 });
  igual("la franja lo dice y nombra lo que se está registrando",
    (await page.textContent("#clase-estado-texto")).includes("asistencia") ? "lo dice" : await page.textContent("#clase-estado-texto"),
    "lo dice");
  igual("y ahora ofrece cerrarla", await seVe(page, "clase-cerrar-btn"), "sí");

  /* Un segundo aviso de presencia no puede abrir una segunda clase: con dos
     abiertas la asistencia se reparte y cada informe cuenta la mitad. */
  await page.evaluate(() => window.__entraAlumno());
  await page.waitForTimeout(500);
  igual("un aviso de presencia con la clase abierta no abre otra", await sesionesAbiertas(page), 1);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaMandaPosicion(browser) {
  console.log("\n=== El profesor manda una posición: la clase se abre sola ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", null);
  await page.waitForSelector("#clase-estado:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(400);

  // Las tres puertas del sitio pasan por aplicarPosicionEnClase(): alcanza con
  // mirar esa, que es justamente por lo que existe esa función única.
  await page.evaluate(() => aplicarPosicionEnClase("8/8/8/4k3/8/4K3/4P3/8 w - - 0 1"));
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "class_sessions"), null, { timeout: 8000 });
  igual("mandar una posición abre la clase", await sesionesAbiertas(page), 1);

  // Y una posición que la clase en vivo RECHAZA no puede abrir una clase: sería
  // registrar una clase que no se dio por un intento que falló.
  await page.evaluate(() => { window.__inserts.length = 0; });
  await page.evaluate(() => aplicarPosicionEnClase("8/8/8/8/8/8/8/KK6 w - - 0 1"));
  await page.waitForTimeout(500);
  igual("una posición rechazada no abre ninguna", await sesionesAbiertas(page), 0);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaClaseYaAbierta(browser) {
  console.log("\n=== Con la clase ya abierta ===");
  const abierta = { id: "s-1", title: null, created_by: "u-profe", ended_at: null,
                    started_at: "2026-09-20T15:00:00Z", notes: null };
  const { page, ctx, errores } = await abrir(browser, "u-profe", abierta);
  await page.waitForFunction(() =>
    document.getElementById("clase-estado-texto").textContent.includes("Clase en curso"), null, { timeout: 10000 });

  igual("no se abre una segunda", await sesionesAbiertas(page), 0);

  // La clase se cierra CON alumnos conectados, que es como pasa de verdad: el
  // profesor confirma el cierre y ellos todavía tienen la pestaña abierta.
  await page.evaluate(() => window.__entraAlumno());
  await page.waitForTimeout(500);
  igual("con la clase ya abierta, que entre un alumno no abre otra", await sesionesAbiertas(page), 0);

  // Cerrar pide primero el nombre y la nota: así no se cierra de un clic
  // accidental en medio de la clase, y se recoge lo único que hace falta para
  // que el registro sirva de algo después.
  igual("los campos arrancan escondidos", await seVe(page, "clase-cerrar-campos"), "no");
  await page.click("#clase-cerrar-btn");
  igual("el primer toque los destapa", await seVe(page, "clase-cerrar-campos"), "sí");
  igual("y todavía no cerró nada", await page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "class_sessions").length), 0);

  await page.fill("#clase-titulo", "Finales de rey y peón");
  await page.fill("#clase-notas", "Se trabó la oposición; repasar el jueves.");
  await page.click("#clase-cerrar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "class_sessions"), null, { timeout: 8000 });

  const cierre = await page.evaluate(() => window.__updates.find((u) => u.tabla === "class_sessions"));
  igual("cierra la clase que estaba abierta", (cierre.donde.find((d) => d[0] === "id") || [])[1], "s-1");
  igual("con su título", cierre.campos.title, "Finales de rey y peón");
  igual("con lo que se trabajó", cierre.campos.notes, "Se trabó la oposición; repasar el jueves.");
  igual("y con la hora de cierre puesta", cierre.campos.ended_at ? "sí" : "no", "sí");

  await page.waitForFunction(() =>
    document.getElementById("clase-estado-texto").textContent.includes("todavía no está abierta"), null, { timeout: 8000 });
  igual("y la franja vuelve a decir la verdad", "lo dice", "lo dice");
  igual("y se dice que quedó guardada, con su nombre", await page.evaluate(() =>
    document.getElementById("status-banner").textContent.includes("Finales de rey y peón") ? "lo dice" : document.getElementById("status-banner").textContent), "lo dice");

  /* Lo que de verdad se rompía callado: cerrar y que se volviera a abrir sola.
     Los alumnos no cierran su pestaña en el mismo segundo, así que el aviso de
     presencia siguiente encontraba gente conectada y abría una clase NUEVA — que
     el profesor, ya de salida, dejaba abierta para siempre. Y con esa fila abierta
     el índice único impide abrir la del día siguiente: la clase de mañana se cuelga
     de la fantasma y en el registro no aparece ninguna nueva.

     Hoy no hay con qué reabrirla sin querer —la presencia dejó de abrir clases—
     pero la comprobación se queda: el día que a alguien se le ocurra volver a
     enganchar ahí un disparador, esto salta en vez de descubrirse al día
     siguiente con la clase de hoy sin registrar. */
  const abiertasAntes = await sesionesAbiertas(page);
  await page.evaluate(() => window.__avisoDePresencia());
  await page.waitForTimeout(600);
  igual("un aviso de presencia después de cerrar NO reabre la clase",
    (await sesionesAbiertas(page)) - abiertasAntes, 0);
  await page.evaluate(() => window.__entraAlumno());
  await page.waitForTimeout(600);
  igual("ni el mismo alumno que ya estaba conectado",
    (await sesionesAbiertas(page)) - abiertasAntes, 0);
  await page.evaluate(() => window.__entraOtroAlumno());
  await page.waitForTimeout(600);
  igual("ni uno que entra después: la clase la vuelve a abrir SU profesor",
    (await sesionesAbiertas(page)) - abiertasAntes, 0);
  await page.waitForFunction(() =>
    document.getElementById("clase-estado-texto").textContent.includes("todavía no está abierta"), null, { timeout: 8000 });
  igual("y la franja sigue diciendo que está cerrada", "lo dice", "lo dice");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* La otra mitad del candado, y la que se rompe callado: si la pantalla del
   alumno siguiera montándose sin clase abierta, no daría ningún error — la RLS
   simplemente no le entrega `game_state` y él vería un tablero vacío sin
   entender por qué. Lo que tiene que pasar es que se le diga, con el nombre de
   quien tiene que abrirla. */
async function pruebaAlumnaSinClase(browser) {
  console.log("\n=== La alumna entra sin clase abierta ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", null);
  await page.waitForTimeout(800);

  igual("no se le monta la sesión", await seVe(page, "app"), "no");
  igual("se le dice que todavía no hay clase, y se VE de verdad",
    await page.evaluate(() => document.getElementById("sin-clase").checkVisibility() ? "sí" : "no"), "sí");
  // Con el nombre: «tu profe» a secas no le dice a quién esperar cuando tiene
  // más de uno, y es el dato con el que decide si se queda o se va.
  igual("…con el nombre de quien tiene que abrirla",
    (await page.textContent("#sin-clase-texto")).includes("Karina Rojas") ? "lo dice" : await page.textContent("#sin-clase-texto"),
    "lo dice");
  igual("y desde ahí puede volverse al panel",
    await page.evaluate(() => !!document.querySelector("#sin-clase a[href='clases.html']")), "true");

  /* Lo que ya no puede pasar: que entrar él abra la clase. Era el disparador
     de antes, y con él un alumno asomándose un domingo le dejaba al profesor
     una clase en el registro que crecía sola. */
  igual("y entrar NO le abre ninguna clase al profesor", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "class_sessions").length), 0);
  // Ni se le pide el tablero: la RLS no se lo daría igual, pero pedirlo sería
  // montar media pantalla para tirarla.
  igual("ni se le pide el tablero, que la base no le va a dar", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "game_state").length), 0);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== A la alumna no se le pinta nada de esto ===");
  const abierta = { id: "s-1", title: null, created_by: "u-profe", ended_at: null,
                    started_at: "2026-09-20T15:00:00Z", notes: null };
  const { page, ctx, errores } = await abrir(browser, "u-ana", abierta);
  await page.waitForTimeout(1200);

  igual("no ve la franja de clase", await seVe(page, "clase-estado"), "no");
  igual("ni puede abrir ni cerrar ninguna", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "class_sessions").length
    + window.__updates.filter((u) => u.tabla === "class_sessions").length), 0);
  // Lo que SÍ tiene que pasarle: que su asistencia quede marcada sola.
  igual("pero su asistencia sí se marca sola", await page.evaluate(() =>
    window.__inserts.some((i) => i.tabla === "class_attendance") ? "sí" : "no"), "sí");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* El Supabase de mentira y el arranque de la página los reusa
   verificar-sesion-orden.js: dos copias del mismo doble se irían separando a la
   primera corrección, igual que las tres maquetas de la guía del profesor. */
module.exports = { clienteFalso, abrir, igual, PROFE, ALUMNA, CHROME, BASE, fallos: () => fallos };

if (require.main !== module) return;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaSinAlumnos(browser);
    await pruebaLaAbreElProfesor(browser);
    await pruebaMandaPosicion(browser);
    await pruebaClaseYaAbierta(browser);
    await pruebaAlumnaSinClase(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: la clase queda registrada sin acordarse de nada.");
  process.exit(fallos ? 1 : 0);
})();
