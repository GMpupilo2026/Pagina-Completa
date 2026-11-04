/* El modo invitado del Centroamericano 2026: Batalla naval y «Aprende a jugar»
 * (la de las estrellas) son páginas de la Academia, con cuenta; durante el
 * festival se pueden jugar sin cuenta si se llega desde la ficha «Mientras
 * esperas» de centroamericano-2026.html, con `?invitado=centroamericano` en la
 * dirección. Lo pidió el dueño: para los hermanos y los niños que esperan
 * afuera de la sala, solo desde el Centroamericano y solo esos días.
 * Ver «Mientras esperas» en docs/decisiones/juegos-y-torneos.md.
 *
 * No es un candado: estos juegos corren enteros en el navegador y no leen ni
 * escriben nada de la base. Quien copie el enlace podría jugarlos esos días, y
 * es aceptado así. Lo que sí cuida: el progreso (estrellas, niveles) queda
 * solo en este aparato, como siempre sin sesión (js/progreso-usuario.js no
 * sube nada sin cuenta), y fuera de las fechas la página pide cuenta como
 * siempre.
 *
 * Lo mismo vale para el Metropolitano 2026 (`?invitado=metropolitano`, del 26
 * al 30 de diciembre, desde «Mientras esperas» de metropolitano-2026.html):
 * cada torneo con sus fechas, su nombre y su página para volver, en EVENTOS.
 * La cuenta gratis de 5 días es solo del Centroamericano.
 *
 *   InvitadoCentroamericano.activo()  → true si se juega como invitado ahora
 *   InvitadoCentroamericano.franja(el) → pone arriba el aviso y la vuelta
 */
window.InvitadoCentroamericano = (function () {
  "use strict";

  // Las fechas, en hora de Costa Rica.
  const EVENTOS = {
    centroamericano: { desde: "2026-11-01", hasta: "2026-11-09", nombre: "Centroamericano 2026", pagina: "centroamericano-2026.html", volver: "← Volver al Centroamericano", cuenta: true },
    metropolitano: { desde: "2026-12-26", hasta: "2026-12-30", nombre: "Metropolitano 2026", pagina: "metropolitano-2026.html", volver: "← Volver al Metropolitano", cuenta: false },
  };
  const DESDE = EVENTOS.centroamericano.desde, HASTA = EVENTOS.centroamericano.hasta;
  const CLAVE = "invitado_centroamericano";            // sessionStorage: sigue al cambiar de nivel

  function hoy() {
    if (window.HoraCR && window.HoraCR.hoy) return window.HoraCR.hoy();
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  }
  const enFechas = (ev) => { const d = hoy(); return !!ev && d >= ev.desde && d <= ev.hasta; };

  // El torneo del que viene: el de la dirección, o el que quedó guardado al
  // cambiar de nivel («1» es el guardado de antes, del Centroamericano).
  function pedido() {
    let p = null;
    try { p = new URLSearchParams(location.search).get("invitado"); } catch (e) { p = null; }
    if (p && EVENTOS[p]) { try { sessionStorage.setItem(CLAVE, p); } catch (e) { /* sin sessionStorage: solo esta carga */ } return EVENTOS[p]; }
    let g = null;
    try { g = sessionStorage.getItem(CLAVE); } catch (e) { g = null; }
    return g === "1" ? EVENTOS.centroamericano : EVENTOS[g] || null;
  }

  const activo = () => enFechas(pedido());

  // El aviso de arriba: quién juega, dónde queda el progreso y la vuelta.
  function franja(antesDe) {
    const ev = pedido();
    if (!enFechas(ev) || document.getElementById("franja-invitado")) return;
    const p = document.createElement("p");
    p.id = "franja-invitado";
    p.setAttribute("role", "note");
    p.style.cssText = "margin:0;padding:.6rem 1rem;background:#40478f;color:#fff;font-weight:600;font-size:.95rem;text-align:center";
    p.appendChild(document.createTextNode("Juegas como invitado del " + ev.nombre + ": tu progreso queda en este celular. "));
    // Dentro de la ventana de la página del torneo no hace falta volver.
    if (window.top === window.self) {
      const a = document.createElement("a");
      a.href = (location.pathname.indexOf("/entreno/") !== -1 ? "../" : "") + ev.pagina + "#esperas";
      a.textContent = ev.volver;
      a.style.cssText = "color:#fff;text-decoration:underline;white-space:nowrap";
      p.appendChild(a);
    }
    // Y la invitación a seguir con una cuenta: la de 5 días del festival, que
    // se abre en la página del torneo (js/centroamericano-academia.js). Lo que
    // juntó aquí sube solo a la cuenta al entrar (js/progreso-usuario.js).
    if (ev.cuenta) {
      const cuenta = document.createElement("a");
      cuenta.href = (location.pathname.indexOf("/entreno/") !== -1 ? "../" : "") + "centroamericano-2026.html#cuenta-gratis";
      cuenta.target = "_top";
      cuenta.dataset.cuentaGratis = "";
      cuenta.textContent = "¿Te gustó? Crea tu cuenta gratis de 5 días y sigue con tus estrellas →";
      cuenta.style.cssText = "display:inline-block;margin-left:.75rem;color:#fff;text-decoration:underline;font-weight:800";
      p.appendChild(cuenta);
    }
    const ref = antesDe || document.body.firstElementChild;
    if (ref && ref.parentNode) ref.parentNode.insertBefore(p, ref); else document.body.prepend(p);
  }

  return { activo, franja, DESDE, HASTA, EVENTOS };
})();
