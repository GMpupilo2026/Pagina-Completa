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
  function agrupar(lista) {
    const valor = (j, d) => (d === "categoria" ? String(j.categoria || "").trim() : j[d] || "");
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

  const api = { leerSexo, leerModalidad, ordenFechas, leerFecha, agrupar, sistemaSugerido, JDE_MAX_TODOS, JDE_RONDAS_SUIZO, JDE_RITMO_MINIMO };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoGrupos = api;
})(typeof self !== "undefined" ? self : this);
