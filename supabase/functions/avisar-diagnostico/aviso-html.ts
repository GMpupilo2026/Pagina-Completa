// El correo que le llega al supervisor cuando alguien hace el diagnóstico por
// su enlace. Lo manda avisar-diagnostico (ver su cabecera). Todo lo del
// visitante es texto ajeno: va escapado, también dentro de los atributos.
// Lo prueba herramientas/verificar-aviso-diagnostico.js.

const SITE_URL = "https://ajedrez-integral.com";

export type Diagnostico = {
  id: string; created_at: string; nombre: string; email: string | null; telefono: string | null;
  elo: number | null; porcentaje: number | null; nivel: string | null; supervisor_id: string | null;
};

function escapar(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** `cabeceraHtml` llega armada (cabeceraCorreo): este archivo no importa el
    compartido, así lo corren las pruebas con Node. */
export function cuerpoAviso(d: Diagnostico, nombreSupervisor: string, cabeceraHtml: string): string {
  const fila = (etiqueta: string, valorHtml: string) =>
    `<tr><td style="padding:6px 0;color:#486581;font-size:14px;width:120px;vertical-align:top">${etiqueta}</td>` +
    `<td style="padding:6px 0;color:#102a43;font-size:14px">${valorHtml}</td></tr>`;
  const tel = (d.telefono || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  const filas = [
    fila("Nombre", `<strong>${escapar(d.nombre)}</strong>`),
    d.email ? fila("Correo", `<a href="mailto:${escapar(d.email)}" style="color:#0b69a3">${escapar(d.email)}</a>`) : "",
    d.telefono ? fila("WhatsApp", tel ? `<a href="https://wa.me/${escapar(tel)}" style="color:#0b69a3">${escapar(d.telefono)}</a>` : escapar(d.telefono)) : "",
    d.nivel ? fila("Nivel", escapar(d.nivel)) : "",
    typeof d.porcentaje === "number" ? fila("Resultado", `${d.porcentaje}%`) : "",
    typeof d.elo === "number" ? fila("Elo que dijo", String(d.elo)) : "",
  ].join("");
  const enlace = `${SITE_URL}/informes.html?tema=diagnostico-publico`;
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
${cabeceraHtml}
<tr><td style="padding:24px">
  <p style="margin:0 0 16px;color:#102a43;font-size:15px">${nombreSupervisor ? `Hola, ${escapar(nombreSupervisor)}.` : "Hola."} Alguien sin cuenta hizo el diagnóstico de nivel con el enlace que compartiste:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px">${filas}</table>
  <p style="margin:0 0 20px"><a href="${enlace}" style="display:inline-block;background:#102a43;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px">Ver el diagnóstico completo</a></p>
  <p style="margin:0;color:#486581;font-size:13px">En Informes están sus áreas fuertes y flojas, su plan y el PDF para mandarle. Si respondes este correo, le escribes directamente a ${escapar(d.nombre)}.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}
