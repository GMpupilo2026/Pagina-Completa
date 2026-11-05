/* El código de metropolitano-acreditacion.html: la acreditación en la entrada
 * del Torneo Metropolitano 2026, para quien administra.
 *
 * Se escanea el QR del gafete (el de cada jugador lleva a «Mi ronda y mi
 * mesa» con su nombre como en FIDE: js/metropolitano-gafete.js, qrDe) con la
 * cámara —BarcodeDetector, el lector del navegador; si no lo tiene, se busca a
 * mano— o se busca a cualquiera por su nombre, su código MET-…, su documento
 * o la placa del vehículo. «Llegó» lo anota la base
 * (metropolitano_acreditar), que es la que vale para todos los celulares de la
 * entrada; la lista se vuelve a leer cada 30 segundos.
 *
 * Ver «La acreditación» en docs/decisiones/cuentas-y-formularios.md.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const R = window.MetropolitanoReglas;
  const BUCKET = "metropolitano-2026";
  let filas = [];
  let elegidos = null;   // ids de lo que encontró el QR, o null (se busca con el texto)

  const codigo = (x) => "MET-" + String(x.numero).padStart(4, "0");
  const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
  const esTitulado = (x) => x.rol === "jugador" && R.TITULOS_GRATIS.includes(String(x.titulo || "").toUpperCase());

  async function cargar() {
    const todas = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await window.sb.from("metropolitano_inscripciones").select("*").eq("estado", "activa").order("numero").range(desde, desde + 999);
      if (error) { $("estado").textContent = "No se pudieron leer las inscripciones: " + error.message; return; }
      todas.push(...data);
      if (data.length < 1000) break;
    }
    filas = todas;
    pintar();
  }

  function cifras() {
    const caja = $("cifras"); caja.textContent = "";
    const n = (f) => filas.filter(f).length;
    [["Llegaron", n((x) => x.acreditado_en) + " de " + filas.length],
      ["Jugadores", n((x) => x.rol === "jugador" && x.acreditado_en) + " de " + n((x) => x.rol === "jugador")],
      ["Árbitros", n((x) => x.rol === "arbitro" && x.acreditado_en) + " de " + n((x) => x.rol === "arbitro")],
      ["Con parqueo", n((x) => x.parqueo && x.acreditado_en) + " de " + n((x) => x.parqueo)]].forEach(([k, v]) => {
      const d = document.createElement("div"); d.className = "bg-white dark:bg-brand-900 rounded-xl shadow p-3";
      const a = document.createElement("p"); a.className = "text-xs text-brand-500 dark:text-brand-300"; a.textContent = k;
      const b = document.createElement("p"); b.className = "text-xl font-bold text-brand-800 dark:text-white"; b.textContent = v;
      d.append(a, b); caja.append(d);
    });
  }

  // Lo que se busca: el nombre (sin tildes), el código, el documento o la placa.
  function encontrados() {
    if (elegidos) return filas.filter((x) => elegidos.includes(x.id));
    const q = plano($("buscar").value);
    if (q.length < 2) return [];
    const placa = $("buscar").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const num = /^(met)?\s*0*(\d{1,6})$/i.exec($("buscar").value.trim().replace(/-/g, ""));
    return filas.filter((x) => (num && x.numero === Number(num[2]))
      || (placa.length >= 3 && x.placa && x.placa.includes(placa))
      || plano([x.nombre, x.apellidos, x.nombre_fide, x.documento, x.delegacion].join(" ")).includes(q)).slice(0, 20);
  }

  function linea(texto, clase) { const p = document.createElement("p"); p.className = "text-sm " + (clase || ""); p.textContent = texto; return p; }

  function tarjeta(x) {
    const li = document.createElement("li");
    li.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 flex gap-4" + (x.acreditado_en ? " ring-2 ring-green-600" : "");
    const foto = document.createElement("img"); foto.alt = "Foto de " + x.nombre + " " + x.apellidos;
    foto.className = "w-20 h-28 object-cover rounded-lg border border-brand-200 dark:border-brand-700 bg-brand-50 shrink-0";
    window.sb.storage.from(BUCKET).download(x.foto).then(({ data }) => { if (data) foto.src = URL.createObjectURL(data); }).catch(() => { /* sin foto */ });
    const cuerpo = document.createElement("div"); cuerpo.className = "grow space-y-1 min-w-0";
    const queEs = x.es_delegado ? "Delegado" + (x.rol === "delegado" ? "" : " y " + R.rolDe(x.rol, x.sexo).toLowerCase()) : R.rolDe(x.rol, x.sexo);
    const t = document.createElement("p"); t.className = "font-bold text-lg text-brand-800 dark:text-white"; t.textContent = codigo(x) + " · " + (x.titulo ? x.titulo + " " : "") + x.nombre + " " + x.apellidos;
    cuerpo.append(t, linea(queEs + (x.torneos.length ? " · " + x.torneos.map((k) => R.TORNEOS[k].nombre).join(" + ") : "") + (x.delegacion ? " · " + x.delegacion : "")));
    // El pago: si no está verificado, se dice en grande (la organización decide en la entrada).
    const pago = { por_revisar: "⚠ El pago está por revisar", rechazado: "⚠ El pago fue rechazado", verificado: "Pago verificado", no_aplica: "Sin costo" }[x.pago_estado];
    cuerpo.append(linea(pago, /⚠/.test(pago) ? "font-bold text-red-800 dark:text-red-300" : "text-green-800 dark:text-green-300"));
    if (esTitulado(x)) cuerpo.append(linea("Invitado titulado: hospedaje y alimentación de la organización" + (x.viaje && x.viaje.llegada ? ", del " + x.viaje.llegada + " al " + x.viaje.salida : "")));
    else if (x.hospedaje) cuerpo.append(linea("Hospedaje del " + x.hospedaje_desde + " al " + x.hospedaje_hasta + (x.acompanantes ? ", con " + x.acompanantes + (x.acompanantes === 1 ? " acompañante" : " acompañantes") : "") + (x.acepta_hospedaje ? " · aceptó las condiciones (puerta a las 10:30 p.m.)" : "")));
    if (x.parqueo) cuerpo.append(linea("🚗 Parqueo para la placa " + x.placa, "font-semibold"));
    if (R.edad(x.nacimiento, R.INICIO) < 18 && x.responsable) cuerpo.append(linea("Menor de edad · responsable: " + [x.responsable.nombre, x.responsable.telefono].filter(Boolean).join(" · ")));
    if (x.condicion.length || x.accesibilidad) cuerpo.append(linea("Accesibilidad: " + [...x.condicion.map((c) => ({ sordo: "atleta sordo", ciego: "ciego o baja visión", silla: "silla de ruedas" })[c] || c), x.accesibilidad].filter(Boolean).join(", ")));
    const est = linea(x.acreditado_en ? "✓ Llegó: " + window.HoraCR.fechaHora(x.acreditado_en) : "Todavía no llega", x.acreditado_en ? "font-bold text-green-800 dark:text-green-300" : "text-brand-500 dark:text-brand-300");
    const b = document.createElement("button"); b.type = "button";
    b.className = x.acreditado_en ? "metro-boton text-sm border border-brand-300 dark:border-brand-600 font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      : "bg-green-700 hover:bg-green-800 text-white font-bold px-5 py-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    b.textContent = x.acreditado_en ? "Deshacer: no llegó" : "✓ Llegó";
    b.setAttribute("aria-label", (x.acreditado_en ? "Deshacer la llegada de " : "Marcar que llegó ") + x.nombre + " " + x.apellidos);
    b.addEventListener("click", () => acreditar(x, !x.acreditado_en, b));
    cuerpo.append(est, b);
    li.append(foto, cuerpo);
    return li;
  }

  async function acreditar(x, llego, boton) {
    boton.disabled = true;
    const { data, error } = await window.sb.rpc("metropolitano_acreditar", { p_id: x.id, p_llego: llego });
    boton.disabled = false;
    if (error) { window.Avisos.avisar("No se pudo anotar: " + error.message, { tipo: "error" }); return; }
    Object.assign(x, data);
    $("estado").textContent = (llego ? "✓ Anotado: llegó " : "Se deshizo la llegada de ") + x.nombre + " " + x.apellidos + ".";
    pintar();
  }

  function pintar() {
    cifras();
    const l = encontrados();
    const ul = $("resultados"); ul.textContent = "";
    l.forEach((x) => ul.append(tarjeta(x)));
    if (elegidos && !l.length) $("estado").textContent = "Ese QR no es de ninguna inscripción activa.";
    else if (!elegidos && $("buscar").value.trim().length >= 2 && !l.length) $("estado").textContent = "No aparece nadie con eso.";
    // Quién falta, por torneo y por rol.
    const caja = $("faltan"); caja.textContent = "";
    const grupos = [...Object.keys(R.TORNEOS).map((t) => [R.TORNEOS[t].nombre, (x) => x.torneos.includes(t)]),
      ["Árbitros", (x) => x.rol === "arbitro"], ["Entrenadores", (x) => x.rol === "entrenador"], ["Delegados y acompañantes", (x) => x.rol === "delegado" || x.rol === "acompanante"]];
    grupos.forEach(([nombre, f]) => {
      const todos = filas.filter(f), faltan = todos.filter((x) => !x.acreditado_en);
      if (!todos.length) return;
      const d = document.createElement("details"); d.className = "bg-white dark:bg-brand-900 rounded-xl shadow p-3";
      const s = document.createElement("summary"); s.className = "font-semibold cursor-pointer";
      s.textContent = nombre + ": " + (faltan.length ? (faltan.length === 1 ? "falta 1" : "faltan " + faltan.length) + " de " + todos.length : "llegaron todos (" + todos.length + ")");
      d.append(s);
      const ol = document.createElement("ul"); ol.className = "mt-2 text-sm space-y-0.5";
      faltan.sort((a, b) => String(a.apellidos).localeCompare(String(b.apellidos), "es")).forEach((x) => {
        const li = document.createElement("li"); li.textContent = codigo(x) + " · " + x.apellidos + ", " + x.nombre + (x.delegacion ? " (" + x.delegacion + ")" : ""); ol.append(li);
      });
      d.append(ol); caja.append(d);
    });
  }

  $("buscar").addEventListener("input", () => { elegidos = null; $("estado").textContent = ""; pintar(); });

  /* ---------- el QR del gafete ---------- */
  // El de un jugador: …/metropolitano-2026#mi-ronda=Apellidos, Nombre (como en FIDE, sin tildes).
  function deQr(texto) {
    const m = /#mi-ronda=([^&]+)/.exec(String(texto || ""));
    if (!m) return null;
    let n = "";
    try { n = plano(decodeURIComponent(m[1])); } catch (e) { return null; }
    const ids = filas.filter((x) => x.rol === "jugador" && (plano(x.nombre_fide) === n || plano(x.apellidos + ", " + x.nombre) === n)).map((x) => x.id);
    return ids;
  }
  let flujo = null, leyendo = false;
  async function apagarCamara() {
    leyendo = false;
    if (flujo) flujo.getTracks().forEach((t) => t.stop());
    flujo = null;
    $("camara").classList.add("hidden"); $("escanear").setAttribute("aria-expanded", "false");
    $("escanear").lastChild.textContent = " Escanear el QR del gafete";
  }
  $("escanear").addEventListener("click", async () => {
    if (flujo) { apagarCamara(); return; }
    if (!("BarcodeDetector" in window)) {
      window.Avisos.avisar("Este navegador no lee códigos QR. Busca a la persona por su nombre o por el código MET-… del gafete.");
      $("buscar").focus(); return;
    }
    let lector;
    try { lector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { window.Avisos.avisar("Este navegador no lee códigos QR: busca por el nombre o el código."); return; }
    try { flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
    catch (e) { window.Avisos.avisar("No se pudo abrir la cámara: revisa el permiso del navegador, o busca por el nombre o el código.", { tipo: "error" }); return; }
    $("camara").classList.remove("hidden"); $("escanear").setAttribute("aria-expanded", "true");
    $("escanear").lastChild.textContent = " Apagar la cámara";
    const v = $("video"); v.srcObject = flujo; await v.play().catch(() => {});
    $("camara-estado").textContent = "Apunta al QR del dorso del gafete.";
    leyendo = true;
    const paso = async () => {
      if (!leyendo) return;
      try {
        const res = await lector.detect(v);
        if (res.length) {
          const ids = deQr(res[0].rawValue);
          if (ids && ids.length) {
            elegidos = ids; $("buscar").value = "";
            $("estado").textContent = ids.length === 1 ? "Encontrado con el QR." : "El QR coincide con " + ids.length + " personas: elige la correcta.";
            apagarCamara(); pintar();
            const b = $("resultados").querySelector("button"); if (b) b.focus();
            return;
          }
          $("camara-estado").textContent = ids ? "Ese QR no es de ningún jugador inscrito: busca por el nombre." : "Ese no es el QR de un jugador: a los demás se les busca por el nombre o el código.";
        }
      } catch (e) { /* un cuadro que no se pudo leer */ }
      setTimeout(paso, 300);
    };
    paso();
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
    setInterval(() => { if (!document.hidden) cargar(); }, 30000);
    $("buscar").focus();
  }
  iniciar();
})();

/*! rev bfb5bbb0d2d82f9f */
