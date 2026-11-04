/* La cuenta de visitas: Cloudflare Web Analytics, sin cookies ni nada
   guardado en el aparato (ver «Cuántas personas entran: Cloudflare Web
   Analytics, sin cookies» en docs/decisiones/sitio-e-infraestructura.md).

   Solo en el sitio de verdad: en las pruebas (localhost), en las vistas
   previas de Cloudflare (*.workers.dev) y en la computadora de quien programa
   no se carga. Ahí Cloudflare rechaza el envío por CORS (un error en la
   consola de cada página, que hacía caer los verificadores) y, de cargarse,
   sumaría visitas que no son de nadie. El token no es una clave: va en cada
   página que se publica. */
(function () {
  "use strict";
  var TOKEN = "e9429513182b4d298706df747a14fb70";
  var host = location.hostname;
  if (host !== "ajedrez-integral.com" && host !== "www.ajedrez-integral.com") return;
  var s = document.createElement("script");
  s.type = "module";
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN }));
  document.head.appendChild(s);
})();
