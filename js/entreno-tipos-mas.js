/* Los Tipos de entrenamiento 8 a 14 de entreno/tipos.html: el Barrido,
 * Intercambios, Constrúyela tú, Rey y peón, Adivina la jugada del maestro,
 * ¿Qué apertura es? y la Ruta segura.
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
     segunda, una; después se dice cuál era. */
  function opciones(item, lista, etiqueta, esBuena, alTerminar) {
    let intentos = 0, hecho = false;
    const caja = el("div");
    caja.setAttribute("role", "group");
    caja.setAttribute("aria-label", "Opciones");
    lista.forEach((op) => {
      const b = el("button", CLASE_OPCION, etiqueta(op));
      b.type = "button";
      b.addEventListener("click", () => {
        if (hecho) return;
        intentos++;
        if (esBuena(op)) {
          hecho = true;
          const n = intentos === 1 ? 3 : intentos === 2 ? 1 : 0;
          b.textContent = "✓ " + etiqueta(op);
          caja.querySelectorAll("button").forEach((x) => { x.disabled = true; });
          alTerminar(true, n);
        } else {
          b.disabled = true;
          b.textContent = "✗ " + etiqueta(op);
          if (intentos >= 2) {
            hecho = true;
            caja.querySelectorAll("button").forEach((x) => { x.disabled = true; });
            alTerminar(false, 0);
          } else estado("✗ No. Te queda un intento.");
        }
      });
      caja.appendChild(b);
    });
    $("controles").appendChild(caja);
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
    let quedan = item.nivel === 4 ? 90 : 0;
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
      if (!m) { estado("No entendí «" + txt + "» como una jugada de las " + COLOR[yo] + "."); return; }
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
    opciones(item, item.opciones, etiqueta, (op) => (item.nivel <= 2 ? op === signo(item.valor) : +op === item.valor), (bien, n) => {
      const r = M.textoIntercambio(item.valor, yo);
      estado((bien ? "✓ ¡Correcto! " : "Era: ") + r.charAt(0).toUpperCase() + r.slice(1) + ". " + (n ? textoEstrellas(n) : ""));
      explicar(item.respuesta);
      terminar(item, n);
    });
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
      opciones(item, [true, false], (v) => (v ? "Ganan las blancas: el peón corona" : "Tablas: el rey negro lo para"), (v) => v === item.gana, (bien, n) => {
        estado((bien ? "✓ ¡Correcto! " : "No: ") + (item.gana ? "ganan las blancas." : "son tablas.") + " " + (n ? textoEstrellas(n) : ""));
        explicar(item.respuesta.concat(["Calculado con la tabla completa de rey y peón contra rey: no hay opinión, es el resultado con la mejor jugada de los dos."]));
        terminar(item, n);
      });
      return;
    }
    const juego = new Chess(item.fen);
    let errores = 0, hecho = false, ocupado = false, jugadas = 0;
    const redibujar = (ultima) => U.tablero(juego.fen(), { orientacion: "w", juego, ultima, clic: hecho || ocupado ? null : U.moverConClic(juego, jugar) });
    function fin(texto, n) { hecho = true; U.pedirJugada("", null); redibujar(tab.ultima); estado(texto + (n ? " " + textoEstrellas(n) : "")); if (n) terminar(item, n); }
    function jugar(mov) {
      if (hecho || ocupado) return;
      const m = juego.move(mov);
      if (!m) { estado("Esa jugada no es legal."); return; }
      jugadas++;
      if (m.promotion) {
        const comen = juego.moves({ verbose: true }).some((x) => x.to === m.to);
        if (juego.in_stalemate()) return fin("✗ Coronaste, pero el rey negro quedó ahogado: tablas. Prueba otra vez.", 0);
        if (comen) return fin("✗ Coronaste, pero el rey negro se come la pieza nueva: tablas. Prueba otra vez.", 0);
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
      if (item.nivel === 3) return fin("✓ ¡Esa es la única que gana! " + R.sanEs(m.san) + ".", Math.max(1, 3 - errores));
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
    U.pedirJugada("O escribe tu jugada", (txt) => {
      const m = U.jugadaEscrita(juego, txt);
      if (!m) { estado("No entendí «" + txt + "» como una jugada de las blancas."); return; }
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
        if (!m) { estado("No entendí «" + txt + "» como una jugada de las " + COLOR[lado] + "."); return; }
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
    opciones(item, item.opciones, (o) => o, (o) => o === item.correcta, (bien, n) => {
      if (item.nivel === 3) U.tablero(item.fen, { orientacion: "w" });
      estado((bien ? "✓ ¡Correcto! " : "Era: ") + item.correcta + ". " + (n ? textoEstrellas(n) : ""));
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
})();
