/*
 * El «?» del encabezado: lleva al capítulo de la guía del profesor que habla
 * de ESTA página (guia-del-profesor-accesible.html#cap-N).
 *
 * Es del equipo docente: quien da clase (role = 'profesor', y con eso quien
 * coordina o supervisa) y quien administra, igual que la tarjeta «Guía del
 * profesor» del panel. Al alumnado no se le ofrece. El enlace llega en el HTML
 * ESCONDIDO —lo pone herramientas/academia-cabecera.py, que es quien sabe qué
 * capítulo toca— y este archivo lo destapa solo a ese equipo. Quien
 * administra y está mirando la plataforma «como estudiante»
 * (js/modo-vista.js) no lo ve: ese modo es para ver lo que ve ese rol, y el
 * alumnado no tiene el «?». «Como profesor» o «como supervisor», sí.
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
      var sb = window.sb;
      if (!sb) return;
      var s = await sb.auth.getSession();
      var uid = s && s.data && s.data.session ? s.data.session.user.id : null;
      if (!uid) return;
      var r = window.MiPerfil ? await window.MiPerfil.obtener(uid)
        : await sb.from("profiles").select("is_admin, role").eq("id", uid).maybeSingle();
      var p = r && r.data;
      if (!p) return;
      if (p.is_admin) {
        if (window.ModoVista && window.ModoVista.actual() === "alumno") return;
      } else if (p.role !== "profesor") return;
      // La clase `hidden` y no el atributo: con `inline-flex` escrito en el
      // mismo elemento, el atributo `hidden` pierde contra la clase.
      enlace.classList.remove("hidden");
      enlace.classList.add("inline-flex");
    } catch (e) { /* sin «?»: la página sigue igual */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
