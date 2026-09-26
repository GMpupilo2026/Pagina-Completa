/* ===== Ajedrez Integral — Coordenadas por fuera del tablero =====
 *
 * Los tableros de los ejercicios se dibujaban sin coordenadas, y sin ellas el
 * alumno no sabe hacia dónde avanza: si no ve dónde está la fila 1, tampoco sabe
 * para qué lado corren los peones ni cómo leer "e4" cuando el enunciado lo dice.
 *
 * Este ayudante escribe las letras de columna DEBAJO del tablero y los números
 * de fila a su IZQUIERDA, por fuera de las casillas, como en un tablero de
 * madera y como en la clase en vivo (js/clases-board.js, externalCoords). Antes
 * iban dentro de las casillas del borde y tapaban la pieza que estuviera ahí.
 *
 * No toca el tablero: las etiquetas van en una capa aparte (`.coord-marco`),
 * hermana del tablero, que se coloca encima de él midiendo dónde quedó cada
 * casilla. Así ningún código que cuente las casillas o los hijos del tablero ve
 * nada nuevo, ni cambia el tamaño ni la maqueta de ninguna página. Lo que sí
 * necesita es un poco de aire a la izquierda y abajo del tablero (unos 16 px):
 * si el tablero va pegado al borde de algo que recorta, las etiquetas se cortan.
 *
 * Uso: una sola línea por página, cuando el tablero ya existe en el documento.
 *
 *     Coordenadas.aplicar(document.getElementById('board'));
 *
 * A partir de ahí se vuelve a pintar solo: la página redibuja el tablero cuando
 * quiere (y muchas lo hacen en cada jugada), cambia de tamaño o se esconde, y la
 * capa lo sigue. Funciona igual con el tablero girado —lee el nombre real de
 * cada casilla, no su posición— y con tableros que no son de 8×8: el 4×4 y el de
 * cuatro jugadores.
 *
 * Requisito: cada casilla debe llevar su nombre en `data-square` ("e4"), o en
 * `data-coordenada` si el de `data-square` es otra cosa. El
 * orden en el DOM no importa: se mide dónde quedó cada una.
 */
window.Coordenadas = (function () {
  "use strict";

  const ESTILO_ID = "coordenadas-tablero-css";

  // El color NO se hereda: el tablero de la portada va sobre una tarjeta oscura
  // dentro de una sección cuyo texto es oscuro, y heredado se leía gris sobre
  // gris. Se mide el fondo que queda detrás del tablero (ver colorPara) y se
  // elige el de los dos que más contrasta con él.
  const CSS = `
    .coord-marco { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 1; }
    .coord-marco[hidden] { display: none; }
    .coord-fuera {
      position: absolute;
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
      user-select: none;
      font-family: 'Inter', system-ui, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    .coord-columna { transform: translateX(-50%); }
    .coord-fila { transform: translate(-100%, -50%); }
    @media (forced-colors: active) { .coord-fuera { color: CanvasText !important; } }
  `;

  function asegurarEstilo() {
    if (document.getElementById(ESTILO_ID)) return;
    const estilo = document.createElement("style");
    estilo.id = ESTILO_ID;
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
  }

  const ESPACIO = 4;   // px entre el tablero y la etiqueta

  /* El color de las etiquetas, según el fondo real. Se suben los ancestros del
     tablero mezclando cada fondo (con su transparencia) hasta llegar a uno
     opaco, y se elige entre un azul oscuro y uno claro el que más contrasta.
     Contra el blanco da 8,6:1 y contra el azul noche del modo oscuro 11,2:1:
     los dos de sobra sobre el 4,5:1 de WCAG AA para texto chico. Si un fondo
     de tono medio deja a los dos por debajo, se pasa a negro o blanco puros. */
  const OSCURO = [51, 78, 104], CLARO = [217, 226, 236];   // brand-700 y brand-100
  const NEGRO = [0, 0, 0], BLANCO = [255, 255, 255];
  function rgba(txt) {
    const m = /rgba?\(([^)]+)\)/.exec(txt || "");
    if (!m) return null;
    const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
  }
  function fondoDe(el) {
    const capas = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      // Un degradado (la portada) cuenta como el promedio de sus colores.
      const tonos = /gradient/.test(cs.backgroundImage) ? (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(rgba) : [];
      if (tonos.length) {
        const prom = [0, 1, 2, 3].map((k) => tonos.reduce((t, c) => t + c[k], 0) / tonos.length);
        capas.push(prom);                          // el degradado va encima de su color de fondo
        if (prom[3] >= 1) break;
        const base = rgba(cs.backgroundColor);
        if (base && base[3] > 0) { capas.push(base); if (base[3] >= 1) break; }
        continue;
      }
      const c = rgba(cs.backgroundColor);
      if (c && c[3] > 0) { capas.push(c); if (c[3] >= 1) break; }
    }
    let f = [255, 255, 255];
    for (let i = capas.length - 1; i >= 0; i--) {
      const c = capas[i];
      f = [0, 1, 2].map((k) => c[k] * c[3] + f[k] * (1 - c[3]));
    }
    return f;
  }
  function luminancia(c) {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contraste(a, b) {
    const x = luminancia(a), y = luminancia(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function colorPara(tablero) {
    const f = fondoDe(tablero.parentElement || tablero);
    let c = contraste(OSCURO, f) >= contraste(CLARO, f) ? OSCURO : CLARO;
    if (contraste(c, f) < 4.5) c = contraste(NEGRO, f) >= contraste(BLANCO, f) ? NEGRO : BLANCO;
    return "rgb(" + c.join(",") + ")";
  }

  // Las casillas del borde, MIDIENDO dónde se ven: en cada columna la de más
  // abajo y en cada fila la de más a la izquierda. Así no importa el orden en
  // el DOM, ni si el tablero está girado, ni si le faltan casillas (el de cuatro
  // jugadores no tiene esquinas: ahí la letra va debajo de la última casilla
  // que hay en esa columna, como en cualquier tablero de cuatro).
  function bordes(tablero) {
    const medidas = [];
    tablero.querySelectorAll("[data-square]").forEach((c) => {
      // Un tablero cuyo nombre interno no es el que se lee (el de cuatro
      // jugadores guarda "3,0") pone el visible en data-coordenada.
      const nombre = c.dataset.coordenada || c.dataset.square || "";
      const m = /^([a-z])(\d+)$/.exec(nombre);
      if (!m) return;
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      medidas.push({ r, letra: m[1], numero: m[2], x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    });
    if (medidas.length < 4) return null;
    const abajo = {}, izquierda = {};
    medidas.forEach((m) => {
      if (!abajo[m.x] || m.r.bottom > abajo[m.x].r.bottom) abajo[m.x] = m;
      if (!izquierda[m.y] || m.r.left < izquierda[m.y].r.left) izquierda[m.y] = m;
    });
    const filaAbajo = Object.values(abajo).sort((a, b) => a.x - b.x);
    const colIzquierda = Object.values(izquierda).sort((a, b) => a.y - b.y);
    if (filaAbajo.length < 2 || colIzquierda.length < 2) return null;
    // Lo que cambia a lo largo del borde es lo que se escribe: de ordinario las
    // letras abajo y los números al costado, pero con el tablero de cuatro
    // visto desde un costado es al revés. Se cuenta cuántos valores distintos
    // hay de cada uno (en el de cuatro, las esquinas meten un par de letras
    // distintas también en la fila de los números).
    const distintos = (lista, k) => new Set(lista.map((m) => m[k])).size;
    const letrasAbajo = distintos(filaAbajo, "letra") >= distintos(filaAbajo, "numero");
    const letrasIzq = distintos(colIzquierda, "letra") > distintos(colIzquierda, "numero");
    return {
      abajo: filaAbajo.map((m) => ({ r: m.r, texto: letrasAbajo ? m.letra : m.numero })),
      izquierda: colIzquierda.map((m) => ({ r: m.r, texto: letrasIzq ? m.letra : m.numero })),
      bajo: Math.max(...medidas.map((m) => m.r.bottom)),
      izq: Math.min(...medidas.map((m) => m.r.left)),
    };
  }

  function posicionar(tablero, marco) {
    const visible = tablero.isConnected && tablero.getClientRects().length > 0;
    const b = visible && bordes(tablero);
    if (!b) { marco.hidden = true; return; }
    marco.hidden = false;

    // Una etiqueta por casilla del borde; se reusan si ya estaban.
    const todas = b.abajo.map((e) => Object.assign({ columna: true }, e)).concat(b.izquierda);
    while (marco.children.length > todas.length) marco.lastChild.remove();
    while (marco.children.length < todas.length) marco.appendChild(document.createElement("span"));

    // El origen de la capa: dónde cae su (0, 0), que es el mismo bloque que
    // contiene al tablero. Todo se mide en la pantalla y se resta.
    const origen = marco.getBoundingClientRect();
    const rt = tablero.getBoundingClientRect();
    const lado = b.abajo[0].r.width;
    const letra = Math.max(9, Math.min(13, Math.round(lado * 0.24)));
    marco.style.color = colorPara(tablero);

    todas.forEach((e, i) => {
      const span = marco.children[i];
      span.className = "coord-fuera " + (e.columna ? "coord-columna" : "coord-fila");
      if (span.textContent !== e.texto) span.textContent = e.texto;
      span.style.fontSize = letra + "px";
      // En el borde de verdad, por fuera del marco del tablero; si la casilla
      // no llega al borde (las esquinas del de cuatro), justo al lado de ella.
      if (e.columna) {
        const y = e.r.bottom >= b.bajo - 1 ? Math.max(rt.bottom, e.r.bottom) : e.r.bottom;
        span.style.left = (e.r.left + e.r.width / 2 - origen.left) + "px";
        span.style.top = (y + ESPACIO - origen.top) + "px";
      } else {
        const x = e.r.left <= b.izq + 1 ? Math.min(rt.left, e.r.left) : e.r.left;
        span.style.left = (x - ESPACIO - origen.left) + "px";
        span.style.top = (e.r.top + e.r.height / 2 - origen.top) + "px";
      }
    });
  }

  /* Las letras van debajo del tablero, y el tablero suele ir pegado al borde de
     abajo de su tarjeta: quedaban montadas sobre el borde. Se le da al tablero
     el margen de abajo que haga falta para que entren. Solo si está en el flujo
     (un tablero absoluto que llena su caja se achataría) y solo si su margen no
     alcanza ya. A la izquierda no se toca nada: correrlo cambiaría la maqueta,
     y casi siempre ya hay aire (el relleno de la tarjeta o del costado). */
  const AIRE = 18;
  function darAire(tablero) {
    const cs = getComputedStyle(tablero);
    if (cs.position === "absolute" || cs.position === "fixed") return;
    if ((parseFloat(cs.marginBottom) || 0) < AIRE) tablero.style.marginBottom = AIRE + "px";
  }

  function aplicar(tablero) {
    if (!tablero || tablero.__coordenadas) return;
    asegurarEstilo();
    const marco = document.createElement("div");
    marco.className = "coord-marco";
    marco.setAttribute("aria-hidden", "true");   // el nombre de la casilla ya está en data-square
    tablero.after(marco);
    tablero.__coordenadas = marco;
    darAire(tablero);

    // Se recoloca en el cuadro siguiente, una sola vez aunque lleguen muchos avisos.
    let pedido = 0;
    const repintar = () => {
      if (pedido) return;
      pedido = requestAnimationFrame(() => {
        pedido = 0;
        // Si la página rehízo el tablero y la capa quedó en otro lado, vuelve a su lugar.
        if (tablero.isConnected && tablero.nextSibling !== marco) tablero.after(marco);
        posicionar(tablero, marco);
      });
    };
    new MutationObserver(repintar).observe(tablero, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-square", "class", "style", "hidden"] });
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(repintar);
      ro.observe(tablero);
      if (tablero.parentElement) ro.observe(tablero.parentElement);
      ro.observe(document.body);
    }
    window.addEventListener("resize", repintar);
    // Cambiar de tema (claro/oscuro, o el de la plataforma) cambia el fondo.
    new MutationObserver(repintar).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-tema"] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(repintar);
    posicionar(tablero, marco);
  }

  return { aplicar, pintar: (tablero) => tablero && tablero.__coordenadas && posicionar(tablero, tablero.__coordenadas) };
})();
