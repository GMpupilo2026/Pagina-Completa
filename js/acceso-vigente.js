/**
 * Ajedrez Integral — el acceso del alumno, en cada página de la Academia.
 *
 * Pregunta UNA cosa a la base, `mi_acceso()`, y hace lo que diga:
 *
 *  - Vigente: nada. Salvo en el panel (clases.html), donde si al paquete le
 *    quedan 7 días o menos se avisa. Un acceso que se corta sin aviso es un
 *    alumno que se entera el día que no puede entrar.
 *  - No vigente: en el panel, una franja que dice por qué y a quién escribir
 *    (el panel se queda: es por donde se entra y se sale). En cualquier otra
 *    página, el contenido se tapa y se dice lo mismo.
 *
 * La prueba gratis de 3 días (prueba-gratis.html) usa la misma pregunta:
 * `mi_acceso()` dice «prueba» mientras corre —el panel avisa cuánto le queda—
 * y «prueba_vencida» al terminar, y entonces se tapa igual que un acceso
 * vencido, con la salida a los precios. Esa se cierra aunque el interruptor
 * esté apagado.
 *
 * La cuenta temporal (un taller con fecha de cierre, como el del MEP) también:
 * «temporal» mientras vale —el panel avisa solo la última semana— y
 * «temporal_vencida» al cerrarse, con su propio aviso y sin la salida a los
 * precios: nadie la compró, se la dieron por un tiempo.
 *
 * Quién tiene acceso lo decide la base (paquetes_acceso + paquete_alumnos +
 * acceso_config), no esta página: acá solo se pinta. Y mientras quien
 * administra no encienda «exigir el acceso», `mi_acceso()` contesta vigente
 * para todo el mundo — así el día que se aplicó esto no se le cerró la
 * Academia a nadie.
 *
 * Esto es solo la CARA del candado: el candado de verdad está en la base
 * (`acceso_vigente()` en políticas restrictivas y en tres triggers, migración
 * acceso_exigido_en_la_base), así que saltarse esta pantalla desde la consola
 * no sirve para escribir progreso, entrar a la clase ni rendir un examen. Lo
 * que la base no alcanza son los archivos estáticos (ver CLAUDE.md).
 *
 * Si la consulta FALLA, no se tapa nada, a propósito: una función que falta o
 * una red caída no pueden dejar fuera a todos los alumnos que sí pagaron.
 *
 * Un «sí» se recuerda FRESCO_MS en sessionStorage (de esta pestaña y esta
 * cuenta): la pregunta iba en cada página de la Academia, unas 500 veces por
 * hora en la hora pico del 29/9, cuando la base se saturó, para contestar
 * casi siempre lo mismo. Un «no» no se recuerda nunca: quien acaba de pagar
 * entra en la página siguiente, no a los cinco minutos. Lo peor que puede
 * pasar es que alguien a quien se le venció siga viendo las páginas cinco
 * minutos más — sin poder guardar nada, porque el candado está en la base.
 * Ver «Lo que cada página pedía de nuevo» en
 * docs/decisiones/sitio-e-infraestructura.md.
 *
 * Se autoarranca. La pone herramientas/academia-cabecera.py en las páginas de
 * la Academia, igual que la burbuja y el aviso de partida.
 */
(function () {
  "use strict";

  const DIAS_AVISO = 7;
  const FRESCO_MS = 5 * 60 * 1000;
  const CLAVE = "acceso_vigente_v1";

  function recordado(uid) {
    try {
      const g = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
      const edad = g ? Date.now() - g.t : Infinity;
      return g && g.uid === uid && edad >= 0 && edad < FRESCO_MS && g.a && g.a.vigente === true ? g.a : null;
    } catch (e) { return null; }
  }
  function recordar(uid, a) {
    try { sessionStorage.setItem(CLAVE, JSON.stringify({ uid: uid, a: a, t: Date.now() })); } catch (e) { }
  }

  function enPanel() {
    return /(^|\/)clases(\.html)?$/.test(location.pathname);
  }

  function panelHref() {
    const a = document.querySelector('#header a[href$="clases.html"]');
    return a ? a.getAttribute("href") : "clases.html";
  }

  function fecha(iso) {
    if (!iso) return "";
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });   // un día de calendario
  }

  function fechaHora(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  }

  function dia(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "long", year: "numeric" });
  }

  function cuantoQueda(horas) {
    if (horas <= 1) return "menos de una hora";
    if (horas < 24) return horas + " horas";
    const dias = Math.round(horas / 24);
    return dias === 1 ? "1 día" : dias + " días";
  }

  function precios() {
    const a = document.querySelector('#header a[href$="clases.html"]');
    const base = a ? a.getAttribute("href").replace(/clases\.html$/, "") : "";
    return base + "precios.html";
  }

  function waDe(numero) {
    const digitos = String(numero || "").replace(/\D/g, "");
    if (digitos.length < 8) return null;
    return "https://wa.me/" + (digitos.length === 8 ? "506" + digitos : digitos);
  }

  // «prueba gratis» o, la que se abrió sola en el festival, «cuenta gratis del Centroamericano».
  function nombrePrueba(a) {
    return a && a.origen === "centroamericano-2026" ? "cuenta gratis del Centroamericano" : "prueba gratis";
  }

  function porQue(a) {
    if (a.motivo === "prueba_vencida") {
      // La de 5 días del Centroamericano dice cuál fue (mi_acceso trae
      // `origen` y `dias_total`); las de antes de eso no los traen: 3 días.
      return "Tu " + nombrePrueba(a) + " de " + (a.dias_total || 3) + " días terminó el " + fechaHora(a.vence) + ".";
    }
    if (a.motivo === "temporal_vencida") {
      return "Tu cuenta temporal" + (a.detalle ? " (" + a.detalle + ")" : "") + " se cerró el " + dia(a.vence) + ".";
    }
    if (a.motivo === "vencido") {
      return "Tu acceso a la Academia venció el " + fecha(a.hasta) + ".";
    }
    return "Tu cuenta todavía no tiene un acceso activo a la Academia.";
  }

  function enlace(href, texto, fuera) {
    const a = document.createElement("a");
    a.href = href;
    if (fuera) { a.target = "_blank"; a.rel = "noopener"; }
    a.className = "font-semibold underline text-accent-700 dark:text-accent-400";
    a.textContent = texto;
    return a;
  }

  /** modo: "prueba" (la salida es comprar), "temporal" (pedir que la alarguen)
   *  o cualquier otra cosa (renovar el acceso). */
  function contacto(wa, modo) {
    const p = document.createElement("p");
    p.className = "text-sm mt-3";
    if (modo === "temporal") {
      if (wa) {
        p.append("Si necesitas seguir usándola, ", enlace(wa + "?text=" + encodeURIComponent("Hola, mi cuenta temporal de la Academia se cerró y necesito seguir usándola."), "escríbenos por WhatsApp", true), ".");
      } else {
        p.append("Si necesitas seguir usándola, habla con la Academia.");
      }
      p.append(" Tu progreso no se pierde: queda guardado en tu cuenta.");
      return p;
    }
    if (modo === "prueba") {
      p.append("Para seguir con esta misma cuenta, ", enlace(precios(), "elige tu plan"));
      if (wa) {
        p.append(" o ", enlace(wa + "?text=" + encodeURIComponent("Hola Oscar, hice la prueba gratis de la Academia y quiero mi cuenta."), "escríbenos por WhatsApp", true));
      }
      p.append(". Tu progreso no se pierde: queda guardado en tu cuenta.");
      return p;
    }
    if (wa) {
      p.append("Para renovarlo, ");
      const a = document.createElement("a");
      a.href = wa + "?text=" + encodeURIComponent("Hola, quiero renovar el acceso a la Academia.");
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "font-semibold underline text-accent-700 dark:text-accent-400";
      a.textContent = "escríbenos por WhatsApp";
      p.append(a, ". Tu progreso no se pierde: queda guardado en tu cuenta.");
    } else {
      p.textContent = "Para renovarlo, habla con tu profe o con la Academia. Tu progreso no se pierde: queda guardado en tu cuenta.";
    }
    return p;
  }

  function franja(texto, wa, urgente, modo) {
    const main = document.getElementById("main-content") || document.querySelector("main");
    if (!main) return;
    const div = document.createElement("div");
    div.id = "acceso-franja";
    div.setAttribute("role", "status");
    div.className = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6";
    const caja = document.createElement("div");
    caja.className = urgente
      ? "rounded-2xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-brand-900 p-4 text-brand-800 dark:text-brand-100"
      : "rounded-2xl border-2 border-accent-500 bg-accent-50 dark:bg-brand-900 p-4 text-brand-800 dark:text-brand-100";
    const p = document.createElement("p");
    p.className = "font-semibold";
    p.textContent = texto;
    caja.append(p, contacto(wa, modo));
    div.append(caja);
    main.prepend(div);
  }

  function modoDe(a) {
    return a.motivo === "prueba_vencida" ? "prueba" : a.motivo === "temporal_vencida" ? "temporal" : "";
  }

  function tapar(a, wa) {
    const main = document.getElementById("main-content") || document.querySelector("main");
    if (!main) return;
    main.style.display = "none";
    main.setAttribute("inert", "");
    main.setAttribute("aria-hidden", "true");

    const aviso = document.createElement("main");
    aviso.id = "acceso-aviso";
    aviso.className = "max-w-2xl mx-auto my-16 px-4";
    const caja = document.createElement("div");
    caja.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-8 text-center text-brand-600 dark:text-brand-200";
    const icono = document.createElement("p");
    icono.className = "text-4xl mb-3";
    icono.setAttribute("aria-hidden", "true");
    icono.textContent = "🔒";
    const h1 = document.createElement("h1");
    h1.className = "font-serif text-2xl font-bold text-brand-800 dark:text-white mb-2";
    h1.tabIndex = -1;
    h1.textContent = a.motivo === "prueba_vencida" ? "Tu " + nombrePrueba(a) + " terminó"
      : a.motivo === "temporal_vencida" ? "Tu cuenta temporal se cerró"
      : "Tu acceso no está activo";
    const p = document.createElement("p");
    p.textContent = porQue(a);
    const volver = document.createElement("a");
    volver.href = panelHref();
    volver.className = "inline-block mt-5 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors";
    volver.textContent = "← Volver al panel";
    caja.append(icono, h1, p, contacto(wa, modoDe(a)), volver);
    aviso.append(caja);
    main.after(aviso);

    const saltar = document.querySelector('a[href="#main-content"], a[href="#app"]');
    if (saltar) saltar.setAttribute("href", "#acceso-aviso");
    h1.focus();
  }

  /* ---------------------------------------------------------- cobros
     El alumno con una cuenta de cobro (mensualidades.html): `mi_acceso()`
     contesta «cobro» con el estado de la cuenta, el monto y el SINPE. Si está
     apagada, el aviso dice cuánto pagar y a dónde, y deja subir la foto del
     comprobante (bucket comprobantes-pago + pago_reportar()): quien coordina
     lo confirma y la cuenta se enciende sola. Ver «Cobros, versión 2» en
     docs/decisiones/cobros-acceso-y-tienda.md. */
  // «₡24.000»: el punto de miles a mano, como js/precios-acceso.js.
  function dinero(n, moneda) {
    const v = String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, moneda === "USD" ? "," : ".");
    return moneda === "USD" ? "US$" + v : "₡" + v;
  }
  function hoyCR() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }); }

  function datosDePago(a) {
    const caja = document.createElement("dl");
    caja.className = "mt-4 text-left rounded-xl bg-brand-50 dark:bg-brand-950 px-4 py-3 text-base grid grid-cols-[auto_1fr] gap-x-3 gap-y-1";
    function fila(dt, dd) {
      const t = document.createElement("dt"); t.className = "text-brand-600 dark:text-brand-300"; t.textContent = dt;
      const d = document.createElement("dd"); d.className = "font-bold text-brand-800 dark:text-white"; d.textContent = dd;
      caja.append(t, d);
    }
    fila("Monto", dinero(a.monto, a.moneda));
    if (a.sinpe_numero) fila("SINPE Móvil", String(a.sinpe_numero).replace(/(\d{4})(\d{4})/, "$1-$2"));
    if (a.sinpe_nombre) fila("A nombre de", a.sinpe_nombre);
    return caja;
  }

  function formularioComprobante(sb, a, alListo) {
    const form = document.createElement("form");
    form.className = "mt-4 text-left space-y-3";
    form.noValidate = true;
    const campo = (etq, input, ayuda) => {
      const d = document.createElement("div");
      const l = document.createElement("label");
      l.className = "block text-sm font-semibold mb-1";
      l.textContent = etq;
      input.id = "pago-" + Math.random().toString(36).slice(2, 8);
      l.htmlFor = input.id;
      input.className = "w-full px-3 py-3 rounded-lg bg-white dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500";
      d.append(l, input);
      if (ayuda) { const p = document.createElement("p"); p.className = "text-xs text-brand-500 dark:text-brand-300 mt-1"; p.textContent = ayuda; d.append(p); }
      return d;
    };
    const foto = document.createElement("input"); foto.type = "file"; foto.accept = "image/*,application/pdf";
    const monto = document.createElement("input"); monto.inputMode = "numeric"; monto.value = String(Math.round(Number(a.monto) || 0));
    const fecha = document.createElement("input"); fecha.type = "date"; fecha.value = hoyCR(); fecha.max = hoyCR();
    const refe = document.createElement("input"); refe.maxLength = 120; refe.autocomplete = "off";
    const error = document.createElement("p"); error.className = "text-sm text-red-700 dark:text-red-300"; error.setAttribute("role", "alert");
    const enviar = document.createElement("button");
    enviar.type = "submit";
    enviar.className = "w-full min-h-[48px] rounded-xl bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:opacity-60";
    enviar.textContent = "Mandar comprobante";
    form.append(campo("Foto del comprobante", foto, "La captura del SINPE o de la transferencia."),
      campo("Cuánto pagaste", monto), campo("Fecha del pago", fecha),
      campo("Número de comprobante (opcional)", refe), error, enviar);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      error.textContent = "";
      const m = Number(String(monto.value).replace(/[^\d]/g, ""));
      const archivo = foto.files && foto.files[0];
      if (!archivo && !refe.value.trim()) { error.textContent = "Sube la foto del comprobante o escribe su número."; foto.focus(); return; }
      if (archivo && archivo.size > 5 * 1024 * 1024) { error.textContent = "La foto pesa más de 5 MB. Manda una captura más liviana."; foto.focus(); return; }
      if (!(m > 0)) { error.textContent = "Escribe cuánto pagaste."; monto.focus(); return; }
      if (!fecha.value || fecha.value > hoyCR()) { error.textContent = "La fecha del pago no puede ser en el futuro."; fecha.focus(); return; }
      enviar.disabled = true;
      enviar.textContent = "Mandando…";
      try {
        let ruta = null;
        if (archivo) {
          const { data: ses } = await sb.auth.getSession();
          const uid = ses && ses.session && ses.session.user.id;
          const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
          ruta = uid + "/" + Date.now() + "." + ext;
          const up = await sb.storage.from("comprobantes-pago").upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });
          if (up.error) throw up.error;
        }
        const r = await sb.rpc("pago_reportar", { p_monto: m, p_fecha: fecha.value, p_referencia: refe.value.trim() || null, p_comprobante: ruta, p_nota: null });
        if (r.error) throw r.error;
        alListo();
      } catch (e) {
        error.textContent = (e && e.message) || "No se pudo mandar. Intenta otra vez.";
        enviar.disabled = false;
        enviar.textContent = "Mandar comprobante";
      }
    });
    return form;
  }

  // Lo que se ve debajo de los datos: el formulario, o «ya lo mandaste».
  async function parteComprobante(sb, a, caja) {
    const esperando = () => {
      caja.replaceChildren();
      const p = document.createElement("p");
      p.className = "mt-4 rounded-xl bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-50 px-4 py-3 text-sm font-semibold";
      p.setAttribute("role", "status");
      p.textContent = "Recibimos tu comprobante. En cuanto se confirme el pago, tu usuario se activa solo.";
      caja.append(p);
    };
    if (a.reporte_pendiente) { esperando(); return; }
    caja.replaceChildren();
    try {
      const { data } = await sb.rpc("mi_reporte_de_pago");
      if (data && data.estado === "rechazado") {
        const p = document.createElement("p");
        p.className = "mt-4 rounded-xl bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-50 px-4 py-3 text-sm";
        p.textContent = "Tu último comprobante no se pudo confirmar" + (data.motivo ? ": " + data.motivo : ".");
        caja.append(p);
      }
    } catch (e) { /* sin el último reporte, igual se puede mandar uno */ }
    const abrir = document.createElement("button");
    abrir.type = "button";
    abrir.className = "mt-4 w-full min-h-[48px] rounded-xl bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2";
    abrir.textContent = "Ya pagué: subir comprobante";
    abrir.setAttribute("aria-expanded", "false");
    abrir.addEventListener("click", () => {
      const form = formularioComprobante(sb, a, esperando);
      abrir.setAttribute("aria-expanded", "true");
      abrir.replaceWith(form);
      const primero = form.querySelector("input");
      if (primero) primero.focus();
    });
    caja.append(abrir);
  }

  function enlaceWa(wa) {
    if (!wa) return null;
    const p = document.createElement("p");
    p.className = "text-sm mt-3";
    p.append("¿Dudas? ", enlace(wa + "?text=" + encodeURIComponent("Hola, quiero activar mi usuario de la Academia."), "Escríbenos por WhatsApp", true), ".");
    return p;
  }

  /* La tarjeta del usuario apagado. En el panel va arriba (el panel se queda:
     es la puerta de salida); en cualquier otra página tapa el contenido. */
  function tarjetaApagado(sb, a, wa, enElPanel) {
    const caja = document.createElement("div");
    caja.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-6 sm:p-8 text-center text-brand-700 dark:text-brand-100 max-w-xl mx-auto";
    const icono = document.createElement("p");
    icono.className = "text-4xl mb-3";
    icono.setAttribute("aria-hidden", "true");
    icono.textContent = "🔒";
    const h = document.createElement(enElPanel ? "h2" : "h1");
    h.className = "font-serif text-2xl font-bold text-brand-800 dark:text-white mb-2";
    h.tabIndex = -1;
    h.textContent = "Tu usuario está inactivo";
    const p = document.createElement("p");
    p.textContent = "Para activarlo, paga la mensualidad. Tu progreso no se pierde: queda guardado en tu cuenta.";
    const comprobante = document.createElement("div");
    caja.append(icono, h, p, datosDePago(a), comprobante);
    const w = enlaceWa(wa);
    if (w) caja.append(w);
    parteComprobante(sb, a, comprobante);
    return { caja, h };
  }

  function avisoCobroVigente(sb, a, wa) {
    // Al día: nada. Vence pronto o vencida (sin apagar todavía): la franja del panel.
    if (a.estado === "vence_pronto") {
      const cuando = a.dias === 0 ? "hoy" : a.dias === 1 ? "mañana" : "en " + a.dias + " días (el " + fecha(a.hasta) + ")";
      franjaCobro(sb, a, wa, "Tu mensualidad vence " + cuando + ".", false);
    } else if (a.estado === "vencido") {
      franjaCobro(sb, a, wa, "Tu mensualidad venció el " + fecha(a.hasta) + "."
        + (a.apaga_el ? " Si no se paga, tu usuario se apaga el " + fecha(a.apaga_el) + "." : ""), true);
    }
  }

  function franjaCobro(sb, a, wa, texto, urgente) {
    const main = document.getElementById("main-content") || document.querySelector("main");
    if (!main) return;
    const div = document.createElement("div");
    div.id = "acceso-franja";
    div.setAttribute("role", "status");
    div.className = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6";
    const caja = document.createElement("div");
    caja.className = urgente
      ? "rounded-2xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-brand-900 p-4 text-brand-800 dark:text-brand-100"
      : "rounded-2xl border-2 border-accent-500 bg-accent-50 dark:bg-brand-900 p-4 text-brand-800 dark:text-brand-100";
    const p = document.createElement("p");
    p.className = "font-semibold";
    p.textContent = texto;
    const det = document.createElement("details");
    det.className = "mt-2";
    const sum = document.createElement("summary");
    sum.className = "cursor-pointer text-sm font-semibold underline underline-offset-2";
    sum.textContent = "Cómo pagar";
    const dentro = document.createElement("div");
    det.append(sum, datosDePago(a), dentro);
    caja.append(p, det);
    const w = enlaceWa(wa);
    if (w) caja.append(w);
    parteComprobante(sb, a, dentro);
    div.append(caja);
    main.prepend(div);
  }

  function apagadoEnPanel(sb, a, wa) {
    const main = document.getElementById("main-content") || document.querySelector("main");
    if (!main) return;
    const div = document.createElement("div");
    div.id = "acceso-franja";
    div.className = "px-4 pt-6";
    const { caja } = tarjetaApagado(sb, a, wa, true);
    div.append(caja);
    main.prepend(div);
  }

  function taparPorCobro(sb, a, wa) {
    const main = document.getElementById("main-content") || document.querySelector("main");
    if (!main) return;
    main.style.display = "none";
    main.setAttribute("inert", "");
    main.setAttribute("aria-hidden", "true");
    const aviso = document.createElement("main");
    aviso.id = "acceso-aviso";
    aviso.className = "my-10 px-4";
    const { caja, h } = tarjetaApagado(sb, a, wa, false);
    const volver = document.createElement("a");
    volver.href = panelHref();
    volver.className = "inline-block mt-5 text-sm font-semibold underline underline-offset-2 text-accent-700 dark:text-accent-400";
    volver.textContent = "← Volver al panel";
    caja.append(volver);
    aviso.append(caja);
    main.after(aviso);
    const saltar = document.querySelector('a[href="#main-content"], a[href="#app"]');
    if (saltar) saltar.setAttribute("href", "#acceso-aviso");
    h.focus();
  }

  async function whatsapp(sb) {
    try {
      const { data } = await sb.from("ajustes_academia").select("valor").eq("clave", "whatsapp_consultas").maybeSingle();
      return waDe(data && data.valor);
    } catch (e) { return null; }
  }

  /* Las páginas que una cuenta de árbitro sí abre: su panel y las de las
     herramientas, que salen de la lista de la vitrina
     (js/herramientas-arbitraje.js, una sola copia). La lista se baja solo
     para estas cuentas, que son pocas: las demás no pagan nada por esto. Si
     no se puede leer, se va al panel: ahí están sus herramientas. */
  function cargarLista(base) {
    if (window.HerramientasArbitraje) return Promise.resolve(window.HerramientasArbitraje);
    return new Promise((ok) => {
      const s = document.createElement("script");
      s.src = base + "js/herramientas-arbitraje.js";
      s.onload = () => ok(window.HerramientasArbitraje || null);
      s.onerror = () => ok(null);
      document.head.appendChild(s);
    });
  }

  function paginaActual() {
    return (location.pathname.split("/").pop() || "index.html").replace(/(\.html)?$/, ".html");
  }

  async function alPanelDelArbitro() {
    const base = panelHref().replace(/clases\.html$/, "");
    // Su «Academia» del encabezado y de las migas es su panel.
    document.querySelectorAll('a[href$="clases.html"]').forEach((a) => {
      a.setAttribute("href", a.getAttribute("href").replace(/clases\.html$/, "arbitro.html"));
    });
    const aqui = paginaActual();
    // En las migas, su punto de partida se llama como su panel.
    const migaPanel = document.querySelector('#migas li:first-child a[href$="arbitro.html"]');
    if (migaPanel) {
      if (aqui === "arbitro.html") {
        // En su panel, la miga sería el mismo panel dos veces: queda solo la actual.
        migaPanel.closest("li").remove();
        const sep = document.querySelector("#migas li:first-child > span[aria-hidden]");
        if (sep) sep.remove();
      } else {
        migaPanel.textContent = "Mis herramientas";
      }
    }
    if (aqui === "arbitro.html") return;
    const H = await cargarLista(base);
    const deHerramientas = new Set(((H && H.LISTA) || [])
      .map((h) => String(h.href || "").split(/[?#]/)[0].split("/").pop())
      .filter(Boolean));
    if (deHerramientas.has(aqui)) return;
    location.replace(base + "arbitro.html");
  }

  async function arrancar() {
    const sb = window.sb;
    if (!sb || !sb.auth || typeof sb.rpc !== "function") return;
    const { data: ses } = await sb.auth.getSession();
    if (!ses || !ses.session) return;

    const uid = ses.session.user && ses.session.user.id;
    let a = recordado(uid), error = null;
    if (!a) {
      const r = await sb.rpc("mi_acceso");
      a = r.data; error = r.error;
      if (!error && a && typeof a === "object" && a.vigente === true) recordar(uid, a);
    }
    /* Solo se tapa cuando la base dice «no» con todas las letras. Cualquier
       otra respuesta —un error, un arreglo, un objeto sin `vigente`— se toma
       como que no se sabe, y ante la duda no se deja fuera a nadie. */
    if (error || !a || typeof a !== "object" || Array.isArray(a) || typeof a.vigente !== "boolean") {
      if (error) console.warn("acceso-vigente: no se pudo consultar el acceso", error.message || error);
      return;
    }
    window.AccesoVigente = a;

    // La cuenta de árbitro no es de la Academia: en una página de sus
    // herramientas se queda; en cualquier otra, va a su panel.
    if (a.motivo === "arbitro") {
      await alPanelDelArbitro();
      return;
    }

    // Cobros: la cuenta de la familia decide (mi_acceso() dice «cobro»).
    if (a.motivo === "cobro") {
      if (a.vigente) {
        if (enPanel()) avisoCobroVigente(sb, a, await whatsapp(sb));
        return;
      }
      const wa = await whatsapp(sb);
      if (enPanel()) apagadoEnPanel(sb, a, wa);
      else taparPorCobro(sb, a, wa);
      return;
    }

    if (a.vigente) {
      if (enPanel() && a.motivo === "prueba" && typeof a.horas === "number") {
        franja("Estás en tu " + nombrePrueba(a) + ": te quedan " + cuantoQueda(a.horas) + " (hasta el " + fechaHora(a.vence) + ").", await whatsapp(sb), false, "prueba");
        return;
      }
      if (enPanel() && a.motivo === "temporal" && typeof a.dias === "number" && a.dias <= DIAS_AVISO) {
        const cuando = a.dias === 0 ? "hoy" : a.dias === 1 ? "mañana" : "en " + a.dias + " días";
        franja("Tu cuenta temporal se cierra " + cuando + " (el " + dia(a.vence) + ").", await whatsapp(sb), false, "temporal");
        return;
      }
      if (enPanel() && a.exigido && a.motivo === "paquete" && typeof a.dias === "number" && a.dias <= DIAS_AVISO) {
        const cuando = a.dias === 0 ? "hoy" : a.dias === 1 ? "mañana" : "en " + a.dias + " días (el " + fecha(a.hasta) + ")";
        franja("Tu acceso a la Academia vence " + cuando + ".", await whatsapp(sb), false);
      }
      return;
    }

    const wa = await whatsapp(sb);
    if (enPanel()) franja(porQue(a) + " Puedes ver tu panel, pero no entrar a los ejercicios ni a las clases.", wa, true, modoDe(a));
    else tapar(a, wa);
  }

  function inicio() {
    arrancar().catch((e) => console.warn("acceso-vigente:", e && e.message ? e.message : e));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio);
  else inicio();
})();

/*! rev bfb5bbb0d2d82f9f */
