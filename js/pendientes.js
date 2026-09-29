/* Lo urgente: lo que se cuenta en la base.

   Lo usan «Lo urgente» de admin.html (quien administra) y la tarjeta de
   arriba del panel de quien supervisa y del de quien da clase (clases.html). Cada uno pide SOLO lo
   suyo (`claves`), y la base acota cada conteo a lo que esa persona ve: a quien
   supervisa, sus justificaciones, sus cobros y las encuestas de sus
   profesores. Ver «Lo urgente primero» y «El panel de quien supervisa, sin
   caminos repetidos» en docs/decisiones/paneles.md.

   Todo se CUENTA en la base (`count: "exact", head: true`, o una función que
   ya devuelve el número): PostgREST corta a mil filas sin avisar, y bajarse
   una lista para contarla es el error de siempre.

   Un conteo que falla vale null, NUNCA cero: quien lo pinta dice «no se pudo
   revisar». Un «al día» falso es peor que no decir nada.

     const n = await Pendientes.contarEnLaBase(sb, ["solicitudes", "seVan"], { yo });
       // { solicitudes: 2, seVan: 0 }  — null si no se pudo contar
     Pendientes.EN_LA_BASE   // qué es cada uno, en el orden en que se muestra
*/
(function () {
  "use strict";

  // Hoy, en hora de Costa Rica ("AAAA-MM-DD").
  function hoyCR() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  // El primer día del mes pasado ("AAAA-MM-01") y su nombre («agosto»), en
  // hora de Costa Rica: el informe mensual que ya se debería haber mandado.
  function mesPasado() {
    const [a, m] = hoyCR().split("-").map(Number);
    const anio = m === 1 ? a - 1 : a, mes = m === 1 ? 12 : m - 1;
    const nombre = new Intl.DateTimeFormat("es-CR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(anio, mes - 1, 15)));
    return { fecha: anio + "-" + String(mes).padStart(2, "0") + "-01", nombre: nombre };
  }

  async function contar(promesa) {
    try {
      const r = await promesa;
      if (r.error) return null;
      if (typeof r.count === "number") return r.count;
      return typeof r.data === "number" ? r.data : null;
    } catch (_) { return null; }
  }

  const CABEZA = { count: "exact", head: true };

  /* Cómo se cuenta cada uno. `yo` hace falta para no contarse a uno mismo
     (quien supervisa también es profesor y ve sus propios informes). */
  const CONTEOS = {
    solicitudes: (sb) => sb.from("solicitudes_academia").select("id", CABEZA).eq("estado", "pendiente"),
    justificaciones: (sb) => sb.rpc("justificaciones_pendientes"),
    informesSinLeer: (sb, op) => sb.from("informes_profesor").select("id", CABEZA)
      .eq("estado", "enviado").is("leido_at", null).neq("profesor_id", op.yo),
    seVan: (sb) => {
      const hoy = hoyCR();
      return sb.rpc("respuestas_satisfaccion", { p_desde: hoy.slice(0, 8) + "01", p_hasta: hoy, p_profesor: null, p_solo_se_van: true }, CABEZA);
    },
    morosos: (sb) => sb.rpc("cobros_morosos", {}, CABEZA),
    inactivos: (sb) => sb.rpc("informes_inactivos", { p_dias: 4 }, CABEZA),
    /* El informe mensual PROPIO (de quien da clase): 1 si el del mes pasado
       no se envió, 0 si ya salió. Solo a quien tiene supervisión
       (mis_supervisores()): a quien no la tiene nadie le pide informe, la
       misma regla que los recordatorios de recordar_informes_mensuales(). */
    informePropio: async (sb, op) => {
      const sups = await sb.rpc("mis_supervisores");
      if (sups.error) return sups;
      if (!sups.data || !sups.data.length) return { count: 0 };
      const r = await sb.from("informes_profesor").select("id", CABEZA)
        .eq("profesor_id", op.yo).eq("periodo", mesPasado().fecha).eq("estado", "enviado");
      if (r.error || typeof r.count !== "number") return { error: r.error || true };
      return { count: r.count > 0 ? 0 : 1 };
    },
  };

  async function contarEnLaBase(sb, claves, opciones) {
    const op = opciones || {};
    const valores = await Promise.all(claves.map((c) => contar(CONTEOS[c](sb, op))));
    const r = {};
    claves.forEach((c, i) => { r[c] = valores[i]; });
    return r;
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
    // `sinNumero`: es uno solo, y «1 Tu informe…» no se lee bien.
    { clave: "informePropio", nivel: "urgente", emoji: "🗓️", sinNumero: true,
      titulo: () => "Tu informe mensual de " + mesPasado().nombre + " sin enviar",
      porque: "Tu supervisión lo está esperando. Los números se llenan solos; tú cuentas lo que no dicen.",
      accion: "Escribirlo", href: "informe-mensual.html", alDia: "Informe mensual enviado" },
    { clave: "informesSinLeer", nivel: "urgente", emoji: "📨",
      titulo: (n) => pl(n, "informe mensual de un profesor sin leer", "informes mensuales de tus profesores sin leer"),
      porque: "Te lo mandaron y esperan que lo leas y lo comentes.",
      accion: "Leer", href: "supervision.html", alDia: "Informes mensuales leídos" },
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

  window.Pendientes = { contarEnLaBase, EN_LA_BASE, hoyCR };
})();
