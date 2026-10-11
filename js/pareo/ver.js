/* El enlace y el QR de solo lectura de pareo.html, en dos versiones (ver «El
 * enlace y el QR de solo lectura» y «El canal en vivo» en
 * docs/decisiones/juegos-y-torneos.md).
 *
 * `#ver=<datos>`: una «foto» de una ronda y la clasificación de ese momento,
 * para ver desde el celular sin tocar nada. Nunca pasa por un servidor:
 * viaja comprimida en el fragmento de la URL (después del «#», que el
 * navegador no manda a nadie).
 *
 * `#vivo=<código>`: lo mismo, pero actualizándose sola mientras quien
 * organiza tenga la pestaña abierta. Acá SÍ hay servidor —la primera vez que
 * Pareo Integral toca uno, a propósito, con el visto bueno del dueño del
 * repo—: un canal de Supabase Realtime en modo Broadcast, efímero y sin
 * tabla (nada se guarda ni ahí), público por default en este proyecto.
 *
 * En los dos casos no se necesita el motor de emparejamiento ni el resto del
 * torneo: recibe ya armadas las filas que la pantalla (o el PDF) ya pintó.
 */
window.PareoVer = (function () {
  "use strict";

  const X = window.PareoTextos;

  let cargaSupabase = null;
  function cargarSupabase() {
    if (window.sb) return Promise.resolve();
    if (!cargaSupabase) {
      cargaSupabase = new Promise((listo, fallo) => {
        const s1 = document.createElement("script");
        s1.src = "js/vendor/supabase.js";
        s1.addEventListener("load", () => {
          const s2 = document.createElement("script");
          s2.src = "js/supabase-client.js";
          s2.addEventListener("load", listo);
          s2.addEventListener("error", () => { cargaSupabase = null; fallo(new Error("No cargó supabase-client.js")); });
          document.head.appendChild(s2);
        });
        s1.addEventListener("error", () => { cargaSupabase = null; fallo(new Error("No cargó la librería de Supabase")); });
        document.head.appendChild(s1);
      });
    }
    return cargaSupabase;
  }

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

  function pintar(cont, idioma, datos, enVivo) {
    const tx = (clave, vars) => X.t(idioma, clave, vars);
    const nodos = [
      el("h1", { class: "font-serif text-2xl font-bold mb-1" }, datos.nombre || "Pareo Integral"),
      el("p", { class: "text-sm text-brand-600 dark:text-brand-300 mb-6" }, tx(enVivo ? "verEnVivoLeyenda" : "verFotoDelMomento")),
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
    pintar(cont, idioma, datos, false);
  }

  async function iniciarVivo(codigo, idioma) {
    const cont = document.getElementById("pi-ver");
    const tx = (clave) => X.t(idioma, clave);
    cont.hidden = false;
    cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("conectandoEnVivo")));
    try {
      await cargarSupabase();
    } catch (e) {
      cont.replaceChildren(el("p", { class: "text-sm text-red-700 dark:text-red-300" }, tx("errorEnVivoVer")));
      return;
    }
    let llego = false;
    const canal = window.sb.channel("pareo-vivo-" + codigo);
    canal.on("broadcast", { event: "estado" }, (msg) => { llego = true; pintar(cont, idioma, msg.payload, true); });
    canal.subscribe();
    setTimeout(() => { if (!llego) cont.replaceChildren(el("p", { class: "text-sm text-brand-600 dark:text-brand-300" }, tx("esperandoVivo"))); }, 8000);
  }

  return { empaquetar, desempaquetar, cargarSupabase, iniciar, iniciarVivo };
})();
