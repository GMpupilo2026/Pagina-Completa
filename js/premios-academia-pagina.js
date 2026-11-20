/* El código de premios-academia.html: el supervisor (o quien administra) arma
   los premios de su academia y entrega lo que canjean sus alumnos.

   Quién ve y quién puede lo decide la base: la RLS de premios_academia y
   premios_academia_canjes, y las funciones premio_academia_guardar() y
   canje_academia_resolver(), que validan. Ver «Los premios de cada academia»
   en docs/decisiones/puntos-y-premios.md. Lo escrito por una persona va por
   textContent. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const P = window.PremiosAcademia;
    const CAMPO = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

    let academias = [], academia = null, premios = [], canjes = [], nombres = {};

    function anunciar(t) { const a = $("anuncio"); a.textContent = ""; setTimeout(() => { a.textContent = t; }, 50); }

    async function init() {
        const { data } = await sb.auth.getSession();
        if (!data.session) { location.href = "login.html?next=premios-academia.html"; return; }
        const yo = data.session.user.id;
        const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", yo).single();
        const esAdmin = !!(perfil && perfil.is_admin);
        let q = sb.from("academias").select("id, nombre, supervisor_id").order("nombre");
        if (!esAdmin) q = q.eq("supervisor_id", yo);
        academias = (await q).data || [];
        $("loading").classList.add("hidden");
        $("app").classList.remove("hidden");
        if (!academias.length) { $("sin-permiso").classList.remove("hidden"); return; }
        $("cuerpo").classList.remove("hidden");

        const sel = $("academia");
        academias.forEach((a) => { const o = document.createElement("option"); o.value = a.id; o.textContent = a.nombre; sel.appendChild(o); });
        $("academia-caja").classList.toggle("hidden", academias.length < 2);
        academia = academias[0].id;
        sel.addEventListener("change", () => { academia = sel.value; cargar(); });
        $("nuevo").addEventListener("click", () => {
            const caja = $("premios");
            if (caja.querySelector('[data-premio="nuevo"]')) { caja.querySelector('[data-premio="nuevo"] input').focus(); return; }
            const f = formulario(null);
            caja.prepend(f);
            f.querySelector("input").focus();
        });
        await cargar();
    }

    async function cargar() {
        const [{ data: pr }, { data: cj }] = await Promise.all([
            sb.from("premios_academia").select("*").eq("academia_id", academia).order("activo", { ascending: false }).order("costo_puntos"),
            sb.from("premios_academia_canjes").select("*").eq("academia_id", academia).order("created_at", { ascending: false }).range(0, 199),
        ]);
        premios = pr || [];
        canjes = cj || [];
        const ids = [...new Set(canjes.map((c) => c.alumno_id))].filter((id) => !nombres[id]);
        if (ids.length) {
            const { data: gente } = await sb.from("profiles").select("id, full_name").in("id", ids);
            (gente || []).forEach((g) => { nombres[g.id] = g.full_name || "—"; });
        }
        pintar();
    }

    function pintar() {
        const pend = canjes.filter((c) => c.estado === "pendiente");
        const ul = $("pendientes");
        ul.replaceChildren();
        $("pendientes-titulo").textContent = pend.length ? `Por entregar (${pend.length})` : "Por entregar";
        if (!pend.length) ul.appendChild(P.el("li", "text-sm text-brand-500 dark:text-brand-300", "No hay nada por entregar."));
        pend.forEach((c) => {
            const li = P.el("li", "bg-white dark:bg-brand-950 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2");
            const quien = nombres[c.alumno_id] || "—";
            li.appendChild(P.el("span", "text-sm text-brand-800 dark:text-brand-100", `${quien} canjeó «${c.nombre}» (${P.fmt(c.costo_pagado)} puntos) el ${P.fecha(c.created_at)}`));
            const botones = P.el("div", "flex gap-2");
            const ya = P.el("button", P.PRIMARIO, "Ya se lo entregué");
            ya.type = "button";
            ya.setAttribute("aria-label", `Ya le entregué «${c.nombre}» a ${quien}`);
            ya.addEventListener("click", () => resolver(c, "entregado"));
            const no = P.el("button", P.SECUNDARIO, "Cancelar y devolver puntos");
            no.type = "button";
            no.setAttribute("aria-label", `Cancelar «${c.nombre}» de ${quien} y devolverle los puntos`);
            no.addEventListener("click", () => resolver(c, "cancelado"));
            botones.append(ya, no);
            li.appendChild(botones);
            ul.appendChild(li);
        });

        const caja = $("premios");
        caja.replaceChildren();
        if (!premios.length) caja.appendChild(P.el("p", "text-sm text-brand-500 dark:text-brand-300", "Todavía no hay premios. Arma el primero con «Nuevo premio»."));
        premios.forEach((p) => caja.appendChild(formulario(p)));

        const res = $("resueltos");
        res.replaceChildren();
        const hechos = canjes.filter((c) => c.estado !== "pendiente").slice(0, 50);
        if (!hechos.length) res.appendChild(P.el("li", "text-brand-500 dark:text-brand-300", "Todavía no hay ninguno."));
        hechos.forEach((c) => res.appendChild(P.el("li", "text-brand-700 dark:text-brand-200",
            `${nombres[c.alumno_id] || "—"} · «${c.nombre}» · ${P.ESTADO[c.estado]} el ${P.fecha(c.resuelto_at || c.created_at)}`)));
    }

    /* Un premio: sus campos, Guardar, y Apagar/Encender (no se borran: un
       canje viejo seguiría apuntándole). */
    function formulario(p) {
        const nuevo = !p;
        const id = nuevo ? "nuevo" : p.id;
        const div = P.el("div", "rounded-xl border border-brand-100 dark:border-brand-800 p-4 grid gap-3 sm:grid-cols-6 items-end" + (p && !p.activo ? " opacity-75" : ""));
        div.dataset.premio = id;
        const campo = (etiqueta, input, cols) => {
            const w = P.el("div", cols || "");
            const l = P.el("label", "block text-xs font-semibold text-brand-500 dark:text-brand-300 mb-1", etiqueta);
            input.id = "p-" + input.name + "-" + id;
            l.htmlFor = input.id;
            w.append(l, input);
            return w;
        };
        const entrada = (name, type, valor, extra) => {
            const i = document.createElement("input");
            i.name = name; i.type = type; i.className = CAMPO;
            if (valor != null) i.value = valor;
            Object.assign(i, extra || {});
            return i;
        };
        const emoji = entrada("emoji", "text", p ? p.emoji : "🎁", { maxLength: 8 });
        const nombre = entrada("nombre", "text", p ? p.nombre : "", { maxLength: 80, placeholder: "Ej. Una clase extra" });
        const costo = entrada("costo", "number", p ? p.costo_puntos : "", { min: 1, max: 1000000, placeholder: "Ej. 2000" });
        const exist = entrada("existencias", "number", p && p.existencias != null ? p.existencias : "", { min: 0, max: 100000, placeholder: "Sin límite" });
        const limite = entrada("limite", "number", p && p.limite_por_alumno != null ? p.limite_por_alumno : "", { min: 1, max: 1000, placeholder: "Sin límite" });
        const desc = entrada("descripcion", "text", p ? p.descripcion : "", { maxLength: 300, placeholder: "Ej. 30 minutos con el profe, a coordinar" });
        div.append(
            campo("Emoji", emoji, "sm:col-span-1"),
            campo("Nombre", nombre, "sm:col-span-3"),
            campo("Puntos que cuesta", costo, "sm:col-span-2"),
            campo("Descripción (opcional)", desc, "sm:col-span-4"),
            campo("Cuántos hay", exist, "sm:col-span-1"),
            campo("Veces por alumno", limite, "sm:col-span-1"),
        );
        const pie = P.el("div", "sm:col-span-6 flex flex-wrap items-center gap-3");
        const guardar = P.el("button", P.PRIMARIO, nuevo ? "Crear el premio" : "Guardar");
        guardar.type = "button";
        const activo = !p || p.activo;
        guardar.addEventListener("click", () => guardarPremio(p, { emoji, nombre, costo, exist, limite, desc }, activo));
        pie.appendChild(guardar);
        if (!nuevo) {
            const onoff = P.el("button", P.SECUNDARIO, p.activo ? "Apagarlo" : "Volver a ofrecerlo");
            onoff.type = "button";
            onoff.addEventListener("click", () => guardarPremio(p, { emoji, nombre, costo, exist, limite, desc }, !p.activo));
            pie.appendChild(onoff);
            const veces = canjes.filter((c) => c.premio_id === p.id && c.estado !== "cancelado").length;
            pie.appendChild(P.el("span", "text-xs text-brand-500 dark:text-brand-300",
                (p.activo ? "Se ofrece en la tienda" : "Apagado: no se ofrece") + " · " + (veces ? "canjeado " + veces + (veces === 1 ? " vez" : " veces") : "nadie lo ha canjeado")));
        }
        div.appendChild(pie);
        return div;
    }

    async function guardarPremio(p, f, activo) {
        const num = (i) => (i.value === "" ? null : parseInt(i.value, 10));
        if (!f.nombre.value.trim()) { Avisos.avisar("El premio necesita un nombre.", { tipo: "error" }); f.nombre.focus(); return; }
        if (!(num(f.costo) >= 1)) { Avisos.avisar("Pon cuántos puntos cuesta.", { tipo: "error" }); f.costo.focus(); return; }
        const { error } = await sb.rpc("premio_academia_guardar", {
            p_id: p ? p.id : null, p_academia: academia, p_nombre: f.nombre.value.trim(), p_descripcion: f.desc.value.trim(),
            p_emoji: f.emoji.value.trim(), p_costo: num(f.costo), p_existencias: num(f.exist), p_limite_por_alumno: num(f.limite), p_activo: activo,
        });
        if (error) { Avisos.avisar("No se pudo guardar: " + error.message, { tipo: "error" }); return; }
        await cargar();
        anunciar("Guardado: " + f.nombre.value.trim() + (activo ? "." : ", apagado."));
    }

    async function resolver(c, estado) {
        const quien = nombres[c.alumno_id] || "este alumno";
        if (estado === "cancelado" && !(await Avisos.confirmar(`Se le devuelven ${P.fmt(c.costo_pagado)} puntos a ${quien}.`,
            { titulo: "¿Cancelar «" + c.nombre + "»?", aceptar: "Cancelar y devolver puntos" }))) return;
        const { error } = await sb.rpc("canje_academia_resolver", { p_canje: c.id, p_estado: estado });
        if (error) { Avisos.avisar("No se pudo: " + error.message, { tipo: "error" }); return; }
        await cargar();
        anunciar(estado === "entregado" ? `Marcado como entregado: «${c.nombre}» de ${quien}.` : `Cancelado: se le devolvieron los puntos a ${quien}.`);
    }

    if (window.sb) init();
})();

/*! rev bfb5bbb0d2d82f9f */
