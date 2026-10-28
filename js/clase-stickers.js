/* ===== Ajedrez Integral — Los stickers del profe en la clase en vivo =====
 *
 * El profe le manda a la clase (o a un solo alumno) un dibujo del profe Oscar
 * con una frase: «¡Muy bien!», «¡Esfuérzate más!», «¡Nos vemos la próxima
 * clase!»… La frase viene sugerida con cada dibujo y el profe la cambia si
 * quiere. Le sale a cada alumno encima de la clase unos segundos y se va solo.
 *
 * Viaja en game_state.sticker ({id, texto, para, at}), como el tiempo para
 * pensar: solo el profe lo escribe (protect_game_state_teacher_columns), la
 * hora la pone la base y la forma la revisa un CHECK. «para» es un alumno o
 * nada (toda la clase): la fila la lee toda la clase, así que un sticker
 * «solo para» uno es privado en la pantalla, no en la base; por eso es para
 * animar, no para decir algo que el resto no pueda saber.
 *
 * Quien entra después no ve uno viejo: se muestra solo mientras tiene menos
 * de DURA milisegundos, con la hora de la base (js/reloj-servidor.js).
 *
 * Los dibujos están en img/profe-oscar/ (WebP de 480 px de alto, sin fondo).
 * Ver «Los stickers del profe» en docs/decisiones/clase-en-vivo.md.
 */
window.ClaseStickers = (function () {
  "use strict";

  // id = nombre del archivo; texto = la frase sugerida; alt = lo que se ve.
  const CATALOGO = [
    { id: "muy-bien", texto: "¡Muy bien!", alt: "El profe Oscar guiñando un ojo, con los dos pulgares arriba" },
    { id: "bien-hecho", texto: "¡Bien hecho!", alt: "El profe Oscar con el pulgar arriba" },
    { id: "excelente", texto: "¡Excelente!", alt: "El profe Oscar saltando de alegría" },
    { id: "lo-lograron", texto: "¡Todo el grupo lo logró!", alt: "El profe Oscar aplaudiendo entre confeti" },
    { id: "felicidades", texto: "¡Felicidades!", alt: "El profe Oscar con una medalla y un diploma" },
    { id: "campeones", texto: "¡Campeones!", alt: "El profe Oscar levantando un trofeo" },
    { id: "wow", texto: "¡Wow!", alt: "El profe Oscar sorprendido, con las manos en la cara" },
    { id: "tu-puedes", texto: "¡Tú puedes!", alt: "El profe Oscar con el puño adelante, dando ánimo" },
    { id: "esfuerzate", texto: "¡Esfuérzate más!", alt: "El profe Oscar serio, con las manos en la cintura" },
    { id: "casi", texto: "¡Casi! Faltó poquito", alt: "El profe Oscar haciendo «un poquito» con los dedos" },
    { id: "esa-no-es", texto: "Esa no es…", alt: "El profe Oscar diciendo que no con el dedo" },
    { id: "esa-vara", texto: "¿Y esa vara?", alt: "El profe Oscar extrañado, rascándose la cabeza" },
    { id: "no-puede-ser", texto: "¡No puede ser!", alt: "El profe Oscar con la mano en la frente" },
    { id: "mmm", texto: "Mmmm…", alt: "El profe Oscar pensativo, tocándose la barba" },
    { id: "idea", texto: "¡Tengo una idea!", alt: "El profe Oscar pensando, con un bombillo encendido" },
    { id: "atencion", texto: "¡Atención!", alt: "El profe Oscar con el dedo índice arriba" },
    { id: "silencio", texto: "Silencio, a concentrarse", alt: "El profe Oscar pidiendo silencio con el dedo en la boca" },
    { id: "tiempo", texto: "¡Se acaba el tiempo!", alt: "El profe Oscar mirando su reloj, apurado" },
    { id: "te-toca", texto: "¡Te toca a ti!", alt: "El profe Oscar señalando al frente" },
    { id: "dormidos", texto: "¿Se durmieron?", alt: "El profe Oscar bostezando" },
    { id: "risa", texto: "¡Jajaja!", alt: "El profe Oscar riéndose a carcajadas" },
    { id: "a-repasar", texto: "A repasar la teoría", alt: "El profe Oscar leyendo un libro de ajedrez" },
    { id: "hola", texto: "¡Hola, grupo!", alt: "El profe Oscar saludando con la mano" },
    { id: "bienvenidos", texto: "¡Bienvenidos a la clase!", alt: "El profe Oscar con los brazos abiertos" },
    { id: "gracias", texto: "¡Gracias por la clase!", alt: "El profe Oscar haciendo un corazón con las manos" },
    { id: "nos-vemos", texto: "¡Nos vemos la próxima clase!", alt: "El profe Oscar despidiéndose con la mochila al hombro" },
  ];
  const DURA = 8000;          // cuánto se ve, en milisegundos
  const MAX_TEXTO = 120;      // lo mismo que el CHECK de la base

  const BTN = "rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const BTN_CHICO = BTN + " text-xs font-semibold px-3 py-2 bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";
  const BTN_FUERTE = BTN + " text-sm font-semibold px-4 py-2 bg-accent-500 hover:bg-accent-600 text-brand-900";

  const ruta = (id) => "img/profe-oscar/" + id + ".webp";
  const porId = (id) => CATALOGO.find((s) => s.id === id) || null;
  const ahora = () => (window.RelojServidor ? window.RelojServidor.ahora() : Date.now());

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /* ¿Se ve este sticker ahora, para quien mira? Devuelve cuánto le queda
     (milisegundos) o null. El profe ve todos los suyos, también los que
     mandó a un solo alumno. */
  function vigente(st, cuando, opciones) {
    if (!st || typeof st !== "object" || !porId(st.id)) return null;
    const o = opciones || {};
    if (st.para && !o.esProfe && st.para !== o.yo) return null;
    const at = Date.parse(st.at);
    if (!isFinite(at)) return null;
    const edad = cuando - at;
    // Un poco de tolerancia hacia atrás: un reloj apenas adelantado no lo esconde.
    if (edad < -3000 || edad >= DURA) return null;
    return DURA - Math.max(0, edad);
  }

  /* ---------- Lo que ve la clase ---------- */
  let caja = null, temporizador = null, mostradoAt = null;

  function asegurarCaja() {
    if (caja) return caja;
    // Va suelto en el <body>: el proyector esconde por lista blanca dentro de
    // la clase, no lo que flota encima, así que también sale proyectado.
    caja = el("div", "clase-sticker");
    caja.id = "clase-sticker";
    caja.hidden = true;
    const tarjeta = el("div", "clase-sticker-tarjeta");
    const globo = el("p", "clase-sticker-globo");
    globo.id = "clase-sticker-texto";
    const img = el("img", "clase-sticker-img");
    img.id = "clase-sticker-img";
    img.decoding = "async";
    const para = el("p", "clase-sticker-para");
    para.id = "clase-sticker-para";
    const cerrar = el("button", "clase-sticker-cerrar", "×");
    cerrar.type = "button";
    cerrar.id = "clase-sticker-cerrar";
    cerrar.setAttribute("aria-label", "Cerrar el sticker");
    cerrar.addEventListener("click", ocultar);
    tarjeta.append(globo, img, para, cerrar);
    // Lo que se dice en voz va aparte: el dibujo entra y sale solo.
    const voz = el("p", "sr-only");
    voz.id = "clase-sticker-voz";
    voz.setAttribute("aria-live", "polite");
    caja.append(tarjeta);
    document.body.append(caja, voz);
    return caja;
  }

  function ocultar() {
    clearTimeout(temporizador);
    if (caja) caja.hidden = true;
  }

  /* opciones: { esProfe, yo, nombreDe(id) } */
  function mostrar(st, opciones) {
    const o = opciones || {};
    const queda = vigente(st, ahora(), o);
    if (queda == null) { if (!st) ocultar(); return false; }
    if (mostradoAt === st.at) return true;   // el mismo de antes (un eco de Realtime)
    mostradoAt = st.at;
    const s = porId(st.id);
    asegurarCaja();
    const texto = (st.texto || "").trim();
    const globo = document.getElementById("clase-sticker-texto");
    globo.textContent = texto;               // lo escribió el profe: textContent
    globo.hidden = !texto;
    const img = document.getElementById("clase-sticker-img");
    img.src = ruta(s.id);
    img.alt = s.alt;
    const para = document.getElementById("clase-sticker-para");
    para.hidden = !(o.esProfe && st.para);
    para.textContent = st.para ? "Solo para " + (o.nombreDe ? o.nombreDe(st.para) : "un alumno") : "";
    caja.hidden = false;
    // Vuelve a arrancar la animación aunque ya estuviera a la vista.
    caja.classList.remove("clase-sticker-entra");
    void caja.offsetWidth;
    caja.classList.add("clase-sticker-entra");
    document.getElementById("clase-sticker-voz").textContent =
      (o.esProfe ? "Sticker enviado: " : "Tu profe te manda un sticker: ") + (texto || s.alt) + ".";
    clearTimeout(temporizador);
    temporizador = setTimeout(ocultar, queda);
    return true;
  }

  /* ---------- Lo que usa el profe para mandarlo ----------
     opciones: { contenedor, conectados() → [{id, nombre}], mandar(sticker) → Promise<bool> } */
  function montarProfe(opciones) {
    const o = opciones || {};
    if (!o.contenedor || typeof o.mandar !== "function") return null;
    const boton = el("button", "w-full mt-2 " + BTN_FUERTE.replace("text-sm", "text-xs"));
    boton.type = "button";
    boton.id = "clase-stickers-abrir";
    boton.setAttribute("aria-haspopup", "dialog");
    const ico = el("span", null, "😀 ");
    ico.setAttribute("aria-hidden", "true");
    boton.append(ico, document.createTextNode("Mandar un sticker del profe"));
    boton.addEventListener("click", () => abrirDialogo(o, boton));
    o.contenedor.appendChild(boton);
    return boton;
  }

  function abrirDialogo(o, boton) {
    const d = el("dialog", "clase-stickers-dialogo w-[calc(100%-2rem)] max-w-2xl rounded-2xl shadow-2xl p-0 bg-white dark:bg-brand-900 text-brand-800 dark:text-white backdrop:bg-black/50");
    d.id = "clase-stickers-dialogo";
    const form = el("form", "p-5 flex flex-col gap-3");
    form.method = "dialog";
    const titulo = el("h2", "font-serif text-lg font-bold", "Mandar un sticker del profe");
    titulo.id = "clase-stickers-titulo";
    d.setAttribute("aria-labelledby", titulo.id);
    const ayuda = el("p", "text-sm text-brand-500 dark:text-brand-300",
      "Elige un dibujo; la frase se puede cambiar. Le sale a la clase unos segundos y se va solo.");
    form.append(titulo, ayuda);

    // Los dibujos, como un grupo de botones que se marcan (uno a la vez).
    const grilla = el("div", "clase-stickers-grilla");
    grilla.setAttribute("role", "group");
    grilla.setAttribute("aria-label", "Dibujos");
    let elegido = null;
    const texto = el("input", "w-full text-sm bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-brand-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500");
    texto.type = "text";
    texto.id = "clase-stickers-texto";
    texto.maxLength = MAX_TEXTO;
    texto.placeholder = "La frase (opcional)";
    const botones = CATALOGO.map((s) => {
      const b = el("button", "clase-stickers-opcion " + BTN);
      b.type = "button";
      b.dataset.sticker = s.id;
      b.setAttribute("aria-pressed", "false");
      const img = el("img");
      img.src = ruta(s.id);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      b.append(img, el("span", "clase-stickers-frase", s.texto));
      b.title = s.alt;
      b.addEventListener("click", () => {
        elegido = s;
        botones.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
        texto.value = s.texto;
        mandarBtn.disabled = false;
      });
      grilla.appendChild(b);
      return b;
    });
    form.appendChild(grilla);

    const etTexto = el("label", "text-sm font-semibold", "Qué dice");
    etTexto.htmlFor = texto.id;
    const para = el("select", "w-full text-sm bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-brand-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500");
    para.id = "clase-stickers-para";
    const todos = el("option", null, "Toda la clase");
    todos.value = "";
    para.appendChild(todos);
    (typeof o.conectados === "function" ? o.conectados() : []).forEach((a) => {
      const op = el("option", null, "Solo " + a.nombre);
      op.value = a.id;
      para.appendChild(op);
    });
    const etPara = el("label", "text-sm font-semibold", "A quién");
    etPara.htmlFor = para.id;
    const filas = el("div", "grid gap-2 sm:grid-cols-2");
    const c1 = el("div", "flex flex-col gap-1"); c1.append(etTexto, texto);
    const c2 = el("div", "flex flex-col gap-1"); c2.append(etPara, para);
    filas.append(c1, c2);
    form.appendChild(filas);

    const acciones = el("div", "flex flex-wrap justify-end gap-2");
    const cancelar = el("button", BTN_CHICO, "Cancelar");
    cancelar.type = "button";
    const mandarBtn = el("button", BTN_FUERTE, "Mandar el sticker");
    mandarBtn.type = "button";
    mandarBtn.id = "clase-stickers-mandar";
    mandarBtn.disabled = true;
    acciones.append(cancelar, mandarBtn);
    form.appendChild(acciones);
    d.appendChild(form);

    let listo = false;
    function terminar() {
      if (listo) return;
      listo = true;
      if (d.open) d.close();
      d.remove();
      if (document.contains(boton)) boton.focus();
    }
    cancelar.addEventListener("click", terminar);
    d.addEventListener("cancel", (e) => { e.preventDefault(); terminar(); });
    mandarBtn.addEventListener("click", async () => {
      if (!elegido) return;
      mandarBtn.disabled = true;
      const sticker = {
        id: elegido.id,
        texto: texto.value.trim().slice(0, MAX_TEXTO) || null,
        para: para.value || null,
        // La base la cambia por su hora (ver la migración).
        at: new Date().toISOString(),
      };
      const ok = await o.mandar(sticker);
      if (ok) terminar();
      else mandarBtn.disabled = false;
    });

    document.body.appendChild(d);
    d.showModal();
    botones[0].focus();
  }

  return { CATALOGO, DURA, MAX_TEXTO, ruta, porId, vigente, mostrar, ocultar, montarProfe };
})();
