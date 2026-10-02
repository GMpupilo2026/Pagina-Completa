/* Los Tipos de entrenamiento 8 a 19 de entreno/tipos.html: el Barrido,
 * Intercambios, Constrúyela tú, Rey y peón, Adivina la jugada del maestro,
 * ¿Qué apertura es?, la Ruta segura, Aguanta, Remata la ventaja, Elige a
 * tiempo, Tus propios errores y Salva las tablas.
 *
 * Usan las mismas piezas de la página que los siete primeros (el tablero, los
 * avisos, las estrellas: window.TiposUI, en js/entreno-tipos.js) y las reglas
 * de js/tipos-reglas-mas.js. Este archivo solo arma cada juego.
 */
(function () {
  "use strict";
  const U = window.TiposUI;
  const R = window.TiposReglas;
  const M = window.TiposReglasMas;
  if (!U || !M) return;
  const { $, el, boton, estado, explicar, textoEstrellas, terminar, COLOR, BTN_PRIMARIO, BTN_SEGUNDO } = U;
  const tab = U.tab();
  const piezaDicha = (pc) => {
    const f = pc[1] === "q" || pc[1] === "r";
    return R.NOMBRE[pc[1]] + " " + (pc[0] === "w" ? (f ? "blanca" : "blanco") : (f ? "negra" : "negro"));
  };
  const articulo = (pc) => (pc[1] === "q" || pc[1] === "r" ? "una " : "un ");
  const CLASE_OPCION = "block w-full text-left p-3 rounded-lg bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 hover:border-accent-500 text-brand-800 dark:text-brand-100 font-semibold mb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

  /* Opciones de una sola respuesta: primera vez bien, tres estrellas;
     segunda, una; después se dice cuál era.
     Cada botón lleva su letra escrita («Opción A. Italiana»), y en Modo
     Adaptado se contesta también escribiendo: la letra, el número o una
     palabra que la distinga («italiana», «tablas», «ganan»). Si el juego ya
     puso su propio recuadro (Intercambios: «+1», «pierdes 2»), lo deja: ese
     prueba primero con las opciones escritas (U.responderConOpcion). */
  /* `pista`: el texto de la pista que ya trae el ejercicio, si tiene (si no,
     «pista» dice que no hay). «solución» marca la buena, la dice y cuenta como
     fallado: `alTerminar(false, 0, true)`, y cada juego antepone «La
     solución:» en vez de «Respuesta incorrecta». */
  function opciones(item, lista, etiqueta, esBuena, alTerminar, pista) {
    let intentos = 0, hecho = false;
    const caja = el("div");
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-label", "Opciones");
    const conLetra = (op, k) => "Opción " + U.letraDe(k) + ". " + etiqueta(op);
    const botones = [];
    lista.forEach((op, k) => {
      const b = el("button", CLASE_OPCION, conLetra(op, k));
      b.type = "button";
      botones.push(b);
      b.dataset.op = String(op);   // para contestar escribiendo (Intercambios)
      b.addEventListener("click", () => {
        if (hecho) return;
        intentos++;
        if (esBuena(op)) {
          hecho = true;
          const n = intentos === 1 ? 3 : intentos === 2 ? 1 : 0;
          b.textContent = "✓ " + conLetra(op, k);
          caja.querySelectorAll("button").forEach((x) => { x.disabled = true; });
          alTerminar(true, n);
        } else {
          b.disabled = true;
          b.textContent = "✗ " + conLetra(op, k);
          if (intentos >= 2) {
            hecho = true;
            caja.querySelectorAll("button").forEach((x) => { x.disabled = true; });
            alTerminar(false, 0);
          } else estado("Respuesta incorrecta: no es la opción " + U.letraDe(k) + ". Te queda un intento.");
        }
      });
      caja.appendChild(b);
    });
    $("controles").appendChild(caja);
    U.ponerOpciones(lista.map((op, k) => ({ nombre: etiqueta(op), el: botones[k], elegir: () => botones[k].click() })));
    U.ponerAyudas({
      pista: pista ? () => estado("Pista: " + pista) : null,
      solucion: () => {
        if (hecho) { estado("Este ya lo resolviste. " + U.textoSiguiente()); return; }
        hecho = true;
        const k = lista.findIndex((op) => esBuena(op));
        caja.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        if (k >= 0) botones[k].textContent = "✓ " + conLetra(lista[k], k);
        alTerminar(false, 0, true);
      },
    });
    if (U.adaptado() && !$("jugada-form").dataset.propio) {
      U.pedirJugada("Escribe la letra de la opción o una palabra suya (por ejemplo «b»); «opciones» las dice", (txt) => {
        if (hecho) { estado("Este ya lo resolviste."); return; }
        if (!U.responderConOpcion(txt)) U.noEsOpcion(txt);
      });
    }
    delete $("jugada-form").dataset.propio;
  }

  /* ================================================ 8. El Barrido */
  const NOMBRE_CLASE = { jaques: "jaques", capturas: "capturas", amenazas: "amenazas" };
  U.JUEGOS.barrido = function (item) {
    const yo = item.fen.split(" ")[1];
    const dadas = [];
    let hecho = false, reloj = null;
    const juego = new Chess(item.fen);
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + ".";
    // «todos los jaques», «todas las capturas», «todas las amenazas»
    const pide = item.pide.map((c) => (c === "jaques" ? "todos los " : "todas las ") + NOMBRE_CLASE[c]);
    $("juego-enunciado").textContent = "Encuentra " + (pide.length === 1 ? pide[0] : pide.slice(0, -1).join(", ") + " y " + pide[pide.length - 1]) + " de las " + COLOR[yo] + ".";
    const lista = el("ul", "flex flex-wrap gap-2 mb-3 list-none p-0 min-h-[2.5rem]");
    lista.setAttribute("aria-label", "Jugadas que anotaste");
    const pintarLista = () => {
      lista.innerHTML = "";
      if (!dadas.length) { lista.appendChild(el("li", "text-sm text-brand-500 dark:text-brand-300", "Todavía no anotaste ninguna.")); return; }
      dadas.forEach((s, k) => {
        const li = el("li", "inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-sm");
        li.appendChild(el("span", "font-semibold", R.sanEs(s)));
        const x = boton("✖", "text-xs px-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", () => { if (hecho) return; dadas.splice(k, 1); pintarLista(); });
        x.setAttribute("aria-label", "Quitar " + R.sanEs(s));
        li.appendChild(x);
        lista.appendChild(li);
      });
    };
    const anotar = (mov) => {
      if (hecho) return;
      const m = new Chess(item.fen).move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      if (dadas.indexOf(m.san) >= 0) { estado(R.sanEs(m.san) + " ya estaba anotada."); return; }
      dadas.push(m.san);
      pintarLista();
      estado("Anotada: " + R.sanEs(m.san) + ". Llevas " + dadas.length + ".");
      U.pintar();
    };
    U.tablero(item.fen, { orientacion: yo, juego, clic: U.moverConClic(juego, anotar) });
    $("controles").appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2",
      "Toca la pieza y la casilla (no se mueve nada: solo se anota) o escribe cada jugada." + (item.pide.includes("amenazas") ? " Amenaza: una jugada sin jaque ni captura que ataca algo sin defensa, o que vale más que la pieza que lo ataca." : "")));
    $("controles").appendChild(lista);
    pintarLista();
    // Nivel 4 con reloj; en Modo Adaptado, el triple (como Elige a tiempo).
    let quedan = item.nivel === 4 ? (U.adaptado() ? 270 : 90) : 0;
    const cuenta = el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200 mb-2");
    if (quedan) {
      cuenta.textContent = "Te quedan " + quedan + " s.";
      $("controles").appendChild(cuenta);
      reloj = setInterval(() => {
        quedan--;
        cuenta.textContent = "Te quedan " + quedan + " s.";
        if (quedan === 10) estado("Quedan 10 segundos.");
        if (quedan <= 0) comprobar();
      }, 1000);
      U.alLimpiar(() => clearInterval(reloj));
    }
    const comprobar = () => {
      if (hecho) return;
      hecho = true;
      clearInterval(reloj);
      U.pedirJugada("", null);
      tab.clic = null; U.pintar();
      const esperadas = [].concat(...item.pide.map((c) => item.respuestas[c]));
      const r = M.corregirBarrido(esperadas, dadas);
      estado((r.estrellas === 3 ? "✓ ¡Las encontraste todas! " : "Encontraste " + r.bien.length + " de " + esperadas.length + ". ") + (r.estrellas ? textoEstrellas(r.estrellas) : "Sin estrellas."));
      const partes = item.pide.map((c) => ({ jaques: "Jaques", capturas: "Capturas", amenazas: "Amenazas" })[c] + ": " +
        (item.respuestas[c].length ? item.respuestas[c].map((s) => R.sanEs(s) + (dadas.indexOf(s) >= 0 ? " ✓" : " (faltó)")).join(", ") : "ninguna") + ".");
      if (r.mal.length) partes.push("No eran de las que se pedían: " + r.mal.map(R.sanEs).join(", ") + ".");
      explicar(partes);
      terminar(item, r.estrellas);
    };
    $("controles").appendChild(boton("Comprobar", BTN_PRIMARIO, comprobar));
    U.pedirJugada("O escribe una jugada y pulsa Intro", (txt) => {
      const m = U.jugadaEscrita(new Chess(item.fen), txt);
      if (!m) { U.noSePudo(txt); return; }
      $("jugada-input").value = "";
      anotar({ from: m.from, to: m.to, promotion: m.promotion });
    });
  };

  /* ================================================ 9. Intercambios */
  U.JUEGOS.intercambios = function (item) {
    const yo = item.fen.split(" ")[1];
    U.tablero(item.fen, { orientacion: yo, ultima: [item.casilla] });
    const p = R.tablero(item.fen)[R.idx(item.casilla)];
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + ". La casilla marcada es " + item.casilla + " (" + piezaDicha(p.c + p.t) + ").";
    $("juego-enunciado").textContent = "Si las " + COLOR[yo] + " empiezan a capturar en " + item.casilla + " y cada bando sigue solo mientras le conviene, ¿cómo termina?";
    $("controles").appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-3", "Solo cuentan las capturas en esa casilla, siempre con la pieza de menos valor. Peón 1, caballo y alfil 3, torre 5, dama 9."));
    const signo = (v) => (v > 0 ? "gana" : v < 0 ? "pierde" : "igual");
    const etiqueta = (op) => ({ gana: "Ganas material", igual: "Queda igual", pierde: "Pierdes material" })[op] ||
      (+op > 0 ? "+" + op + " (ganas " + op + ")" : +op < 0 ? "−" + (-op) + " (pierdes " + (-op) + ")" : "0 (queda igual)");
    /* Contestar escribiendo: «+1», «-1», «ganas 1», «pierdes 1», «igual», o
       en los niveles 1 y 2 solo «ganas», «pierdes», «igual». Aprieta el botón
       de esa opción, así cuenta igual que el clic. */
    $("jugada-form").dataset.propio = "1";   // opciones() no lo reemplaza
    U.pedirJugada("O escribe la respuesta («+1», «-1», «ganas 1», «pierdes 1», «igual») o la letra de la opción", (txt) => {
      // La letra de la opción («b», «opción b») también vale.
      if (window.CuadroComandos && CuadroComandos.opcionPedida(txt, item.opciones.length) !== null && U.responderConOpcion(txt)) return;
      const t = txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.!¡]/g, "").trim();
      let sg = null, num = null, m;
      if (/^(igual|queda igual|0|cero|empate|nada)$/.test(t)) { sg = 0; num = 0; }
      else if ((m = /^(?:\+|ganas?|gano|ganan)\s*(\d+)?(?:\s*puntos?)?$/.exec(t))) { sg = 1; num = m[1] ? +m[1] : null; }
      else if ((m = /^(?:-|−|pierdes?|pierdo|pierden)\s*(\d+)?(?:\s*puntos?)?$/.exec(t))) { sg = -1; num = m[1] ? -m[1] : null; }
      else if ((m = /^(\d+)$/.exec(t))) { sg = 1; num = +m[1]; }
      // El nombre del botón («ganas material»), o una palabra que lo distinga.
      if (sg === null && U.responderConOpcion(txt)) return;
      if (sg === null) { estado("No entendí «" + txt + "». Escribe «+1», «-1», «ganas 1», «pierdes 1», «igual» o la letra de la opción."); return; }
      let op;
      if (item.nivel <= 2) op = sg > 0 ? "gana" : sg < 0 ? "pierde" : "igual";
      else {
        if (num === null) { estado("¿Por cuánto? Escribe el número: " + item.opciones.map((o) => (+o > 0 ? "+" + o : o)).join(", ") + "."); $("jugada-input").select(); return; }
        op = item.opciones.find((o) => +o === num);
        if (op === undefined) { estado("«" + txt + "» no es una de las opciones: " + item.opciones.map((o) => (+o > 0 ? "+" + o : o)).join(", ") + "."); $("jugada-input").select(); return; }
      }
      const b = Array.from($("controles").querySelectorAll("button[data-op]")).find((x) => x.dataset.op === String(op));
      if (!b || b.disabled) { U.responderConOpcion(U.letraDe(Array.from($("controles").querySelectorAll("button[data-op]")).indexOf(b))) || estado("Esa opción ya la probaste."); return; }
      $("jugada-input").value = "";
      b.click();
    });
    opciones(item, item.opciones, etiqueta, (op) => (item.nivel <= 2 ? op === signo(item.valor) : +op === item.valor), (bien, n, sol) => {
      const r = M.textoIntercambio(item.valor, yo);
      estado((bien ? "✓ ¡Correcto! " : sol ? "La solución: " : "Respuesta incorrecta. Era: ") + r.charAt(0).toUpperCase() + r.slice(1) + ". " + (n ? textoEstrellas(n) : sol ? "Cuenta como no resuelto." : ""));
      explicar(item.respuesta);
      terminar(item, n);
    }, "cuenta las capturas en " + item.casilla + " por turnos, siempre con la pieza de menos valor, y cada bando para cuando ya no le conviene seguir. Peón 1, caballo y alfil 3, torre 5, dama 9.");
  };

  /* ================================================ 10. Constrúyela tú */
  const ENUNCIADO_CONSTRUYE = {
    "mate-ya": (pc) => "Coloca " + articulo(pc) + piezaDicha(pc) + " donde dé jaque mate ahora mismo.",
    horquilla: (pc) => "Coloca " + articulo(pc) + piezaDicha(pc) + " que ataque a la vez dos piezas grandes (rey, dama, torre o una pieza sin defensa) y que no se lo puedan comer.",
    clavada: (pc) => "Coloca " + articulo(pc) + piezaDicha(pc) + " que clave una pieza rival contra su rey, sin dar jaque y sin que se la puedan comer.",
    "mate-en-1": (pc) => "Coloca " + articulo(pc) + piezaDicha(pc) + " para que las " + COLOR[pc[0]] + " tengan mate en una jugada.",
    "quitar-mate": (pc) => "Las " + COLOR[R.otro(pc[0])] + " tienen mate en 1. Coloca " + articulo(pc) + piezaDicha(pc) + " para que ya no lo tengan (sin dar jaque).",
  };
  U.JUEGOS.construye = function (item) {
    const color = item.pieza[0];
    let errores = 0, hecho = false;
    const probar = (s) => {
      if (hecho) return;
      s = String(s || "").trim().toLowerCase();
      if (!/^[a-h][1-8]$/.test(s)) { estado("Escribe una casilla, por ejemplo e4."); return; }
      const r = M.construye(Chess, item, s);
      if (!r.ok) {
        errores++;
        tab.marcas[s] = { cls: "m-mal", signo: "✗", dicho: "no sirve" };
        U.pintar();
        estado("✗ " + s + ": " + r.motivo);
        return;
      }
      hecho = true;
      const n = Math.max(1, 3 - errores);
      const t = R.tablero(item.fen); t[R.idx(s)] = { t: item.pieza[1], c: color };
      U.tablero(R.colocacion(t) + " w - - 0 1", { orientacion: color, marcas: { [s]: { cls: "m-bien", signo: "✓", dicho: "aquí" } } });
      U.pedirJugada("", null);
      estado("✓ ¡Eso es! " + textoEstrellas(n));
      const otras = item.soluciones.filter((x) => x !== s);
      explicar([otras.length ? "También servían: " + otras.join(", ") + "." : "Era la única casilla que servía."].concat(r.blancos ? ["Ataca a la vez " + r.blancos.join(" y ") + "."] : []).concat(r.clavada ? ["Queda clavada la pieza de " + r.clavada + "."] : []));
      terminar(item, n);
    };
    U.tablero(item.fen, { orientacion: color, clic: probar });
    $("juego-turno").textContent = "Pones una pieza en una casilla vacía.";
    $("juego-enunciado").textContent = ENUNCIADO_CONSTRUYE[item.objetivo](item.pieza);
    U.pedirJugada("O escribe la casilla (por ejemplo, f7)", (txt) => { $("jugada-input").value = ""; probar(txt); });
  };

  /* ================================================ 11. Rey y peón */
  let bitsKpk = null;
  U.PREPARAR.peones = async function () {
    if (bitsKpk) return;
    const r = await fetch("data/kpk.json");
    if (!r.ok) throw new Error("kpk.json: " + r.status);
    bitsKpk = M.bitsDeBase64((await r.json()).bits);
  };
  U.JUEGOS.peones = function (item) {
    const turno = item.fen.split(" ")[1];
    $("juego-turno").textContent = "Juegan las " + COLOR[turno] + ".";
    if (item.nivel <= 2) {
      U.tablero(item.fen, { orientacion: "w" });
      $("juego-enunciado").textContent = item.nivel === 1 ? "¿El peón corona, o el rey negro lo alcanza?" : "¿Ganan las blancas, o son tablas?";
      if (item.nivel === 1) $("controles").appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-3", "Pista de siempre: la regla del cuadrado. Si el rey negro entra en el cuadrado del peón, lo alcanza."));
      opciones(item, [true, false], (v) => (v ? "Ganan las blancas: el peón corona" : "Tablas: el rey negro lo para"), (v) => v === item.gana, (bien, n, sol) => {
        estado((bien ? "✓ ¡Correcto! " : sol ? "La solución: " : "Respuesta incorrecta: ") + (item.gana ? "ganan las blancas." : "son tablas.") + " " + (n ? textoEstrellas(n) : sol ? "Cuenta como no resuelto." : ""));
        explicar(item.respuesta.concat(["Calculado con la tabla completa de rey y peón contra rey: no hay opinión, es el resultado con la mejor jugada de los dos."]));
        terminar(item, n);
      }, item.nivel === 1 ? "la regla del cuadrado. Si el rey negro entra en el cuadrado del peón, lo alcanza." : null);
      return;
    }
    const juego = new Chess(item.fen);
    let errores = 0, hecho = false, ocupado = false, jugadas = 0, conSolucion = false;
    const redibujar = (ultima) => U.tablero(juego.fen(), { orientacion: "w", juego, ultima, clic: hecho || ocupado ? null : U.moverConClic(juego, jugar) });
    function fin(texto, n) { hecho = true; U.pedirJugada("", null); redibujar(tab.ultima); estado(texto + (n ? " " + textoEstrellas(n) : "")); if (n || conSolucion) terminar(item, n); }
    function jugar(mov) {
      if (hecho || ocupado) return;
      const m = juego.move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      jugadas++;
      if (m.promotion) {
        const comen = juego.moves({ verbose: true }).some((x) => x.to === m.to);
        if (juego.in_stalemate()) return fin("✗ Coronaste, pero el rey negro quedó ahogado: tablas. Prueba otra vez.", 0);
        if (comen) return fin("✗ Coronaste, pero el rey negro se come la pieza nueva: tablas. Prueba otra vez.", 0);
        if (conSolucion) return fin("Coronaste en " + jugadas + " jugadas, con la solución: cuenta como no resuelto.", 0);
        return fin("✓ ¡Coronaste! En " + jugadas + " jugadas.", Math.max(1, 3 - errores));
      }
      if (!M.kpkGana(bitsKpk, juego.fen())) {
        if (item.nivel === 3) {
          juego.undo(); jugadas--; errores++;
          estado("✗ " + R.sanEs(m.san) + " deja escapar la victoria: así son tablas. Busca otra." + (errores >= 2 ? " Era " + R.sanEs(item.jugada) + "." : ""));
          if (errores >= 2) return fin("La única jugada que ganaba era " + R.sanEs(item.jugada) + ".", 0);
          redibujar(null);
          return;
        }
        return fin("✗ Con " + R.sanEs(m.san) + " se escapó: ahora son tablas. Prueba otra vez.", 0);
      }
      if (item.nivel === 3) return conSolucion ? fin("Jugaste la solución, " + R.sanEs(m.san) + ": cuenta como no resuelto.", 0)
        : fin("✓ ¡Esa es la única que gana! " + R.sanEs(m.san) + ".", Math.max(1, 3 - errores));
      ocupado = true;
      redibujar([m.from, m.to]);
      setTimeout(() => {
        ocupado = false;
        const d = M.defensaKpk(Chess, bitsKpk, juego.fen());
        const r = juego.move(d);
        if (r.captured) return fin("✗ El rey negro se comió el peón: tablas.", 0);
        estado("El rey negro juega " + R.sanEs(r.san) + ".");
        redibujar([r.from, r.to]);
      }, 350);
    }
    $("juego-enunciado").textContent = item.nivel === 3 ? "Solo UNA jugada gana. ¿Cuál?" : "Esta posición se gana: llévalo a coronar sin dejar escapar la victoria.";
    redibujar(null);
    /* «pista» y «solución» escritas (antes: «No entendí»). La pista dice qué
       pieza mueve una jugada que gana; la solución dice la jugada entera y el
       ejercicio ya no da estrellas. Las que ganan salen de la misma tabla de
       rey y peón que corrige. */
    const queGana = () => {
      if (item.nivel === 3 && juego.fen() === item.fen) return juego.moves({ verbose: true }).find((x) => x.san === item.jugada) || null;
      return juego.moves({ verbose: true }).find((x) => {
        const g = new Chess(juego.fen()); g.move(x);
        return (x.promotion && !g.in_stalemate() && !g.moves({ verbose: true }).some((y) => y.to === x.to)) || (!x.promotion && M.kpkGana(bitsKpk, g.fen()));
      }) || null;
    };
    U.ponerAyudas({
      pista: () => {
        if (hecho || ocupado) { estado(hecho ? "Este ejercicio ya terminó." : "Espera: el rey negro está jugando."); return; }
        const x = queGana();
        if (!x) { estado("En este ejercicio no hay pista ahora."); return; }
        errores++;
        estado("Pista: juega con " + piezaDicha(x.color + x.piece) + " de " + x.from + ". Con pista, una estrella menos.");
      },
      solucion: () => {
        if (hecho || ocupado) { estado(hecho ? "Este ejercicio ya terminó." : "Espera: el rey negro está jugando."); return; }
        const x = queGana();
        if (!x) { estado("En este ejercicio no hay solución para decir ahora."); return; }
        conSolucion = true;
        estado((item.nivel === 3 ? "La solución: la única jugada que gana es " : "La solución: una jugada que gana es ") + R.sanEs(x.san) + ". Juégala para seguir; cuenta como no resuelto.");
      },
    });
    U.pedirJugada("O escribe tu jugada", (txt) => {
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { U.noSePudo(txt); return; }
      $("jugada-input").value = "";
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    });
  };

  /* ================================================ 12. Adivina la jugada del maestro
     Las partidas están detrás del candado de los cursos: se piden al servidor
     con la sesión, y quien no tiene el acceso vigente recibe un «no». */
  let maestroCompleto = false;
  U.PREPARAR.maestro = async function () {
    if (maestroCompleto) return;
    const r = await fetch("../cursos/protegido/data/tipos-maestro.json", { credentials: "same-origin" });
    if (r.status === 401 || r.status === 403) throw { mensaje: "«Adivina la jugada del maestro» usa las partidas del curso «Partidas modelo», así que necesita tu acceso a la Academia vigente." };
    if (!r.ok) throw new Error("tipos-maestro.json: " + r.status);
    U.ponerDatos("maestro", (await r.json()).maestro);
    maestroCompleto = true;
  };
  U.JUEGOS.maestro = function (item) {
    const lado = item.lado;
    let k = 0, puntos = 0, ocupado = false;
    const detalle = [];
    $("juego-turno").textContent = item.blancas + " – " + item.negras + (item.evento ? " · " + item.evento : "") + ". Juegas con las " + COLOR[lado] + ".";
    const cuenta = el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2");
    $("controles").appendChild(cuenta);
    function mostrar() {
      const pos = item.posiciones[k];
      const juego = new Chess(pos.fen);
      $("juego-enunciado").textContent = "Jugada " + pos.n + ": ¿qué jugó el maestro?";
      cuenta.textContent = "Posición " + (k + 1) + " de " + item.posiciones.length + " · puntos: " + puntos;
      U.tablero(pos.fen, { orientacion: lado, juego, clic: U.moverConClic(juego, adivinar) });
      if (U.adaptado()) U.leerPosicion(pos.fen);
      U.pedirJugada("O escribe tu jugada", (txt) => {
        const m = U.jugadaEscrita(new Chess(pos.fen), txt);
        if (!m) { U.noSePudo(txt); return; }
        $("jugada-input").value = "";
        adivinar({ from: m.from, to: m.to, promotion: m.promotion });
      });
    }
    function adivinar(mov) {
      if (ocupado) return;
      const pos = item.posiciones[k];
      const g = new Chess(pos.fen);
      const m = g.move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      ocupado = true;
      let gano = 0, texto;
      if (m.san === pos.jugada) { gano = 3; texto = "✓ ¡La del maestro! " + R.sanEs(pos.jugada) + ". +3"; }
      else if (pos.buenas.indexOf(m.san) >= 0) { gano = 1; texto = "Buena: el motor la da tan buena como la del maestro. Él jugó " + R.sanEs(pos.jugada) + ". +1"; }
      else texto = "El maestro jugó " + R.sanEs(pos.jugada) + ".";
      puntos += gano;
      detalle.push(pos.n + ". " + R.sanEs(m.san) + (gano === 3 ? " ✓" : " → " + R.sanEs(pos.jugada)));
      estado(texto);
      const real = new Chess(pos.fen); const mm = real.move(pos.jugada);
      U.tablero(real.fen(), { orientacion: lado, ultima: [mm.from, mm.to] });
      U.pedirJugada("", null);
      const t = setTimeout(() => {
        ocupado = false;
        k++;
        if (k < item.posiciones.length) mostrar(); else cerrar();
      }, 1600);
      U.alLimpiar(() => clearTimeout(t));
    }
    function cerrar() {
      const max = item.posiciones.length * 3;
      const pct = puntos / max;
      const n = pct >= 0.7 ? 3 : pct >= 0.45 ? 2 : pct >= 0.2 ? 1 : 0;
      cuenta.textContent = "Terminaste: " + puntos + " de " + max + " puntos.";
      $("juego-enunciado").textContent = item.titulo;
      estado("Hiciste " + puntos + " de " + max + " puntos. " + (n ? textoEstrellas(n) : "Sin estrellas: prueba otra vez."));
      explicar(["Tus jugadas: " + detalle.join(" · ") + "."]);
      terminar(item, n);
    }
    mostrar();
  };

  /* ================================================ 13. ¿Qué apertura es? */
  function lineaTexto(jugadas) {
    return jugadas.map((j, i) => (i % 2 === 0 ? (i / 2 + 1) + "." : "") + R.sanEs(j)).join(" ");
  }
  U.JUEGOS.apertura = function (item) {
    if (item.nivel === 3) {
      U.tablero(item.fen, { orientacion: "w", oculto: true });
      $("juego-turno").textContent = "Solo las jugadas, sin tablero.";
      $("controles").appendChild(el("p", "font-semibold text-brand-800 dark:text-white mb-3", lineaTexto(item.jugadas)));
      $("juego-enunciado").textContent = "Estas jugadas vienen en otro orden. ¿A qué apertura se llega?";
    } else {
      U.tablero(item.fen, { orientacion: "w" });
      $("juego-turno").textContent = "Después de " + item.jugadas.length + " jugadas.";
      $("juego-enunciado").textContent = item.nivel === 1 ? "¿Qué apertura es?" : "¿Qué línea es exactamente?";
    }
    opciones(item, item.opciones, (o) => o, (o) => o === item.correcta, (bien, n, sol) => {
      if (item.nivel === 3) U.tablero(item.fen, { orientacion: "w" });
      estado((bien ? "✓ ¡Correcto! " : sol ? "La solución: " : "Respuesta incorrecta. Era: ") + item.correcta + ". " + (n ? textoEstrellas(n) : sol ? "Cuenta como no resuelto." : ""));
      explicar(item.respuesta.concat(["Las jugadas" + (item.orden ? " en su orden de siempre" : "") + ": " + lineaTexto(item.orden || item.jugadas) + "."]));
      terminar(item, n);
    });
  };

  /* ================================================ 14. La ruta segura */
  U.JUEGOS.ruta = function (item) {
    const yo = item.fen.split(" ")[1];
    const pieza = R.tablero(item.fen)[R.idx(item.desde)];
    const camino = [item.desde];
    let hecho = false;
    const actual = () => camino[camino.length - 1];
    const fenActual = () => {
      const t = R.tablero(item.fen);
      t[R.idx(item.desde)] = null;
      t[R.idx(actual())] = pieza;
      return R.colocacion(t) + " " + yo + " - - 0 1";
    };
    const marcas = () => {
      const m = { [item.hasta]: { cls: "m-bien", signo: "⚑", dicho: "destino" } };
      camino.slice(1).forEach((s, i) => { m[s] = { cls: "m-bien", signo: String(i + 1), dicho: "paso " + (i + 1) }; });
      return m;
    };
    const redibujar = () => U.tablero(fenActual(), { orientacion: yo, marcas: marcas(), ultima: [actual()], clic: hecho ? null : paso });
    const cuenta = el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200 mb-2");
    function paso(s) {
      if (hecho) return;
      s = String(s || "").trim().toLowerCase();
      if (!/^[a-h][1-8]$/.test(s)) { estado("Escribe una casilla, por ejemplo e4."); return; }
      if (s === actual()) return;
      const r = M.pasoValido(item.fen, item.desde, actual(), s);
      if (!r.ok) { estado("✗ " + r.motivo); return; }
      camino.push(s);
      cuenta.textContent = "Jugadas: " + (camino.length - 1) + ".";
      if (s === item.hasta) {
        hecho = true;
        const n = M.estrellasRuta(camino.length - 1, item.minimo);
        redibujar();
        U.pedirJugada("", null);
        estado((camino.length - 1 <= item.minimo ? "✓ ¡Llegaste por el camino más corto! " : "Llegaste en " + (camino.length - 1) + "; se podía en " + item.minimo + ". ") + textoEstrellas(n));
        explicar(item.respuesta.concat(["Tu ruta: " + camino.join(" → ") + "."]));
        terminar(item, n);
        return;
      }
      estado("Vas en " + s + ".");
      redibujar();
    }
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + ". El rival no se mueve.";
    $("juego-enunciado").textContent = "Lleva " + (pieza.t === "q" || pieza.t === "r" ? "la " : "el ") + R.NOMBRE[pieza.t] + " de " + item.desde + " a " + item.hasta + " (⚑) en el menor número de jugadas, sin capturar y sin pisar casillas que ataque el rival.";
    cuenta.textContent = "Jugadas: 0.";
    $("controles").appendChild(cuenta);
    $("controles").appendChild(boton("↶ Deshacer el último paso", BTN_SEGUNDO, () => {
      if (hecho || camino.length < 2) return;
      camino.pop();
      cuenta.textContent = "Jugadas: " + (camino.length - 1) + ".";
      estado("Volviste a " + actual() + ".");
      redibujar();
    }));
    redibujar();
    U.pedirJugada("O escribe la casilla a la que va (por ejemplo, e4)", (txt) => { $("jugada-input").value = ""; paso(txt); });
  };
  /* ================================================ 15. Aguanta
     La única defensa: el rival tiene un golpe preparado y solo UNA jugada lo
     frena (el motor lo comprobó al generar). Si falla, se deshace y se le dice
     cómo lo castiga el rival; ver la amenaza o la pieza cuesta una estrella
     cada una; al tercer error se muestra la respuesta. */
  U.JUEGOS.aguanta = function (item) {
    const yo = item.fen.split(" ")[1];
    const juego = new Chess(item.fen);
    let errores = 0, pistas = 0, hecho = false, vioAmenaza = false;
    const marcas = {};
    const redibujar = (ultima) => U.tablero(juego.fen(), { orientacion: yo, juego, ultima, marcas: Object.assign({}, marcas), clic: hecho ? null : U.moverConClic(juego, jugar) });
    function cerrar(n) {
      hecho = true;
      U.pedirJugada("", null);
      bAmenaza.disabled = true; bPista.disabled = true; bVer.disabled = true;
      explicar(item.respuesta);
      terminar(item, n);
    }
    function jugar(mov) {
      if (hecho) return;
      const r = M.aguantaAcertada(Chess, item, mov);
      if (!r.legal) { estado("Esa jugada no es legal para las " + COLOR[yo] + "."); return; }
      if (r.ok) {
        const m = juego.move(mov);
        const n = Math.max(1, 3 - errores - pistas);
        redibujar([m.from, m.to]);
        estado("✓ ¡Aguanta! " + R.sanEs(r.san) + " era la única. " + textoEstrellas(n));
        cerrar(n);
        return;
      }
      errores++;
      const castigo = M.textoRefuta(r.refuta);
      if (errores >= 3) {
        const m = juego.move(item.defensa);
        redibujar([m.from, m.to]);
        estado("✗ Con " + R.sanEs(r.san) + " tampoco. " + castigo + " La única que aguantaba era " + R.sanEs(item.defensa) + ".");
        cerrar(0);
        return;
      }
      estado("✗ " + R.sanEs(r.san) + " pierde. " + castigo + " Busca otra" + (vioAmenaza ? "." : ": ¿viste qué quiere el rival?"));
      redibujar(null);
    }
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + " (el tablero está de tu lado).";
    $("juego-enunciado").textContent = "El rival tiene un golpe preparado. Solo UNA jugada aguanta: encuéntrala.";
    const bAmenaza = boton("👀 ¿Qué quiere el rival?", BTN_SEGUNDO + " mt-1", () => {
      if (hecho || vioAmenaza) return;
      vioAmenaza = true; pistas++;
      bAmenaza.disabled = true;
      const m = new Chess(item.fenRival).move(item.amenaza);
      marcas[m.from] = { cls: "m-mal", signo: "!", dicho: "la pieza con que amenaza el rival" };
      marcas[m.to] = { cls: "m-mal", signo: "✕", dicho: "adonde quiere ir el rival" };
      estado("El rival amenaza " + R.sanEs(item.amenaza) + (item.mateAmenaza ? " (mate en " + item.mateAmenaza + ")" : "") + ". " + (item.motivo || "") + " Una estrella menos.");
      redibujar(null);
    });
    const bPista = boton("💡 Pista", BTN_SEGUNDO + " mt-1 ml-2", () => {
      if (hecho) return;
      pistas++;
      bPista.disabled = true;
      const m = new Chess(item.fen).move(item.defensa);
      marcas[m.from] = { cls: "m-bien", signo: "?", dicho: "pista: esta pieza" };
      estado("Pista: la defensa se juega con " + piezaDicha(yo + m.piece) + " de " + m.from + ". Una estrella menos.");
      redibujar(null);
    });
    const bVer = boton("Ver la respuesta", BTN_SEGUNDO + " mt-1 ml-2", () => {
      if (hecho) return;
      const m = juego.move(item.defensa);
      redibujar([m.from, m.to]);
      estado("La única que aguantaba era " + R.sanEs(item.defensa) + ".");
      cerrar(0);
    });
    $("controles").append(bAmenaza, bPista, bVer);
    redibujar(null);
    U.pedirJugada("O escribe tu jugada (las " + COLOR[yo] + ")", (txt) => {
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { U.noSePudo(txt); return; }
      $("jugada-input").value = "";
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    });
  };
  /* ================================================ 16. Remata la ventaja y 19. Salva las tablas
     Los dos se juegan contra el motor a toda su fuerza (js/practice-engine.js,
     el mismo de Finales contra la máquina), con UNA sola función: cambian las
     reglas (js/tipos-reglas-mas.js) y lo que se dice. Después de cada jugada
     del alumno, el motor mira la posición; si cruzó la raya, terminó. Al
     cumplir las jugadas del nivel, se mira dónde quedó. El reglamento (mate,
     ahogado, repetición, 50 jugadas) lo decide chess.js. Si el motor no
     contesta, no se da por logrado: no se puede saber. */
  const numero = (cp) => (cp >= 10000 ? "mate" : cp <= -10000 ? "mate en contra" : R.numeroBalanza(cp / 100));
  const CONTRA_MOTOR = {
    remata: {
      juicio: (cp) => ({ gana: "bien", duda: "duda", escapa: "mal" })[M.juicioRemata(cp)] || "sin-motor",
      estrellas: (min, pista) => M.estrellasRemata(min, pista),
      alFinal: ["bien"], tablasLogran: false,
      enunciado: (it) => "Vas ganando (" + numero(it.eval) + "). Da mate o sigue en +3 o más después de " + it.jugadas + " jugadas. Si baja de +1,5, se te escapó.",
      mateAFavor: "✓ ¡Jaque mate! Remataste la ventaja.",
      mateEnContra: "✗ Te dieron mate: la ventaja se dio vuelta.",
      tablas: (por) => "✗ Tablas por " + por + ": se te escapó la victoria.",
      mal: (san, cp, it) => "✗ Con " + san + " se te escapó: el motor te da " + numero(cp) + " (empezaste en " + numero(it.eval) + ").",
      bienAlFinal: (n, cp) => "✓ ¡Remataste! Después de " + n + " jugadas sigues en " + numero(cp) + ".",
      malAlFinal: (n, cp) => "✗ Llegaste a " + n + " jugadas, pero la ventaja bajó a " + numero(cp) + ": tiene que quedar en +3 o más.",
      duda: "ojo, la ventaja bajó de +3.",
    },
    tablas: {
      juicio: (cp) => ({ firme: "bien", duda: "duda", perdida: "mal" })[M.juicioTablas(cp)] || "sin-motor",
      estrellas: (min, pista) => M.estrellasTablas(min, pista),
      alFinal: ["bien", "duda"], tablasLogran: true,
      enunciado: (it) => "Vas con menos material, pero se puede aguantar (" + numero(it.eval) + "). Llega a tablas o aguanta " + it.jugadas + " jugadas sin bajar de −2,5.",
      mateAFavor: "✓ ¡Hasta le diste mate! Mucho más que salvar las tablas.",
      mateEnContra: "✗ Te dieron mate.",
      tablas: (por) => "✓ ¡Tablas por " + por + "! Salvaste la partida.",
      mal: (san, cp) => "✗ Con " + san + " la posición se perdió: el motor te da " + numero(cp) + ".",
      bienAlFinal: (n, cp) => "✓ ¡Aguantaste! " + n + " jugadas y la posición sigue en pie (" + numero(cp) + ").",
      malAlFinal: (n, cp) => "✗ Llegaste a " + n + " jugadas, pero ya estás en " + numero(cp) + ".",
      duda: "ojo, estás en la cuerda floja.",
    },
  };
  function contraMotor(item, cfg) {
    const yo = item.fen.split(" ")[1];
    const juego = new Chess(item.fen);
    let propias = 0, minimo = item.eval, pista = false, hecho = false, ocupado = false, vivo = true;
    U.alLimpiar(() => { vivo = false; });
    const cuenta = el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200 mb-2");
    const marcas = {};
    const redibujar = (ultima) => U.tablero(juego.fen(), { orientacion: yo, juego, ultima, marcas: Object.assign({}, marcas), clic: hecho || ocupado ? null : U.moverConClic(juego, jugar) });
    const contar = (cp) => { cuenta.textContent = "Jugada " + propias + " de " + item.jugadas + " · el motor te da " + numero(cp) + "."; };
    function fin(texto, n) {
      hecho = true; ocupado = false;
      U.pedirJugada("", null);
      bPista.disabled = true;
      redibujar(tab.ultima);
      estado(texto + (n ? " " + textoEstrellas(n) : ""));
      explicar(item.respuesta);
      terminar(item, n);
    }
    /* ¿Terminó por reglamento? Lo decide chess.js. */
    function terminoLaPartida() {
      if (juego.in_checkmate()) {
        if (juego.turn() !== yo) fin(cfg.mateAFavor, cfg.estrellas(minimo, pista));
        else fin(cfg.mateEnContra, 0);
        return true;
      }
      if (juego.in_draw() || juego.in_stalemate() || juego.in_threefold_repetition()) {
        const por = juego.in_stalemate() ? "ahogado" : juego.in_threefold_repetition() ? "triple repetición"
          : juego.insufficient_material() ? "material insuficiente" : "la regla de las 50 jugadas";
        fin(cfg.tablas(por), cfg.tablasLogran ? cfg.estrellas(minimo, pista) : 0);
        return true;
      }
      return false;
    }
    async function jugar(mov) {
      if (hecho || ocupado) return;
      const m = juego.move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      propias++;
      delete marcas[Object.keys(marcas)[0]];
      ocupado = true;
      redibujar([m.from, m.to]);
      if (terminoLaPartida()) return;
      estado("Jugaste " + R.sanEs(m.san) + ". La máquina revisa la posición…");
      let score = null;
      try { score = window.PracticeEngine ? await PracticeEngine.evaluate(juego.fen()) : null; } catch (e) { score = null; }
      if (!vivo) return;
      const cp = M.cpDelAlumno(score, juego.turn(), yo);
      const juicio = cfg.juicio(cp);
      if (juicio === "sin-motor") { hecho = true; ocupado = false; U.pedirJugada("", null); estado("No se pudo comprobar la posición con el motor, así que este intento no cuenta. Recarga la página e inténtalo de nuevo."); return; }
      minimo = Math.min(minimo, cp);
      contar(cp);
      if (juicio === "mal") return fin(cfg.mal(R.sanEs(m.san), cp, item), 0);
      if (propias >= item.jugadas) {
        if (cfg.alFinal.indexOf(juicio) >= 0) return fin(cfg.bienAlFinal(propias, cp), cfg.estrellas(minimo, pista));
        return fin(cfg.malAlFinal(propias, cp), 0);
      }
      estado("La máquina piensa…");
      let uci = null;
      try { uci = window.PracticeEngine ? await PracticeEngine.getMove(juego.fen(), "max") : null; } catch (e) { uci = null; }
      if (!vivo) return;
      const r = uci ? juego.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }) : null;
      ocupado = false;
      if (!r) { hecho = true; U.pedirJugada("", null); estado("La máquina no pudo jugar, así que este intento no cuenta. Usa «Otra vez» para empezar de nuevo."); redibujar(null); return; }
      redibujar([r.from, r.to]);
      if (terminoLaPartida()) return;
      estado("La máquina jugó " + R.sanEs(r.san) + ". Te toca" + (juicio === "duda" ? ": " + cfg.duda : "."));
    }
    $("juego-turno").textContent = "Juegas con las " + COLOR[yo] + " contra la máquina a toda su fuerza.";
    $("juego-enunciado").textContent = cfg.enunciado(item);
    contar(item.eval);
    $("controles").appendChild(cuenta);
    const bPista = boton("💡 Pista", BTN_SEGUNDO + " mt-1", async () => {
      if (hecho || ocupado || pista) return;
      pista = true;
      bPista.disabled = true;
      estado("La máquina busca una buena jugada para ti…");
      let uci = null;
      try { uci = window.PracticeEngine ? await PracticeEngine.getMove(juego.fen(), "max") : null; } catch (e) { uci = null; }
      if (!vivo || hecho) return;
      if (!uci) { estado("El motor no respondió: sin pista esta vez."); return; }
      const p = juego.get(uci.slice(0, 2));
      marcas[uci.slice(0, 2)] = { cls: "m-bien", signo: "?", dicho: "pista: esta pieza" };
      estado("Pista: juega con " + piezaDicha(p.color + p.type) + " de " + uci.slice(0, 2) + ". Con pista, una estrella.");
      redibujar(tab.ultima);
    });
    $("controles").appendChild(bPista);
    if (window.PracticeEngine) PracticeEngine.preload();
    else estado("El motor no está disponible en este navegador: sin él no se puede jugar este entrenamiento.");
    redibujar(null);
    U.pedirJugada("O escribe tu jugada (las " + COLOR[yo] + ")", (txt) => {
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { U.noSePudo(txt); return; }
      $("jugada-input").value = "";
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    });
  }
  U.JUEGOS.remata = (item) => contraMotor(item, CONTRA_MOTOR.remata);
  U.JUEGOS.tablas = (item) => contraMotor(item, CONTRA_MOTOR.tablas);

  /* ================================================ 17. Elige a tiempo
     Varias candidatas razonables y un reloj. No hay «la única»: cuenta cuánto
     pierde la elegida contra la mejor (el motor, al generar). Se elige con los
     botones, tocando la jugada en el tablero o escribiéndola. Si se acaba el
     tiempo, cero. En Modo Adaptado, el triple de tiempo. */
  U.JUEGOS.tiempo = function (item) {
    const yo = item.fen.split(" ")[1];
    const juego = new Chess(item.fen);
    const total = M.segundosTiempo(item.segundos, U.adaptado());
    let quedan = total, hecho = false, reloj = null;
    const inicio = Date.now();
    const cuenta = el("p", "text-3xl font-bold text-center text-brand-800 dark:text-white my-2 tabular-nums", "⏱ " + quedan + " s");
    cuenta.setAttribute("aria-hidden", "true");
    const botones = [];
    function cerrar(elegida) {
      if (hecho) return;
      hecho = true;
      clearInterval(reloj);
      U.pedirJugada("", null);
      botones.forEach((b) => { b.disabled = true; });
      const usados = Math.min(total, Math.round((Date.now() - inicio) / 1000));
      const mejor = item.candidatas.find((c) => c.clase === "mejor");
      let n = 0;
      if (!elegida) {
        estado("⌛ Se acabó el tiempo: en una partida, habrías perdido. La mejor era " + R.sanEs(mejor.san) + ".");
      } else {
        n = M.estrellasTiempo(elegida.perdida);
        const m = juego.move(elegida.san);
        U.tablero(juego.fen(), { orientacion: yo, juego, ultima: [m.from, m.to] });
        const que = elegida.clase === "mejor" ? "✓ ¡La mejor! " : n ? "✓ Buena elección: pierde poco (" + R.numeroBalanza(elegida.perdida / 100).replace("+", "") + "). " : "✗ Esa pierde " + R.numeroBalanza(elegida.perdida / 100).replace("+", "") + " contra la mejor, " + R.sanEs(mejor.san) + ". ";
        estado(que + "Elegiste en " + usados + " s. " + (n ? textoEstrellas(n) : ""));
      }
      botones.forEach((b) => {
        const c = b._cand;
        b.textContent = (c.clase === "mejor" ? "✓ " : c.perdida <= M.TIEMPO.buena ? "≈ " : "✗ ") + R.sanEs(c.san) + " — " +
          (c.clase === "mejor" ? "la mejor" : "pierde " + R.numeroBalanza(c.perdida / 100).replace("+", ""));
      });
      explicar(item.respuesta);
      terminar(item, n);
    }
    function elegir(mov) {
      if (hecho) return;
      const m = new Chess(item.fen).move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      const c = item.candidatas.find((x) => x.san === m.san);
      if (!c) { estado(R.sanEs(m.san) + " no es una de las candidatas. Elige entre: " + item.candidatas.map((x) => R.sanEs(x.san)).join(", ") + "."); U.tablero(item.fen, { orientacion: yo, juego, clic: U.moverConClic(juego, elegir) }); return; }
      cerrar(c);
    }
    $("juego-turno").textContent = "Juegan las " + COLOR[yo] + ".";
    $("juego-enunciado").textContent = "Elige una de las candidatas antes de que se acabe el reloj.";
    $("controles").appendChild(cuenta);
    const caja = el("div");
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-label", "Candidatas");
    item.candidatas.forEach((c) => {
      const b = el("button", CLASE_OPCION, R.sanEs(c.san));
      b.type = "button";
      b._cand = c;
      b.addEventListener("click", () => cerrar(c));
      botones.push(b);
      caja.appendChild(b);
    });
    $("controles").appendChild(caja);
    U.tablero(item.fen, { orientacion: yo, juego, clic: U.moverConClic(juego, elegir) });
    U.pedirJugada("O escribe tu jugada (las " + COLOR[yo] + ")", (txt) => {
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { U.noSePudo(txt); return; }
      $("jugada-input").value = "";
      elegir({ from: m.from, to: m.to, promotion: m.promotion });
    });
    estado("Tienes " + total + " segundos" + (total !== item.segundos ? " (el triple, por el Modo Adaptado)" : "") + ". Candidatas: " + item.candidatas.map((c) => R.sanEs(c.san)).join(", ") + ".");
    const mitad = Math.floor(total / 2);
    reloj = setInterval(() => {
      quedan--;
      cuenta.textContent = "⏱ " + quedan + " s";
      if (quedan === mitad && mitad >= 10) estado("Quedan " + quedan + " segundos.");
      if (quedan === 5) estado("Quedan 5 segundos.");
      if (quedan <= 0) cerrar(null);
    }, 1000);
    U.alLimpiar(() => clearInterval(reloj));
  };
  /* ================================================ 18. Tus propios errores
     Los ejercicios salen de las partidas del alumno (js/errores-propios.js).
     Arriba de los niveles, el botón que las revisa; el juego es encontrar una
     jugada buena en la posición donde se equivocó (vale cualquiera que el
     motor dio tan buena como la mejor). */
  const E = window.ErroresPropios;
  let revisarPedidaHecha = false;
  /* Un error de las primeras 10 jugadas es de la apertura. Si una línea del
     banco de Aperturas pasa por esa posición, se dice cuál y se manda a
     estudiarla (?linea=<id>); si no, a Aperturas en general. Ver
     ErroresPropios.lineaDeApertura. Devuelve el párrafo, o null. */
  const enlaceAp = (texto, href) => { const a = el("a", "font-semibold text-accent-700 dark:text-accent-400 underline", texto); a.href = href; return a; };
  function aperturaDe(item) {
    if (!E || !E.enLaApertura(item.fen)) return null;
    const L = window.AperturasLineas ? AperturasLineas.LINEAS : null;
    const r = L ? E.lineaDeApertura(Chess, item, L) : null;
    const p = el("p", "mb-2");
    const ico = el("span", null, "📖 "); ico.setAttribute("aria-hidden", "true");
    p.appendChild(ico);
    const numero = Number(item.fen.split(" ")[5]);
    if (r && r.caso === "celada") {
      p.append("Caíste en una celada conocida: «" + r.linea.nombre + "». " + r.linea.idea + " ");
      p.appendChild(enlaceAp("Estudiarla en Aperturas →", "aperturas.html?linea=" + encodeURIComponent(r.linea.id)));
    } else if (r) {
      p.append("Esta posición es de «" + r.linea.nombre + "», en Aperturas" + (r.buena ? ": ahí se sigue con " + R.sanEs(r.jugada) + "." : ".") + " ");
      p.appendChild(enlaceAp("Repasar esa línea →", "aperturas.html?linea=" + encodeURIComponent(r.linea.id)));
    } else {
      p.append("Fue en la apertura (jugada " + numero + "): saberte bien tus aperturas ayuda a no llegar a esto. ");
      p.appendChild(enlaceAp("Ir a Aperturas →", "aperturas.html"));
    }
    return p;
  }
  /* Los finales del banco de Finales contra la máquina (entreno/data/
     finales.json), para mandar un error del final al del mismo tipo
     (?final=<id>). Se cargan antes de jugar (PREPARAR) y en la ficha. */
  let finalesBanco = null;
  function cargarFinales() {
    if (finalesBanco) return Promise.resolve(finalesBanco);
    return fetch("data/finales.json").then((r) => (r.ok ? r.json() : null)).then((d) => { finalesBanco = (d && d.finales) || []; return finalesBanco; }).catch(() => []);
  }
  U.PREPARAR.errores = () => cargarFinales();
  function finalesLogrados() { try { return JSON.parse(localStorage.getItem("entreno_finales_solved") || "{}") || {}; } catch (e) { return {}; } }
  function hrefDeFinal(grupo) {
    const id = E.finalDelBanco(window.PreparacionPosiciones, finalesBanco || [], grupo, finalesLogrados());
    return id ? "finales.html?final=" + encodeURIComponent(id) : "finales.html";
  }
  /* Un error de un final: cuál y a practicarlo. Devuelve el párrafo, o null. */
  function finalDe(item) {
    const f = E && E.finalDelError(window.PreparacionPosiciones, item.fen);
    if (!f) return null;
    const p = el("p", "mb-2");
    const ico = el("span", null, "♜ "); ico.setAttribute("aria-hidden", "true");
    p.append(ico, "Fue en un final " + f.tipo + ": ahí cada tiempo cuenta, y se aprende practicándolos. ");
    p.appendChild(enlaceAp("Practicar un final " + f.grupo + " →", hrefDeFinal(f.grupo)));
    return p;
  }
  /* Si lo jugó con poco tiempo en el reloj (partidas de Lichess y Chess.com). */
  function relojDe(item) {
    if (!E || !E.apurado(item)) return null;
    const p = el("p", "mb-2");
    const ico = el("span", null, "⏱️ "); ico.setAttribute("aria-hidden", "true");
    p.append(ico, "La jugaste con " + (item.reloj === 1 ? "1 segundo" : item.reloj + " segundos") + " en el reloj. Con poco tiempo se juega lo primero que se ve: guardar tiempo para los momentos difíciles también se practica.");
    return p;
  }

  /* Lichess y Chess.com: el usuario guardado, la carga diferida del
     descargador y del lector de PGN, y cuántas traer viven en
     js/errores-propios.js (también los usa el hub, para avisar las partidas
     sin revisar). */
  const cargarWeb = () => E.cargarWeb();
  const cuentaWeb = () => E.cuentaWeb();
  const MAX_WEB = E ? E.MAX_WEB : 30;
  const SITIO_WEB = E ? E.SITIO_WEB : { lichess: "Lichess", chesscom: "Chess.com" };
  // «hoy mismo», «mañana» o «el 3 de octubre»: la fecha (YYYY-MM-DD) en que un
  // ejercicio vuelve a tocar en «Repasar fallados».
  function cuandoVuelve(vence) {
    const SRS = window.RepasoEspaciado;
    const hoy = SRS ? SRS.hoy() : new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    if (vence <= hoy) return "hoy mismo";
    if (SRS && vence === SRS.sumarDias(hoy, 1)) return "mañana";
    return "el " + new Date(vence + "T12:00:00Z").toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "UTC" });
  }
  U.EXTRA.errores = function (caja) {
    const cuadro = el("div", "rounded-xl p-5 mb-6 bg-white dark:bg-brand-900 shadow-sm");
    const cuantos = E ? E.ejercicios().length : 0;
    const vistas = E ? Object.keys(E.vistas()).length : 0;
    cuadro.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-3",
      vistas ? (vistas === 1 ? "Ya se revisó 1 de tus partidas" : "Ya se revisaron " + vistas + " de tus partidas") +
        (cuantos === 0 ? " y no salió ningún error." : cuantos === 1 ? " y salió 1 ejercicio." : " y salieron " + cuantos + " ejercicios.") +
        " Cada vez que busques, se revisan hasta " + (E ? E.MAX_PARTIDAS : 10) + " partidas nuevas."
        : "Todavía no se revisó ninguna de tus partidas. Se revisan hasta " + (E ? E.MAX_PARTIDAS : 10) + " cada vez, en tu computadora o celular: puede tardar unos minutos."));
    // El tema que más se repite en sus errores, y a practicarlo.
    const T = window.PreparacionTactica;
    const temas = E && T ? E.temasDe(E.ejercicios(), T.TEMAS) : [];
    if (temas.length) {
      const t = temas[0];
      const linea = el("p", "text-sm text-brand-700 dark:text-brand-200 mb-3");
      linea.appendChild(document.createTextNode("Lo que más se repite en tus errores: " + t.plural + " (" + t.n + " de " + cuantos + ")." +
        (temas.length > 1 ? " Después: " + temas.slice(1, 3).map((x) => x.plural + " (" + x.n + ")").join(", ") + "." : "") + " "));
      if (t.practica) {
        const a = el("a", "font-semibold text-accent-700 dark:text-accent-400 underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Practicar " + t.plural + " →");
        a.href = "temas.html?tema=" + encodeURIComponent(t.practica);
        linea.appendChild(a);
      }
      cuadro.appendChild(linea);
    }
    // Cuántos fueron en la apertura, y la línea de Aperturas por la que más pasan.
    const deApertura = E ? E.ejercicios().filter((x) => E.enLaApertura(x.fen)) : [];
    if (deApertura.length) {
      const L = window.AperturasLineas ? AperturasLineas.LINEAS : null;
      const porLinea = {};
      if (L) deApertura.forEach((x) => { const r = E.lineaDeApertura(Chess, x, L); if (r) porLinea[r.linea.id] = (porLinea[r.linea.id] || 0) + 1; });
      const masVeces = Object.keys(porLinea).sort((a, b) => porLinea[b] - porLinea[a] || (a < b ? -1 : 1))[0];
      const linea = el("p", "text-sm text-brand-700 dark:text-brand-200 mb-3");
      linea.appendChild(document.createTextNode((deApertura.length === 1 ? "1 de tus errores fue" : deApertura.length + " de tus errores fueron") +
        " en la apertura (las primeras " + E.JUGADAS_DE_APERTURA + " jugadas). "));
      const esa = masVeces && L.find((x) => x.id === masVeces);
      linea.appendChild(esa ? enlaceAp("Repasar «" + esa.nombre + "» en Aperturas →", "aperturas.html?linea=" + encodeURIComponent(esa.id))
        : enlaceAp("Repasar tus aperturas →", "aperturas.html"));
      cuadro.appendChild(linea);
    }
    // Los del final: cuántos, el tipo que más se repite y a practicarlo.
    const Pos = window.PreparacionPosiciones;
    const deFinal = E && Pos ? E.ejercicios().map((x) => E.finalDelError(Pos, x.fen)).filter(Boolean) : [];
    if (deFinal.length) {
      const cuenta = {};
      deFinal.forEach((f) => { cuenta[f.grupo] = (cuenta[f.grupo] || 0) + 1; });
      const grupo = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || (a < b ? -1 : 1))[0];
      const linea = el("p", "text-sm text-brand-700 dark:text-brand-200 mb-3");
      linea.appendChild(document.createTextNode((deFinal.length === 1 ? "1 de tus errores fue" : deFinal.length + " de tus errores fueron") +
        " en un final" + (deFinal.length > 1 ? " (el que más: " + grupo + ")" : " " + grupo) + ". "));
      const a = enlaceAp("Practicar un final " + grupo + " →", "finales.html");
      linea.appendChild(a);
      cargarFinales().then(() => { a.href = hrefDeFinal(grupo); });
      cuadro.appendChild(linea);
    }
    // Con el reloj encima: solo cuentan los que traen reloj (Lichess y Chess.com).
    const conReloj = E ? E.ejercicios().filter((x) => typeof x.reloj === "number") : [];
    const apurados = conReloj.filter((x) => E.apurado(x)).length;
    if (apurados) {
      const linea = el("p", "text-sm text-brand-700 dark:text-brand-200 mb-3");
      const ico = el("span", null, "⏱️ "); ico.setAttribute("aria-hidden", "true");
      linea.append(ico, (apurados === 1 ? "1" : apurados) + " de tus " + conReloj.length + " errores con reloj " + (apurados === 1 ? "fue" : "fueron") +
        " con poco tiempo (menos de " + E.APURADO.segundos + " segundos, o del " + Math.round(E.APURADO.parte * 100) + " % de tu tiempo). Además de la táctica, ojo con el reloj.");
      cuadro.appendChild(linea);
    }
    // ¿Cometes menos errores? Errores por partida revisada, mes a mes.
    const curvaCaja = E ? E.curvaEnPantalla(E.curva(E.vistas()), "tu") : null;
    if (curvaCaja) cuadro.appendChild(curvaCaja);
    // Los ejercicios guardados antes de contar las celadas: se miran una vez.
    if (E && window.AperturasLineas) E.completarCeladas(AperturasLineas.LINEAS);
    const aviso = el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200 mb-3");
    aviso.setAttribute("role", "status");
    const buscar = el("button", BTN_PRIMARIO, "🔎 Buscar errores en mis partidas");
    buscar.type = "button";
    const parar = el("button", BTN_SEGUNDO + " ml-2 hidden", "Detener");
    parar.type = "button";
    let detener = false;
    parar.addEventListener("click", () => { detener = true; aviso.textContent = "Deteniendo… lo revisado hasta ahora queda guardado."; });
    /* Busca errores: en las partidas nuevas, o en UNA (`solo`, «Revisa esta
       partida» al terminarla en Juegos: llega como ?revisar=juego:<id>). */
    const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
    /* `web`: { sitio, usuario } para traer las partidas de Lichess o Chess.com
       en vez de las de la Academia. */
    async function buscarErrores(solo, web) {
      if (!E || !window.PreparacionMotor || !PreparacionMotor.disponible()) { aviso.textContent = "El motor no está disponible en este navegador: sin él no se pueden revisar las partidas."; return; }
      let uid = null;
      try { const { data } = await sb.auth.getSession(); uid = data && data.session && data.session.user && data.session.user.id; } catch (e) { uid = null; }
      if (!uid) { aviso.textContent = "Necesitas iniciar sesión para revisar tus partidas."; return; }
      buscar.disabled = true; traer.disabled = true; parar.classList.remove("hidden"); detener = false;
      aviso.textContent = solo ? "Buscando tu partida…" : web ? "Trayendo tus últimas partidas de " + SITIO_WEB[web.sitio] + "…" : "Buscando tus partidas terminadas…";
      let primero = null;
      try {
        let externas = null;
        if (web) {
          await cargarWeb();
          const pgn = await PreparacionDescarga.descargar({ sitio: web.sitio, usuario: web.usuario, maximo: MAX_WEB,
            alAvanzar: (n) => { aviso.textContent = "Trayendo tus partidas de " + SITIO_WEB[web.sitio] + "… van " + n + "."; } });
          externas = E.deLaWeb(PreparacionAnalisis.leerPgn(pgn), web.sitio, web.usuario);
          if (!externas.length) throw Object.assign(new Error("sin partidas"), { paraMostrar: true,
            message: "No encontré partidas de ajedrez normal de «" + web.usuario + "» en " + SITIO_WEB[web.sitio] + "." });
        }
        const r = await E.analizar(sb, uid, {
          motor: PreparacionMotor, solo, externas,
          parar: () => detener,
          alAvanzar: (texto) => { aviso.textContent = "Revisando… " + texto; },
        });
        U.cargarPropios();
        if (solo) {
          const lista = r.yaRevisada ? r.deEsa : r.nuevos;
          primero = lista && lista[0];
          aviso.textContent = r.noEncontrada ? "No encontré esa partida entre tus partidas terminadas de ajedrez normal."
            : r.muyCorta ? "Esa partida es muy corta para revisarla (menos de 10 jugadas)."
            : (r.yaRevisada ? "Esa partida ya estaba revisada: " : "Revisé tu partida: ") +
              (lista.length ? plural(lista.length, "error", "errores") + " para practicar." : "no encontré ningún error grande. ¡Bien jugada!");
        } else if (web) {
          aviso.textContent = r.pendientesAntes === 0
            ? (externas.length === 1 ? "Tu última partida de " + SITIO_WEB[web.sitio] + " ya estaba revisada." : "Tus últimas " + externas.length + " partidas de " + SITIO_WEB[web.sitio] + " ya estaban revisadas.") + " Juega más y vuelve."
            : "Listo: " + (r.partidas === 1 ? "se revisó 1 partida" : "se revisaron " + r.partidas + " partidas") + " de " + SITIO_WEB[web.sitio] + " y " +
              (r.nuevos.length === 0 ? "no salió ningún error nuevo." : r.nuevos.length === 1 ? "salió 1 ejercicio nuevo." : "salieron " + r.nuevos.length + " ejercicios nuevos.");
        } else {
          aviso.textContent = r.pendientesAntes === 0
            ? "No hay partidas nuevas para revisar. Juega en Juegos o en la práctica de la clase y vuelve."
            : "Listo: se revisaron " + plural(r.partidas, "partida", "partidas") + " y " +
              (r.nuevos.length === 0 ? "no salió ningún error nuevo." : r.nuevos.length === 1 ? "salió 1 ejercicio nuevo." : "salieron " + r.nuevos.length + " ejercicios nuevos.");
        }
      } catch (e) {
        // Lo que dicen Lichess o Chess.com (usuario que no existe, «espera un
        // minuto») se dice en palabras; no es un error de la página.
        if (e && e.paraMostrar) aviso.textContent = e.message;
        else { console.error(e); aviso.textContent = "No se pudieron revisar las partidas. Intenta de nuevo en un momento."; }
      }
      buscar.disabled = false; traer.disabled = false; parar.classList.add("hidden");
      const texto = aviso.textContent;
      U.repintarTipo("errores");
      const nuevo = $("tipo-extra").querySelector('[role="status"]');
      if (nuevo) {
        nuevo.textContent = texto;
        if (primero) {
          const ir = el("a", "block mt-2 font-semibold text-accent-700 dark:text-accent-400 underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Ir al primero →");
          ir.href = "#errores/" + primero.nivel + "/" + encodeURIComponent(primero.id);
          nuevo.appendChild(ir);
        }
      }
    }
    buscar.addEventListener("click", () => buscarErrores(null));
    /* ¿Juegas en Lichess o Chess.com? Sus últimas partidas públicas, por el
       nombre de usuario. Plegado: la mayoría arranca por las de la Academia. */
    const web = el("details", "mt-4 border-t border-brand-100 dark:border-brand-800 pt-3");
    const cab = el("summary", "cursor-pointer text-sm font-semibold text-brand-700 dark:text-brand-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "¿Juegas en Lichess o Chess.com? Trae tus partidas de ahí");
    web.appendChild(cab);
    const formWeb = el("form", "mt-3 flex flex-wrap items-end gap-3");
    const guardada = cuentaWeb();
    const campo = (texto, control) => { const l = el("label", "text-sm text-brand-700 dark:text-brand-200 flex flex-col gap-1"); l.append(texto, control); return l; };
    const sitio = el("select", "border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100");
    Object.keys(SITIO_WEB).forEach((k) => { const o = el("option", null, SITIO_WEB[k]); o.value = k; sitio.appendChild(o); });
    sitio.value = guardada.sitio;
    const usuario = el("input", "border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100");
    usuario.type = "text"; usuario.autocomplete = "off"; usuario.spellcheck = false; usuario.maxLength = 30;
    usuario.value = guardada.usuario;
    const traer = el("button", BTN_PRIMARIO, "Traer y revisar");
    traer.type = "submit";
    formWeb.append(campo("Sitio", sitio), campo("Tu usuario", usuario), traer);
    web.appendChild(formWeb);
    const nota = el("p", "text-xs text-brand-500 dark:text-brand-300 mt-2",
      "Se traen tus últimas " + MAX_WEB + " partidas públicas y se revisan hasta " + (E ? E.MAX_PARTIDAS : 10) + " nuevas cada vez, en tu computadora o celular. " +
      "A Lichess o Chess.com solo se les manda tu nombre de usuario. ");
    const priv = el("a", "underline", "Política de privacidad");
    priv.href = "../privacidad.html";
    nota.appendChild(priv);
    web.appendChild(nota);
    formWeb.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const u = usuario.value.trim().replace(/^@/, "");
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(u)) { aviso.textContent = "Escribe tu usuario tal como sale en tu perfil: letras, números, guion o guion bajo."; usuario.focus(); return; }
      E.guardarCuentaWeb(sitio.value, u);
      buscarErrores(null, { sitio: sitio.value, usuario: u });
    });
    // ?revisar=juego:<id>: se revisa esa partida sola, una vez, y se saca de la
    // dirección (volver atrás o recargar no la vuelve a pedir).
    // ?traer=web (el aviso del hub «partidas sin revisar»): se traen solas las
    // de Lichess o Chess.com, con el usuario guardado, una vez.
    const traerPedido = new URLSearchParams(location.search).get("traer");
    if (traerPedido === "web" && !revisarPedidaHecha && E && E.cuentaWeb().usuario) {
      revisarPedidaHecha = true;
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
      setTimeout(() => buscarErrores(null, E.cuentaWeb()), 0);
    }
    const pedida = new URLSearchParams(location.search).get("revisar");
    if (pedida && !revisarPedidaHecha) {
      revisarPedidaHecha = true;
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
      setTimeout(() => buscarErrores(pedida), 0);
    }
    cuadro.append(aviso, buscar, parar, web);
    caja.appendChild(cuadro);
  };
  U.JUEGOS.errores = function (item) {
    const yo = item.fen.split(" ")[1];
    const juego = new Chess(item.fen);
    let errores = 0, pistas = 0, hecho = false;
    const marcas = {};
    const redibujar = (ultima) => U.tablero(juego.fen(), { orientacion: yo, juego, ultima, marcas: Object.assign({}, marcas), clic: hecho ? null : U.moverConClic(juego, jugar) });
    const numero = (cp) => R.numeroBalanza(cp / 100);
    const cuenta = "En tu partida jugaste " + R.sanEs(item.jugada) + " y la evaluación pasó de " + numero(item.antes) + " a " + numero(item.despues) + ".";
    function cerrar(n) {
      hecho = true;
      U.pedirJugada("", null);
      bPista.disabled = true; bVer.disabled = true;
      const partes = [cuenta, "Las buenas: " + item.buenas.map(R.sanEs).join(", ") + " (el motor da la mejor en " + numero(item.antes) + ")."];
      const T = window.PreparacionTactica;
      const tema = item.tema && T && T.TEMAS[item.tema];
      if (tema) {
        const p = el("p", "mb-2");
        p.appendChild(document.createTextNode((item.nivel === 2 ? "Lo que no viste: " : "Lo que te hicieron: ") + tema.nombre + ". "));
        if (tema.practica) {
          const a = el("a", "font-semibold text-accent-700 dark:text-accent-400 underline", "Practicar " + tema.plural + " →");
          a.href = "temas.html?tema=" + encodeURIComponent(tema.practica);
          p.appendChild(a);
        }
        partes.push(p);
      }
      const ap = aperturaDe(item);
      if (ap) partes.push(ap);
      const fi = finalDe(item);
      if (fi) partes.push(fi);
      const rl = relojDe(item);
      if (rl) partes.push(rl);
      // Todo error de una partida entra a «Repasar fallados», también el que
      // sale limpio: vuelve mañana y en unos días (RepasoFallados.anotar,
      // `entraLimpio`). Se dice cuándo, para que no parezca que desapareció.
      const ficha = terminar(item, n);
      if (ficha && ficha.vence) partes.push("🔁 Vuelve a salir en «Repasar fallados» " + cuandoVuelve(ficha.vence) + ", hasta que lo resuelvas limpio tres veces seguidas.");
      explicar(partes);
    }
    function jugar(mov) {
      if (hecho) return;
      const r = E.acierta(Chess, item, mov);
      if (!r.legal) { estado("Esa jugada no es legal para las " + COLOR[yo] + "."); return; }
      if (r.ok) {
        const m = juego.move(mov);
        const n = Math.max(1, 3 - errores - pistas);
        redibujar([m.from, m.to]);
        estado("✓ ¡Esa es buena! " + R.sanEs(r.san) + ". " + textoEstrellas(n));
        return cerrar(n);
      }
      errores++;
      if (errores >= 3) {
        const m = juego.move(item.mejor);
        redibujar([m ? m.from : null, m ? m.to : null]);
        estado("✗ " + R.sanEs(r.san) + " tampoco. La mejor era " + R.sanEs(item.mejor) + ".");
        return cerrar(0);
      }
      estado(r.esLaDeLaPartida
        ? "Respuesta incorrecta: " + R.sanEs(r.san) + " es la que jugaste en la partida, y fue el error. Busca otra."
        : U.incorrecta(R.sanEs(r.san), "No es de las buenas. Busca otra."));
      redibujar(null);
    }
    $("juego-turno").textContent = "Juegas con las " + COLOR[yo] + ". " + (item.resumen || "");
    $("juego-enunciado").textContent = item.nivel === 2 ? "Ibas ganando y aquí se te escapó. ¿Qué debiste jugar?" : "Aquí estabas bien y te equivocaste. ¿Qué debiste jugar?";
    const bPista = boton("💡 Pista", BTN_SEGUNDO + " mt-1", () => {
      if (hecho || pistas) return;
      pistas++;
      bPista.disabled = true;
      const m = new Chess(item.fen).move(item.mejor);
      if (m) marcas[m.from] = { cls: "m-bien", signo: "?", dicho: "pista: esta pieza" };
      estado("Pista: " + (m ? "juega con " + piezaDicha(yo + m.piece) + " de " + m.from : "piensa en la mejor jugada") + ". Una estrella menos.");
      redibujar(null);
    });
    const bVer = boton("Ver la respuesta", BTN_SEGUNDO + " mt-1 ml-2", () => {
      if (hecho) return;
      const m = juego.move(item.mejor);
      if (m) redibujar([m.from, m.to]);
      estado("La mejor era " + R.sanEs(item.mejor) + ".");
      cerrar(0);
    });
    $("controles").append(bPista, bVer);
    redibujar(null);
    U.pedirJugada("O escribe tu jugada (las " + COLOR[yo] + ")", (txt) => {
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { U.noSePudo(txt); return; }
      $("jugada-input").value = "";
      jugar({ from: m.from, to: m.to, promotion: m.promotion });
    });
  };
})();
