/* El código de metropolitano-mi-inscripcion.html: ver y corregir una
 * inscripción al Metropolitano 2026 con el enlace secreto de su envío.
 *
 * El enlace llega en la confirmación de la página y en los correos
 * (…/metropolitano-mi-inscripcion.html#t=<64 hex>): el secreto va detrás del
 * #, que no viaja al servidor ni queda en sus registros. Con él,
 * public.metropolitano_mi_inscripcion() da el envío entero (sin documentos ni
 * fotos) y public.metropolitano_corregir() cambia lo que no toca el precio ni
 * el torneo: contactos, emergencia, viaje, fechas del hospedaje y de las
 * comidas, dieta, foto, placa y otro comprobante (el pago vuelve a «por
 * revisar»). Quien decide es la base: comprueba todo otra vez, también las
 * camas del hospedaje.
 *
 * Sin enlace, se pide con el código y el correo (metropolitano_pedir_enlace),
 * que responde lo mismo coincida o no.
 *
 * Ver «Corregir la inscripción» en docs/decisiones/cuentas-y-formularios.md.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const R = window.MetropolitanoReglas;
  const BUCKET = "metropolitano-2026";
  const CAMPO = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2.5 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  document.querySelectorAll("[data-campo]").forEach((x) => { x.className = CAMPO; });
  const token = (/[#&]t=([0-9a-f]{64})/.exec(location.hash) || [])[1] || "";
  let datos = null, comprobante = null;
  const fotos = new Map();   // id de la persona → { archivo, ruta }

  /* ---------- pedir el enlace ---------- */
  function mostrarPedir(motivo) {
    $("estado").textContent = motivo || "";
    $("pedir").classList.remove("hidden");
    $("ficha").classList.add("hidden");
  }
  $("pedir").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("pedir-boton").disabled = true; $("pedir-msg").textContent = "Revisando…";
    const { data, error } = await window.sb.rpc("metropolitano_pedir_enlace", { p_codigo: $("pedir-codigo").value.trim(), p_correo: $("pedir-correo").value.trim() });
    $("pedir-boton").disabled = false;
    if (error || !data) { $("pedir-msg").textContent = "No se pudo pedir el enlace. Revisa la conexión e intenta de nuevo."; return; }
    $("pedir-msg").textContent = data.ok
      ? "Listo. Si el código y el correo coinciden con una inscripción, en unos minutos te llega el enlace a ese correo (revisa también el correo no deseado)."
      : data.error;
  });

  /* ---------- la ficha ---------- */
  function campo(etiqueta, el) {
    const d = document.createElement("div");
    const l = document.createElement("label"); l.className = "block text-sm font-semibold mb-1"; l.htmlFor = el.id; l.textContent = etiqueta;
    d.append(l, el); return d;
  }
  function entrada(id, valor, tipo, max) {
    const i = document.createElement("input"); i.id = id; i.className = CAMPO; i.type = tipo || "text"; if (max) i.maxLength = max;
    i.value = valor == null ? "" : String(valor); return i;
  }

  function tarjeta(x, k) {
    const sec = document.createElement("section"); sec.className = "metro-persona"; sec.dataset.id = x.id;
    const id = (s) => "p" + k + "-" + s;
    const h = document.createElement("header"); h.className = "px-4 py-3 font-semibold";
    h.textContent = x.codigo + " · " + x.nombre + " " + x.apellidos + " — " + (x.es_delegado && x.rol !== "delegado" ? "Delegado y " + R.rolDe(x.rol, x.sexo).toLowerCase() : R.rolDe(x.rol, x.sexo))
      + (x.torneos && x.torneos.length ? " · " + x.torneos.map((t) => R.TORNEOS[t].nombre).join(" + ") : "");
    const c = document.createElement("div"); c.className = "p-4 space-y-4";
    const g = document.createElement("div"); g.className = "grid sm:grid-cols-2 gap-4";
    const principal = k === 0;
    g.append(campo("Correo electrónico" + (principal ? " *" : " (opcional)"), Object.assign(entrada(id("correo"), x.correo, "email", 120), { autocomplete: "email" })),
      campo("Teléfono o WhatsApp" + (principal ? " *" : ""), Object.assign(entrada(id("tel"), x.telefono, "tel", 25), { autocomplete: "tel" })));
    const em = x.emergencia || {};
    g.append(campo("Emergencia: nombre *", entrada(id("enom"), em.nombre, "text", 100)), campo("Emergencia: parentesco", entrada(id("epar"), em.parentesco, "text", 40)),
      campo("Emergencia: teléfono *", entrada(id("etel"), em.telefono, "tel", 25)));
    c.append(g);
    // El viaje: de quien viene de otro país y de los titulados invitados.
    if (x.origen === "fuera" || x.titulado) {
      const v = x.viaje || {};
      const gv = document.createElement("div"); gv.className = "grid sm:grid-cols-3 gap-4";
      gv.append(campo(x.titulado && x.origen !== "fuera" ? "Llega al Estadio Nacional" : "Día de llegada", Object.assign(entrada(id("lleg"), v.llegada, "date"), { min: "2026-12-15", max: "2027-01-05" })),
        campo(x.titulado && x.origen !== "fuera" ? "Sale del Estadio Nacional" : "Día de salida", Object.assign(entrada(id("sal"), v.salida, "date"), { min: "2026-12-15", max: "2027-01-05" })));
      if (x.origen === "fuera") gv.append(campo("Vuelo o medio de llegada", entrada(id("vuelo"), v.vuelo, "text", 60)));
      const t = document.createElement("p"); t.className = "font-semibold"; t.textContent = "Viaje";
      c.append(t, gv);
      if (x.origen === "fuera") {
        const l = document.createElement("label"); l.className = "flex items-center gap-2 text-sm";
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = id("tras"); cb.checked = !!v.traslado;
        l.append(cb, " Necesita transporte del aeropuerto al Estadio Nacional"); c.append(l);
      }
    }
    // El hospedaje (las fechas; pedirlo o quitarlo, con la organización).
    if (x.hospedaje) {
      const gh = document.createElement("div"); gh.className = "grid sm:grid-cols-2 gap-4";
      gh.append(campo("Hospedaje desde (noche de llegada)", Object.assign(entrada(id("hdes"), x.hospedaje_desde, "date"), { min: "2026-12-20", max: "2027-01-02" })),
        campo("Hospedaje hasta (día de salida)", Object.assign(entrada(id("hhas"), x.hospedaje_hasta, "date"), { min: "2026-12-21", max: "2027-01-03" })));
      const t = document.createElement("p"); t.className = "font-semibold"; t.textContent = "Hospedaje en el Estadio Nacional" + (x.acompanantes ? " (con " + x.acompanantes + (x.acompanantes === 1 ? " acompañante)" : " acompañantes)") : "");
      c.append(t, gh);
    }
    // La alimentación (los titulados no la piden: se la da la organización).
    if (!x.titulado) {
      const t = document.createElement("p"); t.className = "font-semibold"; t.textContent = "Alimentación";
      const fila = document.createElement("div"); fila.className = "flex flex-wrap gap-4";
      ["desayuno", "almuerzo", "cena"].forEach((m) => {
        const l = document.createElement("label"); l.className = "flex items-center gap-2 text-sm";
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.dataset.comida = m; cb.checked = (x.comidas || []).includes(m);
        l.append(cb, " " + m[0].toUpperCase() + m.slice(1)); fila.append(l);
      });
      const gc = document.createElement("div"); gc.className = "grid sm:grid-cols-2 gap-4";
      gc.append(campo("Desde", Object.assign(entrada(id("cdes"), x.comidas_desde || "2026-12-26", "date"), { min: "2026-12-20", max: "2027-01-03" })),
        campo("Hasta", Object.assign(entrada(id("chas"), x.comidas_hasta || "2026-12-30", "date"), { min: "2026-12-20", max: "2027-01-03" })),
        Object.assign(campo("Dieta especial o alergias", entrada(id("dieta"), x.dieta, "text", 300)), { className: "sm:col-span-2" }));
      c.append(t, fila, gc);
    }
    if (x.parqueo) c.append(campo("Placa del vehículo (parqueo)", Object.assign(entrada(id("placa"), x.placa, "text", 12), { autocapitalize: "characters", spellcheck: false })));
    // Otra foto para el gafete.
    const df = document.createElement("div"); df.className = "space-y-1";
    const lf = document.createElement("label"); lf.htmlFor = id("foto"); lf.className = "metro-boton inline-block cursor-pointer"; lf.textContent = "📷 Cambiar la foto del gafete";
    const inf = document.createElement("input"); inf.type = "file"; inf.id = id("foto"); inf.accept = "image/*"; inf.className = "sr-only"; lf.append(inf);
    const ef = document.createElement("p"); ef.className = "text-xs"; ef.setAttribute("aria-live", "polite");
    inf.addEventListener("change", () => {
      const a = inf.files[0]; inf.value = "";
      if (!a) return;
      if (!/^image\//.test(a.type)) { ef.textContent = "«" + a.name + "» no sirve: elige una foto (JPG o PNG)."; return; }
      fotos.set(x.id, { archivo: a, ruta: null }); ef.textContent = "Foto nueva: " + a.name + " (se sube al guardar).";
    });
    df.append(lf, ef);
    c.append(df);
    sec.append(h, c);
    return sec;
  }

  const PAGO = {
    verificado: ["✓ Pago verificado. La inscripción quedó lista.", "bg-green-50 dark:bg-brand-950 border-2 border-green-700"],
    por_revisar: ["El pago está por revisar: la organización revisa el comprobante y te avisa por correo.", "bg-amber-50 dark:bg-brand-950 border-2 border-amber-500"],
    rechazado: ["No se pudo verificar el pago.", "bg-red-50 dark:bg-brand-950 border-2 border-red-700"],
    no_aplica: ["La inscripción no tiene costo.", "bg-brand-50 dark:bg-brand-950"],
  };
  function pintar() {
    $("estado").textContent = "";
    $("pedir").classList.add("hidden");
    $("ficha").classList.remove("hidden");
    $("ficha-sub").textContent = datos.grupo ? "La delegación " + (datos.delegacion || "") + ": " + datos.personas.length + " personas." : "Tu inscripción.";
    const p = datos.pago || {};
    const [texto, clase] = PAGO[p.estado] || PAGO.no_aplica;
    $("pago").className = "rounded-xl p-4 space-y-3 " + clase;
    $("pago-estado").textContent = texto + (Number(p.total) > 0 ? " Total: " + R.dinero(Number(p.total)) + (p.metodo && R.METODOS[p.metodo] ? " por " + R.METODOS[p.metodo].nombre : "") + "." : "")
      + (p.estado === "rechazado" && p.nota ? " El motivo: " + p.nota + "." : "");
    $("pago-nuevo").classList.toggle("hidden", !datos.puede_corregir || !(p.estado === "rechazado" || p.estado === "por_revisar"));
    $("solo-ver").classList.toggle("hidden", !!datos.puede_corregir);
    $("guardar").classList.toggle("hidden", !datos.puede_corregir);
    const caja = $("personas"); caja.textContent = "";
    datos.personas.filter((x) => x.estado === "activa").forEach((x, k) => caja.append(tarjeta(x, k)));
    caja.querySelectorAll("input").forEach((i) => { i.disabled = !datos.puede_corregir; });
  }

  async function leer() {
    if (!token) { mostrarPedir(""); return; }
    const { data, error } = await window.sb.rpc("metropolitano_mi_inscripcion", { p_token: token });
    if (error || !data) { $("estado").textContent = "No se pudo leer la inscripción. Revisa la conexión y vuelve a abrir el enlace."; return; }
    if (!data.ok) { mostrarPedir(data.error); return; }
    datos = data;
    pintar();
  }

  /* ---------- subir y guardar ---------- */
  async function subir(x, carpeta) {
    if (x.ruta) return x.ruta;
    const listo = await window.Adjuntos.preparar(x.archivo, carpeta === "foto");
    const ext = (/\.([a-z0-9]+)$/.exec(listo.nombre) || [])[1];
    if (!["jpg", "png", "webp", "pdf"].includes(ext)) throw new Error("«" + x.archivo.name + "» no es una foto ni un PDF.");
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    const ruta = carpeta + "/" + id + "/" + listo.nombre;
    const { error } = await window.sb.storage.from(BUCKET).upload(ruta, listo.blob, { contentType: listo.tipo, upsert: false });
    if (error) throw new Error("No se pudo subir «" + x.archivo.name + "». Revisa la conexión e intenta de nuevo.");
    x.ruta = ruta;
    return ruta;
  }
  $("comprobante").addEventListener("change", () => {
    const a = $("comprobante").files[0]; $("comprobante").value = "";
    if (!a) return;
    if (!/^image\//.test(a.type) && !/\.pdf$/i.test(a.name)) { $("comprobante-estado").textContent = "«" + a.name + "» no sirve: sube una foto o un PDF."; return; }
    comprobante = { archivo: a, ruta: null };
    $("comprobante-estado").textContent = "Elegido: " + a.name + " (se sube al guardar).";
  });

  let guardando = false;
  $("guardar").addEventListener("click", async () => {
    if (guardando || !datos) return;
    guardando = true; $("guardar").disabled = true;
    const msg = $("msg"); msg.className = "text-sm"; msg.textContent = "Guardando…";
    try {
      const personas = [];
      for (const sec of $("personas").querySelectorAll("section[data-id]")) {
        const v = (s) => { const el = sec.querySelector('[id$="-' + s + '"]'); return el ? el.value.trim() : ""; };
        const x = { id: sec.dataset.id, correo: v("correo"), telefono: v("tel"), emergencia: { nombre: v("enom"), parentesco: v("epar"), telefono: v("etel") } };
        if (sec.querySelector('[id$="-lleg"]')) x.viaje = { llegada: v("lleg"), salida: v("sal"), vuelo: v("vuelo"), traslado: !!(sec.querySelector('[id$="-tras"]') || {}).checked };
        if (sec.querySelector('[id$="-hdes"]')) { x.hospedaje_desde = v("hdes"); x.hospedaje_hasta = v("hhas"); }
        if (sec.querySelector("[data-comida]")) {
          x.comidas = [...sec.querySelectorAll("[data-comida]:checked")].map((c) => c.dataset.comida);
          x.comidas_desde = v("cdes"); x.comidas_hasta = v("chas"); x.dieta = v("dieta");
        }
        if (sec.querySelector('[id$="-placa"]')) x.placa = v("placa");
        const f = fotos.get(x.id);
        if (f) { msg.textContent = "Subiendo la foto…"; x.foto = await subir(f, "foto"); }
        personas.push(x);
      }
      const cambio = { personas };
      if (comprobante) {
        msg.textContent = "Subiendo el comprobante…";
        cambio.comprobante = await subir(comprobante, "comprobante");
        cambio.pago_referencia = $("referencia").value.trim(); cambio.pago_fecha = $("pago_fecha").value || null;
      }
      msg.textContent = "Guardando…";
      const { data, error } = await window.sb.rpc("metropolitano_corregir", { p_token: token, p: cambio });
      if (error || !data || !data.ok) throw new Error((data && data.error) || "No se pudo guardar. Revisa la conexión e intenta de nuevo.");
      datos = data; fotos.clear(); comprobante = null;
      pintar();
      msg.className = "text-sm font-semibold"; msg.textContent = "✓ Listo: se guardaron los cambios" + (cambio.comprobante ? ". El pago volvió a quedar por revisar." : ".");
    } catch (e) {
      msg.className = "text-sm text-red-700 dark:text-red-400"; msg.textContent = e.message || String(e);
    } finally {
      guardando = false; $("guardar").disabled = false;
    }
  });

  leer();
})();
