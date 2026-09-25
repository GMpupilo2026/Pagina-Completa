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

        (async () => {
            const { data: { session } } = await sb.auth.getSession();
            if (session) window.location.href = destination;
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

            window.location.href = destination;
        });
    