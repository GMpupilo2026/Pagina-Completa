/* El enlace y el QR de solo lectura de pareo.html (ver «El enlace y el QR de
 * solo lectura» en docs/decisiones/juegos-y-torneos.md).
 *
 * Una «foto» de una ronda y la clasificación de ese momento, para que quien
 * no organiza el torneo la vea desde el celular sin tocar nada: nunca pasa
 * por un servidor, viaja comprimida en el fragmento de la URL (después del
 * «#», que el navegador no manda a nadie) y la lee directamente la cámara o
 * un clic en el enlace. No se actualiza sola — es del momento en que se
 * generó — y no necesita el motor de emparejamiento ni el resto del torneo:
 * recibe ya armadas las filas que la pantalla (o el PDF) ya pintó.
 */
window.PareoVer = (function () {
  "use strict";

  const X = window.PareoTextos;

  function b64urlDeBytes(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function bytesDeB64url(cadena) {
    const base = (cadena + "=".repeat((4 - (cadena.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(base);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function empaquetar(datos) {
    const flujo = new Blob([JSON.stringify(datos)]).stream().pipeThrough(new CompressionStream("deflate"));
    return b64urlDeBytes(new Uint8Array(await new Response(flujo).arrayBuffer()));
  }

  async function desempaquetar(cadena) {
    const flujo = new Blob([bytesDeB64url(cadena)]).stream().pipeThrough(new DecompressionStream("deflate"));
    return JSON.parse(new TextDecoder().decode(await new Response(flujo).arrayBuffer()));
  }

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }

  function puntosTexto(idioma, x) {
    return Number(x).toLocaleString(idioma === "en" ? "en-US" : "es-CR", { maximumFractionDigits: 2 })
      .replace(/[.,]5$/, "½").replace(/^0½$/, "½");
  }

  function pintar(cont, idioma, datos) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const nodos = [
      el("h1", { class: "font-serif text-2xl font-bold mb-1" }, datos.nombre || "Pareo Integral"),
      el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-6" }, tx("verFotoDelMomento")),
    ];
    if (datos.ronda) {
      nodos.push(el("h2", { class: "font-serif text-xl font-bold mb-3" }, tx("rondaN", { r: datos.ronda.n })));
      const cuerpo = el("tbody");
      for (const m of datos.ronda.mesas) {
        cuerpo.append(el("tr", {},
          el("td", { class: "num" }, String(m.m)),
          el("td", { class: "font-semibold" }, m.b),
          m.n ? el("td", {}, m.n) : el("td", { class: "italic" }, tx("cBye")),
          el("td", { class: "text-center" }, m.r ? tx("corto_" + m.r) : "")));
      }
      nodos.push(el("div", { class: "overflow-x-auto mb-8" },
        el("table", { class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col" }, tx("mesa")), el("th", { scope: "col" }, tx("blancas")),
            el("th", { scope: "col" }, tx("negras")), el("th", { class: "text-center", scope: "col" }, tx("resultado")))),
          cuerpo)));
    }
    if (datos.clasificacion && datos.clasificacion.length) {
      nodos.push(el("h2", { class: "font-serif text-xl font-bold mb-3" }, tx("fClasificacion")));
      const cuerpo = el("tbody");
      for (const f of datos.clasificacion) {
        cuerpo.append(el("tr", {}, el("td", { class: "num" }, String(f.p)), el("td", { class: "font-semibold" }, f.n),
          el("td", { class: "num" }, puntosTexto(idioma, f.pts))));
      }
      nodos.push(el("div", { class: "overflow-x-auto" },
        el("table", { class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col" }, tx("puesto")), el("th", { scope: "col" }, tx("nombre")),
            el("th", { class: "num", scope: "col" }, tx("pts")))),
          cuerpo)));
    }
    cont.replaceChildren(...nodos);
  }

  async function iniciar(cadena, idioma) {
    const cont = document.getElementById("pi-ver");
    const tx = (clave) => X.t(idioma, clave);
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("cargandoVer")));
    let datos;
    try {
      datos = await desempaquetar(cadena);
    } catch (e) {
      cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorVerEnlace")));
      return;
    }
    pintar(cont, idioma, datos);
  }

  return { empaquetar, desempaquetar, iniciar };
})();
