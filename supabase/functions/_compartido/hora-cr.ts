// Las fechas de los correos, en hora de Costa Rica.
//
// Una Edge Function corre en un servidor en UTC: una fecha formateada sin
// zona sale con el día de UTC (de las 6 de la tarde a la medianoche de Costa
// Rica, el día siguiente). Y un día de calendario («2026-09-30», una columna
// `date`) se lee como la medianoche UTC. Esto resuelve las dos cosas en un
// solo lugar, igual que js/hora-cr.js en el navegador. Ver «Las fechas y las
// horas, siempre en hora de Costa Rica» en docs/decisiones/sitio-e-infraestructura.md.
//
// Lo importa el index.ts de una función, NO los *-html.ts de los correos: esos
// los corren también las pruebas de herramientas/ con Node, donde el compartido
// no está copiado al lado, así que llevan la zona escrita en su propio fecha().

export const ZONA_CR = "America/Costa_Rica";

// El momento que representa `x`; un día de calendario se lee como el mediodía de ese día en Costa Rica.
export function momentoCR(x: string | number | Date): Date {
  if (x instanceof Date) return x;
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) return new Date(x + "T12:00:00-06:00");
  return new Date(x);
}

// «30 de septiembre de 2026», en hora de Costa Rica.
export function fechaCR(x: string | number | Date, opciones: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  const d = momentoCR(x);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-CR", { ...opciones, timeZone: ZONA_CR });
}

// El día en Costa Rica, «2026-09-30».
export function diaCR(x: string | number | Date = new Date()): string {
  return momentoCR(x).toLocaleDateString("en-CA", { timeZone: ZONA_CR });
}
