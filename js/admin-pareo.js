/* La moderación de «Torneos en Pareo Integral» (admin-pareo.html).
 *
 * Lo que la gente reporta desde la página de cada torneo (pareo_reportes),
 * quién pide el sello (pareo_solicitudes_sello), el sello «Organizador
 * verificado», ocultar o mostrar una organización o un torneo y el historial
 * (pareo_moderaciones). Todo lo escribe una sola función de la base,
 * public.pareo_moderar_con_motivo, que valida que sea quien administra, deja
 * la bitácora y anota el motivo: acá solo se pinta y se llama. Ocultar no
 * borra: deja de verse en la lista pública (la RLS lo esconde a todos menos
 * a administración).
 *
 * Ver «Torneos en Pareo Integral: el organizador y la moderación» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const MOTIVO = {
        inapropiado: "Contenido inapropiado", datos_personales: "Datos personales que no debería mostrar",
        falso: "Falso o de prueba", error: "Tiene un error", otro: "Otra cosa",
    };
    const BOTON = "border border-brand-300 dark:border-brand-600 font-semibold px-3 py-1 rounded-lg text-sm hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50";
    const ENLACE = "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }
    const fecha = (x) => (window.HoraCR ? HoraCR.fechaHora(x) : String(x));
    const enlaceTorneo = (id, nombre) => el("a", { href: "torneos-pareo.html#t=" + encodeURIComponent(id), target: "_blank", rel: "noopener", class: ENLACE }, nombre || "(sin nombre)",
        el("span", { class: "sr-only", texto: " (se abre en otra pestaña)" }));
    const tabla = (cabeza, filas, vacio) => (filas.length
        ? el("div", { class: "overflow-x-auto" }, el("table", { class: "pi-tabla" },
            el("thead", {}, el("tr", {}, cabeza.map((c) => el("th", { scope: "col", texto: c })))),
            el("tbody", {}, filas)))
        : el("p", { class: "text-sm text-brand-600 dark:text-brand-300", texto: vacio }));

    // Qué dice el historial de cada acción.
    const ACCION = {
        verificar: "Dio el sello", quitar_sello: "Quitó el sello", ocultar_org: "Ocultó la organización", mostrar_org: "Mostró la organización",
        ocultar: "Ocultó el torneo", mostrar: "Mostró el torneo", revisado: "Revisó un reporte", aprobar_sello: "Aprobó el sello", rechazar_sello: "Rechazó el sello",
    };
    // Todo pide el motivo (puede ir vacío), menos marcar un reporte revisado.
    async function moderar(que, id, boton, hecho) {
        let motivo = "";
        if (que !== "revisado") {
            const r = await Avisos.formulario({ titulo: ACCION[que], texto: "Queda en el historial. Si es algo que se repite, sirve saber por qué.",
                aceptar: ACCION[que], cancelar: "Cancelar", campos: [{ nombre: "motivo", etiqueta: "Por qué (si quieres)", tipo: "textarea", valor: "", max: 500 }] });
            if (!r) return;
            motivo = String(r.motivo || "").trim();
        }
        boton.disabled = true;
        const { error } = await window.sb.rpc("pareo_moderar_con_motivo", { p_que: que, p_id: id, p_motivo: motivo });
        boton.disabled = false;
        if (error) { Avisos.avisar("No se pudo: " + error.message, { tipo: "error" }); return; }
        $("ap-estado").textContent = hecho;
        Avisos.avisar(hecho);
        await pintarTodo();
    }

    let organizaciones = [];

    async function pintarReportes() {
        const { data, error } = await window.sb.from("pareo_reportes").select("id,publicado_id,motivo,detalle,creado")
            .eq("estado", "nuevo").order("creado", { ascending: false }).range(0, 199);
        if (error) { $("ap-reportes").replaceChildren(el("p", { class: "text-sm", role: "alert", texto: "No se pudieron leer los reportes: " + error.message })); return; }
        const ids = [...new Set((data || []).map((r) => r.publicado_id))];
        const torneos = new Map();
        if (ids.length) {
            const r = await window.sb.from("pareo_publicados").select("id,nombre,oculto").in("id", ids);
            for (const x of r.data || []) torneos.set(x.id, x);
        }
        const filas = (data || []).map((r) => {
            const t = torneos.get(r.publicado_id) || { id: r.publicado_id, nombre: "(ya no está publicado)", oculto: false };
            const ocultar = el("button", { type: "button", class: BOTON, "data-ocultar": t.id }, t.oculto ? "Mostrar el torneo" : "Ocultar el torneo");
            ocultar.addEventListener("click", () => moderar(t.oculto ? "mostrar" : "ocultar", t.id, ocultar, t.oculto ? "El torneo se ve otra vez en la lista." : "El torneo ya no sale en la lista pública."));
            const revisado = el("button", { type: "button", class: BOTON, "data-revisado": r.id }, "Marcar revisado");
            revisado.addEventListener("click", () => moderar("revisado", r.id, revisado, "Reporte marcado como revisado."));
            return el("tr", { "data-reporte": r.id },
                el("td", { class: "whitespace-nowrap", texto: fecha(r.creado) }),
                el("td", {}, enlaceTorneo(t.id, t.nombre), t.oculto ? el("span", { class: "block text-xs font-semibold", texto: "Oculto" }) : null),
                el("td", { texto: MOTIVO[r.motivo] || r.motivo }),
                el("td", { class: "max-w-xs", texto: r.detalle || "—" }),
                el("td", {}, el("div", { class: "flex flex-wrap gap-2" }, ocultar, revisado)));
        });
        $("ap-reportes").replaceChildren(tabla(["Cuándo", "Torneo", "Qué pasa", "Detalle", ""], filas, "No hay reportes nuevos."));
    }

    async function leerOrganizaciones() {
        const { data, error } = await window.sb.from("pareo_organizadores").select("id,nombre,logo,verificado,oculto")
            .order("nombre").range(0, 999);
        if (error) throw error;
        organizaciones = data || [];
    }
    function pintarOrganizaciones() {
        const q = $("ap-org-buscar").value.trim().toLowerCase();
        const lista = organizaciones.filter((o) => !q || o.nombre.toLowerCase().includes(q));
        const filas = lista.map((o) => {
            const selloB = el("button", { type: "button", class: BOTON, "data-sello": o.id }, o.verificado ? "Quitar el sello" : "Dar el sello");
            selloB.addEventListener("click", () => moderar(o.verificado ? "quitar_sello" : "verificar", o.id, selloB,
                o.verificado ? "«" + o.nombre + "» ya no tiene el sello." : "«" + o.nombre + "» tiene el sello «Verificado»."));
            const ocultarB = el("button", { type: "button", class: BOTON, "data-org-ocultar": o.id }, o.oculto ? "Mostrar" : "Ocultar");
            ocultarB.addEventListener("click", () => moderar(o.oculto ? "mostrar_org" : "ocultar_org", o.id, ocultarB,
                o.oculto ? "«" + o.nombre + "» se ve otra vez." : "«" + o.nombre + "» ya no sale en la lista pública."));
            return el("tr", { "data-org": o.id },
                el("td", {}, LOGO.test(o.logo || "") ? el("img", { src: o.logo, alt: "Logo de " + o.nombre, class: "tp-org-logo" }) : el("span", { texto: "—" })),
                el("td", {}, el("a", { href: "torneos-pareo.html#o=" + encodeURIComponent(o.id), target: "_blank", rel: "noopener", class: ENLACE + " font-semibold" }, o.nombre)),
                el("td", { texto: (o.verificado ? "✓ Verificado" : "Sin sello") + (o.oculto ? " · Oculta" : "") }),
                el("td", {}, el("div", { class: "flex flex-wrap gap-2" }, selloB, ocultarB)));
        });
        $("ap-organizaciones").replaceChildren(tabla(["Logo", "Nombre", "Estado", ""], filas, q ? "Ninguna organización coincide." : "Todavía nadie creó su organización."));
    }

    async function pintarOcultos() {
        const { data, error } = await window.sb.from("pareo_publicados").select("id,nombre,fecha").eq("oculto", true)
            .order("fecha", { ascending: false }).range(0, 199);
        if (error) { $("ap-ocultos").replaceChildren(el("p", { class: "text-sm", role: "alert", texto: error.message })); return; }
        const filas = (data || []).map((t) => {
            const mostrar = el("button", { type: "button", class: BOTON, "data-mostrar": t.id }, "Mostrar");
            mostrar.addEventListener("click", () => moderar("mostrar", t.id, mostrar, "El torneo se ve otra vez en la lista."));
            return el("tr", { "data-oculto": t.id }, el("td", {}, enlaceTorneo(t.id, t.nombre)), el("td", { texto: t.fecha || "—" }), el("td", {}, mostrar));
        });
        $("ap-ocultos").replaceChildren(tabla(["Torneo", "Fecha", ""], filas, "No hay torneos ocultos."));
    }

    async function pintarSello() {
        const { data, error } = await window.sb.from("pareo_solicitudes_sello").select("id,organizador_id,quien,representa,contacto,nota,creado")
            .eq("estado", "nueva").order("creado", { ascending: true }).range(0, 199);
        if (error) { $("ap-sello").replaceChildren(el("p", { class: "text-sm", role: "alert", texto: "No se pudieron leer las solicitudes: " + error.message })); return; }
        const nombre = (id) => (organizaciones.find((o) => o.id === id) || {}).nombre || "(organización)";
        const filas = (data || []).map((s) => {
            const si = el("button", { type: "button", class: BOTON, "data-aprobar": s.id }, "Dar el sello");
            si.addEventListener("click", () => moderar("aprobar_sello", s.id, si, "«" + nombre(s.organizador_id) + "» tiene el sello «Verificado»."));
            const no = el("button", { type: "button", class: BOTON, "data-rechazar": s.id }, "Rechazar");
            no.addEventListener("click", () => moderar("rechazar_sello", s.id, no, "Solicitud rechazada."));
            return el("tr", { "data-solicitud": s.id },
                el("td", { class: "whitespace-nowrap", texto: fecha(s.creado) }),
                el("td", {}, el("a", { href: "torneos-pareo.html#o=" + encodeURIComponent(s.organizador_id), target: "_blank", rel: "noopener", class: ENLACE + " font-semibold" }, nombre(s.organizador_id),
                    el("span", { class: "sr-only", texto: " (se abre en otra pestaña)" }))),
                el("td", {}, el("span", { class: "block", texto: s.quien }), el("span", { class: "block text-xs", texto: s.representa })),
                el("td", { texto: s.contacto }),
                el("td", { class: "max-w-xs", texto: s.nota || "—" }),
                el("td", {}, el("div", { class: "flex flex-wrap gap-2" }, si, no)));
        });
        $("ap-sello").replaceChildren(tabla(["Cuándo", "Organización", "Quién la pide", "Contacto", "Nota", ""], filas, "Nadie está pidiendo el sello."));
    }

    async function pintarHistorial() {
        const { data, error } = await window.sb.from("pareo_moderaciones").select("id,que,nombre,motivo,cuando")
            .order("cuando", { ascending: false }).range(0, 99);
        if (error) { $("ap-historial").replaceChildren(el("p", { class: "text-sm", role: "alert", texto: error.message })); return; }
        const filas = (data || []).map((h) => el("tr", { "data-historial": h.id },
            el("td", { class: "whitespace-nowrap", texto: fecha(h.cuando) }),
            el("td", { texto: ACCION[h.que] || h.que }),
            el("td", { texto: h.nombre || "—" }),
            el("td", { class: "max-w-xs", texto: h.motivo || "—" })));
        $("ap-historial").replaceChildren(tabla(["Cuándo", "Qué", "Sobre qué", "Por qué"], filas, "Todavía no se hizo nada desde acá."));
    }

    // public.pareo_cifras(): la cuenta la hace la base (solo para
    // administración) y acá solo se pinta. Los meses van escritos en una tabla.
    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
    const mesTexto = (m) => { const [a, n] = String(m).split("-"); return (MESES[Number(n) - 1] || n) + " de " + a; };
    async function pintarCifras() {
        const { data: c, error } = await window.sb.rpc("pareo_cifras");
        if (error || !c) { $("ap-cifras").replaceChildren(el("p", { class: "text-sm", role: "alert", texto: error ? error.message : "Sin datos." })); return; }
        const ext = c.externos || {};
        const datos = [
            ["Torneos publicados", c.torneos], ["Torneos ocultos", c.ocultos], ["Jugadores distintos", c.jugadores],
            ["Organizaciones", c.organizadores], ["Organizaciones activas (90 días)", c.organizadores_activos], ["Con el sello «Verificado»", c.verificados],
            ["Suscripciones confirmadas", c.suscripciones], ["Sin confirmar todavía", c.suscripciones_sin_confirmar], ["Personas que siguen a alguien", c.seguidores], ["Aparatos con avisos en el celular", c.aparatos],
            ["Avisos mandados (30 días)", c.avisos_30_dias], ["Reportes por revisar", c.reportes_nuevos], ["Piden el sello", c.sellos_pendientes],
            ["De ajedrezcostarica.com", ext.ajedrezcostarica || 0], ["De chess-results", ext["chess-results"] || 0],
        ];
        $("ap-cifras").replaceChildren(
            el("dl", { id: "ap-cifras-numeros", class: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4" }, datos.map(([k, v]) => el("div", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-cifra": k },
                el("dt", { class: "text-xs font-semibold text-brand-600 dark:text-brand-300", texto: k }), el("dd", { class: "text-xl font-bold", texto: String(v == null ? 0 : v) })))),
            el("h3", { class: "font-semibold mb-1", texto: "Torneos por mes (los últimos 12)" }),
            tabla(["Mes", "Torneos", "Jugadores"], (c.por_mes || []).slice().reverse().map((m) => el("tr", { "data-mes": m.mes },
                el("td", { texto: mesTexto(m.mes) }), el("td", { class: "num", texto: String(m.torneos) }), el("td", { class: "num", texto: String(m.jugadores || 0) }))),
                "Ningún torneo publicado en los últimos 12 meses."));
    }

    async function pintarTodo() {
        try { await leerOrganizaciones(); } catch (e) { organizaciones = []; }
        await Promise.all([pintarCifras(), pintarReportes(), pintarOcultos(), pintarSello(), pintarHistorial()]);
        pintarOrganizaciones();
    }

    async function init() {
        const { data } = await window.sb.auth.getSession();
        const session = data.session;
        if (!session) { location.href = "login.html?next=admin-pareo.html"; return; }
        const { data: perfil } = await window.sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
        $("loading").classList.add("hidden");
        if (!perfil || !perfil.is_admin) { $("denegado").classList.remove("hidden"); return; }
        $("app").classList.remove("hidden");
        $("ap-org-buscar").addEventListener("input", pintarOrganizaciones);
        await pintarTodo();
    }

    init();
})();
