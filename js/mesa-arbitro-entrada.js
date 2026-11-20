/* La entrada de la Mesa del árbitro (mesa-arbitro.html). Desde el 19/11/2026 hay UNA sola Mesa del árbitro: la del evento,
   con su organización (centroamericano-mesas.html) y la tablet de cada árbitro (centroamericano-arbitro.html). Esta página:

   - revisa la licencia (`tengo_herramienta('mesa-arbitro')`) y muestra «¿Sobre qué vas a trabajar?»: Pareo Integral o
     chess-results, que llevan a la organización del evento;
   - «¿Te dieron mesas?»: el enlace, el QR o el código de 8 letras que dio otro árbitro principal, y abre la tablet. Los dos
     códigos tienen la misma forma (8 letras del mismo alfabeto): primero se prueba como código de la tablet
     (centroamericano-codigo) y, si no existe, como código de adjunto de Pareo Integral (pareo-publicar), que abre la
     vista del adjunto en Pareo;
   - «Consultar sin anotar»: el corrector del reloj y el reglamento (js/mesa-arbitro-consultas.js);
   - los enlaces viejos de la mesa de «Dirijo solo», retirada: #adjunto=… y #codigo=… siguen sirviendo (van a la vista del
     adjunto en Pareo, que es lo mismo que hacían) y #solo explica dónde quedó.

   Ver «Una sola Mesa del árbitro» en docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";

  // Lo que se pega: un enlace de la tablet, la puerta corta, un enlace de adjunto de Pareo, un token o un código.
  // Solo se arman direcciones de este sitio: de un enlace pegado se toma el dato, nunca la dirección entera.
  const ALFABETO = /^[A-HJKMNP-Z2-9]{8}$/;
  function leerEntrada(texto) {
    const t = String(texto || "").trim();
    let m;
    if ((m = /centroamericano-arbitro\.html#(?:t=)?([0-9a-f]{64})\b/i.exec(t))) return { tipo: "token", valor: m[1].toLowerCase() };
    if ((m = /^#?(?:t=)?([0-9a-f]{64})$/i.exec(t))) return { tipo: "token", valor: m[1].toLowerCase() };
    if ((m = /#adjunto=([a-z0-9]{8}(?:&[a-z]+=[0-9a-z-]+)*)/i.exec(t))) return { tipo: "adjunto", valor: m[1] };
    if ((m = /\/m\/([A-Za-z0-9 -]{8,12})\s*$/.exec(t)) || (m = /#c=([A-Za-z0-9 -]{8,12})\s*$/.exec(t))) {
      const c = m[1].toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (ALFABETO.test(c)) return { tipo: "codigo-tablet", valor: c };
    }
    const c = t.toUpperCase().replace(/[\s-]/g, "");
    if (ALFABETO.test(c)) return { tipo: "codigo", valor: c };
    return null;
  }

  // En Node (verificar-mesa-arbitro-entrada.js) solo se prueba la lectura de lo pegado.
  if (typeof module !== "undefined" && module.exports) { module.exports = { leerEntrada }; return; }
  const $ = (id) => document.getElementById(id);

  // Los enlaces de antes, antes de revisar nada: un adjunto con su enlace no necesita la licencia de la Mesa.
  const hash = location.hash || "";
  if (/^#adjunto=/.test(hash) || /^#codigo(=|$)/.test(hash)) { location.replace("pareo.html" + hash); return; }

  // El código de la tablet: lo canjea centroamericano-codigo (con su freno de intentos). null si no existe.
  async function canjearTablet(codigo) {
    const { data, error } = await window.sb.functions.invoke("centroamericano-codigo", { body: { codigo } });
    let d = data;
    if (error && error.context && typeof error.context.json === "function") { try { d = await error.context.json(); } catch (e) { /* sin cuerpo */ } }
    if (d && d.ok === true && /^[0-9a-f]{64}$/.test(String(d.token))) return d.token;
    if (error && !d) throw new Error("No hubo respuesta. Revisa tu conexión.");
    return null;
  }

  async function abrirMisMesas(ev) {
    ev.preventDefault();
    const estado = $("mm-estado"), boton = $("mm-entrar"), campo = $("mm-entrada");
    const e = leerEntrada(campo.value);
    if (!e) { estado.textContent = "No entendí eso. Pega el enlace completo o escribe el código de 8 letras (por ejemplo K7M2-9QXA)."; campo.focus(); return; }
    if (e.tipo === "token") { location.href = "centroamericano-arbitro.html#" + e.valor; return; }
    if (e.tipo === "adjunto") { location.href = "pareo.html#adjunto=" + e.valor; return; }
    if (e.tipo === "codigo-tablet") { location.href = "centroamericano-arbitro.html#c=" + e.valor; return; }
    boton.disabled = true;
    estado.textContent = "Buscando ese código…";
    try {
      const token = await canjearTablet(e.valor);
      if (token) { location.href = "centroamericano-arbitro.html#" + token; return; }
      const r = window.PareoPublicar ? await window.PareoPublicar.entrarAdjunto(e.valor.toLowerCase()) : { ok: false };
      if (r && r.ok) { location.href = "pareo.html#adjunto=" + e.valor.toLowerCase() + "&m=" + r.desde + "-" + r.hasta; return; }
      estado.textContent = "No encontramos ese código. Revísalo con quien te lo dio: puede estar vencido o apagado.";
      campo.focus();
    } catch (err) {
      estado.textContent = (err && err.message) || "No se pudo buscar el código. Revisa tu conexión.";
    } finally {
      boton.disabled = false;
    }
  }

  function pintarRitmo() {
    const r = window.MesaConsultas && window.MesaConsultas.ritmo("general");
    $("c-ritmo").textContent = "Ritmo: " + window.MesaArbitro.textoRitmo(r || window.MesaArbitro.RITMO_POR_DEFECTO) + (r ? "." : " (sin confirmar: toca «Cambiar el ritmo» si no es el de tu torneo).");
  }

  async function init() {
    const { data: { session } } = await window.sb.auth.getSession();
    $("loading").classList.add("hidden");
    if (!session) { location.href = "login.html?next=mesa-arbitro.html"; return; }
    const { data: puede, error } = await window.sb.rpc("tengo_herramienta", { p_herramienta: "mesa-arbitro" });
    if (error || puede !== true) { $("denegado").classList.remove("hidden"); return; }
    $("app").classList.remove("hidden");
    const aviso = $("aviso-solo");
    if (aviso && /^#solo$/.test(location.hash)) { aviso.hidden = false; aviso.setAttribute("tabindex", "-1"); aviso.focus(); }
    $("mm-form").addEventListener("submit", abrirMisMesas);
    if (window.MesaConsultas) {
      pintarRitmo();
      $("c-reloj").addEventListener("click", () => window.MesaConsultas.reloj({ ritmo: window.MesaConsultas.ritmo("general") }));
      $("c-reglamento").addEventListener("click", () => window.MesaConsultas.reglamento({ ritmo: window.MesaConsultas.ritmo("general") }));
      $("c-ritmo-cambiar").addEventListener("click", async () => {
        const nuevo = await window.MesaConsultas.cambiarRitmo("general");
        if (nuevo) { pintarRitmo(); window.Avisos.avisar("Ritmo guardado: " + window.MesaArbitro.textoRitmo(nuevo) + "."); }
      });
    }
  }

  init().catch((e) => { $("loading").classList.add("hidden"); window.Avisos.avisar("No se pudo abrir la herramienta: " + ((e && e.message) || e), { tipo: "error" }); });
})();

/*! rev bfb5bbb0d2d82f9f */
