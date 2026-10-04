/* Lo que comparten juegos.html y competir.html: el catálogo de modalidades,
   la posición de salida de cada una y a qué página se entra para jugarla.

   Estaba dentro de js/juegos.js. Cuando «En línea ahora» y las listas de
   partidas se mudaron a competir.html, las dos páginas pasaron a necesitarlo
   —el formulario del profesor crea partidas y aceptar un reto también—, y
   una sola copia es la regla: si estadoInicial() se duplicara, una partida
   creada por un camino y otra por el otro podrían arrancar distinto.

   Script clásico: sus const y function de arriba quedan globales para el
   script de la página, que se carga después. */
        // Modalidades disponibles: solo Crazyhouse por ahora, el resto se ve
        // "Próximamente" — un mismo lugar para agregar la siguiente cuando
        // exista, igual que las tarjetas del panel de Clases.
        const VARIANTS = [
            { id: "estandar", emoji: "⚔️", label: "Ajedrez Estándar", desc: "Ajedrez clásico, de toda la vida, en tiempo real — sin ninguna variante encima." },
            { id: "crazyhouse", emoji: "♞", label: "Crazyhouse", desc: "Las piezas que capturas pasan a tu reserva: puedes soltarlas de vuelta en el tablero como propias." },
            { id: "cartas", emoji: "🃏", label: "Ajedrez de Cartas", desc: "Ajedrez de toda la vida más una mano de cartas de un solo uso: refuerzos, congelar al rival, escudos, un salto de rey y más." },
            { id: "duelo", emoji: "⚡", label: "Duelo Simultáneo", desc: "Los dos jugadores eligen su jugada en secreto y a la vez, desde la misma posición. Se revelan juntas: si apuntan a la misma casilla, chocan; si uno escapaba de donde el otro atacaba, escapa de verdad." },
            { id: "niebla", emoji: "🌫️", label: "Niebla de Guerra", desc: "Ajedrez de siempre, pero el tablero está cubierto: solo ves las casillas que tus propias piezas alcanzan a atacar o defender. Hay que deducir dónde está el rival — sin dejar de ver tu propio alcance." },
            { id: "abrazos", emoji: "🤗", label: "Ajedrez de abrazos", desc: "Nadie captura: al llegar a la casilla de una pieza rival, las dos se abrazan y forman una unidad tuya que mueve como cualquiera de sus piezas. Gana quien abraza al rey rival. Reacciones en cadena garantizadas." },
            { id: "camaleon", emoji: "🦎", label: "Camaleón", desc: "Cada pieza mueve como la pieza que empieza en su columna: en a y h como torre, en b y g como caballo, en c y f como alfil, en d como dama y en e como rey. Los peones, como peones. Jaque mate de siempre." },
            { id: "vampiro", emoji: "🧛", label: "Ajedrez Vampiro", desc: "Ajedrez de siempre, pero al capturar una pieza rival te transformas en ella (conservando tu color): un caballo que captura una dama se vuelve dama. El rey nunca se transforma. Jaque mate de siempre." },
            { id: "volcanes", emoji: "🌋", label: "Volcanes", desc: "Ajedrez de siempre, pero cada 6 jugadas un volcán hace erupción en una casilla y se lleva la pieza que esté ahí. Se anuncia 4 jugadas antes: quítate a tiempo… o lleva al rival hacia ahí. Un rey en el volcán pierde." },
            { id: "misiones", emoji: "🎯", label: "Misiones secretas", desc: "Cada uno recibe una misión que el otro no ve (una torre en séptima, dejar al rival sin caballos…). Ganas por mate o si al llegar tu turno tu misión sigue cumplida. Adivina el plan del rival antes de que sea tarde." },
            { id: "ciegas", emoji: "🙈", label: "A ciegas", desc: "Ajedrez normal sin ver las piezas: escribes tu jugada en un panel, la del rival aparece 10 segundos y desaparece. Cinco oportunidades de ver la planilla 20 segundos." },
            { id: "4ffa", emoji: "♟️", label: "4 jugadores · Todos contra todos", desc: "4 personas, un solo tablero en cruz. Suma puntos por capturas y jaque mate — no hace falta ser el último en pie para ganar." },
            { id: "4teams", emoji: "🤝", label: "4 jugadores · Equipos", desc: "2 parejas (los que quedan frente a frente en el tablero): gana el primer equipo que da jaque mate a un rival. No se puede capturar al compañero." },
            { id: "kingofthehill", emoji: "⛰️", label: "Rey de la colina", desc: "Próximamente", disabled: true },
            { id: "threecheck", emoji: "🎯", label: "Tres jaques", desc: "Próximamente", disabled: true },
        ];
        const SEATS = ["red", "blue", "yellow", "green"];
        const SEAT_LABEL = { red: "🔴 Rojo", blue: "🔵 Azul", yellow: "🟡 Amarillo", green: "🟢 Verde" };

        function variantLabel(id) {
            const v = VARIANTS.find((x) => x.id === id);
            return v ? v.emoji + " " + v.label : id;
        }

        // La posición de salida de cada modalidad. Vive acá y no en dos lugares
        // porque la usan el formulario del profesor y también aceptar un reto: si
        // se duplicara, una partida creada por un camino y otra por el otro
        // podrían arrancar distinto.
        function estadoInicial(variant) {
            const fila = {};
            if (variant === "cartas") fila.cartas_state = CartasChess.Game.iniciar().toJSON();
            if (variant === "duelo") fila.duelo_state = new DueloSimultaneo.Game().toJSON();
            // El fen por defecto de game_rooms trae el sufijo "[]" de Crazyhouse
            // (la bandeja de reserva) — Niebla de Guerra y Ajedrez Estándar son
            // ajedrez normal, sin reserva, así que necesitan el fen estándar explícito.
            if (variant === "niebla" || variant === "estandar") fila.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            // Las variantes de variante.html guardan su propia posición inicial (Abrazos y
            // Camaleón no usan el FEN de Crazyhouse); A ciegas lleva la cuenta de desbloqueos.
            if (window.Variantes && (variant === "abrazos" || variant === "camaleon" || variant === "ciegas" || variant === "vampiro")) {
                fila.fen = Variantes.inicio(variant);
                if (variant === "ciegas") fila.variant_state = { w_unlocks: 5, b_unlocks: 5 };
            }
            // Volcanes sortea acá sus casillas (las ven los dos: se anuncian igual).
            // Misiones secretas no guarda nada acá: la misión la reparte la base,
            // escondida (repartir_misiones()).
            if (variant === "volcanes" || variant === "misiones") fila.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            if (variant === "volcanes" && window.Variantes) fila.variant_state = { volcanes: Variantes.Volcanes.sorteo() };
            return fila;
        }

        // Cada variante de 2 jugadores comparte la tabla game_rooms, pero cada una
        // vive en su propia página — aquí se decide a cuál ir según row.variant.
        function pageFor2pVariant(variant) {
            if (variant === "estandar") return "estandar.html";
            if (variant === "cartas") return "cartas.html";
            if (variant === "duelo") return "duelo.html";
            if (variant === "niebla") return "niebla.html";
            if (variant === "abrazos" || variant === "camaleon" || variant === "ciegas" || variant === "vampiro" || variant === "volcanes" || variant === "misiones") return "variante.html";
            return "crazyhouse.html";
        }

        function escapeHtml(text) {
            const div = document.createElement("div");
            div.textContent = text;
            return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        const nombreVisible = (p) => p.full_name || p.email || "Alguien";
