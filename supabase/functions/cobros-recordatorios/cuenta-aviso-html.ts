// El correo de los avisos de las cuentas de cobro (cobros, versión 2:
// mensualidades.html). Tres tipos, uno por momento:
//   "antes"           -> unos días antes de que venza
//   "vencio"          -> el día que vence y los tres siguientes (sale una vez)
//   "antes_de_apagar" -> el día antes de que el usuario se apague solo
// El tono no amenaza (la regla de «Los avisos de morosidad»): dice qué pasa y
// cómo pagar, y quien lee puede ser una familia a la que se le complicó el mes.

export type TipoCuenta = "antes" | "vencio" | "antes_de_apagar";

function escapar(t: unknown) {
  return String(t ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
// «5 de diciembre»: un día de calendario (AAAA-MM-DD), sin pasar por la zona.
export function diaTexto(iso: string) {
  const [, m, d] = String(iso).split("-").map(Number);
  return `${d} de ${MESES[(m || 1) - 1]}`;
}
function dinero(n: number, moneda: string) {
  const v = String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, moneda === "USD" ? "," : ".");
  return moneda === "USD" ? "US$" + v : "₡" + v;
}

export function asuntoCuenta(tipo: TipoCuenta, nombre: string, firma: string) {
  if (tipo === "antes") return `La mensualidad de ${nombre} vence pronto · ${firma}`;
  if (tipo === "vencio") return `La mensualidad de ${nombre} venció · ${firma}`;
  return `Mañana se pausa el usuario de ${nombre} · ${firma}`;
}

export function cuentaAvisoHtml(o: {
  tipo: TipoCuenta; nombre: string; destinatario: string; monto: number; moneda: string;
  hasta: string; apagaEl: string | null; sinpe: string | null; sinpeNombre: string | null;
  sitio: string; contacto: string | null; cabecera: (tituloHtml: string) => string;
}) {
  const saludo = o.destinatario ? `Hola, ${escapar(o.destinatario)}:` : "Hola:";
  const que = o.tipo === "antes"
    ? `la mensualidad de <strong>${escapar(o.nombre)}</strong> vence el <strong>${diaTexto(o.hasta)}</strong>.`
    : o.tipo === "vencio"
    ? `la mensualidad de <strong>${escapar(o.nombre)}</strong> venció el <strong>${diaTexto(o.hasta)}</strong>.`
    : `si no recibimos el pago, mañana (${diaTexto(o.apagaEl || o.hasta)}) el usuario de <strong>${escapar(o.nombre)}</strong> queda en pausa hasta que se pague. Su progreso no se pierde.`;
  const pago = `<table role="presentation" style="margin:16px 0;border-collapse:collapse;font-size:15px">
      <tr><td style="padding:4px 12px 4px 0;color:#486581">Monto</td><td style="padding:4px 0;font-weight:700">${escapar(dinero(o.monto, o.moneda))}</td></tr>
      ${o.sinpe ? `<tr><td style="padding:4px 12px 4px 0;color:#486581">SINPE Móvil</td><td style="padding:4px 0;font-weight:700">${escapar(o.sinpe.replace(/(\d{4})(\d{4})/, "$1-$2"))}</td></tr>` : ""}
      ${o.sinpeNombre ? `<tr><td style="padding:4px 12px 4px 0;color:#486581">A nombre de</td><td style="padding:4px 0;font-weight:700">${escapar(o.sinpeNombre)}</td></tr>` : ""}
    </table>`;
  const titulo = o.tipo === "antes" ? "Recordatorio de mensualidad" : o.tipo === "vencio" ? "Mensualidad vencida" : "Aviso antes de pausar el usuario";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;color:#102a43">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-collapse:collapse">
    ${o.cabecera(escapar(titulo))}
    <tr><td style="padding:24px;font-size:15px;line-height:1.6">
      <p style="margin:0 0 12px">${saludo}</p>
      <p style="margin:0 0 12px">Te escribimos porque ${que}</p>
      ${pago}
      <p style="margin:0 0 12px">Cuando pagues, puedes subir la foto del comprobante al entrar a la plataforma${o.contacto ? ` o mandarla por WhatsApp al ${escapar(o.contacto)}` : ""}. Si ya pagaste, ignora este correo.</p>
      <p style="margin:0">¡Gracias!</p>
    </td></tr>
    <tr><td style="padding:16px 24px;font-size:12px;color:#627d98;border-top:1px solid #d9e2ec">
      <a href="${escapar(o.sitio)}/clases.html" style="color:#334e68">Entrar a la plataforma</a>
    </td></tr>
  </table></body></html>`;
}
