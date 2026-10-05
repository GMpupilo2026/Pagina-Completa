/* plan-rival.html: el plan contra un rival que el profesor le mandó al alumno.
 *
 * Con ?id=, un plan: la lista de jugadas (la misma de preparacion-rivales.html,
 * de js/preparacion-pintar.js) y el tablero para recorrer cada línea
 * (js/visor-linea.js). Sin ?id=, la lista de los planes que le mandaron.
 *
 * Qué ve el alumno lo decide la RLS de planes_rival_alumno: su plan, y nada del
 * análisis del que salió (ver «Mandar el plan al alumno y a la clase: etapa 4»
 * en docs/decisiones/paneles.md). Stockfish no se baja para el plan: lo que
 * dijo el motor de cada jugada ya viene en sus notas. Solo lo pide «Juega
 * contra él», y solo cuando la partida se sale de lo que el rival juega.
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
    $("subtitulo").textContent = "Con " + (lado === "conBlancas" ? "blancas" : "negras") + " · " + (fila.propio
      ? "lo preparaste tú el " + fecha(fila.created_at) + " con " + (fila.propio.n === 1 ? "su última partida" : "sus últimas " + fila.propio.n + " partidas") + " de " + SITIO[fila.propio.sitio] + "."
      : "te lo mandaron el " + fecha(fila.created_at) + ".");
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

  // ------------------------------------------------------------ prepárate tú

  /* El alumno se prepara solo contra un rival que juega en Lichess o
     Chess.com: se bajan sus últimas partidas públicas (PreparacionDescarga, la
     misma de la preparación de rivales y de «Tus propios errores»), se analizan
     en el navegador con PreparacionAnalisis.analizar() y se arma el plan con
     planDelAlumno(), lo mismo que le llega cuando se lo manda el profe. Así se
     pinta, se entrena y se juega igual, con el mismo código. NO se guarda en la
     base ni sale del navegador: solo el usuario del rival va a esos sitios. El
     entrenamiento sí queda en training_progress, con un id de plan propio
     («propio:<sitio>:<usuario>:<lado>»), para que el repaso espaciado lo
     encuentre la próxima vez. Ver «Prepárate tú» en docs/decisiones/paneles.md. */
  const SITIO = { lichess: "Lichess", chesscom: "Chess.com" };
  const MAX_PROPIO = 300;
  const CLAVE_PROPIO = "plan_propio_ultimo_v1";
  // Lo que falta para analizar (lo demás ya lo trae la página), en orden.
  const MODULOS = [["preparacion-tactica.js", "PreparacionTactica"], ["preparacion-estructuras.js", "PreparacionEstructuras"],
    ["preparacion-analisis.js", "PreparacionAnalisis"], ["preparacion-descarga.js", "PreparacionDescarga"]];
  let cargando = null;
  function cargarAnalisis() {
    if (cargando) return cargando;
    cargando = MODULOS.filter(([, g]) => !window[g]).reduce((antes, [archivo]) => antes.then(() => new Promise((ok, mal) => {
      const sc = document.createElement("script");
      sc.src = "js/" + archivo;
      sc.onload = ok;
      sc.onerror = () => mal(new Error("no cargó " + archivo));
      document.head.appendChild(sc);
    })), Promise.resolve()).catch((e) => { cargando = null; throw e; });
    return cargando;
  }
  /* Los planes que preparó (los últimos 8), en ESTE navegador: para que al
     anotar la partida del torneo pueda compararla con lo preparado (ver «La
     partida contra lo que había preparado» en entrenamiento.md). Solo el
     árbol de jugadas: san, de quién es y lo que sigue. */
  const CLAVE_GUARDADOS = "plan_propio_guardados_v1";
  const MAX_GUARDADOS = 8;
  function guardarPropio(fila) {
    const arbol = (nodos) => (nodos || []).map((x) => ({ san: x.san, quien: x.quien, hijos: arbol(x.hijos) }));
    try {
      const antes = JSON.parse(localStorage.getItem(CLAVE_GUARDADOS) || "[]");
      const lista = (Array.isArray(antes) ? antes : []).filter((x) => x && x.id !== fila.id);
      lista.unshift({ id: fila.id, rival: fila.rival, lado: fila.lado, fecha: fila.created_at, plan: arbol(fila.plan.plan) });
      localStorage.setItem(CLAVE_GUARDADOS, JSON.stringify(lista.slice(0, MAX_GUARDADOS)));
    } catch (e) { /* sin espacio o sin almacenamiento: no se compara, nada más */ }
  }
  function leerUltimo() {
    try { const o = JSON.parse(localStorage.getItem(CLAVE_PROPIO) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
  }

  // Solo ajedrez normal desde la posición inicial (como «Tus propios errores»).
  const esNormal = (p) => { const e = (p && p.etiquetas) || {}; return /^(standard|chess)?$/i.test(String(e.Variant || "").trim()) && e.SetUp !== "1" && !e.FEN; };

  // Un día de calendario («2026-09-20») se lee a mediodía UTC: así no se
  // corre al día anterior en hora de Costa Rica.
  const diaLargo = (dia) => new Date(dia + "T12:00:00Z").toLocaleDateString("es-CR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

  // Lo que juega, en palabras: con qué color saca más y, del lado que le toca,
  // sus jugadas más repetidas. Los textos van por textContent.
  function resumenPropio(r, lado) {
    const li = [];
    const veces = (n) => (n === 1 ? "1 partida" : n + " partidas");
    li.push("Revisé " + veces(r.total) + (!r.fechas || !r.fechas.desde ? "" : r.fechas.desde === r.fechas.hasta ? ", todas del " + diaLargo(r.fechas.desde) : ", del " + diaLargo(r.fechas.desde) + " al " + diaLargo(r.fechas.hasta)) +
      ". Con blancas saca " + L.pct(r.porColor.w.puntos) + " (" + veces(r.porColor.w.n) + "); con negras, " + L.pct(r.porColor.b.puntos) + " (" + veces(r.porColor.b.n) + ").");
    if (r.elo && r.elo.reciente) li.push("Su Elo en esas partidas anda por " + r.elo.reciente + ".");
    if (lado === "conNegras") {
      const b = (r.repertorio.blancas || []).slice(0, 3);
      if (b.length) li.push("Con blancas abre " + b.map((x) => "1." + L.sanEs(x.san) + " (" + L.pct(x.reparto) + ")").join(", ") + ".");
    } else {
      (r.repertorio.negras || []).slice(0, 2).forEach((x) => {
        const resp = (x.respuestas || []).slice(0, 2);
        if (resp.length) li.push("Contra 1." + L.sanEs(x.contra) + " contesta " + resp.map((y) => "1…" + L.sanEs(y.san) + " (" + L.pct(y.reparto) + ")").join(" o ") + ".");
      });
    }
    if (r.pocas) li.push("Son pocas partidas: tómalo como una pista, no como algo seguro.");
    return li;
  }

  function montarPropio(yo) {
    const ultimo = leerUltimo();
    if (SITIO[ultimo.sitio]) $("propio-sitio").value = ultimo.sitio;
    if (typeof ultimo.usuario === "string") $("propio-usuario").value = ultimo.usuario.slice(0, 30);
    if (ultimo.color === "w" || ultimo.color === "b") $("propio-color").value = ultimo.color;
    const estado = $("propio-estado");
    let control = null;
    $("propio-parar").addEventListener("click", () => { if (control) control.abort(); });
    $("propio-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const sitio = $("propio-sitio").value;
      const usuario = $("propio-usuario").value.trim().replace(/^@/, "");
      const color = $("propio-color").value === "b" ? "b" : "w";
      if (!SITIO[sitio]) return;
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(usuario)) {
        estado.textContent = "Escribe el usuario de tu rival tal como sale en su perfil: letras, números, guion o guion bajo.";
        $("propio-usuario").focus();
        return;
      }
      try { localStorage.setItem(CLAVE_PROPIO, JSON.stringify({ sitio, usuario, color })); } catch (e) {}
      $("propio-preparar").disabled = true;
      $("propio-parar").hidden = false;
      control = new AbortController();
      estado.textContent = "Trayendo las partidas de «" + usuario + "» en " + SITIO[sitio] + "…";
      let r = null;
      try {
        await cargarAnalisis();
        let pgn;
        try {
          pgn = await PreparacionDescarga.descargar({ sitio, usuario, maximo: MAX_PROPIO, senal: control.signal,
            alAvanzar: (n) => { estado.textContent = "Trayendo las partidas de «" + usuario + "» en " + SITIO[sitio] + "… van " + n + "."; } });
        } catch (e) {
          // Detenido: se analiza lo que ya llegó.
          if (e && e.name === "AbortError") pgn = PreparacionDescarga.ultimoTexto || "";
          else throw e;
        }
        estado.textContent = "Revisando sus partidas…";
        await new Promise((ok) => setTimeout(ok, 0));
        const partidas = PreparacionAnalisis.leerPgn(pgn).filter(esNormal);
        r = partidas.length ? PreparacionAnalisis.analizar(partidas, usuario) : null;
      } catch (e) {
        if (e && e.paraMostrar) estado.textContent = e.message;
        else { console.error(e); estado.textContent = "No se pudieron traer sus partidas. Revisa tu conexión y vuelve a intentarlo."; }
        $("propio-preparar").disabled = false; $("propio-parar").hidden = true;
        return;
      }
      $("propio-preparar").disabled = false; $("propio-parar").hidden = true;
      if (!r || r.vacio) { estado.textContent = "No encontré partidas de ajedrez normal de «" + usuario + "» en " + SITIO[sitio] + "."; return; }
      const lado = color === "w" ? "conBlancas" : "conNegras";
      const plan = L.planDelAlumno(r, lado);
      if (!plan.plan.length) {
        estado.textContent = "Revisé " + r.total + (r.total === 1 ? " partida" : " partidas") + ", pero con " + (color === "w" ? "negras" : "blancas") +
          " juega muy poco para armarte un plan. Prueba con el otro color, o pídele a tu profe que te ayude.";
        return;
      }
      const fila = { id: "propio:" + sitio + ":" + usuario.toLowerCase() + ":" + lado, alumno_id: yo, rival: r.rival, lado, plan,
        nota: null, created_at: new Date().toISOString(), propio: { sitio, n: r.total } };
      guardarPropio(fila);
      $("lista").classList.add("hidden");
      const ul = $("propio-resumen");
      ul.textContent = "";
      resumenPropio(r, lado).forEach((t) => { const x = document.createElement("li"); x.textContent = t; ul.appendChild(x); });
      $("propio-resumen-caja").hidden = false;
      const rr = pintarPlan(fila);
      await montarEntrenamiento(fila, rr, yo);
      montarSparring(fila, rr);
      $("titulo").focus();
    });
  }

  // ------------------------------------------------------------ entrenarlo

  /* Jugar cada línea del plan de memoria (js/entrenador-linea.js). Cada línea
     terminada queda en training_progress como 'preparacion' con su linea_id
     (el id del plan y las jugadas); SOLO si salió sin errores ni pistas lleva
     además theme = el id del plan, que es lo que cuenta la tarea
     (tareas_con_avance(), filtro_clave). Se registra solo cuando quien mira es
     el alumno del plan (un profesor que lo prueba no suma a nadie). Ver
     «Entrenar el plan: etapa 7».

     El repaso sale de esas mismas filas, no de este navegador ni de una tabla
     aparte: cada intento, en orden, pasa por la repetición espaciada de
     Aperturas (js/repaso-espaciado.js): limpia = «bien», solo con pistas =
     «regular», con errores = «mal». Lo que se deriva no se guarda. Ver
     «Repasar las líneas del plan». */
  const diaCR = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const notaDe = (d) => (d.limpio ? "bien" : d.errores ? "mal" : "regular");

  async function intentos(fila, yo) {
    if (fila.alumno_id !== yo) return [];
    const { data } = await sb.from("training_progress").select("detail, created_at")
      .eq("student_id", yo).eq("activity", "preparacion").eq("detail->>plan", fila.id)
      .order("created_at", { ascending: true }).range(0, 999);
    return (data || []).filter((x) => x.detail && x.detail.linea_id)
      .map((x) => ({ id: x.detail.linea_id, nota: notaDe(x.detail), dia: diaCR(x.created_at), limpia: x.detail.theme === fila.id, fallos: x.detail.fallos || [] }));
  }

  const numerada = (i, san) => (i % 2 === 0 ? (i / 2 + 1) + "." : Math.floor(i / 2 + 1) + "…") + L.sanEs(san);
  const fechaCorta = (dia) => new Date(dia + "T12:00:00Z").toLocaleDateString("es-CR", { timeZone: "UTC", day: "numeric", month: "long" });

  async function montarEntrenamiento(fila, r, yo) {
    const lado = fila.lado;
    const color = lado === "conBlancas" ? "w" : "b";
    const lineas = L.lineasDelPlan(r[lado].plan).map((camino) => {
      const l = L.lineaDelPlan(r, camino);
      return { sec: l.sec, notas: l.notas, clave: fila.id + ":" + l.sec.join(" ") };
    });
    const suyo = fila.alumno_id === yo;
    const historia = await intentos(fila, yo);
    let entrenador = null;
    let actual = null;

    const limpias = () => new Set(historia.filter((h) => h.limpia).map((h) => h.id));
    const fichas = () => RepasoEspaciado.desdeHistoria(historia);
    const hoy = () => diaCR(new Date().toISOString());
    // Las que toca hoy: solo las que ya se jugaron alguna vez (las nuevas son
    // «la siguiente línea», no repaso). Primero las falladas y las más atrasadas.
    const paraHoy = () => {
      const f = fichas();
      return RepasoEspaciado.pendientes(lineas.map((x) => x.clave).filter((k) => f[k]), f, hoy()).map((k) => lineas.find((x) => x.clave === k));
    };

    function pintar() {
      const ok = limpias();
      const f = fichas();
      const hechas = lineas.filter((x) => ok.has(x.clave)).length;
      $("entrenar-progreso").textContent = suyo
        ? "Te salen sin errores " + hechas + " de " + lineas.length + (lineas.length === 1 ? " línea." : " líneas.")
        : "Estás viendo el plan de un alumno: lo que entrenes acá no se le suma.";
      const toca = suyo ? paraHoy() : [];
      $("entrenar-repasar").hidden = !toca.length;
      $("entrenar-repasar").textContent = "Repasar las de hoy (" + toca.length + ")";
      $("entrenar-repaso").textContent = !suyo || !historia.length ? ""
        : toca.length ? "Para repasar hoy: " + toca.length + (toca.length === 1 ? " línea." : " líneas.")
        : "Hoy no te toca repasar ninguna: vuelve el día que dice cada una.";
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
        estado.className = "block text-xs " + (ok.has(x.clave) ? "text-green-700 dark:text-green-400" : "text-brand-500 dark:text-brand-300");
        estado.dataset.estado = "";
        let texto = ok.has(x.clave) ? "✔ Ya te sale sin errores" : "Todavía no te sale sin errores";
        const ficha = suyo && f[x.clave];
        if (ficha) texto += ficha.vence <= hoy() ? " · Toca repasarla hoy" : " · Próximo repaso: " + fechaCorta(ficha.vence);
        estado.textContent = texto + ".";
        t.append(lin, estado);
        // Dónde se equivocó la última vez que la jugó, si se equivocó.
        const ultima = suyo ? historia.filter((h) => h.id === x.clave).pop() : null;
        if (ultima && ultima.fallos.length) {
          const donde = document.createElement("span");
          donde.className = "block text-xs text-brand-600 dark:text-brand-200";
          donde.dataset.fallos = "";
          donde.textContent = "La última vez fallaste en " + ultima.fallos.filter((k) => x.sec[k]).map((k) => numerada(k, x.sec[k])).join(", ") + ".";
          t.appendChild(donde);
        }
        const b = document.createElement("button");
        b.type = "button";
        b.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        b.textContent = "Entrenarla";
        b.setAttribute("aria-label", "Entrenar la línea " + (i + 1) + ": " + L.lineaEs(x.sec));
        b.addEventListener("click", () => empezar(x));
        li.append(t, b);
        ul.appendChild(li);
      });
      const pendiente = lineas.find((x) => !ok.has(x.clave));
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
      if (!suyo || !window.EntrenoProgress) return;
      const detalle = { linea_id: x.clave, plan: fila.id, limpio: res.limpia, errores: res.errores, pistas: res.pistas, fallos: res.fallos || [] };
      if (res.limpia) detalle.theme = fila.id;
      const hecho = await EntrenoProgress.log("preparacion", detalle);
      if (hecho && hecho.ok === false && hecho.motivo === "error") {
        $("entrenador-resultado").textContent += " (No se pudo guardar: revisa tu conexión.)";
        return;
      }
      historia.push({ id: x.clave, nota: notaDe(detalle), dia: hoy(), limpia: res.limpia, fallos: detalle.fallos });
      pintar();
    }

    $("entrenar-siguiente").addEventListener("click", () => {
      const ok = limpias();
      const pendiente = lineas.find((x) => !ok.has(x.clave) && x !== actual) || lineas.find((x) => !ok.has(x.clave)) || lineas[Math.floor(Math.random() * lineas.length)];
      if (pendiente) empezar(pendiente);
    });
    $("entrenar-repasar").addEventListener("click", () => {
      const toca = paraHoy();
      if (toca.length) empezar(toca.find((x) => x !== actual) || toca[0]);
    });
    pintar();
  }

  // ------------------------------------------------------------ «Juega contra él»

  /* Una partida contra su libro, que viaja en el plan (planDelAlumno), y fuera
     de él la computadora a su Elo (js/preparacion-sparring.js). Los planes
     mandados antes no traen el libro: la sección no sale. Stockfish no se baja
     al abrir la página: solo cuando la partida se sale de lo que él juega. */
  function montarSparring(fila, r) {
    const libro = fila.plan && fila.plan.libro;
    if (!libro || !Object.keys(libro).length || !window.PreparacionSparring) return;
    $("sparring-caja").hidden = false;
    let s = null;
    $("sparring-empezar").addEventListener("click", () => {
      if (!s) s = PreparacionSparring.montar($("sparring"));
      // Desde acá, otra partida se empieza con «Empezar de nuevo» del tablero.
      $("sparring-empezar").hidden = true;
      s.empezar({ libro, plan: r[fila.lado].plan, color: fila.lado === "conBlancas" ? "w" : "b", elo: fila.plan.elo, rival: fila.rival, reciente: !!fila.plan.reciente });
    });
  }

  async function init() {
    const { data } = await sb.auth.getSession();
    const sesion = data && data.session;
    if (!sesion) { location.href = "login.html?next=" + encodeURIComponent("plan-rival.html" + location.search); return; }
    const id = new URLSearchParams(location.search).get("id");
    if (!id) {
      montarPropio(sesion.user.id);
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
    montarSparring(fila, r);
  }

  init();
})();
