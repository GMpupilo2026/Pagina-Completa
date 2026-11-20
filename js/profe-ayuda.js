/* «¿Te ayudo?»: la profe de la academia en el panel de sus alumnos (la profe
 * Pame en CCDR POCOCI, la profe Karina en ADAPZ).
 * Un botón con su cara abajo a la derecha; al tocarlo, un panel con lo que
 * más preguntan los alumnos, y cada respuesta lleva a su página. Es el mismo
 * asistente del Centroamericano (js/centroamericano-profe.js), con las
 * preguntas de la plataforma. Lo pidió el dueño: «esto pero con los avatares
 * de la profe Pamela», para la Academia. Ver «La profe Pame ayuda en el
 * panel» en docs/decisiones/clase-en-vivo.md.
 *
 * - Sale solo a quien ve a una profe que no es el profe Oscar
 *   (js/avatar-profe-oscar.js decide por la academia), es alumno y mira su
 *   propio panel: lo monta js/clases.js con ProfeAyuda.montar() cuando ya sabe
 *   quién entró. Habla con el nombre de esa profe (PROFES de ese archivo).
 * - «¿Puedo jugar contra ti?» solo la contesta la profe que tiene su propio
 *   bot (CON_BOT, ver js/chess-bot.js); las demás dicen que se practica contra
 *   Oscar, que es lo que dice su tarjeta. Cada profe puede tener preguntas
 *   suyas (PROPIAS: la profe Karina lleva a la página de la eliminatoria JDN
 *   de Pérez Zeledón, que ella dirige).
 * - Las respuestas son fijas y dicen lo que ya dice el panel (las tarjetas de
 *   js/clases.js): nada inventado, sin inteligencia artificial.
 * - Los dibujos van de adorno (alt vacío): lo que dice va escrito al lado.
 * - El globito «¿Te ayudo?» sale solo la primera vez en cada aparato.
 */
(function () {
  "use strict";
  if (window.ProfeAyuda) return;
  const CLAVE_VISTO = "profe_ayuda_visto";
  const A = () => window.AvatarProfeOscar;
  const ruta = (pose) => A().ruta(pose);

  // [icono, pregunta, respuesta, botón, página, pose]
  const PREGUNTAS = {
    clase: ["♟️", "¿Cómo entro a la clase en vivo?", "Toca «Sesión en vivo» en tu panel: ahí ves el tablero de la clase en vivo, el mismo que muevo yo.", "Ir a la clase en vivo", "sesion.html", "clase-en-linea"],
    tareas: ["📋", "¿Dónde están mis tareas?", "En «Tareas» están las que te mando, con su fecha límite. Se llenan solas con lo que entrenas en la plataforma.", "Ver mis tareas", "tareas.html", "a-repasar"],
    empezar: ["🧭", "¿Por dónde empiezo a entrenar?", "Empieza por el «Diagnóstico de nivel»: es una prueba que ubica tu nivel y te arma un plan de entrenamiento.", "Hacer el diagnóstico", "entreno/diagnostico.html", "idea"],
    jugar: ["⚔️", "¿Puedo jugar contra ti?", "¡Claro! En «Juega contra mí» juegas contra mi bot: abre como yo, con las jugadas de mis partidas.", "Jugar contra la profe", "tablero.html", "jugando"],
    practicar: ["⚔️", "¿Contra quién puedo practicar?", "En «Juega contra mí» practicas contra Oscar, nuestro motor: eliges la dificultad y el color.", "Ir a practicar", "tablero.html", "jugando"],
    repasar: ["🎞️", "¿Cómo repaso una clase?", "En «Repasar mis clases» está la partida de cada clase, jugada por jugada, con mis comentarios.", "Repasar mis clases", "repasar-clases.html", "ensenando"],
    clave: ["🔑", "¿Cómo cambio mi contraseña?", "En «Configuración» cambias tu perfil y tu contraseña. Ponle una tuya: la que te dimos al empezar es provisional.", "Ir a Configuración", "configuracion.html", "atencion"],
    medallas: ["🏅", "¿Cómo gano medallas?", "En «Logros» ves tu racha de días entrenando y las medallas que has ganado. Entrena un poquito cada día para que no se corte la racha.", "Ver mis logros", "logros.html", "felicidades"],
  };
  // La profe que tiene su propio bot (js/chess-bot.js, PERFILES).
  const CON_BOT = ["pame"];
  // Las preguntas que son solo de una profe. Sin fechas: lo del torneo lo dice
  // su página, que se mantiene al día.
  const PROPIAS = {
    karina: {
      torneo: ["🏆", "¿Dónde veo todo de la eliminatoria JDN?", "En la página de la Eliminatoria Cantonal JDN de Pérez Zeledón: la inscripción, las categorías, el calendario y, el día del torneo, los pareos y los resultados. Ahí también te ayudo.", "Ir a la página del torneo", "jdn-pz-2026.html", "campeones"],
    },
  };
  const nombre = () => (A() && A().PROFES[A().PROFE] ? A().PROFES[A().PROFE].nombre : "La profe");
  // Las preguntas de la profe que le toca a quien entró.
  function preguntasDe(profe) {
    const p = {};
    Object.keys(PREGUNTAS).forEach((k) => {
      if (k === "jugar" && CON_BOT.indexOf(profe) < 0) return;
      if (k === "practicar" && CON_BOT.indexOf(profe) >= 0) return;
      p[k] = PREGUNTAS[k];
    });
    return Object.assign(p, PROPIAS[profe] || {});
  }
  let MIAS = {};

  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  let boton = null, panel = null, globo = null, visto = false;

  function figura(pose) {
    const i = el("img", "profe-ayuda-figura");
    i.src = ruta(pose);
    i.alt = "";
    return i;
  }
  function cabeza(pose, titulo, texto) {
    const c = el("div", "profe-ayuda-cabeza");
    const h = el("h2", "profe-ayuda-titulo", titulo);
    h.id = "profe-ayuda-titulo";
    h.tabIndex = -1;
    const d = el("div", "");
    d.append(h, el("p", "profe-ayuda-texto", texto));
    c.append(figura(pose), d);
    return c;
  }
  function cerrarX() {
    const x = el("button", "profe-ayuda-cerrar", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Cerrar");
    x.addEventListener("click", () => cerrar(true));
    return x;
  }

  function pintarLista(foco) {
    const ul = el("ul", "profe-ayuda-lista");
    Object.keys(MIAS).forEach((k) => {
      const [icono, pregunta] = MIAS[k];
      const li = el("li", "");
      const b = el("button", "profe-ayuda-pregunta");
      b.type = "button";
      b.dataset.pregunta = k;
      b.appendChild(el("span", "", icono + " ")).setAttribute("aria-hidden", "true");
      b.appendChild(document.createTextNode(pregunta));
      b.addEventListener("click", () => pintarRespuesta(k));
      li.appendChild(b);
      ul.appendChild(li);
    });
    panel.replaceChildren(cerrarX(), cabeza("presentando", "¡Hola! Soy " + nombre().charAt(0).toLowerCase() + nombre().slice(1), "Te ayudo a encontrar lo que buscas en la plataforma. ¿Qué necesitas?"), ul);
    delete panel.dataset.respuesta;
    const f = foco ? panel.querySelector('[data-pregunta="' + foco + '"]') : panel.querySelector("[data-pregunta]");
    if (f) f.focus();
  }

  function pintarRespuesta(k) {
    const [, pregunta, respuesta, accion, href, pose] = MIAS[k];
    const fila = el("div", "profe-ayuda-acciones");
    const ir = el("a", "profe-ayuda-ir", accion);
    ir.href = href;
    ir.dataset.accion = k;
    const volver = el("button", "profe-ayuda-volver", "← Otras preguntas");
    volver.type = "button";
    volver.dataset.volver = "";
    volver.addEventListener("click", () => pintarLista(k));
    fila.append(ir, volver);
    panel.replaceChildren(cerrarX(), cabeza(pose, pregunta, respuesta), fila);
    panel.dataset.respuesta = k;
    panel.querySelector("#profe-ayuda-titulo").focus();
  }

  function abrir() {
    panel.hidden = false;
    boton.setAttribute("aria-expanded", "true");
    if (!visto) { visto = true; try { localStorage.setItem(CLAVE_VISTO, "1"); } catch (e) { /* sin espacio: sale otra vez */ } globo.hidden = true; }
    pintarLista();
  }
  function cerrar(devolverFoco) {
    panel.hidden = true;
    boton.setAttribute("aria-expanded", "false");
    if (devolverFoco) boton.focus();
  }

  // Lo llama js/clases.js con el perfil de quien entró.
  function montar(perfil) {
    if (boton || !A() || !A().PROFES[A().PROFE] || A().PROFE === "oscar") return false;
    if (!perfil || perfil.role !== "alumno" || perfil._persona) return false;
    MIAS = preguntasDe(A().PROFE);

    boton = el("button", "profe-ayuda-boton");
    boton.type = "button";
    boton.id = "profe-ayuda-boton";
    boton.setAttribute("aria-expanded", "false");
    boton.setAttribute("aria-controls", "profe-ayuda-panel");
    boton.setAttribute("aria-label", "¿Te ayudo? " + nombre() + " contesta lo que más se pregunta");
    globo = el("span", "profe-ayuda-globo", "¿Te ayudo?");
    try { visto = localStorage.getItem(CLAVE_VISTO) === "1"; } catch (e) { visto = false; }
    globo.hidden = visto;
    const cara = el("span", "profe-ayuda-cara");
    const img = el("img", "");
    img.src = ruta("hola");
    img.alt = "";
    cara.appendChild(img);
    boton.append(globo, cara);

    panel = el("div", "profe-ayuda-panel");
    panel.id = "profe-ayuda-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "profe-ayuda-titulo");

    boton.addEventListener("click", () => (panel.hidden ? abrir() : cerrar(true)));
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); cerrar(true); } });
    // Un clic afuera lo cierra. El botón de una pregunta ya no está en la página
    // cuando llega acá (el panel se repintó): ese clic fue adentro.
    document.addEventListener("click", (e) => { if (!panel.hidden && e.target.isConnected && !panel.contains(e.target) && !boton.contains(e.target)) cerrar(false); });

    document.body.append(panel, boton);
    return true;
  }

  window.ProfeAyuda = { PREGUNTAS, PROPIAS, preguntasDe, montar, abrir: () => panel && abrir(), cerrar: () => panel && cerrar(false) };
})();

/*! rev bfb5bbb0d2d82f9f */
