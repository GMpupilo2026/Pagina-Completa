/* Las salas de torneos transmitidos: una sola copia de cómo se leen y cómo se
 * pinta su ficha. La usan torneos-en-vivo.html (las fichas), transmision.html
 * (la sala de cine busca su torneo por la clave) y admin.html#torneos (el
 * editor, que muestra la misma ficha como vista previa).
 *
 * Las salas viven en la tabla salas_torneo: la lee cualquiera (las visibles)
 * y la escribe solo quien administra. Ver «Las salas de torneos se editan en
 * administración» en docs/decisiones/juegos-y-torneos.md.
 *
 *   SalasTorneo.listar()            → las salas, en su orden (las visibles, o
 *                                     todas si quien pregunta administra)
 *   SalasTorneo.porClave(clave)     → una sala, o null
 *   SalasTorneo.ficha(sala)         → el <li> de la ficha (DOM, sin innerHTML)
 *   SalasTorneo.idDeLichess(texto)  → el id de 8 letras de una dirección de
 *                                     Lichess, y si es de torneo o de ronda
 */
(function () {
  "use strict";

  const COLUMNAS = "id, clave, nombre, descripcion, emoji, tipo, lichess_id, enlaces, pizarras, visible, orden";

  async function listar() {
    const { data, error } = await sb.from("salas_torneo").select(COLUMNAS)
      .order("orden", { ascending: true }).order("nombre", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function porClave(clave) {
    const { data, error } = await sb.from("salas_torneo").select(COLUMNAS).eq("clave", clave).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  // lichess.org/broadcast/<torneo>/<id>          → el id del torneo
  // lichess.org/broadcast/<torneo>/<ronda>/<id>  → el id de UNA ronda (hay que
  //                                               preguntarle a Lichess de qué torneo es)
  // o el id suelto, de 8 letras y números.
  function idDeLichess(texto) {
    const t = String(texto || "").trim();
    if (/^[A-Za-z0-9]{8}$/.test(t)) return { id: t, es: "torneo" };
    let u;
    try { u = new URL(t); } catch (e) { return null; }
    if (!/(^|\.)lichess\.org$/.test(u.hostname)) return null;
    const partes = u.pathname.split("/").filter(Boolean);
    if (partes[0] !== "broadcast") return null;
    const ultimo = partes[partes.length - 1];
    if (!/^[A-Za-z0-9]{8}$/.test(ultimo)) return null;
    if (partes.length === 3) return { id: ultimo, es: "torneo" };
    if (partes.length === 4) return { id: ultimo, es: "ronda", ruta: "/" + partes.map(encodeURIComponent).join("/") };
    return null;
  }

  const CLASE_BOTON = "block text-center bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";
  const CLASE_SECUNDARIO = "block text-center text-sm text-brand-500 dark:text-brand-300 underline underline-offset-2 hover:text-accent-700 dark:hover:text-accent-400 mt-3 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function enlaceAfuera(enlace, clase, nombreSala) {
    const a = el("a", clase, enlace.texto);
    a.href = enlace.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.appendChild(el("span", "sr-only", " de " + nombreSala + " (se abre en otra pestaña)"));
    a.appendChild(document.createTextNode(" ↗"));
    return a;
  }

  // La ficha, igual en la página pública y en la vista previa del editor (que
  // la pone dentro de una caja `inert`: se ve, pero no se sigue ni se enfoca).
  function ficha(sala) {
    const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-6 flex flex-col");
    li.dataset.sala = sala.clave || "";
    const emoji = el("p", "text-4xl mb-3", sala.emoji || "🏆");
    emoji.setAttribute("aria-hidden", "true");
    li.appendChild(emoji);
    li.appendChild(el("h2", "font-serif text-xl font-bold text-brand-800 dark:text-white", sala.nombre || "Sin nombre"));
    li.appendChild(el("p", "text-brand-500 dark:text-brand-300 mt-2 mb-5 flex-1", sala.descripcion || ""));
    const enlaces = Array.isArray(sala.enlaces) ? sala.enlaces : [];
    if (sala.tipo === "lichess") {
      const a = el("a", CLASE_BOTON, "Entrar a la sala");
      a.href = "transmision.html?torneo=" + encodeURIComponent(sala.clave || "");
      a.appendChild(el("span", "sr-only", " de " + sala.nombre));
      a.appendChild(document.createTextNode(" →"));
      li.appendChild(a);
      enlaces.forEach((e) => li.appendChild(enlaceAfuera(e, CLASE_SECUNDARIO, sala.nombre)));
    } else {
      const caja = el("div", "grid grid-cols-1 " + (enlaces.length > 1 ? "sm:grid-cols-2 " : "") + "gap-3");
      enlaces.forEach((e) => caja.appendChild(enlaceAfuera(e, CLASE_BOTON, sala.nombre)));
      li.appendChild(caja);
    }
    return li;
  }

  window.SalasTorneo = { listar, porClave, ficha, idDeLichess };
})();
