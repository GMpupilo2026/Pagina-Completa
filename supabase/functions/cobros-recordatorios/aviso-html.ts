// El aviso de cobro que llega a la casa, en HTML.
//
// Se escribe una sola vez y sirve para las dos cosas: el correo y lo que la
// página enseña como vista previa. Si estuviera duplicado, se irían separando.
//
// Va con los estilos puestos a mano en cada etiqueta (`style="…"`), no con una
// hoja aparte: Gmail descarta <style> del <head>, así que un CSS bonito se vería
// perfecto en el navegador y roto en el correo, que es donde de verdad se lee.
//
// EL TONO IMPORTA, y acá más que en el informe: esto es plata. Se avisa, no se
// cobra con el garrote. Ni siquiera el aviso de morosidad amenaza con sacar al
// alumno de clase: dice que hablemos. Quien lee puede ser una familia a la que
// se le complicó el mes, no alguien que no quiere pagar.

export type Tipo = "proximo" | "vencido" | "moroso";

export const ASUNTOS: Record<Tipo, (alumno: string) => string> = {
  proximo: (a) => `Recordatorio de pago de ${a} — Ajedrez Integral`,
  vencido: (a) => `Quedó pendiente el pago de ${a} — Ajedrez Integral`,
  moroso:  (a) => `Sobre el pago pendiente de ${a} — Ajedrez Integral`,
};

const CABECERA: Record<Tipo, { titulo: string; color: string; entrada: (a: string) => string }> = {
  proximo: {
    titulo: "Recordatorio de pago",
    color: "#f0b429",
    entrada: (a) => `Te escribimos para recordarte el pago de <strong>${a}</strong> que está por vencer. Si ya lo hiciste en estos días, no le hagas caso a este correo.`,
  },
  vencido: {
    titulo: "Pago pendiente",
    color: "#f0b429",
    entrada: (a) => `El pago de <strong>${a}</strong> pasó su fecha y todavía no lo tenemos registrado. Si ya lo hiciste, mándanos el comprobante y lo acomodamos.`,
  },
  moroso: {
    titulo: "Pago pendiente desde hace días",
    color: "#cf5c1a",
    entrada: (a) => `El pago de <strong>${a}</strong> lleva ya varios días pendiente. Si se complicó el mes, escríbenos: preferimos acomodar un arreglo antes que dejar a nadie fuera de clase.`,
  },
};

function escapar(t: unknown) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function plata(monto: number, moneda: string) {
  const n = Number(monto) || 0;
  try {
    return new Intl.NumberFormat("es-CR", { style: "currency", currency: moneda || "CRC",
                                            minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  } catch {
    return (moneda === "USD" ? "$" : "₡") + n.toLocaleString("es-CR");
  }
}

function fecha(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" });
}

type Fila = {
  consecutivo: string; concepto: string; monto: number; pagado: number;
  saldo: number; moneda: string; vence: string; situacion: string; dias_atraso: number;
};

export function avisoHtml(o: {
  tipo: Tipo; alumno: string; destinatario: string; cobros: Fila[]; sitio: string;
}) {
  const cab = CABECERA[o.tipo] ?? CABECERA.proximo;
  const conSaldo = o.cobros.filter((c) => Number(c.saldo) > 0);
  const moneda = conSaldo[0]?.moneda || "CRC";
  const total = conSaldo.filter((c) => c.moneda === moneda)
                        .reduce((s, c) => s + Number(c.saldo), 0);

  const filas = conSaldo.map((c) => {
    const atraso = c.dias_atraso > 0
      ? `<span style="color:#cf5c1a">${c.dias_atraso} ${c.dias_atraso === 1 ? "día" : "días"} de atraso</span>`
      : `vence el ${fecha(c.vence)}`;
    const abonado = Number(c.pagado) > 0
      ? `<br><span style="color:#55708a;font-size:12px">Ya abonado: ${plata(Number(c.pagado), c.moneda)}</span>` : "";
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f6;color:#243b53;font-size:14px">
        ${escapar(c.concepto)}${abonado}
        <br><span style="color:#55708a;font-size:12px">${atraso}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f6;text-align:right;color:#102a43;font-weight:700;white-space:nowrap;font-size:14px">
        ${plata(Number(c.saldo), c.moneda)}
      </td>
    </tr>`;
  }).join("");

  const saludo = o.destinatario ? `Hola, ${escapar(o.destinatario.split(" ")[0])}:` : "Hola:";

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(cab.titulo)} — ${escapar(o.alumno)}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">

  <tr><td style="background:#102a43;padding:22px 24px">
    <div style="color:${cab.color};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Ajedrez Integral</div>
    <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:4px">${escapar(cab.titulo)}</div>
  </td></tr>

  <tr><td style="padding:24px">
    <p style="margin:0 0 12px;font-size:15px;color:#243b53">${saludo}</p>
    <p style="margin:0 0 20px;font-size:15px;color:#243b53;line-height:1.6">${cab.entrada(escapar(o.alumno))}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${filas}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 0;color:#102a43;font-size:15px;font-weight:700">Total pendiente</td>
        <td style="padding:12px 0;text-align:right;color:#102a43;font-size:20px;font-weight:700;white-space:nowrap">${plata(total, moneda)}</td>
      </tr>
    </table>

    <p style="margin:16px 0 0;padding:16px;background:#f0f4f8;border-radius:10px;font-size:14px;color:#243b53;line-height:1.7">
      <strong>Cómo pagar</strong><br>
      Por SINPE Móvil, transferencia o en efectivo en clase. Cuando lo hagas, mándanos el
      comprobante por WhatsApp al <a href="https://wa.me/50683092291" style="color:#a85a0d">+506 8309-2291</a>
      y lo registramos.
    </p>

    <p style="margin:20px 0 0;font-size:13px;color:#55708a;line-height:1.6">
      Si algo de este detalle no te cuadra, respóndenos este correo o escríbenos por WhatsApp y lo revisamos.
    </p>
  </td></tr>

  <tr><td style="background:#f0f4f8;padding:16px 24px;font-size:11px;color:#55708a;line-height:1.6">
    Recibes este correo porque en la Academia figuras como persona encargada de ${escapar(o.alumno)}, o es tu propia cuenta.
    <br><a href="${o.sitio}" style="color:#55708a">${o.sitio.replace(/^https:\/\//, "")}</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
