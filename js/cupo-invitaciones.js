/* El cupo de invitaciones de quien da clase, leído igual en todas partes.

   Cuántos alumnos nuevos puede invitar un profesor lo fija quien administra
   (profiles.invitaciones_max, en admin.html) y lo gasta la base al crear cada
   cuenta (consumir_invitacion(), desde las Edge Functions create-student e
   inscribir-alumno). Quien administra no tiene tope. Esto solo LEE esas dos
   columnas para decir en pantalla cuántas quedan: la ficha «Crear cuenta de
   alumno» del panel (js/clases.js), alumno-nuevo.html y la caja de
   js/alta-alumno.js cuando la base contesta que no queda ninguna. Quien de
   verdad impide pasarse es la base, no esta cuenta.
   Ver «La ficha Crear cuenta de alumno» en docs/decisiones/paneles.md. */
window.CupoInvitaciones = (function () {
  // A dónde se manda a quien se quedó sin invitaciones: los paquetes por
  // cantidad de alumnos, que es lo que trae más cupo.
  var PLANES = "precios.html#t-paquetes";

  function de(perfil) {
    var p = perfil || {};
    if (p.is_admin || p._admin_real) return { ilimitado: true, max: null, usadas: null, restantes: null };
    var max = Math.max(Number(p.invitaciones_max) || 0, 0);
    var usadas = Math.max(Number(p.invitaciones_usadas) || 0, 0);
    return { ilimitado: false, max: max, usadas: usadas, restantes: Math.max(max - usadas, 0) };
  }

  // «Te quedan 3 de 70», con el plural bien puesto.
  function textoQuedan(c) {
    if (c.ilimitado) return "Como administras, no tienes tope de invitaciones.";
    return "Te " + (c.restantes === 1 ? "queda 1 invitación" : "quedan " + c.restantes + " invitaciones") +
      " de " + c.max + ".";
  }

  function textoSinCupo(max) {
    return max
      ? "Ya usaste tus " + max + " invitaciones. Para crear más cuentas de alumno, adquiere un plan mayor."
      : "Tu plan no trae invitaciones para crear cuentas de alumno. Para crearlas, adquiere un plan mayor.";
  }

  return { de: de, textoQuedan: textoQuedan, textoSinCupo: textoSinCupo, PLANES: PLANES };
})();
