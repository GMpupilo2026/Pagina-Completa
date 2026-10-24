/* Los Tipos de entrenamiento 20 a 25 de entreno/tipos.html: el Mapa de
 * casillas, ¿Alcanza el rey?, ¿Cambio y paso al final de peones?, La
 * intermedia, El defensor sobrecargado y La peor pieza.
 *
 * Usan las mismas piezas de la página que los demás (window.TiposUI, en
 * js/entreno-tipos.js; las opciones de js/entreno-tipos-mas.js) y las reglas
 * de js/tipos-reglas-20.js. Este archivo solo arma cada juego. Todos se
 * contestan también escribiendo: las casillas, la jugada o la letra de la
 * opción.
 */
(function () {
  "use strict";
  const U = window.TiposUI;
  const R = window.TiposReglas;
  const M = window.TiposReglasMas;
  const N = window.TiposReglas20;
  if (!U || !N) return;
  const { $, el, boton, estado, explicar, textoEstrellas, terminar, COLOR, BTN_PRIMARIO, BTN_SEGUNDO } = U;
  const tab = U.tab();
  const femenina = (t) => t === "q" || t === "r";
  const piezaDicha = (pc) => R.NOMBRE[pc[1]] + " " + (pc[0] === "w" ? (femenina(pc[1]) ? "blanca" : "blanco") : (femenina(pc[1]) ? "negra" : "negro"));
  const laPieza = (pc, s) => (femenina(pc[1]) ? "la " : "el ") + piezaDicha(pc) + " de " + s;
  const CASILLA = /^[a-h][1-8]$/;
  /* «a el» → «al»: «obliga al peón blanco de g2». */
  const aLa = (texto) => ("a " + texto).replace(/^a el /, "al ");
  /* Cuando se pide una casilla, el recuadro sugiere casillas y no jugadas;
     al salir del ejercicio vuelve el de siempre. */
  const SUGIERE_JUGADA = "Cf3, Dxh7+, 0-0";
  function sugerir(texto) {
    $("jugada-input").placeholder = texto;
    U.alLimpiar(() => { $("jugada-input").placeholder = SUGIERE_JUGADA; });
  }
  const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.!¡¿?]/g, "").trim();
  /* «e4», «Cb1», «caballo de b1», «la torre en h1»: la casilla que se nombra. */
  function casillaEscrita(txt) {
    const t = plano(txt);
    const m = /([a-h][1-8])$/.exec(t);
    return m ? m[1] : null;
  }
  /* El reloj de ¿Alcanza el rey? (y el triple en Modo Adaptado, como Elige a
     tiempo). Cuenta con la hora, no con los disparos del intervalo: un
     celular que frena la pestaña en segundo plano no regala segundos. */
  function reloj(total, alAcabar) {
    let quedan = total, dicho = null;
    const cuenta = el("p", "text-3xl font-bold text-center text-brand-800 dark:text-white my-2 tabular-nums", "⏱ " + quedan + " s");
    cuenta.setAttribute("aria-hidden", "true");
    const inicio = Date.now();
    const mitad = Math.floor(total / 2);
    const id = setInterval(() => {
      quedan = total - Math.floor((Date.now() - inicio) / 1000);
      cuenta.textContent = "⏱ " + Math.max(0, quedan) + " s";
      if (quedan <= 0) { clearInterval(id); alAcabar(); return; }
      const aviso = quedan <= 5 ? 5 : quedan <= mitad && mitad >= 10 ? mitad : null;
      if (aviso && aviso !== dicho) { dicho = aviso; estado("Quedan " + quedan + " segundos."); }
    }, 1000);
    U.alLimpiar(() => clearInterval(id));
    return { cuenta, parar: () => clearInterval(id), usados: () => Math.min(total, Math.round((Date.now() - inicio) / 1000)) };
  }

  /* ================================================ 20. Mapa de casillas
     Se marcan casillas tocándolas o escribiéndolas; nada se mueve. Al
     comprobar, cada casilla lleva su signo escrito: ✓ bien, ✗ sobra, − faltó. */
  const ENUNCIADO_CASILLAS = {
    pieza: (pc, s) => "Marca todas las casillas que ataca " + laPieza(pc, s) + ".",
    rival: (pc, s) => "Marca todas las casillas que ataca " + laPieza(pc, s) + " del rival.",
    rey: (pc, s, yo) => "Marca las casillas vecinas del rey de las " + COLOR[R.otro(yo)] + " que atacan tus piezas (las " + COLOR[yo] + ").",
    seguras: (pc, s) => "Marca las casillas a las que puede ir " + laPieza(pc, s) + " sin que el rival las ataque.",
  };
  U.JUEGOS.casillas = function (item) {
    const yo = item.fen.split(" ")[1];
    const pide = item.pide;
    const t0 = R.tablero(item.fen);
    const centro = pide.tipo === "rey" ? R.sq(t0.findIndex((p) => p && p.t === "k" && p.c === R.otro(yo))) : pide.casilla;
    const pc = t0[R.idx(centro)];
    const marcadas = new Set();
    let hecho = false;
    const lista = el("p", "text-sm text-brand-700 dark:text-brand-200 mb-2");
    const pintarLista = () => {
      const l = [...marcadas].sort((a, b) => R.idx(a) - R.idx(b));
      lista.textContent = l.length ? "Marcaste " + l.length + ": " + l.join(", ") + "." : "Todavía no marcaste ninguna.";
    };
    const marcas = () => {
      const m = {};
      marcadas.forEach((s) => { m[s] = { cls: "m-marca", signo: "•", dicho: "marcada" }; });
      return m;
    };
    const redibujar = () => U.tablero(item.fen, { orientacion: yo, ultima: [centro], marcas: marcas(), clic: hecho ? null : alternar });
    function alternar(s) {
      if (hecho) return;
      if (marcadas.has(s)) { marcadas.delete(s); estado("Quitaste " + s + "."); }
      else { marcadas.add(s); estado("Marcaste " + s + ". Llevas " + marcadas.size + "."); }
      pintarLista();
      redibujar();
    }
    function comprobar() {
      if (hecho) return;
      hecho = true;
      U.pedirJugada("", null);
      const r = N.corregirCasillas(item.respuestas, [...marcadas]);
      const m = {};
      r.bien.forEach((s) => { m[s] = { cls: "m-bien", signo: "✓", dicho: "bien" }; });
      r.mal.forEach((s) => { m[s] = { cls: "m-mal", signo: "✗", dicho: "sobraba" }; });
      r.faltan.forEach((s) => { m[s] = { cls: "m-mal", signo: "−", dicho: "faltó" }; });
      U.tablero(item.fen, { orientacion: yo, ultima: [centro], marcas: m });
      estado((r.estrellas === 3 ? "✓ ¡Todas, y ninguna de más! " : "Acertaste " + r.bien.length + " de " + item.respuestas.length + ". ") + (r.estrellas ? textoEstrellas(r.estrellas) : "Sin estrellas."));
      const partes = ["Eran: " + item.respuestas.join(", ") + "."];
      if (r.faltan.length) partes.push("Te faltaron: " + r.faltan.join(", ") + ".");
      if (r.mal.length) partes.push("No eran: " + r.mal.join(", ") + ".");
      partes.push("En el tablero: ✓ bien, ✗ sobraba, − faltó.");
      explicar(partes);
      terminar(item, r.estrellas);
    }
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + ". La casilla con el borde naranja es " + centro + " (" + piezaDicha(pc.c + pc.t) + ").";
    $("juego-enunciado").textContent = ENUNCIADO_CASILLAS[pide.tipo](pc.c + pc.t, centro, yo);
    $("controles").appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2",
      "Toca cada casilla para marcarla (otra vez, para quitarla) o escríbelas. " +
      (pide.tipo === "seguras" ? "Cuentan las casillas adonde la pieza puede jugar, también comiendo, si ninguna pieza rival ataca esa casilla." : "Una casilla con una pieza encima también cuenta: atacada es la que se podría comer, o la que queda defendida.")));
    $("controles").appendChild(lista);
    pintarLista();
    $("controles").appendChild(boton("Comprobar", BTN_PRIMARIO, comprobar));
    redibujar();
    U.ponerAyudas({
      pista: () => estado("Pista: son " + item.respuestas.length + " casillas."),
      solucion: () => {
        if (hecho) { estado("Este ya terminó. " + U.textoSiguiente()); return; }
        marcadas.clear();
        hecho = true;
        U.pedirJugada("", null);
        const m = {};
        item.respuestas.forEach((s) => { m[s] = { cls: "m-bien", signo: "✓", dicho: "era esta" }; });
        U.tablero(item.fen, { orientacion: yo, ultima: [centro], marcas: m });
        estado("La solución: " + item.respuestas.join(", ") + ". Cuenta como no resuelto.");
        explicar(item.respuesta);
        terminar(item, 0);
      },
    });
    sugerir("e4 f5");
    U.pedirJugada("O escribe las casillas («e4 f5»), «quitar e4» para sacar una, y «comprobar»", (txt) => {
      if (hecho) return;
      const t = plano(txt);
      $("jugada-input").value = "";
      if (/^(comprobar|corregir|listo|ya)$/.test(t)) { comprobar(); return; }
      if (/^(cuales|marcadas|lista|cuales marque)$/.test(t)) { estado(lista.textContent); return; }
      const quitar = /^(quitar|quita|sacar|borrar)\b/.test(t);
      const casillas = t.match(/[a-h][1-8]/g);
      if (!casillas) { estado("No entendí «" + txt + "». Escribe casillas, por ejemplo «e4 f5», o «comprobar»."); return; }
      casillas.forEach((s) => { if (quitar) marcadas.delete(s); else marcadas.add(s); });
      pintarLista();
      redibujar();
      estado((quitar ? "Quitaste " : "Marcaste ") + casillas.join(", ") + ". Llevas " + marcadas.size + ".");
    });
  };

  /* ================================================ 21. ¿Alcanza el rey?
     Tres veredictos, una sola oportunidad y un reloj. */
  U.JUEGOS.alcanza = function (item) {
    const turno = item.fen.split(" ")[1];
    const total = M.segundosTiempo(item.segundos, U.adaptado());
    let hecho = false;
    const ops = ["w", "d", "b"];
    const botones = [];
    function cerrar(op, sol) {
      if (hecho) return;
      hecho = true;
      rel.parar();
      U.pedirJugada("", null);
      botones.forEach((b) => { b.disabled = true; });
      const usados = rel.usados();
      const bien = op === item.resultado;
      const n = op ? N.estrellasAlcanza(bien, usados, total) : 0;
      botones.forEach((b, k) => { b.textContent = (ops[k] === item.resultado ? "✓ " : ops[k] === op ? "✗ " : "") + "Opción " + U.letraDe(k) + ". " + N.RESULTADO[ops[k]]; });
      if (sol) estado("La solución: " + N.RESULTADO[item.resultado].toLowerCase() + ". Cuenta como no resuelto.");
      else if (!op) estado("⌛ Se acabó el tiempo. Era: " + N.RESULTADO[item.resultado].toLowerCase() + ".");
      else estado((bien ? "✓ ¡Correcto! " : "Respuesta incorrecta. Era: " + N.RESULTADO[item.resultado].toLowerCase() + ". ") + "Contestaste en " + usados + " s." + (n ? " " + textoEstrellas(n) : ""));
      explicar(item.respuesta);
      terminar(item, n);
    }
    const rel = reloj(total, () => cerrar(null));
    U.tablero(item.fen, { orientacion: "w" });
    $("juego-turno").textContent = "Juegan las " + COLOR[turno] + ". Solo reyes y peones.";
    $("juego-enunciado").textContent = "¿Quién gana? Decide antes de que se acabe el reloj.";
    $("controles").appendChild(rel.cuenta);
    const caja = el("div");
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-label", "Opciones");
    ops.forEach((op, k) => {
      const b = el("button", "block w-full text-left p-3 rounded-lg bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 hover:border-accent-500 text-brand-800 dark:text-brand-100 font-semibold mb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
        "Opción " + U.letraDe(k) + ". " + N.RESULTADO[op]);
      b.type = "button";
      b.addEventListener("click", () => cerrar(op));
      botones.push(b);
      caja.appendChild(b);
    });
    $("controles").appendChild(caja);
    U.ponerOpciones(ops.map((op, k) => ({ nombre: N.RESULTADO[op], el: botones[k], elegir: () => botones[k].click() })));
    U.ponerAyudas({
      pista: () => estado("Pista: cuenta el cuadrado de cada peón pasado y quién llega primero a coronar."),
      solucion: () => { if (hecho) estado("Este ya terminó. " + U.textoSiguiente()); else cerrar(null, true); },
    });
    if (U.adaptado()) {
      U.pedirJugada("Escribe la letra de la opción o una palabra suya («tablas», «blancas», «negras»)", (txt) => {
        if (hecho) { estado("Este ya terminó."); return; }
        if (!U.responderConOpcion(txt)) U.noEsOpcion(txt);
      });
    }
    estado("Tienes " + total + " segundos" + (total !== item.segundos ? " (el triple, por el Modo Adaptado)" : "") + ".");
  };

  /* ================================================ 22. ¿Cambio y paso al final de peones?
     Se ve la posición con la cadena de cambios escrita; un botón la juega en
     el tablero (y otro la deshace). Se contesta con una de tres opciones. */
  U.JUEGOS.liquidar = function (item) {
    const yo = item.fen.split(" ")[1];
    let enElFinal = false;
    const ver = () => U.tablero(enElFinal ? item.fenFinal : item.fen, { orientacion: yo, juego: new Chess(enElFinal ? item.fenFinal : item.fen) });
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + ".";
    $("juego-enunciado").textContent = "Si juegas " + item.cadenaEs + ", quedan solo reyes y peones. ¿Cómo es ese final para las " + COLOR[yo] + "?";
    const bVer = boton("Ver el final de peones en el tablero", BTN_SEGUNDO + " mb-3", () => {
      enElFinal = !enElFinal;
      bVer.textContent = enElFinal ? "Volver a la posición de ahora" : "Ver el final de peones en el tablero";
      bVer.setAttribute("aria-pressed", enElFinal ? "true" : "false");
      ver();
      if (U.adaptado()) U.leerPosicion(enElFinal ? item.fenFinal : item.fen);
      estado(enElFinal ? "En el tablero, el final después de los cambios (le toca a las " + COLOR[yo] + ")." : "En el tablero, la posición de ahora.");
    });
    bVer.setAttribute("aria-pressed", "false");
    $("controles").appendChild(bVer);
    ver();
    U.opciones(item, ["gana", "tablas", "pierde"], (v) => N.VEREDICTO[v], (v) => v === item.veredicto, (bien, n, sol) => {
      estado((bien ? "✓ ¡Correcto! " : sol ? "La solución: " : "Respuesta incorrecta. Era: ") + N.VEREDICTO[item.veredicto] + ". " + (n ? textoEstrellas(n) : sol ? "Cuenta como no resuelto." : ""));
      explicar(item.respuesta);
      terminar(item, n);
    }, "en el final de peones, mira quién tiene el peón pasado más lejos, dónde están los reyes y quién tiene jugadas de reserva.");
  };

  /* ================================================ 23. La intermedia
     Como Aguanta: se juega en el tablero; si falla, se deshace y se le dice
     qué pasa. Recapturar en seguida tiene su propio aviso. */
  U.JUEGOS.intermedia = function (item) {
    const yo = item.fen.split(" ")[1];
    const juego = new Chess(item.fen);
    const nat = new Chess(item.fen).move(item.natural);
    let errores = 0, pistas = 0, hecho = false;
    const marcas = {};
    const redibujar = (ultima) => U.tablero(juego.fen(), { orientacion: yo, juego, ultima, marcas: Object.assign({}, marcas), clic: hecho ? null : U.moverConClic(juego, jugar) });
    function cerrar(n, ultima) {
      hecho = true;
      U.pedirJugada("", null);
      bPista.disabled = true; bVer.disabled = true;
      redibujar(ultima);
      explicar(item.respuesta);
      terminar(item, n);
    }
    function jugar(mov) {
      if (hecho) return;
      const r = N.intermediaAcertada(Chess, item, mov);
      if (!r.legal) { estado("Esa jugada no es legal para las " + COLOR[yo] + "."); return; }
      if (r.ok) {
        const m = juego.move(mov);
        const n = Math.max(1, 3 - errores - pistas);
        estado("✓ ¡Esa es la intermedia! " + R.sanEs(r.san) + ". " + textoEstrellas(n));
        cerrar(n, [m.from, m.to]);
        return;
      }
      errores++;
      const castigo = M.textoRefuta(r.refuta);
      const porque = r.natural ? "✗ Recapturar en seguida no es lo mejor. " + castigo : "✗ " + R.sanEs(r.san) + " no es. " + castigo;
      if (errores >= 3) {
        const m = juego.move(item.jugada);
        estado(porque + " La intermedia era " + item.jugadaEs + ".");
        cerrar(0, [m.from, m.to]);
        return;
      }
      estado(porque + " Busca una jugada que gane más ANTES de recapturar.");
      redibujar([nat.from, nat.to]);
    }
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + " (el tablero está de tu lado). Lo natural sería " + item.naturalEs + ": está marcada en el tablero.";
    $("juego-enunciado").textContent = "Antes de recuperar el material, ¿hay algo mejor? Encuentra la jugada intermedia.";
    const bPista = boton("💡 Pista", BTN_SEGUNDO + " mt-1", () => {
      if (hecho) return;
      pistas++;
      bPista.disabled = true;
      const m = new Chess(item.fen).move(item.jugada);
      marcas[m.from] = { cls: "m-bien", signo: "?", dicho: "pista: esta pieza" };
      estado("Pista: la intermedia se juega con " + piezaDicha(yo + m.piece) + " de " + m.from + (/\+/.test(m.san) ? ", y da jaque" : "") + ". Una estrella menos.");
      redibujar([nat.from, nat.to]);
    });
    const bVer = boton("Ver la respuesta", BTN_SEGUNDO + " mt-1 ml-2", () => {
      if (hecho) return;
      const m = juego.move(item.jugada);
      estado("La intermedia era " + item.jugadaEs + ".");
      cerrar(0, [m.from, m.to]);
    });
    $("controles").append(bPista, bVer);
    U.ponerAyudas({ pista: () => bPista.click(), solucion: () => bVer.click() });
    redibujar([nat.from, nat.to]);
    U.pedirJugada("O escribe tu jugada (las " + COLOR[yo] + ")", (txt) => {
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { U.noSePudo(txt); return; }
      $("jugada-input").value = "";
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    });
  };

  /* ================================================ 24. El defensor sobrecargado
     Dos pasos: la pieza (tocarla o escribir su casilla) y la jugada. */
  U.JUEGOS.sobrecargado = function (item) {
    const yo = item.fen.split(" ")[1], rival = R.otro(yo);
    const juego = new Chess(item.fen);
    const t0 = R.tablero(item.fen);
    const d = t0[R.idx(item.defensor)];
    let paso = 1, errores = 0, vista = false, hecho = false;
    const marcas = {};
    const redibujar = (ultima) => U.tablero(juego.fen(), { orientacion: yo, juego, ultima, marcas: Object.assign({}, marcas),
      clic: hecho ? null : paso === 1 ? elegirPieza : U.moverConClic(juego, jugar) });
    function cerrar(n, ultima) {
      hecho = true;
      U.pedirJugada("", null);
      bPista.disabled = true; bVer.disabled = true;
      redibujar(ultima);
      explicar(item.respuesta);
      terminar(item, n);
    }
    function mostrarDefensor() {
      marcas[item.defensor] = { cls: "m-mal", signo: "!", dicho: "el defensor sobrecargado" };
      item.cuida.forEach((s, k) => { marcas[s] = { cls: "m-bien", signo: String(k + 1), dicho: "la casilla " + (k + 1) + " que cuida" }; });
    }
    function aPaso2(texto) {
      paso = 2;
      mostrarDefensor();
      $("juego-enunciado").textContent = "Ahora juega la jugada que obliga " + aLa(laPieza(d.c + d.t, item.defensor)) + " a elegir.";
      $("jugada-input").placeholder = SUGIERE_JUGADA;
      U.pedirJugada("O escribe tu jugada (las " + COLOR[yo] + ")", escrita);
      estado(texto + " Cuida " + item.cuida[0] + " y " + item.cuida[1] + " (marcadas 1 y 2). Ahora juega la jugada que lo sobrecarga.");
      redibujar(null);
    }
    function elegirPieza(s) {
      if (hecho || paso !== 1) return;
      s = String(s || "").trim().toLowerCase();
      if (!CASILLA.test(s)) { estado("Escribe la casilla de la pieza, por ejemplo e7."); return; }
      const p = t0[R.idx(s)];
      if (!p) { estado("En " + s + " no hay ninguna pieza."); return; }
      if (p.c !== rival) { estado("Esa pieza es tuya: busca una pieza del rival (las " + COLOR[rival] + ")."); return; }
      if (s === item.defensor) { aPaso2("✓ ¡Eso es! " + laPieza(d.c + d.t, s).replace(/^./, (c) => c.toUpperCase()) + " está haciendo dos trabajos."); return; }
      errores++;
      if (errores >= 2) { vista = true; aPaso2("✗ Tampoco. El sobrecargado es " + laPieza(d.c + d.t, item.defensor) + "."); return; }
      estado("✗ " + laPieza(p.c + p.t, s).replace(/^./, (c) => c.toUpperCase()) + " no está cuidando dos cosas a la vez. Busca la pieza que, si se mueve, deja algo sin cuidar.");
    }
    function jugar(mov) {
      if (hecho || paso !== 2) return;
      const m = new Chess(item.fen).move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      if (m.san === item.jugada) {
        const j = juego.move(mov);
        const n = vista ? 0 : errores === 0 ? 3 : errores === 1 ? 2 : 1;
        estado("✓ ¡" + R.sanEs(m.san) + "! El defensor no puede con las dos." + (n ? " " + textoEstrellas(n) : " Con la pieza mostrada, cuenta como no resuelto."));
        cerrar(n, [j.from, j.to]);
        return;
      }
      errores++;
      if (errores >= 4) {
        const j = juego.move(item.jugada);
        estado("✗ Tampoco. Era " + item.jugadaEs + ".");
        cerrar(0, [j.from, j.to]);
        return;
      }
      estado("✗ " + R.sanEs(m.san) + " no lo sobrecarga. Juega en una de las casillas que cuida, para que tenga que ir ahí y deje la otra.");
      redibujar(null);
    }
    function escrita(txt) {
      if (hecho) return;
      $("jugada-input").value = "";
      if (paso === 1) { elegirPieza(casillaEscrita(txt) || txt); return; }
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { U.noSePudo(txt); return; }
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    }
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + " (el tablero está de tu lado).";
    $("juego-enunciado").textContent = "¿Qué pieza del rival está cuidando dos cosas a la vez? Tócala o escribe su casilla.";
    const bPista = boton("💡 Pista", BTN_SEGUNDO + " mt-1", () => {
      if (hecho) return;
      errores++;
      if (paso === 1) estado("Pista: una de las casillas que cuida es " + item.cuida[1] + ". Una estrella menos.");
      else { const m = new Chess(item.fen).move(item.jugada); estado("Pista: la jugada va a " + m.to + ". Una estrella menos."); }
    });
    const bVer = boton("Ver la respuesta", BTN_SEGUNDO + " mt-1 ml-2", () => {
      if (hecho) return;
      mostrarDefensor();
      const j = juego.move(item.jugada);
      estado("El sobrecargado era " + laPieza(d.c + d.t, item.defensor) + ", y la jugada " + item.jugadaEs + ".");
      cerrar(0, [j.from, j.to]);
    });
    $("controles").append(bPista, bVer);
    U.ponerAyudas({ pista: () => bPista.click(), solucion: () => bVer.click() });
    redibujar(null);
    sugerir("e7");
    U.pedirJugada("O escribe la casilla de la pieza (por ejemplo, e7)", escrita);
  };

  /* ================================================ 25. La peor pieza
     Dos pasos: elegir la pieza propia que conviene mejorar y moverla. */
  U.JUEGOS["peor-pieza"] = function (item) {
    const yo = item.fen.split(" ")[1];
    const juego = new Chess(item.fen);
    const t0 = R.tablero(item.fen);
    const p = t0[R.idx(item.pieza)];
    const mejor = item.porPieza[item.pieza];
    let paso = 1, e1 = 0, e2 = 0, vista = false, hecho = false;
    const marcas = {};
    const redibujar = (ultima) => U.tablero(juego.fen(), { orientacion: yo, juego, ultima, marcas: Object.assign({}, marcas),
      clic: hecho ? null : paso === 1 ? elegirPieza : U.moverConClic(juego, jugar) });
    function cerrar(n, ultima) {
      hecho = true;
      U.pedirJugada("", null);
      bVer.disabled = true;
      redibujar(ultima);
      explicar(item.respuesta);
      terminar(item, n);
    }
    function aPaso2(texto) {
      paso = 2;
      marcas[item.pieza] = { cls: "m-bien", signo: "!", dicho: "la pieza que mejorar" };
      $("juego-enunciado").textContent = "Ahora mueve " + laPieza(p.c + p.t, item.pieza) + " a una casilla mejor.";
      $("jugada-input").placeholder = SUGIERE_JUGADA;
      U.pedirJugada("O escribe tu jugada (las " + COLOR[yo] + ")", escrita);
      estado(texto + " Ahora muévela a una casilla mejor.");
      redibujar(null);
    }
    function elegirPieza(s) {
      if (hecho || paso !== 1) return;
      s = String(s || "").trim().toLowerCase();
      if (!CASILLA.test(s)) { estado("Escribe la casilla de la pieza, por ejemplo b1."); return; }
      const q = t0[R.idx(s)];
      if (!q || q.c !== yo || !item.porPieza[s]) { estado("Elige una de tus piezas (las " + COLOR[yo] + "): caballo, alfil, torre o dama."); return; }
      if (s === item.pieza) { aPaso2("✓ ¡Esa es! " + laPieza(p.c + p.t, s).replace(/^./, (c) => c.toUpperCase()) + " es la que más gana con moverse."); return; }
      e1++;
      const suya = item.porPieza[s];
      if (e1 >= 2) { vista = true; aPaso2("✗ Tampoco: con esa, lo mejor es " + R.sanEs(suya.san) + ". La que conviene mejorar es " + laPieza(p.c + p.t, item.pieza) + "."); return; }
      estado("✗ Con " + laPieza(q.c + q.t, s) + " lo mejor que hay es " + R.sanEs(suya.san) + " (" + R.numeroBalanza(suya.eval / 100) + "), y otra pieza tiene algo mejor. Busca la que está peor puesta.");
    }
    function jugar(mov) {
      if (hecho || paso !== 2) return;
      const m = new Chess(item.fen).move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      if (m.from !== item.pieza) { estado("Mueve la pieza elegida: " + laPieza(p.c + p.t, item.pieza) + "."); redibujar(null); return; }
      if (item.buenas.indexOf(m.san) >= 0) {
        const j = juego.move(mov);
        const n = vista ? 0 : N.estrellasPeorPieza(e1, e2);
        estado("✓ ¡Bien! " + R.sanEs(m.san) + (m.san === mejor.san ? " es la mejor." : " es casi tan buena como la mejor, " + R.sanEs(mejor.san) + ".") + (n ? " " + textoEstrellas(n) : " Con la pieza mostrada, cuenta como no resuelto."));
        cerrar(n, [j.from, j.to]);
        return;
      }
      e2++;
      if (e2 >= 3) {
        const j = juego.move(mejor.san);
        estado("✗ Tampoco. Lo mejor era " + R.sanEs(mejor.san) + ".");
        cerrar(0, [j.from, j.to]);
        return;
      }
      estado("✗ " + R.sanEs(m.san) + " no la mejora lo suficiente: hay una casilla mejor para ella. Prueba otra.");
      redibujar(null);
    }
    function escrita(txt) {
      if (hecho) return;
      $("jugada-input").value = "";
      if (paso === 1) { elegirPieza(casillaEscrita(txt) || txt); return; }
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { U.noSePudo(txt); return; }
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    }
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + ". No hay golpes: es momento de mejorar una pieza.";
    $("juego-enunciado").textContent = "¿Qué pieza mejorarías? Toca la que está peor puesta o escribe su casilla.";
    const bVer = boton("Ver la respuesta", BTN_SEGUNDO + " mt-1", () => {
      if (hecho) return;
      marcas[item.pieza] = { cls: "m-bien", signo: "!", dicho: "la pieza que mejorar" };
      const j = juego.move(mejor.san);
      estado("La pieza era " + laPieza(p.c + p.t, item.pieza) + ", y su mejor jugada " + R.sanEs(mejor.san) + ".");
      cerrar(0, [j.from, j.to]);
    });
    $("controles").appendChild(bVer);
    U.ponerAyudas({
      pista: () => estado(paso === 1 ? "Pista: es " + (femenina(p.t) ? "una " : "un ") + R.NOMBRE[p.t] + "." : "Pista: mira adónde podría ir para hacer más."),
      solucion: () => bVer.click(),
    });
    redibujar(null);
    sugerir("b1");
    U.pedirJugada("O escribe la casilla de la pieza (por ejemplo, b1)", escrita);
  };
})();
