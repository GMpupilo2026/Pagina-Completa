/* «El podio», arriba de las fichas en las páginas de los torneos
 * universitarios (cenfotec-2026.html, utn-2026.html): los tres primeros de
 * cada grupo (uno solo en CENFOTEC; Femenino y Masculino en la UTN), con
 * los datos de js/centroamericano-vivo.js, que tiene que cargar antes.
 *
 * Se piden al abrir la página: el torneo ya terminó y el podio es lo primero
 * que se viene a ver. Todo lo de afuera (nombres) va por textContent.
 * Ver «Las páginas de los torneos universitarios» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  const caja = document.getElementById("podio-lista");
  const estado = document.getElementById("podio-estado");
  if (!V || !caja) return;
  const el = V.el;

  function puesto(x, i) {
    const li = el("li", "u-podio-puesto");
    li.dataset.puesto = String(i + 1);
    const medalla = el("span", "u-podio-medalla", ["🥇", "🥈", "🥉"][i]);
    medalla.setAttribute("aria-hidden", "true");
    li.append(medalla,
      el("span", "u-podio-lugar", (i + 1) + ".º lugar"),
      el("span", "u-podio-nombre", (x.j.titulo ? x.j.titulo + " " : "") + x.j.nombre),
      el("span", "u-podio-puntos", V.textos().puntos(x.j.puntos || "0") + (x.j.elo ? " · Elo " + x.j.elo : "")));
    return li;
  }

  function pintar() {
    const grupos = {};
    V.jugadores().forEach((x) => { (grupos[x.j.grupo || ""] = grupos[x.j.grupo || ""] || []).push(x); });
    const nombres = Object.keys(grupos).sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b));
    if (!nombres.length) return;
    caja.replaceChildren(...nombres.map((g) => {
      const tres = grupos[g].sort((a, b) => a.j.puesto - b.j.puesto).slice(0, 3);
      const bloque = el("section", "u-podio-grupo");
      // Con un solo grupo el título de arriba («El podio») ya lo dice todo.
      if (nombres.length > 1) bloque.appendChild(el("h3", "", V.categoria(g)));
      const ol = el("ol", "u-podio");
      tres.forEach((x, i) => ol.appendChild(puesto(x, i)));
      bloque.appendChild(ol);
      return bloque;
    }));
    // «1:34 p. m.» ya trae su punto: no se le pone otro.
    estado.textContent = V.cuandoSeLeyo().trim().replace(/\.\./g, ".");
  }

  if (V.datos()) pintar();
  V.pedir().then(pintar, () => { if (!V.datos()) estado.textContent = V.textos().error; });
})();
