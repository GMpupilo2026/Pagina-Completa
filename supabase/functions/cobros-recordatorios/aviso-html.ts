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

import type { Contacto } from "./contacto-academia.ts";

export type Tipo = "proximo" | "vencido" | "moroso";

/* La franja de arriba la arma `cabeceraCorreo()` (_compartido/marca-correo.ts)
   con la marca de la academia del alumno, y la firma del asunto es su nombre. */
export type Cabecera = (tituloHtml: string, etiquetaColor?: string) => string;

/* LO QUE DICE EL CORREO LO PUEDE CAMBIAR QUIEN COORDINA, desde la ficha
   «Morosidad» de cobros.html: el asunto y el párrafo de entrada de cada uno de
   los tres avisos, y el «Cómo pagar» (claves `cobros_asunto_<tipo>`,
   `cobros_mensaje_<tipo>` y `cobros_como_pagar` de `ajustes_academia`).
   Lo que no está puesto sale con el texto de fábrica de aquí abajo, que está
   escrito con las MISMAS marcas que usa quien lo edita — {alumno} y
   {academia} — para que ambos pasen por el mismo camino y no se separen.

   Lo que escribe quien coordina es texto, no HTML: se escapa entero y solo
   después se ponen el nombre (en negrita) y los saltos de línea. Lo que no se
   deja editar es lo que tiene que ser cierto siempre: la tabla con lo que se
   debe, el total y a dónde mandar el comprobante (sale del número de
   WhatsApp que se pone en «Contacto»). */
export type Textos = {
  asunto?: Partial<Record<Tipo, string | null>>;
  mensaje?: Partial<Record<Tipo, string | null>>;
  comoPagar?: string | null;
};

export const LARGO_ASUNTO = 150;
export const LARGO_MENSAJE = 1000;

export const DE_FABRICA = {
  asunto: {
    proximo: "Recordatorio de pago de {alumno} — {academia}",
    vencido: "Quedó pendiente el pago de {alumno} — {academia}",
    moroso:  "Sobre el pago pendiente de {alumno} — {academia}",
  } as Record<Tipo, string>,
  mensaje: {
    proximo: "Te escribimos para recordarte el pago de {alumno} que está por vencer. Si ya lo hiciste en estos días, no le hagas caso a este correo.",
    vencido: "El pago de {alumno} pasó su fecha y todavía no lo tenemos registrado. Si ya lo hiciste, mándanos el comprobante y lo acomodamos.",
    moroso:  "El pago de {alumno} lleva ya varios días pendiente. Si se complicó el mes, escríbenos: preferimos acomodar un arreglo antes que dejar a nadie fuera de clase.",
  } as Record<Tipo, string>,
  comoPagar: "Por SINPE Móvil o transferencia bancaria.",
};

// El texto guardado si sirve; si no (vacío, o no es texto), el de fábrica.
function elegido(guardado: unknown, fabrica: string, largo: number) {
  return typeof guardado === "string" && guardado.trim() ? guardado.trim().slice(0, largo) : fabrica;
}

/** El asunto: texto plano, en una sola línea (un salto de línea en el asunto
    lo cortan o lo rechazan los programas de correo). */
export function asuntoDe(tipo: Tipo, alumno: string, firma = "Ajedrez Integral", textos?: Textos | null) {
  const t = elegido(textos?.asunto?.[tipo], DE_FABRICA.asunto[tipo], LARGO_ASUNTO);
  // Con función y no con texto: un nombre con «$&» adentro se tomaría como
  // patrón de reemplazo.
  return t.replaceAll("{alumno}", () => alumno).replaceAll("{academia}", () => firma).replace(/\s+/g, " ").trim();
}

/** Un párrafo escrito por una persona, ya escapado, con el nombre en negrita
    y los saltos de línea como <br>. */
function conDatos(texto: string, alumno: string, firma: string) {
  return escapar(texto)
    .replaceAll("{alumno}", () => `<strong>${escapar(alumno)}</strong>`)
    .replaceAll("{academia}", () => escapar(firma))
    .replace(/\r?\n/g, "<br>");
}

const CABECERA: Record<Tipo, { titulo: string; color: string }> = {
  proximo: { titulo: "Recordatorio de pago", color: "#f0b429" },
  vencido: { titulo: "Pago pendiente", color: "#f0b429" },
  moroso:  { titulo: "Pago pendiente desde hace días", color: "#cf5c1a" },
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

// Un día de calendario (el vencimiento), leído al mediodía y dicho en hora de
// Costa Rica, que es donde se paga. La zona va escrita acá y no importada de
// hora-cr.ts: este archivo lo corren también las pruebas de herramientas/ con
// Node, donde el compartido no está copiado al lado (por eso los demás imports
// son solo de tipos).
function fecha(iso: string) {
  return new Date(iso + "T12:00:00-06:00").toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
}

type Fila = {
  consecutivo: string; concepto: string; monto: number; pagado: number;
  saldo: number; moneda: string; vence: string; situacion: string; dias_atraso: number;
};

export function avisoHtml(o: {
  tipo: Tipo; alumno: string; destinatario: string; cobros: Fila[]; sitio: string;
  contacto?: Contacto | null; cabecera: Cabecera; textos?: Textos | null; firma?: string;
}) {
  const tipo: Tipo = CABECERA[o.tipo] ? o.tipo : "proximo";
  const cab = CABECERA[tipo];
  const firma = o.firma || "Ajedrez Integral";
  const entrada = conDatos(elegido(o.textos?.mensaje?.[tipo], DE_FABRICA.mensaje[tipo], LARGO_MENSAJE), o.alumno, firma);
  const comoPagar = conDatos(elegido(o.textos?.comoPagar, DE_FABRICA.comoPagar, LARGO_MENSAJE), o.alumno, firma);
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

  /* A dónde se manda el comprobante. El número sale de `ajustes_academia` y lo
     pone quien coordina; si no hay ninguno puesto, se dice que respondan este
     mismo correo. Inventar un número acá sería justo lo que este cambio vino a
     quitar. */
  const porDonde = o.contacto
    ? `por WhatsApp al <a href="${o.contacto.enlace}" style="color:#a85a0d">${escapar(o.contacto.texto)}</a>`
    : "respondiendo a este mismo correo";

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(cab.titulo)} — ${escapar(o.alumno)}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">

  ${o.cabecera(escapar(cab.titulo), cab.color)}

  <tr><td style="padding:24px">
    <p style="margin:0 0 12px;font-size:15px;color:#243b53">${saludo}</p>
    <p style="margin:0 0 20px;font-size:15px;color:#243b53;line-height:1.6">${entrada}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${filas}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 0;color:#102a43;font-size:15px;font-weight:700">Total pendiente</td>
        <td style="padding:12px 0;text-align:right;color:#102a43;font-size:20px;font-weight:700;white-space:nowrap">${plata(total, moneda)}</td>
      </tr>
    </table>

    <p style="margin:16px 0 0;padding:16px;background:#f0f4f8;border-radius:10px;font-size:14px;color:#243b53;line-height:1.7">
      <strong>Cómo pagar</strong><br>
      ${comoPagar} Cuando lo hagas, mándanos el
      comprobante ${porDonde} y lo registramos.
    </p>

    <p style="margin:20px 0 0;font-size:13px;color:#55708a;line-height:1.6">
      Si algo de este detalle no te cuadra, respóndenos este correo y lo revisamos.
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
