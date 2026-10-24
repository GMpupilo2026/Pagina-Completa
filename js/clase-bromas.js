/* ===== Ajedrez Integral — Las bromas en la clase en vivo =====
 *
 * En la clase las bromas vienen APAGADAS: el profe las enciende para su clase
 * (tres horas, o hasta que las apague) con el botón de su barra. Mientras
 * están encendidas, cada alumno tiene «Mandar una broma» para un compañero, y
 * la broma le cae cuando está en un ejercicio (una pregunta, el calentamiento,
 * la competencia, el cuestionario, la práctica…). Lo que se ve lo pinta
 * js/bromas.js; acá solo está el interruptor, el botón y el aviso.
 *
 * El aviso «te llegó una» va por un canal de la clase (broadcast): solo hace
 * que quien la recibe vuelva a preguntarle a la base (mis_bromas). Un aviso
 * inventado desde la consola no trae nada que la base no tenga.
 *
 * Ver «Dónde cae una broma y la clase en vivo» en
 * docs/decisiones/puntos-y-premios.md.
 */
window.ClaseBromas = (function () {
  "use strict";

  const HORA = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", hour: "numeric", minute: "2-digit" });
  const BTN = "w-full mt-2 font-semibold px-3 py-2 rounded-lg text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const BTN_APAGADO = "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";
  const BTN_ENCENDIDO = "bg-accent-500 hover:bg-accent-400 text-brand-900";

  let sb = null;
  let canal = null;
  const estado = { profe: null, yo: null, hasta: null, esProfe: false };
  let boton = null;

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function encendida() { return !!(estado.hasta && new Date(estado.hasta).getTime() > Date.now()); }
  function avisar(detalle) { document.dispatchEvent(new CustomEvent("clase-bromas", { detail: detalle || {} })); }

  function pintar() {
    if (!boton) return;
    const si = encendida();
    if (estado.esProfe) {
      boton.textContent = si ? "🎭 Bromas encendidas hasta las " + HORA.format(new Date(estado.hasta)) + " · Apagar"
        : "🎭 Bromas apagadas · Encender";
      boton.setAttribute("aria-pressed", si ? "true" : "false");
      boton.className = BTN + " " + (si ? BTN_ENCENDIDO : BTN_APAGADO);
    } else {
      boton.hidden = !si;
    }
  }

  async function leer() {
    try {
      const { data, error } = await sb.from("bromas_clase").select("hasta").eq("profesor_id", estado.profe).maybeSingle();
      if (error) return;
      const antes = encendida();
      estado.hasta = data ? data.hasta : null;
      pintar();
      if (antes !== encendida()) avisar({ cambio: true });
    } catch (e) { /* se vuelve a leer en un rato */ }
  }

  async function alternar() {
    boton.disabled = true;
    const { data, error } = await sb.rpc("bromas_en_esta_clase", { p_encender: !encendida() });
    boton.disabled = false;
    if (error) { window.Avisos.avisar("No se pudo cambiar: " + (error.message || "inténtalo otra vez.")); return; }
    estado.hasta = data || null;
    pintar();
    avisar({ cambio: true });
    if (canal) canal.send({ type: "broadcast", event: "estado", payload: {} });
  }

  // El alumno elige la broma de la lista; a quién y si suena, en el diálogo
  // de siempre (js/puntos-regalos.js), con el lugar ya puesto: la clase.
  async function mandar() {
    const { data, error } = await sb.from("premios_catalogo").select("*")
      .eq("activo", true).eq("categoria", "broma").order("costo_puntos");
    if (error || !data || !data.length) { window.Avisos.avisar("No se pudo cargar la lista de bromas."); return; }
    const deClase = data.filter((p) => !p.parametros || p.parametros.tipo !== "payaso");
    const r = await window.Avisos.formulario({
      titulo: "Mandar una broma",
      texto: "Le cae a tu compañero cuando esté en un ejercicio de la clase. Cuesta tus Puntos Ajedrez.",
      campos: [{
        nombre: "premio", etiqueta: "¿Cuál?", tipo: "select",
        opciones: deClase.map((p) => [p.id, p.nombre + " · " + p.costo_puntos + " puntos"]),
      }],
      aceptar: "Elegir a quién",
    });
    if (!r || !r.premio) return;
    const premio = deClase.find((p) => p.id === r.premio);
    const res = await window.PuntosRegalos.regalar({ sb, alumnoId: estado.yo, premio, donde: "clase" });
    if (!res) return;
    if (res.error) { window.Avisos.avisar(res.error); return; }
    if (canal) canal.send({ type: "broadcast", event: "broma", payload: { para: res.paraId } });
    window.Avisos.avisar("Listo: " + premio.nombre + " para " + res.para + ". Le cae en su próximo ejercicio."
      + (res.saldo != null ? " Te quedan " + res.saldo + " puntos." : ""));
  }

  /* opciones: { sb, profe (el id del profe de la clase), yo, esProfe, esAlumno } */
  function montar(opciones) {
    sb = opciones.sb;
    estado.profe = opciones.profe;
    estado.yo = opciones.yo;
    estado.esProfe = !!opciones.esProfe;
    if (!sb || !estado.profe || (!opciones.esProfe && !opciones.esAlumno)) return;

    if (estado.esProfe) {
      const barra = document.getElementById("teacher-toolbar");
      if (barra) {
        boton = el("button", BTN + " " + BTN_APAGADO);
        boton.type = "button";
        boton.id = "clase-bromas-interruptor";
        boton.title = "Las bromas entre compañeros: les caen cuando están en un ejercicio. En exámenes y torneos, nunca.";
        boton.addEventListener("click", alternar);
        barra.appendChild(boton);
      }
    } else {
      const panel = document.getElementById("student-panel");
      if (panel) {
        boton = el("button", BTN + " " + BTN_ENCENDIDO, "🎭 Mandar una broma");
        boton.type = "button";
        boton.id = "clase-bromas-mandar";
        boton.hidden = true;
        boton.addEventListener("click", mandar);
        panel.appendChild(boton);
      }
    }

    canal = sb.channel("bromas-clase:" + estado.profe)
      .on("broadcast", { event: "estado" }, () => leer())
      .on("broadcast", { event: "broma" }, ({ payload }) => {
        if (payload && payload.para === estado.yo) avisar({ llego: true });
      })
      .subscribe();
    leer();
    // Por si se perdió un aviso, y para que se apague sola a su hora.
    setInterval(leer, 120000);
  }

  return { montar, encendida };
})();
