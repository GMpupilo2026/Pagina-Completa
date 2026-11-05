/* Ajedrez Integral — los menús de la alimentación del Metropolitano 2026,
 * para quien administra (en metropolitano-inscritos.html).
 *
 * Tres partes:
 *  - Quién prepara: las sodas, las cocineras… (metropolitano_cocina_guardar
 *    y _quitar; con platos, una cocina no se borra: deja de ofrecerse).
 *  - Los platos de cada comida, con su nombre, descripción, foto, precio por
 *    día y quién los prepara (metropolitano_menu_guardar y _quitar; un plato
 *    que alguien ya eligió no se borra: deja de ofrecerse). Las fotos van al
 *    bucket público metropolitano-menu, que solo administración escribe.
 *  - La estimación: por día y por comida, los platos ya pagados de cada
 *    cocina, cuántas personas dijeron «Aún no lo sé» y los platos de más que
 *    conviene preparar con el porcentaje que se elija. Las cuentas las hace
 *    la base (metropolitano_menu_admin); aquí solo se suma lo de la tabla.
 *
 * Ver «Los menús de la alimentación» en docs/decisiones/cuentas-y-formularios.md.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const BUCKET = "metropolitano-menu";
  const COMIDAS = { desayuno: "Desayuno", almuerzo: "Almuerzo", cena: "Cena" };
  const ORDEN = ["desayuno", "almuerzo", "cena"];
  const MAX = 1048576;
  let datos = { cocinas: [], platos: [], por_dia: [], tal_vez: [] };
  let fotoNueva = null, fotoActual = null;

  const dinero = (usd) => "$" + Number(usd).toFixed(2);
  const urlFoto = (ruta) => window.sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
  const diaCorto = (d) => window.HoraCR.fecha(d, { day: "numeric", month: "short", weekday: "short" });
  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }
  const boton = (texto, alClic, etiqueta) => { const b = el("button", "underline text-sm font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto); b.type = "button"; if (etiqueta) b.setAttribute("aria-label", etiqueta); b.addEventListener("click", alClic); return b; };
  const nombreCocina = (id) => { const c = datos.cocinas.find((x) => x.id === id); return c ? c.nombre : "La organización"; };

  async function cargar() {
    $("menu-estado").textContent = "Leyendo los menús…";
    const { data, error } = await window.sb.rpc("metropolitano_menu_admin");
    if (error || !data || !Array.isArray(data.platos)) { $("menu-estado").textContent = "No se pudieron leer los menús" + (error ? ": " + error.message : "."); return; }
    poner(data);
  }
  function poner(d) {
    datos = d;
    const activos = d.platos.filter((p) => p.activo).length;
    $("menu-estado").textContent = d.platos.length
      ? activos + (activos === 1 ? " plato se ofrece" : " platos se ofrecen") + " en la inscripción, de " + d.cocinas.filter((c) => c.activo).length + " cocinas."
      : "Todavía no hay platos: mientras no haya, la alimentación es una solicitud sin costo.";
    pintarCocinas();
    pintarPlatos();
    pintarEstimacion();
  }

  /* ===================== Quién prepara ===================== */
  function pintarCocinas() {
    const ul = $("cocinas"); ul.textContent = "";
    if (!datos.cocinas.length) ul.append(el("li", "text-sm", "Todavía no hay nadie: los platos sin cocina los prepara «La organización»."));
    datos.cocinas.forEach((c) => {
      const li = el("li", "bg-white dark:bg-brand-900 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-3");
      const t = el("div", "grow");
      t.append(el("p", "font-semibold", c.nombre + (c.activo ? "" : " (ya no se ofrece)")));
      if (c.detalle) t.append(el("p", "text-sm", c.detalle));
      t.append(el("p", "text-xs", c.platos === 1 ? "1 plato" : c.platos + " platos"));
      li.append(t, boton("Editar", () => editarCocina(c), "Editar " + c.nombre), boton(c.platos ? "Dejar de ofrecer" : "Quitar", () => quitarCocina(c), "Quitar " + c.nombre));
      ul.append(li);
    });
    const sel = $("plato-cocina"), antes = sel.value;
    sel.textContent = "";
    const ninguna = el("option", "", "La organización"); ninguna.value = ""; sel.append(ninguna);
    datos.cocinas.filter((c) => c.activo || c.id === antes).forEach((c) => { const o = el("option", "", c.nombre); o.value = c.id; sel.append(o); });
    sel.value = antes;
  }
  function editarCocina(c) {
    $("cocina-id").value = c ? c.id : "";
    $("cocina-nombre").value = c ? c.nombre : "";
    $("cocina-detalle").value = c ? c.detalle || "" : "";
    $("cocina-orden").value = c ? c.orden : 0;
    $("cocina-guardar").textContent = c ? "Guardar los cambios" : "Agregar";
    $("cocina-cancelar").classList.toggle("hidden", !c);
    $("cocina-msg").textContent = "";
    if (c) $("cocina-nombre").focus();
  }
  async function quitarCocina(c) {
    const ok = await window.Avisos.confirmar(c.platos
      ? c.nombre + " tiene platos: no se borra, deja de ofrecerse (y sus platos con ella). Las inscripciones que ya la eligieron no cambian."
      : c.nombre + " se borra de la lista.", { titulo: "¿Quitar a " + c.nombre + "?", aceptar: c.platos ? "Dejar de ofrecerla" : "Quitarla", peligro: true });
    if (!ok) return;
    const { data, error } = await window.sb.rpc("metropolitano_cocina_quitar", { p_id: c.id });
    if (error) { window.Avisos.avisar("No se pudo quitar: " + error.message, { tipo: "error" }); return; }
    poner(data);
  }
  $("cocina-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nombre = $("cocina-nombre").value.trim();
    if (nombre.length < 2) { $("cocina-msg").textContent = "Escribe el nombre de quien prepara."; return; }
    $("cocina-guardar").disabled = true; $("cocina-msg").textContent = "Guardando…";
    const { data, error } = await window.sb.rpc("metropolitano_cocina_guardar", { p: { id: $("cocina-id").value || null, nombre, detalle: $("cocina-detalle").value, orden: Number($("cocina-orden").value) || 0 } });
    $("cocina-guardar").disabled = false;
    if (error) { $("cocina-msg").textContent = "No se pudo guardar: " + error.message; return; }
    editarCocina(null);
    $("cocina-msg").textContent = "Listo: guardado.";
    poner(data);
  });
  $("cocina-cancelar").addEventListener("click", () => editarCocina(null));

  /* ===================== Los platos ===================== */
  function pintarPlatos() {
    const caja = $("platos"); caja.textContent = "";
    ORDEN.forEach((comida) => {
      const lista = datos.platos.filter((p) => p.comida === comida);
      const sec = el("div");
      sec.append(el("h4", "font-semibold mb-2", COMIDAS[comida] + " (" + lista.filter((p) => p.activo).length + " se ofrecen)"));
      if (!lista.length) { sec.append(el("p", "text-sm", "Sin platos: el " + COMIDAS[comida].toLowerCase() + " queda como una solicitud sin costo.")); caja.append(sec); return; }
      const ul = el("ul", "grid sm:grid-cols-2 lg:grid-cols-3 gap-3");
      lista.forEach((p) => {
        const li = el("li", "bg-white dark:bg-brand-900 rounded-xl shadow-sm overflow-hidden flex flex-col");
        if (p.imagen) { const img = el("img", "w-full h-32 object-cover"); img.src = urlFoto(p.imagen); img.alt = ""; img.loading = "lazy"; li.append(img); }
        const t = el("div", "p-3 space-y-1 grow");
        t.append(el("p", "font-semibold", p.nombre + (p.activo ? "" : " (ya no se ofrece)")));
        t.append(el("p", "text-sm", "Lo prepara: " + nombreCocina(p.cocina)));
        t.append(el("p", "text-sm font-semibold", dinero(p.precio_usd) + " por día"));
        if (p.descripcion) t.append(el("p", "text-sm", p.descripcion));
        t.append(el("p", "text-xs", p.personas === 1 ? "Lo eligió 1 persona" : "Lo eligieron " + p.personas + " personas"));
        const acc = el("div", "flex gap-3 pt-1");
        acc.append(boton("Editar", () => editarPlato(p), "Editar " + p.nombre + " de " + nombreCocina(p.cocina)),
          boton(p.personas ? "Dejar de ofrecer" : "Quitar", () => quitarPlato(p), "Quitar " + p.nombre + " de " + nombreCocina(p.cocina)));
        t.append(acc);
        li.append(t);
        ul.append(li);
      });
      sec.append(ul);
      caja.append(sec);
    });
  }
  function pintarFoto() {
    const ruta = fotoNueva ? URL.createObjectURL(fotoNueva) : fotoActual ? urlFoto(fotoActual) : "";
    $("plato-foto-vista").classList.toggle("hidden", !ruta);
    if (ruta) $("plato-foto-img").src = ruta;
  }
  function editarPlato(p) {
    $("plato-id").value = p ? p.id : "";
    $("plato-comida").value = p ? p.comida : "desayuno";
    $("plato-nombre").value = p ? p.nombre : "";
    $("plato-cocina").value = p && p.cocina ? p.cocina : "";
    $("plato-desc").value = p ? p.descripcion || "" : "";
    $("plato-precio").value = p ? Number(p.precio_usd).toFixed(2) : "";
    $("plato-orden").value = p ? p.orden : 0;
    $("plato-activo").checked = p ? p.activo : true;
    $("plato-foto").value = "";
    fotoNueva = null; fotoActual = p ? p.imagen : null;
    pintarFoto();
    $("plato-guardar").textContent = p ? "Guardar los cambios" : "Agregar el plato";
    $("plato-cancelar").classList.toggle("hidden", !p);
    $("plato-msg").textContent = "";
    if (p) $("plato-nombre").focus();
  }
  async function quitarPlato(p) {
    const ok = await window.Avisos.confirmar(p.personas
      ? "Ya lo eligieron " + p.personas + " personas: no se borra, deja de ofrecerse. Sus inscripciones no cambian."
      : p.nombre + " se borra del menú.", { titulo: "¿Quitar " + p.nombre + "?", aceptar: p.personas ? "Dejar de ofrecerlo" : "Quitarlo", peligro: true });
    if (!ok) return;
    const { data, error } = await window.sb.rpc("metropolitano_menu_quitar", { p_id: p.id });
    if (error) { window.Avisos.avisar("No se pudo quitar: " + error.message, { tipo: "error" }); return; }
    poner(data);
  }
  /* Una foto de más de 1 MB se achica a 1200 px de ancho en JPG. */
  async function achicar(archivo) {
    if (archivo.size <= MAX) return archivo;
    const img = await createImageBitmap(archivo);
    const escala = Math.min(1, 1200 / img.width);
    const c = document.createElement("canvas"); c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    if (!blob || blob.size > MAX) throw new Error("la foto sigue pesando más de 1 MB");
    return new File([blob], "plato.jpg", { type: "image/jpeg" });
  }
  $("plato-foto").addEventListener("change", () => {
    const a = $("plato-foto").files[0];
    if (!a) return;
    if (!/^image\/(jpeg|png|webp)$/.test(a.type)) { $("plato-msg").textContent = "«" + a.name + "» no sirve: sube una foto JPG, PNG o WebP."; $("plato-foto").value = ""; return; }
    fotoNueva = a; $("plato-msg").textContent = "";
    pintarFoto();
  });
  $("plato-foto-quitar").addEventListener("click", () => { fotoNueva = null; fotoActual = null; $("plato-foto").value = ""; pintarFoto(); });
  $("plato-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nombre = $("plato-nombre").value.trim(), precio = Number($("plato-precio").value);
    if (nombre.length < 2) { $("plato-msg").textContent = "Escribe el nombre del plato."; return; }
    if ($("plato-precio").value === "" || !(precio >= 0 && precio <= 200)) { $("plato-msg").textContent = "El precio por día va de $0 a $200."; return; }
    $("plato-guardar").disabled = true;
    try {
      let imagen = fotoActual;
      if (fotoNueva) {
        $("plato-msg").textContent = "Subiendo la foto…";
        const f = await achicar(fotoNueva);
        const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
        const ruta = "menu/" + crypto.randomUUID() + "." + ext;
        const { error } = await window.sb.storage.from(BUCKET).upload(ruta, f, { contentType: f.type, upsert: false });
        if (error) throw error;
        imagen = ruta;
      }
      $("plato-msg").textContent = "Guardando…";
      const { data, error } = await window.sb.rpc("metropolitano_menu_guardar", { p: {
        id: $("plato-id").value || null, comida: $("plato-comida").value, nombre, descripcion: $("plato-desc").value,
        cocina: $("plato-cocina").value || null, precio_usd: precio, orden: Number($("plato-orden").value) || 0,
        activo: $("plato-activo").checked, imagen: imagen || null } });
      if (error) throw error;
      editarPlato(null);
      $("plato-msg").textContent = "Listo: guardado.";
      poner(data);
    } catch (e) {
      $("plato-msg").textContent = "No se pudo guardar: " + (e.message || e);
    } finally { $("plato-guardar").disabled = false; }
  });
  $("plato-cancelar").addEventListener("click", () => editarPlato(null));

  /* ===================== La estimación ===================== */
  function filasEstimacion() {
    const pct = Math.min(100, Math.max(0, Number($("estimacion-pct").value) || 0));
    const plato = (id) => datos.platos.find((p) => p.id === id);
    const dias = [...new Set([...datos.por_dia.map((x) => x.dia), ...datos.tal_vez.map((x) => x.dia)])].sort();
    const filas = [];
    dias.forEach((dia) => ORDEN.forEach((comida) => {
      const pagados = datos.por_dia.filter((x) => x.dia === dia && plato(x.id) && plato(x.id).comida === comida);
      const tv = datos.tal_vez.filter((x) => x.dia === dia && x.comida === comida).reduce((s, x) => s + x.personas, 0);
      const confirmados = pagados.reduce((s, x) => s + x.platos, 0);
      if (!confirmados && !tv) return;
      const porCocina = {};
      pagados.forEach((x) => { const p = plato(x.id), k = nombreCocina(p.cocina) + ": " + p.nombre; porCocina[k] = (porCocina[k] || 0) + x.platos; });
      const extra = Math.ceil(tv * pct / 100);
      filas.push({ dia, comida, confirmados, detalle: Object.entries(porCocina).map(([k, n]) => n + " × " + k).join("; "), tv, extra, total: confirmados + extra });
    }));
    return filas;
  }
  function pintarEstimacion() {
    const caja = $("estimacion"); caja.textContent = "";
    const filas = filasEstimacion();
    if (!filas.length) { caja.append(el("p", "text-sm", "Todavía nadie pidió alimentación con menú ni dijo «Aún no lo sé».")); return; }
    const t = el("table", "w-full text-sm bg-white dark:bg-brand-900 rounded-xl");
    t.append(el("caption", "sr-only", "Estimación de platos por día y comida"));
    const th = el("tr");
    ["Día", "Comida", "Ya pagados", "De cada cocina", "Aún no lo saben", "Platos de más sugeridos", "Total a preparar"].forEach((x) => { const c = el("th", "text-left p-2", x); c.scope = "col"; th.append(c); });
    const thead = el("thead"); thead.append(th); t.append(thead);
    const tb = el("tbody");
    filas.forEach((f) => {
      const tr = el("tr", "border-t border-brand-100 dark:border-brand-700");
      [diaCorto(f.dia), COMIDAS[f.comida], f.confirmados, f.detalle || "—", f.tv, f.extra, f.total].forEach((x, i) => tr.append(el("td", "p-2" + (i === 6 ? " font-bold" : ""), String(x))));
      tb.append(tr);
    });
    t.append(tb);
    caja.append(t);
  }
  $("estimacion-pct").addEventListener("input", pintarEstimacion);
  $("menu-actualizar").addEventListener("click", cargar);
  $("estimacion-excel").addEventListener("click", () => {
    const filas = filasEstimacion();
    window.TablaExcel.bajar("Metropolitano 2026 - estimación de platos.xlsx", [
      { nombre: "Estimación", filas: [["Día", "Comida", "Ya pagados", "De cada cocina", "Aún no lo saben", "Platos de más sugeridos", "Total a preparar"],
        ...filas.map((f) => [f.dia, COMIDAS[f.comida], f.confirmados, f.detalle, f.tv, f.extra, f.total])] },
      { nombre: "Platos", filas: [["Comida", "Plato", "Lo prepara", "Precio por día (USD)", "Personas", "Se ofrece"],
        ...datos.platos.map((p) => [COMIDAS[p.comida], p.nombre, nombreCocina(p.cocina), Number(p.precio_usd), p.personas, p.activo ? "Sí" : "No"])] }]);
  });

  editarCocina(null);
  editarPlato(null);
  cargar();
})();

/*! rev bfb5bbb0d2d82f9f */
