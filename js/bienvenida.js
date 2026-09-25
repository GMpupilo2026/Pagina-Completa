/* El código de bienvenida.html.

   Vivía escrito dentro de la página, en un <script> de 10 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        const pasos = {
            cargando: document.getElementById("paso-cargando"),
            crear: document.getElementById("paso-crear"),
            listo: document.getElementById("paso-listo"),
            sinEnlace: document.getElementById("paso-sin-enlace"),
        };

        function mostrar(cual) {
            for (const [nombre, el] of Object.entries(pasos)) {
                el.classList.toggle("hidden", nombre !== cual);
            }
        }

        /* El enlace del correo puede ser de dos clases y la página lo dice con
           las palabras de cada una: una invitación es "crea tu contraseña" y una
           recuperación es "elige una nueva". Lo que hace debajo es lo mismo. */
        function claseDeEnlace() {
            const entrada = window.__entrada || { hash: "", busqueda: "" };
            const texto = entrada.hash + entrada.busqueda;
            if (/type=recovery/.test(texto)) return "recuperacion";
            return "invitacion";
        }

        function errorDelEnlace() {
            const entrada = window.__entrada || { hash: "", busqueda: "" };
            const p = new URLSearchParams((entrada.hash || "").replace(/^#/, ""));
            const q = new URLSearchParams(entrada.busqueda || "");
            const codigo = p.get("error_code") || q.get("error_code");
            const descripcion = p.get("error_description") || q.get("error_description");
            if (!codigo && !descripcion && !p.get("error") && !q.get("error")) return null;
            if (codigo === "otp_expired") {
                return "El enlace se venció. Los del correo duran poco tiempo y se usan una sola vez.";
            }
            return "El enlace no se pudo usar. Puede que ya lo hayas abierto antes o que se haya vencido.";
        }

        function tituloSegunClase() {
            if (claseDeEnlace() !== "recuperacion") return;
            document.getElementById("titulo").textContent = "Elige una contraseña nueva";
            document.getElementById("subtitulo").textContent =
                "Pon la contraseña con la que vas a entrar de ahora en adelante.";
            const h2 = pasos.crear.querySelector("h2");
            if (h2) h2.textContent = "Tu contraseña nueva";
        }

        /* Los alumnos sin correo propio entran con un usuario, así que donde la
           página dice "tu correo" tiene que decir "tu usuario" — si no, los
           cuatro pasos del ingreso le explican a un niño cómo entrar con algo
           que no tiene. Se cambian las palabras y nada más: lo que hace la
           página debajo es exactamente lo mismo. */
        function ponerPalabraUsuario() {
            const etiqueta = document.getElementById("correo-etiqueta");
            if (etiqueta) etiqueta.textContent = "Tu usuario";
            const paso = document.getElementById("paso-escribe-correo");
            if (paso) paso.textContent = "tu usuario";
            const entrar = document.getElementById("listo-como-entrar");
            if (entrar) {
                entrar.textContent =
                    "De aquí en adelante entras con tu usuario y esta contraseña. " +
                    "Abajo te explicamos cómo, por si se te olvida.";
            }
            const olvido = document.getElementById("listo-olvido");
            if (olvido) {
                olvido.innerHTML =
                    '<strong class="text-brand-800 dark:text-white">¿Se te olvidó la contraseña?</strong> ' +
                    "En la pantalla de inicio de sesión toca «¿Olvidaste tu contraseña?», escribe tu " +
                    "usuario y el enlace para poner una nueva le llega al correo de tu casa.";
            }
        }

        /* login.html manda aquí con ?recuperar=1 cuando alguien olvidó su
           contraseña: es el mismo formulario del enlace vencido, así que no se
           escribe dos veces — solo cambia lo que dice. */
        function vienePorOlvido() {
            return new URLSearchParams(window.location.search).get("recuperar") === "1";
        }

        (async () => {
            tituloSegunClase();

            if (vienePorOlvido()) {
                document.getElementById("titulo").textContent = "¿Olvidaste tu contraseña?";
                document.getElementById("subtitulo").textContent =
                    "Te mandamos un correo para que pongas una nueva.";
                document.getElementById("sin-enlace-titulo").textContent = "Pide un enlace";
                document.getElementById("sin-enlace-motivo").textContent =
                    "Escribe el correo con el que entras a la Academia y te mandamos un enlace para poner una contraseña nueva.";
                mostrar("sinEnlace");
                document.getElementById("correo-otro").focus();
                return;
            }

            const fallo = errorDelEnlace();
            if (fallo) {
                document.getElementById("sin-enlace-motivo").textContent =
                    fallo + " Escribe tu correo y te mandamos uno nuevo.";
                mostrar("sinEnlace");
                return;
            }

            /* getSession() espera a que el cliente termine de procesar el enlace,
               así que no hace falta ningún temporizador: o hay sesión o el enlace
               no servía. */
            const { data: { session } } = await sb.auth.getSession();
            if (!session) { mostrar("sinEnlace"); return; }

            /* Quien no tiene correo propio entra con un usuario, y la página
               tiene que llamarlo por su nombre: enseñarle
               "sofia.munoz@alumno.ajedrez-integral.com" debajo de la palabra
               "Tu correo" es decirle que le escriban ahí, y ahí no llega nada.
               Se le enseña el usuario pelado, que es lo que va a escribir. */
            const entra = session.user.email || "";
            const esUsuario = UsuarioAlumno.esInterno(entra);
            document.getElementById("correo").value =
                esUsuario ? UsuarioAlumno.soloUsuario(entra) : entra;
            if (esUsuario) ponerPalabraUsuario();
            mostrar("crear");
            document.getElementById("clave").focus();
        })();

        // Ver la contraseña: los dos campos a la vez, porque el error que
        // esto evita es justamente que no coincidan.
        const verBtn = document.getElementById("ver-clave");
        verBtn.addEventListener("click", () => {
            const mostrando = verBtn.getAttribute("aria-pressed") === "true";
            const tipo = mostrando ? "password" : "text";
            document.getElementById("clave").type = tipo;
            document.getElementById("clave2").type = tipo;
            verBtn.setAttribute("aria-pressed", String(!mostrando));
            verBtn.textContent = mostrando ? "Ver la contraseña" : "Ocultar la contraseña";
        });

        document.getElementById("form-clave").addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = document.getElementById("clave-msg");
            const btn = document.getElementById("guardar-clave");
            const clave = document.getElementById("clave").value;
            const clave2 = document.getElementById("clave2").value;

            const decir = (texto) => {
                msg.textContent = texto;
                msg.classList.remove("hidden");
            };
            msg.classList.add("hidden");

            if (clave.length < 8) { decir("La contraseña debe tener al menos 8 caracteres."); return; }
            if (clave !== clave2) { decir("Las dos contraseñas no son iguales. Revísalas."); return; }

            btn.disabled = true;
            btn.textContent = "Guardando…";

            const { error } = await sb.auth.updateUser({ password: clave });

            if (error) {
                decir(error.message);
                btn.disabled = false;
                btn.textContent = "Guardar mi contraseña y entrar";
                return;
            }

            mostrar("listo");
            document.getElementById("titulo").textContent = "¡Listo!";
            document.getElementById("subtitulo").textContent = "Ya puedes entrar a la Academia cuando quieras.";
            document.getElementById("paso-listo").querySelector("a").focus();
        });

        document.getElementById("form-otro").addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = document.getElementById("otro-msg");
            const btn = document.getElementById("pedir-otro");
            const correo = UsuarioAlumno.completar(document.getElementById("correo-otro").value);

            btn.disabled = true;
            btn.textContent = "Enviando…";

            /* Se responde lo mismo exista o no la cuenta: decir "ese correo no
               está registrado" le contaría a cualquiera quién tiene cuenta.

               DOS CAMINOS, PORQUE SON DOS COSAS DISTINTAS. Un correo de verdad
               sigue por el de siempre, que está probado y no necesita nada más.
               Un alumno con usuario de la academia no tiene buzón: mandarle el
               enlace ahí sería mandarlo a la nada, y la pantalla diría igual
               que salió — el niño se quedaría fuera para siempre sin que nadie
               se entere. Para ese caso, `recuperar-acceso` lo manda a donde de
               verdad se le puede escribir a esa familia. */
            try {
                if (UsuarioAlumno.esInterno(correo)) {
                    await fetch(`${window.SUPABASE_URL}/functions/v1/recuperar-acceso`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "apikey": window.SUPABASE_ANON_KEY,
                        },
                        body: JSON.stringify({ usuario: correo }),
                    });
                } else {
                    await sb.auth.resetPasswordForEmail(correo, {
                        redirectTo: window.location.origin + "/bienvenida.html",
                    });
                }
            } catch (_) {
                /* Ni el fallo se cuenta: decir "esa cuenta no existe" y decir
                   "algo falló" son dos respuestas distintas, y con dos
                   respuestas distintas se puede averiguar quién tiene cuenta. */
            }

            msg.textContent = "Si esa cuenta existe, ya salió un correo con el enlace nuevo. Revisa también la carpeta de spam.";
            msg.className = "text-sm text-green-600 dark:text-green-400";
            msg.classList.remove("hidden");
            btn.disabled = false;
            btn.textContent = "Mandarme un enlace nuevo";
        });
    