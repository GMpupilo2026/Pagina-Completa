// El informe de un examen, en HTML, para la casa.
//
// Va con los estilos puestos a mano en cada etiqueta, no con una hoja aparte:
// Gmail descarta el <style> del <head>, así que un CSS bonito se vería
// perfecto en el navegador y roto en el correo, que es donde de verdad se lee.
// Misma decisión que informe-html.ts.
//
// EL TONO IMPORTA: esto lo lee una madre o un padre. Una nota baja se cuenta
// sin regañar a nadie y con lo que hay que hacer después; y cuando el examen
// se congeló por salirse de la ventana se dice lo que pasó, sin acusar —
// quien lo lee decide qué hacer con eso.

import type { Contacto } from "./contacto-academia.ts";

/* La franja de arriba la arma `cabeceraCorreo()` (_compartido/marca-correo.ts),
   con la marca de la academia del alumno. */
export type Cabecera = (tituloHtml: string, etiquetaColor?: string) => string;

const AREAS: Record<string, string> = {
  reglas: "Reglas y movimientos",
  material: "Valor de las piezas",
  apertura: "Aperturas",
  tactica: "Táctica",
  mate: "Mates",
  finales: "Finales",
  estrategia: "Estrategia",
  calculo: "Cálculo",
  maestria: "Cultura ajedrecística",
  general: "General",
};

function escapar(t: unknown) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fecha(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" });
}

export function informeExamenHtml(d: Record<string, any>, sitio: string, contacto: Contacto | null | undefined, cabecera: Cabecera) {
  const nota = d.nota != null ? Number(d.nota).toFixed(2) : "—";
  const pct = Number(d.porcentaje) || 0;
  const color = pct >= 70 ? "#16a34a" : pct >= 50 ? "#de911d" : "#dc2626";
  const nombre = String(d.alumno || "").split(" ")[0];

  const motivo: Record<string, string> = {
    entregado: "Lo entregó completo.",
    tiempo: "Se le acabó el tiempo y se entregó con lo que llevaba hecho.",
    congelado: "El examen se cerró antes de tiempo porque salió de la pantalla del examen tres veces.",
  };

  const areas = (d.areas ?? []).map((a: Record<string, any>) => {
    const p = Number(a.porcentaje) || 0;
    const c = p >= 70 ? "#16a34a" : p >= 40 ? "#de911d" : "#dc2626";
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eef2f6;color:#243b53">${escapar(AREAS[a.area] ?? a.area)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eef2f6;text-align:right;white-space:nowrap">
        <strong style="color:${c}">${p}%</strong>
        <span style="color:#55708a;font-size:12px"> · ${a.aciertos} de ${a.preguntas}</span>
      </td>
    </tr>`;
  }).join("");

  // Lo que hizo bien y lo que no, sin las respuestas correctas: el banco de
  // preguntas se reutiliza en los exámenes siguientes, y el detalle con la
  // corrección es del profesor. Lo que la casa necesita saber es en qué se
  // equivocó, no cuál era la respuesta.
  const falladas = (d.preguntas ?? []).filter((p: Record<string, any>) => p.respondida && !p.correcta);
  const sinContestar = (d.preguntas ?? []).filter((p: Record<string, any>) => !p.respondida);

  const listaFalladas = falladas.length ? `
    <p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:#243b53">En qué se equivocó</p>
    <ul style="margin:0 0 4px;padding-left:18px;font-size:13px;color:#243b53;line-height:1.7">
      ${falladas.map((p: Record<string, any>) =>
        `<li>${escapar(p.enunciado)} <span style="color:#55708a">(${escapar(AREAS[p.area] ?? p.area)})</span></li>`).join("")}
    </ul>
    <p style="margin:0;font-size:12px;color:#55708a">Estas son las que conviene repasar con quien le da clase.</p>` : "";

  const listaSin = sinContestar.length ? `
    <p style="margin:14px 0 6px;font-size:13px;color:#55708a">
      No alcanzó a contestar ${sinContestar.length} ${sinContestar.length === 1 ? "pregunta" : "preguntas"}.
    </p>` : "";

  const avisoSalidas = (Number(d.salidas) || 0) > 0 ? `
    <p style="margin:0 0 18px;padding:14px;background:#fff5f5;border-left:4px solid #dc2626;border-radius:8px;font-size:13px;color:#243b53">
      Durante el examen salió de la pantalla ${d.salidas} ${d.salidas === 1 ? "vez" : "veces"}.
      El examen avisa de esto porque se hace sin ayuda; si fue sin querer, conviene comentárselo a quien le da clase.
    </p>` : "";

  const felicita = pct >= 70
    ? `<p style="margin:0 0 18px;font-size:14px;color:#243b53">Le fue bien: ${escapar(nombre)} respondió la mayor parte de lo que se le pidió.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resultado del examen de ${escapar(d.alumno)}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">

  ${cabecera("Resultado de un examen")}

  <tr><td style="padding:24px">
    <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#102a43">${escapar(d.alumno)}</p>
    <p style="margin:0 0 20px;font-size:13px;color:#55708a">
      ${escapar(d.titulo)}${d.entregado_at ? " · " + fecha(d.entregado_at) : ""}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-bottom:18px">
      <tr>
        <td style="padding:16px;background:#f0f4f8;border-radius:10px;text-align:center">
          <div style="font-size:34px;font-weight:700;color:${color}">${nota}</div>
          <div style="font-size:11px;color:#55708a;margin-top:2px">nota de 10</div>
        </td>
        <td style="padding:16px;background:#f0f4f8;border-radius:10px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#102a43">${d.respondidas ?? 0}/${d.total_items ?? 0}</div>
          <div style="font-size:11px;color:#55708a;margin-top:2px">preguntas contestadas</div>
        </td>
        <td style="padding:16px;background:#f0f4f8;border-radius:10px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#102a43">${d.minutos ?? 0} min</div>
          <div style="font-size:11px;color:#55708a;margin-top:2px">tenía para hacerlo</div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 18px;font-size:13px;color:#55708a">
      La nota tiene en cuenta la dificultad de cada pregunta: las más difíciles valen más.
      ${escapar(motivo[d.motivo_cierre] ?? "")}
    </p>

    ${avisoSalidas}
    ${felicita}

    ${areas ? `
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#243b53">Cómo le fue en cada cosa</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${areas}</table>` : ""}

    ${listaFalladas}
    ${listaSin}

    <p style="margin:20px 0 0;font-size:13px;color:#55708a;line-height:1.6">
      ${contacto
        ? `Cualquier consulta, respondemos por WhatsApp al
           <a href="${contacto.enlace}" style="color:#a85a0d">${escapar(contacto.texto)}</a>.`
        : "Cualquier consulta, respóndenos este mismo correo."}
    </p>
  </td></tr>

  <tr><td style="background:#f0f4f8;padding:16px 24px;font-size:11px;color:#55708a;line-height:1.6">
    Recibes este correo porque en la Academia figuras como persona encargada de ${escapar(d.alumno)}.
    <br><a href="${sitio}" style="color:#55708a">${sitio.replace(/^https:\/\//, "")}</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
