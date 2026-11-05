/* Ajedrez Integral — «Mi ronda y mi mesa» del Metropolitano 2026.
 *
 * El QR del dorso del gafete de cada jugador trae aquí, con su nombre en la
 * dirección: metropolitano-2026.html#mi-ronda=<Apellidos, Nombre>. El QR se
 * imprime una sola vez y no cambia; lo que cambia en cada ronda lo lee esta
 * página al abrirse: la ronda emparejada más reciente de cada torneo que la
 * sala tiene en chess-results, por la Edge Function sala-jugadores (la misma
 * del «Busca a tu jugador» del Centroamericano: lee solo los torneos que
 * administración puso en la sala, y nada más).
 *
 * El nombre del QR es el de FIDE («Mora Solis, Ana»), que es como lo carga el
 * árbitro en Swiss-Manager; sin ID FIDE, el de la inscripción. Se compara sin
 * tildes, mayúsculas ni el orden de las palabras. Si hay más de uno parecido,
 * se elige de la lista; si no aparece, se puede escribir otro nombre.
 *
 * Mientras la ventanita está abierta se vuelve a leer cada minuto. El nombre
 * buscado se recuerda en este aparato (solo una comodidad: sin él, se escribe).
 *
 * Ver «Mi ronda y mi mesa: el QR del gafete» en docs/decisiones/cuentas-y-formularios.md.
 */
window.MetroMiRonda = (function () {
  "use strict";
  const SALA = "metropolitano-2026";
  const GUARDADO = "metro_mi_ronda_v1";
  const REFRESCO_MS = 60000;
  const R = () => window.MetropolitanoReglas;
  const LOCALES = { es: "es-CR", en: "en-US", fr: "fr-FR" };

  const TX = {
    es: {
      ficha: "Mi ronda y mi mesa", fichaTexto: "El QR de tu gafete te trae aquí: tu mesa, tu color y tu rival en cada ronda, al día con chess-results.", fichaAccion: "Buscar mi mesa →",
      titulo: "Mi ronda y mi mesa", cerrar: "Cerrar", etiqueta: "Tu nombre, como en el gafete (Apellidos, Nombre)", buscar: "Buscar",
      ayuda: "El QR de tu gafete ya trae tu nombre. Esto cambia en cada ronda: vuelve a abrirlo (o escanea el QR) cuando salga el pareo.",
      buscando: "Buscando en los emparejamientos…", sinTorneos: "Los emparejamientos salen aquí en cuanto el árbitro publique la ronda 1 (el 26 de diciembre; el U14, el 27).",
      error: "No se pudo leer chess-results ahora mismo. Intenta de nuevo en un rato.", noEsta: (n) => "No encontramos a «" + n + "» en los torneos del Metropolitano. Revisa que esté como en chess-results: Apellidos, Nombre.",
      varios: "Hay más de un nombre parecido. ¿Cuál eres?", sinPareo: "Todavía no sale el pareo de la ronda 1.", ronda: (r) => "Ronda " + r, mesa: (m) => "Mesa " + m,
      blancas: "Juegas con blancas", negras: "Juegas con negras", bye: "Esta ronda tienes bye (descansas).", rival: "Rival", resultado: "Resultado", puesto: (p, pts) => "Vas en el puesto " + p + " con " + pts + " puntos.",
      hora: (f, h) => conPunto("Empieza el " + f + " a las " + h), actualizado: (h) => conPunto("Actualizado a las " + h) + " Se vuelve a leer cada minuto.", viejo: "chess-results no contesta: esto es lo último que se leyó.",
      verTodo: "Ver la ronda completa en chess-results →", sinElo: "sin Elo",
    },
    en: {
      ficha: "My round and my board", fichaTexto: "The QR code on your badge brings you here: your board, your colour and your opponent each round, up to date with chess-results.", fichaAccion: "Find my board →",
      titulo: "My round and my board", cerrar: "Close", etiqueta: "Your name, as on the badge (Surname, Name)", buscar: "Search",
      ayuda: "The QR code on your badge already carries your name. This changes every round: open it again (or scan the QR) when the pairings are out.",
      buscando: "Searching the pairings…", sinTorneos: "The pairings appear here as soon as the arbiter publishes round 1 (on 26 December; the U14, on the 27th).",
      error: "chess-results could not be read right now. Try again in a while.", noEsta: (n) => "We did not find “" + n + "” in the Metropolitano tournaments. Check it is written as in chess-results: Surname, Name.",
      varios: "There is more than one similar name. Which one are you?", sinPareo: "The pairings of round 1 are not out yet.", ronda: (r) => "Round " + r, mesa: (m) => "Board " + m,
      blancas: "You play White", negras: "You play Black", bye: "You have a bye this round (you rest).", rival: "Opponent", resultado: "Result", puesto: (p, pts) => "You are in place " + p + " with " + pts + " points.",
      hora: (f, h) => "Starts on " + f + " at " + h + ".", actualizado: (h) => "Updated at " + h + ". It is read again every minute.", viejo: "chess-results is not answering: this is the last thing that was read.",
      verTodo: "See the whole round on chess-results →", sinElo: "unrated",
    },
    fr: {
      ficha: "Ma ronde et ma table", fichaTexto: "Le QR de votre badge vous amène ici : votre table, votre couleur et votre adversaire à chaque ronde, à jour avec chess-results.", fichaAccion: "Trouver ma table →",
      titulo: "Ma ronde et ma table", cerrar: "Fermer", etiqueta: "Votre nom, comme sur le badge (Nom, Prénom)", buscar: "Chercher",
      ayuda: "Le QR de votre badge contient déjà votre nom. Cela change à chaque ronde : ouvrez-le de nouveau (ou scannez le QR) quand l’appariement est publié.",
      buscando: "Recherche dans les appariements…", sinTorneos: "Les appariements apparaissent ici dès que l’arbitre publie la ronde 1 (le 26 décembre ; le U14, le 27).",
      error: "Impossible de lire chess-results pour le moment. Réessayez dans un moment.", noEsta: (n) => "Nous n’avons pas trouvé « " + n + " » dans les tournois du Metropolitano. Vérifiez qu’il est écrit comme sur chess-results : Nom, Prénom.",
      varios: "Il y a plusieurs noms semblables. Lequel êtes-vous ?", sinPareo: "L’appariement de la ronde 1 n’est pas encore publié.", ronda: (r) => "Ronde " + r, mesa: (m) => "Table " + m,
      blancas: "Vous jouez les Blancs", negras: "Vous jouez les Noirs", bye: "Vous êtes exempt cette ronde (bye).", rival: "Adversaire", resultado: "Résultat", puesto: (p, pts) => "Vous êtes à la place " + p + " avec " + pts + " points.",
      hora: (f, h) => "Commence le " + f + " à " + h + ".", actualizado: (h) => "Mis à jour à " + h + ". Relu chaque minute.", viejo: "chess-results ne répond pas : voici la dernière lecture.",
      verTodo: "Voir toute la ronde sur chess-results →", sinElo: "sans Elo",
    },
  };

  // «9:00 a. m.» ya termina en punto: la frase no lleva otro.
  const conPunto = (s) => (/\.$/.test(s) ? s : s + ".");
  let idioma = "es", nombre = "", elegido = null, temporizador = null, pidiendo = 0;
  const t = () => TX[idioma] || TX.es;
  const $ = (id) => document.getElementById(id);
  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }

  /* ---------- los nombres ---------- */
  // Sin tildes, mayúsculas, signos ni el orden de las palabras: «Solís, Ana
  // Mora» y «MORA SOLIS, ANA» son el mismo nombre.
  function palabras(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter(Boolean);
  }
  const clave = (s) => palabras(s).sort().join(" ");
  // Igual, o todas las palabras buscadas están en el nombre (le falta un segundo apellido).
  function parecido(buscado, nombre2) {
    const a = palabras(buscado), b = palabras(nombre2);
    return a.length >= 2 && a.every((w) => b.includes(w));
  }

  // El torneo de las bases que es cada torneo de chess-results, por su texto.
  function torneoDe(texto) {
    const s = String(texto || "");
    if (/blitz/i.test(s)) return "BLITZ";
    if (/(u|sub)[\s-]?14/i.test(s)) return "U14";
    if (/(^|[^A-Za-z])B([^A-Za-z]|$)/.test(s)) return "B";
    if (/(^|[^A-Za-z])A([^A-Za-z]|$)/.test(s)) return "A";
    return "";
  }

  /* ---------- lo que se le pide a chess-results ---------- */
  async function leer() {
    const una = async (modalidad) => {
      const { data, error } = await window.sb.functions.invoke("sala-jugadores", { body: { clave: SALA, modalidad } });
      if (error || !data || !Array.isArray(data.torneos)) throw error || new Error("respuesta rara");
      return data;
    };
    const primera = await una("clasico");
    const torneos = primera.modalidad === "clasico" ? primera.torneos.slice() : [];
    for (const m of (primera.modalidades || []).filter((m) => m !== "clasico")) {
      const d = m === primera.modalidad ? primera : await una(m);
      if (d.modalidad === m) torneos.push(...d.torneos);
    }
    return torneos.filter((x) => Array.isArray(x.jugadores));
  }

  // Dónde está la persona en cada torneo: [{ torneo, jugador }].
  function buscarEn(torneos, buscado) {
    const exactos = [], parecidos = [];
    for (const tor of torneos) for (const j of tor.jugadores) {
      if (elegido ? clave(j.nombre) === elegido : clave(j.nombre) === clave(buscado)) exactos.push({ torneo: tor, jugador: j });
      else if (!elegido && parecido(buscado, j.nombre)) parecidos.push({ torneo: tor, jugador: j });
    }
    return exactos.length ? exactos : parecidos;
  }

  /* ---------- la ventanita ---------- */
  function armar() {
    if ($("mi-ronda")) return;
    const d = el("dialog", "metro-ventana"); d.id = "mi-ronda"; d.setAttribute("aria-labelledby", "mi-ronda-titulo"); d.setAttribute("data-no-traducir", "");
    const cab = el("div", "metro-ventana-cabeza"); const h2 = el("h2"); h2.id = "mi-ronda-titulo";
    const b = el("button", "metro-boton"); b.type = "button"; b.dataset.cerrar = ""; b.id = "mi-ronda-cerrar";
    cab.append(h2, b);
    const cu = el("div", "metro-ventana-cuerpo space-y-4");
    const f = el("form", "flex flex-wrap items-end gap-2"); f.id = "mi-ronda-form";
    const caja = el("div", "flex-1 min-w-[14rem]");
    const lab = el("label", "block text-sm font-semibold mb-1"); lab.htmlFor = "mi-ronda-nombre"; lab.id = "mi-ronda-etiqueta";
    const inp = el("input", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2.5 text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"); inp.id = "mi-ronda-nombre"; inp.autocomplete = "name"; inp.maxLength = 80;
    caja.append(lab, inp);
    const btn = el("button", "metro-boton"); btn.type = "submit"; btn.id = "mi-ronda-buscar";
    f.append(caja, btn);
    const ayuda = el("p", "text-sm"); ayuda.id = "mi-ronda-ayuda";
    const res = el("div", "space-y-4"); res.id = "mi-ronda-resultado"; res.setAttribute("aria-live", "polite");
    const pie = el("p", "text-xs"); pie.id = "mi-ronda-pie";
    cu.append(f, ayuda, res, pie);
    d.append(cab, cu);
    document.querySelector("main").append(d);
    f.addEventListener("submit", (ev) => { ev.preventDefault(); nombre = inp.value.trim(); elegido = null; guardar(); consultar(); });
    d.addEventListener("close", () => { clearInterval(temporizador); temporizador = null; });
  }

  function guardar() { try { localStorage.setItem(GUARDADO, JSON.stringify({ nombre, elegido })); } catch (e) { /* sin almacenamiento */ } }
  function recordar() { try { const g = JSON.parse(localStorage.getItem(GUARDADO) || "null"); if (g && typeof g.nombre === "string") { nombre = g.nombre; elegido = typeof g.elegido === "string" ? g.elegido : null; } } catch (e) { /* nada */ } }

  function textosFijos() {
    $("mi-ronda-titulo").textContent = "🎯 " + t().titulo;
    $("mi-ronda-cerrar").textContent = t().cerrar;
    $("mi-ronda-etiqueta").textContent = t().etiqueta;
    $("mi-ronda-buscar").textContent = t().buscar;
    $("mi-ronda-ayuda").textContent = t().ayuda;
    $("mi-ronda-nombre").value = nombre;
  }

  const horaCorta = (x) => new Date(x).toLocaleTimeString(LOCALES[idioma], { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" });
  const fechaLarga = (x) => new Date(x).toLocaleDateString(LOCALES[idioma], { weekday: "long", day: "numeric", month: "long", timeZone: "America/Costa_Rica" });

  function tarjeta({ torneo: tor, jugador: j }) {
    const T = t();
    const c = el("section", "metro-caja space-y-2");
    c.append(el("h3", "font-bold text-lg", tor.texto || ""));
    const p = tor.pareo;
    const m = p && Array.isArray(p.mesas) ? p.mesas.find((x) => (x.blancas && x.blancas.no === j.no) || (x.negras && x.negras.no === j.no)) : null;
    if (!p || !p.ronda) c.append(el("p", "", T.sinPareo));
    else if (!m) c.append(el("p", "", T.ronda(p.ronda) + ": " + T.bye));
    else if (!m.negras) c.append(el("p", "font-semibold", T.ronda(p.ronda) + " · " + T.bye));
    else {
      const blancas = m.blancas.no === j.no;
      const rival = blancas ? m.negras : m.blancas;
      const rj = tor.jugadores.find((x) => x.no === rival.no);
      const grande = el("p", "text-2xl font-bold", T.ronda(p.ronda) + " · " + T.mesa(m.mesa));
      c.append(grande, el("p", "font-semibold", (blancas ? "♔ " : "♚ ") + (blancas ? T.blancas : T.negras)));
      c.append(el("p", "", T.rival + ": " + [rival.titulo, rival.nombre].filter(Boolean).join(" ") + " (" + (rj && rj.elo ? rj.elo : T.sinElo) + ")"));
      if (m.resultado && !/^\s*-\s*$/.test(m.resultado)) c.append(el("p", "", T.resultado + ": " + m.resultado));
      const clave2 = torneoDe(tor.texto);
      const r = clave2 && R() ? R().rondas(clave2)[p.ronda - 1] : null;
      if (r) c.append(el("p", "text-sm", T.hora(fechaLarga(r.inicio), horaCorta(r.inicio))));
    }
    if (j.puesto && j.puntos != null && j.puntos !== "") c.append(el("p", "text-sm", T.puesto(j.puesto, j.puntos)));
    if (tor.url) {
      const a = el("a", "text-sm underline font-semibold", T.verTodo);
      a.href = String(tor.url).replace(/&art=1\b/, "&art=2"); a.dataset.visor = tor.texto || T.titulo;
      c.append(a);
    }
    return c;
  }

  async function consultar() {
    const caja = $("mi-ronda-resultado"), pie = $("mi-ronda-pie");
    if (!nombre) { caja.textContent = ""; pie.textContent = ""; return; }
    const n = ++pidiendo;
    if (!caja.childElementCount) caja.textContent = t().buscando;
    let torneos;
    try { torneos = await leer(); }
    catch (e) { if (n === pidiendo) { caja.textContent = t().error; pie.textContent = ""; } return; }
    if (n !== pidiendo) return;
    caja.textContent = "";
    if (!torneos.length) { caja.textContent = t().sinTorneos; pie.textContent = ""; return; }
    const hallados = buscarEn(torneos, nombre);
    const personas = [...new Set(hallados.map((h) => clave(h.jugador.nombre)))];
    if (!hallados.length) caja.textContent = t().noEsta(nombre);
    else if (personas.length > 1) {
      caja.append(el("p", "font-semibold", t().varios));
      const ul = el("ul", "grid sm:grid-cols-2 gap-2");
      for (const k of personas) {
        const h = hallados.find((x) => clave(x.jugador.nombre) === k);
        const li = el("li"); const b = el("button", "metro-boton w-full text-left", h.jugador.nombre + (h.jugador.fed ? " (" + h.jugador.fed + ")" : "") + " · " + (h.torneo.texto || ""));
        b.type = "button"; b.addEventListener("click", () => { elegido = k; nombre = h.jugador.nombre; $("mi-ronda-nombre").value = nombre; guardar(); consultar(); });
        li.append(b); ul.append(li);
      }
      caja.append(ul);
    } else hallados.forEach((h) => caja.append(tarjeta(h)));
    pie.textContent = t().actualizado(horaCorta(Date.now())) + (torneos.some((x) => x.viejo) ? " " + t().viejo : "");
  }

  // Abre la ventanita; con `desdeQr`, el nombre que trae el QR manda sobre el
  // guardado. Desde la ficha deja una entrada en el historial («Atrás» la
  // cierra); desde la dirección (el QR) no, para que cerrarla no saque a nadie
  // de la página: solo se limpia el nombre de la dirección.
  function abrir(desdeQr, porDireccion) {
    armar();
    if (desdeQr != null) { nombre = desdeQr; elegido = null; guardar(); }
    textosFijos();
    const d = $("mi-ronda");
    if (!d.open) d.showModal();
    if (porDireccion) history.replaceState(null, "", location.pathname + location.search + "#mi-ronda");
    else if (!history.state || history.state.metroVentana !== "mi-ronda") history.pushState({ metroVentana: "mi-ronda" }, "", "#mi-ronda");
    clearInterval(temporizador);
    temporizador = setInterval(() => { if (d.open) consultar(); }, REFRESCO_MS);
    $("mi-ronda-resultado").textContent = "";
    consultar();
    if (!nombre) $("mi-ronda-nombre").focus();
  }

  // La dirección del QR: «mi-ronda» o «mi-ronda=<nombre>».
  function deDireccion(id) {
    const m = /^mi-ronda(?:=(.*))?$/.exec(id || "");
    if (!m) return false;
    let n = null;
    if (m[1] != null) { try { n = decodeURIComponent(m[1]).slice(0, 80).trim(); } catch (e) { n = null; } }
    abrir(n, true);
    return true;
  }

  // La ficha de «Todo el torneo» y los textos, en el idioma de la página.
  function pintar(nuevo, cajaFicha) {
    idioma = TX[nuevo] ? nuevo : "es";
    if (cajaFicha) {
      cajaFicha.textContent = "";
      const a = el("a", "metro-ficha"); a.href = "#mi-ronda"; a.dataset.tono = "1";
      const e = el("span", "metro-ficha-emoji", "🎯"); e.setAttribute("aria-hidden", "true");
      a.append(e, el("span", "metro-ficha-titulo", t().ficha), el("span", "metro-ficha-texto", t().fichaTexto), el("span", "metro-ficha-accion", t().fichaAccion));
      a.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); abrir(null); });
      cajaFicha.append(a);
    }
    if ($("mi-ronda")) { textosFijos(); if ($("mi-ronda").open) consultar(); }
  }

  recordar();
  return { pintar, deDireccion, abrir, clave, parecido, torneoDe, buscarEn };
})();

/*! rev bfb5bbb0d2d82f9f */
