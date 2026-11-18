/* El código de familia.html: la página de la familia.
 *
 * Lo que hoy le llega a la casa por correo, en una página que se abre con un
 * enlace secreto y sin cuenta (…/familia.html#t=<64 hex>). El secreto va
 * detrás del #, que no viaja al servidor ni queda en sus registros. El enlace
 * es de UN encargado y muestra a UN alumno: lo enciende quien le da clase,
 * desde Informes, y lo puede apagar o cambiar.
 *
 * Todo lo que se pinta llega de una vez de public.familia_pagina(token), y la
 * ausencia se avisa con public.familia_avisar_ausencia(). Quien decide qué se
 * ve es la base: aquí no hay nada que filtrar.
 *
 * Los pedidos van SIN sesión, con fetch y la clave pública: quien abre el
 * enlace en un navegador donde tiene sesión de la Academia (un profe que lo
 * prueba, una mamá que también es alumna) no manda su identidad. Con ella, la
 * base le exigiría la verificación en dos pasos antes de mirar el enlace.
 *
 * Ver «La página de la familia» en docs/decisiones/informes.md.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const H = window.HoraCR;
  const token = (/[#&]t=([0-9a-f]{64})/.exec(location.hash) || [])[1] || "";
  const MOTIVOS = [["cita", "Una cita (médica u otra)"], ["salud", "Salud"], ["estudios", "El colegio o los estudios"], ["familiar", "Un asunto familiar"], ["viaje", "Un viaje"], ["otro", "Otro motivo"]];
  const MOTIVO = Object.fromEntries(MOTIVOS);
  const PASTILLA = {
    bien: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
    ojo: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
    mal: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  };

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "texto") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v);
    }
    for (const h of hijos.flat()) if (h != null && h !== false) n.append(h);
    return n;
  }
  const pastilla = (tipo, texto) => el("span", { class: "inline-block rounded-full px-3 py-0.5 text-xs font-semibold whitespace-nowrap " + PASTILLA[tipo], texto });
  const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const diaLargo = (x) => H.fecha(x, { weekday: "long", day: "numeric", month: "long" });
  const diaCorto = (x) => H.fecha(x, { day: "numeric", month: "long" });
  const dinero = (monto, moneda) => new Intl.NumberFormat("es-CR", { style: "currency", currency: moneda || "CRC", maximumFractionDigits: (moneda || "CRC") === "CRC" ? 0 : 2 }).format(Number(monto) || 0);
  const minutos = (m) => { m = Math.round(Number(m) || 0); return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min"; };
  const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || "tu hijo o hija";

  async function pedir(fn, args) {
    const clave = window.SUPABASE_ANON_KEY;
    const r = await fetch(window.SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: clave, Authorization: "Bearer " + clave, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error("La base respondió " + r.status);
    return r.json();
  }

  function noSirve(texto) {
    $("fam-cargando").hidden = true;
    $("fam-pagina").hidden = true;
    $("fam-error").hidden = false;
    $("fam-error-texto").textContent = texto;
  }

  // Cada lista: una fila con lo que es a la izquierda y su estado, escrito, a la derecha.
  function fila(titulo, detalle, derecha) {
    return el("li", { class: "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 border-t border-brand-100 dark:border-brand-700 first:border-t-0 first:pt-0" },
      el("span", { class: "min-w-0 flex-1 basis-48" }, el("span", { class: "block", texto: titulo }),
        detalle ? el("span", { class: "block text-xs text-brand-600 dark:text-brand-300", texto: detalle }) : null),
      derecha);
  }
  function llenar(id, hijos) { const c = $(id); c.replaceChildren(...hijos.flat().filter(Boolean)); return c; }

  function pintarProxima(d, nombre) {
    const p = d.proximas[0];
    if (!p) { $("fam-proxima").hidden = true; return; }
    $("fam-proxima").hidden = false;
    llenar("fam-proxima-cuerpo", [
      el("p", { class: "font-serif text-xl font-bold", texto: mayus(diaLargo(p.inicio)) + ", " + H.hora(p.inicio) }),
      el("p", { class: "mt-1", texto: (p.modalidad === "presencial" ? "Presencial" : "En línea") + (p.profesor ? ", con " + p.profesor : "") + "." + (p.titulo ? " " + p.titulo + "." : "") }),
      d.proximas.length > 1 ? el("p", { class: "mt-2 text-sm text-brand-600 dark:text-brand-300", texto: "Después: " + d.proximas.slice(1, 4).map((x) => diaCorto(x.inicio)).join(", ") + "." }) : null,
    ]);
  }

  function pintarSemana(d, nombre) {
    const i = d.informe || {}, c = i.comparacion || {};
    const cifra = (n, texto) => el("div", {}, el("span", { class: "block text-3xl font-bold tabular-nums leading-tight", texto: n }), el("span", { class: "text-sm text-brand-600 dark:text-brand-300", texto }));
    const esta = Number(c.esta != null ? c.esta : i.respuestas) || 0;
    const dias = Number(i.dias_activos) || 0;
    const frase = !esta && !dias ? "Esta semana todavía no ha practicado en la plataforma."
      : c.anterior == null ? ""
      : esta > c.anterior ? "Practicó más que la semana pasada."
      : esta === c.anterior ? "Practicó lo mismo que la semana pasada."
      : "Practicó menos que la semana pasada.";
    llenar("fam-semana-cuerpo", [
      el("div", { class: "grid grid-cols-2 sm:grid-cols-3 gap-4" },
        cifra(String(esta), "ejercicios resueltos" + (c.anterior != null ? " (la semana anterior, " + c.anterior + ")" : "")),
        cifra(dias + " de " + (Number(i.dias_del_periodo) || 7), dias === 1 ? "día en que practicó" : "días en que practicó"),
        cifra(minutos((Number(i.minutos_ejercicios) || 0) + (Number(i.minutos_clase) || 0)), "entre práctica y clase")),
      frase ? el("p", { class: "mt-3 text-sm", texto: frase }) : null,
      i.plan && i.plan.rutina ? el("p", { class: "mt-2 text-sm text-brand-600 dark:text-brand-300", texto: "Lo que su profe espera que practique: " + i.plan.rutina }) : null,
    ]);
  }

  function pintarViene(d, nombre) {
    const i = d.informe || {};
    const hijos = [];
    const dg = i.diagnostico;
    if (dg && dg.nivel) hijos.push(el("p", { class: "font-serif text-lg font-bold", texto: "Su nivel en el último diagnóstico: " + dg.nivel + "." }),
      dg.fecha ? el("p", { class: "text-sm text-brand-600 dark:text-brand-300", texto: "Lo rindió el " + diaCorto(dg.fecha) + "." }) : null);
    const areas = (i.plan && Array.isArray(i.plan.areas) ? i.plan.areas : []).filter((a) => a && a.titulo);
    if (areas.length) hijos.push(el("h3", { class: "font-semibold mt-4 mb-1", texto: "En qué está trabajando" }),
      el("ul", { class: "list-disc pl-5 space-y-1 text-sm" }, areas.slice(0, 4).map((a) => el("li", {}, el("strong", { texto: a.titulo }), a.objetivo ? ": " + a.objetivo : ""))));
    for (const m of (Array.isArray(i.mensajes) ? i.mensajes : []).slice(0, 2)) {
      hijos.push(el("blockquote", { class: "mt-4 border-l-4 border-accent-500 pl-4 py-1" },
        el("p", { texto: m.texto }),
        el("footer", { class: "mt-1 text-sm text-brand-600 dark:text-brand-300", texto: "Unas palabras de su profe" + (m.autor ? ", " + m.autor : "") + (m.fecha ? " · " + diaCorto(m.fecha) : "") })));
    }
    $("fam-viene").hidden = !hijos.length;
    llenar("fam-viene-cuerpo", hijos);
  }

  function pintarTareas(d) {
    const ESTADO = { completada: ["bien", "Entregada"], vencida: ["mal", "No la entregó"], pendiente: ["ojo", "Pendiente"] };
    const filas = d.tareas.map((t) => {
      const e = ESTADO[t.situacion] || ESTADO.pendiente;
      const avance = t.renglones ? "lleva " + t.cumplidos + " de " + t.renglones : "";
      const cuando = t.vence_at ? (t.situacion === "pendiente" ? "Para el " : "Era para el ") + diaLargo(t.vence_at) : "";
      return fila(t.titulo || "Tarea", [cuando, t.situacion === "completada" ? "" : avance].filter(Boolean).join(" · "), pastilla(e[0], e[1]));
    });
    llenar("fam-tareas-cuerpo", filas.length ? [el("ul", {}, filas)] : [el("p", { class: "text-sm text-brand-600 dark:text-brand-300", texto: "No tiene tareas puestas en este momento." })]);
  }

  function pintarAsistencia(d, nombre) {
    const a = d.asistencia;
    $("fam-asistencia").hidden = !a.length;
    if (!a.length) return;
    const fue = a.filter((x) => x.presente).length, faltas = a.length - fue, just = a.filter((x) => !x.presente && x.justificada).length;
    const resumen = "Fue a " + fue + " de " + a.length + (a.length === 1 ? " clase" : " clases") + "."
      + (faltas ? " " + (faltas === 1 ? "Una falta" : faltas + " faltas") + (just === faltas ? (faltas === 1 ? ", justificada." : ", justificadas.") : just ? (just === 1 ? ", una de ellas justificada." : ", " + just + " de ellas justificadas.") : ".") : "");
    llenar("fam-asistencia-cuerpo", [
      el("p", { class: "mb-2", texto: resumen }),
      el("ul", {}, a.map((x) => fila(mayus(diaLargo(x.inicio)), x.presente && x.tarde > 0 ? "Llegó " + x.tarde + " min tarde" : "",
        x.presente ? pastilla("bien", "Presente") : x.justificada ? pastilla("ojo", "Falta justificada") : pastilla("mal", "Falta")))),
    ]);
  }

  function pintarPagos(d) {
    const cobros = d.cobros, recibos = d.recibos;
    $("fam-pagos").hidden = !cobros.length && !recibos.length;
    if ($("fam-pagos").hidden) return;
    const deben = cobros.filter((c) => c.situacion === "pendiente" || c.situacion === "vencido");
    const porMoneda = {};
    for (const c of deben) porMoneda[c.moneda || "CRC"] = (porMoneda[c.moneda || "CRC"] || 0) + (Number(c.saldo) || 0);
    const total = Object.entries(porMoneda).map(([m, x]) => dinero(x, m)).join(" + ");
    const ESTADO = { pagado: ["bien", "Pagado"], vencido: ["mal", "Vencido"], pendiente: ["ojo", "Pendiente"] };
    llenar("fam-pagos-cuerpo", [
      el("p", { class: "flex flex-wrap items-baseline justify-between gap-2" },
        el("span", { texto: deben.length ? "Pendiente de pago" : "Está al día" }),
        deben.length ? el("strong", { class: "text-2xl tabular-nums", texto: total }) : pastilla("bien", "Sin pagos pendientes")),
      el("p", { class: "mt-2 mb-3 rounded-lg bg-brand-50 dark:bg-brand-950 p-3 text-sm", texto: "Se paga por SINPE Móvil, transferencia o efectivo, y el comprobante se le manda a la academia. Esta página no cobra ni pide datos de tarjetas." }),
      cobros.length ? el("ul", {}, cobros.map((c) => {
        const e = ESTADO[c.situacion] || ESTADO.pendiente;
        const detalle = [c.periodo_inicio && c.periodo_fin ? "Cubre del " + diaCorto(c.periodo_inicio) + " al " + diaCorto(c.periodo_fin) : "",
          c.situacion === "pagado" ? (c.ultimo_pago ? "pagado el " + diaCorto(c.ultimo_pago) : "") : c.vence ? "vence el " + diaCorto(c.vence) : ""].filter(Boolean).join(" · ");
        return fila(c.concepto || "Cobro", detalle, el("span", { class: "flex items-baseline gap-3" }, el("span", { class: "font-semibold tabular-nums", texto: dinero(c.monto, c.moneda) }), pastilla(e[0], e[1])));
      })) : null,
      recibos.length ? el("h3", { class: "font-semibold mt-4 mb-1", texto: "Recibos" }) : null,
      recibos.length ? el("ul", {}, recibos.map((r) => fila("Recibo " + (r.numero || ""), [r.fecha ? "del " + diaCorto(r.fecha) : "", r.metodo || ""].filter(Boolean).join(" · "),
        el("span", { class: "font-semibold tabular-nums", texto: dinero(r.total, r.moneda) })))) : null,
    ]);
  }

  function pintarAvisos(d) {
    const ESTADO = { aceptada: ["bien", "Aceptada"], no_aceptada: ["mal", "No aceptada"], pendiente: ["ojo", "Por revisar"] };
    const c = $("fam-avisos");
    c.hidden = !d.avisos.length;
    if (c.hidden) return;
    c.replaceChildren(el("h3", { class: "font-semibold mt-4 mb-1", texto: "Ausencias ya avisadas" }),
      el("ul", {}, d.avisos.map((a) => { const e = ESTADO[a.estado] || ESTADO.pendiente; return fila(mayus(diaLargo(a.desde)) + (a.hasta !== a.desde ? " al " + diaCorto(a.hasta) : ""), MOTIVO[a.motivo] || "", pastilla(e[0], e[1])); })));
  }

  function pintarFormulario(d) {
    const sel = $("fam-aus-clase"), fecha = $("fam-aus-fecha");
    const hoy = H.dia();
    if (d.proximas.length) {
      const vistos = new Set();
      sel.replaceChildren(...d.proximas.filter((p) => !vistos.has(p.fecha) && vistos.add(p.fecha)).map((p) => el("option", { value: p.fecha, texto: mayus(diaLargo(p.inicio)) + ", " + H.hora(p.inicio) })));
      $("fam-aus-con-lista").hidden = false; $("fam-aus-sin-lista").hidden = true;
    } else {
      fecha.min = hoy; fecha.max = H.sumarDias(hoy, 28); fecha.value = hoy;
      $("fam-aus-con-lista").hidden = true; $("fam-aus-sin-lista").hidden = false;
    }
    $("fam-aus-motivo").replaceChildren(...MOTIVOS.map(([v, t]) => el("option", { value: v, texto: t })));
  }

  function pintar(d) {
    const nombre = primerNombre(d.alumno && d.alumno.nombre);
    document.title = "Así va " + nombre + " — Ajedrez Integral";
    $("fam-titulo").textContent = "Así va " + ((d.alumno && d.alumno.nombre) || nombre);
    $("fam-sub").textContent = (d.alumno && d.alumno.grupo ? "Grupo " + d.alumno.grupo + ". " : "") + "Al día el " + diaLargo(d.al_dia) + ", " + H.hora(d.al_dia) + " (hora de Costa Rica).";
    $("fam-privado").textContent = "Este enlace es privado y es solo para la familia de " + nombre + ". Quien lo tenga puede ver esta página, así que no conviene reenviarlo. Si llegó a otras manos, su profe lo puede apagar y mandar uno nuevo.";
    pintarProxima(d, nombre); pintarSemana(d, nombre); pintarViene(d, nombre); pintarTareas(d); pintarAsistencia(d, nombre); pintarPagos(d); pintarAvisos(d); pintarFormulario(d);
    $("fam-cargando").hidden = true; $("fam-error").hidden = true; $("fam-pagina").hidden = false;
  }

  async function cargar() {
    if (!token) { noSirve("A esta página se entra con el enlace que te mandó su profe. Si no lo tienes, pídeselo."); return; }
    let d;
    try { d = await pedir("familia_pagina", { p_token: token }); }
    catch (e) { noSirve("No se pudo cargar la página. Revisa la conexión y vuelve a abrir el enlace."); return; }
    if (!d || !d.ok) { noSirve("Este enlace ya no sirve: se apagó o se cambió por uno nuevo. Pídele a su profe el enlace de ahora."); return; }
    for (const k of ["proximas", "asistencia", "tareas", "cobros", "recibos", "avisos"]) if (!Array.isArray(d[k])) d[k] = [];
    pintar(d);
  }

  $("fam-form-ausencia").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("fam-aus-msg"), boton = $("fam-aus-boton");
    const fecha = $("fam-aus-con-lista").hidden ? $("fam-aus-fecha").value : $("fam-aus-clase").value;
    if (!$("fam-aus-acepto").checked) { msg.textContent = "Marca la casilla de la política de privacidad para mandar el aviso."; $("fam-aus-acepto").focus(); return; }
    if (!fecha) { msg.textContent = "Elige el día de la clase."; return; }
    boton.disabled = true; msg.textContent = "Mandando el aviso…";
    let r;
    try {
      r = await pedir("familia_avisar_ausencia", { p_token: token, p_fecha: fecha, p_motivo: $("fam-aus-motivo").value, p_detalle: $("fam-aus-nota").value, p_privacidad: (window.LegalVersion || {}).PRIVACIDAD || "" });
    } catch (e) { r = null; }
    boton.disabled = false;
    if (!r) { msg.textContent = "No se pudo mandar el aviso. Revisa la conexión e intenta de nuevo."; return; }
    if (!r.ok) { msg.textContent = r.error || "No se pudo mandar el aviso."; return; }
    msg.textContent = "Listo: su profe ya recibió el aviso de la ausencia del " + diaLargo(fecha) + ". La falta queda justificada cuando él la acepte.";
    $("fam-aus-nota").value = "";
    cargar();
  });

  cargar();
})();

/*! rev bfb5bbb0d2d82f9f */
