/* El cliente de Supabase de respaldo, para las páginas SIN CUENTA de las tablets
   del Centroamericano (la del árbitro y la de Fair Play), cuando la librería no
   se puede usar.

   La librería (`js/vendor/supabase.js`) usa `?.` y `??`, que un navegador
   anterior a Chrome 80 o a Safari 13.1 no sabe leer: el archivo entero falla,
   `window.supabase` no existe, `js/supabase-client.js` no arma `window.sb` y la
   página se quedaba en «Entrando a tus mesas…» sin ningún error a la vista.
   Esas páginas no tienen sesión: solo llaman a sus Edge Functions con la clave
   pública y leen una tabla pública. Eso es un `fetch`, y es lo único que hace
   este archivo, con las mismas respuestas que la librería (`{ data, error }`,
   y `error.context` con la respuesta cuando la función contesta 4xx/5xx), para
   que la página no note la diferencia.

   Solo actúa si `window.sb` no existe: con la librería andando (toda tablet
   nueva) no hace nada. Escrito en JavaScript viejo, como js/modo-liviano.js.
   Ver «Las tablets viejas: el modo liviano» en docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  if (window.sb) return;
  var BASE = window.SUPABASE_URL, CLAVE = window.SUPABASE_ANON_KEY;
  if (!BASE || !CLAVE || !window.fetch) return;

  function cabeceras(extra) {
    var h = { Authorization: "Bearer " + CLAVE, apikey: CLAVE };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
    return h;
  }

  // sb.functions.invoke(nombre, { body, headers, method }) → { data, error }, como la librería.
  function invoke(nombre, op) {
    op = op || {};
    var cuerpo = op.body, h = {}, envio;
    if (cuerpo === undefined || cuerpo === null) envio = undefined;
    else if (typeof cuerpo === "string" || (window.Blob && cuerpo instanceof Blob) || (window.FormData && cuerpo instanceof FormData) || (window.ArrayBuffer && cuerpo instanceof ArrayBuffer)) envio = cuerpo;
    else { h["Content-Type"] = "application/json"; envio = JSON.stringify(cuerpo); }
    if (op.headers) for (var k in op.headers) if (Object.prototype.hasOwnProperty.call(op.headers, k)) h[k] = op.headers[k];
    return fetch(BASE + "/functions/v1/" + nombre, { method: op.method || "POST", headers: cabeceras(h), body: envio }).then(function (res) {
      if (!res.ok) return { data: null, error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: res } };
      var tipo = String(res.headers.get("Content-Type") || "text/plain").split(";")[0].trim();
      var leido = tipo === "application/json" ? res.json() : (tipo === "application/octet-stream" || tipo === "application/pdf") ? res.blob() : tipo === "multipart/form-data" ? res.formData() : res.text();
      return leido.then(function (data) { return { data: data, error: null }; });
    }, function (e) {
      return { data: null, error: { name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function", context: e } };
    });
  }

  // sb.from(tabla).select(columnas).eq(col, valor)….maybeSingle() / .single() / await: lo justo para leer
  // una tabla pública (la sala de la transmisión). Escribir no: estas páginas no escriben tablas.
  function from(tabla) {
    var columnas = "*", filtros = [], tope = null;
    function pedir(uno) {
      var q = "select=" + encodeURIComponent(columnas);
      for (var i = 0; i < filtros.length; i++) q += "&" + encodeURIComponent(filtros[i][0]) + "=" + encodeURIComponent(filtros[i][1]);
      if (uno) q += "&limit=2"; else if (tope != null) q += "&limit=" + tope;
      return fetch(BASE + "/rest/v1/" + encodeURIComponent(tabla) + "?" + q, { headers: cabeceras({ Accept: "application/json" }) }).then(function (res) {
        return res.json().then(function (cuerpo) {
          if (!res.ok) return { data: null, error: { message: (cuerpo && cuerpo.message) || ("La base contestó " + res.status + "."), code: cuerpo && cuerpo.code } };
          return { data: cuerpo, error: null };
        }, function () { return { data: null, error: { message: "La base contestó " + res.status + " sin datos." } }; });
      }, function (e) { return { data: null, error: { message: (e && e.message) || "No hubo respuesta. Revisa tu conexión." } }; });
    }
    var q = {
      select: function (c) { columnas = String(c || "*").replace(/\s+/g, ""); return q; },
      eq: function (col, v) { filtros.push([col, "eq." + v]); return q; },
      limit: function (n) { tope = n; return q; },
      maybeSingle: function () {
        return pedir(true).then(function (r) {
          if (r.error) return r;
          if (r.data.length > 1) return { data: null, error: { message: "Llegó más de una fila." } };
          return { data: r.data[0] || null, error: null };
        });
      },
      single: function () {
        return q.maybeSingle().then(function (r) { return r.error || r.data ? r : { data: null, error: { message: "No hay ninguna fila." } }; });
      },
      then: function (bien, mal) { return pedir(false).then(bien, mal); }
    };
    return q;
  }

  window.sb = { functions: { invoke: invoke }, from: from, sinLibreria: true };
})();
