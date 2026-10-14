/* Preparación de rivales: su árbol de aperturas, para recorrerlo a mano.
 *
 * Lo que hace OpeningTree, sin salir de la plataforma: un tablero y, al lado,
 * las jugadas que se hicieron desde esa posición en las partidas del rival,
 * con cuántas veces y cómo le fue a él después de cada una. Se toca una
 * jugada y se avanza; con ⏮ ◀ ▶ ⏭ del tablero (js/visor-linea.js) se vuelve.
 *
 * Los datos son `r.explorador` del análisis (exploradorDe en
 * js/preparacion-analisis.js): por color del rival, la huella de cada
 * posición con sus jugadas [jugada, partidas, ganadas, tablas, perdidas].
 * Todo pasa en la computadora: no se le pide nada a nadie. Un análisis
 * guardado antes no lo trae: se dice, en vez de mostrar un árbol vacío.
 *
 * Uso:
 *     const arbol = PreparacionArbol.montar(caja, { evaluar });   // evaluar: opcional, Stockfish
 *     arbol.cargar(resultado);
 *
 * La barra de cada jugada es solo ayuda a la vista (aria-hidden): el dato va
 * escrito al lado. Sus tres colores se distinguen por luminancia, no por el
 * tono (ver «El árbol de aperturas, dentro de la plataforma»).
 */
window.PreparacionArbol = (function () {
  "use strict";

  const Libro = () => window.PreparacionLibro;
  const Visor = () => window.VisorLinea;

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  const pct = (x, n) => (n ? Math.round((100 * x) / n) : 0);

  // «2.», «2…»: el número de la jugada que se hace después de `ply` medias jugadas.
  function numero(ply) { return Math.floor(ply / 2) + 1 + (ply % 2 === 0 ? "." : "…"); }

  function montar(caja, cfg) {
    const o = cfg || {};
    let resultado = null;
    let color = "w";          // el color que lleva ÉL
    let sec = [];             // la línea recorrida (en SAN)
    let visor = null;

    caja.textContent = "";
    const sinArbol = el("p", "text-sm text-brand-600 dark:text-brand-200");
    sinArbol.hidden = true;
    const cuerpo = el("div");

    const lado = el("fieldset", "mb-4");
    lado.appendChild(el("legend", "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Sus partidas"));
    const opciones = el("div", "flex flex-wrap gap-x-5 gap-y-1 py-1 text-sm");
    const radios = {};
    [["w", "Con blancas (tú llevas negras)"], ["b", "Con negras (tú llevas blancas)"]].forEach(([v, texto]) => {
      const l = el("label", "inline-flex items-center gap-2");
      const r = el("input", "accent-accent-500");
      r.type = "radio";
      r.name = "arbol-color";
      r.value = v;
      r.id = "arbol-color-" + v;
      r.addEventListener("change", () => { if (r.checked) cambiarColor(v); });
      radios[v] = r;
      l.appendChild(r);
      l.appendChild(document.createTextNode(texto));
      opciones.appendChild(l);
    });
    lado.appendChild(opciones);

    const grilla = el("div", "grid lg:grid-cols-2 gap-6 items-start");
    const tableroCaja = el("div", "min-w-0");
    tableroCaja.id = "arbol-visor";
    const jugadasCaja = el("div", "min-w-0");
    const donde = el("p", "text-sm font-semibold text-brand-800 dark:text-white mb-1");
    donde.id = "arbol-donde";
    donde.tabIndex = -1;
    const cuantas = el("p", "text-sm text-brand-500 dark:text-brand-300 mb-3");
    cuantas.id = "arbol-cuantas";
    const tablaCaja = el("div");
    tablaCaja.id = "arbol-jugadas";
    [donde, cuantas, tablaCaja].forEach((x) => jugadasCaja.appendChild(x));
    grilla.appendChild(tableroCaja);
    grilla.appendChild(jugadasCaja);
    [lado, grilla].forEach((x) => cuerpo.appendChild(x));
    [sinArbol, cuerpo].forEach((x) => caja.appendChild(x));

    function arbolDe(c) { return (resultado && resultado.explorador && resultado.explorador[c]) || null; }

    // Las jugadas desde la posición a la que llevan las `previas`, o [].
    function jugadasEn(previas) {
      const arbol = arbolDe(color);
      if (!arbol) return [];
      const g = new Chess();
      for (const san of previas) if (!g.move(san, { sloppy: true })) return [];
      return arbol[Libro().huella(Libro().claveDeFen(g.fen()))] || [];
    }

    function barra(g, t, p, n) {
      const b = el("span", "arbol-barra");
      b.setAttribute("aria-hidden", "true");
      [["arbol-gana", g], ["arbol-tablas", t], ["arbol-pierde", p]].forEach(([clase, x]) => {
        if (!x) return;
        const s = el("span", clase);
        s.style.width = (100 * x) / n + "%";
        b.appendChild(s);
      });
      return b;
    }

    function pintarJugadas(indice) {
      const previas = sec.slice(0, indice);
      const lista = jugadasEn(previas);
      const total = lista.reduce((s, x) => s + x[1], 0);
      const suya = (previas.length % 2 === 0) === (color === "w");
      donde.textContent = (previas.length ? "Después de " + window.PreparacionLineas.lineaEs(previas) : "Posición de salida") +
        ": " + (suya ? "le toca a él." : "le toca a su rival.");
      tablaCaja.textContent = "";
      if (!lista.length) {
        cuantas.textContent = "";
        tablaCaja.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300",
          "Desde aquí no sigue ninguna línea que se repita en sus partidas: el árbol guarda las posiciones a las que llegaron dos partidas o más. Vuelve atrás con ◀ para elegir otra jugada."));
        return;
      }
      cuantas.textContent = total.toLocaleString("es-CR") + (total === 1 ? " partida sigue" : " partidas siguen") + " desde aquí. " +
        (suya ? "Estas son sus jugadas." : "Estas son las jugadas de sus rivales.") + " Toca una para avanzar.";
      const filas = lista.map(([san, n, g, t, p]) => {
        const b = el("button", "arbol-jugada font-mono font-semibold whitespace-nowrap px-2 py-1 rounded-md bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
          numero(previas.length) + " " + Visor().aEspanol(san));
        b.type = "button";
        b.dataset.san = san;
        b.addEventListener("click", () => avanzar(previas, san));
        const como = el("span", "flex flex-wrap items-center gap-2");
        como.appendChild(barra(g, t, p, n));
        como.appendChild(el("span", "text-xs text-brand-600 dark:text-brand-200",
          "gana " + pct(g, n) + " % · tablas " + pct(t, n) + " % · pierde " + pct(p, n) + " %"));
        return [b, n.toLocaleString("es-CR") + " (" + pct(n, total) + " %)", como, pct(g + t / 2, n) + " %"];
      });
      tablaCaja.appendChild(window.PreparacionPintar.tabla("Jugadas desde esta posición en las partidas del rival",
        [{ titulo: "Jugada" }, { titulo: "Partidas", num: true }, { titulo: "Cómo le fue a él" }, { titulo: "Saca", num: true }], filas));
    }

    function avanzar(previas, san) {
      sec = previas.concat(san);
      visor.cargar(sec, { orientacion: color === "w" ? "b" : "w", en: sec.length });
      // La tabla se volvió a pintar: el foco va a la primera jugada nueva, o
      // a dónde está, si ya no hay jugadas.
      const primera = tablaCaja.querySelector("button");
      (primera || donde).focus();
    }

    function cambiarColor(c) {
      color = c;
      sec = [];
      visor.cargar([], { orientacion: color === "w" ? "b" : "w", en: 0 });
    }

    function cargar(r) {
      resultado = r;
      const hay = !!(r && r.explorador && (r.explorador.w || r.explorador.b));
      sinArbol.hidden = hay;
      cuerpo.hidden = !hay;
      if (!hay) {
        sinArbol.textContent = "Este análisis se guardó antes de que existiera el árbol. Para recorrerlo, vuelve a bajar o a cargar sus partidas.";
        return;
      }
      if (!visor) {
        visor = Visor().montar(tableroCaja, {
          nombre: "Tablero del árbol de aperturas",
          evaluar: o.evaluar || null,
          alCambiar: (i) => pintarJugadas(i),
        });
      }
      // Arranca con el color con que más partidas tiene.
      const pc = r.porColor || {};
      const c = ((pc.b && pc.b.n) || 0) > ((pc.w && pc.w.n) || 0) ? "b" : "w";
      radios[c].checked = true;
      cambiarColor(c);
    }

    return { cargar, get linea() { return sec.slice(); } };
  }

  return { montar };
})();
