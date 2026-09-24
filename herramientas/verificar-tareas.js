/* Comprueba el área de Tareas: que el profesor arme una tarea con VARIOS
   renglones y sus cantidades, que se mande lo que de verdad se eligió, que el
   alumno la vea con su avance y que la franja de la tarea aparezca DENTRO del
   ejercicio.

   Existe porque tareas.html está DETRÁS DEL LOGIN: verificar-css.js abre las
   páginas sin cuenta, así que nada de esto lo ve nunca.

   Y todo lo que se rompe acá se rompe CALLADO, que es lo que decide qué se
   mira:

   - Un renglón que manda la actividad equivocada (o ninguna) deja la barra
     del alumno clavada en cero para siempre. La página se ve perfecta.
   - Un enlace sin su recorte deja al alumno en la lista de ochenta temas,
     que es justo lo que esta función viene a evitar.
   - Un índice de metas.json que se quedó viejo le ofrece al profesor un tema
     que ya no existe: nadie se entera hasta que el alumno abre el enlace.
   - Ofrecer "cantidad" en una herramienta que no escribe en training_progress
     —Estudio— es una tarea imposible de terminar, sin ningún error.

   Lo que NO se comprueba acá: que la base cuente bien y que el alumno no
   pueda hacerse trampa. Eso se comprobó impersonando roles en SQL contra el
   proyecto de verdad (un update del alumno bajándose la meta de 25 a 1 queda
   revertido; una profesora sin ese alumno recibe cero filas). Acá se
   comprueba la PÁGINA.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-tareas.js                                */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "karina@x.cr" };
const ALUMNA1 = { id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" };
const ALUMNA2 = { id: "u-beto", role: "alumno", is_admin: false, full_name: "Beto Solano", email: "beto@x.cr" };

const AHORA = Date.now();

/* Lo que devolvería public.tareas_con_avance() para la alumna: una tarea con
   tres renglones a medio hacer, una vencida y una ya cumplida. */
const TAREAS_ALUMNA = [
  {
    id: "t-vencida", profesor_id: "u-profe", profesor_nombre: "Karina Rojas",
    alumno_id: "u-ana", alumno_nombre: "Ana Rojas",
    titulo: "Tarea de la semana", instrucciones: "Tómate tu tiempo con los mates.",
    vence_at: new Date(AHORA - 2 * 86400000).toISOString(),
    created_at: new Date(AHORA - 9 * 86400000).toISOString(),
    renglones: 3, cumplidos: 1, situacion: "vencida",
    items: [
      { id: "i-temas", orden: 0, material_tipo: "herramienta", material_slug: "temas",
        material_label: "Ejercicios por tema", material_href: "entreno/temas.html?tema=ultima-linea",
        filtro_clave: "ultima-linea", filtro_label: "Ataque a la última línea", leccion: null,
        meta_tipo: "cantidad", meta_cantidad: 10, hecho: 4, cumplido: false },
      { id: "i-coord", orden: 1, material_tipo: "herramienta", material_slug: "coordenadas",
        material_label: "Coordenadas", material_href: "entreno/coordenadas.html",
        filtro_clave: null, filtro_label: null, leccion: null,
        meta_tipo: "minutos", meta_cantidad: 10, hecho: 12, cumplido: true },
      { id: "i-curso", orden: 2, material_tipo: "curso", material_slug: "fundamentos-del-ajedrez",
        material_label: "Fundamentos del Ajedrez", material_href: "cursos/academia/fundamentos-del-ajedrez.html",
        filtro_clave: null, filtro_label: null, leccion: 3,
        meta_tipo: "completar", meta_cantidad: null, hecho: 0, cumplido: false },
    ],
  },
  {
    id: "t-hecha", profesor_id: "u-profe", profesor_nombre: "Karina Rojas",
    alumno_id: "u-ana", alumno_nombre: "Ana Rojas",
    titulo: "Diagnóstico de nivel", instrucciones: "",
    vence_at: new Date(AHORA + 5 * 86400000).toISOString(),
    created_at: new Date(AHORA - 3 * 86400000).toISOString(),
    renglones: 1, cumplidos: 1, situacion: "completada",
    items: [
      { id: "i-diag", orden: 0, material_tipo: "herramienta", material_slug: "diagnostico",
        material_label: "Diagnóstico de nivel", material_href: "entreno/diagnostico.html",
        filtro_clave: null, filtro_label: null, leccion: null,
        meta_tipo: "completar", meta_cantidad: null, hecho: 1, cumplido: true },
    ],
  },
];

function clienteFalso(perfiles, tareasSeed, usuarioId) {
  return `
window.__llamadas = [];
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  let TAREAS = ${JSON.stringify(tareasSeed)};
  const YO = ${JSON.stringify(usuarioId)};

  function tabla(nombre) {
    let filas = (nombre === "profiles" ? PERFILES : []).slice();
    let unica = false;
    const anotado = { tabla: nombre, eq: {}, order: null, update: null, delete: false };
    window.__llamadas.push(anotado);
    const b = {
      select() { return b; },
      eq(col, val) {
        anotado.eq[col] = val;
        filas = filas.filter((r) => String(r[col]) === String(val));
        return b;
      },
      order(col) { if (anotado.order == null) anotado.order = col; return b; },
      // La página pide de mil en mil (traerTodo): el doble corta igual que PostgREST.
      range(desde, hasta) { filas = filas.slice(desde, hasta + 1); return b; },
      single() { unica = true; return b; },
      then(resolve) { resolve({ data: unica ? (filas[0] || null) : filas, error: null }); },
      update(cambios) {
        anotado.update = cambios;
        return {
          eq(col, val) {
            anotado.updateEq = { col: col, val: val };
            // Marcar un renglón lo da por cumplido, como haría la base.
            if (nombre === "tarea_items") {
              TAREAS.forEach((t) => (t.items || []).forEach((it) => {
                if (String(it[col]) === String(val)) {
                  it.cumplido = !!cambios.completada_at;
                  it.hecho = cambios.completada_at ? 1 : 0;
                }
              }));
              TAREAS.forEach((t) => {
                t.cumplidos = (t.items || []).filter((i) => i.cumplido).length;
                t.situacion = t.cumplidos >= t.renglones ? "completada"
                  : (new Date(t.vence_at) < new Date() ? "vencida" : "pendiente");
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      delete() {
        anotado.delete = true;
        return { eq(col, val) { TAREAS = TAREAS.filter((t) => String(t[col]) !== String(val)); return Promise.resolve({ data: null, error: null }); } };
      },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: YO } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: function () {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: function (nombre) { return tabla(nombre); },
    rpc: function (nombre, args) {
      window.__llamadas.push({ rpc: nombre, args: args });
      if (nombre === "tareas_con_avance") {
        let d = TAREAS.slice();
        if (args && args.p_alumno) d = d.filter((t) => t.alumno_id === args.p_alumno);
        if (args && args.p_profesor) d = d.filter((t) => t.profesor_id === args.p_profesor);
        if (args && args.p_pendientes) d = d.filter((t) => t.situacion !== "completada");
        return Promise.resolve({ data: d, error: null });
      }
      if (nombre === "crear_tarea") {
        return Promise.resolve({ data: (args.p_alumnos || []).length, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
})();
`;
}

/* Las rutas van en el CONTEXTO y no en la página, y el service
   worker se bloquea: lo que pide el service worker no pasa por las rutas de
   una página, así que al recargar volvería el cliente de Supabase de verdad
   y la página moriría con "sb is not defined" (la piedra que ya documentó
   verificar-reportes.js). */

async function contextoEntreno(navegador, initScript) {
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.addInitScript(initScript);
  return ctx;
}

async function main() {
  const fallos = [];
  const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

  // ---------- 0) el índice de metas no se quedó viejo ----------
  // Se compara contra los BANCOS DE VERDAD, no contra una copia: un índice
  // desfasado le ofrece al profesor un tema que ya no existe, y eso no da
  // ningún error — lo descubre el alumno al abrir el enlace y no encontrar
  // nada. Es lo mismo que hace verificar-libro-diagnostico.py leyendo el
  // banco con Node en vez de fiarse de una lista aparte.
  {
    const leer = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p), "utf8"));
    let metas = null;
    try { metas = leer("entreno/data/metas.json"); }
    catch (e) { ok(false, "falta entreno/data/metas.json — corré python3 herramientas/metas-indice.py"); }

    if (metas) {
      const temas = leer("entreno/data/temas.json");
      const clavesReales = new Set(Object.keys(temas.themes || {}).filter((k) => temas.themes[k].length));
      const clavesIndice = new Set((metas.temas || []).map((t) => t.clave));
      const sobran = [...clavesIndice].filter((k) => !clavesReales.has(k));
      const faltan = [...clavesReales].filter((k) => !clavesIndice.has(k));
      ok(!sobran.length, `metas.json ofrece temas que ya no están en temas.json: ${sobran.slice(0, 5).join(", ")}`);
      ok(!faltan.length, `metas.json se quedó sin ${faltan.length} tema(s) que sí están en temas.json: ${faltan.slice(0, 5).join(", ")}`);

      // El total de cada tema es el tope de la cantidad que se puede pedir:
      // si miente, el profesor puede pedir más ejercicios de los que hay y la
      // tarea queda imposible de terminar.
      const malTotal = (metas.temas || []).filter((t) => (temas.themes[t.clave] || []).length !== t.total);
      ok(!malTotal.length, `${malTotal.length} tema(s) con un total que no es el de temas.json (p.ej. ${malTotal[0] && malTotal[0].clave})`);

      // Un tema del grupo de táctica apunta como 'tactica', no como 'temas'.
      // Equivocarlo deja esos ejercicios contando contra cero.
      const gTactica = (temas.groups || []).find((g) => g.id === "tactica");
      const deTactica = new Set(((gTactica && gTactica.themes) || []).map((t) => t.key));
      const malAct = (metas.temas || []).filter((t) =>
        (t.actividades || [])[0] !== (deTactica.has(t.clave) ? "tactica" : "temas"));
      ok(!malAct.length, `${malAct.length} tema(s) con la actividad equivocada (p.ej. ${malAct[0] && malAct[0].clave})`);

      const mates = leer("entreno/data/mates.json");
      const catsReales = new Set(mates.map((m) => m.category));
      ok((metas.mates || []).length === catsReales.size,
        `metas.json trae ${(metas.mates || []).length} categorías de mates y mates.json tiene ${catsReales.size}`);
      (metas.mates || []).forEach((c) => {
        const n = mates.filter((m) => m.category === c.clave).length;
        ok(n === c.total, `la categoría ${c.clave} dice ${c.total} y en mates.json hay ${n}`);
      });
    }
  }

  // ---------- 0 bis) el catálogo no ofrece metas que no se pueden medir ----------
  {
    const src = fs.readFileSync(path.join(RAIZ, "js/material-plataforma.js"), "utf8");
    const win = {};
    new Function("window", src)(win);
    const M = win.MaterialPlataforma;
    ok(M && M.HERRAMIENTAS.length > 0, "js/material-plataforma.js no expone las herramientas");
    if (M) {
      // Pedir "cantidad" cuenta filas de training_progress: una herramienta
      // sin actividades ahí tendría la barra clavada en cero sin que nada
      // avisara. Estudio es justo ese caso, a propósito.
      const rotas = M.HERRAMIENTAS.filter((h) =>
        h.metas.some((m) => m !== "completar") && !(h.actividades || []).length);
      ok(!rotas.length, `herramientas que piden cantidad/minutos sin actividad que contar: ${rotas.map((h) => h.slug).join(", ")}`);
      const estudio = M.herramienta("estudio");
      ok(estudio && !estudio.metas.includes("cantidad"),
        "Estudio no escribe en training_progress: ofrecer 'cantidad' sería una barra que nunca sube");
      ok(M.herramienta("temas").hrefRecorte("x") === "entreno/temas.html?tema=x",
        "el enlace de un tema no lleva el recorte, así que el alumno cae en la lista de ochenta");
    }
  }

  const navegador = await chromium.launch({ executablePath: CHROME });

  // ---------- 1) el profesor arma la tarea con varios renglones ----------
  {
    const pagina = await navegador.newPage();
    await pagina.addInitScript(clienteFalso([PROFE, ALUMNA1, ALUMNA2], [], PROFE.id));
    await pagina.goto(`${BASE}/tareas.html`, { waitUntil: "networkidle" });
    await pagina.waitForSelector("#app:not(.hidden)", { timeout: 10000 });

    ok(await pagina.isVisible("#vista-profesor"), "no se muestra la vista de profesor");
    const alumnosMarcables = await pagina.$$eval(".alumno-check", (els) => els.length);
    ok(alumnosMarcables === 2, `esperaba 2 alumnos marcables, salieron ${alumnosMarcables}`);

    // El selector trae las herramientas Y el catálogo de cursos de verdad.
    const opciones = await pagina.$$eval("#renglones .r-material option", (e) => e.map((o) => o.value));
    ok(opciones.includes("herramienta:temas"), "el selector no trae las herramientas de entrenamiento");
    ok(opciones.some((v) => v.startsWith("curso:")), "el selector no trae el catálogo de cursos");

    // Renglón 1: 10 ejercicios de un tema concreto.
    await pagina.selectOption("#renglones .renglon:nth-of-type(1) .r-material", "herramienta:temas");
    await pagina.waitForSelector("#renglones .renglon:nth-of-type(1) .r-recorte-wrap:not(.hidden)", { timeout: 5000 });
    const temas = await pagina.$$eval("#renglones .renglon:nth-of-type(1) .r-recorte option", (e) => e.map((o) => o.value));
    ok(temas.length > 50, `esperaba los ~80 temas en el selector, salieron ${temas.length}`);
    ok(temas.includes("ultima-linea"), "el selector de temas no trae los temas reales de temas.json");
    await pagina.selectOption("#renglones .renglon:nth-of-type(1) .r-recorte", "ultima-linea");
    await pagina.fill("#renglones .renglon:nth-of-type(1) .r-cantidad", "10");

    // La frase es lo único que el alumno va a leer del renglón: tiene que
    // decir lo que de verdad se está pidiendo.
    const frase = await pagina.textContent("#renglones .renglon:nth-of-type(1) .r-frase");
    ok(/10/.test(frase) && /última línea/i.test(frase),
      `la frase del renglón no dice lo que se pidió: ${JSON.stringify(frase)}`);

    // El tope: no se pueden pedir más ejercicios de los que tiene el tema.
    const tope = await pagina.getAttribute("#renglones .renglon:nth-of-type(1) .r-cantidad", "max");
    const temasJson = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
    ok(String(temasJson.themes["ultima-linea"].length) === tope,
      `el tope de cantidad debería ser ${temasJson.themes["ultima-linea"].length}, salió ${tope}`);

    // Renglón 2: 10 minutos de coordenadas.
    await pagina.click("#agregar-renglon");
    await pagina.waitForSelector("#renglones .renglon:nth-of-type(2)", { timeout: 5000 });
    await pagina.selectOption("#renglones .renglon:nth-of-type(2) .r-material", "herramienta:coordenadas");
    await pagina.selectOption("#renglones .renglon:nth-of-type(2) .r-meta", "minutos");
    await pagina.fill("#renglones .renglon:nth-of-type(2) .r-cantidad", "10");

    // Renglón 3: una lección de un curso. Un curso no se cuenta —sus lecciones
    // no se apuntan una por una en training_progress—, así que su meta es
    // 'completar' y es el ÚNICO caso en el que el alumno marca a mano.
    await pagina.click("#agregar-renglon");
    await pagina.waitForSelector("#renglones .renglon:nth-of-type(3)", { timeout: 5000 });
    const primerCurso = (await pagina.$$eval("#renglones .renglon:nth-of-type(3) .r-material option",
      (e) => e.map((o) => o.value))).find((v) => v.startsWith("curso:"));
    await pagina.selectOption("#renglones .renglon:nth-of-type(3) .r-material", primerCurso);
    await pagina.waitForSelector("#renglones .renglon:nth-of-type(3) .r-leccion-wrap:not(.hidden)", { timeout: 5000 });
    const metasCurso = await pagina.$$eval("#renglones .renglon:nth-of-type(3) .r-meta option", (e) => e.map((o) => o.value));
    ok(JSON.stringify(metasCurso) === JSON.stringify(["completar"]),
      `un curso solo puede pedirse "terminarlo", ofreció ${JSON.stringify(metasCurso)}`);
    ok(!(await pagina.isVisible("#renglones .renglon:nth-of-type(3) .r-cantidad-wrap")),
      "un renglón de 'terminarlo' no debería pedir una cantidad");
    await pagina.fill("#renglones .renglon:nth-of-type(3) .r-leccion", "5");
    const fraseCurso = await pagina.textContent("#renglones .renglon:nth-of-type(3) .r-frase");
    ok(/Estudiar la lección 5/.test(fraseCurso), `la frase del curso no dice la lección: ${JSON.stringify(fraseCurso)}`);
    // El tope de lección es el del curso de verdad, leído del catálogo.
    const topeLec = await pagina.getAttribute("#renglones .renglon:nth-of-type(3) .r-leccion", "max");
    const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, "herramientas/cursos/catalogo.json"), "utf8"));
    const cursoElegido = catalogo.cursos.find((c) => "curso:" + c.slug === primerCurso);
    ok(String(cursoElegido.lecciones) === topeLec,
      `el tope de lección debería ser ${cursoElegido.lecciones}, salió ${topeLec}`);

    const checks = await pagina.$$(".alumno-check");
    for (const c of checks) await c.check();
    await pagina.fill("#t-vence", new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 16));
    await pagina.click("#enviar-btn");
    await pagina.waitForFunction(() => /enviada a 2/.test(document.getElementById("form-status").textContent || ""), { timeout: 5000 });

    const llamadas = await pagina.evaluate(() => window.__llamadas);
    const creadas = llamadas.filter((l) => l.rpc === "crear_tarea");
    ok(creadas.length === 1, `esperaba una sola llamada a crear_tarea, hubo ${creadas.length}`);
    if (creadas.length === 1) {
      const a = creadas[0].args;
      ok(JSON.stringify((a.p_alumnos || []).slice().sort()) === JSON.stringify(["u-ana", "u-beto"]),
        `la tarea no fue a los dos alumnos marcados: ${JSON.stringify(a.p_alumnos)}`);
      const its = a.p_items || [];
      ok(its.length === 3, `esperaba 3 renglones, se mandaron ${its.length}`);
      if (its.length === 3) {
        ok(its[0].material_slug === "temas" && its[0].filtro_clave === "ultima-linea" && its[0].meta_cantidad === 10,
          `el primer renglón no es el que se eligió: ${JSON.stringify(its[0])}`);
        // La actividad del renglón decide TODO el conteo: 'ultima-linea' es
        // del grupo de táctica, así que apunta como 'tactica'. Con 'temas'
        // la barra del alumno no subiría nunca y la página se vería igual.
        ok(JSON.stringify(its[0].actividades) === JSON.stringify(["tactica"]),
          `el renglón de un tema de táctica debe contar 'tactica', mandó ${JSON.stringify(its[0].actividades)}`);
        // El enlace tiene que dejar al alumno DENTRO del tema.
        ok(/\?tema=ultima-linea/.test(its[0].material_href),
          `el enlace del renglón no lleva al tema: ${its[0].material_href}`);
        ok(its[1].meta_tipo === "minutos" && its[1].meta_cantidad === 10 &&
           JSON.stringify(its[1].actividades) === JSON.stringify(["coordenadas"]),
          `el segundo renglón no es "10 minutos de coordenadas": ${JSON.stringify(its[1])}`);
        ok(its[2].material_tipo === "curso" && its[2].meta_tipo === "completar" &&
           String(its[2].leccion) === "5" && !its[2].meta_cantidad,
          `el renglón de curso no es "la lección 5, terminarla": ${JSON.stringify(its[2])}`);
      }
    }

    await pagina.close();
  }

  // ---------- 2) el alumno ve su avance y marca solo lo que le toca ----------
  {
    const pagina = await navegador.newPage();
    await pagina.addInitScript(clienteFalso([PROFE, ALUMNA1], TAREAS_ALUMNA, ALUMNA1.id));
    await pagina.goto(`${BASE}/tareas.html`, { waitUntil: "networkidle" });
    await pagina.waitForSelector("#app:not(.hidden)", { timeout: 10000 });

    ok(await pagina.isVisible("#vista-alumno"), "no se muestra la vista de alumno");
    ok(!(await pagina.isVisible("#vista-profesor")), "a un alumno no le debería aparecer el panel de asignar");

    const pendientes = await pagina.$$eval("#pendientes-lista > div", (e) => e.length);
    ok(pendientes === 1, `esperaba 1 tarea pendiente, salieron ${pendientes}`);
    const completadas = await pagina.$$eval("#completadas-lista > div", (e) => e.length);
    ok(completadas === 1, `esperaba 1 tarea ya completada, salieron ${completadas}`);

    const claseTarjeta = await pagina.getAttribute("#pendientes-lista > div", "class");
    ok(/border-red-500/.test(claseTarjeta), "la tarea vencida no lleva el aviso visual de vencida");

    // Los tres renglones, cada uno con su frase.
    const renglones = await pagina.$$eval("#pendientes-lista li", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
    ok(renglones.length === 3, `esperaba 3 renglones en la tarea, salieron ${renglones.length}`);
    ok(renglones.some((t) => /Resolver 10 ejercicios de Ataque a la última línea/.test(t)),
      `falta el renglón del tema con su cantidad: ${JSON.stringify(renglones)}`);
    ok(renglones.some((t) => /Hacer 10 minutos de Coordenadas/.test(t)),
      `falta el renglón de minutos: ${JSON.stringify(renglones)}`);
    ok(renglones.some((t) => /Estudiar la lección 3 de Fundamentos/.test(t)),
      `falta el renglón del curso con su lección: ${JSON.stringify(renglones)}`);

    // El avance que muestra es el que vino de la base, no uno recalculado acá.
    const barras = await pagina.$$eval("#pendientes-lista [role=progressbar]", (els) =>
      els.map((e) => ({ ahora: e.getAttribute("aria-valuenow"), max: e.getAttribute("aria-valuemax") })));
    ok(barras.length === 2, `esperaba 2 barras (los dos renglones medibles), salieron ${barras.length}`);
    ok(barras[0] && barras[0].ahora === "4" && barras[0].max === "10",
      `la barra del tema debería ir 4 de 10, va ${JSON.stringify(barras[0])}`);

    // Solo el renglón que NO se puede medir ofrece marcarlo a mano. Donde el
    // avance lo cuenta la plataforma, un check no significa nada.
    const marcables = await pagina.$$eval("#pendientes-lista .marcar-item", (e) => e.length);
    ok(marcables === 1, `solo el renglón 'completar' debería ser marcable, hay ${marcables}`);

    // El enlace lleva al ejercicio Y dice de qué tarea viene, que es lo que
    // permite que la propia página de entreno muestre el avance.
    const enlaces = await pagina.$$eval("#pendientes-lista a", (els) => els.map((e) => e.getAttribute("href")));
    ok(enlaces.some((h) => /entreno\/temas\.html\?tema=ultima-linea&tarea=t-vencida/.test(h)),
      `el enlace no lleva al tema con su tarea: ${JSON.stringify(enlaces)}`);

    // Marcar el renglón de curso manda el update a tarea_items, por su id.
    // Ojo: marcar UNO de tres no completa la tarea —eso lo decide la base
    // cuando están los tres—, así que lo que tiene que cambiar es el renglón,
    // no la lista de completadas.
    await pagina.click("#pendientes-lista .marcar-item");
    await pagina.waitForFunction(() => {
      const li = [...document.querySelectorAll("#pendientes-lista li")];
      return li.some((e) => /Estudiar la lección 3/.test(e.textContent) && /✔/.test(e.textContent));
    }, { timeout: 8000 });
    const sigueAbierta = await pagina.$$eval("#pendientes-lista > div", (e) => e.length);
    ok(sigueAbierta === 1, "marcar un renglón de tres no debería dar la tarea entera por hecha");
    const llamadas = await pagina.evaluate(() => window.__llamadas);
    const updates = llamadas.filter((l) => l.tabla === "tarea_items" && l.update);
    ok(updates.length === 1, `esperaba un solo update a tarea_items, hubo ${updates.length}`);
    if (updates.length === 1) {
      ok(updates[0].updateEq && updates[0].updateEq.val === "i-curso",
        `el update fue al renglón equivocado: ${JSON.stringify(updates[0].updateEq)}`);
      ok(!!updates[0].update.completada_at, "el update no manda la marca de completado");
    }
    // Y no se toca `tareas`: el estado de la tarea se calcula, no se guarda.
    const tocaTareas = llamadas.some((l) => l.tabla === "tareas" && l.update);
    ok(!tocaTareas, "el alumno no debería escribir en `tareas`: la situación la calcula la base");

    await pagina.close();
  }

  // ---------- 3) la franja de la tarea, DENTRO del ejercicio ----------
  // Es lo que hace que el alumno no tenga que volver a Tareas a contar si ya
  // hizo los diez. Si no aparece, no falla nada: simplemente hace siete o
  // veinte y nadie se entera.
  {
    const ctx = await contextoEntreno(navegador, clienteFalso([ALUMNA1], TAREAS_ALUMNA, ALUMNA1.id));
    const pagina = await ctx.newPage();
    await pagina.goto(`${BASE}/entreno/coordenadas.html?tarea=t-vencida`, { waitUntil: "networkidle" });
    await pagina.waitForSelector("#tarea-en-curso", { timeout: 15000 });

    const visible = await pagina.evaluate(() => {
      const el = document.getElementById("tarea-en-curso");
      return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    });
    ok(visible, "la franja de la tarea no se ve de verdad dentro del ejercicio");

    const texto = (await pagina.textContent("#tarea-en-curso")).replace(/\s+/g, " ");
    ok(/Coordenadas/.test(texto), `la franja no dice de qué renglón habla: ${JSON.stringify(texto)}`);
    // El avance sale de la base, no de una cuenta propia. Se recorta a la meta
    // a propósito: ese renglón lleva 12 minutos de los 10 que se pidieron, y
    // "12 de 10" se lee como un error.
    ok(/10 de 10 minutos/.test(texto), `la franja no dice el avance que vino de la base: ${JSON.stringify(texto)}`);
    // Ese renglón ya está cumplido: tiene que notarse, no solo por el número.
    const listo = await pagina.evaluate(() => document.getElementById("tarea-en-curso").classList.contains("tarea-lista"));
    ok(listo, "un renglón ya cumplido no se distingue de uno a medias en la franja");

    // Sin ?tarea= no aparece nada: ponerlo en una página de más no cuesta.
    await pagina.goto(`${BASE}/entreno/coordenadas.html`, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(800);
    const sinTarea = await pagina.$("#tarea-en-curso");
    ok(!sinTarea, "la franja aparece sin haber venido de una tarea");

    await ctx.close();
  }

  // ---------- 4) el enlace de la tarea cae DENTRO del tema ----------
  // Sin esto el alumno aterriza en la lista de ochenta temas y tiene que
  // buscar el suyo, que es exactamente lo que esta función viene a evitar.
  {
    const ctx = await contextoEntreno(navegador, clienteFalso([ALUMNA1], TAREAS_ALUMNA, ALUMNA1.id));
    const pagina = await ctx.newPage();
    await pagina.goto(`${BASE}/entreno/temas.html?tema=ultima-linea&tarea=t-vencida`, { waitUntil: "networkidle" });
    await pagina.waitForFunction(() => {
      const v = document.getElementById("play-view");
      return v && v.style.display === "block";
    }, { timeout: 20000 });
    const titulo = await pagina.textContent("#play-title");
    ok(/última línea/i.test(titulo), `?tema= no abrió el tema pedido, abrió: ${JSON.stringify(titulo)}`);
    await pagina.close();

    // Y lo mismo en Mates, que es el otro recorte que se puede pedir ("25
    // mates en 1"). Sin ?cat= la página abre la categoría que tocaba por
    // progreso, que puede no ser la de la tarea.
    const pm = await ctx.newPage();
    await pm.goto(`${BASE}/entreno/mates.html?cat=mate3`, { waitUntil: "networkidle" });
    // Mates no tiene lista y ejercicio: tiene pestañas, y la activa es la que
    // se está haciendo. Se mira la pantalla, no la variable de dentro.
    await pm.waitForSelector("#tabs .tab.active", { timeout: 20000 });
    const tm = (await pm.textContent("#tabs .tab.active")).replace(/\s+/g, " ");
    ok(/3/.test(tm), `?cat=mate3 no abrió esa categoría, abrió: ${JSON.stringify(tm)}`);
    await pm.close();
    await ctx.close();
  }

  // ---------- 5) que la página se vea ----------
  {
    const pagina = await navegador.newPage();
    await pagina.addInitScript(clienteFalso([PROFE], [], PROFE.id));
    await pagina.emulateMedia({ colorScheme: "dark" });
    await pagina.goto(`${BASE}/tareas.html`, { waitUntil: "networkidle" });
    await pagina.waitForSelector("#app:not(.hidden)", { timeout: 10000 });

    const cssComoTexto = await pagina.evaluate(() =>
      Array.from(document.querySelectorAll("body *")).some((el) =>
        el.children.length === 0 && /^\s*[.#]?[\w-]+\s*\{/.test(el.textContent || "")));
    ok(!cssComoTexto, "hay CSS impreso como texto en la página (cabecera clonada con la hoja mal cerrada)");

    const estilos = await pagina.$$eval("style", (els) => els.length);
    ok(estilos <= 1, `debería haber a lo sumo un <style> suelto, hay ${estilos}`);

    const fondoOscuro = await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = fondoOscuro.match(/\d+/g).map(Number);
    ok(r + g + b < 300, `con el tema oscuro el fondo debería ser oscuro, salió ${fondoOscuro}`);

    await pagina.close();
  }

  await navegador.close();

  if (fallos.length) {
    console.error(`❌ ${fallos.length} fallo(s):\n` + fallos.map((f) => "  - " + f).join("\n"));
    process.exit(1);
  }
  console.log("✅ Tareas: todo bien.");
}

main().catch((e) => { console.error(e); process.exit(1); });
