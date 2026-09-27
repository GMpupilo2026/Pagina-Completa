/* Las salas de torneos en admin.html#torneos: crearlas, editarlas,
 * ordenarlas, ocultarlas y borrarlas.
 *
 * Escribe directo en salas_torneo: la RLS deja escribir solo a quien
 * administra, y la base valida los enlaces (https y nada más) y la dirección.
 * Lo que se valida acá es para decirlo antes y en palabras; si algo se cuela,
 * la base lo rechaza igual. Ver «Las salas de torneos se editan en
 * administración» en docs/decisiones/juegos-y-torneos.md.
 *
 * La vista previa es la misma ficha de la página pública (SalasTorneo.ficha),
 * así que lo que se ve acá es lo que se va a ver allá.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let salas = [];
  let editando = null;          // la sala que se edita, o null si es nueva
  let claveTocada = false;      // si se escribió la dirección a mano, no se pisa con el nombre
  let lichessComprobado = null; // { id, nombre } de la última comprobación

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  // «Desafío Mentes Maestras 2026» → «desafio-mentes-maestras-2026»
  function claveDe(texto) {
    return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  }

  function tipoElegido() {
    const r = document.querySelector('input[name="sala-tipo"]:checked');
    return r ? r.value : "lichess";
  }

  // ---------------------------------------------------------------- la lista

  async function cargar() {
    try {
      salas = await SalasTorneo.listar();
    } catch (e) {
      console.error(e);
      $("salas-cargando").textContent = "No se pudieron cargar las salas. Vuelve a intentarlo recargando la página.";
      return;
    }
    $("salas-cargando").classList.add("hidden");
    pintarLista();
  }

  function boton(texto, etiqueta, clase) {
    const b = el("button", clase || "px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50 disabled:cursor-not-allowed", texto);
    b.type = "button";
    if (etiqueta) b.setAttribute("aria-label", etiqueta);
    return b;
  }

  function pintarLista() {
    const ul = $("salas-admin");
    ul.innerHTML = "";
    $("salas-admin-vacio").classList.toggle("hidden", salas.length > 0);
    salas.forEach((s, i) => {
      const li = el("li", "py-3 flex flex-wrap items-center gap-3");
      li.dataset.sala = s.clave;
      const emoji = el("span", "text-2xl w-8 text-center", s.emoji || "🏆");
      emoji.setAttribute("aria-hidden", "true");
      li.appendChild(emoji);
      const info = el("div", "min-w-0 flex-1");
      info.appendChild(el("p", "font-semibold text-brand-800 dark:text-white truncate", s.nombre));
      const datos = el("p", "text-xs text-brand-500 dark:text-brand-300");
      datos.textContent = (s.tipo === "lichess" ? "Lichess · sala de cine" : "Enlaces · " + (s.enlaces || []).length + " botón" + ((s.enlaces || []).length === 1 ? "" : "es")) +
        " · " + s.clave;
      info.appendChild(datos);
      li.appendChild(info);
      const estado = el("span", "text-xs font-semibold px-2 py-0.5 rounded-full " +
        (s.visible ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" : "bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200"),
        s.visible ? "Publicada" : "Oculta");
      li.appendChild(estado);

      const acciones = el("div", "flex flex-wrap gap-1.5");
      const subir = boton("↑", "Subir " + s.nombre);
      subir.disabled = i === 0;
      subir.addEventListener("click", () => mover(i, -1));
      const bajar = boton("↓", "Bajar " + s.nombre);
      bajar.disabled = i === salas.length - 1;
      bajar.addEventListener("click", () => mover(i, 1));
      const editar = boton("Editar");
      editar.setAttribute("aria-label", "Editar " + s.nombre);
      editar.addEventListener("click", () => abrirEditor(s));
      const ver = boton(s.visible ? "Ocultar" : "Publicar");
      ver.setAttribute("aria-label", (s.visible ? "Ocultar " : "Publicar ") + s.nombre);
      ver.addEventListener("click", () => cambiarVisible(s));
      const borrar = boton("Borrar", "Borrar " + s.nombre, "px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-950 dark:hover:bg-red-900 text-red-700 dark:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
      borrar.addEventListener("click", () => borrarSala(s));
      [subir, bajar, editar, ver, borrar].forEach((b) => acciones.appendChild(b));
      if (s.tipo === "lichess") {
        const abrir = el("a", "px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Abrir la sala ↗");
        abrir.href = "transmision.html?torneo=" + encodeURIComponent(s.clave);
        abrir.target = "_blank";
        abrir.rel = "noopener";
        abrir.appendChild(el("span", "sr-only", " de " + s.nombre + " (se abre en otra pestaña)"));
        acciones.appendChild(abrir);
      }
      li.appendChild(acciones);
      ul.appendChild(li);
    });
  }

  function errorDeBase(error) {
    if (error && error.code === "23505") return "Ya hay otra sala con esa dirección. Cambia la dirección de la sala.";
    if (error && error.code === "23514") return "La base rechazó algún dato: revisa que los enlaces empiecen con https:// y que la dirección de la sala tenga solo minúsculas, números y guiones.";
    if (error && error.code === "42501") return "Tu cuenta no tiene permiso para cambiar las salas.";
    return "No se pudo guardar. Vuelve a intentarlo.";
  }

  // Intercambia el orden con la vecina. Dos filas, dos updates; si falla uno
  // se vuelve a leer la lista, que es lo que de verdad quedó.
  async function mover(i, paso) {
    const a = salas[i], b = salas[i + paso];
    if (!a || !b) return;
    // Si las dos tienen el mismo orden, intercambiarlo no cambia nada: se
    // renumera por la posición en la lista.
    const oa = a.orden === b.orden ? i : a.orden;
    const ob = a.orden === b.orden ? i + paso : b.orden;
    const r1 = await sb.from("salas_torneo").update({ orden: ob }).eq("id", a.id);
    const r2 = r1.error ? r1 : await sb.from("salas_torneo").update({ orden: oa }).eq("id", b.id);
    if (r1.error || r2.error) Avisos.avisar(errorDeBase(r1.error || r2.error), { tipo: "error" });
    await cargar();
    const fila = document.querySelector('#salas-admin li[data-sala="' + CSS.escape(a.clave) + '"] button[aria-label^="' + (paso < 0 ? "Subir" : "Bajar") + '"]');
    if (fila && !fila.disabled) fila.focus();
  }

  async function cambiarVisible(s) {
    const { error } = await sb.from("salas_torneo").update({ visible: !s.visible }).eq("id", s.id);
    if (error) { Avisos.avisar(errorDeBase(error), { tipo: "error" }); return; }
    Avisos.avisar(s.visible ? "«" + s.nombre + "» ya no se ve en Torneos." : "«" + s.nombre + "» ya se ve en Torneos.", { tipo: "ok" });
    await cargar();
  }

  async function borrarSala(s) {
    const ok = await Avisos.confirmar("Deja de verse en Torneos y su dirección deja de funcionar. Si solo quieres quitarla por un tiempo, usa «Ocultar».",
      { titulo: "¿Borrar la sala «" + s.nombre + "»?", aceptar: "Borrar la sala", peligro: true });
    if (!ok) return;
    const { error } = await sb.from("salas_torneo").delete().eq("id", s.id);
    if (error) { Avisos.avisar(errorDeBase(error), { tipo: "error" }); return; }
    if (editando && editando.id === s.id) cerrarEditor();
    Avisos.avisar("Sala borrada.", { tipo: "ok" });
    await cargar();
  }

  // ---------------------------------------------------------------- el editor

  /* Dos listas de pares con la misma forma: los botones de enlaces (texto y
   * dirección) y las pizarras de chess-results (título y dirección). */
  const LISTAS = {
    enlaces: { ul: "sala-enlaces", mas: "sala-enlace-mas", max: 6, campo: "texto", largo: 60,
      etiqueta: "Texto del botón", direccion: "Dirección del botón", quitar: "Quitar el botón", ejemplo: "https://…" },
    pizarras: { ul: "sala-pizarras", mas: "sala-pizarra-mas", max: 4, campo: "titulo", largo: 40,
      etiqueta: "Título de la pizarra", direccion: "Dirección en chess-results", quitar: "Quitar la pizarra", ejemplo: "https://chess-results.com/tnr123456.aspx" },
  };
  // Lo mismo que interno.pizarras_de_sala_validas en la base.
  const URL_CHESS_RESULTS = /^https:\/\/(s[0-9]{1,2}\.)?chess-results\.com\/tnr[0-9]{1,9}\.aspx(\?[^\s"<>]*)?$/;

  let serieFilas = 0;
  function fila(lista, datos) {
    const L = LISTAS[lista];
    const li = el("li", "grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-2 items-end rounded-lg sm:rounded-none border sm:border-0 border-brand-100 dark:border-brand-800 p-2 sm:p-0");
    const clase = "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:ring-2 focus:ring-accent-500 outline-none";
    serieFilas += 1;
    const c1 = el("div");
    const l1 = el("label", "block text-xs text-brand-500 dark:text-brand-300 mb-1");
    const t = el("input", clase);
    t.type = "text"; t.maxLength = L.largo; t.value = datos[L.campo] || ""; t.dataset.campo = "texto";
    t.id = L.ul + "-texto-" + serieFilas;
    l1.htmlFor = t.id;
    c1.appendChild(l1); c1.appendChild(t);
    const c2 = el("div");
    const l2 = el("label", "block text-xs text-brand-500 dark:text-brand-300 mb-1");
    const u = el("input", clase);
    u.type = "url"; u.inputMode = "url"; u.maxLength = 500; u.placeholder = L.ejemplo; u.value = datos.url || ""; u.dataset.campo = "url";
    u.id = L.ul + "-url-" + serieFilas;
    u.autocapitalize = "off"; u.spellcheck = false;
    l2.htmlFor = u.id;
    c2.appendChild(l2); c2.appendChild(u);
    const quitar = boton("Quitar");
    quitar.addEventListener("click", () => {
      li.remove();
      renumerar(lista);
      pintarPrevia();
      $(L.mas).focus();
    });
    li.appendChild(c1); li.appendChild(c2); li.appendChild(quitar);
    [t, u].forEach((i) => i.addEventListener("input", pintarPrevia));
    return li;
  }

  function renumerar(lista) {
    const L = LISTAS[lista];
    const filas = document.querySelectorAll("#" + L.ul + " li");
    filas.forEach((li, i) => {
      const [l1, l2] = li.querySelectorAll("label");
      l1.textContent = L.etiqueta + " " + (i + 1);
      l2.textContent = L.direccion + " " + (i + 1);
      li.querySelector("button").setAttribute("aria-label", L.quitar + " " + (i + 1));
    });
    $(L.mas).classList.toggle("hidden", filas.length >= L.max);
  }

  // Las filas con algo escrito (las del todo vacías no cuentan), cada una con
  // su <li>, para poder llevar el foco a la que tiene el problema.
  function filasCon(lista) {
    const L = LISTAS[lista];
    return [...document.querySelectorAll("#" + L.ul + " li")].map((li) => ({
      li,
      valor: { [L.campo]: li.querySelector('[data-campo="texto"]').value.trim(), url: li.querySelector('[data-campo="url"]').value.trim() },
    })).filter((f) => f.valor[L.campo] || f.valor.url);
  }

  function valoresDe(lista) { return filasCon(lista).map((f) => f.valor); }

  function llenar(lista, valores) {
    const L = LISTAS[lista];
    $(L.ul).innerHTML = "";
    (valores || []).forEach((v) => $(L.ul).appendChild(fila(lista, v)));
    renumerar(lista);
  }

  function agregar(lista) {
    const L = LISTAS[lista];
    if (document.querySelectorAll("#" + L.ul + " li").length >= L.max) return;
    const li = fila(lista, {});
    $(L.ul).appendChild(li);
    renumerar(lista);
    li.querySelector("input").focus();
    pintarPrevia();
  }

  function pintarTipo() {
    const lichess = tipoElegido() === "lichess";
    $("sala-lichess-caja").classList.toggle("hidden", !lichess);
    $("sala-pizarras-caja").classList.toggle("hidden", !lichess);
    $("sala-enlaces-ayuda").textContent = lichess
      ? "Opcional: botones de más debajo de «Entrar a la sala», por ejemplo «Verlo directo en Lichess»."
      : "Al menos uno: cada botón abre su transmisión en otra pestaña (por ejemplo «Partida masculina» y «Partida femenina»).";
    pintarPrevia();
  }

  function salaDelFormulario() {
    const lichess = SalasTorneo.idDeLichess($("sala-lichess").value);
    return {
      clave: $("sala-clave").value.trim(),
      nombre: $("sala-nombre").value.trim(),
      descripcion: $("sala-descripcion").value.trim(),
      emoji: $("sala-emoji").value.trim() || "🏆",
      tipo: tipoElegido(),
      lichess_id: lichess && lichess.es === "torneo" ? lichess.id : (lichessComprobado ? lichessComprobado.id : null),
      enlaces: valoresDe("enlaces"),
      pizarras: valoresDe("pizarras"),
      visible: $("sala-visible").checked,
    };
  }

  function pintarPrevia() {
    const caja = $("sala-previa");
    caja.innerHTML = "";
    const ul = el("ul");
    ul.appendChild(SalasTorneo.ficha(salaDelFormulario()));
    caja.appendChild(ul);
  }

  function abrirEditor(sala) {
    editando = sala || null;
    claveTocada = !!sala;
    lichessComprobado = sala && sala.lichess_id ? { id: sala.lichess_id } : null;
    $("sala-editor-titulo").textContent = sala ? "Editar «" + sala.nombre + "»" : "Nueva sala";
    $("sala-emoji").value = sala ? sala.emoji : "🏆";
    $("sala-nombre").value = sala ? sala.nombre : "";
    $("sala-descripcion").value = sala ? sala.descripcion : "";
    $("sala-clave").value = sala ? sala.clave : "";
    $("sala-lichess").value = sala && sala.lichess_id ? sala.lichess_id : "";
    $("sala-lichess-estado").textContent = sala && sala.lichess_id ? "Transmisión " + sala.lichess_id + "." : "";
    document.querySelectorAll('input[name="sala-tipo"]').forEach((r) => { r.checked = r.value === (sala ? sala.tipo : "lichess"); });
    $("sala-visible").checked = sala ? sala.visible : true;
    llenar("enlaces", sala ? sala.enlaces : []);
    llenar("pizarras", sala ? sala.pizarras : []);
    $("sala-msg").textContent = "";
    $("sala-editor").classList.remove("hidden");
    $("sala-nueva").setAttribute("aria-expanded", "true");
    pintarTipo();
    $("sala-editor").scrollIntoView({ block: "start" });
    $("sala-nombre").focus();
  }

  function cerrarEditor() {
    editando = null;
    $("sala-editor").classList.add("hidden");
    $("sala-nueva").setAttribute("aria-expanded", "false");
  }

  function decir(texto, error) {
    const m = $("sala-msg");
    m.textContent = texto;
    m.className = "text-sm mt-4 " + (error ? "text-red-700 dark:text-red-300 font-semibold" : "text-green-800 dark:text-green-300 font-semibold");
  }

  // Lo mismo que exige la base (interno.enlaces_de_sala_validos y los check
  // de salas_torneo), dicho en palabras antes de mandar.
  function problemas(sala) {
    if (sala.nombre.length < 2) return ["sala-nombre", "Escribe el nombre del torneo."];
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(sala.clave)) return ["sala-clave", "La dirección de la sala lleva solo minúsculas, números y guiones (por ejemplo «copa-2026»)."];
    if (sala.tipo === "lichess" && !sala.lichess_id) {
      return ["sala-lichess", "Pega la dirección de la transmisión de Lichess (lichess.org/broadcast/…) y usa «Comprobar en Lichess»."];
    }
    if (sala.tipo === "enlaces" && !sala.enlaces.length) return ["sala-enlace-mas", "Agrega al menos un botón con su dirección."];
    const campo = (f, cual) => f.li.querySelector('[data-campo="' + cual + '"]').id;
    const enlaces = filasCon("enlaces");
    for (let i = 0; i < enlaces.length; i++) {
      const e = enlaces[i].valor;
      if (!e.texto) return [campo(enlaces[i], "texto"), "Al botón " + (i + 1) + " le falta el texto."];
      if (!/^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/[^\s"<>]*)?$/.test(e.url)) {
        return [campo(enlaces[i], "url"), "La dirección del botón " + (i + 1) + " tiene que empezar con https:// y no llevar espacios."];
      }
    }
    if (sala.tipo === "lichess") {
      const pizarras = filasCon("pizarras");
      for (let i = 0; i < pizarras.length; i++) {
        const p = pizarras[i].valor;
        if (!p.titulo) return [campo(pizarras[i], "texto"), "A la pizarra " + (i + 1) + " le falta el título (por ejemplo «Femenino»)."];
        if (!URL_CHESS_RESULTS.test(p.url) || p.url.length > 400) {
          return [campo(pizarras[i], "url"), "La dirección de la pizarra " + (i + 1) + " tiene que ser la de un torneo de chess-results (https://…chess-results.com/tnr….aspx)."];
        }
      }
    }
    return null;
  }

  async function guardar(ev) {
    ev.preventDefault();
    const sala = salaDelFormulario();
    const p = problemas(sala);
    if (p) {
      decir(p[1], true);
      const campo = p[0] && $(p[0]);
      if (campo) campo.focus();
      return;
    }
    const fila = {
      clave: sala.clave, nombre: sala.nombre, descripcion: sala.descripcion, emoji: sala.emoji,
      tipo: sala.tipo, lichess_id: sala.tipo === "lichess" ? sala.lichess_id : null,
      enlaces: sala.enlaces, pizarras: sala.tipo === "lichess" ? sala.pizarras : [], visible: sala.visible,
    };
    $("sala-guardar").disabled = true;
    let r;
    if (editando) {
      r = await sb.from("salas_torneo").update(fila).eq("id", editando.id).select("id");
    } else {
      fila.orden = salas.reduce((m, s) => Math.max(m, s.orden || 0), 0) + 1;
      r = await sb.from("salas_torneo").insert(fila).select("id");
    }
    $("sala-guardar").disabled = false;
    if (r.error) { decir(errorDeBase(r.error), true); return; }
    // Un update que la RLS no deja pasar no da error: no toca ninguna fila.
    if (!r.data || !r.data.length) { decir("No se guardó: tu cuenta no tiene permiso para cambiar las salas.", true); return; }
    const nombre = sala.nombre;
    cerrarEditor();
    await cargar();
    Avisos.avisar("Sala «" + nombre + "» guardada." + (sala.visible ? " Ya se ve en Torneos." : " Está oculta: publícala cuando esté lista."), { tipo: "ok" });
    const fila2 = document.querySelector('#salas-admin li[data-sala="' + CSS.escape(sala.clave) + '"] button[aria-label^="Editar"]');
    if (fila2) fila2.focus();
  }

  // Le pregunta a Lichess por la transmisión: confirma que existe, trae su
  // nombre, y si lo que se pegó es la dirección de UNA ronda, averigua de qué
  // torneo es (la sala se guarda con el del torneo, que trae todas las rondas).
  async function comprobarLichess() {
    const estado = $("sala-lichess-estado");
    const leido = SalasTorneo.idDeLichess($("sala-lichess").value);
    lichessComprobado = null;
    if (!leido) {
      estado.textContent = "Esa no parece una dirección de transmisión de Lichess (lichess.org/broadcast/…).";
      pintarPrevia();
      return;
    }
    estado.textContent = "Preguntando a Lichess…";
    const url = leido.es === "torneo"
      ? "https://lichess.org/api/broadcast/" + encodeURIComponent(leido.id)
      : "https://lichess.org/api" + leido.ruta;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Lichess respondió " + res.status);
      const datos = await res.json();
      const tour = datos.tour || {};
      if (!/^[A-Za-z0-9]{8}$/.test(tour.id || "")) throw new Error("Sin id de torneo");
      lichessComprobado = { id: tour.id, nombre: tour.name || "" };
      const rondas = Array.isArray(datos.rounds) ? datos.rounds.length : null;
      estado.textContent = "✓ «" + (tour.name || tour.id) + "»" + (rondas != null ? ", " + rondas + (rondas === 1 ? " ronda" : " rondas") : "") + ". Transmisión " + tour.id + ".";
      if (leido.es === "ronda") estado.textContent += " (Pegaste la dirección de una ronda: la sala muestra el torneo entero.)";
      if (!$("sala-nombre").value.trim() && tour.name) {
        $("sala-nombre").value = tour.name;
        if (!claveTocada) $("sala-clave").value = claveDe(tour.name);
      }
    } catch (e) {
      console.error(e);
      if (leido.es === "torneo") {
        lichessComprobado = { id: leido.id };
        estado.textContent = "No se pudo confirmar con Lichess ahora mismo, pero la dirección tiene la forma correcta (transmisión " + leido.id + "). Puedes guardar igual.";
      } else {
        estado.textContent = "No se pudo preguntar a Lichess de qué torneo es esa ronda. Pega la dirección del torneo (la que termina en su código, sin la ronda).";
      }
    }
    pintarPrevia();
  }

  let iniciado = false;
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    $("sala-nueva").addEventListener("click", () => {
      if ($("sala-editor").classList.contains("hidden") || editando) abrirEditor(null);
      else cerrarEditor();
    });
    $("sala-cancelar").addEventListener("click", () => { cerrarEditor(); $("sala-nueva").focus(); });
    $("sala-editor").addEventListener("submit", guardar);
    $("sala-enlace-mas").addEventListener("click", () => agregar("enlaces"));
    $("sala-pizarra-mas").addEventListener("click", () => agregar("pizarras"));
    $("sala-nombre").addEventListener("input", () => {
      if (!claveTocada) $("sala-clave").value = claveDe($("sala-nombre").value);
      pintarPrevia();
    });
    $("sala-clave").addEventListener("input", () => { claveTocada = true; pintarPrevia(); });
    ["sala-emoji", "sala-descripcion", "sala-visible"].forEach((id) => $(id).addEventListener("input", pintarPrevia));
    $("sala-lichess").addEventListener("input", () => { lichessComprobado = null; $("sala-lichess-estado").textContent = ""; pintarPrevia(); });
    // Se comprueba con su botón y no al salir del campo: el texto del
    // resultado corre el formulario, y si llega justo cuando se aprieta
    // «Guardar la sala», el clic cae en otro lado.
    $("sala-lichess-comprobar").addEventListener("click", comprobarLichess);
    document.querySelectorAll('input[name="sala-tipo"]').forEach((r) => r.addEventListener("change", pintarTipo));
    cargar();
  }

  window.AdminSalasTorneo = { iniciar, claveDe };
})();
