/* «Conoce la Academia» y la cuenta gratis de 5 días en la página del
 * Centroamericano 2026. Lo pidió el dueño: que quien entra a la página del
 * torneo conozca la Academia Ajedrez Integral y la pruebe, y que la cuenta se
 * la abra cada uno solo, sin que él intervenga, durante el festival.
 *
 * - La sección (#conoce) dice lo que trae la Academia y lleva a la ventana
 *   #cuenta-gratis, a los precios y al WhatsApp.
 * - La ventana pide nombre y contraseña, con la casilla de la Política de
 *   privacidad y los Términos, y llama a la Edge Function `cuenta-invitado`.
 *   QUIEN DECIDE ES LA BASE: las fechas (1 al 9 de noviembre, hora de Costa
 *   Rica), el freno y los 5 días los ponen cuenta_invitado_frenar() y
 *   cuenta_invitado_activar(). La fecha que mira esta página solo decide qué
 *   se pinta: fuera de fechas, en lugar del formulario, el WhatsApp.
 * - Al crearla enseña el usuario y la contraseña para anotarlos (la cuenta no
 *   tiene correo para recuperarla) y «Entrar a la Academia» inicia sesión con
 *   ellos. Lo que la persona juntó como invitado (las estrellas) sube solo al
 *   entrar: js/progreso-usuario.js junta lo del aparato con lo de la cuenta.
 * - Español e inglés aquí; el francés en CentroamericanoFR.academia.
 *
 * Ver «Las cuentas de invitado del Centroamericano» en
 * docs/decisiones/cobros-acceso-y-tienda.md.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  const seccion = document.getElementById("conoce");
  const dialogo = document.getElementById("cuenta-gratis");
  if (!V || !seccion || !dialogo) return;
  const el = V.el;
  const contenido = document.getElementById("cuenta-gratis-contenido");
  const titulo = document.getElementById("cuenta-gratis-titulo");
  const ZONA = "America/Costa_Rica";
  const DESDE = "2026-11-01", HASTA = "2026-11-09";
  const WHATSAPP = "50683092291";

  const TEXTOS = {
    es: {
      etiqueta: "Academia Ajedrez Integral",
      tituloSeccion: "Esta página la hace una academia de ajedrez",
      intro: "Somos la Academia Ajedrez Integral, de Costa Rica. Lo que ves aquí —el buscador, los avisos, las partidas en vivo, los ejercicios— lo hacemos para jugadores y familias. Y esto es lo que hacemos todo el año:",
      cosas: [
        ["🎓", "Clases en línea con su profe", "Grupos por nivel y clases individuales, desde cualquier país, con tablero en vivo."],
        ["🧩", "Entrenamiento todos los días", "Miles de ejercicios, la prueba de nivel con su Elo estimado y la prueba de estilo de juego."],
        ["⭐", "Para los que empiezan", "«Aprende a jugar» paso a paso y juegos para aprender sin darse cuenta."],
        ["🏆", "Para árbitros y organizadores", "Pareo Integral, el emparejador de torneos gratis, y Notara, la cámara que anota la partida."],
      ],
      gratis: "Pruébala gratis 5 días",
      gratisTexto: "Durante el festival, del 1 al 9 de noviembre, te abres tu cuenta tú mismo: sin correo, sin tarjeta y sin pagar nada. Se cierra sola a los 5 días.",
      crear: "Crear mi cuenta gratis",
      precios: "Ver planes y precios",
      whatsapp: "Escríbenos por WhatsApp",
      whatsappTexto: "Hola, vi la Academia en la página del Centroamericano 2026 y quiero información.",
      espanol: "La Academia está en español.",
      tituloDialogo: "Tu cuenta gratis de 5 días",
      cerrada: (desde) => "Las cuentas gratis del Centroamericano se abren del 1 al 9 de noviembre de 2026" + (desde ? "" : " y ya se cerraron") + ". Si quieres probar la Academia, escríbenos por WhatsApp y te la abrimos.",
      que: "Te abres una cuenta de alumno de la Academia por 5 días, gratis, sin correo y sin tarjeta. Se cierra sola: no se cobra nada ni queda nada pendiente.",
      nombre: "Tu nombre y apellido",
      nombreAyuda: "Con él se arma tu usuario para entrar.",
      clave: "Una contraseña",
      claveAyuda: "Mínimo 8 caracteres. Anótala: la cuenta no tiene correo para recuperarla.",
      mostrar: "Mostrar", ocultar: "Ocultar",
      acepto: ["Acepto la ", "Política de privacidad", " y los ", "Términos y condiciones", ". Si eres menor de edad, créala con tu mamá, papá o encargado."],
      enviar: "Crear mi cuenta gratis",
      enviando: "Creando tu cuenta…",
      faltaNombre: "Escribe tu nombre y apellido.",
      faltaClave: "La contraseña tiene que tener al menos 8 caracteres.",
      faltaAcepto: "Para crear la cuenta hay que aceptar la Política de privacidad y los Términos.",
      sinRed: "No se pudo crear la cuenta. Revisa tu conexión e intenta de nuevo.",
      lista: (n) => "¡Listo, " + n + "! Tu cuenta está abierta",
      anota: "Anota tu usuario y tu contraseña (o tómale una foto a esta pantalla): son los que vas a escribir para entrar.",
      usuario: "Usuario", contrasena: "Contraseña", hasta: "Dura hasta el",
      copiar: "Copiar mis datos", copiado: "Copiado ✓",
      entrar: "Entrar a la Academia",
      entrando: "Entrando…",
      noEntro: "La cuenta quedó creada, pero no pudimos entrar solos. Entra desde la página de inicio de sesión con tu usuario y tu contraseña.",
      irLogin: "Ir a iniciar sesión",
      datos: (u, c, h) => "Academia Ajedrez Integral\nUsuario: " + u + "\nContraseña: " + c + "\nDura hasta el " + h + "\nhttps://ajedrez-integral.com/login",
      locale: "es-CR",
    },
    en: {
      etiqueta: "Academia Ajedrez Integral",
      tituloSeccion: "This page is made by a chess academy",
      intro: "We are Academia Ajedrez Integral, from Costa Rica. What you see here —the player search, the alerts, the live games, the puzzles— we make for players and families. And this is what we do all year:",
      cosas: [
        ["🎓", "Online classes with a coach", "Groups by level and private lessons, from any country, with a live board."],
        ["🧩", "Training every day", "Thousands of puzzles, the level test with an estimated rating and the playing-style test."],
        ["⭐", "For beginners", "“Learn to play” step by step, and games to learn without noticing."],
        ["🏆", "For arbiters and organizers", "Pareo Integral, the free tournament pairing tool, and Notara, the camera that records the game."],
      ],
      gratis: "Try it free for 5 days",
      gratisTexto: "During the festival, November 1–9, you open your own account: no email, no card, nothing to pay. It closes by itself after 5 days.",
      crear: "Create my free account",
      precios: "See plans and prices",
      whatsapp: "Message us on WhatsApp",
      whatsappTexto: "Hi, I saw the Academy on the Centroamericano 2026 page and I'd like more information.",
      espanol: "The Academy is in Spanish.",
      tituloDialogo: "Your free 5-day account",
      cerrada: (desde) => "Free Centroamericano accounts are open November 1–9, 2026" + (desde ? "" : " and are now closed") + ". If you want to try the Academy, message us on WhatsApp and we'll open one for you.",
      que: "You open a student account at the Academy for 5 days, free, with no email and no card. It closes by itself: nothing is charged and nothing is left pending.",
      nombre: "Your first and last name",
      nombreAyuda: "Your username is made from it.",
      clave: "A password",
      claveAyuda: "At least 8 characters. Write it down: the account has no email to recover it.",
      mostrar: "Show", ocultar: "Hide",
      acepto: ["I accept the ", "Privacy Policy", " and the ", "Terms and Conditions", ". If you are a minor, create it with your parent or guardian."],
      enviar: "Create my free account",
      enviando: "Creating your account…",
      faltaNombre: "Type your first and last name.",
      faltaClave: "The password must have at least 8 characters.",
      faltaAcepto: "To create the account you have to accept the Privacy Policy and the Terms.",
      sinRed: "We couldn't create the account. Check your connection and try again.",
      lista: (n) => "Done, " + n + "! Your account is open",
      anota: "Write down your username and password (or take a screenshot): you'll type them to sign in.",
      usuario: "Username", contrasena: "Password", hasta: "Valid until",
      copiar: "Copy my details", copiado: "Copied ✓",
      entrar: "Go to the Academy",
      entrando: "Signing in…",
      noEntro: "Your account was created, but we couldn't sign you in automatically. Sign in from the login page with your username and password.",
      irLogin: "Go to sign in",
      datos: (u, c, h) => "Academia Ajedrez Integral\nUsername: " + u + "\nPassword: " + c + "\nValid until " + h + "\nhttps://ajedrez-integral.com/login",
      locale: "en-US",
    },
  };
  const T = () => (V.idioma() === "fr" && window.CentroamericanoFR && window.CentroamericanoFR.academia) || TEXTOS[V.idioma()] || TEXTOS.es;

  const hoyCR = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
  const abierta = () => { const d = hoyCR(); return d >= DESDE && d <= HASTA; };
  const fechaCR = (iso, locale) => new Date(iso).toLocaleString(locale, { timeZone: ZONA, day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  const enlaceWA = (tx) => "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(tx.whatsappTexto);

  function enlace(texto, href, clase, nueva) {
    const a = el("a", clase, texto);
    a.href = href;
    if (nueva) { a.target = "_blank"; a.rel = "noopener"; }
    return a;
  }

  /* ---------------- la sección ---------------- */
  function pintarSeccion() {
    const tx = T();
    const caja = el("div", "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8");
    caja.appendChild(el("p", "cac-conoce-etiqueta", tx.etiqueta));
    const h = el("h2", "cac-conoce-titulo", tx.tituloSeccion);
    h.id = "conoce-titulo";
    caja.append(h, el("p", "cac-conoce-intro", tx.intro));
    const ul = el("ul", "cac-conoce-lista");
    tx.cosas.forEach(([icono, t, d]) => {
      const li = el("li", "cac-conoce-cosa");
      li.appendChild(el("span", "cac-conoce-icono", icono)).setAttribute("aria-hidden", "true");
      li.append(el("strong", "", t), el("span", "", d));
      ul.appendChild(li);
    });
    caja.appendChild(ul);
    const gratis = el("div", "cac-conoce-gratis");
    gratis.append(el("p", "cac-conoce-gratis-titulo", tx.gratis), el("p", "", tx.gratisTexto));
    const acciones = el("div", "cac-conoce-acciones");
    const crear = enlace(tx.crear, "#cuenta-gratis", "cac-boton");
    crear.dataset.crearCuenta = "";
    acciones.append(crear, enlace(tx.precios, "precios.html", "cac-jugador-boton cac-conoce-otro"),
      enlace(tx.whatsapp, enlaceWA(tx), "cac-jugador-boton cac-conoce-otro", true));
    gratis.appendChild(acciones);
    gratis.appendChild(el("p", "cac-conoce-nota", tx.espanol));
    caja.appendChild(gratis);
    seccion.replaceChildren(caja);
  }

  /* ---------------- la ventana ---------------- */
  let creada = null;   // { nombre, usuario, correo, clave, vence } al crearla: se queda al cambiar de idioma

  function campo(id, etiqueta, ayuda, input) {
    const d = el("div", "cac-cuenta-campo");
    const l = el("label", "", etiqueta);
    l.htmlFor = id;
    input.id = id;
    const p = el("p", "cac-cuenta-ayuda", ayuda);
    p.id = id + "-ayuda";
    input.setAttribute("aria-describedby", p.id);
    d.append(l, input, p);
    return d;
  }

  function pintarDialogo() {
    const tx = T();
    titulo.textContent = tx.tituloDialogo;
    if (creada) return pintarCreada();
    if (!abierta()) {
      const p = el("p", "", tx.cerrada(hoyCR() < DESDE));
      p.dataset.cerrada = "";
      const a = enlace(tx.whatsapp, enlaceWA(tx), "cac-boton mt-4", true);
      contenido.replaceChildren(p, a);
      return;
    }
    const form = el("form", "cac-cuenta-form");
    form.noValidate = true;
    const nombre = el("input", "cac-cuenta-input");
    Object.assign(nombre, { type: "text", maxLength: 80, autocomplete: "name", required: true });
    const clave = el("input", "cac-cuenta-input");
    Object.assign(clave, { type: "password", minLength: 8, maxLength: 72, autocomplete: "new-password", required: true });
    const fila = el("div", "cac-cuenta-clave");
    const ver = el("button", "cac-jugador-boton", tx.mostrar);
    ver.type = "button";
    ver.setAttribute("aria-pressed", "false");
    ver.addEventListener("click", () => {
      const si = clave.type === "password";
      clave.type = si ? "text" : "password";
      ver.textContent = si ? tx.ocultar : tx.mostrar;
      ver.setAttribute("aria-pressed", String(si));
    });
    const cClave = campo("cuenta-clave", tx.clave, tx.claveAyuda, clave);
    fila.append(clave, ver);
    cClave.insertBefore(fila, cClave.querySelector(".cac-cuenta-ayuda"));
    const acepto = el("label", "cac-cuenta-acepto");
    const caja = el("input", "");
    Object.assign(caja, { type: "checkbox", id: "cuenta-acepto", required: true });
    const [a1, a2, a3, a4, a5] = tx.acepto;
    const texto = el("span", "");
    texto.append(a1, enlace(a2, "privacidad.html", "underline", true), a3, enlace(a4, "terminos.html#cuenta-centroamericano", "underline", true), a5);
    acepto.append(caja, texto);
    const error = el("p", "cac-cuenta-error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    const enviar = el("button", "cac-boton", tx.enviar);
    enviar.type = "submit";
    form.append(el("p", "", tx.que), campo("cuenta-nombre", tx.nombre, tx.nombreAyuda, nombre), cClave, acepto, error, enviar);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const decir = (t, foco) => { error.textContent = t; error.hidden = false; if (foco) foco.focus(); };
      const n = nombre.value.replace(/\s+/g, " ").trim();
      if ((n.match(/\p{L}/gu) || []).length < 2) return decir(tx.faltaNombre, nombre);
      if (clave.value.length < 8) return decir(tx.faltaClave, clave);
      if (!caja.checked) return decir(tx.faltaAcepto, caja);
      error.hidden = true;
      enviar.disabled = true;
      enviar.textContent = tx.enviando;
      const legal = window.LegalVersion || {};
      let r = null;
      try {
        const { data, error: err } = await window.sb.functions.invoke("cuenta-invitado", {
          body: { nombre: n, contrasena: clave.value, privacidad_version: legal.PRIVACIDAD, terminos_version: legal.TERMINOS },
        });
        r = data;
        if (err) { try { r = await err.context.json(); } catch (x) { r = null; } }
      } catch (x) { r = null; }
      enviar.disabled = false;
      enviar.textContent = tx.enviar;
      if (!r || !r.ok) return decir((r && r.error) || tx.sinRed);
      creada = { nombre: n, usuario: r.usuario, correo: r.correo, clave: clave.value, vence: r.vence };
      pintarCreada();
    });
    contenido.replaceChildren(form);
  }

  function pintarCreada() {
    const tx = T();
    const c = creada;
    const hasta = fechaCR(c.vence, tx.locale);
    const caja = el("div", "cac-cuenta-lista");
    caja.dataset.creada = "";
    const h = el("p", "cac-cuenta-lista-titulo", tx.lista(c.nombre.split(" ")[0]));
    h.tabIndex = -1;
    const dl = el("dl", "cac-cuenta-datos");
    [[tx.usuario, c.usuario, "usuario"], [tx.contrasena, c.clave, "clave"], [tx.hasta, hasta, "hasta"]].forEach(([k, v, id]) => {
      const fila = el("div", "");
      const dd = el("dd", "", v);
      dd.dataset.dato = id;
      fila.append(el("dt", "", k), dd);
      dl.appendChild(fila);
    });
    const acciones = el("div", "cac-conoce-acciones");
    const entrar = el("button", "cac-boton", tx.entrar);
    entrar.type = "button";
    entrar.dataset.entrar = "";
    const copiar = el("button", "cac-jugador-boton", tx.copiar);
    copiar.type = "button";
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(tx.datos(c.usuario, c.clave, hasta)); copiar.textContent = tx.copiado; } catch (e) { /* sin portapapeles: los datos están a la vista */ }
    });
    const aviso = el("p", "cac-cuenta-error");
    aviso.setAttribute("role", "alert");
    aviso.hidden = true;
    entrar.addEventListener("click", async () => {
      entrar.disabled = true;
      entrar.textContent = tx.entrando;
      let ok = false;
      try {
        const { error } = await window.sb.auth.signInWithPassword({ email: c.correo, password: c.clave });
        ok = !error;
      } catch (e) { ok = false; }
      if (ok) { location.href = "clases.html"; return; }
      entrar.disabled = false;
      entrar.textContent = tx.entrar;
      aviso.replaceChildren(tx.noEntro + " ", enlace(tx.irLogin, "login.html", "underline"));
      aviso.hidden = false;
    });
    acciones.append(entrar, copiar);
    caja.append(h, el("p", "", tx.anota), dl, aviso, acciones);
    contenido.replaceChildren(caja);
    h.focus();
  }

  // La ventana se pinta al abrirse (y se vuelve a pintar si cambia el día).
  new MutationObserver(() => { if (dialogo.open) pintarDialogo(); })
    .observe(dialogo, { attributes: true, attributeFilter: ["open"] });
  document.addEventListener("cac-idioma", () => { pintarSeccion(); if (dialogo.open) pintarDialogo(); });

  pintarSeccion();
  // Entrar con «#cuenta-gratis» la abre antes de que este archivo cargue.
  if (dialogo.open) pintarDialogo();
  window.CentroamericanoAcademia = { abrir: () => { if (!dialogo.open) (window.VentanaEnlace && window.VentanaEnlace.abrirDialogo ? window.VentanaEnlace.abrirDialogo(dialogo) : dialogo.showModal()); } };
})();
