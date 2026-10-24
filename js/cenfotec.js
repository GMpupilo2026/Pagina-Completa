/* La página del Desafío Mentes Maestras CENFOTEC 2026 (cenfotec-2026.html).
 *
 * Usa las mismas piezas que la del Centroamericano: el buscador, «Mis
 * jugadores», el podio, la clasificación, el proyector y la imagen para
 * compartir salen de js/centroamericano-vivo.js y js/centroamericano-tablas.js,
 * con los datos de chess-results que lee la Edge Function sala-jugadores para
 * la sala «cenfotec» de Torneos. Lo único propio es esto:
 *
 * - window.TorneoPagina: la sala, el prefijo de lo guardado en el aparato y la
 *   cara de la imagen para compartir (el azul y el logo de CENFOTEC). Tiene que
 *   cargar ANTES que esos dos módulos.
 * - «El podio», arriba de las fichas: los tres primeros, que se piden al abrir
 *   la página (el torneo ya terminó: es lo primero que se viene a ver).
 *
 * Ver «La página del Desafío Mentes Maestras» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  // Colores medidos sobre su fondo real (ver la cabecera de css/cenfotec.css):
  // blanco sobre #233065 12,48; #233065 sobre blanco 12,48 y sobre #EEF6FD 11,4.
  window.TorneoPagina = {
    sala: "cenfotec",
    guardado: "cft",
    soloPodio: true,
    url: "ajedrez-integral.com/cenfotec-2026.html",
    nombreCorto: "Mentes Maestras",
    imgSub: "Desafío Mentes Maestras 2026 · Universidad CENFOTEC",
    compartirTexto: (n) => n + " en el Desafío Mentes Maestras CENFOTEC 2026:",
    imagen: {
      banda: "#233065", tinta: "#233065", acento: "#233065", suave: "#eef6fd",
      dibujo: "img/cenfotec/logo.png", redondo: false, archivo: "mentes-maestras-2026",
      franjas: [["#23acf4", 1046], ["#233065", 1060]],
    },
  };

  // «El podio»: se llena cuando ya cargaron los módulos (van después de este).
  document.addEventListener("DOMContentLoaded", () => {
    const V = window.CentroamericanoVivo;
    const lista = document.getElementById("podio-lista");
    const estado = document.getElementById("podio-estado");
    if (!V || !lista) return;
    const pintar = () => {
      const tres = V.jugadores().slice().sort((a, b) => a.j.puesto - b.j.puesto).slice(0, 3);
      if (!tres.length) return;
      lista.replaceChildren(...tres.map((x, i) => {
        const li = V.el("li", "cft-podio-puesto");
        li.dataset.puesto = String(i + 1);
        const medalla = V.el("span", "cft-podio-medalla", ["🥇", "🥈", "🥉"][i]);
        medalla.setAttribute("aria-hidden", "true");
        li.append(medalla,
          V.el("span", "cft-podio-lugar", (i + 1) + ".º lugar"),
          V.el("span", "cft-podio-nombre", (x.j.titulo ? x.j.titulo + " " : "") + x.j.nombre),
          V.el("span", "cft-podio-puntos", V.textos().puntos(x.j.puntos || "0") + (x.j.elo ? " · Elo " + x.j.elo : "")));
        return li;
      }));
      // «1:34 p. m.» ya trae su punto: no se le pone otro.
      estado.textContent = V.cuandoSeLeyo().trim().replace(/\.\./g, ".");
    };
    if (V.datos()) pintar();
    V.pedir().then(pintar, () => { if (!V.datos()) estado.textContent = V.textos().error; });
  });
})();
