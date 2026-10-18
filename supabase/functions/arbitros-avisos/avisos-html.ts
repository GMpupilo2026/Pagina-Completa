// El correo que le llega a un árbitro con lo que se le vence. Lo manda
// arbitros-avisos (ver su cabecera), disparada el día 1 de cada mes por
// public.disparar_avisos_arbitros(). Lo prueba herramientas/verificar-arbitros-avisos.js.
//
// Lo que trae sale de la base (nombres de torneos, de seminarios), pero igual
// se escapa: un correo no confía en lo que le llega.

export type Aviso = { que: string; vence: string };

function escapar(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** «AAAA-MM-DD» a «12 de marzo de 2027», sin pasar por Date (no se corre de día). */
export function fechaLarga(iso: string): string {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${parseInt(m[3], 10)} de ${MESES[parseInt(m[2], 10) - 1]} de ${m[1]}` : "";
}

/** El nombre de pila de «Apellidos, Nombre», para el saludo. */
export function pila(nombre: string): string {
  const despues = String(nombre || "").split(",")[1];
  return (despues || "").trim().split(/\s+/)[0] || "";
}

export function asunto(avisos: Aviso[]): string {
  return avisos.length === 1 ? "Arbitraje: algo se te vence pronto" : `Arbitraje: ${avisos.length} cosas se te vencen pronto`;
}

/** `cabeceraHtml` llega armada (cabeceraCorreo): este archivo no importa el
    compartido, así lo corren las pruebas con Node. */
export function cuerpoAvisos(nombre: string, avisos: Aviso[], cabeceraHtml: string): string {
  const lista = avisos.slice().sort((a, b) => a.vence.localeCompare(b.vence))
    .map((a) => `<li style="margin:0 0 10px"><strong>${escapar(fechaLarga(a.vence))}:</strong> ${escapar(a.que)}.</li>`).join("");
  const hola = pila(nombre);
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
${cabeceraHtml}
<tr><td style="padding:24px;color:#102a43;font-size:15px;line-height:1.5">
  <p style="margin:0 0 12px">${hola ? `Hola, ${escapar(hola)}:` : "Hola:"}</p>
  <p style="margin:0 0 12px">Según tus torneos en FIDE y en chess-results, en los próximos meses se te vence esto:</p>
  <ul style="margin:0 0 16px;padding-left:20px">${lista}</ul>
  <p style="margin:0 0 12px">Si ya lo tienes resuelto (otra norma, un seminario o un curso que no figura en nuestros datos), no tienes que hacer nada; si algo no está bien, respóndenos este correo y lo corregimos.</p>
  <p style="margin:0;color:#486581;font-size:13px">Te escribimos porque autorizaste estos avisos de lo que se te vence como árbitro. Si ya no los quieres, respóndenos este correo y no te llegan más.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}
