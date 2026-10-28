/* ===== Inscripción de los JDE (ajedrez): las reglas ===== */
/* Funciones puras, sin DOM: las usa js/inscripcion-jde.js (la página
 * inscripcion-jde.html) y las prueba herramientas/verificar-inscripcion-jde.js.
 *
 * Lo que revisan es lo que dice la Normativa de los Juegos Deportivos
 * Estudiantiles 2026 (documentos/jde/normativa-pjde-2026.pdf): las categorías
 * por año de nacimiento (art. 17), subir de categoría (art. 18), unir centros
 * (art. 19), las categorías de cada etapa (art. 53), los documentos y el correo
 * (art. 59), el cuerpo técnico (art. 60), que una inscripción vale todo el
 * curso lectivo (art. 61) y todo el art. 66 (ajedrez). Las reglas de grupos,
 * categorías y equipos NO se vuelven a escribir acá: son las de Pareo Integral
 * (js/pareo/grupos.js), así lo que esta página acepta es lo mismo que el
 * emparejador acepta después. Ver «La inscripción de los JDE» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 * Una inscripción es:
 *   { anio, etapa,
 *     centro:  { nombre, region, tipo, circuito, correo, telefono, privado,
 *                union: { activa, centros, matricula } },
 *     cuerpo:  [{ id, nombre, rol: "jefe"|"tecnico", sexo, funcionario, telefono }],
 *     estudiantes: [{ id, nombre, sexo, nacimiento, categoria, modalidad,
 *                     torneo, equipo, suplente, docTipo, documento, apoyo }] }
 * `categoria` y `torneo` vacíos quieren decir «la que corresponde» (se
 * calculan); solo se guardan cuando la persona eligió otra.
 */
(function (raiz) {
  "use strict";

  const G = typeof require === "function" && typeof module !== "undefined" ? require("./pareo/grupos.js") : raiz.PareoGrupos;

  const sinTildes = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const unEspacio = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  // Art. 53: las categorías que juegan ajedrez en cada etapa. En la
  // Interregional y la Nacional solo juegan B y D; la Circuital no tiene
  // ajedrez.
  const TODAS = ["A", "B", "C", "D", "E"];
  const ETAPAS = [
    { id: "institucional", nombre: "Institucional", categorias: TODAS },
    { id: "regional", nombre: "Regional", categorias: TODAS },
    { id: "interregional", nombre: "Interregional", categorias: ["B", "D"] },
    { id: "nacional", nombre: "Nacional", categorias: ["B", "D"] },
  ];
  const NOMBRE_CATEGORIA = {
    A: "A (primaria)", B: "B (primaria)", C: "C (secundaria)", D: "D (secundaria)", E: "E (secundaria)",
  };
  // Art. 59.e: los ocho documentos con que se identifica un estudiante.
  const DOCUMENTOS = [
    { id: "cedula", nombre: "Cédula de identidad" },
    { id: "tim", nombre: "Tarjeta de identidad de menores (TIM)" },
    { id: "pasaporte", nombre: "Pasaporte" },
    { id: "carne-consular", nombre: "Carné consular" },
    { id: "carne-jde", nombre: "Carné oficial de los JDE" },
    { id: "carne-centro", nombre: "Carné estudiantil del centro educativo" },
    { id: "certificacion", nombre: "Certificación del centro educativo" },
    { id: "identidad-digital", nombre: "Identidad Digital Costarricense (IDC)" },
  ];
  const TIPOS_CENTRO = [
    { id: "", nombre: "No lo sé / no importa" },
    { id: "primaria", nombre: "Escuela (primaria)" },
    { id: "secundaria", nombre: "Colegio (secundaria)" },
  ];
  const MAX_UNION = 300;      // art. 19.d
  const MAX_EQUIPOS = 2;      // art. 66.1.g: «dos equipos» clasifican
  const MAX_TITULARES = 4;    // art. 66.1.g: cuatro titulares y una suplente

  function anioDe(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
    return m && G.leerFecha(v) ? Number(m[1]) : 0;
  }

  // ---------------------------------------------------------------- estado
  let contador = 0;
  function nuevoId(prefijo) {
    contador += 1;
    return prefijo + Date.now().toString(36) + contador.toString(36) + Math.random().toString(36).slice(2, 5);
  }
  function estadoNuevo() {
    return {
      version: 1, anio: G.JDE_ANIO_NORMATIVA, etapa: "regional",
      centro: { nombre: "", region: "", tipo: "", circuito: "", correo: "", telefono: "", privado: false, union: { activa: false, centros: "", matricula: "" } },
      cuerpo: [], estudiantes: [],
    };
  }
  function estudianteNuevo(datos) {
    return Object.assign({ id: nuevoId("e"), nombre: "", sexo: "", nacimiento: "", categoria: "", modalidad: "individual", torneo: "", equipo: 1, suplente: false, docTipo: "cedula", documento: "", apoyo: false }, datos || {});
  }
  function personaNueva(datos) {
    return Object.assign({ id: nuevoId("p"), nombre: "", rol: "tecnico", sexo: "", funcionario: true, telefono: "" }, datos || {});
  }

  // Lo que viene de un borrador guardado: nunca se confía en su forma. Los id
  // son letras y números y no se repiten (se usan para enlazar etiquetas).
  function normalizar(crudo) {
    const usados = new Set();
    const idLimpio = (v, prefijo) => {
      let id = typeof v === "string" && /^[A-Za-z0-9]{1,40}$/.test(v) && !usados.has(v) ? v : nuevoId(prefijo);
      usados.add(id);
      return id;
    };
    const e = estadoNuevo();
    if (!crudo || typeof crudo !== "object") return e;
    const txt = (v, n) => unEspacio(v).slice(0, n || 160);
    if (ETAPAS.some((x) => x.id === crudo.etapa)) e.etapa = crudo.etapa;
    if (Number.isInteger(crudo.anio) && crudo.anio >= 2026 && crudo.anio <= 2040) e.anio = crudo.anio;
    const c = crudo.centro || {};
    e.centro = {
      nombre: txt(c.nombre), region: G.direccionDe(c.region) || "", tipo: ["primaria", "secundaria"].includes(c.tipo) ? c.tipo : "",
      circuito: txt(c.circuito, 60), correo: txt(c.correo, 120), telefono: txt(c.telefono, 30), privado: !!c.privado,
      union: { activa: !!(c.union && c.union.activa), centros: txt(c.union && c.union.centros, 400), matricula: String((c.union && c.union.matricula) || "").replace(/[^\d]/g, "").slice(0, 5) },
    };
    e.cuerpo = (Array.isArray(crudo.cuerpo) ? crudo.cuerpo : []).slice(0, 20).map((p) => personaNueva({
      id: idLimpio(p.id, "p"), nombre: txt(p.nombre), rol: p.rol === "jefe" ? "jefe" : "tecnico",
      sexo: p.sexo === "m" || p.sexo === "w" ? p.sexo : "", funcionario: p.funcionario !== false, telefono: txt(p.telefono, 30),
    }));
    e.estudiantes = (Array.isArray(crudo.estudiantes) ? crudo.estudiantes : []).slice(0, 400).map((s) => estudianteNuevo({
      id: idLimpio(s.id, "e"), nombre: txt(s.nombre), sexo: s.sexo === "m" || s.sexo === "w" ? s.sexo : "",
      nacimiento: anioDe(s.nacimiento) ? String(s.nacimiento) : "", categoria: TODAS.includes(s.categoria) ? s.categoria : "",
      modalidad: s.modalidad === "equipo" ? "equipo" : "individual", torneo: s.torneo === "w" || s.torneo === "m" ? s.torneo : "",
      equipo: Number(s.equipo) === 2 ? 2 : 1, suplente: !!s.suplente, docTipo: DOCUMENTOS.some((d) => d.id === s.docTipo) ? s.docTipo : "cedula",
      documento: txt(s.documento, 30), apoyo: !!s.apoyo,
    }));
    return e;
  }

  // ------------------------------------------------- categoría y torneo
  // Las categorías que le tocan por su año de nacimiento, y cuál es la suya:
  // si son dos (2013 y 2014: B de escuela o C de colegio) decide el tipo de
  // centro; sin tipo, queda por elegir.
  function categoriaPropia(e, estado) {
    const opciones = G.categoriasDeNacimiento(anioDe(e.nacimiento), estado.anio);
    if (opciones.length === 1) return { opciones, propia: opciones[0] };
    if (opciones.length > 1) {
      const por = estado.centro.tipo === "primaria" ? "B" : estado.centro.tipo === "secundaria" ? "C" : "";
      return { opciones, propia: opciones.includes(por) ? por : "" };
    }
    return { opciones, propia: "" };
  }
  // Subir de categoría (art. 18): de A a B, de C a D y de D a E, solo en equipos.
  function categoriasPosibles(e, estado) {
    const { opciones, propia } = categoriaPropia(e, estado);
    const lista = opciones.slice();
    if (e.modalidad === "equipo") {
      for (const c of opciones) if (G.JDE_ASCENSOS[c] && !lista.includes(G.JDE_ASCENSOS[c])) lista.push(G.JDE_ASCENSOS[c]);
    }
    if (e.categoria && !lista.includes(e.categoria)) lista.push(e.categoria);
    return { lista, propia, opciones };
  }
  function categoriaEfectiva(e, estado) {
    return TODAS.includes(e.categoria) ? e.categoria : categoriaPropia(e, estado).propia;
  }
  // El torneo de una mujer es el suyo (Mujeres) o el Abierto; el de un hombre,
  // siempre el Abierto (art. 66.1.a y c).
  function torneoEfectivo(e) {
    if (e.torneo === "w" || e.torneo === "m") return e.torneo;
    return e.sexo === "w" ? "w" : "m";
  }
  const NOMBRE_TORNEO = { w: "Mujeres", m: "Abierto" };

  // ---------------------------------------------------- la Interregional
  // En cuál interregional cae una Dirección Regional, con quién, y cuántas
  // personas por torneo clasifica cada una (art. 66.1.i y j).
  function interregionalDe(dre) {
    const x = G.JDE_INTERREGIONALES.find((i) => i.regiones.includes(dre));
    if (!x) return null;
    return { numero: x.numero, nombre: G.nombreInterregional(x), regiones: x.regiones, cupo: x.regiones.length === 2 ? 3 : 2, cruzan: x.regiones.length };
  }

  // ---------------------------------------------------------- la revisión
  function revisar(estado, hoy) {
    const hallazgos = [];
    const h = (nivel, texto, art, ids) => hallazgos.push({ nivel, texto, art: art || "", ids: ids || [] });
    const E = estado;
    const c = E.centro;
    const etapa = ETAPAS.find((x) => x.id === E.etapa) || ETAPAS[1];
    const lista = E.estudiantes;

    // ---- la delegación
    if (!unEspacio(c.nombre)) h("error", "Falta el nombre del centro educativo.", "");
    if (!c.region) h("error", "Falta la Dirección Regional de Educación (son 27; el nombre del centro la propone si está en el banco).", "art. 56");
    if (E.anio !== G.JDE_ANIO_NORMATIVA) h("aviso", "Las categorías de " + E.anio + " se calculan corriendo un año los rangos de la Normativa 2026: confírmalas con la Normativa de " + E.anio + " cuando el MEP la publique.", "art. 17");
    if (!unEspacio(c.correo)) h("error", "Falta un correo electrónico del MEP para la Boleta de Inscripción Oficial.", "art. 59.c");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.correo)) h("error", "El correo «" + c.correo + "» no parece un correo.", "art. 59.c");
    else if (!c.privado && !/@mep\.go\.cr$/i.test(c.correo)) h("aviso", "El correo debe ser del Ministerio de Educación Pública (@mep.go.cr). Si el centro es privado, marca «Centro privado» y usa su correo institucional.", "art. 59.c");

    // ---- el cuerpo técnico
    const jefes = E.cuerpo.filter((p) => p.rol === "jefe" && unEspacio(p.nombre));
    const tecnicos = E.cuerpo.filter((p) => p.rol === "tecnico" && unEspacio(p.nombre));
    if (!jefes.length) h("error", "Falta la persona jefa de delegación.", "art. 60.a");
    if (!tecnicos.length) h("error", "Falta una persona de cuerpo técnico (en las disciplinas individuales, como el ajedrez, son una persona jefa y una de cuerpo técnico en todas las etapas).", "art. 60.a");
    for (const p of E.cuerpo) {
      if (!unEspacio(p.nombre)) continue;
      if (!p.sexo) h("aviso", p.nombre + ": falta el sexo; se necesita para cumplir que haya una persona del mismo sexo que el estudiantado.", "art. 60.e", [p.id]);
      if (!p.funcionario) h("aviso", p.nombre + " no es persona funcionaria: la jefatura del centro debe presentar un oficio de autorización con sus datos personales, o contará como aficionada y no podrá estar en la zona técnica.", "art. 59.d", [p.id]);
    }

    // ---- cada estudiante
    const hoyAnio = hoy ? Number(String(hoy).slice(0, 4)) : 0;
    const jugadores = [];
    for (const e of lista) {
      const quien = unEspacio(e.nombre) || "Un estudiante sin nombre";
      const ids = [e.id];
      if (!unEspacio(e.nombre)) h("error", "Hay un estudiante sin nombre.", "", ids);
      if (!e.sexo) h("error", quien + ": falta el sexo (define en cuál torneo juega).", "art. 66.1.a", ids);
      let nace = anioDe(e.nacimiento);
      if (!e.nacimiento) h("error", quien + ": falta la fecha de nacimiento (con ella se calcula la categoría).", "art. 17", ids);
      else if (!nace) h("error", quien + ": la fecha de nacimiento no es válida.", "art. 17", ids);
      else if (hoy && String(e.nacimiento) > String(hoy)) { h("error", quien + ": la fecha de nacimiento está en el futuro.", "art. 17", ids); nace = 0; }
      const { propia, opciones } = categoriaPropia(e, E);
      if (nace && !opciones.length) h("error", quien + ": nació en " + nace + " y esa fecha no cae en ninguna categoría de los JDE " + E.anio + ".", "art. 17", ids);
      if (nace && opciones.length > 1 && !e.categoria && !propia) h("error", quien + ": nació en " + nace + " y puede ser de la categoría " + opciones.join(" o ") + " (B es de escuela, C de colegio). Dime si el centro es escuela o colegio, o elige la categoría.", "art. 17", ids);
      const cat = categoriaEfectiva(e, E);
      if (cat && !etapa.categorias.includes(cat)) h("error", quien + ": la categoría " + cat + " no juega ajedrez en la Etapa " + etapa.nombre + " (allí solo juegan " + etapa.categorias.join(" y ") + ").", "art. 53", ids);
      if (!unEspacio(e.documento)) h("aviso", quien + ": falta el número de su documento de identificación (se presenta en físico el día de la acreditación).", "art. 59.b y e", ids);
      if (e.modalidad === "individual" && e.suplente) h("aviso", quien + ": «suplente» solo se usa en equipos.", "art. 66.1.g", ids);
      jugadores.push({
        id: e.id, nombre: unEspacio(e.nombre), institucion: unEspacio(c.nombre) + (e.modalidad === "equipo" && Number(e.equipo) === 2 ? " (equipo 2)" : ""),
        categoria: cat, nacimiento: e.nacimiento, modalidad: e.modalidad, sexo: e.sexo, torneo: torneoEfectivo(e), documento: e.documento, suplente: !!e.suplente,
      });
    }

    // ---- la misma persona dos veces (art. 66.1.h: una sola modalidad)
    const limpia = G.quitarRepetidos(jugadores.map((j) => Object.assign({}, j)));
    for (const r of limpia.repetidos) h("error", r.jugador.nombre + " aparece " + r.veces + " veces en la misma modalidad y categoría; deja una sola fila.", "art. 66.1.h", [r.jugador.id]);
    for (const d of limpia.dosModalidades) h("error", d.jugador.nombre + " aparece en dos modalidades o categorías (" + d.inscripciones.map((x) => (x.modalidad === "equipo" ? "equipo" : "individual") + " " + x.categoria).join(" y ") + "): una persona estudiante puede participar únicamente en una modalidad de torneo.", "art. 66.1.h", d.inscripciones.map((x) => x.jugador.id));
    const unicos = limpia.lista;
    const idsDe = (arr) => arr.map((j) => j.id);

    // ---- las categorías y subir de categoría (art. 18)
    const rev = G.revisarCategorias(unicos, E.anio);
    const MOTIVO = {
      individual: (x) => x.jugador.nombre + " (nació en " + x.nace + ") está en la categoría " + x.categoria + " y en individual no se sube de categoría; le toca " + (x.propia || "otra") + ".",
      mayor: (x) => x.jugador.nombre + " nació en " + x.nace + " y la categoría " + x.categoria + " es para nacidos desde " + x.desde + ".",
      salto: (x) => x.jugador.nombre + " (nació en " + x.nace + ", categoría " + x.propia + ") no puede jugar en la " + x.categoria + ": solo se sube de A a B, de C a D y de D a E.",
      tope: (x) => "Hay " + x.cuantos + " estudiantes subidos a la categoría " + x.categoria + " en el mismo equipo; el máximo son " + G.JDE_MAX_ASCENSOS + ".",
    };
    for (const x of rev.noPermitidos) h("error", MOTIVO[x.motivo](x), "art. 18", [x.jugador.id]);
    for (const x of rev.permitidos) h("aviso", x.jugador.nombre + " sube de la categoría " + x.propia + " a la " + x.categoria + " (permitido en equipos, hasta " + G.JDE_MAX_ASCENSOS + " por equipo). Puede seguir jugando en su categoría en otros eventos.", "art. 18", [x.jugador.id]);

    // ---- unir centros (art. 19)
    if (c.union.activa) {
      if (!unEspacio(c.union.centros)) h("aviso", "Falta decir cuáles centros se unen: todos van en la Boleta de Inscripción Oficial de la delegación.", "art. 19.c");
      const m = Number(c.union.matricula);
      if (!m) h("aviso", "Falta la matrícula total de los centros que se unen (con la certificación de cada centro).", "art. 19.c y d");
      else if (m > MAX_UNION) h("error", "La matrícula de los centros que se unen suma " + m + " y no puede pasar de " + MAX_UNION + " estudiantes.", "art. 19.d");
      if (rev.permitidos.length) h("error", "Un centro que se une a otros no puede usar el ascenso de categoría: quita las subidas de categoría o desmarca la unión.", "art. 19.f", idsDe(rev.permitidos.map((x) => x.jugador)));
      h("aviso", "Los centros que se unen deben ser del mismo circuito educativo (escuelas unidocentes, IEGB, unidades pedagógicas, direcciones 1 y 2; o liceos rurales, IEGB, telesecundarias y colegios indígenas) y se inscriben como una sola delegación.", "art. 19.a y b");
    }

    // ---- individuales: dos por categoría y torneo (art. 66.1.f)
    for (const x of G.individualesDeMas(unicos)) {
      const donde = "la categoría " + x.categoria + " del torneo " + NOMBRE_TORNEO[x.torneo];
      if (E.etapa === "regional") h("error", "En " + donde + " hay " + x.integrantes.length + " estudiantes individuales y solo pueden clasificar dos a la Etapa Regional.", "art. 66.1.f", idsDe(x.integrantes));
      else if (E.etapa === "institucional") h("aviso", "En " + donde + " hay " + x.integrantes.length + " estudiantes: todos pueden jugar la Etapa Institucional, pero solo clasifican dos a la Regional.", "art. 66.1.f", idsDe(x.integrantes));
    }

    // ---- equipos
    const pasada = G.pasarMujeresAlAbierto(unicos, true);
    for (const x of pasada.pasadas) h("aviso", "Solo hay " + x.mujeres.length + " mujer" + (x.mujeres.length === 1 ? "" : "es") + " en el equipo de Mujeres de la categoría " + x.categoria + " (un equipo es de 3 a 5): Pareo Integral las pasa al equipo Abierto del mismo centro, donde juegan hombres y mujeres.", "art. 66.1.g", idsDe(x.mujeres));
    for (const x of pasada.sinAbierto) h("error", "Solo hay " + x.mujeres.length + " mujer" + (x.mujeres.length === 1 ? "" : "es") + " en el equipo de Mujeres de la categoría " + x.categoria + ", no completan un equipo (mínimo 3) y no hay equipo Abierto de esa categoría al cual pasarlas: agrega estudiantes o inscríbelas en individual.", "art. 66.1.g", idsDe(x.mujeres));
    for (const x of G.hombresEnMujeres(unicos)) h("error", x.nombre + " es hombre y está en el torneo de Mujeres.", "art. 66.1.a", [x.id]);
    for (const x of G.equiposDeMas(unicos)) h("error", "El equipo " + NOMBRE_TORNEO[x.torneo] + " de la categoría " + x.categoria + " (" + x.institucion + ") tiene " + x.integrantes.length + " integrantes y el máximo son 5: cuatro titulares y una suplente.", "art. 66.1.g", idsDe(x.integrantes));
    for (const x of G.equiposCortos(unicos)) {
      if (pasada.sinAbierto.some((s) => s.institucion === x.institucion && s.categoria === x.categoria)) continue;
      const cuantos = x.integrantes.length;
      const texto = "El equipo " + NOMBRE_TORNEO[x.torneo] + " de la categoría " + x.categoria + " (" + x.institucion + ") tiene " + cuantos + " integrante" + (cuantos === 1 ? "" : "s") + " y el mínimo son 3.";
      if (E.etapa === "institucional") h("aviso", texto + " Puede jugar la Etapa Institucional, pero para clasificar necesita al menos tres.", "art. 66.1.g", idsDe(x.integrantes));
      else h("error", texto, "art. 66.1.g", idsDe(x.integrantes));
    }
    // Quién es titular y quién suplente, equipo por equipo.
    const equipos = armarEquipos(unicos);
    for (const q of equipos) {
      const suplentes = q.integrantes.filter((j) => j.suplente);
      const nombreEq = "El equipo " + NOMBRE_TORNEO[q.torneo] + " de la categoría " + q.categoria + (q.numero === 2 ? " (equipo 2)" : "");
      if (suplentes.length > 1) h("error", nombreEq + " tiene " + suplentes.length + " suplentes marcadas y solo puede haber una.", "art. 66.1.g", idsDe(suplentes));
      else if (q.integrantes.length === 5 && !suplentes.length) h("aviso", nombreEq + " tiene cinco integrantes: marca cuál es la suplente (cuatro titulares y una suplente). El orden de los tableros se da en el Congresillo Técnico.", "art. 66.1.g y h", idsDe(q.integrantes));
      else if (q.integrantes.length <= MAX_TITULARES && suplentes.length) h("aviso", nombreEq + " tiene solo " + q.integrantes.length + " integrantes y una está marcada como suplente: con cuatro o menos todas son titulares.", "art. 66.1.g", idsDe(suplentes));
    }

    // ---- el cuerpo técnico del mismo sexo (art. 60.e): sin excepciones
    for (const [sexo, nombre, persona] of [["w", "mujeres", "una mujer"], ["m", "hombres", "un hombre"]]) {
      if (unicos.some((j) => j.sexo === sexo) && !E.cuerpo.some((p) => p.sexo === sexo && unEspacio(p.nombre))) {
        h("error", "Hay " + nombre + " en la delegación y ningún miembro del cuerpo técnico del mismo sexo: se debe inscribir al menos " + persona + " (jefa de delegación o cuerpo técnico). No hay excepciones en la acreditación.", "art. 60.e");
      }
    }

    // ---- lo que no es un error, pero conviene tener presente
    if (E.etapa === "interregional" || E.etapa === "nacional") {
      h("aviso", "En la Etapa " + etapa.nombre + " solo juegan las categorías B y D (art. 53). Se inscribe a quienes clasificaron; esta herramienta no verifica el puesto.", "art. 53");
    }
    const inter = interregionalDe(c.region);
    if (E.etapa === "regional" && inter) {
      h("info", "Tu Dirección Regional juega la " + inter.nombre + ". Clasifican " + inter.cupo + " personas por torneo individual (Mujeres y Abierto) y " + inter.cupo + " equipos por torneo de cada categoría; el primer lugar de cada torneo de la Interregional pasa a la Nacional.", "art. 66.1.i, j y k");
    }
    const errores = hallazgos.filter((x) => x.nivel === "error").length;
    const avisos = hallazgos.filter((x) => x.nivel === "aviso").length;
    return { hallazgos, errores, avisos, equipos, listos: unicos.length > 0 && errores === 0, etapa };
  }

  // Los equipos de la inscripción: el mismo centro, categoría, torneo y número
  // (art. 66.1.g, hasta dos por torneo). Quien juega en equipo y no tiene
  // categoría todavía no cuenta.
  function armarEquipos(jugadores) {
    const por = new Map();
    for (const j of jugadores) {
      if (j.modalidad !== "equipo" || !j.categoria) continue;
      const torneo = j.alAbierto ? "m" : j.torneo;
      const numero = /\(equipo 2\)$/.test(j.institucion) ? 2 : 1;
      const k = [j.categoria, torneo, numero].join("|");
      if (!por.has(k)) por.set(k, { categoria: j.categoria, torneo, numero, integrantes: [] });
      por.get(k).integrantes.push(j);
    }
    return [...por.values()].sort((a, b) => a.categoria.localeCompare(b.categoria) || (a.torneo === "w" ? -1 : 1) - (b.torneo === "w" ? -1 : 1) || a.numero - b.numero);
  }

  // Cuántos hay en cada categoría y torneo, para la tabla resumen.
  function resumen(estado) {
    const filas = TODAS.map((cat) => ({ categoria: cat, indMujeres: 0, indAbierto: 0, eqMujeres: 0, eqAbierto: 0 }));
    for (const e of estado.estudiantes) {
      const cat = categoriaEfectiva(e, estado);
      const f = filas.find((x) => x.categoria === cat);
      if (!f) continue;
      const t = torneoEfectivo(e);
      if (e.modalidad === "equipo") f[t === "w" ? "eqMujeres" : "eqAbierto"] += 1;
      else f[t === "w" ? "indMujeres" : "indAbierto"] += 1;
    }
    return filas.filter((f) => f.indMujeres || f.indAbierto || f.eqMujeres || f.eqAbierto);
  }

  // ------------------------------------------------------- los archivos
  // Las mismas columnas del Excel que baja el sistema del MEP, así Pareo
  // Integral lo lee con «Subir una lista» sin tocar nada y propone un torneo
  // por grupo (js/pareo/pagina.js, SINONIMOS_COLUMNA). Las columnas que no
  // conoce (tipo de documento, suplente, apoyos) las ignora.
  const ENCABEZADOS = ["Nombre", "Sexo", "FDN", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "Documento de identidad", "Tipo de documento", "Suplente", "Apoyos"];
  function filasExcel(estado) {
    const c = estado.centro;
    const nombreDoc = (id) => (DOCUMENTOS.find((d) => d.id === id) || {}).nombre || "";
    return estado.estudiantes.filter((e) => unEspacio(e.nombre)).map((e) => [
      unEspacio(e.nombre), e.sexo === "w" ? "MUJER" : e.sexo === "m" ? "HOMBRE" : "", e.nacimiento || "",
      unEspacio(c.nombre) + (e.modalidad === "equipo" && Number(e.equipo) === 2 ? " (equipo 2)" : ""), c.region || "",
      categoriaEfectiva(e, estado), e.modalidad === "equipo" ? "Equipo" : "Individual", NOMBRE_TORNEO[torneoEfectivo(e)],
      unEspacio(e.documento), unEspacio(e.documento) ? nombreDoc(e.docTipo) : "", e.modalidad === "equipo" && e.suplente ? "Sí" : "", e.apoyo ? "Sí" : "",
    ]);
  }

  // ---------------------------------------------------- pegar una lista
  // Las etiquetas de columna que se reconocen al pegar o subir una lista.
  const COLUMNAS = {
    nombre: "nombre", "nombre completo": "nombre", estudiante: "nombre", jugador: "nombre", name: "nombre",
    sexo: "sexo", genero: "sexo", sex: "sexo",
    fdn: "nacimiento", nacimiento: "nacimiento", "fecha de nacimiento": "nacimiento", "fecha nacimiento": "nacimiento", "date of birth": "nacimiento",
    "equipo/ind": "modalidad", "equipo / ind": "modalidad", modalidad: "modalidad", "equipo/individual": "modalidad",
    torneo: "torneo", rama: "torneo",
    documento: "documento", "documento de identidad": "documento", cedula: "documento", identificacion: "documento", "numero de documento": "documento",
  };
  const ORDEN_PEGADO = ["nombre", "sexo", "nacimiento", "documento"];
  // Texto pegado (de Excel llegan tabuladores; también se acepta «;») o las
  // filas de un archivo → estudiantes. Nunca se adivina el sexo ni la fecha:
  // lo que no se entiende queda vacío y la revisión lo señala.
  function leerLista(entrada) {
    const filas = Array.isArray(entrada) ? entrada : String(entrada || "").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(l.includes("\t") ? "\t" : l.includes(";") ? ";" : ",").map((x) => x.trim()));
    if (!filas.length) return [];
    let mapa = null, inicio = 0;
    for (let i = 0; i < Math.min(filas.length, 10) && !mapa; i++) {
      const m = {};
      filas[i].forEach((celda, k) => { const campo = COLUMNAS[sinTildes(celda)]; if (campo && m[campo] == null) m[campo] = k; });
      if (m.nombre != null) { mapa = m; inicio = i + 1; }
    }
    if (!mapa) mapa = Object.fromEntries(ORDEN_PEGADO.map((campo, k) => [campo, k]));
    const datos = filas.slice(inicio);
    const col = (f, campo) => (mapa[campo] != null && f[mapa[campo]] != null ? String(f[mapa[campo]]).trim() : "");
    const orden = G.ordenFechas(datos.map((f) => col(f, "nacimiento")));
    const salida = [];
    for (const f of datos) {
      const nombre = unEspacio(col(f, "nombre")).slice(0, 160);
      if (!nombre) continue;
      const modalidad = G.leerModalidad(col(f, "modalidad"));
      const torneo = G.leerTorneo(col(f, "torneo"));
      salida.push(estudianteNuevo({
        nombre, sexo: G.leerSexo(col(f, "sexo")), nacimiento: G.leerFecha(col(f, "nacimiento"), orden), documento: col(f, "documento").slice(0, 30),
        modalidad: modalidad || "individual", torneo: torneo === "w" ? "w" : "",
      }));
    }
    return salida;
  }

  // ------------------------------------------------------------ el banco
  // Buscar un colegio en el banco sin importar tildes, mayúsculas ni el orden
  // de las palabras («Esc.» y «Escuela», «CTP» y «C.T.P.» no se igualan solos:
  // se buscan por lo que se escribe).
  const claveBusqueda = (s) => sinTildes(s).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const PALABRAS_VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y"]);
  function buscarCentros(banco, texto, maximo) {
    // «de», «la»… no distinguen a un colegio de otro y quien busca no siempre las escribe.
    const palabras = claveBusqueda(texto).split(" ").filter((p) => p && !PALABRAS_VACIAS.has(p));
    if (!palabras.length) return [];
    const salida = [];
    for (let i = 0; i < banco.length; i++) {
      const clave = banco[i].clave || (banco[i].clave = claveBusqueda(banco[i].nombre));
      if (!palabras.every((p) => clave.includes(p))) continue;
      const empieza = clave.startsWith(palabras[0]) ? 0 : 1;
      salida.push({ centro: banco[i], peso: empieza * 1e6 - banco[i].participaciones });
    }
    return salida.sort((a, b) => a.peso - b.peso || a.centro.nombre.localeCompare(b.centro.nombre, "es")).slice(0, maximo || 8).map((x) => x.centro);
  }

  const api = {
    ETAPAS, TODAS, NOMBRE_CATEGORIA, DOCUMENTOS, TIPOS_CENTRO, NOMBRE_TORNEO, ENCABEZADOS, MAX_UNION, MAX_EQUIPOS, MAX_TITULARES,
    estadoNuevo, estudianteNuevo, personaNueva, normalizar, anioDe, categoriaPropia, categoriasPosibles, categoriaEfectiva, torneoEfectivo,
    interregionalDe, revisar, armarEquipos, resumen, filasExcel, leerLista, buscarCentros, claveBusqueda,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.InscripcionJde = api;
})(typeof self !== "undefined" ? self : this);
