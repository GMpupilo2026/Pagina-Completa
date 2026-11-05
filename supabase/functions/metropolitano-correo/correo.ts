// El correo de confirmación de una inscripción al Metropolitano 2026: qué se
// le manda a quién. Sin red ni base: lo usa index.ts y lo prueba
// herramientas/verificar-metropolitano.js con las mismas filas que guarda la base.
//
// A QUIÉN
// Un envío es una persona sola o una delegación entera (mismo `grupo`).
// - El correo del envío (el del delegado, o el de la persona sola) recibe UN
//   correo con todas las personas, sus códigos y el total.
// - Cada integrante que dejó un correo suyo, distinto, recibe el suyo, solo con
//   lo de esa persona y quién la inscribió.
// - Una misma dirección nunca recibe dos correos del mismo envío.
//
// QUÉ DICE
// El código MET-…, el rol y los torneos, el monto y si el pago está por
// revisar, el hospedaje (con lo esencial de sus condiciones: la puerta a las
// 10:30 p.m. y la ropa de cama), la alimentación (cada plato elegido con quién
// lo prepara, o «aún no lo sabe»), el parqueo con su placa, el enlace a «Mi ronda
// y mi mesa» de cada jugador (el mismo del QR del gafete) y a la página del
// torneo, y el contacto de la organización. Ver «Los correos de confirmación»
// en docs/decisiones/cuentas-y-formularios.md.
//
// LOS OTROS CORREOS (de quien mandó el envío)
// - El del pago: verificado, o rechazado con el motivo y el enlace para subir
//   otro comprobante (correoPago).
// - El enlace para corregir la inscripción, cuando lo pide otra vez con su
//   código (correoEnlace). El mismo enlace va también en la confirmación.
//   Ver «Los correos del pago» y «Corregir la inscripción».

import { cabeceraCorreo } from "./marca-correo.ts";

export type Fila = {
  id: string; numero: number; grupo?: string | null; delegacion?: string | null; es_delegado?: boolean;
  rol: string; sexo?: string | null; nombre: string; apellidos: string; correo?: string | null;
  fide_id?: string | null; nombre_fide?: string | null; titulo?: string | null;
  torneos?: string[] | null; monto_usd?: number | string | null; iva_usd?: number | string | null;
  pago_estado?: string | null; pago_metodo?: string | null;
  hospedaje?: boolean; hospedaje_desde?: string | null; hospedaje_hasta?: string | null;
  acepta_hospedaje?: boolean; parqueo?: boolean; placa?: string | null;
  comidas?: string[] | null; viaje?: { llegada?: string; salida?: string } | null;
  comidas_desde?: string | null; comidas_hasta?: string | null; alimentacion?: string | null;
  menu?: { comida: string; nombre: string; cocina?: string | null; precio_usd: number | string; dias: number; usd: number | string }[] | null;
  tal_vez?: { comidas?: string[]; desde?: string; hasta?: string } | null;
};
export type Correo = { para: string; asunto: string; html: string; texto: string; ids: string[] };

const PAGINA = "https://ajedrez-integral.com/metropolitano-2026";
// El enlace para corregir: el secreto va detrás del #, que no viaja al servidor.
export const enlaceCorregir = (token?: string | null) => (token ? "https://ajedrez-integral.com/metropolitano-mi-inscripcion.html#t=" + token : "");
export const CONTACTO = "metropolitano@fcacostarica.com";
const WHATSAPP = "https://chat.whatsapp.com/HMN8sTyhZ8sAayt39m7XIV";
const TORNEOS: Record<string, string> = { A: "Metropolitano A", B: "Metropolitano B", U14: "Metropolitano U14", BLITZ: "Metropolitano Blitz" };
const ROLES: Record<string, [string, string]> = {
  jugador: ["Jugador", "Jugadora"], entrenador: ["Entrenador", "Entrenadora"],
  acompanante: ["Acompañante", "Acompañante"], delegado: ["Delegado", "Delegada"], arbitro: ["Árbitro", "Árbitra"],
};
const TITULADOS = ["GM", "IM", "WGM"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const codigoDe = (x: Fila) => "MET-" + String(x.numero).padStart(4, "0");
const nombreDe = (x: Fila) => (String(x.nombre || "") + " " + String(x.apellidos || "")).trim();
const rolDe = (x: Fila) => (ROLES[x.rol] ? ROLES[x.rol][x.sexo === "f" ? 1 : 0] : x.rol);
const dinero = (n: unknown) => "$" + (Number(n) || 0).toFixed(2);
// «2026-12-25» → «25 de diciembre» (un día de calendario: sin zona horaria).
function dia(d?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  return m ? Number(m[3]) + " de " + MESES[Number(m[2]) - 1] : "";
}
const esTitulado = (x: Fila) => x.rol === "jugador" && TITULADOS.includes(String(x.titulo || "").toUpperCase());
// El mismo enlace del QR del gafete (js/metropolitano-gafete.js, qrDe): el nombre como en FIDE, sin tildes.
export function enlaceRonda(x: Fila) {
  if (x.rol !== "jugador") return "";
  const n = String(x.nombre_fide || [x.apellidos, x.nombre].filter(Boolean).join(", ")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return n ? PAGINA + "#mi-ronda=" + encodeURIComponent(n) : "";
}

// Las líneas de una persona: [etiqueta, texto].
function lineas(x: Fila): [string, string][] {
  const l: [string, string][] = [];
  const torneos = (x.torneos || []).map((t) => TORNEOS[t] || t);
  l.push(["Se inscribe como", rolDe(x) + (x.es_delegado && x.rol !== "delegado" ? (x.sexo === "f" ? " (y delegada del grupo)" : " (y delegado del grupo)") : "")]);
  if (x.rol === "jugador" && torneos.length) l.push(["Torneos", torneos.join(" y ")]);
  if (x.fide_id) l.push(["ID FIDE", String(x.fide_id) + (x.titulo ? " · " + x.titulo : "")]);
  const monto = Number(x.monto_usd) || 0;
  l.push(["Monto", monto > 0 ? dinero(monto) + (Number(x.iva_usd) > 0 ? " (con " + dinero(x.iva_usd) + " de IVA)" : "") : "Sin costo"]);
  if (esTitulado(x)) {
    l.push(["Hospedaje y alimentación", "Los da la organización" + (x.viaje && x.viaje.llegada ? ", del " + dia(x.viaje.llegada) + " al " + dia(x.viaje.salida) : "")]);
  } else if (x.hospedaje) {
    l.push(["Hospedaje", "Solicitado del " + dia(x.hospedaje_desde) + " al " + dia(x.hospedaje_hasta) + ", en habitación compartida. La organización confirma la disponibilidad y el costo por correo."]);
  }
  if (!esTitulado(x)) {
    // La alimentación: los platos elegidos (con quién los prepara), lo pedido
    // sin menú, o «aún no lo sabe». Ver «Los menús de la alimentación».
    const COMIDA: Record<string, string> = { desayuno: "Desayuno", almuerzo: "Almuerzo", cena: "Cena" };
    (x.menu || []).forEach((m) => l.push([COMIDA[m.comida] || m.comida,
      m.nombre + (m.cocina ? ", de " + m.cocina : "") + ", del " + dia(x.comidas_desde) + " al " + dia(x.comidas_hasta) + " (" + dinero(m.precio_usd) + " por día: " + dinero(m.usd) + ")"]));
    const sinMenu = (x.comidas || []).filter((c) => !(x.menu || []).some((m) => m.comida === c));
    if (sinMenu.length) l.push(["Alimentación", "Solicitada: " + sinMenu.map((c) => (COMIDA[c] || c).toLowerCase()).join(", ") + ", del " + dia(x.comidas_desde) + " al " + dia(x.comidas_hasta) + ". La organización confirma la disponibilidad y el costo por correo."]);
    if (x.alimentacion === "tal_vez") l.push(["Alimentación", "Aún no lo sabe. Si decide comer con nosotros, escribe a " + CONTACTO + "."]);
  }
  if (x.parqueo && x.placa) l.push(["Parqueo", "Para el vehículo de placa " + x.placa + ": solo entra ese vehículo."]);
  return l;
}

const pagoTexto = (filas: Fila[]) => {
  const total = filas.reduce((s, x) => s + (Number(x.monto_usd) || 0), 0);
  if (total <= 0) return "La inscripción no tiene costo.";
  return "Total: " + dinero(total) + ". La organización revisa el comprobante de pago y te avisa cuando quede verificado.";
};

// El marco de todos los correos: la franja de la marca con su título y el contenido.
function marco(titulo: string, contenido: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">`
    + `<div style="max-width:600px;margin:0 auto;background:#ffffff">`
    // (la franja es una fila de tabla: suelta, muchos programas de correo la botan)
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">`
    + cabeceraCorreo(null, titulo) + `</table>`
    + `<div style="padding:20px 22px">` + contenido + `</div></div></body></html>`;
}
const botonCorregir = (enlace: string, texto: string) => enlace
  ? `<p style="margin:0 0 14px"><a href="${esc(enlace)}" style="display:inline-block;background:#102a43;color:#ffffff;font-weight:bold;text-decoration:none;padding:10px 16px;border-radius:8px">${esc(texto)}</a></p>`
  : "";

function cuerpo(filas: Fila[], intro: string, conTotal: boolean, enlace = "") {
  const hosp = filas.filter((x) => x.hospedaje || esTitulado(x));
  const titul = hosp.length > 0 && hosp.every(esTitulado);
  const bloquesHtml = filas.map((x) => {
    const ronda = enlaceRonda(x);
    return `<div style="border:1px solid #d9e2ec;border-radius:12px;padding:14px 16px;margin:0 0 12px">`
      + `<p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:#102a43">${esc(codigoDe(x))} · ${esc(nombreDe(x))}</p>`
      + `<table role="presentation" style="border-collapse:collapse;font-size:14px;color:#243b53">`
      + lineas(x).map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;vertical-align:top;color:#486581;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`).join("")
      + `</table>`
      + (ronda ? `<p style="margin:8px 0 0;font-size:14px"><a href="${esc(ronda)}" style="color:#0b5cad;font-weight:bold">Mi ronda y mi mesa →</a> <span style="color:#486581">(el mismo enlace del QR de tu gafete: en cada ronda dice tu mesa, tu color y tu rival)</span></p>` : "")
      + `</div>`;
  }).join("");
  const avisoHosp = hosp.length
    ? `<div style="border-left:4px solid #f0b429;background:#fffbea;padding:12px 14px;margin:0 0 12px;font-size:14px;color:#243b53">`
      + `<p style="margin:0 0 4px;font-weight:bold">El hospedaje en el Estadio Nacional tiene condiciones estrictas</p>`
      + `<p style="margin:0">La puerta se cierra a las 10:30 p.m. y después nadie entra ni sale: quien llegue tarde no entra a dormir esa noche. Silencio, no se camina alrededor del estadio ni se entra a la cancha. `
      + (titul ? "La ropa de cama la da la organización." : "Se da solo el espacio y la cama: trae sábanas, almohada, cobija o saco de dormir y toalla (no hay ropa de cama ni cortinas; a los GM, IM y WGM se la da la organización).")
      + ` <a href="${PAGINA}#hospedaje" style="color:#0b5cad">Todas las condiciones →</a></p></div>`
    : "";
  const html = marco("Inscripción recibida · XLVII Torneo Internacional Metropolitano 2026",
    `<p style="margin:0 0 14px;font-size:15px;color:#243b53">${esc(intro)}</p>`
    + bloquesHtml
    + (conTotal ? `<p style="margin:0 0 14px;font-size:15px;font-weight:bold;color:#102a43">${esc(pagoTexto(filas))}</p>` : "")
    + avisoHosp
    + `<p style="margin:0 0 6px;font-size:14px;color:#243b53">Lleva tu gafete, impreso o en el celular, el día del torneo: del 26 al 30 de diciembre en el Estadio Nacional, La Sabana.</p>`
    + `<p style="margin:0 0 6px;font-size:14px"><a href="${PAGINA}" style="color:#0b5cad">Toda la información del torneo</a> · <a href="${WHATSAPP}" style="color:#0b5cad">Grupo de WhatsApp</a></p>`
    + (enlace ? `<p style="margin:14px 0 6px;font-size:14px;color:#243b53">¿Algún dato está mal? Con este enlace corriges el teléfono, el correo, la emergencia, el viaje, las fechas del hospedaje y la alimentación, la foto o la placa, y subes otro comprobante. Guárdalo: es solo tuyo.</p>` + botonCorregir(enlace, "Corregir mi inscripción") : "")
    + `<p style="margin:14px 0 0;font-size:13px;color:#486581">Si algún dato está mal o quieres corregir algo, responde a este correo o escribe a ${CONTACTO}. Organiza la Federación Costarricense de Ajedrez.</p>`);
  const texto = [intro, "",
    ...filas.flatMap((x) => [codigoDe(x) + " · " + nombreDe(x), ...lineas(x).map(([k, v]) => "  " + k + ": " + v), ...(enlaceRonda(x) ? ["  Mi ronda y mi mesa: " + enlaceRonda(x)] : []), ""]),
    ...(conTotal ? [pagoTexto(filas), ""] : []),
    ...(hosp.length ? ["Hospedaje en el Estadio Nacional: la puerta se cierra a las 10:30 p.m. y después nadie entra ni sale. " + (titul ? "La ropa de cama la da la organización." : "Trae tu ropa de cama: no hay sábanas ni cortinas.") + " Todas las condiciones: " + PAGINA + "#hospedaje", ""] : []),
    "Toda la información: " + PAGINA, ...(enlace ? ["Corregir mi inscripción (guárdalo, es solo tuyo): " + enlace] : []), "Corregir algo: " + CONTACTO].join("\n");
  return { html, texto };
}

const correoOk = (c: unknown) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(c || "").trim());

/** Los correos de un envío (las filas de una persona o de una delegación entera). */
export function correosDeEnvio(filas: Fila[], token?: string | null): Correo[] {
  if (!filas.length) return [];
  const orden = [...filas].sort((a, b) => a.numero - b.numero);
  const principal = orden.find((x) => x.es_delegado) || orden[0];
  const salida: Correo[] = [];
  const ya = new Set<string>();
  const dir = (x: Fila) => String(x.correo || "").trim().toLowerCase();
  const grupo = orden.length > 1 || !!principal.grupo;
  if (correoOk(principal.correo)) {
    const intro = grupo
      ? "Recibimos la inscripción de la delegación " + (principal.delegacion || "") + ": " + orden.length + (orden.length === 1 ? " persona" : " personas") + ". Este es el resumen con el código de cada una."
      : "Hola, " + principal.nombre + ": recibimos tu inscripción al XLVII Torneo Internacional Metropolitano 2026. Este es tu resumen.";
    const { html, texto } = cuerpo(orden, intro, true, enlaceCorregir(token));
    salida.push({ para: dir(principal), asunto: grupo ? "Inscripción recibida: delegación " + (principal.delegacion || "") + " · Metropolitano 2026" : "Inscripción recibida: " + codigoDe(principal) + " · Metropolitano 2026", html, texto, ids: orden.map((x) => x.id) });
    ya.add(dir(principal));
  }
  for (const x of orden) {
    if (x === principal || !correoOk(x.correo) || ya.has(dir(x))) continue;
    ya.add(dir(x));
    const intro = "Hola, " + x.nombre + ": " + nombreDe(principal) + (principal.delegacion ? (principal.sexo === "f" ? ", delegada de " : ", delegado de ") + principal.delegacion + "," : "") + " te inscribió en el XLVII Torneo Internacional Metropolitano 2026. Este es tu resumen.";
    const { html, texto } = cuerpo([x], intro, false);
    salida.push({ para: dir(x), asunto: "Inscripción recibida: " + codigoDe(x) + " · Metropolitano 2026", html, texto, ids: [x.id] });
  }
  return salida;
}

/** Las filas pendientes, juntas por envío (la delegación o la persona sola). */
export function porEnvio(filas: Fila[]): Fila[][] {
  const m = new Map<string, Fila[]>();
  for (const x of filas) { const k = x.grupo || x.id; m.set(k, (m.get(k) || []).concat(x)); }
  return [...m.values()];
}

const principalDe = (filas: Fila[]) => { const o = [...filas].sort((a, b) => a.numero - b.numero); return o.find((x) => x.es_delegado) || o[0]; };

/** El correo del pago de un envío: verificado, o rechazado con su motivo y el enlace para subir otro comprobante. */
export function correoPago(filas: Fila[], estado: "verificado" | "rechazado", nota: string | null, token?: string | null): Correo | null {
  const p = principalDe(filas);
  if (!p || !correoOk(p.correo)) return null;
  const total = filas.filter((x) => (x.pago_estado || "") !== "no_aplica").reduce((s, x) => s + (Number(x.monto_usd) || 0), 0);
  const quien = p.delegacion ? "de la delegación " + p.delegacion : codigoDe(p);
  const enlace = enlaceCorregir(token);
  const codigos = filas.map((x) => codigoDe(x) + " · " + nombreDe(x));
  let asunto: string, intro: string, mas: string;
  if (estado === "verificado") {
    asunto = "Pago verificado: " + (p.delegacion ? "delegación " + p.delegacion : codigoDe(p)) + " · Metropolitano 2026";
    intro = "Hola, " + p.nombre + ": la organización verificó el pago " + quien + " (" + dinero(total) + "). La inscripción quedó lista.";
    mas = "Nos vemos del 26 al 30 de diciembre en el Estadio Nacional, La Sabana. Lleva tu gafete, impreso o en el celular.";
  } else {
    asunto = "No pudimos verificar el pago: " + (p.delegacion ? "delegación " + p.delegacion : codigoDe(p)) + " · Metropolitano 2026";
    intro = "Hola, " + p.nombre + ": la organización no pudo verificar el comprobante de pago " + quien + " (" + dinero(total) + ").";
    mas = (nota ? "El motivo: " + nota.trim().replace(/[.\s]+$/, "") + ". " : "")
      + (enlace ? "Sube otro comprobante con el botón de abajo: el pago vuelve a quedar por revisar." : "Responde a este correo con otro comprobante.")
      + " Mientras tanto la inscripción se mantiene, pero no queda confirmada hasta que el pago se verifique.";
  }
  const lista = `<ul style="margin:0 0 14px;padding-left:18px;font-size:14px;color:#243b53">` + codigos.map((c) => `<li>${esc(c)}</li>`).join("") + `</ul>`;
  const html = marco(estado === "verificado" ? "Pago verificado · Metropolitano 2026" : "Pago por corregir · Metropolitano 2026",
    `<p style="margin:0 0 12px;font-size:15px;color:#243b53">${esc(intro)}</p>` + lista
    + `<p style="margin:0 0 14px;font-size:15px;color:#243b53">${esc(mas)}</p>`
    + (estado === "rechazado" ? botonCorregir(enlace, "Subir otro comprobante") : botonCorregir(enlace, "Ver mi inscripción"))
    + `<p style="margin:14px 0 0;font-size:13px;color:#486581">Cualquier consulta: responde a este correo o escribe a ${CONTACTO}. Organiza la Federación Costarricense de Ajedrez.</p>`);
  const texto = [intro, "", ...codigos, "", mas, ...(enlace ? ["", (estado === "rechazado" ? "Subir otro comprobante: " : "Ver mi inscripción: ") + enlace] : []), "", "Consultas: " + CONTACTO].join("\n");
  return { para: String(p.correo).trim().toLowerCase(), asunto, html, texto, ids: [p.id] };
}

/** El enlace para corregir la inscripción, cuando se pide otra vez con el código y el correo. */
export function correoEnlace(filas: Fila[], token: string): Correo | null {
  const p = principalDe(filas);
  const enlace = enlaceCorregir(token);
  if (!p || !correoOk(p.correo) || !enlace) return null;
  const intro = "Hola, " + p.nombre + ": este es el enlace para ver y corregir la inscripción " + (p.delegacion ? "de la delegación " + p.delegacion : codigoDe(p)) + " al Metropolitano 2026.";
  const mas = "Guárdalo: es solo tuyo, y con él cualquiera puede cambiar los datos de esta inscripción. Si no lo pediste tú, no tienes que hacer nada.";
  const html = marco("Corregir la inscripción · Metropolitano 2026",
    `<p style="margin:0 0 12px;font-size:15px;color:#243b53">${esc(intro)}</p>` + botonCorregir(enlace, "Corregir mi inscripción")
    + `<p style="margin:0 0 14px;font-size:14px;color:#486581">${esc(mas)}</p>`
    + `<p style="margin:14px 0 0;font-size:13px;color:#486581">Consultas: ${CONTACTO}. Organiza la Federación Costarricense de Ajedrez.</p>`);
  return { para: String(p.correo).trim().toLowerCase(), asunto: "Tu enlace para corregir la inscripción · Metropolitano 2026", html,
    texto: [intro, "", enlace, "", mas, "", "Consultas: " + CONTACTO].join("\n"), ids: [p.id] };
}
