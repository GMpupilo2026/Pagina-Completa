/* «¿Te ayudo?»: el profe Oscar en la página del Torneo Intereducativo Tacho
 * Chess 2 (tacho-chess-2.html). Un botón con su cara abajo a la derecha; al
 * tocarlo, lo que más preguntan las familias, y cada respuesta lleva a su
 * lugar de la página. Lo pidió el dueño el 12/11/2026 («agrega el avatar del
 * profe Oscar para el torneo, para que pueda ayudar a la gente»). A
 * diferencia del Centroamericano (donde dice «el profe», nada más), aquí se
 * presenta como «el profe Oscar»: lo pidió el dueño después. Los dibujos van
 * de adorno (alt vacío).
 *
 * NINGUNA RESPUESTA ESTÁ ESCRITA AQUÍ CON SUS DATOS (como la de la profe
 * Karina, js/jdn-pz-profe.js): cada una se arma al abrirla, leyendo lo que la
 * página dice en ese momento.
 * - La próxima ronda, del calendario (las filas data-inicio, hora de Costa
 *   Rica: las mismas que lee js/torneo-hoy.js) contra la hora de ahora.
 * - La sede, de la portada; el ritmo y el árbitro, de la franja de quién
 *   organiza; la tolerancia, del reglamento; quién puede jugar y qué se
 *   premia, de la ventana «Niveles y premios»; el contacto, de su ventana; lo
 *   que hay además, de «Además disfruta de».
 * - Los resultados, de lo que ya pintó js/tacho-chess-resultados.js: si la
 *   ficha «Resultados» ya apunta a su torneo en Pareo Integral.
 * Los botones tocan la ficha que ya hace eso: si una cambia de destino, el
 * profe la sigue.
 *
 * El aspecto es el del asistente del Centroamericano (css/centroamericano.css,
 * .cac-profe-*), que esta página ya carga. Sin inteligencia artificial.
 *
 * Ver «El profe ayuda en Tacho Chess 2» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";
  if (window.TachoProfe || !document.getElementById("calendario")) return;

  const CLAVE_VISTO = "tacho_profe_visto";
  const ruta = (pose) => (window.AvatarProfeOscar ? window.AvatarProfeOscar.rutaDe("oscar", pose) : "img/avatar-profe-oscar/" + pose + ".webp");
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  const limpio = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
  // El texto que se lee, sin lo que solo adorna (los emojis van en aria-hidden).
  function leido(n) {
    if (!n) return "";
    const c = n.cloneNode(true);
    c.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
    return limpio(c);
  }

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
  // Suma minutos a «AAAA-MM-DDTHH:MM» (hora de Costa Rica, escrita): la cuenta
  // va en un Date de UTC solo para que el reloj pase de día bien.
  const dos = (n) => String(n).padStart(2, "0");
  function mas(inicio, minutos) {
    const [f, h] = inicio.split("T");
    const [a, m, d] = f.split("-").map(Number);
    const [hh, mm] = h.split(":").map(Number);
    const x = new Date(Date.UTC(a, m - 1, d, hh, mm + minutos));
    return x.getUTCFullYear() + "-" + dos(x.getUTCMonth() + 1) + "-" + dos(x.getUTCDate()) + "T" + dos(x.getUTCHours()) + ":" + dos(x.getUTCMinutes());
  }
  function calendario() {
    return $$("#calendario tbody tr[data-inicio]").map((tr) => {
      const c = tr.cells;
      const inicio = tr.dataset.inicio;
      return { que: limpio(c[0]), dia: limpio(c[1]), hora: limpio(c[2]), inicio, fin: mas(inicio, Number(tr.dataset.minutos) || 0), ronda: !!tr.dataset.ronda };
    }).sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  }
  const conMinuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  // «9:00 a. m.» ya termina en punto: no se le pone otro.
  const fin = (s) => (/\.$/.test(s) ? s : s + ".");
  // «9:30 a. m. (aprox.)» → «9:30 a. m. (aproximadamente)».
  const hora = (s) => s.replace(/\s*\(aprox\.\)$/, " (aproximadamente)");

  function textoHora() {
    const filas = calendario();
    if (!filas.length) return "Las horas de cada ronda están en el calendario, todas en hora de Costa Rica.";
    const ahora = ahoraCR();
    const enCurso = filas.find((f) => f.inicio <= ahora && ahora < f.fin);
    const proxima = filas.find((f) => f.inicio > ahora && f.ronda);
    const ultima = filas[filas.length - 1];
    if (ahora >= ultima.fin) return "El torneo ya terminó. La clasificación está en la ficha «Resultados».";
    let t = "";
    // «hoy» si es el mismo día de Costa Rica; si no, el día del calendario.
    const cuando = (f) => (f.inicio.slice(0, 10) === ahora.slice(0, 10) ? "hoy" : conMinuscula(f.dia));
    const nombre = (f) => (f.ronda ? conMinuscula(f.que) : f.que);
    if (enCurso) t = "Ahora: " + nombre(enCurso) + ", desde las " + fin(hora(enCurso.hora)) + " ";
    if (proxima) t += (enCurso ? "Después viene la " : "La próxima es la ") + nombre(proxima) + ": " + cuando(proxima) + " a las " + fin(hora(proxima.hora));
    else if (!enCurso) t = "Ya se jugaron todas las rondas. Lo que sigue está en el calendario.";
    return t + " Todas las horas son de Costa Rica; cada ronda empieza cuando termina la anterior.";
  }

  function textoInscripcion() {
    const p = $$("#inscribirme p").map(limpio).find((x) => /gratuit|no cuesta/i.test(x)) || "";
    return (p ? fin(p) + " " : "") + "Toca «Abrir el formulario» y llena los datos de quien juega.";
  }

  function textoNiveles() {
    const quien = $$("#inscribirme p").map(limpio).find((x) => /Estudiantes/i.test(x)) || "";
    // Cada grupo de niveles de la ventana (Primaria, Secundaria) con cuántos trae.
    const grupos = $$("#premios h3").map((h) => [leido(h).toLowerCase(), $$("li", h.parentElement).length]).filter((g) => g[1]);
    const total = grupos.reduce((n, g) => n + g[1], 0);
    return (quien ? fin(quien) + " " : "") + (total ? "Son " + total + " niveles: " + grupos.map((g) => g[1] + " de " + g[0]).join(" y ") + "." : "");
  }

  // ¿Ya está el torneo en Pareo Integral? La ficha deja de ser «Pronto».
  function textoResultados() {
    const f = $("#ficha-resultados");
    const listo = f && f.tagName === "A";
    if (!listo) return "Los emparejamientos de cada ronda, los resultados y la clasificación se publican en Pareo Integral. La ficha «Resultados» se enciende cuando el torneo esté publicado.";
    return "Están en Pareo Integral: toca «Resultados» y busca a tu jugador en los emparejamientos de la ronda y en la clasificación.";
  }

  function datoPortada(nombre) {
    const dt = $$(".cac-dato dt").find((d) => limpio(d).endsWith(nombre));
    return dt ? limpio(dt.nextElementSibling) : "";
  }
  function datoFranja(nombre) {
    const p = $$(".cac-organiza p").find((x) => limpio(x).startsWith(nombre + ":"));
    return p ? limpio(p).slice(nombre.length + 1).trim() : "";
  }
  function textoLlegar() {
    const sede = datoPortada("Sede");
    const fecha = datoPortada("Fecha");
    return (sede ? "En el " + fin(sede) + " " : "") + (fecha ? "El " + conMinuscula(fecha) + ". " : "") + "El mapa está en la ficha «Cómo llegar».";
  }
  function textoRitmo() {
    const ritmo = datoFranja("Ritmo");
    const arbitro = datoFranja("Árbitro principal");
    const tolerancia = $$("#reglamento li").map(limpio).find((t) => /^Tolerancia/i.test(t)) || "";
    return (ritmo ? "Se juegan " + fin(ritmo) + " " : "") + (tolerancia ? fin(tolerancia) + " " : "") + (arbitro ? "Árbitro principal: " + fin(arbitro) + " " : "") + "Lo demás está en el reglamento y en las bases.";
  }
  function textoContacto() {
    const c = $("#contacto");
    const nombre = limpio(c && $("h3", c));
    const tel = limpio(c && $('a[href^="tel:"]', c));
    return nombre ? "Con " + nombre + ", de la organización" + (tel ? ", al " + tel : "") + ": por teléfono o por WhatsApp." : "El contacto de la organización está en su ficha.";
  }
  function textoAdemas() {
    const cosas = $$("#ademas h3").map(leido);
    return cosas.length ? "Además del torneo: " + cosas.map(conMinuscula).join(", ").replace(/, ([^,]*)$/, " y $1") + "." : "";
  }

  /* ---------------- las preguntas ---------------- */

  function tocar(sel) {
    const a = $(sel);
    if (a) a.click();
  }
  const PREGUNTAS = [
    { k: "inscribir", icono: "📝", pregunta: "¿Cómo inscribo a mi hijo o hija?", texto: textoInscripcion, pose: "te-toca", acciones: [["Inscribirme", () => tocar("#ficha-inscribirme")]] },
    { k: "hora", icono: "🗓️", pregunta: "¿A qué hora es la próxima ronda?", texto: textoHora, pose: "reloj-de-ajedrez", acciones: [["Ver el calendario", () => tocar('a.cac-ficha[href="#calendario"]')]] },
    { k: "niveles", icono: "🏆", pregunta: "¿Quién puede jugar y qué se premia?", texto: textoNiveles, pose: "campeones", acciones: [["Ver los niveles", () => tocar('a.cac-ficha[href="#premios"]')]] },
    { k: "resultados", icono: "♟️", pregunta: "¿Contra quién juega y cómo va?", texto: textoResultados, pose: "tablero-italiana", acciones: [["Ver los resultados", () => tocar("#ficha-resultados")]] },
    { k: "llegar", icono: "📍", pregunta: "¿Dónde y cuándo es el torneo?", texto: textoLlegar, pose: "nos-vemos", acciones: [["Abrir el mapa", () => tocar('a.cac-ficha[href*="maps"]')]] },
    { k: "ritmo", icono: "⏱️", pregunta: "¿Cuánto dura cada partida y si llegamos tarde?", texto: textoRitmo, pose: "tiempo", acciones: [["Ver el reglamento", () => tocar('a.cac-ficha[href="#reglamento"]')], ["Abrir las bases", () => tocar("#ficha-bases")]] },
    { k: "ademas", icono: "🎉", pregunta: "¿Qué más hay ese día?", texto: textoAdemas, pose: "bienvenidos", acciones: [["Ver qué hay", () => tocar('a.cac-ficha[href="#ademas"]')]] },
    { k: "contacto", icono: "📞", pregunta: "¿A quién le pregunto algo más?", texto: textoContacto, pose: "atencion", acciones: [["Ver el contacto", () => tocar('a.cac-ficha[href="#contacto"]')]] },
  ];
  const porClave = (k) => PREGUNTAS.find((q) => q.k === k);

  /* ---------------- el botón y el panel ---------------- */

  const boton = el("button", "cac-profe-boton");
  boton.type = "button";
  boton.id = "profe-boton";
  boton.setAttribute("aria-expanded", "false");
  boton.setAttribute("aria-controls", "profe-panel");
  boton.setAttribute("aria-label", "¿Te ayudo? El profe Oscar contesta lo que más se pregunta del torneo");
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
    panel.replaceChildren(cerrarX(), cabeza("presentando", "¡Hola! Soy el profe Oscar", "Te ayudo a encontrar lo que buscas de Tacho Chess 2. ¿Qué necesitas?"), ul);
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
  window.TachoProfe = { abrir, cerrar: () => cerrar(false), PREGUNTAS, texto: (k) => porClave(k).texto() };
})();

/*! rev bfb5bbb0d2d82f9f */
