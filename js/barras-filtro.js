/* Barras horizontales que filtran: una lista de botones, uno por fila, con el
 * nombre, una barra de adorno y el número escrito (el dato nunca va solo en
 * la barra). Tocar una fila llama a `elegir(clave)`; tocar la que está
 * elegida, a `elegir("")`. La elegida lleva aria-pressed="true".
 *
 * La usan oscar-angulo-torneos.html y oscar-angulo-fide.html; los estilos son
 * los `oa-*` de css/styles.css.
 *
 *   BarrasFiltro.pintar(caja, [{clave, nombre, n}], claveElegida, elegir, textoSiVacia)
 */
(function (raiz) {
  "use strict";
  const numero = new Intl.NumberFormat("es-CR");

  function pintar(caja, filas, activa, elegir, vacio) {
    if (!filas.length) { const p = document.createElement("p"); p.className = "ae-tarjeta-sub"; p.textContent = vacio || ""; caja.replaceChildren(p); return; }
    const max = Math.max(1, ...filas.map((f) => f.n));
    caja.replaceChildren(...filas.map((f) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "oa-fila";
      b.setAttribute("aria-pressed", String(activa === f.clave));
      const et = document.createElement("span"); et.className = "oa-fila-et"; et.textContent = f.nombre;
      const pista = document.createElement("span"); pista.className = "oa-fila-pista"; pista.setAttribute("aria-hidden", "true");
      const barra = document.createElement("span"); barra.className = "oa-fila-barra ae-e2"; barra.style.width = (f.n / max * 100) + "%";
      pista.appendChild(barra);
      const n = document.createElement("span"); n.className = "oa-fila-n"; n.textContent = numero.format(f.n);
      b.append(et, pista, n);
      b.addEventListener("click", () => elegir(activa === f.clave ? "" : f.clave));
      return b;
    }));
  }

  raiz.BarrasFiltro = { pintar };
})(window);
