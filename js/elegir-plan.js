/* El código de elegir-plan.html.

   Vivía escrito dentro de la página, en un <script> de 6 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        /* El precio de la cuenta sale de js/precios-acceso.js, el mismo de
           precios.html y accesos.html. El que va escrito arriba es solo el de
           respaldo, y verificar-accesos.js comprueba que diga lo mismo. */
        if (window.PreciosAcceso) {
            document.getElementById("precio-plataforma").textContent = PreciosAcceso.formato(PreciosAcceso.INDIVIDUAL);
        }
        /* El enlace del correo trae la solicitud (?s=). Se guarda en la pestaña
           para no perderla al pasar por el login, que solo sabe volver a una
           página .html, sin parámetros. */
        const CLAVE_SOLICITUD = "elegir_plan_solicitud";
        let solicitudId = new URLSearchParams(window.location.search).get("s");
        try {
            if (solicitudId) sessionStorage.setItem(CLAVE_SOLICITUD, solicitudId);
            else solicitudId = sessionStorage.getItem(CLAVE_SOLICITUD);
        } catch (e) {}

        function mostrar(id) {
            ["cargando", "invalido", "ya-elegido", "elegir"].forEach((otro) => {
                document.getElementById(otro).classList.toggle("hidden", otro !== id);
            });
        }

        const NOMBRE_PLAN = { plataforma: "Acceso a la plataforma", grupal: "Clase grupal", individual: "Clase individual" };

        // Los planes, sin nada que elegir: sin sesión, o sin el enlace del correo.
        function soloVer(texto, conLogin) {
            document.getElementById("elegir-titulo").textContent = "Los planes de Ajedrez Integral";
            document.getElementById("elegir-sub").textContent = "Los precios están en colones y son finales.";
            document.getElementById("terminos-caja").classList.add("hidden");
            document.querySelectorAll(".plan-btn").forEach((b) => b.classList.add("hidden"));
            document.getElementById("solo-ver-texto").textContent = texto;
            document.getElementById("solo-ver-login").classList.toggle("hidden", !conLogin);
            document.getElementById("solo-ver").classList.remove("hidden");
            mostrar("elegir");
        }

        async function cargar() {
            let session = null;
            try { session = (await sb.auth.getSession()).data.session; } catch (e) {}
            if (!session) {
                soloVer(solicitudId
                    ? "Para elegir tu plan, inicia sesión con la cuenta del correo al que te llegó el enlace. ¿No tienes cuenta? Escríbenos y lo coordinamos."
                    : "¿Te interesa alguno? Escríbenos y lo coordinamos. Si te llegó un enlace por correo para elegir tu plan, ábrelo desde ahí.",
                    !!solicitudId);
                return;
            }
            if (!solicitudId) {
                soloVer("Para elegir un plan hace falta el enlace que te mandamos por correo. Si no lo tienes, escríbenos.", false);
                return;
            }

            const { data, error } = await sb.rpc("solicitud_para_elegir_plan", { p_id: solicitudId });
            const fila = Array.isArray(data) ? data[0] : data;

            if (error || !fila || !fila.estado) {
                // La base solo la devuelve a la cuenta del correo de la solicitud.
                document.getElementById("invalido-detalle").textContent =
                    "No encontramos esa solicitud en tu cuenta. Entra con la cuenta del correo al que te llegó el enlace.";
                mostrar("invalido");
                return;
            }
            if (fila.estado === "pendiente") {
                document.getElementById("invalido-detalle").textContent = "Tu solicitud todavía se está revisando — todavía no hay un plan que elegir.";
                mostrar("invalido");
                return;
            }
            if (fila.estado === "aprobada") {
                document.getElementById("invalido-detalle").textContent = "¡Tu solicitud ya fue aprobada! Revisa tu correo para entrar a la Academia.";
                mostrar("invalido");
                return;
            }
            if (fila.plan_elegido) {
                document.getElementById("ya-elegido-detalle").textContent =
                    `Ya elegiste "${NOMBRE_PLAN[fila.plan_elegido] || fila.plan_elegido}". Te vamos a contactar para coordinar el pago.`;
                mostrar("ya-elegido");
                return;
            }

            document.getElementById("saludo-nombre").textContent = (fila.nombre || "").split(" ")[0] || "";
            mostrar("elegir");
        }

        document.querySelectorAll(".plan-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const errorEl = document.getElementById("elegir-error");
                errorEl.classList.add("hidden");
                const acepto = document.getElementById("acepto-terminos");
                if (!acepto.checked) {
                    errorEl.textContent = "Antes de elegir, marca la casilla de los Términos y condiciones.";
                    errorEl.classList.remove("hidden");
                    acepto.focus();
                    return;
                }
                document.querySelectorAll(".plan-btn").forEach((b) => (b.disabled = true));
                btn.textContent = "Guardando…";

                const { data, error } = await sb.rpc("elegir_plan", {
                    p_id: solicitudId, p_plan: btn.dataset.plan,
                    // Qué versiones aceptó: la base las guarda con la hora.
                    p_version_terminos: window.LegalVersion.TERMINOS,
                    p_version_privacidad: window.LegalVersion.PRIVACIDAD,
                });

                if (error || !data?.ok) {
                    document.getElementById("elegir-error").textContent = data?.error || "No se pudo guardar tu elección. Intenta de nuevo.";
                    document.getElementById("elegir-error").classList.remove("hidden");
                    document.querySelectorAll(".plan-btn").forEach((b) => (b.disabled = false));
                    btn.textContent = "Elegir este plan";
                    return;
                }

                try { sessionStorage.removeItem(CLAVE_SOLICITUD); } catch (e) {}
                document.getElementById("ya-elegido-detalle").textContent =
                    `Elegiste "${NOMBRE_PLAN[btn.dataset.plan]}". Te vamos a contactar para coordinar el pago.`;
                mostrar("ya-elegido");
            });
        });

        cargar();
    