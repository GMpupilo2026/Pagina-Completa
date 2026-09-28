/* Preparación de rivales: pintar el análisis.
 *
 * Recibe el resultado de PreparacionAnalisis.analizar() y lo dibuja en un
 * contenedor de la página: cifras, FODA, qué jugarle, lo que dice Stockfish,
 * su repertorio, dónde rinde menos y más, y las tablas por ritmo, año y Elo.
 * Todo texto que viene del PGN (nombres, jugadas) va por textContent.
 *
 * Lee resultados de la versión 1 (antes de los filtros y del árbol por
 * posición) y de la 2: lo que la 1 no trae, no se pinta.
 */
(function () {
  "use strict";

  const A = window.PreparacionLineas;
  let opcionesActuales = {};

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function tarjeta(titulo, id) {
    const s = el("section", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6");
    const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white mb-3", titulo);
    if (id) { h.id = id; s.setAttribute("aria-labelledby", id); }
    s.appendChild(h);
    return s;
  }

  function nota(texto) { return el("p", "text-sm text-brand-500 dark:text-brand-300 mb-3", texto); }

  // Una tabla: columnas [{ titulo, num }], filas de celdas (texto o nodo).
  function tabla(leyenda, columnas, filas) {
    const caja = el("div", "overflow-x-auto");
    const t = el("table", "w-full text-sm");
    const cap = el("caption", "sr-only", leyenda);
    t.appendChild(cap);
    const thead = el("thead");
    const trh = el("tr", "text-left text-brand-450 dark:text-brand-350 border-b border-brand-100 dark:border-brand-800");
    columnas.forEach((c) => {
      const th = el("th", "py-2 pr-3 font-semibold" + (c.num ? " text-right" : ""), c.titulo);
      th.scope = "col";
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    t.appendChild(thead);
    const tb = el("tbody");
    filas.forEach((f) => {
      const tr = el("tr", "border-b border-brand-50 dark:border-brand-800 last:border-0");
      f.forEach((celda, i) => {
        const td = el("td", "py-2 pr-3 align-top" + (columnas[i].num ? " text-right tabular-nums whitespace-nowrap" : ""));
        if (celda instanceof Node) td.appendChild(celda); else td.textContent = celda == null ? "—" : String(celda);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    caja.appendChild(t);
    return caja;
  }

  function jugada(texto) { return el("span", "font-mono whitespace-nowrap", texto); }

  function fecha(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.slice(0, 10).split("-");
    return d + "/" + m + "/" + a;
  }

  function porcentajeDe(r) { return A.pct(r.puntos); }

  // Todo el análisis, en `c` (el contenedor de la página). `opciones.alBajarPgn`
  // recibe el lado ("conBlancas" / "conNegras") cuando se pide el plan en PGN.
  function pintarCuerpo(r, c, opciones) {
    opcionesActuales = opciones || {};
    c.textContent = "";
    c.appendChild(pintarCifras(r));
    c.appendChild(pintarFoda(r));
    c.appendChild(pintarPlanes(r));
    if (r.motor) c.appendChild(pintarMotor(r));
    if (r.masAlla) c.appendChild(pintarMasAlla(r));
    c.appendChild(pintarRepertorio(r));
    c.appendChild(pintarLineas(r));
    c.appendChild(pintarTablas(r));
  }

  function pintarCifras(r) {
    const s = el("div", "grid grid-cols-2 lg:grid-cols-4 gap-3");
    const cifra = (valor, texto) => {
      const d = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md px-4 py-3");
      d.appendChild(el("p", "text-2xl font-bold text-brand-800 dark:text-white tabular-nums", valor));
      d.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300", texto));
      return d;
    };
    s.appendChild(cifra(porcentajeDe(r.global), "puntuación global (" + r.global.g + " ganadas, " + r.global.t + " tablas, " + r.global.p + " perdidas)"));
    s.appendChild(cifra(porcentajeDe(r.porColor.w), "con blancas, en " + r.porColor.w.n + " partidas"));
    s.appendChild(cifra(porcentajeDe(r.porColor.b), "con negras, en " + r.porColor.b.n + " partidas"));
    s.appendChild(cifra(r.elo.reciente ? String(r.elo.reciente) : "—", "Elo reciente (mediana de sus últimas 50)"));
    return s;
  }

  function pintarFoda(r) {
    const s = tarjeta("Análisis FODA, visto desde quien quiere ganarle", "foda-titulo");
    s.appendChild(nota("Los porcentajes son la puntuación del rival: ganadas más la mitad de las tablas. Una línea es fuerte o débil cuando se aparta de su promedio con ese color más de lo que explicaría el azar."));
    const grilla = el("div", "grid md:grid-cols-2 gap-4");
    const cuadros = [
      ["Fortalezas", r.foda.fortalezas, "border-green-600 dark:border-green-400"],
      ["Debilidades", r.foda.debilidades, "border-red-600 dark:border-red-400"],
      ["Oportunidades", r.foda.oportunidades, "border-accent-500"],
      ["Amenazas (lo que tienes que evitar)", r.foda.amenazas, "border-brand-500 dark:border-brand-300"],
    ];
    for (const [titulo, items, borde] of cuadros) {
      const d = el("div", "rounded-xl border-t-4 " + borde + " bg-brand-50 dark:bg-brand-950 p-4 min-w-0");
      d.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", titulo));
      if (!items.length) d.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "Con estas partidas no aparece nada claro."));
      else {
        const ul = el("ul", "list-disc pl-5 space-y-2 text-sm text-brand-700 dark:text-brand-200");
        items.forEach((t) => ul.appendChild(el("li", "", t)));
        d.appendChild(ul);
      }
      grilla.appendChild(d);
    }
    s.appendChild(grilla);
    return s;
  }

  // El plan como lista: «Juega 1.e4» / «Si él juega 1…e5». Una línea sin
  // ramas va toda al mismo nivel; solo se entra un nivel cuando él tiene
  // varias respuestas. Con una sangría por jugada, en el celular la décima
  // jugada quedaba en una columna de tres palabras.
  function renglonPlan(x, ply) {
    const li = el("li", "text-sm");
    const texto = el("p", "text-brand-700 dark:text-brand-200");
    const num = Math.floor(ply / 2) + 1;
    const san = (ply % 2 === 0 ? num + "." : num + "…") + A.sanEs(x.san);
    if (x.quien === "tu") {
      texto.appendChild(el("strong", "text-brand-800 dark:text-white", "Juega "));
      texto.appendChild(jugada(san));
    } else {
      texto.appendChild(document.createTextNode("Si él juega "));
      texto.appendChild(jugada(san));
      texto.appendChild(document.createTextNode(" (" + Math.round(100 * x.reparto) + " % de las veces)"));
    }
    texto.appendChild(el("span", "text-brand-450 dark:text-brand-350", " · él saca " + A.pct(x.puntos) + " en " + x.n + (x.n === 1 ? " partida" : " partidas")));
    li.appendChild(texto);
    return li;
  }

  function listaPlan(nodos, ply) {
    const ul = el("ul", ply === 0 ? (nodos.length > 1 ? "space-y-5" : "space-y-1.5") : "mt-2 ml-2 pl-3 border-l-2 border-brand-100 dark:border-brand-800 space-y-3");
    for (const x of nodos) {
      // Cada rama es su propio bloque; adentro, la línea corre sin sangría.
      const rama = nodos.length > 1 ? el("li") : null;
      const destino = rama ? el("ul", "space-y-1.5") : ul;
      let actual = x, p = ply, ultimo = null;
      for (;;) {
        ultimo = renglonPlan(actual, p);
        destino.appendChild(ultimo);
        if (!actual.hijos || actual.hijos.length !== 1) break;
        actual = actual.hijos[0];
        p += 1;
      }
      if (actual.hijos && actual.hijos.length > 1) ultimo.appendChild(listaPlan(actual.hijos, p + 1));
      if (rama) { rama.appendChild(destino); ul.appendChild(rama); }
    }
    return ul;
  }

  function pintarPlanes(r) {
    const s = tarjeta("Qué jugarle", "planes-titulo");
    s.appendChild(nota("Donde te toca, la jugada con la que él saca menos (con al menos " + r.minimo + " partidas). Donde le toca a él, sus respuestas más jugadas, cada una con la tuya. Antes de jugarla, mira la revisión de Stockfish: una jugada puede tener buenos números porque él no la supo castigar."));
    const grilla = el("div", "grid lg:grid-cols-2 gap-6");

    const b = el("div", "min-w-0");
    b.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "Con blancas (él lleva negras)"));
    if (r.conBlancas.primeras.length) {
      b.appendChild(tabla("Tu primera jugada con blancas y cuánto saca él", [{ titulo: "Tu primera jugada" }, { titulo: "Partidas", num: true }, { titulo: "Él saca", num: true }],
        r.conBlancas.primeras.map((x) => [jugada("1." + A.sanEs(x.san)), x.n, A.pct(x.puntos)])));
    }
    if (r.conBlancas.plan.length) {
      b.appendChild(el("p", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mt-4 mb-2", "El plan"));
      b.appendChild(listaPlan(r.conBlancas.plan, 0));
      b.appendChild(botonPgn("conBlancas", "Bajar el plan con blancas (PGN)"));
    } else {
      b.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "No hay suficientes partidas suyas con negras para recomendar algo."));
    }
    grilla.appendChild(b);

    const n = el("div", "min-w-0");
    n.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "Con negras (él lleva blancas)"));
    if (r.conNegras.contra.length) {
      const filas = [];
      r.conNegras.contra.forEach((x) => {
        const mejor = x.respuestas[0];
        filas.push([jugada("1." + A.sanEs(x.san)), Math.round(100 * x.reparto) + " %",
          mejor ? jugada("1…" + A.sanEs(mejor.san)) : "Sin datos", mejor ? A.pct(mejor.puntos) + " (" + mejor.n + ")" : "—"]);
      });
      n.appendChild(tabla("Contra cada primera jugada suya, la respuesta con la que él saca menos",
        [{ titulo: "Si abre" }, { titulo: "Lo juega", num: true }, { titulo: "Tu respuesta" }, { titulo: "Él saca", num: true }], filas));
    }
    if (r.conNegras.plan.length) {
      n.appendChild(el("p", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mt-4 mb-2", "El plan"));
      n.appendChild(listaPlan(r.conNegras.plan, 0));
      n.appendChild(botonPgn("conNegras", "Bajar el plan con negras (PGN)"));
    } else {
      n.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "No hay suficientes partidas suyas con blancas para recomendar algo."));
    }
    grilla.appendChild(n);
    s.appendChild(grilla);
    return s;
  }

  function pintarMotor(r) {
    const m = r.motor;
    const s = tarjeta("Lo que dice Stockfish", "motor-titulo");
    s.appendChild(nota("Evaluación en peones desde el lado de las blancas: + es ventaja blanca, − ventaja negra. " + m.detalle + "."));
    if (m.errores.length) {
      s.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "Errores que repite (prepárale la refutación)"));
      s.appendChild(tabla("Jugadas habituales del rival que Stockfish da como error",
        [{ titulo: "Después de" }, { titulo: "Él suele jugar" }, { titulo: "Partidas", num: true }, { titulo: "Mejor era" }, { titulo: "Evaluación", num: true }],
        m.errores.map((x) => [jugada(x.sec.length ? A.lineaEs(x.sec) : "el comienzo"), jugada(A.sanEs(x.jugada)), x.n, jugada(x.mejor ? A.sanEs(x.mejor) : "—"), A.textoEval(x.antes) + " → " + A.textoEval(x.despues)])));
    } else {
      s.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mb-3", "En sus líneas más jugadas no se encontró ningún error claro suyo: sus aperturas se sostienen."));
    }
    if (m.cuidado.length) {
      s.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mt-4 mb-2", "Recomendaciones con números buenos pero dudosas para el motor"));
      s.appendChild(tabla("Jugadas del plan que Stockfish da como error",
        [{ titulo: "Línea" }, { titulo: "Mejor" }, { titulo: "Evaluación", num: true }],
        m.cuidado.map((x) => [jugada(A.lineaEs(x.sec.concat(x.jugada))), jugada(x.mejor ? A.sanEs(x.mejor) : "—"), A.textoEval(x.antes) + " → " + A.textoEval(x.despues)])));
    }
    const det = el("details", "mt-4");
    const sum = el("summary", "cursor-pointer text-sm font-semibold text-brand-600 dark:text-brand-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Todas las posiciones revisadas (" + m.lineas.length + ")");
    det.appendChild(sum);
    det.appendChild(tabla("Todas las jugadas revisadas con Stockfish",
      [{ titulo: "Línea" }, { titulo: "Quién" }, { titulo: "Evaluación", num: true }],
      m.lineas.map((x) => [jugada(A.lineaEs(x.sec.concat(x.jugada))), x.quien === "tu" ? "Tú" : "Él", A.textoEval(x.despues)])));
    s.appendChild(det);
    return s;
  }

  // Etapa 2: cómo termina, cuándo pierde, el reloj y los finales.
  function pintarMasAlla(r) {
    const m = r.masAlla;
    const FIN = window.PreparacionAnalisis.FIN_ES;
    const pc = (x) => Math.round(100 * x) + " %";
    const s = tarjeta("Más allá de la apertura", "masalla-titulo");
    const grilla = el("div", "grid lg:grid-cols-2 gap-6");

    const termina = el("div", "min-w-0");
    termina.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "Cómo terminan sus partidas"));
    const filas = (xs, total) => xs.map((x) => [FIN[x.fin] || x.fin, x.n, pc(x.n / Math.max(total, 1))]);
    termina.appendChild(el("p", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Sus derrotas (" + m.perdidas + ")"));
    termina.appendChild(m.derrotas.length ? tabla("Cómo terminan sus derrotas", [{ titulo: "Pierde" }, { titulo: "Partidas", num: true }, { titulo: "Parte", num: true }], filas(m.derrotas, m.perdidas))
      : el("p", "text-sm text-brand-500 dark:text-brand-300", "No tiene derrotas en estas partidas."));
    termina.appendChild(el("p", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mt-4 mb-1", "Sus victorias (" + m.ganadas + ")"));
    termina.appendChild(m.victorias.length ? tabla("Cómo terminan sus victorias", [{ titulo: "Gana" }, { titulo: "Partidas", num: true }, { titulo: "Parte", num: true }], filas(m.victorias, m.ganadas))
      : el("p", "text-sm text-brand-500 dark:text-brand-300", "No tiene victorias en estas partidas."));
    if (m.perdidas) {
      termina.appendChild(el("p", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mt-4 mb-1", "Cuándo pierde"));
      termina.appendChild(tabla("En qué momento de la partida pierde", [{ titulo: "Momento" }, { titulo: "Derrotas", num: true }, { titulo: "Parte", num: true }], [
        ["En la apertura (hasta la jugada 20)", m.fases.apertura, pc(m.fases.apertura / m.perdidas)],
        ["En el medio juego", m.fases.medio, pc(m.fases.medio / m.perdidas)],
        ["En el final", m.fases.final, pc(m.fases.final / m.perdidas)],
      ]));
    }
    grilla.appendChild(termina);

    const derecha = el("div", "min-w-0");
    derecha.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "El reloj"));
    if (m.reloj) {
      const x = m.reloj;
      derecha.appendChild(tabla("Cómo usa el tiempo", [{ titulo: "Dato" }, { titulo: "Él", num: true }, { titulo: "Sus rivales", num: true }], [
        ["Le queda en la jugada 20", x.queda20 == null ? "—" : pc(x.queda20), x.rivales20 == null ? "—" : pc(x.rivales20)],
        ["Le queda en la jugada 40", x.queda40 == null ? "—" : pc(x.queda40), "—"],
        ["Gasta en las primeras 15 jugadas", x.apertura == null ? "—" : pc(x.apertura), x.aperturaRivales == null ? "—" : pc(x.aperturaRivales)],
        ["Partidas en que se queda con menos del 10 % del reloj", pc(x.apuros), "—"],
      ]));
      derecha.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-2", "Sobre " + x.partidas + " partidas con reloj, en proporción del tiempo inicial de cada una (medianas)."));
    } else {
      derecha.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "Estas partidas no traen los relojes. Los PGN de Lichess y Chess.com sí los traen: bájalas con su usuario."));
    }
    derecha.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mt-5 mb-2", "Sus finales"));
    derecha.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mb-2", "Llega a un final en el " + pc(m.llegaFinal) + " de sus partidas. Su promedio general es " + A.pct(m.base) + "."));
    if (m.finales.length) {
      derecha.appendChild(tabla("Cuánto saca en cada tipo de final", [{ titulo: "Final" }, { titulo: "Partidas", num: true }, { titulo: "Saca", num: true }],
        m.finales.map((f) => ["Final " + f.tipo, f.n, A.pct(f.puntos)])));
      const v = m.conversion.ventaja, d = m.conversion.desventaja;
      const partes = [];
      if (v.n) partes.push("Con ventaja de material (2 puntos o más) llegó a " + v.n + (v.n === 1 ? " final" : " finales") + " y ganó " + v.ganadas + ".");
      if (d.n) partes.push("Con desventaja llegó a " + d.n + " y salvó " + d.salvadas + ".");
      if (partes.length) derecha.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mt-3", partes.join(" ")));
    }
    grilla.appendChild(derecha);
    s.appendChild(grilla);
    return s;
  }

  function pintarRepertorio(r) {
    const s = tarjeta("Su repertorio", "repertorio-titulo");
    const grilla = el("div", "grid lg:grid-cols-2 gap-6");
    const b = el("div", "min-w-0");
    b.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "Con blancas, abre con…"));
    b.appendChild(tabla("Primeras jugadas del rival con blancas", [{ titulo: "Jugada" }, { titulo: "Lo juega", num: true }, { titulo: "Partidas", num: true }, { titulo: "Saca", num: true }],
      r.repertorio.blancas.map((x) => [jugada("1." + A.sanEs(x.san)), Math.round(100 * x.reparto) + " %", x.n, A.pct(x.puntos)])));
    if (r.principal.w.sec.length >= 2) b.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mt-3", "Su línea más repetida: " + A.lineaEs(r.principal.w.sec) + " (" + r.principal.w.n + " partidas)."));
    grilla.appendChild(b);
    const n = el("div", "min-w-0");
    n.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "Con negras, contesta…"));
    const filas = [];
    r.repertorio.negras.forEach((x) => x.respuestas.forEach((y, i) => {
      filas.push([i === 0 ? jugada("1." + A.sanEs(x.contra)) : "", jugada("1…" + A.sanEs(y.san)), Math.round(100 * y.reparto) + " %", y.n, A.pct(y.puntos)]);
    }));
    n.appendChild(tabla("Respuestas del rival con negras a cada primera jugada", [{ titulo: "Contra" }, { titulo: "Responde" }, { titulo: "Lo juega", num: true }, { titulo: "Partidas", num: true }, { titulo: "Saca", num: true }], filas));
    if (r.principal.b.sec.length >= 2) n.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mt-3", "Su línea más repetida: " + A.lineaEs(r.principal.b.sec) + " (" + r.principal.b.n + " partidas)."));
    grilla.appendChild(n);
    s.appendChild(grilla);
    return s;
  }

  function pintarLineas(r) {
    const s = tarjeta("Dónde rinde menos y dónde más", "lineas-titulo");
    const cols = [{ titulo: "Color" }, { titulo: "Línea" }, { titulo: "Partidas", num: true }, { titulo: "Saca", num: true }, { titulo: "Su promedio", num: true }];
    const fila = (x) => [x.color === "w" ? "Blancas" : "Negras", jugada(A.lineaEs(x.sec)), x.n, A.pct(x.puntos), A.pct(x.base)];
    s.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "Donde rinde menos"));
    s.appendChild(r.debiles.length ? tabla("Líneas donde el rival rinde menos que su promedio", cols, r.debiles.map(fila))
      : el("p", "text-sm text-brand-500 dark:text-brand-300", "Ninguna línea queda claramente por debajo de su promedio."));
    s.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mt-5 mb-2", "Donde rinde más"));
    s.appendChild(r.fuertes.length ? tabla("Líneas donde el rival rinde más que su promedio", cols, r.fuertes.map(fila))
      : el("p", "text-sm text-brand-500 dark:text-brand-300", "Ninguna línea queda claramente por encima de su promedio."));
    return s;
  }

  function pintarTablas(r) {
    const s = tarjeta("Por ritmo, por año y por Elo", "tablas-titulo");
    const grilla = el("div", "grid lg:grid-cols-3 gap-6");
    const col = [{ titulo: "Partidas", num: true }, { titulo: "Saca", num: true }];
    const bloque = (titulo, filas, primera) => {
      const d = el("div", "min-w-0");
      d.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", titulo));
      d.appendChild(filas.length ? tabla(titulo, [{ titulo: primera }].concat(col), filas) : el("p", "text-sm text-brand-500 dark:text-brand-300", "Sin datos en el archivo."));
      return d;
    };
    grilla.appendChild(bloque("Por ritmo", r.porRitmo.map((x) => [x.ritmo, x.n, A.pct(x.puntos)]), "Ritmo"));
    grilla.appendChild(bloque("Por año", r.porAnio.map((x) => [x.anio, x.n, A.pct(x.puntos)]), "Año"));
    grilla.appendChild(bloque("Según el Elo del oponente", r.porElo.map((x) => [x.tramo, x.n, A.pct(x.puntos)]), "Oponente"));
    s.appendChild(grilla);
    const d = r.duracion;
    if (d.ganadas || d.perdidas) {
      s.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mt-4",
        "Sus victorias duran en promedio " + (d.ganadas || "—") + " jugadas y sus derrotas " + (d.perdidas || "—") + "." +
        (d.perdidasConJugadas ? " " + d.perdidasCortas + " de " + d.perdidasConJugadas + " derrotas terminan antes de la jugada 25." : "")));
    }
    return s;
  }

  function botonPgn(lado, texto) {
    const b = el("button", "mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto);
    b.type = "button";
    b.dataset.pgn = lado;
    b.addEventListener("click", () => { if (opcionesActuales.alBajarPgn) opcionesActuales.alBajarPgn(lado); });
    return b;
  }

  window.PreparacionPintar = { cuerpo: pintarCuerpo, el, tabla, jugada, fecha };
})();
