/* ===== Ajedrez Integral — Las bromas entre compañeros =====
 *
 * Lo que se ve de una broma que un compañero compró con sus Puntos Ajedrez
 * (puntos-tienda.html). Son inofensivas, visuales, se van solas y SIEMPRE
 * dicen quién las mandó:
 *
 *   confeti   la próxima vez que entra a su panel, cae confeti (una vez).
 *   globo     en el panel, un globo con una frase de la lista (una vez).
 *   patito    una hora: un patito cruza la pantalla de Entrenamiento de vez
 *             en cuando.
 *   arcoiris  una hora: las casillas de los tableros de Entrenamiento
 *             cambian de color (con el mismo contraste que el tablero de
 *             siempre: los colores están medidos en css/styles.css).
 *   payaso    un día: un gorro de payaso sobre su foto. Ese no lo pinta este
 *             archivo: sale de accesorios_de() en la base, que lo ve también
 *             el profe en «Alumnos conectados». Acá solo se le avisa a quien
 *             lo tiene puesto.
 *
 * Y las grandes, de una vez y de pantalla entera (unos 12 segundos, con el
 * nombre de quien la mandó en un cartel): gallinas, papel, meteorito,
 * payaso_gigante (con su musiquita), pato_invasor (con su «cuac»), gato,
 * quesos, platanazo y sandia, en el panel. Si llegan varias juntas salen una
 * detrás de otra, y cada una se marca vista cuando empieza, no antes.
 *
 *   ovni      en Entrenamiento, la primera vez que hay un tablero con piezas:
 *             el ovni se lleva una pieza de verdad y la esconde un minuto.
 *             Hay que acordarse de cuál era; después la devuelve. La pieza
 *             sigue en juego: se puede mover, y sigue escondida en su casilla
 *             nueva. Si se la comen o cambia el ejercicio, vuelve a verse.
 *
 * Quién puede recibir qué lo decide la base (mandar_broma): nunca a quien
 * tiene marcada su visión, ni a quien las apagó, bloqueó a quien manda o
 * tiene un profe que las apagó en su clase. Esta página solo cuida dónde: la
 * pone herramientas/academia-cabecera.py en el panel, la tienda y las páginas
 * de Entrenamiento — nunca en un examen, en la clase en vivo ni en un torneo.
 * Y cómo: con Modo Adaptado o el panel para quien no ve no se pinta nada, y
 * con «menos movimiento» del sistema no se mueve nada (queda el aviso).
 *
 * Ver «Retos, marcador, regalos y bromas» en docs/decisiones/puntos-y-premios.md.
 */
window.Bromas = (function () {
  "use strict";

  const RUTA = location.pathname;
  const EN_ENTRENO = /\/entreno\//.test(RUTA);
  const EN_PANEL = /\/(clases|puntos-tienda)(\.html)?$/.test(RUTA);
  const CLAVE_VISTAS = "bromas_avisadas_v1";
  const HORA = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", hour: "numeric", minute: "2-digit" });
  const DIA_HORA = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", weekday: "long", hour: "numeric", minute: "2-digit" });

  let sb = null;
  let zona = null;
  const relojes = [];
  const DURA = 12000;
  let fila = Promise.resolve();

  function apagadas() {
    const h = document.documentElement.classList;
    return h.contains("modo-ciego") || h.contains("adaptive-mode");
  }
  function quieto() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }

  // Lo ya avisado en este aparato, para no repetir el aviso de una broma de
  // una hora en cada página que abre.
  function yaAvisada(id) {
    try { return (JSON.parse(localStorage.getItem(CLAVE_VISTAS) || "[]")).includes(id); } catch (e) { return false; }
  }
  function marcarAvisada(id) {
    try {
      const l = JSON.parse(localStorage.getItem(CLAVE_VISTAS) || "[]").filter((x) => x !== id);
      l.push(id);
      localStorage.setItem(CLAVE_VISTAS, JSON.stringify(l.slice(-30)));
    } catch (e) { /* sin almacenamiento: se vuelve a avisar, nada más */ }
  }

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /* El aviso: abajo a la izquierda, se anuncia (role="status"), se cierra con
     ✕ y se va solo a los 10 segundos. Propio y no el de js/avisos.js porque
     las páginas de Entrenamiento no lo cargan. */
  function avisar(emoji, texto) {
    if (!zona) {
      zona = el("div", "fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-[90] space-y-2");
      zona.setAttribute("role", "status");
      zona.setAttribute("aria-live", "polite");
      zona.setAttribute("data-bromas-avisos", "");
      document.body.appendChild(zona);
    }
    const caja = el("div", "flex items-start gap-3 rounded-xl shadow-lg px-4 py-3 bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 text-sm text-brand-800 dark:text-white");
    caja.setAttribute("data-broma-aviso", "");
    const ic = el("span", "text-xl leading-none", emoji);
    ic.setAttribute("aria-hidden", "true");
    const t = el("p", "flex-1 min-w-0 break-words", texto);
    const x = el("button", "shrink-0 rounded px-1 text-brand-600 dark:text-brand-300 hover:text-brand-800 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Cerrar el aviso de la broma");
    x.addEventListener("click", () => caja.remove());
    caja.append(ic, t, x);
    zona.appendChild(caja);
    setTimeout(() => caja.remove(), 10000);
  }

  // Una capa encima de todo que no se puede tocar ni leer: solo adorno.
  function capa() {
    const c = el("div", "fixed inset-0 overflow-hidden pointer-events-none z-[80]");
    c.setAttribute("aria-hidden", "true");
    c.setAttribute("data-broma-capa", "");
    document.body.appendChild(c);
    return c;
  }

  function confeti(b) {
    avisar("🎉", b.de_nombre + " te mandó una lluvia de confeti.");
    if (quieto()) return;
    const c = capa();
    const figuras = ["🎉", "🎊", "✨", "⭐", "♟️"];
    for (let i = 0; i < 36; i++) {
      const s = el("span", "broma-confeti", figuras[i % figuras.length]);
      s.style.left = Math.round(Math.random() * 96) + "%";
      s.style.animationDelay = (Math.random() * 1.5).toFixed(2) + "s";
      s.style.animationDuration = (2.5 + Math.random() * 1.5).toFixed(2) + "s";
      c.appendChild(s);
    }
    setTimeout(() => c.remove(), 5000);
  }

  function globo(b) {
    avisar("🎈", b.de_nombre + " te mandó un globo: «" + (b.frase || "¡Hola!") + "»");
    if (quieto()) return;
    const c = capa();
    const g = el("span", "broma-globo", "🎈");
    g.style.left = (20 + Math.round(Math.random() * 60)) + "%";
    c.appendChild(g);
    setTimeout(() => c.remove(), 6000);
  }

  /* ===== Las grandes ===== */

  // Una capa con su escena: todo lo de adentro se desvanece junto al final.
  function escena() {
    const c = capa();
    const e = el("div", "broma-escena");
    c.appendChild(e);
    return { c, e };
  }
  function cartel(e, texto, arriba) {
    e.appendChild(el("div", "broma-cartel" + (arriba ? " broma-cartel-arriba" : ""), texto));
  }
  function figura(e, clases, emoji, estilo) {
    const s = el("span", clases, emoji);
    if (estilo) Object.assign(s.style, estilo);
    e.appendChild(s);
    return s;
  }
  function azar(a, b) { return a + Math.random() * (b - a); }

  /* Unas notas con WebAudio, bajitas. Si el navegador no deja sonar sin un
     toque antes (lo normal al entrar a una página), no suena y ya: la broma
     se ve igual. */
  function sonar(notas, forma) {
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      const ctx = new A();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      let t = ctx.currentTime + 0.05;
      notas.forEach(([frec, dur]) => {
        if (frec) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = forma || "square";
          o.frequency.setValueAtTime(frec, t);
          if (forma === "sawtooth") o.frequency.exponentialRampToValueAtTime(frec * 0.6, t + dur);
          g.gain.setValueAtTime(0.06, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + dur);
        }
        t += dur;
      });
      setTimeout(() => { try { ctx.close(); } catch (e) { /* nada */ } }, (t - ctx.currentTime + 1) * 1000);
    } catch (e) { /* sin sonido */ }
  }

  const GRANDES = {
    gallinas: {
      aviso: (n) => n + " te mandó una invasión de gallinas.", emoji: "🐔",
      pintar(e, n) {
        for (let i = 0; i < 9; i++) {
          const g = figura(e, "broma-mediana broma-cruza-izq", null, {
            top: Math.round(azar(4, 70)) + "%", animationDelay: (i * 0.9 + azar(0, 0.5)).toFixed(2) + "s",
            animationDuration: azar(3.5, 5).toFixed(2) + "s",
          });
          g.appendChild(el("span", "broma-saltito", "🐔"));
        }
        cartel(e, "¡Invasión de gallinas! Cortesía de " + n);
      },
    },
    papel: {
      aviso: (n) => n + " te empapeló la pantalla.", emoji: "🧻",
      pintar(e, n) {
        e.appendChild(el("div", "broma-hoja"));
        figura(e, "broma-grande broma-rollo", "🧻");
        for (let i = 0; i < 9; i++) {
          figura(e, "broma-tira", null, {
            left: (i * 11.5 + azar(0, 4)).toFixed(1) + "%", animationDelay: (3 + i * 0.15).toFixed(2) + "s",
            transform: "rotate(" + azar(-6, 6).toFixed(1) + "deg)",
          }).style.setProperty("--largo", Math.round(azar(45, 90)) + "vh");
        }
        cartel(e, n + " te empapeló la pantalla");
      },
    },
    meteorito: {
      aviso: (n) => n + " te mandó un meteorito: «Ataque patrocinado por " + n + "».", emoji: "☄️",
      pintar(e, n, c) {
        figura(e, "broma-grande broma-meteoro", "☄️");
        figura(e, "broma-grande broma-choque", "💥");
        c.classList.add("broma-sacudir");
        sonarLuego(2400, [[110, 0.5]], "sawtooth");
        cartel(e, "Ataque patrocinado por " + n);
      },
    },
    payaso_gigante: {
      aviso: (n) => "Llegó el payaso: " + n + " dice que hoy estás haciendo payasadas.", emoji: "🤡",
      pintar(e, n) {
        figura(e, "broma-grande broma-payaso-cara", "🤡");
        // «Entrada de los gladiadores», el tema de circo de siempre (1897, de
        // dominio público), en cuadradas de 8 bits.
        sonar([[659, 0.15], [622, 0.15], [659, 0.15], [523, 0.15], [587, 0.15], [554, 0.15], [587, 0.15], [440, 0.3],
          [0, 0.1], [494, 0.15], [466, 0.15], [494, 0.15], [392, 0.15], [440, 0.15], [415, 0.15], [440, 0.15], [330, 0.4]]);
        cartel(e, n + " dice que hoy estás haciendo payasadas");
      },
    },
    pato_invasor: {
      aviso: (n) => n + " te mandó un pato invasor: ¡CUAC CUAC!", emoji: "🦆",
      pintar(e, n) {
        const p = figura(e, "broma-grande broma-cruza-izq", null, { top: "22%", animationDuration: "10s" });
        p.appendChild(el("span", "broma-saltito", "🦆"));
        p.appendChild(el("span", "broma-cuac", "¡CUAC CUAC!"));
        [600, 1100, 3600, 4100, 6600, 7100].forEach((ms) => sonarLuego(ms, [[520, 0.18]], "sawtooth"));
        cartel(e, "Pato invasor, de parte de " + n);
      },
    },
    gato: {
      aviso: (n) => n + " te soltó un gato descontrolado.", emoji: "🐈",
      pintar(e, n) {
        figura(e, "broma-grande broma-gato", "🐈");
        ["🏺", "🖼️", "📚", "🪴", "☕", "🧸"].forEach((cosa, i) => {
          figura(e, "broma-mediana broma-cae", cosa, {
            left: (8 + i * 15 + azar(0, 6)).toFixed(1) + "%", animationDelay: (0.6 + i * 0.95).toFixed(2) + "s",
          });
        });
        cartel(e, "¡Gato descontrolado! Lo soltó " + n, true);
      },
    },
    quesos: {
      aviso: (n) => n + " te mandó una lluvia de quesos.", emoji: "🧀",
      pintar(e, n) {
        for (let i = 0; i < 22; i++) {
          figura(e, "broma-mediana broma-queso", "🧀", {
            left: Math.round(azar(0, 88)) + "%", animationDelay: (i * 0.4 + azar(0, 0.4)).toFixed(2) + "s",
            fontSize: "clamp(" + azar(3, 5).toFixed(1) + "rem, " + Math.round(azar(9, 15)) + "vw, " + azar(6, 9).toFixed(1) + "rem)",
          });
        }
        cartel(e, "¡Lluvia de quesos! Te la mandó " + n, true);
      },
    },
    platanazo: {
      aviso: (n) => "¡Platanazo! ¡Te la hizo " + n + "!", emoji: "🍌",
      pintar(e, n) {
        const p = figura(e, "broma-grande broma-cruza-izq", null, { top: "25%", animationDuration: "6s" });
        p.appendChild(el("span", "broma-gira", "🍌"));
        cartel(e, "¡Te la hizo " + n + "!");
      },
    },
    sandia: {
      aviso: (n) => n + " te tiró una sandía explosiva.", emoji: "🍉",
      pintar(e, n) {
        figura(e, "broma-grande broma-sandia", "🍉");
        for (let i = 0; i < 26; i++) {
          const ang = (i / 26) * Math.PI * 2 + azar(-0.2, 0.2);
          const r = azar(25, 60);
          const semilla = i % 2 === 0;
          const t = figura(e, semilla ? "broma-trozo broma-semilla" : "broma-mediana broma-trozo", semilla ? null : "🍉", {
            animationDelay: (2.5 + azar(0, 0.15)).toFixed(2) + "s",
          });
          t.style.setProperty("--dx", (Math.cos(ang) * r).toFixed(1) + "vw");
          t.style.setProperty("--dy", (Math.sin(ang) * r).toFixed(1) + "vh");
          t.style.setProperty("--giro", Math.round(azar(-540, 540)) + "deg");
          if (!semilla) t.style.fontSize = "clamp(2.5rem, 7vw, 4.5rem)";
        }
        sonarLuego(2500, [[90, 0.35]], "sawtooth");
        cartel(e, "¡Sandía explosiva de " + n + "!", true);
      },
    },
  };
  /* ===== El ovni: se lleva una pieza del tablero por un minuto ===== */
  const ESCONDIDA_MS = 60000;
  const SEL_PIEZA = ".piece-white, .piece-black, .chess-piece-illustrated";

  // Las piezas que se ven ahora, de cualquier tablero de la página (todos
  // marcan sus casillas con data-square). El rey no: sin rey no hay partida.
  function piezasALaVista() {
    return Array.from(document.querySelectorAll("[data-square]")).map((c) => {
      const p = c.querySelector(SEL_PIEZA);
      if (!p || !p.checkVisibility || !p.checkVisibility()) return null;
      const r = p.getBoundingClientRect();
      if (r.width < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
      const nombre = ((c.getAttribute("aria-label") || "").split(", ")[1] || "").trim();
      if (/^rey\b/i.test(nombre)) return null;
      return { casilla: c, pieza: p, rect: r, nombre };
    }).filter(Boolean);
  }
  const firma = (p) => p ? p.className + "|" + p.innerHTML : "";

  function ovni(b) {
    let intentos = 0;
    const buscar = () => {
      const piezas = piezasALaVista();
      // Sin tablero a la vista todavía: se espera un rato (el ejercicio carga
      // después) y, si no aparece, queda para la próxima página.
      if (!piezas.length) { if (++intentos < 30) setTimeout(buscar, 1000); return; }
      fila = fila.then(() => abducir(b));
    };
    buscar();
  }

  function abducir(b) {
    return new Promise((listo) => {
      const elegida = piezasALaVista().sort(() => Math.random() - 0.5)[0];
      if (!elegida) return listo();
      vista(b.id);
      let sq = elegida.casilla.getAttribute("data-square");
      const tablero = elegida.casilla.parentElement;
      const marca = "o" + Math.random().toString(36).slice(2, 8);
      tablero.setAttribute("data-broma-ovni", marca);
      const sello = firma(elegida.pieza);

      // Se esconde con una regla y no tocando la pieza: los tableros se
      // vuelven a pintar enteros en cada jugada, y la regla sobrevive. La
      // pieza sigue en juego: se puede mover, solo que no se ve.
      const estilo = document.createElement("style");
      estilo.setAttribute("data-broma-ovni-estilo", "");
      const esconderEn = (casilla) => {
        sq = casilla;
        estilo.textContent = SEL_PIEZA.split(", ").map((s) => '[data-broma-ovni="' + marca + '"] > [data-square="' + sq + '"] ' + s).join(", ")
          + " { visibility: hidden !important; }";
      };
      esconderEn(sq);
      document.head.appendChild(estilo);

      avisar("🛸", b.de_nombre + " mandó un ovni que se llevó una pieza de tu tablero. ¿Te acuerdas de cuál era? Sigue en juego y la puedes mover; en 1 minuto la vuelves a ver.");

      // Qué hay en cada casilla, para seguir a la pieza cuando se mueve.
      const mapa = () => {
        const m = {};
        tablero.querySelectorAll(":scope > [data-square]").forEach((c) => { m[c.getAttribute("data-square")] = firma(c.querySelector(SEL_PIEZA)); });
        return m;
      };
      let antes = mapa();
      let vigia = null;
      const devolver = (aviso) => {
        if (!estilo.isConnected) return;
        estilo.remove();
        if (vigia) vigia.disconnect();
        tablero.removeAttribute("data-broma-ovni");
        const n = elegida.nombre;
        if (aviso) avisar("🛸", "El ovni te devolvió " + (n ? (/^(dama|torre)\b/i.test(n) ? "la " : "el ") + n : "la pieza") + ": está en " + sq + ".");
      };
      /* Cada vez que el tablero se vuelve a pintar (antes de que se vea: un
         MutationObserver corre antes del siguiente cuadro, así que la pieza
         no parpadea). Si sigue en su casilla, nada. Si se movió, la casilla
         que ahora la tiene y antes no es la nueva. Si se la comieron o cambió
         el ejercicio (cambian muchas casillas de golpe), deja de esconderse. */
      const revisarPieza = () => {
        if (!tablero.isConnected) return devolver(false);
        const ahora = mapa();
        if (ahora[sq] === sello) { antes = ahora; return; }
        const cambiaron = Object.keys(ahora).filter((k) => ahora[k] !== antes[k]);
        const llego = cambiaron.filter((k) => ahora[k] === sello);
        antes = ahora;
        if (llego.length === 1 && cambiaron.length <= 6) esconderEn(llego[0]);
        else devolver(false);
      };
      vigia = new MutationObserver(revisarPieza);
      vigia.observe(tablero, { childList: true, subtree: true });
      setTimeout(() => devolver(true), ESCONDIDA_MS);

      if (quieto()) return listo();
      const r = elegida.rect;
      const cx = r.left + r.width / 2;
      const alto = Math.min(innerHeight * 0.18, 140);
      const arriba = Math.max(alto + 8, r.top - r.height * 2.2);
      const { c, e } = escena();
      e.setAttribute("data-broma-escena", "ovni");
      const rayo = el("div", "broma-rayo broma-rayo-pieza");
      Object.assign(rayo.style, { left: cx + "px", top: arriba + "px", height: Math.max(0, r.bottom - arriba) + "px", width: Math.max(r.width * 3, 90) + "px" });
      e.appendChild(rayo);
      const copia = elegida.pieza.cloneNode(true);
      copia.classList.add("broma-abducida");
      Object.assign(copia.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", fontSize: getComputedStyle(elegida.pieza).fontSize });
      copia.style.setProperty("--sube", (arriba - r.top - r.height / 2) + "px");
      e.appendChild(copia);
      const nave = figura(e, "broma-ovni-sobre", "🛸", { left: cx + "px", top: arriba + "px", fontSize: alto + "px" });
      nave.setAttribute("data-broma-nave", "");
      sonarLuego(1800, [[880, 0.12], [988, 0.12], [1175, 0.12], [988, 0.12], [880, 0.12], [988, 0.12], [1175, 0.12], [1319, 0.3]], "sine");
      cartel(e, "Los extraterrestres de " + b.de_nombre + " se llevaron una pieza. ¿Cuál era?");
      setTimeout(() => { c.remove(); listo(); }, DURA);
    });
  }

  function sonarLuego(ms, notas, forma) { setTimeout(() => sonar(notas, forma), ms); }

  // Una detrás de otra: dos gallineros a la vez no se entienden.
  function grande(b) {
    const g = GRANDES[b.tipo];
    fila = fila.then(() => new Promise((listo) => {
      vista(b.id);
      avisar(g.emoji, g.aviso(b.de_nombre));
      if (quieto()) return listo();
      const { c, e } = escena();
      e.setAttribute("data-broma-escena", b.tipo);
      g.pintar(e, b.de_nombre, c);
      setTimeout(() => { c.remove(); listo(); }, DURA);
    }));
  }

  function hasta(b) { return HORA.format(new Date(b.vence_at)); }
  function quedaMs(b) { return new Date(b.vence_at).getTime() - Date.now(); }

  function patito(b) {
    if (!yaAvisada(b.id)) {
      avisar("🦆", b.de_nombre + " te mandó un patito: va a cruzar tu pantalla de vez en cuando hasta las " + hasta(b) + ".");
      marcarAvisada(b.id);
    }
    if (quieto()) return;
    const cruzar = () => {
      if (quedaMs(b) <= 0 || document.hidden) return;
      const c = capa();
      const p = el("span", "broma-patito", "🦆");
      p.style.top = (15 + Math.round(Math.random() * 65)) + "%";
      c.appendChild(p);
      setTimeout(() => c.remove(), 7000);
    };
    setTimeout(cruzar, 4000);
    const r = setInterval(() => { if (quedaMs(b) <= 0) clearInterval(r); else cruzar(); }, 45000);
    relojes.push(r);
  }

  function arcoiris(b) {
    if (!yaAvisada(b.id)) {
      avisar("🌈", b.de_nombre + " te pintó el tablero de arcoíris hasta las " + hasta(b) + ".");
      marcarAvisada(b.id);
    }
    document.documentElement.classList.add("broma-arcoiris");
    setTimeout(() => document.documentElement.classList.remove("broma-arcoiris"), Math.max(0, quedaMs(b)));
  }

  function payaso(b) {
    if (yaAvisada(b.id)) return;
    avisar("🤡", b.de_nombre + " te puso un gorro de payaso: lo ven tu profe y tus compañeros hasta el " + DIA_HORA.format(new Date(b.vence_at)) + ".");
    marcarAvisada(b.id);
  }

  async function vista(id) {
    try { await sb.rpc("broma_vista", { p_id: id }); } catch (e) { /* se vuelve a mostrar la próxima vez */ }
  }

  async function revisar() {
    if (!sb || apagadas()) return;
    let bromas = [];
    try {
      const r = await sb.rpc("mis_bromas");
      if (!r || r.error || !Array.isArray(r.data)) return;
      bromas = r.data;
    } catch (e) { return; }
    bromas.forEach((b) => {
      if (EN_PANEL && b.tipo === "confeti") { confeti(b); vista(b.id); }
      else if (EN_PANEL && b.tipo === "globo") { globo(b); vista(b.id); }
      else if (EN_PANEL && b.tipo === "payaso") payaso(b);
      else if (EN_PANEL && GRANDES[b.tipo]) grande(b);
      else if (EN_ENTRENO && b.tipo === "patito") patito(b);
      else if (EN_ENTRENO && b.tipo === "arcoiris") arcoiris(b);
      else if (EN_ENTRENO && b.tipo === "ovni") ovni(b);
    });
  }

  async function autoIniciar() {
    if (!EN_PANEL && !EN_ENTRENO) return;
    const cliente = window.sb;
    if (!cliente || !cliente.auth || typeof cliente.rpc !== "function") return;
    try {
      const r = await cliente.auth.getSession();
      if (!r || !r.data || !r.data.session) return;
    } catch (e) { return; }
    sb = cliente;
    revisar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoIniciar);
  else autoIniciar();

  return { revisar };
})();
