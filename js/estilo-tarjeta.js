/* ===== Ajedrez Integral — El estilo y la apertura sugerida, en pantalla =====
 *
 * Una sola copia de lo que se pinta de la prueba de estilo, para las dos
 * puertas que la muestran:
 *   - la página de la prueba (entreno/estilo.html), al alumno, al terminar y
 *     en su portada;
 *   - Informes, a su profe, dentro de «Sus aperturas» (js/informes.js).
 *
 * El perfil NO se guarda: se vuelve a calcular de las respuestas con la regla
 * de su versión (js/estilo-perfil.js), así que mejora solo cuando se calibra
 * el banco. La recomendación SÍ es la guardada (el acta de lo que se le dijo
 * ese día): es la que se sigue después.
 *
 *   EstiloTarjeta.cargar() → Promise        (los módulos que hacen falta, a pedido)
 *   EstiloTarjeta.pintarPerfil(caja, perfil, { tu, opinar, respuestas })
 *     `respuestas`: las de la prueba; debajo de cada eje, «Por qué»: las
 *     posiciones de SU prueba que lo muestran (EstiloPerfil.ejemplos), cada
 *     una escrita y en un tablero (js/visor-linea.js, a pedido).
 *   EstiloTarjeta.pintarRecomendacion(caja, rec, { tu, base, repertorio, modelos })
 *     `modelos`: «Ver una partida modelo» en cada apertura (js/estilo-modelos.js,
 *     a pedido: una partida de maestros ganada con ella).
 *     `repertorio(op, color)` → Promise<texto>: el botón «Agregar a Mi
 *     repertorio» de cada apertura (solo en la página del alumno).
 *   EstiloTarjeta.seguir(caja, { sb, alumnoId, pruebaId, recomendacion, desde, tu })
 *     y guarda la cuenta en estilo_seguimiento (el aviso a su profe a las 5
 *     partidas; si mira el profe, queda visto).
 *   EstiloTarjeta.contarEnSilencio({ sb, alumnoId, pruebaId, recomendacion, desde })
 *     lo mismo sin pintar nada, una vez por día como mucho (al abrir la prueba).
 *   EstiloTarjeta.montarProfe(contenedor, { sb, alumnoId, nombre, yo, puedeEscribir })
 *   EstiloTarjeta.montarClase(contenedor, { sb, alumnos: [{ id, nombre }] })
 *   EstiloTarjeta.botonFicha(prueba, perfil, { nombre, tu }) → el botón que
 *     baja la ficha en PDF (js/estilo-ficha-pdf.js, que se carga al tocarlo)
 *     (Informes, tema «Prueba de estilo»: el estilo de cada alumno, el mapa
 *     de la clase en dos ejes con sus grupos y las parejas de estilo opuesto,
 *     y si la prueba funciona, con estilo_salud())
 *
 * La opinión del profe («¿Coincide con lo que ves?», debajo de cada eje) se
 * guarda en estilo_opiniones y entra al perfil con el peso de dos preguntas
 * (js/estilo-perfil.js). La recomendación guardada no cambia (es el acta de
 * ese día): debajo se dice qué se le recomendaría hoy con lo que ve.
 *
 * Y «Un plan de 4 semanas» (EstiloAperturas.plan): una tarea por semana con
 * cada apertura recomendada y una de repaso. El profe lo ve, saca las semanas
 * que no quiere, cambia los minutos y lo manda con crear_tarea() (que, como
 * siempre, solo deja mandarle a sus alumnos).
 */
(function () {
  "use strict";

  const MODULOS = [["vendor/chess.js", "Chess"], ["estilo-medidas.js", "EstiloMedidas"], ["estilo-items.js", "EstiloItems"],
    ["estilo-perfil.js", "EstiloPerfil"], ["aperturas-lineas.js", "AperturasLineas"], ["estilo-aperturas.js", "EstiloAperturas"],
    ["preparacion-lineas.js", "PreparacionLineas"], ["estilo-partidas.js", "EstiloPartidas"], ["analisis-alumno.js", "AnalisisAlumno"]];
  // Los módulos viven al lado de este archivo (vale desde Informes, en la
  // raíz, y desde entreno/estilo.html).
  const ESTE = document.currentScript && document.currentScript.src;
  let cargando = null;
  function cargar() {
    if (cargando) return cargando;
    const base = ESTE ? new URL("./", ESTE) : new URL("js/", document.baseURI);
    cargando = MODULOS.reduce((p, [nombre, global]) => p.then(() => {
      if (typeof window[global] !== "undefined") return null;
      return new Promise((ok, mal) => {
        const sc = document.createElement("script");
        sc.src = new URL(nombre, base).href;
        sc.onload = ok;
        sc.onerror = () => mal(new Error("no se pudo cargar " + nombre));
        document.body.appendChild(sc);
      });
    }), Promise.resolve()).catch((e) => { cargando = null; throw e; });
    return cargando;
  }

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  const H3 = "font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-2";
  const TXT = "text-sm text-brand-700 dark:text-brand-200";
  const SUB = "text-xs text-brand-450 dark:text-brand-350";
  const BOTON = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60";
  const ENLACE = "font-semibold text-brand-800 dark:text-white underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const fecha = (iso) => (window.HoraCR ? HoraCR.fecha(iso, { day: "numeric", month: "long", year: "numeric" })
    : new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }));
  const pct = (x) => Math.round(100 * x);
  const lineaEs = (sec) => (window.PreparacionLineas ? PreparacionLineas.lineaEs(sec) : sec.join(" "));

  /* ---------------- El perfil ---------------- */
  /* Un módulo más, a pedido (el visor de líneas, las partidas modelo): al
     lado de este archivo, como los de MODULOS. */
  const pedidos = {};
  function cargarUno(nombre, global) {
    if (window[global]) return Promise.resolve();
    if (pedidos[nombre]) return pedidos[nombre];
    const base = ESTE ? new URL("./", ESTE) : new URL("js/", document.baseURI);
    pedidos[nombre] = new Promise((ok, mal) => {
      const sc = document.createElement("script");
      sc.src = new URL(nombre, base).href;
      sc.onload = ok;
      sc.onerror = () => { delete pedidos[nombre]; mal(new Error("no se pudo cargar " + nombre)); };
      document.body.appendChild(sc);
    });
    return pedidos[nombre];
  }

  /* Un botón que abre (y cierra) un tablero para recorrer una línea
     (js/visor-linea.js), debajo de él. `linea()` → { jugadas, desde,
     orientacion, titulo, notas, en }, o una promesa de eso. */
  function botonTablero(texto, linea, nombre) {
    const d = el("div", "mt-2");
    const b = el("button", "text-sm font-semibold text-brand-800 dark:text-white underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto);
    b.type = "button";
    const id = "tablero-" + Math.random().toString(36).slice(2, 8);
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-controls", id);
    const caja = el("div", "mt-2 max-w-sm hidden");
    caja.id = id;
    const st = el("p", SUB);
    st.setAttribute("role", "status");
    let visor = null;
    b.addEventListener("click", async () => {
      const abrir = caja.classList.contains("hidden");
      caja.classList.toggle("hidden", !abrir);
      b.setAttribute("aria-expanded", abrir ? "true" : "false");
      if (!abrir || visor) return;
      st.textContent = "Cargando el tablero…";
      try {
        await cargarUno("visor-linea.js", "VisorLinea");
        const l = await linea();
        visor = VisorLinea.montar(caja, { nombre: nombre || "Tablero" });
        visor.cargar(l.jugadas, { desde: l.desde, orientacion: l.orientacion, titulo: l.titulo, notas: l.notas, en: l.en });
        st.textContent = "";
      } catch (e) {
        st.textContent = "No se pudo abrir el tablero: " + (e && e.message ? e.message : e);
      }
    });
    d.append(b, st, caja);
    return d;
  }

  /* SAN en español (Cf3, Axb5): la de la preparación si está cargada. */
  const sanEs = (san) => (window.PreparacionLineas && PreparacionLineas.sanEs ? PreparacionLineas.sanEs(san)
    : String(san).replace(/^[NBRQK]/, (p) => ({ N: "C", B: "A", R: "T", Q: "D", K: "R" })[p]).replace(/=([NBRQ])/, (_, p) => "=" + ({ N: "C", B: "A", R: "T", Q: "D" })[p]));

  /* «Por qué»: las posiciones de su prueba que muestran lo que dice el eje
     (EstiloPerfil.ejemplos). Cada una, escrita («Elegiste Cxe5 —atacar al
     rey— y no a4 —maniobrar—») y en un tablero que arranca en la posición y
     sigue con la jugada que eligió y la línea del motor. */
  function porQue(e, ejemplos, tu) {
    const B = window.EstiloItems;
    const lista = ejemplos && ejemplos[e];
    if (!lista || !lista.length) return null;
    const det = el("details", "mt-3");
    det.setAttribute("data-estilo-por-que", e);
    det.appendChild(el("summary", "text-sm font-semibold text-brand-800 dark:text-white cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
      tu ? "Por qué: lo que elegiste" : "Por qué: lo que eligió"));
    lista.forEach((x, i) => {
      const it = x.item;
      const elegida = it[x.eleccion], otra = it[x.eleccion === "a" ? "b" : "a"];
      const nombre = (polo) => B.EJES[e].polos[polo].toLowerCase();
      const caja = el("div", "mt-2");
      caja.setAttribute("data-ejemplo", it.id);
      const juegan = it.fen.split(" ")[1] === "w" ? "las blancas" : "las negras";
      caja.appendChild(el("p", TXT, "Posición " + (i + 1) + " (juegan " + juegan + "): " + (tu ? "elegiste " : "eligió ") + sanEs(elegida.san)
        + " —" + nombre(x.polo) + "— y no " + sanEs(otra.san) + " —" + nombre(x.otroPolo) + "—. Para el motor valen casi lo mismo."));
      caja.appendChild(botonTablero("Verla en el tablero", () => {
        // La jugada elegida y la línea del motor que la sigue, en SAN.
        const g = new Chess(it.fen);
        const jugadas = [];
        for (const u of elegida.linea || [elegida.uci]) {
          const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
          if (!m) break;
          jugadas.push(m.san);
        }
        return {
          jugadas, desde: it.fen, orientacion: it.fen.split(" ")[1], en: 0,
          titulo: (tu ? "Elegiste " : "Eligió ") + sanEs(elegida.san) + " (" + nombre(x.polo) + ")",
          notas: [(tu ? "Tu jugada. " : "Su jugada. ") + "La otra era " + sanEs(otra.san) + " (" + nombre(x.otroPolo) + "). Lo que sigue es la línea del motor."],
        };
      }, "Tablero de la posición"));
      det.appendChild(caja);
    });
    return det;
  }

  /* «Ver una partida modelo»: la de js/estilo-modelos.js para esa apertura. */
  function botonModelo(op, color) {
    return botonTablero("Ver una partida modelo", async () => {
      await cargarUno("estilo-modelos.js", "EstiloModelos");
      const m = window.EstiloModelos[op.id];
      if (!m) throw new Error("esta apertura todavía no tiene partida modelo");
      const res = { "1-0": "ganan las blancas", "0-1": "ganan las negras", "1/2-1/2": "tablas" }[m.resultado] || "";
      return {
        jugadas: m.jugadas, en: (op.jugadas || []).length,
        orientacion: color === "b" ? "b" : "w",
        titulo: m.blancas + " – " + m.negras + (m.evento ? " (" + m.evento + ")" : "") + (res ? ", " + res : ""),
      };
    }, "Tablero de la partida modelo");
  }

  function pintarPerfil(caja, perfil, o) {
    const tu = !!(o && o.tu);
    const B = window.EstiloItems;
    const lista = el("div", "space-y-3");
    lista.setAttribute("data-estilo-perfil", "");
    // `respuestas`: las de la prueba, para «Por qué» (las posiciones que lo muestran).
    const ejemplos = o && o.respuestas ? EstiloPerfil.ejemplos(o.respuestas, perfil) : null;
    // Los ejes de SU prueba: una de la versión 1 no tiene el cuarto.
    for (const e of perfil.lista || EstiloPerfil.EJES) {
      const x = perfil[e];
      const [uno, otro] = EstiloMedidas.POLOS[e];
      const fila = el("div", "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4");
      fila.setAttribute("data-eje", e);
      fila.setAttribute("data-etiqueta", x.etiqueta.tipo);
      const cab = el("div", "flex flex-wrap items-baseline justify-between gap-2 mb-2");
      cab.append(el("p", "font-semibold text-brand-800 dark:text-white text-sm", B.EJES[e].nombre), el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200", x.etiqueta.texto));
      fila.appendChild(cab);
      // La barra: el punto es la tendencia y la franja, su margen. El dato
      // va también escrito debajo (el color nunca va solo). Contraste medido
      // (WCAG, 3:1 para lo que no es texto), en claro: franja brand-900 sobre
      // la barra brand-100 12,8:1, punto accent-700 3,3:1 sobre la franja y
      // 3,9:1 sobre la barra; en oscuro: franja brand-400 sobre brand-800
      // 3,4:1, punto accent-100 3,8:1 y 13,1:1. Los acentos claros contra la
      // barra gris daban 1,2:1: la franja no se veía.
      const extremos = el("div", "flex justify-between " + SUB + " mb-1");
      extremos.append(el("span", null, B.EJES[e].polos[otro]), el("span", null, B.EJES[e].polos[uno]));
      const barra = el("div", "relative w-full h-3 bg-brand-100 dark:bg-brand-800 rounded-full");
      barra.setAttribute("aria-hidden", "true");
      const franja = el("div", "absolute top-0 h-3 bg-brand-900 dark:bg-brand-400 rounded-full");
      franja.style.left = pct(x.lo) + "%";
      franja.style.width = Math.max(1, pct(x.hi) - pct(x.lo)) + "%";
      const punto = el("div", "absolute -top-1 w-5 h-5 -ml-2.5 rounded-full bg-accent-700 dark:bg-accent-100 border-2 border-white dark:border-brand-900");
      punto.style.left = pct(x.p) + "%";
      barra.append(franja, punto);
      fila.append(extremos, barra, el("p", SUB + " mt-2", EstiloPerfil.frase(e, x, tu)));
      if (ejemplos) { const pq = porQue(e, ejemplos, tu); if (pq) fila.appendChild(pq); }
      if (o && o.opinar) fila.appendChild(botonesOpinion(e, o.opinar));
      lista.appendChild(fila);
    }
    caja.appendChild(lista);
    const c = perfil.controles;
    if (c && c.total) {
      caja.appendChild(el("p", SUB + " mt-2", c.fallados
        ? `En ${c.fallados} de las ${c.total} posiciones de control ${tu ? "elegiste" : "eligió"} distinto la segunda vez: parte de las respuestas fueron al azar, y por eso los márgenes son más anchos.`
        : `En las ${c.total} posiciones de control ${tu ? "elegiste" : "eligió"} lo mismo las dos veces: ${tu ? "contestaste" : "contestó"} lo que ${tu ? "prefieres" : "prefiere"}.`));
    }
  }

  /* «¿Coincide con lo que ves?»: tres botones, el elegido con aria-pressed y
     con «✓» escrito (el color nunca va solo). */
  const OPINION_BTN = "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60";
  const OPINION_SI = " bg-brand-800 text-white border-brand-800 dark:bg-brand-200 dark:text-brand-900 dark:border-brand-200";
  const OPINION_NO = " bg-white text-brand-800 border-brand-300 hover:bg-brand-50 dark:bg-brand-900 dark:text-brand-100 dark:border-brand-600 dark:hover:bg-brand-800";
  function botonesOpinion(e, op) {
    const B = window.EstiloItems;
    const [uno, otro] = EstiloMedidas.POLOS[e];
    const caja = el("div", "mt-3");
    caja.setAttribute("data-opinion-eje", e);
    const id = "opinion-" + e + "-" + Math.random().toString(36).slice(2, 8);
    const titulo = el("p", TXT + " font-semibold mb-1", "¿Coincide con lo que ves?");
    titulo.id = id;
    const grupo = el("div", "flex flex-wrap gap-2");
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-labelledby", id);
    const estado = el("p", SUB + " mt-1");
    estado.setAttribute("role", "status");
    const actual = op.mias ? op.mias[e] : undefined;
    for (const [valor, texto] of [[1, B.EJES[e].polos[uno]], [0, "Las dos por igual"], [-1, B.EJES[e].polos[otro]]]) {
      const si = actual === valor;
      const b = el("button", OPINION_BTN + (si ? OPINION_SI : OPINION_NO), (si ? "✓ " : "") + texto);
      b.type = "button";
      b.setAttribute("aria-pressed", si ? "true" : "false");
      b.setAttribute("data-opinion", String(valor));
      b.addEventListener("click", async () => {
        grupo.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        estado.textContent = "Guardando…";
        try { await op.guardar(e, valor); }
        catch (err) {
          estado.textContent = "No se pudo guardar: " + (err && err.message ? err.message : err);
          grupo.querySelectorAll("button").forEach((x) => { x.disabled = false; });
        }
      });
      grupo.appendChild(b);
    }
    caja.append(titulo, grupo, estado);
    if (actual === undefined) caja.appendChild(el("p", SUB + " mt-1", "Lo que marques cuenta como dos preguntas más en su perfil."));
    return caja;
  }

  /* ---------------- La recomendación ---------------- */
  function tarjetaOpcion(op, titulo, o) {
    const d = el("div", "mt-2");
    d.append(el("p", TXT + " font-semibold", titulo + ": " + op.nombre), el("p", SUB, lineaEs(op.jugadas)));
    const ul = el("ul", "list-disc pl-5 mt-1 space-y-1 " + TXT);
    op.porque.forEach((t) => ul.appendChild(el("li", null, t)));
    d.appendChild(ul);
    if (o && o.base != null) {
      const a = el("a", ENLACE + " text-sm inline-block mt-1", "Practicarla en Aperturas y celadas");
      a.href = o.base + "entreno/aperturas.html?linea=" + encodeURIComponent(op.id);
      d.appendChild(a);
    }
    if (o && o.modelos) { const m = botonModelo(op, o.color); m.setAttribute("data-modelo", op.id); d.appendChild(m); }
    return d;
  }
  function pintarRecomendacion(caja, rec, o) {
    const tu = !!(o && o.tu);
    const cont = el("div", "space-y-3");
    cont.setAttribute("data-estilo-recomendacion", "");
    for (const g of ["blancas", "e4", "d4"]) {
      const r = rec && rec[g];
      if (!r) continue;
      const card = el("div", "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4");
      card.setAttribute("data-grupo", g);
      card.appendChild(el("p", "font-serif font-bold text-brand-800 dark:text-white", r.titulo));
      if (r.mantener) card.appendChild(el("p", TXT + " mt-1", tu ? "Sigue con la tuya: te queda casi igual de bien que la mejor, y cambiar de apertura cuesta meses." : "Que siga con la suya: le queda casi igual de bien que la mejor, y cambiar de apertura cuesta meses."));
      // El color de quien la juega: el tablero de la partida modelo, desde su lado.
      const oc = Object.assign({}, o, { color: g === "blancas" ? "w" : "b" });
      card.appendChild(tarjetaOpcion(r.principal, r.mantener ? (tu ? "La tuya" : "La suya") : (tu ? "Te recomendamos" : "Le recomendamos"), oc));
      if (r.alternativa) card.appendChild(tarjetaOpcion(r.alternativa, "Otra opción", oc));
      if (o && o.repertorio) card.appendChild(botonRepertorio(r.principal, g === "blancas" ? "w" : "b", o.repertorio));
      cont.appendChild(card);
    }
    caja.appendChild(cont);
  }

  /* «Agregar a Mi repertorio»: la línea recomendada, a su repertorio. Lo que
     pasa lo dice la página que guarda (ya estaba, choca con otra línea…). */
  function botonRepertorio(op, color, guardar) {
    const d = el("div", "mt-3");
    const b = el("button", BOTON, "Agregar a Mi repertorio");
    b.type = "button";
    b.setAttribute("data-repertorio", op.id);
    const st = el("p", SUB + " mt-1");
    st.setAttribute("role", "status");
    b.addEventListener("click", async () => {
      b.disabled = true;
      st.textContent = "Guardando…";
      try { st.textContent = await guardar(op, color); }
      catch (e) { st.textContent = "No se pudo: " + (e && e.message ? e.message : e); b.disabled = false; }
    });
    d.append(b, st);
    return d;
  }

  /* «Un plan de 4 semanas», para el profe. */
  function pintarPlan(caja, rec, o) {
    const sec = el("div", "mt-4 bg-white dark:bg-brand-900 rounded-xl shadow-md p-4");
    sec.setAttribute("data-estilo-plan", "");
    const id = "plan-" + Math.random().toString(36).slice(2, 8);
    const abrir = el("button", BOTON, "Armar un plan de 4 semanas");
    abrir.type = "button";
    abrir.setAttribute("aria-expanded", "false");
    abrir.setAttribute("aria-controls", id);
    const cuerpo = el("div", "mt-3 hidden");
    cuerpo.id = id;
    sec.append(el("p", TXT + " mb-2", "Una tarea por semana con cada apertura que se le recomendó (la línea en Aperturas y celadas y un rato de práctica) y una de repaso. Cada una aparece el día que empieza."), abrir, cuerpo);
    abrir.addEventListener("click", () => {
      const abierto = cuerpo.classList.toggle("hidden") === false;
      abrir.setAttribute("aria-expanded", abierto ? "true" : "false");
      if (abierto && !cuerpo.childNodes.length) armar();
    });
    function armar() {
      const fila = el("div", "flex flex-wrap items-center gap-2 mb-3");
      const lab = el("label", TXT, "Minutos de práctica por semana");
      const inp = el("input", "w-20 px-2 py-1 rounded-lg border border-brand-300 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-white text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
      inp.type = "number"; inp.min = "5"; inp.max = "120"; inp.step = "5"; inp.value = "20";
      inp.id = id + "-min";
      lab.htmlFor = inp.id;
      fila.append(lab, inp);
      const lista = el("ul", "space-y-3");
      const enviar = el("button", BOTON + " mt-3", "Mandar el plan");
      enviar.type = "button";
      enviar.setAttribute("data-plan-mandar", "");
      const st = el("p", SUB + " mt-2");
      st.setAttribute("role", "status");
      let semanas = [];
      const pintar = () => {
        const marcadas = new Set([...lista.querySelectorAll("input[type=checkbox]")].filter((c) => !c.checked).map((c) => c.value));
        semanas = EstiloAperturas.plan(rec, { minutos: +inp.value || 20 });
        lista.textContent = "";
        for (const s of semanas) {
          const li = el("li", "flex gap-2 items-start");
          li.setAttribute("data-plan-semana", String(s.semana));
          const cb = el("input", "mt-1 h-4 w-4");
          cb.type = "checkbox"; cb.value = String(s.semana); cb.checked = !marcadas.has(String(s.semana));
          cb.id = id + "-s" + s.semana;
          const lb = el("label", TXT);
          lb.htmlFor = cb.id;
          const cuando = (s.desde ? "Desde el " + fecha(s.desde) : "Desde hoy") + ", vence el " + fecha(s.vence);
          lb.append(el("span", "font-semibold block", s.titulo), el("span", SUB + " block", cuando),
            el("span", "block", s.items.map((it) => it.meta_tipo === "minutos"
              ? it.meta_cantidad + " minutos de práctica en Aperturas y celadas"
              : "Terminar la línea «" + it.filtro_label + "» en Aperturas y celadas").join(" · ")));
          li.append(cb, lb);
          lista.appendChild(li);
        }
        const n = semanas.filter((s) => lista.querySelector("#" + id + "-s" + s.semana).checked).length;
        enviar.textContent = "Mandar el plan (" + n + (n === 1 ? " tarea)" : " tareas)");
        enviar.disabled = !n;
      };
      inp.addEventListener("change", pintar);
      lista.addEventListener("change", pintar);
      enviar.addEventListener("click", async () => {
        const elegidas = semanas.filter((s) => lista.querySelector("#" + id + "-s" + s.semana).checked);
        enviar.disabled = true;
        let hechas = 0;
        for (const s of elegidas) {
          st.textContent = "Mandando la semana " + s.semana + "…";
          const { error } = await o.sb.rpc("crear_tarea", {
            p_alumnos: [o.alumnoId], p_titulo: s.titulo, p_instrucciones: s.instrucciones,
            p_vence: s.vence, p_items: s.items, p_disponible_desde: s.desde,
          });
          if (error) { st.textContent = "Se mandaron " + hechas + " de " + elegidas.length + "; la semana " + s.semana + " no: " + error.message; enviar.disabled = false; return; }
          hechas++;
        }
        st.textContent = "Plan mandado: " + hechas + (hechas === 1 ? " tarea" : " tareas") + ". Las sigues en Tareas.";
      });
      cuerpo.append(fila, lista, enviar, st);
      pintar();
    }
    caja.appendChild(sec);
  }

  /* La ficha en PDF: el generador y la marca se cargan recién al pedirla. */
  const MODULOS_PDF = ["reporte-pdf.js", "marca-agua.js", "estilo-ficha-pdf.js"];
  function cargarPdf() {
    const base = ESTE ? new URL("./", ESTE) : new URL("js/", document.baseURI);
    return MODULOS_PDF.reduce((p, nombre) => p.then(() => {
      const global = { "reporte-pdf.js": "ReportePDF", "marca-agua.js": "MarcaAgua", "estilo-ficha-pdf.js": "EstiloFichaPDF" }[nombre];
      if (window[global]) return null;
      return new Promise((ok, mal) => {
        const sc = document.createElement("script");
        sc.src = new URL(nombre, base).href;
        sc.onload = ok;
        sc.onerror = () => mal(new Error("no se pudo cargar " + nombre));
        document.body.appendChild(sc);
      });
    }), Promise.resolve()).then(() => new URL("../", base).href);
  }
  function botonFicha(prueba, perfil, o) {
    const d = el("div", "mt-3");
    const b = el("button", BOTON, "Bajar la ficha en PDF");
    b.type = "button";
    b.setAttribute("data-estilo-ficha", "");
    const st = el("p", SUB + " mt-1");
    st.setAttribute("role", "status");
    b.addEventListener("click", async () => {
      b.disabled = true;
      st.textContent = "Armando el PDF…";
      try {
        const raiz = await cargarPdf();
        const r = await EstiloFichaPDF.descargar(prueba, perfil, Object.assign({ raiz, lineaEs: window.PreparacionLineas ? PreparacionLineas.lineaEs : null }, o));
        st.textContent = "Listo: " + r.nombre + ".";
      } catch (e) { st.textContent = "No se pudo armar el PDF: " + (e && e.message ? e.message : e); }
      b.disabled = false;
    });
    d.append(b, st);
    return d;
  }

  /* ---------------- El seguimiento ---------------- */
  /* Cuántas partidas jugó con cada apertura recomendada desde la prueba: baja
     sus partidas de Lichess y Chess.com (EstiloPartidas.seguimiento). null si
     no tiene cuentas. */
  async function contarSeguimiento(o, alAvanzar) {
    await cargar();
    const { data } = await o.sb.from("analisis_partidas_alumno").select("lichess, chesscom").eq("alumno_id", o.alumnoId).maybeSingle();
    if (!data || !(data.lichess || data.chesscom)) return null;
    await AnalisisAlumno.cargarModulos();
    const D = window.PreparacionDescarga, A = window.PreparacionAnalisis;
    const cuentas = [["lichess", data.lichess], ["chesscom", data.chesscom]].filter(([, u]) => u);
    const principal = cuentas[0][1];
    let texto = "";
    for (const [sitio, usuario] of cuentas) {
      const t = await D.descargar({ sitio, usuario, maximo: AnalisisAlumno.MAXIMO, alAvanzar: (n) => alAvanzar && alAvanzar(n) });
      texto += (texto ? "\n\n" : "") + (usuario === principal ? t : D.unirCuentas(t, usuario, principal));
    }
    return EstiloPartidas.seguimiento(A.leerPgn(texto), principal, o.recomendacion, String(o.desde).slice(0, 10));
  }

  /* La cuenta, guardada (public.estilo_seguimiento): de ahí sale el aviso a
     su profe cuando alguna llega a 5. Si quien la mira es su profe
     (`revisado`), el aviso queda visto: ya vio cómo le fue. La base decide
     cuándo llegó a 5 y quién lo revisó. Si no se puede guardar, el resultado
     igual se muestra. */
  async function guardarSeguimiento(o, s, revisado) {
    if (!o.pruebaId || !s) return;
    const partidas = {};
    for (const g of ["blancas", "e4", "d4"]) if (s[g]) partidas[g] = s[g].despues.n;
    const fila = { alumno_id: o.alumnoId, prueba_id: o.pruebaId, partidas };
    if (revisado) fila.revisado_at = new Date().toISOString();
    try { await o.sb.from("estilo_seguimiento").upsert(fila, { onConflict: "alumno_id" }); } catch (e) { /* el aviso es un extra */ }
  }

  async function seguir(caja, o) {
    caja.textContent = "";
    const estado = el("p", SUB, "Buscando las cuentas de Lichess y Chess.com…");
    estado.setAttribute("role", "status");
    caja.appendChild(estado);
    const s = await contarSeguimiento(o, (n) => { estado.textContent = "Bajando partidas: " + n; });
    if (!s) {
      estado.textContent = o.tu ? "Para seguirla hacen falta tus usuarios de Lichess o Chess.com: ponlos en Configuración." : "Para seguirla hacen falta sus usuarios de Lichess o Chess.com (Configuración, o «Sus aperturas» más arriba).";
      return;
    }
    estado.textContent = "";
    const ul = el("ul", "list-disc pl-5 space-y-1 " + TXT);
    ul.setAttribute("data-estilo-seguimiento", "");
    for (const g of ["blancas", "e4", "d4"]) if (s[g]) ul.appendChild(el("li", null, EstiloPartidas.fraseSeguimiento(s[g], o.tu)));
    caja.appendChild(ul);
    await guardarSeguimiento(o, s, !o.tu);
  }

  /* Sin que nadie apriete nada: al abrir su prueba, el navegador del alumno
     vuelve a contar, una vez por día como mucho, en segundo plano. Así el
     aviso a su profe llega aunque nadie mire «¿Cómo me fue?». */
  const CADA_CUANTO_CONTAR = 864e5;
  async function contarEnSilencio(o) {
    if (!o.pruebaId || !o.recomendacion) return false;
    const { data, error } = await o.sb.from("estilo_seguimiento").select("prueba_id, updated_at").eq("alumno_id", o.alumnoId).maybeSingle();
    if (error) return false;
    if (data && data.prueba_id === o.pruebaId && Date.now() - Date.parse(data.updated_at) < CADA_CUANTO_CONTAR) return false;
    const s = await contarSeguimiento(o);
    if (!s) return false;
    await guardarSeguimiento(o, s, false);
    return true;
  }

  /* ---------------- Para el profe (Informes) ---------------- */
  async function montarProfe(contenedor, o) {
    if (!contenedor || !o || !o.sb || !o.alumnoId) return;
    const turno = String(Math.random());
    contenedor.dataset.turno = turno;
    contenedor.textContent = "";
    const estado = el("p", SUB, "Cargando…");
    estado.setAttribute("role", "status");
    contenedor.appendChild(estado);
    await cargar();
    const [{ data, error }, op] = await Promise.all([
      o.sb.from("estilo_pruebas").select("id, version, respuestas, contexto, partidas, recomendacion, created_at")
        .eq("alumno_id", o.alumnoId).order("created_at", { ascending: false }).range(0, 4),
      o.sb.from("estilo_opiniones").select("profesor_id, eje, opinion").eq("alumno_id", o.alumnoId),
    ]);
    const opiniones = (op && op.data) || [];
    if (contenedor.dataset.turno !== turno) return;
    contenedor.textContent = "";
    contenedor.appendChild(el("h3", H3.replace("mt-4", "mt-0"), "Su estilo de juego y la apertura sugerida"));
    if (error) { contenedor.appendChild(el("p", SUB, "No se pudo leer su prueba de estilo.")); return; }
    if (!data || !data.length) {
      contenedor.appendChild(el("p", SUB, "Todavía no hizo la prueba de estilo (Entrenamiento → Tu estilo de juego). Con ella se ve qué tipo de partida prefiere y qué aperturas le quedan."));
      return;
    }
    const ultima = data[0];
    contenedor.appendChild(el("p", SUB, "Prueba del " + fecha(ultima.created_at) + "."));
    const perfil = EstiloPerfil.medir(ultima.respuestas, ultima.partidas, ultima.version, opiniones);
    const mias = {};
    opiniones.filter((x) => x.profesor_id === o.yo).forEach((x) => { mias[x.eje] = x.opinion; });
    const opinar = o.puedeEscribir && o.yo ? {
      mias,
      async guardar(eje, opinion) {
        const { error: e } = await o.sb.from("estilo_opiniones").upsert({ alumno_id: o.alumnoId, profesor_id: o.yo, eje, opinion }, { onConflict: "alumno_id,profesor_id,eje" });
        if (e) throw e;
        // Se vuelve a pintar con la opinión nueva, y el foco vuelve al botón.
        await montarProfe(contenedor, o);
        const b = contenedor.querySelector('[data-opinion-eje="' + eje + '"] [data-opinion="' + opinion + '"]');
        if (b) b.focus();
        const st = contenedor.querySelector('[data-opinion-eje="' + eje + '"] [role="status"]');
        if (st) st.textContent = "Guardado: ya cuenta en su perfil.";
      },
    } : null;
    pintarPerfil(contenedor, perfil, { tu: false, opinar, respuestas: ultima.respuestas });
    if (ultima.recomendacion) contenedor.appendChild(botonFicha(ultima, perfil, { nombre: o.nombre, tu: false }));
    if (ultima.recomendacion) {
      contenedor.appendChild(el("h3", H3, "Lo que se le recomendó ese día"));
      pintarRecomendacion(contenedor, ultima.recomendacion, { tu: false, base: "", modelos: true });
      const caja = el("div", "mt-3");
      const btn = el("button", BOTON, "Ver cómo le fue desde entonces");
      btn.type = "button";
      btn.setAttribute("data-estilo-seguir", "");
      const res = el("div", "mt-2");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try { await seguir(res, { sb: o.sb, alumnoId: o.alumnoId, pruebaId: ultima.id, recomendacion: ultima.recomendacion, desde: ultima.created_at, tu: false }); }
        catch (e) { res.textContent = "No se pudo: " + (e && e.message ? e.message : e); }
        btn.disabled = false;
      });
      caja.append(btn, res);
      contenedor.appendChild(caja);
      if (o.puedeEscribir) pintarPlan(contenedor, ultima.recomendacion, o);
      // Lo que se le recomendaría hoy, con lo que ven sus profes: el acta de
      // arriba no cambia.
      if (opiniones.some((x) => perfil.lista.includes(x.eje))) {
        const hoy = EstiloAperturas.recomendar(perfil, ultima.contexto || {});
        const cambia = ["blancas", "e4", "d4"].filter((g) => hoy[g] && ultima.recomendacion[g] && hoy[g].principal.id !== ultima.recomendacion[g].principal.id);
        const p = el("p", TXT + " mt-3");
        p.setAttribute("data-estilo-con-opinion", cambia.length ? "cambia" : "igual");
        p.textContent = cambia.length
          ? "Con lo que ven sus profes, hoy le recomendaríamos: " + cambia.map((g) => hoy[g].titulo.toLowerCase() + ", " + hoy[g].principal.nombre).join("; ") + "."
          : "Con lo que ven sus profes, la recomendación sería la misma.";
        contenedor.appendChild(p);
      }
    }
    // Antes y ahora: las pruebas anteriores, eje por eje.
    if (data.length > 1) {
      contenedor.appendChild(el("h3", H3, "Pruebas anteriores"));
      const ul = el("ul", "list-disc pl-5 space-y-1 " + TXT);
      data.slice(1).forEach((p) => {
        const pf = EstiloPerfil.medir(p.respuestas, p.partidas, p.version);
        ul.appendChild(el("li", null, fecha(p.created_at) + ": " + pf.lista.map((e) => pf[e].etiqueta.texto.toLowerCase()).join(" · ") + "."));
      });
      contenedor.appendChild(ul);
    }
  }

  /* ---------------- Toda la clase (Informes, tema «Prueba de estilo») ---------------- */
  const CORTO = { claro: "", tendencia: "algo ", equilibrado: "", "sin definir": "" };
  function etiquetaCorta(e, x) {
    const B = window.EstiloItems;
    if (!x) return "—";
    if (x.etiqueta.tipo === "sin definir") return "sin definir";
    if (x.etiqueta.tipo === "equilibrado") return "equilibrado";
    return CORTO[x.etiqueta.tipo] + B.EJES[e].polos[x.etiqueta.polo].toLowerCase();
  }
  /* Pearson, para ver si lo que contestan y lo que juegan van juntos. */
  function correlacion(xs, ys) {
    const n = xs.length;
    const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    let a = 0, dx = 0, dy = 0;
    xs.forEach((x, i) => { a += (x - mx) * (ys[i] - my); dx += (x - mx) ** 2; dy += (ys[i] - my) ** 2; });
    return dx && dy ? a / Math.sqrt(dx * dy) : null;
  }
  const MIN_REPETIDAS = 20, MIN_PARTIDAS = 8, MIN_CALIBRAR = 30;
  /* Lo que se dice de la salud de la prueba: solo lo que alcanzan los datos.
     `s` es lo que devuelve estilo_salud(). */
  function frasesSalud(s) {
    const B = window.EstiloItems;
    const out = [];
    const ids = B.ITEMS.map((i) => i.id);
    const conMinimo = ids.filter((id) => (s.por_posicion[id] || 0) >= MIN_CALIBRAR).length;
    const menos = Math.min(...ids.map((id) => s.por_posicion[id] || 0));
    out.push({ clave: "calibracion", texto: s.pruebas + (s.pruebas === 1 ? " prueba" : " pruebas") + " de " + s.alumnos + (s.alumnos === 1 ? " alumno" : " alumnos") + ". "
      + (conMinimo === ids.length
        ? "Todas las posiciones tienen " + MIN_CALIBRAR + " respuestas o más: ya se puede calibrar (avísale a administración)."
        : conMinimo + " de las " + ids.length + " posiciones tienen las " + MIN_CALIBRAR + " respuestas que pide la calibración; la que menos tiene, " + menos + ".") });
    const r = s.repeticion || {};
    out.push({ clave: "repeticion", texto: r.comparadas >= MIN_REPETIDAS
      ? "Al repetirla (" + r.pares + (r.pares === 1 ? " vez" : " veces") + ", con 14 días o más entre una y otra), eligieron la misma jugada en el " + Math.round(100 * r.iguales / r.comparadas) + " % de las " + r.comparadas + " posiciones que vieron dos veces. Al azar sería 50 %: mientras más alto, más estable es lo que mide."
      : "Todavía casi nadie la repitió con 14 días o más de diferencia (" + (r.comparadas || 0) + " posiciones vistas dos veces; hacen falta " + MIN_REPETIDAS + " para decir algo)." });
    for (const e of Object.keys(B.EJES)) {
      const filas = (s.partidas || []).filter((x) => x.eje === e);
      const nombre = B.EJES[e].nombre;
      if (filas.length < MIN_PARTIDAS) {
        out.push({ clave: "partidas-" + e, texto: nombre + ": pocas pruebas con partidas para comparar (" + filas.length + "; hacen falta " + MIN_PARTIDAS + ")." });
        continue;
      }
      const c = correlacion(filas.map((x) => +x.prueba), filas.map((x) => +x.partidas));
      const rr = c == null ? "—" : c.toFixed(2).replace(".", ",");
      const dice = c == null ? "no se puede calcular" : c >= 0.3 ? "lo que contestan y lo que juegan van juntos" : c <= -0.3 ? "lo que contestan va al revés de lo que juegan: hay que revisar esas posiciones" : "lo que contestan y lo que juegan casi no se relacionan todavía";
      out.push({ clave: "partidas-" + e, texto: nombre + ": " + dice + " (r = " + rr + ", en " + filas.length + " pruebas con partidas)." });
    }
    return out;
  }

  /* ---------- El mapa de la clase ----------
   * Lo que dice, sin pintar nada (lo comprueba
   * herramientas/verificar-estilo-clase.js). `perfiles`: [{ id, nombre,
   * perfil }], con el perfil de EstiloPerfil.medir() de su última prueba.
   *
   * De qué lado está cada uno en un eje: el primer polo (0), el segundo (1) o
   * ninguno todavía (null), con la misma regla que la etiqueta: solo si TODO
   * su margen queda de un lado. Así nadie entra a un grupo por un 52 %. */
  function lado(x) { return !x ? null : x.lo > 0.5 ? 0 : x.hi < 0.5 ? 1 : null; }

  /* Los cuatro grupos de dos ejes (atacar y abrir, atacar y cerrar…), los que
     están al medio en alguno de los dos y los que no tienen uno de los ejes
     (una prueba de la versión 1 no mide el cuarto). */
  function cuadrantes(perfiles, ex, ey) {
    const P = window.EstiloMedidas.POLOS;
    const grupos = [];
    for (const iy of [0, 1]) for (const ix of [0, 1]) grupos.push({ polos: [P[ex][ix], P[ey][iy]], alumnos: [] });
    const alMedio = [], sinEje = [];
    for (const a of perfiles) {
      const x = a.perfil[ex], y = a.perfil[ey];
      if (!x || !y) { sinEje.push(a.nombre); continue; }
      const lx = lado(x), ly = lado(y);
      if (lx == null || ly == null) { alMedio.push(a.nombre); continue; }
      grupos[ly * 2 + lx].alumnos.push(a.nombre);
    }
    return { grupos, alMedio, sinEje };
  }

  /* Parejas de estilo opuesto, para entrenar juntos: cada uno juega lo que al
     otro no le sale solo. La distancia entre dos es la de sus porcentajes en
     los ejes que tienen los dos; se toman primero los más lejanos, y si sobra
     uno se suma a la pareja de la que está más lejos (un trío). `opuestos`: los
     ejes en que cada uno está de un lado distinto, con todo su margen. */
  function distancia(a, b) {
    const ejes = (a.perfil.lista || []).filter((e) => b.perfil[e]);
    if (!ejes.length) return 0;
    return Math.sqrt(ejes.reduce((s, e) => s + (a.perfil[e].p - b.perfil[e].p) ** 2, 0) / ejes.length);
  }
  function opuestos(grupo) {
    return (grupo[0].perfil.lista || []).filter((e) => {
      const lados = grupo.map((a) => lado(a.perfil[e]));
      return lados.includes(0) && lados.includes(1);
    });
  }
  function parejas(perfiles) {
    const todas = [];
    for (let i = 0; i < perfiles.length; i++) for (let j = i + 1; j < perfiles.length; j++) {
      todas.push({ i, j, d: distancia(perfiles[i], perfiles[j]) });
    }
    // Empates por nombre: con los mismos datos, siempre las mismas parejas.
    const nom = (k) => perfiles[k].nombre;
    todas.sort((x, y) => (y.d - x.d) || nom(x.i).localeCompare(nom(y.i), "es") || nom(x.j).localeCompare(nom(y.j), "es"));
    const libre = perfiles.map(() => true);
    const grupos = [];
    for (const t of todas) {
      if (!libre[t.i] || !libre[t.j]) continue;
      libre[t.i] = libre[t.j] = false;
      grupos.push({ idx: [t.i, t.j], distancia: t.d });
    }
    const queda = libre.indexOf(true);
    if (queda >= 0 && grupos.length) {
      let mejor = null, lejos = -1;
      for (const g of grupos) {
        const d = Math.min(...g.idx.map((k) => distancia(perfiles[k], perfiles[queda])));
        if (d > lejos) { lejos = d; mejor = g; }
      }
      mejor.idx.push(queda);
    }
    return {
      grupos: grupos.map((g) => {
        const gente = g.idx.map((k) => perfiles[k]);
        return { alumnos: gente.map((a) => a.nombre), distancia: g.distancia, opuestos: opuestos(gente) };
      }),
      sola: queda >= 0 && !grupos.length ? perfiles[queda].nombre : null,
    };
  }

  /* El dibujo: un punto por alumno, con su nombre ESCRITO al lado (el color
     no dice nada solo) y su margen como una cruz fina. A la derecha y arriba,
     el primer polo de cada eje. Lo mismo va escrito debajo, en los grupos. */
  const SVG = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, texto) {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (texto != null) e.textContent = texto;
    return e;
  }
  function nombreCorto(nombre, todos) {
    const partes = String(nombre).trim().split(/\s+/);
    const pila = partes[0];
    const iguales = todos.filter((n) => String(n).trim().split(/\s+/)[0] === pila).length;
    return iguales > 1 && partes[1] ? pila + " " + partes[1][0] + "." : pila;
  }
  function dibujarMapa(perfiles, ex, ey) {
    const B = window.EstiloItems, P = window.EstiloMedidas.POLOS;
    const L = 360, M0 = 48, A = L - 2 * M0;
    const X = (p) => M0 + p * A, Y = (p) => M0 + (1 - p) * A;
    const enMapa = perfiles.filter((a) => a.perfil[ex] && a.perfil[ey]);
    const svg = svgEl("svg", { viewBox: "0 0 " + L + " " + L, class: "w-full max-w-md h-auto " + TXT, role: "img",
      "aria-label": "Mapa de la clase: " + B.EJES[ex].nombre.toLowerCase() + " de izquierda a derecha y "
        + B.EJES[ey].nombre.toLowerCase() + " de abajo hacia arriba. Los grupos van escritos debajo." });
    svg.setAttribute("data-estilo-mapa", "");
    svg.appendChild(svgEl("rect", { x: M0, y: M0, width: A, height: A, fill: "none", stroke: "currentColor", "stroke-opacity": "0.35" }));
    svg.appendChild(svgEl("line", { x1: X(0.5), y1: M0, x2: X(0.5), y2: M0 + A, stroke: "currentColor", "stroke-opacity": "0.35", "stroke-dasharray": "4 4" }));
    svg.appendChild(svgEl("line", { x1: M0, y1: Y(0.5), x2: M0 + A, y2: Y(0.5), stroke: "currentColor", "stroke-opacity": "0.35", "stroke-dasharray": "4 4" }));
    const polo = (e, i) => B.EJES[e].polos[P[e][i]];
    const rotulo = (x, y, texto, ancla, extra) => svg.appendChild(svgEl("text", Object.assign({ x, y, "text-anchor": ancla, "font-size": "11", fill: "currentColor", "font-weight": "600" }, extra || {}), texto));
    rotulo(M0 + A, M0 + A + 18, polo(ex, 0) + " →", "end");
    rotulo(M0, M0 + A + 18, "← " + polo(ex, 1), "start");
    rotulo(14, M0, polo(ey, 0) + " →", "end", { transform: "rotate(-90 14 " + M0 + ")" });
    rotulo(14, M0 + A, "← " + polo(ey, 1), "start", { transform: "rotate(-90 14 " + (M0 + A) + ")" });
    const todos = enMapa.map((a) => a.nombre);
    const puestas = [];
    for (const a of enMapa) {
      const x = a.perfil[ex], y = a.perfil[ey];
      const g = svgEl("g", { "data-alumno": a.id });
      g.appendChild(svgEl("line", { x1: X(x.lo), y1: Y(y.p), x2: X(x.hi), y2: Y(y.p), stroke: "currentColor", "stroke-opacity": "0.3" }));
      g.appendChild(svgEl("line", { x1: X(x.p), y1: Y(y.lo), x2: X(x.p), y2: Y(y.hi), stroke: "currentColor", "stroke-opacity": "0.3" }));
      g.appendChild(svgEl("circle", { cx: X(x.p), cy: Y(y.p), r: 4.5, fill: "currentColor" }));
      // El nombre, en diagonal arriba del punto (así no lo cruza la línea del
      // margen), y corrido hacia arriba si pisa otro.
      let ty = Y(y.p) - 7;
      const tx = X(x.p) + (x.p > 0.8 ? -7 : 7);
      while (puestas.some((q) => Math.abs(q.x - tx) < 60 && Math.abs(q.y - ty) < 12)) ty -= 12;
      puestas.push({ x: tx, y: ty });
      g.appendChild(svgEl("text", { x: tx, y: ty, "font-size": "11", fill: "currentColor", "text-anchor": x.p > 0.8 ? "end" : "start" }, nombreCorto(a.nombre, todos)));
      svg.appendChild(g);
    }
    return svg;
  }

  function pintarMapa(caja, perfiles) {
    const B = window.EstiloItems, P = window.EstiloMedidas.POLOS;
    const ejes = Object.keys(B.EJES);
    caja.appendChild(el("h3", H3, "El mapa de la clase"));
    caja.appendChild(el("p", SUB, "Cada punto es un alumno, con su margen. Sirve para armar grupos de una clase de aperturas y parejas para entrenar."));
    const elegir = el("div", "flex flex-wrap gap-3 my-2");
    const sel = (id, texto, valor) => {
      const lab = el("label", "flex items-center gap-2 " + TXT, texto);
      const s = el("select", "bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
      s.setAttribute("data-mapa-eje", id);
      ejes.forEach((e) => { const op = el("option", null, B.EJES[e].nombre); op.value = e; s.appendChild(op); });
      s.value = valor;
      lab.appendChild(s);
      elegir.appendChild(lab);
      return s;
    };
    const sx = sel("x", "De izquierda a derecha:", "ataque");
    const sy = sel("y", "De abajo hacia arriba:", "estructura");
    caja.appendChild(elegir);
    const lienzo = el("div");
    caja.appendChild(lienzo);
    const pintar = () => {
      lienzo.textContent = "";
      const ex = sx.value, ey = sy.value;
      lienzo.appendChild(dibujarMapa(perfiles, ex, ey));
      const c = cuadrantes(perfiles, ex, ey);
      const ul = el("ul", "space-y-1 mt-2 " + TXT);
      ul.setAttribute("data-estilo-grupos", "");
      for (const g of c.grupos) {
        const li = el("li");
        li.appendChild(el("strong", "font-semibold text-brand-800 dark:text-white", B.EJES[ex].polos[g.polos[0]] + " y " + B.EJES[ey].polos[g.polos[1]].toLowerCase() + ": "));
        li.appendChild(document.createTextNode(g.alumnos.length ? g.alumnos.join(", ") : "nadie"));
        ul.appendChild(li);
      }
      if (c.alMedio.length) {
        const li = el("li");
        li.appendChild(el("strong", "font-semibold text-brand-800 dark:text-white", "Al medio o sin definir en alguno de los dos: "));
        li.appendChild(document.createTextNode(c.alMedio.join(", ")));
        ul.appendChild(li);
      }
      lienzo.appendChild(ul);
      if (c.sinEje.length) lienzo.appendChild(el("p", SUB + " mt-1", "Sin alguno de estos ejes (su prueba es de antes de que se midiera): " + c.sinEje.join(", ") + "."));
    };
    // Los dos ejes no pueden ser el mismo: se intercambian.
    let antes = { x: sx.value, y: sy.value };
    const cambio = (s, otro, k) => () => {
      if (s.value === otro.value) otro.value = antes[k];
      antes = { x: sx.value, y: sy.value };
      pintar();
    };
    sx.addEventListener("change", cambio(sx, sy, "x"));
    sy.addEventListener("change", cambio(sy, sx, "y"));
    pintar();

    if (perfiles.length < 2) return;
    caja.appendChild(el("h3", H3, "Parejas de estilo opuesto"));
    caja.appendChild(el("p", SUB, "Primero los que más se diferencian en los cuatro ejes: cada uno le pone al otro las posiciones que no elige solo."));
    const { grupos } = parejas(perfiles);
    const ol = el("ol", "list-decimal pl-5 space-y-1 " + TXT);
    ol.setAttribute("data-estilo-parejas", "");
    for (const g of grupos) {
      const li = el("li");
      li.appendChild(el("strong", "font-semibold text-brand-800 dark:text-white", g.alumnos.join(" y ")));
      li.appendChild(document.createTextNode(g.opuestos.length
        ? ": opuestos en " + g.opuestos.map((e) => B.EJES[e].nombre.toLowerCase()).join(", ") + "."
        : ": ningún eje opuesto con seguridad todavía; son los que más se diferencian."));
      ol.appendChild(li);
    }
    caja.appendChild(ol);
  }

  async function montarClase(contenedor, o) {
    if (!contenedor || !o || !o.sb) return;
    contenedor.textContent = "";
    const estado = el("p", SUB, "Cargando…");
    estado.setAttribute("role", "status");
    contenedor.appendChild(estado);
    await cargar();
    const B = window.EstiloItems;
    const alumnos = o.alumnos || [];
    // La última prueba de cada uno, de mil en mil y de a 100 alumnos (la
    // lista de ids va en la dirección del pedido).
    const ultima = new Map();
    for (let i = 0; i < alumnos.length; i += 100) {
      const ids = alumnos.slice(i, i + 100).map((a) => a.id);
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await o.sb.from("estilo_pruebas").select("alumno_id, version, respuestas, partidas, recomendacion, created_at")
          .in("alumno_id", ids).order("created_at", { ascending: false }).range(desde, desde + 999);
        if (error) { estado.textContent = "No se pudieron leer las pruebas: " + error.message; return; }
        (data || []).forEach((p) => { if (!ultima.has(p.alumno_id)) ultima.set(p.alumno_id, p); });
        if (!data || data.length < 1000) break;
      }
    }
    estado.textContent = "";
    const con = alumnos.filter((a) => ultima.has(a.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const sin = alumnos.filter((a) => !ultima.has(a.id)).map((a) => a.nombre).sort((a, b) => a.localeCompare(b, "es"));
    // Los que ya jugaron 5 partidas con su apertura recomendada y nadie miró
    // cómo les fue (el aviso de la campana se resuelve acá o en su informe).
    const { data: listos } = await o.sb.from("estilo_seguimiento").select("alumno_id, partidas, listo_at")
      .not("listo_at", "is", null).is("revisado_at", null).order("listo_at", { ascending: true }).range(0, 999);
    const nombreDe = new Map(alumnos.map((a) => [a.id, a.nombre]));
    const porRevisar = (listos || []).filter((f) => nombreDe.has(f.alumno_id));
    if (porRevisar.length) {
      const sec = el("div", "mb-4 bg-white dark:bg-brand-900 rounded-xl shadow-md p-4");
      sec.setAttribute("data-estilo-por-revisar", "");
      sec.appendChild(el("h3", H3.replace("mt-4", "mt-0"), "Ya jugaron 5 partidas con su apertura recomendada"));
      sec.appendChild(el("p", SUB + " mb-2", "Mira cómo les fue en su informe («¿Cómo le fue?», en Sus aperturas) o márcalo como visto."));
      const ul = el("ul", "space-y-2");
      for (const f of porRevisar) {
        const li = el("li", "flex flex-wrap items-center gap-2 " + TXT);
        li.setAttribute("data-alumno", f.alumno_id);
        const n = Math.max(...Object.values(f.partidas || {}).map(Number).filter((x) => x >= 0), 0);
        li.appendChild(el("span", "font-semibold text-brand-800 dark:text-white", nombreDe.get(f.alumno_id)));
        li.appendChild(el("span", SUB, n + " partidas con una de ellas"));
        const a = el("a", ENLACE + " text-sm", "Ver su informe");
        a.href = "informes.html?alumno=" + encodeURIComponent(f.alumno_id);
        const b = el("button", "px-3 py-1 rounded-lg text-sm font-semibold border border-brand-300 dark:border-brand-600 text-brand-800 dark:text-brand-100 hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60", "Ya lo vi");
        b.type = "button";
        const st = el("span", SUB);
        st.setAttribute("role", "status");
        b.addEventListener("click", async () => {
          b.disabled = true;
          const { error } = await o.sb.from("estilo_seguimiento").update({ revisado_at: new Date().toISOString() }).eq("alumno_id", f.alumno_id);
          if (error) { st.textContent = "No se pudo: " + error.message; b.disabled = false; return; }
          st.textContent = "Listo: ya no sale en la campana.";
        });
        li.append(a, b, st);
        ul.appendChild(li);
      }
      sec.appendChild(ul);
      contenedor.appendChild(sec);
    }
    contenedor.appendChild(el("h3", H3.replace("mt-4", "mt-0"), "El estilo de cada uno"));
    if (con.length) {
      const envoltura = el("div", "overflow-x-auto");
      const tabla = el("table", "w-full text-sm text-left");
      tabla.setAttribute("data-estilo-clase", "");
      const cab = el("tr");
      ["Alumno", ...Object.keys(B.EJES).map((e) => B.EJES[e].nombre), "Con blancas", "Contra 1.e4", "Contra 1.d4", "Prueba del"].forEach((c) => {
        const th = el("th", "py-2 pr-3 font-semibold text-brand-800 dark:text-white border-b border-brand-200 dark:border-brand-700", c);
        th.scope = "col";
        cab.appendChild(th);
      });
      const thead = el("thead"); thead.appendChild(cab); tabla.appendChild(thead);
      const tbody = el("tbody");
      const perfiles = [];
      for (const a of con) {
        const p = ultima.get(a.id);
        const pf = EstiloPerfil.medir(p.respuestas, p.partidas, p.version);
        perfiles.push({ id: a.id, nombre: a.nombre, perfil: pf });
        const tr = el("tr", "border-b border-brand-50 dark:border-brand-800/60");
        tr.setAttribute("data-alumno", a.id);
        const th = el("th", "py-2 pr-3 font-semibold text-brand-800 dark:text-white", a.nombre);
        th.scope = "row";
        tr.appendChild(th);
        Object.keys(B.EJES).forEach((e) => tr.appendChild(el("td", "py-2 pr-3 " + TXT, etiquetaCorta(e, pf[e]))));
        ["blancas", "e4", "d4"].forEach((g) => {
          const r = p.recomendacion && p.recomendacion[g];
          tr.appendChild(el("td", "py-2 pr-3 " + TXT, r && r.principal ? r.principal.nombre : "—"));
        });
        tr.appendChild(el("td", "py-2 pr-3 " + SUB, fecha(p.created_at)));
        tbody.appendChild(tr);
      }
      tabla.appendChild(tbody);
      envoltura.appendChild(tabla);
      contenedor.appendChild(envoltura);
      if (sin.length) contenedor.appendChild(el("p", SUB + " mt-2", "Sin la prueba: " + sin.join(", ") + ". Se la puedes pedir como tarea (Tareas → Prueba de estilo)."));
      pintarMapa(contenedor, perfiles);
    } else {
      contenedor.appendChild(el("p", SUB, "Ninguno hizo todavía la prueba de estilo."));
      if (sin.length) contenedor.appendChild(el("p", SUB + " mt-2", "Sin la prueba: " + sin.join(", ") + ". Se la puedes pedir como tarea (Tareas → Prueba de estilo)."));
    }

    // ¿La prueba funciona?
    contenedor.appendChild(el("h3", H3, "¿La prueba funciona?"));
    const primero = {};
    B.ITEMS.forEach((i) => { primero[i.id] = { eje: i.eje, primero: i.a.polo === EstiloMedidas.POLOS[i.eje][0] ? "a" : "b" }; });
    const { data: s, error } = await o.sb.rpc("estilo_salud", { p_primero: primero });
    if (error || !s) { contenedor.appendChild(el("p", SUB, "No se pudo calcular: " + (error ? error.message : "sin datos"))); return; }
    const ul = el("ul", "list-disc pl-5 space-y-1 " + TXT);
    ul.setAttribute("data-estilo-salud", "");
    frasesSalud(s).forEach((f) => { const li = el("li", null, f.texto); li.setAttribute("data-salud", f.clave); ul.appendChild(li); });
    contenedor.appendChild(ul);
    contenedor.appendChild(el("p", SUB + " mt-2", "Cuenta las pruebas que ves (las de tus alumnos; administración, todas)."));
  }

  const api = { cargar, pintarPerfil, pintarRecomendacion, seguir, contarEnSilencio, montarProfe, montarClase, botonFicha, frasesSalud, correlacion, lado, cuadrantes, parejas };
  if (typeof window !== "undefined") window.EstiloTarjeta = api;
})();
