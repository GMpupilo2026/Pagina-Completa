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
    es: { ronda: "Ronda", mesa: "Mesa", mesas: "mesas", unaMesa: "mesa", bye: "Libre", clasificacion: "Clasificación tras la ronda", pts: "pts", provisional: "provisional: faltan resultados", enVivo: "En vivo", pie: "Pareo Integral · ajedrez-integral.com" },
    en: { ronda: "Round", mesa: "Board", mesas: "boards", unaMesa: "board", bye: "Bye", clasificacion: "Standings after round", pts: "pts", provisional: "provisional: results missing", enVivo: "Live", pie: "Pareo Integral · ajedrez-integral.com" },
  };
  const RESULTADO = { "1-0": "1-0", "0-1": "0-1", "=": "½-½", "+-": "+ -", "-+": "- +", "--": "- -" };

  const puntosTexto = (x) => {
    const n = Math.floor(x), m = x - n;
    return (n || !m ? String(n) : "") + (Math.abs(m - 0.5) < 1e-9 ? "½" : "");
  };
  // Un asterisco dentro de un nombre abriría una negrita: se quita.
  const limpio = (s) => String(s || "").replace(/[*_~`]/g, "").trim();
  const nombreTorneo = (t) => limpio(t.grupo || t.nombre);

  // Un nombre escrito todo en mayúsculas (como vienen las inscripciones del
  // MEP) se lee como un grito en el celular: pasa a mayúscula inicial, con
  // «de», «la»… en minúscula y las siglas como están (sin vocales, como CTP,
  // los números romanos y las de la lista). Un nombre que ya trae minúsculas
  // no se toca: así lo escribió quien lo inscribió.
  const SIGLAS = new Set(["IPEC", "CINDEA", "UNED", "CEDES", "SINEM", "UCR", "TEC", "UNA", "UTN", "MEP", "CCSS", "INA", "IEGB", "CNP", "ICE", "CTP"]);
  const MENORES = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "para", "con"]);
  function legible(s) {
    const x = limpio(s);
    if (/[a-zà-ÿ]/.test(x)) return x;
    let primera = true;
    return x.replace(/[A-ZÀ-ÞÑ0-9][A-ZÀ-ÞÑ0-9'.]*/g, (p) => {
      const era = primera;
      primera = false;
      if (SIGLAS.has(p) || /^[IVXLC]+$/.test(p) && p.length <= 4 || !/[AEIOUÁÉÍÓÚÜ]/.test(p)) return p;
      const min = p.toLocaleLowerCase("es");
      if (!era && MENORES.has(min)) return min;
      return min.charAt(0).toLocaleUpperCase("es") + min.slice(1);
    });
  }

  // El pareo de la ronda r (desde 0), mesa por mesa con su número en la sala.
  function textoRonda(t, r, opciones) {
    const o = opciones || {};
    const x = TEXTOS[o.idioma === "en" ? "en" : "es"];
    const R = t.rondas[r];
    if (!R) return "";
    const deEquipos = E.esDeEquipos(t);
    const nombre = (id) => legible((t.jugadores.find((j) => j.id === id) || {}).nombre || "?");
    // Los puntos que llevaba cada uno antes de la ronda (en individual), como
    // en las listas de pareo de FIDE.
    const conPuntos = (id) => nombre(id) + (r > 0 && !deEquipos ? " (" + puntosTexto(T.puntosHasta(t, id, r)) + ")" : "");
    // Una mesa por bloque: su número en negrita (con el resultado, si ya
    // está) y cada uno en su línea, ⚪ con blancas y ⚫ con negras. En un
    // celular, «A – B» en una sola línea se partía en cualquier lado.
    const jugadas = R.mesas.filter((m) => m.n !== null).length;
    const lineas = ["♟️ *" + (nombreTorneo(t) || x.ronda) + "*", "*" + x.ronda + " " + (r + 1) + "* · " + jugadas + " " + (jugadas === 1 ? x.unaMesa : x.mesas)];
    const libres = [];
    R.mesas.forEach((m, i) => {
      if (m.n === null) { libres.push(conPuntos(m.b)); return; }
      lineas.push("", "*" + x.mesa + " " + V.mesaFisica(t, i) + "*" + (m.r ? " · *" + RESULTADO[m.r] + "*" : ""), "⚪ " + conPuntos(m.b), "⚫ " + conPuntos(m.n));
    });
    if (libres.length) lineas.push("", "*" + x.bye + ":* " + libres.join(", "));
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
    const nombre = (id) => legible((t.jugadores.find((j) => j.id === id) || {}).nombre || "?");
    const lineas = ["🏆 *" + (nombreTorneo(t) || x.clasificacion) + "*", "*" + x.clasificacion + " " + k + "*"];
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
    if (o.enlace) lineas.push("🔴 " + x.enVivo + ": " + o.enlace);
    lineas.push(x.pie);
    return lineas.join("\n");
  }

  // El enlace que abre WhatsApp con el mensaje escrito (el que lo manda elige
  // a quién). wa.me sirve en el celular y en la computadora.
  const enlaceWhatsapp = (texto) => "https://wa.me/?text=" + encodeURIComponent(texto);

  const api = { textoRonda, textoClasificacion, enlaceWhatsapp, legible };
  if (enNode) module.exports = api;
  else raiz.PareoCompartir = api;
})(typeof self !== "undefined" ? self : this);
