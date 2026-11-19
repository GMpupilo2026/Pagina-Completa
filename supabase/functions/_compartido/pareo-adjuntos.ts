// Los árbitros adjuntos de Pareo Integral y lo que mandan (pareo_adjuntos y
// pareo_cola). Solo lo que se limpia: nada de esto le cree al navegador.
//
// El código de un enlace de adjunto es el que Pareo ya generaba
// (`nuevoCodigoVivo` en js/pareo/pagina.js): 8 símbolos de un alfabeto de 31,
// sin 0, 1, i, l ni o, que se confunden al leerlos o dictarlos. Al escribirlo
// a mano da igual mayúsculas, espacios o guiones.
//
// Ver «Pareo Integral: lo que anotan los adjuntos queda en la base» en
// docs/decisiones/juegos-y-torneos.md.

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ent = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : 0;
};

// Los resultados en la notación de Pareo, y los tipos de incidencia que el
// principal conoce (cualquier otro llega como «adjunto»).
export const RESULTADOS = new Set(["1-0", "=", "0-1", "+-", "-+", "--"]);
const TIPOS_NOTA = new Set(["reclamo", "sancion", "decision", "otra"]);

export function limpiarCodigo(v: unknown): string {
  const c = typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return /^[a-hjkmnp-z2-9]{8}$/.test(c) ? c : "";
}

export type Adjunto = { codigo: string; nombre: string; desde: number; hasta: number; activo: boolean };

// La lista de adjuntos de un torneo, como la guarda Pareo (`{ codigo, rango:
// "1-10", nombre, activo }`). Hasta 60; uno repetido o con un rango que no
// existe se deja afuera. null si no llegó una lista.
export function limpiarAdjuntos(v: unknown): Adjunto[] | null {
  if (!Array.isArray(v)) return null;
  const vistos = new Set<string>();
  const salida: Adjunto[] = [];
  for (const a of v.slice(0, 60)) {
    if (!esObj(a)) continue;
    const codigo = limpiarCodigo(a.codigo);
    if (!codigo || vistos.has(codigo)) continue;
    const [d, h] = String(a.rango ?? "").split("-");
    const desde = ent(d, 1, 999), hasta = ent(h, 1, 999);
    if (!desde || !hasta || desde > hasta) continue;
    vistos.add(codigo);
    salida.push({ codigo, nombre: str(a.nombre, 60), desde, hasta, activo: a.activo === true });
  }
  return salida;
}

// Lo que manda un adjunto: un resultado («resultado») o una incidencia
// («nota»), con los mismos campos que viajaban por el canal en vivo. null si
// no sirve.
export function limpiarEnvio(evento: string, d: unknown): Obj | null {
  if (!esObj(d)) return null;
  const mesa = ent(d.mesa, 1, 999);
  if (evento === "resultado") {
    if (!mesa || typeof d.r !== "string" || !RESULTADOS.has(d.r)) return null;
    const x: Obj = { mesa, r: d.r };
    const tablero = ent(d.tablero, 1, 20);
    if (tablero) x.tablero = tablero;
    if (d.corrige === true) x.corrige = true;
    return x;
  }
  if (evento === "nota") {
    const textoNota = str(d.texto, 500), autor = str(d.autor, 60);
    if (!textoNota || !autor) return null;
    const x: Obj = { texto: textoNota, autor };
    if (typeof d.tipo === "string" && TIPOS_NOTA.has(d.tipo)) x.tipo = d.tipo;
    if (mesa) x.mesa = mesa;
    const lado = str(d.lado, 8);
    if (/^[a-z0-9]{1,8}$/.test(lado)) x.lado = lado;
    const articulo = str(d.articulo, 20);
    if (/^[a-z0-9.]{1,20}$/i.test(articulo)) x.articulo = articulo;
    return x;
  }
  return null;
}
