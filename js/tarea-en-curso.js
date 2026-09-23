/* ===== La tarea, dentro del ejercicio =====
 *
 * Cuando el alumno entra a una página de Entrenamiento desde un renglón de su
 * tarea, el enlace trae `?tarea=<id>`. Este archivo pone arriba una franja que
 * dice qué le pidieron y cuánto lleva —"Resolver 10 ejercicios de Ataque a la
 * última línea · 4 de 10"— y avisa cuando llega.
 *
 * Por qué hace falta, si la tarea ya se ve en tareas.html: porque el alumno
 * está ACÁ, resolviendo. Sin esta franja tendría que volver a Tareas a mirar
 * si ya hizo los diez, y lo más probable es que no vuelva: haría siete, o
 * veinte. Contar de cabeza mientras se resuelve es justo lo que no debe
 * ocupar la cabeza.
 *
 * Lo que NO hace, a propósito: llevar su propia cuenta. El número sale de
 * public.tareas_con_avance(), la misma función que pinta tareas.html y el
 * panel. Un contador propio acá se separaría del de allá a la primera
 * corrección, y eso no daría ningún error — dos pantallas diciendo cosas
 * distintas sobre lo mismo.
 *
 * Uso — una línea en cualquier página de Entrenamiento, después de que ya
 * exista `sb` (js/supabase-client.js):
 *     <script src="js/tarea-en-curso.js" defer></script>
 * Sin `?tarea=` en la dirección no hace absolutamente nada, así que ponerlo
 * en una página de más no cuesta nada.
 */
(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const tareaId = params.get("tarea");
  if (!tareaId) return;          // no se vino desde una tarea: nada que decir

  // Desde una subcarpeta (entreno/) hay que subir para llegar a tareas.html.
  const RAIZ = /\/entreno\//.test(location.pathname) ? "../" : "";

  let caja = null;
  let renglon = null;
  let yaAvisado = false;

  function esperarSb() {
    return new Promise((resolve) => {
      if (window.sb) return resolve(true);
      let intentos = 0;
      const t = setInterval(() => {
        if (window.sb || ++intentos > 40) { clearInterval(t); resolve(!!window.sb); }
      }, 100);
    });
  }

  /* Cuál de los renglones de la tarea es el de ESTA página. Se compara por el
     archivo del enlace y, si el renglón trae recorte, por el recorte que hay
     en la dirección: una tarea puede pedir mates en 1 y mates en 2, y la
     franja tiene que hablar del que se está haciendo. */
  function renglonDeEstaPagina(items) {
    const archivo = location.pathname.split("/").pop() || "";
    const candidatos = (items || []).filter((r) => {
      const suyo = String(r.material_href || "").split("?")[0].split("/").pop();
      return suyo && suyo === archivo;
    });
    if (candidatos.length < 2) return candidatos[0] || null;
    const conFiltro = candidatos.find((r) => {
      if (!r.filtro_clave) return false;
      for (const v of params.values()) if (v === r.filtro_clave) return true;
      return false;
    });
    return conFiltro || candidatos[0];
  }

  function montar() {
    if (caja) return caja;
    caja = document.createElement("div");
    caja.id = "tarea-en-curso";
    caja.setAttribute("role", "status");
    caja.setAttribute("aria-live", "polite");
    caja.className = "tarea-en-curso";
    const destino = document.querySelector("main") || document.body;
    destino.insertBefore(caja, destino.firstChild);
    return caja;
  }

  function pintar(tarea) {
    if (!renglon) return;
    const meta = renglon.meta_tipo === "completar" ? 1 : renglon.meta_cantidad;
    const hecho = Math.min(Number(renglon.hecho) || 0, meta);
    const pct = meta ? Math.min(100, Math.round((100 * hecho) / meta)) : 0;
    const listo = !!renglon.cumplido;
    const unidad = renglon.meta_tipo === "minutos" ? "minutos" : "";

    const c = montar();
    c.classList.toggle("tarea-lista", listo);
    c.innerHTML =
      '<div class="tarea-en-curso-fila">' +
        '<span class="tarea-en-curso-icono" aria-hidden="true">' + (listo ? "✅" : "📋") + "</span>" +
        '<div class="tarea-en-curso-texto">' +
          '<strong>' + (listo ? "¡Listo! Ya hiciste lo que te pidieron." : escapar(tarea.titulo)) + "</strong>" +
          '<span class="tarea-en-curso-detalle">' +
            escapar(renglon.filtro_label || renglon.material_label) + " · " +
            hecho + " de " + meta + (unidad ? " " + unidad : "") +
          "</span>" +
        "</div>" +
        '<a class="tarea-en-curso-volver" href="' + RAIZ + 'tareas.html">Ver mi tarea</a>' +
      "</div>" +
      '<div class="tarea-en-curso-barra"><i style="width:' + pct + '%"></i></div>';

    // El aviso de llegada se dice UNA vez: repetirlo en cada ejercicio de más
    // sería un cartel que se deja de leer, la lección que dejó el de instalar
    // la app. Quien quiera seguir resolviendo, sigue.
    if (listo && !yaAvisado) {
      yaAvisado = true;
      if (window.BlindNotation && typeof window.BlindNotation.speak === "function") {
        try { window.BlindNotation.speak("Terminaste lo que te pidieron en la tarea."); } catch (e) {}
      }
    }
  }

  function escapar(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function refrescar() {
    try {
      const { data: s } = await window.sb.auth.getSession();
      if (!s || !s.session) return;
      const { data, error } = await window.sb.rpc("tareas_con_avance", {
        p_alumno: s.session.user.id,
      });
      if (error || !data) return;
      const tarea = data.find((t) => t.id === tareaId);
      if (!tarea) return;
      renglon = renglonDeEstaPagina(tarea.items);
      if (!renglon) return;
      pintar(tarea);
    } catch (e) {
      /* Sin red o sin sesión la franja no aparece y el ejercicio funciona
         igual: es un acompañamiento, no una condición para entrenar. */
    }
  }

  /* Cuándo se vuelve a contar: justo después de que la página registre un
     avance. Se envuelve EntrenoProgress.log() en vez de preguntar cada pocos
     segundos — así el número sube al resolver, que es cuando se está mirando,
     y no se le pide nada a la base mientras el alumno piensa. */
  function engancharAlProgreso() {
    const EP = window.EntrenoProgress;
    if (!EP || EP.__tareaEnganchada) return false;
    const original = EP.log;
    EP.log = function () {
      const r = original.apply(this, arguments);
      Promise.resolve(r).then(() => refrescar()).catch(() => {});
      return r;
    };
    EP.__tareaEnganchada = true;
    return true;
  }

  async function arrancar() {
    if (!(await esperarSb())) return;
    await refrescar();
    // EntrenoProgress puede cargarse después que este archivo; se reintenta un
    // rato y se deja de insistir. Sin el enganche la franja igual se ve, solo
    // que con el número de cuando se entró.
    if (!engancharAlProgreso()) {
      let intentos = 0;
      const t = setInterval(() => {
        if (engancharAlProgreso() || ++intentos > 40) clearInterval(t);
      }, 250);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar);
  } else {
    arrancar();
  }
})();
