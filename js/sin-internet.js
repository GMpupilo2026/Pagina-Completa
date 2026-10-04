/* El código de entreno/sin-internet.html: «Ejercicios sin internet».
 *
 * Con señal, el alumno guarda una tanda de problemas en el celular (el banco de
 * Ejercicios por tema: partidas reales de Lichess, ya comprobadas) y la página
 * se guarda entera en la caché del aparato. Sin señal, la abre y la resuelve;
 * cada resultado queda en una cola de este aparato y se sube solo cuando
 * vuelve la conexión, con la hora en que se resolvió.
 *
 * - La página se guarda en su PROPIA caché («ajedrez-integral-sin-red»), que
 *   el service worker no borra al cambiar de versión (sw.js). Se vuelve a
 *   guardar cada vez que se abre con señal: así no queda un HTML de un día con
 *   el CSS de otro, que es la falla que sw.js evita sirviendo la red primero.
 * - Lo que se sube es lo mismo que sube Ejercicios por tema
 *   (training_progress, actividad «temas», con cómo salió), más
 *   `sin_internet_id`: un índice único en la base hace que subir dos veces el
 *   mismo resultado (la respuesta se perdió con la señal) no lo cuente dos
 *   veces. La hora la acota la base: hasta 7 días atrás, nunca adelante.
 * - Lo que costó entra en la cola de repaso de Ejercicios por tema
 *   (RepasoFallados), igual que si lo hubiera resuelto allá.
 * Ver «Ejercicios sin internet» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";

  const CLAVE_TANDA = "sin_internet_tanda_v1";
  const CLAVE_COLA = "sin_internet_resultados_v1";
  const CACHE = "ajedrez-integral-sin-red";
  const NIVELES = {
    facil: { nombre: "Fácil", desde: 0, hasta: 1199 },
    medio: { nombre: "Media", desde: 1200, hasta: 1599 },
    dificil: { nombre: "Difícil", desde: 1600, hasta: 2100 },
  };

  const $ = (id) => document.getElementById(id);
  const leer = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; } catch (e) { return def; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
  const enLinea = () => navigator.onLine !== false;
  const nuevoId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
    : "x" + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const avisar = (texto, tipo) => { if (window.Avisos) Avisos.avisar(texto, { tipo: tipo || "ok" }); };

  let tanda = null;          // { creada, nivel, ejercicios: [...], i, hechos: [{ id, limpio }] }
  let juego = null, paso = 0, orientacion = "w", seleccion = null, ultima = null, marcas = null;
  let fallo = false, conPista = false, bloqueado = false;
  let teclado = null, comandos = null, subiendo = false;

  /* ---------------- elegir y guardar ---------------- */
  function elegir(puzzles, nivel, cuantos, azar) {
    const n = NIVELES[nivel];
    const r = azar || Math.random;
    const candidatos = Object.keys(puzzles).filter((id) => {
      const p = puzzles[id];
      return p && p.fen && Array.isArray(p.solution) && p.solution.length && typeof p.rating === "number"
        && p.rating >= n.desde && p.rating <= n.hasta;
    });
    const salida = [];
    while (salida.length < cuantos && candidatos.length) {
      const id = candidatos.splice(Math.floor(r() * candidatos.length), 1)[0];
      const p = puzzles[id];
      salida.push({ id, fen: p.fen, solution: p.solution, rating: p.rating, mate: !!p.mate });
    }
    return salida;
  }

  // Todo lo que la página necesita para abrir sin red: ella misma (con y sin
  // .html: Cloudflare redirige una a la otra) y sus scripts y hojas.
  function archivosDeLaPagina() {
    const urls = new Set();
    document.querySelectorAll("script[src], link[rel='stylesheet'][href]").forEach((n) => {
      const u = new URL(n.getAttribute("src") || n.getAttribute("href"), location.href);
      if (u.origin === location.origin) urls.add(u.pathname);
    });
    return [...urls];
  }

  async function guardarPagina() {
    if (!window.caches) return false;
    try {
      const cache = await caches.open(CACHE);
      let todo = true;
      // La página, una vez, guardada con los dos nombres.
      const sinHtml = location.pathname.replace(/\.html$/, "");
      try {
        const r = await fetch(sinHtml + ".html", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const cuerpo = await r.blob();
        await cache.put(sinHtml + ".html", new Response(cuerpo, { status: 200, headers: r.headers }));
        await cache.put(sinHtml, new Response(cuerpo, { status: 200, headers: r.headers }));
      } catch (e) { todo = false; }
      await Promise.all(archivosDeLaPagina().map(async (u) => {
        try {
          const r = await fetch(u, { cache: "no-store" });
          if (!r.ok) { todo = false; return; }
          // Se guarda sin la marca de «redirigida»: una respuesta así no sirve
          // para abrir una página (Chrome la cambia por su error de red).
          await cache.put(u, new Response(await r.blob(), { status: 200, headers: r.headers }));
        } catch (e) { todo = false; }
      }));
      return todo;
    } catch (e) { return false; }
  }

  async function prepararTanda() {
    const estado = $("preparar-estado");
    if (!enLinea()) { estado.textContent = "Para preparar una tanda hace falta señal. La que ya tienes guardada sí funciona sin internet."; return; }
    const quedan = tanda ? tanda.ejercicios.length - tanda.hechos.length : 0;
    if (quedan > 0 && !(await Avisos.confirmar(
      `Tu tanda guardada tiene ${plural(quedan, "ejercicio sin hacer", "ejercicios sin hacer")}. La nueva la reemplaza (lo que ya resolviste no se pierde).`,
      { titulo: "¿Cambiar la tanda?", aceptar: "Sí, guardar una nueva" }))) return;
    const boton = $("guardar-btn");
    boton.disabled = true;
    estado.textContent = "Bajando los ejercicios…";
    try {
      const r = await fetch("data/temas.json");
      if (!r.ok) throw new Error("temas.json " + r.status);
      const banco = (await r.json()).puzzles;
      const nivel = $("nivel").value;
      const ejercicios = elegir(banco, nivel, Number($("cuantos").value) || 20);
      if (!ejercicios.length) throw new Error("no hay ejercicios de esa dificultad");
      tanda = { creada: new Date().toISOString(), nivel, ejercicios, i: 0, hechos: [] };
      if (!escribir(CLAVE_TANDA, tanda)) throw new Error("este navegador no deja guardar datos");
      estado.textContent = "Guardando la página en el celular…";
      const ok = await guardarPagina();
      estado.textContent = ok
        ? `Lista: ${plural(ejercicios.length, "ejercicio guardado", "ejercicios guardados")} (${NIVELES[nivel].nombre}). Ya puedes abrir esta página sin internet, también desde la app.`
        : `Quedaron ${plural(ejercicios.length, "ejercicio guardado", "ejercicios guardados")}, pero este navegador no dejó guardar la página: sin señal puede que no abra. Instala la app o prueba con Chrome.`;
      pintarTanda(true);
    } catch (e) {
      estado.textContent = "No se pudo preparar la tanda: " + (e && e.message ? e.message : e) + ". Vuelve a intentarlo con buena señal.";
    } finally {
      boton.disabled = false;
    }
  }

  /* ---------------- resolver ---------------- */
  const actual = () => (tanda && tanda.i < tanda.ejercicios.length ? tanda.ejercicios[tanda.i] : null);
  const dicha = (san) => (document.documentElement.classList.contains("adaptive-mode") && window.BlindNotation
    ? BlindNotation.sanSpoken(san) : EjercicioTablero.jugadaEs(san));

  function decir(texto, clase) {
    const e = $("round-status");
    e.textContent = texto;
    e.className = "round-status" + (clase ? " " + clase : "");
    if (comandos) comandos.decir(texto);
  }

  function dibujar() {
    EjercicioTablero.dibujar($("board"), {
      juego, orientacion, seleccionada: seleccion, ultima, marcas,
      alTocar: tocar,
    });
    if (window.Coordenadas) Coordenadas.aplicar($("board"));
    if (!teclado && window.TableroAccesible) teclado = TableroAccesible.montar($("board"), { nombre: "Tablero del ejercicio", juego: () => juego });
    if (!comandos && window.CuadroComandos) {
      comandos = CuadroComandos.montar($("q-comandos"), {
        etiqueta: "Escribe tu jugada, o una pregunta sobre la posición",
        juego: () => juego, tablero: () => teclado, onEnviar: escrita,
      });
      comandos.ayuda('Jugada: "Cf3", "Dxh7+", "e2 e4". También: "pista", "solución", "siguiente".');
    }
  }

  function empezarEjercicio() {
    const e = actual();
    pintarAvance();
    if (!e) { terminarTanda(); return; }
    $("jugando").classList.remove("hidden");
    $("terminada").classList.add("hidden");
    juego = new Chess(e.fen);
    orientacion = juego.turn();
    paso = 0; seleccion = null; ultima = null; marcas = null;
    fallo = false; conPista = false; bloqueado = false;
    $("pista-btn").disabled = false;
    $("solucion-btn").disabled = false;
    $("siguiente-btn").classList.add("hidden");
    const color = orientacion === "w" ? "blancas" : "negras";
    $("turn-banner").textContent = `Juegan ${color} — ${e.mate ? "encuentra el mate" : "encuentra la mejor jugada"}`;
    dibujar();
    decir(`Juegan ${color}: ${e.mate ? "encuentra el mate" : "encuentra la mejor jugada"}.`);
  }

  function tocar(casilla) {
    if (bloqueado) return;
    const pieza = juego.get(casilla);
    if (!seleccion) {
      if (pieza && pieza.color === juego.turn()) { seleccion = casilla; dibujar(); EjercicioTablero.marcarDestinos($("board"), juego, casilla); }
      return;
    }
    if (casilla === seleccion) { seleccion = null; dibujar(); return; }
    const posibles = juego.moves({ square: seleccion, verbose: true }).filter((m) => m.to === casilla);
    if (!posibles.length) {
      if (pieza && pieza.color === juego.turn()) { seleccion = casilla; dibujar(); EjercicioTablero.marcarDestinos($("board"), juego, casilla); }
      else { seleccion = null; dibujar(); EjercicioTablero.destello(document.querySelector('#board [data-square="' + casilla + '"]')); }
      return;
    }
    const desde = seleccion;
    seleccion = null;
    EjercicioTablero.jugarCoronando(juego, desde, casilla, (p) => jugar(desde, casilla, p));
  }

  function escrita(texto, api) {
    const accion = EjercicioTablero.accionEscrita(texto);
    const t = CuadroComandos.normalizar(texto);
    if (/^(pista|dame una pista)$/.test(t)) { api.limpiar(); pista(); return; }
    if (accion === "solucion") { api.limpiar(); solucion(); return; }
    if (accion === "saltar" && !$("siguiente-btn").classList.contains("hidden")) { api.limpiar(); siguiente(); return; }
    if (bloqueado) { api.decir("Ahora no te toca mover."); return; }
    const mv = ComandosTablero.jugadaEscrita(juego, texto);
    if (!mv) { api.decir(ComandosTablero.noSePudoJugar(texto)); return; }
    api.limpiar().decir("");
    jugar(mv.from, mv.to, mv.promotion);
  }

  function jugar(desde, hasta, promocion) {
    const e = actual();
    const hecha = juego.move({ from: desde, to: hasta, promotion: promocion || "q" });
    if (!hecha) { dibujar(); return; }
    if (!EjercicioTablero.esAcierto(juego, hecha, e.solution[paso])) {
      const refuta = EjercicioTablero.refutacion(juego);
      juego.undo();
      fallo = true;
      dibujar();
      EjercicioTablero.destello(document.querySelector('#board [data-square="' + hasta + '"]'));
      decir(ComandosTablero.incorrecta(dicha(hecha.san), refuta || ""), "bad");
      return;
    }
    ultima = { from: hecha.from, to: hecha.to };
    marcas = null;
    paso += 1;
    dibujar();
    if (paso >= e.solution.length || juego.in_checkmate()) { resuelto(); return; }
    bloqueado = true;
    decir("✓ Correcto — el rival responde…", "ok");
    setTimeout(() => {
      const r = juego.move(e.solution[paso], { sloppy: true });
      if (r) ultima = { from: r.from, to: r.to };
      paso += 1;
      bloqueado = false;
      dibujar();
      if (paso >= e.solution.length) { resuelto(); return; }
      decir(`El rival juega ${dicha(r ? r.san : e.solution[paso - 1])}. Sigue buscando la continuación.`);
    }, 600);
  }

  function pista() {
    const e = actual();
    if (!e || bloqueado || paso >= e.solution.length) return;
    conPista = true;
    const prueba = new Chess(juego.fen());
    const m = prueba.move(e.solution[paso], { sloppy: true });
    if (!m) return;
    marcas = { [m.from]: { clase: "hint-from", estado: "pista: la pieza que se mueve" } };
    dibujar();
    decir("Pista: mira la pieza marcada.");
  }

  function solucion() {
    const e = actual();
    if (!e || bloqueado) return;
    fallo = true; conPista = true;
    const resto = [];
    while (paso < e.solution.length) {
      const m = juego.move(e.solution[paso], { sloppy: true });
      if (!m) break;
      resto.push(dicha(m.san));
      ultima = { from: m.from, to: m.to };
      paso += 1;
    }
    marcas = null;
    dibujar();
    resuelto("La solución era: " + resto.join(", ") + ".");
  }

  // Termina el ejercicio: queda en la cola para subir y, si costó, en la de repaso.
  function resuelto(frase) {
    const e = actual();
    bloqueado = true;
    const limpio = !fallo && !conPista;
    const cola = leer(CLAVE_COLA, []);
    cola.push({
      sin_internet_id: nuevoId(), puzzle_id: e.id, rating: e.rating,
      limpio, con_error: fallo, con_pista: conPista, hecho_at: new Date().toISOString(),
    });
    escribir(CLAVE_COLA, cola);
    if (window.RepasoFallados) RepasoFallados.anotar(RepasoFallados.CLAVES.temas, e.id, fallo, conPista, { tema: "mix" });
    tanda.hechos.push({ id: e.id, limpio });
    tanda.i += 1;
    escribir(CLAVE_TANDA, tanda);
    $("pista-btn").disabled = true;
    $("solucion-btn").disabled = true;
    $("siguiente-btn").classList.remove("hidden");
    decir((frase ? frase + " " : "") + (limpio ? "✅ ¡Resuelto sin ayuda!" : "Listo. Este vuelve a tu repaso para practicarlo otra vez.")
      + (enLinea() ? "" : " Se sube cuando vuelva la señal."), limpio ? "ok" : "");
    pintarRed();
    subir();
  }

  function siguiente() { empezarEjercicio(); $("siguiente-btn").blur(); }

  function terminarTanda() {
    $("jugando").classList.add("hidden");
    $("terminada").classList.remove("hidden");
    const bien = tanda.hechos.filter((h) => h.limpio).length;
    $("terminada-texto").textContent = `🏁 Terminaste la tanda: ${bien} de ${tanda.hechos.length} sin ayuda.`
      + (leer(CLAVE_COLA, []).length ? " Los resultados se suben cuando haya señal." : "");
  }

  function pintarAvance() {
    if (!tanda) return;
    const total = tanda.ejercicios.length;
    const bien = tanda.hechos.filter((h) => h.limpio).length;
    $("tanda-avance").textContent = tanda.i < total
      ? `Ejercicio ${tanda.i + 1} de ${total} · ${bien} sin ayuda · guardada el ${HoraCR.fecha(tanda.creada, { day: "numeric", month: "long" })}`
      : `${total} de ${total} hechos · ${bien} sin ayuda`;
  }

  function pintarTanda(enfocar) {
    const hay = !!(tanda && tanda.ejercicios && tanda.ejercicios.length);
    $("tanda").classList.toggle("hidden", !hay);
    if (!hay) return;
    empezarEjercicio();
    if (enfocar) $("tanda-titulo").focus();
  }

  /* ---------------- la señal y la subida ---------------- */
  function pintarRed() {
    const cola = leer(CLAVE_COLA, []);
    $("red").textContent = enLinea()
      ? "📶 Tienes señal."
      : "📴 Sin señal. Lo que resuelvas se guarda en este celular y se sube solo cuando vuelva la conexión.";
    $("pendientes").classList.toggle("hidden", !cola.length);
    $("pendientes-texto").textContent = cola.length
      ? `${plural(cola.length, "resultado espera", "resultados esperan")} para subirse a tu cuenta.`
      : "";
    $("subir-btn").disabled = !enLinea() || subiendo;
    $("guardar-btn").disabled = !enLinea();
  }

  /* Uno por uno, y cada uno sale de la cola solo cuando la base lo aceptó. Si
     ya estaba (se subió y la respuesta se perdió con la señal), el índice
     único de la base lo rechaza y también sale: no se cuenta dos veces. */
  async function subir() {
    if (subiendo || !enLinea()) return;
    const cola = leer(CLAVE_COLA, []);
    if (!cola.length) return;
    subiendo = true;
    pintarRed();
    let yo = null;
    try { const { data } = await sb.auth.getSession(); yo = data && data.session ? data.session.user.id : null; } catch (e) { yo = null; }
    let subidos = 0, problema = null;
    if (yo) {
      for (const r of cola) {
        const { error } = await sb.from("training_progress").insert({
          student_id: yo, activity: "temas", created_at: r.hecho_at,
          detail: { puzzle_id: r.puzzle_id, theme: "mix", rating: r.rating, limpio: r.limpio,
                    con_error: r.con_error, con_pista: r.con_pista, sin_internet_id: r.sin_internet_id },
        });
        if (error && !/duplicate|unique|23505/i.test(String(error.message || error.code || ""))) { problema = error.message || "error"; break; }
        const quedan = leer(CLAVE_COLA, []).filter((x) => x.sin_internet_id !== r.sin_internet_id);
        escribir(CLAVE_COLA, quedan);
        subidos += 1;
      }
    } else problema = "no hay una sesión abierta";
    subiendo = false;
    pintarRed();
    if (subidos) avisar(`Se ${subidos === 1 ? "subió 1 resultado" : "subieron " + subidos + " resultados"} a tu cuenta.`);
    if (problema && leer(CLAVE_COLA, []).length) $("pendientes-texto").textContent += ` No se pudieron subir todavía (${problema}); se vuelve a intentar solo.`;
    // Con señal, la cola de repaso también se sube (js/progreso-usuario.js).
    if (subidos && window.ProgresoUsuario) ProgresoUsuario.init().catch(() => {});
  }

  /* ---------------- arranque ---------------- */
  async function init() {
    let hay = false;
    try { const { data } = await sb.auth.getSession(); hay = !!(data && data.session); } catch (e) { hay = false; }
    if (!hay) {
      $("gate-checking").textContent = "Necesitas iniciar sesión en el sitio para entrar a Entrenamiento. Redirigiendo…";
      if (enLinea()) location.href = "../login.html?next=" + encodeURIComponent("entreno/sin-internet.html");
      return;
    }
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    tanda = leer(CLAVE_TANDA, null);
    pintarRed();
    pintarTanda(false);
    if (enLinea()) {
      if (window.ProgresoUsuario) ProgresoUsuario.init().catch(() => {});
      subir();
      // Con señal, la copia guardada de la página se renueva: sin red se abre
      // la de hoy, no la del día en que se preparó la tanda.
      if (tanda) guardarPagina();
    }
  }

  window.addEventListener("online", () => { pintarRed(); subir(); });
  window.addEventListener("offline", pintarRed);
  $("guardar-btn").addEventListener("click", prepararTanda);
  $("subir-btn").addEventListener("click", subir);
  $("pista-btn").addEventListener("click", pista);
  $("solucion-btn").addEventListener("click", solucion);
  $("siguiente-btn").addEventListener("click", siguiente);
  $("otra-btn").addEventListener("click", () => { $("preparar").scrollIntoView({ behavior: "smooth" }); $("guardar-btn").focus(); });

  window.SinInternet = { elegir, NIVELES, archivosDeLaPagina };
  init();
})();
