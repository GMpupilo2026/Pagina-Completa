/* Lo urgente de quien administra: lo que se cuenta en la base.

   Lo usa «Lo urgente» de admin.html, que es el único lugar donde se muestra
   (el panel de la Academia lo repetía y se quitó: ver «Una sola puerta para
   cada cosa» en docs/decisiones/paneles.md).

   Todo se CUENTA en la base (`count: "exact", head: true`, o una función que
   ya devuelve el número): PostgREST corta a mil filas sin avisar, y bajarse
   una lista para contarla es el error de siempre.

   Un conteo que falla vale null, NUNCA cero: quien lo pinta dice «no se pudo
   revisar». Un «al día» falso es peor que no decir nada.

     const n = await PendientesAdmin.contarEnLaBase(sb);
       // { solicitudes, justificaciones, seVan, morosos, inactivos }
     PendientesAdmin.EN_LA_BASE   // qué es cada uno, en el orden en que se muestra
*/
(function () {
  "use strict";

  // Hoy, en hora de Costa Rica ("AAAA-MM-DD").
  function hoyCR() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  async function contar(promesa) {
    try {
      const r = await promesa;
      if (r.error) return null;
      if (typeof r.count === "number") return r.count;
      return typeof r.data === "number" ? r.data : null;
    } catch (_) { return null; }
  }

  async function contarEnLaBase(sb) {
    const cabeza = { count: "exact", head: true };
    const hoy = hoyCR();
    const [solicitudes, justificaciones, seVan, morosos, inactivos] = await Promise.all([
      contar(sb.from("solicitudes_academia").select("id", cabeza).eq("estado", "pendiente")),
      contar(sb.rpc("justificaciones_pendientes")),
      contar(sb.rpc("respuestas_satisfaccion", { p_desde: hoy.slice(0, 8) + "01", p_hasta: hoy, p_profesor: null, p_solo_se_van: true }, cabeza)),
      contar(sb.rpc("cobros_morosos", {}, cabeza)),
      contar(sb.rpc("informes_inactivos", { p_dias: 4 }, cabeza)),
    ]);
    return { solicitudes, justificaciones, seVan, morosos, inactivos };
  }

  const pl = (n, uno, varios) => (n === 1 ? uno : varios);

  /* Qué es cada uno. `clave` es la de contarEnLaBase(); `nivel` dice si
     alguien está esperando («urgente») o es para tener a la vista
     («vigilar»). `href` es la página donde se resuelve. */
  const EN_LA_BASE = [
    { clave: "solicitudes", nivel: "urgente", emoji: "📝",
      titulo: (n) => pl(n, "solicitud de ingreso sin responder", "solicitudes de ingreso sin responder"),
      porque: "Gente que pidió entrar a la Academia y está esperando una respuesta.",
      accion: "Responder", href: "solicitudes.html", alDia: "Solicitudes de ingreso" },
    { clave: "justificaciones", nivel: "urgente", emoji: "🩺",
      titulo: (n) => pl(n, "justificación de ausencia por revisar", "justificaciones de ausencia por revisar"),
      porque: "La familia espera saber si se aceptó.",
      accion: "Revisar", href: "justificaciones.html", alDia: "Justificaciones de ausencia" },
    { clave: "seVan", nivel: "vigilar", emoji: "🚪",
      titulo: (n) => pl(n, "alumno dijo este mes que no sigue", "alumnos dijeron este mes que no siguen"),
      porque: "Lo contestaron en la encuesta de satisfacción con su profesor.",
      accion: "Ver quiénes", href: "satisfaccion.html", alDia: "Nadie dijo este mes que se va" },
    { clave: "morosos", nivel: "vigilar", emoji: "💳",
      titulo: (n) => pl(n, "saldo vencido", "saldos vencidos"),
      porque: "Mensualidades sin pagar pasada la fecha (uno por alumno y moneda).",
      accion: "Ver cobros", href: "cobros.html", alDia: "Pagos al día" },
    { clave: "inactivos", nivel: "vigilar", emoji: "💤",
      titulo: (n) => pl(n, "alumno lleva 4 días o más sin entrenar", "alumnos llevan 4 días o más sin entrenar"),
      porque: "Cuántos son de cada supervisor está en su ficha, en Supervisores.",
      accion: "Ver por supervisor", href: "admin.html#supervisores", alDia: "Todos entrenaron esta semana" },
  ];

  window.PendientesAdmin = { contarEnLaBase, EN_LA_BASE, hoyCR };
})();
