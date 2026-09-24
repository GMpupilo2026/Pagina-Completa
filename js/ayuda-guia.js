/*
 * El «?» del encabezado: lleva al capítulo de la guía del profesor que habla
 * de ESTA página (guia-del-profesor-accesible.html#cap-N).
 *
 * Por ahora es solo de administración, igual que la tarjeta «Guía del
 * profesor» del panel (`soloAdmin` en clases.html): la guía todavía no se le
 * ofrece al equipo docente. El enlace llega en el HTML ESCONDIDO —lo pone
 * herramientas/academia-cabecera.py, que es quien sabe qué capítulo toca— y
 * este archivo lo destapa solo si quien mira administra y está en su propia
 * vista. Si está mirando la plataforma «como estudiante» o «como profesor»
 * (js/modo-vista.js), se queda escondido: ese modo es para ver lo que ve ese
 * rol, y ese rol no tiene el «?».
 *
 * La guía no se cuida con esto: es una página pública y quien tenga la
 * dirección la lee. Lo que se decide acá es a quién se le OFRECE.
 *
 * Como la burbuja y la marca, se suma a decenas de páginas que ya funcionaban:
 * si algo falla, el enlace se queda escondido y la página sigue igual.
 */
(function () {
  "use strict";
  if (window.AyudaGuia) return;
  window.AyudaGuia = true;

  async function arrancar() {
    var enlace = document.getElementById("ayuda-guia");
    if (!enlace) return;
    try {
      if (window.ModoVista && window.ModoVista.actual() !== "admin") return;
      var sb = window.sb;
      if (!sb) return;
      var s = await sb.auth.getSession();
      var uid = s && s.data && s.data.session ? s.data.session.user.id : null;
      if (!uid) return;
      var r = await sb.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
      if (!(r && r.data && r.data.is_admin)) return;
      // La clase `hidden` y no el atributo: con `inline-flex` escrito en el
      // mismo elemento, el atributo `hidden` pierde contra la clase.
      enlace.classList.remove("hidden");
      enlace.classList.add("inline-flex");
    } catch (e) { /* sin «?»: la página sigue igual */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
