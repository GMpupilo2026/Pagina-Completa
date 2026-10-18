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
 *   EstiloTarjeta.pintarPerfil(caja, perfil, { tu, opinar })
 *   EstiloTarjeta.pintarRecomendacion(caja, rec, { tu, base, repertorio })
 *     `repertorio(op, color)` → Promise<texto>: el botón «Agregar a Mi
 *     repertorio» de cada apertura (solo en la página del alumno).
 *   EstiloTarjeta.seguir(caja, { sb, alumnoId, recomendacion, desde, tu })
 *   EstiloTarjeta.montarProfe(contenedor, { sb, alumnoId, nombre, yo, puedeEscribir })
 *   EstiloTarjeta.montarClase(contenedor, { sb, alumnos: [{ id, nombre }] })
 *     (Informes, tema «Prueba de estilo»: el estilo de cada alumno y si la
 *     prueba funciona, con estilo_salud())
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
  function pintarPerfil(caja, perfil, o) {
    const tu = !!(o && o.tu);
    const B = window.EstiloItems;
    const lista = el("div", "space-y-3");
    lista.setAttribute("data-estilo-perfil", "");
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
      card.appendChild(tarjetaOpcion(r.principal, r.mantener ? (tu ? "La tuya" : "La suya") : (tu ? "Te recomendamos" : "Le recomendamos"), o));
      if (r.alternativa) card.appendChild(tarjetaOpcion(r.alternativa, "Otra opción", o));
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

  /* ---------------- El seguimiento ---------------- */
  async function seguir(caja, o) {
    caja.textContent = "";
    const estado = el("p", SUB, "Buscando las cuentas de Lichess y Chess.com…");
    estado.setAttribute("role", "status");
    caja.appendChild(estado);
    await cargar();
    const { data } = await o.sb.from("analisis_partidas_alumno").select("lichess, chesscom").eq("alumno_id", o.alumnoId).maybeSingle();
    if (!data || !(data.lichess || data.chesscom)) {
      estado.textContent = o.tu ? "Para seguirla hacen falta tus usuarios de Lichess o Chess.com: ponlos en Configuración." : "Para seguirla hacen falta sus usuarios de Lichess o Chess.com (Configuración, o «Sus aperturas» más arriba).";
      return;
    }
    await AnalisisAlumno.cargarModulos();
    const D = window.PreparacionDescarga, A = window.PreparacionAnalisis;
    const cuentas = [["lichess", data.lichess], ["chesscom", data.chesscom]].filter(([, u]) => u);
    const principal = cuentas[0][1];
    let texto = "";
    for (const [sitio, usuario] of cuentas) {
      const t = await D.descargar({ sitio, usuario, maximo: AnalisisAlumno.MAXIMO, alAvanzar: (n) => { estado.textContent = "Bajando partidas: " + n; } });
      texto += (texto ? "\n\n" : "") + (usuario === principal ? t : D.unirCuentas(t, usuario, principal));
    }
    const partidas = A.leerPgn(texto);
    const s = EstiloPartidas.seguimiento(partidas, principal, o.recomendacion, String(o.desde).slice(0, 10));
    estado.textContent = "";
    const ul = el("ul", "list-disc pl-5 space-y-1 " + TXT);
    ul.setAttribute("data-estilo-seguimiento", "");
    for (const g of ["blancas", "e4", "d4"]) if (s[g]) ul.appendChild(el("li", null, EstiloPartidas.fraseSeguimiento(s[g], o.tu)));
    caja.appendChild(ul);
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
    pintarPerfil(contenedor, perfil, { tu: false, opinar });
    if (ultima.recomendacion) {
      contenedor.appendChild(el("h3", H3, "Lo que se le recomendó ese día"));
      pintarRecomendacion(contenedor, ultima.recomendacion, { tu: false, base: "" });
      const caja = el("div", "mt-3");
      const btn = el("button", BOTON, "Ver cómo le fue desde entonces");
      btn.type = "button";
      btn.setAttribute("data-estilo-seguir", "");
      const res = el("div", "mt-2");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try { await seguir(res, { sb: o.sb, alumnoId: o.alumnoId, recomendacion: ultima.recomendacion, desde: ultima.created_at, tu: false }); }
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
      for (const a of con) {
        const p = ultima.get(a.id);
        const pf = EstiloPerfil.medir(p.respuestas, p.partidas, p.version);
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
    } else {
      contenedor.appendChild(el("p", SUB, "Ninguno hizo todavía la prueba de estilo."));
    }
    if (sin.length) contenedor.appendChild(el("p", SUB + " mt-2", "Sin la prueba: " + sin.join(", ") + ". Se la puedes pedir como tarea (Tareas → Prueba de estilo)."));

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

  const api = { cargar, pintarPerfil, pintarRecomendacion, seguir, montarProfe, montarClase, frasesSalud, correlacion };
  if (typeof window !== "undefined") window.EstiloTarjeta = api;
})();
