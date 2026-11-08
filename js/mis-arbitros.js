/* El código de mis-arbitros.html: quien organiza (o administra) crea las
   cuentas de sus árbitros y elige qué herramientas puede usar cada uno.

   Lo que se puede lo decide la base, no esta pantalla:
   - `arbitros_puedo_dar()`: las herramientas que quien entra puede dar (las
     de su licencia propia; administración, todas). Vacío = no puede.
   - `arbitros_mis()`: sus árbitros, con lo que puede usar cada uno.
   - `arbitro_herramientas_fijar()`: deja la lista exactamente como llega.
   - La Edge Function `arbitro-cuentas` crea la cuenta (usuario y contraseña,
     sin correo) y cambia la contraseña.
   Ver «Las cuentas de árbitro» en docs/decisiones/permisos-y-roles.md. */
(function () {
    "use strict";
    const H = window.HerramientasArbitraje;
    const $ = (id) => document.getElementById(id);
    const FUNCION = window.SUPABASE_URL + "/functions/v1/arbitro-cuentas";
    const ENTRAR = "https://ajedrez-integral.com/login.html";
    let puedoDar = [];
    let arbitros = [];
    let soyAdmin = false;

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    function avisar(texto, error) { Avisos.avisar(texto, { tipo: error ? "error" : "ok" }); }
    const BOTON = "text-sm font-semibold px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const SECUNDARIO = BOTON + " bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700";
    const PRINCIPAL = BOTON + " bg-accent-500 hover:bg-accent-600 text-brand-900";

    /* Las herramientas que esta cuenta puede dar, como fichas de la vitrina. */
    function dables() {
        const todas = puedoDar.includes("todas");
        return H.conLicenciaPropia().filter((h) => todas || puedoDar.includes(h.id));
    }

    /* Las casillas de herramientas, agrupadas por la ficha de la vitrina. */
    function casillas(contenedor, marcadas, prefijo) {
        contenedor.textContent = "";
        const lista = dables();
        H.TEMAS.forEach((t) => {
            const delTema = lista.filter((h) => h.tema === t.id);
            if (!delTema.length) return;
            const grupo = el("fieldset", "mt-3");
            const leyenda = el("legend", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide");
            leyenda.append(el("span", null, t.emoji + " "), document.createTextNode(t.nombre));
            leyenda.firstChild.setAttribute("aria-hidden", "true");
            grupo.appendChild(leyenda);
            const caja = el("div", "grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-1");
            delTema.forEach((h) => {
                const id = prefijo + "-" + h.id;
                const fila = el("div", "flex items-start gap-2");
                const c = document.createElement("input");
                c.type = "checkbox";
                c.id = id;
                c.value = h.id;
                c.checked = marcadas.includes(h.id);
                c.className = "mt-1 w-4 h-4 accent-accent-600";
                const l = el("label", "text-sm", h.corto || h.nombre);
                l.htmlFor = id;
                fila.append(c, l);
                caja.appendChild(fila);
            });
            grupo.appendChild(caja);
            contenedor.appendChild(grupo);
        });
    }
    function marcadasEn(contenedor) {
        return Array.from(contenedor.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
    }

    async function llamar(cuerpo) {
        const ses = (await sb.auth.getSession()).data.session;
        if (!ses) throw new Error("Tu sesión venció: vuelve a entrar.");
        const res = await fetch(FUNCION, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + ses.access_token, apikey: window.SUPABASE_ANON_KEY },
            body: JSON.stringify(cuerpo),
        });
        const datos = await res.json().catch(() => ({}));
        if (!res.ok || datos.error) throw new Error(datos.error || "El servidor respondió " + res.status);
        return datos;
    }

    function mensajeAcceso(nombre, usuario, clave) {
        return "Hola " + nombre.split(" ")[0] + ", ya tienes tu cuenta de árbitro en Ajedrez Integral.\n"
            + "Entra en " + ENTRAR + "\nUsuario: " + usuario + "\nContraseña: " + clave;
    }

    async function copiar(texto) {
        try { await navigator.clipboard.writeText(texto); avisar("Copiado."); }
        catch (e) { avisar("No se pudo copiar: selecciónalo y cópialo a mano.", true); }
    }

    // ---------------------------------------------------------------- crear
    function proponerUsuario() {
        const escrito = $("f-usuario").value.trim();
        const base = escrito || UsuarioAlumno.base($("f-nombre").value);
        $("f-usuario-vista").textContent = base
            ? "Entrará con el usuario «" + base + "» (si ya lo tiene otra cuenta, se le agrega un número)."
            : "";
    }

    async function crear(ev) {
        ev.preventDefault();
        const nombre = $("f-nombre").value.trim();
        const usuario = $("f-usuario").value.trim().toLowerCase();
        const clave = $("f-clave").value;
        const herramientas = marcadasEn($("f-herramientas"));
        const faltas = [];
        if (nombre.length < 3) faltas.push(["f-nombre", "Escribe su nombre completo."]);
        if (usuario && !/^[a-z0-9._-]{3,40}$/.test(usuario)) faltas.push(["f-usuario", "El usuario lleva solo letras sin tilde, números, punto o guion, de 3 a 40."]);
        if (clave.length < ContrasenaAlumno.MINIMO) faltas.push(["f-clave", "La contraseña tiene que tener al menos " + ContrasenaAlumno.MINIMO + " caracteres."]);
        if (clave.trim() !== clave) faltas.push(["f-clave", "La contraseña no puede empezar ni terminar con espacios."]);
        if (!herramientas.length) faltas.push(["f-herramientas", "Marca al menos una herramienta."]);
        if (!$("f-acepta").checked) faltas.push(["f-acepta", "Confirma que el árbitro sabe de su cuenta y de la política de privacidad."]);
        ["f-nombre", "f-usuario", "f-clave", "f-herramientas", "f-acepta"].forEach((id) => { $(id + "-error").textContent = ""; $(id).removeAttribute("aria-invalid"); });
        if (faltas.length) {
            faltas.forEach(([id, texto]) => { $(id + "-error").textContent = texto; $(id).setAttribute("aria-invalid", "true"); });
            const primero = $(faltas[0][0]);
            (primero.querySelector ? (primero.querySelector("input") || primero) : primero).focus();
            return;
        }
        const boton = $("f-crear");
        boton.disabled = true;
        boton.textContent = "Creando…";
        try {
            const r = await llamar({ accion: "crear", nombre, usuario: usuario || undefined, contrasena: clave, herramientas });
            mostrarRecien(nombre, r.usuario, clave, r.herramientas || []);
            $("form").reset();
            casillas($("f-herramientas"), [], "f");
            proponerUsuario();
            await recargar();
        } catch (err) {
            avisar("No se pudo crear la cuenta: " + err.message, true);
        }
        boton.disabled = false;
        boton.textContent = "Crear la cuenta";
    }

    function mostrarRecien(nombre, usuario, clave, herramientas) {
        const caja = $("recien");
        caja.hidden = false;
        $("recien-nombre").textContent = nombre;
        $("recien-usuario").textContent = usuario;
        $("recien-clave").textContent = clave;
        $("recien-herramientas").textContent = herramientas.length
            ? "Puede usar: " + herramientas.map((id) => (H.porId.get(id) || {}).corto || H.nombre(id)).join(", ") + "."
            : "Todavía no tiene herramientas.";
        const texto = mensajeAcceso(nombre, usuario, clave);
        $("recien-copiar").onclick = () => copiar(texto);
        $("recien-whatsapp").href = "https://wa.me/?text=" + encodeURIComponent(texto);
        $("recien-titulo").focus();
    }

    // ---------------------------------------------------------------- lista
    async function recargar() {
        const { data, error } = await sb.rpc("arbitros_mis");
        if (error) throw error;
        arbitros = data || [];
        pintar();
    }

    function hace(iso) {
        if (!iso) return "Todavía no ha entrado.";
        return "Entró por última vez el " + HoraCR.fecha(iso) + ".";
    }

    function pintar() {
        const ul = $("lista");
        ul.textContent = "";
        const q = $("buscar").value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const visibles = arbitros.filter((a) => !q || [a.nombre, a.usuario, a.organizador].join(" ").toLowerCase()
            .normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q));
        $("resumen").textContent = arbitros.length === 1 ? "1 árbitro." : arbitros.length + " árbitros.";
        $("lista-vacia").hidden = visibles.length > 0;
        $("lista-vacia").textContent = arbitros.length ? "Ningún árbitro coincide con la búsqueda." : "Todavía no has creado ningún árbitro.";
        visibles.forEach((a) => ul.appendChild(tarjeta(a)));
    }

    function tarjeta(a) {
        const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 md:p-5");
        li.dataset.arbitro = a.arbitro_id;
        const arriba = el("div", "flex flex-wrap items-baseline gap-x-4 gap-y-1");
        arriba.append(el("h3", "font-semibold text-brand-800 dark:text-white", a.nombre || "Sin nombre"),
            el("span", "text-sm font-mono text-brand-600 dark:text-brand-300", "Usuario: " + UsuarioAlumno.soloUsuario(a.usuario || "")));
        li.appendChild(arriba);
        let detalle = hace(a.ultima_entrada);
        if (soyAdmin) detalle += a.organizador_id ? " Lo creó " + (a.organizador || "alguien sin nombre") + "." : " Quien lo creó ya no tiene cuenta.";
        li.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300 mt-1", detalle));
        if ((a.pausadas || []).length) {
            li.appendChild(el("p", "text-sm text-red-800 dark:text-red-200 mt-1",
                "Sin usar por ahora (la licencia de quien se las dio venció o se anuló): "
                + a.pausadas.map((id) => (H.porId.get(id) || {}).corto || H.nombre(id)).join(", ") + "."));
        }

        const herr = el("div");
        herr.setAttribute("role", "group");
        herr.setAttribute("aria-label", "Herramientas de " + (a.nombre || "este árbitro"));
        casillas(herr, a.herramientas || [], "a-" + a.arbitro_id.slice(0, 8));
        li.appendChild(herr);
        // Lo que tiene y esta cuenta no puede dar (lo puso administración) se dice, no se esconde.
        const dadas = new Set(dables().map((h) => h.id));
        const ajenas = (a.herramientas || []).filter((id) => !dadas.has(id) && !puedoDar.includes("todas"));
        if (ajenas.length) {
            li.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300 mt-2",
                "También tiene (se las dio administración): " + ajenas.map((id) => (H.porId.get(id) || {}).corto || H.nombre(id)).join(", ") + "."));
        }

        const acciones = el("div", "flex flex-wrap gap-2 mt-4");
        const guardar = el("button", PRINCIPAL, "Guardar sus herramientas");
        guardar.type = "button";
        guardar.addEventListener("click", () => guardarHerramientas(a, herr, guardar));
        const cambiar = el("button", SECUNDARIO, "Cambiar su contraseña");
        cambiar.type = "button";
        cambiar.setAttribute("aria-expanded", "false");
        const panel = panelContrasena(a);
        panel.hidden = true;
        cambiar.setAttribute("aria-controls", panel.id);
        cambiar.addEventListener("click", () => {
            panel.hidden = !panel.hidden;
            cambiar.setAttribute("aria-expanded", String(!panel.hidden));
            if (!panel.hidden) panel.querySelector("input").focus();
        });
        acciones.append(guardar, cambiar);
        li.append(acciones, panel);
        return li;
    }

    async function guardarHerramientas(a, contenedor, boton) {
        const lista = marcadasEn(contenedor);
        if (!lista.length) {
            const ok = await Avisos.confirmar("Sin ninguna herramienta, " + (a.nombre || "este árbitro") + " puede entrar pero no podrá usar nada. ¿Le quitas todas?",
                { titulo: "Quitarle todas las herramientas", aceptar: "Quitarle todas", cancelar: "No, dejarlas", peligro: true });
            if (!ok) return;
        }
        boton.disabled = true;
        try {
            const { data, error } = await sb.rpc("arbitro_herramientas_fijar", { p_arbitro: a.arbitro_id, p_herramientas: lista });
            if (error) throw error;
            avisar("Listo. " + (a.nombre || "El árbitro") + (data && data.length
                ? " puede usar: " + data.map((id) => (H.porId.get(id) || {}).corto || H.nombre(id)).join(", ") + "."
                : " ya no tiene herramientas."));
            await recargar();
        } catch (err) {
            avisar("No se pudieron guardar: " + (err.message || err), true);
            boton.disabled = false;
        }
    }

    function panelContrasena(a) {
        const caja = el("div", "mt-3 rounded-xl bg-brand-50 dark:bg-brand-950 p-4");
        caja.id = "clave-" + a.arbitro_id;
        const etiqueta = el("label", "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Contraseña nueva");
        const input = document.createElement("input");
        input.type = "text";
        input.id = "clave-in-" + a.arbitro_id;
        etiqueta.htmlFor = input.id;
        input.autocomplete = "off";
        input.setAttribute("autocapitalize", "none");
        input.spellcheck = false;
        input.className = "w-full sm:w-72 px-3 py-2 rounded-lg bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        const botones = el("div", "flex flex-wrap gap-2 mt-2");
        const proponer = el("button", SECUNDARIO, "Proponer una fácil");
        proponer.type = "button";
        proponer.addEventListener("click", () => { input.value = ContrasenaAlumno.claveFacil(); input.focus(); });
        const poner = el("button", PRINCIPAL, "Poner esta contraseña");
        poner.type = "button";
        poner.addEventListener("click", async () => {
            const clave = input.value;
            if (clave.length < ContrasenaAlumno.MINIMO || clave.trim() !== clave) {
                avisar("La contraseña tiene que tener al menos " + ContrasenaAlumno.MINIMO + " caracteres, sin espacios en las puntas.", true);
                input.focus();
                return;
            }
            poner.disabled = true;
            try {
                await llamar({ accion: "contrasena", arbitro_id: a.arbitro_id, contrasena: clave });
                const usuario = UsuarioAlumno.soloUsuario(a.usuario || "");
                avisar("Listo. " + (a.nombre || "El árbitro") + " entra con el usuario «" + usuario + "» y la contraseña «" + clave + "».");
                const texto = mensajeAcceso(a.nombre || "", usuario, clave);
                const wa = el("a", "inline-block mt-2 text-sm font-semibold underline text-accent-700 dark:text-accent-400", "Mandárselo por WhatsApp");
                wa.href = "https://wa.me/?text=" + encodeURIComponent(texto);
                wa.target = "_blank";
                wa.rel = "noopener";
                caja.querySelectorAll("a").forEach((x) => x.remove());
                caja.appendChild(wa);
                input.value = "";
            } catch (err) {
                avisar("No se pudo cambiar: " + err.message, true);
            }
            poner.disabled = false;
        });
        botones.append(proponer, poner);
        caja.append(etiqueta, input, botones);
        return caja;
    }

    // ---------------------------------------------------------------- arranque
    async function iniciar() {
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (!session) { location.replace("login.html?next=mis-arbitros.html"); return; }
            const [dar, perfil] = await Promise.all([
                sb.rpc("arbitros_puedo_dar"),
                sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle(),
            ]);
            if (dar.error) throw dar.error;
            puedoDar = dar.data || [];
            soyAdmin = !!(perfil.data && perfil.data.is_admin);
            $("loading").hidden = true;
            if (!puedoDar.length) { $("denegado").hidden = false; return; }
            $("app").hidden = false;
            $("intro-admin").hidden = !soyAdmin;
            casillas($("f-herramientas"), [], "f");
            $("form").addEventListener("submit", crear);
            $("f-nombre").addEventListener("input", proponerUsuario);
            $("f-usuario").addEventListener("input", proponerUsuario);
            $("f-proponer").addEventListener("click", () => { $("f-clave").value = ContrasenaAlumno.claveFacil(); $("f-clave").focus(); });
            $("buscar").addEventListener("input", pintar);
            await recargar();
        } catch (err) {
            $("loading").hidden = true;
            $("error").hidden = false;
            $("error-texto").textContent = "No se pudo cargar: " + (err.message || err);
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();

/*! rev bfb5bbb0d2d82f9f */
