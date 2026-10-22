/* ===== Pareo Integral — los premios especiales =====
 *
 * Lógica pura (sin DOM): la usan pareo.html, el informe de premiación del
 * evento (js/pareo/evento.js) y los verificadores en Node.
 *
 * Además del podio, un torneo individual puede repartir premios por franja de
 * Elo, por categoría (el campo libre de cada jugador, como «Sub-10»), a la
 * mejor mujer y al mejor sin Elo. Se guardan en el torneo:
 *
 *   t.premiosEspeciales = [{ tipo: "elo", desde, hasta, cuantos }
 *                         | { tipo: "categoria", valor, cuantos }
 *                         | { tipo: "mujer", cuantos }
 *                         | { tipo: "sinElo", cuantos }]
 *
 * La regla, como en las bases de casi todos los torneos: NADIE SE LLEVA DOS
 * PREMIOS. Primero el podio (los puestos 1 a 3 de la clasificación), después
 * cada premio especial en el orden en que está anotado, y cada uno se lo lleva
 * el mejor clasificado que todavía no tiene premio. Ver «Los premios
 * especiales» en docs/decisiones/juegos-y-torneos.md.
 */
(function (raiz) {
  "use strict";

  const TIPOS = ["elo", "categoria", "mujer", "sinElo"];
  const GENERALES = 3;
  const MAX_POR_PREMIO = 3;

  const eloDe = (j) => (Number(j && j.elo) > 0 ? Number(j.elo) : 0);
  const clave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

  // Un premio bien formado, o null (lo que llega de un archivo se limpia acá).
  function normalizar(p) {
    if (!p || TIPOS.indexOf(p.tipo) < 0) return null;
    const cuantos = Math.min(MAX_POR_PREMIO, Math.max(1, Math.floor(Number(p.cuantos) || 1)));
    if (p.tipo === "elo") {
      const desde = Number(p.desde) > 0 ? Math.floor(Number(p.desde)) : 0;
      const hasta = Number(p.hasta) > 0 ? Math.floor(Number(p.hasta)) : 0;
      if (!desde && !hasta) return null;
      if (desde && hasta && hasta < desde) return null;
      return { tipo: "elo", desde, hasta, cuantos };
    }
    if (p.tipo === "categoria") {
      const valor = String(p.valor || "").trim().slice(0, 30);
      return valor ? { tipo: "categoria", valor, cuantos } : null;
    }
    return { tipo: p.tipo, cuantos };
  }

  function puedeGanar(p, j) {
    if (!j) return false;
    if (p.tipo === "elo") { const e = eloDe(j); return e > 0 && (!p.desde || e >= p.desde) && (!p.hasta || e <= p.hasta); }
    if (p.tipo === "categoria") return clave(j.categoria) === clave(p.valor);
    if (p.tipo === "mujer") return j.sexo === "w" || j.sexo === "f";
    if (p.tipo === "sinElo") return !eloDe(j);
    return false;
  }

  // El nombre del premio, en el idioma de la página ("es" o "en").
  function etiqueta(p, idioma) {
    const en = idioma === "en";
    if (p.tipo === "elo") {
      if (p.desde && p.hasta) return en ? "Rating " + p.desde + "–" + p.hasta : "Elo de " + p.desde + " a " + p.hasta;
      if (p.desde) return en ? "Rating " + p.desde + " and over" : "Elo de " + p.desde + " o más";
      return en ? "Rating up to " + p.hasta : "Elo hasta " + p.hasta;
    }
    if (p.tipo === "categoria") return (en ? "Category " : "Categoría ") + p.valor;
    if (p.tipo === "mujer") return en ? "Best woman" : "Mejor mujer";
    return en ? "Best unrated" : "Mejor sin Elo";
  }

  // filas: la clasificación ya ordenada ([{ id, puesto, puntos }]).
  // jugadorDe(id) devuelve al jugador. Devuelve el podio y, por cada premio
  // especial, quién se lo lleva (con su lugar dentro del premio).
  function asignar(t, filas, jugadorDe) {
    const ya = new Set();
    // El podio es el de la premiación (V.podio): los puestos 1 a 3, con los
    // empatados que los desempates no separaron.
    const generales = filas.filter((f) => f.puesto <= GENERALES).map((f) => { ya.add(f.id); return { lugar: f.puesto, id: f.id, puesto: f.puesto, puntos: f.puntos }; });
    const especiales = [];
    for (const crudo of t.premiosEspeciales || []) {
      const p = normalizar(crudo);
      if (!p) continue;
      const ganadores = [];
      for (const f of filas) {
        if (ganadores.length >= p.cuantos) break;
        if (ya.has(f.id) || !puedeGanar(p, jugadorDe(f.id))) continue;
        ya.add(f.id);
        ganadores.push({ lugar: ganadores.length + 1, id: f.id, puesto: f.puesto, puntos: f.puntos });
      }
      // Cuántos podían ganarlo, contando a los que ya tenían otro premio:
      // si nadie podía, el premio dice por qué quedó vacío.
      const candidatos = filas.filter((f) => puedeGanar(p, jugadorDe(f.id))).length;
      especiales.push({ premio: p, ganadores, candidatos });
    }
    return { generales, especiales };
  }

  // Las categorías que tienen los jugadores, para ofrecerlas en la lista.
  function categorias(t) {
    const vistas = new Map();
    for (const j of t.jugadores || []) {
      const c = String(j.categoria || "").trim();
      if (c && !vistas.has(clave(c))) vistas.set(clave(c), c);
    }
    return [...vistas.values()].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }

  const api = { TIPOS, GENERALES, MAX_POR_PREMIO, normalizar, puedeGanar, etiqueta, asignar, categorias };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoPremios = api;
})(typeof self !== "undefined" ? self : this);
