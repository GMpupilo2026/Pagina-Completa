/* «¿Te ayudo?»: la profe Karina en la página de la Eliminatoria Cantonal JDN
 * de Pérez Zeledón 2026 (jdn-pz-2026.html). Un botón con su cara abajo a la
 * derecha; al tocarlo, lo que más preguntan las familias, y cada respuesta
 * lleva a su lugar de la página. Lo pidió el dueño: la profe Karina (Itzel
 * Karina Rojas, la directora del torneo) «para ayudar, conforme vayan
 * saliendo más cosas del torneo, que ella se actualice».
 *
 * POR ESO NINGUNA RESPUESTA ESTÁ ESCRITA AQUÍ CON SUS DATOS: cada una se arma
 * al abrirla, leyendo lo que la página ya dice en ese momento.
 * - La próxima ronda, del calendario (las filas data-inicio, hora de Costa
 *   Rica: las mismas que lee js/torneo-hoy.js) contra la hora de ahora.
 * - El congresillo, de lo que dice el calendario de él.
 * - Las categorías, de su tabla; la sede, el ritmo y quién dirige, de la
 *   portada; la tolerancia, del reglamento.
 * - La inscripción y los resultados, de lo que ya pintó
 *   js/jdn-pz-inscripcion.js: el aviso de la ventana «Inscribirme» y si las
 *   fichas «Resultados U12/U20» ya apuntan a su torneo en Pareo Integral.
 * Cuando se regenera la página con algo nuevo (la hora del congresillo, otra
 * ronda, un cambio de sede) o Pareo publica los torneos, ella lo dice sola.
 * Los botones tocan la ficha o el enlace de la página que ya hace eso: si
 * una ficha cambia de destino, la profe la sigue.
 *
 * El aspecto es el del asistente del Centroamericano (css/centroamericano.css,
 * .cac-profe-*), que esta página ya carga. Sin inteligencia artificial: nada
 * que la página no diga. Los dibujos van de adorno (alt vacío).
 *
 * Ver «La profe Karina ayuda en la página» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";
  if (window.JdnPzProfe || !document.getElementById("calendario")) return;

  const CLAVE_VISTO = "jdnpz_profe_visto";
  const ruta = (pose) => (window.AvatarProfeOscar ? window.AvatarProfeOscar.rutaDe("karina", pose) : "img/avatar-profe-karina/" + pose + ".webp");
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  const limpio = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");

  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  /* ---------------- lo que dice la página ---------------- */

  // «Ahora» en Costa Rica, como «AAAA-MM-DDTHH:MM» (lo mismo que data-inicio).
  function ahoraCR() {
    const p = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }
  // Suma minutos a «AAAA-MM-DDTHH:MM» sin pasar por la zona del aparato.
  function mas(inicio, minutos) {
    const d = new Date(inicio + ":00Z");
    d.setUTCMinutes(d.getUTCMinutes() + minutos);
    return d.toISOString().slice(0, 16);
  }
  // Las filas del calendario: [actividad, día, hora escrita, inicio, fin].
  function calendario() {
    return $$("#calendario tbody tr[data-inicio]").map((tr) => {
      const c = tr.cells;
      const inicio = tr.dataset.inicio;
      return { que: limpio(c[0]), dia: limpio(c[1]), hora: limpio(c[2]), inicio, fin: mas(inicio, Number(tr.dataset.minutos) || 0), ronda: !!tr.dataset.ronda };
    }).sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  }
  const conMinuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  // «8:00 a.m.» ya termina en punto: no se le pone otro.
  const fin = (s) => (/\.$/.test(s) ? s : s + ".");

  function textoHora() {
    const filas = calendario();
    if (!filas.length) return "Las horas de cada ronda están en el calendario, todas en hora de Costa Rica.";
    const ahora = ahoraCR();
    const enCurso = filas.find((f) => f.ronda && f.inicio <= ahora && ahora < f.fin);
    const proxima = filas.find((f) => f.inicio > ahora && f.ronda);
    const ultima = filas[filas.length - 1];
    if (ahora >= ultima.fin) return "La eliminatoria ya terminó: la clasificación final de cada categoría está en «Resultados U12» y «Resultados U20».";
    let t = "";
    if (enCurso) t = "Ahora se juega la " + enCurso.que + ", que empezó a las " + fin(enCurso.hora) + " ";
    if (proxima) t += (enCurso ? "La siguiente es la " : "La próxima es la ") + proxima.que + ": " + conMinuscula(proxima.dia) + " a las " + fin(proxima.hora);
    else if (!enCurso) t = "Ya se jugaron todas las rondas. Lo que sigue está en el calendario.";
    return t + " Todas las horas son de Costa Rica.";
  }

  function textoCongresillo() {
    const fila = calendario().find((f) => /congresillo/i.test(f.que));
    const nota = $$("#calendario p").map(limpio).find((t) => /congresillo/i.test(t)) || "";
    const frase = (nota.match(/[^.]*congresillo[^.]*\.(?:[^.]*enlace[^.]*\.)?/i) || [""])[0].trim();
    if (fila) return "El congresillo es " + conMinuscula(fila.dia) + " a las " + fin(fila.hora) + " " + frase;
    return (frase || "Lo del congresillo está en el calendario.") + " Cuando la organización confirme la hora, aparece en el calendario.";
  }

  function textoCategorias() {
    const filas = $$("#categorias tbody tr").map((tr) => limpio(tr.cells[0]).replace(/ Absoluto y Femenino/, "") + ": nacidos de " + limpio(tr.cells[1]));
    const nota = limpio($$("#categorias p").pop());
    const dos = (nota.match(/[^.]*dos torneos[^.]*\./i) || [""])[0].trim();
    return (filas.length ? "Va por el año de nacimiento. " + filas.join("; ") + ". " : "") + dos;
  }

  // Lo que dice el aviso de la ventana «Inscribirme» (lo pinta js/jdn-pz-inscripcion.js).
  function textoInscripcion() {
    const aviso = limpio($("#insc-estado-torneos"));
    const listo = aviso && !/^Buscando/i.test(aviso) ? aviso : "";
    return "Con el formulario «Inscribirme»: con la fecha de nacimiento va solo al torneo de su categoría y queda pendiente hasta que el árbitro lo aprueba."
      + (listo ? " " + listo : "");
  }

  // ¿Ya están los torneos en Pareo Integral? Las fichas apuntan a su torneo.
  const torneoListo = (k) => /#t=/.test(($("#ficha-resultados-" + k) || {}).getAttribute ? $("#ficha-resultados-" + k).getAttribute("href") : "");
  function textoResultados() {
    const listos = ["u12", "u20"].filter(torneoListo).map((k) => "«Resultados " + k.toUpperCase() + "»");
    const filas = calendario();
    const terminado = filas.length && ahoraCR() >= filas[filas.length - 1].fin;
    if (!listos.length) return "Los pareos y los resultados se publican en Pareo Integral cuando la organización arme los torneos. Mientras tanto, en «Resultados U12» y «Resultados U20» ves los torneos de Costa Rica en Pareo.";
    return (terminado ? "La clasificación final está en " : "Los inscritos, los pareos de cada ronda, los resultados y la clasificación están en ")
      + listos.join(" y ") + ", en Pareo Integral. Cada jugador revisa que su resultado quede bien anotado antes de la ronda siguiente.";
  }

  function datoPortada(nombre) {
    const dt = $$(".cac-dato dt").find((d) => limpio(d).replace(/^\S+\s/, "") === nombre || limpio(d).endsWith(nombre));
    return dt ? limpio(dt.nextElementSibling) : "";
  }
  function textoLlegar() {
    const sede = datoPortada("Sede");
    return (sede ? "La sede: " + fin(sede) + " " : "") + "El mapa con la ubicación está en la ficha «Cómo llegar».";
  }
  function textoRitmo() {
    const ritmo = datoPortada("Ritmo");
    const tolerancia = $$("#reglamento li").map(limpio).find((t) => /tolerancia/i.test(t)) || "";
    return (ritmo ? fin(ritmo) + " " : "") + tolerancia + " El resto está en el reglamento y en las bases.";
  }
  function quienDirige() {
    const p = $$(".cac-organiza p").find((x) => /Dirección del torneo/i.test(x.textContent));
    return p ? limpio(p).replace(/^Dirección del torneo:\s*/i, "") : "";
  }

  /* ---------------- las preguntas ---------------- */

  // Lo que hace el botón de cada respuesta: toca lo que en la página ya hace eso.
  function tocar(sel) {
    const a = $(sel);
    if (a) a.click();
  }
  const PREGUNTAS = [
    { k: "hora", icono: "🗓️", pregunta: "¿A qué hora es la próxima ronda?", texto: textoHora, pose: "reloj-de-ajedrez", acciones: [["Ver el calendario", () => tocar('a.cac-ficha[href="#calendario"]')]] },
    { k: "inscribir", icono: "📝", pregunta: "¿Cómo inscribo a mi hijo o hija?", texto: textoInscripcion, pose: "te-toca", acciones: [["Inscribirme", () => tocar("#ficha-inscribirme")]] },
    { k: "categoria", icono: "🎂", pregunta: "¿En qué categoría juega?", texto: textoCategorias, pose: "presentando", acciones: [["Ver las categorías", () => tocar('a.cac-ficha[href="#categorias"]')]] },
    { k: "resultados", icono: "♟️", pregunta: "¿Contra quién juega y cómo va?", texto: textoResultados, pose: "tablero-italiana", acciones: [["Resultados U12", () => tocar("#ficha-resultados-u12")], ["Resultados U20", () => tocar("#ficha-resultados-u20")]] },
    { k: "congresillo", icono: "🗣️", pregunta: "¿Cuándo es el congresillo?", texto: textoCongresillo, pose: "atencion", acciones: [["Ver el calendario", () => tocar('a.cac-ficha[href="#calendario"]')]] },
    { k: "llegar", icono: "📍", pregunta: "¿Dónde es el torneo?", texto: textoLlegar, pose: "nos-vemos", acciones: [["Abrir el mapa", () => tocar('a.cac-ficha[href*="maps"]')]] },
    { k: "ritmo", icono: "⏱️", pregunta: "¿Cuánto dura cada partida y si llegamos tarde?", texto: textoRitmo, pose: "tiempo", acciones: [["Ver el reglamento", () => tocar('a.cac-ficha[href="#reglamento"]')], ["Abrir las bases", () => tocar("#ficha-bases")]] },
  ];
  const porClave = (k) => PREGUNTAS.find((q) => q.k === k);

  /* ---------------- el botón y el panel ---------------- */

  const boton = el("button", "cac-profe-boton");
  boton.type = "button";
  boton.id = "profe-boton";
  boton.setAttribute("aria-expanded", "false");
  boton.setAttribute("aria-controls", "profe-panel");
  boton.setAttribute("aria-label", "¿Te ayudo? La profe Karina contesta lo que más se pregunta del torneo");
  const globo = el("span", "cac-profe-globo", "¿Te ayudo?");
  const cara = el("span", "cac-profe-cara");
  const img = el("img", "");
  img.src = ruta("hola");
  img.alt = "";
  cara.appendChild(img);
  boton.append(globo, cara);

  const panel = el("div", "cac-profe-panel");
  panel.id = "profe-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "profe-titulo");

  let visto = false;
  try { visto = localStorage.getItem(CLAVE_VISTO) === "1"; } catch (e) { visto = false; }
  globo.hidden = visto;

  function figura(pose) {
    const i = el("img", "cac-profe-figura");
    i.src = ruta(pose);
    i.alt = "";
    return i;
  }
  function cabeza(pose, titulo, texto) {
    const c = el("div", "cac-profe-cabeza");
    const h = el("h2", "cac-profe-titulo", titulo);
    h.id = "profe-titulo";
    h.tabIndex = -1;
    const d = el("div", "");
    d.append(h, el("p", "cac-profe-texto", texto));
    c.append(figura(pose), d);
    return c;
  }
  function cerrarX() {
    const x = el("button", "cac-profe-cerrar", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Cerrar");
    x.addEventListener("click", () => cerrar(true));
    return x;
  }

  function pintarLista(foco) {
    const ul = el("ul", "cac-profe-lista");
    PREGUNTAS.forEach((q) => {
      const li = el("li", "");
      const b = el("button", "cac-profe-pregunta");
      b.type = "button";
      b.dataset.pregunta = q.k;
      b.appendChild(el("span", "", q.icono + " ")).setAttribute("aria-hidden", "true");
      b.appendChild(document.createTextNode(q.pregunta));
      b.addEventListener("click", () => pintarRespuesta(q.k));
      li.appendChild(b);
      ul.appendChild(li);
    });
    const dirige = quienDirige();
    const soyDirectora = /karina/i.test(dirige);
    panel.replaceChildren(cerrarX(), cabeza("presentando", "¡Hola! Soy la profe Karina",
      (soyDirectora ? "Dirijo la eliminatoria y te ayudo" : "Te ayudo") + " a encontrar lo que buscas del torneo. ¿Qué necesitas?"), ul);
    delete panel.dataset.respuesta;
    const f = foco ? panel.querySelector('[data-pregunta="' + foco + '"]') : panel.querySelector("[data-pregunta]");
    if (f) f.focus();
  }

  function pintarRespuesta(k) {
    const q = porClave(k);
    const fila = el("div", "cac-profe-acciones");
    q.acciones.forEach(([texto, hacer], i) => {
      const b = el("button", i ? "cac-jugador-boton" : "cac-boton", texto);
      b.type = "button";
      b.dataset.accion = k;
      b.addEventListener("click", () => { cerrar(false); hacer(); });
      fila.appendChild(b);
    });
    const volver = el("button", "cac-jugador-boton", "← Otras preguntas");
    volver.type = "button";
    volver.dataset.volver = "";
    volver.addEventListener("click", () => pintarLista(k));
    fila.appendChild(volver);
    panel.replaceChildren(cerrarX(), cabeza(q.pose, q.pregunta, q.texto()), fila);
    panel.dataset.respuesta = k;
    panel.querySelector("#profe-titulo").focus();
  }

  function abrir() {
    panel.hidden = false;
    boton.setAttribute("aria-expanded", "true");
    if (!visto) { visto = true; try { localStorage.setItem(CLAVE_VISTO, "1"); } catch (e) { /* sin espacio: sale otra vez */ } globo.hidden = true; }
    pintarLista();
  }
  function cerrar(devolverFoco) {
    panel.hidden = true;
    boton.setAttribute("aria-expanded", "false");
    if (devolverFoco) boton.focus();
  }
  boton.addEventListener("click", () => (panel.hidden ? abrir() : cerrar(true)));
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); cerrar(true); } });
  // Un clic afuera lo cierra. El botón de una pregunta ya no está en la página
  // cuando llega acá (el panel se repintó): ese clic fue adentro.
  document.addEventListener("click", (e) => { if (!panel.hidden && e.target.isConnected && !panel.contains(e.target) && !boton.contains(e.target)) cerrar(false); });

  document.body.append(panel, boton);
  window.JdnPzProfe = { abrir, cerrar: () => cerrar(false), PREGUNTAS, texto: (k) => porClave(k).texto() };
})();

/*! rev bfb5bbb0d2d82f9f */
