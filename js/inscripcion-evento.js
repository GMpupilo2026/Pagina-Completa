/* La inscripción configurable por evento: UN formulario que se arma con una
 * configuración y manda con PareoPublicar.inscribir (js/pareo/publicar.js) a
 * la Edge Function pareo-publicar. Ahí queda pendiente en
 * pareo_preinscripciones hasta que quien organiza la acepta en Pareo
 * Integral.
 *
 * Antes cada evento tenía su formulario escrito a mano (Metropolitano, JDE,
 * JDN PZ, inscripcion.html, torneos-pareo.html), y todos repetían lo mismo con
 * variaciones: la categoría por el año de nacimiento y a qué torneo va, el
 * cierre con su hora, qué campos se piden y cuáles son obligatorios (ID FIDE
 * con su búsqueda automática, sexo, nacimiento, institución con un valor por
 * defecto, comentario) y los textos. Ahora eso es configuración:
 *
 *   InscripcionEvento.montar(document.getElementById("inscribirme"), {
 *     torneo: "<id publicado>",                    // a dónde va, por omisión
 *     cierre: "2026-11-20T22:00",                  // hora de Costa Rica
 *     categorias: [{ nombre: "U12", desde: 2015, hasta: 2020, torneo: "<id>" },
 *                  { nombre: "U16", desde: 2011, hasta: 2014, torneo: "<id>", juegaEn: "U20" }],
 *     ramaEnCategoria: true,                       // «U16 Femenino»
 *     campos: { nombre: { forma: "apellidos" }, nacimiento: { obligatorio: true },
 *               sexo: { obligatorio: true }, institucion: { defecto: "ADAPZ" },
 *               fide: { buscar: true } },
 *     declaraciones: [{ id: "afiliado", texto: "Está afiliado…", nota: "Declara estar afiliado." }],
 *   });
 *
 * La configuración también puede venir del torneo publicado
 * (`datos.inscripcion` de pareo_publicados, que limpia la función en
 * inscripcion.ts): torneos-pareo.html la lee con desdePublicado(). Sin
 * configuración, el formulario es el de siempre de torneos-pareo.html.
 *
 * La función vuelve a comprobar el cierre, lo obligatorio y la categoría
 * (no se le cree al navegador). Nada de lo escrito se guarda en el
 * navegador. Lo que escribe la gente se pinta con textContent.
 *
 * Ver «La inscripción configurable por evento» en
 * docs/decisiones/cuentas-y-formularios.md: ahí está también la regla de
 * migrar cada formulario viejo en su próxima edición, nunca a medio evento.
 */
(function (raiz) {
  "use strict";

  const ZONA = "America/Costa_Rica";

  // ---------- Los textos (español de Costa Rica, con tuteo; e inglés) ----------
  const TEXTOS = {
    es: {
      titulo: "Inscribir a un jugador",
      ayuda: "Quien organiza revisa cada inscripción y te contacta si falta algo. Tu contacto lo ve solo quien organiza.",
      hastaDia: "Hasta el {f}. ",
      hastaHora: "Hasta las {h} del {f}. ",
      nombre: "Nombre de quien juega",
      apellidos: "Apellidos de quien juega",
      nombrePila: "Nombre",
      nacimiento: "Fecha de nacimiento",
      sexo: "Rama",
      sexoM: "Absoluto",
      sexoF: "Femenino",
      ramaM: "Absoluto",
      ramaF: "Femenino",
      categoria: "Categoría",
      institucion: "Colegio, escuela o club",
      elo: "Elo (si tiene)",
      fide: "ID FIDE (si tiene)",
      responsable: "Quién lo inscribe",
      contacto: "Correo o teléfono de quien inscribe",
      nota: "Algo que deba saber quien organiza",
      consentimientoAntes: "Acepto que mis datos y los de quien juega se usen para esta inscripción, como dice la ",
      consentimientoEnlace: "Política de privacidad",
      consentimientoDespues: ". Si quien juega es menor de edad, soy su encargado o tengo su permiso.",
      otraPestana: " (se abre en otra pestaña)",
      boton: "Mandar la inscripción",
      falta: "Falta un dato obligatorio (los que llevan *).",
      faltaPermiso: "Marca que aceptas la política de privacidad.",
      faltaDeclaracion: "Falta marcar la casilla: {t}",
      faltaSexo: "Elige la rama.",
      fideFormato: "El ID FIDE son solo números.",
      eloFormato: "El Elo son 3 o 4 números.",
      sinCategoria: "Con esa fecha de nacimiento no entra en ninguna categoría (es para nacidos de {d} a {h}).",
      sinTorneo: "La categoría {c} todavía no tiene su torneo listo. Vuelve a intentarlo más tarde.",
      categoriaEs: "Categoría {c}.",
      categoriaEn: "Categoría {c}: juega en el torneo {t}.",
      mandando: "Mandando…",
      enviado: "✓ Inscripción de {n} enviada. Quien organiza la revisa; si quieres, inscribe a otra persona.",
      errorRed: "No se pudo mandar. Revisa la conexión e intenta de nuevo.",
      cerrada: "La inscripción está cerrada.",
      cerroHora: "La inscripción cerró a las {h} del {f}.",
      cerroDia: "La inscripción cerró el {f}.",
      fideBuscando: "Buscando su ID FIDE y su Elo en la lista de FIDE…",
      fideError: "No pudimos buscar en la lista de FIDE ahora mismo. Si tiene ID FIDE, escríbelo a mano.",
      fideNinguno: "No aparece en la lista de FIDE: si no tiene ID FIDE, déjalo vacío (no hace falta para inscribirse).",
      fideUno: "Lo encontramos en FIDE: {d}. Si no es, corrígelo a mano.",
      fideVarios: "Hay {n} personas con ese nombre en la lista de FIDE: elige quién juega.",
      fideElegido: "Elegido: {d}.",
      fideDescribe: "{n} · ID FIDE {id} · {e}",
      fideConElo: "Elo {e}",
      fideSinElo: "sin Elo estándar",
      fideNacio: " · nació en {a}",
    },
    en: {
      titulo: "Register a player",
      ayuda: "The organizers review every registration and will contact you if anything is missing. Only the organizers see your contact details.",
      hastaDia: "Until {f}. ",
      hastaHora: "Until {h} on {f}. ",
      nombre: "Player's name",
      apellidos: "Player's surnames",
      nombrePila: "First name",
      nacimiento: "Date of birth",
      sexo: "Section",
      sexoM: "Open",
      sexoF: "Women",
      ramaM: "Open",
      ramaF: "Women",
      categoria: "Category",
      institucion: "School or club",
      elo: "Rating (if any)",
      fide: "FIDE ID (if any)",
      responsable: "Who is registering",
      contacto: "Email or phone of the person registering",
      nota: "Anything the organizers should know",
      consentimientoAntes: "I agree that my data and the player's data may be used for this registration, as stated in the ",
      consentimientoEnlace: "Privacy Policy",
      consentimientoDespues: ". If the player is a minor, I am their guardian or have their permission.",
      otraPestana: " (opens in a new tab)",
      boton: "Send the registration",
      falta: "A required field is missing (the ones marked *).",
      faltaPermiso: "Please accept the privacy policy.",
      faltaDeclaracion: "Please tick the box: {t}",
      faltaSexo: "Choose the section.",
      fideFormato: "The FIDE ID has digits only.",
      eloFormato: "The rating has 3 or 4 digits.",
      sinCategoria: "With that date of birth the player does not fit any category (it is for players born from {d} to {h}).",
      sinTorneo: "Category {c} does not have its tournament ready yet. Please try again later.",
      categoriaEs: "Category {c}.",
      categoriaEn: "Category {c}: plays in the {t} tournament.",
      mandando: "Sending…",
      enviado: "✓ Registration of {n} sent. The organizers will review it; you can register someone else if you wish.",
      errorRed: "It could not be sent. Check your connection and try again.",
      cerrada: "Registration is closed.",
      cerroHora: "Registration closed at {h} on {f}.",
      cerroDia: "Registration closed on {f}.",
      fideBuscando: "Looking up the FIDE ID and rating in the FIDE list…",
      fideError: "We could not search the FIDE list right now. If the player has a FIDE ID, type it in.",
      fideNinguno: "Not found in the FIDE list: if the player has no FIDE ID, leave it empty (it is not required).",
      fideUno: "Found in FIDE: {d}. If that is not the player, correct it.",
      fideVarios: "There are {n} people with that name in the FIDE list: choose the player.",
      fideElegido: "Chosen: {d}.",
      fideDescribe: "{n} · FIDE ID {id} · {e}",
      fideConElo: "rating {e}",
      fideSinElo: "no standard rating",
      fideNacio: " · born in {a}",
    },
  };

  // ---------- La configuración ----------
  // Los campos y lo que hace cada uno por omisión: el formulario de siempre
  // de torneos-pareo.html (nombre, centro, categoría, Elo, ID FIDE, nota).
  const CAMPOS = {
    nombre: { forma: "uno" },
    nacimiento: { pedir: false, obligatorio: false, min: "", max: "" },
    sexo: { pedir: false, obligatorio: false },
    categoria: { pedir: true },
    institucion: { pedir: true, obligatorio: false, defecto: "" },
    elo: { pedir: true },
    fide: { pedir: true, buscar: false, federacion: "CRC" },
    nota: { pedir: true, obligatorio: false },
  };
  const FORMAS = ["uno", "apellidos"];
  const NORMALIZADA = typeof Symbol === "function" ? Symbol("normalizada") : "__normalizada";

  const esObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const anio = (v) => (Number.isInteger(Number(v)) && Number(v) >= 1900 && Number(v) <= 2100 ? Number(v) : 0);
  const CIERRE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const DIA = /^\d{4}-\d{2}-\d{2}$/;

  /* La configuración completa: lo que llega encima de lo de siempre. Nunca
     lanza; lo que no tiene forma se ignora. */
  function normalizar(c) {
    const x = esObj(c) ? c : {};
    const campos = {};
    for (const [k, base] of Object.entries(CAMPOS)) {
      const dado = esObj(x.campos) && esObj(x.campos[k]) ? x.campos[k] : {};
      campos[k] = Object.assign({}, base, dado);
      // Lo obligatorio se pide aunque no lo digan.
      if (campos[k].obligatorio) campos[k].pedir = true;
    }
    if (!FORMAS.includes(campos.nombre.forma)) campos.nombre.forma = "uno";
    const categorias = (Array.isArray(x.categorias) ? x.categorias : [])
      .filter((k) => esObj(k) && String(k.nombre || "").trim() && anio(k.desde) && anio(k.hasta) && anio(k.desde) <= anio(k.hasta))
      .map((k) => ({ nombre: String(k.nombre).trim(), desde: anio(k.desde), hasta: anio(k.hasta), torneo: k.torneo ? String(k.torneo) : "", juegaEn: k.juegaEn ? String(k.juegaEn) : "" }));
    // Con categorías por año, la fecha de nacimiento es la que decide: se pide
    // y es obligatoria, y la categoría ya no se elige a mano.
    if (categorias.length) { campos.nacimiento.pedir = true; campos.nacimiento.obligatorio = true; campos.categoria.pedir = false; }
    const idioma = TEXTOS[x.idioma] ? x.idioma : "es";
    const prefijo = /^[a-z][a-z0-9-]{0,20}$/.test(String(x.prefijo || "")) ? x.prefijo : "ie";
    return {
      [NORMALIZADA]: true,
      prefijo,
      idCaja: typeof x.idCaja === "string" && x.idCaja ? x.idCaja : prefijo + "-caja",
      clase: typeof x.clase === "string" ? x.clase : "rounded-2xl bg-white dark:bg-brand-900 shadow-md p-5",
      torneo: x.torneo ? String(x.torneo) : "",
      torneos: esObj(x.torneos) ? x.torneos : {},
      abierta: x.abierta !== false,
      hasta: typeof x.hasta === "string" && DIA.test(x.hasta) ? x.hasta : "",
      cierre: typeof x.cierre === "string" && CIERRE.test(x.cierre) ? x.cierre : "",
      categorias,
      ramaEnCategoria: x.ramaEnCategoria === true,
      categoriasLibres: (Array.isArray(x.categoriasLibres) ? x.categoriasLibres : []).map((s) => String(s || "").trim()).filter(Boolean),
      campos,
      declaraciones: (Array.isArray(x.declaraciones) ? x.declaraciones : []).filter((d) => esObj(d) && d.texto)
        .map((d, i) => ({ id: /^[a-z0-9-]{1,20}$/.test(String(d.id || "")) ? d.id : "d" + i, texto: String(d.texto), nota: d.nota ? String(d.nota) : "" })),
      notaFija: typeof x.notaFija === "string" ? x.notaFija : "",
      conservar: (Array.isArray(x.conservar) ? x.conservar : []).filter((k) => ["responsable", "contacto", "institucion"].includes(k)),
      privacidad: typeof x.privacidad === "string" && /^[a-z0-9-]+\.html(#[a-z0-9-]*)?$/.test(x.privacidad) ? x.privacidad : "privacidad.html#torneos",
      idioma,
      textos: Object.assign({}, TEXTOS[idioma], esObj(x.textos) ? x.textos : {}),
      alEnviar: typeof x.alEnviar === "function" ? x.alEnviar : null,
    };
  }

  // Lo que ya pasó por normalizar() no se vuelve a armar (una marca que no
  // puede venir de un JSON: una configuración con «campos» no es una armada).
  const normalizada = (c) => (c && c[NORMALIZADA] ? c : normalizar(c));

  /* La configuración que viene del torneo publicado (`datos.inscripcion`),
     con lo que pone la página (a qué torneo va, los ids, las categorías que
     ya traen sus jugadores). */
  function desdePublicado(inscripcion, extra) {
    const i = esObj(inscripcion) ? inscripcion : {};
    const deTorneo = {};
    for (const k of ["abierta", "hasta", "cierre", "categorias", "ramaEnCategoria", "campos", "declaraciones", "notaFija", "idioma", "textos"]) {
      if (i[k] !== undefined) deTorneo[k] = i[k];
    }
    return normalizar(Object.assign({}, deTorneo, extra || {}));
  }

  const t = (cfg, clave, vars) => String(cfg.textos[clave] == null ? "" : cfg.textos[clave]).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));

  // ---------- Las cuentas (sin pantalla: las prueba el verificador) ----------
  // La categoría por el AÑO de nacimiento (como las bases de los torneos
  // escolares), o null si no entra en ninguna.
  function categoriaDe(c, nacimiento) {
    const cfg = normalizada(c);
    const a = DIA.test(String(nacimiento || "")) ? Number(String(nacimiento).slice(0, 4)) : 0;
    return (a && cfg.categorias.find((k) => a >= k.desde && a <= k.hasta)) || null;
  }

  // El torneo de Pareo al que va: el de su categoría (un id, o una clave de
  // `torneos`, que la página puede llenar después de buscar sus torneos), o
  // el del formulario.
  function torneoDe(c, categoria) {
    const cfg = normalizada(c);
    const k = categoria && categoria.torneo;
    if (k) return Object.prototype.hasOwnProperty.call(cfg.torneos, k) ? String(cfg.torneos[k] || "") : k;
    return cfg.torneo;
  }

  // «2026-11-20T14:05»: ahora, en hora de Costa Rica.
  const ahoraCR = (ahora) => (ahora || new Date()).toLocaleString("sv-SE", { timeZone: ZONA }).slice(0, 16).replace(" ", "T");

  /* ¿Recibe inscripciones ahora? `hasta` es un día (entra completo) y
     `cierre` una hora de Costa Rica (desde ese minuto, cerrada). */
  function estado(c, ahora) {
    const cfg = normalizada(c);
    if (!cfg.abierta) return { abierta: false, motivo: "cerrada" };
    const ya = ahoraCR(ahora);
    if (cfg.hasta && cfg.hasta < ya.slice(0, 10)) return { abierta: false, motivo: "hasta" };
    if (cfg.cierre && ya >= cfg.cierre) return { abierta: false, motivo: "cierre" };
    return { abierta: true, motivo: "" };
  }

  const fechaTexto = (dia) => (raiz.HoraCR ? raiz.HoraCR.fecha(dia) : new Date(dia + "T12:00:00-06:00").toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA }));
  const horaTexto = (cierre) => {
    const d = new Date(cierre + ":00-06:00");
    return raiz.HoraCR ? raiz.HoraCR.hora(d) : d.toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", timeZone: ZONA });
  };
  // Lo que dice arriba del formulario sobre el cierre.
  function textoCierre(cfg, ahora) {
    const e = estado(cfg, ahora);
    if (!e.abierta) {
      if (e.motivo === "cierre") return t(cfg, "cerroHora", { h: horaTexto(cfg.cierre), f: fechaTexto(cfg.cierre.slice(0, 10)) });
      if (e.motivo === "hasta") return t(cfg, "cerroDia", { f: fechaTexto(cfg.hasta) });
      return t(cfg, "cerrada");
    }
    // El cierre que llega primero.
    if (cfg.cierre && (!cfg.hasta || cfg.cierre.slice(0, 10) <= cfg.hasta)) return t(cfg, "hastaHora", { h: horaTexto(cfg.cierre), f: fechaTexto(cfg.cierre.slice(0, 10)) });
    if (cfg.hasta) return t(cfg, "hastaDia", { f: fechaTexto(cfg.hasta) });
    return "";
  }

  const limpio = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");

  /* De lo escrito a lo que se manda: { torneo, inscripcion } o
     { error, campo } con el campo que hay que corregir. `v` son los valores
     del formulario: nombre, apellidos, nacimiento, sexo, categoria,
     institucion, elo, fide, responsable, contacto, nota, declaraciones
     ({ id: true }) y permiso. */
  function armarEnvio(c, v, ahora) {
    const cfg = normalizada(c);
    const k = cfg.campos;
    const x = v || {};
    if (!estado(cfg, ahora).abierta) return { error: textoCierre(cfg, ahora) || t(cfg, "cerrada"), campo: "" };
    const nombre = k.nombre.forma === "apellidos"
      ? (limpio(x.apellidos) && limpio(x.nombre) ? limpio(x.apellidos) + ", " + limpio(x.nombre) : "")
      : limpio(x.nombre);
    // Lo obligatorio, en el orden del formulario.
    const obligatorios = [
      [k.nombre.forma === "apellidos" ? "apellidos" : "nombre", k.nombre.forma === "apellidos" ? limpio(x.apellidos).length >= 2 : nombre.length >= 2],
    ];
    if (k.nombre.forma === "apellidos") obligatorios.push(["nombre", limpio(x.nombre).length >= 1]);
    if (k.nacimiento.obligatorio) obligatorios.push(["nacimiento", DIA.test(String(x.nacimiento || ""))]);
    if (k.institucion.pedir && k.institucion.obligatorio) obligatorios.push(["institucion", limpio(x.institucion).length >= 2]);
    obligatorios.push(["responsable", limpio(x.responsable).length >= 2], ["contacto", limpio(x.contacto).length >= 5]);
    if (k.nota.pedir && k.nota.obligatorio) obligatorios.push(["nota", limpio(x.nota).length >= 2]);
    const falta = obligatorios.find(([, bien]) => !bien);
    if (falta) return { error: t(cfg, "falta"), campo: falta[0] };
    if (k.sexo.obligatorio && !["M", "F"].includes(x.sexo)) return { error: t(cfg, "faltaSexo"), campo: "sexo" };
    const fide = limpio(x.fide), elo = limpio(x.elo);
    if (k.fide.pedir && fide && !/^\d{1,12}$/.test(fide)) return { error: t(cfg, "fideFormato"), campo: "fide" };
    if (k.elo.pedir && elo && !/^\d{3,4}$/.test(elo)) return { error: t(cfg, "eloFormato"), campo: "elo" };
    // La categoría: por el año, si el evento las tiene; si no, la elegida.
    let categoria = k.categoria.pedir ? limpio(x.categoria).slice(0, 30) : "";
    let cat = null;
    if (cfg.categorias.length) {
      cat = categoriaDe(cfg, x.nacimiento);
      if (!cat) {
        const desde = Math.min(...cfg.categorias.map((q) => q.desde)), hasta = Math.max(...cfg.categorias.map((q) => q.hasta));
        return { error: t(cfg, "sinCategoria", { d: desde, h: hasta }), campo: "nacimiento" };
      }
      categoria = cat.nombre + (cfg.ramaEnCategoria && ["M", "F"].includes(x.sexo) ? " " + (x.sexo === "F" ? t(cfg, "ramaF") : t(cfg, "ramaM")) : "");
    }
    const torneo = torneoDe(cfg, cat);
    if (!/^[0-9a-f-]{36}$/.test(torneo)) return { error: t(cfg, "sinTorneo", { c: cat ? cat.nombre : "" }), campo: "" };
    const decl = x.declaraciones || {};
    const sinMarcar = cfg.declaraciones.find((d) => !decl[d.id]);
    if (sinMarcar) return { error: t(cfg, "faltaDeclaracion", { t: sinMarcar.texto }), campo: "decl-" + sinMarcar.id };
    if (!x.permiso) return { error: t(cfg, "faltaPermiso"), campo: "permiso" };
    const nota = [k.nota.pedir ? limpio(x.nota) : "", ...cfg.declaraciones.map((d) => d.nota), cfg.notaFija].filter(Boolean).join(" ").slice(0, 300);
    const inscripcion = {
      nombre,
      institucion: k.institucion.pedir ? limpio(x.institucion) : "",
      categoria,
      elo: k.elo.pedir && elo ? Number(elo) : 0,
      fideId: k.fide.pedir ? fide : "",
      responsable: limpio(x.responsable),
      contacto: limpio(x.contacto),
      nota,
    };
    if (k.sexo.pedir && ["M", "F"].includes(x.sexo)) inscripcion.sexo = x.sexo;
    if (k.nacimiento.pedir && DIA.test(String(x.nacimiento || ""))) inscripcion.nacimiento = x.nacimiento;
    return { torneo, inscripcion, categoria: cat };
  }

  // ---------- El ID FIDE y el Elo, solos (PareoEloNacional) ----------
  // Igual que en la Eliminatoria JDN de Pérez Zeledón: cuentan los de la
  // federación del evento cuyo nombre trae todos los apellidos y el primer
  // nombre escritos. Con la forma «uno», todas las palabras escritas.
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palabras = (s) => sinTildes(s).replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  function coincideFide(fila, apellidos, nombre, federacion) {
    const fed = federacion == null ? "CRC" : federacion;
    if (fed && fila.fed && fila.fed !== fed) return false;
    const suyas = new Set(palabras(fila.nombre));
    const primero = palabras(nombre)[0];
    return palabras(apellidos).every((w) => suyas.has(w)) && (!primero || suyas.has(primero));
  }

  // ---------- La pantalla ----------
  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "texto") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }
  const C = {
    campo: "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-900 text-brand-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    enlace: "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    nota: "text-sm text-brand-600 dark:text-brand-300",
    boton: "bg-accent-500 hover:bg-accent-600 text-brand-900 font-bold px-5 py-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-800 focus-visible:ring-offset-2 disabled:opacity-50",
  };

  /* La caja con el formulario, lista para poner en la página. */
  function caja(config) {
    const cfg = normalizada(config);
    const k = cfg.campos;
    const p = cfg.prefijo;
    const id = (s) => p + "-" + s;
    const campo = (cid, etiqueta, control, obligatorio) => el("div", {},
      el("label", { for: cid, class: "block text-sm font-semibold mb-1" }, etiqueta, obligatorio ? el("span", { "aria-hidden": "true", texto: " *" }) : null), control);
    const entrada = (cid, extra) => el("input", Object.assign({ id: cid, type: "text", autocomplete: "off", class: C.campo + " w-full" }, extra || {}));
    const req = (si) => (si ? { required: true, "aria-required": "true" } : {});

    const avisoCierre = el("p", { id: id("cierre"), class: C.nota + " mb-3", role: "status", texto: textoCierre(cfg) + t(cfg, "ayuda") });
    const contenedor = el("section", { id: cfg.idCaja, class: cfg.clase, "aria-labelledby": cfg.idCaja + "-titulo", "data-inscripcion-evento": "" },
      el("h2", { id: cfg.idCaja + "-titulo", class: "font-serif text-xl font-bold mb-1", texto: t(cfg, "titulo") }), avisoCierre);

    const filas = [];
    if (k.nombre.forma === "apellidos") {
      filas.push(campo(id("apellidos"), t(cfg, "apellidos"), entrada(id("apellidos"), Object.assign({ maxlength: "60" }, req(true))), true));
      filas.push(campo(id("nombre"), t(cfg, "nombrePila"), entrada(id("nombre"), Object.assign({ maxlength: "40" }, req(true))), true));
    } else {
      filas.push(campo(id("nombre"), t(cfg, "nombre"), entrada(id("nombre"), Object.assign({ maxlength: "100" }, req(true))), true));
    }
    let estadoCategoria = null;
    if (k.nacimiento.pedir) {
      const extra = { type: "date" };
      // Los años de las categorías ponen los límites del campo.
      if (cfg.categorias.length) {
        extra.min = Math.min(...cfg.categorias.map((q) => q.desde)) + "-01-01";
        extra.max = Math.max(...cfg.categorias.map((q) => q.hasta)) + "-12-31";
      }
      if (DIA.test(k.nacimiento.min || "")) extra.min = k.nacimiento.min;
      if (DIA.test(k.nacimiento.max || "")) extra.max = k.nacimiento.max;
      filas.push(campo(id("nacimiento"), t(cfg, "nacimiento"), entrada(id("nacimiento"), Object.assign(extra, req(k.nacimiento.obligatorio))), k.nacimiento.obligatorio));
      if (cfg.categorias.length) estadoCategoria = el("p", { id: id("categoria-estado"), class: "sm:col-span-2 text-sm font-bold", role: "status", "aria-live": "polite" });
    }
    if (k.sexo.pedir) {
      const opcion = (v) => el("label", { class: "inline-flex items-center gap-2 mr-4" },
        el("input", { type: "radio", name: id("sexo"), id: id("sexo-" + v), value: v, class: "w-4 h-4" }), t(cfg, v === "M" ? "sexoM" : "sexoF"));
      filas.push(el("fieldset", { id: id("sexo"), class: "text-sm" },
        el("legend", { class: "block text-sm font-semibold mb-1" }, t(cfg, "sexo"), k.sexo.obligatorio ? el("span", { "aria-hidden": "true", texto: " *" }) : null),
        opcion("M"), opcion("F")));
    }
    if (estadoCategoria) filas.push(estadoCategoria);
    if (k.categoria.pedir && !cfg.categorias.length) {
      const control = cfg.categoriasLibres.length
        ? el("select", { id: id("categoria"), class: C.campo + " w-full" }, el("option", { value: "", texto: "—" }), cfg.categoriasLibres.map((q) => el("option", { value: q, texto: q })))
        : entrada(id("categoria"), { maxlength: "30" });
      filas.push(campo(id("categoria"), t(cfg, "categoria"), control));
    }
    if (k.institucion.pedir) {
      const inst = entrada(id("institucion"), Object.assign({ maxlength: "100" }, req(k.institucion.obligatorio)));
      // Como atributo: form.reset() lo deja de nuevo al inscribir al siguiente.
      if (k.institucion.defecto) inst.setAttribute("value", String(k.institucion.defecto));
      filas.push(campo(id("institucion"), t(cfg, "institucion"), inst, k.institucion.obligatorio));
    }
    if (k.elo.pedir) filas.push(campo(id("elo"), t(cfg, "elo"), entrada(id("elo"), { inputmode: "numeric", maxlength: "4" })));
    let fideEstado = null, fideOpciones = null;
    if (k.fide.pedir) {
      const fideCampo = campo(id("fide"), t(cfg, "fide"), entrada(id("fide"), { inputmode: "numeric", maxlength: "12" }));
      if (k.fide.buscar) {
        fideEstado = el("p", { id: id("fide-estado"), class: "text-sm mt-1", role: "status", "aria-live": "polite" });
        fideOpciones = el("ul", { id: id("fide-opciones"), class: "mt-2 grid gap-2" });
        fideCampo.append(fideEstado, fideOpciones);
      }
      filas.push(fideCampo);
    }
    filas.push(campo(id("responsable"), t(cfg, "responsable"), entrada(id("responsable"), Object.assign({ maxlength: "100" }, req(true))), true));
    filas.push(campo(id("contacto"), t(cfg, "contacto"), entrada(id("contacto"), Object.assign({ maxlength: "120" }, req(true))), true));
    if (k.nota.pedir) filas.push(campo(id("nota"), t(cfg, "nota"), entrada(id("nota"), Object.assign({ maxlength: "300" }, req(k.nota.obligatorio))), k.nota.obligatorio));

    const declaraciones = cfg.declaraciones.map((d) => el("div", { class: "flex items-start gap-2 text-sm mt-3" },
      el("input", { type: "checkbox", id: id("decl-" + d.id), class: "mt-1", required: true }),
      el("label", { for: id("decl-" + d.id), texto: d.texto })));
    const permiso = el("input", { type: "checkbox", id: id("permiso"), class: "mt-1", required: true });
    const estadoTxt = el("p", { id: id("estado"), class: "text-sm font-semibold mt-3", role: "status" });
    const enviar = el("button", { type: "submit", id: id("enviar"), class: C.boton }, t(cfg, "boton"));
    const form = el("form", { id: id("form"), novalidate: true },
      el("div", { class: "grid sm:grid-cols-2 gap-3" }, filas),
      declaraciones,
      el("div", { class: "flex items-start gap-2 text-sm mt-3" }, permiso,
        el("label", { for: id("permiso") }, t(cfg, "consentimientoAntes"),
          el("a", { href: cfg.privacidad, target: "_blank", rel: "noopener", class: C.enlace }, t(cfg, "consentimientoEnlace"), el("span", { class: "sr-only", texto: t(cfg, "otraPestana") })),
          t(cfg, "consentimientoDespues"))),
      el("div", { class: "mt-3" }, enviar), estadoTxt);
    contenedor.append(form);

    const $ = (s) => form.querySelector("#" + id(s));
    const valor = (s) => { const n = $(s); return n ? n.value : ""; };
    const sexo = () => { const n = form.querySelector('input[name="' + id("sexo") + '"]:checked'); return n ? n.value : ""; };

    function pintarCategoria() {
      if (!estadoCategoria) return;
      const nac = valor("nacimiento");
      const cat = categoriaDe(cfg, nac);
      if (!nac) estadoCategoria.textContent = "";
      else if (!cat) estadoCategoria.textContent = t(cfg, "sinCategoria", { d: Math.min(...cfg.categorias.map((q) => q.desde)), h: Math.max(...cfg.categorias.map((q) => q.hasta)) });
      else estadoCategoria.textContent = cat.juegaEn ? t(cfg, "categoriaEn", { c: cat.nombre, t: cat.juegaEn }) : t(cfg, "categoriaEs", { c: cat.nombre });
    }
    function pintarCierre() {
      const e = estado(cfg);
      avisoCierre.textContent = textoCierre(cfg) + (e.abierta ? t(cfg, "ayuda") : "");
      enviar.disabled = !e.abierta;
    }
    if ($("nacimiento")) { $("nacimiento").addEventListener("input", pintarCategoria); $("nacimiento").addEventListener("change", pintarCategoria); }

    // La búsqueda en FIDE: al salir del campo (no a cada letra: la función
    // tiene un tope por hora). Lo escrito a mano en el ID o el Elo no se pisa.
    if (k.fide.pedir && k.fide.buscar) {
      let turno = 0;
      const memoria = new Map();
      const buscar = async (q) => {
        if (!memoria.has(q)) memoria.set(q, raiz.PareoEloNacional.buscarEnLista("fide", q));
        const r = await memoria.get(q);
        if (!r || !r.ok) memoria.delete(q);
        return r;
      };
      const poner = (fila) => {
        const fid = $("fide"), elo = $("elo");
        if (!fid.dataset.manual) fid.value = fila ? fila.fideId : "";
        if (elo && !elo.dataset.manual) elo.value = fila && fila.estandar ? String(fila.estandar) : "";
      };
      const describir = (f) => t(cfg, "fideDescribe", { n: f.nombre, id: f.fideId, e: f.estandar ? t(cfg, "fideConElo", { e: f.estandar }) : t(cfg, "fideSinElo") })
        + (f.nacimiento ? t(cfg, "fideNacio", { a: f.nacimiento }) : "");
      const completar = async () => {
        fideOpciones.replaceChildren();
        const apellidos = k.nombre.forma === "apellidos" ? limpio(valor("apellidos")) : limpio(valor("nombre"));
        const nombre = k.nombre.forma === "apellidos" ? limpio(valor("nombre")) : "";
        if (apellidos.length < 3 || (k.nombre.forma === "apellidos" && !nombre) || !raiz.PareoEloNacional) { fideEstado.textContent = ""; return; }
        const n = ++turno;
        fideEstado.textContent = t(cfg, "fideBuscando");
        const fed = k.fide.federacion;
        let r = await buscar(nombre ? apellidos + ", " + nombre.split(" ")[0] : apellidos);
        let lista = r && r.ok ? r.filas.filter((f) => coincideFide(f, apellidos, nombre, fed)) : [];
        const todos = lista.filter((f) => { const suyas = new Set(palabras(f.nombre)); return palabras(nombre).every((w) => suyas.has(w)); });
        if (todos.length) lista = todos;
        if (r && r.ok && !lista.length && nombre) {
          r = await buscar(apellidos);
          lista = r && r.ok ? r.filas.filter((f) => coincideFide(f, apellidos, "", fed)) : [];
        }
        if (n !== turno) return; // ya escribió otro nombre
        if (!r || !r.ok) { fideEstado.textContent = t(cfg, "fideError"); return; }
        const a = /^\d{4}/.test(valor("nacimiento")) ? Number(valor("nacimiento").slice(0, 4)) : 0;
        if (a && lista.length > 1 && lista.some((f) => f.nacimiento === a)) lista = lista.filter((f) => f.nacimiento === a);
        if (!lista.length) { poner(null); fideEstado.textContent = t(cfg, "fideNinguno"); return; }
        if (lista.length === 1) { poner(lista[0]); fideEstado.textContent = t(cfg, "fideUno", { d: describir(lista[0]) }); return; }
        poner(null);
        fideEstado.textContent = t(cfg, "fideVarios", { n: lista.length });
        lista.slice(0, 8).forEach((f) => {
          const b = el("button", { type: "button", class: "text-left text-sm " + C.enlace, "data-fide": f.fideId, texto: describir(f) });
          b.addEventListener("click", () => { poner(f); fideOpciones.replaceChildren(); fideEstado.textContent = t(cfg, "fideElegido", { d: describir(f) }); });
          fideOpciones.append(el("li", {}, b));
        });
      };
      (k.nombre.forma === "apellidos" ? ["apellidos", "nombre"] : ["nombre"]).forEach((s) => $(s).addEventListener("change", completar));
      if ($("nacimiento")) $("nacimiento").addEventListener("change", () => { if (fideOpciones.children.length) completar(); });
      ["fide", "elo"].forEach((s) => { const n = $(s); if (n) n.addEventListener("input", () => { if (n.value.trim()) n.dataset.manual = "si"; else delete n.dataset.manual; }); });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const declaradas = {};
      cfg.declaraciones.forEach((d) => { declaradas[d.id] = $("decl-" + d.id).checked; });
      const r = armarEnvio(cfg, {
        nombre: valor("nombre"), apellidos: valor("apellidos"), nacimiento: valor("nacimiento"), sexo: sexo(), categoria: valor("categoria"),
        institucion: valor("institucion"), elo: valor("elo"), fide: valor("fide"), responsable: valor("responsable"), contacto: valor("contacto"),
        nota: valor("nota"), declaraciones: declaradas, permiso: permiso.checked,
      });
      if (r.error) {
        estadoTxt.textContent = r.error;
        if (!estado(cfg).abierta) { pintarCierre(); return; }
        const foco = r.campo === "sexo" ? $("sexo-M") : r.campo ? $(r.campo) : null;
        if (foco) foco.focus();
        return;
      }
      enviar.disabled = true;
      estadoTxt.textContent = t(cfg, "mandando");
      const res = await raiz.PareoPublicar.inscribir(r.torneo, r.inscripcion);
      enviar.disabled = false;
      if (!res || !res.ok) { estadoTxt.textContent = (res && res.error) || t(cfg, "errorRed"); return; }
      const quien = k.nombre.forma === "apellidos" ? limpio(valor("nombre")) + " " + limpio(valor("apellidos")) : r.inscripcion.nombre;
      const guardados = cfg.conservar.map((s) => [s, valor(s)]);
      form.reset();
      guardados.forEach(([s, v]) => { if ($(s)) $(s).value = v; });
      form.querySelectorAll("[data-manual]").forEach((n) => { delete n.dataset.manual; });
      if (fideEstado) { fideEstado.textContent = ""; fideOpciones.replaceChildren(); }
      pintarCategoria();
      estadoTxt.textContent = t(cfg, "enviado", { n: quien });
      if (cfg.alEnviar) cfg.alEnviar({ torneo: r.torneo, inscripcion: r.inscripcion, categoria: r.categoria });
      $(k.nombre.forma === "apellidos" ? "apellidos" : "nombre").focus();
    });

    pintarCierre();
    return contenedor;
  }

  /* Para una página de evento: la caja dentro de `contenedor`. */
  function montar(contenedor, config) {
    const c = caja(config);
    contenedor.append(c);
    return c;
  }

  const api = { TEXTOS, normalizar, desdePublicado, categoriaDe, torneoDe, estado, ahoraCR, textoCierre, armarEnvio, coincideFide, caja, montar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.InscripcionEvento = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
