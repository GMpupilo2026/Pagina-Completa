/* «Mi repertorio»: las aperturas que juega cada alumno, con blancas y con
 * negras, dentro de Aperturas y celadas (entreno/aperturas.html).
 *
 * El banco de la página son 40 líneas iguales para todos; el repertorio es lo
 * que ESTE alumno juega. Se arma jugando las dos partes en un tablero (o
 * escribiéndolas, o partiendo de una línea del banco), se ve como un árbol y
 * se entrena con el mismo entrenador y el mismo repaso espaciado: cada línea
 * suya es una línea más, con id «mi:<uuid>» en aperturas_srs_v1.
 *
 * - Ninguna jugada se inventa: la línea se arma con chess.js (solo entran
 *   jugadas legales) y se vuelve a comprobar al leerla. Una fila que no pasa
 *   no se entrena: el alumno no podría terminarla nunca.
 * - Una respuesta tuya por posición. Si contestas 1.e4 con c5 en una línea y
 *   con e5 en otra, el entrenador te pediría dos jugadas distintas en el mismo
 *   lugar. Lo frena la base (trigger repertorio_coherente); `choque()` dice lo
 *   mismo antes de guardar, para avisar mientras se arma.
 * Ver «Mi repertorio» en docs/decisiones/entrenamiento.md.
 *
 *   RepertorioAperturas.validar(jugadas)          → { ok, jugadas (SAN), error }
 *   RepertorioAperturas.choque(lineas, color, jugadas) → { indice, jugada } | null
 *   RepertorioAperturas.arbol(lineas)             → nodos { san, ply, hijos, lineas }
 *   RepertorioAperturas.leerTexto(texto, previas) → { jugadas, error }
 *   RepertorioAperturas.aLinea(fila)              → una línea del entrenador
 *   RepertorioAperturas.montar(contenedor, opciones)
 */
(function () {
  "use strict";

  const MAX_JUGADAS = 40;
  const PREFIJO = "mi:";

  function nuevoJuego() {
    const C = typeof Chess !== "undefined" ? Chess
      : (typeof require === "function" ? (require("chess.js").Chess || require("chess.js")) : null);
    return new C();
  }

  // Cada jugada tiene que existir de verdad en su posición. Devuelve el SAN
  // tal como lo escribe chess.js (con su + y su #), que es lo que compara el
  // entrenador.
  function validar(jugadas) {
    if (!Array.isArray(jugadas) || jugadas.length < 2) return { ok: false, jugadas: [], error: "Hacen falta al menos dos jugadas." };
    if (jugadas.length > MAX_JUGADAS) return { ok: false, jugadas: [], error: `Una línea llega hasta ${MAX_JUGADAS} jugadas.` };
    const juego = nuevoJuego();
    const salida = [];
    for (let i = 0; i < jugadas.length; i++) {
      const m = juego.move(jugadas[i], { sloppy: true });
      if (!m) return { ok: false, jugadas: salida, error: `La jugada ${i + 1} (${jugadas[i]}) no se puede hacer en esa posición.` };
      salida.push(m.san);
    }
    return { ok: true, jugadas: salida, error: null };
  }

  const esMia = (color, i) => (color === "w") === (i % 2 === 0);

  // La misma regla del trigger: en una jugada tuya, la misma posición (mismas
  // jugadas antes) no puede tener otra respuesta.
  function choque(lineas, color, jugadas, sinId) {
    for (let i = 0; i < jugadas.length; i++) {
      if (!esMia(color, i)) continue;
      for (const L of lineas || []) {
        if (L.color !== color || (sinId && L.id === sinId) || L.jugadas.length <= i) continue;
        let igual = true;
        for (let k = 0; k < i; k++) if (L.jugadas[k] !== jugadas[k]) { igual = false; break; }
        if (igual && L.jugadas[i] !== jugadas[i]) return { indice: i, jugada: L.jugadas[i], linea: L };
      }
    }
    return null;
  }

  // Un árbol por jugadas: cada nodo es una jugada, con las líneas que terminan
  // ahí. El orden de los hijos es el de llegada (la primera línea primero).
  function arbol(lineas) {
    const raiz = { san: null, ply: -1, hijos: [], lineas: [] };
    (lineas || []).forEach((L) => {
      let nodo = raiz;
      L.jugadas.forEach((san, i) => {
        let h = nodo.hijos.find((x) => x.san === san);
        if (!h) { h = { san, ply: i, hijos: [], lineas: [] }; nodo.hijos.push(h); }
        nodo = h;
      });
      nodo.lineas.push(L);
    });
    return raiz;
  }

  /* Lo que se escribe: una jugada o varias ("1.e4 e5 2.Cf3 Cc6"), en la
     notación de acá o en la inglesa. Lo interpreta ComandosTablero, el mismo de
     todo el sitio, jugada por jugada sobre la posición que va quedando. */
  function leerTexto(texto, previas) {
    const juego = nuevoJuego();
    for (const san of previas || []) if (!juego.move(san, { sloppy: true })) return { jugadas: [], error: "La línea de antes no es válida." };
    const trozos = String(texto || "").replace(/\d+\s*\.(\.\.)?/g, " ").split(/[\s,;]+/).filter(Boolean);
    const nuevas = [];
    for (const t of trozos) {
      const mv = window.ComandosTablero ? window.ComandosTablero.jugadaEscrita(juego, t) : null;
      const hecha = mv ? juego.move({ from: mv.from, to: mv.to, promotion: mv.promotion }) : juego.move(t, { sloppy: true });
      if (!hecha) {
        return { jugadas: nuevas, error: `No se pudo jugar «${t}» en esa posición` + (nuevas.length ? ` (sí entraron ${nuevas.length}).` : ".") };
      }
      nuevas.push(hecha.san);
    }
    return { jugadas: nuevas, error: nuevas.length ? null : "Escribe una jugada, por ejemplo e4 o Cf3." };
  }

  // Una fila de la base, como una línea más del entrenador.
  function aLinea(f) {
    return {
      id: PREFIJO + f.id, fila: f.id, propia: true,
      nombre: f.nombre, apertura: "Mi repertorio", tipo: "apertura", nivel: null,
      color: f.color, jugadas: f.jugadas,
      idea: "Es una línea de tu repertorio.", clave: "",
    };
  }

  /* ---------------- la pantalla ---------------- */
  const aEsp = (san) => (window.ComandosTablero ? window.ComandosTablero.jugadaParaMostrar(san) : san);
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function boton(texto, clase, aria) {
    const b = el("button", clase || "bctrl", texto);
    b.type = "button";
    if (aria) b.setAttribute("aria-label", aria);
    return b;
  }
  function texto(jugadas, desde) {
    return jugadas.map((san, i) => {
      const k = (desde || 0) + i;
      return (k % 2 === 0 ? (k / 2 + 1) + ". " : (i === 0 ? Math.floor(k / 2) + 1 + "… " : "")) + aEsp(san);
    }).join(" ");
  }

  /* opciones: { sb, yo, filas, banco, cuando(id) → texto, entrenar(id), avisar(texto, tipo),
                 confirmar(texto, opts) → Promise<bool>, alCambiar() } */
  function montar(contenedor, o) {
    let filas = (o.filas || []).slice();
    let lineas = [];
    const invalidas = [];
    function recalcular() {
      lineas = [];
      invalidas.length = 0;
      filas.forEach((f) => {
        const v = validar(f.jugadas);
        if (v.ok) lineas.push(aLinea(Object.assign({}, f, { jugadas: v.jugadas })));
        else invalidas.push(f);
      });
    }
    recalcular();
    contenedor.innerHTML = "";

    const intro = el("p", "sub", "Las aperturas que juegas tú. Arma cada línea jugándola, y el entrenador te la pide de memoria como las del banco.");
    const acciones = el("div", "round-controls");
    acciones.style.justifyContent = "flex-start";
    const repasar = boton("🔁 Repasar mi repertorio", "bctrl primary");
    repasar.id = "rep-repasar";
    const agregar = boton("➕ Agregar una línea", "bctrl");
    agregar.id = "rep-agregar";
    agregar.setAttribute("aria-expanded", "false");
    agregar.setAttribute("aria-controls", "rep-editor");
    acciones.append(repasar, agregar);
    const estado = el("p", "sub");
    estado.id = "rep-estado";
    estado.setAttribute("role", "status");
    const editor = el("div", "panel hidden");
    editor.id = "rep-editor";
    const arboles = el("div");
    arboles.id = "rep-arboles";
    contenedor.append(intro, acciones, estado, editor, arboles);

    function pintar() {
      arboles.innerHTML = "";
      const pendientes = lineas.filter((L) => /hoy|sin empezar/.test(o.cuando(L.id))).length;
      estado.textContent = lineas.length
        ? `${lineas.length === 1 ? "1 línea" : lineas.length + " líneas"} en tu repertorio · ${pendientes} para repasar hoy.`
          + (invalidas.length ? ` ${invalidas.length === 1 ? "Una línea no se pudo leer" : invalidas.length + " líneas no se pudieron leer"} y no se entrena.` : "")
        : "Todavía no tienes líneas. Agrega la primera: la que juegas con blancas, o cómo contestas a 1.e4 con negras.";
      repasar.disabled = pendientes === 0;
      ["w", "b"].forEach((color) => {
        const suyas = lineas.filter((L) => L.color === color);
        const sec = el("section", "panel");
        sec.style.marginBottom = "1rem";
        sec.setAttribute("data-rep-color", color);
        const h = el("h2", null, color === "w" ? "♔ Con blancas" : "♚ Con negras");
        h.id = "rep-titulo-" + color;
        sec.setAttribute("aria-labelledby", h.id);
        sec.appendChild(h);
        if (!suyas.length) {
          sec.appendChild(el("p", "sub", color === "w" ? "Todavía no hay líneas con blancas." : "Todavía no hay líneas con negras."));
        } else {
          const ul = el("ul");
          ul.style.listStyle = "none"; ul.style.paddingLeft = "0"; ul.style.margin = ".6rem 0 0";
          pintarNodo(ul, arbol(suyas), []);
          sec.appendChild(ul);
        }
        arboles.appendChild(sec);
      });
    }

    // Una cadena de jugadas sin ramas va en un solo renglón.
    function pintarNodo(ul, nodo, previas) {
      nodo.hijos.forEach((h) => {
        const cadena = [h];
        let n = h;
        while (n.hijos.length === 1 && !n.lineas.length) { n = n.hijos[0]; cadena.push(n); }
        const li = el("li");
        li.style.margin = ".35rem 0";
        li.style.paddingLeft = previas.length ? ".9rem" : "0";
        if (previas.length) li.style.borderLeft = "2px solid var(--line)";
        const mov = el("p", null, texto(cadena.map((x) => x.san), h.ply));
        mov.style.margin = "0";
        mov.style.fontWeight = "600";
        li.appendChild(mov);
        n.lineas.forEach((L) => {
          const fila = el("div");
          fila.style.display = "flex"; fila.style.flexWrap = "wrap"; fila.style.alignItems = "center"; fila.style.gap = ".5rem"; fila.style.margin = ".25rem 0";
          fila.setAttribute("data-rep-linea", L.fila);
          const nom = el("span", null, L.nombre);
          const cuando = el("span", "sub", "· " + o.cuando(L.id));
          cuando.style.margin = "0";
          const entrenar = boton("Entrenar", "bctrl", "Entrenar " + L.nombre);
          entrenar.style.padding = "6px 12px"; entrenar.style.minHeight = "36px";
          entrenar.addEventListener("click", () => o.entrenar(L.id));
          const borrar = boton("Borrar", "bctrl", "Borrar " + L.nombre);
          borrar.style.padding = "6px 12px"; borrar.style.minHeight = "36px";
          borrar.addEventListener("click", async () => {
            if (!(await o.confirmar(`Se borra «${L.nombre}» de tu repertorio, con lo que llevabas repasado.`, { titulo: "¿Borrar esta línea?", aceptar: "Borrar la línea", peligro: true }))) return;
            const { error } = await o.sb.from("repertorio").delete().eq("id", L.fila);
            if (error) { o.avisar("No se pudo borrar: " + error.message, "error"); return; }
            filas = filas.filter((f) => f.id !== L.fila);
            recalcular(); pintar(); o.alCambiar(lineas);
            o.avisar("Se borró la línea.");
          });
          fila.append(nom, cuando, entrenar, borrar);
          li.appendChild(fila);
        });
        if (n.hijos.length) {
          const sub = el("ul");
          sub.style.listStyle = "none"; sub.style.margin = "0"; sub.style.paddingLeft = ".4rem";
          pintarNodo(sub, n, previas.concat(cadena.map((x) => x.san)));
          li.appendChild(sub);
        }
        ul.appendChild(li);
      });
    }

    /* ---------------- el editor ---------------- */
    let ed = null;
    function abrirEditor() {
      editor.classList.remove("hidden");
      agregar.setAttribute("aria-expanded", "true");
      ed = { color: "w", jugadas: [], sel: null };
      editor.innerHTML = "";
      const tit = el("h2", null, "Una línea nueva");
      tit.id = "rep-editor-titulo";
      tit.tabIndex = -1;
      const filaColor = el("div", "filtros");
      filaColor.setAttribute("role", "radiogroup");
      filaColor.setAttribute("aria-label", "Con qué color la juegas");
      ["w", "b"].forEach((c) => {
        const lab = el("label");
        const r = el("input"); r.type = "radio"; r.name = "rep-color"; r.value = c; r.checked = c === "w";
        r.addEventListener("change", () => { ed.color = c; pintarEditor(); });
        lab.append(r, " " + (c === "w" ? "Juego con blancas" : "Juego con negras"));
        filaColor.appendChild(lab);
      });
      const filaDesde = el("div", "filtros");
      const labDesde = el("label", null, "Empezar desde");
      labDesde.htmlFor = "rep-desde";
      const desde = el("select"); desde.id = "rep-desde";
      desde.appendChild(new Option("La posición inicial", ""));
      (o.banco || []).filter((L) => L.tipo === "apertura").forEach((L) => desde.appendChild(new Option(L.nombre + " (" + (L.color === "w" ? "blancas" : "negras") + ")", "banco:" + L.id)));
      lineas.forEach((L) => desde.appendChild(new Option("Mía: " + L.nombre, L.id)));
      desde.addEventListener("change", () => {
        const L = (o.banco || []).find((x) => "banco:" + x.id === desde.value) || lineas.find((x) => x.id === desde.value);
        ed.jugadas = L ? L.jugadas.slice() : [];
        if (L) {
          ed.color = L.color;
          filaColor.querySelectorAll("input").forEach((r) => { r.checked = r.value === L.color; });
          if (!nombre.value.trim() && !L.propia) nombre.value = L.nombre;
        }
        ed.sel = null;
        pintarEditor();
      });
      filaDesde.append(labDesde, desde);

      const tablero = el("div", "board8");
      tablero.id = "rep-board";
      tablero.setAttribute("role", "group");
      tablero.setAttribute("aria-label", "Tablero para armar la línea");
      tablero.style.maxWidth = "420px"; tablero.style.margin = "0 auto";

      const jug = el("p", "jugadas");
      jug.id = "rep-jugadas";
      jug.setAttribute("aria-live", "polite");
      const filaEscribir = el("div", "filtros");
      const labEsc = el("label", null, "Escribe jugadas");
      labEsc.htmlFor = "rep-escribir";
      const esc = el("input"); esc.id = "rep-escribir"; esc.type = "text"; esc.autocomplete = "off";
      esc.placeholder = "e4 e5 Cf3"; esc.style.flex = "1"; esc.style.minWidth = "10rem";
      esc.className = "filtros-input";
      esc.style.background = "var(--bg-panel)"; esc.style.color = "var(--text)"; esc.style.border = "1px solid var(--line)"; esc.style.borderRadius = "8px"; esc.style.padding = ".45rem .6rem"; esc.style.font = "inherit";
      const escBtn = boton("Agregar jugadas", "bctrl");
      escBtn.id = "rep-escribir-btn";
      const agregarEscritas = () => {
        const r = leerTexto(esc.value, ed.jugadas);
        ed.jugadas = ed.jugadas.concat(r.jugadas).slice(0, MAX_JUGADAS);
        aviso.textContent = r.error || "";
        if (!r.error) esc.value = "";
        ed.sel = null;
        pintarEditor(true);
      };
      escBtn.addEventListener("click", agregarEscritas);
      esc.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); agregarEscritas(); } });
      filaEscribir.append(labEsc, esc, escBtn);

      const ctrl = el("div", "round-controls");
      const deshacer = boton("↶ Deshacer la última", "bctrl"); deshacer.id = "rep-deshacer";
      deshacer.addEventListener("click", () => { ed.jugadas.pop(); ed.sel = null; pintarEditor(); });
      const vaciar = boton("Empezar de cero", "bctrl");
      vaciar.addEventListener("click", () => { ed.jugadas = []; ed.sel = null; desde.value = ""; pintarEditor(); });
      ctrl.append(deshacer, vaciar);

      const filaNombre = el("div", "filtros");
      const labNom = el("label", null, "Nombre de la línea");
      labNom.htmlFor = "rep-nombre";
      const nombre = el("input"); nombre.id = "rep-nombre"; nombre.type = "text"; nombre.maxLength = 80;
      nombre.placeholder = "Ej.: Siciliana Najdorf";
      nombre.style.flex = "1"; nombre.style.minWidth = "10rem";
      nombre.style.background = "var(--bg-panel)"; nombre.style.color = "var(--text)"; nombre.style.border = "1px solid var(--line)"; nombre.style.borderRadius = "8px"; nombre.style.padding = ".45rem .6rem"; nombre.style.font = "inherit";
      filaNombre.append(labNom, nombre);

      const aviso = el("p", "round-status bad");
      aviso.id = "rep-aviso";
      aviso.setAttribute("role", "status");
      const fin = el("div", "round-controls");
      const guardar = boton("Guardar en mi repertorio", "bctrl primary"); guardar.id = "rep-guardar";
      const cancelar = boton("Cancelar", "bctrl");
      cancelar.addEventListener("click", cerrarEditor);
      fin.append(guardar, cancelar);
      editor.append(tit, filaColor, filaDesde, tablero, jug, filaEscribir, ctrl, filaNombre, aviso, fin);

      guardar.addEventListener("click", async () => {
        const v = validar(ed.jugadas);
        if (!v.ok) { aviso.textContent = v.error; return; }
        if (!ed.jugadas.some((_, i) => esMia(ed.color, i))) { aviso.textContent = "La línea no tiene ninguna jugada tuya."; return; }
        const c = choque(lineas, ed.color, v.jugadas);
        if (c) { aviso.textContent = mensajeChoque(c); return; }
        const nom = nombre.value.trim();
        if (!nom) { aviso.textContent = "Ponle un nombre a la línea."; nombre.focus(); return; }
        guardar.disabled = true;
        const { data, error } = await o.sb.from("repertorio").insert({ color: ed.color, nombre: nom, jugadas: v.jugadas })
          .select("id, color, nombre, jugadas, created_at").single();
        guardar.disabled = false;
        if (error) {
          aviso.textContent = /duplicate|unique|23505/i.test(String(error.message || error.code))
            ? "Esa línea ya está en tu repertorio." : error.message;
          return;
        }
        filas.push(data);
        recalcular(); cerrarEditor(); pintar(); o.alCambiar(lineas);
        o.avisar(`«${nom}» quedó en tu repertorio. El entrenador te la va a pedir de memoria.`);
      });

      function mensajeChoque(c) {
        return `Choca con «${c.linea.nombre}»: en la jugada ${Math.floor(c.indice / 2) + 1} ahí juegas ${aEsp(c.jugada)}. `
          + "Un repertorio tiene una respuesta tuya por posición; si quieres cambiarla, borra primero esa línea.";
      }

      function pintarEditor(enfocarEscribir) {
        const juego = nuevoJuego();
        ed.jugadas.forEach((san) => juego.move(san, { sloppy: true }));
        tablero.innerHTML = "";
        const filasT = ed.color === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
        const cols = ed.color === "w" ? "abcdefgh".split("") : "hgfedcba".split("");
        filasT.forEach((rank) => cols.forEach((f) => {
          const cas = f + rank;
          const b = el("button", "sq " + ((((cas.charCodeAt(0) - 97) + (rank - 1)) % 2 === 1) ? "light" : "dark"));
          b.type = "button";
          b.dataset.square = cas;
          const p = juego.get(cas);
          b.setAttribute("aria-label", cas + (p ? ", " + (p.color === "w" ? "blanca" : "negra") : ""));
          if (p) {
            const s = el("span");
            if (window.PiezaPreferida) window.PiezaPreferida.pintar(s, p.type, p.color);
            else { s.className = p.color === "w" ? "piece-white" : "piece-black"; s.textContent = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" }[p.type]; }
            s.setAttribute("aria-hidden", "true");
            b.appendChild(s);
          }
          if (cas === ed.sel) b.classList.add("selected");
          b.addEventListener("click", () => tocar(cas, juego));
          tablero.appendChild(b);
        }));
        if (window.Coordenadas) window.Coordenadas.aplicar(tablero);
        jug.textContent = ed.jugadas.length ? texto(ed.jugadas, 0) : "Juega las dos partes en el tablero, o escríbelas abajo.";
        deshacer.disabled = !ed.jugadas.length;
        const c = ed.jugadas.length ? choque(lineas, ed.color, ed.jugadas) : null;
        aviso.textContent = c ? mensajeChoque(c) : "";
        if (enfocarEscribir) esc.focus();
      }

      function tocar(cas, juego) {
        if (ed.jugadas.length >= MAX_JUGADAS) { aviso.textContent = `Una línea llega hasta ${MAX_JUGADAS} jugadas.`; return; }
        if (!ed.sel) {
          const p = juego.get(cas);
          if (p && p.color === juego.turn()) { ed.sel = cas; pintarEditor(); }
          return;
        }
        if (cas === ed.sel) { ed.sel = null; pintarEditor(); return; }
        const posibles = juego.moves({ square: ed.sel, verbose: true }).filter((m) => m.to === cas);
        if (!posibles.length) {
          const p = juego.get(cas);
          ed.sel = p && p.color === juego.turn() ? cas : null;
          pintarEditor();
          return;
        }
        // Coronar en una apertura casi no pasa: va dama, y escribiendo se
        // puede elegir otra («e8=C»).
        const m = posibles.find((x) => !x.promotion || x.promotion === "q") || posibles[0];
        const hecha = juego.move({ from: m.from, to: m.to, promotion: m.promotion });
        if (hecha) ed.jugadas.push(hecha.san);
        ed.sel = null;
        pintarEditor();
      }

      pintarEditor();
      tit.focus();
    }
    function cerrarEditor() {
      editor.classList.add("hidden");
      editor.innerHTML = "";
      agregar.setAttribute("aria-expanded", "false");
      agregar.focus();
    }
    agregar.addEventListener("click", () => (editor.classList.contains("hidden") ? abrirEditor() : cerrarEditor()));
    repasar.addEventListener("click", () => {
      const toca = lineas.filter((L) => /hoy|sin empezar/.test(o.cuando(L.id)));
      if (toca.length) o.entrenar(toca[0].id);
    });

    pintar();
    return { lineas: () => lineas, pintar };
  }

  const api = { PREFIJO, MAX_JUGADAS, validar, choque, arbol, leerTexto, aLinea, montar };
  if (typeof window !== "undefined") window.RepertorioAperturas = api;
  if (typeof module !== "undefined") module.exports = api;
})();
