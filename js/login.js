/* El código de login.html.

   Vivía escrito dentro de la página, en un <script> de 2 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        // "next" permite volver a la página de la que venías (por ejemplo, una de
        // Entrenamiento que exige sesión iniciada) en vez de siempre ir a
        // clases.html. Solo se acepta una ruta relativa propia del sitio — nunca
        // una URL completa — para que este parámetro no se pueda usar como
        // redirección abierta hacia otro sitio.
        function safeNextPath() {
            const raw = new URLSearchParams(window.location.search).get("next");
            if (raw && /^[a-zA-Z0-9_\-./]+\.html$/.test(raw) && !raw.startsWith("//") && !raw.includes("..")) {
                return raw;
            }
            return "clases.html";
        }
        const destination = safeNextPath();

        // Con la sesión entera, a la página; con la sesión a medias (entró con la
        // contraseña y la cuenta tiene la verificación en dos pasos), a pedir el
        // código. Sin esto, la guardia de cada página mandaba acá, esto mandaba
        // de vuelta, y así en rueda.
        async function entrarOPedirCodigo() {
            if (window.DosPasos && await DosPasos.necesitaCodigo()) return pedirCodigo();
            await irAlDestino();
        }

        /* Quien entra con la contraseña provisional del correo de bienvenida
           pasa primero por bienvenida.html a cambiarla por una suya (la marca
           la pone la invitación y la quita cualquier cambio de contraseña).
           Puede decir «Ahora no»: se le vuelve a ofrecer la próxima vez. Ver
           «La contraseña provisional» en docs/decisiones/cuentas-y-formularios.md. */
        async function irAlDestino() {
            let provisional = false;
            try {
                const { data: { session } } = await sb.auth.getSession();
                provisional = session?.user?.user_metadata?.contrasena_provisional === true;
            } catch (_) { }
            window.location.href = provisional
                ? "bienvenida.html?provisional=1&next=" + encodeURIComponent(destination)
                : destination;
        }

        (async () => {
            const { data: { session } } = await sb.auth.getSession();
            if (session) await entrarOPedirCodigo();
        })();

        const form = document.getElementById("login-form");
        const errorMsg = document.getElementById("error-msg");
        const submitBtn = document.getElementById("submit-btn");

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            errorMsg.classList.add("hidden");
            submitBtn.disabled = true;
            submitBtn.textContent = "Ingresando...";

            // Quien tiene usuario escribe "sofia.munoz" y no el correo entero:
            // UsuarioAlumno.completar() le pega el dominio. Un correo de verdad
            // pasa igual que siempre.
            const email = UsuarioAlumno.completar(document.getElementById("email").value);
            const password = document.getElementById("password").value;

            const { error } = await sb.auth.signInWithPassword({ email, password });

            if (error) {
                errorMsg.textContent = "Correo, usuario o contraseña incorrectos.";
                errorMsg.classList.remove("hidden");
                submitBtn.disabled = false;
                submitBtn.textContent = "Iniciar sesión";
                return;
            }

            await entrarOPedirCodigo();
        });

        /* ---------------- El segundo paso ---------------- */
        const codigoForm = document.getElementById("codigo-form");
        const codigoInput = document.getElementById("codigo");
        const codigoMsg = document.getElementById("codigo-msg");
        const codigoBtn = document.getElementById("codigo-btn");

        function pedirCodigo() {
            form.hidden = true;
            codigoForm.hidden = false;
            codigoInput.focus();
        }

        codigoForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            codigoMsg.textContent = "";
            codigoBtn.disabled = true;
            codigoBtn.textContent = "Revisando…";
            const r = await DosPasos.verificar(codigoInput.value);
            if (r.ok) { await irAlDestino(); return; }
            codigoMsg.textContent = r.error;
            codigoBtn.disabled = false;
            codigoBtn.textContent = "Entrar con el código";
            codigoInput.select();
        });

        document.getElementById("codigo-salir").addEventListener("click", async () => {
            try { await sb.auth.signOut(); } catch (e) { }
            codigoForm.hidden = true;
            codigoInput.value = "";
            form.hidden = false;
            submitBtn.disabled = false;
            submitBtn.textContent = "Iniciar sesión";
            document.getElementById("email").focus();
        });
    