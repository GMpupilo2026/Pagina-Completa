/* certificado.html?c=<código>: el certificado de un curso, para verlo,
   imprimirlo o guardarlo en PDF, y para comprobar que es auténtico.

   Página pública (sin cuenta): lo que dice sale de certificado_publico(código)
   en la base, que devuelve solo lo que va en el papel. El código son 10
   caracteres al azar; uno que no tiene esa forma ni se le pregunta a la base.
   Todo lo que viene de la base se escribe con textContent.

   Ver «Los certificados de curso» en docs/decisiones/cursos-y-material.md. */
window.Certificado = (function () {
  "use strict";

  const CODIGO_RE = /^[0-9a-f]{10}$/;
  const ZONA = "America/Costa_Rica";

  const $ = (id) => document.getElementById(id);

  function codigoDeLaDireccion() {
    try { return (new URLSearchParams(location.search).get("c") || "").trim().toLowerCase(); }
    catch (e) { return ""; }
  }

  function enlace(codigo) {
    return location.origin + "/certificado.html?c=" + encodeURIComponent(codigo);
  }

  function fecha(momento) {
    const d = new Date(momento);
    return isNaN(d) ? "" : d.toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA });
  }

  function urlDelLogo(path) {
    if (!path || !window.SUPABASE_URL) return "";
    return window.SUPABASE_URL + "/storage/v1/object/public/academia-marca/" +
      String(path).split("/").map(encodeURIComponent).join("/");
  }

  // El QR, dibujado con el DOM (como js/clase-qr.js), con su margen blanco.
  function qr(texto) {
    if (!window.qrcode) return null;
    const q = window.qrcode(0, "M");
    q.addData(texto);
    q.make();
    const n = q.getModuleCount(), borde = 4, lado = n + borde * 2;
    const NS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 " + lado + " " + lado);
    s.setAttribute("width", "100%");
    s.setAttribute("height", "100%");
    s.setAttribute("shape-rendering", "crispEdges");
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", "Código QR para comprobar este certificado");
    const fondo = document.createElementNS(NS, "rect");
    fondo.setAttribute("width", String(lado));
    fondo.setAttribute("height", String(lado));
    fondo.setAttribute("fill", "#ffffff");
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += "M" + (x + borde) + " " + (y + borde) + "h1v1h-1z";
    const puntos = document.createElementNS(NS, "path");
    puntos.setAttribute("d", d);
    puntos.setAttribute("fill", "#000000");
    s.append(fondo, puntos);
    return s;
  }

  function sinCertificado(texto) {
    $("estado").textContent = texto;
  }

  // Los colores de la franja de arriba: verde si vale, rojo si se anuló. El
  // color nunca va solo: el texto dice lo mismo.
  const VALIDO = "border-green-700 bg-green-50 text-green-900 dark:border-green-400 dark:bg-brand-900 dark:text-green-200";
  const ANULADO = "border-red-700 bg-red-50 text-red-900 dark:border-red-300 dark:bg-brand-900 dark:text-red-200";

  function pintar(c, codigo) {
    $("cert-alumno").textContent = c.alumno_nombre;
    $("cert-curso").textContent = c.curso_titulo;
    $("cert-lecciones").textContent = c.lecciones ? `${c.lecciones} ${c.lecciones === 1 ? "lección" : "lecciones"}` : "";
    $("cert-fecha").textContent = fecha(c.emitido_at);
    $("cert-profesor").textContent = c.profesor_nombre;
    $("cert-codigo").textContent = codigo;
    if (c.academia_nombre) {
      $("cert-academia").textContent = c.academia_nombre;
      $("cert-academia-fila").hidden = false;
    }
    const logo = urlDelLogo(c.academia_logo_path);
    if (logo) {
      const img = $("logo-academia");
      img.alt = c.academia_nombre ? "Logo de " + c.academia_nombre : "Logo de la academia";
      img.addEventListener("error", () => { img.hidden = true; });
      img.src = logo;
      img.hidden = false;
    }
    const dibujo = qr(enlace(codigo));
    if (dibujo) $("cert-qr").replaceChildren(dibujo);

    const quien = c.academia_nombre ? `${c.academia_nombre} y Ajedrez Integral` : "Ajedrez Integral";
    const caja = $("validez");
    if (c.anulado) {
      caja.className += " " + ANULADO;
      $("validez-texto").textContent = "⚠️ Este certificado fue anulado y ya no vale.";
      $("validez-detalle").textContent = `Lo había dado ${quien} el ${fecha(c.emitido_at)}. Si crees que es un error, escríbele a tu academia.`;
      $("cert-anulado").hidden = false;
      $("imprimir").hidden = true;
    } else {
      caja.className += " " + VALIDO;
      $("validez-texto").textContent = "✅ Certificado auténtico.";
      $("validez-detalle").textContent = `Lo dio ${quien} el ${fecha(c.emitido_at)}. Cualquiera puede comprobarlo con este enlace o con el código QR.`;
    }
    document.title = `Certificado: ${c.curso_titulo} — ${c.alumno_nombre}`;
    $("estado").hidden = true;
    $("app").hidden = false;
  }

  function atar(codigo) {
    $("imprimir").addEventListener("click", () => window.print());
    $("copiar").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(enlace(codigo));
        $("copiar-msg").textContent = "Enlace copiado.";
      } catch (e) {
        $("copiar-msg").textContent = "No se pudo copiar. El enlace es la dirección de esta página.";
      }
    });
  }

  async function iniciar() {
    const codigo = codigoDeLaDireccion();
    if (!CODIGO_RE.test(codigo)) {
      sinCertificado("Este enlace no es de un certificado. Revisa que esté completo: termina en ?c= y diez letras y números.");
      return;
    }
    if (!window.sb) { sinCertificado("No se pudo cargar el certificado. Vuelve a intentarlo más tarde."); return; }
    let filas = null;
    try {
      const { data, error } = await sb.rpc("certificado_publico", { p_codigo: codigo });
      if (error) throw error;
      filas = data;
    } catch (e) {
      sinCertificado("No se pudo cargar el certificado. Vuelve a intentarlo más tarde.");
      return;
    }
    const c = Array.isArray(filas) ? filas[0] : null;
    if (!c) {
      sinCertificado("No encontramos un certificado con ese código. Si te lo mandaron, pide que te reenvíen el enlace.");
      return;
    }
    atar(codigo);
    pintar(c, codigo);
  }

  iniciar();
  return { enlace, CODIGO_RE };
})();
