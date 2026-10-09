/* La caja para crear la cuenta de un alumno, en un solo lugar.

   La usan dos páginas: formularios.html (el botón «Crear cuenta» de una
   respuesta y «＋ Alumno nuevo», de quien coordina) y alumno-nuevo.html (el
   profesor que gasta su cupo de invitaciones, desde la ficha «Crear cuenta de
   alumno» del panel). Vivía entera dentro de formularios: el marcado en el
   HTML y la lógica en formularios.js. Con dos copias, la regla del usuario
   que se propone o el aviso de «el correo NO salió» se habrían separado en
   la primera corrección.

   La caja se pega en la página con `AltaAlumno.montar()`, con los mismos `id`
   de siempre (los verificadores los usan). Lo que cambia según desde dónde
   se abre lo pasa quien llama a `abrir()`:
     · `respuestaId` → manda a inscribir-alumno (la respuesta de formulario
       de la que parte); sin él, a create-student.
     · `datos` → lo que llega ya escrito (nombre, correos, grupo…).
     · `alCrear(out)` → qué hacer después (repintar la respuesta, el cupo).
   Necesita js/cupo-invitaciones.js (el aviso de «no te quedan»).
   Quién puede crear la cuenta y cuántas le quedan NO lo decide esto: lo
   deciden las Edge Functions con `consumir_invitacion()`, que gasta el cupo
   en la misma operación en que lo comprueba. Ver «La ficha Crear cuenta de
   alumno» en docs/decisiones/paneles.md. */
(function () {
    const MARCADO = `
    <!-- ============ Dar de alta a una familia ============
         Se abre ya con los datos puestos cuando parte de una respuesta. NO
         manda de una: crear la cuenta le manda un correo de verdad a una
         persona de verdad, y quién es el alumno y quién el encargado sale de
         adivinar qué pregunta es cuál. Se enseña lo que va a salir antes de
         que salga. -->
    <div id="alta-fondo" class="hidden fixed inset-0 z-50 bg-brand-950/60 p-4 overflow-y-auto">
        <div id="alta-caja" role="dialog" aria-modal="true" aria-labelledby="alta-titulo"
             class="bg-white dark:bg-brand-900 rounded-2xl shadow-xl max-w-lg mx-auto my-8 p-6">
            <h2 id="alta-titulo" class="font-serif text-xl font-bold text-brand-800 dark:text-white mb-1">Crear la cuenta del alumno</h2>
            <p class="text-sm text-brand-500 dark:text-brand-300 mb-5">Se le manda un correo para que <strong>cree su contraseña</strong>, con los pasos para entrar a la plataforma; <span id="alta-asignado">queda asignado a tu clase</span> y la persona encargada queda apuntada para los informes a la casa. Revisa que cada dato esté en su lugar.</p>

            <div class="space-y-3">
                <div>
                    <label for="alta-alumno-nombre" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1">Nombre del alumno</label>
                    <input id="alta-alumno-nombre" type="text" maxlength="120" class="w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                </div>
                <div>
                    <label for="alta-alumno-correo" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1">Correo del alumno <span id="alta-correo-obligatorio" class="text-red-600 dark:text-red-400" aria-hidden="true">*</span></label>
                    <input id="alta-alumno-correo" type="email" maxlength="200" class="w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                    <p class="text-xs text-brand-450 dark:text-brand-350 mt-1">Ahí llega el correo con su contraseña provisional para entrar.</p>

                    <!-- El caso de todos los días: una familia con dos hijos
                         pequeños y UN solo correo. No se puede repetir —el correo
                         es la llave con la que se inicia sesión—, así que en vez
                         de pedirle un buzón al niño se le arma un usuario. -->
                    <label class="flex items-start gap-2 mt-3 cursor-pointer">
                        <input type="checkbox" id="alta-sin-correo" class="mt-0.5 rounded border-brand-300 dark:border-brand-600 text-accent-500 focus:ring-accent-400">
                        <span class="text-xs text-brand-600 dark:text-brand-300">
                            <strong class="text-brand-800 dark:text-white">No tiene correo propio</strong>
                            — es pequeño, o comparte el de la casa con un hermano.
                            Se le arma un usuario, y la contraseña se la pones tú o la crea la casa con el correo.
                        </span>
                    </label>
                </div>

                <!-- Se propone, se enseña y se puede corregir: cuál pedazo del
                     nombre es el apellido se adivina, y quien da de alta tiene el
                     nombre completo delante. El usuario es lo que el niño va a
                     escribir todos los días. -->
                <div id="alta-usuario-fila" class="hidden">
                    <label for="alta-usuario" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1">Usuario con el que va a entrar</label>
                    <div class="flex items-center gap-1">
                        <input id="alta-usuario" type="text" maxlength="40" autocapitalize="none" autocorrect="off" spellcheck="false" class="flex-1 min-w-0 bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                        <span id="alta-usuario-dominio" class="text-xs text-brand-450 dark:text-brand-350 whitespace-nowrap"></span>
                    </div>
                    <p class="text-xs text-brand-450 dark:text-brand-350 mt-1">Sale del nombre; corrígelo si el apellido no quedó bien. Si ya lo tiene otro alumno, se le pone un número al final.</p>

                    <!-- Con la contraseña puesta entra hoy mismo, sin que nadie
                         abra un correo. De texto y no de contraseña a propósito:
                         es para dictársela al alumno. -->
                    <label for="alta-contrasena" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mt-3 mb-1">Contraseña (si se la pones tú)</label>
                    <div class="flex items-center gap-2">
                        <input id="alta-contrasena" type="text" maxlength="72" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" class="flex-1 min-w-0 bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                        <button type="button" id="alta-contrasena-proponer" class="text-xs font-semibold px-3 py-2 rounded-lg border border-brand-200 dark:border-brand-700 hover:border-accent-400 text-brand-700 dark:text-brand-200 whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Proponer una fácil</button>
                    </div>
                    <p class="text-xs text-brand-450 dark:text-brand-350 mt-1">Al menos 8 caracteres. Con ella entra hoy mismo: dale el usuario y la contraseña en la clase. Si la dejas en blanco, el enlace para crearla sale al correo de la persona encargada.</p>
                </div>
                <div>
                    <label for="alta-encargado-nombre" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1">Nombre de la persona encargada</label>
                    <input id="alta-encargado-nombre" type="text" maxlength="120" class="w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                </div>
                <div>
                    <label for="alta-encargado-correo" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1">Correo de la persona encargada</label>
                    <input id="alta-encargado-correo" type="email" maxlength="200" class="w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                    <p id="alta-encargado-ayuda" class="text-xs text-brand-450 dark:text-brand-350 mt-1">Ahí llega el informe de cómo le va. Si se deja en blanco, no se apunta a nadie.</p>
                </div>
                <div class="grid sm:grid-cols-2 gap-3">
                    <div>
                        <label for="alta-frecuencia" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1">Cada cuánto el informe</label>
                        <select id="alta-frecuencia" class="w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                            <option value="diario">Todos los días</option>
                            <option value="semanal" selected>Cada semana</option>
                            <option value="mensual">Cada mes</option>
                            <option value="anual">Cada año</option>
                        </select>
                    </div>
                    <div>
                        <label for="alta-grupo" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1">Equipo o grupo</label>
                        <input id="alta-grupo" type="text" maxlength="60" class="w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
                    </div>
                </div>

                <!-- Solo para quien administra o supervisa: de quién queda
                     alumno. Quien lo decide de verdad es la Edge Function
                     (profesor-elegido.ts), que rechaza a un profesor fuera
                     de su alcance antes de gastar la invitación. -->
                <div id="alta-profesor-fila" class="hidden">
                    <label for="alta-profesor" class="block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1">Profesor del alumno</label>
                    <select id="alta-profesor" class="w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"></select>
                    <p class="text-xs text-brand-450 dark:text-brand-350 mt-1">Queda en su clase: lo ve en su panel y en sus informes.</p>
                </div>
            </div>

            <p id="alta-msg" class="text-sm mt-4" aria-live="polite"></p>

            <div class="flex flex-wrap gap-3 mt-4">
                <button type="button" id="alta-enviar" class="bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Crear la cuenta y enviar la invitación</button>
                <button type="button" id="alta-cancelar" class="text-sm text-brand-600 dark:text-brand-300 underline px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded">Cancelar</button>
            </div>
        </div>
    </div>
    `;

    let perfil = null;
    let montada = false;
    let respuestaId = null;
    let volverEl = null;
    let alCrear = null;
    let alSinCupo = null;

    const $ = (id) => document.getElementById(id);

    /* De quién queda alumno, dicho arriba en el diálogo. Sin elegir, de quien lo
       da de alta si da clase; quien administra sin ser profesor no da clase, y
       entonces queda sin profesor (lo deciden igual las Edge Functions). */
    function pintarAsignado() {
        const sel = $("alta-profesor");
        const elegido = sel.value ? sel.options[sel.selectedIndex].textContent : "";
        $("alta-asignado").textContent = elegido
            ? "queda en la clase de " + elegido
            : perfil.role === "profesor"
                ? "queda asignado a tu clase"
                : "queda sin profesor hasta que se lo asignes en Administración";
    }

    /* Los profesores que puede elegir quien administra (todos) o supervisa (los
       suyos): los que le da `mi_gente`, que filtra la base. Viene de a 200 como
       mucho por página, así que se pide hasta el final: con un límite a ojo, un
       profesor se quedaría fuera del selector sin que nada falle. */
    async function cargarProfesores() {
        if (!(perfil.is_admin || perfil.es_supervisor)) return;
        const trozo = 200;
        let desde = 0, todo = [], total = null;
        try {
            for (;;) {
                const { data, error } = await sb.rpc("mi_gente",
                    { p_busqueda: null, p_rol: "profesor", p_limite: trozo, p_desde: desde });
                if (error) throw error;
                const filas = data || [];
                if (total === null) total = filas.length ? Number(filas[0].total) : 0;
                todo = todo.concat(filas);
                desde += trozo;
                if (!filas.length || todo.length >= total) break;
            }
        } catch (err) {
            return; // Sin la lista no se ofrece: queda lo de siempre.
        }
        const nombre = (p) => (p.full_name || "").trim() || p.email || "Sin nombre";
        const otros = todo.filter((p) => p.id !== perfil.id)
            .sort((a, b) => nombre(a).localeCompare(nombre(b), "es"));
        if (!otros.length) return;
        const sel = $("alta-profesor");
        sel.textContent = "";
        const primera = document.createElement("option");
        primera.value = "";
        primera.textContent = perfil.role === "profesor"
            ? "Yo (" + ((perfil.full_name || "").trim() || "mi clase") + ")"
            : "— Sin profesor por ahora —";
        sel.appendChild(primera);
        otros.forEach((p) => {
            const o = document.createElement("option");
            o.value = p.id;
            o.textContent = nombre(p);
            sel.appendChild(o);
        });
        $("alta-profesor-fila").classList.remove("hidden");
    }

    /* Qué se ve y qué se pide según haya correo propio o no. Es UNA sola función
       y la llaman el abrir y la casilla: si cada uno pintara lo suyo, marcar la
       casilla y volver a abrir el diálogo dejarían la pantalla en dos estados
       distintos. */
    function pintarModo() {
        const sinCorreo = $("alta-sin-correo").checked;
        const correo = $("alta-alumno-correo");
        const fila = $("alta-usuario-fila");
        const usuario = $("alta-usuario");

        correo.disabled = sinCorreo;
        correo.classList.toggle("opacity-50", sinCorreo);
        // El asterisco se muda: sin correo propio, el obligatorio es el de la casa.
        $("alta-correo-obligatorio").classList.toggle("hidden", sinCorreo);
        fila.classList.toggle("hidden", !sinCorreo);

        // Con la contraseña puesta no sale ningún correo: la casa vuelve a ser
        // opcional y el botón dice lo que de verdad va a hacer.
        const conClave = sinCorreo && $("alta-contrasena").value !== "";
        $("alta-encargado-ayuda").textContent = conClave
            ? "Ahí llega el informe de cómo le va. Con la contraseña puesta no hace falta para entrar; si se deja en blanco, no se apunta a nadie."
            : sinCorreo
            ? "Ahí llegan el usuario y la contraseña provisional Y el informe de cómo le va. Sin esto no hay forma de escribirle a esta familia."
            : "Ahí llega el informe de cómo le va. Si se deja en blanco, no se apunta a nadie.";
        $("alta-enviar").textContent = conClave
            ? "Crear la cuenta" : "Crear la cuenta y enviar la invitación";

        // Se propone desde el nombre, pero lo escrito a mano no se pisa: quien lo
        // corrigió no quiere que se le deshaga al volver a tocar la casilla.
        if (sinCorreo && !usuario.dataset.tocado) {
            usuario.value = baseDeUsuarioEnPantalla($("alta-alumno-nombre").value);
        }
    }

    /* La regla del usuario propuesto vive en js/usuario-alumno.js
       (`UsuarioAlumno.base`), una sola copia para las dos pantallas de alta. */
    function baseDeUsuarioEnPantalla(nombre) {
        return window.UsuarioAlumno.base(nombre);
    }

    /* Abre la caja. Sin `respuestaId` es el alta a mano (create-student): el
       alumno que se inscribe por WhatsApp o en persona, sin pasar por el
       enlace de un formulario. */
    function abrir(op) {
        op = op || {};
        const d = op.datos || {};
        respuestaId = op.respuestaId || null;
        volverEl = op.volverEl || null;
        alCrear = op.alCrear || null;
        alSinCupo = op.alSinCupo || null;
        $("alta-titulo").textContent = respuestaId ? "Crear la cuenta del alumno" : "Crear una cuenta de alumno";
        $("alta-alumno-nombre").value = d.alumnoNombre || "";
        $("alta-alumno-correo").value = d.alumnoCorreo || "";
        $("alta-encargado-nombre").value = d.encargadoNombre || "";
        $("alta-encargado-correo").value = d.encargadoCorreo || "";
        $("alta-frecuencia").value = "semanal";
        $("alta-grupo").value = d.grupo || "";

        // La marca de "lo puso a mano" se borra al abrir OTRA vez: si no, el
        // usuario que se corrigió para un alumno se le quedaría puesto al
        // siguiente, y ese es el usuario con el que va a entrar.
        const campoUsuario = $("alta-usuario");
        delete campoUsuario.dataset.tocado;
        campoUsuario.value = "";
        // La contraseña del alumno de antes no se le queda puesta al siguiente.
        $("alta-contrasena").value = "";
        /* Desde una respuesta, la casilla arranca marcada cuando el formulario
           no trajo correo del alumno: es lo que de verdad pasa con los
           pequeños — la familia escribe el suyo y deja ese campo vacío. Se
           propone, no se decide: queda a la vista y se puede desmarcar. */
        $("alta-sin-correo").checked = !!respuestaId && !d.alumnoCorreo;
        $("alta-usuario-dominio").textContent = "@" + UsuarioAlumno.DOMINIO;
        pintarModo();
        $("alta-profesor").value = "";
        pintarAsignado();
        const msg = $("alta-msg");
        msg.textContent = "";
        msg.className = "text-sm mt-4";
        $("alta-enviar").disabled = false;
        $("alta-fondo").classList.remove("hidden");
        $(respuestaId ? "alta-alumno-correo" : "alta-alumno-nombre").focus();
    }

    function cerrar() {
        $("alta-fondo").classList.add("hidden");
        respuestaId = null;
        // El foco vuelve al botón que abrió esto: si no, se queda dentro de algo
        // que ya no está en pantalla.
        if (volverEl && document.body.contains(volverEl)) volverEl.focus();
        volverEl = null;
    }

    function abierta() { return montada && !$("alta-fondo").classList.contains("hidden"); }

    async function enviar() {
        if (!abierta()) return;
        const btn = $("alta-enviar");
        const msg = $("alta-msg");
        const v = (id) => $(id).value.trim();
        const desdeRespuesta = respuestaId;
        const despues = alCrear;

        const sinCorreo = $("alta-sin-correo").checked;
        const alumnoNombre = v("alta-alumno-nombre");
        const alumnoCorreo = sinCorreo ? "" : v("alta-alumno-correo");
        const usuario = sinCorreo ? v("alta-usuario") : "";
        // Sin recortar: un espacio al final se dice, no se arregla callado.
        const contrasena = sinCorreo ? $("alta-contrasena").value : "";
        const encargadoNombre = v("alta-encargado-nombre");
        const encargadoCorreo = v("alta-encargado-correo");
        const frecuencia = $("alta-frecuencia").value;
        const grupo = v("alta-grupo");
        const profesorElegido = $("alta-profesor").value;
        const profesorNombre = profesorElegido
            ? $("alta-profesor").selectedOptions[0].textContent : "";

        // Las dos puertas —desde una respuesta y a mano— validan y avisan
        // igual; lo único que cambia es a qué función se manda y con qué
        // nombres de campo la espera cada una.
        const cuerpo = desdeRespuesta ? {
            respuesta_id: desdeRespuesta,
            alumno_nombre: alumnoNombre,
            alumno_email: alumnoCorreo,
            sin_correo: sinCorreo,
            usuario,
            encargado_nombre: encargadoNombre,
            encargado_email: encargadoCorreo,
            frecuencia,
            grupo,
            contrasena,
        } : {
            email: alumnoCorreo,
            full_name: alumnoNombre,
            sin_correo: sinCorreo,
            usuario,
            encargado_nombre: encargadoNombre,
            encargado_email: encargadoCorreo,
            frecuencia,
            grupo,
            contrasena,
        };

        // Solo viaja si se eligió a alguien: sin él, la función decide como siempre.
        if (profesorElegido) cuerpo.profesor_id = profesorElegido;

        const fallar = (texto, campo) => {
            msg.textContent = texto;
            msg.className = "text-sm mt-4 text-red-600 dark:text-red-400";
            $(campo).focus();
        };

        if (sinCorreo) {
            // Sin buzón propio y sin contraseña, el de la casa es la ÚNICA forma
            // de mandarle el enlace: sin él la cuenta queda creada y muda, y de
            // eso nadie se entera hasta que el alumno nunca aparece. Con la
            // contraseña puesta ya entra, y la casa es opcional.
            if (!alumnoNombre) {
                return fallar("Para armarle un usuario hace falta el nombre del alumno.", "alta-alumno-nombre");
            }
            if (contrasena && contrasena.length < ContrasenaAlumno.MINIMO) {
                return fallar(`La contraseña tiene que tener al menos ${ContrasenaAlumno.MINIMO} caracteres.`, "alta-contrasena");
            }
            if (contrasena && contrasena.trim() !== contrasena) {
                return fallar("La contraseña no puede empezar ni terminar con espacios.", "alta-contrasena");
            }
            if (!contrasena && !encargadoCorreo) {
                return fallar("Sin correo propio, el de la persona encargada es obligatorio: es a donde van el usuario y la contraseña provisional. O ponle tú la contraseña.", "alta-encargado-correo");
            }
            if (!usuario) {
                return fallar("Falta el usuario con el que va a entrar.", "alta-usuario");
            }
        } else if (!alumnoCorreo) {
            return fallar("Falta el correo del alumno: es a donde va la invitación. Si no tiene, marca «No tiene correo propio».", "alta-alumno-correo");
        }

        btn.disabled = true;
        msg.textContent = "Creando la cuenta…";
        msg.className = "text-sm mt-4 text-brand-500 dark:text-brand-300";
        try {
            const funcion = desdeRespuesta ? "inscribir-alumno" : "create-student";
            const res = await fetch(`${window.SUPABASE_URL}/functions/v1/${funcion}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${await window.tokenDeSesion()}`,
                    "apikey": window.SUPABASE_ANON_KEY,
                },
                body: JSON.stringify(cuerpo),
            });
            const out = await res.json().catch(() => ({}));
            /* Sin invitaciones: lo dice la base, que es quien lleva la cuenta.
               No se dice «pídele más a administración» a secas: el cupo sale
               del plan, y para tener más hace falta uno mayor. */
            if (out.sin_cupo) {
                const avisarSinCupo = alSinCupo;
                cerrar();
                if (avisarSinCupo) avisarSinCupo(out);
                const ir = await Avisos.confirmar(CupoInvitaciones.textoSinCupo(out.max), {
                    titulo: "No te quedan invitaciones", aceptar: "Ver los planes", cancelar: "Ahora no",
                });
                if (ir) location.href = CupoInvitaciones.PLANES;
                return;
            }
            if (!res.ok || !out.ok) throw new Error(res.ok ? (out.error || "No se pudo crear la cuenta") : window.errorDeFuncion(res, out));

            cerrar();
            if (despues) despues(out);
            // Quien administra sin dar clase no queda como su profesor: el alumno
            // queda sin nadie, y sin profesor no sale en los informes de nadie.
            const encargado = (out.encargado_guardado
                ? " La persona encargada quedó apuntada para los informes a la casa." : "") +
                (out.asignado === false
                ? " Quedó sin profesor: asígnaselo en Administración."
                : profesorElegido && out.profesor_id === profesorElegido
                ? ` Quedó en la clase de ${profesorNombre}.` : "");
            // Con qué entra de verdad lo dice el servidor, no la pantalla: el
            // usuario pudo salir con un número al final si ya estaba tomado, y
            // quien da de alta tiene que ver el que de verdad quedó.
            const entra = out.usuario || out.email;

            if (out.ya_tenia_cuenta) {
                await Avisos.alerta(`Esta respuesta ya tenía su cuenta creada, así que no se mandó otra invitación. ` +
                      `Entra con ${entra}.${encargado}`, { titulo: "Ya tenía cuenta" });
            } else if (out.con_contrasena) {
                // No salió ningún correo: el usuario y la contraseña los da quien
                // lo dio de alta, así que se enseñan los dos. El usuario sin el
                // dominio, que es lo que el niño escribe en la pantalla de acceso.
                await Avisos.alerta(`${alumnoNombre || "El alumno"} ya puede entrar con:\n\n` +
                      `    Usuario: ${UsuarioAlumno.soloUsuario(entra)}\n    Contraseña: ${contrasena}\n\n` +
                      `Dáselos en la clase: no salió ningún correo.${encargado}`, { titulo: "Cuenta creada" });
            } else if (out.correo_enviado === false) {
                // La cuenta quedó creada y el correo no salió: se dice, o el alumno
                // nunca aparece y nadie sabe por qué.
                await Avisos.alerta(`La cuenta quedó creada (entra con ${entra}), pero el correo NO salió. ` +
                      `Dile que entre con «¿Olvidaste tu contraseña?» en la pantalla de acceso.${encargado}`, { titulo: "El correo no salió" });
            } else if (out.sin_correo) {
                // El dato nuevo es el usuario, y hay que enseñarlo: no es un correo
                // y nadie lo adivina. El correo salió hacia la casa, no hacia el
                // alumno, y quien da de alta tiene que saberlo para poder decírselo.
                await Avisos.alerta(`${alumnoNombre || "El alumno"} entra con:\n\n    ${entra}\n\n` +
                      `El usuario y la contraseña provisional salieron a ${out.correo_destino || encargadoCorreo}, ` +
                      `no al alumno — ese usuario no recibe correo.${encargado}`, { titulo: "Cuenta creada" });
            } else {
                Avisos.avisar(`Invitación enviada a ${entra}: le llega un correo con su ` +
                      `contraseña provisional y los pasos para entrar.${encargado}`);
            }
        } catch (err) {
            msg.textContent = err.message;
            msg.className = "text-sm mt-4 text-red-600 dark:text-red-400";
            btn.disabled = false;
        }
    }

    /* Pega la caja en la página y le pone sus manejadores. Se llama una vez,
       con el perfil de quien entró (el selector de profesor y el «queda
       asignado a…» dependen de él). */
    function montar(p, contenedor) {
        perfil = p;
        if (!montada) {
            (contenedor || document.body).insertAdjacentHTML("beforeend", MARCADO);
            montada = true;
            $("alta-profesor").addEventListener("change", pintarAsignado);
            $("alta-enviar").addEventListener("click", enviar);
            $("alta-cancelar").addEventListener("click", cerrar);
            $("alta-sin-correo").addEventListener("change", pintarModo);
            $("alta-contrasena").addEventListener("input", pintarModo);
            $("alta-contrasena-proponer").addEventListener("click", () => {
                const campo = $("alta-contrasena");
                campo.value = ContrasenaAlumno.claveFacil();
                campo.focus();
                pintarModo();
            });
            // Corregir el nombre vuelve a proponer el usuario, mientras nadie lo haya
            // escrito a mano: arreglar una tilde del nombre no tiene por qué dejar el
            // usuario apuntando al nombre viejo.
            $("alta-alumno-nombre").addEventListener("input", () => {
                if (!$("alta-usuario").dataset.tocado) pintarModo();
            });
            // Lo escrito a mano manda: desde acá, el nombre ya no lo pisa.
            $("alta-usuario").addEventListener("input", (e) => {
                e.target.dataset.tocado = "1";
            });
            // Clic fuera de la caja y Escape cierran, como cualquier diálogo del sitio.
            $("alta-fondo").addEventListener("click", (e) => {
                if (e.target === e.currentTarget) cerrar();
            });
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && abierta()) cerrar();
            });
        }
        pintarAsignado();
        cargarProfesores();
    }

    window.AltaAlumno = { montar, abrir, cerrar };
    // verificar-alumno-sin-correo.js la compara con la del servidor desde la página.
    window.baseDeUsuarioEnPantalla = baseDeUsuarioEnPantalla;
})();
