/* La verificación en dos pasos (TOTP: la app de códigos del celular).

   La usan login.html (pedir el código al entrar) y configuracion.html
   (activarla y quitarla). Todo pasa por Supabase Auth (`sb.auth.mfa`): acá no
   se guarda ni se decide nada. Quien exige el segundo paso es la BASE
   (`public.antes_de_cada_pedido()`): con la contraseña sola, una cuenta que
   lo activó no lee ni escribe nada. Esto solo pone la pantalla. Ver «La
   verificación en dos pasos» en docs/decisiones/permisos-y-roles.md. */
window.DosPasos = (function () {
  function mfa() {
    return window.sb && window.sb.auth && window.sb.auth.mfa;
  }

  /* ¿La sesión está a medias? Entró con la contraseña (aal1) y la cuenta
     tiene la verificación activada (nextLevel aal2). supabase-js lo saca del
     token guardado, sin ir a la red. */
  async function necesitaCodigo() {
    try {
      var m = mfa();
      if (!m || typeof m.getAuthenticatorAssuranceLevel !== "function") return false;
      var r = await m.getAuthenticatorAssuranceLevel();
      var d = r && r.data;
      return !!(d && d.currentLevel === "aal1" && d.nextLevel === "aal2");
    } catch (e) {
      return false;
    }
  }

  // Los factores de la app de códigos: los activos y los que quedaron a medias.
  async function factores() {
    var r = await mfa().listFactors();
    if (r.error) throw r.error;
    var todos = (r.data && r.data.all) || [];
    return todos.filter(function (f) { return f.factor_type === "totp"; });
  }

  async function activos() {
    return (await factores()).filter(function (f) { return f.status === "verified"; });
  }

  function codigoValido(codigo) {
    return /^\d{6}$/.test(String(codigo || "").replace(/\s+/g, ""));
  }

  /* El segundo paso al entrar. Con varios factores (dos celulares) vale el
     código de cualquiera: se prueba uno por uno. */
  async function verificar(codigo) {
    codigo = String(codigo || "").replace(/\s+/g, "");
    if (!codigoValido(codigo)) return { error: "El código son 6 números." };
    var lista = await activos();
    if (!lista.length) return { error: "Esta cuenta no tiene la verificación en dos pasos activada." };
    for (var i = 0; i < lista.length; i++) {
      var r = await mfa().challengeAndVerify({ factorId: lista[i].id, code: codigo });
      if (!r.error) return { ok: true };
    }
    return { error: "Ese código no es. Revisa que sea el de Ajedrez Integral y escribe el que se ve ahora (cambia cada 30 segundos)." };
  }

  /* Empezar a activarla: devuelve el QR (una imagen SVG en data:) y la clave
     para escribirla a mano. Un intento anterior que quedó sin confirmar se
     borra antes: Supabase los guarda, y se irían acumulando. */
  async function empezar() {
    var previos = (await factores()).filter(function (f) { return f.status !== "verified"; });
    for (var i = 0; i < previos.length; i++) await mfa().unenroll({ factorId: previos[i].id });
    var r = await mfa().enroll({ factorType: "totp", issuer: "Ajedrez Integral", friendlyName: "App de códigos " + new Date().toLocaleString("sv-SE", { timeZone: "America/Costa_Rica" }).slice(0, 16) });
    if (r.error) throw r.error;
    return { id: r.data.id, qr: r.data.totp.qr_code, secreto: r.data.totp.secret };
  }

  // Confirmar con el primer código: hasta acá no queda activada.
  async function confirmar(factorId, codigo) {
    codigo = String(codigo || "").replace(/\s+/g, "");
    if (!codigoValido(codigo)) return { error: "El código son 6 números." };
    var r = await mfa().challengeAndVerify({ factorId: factorId, code: codigo });
    if (r.error) return { error: "Ese código no es. Escribe el que se ve ahora en la app (cambia cada 30 segundos)." };
    return { ok: true };
  }

  /* Quitarla. Supabase pide que la sesión ya haya pasado el segundo paso:
     con la contraseña sola no se puede, que es justo lo que protege. */
  async function quitar(factorId) {
    var r = await mfa().unenroll({ factorId: factorId });
    if (r.error) return { error: "No se pudo quitar: vuelve a entrar con tu código e inténtalo otra vez." };
    // El token todavía dice aal2 con un factor que ya no está; se renueva.
    try { await window.sb.auth.refreshSession(); } catch (e) { }
    return { ok: true };
  }

  return {
    disponible: function () { return !!mfa(); },
    necesitaCodigo: necesitaCodigo,
    activos: activos,
    verificar: verificar,
    empezar: empezar,
    confirmar: confirmar,
    quitar: quitar,
  };
})();
