/* El código de entreno/estilo.html: la prueba de estilo.
 *
 * Qué se mide y cómo está en js/estilo-perfil.js; las preguntas, en
 * js/estilo-items.js; las aperturas que le quedan a cada estilo, en
 * js/estilo-aperturas.js; lo que se pinta del resultado, en
 * js/estilo-tarjeta.js (lo mismo que ve su profe en Informes). Acá va solo la
 * página: la portada, las preguntas, «Cómo juegas» y el resultado.
 *
 * - Cada respuesta guarda la jugada elegida, lo segura que estaba la persona y
 *   cuánto tardó en elegir (desde que vio la posición hasta su última
 *   elección).
 * - Si tiene sus usuarios de Lichess o Chess.com (Configuración), mientras
 *   contesta su computadora mide el estilo en sus partidas
 *   (js/estilo-partidas.js). Al terminar se espera un poco a que acabe, y si
 *   tarda, se usa lo que alcanzó. Con las mismas partidas se mide en qué tipo
 *   de partida le va mejor (EstiloPartidas.rendimiento), que la
 *   recomendación suma y que se guarda en el contexto.
 * - Lo que ven sus profes (estilo_opiniones, lo marcan en Informes) entra al
 *   resultado con el peso de dos preguntas, y lo dice.
 * - Se guarda una fila en `estilo_pruebas` (la hora la pone la base), con la
 *   recomendación de ese día: es la que se sigue después.
 * Ver «La prueba de estilo» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const P = window.EstiloPerfil, B = window.EstiloItems, A = window.EstiloAperturas;
  const SEGURIDADES = [[3, "Muy seguro"], [2, "Más o menos"], [1, "Me da igual"]];
  const RITMOS = [["bala", "Bala"], ["blitz", "Blitz"], ["rapidas", "Rápidas"], ["clasicas", "Clásicas"]];
  const ESTUDIO = [["poco", "Menos de 1 hora"], ["medio", "De 1 a 3 horas"], ["mucho", "Más de 3 horas"]];
  const ESPERA_PARTIDAS = 60000;

  let perfil = null;           // la fila de profiles
  let cuentas = null;          // { lichess, chesscom } de analisis_partidas_alumno
  let eloEnLinea = null;
  let ultima = null;           // la última prueba guardada
  let opiniones = [];          // lo que ven sus profes (estilo_opiniones): entra al resultado
  let prueba = null, item = null, juego = null;
  let eleccion = null, seguridad = null, desde = 0, ms = 0;
  let momentos = [], midiendo = null, pararPartidas = false, rendimiento = null;
  let comandos = null, teclado = null;

  /* `foco`: lo que recibe el foco en la vista nueva (ver precisión posicional). */
  function irA(vista, foco) {
    ["intro-view", "pregunta-view", "contexto-view", "resultado-view"].forEach((id) => $(id).classList.toggle("hidden", id !== vista));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (foco) { try { foco.focus({ preventScroll: true }); } catch (e) {} }
  }
  function anunciar(texto) {
    const r = $("es-anuncio");
    if (r) { r.textContent = ""; setTimeout(() => { r.textContent = texto; }, 40); }
    if (window.BlindNotation && BlindNotation.speak) BlindNotation.speak(texto);
  }

  const NOMBRE = { k: "el rey", q: "la dama", r: "la torre", b: "el alfil", n: "el caballo", p: "el peón" };
  const sanEs = (san) => (window.PreparacionLineas ? PreparacionLineas.sanEs(san) : san);
  /* «Cf3 (el caballo de g1 a f3)»: la jugada escrita y dicha. */
  function jugadaDicha(j) {
    const m = new Chess(item.fen).move({ from: j.uci.slice(0, 2), to: j.uci.slice(2, 4), promotion: j.uci[4] });
    if (!m) return sanEs(j.san);
    const como = m.flags.includes("k") || m.flags.includes("q") ? "el enroque" : `${NOMBRE[m.piece]} de ${m.from} a ${m.to}${m.captured ? ", comiendo" : ""}`;
    return `${sanEs(j.san)} (${como})`;
  }
  const preguntaDicha = () => `Posición ${prueba.avance().hechas + 1}. ${item.fen.split(" ")[1] === "w" ? "Juegan las blancas" : "Juegan las negras"}. ¿Cuál jugarías? Jugada A: ${jugadaDicha(item.a)}. Jugada B: ${jugadaDicha(item.b)}. Después di qué tan seguro estás: muy seguro, más o menos o me da igual.`;

  /* ---------------- Las partidas, mientras contesta ---------------- */
  async function medirPartidas() {
    const estado = $("q-partidas");
    try {
      await AnalisisAlumno.cargarModulos();
      const D = window.PreparacionDescarga, An = window.PreparacionAnalisis;
      const lista = [["lichess", cuentas.lichess], ["chesscom", cuentas.chesscom]].filter(([, u]) => u);
      const principal = lista[0][1];
      let texto = "";
      for (const [sitio, usuario] of lista) {
        if (pararPartidas) return;
        estado.textContent = "Bajando tus partidas…";
        const t = await D.descargar({ sitio, usuario, maximo: 100 });
        texto += (texto ? "\n\n" : "") + (usuario === principal ? t : D.unirCuentas(t, usuario, principal));
      }
      const partidas = An.leerPgn(texto);
      // Sin motor: sale enseguida, y no depende de que termine lo de abajo.
      try { rendimiento = EstiloPartidas.rendimiento(partidas, principal); } catch (e) { rendimiento = null; }
      const hallados = await EstiloPartidas.momentos(partidas, principal, {
        maximo: 60, parar: () => pararPartidas,
        alAvanzar: (i, n, m) => { estado.textContent = `Tus partidas: ${i} de ${n} posiciones revisadas, ${m} ${m === 1 ? "momento" : "momentos"} de estilo.`; },
      });
      momentos.push(...hallados.map((x) => ({ eje: x.eje, primero: x.primero })));
      estado.textContent = `Tus partidas: ${momentos.length} ${momentos.length === 1 ? "momento" : "momentos"} de estilo.`;
    } catch (e) {
      console.warn("Prueba de estilo: no se pudieron revisar las partidas", e);
      estado.textContent = "No se pudieron revisar tus partidas" + (e && e.paraMostrar ? " (" + e.message + ")" : "") + "; la prueba sigue igual.";
    }
  }

  /* ---------------- Las preguntas ---------------- */
  function empezar() {
    momentos = [];
    rendimiento = null;
    pararPartidas = false;
    midiendo = cuentas && $("usar-partidas").checked ? medirPartidas() : null;
    const vistas = ultima ? (ultima.respuestas || []).map((r) => r.id) : [];
    // La corta, para quien empieza (FORMAS[3]): menos posiciones y más simples.
    const corta = $("forma-corta").checked;
    prueba = P.Prueba({ Chess, partidas: momentos, vistas, opiniones, version: corta ? B.VERSION_INICIAL : B.VERSION });
    irA("pregunta-view");
    siguiente();
    if (comandos && CuadroComandos.activo()) { comandos.decir(preguntaDicha()); comandos.enfocar(); }
  }

  function siguiente() {
    item = prueba.siguiente();
    if (!item) { pedirContexto(); return; }
    eleccion = null; seguridad = null; ms = 0;
    desde = Date.now();
    pintarPregunta();
  }

  function pintarPregunta() {
    juego = new Chess(item.fen);
    const av = prueba.avance();
    $("q-counter").textContent = `Posición ${av.hechas + 1}` + (av.hechas < av.minimo ? ` de ${av.minimo}` : " (una más para afinar)");
    $("q-bar").style.width = Math.min(100, (av.hechas / av.minimo) * 100) + "%";
    $("q-turno").textContent = item.fen.split(" ")[1] === "w" ? "Juegan las blancas" : "Juegan las negras";
    window.ExampleBoard.render($("q-board"), juego);
    if (window.TableroAccesible) {
      teclado = TableroAccesible.montar($("q-board"), { nombre: "Tablero de la posición", juego: () => juego, cuadro: () => (comandos ? comandos.input : null) });
      if (teclado) teclado.refrescar();
    }
    marcarCasillas();
    const caja = $("q-options");
    caja.textContent = "";
    [["a", "A"], ["b", "B"]].forEach(([k, letra]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = clase(eleccion === k);
      b.textContent = `Jugada ${letra}: ${jugadaDicha(item[k])}`;
      b.setAttribute("aria-pressed", eleccion === k ? "true" : "false");
      b.dataset.eleccion = k;
      b.addEventListener("click", () => { elegir(k); const igual = caja.querySelector('[data-eleccion="' + k + '"]'); if (igual) igual.focus(); });
      caja.appendChild(b);
    });
    const seg = $("q-seguridad");
    seg.textContent = "";
    SEGURIDADES.forEach(([v, texto]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = clase(seguridad === v) + " text-center";
      b.textContent = texto;
      b.setAttribute("aria-pressed", seguridad === v ? "true" : "false");
      b.dataset.seguridad = String(v);
      b.addEventListener("click", () => { seguridad = v; pintarPregunta(); const igual = seg.querySelector('[data-seguridad="' + v + '"]'); if (igual) igual.focus(); });
      seg.appendChild(b);
    });
    $("next-btn").disabled = !(eleccion && seguridad);
    prepararComandos();
  }
  const clase = (sel) => "w-full text-left px-4 py-3 rounded-xl border-2 transition-colors text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " +
    (sel ? "border-accent-500 bg-accent-50 dark:bg-brand-800 text-brand-800 dark:text-white font-semibold"
         : "border-brand-100 dark:border-brand-700 hover:border-accent-400 text-brand-600 dark:text-brand-300");

  /* La jugada elegida se marca en el tablero (de dónde sale y adónde va);
     el dato va también escrito en el botón. */
  function marcarCasillas() {
    $("q-board").querySelectorAll("[data-square]").forEach((sq) => { sq.style.boxShadow = ""; });
    if (!eleccion) return;
    const u = item[eleccion].uci;
    [u.slice(0, 2), u.slice(2, 4)].forEach((s) => {
      const sq = $("q-board").querySelector('[data-square="' + s + '"]');
      if (sq) sq.style.boxShadow = "inset 0 0 0 4px rgb(var(--c-accent-500, 245 158 11))";
    });
  }

  function elegir(k) {
    eleccion = k;
    ms = Date.now() - desde;
    pintarPregunta();
  }

  function responder() {
    if (!(eleccion && seguridad)) return;
    prueba.responder(item, { eleccion, seguridad, ms: Math.min(ms, 3600000) });
    siguiente();
  }

  /* ---------------- El cuadro de comandos (Modo Adaptado) ---------------- */
  function prepararComandos() {
    if (!window.CuadroComandos) return;
    if (!comandos) {
      comandos = CuadroComandos.montar($("q-comandos"), { juego: () => juego, tablero: () => teclado, onEnviar: responderEscribiendo });
    }
    comandos.posicion(juego);
    comandos.etiqueta("Escribe A o B, y qué tan seguro estás");
    comandos.ayuda("Puedes escribir todo junto («A muy seguro», «B me da igual») o de a una cosa. «repetir» vuelve a decir la pregunta. También puedes preguntar por la posición: «caballos», «qué hay en e4».");
  }
  function responderEscribiendo(texto, api) {
    const t = CuadroComandos.normalizar(texto);
    if (/^(repetir|repite|pregunta|la pregunta)$/.test(t)) { api.limpiar(); api.decir(preguntaDicha()); return; }
    let entendi = false;
    const letra = /(^|\s)(jugada\s+)?([ab])(\s|$)/.exec(t);
    if (letra) { eleccion = letra[3]; ms = Date.now() - desde; entendi = true; }
    if (/muy seguro|^seguro|\sseguro$/.test(t)) { seguridad = 3; entendi = true; }
    else if (/mas o menos/.test(t)) { seguridad = 2; entendi = true; }
    else if (/(me )?da igual|^igual$/.test(t)) { seguridad = 1; entendi = true; }
    if (/^(siguiente|sig)$/.test(t)) {
      api.limpiar();
      if (eleccion && seguridad) { responder(); if (item) api.decir(preguntaDicha()); }
      else api.decir("Todavía falta: " + (eleccion ? "" : "la jugada (A o B)") + (eleccion || seguridad ? "" : " y ") + (seguridad ? "" : "qué tan seguro estás") + ".");
      return;
    }
    if (!entendi) { api.decir(`No entendí «${texto.trim()}». Escribe A o B, y muy seguro, más o menos o me da igual.`); return; }
    api.limpiar();
    pintarPregunta();
    if (eleccion && seguridad) {
      const dicho = `Anotado: jugada ${eleccion.toUpperCase()}, ${SEGURIDADES.find((x) => x[0] === seguridad)[1].toLowerCase()}.`;
      responder();
      if (item && !$("pregunta-view").classList.contains("hidden")) api.decir(dicho + " " + preguntaDicha());
      else api.decir(dicho);
    } else api.decir(eleccion ? "Anotada la jugada " + eleccion.toUpperCase() + ". ¿Qué tan seguro estás?" : "Anotado. Ahora la jugada: A o B.");
  }

  /* ---------------- Cómo juegas ---------------- */
  function radios(caja, nombre, opciones) {
    caja.textContent = "";
    opciones.forEach(([v, texto]) => {
      const l = document.createElement("label");
      l.className = "flex items-center gap-2 border-2 border-brand-100 dark:border-brand-700 rounded-xl px-3 py-2 cursor-pointer text-sm text-brand-700 dark:text-brand-200";
      const i = document.createElement("input");
      i.type = "radio"; i.name = nombre; i.value = v;
      i.className = "focus-visible:ring-2 focus-visible:ring-accent-400";
      l.append(i, document.createTextNode(texto));
      caja.appendChild(l);
    });
  }
  function opcionesDe(select, filtro) {
    select.textContent = "";
    const ninguna = document.createElement("option");
    ninguna.value = ""; ninguna.textContent = "No tengo una fija";
    select.appendChild(ninguna);
    AperturasLineas.LINEAS.filter((l) => l.tipo === "apertura" && filtro(l)).sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))
      .forEach((l) => { const o = document.createElement("option"); o.value = l.id; o.textContent = l.nombre; select.appendChild(o); });
  }
  function pedirContexto() {
    pararPartidasLuego();
    radios($("ctx-ritmo"), "ritmo", RITMOS);
    radios($("ctx-estudio"), "estudio", ESTUDIO);
    opcionesDe($("ctx-blancas"), (l) => l.color === "w");
    opcionesDe($("ctx-e4"), (l) => l.color === "b" && l.jugadas[0] === "e4");
    opcionesDe($("ctx-d4"), (l) => l.color === "b" && l.jugadas[0] === "d4");
    if (eloEnLinea && !$("ctx-elo").value) {
      $("ctx-elo").value = String(eloEnLinea);
      $("ctx-elo-ayuda").textContent = "Lo pusimos con el de tus partidas en línea; cámbialo si tienes otro.";
    }
    irA("contexto-view", $("contexto-titulo"));
    anunciar("Terminaste las posiciones. Ahora, cuatro preguntas sobre cómo juegas.");
  }
  // Las partidas siguen un rato más mientras contesta «Cómo juegas»; si al
  // enviar todavía no terminan, se espera hasta ESPERA_PARTIDAS y se usa lo hallado.
  function pararPartidasLuego() { setTimeout(() => { pararPartidas = true; }, ESPERA_PARTIDAS); }

  async function enviarContexto(ev) {
    ev.preventDefault();
    const valor = (n) => { const x = document.querySelector('input[name="' + n + '"]:checked'); return x ? x.value : null; };
    const ritmo = valor("ritmo"), estudio = valor("estudio");
    const eloTxt = $("ctx-elo").value.trim();
    const elo = eloTxt ? Math.round(+eloTxt) : null;
    const err = $("ctx-error");
    const falta = [!ritmo && "en qué ritmo juegas", !estudio && "cuánto estudias"].filter(Boolean);
    if (falta.length || (elo != null && !(elo >= 400 && elo <= 3000))) {
      err.textContent = falta.length ? "Falta decir " + falta.join(" y ") + "." : "El Elo va entre 400 y 3000.";
      err.classList.remove("hidden");
      return;
    }
    err.classList.add("hidden");
    const contexto = { ritmo, estudio, elo, actual: { blancas: $("ctx-blancas").value || null, e4: $("ctx-e4").value || null, d4: $("ctx-d4").value || null } };
    if (rendimiento && rendimiento.n) contexto.rendimiento = rendimiento;
    if (B.FORMAS[prueba.version] && B.FORMAS[prueba.version].inicial) contexto.inicial = true;
    const btn = $("ctx-btn");
    btn.disabled = true;
    if (midiendo) {
      btn.textContent = "Terminando de revisar tus partidas…";
      await Promise.race([midiendo, new Promise((r) => setTimeout(r, ESPERA_PARTIDAS))]);
      pararPartidas = true;
    }
    btn.textContent = "Ver mi estilo y mis aperturas →";
    btn.disabled = false;
    const resultado = prueba.perfil();
    const recomendacion = A.recomendar(resultado, contexto);
    mostrarResultado(resultado, recomendacion, "Guardando el resultado…");
    const fila = { alumno_id: perfil.id, version: prueba.version, respuestas: prueba.respuestas, contexto,
      partidas: momentos.length ? momentos.slice(0, 300) : null, recomendacion };
    const { data, error } = await sb.from("estilo_pruebas").insert(fila).select("id, version, respuestas, contexto, partidas, recomendacion, created_at").maybeSingle();
    $("r-guardado").textContent = error ? "No se pudo guardar en tu cuenta; el resultado quedó solo en esta pantalla." : "Resultado guardado en tu cuenta: tu profe también lo ve.";
    if (!error && data) ultima = data;
  }

  /* «Agregar a Mi repertorio»: la línea recomendada entra a su repertorio.
     La base dice si choca con otra línea suya (repertorio_coherente) o si ya
     estaba (la clave única). */
  async function agregarAlRepertorio(op, color) {
    const { error } = await sb.from("repertorio").insert({ alumno_id: perfil.id, color, nombre: op.nombre, jugadas: op.jugadas });
    if (!error) return "Listo: está en Mi repertorio.";
    if (error.code === "23505") return "Ya estaba en Mi repertorio.";
    if (error.code === "23514" && error.message) return error.message;
    throw error;
  }

  /* ---------------- El resultado ---------------- */
  /* `fecha`: la de la prueba (la de hoy si se acaba de hacer), para la ficha. */
  function mostrarResultado(resultado, recomendacion, guardado, fecha) {
    irA("resultado-view", $("r-titulo"));
    $("r-guardado").textContent = guardado || "";
    const caja = $("r-perfil");
    caja.textContent = "";
    EstiloTarjeta.pintarPerfil(caja, resultado, { tu: true });
    const rec = $("r-recomendacion");
    rec.textContent = "";
    EstiloTarjeta.pintarRecomendacion(rec, recomendacion, { tu: true, base: "../", repertorio: agregarAlRepertorio });
    if (recomendacion) rec.appendChild(EstiloTarjeta.botonFicha({ created_at: fecha || new Date().toISOString(), recomendacion }, resultado,
      { nombre: perfil && perfil.full_name, tu: true }));
    anunciar("Listo. " + resultado.lista.map((e) => B.EJES[e].nombre + ": " + resultado[e].etiqueta.texto).join(". ") + ".");
  }

  /* ---------------- Portada ---------------- */
  function pintarPrevio() {
    const caja = $("previo");
    caja.textContent = "";
    if (!ultima) { caja.classList.add("hidden"); return; }
    caja.classList.remove("hidden");
    const h = document.createElement("h2");
    h.className = "font-serif text-lg font-bold text-brand-800 dark:text-white mb-1";
    h.textContent = "Tu última prueba";
    const pf = P.medir(ultima.respuestas, ultima.partidas, ultima.version, opiniones);
    const p = document.createElement("p");
    p.className = "text-sm text-brand-500 dark:text-brand-300 mb-3";
    p.textContent = "El " + HoraCR.fecha(ultima.created_at, { day: "numeric", month: "long", year: "numeric" }) + ": " + pf.lista.map((e) => pf[e].etiqueta.texto.toLowerCase()).join(" · ") + ".";
    const botones = document.createElement("div");
    botones.className = "flex flex-wrap gap-2";
    const ver = document.createElement("button");
    ver.type = "button";
    ver.className = "border border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-200 font-semibold px-4 py-2 rounded-lg text-sm hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    ver.textContent = "Ver el resultado completo";
    ver.addEventListener("click", () => mostrarResultado(pf, ultima.recomendacion, "Prueba del " + HoraCR.fecha(ultima.created_at, { day: "numeric", month: "long", year: "numeric" }) + ".", ultima.created_at));
    botones.appendChild(ver);
    const seguimiento = document.createElement("div");
    seguimiento.className = "mt-3";
    if (ultima.recomendacion) {
      const seguir = document.createElement("button");
      seguir.type = "button";
      seguir.className = ver.className;
      seguir.textContent = "¿Cómo me fue con la apertura recomendada?";
      seguir.setAttribute("data-estilo-seguir", "");
      seguir.addEventListener("click", async () => {
        seguir.disabled = true;
        try { await EstiloTarjeta.seguir(seguimiento, { sb, alumnoId: perfil.id, recomendacion: ultima.recomendacion, desde: ultima.created_at, tu: true }); }
        catch (e) { seguimiento.textContent = "No se pudo: " + (e && e.message ? e.message : e); }
        seguir.disabled = false;
      });
      botones.appendChild(seguir);
    }
    caja.append(h, p, botones, seguimiento);
  }

  /* ---------------- Arranque ---------------- */
  $("start-btn").addEventListener("click", empezar);
  $("next-btn").addEventListener("click", responder);
  $("contexto-form").addEventListener("submit", enviarContexto);
  $("repeat-btn").addEventListener("click", () => { irA("intro-view", $("intro-titulo")); pintarPrevio(); });

  async function init() {
    let sesion = null;
    try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
    if (!sesion) { window.location.href = "../login.html?next=" + encodeURIComponent("entreno/estilo.html"); return; }
    const [{ data: yo }, { data: an }, { data: previas }, { data: ops }] = await Promise.all([
      sb.from("profiles").select("id, full_name").eq("id", sesion.user.id).maybeSingle(),
      sb.from("analisis_partidas_alumno").select("lichess, chesscom, elo:analisis->elo").eq("alumno_id", sesion.user.id).maybeSingle(),
      sb.from("estilo_pruebas").select("id, version, respuestas, contexto, partidas, recomendacion, created_at")
        .eq("alumno_id", sesion.user.id).order("created_at", { ascending: false }).range(0, 0),
      sb.from("estilo_opiniones").select("eje, opinion").eq("alumno_id", sesion.user.id),
    ]);
    opiniones = ops || [];
    perfil = yo || { id: sesion.user.id };
    if (an && (an.lichess || an.chesscom)) {
      cuentas = { lichess: an.lichess, chesscom: an.chesscom };
      $("partidas-opcion").classList.remove("hidden");
      $("partidas-cuentas").textContent = "Mientras contestas, tu computadora busca en tus partidas de "
        + [an.lichess && "Lichess (" + an.lichess + ")", an.chesscom && "Chess.com (" + an.chesscom + ")"].filter(Boolean).join(" y ")
        + " los momentos en que tuviste dos jugadas igual de buenas, y anota cuál elegiste. Tarda un par de minutos.";
      eloEnLinea = an.elo && an.elo.reciente ? an.elo.reciente : null;
      // Con menos de 1200 en línea, se le sugiere la corta (la puede cambiar).
      if (eloEnLinea && eloEnLinea < 1200) $("forma-corta").checked = true;
    }
    ultima = previas && previas[0] ? previas[0] : null;
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    pintarPrevio();
  }
  init();
})();
