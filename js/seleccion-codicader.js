/* El código de seleccion-codicader.html: la selección por parámetros.

   - Cada torneo se lee con la Edge Function seleccion-chess-results (solo con
     licencia: la base lo decide con tengo_herramienta()).
   - El cálculo es js/seleccion-calculo.js, el mismo que prueba
     herramientas/verificar-seleccion-calculo.js.
   - La selección (torneos, opciones y ajustes a mano) se guarda en
     selecciones_arbitraje. Quien la armó la cambia; un profesor con licencia
     la abre con el enlace (?s=<id>, seleccion_compartida()) y la ve, en vivo
     si quiere, con los mismos ajustes.
   - En vivo vuelve a leer los torneos cada 1, 2 o 5 minutos (la función
     guarda lo leído un minuto) y dice quién entró, quién salió y cuántos
     puntos le faltan a cada uno.

   Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const C = window.SeleccionCalculo;
    const $ = (id) => document.getElementById(id);
    const BORRADOR = "seleccion_codicader_borrador_v1";

    const PLANTILLAS = {
        colegial: { nombre: "Selección colegial CODICADER 2026", anioDesde: 2009, anioHasta: 2011, cupos: { M: 5, F: 5 }, suplentes: 3,
            nota: "Etapa Nacional JDE, categoría D: los cuatro torneos (individual y equipos, clásico y blitz) de cada rama. Nacidos de 2009 a 2011." },
        "categoria-c": { nombre: "Selección categoría C", anioDesde: null, anioHasta: null, cupos: { M: 5, F: 5 }, suplentes: 3,
            nota: "En la C pueden entrar estudiantes que jugaron la final B y cumplen la edad: agrega también los torneos de la final B. Escribe el rango de años de nacimiento." },
    };

    let config = { nombre: "", anioDesde: 2009, anioHasta: 2011, cupos: { M: 5, F: 5 }, suplentes: 3, torneos: [], ajustes: {} };
    let seleccionId = null;     // la fila guardada
    let soloLectura = false;    // abierta por enlace, de otra persona
    let leidos = {};            // url → torneo de chess-results
    let resultado = null;
    let anterior = null;
    let cambios = {};
    let rama = "M";
    let reloj = null;
    let cargando = false;

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    function avisar(texto, error) { Avisos.avisar(texto, { tipo: error ? "error" : "ok" }); }
    function num(x) { return Number(x).toLocaleString("es-CR", { maximumFractionDigits: 2 }); }
    const RAMAS = { F: "Femenino", A: "Absoluto" };

    // ---------------------------------------------------------- la configuración

    function leerFormulario() {
        config.nombre = $("c-nombre").value.trim();
        config.anioDesde = Number($("c-desde").value) || null;
        config.anioHasta = Number($("c-hasta").value) || null;
        config.cupos = { M: Number($("c-cupos-m").value) || 0, F: Number($("c-cupos-f").value) || 0 };
        config.suplentes = Number($("c-suplentes").value) || 0;
    }
    function pintarFormulario() {
        $("c-nombre").value = config.nombre || "";
        $("c-desde").value = config.anioDesde || "";
        $("c-hasta").value = config.anioHasta || "";
        $("c-cupos-m").value = config.cupos.M;
        $("c-cupos-f").value = config.cupos.F;
        $("c-suplentes").value = config.suplentes;
        pintarTorneos();
    }

    function selector(opciones, valor, etiqueta) {
        const s = el("select", "px-2 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm");
        s.setAttribute("aria-label", etiqueta);
        Object.entries(opciones).forEach(([v, t]) => { const o = el("option", "", t); o.value = v; s.appendChild(o); });
        s.value = valor;
        s.disabled = soloLectura;
        return s;
    }

    function pintarTorneos() {
        const ul = $("torneos");
        ul.textContent = "";
        config.torneos.forEach((t, i) => {
            const li = el("li", "flex flex-wrap items-center gap-2");
            const url = el("input", "grow min-w-[16rem] px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm");
            url.type = "url";
            url.placeholder = "https://s3.chess-results.com/tnr1423856.aspx";
            url.value = t.url || "";
            url.setAttribute("aria-label", `Dirección del torneo ${i + 1}`);
            url.disabled = soloLectura;
            url.addEventListener("change", () => { t.url = url.value.trim(); t.auto = true; });
            const r = selector(RAMAS, t.rama, `Rama del torneo ${i + 1}`);
            r.addEventListener("change", () => { t.rama = r.value; t.auto = false; recalcular(); });
            const ri = selector(C.RITMOS, t.ritmo, `Ritmo del torneo ${i + 1}`);
            ri.addEventListener("change", () => { t.ritmo = ri.value; t.auto = false; recalcular(); });
            const cat = el("input", "w-16 px-2 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm text-center uppercase");
            cat.maxLength = 3;
            cat.placeholder = "Cat.";
            cat.value = t.categoria || "";
            cat.setAttribute("aria-label", `Categoría del torneo ${i + 1}`);
            cat.disabled = soloLectura;
            cat.addEventListener("change", () => { t.categoria = cat.value.trim().toUpperCase(); t.auto = false; recalcular(); });
            li.append(url, r, ri, cat);
            if (!soloLectura) {
                const q = el("button", "text-sm font-semibold px-3 py-2 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700", "Quitar");
                q.type = "button";
                q.setAttribute("aria-label", `Quitar el torneo ${i + 1}`);
                q.addEventListener("click", () => { config.torneos.splice(i, 1); pintarTorneos(); recalcular(); });
                li.appendChild(q);
            }
            ul.appendChild(li);
        });
    }

    function guardarBorrador() {
        if (soloLectura) return;
        try { localStorage.setItem(BORRADOR, JSON.stringify({ config, seleccionId })); } catch (e) { /* sin almacenamiento */ }
    }

    // ---------------------------------------------------------- leer chess-results

    async function leerTorneo(url) {
        let { data, error } = await sb.functions.invoke("seleccion-chess-results", { body: { url } });
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) throw new Error((data && data.error) || (error && error.message) || "chess-results no contestó");
        return data;
    }

    async function cargarTodo(silencioso) {
        if (cargando) return;
        leerFormulario();
        const conUrl = config.torneos.filter((t) => t.url);
        if (!conUrl.length) { if (!silencioso) avisar("Agrega al menos un torneo de chess-results.", true); return; }
        cargando = true;
        $("b-calcular").disabled = true;
        const fallas = [];
        let hechos = 0;
        for (const t of conUrl) {
            $("estado").textContent = `Leyendo chess-results: ${hechos + 1} de ${conUrl.length}…`;
            try {
                const d = await leerTorneo(t.url);
                leidos[t.url] = d;
                if (t.auto !== false) {
                    const g = C.adivinarTorneo(d.titulo);
                    t.rama = g.rama; t.ritmo = g.ritmo; if (g.categoria) t.categoria = g.categoria;
                    t.auto = false;
                }
            } catch (e) {
                fallas.push(`${t.url}: ${e.message}`);
            }
            hechos++;
        }
        cargando = false;
        $("b-calcular").disabled = false;
        $("estado").textContent = fallas.length ? `No se pudieron leer ${fallas.length} torneo(s).` : "";
        fallas.forEach((f) => avisar(f, true));
        pintarTorneos();
        guardarBorrador();
        recalcular(true);
    }

    // ---------------------------------------------------------- calcular y pintar

    function torneosParaCalcular() {
        return config.torneos.filter((t) => t.url && leidos[t.url]).map((t) => {
            const d = leidos[t.url];
            return { id: d.id, titulo: d.titulo, rama: t.rama, ritmo: t.ritmo, categoria: t.categoria, equipos: d.equipos,
                rondasJugadas: d.rondasJugadas, clasificacion: d.clasificacion, jugadores: d.jugadores };
        });
    }

    function recalcular(conCambios) {
        leerFormulario();
        const torneos = torneosParaCalcular();
        if (!torneos.length) return;
        if (!config.anioDesde || !config.anioHasta) {
            $("estado").textContent = "Escribe el rango de años de nacimiento para saber quién puede ir.";
            return;
        }
        const nuevo = C.calcular(torneos, {
            anioDesde: config.anioDesde, anioHasta: config.anioHasta, cupos: config.cupos,
            suplentes: config.suplentes, ajustes: config.ajustes,
        });
        if (conCambios && resultado) { anterior = resultado; cambios = C.cambios(anterior, nuevo); }
        else if (!conCambios) cambios = cambios || {};
        resultado = nuevo;
        pintarLeidos();
        pintarAvisos();
        pintarResultados();
        pintarCambiosVivo(conCambios);
        $("zona-vivo").classList.remove("hidden");
    }

    function pintarLeidos() {
        const ul = $("leidos");
        ul.textContent = "";
        config.torneos.filter((t) => t.url && leidos[t.url]).forEach((t) => {
            const d = leidos[t.url];
            const li = el("li", "flex flex-wrap gap-x-3");
            const a = el("a", "font-semibold underline", d.titulo || t.url);
            a.href = d.url; a.target = "_blank"; a.rel = "noopener";
            li.append(a, el("span", "", `${RAMAS[t.rama]} · ${C.RITMOS[t.ritmo]}${t.categoria ? " · cat. " + t.categoria : ""} · ${d.equipos ? "equipos" : "individual"}`),
                el("span", "text-brand-500 dark:text-brand-300", `${d.ronda || ("ronda " + d.rondasJugadas)} · ${d.jugadores.length} jugadores · leído a las ${HoraCR.hora(d.leido_en)}`));
            if (d.viejo) li.appendChild(el("span", "text-red-700 dark:text-red-300", "chess-results no contestó: es lo último que se leyó"));
            if (d.faltantes && d.faltantes.length) li.appendChild(el("span", "text-red-700 dark:text-red-300", `faltan ${d.faltantes.length} ficha(s): vuelve a cargar`));
            ul.appendChild(li);
        });
        $("zona-torneos-leidos").classList.remove("hidden");
    }

    function ajustar(clave, cambio) {
        const a = Object.assign({}, config.ajustes[clave] || {}, cambio);
        Object.keys(a).forEach((k) => { if (a[k] == null || a[k] === "") delete a[k]; });
        if (Object.keys(a).length) config.ajustes[clave] = a; else delete config.ajustes[clave];
        guardarBorrador();
        recalcular();
    }

    function botonAjuste(texto, accion) {
        const b = el("button", "text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700", texto);
        b.type = "button";
        b.addEventListener("click", accion);
        return b;
    }

    function controlAnio(clave, nombre) {
        const caja = el("span", "inline-flex items-center gap-2");
        const i = el("input", "w-24 px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm");
        i.type = "number"; i.min = "1990"; i.max = "2030"; i.placeholder = "Año";
        i.setAttribute("aria-label", "Año de nacimiento de " + nombre);
        caja.append(i, botonAjuste("Usar este año", () => {
            const n = Number(i.value);
            if (!(n >= 1990 && n <= 2030)) { avisar("Escribe el año con cuatro cifras.", true); return; }
            ajustar(clave, { nacimiento: n });
        }));
        return caja;
    }

    function pintarAvisos() {
        const ul = $("avisos"), info = $("avisos-info");
        ul.textContent = ""; info.textContent = "";
        const vistos = new Set();
        let nInfo = 0;
        resultado.avisos.forEach((a) => {
            const llave = a.motivo + "|" + (a.clave || "") + "|" + a.texto;
            if (vistos.has(llave)) return;
            vistos.add(llave);
            if (a.tipo === "info") { info.appendChild(el("li", "", a.texto)); nInfo++; return; }
            const li = el("li", "rounded-xl px-3 py-2 " + (a.tipo === "error"
                ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100" : "bg-accent-100 text-brand-900"));
            li.appendChild(el("p", "", (a.tipo === "error" ? "Falta: " : "Revisa: ") + a.texto));
            if (!soloLectura && a.clave) {
                const fila = el("div", "flex flex-wrap gap-2 mt-2");
                if (a.motivo === "sexo") fila.append(botonAjuste("Es mujer", () => ajustar(a.clave, { sexo: "F" })), botonAjuste("Es hombre", () => ajustar(a.clave, { sexo: "M" })));
                if (a.motivo === "nacimiento") fila.appendChild(controlAnio(a.clave, a.nombre));
                if (fila.childNodes.length) li.appendChild(fila);
            }
            ul.appendChild(li);
        });
        if (!ul.childNodes.length) ul.appendChild(el("li", "text-green-800 dark:text-green-300", "Nada que revisar: todos los datos están completos."));
        $("avisos-info-n").textContent = nInfo;
        pintarAjustes();
        $("zona-avisos").classList.remove("hidden");
    }

    function pintarAjustes() {
        const ul = $("ajustes");
        ul.textContent = "";
        const nombres = new Map();
        ["M", "F"].forEach((s) => resultado.ramas[s].forEach((f) => nombres.set(f.clave, f.nombre)));
        resultado.noElegibles.forEach((f) => nombres.set(f.clave, f.nombre));
        Object.entries(config.ajustes).forEach(([clave, a]) => {
            const li = el("li", "flex flex-wrap items-center gap-2");
            const partes = [];
            if (a.sexo) partes.push(a.sexo === "F" ? "se calcula en la rama femenina" : "se calcula en la rama masculina");
            if (a.nacimiento) partes.push("nació en " + a.nacimiento);
            li.appendChild(el("span", "", `${nombres.get(clave) || clave}: ${partes.join(", ")}.`));
            if (!soloLectura) li.appendChild(botonAjuste("Quitar el ajuste", () => { delete config.ajustes[clave]; guardarBorrador(); recalcular(); }));
            ul.appendChild(li);
        });
        $("zona-ajustes").classList.toggle("hidden", !Object.keys(config.ajustes).length);
    }

    function pintarPestanas() {
        document.querySelectorAll(".pestana").forEach((b) => {
            const activa = b.dataset.rama === rama;
            b.setAttribute("aria-selected", activa ? "true" : "false");
            b.className = "pestana text-sm font-semibold px-4 py-2 rounded-lg " + (activa
                ? "bg-brand-800 text-white dark:bg-accent-500 dark:text-brand-900"
                : "bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700");
        });
    }

    function textoCambio(c) {
        if (!c) return "";
        if (c.nuevo) return "nuevo";
        const partes = [];
        if (c.entra) partes.push("entra a la selección");
        if (c.sale) partes.push("sale de la selección");
        if (c.puestos > 0) partes.push(`▲ ${c.puestos}`);
        if (c.puestos < 0) partes.push(`▼ ${-c.puestos}`);
        if (c.total) partes.push(`${c.total > 0 ? "+" : ""}${num(c.total)} pts`);
        return partes.join(" · ");
    }

    function detalle(f) {
        const tr = el("tr", "hidden bg-brand-50 dark:bg-brand-950");
        const td = el("td", "px-3 py-3");
        td.colSpan = 10;
        resultado.ritmos.forEach((r) => {
            const d = f.detalle[r];
            const p = el("p", "");
            if (!d || !d.torneo) { p.textContent = `${C.RITMOS[r]}: no aparece en ningún torneo de este ritmo.`; td.appendChild(p); return; }
            p.textContent = `${C.RITMOS[r]} — ${d.torneo}${d.equipo ? " (" + d.equipo + ")" : ""}: lugar ${d.puesto || "—"} → A ${num(d.A)}` +
                (d.sinMinimo ? " (jugó menos del 40 % de las rondas)" : "") +
                ` · ${num(d.pr)} de ${d.pj} sobre el tablero, rivales ${num(d.ra)} → Ps ${d.ps == null ? "sin dato (menos de 3 partidas)" : num(d.ps)} → B ${num(d.B)}` +
                ` · FIDE ${d.eloFide || "sin Elo (1400)"} → D ${num(d.D)}`;
            td.appendChild(p);
        });
        td.appendChild(el("p", "", `Elo nacional ${f.eloNacional || "sin Elo (1400)"} → C ${num(f.C)}${f.fideId ? " · código FIDE " + f.fideId : ""}${f.categorias.length ? " · categoría " + f.categorias.join(", ") : ""}`));
        if (!soloLectura) {
            const fila = el("div", "flex flex-wrap items-center gap-2 mt-2");
            if (f.soloAbsoluto || f.sexoManual) {
                fila.appendChild(f.sexo === "F"
                    ? botonAjuste("Calcular en la rama masculina", () => ajustar(f.clave, { sexo: f.sexoManual ? null : "M" }))
                    : botonAjuste("Es mujer: calcular en la femenina", () => ajustar(f.clave, { sexo: "F" })));
            }
            fila.appendChild(el("span", "text-xs", "Año de nacimiento:"));
            fila.appendChild(controlAnio(f.clave, f.nombre));
            td.appendChild(fila);
        }
        tr.appendChild(td);
        return tr;
    }

    function pintarResultados() {
        pintarPestanas();
        const filas = resultado.ramas[rama];
        const tb = $("r-filas");
        tb.textContent = "";
        $("r-caption").textContent = `Selección ${rama === "M" ? "masculina" : "femenina"}`;
        $("r-nota").textContent = `${filas.length} estudiantes que cumplen la edad (${config.anioDesde}–${config.anioHasta}). ` +
            `Ritmos: ${resultado.ritmos.map((r) => C.RITMOS[r]).join(" y ")}. Toca un nombre para ver de dónde sale cada número.`;
        filas.forEach((f) => {
            const tr = el("tr", "border-t border-brand-100 dark:border-brand-800 " + (f.estado === "seleccion" ? "bg-green-50 dark:bg-green-950" : ""));
            const c = cambios[f.clave];
            const nombre = el("button", "text-left font-semibold underline-offset-2 hover:underline", f.nombre);
            nombre.type = "button";
            nombre.setAttribute("aria-expanded", "false");
            const det = detalle(f);
            nombre.addEventListener("click", () => {
                const abrir = det.classList.contains("hidden");
                det.classList.toggle("hidden", !abrir);
                nombre.setAttribute("aria-expanded", abrir ? "true" : "false");
            });
            const celdaNombre = el("td", "px-3 py-2");
            celdaNombre.append(nombre, el("span", "block text-xs text-brand-500 dark:text-brand-300",
                [f.modalidades.join(" y "), f.equipo || f.club].filter(Boolean).join(" · ") + (f.sexoManual ? " · rama ajustada a mano" : "")));
            const estado = f.estado === "seleccion" ? "Seleccionado" : f.estado === "suplente" ? "Suplente" : "";
            const faltan = f.estado !== "seleccion" && f.faltan ? `a ${num(f.faltan)} pts del corte` : "";
            tr.append(el("td", "px-3 py-2", String(f.puesto)), celdaNombre,
                el("td", "px-3 py-2", (f.nacimiento || "") + (f.nacimientoManual ? "*" : "")),
                el("td", "px-3 py-2 text-right", num(f.A)), el("td", "px-3 py-2 text-right", num(f.B)),
                el("td", "px-3 py-2 text-right", num(f.C)), el("td", "px-3 py-2 text-right", num(f.D)),
                el("td", "px-3 py-2 text-right font-bold", num(f.total)),
                el("td", "px-3 py-2", [estado, faltan, f.desempate ? "desempate por " + (f.desempate === "C" ? "ranking nacional" : "edad") : ""].filter(Boolean).join(" · ")),
                el("td", "px-3 py-2", textoCambio(c)));
            tb.append(tr, det);
        });
        const fuera = $("fuera");
        fuera.textContent = "";
        resultado.noElegibles.forEach((p) => fuera.appendChild(el("li", "", `${p.nombre}: ${p.nacimiento ? "nació en " + p.nacimiento : "sin año de nacimiento"}`)));
        $("fuera-n").textContent = resultado.noElegibles.length;
        $("zona-resultados").classList.remove("hidden");
    }

    function pintarCambiosVivo(conCambios) {
        $("v-ultima").textContent = "Última lectura: " + HoraCR.hora(new Date(), { hour: "numeric", minute: "2-digit", second: "2-digit" });
        if (!conCambios || !anterior) return;
        const ul = $("v-cambios");
        ul.textContent = "";
        ["M", "F"].forEach((s) => resultado.ramas[s].forEach((f) => {
            const c = cambios[f.clave];
            if (c && (c.entra || c.sale)) ul.appendChild(el("li", c.entra ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300",
                `${f.nombre} ${c.entra ? "entra a" : "sale de"} la selección ${s === "M" ? "masculina" : "femenina"} (va ${f.puesto}.º con ${num(f.total)} pts).`));
        }));
        if (!ul.childNodes.length) ul.appendChild(el("li", "text-brand-500 dark:text-brand-300", "En la última lectura nadie entró ni salió de la selección."));
    }

    function encenderVivo() {
        if (reloj) { clearInterval(reloj); reloj = null; }
        if (!$("v-activo").checked) return;
        const minutos = Number($("v-cada").value) || 2;
        reloj = setInterval(() => { if (!document.hidden) actualizarVivo(); }, minutos * 60_000);
    }
    async function actualizarVivo() {
        if (soloLectura && seleccionId) {
            const { data } = await sb.rpc("seleccion_compartida", { p_id: seleccionId });
            if (data && data.config) { config = normalizar(data.config); pintarFormulario(); }
        }
        await cargarTodo(true);
    }

    // ---------------------------------------------------------- guardar y compartir

    async function guardar() {
        leerFormulario();
        if ((config.nombre || "").length < 2) { avisar("Ponle un nombre a la selección.", true); return; }
        const fila = { nombre: config.nombre, config, actualizada_en: new Date().toISOString() };
        let r;
        if (seleccionId) r = await sb.from("selecciones_arbitraje").update(fila).eq("id", seleccionId).select("id").single();
        else {
            const { data: { session } } = await sb.auth.getSession();
            r = await sb.from("selecciones_arbitraje").insert(Object.assign({ creada_por: session.user.id }, fila)).select("id").single();
        }
        if (r.error) { avisar("No se pudo guardar: " + r.error.message, true); return; }
        seleccionId = r.data.id;
        history.replaceState(null, "", "seleccion-codicader.html?s=" + seleccionId);
        guardarBorrador();
        avisar("Selección guardada.");
    }

    async function copiarEnlace() {
        if (!seleccionId) await guardar();
        if (!seleccionId) return;
        const url = location.origin + "/seleccion-codicader.html?s=" + seleccionId;
        try {
            await navigator.clipboard.writeText(url);
            avisar("Enlace copiado. Lo abre cualquier profesor con licencia, con tus torneos y tus ajustes.");
        } catch (e) {
            await Avisos.alerta(url, { titulo: "El enlace para profesores", aceptar: "Listo" });
        }
    }

    function csv() {
        if (!resultado) return;
        const filas = [["Rama", "Puesto", "Estudiante", "Nacimiento", "A", "B", "C", "D", "Total", "Estado"]];
        ["M", "F"].forEach((s) => resultado.ramas[s].forEach((f) => filas.push([s === "M" ? "Masculina" : "Femenina", f.puesto, f.nombre, f.nacimiento || "",
            f.A, f.B, f.C, f.D, f.total, f.estado === "seleccion" ? "Seleccionado" : f.estado === "suplente" ? "Suplente" : ""])));
        const texto = filas.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
        const a = el("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
        a.download = (config.nombre || "seleccion").replace(/[^\w-]+/g, "_") + ".csv";
        document.body.appendChild(a); a.click(); a.remove();
    }

    // ---------------------------------------------------------- arranque

    function normalizar(c) {
        const base = { nombre: "", anioDesde: null, anioHasta: null, cupos: { M: 5, F: 5 }, suplentes: 3, torneos: [], ajustes: {} };
        const n = Object.assign(base, c || {});
        n.cupos = Object.assign({ M: 5, F: 5 }, n.cupos);
        n.torneos = (n.torneos || []).map((t) => Object.assign({ url: "", rama: "A", ritmo: "clasico", categoria: "", auto: true }, t));
        n.ajustes = n.ajustes || {};
        return n;
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=seleccion-codicader.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "seleccion-codicader" });
        $("loading").classList.add("hidden");
        if (error || puede !== true) { $("denegado").classList.remove("hidden"); return; }

        const id = new URLSearchParams(location.search).get("s");
        if (id && /^[0-9a-f-]{36}$/i.test(id)) {
            const r = await sb.rpc("seleccion_compartida", { p_id: id });
            if (r.error) { avisar(r.error.message, true); }
            else {
                config = normalizar(r.data.config);
                seleccionId = r.data.id;
                soloLectura = !r.data.mia;
                if (soloLectura) {
                    $("compartida").textContent = `Estás viendo «${r.data.nombre}», que armó otra persona. Ves sus torneos y sus ajustes; para cambiarlos, pídeselo a ella.`;
                    $("compartida").classList.remove("hidden");
                }
            }
        } else {
            try {
                const b = JSON.parse(localStorage.getItem(BORRADOR) || "null");
                if (b && b.config) { config = normalizar(b.config); seleccionId = b.seleccionId || null; }
            } catch (e) { /* sin borrador */ }
            if (!config.torneos.length) { config = normalizar(Object.assign({}, PLANTILLAS.colegial)); config.torneos = [{ url: "", rama: "A", ritmo: "clasico", categoria: "D", auto: true }]; }
        }
        pintarFormulario();
        ["c-nombre", "c-desde", "c-hasta", "c-cupos-m", "c-cupos-f", "c-suplentes"].forEach((i) => {
            $(i).disabled = soloLectura;
            $(i).addEventListener("change", () => { leerFormulario(); guardarBorrador(); recalcular(); });
        });
        $("c-plantilla").disabled = soloLectura;
        $("c-plantilla").addEventListener("change", () => {
            const p = PLANTILLAS[$("c-plantilla").value];
            if (!p) return;
            Object.assign(config, { nombre: p.nombre, anioDesde: p.anioDesde, anioHasta: p.anioHasta, cupos: Object.assign({}, p.cupos), suplentes: p.suplentes });
            $("c-nota").textContent = p.nota;
            pintarFormulario();
            guardarBorrador();
        });
        $("b-agregar").classList.toggle("hidden", soloLectura);
        $("b-agregar").addEventListener("click", () => { config.torneos.push({ url: "", rama: "A", ritmo: "clasico", categoria: "", auto: true }); pintarTorneos(); });
        $("b-calcular").addEventListener("click", () => cargarTodo(false));
        $("b-guardar").classList.toggle("hidden", soloLectura);
        $("b-guardar").addEventListener("click", guardar);
        $("b-enlace").addEventListener("click", copiarEnlace);
        $("b-csv").addEventListener("click", csv);
        document.querySelectorAll(".pestana").forEach((b) => b.addEventListener("click", () => { rama = b.dataset.rama; if (resultado) pintarResultados(); }));
        $("v-activo").addEventListener("change", encenderVivo);
        $("v-cada").addEventListener("change", encenderVivo);
        $("app").classList.remove("hidden");
        if (config.torneos.some((t) => t.url)) cargarTodo(true);
    }
    init();
})();
