/* La cuenta de una persona, para quien coordina o supervisa: su ficha
   (nombre, grupo, con qué entra, su contraseña y sus profesores) y los
   botones de cada cuenta (mirar su clase, sus subgrupos, reenviar el acceso y
   cambiar el rol).

   Vivía dentro de js/coordinacion.js. Se sacó acá cuando la página de
   supervisión (supervisor.html) pasó a corregir cuentas sin mandar a
   Coordinación: dos copias de la misma ficha se irían separando. Lo que se
   escribe sigue yendo por las mismas funciones de la base y Edge Functions,
   que deciden el alcance. Ver «La página de supervisión» en
   docs/decisiones/paneles.md.

     CuentaCoord.botones(u, { enClase, yo, alCambiarRol })
       // { vivo, subgrupos, acceso, rol }: cada uno es un elemento o null
     CuentaCoord.montarFicha(u, caja, { misProfesores, alGuardar, alCambiarProfesores })
*/
(function () {
    "use strict";

    function el(tag, clase, texto) {
        const n = document.createElement(tag);
        if (clase) n.className = clase;
        if (texto != null) n.textContent = texto;
        return n;
    }

    function avisar(texto, malo) { Avisos.avisar(texto, { tipo: malo ? "error" : "ok" }); }

    const nombreDe = (u) => u.full_name || u.email || "Sin nombre";

    const BOTON = "border border-brand-200 dark:border-brand-700 hover:border-accent-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

    /* Los botones de una cuenta. Lo que el supervisor de su academia le apagó
       a quien coordina no se pinta (FuncionesCoordinacion): la base lo
       rechazaría igual, pero el fallo lo descubriría quien apretó. */
    function botones(u, op) {
        op = op || {};
        const fuera = { vivo: null, subgrupos: null, acceso: null, rol: null };
        // Va escrito, no solo con el punto rojo.
        if (u.role === "profesor" && u.id !== op.yo && op.enClase && op.enClase.has(u.id)) {
            const vivo = el("a", "text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 underline self-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "🔴 En clase ahora · Mirar la clase");
            vivo.href = "sesion.html?observar=" + encodeURIComponent(u.id);
            vivo.dataset.observar = u.id;
            fuera.vivo = vivo;
        }

        if (u.role === "profesor" && FuncionesCoordinacion.puede("subgrupos")) {
            const subs = el("a", BOTON, "👥 Sus subgrupos");
            subs.href = "subgrupos.html?profesor=" + encodeURIComponent(u.id);
            fuera.subgrupos = subs;
        }

        /* Reenviar el acceso es lo que se pide cuando una familia dice que el
           correo de bienvenida nunca llegó. La Edge Function decide a dónde sale
           —al correo propio, o al de la casa si entra con un usuario— y lo dice:
           ese dato es justo el que hace falta para poder avisarle a la familia. */
        if (FuncionesCoordinacion.puede("acceso")) {
            const acceso = el("button", BOTON, "✉️ Reenviar acceso");
            acceso.type = "button";
            acceso.addEventListener("click", () => reenviar(u, acceso));
            fuera.acceso = acceso;
        }

        // La cuenta master no cambia de rol desde acá, y la propia tampoco.
        if (!u.is_admin && u.id !== op.yo && FuncionesCoordinacion.puede("roles")) {
            const otro = u.role === "profesor" ? "alumno" : "profesor";
            const rol = el("button", BOTON, otro === "profesor" ? "⬆️ Hacer profesor" : "⬇️ Pasar a alumno");
            rol.type = "button";
            rol.dataset.confirmar = "no";
            rol.addEventListener("click", () => {
                if (rol.dataset.confirmar === "no") {
                    rol.dataset.confirmar = "si";
                    rol.textContent = "¿Seguro? " + (otro === "profesor" ? "Hacer profesor" : "Pasar a alumno");
                    return;
                }
                cambiarRol(u, otro, rol, op.alCambiarRol);
            });
            fuera.rol = rol;
        }
        return fuera;
    }

    /* ------------------------------------------------------------------ la ficha
       Lo mismo que quien administra hace en admin.html, acotado a su gente: el
       nombre, el grupo, con qué correo entra y entre qué profesores está
       repartido. Quien coordina tiene que poder corregir un nombre mal escrito y
       un correo con una letra de más sin pedírselo a nadie — es lo que pasa todos
       los días con una familia nueva.

       Lo que NO se ofrece acá, a propósito, porque la base lo va a rechazar y un
       botón que va a fallar es peor que ninguno: el rol (va en su propio botón,
       que sabe rechazar bajar a un profesor con alumnos), is_admin, el cupo de
       invitaciones, borrar la cuenta y los equipos. Eso es de la cuenta master. */
    function campo(etiqueta, valor, tipo) {
        const caja = el("label", "block");
        caja.appendChild(el("span", "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", etiqueta));
        const i = document.createElement("input");
        i.type = tipo || "text";
        i.value = valor || "";
        i.className = "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        caja.appendChild(i);
        return { caja: caja, input: i };
    }

    function seccion(titulo) {
        const s = el("div", "mt-4 pt-4 border-t border-brand-100 dark:border-brand-800");
        s.appendChild(el("h3", "font-semibold text-sm text-brand-700 dark:text-brand-200 mb-2", titulo));
        return s;
    }

    function montarFicha(u, caja, op) {
        op = op || {};
        const esAlumno = u.role === "alumno";

        // ---------------------------------------------------- nombre y grupo
        const datos = seccion("Sus datos");
        const rejilla = el("div", "grid gap-3 sm:grid-cols-2");
        const nombre = campo("Nombre completo", u.full_name);
        const grupo = campo("Grupo / equipo", u.grupo);
        rejilla.append(nombre.caja, grupo.caja);
        datos.appendChild(rejilla);
        const guardar = el("button", "mt-3 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Guardar");
        guardar.type = "button";
        guardar.addEventListener("click", () => guardarDatos(u, nombre.input, grupo.input, guardar, op.alGuardar));
        datos.appendChild(guardar);
        caja.appendChild(datos);

        // ----------------------------------------- con qué entra a la Academia
        /* `correos-alumno` solo corrige el correo de un ALUMNO: el del equipo
           docente es otra cosa y lo rechaza. Así que acá ni se ofrece. */
        if (esAlumno) {
            const correo = seccion("Con qué entra");
            const actual = campo("Correo o usuario", u.email, "text");
            actual.input.setAttribute("autocapitalize", "none");
            actual.input.setAttribute("autocorrect", "off");
            correo.appendChild(actual.caja);

            const sinCorreo = el("label", "flex items-center gap-2 mt-2 text-sm text-brand-600 dark:text-brand-300");
            const marca = document.createElement("input");
            marca.type = "checkbox";
            marca.className = "rounded border-brand-300 dark:border-brand-700 text-accent-500 focus:ring-accent-400";
            sinCorreo.append(marca, el("span", null, "No tiene correo propio (entra con un usuario de la Academia)"));
            correo.appendChild(sinCorreo);
            /* El campo se APAGA, no se esconde: así se ve que sigue ahí y que lo
               que cambió es que ya no hace falta. Misma decisión que las dos
               puertas de alta. */
            marca.addEventListener("change", () => { actual.input.disabled = marca.checked; });

            correo.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-2",
                "El correo es la llave con la que inicia sesión. Si ya es de otra cuenta no se puede repetir: "
                + "si son hermanos, marca «No tiene correo propio»."));

            const botonCorreo = el("button", "mt-3 border border-brand-200 dark:border-brand-700 hover:border-accent-400 px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Cambiar el correo");
            botonCorreo.type = "button";
            correo.appendChild(botonCorreo);
            caja.appendChild(correo);

            // ------------------------------------ su contraseña, si entra con usuario
            /* La pone quien coordina y se la da en la clase. Aparece en cuanto se
               le da un usuario, sin cerrar la ficha. Ver js/contrasena-alumno.js. */
            const clave = ContrasenaAlumno.montar(caja, { alumnoId: u.id, nombre: nombreDe(u), usuario: () => u.email });

            botonCorreo.addEventListener("click", () => guardarCorreo(u, actual.input, marca, botonCorreo, clave.pintar));

            // ------------------------------------------------ sus profesores
            const profes = seccion("Sus profesores");
            const tags = el("div", "flex flex-wrap gap-2 mb-2");
            profes.appendChild(tags);
            const selector = document.createElement("select");
            selector.className = "w-full sm:w-auto px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            selector.setAttribute("aria-label", "Sumarle un profesor");
            profes.appendChild(selector);
            caja.appendChild(profes);
            pintarProfesores(u, tags, selector, op);
        }
    }

    /* Las etiquetas de sus profesores, con su ✕, y el selector para sumar otro:
       el mismo patrón que ya usan admin.html y la tarjeta de Equipos.

       A un profesor que NO coordina se le ve el nombre pero NO se le pinta ✕:
       quitárselo sería dejar sin su alumno a una colega de otra coordinación.
       `coord_set_profesores()` lo conserva igual aunque la pantalla se equivocara
       —une lo que se le manda con los que quedan fuera del alcance de quien
       coordina— así que acá solo se evita ofrecer un botón que va a fallar. */
    function pintarProfesores(u, tags, selector, op) {
        const misProfesores = op.misProfesores ? op.misProfesores() : [];
        const suyos = (u.profesores || []);
        const puedoQuitar = new Set(misProfesores.map((p) => p.id));
        tags.innerHTML = "";
        if (!suyos.length) {
            tags.appendChild(el("p", "text-sm text-brand-450 dark:text-brand-350",
                "Todavía no tiene ninguno, así que no le sale en los informes de nadie."));
        }
        suyos.forEach((pr) => {
            const t = el("span", "inline-flex items-center gap-1 bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200 px-2 py-1 rounded-full text-xs");
            t.appendChild(el("span", null, pr.nombre));
            if (puedoQuitar.has(pr.id)) {
                const x = el("button", "text-brand-500 dark:text-brand-300 hover:text-red-600 dark:hover:text-red-400 font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded", "✕");
                x.type = "button";
                x.setAttribute("aria-label", "Quitarle a " + pr.nombre);
                x.addEventListener("click", () => mandarProfesores(u, suyos.filter((o) => o.id !== pr.id), tags, selector, op));
                t.appendChild(x);
            }
            tags.appendChild(t);
        });

        const yaEstan = new Set(suyos.map((p) => p.id));
        selector.innerHTML = "";
        const vacia = document.createElement("option");
        vacia.value = "";
        vacia.textContent = "Sumarle un profesor…";
        selector.appendChild(vacia);
        misProfesores.filter((p) => !yaEstan.has(p.id)).forEach((p) => {
            const o = document.createElement("option");
            o.value = p.id;
            o.textContent = p.nombre;
            selector.appendChild(o);
        });
        selector.disabled = selector.options.length < 2;
        selector.onchange = () => {
            const elegido = misProfesores.find((p) => p.id === selector.value);
            if (elegido) mandarProfesores(u, suyos.concat([elegido]), tags, selector, op);
        };
    }

    /* Las dos escrituras van por SU FUNCIÓN DE LA BASE, no por la Edge Function
       del panel de administración: el alcance de la coordinación ya vive en SQL
       —`bajo_mi_coordinacion()`, `cambiar_rol()`, `set_profesores_del_coordinador()`—
       y partirlo entre la base y una función que tendría que volver a preguntar lo
       mismo es cómo se separan dos versiones de la misma regla.

       El mensaje que devuelven se enseña TAL CUAL —«Esa cuenta no está bajo tu
       coordinación», «Hay un profesor que no está bajo tu coordinación»—, porque un
       «no se pudo» a secas deja a quien coordina sin saber qué arreglar. Es la
       misma decisión del botón de rol. */
    async function guardarDatos(u, nombre, grupo, boton, alGuardar) {
        boton.disabled = true;
        boton.textContent = "Guardando…";
        try {
            const { error } = await sb.rpc("coord_guardar_cuenta", {
                p_persona: u.id,
                p_nombre: nombre.value.trim(),
                p_grupo: grupo.value.trim(),
            });
            if (error) throw new Error(error.message);
            u.full_name = nombre.value.trim();
            u.grupo = grupo.value.trim() || null;
            // Quien muestra la cuenta actualiza su encabezado sin repintar la
            // lista: si se repintara, la ficha abierta se cerraría.
            if (alGuardar) alGuardar(u);
            avisar("Guardado.");
        } catch (err) {
            avisar("No se pudo guardar: " + err.message, true);
        }
        boton.disabled = false;
        boton.textContent = "Guardar";
    }

    async function mandarProfesores(u, lista, tags, selector, op) {
        selector.disabled = true;
        try {
            const { error } = await sb.rpc("coord_set_profesores", {
                p_alumno: u.id,
                p_profesores: lista.map((p) => p.id),
            });
            if (error) throw new Error(error.message);
            u.profesores = lista;
            pintarProfesores(u, tags, selector, op);
            if (op.alCambiarProfesores) op.alCambiarProfesores(u);
            avisar(lista.length
                ? nombreDe(u) + " queda con " + lista.length + (lista.length === 1 ? " profesor." : " profesores.")
                : nombreDe(u) + " se quedó sin ningún profesor: así no sale en los informes de nadie.");
        } catch (err) {
            avisar("No se pudo: " + err.message, true);
            selector.disabled = false;
        }
    }

    /* El correo lo cambia `correos-alumno`, que es donde ya vivía esa regla: el
       409 cuando ya es de otra cuenta, el usuario de la Academia para quien no
       tiene buzón, y la relectura de la fila —el trigger de identidad revierte
       esa columna sin decir nada—. Escribirlo otra vez acá sería una segunda
       versión que se separa a la primera corrección. */
    async function guardarCorreo(u, input, marca, boton, alCambiar) {
        boton.disabled = true;
        boton.textContent = "Cambiando…";
        try {
            const datos = await llamarCorreos({
                action: "cuenta",
                alumno_id: u.id,
                email: input.value.trim(),
                sin_correo: marca.checked,
            });
            if (datos.sin_cambios) {
                avisar("Ese ya era su correo: no se cambió nada.");
            } else {
                /* Lo que se enseña es lo que devolvió el SERVIDOR, no lo que se
                   escribió: con «No tiene correo propio» el usuario lo desempata
                   él, así que enseñar el propuesto dejaría a la familia
                   intentando entrar con uno que no es. */
                u.email = datos.cambiado || u.email;
                input.value = u.email;
                avisar("Ahora entra con " + u.email + ".");
                if (alCambiar) alCambiar();
            }
        } catch (err) {
            avisar("No se pudo cambiar: " + err.message, true);
        }
        boton.disabled = false;
        boton.textContent = "Cambiar el correo";
    }

    async function llamarCorreos(cuerpo) {
        const res = await fetch(`${window.SUPABASE_URL}/functions/v1/correos-alumno`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${await window.tokenDeSesion()}`,
                "apikey": window.SUPABASE_ANON_KEY,
            },
            body: JSON.stringify(cuerpo),
        });
        const datos = await res.json().catch(() => ({}));
        if (!res.ok || datos.error) throw new Error(window.errorDeFuncion(res, datos));
        return datos;
    }

    async function cambiarRol(u, rol, boton, alTerminar) {
        boton.disabled = true;
        boton.textContent = "Cambiando…";
        const { data, error } = await sb.rpc("cambiar_rol", { p_persona: u.id, p_rol: rol });
        boton.disabled = false;
        if (error) {
            /* La base dice POR QUÉ no se puede —«todavía tiene 12 alumnos
               asignados»—, y eso es lo que hay que enseñar: un "no se pudo" a
               secas deja a quien coordina sin saber qué arreglar. */
            avisar(error.message, true);
            if (alTerminar) await alTerminar();
            return;
        }
        avisar(rol === "profesor"
            ? nombreDe(u) + " ahora es profesor, y queda bajo tu coordinación."
            : nombreDe(u) + " vuelve a ser alumno, y queda asignado a ti.");
        if (alTerminar) await alTerminar();
    }

    async function reenviar(u, boton) {
        boton.disabled = true;
        boton.textContent = "Mandando…";
        try {
            const res = await fetch(`${window.SUPABASE_URL}/functions/v1/reenviar-acceso`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${await window.tokenDeSesion()}`,
                    "apikey": window.SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ alumno_id: u.id }),
            });
            const datos = await res.json().catch(() => ({}));
            if (!res.ok || datos.error) throw new Error(window.errorDeFuncion(res, datos));
            avisar((datos.modo === "provisional"
                ? "Le salió su usuario con una contraseña provisional nueva a "
                : "Le salió el enlace para crear su contraseña a ") + (datos.correo_destino || "su correo") + ".");
        } catch (err) {
            avisar("No se pudo mandar: " + err.message, true);
        }
        boton.disabled = false;
        boton.textContent = "✉️ Reenviar acceso";
    }

    window.CuentaCoord = { botones, montarFicha, reenviar };
})();
