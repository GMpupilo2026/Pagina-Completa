/* Comprueba los exámenes: que el alumno no pueda ver las respuestas, que
   una oportunidad sea una, que el reloj y los avisos sean del servidor, y
   que la nota pondere por dificultad.

   Dos partes, por dos peligros distintos:

   1. EL BANCO, sin navegador. Que al pasar una pregunta del banco al
      examen la clave siga apuntando a la respuesta correcta DESPUÉS de
      barajar las opciones, y que lo que el alumno va a ver no traiga la
      respuesta escondida. Un barajado que mueva el texto y no el índice
      califica mal TODO el examen sin dar ningún error: los alumnos
      reprueban y nadie sabe por qué.

   2. LAS PÁGINAS, en un navegador de verdad. Que el ejecutor no pinte la
      respuesta, que responder pase a la siguiente sin dejar volver, que
      el reloj salga de la hora del servidor y no de la computadora, y
      que salir de la ventana se le cuente al servidor.

   Lo que NO se comprueba acá: que la base califique bien y que el alumno
   no pueda hacerse trampa. Eso se comprobó impersonando roles en SQL
   contra el proyecto de verdad — el alumno no puede leer examen_items,
   no puede regalarse tiempo, el segundo intento sobre la misma pregunta
   se rechaza y pasado el tiempo el examen se cierra solo.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-examenes.js                            */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const CHESSJS = fs.readFileSync(require.resolve("chess.js"), "utf8");

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "k@x.cr" };
const ALUMNA = { id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "a@x.cr" };

/* Un examen de tres preguntas, tal como lo devolvería examen_para_alumno():
   CON lo visible y SIN ninguna clave. Que el doble no tenga las respuestas
   es parte de la prueba: si la página las necesitara para algo, se caería. */
const EXAMEN = {
  id: "ex-1",
  titulo: "Examen de finales",
  instrucciones: "Sin ayuda.",
  minutos: 3,
  estado: "asignado",
  vence_at: new Date(Date.now() + 2 * 86400000).toISOString(),
  iniciado_at: null,
  termina_at: null,
  ahora: new Date().toISOString(),
  salidas: 0,
  items: [
    { id: "it-1", orden: 0, tipo: "opcion", area: "finales", peso: 1,
      visible: { enunciado: "¿Qué es un peón pasado?",
                 opciones: ["El que no tiene peones rivales delante ni al lado.",
                            "El que quedó clavado por un alfil.",
                            "El que ya coronó.",
                            "El que está en su casilla inicial."], fen: null } },
    { id: "it-2", orden: 1, tipo: "casilla", area: "finales", peso: 3,
      visible: { enunciado: "Haz clic en la casilla de la oposición.",
                 fen: "8/8/4k3/8/8/4K3/8/8 w - - 0 1" } },
    { id: "it-3", orden: 2, tipo: "jugada", area: "reglas", peso: 2,
      visible: { enunciado: "Enroca corto con las blancas.",
                 fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5" } },
  ],
  respondidas: [],
};

function clienteFalso(usuario, examen, opts) {
  return `
window.__llamadas = [];
(function () {
  const YO = ${JSON.stringify(usuario)};
  const PERFILES = ${JSON.stringify([PROFE, ALUMNA])};
  let EX = ${JSON.stringify(examen)};
  const OPTS = ${JSON.stringify(opts || {})};

  function tabla(nombre) {
    const anotado = { tabla: nombre, eq: {}, update: null, delete: false };
    window.__llamadas.push(anotado);
    let filas = nombre === "profiles" ? PERFILES.slice() : [];
    let unica = false;
    const b = {
      select() { return b; },
      eq(c, v) { anotado.eq[c] = v; filas = filas.filter((r) => String(r[c]) === String(v)); return b; },
      order() { return b; },
      single() { unica = true; return b; },
      then(res) { res({ data: unica ? (filas[0] || null) : filas, error: null }); },
      update(c) { anotado.update = c; return { eq(k, v) { anotado.updateEq = { k, v }; return Promise.resolve({ data: null, error: null }); } }; },
      delete() { anotado.delete = true; return { eq() { return Promise.resolve({ data: null, error: null }); } }; },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: (n) => tabla(n),
    functions: { invoke: (n, o) => { window.__llamadas.push({ fn: n, body: o && o.body }); return Promise.resolve({ data: { enviados: 1 }, error: null }); } },
    rpc: function (nombre, args) {
      window.__llamadas.push({ rpc: nombre, args: args });
      if (nombre === "examen_para_alumno") {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(EX)), error: null });
      }
      if (nombre === "iniciar_examen") {
        // El servidor manda: la hora y el fin salen de acá, no del reloj
        // de la computadora. OPTS.desfase deja simularlo corrido.
        const ahora = new Date(Date.now() + (OPTS.desfase || 0));
        EX.estado = "en_curso";
        EX.termina_at = new Date(ahora.getTime() + (OPTS.segundos != null ? OPTS.segundos * 1000 : EX.minutos * 60000)).toISOString();
        EX.iniciado_at = ahora.toISOString();
        return Promise.resolve({ data: { estado: "en_curso", termina_at: EX.termina_at, ahora: ahora.toISOString() }, error: null });
      }
      if (nombre === "responder_examen") {
        EX.respondidas.push({ item_id: args.p_item });
        return Promise.resolve({ data: { guardada: true }, error: null });
      }
      if (nombre === "registrar_salida_examen") {
        EX.salidas += 1;
        const congelado = EX.salidas >= 3;
        if (congelado) EX.estado = "congelado";
        return Promise.resolve({ data: { salidas: EX.salidas, congelado: congelado,
          avisos_restantes: Math.max(0, 3 - EX.salidas), estado: EX.estado }, error: null });
      }
      if (nombre === "cerrar_examen") {
        EX.estado = "entregado";
        return Promise.resolve({ data: { nota: 5 }, error: null });
      }
      if (nombre === "examen_informe") {
        return Promise.resolve({ data: OPTS.informe || {
          id: EX.id, titulo: EX.titulo, alumno: "Ana Rojas", alumno_id: "u-ana",
          estado: "entregado", motivo_cierre: "entregado",
          nota: 6.67, puntos: 4, puntos_posibles: 6, porcentaje: 66.67,
          respondidas: 2, total_items: 3, salidas: 2, segundos_fuera: 45,
          areas: [{ area: "finales", preguntas: 2, aciertos: 1, puntos: 1, posibles: 4, porcentaje: 25 },
                  { area: "reglas", preguntas: 1, aciertos: 1, puntos: 2, posibles: 2, porcentaje: 100 }],
          preguntas: [
            { orden: 0, area: "finales", peso: 1, tipo: "opcion", enunciado: "¿Qué es un peón pasado?",
              respondida: true, correcta: true, puntos: 1, segundos: 12, respuesta: { opcion: "0" }, clave: null, explica: null },
            { orden: 1, area: "finales", peso: 3, tipo: "casilla", enunciado: "Oposición",
              respondida: true, correcta: false, puntos: 0, segundos: 30, respuesta: { casilla: "e5" }, clave: null, explica: null },
            { orden: 2, area: "reglas", peso: 2, tipo: "jugada", enunciado: "Enroca",
              respondida: false, correcta: false, puntos: 0, segundos: null, respuesta: null, clave: null, explica: null },
          ],
        }, error: null });
      }
      if (nombre === "examenes_con_nota") {
        return Promise.resolve({ data: OPTS.lista || [], error: null });
      }
      if (nombre === "crear_examen") {
        return Promise.resolve({ data: (args.p_alumnos || []).length, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
})();
`;
}

async function contexto(navegador, initScript) {
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  await ctx.route("**/chess.min.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.addInitScript(initScript);
  return ctx;
}

async function main() {
  const fallos = [];
  const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

  // ---------- 1) El banco: la clave sigue apuntando a la respuesta ----------
  {
    const win = {};
    const cargar = (f) => new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(win);
    cargar("js/plan-entrenamiento.js");
    cargar("js/diagnostico-items.js");
    cargar("js/arbitraje-items.js");
    cargar("js/aperturas-lineas.js");
    cargar("js/examen-banco.js");
    const B = win.ExamenBanco;
    const porId = {};
    (win.DIAGNOSTICO_ITEMS || []).forEach((i) => { porId[i.id] = i; });

    let revisadas = 0, malClave = 0, filtradas = 0;
    for (let s = 1; s <= 40; s++) {
      const ex = B.armar({ fuente: "areas", areas: [], cantidad: 40, dificultad: { min: 1, max: 5 }, semilla: s });
      ex.forEach((e) => {
        const orig = porId[e.item_id];
        revisadas++;
        // Lo que el alumno va a ver NO puede traer la respuesta. Si se
        // colara, el examen se vería igual y se aprobaría mirando el
        // código — exactamente el fallo que no avisa.
        const visible = JSON.stringify(e.visible);
        if (/"correcta"|"solucion"|"casillas"|"jugadas"/.test(visible)) filtradas++;

        if (e.tipo === "opcion" || e.tipo === "opcion_tablero") {
          // Después de barajar, la clave tiene que seguir señalando el
          // MISMO TEXTO que era correcto en el banco.
          if (orig.opciones[orig.correcta] !== e.visible.opciones[Number(e.clave.correcta)]) malClave++;
        } else if (e.tipo === "jugada") {
          if (!e.clave.jugadas.some((j) => j.from === orig.solucion.from && j.to === orig.solucion.to)) malClave++;
        } else if (e.tipo === "casilla") {
          if (!e.clave.casillas.includes(orig.solucion)) malClave++;
        }
      });
    }
    ok(revisadas > 1000, `esperaba revisar más de mil preguntas, revisé ${revisadas}`);
    ok(malClave === 0, `${malClave} claves NO apuntan a la respuesta correcta después de barajar`);
    ok(filtradas === 0, `${filtradas} preguntas llevan la respuesta dentro de lo que ve el alumno`);

    // La misma semilla da el mismo examen: si no, no se podría rearmar
    // el examen de alguien ni comprobar nada dos veces.
    const a = JSON.stringify(B.armar({ fuente: "curso", curso: "finales-practicos", cantidad: 5, semilla: 7 }));
    const b = JSON.stringify(B.armar({ fuente: "curso", curso: "finales-practicos", cantidad: 5, semilla: 7 }));
    ok(a === b, "con la misma semilla el examen sale distinto");

    // Un curso sin preguntas se DICE, no devuelve un examen vacío.
    let aviso = null;
    try { B.armar({ fuente: "curso", curso: "curso-que-no-existe", cantidad: 5 }); }
    catch (e) { aviso = e.message; }
    ok(!!aviso, "un curso sin preguntas devolvió un examen en vez de decirlo");

    // La dificultad se respeta: es lo que después vale cada pregunta.
    const duras = B.armar({ fuente: "areas", areas: [], cantidad: 10, dificultad: { min: 4, max: 5 }, semilla: 3 });
    ok(duras.every((d) => d.peso >= 4), `pidiendo dificultad 4-5 salieron pesos ${duras.map((d) => d.peso).join(",")}`);
  }

  const navegador = await chromium.launch({ executablePath: CHROME });

  // ---------- 2) El ejecutor: una oportunidad y ninguna respuesta ----------
  {
    const ctx = await contexto(navegador, clienteFalso(ALUMNA, EXAMEN));
    const p = await ctx.newPage();
    await p.goto(`${BASE}/examen.html?id=ex-1`, { waitUntil: "networkidle" });
    await p.waitForSelector("#antesala:not(.hidden)", { timeout: 10000 });

    // La antesala dice las reglas ANTES de empezar: enterarse de que era
    // una sola oportunidad después de contestar es tarde.
    const reglas = (await p.textContent("#antesala")).replace(/\s+/g, " ");
    ok(/una sola oportunidad/i.test(reglas), "la antesala no avisa que es una sola oportunidad");
    ok(/tercera vez|tres veces/i.test(reglas), "la antesala no avisa qué pasa si sale de la ventana");
    ok(/3 preguntas y 3 minutos/i.test(reglas), `la antesala no dice cuántas preguntas y cuánto tiempo: ${reglas.slice(0, 200)}`);

    await p.click("#empezar-btn");
    await p.waitForSelector("#prueba:not(.hidden)", { timeout: 10000 });

    // Ninguna respuesta pintada: la página no las tiene ni las inventa.
    const q1 = await p.textContent("#q-opciones");
    ok(!/correcta|✔|✅/i.test(q1), "el ejecutor está marcando la respuesta correcta");
    const opciones = await p.$$eval("#q-opciones button", (e) => e.map((b) => b.textContent.trim()));
    ok(opciones.length === 4, `esperaba 4 opciones, salieron ${opciones.length}`);
    // Cada opción dice su letra, ESCRITA: con un ::before el lector de
    // pantalla no la diría y quien contesta por el cuadro no sabría cuál.
    ok(/^Opción A\./.test(opciones[0]), `la primera opción no dice su letra: ${opciones[0]}`);

    ok(await p.isDisabled("#responder-btn"), "se puede responder sin haber elegido nada");
    await p.click("#q-opciones button >> nth=1");
    ok(!(await p.isDisabled("#responder-btn")), "después de elegir sigue sin poder responder");

    await p.click("#responder-btn");
    await p.waitForFunction(() => /Pregunta 2 de 3/.test(document.getElementById("q-num").textContent), { timeout: 5000 });

    // Lo que se mandó es la opción que se tocó, y va por el RPC (que es
    // quien califica): si esto se calculara acá, se podría saltar.
    const llamadas = await p.evaluate(() => window.__llamadas.filter((l) => l.rpc === "responder_examen"));
    ok(llamadas.length === 1, `esperaba una llamada a responder_examen, hubo ${llamadas.length}`);
    ok(llamadas[0].args.p_respuesta.opcion === "1",
      `mandó otra opción que la que se tocó: ${JSON.stringify(llamadas[0].args.p_respuesta)}`);
    ok(llamadas[0].args.p_segundos != null, "no manda cuánto tardó en contestar");

    // No hay forma de volver atrás: una oportunidad es una.
    const volver = await p.$("#prueba button:has-text('Anterior')");
    ok(!volver, "el ejecutor deja volver a la pregunta anterior");

    // Segunda pregunta: es de casilla y el tablero tiene que estar.
    ok(await p.isVisible("#q-board"), "la pregunta de casilla no muestra el tablero");
    await p.click("#q-board button[data-square='e4']");
    await p.click("#responder-btn");
    await p.waitForFunction(() => /Pregunta 3 de 3/.test(document.getElementById("q-num").textContent), { timeout: 5000 });
    const l2 = await p.evaluate(() => window.__llamadas.filter((l) => l.rpc === "responder_examen"));
    ok(l2[1].args.p_respuesta.casilla === "e4", `la casilla que mandó no es la que se tocó: ${JSON.stringify(l2[1].args.p_respuesta)}`);

    await ctx.close();
  }

  // ---------- 3) El reloj sale del SERVIDOR ----------
  // Con el reloj de la computadora adelantado una hora, la cuenta atrás
  // tiene que seguir siendo la del servidor. Si la página restara con
  // Date.now() a secas, el examen empezaría ya vencido.
  {
    const ctx = await contexto(navegador, clienteFalso(ALUMNA, EXAMEN, { desfase: -3600000, segundos: 180 }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}/examen.html?id=ex-1`, { waitUntil: "networkidle" });
    await p.waitForSelector("#antesala:not(.hidden)", { timeout: 10000 });
    await p.click("#empezar-btn");
    await p.waitForSelector("#prueba:not(.hidden)", { timeout: 10000 });
    const reloj = await p.textContent("#reloj");
    const [mm, ss] = reloj.split(":").map(Number);
    const seg = mm * 60 + ss;
    ok(seg > 150 && seg <= 180,
      `con la hora de la computadora corrida una hora el reloj debería marcar ~3:00, marcó ${reloj}`);
    await ctx.close();
  }

  // ---------- 4) Salir de la ventana se le cuenta al servidor ----------
  {
    const ctx = await contexto(navegador, clienteFalso(ALUMNA, EXAMEN));
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.alert = () => {}; });
    await p.goto(`${BASE}/examen.html?id=ex-1`, { waitUntil: "networkidle" });
    await p.waitForSelector("#antesala:not(.hidden)", { timeout: 10000 });
    await p.click("#empezar-btn");
    await p.waitForSelector("#prueba:not(.hidden)", { timeout: 10000 });

    // Se simula salir y volver dos veces.
    for (let i = 0; i < 2; i++) {
      await p.evaluate(() => {
        Object.defineProperty(document, "hidden", { value: true, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await p.waitForTimeout(120);
      await p.evaluate(() => {
        Object.defineProperty(document, "hidden", { value: false, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await p.waitForTimeout(250);
    }
    const salidas = await p.evaluate(() => window.__llamadas.filter((l) => l.rpc === "registrar_salida_examen"));
    ok(salidas.length === 2, `esperaba 2 avisos al servidor, hubo ${salidas.length}`);
    ok(salidas.every((s) => s.args.p_examen === "ex-1"), "el aviso no dice de qué examen es");
    // Y se le dice a la persona en pantalla, no solo al servidor.
    const avisos = await p.textContent("#q-avisos");
    ok(/2/.test(avisos) && /congela/i.test(avisos), `el aviso en pantalla no dice cuántas salidas van: ${avisos}`);

    // La tercera congela y el examen se cierra.
    await p.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await p.waitForTimeout(120);
    await p.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await p.waitForSelector("#resultado:not(.hidden)", { timeout: 8000 });
    ok(true, "");
    await ctx.close();
  }

  // ---------- 5) Lo que ve el alumno al terminar: nota sí, respuestas no ----------
  {
    const ctx = await contexto(navegador, clienteFalso(ALUMNA,
      Object.assign({}, EXAMEN, { estado: "entregado" })));
    const p = await ctx.newPage();
    await p.goto(`${BASE}/examen.html?id=ex-1`, { waitUntil: "networkidle" });
    await p.waitForSelector("#resultado:not(.hidden)", { timeout: 10000 });
    const texto = (await p.textContent("#resultado")).replace(/\s+/g, " ");
    ok(/6\.67/.test(texto), `no muestra la nota: ${texto.slice(0, 200)}`);
    ok(/4 de 6 puntos/.test(texto), `no explica de dónde sale la nota: ${texto.slice(0, 250)}`);
    ok(/respondiste 2 de 3/.test(texto), "no dice cuántas alcanzó a responder");
    // Por área sí; la respuesta de cada pregunta NO — el banco se reutiliza.
    ok(/finales/.test(texto) && /reglas/.test(texto), "no muestra el desglose por área");
    ok(!/peón pasado/i.test(texto), "le está mostrando al alumno el enunciado con su corrección");
    await ctx.close();
  }

  // ---------- 6) El profesor: arma, manda y ve el informe ----------
  {
    const lista = [{
      id: "ex-1", profesor_id: "u-profe", profesor_nombre: "Karina Rojas",
      alumno_id: "u-ana", alumno_nombre: "Ana Rojas", titulo: "Examen de finales",
      instrucciones: "", minutos: 10, vence_at: new Date(Date.now() + 86400000).toISOString(),
      estado: "entregado", iniciado_at: null, termina_at: null,
      entregado_at: new Date().toISOString(), motivo_cierre: "entregado",
      salidas: 2, nota: 6.67, porcentaje: 66.67, respondidas: 2, total_items: 3,
      preguntas: 3, created_at: new Date().toISOString(),
    }];
    const ctx = await contexto(navegador, clienteFalso(PROFE, EXAMEN, { lista }));
    const p = await ctx.newPage();
    await p.goto(`${BASE}/examenes.html`, { waitUntil: "networkidle" });
    await p.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
    ok(await p.isVisible("#vista-profesor"), "no se muestra la vista de profesor");

    // El mínimo de un minuto por pregunta se propone antes de mandar.
    await p.selectOption("#e-fuente", "curso");
    await p.waitForTimeout(400);
    await p.fill("#e-cantidad", "12");
    await p.dispatchEvent("#e-cantidad", "input");
    await p.waitForTimeout(200);
    const minMinutos = await p.getAttribute("#e-minutos", "min");
    ok(minMinutos === "12", `con 12 preguntas el mínimo debería ser 12 minutos, es ${minMinutos}`);
    const hay = await p.textContent("#e-hay");
    ok(/Hay \d+/.test(hay), `no dice cuántas preguntas hay para elegir: ${hay}`);

    // Manda el examen y se comprueba QUÉ manda.
    await p.check(".alumno-check >> nth=0");
    await p.fill("#e-vence", new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16));
    await p.click("#poner-btn");
    await p.waitForFunction(() => /puesto a/.test(document.getElementById("form-status").textContent || ""), { timeout: 8000 });
    const creados = await p.evaluate(() => window.__llamadas.filter((l) => l.rpc === "crear_examen"));
    ok(creados.length === 1, `esperaba una llamada a crear_examen, hubo ${creados.length}`);
    if (creados.length) {
      const a = creados[0].args;
      ok(a.p_items.length === 12, `mandó ${a.p_items.length} preguntas en vez de 12`);
      ok(a.p_minutos >= a.p_items.length, "mandó menos minutos que preguntas");
      // CADA pregunta viaja con su clave separada de lo visible: es lo
      // que permite que el alumno reciba una sin la otra.
      ok(a.p_items.every((i) => i.clave && i.visible && i.peso >= 1 && i.peso <= 5),
        "alguna pregunta va sin clave, sin enunciado o sin dificultad");
      ok(a.p_items.every((i) => !/"correcta"|"casillas"/.test(JSON.stringify(i.visible))),
        "alguna pregunta lleva la respuesta dentro de lo visible");
    }

    // El informe: el profesor SÍ ve pregunta por pregunta.
    await p.click(".informe-btn >> nth=0");
    await p.waitForSelector("#dlg-informe[open]", { timeout: 5000 });
    const inf = (await p.textContent("#inf-cuerpo")).replace(/\s+/g, " ");
    ok(/6\.67/.test(inf), "el informe no trae la nota");
    ok(/dificultad/.test(inf), "el informe no dice la dificultad de cada pregunta");
    ok(/peón pasado/i.test(inf), "el informe no lista las preguntas una por una");
    ok(/No alcanzó a contestarla/.test(inf), "el informe no distingue lo fallado de lo que no llegó a contestar");
    ok(/Salió de la ventana 2 veces/.test(inf), "el informe no dice que salió de la ventana");
    await ctx.close();
  }

  // ---------- 7) Que las dos páginas SE VEAN ----------
  // Las dos se armaron clonando la cabecera de tareas.html, y clonar una
  // cabecera ya salió mal más de una vez en este sitio: se cuela el
  // `</style>` de la original y el navegador imprime el resto del CSS como
  // texto, o se queda fuera el script del tema y la página sale siempre
  // clara. Ninguna de las dos cosas da error: la página "funciona".
  {
    for (const caso of [
      { ruta: "examenes.html", listo: "#app:not(.hidden)", quien: PROFE },
      { ruta: "examen.html?id=ex-1", listo: "#antesala:not(.hidden)", quien: ALUMNA },
    ]) {
      const ctx = await contexto(navegador, clienteFalso(caso.quien, EXAMEN, { lista: [] }));
      const p = await ctx.newPage();
      await p.emulateMedia({ colorScheme: "dark" });
      await p.goto(`${BASE}/${caso.ruta}`, { waitUntil: "networkidle" });
      await p.waitForSelector(caso.listo, { timeout: 10000 });

      const cssComoTexto = await p.evaluate(() =>
        Array.from(document.querySelectorAll("body *")).some((el) =>
          el.children.length === 0 && /^\s*[.#]?[\w-]+\s*\{/.test(el.textContent || "")));
      ok(!cssComoTexto, `${caso.ruta}: hay CSS impreso como texto`);

      const estilos = await p.$$eval("style", (e) => e.length);
      ok(estilos <= 1, `${caso.ruta}: debería haber a lo sumo un <style> suelto, hay ${estilos}`);

      const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = fondo.match(/\d+/g).map(Number);
      ok(r + g + b < 300, `${caso.ruta}: con el tema oscuro el fondo debería ser oscuro, salió ${fondo}`);

      await ctx.close();
    }
  }

  await navegador.close();

  if (fallos.length) {
    console.error(`❌ ${fallos.length} fallo(s):\n` + fallos.filter(Boolean).map((f) => "  - " + f).join("\n"));
    process.exit(1);
  }
  console.log("✅ Exámenes: todo bien.");
}

main().catch((e) => { console.error(e); process.exit(1); });
