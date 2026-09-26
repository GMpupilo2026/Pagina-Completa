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
 * Las INSIGNIAS son el otro premio: el profesor las entrega a mano por lo que
 * no da trofeo (un buen comentario, un ejercicio de la pizarra bien resuelto,
 * la actitud). El catálogo vive en la base (insignias_tipos), porque también
 * lo lee el correo a la casa; las da public.otorgar_insignia() y las cuenta
 * public.premios_de_alumno(), que es la misma que suma informe_de_alumno().
 * Ver «Las insignias de la clase» en docs/decisiones/entrenamiento.md.
 *
 * Uso:
 *   const t = await Trofeos.cargar(sb, alumnoId);   // { por_clase, ajustes, total } o null
 *   const p = await Trofeos.premios(sb, alumnoId);  // trofeos e insignias, o null
 *   Trofeos.montarPanel(caja, { sb, alumnoId, alCambiar });   // el profesor ajusta y premia
 *   Trofeos.montarLectura(caja, { sb, alumnoId, quien });     // se mira ("alumno" o "profesor")
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

  // ---- Insignias ----
  const PREMIOS_VACIOS = { trofeos_periodo: 0, trofeos_total: 0, insignias_periodo: 0, insignias_total: 0, insignias: [], ultimas: [] };

  // El catálogo cambia casi nunca: se pide una vez por página.
  let tiposP = null;
  function tiposInsignias(sb) {
    if (!tiposP) {
      tiposP = Promise.resolve(sb.from("insignias_tipos").select("tipo, nombre, emoji, descripcion, orden").order("orden"))
        .then((r) => {
          if (!r || r.error || !Array.isArray(r.data)) { tiposP = null; return []; }
          return r.data;
        })
        .catch(() => { tiposP = null; return []; });
    }
    return tiposP;
  }

  async function premios(sb, alumnoId, desde, hasta) {
    const args = { p_alumno: alumnoId };
    if (desde) args.p_desde = desde;
    if (hasta) args.p_hasta = hasta;
    try {
      const { data, error } = await sb.rpc("premios_de_alumno", args);
      if (error) throw error;
      return Object.assign({}, PREMIOS_VACIOS, (data && data.premios) || {});
    } catch (e) {
      console.warn("No se pudieron cargar los premios:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function otorgar(sb, alumnoId, tipo, motivo) {
    const { data, error } = await sb.rpc("otorgar_insignia", { p_alumno: alumnoId, p_tipo: tipo, p_motivo: motivo || "" });
    if (error) return { error: error.message || "No se pudo dar la insignia." };
    return { insignia: (Array.isArray(data) ? data[0] : data) || null };
  }

  async function quitar(sb, id) {
    const { error } = await sb.rpc("quitar_insignia", { p_id: id });
    return error ? { error: error.message || "No se pudo quitar la insignia." } : { ok: true };
  }

  function textoInsignias(n) { return fmt(n) + (n === 1 ? " insignia" : " insignias"); }

  // "⭐ 2 · 💡 1": cuántas de cada una. El nombre va también escrito (en el
  // title del chip y en la lista de abajo), nunca solo el emoji.
  function chipsInsignias(lista, campo) {
    const ul = document.createElement("ul");
    ul.className = "flex flex-wrap gap-2 mt-2";
    (lista || []).filter((x) => Number(x[campo]) > 0).forEach((x) => {
      const li = document.createElement("li");
      li.className = "text-xs font-semibold px-2.5 py-1 rounded-full bg-accent-500/15 text-brand-800 dark:text-brand-100 border border-accent-400/60";
      const emoji = document.createElement("span");
      emoji.setAttribute("aria-hidden", "true");
      emoji.textContent = x.emoji + " ";
      li.append(emoji, document.createTextNode(x.nombre + " × " + fmt(Number(x[campo]))));
      ul.appendChild(li);
    });
    return ul;
  }

  function listaUltimas(ultimas) {
    const ul = document.createElement("ul");
    ul.className = "text-xs text-brand-600 dark:text-brand-300 space-y-1 mt-1";
    (ultimas || []).forEach((u) => {
      const li = document.createElement("li");
      li.className = "flex items-baseline gap-2";
      const ic = document.createElement("span");
      ic.className = "shrink-0";
      ic.setAttribute("aria-hidden", "true");
      ic.textContent = u.emoji;
      const txt = document.createElement("span");
      txt.className = "flex-1 min-w-0 break-words";
      const nombre = document.createElement("strong");
      nombre.className = "font-semibold";
      nombre.textContent = u.nombre;
      txt.append(nombre);
      if (u.motivo) txt.append(document.createTextNode(" — " + u.motivo));
      const fecha = document.createElement("span");
      fecha.className = "shrink-0 text-brand-450 dark:text-brand-350";
      fecha.textContent = fechaCorta(u.fecha);
      li.append(ic, txt, fecha);
      ul.appendChild(li);
    });
    return ul;
  }

  function fechaCorta(iso) {
    try {
      return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
    } catch (e) { return ""; }
  }

  // De dónde sale el total, dicho con palabras (el número solo no explica
  // por qué no coincide con las respuestas correctas).
  function desglose(t, quien) {
    const partes = [texto(t.por_clase) + " por respuestas correctas en clase"];
    if (t.ajustes) partes.push(conSigno(t.ajustes) + " ajustados por " + (quien === "profesor" ? "el profesor" : "tu profesor"));
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

    // ---- Dar una insignia ----
    const insSec = document.createElement("div");
    insSec.className = "mt-5 pt-4 border-t border-brand-100 dark:border-brand-800";
    const insTit = document.createElement("h4");
    insTit.className = "text-sm font-semibold text-brand-700 dark:text-brand-200";
    insTit.textContent = "🏅 Dar una insignia";
    const insAyuda = document.createElement("p");
    insAyuda.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5";
    insAyuda.textContent = "Para premiar lo que no da trofeo. La ven el alumno, su página de logros y el informe que llega a su casa.";
    const insIdMot = idBase + "-ins-motivo";
    const insLab = document.createElement("label");
    insLab.className = "block text-xs text-brand-500 dark:text-brand-300 mt-2";
    insLab.setAttribute("for", insIdMot);
    insLab.textContent = "¿Por qué? (opcional, lo ven el alumno y su casa)";
    const insMotivo = document.createElement("input");
    insMotivo.type = "text"; insMotivo.id = insIdMot; insMotivo.maxLength = 200;
    insMotivo.placeholder = "Por ejemplo: explicó muy bien por qué el caballo estaba mal";
    insMotivo.className = cant.className + " mt-1";
    const insBotones = document.createElement("div");
    insBotones.className = "grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2";
    const insAviso = document.createElement("p");
    insAviso.className = "text-xs text-brand-500 dark:text-brand-300 mt-2 min-h-[1rem] flex flex-wrap items-center gap-2";
    insAviso.setAttribute("aria-live", "polite");
    const insTiene = document.createElement("div");
    insSec.append(insTit, insAyuda, insLab, insMotivo, insBotones, insAviso, insTiene);

    contenedor.append(total, detalle, rapidos, form, aviso, tituloHist, hist, insSec);

    async function repintarInsignias() {
      const p = await premios(sb, alumnoId);
      insTiene.innerHTML = "";
      if (!p || !p.insignias_total) return;
      const t = document.createElement("p");
      t.className = "text-xs font-semibold text-brand-600 dark:text-brand-300 mt-2";
      t.textContent = "Ya tiene " + textoInsignias(p.insignias_total);
      insTiene.append(t, chipsInsignias(p.insignias, "total"));
    }

    let dando = false;
    async function dar(tipo) {
      if (dando) return;
      dando = true;
      insAviso.textContent = "Guardando…";
      const r = await otorgar(sb, alumnoId, tipo.tipo, insMotivo.value.trim());
      dando = false;
      if (r.error) { insAviso.textContent = "No se pudo dar la insignia: " + r.error; return; }
      insMotivo.value = "";
      insAviso.textContent = "";
      const msg = document.createElement("span");
      msg.textContent = "Le diste «" + tipo.nombre + "». ";
      insAviso.appendChild(msg);
      if (r.insignia && r.insignia.id) {
        const deshacer = boton("Deshacer", "Deshacer la insignia «" + tipo.nombre + "»");
        deshacer.addEventListener("click", async () => {
          deshacer.disabled = true;
          const q = await quitar(sb, r.insignia.id);
          insAviso.textContent = q.error ? "No se pudo deshacer: " + q.error : "Listo, se quitó «" + tipo.nombre + "».";
          repintarInsignias();
        });
        insAviso.appendChild(deshacer);
      }
      repintarInsignias();
    }

    tiposInsignias(sb).then((tipos) => {
      tipos.forEach((tipo) => {
        const b = boton("", "Dar la insignia «" + tipo.nombre + "»", "text-left bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 hover:border-accent-500 text-brand-800 dark:text-brand-100");
        b.title = tipo.descripcion;
        const e = document.createElement("span");
        e.setAttribute("aria-hidden", "true");
        e.textContent = tipo.emoji + " ";
        b.append(e, document.createTextNode(tipo.nombre));
        b.addEventListener("click", () => dar(tipo));
        insBotones.appendChild(b);
      });
      if (!tipos.length) insAviso.textContent = "No se pudieron cargar las insignias.";
    });
    repintarInsignias();

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
      detalle.textContent = desglose(t, "profesor");
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
    const quien = opciones.quien || "alumno";
    const [t, filas, p] = await Promise.all([
      cargar(sb, alumnoId),
      alumnoId ? historial(sb, alumnoId, opciones.limite || 5) : [],
      alumnoId ? premios(sb, alumnoId) : null,
    ]);
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
    detalle.textContent = t.total || t.ajustes ? desglose(t, quien)
      : (quien === "profesor" ? "Todavía no tiene trofeos: cada respuesta marcada correcta en clase le da uno."
        : "Todavía no tienes trofeos: cada respuesta que tu profesor marque correcta en clase te da uno.");
    contenedor.append(total, detalle);
    if (filas.length) {
      const titulo = document.createElement("p");
      titulo.className = "text-xs font-semibold text-brand-600 dark:text-brand-300 mt-3";
      titulo.textContent = quien === "profesor" ? "Ajustes de trofeos" : "Ajustes de tu profesor";
      const ul = document.createElement("ul");
      ul.className = "text-xs text-brand-600 dark:text-brand-300 space-y-1 mt-1";
      pintarHistorial(ul, filas);
      contenedor.append(titulo, ul);
    }
    // Las insignias, debajo de los trofeos.
    const ins = document.createElement("div");
    ins.className = "mt-4 pt-4 border-t border-brand-100 dark:border-brand-800";
    ins.setAttribute("data-insignias", "");
    const insTotal = document.createElement("p");
    insTotal.className = "text-lg font-bold text-brand-800 dark:text-white";
    ins.appendChild(insTotal);
    if (!p) {
      insTotal.textContent = "🏅 —";
      const x = document.createElement("p");
      x.className = "text-sm text-brand-500 dark:text-brand-300";
      x.textContent = "No se pudieron cargar las insignias.";
      ins.appendChild(x);
    } else if (!p.insignias_total) {
      insTotal.textContent = "🏅 " + textoInsignias(0);
      const x = document.createElement("p");
      x.className = "text-sm text-brand-500 dark:text-brand-300 mt-1";
      x.textContent = quien === "profesor"
        ? "Todavía no tiene insignias. Se dan en clase, con el botón 🏆 de su renglón."
        : "Todavía no tienes insignias: tu profesor te las da en clase cuando haces algo que vale la pena, como un buen comentario o un ejercicio bien resuelto.";
      ins.appendChild(x);
    } else {
      insTotal.textContent = "🏅 " + textoInsignias(p.insignias_total);
      ins.appendChild(chipsInsignias(p.insignias, "total"));
      if (p.ultimas.length) {
        const tit = document.createElement("p");
        tit.className = "text-xs font-semibold text-brand-600 dark:text-brand-300 mt-3";
        tit.textContent = "Las últimas";
        ins.append(tit, listaUltimas(p.ultimas));
      }
    }
    contenedor.appendChild(ins);
    return t;
  }

  return { cargar, historial, ajustar, montarPanel, montarLectura, texto, LIMITE,
           premios, otorgar, quitar, tiposInsignias, textoInsignias, chipsInsignias };
})();
