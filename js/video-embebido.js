/* Un enlace de video (YouTube o Twitch) convertido en la dirección de su
 * reproductor incrustado. Una sola copia: la usan tv.html (los comentaristas
 * de la TV), transmision.html (el comentarista de la sala de cine) y el editor
 * de salas de admin.html, que con esto dice si el enlace sirve antes de
 * guardarlo.
 *
 *   VideoEmbebido.leer(texto) → null (vacío),
 *     { kind: "youtube" | "twitch", embedUrl }   se puede incrustar, o
 *     { kind: "unknown", embedUrl: null, url }   de otro servicio: no se
 *                                                incrusta, solo se enlaza.
 *
 * Solo esos dos porque son los que usan los canales de ajedrez para comentar
 * en vivo, y porque la CSP (frame-src en _headers) deja incrustar solo
 * youtube-nocookie.com y player.twitch.tv. YouTube va por su modo de
 * privacidad mejorada. Twitch exige decir en qué sitio se incrusta
 * (parent=): es el de la página.
 */
(function () {
  "use strict";

  function leer(texto) {
    const limpio = String(texto || "").trim();
    if (!limpio) return null;
    let u;
    try { u = new URL(limpio); } catch (e) { return { kind: "unknown", embedUrl: null, url: limpio }; }
    const host = u.hostname.replace(/^www\.|^m\./, "");

    if (host === "youtube.com" || host === "youtu.be") {
      let id = null;
      if (host === "youtu.be") id = u.pathname.slice(1);
      else if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (u.pathname.startsWith("/live/") || u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2];
      if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
        return { kind: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) };
      }
    }

    if (host === "twitch.tv") {
      const parent = window.location.hostname;
      const partes = u.pathname.split("/").filter(Boolean);
      if (partes[0] === "videos" && partes[1]) {
        return { kind: "twitch", embedUrl: "https://player.twitch.tv/?video=" + encodeURIComponent(partes[1]) + "&parent=" + parent + "&autoplay=false" };
      }
      if (partes[0] && /^[A-Za-z0-9_]{2,40}$/.test(partes[0])) {
        return { kind: "twitch", embedUrl: "https://player.twitch.tv/?channel=" + encodeURIComponent(partes[0]) + "&parent=" + parent + "&autoplay=false" };
      }
    }

    return { kind: "unknown", embedUrl: null, url: limpio };
  }

  window.VideoEmbebido = { leer };
})();
