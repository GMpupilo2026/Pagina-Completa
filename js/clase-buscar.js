/* El código de sesion.html.

   «¿Qué quieres hacer?»: el buscador de herramientas del profe en la clase en
   vivo. La clase tiene decenas de herramientas repartidas en cinco pestañas,
   en cajas plegadas, en la barra del tablero y en la lista de alumnos; quien
   busca «la ronda rápida» con la clase mirando no tiene tiempo de abrir
   pestaña por pestaña. Se escribe lo que se quiere hacer y te lleva ahí: abre
   la pestaña, despliega la caja y deja el foco en el botón. Ver «Buscar una
   herramienta sin salir de la clase» en docs/decisiones/clase-en-vivo.md.

   - NO APRIETA NADA POR SU CUENTA. Lleva a la herramienta y la deja con el
     foco; el profe decide si la usa (Enter). Muchas mandan algo a toda la
     clase (una pregunta, un calentamiento, reiniciar el tablero), y un Enter
     apurado en el buscador no puede mandarlo.
   - No cambia de página: el Ctrl + K del resto de la Academia (que lleva al
     panel) acá no va, porque salir de la clase tiene que cerrar antes la
     asistencia. Acá Ctrl + K trae ESTE buscador.
   - Solo ofrece lo que está en la pantalla del profe ahora (o detrás de una
     pestaña, de una caja plegada o del modo sencillo). Lo que aparece solo en
     un momento de la clase (el podio, el mapa de una pregunta abierta) no se
     ofrece cuando no está: llevaría a un botón que no existe.
   - Las pestañas se cambian con su propio botón y el modo sencillo con el
     suyo: así sesion.js hace lo de siempre (cargar Táctica, recordar la
     pestaña). Nada de este archivo toca el tablero ni la base.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js, que llama a montar() al saber que quien
   entra es el profe. */

window.ClaseBuscar = (function () {
    /* Cada herramienta: su nombre (lo que se lee en la lista), las palabras
       con que se la pide, y el elemento al que se lleva el foco. Cada clave
       tiene que ser cierta: está porque esa herramienta lo hace. */
    const HERRAMIENTAS = [
        { nombre: "Tu plan de clase", donde: "Mi plan", claves: "plan planificacion temario que voy a dar", destino: "plan-panel" },
        { nombre: "Táctica por tema", donde: "Táctica", claves: "ejercicios tactica temas clavada horquilla mate posiciones", destino: "tactics-panel" },
        { nombre: "Entrenamientos de la plataforma", donde: "Entrenamientos", claves: "entrenamiento entrenamientos habilidades detective memoria tipos ventana", destino: "tipos-panel" },
        { nombre: "Preguntar: ¿qué jugarías?", donde: "Preguntar", claves: "pregunta preguntar jugada respuesta tablero que jugarias", destino: "ask-question-btn" },
        { nombre: "Preguntar: ¿quién está mejor?", donde: "Preguntar", claves: "pregunta evaluar valorar quien esta mejor ventaja", destino: "ask-quien-mejor-btn" },
        { nombre: "Preguntar con opciones", donde: "Preguntar", claves: "pregunta opciones alternativas multiple", destino: "ask-opciones-btn" },
        { nombre: "Preguntar: ¿lo entendiste? (termómetro)", donde: "Preguntar", claves: "termometro entendiste comprension encuesta", destino: "ask-termometro-btn" },
        { nombre: "La clase juega votando", donde: "Preguntar", claves: "votar votacion partida clase juega contra motor contra mi", destino: "partida-clase" },
        { nombre: "Calentamiento o competencia de ejercicios", donde: "Preguntar", claves: "calentamiento competencia tanda ejercicios nota tiempo", destino: "tanda-config" },
        { nombre: "Ronda rápida", donde: "Preguntar", claves: "ronda rapida posiciones seguidas podio", destino: "ronda-caja" },
        { nombre: "Cuestionario al estilo Kahoot", donde: "Preguntar", claves: "cuestionario kahoot quiz preguntas opciones puntos rapidez", destino: "cuestionario-caja" },
        { nombre: "Practicar contra el motor", donde: "Practicar", claves: "practica practicar motor jugar posicion", destino: "start-practice-btn" },
        { nombre: "Partidas entre alumnos", donde: "Practicar", claves: "partidas emparejar parejas jugar entre ellos", destino: "emparejar-btn" },
        { nombre: "Abrir una lección de un curso", donde: "Tu material", claves: "curso cursos leccion material", destino: "toggle-lesson-btn" },
        { nombre: "Jalar un archivo PGN", donde: "Tu material", claves: "archivo archivos pgn partida subida", destino: "toggle-archivos-btn" },
        { nombre: "Leer un PDF", donde: "Tu material", claves: "pdf libro documento diagrama", destino: "toggle-pdf-btn" },
        { nombre: "Armar una posición (o cargar FEN o PGN)", donde: "Tu material", claves: "armar posicion editar editor fen pgn colocar piezas", destino: "toggle-free-mode-btn" },
        { nombre: "Motor de análisis", donde: "Motor", claves: "motor stockfish analisis evaluacion", destino: "engine-toggle-btn" },
        { nombre: "Elegir a un alumno al azar", donde: "Alumnos", claves: "azar elegir sortear alumno al azar quien responde", destino: "elegir-azar-btn" },
        { nombre: "Participación en esta clase", donde: "Alumnos", claves: "participacion cuantas veces le toco", destino: "elegidos-cuenta-caja" },
        { nombre: "Puntos de esta clase y el podio", donde: "Alumnos", claves: "puntos podio ranking ganador mes", destino: "puntos-caja" },
        { nombre: "Equipos", donde: "Alumnos", claves: "equipos grupos armar", destino: "equipos-profe" },
        { nombre: "Que vean la clase sin cuenta (invitados)", donde: "Alumnos", claves: "invitados enlace sin cuenta familia visitantes", destino: "invitados" },
        { nombre: "Tiempo para pensar", donde: "Tablero", claves: "tiempo pensar cuenta regresiva segundos reloj", destino: "pensar-abrir-btn" },
        { nombre: "Girar el tablero", donde: "Tablero", claves: "girar voltear rotar tablero negras", destino: "flip-board-btn" },
        { nombre: "El nombre en cada casilla", donde: "Tablero", claves: "coordenadas casillas nombre letras numeros", destino: "show-coords-btn" },
        { nombre: "Borrar flechas y círculos", donde: "Tablero", claves: "borrar flechas circulos marcas limpiar", destino: "clear-marks-btn" },
        { nombre: "Ocultar las piezas a los alumnos", donde: "Tablero", claves: "ocultar esconder piezas ciegas", destino: "toggle-hide-btn" },
        { nombre: "Guardar el PGN de la clase", donde: "Tablero", claves: "guardar pgn descargar partida", destino: "save-game-btn" },
        { nombre: "Reiniciar el tablero", donde: "Tablero", claves: "reiniciar posicion inicial empezar de nuevo", destino: "reset-board-btn" },
        { nombre: "Proyector: el tablero solo, en otra ventana", donde: "Tablero", claves: "proyector pantalla grande televisor ventana", destino: "proyector-btn" },
        { nombre: "Ver tu clase como un alumno", donde: "Tablero", claves: "ver como alumno vista previa", destino: "vista-alumno-btn" },
        { nombre: "Control remoto desde tu celular", donde: "Tablero", claves: "control remoto celular telefono", destino: "control-btn" },
        { nombre: "Tus herramientas, en grande", donde: "Herramientas", claves: "grande agrandar letra ver mejor", destino: "grandes-abrir-btn" },
        { nombre: "Abrir la clase", donde: "La clase", claves: "abrir clase empezar iniciar", destino: "clase-abrir-btn" },
        { nombre: "Cerrar la clase", donde: "La clase", claves: "cerrar clase terminar finalizar", destino: "clase-cerrar-btn" },
    ];

    // Lo que sí se puede abrir para llegar: una pestaña, una caja plegada, la
    // barra de «Tu material» (que el modo sencillo esconde).
    const ABRIBLES = "[data-tab-panel], details, #teacher-toolbar, #toolbar-material";

    const plano = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ]+/g, " ").trim();
    const escondido = (el) => el.hidden || getComputedStyle(el).display === "none";

    /* ¿Se puede llegar? El elemento existe y nada lo esconde salvo lo que este
       buscador sabe abrir. Lo que esconde el código de cada herramienta (el
       botón de cerrar con la clase cerrada, la barra del alumno) no se toca. */
    function alcanzable(el) {
        if (!el) return false;
        for (let n = el; n && n !== document.body; n = n.parentElement) {
            if (!escondido(n)) continue;
            if (n.matches(ABRIBLES)) continue;
            return false;
        }
        return true;
    }

    function disponibles() {
        return HERRAMIENTAS.filter((h) => alcanzable(document.getElementById(h.destino)));
    }

    /* Todas las palabras tienen que estar, y cada una al COMIENZO de una
       palabra (como el buscador del panel): «ron» es la ronda, no «patrón». */
    function buscar(texto) {
        const palabras = plano(texto).split(" ").filter(Boolean);
        const lista = disponibles();
        if (!palabras.length) return lista;
        return lista.filter((h) => {
            const donde = " " + plano(h.nombre + " " + h.claves + " " + h.donde);
            return palabras.every((p) => donde.includes(" " + p));
        });
    }

    let ir = null;   // lo pone montar(): sabe cambiar de pestaña y salir del modo sencillo

    function llevarA(h) {
        const el = document.getElementById(h.destino);
        if (!el || !ir) return false;
        ir(el);
        // Cada caja plegada del camino se abre (también la propia, si es una).
        for (let n = el; n && n !== document.body; n = n.parentElement) {
            if (n.tagName === "DETAILS") n.open = true;
        }
        const foco = el.tagName === "DETAILS" ? el.querySelector("summary") : el;
        let objetivo = foco;
        if (!objetivo.matches("button, a[href], input, select, textarea, summary, [tabindex]")) {
            objetivo = el.querySelector("h2, h3") || el;
            objetivo.setAttribute("tabindex", "-1");
        }
        const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "center" });
        objetivo.focus({ preventScroll: true });
        // Un aro que se va solo, para que el ojo la encuentre en la columna.
        el.classList.add("buscar-resaltado");
        setTimeout(() => el.classList.remove("buscar-resaltado"), 2500);
        return true;
    }

    function montar({ activarPestana }) {
        const caja = document.getElementById("buscar-herramienta");
        const campo = document.getElementById("buscar-herramienta-campo");
        const lista = document.getElementById("buscar-herramienta-lista");
        const estado = document.getElementById("buscar-herramienta-estado");
        if (!caja || !campo || !lista) return;
        caja.hidden = false;

        ir = (el) => {
            // La ventana «en grande» deja inerte lo que no es la columna.
            const aside = document.getElementById("herramientas-profe");
            if (window.HerramientasGrandes && HerramientasGrandes.abierta() && aside && !aside.contains(el)) {
                HerramientasGrandes.cerrar({ foco: false });
            }
            const panel = el.closest("[data-tab-panel]");
            const sencillo = document.getElementById("modo-sencillo-btn");
            const pestana = panel && document.getElementById("teacher-tab-" + panel.dataset.tabPanel);
            const enMaterial = el.closest("#teacher-toolbar");
            // El modo sencillo esconde las pestañas avanzadas y «Tu material»:
            // pedir una de ellas es pedir ver todas.
            if (sencillo && ((pestana && pestana.hidden) || (enMaterial && escondido(enMaterial)))) sencillo.click();
            if (pestana && panel.classList.contains("hidden")) {
                if (activarPestana) activarPestana(pestana); else pestana.click();
            }
        };

        let resultados = [];
        let elegido = -1;
        let anuncio = null;

        function cerrarLista() {
            lista.hidden = true;
            campo.setAttribute("aria-expanded", "false");
            campo.removeAttribute("aria-activedescendant");
            elegido = -1;
        }

        function marcar(i) {
            elegido = i;
            [...lista.children].forEach((li, j) => {
                li.setAttribute("aria-selected", j === i ? "true" : "false");
                li.classList.toggle("bg-accent-100", j === i);
                li.classList.toggle("dark:bg-brand-700", j === i);
            });
            if (i >= 0 && lista.children[i]) {
                campo.setAttribute("aria-activedescendant", lista.children[i].id);
                lista.children[i].scrollIntoView({ block: "nearest" });
            } else campo.removeAttribute("aria-activedescendant");
        }

        function pintar() {
            const texto = campo.value;
            resultados = buscar(texto);
            lista.replaceChildren();
            resultados.forEach((h, i) => {
                const li = document.createElement("li");
                li.id = "buscar-herramienta-op-" + i;
                li.setAttribute("role", "option");
                li.setAttribute("aria-selected", "false");
                li.className = "px-3 py-2 rounded-lg cursor-pointer text-sm text-brand-800 dark:text-brand-100 hover:bg-accent-100 dark:hover:bg-brand-700";
                const nombre = document.createElement("span");
                nombre.className = "font-medium";
                nombre.textContent = h.nombre;
                const donde = document.createElement("span");
                donde.className = "block text-xs text-brand-500 dark:text-brand-300";
                donde.textContent = "En: " + h.donde;
                li.append(nombre, donde);
                // mousedown y no click: con click el campo pierde el foco antes
                // y la lista se cierra sin elegir.
                li.addEventListener("mousedown", (e) => { e.preventDefault(); elegir(i); });
                lista.appendChild(li);
            });
            lista.hidden = false;
            campo.setAttribute("aria-expanded", "true");
            marcar(resultados.length && texto.trim() ? 0 : -1);
            clearTimeout(anuncio);
            anuncio = setTimeout(() => {
                if (!texto.trim()) { estado.textContent = ""; return; }
                estado.textContent = resultados.length
                    ? (resultados.length === 1 ? "1 herramienta" : resultados.length + " herramientas") + ". Enter lleva a «" + resultados[0].nombre + "»."
                    : "Ninguna herramienta con «" + texto.trim() + "». Prueba con otra palabra: ronda, pregunta, puntos, proyector…";
            }, 350);
        }

        function elegir(i) {
            const h = resultados[i];
            if (!h) return;
            cerrarLista();
            campo.value = "";
            estado.textContent = "";
            llevarA(h);
        }

        campo.addEventListener("input", pintar);
        campo.addEventListener("focus", () => { if (campo.value.trim()) pintar(); });
        campo.addEventListener("blur", () => setTimeout(cerrarLista, 120));
        campo.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (lista.hidden) pintar();
                if (!resultados.length) return;
                const paso = e.key === "ArrowDown" ? 1 : -1;
                marcar((elegido + paso + resultados.length) % resultados.length);
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (!lista.hidden && resultados.length) elegir(elegido >= 0 ? elegido : 0);
            } else if (e.key === "Escape") {
                if (!lista.hidden || campo.value) { e.preventDefault(); e.stopPropagation(); campo.value = ""; estado.textContent = ""; cerrarLista(); }
            }
        });

        /* Ctrl + K (⌘ + K en Mac) trae el buscador desde cualquier parte de la
           clase. No hay «/»: en la clase se escribe en el chat, en los
           comentarios y en el cuadro de comandos. */
        document.addEventListener("keydown", (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== "k") return;
            if (caja.hidden || !alcanzable(campo)) return;
            e.preventDefault();
            campo.focus();
            campo.select();
        });
    }

    return { montar, buscar, HERRAMIENTAS };
})();
