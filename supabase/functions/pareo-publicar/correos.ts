// Los correos de «Torneos en Pareo Integral»: confirmar el correo de quien
// organiza, recuperar su organización, avisarle de una inscripción o de un
// reporte, y avisarle a administración de un reporte o de una solicitud del
// sello. Los manda pareo-publicar (ver su cabecera). Lo prueba
// herramientas/verificar-pareo-correos.js con Node, por eso no importa nada:
// la cabecera (cabeceraCorreo, de _compartido/marca-correo.ts) llega armada.
//
// Todo lo que viene de afuera (el nombre de un torneo, de quien juega, el
// detalle de un reporte) se escapa: lo escribió cualquiera.

export type Correo = { asunto: string; html: string };

const SITIO = "https://ajedrez-integral.com";

function escapar(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
// En el asunto no va HTML, pero tampoco saltos de línea (partirían la cabecera del correo).
const linea = (s: unknown, max = 120) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

function cuerpo(cabeceraHtml: string, parrafos: string[], boton?: { texto: string; url: string }, pie?: string) {
  const ps = parrafos.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join("");
  const b = boton && /^https:\/\/ajedrez-integral\.com\/[^"'<>\s]*$/.test(boton.url)
    ? `<p style="margin:20px 0"><a href="${escapar(boton.url)}" style="display:inline-block;background:#102a43;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">${escapar(boton.texto)}</a></p>
  <p style="margin:0 0 12px;font-size:13px;color:#486581">Si el botón no abre, copia este enlace: ${escapar(boton.url)}</p>`
    : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
${cabeceraHtml}
<tr><td style="padding:24px;color:#102a43;font-size:15px;line-height:1.5">${ps}${b}
  <p style="margin:16px 0 0;font-size:13px;color:#486581">${pie ?? "Pareo Integral, de Ajedrez Integral. Este correo lo manda el sistema; si no lo esperabas, puedes ignorarlo."}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Confirmar el correo de una organización (lo pidió quien organiza en Pareo Integral). */
export function correoConfirmar(cabecera: string, organizacion: string, url: string): Correo {
  return {
    asunto: "Confirma el correo de «" + linea(organizacion) + "» en Pareo Integral",
    html: cuerpo(cabecera, [
      `Escribiste este correo para <strong>${escapar(organizacion)}</strong> en Pareo Integral. Al confirmarlo, te vamos a avisar cuando alguien se inscriba en uno de tus torneos o lo reporte, y podrás recuperar tu organización si un día la pierdes.`,
      "El enlace vale 48 horas.",
    ], { texto: "Confirmar mi correo", url }, "Si no fuiste tú, ignora este correo: sin confirmarlo, no te vamos a escribir nada más."),
  };
}

/** Recuperar una o varias organizaciones con ese correo. */
export function correoRecuperar(cabecera: string, cuales: { nombre: string; url: string }[]): Correo {
  const lista = cuales.map((c) => `<li style="margin:0 0 8px"><a href="${escapar(c.url)}" style="color:#102a43;font-weight:700">${escapar(c.nombre)}</a></li>`).join("");
  return {
    asunto: "Recupera tu organización en Pareo Integral",
    html: cuerpo(cabecera, [
      "Pediste recuperar tu organización en Pareo Integral. Abre el enlace en la computadora o el celular donde quieres usarla: te deja una clave nueva y la anterior deja de servir.",
      `<ul style="margin:0;padding-left:20px">${lista}</ul>`,
      "Cada enlace vale una hora y sirve una sola vez.",
    ], undefined, "Si no lo pediste, ignora este correo: tu organización sigue igual."),
  };
}

/** A quien organiza: alguien se inscribió en su torneo. */
export function correoInscripcion(cabecera: string, torneo: string, inscrito: { nombre: string; institucion?: string; categoria?: string }): Correo {
  const de = [inscrito.institucion, inscrito.categoria].filter(Boolean).map(escapar).join(" · ");
  return {
    asunto: "Nueva inscripción en «" + linea(torneo) + "»: " + linea(inscrito.nombre, 80),
    html: cuerpo(cabecera, [
      `Se inscribió <strong>${escapar(inscrito.nombre)}</strong>${de ? ` (${de})` : ""} en <strong>${escapar(torneo)}</strong>.`,
      "Para aceptarla o rechazarla, abre el torneo en Pareo Integral, en la computadora donde lo organizas: ficha Archivos, «Inscripción antes del torneo».",
    ], { texto: "Abrir Pareo Integral", url: SITIO + "/pareo.html" }),
  };
}

/** El contacto de una inscripción es un correo (si es un teléfono, no se escribe). */
export const esCorreo = (s: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s ?? "").trim());

/** Los datos de la inscripción que se repiten en el correo (los escribió quien inscribió). */
export type DatosInscrito = {
  nombre: string; responsable?: string; institucion?: string; categoria?: string;
  sexo?: string; nacimiento?: string; elo?: number | null; fide_id?: string;
};
/** Lo que se sabe del torneo publicado (la ficha Torneo y el anuncio de Pareo). */
export type DatosEvento = {
  fecha?: string | null; fechaFin?: string | null; hora?: string; lugar?: string; ritmo?: string;
  rondas?: number; contacto?: string; bases?: string; url?: string;
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** «sábado 21 de noviembre de 2026» de un AAAA-MM-DD (sin zona horaria: es una fecha, no una hora). */
export function fechaLarga(f: unknown) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f ?? ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) return "";
  return `${DIAS[d.getUTCDay()]} ${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}`;
}
const fechaCorta = (f: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f ?? "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

// Una tabla de dos columnas (lo que es · su valor) sin las filas vacías.
function tabla(titulo: string, filas: [string, unknown][]) {
  const llenas = filas.filter(([, v]) => v != null && String(v).trim() !== "");
  if (!llenas.length) return "";
  const trs = llenas.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#486581;vertical-align:top;white-space:nowrap">${escapar(k)}</td><td style="padding:6px 0;font-weight:700;white-space:pre-line">${escapar(v)}</td></tr>`).join("");
  return `<strong style="display:block;margin:8px 0 4px;font-size:16px">${escapar(titulo)}</strong><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #d9e2ec;font-size:15px">${trs}</table>`;
}

/** A quien inscribió: quien organiza aceptó (la bienvenida al torneo, con sus
 *  datos) o rechazó su inscripción (con el motivo). */
export function correoDecision(cabecera: string, torneo: string, organizacion: string,
  inscrito: DatosInscrito, estado: "aceptada" | "rechazada", comentario: string, sePuedeResponder: boolean, evento: DatosEvento = {}): Correo {
  const acepta = estado === "aceptada";
  const quien = organizacion ? `<strong>${escapar(organizacion)}</strong>` : "Quien organiza el torneo";
  const c = comentario.trim();
  const hola = inscrito.responsable ? `Hola, ${escapar(inscrito.responsable)}. ` : "";
  const recuadro = c ? [`<span style="display:block;padding:12px 16px;background:#f0f4f8;border-left:4px solid ${acepta ? "#2f8132" : "#b42318"};border-radius:4px;white-space:pre-line"><strong>${acepta ? "Comentario de la organización" : "Motivo"}:</strong> ${escapar(c)}</span>`] : [];
  const datosInscrito = tabla("Datos de la inscripción", [
    ["Jugador", inscrito.nombre], ["Centro o club", inscrito.institucion], ["Categoría", inscrito.categoria],
    ["Sexo", inscrito.sexo === "F" ? "Femenino" : inscrito.sexo === "M" ? "Masculino" : ""],
    ["Nacimiento", fechaCorta(inscrito.nacimiento)], ["Elo", inscrito.elo ? String(inscrito.elo) : ""], ["ID FIDE", inscrito.fide_id],
  ]);
  const responder = sePuedeResponder
    ? "responde a este correo: le llega a quien organiza."
    : "escríbele a quien organiza el torneo" + (evento.contacto ? ` (${escapar(evento.contacto)}).` : ".");
  const url = evento.url && /^https:\/\/ajedrez-integral\.com\//.test(evento.url) ? evento.url : SITIO + "/torneos-pareo.html";

  if (!acepta) {
    return {
      asunto: "Inscripción rechazada en «" + linea(torneo) + "»: " + linea(inscrito.nombre, 80),
      html: cuerpo(cabecera, [
        hola + `${quien} no aceptó la inscripción de <strong>${escapar(inscrito.nombre)}</strong> en <strong>${escapar(torneo)}</strong>.`,
        ...recuadro,
        "Si crees que es un error o quieres corregir algún dato, " + responder,
        datosInscrito,
      ].filter(Boolean), { texto: "Ver el torneo", url }),
    };
  }

  const fecha = fechaLarga(evento.fecha);
  const fin = evento.fechaFin && evento.fechaFin !== evento.fecha ? fechaLarga(evento.fechaFin) : "";
  const datosEvento = tabla("El torneo", [
    ["Torneo", torneo], ["Fecha", fecha ? fecha + (fin ? " al " + fin : "") : ""], ["Hora", evento.hora ? evento.hora + " (hora de Costa Rica)" : ""],
    ["Lugar", evento.lugar], ["Ritmo de juego", evento.ritmo], ["Rondas", evento.rondas ? String(evento.rondas) : ""],
    ["Contacto de la organización", evento.contacto],
  ]);
  const bases = evento.bases && evento.bases.trim()
    ? `<strong style="display:block;margin:8px 0 4px;font-size:16px">Bases y detalles</strong><span style="display:block;white-space:pre-line">${escapar(evento.bases.trim())}</span>`
    : "";
  return {
    asunto: "¡Bienvenida a «" + linea(torneo) + "»! Inscripción aceptada: " + linea(inscrito.nombre, 80),
    html: cuerpo(cabecera, [
      hola + `¡Les damos la bienvenida a <strong>${escapar(torneo)}</strong>! ${quien} aceptó la inscripción de <strong>${escapar(inscrito.nombre)}</strong>: ya está en la lista de jugadores.`,
      ...recuadro,
      datosInscrito,
      datosEvento,
      bases,
      "Si algún dato está mal o tienes una pregunta, " + responder + " Lleguen con tiempo para la acreditación. ¡Mucha suerte!",
    ].filter(Boolean), { texto: "Ver el torneo", url }),
  };
}

const MOTIVO: Record<string, string> = {
  inapropiado: "tiene contenido inapropiado", datos_personales: "muestra datos personales que no debería",
  falso: "es falso o de prueba", error: "tiene un error (nombres, resultados…)", otro: "otra cosa",
};

/** A quien organiza: reportaron su torneo (sin decir quién: no se guarda). */
export function correoReporteOrganizador(cabecera: string, torneo: string, motivo: string, url: string): Correo {
  return {
    asunto: "Reportaron tu torneo «" + linea(torneo) + "»",
    html: cuerpo(cabecera, [
      `Alguien reportó <strong>${escapar(torneo)}</strong> en «Torneos en Pareo Integral»: dice que ${escapar(MOTIVO[motivo] || MOTIVO.otro)}.`,
      "Ajedrez Integral lo va a revisar. Si es un error tuyo, corrígelo en Pareo Integral: el torneo publicado se pone al día solo.",
    ], { texto: "Ver el torneo", url }),
  };
}

/** A administración: llegó un reporte. */
export function correoReporteAdmin(cabecera: string, torneo: string, motivo: string, detalle: string, url: string): Correo {
  return {
    asunto: "⚑ Reporte de un torneo: «" + linea(torneo) + "»",
    html: cuerpo(cabecera, [
      `Reportaron <strong>${escapar(torneo)}</strong>: ${escapar(MOTIVO[motivo] || MOTIVO.otro)}.`,
      detalle ? `Detalle: «${escapar(detalle)}»` : "Sin detalle.",
    ], { texto: "Abrir la moderación", url }),
  };
}

/** A administración: una organización pide el sello «Verificado». */
export function correoSelloAdmin(cabecera: string, s: { organizacion: string; quien: string; representa: string; contacto: string; nota?: string }, url: string): Correo {
  return {
    asunto: "✓ Piden el sello «Verificado»: «" + linea(s.organizacion) + "»",
    html: cuerpo(cabecera, [
      `<strong>${escapar(s.organizacion)}</strong> pide el sello «Verificado».`,
      `Lo pide ${escapar(s.quien)}, en nombre de ${escapar(s.representa)}. Contacto: ${escapar(s.contacto)}.`,
      s.nota ? `Nota: «${escapar(s.nota)}»` : "",
    ].filter(Boolean), { texto: "Revisar la solicitud", url }),
  };
}

/** Seguir a un jugador por correo: confirmar antes de mandarle nada. */
export function correoSeguirConfirmar(cabecera: string, jugador: string, url: string): Correo {
  return {
    asunto: "Confirma los avisos de «" + linea(jugador) + "» en Pareo Integral",
    html: cuerpo(cabecera, [
      `Pediste que te avisemos por correo cuando <strong>${escapar(jugador)}</strong> juegue en un torneo publicado en Pareo Integral: su mesa y su rival en cada ronda, y su puesto al terminar.`,
      "El enlace vale 48 horas.",
    ], { texto: "Sí, quiero los avisos", url }, "Si no fuiste tú, ignora este correo: sin confirmarlo, no te vamos a escribir nada más."),
  };
}

// El pie de cada aviso: cómo dejar de recibirlos, con un enlace propio.
const pieBaja = (url: string) =>
  `¿Ya no quieres estos avisos? <a href="${escapar(url)}" style="color:#486581">Dejar de recibirlos</a>. Pareo Integral, de Ajedrez Integral.`;

/** El aviso de una ronda nueva (la línea la arma avisos.ts). */
export function correoAvisoRonda(cabecera: string, jugador: string, texto: string, url: string, baja: string): Correo {
  return {
    asunto: linea(texto, 150),
    html: cuerpo(cabecera, [escapar(texto)], { texto: "Ver el torneo", url }, pieBaja(baja)),
  };
}

/** El aviso del final del torneo. */
export function correoAvisoFin(cabecera: string, jugador: string, texto: string, url: string, baja: string): Correo {
  return {
    asunto: linea(texto, 150),
    html: cuerpo(cabecera, [escapar(texto)], { texto: "Ver la clasificación", url }, pieBaja(baja)),
  };
}
