/* El token de la sesión y el mensaje de error para llamar a una Edge Function.

   Va aparte de js/supabase-client.js a propósito: los verificadores cambian
   ese archivo por su doble, y lo que viviera ahí desaparecería con él. Este
   solo usa window.sb, que el doble también trae. */

// El token para llamar a una Edge Function, pedido en el momento. Las páginas
// guardan la sesión en una variable al cargar, pero su access_token vence a la
// hora: supabase-js lo renueva por dentro y la variable no se entera. Con el
// viejo, Supabase rechaza el pedido con un 401 antes de llegar a la función
// —sin el campo `error` que leen las páginas—, y administración veía «Error
// desconocido» al crear una cuenta con el panel abierto un rato (6 de octubre).
// getSession() devuelve la sesión renovada (y la renueva si hace falta).
window.tokenDeSesion = async function () {
  var r = await window.sb.auth.getSession();
  var s = r && r.data && r.data.session;
  if (!s) {
    // El login solo acepta un next que termine en .html (ver la guardia).
    var aca = location.pathname.replace(/^\/+/, "") || "clases.html";
    if (/\/$/.test(aca)) aca += "index.html";
    else if (!/\.html$/.test(aca)) aca += ".html";
    window.location.href = "/login.html?next=" + encodeURIComponent(aca);
    throw new Error("La sesión se cerró: vuelve a entrar.");
  }
  return s.access_token;
};

// El mensaje de un pedido a una Edge Function que salió mal. La función
// contesta { error }, pero el 401 de la puerta de Supabase trae { message } en
// inglés («Invalid JWT»), y un 502 ni siquiera trae JSON.
window.errorDeFuncion = function (res, cuerpo) {
  if (cuerpo && cuerpo.error) return String(cuerpo.error);
  if (res && res.status === 401) return "Tu sesión venció. Recarga la página y vuelve a intentarlo.";
  return "El servidor respondió " + (res ? res.status : "sin contestar") + ". Vuelve a intentarlo.";
};
