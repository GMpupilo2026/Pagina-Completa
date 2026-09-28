/* preparacion-rivales.html: cargar un PGN, elegir al rival, pintar el análisis
 * de js/preparacion-analisis.js, revisarlo con Stockfish y guardarlo.
 *
 * Quién puede: puedo_preparar_rivales() (quien administra, o un profesor al
 * que administración se la activó en admin.html#preparacion). Esta página
 * solo decide qué se pinta; guardar lo vuelve a exigir la RLS.
 *
 * El PGN no sale de la computadora: se lee con FileReader y se analiza acá.
 * Lo que se guarda es el resultado (preparaciones_rival.analisis).
 * Ver «La preparación de rivales» en docs/decisiones/paneles.md.
 */
(function () {
  "use strict";

  const A = window.PreparacionAnalisis;
  const $ = (id) => document.getElementById(id);
  const PROFUNDIDAD = 14;          // Stockfish en el navegador, un hilo: rápido y suficiente para detectar errores claros
  const TOPE_BYTES = 1400000;      // la base acepta hasta 1,5 MB por análisis

  let yo = null;
  let partidas = [];
  let actual = null;                // el análisis que se ve
  let guardadoId = null;            // si el que se ve ya está guardado
  let revisando = false;
  let pararRevision = false;

  // ------------------------------------------------------------ utilidades

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

  // ------------------------------------------------------------ 1. leer

  function leerArchivo(f) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ""));
      fr.onerror = () => rej(fr.error || new Error("No se pudo leer " + f.name));
      fr.readAsText(f);
    });
  }

  // Deja las partidas listas para elegir al rival. `rival` (un usuario recién
  // bajado) se elige solo, si está en el archivo.
  function cargarTexto(texto, estado, rival) {
    partidas = A.leerPgn(texto);
    if (!partidas.length) {
      estado.textContent = "No se encontró ninguna partida. Revisa que sea un PGN.";
      $("paso-rival").hidden = true;
      return false;
    }
    const lista = A.jugadores(partidas);
    estado.textContent = "Se leyeron " + partidas.length.toLocaleString("es-CR") + (partidas.length === 1 ? " partida" : " partidas") +
      " de " + lista.length.toLocaleString("es-CR") + (lista.length === 1 ? " jugador." : " jugadores.");
    const sel = $("rival");
    sel.textContent = "";
    lista.slice(0, 200).forEach((j) => {
      const o = el("option", "", j.nombre + " — " + j.partidas.toLocaleString("es-CR") + (j.partidas === 1 ? " partida" : " partidas"));
      o.value = j.nombre;
      sel.appendChild(o);
    });
    if (rival) {
      const clave = A.claveNombre(rival);
      const suyo = lista.find((j) => j.clave === clave);
      if (suyo) sel.value = suyo.nombre;
    }
    $("paso-rival").hidden = false;
    return true;
  }

  async function leer() {
    const boton = $("leer");
    const archivos = [...($("pgn-archivo").files || [])];
    const pegado = $("pgn-texto").value;
    if (!archivos.length && !pegado.trim()) {
      $("leido").textContent = "Elige un archivo PGN o pega las partidas.";
      return;
    }
    boton.disabled = true;
    $("leido").textContent = "Leyendo…";
    let textos;
    try {
      textos = await Promise.all(archivos.map(leerArchivo));
      if (pegado.trim()) textos.push(pegado);
    } catch (e) {
      console.error(e);
      $("leido").textContent = "No se pudo leer el archivo: " + (e.message || e);
      boton.disabled = false;
      return;
    }
    boton.disabled = false;
    if (cargarTexto(textos.join("\n\n"), $("leido"))) $("rival").focus();
  }

  // ------------------------------------------------------------ 1b. bajar de Lichess o Chess.com

  let bajando = null;   // el AbortController de la descarga en curso

  async function bajar(ev) {
    ev.preventDefault();
    if (bajando) return;
    const sitio = document.querySelector('input[name="bajar-sitio"]:checked').value;
    const usuario = $("bajar-usuario").value.trim().replace(/^@/, "");
    const maximo = parseInt($("bajar-maximo").value, 10) || 0;
    const estado = $("bajar-estado");
    const nombreSitio = sitio === "lichess" ? "Lichess" : "Chess.com";
    if (!window.PreparacionDescarga.USUARIO_VALIDO.test(usuario)) {
      estado.textContent = "Escribe el nombre de usuario tal como sale en su perfil: letras, números, guion o guion bajo.";
      $("bajar-usuario").focus();
      return;
    }
    bajando = new AbortController();
    $("bajar").disabled = true;
    $("bajar-parar").hidden = false;
    estado.textContent = "Pidiéndole las partidas a " + nombreSitio + "…";
    let texto = "";
    let parado = false;
    let ultimoAviso = 0;
    try {
      texto = await window.PreparacionDescarga.descargar({
        sitio, usuario, maximo, senal: bajando.signal,
        alAvanzar: (n, mes, meses) => {
          // El lector de pantalla no necesita cada partida: una vez por segundo.
          const ahora = Date.now();
          if (ahora - ultimoAviso < 1000) return;
          ultimoAviso = ahora;
          estado.textContent = "Bajando de " + nombreSitio + ": " + n.toLocaleString("es-CR") + (n === 1 ? " partida" : " partidas") +
            (meses ? " (mes " + mes + " de " + meses + ")" : "") + "…";
        },
      });
    } catch (e) {
      if (e && e.name === "AbortError") {
        parado = true;
      } else {
        if (!(e && e.paraMostrar)) console.error(e);
        estado.textContent = e && e.paraMostrar ? e.message : "No se pudieron bajar las partidas de " + nombreSitio + ". Revisa tu conexión y vuelve a intentarlo.";
        terminarBajada();
        return;
      }
    }
    // Parado a la mitad: se analiza lo que ya llegó (en Lichess va quedando en
    // el texto; en Chess.com, los meses completos).
    if (parado) texto = window.PreparacionDescarga.ultimoTexto || texto;
    terminarBajada();
    if (!texto || !cargarTexto(texto, estado, usuario)) {
      if (parado) estado.textContent = "Se paró antes de que llegara alguna partida.";
      return;
    }
    const clave = A.claveNombre(usuario);
    if (!A.jugadores(partidas).some((j) => j.clave === clave)) {
      estado.textContent += " Ninguna es de «" + usuario + "»: elige al rival en la lista.";
      $("rival").focus();
      return;
    }
    analizar();
  }

  function terminarBajada() {
    bajando = null;
    $("bajar").disabled = false;
    $("bajar-parar").hidden = true;
  }

  // ------------------------------------------------------------ 2. analizar

  function analizar() {
    const nombre = $("rival").value;
    if (!nombre) return;
    const r = A.analizar(partidas, nombre);
    if (!r) {
      Avisos.avisar("Ese jugador no tiene partidas con resultado en el archivo.", { tipo: "error" });
      return;
    }
    mostrar(r, null);
    revisarConMotor();
  }

  // ------------------------------------------------------------ pintar

  function mostrar(r, id) {
    actual = r;
    guardadoId = id;
    $("resultado").hidden = false;
    $("titulo-resultado").textContent = r.rival;
    const partes = [r.total.toLocaleString("es-CR") + (r.total === 1 ? " partida" : " partidas")];
    if (r.fechas.desde) partes.push("del " + fecha(r.fechas.desde) + " al " + fecha(r.fechas.hasta));
    if (r.elo.reciente) partes.push("Elo reciente ≈ " + r.elo.reciente);
    partes.push("una línea cuenta desde " + r.minimo + " partidas");
    $("resultado-sub").textContent = partes.join(" · ");
    $("guardar").disabled = !!id;
    $("guardar").textContent = id ? "Guardado" : "Guardar el análisis";
    $("motor-estado").textContent = r.motor ? "Revisado con Stockfish (" + r.motor.detalle + ")." : "";
    pintarCuerpo(r);
    $("titulo-resultado").focus();
  }

  function pintarCuerpo(r) {
    const c = $("resultado-cuerpo");
    c.textContent = "";
    c.appendChild(pintarCifras(r));
    c.appendChild(pintarFoda(r));
    c.appendChild(pintarPlanes(r));
    if (r.motor) c.appendChild(pintarMotor(r));
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

  // ------------------------------------------------------------ Stockfish

  function evalBlancas(fen, puntaje) {
    return fen.split(" ")[1] === "w" ? puntaje : -puntaje;
  }

  // Una posición: { eval desde las blancas, mejor (SAN) }.
  function evaluar(fen) {
    const g = new Chess(fen);
    if (g.in_checkmate()) return Promise.resolve({ eval: evalBlancas(fen, -100), mejor: null });
    if (g.in_draw() || g.in_stalemate()) return Promise.resolve({ eval: 0, mejor: null });
    return SharedEngine.runTask(async () => {
      const motor = await SharedEngine.ensureEngine();
      if (!motor) throw new Error("No se pudo cargar Stockfish");
      return new Promise((res, rej) => {
        let ultimo = null;
        let espera2 = null;
        const espera = setTimeout(() => {
          motor.postMessage("stop");
          espera2 = setTimeout(() => {
            SharedEngine.setMessageHandler(null);
            SharedEngine.discardEngine();
            rej(new Error("Stockfish no respondió"));
          }, 4000);
        }, 20000);
        SharedEngine.setMessageHandler((ev) => {
          const linea = typeof ev.data === "string" ? ev.data : "";
          if (linea.startsWith("info") && / score /.test(linea) && !/bound/.test(linea)) {
            const m = linea.match(/ score (cp|mate) (-?\d+)/);
            if (m) {
              const v = parseInt(m[2], 10);
              ultimo = m[1] === "cp" ? v / 100 : (v > 0 ? 100 - v : v < 0 ? -100 - v : -100);
            }
          } else if (linea.startsWith("bestmove")) {
            clearTimeout(espera); clearTimeout(espera2);
            SharedEngine.setMessageHandler(null);
            const uci = linea.split(/\s+/)[1];
            let mejor = null;
            if (uci && uci !== "(none)") {
              const mv = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
              mejor = mv ? mv.san.replace(/[+#]$/, "") : null;
            }
            res({ eval: ultimo == null ? null : evalBlancas(fen, ultimo), mejor });
          }
        });
        motor.postMessage("position fen " + fen);
        motor.postMessage("go depth " + PROFUNDIDAD);
      });
    });
  }

  async function revisarConMotor() {
    if (!actual || revisando) return;
    if (!window.SharedEngine || !window.Chess) {
      $("motor-estado").textContent = "Stockfish no está disponible en este navegador.";
      return;
    }
    revisando = true;
    pararRevision = false;
    $("motor-revisar").disabled = true;
    $("motor-parar").hidden = false;
    const r = actual;
    const tareas = A.tareasDelMotor(r);
    const cache = new Map();
    const evals = {};
    let hechas = 0;
    const cuando = (fen) => {
      if (!cache.has(fen)) cache.set(fen, evaluar(fen));
      return cache.get(fen);
    };
    try {
      for (const t of tareas) {
        if (pararRevision || actual !== r) break;
        $("motor-estado").textContent = "Revisando con Stockfish: " + (hechas + 1) + " de " + tareas.length + " jugadas…";
        const antes = A.fenDe(t.sec);
        const despues = A.fenDe(t.sec.concat(t.jugada));
        if (antes && despues) {
          const [ea, ed] = [await cuando(antes), await cuando(despues)];
          evals[t.clave] = { antes: ea.eval, mejor: ea.mejor, despues: ed.eval };
        }
        hechas += 1;
      }
    } catch (e) {
      console.error(e);
      $("motor-estado").textContent = "Stockfish se detuvo: " + (e.message || e) + ". Lo revisado hasta ahí se muestra igual.";
    }
    revisando = false;
    $("motor-revisar").disabled = false;
    $("motor-parar").hidden = true;
    if (actual !== r) return;
    if (!hechas) return;
    const detalle = "Stockfish 16, profundidad " + PROFUNDIDAD + ", " + hechas + " de " + tareas.length + " jugadas revisadas";
    A.aplicarMotor(r, tareas.slice(0, hechas), evals, detalle);
    if (!/se detuvo/.test($("motor-estado").textContent)) {
      $("motor-estado").textContent = pararRevision ? "Revisión parada: " + detalle + "." : "Listo: " + detalle + ".";
    }
    pintarCuerpo(r);
    // Si ya estaba guardado, lo revisado no está en la base: se puede guardar de nuevo.
    if (guardadoId) { guardadoId = null; $("guardar").disabled = false; $("guardar").textContent = "Guardar con la revisión"; }
  }

  // ------------------------------------------------------------ guardar

  async function guardar() {
    if (!actual) return;
    const json = JSON.stringify(actual);
    if (json.length > TOPE_BYTES) {
      Avisos.avisar("El análisis es demasiado grande para guardarlo.", { tipo: "error" });
      return;
    }
    const b = $("guardar");
    b.disabled = true;
    const { data, error } = await sb.from("preparaciones_rival")
      .insert({ rival: String(actual.rival).slice(0, 120), partidas: actual.total, analisis: actual })
      .select("id").single();
    if (error) {
      console.error(error);
      b.disabled = false;
      Avisos.avisar("No se pudo guardar: " + (error.message || error), { tipo: "error" });
      return;
    }
    guardadoId = data.id;
    b.textContent = "Guardado";
    Avisos.avisar("Análisis de " + actual.rival + " guardado.");
    cargarGuardados();
  }

  async function cargarGuardados() {
    const { data, error } = await sb.from("preparaciones_rival")
      .select("id, rival, partidas, created_at").eq("profesor_id", yo)
      .order("created_at", { ascending: false }).range(0, 49);
    const ul = $("guardados");
    ul.textContent = "";
    if (error) {
      console.error(error);
      ul.appendChild(el("li", "py-2 text-sm text-brand-500 dark:text-brand-300", "No se pudieron cargar tus análisis guardados."));
      return;
    }
    $("guardados-vacio").hidden = (data || []).length > 0;
    for (const g of data || []) {
      const li = el("li", "flex flex-wrap items-center justify-between gap-3 py-3");
      const quien = el("div", "min-w-0");
      quien.appendChild(el("p", "font-semibold text-brand-800 dark:text-white truncate", g.rival));
      quien.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", g.partidas.toLocaleString("es-CR") + (g.partidas === 1 ? " partida" : " partidas") + " · " + fecha(g.created_at)));
      li.appendChild(quien);
      const acciones = el("div", "flex gap-2");
      const abrir = el("button", "px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Abrir");
      abrir.type = "button";
      abrir.setAttribute("aria-label", "Abrir el análisis de " + g.rival);
      abrir.addEventListener("click", () => abrirGuardado(g.id));
      const borrar = el("button", "px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Eliminar");
      borrar.type = "button";
      borrar.setAttribute("aria-label", "Eliminar el análisis de " + g.rival);
      borrar.addEventListener("click", () => borrarGuardado(g));
      acciones.appendChild(abrir);
      acciones.appendChild(borrar);
      li.appendChild(acciones);
      ul.appendChild(li);
    }
  }

  async function abrirGuardado(id) {
    const { data, error } = await sb.from("preparaciones_rival").select("id, analisis").eq("id", id).single();
    if (error || !data) {
      Avisos.avisar("No se pudo abrir el análisis.", { tipo: "error" });
      return;
    }
    mostrar(data.analisis, data.id);
  }

  async function borrarGuardado(g) {
    const ok = await Avisos.confirmar("Se borra el análisis de " + g.rival + ". Las partidas no se guardaban, así que para verlo otra vez tendrías que cargar el PGN.", { titulo: "¿Eliminar este análisis?", aceptar: "Eliminar", peligro: true });
    if (!ok) return;
    const { error } = await sb.from("preparaciones_rival").delete().eq("id", g.id);
    if (error) {
      Avisos.avisar("No se pudo eliminar: " + (error.message || error), { tipo: "error" });
      return;
    }
    if (guardadoId === g.id) { guardadoId = null; $("guardar").disabled = false; $("guardar").textContent = "Guardar el análisis"; }
    Avisos.avisar("Análisis eliminado.");
    cargarGuardados();
  }

  // ------------------------------------------------------------ inicio

  async function init() {
    const { data } = await sb.auth.getSession();
    const sesion = data && data.session;
    if (!sesion) { location.href = "login.html"; return; }
    yo = sesion.user.id;
    const { data: puede, error } = await sb.rpc("puedo_preparar_rivales");
    $("loading").classList.add("hidden");
    if (error || puede !== true) {
      $("denegado").classList.remove("hidden");
      return;
    }
    $("app").classList.remove("hidden");
    $("leer").addEventListener("click", leer);
    $("bajar-form").addEventListener("submit", bajar);
    $("bajar-parar").addEventListener("click", () => { if (bajando) bajando.abort(); });
    $("analizar").addEventListener("click", analizar);
    $("guardar").addEventListener("click", guardar);
    $("motor-revisar").addEventListener("click", revisarConMotor);
    $("motor-parar").addEventListener("click", () => { pararRevision = true; });
    cargarGuardados();
  }

  init();
})();
