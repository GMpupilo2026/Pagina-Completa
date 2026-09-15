/**
 * Ajedrez Integral — cursos dentro de Academia (cursos/academia/<curso>.html).
 *
 * La página pública de cada curso (cursos/<curso>.html) muestra solo el
 * temario y una invitación a inscribirse. Esta es la otra cara: la versión
 * del panel de Academia, que exige sesión iniciada y carga el contenido
 * completo (cursos/protegido/<curso>.html) con:
 *
 *  - una línea de progreso (cuántas lecciones van estudiadas, barra y un
 *    paso por lección) y un botón "Continuar" que abre la siguiente;
 *  - las lecciones bloqueadas en orden: cada una se abre solo cuando la
 *    anterior quedó marcada como estudiada (la primera siempre está abierta);
 *  - al final de cada lección, el botón "Marcar lección como estudiada". En
 *    las lecciones que traen cuestionario (Partidas modelo, Desequilibrios de
 *    material) el botón se activa después de comprobar las respuestas.
 *
 * Cada lección estudiada se guarda en Supabase, tabla training_progress, con
 * activity "curso" y detail { curso, curso_titulo, leccion, n, titulo, total },
 * que es lo que lee Informes para que el profesor vea hasta dónde llegó cada
 * alumno. El mismo archivo atiende el catálogo (cursos/academia/index.html,
 * <main data-academia-catalogo>): rellena la barra de progreso de cada curso.
 *
 * Requiere window.sb (js/supabase-client.js). Los visores de los cursos
 * interactivos (window.Finales100, window.CursoPartidas) se inician igual que
 * en la página pública de antes; el cuestionario avisa con el evento
 * "cp:progreso" cuando se comprobó.
 */
(function () {
  "use strict";

  var body = document.getElementById("course-content-body");
  var catalogo = document.querySelector("[data-academia-catalogo]");
  if (!body && !catalogo) return;

  function sb() { return window.sb; }

  // Ruta de vuelta para login.html?next=… (solo rutas propias del sitio).
  function rutaActual() {
    var m = location.pathname.match(/cursos\/academia\/[a-z0-9\-]+\.html$/);
    return m ? m[0] : "cursos/academia/index.html";
  }
  function irALogin() { location.replace("../../login.html?next=" + encodeURIComponent(rutaActual())); }

  async function sesion() {
    if (!sb() || !sb().auth) return null;
    try { var r = await sb().auth.getSession(); return r && r.data ? r.data.session : null; } catch (e) { return null; }
  }

  // Filas de "curso" del alumno: { slug: { key: fecha } }
  async function progresoCursos(uid) {
    var out = {};
    try {
      var r = await sb().from("training_progress").select("detail,created_at").eq("student_id", uid).eq("activity", "curso");
      (r && r.data ? r.data : []).forEach(function (row) {
        var d = row.detail || {};
        if (!d.curso || !d.leccion) return;
        var c = out[d.curso] = out[d.curso] || {};
        if (!c[d.leccion] || row.created_at < c[d.leccion]) c[d.leccion] = row.created_at;
      });
    } catch (e) { /* sin conexión: el curso se puede leer igual, sin progreso */ }
    return out;
  }

  function fechaCorta(iso) {
    try { return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return ""; }
  }
  function pct(n, t) { return t ? Math.round((100 * n) / t) : 0; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- catálogo: barra de progreso por curso ----------
  async function catalogoInit() {
    var s = await sesion();
    if (!s) { irALogin(); return; }
    var prog = await progresoCursos(s.user.id);
    catalogo.querySelectorAll("[data-curso]").forEach(function (card) {
      var slug = card.dataset.curso, total = parseInt(card.dataset.total, 10) || 0;
      var hechas = Object.keys(prog[slug] || {}).length;
      var p = pct(hechas, total);
      var box = card.querySelector(".ac-card-prog");
      if (!box) return;
      box.innerHTML = "";
      var head = el("div", "ac-card-txt");
      head.textContent = hechas ? hechas + " de " + total + " temas · " + p + " %" : "Sin empezar · " + total + " temas";
      var track = el("div", "ac-track"); track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", String(total)); track.setAttribute("aria-valuenow", String(hechas));
      track.setAttribute("aria-valuetext", hechas + " de " + total + " temas estudiados");
      var fill = el("div", "ac-fill"); fill.style.width = p + "%"; track.appendChild(fill);
      box.append(head, track);
      var link = card.querySelector(".ac-card-link");
      if (link) link.textContent = hechas >= total && total ? "Repasar el curso →" : hechas ? "Continuar →" : "Empezar →";
      card.classList.toggle("ac-completo", total > 0 && hechas >= total);
    });
    catalogo.classList.add("ac-listo");
  }

  // ---------- página de un curso ----------
  var slug, titulo, uid, lecciones = [], hechas = {}, prog, live;

  function leccionesDe(root) {
    return Array.from(root.querySelectorAll("details")).filter(function (d) {
      return !(d.parentElement && d.parentElement.closest("details")) && d.querySelector(":scope > summary");
    });
  }
  function tituloDe(d) {
    var s = d.querySelector(":scope > summary");
    return (s ? s.textContent : "").replace(/\s+/g, " ").trim();
  }
  function tieneCuestionario(d) { return !!d.querySelector(".cp-quiz[data-id]"); }
  function cuestionarioHecho(d) {
    var q = d.querySelector(".cp-quiz[data-id]");
    if (!q) return true;
    if (q.dataset.acHecho === "1") return true;
    try {
      var p = window.CursoPartidas && window.CursoPartidas.progreso ? window.CursoPartidas.progreso() : JSON.parse(localStorage.getItem("cp:" + slug) || "{}");
      var rec = p[q.dataset.id];
      return !!(rec && rec.tipo === "quiz");
    } catch (e) { return false; }
  }

  function anunciar(msg) { if (live) { live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 30); } }

  function estado(i) {
    var L = lecciones[i];
    if (hechas[L.key]) return "hecha";
    if (i === 0 || hechas[lecciones[i - 1].key]) return "disponible";
    return "bloqueada";
  }

  function aplicarEstados() {
    lecciones.forEach(function (L, i) {
      var st = estado(i), d = L.el, sum = d.querySelector(":scope > summary");
      d.classList.toggle("ac-bloqueada", st === "bloqueada");
      d.classList.toggle("ac-hecha", st === "hecha");
      var mark = sum.querySelector(".ac-marca");
      if (!mark) { mark = el("span", "ac-marca"); mark.setAttribute("aria-hidden", "true"); sum.insertBefore(mark, sum.firstChild); }
      mark.textContent = st === "hecha" ? "✔ " : st === "bloqueada" ? "🔒 " : "";
      if (st === "bloqueada") {
        d.open = false;
        sum.setAttribute("aria-disabled", "true");
        sum.setAttribute("aria-label", L.titulo + " — bloqueada: primero marca como estudiada " + lecciones[i - 1].titulo);
        sum.title = "Bloqueada hasta que marques como estudiada la lección anterior";
      } else {
        sum.removeAttribute("aria-disabled"); sum.removeAttribute("aria-label"); sum.removeAttribute("title");
        if (st === "hecha") sum.setAttribute("aria-label", L.titulo + " — estudiada");
      }
      pintarPie(L, i, st);
    });
    pintarProgreso();
  }

  function pintarPie(L, i, st) {
    var foot = L.el.querySelector(":scope > .ac-foot");
    if (!foot) { foot = el("div", "ac-foot"); L.el.appendChild(foot); }
    foot.innerHTML = "";
    if (st === "hecha") {
      foot.appendChild(el("span", "ac-estado ac-ok", "✔ Estudiada el " + fechaCorta(hechas[L.key])));
      if (i + 1 < lecciones.length) {
        var nx = el("button", "ac-btn ac-sec", "Siguiente tema →"); nx.type = "button";
        nx.addEventListener("click", function () { abrir(i + 1); });
        foot.appendChild(nx);
      }
      return;
    }
    var btn = el("button", "ac-btn", "✅ Marcar lección como estudiada"); btn.type = "button";
    var nota = el("span", "ac-estado"); nota.setAttribute("aria-live", "polite");
    if (tieneCuestionario(L.el) && !cuestionarioHecho(L.el)) {
      btn.disabled = true;
      nota.textContent = "Responde el cuestionario de la lección (Comprobar respuestas) para poder marcarla.";
    }
    btn.addEventListener("click", function () { marcar(i, btn, nota); });
    foot.append(btn, nota);
  }

  async function marcar(i, btn, nota) {
    var L = lecciones[i];
    if (hechas[L.key] || estado(i) === "bloqueada") return;
    if (tieneCuestionario(L.el) && !cuestionarioHecho(L.el)) { nota.textContent = "Primero comprueba las respuestas del cuestionario."; return; }
    btn.disabled = true; nota.textContent = "Guardando…";
    var detail = { curso: slug, curso_titulo: titulo, leccion: L.key, n: i + 1, titulo: L.titulo, total: lecciones.length };
    try {
      var r = await sb().from("training_progress").insert([{ student_id: uid, activity: "curso", detail: detail }]);
      if (r && r.error) throw r.error;
    } catch (e) {
      btn.disabled = false; nota.textContent = "No se pudo guardar el avance. Revisa tu conexión y vuelve a intentarlo.";
      return;
    }
    hechas[L.key] = new Date().toISOString();
    try { localStorage.setItem("ac:" + slug, JSON.stringify(hechas)); } catch (e) {}
    aplicarEstados();
    var msg = "Tema " + (i + 1) + " estudiado. " + (i + 1 < lecciones.length ? "Se desbloqueó el tema " + (i + 2) + ": " + lecciones[i + 1].titulo : "¡Completaste el curso!");
    anunciar(msg);
    if (i + 1 < lecciones.length) abrir(i + 1);
  }

  function abrir(i) {
    var L = lecciones[i]; if (!L || estado(i) === "bloqueada") return;
    L.el.open = true;
    var sum = L.el.querySelector(":scope > summary");
    L.el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (sum) { sum.setAttribute("tabindex", "-1"); sum.focus({ preventScroll: true }); }
  }

  function siguientePendiente() {
    for (var i = 0; i < lecciones.length; i++) if (estado(i) === "disponible") return i;
    return -1;
  }

  function pintarProgreso() {
    if (!prog) return;
    var n = lecciones.filter(function (L) { return hechas[L.key]; }).length, t = lecciones.length, p = pct(n, t);
    prog.innerHTML = "";
    var head = el("div", "ac-prog-head");
    var txt = el("p", "ac-prog-txt");
    txt.innerHTML = "<strong>" + n + " de " + t + "</strong> temas estudiados · " + p + " %";
    head.appendChild(txt);
    var sig = siguientePendiente();
    if (sig >= 0) {
      var b = el("button", "ac-btn", (n ? "Continuar: " : "Empezar: ") + lecciones[sig].titulo); b.type = "button";
      b.addEventListener("click", function () { abrir(sig); });
      head.appendChild(b);
    } else if (t && n >= t) {
      head.appendChild(el("span", "ac-estado ac-ok", "🏁 Curso completo"));
    }
    var track = el("div", "ac-track"); track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", String(t)); track.setAttribute("aria-valuenow", String(n));
    track.setAttribute("aria-valuetext", n + " de " + t + " temas estudiados");
    var fill = el("div", "ac-fill"); fill.style.width = p + "%"; track.appendChild(fill);
    var pasos = el("ol", "ac-pasos"); pasos.setAttribute("aria-label", "Temas del curso");
    lecciones.forEach(function (L, i) {
      var st = estado(i), li = el("li", "ac-paso ac-" + st);
      var a = el("a", null, String(i + 1)); a.href = "#" + L.el.id;
      a.setAttribute("aria-label", "Tema " + (i + 1) + ": " + L.titulo + " — " + (st === "hecha" ? "estudiada" : st === "disponible" ? "disponible" : "bloqueada"));
      a.title = L.titulo;
      a.addEventListener("click", function (ev) { ev.preventDefault(); if (st === "bloqueada") anunciar("El tema " + (i + 1) + " está bloqueado: primero marca como estudiada la anterior."); else abrir(i); });
      li.appendChild(a); pasos.appendChild(li);
    });
    prog.append(head, track, pasos);
  }

  function prepararLecciones() {
    lecciones = leccionesDe(body).map(function (d, i) {
      if (!d.id) d.id = "lec-" + (i + 1);
      return { el: d, key: d.id, titulo: tituloDe(d) };
    });
    // Un <details> bloqueado no se abre ni con clic ni con teclado.
    body.addEventListener("click", function (ev) {
      var sum = ev.target.closest("summary"); if (!sum) return;
      var d = sum.parentElement; if (!d || !d.classList.contains("ac-bloqueada")) return;
      ev.preventDefault();
      var i = lecciones.findIndex(function (L) { return L.el === d; });
      anunciar("Este tema está bloqueado. Primero marca como estudiado el tema " + i + ": " + lecciones[i - 1].titulo + ".");
    });
    body.addEventListener("toggle", function (ev) {
      var d = ev.target; if (d.tagName === "DETAILS" && d.classList.contains("ac-bloqueada") && d.open) d.open = false;
    }, true);
    // Cuestionario comprobado → se activa el botón de esa lección.
    document.addEventListener("cp:progreso", function (ev) {
      var det = ev.detail || {}; if (!det.rec || det.rec.tipo !== "quiz") return;
      var q = body.querySelector('.cp-quiz[data-id="' + det.id + '"]'); if (!q) return;
      q.dataset.acHecho = "1";
      var i = lecciones.findIndex(function (L) { return L.el.contains(q); });
      if (i >= 0 && !hechas[lecciones[i].key]) pintarPie(lecciones[i], i, estado(i));
    });
  }

  async function cursoInit() {
    slug = body.dataset.course; titulo = body.dataset.titulo || document.title.replace(/\s+—.*$/, "");
    var s = await sesion();
    if (!s) { irALogin(); return; }
    uid = s.user.id;
    prog = document.getElementById("ac-progreso");
    live = document.getElementById("ac-avisos");
    var html;
    try {
      var r = await fetch("../protegido/" + slug + ".html", { credentials: "same-origin" });
      if (!r.ok) throw new Error("no_content");
      html = await r.text();
    } catch (e) {
      body.innerHTML = '<p class="text-sm text-red-500">No se pudo cargar el contenido de las lecciones. Recarga la página.</p>';
      return;
    }
    body.innerHTML = html;
    if (window.Finales100) window.Finales100.init(body);
    if (window.CursoPartidas) window.CursoPartidas.init(body);
    document.dispatchEvent(new CustomEvent("curso:contenido", { detail: { body: body, curso: slug } }));
    prepararLecciones();
    var todo = await progresoCursos(uid);
    hechas = todo[slug] || {};
    aplicarEstados();
    // #lec-… en la dirección: se abre si está disponible; si no, se va a la siguiente pendiente.
    var pedido = location.hash && location.hash.indexOf("#") === 0 ? location.hash.slice(1) : null;
    var idx = pedido ? lecciones.findIndex(function (L) { return L.el.id === pedido; }) : -1;
    if (idx >= 0 && estado(idx) !== "bloqueada") abrir(idx);
  }

  if (catalogo) catalogoInit(); else cursoInit();
})();
