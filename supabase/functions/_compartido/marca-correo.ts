// La cabecera de los correos que llegan a la casa, con la marca de la academia.
//
// Es la misma franja en los tres correos —el informe a la casa, el aviso de
// cobro y el resultado de un examen— y por eso está escrita UNA vez: tres
// copias de la misma cabecera se separarían a la primera corrección, y la mitad
// de las familias vería el logo y la otra mitad no, sin que nada falle.
//
// - Alumno de UNA academia: su color de fondo, su logo y su nombre.
// - En dos o en ninguna: la cabecera de siempre de Ajedrez Integral (la misma
//   regla que el remitente y que el encabezado de la plataforma).
//
// El color ya lo exige la base con contraste 4,5 contra blanco
// (color_con_texto_blanco), así que encima va todo en blanco: el ámbar de la
// etiqueta de siempre no está medido contra un color que eligió otra persona.
// Igual se vuelve a comprobar que sea un #rrggbb antes de meterlo en un style:
// es texto de la base que termina dentro de un atributo.

export type Marca = { nombre: string; color: string | null; logoUrl: string | null };

const FONDO = "#102a43";
const AMBAR = "#f0b429";

function escapar(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const esColor = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);

/** La franja de arriba. `tituloHtml` ya viene escapado por quien la llama. */
export function cabeceraCorreo(marca: Marca | null | undefined, tituloHtml: string, etiquetaColor = AMBAR) {
  const fondo = marca && esColor(marca.color) ? marca.color : FONDO;
  const conColor = fondo !== FONDO;
  const logo = marca?.logoUrl && /^https:\/\/[^"'<>\s]+$/.test(marca.logoUrl)
    ? `<img src="${escapar(marca.logoUrl)}" alt="" width="36" height="36" style="display:inline-block;vertical-align:middle;width:36px;height:36px;border-radius:8px;background:#ffffff;padding:3px;margin-right:8px;object-fit:contain">`
    : "";
  const etiqueta = marca ? escapar(marca.nombre) : "Ajedrez Integral";
  return `<tr><td style="background:${fondo};padding:22px 24px">
    <div style="color:${conColor || logo ? "#ffffff" : etiquetaColor};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${logo}<span style="vertical-align:middle">${etiqueta}</span></div>
    <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:4px">${tituloHtml}</div>
  </td></tr>`;
}

/** Con qué nombre firma el asunto. */
export function firmaDe(marca: Marca | null | undefined) {
  return marca?.nombre?.trim() || "Ajedrez Integral";
}
