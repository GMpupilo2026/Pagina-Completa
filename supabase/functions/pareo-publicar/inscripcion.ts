// La inscripción configurable por evento, del lado de la función
// (js/inscripcion-evento.js arma el formulario con la misma configuración).
//
// La configuración viaja dentro del torneo publicado, en
// `datos.inscripcion` de pareo_publicados (jsonb: sin migración). Acá se
// limpia campo por campo al publicar (limpiarInscripcion) y, al inscribir,
// se vuelve a comprobar lo que el navegador ya revisó (no se le cree):
// el cierre con su hora de Costa Rica, los campos obligatorios y la
// categoría por el año de nacimiento.
//
// Un torneo sin configuración queda exactamente como antes: { abierta,
// hasta }, y la función acepta lo mismo que aceptaba. Ver «La inscripción
// configurable por evento» en docs/decisiones/cuentas-y-formularios.md.
//
// Sin Deno ni red: el verificador (herramientas/verificar-inscripcion-evento.js)
// lo carga con Node.

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const anio = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) >= 1900 && Number(v) <= 2100 ? Number(v) : 0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Los campos que se pueden configurar y lo que se guarda de cada uno.
const CAMPOS = ["nombre", "nacimiento", "sexo", "categoria", "institucion", "elo", "fide", "nota"];
// Los textos del formulario que se pueden cambiar (las claves de TEXTOS en js/inscripcion-evento.js).
const CLAVE_TEXTO = /^[a-zA-Z]{2,30}$/;

export type Categoria = { nombre: string; desde: number; hasta: number; torneo: string; juegaEn: string };
export type Inscripcion = {
  abierta: boolean; hasta: string; cierre?: string; categorias?: Categoria[]; ramaEnCategoria?: boolean;
  campos?: Record<string, Obj>; declaraciones?: { id: string; texto: string; nota: string }[];
  notaFija?: string; idioma?: string; textos?: Record<string, string>;
};

function limpiarCampo(nombre: string, v: unknown): Obj | null {
  if (!esObj(v)) return null;
  const x: Obj = {};
  if (typeof v.pedir === "boolean") x.pedir = v.pedir;
  if (typeof v.obligatorio === "boolean") x.obligatorio = v.obligatorio;
  if (nombre === "nombre" && ["uno", "apellidos"].includes(v.forma as string)) x.forma = v.forma;
  if (nombre === "institucion" && typeof v.defecto === "string") x.defecto = texto(v.defecto, 100);
  if (nombre === "fide") {
    if (typeof v.buscar === "boolean") x.buscar = v.buscar;
    if (typeof v.federacion === "string" && /^([A-Z]{3})?$/.test(v.federacion)) x.federacion = v.federacion;
  }
  if (nombre === "nacimiento") {
    if (fecha(v.min)) x.min = v.min;
    if (fecha(v.max)) x.max = v.max;
  }
  return Object.keys(x).length ? x : null;
}

/* Lo que se guarda de `torneo.inscripcion`: { abierta, hasta } como antes y,
   solo si vienen y tienen forma, las claves de la configuración. */
export function limpiarInscripcion(v: Obj): Inscripcion {
  const ins: Inscripcion = { abierta: v.abierta === true, hasta: fecha(v.hasta) };
  if (typeof v.cierre === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.cierre)) ins.cierre = v.cierre;
  if (Array.isArray(v.categorias)) {
    const cats = v.categorias.slice(0, 12).filter(esObj).map((k) => ({
      nombre: texto(k.nombre, 30), desde: anio(k.desde), hasta: anio(k.hasta),
      torneo: typeof k.torneo === "string" && UUID.test(k.torneo) ? k.torneo : "", juegaEn: texto(k.juegaEn, 30),
    })).filter((k) => k.nombre && k.desde && k.hasta && k.desde <= k.hasta);
    if (cats.length) ins.categorias = cats;
  }
  if (v.ramaEnCategoria === true) ins.ramaEnCategoria = true;
  if (esObj(v.campos)) {
    const campos: Record<string, Obj> = {};
    for (const k of CAMPOS) { const c = limpiarCampo(k, v.campos[k]); if (c) campos[k] = c; }
    if (Object.keys(campos).length) ins.campos = campos;
  }
  if (Array.isArray(v.declaraciones)) {
    const ds = v.declaraciones.slice(0, 5).filter(esObj).map((d, i) => ({
      id: typeof d.id === "string" && /^[a-z0-9-]{1,20}$/.test(d.id) ? d.id : "d" + i, texto: texto(d.texto, 300), nota: texto(d.nota, 200),
    })).filter((d) => d.texto);
    if (ds.length) ins.declaraciones = ds;
  }
  if (texto(v.notaFija, 200)) ins.notaFija = texto(v.notaFija, 200);
  if (["es", "en"].includes(v.idioma as string)) ins.idioma = v.idioma as string;
  if (esObj(v.textos)) {
    const tx: Record<string, string> = {};
    for (const [k, s] of Object.entries(v.textos).slice(0, 60)) if (CLAVE_TEXTO.test(k) && typeof s === "string") tx[k] = s.slice(0, 400);
    if (Object.keys(tx).length) ins.textos = tx;
  }
  return ins;
}

// «2026-11-20T14:05»: ahora, en hora de Costa Rica (siempre UTC−6, sin horario de verano).
export const ahoraCR = (ahora: Date = new Date()) =>
  ahora.toLocaleString("sv-SE", { timeZone: "America/Costa_Rica" }).slice(0, 16).replace(" ", "T");

/* ¿Está cerrada? Abierta en Pareo, «hasta» es un día que entra completo y
   «cierre» una hora de Costa Rica (desde ese minuto, cerrada). */
export function cerrada(ins: unknown, ahora: Date = new Date()): boolean {
  if (!esObj(ins) || ins.abierta !== true) return true;
  const ya = ahoraCR(ahora);
  if (typeof ins.hasta === "string" && ins.hasta && ins.hasta < ya.slice(0, 10)) return true;
  if (typeof ins.cierre === "string" && ins.cierre && ya >= ins.cierre) return true;
  return false;
}

type Fila = { nombre: string; institucion: string; categoria: string; sexo: string; nacimiento: string | null; nota: string } & Obj;

/* Lo obligatorio y la categoría, con la configuración del torneo al que
   llega la inscripción. Devuelve el error para quien inscribe, o la
   categoría que se guarda (la del año, con la rama si la trae). */
export function revisar(ins: unknown, fila: Fila, pid: string): { error: string } | { categoria: string } {
  const c = esObj(ins) ? ins : {};
  const campos = esObj(c.campos) ? c.campos : {};
  const obligatorio = (k: string) => esObj(campos[k]) && campos[k].obligatorio === true;
  const cats = Array.isArray(c.categorias) ? (c.categorias as Categoria[]) : [];
  if ((obligatorio("nacimiento") || cats.length) && !fila.nacimiento) return { error: "Falta la fecha de nacimiento de quien juega." };
  if (obligatorio("sexo") && !fila.sexo) return { error: "Falta la rama de quien juega." };
  if (obligatorio("institucion") && fila.institucion.length < 2) return { error: "Falta el colegio, la escuela o el club de quien juega." };
  if (obligatorio("nota") && fila.nota.length < 2) return { error: "Falta el comentario que pide quien organiza." };
  if (!cats.length) return { categoria: fila.categoria };
  const a = Number(String(fila.nacimiento).slice(0, 4));
  const cat = cats.find((k) => a >= k.desde && a <= k.hasta);
  if (!cat) return { error: "Con esa fecha de nacimiento no entra en ninguna categoría de este torneo." };
  if (cat.torneo && cat.torneo !== pid) return { error: "La categoría " + cat.nombre + " juega en otro torneo." };
  // La categoría la pone el año; de lo que llega se respeta solo la rama.
  return { categoria: fila.categoria === cat.nombre || fila.categoria.startsWith(cat.nombre + " ") ? fila.categoria : cat.nombre };
}
