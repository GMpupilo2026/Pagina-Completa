/* El código de prospectos.html: los interesados.

   El seguimiento de quien preguntó por clases, hasta que se inscribe o se
   descarta. Solo interno (lo decidió el dueño): no hay formulario público,
   la entrada pública sigue siendo unirse.html. La idea salió de Chessgora
   («Prospectos»). Ver «Interesados: el seguimiento de quien preguntó por
   clases» en docs/decisiones/paneles.md.

   - Quién ve a quién lo decide la RLS de `prospectos`: quien administra,
     todos; el supervisor, los de SUS academias. Esta página solo pinta.
   - Lo que escribe una persona (nombre, contacto, notas) va por textContent.
   - Los días se cuentan en hora de Costa Rica (js/hora-cr.js): «toca hoy» es
     `proximo_contacto <= HoraCR.hoy()`. */

(function () {
    const $ = (id) => document.getElementById(id);

    const ESTADOS = [
        { id: "nuevo", nombre: "Nuevo", emoji: "🆕" },
        { id: "contactado", nombre: "Contactado", emoji: "📞" },
        { id: "clase_prueba", nombre: "Clase de prueba", emoji: "♟️" },
        { id: "inscrito", nombre: "Inscrito", emoji: "✅" },
        { id: "descartado", nombre: "Descartado", emoji: "🗃️" },
    ];
    const ORIGENES = [
        { id: "whatsapp", nombre: "WhatsApp" }, { id: "colegio", nombre: "Un colegio" },
        { id: "unirse", nombre: "«Unirse» de la página" }, { id: "recomendacion", nombre: "Una recomendación" },
        { id: "redes", nombre: "Redes sociales" }, { id: "torneo", nombre: "Un torneo" }, { id: "otro", nombre: "Otro" },
    ];
    const PARA = [
        { id: "", nombre: "Sin decir" }, { id: "el_mismo", nombre: "La misma persona" },
        { id: "hijo", nombre: "Su hijo o hija" }, { id: "otro", nombre: "Otra persona" },
    ];
    const ACTIVO = (p) => p.estado !== "inscrito" && p.estado !== "descartado";
    const nombreDe = (lista, id) => (lista.find((x) => x.id === id) || {}).nombre || "";

    let yo = null, esAdmin = false;
    let academias = [];       // las que puede usar: todas (administración) o las suyas
    let interesados = [];
    let filtro = "activos";   // "activos", "todos" o un estado

    const CAMPO = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

    function opciones(sel, lista) {
        sel.innerHTML = "";
        lista.forEach((o) => { const op = document.createElement("option"); op.value = o.id; op.textContent = o.nombre; sel.appendChild(op); });
    }
    function anunciar(t) { const a = $("anuncio"); a.textContent = ""; setTimeout(() => { a.textContent = t; }, 50); }

    async function init() {
        const { data } = await sb.auth.getSession();
        if (!data.session) { location.href = "login.html?next=prospectos.html"; return; }
        yo = data.session.user.id;
        const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", yo).single();
        esAdmin = !!(perfil && perfil.is_admin);
        let q = sb.from("academias").select("id, nombre, supervisor_id").order("nombre");
        if (!esAdmin) q = q.eq("supervisor_id", yo);
        const { data: acs } = await q;
        academias = acs || [];
        $("loading").classList.add("hidden");
        $("app").classList.remove("hidden");
        if (!esAdmin && !academias.length) { $("sin-permiso").classList.remove("hidden"); return; }
        $("cuerpo").classList.remove("hidden");

        opciones($("p-origen"), ORIGENES);
        opciones($("p-para"), PARA);
        const listaAc = academias.map((a) => ({ id: a.id, nombre: a.nombre }));
        opciones($("p-academia"), esAdmin ? [{ id: "", nombre: "Todavía de ninguna" }].concat(listaAc) : listaAc);
        // Con una sola academia no hay qué elegir.
        $("p-academia-caja").classList.toggle("hidden", !esAdmin && academias.length === 1);
        $("form-agregar").addEventListener("submit", agregar);
        await cargar();
    }

    // De mil en mil: PostgREST corta a ~1000 filas sin avisar.
    async function cargar() {
        const PASO = 1000; let desde = 0, todo = [];
        for (;;) {
            const { data, error } = await sb.from("prospectos")
                .select("id, academia_id, nombre, contacto, para_quien, edad, origen, estado, proximo_contacto, notas, created_at, updated_at")
                .order("created_at", { ascending: false }).order("id").range(desde, desde + PASO - 1);
            if (error) { Avisos.avisar("No se pudieron cargar los interesados: " + error.message, { tipo: "error" }); break; }
            todo = todo.concat(data || []);
            if (!data || data.length < PASO) break;
            desde += PASO;
        }
        interesados = todo;
        pintar();
    }

    const tocaHoy = (p) => ACTIVO(p) && p.proximo_contacto && p.proximo_contacto <= HoraCR.hoy();

    function pintar() {
        pintarEmbudo();
        const hoy = interesados.filter(tocaHoy).sort((a, b) => a.proximo_contacto.localeCompare(b.proximo_contacto));
        $("hoy-caja").classList.toggle("hidden", !hoy.length);
        $("hoy-titulo").textContent = hoy.length === 1 ? "Hoy toca contactar a 1 persona" : `Hoy toca contactar a ${hoy.length} personas`;
        $("hoy-lista").innerHTML = "";
        hoy.forEach((p) => $("hoy-lista").appendChild(tarjeta(p)));

        const lista = interesados.filter((p) => !tocaHoy(p)).filter((p) =>
            filtro === "todos" ? true : filtro === "activos" ? ACTIVO(p) : p.estado === filtro);
        // Primero los que tienen fecha (la más próxima arriba), después el resto, el más nuevo arriba.
        lista.sort((a, b) => (a.proximo_contacto ? 0 : 1) - (b.proximo_contacto ? 0 : 1)
            || String(a.proximo_contacto || "").localeCompare(String(b.proximo_contacto || ""))
            || String(b.created_at).localeCompare(String(a.created_at)));
        $("lista").innerHTML = "";
        lista.forEach((p) => $("lista").appendChild(tarjeta(p)));
        const vacia = $("lista-vacia");
        vacia.classList.toggle("hidden", !!lista.length);
        vacia.textContent = interesados.length ? "No hay ninguno en este paso." : "Todavía no hay ninguno. Agrega el primero arriba.";
        $("lista-titulo").textContent = filtro === "todos" ? "Todos" : filtro === "activos" ? "En seguimiento" : nombreDe(ESTADOS, filtro);
    }

    function pintarEmbudo() {
        const caja = $("embudo");
        caja.innerHTML = "";
        const botones = [{ id: "activos", nombre: "En seguimiento", n: interesados.filter(ACTIVO).length }]
            .concat(ESTADOS.map((e) => ({ id: e.id, nombre: e.nombre, emoji: e.emoji, n: interesados.filter((p) => p.estado === e.id).length })))
            .concat([{ id: "todos", nombre: "Todos", n: interesados.length }]);
        botones.forEach((b) => {
            const btn = document.createElement("button");
            btn.type = "button";
            const activo = filtro === b.id;
            btn.setAttribute("aria-pressed", activo ? "true" : "false");
            btn.className = "text-sm font-semibold px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
                + (activo ? "bg-accent-500 text-brand-900" : "bg-white dark:bg-brand-900 shadow-sm hover:bg-brand-100 dark:hover:bg-brand-800 text-brand-700 dark:text-brand-200");
            if (b.emoji) { const e = document.createElement("span"); e.setAttribute("aria-hidden", "true"); e.textContent = b.emoji + " "; btn.appendChild(e); }
            btn.appendChild(document.createTextNode(b.nombre + " · " + b.n));
            btn.addEventListener("click", () => { filtro = b.id; pintar(); });
            caja.appendChild(btn);
        });
    }

    /* El contacto lleva a WhatsApp si tiene un celular (8 dígitos de Costa Rica
       o con el 506), y a un correo si tiene @. Si no, va tal cual. */
    function enlaceContacto(contacto) {
        const c = String(contacto || "").trim();
        if (!c) return null;
        const a = document.createElement("a");
        a.className = "font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        a.textContent = c;
        const digitos = c.replace(/\D/g, "");
        if (/@/.test(c)) { a.href = "mailto:" + encodeURIComponent(c).replace(/%40/, "@"); return a; }
        if (digitos.length === 8 || (digitos.length === 11 && digitos.startsWith("506"))) {
            a.href = "https://wa.me/" + (digitos.length === 8 ? "506" + digitos : digitos);
            a.target = "_blank"; a.rel = "noopener";
            a.setAttribute("aria-label", "Escribir por WhatsApp a " + c + " (se abre en otra pestaña)");
            return a;
        }
        const s = document.createElement("span"); s.textContent = c; return s;
    }

    function tarjeta(p) {
        const div = document.createElement("div");
        div.className = "bg-white dark:bg-brand-900 rounded-xl shadow-sm p-4 grid gap-3";
        div.dataset.id = p.id;

        const arriba = document.createElement("div");
        arriba.className = "flex flex-wrap items-start justify-between gap-2";
        const quien = document.createElement("div");
        quien.className = "min-w-0";
        const n = document.createElement("h3");
        n.className = "font-semibold text-brand-800 dark:text-white";
        n.textContent = p.nombre;
        const datos = document.createElement("p");
        datos.className = "text-xs text-brand-500 dark:text-brand-300";
        const ac = academias.find((a) => a.id === p.academia_id);
        datos.textContent = [
            nombreDe(ORIGENES, p.origen) ? "Vino por " + nombreDe(ORIGENES, p.origen).toLowerCase().replace(/^«unirse»/, "«Unirse»") : "",
            p.para_quien ? "Para " + nombreDe(PARA, p.para_quien).toLowerCase() : "",
            p.edad ? p.edad + " años" : "",
            ac ? ac.nombre : (esAdmin ? "Sin academia" : ""),
            "Desde el " + HoraCR.fecha(p.created_at, { day: "numeric", month: "short" }),
        ].filter(Boolean).join(" · ");
        quien.append(n, datos);
        const contacto = enlaceContacto(p.contacto);
        if (contacto) { const c = document.createElement("p"); c.className = "text-sm mt-1"; c.appendChild(contacto); quien.appendChild(c); }
        const estadoTxt = document.createElement("span");
        estadoTxt.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200";
        const e = ESTADOS.find((x) => x.id === p.estado) || ESTADOS[0];
        estadoTxt.textContent = e.emoji + " " + e.nombre + (tocaHoy(p) ? " · toca hoy" : p.proximo_contacto && ACTIVO(p) ? " · próximo: " + HoraCR.fecha(p.proximo_contacto, { day: "numeric", month: "short" }) : "");
        arriba.append(quien, estadoTxt);
        div.appendChild(arriba);

        // Lo que se cambia: el paso, la fecha del próximo contacto y las notas.
        const form = document.createElement("div");
        form.className = "grid gap-3 sm:grid-cols-[12rem_10rem_1fr_auto] items-end";
        const campo = (etiqueta, el) => {
            const w = document.createElement("div");
            const l = document.createElement("label");
            l.className = "block text-xs font-semibold text-brand-500 dark:text-brand-300 mb-1";
            l.htmlFor = el.id; l.textContent = etiqueta;
            w.append(l, el); return w;
        };
        const sel = document.createElement("select");
        sel.id = "estado-" + p.id; sel.className = CAMPO;
        opciones(sel, ESTADOS.map((x) => ({ id: x.id, nombre: x.nombre })));
        sel.value = p.estado;
        const fecha = document.createElement("input");
        fecha.type = "date"; fecha.id = "proximo-" + p.id; fecha.className = CAMPO;
        fecha.value = p.proximo_contacto || "";
        const notas = document.createElement("textarea");
        notas.id = "notas-" + p.id; notas.rows = 1; notas.maxLength = 2000; notas.className = CAMPO;
        notas.value = p.notas || "";
        const acciones = document.createElement("div");
        acciones.className = "flex gap-2";
        const guardar = document.createElement("button");
        guardar.type = "button";
        guardar.className = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        guardar.textContent = "Guardar";
        guardar.setAttribute("aria-label", "Guardar los cambios de " + p.nombre);
        guardar.addEventListener("click", () => actualizar(p, { estado: sel.value, proximo_contacto: fecha.value || null, notas: notas.value.trim() }));
        const borrar = document.createElement("button");
        borrar.type = "button";
        borrar.className = "text-xs text-red-600 dark:text-red-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded px-1";
        borrar.textContent = "Borrar";
        borrar.setAttribute("aria-label", "Borrar a " + p.nombre);
        borrar.addEventListener("click", () => borrarUno(p));
        acciones.append(guardar, borrar);
        form.append(campo("Paso", sel), campo("Próximo contacto", fecha), campo("Notas", notas), acciones);
        div.appendChild(form);
        return div;
    }

    async function actualizar(p, cambios) {
        // Inscrito o descartado: ya no hay a quién llamar.
        if (cambios.estado === "inscrito" || cambios.estado === "descartado") cambios.proximo_contacto = null;
        const { error } = await sb.from("prospectos").update(cambios).eq("id", p.id);
        if (error) { Avisos.avisar("No se pudo guardar: " + error.message, { tipo: "error" }); return; }
        Object.assign(p, cambios);
        pintar();
        anunciar("Guardado: " + p.nombre + ", " + nombreDe(ESTADOS, p.estado) + ".");
        const vuelta = document.querySelector('[data-id="' + CSS.escape(p.id) + '"] select');
        if (vuelta) vuelta.focus();
    }

    async function borrarUno(p) {
        if (!(await Avisos.confirmar("Se borra para siempre, con sus notas.", { titulo: "¿Borrar a " + p.nombre + "?", aceptar: "Borrar", peligro: true }))) return;
        const { error } = await sb.from("prospectos").delete().eq("id", p.id);
        if (error) { Avisos.avisar("No se pudo borrar: " + error.message, { tipo: "error" }); return; }
        interesados = interesados.filter((x) => x.id !== p.id);
        pintar();
        anunciar("Se borró a " + p.nombre + ".");
    }

    async function agregar(ev) {
        ev.preventDefault();
        const estado = $("agregar-estado");
        const nombre = $("p-nombre").value.trim();
        if (!nombre) { estado.textContent = "Falta el nombre."; return; }
        const edad = parseInt($("p-edad").value, 10);
        const fila = {
            nombre,
            contacto: $("p-contacto").value.trim(),
            origen: $("p-origen").value,
            para_quien: $("p-para").value || null,
            edad: edad >= 3 && edad <= 100 ? edad : null,
            academia_id: $("p-academia").value || (academias.length === 1 && !esAdmin ? academias[0].id : null),
            proximo_contacto: $("p-proximo").value || null,
            notas: $("p-notas").value.trim(),
        };
        $("agregar-btn").disabled = true;
        const { data, error } = await sb.from("prospectos").insert(fila).select().single();
        $("agregar-btn").disabled = false;
        if (error) { estado.textContent = "No se pudo agregar: " + error.message; return; }
        interesados.unshift(data);
        $("form-agregar").reset();
        estado.textContent = "Agregado: " + nombre + ".";
        pintar();
        $("p-nombre").focus();
    }

    if (typeof window !== "undefined" && window.sb) init();
})();

/*! rev bfb5bbb0d2d82f9f */
