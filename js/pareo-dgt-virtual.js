/* «Probar sin tableros físicos», en pareo-dgt.html: tableros DGT de mentira
   para ensayar el día del torneo (LiveChess, la carpeta, el Broadcaster y la
   transmisión de Lichess) sin un solo tablero electrónico.

   Cada tablero virtual es un puerto COM: com0com crea un par (COM10 ↔ COM11),
   LiveChess abre una punta y esta página la otra con Web Serial (Chrome o Edge
   en la computadora). El tablero contesta como uno DGT por USB
   (js/pareo/dgt-tablero.js) y juega una partida de maestros de
   js/estilo-modelos.js, ya comprobada con chess.js: ninguna posición se
   inventa. Cada jugada llega como en un tablero de verdad, levantando y
   apoyando la pieza, con un respiro entre una cosa y la otra.

   Ver «Probar sin tableros físicos» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const RESPIRO_MS = 200;      // entre levantar y apoyar, como una mano
    const TOPE_REGISTRO = 200;   // renglones de «Lo que llega de LiveChess»
    const tableros = [];
    let siguienteSerie = 10001;    // cabe en la dirección de bus (14 bits): LiveChess muestra el mismo número

    const MODELOS = Object.entries(window.EstiloModelos || {})
        .map(([clave, m]) => ({ ...m, clave }))   // m.id es el de la fuente, no la clave
        .filter((m) => Array.isArray(m.jugadas) && m.jugadas.length > 10);

    function boton(texto, extra) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-3 py-1 rounded-lg text-sm disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" + (extra || "");
        b.textContent = texto;
        return b;
    }

    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
    const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");

    // Cada byte que llega y cada uno que sale, en hexadecimal: para saber qué
    // espera LiveChess cuando no muestra el tablero (ver «Probar sin tableros
    // físicos»).
    function anotar(v, quien, bytes) {
        const hora = new Date().toLocaleTimeString("es-CR", { timeZone: "America/Costa_Rica", hour12: false });
        v.registro.push(hora + "  " + quien + "  " + hex(bytes));
        if (v.registro.length > TOPE_REGISTRO) v.registro.splice(0, v.registro.length - TOPE_REGISTRO);
        v.pre.textContent = v.registro.join("\n");
        v.resumen.textContent = "Lo que llega de LiveChess (" + v.recibidos + " bytes recibidos)";
    }

    async function mandar(v, bytes) {
        await v.writer.write(Uint8Array.from(bytes));
        anotar(v, "Tablero →", bytes);
    }

    async function escribir(v, mensajes) {
        for (let i = 0; i < mensajes.length; i++) {
            if (!v.writer) return;
            await mandar(v, mensajes[i]);
            if (i < mensajes.length - 1) await esperar(RESPIRO_MS);
        }
    }

    function pintarEstado(v) {
        const total = v.partida.jugadas.length;
        const n = v.chess.history().length;
        const lc = v.dgt.modo === "avisa" || v.dgt.siguiendo ? "LiveChess lo está siguiendo" : v.dgt.pedidos.length ? "LiveChess ya lo reconoció; todavía no pidió las jugadas" : "Esperando a LiveChess";
        const espanol = (san) => san.replace(/[NBRQK]/g, (l) => ({ N: "C", B: "A", R: "T", Q: "D", K: "R" })[l]);
        const ultima = n ? (Math.ceil(n / 2)) + (n % 2 ? ". " : "… ") + espanol(v.chess.history()[n - 1]) : "posición inicial";
        v.estado.textContent = lc + " · jugada " + n + " de " + total + " (" + ultima + ")" + (n >= total ? " · partida terminada: " + v.partida.resultado : "") + ".";
        v.btnJugar.textContent = v.timer ? "Pausar" : "Empezar";
        v.btnJugar.setAttribute("aria-pressed", v.timer ? "true" : "false");
        v.btnJugar.disabled = n >= total;
        v.btnSiguiente.disabled = n >= total || !!v.timer;
    }

    async function unaJugada(v) {
        const san = v.partida.jugadas[v.chess.history().length];
        if (!san) { parar(v); return; }
        const mv = v.chess.move(san);
        if (!mv) { parar(v); v.estado.textContent = "La partida tiene una jugada que no es legal («" + san + "»): se detuvo."; return; }
        await escribir(v, v.dgt.jugar(mv, v.chess.fen()));
        if (v.chess.history().length >= v.partida.jugadas.length) parar(v);
        pintarEstado(v);
    }

    function parar(v) {
        clearInterval(v.timer);
        v.timer = null;
    }

    function segundos() {
        const s = Number($("virtual-segundos").value);
        return Math.min(120, Math.max(1, Number.isFinite(s) ? s : 5));
    }

    async function alPrincipio(v) {
        parar(v);
        v.chess.reset();
        await escribir(v, v.dgt.ponerFen(v.chess.fen()));
        pintarEstado(v);
    }

    async function desconectar(v) {
        parar(v);
        try { if (v.reader) await v.reader.cancel(); } catch (_) { /* ya cerrado */ }
        try { if (v.writer) v.writer.releaseLock(); } catch (_) { /* nada */ }
        try { await v.puerto.close(); } catch (_) { /* nada */ }
        v.writer = null;
        v.li.remove();
        tableros.splice(tableros.indexOf(v), 1);
    }

    async function leer(v) {
        try {
            while (v.puerto.readable) {
                v.reader = v.puerto.readable.getReader();
                try {
                    for (;;) {
                        const { value, done } = await v.reader.read();
                        if (done) return;
                        v.recibidos += value.length;
                        anotar(v, "LiveChess →", value);
                        const respuestas = v.dgt.recibir(value);
                        for (const r of respuestas) await mandar(v, r);
                        pintarEstado(v);
                    }
                } finally {
                    v.reader.releaseLock();
                }
            }
        } catch (e) {
            v.estado.textContent = "Se cortó la conexión con el puerto (" + e.message + ").";
        }
    }

    function tarjeta(v) {
        const li = document.createElement("li");
        li.className = "rounded-xl border border-brand-200 dark:border-brand-700 p-3";
        const titulo = document.createElement("p");
        titulo.className = "font-semibold text-brand-800 dark:text-white";
        titulo.textContent = "Tablero virtual " + v.dgt.serie;

        const fila = document.createElement("div");
        fila.className = "mt-2 flex flex-wrap items-center gap-2";
        const etiqueta = document.createElement("label");
        etiqueta.className = "text-sm text-brand-700 dark:text-brand-200";
        etiqueta.htmlFor = "virtual-partida-" + v.dgt.serie;
        etiqueta.textContent = "Partida";
        const select = document.createElement("select");
        select.id = "virtual-partida-" + v.dgt.serie;
        select.className = "max-w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        for (const m of MODELOS) {
            const op = document.createElement("option");
            op.value = m.clave;
            op.textContent = m.blancas + " – " + m.negras + " (" + m.evento + ")";
            select.append(op);
        }
        select.value = v.partida.clave;
        select.addEventListener("change", async () => {
            v.partida = MODELOS.find((m) => m.clave === select.value) || v.partida;
            await alPrincipio(v);
        });
        fila.append(etiqueta, select);

        const acciones = document.createElement("div");
        acciones.className = "mt-2 flex flex-wrap items-center gap-2";
        v.btnJugar = boton("Empezar");
        v.btnJugar.setAttribute("aria-pressed", "false");
        v.btnJugar.addEventListener("click", () => {
            if (v.timer) { parar(v); pintarEstado(v); return; }
            v.timer = setInterval(() => unaJugada(v), segundos() * 1000);
            pintarEstado(v);
        });
        v.btnSiguiente = boton("Una jugada");
        v.btnSiguiente.addEventListener("click", () => unaJugada(v));
        const btnPrincipio = boton("Volver al principio");
        btnPrincipio.addEventListener("click", () => alPrincipio(v));
        const btnQuitar = boton("Desconectar");
        btnQuitar.addEventListener("click", () => desconectar(v));
        acciones.append(v.btnJugar, v.btnSiguiente, btnPrincipio, btnQuitar);

        v.estado = document.createElement("p");
        v.estado.setAttribute("role", "status");
        v.estado.className = "mt-2 text-sm text-brand-700 dark:text-brand-200";

        const detalle = document.createElement("details");
        detalle.className = "mt-2 text-sm";
        v.resumen = document.createElement("summary");
        v.resumen.className = "cursor-pointer text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
        v.resumen.textContent = "Lo que llega de LiveChess (0 bytes recibidos)";
        const ayuda = document.createElement("p");
        ayuda.className = "mt-1 text-brand-700 dark:text-brand-200";
        ayuda.textContent = "Cada byte que manda LiveChess y cada uno que contesta el tablero, en hexadecimal. Si LiveChess no muestra el tablero, copia esto y pásalo.";
        v.pre = document.createElement("pre");
        v.pre.className = "mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg p-2 text-xs text-brand-900 dark:text-brand-100";
        v.pre.textContent = "Todavía no llegó nada.";
        const btnCopiar = boton("Copiar", " mt-1");
        btnCopiar.addEventListener("click", async () => {
            const texto = "Tablero virtual " + v.dgt.serie + " · " + v.recibidos + " bytes recibidos\n" + v.registro.join("\n");
            try { await navigator.clipboard.writeText(texto); btnCopiar.textContent = "Copiado"; }
            catch (_) { btnCopiar.textContent = "No se pudo copiar: selecciónalo a mano"; }
            setTimeout(() => { btnCopiar.textContent = "Copiar"; }, 2500);
        });
        detalle.append(v.resumen, ayuda, v.pre, btnCopiar);
        li.append(titulo, fila, acciones, v.estado, detalle);
        return li;
    }

    async function agregar() {
        $("virtual-error").textContent = "";
        if (!navigator.serial) {
            $("virtual-error").textContent = "Este navegador no puede usar puertos COM. Usa Chrome o Edge en la computadora.";
            return;
        }
        if (!MODELOS.length) { $("virtual-error").textContent = "No se cargaron las partidas modelo."; return; }
        let puerto;
        try {
            puerto = await navigator.serial.requestPort();
        } catch (e) {
            if (e && e.name !== "NotFoundError") $("virtual-error").textContent = "No se pudo elegir el puerto: " + e.message;
            return;
        }
        try {
            await puerto.open({ baudRate: 9600 });
        } catch (e) {
            $("virtual-error").textContent = "No se pudo abrir ese puerto (" + e.message + "). ¿Lo tiene abierto otro programa? LiveChess va en la otra punta del par.";
            return;
        }
        // Un tablero de verdad tiene las líneas de control encendidas; con
        // com0com, LiveChess las ve en la otra punta (DSR y CTS).
        try { if (puerto.setSignals) await puerto.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch (_) { /* no todos los puertos */ }
        const v = {
            puerto,
            writer: puerto.writable.getWriter(),
            dgt: DgtTablero.crear({ serie: String(siguienteSerie++) }),
            chess: new Chess(),
            partida: MODELOS[tableros.length % MODELOS.length],
            timer: null,
            registro: [],
            recibidos: 0,
        };
        v.li = tarjeta(v);
        tableros.push(v);
        $("virtuales").append(v.li);
        pintarEstado(v);
        leer(v);
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (!$("btn-virtual")) return;
        $("btn-virtual").addEventListener("click", agregar);
        if (!navigator.serial) {
            $("btn-virtual").disabled = true;
            $("virtual-error").textContent = "Este navegador no puede usar puertos COM. Usa Chrome o Edge en la computadora.";
        }
    });
})();
