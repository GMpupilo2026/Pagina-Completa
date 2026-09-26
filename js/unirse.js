/* El código de unirse.html.

   Vivía escrito dentro de la página, en un <script> de 1 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        const form = document.getElementById("unirse-form");
        const errorMsg = document.getElementById("error-msg");
        const submitBtn = document.getElementById("submit-btn");

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            errorMsg.classList.add("hidden");

            // El honeypot no debería tener nada escrito: si lo tiene, es un bot.
            // Se responde igual que un envío exitoso para no darle pistas.
            if (document.getElementById("sitio-web").value.trim()) {
                document.getElementById("form-card").classList.add("hidden");
                document.getElementById("success-card").classList.remove("hidden");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = "Enviando...";

            const { data, error } = await sb.rpc("solicitar_academia", {
                p_nombre: document.getElementById("nombre").value.trim(),
                p_email: document.getElementById("email").value.trim(),
                p_telefono: document.getElementById("telefono").value.trim() || null,
                p_edad_nivel: document.getElementById("edad-nivel").value.trim() || null,
                p_mensaje: document.getElementById("mensaje").value.trim() || null,
                // Qué versión de la política aceptó: la base la guarda con la hora.
                p_version_privacidad: window.LegalVersion.PRIVACIDAD,
            });

            if (error || !data?.ok) {
                errorMsg.textContent = data?.error || "No se pudo enviar la solicitud. Intenta de nuevo.";
                errorMsg.classList.remove("hidden");
                submitBtn.disabled = false;
                submitBtn.textContent = "Enviar solicitud";
                return;
            }

            document.getElementById("form-card").classList.add("hidden");
            document.getElementById("success-card").classList.remove("hidden");
        });
    