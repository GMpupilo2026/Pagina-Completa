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
 * Se autoarranca. La pone herramientas/academia-cabecera.py en las páginas de
 * la Academia, igual que la burbuja y el aviso de partida.
 */
(function () {
  "use strict";

  const DIAS_AVISO = 7;

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
    return new Date(y, m - 1, d).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" });
  }

  function fechaHora(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
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

  function porQue(a) {
    if (a.motivo === "prueba_vencida") {
      return "Tu prueba gratis de 3 días terminó el " + fechaHora(a.vence) + ".";
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

  function contacto(wa, prueba) {
    const p = document.createElement("p");
    p.className = "text-sm mt-3";
    if (prueba) {
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

  function franja(texto, wa, urgente, prueba) {
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
    caja.append(p, contacto(wa, prueba));
    div.append(caja);
    main.prepend(div);
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
    h1.textContent = a.motivo === "prueba_vencida" ? "Tu prueba gratis terminó" : "Tu acceso no está activo";
    const p = document.createElement("p");
    p.textContent = porQue(a);
    const volver = document.createElement("a");
    volver.href = panelHref();
    volver.className = "inline-block mt-5 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors";
    volver.textContent = "← Volver al panel";
    caja.append(icono, h1, p, contacto(wa, a.motivo === "prueba_vencida"), volver);
    aviso.append(caja);
    main.after(aviso);

    const saltar = document.querySelector('a[href="#main-content"], a[href="#app"]');
    if (saltar) saltar.setAttribute("href", "#acceso-aviso");
    h1.focus();
  }

  async function whatsapp(sb) {
    try {
      const { data } = await sb.from("ajustes_academia").select("valor").eq("clave", "whatsapp_consultas").maybeSingle();
      return waDe(data && data.valor);
    } catch (e) { return null; }
  }

  async function arrancar() {
    const sb = window.sb;
    if (!sb || !sb.auth || typeof sb.rpc !== "function") return;
    const { data: ses } = await sb.auth.getSession();
    if (!ses || !ses.session) return;

    const { data: a, error } = await sb.rpc("mi_acceso");
    /* Solo se tapa cuando la base dice «no» con todas las letras. Cualquier
       otra respuesta —un error, un arreglo, un objeto sin `vigente`— se toma
       como que no se sabe, y ante la duda no se deja fuera a nadie. */
    if (error || !a || typeof a !== "object" || Array.isArray(a) || typeof a.vigente !== "boolean") {
      if (error) console.warn("acceso-vigente: no se pudo consultar el acceso", error.message || error);
      return;
    }
    window.AccesoVigente = a;

    if (a.vigente) {
      if (enPanel() && a.motivo === "prueba" && typeof a.horas === "number") {
        franja("Estás en tu prueba gratis: te quedan " + cuantoQueda(a.horas) + " (hasta el " + fechaHora(a.vence) + ").", await whatsapp(sb), false, true);
        return;
      }
      if (enPanel() && a.exigido && a.motivo === "paquete" && typeof a.dias === "number" && a.dias <= DIAS_AVISO) {
        const cuando = a.dias === 0 ? "hoy" : a.dias === 1 ? "mañana" : "en " + a.dias + " días (el " + fecha(a.hasta) + ")";
        franja("Tu acceso a la Academia vence " + cuando + ".", await whatsapp(sb), false);
      }
      return;
    }

    const wa = await whatsapp(sb);
    if (enPanel()) franja(porQue(a) + " Puedes ver tu panel, pero no entrar a los ejercicios ni a las clases.", wa, true, a.motivo === "prueba_vencida");
    else tapar(a, wa);
  }

  function inicio() {
    arrancar().catch((e) => console.warn("acceso-vigente:", e && e.message ? e.message : e));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio);
  else inicio();
})();
