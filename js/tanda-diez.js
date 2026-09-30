/**
 * Ajedrez Integral — «Entrenar 10 minutos».
 *
 * El botón de «Hoy te toca» arma una tanda con lo que toca hoy (hasta tres
 * cosas de su lista) y arranca una cuenta de 10 minutos: el alumno no tiene
 * que decidir por dónde empezar ni cuándo parar. Mientras dura, una barra
 * abajo dice cuánto queda, en qué paso va y lleva al siguiente, en la página
 * de la Academia que esté (la pone herramientas/academia-cabecera.py, menos en
 * examen.html). Al llegar a cero lo dice y se va.
 *
 * Es de ESTE aparato (localStorage): una tanda es de un rato y de una
 * pantalla. Si no hay almacenamiento, simplemente no arranca.
 *
 * Accesible: la barra es una región con nombre; el reloj cambia cada segundo
 * pero NO se anuncia (sería un parloteo): se anuncia el paso al llegar a la
 * página y el final, en un role="status". Ver «Entrenar 10 minutos» en
 * docs/decisiones/paneles.md.
 */
window.TandaDiez = (function () {
  "use strict";

  const CLAVE = "tanda_diez_v1";
  const DURACION_MS = 10 * 60 * 1000;
  const BTN = "rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  let reloj = null;

  function leer() {
    try {
      const t = JSON.parse(localStorage.getItem(CLAVE) || "null");
      return t && Array.isArray(t.pasos) && t.pasos.length && t.fin ? t : null;
    } catch (e) { return null; }
  }
  function guardar(t) { try { localStorage.setItem(CLAVE, JSON.stringify(t)); return true; } catch (e) { return false; } }
  function borrar() { try { localStorage.removeItem(CLAVE); } catch (e) {} }

  /* Pasos: [{ href, texto, icono }], con href relativo a la página que llama.
     Se guardan como dirección absoluta del sitio: la barra los abre desde
     cualquier carpeta. */
  function empezar(pasos) {
    const limpios = (pasos || []).filter((p) => p && p.href).slice(0, 3).map((p) => {
      const u = new URL(p.href, location.href);
      return { href: u.pathname + u.search, texto: String(p.texto || ""), icono: String(p.icono || "") };
    });
    if (!limpios.length) return false;
    if (!guardar({ inicio: Date.now(), fin: Date.now() + DURACION_MS, pasos: limpios, i: 0 })) return false;
    location.href = limpios[0].href;
    return true;
  }

  function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function pintar() {
    const t = leer();
    let barra = document.getElementById("tanda-diez");
    // Una tanda que ya venció mientras no estaba (cerró la pestaña) no se muestra.
    if (t && t.fin <= Date.now()) { borrar(); if (barra) barra.remove(); return; }
    if (!t) { if (barra) barra.remove(); if (reloj) clearInterval(reloj); return; }
    // El paso en que va: el de esta página si está en la lista.
    const aqui = location.pathname + location.search;
    const j = t.pasos.findIndex((p) => p.href === aqui || p.href.split("?")[0] === location.pathname);
    if (j >= 0 && j !== t.i) { t.i = j; guardar(t); }

    if (!barra) {
      barra = el("div", "fixed z-[70] bottom-4 left-3 right-20 sm:right-auto sm:max-w-sm rounded-2xl shadow-xl bg-brand-900 text-white p-3 text-sm");
      barra.id = "tanda-diez";
      barra.setAttribute("role", "region");
      barra.setAttribute("aria-label", "Tanda de 10 minutos");
      document.body.appendChild(barra);
    }
    barra.replaceChildren();
    const arriba = el("div", "flex items-center gap-2");
    const cuenta = el("span", "font-bold tabular-nums", "⏱️ " + mmss(t.fin - Date.now()));
    cuenta.dataset.tandaReloj = "";
    cuenta.setAttribute("aria-hidden", "true");
    const paso = el("span", "truncate", "Paso " + (t.i + 1) + " de " + t.pasos.length + ": " + t.pasos[t.i].texto);
    paso.setAttribute("role", "status");
    arriba.append(cuenta, paso);
    const abajo = el("div", "mt-2 flex flex-wrap items-center gap-2");
    const sig = t.pasos[t.i + 1];
    if (sig) {
      const a = el("a", BTN + " bg-accent-500 hover:bg-accent-600 text-brand-900", "Siguiente: " + sig.texto + " →");
      a.href = sig.href;
      a.dataset.tandaSiguiente = "";
      a.addEventListener("click", () => { t.i += 1; guardar(t); });
      abajo.appendChild(a);
    }
    const salir = el("button", BTN + " border border-white/40 hover:bg-white/10", sig ? "Dejar la tanda" : "Terminar la tanda");
    salir.type = "button";
    salir.dataset.tandaSalir = "";
    salir.addEventListener("click", () => { borrar(); pintar(); });
    abajo.appendChild(salir);
    barra.append(arriba, abajo);

    if (reloj) clearInterval(reloj);
    reloj = setInterval(() => {
      const falta = t.fin - Date.now();
      if (falta > 0) { cuenta.textContent = "⏱️ " + mmss(falta); return; }
      clearInterval(reloj);
      borrar();
      barra.replaceChildren();
      const listo = el("p", "font-semibold", "¡Listo! Hiciste tus 10 minutos de entrenamiento.");
      listo.setAttribute("role", "status");
      const cerrar = el("button", BTN + " mt-2 bg-accent-500 hover:bg-accent-600 text-brand-900", "Cerrar");
      cerrar.type = "button";
      cerrar.addEventListener("click", () => barra.remove());
      barra.append(listo, cerrar);
    }, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar);
  else pintar();

  return { empezar, activa: () => !!leer(), CLAVE, DURACION_MS };
})();
