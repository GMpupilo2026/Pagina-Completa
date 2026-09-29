/* Preparación de rivales: pintar el análisis.
 *
 * Recibe el resultado de PreparacionAnalisis.analizar() y lo dibuja en un
 * contenedor de la página. Primero la respuesta: qué hacer y qué no hacer
 * contra él (js/preparacion-resumen.js). Después el detalle, de lo más útil
 * para jugarle a lo más general: cifras, qué jugarle jugada por jugada, el
 * cruce con el alumno, Stockfish, la teoría, el FODA, más allá de la
 * apertura, su repertorio, dónde rinde menos y más, y las tablas.
 * Todo texto que viene del PGN (nombres, jugadas) va por textContent.
 *
 * Lee resultados de todas las versiones: la 1 (antes de los filtros y del
 * árbol por posición), la 2, la 3 (sin las líneas para la teoría) y la 4. Lo
 * que una versión no trae, no se pinta.
 */
(function () {
  "use strict";

  const A = window.PreparacionLineas;
  const R = () => window.PreparacionResumen;
  let opcionesActuales = {};
  let nombreAlumno = "";   // con cruce: el plan dice cuántas veces jugó él cada jugada

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
    nombreAlumno = (r.cruce && r.cruce.alumno) || "";
    c.textContent = "";
    if (R()) c.appendChild(pintarResumen(r));
    c.appendChild(pintarCifras(r));
    c.appendChild(pintarPlanes(r));
    if (r.cruce) c.appendChild(pintarCruce(r));
    if (r.motor) c.appendChild(pintarMotor(r));
    if (r.teoria) c.appendChild(pintarTeoria(r));
    c.appendChild(pintarFoda(r));
    if (r.tactica && window.PreparacionTactica) c.appendChild(pintarTactica(r));
    if (r.masAlla) c.appendChild(pintarMasAlla(r));
    c.appendChild(pintarRepertorio(r));
    c.appendChild(pintarLineas(r));
    c.appendChild(pintarTablas(r));
  }

  /* Qué hacer y qué no hacer contra él: lo primero que se ve. Órdenes
     cortas, cada una con el dato que la justifica debajo y, si es una
     posición, «Ver» para abrirla en el tablero. Haz y No hagas se distinguen
     por el título escrito, no solo por el color del borde. */
  function pintarResumen(r) {
    const res = R().armar(r);
    const s = tarjeta("Qué hacer contra él", "resumen-titulo");
    s.classList.add("ring-2", "ring-accent-400");
    s.appendChild(nota("Lo esencial del análisis. Cada consejo trae el dato que lo justifica; el detalle está en las tarjetas de abajo."));
    if (opcionesActuales.alImprimir) {
      const b = el("button", "mb-3 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Hoja para imprimir (o guardar en PDF)");
      b.type = "button";
      b.id = "imprimir-hoja";
      b.addEventListener("click", () => opcionesActuales.alImprimir(b));
      s.appendChild(b);
    }
    // El ritmo de la partida que viene: si el análisis se filtró a él, o si
    // hay muy pocas partidas a ese ritmo para filtrar.
    if (res.ritmo) {
      const p = el("p", "text-sm mb-3 " + (res.ritmo.aviso ? "font-semibold text-accent-700 dark:text-accent-400" : "text-brand-700 dark:text-brand-100"), res.ritmo.texto);
      p.dataset.ritmo = res.ritmo.aviso ? "aviso" : "filtrado";
      s.appendChild(p);
    }
    const leer = el("details", "mb-4");
    leer.appendChild(el("summary", "cursor-pointer text-sm font-semibold text-brand-600 dark:text-brand-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Cómo leer los porcentajes"));
    leer.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mt-2", "«Él saca 24 %» quiere decir que en esas partidas el rival sumó 24 de cada 100 puntos posibles (1 por ganada, ½ por tablas). Menos de 45 %: le cuesta, y esa línea te conviene. Más de 55 %: le va bien, y conviene evitarla. Entre las dos, parejo."));
    s.appendChild(leer);
    // Lo que todavía corre (Stockfish, la teoría) lo dice la página, que
    // sabe si está corriendo: un análisis sin motor puede no tenerlo nunca.
    const pend = el("p", "text-sm text-accent-700 dark:text-accent-400 mb-4");
    pend.dataset.pendiente = "";
    s.appendChild(pend);
    ponerPendiente(pend, opcionesActuales.pendiente || []);
    const grilla = el("div", "grid lg:grid-cols-2 gap-6");
    res.lados.forEach((l) => {
      const d = el("div", "min-w-0");
      d.dataset.lado = l.clave;
      d.appendChild(el("h4", "font-bold text-lg text-brand-800 dark:text-white mb-2", l.titulo));
      (l.avisos || []).forEach((x) => d.appendChild(avisoReciente(x)));
      if (!l.lineas.length) {
        d.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300 mb-3", "No hay suficientes partidas suyas con " + (l.clave === "conBlancas" ? "negras" : "blancas") + " para recomendar una línea."));
      }
      l.lineas.forEach((x) => {
        const caja = el("div", "rounded-xl bg-brand-50 dark:bg-brand-950 p-3 mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2");
        caja.dataset.linea = x.sec.join(" ");
        const t = el("div", "min-w-0 flex-1");
        // Sin mayúsculas: «1.E4» no es una jugada.
        t.appendChild(el("p", "text-sm font-semibold text-brand-700 dark:text-brand-100", x.titulo));
        t.appendChild(el("p", "font-mono text-sm text-brand-800 dark:text-white break-words", A.lineaEs(x.sec)));
        t.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200", "En esta línea " + x.texto));
        if (x.aviso) t.appendChild(el("p", "text-sm text-accent-700 dark:text-accent-400", x.aviso));
        if (x.general) {
          const g = el("p", "text-sm text-brand-600 dark:text-brand-200 mt-1");
          g.dataset.general = "";
          g.textContent = x.general;
          t.appendChild(g);
        }
        if (x.alumno) {
          const a = el("p", "text-sm font-semibold text-brand-700 dark:text-brand-100 mt-1");
          a.dataset.alumno = "";
          a.textContent = x.alumno;
          t.appendChild(a);
        }
        const der = derrotasAqui(x.derrotas);
        if (der) t.appendChild(der);
        caja.appendChild(t);
        if (opcionesActuales.alVerSecuencia) caja.appendChild(botonVer(x.sec, "Ver en el tablero: " + A.lineaEs(x.sec), x.titulo + ": en esta línea " + x.texto));
        d.appendChild(caja);
      });
      d.appendChild(listaConsejos("Haz esto", "✅", l.haz, "haz", "Con estas partidas no aparece nada más que buscar."));
      d.appendChild(listaConsejos("No hagas esto", "⛔", l.evita, "evita", "Con estas partidas no aparece nada claro que evitar."));
      grilla.appendChild(d);
    });
    s.appendChild(grilla);
    const g = res.general;
    if (g.haz.length || g.evita.length || (g.avisos && g.avisos.length)) {
      const d = el("div", "mt-6");
      d.dataset.lado = "general";
      d.appendChild(el("h4", "font-bold text-lg text-brand-800 dark:text-white mb-2", "En toda la partida"));
      (g.avisos || []).forEach((x) => d.appendChild(avisoReciente(x)));
      const dos = el("div", "grid lg:grid-cols-2 gap-6");
      if (g.haz.length) dos.appendChild(listaConsejos("Haz esto", "✅", g.haz, "haz"));
      if (g.evita.length) dos.appendChild(listaConsejos("No hagas esto", "⛔", g.evita, "evita"));
      d.appendChild(dos);
      s.appendChild(d);
    }
    return s;
  }

  // Un aviso de su forma reciente (cambió de repertorio, viene en racha).
  function avisoReciente(x) {
    const d = el("div", "rounded-xl border-2 border-accent-400 p-3 mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2");
    d.dataset.reciente = "";
    const t = el("div", "min-w-0 flex-1");
    t.appendChild(el("p", "text-sm font-semibold text-brand-800 dark:text-white", x.texto));
    if (x.porque) t.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200", x.porque));
    d.appendChild(t);
    if (x.sec && opcionesActuales.alVerSecuencia) d.appendChild(botonVer(x.sec, "Ver en el tablero: " + A.lineaEs(x.sec), x.texto));
    return d;
  }

  /* La hoja para imprimir: una página con lo esencial, para llevar a la
     partida o mirar en el celular antes de sentarse (guardada en PDF). Sale
     del mismo resumen: la línea de cada color, tres cosas que hacer y tres
     que no, lo de toda la partida, y los avisos de su forma reciente. Sin
     botones ni plegables: en papel no se tocan. */
  function pintarHoja(r) {
    const res = R().armar(r);
    const h = el("div", "hoja");
    h.appendChild(el("h1", "hoja-titulo", "Contra " + r.rival));
    const sub = [r.total + " partidas"];
    if (r.fechas && r.fechas.desde) sub.push("del " + fecha(r.fechas.desde) + " al " + fecha(r.fechas.hasta));
    if (r.filtros && r.filtros.partida) sub.push("partida a " + r.filtros.partida);
    if (r.cruce && r.cruce.alumno) sub.push("para " + r.cruce.alumno);
    h.appendChild(el("p", "hoja-sub", sub.join(" · ")));
    if (res.ritmo && res.ritmo.aviso) h.appendChild(el("p", "hoja-aviso", res.ritmo.texto));
    const lista = (titulo, items, max) => {
      if (!items.length) return null;
      const d = el("div", "hoja-bloque");
      d.appendChild(el("h3", "", titulo));
      const ul = el("ul");
      items.slice(0, max).forEach((x) => ul.appendChild(el("li", "", x.texto)));
      d.appendChild(ul);
      return d;
    };
    const cols = el("div", "hoja-columnas");
    res.lados.forEach((l) => {
      const d = el("section", "hoja-lado");
      d.appendChild(el("h2", "", l.titulo));
      (l.avisos || []).forEach((x) => d.appendChild(el("p", "hoja-aviso", x.texto)));
      l.lineas.forEach((x) => {
        d.appendChild(el("p", "hoja-linea-titulo", x.titulo));
        d.appendChild(el("p", "hoja-linea", A.lineaEs(x.sec)));
        d.appendChild(el("p", "hoja-dato", "En esta línea " + x.texto));
      });
      [lista("Haz esto", l.haz, 3), lista("No hagas esto", l.evita, 3)].forEach((b) => b && d.appendChild(b));
      cols.appendChild(d);
    });
    h.appendChild(cols);
    const g = res.general;
    if (g.haz.length || g.evita.length || g.avisos.length) {
      const d = el("section", "hoja-general");
      d.appendChild(el("h2", "", "En toda la partida"));
      g.avisos.forEach((x) => d.appendChild(el("p", "hoja-aviso", x.texto + " " + x.porque)));
      [lista("Haz esto", g.haz, 4), lista("No hagas esto", g.evita, 3)].forEach((b) => b && d.appendChild(b));
      h.appendChild(d);
    }
    h.appendChild(el("p", "hoja-pie", "Ajedrez Integral · Preparación de rivales · " + fecha(new Date().toISOString())));
    return h;
  }

  function ponerPendiente(p, lista) {
    p.textContent = lista.length ? "Todavía falta " + lista.join(" y ") + ". Este resumen se completa solo cuando termine." : "";
    p.hidden = !lista.length;
  }

  // La página avisa que empezó algo sin volver a pintar todo.
  function pendiente(c, lista) {
    const p = c.querySelector("[data-pendiente]");
    if (p) ponerPendiente(p, lista);
  }

  /* Cómo le ganaron por esa línea: las partidas reales que perdió, con el
     enlace para verlas enteras (el análisis solo guarda enlaces https de
     Lichess o Chess.com). Plegado: es para quien quiere estudiar el cómo. */
  function derrotasAqui(d) {
    if (!d || !d.n) return null;
    const det = el("details", "mt-1");
    det.dataset.derrotas = String(d.n);
    det.appendChild(el("summary", "cursor-pointer text-sm font-semibold text-brand-600 dark:text-brand-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
      "Cómo le ganaron aquí (" + d.n + (d.n === 1 ? " partida" : " partidas") + ")"));
    const FIN = window.PreparacionAnalisis ? window.PreparacionAnalisis.FIN_ES : {};
    const ul = el("ul", "mt-1 space-y-1 text-sm text-brand-600 dark:text-brand-200");
    d.lista.forEach((x) => {
      const li = el("li");
      const partes = [];
      if (x.fecha) partes.push(fecha(x.fecha));
      if (x.oponente) partes.push("contra " + x.oponente + (x.elo ? " (" + x.elo + ")" : ""));
      partes.push("perdió " + (FIN[x.fin] || "") + " en " + Math.ceil(x.jugadas / 2) + " jugadas");
      li.appendChild(document.createTextNode(partes.join(" · ").replace(/perdió +en/, "perdió en")));
      if (x.enlace) {
        const a = el("a", "ml-2 font-semibold underline text-brand-700 dark:text-brand-100 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Ver la partida ↗");
        a.href = x.enlace;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute("aria-label", "Ver la partida" + (x.oponente ? " contra " + x.oponente : "") + " (se abre en otra pestaña)");
        li.appendChild(a);
      }
      ul.appendChild(li);
    });
    if (d.n > d.lista.length) ul.appendChild(el("li", "text-brand-450 dark:text-brand-350", "Y " + (d.n - d.lista.length) + " más: aquí van las más recientes."));
    det.appendChild(ul);
    return det;
  }

  // A practicar ese tema en Entrenamiento (entreno/temas.html).
  function enlacePractica(clave, tema) {
    const T = window.PreparacionTactica;
    const nombre = T && T.TEMAS[tema] ? T.TEMAS[tema].plural : "este tema";
    const a = el("a", "inline-block mt-1 text-sm font-semibold underline text-brand-700 dark:text-brand-100 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Practicar " + nombre);
    a.href = "entreno/temas.html?tema=" + encodeURIComponent(clave);
    a.dataset.practica = clave;
    return a;
  }

  /* Su táctica (js/preparacion-tactica.js): con qué gana y con qué pierde,
     tema por tema, con cuántas partidas, ejemplos para ver en el tablero (en
     la jugada del patrón) y a qué practicar. */
  function pintarTactica(r) {
    const t = r.tactica, T = window.PreparacionTactica;
    const s = tarjeta("Su táctica: con qué gana y con qué pierde", "tactica-titulo");
    const dG = t.revisadas.ganadas - t.sinMaterial.ganadas, dP = t.revisadas.perdidas - t.sinMaterial.perdidas;
    const cuantas = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
    s.appendChild(nota("En sus " + cuantas(t.revisadas.ganadas, "victoria", "victorias") + " y " + cuantas(t.revisadas.perdidas, "derrota", "derrotas") + " más recientes se buscó el momento decisivo: la primera vez que un bando perdió 2 puntos de material o más sin recuperarlos, y la táctica que lo hizo. Es un conteo por patrón, sin motor: muestra tendencias. No entran las que se decidieron sin perder material (por tiempo, en lo posicional o por abandono): " + cuantas(t.sinMaterial.ganadas, "victoria", "victorias") + " y " + cuantas(t.sinMaterial.perdidas, "derrota", "derrotas") + "."));
    const grilla = el("div", "grid lg:grid-cols-2 gap-6");
    const columna = (titulo, lista, total, lado, vacio) => {
      const d = el("div", "min-w-0");
      d.dataset.tactica = lado;
      d.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", titulo));
      if (!lista.length) { d.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", vacio)); return d; }
      const ul = el("ul", "divide-y divide-brand-100 dark:divide-brand-800");
      lista.forEach((x) => {
        const tm = T.TEMAS[x.tema] || { nombre: x.tema };
        const li = el("li", "py-3");
        li.dataset.tema = x.tema;
        li.appendChild(el("p", "text-sm font-semibold text-brand-800 dark:text-white", tm.nombre + ": " + x.n + (x.n === 1 ? " partida" : " partidas") + " (" + Math.round(100 * x.n / Math.max(total, 1)) + " %)"));
        const fila = el("div", "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm");
        x.ejemplos.forEach((ej, i) => {
          if (opcionesActuales.alVerSecuencia) {
            const b = botonVer(ej.sec, "Ver en el tablero el ejemplo " + (i + 1) + " de " + tm.nombre.toLowerCase(), tm.nombre + ": la jugada que decide." + (ej.oponente ? " Contra " + ej.oponente + "." : ""), ej.ply);
            b.textContent = "Ver ejemplo " + (i + 1);
            fila.appendChild(b);
          }
          if (ej.enlace) {
            const a = el("a", "underline text-brand-700 dark:text-brand-100 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "partida " + (i + 1) + " ↗");
            a.href = ej.enlace; a.target = "_blank"; a.rel = "noopener noreferrer";
            a.setAttribute("aria-label", "Ver la partida del ejemplo " + (i + 1) + " (se abre en otra pestaña)");
            fila.appendChild(a);
          }
        });
        if (tm.practica) fila.appendChild(enlacePractica(tm.practica, x.tema));
        li.appendChild(fila);
        ul.appendChild(li);
      });
      d.appendChild(ul);
      return d;
    };
    grilla.appendChild(columna("Con qué gana él (cuídate de esto)", t.realiza, dG, "realiza", "En sus victorias no se ve una táctica que se repita."));
    grilla.appendChild(columna("Con qué pierde (búscalo)", t.sufre, dP, "sufre", "En sus derrotas no se ve una táctica que se repita."));
    s.appendChild(grilla);
    return s;
  }

  function listaConsejos(titulo, emoji, items, tipo, vacio) {
    const caja = el("div", "mb-4 min-w-0");
    caja.dataset.consejos = tipo;
    const h = el("h5", "font-semibold text-brand-800 dark:text-white mb-1 flex items-center gap-2");
    const ic = el("span", "", emoji);
    ic.setAttribute("aria-hidden", "true");
    h.append(ic, document.createTextNode(titulo));
    caja.appendChild(h);
    if (!items.length) {
      caja.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", vacio || ""));
      return caja;
    }
    const borde = tipo === "haz" ? "border-green-600 dark:border-green-400" : "border-red-600 dark:border-red-400";
    const ul = el("ul", "space-y-2");
    items.forEach((x) => {
      const li = el("li", "border-l-4 " + borde + " pl-3 py-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-1");
      const t = el("div", "min-w-0 flex-1");
      t.appendChild(el("p", "text-sm font-semibold text-brand-800 dark:text-white", x.texto));
      if (x.porque) t.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200", x.porque));
      if (x.practica) t.appendChild(enlacePractica(x.practica, x.tema));
      const der = derrotasAqui(x.derrotas);
      if (der) t.appendChild(der);
      li.appendChild(t);
      if (x.sec && opcionesActuales.alVerSecuencia) li.appendChild(botonVer(x.sec, "Ver en el tablero: " + A.lineaEs(x.sec), x.texto + " " + (x.porque || "")));
      ul.appendChild(li);
    });
    caja.appendChild(ul);
    return caja;
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
  // La jugada del plan es un botón: abre el tablero en esa posición, con la
  // continuación principal por delante.
  function jugadaQueAbre(san, camino) {
    if (!opcionesActuales.alVerLinea) return jugada(san);
    const b = el("button", "font-mono whitespace-nowrap underline decoration-dotted underline-offset-4 hover:text-accent-700 dark:hover:text-accent-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", san);
    b.type = "button";
    b.setAttribute("aria-label", san + ", ver en el tablero");
    b.addEventListener("click", () => opcionesActuales.alVerLinea(camino.slice(), b));
    return b;
  }

  // Las cifras de un renglón solo se escriben cuando cambian: en una línea
  // sin ramas, diez renglones seguidos decían «él saca 23,8 % en 21
  // partidas» y lo que importaba se perdía entre números iguales.
  function renglonPlan(x, ply, camino, anterior) {
    const li = el("li", "text-sm");
    const texto = el("p", "text-brand-700 dark:text-brand-200");
    const num = Math.floor(ply / 2) + 1;
    const san = (ply % 2 === 0 ? num + "." : num + "…") + A.sanEs(x.san);
    if (x.quien === "tu") {
      texto.appendChild(el("strong", "text-brand-800 dark:text-white", "Juega "));
      texto.appendChild(jugadaQueAbre(san, camino));
    } else {
      texto.appendChild(document.createTextNode("Si él juega "));
      texto.appendChild(jugadaQueAbre(san, camino));
      texto.appendChild(document.createTextNode(x.reparto >= 0.995 ? " (siempre)" : " (" + Math.round(100 * x.reparto) + " % de las veces)"));
    }
    if (!anterior || anterior.n !== x.n || anterior.puntos !== x.puntos) {
      const leVa = R() ? " (" + R().comoLeVa(x.puntos) + ")" : "";
      texto.appendChild(el("span", "text-brand-450 dark:text-brand-350", " · él saca " + A.pct(x.puntos) + leVa + " en " + x.n + (x.n === 1 ? " partida" : " partidas")));
    }
    // En el plan a la medida: si el alumno ya la juega, cuántas veces.
    if (x.quien === "tu" && x.alumno && nombreAlumno) {
      texto.appendChild(el("span", "text-brand-600 dark:text-brand-200", " · " + nombreAlumno + " la jugó " + x.alumno.n + (x.alumno.n === 1 ? " vez" : " veces")));
    }
    li.appendChild(texto);
    return li;
  }

  function listaPlan(nodos, ply, previo) {
    const antes = previo || [];
    const ul = el("ul", ply === 0 ? (nodos.length > 1 ? "space-y-5" : "space-y-1.5") : "mt-2 ml-2 pl-3 border-l-2 border-brand-100 dark:border-brand-800 space-y-3");
    for (const x of nodos) {
      // Cada rama es su propio bloque; adentro, la línea corre sin sangría.
      const rama = nodos.length > 1 ? el("li") : null;
      const destino = rama ? el("ul", "space-y-1.5") : ul;
      let actual = x, p = ply, ultimo = null, camino = antes.concat(x), previoNodo = null;
      for (;;) {
        ultimo = renglonPlan(actual, p, camino, previoNodo);
        previoNodo = actual;
        destino.appendChild(ultimo);
        if (!actual.hijos || actual.hijos.length !== 1) break;
        actual = actual.hijos[0];
        camino = camino.concat(actual);
        p += 1;
      }
      if (actual.hijos && actual.hijos.length > 1) ultimo.appendChild(listaPlan(actual.hijos, p + 1, camino));
      if (rama) { rama.appendChild(destino); ul.appendChild(rama); }
    }
    return ul;
  }

  /* El plan que vale (planDe): a la medida del alumno si hay cruce. Ese es
     el que se baja, se manda y se archiva; el general queda a mano, plegado,
     para comparar. */
  function bloquePlan(r, lado) {
    const d = el("div");
    d.dataset.plan = lado;
    const aMedida = A.esAMedida(r, lado);
    d.appendChild(el("p", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mt-4 mb-2", aMedida ? "El plan, a la medida de " + nombreAlumno : "El plan"));
    if (aMedida) d.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mb-2", "Donde las opciones se parecen, va con lo que " + nombreAlumno + " ya juega; una jugada claramente mejor contra él gana aunque sea nueva."));
    d.appendChild(listaPlan(A.planDe(r, lado), 0));
    const general = r[lado] && r[lado].plan;
    const lineas = (plan) => A.lineasDelPlan(plan).map((c) => c.map((x) => x.san).join(" ")).join("|");
    if (aMedida && general && general.length && lineas(general) !== lineas(A.planDe(r, lado))) {
      const det = el("details", "mt-3");
      det.dataset.planGeneral = lado;
      det.appendChild(el("summary", "cursor-pointer text-sm font-semibold text-brand-600 dark:text-brand-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "El plan general, sin mirar a " + nombreAlumno));
      const guardado = nombreAlumno;
      nombreAlumno = "";           // el general no dice cuántas veces la jugó el alumno
      det.appendChild(listaPlan(general, 0));
      nombreAlumno = guardado;
      d.appendChild(det);
    }
    return d;
  }

  function pintarPlanes(r) {
    const s = tarjeta("Qué jugarle, jugada por jugada", "planes-titulo");
    s.appendChild(nota("Donde te toca, la jugada con la que él saca menos (con al menos " + r.minimo + " partidas). Donde le toca a él, sus respuestas más jugadas, cada una con la tuya. Antes de jugarla, mira la revisión de Stockfish: una jugada puede tener buenos números porque él no la supo castigar."));
    const grilla = el("div", "grid lg:grid-cols-2 gap-6");

    const b = el("div", "min-w-0");
    b.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mb-2", "Con blancas (él lleva negras)"));
    if (r.conBlancas.primeras.length) {
      b.appendChild(tabla("Tu primera jugada con blancas y cuánto saca él", [{ titulo: "Tu primera jugada" }, { titulo: "Partidas", num: true }, { titulo: "Él saca", num: true }],
        r.conBlancas.primeras.map((x) => [jugada("1." + A.sanEs(x.san)), x.n, A.pct(x.puntos)])));
    }
    if (A.planDe(r, "conBlancas").length) {
      b.appendChild(bloquePlan(r, "conBlancas"));
      b.appendChild(accionesPlan("conBlancas", "con blancas"));
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
    if (A.planDe(r, "conNegras").length) {
      n.appendChild(bloquePlan(r, "conNegras"));
      n.appendChild(accionesPlan("conNegras", "con negras"));
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
        [{ titulo: "Después de" }, { titulo: "Él suele jugar" }, { titulo: "Partidas", num: true }, { titulo: "Mejor era" }, { titulo: "Evaluación", num: true }].concat(opcionesActuales.alVerSecuencia ? [{ titulo: "Tablero" }] : []),
        m.errores.map((x) => [jugada(x.sec.length ? A.lineaEs(x.sec) : "el comienzo"), jugada(A.sanEs(x.jugada)), x.n, jugada(x.mejor ? A.sanEs(x.mejor) : "—"), A.textoEval(x.antes) + " → " + A.textoEval(x.despues)]
          .concat(opcionesActuales.alVerSecuencia ? [botonVer(x.sec.concat(x.jugada), "Ver en el tablero: " + A.lineaEs(x.sec.concat(x.jugada)), "Su error: " + A.sanEs(x.jugada) + " (" + A.textoEval(x.antes) + " → " + A.textoEval(x.despues) + "). Lo mejor era " + (x.mejor ? A.sanEs(x.mejor) : "otra jugada") + ".")] : []))));
    } else {
      // Cuánto se buscó: «no hay errores» en 3 jugadas no es lo mismo que en 40.
      const suyas = m.lineas.filter((x) => x.quien === "rival").length;
      s.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mb-3", suyas
        ? "Se revisaron " + suyas + (suyas === 1 ? " jugada suya" : " jugadas suyas") + " de las que repite (en " + r.minimo + " partidas o más) y ninguna es un error claro: sus aperturas se sostienen. Para ganarle, más que una trampa, sirve llevarlo a donde rinde menos."
        : "En sus líneas más jugadas no se encontró ningún error claro suyo: sus aperturas se sostienen."));
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

  /* El cruce con las partidas del alumno (js/preparacion-cruce.js): por
     color, si ya juega el plan y dónde le conviene jugar lo suyo. Listas y no
     tablas, por el celular (lo mismo que «Dónde deja la teoría»). */
  function pintarCruce(r) {
    const c = r.cruce;
    const s = tarjeta("Tu alumno contra él: " + c.alumno, "cruce-titulo");
    s.appendChild(nota("Con " + c.total.toLocaleString("es-CR") + (c.total === 1 ? " partida" : " partidas") + " de " + c.alumno + " (una jugada cuenta desde " + c.minimo + "). «Él saca» es lo que consigue el rival; «tu alumno saca», lo que consigue el alumno en sus propias partidas."));
    const renglon = (sec, textos, ver) => {
      const li = el("li", "py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2");
      li.dataset.cruce = sec.join(" ");
      const d = el("div", "min-w-0 flex-1");
      d.appendChild(el("p", "font-mono text-sm text-brand-800 dark:text-white", A.lineaEs(sec)));
      textos.forEach((t) => d.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200", t)));
      li.appendChild(d);
      if (ver && opcionesActuales.alVerSecuencia) li.appendChild(botonVer(sec, "Ver en el tablero: " + A.lineaEs(sec), ver));
      return li;
    };
    const lista = (items) => { const ul = el("ul", "divide-y divide-brand-100 dark:divide-brand-800"); items.forEach((x) => ul.appendChild(x)); return ul; };
    const partidas = (n) => n + (n === 1 ? " partida" : " partidas");
    [["conBlancas", "Con blancas (tu alumno lleva blancas)"], ["conNegras", "Con negras (tu alumno lleva negras)"]].forEach(([clave, titulo]) => {
      const l = c.lados[clave];
      s.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mt-5 mb-1", titulo));
      if (!l.partidas) {
        s.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "No trae partidas suyas con " + (clave === "conBlancas" ? "blancas." : "negras.")));
        return;
      }
      const rp = l.resumenPlan;
      const totalPlan = rp.laJuega + rp.otra + rp.nunca;
      if (totalPlan) {
        // Solo lo que no es cero: «en 0 juega otra cosa» no dice nada.
        const partes = [rp.laJuega ? "ya juega " + rp.laJuega : "todavía no juega ninguna"];
        if (rp.otra) partes.push("en " + rp.otra + " juega otra cosa");
        if (rp.nunca) partes.push("a " + rp.nunca + " no llegó en sus partidas");
        s.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-100", "El plan: de " + totalPlan + (totalPlan === 1 ? " jugada que le toca, " : " jugadas que le tocan, ") + partes.join("; ") + "."));
        const otras = l.plan.filter((x) => x.estado === "otra");
        if (otras.length) {
          s.appendChild(lista(otras.map((x) => {
            const num = Math.floor(x.sec.length / 2) + 1;
            const jug = (x.sec.length % 2 === 0 ? num + "." : num + "…");
            return renglon(x.sec.concat(x.recomendada), [
              "El plan dice " + jug + A.sanEs(x.recomendada) + "; tu alumno juega " + jug + A.sanEs(x.suya.san) + " (" + x.suya.n + " de " + x.total + ")."],
              "El plan: " + A.sanEs(x.recomendada) + ". Tu alumno suele jugar " + A.sanEs(x.suya.san) + " (" + x.suya.n + " de " + x.total + ").");
          })));
        }
      }
      const texto = (x) => ["Tu alumno saca " + A.pct(x.alumno.puntos) + " en " + partidas(x.alumno.n) + "; él saca " + A.pct(x.rival.puntos) + " en " + partidas(x.rival.n) + " (su promedio con ese color: " + A.pct(l.base) + ")."];
      if (l.aFavor.length) {
        s.appendChild(el("h5", "text-sm font-semibold text-brand-800 dark:text-white mt-3", "Juega lo suyo: ahí él rinde menos"));
        s.appendChild(lista(l.aFavor.map((x) => renglon(x.sec.concat(x.jugada), texto(x), "Aquí él saca " + A.pct(x.rival.puntos) + " y tu alumno ya la conoce: " + A.pct(x.alumno.puntos) + " en " + partidas(x.alumno.n) + "."))));
      }
      if (l.enContra.length) {
        s.appendChild(el("h5", "text-sm font-semibold text-brand-800 dark:text-white mt-3", "Ojo: ahí él rinde más"));
        s.appendChild(lista(l.enContra.map((x) => renglon(x.sec.concat(x.jugada), texto(x), "Aquí él saca " + A.pct(x.rival.puntos) + ": mejor evitarla."))));
      }
      if (!l.aFavor.length && !l.enContra.length) {
        s.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300 mt-2", l.comunes
          ? "En lo que juegan los dos, él rinde como siempre: nada se aparta de su promedio."
          : "Sus repertorios no se cruzan: no llegan a ninguna posición con suficientes partidas de los dos."));
      }
    });
    return s;
  }

  /* Dónde deja la teoría (js/preparacion-teoria.js): cada línea de su
     repertorio, hasta la primera jugada que los maestros casi no juegan. Una
     misma salida que aparece en varias líneas (las que siguen después) va una
     sola vez, con la línea más corta que llega a ella. Es una lista y no una
     tabla: seis columnas no entraban en el celular. */
  function pintarTeoria(r) {
    const s = tarjeta("Dónde deja la teoría", "teoria-titulo");
    const t = r.teoria;
    s.appendChild(nota("Sus líneas más jugadas, comparadas jugada por jugada con las partidas de maestros del explorador de Lichess. La línea deja la teoría en la primera jugada que los maestros jugaron menos de " + (window.PreparacionTeoria ? PreparacionTeoria.MIN_MAESTROS : 5) + " veces. Si esa jugada es suya, ahí improvisa o trae algo propio: es la posición que conviene estudiar."));
    const lineas = t.lineas || [];
    if (!lineas.length) {
      s.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "No tiene líneas con suficientes partidas para compararlas."));
      return s;
    }
    ["w", "b"].forEach((color) => {
      const vistas = new Set();
      const items = [];
      lineas.filter((l) => l.color === color && l.completa).forEach((l) => {
        const x = l.salida;
        const hasta = x ? l.sec.slice(0, x.ply + 1) : l.sec;
        const clave = (x ? "sale:" : "hasta:") + hasta.join(" ");
        if (vistas.has(clave)) return;
        vistas.add(clave);
        const li = el("li", "py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2");
        li.dataset.teoria = hasta.join(" ");
        const texto = el("div", "min-w-0 flex-1");
        texto.appendChild(el("p", "font-mono text-sm text-brand-800 dark:text-white", A.lineaEs(hasta)));
        let notaVer;
        if (!x) {
          texto.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200", "No la deja: sigue a los maestros hasta la jugada " + Math.ceil(l.sec.length / 2) + " (" + l.n + (l.n === 1 ? " partida suya)." : " partidas suyas).")));
          notaVer = "Toda la línea es teoría de maestros.";
        } else {
          const veces = x.veces != null ? x.veces : l.n;
          const quien = x.quien === "el" ? "Él la deja" : "Su rival la deja";
          texto.appendChild(el("p", "text-sm font-semibold text-brand-700 dark:text-brand-100", quien + " en la jugada " + Math.ceil((x.ply + 1) / 2) + ", con " + A.sanEs(x.jugada) + " (" + veces + (veces === 1 ? " partida suya)." : " partidas suyas).")));
          const alt = x.alternativas.map((a) => A.sanEs(a.san) + " (" + Math.round(100 * a.reparto) + " %)").join(", ");
          texto.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200", "Los maestros la jugaron " + x.maestros + (x.maestros === 1 ? " vez" : " veces") + " de " + x.total.toLocaleString("es-CR") + "." + (alt ? " Lo que juegan ellos: " + alt + "." : "")));
          notaVer = (x.quien === "el" ? "Aquí él deja la teoría con " : "Aquí su rival deja la teoría con ") + A.sanEs(x.jugada) +
            ": los maestros la jugaron " + x.maestros + (x.maestros === 1 ? " vez" : " veces") + " de " + x.total.toLocaleString("es-CR") + "." +
            (x.alternativas.length ? " Lo habitual es " + x.alternativas.slice(0, 2).map((a) => A.sanEs(a.san)).join(" o ") + "." : "");
        }
        li.appendChild(texto);
        if (opcionesActuales.alVerSecuencia) li.appendChild(botonVer(hasta, "Ver en el tablero: " + A.lineaEs(hasta), notaVer));
        items.push(li);
      });
      if (!items.length) return;
      s.appendChild(el("h4", "font-bold text-brand-800 dark:text-white mt-4 mb-1", color === "w" ? "Cuando lleva blancas" : "Cuando lleva negras"));
      const ul = el("ul", "divide-y divide-brand-100 dark:divide-brand-800");
      items.forEach((li) => ul.appendChild(li));
      s.appendChild(ul);
    });
    const sinDatos = lineas.filter((l) => !l.completa).length;
    if (sinDatos) s.appendChild(el("p", "text-sm text-accent-700 dark:text-accent-400 mt-3", sinDatos + (sinDatos === 1 ? " línea quedó" : " líneas quedaron") + " sin revisar del todo: el explorador no contestó todas las posiciones."));
    s.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-3", "Fuente: partidas de maestros del explorador de Lichess."));
    return s;
  }

  // `en`: en qué jugada se abre (si no, en la última).
  function botonVer(sec, etiqueta, nota, en) {
    const b = el("button", "px-2 py-1 rounded text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Ver");
    b.type = "button";
    b.setAttribute("aria-label", etiqueta);
    b.addEventListener("click", () => opcionesActuales.alVerSecuencia(sec, nota, b, en));
    return b;
  }

  function botonPlan(texto, dato, alTocar) {
    const b = el("button", "px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto);
    b.type = "button";
    b.dataset[dato[0]] = dato[1];
    b.addEventListener("click", () => alTocar(b));
    return b;
  }

  // Lo que se hace con un plan: bajarlo, mandárselo a un alumno (con su tarea)
  // y guardarlo en Archivos, que es de donde lo toma la clase en vivo. Cada
  // botón aparece solo si la página dio con qué hacerlo.
  function accionesPlan(lado, nombre) {
    const o = opcionesActuales;
    const fila = el("div", "mt-4 flex flex-wrap gap-2");
    if (o.alBajarPgn) fila.appendChild(botonPlan("Bajar el plan " + nombre + " (PGN)", ["pgn", lado], () => o.alBajarPgn(lado)));
    if (o.alMandar) fila.appendChild(botonPlan("Mandárselo a un alumno", ["mandar", lado], (b) => o.alMandar(lado, b)));
    if (o.alArchivar) fila.appendChild(botonPlan("Guardar en Archivos (para la clase)", ["archivar", lado], (b) => o.alArchivar(lado, b)));
    return fila;
  }

  /* Solo el plan, para la página del alumno (js/plan-rival.js): la misma lista
     de jugadas que ve el profesor, con cada jugada abriendo el tablero. */
  function pintarSoloPlan(nodos, opciones) {
    opcionesActuales = opciones || {};
    return listaPlan(nodos, 0);
  }

  window.PreparacionPintar = { cuerpo: pintarCuerpo, plan: pintarSoloPlan, pendiente, hoja: pintarHoja, el, tabla, jugada, fecha };
})();
