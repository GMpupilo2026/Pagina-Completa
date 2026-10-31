/* Las partidas en vivo de Lichess dentro de la página del Centroamericano 2026
 * (centroamericano-2026.html): la ventana «Partidas en vivo» (#partidas) con
 * todas las mesas que se transmiten, sus filtros y el visor de una partida
 * —jugada por jugada, para adelante y para atrás, con la barra de la
 * evaluación—, y el botón «Ver su partida en vivo» en la tarjeta del jugador
 * que alguien busca o sigue. Ver «Las partidas en vivo, dentro de la página»
 * en docs/decisiones/juegos-y-torneos.md.
 *
 * Qué se transmite lo dice la sala (salas_torneo, la que edita quien
 * administra en admin.html#torneos): un botón con la dirección de la
 * transmisión en Lichess (lichess.org/broadcast/…), de cualquier categoría o
 * de cualquier ronda. Con eso se llega al grupo entero (un torneo de Lichess
 * por categoría). Mientras no haya ninguno, la ficha sigue en «Pronto» y nada
 * de esto le pide nada a Lichess.
 *
 * Los datos los lee js/lichess-transmision.js, desde el navegador. Lo que
 * Lichess no trae (la evaluación de la última jugada, mientras se juega) lo
 * calcula Stockfish en este aparato, solo si se pide.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  const L = window.LichessTransmision;
  const F = window.TableroFen;
  if (!V || !L || !F) return;
  const $ = (id) => document.getElementById(id);
  const el = V.el;
  // Las jugadas se escriben en algebraica española («Cf3»), y quien no ve las
  // oye en el formato para ciegos: la regla de todo el sitio, de
  // js/comandos-tablero.js. En inglés, como las trae Lichess.
  const CT = window.ComandosTablero;
  const sanVer = (san) => (V.idioma() === "en" || !CT ? san : CT.sanEspanol(san));
  const sanOir = (san) => (V.idioma() === "en" || !CT ? san : CT.jugadaParaMostrar(san));

  const EVENTO_MS = 5 * 60000;   // la sala y los torneos de Lichess: cada cinco minutos
  const RONDAS_MS = 60000;       // las rondas de cada torneo (para enterarse de la nueva)
  const LISTA_MS = 20000;        // las partidas de la ronda, con la ventana abierta
  const VISOR_MS = 10000;        // las jugadas de la partida que se está viendo
  const TARJETAS_MS = 60000;     // para el botón de las tarjetas

  const TEXTOS = {
    es: {
      titulo: "Partidas en vivo",
      cargando: "Buscando las partidas en Lichess…",
      error: "No pudimos leer Lichess ahora mismo. Vuelve a intentarlo en un rato.",
      sinTransmision: "La transmisión todavía no está publicada: en cuanto la organización la publique, las partidas aparecen aquí.",
      sinModalidad: (m) => "No se transmite ninguna partida de " + m + ".",
      resumen: (r, n, vivo) => (r ? "Ronda " + r + " · " : "") + n + (n === 1 ? " partida transmitida" : " partidas transmitidas") + (vivo ? " · " + vivo + " en juego" : ""),
      leido: (h) => "Leído en Lichess a las " + String(h).replace(/\.$/, "") + ".",
      categoria: "Categoría", todas: "Todas", pais: "País", todos: "Todos", ronda: "Ronda", rondaAhora: (n) => "La de ahora (" + n + ")",
      buscar: "Buscar un jugador", soloVivo: "Solo las que se están jugando", soloMios: "Solo mis jugadores",
      ninguna: "Ninguna partida con esos filtros.",
      mesa: (m) => "Mesa " + m,
      enJuego: "En juego", porEmpezar: "Por empezar",
      ver: (b, n) => "Ver la partida " + b + " contra " + n,
      volver: "← Todas las partidas",
      verSuPartida: "Ver su partida en vivo", verSuPartidaFin: "Ver su partida",
      primera: "Al inicio", anterior: "Jugada anterior", siguiente: "Jugada siguiente", ultima: "A la última jugada",
      girar: "Girar el tablero", copiar: "Copiar las jugadas (PGN)", copiado: "Listo: las jugadas se copiaron.",
      inicio: "Posición inicial",
      jugada: (n, color, san) => "Jugada " + n + ", " + (color === "w" ? "blancas" : "negras") + ": " + san + ".",
      nuevas: (n) => "Ir a la jugada de ahora (" + n + (n === 1 ? " nueva" : " nuevas") + ")",
      siguiendo: "Siguiendo la partida en vivo.",
      evalNo: "Lichess no trae la evaluación de esta jugada.",
      evalCalcular: "Calcular con Stockfish en este aparato",
      evalCalculando: "Stockfish está evaluando…",
      evalNoPudo: "Stockfish no pudo evaluar esta posición.",
      evalMotor: "Stockfish en este aparato",
      evalLichess: "Evaluación de Lichess",
      igualado: "igualado", mejorBlancas: "mejor las blancas", mejorNegras: "mejor las negras",
      mate: (n, b) => "mate en " + n + " para las " + (b ? "blancas" : "negras"),
      grafico: "Cómo fue la evaluación en toda la partida: toca un punto para ir a esa jugada.",
      relojes: "Relojes",
      partida: (cat, r, m) => [cat, r ? "Ronda " + r : "", m ? "Mesa " + m : ""].filter(Boolean).join(" · "),
      terminada: (r) => "Terminó: " + r + ".",
      sinJugadas: "Todavía no hay jugadas.",
      blancas: "Blancas", negras: "Negras",
      porDefinir: "Por definir",
      enVivoTitulo: "En vivo ahora", enVivoVer: (n) => "Ver las " + n + " →",
      barra: (e) => e == null ? "sin evaluación" : (Math.abs(e) < 0.3 ? "igualado" : e > 0 ? "mejor las blancas" : "mejor las negras"),
    },
    en: {
      titulo: "Live games",
      cargando: "Looking for the games on Lichess…",
      error: "We couldn't read Lichess right now. Please try again in a while.",
      sinTransmision: "The broadcast is not published yet: as soon as the organizers publish it, the games will show up here.",
      sinModalidad: (m) => "No " + m + " games are being broadcast.",
      resumen: (r, n, vivo) => (r ? "Round " + r + " · " : "") + n + (n === 1 ? " game broadcast" : " games broadcast") + (vivo ? " · " + vivo + " in play" : ""),
      leido: (h) => "Read from Lichess at " + h + ".",
      categoria: "Section", todas: "All", pais: "Country", todos: "All", ronda: "Round", rondaAhora: (n) => "Current (" + n + ")",
      buscar: "Search for a player", soloVivo: "Only games in play", soloMios: "Only my players",
      ninguna: "No games with those filters.",
      mesa: (m) => "Board " + m,
      enJuego: "In play", porEmpezar: "Not started",
      ver: (b, n) => "Watch " + b + " against " + n,
      volver: "← All games",
      verSuPartida: "Watch their game live", verSuPartidaFin: "Watch their game",
      primera: "To the start", anterior: "Previous move", siguiente: "Next move", ultima: "To the last move",
      girar: "Flip the board", copiar: "Copy the moves (PGN)", copiado: "Done: the moves were copied.",
      inicio: "Starting position",
      jugada: (n, color, san) => "Move " + n + ", " + (color === "w" ? "white" : "black") + ": " + san + ".",
      nuevas: (n) => "Go to the current move (" + n + " new)",
      siguiendo: "Following the game live.",
      evalNo: "Lichess has no evaluation for this move.",
      evalCalcular: "Calculate with Stockfish on this device",
      evalCalculando: "Stockfish is thinking…",
      evalNoPudo: "Stockfish couldn't evaluate this position.",
      evalMotor: "Stockfish on this device",
      evalLichess: "Lichess evaluation",
      igualado: "equal", mejorBlancas: "white is better", mejorNegras: "black is better",
      mate: (n, b) => "mate in " + n + " for " + (b ? "white" : "black"),
      grafico: "How the evaluation went during the whole game: tap a point to go to that move.",
      relojes: "Clocks",
      partida: (cat, r, m) => [cat, r ? "Round " + r : "", m ? "Board " + m : ""].filter(Boolean).join(" · "),
      terminada: (r) => "Finished: " + r + ".",
      sinJugadas: "No moves yet.",
      blancas: "White", negras: "Black",
      porDefinir: "To be decided",
      enVivoTitulo: "Live now", enVivoVer: (n) => "See all " + n + " →",
      barra: (e) => e == null ? "no evaluation" : (Math.abs(e) < 0.3 ? "equal" : e > 0 ? "white is better" : "black is better"),
    },
  };
  const T = () => TEXTOS[V.idioma()] || TEXTOS.es;

  // La categoría y la modalidad que dice el nombre de un torneo de Lichess
  // («Open U15», «Girls U15», «Blitz Sub-10 Absoluto»). La MISMA regla que
  // codigoCategoria() y modalidadDe() de supabase/functions/sala-jugadores/
  // torneos-sala.ts, que el navegador no puede cargar:
  // verificar-centroamericano-partidas.js comprueba que digan lo mismo.
  function codigoCategoria(texto) {
    const t = String(texto || "");
    const m = t.match(/(?:^|[^A-Za-z0-9])(?:U|Sub)[\s-]*0?(\d{1,2})(F?)(?![A-Za-z0-9])/i);
    if (!m) return "";
    const fem = !!m[2] || /(?:^|[^A-Za-z])(?:fem\w*|girls?|ni[ñn]as|mujeres|women)(?![A-Za-z])/i.test(t);
    return "U" + m[1].padStart(2, "0") + (fem ? "F" : "");
  }
  function modalidadDe(texto) {
    const t = String(texto || "");
    if (/(?:^|[^A-Za-z])blitz(?![A-Za-z])/i.test(t)) return "blitz";
    if (/(?:^|[^A-Za-zÀ-ÿ])r[aá]pid[oa]?s?(?![A-Za-z])/i.test(t)) return "rapidas";
    return "clasico";
  }

  /* ---------------- los datos ---------------- */
  // evento: { torneos: [{ id, nombre, categoria, modalidad, rondas, leidoRondas,
  //           partidasPorRonda: { idRonda: { lista, leido } }, pgnPorRonda: {…} }] }
  let evento = null, leidoEvento = 0, pidiendoEvento = null, errorEvento = false;

  async function enlacesDeLaSala() {
    if (!window.sb || !window.sb.from) return [];
    const { data, error } = await window.sb.from("salas_torneo").select("enlaces").eq("clave", V.sala()).maybeSingle();
    if (error) throw error;
    const enlaces = data && Array.isArray(data.enlaces) ? data.enlaces : [];
    return enlaces.map((e) => ({ texto: String((e && e.texto) || ""), lichess: L.idDeEnlace(e && e.url) })).filter((e) => e.lichess);
  }

  function cargarEvento(forzar) {
    if (pidiendoEvento) return pidiendoEvento;
    if (evento && !forzar && Date.now() - leidoEvento < EVENTO_MS) return Promise.resolve(evento);
    pidiendoEvento = (async () => {
      try {
        const enlaces = await enlacesDeLaSala();
        const vistos = new Map();
        for (const e of enlaces) {
          const ev = await L.torneosDelEvento(e.lichess);
          // Un torneo suelto (sin grupo) toma la categoría del texto del botón
          // si su nombre no la dice.
          ev.torneos.forEach((t) => {
            if (vistos.has(t.id)) return;
            const viejo = evento && evento.torneos.find((x) => x.id === t.id);
            vistos.set(t.id, Object.assign(viejo || { partidasPorRonda: {}, pgnPorRonda: {} }, {
              id: t.id, nombre: t.nombre,
              categoria: codigoCategoria(t.nombre) || (ev.torneos.length === 1 ? codigoCategoria(e.texto) : ""),
              modalidad: modalidadDe(t.nombre + " " + (ev.torneos.length === 1 ? e.texto : "")),
            }));
          });
        }
        evento = { torneos: [...vistos.values()].sort((a, b) => ordenCat(a.categoria) - ordenCat(b.categoria)) };
        leidoEvento = Date.now();
        errorEvento = false;
        encenderFicha();
      } catch (e) {
        errorEvento = true;
        if (!evento) throw e;
      } finally {
        pidiendoEvento = null;
      }
      return evento;
    })();
    return pidiendoEvento;
  }
  const ordenCat = (g) => (V.ordenGrupo ? V.ordenGrupo(g) : 0);

  // Los torneos de la modalidad que se está viendo (el selector de la página).
  const torneosVisibles = () => (evento ? evento.torneos.filter((t) => t.modalidad === V.modalidad()) : []);

  async function cargarRondas(t) {
    if (t.rondas && Date.now() - t.leidoRondas < RONDAS_MS) return t.rondas;
    try { t.rondas = await L.rondas(t.id); t.leidoRondas = Date.now(); }
    catch (e) { if (!t.rondas) throw e; }
    return t.rondas;
  }

  // La ronda de un torneo: la que se eligió (por número) o la de ahora.
  function rondaDe(t, numero) {
    if (!t.rondas) return null;
    if (numero) return t.rondas.rondas.find((r) => r.numero === numero) || null;
    return L.rondaDeAhora(t.rondas);
  }

  async function cargarPartidas(t, ronda, vida) {
    const ya = t.partidasPorRonda[ronda.id];
    if (ya && Date.now() - ya.leido < vida) return ya.lista;
    try {
      const lista = await L.partidas(ronda.id);
      t.partidasPorRonda[ronda.id] = { lista, leido: Date.now() };
      return lista;
    } catch (e) {
      if (ya) return ya.lista;
      throw e;
    }
  }

  async function cargarPgn(t, ronda, vida) {
    const ya = t.pgnPorRonda[ronda.id];
    if (ya && Date.now() - ya.leido < vida) return ya.porId;
    try {
      const juegos = L.leerPgn(await L.pgn(ronda.id), window.Chess);
      const porId = {};
      juegos.forEach((g) => { if (g.id) porId[g.id] = g; });
      t.pgnPorRonda[ronda.id] = { porId, leido: Date.now() };
      return porId;
    } catch (e) {
      if (ya) return ya.porId;
      throw e;
    }
  }

  // Todas las partidas de la ronda elegida, en todos los torneos visibles,
  // cada una con su torneo y su ronda.
  async function partidasDeTodo(numero, vida) {
    const torneos = torneosVisibles();
    const out = [];
    await Promise.all(torneos.map(async (t) => {
      try {
        await cargarRondas(t);
        const r = rondaDe(t, numero);
        if (!r) return;
        const lista = await cargarPartidas(t, r, vida);
        lista.forEach((p) => out.push({ p, t, r }));
      } catch (e) { /* ese torneo no contestó: los demás sí se muestran */ }
    }));
    return out.sort((a, b) => ordenCat(a.t.categoria) - ordenCat(b.t.categoria) || a.p.mesa - b.p.mesa);
  }

  /* ---------------- el botón de la tarjeta ---------------- */
  // Las partidas de la ronda de ahora, para saber si un jugador que alguien
  // busca o sigue está en un tablero transmitido. Se buscan por su nombre
  // (chess-results y Lichess escriben «Apellidos, Nombre» igual, los dos de
  // FIDE) y en su categoría.
  let indice = null, leidoIndice = 0, armandoIndice = null;
  function armarIndice() {
    if (armandoIndice) return armandoIndice;
    if (indice && Date.now() - leidoIndice < TARJETAS_MS) return Promise.resolve(indice);
    armandoIndice = (async () => {
      try {
        await cargarEvento();
        if (!evento || !evento.torneos.length) { indice = []; return indice; }
        indice = await partidasDeTodo(0, TARJETAS_MS);
        leidoIndice = Date.now();
        return indice;
      } catch (e) { return indice || []; }
      finally { armandoIndice = null; }
    })();
    return armandoIndice;
  }

  const plano = V.plano;
  // «Apellido1 Apellido2, Nombre1 Nombre2» → los apellidos y el primer nombre:
  // así «Mora, Ana» y «Mora, Ana Lucía» son la misma persona en su categoría.
  const corto = (n) => { const [a, b] = String(n || "").split(","); return plano(a) + "|" + plano(b).split(" ")[0]; };
  function partidaDe(j) {
    if (!indice || !j) return null;
    const mismo = (x) => x.nombre && (plano(x.nombre) === plano(j.nombre) || corto(x.nombre) === corto(j.nombre));
    const enCat = indice.filter((x) => !x.t.categoria || !j.grupo || x.t.categoria === j.grupo);
    return enCat.find((x) => mismo(x.p.blancas) || mismo(x.p.negras)) || null;
  }

  function botonDe(x) {
    const hallada = partidaDe(x && x.j);
    if (!hallada) return null;
    const tx = T();
    const b = el("button", "cac-jugador-boton cac-jugador-vivo", (hallada.p.resultado ? "♟ " + tx.verSuPartidaFin : "📺 " + tx.verSuPartida));
    b.type = "button";
    b.dataset.accion = "partida-en-vivo";
    b.addEventListener("click", () => abrirPartida(hallada, b));
    return b;
  }

  // Cuando llegan los datos de chess-results (alguien buscó, sigue a alguien
  // o eligió su país) se arma el índice y, si encontró a alguien, se vuelven
  // a pintar las tarjetas con su botón.
  let firmaIndice = "";
  function alLlegarDatos() {
    armarIndice().then((ix) => {
      const firma = (ix || []).map((x) => x.p.id + x.p.resultado).join(",");
      if (firma === firmaIndice) return;
      firmaIndice = firma;
      V.repintar();
    }, () => {});
  }

  /* ---------------- la ficha ---------------- */
  // «Partidas en vivo» deja de decir «Pronto» cuando la sala ya tiene la
  // transmisión: pasa a ser un enlace que abre la ventana.
  function encenderFicha() {
    const f = $("ficha-partidas");
    if (!f || f.tagName === "A" || !evento || !evento.torneos.length) return;
    const a = document.createElement("a");
    a.id = "ficha-partidas";
    a.href = "#partidas";
    a.dataset.color = f.dataset.color || "azul";
    a.className = "cac-ficha h-full flex flex-col rounded-3xl bg-white dark:bg-brand-900 shadow-md p-4 sm:p-6 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#ce1328]";
    [...f.childNodes].forEach((n) => a.appendChild(n));
    const pie = a.querySelector("span:last-child");
    if (pie) { pie.className = "mt-auto pt-3 sm:pt-4 text-xs sm:text-sm font-bold cac-accion"; pie.textContent = (V.idioma() === "en" ? "Watch the games" : "Ver las partidas") + " →"; }
    f.replaceWith(a);
  }

  /* ---------------- la ventana ---------------- */
  const dialogo = $("partidas");
  const contenido = $("partidas-contenido");
  const filtros = { categoria: "", pais: "", ronda: 0, buscar: "", vivo: false, mios: false };
  let vista = null;          // null → la lista; { t, r, id } → el visor
  let temporizador = null;

  async function pintarLista() {
    if (!contenido || vista) return;
    const tx = T();
    if (!contenido.querySelector("[data-lista]")) contenido.replaceChildren(el("p", "text-brand-600 dark:text-brand-300", tx.cargando));
    let todas;
    try {
      await cargarEvento();
      if (!evento || !evento.torneos.length) { contenido.replaceChildren(el("p", "font-semibold", tx.sinTransmision)); return; }
      if (!torneosVisibles().length) { contenido.replaceChildren(el("p", "font-semibold", tx.sinModalidad(V.textos().modalidades[V.modalidad()].toLowerCase()))); return; }
      todas = await partidasDeTodo(filtros.ronda, LISTA_MS);
    } catch (e) {
      contenido.replaceChildren(el("p", "font-semibold", tx.error));
      return;
    }
    if (vista) return;
    armarLista(todas);
  }

  function seguidosPlanos() {
    return (V.seguidos ? V.seguidos() : []).map((s) => s.nombre);
  }

  function armarLista(todas) {
    const tx = T();
    // Los filtros se arman una vez; después solo cambia la lista.
    let caja = contenido.querySelector("[data-lista]");
    if (!caja) {
      caja = el("div", "cac-partidas");
      caja.dataset.lista = "";
      const estado = el("p", "cac-partidas-estado font-semibold");
      estado.setAttribute("role", "status");
      estado.dataset.estado = "";
      const fila = el("div", "cac-partidas-filtros");
      const sel = (clave, etiqueta) => {
        const l = el("label", "cac-partidas-filtro", etiqueta);
        const s = el("select", "cac-buscador-campo !mt-1");
        s.dataset.filtro = clave;
        s.addEventListener("change", () => { filtros[clave] = clave === "ronda" ? Number(s.value) || 0 : s.value; pintarLista(); });
        l.appendChild(s);
        return l;
      };
      fila.append(sel("categoria", tx.categoria), sel("pais", tx.pais), sel("ronda", tx.ronda));
      const lb = el("label", "cac-partidas-filtro", tx.buscar);
      const inp = el("input", "cac-buscador-campo !mt-1");
      inp.type = "search"; inp.autocomplete = "off"; inp.spellcheck = false; inp.dataset.filtro = "buscar";
      inp.value = filtros.buscar;
      inp.addEventListener("input", () => { filtros.buscar = inp.value; armarLista(ultimaLista); });
      lb.appendChild(inp);
      fila.appendChild(lb);
      const marcas = el("div", "cac-partidas-marcas");
      [["vivo", tx.soloVivo], ["mios", tx.soloMios]].forEach(([clave, texto]) => {
        const l = el("label", "cac-partidas-marca");
        const c = el("input", "");
        c.type = "checkbox"; c.checked = filtros[clave]; c.dataset.filtro = clave;
        c.addEventListener("change", () => { filtros[clave] = c.checked; armarLista(ultimaLista); });
        l.append(c, document.createTextNode(" " + texto));
        if (clave === "mios") l.dataset.mios = "";
        marcas.appendChild(l);
      });
      const ul = el("ul", "cac-partidas-lista");
      ul.dataset.partidas = "";
      caja.append(estado, fila, marcas, ul);
      contenido.replaceChildren(caja);
    }
    ultimaLista = todas;

    // Las opciones salen de lo que hay (el filtro elegido queda aunque ya no esté).
    const opciones = (clave, valores, nombre, primera) => {
      const s = caja.querySelector('[data-filtro="' + clave + '"]');
      const lista = [["", primera]].concat(valores.map((v) => [String(v), nombre(v)]));
      const firma = lista.map((x) => x.join("=")).join("|");
      if (s.dataset.firma !== firma) {
        s.dataset.firma = firma;
        s.replaceChildren(...lista.map(([v, tex]) => { const o = el("option", "", tex); o.value = v; return o; }));
      }
      s.value = String(filtros[clave] || "");
      if (s.value !== String(filtros[clave] || "")) { filtros[clave] = clave === "ronda" ? 0 : ""; s.value = ""; }
    };
    const cats = [...new Set(todas.map((x) => x.t.categoria).filter(Boolean))].sort((a, b) => ordenCat(a) - ordenCat(b));
    const feds = [...new Set(todas.flatMap((x) => [x.p.blancas.fed, x.p.negras.fed]).filter(Boolean))].sort((a, b) => V.pais(a).localeCompare(V.pais(b)));
    const numeros = [...new Set(torneosVisibles().flatMap((t) => (t.rondas ? t.rondas.rondas.filter((r) => r.terminada || r.enCurso || (r.empieza && r.empieza <= Date.now())).map((r) => r.numero) : [])))].sort((a, b) => a - b);
    const ahora = todas.length ? Math.max(...todas.map((x) => x.r.numero)) : 0;
    const deAhora = Math.max(0, ...torneosVisibles().map((t) => (rondaDe(t, 0) || {}).numero || 0));
    opciones("categoria", cats, (g) => V.categoria(g), tx.todas);
    opciones("pais", feds, (f) => V.pais(f) + " (" + f + ")", tx.todos);
    opciones("ronda", numeros, (n) => tx.ronda + " " + n, tx.rondaAhora(deAhora));
    const mios = seguidosPlanos();
    caja.querySelector("[data-mios]").hidden = !mios.length;

    const q = plano(filtros.buscar);
    const esMio = (x) => mios.some((n) => [x.p.blancas.nombre, x.p.negras.nombre].some((m) => plano(m) === plano(n) || corto(m) === corto(n)));
    const vistas = todas.filter((x) =>
      (!filtros.categoria || x.t.categoria === filtros.categoria) &&
      (!filtros.pais || x.p.blancas.fed === filtros.pais || x.p.negras.fed === filtros.pais) &&
      (!filtros.vivo || !x.p.resultado) &&
      (!filtros.mios || !mios.length || esMio(x)) &&
      (!q || plano(x.p.blancas.nombre + " " + x.p.negras.nombre).includes(q)));
    const enJuego = todas.filter((x) => !x.p.resultado).length;
    caja.querySelector("[data-estado]").textContent = tx.resumen(ahora, todas.length, enJuego) + ". " + tx.leido(horaCorta());
    const ul = caja.querySelector("[data-partidas]");
    if (!vistas.length) { ul.replaceChildren(el("li", "cac-partidas-nada", tx.ninguna)); return; }
    ul.replaceChildren(...vistas.map((x) => tarjetaPartida(x, tx)));
  }
  let ultimaLista = [];
  const horaCorta = () => new Date().toLocaleTimeString(V.textos().locale, { hour: "numeric", minute: "2-digit", timeZone: V.ZONA });

  const nombreDe = (j, tx) => (j && j.nombre ? (j.titulo ? j.titulo + " " : "") + j.nombre : tx.porDefinir);
  const relojTexto = (s) => {
    if (s == null || s < 0) return "";
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const dos = (n) => String(n).padStart(2, "0");
    return h ? h + ":" + dos(m) + ":" + dos(x) : m + ":" + dos(x);
  };

  function lineaJugador(j, color, tx, reloj) {
    const p = el("p", "cac-partida-jugador");
    p.appendChild(el("span", "cac-partida-color", color === "w" ? "♔" : "♚")).setAttribute("aria-hidden", "true");
    p.appendChild(el("span", "sr-only", (color === "w" ? tx.blancas : tx.negras) + ": "));
    p.appendChild(el("span", "cac-partida-nombre", nombreDe(j, tx)));
    if (j && j.fed) p.appendChild(el("span", "cac-fed", j.fed));
    if (j && j.elo) p.appendChild(el("span", "cac-partida-elo", String(j.elo)));
    if (reloj) p.appendChild(el("span", "cac-partida-reloj", reloj));
    return p;
  }

  function tarjetaPartida(x, tx) {
    const { p, t, r } = x;
    const li = el("li", "cac-partida");
    li.appendChild(el("p", "cac-partida-cabeza", tx.partida(V.categoria(t.categoria) || t.nombre, r.numero, p.mesa)));
    const fila = el("div", "cac-partida-fila");
    const tab = el("div", "cine-tablero cine-tablero-mini cac-partida-tablero");
    tab.setAttribute("aria-hidden", "true");
    F.dibujar(tab, p.fen, p.ultima, { miniatura: true });
    fila.appendChild(tab);
    const datos = el("div", "cac-partida-datos");
    datos.append(lineaJugador(p.negras, "b", tx, relojTexto(p.negras.reloj != null ? p.negras.reloj / 100 : null)),
      lineaJugador(p.blancas, "w", tx, relojTexto(p.blancas.reloj != null ? p.blancas.reloj / 100 : null)));
    const est = el("p", "cac-partida-resultado" + (p.resultado ? "" : " cac-partida-envivo"), p.resultado || (p.ultima ? tx.enJuego : tx.porEmpezar));
    datos.appendChild(est);
    fila.appendChild(datos);
    li.appendChild(fila);
    const abrir = el("button", "cac-partida-abrir");
    abrir.type = "button";
    abrir.setAttribute("aria-label", tx.ver(nombreDe(p.blancas, tx), nombreDe(p.negras, tx)) + ". " + (p.resultado || tx.enJuego) + ".");
    abrir.dataset.partida = p.id;
    abrir.addEventListener("click", () => abrirPartida(x, abrir));
    li.appendChild(abrir);
    return li;
  }

  /* ---------------- el visor ---------------- */
  let visor = null;   // { t, r, id, p (de la lista), g (del PGN), ply, girado, siguiendo, evals: Map }
  let quienAbrioVisor = null;

  function abrirPartida(x, desde) {
    vista = { t: x.t, r: x.r, id: x.p.id };
    visor = { t: x.t, r: x.r, id: x.p.id, p: x.p, g: null, ply: -1, girado: false, siguiendo: true, motor: new Map() };
    quienAbrioVisor = desde && dialogo && dialogo.contains(desde) ? desde.dataset.partida : null;
    if (dialogo && !dialogo.open) {
      if (window.VentanaEnlace) window.VentanaEnlace.abrirDialogo(dialogo, desde); else dialogo.showModal();
    }
    armarVisor();
    traerJugadas(true);
    programar();
  }

  function volverALista() {
    vista = null; visor = null;
    contenido.replaceChildren();
    pintarLista().then(() => {
      const b = quienAbrioVisor && contenido.querySelector('[data-partida="' + quienAbrioVisor + '"]');
      if (b) b.focus();
    });
  }

  async function traerJugadas(primera) {
    if (!visor) return;
    const v = visor;
    try {
      const [porId, lista] = await Promise.all([cargarPgn(v.t, v.r, primera ? 0 : VISOR_MS), cargarPartidas(v.t, v.r, primera ? 0 : VISOR_MS)]);
      if (visor !== v) return;
      const g = porId[v.id];
      const p = lista.find((y) => y.id === v.id);
      if (p) v.p = p;
      if (g) {
        const antes = v.g ? v.g.jugadas.length : 0;
        v.g = g;
        if (v.siguiendo || v.ply < 0) v.ply = g.jugadas.length - 1;
        v.nuevas = v.siguiendo ? 0 : Math.max(0, g.jugadas.length - 1 - v.ply);
        if (!primera && g.jugadas.length > antes && v.siguiendo) anunciarJugada();
      }
      v.error = false;
    } catch (e) {
      v.error = true;
    }
    pintarVisor();
  }

  function armarVisor() {
    const tx = T();
    const raiz = el("div", "cac-visor");
    raiz.dataset.visor = "";
    const volver = el("button", "cac-jugador-boton", tx.volver);
    volver.type = "button";
    volver.dataset.volver = "";
    volver.addEventListener("click", volverALista);
    const cab = el("p", "cac-visor-cabeza font-bold");
    cab.dataset.cabeza = "";
    const arriba = el("div", "cac-visor-jugador"); arriba.dataset.arriba = "";
    const zona = el("div", "cac-visor-zona");
    const barra = el("div", "cac-visor-barra");
    barra.dataset.barra = "";
    barra.setAttribute("aria-hidden", "true");
    barra.appendChild(el("span", "cac-visor-barra-blancas"));
    const marco = el("div", "cine-tablero-marco cac-visor-marco");
    const tablero = el("div", "cine-tablero cac-visor-tablero");
    tablero.dataset.tablero = "";
    tablero.setAttribute("role", "img");
    marco.appendChild(tablero);
    zona.append(barra, marco);
    const abajo = el("div", "cac-visor-jugador"); abajo.dataset.abajo = "";
    const evalTexto = el("p", "cac-visor-eval");
    evalTexto.dataset.eval = "";
    const nav = el("div", "cac-visor-nav");
    [["primera", "⏮", 0], ["anterior", "◀", 1], ["siguiente", "▶", 2], ["ultima", "⏭", 3]].forEach(([k, s]) => {
      const b = el("button", "cac-visor-boton", s);
      b.type = "button";
      b.dataset.nav = k;
      b.setAttribute("aria-label", tx[k]);
      b.title = tx[k];
      b.addEventListener("click", () => mover(k));
      nav.appendChild(b);
    });
    const girar = el("button", "cac-visor-boton cac-visor-girar", "⟲");
    girar.type = "button";
    girar.setAttribute("aria-label", tx.girar);
    girar.title = tx.girar;
    girar.setAttribute("aria-pressed", "false");
    girar.addEventListener("click", () => { visor.girado = !visor.girado; girar.setAttribute("aria-pressed", String(visor.girado)); pintarVisor(); });
    nav.appendChild(girar);
    const nuevas = el("button", "cac-jugador-boton cac-visor-nuevas");
    nuevas.type = "button";
    nuevas.dataset.nuevas = "";
    nuevas.hidden = true;
    nuevas.addEventListener("click", () => mover("ultima"));
    const anuncio = el("p", "sr-only");
    anuncio.setAttribute("aria-live", "polite");
    anuncio.dataset.anuncio = "";
    const grafico = el("div", "cac-visor-grafico");
    grafico.dataset.grafico = "";
    const jugadas = el("ol", "cac-visor-jugadas");
    jugadas.dataset.jugadas = "";
    jugadas.setAttribute("aria-label", V.idioma() === "en" ? "Moves" : "Jugadas");
    const pie = el("div", "cac-visor-pie");
    const copiar = el("button", "cac-jugador-boton", tx.copiar);
    copiar.type = "button";
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(pgnDe(visor)); V.anunciar(T().copiado); copiar.textContent = "✓ " + T().copiar; }
      catch (e) { /* sin permiso para copiar: no pasa nada */ }
    });
    // Sin «Ver en Lichess»: quien mira se queda en la página (lo pidió el
    // dueño). Ver «Las partidas en vivo, dentro de la página».
    pie.append(copiar);
    const derecha = el("div", "cac-visor-lado");
    derecha.append(evalTexto, nav, nuevas, grafico, jugadas, pie);
    const izquierda = el("div", "cac-visor-tableros");
    izquierda.append(arriba, zona, abajo);
    const cuerpo = el("div", "cac-visor-cuerpo");
    cuerpo.append(izquierda, derecha);
    raiz.append(volver, cab, cuerpo, anuncio);
    contenido.replaceChildren(raiz);
    volver.focus();
  }

  // Las jugadas que tiene la partida hasta ahora (del PGN; si todavía no
  // llegó, ninguna) y la posición que se ve.
  const jugadasDe = (v) => (v.g ? v.g.jugadas : []);
  function posicion(v) {
    const js = jugadasDe(v);
    if (v.ply >= 0 && js[v.ply]) return { fen: js[v.ply].fen, ultima: js[v.ply].de + js[v.ply].a, j: js[v.ply] };
    if (!js.length && v.p) return { fen: v.p.fen, ultima: v.p.ultima, j: null };
    return { fen: (v.g && v.g.fenInicial) || L.INICIAL, ultima: "", j: null };
  }

  function mover(k) {
    if (!visor) return;
    const n = jugadasDe(visor).length;
    if (k === "primera") visor.ply = -1;
    else if (k === "anterior") visor.ply = Math.max(-1, visor.ply - 1);
    else if (k === "siguiente") visor.ply = Math.min(n - 1, visor.ply + 1);
    else if (k === "ultima") visor.ply = n - 1;
    else if (typeof k === "number") visor.ply = Math.max(-1, Math.min(n - 1, k));
    visor.siguiendo = visor.ply === n - 1;
    visor.nuevas = 0;
    pintarVisor();
    anunciarJugada();
  }

  function anunciarJugada() {
    const a = contenido.querySelector("[data-anuncio]");
    if (!a || !visor) return;
    const tx = T();
    const { j } = posicion(visor);
    a.textContent = j ? tx.jugada(Math.floor(visor.ply / 2) + 1, j.color, sanOir(j.san)) + " " + textoEval(evalDe(visor), tx) : tx.inicio + ".";
  }

  // La evaluación de la posición que se ve: la de Lichess, o la que calculó
  // Stockfish en este aparato si se le pidió.
  function evalDe(v) {
    const { j, fen } = posicion(v);
    if (j && j.eval != null) return { v: j.eval, de: "lichess" };
    if (v.motor.has(fen) && v.motor.get(fen) != null) return { v: v.motor.get(fen), de: "motor" };
    if (v.ply < 0) return { v: 0, de: "lichess", inicial: true };
    return null;
  }

  function textoEval(e, tx) {
    if (!e) return tx.evalNo;
    const x = e.v;
    let s;
    if (Math.abs(x) >= 90) s = tx.mate(Math.max(1, Math.round(100 - Math.abs(x))), x > 0);
    else {
      const n = (x >= 0 ? "+" : "−") + (Math.round(Math.abs(x) * 10) / 10).toFixed(1).replace(".", V.idioma() === "en" ? "." : ",");
      s = n + " (" + (Math.abs(x) < 0.3 ? tx.igualado : x > 0 ? tx.mejorBlancas : tx.mejorNegras) + ")";
    }
    return (e.de === "motor" ? tx.evalMotor : tx.evalLichess) + ": " + s + ".";
  }

  let cargaMotor = null;
  const cargarScript = (src) => new Promise((ok, mal) => { const sc = document.createElement("script"); sc.src = src; sc.onload = ok; sc.onerror = () => mal(new Error(src)); document.head.append(sc); });
  function calcularConMotor() {
    const v = visor;
    if (!v) return;
    const { fen } = posicion(v);
    if (v.motor.has(fen)) return;
    v.motor.set(fen, undefined);
    pintarVisor();
    if (!cargaMotor) cargaMotor = cargarScript("js/shared-engine.js").then(() => cargarScript("js/preparacion-motor.js"));
    cargaMotor.then(() => window.PreparacionMotor.evaluar(fen, 14)).then((r) => {
      v.motor.set(fen, r && r.eval != null ? r.eval : null);
      if (!(r && r.eval != null)) v.motorFallo = fen;
    }, () => { v.motor.set(fen, null); v.motorFallo = fen; }).then(() => { if (visor === v) { pintarVisor(); anunciarJugada(); } });
  }

  function pintarVisor() {
    if (!visor || !contenido.querySelector("[data-visor]")) return;
    const v = visor, tx = T();
    const js = jugadasDe(v);
    const pos = posicion(v);
    const p = v.p || {};
    contenido.querySelector("[data-cabeza]").textContent = tx.partida(V.categoria(v.t.categoria) || v.t.nombre, v.r.numero, p.mesa)
      + (p.resultado ? " · " + tx.terminada(p.resultado) : js.length ? " · " + tx.enJuego : "");
    // Los relojes: el del PGN en la jugada que se ve; en la última, el de Lichess.
    const relojEn = (color) => {
      for (let i = v.ply; i >= 0; i--) if (js[i] && js[i].color === color && js[i].reloj != null) return js[i].reloj;
      return null;
    };
    const vivoReloj = (j) => (j && j.reloj != null ? j.reloj / 100 : null);
    const enUltima = v.ply === js.length - 1;
    const rb = enUltima && vivoReloj(p.blancas) != null ? vivoReloj(p.blancas) : relojEn("w");
    const rn = enUltima && vivoReloj(p.negras) != null ? vivoReloj(p.negras) : relojEn("b");
    const arriba = contenido.querySelector("[data-arriba]"), abajo = contenido.querySelector("[data-abajo]");
    const lb = lineaJugador(p.blancas, "w", tx, relojTexto(rb)), ln = lineaJugador(p.negras, "b", tx, relojTexto(rn));
    const turno = String(pos.fen).split(" ")[1];
    (turno === "w" ? lb : ln).classList.add("cac-partida-turno");
    arriba.replaceChildren(v.girado ? lb : ln);
    abajo.replaceChildren(v.girado ? ln : lb);
    const tablero = contenido.querySelector("[data-tablero]");
    F.dibujar(tablero, pos.fen, pos.ultima, { girado: v.girado });
    tablero.setAttribute("aria-label", F.describir(pos.fen));
    // La barra: el blanco crece desde abajo (o desde arriba con el tablero girado).
    const e = evalDe(v);
    const barra = contenido.querySelector("[data-barra]");
    barra.classList.toggle("cac-visor-barra-girada", v.girado);
    barra.firstChild.style.height = L.porcentaje(e ? e.v : 0).toFixed(1) + "%";
    barra.classList.toggle("cac-visor-barra-sin", !e);
    const ev = contenido.querySelector("[data-eval]");
    ev.replaceChildren(el("span", "", e && e.inicial ? tx.inicio + "." : textoEval(e, tx)));
    if (!e && pos.j) {
      const calculando = v.motor.has(pos.fen) && v.motor.get(pos.fen) === undefined;
      if (v.motorFallo === pos.fen) ev.appendChild(el("span", "block text-sm", tx.evalNoPudo));
      else if (calculando) ev.appendChild(el("span", "block text-sm", tx.evalCalculando));
      else {
        const b = el("button", "cac-jugador-boton cac-visor-motor", tx.evalCalcular);
        b.type = "button";
        b.addEventListener("click", calcularConMotor);
        ev.appendChild(b);
      }
    }
    // Los botones: apagados donde no se puede ir.
    const nav = (k) => contenido.querySelector('[data-nav="' + k + '"]');
    nav("primera").disabled = nav("anterior").disabled = v.ply < 0;
    nav("siguiente").disabled = nav("ultima").disabled = v.ply >= js.length - 1;
    const nuevas = contenido.querySelector("[data-nuevas]");
    nuevas.hidden = !v.nuevas;
    if (v.nuevas) nuevas.textContent = tx.nuevas(v.nuevas);
    pintarJugadas(v, js, tx);
    pintarGrafico(v, js, tx);
  }

  function pintarJugadas(v, js, tx) {
    const ol = contenido.querySelector("[data-jugadas]");
    if (!js.length) { ol.replaceChildren(el("li", "cac-visor-sin", tx.sinJugadas)); return; }
    const firma = js.length + ":" + v.ply;
    if (ol.dataset.firma === firma) return;
    const habia = ol.dataset.firma;
    ol.dataset.firma = firma;
    const items = [];
    for (let i = 0; i < js.length; i += 2) {
      const li = el("li", "cac-visor-par");
      li.appendChild(el("span", "cac-visor-num", (Math.floor(i / 2) + 1) + "."));
      [i, i + 1].forEach((k) => {
        if (!js[k]) return;
        const b = el("button", "cac-visor-jugada", sanVer(js[k].san));
        b.type = "button";
        b.dataset.ply = String(k);
        b.setAttribute("aria-label", tx.jugada(Math.floor(k / 2) + 1, js[k].color, sanOir(js[k].san)));
        if (k === v.ply) b.setAttribute("aria-current", "true");
        b.addEventListener("click", () => mover(k));
        li.appendChild(b);
      });
      items.push(li);
    }
    const foco = document.activeElement && ol.contains(document.activeElement) ? document.activeElement.dataset.ply : null;
    ol.replaceChildren(...items);
    if (foco != null) { const b = ol.querySelector('[data-ply="' + v.ply + '"]') || ol.querySelector('[data-ply="' + foco + '"]'); if (b) b.focus(); }
    const actual = ol.querySelector("[aria-current]");
    if (actual && habia !== undefined) {
      const top = actual.offsetTop - ol.offsetTop;
      if (top < ol.scrollTop || top > ol.scrollTop + ol.clientHeight - 30) ol.scrollTop = top - ol.clientHeight / 2;
    }
  }

  // El gráfico de la evaluación, jugada a jugada (solo las que trae Lichess):
  // arriba las blancas, abajo las negras. Tocarlo lleva a esa jugada.
  function pintarGrafico(v, js, tx) {
    const caja = contenido.querySelector("[data-grafico]");
    const conEval = js.map((j, i) => ({ i, e: j.eval })).filter((x) => x.e != null);
    if (conEval.length < 4) { caja.replaceChildren(); caja.hidden = true; return; }
    caja.hidden = false;
    const W = 300, H = 60, n = Math.max(1, js.length - 1);
    const y = (e) => (H - (L.porcentaje(e) / 100) * H).toFixed(1);
    const pts = conEval.map((x) => (x.i / n * W).toFixed(1) + "," + y(x.e)).join(" ");
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", tx.grafico);
    const area = document.createElementNS(ns, "polygon");
    area.setAttribute("points", "0," + H + " " + pts + " " + W + "," + H);
    area.setAttribute("class", "cac-grafico-area");
    const linea = document.createElementNS(ns, "polyline");
    linea.setAttribute("points", pts);
    linea.setAttribute("class", "cac-grafico-linea");
    const medio = document.createElementNS(ns, "line");
    medio.setAttribute("x1", "0"); medio.setAttribute("x2", String(W)); medio.setAttribute("y1", String(H / 2)); medio.setAttribute("y2", String(H / 2));
    medio.setAttribute("class", "cac-grafico-medio");
    const cursor = document.createElementNS(ns, "line");
    const cx = (Math.max(0, v.ply) / n * W).toFixed(1);
    cursor.setAttribute("x1", cx); cursor.setAttribute("x2", cx); cursor.setAttribute("y1", "0"); cursor.setAttribute("y2", String(H));
    cursor.setAttribute("class", "cac-grafico-cursor");
    svg.append(area, medio, linea, cursor);
    svg.addEventListener("click", (ev) => {
      const r = svg.getBoundingClientRect();
      mover(Math.round(((ev.clientX - r.left) / r.width) * n));
    });
    caja.replaceChildren(svg);
  }

  // El PGN de la partida, para copiar: lo de Lichess, sin la evaluación ni el reloj.
  function pgnDe(v) {
    if (!v || !v.g) return "";
    const g = v.g, tags = ["Event", "Site", "Date", "Round", "White", "Black", "Result", "WhiteElo", "BlackElo"];
    const cab = tags.filter((k) => g.tags[k]).map((k) => "[" + k + ' "' + String(g.tags[k]).replace(/"/g, "'") + '"]').join("\n");
    const mov = g.jugadas.map((j, i) => (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + j.san).join(" ");
    return cab + "\n\n" + mov + " " + (g.resultado || "*") + "\n";
  }

  // Con el teclado, dentro del visor: ← → para ir y volver, Inicio y Fin.
  if (dialogo) {
    dialogo.addEventListener("keydown", (e) => {
      if (!visor || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const k = { ArrowLeft: "anterior", ArrowRight: "siguiente", Home: "primera", End: "ultima" }[e.key];
      if (!k) return;
      e.preventDefault();
      mover(k);
    });
  }

  /* ---------------- ponerse al día ---------------- */
  function programar() {
    clearTimeout(temporizador);
    if (!dialogo || !dialogo.open) return;
    temporizador = setTimeout(() => {
      if (!document.hidden) { if (visor) traerJugadas(false); else pintarLista(); }
      programar();
    }, visor ? VISOR_MS : LISTA_MS);
  }

  if (dialogo) {
    new MutationObserver(() => {
      if (dialogo.open) { if (!visor) pintarLista(); programar(); }
      else { clearTimeout(temporizador); vista = null; visor = null; if (contenido) contenido.replaceChildren(); }
    }).observe(dialogo, { attributes: true, attributeFilter: ["open"] });
    if (dialogo.open) { pintarLista(); programar(); }
  }
  document.addEventListener("cac-datos", alLlegarDatos);
  document.addEventListener("cac-idioma", () => {
    if (!dialogo || !dialogo.open) return;
    if (visor) { armarVisor(); pintarVisor(); } else { contenido.replaceChildren(); pintarLista(); }
  });
  // Cambiar de modalidad cambia los torneos que se ven.
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest("[data-modalidades] [data-modalidad]")) return;
    setTimeout(() => { if (dialogo && dialogo.open && !visor) { contenido.replaceChildren(); pintarLista(); } if (evento && evento.torneos.length) pintarEnVivo(); }, 0);
  });
  // La ficha se enciende sola si la sala ya tiene la transmisión, y entonces
  // arranca «En vivo ahora».
  cargarEvento().then(() => { if (evento && evento.torneos.length) vigilarEnVivo(); }, () => {});

  /* ---------------- lo que se está jugando ---------------- */
  // Las partidas de la ronda de ahora que ya empezaron y no terminaron, en la
  // modalidad que se ve, cada una con la evaluación de su última jugada que
  // traiga Lichess (el PGN se pide a lo sumo cada minuto por ronda). Lo usan
  // «En vivo ahora» de la portada y el proyector (js/centroamericano-tablas.js).
  const PGN_VIVO_MS = 60000;
  async function enJuego() {
    await cargarEvento();
    if (!evento || !evento.torneos.length) return [];
    const vivas = (await partidasDeTodo(0, LISTA_MS)).filter((x) => !x.p.resultado && x.p.ultima);
    const porRonda = new Map();
    vivas.forEach((x) => porRonda.set(x.r.id, x));
    await Promise.all([...porRonda.values()].map(async (x0) => {
      try {
        const porId = await cargarPgn(x0.t, x0.r, PGN_VIVO_MS);
        vivas.filter((x) => x.r.id === x0.r.id).forEach((x) => {
          const g = porId[x.p.id];
          const j = g && g.jugadas.slice().reverse().find((k) => k.eval != null);
          x.eval = j ? j.eval : null;
        });
      } catch (e) { /* sin evaluación: la barra queda apagada */ }
    }));
    return vivas;
  }

  // La barra chica de una partida, de costado: blanco a la izquierda. Con el
  // dato escrito para el lector (y en el proyector, también a la vista).
  function barraChica(e, tx) {
    const b = el("div", "cac-vivo-barra" + (e == null ? " cac-visor-barra-sin" : ""));
    b.setAttribute("role", "img");
    b.setAttribute("aria-label", tx.barra(e));
    const blanco = el("span", "");
    blanco.style.width = L.porcentaje(e == null ? 0 : e).toFixed(1) + "%";
    b.appendChild(blanco);
    return b;
  }

  // La tarjeta de una partida en la fila de la portada: un toque abre el visor.
  function tarjetaMini(x, tx) {
    const { p, t, r } = x;
    const li = el("li", "cac-envivo-item");
    const tab = el("div", "cine-tablero cine-tablero-mini");
    tab.setAttribute("aria-hidden", "true");
    F.dibujar(tab, p.fen, p.ultima, { miniatura: true });
    const datos = el("div", "cac-envivo-datos");
    datos.append(el("p", "cac-envivo-cat", tx.partida(V.categoria(t.categoria) || t.nombre, 0, p.mesa)),
      lineaJugador(p.negras, "b", tx, ""), lineaJugador(p.blancas, "w", tx, ""));
    li.append(tab, barraChica(x.eval, tx), datos);
    const abrir = el("button", "cac-partida-abrir");
    abrir.type = "button";
    abrir.dataset.partida = p.id;
    abrir.setAttribute("aria-label", tx.ver(nombreDe(p.blancas, tx), nombreDe(p.negras, tx)) + ". " + tx.enJuego + ".");
    abrir.addEventListener("click", () => abrirPartida(x, abrir));
    li.appendChild(abrir);
    return li;
  }

  // La tarjeta grande del proyector: tablero, jugadores con su reloj y la barra.
  function tarjetaGrande(x) {
    const tx = T(), { p, t } = x;
    const c = el("section", "cac-proyector-partida");
    c.appendChild(el("h3", "", tx.partida(V.categoria(t.categoria) || t.nombre, 0, p.mesa)));
    c.appendChild(lineaJugador(p.negras, "b", tx, relojTexto(p.negras.reloj != null ? p.negras.reloj / 100 : null)));
    const tab = el("div", "cine-tablero");
    tab.setAttribute("aria-hidden", "true");
    F.dibujar(tab, p.fen, p.ultima, { miniatura: true });
    c.appendChild(tab);
    c.appendChild(lineaJugador(p.blancas, "w", tx, relojTexto(p.blancas.reloj != null ? p.blancas.reloj / 100 : null)));
    c.appendChild(barraChica(x.eval, tx));
    c.appendChild(el("p", "cac-proyector-eval", tx.barra(x.eval) + (x.eval != null && Math.abs(x.eval) < 90 ? " (" + (x.eval >= 0 ? "+" : "−") + (Math.round(Math.abs(x.eval) * 10) / 10).toFixed(1).replace(".", V.idioma() === "en" ? "." : ",") + ")" : "")));
    return c;
  }

  // «En vivo ahora», arriba de «Busca a tu jugador»: las partidas que se
  // están jugando, de costado; se esconde sin transmisión o sin partidas en
  // juego. Se pone al día cada 30 segundos mientras la página está a la vista.
  const ENVIVO_MS = 30000;
  const filaVivo = $("en-vivo-ahora");
  async function pintarEnVivo() {
    if (!filaVivo) return;
    let vivas = [];
    try { vivas = await enJuego(); } catch (e) { vivas = []; }
    const tx = T();
    filaVivo.hidden = !vivas.length;
    if (!vivas.length) { filaVivo.replaceChildren(); return; }
    const cab = el("div", "cac-envivo-cabeza");
    const h = el("h3", "cac-buscador-titulo");
    h.appendChild(el("span", "", "🔴 ")).setAttribute("aria-hidden", "true");
    h.appendChild(document.createTextNode(tx.enVivoTitulo));
    const ver = el("a", "cac-accion underline underline-offset-2", tx.enVivoVer(vivas.length));
    ver.href = "#partidas";
    ver.addEventListener("click", (e) => { e.preventDefault(); abrirLista({ vivo: true }); });
    cab.append(h, ver);
    const ul = el("ul", "cac-envivo-lista");
    ul.setAttribute("aria-label", tx.enVivoTitulo);
    vivas.slice(0, 12).forEach((x) => ul.appendChild(tarjetaMini(x, tx)));
    // Si el foco estaba en una tarjeta, vuelve a la misma después de repintar.
    const foco = document.activeElement && filaVivo.contains(document.activeElement) ? document.activeElement.dataset.partida : null;
    filaVivo.replaceChildren(cab, ul);
    if (foco) { const b = filaVivo.querySelector('[data-partida="' + foco + '"]'); if (b) b.focus(); }
  }
  let relojVivo = null;
  function vigilarEnVivo() {
    if (!filaVivo) return;
    clearInterval(relojVivo);
    pintarEnVivo();
    relojVivo = setInterval(() => { if (!document.hidden && evento && evento.torneos.length) pintarEnVivo(); }, ENVIVO_MS);
  }

  // Para la ventana de cada categoría (js/centroamericano-tablas.js): si
  // Lichess transmite esa categoría, y abrir la lista ya filtrada por ella.
  function transmiteCategoria(g) {
    return cargarEvento().then(() => torneosVisibles().some((t) => t.categoria === g), () => false);
  }
  function abrirLista(f) {
    filtros.categoria = (f && f.categoria) || "";
    filtros.vivo = !!(f && f.vivo);
    vista = null; visor = null;
    if (contenido) contenido.replaceChildren();
    if (dialogo && !dialogo.open) {
      if (window.VentanaEnlace) window.VentanaEnlace.abrirDialogo(dialogo, null); else dialogo.showModal();
    } else pintarLista();
  }

  // actualizar(): lo que hace el temporizador, ya (lo usa el verificador).
  window.CentroamericanoPartidas = { botonDe, codigoCategoria, modalidadDe, abrirPartida, cargarEvento, pgnDe, transmiteCategoria, abrirLista, enJuego, tarjetaGrande, pintarEnVivo,
    actualizar: () => (visor ? traerJugadas(true) : (Object.values(evento ? evento.torneos : []).forEach((t) => { t.partidasPorRonda = {}; }), pintarLista())) };
})();
