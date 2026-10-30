/* Los casos del VAR para el curso de árbitros (arbitraje.html, «Casos del
 * VAR: ¿qué decides tú?»). Cada caso es un pedazo de video de una partida de
 * verdad —el que se bajó del VAR de la cámara de la mesa con «Guardar este
 * pedazo para el acta»—, con una pregunta, sus opciones, la respuesta, el
 * porqué y el artículo de las Leyes. Se mira el video (en pausa, más lento,
 * desde el segundo que importa), se elige y se ve si era eso.
 *
 * Quién: los ven profesores y quien administra (como el examen); los sube y
 * los borra solo quien administra. Lo decide la base (RLS de
 * `arbitraje_casos_var` y del bucket privado `arbitraje-var`), no esta
 * pantalla. El video se pide con una dirección firmada de una hora. Ver «Los
 * casos del VAR para el curso de árbitros» en docs/decisiones/juegos-y-torneos.md.
 *
 *   CasosVar.iniciar({ admin })
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const BUCKET = "arbitraje-var";
  let admin = false;

  const nodo = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const BTN = "bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-3 py-2 rounded-lg text-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 aria-pressed:border-accent-500";

  function tarjeta(c, url) {
    const art = nodo("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
    art.dataset.caso = c.id;
    art.append(nodo("h3", "font-serif text-lg font-bold text-brand-800 dark:text-white", c.titulo));
    const v = nodo("video", "mt-2 w-full rounded-lg bg-black");
    v.controls = true; v.playsInline = true; v.muted = true; v.preload = "metadata";
    if (url) v.src = url;
    // Desde el segundo que importa, y lento: un toque de pieza dura un instante.
    v.addEventListener("loadedmetadata", () => { v.currentTime = Number(c.desde) || 0; v.playbackRate = 0.5; }, { once: true });
    art.append(v);
    art.append(nodo("p", "text-xs text-brand-500 dark:text-brand-300 mt-1", "Empieza a la mitad de la velocidad; con los controles del video se pone en pausa y se vuelve atrás."));
    art.append(nodo("p", "font-semibold text-brand-800 dark:text-white mt-3", c.pregunta));
    const grupo = nodo("div", "grid gap-2 mt-2");
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", "¿Qué decides tú?");
    const resultado = nodo("div", "mt-3 text-sm");
    resultado.setAttribute("role", "status");
    (c.opciones || []).forEach((o, i) => {
      const b = nodo("button", BTN, o);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.dataset.opcion = String(i);
      b.addEventListener("click", () => {
        grupo.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        const bien = i === c.correcta;
        resultado.textContent = "";
        resultado.append(nodo("p", "font-semibold " + (bien ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"),
          bien ? "✅ Así es." : "❌ No: lo que corresponde es «" + c.opciones[c.correcta] + "»."));
        resultado.append(nodo("p", "text-brand-700 dark:text-brand-200 mt-1", c.explicacion));
        resultado.append(nodo("p", "text-xs text-brand-500 dark:text-brand-300 mt-1", "Leyes del Ajedrez de la FIDE, " + c.articulo + "."));
      });
      grupo.append(b);
    });
    art.append(grupo, resultado);
    if (admin) {
      const borrar = nodo("button", BTN + " mt-3", "Borrar este caso");
      borrar.type = "button";
      borrar.addEventListener("click", async () => {
        const ok = await Avisos.confirmar("Se borra el caso «" + c.titulo + "» y su video. No se puede deshacer.", { titulo: "¿Borrar este caso?", aceptar: "Borrar el caso", cancelar: "Dejarlo", peligro: true });
        if (!ok) return;
        const { error } = await sb.from("arbitraje_casos_var").delete().eq("id", c.id);
        if (error) { Avisos.avisar("No se pudo borrar el caso: " + error.message, { tipo: "error" }); return; }
        await sb.storage.from(BUCKET).remove([c.video]);
        pintar();
      });
      art.append(borrar);
    }
    return art;
  }

  async function pintar() {
    const lista = $("casos-var-lista");
    lista.textContent = "";
    const { data, error } = await sb.from("arbitraje_casos_var").select("id, titulo, pregunta, opciones, correcta, explicacion, articulo, video, desde").order("created_at", { ascending: false }).range(0, 99);
    if (error) { lista.append(nodo("p", "text-sm text-red-700 dark:text-red-300", "No se pudieron leer los casos: " + error.message)); return; }
    const casos = data || [];
    $("casos-var-vacio").hidden = !!casos.length;
    if (!casos.length) return;
    const { data: firmadas } = await sb.storage.from(BUCKET).createSignedUrls(casos.map((c) => c.video), 3600);
    const url = new Map((firmadas || []).map((f) => [f.path, f.signedUrl]));
    for (const c of casos) lista.append(tarjeta(c, url.get(c.video)));
  }

  // Quien administra sube un caso: el video (el pedazo bajado del VAR) y lo que se pregunta.
  async function agregar(e) {
    e.preventDefault();
    const f = e.target, msg = $("casos-var-msg");
    const archivo = f.elements.video.files[0];
    const opciones = [...f.querySelectorAll("[name=opcion]")].map((x) => x.value.trim()).filter(Boolean);
    const correcta = Number(f.elements.correcta.value);
    const falta = !archivo ? "el video" : !f.elements.titulo.value.trim() ? "el título" : !f.elements.pregunta.value.trim() ? "la pregunta"
      : opciones.length < 2 ? "al menos dos opciones" : !(correcta < opciones.length) ? "cuál es la correcta (una de las opciones escritas)"
      : !f.elements.explicacion.value.trim() ? "el porqué" : !f.elements.articulo.value.trim() ? "el artículo" : !f.elements.permiso.checked ? "confirmar el permiso de quienes salen" : "";
    if (falta) { msg.textContent = "Falta " + falta + "."; return; }
    if (archivo.size > 30 * 1024 * 1024) { msg.textContent = "El video pasa de 30 MB: baja un pedazo más corto desde el VAR."; return; }
    const ext = /mp4/.test(archivo.type) ? "mp4" : /quicktime/.test(archivo.type) ? "mov" : "webm";
    const id = crypto.randomUUID(), video = id + "." + ext;
    msg.textContent = "Subiendo el video…";
    const subida = await sb.storage.from(BUCKET).upload(video, archivo, { contentType: archivo.type || "video/webm", upsert: false });
    if (subida.error) { msg.textContent = "No se pudo subir el video: " + subida.error.message; return; }
    const { error } = await sb.from("arbitraje_casos_var").insert({
      id, titulo: f.elements.titulo.value.trim(), pregunta: f.elements.pregunta.value.trim(), opciones, correcta,
      explicacion: f.elements.explicacion.value.trim(), articulo: f.elements.articulo.value.trim(), video, desde: Math.max(0, Number(f.elements.desde.value) || 0),
    });
    if (error) { await sb.storage.from(BUCKET).remove([video]); msg.textContent = "No se pudo guardar el caso: " + error.message; return; }
    f.reset();
    msg.textContent = "Caso agregado.";
    pintar();
  }

  async function iniciar(opciones) {
    admin = !!(opciones && opciones.admin);
    $("casos-var").hidden = false;
    $("casos-var-nuevo").hidden = !admin;
    if (admin) $("form-caso-var").addEventListener("submit", agregar);
    await pintar();
  }

  window.CasosVar = { iniciar };
})();
