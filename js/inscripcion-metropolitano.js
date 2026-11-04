/* El código de inscripcion-metropolitano.html: la inscripción pública (sin
 * cuenta) al XLVII Torneo Internacional Metropolitano 2026 de la FCA.
 *
 * El recorrido:
 *   1. El ID FIDE: mientras escribe el nombre (o el ID) se busca en la lista
 *      de FIDE —por la Edge Function `pareo-listas-elo`, la misma de Pareo
 *      Integral, porque ratings.fide.com no deja leerse desde el navegador— y
 *      la persona toca su nombre. Eso llena el ID, la federación, el título y
 *      los tres Elo. Sin ID FIDE, se piden los datos para tramitarlo.
 *   2. Con el Elo estándar y la fecha de nacimiento se habilitan los torneos
 *      que puede jugar (js/metropolitano-reglas.js); si puede varios, elige.
 *   3. Logística, foto, pago (el monto sale solo) y consentimientos.
 *   4. «Revisar mi inscripción» enseña el GAFETE (js/metropolitano-gafete.js)
 *      con el resumen, y la persona confirma que está bien. Recién ahí se
 *      suben los archivos y se manda a public.metropolitano_inscribir(), que
 *      vuelve a comprobar y calcular todo.
 *
 * Lo que se decide acá es cortesía; quien decide es la base. Ver «La
 * inscripción del Metropolitano 2026» en docs/decisiones/cuentas-y-formularios.md.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const R = window.MetropolitanoReglas;
  const BUCKET = "metropolitano-2026";
  const hoy = window.HoraCR.hoy();
  const plazo = R.abierto(hoy);

  const CLASE_CAMPO = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2.5 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  document.querySelectorAll("[data-campo]").forEach((el) => { el.className = CLASE_CAMPO; });

  const estado = {
    elegido: null,        // la fila de FIDE elegida
    clasico: null,        // "A" | "B" | "U14" | null
    metodo: null,
    foto: null,           // { archivo, url, ruta }
    comprobante: null,    // { archivo, url, ruta }
    fotoImg: null,        // la imagen ya decodificada, para el gafete
    datos: null,          // lo que se manda (armado en «Revisar»)
    codigo: null,
  };

  /* ===================== El plazo ===================== */
  if (!plazo.blitz) {
    $("formulario").classList.add("hidden");
    $("cerrado").classList.remove("hidden");
    return;
  }
  $("aviso-plazo").textContent = !plazo.clasicos
    ? "Los torneos clásicos ya cerraron (el 20 de diciembre). Todavía puedes inscribirte en el blitz, hasta el 26 de diciembre."
    : plazo.recargo
      ? "La inscripción regular cerró el 16 de diciembre: hasta el 20, los clásicos llevan el 30 % de recargo de las bases."
      : "La inscripción regular cierra el 16 de diciembre; del 17 al 20 lleva un 30 % de recargo. El blitz se recibe hasta el 26.";

  /* ===================== Países ===================== */
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "region" });
    const nombres = new Set();
    Object.values(window.GafetesBanderas.FIDE).forEach((iso) => {
      if (iso.length !== 2) return;
      const n = dn.of(iso.toUpperCase());
      if (n && n.toUpperCase() !== iso.toUpperCase()) nombres.add(n);
    });
    [...nombres].sort((a, b) => a.localeCompare(b, "es")).forEach((n) => {
      const o = document.createElement("option"); o.value = n; $("paises").append(o);
    });
  } catch (e) { /* sin la lista, se escribe a mano */ }

  /* ===================== 1. El ID FIDE ===================== */
  const sinFide = () => document.querySelector('input[name="tiene_fide"]:checked').value === "no";
  document.querySelectorAll('input[name="tiene_fide"]').forEach((r) => r.addEventListener("change", () => {
    $("caja-fide").classList.toggle("hidden", sinFide());
    $("caja-sin-fide").classList.toggle("hidden", !sinFide());
    if (sinFide()) { estado.elegido = null; pintarElegido(); }
    recalcular();
  }));

  const cache = new Map();
  let espera = null, turno = 0;
  $("buscar-fide").addEventListener("input", () => {
    clearTimeout(espera);
    const q = $("buscar-fide").value.replace(/\s+/g, " ").trim();
    if (q.length < 3) { $("resultados-fide").textContent = ""; $("estado-fide").textContent = q ? "Escribe al menos 3 letras." : ""; return; }
    $("estado-fide").textContent = "Buscando en la lista de FIDE…";
    espera = setTimeout(() => buscar(q), 650);
  });
  $("buscar-fide").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { const b = $("resultados-fide").querySelector("button"); if (b) { e.preventDefault(); b.focus(); } }
    if (e.key === "Enter") e.preventDefault();
  });

  async function buscar(q) {
    const mio = ++turno;
    let r = cache.get(q.toLowerCase());
    if (!r) {
      r = await window.PareoEloNacional.buscarEnLista("fide", q);
      if (r && r.ok) cache.set(q.toLowerCase(), r);
    }
    if (mio !== turno) return;
    const lista = $("resultados-fide");
    lista.textContent = "";
    if (!r || !r.ok) { $("estado-fide").textContent = (r && r.error) || "No se pudo buscar en FIDE. Revisa tu conexión e intenta de nuevo."; return; }
    if (!r.filas.length) { $("estado-fide").textContent = "No apareces con ese nombre. Prueba solo con tu primer apellido, o con tu ID FIDE. Si no tienes, marca «No tengo ID FIDE»."; return; }
    $("estado-fide").textContent = r.filas.length === 1 ? "1 jugador encontrado. Tócalo para elegirlo."
      : r.filas.length + " jugadores encontrados" + (r.hayMas ? " (hay más: escribe más del nombre)" : "") + ". Toca el tuyo.";
    r.filas.forEach((f) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "w-full text-left rounded-xl border border-brand-200 dark:border-brand-700 hover:border-accent-500 hover:bg-accent-50 dark:hover:bg-brand-800 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
      const n = document.createElement("span"); n.className = "block font-semibold"; n.textContent = (f.titulo ? f.titulo + " " : "") + f.nombre;
      const d = document.createElement("span"); d.className = "block text-xs text-brand-600 dark:text-brand-300";
      d.textContent = [f.fed, "ID " + f.fideId, f.nacimiento ? "nacido en " + f.nacimiento : null,
        "Estándar " + (f.estandar || "sin Elo"), "Rápido " + (f.rapido || "—"), "Blitz " + (f.blitz || "—")].filter(Boolean).join(" · ");
      b.append(n, d);
      b.addEventListener("click", () => elegir(f));
      b.addEventListener("keydown", (e) => {
        const todos = [...lista.querySelectorAll("button")], i = todos.indexOf(b);
        if (e.key === "ArrowDown" && todos[i + 1]) { e.preventDefault(); todos[i + 1].focus(); }
        if (e.key === "ArrowUp") { e.preventDefault(); (todos[i - 1] || $("buscar-fide")).focus(); }
      });
      li.append(b);
      lista.append(li);
    });
  }

  function elegir(f) {
    estado.elegido = f;
    $("resultados-fide").textContent = "";
    $("estado-fide").textContent = "";
    $("buscar-fide").value = f.fideId;
    // FIDE escribe «Apellido, Nombre».
    const [ap, no] = String(f.nombre).split(",").map((x) => (x || "").trim());
    if (no) { $("nombre").value = no; $("apellidos").value = ap; } else if (!$("apellidos").value) { $("apellidos").value = ap; }
    if (f.fed === "CRC") { $("nacionalidad").value = $("nacionalidad").value || "Costa Rica"; }
    pintarElegido();
    recalcular();
    $("elegido-fide").focus();
  }

  function pintarElegido() {
    const caja = $("elegido-fide");
    caja.textContent = "";
    const f = estado.elegido;
    caja.classList.toggle("hidden", !f);
    if (!f) return;
    caja.tabIndex = -1;
    const t = document.createElement("p"); t.className = "font-bold text-brand-800 dark:text-white";
    t.textContent = "✓ Elegiste a " + (f.titulo ? f.titulo + " " : "") + f.nombre;
    const d = document.createElement("p"); d.className = "text-sm mt-1";
    d.textContent = "ID FIDE " + f.fideId + " · " + f.fed + (f.nacimiento ? " · nacido en " + f.nacimiento : "")
      + " · Elo estándar " + (f.estandar || "sin Elo") + ", rápido " + (f.rapido || "—") + ", blitz " + (f.blitz || "—");
    const c = document.createElement("button"); c.type = "button";
    c.className = "mt-2 text-sm underline font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
    c.textContent = "No soy yo: buscar otra vez";
    c.addEventListener("click", () => { estado.elegido = null; pintarElegido(); recalcular(); $("buscar-fide").value = ""; $("buscar-fide").focus(); });
    caja.append(t, d, c);
  }

  /* ===================== 2. Edad, categoría y precio ===================== */
  const eloEstandar = () => (sinFide() || !estado.elegido ? null : estado.elegido.estandar || null);
  const titulo = () => (sinFide() || !estado.elegido ? "" : estado.elegido.titulo || "");
  const torneos = () => [estado.clasico, $("blitz").checked ? "BLITZ" : null].filter(Boolean);

  ["nacimiento"].forEach((id) => $(id).addEventListener("change", recalcular));
  $("blitz").addEventListener("change", recalcular);

  function pintarClasicos(eleg) {
    const caja = $("opciones-clasico");
    caja.textContent = "";
    const opciones = ["A", "B", "U14", null];
    if (estado.clasico && (!plazo.clasicos || !eleg.si.includes(estado.clasico))) estado.clasico = null;
    opciones.forEach((k) => {
      const T = k ? R.TORNEOS[k] : null;
      const puede = !k || (plazo.clasicos && eleg.si.includes(k));
      const porque = !k ? "" : !plazo.clasicos ? "La inscripción de los clásicos cerró el 20 de diciembre." : eleg.no[k] || "";
      const l = document.createElement("label");
      l.className = "flex items-start gap-3 rounded-xl border-2 p-4 " + (puede ? "cursor-pointer border-brand-200 dark:border-brand-700 hover:border-accent-500" : "border-dashed border-brand-200 dark:border-brand-700 opacity-70");
      const r = document.createElement("input");
      r.type = "radio"; r.name = "clasico"; r.value = k || ""; r.className = "mt-1 h-5 w-5";
      r.disabled = !puede; r.checked = (estado.clasico || null) === k;
      r.addEventListener("change", () => { estado.clasico = k; recalcular(); });
      const s = document.createElement("span");
      const n = document.createElement("span"); n.className = "font-semibold";
      n.textContent = T ? T.nombre : "Ningún clásico (solo el blitz)";
      const d = document.createElement("span"); d.className = "block text-sm text-brand-600 dark:text-brand-300";
      d.textContent = T ? T.ritmo + " · " + T.quien : "Si solo vienes a jugar el blitz del 30 de diciembre.";
      s.append(n, d);
      if (!puede && porque) {
        const no = document.createElement("span"); no.className = "block text-sm font-semibold text-red-700 dark:text-red-400 mt-1";
        no.textContent = "No disponible: " + porque;
        s.append(no);
      }
      l.append(r, s);
      caja.append(l);
    });
    // Si solo hay un clásico posible, se marca solo.
    const posibles = opciones.filter((k) => k && plazo.clasicos && eleg.si.includes(k));
    if (!estado.clasico && posibles.length === 1 && !caja.dataset.tocado) {
      estado.clasico = posibles[0];
      caja.querySelector('input[value="' + posibles[0] + '"]').checked = true;
    }
  }
  $("opciones-clasico").addEventListener("change", () => { $("opciones-clasico").dataset.tocado = "1"; });

  function recalcular() {
    const nac = $("nacimiento").value;
    const anioFide = !sinFide() && estado.elegido ? estado.elegido.nacimiento : null;
    $("nacimiento-aviso").textContent = anioFide && nac && Number(nac.slice(0, 4)) !== anioFide
      ? "En FIDE apareces nacido en " + anioFide + ". Revisa la fecha." : "";
    const e = R.edad(nac, R.INICIO);
    $("caja-responsable").classList.toggle("hidden", !(e !== null && e < 18));
    const eleg = R.elegibles(eloEstandar(), nac || anioFide || null);
    pintarClasicos(eleg);
    if (!plazo.clasicos) $("blitz").checked = true;
    $("torneos-aviso").textContent = torneos().length ? "" : "Elige al menos un torneo.";

    const t = titulo();
    const gratis = R.TITULOS_GRATIS.includes(t);
    $("aviso-titulado").classList.toggle("hidden", !gratis);
    $("aviso-titulado").textContent = gratis ? "Como " + t + " no pagas inscripción y la organización te da hospedaje y alimentación (bases, 10.b). Igual dinos tus fechas." : "";
    pintarPrecio();
  }

  function pintarPrecio() {
    const p = R.precio({ torneos: torneos(), metodo: estado.metodo || "dolares", hoy, nacimiento: $("nacimiento").value, titulo: titulo() });
    const caja = $("total");
    caja.textContent = "";
    if (!torneos().length) { caja.textContent = "Elige tu torneo y aquí ves cuánto pagas."; $("con-pago").classList.remove("hidden"); return p; }
    const ul = document.createElement("ul"); ul.className = "text-sm space-y-1";
    p.lineas.forEach((l) => { const li = document.createElement("li"); li.textContent = l.texto + ": " + R.dinero(l.usd); ul.append(li); });
    const tot = document.createElement("p"); tot.className = "font-bold text-lg mt-2";
    const enColones = estado.metodo && R.METODOS[estado.metodo].moneda === "CRC";
    tot.textContent = p.gratis ? "Total: sin costo" : "Total: " + R.dinero(p.usd) + (enColones ? " = " + R.colones(p.crc) + " (a ₡" + R.TIPO_CAMBIO + " por dólar)" : "");
    caja.append(ul, tot);
    if (!p.gratis) { const av = document.createElement("p"); av.className = "text-xs text-brand-500 dark:text-brand-300 mt-1"; av.textContent = p.avisos.join(" "); caja.append(av); }
    $("con-pago").classList.toggle("hidden", p.gratis);
    pintarMetodos(p);
    return p;
  }

  function pintarMetodos(p) {
    const caja = $("metodos");
    if (!caja.childElementCount) {
      Object.entries(R.METODOS).forEach(([k, M]) => {
        const l = document.createElement("label");
        l.className = "flex items-center gap-3 rounded-xl border-2 border-brand-200 dark:border-brand-700 hover:border-accent-500 p-3 cursor-pointer";
        const r = document.createElement("input"); r.type = "radio"; r.name = "metodo"; r.value = k; r.className = "h-5 w-5";
        r.addEventListener("change", () => { estado.metodo = k; pintarPrecio(); });
        const s = document.createElement("span"); s.className = "font-semibold"; s.textContent = M.nombre;
        l.append(r, s); caja.append(l);
      });
    }
    const d = $("datos-metodo");
    d.textContent = "";
    d.classList.toggle("hidden", !estado.metodo);
    if (!estado.metodo) return;
    const M = R.METODOS[estado.metodo];
    const t = document.createElement("p"); t.className = "font-semibold mb-1";
    t.textContent = "Paga " + (M.moneda === "CRC" ? R.colones(p.crc) : R.dinero(p.usd)) + " por " + M.nombre + ":";
    const ul = document.createElement("ul"); ul.className = "space-y-0.5";
    M.datos.forEach((x) => { const li = document.createElement("li"); li.textContent = x; ul.append(li); });
    d.append(t, ul);
  }

  /* ===================== 3. Lo demás ===================== */
  document.querySelectorAll('input[name="hospedaje"]').forEach((r) => r.addEventListener("change", () => {
    $("caja-hospedaje").classList.toggle("hidden", !hospeda()); noches();
  }));
  const hospeda = () => document.querySelector('input[name="hospedaje"]:checked').value === "si";
  function noches() {
    const a = $("hosp_desde").value, b = $("hosp_hasta").value;
    if (!a || !b) { $("hosp-noches").textContent = ""; return; }
    const n = Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8))) / 86400000);
    $("hosp-noches").textContent = n > 0 ? (n === 1 ? "1 noche." : n + " noches.") : "La salida tiene que ser después de la llegada.";
  }
  ["hosp_desde", "hosp_hasta"].forEach((id) => $(id).addEventListener("change", noches));
  const comidas = () => [...document.querySelectorAll('input[name="comida"]:checked')].map((x) => x.value);
  document.querySelectorAll('input[name="comida"]').forEach((c) => c.addEventListener("change", () => $("caja-comidas").classList.toggle("hidden", !comidas().length)));
  const condicion = () => [...document.querySelectorAll('input[name="condicion"]:checked')].map((x) => x.value);
  document.querySelectorAll('input[name="condicion"]').forEach((c) => c.addEventListener("change", () =>
    $("aviso-condicion").classList.toggle("hidden", !condicion().some((x) => x === "sordo" || x === "ciego"))));
  $("quiere-factura").addEventListener("change", () => $("caja-factura").classList.toggle("hidden", !$("quiere-factura").checked));
  $("pais_residencia").addEventListener("change", () => {
    const fuera = !/^costa rica$/i.test($("pais_residencia").value.trim());
    if (fuera && $("documento_tipo").value === "cedula") $("documento_tipo").value = "pasaporte";
  });

  /* Un archivo por campo: la foto (solo imagen) y el comprobante (imagen o PDF). */
  function archivoUnico(idInput, idLista, idEstado, clave, soloImagen) {
    $(idInput).addEventListener("change", async () => {
      const a = $(idInput).files[0];
      $(idInput).value = "";
      if (!a) return;
      const ext = (/\.([a-z0-9]+)$/i.exec(a.name) || [])[1] || "";
      if (!/^image\//.test(a.type) && !(!soloImagen && /^pdf$/i.test(ext))) {
        $(idEstado).textContent = "«" + a.name + "» no sirve: " + (soloImagen ? "sube una foto (JPG o PNG)." : "sube una foto o un PDF.");
        return;
      }
      if (a.size > 10 * 1024 * 1024 && !/^image\//.test(a.type)) { $(idEstado).textContent = "«" + a.name + "» pesa más de 10 MB."; return; }
      if (estado[clave] && estado[clave].url) URL.revokeObjectURL(estado[clave].url);
      estado[clave] = { archivo: a, url: /^image\//.test(a.type) ? URL.createObjectURL(a) : null, ruta: null };
      if (clave === "foto") {
        estado.fotoImg = null;
        try { const img = new Image(); img.src = estado.foto.url; await img.decode(); estado.fotoImg = img; }
        catch (e) { $(idEstado).textContent = "No se pudo leer esa foto. Prueba con otra (JPG o PNG)."; estado.foto = null; }
      }
      pintarArchivo(idLista, idEstado, clave);
    });
  }
  function pintarArchivo(idLista, idEstado, clave) {
    const lista = $(idLista); lista.textContent = "";
    const x = estado[clave];
    $(idEstado).textContent = x ? "Elegido: " + x.archivo.name : "";
    if (!x) return;
    const li = document.createElement("li");
    if (x.url) { const img = document.createElement("img"); img.src = x.url; img.alt = "Vista previa de " + x.archivo.name; img.className = clave === "foto" ? "w-24 h-32 object-cover rounded-lg border border-brand-200 dark:border-brand-700" : "w-24 h-24 object-cover rounded-lg border border-brand-200 dark:border-brand-700"; li.append(img); }
    else { const s = document.createElement("span"); s.className = "inline-block px-3 py-2 rounded-lg border border-brand-200 dark:border-brand-700 text-xs"; s.textContent = "📄 " + x.archivo.name; li.append(s); }
    lista.append(li);
  }
  archivoUnico("foto", "foto-lista", "foto-estado", "foto", true);
  archivoUnico("comprobante", "comprobante-lista", "comprobante-estado", "comprobante", false);

  /* ===================== 4. Revisar ===================== */
  const v = (id) => $(id).value.trim();

  function armar() {
    const nac = v("nacimiento"), e = R.edad(nac, R.INICIO);
    const p = R.precio({ torneos: torneos(), metodo: estado.metodo || "dolares", hoy, nacimiento: nac, titulo: titulo() });
    const f = sinFide() ? null : estado.elegido;
    const errores = [];
    if (!sinFide() && !f) errores.push(["buscar-fide", "Busca y elige tu nombre en la lista de FIDE, o marca «No tengo ID FIDE»."]);
    if (!v("nombre") || !v("apellidos")) errores.push([!v("nombre") ? "nombre" : "apellidos", "Falta tu nombre completo."]);
    if (!nac) errores.push(["nacimiento", "Falta la fecha de nacimiento."]);
    if (!v("sexo")) errores.push(["sexo", "Falta el sexo."]);
    if (v("nacionalidad").length < 2 || v("pais_residencia").length < 2) errores.push(["nacionalidad", "Falta la nacionalidad o el país donde vives."]);
    if (v("documento").length < 4) errores.push(["documento", "Falta el número de documento."]);
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v("correo"))) errores.push(["correo", "Revisa el correo electrónico."]);
    if (v("telefono").replace(/\D/g, "").length < 7) errores.push(["telefono", "Revisa el teléfono."]);
    if (e !== null && e < 18 && (!v("resp_nombre") || !v("resp_telefono"))) errores.push(["resp_nombre", "Eres menor de edad: faltan el nombre y el teléfono de la persona responsable."]);
    if (!v("emer_nombre") || !v("emer_telefono")) errores.push(["emer_nombre", "Falta el contacto para una emergencia."]);
    if (!torneos().length) errores.push(["blitz", "Elige al menos un torneo."]);
    if (hospeda() && (!v("hosp_desde") || !v("hosp_hasta") || v("hosp_desde") >= v("hosp_hasta"))) errores.push(["hosp_desde", "Revisa las fechas del hospedaje."]);
    if (comidas().length && (!v("com_desde") || !v("com_hasta") || v("com_desde") > v("com_hasta"))) errores.push(["com_desde", "Revisa los días de la alimentación."]);
    if (!estado.foto) errores.push(["foto", "Falta la foto tamaño pasaporte."]);
    if (!p.gratis && !estado.metodo) errores.push(["metodos", "Elige cómo pagaste."]);
    if (!p.gratis && !estado.comprobante) errores.push(["comprobante", "Falta el comprobante de pago."]);
    if (!$("acepta-reglamento").checked || !$("acepta-imagen").checked || !$("acepta-datos").checked) errores.push(["acepta-reglamento", "Falta marcar las tres casillas del final."]);
    const datos = {
      sin_fide: sinFide(), fide_id: f ? f.fideId : null, federacion: f ? f.fed : null, titulo: f ? f.titulo : "",
      elo_estandar: f ? f.estandar : null, elo_rapido: f ? f.rapido : null, elo_blitz: f ? f.blitz : null,
      nombre: v("nombre"), apellidos: v("apellidos"), sexo: v("sexo"), nacimiento: nac,
      nacionalidad: v("nacionalidad"), pais_residencia: v("pais_residencia"),
      documento_tipo: v("documento_tipo"), documento: v("documento"), correo: v("correo"), telefono: v("telefono"), club: v("club"),
      torneos: torneos(),
      responsable: e !== null && e < 18 ? { nombre: v("resp_nombre"), parentesco: v("resp_parentesco"), documento: v("resp_documento"), telefono: v("resp_telefono"), correo: v("resp_correo") } : null,
      emergencia: { nombre: v("emer_nombre"), parentesco: v("emer_parentesco"), telefono: v("emer_telefono") },
      viaje: (v("llegada") || v("salida") || v("vuelo") || $("traslado").checked) ? { llegada: v("llegada"), salida: v("salida"), vuelo: v("vuelo"), traslado: $("traslado").checked } : null,
      hospedaje: hospeda(), hospedaje_desde: hospeda() ? v("hosp_desde") : null, hospedaje_hasta: hospeda() ? v("hosp_hasta") : null,
      habitacion: hospeda() ? v("habitacion") : null, acompanantes: hospeda() ? Number(v("acompanantes")) || 0 : 0,
      comidas: comidas(), comidas_desde: comidas().length ? v("com_desde") : null, comidas_hasta: comidas().length ? v("com_hasta") : null,
      dieta: v("dieta"), condicion: condicion(), accesibilidad: v("accesibilidad"),
      factura: $("quiere-factura").checked && !p.gratis ? { nombre: v("fac_nombre"), identificacion: v("fac_id"), correo: v("fac_correo") } : null,
      pago_metodo: p.gratis ? null : estado.metodo, pago_referencia: v("referencia"), pago_fecha: v("pago_fecha") || null,
      acepta_reglamento: $("acepta-reglamento").checked, acepta_imagen: $("acepta-imagen").checked, acepta_datos: $("acepta-datos").checked,
    };
    return { errores, datos, precio: p };
  }

  $("formulario").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const { errores, datos, precio } = armar();
    $("msg").textContent = "";
    if (errores.length) {
      $("msg").textContent = errores[0][1] + (errores.length > 1 ? " (y " + (errores.length - 1) + " cosa" + (errores.length > 2 ? "s" : "") + " más)" : "");
      const el = $(errores[0][0]);
      if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); (el.querySelector && el.querySelector("input") || el).focus({ preventScroll: true }); }
      return;
    }
    estado.datos = datos;
    await mostrarResumen(datos, precio);
  });

  const NOMBRE_DOC = { cedula: "Cédula", dimex: "DIMEX", pasaporte: "Pasaporte", otro: "Documento" };
  const fechaLarga = (d) => (d ? window.HoraCR.fecha(d + "T12:00:00-06:00", { day: "numeric", month: "long", year: "numeric" }) : "");

  async function mostrarResumen(d, p) {
    $("formulario").classList.add("hidden");
    $("resumen").classList.remove("hidden");
    $("validar").classList.remove("hidden");
    $("listo").classList.add("hidden");
    $("confirmo").checked = false;
    $("msg-enviar").textContent = "";
    $("resumen-titulo").textContent = (d.sexo === "f" ? "Bienvenida" : "Bienvenido") + " al Torneo Metropolitano 2026";
    $("resumen-sub").textContent = "Esta es tu información resumida. Revísala bien: así queda tu inscripción y así sale tu gafete.";
    const filas = [
      ["Nombre", d.nombre + " " + d.apellidos],
      ["ID FIDE", d.sin_fide ? "No tiene: la FCA lo tramita" : d.fide_id + (d.titulo ? " (" + d.titulo + ")" : "")],
      ["Federación", d.federacion || "—"],
      ["Elo FIDE", d.sin_fide ? "—" : "Estándar " + (d.elo_estandar || "sin Elo") + " · Rápido " + (d.elo_rapido || "—") + " · Blitz " + (d.elo_blitz || "—")],
      ["Nacimiento", fechaLarga(d.nacimiento) + " (" + R.edad(d.nacimiento, R.INICIO) + " años al 26 de diciembre)"],
      ["Nacionalidad / vive en", d.nacionalidad + " / " + d.pais_residencia],
      [NOMBRE_DOC[d.documento_tipo], d.documento],
      ["Correo y teléfono", d.correo + " · " + d.telefono],
      ["Torneos", d.torneos.map((t) => R.TORNEOS[t].nombre + " (" + R.TORNEOS[t].ritmo + ")").join(" y ")],
      ["Hospedaje", d.hospedaje ? "Del " + fechaLarga(d.hospedaje_desde) + " al " + fechaLarga(d.hospedaje_hasta) + ", habitación " + d.habitacion + (d.acompanantes ? ", con " + d.acompanantes + " acompañante" + (d.acompanantes > 1 ? "s" : "") : "") : "No requiere"],
      ["Alimentación", d.comidas.length ? d.comidas.join(", ") + " del " + fechaLarga(d.comidas_desde) + " al " + fechaLarga(d.comidas_hasta) + (d.dieta ? " · " + d.dieta : "") : "No requiere"],
      ["Emergencias", d.emergencia.nombre + (d.emergencia.parentesco ? " (" + d.emergencia.parentesco + ")" : "") + " · " + d.emergencia.telefono],
      ["Pago", p.gratis ? "Sin costo (título " + d.titulo + ")" : R.dinero(p.usd) + (R.METODOS[d.pago_metodo].moneda === "CRC" ? " = " + R.colones(p.crc) : "") + " por " + R.METODOS[d.pago_metodo].nombre],
    ];
    if (d.responsable) filas.splice(8, 0, ["Responsable", d.responsable.nombre + " · " + d.responsable.telefono]);
    if (d.viaje) filas.push(["Viaje", [d.viaje.llegada && "llega el " + fechaLarga(d.viaje.llegada), d.viaje.salida && "sale el " + fechaLarga(d.viaje.salida), d.viaje.vuelo, d.viaje.traslado && "con traslado del aeropuerto"].filter(Boolean).join(", ")]);
    if (d.condicion.length || d.accesibilidad) filas.push(["Condición", [...d.condicion.map((c) => ({ sordo: "atleta sordo", ciego: "atleta ciego o de baja visión", silla: "silla de ruedas" })[c]), d.accesibilidad].filter(Boolean).join(", ")]);
    const dl = $("resumen-datos"); dl.textContent = "";
    filas.forEach(([k, x]) => {
      const dv = document.createElement("div");
      const dt = document.createElement("dt"); dt.className = "text-xs font-semibold uppercase tracking-wide text-brand-500 dark:text-brand-300"; dt.textContent = k;
      const dd = document.createElement("dd"); dd.className = "text-brand-800 dark:text-brand-100"; dd.textContent = x;
      dv.append(dt, dd); dl.append(dv);
    });
    $("resumen").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
    await pintarGafete();
  }

  async function pintarGafete() {
    $("gafete-error").classList.add("hidden");
    try {
      await window.MetropolitanoGafete.dibujar(Object.assign({}, estado.datos, { codigo: estado.codigo }), estado.fotoImg, $("gafete-frente"), $("gafete-dorso"));
    } catch (e) {
      $("gafete-error").textContent = "No se pudo dibujar el gafete (" + (e.message || e) + "). Tu inscripción se puede mandar igual.";
      $("gafete-error").classList.remove("hidden");
    }
  }

  $("corregir").addEventListener("click", () => {
    $("resumen").classList.add("hidden");
    $("formulario").classList.remove("hidden");
    $("revisar").focus();
  });

  /* ===================== 5. Enviar ===================== */
  async function subir(x, carpeta) {
    if (x.ruta) return x.ruta;
    const listo = await window.Adjuntos.preparar(x.archivo, carpeta === "foto");
    const ext = (/\.([a-z0-9]+)$/.exec(listo.nombre) || [])[1];
    if (!["jpg", "png", "webp", "pdf"].includes(ext)) throw new Error("«" + x.archivo.name + "» no es una foto ni un PDF.");
    const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
    const ruta = carpeta + "/" + id + "/" + listo.nombre;
    const { error } = await window.sb.storage.from(BUCKET).upload(ruta, listo.blob, { contentType: listo.tipo, upsert: false });
    if (error) throw new Error("No se pudo subir «" + x.archivo.name + "». Revisa tu conexión e intenta de nuevo.");
    x.ruta = ruta;
    return ruta;
  }

  let enviando = false;
  $("enviar").addEventListener("click", async () => {
    if (enviando) return;
    const msg = $("msg-enviar");
    msg.className = "text-sm";
    if (!$("confirmo").checked) { msg.className = "text-sm text-red-700 dark:text-red-400"; msg.textContent = "Marca que revisaste tu información y está correcta."; $("confirmo").focus(); return; }
    enviando = true; $("enviar").disabled = true;
    try {
      msg.textContent = "Subiendo la foto…";
      const foto = await subir(estado.foto, "foto");
      let comprobante = null;
      if (estado.datos.pago_metodo) { msg.textContent = "Subiendo el comprobante…"; comprobante = await subir(estado.comprobante, "comprobante"); }
      msg.textContent = "Enviando la inscripción…";
      const { data, error } = await window.sb.rpc("metropolitano_inscribir", { p: Object.assign({}, estado.datos, { foto, comprobante, validado: true }) });
      if (error || !data || !data.ok) throw new Error((data && data.error) || "No se pudo enviar. Revisa tu conexión e intenta de nuevo.");
      estado.codigo = data.codigo;
      $("validar").classList.add("hidden");
      $("listo").classList.remove("hidden");
      $("listo-texto").textContent = "¡Quedaste inscrito! Tu código es " + data.codigo + ".";
      $("listo-pago").textContent = data.monto_usd > 0
        ? "La organización revisa tu comprobante de " + R.dinero(Number(data.monto_usd)) + " y te escribe a " + estado.datos.correo + ". Lleva tu gafete (impreso o en el celular) el día del torneo."
        : "Tu inscripción no tiene costo. Lleva tu gafete (impreso o en el celular) el día del torneo.";
      msg.textContent = "";
      await pintarGafete();
      $("bajar-gafete").focus();
    } catch (e) {
      msg.className = "text-sm text-red-700 dark:text-red-400";
      msg.textContent = e.message || String(e);
    } finally {
      enviando = false; $("enviar").disabled = false;
    }
  });

  $("bajar-gafete").addEventListener("click", async () => {
    const b = $("bajar-gafete"); b.disabled = true;
    try {
      const bytes = await window.MetropolitanoGafete.pdf(Object.assign({}, estado.datos, { codigo: estado.codigo }), estado.fotoImg);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      a.download = "Gafete Metropolitano 2026 - " + window.Adjuntos.nombreSeguro(estado.datos.nombre + " " + estado.datos.apellidos) + ".pdf";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (e) {
      window.Avisos.avisar("No se pudo armar el PDF del gafete: " + (e.message || e), { tipo: "error" });
    } finally { b.disabled = false; }
  });
  $("otra").addEventListener("click", () => { location.href = location.pathname; });

  recalcular();
})();
