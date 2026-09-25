/**
 * Ajedrez Integral — la prueba gratis de 3 días (prueba-gratis.html).
 *
 * Pide nombre y contraseña, nada más. La cuenta la crea la Edge Function
 * `prueba-gratis` con un USUARIO del dominio sin buzón (como a los alumnos
 * sin correo) y la base le pone el vencimiento: a las 72 horas
 * `acceso_vigente()` le cierra la Academia sola, esté encendido o no el
 * interruptor del acceso. Esta página no decide nada de eso: solo llama,
 * inicia la sesión con lo que se escribió y enseña el usuario que devolvió
 * el SERVIDOR (no uno adivinado aquí: si dos personas se llaman igual, el
 * servidor numera y el usuario es otro).
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

  const verClave = $("prueba-ver-clave");
  verClave.addEventListener("click", () => {
    const clave = $("prueba-clave");
    const ver = clave.type === "password";
    clave.type = ver ? "text" : "password";
    verClave.textContent = ver ? "Ocultar" : "Mostrar";
    verClave.setAttribute("aria-pressed", String(ver));
  });

  function lista(usuario, vence, conSesion) {
    $("prueba-usuario").textContent = usuario;
    $("prueba-vence").textContent = fechaHora(vence);
    if (!conSesion) {
      $("prueba-sin-sesion").classList.remove("hidden");
      const entrar = $("prueba-entrar");
      entrar.href = "login.html";
      entrar.textContent = "Iniciar sesión →";
    }
    $("prueba-form-card").classList.add("hidden");
    $("prueba-lista").classList.remove("hidden");
    $("prueba-lista-titulo").focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorP.classList.add("hidden");
    form.querySelectorAll("[aria-invalid]").forEach((c) => c.removeAttribute("aria-invalid"));

    const nombreCampo = $("prueba-nombre");
    const claveCampo = $("prueba-clave");
    const nombre = nombreCampo.value.replace(/\s+/g, " ").trim();
    const clave = claveCampo.value;

    // Un bot llena el campo escondido: se le contesta como si nada.
    if ($("prueba-sitio-web").value.trim()) return;

    if ((nombre.match(/\p{L}/gu) || []).length < 2) return error("Escribe tu nombre: con él armamos tu usuario.", nombreCampo);
    if (clave.length < 8) return error("La contraseña tiene que tener al menos 8 caracteres.", claveCampo);
    if (clave.length > 72) return error("La contraseña puede tener hasta 72 caracteres.", claveCampo);
    if (!$("prueba-acepto").checked) return error("Para empezar, marca que aceptas los Términos y la Política de privacidad.", $("prueba-acepto"));

    boton.disabled = true;
    boton.textContent = "Creando tu cuenta…";
    let r = null;
    try {
      const resp = await fetch(window.SUPABASE_URL + "/functions/v1/prueba-gratis", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: window.SUPABASE_ANON_KEY },
        body: JSON.stringify({
          nombre,
          contrasena: clave,
          privacidad_version: window.LegalVersion.PRIVACIDAD,
          terminos_version: window.LegalVersion.TERMINOS,
        }),
      });
      r = await resp.json().catch(() => null);
    } catch (_) { r = null; }

    if (!r || !r.ok || !r.correo) {
      boton.disabled = false;
      boton.textContent = TEXTO_BOTON;
      return error((r && r.error) || "No se pudo empezar la prueba. Revisa tu conexión e intenta de nuevo.");
    }

    // La sesión se abre con lo mismo que se va a escribir después en el login.
    let conSesion = false;
    try {
      const { error: e2 } = await window.sb.auth.signInWithPassword({ email: r.correo, password: clave });
      conSesion = !e2;
    } catch (_) { conSesion = false; }
    lista(r.usuario || UsuarioAlumno.soloUsuario(r.correo), r.vence, conSesion);
  });
})();
