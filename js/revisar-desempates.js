/* revisar-desempates.html — Revisa los desempates (gratis, sin cuenta).
 *
 * Se pega la dirección de un torneo individual de chess-results y la página:
 *  1. trae el cuadro cruzado (art=4) por la Edge Function
 *     revisar-desempates y, si es todos contra todos, los
 *     emparejamientos (art=2);
 *  2. lo pasa al torneo de Pareo Integral (js/revisar-desempates-cr.js) y calcula cada
 *     desempate con el C.07:2026 (js/pareo/desempates.js), el mismo cálculo
 *     de pareo.html;
 *  3. lo compara con lo que publicó chess-results, jugador por jugador, y lo
 *     explica: de dónde sale cada número, ronda por ronda, y por qué un
 *     jugador quedó delante de otro.
 *
 * Cuando chess-results no dice el corte de un desempate («Buchholz
 * Tie-Breaks (variabel with parameter)»), se prueban las variantes y se usa la
 * que da los números publicados. El torneo va en la dirección (?t=…) para
 * compartir la explicación. Ver «Revisa los desempates» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const CR = window.RevisarDesempatesCR;
  const PD = window.PareoDesempates;
  const PT = window.PareoTorneo;
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 });
  const n = (v) => (v == null ? "—" : fmt.format(v));
  const NOMBRE = Object.fromEntries(PD.CATALOGO.map((c) => [c.codigo, c.es]));

  // Lo que dice el C.07:2026 de cada uno, en una línea.
  const QUE_ES = {
    "BH": "La suma de los puntos de todos sus rivales.",
    "BH-C1": "La suma de los puntos de sus rivales, sin el que menos tiene.",
    "BH-C2": "La suma de los puntos de sus rivales, sin los dos que menos tienen.",
    "BH-M1": "La suma de los puntos de sus rivales, sin el que más y sin el que menos tiene.",
    "BH-M2": "La suma de los puntos de sus rivales, sin los dos que más y los dos que menos tienen.",
    "SB": "Los puntos de los rivales a los que les ganó, más la mitad de los puntos de los que hizo tablas.",
    "SB-C1": "Como el Sonneborn-Berger, sin el aporte más bajo.",
    "DE": "Los puntos que hizo contra los jugadores con los que está empatado.",
    "WIN": "Las rondas que ganó, en el tablero o no (un bye de un punto cuenta).",
    "WON": "Las partidas que ganó jugando en el tablero.",
    "BPG": "Las partidas que jugó con negras.",
    "BWG": "Las partidas que ganó con negras.",
    "GE": "Las rondas que eligió jugar (todas, menos los byes que pidió y las incomparecencias).",
    "PS": "La suma de su puntaje después de cada ronda: premia ganar temprano.",
    "PS-C1": "Como el progresivo, sin la primera ronda.",
    "KS": "Los puntos que hizo contra los rivales que terminaron con al menos la mitad de los puntos.",
    "STD": "Una ronda ganada vale 1, una empatada ½ (como si los puntos del torneo fueran los clásicos).",
    "ARO": "El promedio del Elo de sus rivales.",
    "ARO-C1": "El promedio del Elo de sus rivales, sin el más bajo.",
    "TPR": "Su rendimiento: el Elo medio de sus rivales más lo que da su porcentaje en la tabla de FIDE.",
    "PTP": "El Elo con el que su puntaje sería exactamente el esperado.",
    "FB": "El Buchholz como si la última ronda hubiera terminado toda en tablas.",
    "AOB": "El promedio del Buchholz de sus rivales.",
    "APRO": "El promedio del rendimiento de sus rivales.",
    "APPO": "El promedio del rendimiento perfecto de sus rivales.",
    "AFB": "El promedio del Fore Buchholz de sus rivales.",
  };

  let estado = null;   // { cuadro, torneo, criterios, puntos, porId, url }

  function el(etiqueta, clase, texto) {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  // ---------- Pedir a chess-results ----------

  async function traer(url, art) {
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/revisar-desempates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: window.SUPABASE_ANON_KEY },
      body: JSON.stringify({ url, art }),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok || !datos.html) throw new Error(datos.error || "No se pudo leer el torneo. Intenta de nuevo en un rato.");
    return datos.html;
  }

  // ---------- Las cuentas ----------

  function rondasDe(id) {
    const t = estado.torneo;
    return t.rondas.map((R, r) => {
      const m = R.mesas.find((x) => x.b === id || x.n === id);
      if (!m) {
        const a = (R.ausencias || {})[id];
        return { ronda: r + 1, rival: null, puntos: a === "H" ? 0.5 : a === "F" ? 1 : 0, tipo: a === "H" ? "bye de medio punto" : a === "F" ? "bye de un punto" : "no jugó" };
      }
      if (m.n === null) return { ronda: r + 1, rival: null, puntos: 1, tipo: "bye de un punto" };
      const blancas = m.b === id;
      const rival = blancas ? m.n : m.b;
      const p = { "1-0": [1, 0], "0-1": [0, 1], "=": [0.5, 0.5], "+-": [1, 0], "-+": [0, 1], "--": [0, 0] }[m.r] || [null, null];
      const puntos = blancas ? p[0] : p[1];
      const sinJugar = m.r === "+-" || m.r === "-+" || m.r === "--";
      return { ronda: r + 1, rival, color: blancas ? "blancas" : "negras", puntos, sinJugar, tipo: m.r == null ? "sin resultado" : sinJugar ? (puntos ? "ganó sin jugar" : "perdió sin jugar") : "" };
    });
  }

  // El encuentro directo entre los empatados en TODO lo anterior (C.07 6.1):
  // con los puntos y los desempates que van antes, como los publicó
  // chess-results (es el orden que hay que explicar).
  function encuentroDirecto(antes) {
    const t = estado.torneo;
    const grupo = new Map();
    for (const j of t.jugadores) {
      const k = [estado.puntos[j.id]].concat(antes.map((c) => valorParaOrden(c, j.id))).join("|");
      if (!grupo.has(k)) grupo.set(k, new Set());
      grupo.get(k).add(j.id);
    }
    const valores = {}, empatados = {};
    for (const j of t.jugadores) {
      const k = [estado.puntos[j.id]].concat(antes.map((c) => valorParaOrden(c, j.id))).join("|");
      const g = grupo.get(k);
      empatados[j.id] = [...g].filter((x) => x !== j.id);
      valores[j.id] = empatados[j.id].length
        ? rondasDe(j.id).filter((x) => x.rival && g.has(x.rival) && x.puntos != null && (!x.sinJugar || t.sistema === "todos")).reduce((s, x) => s + x.puntos, 0)
        : 0;
    }
    return { valores, empatados };
  }

  // En el encuentro directo, chess-results escribe 0 a todo un grupo de
  // empatados cuando el encuentro no separa a nadie (se ganaron en círculo):
  // si el cálculo tampoco separa al grupo, dicen lo mismo.
  function noSepara(id, empatados, calculado, publicados) {
    if (!empatados || !empatados[id] || !empatados[id].length) return false;
    const grupo = [id].concat(empatados[id]);
    const igual = (m) => grupo.every((x) => m[x] != null && Math.abs(m[x] - m[id]) < 0.006);
    return igual(calculado) && igual(publicados);
  }

  // ¿El número calculado dice lo mismo que el publicado?
  function coincide(c, id) {
    const pub = c.publicados[id], calc = c.calculado[id];
    if (pub == null || calc == null || c.sinCalculo) return true;
    return c.coincide ? c.coincide[id] !== false : Math.abs(pub - calc) < 0.006;
  }

  function valorParaOrden(c, id) {
    const p = c.publicados ? c.publicados[id] : null;
    return p != null ? p : c.calculado[id];
  }

  function armarCriterios(cuadro) {
    const t = estado.torneo;
    const criterios = [];
    for (const d of cuadro.desempates) {
      const publicados = Object.fromEntries(cuadro.jugadores.map((j) => [j.rk, j.publicados[d.n]]));
      if (d.puntos) {
        criterios.push({ n: d.n, texto: d.texto, codigo: "PTS", nombre: "Puntos", publicados, calculado: estado.puntos, puntos: true });
        continue;
      }
      if (!d.codigos.length) {
        criterios.push({ n: d.n, texto: d.texto, codigo: null, nombre: d.texto, publicados, calculado: {}, sinCalculo: d.sinCalculo });
        continue;
      }
      // Cada variante posible; se queda la que más coincide con lo publicado.
      let mejor = null;
      for (const codigo of d.codigos) {
        let calculado, empatados = null;
        if (codigo === "DE") ({ valores: calculado, empatados } = encuentroDirecto(criterios.filter((c) => !c.puntos)));
        else calculado = PD.calcular(t, codigo);
        const comparables = t.jugadores.filter((j) => publicados[j.id] != null);
        const coincide = {};
        for (const j of comparables) coincide[j.id] = Math.abs(publicados[j.id] - calculado[j.id]) < 0.006 || noSepara(j.id, empatados, calculado, publicados);
        const iguales = comparables.filter((j) => coincide[j.id]).length;
        if (!mejor || iguales > mejor.iguales) mejor = { codigo, calculado, empatados, iguales, coincide, comparables: comparables.length };
      }
      criterios.push({ n: d.n, texto: d.texto, codigo: mejor.codigo, nombre: NOMBRE[mejor.codigo] || mejor.codigo, publicados, calculado: mejor.calculado,
        empatados: mejor.empatados, coincide: mejor.coincide, iguales: mejor.iguales, comparables: mejor.comparables, variantes: d.codigos.length > 1 ? d.codigos : null,
        sinElo: /^(ARO|TPR|PTP|APRO|APPO)/.test(mejor.codigo) && !cuadro.conElo });
    }
    if (!criterios.some((c) => c.puntos)) criterios.unshift({ n: 0, texto: "Puntos", codigo: "PTS", nombre: "Puntos", publicados: {}, calculado: estado.puntos, puntos: true });
    return criterios;
  }

  // ---------- Pintar ----------

  const nombreDe = (id) => (estado.torneo.jugadores.find((j) => j.id === id) || {}).nombre || id;

  function resumen() {
    const { cuadro, torneo, criterios } = estado;
    $("rd-titulo").textContent = cuadro.titulo;
    $("rd-subtitulo").textContent = (cuadro.sistema === "todos" ? "Todos contra todos" : "Suizo") + " · " + torneo.jugadores.length + " jugadores · "
      + torneo.rondas.length + (torneo.rondas.length === 1 ? " ronda" : " rondas") + (cuadro.final ? "" : " · todavía en juego");
    const lista = $("rd-criterios");
    lista.replaceChildren();
    for (const c of criterios) {
      const li = el("li");
      li.append(el("strong", null, c.nombre));
      if (c.codigo && !c.puntos) li.append(document.createTextNode(" (" + c.codigo + ")"));
      const nota = el("span", "rd-nota");
      if (c.sinCalculo) nota.textContent = "No se calcula: " + c.sinCalculo + ".";
      else if (c.puntos) {
        const mal = torneo.jugadores.filter((j) => c.publicados[j.id] != null && Math.abs(c.publicados[j.id] - c.calculado[j.id]) > 0.006);
        nota.textContent = mal.length ? "Los puntos de " + mal.length + " jugador(es) no dan lo mismo que en chess-results: revisa las rondas sin jugar." : "Coinciden con chess-results.";
        if (mal.length) nota.classList.add("rd-distinto");
      } else if (c.comparables) {
        const todos = c.iguales === c.comparables;
        nota.textContent = (todos ? "Coincide con chess-results en los " + c.comparables + " jugadores." : "Coincide en " + c.iguales + " de " + c.comparables + " jugadores; los distintos están marcados en la tabla.")
          + (c.variantes ? " chess-results no dice el corte: es el que da sus números." : "");
        if (!todos) nota.classList.add("rd-distinto");
      }
      if (c.sinElo) nota.textContent += " Este cuadro no trae el Elo: el cálculo no lo puede hacer.";
      if (c.texto && c.texto !== c.nombre) li.append(el("span", "rd-sub", "En chess-results: «" + c.texto + "»"));
      li.append(nota);
      lista.append(li);
    }
    const avisos = $("rd-avisos");
    avisos.replaceChildren();
    for (const a of estado.avisos.slice(0, 10)) avisos.append(el("li", null, a));
    $("rd-avisos-caja").hidden = !estado.avisos.length;
  }

  function tabla() {
    const { cuadro, criterios } = estado;
    const cab = $("rd-tabla").tHead.rows[0];
    cab.replaceChildren();
    for (const t of ["Puesto", "Nombre"]) { const th = el("th", null, t); th.scope = "col"; cab.append(th); }
    for (const c of criterios) { const th = el("th", "ae-n", c.puntos ? "Pts." : (c.codigo || "Des " + c.n)); th.scope = "col"; th.title = c.nombre; cab.append(th); }
    const th = el("th", null, ""); th.scope = "col"; th.append(el("span", "sr-only", "Explicar")); cab.append(th);
    const cuerpo = $("rd-tabla").tBodies[0];
    cuerpo.replaceChildren();
    for (const j of cuadro.jugadores) {
      const tr = el("tr");
      tr.append(el("td", null, j.rk));
      const nom = el("th", null, j.nombre); nom.scope = "row"; tr.append(nom);
      for (const c of criterios) {
        const td = el("td", "ae-n");
        const calc = c.calculado[j.rk], pub = c.publicados[j.rk];
        if (c.sinCalculo) td.textContent = n(pub);
        else {
          td.textContent = n(calc);
          if (!coincide(c, j.rk)) {
            td.classList.add("rd-distinto");
            td.append(el("span", "rd-sub", "chess-results: " + n(pub)));
          }
        }
        tr.append(td);
      }
      const td = el("td");
      const b = el("button", "ae-boton rd-explicar", "Explicar");
      b.type = "button";
      b.dataset.id = j.rk;
      b.setAttribute("aria-label", "Explicar los desempates de " + j.nombre);
      b.addEventListener("click", () => explicar(j.rk, true));
      td.append(b);
      tr.append(td);
      cuerpo.append(tr);
    }
    for (const id of ["rd-a", "rd-b"]) {
      const s = $(id);
      s.replaceChildren();
      for (const j of cuadro.jugadores) s.append(new Option(j.rk + ". " + j.nombre, j.rk));
    }
    $("rd-a").value = cuadro.jugadores[0] ? cuadro.jugadores[0].rk : "";
    $("rd-b").value = cuadro.jugadores[1] ? cuadro.jugadores[1].rk : "";
  }

  function lineaRonda(x) {
    if (!x.rival) return "Ronda " + x.ronda + ": " + x.tipo + " (" + n(x.puntos) + ")";
    return "Ronda " + x.ronda + ": con " + x.color + " contra " + nombreDe(x.rival) + (x.tipo ? ", " + x.tipo : "") + " (" + n(x.puntos) + ")";
  }

  function detalle(c, id) {
    const caja = el("section", "rd-criterio");
    const h = el("h3", "font-semibold text-brand-800 dark:text-white", c.nombre + (c.codigo && !c.puntos ? " (" + c.codigo + ")" : "") + ": " + n(c.sinCalculo ? c.publicados[id] : c.calculado[id]));
    caja.append(h);
    if (QUE_ES[c.codigo]) caja.append(el("p", "rd-sub", QUE_ES[c.codigo]));
    const pub = c.publicados[id], calc = c.calculado[id];
    if (c.codigo === "DE" && pub != null && calc != null && Math.abs(pub - calc) > 0.006 && coincide(c, id)) {
      caja.append(el("p", "rd-sub", "chess-results escribe " + n(pub) + ": el encuentro directo no separa a este grupo de empatados (todos sacaron lo mismo entre ellos), así que pasa al siguiente desempate."));
    } else if (!coincide(c, id)) {
      caja.append(el("p", "rd-distinto", "chess-results publicó " + n(pub) + ". La diferencia casi siempre está en las rondas que no se jugaron (byes, incomparecencias, retiros): el C.07 de 2026 las cuenta con un rival «ficticio» con los mismos puntos del jugador (art. 16), y el programa con que se hizo el torneo puede estar configurado con la regla vieja."));
    }
    if (c.sinCalculo) { caja.append(el("p", "rd-sub", "No se calcula: " + c.sinCalculo + ".")); return caja; }

    const lista = el("ul", "ec-lista");
    if (c.puntos) {
      for (const x of rondasDe(id)) lista.append(el("li", null, lineaRonda(x)));
    } else if (/^(BH|SB)/.test(c.codigo)) {
      // explicar() de js/pareo/desempates.js: una fila por ronda con lo que
      // aporta y si se corta (el mismo que usa desempates.html).
      const ex = PD.explicar(estado.torneo, id, c.codigo) || { filas: [] };
      const sb = /^SB/.test(c.codigo);
      for (const f of ex.filas) {
        // Una ronda no jugada (bye o incomparecencia en un suizo) cuenta con
        // un rival ficticio con los puntos del jugador (art. 16.4).
        const jugada = ["1", "0", "½"].includes(f.resultado) || (estado.torneo.sistema === "todos" && f.rivalId);
        const texto = "Ronda " + f.ronda + ": " + (sb
          ? (jugada && f.rivalId ? nombreDe(f.rivalId) : "rival ficticio (" + f.resultado + ", art. 16.4)") + ", resultado " + f.resultado + " → " + n(f.valor)
          : jugada && f.rivalId ? nombreDe(f.rivalId) + " (" + n(f.valor) + " pts)" : "rival ficticio con " + n(f.valor) + " pts (" + f.resultado + ", art. 16.4)");
        lista.append(el("li", f.incluido ? null : "rd-cortado", texto + (f.incluido ? "" : " — se corta")));
      }
      if (/^SB/.test(c.codigo)) caja.append(el("p", "rd-sub", "Cada rival aporta sus puntos multiplicados por lo que el jugador le hizo: 1 si le ganó, ½ si hizo tablas, 0 si perdió."));
      caja.append(el("p", "rd-sub", "Los puntos de un rival que pidió byes al final cuentan esos byes como tablas (art. 16.3)."));
    } else if (c.codigo === "DE") {
      const otros = (c.empatados && c.empatados[id]) || [];
      if (!otros.length) lista.append(el("li", null, "No está empatado con nadie en lo anterior: el encuentro directo no se usa (vale 0)."));
      else {
        lista.append(el("li", null, "Empatado en todo lo anterior con: " + otros.map(nombreDe).join(", ") + "."));
        const juegos = rondasDe(id).filter((x) => x.rival && otros.includes(x.rival));
        if (!juegos.length) lista.append(el("li", null, "No jugó contra ninguno de ellos."));
        for (const x of juegos) lista.append(el("li", null, lineaRonda(x)));
      }
    } else if (["WIN", "WON", "BWG", "BPG", "GE"].includes(c.codigo)) {
      const filtro = {
        WIN: (x) => x.puntos === 1,
        WON: (x) => x.rival && !x.sinJugar && x.puntos === 1,
        BWG: (x) => x.color === "negras" && !x.sinJugar && x.puntos === 1,
        BPG: (x) => x.color === "negras" && !x.sinJugar,
        GE: (x) => (x.rival && !(x.sinJugar && !x.puntos)) || x.tipo === "bye de un punto",
      }[c.codigo];
      const cuentan = rondasDe(id).filter(filtro);
      if (!cuentan.length) lista.append(el("li", null, "Ninguna ronda cuenta."));
      for (const x of cuentan) lista.append(el("li", null, lineaRonda(x)));
    } else if (/^(ARO|TPR|PTP)/.test(c.codigo)) {
      const elos = rondasDe(id).filter((x) => x.rival && !x.sinJugar).map((x) => nombreDe(x.rival) + ": " + ((estado.torneo.jugadores.find((j) => j.id === x.rival) || {}).elo || "sin Elo"));
      for (const e of elos) lista.append(el("li", null, e));
    } else if (/^PS/.test(c.codigo)) {
      let acum = 0;
      for (const x of rondasDe(id)) { acum += x.puntos || 0; lista.append(el("li", null, "Después de la ronda " + x.ronda + ": " + n(acum))); }
    }
    if (lista.children.length) caja.append(lista);
    return caja;
  }

  function explicar(id, mover) {
    const caja = $("rd-detalle");
    caja.hidden = false;
    $("rd-detalle-t").textContent = nombreDe(id) + " (puesto " + id + ")";
    const cuerpo = $("rd-detalle-cuerpo");
    cuerpo.replaceChildren(...estado.criterios.map((c) => detalle(c, id)));
    for (const b of document.querySelectorAll(".rd-explicar")) b.setAttribute("aria-pressed", b.dataset.id === id ? "true" : "false");
    if (mover) { $("rd-detalle-t").focus(); caja.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  // Por qué A quedó delante de B: criterio por criterio, hasta el que los separa.
  function comparar() {
    const a = $("rd-a").value, b = $("rd-b").value;
    const out = $("rd-comparacion");
    out.replaceChildren();
    if (!a || !b || a === b) { out.append(el("p", null, "Elige dos jugadores distintos.")); return; }
    const lista = el("ol", "rd-pasos");
    let decide = null;
    for (const c of estado.criterios) {
      const va = c.sinCalculo ? c.publicados[a] : c.calculado[a], vb = c.sinCalculo ? c.publicados[b] : c.calculado[b];
      const iguales = va != null && vb != null && Math.abs(va - vb) < 0.006;
      const li = el("li", iguales ? null : "rd-decide");
      li.append(el("strong", null, c.nombre + ": "), document.createTextNode(n(va) + " contra " + n(vb) + (iguales ? " — empatan." : "")));
      lista.append(li);
      if (!iguales) {
        const delante = va > vb ? a : b;
        decide = { c, delante };
        li.append(document.createTextNode(" — lo decide: queda delante " + nombreDe(delante) + "."));
        break;
      }
    }
    out.append(el("p", null, nombreDe(a) + " (puesto " + a + ") y " + nombreDe(b) + " (puesto " + b + "):"), lista);
    if (!decide) out.append(el("p", "rd-distinto", "Empatan en todos los desempates del torneo: según el reglamento, lo decide un desempate rápido o un sorteo."));
    else if (Number(decide.delante) > Number(a === decide.delante ? b : a)) {
      out.append(el("p", "rd-distinto", "Ojo: con este cálculo debería ir delante " + nombreDe(decide.delante) + ", pero en chess-results va detrás. Mira la explicación de «" + decide.c.nombre + "» de los dos."));
    }
  }

  // ---------- Cargar ----------

  async function cargar(url, guardar) {
    const boton = $("rd-leer");
    const aviso = $("rd-estado");
    boton.disabled = true;
    aviso.classList.remove("rd-distinto");
    aviso.textContent = "Leyendo el torneo en chess-results…";
    $("rd-resultado").hidden = true;
    try {
      const cuadro = CR.leerCuadro(await traer(url, 4));
      if (!cuadro || !cuadro.jugadores.length) throw new Error("Esa página no trae un cuadro cruzado de un torneo individual. Los torneos por equipos todavía no se explican aquí.");
      let rondas = null;
      if (cuadro.sistema === "todos") rondas = CR.leerRondas(await traer(url, 2));
      const { torneo, avisos } = CR.aPareo(cuadro, rondas);
      if (!torneo.rondas.length) throw new Error("El torneo todavía no tiene ninguna ronda con resultados.");
      const puntos = Object.fromEntries(torneo.jugadores.map((j) => [j.id, PT.puntos(torneo, j.id)]));
      estado = { cuadro, torneo, avisos, puntos, url };
      estado.criterios = armarCriterios(cuadro);
      resumen();
      tabla();
      $("rd-detalle").hidden = true;
      $("rd-comparacion").replaceChildren();
      $("rd-resultado").hidden = false;
      aviso.textContent = "Listo: " + torneo.jugadores.length + " jugadores. Elige uno para ver de dónde sale cada número.";
      if (guardar) {
        const u = new URL(location.href);
        u.searchParams.set("t", url);
        history.replaceState(null, "", u);
      }
    } catch (e) {
      aviso.textContent = e.message || String(e);
      aviso.classList.add("rd-distinto");
    } finally {
      boton.disabled = false;
    }
  }

  function direccionValida(t) {
    try {
      const u = new URL(String(t).trim());
      return /^((s\d{1,2}|www)\.)?chess-results\.com$/i.test(u.hostname) && /^\/tnr\d{1,9}\.aspx$/i.test(u.pathname);
    } catch (e) { return false; }
  }

  $("rd-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const url = $("rd-url").value.trim();
    if (!direccionValida(url)) {
      $("rd-estado").textContent = "Pega la dirección de un torneo de chess-results, por ejemplo https://s3.chess-results.com/tnr1163393.aspx";
      $("rd-estado").classList.add("rd-distinto");
      $("rd-url").focus();
      return;
    }
    cargar(url, true);
  });
  $("rd-comparar").addEventListener("click", comparar);

  const pedida = new URL(location.href).searchParams.get("t");
  if (pedida && direccionValida(pedida)) {
    $("rd-url").value = pedida;
    cargar(pedida, false);
  }
})();
