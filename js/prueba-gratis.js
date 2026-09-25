/**
 * Ajedrez Integral — la prueba gratis de 3 días (prueba-gratis.html).
 *
 * La prueba se PIDE por WhatsApp y la CREA quien administra. Así que la
 * página tiene dos caras:
 *
 *  - Todo el mundo ve qué trae la prueba y el botón para pedirla por
 *    WhatsApp, con el mensaje de interés ya escrito. Esa cara es HTML puro:
 *    funciona aunque falle todo lo demás.
 *  - Quien administra (lo pregunta `soy_admin()`) ve además el formulario:
 *    nombre, su WhatsApp (opcional, no se guarda) y una contraseña ya
 *    armada. La Edge Function `prueba-gratis` —que solo acepta a quien
 *    administra— crea la cuenta con un usuario sin buzón, y la base le pone
 *    el vencimiento: a las 72 horas `acceso_vigente()` le cierra la Academia
 *    sola. Al final se enseña el usuario que devolvió el SERVIDOR (si dos
 *    personas se llaman igual, numera) y un botón que abre el WhatsApp de la
 *    persona con su acceso ya escrito.
 *
 * Esta página no decide quién puede crear nada: si alguien fuerza la cara
 * de administración desde la consola, la función igual lo rechaza.
 *
 * Ver «La prueba gratis de 3 días» en docs/decisiones/cobros-acceso-y-tienda.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("prueba-form");
  if (!form) return;
  const errorP = $("prueba-error");
  const boton = $("prueba-enviar");
  const TEXTO_BOTON = boton.textContent;
  const SITIO = "https://ajedrez-integral.com/";

  /* Una contraseña que se pueda dictar y escribir en un celular: dos
     palabras de ajedrez y dos cifras, sin letras que se confundan. */
  const PALABRAS = ["torre", "alfil", "rey", "dama", "peon", "caballo", "jaque", "enroque", "tablero", "gambito", "tabla", "casilla"];
  function azar(n) {
    const a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return a[0] % n;
  }
  function claveNueva() {
    let c = "";
    while (c.length < 10) c = PALABRAS[azar(PALABRAS.length)] + PALABRAS[azar(PALABRAS.length)];
    return c + String(10 + azar(90));
  }

  function error(texto, campo) {
    errorP.textContent = texto;
    errorP.classList.remove("hidden");
    if (campo) {
      campo.setAttribute("aria-invalid", "true");
      campo.focus();
    }
  }

  function fechaHora(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("es-CR", {
      timeZone: "America/Costa_Rica", weekday: "long", day: "numeric", month: "long",
      hour: "numeric", minute: "2-digit",
    });
  }

  /** wa.me de la persona. 8 cifras es un número de Costa Rica; sin número,
   *  WhatsApp deja elegir el chat. */
  function waDe(telefono, texto) {
    const d = String(telefono || "").replace(/\D/g, "");
    const num = d.length === 8 ? "506" + d : d.length >= 10 ? d : "";
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(texto);
  }

  function mensaje(nombre, usuario, clave, vence) {
    const primero = nombre.split(" ")[0];
    return `Hola ${primero}, ya tienes tu prueba gratis de 3 días de la Academia de Ajedrez Integral.\n\n` +
      `Entra en ${SITIO}login.html\n` +
      `Usuario: ${usuario}\n` +
      `Contraseña: ${clave}\n\n` +
      `Tu prueba dura hasta el ${fechaHora(vence)}. Anota el usuario y la contraseña: la cuenta no tiene correo.\n\n` +
      `Al usar la cuenta aceptas los Términos (${SITIO}terminos.html#prueba) y la Política de privacidad (${SITIO}privacidad.html).`;
  }

  function limpiar() {
    form.reset();
    $("prueba-clave").value = claveNueva();
    errorP.classList.add("hidden");
    boton.disabled = false;
    boton.textContent = TEXTO_BOTON;
  }

  $("prueba-otra-clave").addEventListener("click", () => { $("prueba-clave").value = claveNueva(); });
  $("prueba-otra").addEventListener("click", () => {
    limpiar();
    $("prueba-lista").classList.add("hidden");
    $("prueba-admin").classList.remove("hidden");
    $("prueba-nombre").focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorP.classList.add("hidden");
    form.querySelectorAll("[aria-invalid]").forEach((c) => c.removeAttribute("aria-invalid"));

    const nombreCampo = $("prueba-nombre");
    const claveCampo = $("prueba-clave");
    const nombre = nombreCampo.value.replace(/\s+/g, " ").trim();
    const clave = claveCampo.value.trim();
    const telefono = $("prueba-telefono").value;

    if ((nombre.match(/\p{L}/gu) || []).length < 2) return error("Escribe el nombre: con él se arma el usuario.", nombreCampo);
    if (clave.length < 8) return error("La contraseña tiene que tener al menos 8 caracteres.", claveCampo);
    if (clave.length > 72) return error("La contraseña puede tener hasta 72 caracteres.", claveCampo);
    if (!$("prueba-acepto").checked) return error("Marca que la persona conoce y acepta los Términos y la Política de privacidad.", $("prueba-acepto"));

    boton.disabled = true;
    boton.textContent = "Creando la cuenta…";
    let r = null;
    try {
      const { data: ses } = await window.sb.auth.getSession();
      const token = ses && ses.session && ses.session.access_token;
      const resp = await fetch(window.SUPABASE_URL + "/functions/v1/prueba-gratis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: "Bearer " + (token || ""),
        },
        body: JSON.stringify({
          nombre,
          contrasena: clave,
          privacidad_version: window.LegalVersion.PRIVACIDAD,
          terminos_version: window.LegalVersion.TERMINOS,
        }),
      });
      r = await resp.json().catch(() => null);
    } catch (_) { r = null; }

    if (!r || !r.ok || !r.usuario) {
      boton.disabled = false;
      boton.textContent = TEXTO_BOTON;
      return error((r && r.error) || "No se pudo crear la prueba. Revisa la conexión e intenta de nuevo.");
    }

    $("prueba-usuario").textContent = r.usuario;
    $("prueba-clave-lista").textContent = clave;
    $("prueba-vence").textContent = fechaHora(r.vence);
    $("prueba-mandar").href = waDe(telefono, mensaje(nombre, r.usuario, clave, r.vence));
    $("prueba-admin").classList.add("hidden");
    $("prueba-lista").classList.remove("hidden");
    $("prueba-lista-titulo").focus();
  });

  /* La cara de administración solo se enseña si la base dice que sí. */
  async function arrancar() {
    const sb = window.sb;
    if (!sb || !sb.auth || typeof sb.rpc !== "function") return;
    const { data: ses } = await sb.auth.getSession();
    if (!ses || !ses.session) return;
    const { data: admin, error: e } = await sb.rpc("soy_admin");
    if (e || admin !== true) return;
    $("prueba-clave").value = claveNueva();
    $("prueba-publico").classList.add("hidden");
    $("prueba-admin").classList.remove("hidden");
  }
  arrancar().catch(() => {});
})();
