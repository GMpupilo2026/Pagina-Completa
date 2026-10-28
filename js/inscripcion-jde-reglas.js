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
 *   { version, anio, etapa,
 *     centro:  { nombre, region, tipo, circuito, correo, telefono, privado,
 *                union: { activa, centros, matricula } },
 *     cuerpo:  [{ id, nombre, rol: "jefe"|"tecnico", sexo, funcionario, telefono }],
 *     equipos: [{ id, categoria, torneo: "w"|"m", numero }],
 *     estudiantes: [{ id, nombre, sexo, nacimiento, categoria, modalidad,
 *                     torneo, equipoId, suplente, docTipo, documento, apoyo }] }
 * Un estudiante con `equipoId` juega en ese equipo: su categoría y su torneo son
 * los del equipo (un equipo es de una categoría y de un torneo, «Mujeres» o
 * «Abierto»). Sin `equipoId` es individual: su categoría sale de su fecha de
 * nacimiento y `categoria` y `torneo` vacíos quieren decir «la que
 * corresponde» (se calculan); solo se guardan cuando la persona eligió otra.
 *
 * LOS TOPES SE APLICAN AL AGREGAR, no solo se avisan después: `intentar()` hace
 * un cambio y, si deja pasarse de lo que permite la Normativa (más de cinco en
 * un equipo, más de dos equipos o dos individuales por categoría y torneo, un
 * hombre en un equipo de Mujeres, alguien que por su edad no puede jugar en esa
 * categoría…), lo deshace y dice por qué (`limites()`). La revisión
 * (`revisar()`) sigue señalando todo lo que quede mal, también lo que venga de un
 * borrador o de una lista pegada.
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
      version: 2, anio: G.JDE_ANIO_NORMATIVA, etapa: "regional",
      centro: { nombre: "", region: "", tipo: "", circuito: "", correo: "", telefono: "", privado: false, union: { activa: false, centros: "", matricula: "" } },
      cuerpo: [], equipos: [], estudiantes: [],
    };
  }
  function estudianteNuevo(datos) {
    return Object.assign({ id: nuevoId("e"), nombre: "", sexo: "", nacimiento: "", categoria: "", modalidad: "individual", torneo: "", equipoId: "", suplente: false, docTipo: "cedula", documento: "", apoyo: false }, datos || {});
  }
  function equipoNuevo(datos) {
    return Object.assign({ id: nuevoId("q"), categoria: "", torneo: "m", numero: 1 }, datos || {});
  }
  const esDeEquipo = (e) => !!e.equipoId;
  // Un lugar de un equipo que todavía no se llena: sin nombre, fecha ni documento.
  const esLugarVacio = (e) => !!e.equipoId && !unEspacio(e.nombre) && !e.nacimiento && !unEspacio(e.documento);
  const equipoDe = (e, estado) => (e.equipoId ? (estado.equipos || []).find((t) => t.id === e.equipoId) || null : null);
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
    // Los equipos: de una categoría y un torneo, con su número (hasta 9 del mismo centro), sin repetir.
    const vistos = new Set();
    e.equipos = (Array.isArray(crudo.equipos) ? crudo.equipos : []).slice(0, 60).map((t) => equipoNuevo({
      id: idLimpio(t && t.id, "q"), categoria: t && TODAS.includes(t.categoria) ? t.categoria : "", torneo: t && t.torneo === "w" ? "w" : "m",
      numero: t && Number.isInteger(t.numero) && t.numero >= 1 && t.numero <= 9 ? t.numero : 1,
    })).filter((t) => {
      const k = [t.categoria, t.torneo, t.numero].join("|");
      if (!t.categoria || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    const hayEquipo = new Set(e.equipos.map((t) => t.id));
    e.estudiantes = (Array.isArray(crudo.estudiantes) ? crudo.estudiantes : []).slice(0, 400).map((s) => {
      const equipoId = typeof s.equipoId === "string" && hayEquipo.has(s.equipoId) ? s.equipoId : "";
      return estudianteNuevo({
        id: idLimpio(s.id, "e"), nombre: txt(s.nombre), sexo: s.sexo === "m" || s.sexo === "w" ? s.sexo : "",
        nacimiento: anioDe(s.nacimiento) ? String(s.nacimiento) : "", categoria: TODAS.includes(s.categoria) ? s.categoria : "",
        modalidad: equipoId ? "equipo" : "individual", torneo: s.torneo === "w" || s.torneo === "m" ? s.torneo : "", equipoId,
        suplente: !!equipoId && !!s.suplente, docTipo: DOCUMENTOS.some((d) => d.id === s.docTipo) ? s.docTipo : "cedula",
        documento: txt(s.documento, 30), apoyo: !!s.apoyo,
      });
    });
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
  // Las categorías que puede jugar un estudiante INDIVIDUAL: las que le tocan por
  // su año de nacimiento (en individual no se sube de categoría, art. 18). Subir
  // de categoría es cosa de un equipo: el equipo es de una categoría y quien nació
  // en la de abajo puede jugar en él (`puedeJugarEn`).
  function categoriasPosibles(e, estado) {
    const { opciones, propia } = categoriaPropia(e, estado);
    const lista = opciones.slice();
    if (e.categoria && !lista.includes(e.categoria)) lista.push(e.categoria);
    return { lista, propia, opciones };
  }
  // La categoría en que juega: la de su equipo, o la suya si es individual.
  function categoriaEfectiva(e, estado) {
    const t = equipoDe(e, estado);
    if (t) return t.categoria;
    return TODAS.includes(e.categoria) ? e.categoria : categoriaPropia(e, estado).propia;
  }
  // Quien nació en `opciones` puede jugar en la categoría `cat` de un equipo si
  // es la suya o la siguiente (A→B, C→D, D→E; art. 18). Devuelve "propia",
  // "sube" o "" (no puede).
  function puedeJugarEn(opciones, cat) {
    if (opciones.includes(cat)) return "propia";
    if (opciones.some((c) => G.JDE_ASCENSOS[c] === cat)) return "sube";
    return "";
  }
  // El torneo de una mujer es el suyo (Mujeres) o el Abierto; el de un hombre,
  // siempre el Abierto (art. 66.1.a y c). Quien juega en un equipo juega el de su equipo.
  function torneoEfectivo(e, estado) {
    const t = estado && equipoDe(e, estado);
    if (t) return t.torneo;
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
    // Los lugares de un equipo que todavía no se llenan (sin nombre, fecha ni documento) no cuentan:
    // la pantalla los deja listos para escribir y no deben llenar la revisión de errores.
    const lista = E.estudiantes.filter((e) => !esLugarVacio(e));

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
      const equipo = equipoDe(e, E);
      jugadores.push({
        id: e.id, nombre: unEspacio(e.nombre), institucion: unEspacio(c.nombre) + (equipo && equipo.numero > 1 ? " (equipo " + equipo.numero + ")" : ""),
        categoria: cat, nacimiento: e.nacimiento, modalidad: equipo ? "equipo" : "individual", sexo: e.sexo, torneo: torneoEfectivo(e, E), documento: e.documento, suplente: !!e.suplente,
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
      const nombreEq = "El equipo " + NOMBRE_TORNEO[q.torneo] + " de la categoría " + q.categoria + (q.numero > 1 ? " (equipo " + q.numero + ")" : "");
      if (suplentes.length > 1) h("error", nombreEq + " tiene " + suplentes.length + " suplentes marcadas y solo puede haber una.", "art. 66.1.g", idsDe(suplentes));
      else if (q.integrantes.length === 5 && !suplentes.length) h("aviso", nombreEq + " tiene cinco integrantes: marca cuál es la suplente (cuatro titulares y una suplente). El orden de los tableros se da en el Congresillo Técnico.", "art. 66.1.g y h", idsDe(q.integrantes));
      else if (q.integrantes.length <= MAX_TITULARES && suplentes.length) h("aviso", nombreEq + " tiene solo " + q.integrantes.length + " integrantes y una está marcada como suplente: con cuatro o menos todas son titulares.", "art. 66.1.g", idsDe(suplentes));
    }

    // Un equipo que se creó y todavía no tiene a nadie.
    for (const t of E.equipos) {
      if (E.estudiantes.some((e) => e.equipoId === t.id)) continue;
      const texto = "El equipo " + NOMBRE_TORNEO[t.torneo] + " de la categoría " + t.categoria + (t.numero > 1 ? " (equipo " + t.numero + ")" : "") + " no tiene integrantes todavía: un equipo es de 3 a 5 estudiantes.";
      if (E.etapa === "institucional") h("aviso", texto, "art. 66.1.g");
      else h("error", texto, "art. 66.1.g");
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
      const m = /\(equipo (\d+)\)$/.exec(j.institucion);
      const numero = m ? Number(m[1]) : 1;
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
      const t = torneoEfectivo(e, estado);
      if (esDeEquipo(e)) f[t === "w" ? "eqMujeres" : "eqAbierto"] += 1;
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
    return estado.estudiantes.filter((e) => unEspacio(e.nombre)).map((e) => {
      const t = equipoDe(e, estado);
      return [
        unEspacio(e.nombre), e.sexo === "w" ? "MUJER" : e.sexo === "m" ? "HOMBRE" : "", e.nacimiento || "",
        unEspacio(c.nombre) + (t && t.numero > 1 ? " (equipo " + t.numero + ")" : ""), c.region || "",
        categoriaEfectiva(e, estado), t ? "Equipo" : "Individual", NOMBRE_TORNEO[torneoEfectivo(e, estado)],
        unEspacio(e.documento), unEspacio(e.documento) ? nombreDoc(e.docTipo) : "", t && e.suplente ? "Sí" : "", e.apoyo ? "Sí" : "",
      ];
    });
  }
  // Los equipos, uno por uno, para la hoja «Equipos» del Excel: titulares primero y la suplente al final.
  const ENCABEZADOS_EQUIPOS = ["Equipo", "N.°", "Nombre", "Condición", "Sexo", "FDN", "Documento de identidad"];
  function filasEquipos(estado) {
    const filas = [];
    const ordenados = estado.equipos.slice().sort((a, b) => a.categoria.localeCompare(b.categoria) || (a.torneo === "w" ? -1 : 1) - (b.torneo === "w" ? -1 : 1) || a.numero - b.numero);
    for (const t of ordenados) {
      const miembros = estado.estudiantes.filter((e) => e.equipoId === t.id && unEspacio(e.nombre));
      miembros.sort((a, b) => Number(!!a.suplente) - Number(!!b.suplente));
      const nombre = "Equipo " + NOMBRE_TORNEO[t.torneo] + " · categoría " + t.categoria + (t.numero > 1 ? " · equipo " + t.numero : "");
      miembros.forEach((e, i) => filas.push([nombre, String(i + 1), unEspacio(e.nombre), e.suplente ? "Suplente" : "Titular", e.sexo === "w" ? "MUJER" : e.sexo === "m" ? "HOMBRE" : "", e.nacimiento || "", unEspacio(e.documento)]));
    }
    return filas;
  }

  // ------------------------------------------- los topes, al agregar
  // Lo que la Normativa NO deja pasar. Cada violación lleva una clave estable
  // para poder decir cuáles son NUEVAS después de un cambio (una inscripción que
  // ya venía pasada, de un borrador, no impide seguir trabajando; solo se impide
  // pasarse más: las de cantidad llevan la cantidad en la clave, así que una más
  // es una violación nueva). Los topes de cantidad por centro valen desde la Etapa Regional:
  // en la Institucional puede participar toda la población y solo clasifican dos.
  const TOPE_EQUIPO = 5;       // art. 66.1.g: cuatro titulares y una suplente
  const TOPE_POR_GRUPO = 2;    // art. 66.1.f y g: dos individuales y dos equipos por categoría y torneo
  const desde = (r) => (r[0] == null ? "nacidos en " + r[1] + " o antes" : "nacidos de " + r[0] + " a " + r[1]);
  function limites(estado) {
    const E = estado;
    const etapa = ETAPAS.find((x) => x.id === E.etapa) || ETAPAS[1];
    const conTope = E.etapa !== "institucional";
    const v = [];
    const nombreDe = (e) => unEspacio(e.nombre) || "El estudiante sin nombre";
    const nombreEq = (t) => "El equipo " + NOMBRE_TORNEO[t.torneo] + " de la categoría " + t.categoria + (t.numero > 1 ? " (equipo " + t.numero + ")" : "");
    const miembros = new Map(E.equipos.map((t) => [t.id, []]));
    for (const e of E.estudiantes) if (e.equipoId && miembros.has(e.equipoId)) miembros.get(e.equipoId).push(e);

    const gruposEq = new Map();
    for (const t of E.equipos) {
      const m = miembros.get(t.id);
      if (!etapa.categorias.includes(t.categoria)) v.push({ clave: "eq-etapa:" + t.id, texto: "En la Etapa " + etapa.nombre + " solo juegan ajedrez las categorías " + etapa.categorias.join(" y ") + ": no se puede inscribir un equipo de la categoría " + t.categoria + " (art. 53)." });
      if (m.length > TOPE_EQUIPO) v.push({ clave: "eq-lleno:" + t.id + ":" + m.length, texto: nombreEq(t) + " ya tiene " + TOPE_EQUIPO + " integrantes —cuatro titulares y una suplente— y no caben más (art. 66.1.g)." });
      const suplentes = m.filter((e) => e.suplente).length;
      if (suplentes > 1) v.push({ clave: "eq-suplente:" + t.id + ":" + suplentes, texto: nombreEq(t) + " solo puede tener una suplente: ya hay otra marcada (art. 66.1.g)." });
      if (t.torneo === "w") for (const e of m) if (e.sexo === "m") v.push({ clave: "eq-hombre:" + e.id, texto: nombreDe(e) + " es hombre y no puede estar en un equipo de Mujeres: el equipo Abierto es para hombres y mujeres (art. 66.1.a y c)." });
      let suben = 0;
      for (const e of m) {
        const ops = G.categoriasDeNacimiento(anioDe(e.nacimiento), E.anio);
        if (!ops.length) continue; // sin fecha, o de ninguna categoría: lo dice la revisión
        const puede = puedeJugarEn(ops, t.categoria);
        if (puede === "sube") suben += 1;
        else if (!puede) v.push({ clave: "eq-edad:" + e.id + ":" + t.id, texto: nombreDe(e) + " nació en " + anioDe(e.nacimiento) + " y no puede jugar en la categoría " + t.categoria + " (" + desde(G.rangoCategoria(t.categoria, E.anio)) + "): en un equipo solo se sube de categoría de A a B, de C a D y de D a E (art. 17 y 18)." });
      }
      if (suben > G.JDE_MAX_ASCENSOS) v.push({ clave: "eq-ascensos:" + t.id + ":" + suben, texto: nombreEq(t) + " ya tiene " + G.JDE_MAX_ASCENSOS + " estudiantes subidos de categoría y ese es el máximo por equipo (art. 18)." });
      if (suben && E.centro.union.activa) v.push({ clave: "eq-union:" + t.id, texto: "Un centro que se une a otros no puede subir estudiantes de categoría (art. 19.f): " + nombreEq(t).toLowerCase() + " tiene a alguien de la categoría de abajo." });
      const k = t.categoria + "|" + t.torneo;
      if (!gruposEq.has(k)) gruposEq.set(k, []);
      gruposEq.get(k).push(t);
    }
    for (const [k, lista] of gruposEq) {
      const [cat, torneo] = k.split("|");
      if (conTope && lista.length > TOPE_POR_GRUPO) v.push({ clave: "eq-cupo:" + k + ":" + lista.length, texto: "Ya hay " + TOPE_POR_GRUPO + " equipos " + NOMBRE_TORNEO[torneo] + " de la categoría " + cat + " y ese es el máximo por centro desde la Etapa Regional (art. 66.1.g)." });
      if (new Set(lista.map((t) => t.numero)).size !== lista.length) v.push({ clave: "eq-numero:" + k, texto: "Dos equipos " + NOMBRE_TORNEO[torneo] + " de la categoría " + cat + " tienen el mismo número." });
    }

    const gruposInd = new Map();
    for (const e of E.estudiantes) {
      if (e.equipoId) continue;
      const cat = categoriaEfectiva(e, E);
      if (!cat) continue;
      if (!etapa.categorias.includes(cat)) { v.push({ clave: "ind-etapa:" + e.id, texto: nombreDe(e) + " es de la categoría " + cat + " y en la Etapa " + etapa.nombre + " solo juegan ajedrez las categorías " + etapa.categorias.join(" y ") + " (art. 53)." }); continue; }
      const k = cat + "|" + torneoEfectivo(e, E);
      gruposInd.set(k, (gruposInd.get(k) || 0) + 1);
    }
    for (const [k, n] of gruposInd) {
      const [cat, torneo] = k.split("|");
      if (conTope && n > TOPE_POR_GRUPO) v.push({ clave: "ind-cupo:" + k + ":" + n, texto: "Ya hay " + TOPE_POR_GRUPO + " estudiantes individuales de la categoría " + cat + " en el torneo " + NOMBRE_TORNEO[torneo] + " y ese es el máximo por centro desde la Etapa Regional (art. 66.1.f). Si hay más, pueden jugar en un equipo." });
    }

    // La misma persona dos veces: una sola modalidad (art. 66.1.h).
    const quien = new Map();
    for (const e of E.estudiantes) {
      const doc = String(e.documento || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
      const k = doc ? "doc:" + doc : unEspacio(e.nombre) && e.nacimiento ? "nom:" + sinTildes(e.nombre).replace(/\s+/g, " ") + "|" + e.nacimiento : "";
      if (!k) continue;
      if (!quien.has(k)) quien.set(k, []);
      quien.get(k).push(e);
    }
    for (const [k, lista] of quien) if (lista.length > 1) v.push({ clave: "dup:" + k, texto: nombreDe(lista[0]) + " ya está inscrito: una persona estudiante participa en una sola modalidad, y una sola vez (art. 66.1.h)." });
    return v;
  }

  // Hace un cambio y lo deshace si deja pasarse de lo permitido. `mutar` toca
  // `estado.equipos` y `estado.estudiantes` y puede devolver algo (se entrega en
  // `resultado`). Si vuelve atrás, los objetos que ya existían siguen siendo los
  // mismos (la pantalla los tiene en sus cierres): solo se les devuelven los datos.
  function intentar(estado, mutar) {
    const antes = new Set(limites(estado).map((x) => x.clave));
    const copia = JSON.stringify({ equipos: estado.equipos, estudiantes: estado.estudiantes });
    const resultado = mutar();
    const nuevas = limites(estado).filter((x) => !antes.has(x.clave));
    if (!nuevas.length) return { ok: true, motivos: [], resultado };
    const o = JSON.parse(copia);
    for (const campo of ["equipos", "estudiantes"]) {
      const actuales = new Map(estado[campo].map((x) => [x.id, x]));
      estado[campo] = o[campo].map((viejo) => {
        const x = actuales.get(viejo.id);
        if (!x) return viejo;
        for (const k of Object.keys(x)) delete x[k];
        return Object.assign(x, viejo);
      });
    }
    return { ok: false, motivos: nuevas.map((x) => x.texto), resultado: null };
  }

  // Un equipo nuevo de esa categoría y ese torneo, con el primer número libre.
  function crearEquipo(estado, categoria, torneo) {
    return intentar(estado, () => {
      const usados = new Set(estado.equipos.filter((t) => t.categoria === categoria && t.torneo === torneo).map((t) => t.numero));
      let numero = 1;
      while (usados.has(numero)) numero += 1;
      const t = equipoNuevo({ categoria, torneo, numero });
      estado.equipos.push(t);
      return t;
    });
  }
  // Un integrante nuevo (o uno que ya estaba, `existente`, y pasa de individual al equipo).
  // El quinto de un equipo sin suplente queda como suplente: cuatro titulares y una suplente.
  function agregarIntegrante(estado, equipoId, datos, existente) {
    return intentar(estado, () => {
      const t = estado.equipos.find((x) => x.id === equipoId);
      const ya = estado.estudiantes.filter((e) => e.equipoId === equipoId);
      const e = existente || estudianteNuevo(datos);
      if (t && t.torneo === "w" && !e.sexo) e.sexo = "w";
      e.equipoId = equipoId;
      e.modalidad = "equipo";
      e.categoria = ""; e.torneo = "";
      e.suplente = !!(datos && datos.suplente) || (ya.length === TOPE_EQUIPO - 1 && !ya.some((x) => x.suplente));
      if (!estado.estudiantes.includes(e)) estado.estudiantes.push(e);
      return e;
    });
  }
  // Un integrante vuelve a ser individual.
  function sacarDelEquipo(estado, estudianteId) {
    return intentar(estado, () => {
      const e = estado.estudiantes.find((x) => x.id === estudianteId);
      if (e) { e.equipoId = ""; e.modalidad = "individual"; e.suplente = false; }
      return e;
    });
  }
  // Quitar un equipo con sus integrantes.
  function quitarEquipo(estado, equipoId) {
    estado.estudiantes = estado.estudiantes.filter((e) => e.equipoId !== equipoId);
    estado.equipos = estado.equipos.filter((t) => t.id !== equipoId);
  }
  // Cuántos faltan o sobran para que el equipo sea de 3 a 5.
  function estadoDelEquipo(estado, t) {
    const m = estado.estudiantes.filter((e) => e.equipoId === t.id);
    const n = m.length;
    return { integrantes: n, titulares: m.filter((e) => !e.suplente).length, suplentes: m.filter((e) => e.suplente).length, faltan: Math.max(0, MIN_EQUIPO - n), caben: Math.max(0, TOPE_EQUIPO - n) };
  }
  const MIN_EQUIPO = 3;

  // Agrega a todos los de una lista (de leerLista): los individuales como individuales y los
  // «Equipo» a su equipo (categoría y torneo de la lista o, si no los dice, por su fecha de
  // nacimiento y el Abierto), creando el equipo y un segundo cuando el primero se llena. Lo que
  // no cabe se devuelve con su motivo: nunca se pasa de lo permitido.
  function agregarLista(estado, estudiantes) {
    const agregados = [], rechazados = [];
    for (const s of estudiantes) {
      const d = s.destino || {};
      delete s.destino;
      const quien = unEspacio(s.nombre) || "Un estudiante sin nombre";
      if (!d.equipo) {
        const r = intentar(estado, () => { estado.estudiantes.push(s); return s; });
        (r.ok ? agregados : rechazados).push(r.ok ? s : { nombre: quien, motivo: r.motivos[0] });
        continue;
      }
      const { propia, opciones } = categoriaPropia(s, estado);
      const cat = d.categoria || propia;
      if (!cat) { rechazados.push({ nombre: quien, motivo: opciones.length > 1 ? "nació en un año de la categoría " + opciones.join(" o ") + " (B es de escuela, C de colegio): marca si el centro es escuela o colegio, o ponle la categoría en la lista." : "no tiene fecha de nacimiento (o no cae en ninguna categoría): agrégalo al equipo a mano." }); continue; }
      const torneo = d.torneo === "w" ? "w" : "m";
      if (torneo === "w" && s.sexo === "m") { rechazados.push({ nombre: quien, motivo: "es hombre y la lista lo pone en el equipo de Mujeres." }); continue; }
      let hecho = false, motivo = "";
      const equipos = estado.equipos.filter((t) => t.categoria === cat && t.torneo === torneo).sort((a, b) => a.numero - b.numero);
      for (const t of equipos) {
        if (estadoDelEquipo(estado, t).caben === 0) continue;
        const r = agregarIntegrante(estado, t.id, null, s);
        if (r.ok) { hecho = true; break; }
        motivo = r.motivos[0];
      }
      if (!hecho && (!equipos.length || equipos.every((t) => estadoDelEquipo(estado, t).caben === 0))) {
        const nuevo = crearEquipo(estado, cat, torneo);
        if (!nuevo.ok) motivo = nuevo.motivos[0];
        else {
          const r = agregarIntegrante(estado, nuevo.resultado.id, null, s);
          if (r.ok) hecho = true;
          else { motivo = r.motivos[0]; if (!estado.estudiantes.some((e) => e.equipoId === nuevo.resultado.id)) quitarEquipo(estado, nuevo.resultado.id); }
        }
      }
      if (!hecho && !estado.estudiantes.includes(s)) rechazados.push({ nombre: quien, motivo: motivo || "no cabe en ningún equipo." });
      else if (hecho) agregados.push(s);
    }
    return { agregados, rechazados };
  }


  // ------------------------------------------- lo que falta y lo que conviene
  // Lo que le falta a un grupo de estudiantes, contado por campo: «3 fechas de
  // nacimiento, 2 documentos». `campo` es el sufijo del control de la pantalla
  // (n, s, f, d) para poder llevar a quien escribe al primero que falta.
  const CAMPOS_FALTANTES = [
    ["n", "nombre", "nombres", (e) => !unEspacio(e.nombre)],
    ["s", "sexo", "sexos", (e) => !e.sexo],
    ["f", "fecha de nacimiento", "fechas de nacimiento", (e) => !e.nacimiento],
    ["d", "documento", "documentos", (e) => !unEspacio(e.documento)],
  ];
  function faltantes(estudiantes) {
    const salida = [];
    for (const [campo, uno, varios, falta] of CAMPOS_FALTANTES) {
      const ids = estudiantes.filter((e) => !esLugarVacio(e) && falta(e)).map((e) => e.id);
      if (ids.length) salida.push({ campo, n: ids.length, ids, texto: ids.length + " " + (ids.length === 1 ? uno : varios) });
    }
    return salida;
  }

  // La lista de tareas para dejar la inscripción lista: lo de la delegación y lo
  // de cada estudiante, en el orden en que se llena. Cada una dice dónde está
  // (`control`: el id de un control de la pantalla, o `campo` + `ids` para el de un
  // estudiante, o `equipo` para el botón de agregar de un equipo).
  function pendientes(estado) {
    const E = estado, c = E.centro, salida = [];
    const add = (clave, texto, extra) => salida.push(Object.assign({ clave, texto }, extra));
    if (!unEspacio(c.nombre)) add("centro", "Escribe el nombre del centro educativo.", { control: "ij-centro" });
    if (!c.region) add("region", "Elige la Dirección Regional.", { control: "ij-region" });
    if (!unEspacio(c.correo)) add("correo", "Escribe el correo del MEP.", { control: "ij-correo" });
    if (!E.cuerpo.some((p) => p.rol === "jefe" && unEspacio(p.nombre))) add("jefatura", "Falta la persona jefa de delegación.", { control: "ij-cuerpo" });
    if (!E.cuerpo.some((p) => p.rol === "tecnico" && unEspacio(p.nombre))) add("tecnico", "Falta una persona de cuerpo técnico.", { control: "ij-cuerpo" });
    const llenos = E.estudiantes.filter((e) => !esLugarVacio(e));
    if (!llenos.length) add("estudiantes", "Agrega a los estudiantes: en un equipo o como individuales.", { control: "ij-eq-crear" });
    for (const f of faltantes(E.estudiantes)) add("falta-" + f.campo, (f.n === 1 ? "Falta " : "Faltan ") + f.texto + ".", { campo: f.campo, ids: f.ids });
    for (const t of E.equipos) {
      const n = llenos.filter((e) => e.equipoId === t.id).length;
      if (n < MIN_EQUIPO) add("eq-corto:" + t.id, "Al equipo " + NOMBRE_TORNEO[t.torneo] + " de la categoría " + t.categoria + (t.numero > 1 ? " (equipo " + t.numero + ")" : "") + " " + (n === MIN_EQUIPO - 1 ? "le falta 1 integrante" : "le faltan " + (MIN_EQUIPO - n) + " integrantes") + " para llegar al mínimo de " + MIN_EQUIPO + ".", { equipo: t.id });
    }
    return salida;
  }

  // ¿Cabe este estudiante (individual) en este equipo sin pasarse de nada? Se prueba en
  // una copia: la inscripción de verdad no se toca.
  function cabeEnEquipo(estado, estudiante, equipo) {
    const copia = Object.assign({}, estado, { equipos: JSON.parse(JSON.stringify(estado.equipos)), estudiantes: JSON.parse(JSON.stringify(estado.estudiantes)) });
    const e = copia.estudiantes.find((x) => x.id === estudiante.id);
    return !!e && !e.equipoId && agregarIntegrante(copia, equipo.id, null, e).ok;
  }

  // Ideas para completar los equipos con quienes ya están como individuales. Solo
  // propone: nunca mueve a nadie.
  function sugerencias(estado) {
    const salida = [];
    const solos = estado.estudiantes.filter((e) => !e.equipoId && unEspacio(e.nombre));
    const nombresQueCaben = (t) => solos.slice(0, 40).filter((e) => cabeEnEquipo(estado, e, t)).map((e) => unEspacio(e.nombre));
    for (const t of estado.equipos) {
      const miembros = estado.estudiantes.filter((e) => e.equipoId === t.id && !esLugarVacio(e));
      const n = miembros.length;
      if (!n || n >= TOPE_EQUIPO) continue;
      const nombre = "El equipo " + NOMBRE_TORNEO[t.torneo] + " de la categoría " + t.categoria + (t.numero > 1 ? " (equipo " + t.numero + ")" : "");
      const caben = nombresQueCaben(t);
      const lista = caben.slice(0, 3).join(", ") + (caben.length > 3 ? " y " + (caben.length - 3) + " más" : "");
      if (n < MIN_EQUIPO) salida.push(nombre + " tiene " + n + " y necesita " + MIN_EQUIPO + " para clasificar." + (caben.length ? " Podrían sumarse, de los individuales: " + lista + "." : " Ninguno de tus individuales cabe en él: agrega a alguien nuevo."));
      else if (n === MIN_EQUIPO && caben.length) salida.push(nombre + " tiene 3: con " + lista + " llegaría a 4 titulares y quedaría con más margen si alguien falta el día del torneo.");
      else if (n === 4 && !miembros.some((e) => e.suplente) && caben.length) salida.push(nombre + " tiene cuatro titulares y ninguna suplente: " + lista + " podría ser la suplente (art. 66.1.g).");
    }
    return salida;
  }

  // ---------------------------------------------------- pegar una lista
  // Las etiquetas de columna que se reconocen al pegar o subir una lista.
  const COLUMNAS = {
    nombre: "nombre", "nombre completo": "nombre", estudiante: "nombre", jugador: "nombre", name: "nombre",
    sexo: "sexo", genero: "sexo", sex: "sexo",
    fdn: "nacimiento", nacimiento: "nacimiento", "fecha de nacimiento": "nacimiento", "fecha nacimiento": "nacimiento", "date of birth": "nacimiento",
    "equipo/ind": "modalidad", "equipo / ind": "modalidad", modalidad: "modalidad", "equipo/individual": "modalidad",
    torneo: "torneo", rama: "torneo", categoria: "categoria", category: "categoria",
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
      const cat = String(col(f, "categoria")).trim().toUpperCase();
      const e = estudianteNuevo({
        nombre, sexo: G.leerSexo(col(f, "sexo")), nacimiento: G.leerFecha(col(f, "nacimiento"), orden), documento: col(f, "documento").slice(0, 30),
        torneo: modalidad === "equipo" ? "" : torneo === "w" ? "w" : "",
      });
      // Adónde va: se queda aparte de la persona porque es de la lista, no suyo.
      e.destino = { equipo: modalidad === "equipo", torneo: torneo === "w" ? "w" : "m", categoria: TODAS.includes(cat) ? cat : "" };
      salida.push(e);
    }
    return salida;
  }

  // ------------------------------------------------------------ el banco
  // Cada centro del banco: { nombre, region, tipo ("primaria", "secundaria" o ""),
  // circuito, participaciones }. Buscar sin importar tildes, mayúsculas ni el
  // orden de las palabras; «de», «la»… no cuentan: quien busca no siempre las
  // escribe («Esc.» y «Escuela», «CTP» y «C.T.P.» no se igualan solos: se
  // busca por lo que se escribe).
  const claveBusqueda = (s) => sinTildes(s).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const PALABRAS_VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y"]);
  function palabrasDe(texto) {
    return claveBusqueda(texto).split(" ").filter((p) => p && !PALABRAS_VACIAS.has(p));
  }
  function buscarCentros(banco, texto, maximo) {
    const palabras = palabrasDe(texto);
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

  // Los centros que se le ofrecen a quien inscribe, según lo que ya marcó: su
  // Dirección Regional y si es escuela o colegio. Sin escribir nada salen todos
  // los de esa regional y ese tipo, en orden alfabético; escribiendo, se filtran
  // por las palabras. Un centro de tipo desconocido sale en los dos tipos, y uno
  // sin regional conocida sale solo cuando se escribe algo (no se sabe a cuál
  // pertenece). Si en su regional no hay ninguno con lo escrito, se busca en todo
  // el país: el banco puede tener mal la regional de un colegio.
  // Devuelve { centros, total, enTodoElPais }.
  function centrosDe(banco, filtros, texto, maximo) {
    const f = filtros || {};
    const tope = maximo || 400;
    const palabras = palabrasDe(texto);
    const cumple = (c) => (!f.dre || c.region === f.dre || (!c.region && palabras.length > 0)) && (!f.tipo || !c.tipo || c.tipo === f.tipo);
    const coincide = (c) => {
      if (!palabras.length) return true;
      const clave = c.clave || (c.clave = claveBusqueda(c.nombre));
      return palabras.every((p) => clave.includes(p));
    };
    let lista = banco.filter((c) => cumple(c) && coincide(c));
    let enTodoElPais = false;
    if (!lista.length && palabras.length && (f.dre || f.tipo)) {
      lista = banco.filter(coincide);
      enTodoElPais = true;
    }
    if (palabras.length) {
      lista.sort((a, b) => ((claveBusqueda(a.nombre).startsWith(palabras[0]) ? 0 : 1) - (claveBusqueda(b.nombre).startsWith(palabras[0]) ? 0 : 1)) || b.participaciones - a.participaciones || a.nombre.localeCompare(b.nombre, "es"));
    } else {
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
    return { centros: lista.slice(0, tope), total: lista.length, enTodoElPais };
  }

  // Los circuitos que hay en una Dirección Regional, para el selector: los del
  // banco, y los que ya tenga escritos quien inscribe.
  function circuitosDe(banco, dre) {
    const set = new Set();
    for (const c of banco) if (c.circuito && (!dre || c.region === dre)) set.add(c.circuito);
    return [...set].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }

  const api = {
    ETAPAS, TODAS, NOMBRE_CATEGORIA, DOCUMENTOS, TIPOS_CENTRO, NOMBRE_TORNEO, ENCABEZADOS, MAX_UNION, MAX_EQUIPOS, MAX_TITULARES,
    estadoNuevo, estudianteNuevo, equipoNuevo, personaNueva, normalizar, esDeEquipo, esLugarVacio, faltantes, pendientes, cabeEnEquipo, sugerencias, equipoDe, puedeJugarEn, limites, intentar, crearEquipo, agregarIntegrante, sacarDelEquipo, quitarEquipo, estadoDelEquipo, agregarLista, filasEquipos, ENCABEZADOS_EQUIPOS, TOPE_EQUIPO, TOPE_POR_GRUPO, MIN_EQUIPO, anioDe, categoriaPropia, categoriasPosibles, categoriaEfectiva, torneoEfectivo,
    interregionalDe, revisar, armarEquipos, resumen, filasExcel, leerLista, buscarCentros, centrosDe, circuitosDe, claveBusqueda,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.InscripcionJde = api;
})(typeof self !== "undefined" ? self : this);
