/* ===== Pareo Integral — el manual (pareo-manual.html) =====
 * Los dos textos están enteros en la página; esto muestra el del idioma
 * elegido. Es el mismo idioma que recuerda pareo.html (pareo_idioma_v1), y
 * ?lang=en o ?lang=es en la dirección lo eligen al llegar (el enlace que se le
 * pasa a FIDE lleva ?lang=en). */
(function () {
  "use strict";
  const CLAVE = "pareo_idioma_v1";
  const TITULOS = { es: "Manual de Pareo Integral — Ajedrez Integral", en: "Pareo Integral user manual — Ajedrez Integral" };
  let idioma = null;
  try { idioma = localStorage.getItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
  const pedido = new URLSearchParams(location.search).get("lang");
  if (pedido === "en" || pedido === "es") idioma = pedido;
  idioma = idioma === "en" ? "en" : "es";

  function pintar() {
    document.getElementById("pm-es").hidden = idioma !== "es";
    document.getElementById("pm-en").hidden = idioma !== "en";
    document.documentElement.lang = idioma;
    document.title = TITULOS[idioma];
    const b = document.getElementById("pm-idioma");
    b.textContent = idioma === "es" ? "English" : "Español";
    b.setAttribute("lang", idioma === "es" ? "en" : "es");
  }

  document.getElementById("pm-idioma").addEventListener("click", () => {
    idioma = idioma === "es" ? "en" : "es";
    try { localStorage.setItem(CLAVE, idioma); } catch (e) { /* sin almacenamiento */ }
    pintar();
  });
  pintar();
})();
