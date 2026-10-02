// El recibo de un pago, en HTML: el mismo para el correo, para la vista previa
// de cobros.html y para imprimirlo o guardarlo en PDF desde el navegador.
//
// Una sola copia, como el aviso de cobro: si la pantalla armara su propio
// recibo, el que se imprime y el que llega a la casa se irían separando.
//
// Estilos puestos a mano en cada etiqueta (Gmail descarta <style>), salvo un
// @media print mínimo que solo quita el fondo gris al imprimir: si se pierde en
// un correo no pasa nada.
//
// LO QUE DICE ES LO QUE PASÓ: el número, la fecha, quién pagó, qué pagó y
// cuánto. No es una factura electrónica de Hacienda, y lo dice abajo: un
// recibo interno que se lee como factura se termina presentando como una.

import { plata } from "./aviso-html.ts";

export type Cabecera = (tituloHtml: string, etiquetaColor?: string) => string;

export const METODOS: Record<string, string> = {
  sinpe: "SINPE Móvil", transferencia: "Transferencia", efectivo: "Efectivo", tarjeta: "Tarjeta", otro: "Otro",
};

export type LineaRecibo = { concepto: string; consecutivo?: string | null; monto: number };

export type DatosRecibo = {
  numero: string;
  fecha: string;            // AAAA-MM-DD
  alumno: string;
  metodo: string;
  referencia?: string | null;
  nota?: string | null;
  moneda: string;
  lineas: LineaRecibo[];
  anulado?: boolean;
  anuladoMotivo?: string | null;
  firma: string;            // el nombre de la academia, o Ajedrez Integral
};

function escapar(t: unknown) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fecha(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" });
}

/** El asunto del correo: una línea, con el número y la academia. */
export function asuntoRecibo(numero: string, alumno: string, firma: string) {
  return `Recibo ${numero} — pago de ${alumno} — ${firma}`.replace(/\s+/g, " ").trim();
}

export function reciboHtml(d: DatosRecibo & { cabecera: Cabecera; destinatario?: string; sitio: string }) {
  const total = d.lineas.reduce((s, l) => s + Number(l.monto || 0), 0);
  const metodo = METODOS[d.metodo] || d.metodo;
  const filas = d.lineas.map((l) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f6;color:#243b53;font-size:14px">
        ${escapar(l.concepto)}${l.consecutivo ? `<br><span style="color:#55708a;font-size:12px">Cobro ${escapar(l.consecutivo)}</span>` : ""}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f6;text-align:right;color:#102a43;font-weight:700;white-space:nowrap;font-size:14px">
        ${plata(Number(l.monto), d.moneda)}
      </td>
    </tr>`).join("");

  // Anulado se dice arriba y con palabras, no solo con un color: un recibo
  // anulado impreso tiene que seguir diciendo que no vale.
  const anulado = d.anulado
    ? `<p style="margin:0 0 16px;padding:12px 16px;border:2px solid #b42318;border-radius:10px;color:#b42318;font-weight:700;font-size:15px">
        RECIBO ANULADO${d.anuladoMotivo ? `: ${escapar(d.anuladoMotivo)}` : ""}. Este recibo no vale como comprobante de pago.
      </p>` : "";
  const saludo = d.destinatario ? `<p style="margin:0 0 16px;font-size:15px;color:#243b53">Hola, ${escapar(d.destinatario.split(" ")[0])}:</p>
    <p style="margin:0 0 20px;font-size:15px;color:#243b53;line-height:1.6">Gracias por el pago. Aquí va tu recibo.</p>` : "";
  const dato = (etiqueta: string, valor: string) => `<tr>
      <td style="padding:4px 0;color:#55708a;font-size:13px;width:40%">${etiqueta}</td>
      <td style="padding:4px 0;color:#102a43;font-size:14px;font-weight:600">${valor}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recibo ${escapar(d.numero)} — ${escapar(d.alumno)}</title>
<style>@media print{body,.fondo{background:#ffffff!important}}</style></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" class="fondo" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">

  ${d.cabecera("Recibo de pago")}

  <tr><td style="padding:24px">
    ${anulado}
    ${saludo}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      ${dato("Recibo N.º", escapar(d.numero))}
      ${dato("Fecha del pago", escapar(fecha(d.fecha)))}
      ${dato("Recibimos de", escapar(d.alumno))}
      ${dato("Forma de pago", escapar(metodo) + (d.referencia ? ` · ref. ${escapar(d.referencia)}` : ""))}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${filas}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 0;color:#102a43;font-size:15px;font-weight:700">Total recibido</td>
        <td style="padding:12px 0;text-align:right;color:#102a43;font-size:20px;font-weight:700;white-space:nowrap">${plata(total, d.moneda)}</td>
      </tr>
    </table>
    ${d.nota ? `<p style="margin:12px 0 0;font-size:13px;color:#55708a;line-height:1.6">Nota: ${escapar(d.nota)}</p>` : ""}

    <p style="margin:20px 0 0;font-size:12px;color:#55708a;line-height:1.6">
      Recibo interno de ${escapar(d.firma)}. No es una factura electrónica.
      Si algo de este detalle no te cuadra, respóndenos este correo y lo revisamos.
    </p>
  </td></tr>

  <tr><td style="background:#f0f4f8;padding:16px 24px;font-size:11px;color:#55708a;line-height:1.6">
    <a href="${d.sitio}" style="color:#55708a">${d.sitio.replace(/^https:\/\//, "")}</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
