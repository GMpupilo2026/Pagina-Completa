/* ===== Ajedrez Integral — Trofeos de la clase =====
 *
 * En la clase en vivo (sesion.html), cada respuesta que el profesor marca ✅
 * es un trofeo, y se van sumando de clase en clase. El profesor, además,
 * puede ajustarlos a mano: sumar por un buen trabajo o quitar uno que se
 * contó de más, siempre con un motivo que el alumno ve.
 *
 * La cuenta la hace la base (public.trofeos_de): respuestas correctas + la
 * suma de trofeos_ajustes. Las respuestas no se guardan como trofeos: se
 * cuentan, así que si el profesor cambia un ✅ por ❌ el trofeo se va solo.
 * Los ajustes solo los escribe public.ajustar_trofeos(), que valida que quien
 * ajusta sea su profesor o quien administra. Ver «Los trofeos de la clase» en
 * docs/decisiones/entrenamiento.md.
 *
 * Uso:
 *   const t = await Trofeos.cargar(sb, alumnoId);   // { por_clase, ajustes, total } o null
 *   Trofeos.montarPanel(caja, { sb, alumnoId, alCambiar });   // el profesor ajusta
 *   Trofeos.montarLectura(caja, { sb, alumnoId });            // el alumno mira
 */
window.Trofeos = (function () {
  "use strict";

  const LIMITE = 100; // el mismo CHECK de trofeos_ajustes.cantidad
  const VACIO = { por_clase: 0, ajustes: 0, total: 0 };

  function fmt(n) { return new Intl.NumberFormat("es-CR").format(n); }
  function texto(n) { return fmt(n) + (n === 1 ? " trofeo" : " trofeos"); }
  function conSigno(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n)); }

  async function cargar(sb, alumnoId) {
    try {
      const { data, error } = await sb.rpc("trofeos_de", alumnoId ? { p_alumno: alumnoId } : {});
      if (error) throw error;
      const fila = (data && data[0]) || null;
      return fila ? Object.assign({}, VACIO, fila) : Object.assign({}, VACIO);
    } catch (e) {
      console.warn("No se pudieron cargar los trofeos:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function historial(sb, alumnoId, limite) {
    try {
      const { data, error } = await sb.from("trofeos_ajustes")
        .select("id, cantidad, motivo, created_at")
        .eq("alumno_id", alumnoId)
        .order("created_at", { ascending: false })
        .limit(limite || 5);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("No se pudo cargar el historial de trofeos:", e && e.message ? e.message : e);
      return [];
    }
  }

  async function ajustar(sb, alumnoId, cantidad, motivo) {
    const { data, error } = await sb.rpc("ajustar_trofeos", {
      p_alumno: alumnoId, p_cantidad: cantidad, p_motivo: motivo || "",
    });
    if (error) return { error: error.message || "No se pudo guardar el ajuste." };
    return { trofeos: Object.assign({}, VACIO, (data && data[0]) || {}) };
  }

  function fechaCorta(iso) {
    try {
      return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
    } catch (e) { return ""; }
  }

  // De dónde sale el total, dicho con palabras (el número solo no explica
  // por qué no coincide con las respuestas correctas).
  function desglose(t) {
    const partes = [texto(t.por_clase) + " por respuestas correctas en clase"];
    if (t.ajustes) partes.push(conSigno(t.ajustes) + " ajustados por tu profesor");
    return partes.join(", ") + ".";
  }

  function pintarHistorial(ul, filas) {
    ul.innerHTML = "";
    filas.forEach((f) => {
      const li = document.createElement("li");
      li.className = "flex items-baseline gap-2";
      const cant = document.createElement("span");
      cant.className = "font-mono font-semibold shrink-0 " + (f.cantidad > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400");
      cant.textContent = conSigno(f.cantidad);
      const mot = document.createElement("span");
      mot.className = "flex-1 min-w-0 break-words";
      mot.textContent = f.motivo || (f.cantidad > 0 ? "Sumados por tu profesor" : "Quitados por tu profesor");
      const fecha = document.createElement("span");
      fecha.className = "shrink-0 text-brand-450 dark:text-brand-350";
      fecha.textContent = fechaCorta(f.created_at);
      li.append(cant, mot, fecha);
      ul.appendChild(li);
    });
  }

  function boton(textoBoton, etiqueta, clases) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = textoBoton;
    if (etiqueta) b.setAttribute("aria-label", etiqueta);
    b.className = "text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " +
      (clases || "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200");
    return b;
  }

  /* El profesor (o quien administra) ajusta los trofeos de un alumno.
     El panel se arma entero cada vez, como la bitácora: así nunca queda
     pintado el total del alumno anterior mientras se ajusta a otro. */
  function montarPanel(contenedor, opciones) {
    const { sb, alumnoId, alCambiar } = opciones;
    contenedor.innerHTML = "";

    const total = document.createElement("p");
    total.className = "text-2xl font-bold text-brand-800 dark:text-white";
    total.setAttribute("data-trofeos-total", "");
    total.textContent = "…";
    const detalle = document.createElement("p");
    detalle.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5";

    const rapidos = document.createElement("div");
    rapidos.className = "flex flex-wrap gap-2 mt-3";
    const menos = boton("−1", "Quitar 1 trofeo");
    const mas = boton("+1", "Sumar 1 trofeo", "bg-accent-500 hover:bg-accent-600 text-brand-900");
    const masCinco = boton("+5", "Sumar 5 trofeos", "bg-accent-500 hover:bg-accent-600 text-brand-900");
    rapidos.append(menos, mas, masCinco);

    const form = document.createElement("form");
    form.className = "grid grid-cols-[5rem_1fr] gap-2 mt-3 items-end";
    const idBase = "trofeos-" + Math.random().toString(36).slice(2, 8);
    form.innerHTML =
      '<label class="text-xs text-brand-500 dark:text-brand-300" for="' + idBase + '-cant">Cantidad</label>' +
      '<label class="text-xs text-brand-500 dark:text-brand-300" for="' + idBase + '-motivo">Motivo (lo ve el alumno)</label>';
    const cant = document.createElement("input");
    cant.type = "number"; cant.id = idBase + "-cant"; cant.min = String(-LIMITE); cant.max = String(LIMITE); cant.step = "1"; cant.value = "1";
    cant.className = "w-full text-sm bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-brand-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500";
    const motivo = document.createElement("input");
    motivo.type = "text"; motivo.id = idBase + "-motivo"; motivo.maxLength = 200;
    motivo.placeholder = "Por ejemplo: resolvió el mate de la pizarra";
    motivo.className = cant.className;
    const aplicar = boton("Aplicar ajuste", null, "col-span-2 bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500 text-white");
    aplicar.type = "submit";
    form.append(cant, motivo, aplicar);

    const aviso = document.createElement("p");
    aviso.className = "text-xs text-brand-500 dark:text-brand-300 mt-2 min-h-[1rem]";
    aviso.setAttribute("aria-live", "polite");

    const tituloHist = document.createElement("p");
    tituloHist.className = "hidden text-xs font-semibold text-brand-600 dark:text-brand-300 mt-3";
    tituloHist.textContent = "Últimos ajustes";
    const hist = document.createElement("ul");
    hist.className = "text-xs text-brand-600 dark:text-brand-300 space-y-1 mt-1";

    contenedor.append(total, detalle, rapidos, form, aviso, tituloHist, hist);

    let ultimo = null;
    async function repintar() {
      const [t, filas] = await Promise.all([cargar(sb, alumnoId), historial(sb, alumnoId, 5)]);
      if (!t) {
        total.textContent = "—";
        detalle.textContent = "No se pudieron cargar los trofeos.";
        return;
      }
      ultimo = t;
      total.textContent = "🏆 " + texto(t.total);
      detalle.textContent = desglose(t).replace("tu profesor", "el profesor");
      menos.disabled = t.total < 1;
      menos.classList.toggle("opacity-50", t.total < 1);
      pintarHistorial(hist, filas);
      tituloHist.classList.toggle("hidden", !filas.length);
    }

    let ocupado = false;
    async function enviar(cantidad) {
      if (ocupado) return;
      if (!Number.isInteger(cantidad) || cantidad === 0 || Math.abs(cantidad) > LIMITE) {
        aviso.textContent = "La cantidad va de −" + LIMITE + " a " + LIMITE + " y no puede ser cero.";
        return;
      }
      if (ultimo && ultimo.total + cantidad < 0) {
        aviso.textContent = "No se pueden quitar " + fmt(-cantidad) + ": tiene " + texto(ultimo.total) + ".";
        return;
      }
      ocupado = true;
      aviso.textContent = "Guardando…";
      const r = await ajustar(sb, alumnoId, cantidad, motivo.value.trim());
      ocupado = false;
      if (r.error) { aviso.textContent = "No se pudo guardar: " + r.error; return; }
      aviso.textContent = (cantidad > 0 ? "Sumaste " : "Quitaste ") + texto(Math.abs(cantidad)) + ". Ahora tiene " + texto(r.trofeos.total) + ".";
      motivo.value = "";
      await repintar();
      if (typeof alCambiar === "function") alCambiar(r.trofeos);
    }

    menos.addEventListener("click", () => enviar(-1));
    mas.addEventListener("click", () => enviar(1));
    masCinco.addEventListener("click", () => enviar(5));
    form.addEventListener("submit", (e) => { e.preventDefault(); enviar(parseInt(cant.value, 10)); });

    repintar();
    return { repintar };
  }

  /* Lo que ve el alumno: su total, de dónde sale y los últimos ajustes. */
  async function montarLectura(contenedor, opciones) {
    const { sb, alumnoId } = opciones;
    const [t, filas] = await Promise.all([cargar(sb, alumnoId), alumnoId ? historial(sb, alumnoId, opciones.limite || 5) : []]);
    contenedor.innerHTML = "";
    const total = document.createElement("p");
    total.className = "text-3xl font-bold text-brand-800 dark:text-white";
    total.setAttribute("data-trofeos-total", "");
    const detalle = document.createElement("p");
    detalle.className = "text-sm text-brand-500 dark:text-brand-300 mt-1";
    if (!t) {
      total.textContent = "—";
      detalle.textContent = "No se pudieron cargar tus trofeos en este momento.";
      contenedor.append(total, detalle);
      return null;
    }
    total.textContent = "🏆 " + texto(t.total);
    detalle.textContent = t.total || t.ajustes ? desglose(t)
      : "Todavía no tienes trofeos: cada respuesta que tu profesor marque correcta en clase te da uno.";
    contenedor.append(total, detalle);
    if (filas.length) {
      const titulo = document.createElement("p");
      titulo.className = "text-xs font-semibold text-brand-600 dark:text-brand-300 mt-3";
      titulo.textContent = "Ajustes de tu profesor";
      const ul = document.createElement("ul");
      ul.className = "text-xs text-brand-600 dark:text-brand-300 space-y-1 mt-1";
      pintarHistorial(ul, filas);
      contenedor.append(titulo, ul);
    }
    return t;
  }

  return { cargar, historial, ajustar, montarPanel, montarLectura, texto, LIMITE };
})();
