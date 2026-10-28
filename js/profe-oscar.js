/* ===== Ajedrez Integral — El profe Oscar, ayudante del alumno =====
 *
 * El avatar del profe Oscar (las poses de js/avatar-profe-oscar.js) como
 * entrenador y guía del alumno, en cuatro lugares y una sola copia:
 *
 *   1. El panel (clases.html): es la cara de la franja de arriba, la de lo
 *      que vence y el siguiente paso (pintarFranja en js/clases.js). No es
 *      una franja nueva: dos peleando por el primer lugar es el problema que
 *      el panel ya tuvo. Cada caso trae su pose («¡Se acaba el tiempo!» con
 *      una tarea vencida, «Les presento…» con el primer paso).
 *   2. «Hoy te toca» (js/hoy-te-toca.js, en el panel y en el hub de
 *      Entrenamiento): el plan del día, con Oscar dando ánimo o celebrando
 *      la meta del día cumplida. En el panel, si la franja ya tiene a Oscar,
 *      no sale dos veces.
 *   3. Los ejercicios (js/ejercicio-tablero.js): cuando el alumno pide una
 *      pista, Oscar la dice en su globo debajo de los botones (nunca encima
 *      del tablero), y cuando junta una racha (3, 5, 10…) lo felicita. Lo que
 *      dice es la MISMA frase que la página ya dijo en voz: Oscar no inventa
 *      pistas, las pone en su boca.
 *   4. «Pregúntale al profe» (solo en el panel del alumno): un chat que
 *      contesta con enlaces a donde está lo que busca. Busca en las tarjetas
 *      del panel (las mismas que el buscador, con sus palabras clave) y en
 *      los temas, mates, aperturas, habilidades y fichas de Estudio de
 *      js/material-plataforma.js. No hay IA: si no encuentra nada, lo dice y
 *      sugiere palabras.
 *
 * Se apaga: el alumno lo esconde desde «Pregúntale al profe» (vale para este
 * aparato, en localStorage: es una comodidad de quien mira, no un dato), y
 * con la cuenta ciega no se pinta nunca (el sitio ya dice todo en voz; un
 * dibujo no le suma nada). Las imágenes son adorno (alt=""): lo que dice va
 * escrito al lado.
 *
 * Ver «El profe Oscar, ayudante del alumno» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";
  if (window.ProfeOscar) return;

  /* De la página a la raíz del sitio, sacado de la dirección de este mismo
     archivo: lo cargan páginas de la raíz y de entreno/, y también
     js/ejercicio-tablero.js por su cuenta. */
  const ESTE = document.currentScript && document.currentScript.src;
  const BASE = ESTE ? ESTE.replace(/js\/profe-oscar\.js(\?.*)?$/, "") : "";

  const CLAVE = "profe_oscar_v1";
  function oculto() { try { return localStorage.getItem(CLAVE) === "oculto"; } catch (e) { return false; } }
  function ciego() { return document.documentElement.classList.contains("modo-ciego"); }
  function activo() { return !oculto() && !ciego(); }
  /* Esconderlo saca sus dibujos y devuelve el emoji de la franja; volver a
     mostrarlo lo pide quien pinta (el panel vuelve a ponerlo, ver
     `alMostrar` en montarPregunta). */
  function esconder(si) {
    try { if (si) localStorage.setItem(CLAVE, "oculto"); else localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
    if (!si) return;
    document.querySelectorAll("img[data-profe-oscar]").forEach((el) => el.remove());
    const emoji = document.getElementById("pendientes-aviso-emoji");
    if (emoji) emoji.hidden = false;
    quitarGlobo();
  }

  /* La dirección de cada pose sale de la lista (AvatarProfeOscar.ruta); si la
     página no la cargó, la misma regla escrita una vez más acá abajo. */
  function ruta(id) {
    return BASE + (window.AvatarProfeOscar ? AvatarProfeOscar.ruta(id) : "img/avatar-profe-oscar/" + id + ".webp");
  }
  function imagen(id, clases) {
    const img = document.createElement("img");
    img.src = ruta(id);
    img.alt = "";
    img.decoding = "async";
    img.className = clases || "";
    img.dataset.profeOscar = id;
    return img;
  }

  /* ---------------------------------------------------------------------
     1. La franja del panel
     --------------------------------------------------------------------- */
  /* `caja` es #pendientes-aviso; `emoji`, el icono que reemplaza. Sin Oscar
     (escondido, cuenta ciega) vuelve el emoji. */
  function enFranja(caja, emoji, pose) {
    if (!caja) return;
    let img = caja.querySelector("img[data-profe-oscar]");
    if (!activo() || !pose) {
      if (img) img.remove();
      if (emoji) emoji.hidden = false;
      return;
    }
    if (!img) {
      img = imagen(pose, "h-24 md:h-28 w-auto shrink-0 self-end -mb-5 md:-mb-6");
      caja.prepend(img);
    } else if (img.dataset.profeOscar !== pose) {
      img.src = ruta(pose);
      img.dataset.profeOscar = pose;
    }
    if (emoji) emoji.hidden = true;
    // Una sola cara a la vez: si «Hoy te toca» ya lo había puesto, se va de ahí.
    document.querySelectorAll("#hoy [data-profe-oscar]").forEach((el) => el.remove());
  }

  /* ---------------------------------------------------------------------
     2. «Hoy te toca»
     --------------------------------------------------------------------- */
  /* `data-meta-cumplida` lo deja js/hoy-te-toca.js en la caja: así se puede
     volver a poner (al mostrarlo de nuevo) sin preguntar otra vez. */
  function enHoy(caja) {
    if (!caja || !activo()) return;
    const cumplida = caja.dataset.metaCumplida === "1";
    if (document.querySelector("#pendientes-aviso:not([hidden]) img[data-profe-oscar]")) return;
    const titulo = caja.querySelector("#hoy-titulo");
    if (!titulo || caja.querySelector("img[data-profe-oscar]")) return;
    const img = imagen(cumplida ? "excelente" : "tu-puedes", "float-right h-24 md:h-28 w-auto ml-3 -mt-1");
    titulo.before(img);
  }

  /* ---------------------------------------------------------------------
     3. En los ejercicios: la pista y la racha
     --------------------------------------------------------------------- */
  const PISTA = {
    texto:    { pose: "idea", titulo: "Una pista del profe" },
    origen:   { pose: "mmm", titulo: "Mmmm… mira bien" },
    destino:  { pose: "te-toca", titulo: "¡Ya casi! Te toca a ti" },
    solucion: { pose: "a-repasar", titulo: "Así se resolvía" },
  };

  /* La racha: se felicita en 3, 5, 10 y de diez en diez, y el récord de la
     página cuando lo pasa (desde 5). Felicitar cada acierto sería ruido. */
  function mensajeDeRacha(n, record) {
    let m = null;
    if (n === 3) m = { pose: "muy-bien", titulo: "¡Muy bien!", texto: "Llevas 3 seguidas. ¡Sigue así!" };
    else if (n === 5) m = { pose: "excelente", titulo: "¡Excelente!", texto: "Ya son 5 seguidas." };
    else if (n === 10) m = { pose: "wow", titulo: "¡Wow!", texto: "¡10 seguidas! Eso es concentración." };
    else if (n > 10 && n % 10 === 0) m = { pose: "campeones", titulo: "¡Campeón!", texto: "¡" + n + " seguidas!" };
    if (record && n >= 5) {
      if (m) m.texto += " ¡Y es tu nuevo récord!";
      else m = { pose: "felicidades", titulo: "¡Nuevo récord!", texto: "Tu mejor racha aquí ahora es de " + n + "." };
    }
    return m;
  }

  let globo = null;
  function quitarGlobo() { if (globo) globo.hidden = true; }

  /* El globo va DEBAJO de `ancla` (la fila de botones del ejercicio): nunca
     encima del tablero. No es una región viva: la página ya dijo la pista en
     su aviso, y repetirla haría que el lector de pantalla la lea dos veces. */
  function decirEnGlobo(ancla, m) {
    if (!ancla || !m || !activo()) return;
    if (!globo) {
      globo = document.createElement("div");
      globo.id = "profe-oscar-globo";
      globo.className = "mt-4 flex items-end gap-3 max-w-md mx-auto text-left";
    }
    if (ancla.nextElementSibling !== globo) ancla.after(globo);
    globo.replaceChildren();
    const img = imagen(m.pose, "h-24 w-auto shrink-0");
    const caja = document.createElement("div");
    caja.className = "relative flex-1 min-w-0 mb-3 rounded-2xl border-2 border-brand-800 dark:border-brand-300 bg-white dark:bg-brand-900 px-4 py-3 pr-10 shadow-md";
    const t = document.createElement("p");
    t.className = "font-semibold text-sm text-brand-800 dark:text-white";
    t.textContent = m.titulo;
    const p = document.createElement("p");
    p.className = "text-sm text-brand-700 dark:text-brand-100 mt-0.5 break-words";
    p.textContent = m.texto;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "absolute top-1.5 right-1.5 w-8 h-8 rounded-lg text-brand-600 dark:text-brand-300 hover:text-brand-800 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    x.setAttribute("aria-label", "Cerrar lo que dice el profe Oscar");
    x.textContent = "✕";
    x.addEventListener("click", quitarGlobo);
    caja.append(t, p, x);
    globo.append(img, caja);
    globo.hidden = false;
  }

  /* Lo que manda js/ejercicio-tablero.js:
       ("pista", { tipo, texto, boton })   pidió una pista (texto: lo que dijo la página)
       ("racha", { racha, record })        acertó y la racha subió
       ("nuevo")                           ejercicio nuevo o tablero de vuelta: el globo se va */
  /* «Ver solución» juega la jugada en el acto, y la página reinicia las
     pistas al jugarla (la marca ya no apunta a nada): sin esto, el globo con
     la solución se borraba en el mismo instante en que salía. Aguanta ese
     primer «nuevo», el que llega sin soltar el hilo; el del ejercicio
     siguiente sí lo quita. */
  let aguantar = false;
  function recibir(que, d) {
    d = d || {};
    if (que === "nuevo") { if (!aguantar) quitarGlobo(); return; }
    if (!activo()) return;
    if (que === "pista") {
      const p = PISTA[d.tipo];
      const texto = String(d.texto || "").replace(/^Pista:\s*/, "");
      if (!p || !texto) return;
      const ancla = d.boton && d.boton.parentElement;
      decirEnGlobo(ancla, { pose: p.pose, titulo: p.titulo, texto: texto.charAt(0).toUpperCase() + texto.slice(1) });
      if (d.tipo === "solucion") { aguantar = true; setTimeout(() => { aguantar = false; }, 0); }
      return;
    }
    if (que === "racha") {
      const m = mensajeDeRacha(d.racha, d.record);
      if (!m) return;
      const boton = document.getElementById("hint-btn");
      const ancla = (boton && boton.parentElement) || document.getElementById("streak-bar");
      decirEnGlobo(ancla, m);
    }
  }

  /* ---------------------------------------------------------------------
     4. «Pregúntale al profe»
     --------------------------------------------------------------------- */
  function normal(t) {
    return " " + String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  /* Palabras que no dicen QUÉ busca («quiero», «dónde», «mi»…). */
  const VACIAS = new Set(("quiero quisiera queria donde esta estan esto como hago hacer puedo podria para por que cual "
    + "una uno unos unas los las del con mis tus sus este ese esa eso hay ver ir me mi tu el la de y a en al lo le se es "
    + "son profe oscar ayuda ayudame necesito ocupo busco buscar encontrar dame algo mas muy todo todos bien hoy ahora "
    + "porfa favor quiere yo vamos voy tengo tiene sobre aqui alla ahi").split(" "));
  /* «finales» encuentra «final»; «tareas», «tarea». Se compara como en el
     buscador del panel: la palabra escrita tiene que ser el comienzo de una
     de las palabras de la tarjeta. */
  function raiz(p) {
    if (p.length > 5 && /[^aeiou]es$/.test(p)) return p.slice(0, -2);
    if (p.length > 3 && p.endsWith("s")) return p.slice(0, -1);
    return p;
  }
  function palabras(texto) {
    return normal(texto).split(" ").filter((p) => p && !VACIAS.has(p) && (p.length > 2 || /\d/.test(p))).map(raiz);
  }

  /* Puntúa cada candidato por cuántas de las palabras tiene; a igual
     puntaje, primero las tarjetas del panel (que son lo que se ve). */
  function buscar(texto, candidatos, max) {
    const ps = palabras(texto);
    if (!ps.length) return [];
    return candidatos
      .map((c, i) => ({ c, i, n: ps.filter((p) => c.buscar.includes(" " + p)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.c.orden - b.c.orden || a.i - b.i)
      .slice(0, max || 4)
      .map((x) => x.c);
  }

  /* Las tarjetas del panel, tal cual están pintadas: lo que la persona
     puede abrir. Una apagada (sin href) no se ofrece. */
  function tarjetasDelPanel() {
    const r = [];
    document.querySelectorAll("#tile-grid > section").forEach((sec) => {
      sec.querySelectorAll(".grid > [data-buscar]").forEach((celda) => {
        const a = celda.matches("a[href]") ? celda : celda.querySelector("a[href]");
        if (!a) return;
        const nombre = (a.querySelector("span > span") || a).textContent.trim();
        const icono = a.querySelector("[aria-hidden='true']");
        r.push({ texto: nombre, href: a.getAttribute("href"), icono: icono ? icono.textContent.trim() : "",
          buscar: celda.dataset.buscar + (sec.dataset.buscar || ""), orden: 0 });
      });
    });
    return r;
  }

  const scripts = {};
  function traer(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((listo, falla) => {
        const s = document.createElement("script");
        s.src = BASE + src;
        s.onload = listo;
        s.onerror = () => falla(new Error("No se pudo cargar " + src));
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  /* Los temas, las categorías de mates, las líneas de aperturas, las
     habilidades y las fichas de Estudio, con su enlace directo (el mismo
     `hrefRecorte` que usan Tareas y el plan). Solo si el panel tiene
     Entrenamiento: a quien no lo tiene (un panel de taller) no se le ofrece
     una página que no es suya. */
  let recortes = null;
  async function recortesDeEntrenamiento() {
    if (recortes) return recortes;
    if (!document.querySelector("#tile-grid a[href^='entreno/']")) return (recortes = []);
    try { if (!window.MaterialPlataforma) await traer("js/material-plataforma.js"); } catch (e) { return []; }
    const MP = window.MaterialPlataforma;
    const lista = [];
    for (const h of MP.HERRAMIENTAS) {
      if (!h.recortes || !h.hrefRecorte || h.recortes === "cuestionarios") continue;
      let rs = [];
      try { rs = await MP.recortesDe(h.slug); } catch (e) { rs = []; }
      (rs || []).forEach((x) => lista.push({
        texto: x.label + " (" + h.label + ")", href: h.hrefRecorte(x.clave), icono: "♟",
        buscar: normal([x.label, x.grupo || "", h.label].join(" ")), orden: 1,
      }));
    }
    return (recortes = lista);
  }

  const SALUDO = /^ ?(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ola|saludos)( .*)?$/;
  const GRACIAS = /^ ?(gracias|muchas gracias|mil gracias|ok|listo|dale|pura vida)( .*)?$/;
  async function contestar(pregunta) {
    const n = normal(pregunta);
    if (SALUDO.test(n) && !palabras(pregunta).filter((p) => !/^(hola|buena|buenos|dia|tarde|noche|hey|ola|saludo)/.test(p)).length) {
      return { texto: "¡Hola! Escríbeme qué quieres hacer y te llevo: por ejemplo «mates», «mi tarea» o «finales de torre»." };
    }
    if (GRACIAS.test(n) && palabras(pregunta).length <= 2) return { texto: "¡Con mucho gusto! Aquí estoy cuando me ocupes." };
    if (!palabras(pregunta).length) {
      return { texto: "Escríbeme qué quieres hacer: «mates», «mi tarea», «aperturas», «jugar una partida»…" };
    }
    const candidatos = tarjetasDelPanel().concat(await recortesDeEntrenamiento());
    const hallados = buscar(pregunta, candidatos, 4);
    if (!hallados.length) {
      return { texto: "No encontré nada con «" + pregunta.trim() + "». Prueba con otra palabra: tareas, mates, finales, aperturas o jugar." };
    }
    return { texto: hallados.length === 1 ? "Mira, esto es lo que buscas:" : "Mira lo que encontré:", enlaces: hallados };
  }

  const SUGERENCIAS = ["Mi tarea", "Mates", "Finales", "Aperturas", "Jugar"];

  function montarPregunta(despues, opciones) {
    const op = opciones || {};
    if (!despues || document.getElementById("profe-pregunta-boton")) return;

    const lanzador = document.createElement("button");
    lanzador.type = "button";
    lanzador.id = "profe-pregunta-boton";
    lanzador.className = "mb-6 inline-flex items-center gap-3 rounded-full bg-brand-800 hover:bg-brand-700 text-white pl-1.5 pr-5 py-1.5 shadow-md font-semibold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";
    lanzador.setAttribute("aria-expanded", "false");
    lanzador.setAttribute("aria-controls", "profe-pregunta");
    const cara = imagen("cara", "w-10 h-10 rounded-full bg-white object-cover object-top");
    cara.removeAttribute("data-profe-oscar");   // el botón queda aunque Oscar esté escondido
    const rotulo = document.createElement("span");
    rotulo.textContent = "Pregúntale al profe";
    lanzador.append(cara, rotulo);
    despues.after(lanzador);

    const caja = document.createElement("section");
    caja.id = "profe-pregunta";
    caja.hidden = true;
    caja.setAttribute("role", "dialog");
    caja.setAttribute("aria-labelledby", "profe-pregunta-titulo");
    caja.className = "fixed z-[60] bottom-0 left-0 right-0 sm:bottom-4 sm:left-auto sm:right-4 sm:w-[24rem] max-h-[85vh] flex flex-col bg-white dark:bg-brand-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-brand-200 dark:border-brand-700 overflow-hidden print:hidden";

    const cab = document.createElement("div");
    cab.className = "flex items-center gap-3 bg-brand-800 text-white px-4 py-2.5";
    const cara2 = imagen("presentando", "w-11 h-11 rounded-full bg-white object-cover object-top shrink-0");
    cara2.removeAttribute("data-profe-oscar");
    const titulo = document.createElement("h2");
    titulo.id = "profe-pregunta-titulo";
    titulo.className = "flex-1 font-serif text-base font-bold";
    titulo.textContent = "Pregúntale al profe";
    const cerrarB = document.createElement("button");
    cerrarB.type = "button";
    cerrarB.className = "w-9 h-9 rounded-lg text-xl leading-none hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    cerrarB.setAttribute("aria-label", "Cerrar «Pregúntale al profe»");
    cerrarB.textContent = "✕";
    cab.append(cara2, titulo, cerrarB);

    const log = document.createElement("div");
    log.id = "profe-pregunta-log";
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");
    log.className = "flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-brand-50 dark:bg-brand-950";

    const chips = document.createElement("div");
    chips.className = "flex flex-wrap gap-2 px-4 pt-3";
    SUGERENCIAS.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rounded-full border border-brand-300 dark:border-brand-600 px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-100 hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
      b.textContent = s;
      b.addEventListener("click", () => preguntar(s));
      chips.appendChild(b);
    });

    const form = document.createElement("form");
    form.className = "flex gap-2 p-3";
    form.setAttribute("role", "search");
    const etiqueta = document.createElement("label");
    etiqueta.className = "sr-only";
    etiqueta.htmlFor = "profe-pregunta-campo";
    etiqueta.textContent = "Escríbele al profe qué buscas";
    const campo = document.createElement("input");
    campo.id = "profe-pregunta-campo";
    campo.type = "text";
    campo.autocomplete = "off";
    campo.maxLength = 120;
    campo.placeholder = "Escribe lo que buscas…";
    campo.className = "flex-1 min-w-0 rounded-xl border border-brand-300 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const enviar = document.createElement("button");
    enviar.type = "submit";
    enviar.className = "rounded-xl bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";
    enviar.textContent = "Preguntar";
    form.append(etiqueta, campo, enviar);

    const pie = document.createElement("div");
    pie.className = "px-4 pb-3 -mt-1";
    const alternar = document.createElement("button");
    alternar.type = "button";
    alternar.id = "profe-pregunta-esconder";
    alternar.className = "text-xs text-brand-600 dark:text-brand-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const rotularAlternar = () => {
      alternar.textContent = oculto() ? "Volver a mostrar al profe en el panel y los ejercicios"
        : "Esconder al profe en el panel y los ejercicios";
    };
    rotularAlternar();
    alternar.addEventListener("click", () => {
      esconder(!oculto());
      rotularAlternar();
      decir(oculto() ? "Listo, ya no salgo en el panel ni en los ejercicios. Aquí sigo para tus preguntas."
        : "¡Aquí estoy de vuelta! Te acompaño en el panel y en los ejercicios.");
      if (!oculto() && op.alMostrar) op.alMostrar();
    });
    pie.appendChild(alternar);

    caja.append(cab, log, chips, form, pie);
    document.body.appendChild(caja);

    function burbuja(deQuien) {
      const d = document.createElement("div");
      d.className = deQuien === "yo"
        ? "ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-md bg-accent-500 text-brand-900 px-3 py-2 text-sm break-words"
        : "mr-auto max-w-[90%] w-fit rounded-2xl rounded-bl-md bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 text-brand-800 dark:text-white px-3 py-2 text-sm break-words";
      return d;
    }
    function decir(texto, enlaces) {
      const d = burbuja("profe");
      const p = document.createElement("p");
      const quien = document.createElement("span");
      quien.className = "sr-only";
      quien.textContent = "El profe: ";
      p.append(quien, document.createTextNode(texto));
      d.appendChild(p);
      if (enlaces && enlaces.length) {
        const ul = document.createElement("ul");
        ul.className = "mt-2 space-y-1.5";
        enlaces.forEach((e) => {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = e.href;
          a.className = "flex items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 px-3 py-2 font-semibold text-brand-800 dark:text-white hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
          if (e.icono) {
            const ic = document.createElement("span");
            ic.setAttribute("aria-hidden", "true");
            ic.textContent = e.icono;
            a.appendChild(ic);
          }
          const t = document.createElement("span");
          t.className = "flex-1 min-w-0";
          t.textContent = e.texto;
          const fl = document.createElement("span");
          fl.setAttribute("aria-hidden", "true");
          fl.textContent = "→";
          a.append(t, fl);
          li.appendChild(a);
          ul.appendChild(li);
        });
        d.appendChild(ul);
      }
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }
    async function preguntar(texto) {
      texto = String(texto || "").trim().slice(0, 120);
      if (!texto) return;
      const yo = burbuja("yo");
      const quien = document.createElement("span");
      quien.className = "sr-only";
      quien.textContent = "Tú: ";
      yo.append(quien, document.createTextNode(texto));
      log.appendChild(yo);
      log.scrollTop = log.scrollHeight;
      const r = await contestar(texto);
      decir(r.texto, r.enlaces);
    }

    let saludado = false;
    function abrir() {
      caja.hidden = false;
      lanzador.setAttribute("aria-expanded", "true");
      if (!saludado) {
        saludado = true;
        const nombre = String(op.nombre || "").trim().split(/\s+/)[0];
        decir("¡Hola" + (nombre ? ", " + nombre : "") + "! ¿Qué quieres hacer hoy? Escríbeme qué buscas o toca una de las ideas de abajo.");
      }
      campo.focus();
    }
    function cerrar() {
      caja.hidden = true;
      lanzador.setAttribute("aria-expanded", "false");
      lanzador.focus();
    }
    lanzador.addEventListener("click", () => (caja.hidden ? abrir() : cerrar()));
    cerrarB.addEventListener("click", cerrar);
    caja.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); cerrar(); } });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = campo.value;
      campo.value = "";
      preguntar(t);
    });
  }

  window.ProfeOscar = {
    activo, oculto, esconder, imagen, enFranja, enHoy, recibir, montarPregunta,
    // Para el verificador: la búsqueda sin pantalla.
    _buscar: buscar, _palabras: palabras, _mensajeDeRacha: mensajeDeRacha, _PISTA: PISTA,
  };
})();
