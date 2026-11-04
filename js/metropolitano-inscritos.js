/* El código de metropolitano-inscritos.html: las inscripciones al Torneo
 * Metropolitano 2026, para quien administra.
 *
 * Lee public.metropolitano_inscripciones (su RLS deja leer solo a quien
 * administra) de mil en mil —PostgREST corta en ~1000 sin avisar— y cambia el
 * estado de un pago con public.metropolitano_revisar(), que lo anota en la
 * bitácora. La foto y el comprobante viven en el bucket privado
 * «metropolitano-2026» y se enseñan como blob: (js/adjuntos.js). El gafete es
 * el mismo que la persona vio y validó (js/metropolitano-gafete.js).
 *
 * Ver «La inscripción del Metropolitano 2026» en
 * docs/decisiones/cuentas-y-formularios.md.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const R = window.MetropolitanoReglas;
  const BUCKET = "metropolitano-2026";
  const PAGO = {
    por_revisar: { texto: "Por revisar", clase: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100" },
    verificado: { texto: "Verificado", clase: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100" },
    rechazado: { texto: "Rechazado", clase: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100" },
    no_aplica: { texto: "Sin costo", clase: "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100" },
  };
  let filas = [];

  const codigo = (x) => "MET-" + String(x.numero).padStart(4, "0");
  const bajar = async (ruta) => { const { data, error } = await window.sb.storage.from(BUCKET).download(ruta); if (error) throw error; return data; };

  async function cargar() {
    $("estado").textContent = "Cargando las inscripciones…";
    const todas = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await window.sb.from("metropolitano_inscripciones").select("*").order("numero").range(desde, desde + 999);
      if (error) { $("estado").textContent = "No se pudieron leer las inscripciones: " + error.message; return; }
      todas.push(...data);
      if (data.length < 1000) break;
    }
    filas = todas;
    pintar();
  }

  function visibles() {
    const q = $("f-texto").value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const t = $("f-torneo").value, p = $("f-pago").value, anuladas = $("f-anuladas").checked;
    const rol = $("f-rol").value, pub = $("f-publicidad").value;
    return filas.filter((x) => {
      if (!anuladas && x.estado === "anulada") return false;
      if (t && !x.torneos.includes(t)) return false;
      if (p && x.pago_estado !== p) return false;
      if (rol && (rol === "delegado" ? !x.es_delegado && x.rol !== "delegado" : x.rol !== rol)) return false;
      if (pub && (pub === "si") !== !!x.acepta_publicidad) return false;
      if (!q) return true;
      return [x.nombre, x.apellidos, x.fide_id, x.documento, x.correo, codigo(x), x.club, x.delegacion].join(" ")
        .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q);
    });
  }

  function cifras() {
    const act = filas.filter((x) => x.estado === "activa");
    const n = (f) => act.filter(f).length;
    const usd = act.filter((x) => x.pago_estado === "verificado").reduce((s, x) => s + Number(x.monto_usd), 0);
    const datos = [
      ["Inscritos", act.length], ["Jugadores", n((x) => x.rol === "jugador")], ["Entrenadores", n((x) => x.rol === "entrenador")],
      ["Acompañantes", n((x) => x.rol === "acompanante")], ["Delegaciones", new Set(act.filter((x) => x.grupo).map((x) => x.grupo)).size],
      ["Autorizan publicidad", n((x) => x.acepta_publicidad)], ["Metropolitano A", n((x) => x.clasico === "A")], ["Metropolitano B", n((x) => x.clasico === "B")],
      ["U14", n((x) => x.clasico === "U14")], ["Blitz", n((x) => x.torneos.includes("BLITZ"))],
      ["Pagos por revisar", n((x) => x.pago_estado === "por_revisar")], ["Cobrado y verificado", R.dinero(usd)], ["Piden factura", n((x) => !!x.factura)],
      ["Sin ID FIDE", n((x) => x.sin_fide)], ["Piden hospedaje", n((x) => x.hospedaje)], ["Piden alimentación", n((x) => x.comidas.length > 0)], ["Con parqueo", n((x) => x.parqueo)],
      ["De otro país", n((x) => !/^costa rica$/i.test(x.pais_residencia))], ["Menores de edad", n((x) => R.edad(x.nacimiento, R.INICIO) < 18)],
    ];
    const caja = $("cifras"); caja.textContent = "";
    datos.forEach(([k, v]) => {
      const d = document.createElement("div"); d.className = "bg-white dark:bg-brand-900 rounded-xl shadow p-3";
      const a = document.createElement("p"); a.className = "text-xs text-brand-500 dark:text-brand-300"; a.textContent = k;
      const b = document.createElement("p"); b.className = "text-xl font-bold text-brand-800 dark:text-white"; b.textContent = v;
      d.append(a, b); caja.append(d);
    });
    // De dónde vienen los de Costa Rica, por provincia (para las estadísticas).
    const porProv = {};
    act.forEach((x) => { if (x.provincia) porProv[x.provincia] = (porProv[x.provincia] || 0) + 1; });
    const prov = Object.entries(porProv).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (prov.length) {
      const d = document.createElement("div"); d.className = "bg-white dark:bg-brand-900 rounded-xl shadow p-3 col-span-full";
      const a = document.createElement("p"); a.className = "text-xs text-brand-500 dark:text-brand-300"; a.textContent = "De Costa Rica, por provincia";
      const b = document.createElement("p"); b.className = "text-sm font-semibold text-brand-800 dark:text-white"; b.textContent = prov.map(([p, k]) => p + " " + k).join(" · ");
      d.append(a, b); caja.append(d);
    }
  }

  function celda(tr, hijos, clase) { const td = document.createElement("td"); td.className = "p-3 align-top " + (clase || ""); hijos.forEach((h) => td.append(h)); tr.append(td); return td; }
  const HABITACION = { organizacion: "con quien asigne la organización", compartida: "con su familia, delegación o acompañantes", doble: "doble", individual: "individual" };
  const acompananteTexto = (a) => [a.nombre, a.parentesco, a.documento, a.nacimiento && "nació el " + a.nacimiento].filter(Boolean).join(", ");
  function texto(t, clase) { const s = document.createElement("span"); s.className = "block " + (clase || ""); s.textContent = t; return s; }

  function detalles(x) {
    const d = document.createElement("details"); d.className = "mt-1";
    const s = document.createElement("summary"); s.className = "text-xs underline cursor-pointer"; s.textContent = "Todos los datos"; d.append(s);
    const dl = document.createElement("dl"); dl.className = "text-xs mt-2 space-y-1";
    const doc = { cedula: "Cédula", dimex: "DIMEX", pasaporte: "Pasaporte", otro: "Documento" }[x.documento_tipo];
    const datos = [
      [doc, x.documento], ["Nacimiento", x.nacimiento + " (" + R.edad(x.nacimiento, R.INICIO) + " años)"], ["Sexo", x.sexo === "f" ? "Femenino" : "Masculino"],
      ["Delegación", x.delegacion && x.delegacion + (x.es_delegado ? " (es el delegado)" : "")],
      ["Publicidad", x.acepta_publicidad ? "Autoriza el uso de su nombre y su foto" : "No autoriza el uso de su nombre ni de su foto"],
      ["Seguro y exoneración", x.acepta_seguro ? "Declaró su póliza y eximió a la FCA (texto " + (x.exoneracion_version || "—") + ")" : ""],
      ["Nombre en FIDE", x.nombre_fide],
      ["En el Drive", x.drive_en ? "Sí, desde " + window.HoraCR.fechaHora(x.drive_en) : x.drive_error ? "Todavía no: " + x.drive_error : "Todavía no (se manda sola)"],
      ["Código de descuento", x.codigo_descuento && x.codigo_descuento + " (" + x.descuento_pct + " %)"],
      ["Parqueo", x.parqueo ? "Placa " + x.placa + " (" + R.dinero(Number(x.parqueo_usd || 0)) + ")" : ""],
      ["Viene de", x.provincia && [x.canton, x.provincia].filter(Boolean).join(", ")],
      ["Nacionalidad / vive en", x.nacionalidad + " / " + x.pais_residencia], ["Correo", x.correo], ["Teléfono", x.telefono], ["Club", x.club],
      ["Responsable", x.responsable && [x.responsable.nombre, x.responsable.parentesco, x.responsable.documento, x.responsable.telefono, x.responsable.correo].filter(Boolean).join(" · ")],
      ["Emergencias", x.emergencia && [x.emergencia.nombre, x.emergencia.parentesco, x.emergencia.telefono].filter(Boolean).join(" · ")],
      ["Invitado titulado", x.rol === "jugador" && R.TITULOS_GRATIS.includes(x.titulo || "") ? "Hospedaje y alimentación de la organización" + (x.viaje && x.viaje.llegada ? ", del " + x.viaje.llegada + " al " + x.viaje.salida + (x.origen === "fuera" ? " según su vuelo" : " en el Estadio Nacional") : "") + (x.viaje && x.viaje.traslado ? "; pide transporte del aeropuerto" : "") : ""],
      ["Hospedaje", x.hospedaje ? x.hospedaje_desde + " a " + x.hospedaje_hasta + ", compartida " + (HABITACION[x.habitacion] || x.habitacion)
        + (x.acepta_compartir ? " (aceptó compartir)" : "") + (x.acompanantes ? ", " + x.acompanantes + " acompañantes" : "") : "No"],
      ["Acompañantes", (x.acompanantes_detalle || []).map(acompananteTexto).join(" · ")],
      ["Comidas", x.comidas.length ? x.comidas.join(", ") + " del " + x.comidas_desde + " al " + x.comidas_hasta : "No"], ["Dieta", x.dieta],
      ["Viaje", x.viaje && [x.viaje.llegada && "llega " + x.viaje.llegada, x.viaje.salida && "sale " + x.viaje.salida, x.viaje.vuelo, x.viaje.traslado && "traslado"].filter(Boolean).join(" · ")],
      ["Condición", x.condicion.join(", ")], ["Accesibilidad", x.accesibilidad],
      ["Factura electrónica", x.factura && [x.factura.nombre, x.factura.comercial, (R.FACTURA_TIPOS[x.factura.tipo] || {}).nombre + " " + x.factura.identificacion,
        x.factura.correo, x.factura.correo_copia, x.factura.telefono, x.factura.actividad && "actividad " + x.factura.actividad,
        [x.factura.distrito, x.factura.canton, x.factura.provincia].filter(Boolean).join(", "), x.factura.senas].filter(Boolean).join(" · ")],
      ["Referencia del pago", [x.pago_referencia, x.pago_fecha].filter(Boolean).join(" · ")],
      ["Se inscribió", window.HoraCR.fechaHora(x.creado)],
    ];
    datos.filter(([, v]) => v).forEach(([k, v]) => { const p = document.createElement("div"); const dt = document.createElement("dt"); dt.className = "font-semibold inline"; dt.textContent = k + ": "; const dd = document.createElement("dd"); dd.className = "inline"; dd.textContent = v; p.append(dt, dd); dl.append(p); });
    d.append(dl);
    return d;
  }

  function pintar() {
    cifras();
    const lista = visibles();
    const n = (k) => (k === 1 ? "1 inscripción" : k + " inscripciones");
    $("estado").textContent = lista.length === filas.length ? n(lista.length) + "." : lista.length + " de " + n(filas.length) + ".";
    const tb = $("filas"); tb.textContent = "";
    lista.forEach((x) => {
      const tr = document.createElement("tr");
      tr.className = "border-b border-brand-100 dark:border-brand-800" + (x.estado === "anulada" ? " opacity-60" : "");
      celda(tr, [texto(codigo(x), "font-mono font-semibold"), texto(x.estado === "anulada" ? "Anulada" : "", "text-xs text-red-700 dark:text-red-400")]);
      const fide = document.createElement("a");
      if (x.fide_id) { fide.href = "https://ratings.fide.com/profile/" + encodeURIComponent(x.fide_id); fide.target = "_blank"; fide.rel = "noopener"; fide.className = "text-xs underline"; fide.textContent = "FIDE " + x.fide_id + (x.federacion ? " · " + x.federacion : "") + " · Std " + (x.elo_estandar || "—"); }
      // El nombre que trajo FIDE: si no es el inscrito, se avisa (el perfil, en el enlace, dice el real).
      const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/gi, " ").trim().toLowerCase();
      const distinto = x.fide_id && x.nombre_fide && sinTildes(x.nombre_fide.replace(",", " ")).split(" ").sort().join(" ") !== sinTildes(x.apellidos + " " + x.nombre).split(" ").sort().join(" ");
      celda(tr, [texto((x.titulo ? x.titulo + " " : "") + x.apellidos + ", " + x.nombre, "font-semibold"), x.fide_id ? fide : texto("Sin ID FIDE: tramitarlo", "text-xs text-amber-800 dark:text-amber-300"),
        distinto ? texto("⚠ En FIDE se llama «" + x.nombre_fide + "»: revisa el perfil.", "text-xs font-semibold text-amber-800 dark:text-amber-300") : texto(""), detalles(x)], "min-w-[14rem]");
      const queEs = x.es_delegado ? "Delegado" + (x.rol === "delegado" ? "" : " y " + R.rolDe(x.rol, x.sexo).toLowerCase()) : R.rolDe(x.rol, x.sexo);
      celda(tr, [texto(queEs, "font-semibold"), texto(x.torneos.map((t) => R.TORNEOS[t].corto).join(" + "), "text-xs"),
        texto(x.delegacion || "", "text-xs text-brand-500 dark:text-brand-300"), texto(x.acepta_publicidad ? "📣 Autoriza publicidad" : "", "text-xs")]);
      celda(tr, [texto(Number(x.monto_usd) ? R.dinero(Number(x.monto_usd)) : "Sin costo", "font-semibold"),
        texto(Number(x.iva_usd) ? "incluye IVA " + R.dinero(Number(x.iva_usd)) + " · factura" : "", "text-xs"),
        texto(x.pago_metodo ? R.METODOS[x.pago_metodo].nombre : "", "text-xs")]);
      const archivos = document.createElement("div"); archivos.className = "flex gap-2";
      archivos.append(window.Adjuntos.celda([x.foto], bajar, x.nombre + " " + x.apellidos, "foto"));
      if (x.comprobante) archivos.append(window.Adjuntos.celda([x.comprobante], bajar, x.nombre + " " + x.apellidos, "comprobante"));
      // Los titulados de afuera: la foto del tiquete aéreo y la del pasaporte.
      if (x.tiquete) archivos.append(window.Adjuntos.celda([x.tiquete], bajar, x.nombre + " " + x.apellidos, "tiquete"));
      if (x.pasaporte) archivos.append(window.Adjuntos.celda([x.pasaporte], bajar, x.nombre + " " + x.apellidos, "pasaporte"));
      const gaf = document.createElement("button"); gaf.type = "button"; gaf.className = "text-xs underline mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
      gaf.textContent = "⬇ Gafete (PDF)"; gaf.addEventListener("click", () => gafete(x, gaf));
      celda(tr, [archivos, gaf]);
      celda(tr, [revision(x)], "min-w-[13rem]");
      tb.append(tr);
    });
  }

  function revision(x) {
    const caja = document.createElement("div"); caja.className = "space-y-1";
    const insignia = texto(PAGO[x.pago_estado].texto, "inline-block rounded px-2 py-0.5 text-xs font-semibold " + PAGO[x.pago_estado].clase);
    const sel = document.createElement("select"); sel.className = "block w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded px-2 py-1 text-xs";
    sel.setAttribute("aria-label", "Estado del pago de " + x.nombre + " " + x.apellidos);
    Object.entries(PAGO).forEach(([k, v]) => { const o = document.createElement("option"); o.value = k; o.textContent = v.texto; o.selected = k === x.pago_estado; sel.append(o); });
    const nota = document.createElement("input"); nota.className = sel.className; nota.placeholder = "Nota (opcional)"; nota.value = x.nota_organizacion || ""; nota.maxLength = 500;
    nota.setAttribute("aria-label", "Nota de la organización sobre " + x.nombre + " " + x.apellidos);
    const fila = document.createElement("div"); fila.className = "flex gap-2";
    const guardar = document.createElement("button"); guardar.type = "button"; guardar.textContent = "Guardar";
    guardar.className = "bg-accent-500 hover:bg-accent-600 text-brand-900 text-xs font-semibold px-3 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const anular = document.createElement("button"); anular.type = "button"; anular.textContent = x.estado === "anulada" ? "Reactivar" : "Anular";
    anular.className = "border border-brand-300 dark:border-brand-600 text-xs font-semibold px-3 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    guardar.addEventListener("click", () => revisar(x, sel.value, x.estado, nota.value));
    anular.addEventListener("click", async () => {
      const a = x.estado === "anulada" ? "activa" : "anulada";
      if (a === "anulada" && !(await window.Avisos.confirmar("La inscripción de " + x.nombre + " " + x.apellidos + " queda anulada: deja de contar y su ID FIDE se puede volver a inscribir.", { titulo: "¿Anular la inscripción?", aceptar: "Anular la inscripción", peligro: true }))) return;
      revisar(x, sel.value, a, nota.value);
    });
    fila.append(guardar, anular);
    caja.append(insignia, sel, nota, fila);
    return caja;
  }

  async function revisar(x, pago, est, nota) {
    const { data, error } = await window.sb.rpc("metropolitano_revisar", { p_id: x.id, p_pago_estado: pago, p_estado: est, p_nota: nota });
    if (error) { window.Avisos.avisar("No se pudo guardar: " + error.message, { tipo: "error" }); return; }
    Object.assign(x, data);
    window.Avisos.avisar("Guardado: " + codigo(x) + ", pago " + PAGO[x.pago_estado].texto.toLowerCase() + (x.estado === "anulada" ? ", anulada" : "") + ".");
    pintar();
  }

  async function gafete(x, boton) {
    boton.disabled = true;
    try {
      let foto = null;
      try { const blob = await bajar(x.foto); const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); foto = img; } catch (e) { /* sin foto */ }
      const bytes = await window.MetropolitanoGafete.pdf(Object.assign({}, x, { codigo: codigo(x) }), foto);
      descargar(new Blob([bytes], { type: "application/pdf" }), "Gafete " + codigo(x) + " - " + window.Adjuntos.nombreSeguro(x.nombre + " " + x.apellidos) + ".pdf");
    } catch (e) {
      window.Avisos.avisar("No se pudo armar el gafete: " + (e.message || e), { tipo: "error" });
    } finally { boton.disabled = false; }
  }

  function descargar(blob, nombre) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // Los datos de la factura electrónica, una columna por cada uno (los del receptor de Hacienda).
  const FACTURA_CSV = ["Factura: tipo de identificación", "Factura: identificación", "Factura: nombre o razón social", "Factura: nombre comercial",
    "Factura: correo", "Factura: correo de copia", "Factura: teléfono", "Factura: actividad económica", "Factura: provincia", "Factura: cantón", "Factura: distrito", "Factura: otras señas"];
  const facturaCsv = (f) => (!f ? FACTURA_CSV.map(() => "")
    : [(R.FACTURA_TIPOS[f.tipo] || {}).nombre || f.tipo, f.identificacion, f.nombre, f.comercial, f.correo, f.correo_copia, f.telefono, f.actividad, f.provincia, f.canton, f.distrito, f.senas]);

  // CSV con punto y coma y BOM: lo que Excel en español abre de un doble clic.
  function csv(cabeza, cuerpo, nombre) {
    const c = (v) => { const t = v == null ? "" : String(v); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const texto = [cabeza, ...cuerpo].map((f) => f.map(c).join(";")).join("\r\n");
    descargar(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }), nombre);
  }

  $("bajar-csv").addEventListener("click", () => {
    const l = visibles();
    csv(["Código", "Estado", "Rol", "Es el delegado", "Delegación", "Autoriza publicidad", "Apellidos", "Nombre", "ID FIDE", "Sin ID FIDE", "Título", "Federación", "Elo estándar", "Elo rápido", "Elo blitz", "Torneos",
      "Sexo", "Nacimiento", "Edad al 26/12", "Nacionalidad", "Vive en", "Documento", "Número", "Correo", "Teléfono", "Club",
      "Responsable", "Teléfono responsable", "Emergencia", "Teléfono emergencia",
      "Hospedaje desde", "Hospedaje hasta", "Habitación", "Acompañantes", "Comidas", "Comidas desde", "Comidas hasta", "Dieta",
      "Llegada", "Salida", "Vuelo", "Traslado", "Condición", "Accesibilidad",
      "Monto USD", "Monto CRC", "Método", "Referencia", "Fecha de pago", "Estado del pago", "IVA USD", ...FACTURA_CSV, "Nombre en FIDE", "Seguro y exoneración", "Provincia", "Cantón", "Código de descuento", "Descuento %", "Parqueo (placa)", "Parqueo USD", "Acepta compartir habitación", "Acompañantes (datos)", "Nota", "Se inscribió"],
    l.map((x) => [codigo(x), x.estado, R.rolDe(x.rol, x.sexo), x.es_delegado ? "Sí" : "", x.delegacion, x.acepta_publicidad ? "Sí" : "No", x.apellidos, x.nombre, x.fide_id, x.sin_fide ? "Sí" : "", x.titulo, x.federacion, x.elo_estandar, x.elo_rapido, x.elo_blitz,
      x.torneos.map((t) => R.TORNEOS[t].nombre).join(" + "), x.sexo === "f" ? "F" : "M", x.nacimiento, R.edad(x.nacimiento, R.INICIO), x.nacionalidad, x.pais_residencia,
      x.documento_tipo, x.documento, x.correo, x.telefono, x.club,
      x.responsable && x.responsable.nombre, x.responsable && x.responsable.telefono, x.emergencia && x.emergencia.nombre, x.emergencia && x.emergencia.telefono,
      x.hospedaje_desde, x.hospedaje_hasta, x.habitacion, x.hospedaje ? x.acompanantes : "", x.comidas.join(", "), x.comidas_desde, x.comidas_hasta, x.dieta,
      x.viaje && x.viaje.llegada, x.viaje && x.viaje.salida, x.viaje && x.viaje.vuelo, x.viaje && x.viaje.traslado ? "Sí" : "", x.condicion.join(", "), x.accesibilidad,
      x.monto_usd, x.monto_crc, x.pago_metodo && R.METODOS[x.pago_metodo].nombre, x.pago_referencia, x.pago_fecha, PAGO[x.pago_estado].texto,
      x.iva_usd, ...facturaCsv(x.factura), x.nombre_fide, x.acepta_seguro ? "Aceptó (" + (x.exoneracion_version || "") + ")" : "No", x.provincia, x.canton, x.codigo_descuento, x.descuento_pct, x.parqueo ? x.placa : "", x.parqueo ? x.parqueo_usd : "", x.hospedaje ? (x.acepta_compartir ? "Sí" : "No") : "", (x.acompanantes_detalle || []).map(acompananteTexto).join(" | "), x.nota_organizacion, window.HoraCR.fechaHora(x.creado)]),
    "Metropolitano 2026 - inscritos.csv");
  });

  // Las columnas que entienden gafetes.html y la carga de una lista en Pareo Integral.
  $("bajar-gafetes").addEventListener("click", () => {
    const l = visibles().filter((x) => x.estado === "activa");
    csv(["Código", "Apellidos", "Nombre", "FIDE ID", "Federación", "Elo", "Sexo", "Nacimiento", "Institución", "Categoría", "Rol"],
      l.map((x) => { const f = window.MetropolitanoGafete.filaDe(x); return [codigo(x), x.apellidos, x.nombre, x.fide_id, f["Federación"], x.elo_estandar, x.sexo === "f" ? "F" : "M", x.nacimiento, x.delegacion || x.club, x.rol !== "jugador" ? "" : (x.clasico ? R.TORNEOS[x.clasico].nombre : "Blitz"), f.Rol]; }),
      "Metropolitano 2026 - lista para gafetes y Pareo.csv");
  });

  ["f-texto", "f-torneo", "f-pago", "f-anuladas", "f-rol", "f-publicidad"].forEach((id) => $(id).addEventListener("input", pintar));

  /* ===================== El Drive ===================== */
  // La Edge Function metropolitano-drive: estado, conectar y mandar lo que falta.
  async function alDrive(cuerpo) {
    const { data, error } = await window.sb.functions.invoke("metropolitano-drive", { body: cuerpo });
    if (error) {
      let msg = "No se pudo hablar con el Drive.";
      try { const d = await error.context.json(); if (d && d.error) msg = d.error; } catch (e) { /* sin cuerpo */ }
      return { error: msg };
    }
    return data || {};
  }
  function pintarDrive(d) {
    const faltan = d.pendientes || 0;
    $("drive-estado").textContent = d.error && d.conectado === undefined ? d.error
      : (d.conectado ? "✓ Conectado a «" + (d.carpeta || "Inscripciones Metropolitano 2026") + "»." : "Todavía no está conectado: usa «Conectar con Drive».")
        + " " + (faltan === 0 ? "No falta ninguna inscripción por mandar." : (faltan === 1 ? "Falta 1 inscripción" : "Faltan " + faltan + " inscripciones") + " por mandar"
        + (d.con_error ? " (" + d.con_error + " con error: se reintentan)" : "") + ".");
    $("drive-enviar").disabled = !d.conectado || faltan === 0;
  }
  async function estadoDrive() { pintarDrive(await alDrive({ accion: "estado" })); }
  $("drive-abrir-conectar").addEventListener("click", () => {
    const abierto = $("drive-conectar").classList.toggle("hidden") === false;
    $("drive-abrir-conectar").setAttribute("aria-expanded", abierto ? "true" : "false");
    if (abierto) $("drive-url").focus();
  });
  $("drive-conectar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("drive-guardar").disabled = true; $("drive-msg").textContent = "Probando la conexión…";
    const d = await alDrive({ accion: "conectar", url: $("drive-url").value.trim(), secreto: $("drive-secreto").value.trim() });
    $("drive-guardar").disabled = false;
    if (d.error) { $("drive-msg").textContent = d.error; return; }
    $("drive-msg").textContent = "Listo: el Drive quedó conectado.";
    $("drive-secreto").value = "";
    $("drive-conectar").classList.add("hidden"); $("drive-abrir-conectar").setAttribute("aria-expanded", "false");
    pintarDrive(d);
  });
  $("drive-enviar").addEventListener("click", async () => {
    $("drive-enviar").disabled = true; $("drive-msg").textContent = "Mandando al Drive…";
    const d = await alDrive({ accion: "enviar" });
    if (d.error) { $("drive-msg").textContent = d.error; $("drive-enviar").disabled = false; return; }
    $("drive-msg").textContent = (d.enviados === 1 ? "1 inscripción mandada" : d.enviados + " inscripciones mandadas") + (d.errores ? ", " + d.errores + " con error" : "")
      + (d.quedan ? ". Quedan " + d.quedan + ": vuelve a tocar el botón o espera, que se mandan solas cada 10 minutos." : ".");
    await cargar();
    await estadoDrive();
  });

  /* ===================== Los códigos de descuento ===================== */
  // Los genera la base (metropolitano_codigos_crear, solo administración) y
  // cada uno vale una vez: la inscripción que lo usa queda atada a él.
  let codigos = [];
  async function cargarCodigos() {
    codigos = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await window.sb.from("metropolitano_codigos").select("*").order("creado", { ascending: false }).range(desde, desde + 999);
      if (error) { $("cod-msg").textContent = "No se pudieron leer los códigos."; return; }
      codigos = codigos.concat(data || []);
      if (!data || data.length < 1000) break;
    }
    pintarCodigos();
  }
  function pintarCodigos() {
    const tb = $("codigos-filas"); tb.textContent = "";
    if (!codigos.length) {
      const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 5; td.className = "p-4 text-brand-500 dark:text-brand-300";
      td.textContent = "Todavía no hay códigos. Genera el primero arriba."; tr.append(td); tb.append(tr); return;
    }
    const porId = new Map(filas.map((x) => [x.id, x]));
    codigos.forEach((c) => {
      const tr = document.createElement("tr"); tr.className = "border-b border-brand-100 dark:border-brand-800";
      const usado = c.usado_por && porId.get(c.usado_por);
      const estado = c.anulado ? "Anulado" : c.usado_por ? "Usado" + (usado ? " por " + codigo(usado) + " — " + usado.nombre + " " + usado.apellidos : "") + (c.usado_en ? " (" + window.HoraCR.fechaHora(c.usado_en) + ")" : "") : "Libre: sin usar";
      celda(tr, [texto(c.codigo, "font-mono font-semibold")]);
      celda(tr, [texto(c.porcentaje === 100 ? "100 % (gratis)" : c.porcentaje + " %")]);
      celda(tr, [texto(c.nota || "—", "text-xs")]);
      celda(tr, [texto(estado, "text-xs font-semibold")]);
      const acc = document.createElement("div"); acc.className = "flex gap-2";
      const copiar = document.createElement("button"); copiar.type = "button"; copiar.className = "text-xs underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
      copiar.textContent = "Copiar"; copiar.setAttribute("aria-label", "Copiar el código " + c.codigo);
      copiar.addEventListener("click", async () => { try { await navigator.clipboard.writeText(c.codigo); copiar.textContent = "Copiado"; } catch (e) { copiar.textContent = "No se pudo copiar"; } });
      acc.append(copiar);
      if (!c.anulado && !c.usado_por) {
        const anular = document.createElement("button"); anular.type = "button"; anular.className = "text-xs underline text-red-700 dark:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
        anular.textContent = "Anular"; anular.setAttribute("aria-label", "Anular el código " + c.codigo);
        anular.addEventListener("click", async () => {
          if (!(await window.Avisos.confirmar("El código " + c.codigo + " deja de servir y no se puede volver a activar.", { titulo: "¿Anular el código?", aceptar: "Anular el código", peligro: true }))) return;
          const { error } = await window.sb.rpc("metropolitano_codigo_anular", { p_codigo: c.codigo });
          if (error) { $("cod-msg").textContent = "No se pudo anular: " + error.message; return; }
          await cargarCodigos();
        });
        acc.append(anular);
      }
      celda(tr, [acc]);
      tb.append(tr);
    });
  }
  $("cod-pct").addEventListener("change", () => $("cod-otro-caja").classList.toggle("hidden", $("cod-pct").value !== "otro"));
  $("codigos-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const pct = $("cod-pct").value === "otro" ? Number($("cod-otro").value) : Number($("cod-pct").value);
    const cantidad = Number($("cod-cantidad").value);
    if (!(pct >= 1 && pct <= 100)) { $("cod-msg").textContent = "El descuento va de 1 a 100 %."; return; }
    if (!(cantidad >= 1 && cantidad <= 100)) { $("cod-msg").textContent = "Se generan de 1 a 100 códigos de una vez."; return; }
    $("cod-generar").disabled = true; $("cod-msg").textContent = "Generando…";
    const { data, error } = await window.sb.rpc("metropolitano_codigos_crear", { p_porcentaje: pct, p_cantidad: cantidad, p_nota: $("cod-nota").value.trim() });
    $("cod-generar").disabled = false;
    if (error) { $("cod-msg").textContent = "No se pudieron generar: " + error.message; return; }
    $("cod-msg").textContent = (data.length === 1 ? "Listo: 1 código nuevo, " : "Listo: " + data.length + " códigos nuevos, ") + "arriba de la lista. Entrégalo a quien lo ganó: vale una sola vez.";
    $("cod-nota").value = "";
    await cargarCodigos();
  });

  /* ===================== El parqueo ===================== */
  // Lo configura la base (metropolitano_parqueo_configurar, solo
  // administración): el precio, los espacios y si se ofrece; cuenta los ya
  // tomados (inscripciones activas con el pago no rechazado).
  function pintarParqueo(d) {
    $("parq-precio").value = Number(d.precio_usd || 0).toFixed(2);
    $("parq-cupos").value = d.cupos || 0;
    $("parq-activo").checked = !!d.activo;
    const quedan = Math.max((d.cupos || 0) - (d.usados || 0), 0);
    $("parq-estado").textContent = !d.activo ? "No se ofrece en la inscripción. " + d.usados + " espacios tomados."
      : quedan === 0 ? "Lleno: " + d.usados + " de " + d.cupos + " espacios tomados. La inscripción ya no lo ofrece."
      : d.usados + " de " + d.cupos + " espacios tomados; quedan " + quedan + ". Se ofrece a " + R.dinero(Number(d.precio_usd)) + " por vehículo.";
  }
  async function cargarParqueo() {
    const { data, error } = await window.sb.rpc("metropolitano_parqueo_estado");
    if (error || !data || typeof data.cupos !== "number") { $("parq-estado").textContent = "No se pudo leer el parqueo."; return; }
    pintarParqueo(data);
  }
  $("parqueo-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const precio = Number($("parq-precio").value), cupos = Number($("parq-cupos").value);
    if (!(precio >= 0 && precio <= 500)) { $("parq-msg").textContent = "El precio va de $0 a $500."; return; }
    if (!(Number.isInteger(cupos) && cupos >= 0 && cupos <= 5000)) { $("parq-msg").textContent = "Los espacios van de 0 a 5000, en número entero."; return; }
    $("parq-guardar").disabled = true; $("parq-msg").textContent = "Guardando…";
    const { data, error } = await window.sb.rpc("metropolitano_parqueo_configurar", { p_precio: precio, p_cupos: cupos, p_activo: $("parq-activo").checked });
    $("parq-guardar").disabled = false;
    if (error) { $("parq-msg").textContent = "No se pudo guardar: " + error.message; return; }
    $("parq-msg").textContent = "Listo: guardado.";
    pintarParqueo(data);
  });
  // Para quien cuida la entrada: las placas de las inscripciones activas.
  $("parq-placas").addEventListener("click", () => {
    const l = filas.filter((x) => x.parqueo && x.estado === "activa").sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
    csv(["Placa", "Código", "Apellidos", "Nombre", "Rol", "Delegación", "Teléfono", "Estado del pago"],
      l.map((x) => [x.placa, codigo(x), x.apellidos, x.nombre, R.rolDe(x.rol, x.sexo), x.delegacion, x.telefono, PAGO[x.pago_estado].texto]),
      "Metropolitano 2026 - placas del parqueo.csv");
  });

  async function iniciar() {
    const { data } = await window.sb.auth.getSession();
    const session = data.session;
    if (!session) { window.location.href = "login.html"; return; }
    const { data: perfil } = await window.sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
    $("loading").classList.add("hidden");
    if (!perfil || !perfil.is_admin) { $("denegado").classList.remove("hidden"); return; }
    $("app").classList.remove("hidden");
    await cargar();
    await cargarCodigos();
    cargarParqueo();
    estadoDrive();
  }
  iniciar();
})();
