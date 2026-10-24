/* ===== Ajedrez Integral — Registro de avances de Entrenamiento =====
 * Guarda en Supabase (tabla training_progress) cada logro de las páginas de
 * Entrenamiento (4x4, Aprender, Coordenadas...) para que aparezcan en
 * Informes y en el panel de Clases.
 *
 * Requiere que window.sb ya exista (js/supabase-client.js cargado antes que
 * este archivo). Las páginas de Entrenamiento ya exigen sesión iniciada
 * (Academia) antes de mostrar el contenido, pero por si acaso log() se queda
 * sin usuario (sesión vencida a medio uso, por ejemplo) simplemente no
 * escribe nada — la actividad sigue funcionando igual, apoyada en su
 * progreso local (localStorage), solo que no queda visible para el profesor.
 */
window.EntrenoProgress = (function () {
  let userId = null;
  let ready = false;

  async function init() {
    try {
      const { data } = await window.sb.auth.getSession();
      userId = data && data.session ? data.session.user.id : null;
    } catch (e) {
      userId = null;
    }
    ready = true;
    return userId;
  }

  /* Devuelve { ok, motivo } para que quien llame pueda decir la verdad en
     pantalla. Antes no devolvía nada y las páginas daban por guardado todo lo
     que se intentaba con sesión abierta: cuando la base rechazaba la fila (una
     actividad que faltaba en el CHECK de training_progress, por ejemplo) el
     alumno leía "guardado" y el profesor no veía nada en Informes. Los motivos
     son: "sin-sesion" (no hay quien la firme) y "error" (la base dijo que no).
     Quien no mire el resultado sigue funcionando igual que antes. */
  async function log(activity, detail) {
    if (!ready) await init();
    if (!userId) return { ok: false, motivo: "sin-sesion" };
    try {
      const { error } = await window.sb.from("training_progress").insert([
        { student_id: userId, activity, detail: detail || {} },
      ]);
      if (error) {
        console.error("No se pudo registrar el avance de Entrenamiento:", error);
        return { ok: false, motivo: "error", error };
      }
      avisarTemaTerminado();
      return { ok: true };
    } catch (e) {
      console.error("No se pudo registrar el avance de Entrenamiento:", e);
      return { ok: false, motivo: "error", error: e };
    }
  }

  /* ¿Ese ejercicio terminó un tema? El premio (el doble de lo que valen sus
     ejercicios, hasta 500) lo paga la base, con su trigger
     premiar_tema_terminado; acá solo se dice, una vez. Se pregunta por lo de
     los últimos minutos y se recuerda lo ya dicho en el aparato: la hora del
     celular puede no ser la de la base. Ver «Terminar un tema: el doble,
     hasta 500» en docs/decisiones/puntos-y-premios.md. */
  const CLAVE_TEMAS = "temas_terminados_avisados_v1";
  async function avisarTemaTerminado() {
    try {
      const desde = new Date(Date.now() - 10 * 60000).toISOString();
      const { data, error } = await window.sb.rpc("mis_temas_terminados", { p_desde: desde });
      if (error || !Array.isArray(data) || !data.length) return;
      let dichos = [];
      try { dichos = JSON.parse(localStorage.getItem(CLAVE_TEMAS) || "[]"); } catch (e) { /* sin almacenamiento */ }
      data.forEach((t) => {
        const k = t.nombre + "|" + t.created_at;
        if (dichos.includes(k)) return;
        dichos.push(k);
        mostrarPremio("🏆", "¡Terminaste el tema «" + t.nombre + "»! Ganaste " + t.cantidad + " Puntos Ajedrez de premio.");
      });
      try { localStorage.setItem(CLAVE_TEMAS, JSON.stringify(dichos.slice(-50))); } catch (e) { /* sin almacenamiento */ }
    } catch (e) { /* el premio ya está pagado; solo no se dice */ }
  }
  function mostrarPremio(emoji, texto) {
    const caja = document.createElement("div");
    caja.className = "fixed top-4 left-4 right-4 sm:left-auto sm:max-w-sm z-[95] flex items-start gap-3 rounded-xl shadow-lg px-4 py-3 bg-white dark:bg-brand-800 border-2 border-accent-500 text-sm font-semibold text-brand-800 dark:text-white";
    caja.setAttribute("role", "status");
    caja.setAttribute("data-tema-terminado", "");
    const ic = document.createElement("span");
    ic.className = "text-2xl leading-none";
    ic.setAttribute("aria-hidden", "true");
    ic.textContent = emoji;
    const t = document.createElement("p");
    t.className = "flex-1 min-w-0 break-words";
    t.textContent = texto;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "shrink-0 rounded px-1 text-brand-600 dark:text-brand-300 hover:text-brand-800 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    x.textContent = "✕";
    x.setAttribute("aria-label", "Cerrar el aviso del premio");
    x.addEventListener("click", () => caja.remove());
    caja.append(ic, t, x);
    document.body.appendChild(caja);
    setTimeout(() => caja.remove(), 12000);
  }

  /* Estrellas de una posición de Practicar o de Desafíos. Cuentan las pistas Y
     las jugadas equivocadas: antes solo las pistas, y probar jugada tras jugada
     hasta acertar daba tres estrellas. Una sola cosa en falta, dos; más, una.
     "Ver solución" es la tercera pista, así que siempre deja una. */
  function estrellasDeLaRonda(pistas, errores) {
    const faltas = (pistas || 0) + (errores || 0);
    return faltas >= 2 ? 1 : faltas === 1 ? 2 : 3;
  }

  /* Cómo salió un ejercicio, para el `detail` de training_progress. Va en el
     detalle y no como actividad nueva: el CHECK de la tabla no cambia, y las
     filas viejas (sin estos campos) siguen valiendo. `limpio` es sin error y
     sin pista: lo que de verdad dice que el motivo se domina. */
  function comoSalio(conError, conPista) {
    return { limpio: !conError && !conPista, con_error: !!conError, con_pista: !!conPista };
  }

  /* «volver» escrito en un ejercicio (4×4, Coordenadas, Memoria, Mates): a
     donde se vino, y DICIENDO adónde. Antes unas contestaban «No entendí» y
     el 4×4 decía «Volviendo…» a secas. Sin una página anterior del sitio, a
     la lista de Entrenar: la del panel con la cuenta ciega (la adaptada), el
     índice de Entrenamiento si no. `decir(texto)` es el aviso de la página;
     se espera un momento antes de irse para que alcance a oírse. */
  function volver(decir) {
    let ref = null;
    try { ref = document.referrer ? new URL(document.referrer) : null; } catch (e) { ref = null; }
    const ciego = document.documentElement.classList.contains("modo-ciego");
    let donde, ir;
    if (ref && ref.origin === location.origin && ref.href !== location.href && history.length > 1) {
      const p = ref.pathname;
      donde = /\/clases(\.html)?$/.test(p) ? "a tu panel"
        : /\/entreno\/(index\.html)?$/.test(p) ? "a Entrenamiento"
        : "a la página anterior";
      ir = () => history.back();
    } else if (ciego) {
      donde = "a Entrenar, en tu panel";
      ir = () => { location.href = new URL("../clases.html#entrenar", location.href).href; };
    } else {
      donde = "a Entrenamiento";
      ir = () => { location.href = new URL("index.html", location.href).href; };
    }
    const texto = `Volviendo ${donde}…`;
    if (typeof decir === "function") decir(texto);
    setTimeout(ir, 600);
    return texto;
  }

  return { init, log, estrellasDeLaRonda, comoSalio, volver, hasSession: () => !!userId };
})();
