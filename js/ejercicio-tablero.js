/**
 * Ajedrez Integral — lo que comparten las páginas de ejercicios de Entrenamiento.
 *
 * Temas, Mates, Practicar, Desafíos y Visualización tenían cada una su copia
 * de lo mismo: la racha, el orden en que se dibuja el tablero, qué cuenta como
 * acierto y cómo se elige la pieza al coronar. Las copias se fueron separando
 * y cada diferencia era un error que no daba ningún error: Mates rechazaba un
 * mate que no era el guardado y dibujaba siempre desde las blancas, «Ver
 * solución» subía la racha en Practicar, la coronación de Mates no decía qué
 * pieza era cada botón. Acá está una sola vez.
 *
 *   EjercicioTablero.racha(prefijo)
 *       La racha de una página, guardada en `<prefijo>_streak` y
 *       `<prefijo>_best` (las dos en CLAVES de js/progreso-usuario.js) y
 *       pintada en #streak-count, #streak-best y #streak-bar. Devuelve
 *       { getStreak, getBestStreak, setStreak, bumpStreak, resetStreak }.
 *
 *   EjercicioTablero.casillas(orientacion)
 *       Las 64 casillas en el orden en que se dibujan, mirando desde el bando
 *       `orientacion` ("w" o "b"): el tablero se mira desde el que juega.
 *
 *   EjercicioTablero.esAcierto(juego, jugada, esperada)
 *       La jugada ya hecha en `juego` es la esperada (SAN) o da mate. Los
 *       bancos guardan UNA solución y a veces hay más de un mate.
 *
 *   EjercicioTablero.jugarCoronando(juego, desde, hasta, jugar)
 *       Si de `desde` a `hasta` se corona, pregunta en qué pieza con
 *       js/coronacion.js (el mismo diálogo de todo el sitio) y llama
 *       `jugar(pieza)`; si no, llama `jugar(undefined)` enseguida. Cancelar
 *       no juega nada.
 *
 *   EjercicioTablero.dibujar(tablero, { juego, orientacion, seleccionada,
 *                                       ultima, marcas, alTocar })
 *       Pinta las 64 casillas: el color, la pieza (como la eligió el alumno,
 *       js/pieza-preferida.js), y el ESTADO de cada casilla en `data-estado`,
 *       que es lo que js/tablero-accesible.js le agrega a lo que lee el lector
 *       de pantalla: «seleccionada», «de la última jugada», y las marcas de la
 *       pista («pista: la pieza que se mueve»). Antes cada página pintaba el
 *       suyo, y la marca de la pista se perdía en el siguiente repintado.
 *
 *   EjercicioTablero.marcarDestinos(tablero, juego, desde)
 *       Marca adónde puede ir la pieza de `desde` (captura aparte).
 *
 *   EjercicioTablero.destello(casilla)
 *       El parpadeo rojo de una jugada equivocada.
 *
 *   EjercicioTablero.pistas({ boton, etapas, texto, jugada, repintar, decir,
 *                             enPalabras, alDar, alResolver })
 *       Las pistas por etapas, las mismas en todas las páginas:
 *         "texto"    una frase (el motivo, la pista escrita del desafío);
 *         "origen"   marca la pieza que se mueve;
 *         "destino"  marca también la casilla adonde va;
 *         "solucion" la dice («La solución era: …») y la juega
 *                    (`alResolver(jugada, frase)`; la página antepone `frase`
 *                    a lo que diga después, que si no la pisa).
 *       Con `juego()` (la partida), la frase dice la jugada aunque la página
 *       solo dé las casillas.
 *       Cada página dice cuáles usa (`etapas()`) y cuál es la jugada
 *       (`jugada()` → { from, to, promotion }). El botón dice lo que va a
 *       hacer: «Pista», «Otra pista», «Ver solución». Devuelve
 *       { dar, reiniciar, solucion, marcas, usadas }; `marcas()` va a
 *       dibujar() y `solucion()` salta directo a la última etapa.
 *
 *   EjercicioTablero.refutacion(juego)
 *       Con la jugada EQUIVOCADA ya hecha en `juego` (le toca al rival): qué
 *       responde el rival, si es algo que chess.js puede afirmar sin motor.
 *       Un mate en una, o una pieza (caballo o más) que se come y no se puede
 *       recuperar. Si no, null: nunca se inventa una refutación que no está.
 *
 *   EjercicioTablero.jugadaEs(san)
 *       La jugada en castellano (Cf3, Dxh7#), como la escribe el alumno.
 *
 *   EjercicioTablero.fin({ caja, desde, jugadas, orientacion, siguiente })
 *       Al terminar un ejercicio, en vez de saltar al siguiente al segundo:
 *       «Siguiente →» (el alumno decide cuándo) y «Ver la línea», que abre la
 *       línea jugada desde `desde` en js/visor-linea.js (recorrible con
 *       ◀ ▶, teclado y lector de pantalla). Devuelve { cerrar, activo }.
 *
 *   EjercicioTablero.palabrasPrimero(campo, contestar)
 *       Las palabras que la página contesta ANTES que la capa del recuadro de
 *       la cuenta ciega (js/vision-cuenta.js): «siguiente», «saltar»,
 *       «solución»… `contestar(texto)` devuelve true si lo trató (y entonces
 *       ni la capa ni el resto de la página lo ven, y el recuadro se vacía).
 *       Sin esto la capa apretaba el botón «Saltar →» y decía «Listo:
 *       Saltar.» encima del ejercicio nuevo, que no se oía. `campo` es el
 *       <input> o una función que lo devuelve.
 *
 *   EjercicioTablero.accionEscrita(texto)
 *       "solucion" («solución», «ver la solución», «me rindo»), "saltar"
 *       («saltar», «siguiente», «otra posición»…) o null. Las mismas palabras
 *       en todas las páginas que tienen las dos cosas.
 */
(function () {
  "use strict";

  const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];

  function racha(prefijo) {
    const CLAVE = prefijo + "_streak", MEJOR = prefijo + "_best";
    const leer = (k) => { try { return parseInt(localStorage.getItem(k) || "0", 10) || 0; } catch (e) { return 0; } };
    const escribir = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) {} };
    function getStreak() { return leer(CLAVE); }
    function getBestStreak() { return leer(MEJOR); }
    function setStreak(n) {
      escribir(CLAVE, n);
      const mejor = Math.max(getBestStreak(), n);
      escribir(MEJOR, mejor);
      const c = document.getElementById("streak-count"), b = document.getElementById("streak-best");
      if (c) c.textContent = n;
      if (b) b.textContent = mejor;
    }
    function bumpStreak() {
      setStreak(getStreak() + 1);
      const bar = document.getElementById("streak-bar");
      if (bar) { bar.classList.remove("pulse"); void bar.offsetWidth; bar.classList.add("pulse"); }
    }
    function resetStreak() { setStreak(0); }
    return { getStreak, getBestStreak, setStreak, bumpStreak, resetStreak };
  }

  function casillas(orientacion) {
    const filas = orientacion === "b" ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const columnas = orientacion === "b" ? COLUMNAS.slice().reverse() : COLUMNAS;
    const r = [];
    filas.forEach((f) => columnas.forEach((c) => r.push(c + f)));
    return r;
  }

  function esAcierto(juego, jugada, esperada) {
    if (!jugada) return false;
    if (jugada.san === esperada) return true;
    try { return !!juego.in_checkmate(); } catch (e) { return false; }
  }

  function jugarCoronando(juego, desde, hasta, jugar) {
    if (window.Coronacion && Coronacion.hayQueElegir(juego, desde, hasta)) {
      Coronacion.pedir(juego.turn(), (pieza) => { if (pieza) jugar(pieza); });
      return;
    }
    jugar(undefined);
  }

  const GLYPH = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };
  function esClara(sq) { return ((sq.charCodeAt(0) - 97) + (parseInt(sq[1], 10) - 1)) % 2 === 1; }

  function dibujar(tablero, o) {
    if (!tablero || !o || !o.juego) return;
    tablero.innerHTML = "";
    casillas(o.orientacion).forEach((sq) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sq " + (esClara(sq) ? "light" : "dark");
      btn.dataset.square = sq;
      let p = null;
      try { p = o.juego.get(sq); } catch (e) {}
      if (p) {
        const span = document.createElement("span");
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, p.type, p.color);
        else {
          span.className = p.color === "w" ? "piece-white" : "piece-black";
          span.textContent = GLYPH[p.color][p.type];
        }
        span.setAttribute("aria-hidden", "true");
        btn.appendChild(span);
      }
      const estados = [];
      if (sq === o.seleccionada) { btn.classList.add("selected"); estados.push("seleccionada"); }
      if (o.ultima && (sq === o.ultima.from || sq === o.ultima.to)) { btn.classList.add("last"); estados.push("de la última jugada"); }
      const m = o.marcas && o.marcas[sq];
      if (m) { btn.classList.add(m.clase); estados.push(m.estado); }
      if (estados.length) btn.dataset.estado = estados.join(", ");
      if (o.alTocar) btn.addEventListener("click", () => o.alTocar(sq, btn));
      tablero.appendChild(btn);
    });
  }

  function marcarDestinos(tablero, juego, desde) {
    let jugadas = [];
    try { jugadas = juego.moves({ square: desde, verbose: true }) || []; } catch (e) {}
    jugadas.forEach((m) => {
      const c = tablero.querySelector('[data-square="' + m.to + '"]');
      const captura = m.flags && (m.flags.includes("c") || m.flags.includes("e"));
      if (c) c.classList.add(captura ? "target-capture" : "target");
    });
  }

  function destello(casilla) {
    if (!casilla) return;
    casilla.classList.add("wrong-flash");
    setTimeout(() => casilla.classList.remove("wrong-flash"), 350);
  }

  function pistas(o) {
    let n = 0, marcas = {};
    const boton = () => (typeof o.boton === "string" ? document.querySelector(o.boton) : o.boton);
    const hablada = (sq) => (o.enPalabras && o.enPalabras() && window.BlindNotation && BlindNotation.squareSpoken
      ? BlindNotation.squareSpoken(sq) : null);
    function rotular() {
      const b = boton(); if (!b) return;
      const etapas = o.etapas();
      const siguiente = etapas[Math.min(n, etapas.length - 1)];
      b.textContent = siguiente === "solucion" ? "💡 Ver solución" : n === 0 ? "💡 Pista" : "💡 Otra pista";
    }
    function reiniciar() { n = 0; marcas = {}; rotular(); }
    function dar() {
      const etapas = o.etapas();
      const tipo = etapas[Math.min(n, etapas.length - 1)];
      const j = o.jugada();
      n += 1;
      if (o.alDar) o.alDar(n, tipo);
      if (tipo === "solucion") {
        marcas = {};
        /* La solución se DICE antes de jugarla. Antes se jugaba sola: quien no
           ve el tablero oía «¡Correcto!» o «el rival responde» sin enterarse
           nunca de cuál había sido la jugada, que es justo lo que pidió. La
           frase también va a `alResolver`, porque lo que la página dice
           enseguida («¡Jaque mate!») pisa este aviso: la página la antepone. */
        const frase = j ? fraseSolucion(j) : "";
        if (frase) o.decir(frase);
        if (j && o.alResolver) o.alResolver(j, frase);
        rotular();
        return;
      }
      if (tipo === "texto") {
        o.decir("Pista: " + (o.texto ? o.texto() : ""));
      } else if (j && tipo === "origen") {
        marcas = { [j.from]: { clase: "hint-from", estado: "pista: la pieza que se mueve" } };
        const h = hablada(j.from);
        o.decir(h ? "Pista: mueve la pieza de " + h + "." : "Pista: fíjate en la pieza resaltada.");
      } else if (j && tipo === "destino") {
        marcas = { [j.from]: { clase: "hint-from", estado: "pista: la pieza que se mueve" },
                   [j.to]: { clase: "hint-to", estado: "pista: la casilla adonde va" } };
        const h = hablada(j.to);
        o.decir(h ? "Pista: la casilla de destino es " + h + "." : "Pista: la casilla marcada con el círculo es el destino.");
      }
      if (o.repintar) o.repintar();
      rotular();
    }
    /* «La solución era: caballo felix 3.» En Modo Adaptado, en palabras
       (BlindNotation.sanSpoken, lo mismo que el resto del sitio); si no, en
       castellano («Cf3»). Si la página solo da casillas (Practicar, Desafíos),
       la jugada se arma con `juego()` sobre una copia, sin tocar la partida. */
    function fraseSolucion(j) {
      let san = j.san || null;
      if (!san && o.juego && typeof Chess !== "undefined") {
        try {
          const g = o.juego();
          const copia = g && g.fen ? new Chess(g.fen()) : null;
          const m = copia && copia.move({ from: j.from, to: j.to, promotion: j.promotion || "q" });
          san = m ? m.san : null;
        } catch (e) { san = null; }
      }
      const enPalabras = o.enPalabras && o.enPalabras() && window.BlindNotation;
      if (san) return "La solución era: " + (enPalabras && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(san) : jugadaEs(san)) + ".";
      const casilla = (sq) => (enPalabras && BlindNotation.squareSpoken ? BlindNotation.squareSpoken(sq) : sq);
      return j.from && j.to ? "La solución era: de " + casilla(j.from) + " a " + casilla(j.to) + "." : "";
    }
    /* «solución» escrita: directo a la última etapa, contando todas las
       pistas que se saltó (para las estrellas es lo mismo que haberlas pedido). */
    function solucion() {
      const etapas = o.etapas();
      n = Math.max(n, etapas.length - 1);
      dar();
    }
    return { dar, reiniciar, solucion, marcas: () => marcas, usadas: () => n };
  }

  const PIEZAS_ES = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
  /* La jugada para la pantalla: en algebraica española («Cf3»), o en palabras
     para quien no ve (ComandosTablero.jugadaParaMostrar, la de todo el sitio). */
  function jugadaEs(san) {
    if (typeof window !== "undefined" && window.ComandosTablero && ComandosTablero.jugadaParaMostrar) return ComandosTablero.jugadaParaMostrar(san);
    if (typeof window !== "undefined" && window.VisorLinea) return VisorLinea.aEspanol(san);
    return String(san).replace(/[NBRQK]/g, (l) => PIEZAS_ES[l]);
  }

  const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const NOMBRE = { p: "el peón", n: "el caballo", b: "el alfil", r: "la torre", q: "la dama" };
  function refutacion(juego) {
    let jugadas = [];
    try { jugadas = juego.moves({ verbose: true }) || []; } catch (e) { return null; }
    // 1. Un mate en una: lo más claro que se puede decir.
    for (const m of jugadas) {
      juego.move(m);
      const mate = juego.in_checkmate();
      juego.undo();
      if (mate) return "Así el rival da mate con " + jugadaEs(m.san) + ".";
    }
    // 2. Una pieza que se come y no se puede recuperar en esa casilla.
    let peor = null;
    for (const m of jugadas) {
      if (!m.captured || VALOR[m.captured] < 3) continue;
      juego.move(m);
      const recupera = juego.moves({ verbose: true }).some((r) => r.to === m.to);
      juego.undo();
      if (!recupera && (!peor || VALOR[m.captured] > VALOR[peor.captured])) peor = m;
    }
    if (peor) {
      return "Así el rival se come " + NOMBRE[peor.captured] + " de " + peor.to + " con " + jugadaEs(peor.san) +
        ", y ninguna pieza tuya puede volver a comer en " + peor.to + ".";
    }
    return null;
  }

  function fin(o) {
    const caja = typeof o.caja === "string" ? document.querySelector(o.caja) : o.caja;
    if (!caja) { if (o.siguiente) o.siguiente(); return { cerrar() {}, activo: () => false }; }
    caja.textContent = "";
    caja.hidden = false;
    const botones = document.createElement("div");
    botones.className = "round-controls";
    const sig = document.createElement("button");
    sig.type = "button"; sig.className = "bctrl primary"; sig.textContent = "Siguiente ejercicio →";
    const ver = document.createElement("button");
    ver.type = "button"; ver.className = "bctrl"; ver.textContent = "Ver la línea";
    ver.setAttribute("aria-expanded", "false");
    const visor = document.createElement("div");
    visor.className = "fin-visor";
    visor.id = (caja.id || "fin") + "-visor";
    visor.hidden = true;
    ver.setAttribute("aria-controls", visor.id);
    botones.append(sig, ver);
    caja.append(botones, visor);
    let montado = null, activo = true;
    ver.addEventListener("click", () => {
      const abrir = visor.hidden;
      visor.hidden = !abrir;
      ver.setAttribute("aria-expanded", String(abrir));
      ver.textContent = abrir ? "Ocultar la línea" : "Ver la línea";
      if (abrir && !montado && window.VisorLinea) {
        montado = VisorLinea.montar(visor, { nombre: "Tablero de la línea del ejercicio" });
        montado.cargar(o.jugadas || [], { desde: o.desde, orientacion: o.orientacion, titulo: "La línea del ejercicio", en: 0 });
      }
      if (abrir && montado) montado.enfocar();
    });
    function cerrar() { activo = false; caja.hidden = true; caja.textContent = ""; }
    sig.addEventListener("click", () => { cerrar(); if (o.siguiente) o.siguiente(); });
    // El foco va a «Siguiente», salvo que el alumno esté escribiendo en el
    // cuadro de comandos: ahí sigue, y «siguiente» escrito también avanza.
    // Con la cuenta marcada como ciega, nunca: esa persona hace todo desde el
    // recuadro, y sacarla de ahí a un botón la obliga a volver con Tab.
    const a = document.activeElement;
    const ciego = document.documentElement.classList.contains("modo-ciego");
    if (!ciego && !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) sig.focus();
    return { cerrar, activo: () => activo, siguiente: () => sig.click() };
  }

  /* En la fase de captura de `window`, que va antes que la de `document`
     (donde escucha js/vision-cuenta.js). */
  function palabrasPrimero(campo, contestar) {
    if (typeof window === "undefined") return;
    const actual = () => (typeof campo === "function" ? campo() : campo);
    const tratar = (e, c) => {
      if (!c || !String(c.value || "").trim()) return;
      if (contestar(c.value) !== true) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      c.value = "";
    };
    window.addEventListener("submit", (e) => {
      const c = actual();
      if (c && c.form && c.form === e.target) tratar(e, c);
    }, true);
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
      const c = actual();
      if (c && !c.form && e.target === c) tratar(e, c);
    }, true);
  }

  function accionEscrita(texto) {
    const t = String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[.,;:!?¡¿«»"'()]/g, " ").replace(/\s+/g, " ").trim();
    if (/^((ver|dame|dime|mostrar|muestrame) )?(la )?(solucion|respuesta)$|^me rindo$/.test(t)) return "solucion";
    if (/^(saltar|salta|saltarla|saltarlo|pasar|siguiente|sig|otro|otra)( (ejercicio|posicion|desafio|este|esta|este ejercicio|esta posicion|este desafio))?$/.test(t)) return "saltar";
    return null;
  }

  const api = { racha, casillas, esAcierto, jugarCoronando, dibujar, marcarDestinos, destello, pistas, refutacion, jugadaEs, fin, palabrasPrimero, accionEscrita };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.EjercicioTablero = api;
})();
