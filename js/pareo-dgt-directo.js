/* «Transmitir sin LiveChess», en pareo-dgt.html: los tableros DGT de verdad
   conectados directo a la página.

   Cada puerto COM (una cadena en bus o un tablero USB) se abre con Web Serial
   a 9600 baudios. js/pareo/dgt-lector.js encuentra sus tableros, les pide las
   jugadas (0x83) y el reloj (0x81) uno por uno, y arma cada partida con
   chess.js. Cada tablero va a una mesa (se recuerda entre rondas); con la
   ronda que dejó lista js/pareo-dgt.js (su pareo y su ronda en Lichess), el
   PGN de todas las mesas, con las jugadas y el reloj, se empuja a Lichess
   cada pocos segundos si algo cambió.

   Ver «Transmitir sin LiveChess» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const CLAVE = "pareo-dgt-directo";
    const EMPUJAR_MS = 3000;     // a Lichess, como mucho cada 3 s
    const RELOJ_CADA = 3;        // el reloj, una vuelta de cada 3
    const ESPERA_MS = 300;       // una respuesta: 80 ms dice DGT, más lo que tarda el USB
    const API = () => window.PareoDGTPagina;

    function leer() {
        try {
            const e = JSON.parse(localStorage.getItem(CLAVE) || "{}");
            return { torneo: e.torneo || "", asignadas: e.asignadas && typeof e.asignadas === "object" ? e.asignadas : {}, conocidos: Array.isArray(e.conocidos) ? e.conocidos : [] };
        } catch (_) { return { torneo: "", asignadas: {}, conocidos: [] }; }
    }
    const estado = leer();
    function guardar() {
        try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (_) { /* sigue en memoria */ }
    }

    const puertos = [];          // { serial, cadena, dirs, activo, nombre, li }
    const tableros = new Map();  // dir → { dir, puerto, partida, ronda, fallas, fila… }
    let ultimoEmpuje = "";
    let empujando = false;

    // ------------------------------------------------------------ el puerto

    // Lo que crearCadena necesita de un puerto: escribir y esperar el próximo
    // mensaje entero (con un tope de tiempo).
    function puertoDe(serial) {
        const flujo = DgtLector.crearFlujo();
        const cola = [];
        let avisar = null;
        const writer = serial.writable.getWriter();
        const p = {
            writer,
            async escribir(bytes) { await writer.write(Uint8Array.from(bytes)); },
            esperar(ms) {
                if (cola.length) return Promise.resolve(cola.shift());
                return new Promise((resolver) => {
                    const t = setTimeout(() => { avisar = null; resolver(null); }, ms);
                    avisar = () => { clearTimeout(t); avisar = null; resolver(cola.shift() || null); };
                });
            },
            async leer() {
                while (serial.readable) {
                    p.reader = serial.readable.getReader();
                    try {
                        for (;;) {
                            const { value, done } = await p.reader.read();
                            if (done) return;
                            for (const m of flujo.empujar(value)) cola.push(m);
                            if (cola.length && avisar) avisar();
                        }
                    } finally { p.reader.releaseLock(); }
                }
            },
        };
        p.leer().catch(() => { /* el puerto se cerró */ });
        return p;
    }

    // ------------------------------------------------------------ la ronda

    function rondaActual() {
        return estado.torneo && API() ? API().ronda(estado.torneo) : null;
    }

    function mesasDeLaRonda(r) {
        if (!r) return [];
        return PareoDGT.partidas(r.pareo, { mesas: r.mesas });
    }

    // La partida del tablero, una por ronda: con la ronda nueva empieza otra,
    // que espera a que las piezas estén en la posición inicial.
    function partidaDe(t) {
        const r = rondaActual();
        const n = r ? r.ronda : 0;
        if (!t.partida || t.ronda !== n) {
            const ahora = t.partida ? t.partida.casillas() : t.casillas;
            t.partida = DgtLector.crearPartida(Chess);
            t.ronda = n;
            t.vistos = -1;
            if (ahora) t.partida.tablero(ahora);
        }
        return t.partida;
    }

    // ------------------------------------------------------------ leer los tableros

    async function primeraVez(t, cadena) {
        await cadena.cambios(t.dir);                    // lo de antes no es de esta partida
        const r = await cadena.tablero(t.dir);
        if (!r.error) { t.casillas = r.casillas; partidaDe(t).tablero(r.casillas); }
    }

    // Un solo pedido a la vez por puerto: si «Buscar tableros otra vez» se
    // mezcla con la lectura, las respuestas de uno le llegan al otro.
    function enTurno(p, fn) {
        const r = p.ocupado.then(fn);
        p.ocupado = r.catch(() => {});
        return r;
    }

    async function vuelta(p, n) {
        for (const dir of [...p.dirs]) {
            if (!p.activo) return;
            const t = tableros.get(dir);
            if (!t) continue;
            await enTurno(p, () => leerUno(p, t, dir, n));
        }
    }

    async function leerUno(p, t, dir, n) {
        const c = await p.cadena.cambios(dir);
        if (c.error) { t.fallas += 1; pintarFila(t); return; }
        t.fallas = 0;
        const partida = partidaDe(t);
        const antes = partida.jugadas().length;
        partida.memoria(c.eventos);
        if (n % RELOJ_CADA === 0) {
            const r = await p.cadena.reloj(dir);
            if (!r.error) partida.reloj(r.reloj);
        }
        if (partida.jugadas().length !== antes || partida.cambios !== t.vistos) pintarFila(t);
    }

    async function leerSiempre(p) {
        for (let n = 0; p.activo; n++) {
            await vuelta(p, n);
            if (!p.dirs.length) await new Promise((r) => setTimeout(r, 1000));
            empujar();
        }
    }

    async function buscar(p) {
        p.buscando = true;
        pintarPuertos();
        const conocidos = estado.conocidos.filter((d) => !tableros.has(d) || tableros.get(d).puerto === p);
        const hallados = await enTurno(p, async () => {
            const h = await p.cadena.encontrar(conocidos);
            for (const dir of h) {
                if (!tableros.has(dir)) {
                    const t = { dir, puerto: p, fallas: 0 };
                    tableros.set(dir, t);
                    await primeraVez(t, p.cadena);
                }
                if (!p.dirs.includes(dir)) p.dirs.push(dir);
            }
            return h;
        });
        p.dirs.sort((a, b) => a - b);
        estado.conocidos = [...new Set(estado.conocidos.concat(hallados))].slice(-500);
        guardar();
        p.buscando = false;
        API() && API().anotar(p.nombre + ": " + hallados.length + " tablero" + (hallados.length === 1 ? "" : "s") + " encontrado" + (hallados.length === 1 ? "" : "s") + (hallados.length ? " (" + hallados.join(", ") + ")" : ". ¿Está cerrado LiveChess? ¿Tienen corriente?") + ".", hallados.length ? {} : { error: true });
        pintarPuertos();
        pintarTableros();
    }

    async function conectar() {
        $("directo-error").textContent = "";
        if (!navigator.serial) { $("directo-error").textContent = "Este navegador no puede usar puertos COM. Usa Chrome o Edge en la computadora."; return; }
        let serial;
        try { serial = await navigator.serial.requestPort(); }
        catch (e) { if (e && e.name !== "NotFoundError") $("directo-error").textContent = "No se pudo elegir el puerto: " + e.message; return; }
        try { await serial.open({ baudRate: 9600 }); }
        catch (e) { $("directo-error").textContent = "No se pudo abrir ese puerto (" + e.message + "). ¿Lo tiene abierto LiveChess u otra pestaña?"; return; }
        try { if (serial.setSignals) await serial.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch (_) { /* no todos */ }
        const info = serial.getInfo ? serial.getInfo() : {};
        const p = { serial, dirs: [], activo: true, ocupado: Promise.resolve(), nombre: "Puerto " + (puertos.length + 1) + (info.usbProductId ? " (USB)" : "") };
        p.io = puertoDe(serial);
        p.cadena = DgtLector.crearCadena(p.io, { espera: ESPERA_MS });
        puertos.push(p);
        pintarPuertos();
        await buscar(p);
        leerSiempre(p);
    }

    async function desconectar(p) {
        p.activo = false;
        for (const d of p.dirs) tableros.delete(d);
        try { if (p.io.reader) await p.io.reader.cancel(); } catch (_) { /* cerrado */ }
        try { p.io.writer.releaseLock(); } catch (_) { /* nada */ }
        try { await p.serial.close(); } catch (_) { /* nada */ }
        puertos.splice(puertos.indexOf(p), 1);
        pintarPuertos();
        pintarTableros();
    }

    // ------------------------------------------------------------ Lichess

    function jugadasPorMesa() {
        const out = {};
        for (const t of tableros.values()) {
            const mesa = estado.asignadas[t.dir];
            if (!mesa || !t.partida || !t.partida.jugadas().length && t.partida.resultado() === "*") continue;
            out[mesa] = { texto: t.partida.texto(), resultado: t.partida.resultado() };
        }
        return out;
    }

    async function empujar() {
        const r = rondaActual();
        if (empujando || !r || !r.lichess || !API().lichessListo()) { pintarEstado(); return; }
        if (Date.now() - (empujar.ultima || 0) < EMPUJAR_MS) return;
        const pgn = PareoDGT.pgn(r.pareo, Object.assign({ mesas: r.mesas, jugadas: jugadasPorMesa() }, API().opcionesPgn()));
        if (pgn === ultimoEmpuje) return;
        empujando = true;
        empujar.ultima = Date.now();
        try {
            await API().empujar(r.lichess.id, pgn);
            ultimoEmpuje = pgn;
            empujar.error = "";
            empujar.hora = HoraCR.hora(new Date(), { hour: "numeric", minute: "2-digit", second: "2-digit" });
        } catch (e) {
            if (empujar.error !== e.message) API().anotar("Transmitir sin LiveChess: no se pudo subir a Lichess. " + e.message + ". Se vuelve a intentar.", { error: true });
            empujar.error = e.message;
        }
        empujando = false;
        pintarEstado();
    }

    // ------------------------------------------------------------ la pantalla

    function pintarEstado() {
        const r = rondaActual();
        const n = tableros.size;
        let texto;
        if (!puertos.length) texto = "Ningún puerto conectado.";
        else if (!estado.torneo) texto = "Elige el torneo.";
        else if (!r) texto = n + " tablero" + (n === 1 ? "" : "s") + ". Falta la ronda: «Revisar ahora» en el paso 4.";
        else if (!r.lichess) texto = n + " tablero" + (n === 1 ? "" : "s") + ", ronda " + r.ronda + ". Falta crear la ronda en Lichess (paso 3).";
        else if (!API().lichessListo()) texto = "Ronda " + r.ronda + ": falta conectar Lichess (paso 3).";
        else if (empujar.error) texto = "Ronda " + r.ronda + ": Lichess no recibió la última subida (" + empujar.error + ").";
        else texto = "Ronda " + r.ronda + ": " + n + " tablero" + (n === 1 ? "" : "s") + (empujar.hora ? ". Subido a Lichess: " + empujar.hora.replace(/\.$/, "") : ", todavía sin jugadas") + ".";
        $("directo-estado").textContent = texto;
        $("btn-directo-orden").disabled = !tableros.size || !r;
    }

    function pintarPuertos() {
        const ul = $("directo-puertos");
        ul.textContent = "";
        for (const p of puertos) {
            const li = document.createElement("li");
            li.className = "flex flex-wrap items-center gap-2";
            const txt = document.createElement("span");
            txt.textContent = p.nombre + ": " + (p.buscando ? "buscando tableros…" : p.dirs.length + " tablero" + (p.dirs.length === 1 ? "" : "s"));
            const otra = document.createElement("button");
            otra.type = "button";
            otra.className = "underline underline-offset-2 hover:no-underline rounded disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            otra.textContent = "Buscar tableros otra vez";
            otra.disabled = !!p.buscando;
            otra.addEventListener("click", () => buscar(p));
            const quitar = document.createElement("button");
            quitar.type = "button";
            quitar.className = otra.className;
            quitar.textContent = "Desconectar";
            quitar.addEventListener("click", () => desconectar(p));
            li.append(txt, otra, quitar);
            ul.append(li);
        }
        pintarEstado();
    }

    const espanol = (san) => san.replace(/[NBRQK]/g, (l) => ({ N: "C", B: "A", R: "T", Q: "D", K: "R" })[l]);
    const reloj = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

    function pintarFila(t) {
        if (!t.fila) return;
        const partida = partidaDe(t);
        t.vistos = partida.cambios;
        const mesa = estado.asignadas[t.dir];
        const m = mesasDeLaRonda(rondaActual()).find((x) => String(x.mesa) === String(mesa));
        t.celdas.partida.textContent = m ? m.blancas.nombre + " – " + m.negras.nombre : mesa ? "Esa mesa no se transmite en esta ronda" : "—";
        const h = partida.jugadas();
        t.celdas.jugadas.textContent = t.fallas >= 3 ? "Sin respuesta del tablero" : partida.rotado() === null ? "Esperando la posición inicial" : h.length ? h.length + " · " + Math.ceil(h.length / 2) + (h.length % 2 ? ". " : "… ") + espanol(h[h.length - 1]) : "Lista para empezar";
        const r = partida.ultimoReloj();
        const ladoB = partida.blancasA();
        t.celdas.reloj.textContent = !r ? "—" : ladoB ? "Blancas " + reloj(r[ladoB].segundos) + " · Negras " + reloj(r[ladoB === "izquierda" ? "derecha" : "izquierda"].segundos) : "Izq. " + reloj(r.izquierda.segundos) + " · Der. " + reloj(r.derecha.segundos);
        t.celdas.resultado.value = partida.resultado();
    }

    function pintarTableros() {
        const tb = $("directo-tableros");
        tb.textContent = "";
        const mesas = mesasDeLaRonda(rondaActual());
        for (const t of [...tableros.values()].sort((a, b) => a.dir - b.dir)) {
            const tr = document.createElement("tr");
            tr.className = "border-t border-brand-100 dark:border-brand-800";
            const td = () => { const c = document.createElement("td"); c.className = "py-1 pr-3 align-middle"; tr.append(c); return c; };
            const th = document.createElement("th");
            th.scope = "row";
            th.className = "py-1 pr-3 font-mono font-semibold";
            th.textContent = String(t.dir);
            tr.append(th);

            const sel = document.createElement("select");
            sel.className = "bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            sel.setAttribute("aria-label", "Mesa del tablero " + t.dir);
            const sin = document.createElement("option");
            sin.value = "";
            sin.textContent = "Sin mesa";
            sel.append(sin);
            const numeros = new Set(mesas.map((m) => String(m.mesa)));
            if (estado.asignadas[t.dir] && !numeros.has(String(estado.asignadas[t.dir]))) numeros.add(String(estado.asignadas[t.dir]));
            for (const n of [...numeros].sort((a, b) => a - b)) {
                const op = document.createElement("option");
                op.value = n;
                op.textContent = "Mesa " + n;
                sel.append(op);
            }
            sel.value = estado.asignadas[t.dir] ? String(estado.asignadas[t.dir]) : "";
            sel.addEventListener("change", () => {
                if (sel.value) {
                    // Una mesa, un tablero: si ya lo tenía otro, lo suelta.
                    for (const [d, m] of Object.entries(estado.asignadas)) if (String(m) === sel.value && Number(d) !== t.dir) delete estado.asignadas[d];
                    estado.asignadas[t.dir] = Number(sel.value);
                } else delete estado.asignadas[t.dir];
                guardar();
                pintarTableros();
                ultimoEmpuje = "";
                empujar();
            });
            td().append(sel);

            t.celdas = { partida: td(), jugadas: td(), reloj: td() };
            const res = document.createElement("select");
            res.className = sel.className;
            res.setAttribute("aria-label", "Resultado del tablero " + t.dir);
            for (const [v, txt] of [["*", "En juego"], ["1-0", "1-0"], ["0-1", "0-1"], ["1/2-1/2", "½-½"]]) {
                const op = document.createElement("option");
                op.value = v;
                op.textContent = txt;
                res.append(op);
            }
            res.addEventListener("change", () => { partidaDe(t).ponerResultado(res.value); pintarFila(t); empujar(); });
            td().append(res);
            t.celdas.resultado = res;
            t.fila = tr;
            tb.append(tr);
            pintarFila(t);
        }
        pintarEstado();
    }

    function pintarTorneos() {
        const sel = $("directo-torneo");
        const lista = API() ? API().torneos() : [];
        const antes = sel.value || estado.torneo;
        sel.textContent = "";
        if (!lista.length) {
            const op = document.createElement("option");
            op.value = "";
            op.textContent = "Agrega un torneo en el paso 1";
            sel.append(op);
        }
        for (const t of lista) {
            const op = document.createElement("option");
            op.value = t.tnr;
            op.textContent = t.nombre;
            sel.append(op);
        }
        sel.value = lista.some((t) => t.tnr === antes) ? antes : lista.length ? lista[0].tnr : "";
        if (estado.torneo !== sel.value) { estado.torneo = sel.value; guardar(); }
    }

    function asignarEnOrden() {
        const mesas = mesasDeLaRonda(rondaActual()).map((m) => m.mesa);
        const dirs = [...tableros.keys()].sort((a, b) => a - b);
        estado.asignadas = {};
        dirs.forEach((d, i) => { if (mesas[i] != null) estado.asignadas[d] = mesas[i]; });
        guardar();
        pintarTableros();
        ultimoEmpuje = "";
        empujar();
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (!$("btn-directo-puerto")) return;
        $("btn-directo-puerto").addEventListener("click", conectar);
        $("btn-directo-orden").addEventListener("click", asignarEnOrden);
        $("directo-torneo").addEventListener("change", () => { estado.torneo = $("directo-torneo").value; guardar(); ultimoEmpuje = ""; pintarTableros(); });
        if (!navigator.serial) {
            $("btn-directo-puerto").disabled = true;
            $("directo-error").textContent = "Este navegador no puede usar puertos COM. Usa Chrome o Edge en la computadora.";
        }
        // Cambió un torneo, una ronda o Lichess (js/pareo-dgt.js).
        // Solo se rehace la tabla si cambió la ronda o sus mesas: si no, quien
        // está eligiendo una mesa perdería el foco cada 30 segundos.
        let clave = "";
        document.addEventListener("pareo-dgt:cambio", () => {
            pintarTorneos();
            const r = rondaActual();
            const nueva = estado.torneo + "|" + (r ? r.ronda + "|" + r.mesas + "|" + PareoDGT.firma(r.pareo) : "");
            if (nueva !== clave) { clave = nueva; pintarTableros(); } else pintarEstado();
        });
        pintarTorneos();
        pintarEstado();
    });
})();
