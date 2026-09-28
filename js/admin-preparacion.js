/* La preparación de rivales en admin.html#preparacion: a qué profesores se les
 * activa preparacion-rivales.html.
 *
 * La lista vive en preparacion_rivales_profesores, que no tiene política de
 * escritura: la escribe activar_preparacion_rivales(), que valida que quien
 * llama administre y que la cuenta sea de un profesor, y devuelve cómo quedó.
 * El interruptor se pinta con lo que devuelve la base, no con lo que se pidió.
 * Ver «La preparación de rivales» en docs/decisiones/paneles.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let cuentas = () => [];
  let activos = new Set();
  let cargado = false;

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function sinTildes(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function profesores() {
    return cuentas().filter((u) => u.role === "profesor")
      .sort((a, b) => String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), "es"));
  }

  function pintarResumen() {
    const lista = profesores();
    const n = lista.filter((u) => !u.is_admin && activos.has(u.id)).length;
    const total = lista.filter((u) => !u.is_admin).length;
    $("prep-resumen").textContent = n === 1
      ? "1 de " + total + " profesores la tiene activa"
      : n + " de " + total + " profesores la tienen activa";
  }

  function pintarInterruptor(b, activa) {
    b.setAttribute("aria-checked", activa ? "true" : "false");
    b.querySelector(".prep-texto").textContent = activa ? "Activa" : "Apagada";
    b.classList.toggle("bg-accent-500", activa);
    b.classList.toggle("text-brand-900", activa);
    b.classList.toggle("bg-brand-100", !activa);
    b.classList.toggle("dark:bg-brand-800", !activa);
    b.classList.toggle("text-brand-700", !activa);
    b.classList.toggle("dark:text-brand-200", !activa);
    b.querySelector(".prep-punto").textContent = activa ? "●" : "○";
  }

  async function cambiar(u, b) {
    const quiere = b.getAttribute("aria-checked") !== "true";
    b.disabled = true;
    try {
      const { data, error } = await sb.rpc("activar_preparacion_rivales", { p_profesor: u.id, p_activa: quiere });
      if (error) throw error;
      const quedo = data === true;
      if (quedo) activos.add(u.id); else activos.delete(u.id);
      pintarInterruptor(b, quedo);
      pintarResumen();
      const nombre = u.full_name || u.email || "El profesor";
      Avisos.avisar(quedo ? nombre + " ya puede preparar rivales." : nombre + " ya no puede preparar rivales nuevos.");
    } catch (e) {
      console.error(e);
      Avisos.avisar("No se pudo cambiar: " + (e.message || e), { tipo: "error" });
    } finally {
      b.disabled = false;
    }
  }

  function pintar() {
    if (!cargado) return;
    const q = sinTildes($("prep-buscar").value.trim());
    const lista = profesores().filter((u) => !q || sinTildes((u.full_name || "") + " " + (u.email || "")).includes(q));
    const ul = $("prep-lista");
    ul.textContent = "";
    $("prep-vacio").hidden = lista.length > 0;
    for (const u of lista) {
      const li = el("li", "flex flex-wrap items-center justify-between gap-3 py-3");
      const quien = el("div", "min-w-0");
      quien.appendChild(el("p", "font-semibold text-brand-800 dark:text-white truncate", u.full_name || u.email || "Sin nombre"));
      if (u.email) quien.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 truncate", u.email));
      li.appendChild(quien);
      if (u.is_admin) {
        li.appendChild(el("span", "text-xs font-semibold text-brand-500 dark:text-brand-300", "Siempre (administra)"));
      } else {
        const b = el("button", "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60 disabled:cursor-wait");
        b.type = "button";
        b.setAttribute("role", "switch");
        b.setAttribute("aria-label", "Preparación de rivales para " + (u.full_name || u.email || "este profesor"));
        b.appendChild(el("span", "prep-punto", ""));
        b.querySelector(".prep-punto").setAttribute("aria-hidden", "true");
        b.appendChild(el("span", "prep-texto", ""));
        pintarInterruptor(b, activos.has(u.id));
        b.addEventListener("click", () => cambiar(u, b));
        li.appendChild(b);
      }
      ul.appendChild(li);
    }
    pintarResumen();
  }

  async function cargar() {
    try {
      const { data, error } = await sb.from("preparacion_rivales_profesores").select("profesor_id");
      if (error) throw error;
      activos = new Set((data || []).map((r) => r.profesor_id));
    } catch (e) {
      console.error(e);
      $("prep-cargando").textContent = "No se pudo cargar quién la tiene activa. Vuelve a intentarlo recargando la página.";
      return;
    }
    cargado = true;
    $("prep-cargando").hidden = true;
    pintar();
  }

  function iniciar(obtenerCuentas) {
    cuentas = obtenerCuentas;
    $("prep-buscar").addEventListener("input", pintar);
    cargar();
  }

  window.AdminPreparacion = { iniciar, pintar };
})();
