/* Los materiales de clase en admin.html#materiales: cada material (el libro
 * «Ponte a prueba» y los siete volúmenes del banco de ejercicios «Mide
 * tu fuerza»), con sus
 * sub-fichas —las pruebas y sus versiones como cuestionario, si las tiene— y
 * CON QUIÉN se comparte.
 *
 * Quién lo puede usar lo decide la base, no esta pantalla:
 *   - la lista vive en material_compartido, que solo lee administración y no
 *     tiene política de escritura: la escribe material_compartir(), que
 *     valida que quien llama administre;
 *   - puede_bajar() —el candado del worker para material/<producto>/— suma
 *     «se lo compartieron», y la RLS de cuestionarios solo deja leer las
 *     versiones a quien puede bajar el material.
 * Esta página pinta lo que la base devuelve después de cada cambio, no lo que
 * se pidió. Ver «Los materiales de clase» en docs/decisiones/cursos-y-material.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* Los materiales. El `producto` es la carpeta de material/ y el mismo
     nombre que usa la base: si no coinciden, compartir no abre nada. */
  const MATERIALES = [
    {
      producto: "ponte-a-prueba",
      emoji: "📕",
      titulo: "Ponte a prueba",
      autor: "Oscar Angulo Cubero",
      resumen: "Examen y guía de entrenamiento: 180 posiciones en seis pruebas de 30, dos preguntas en cada una (cuánto ganan las blancas y cuál es la jugada), la fuerza en Elo total y por categoría, y qué entrenar según lo que salga flojo.",
      archivos: [
        { href: "material/ponte-a-prueba/ponte-a-prueba.pdf", texto: "📥 El libro en PDF" },
        { href: "material/ponte-a-prueba/ponte-a-prueba-accesible.html", texto: "♿ Versión accesible" },
        { href: "material/ponte-a-prueba/versiones/claves-de-correccion.pdf", texto: "🔑 Claves de las versiones" },
        { href: "material/ponte-a-prueba/ponte-a-prueba-versiones-accesible.html", texto: "♿ Versiones, accesibles" },
      ],
      // Los cuadernillos de cada versión para imprimir
      // (herramientas/libro-examen-versiones-pdf.js).
      pdfVersiones: "material/ponte-a-prueba/versiones/",
      pruebas: 6,
      posicionesPorPrueba: 30,
      versiones: ["A", "B", "C"],
    },
    {
      producto: "mide-tu-fuerza",
      emoji: "📗",
      titulo: "Mide tu fuerza",
      autor: "Oscar Angulo Cubero",
      resumen: "Banco de ejercicios tácticos: 360 posiciones en 45 tests de 8, uno por tema (ataque doble, clavada, desviación, atracción, rayos X y diez más), en tres niveles. Cada test con su tiempo y sus puntos, el cuadro de puntuación y la fuerza en Elo por nivel y total.",
      archivos: [
        { href: "material/mide-tu-fuerza/mide-tu-fuerza.pdf", texto: "📥 El libro en PDF" },
        { href: "material/mide-tu-fuerza/mide-tu-fuerza-accesible.html", texto: "♿ Versión accesible" },
      ],
    },
    {
      producto: "mide-tu-fuerza-2",
      emoji: "📘",
      titulo: "Mide tu fuerza · Volumen 2",
      autor: "Oscar Angulo Cubero",
      resumen: "Segundo volumen del banco de ejercicios tácticos: la misma forma que el primero (45 tests de 8, los mismos 15 temas y tres niveles, con su tiempo, sus puntos y la fuerza en Elo) y 360 posiciones todas nuevas, ninguna repetida del volumen 1. Sirve para seguir entrenando y para volver a medir sin que cuente la memoria.",
      archivos: [
        { href: "material/mide-tu-fuerza-2/mide-tu-fuerza-2.pdf", texto: "📥 El libro en PDF" },
        { href: "material/mide-tu-fuerza-2/mide-tu-fuerza-2-accesible.html", texto: "♿ Versión accesible" },
      ],
    },
    {
      producto: "mide-tu-fuerza-3",
      emoji: "📙",
      titulo: "Mide tu fuerza · Volumen 3",
      autor: "Oscar Angulo Cubero",
      resumen: "Tercer volumen del banco de ejercicios tácticos: la misma forma que los anteriores (45 tests de 8, los mismos 15 temas y tres niveles, con su tiempo, sus puntos y la fuerza en Elo) y 360 posiciones todas nuevas, ninguna repetida de los volúmenes 1 y 2.",
      archivos: [
        { href: "material/mide-tu-fuerza-3/mide-tu-fuerza-3.pdf", texto: "📥 El libro en PDF" },
        { href: "material/mide-tu-fuerza-3/mide-tu-fuerza-3-accesible.html", texto: "♿ Versión accesible" },
      ],
    },
    {
      producto: "mide-tu-fuerza-4",
      emoji: "📓",
      titulo: "Mide tu fuerza · Volumen 4",
      autor: "Oscar Angulo Cubero",
      resumen: "Cuarto volumen del banco de ejercicios tácticos: la misma forma que los anteriores (45 tests de 8, los mismos 15 temas y tres niveles, con su tiempo, sus puntos y la fuerza en Elo) y 360 posiciones todas nuevas, ninguna repetida de los volúmenes 1, 2 y 3.",
      archivos: [
        { href: "material/mide-tu-fuerza-4/mide-tu-fuerza-4.pdf", texto: "📥 El libro en PDF" },
        { href: "material/mide-tu-fuerza-4/mide-tu-fuerza-4-accesible.html", texto: "♿ Versión accesible" },
      ],
    },
    {
      producto: "mide-tu-fuerza-5",
      emoji: "📔",
      titulo: "Mide tu fuerza · Volumen 5",
      autor: "Oscar Angulo Cubero",
      resumen: "Quinto volumen del banco de ejercicios tácticos: la misma forma que los anteriores (45 tests de 8, los mismos 15 temas y tres niveles, con su tiempo, sus puntos y la fuerza en Elo) y 360 posiciones todas nuevas, ninguna repetida de los volúmenes 1 a 4.",
      archivos: [
        { href: "material/mide-tu-fuerza-5/mide-tu-fuerza-5.pdf", texto: "📥 El libro en PDF" },
        { href: "material/mide-tu-fuerza-5/mide-tu-fuerza-5-accesible.html", texto: "♿ Versión accesible" },
      ],
    },
    {
      producto: "mide-tu-fuerza-6",
      emoji: "📒",
      titulo: "Mide tu fuerza · Volumen 6",
      autor: "Oscar Angulo Cubero",
      resumen: "Sexto volumen del banco de ejercicios tácticos: la misma forma que los anteriores (45 tests de 8, los mismos 15 temas y tres niveles, con su tiempo, sus puntos y la fuerza en Elo) y 360 posiciones todas nuevas, ninguna repetida de los volúmenes 1 a 5.",
      archivos: [
        { href: "material/mide-tu-fuerza-6/mide-tu-fuerza-6.pdf", texto: "📥 El libro en PDF" },
        { href: "material/mide-tu-fuerza-6/mide-tu-fuerza-6-accesible.html", texto: "♿ Versión accesible" },
      ],
    },
    {
      producto: "mide-tu-fuerza-7",
      emoji: "📕",
      titulo: "Mide tu fuerza · Volumen 7",
      autor: "Oscar Angulo Cubero",
      resumen: "Séptimo volumen del banco de ejercicios tácticos: la forma de los anteriores (45 tests de 8 en tres niveles, con su tiempo, sus puntos y la fuerza en Elo), 360 posiciones todas nuevas y tres temas nuevos —mate en dos, mate en tres y sacrificio— en lugar del jaque doble, los rayos X y la interferencia.",
      archivos: [
        { href: "material/mide-tu-fuerza-7/mide-tu-fuerza-7.pdf", texto: "📥 El libro en PDF" },
        { href: "material/mide-tu-fuerza-7/mide-tu-fuerza-7-accesible.html", texto: "♿ Versión accesible" },
      ],
    },
  ];

  const CAMPO = "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
  const ETIQUETA = "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1";
  const BOTON = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60 disabled:cursor-wait";
  const BOTON_SUAVE = "text-xs font-semibold text-red-700 dark:text-red-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded px-1 disabled:opacity-60";
  const ENLACE = "inline-flex items-center gap-1 rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-1.5 text-sm font-semibold text-brand-700 dark:text-brand-100 hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

  let cuentas = () => [];
  let compartidos = [];      // filas de material_compartido
  let academias = [];        // { id, nombre }
  let versiones = [];        // cuestionarios del material: { id, titulo, material }
  let cargado = false;
  let pedido = null;

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function sinTildes(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  const nombreDe = (u) => (u && (u.full_name || u.email)) || "Una cuenta";
  const ROL = { profesor: "profesor", alumno: "alumno", admin: "administración" };

  function persona(id) {
    return cuentas().find((u) => u.id === id);
  }

  /* ---------------------------------------------------------- leer */
  async function cargar() {
    const [c, a, v] = await Promise.all([
      sb.from("material_compartido").select("id, producto, persona_id, academia_id, todos_profesores, creado_en").order("creado_en").range(0, 999),
      sb.from("academias").select("id, nombre").order("nombre").range(0, 999),
      sb.from("cuestionarios").select("id, titulo, material").in("material", MATERIALES.map((m) => m.producto)).order("titulo").range(0, 999),
    ]);
    if (c.error) {
      // La tabla no existe todavía si la migración no se aplicó: se dice
      // tal cual, en vez de pintar «nadie» como si fuera verdad.
      throw new Error(/material_compartido|does not exist|schema cache/i.test(c.error.message || "")
        ? "Falta aplicar en la base la migración de los materiales de clase (supabase/migraciones/…_materiales_de_clase.sql)."
        : (c.error.message || "No se pudo leer con quién se comparte."));
    }
    compartidos = c.data || [];
    academias = (a && !a.error && a.data) || [];
    versiones = (v && !v.error && v.data) || [];
  }

  async function abrir() {
    if (pedido) return pedido;
    pedido = (async () => {
      try {
        await cargar();
        cargado = true;
        $("mat-error").hidden = true;
      } catch (e) {
        console.error(e);
        $("mat-error").textContent = e.message || String(e);
        $("mat-error").hidden = false;
        pedido = null;
      } finally {
        $("mat-cargando").hidden = true;
        pintar();
      }
    })();
    return pedido;
  }

  /* ---------------------------------------------------------- escribir */
  async function cambiar(producto, destino, compartir, boton) {
    if (boton) boton.disabled = true;
    try {
      const { error } = await sb.rpc("material_compartir", {
        p_producto: producto,
        p_persona: destino.persona || null,
        p_academia: destino.academia || null,
        p_todos: !!destino.todos,
        p_compartir: compartir,
      });
      if (error) throw error;
      await cargar();       // se pinta lo que quedó en la base
      pintar();
      const varios = !!destino.todos;
      Avisos.avisar("Listo: " + textoDestino(destino) + (compartir
        ? (varios ? " ya lo pueden usar." : " ya lo puede usar.")
        : (varios ? " ya no lo tienen." : " ya no lo tiene.")));
    } catch (e) {
      console.error(e);
      Avisos.avisar("No se pudo cambiar: " + (e.message || e), { tipo: "error" });
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  function textoDestino(d) {
    if (d.todos) return "todos los profesores";
    if (d.academia) {
      const a = academias.find((x) => x.id === d.academia);
      return "la academia " + (a ? a.nombre : "");
    }
    return nombreDe(persona(d.persona));
  }

  /* ---------------------------------------------------------- pintar */
  function pintarCompartidos(m, caja) {
    const filas = compartidos.filter((f) => f.producto === m.producto);
    const resumen = el("p", "text-sm font-semibold text-brand-600 dark:text-brand-200 mb-2");
    resumen.setAttribute("role", "status");
    const n = { personas: filas.filter((f) => f.persona_id).length, academias: filas.filter((f) => f.academia_id).length, todos: filas.some((f) => f.todos_profesores) };
    const partes = [];
    if (n.todos) partes.push("todos los profesores");
    if (n.academias) partes.push(n.academias === 1 ? "1 academia" : n.academias + " academias");
    if (n.personas) partes.push(n.personas === 1 ? "1 persona" : n.personas + " personas");
    resumen.textContent = partes.length ? "Lo tienen: " + partes.join(", ") + ", y tú." : "Por ahora solo lo tienes tú.";
    caja.appendChild(resumen);

    if (!filas.length) return;
    const ul = el("ul", "divide-y divide-brand-100 dark:divide-brand-800 mb-4");
    filas.forEach((f) => {
      const li = el("li", "flex flex-wrap items-center justify-between gap-3 py-2");
      const quien = el("div", "min-w-0");
      if (f.todos_profesores) {
        quien.appendChild(el("p", "font-semibold text-brand-800 dark:text-white", "👩‍🏫 Todos los profesores"));
        quien.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", "También los que se sumen después."));
      } else if (f.academia_id) {
        const a = academias.find((x) => x.id === f.academia_id);
        quien.appendChild(el("p", "font-semibold text-brand-800 dark:text-white", "🏫 " + (a ? a.nombre : "Una academia")));
        quien.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", "Toda la academia: sus profesores, sus alumnos y quien la supervisa."));
      } else {
        const u = persona(f.persona_id);
        quien.appendChild(el("p", "font-semibold text-brand-800 dark:text-white truncate", nombreDe(u)));
        quien.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 truncate", [u && ROL[u.role], u && u.email].filter(Boolean).join(" · ")));
      }
      li.appendChild(quien);
      const quitar = el("button", BOTON_SUAVE, "Dejar de compartir");
      quitar.type = "button";
      const destino = { persona: f.persona_id, academia: f.academia_id, todos: f.todos_profesores };
      quitar.setAttribute("aria-label", "Dejar de compartir con " + textoDestino(destino));
      quitar.addEventListener("click", async () => {
        const ok = await Avisos.confirmar("Dejará de poder bajarlo y de usar sus cuestionarios. Las tareas que ya mandó siguen.",
          { titulo: "¿Dejar de compartirlo con " + textoDestino(destino) + "?", aceptar: "Dejar de compartir", cancelar: "Cancelar" });
        if (ok) cambiar(m.producto, destino, false, quitar);
      });
      li.appendChild(quitar);
      ul.appendChild(li);
    });
    caja.appendChild(ul);
  }

  function pintarAgregar(m, caja) {
    const id = "mat-" + m.producto;
    const fila = el("div", "grid gap-3 sm:grid-cols-3 items-end");
    const wTipo = el("div");
    const lTipo = el("label", ETIQUETA, "Compartir con");
    lTipo.setAttribute("for", id + "-tipo");
    const tipo = el("select", CAMPO);
    tipo.id = id + "-tipo";
    [["persona", "Una persona"], ["academia", "Una academia"], ["todos", "Todos los profesores"]].forEach(([v, t]) => {
      const o = el("option", null, t); o.value = v; tipo.appendChild(o);
    });
    wTipo.append(lTipo, tipo);
    fila.appendChild(wTipo);
    const destino = el("div", "min-w-0 sm:col-span-2");
    fila.appendChild(destino);
    caja.appendChild(fila);
    const resultados = el("ul", "mt-2 divide-y divide-brand-100 dark:divide-brand-800");
    resultados.id = id + "-resultados";
    caja.appendChild(resultados);

    function pintarDestino() {
      destino.textContent = "";
      resultados.textContent = "";
      if (tipo.value === "persona") {
        const l = el("label", ETIQUETA, "Buscar la persona");
        l.setAttribute("for", id + "-buscar");
        const q = el("input", CAMPO);
        q.id = id + "-buscar"; q.type = "search"; q.placeholder = "Nombre o correo";
        q.setAttribute("aria-controls", resultados.id);
        q.addEventListener("input", () => buscar(q.value));
        destino.append(l, q);
      } else if (tipo.value === "academia") {
        const l = el("label", ETIQUETA, "La academia");
        l.setAttribute("for", id + "-academia");
        const s = el("select", CAMPO);
        s.id = id + "-academia";
        const ya = new Set(compartidos.filter((f) => f.producto === m.producto && f.academia_id).map((f) => f.academia_id));
        academias.filter((a) => !ya.has(a.id)).forEach((a) => { const o = el("option", null, a.nombre); o.value = a.id; s.appendChild(o); });
        const b = el("button", BOTON + " mt-2", "Compartir con la academia");
        b.type = "button";
        b.disabled = !s.options.length;
        if (!s.options.length) s.appendChild(el("option", null, academias.length ? "Ya está con todas" : "No hay academias"));
        b.addEventListener("click", () => cambiar(m.producto, { academia: s.value }, true, b));
        destino.append(l, s, b);
      } else {
        const ya = compartidos.some((f) => f.producto === m.producto && f.todos_profesores);
        const p = el("p", "text-sm text-brand-600 dark:text-brand-200 mb-2", ya
          ? "Ya lo tienen todos los profesores."
          : "Lo tendrán todos los profesores de la plataforma, también los que se sumen después. Los alumnos no.");
        const b = el("button", BOTON, "Compartir con todos los profesores");
        b.type = "button";
        b.disabled = ya;
        b.addEventListener("click", () => cambiar(m.producto, { todos: true }, true, b));
        destino.append(p, b);
      }
    }

    function buscar(texto) {
      resultados.textContent = "";
      const q = sinTildes(texto.trim());
      if (q.length < 2) return;
      const ya = new Set(compartidos.filter((f) => f.producto === m.producto && f.persona_id).map((f) => f.persona_id));
      const hallados = cuentas().filter((u) => !u.is_admin && !ya.has(u.id)
        && sinTildes((u.full_name || "") + " " + (u.email || "")).includes(q)).slice(0, 8);
      if (!hallados.length) {
        resultados.appendChild(el("li", "py-2 text-sm text-brand-500 dark:text-brand-300", "No hay nadie más con ese nombre o correo."));
        return;
      }
      hallados.forEach((u) => {
        const li = el("li", "flex flex-wrap items-center justify-between gap-3 py-2");
        const quien = el("div", "min-w-0");
        quien.appendChild(el("p", "font-semibold text-brand-800 dark:text-white truncate", nombreDe(u)));
        quien.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 truncate", [ROL[u.role], u.email].filter(Boolean).join(" · ")));
        const b = el("button", BOTON, "Compartir");
        b.type = "button";
        b.setAttribute("aria-label", "Compartir con " + nombreDe(u));
        b.addEventListener("click", () => cambiar(m.producto, { persona: u.id }, true, b));
        li.append(quien, b);
        resultados.appendChild(li);
      });
    }

    tipo.addEventListener("change", pintarDestino);
    pintarDestino();
  }

  /* Las sub-fichas: cada prueba, con sus versiones como cuestionario. */
  function pintarPruebas(m, caja) {
    const deEste = versiones.filter((v) => v.material === m.producto);
    const grid = el("ul", "grid gap-3 sm:grid-cols-2 lg:grid-cols-3");
    for (let p = 1; p <= m.pruebas; p++) {
      const li = el("li", "rounded-xl border border-brand-200 dark:border-brand-700 p-4 bg-brand-50/60 dark:bg-brand-950/40");
      li.appendChild(el("h4", "font-semibold text-brand-800 dark:text-white", "Prueba " + p));
      li.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mb-2",
        m.posicionesPorPrueba + " posiciones · " + m.versiones.length + " versiones de 20 preguntas, sin posiciones repetidas entre ellas"));
      const ul = el("ul", "flex flex-wrap gap-2");
      m.versiones.forEach((letra) => {
        const v = deEste.find((x) => x.titulo === m.titulo + " · Prueba " + p + " · versión " + letra);
        const item = el("li");
        if (v) {
          const a = el("a", ENLACE, "Versión " + letra);
          a.href = "cuestionarios.html?id=" + encodeURIComponent(v.id);
          a.setAttribute("aria-label", "Ver la versión " + letra + " de la prueba " + p);
          item.appendChild(a);
        } else {
          item.appendChild(el("span", "text-xs text-brand-450 dark:text-brand-350", "Versión " + letra + ": sin cargar"));
        }
        // La misma versión en papel: el cuadernillo del alumno, con las
        // opciones en el mismo orden que el cuestionario.
        if (m.pdfVersiones) {
          const pdf = el("a", ENLACE + " ml-1", "🖨️ PDF");
          pdf.href = m.pdfVersiones + "prueba-" + p + "-version-" + letra.toLowerCase() + ".pdf";
          pdf.setAttribute("aria-label", "Imprimir la versión " + letra + " de la prueba " + p);
          item.appendChild(pdf);
        }
        ul.appendChild(item);
      });
      li.appendChild(ul);
      grid.appendChild(li);
    }
    caja.appendChild(grid);
    if (!deEste.length) {
      caja.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-2",
        "Las versiones como cuestionario todavía no están en la base: se cargan con herramientas/libro-examen-cuestionarios.js."));
    }
  }

  function pintar() {
    const lista = $("mat-lista");
    if (!lista || !cargado) return;
    lista.textContent = "";
    MATERIALES.forEach((m) => {
      const art = el("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6");
      art.setAttribute("aria-labelledby", "mat-titulo-" + m.producto);
      const cab = el("div", "flex flex-wrap items-start justify-between gap-3 mb-3");
      const t = el("div", "min-w-0");
      const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white");
      h.id = "mat-titulo-" + m.producto;
      const emo = el("span", null, m.emoji + " ");
      emo.setAttribute("aria-hidden", "true");
      h.append(emo, document.createTextNode(m.titulo));
      t.appendChild(h);
      t.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", "de " + m.autor));
      cab.appendChild(t);
      const archivos = el("div", "flex flex-wrap gap-2");
      m.archivos.forEach((f) => { const a = el("a", ENLACE, f.texto); a.href = f.href; archivos.appendChild(a); });
      cab.appendChild(archivos);
      art.appendChild(cab);
      art.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-200 mb-5", m.resumen));

      const comp = el("section", "mb-6");
      comp.appendChild(el("h4", "text-sm font-bold uppercase tracking-wide text-brand-500 dark:text-brand-300 mb-2", "Con quién lo compartes"));
      pintarCompartidos(m, comp);
      pintarAgregar(m, comp);
      art.appendChild(comp);

      // Solo un material con pruebas cargadas como cuestionario tiene esta
      // sección: el banco de ejercicios es un libro y nada más.
      if (!m.pruebas) { lista.appendChild(art); return; }
      const pr = el("section");
      pr.appendChild(el("h4", "text-sm font-bold uppercase tracking-wide text-brand-500 dark:text-brand-300 mb-1", "Las pruebas, como cuestionario y para imprimir"));
      pr.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mb-3",
        "Cada prueba sale en tres versiones con preguntas distintas, para que un grupo no reciba lo mismo que otro. Cada versión está también en PDF para imprimir, con su hoja de respuestas; las respuestas y los puntos de las 18 están en «Claves de las versiones». Quien tenga el material las usa en la clase en vivo o las manda de tarea, y cada alumno ve las preguntas y las opciones en su propio orden. Para un examen con preguntas sorteadas, el banco aparece en Exámenes como «Libro “Ponte a prueba”»."));
      pintarPruebas(m, pr);
      art.appendChild(pr);
      lista.appendChild(art);
    });
  }

  function iniciar(obtenerCuentas) {
    cuentas = obtenerCuentas;
    if (location.hash === "#materiales") abrir();
  }

  window.AdminMateriales = { iniciar, pintar, abrir, MATERIALES };
})();
