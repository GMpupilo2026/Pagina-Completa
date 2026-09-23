/* Los precios del acceso a la Academia, escritos UNA vez.
 *
 * Los leen la página de precios (precios.html), la de paquetes (accesos.html,
 * que propone el precio al armar uno) y la de elegir plan (elegir-plan.html,
 * la cuenta individual). Escritos en cada una, el día que se corrija un
 * número una diría una cosa y otra otra — y la familia se entera al pagar.
 *
 * Se cobra POR ALUMNO, con un precio que baja según cuántos se compran. El
 * total no se escribe en ningún lado: se calcula. Y se calcula eligiendo el
 * tramo que sale MÁS BARATO para esa cantidad, aunque obligue a pagar el
 * mínimo del tramo: sin eso, 9 alumnos costarían más que 10, y a quien compra
 * 9 se le estaría cobrando de más por no saber hacer la cuenta.
 */
(function (global) {
  "use strict";

  const MONEDA = "₡";

  /* El precio de UNA cuenta. Es el mismo que ya se le ofrecía a las familias
     en elegir-plan.html ("Acceso a la plataforma"): no se cambió, se mudó acá. */
  const INDIVIDUAL = 6900;

  /* Cada tramo: desde cuántos alumnos aplica, cuánto cuesta cada uno al mes,
     cuántas cuentas de profesor incluye y si incluye coordinación. El último es
     de convenio: su precio es un "desde", porque un colegio se conversa. */
  const TRAMOS = [
    { id: "individual", nombre: "Una cuenta",   desde: 1,   precio: INDIVIDUAL, profesores: 0, coordinacion: false },
    { id: "p10",        nombre: "Paquete 10",   desde: 10,  precio: 5500,       profesores: 1, coordinacion: false },
    { id: "p25",        nombre: "Paquete 25",   desde: 25,  precio: 4900,       profesores: 2, coordinacion: false },
    { id: "p50",        nombre: "Paquete 50",   desde: 50,  precio: 4200,       profesores: 3, coordinacion: true },
    { id: "p100",       nombre: "Paquete 100",  desde: 100, precio: 3500,       profesores: 6, coordinacion: true },
    { id: "colegio",    nombre: "Colegio",      desde: 300, precio: 2900,       profesores: null, coordinacion: true, convenio: true },
  ];

  /* Una cuenta de profesor de más, por encima de las que trae el paquete. */
  const PROFESOR_EXTRA = 8000;

  /* El ciclo lectivo: se usan 12 meses y se pagan 10. */
  const MESES_CICLO = 12;
  const MESES_COBRADOS_CICLO = 10;

  function formato(n) {
    const entero = Math.round(Number(n) || 0);
    return MONEDA + String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /* El tramo que sale más barato para `n` alumnos, con lo que se paga de
     verdad: `cobrados` es max(n, mínimo del tramo). */
  function cotizar(n) {
    n = Math.max(1, Math.floor(Number(n) || 1));
    let mejor = null;
    for (const t of TRAMOS) {
      const cobrados = Math.max(n, t.desde);
      const total = cobrados * t.precio;
      if (!mejor || total < mejor.total || (total === mejor.total && t.desde > mejor.tramo.desde)) {
        mejor = { tramo: t, alumnos: n, cobrados, porAlumno: t.precio, total };
      }
    }
    mejor.ciclo = mejor.total * MESES_COBRADOS_CICLO;
    return mejor;
  }

  function tramo(id) {
    return TRAMOS.find((t) => t.id === id) || null;
  }

  global.PreciosAcceso = {
    MONEDA, INDIVIDUAL, TRAMOS, PROFESOR_EXTRA, MESES_CICLO, MESES_COBRADOS_CICLO,
    formato, cotizar, tramo,
  };
})(typeof window !== "undefined" ? window : globalThis);
