/* ===== Ajedrez Integral — La muestra de la prueba de estilo (estilo-muestra.html) =====
 *
 * La prueba de estilo, en chico, para quien todavía no tiene cuenta: doce
 * posiciones (tres por eje), sin guardar nada, y al final hacia dónde se
 * inclina y tres aperturas con poca teoría que podrían quedarle. Invita a la
 * prueba completa de la Academia.
 *
 *   - Las posiciones son las tres MÁS SIMPLES de cada eje entre las de la
 *     versión corta (FORMAS[3].posiciones, ordenadas por
 *     EstiloMedidas.complejidad y a igualdad por id), una de cada eje por
 *     turno. Siempre las mismas: no hay a quién guardarle cuáles vio.
 *   - El resultado se calcula como la prueba (EstiloPerfil.medir, regla de la
 *     versión corta), pero con tres respuestas por eje casi nunca alcanza
 *     para afirmar nada con el margen de la prueba. Por eso se dice lo que
 *     ELIGIÓ («atacar en 3 de 3») y que es una pista, no un resultado; la
 *     etiqueta con margen es de la prueba completa.
 *   - Las aperturas: EstiloAperturas.recomendar con lo de quien empieza
 *     (`inicial`, teoría de nivel 1), ritmo rápidas y poco estudio.
 *   - No se manda nada a ninguna parte: no lleva el cliente de la base.
 *
 *   EstiloMuestra.posiciones() → los 12 ítems, en orden
 *   EstiloMuestra.resultado(respuestas) → { perfil, conteo, recomendacion }
 *
 * Ver «La muestra sin cuenta» en docs/decisiones/entrenamiento.md. Lo
 * comprueba herramientas/verificar-estilo-muestra.js.
 */
(function () {
  "use strict";

  const POR_EJE = 3;
  const VERSION = 3;   // se lee con la regla de la versión corta
  const CONTEXTO = { inicial: true, ritmo: "rapidas", estudio: "poco", elo: null, actual: {} };

  function posiciones() {
    const B = window.EstiloItems, M = window.EstiloMedidas;
    const corta = new Set(B.FORMAS[3].posiciones);
    const porEje = B.FORMAS[3].ejes.map((e) => B.ITEMS.filter((i) => i.eje === e && corta.has(i.id))
      .map((i) => ({ i, c: M.complejidad(Chess, i.fen) }))
      .sort((x, y) => x.c - y.c || (x.i.id < y.i.id ? -1 : 1))
      .slice(0, POR_EJE).map((x) => x.i));
    const out = [];
    for (let k = 0; k < POR_EJE; k++) for (const lista of porEje) if (lista[k]) out.push(lista[k]);
    return out;
  }

  function resultado(respuestas) {
    const B = window.EstiloItems, M = window.EstiloMedidas;
    const perfil = EstiloPerfil.medir(respuestas, null, VERSION);
    const porId = new Map(B.ITEMS.map((i) => [i.id, i]));
    const conteo = {};
    for (const e of perfil.lista) conteo[e] = { n: 0, primero: 0 };
    for (const r of respuestas) {
      const it = porId.get(r.id);
      if (!it || !conteo[it.eje]) continue;
      conteo[it.eje].n++;
      if (it[r.eleccion].polo === M.POLOS[it.eje][0]) conteo[it.eje].primero++;
    }
    return { perfil, conteo, recomendacion: EstiloAperturas.recomendar(perfil, CONTEXTO) };
  }

  const api = { posiciones, resultado, POR_EJE };
  window.EstiloMuestra = api;

  /* ---------------- La página ---------------- */
  const $ = (id) => document.getElementById(id);
  if (!$("start-btn")) return;

  const NOMBRE = { k: "el rey", q: "la dama", r: "la torre", b: "el alfil", n: "el caballo", p: "el peón" };
  const sanEs = (san) => (window.PreparacionLineas ? PreparacionLineas.sanEs(san) : san);
  let lista = [], k = 0, respuestas = [], juego = null, comandos = null, teclado = null;

  function irA(vista, foco) {
    ["intro-view", "pregunta-view", "resultado-view"].forEach((id) => $(id).classList.toggle("hidden", id !== vista));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (foco) { try { foco.focus({ preventScroll: true }); } catch (e) {} }
  }
  function anunciar(texto) {
    const r = $("mu-anuncio");
    if (r) { r.textContent = ""; setTimeout(() => { r.textContent = texto; }, 40); }
    if (window.BlindNotation && BlindNotation.speak) BlindNotation.speak(texto);
  }
  /* «Cf3 (el caballo de g1 a f3)»: la jugada escrita y dicha. */
  function jugadaDicha(item, j) {
    const m = new Chess(item.fen).move({ from: j.uci.slice(0, 2), to: j.uci.slice(2, 4), promotion: j.uci[4] });
    if (!m) return sanEs(j.san);
    const como = m.flags.includes("k") || m.flags.includes("q") ? "el enroque" : `${NOMBRE[m.piece]} de ${m.from} a ${m.to}${m.captured ? ", comiendo" : ""}`;
    return `${sanEs(j.san)} (${como})`;
  }
  const preguntaDicha = (item) => `Posición ${k + 1} de ${lista.length}. ${item.fen.split(" ")[1] === "w" ? "Juegan las blancas" : "Juegan las negras"}. ¿Cuál jugarías? Jugada A: ${jugadaDicha(item, item.a)}. Jugada B: ${jugadaDicha(item, item.b)}.`;

  function empezar() {
    lista = posiciones();
    k = 0;
    respuestas = [];
    irA("pregunta-view", $("q-text"));
    pintar();
  }

  function pintar() {
    const item = lista[k];
    juego = new Chess(item.fen);
    $("q-counter").textContent = `Posición ${k + 1} de ${lista.length}`;
    $("q-bar").style.width = (k / lista.length) * 100 + "%";
    $("q-turno").textContent = item.fen.split(" ")[1] === "w" ? "Juegan las blancas" : "Juegan las negras";
    window.ExampleBoard.render($("q-board"), juego);
    if (window.TableroAccesible) {
      teclado = TableroAccesible.montar($("q-board"), { nombre: "Tablero de la posición", juego: () => juego, cuadro: () => (comandos ? comandos.input : null) });
      if (teclado) teclado.refrescar();
    }
    const caja = $("q-options");
    caja.textContent = "";
    [["a", "A"], ["b", "B"]].forEach(([e, letra]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "w-full text-left px-4 py-3 rounded-xl border-2 border-brand-100 dark:border-brand-700 hover:border-accent-400 text-brand-700 dark:text-brand-200 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
      b.textContent = `Jugada ${letra}: ${jugadaDicha(item, item[e])}`;
      b.dataset.eleccion = e;
      b.addEventListener("click", () => elegir(e));
      caja.appendChild(b);
    });
    prepararComandos(item);
    if (comandos && window.CuadroComandos && CuadroComandos.activo()) comandos.decir(preguntaDicha(item));
  }

  function elegir(e) {
    respuestas.push({ id: lista[k].id, eleccion: e, seguridad: 3, ms: 0 });
    k++;
    if (k < lista.length) { pintar(); $("q-text").focus({ preventScroll: true }); return; }
    mostrar();
  }

  function prepararComandos(item) {
    if (!window.CuadroComandos) return;
    if (!comandos) {
      comandos = CuadroComandos.montar($("q-comandos"), {
        juego: () => juego, tablero: () => teclado,
        onEnviar: (texto, api) => {
          const t = CuadroComandos.normalizar(texto);
          if (/^(repetir|repite|pregunta|la pregunta)$/.test(t)) { api.limpiar(); api.decir(preguntaDicha(lista[k])); return; }
          const m = t.match(/^(?:jugada\s+)?([ab])$/);
          if (m) { api.limpiar(); elegir(m[1]); return; }
          api.decir("Escribe A o B para elegir, o «repetir» para volver a oír la pregunta.");
        },
      });
    }
    comandos.posicion(juego);
    comandos.etiqueta("Escribe A o B");
    comandos.ayuda("«repetir» vuelve a decir la pregunta. También puedes preguntar por la posición: «caballos», «qué hay en e4».");
  }

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function mostrar() {
    const B = window.EstiloItems, M = window.EstiloMedidas;
    const r = resultado(respuestas);
    const ul = $("r-ejes");
    ul.textContent = "";
    for (const e of r.perfil.lista) {
      const [uno, otro] = M.POLOS[e];
      const c = r.conteo[e];
      const polos = B.EJES[e].polos;
      const li = el("li", "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4");
      li.setAttribute("data-eje", e);
      const hacia = c.primero * 2 > c.n ? uno : c.primero * 2 < c.n ? otro : null;
      li.appendChild(el("p", "font-semibold text-brand-800 dark:text-white text-sm", B.EJES[e].nombre));
      li.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200",
        (hacia ? "Te inclinas a: " + polos[hacia].toLowerCase() : "Mitad y mitad")
        + ` (elegiste «${polos[uno].toLowerCase()}» en ${c.primero} de ${c.n}).`));
      ul.appendChild(li);
    }
    const caja = $("r-aperturas");
    caja.textContent = "";
    for (const g of ["blancas", "e4", "d4"]) {
      const rec = r.recomendacion[g];
      if (!rec || !rec.principal) continue;
      const card = el("div", "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4");
      card.setAttribute("data-grupo", g);
      card.appendChild(el("p", "font-serif font-bold text-brand-800 dark:text-white", rec.titulo));
      card.appendChild(el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200 mt-1", rec.principal.nombre));
      card.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300", PreparacionLineas.lineaEs(rec.principal.jugadas)));
      if (rec.principal.porque && rec.principal.porque[0]) card.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 mt-1", rec.principal.porque[0]));
      caja.appendChild(card);
    }
    irA("resultado-view", $("r-titulo"));
    anunciar("Listo. " + r.perfil.lista.map((e) => ul.querySelector('[data-eje="' + e + '"]').textContent).join(" "));
  }

  $("start-btn").addEventListener("click", empezar);
  $("repeat-btn").addEventListener("click", () => irA("intro-view", $("intro-titulo")));
})();
