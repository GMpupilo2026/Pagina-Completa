/* ===== Pareo Integral — el texto para compartir por WhatsApp =====
 *
 * El pareo de una ronda o la clasificación, escritos como un mensaje: listos
 * para pegar en el grupo de las familias o de los entrenadores. WhatsApp
 * pone en negrita lo que va entre asteriscos; nada más tiene formato.
 *
 * Lógica pura (sin DOM): la usa js/pareo/pagina.js y la prueba
 * herramientas/verificar-pareo-compartir.js. El texto sale en el idioma de la
 * página. Ver «Compartir por WhatsApp» en docs/decisiones/juegos-y-torneos.md.
 */
(function (raiz) {
  "use strict";

  const enNode = typeof module !== "undefined" && module.exports;
  const T = enNode ? require("./torneo.js") : raiz.PareoTorneo;
  const E = enNode ? require("./equipos.js") : raiz.PareoEquipos;
  const V = enNode ? require("./evento.js") : raiz.PareoEvento;

  const TEXTOS = {
    es: { ronda: "Ronda", mesa: "Mesa", bye: "Libre", clasificacion: "Clasificación tras la ronda", pts: "pts", provisional: "provisional: faltan resultados", enVivo: "En vivo", pie: "Pareo Integral · ajedrez-integral.com" },
    en: { ronda: "Round", mesa: "Board", bye: "Bye", clasificacion: "Standings after round", pts: "pts", provisional: "provisional: results missing", enVivo: "Live", pie: "Pareo Integral · ajedrez-integral.com" },
  };
  const RESULTADO = { "1-0": "1-0", "0-1": "0-1", "=": "½-½", "+-": "+ -", "-+": "- +", "--": "- -" };

  const puntosTexto = (x) => {
    const n = Math.floor(x), m = x - n;
    return (n || !m ? String(n) : "") + (Math.abs(m - 0.5) < 1e-9 ? "½" : "");
  };
  // Un asterisco dentro de un nombre abriría una negrita: se quita.
  const limpio = (s) => String(s || "").replace(/[*_~`]/g, "").trim();
  const nombreTorneo = (t) => limpio(t.grupo || t.nombre);

  // El pareo de la ronda r (desde 0), mesa por mesa con su número en la sala.
  function textoRonda(t, r, opciones) {
    const o = opciones || {};
    const x = TEXTOS[o.idioma === "en" ? "en" : "es"];
    const R = t.rondas[r];
    if (!R) return "";
    const deEquipos = E.esDeEquipos(t);
    const nombre = (id) => limpio((t.jugadores.find((j) => j.id === id) || {}).nombre || "?");
    // Los puntos que llevaba cada uno antes de la ronda (en individual), como
    // en las listas de pareo de FIDE.
    const conPuntos = (id) => nombre(id) + (r > 0 && !deEquipos ? " (" + puntosTexto(T.puntosHasta(t, id, r)) + ")" : "");
    const lineas = ["*" + (nombreTorneo(t) ? nombreTorneo(t) + " — " : "") + x.ronda + " " + (r + 1) + "*", ""];
    const libres = [];
    R.mesas.forEach((m, i) => {
      if (m.n === null) { libres.push(conPuntos(m.b)); return; }
      lineas.push(x.mesa + " " + V.mesaFisica(t, i) + ": " + conPuntos(m.b) + " – " + conPuntos(m.n) + (m.r ? "  *" + RESULTADO[m.r] + "*" : ""));
    });
    for (const b of libres) lineas.push(x.bye + ": " + b);
    return cerrar(lineas, o, x);
  }

  // La clasificación con las rondas completas (k): puesto, nombre, puntos y
  // el primer desempate. Con `cuantos`, solo los primeros.
  function textoClasificacion(t, opciones) {
    const o = opciones || {};
    const x = TEXTOS[o.idioma === "en" ? "en" : "es"];
    const k = V.rondasCompletas(t);
    if (!k) return "";
    const filas = V.aplicarDesempate(t, E.clasificacion(Object.assign({}, t, { rondas: t.rondas.slice(0, k) }), t.desempates));
    const primero = (t.desempates || [])[0];
    const nombre = (id) => limpio((t.jugadores.find((j) => j.id === id) || {}).nombre || "?");
    const lineas = ["*" + (nombreTorneo(t) ? nombreTorneo(t) + " — " : "") + x.clasificacion + " " + k + "*"];
    if (k < t.rondas.length) lineas.push("(" + x.provisional + ")");
    lineas.push("");
    const lista = o.cuantos ? filas.slice(0, o.cuantos) : filas;
    for (const f of lista) {
      const d = primero && primero !== "TB" && f.valores && f.valores[primero] != null ? " · " + primero + " " + Math.round(Number(f.valores[primero]) * 100) / 100 : "";
      lineas.push(f.puesto + ". " + nombre(f.id) + " — " + puntosTexto(f.puntos) + " " + x.pts + d);
    }
    return cerrar(lineas, o, x);
  }

  function cerrar(lineas, o, x) {
    lineas.push("");
    if (o.enlace) lineas.push(x.enVivo + ": " + o.enlace);
    lineas.push(x.pie);
    return lineas.join("\n");
  }

  // El enlace que abre WhatsApp con el mensaje escrito (el que lo manda elige
  // a quién). wa.me sirve en el celular y en la computadora.
  const enlaceWhatsapp = (texto) => "https://wa.me/?text=" + encodeURIComponent(texto);

  const api = { textoRonda, textoClasificacion, enlaceWhatsapp };
  if (enNode) module.exports = api;
  else raiz.PareoCompartir = api;
})(typeof self !== "undefined" ? self : this);
