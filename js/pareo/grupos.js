/* ===== Pareo Integral — separar una inscripción en torneos =====
 *
 * Una inscripción de los Juegos Deportivos Estudiantiles (el Excel que baja
 * el sistema del MEP, «Report Generation – Juegos Deportivos Estudiantiles»)
 * trae juntos a todos los de una regional: hombres y mujeres, equipos e
 * individual, y las categorías A a E. Cada combinación es un torneo aparte, y
 * armarlos a mano es copiar y pegar cientos de filas. Esto los separa y la
 * página se los SUGIERE al árbitro: nunca crea nada sin que lo confirme.
 *
 * Solo se separa por lo que de verdad cambia en el archivo: si todos son de
 * individual, la modalidad no parte nada. Los torneos por sexo son, como
 * dice la normativa (art. 66), «Individual Mujeres» y «Abierto»: en el
 * abierto juegan hombres y mujeres. Funciones puras, sin DOM: las usa
 * js/pareo/pagina.js y las prueba herramientas/verificar-pareo-grupos.js.
 */
(function (raiz) {
  "use strict";

  const sinTildes = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  // «HOMBRE», «Masculino», «M», «H», «Male»… → "m"; «MUJER», «Femenino»,
  // «F», «W», «Female»… → "w". Lo que no se reconoce queda vacío: nunca se
  // adivina el sexo de nadie.
  function leerSexo(v) {
    const s = sinTildes(v);
    if (/^(m|h|hombre|hombres|masculino|masculina|varon|male|man|boy|nino)$/.test(s)) return "m";
    if (/^(f|w|mujer|mujeres|femenino|femenina|female|woman|girl|nina)$/.test(s)) return "w";
    return "";
  }

  // «Mujeres», «Femenino», «Rama femenina»… → "w"; «Abierto», «Masculino»,
  // «Open», «Mixto»… → "m" (el abierto). La columna del torneo, que no es
  // la del sexo: en el abierto juegan también mujeres.
  function leerTorneo(v) {
    const s = sinTildes(v).replace(/^(torneo|rama|categoria)\s+/, "");
    if (/^(f|w|mujer|mujeres|femenino|femenina|femeninos|women|female|girls?)$/.test(s)) return "w";
    if (/^(m|a|abierto|abierta|masculino|masculina|mixto|mixta|open|varones|hombres)$/.test(s)) return "m";
    return "";
  }

  // «Equipo», «Equipos», «Team», «Por equipos» → "equipo"; «Individual»,
  // «Ind», «Individuales» → "individual".
  function leerModalidad(v) {
    const s = sinTildes(v);
    if (/^(por )?equipos?$|^team(s)?$/.test(s)) return "equipo";
    if (/^ind(ividual(es)?)?\.?$/.test(s)) return "individual";
    return "";
  }

  // Una fecha escrita «7/17/2015» puede ser mes/día o día/mes. Se decide UNA
  // vez para toda la columna, mirando si algún valor solo tiene sentido de
  // una manera (un 17 no es un mes); sin pistas, día/mes, que es como se
  // escribe en Costa Rica.
  function ordenFechas(valores) {
    let md = false, dm = false;
    for (const v of valores) {
      const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(v == null ? "" : v).trim());
      if (!m) continue;
      if (Number(m[1]) > 12) dm = true;
      if (Number(m[2]) > 12) md = true;
    }
    return md && !dm ? "md" : "dm";
  }

  // A AAAA-MM-DD, o vacío si no es una fecha que exista.
  function leerFecha(v, orden) {
    const s = String(v == null ? "" : v).trim();
    let a, m, d;
    let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (x) { a = +x[1]; m = +x[2]; d = +x[3]; }
    else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) {
      a = +x[3];
      if (orden === "md") { m = +x[1]; d = +x[2]; } else { d = +x[1]; m = +x[2]; }
    } else return "";
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return "";
    return String(a).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  const DIMENSIONES = ["modalidad", "categoria", "sexo"];
  const PESO_MODALIDAD = { individual: 0, equipo: 1, "": 2 };
  const PESO_SEXO = { m: 0, w: 1, "": 2 };

  // Los grupos en que conviene partir la lista. Cada jugador trae `sexo`
  // ("m", "w" o ""), `categoria` (texto libre) y `modalidad` ("individual",
  // "equipo" o ""). Devuelve las dimensiones que separan (las que tienen dos
  // valores o más) y los grupos, en orden: individual antes que equipos, la
  // categoría por orden alfabético y masculino antes que femenino.
  // El torneo de cada uno: el que diga el archivo si trae una columna
  // «Torneo» o «Rama» (Mujeres o Abierto); si no, el de su sexo. La mujer
  // que pasa al abierto (pasarMujeresAlAbierto) cuenta en el abierto,
  // aunque su sexo siga siendo "w".
  const torneoBase = (j) => j.torneo || j.sexo || "";
  const torneoDe = (j) => (j.alAbierto ? "m" : torneoBase(j));

  function agrupar(lista) {
    const valor = (j, d) => (d === "categoria" ? String(j.categoria || "").trim() : d === "sexo" ? torneoDe(j) : j[d] || "");
    const dimensiones = DIMENSIONES.filter((d) => new Set(lista.map((j) => valor(j, d))).size > 1);
    const porClave = new Map();
    for (const j of lista) {
      const g = { modalidad: "", categoria: "", sexo: "" };
      for (const d of dimensiones) g[d] = valor(j, d);
      const clave = dimensiones.map((d) => g[d]).join("|");
      if (!porClave.has(clave)) porClave.set(clave, Object.assign(g, { clave, jugadores: [] }));
      porClave.get(clave).jugadores.push(j);
    }
    const grupos = [...porClave.values()].sort((a, b) =>
      PESO_MODALIDAD[a.modalidad] - PESO_MODALIDAD[b.modalidad] ||
      (a.categoria === "") - (b.categoria === "") ||
      a.categoria.localeCompare(b.categoria, "es", { numeric: true, sensitivity: "base" }) ||
      PESO_SEXO[a.sexo] - PESO_SEXO[b.sexo]);
    return { dimensiones, grupos };
  }

  // Lo que pide la Normativa de los JDE 2026 (art. 66, «Sistema de juego»)
  // para la Etapa Regional: con más de ocho por modalidad, suizo de no menos
  // de cinco rondas; con ocho o menos, todos contra todos; y un ritmo de no
  // menos de 10 minutos con 2 segundos de incremento. Con uno solo no hay
  // torneo. Es una sugerencia: el árbitro lo cambia en «Torneo» antes de la
  // ronda 1 (la Interregional y la Nacional tienen otras reglas).
  const JDE_MAX_TODOS = 8;
  const JDE_RONDAS_SUIZO = 5;
  const JDE_RITMO_MINIMO = "10 min + 2 s por jugada";
  function sistemaSugerido(n) {
    if (n < 2) return null;
    return n <= JDE_MAX_TODOS ? "todos" : "suizo";
  }

  // La categoría según el año de nacimiento: Normativa de los JDE 2026,
  // art. 17 (A y B son de primaria, C, D y E de secundaria; por eso B y C se
  // pisan en 2013 y 2014). Otro año, los mismos rangos corridos: se dice en
  // la página que hay que confirmarlo con la normativa de ese año.
  const JDE_ANIO_NORMATIVA = 2026;
  const JDE_CATEGORIAS = { A: [2017, 2020], B: [2013, 2016], C: [2012, 2014], D: [2009, 2011], E: [null, 2008] };
  // Art. 18: en las disciplinas individuales, subir de categoría solo se
  // permite en los eventos por equipos, de A a B, de C a D y de D a E, y
  // hasta tres por equipo.
  const JDE_ASCENSOS = { A: "B", C: "D", D: "E" };
  const JDE_MAX_ASCENSOS = 3;

  function rangoCategoria(cat, anio) {
    const r = JDE_CATEGORIAS[cat];
    if (!r) return null;
    const d = anio - JDE_ANIO_NORMATIVA;
    return [r[0] == null ? null : r[0] + d, r[1] + d];
  }
  const dentro = (r, a) => (r[0] == null || a >= r[0]) && a <= r[1];

  // Cada jugador con categoría A–E y fecha de nacimiento que NO cuadran.
  // Devuelve los permitidos (ascensos válidos por equipos) y los no
  // permitidos con su motivo: "individual" (en individual no se sube),
  // "mayor" (nació antes de lo que permite la categoría), "salto" (un
  // ascenso que no es A→B, C→D ni D→E) o "tope" (más de tres ascensos en
  // el mismo equipo: el mismo centro educativo, categoría y torneo). Los que
  // tienen categoría A–E pero no traen fecha van aparte: no se pueden revisar.
  function revisarCategorias(lista, anio) {
    const permitidos = [], noPermitidos = [], sinFecha = [];
    let revisados = 0;
    for (const j of lista) {
      const cat = String(j.categoria || "").trim().toUpperCase();
      const r = rangoCategoria(cat, anio);
      if (!r) continue;
      const nace = Number(String(j.nacimiento || "").slice(0, 4));
      if (!nace) { sinFecha.push(j); continue; }
      revisados++;
      if (dentro(r, nace)) continue;
      const propias = Object.keys(JDE_CATEGORIAS).filter((c) => dentro(rangoCategoria(c, anio), nace));
      const caso = { jugador: j, categoria: cat, nace, propia: propias.join(" o "), desde: r[0], hasta: r[1] };
      if (r[0] != null && nace < r[0]) noPermitidos.push(Object.assign(caso, { motivo: "mayor" }));
      else if (j.modalidad !== "equipo") noPermitidos.push(Object.assign(caso, { motivo: "individual" }));
      else if (propias.some((c) => JDE_ASCENSOS[c] === cat)) {
        // Nacido en 2013 o 2014 es de B (primaria) o de C (secundaria): el
        // que sube a la D es el de C, y se nombra esa.
        caso.propia = propias.find((c) => JDE_ASCENSOS[c] === cat);
        permitidos.push(caso);
      }
      else noPermitidos.push(Object.assign(caso, { motivo: "salto" }));
    }
    // El tope de tres, por equipo: si se pasa, ninguno de ese equipo queda
    // como permitido (la lista no dice cuáles tres eligió el centro).
    const porEquipo = new Map();
    for (const c of permitidos) {
      const k = [String(c.jugador.institucion || "").trim().toUpperCase(), c.categoria, torneoDe(c.jugador)].join("|");
      if (!porEquipo.has(k)) porEquipo.set(k, []);
      porEquipo.get(k).push(c);
    }
    const quedan = [];
    for (const casos of porEquipo.values()) {
      if (casos.length > JDE_MAX_ASCENSOS) for (const c of casos) noPermitidos.push(Object.assign(c, { motivo: "tope", cuantos: casos.length }));
      else quedan.push(...casos);
    }
    return { anio, normativa: JDE_ANIO_NORMATIVA, revisados, permitidos: quedan, noPermitidos, sinFecha };
  }

  // Un equipo es de tres a cinco (art. 66.1.g). Si en equipos un centro
  // educativo inscribe solo una o dos mujeres en una categoría, no le
  // alcanzan para un equipo de mujeres; si ese mismo centro presenta equipo
  // abierto en esa categoría, pasan al abierto para que puedan jugar (en el
  // abierto juegan hombres y mujeres). Con `aplicar` en false solo dice a
  // quiénes les pasaría, sin moverlas. Las que no tienen equipo abierto al
  // cual pasar se devuelven aparte: no hay dónde ponerlas.
  const JDE_MIN_EQUIPO = 3;
  function pasarMujeresAlAbierto(lista, aplicar) {
    const porEquipo = new Map();
    for (const j of lista) {
      delete j.alAbierto;
      if (j.modalidad !== "equipo") continue;
      const k = String(j.institucion || "").trim().toUpperCase() + "|" + String(j.categoria || "").trim().toUpperCase();
      if (!porEquipo.has(k)) porEquipo.set(k, []);
      porEquipo.get(k).push(j);
    }
    const pasadas = [], sinAbierto = [];
    for (const todos of porEquipo.values()) {
      const mujeres = todos.filter((j) => torneoBase(j) === "w");
      if (!mujeres.length || mujeres.length >= JDE_MIN_EQUIPO) continue;
      const caso = { institucion: mujeres[0].institucion || "", categoria: String(mujeres[0].categoria || "").trim(), mujeres, abierto: todos.length - mujeres.length };
      if (!caso.abierto) { sinAbierto.push(caso); continue; }
      if (aplicar !== false) for (const j of mujeres) j.alAbierto = true;
      pasadas.push(caso);
    }
    return { pasadas, sinAbierto };
  }

  // Los equipos con más de cinco inscritos (art. 66.1.g: «un máximo de
  // cinco estudiantes por equipo, [...] cuatro titulares y una suplente»).
  // Un equipo es el mismo centro educativo, categoría y torneo (mujeres o
  // abierto, ya con el pase de arriba). Cada uno con su clave y sus
  // integrantes en el orden de la inscripción; quién juega lo elige el
  // árbitro en la página.
  const JDE_MAX_EQUIPO = 5;
  // Y en individual, «sólo podrán clasificar a la Etapa Regional dos
  // personas estudiantes mujeres y dos personas estudiantes en abierto» por
  // centro (art. 66.1.f): el mismo centro, categoría y torneo, con dos como
  // tope.
  const JDE_MAX_INDIVIDUAL = 2;
  const equiposDeMas = (lista) => deMasPorCentro(lista, "equipo", JDE_MAX_EQUIPO);
  const individualesDeMas = (lista) => deMasPorCentro(lista, "individual", JDE_MAX_INDIVIDUAL);
  function deMasPorCentro(lista, modalidad, maximo) {
    const porEquipo = new Map();
    for (const j of lista) {
      if (j.modalidad !== modalidad) continue;
      const categoria = String(j.categoria || "").trim();
      const clave = [String(j.institucion || "").trim().toUpperCase(), categoria.toUpperCase(), torneoDe(j)].join("|");
      if (!porEquipo.has(clave)) porEquipo.set(clave, { clave, institucion: j.institucion || "", categoria, torneo: torneoDe(j), integrantes: [] });
      porEquipo.get(clave).integrantes.push(j);
    }
    return [...porEquipo.values()].filter((e) => e.integrantes.length > maximo)
      .sort((a, b) => a.clave.localeCompare(b.clave, "es"));
  }

  // La configuración de los JDE para un torneo de n jugadores (art. 66.2 a
  // 66.4, Etapa Regional): el sistema sugerido, al menos cinco rondas en el
  // suizo, el ritmo mínimo si no tiene uno, 1 · ½ · 0 y el bye del pareo en
  // 1, y desempates. La normativa pide «al menos tres» que fija el árbitro
  // en el congresillo, «preferiblemente» los de la Federación y FIDE: estos
  // son los de FIDE para cada sistema (C.07), y se pueden cambiar después.
  const JDE_DESEMPATES_SUIZO = ["BH-C1", "BH", "SB", "DE", "WIN"];
  const JDE_DESEMPATES_TODOS = ["DE", "SB", "WIN", "KS"];
  function configuracionJde(n, actual) {
    const a = actual || {};
    const sistema = sistemaSugerido(n) || a.sistema || "suizo";
    return {
      sistema,
      rondasTotales: Math.max(Number(a.rondasTotales) || 0, JDE_RONDAS_SUIZO),
      ritmo: String(a.ritmo || "").trim() || JDE_RITMO_MINIMO,
      puntos: { victoria: 1, tablas: 0.5, derrota: 0, bye: 1 },
      desempates: (sistema === "todos" ? JDE_DESEMPATES_TODOS : JDE_DESEMPATES_SUIZO).slice(),
    };
  }

  // La misma persona inscrita más de una vez. El reporte de los JDE trae
  // filas repetidas (la misma estudiante tres veces en el mismo equipo, con
  // otra fecha de inscripción): se reconoce por su documento de identidad
  // y, si no lo trae, por su nombre y fecha de nacimiento. La misma
  // inscripción repetida (misma modalidad y categoría) se deja una sola vez;
  // la misma persona en dos modalidades o categorías se deja como está y se
  // avisa: el art. 66.1.h permite una sola modalidad, y cuál vale lo decide
  // el árbitro.
  function quitarRepetidos(lista) {
    const quien = (j) => {
      const doc = String(j.documento || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
      return doc ? "doc:" + doc : "nom:" + sinTildes(j.nombre).replace(/\s+/g, " ") + "|" + (j.nacimiento || "");
    };
    const porPersona = new Map();
    const unicos = [], repetidos = [];
    for (const j of lista) {
      const k = quien(j);
      if (!porPersona.has(k)) porPersona.set(k, []);
      const suyas = porPersona.get(k);
      const igual = suyas.find((x) => x.modalidad === j.modalidad && String(x.categoria).trim().toUpperCase() === String(j.categoria).trim().toUpperCase());
      if (igual) { igual.veces = (igual.veces || 1) + 1; continue; }
      suyas.push(j);
      unicos.push(j);
    }
    const dosModalidades = [];
    for (const suyas of porPersona.values()) {
      for (const j of suyas) if (j.veces > 1) repetidos.push({ jugador: j, veces: j.veces });
      if (suyas.length > 1) dosModalidades.push({ jugador: suyas[0], inscripciones: suyas.map((x) => ({ jugador: x, modalidad: x.modalidad, categoria: String(x.categoria || "").trim() })) });
    }
    for (const j of unicos) delete j.veces;
    return { lista: unicos, repetidos, dosModalidades };
  }

  // Los equipos con menos de tres (art. 66.1.g: «un mínimo de tres
  // personas estudiantes»), sobre la lista que de verdad juega: ya con el
  // pase al abierto, los descartados de un equipo de más de cinco y la
  // modalidad elegida para quien estaba en dos. Solo se avisa: el árbitro
  // sabe si el centro completa el equipo el día del torneo.
  function equiposCortos(lista) {
    const porEquipo = new Map();
    for (const j of lista) {
      if (j.modalidad !== "equipo") continue;
      const categoria = String(j.categoria || "").trim();
      const clave = [String(j.institucion || "").trim().toUpperCase(), categoria.toUpperCase(), torneoDe(j)].join("|");
      if (!porEquipo.has(clave)) porEquipo.set(clave, { clave, institucion: j.institucion || "", categoria, torneo: torneoDe(j), integrantes: [] });
      porEquipo.get(clave).integrantes.push(j);
    }
    return [...porEquipo.values()].filter((e) => e.integrantes.length < JDE_MIN_EQUIPO)
      .sort((a, b) => a.clave.localeCompare(b.clave, "es"));
  }

  // Hombres en el torneo de mujeres (art. 66.1: «Torneo Individual Mujeres»
  // y «un equipo de mujeres»). Solo puede pasar cuando el archivo dice el
  // torneo aparte del sexo; con el sexo solo, cada hombre ya va al abierto.
  // Se avisa: el árbitro revisa si el error es el sexo o el torneo.
  function hombresEnMujeres(lista) {
    return lista.filter((j) => torneoDe(j) === "w" && j.sexo === "m");
  }

  const api = {
    quitarRepetidos, equiposCortos, individualesDeMas, JDE_MAX_INDIVIDUAL, configuracionJde, hombresEnMujeres, leerTorneo,
    pasarMujeresAlAbierto, JDE_MIN_EQUIPO, equiposDeMas, JDE_MAX_EQUIPO,
    leerSexo, leerModalidad, ordenFechas, leerFecha, agrupar, sistemaSugerido, revisarCategorias, rangoCategoria,
    JDE_MAX_TODOS, JDE_RONDAS_SUIZO, JDE_RITMO_MINIMO, JDE_ANIO_NORMATIVA, JDE_MAX_ASCENSOS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoGrupos = api;
})(typeof self !== "undefined" ? self : this);
