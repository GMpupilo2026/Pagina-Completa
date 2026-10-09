/* ===== Ajedrez Integral — Las bromas entre compañeros =====
 *
 * Lo que se ve de una broma que un compañero compró con sus Puntos Ajedrez
 * (puntos-tienda.html). Son inofensivas, visuales, se van solas y SIEMPRE
 * dicen quién las mandó:
 *
 *   confeti   la próxima vez que entra a su panel, cae confeti (una vez).
 *   globo     en el panel, un globo con una frase de la lista (una vez).
 *   patito    una hora: un patito cruza la pantalla de Entrenamiento de vez
 *             en cuando.
 *   arcoiris  una hora: las casillas de los tableros de Entrenamiento
 *             cambian de color (con el mismo contraste que el tablero de
 *             siempre: los colores están medidos en css/styles.css).
 *   payaso    un día: un gorro de payaso sobre su foto. Ese no lo pinta este
 *             archivo: sale de accesorios_de() en la base, que lo ve también
 *             el profe en «Alumnos conectados». Acá solo se le avisa a quien
 *             lo tiene puesto.
 *
 * Quién puede recibir qué lo decide la base (mandar_broma): nunca a quien
 * tiene marcada su visión, ni a quien las apagó, bloqueó a quien manda o
 * tiene un profe que las apagó en su clase. Esta página solo cuida dónde: la
 * pone herramientas/academia-cabecera.py en el panel, la tienda y las páginas
 * de Entrenamiento — nunca en un examen, en la clase en vivo ni en un torneo.
 * Y cómo: con Modo Adaptado o el panel para quien no ve no se pinta nada, y
 * con «menos movimiento» del sistema no se mueve nada (queda el aviso).
 *
 * Ver «Retos, marcador, regalos y bromas» en docs/decisiones/puntos-y-premios.md.
 */
window.Bromas = (function () {
  "use strict";

  const RUTA = location.pathname;
  const EN_ENTRENO = /\/entreno\//.test(RUTA);
  const EN_PANEL = /\/(clases|puntos-tienda)(\.html)?$/.test(RUTA);
  const CLAVE_VISTAS = "bromas_avisadas_v1";
  const HORA = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", hour: "numeric", minute: "2-digit" });
  const DIA_HORA = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", weekday: "long", hour: "numeric", minute: "2-digit" });

  let sb = null;
  let zona = null;
  const relojes = [];

  function apagadas() {
    const h = document.documentElement.classList;
    return h.contains("modo-ciego") || h.contains("adaptive-mode");
  }
  function quieto() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }

  // Lo ya avisado en este aparato, para no repetir el aviso de una broma de
  // una hora en cada página que abre.
  function yaAvisada(id) {
    try { return (JSON.parse(localStorage.getItem(CLAVE_VISTAS) || "[]")).includes(id); } catch (e) { return false; }
  }
  function marcarAvisada(id) {
    try {
      const l = JSON.parse(localStorage.getItem(CLAVE_VISTAS) || "[]").filter((x) => x !== id);
      l.push(id);
      localStorage.setItem(CLAVE_VISTAS, JSON.stringify(l.slice(-30)));
    } catch (e) { /* sin almacenamiento: se vuelve a avisar, nada más */ }
  }

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /* El aviso: abajo a la izquierda, se anuncia (role="status"), se cierra con
     ✕ y se va solo a los 10 segundos. Propio y no el de js/avisos.js porque
     las páginas de Entrenamiento no lo cargan. */
  function avisar(emoji, texto) {
    if (!zona) {
      zona = el("div", "fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-[90] space-y-2");
      zona.setAttribute("role", "status");
      zona.setAttribute("aria-live", "polite");
      zona.setAttribute("data-bromas-avisos", "");
      document.body.appendChild(zona);
    }
    const caja = el("div", "flex items-start gap-3 rounded-xl shadow-lg px-4 py-3 bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 text-sm text-brand-800 dark:text-white");
    caja.setAttribute("data-broma-aviso", "");
    const ic = el("span", "text-xl leading-none", emoji);
    ic.setAttribute("aria-hidden", "true");
    const t = el("p", "flex-1 min-w-0 break-words", texto);
    const x = el("button", "shrink-0 rounded px-1 text-brand-600 dark:text-brand-300 hover:text-brand-800 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Cerrar el aviso de la broma");
    x.addEventListener("click", () => caja.remove());
    caja.append(ic, t, x);
    zona.appendChild(caja);
    setTimeout(() => caja.remove(), 10000);
  }

  // Una capa encima de todo que no se puede tocar ni leer: solo adorno.
  function capa() {
    const c = el("div", "fixed inset-0 overflow-hidden pointer-events-none z-[80]");
    c.setAttribute("aria-hidden", "true");
    c.setAttribute("data-broma-capa", "");
    document.body.appendChild(c);
    return c;
  }

  function confeti(b) {
    avisar("🎉", b.de_nombre + " te mandó una lluvia de confeti.");
    if (quieto()) return;
    const c = capa();
    const figuras = ["🎉", "🎊", "✨", "⭐", "♟️"];
    for (let i = 0; i < 36; i++) {
      const s = el("span", "broma-confeti", figuras[i % figuras.length]);
      s.style.left = Math.round(Math.random() * 96) + "%";
      s.style.animationDelay = (Math.random() * 1.5).toFixed(2) + "s";
      s.style.animationDuration = (2.5 + Math.random() * 1.5).toFixed(2) + "s";
      c.appendChild(s);
    }
    setTimeout(() => c.remove(), 5000);
  }

  function globo(b) {
    avisar("🎈", b.de_nombre + " te mandó un globo: «" + (b.frase || "¡Hola!") + "»");
    if (quieto()) return;
    const c = capa();
    const g = el("span", "broma-globo", "🎈");
    g.style.left = (20 + Math.round(Math.random() * 60)) + "%";
    c.appendChild(g);
    setTimeout(() => c.remove(), 6000);
  }

  function hasta(b) { return HORA.format(new Date(b.vence_at)); }
  function quedaMs(b) { return new Date(b.vence_at).getTime() - Date.now(); }

  function patito(b) {
    if (!yaAvisada(b.id)) {
      avisar("🦆", b.de_nombre + " te mandó un patito: va a cruzar tu pantalla de vez en cuando hasta las " + hasta(b) + ".");
      marcarAvisada(b.id);
    }
    if (quieto()) return;
    const cruzar = () => {
      if (quedaMs(b) <= 0 || document.hidden) return;
      const c = capa();
      const p = el("span", "broma-patito", "🦆");
      p.style.top = (15 + Math.round(Math.random() * 65)) + "%";
      c.appendChild(p);
      setTimeout(() => c.remove(), 7000);
    };
    setTimeout(cruzar, 4000);
    const r = setInterval(() => { if (quedaMs(b) <= 0) clearInterval(r); else cruzar(); }, 45000);
    relojes.push(r);
  }

  function arcoiris(b) {
    if (!yaAvisada(b.id)) {
      avisar("🌈", b.de_nombre + " te pintó el tablero de arcoíris hasta las " + hasta(b) + ".");
      marcarAvisada(b.id);
    }
    document.documentElement.classList.add("broma-arcoiris");
    setTimeout(() => document.documentElement.classList.remove("broma-arcoiris"), Math.max(0, quedaMs(b)));
  }

  function payaso(b) {
    if (yaAvisada(b.id)) return;
    avisar("🤡", b.de_nombre + " te puso un gorro de payaso: lo ven tu profe y tus compañeros hasta el " + DIA_HORA.format(new Date(b.vence_at)) + ".");
    marcarAvisada(b.id);
  }

  async function vista(id) {
    try { await sb.rpc("broma_vista", { p_id: id }); } catch (e) { /* se vuelve a mostrar la próxima vez */ }
  }

  async function revisar() {
    if (!sb || apagadas()) return;
    let bromas = [];
    try {
      const r = await sb.rpc("mis_bromas");
      if (!r || r.error || !Array.isArray(r.data)) return;
      bromas = r.data;
    } catch (e) { return; }
    bromas.forEach((b) => {
      if (EN_PANEL && b.tipo === "confeti") { confeti(b); vista(b.id); }
      else if (EN_PANEL && b.tipo === "globo") { globo(b); vista(b.id); }
      else if (EN_PANEL && b.tipo === "payaso") payaso(b);
      else if (EN_ENTRENO && b.tipo === "patito") patito(b);
      else if (EN_ENTRENO && b.tipo === "arcoiris") arcoiris(b);
    });
  }

  async function autoIniciar() {
    if (!EN_PANEL && !EN_ENTRENO) return;
    const cliente = window.sb;
    if (!cliente || !cliente.auth || typeof cliente.rpc !== "function") return;
    try {
      const r = await cliente.auth.getSession();
      if (!r || !r.data || !r.data.session) return;
    } catch (e) { return; }
    sb = cliente;
    revisar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoIniciar);
  else autoIniciar();

  return { revisar };
})();
