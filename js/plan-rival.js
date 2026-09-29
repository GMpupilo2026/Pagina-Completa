/* plan-rival.html: el plan contra un rival que el profesor le mandó al alumno.
 *
 * Con ?id=, un plan: la lista de jugadas (la misma de preparacion-rivales.html,
 * de js/preparacion-pintar.js) y el tablero para recorrer cada línea
 * (js/visor-linea.js). Sin ?id=, la lista de los planes que le mandaron.
 *
 * Qué ve el alumno lo decide la RLS de planes_rival_alumno: su plan, y nada del
 * análisis del que salió (ver «Mandar el plan al alumno y a la clase: etapa 4»
 * en docs/decisiones/paneles.md). Acá no hay Stockfish: lo que dijo el motor
 * de cada jugada del plan ya viene en sus notas, y bajar un motor de varios
 * megas en el celular del alumno para eso no se justifica.
 */
(function () {
  "use strict";

  const L = window.PreparacionLineas;
  const P = window.PreparacionPintar;
  const $ = (id) => document.getElementById(id);
  const LADO = { conBlancas: "con blancas", conNegras: "con negras" };

  function fecha(iso) {
    return new Date(iso).toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "long", year: "numeric" });
  }

  // El plan guardado, con la forma del resultado del análisis: así lo leen
  // igual lineaDelPlan(), planAPgn() y el pintor.
  function comoResultado(fila) {
    const r = { rival: fila.rival, motor: (fila.plan && fila.plan.motor) || null };
    r[fila.lado] = { plan: (fila.plan && fila.plan.plan) || [] };
    return r;
  }

  function bajarPgn(r, lado) {
    const texto = L.planAPgn(r, lado);
    if (!texto) return;
    const nombre = "plan-" + String(r.rival).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + (lado === "conBlancas" ? "blancas" : "negras") + ".pgn";
    const url = URL.createObjectURL(new Blob([texto], { type: "application/x-chess-pgn" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Avisos.avisar("Plan bajado: " + nombre);
  }

  function pintarPlan(fila) {
    const r = comoResultado(fila);
    const lado = fila.lado;
    document.title = "Tu plan contra " + fila.rival + " — Ajedrez Integral";
    $("titulo").textContent = "Tu plan contra " + fila.rival;
    $("subtitulo").textContent = "Con " + (lado === "conBlancas" ? "blancas" : "negras") + " · te lo mandaron el " + fecha(fila.created_at) + ".";
    if (fila.nota) { $("nota").textContent = fila.nota; $("nota-caja").hidden = false; }

    const visor = VisorLinea.montar($("visor"), { nombre: "Tablero del plan" });
    const abrir = (camino, origen, enfocar) => {
      const l = L.lineaDelPlan(r, camino);
      visor.cargar(l.sec, { en: l.en, notas: l.notas, titulo: L.lineaEs(l.sec.slice(0, l.en)) });
      if (enfocar) {
        // En el celular el tablero está debajo del plan: se baja hasta él.
        $("visor-caja").scrollIntoView({ block: "start" });
        visor.enfocar();
      }
    };
    $("plan").appendChild(P.plan(r[lado].plan, { alVerLinea: (camino, origen) => abrir(camino, origen, true) }));
    $("bajar-pgn").addEventListener("click", () => bajarPgn(r, lado));
    // Arranca en la línea principal, en la posición de salida.
    const principal = L.lineasDelPlan(r[lado].plan)[0];
    if (principal) {
      const l = L.lineaDelPlan(r, principal);
      visor.cargar(l.sec, { en: 0, notas: l.notas, titulo: "La línea principal" });
    }
    $("app").classList.remove("hidden");
    return r;
  }

  async function pintarLista(yo) {
    const { data, error } = await sb.from("planes_rival_alumno").select("id, rival, lado, created_at")
      .eq("alumno_id", yo).order("created_at", { ascending: false }).range(0, 199);
    $("lista").classList.remove("hidden");
    const ul = $("lista-planes");
    if (error || !data || !data.length) { $("lista-vacia").hidden = false; return; }
    for (const p of data) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "plan-rival.html?id=" + encodeURIComponent(p.id);
      a.className = "block bg-white dark:bg-brand-900 rounded-xl shadow-sm px-5 py-4 hover:ring-2 hover:ring-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
      const t = document.createElement("p");
      t.className = "font-semibold text-brand-800 dark:text-white";
      t.textContent = "Contra " + p.rival + ", " + (LADO[p.lado] || "");
      const f = document.createElement("p");
      f.className = "text-sm text-brand-500 dark:text-brand-300";
      f.textContent = "Te lo mandaron el " + fecha(p.created_at);
      a.append(t, f);
      li.appendChild(a);
      ul.appendChild(li);
    }
  }

  // ------------------------------------------------------------ entrenarlo

  /* Jugar cada línea del plan de memoria (js/entrenador-linea.js). Cada línea
     terminada queda en training_progress como 'preparacion' con su linea_id
     (el id del plan y las jugadas); SOLO si salió sin errores ni pistas lleva
     además theme = el id del plan, que es lo que cuenta la tarea
     (tareas_con_avance(), filtro_clave). Lo que ya salió limpio se lee de la
     base, no de este navegador: vale en la compu y en el celular. Se registra
     solo cuando quien mira es el alumno del plan (un profesor que lo prueba
     no suma a nadie). Ver «Entrenar el plan: etapa 7». */
  async function lineasLimpias(fila, yo) {
    if (fila.alumno_id !== yo) return new Set();
    const { data } = await sb.from("training_progress").select("detail")
      .eq("student_id", yo).eq("activity", "preparacion").eq("detail->>theme", fila.id).range(0, 999);
    return new Set((data || []).map((x) => x.detail && x.detail.linea_id).filter(Boolean));
  }

  async function montarEntrenamiento(fila, r, yo) {
    const lado = fila.lado;
    const color = lado === "conBlancas" ? "w" : "b";
    const lineas = L.lineasDelPlan(r[lado].plan).map((camino) => {
      const l = L.lineaDelPlan(r, camino);
      return { sec: l.sec, notas: l.notas, clave: fila.id + ":" + l.sec.join(" ") };
    });
    let limpias = await lineasLimpias(fila, yo);
    let entrenador = null;
    let actual = null;

    function pintar() {
      const hechas = lineas.filter((x) => limpias.has(x.clave)).length;
      $("entrenar-progreso").textContent = fila.alumno_id === yo
        ? "Te salen sin errores " + hechas + " de " + lineas.length + (lineas.length === 1 ? " línea." : " líneas.")
        : "Estás viendo el plan de un alumno: lo que entrenes acá no se le suma.";
      const ul = $("entrenar-lineas");
      ul.textContent = "";
      lineas.forEach((x, i) => {
        const li = document.createElement("li");
        li.className = "py-2 flex flex-wrap items-center justify-between gap-2";
        li.dataset.linea = x.sec.join(" ");
        const t = document.createElement("p");
        t.className = "min-w-0 flex-1 text-sm";
        const lin = document.createElement("span");
        lin.className = "font-mono text-brand-800 dark:text-white";
        lin.textContent = L.lineaEs(x.sec);
        const estado = document.createElement("span");
        estado.className = "block text-xs " + (limpias.has(x.clave) ? "text-green-700 dark:text-green-400" : "text-brand-500 dark:text-brand-300");
        estado.textContent = limpias.has(x.clave) ? "✔ Ya te sale sin errores" : "Todavía no te sale sin errores";
        t.append(lin, estado);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        b.textContent = "Entrenarla";
        b.setAttribute("aria-label", "Entrenar la línea " + (i + 1) + ": " + L.lineaEs(x.sec));
        b.addEventListener("click", () => empezar(x));
        li.append(t, b);
        ul.appendChild(li);
      });
      const pendiente = lineas.find((x) => !limpias.has(x.clave));
      $("entrenar-siguiente").textContent = pendiente ? "Entrenar la siguiente línea" : "Repasar una línea";
    }

    function empezar(x) {
      actual = x;
      if (!entrenador) entrenador = EntrenadorLinea.montar($("entrenador"), { nombre: "Tablero del entrenamiento" });
      $("entrenador-caja").hidden = false;
      $("entrenador-resultado").textContent = "";
      entrenador.empezar(x.sec, {
        color,
        titulo: "Línea " + (lineas.indexOf(x) + 1) + " de " + lineas.length,
        notas: x.notas,
        alTerminar: (res) => terminar(x, res),
      });
      $("entrenador-caja").scrollIntoView({ block: "start" });
      entrenador.enfocar();
    }

    async function terminar(x, res) {
      $("entrenador-resultado").textContent = res.limpia
        ? "¡Te salió sin errores ni pistas! Esta línea ya cuenta."
        : "Te salió con " + res.errores + (res.errores === 1 ? " error" : " errores") + " y " + res.pistas + (res.pistas === 1 ? " pista" : " pistas") + ": vuelve a jugarla hasta que te salga limpia.";
      if (fila.alumno_id !== yo || !window.EntrenoProgress) return;
      const detalle = { linea_id: x.clave, plan: fila.id, limpio: res.limpia, errores: res.errores, pistas: res.pistas };
      if (res.limpia) detalle.theme = fila.id;
      const hecho = await EntrenoProgress.log("preparacion", detalle);
      if (hecho && hecho.ok === false && hecho.motivo === "error") {
        $("entrenador-resultado").textContent += " (No se pudo guardar: revisa tu conexión.)";
        return;
      }
      if (res.limpia) { limpias.add(x.clave); pintar(); }
    }

    $("entrenar-siguiente").addEventListener("click", () => {
      const pendiente = lineas.find((x) => !limpias.has(x.clave) && x !== actual) || lineas.find((x) => !limpias.has(x.clave)) || lineas[Math.floor(Math.random() * lineas.length)];
      if (pendiente) empezar(pendiente);
    });
    pintar();
  }

  async function init() {
    const { data } = await sb.auth.getSession();
    const sesion = data && data.session;
    if (!sesion) { location.href = "login.html?next=" + encodeURIComponent("plan-rival.html" + location.search); return; }
    const id = new URLSearchParams(location.search).get("id");
    if (!id) {
      await pintarLista(sesion.user.id);
      $("loading").classList.add("hidden");
      return;
    }
    const { data: fila, error } = await sb.from("planes_rival_alumno")
      .select("id, alumno_id, rival, lado, plan, nota, created_at").eq("id", id).maybeSingle();
    $("loading").classList.add("hidden");
    if (error || !fila) { $("no-esta").classList.remove("hidden"); return; }
    const r = pintarPlan(fila);
    await montarEntrenamiento(fila, r, sesion.user.id);
  }

  init();
})();
