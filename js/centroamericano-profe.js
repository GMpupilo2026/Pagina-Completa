/* «¿Te ayudo?»: el profe en la página del Centroamericano 2026. Un botón con
 * su cara abajo a la derecha; al tocarlo, un panel con lo que más preguntan
 * las familias, y cada respuesta lleva a su lugar de la página (el buscador,
 * el calendario, el mapa, los juegos para los que esperan). Lo pidió el
 * dueño: el avatar del profe para ayudar a la gente, y que diga «el profe»,
 * sin su nombre. Ver «El profe ayuda en la página» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 * - Las respuestas son fijas: lo que ya dice la página, nada inventado (sin
 *   inteligencia artificial).
 * - Los dibujos son los del avatar (js/avatar-profe-oscar.js, una sola
 *   lista); acá van de adorno (alt vacío): lo que dice va escrito al lado.
 * - El globito «¿Te ayudo?» sale solo la primera vez en cada aparato.
 * - Español e inglés aquí; el francés en CentroamericanoFR.profe.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  if (!V || !document.getElementById("buscador")) return;
  const el = V.el;
  const CLAVE_VISTO = "cac_profe_visto";
  const ruta = (pose) => (window.AvatarProfeOscar ? window.AvatarProfeOscar.ruta(pose) : "img/avatar-profe-oscar/" + pose + ".webp");

  const TEXTOS = {
    es: {
      boton: "¿Te ayudo?", botonAria: "¿Te ayudo? Las preguntas más comunes del torneo",
      hola: "¡Hola! Soy el profe", intro: "Te ayudo a encontrar lo que buscas del Centroamericano. ¿Qué necesitas?",
      cerrar: "Cerrar", otras: "← Otras preguntas",
      preguntas: {
        mesa: ["🔎", "¿En qué mesa juega mi hijo?", "Escribe su apellido en «Busca a tu jugador»: te digo su mesa, su color y su rival en la ronda de hoy, su categoría y cómo va.", "Llévame al buscador"],
        hora: ["🗓️", "¿A qué hora es la ronda?", "Arriba, en «Hoy en el torneo», está la cuenta regresiva a la próxima ronda. En el calendario están todas, con su día y su hora de Costa Rica.", "Ver el calendario"],
        llegar: ["📍", "¿Cómo llego al Gimnasio Nacional?", "El Gimnasio Nacional queda dentro del Parque Metropolitano La Sabana, en San José. Ahí también se sirven los almuerzos y las cenas.", "Abrir el mapa"],
        avisos: ["🔔", "¿Cómo me llegan los avisos al celular?", "Busca a tu jugador y toca la estrella ⭐ para seguirlo. Arriba aparece «Mis jugadores»: toca «Avisarme en este celular» y te llegan su mesa y su rival en cada ronda, y su resultado.", "Llévame al buscador"],
        instalar: ["📲", "¿Cómo la instalo en el celular?", "En Android: el menú ⋮ del navegador y «Instalar app» o «Agregar a la pantalla principal». En iPhone: el botón Compartir de Safari y «Agregar a inicio». Queda con el ícono del pizote y abre aunque no haya internet en la sala.", ""],
        esperar: ["🎈", "¿Qué hacemos mientras esperamos?", "Para los hermanos, los amigos y los que ya terminaron su partida hay juegos de ajedrez gratis y sin cuenta.", "Ver los juegos"],
        academia: ["🏫", "¿Quiénes hacen esta página?", "La Academia Ajedrez Integral, de Costa Rica: damos clases de ajedrez en línea y entrenamiento todo el año. Durante el festival puedes probarla gratis 5 días, sin correo y sin tarjeta.", "Conocer la Academia"],
      },
    },
    en: {
      boton: "Need help?", botonAria: "Need help? The most common questions about the tournament",
      hola: "Hi! I'm the coach", intro: "I'll help you find what you need about the Championship. What are you looking for?",
      cerrar: "Close", otras: "← Other questions",
      preguntas: {
        mesa: ["🔎", "Which board is my child playing on?", "Type their last name in “Find your player”: you'll see their board, color and opponent in today's round, their section and how they're doing.", "Take me to the search"],
        hora: ["🗓️", "What time is the round?", "At the top, “Today at the tournament” has the countdown to the next round. The schedule has all of them, with their day and Costa Rica time.", "See the schedule"],
        llegar: ["📍", "How do I get to the Gimnasio Nacional?", "The Gimnasio Nacional is inside La Sabana Metropolitan Park, in San José. Lunch and dinner are also served there.", "Open the map"],
        avisos: ["🔔", "How do I get alerts on my phone?", "Find your player and tap the star ⭐ to follow them. “My players” shows up at the top: tap “Alert me on this phone” to get their board and opponent every round, and their result.", "Take me to the search"],
        instalar: ["📲", "How do I install it on my phone?", "On Android: the browser's ⋮ menu and “Install app” or “Add to Home screen”. On iPhone: Safari's Share button and “Add to Home Screen”. It gets the pizote icon and opens even without internet at the venue.", ""],
        esperar: ["🎈", "What can we do while we wait?", "For siblings, friends and those who already finished their game there are free chess games, no account needed.", "See the games"],
        academia: ["🏫", "Who makes this page?", "Academia Ajedrez Integral, from Costa Rica: we teach chess online and offer training all year. During the festival you can try it free for 5 days, no email and no card.", "Meet the Academy"],
      },
    },
  };
  const T = () => (V.idioma() === "fr" && window.CentroamericanoFR && window.CentroamericanoFR.profe) || TEXTOS[V.idioma()] || TEXTOS.es;
  const POSE = { lista: "presentando", mesa: "te-toca", hora: "reloj-de-ajedrez", llegar: "frente", avisos: "atencion", instalar: "idea", esperar: "jugando", academia: "presentando" };

  // Lo que hace el botón de cada respuesta: lleva a su lugar de la página.
  function abrirDialogo(id) {
    const d = document.getElementById(id);
    if (!d || d.open) return;
    if (window.VentanaEnlace && window.VentanaEnlace.abrirDialogo) window.VentanaEnlace.abrirDialogo(d, boton); else d.showModal();
  }
  const ACCION = {
    mesa: () => { const c = document.getElementById("buscador-nombre"); if (c) { c.scrollIntoView({ block: "center" }); c.focus({ preventScroll: true }); } },
    avisos: () => ACCION.mesa(),
    hora: () => abrirDialogo("calendario"),
    llegar: () => { const a = document.querySelector('a[href*="google.com/maps"][href*="Gimnasio"]'); if (a) window.open(a.href, "_blank", "noopener"); },
    esperar: () => abrirDialogo("esperas"),
    academia: () => { const c = document.getElementById("conoce"); if (c) { c.scrollIntoView({ block: "start" }); const h = c.querySelector("h2"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } } },
  };

  /* ---------------- el botón ---------------- */
  const boton = el("button", "cac-profe-boton");
  boton.type = "button";
  boton.id = "profe-boton";
  boton.setAttribute("aria-expanded", "false");
  boton.setAttribute("aria-controls", "profe-panel");
  // Sus textos los pone este archivo en cada idioma: el traductor de la página no los toca.
  boton.dataset.noTraducir = "";
  const globo = el("span", "cac-profe-globo");
  const cara = el("span", "cac-profe-cara");
  const img = el("img", "");
  img.src = ruta("hola");
  img.alt = "";
  cara.appendChild(img);
  boton.append(globo, cara);

  const panel = el("div", "cac-profe-panel");
  panel.id = "profe-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "profe-titulo");
  panel.dataset.noTraducir = "";

  let visto = false;
  try { visto = localStorage.getItem(CLAVE_VISTO) === "1"; } catch (e) { visto = false; }
  function pintarBoton() {
    const tx = T();
    globo.textContent = tx.boton;
    globo.hidden = visto;
    boton.setAttribute("aria-label", tx.botonAria);
  }

  function figura(pose) {
    const i = el("img", "cac-profe-figura");
    i.src = ruta(pose);
    i.alt = "";
    return i;
  }
  function cabeza(pose, titulo, texto) {
    const c = el("div", "cac-profe-cabeza");
    const h = el("h2", "cac-profe-titulo", titulo);
    h.id = "profe-titulo";
    h.tabIndex = -1;
    const d = el("div", "");
    d.append(h, el("p", "cac-profe-texto", texto));
    c.append(figura(pose), d);
    return c;
  }
  function cerrarX() {
    const x = el("button", "cac-profe-cerrar", "✕");
    x.type = "button";
    x.setAttribute("aria-label", T().cerrar);
    x.addEventListener("click", () => cerrar(true));
    return x;
  }

  function pintarLista(foco) {
    const tx = T();
    const ul = el("ul", "cac-profe-lista");
    Object.keys(tx.preguntas).forEach((k) => {
      const [icono, pregunta] = tx.preguntas[k];
      const li = el("li", "");
      const b = el("button", "cac-profe-pregunta");
      b.type = "button";
      b.dataset.pregunta = k;
      b.appendChild(el("span", "", icono + " ")).setAttribute("aria-hidden", "true");
      b.appendChild(document.createTextNode(pregunta));
      b.addEventListener("click", () => pintarRespuesta(k));
      li.appendChild(b);
      ul.appendChild(li);
    });
    panel.replaceChildren(cerrarX(), cabeza(POSE.lista, tx.hola, tx.intro), ul);
    const f = foco ? panel.querySelector('[data-pregunta="' + foco + '"]') : panel.querySelector("[data-pregunta]");
    if (f) f.focus();
  }

  function pintarRespuesta(k) {
    const tx = T();
    const [, pregunta, respuesta, accion] = tx.preguntas[k];
    const fila = el("div", "cac-profe-acciones");
    if (accion && ACCION[k]) {
      const b = el("button", "cac-boton", accion);
      b.type = "button";
      b.dataset.accion = k;
      b.addEventListener("click", () => { cerrar(false); ACCION[k](); });
      fila.appendChild(b);
    }
    const volver = el("button", "cac-jugador-boton", tx.otras);
    volver.type = "button";
    volver.dataset.volver = "";
    volver.addEventListener("click", () => pintarLista(k));
    fila.appendChild(volver);
    panel.replaceChildren(cerrarX(), cabeza(POSE[k], pregunta, respuesta), fila);
    panel.dataset.respuesta = k;
    panel.querySelector("#profe-titulo").focus();
  }

  function abrir() {
    panel.hidden = false;
    boton.setAttribute("aria-expanded", "true");
    delete panel.dataset.respuesta;
    if (!visto) { visto = true; try { localStorage.setItem(CLAVE_VISTO, "1"); } catch (e) { /* sin espacio: sale otra vez */ } pintarBoton(); }
    pintarLista();
  }
  function cerrar(devolverFoco) {
    panel.hidden = true;
    boton.setAttribute("aria-expanded", "false");
    if (devolverFoco) boton.focus();
  }
  boton.addEventListener("click", () => (panel.hidden ? abrir() : cerrar(true)));
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); cerrar(true); } });
  // Un clic afuera lo cierra. El botón de una pregunta ya no está en la página
  // cuando llega acá (el panel se repintó): ese clic fue adentro.
  document.addEventListener("click", (e) => { if (!panel.hidden && e.target.isConnected && !panel.contains(e.target) && !boton.contains(e.target)) cerrar(false); });
  document.addEventListener("cac-idioma", () => { pintarBoton(); if (!panel.hidden) { if (panel.dataset.respuesta) pintarRespuesta(panel.dataset.respuesta); else pintarLista(); } });

  pintarBoton();
  document.body.append(panel, boton);
  window.CentroamericanoProfe = { abrir, cerrar: () => cerrar(false) };
})();
