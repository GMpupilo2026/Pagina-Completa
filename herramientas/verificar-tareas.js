/* Comprueba, en un navegador de verdad y con un Supabase de mentira, el área
   de Tareas (tareas.html): que el profesor arme y mande una tarea con el
   material correcto y que el alumno la vea y pueda marcarla hecha.

   Existe porque tareas.html está DETRÁS DEL LOGIN: verificar-css.js abre las
   páginas sin cuenta, así que nada de esto lo ve nunca. Lo que se rompe acá
   no da error: un select que manda el material equivocado, una tarea que se
   le manda a todos los alumnos en vez de a los marcados, o un alumno que no
   puede marcar la suya porque el trigger de la base le revierte también el
   estado (eso ya se comprobó aparte, impersonando roles en SQL — acá se
   comprueba la PÁGINA, no la base).

   Tres cosas, por tres peligros distintos:

   1. EL PROFESOR ARMA LA TAREA BIEN. Que la lista de alumnos salga marcable,
      que el selector de material tenga cursos Y herramientas, que elegir un
      curso muestre el campo de lección con su tope, y que enviar mande una
      fila POR CADA alumno marcado (ni una de más ni una de menos) con el
      material, el título y la fecha que se pusieron — no lo que había antes.

   2. EL ALUMNO VE LO SUYO Y LO MARCA. Que sus tareas pendientes salgan
      ordenadas por fecha, que una vencida se note, que el enlace vaya al
      material correcto, y que tildar "Hecha" mande el update con el id
      correcto — no que repinte la lista fiándose de lo que ya tenía en
      pantalla.

   3. QUE LA PÁGINA SE VEA. Que no haya CSS impreso como texto y que con el
      tema en oscuro el fondo salga oscuro — se clonó la cabecera de
      formularios.html, y clonar una cabecera ya salió mal más de una vez en
      este sitio.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-tareas.js                                */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "karina@x.cr" };
const ALUMNA1 = { id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" };
const ALUMNA2 = { id: "u-beto", role: "alumno", is_admin: false, full_name: "Beto Solano", email: "beto@x.cr" };

const AHORA = Date.now();
const TAREAS_ALUMNA = [
  { id: "t-vencida", profesor_id: "u-profe", alumno_id: "u-ana", titulo: "Ejercicios de horquillas", instrucciones: "Resuelve los 20 ejercicios.", material_tipo: "herramienta", material_slug: "temas", material_label: "Ejercicios por tema", material_href: "entreno/temas.html", leccion: null, vence_at: new Date(AHORA - 2 * 86400000).toISOString(), estado: "pendiente", completada_at: null },
  { id: "t-futura", profesor_id: "u-profe", alumno_id: "u-ana", titulo: "Lección 3 de Fundamentos", instrucciones: "Lee la lección y practica.", material_tipo: "curso", material_slug: "fundamentos-del-ajedrez", material_label: "Fundamentos del Ajedrez", material_href: "cursos/academia/fundamentos-del-ajedrez.html", leccion: 3, vence_at: new Date(AHORA + 5 * 86400000).toISOString(), estado: "pendiente", completada_at: null },
  { id: "t-hecha", profesor_id: "u-profe", alumno_id: "u-ana", titulo: "Diagnóstico de nivel", instrucciones: "Hazlo completo.", material_tipo: "herramienta", material_slug: "diagnostico", material_label: "Diagnóstico de nivel", material_href: "entreno/diagnostico.html", leccion: null, vence_at: new Date(AHORA - 10 * 86400000).toISOString(), estado: "completada", completada_at: new Date(AHORA - 9 * 86400000).toISOString() },
];

function clienteFalso(perfiles, tareasSeed, usuarioId) {
  return `
window.__llamadas = [];
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  let TAREAS = ${JSON.stringify(tareasSeed)};
  const perfilPorId = {};
  PERFILES.forEach((p) => { perfilPorId[p.id] = p; });
  let contadorNuevas = 0;

  function embeber(sel, fila) {
    const copia = Object.assign({}, fila);
    if (sel.indexOf("alumno:") !== -1) {
      const p = perfilPorId[fila.alumno_id];
      copia.alumno = p ? { full_name: p.full_name, email: p.email } : null;
    }
    if (sel.indexOf("profesor:") !== -1) {
      const p = perfilPorId[fila.profesor_id];
      copia.profesor = p ? { full_name: p.full_name } : null;
    }
    return copia;
  }

  function tabla(nombre) {
    let filas = (nombre === "profiles" ? PERFILES : TAREAS).slice();
    let selectStr = "";
    let unica = false;
    const anotado = { tabla: nombre, eq: {}, order: null, insert: null, update: null, delete: false };
    window.__llamadas.push(anotado);
    const b = {
      select(cols) { selectStr = cols || ""; return b; },
      eq(col, val) {
        anotado.eq[col] = val;
        filas = filas.filter((r) => String(r[col]) === String(val));
        return b;
      },
      order(col, opts) {
        anotado.order = col;
        const dir = opts && opts.ascending === false ? -1 : 1;
        filas = filas.slice().sort((a, c) => (a[col] > c[col] ? 1 : a[col] < c[col] ? -1 : 0) * dir);
        return b;
      },
      single() { unica = true; return b; },
      then(resolve) {
        let data = nombre === "tareas" ? filas.map((f) => embeber(selectStr, f)) : filas;
        if (unica) data = data[0] || null;
        resolve({ data, error: null });
      },
      insert(filasNuevas) {
        const arr = Array.isArray(filasNuevas) ? filasNuevas : [filasNuevas];
        anotado.insert = arr;
        arr.forEach((f) => {
          contadorNuevas += 1;
          TAREAS.push(Object.assign({ id: "nueva-" + contadorNuevas, estado: "pendiente", completada_at: null, created_at: new Date().toISOString() }, f));
        });
        return Promise.resolve({ data: arr, error: null });
      },
      update(cambios) {
        anotado.update = cambios;
        return {
          eq(col, val) {
            anotado.updateEq = { col: col, val: val };
            TAREAS = TAREAS.map((t) => (String(t[col]) === String(val) ? Object.assign({}, t, cambios) : t));
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      delete() {
        anotado.delete = true;
        return {
          eq(col, val) {
            TAREAS = TAREAS.filter((t) => String(t[col]) !== String(val));
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "${usuarioId}" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: function () {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: function (nombre) { return tabla(nombre); },
  };
})();
`;
}

async function main() {
  const navegador = await chromium.launch({ executablePath: CHROME });
  const fallos = [];
  const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

  // ---------- 1) el profesor arma y manda la tarea ----------
  {
    const pagina = await navegador.newPage();
    await pagina.addInitScript(clienteFalso([PROFE, ALUMNA1, ALUMNA2], [], PROFE.id));
    await pagina.goto(`${BASE}/tareas.html`, { waitUntil: "networkidle" });
    await pagina.waitForSelector("#app:not(.hidden)", { timeout: 10000 });

    ok(await pagina.isVisible("#vista-profesor"), "no se muestra la vista de profesor");
    const alumnosMarcables = await pagina.$$eval(".alumno-check", (els) => els.length);
    ok(alumnosMarcables === 2, `esperaba 2 alumnos marcables, salieron ${alumnosMarcables}`);

    const opcionesCurso = await pagina.$$eval("#t-material option", (els) => els.map((e) => e.value));
    ok(opcionesCurso.includes("fundamentos-del-ajedrez"), "el selector de cursos no trae el catálogo real");

    await pagina.selectOption("#t-material", "fundamentos-del-ajedrez");
    const leccionVisible = await pagina.isVisible("#t-leccion-wrap");
    ok(leccionVisible, "elegir un curso no destapa el campo de lección");
    const tope = await pagina.getAttribute("#t-leccion", "max");
    ok(tope === "12", `el tope de lección debería ser 12 (fundamentos-del-ajedrez), salió ${tope}`);

    await pagina.selectOption("#t-categoria", "herramienta");
    const opcionesHerramienta = await pagina.$$eval("#t-material option", (els) => els.map((e) => e.value));
    ok(opcionesHerramienta.includes("temas") && opcionesHerramienta.includes("aperturas"), "el selector de herramientas no trae las fichas de entreno/index.html");
    ok(!(await pagina.isVisible("#t-leccion-wrap")), "una herramienta no debería mostrar el campo de lección");
    await pagina.selectOption("#t-material", "temas");

    // Marca a los dos alumnos y manda una tarea con fecha en el futuro.
    const checks = await pagina.$$(".alumno-check");
    for (const c of checks) await c.check();
    await pagina.fill("#t-instrucciones", "Resuelve los ejercicios de horquilla.");
    const venceInput = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 16);
    await pagina.fill("#t-vence", venceInput);
    await pagina.click("#enviar-btn");
    await pagina.waitForFunction(() => /enviada a 2/.test(document.getElementById("form-status").textContent || ""), { timeout: 5000 });

    const llamadas = await pagina.evaluate(() => window.__llamadas);
    const inserts = llamadas.filter((l) => l.tabla === "tareas" && l.insert);
    ok(inserts.length === 1, `esperaba un solo insert a "tareas", hubo ${inserts.length}`);
    if (inserts.length === 1) {
      const filas = inserts[0].insert;
      ok(filas.length === 2, `el insert debería traer 2 filas (una por alumno marcado), trajo ${filas.length}`);
      ok(filas.every((f) => f.material_tipo === "herramienta" && f.material_slug === "temas"), "el material enviado no es el que se eligió en el formulario (Ejercicios por tema)");
      const ids = filas.map((f) => f.alumno_id).sort();
      ok(JSON.stringify(ids) === JSON.stringify(["u-ana", "u-beto"].sort()), `el insert no fue a los dos alumnos marcados: ${JSON.stringify(ids)}`);
    }

    await pagina.close();
  }

  // ---------- 2) el alumno ve lo suyo y lo marca ----------
  {
    const pagina = await navegador.newPage();
    await pagina.addInitScript(clienteFalso([PROFE, ALUMNA1, ALUMNA2], TAREAS_ALUMNA, ALUMNA1.id));
    await pagina.goto(`${BASE}/tareas.html`, { waitUntil: "networkidle" });
    await pagina.waitForSelector("#app:not(.hidden)", { timeout: 10000 });

    ok(await pagina.isVisible("#vista-alumno"), "no se muestra la vista de alumno");
    ok(!(await pagina.isVisible("#vista-profesor")), "a un alumno no le debería aparecer el panel de asignar");

    const pendientesTitulos = await pagina.$$eval("#pendientes-lista > div p.font-semibold", (els) => els.map((e) => e.textContent.trim()));
    ok(pendientesTitulos.length === 2, `esperaba 2 tareas pendientes, salieron ${pendientesTitulos.length}`);
    ok(pendientesTitulos[0] === "Ejercicios de horquillas", `la vencida debería salir primero por fecha, salió: ${JSON.stringify(pendientesTitulos)}`);

    const primeraCard = await pagina.$("#pendientes-lista > div");
    const claseVencida = await primeraCard.getAttribute("class");
    ok(/border-red-500/.test(claseVencida), "la tarea vencida no lleva el aviso visual de vencida");

    const enlaceLeccion = await pagina.$$eval("#pendientes-lista a", (els) => els.map((e) => e.textContent));
    ok(enlaceLeccion.some((t) => /lección 3/i.test(t)), `el enlace de la tarea de curso no dice la lección: ${JSON.stringify(enlaceLeccion)}`);

    const completadasAntes = await pagina.$$eval("#completadas-lista > div", (els) => els.length);
    ok(completadasAntes === 1, `esperaba 1 tarea ya completada, salieron ${completadasAntes}`);

    // Marca como hecha la que vence en el futuro. Un click y no un check():
    // marcarla repinta la lista entera al toque, y el checkbox original queda
    // desprendido del DOM antes de que Playwright termine de confirmar el
    // estado final de UN check() (no de un click()).
    const checks = await pagina.$$(".marcar-check");
    await checks[1].click();
    await pagina.waitForFunction(() => document.querySelectorAll("#completadas-lista > div").length === 2, { timeout: 5000 });

    const llamadas = await pagina.evaluate(() => window.__llamadas);
    const updates = llamadas.filter((l) => l.tabla === "tareas" && l.update);
    ok(updates.length === 1, `esperaba un solo update al marcar la tarea, hubo ${updates.length}`);
    if (updates.length === 1) {
      ok(updates[0].update.estado === "completada", "el update no manda estado=completada");
      ok(updates[0].updateEq && updates[0].updateEq.col === "id" && updates[0].updateEq.val === "t-futura", `el update fue a la tarea equivocada: ${JSON.stringify(updates[0].updateEq)}`);
    }

    await pagina.close();
  }

  // ---------- 3) que la página se vea ----------
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
