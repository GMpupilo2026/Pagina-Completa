/* «Transmitir sin LiveChess», en pareo-dgt.html: los tableros DGT de verdad
   conectados directo a la página, para todo el torneo, sin tocar nada después
   de la configuración inicial.

   Cada puerto COM (una cadena en bus o un tablero USB) se abre con Web Serial
   a 9600 baudios. js/pareo/dgt-lector.js encuentra sus tableros, les pide las
   jugadas (0x83) y el reloj (0x81) uno por uno, y arma cada partida con
   chess.js. Cada tablero tiene su categoría (uno de los torneos de
   chess-results de la sección 1) y su mesa, y eso es todo lo que se
   configura: cuando js/pareo-dgt.js lee una ronda nueva de esa categoría y la
   crea en Lichess, el tablero empieza la partida nueva con los jugadores de su
   mesa y la empuja a esa ronda.

   Un tablero que sigue con la partida de la ronda anterior la termina primero
   (pasa a la nueva cuando tiene resultado o cuando las piezas vuelven a la
   posición inicial), y cada ronda se empuja siempre entera: lo de cada
   tablero queda guardado en esta computadora, también para no perderlo si se
   recarga la página.

   Ver «Transmitir sin LiveChess» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const CLAVE = "pareo-dgt-directo";
    const EMPUJAR_MS = 3000;     // a Lichess, como mucho cada 3 s por ronda
    const RELOJ_CADA = 3;        // el reloj, una vuelta de cada 3
    const ESPERA_MS = 300;       // una respuesta: 80 ms dice DGT, más lo que tarda el USB
    const RONDAS_GUARDADAS = 3;  // por categoría, las últimas rondas con sus partidas
    const API = () => window.PareoDGTPagina;

    function leer() {
        try {
            const e = JSON.parse(localStorage.getItem(CLAVE) || "{}");
            const asignadas = {};
            for (const [d, a] of Object.entries(e.asignadas && typeof e.asignadas === "object" ? e.asignadas : {})) {
                // Antes había un solo torneo y se guardaba solo la mesa.
                if (a && typeof a === "object" && a.tnr && a.mesa) asignadas[d] = { tnr: String(a.tnr), mesa: Number(a.mesa) };
                else if (Number(a) && e.torneo) asignadas[d] = { tnr: String(e.torneo), mesa: Number(a) };
            }
            return { asignadas, conocidos: Array.isArray(e.conocidos) ? e.conocidos : [], juegos: e.juegos && typeof e.juegos === "object" ? e.juegos : {} };
        } catch (_) { return { asignadas: {}, conocidos: [], juegos: {} }; }
    }
    const estado = leer();
    function guardar() {
        try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (_) { /* sigue en memoria */ }
    }

    const puertos = [];          // { serial, io, cadena, dirs, activo, nombre, ocupado }
    const tableros = new Map();  // dir → { dir, puerto, fallas, juego: { tnr, ronda, partida }, casillas, fila, celdas }
    const sucias = new Set();    // las rondas («tnr|n») con algo nuevo para Lichess
    const empujadas = {};        // «tnr|n» → { pgn, cuando, hora, error }

    const clave = (tnr, n) => tnr + "|" + n;
    const asignacion = (dir) => estado.asignadas[dir] || null;
    const nombreDe = (tnr) => { const t = (API() ? API().torneos() : []).find((x) => x.tnr === tnr); return t ? t.nombre : "tnr" + tnr; };

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

    // ------------------------------------------------------------ la partida de cada tablero

    // La ronda a la que va el tablero ahora: la última que salió de su categoría.
    function rondaObjetivo(t) {
        const a = asignacion(t.dir);
        const r = a && API() ? API().ronda(a.tnr) : null;
        return { tnr: a ? a.tnr : null, ronda: r ? r.ronda : 0 };
    }

    function nuevoJuego(t, tnr, ronda) {
        const ahora = t.juego ? t.juego.partida.casillas() : t.casillas;
        const guardada = tnr && ronda && estado.juegos[clave(tnr, ronda)] && estado.juegos[clave(tnr, ronda)][t.dir];
        t.juego = { tnr, ronda, partida: DgtLector.crearPartida(Chess, guardada ? { guardada } : {}) };
        t.vistos = -1;
        if (ahora) t.juego.partida.tablero(ahora);
    }

    // Lo de este tablero en esta ronda, para empujarlo y para no perderlo.
    function anotarJuego(t) {
        const j = t.juego;
        const a = asignacion(t.dir);
        if (!j || !j.tnr || !j.ronda || !a || a.tnr !== j.tnr) return;
        const k = clave(j.tnr, j.ronda);
        const g = Object.assign(j.partida.guardar(), { mesa: a.mesa });
        estado.juegos[k] = estado.juegos[k] || {};
        if (JSON.stringify(estado.juegos[k][t.dir]) === JSON.stringify(g)) return;
        // Una mesa, un tablero: si la tenía otro en esta ronda sin jugadas, la suelta.
        for (const [d, otro] of Object.entries(estado.juegos[k])) if (Number(d) !== t.dir && otro.mesa === a.mesa && !otro.jugadas.length) delete estado.juegos[k][d];
        estado.juegos[k][t.dir] = g;
        podar(j.tnr);
        guardar();
        sucias.add(k);
    }

    // De cada categoría quedan solo las últimas rondas.
    function podar(tnr) {
        const rondas = Object.keys(estado.juegos).filter((k) => k.startsWith(tnr + "|")).map((k) => Number(k.split("|")[1])).sort((a, b) => b - a);
        for (const n of rondas.slice(RONDAS_GUARDADAS)) delete estado.juegos[clave(tnr, n)];
    }

    // Antes de leer: ¿sigue en la partida que tiene? Cambia si cambió su
    // categoría, o si salió la ronda nueva y la de ahora no empezó o ya terminó.
    function alDia(t) {
        const obj = rondaObjetivo(t);
        if (!t.juego || t.juego.tnr !== obj.tnr) { nuevoJuego(t, obj.tnr, obj.ronda); return; }
        if (t.juego.ronda === obj.ronda) return;
        const p = t.juego.partida;
        if (!p.jugadas().length || p.resultado() !== "*") { anotarJuego(t); nuevoJuego(t, obj.tnr, obj.ronda); }
    }

    // Después de leer: la partida de la ronda anterior que se termina (con
    // resultado o con las piezas otra vez en la posición inicial) deja lugar a
    // la nueva.
    function despues(t) {
        anotarJuego(t);
        const obj = rondaObjetivo(t);
        if (!t.juego || t.juego.ronda === obj.ronda) return;
        const p = t.juego.partida;
        const armado = [DgtLector.colocacion(p.casillas()), DgtLector.colocacion(p.casillas().reverse())].includes(DgtLector.INICIAL);
        if (p.resultado() !== "*" || armado) { nuevoJuego(t, obj.tnr, obj.ronda); anotarJuego(t); pintarFila(t); }
    }

    // ------------------------------------------------------------ leer los tableros

    // Un solo pedido a la vez por puerto: si «Buscar tableros otra vez» se
    // mezcla con la lectura, las respuestas de uno le llegan al otro.
    function enTurno(p, fn) {
        const r = p.ocupado.then(fn);
        p.ocupado = r.catch(() => {});
        return r;
    }

    async function primeraVez(t, cadena) {
        await cadena.cambios(t.dir);                    // lo de antes de conectar no es de esta partida
        const r = await cadena.tablero(t.dir);
        if (!r.error) t.casillas = r.casillas;
        alDia(t);
        if (!r.error) t.juego.partida.tablero(r.casillas);
        despues(t);
    }

    async function leerUno(p, t, n) {
        alDia(t);
        const c = await p.cadena.cambios(t.dir);
        if (c.error) { t.fallas += 1; pintarFila(t); return; }
        t.fallas = 0;
        const partida = t.juego.partida;
        partida.memoria(c.eventos);
        if (n % RELOJ_CADA === 0) {
            const r = await p.cadena.reloj(t.dir);
            if (!r.error) partida.reloj(r.reloj);
        }
        despues(t);
        // También si salió la ronda nueva y este tablero todavía termina la anterior.
        if (t.juego.partida.cambios !== t.vistos || rondaObjetivo(t).ronda !== t.objetivoVisto) pintarFila(t);
    }

    async function vuelta(p, n) {
        for (const dir of [...p.dirs]) {
            if (!p.activo) return;
            const t = tableros.get(dir);
            if (t) await enTurno(p, () => leerUno(p, t, n));
        }
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
        // Para que las rondas nuevas lleguen solas, chess-results se vigila.
        if (API() && !API().vigilando()) { API().vigilar(); API().anotar("Transmitir sin LiveChess: se empezó a vigilar chess-results, para que cada ronda nueva llegue sola a los tableros."); }
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

    // El PGN de una ronda entera: el pareo de todas sus mesas, con las
    // jugadas de cada tablero que jugó en ella (también los que ya pasaron a la
    // ronda siguiente).
    function pgnDe(k, r) {
        const jugadas = {};
        for (const g of Object.values(estado.juegos[k] || {})) {
            if (!g.jugadas.length && g.resultado === "*") continue;
            jugadas[g.mesa] = { texto: DgtLector.textoPgn(g.jugadas, g.tiempos, g.resultado), resultado: g.resultado };
        }
        return PareoDGT.pgn(r.pareo, Object.assign({ mesas: r.mesas, jugadas }, API().opcionesPgn()));
    }

    async function empujar() {
        if (!API() || !API().lichessListo()) { pintarEstado(); return; }
        for (const k of [...sucias]) {
            const [tnr, n] = k.split("|");
            const r = API().ronda(tnr, Number(n));
            if (!r || !r.lichess) continue;                 // todavía no está en Lichess: se espera
            const e = empujadas[k] = empujadas[k] || {};
            if (e.ocupado || Date.now() - (e.cuando || 0) < EMPUJAR_MS) continue;
            const pgn = pgnDe(k, r);
            if (pgn === e.pgn) { sucias.delete(k); continue; }
            e.ocupado = true;
            e.cuando = Date.now();
            try {
                await API().empujar(r.lichess.id, pgn);
                e.pgn = pgn;
                e.error = "";
                e.hora = HoraCR.hora(new Date(), { hour: "numeric", minute: "2-digit", second: "2-digit" }).replace(/\.$/, "");
                sucias.delete(k);
            } catch (err) {
                if (e.error !== err.message) API().anotar("«" + r.nombre + "», ronda " + n + ": no se pudo subir a Lichess. " + err.message + ". Se vuelve a intentar.", { error: true });
                e.error = err.message;
            }
            e.ocupado = false;
        }
        pintarEstado();
    }

    // ------------------------------------------------------------ la pantalla

    function pintarEstado() {
        const n = tableros.size;
        const ul = $("directo-categorias");
        ul.textContent = "";
        if (!puertos.length) { $("directo-estado").textContent = "Ningún puerto conectado."; return; }
        const listo = API() && API().lichessListo();
        $("directo-estado").textContent = n + " tablero" + (n === 1 ? "" : "s") + " conectado" + (n === 1 ? "" : "s") + "." +
            (!listo ? " Falta conectar Lichess (paso 3)." : "") + (API() && !API().vigilando() ? " chess-results no se está vigilando (paso 4): las rondas nuevas no van a llegar solas." : "");
        const porCategoria = new Map();
        for (const t of tableros.values()) { const a = asignacion(t.dir); if (a) porCategoria.set(a.tnr, (porCategoria.get(a.tnr) || 0) + 1); }
        const sin = n - [...porCategoria.values()].reduce((x, y) => x + y, 0);
        for (const [tnr, cuantos] of porCategoria) {
            const r = API().ronda(tnr);
            const e = r ? empujadas[clave(tnr, r.ronda)] : null;
            const li = document.createElement("li");
            li.textContent = nombreDe(tnr) + ": " + cuantos + " tablero" + (cuantos === 1 ? "" : "s") + ", " +
                (!r ? "esperando la primera ronda de chess-results" : !r.lichess ? "ronda " + r.ronda + ", esperando que se cree en Lichess (paso 3)" :
                 "ronda " + r.ronda + (e && e.error ? ". Lichess no recibió la última subida (" + e.error + ")" : e && e.hora ? ". Subido a Lichess: " + e.hora : "")) + ".";
            ul.append(li);
        }
        if (sin) { const li = document.createElement("li"); li.textContent = sin + " tablero" + (sin === 1 ? "" : "s") + " sin categoría: no se transmite" + (sin === 1 ? "" : "n") + "."; ul.append(li); }
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
        if (!t.celdas || !t.juego) return;
        const partida = t.juego.partida;
        t.vistos = partida.cambios;
        const a = asignacion(t.dir);
        const r = t.juego.tnr && t.juego.ronda ? API().ronda(t.juego.tnr, t.juego.ronda) : null;
        const m = r && a ? PareoDGT.partidas(r.pareo, { mesas: r.mesas }).find((x) => x.mesa === a.mesa) : null;
        const actual = rondaObjetivo(t);
        t.objetivoVisto = actual.ronda;
        t.celdas.partida.textContent = !a ? "—" : !r ? "Esperando la ronda" : (m ? m.blancas.nombre + " – " + m.negras.nombre : "La mesa " + a.mesa + " no se transmite") +
            " (ronda " + r.ronda + (actual.ronda !== t.juego.ronda ? "; termina y pasa a la " + actual.ronda : "") + ")";
        const h = partida.jugadas();
        t.celdas.jugadas.textContent = t.fallas >= 3 ? "Sin respuesta del tablero" : partida.rotado() === null ? "Esperando la posición inicial" : h.length ? h.length + " · " + Math.ceil(h.length / 2) + (h.length % 2 ? ". " : "… ") + espanol(h[h.length - 1]) : "Lista para empezar";
        const rl = partida.ultimoReloj();
        const ladoB = partida.blancasA();
        t.celdas.reloj.textContent = !rl ? "—" : ladoB ? "Blancas " + reloj(rl[ladoB].segundos) + " · Negras " + reloj(rl[ladoB === "izquierda" ? "derecha" : "izquierda"].segundos) : "Izq. " + reloj(rl.izquierda.segundos) + " · Der. " + reloj(rl.derecha.segundos);
        if (document.activeElement !== t.celdas.resultado) t.celdas.resultado.value = partida.resultado();
    }

    const CLASE_CAMPO = "bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

    function opcionesCategoria(sel) {
        const sin = document.createElement("option");
        sin.value = "";
        sin.textContent = "Sin categoría";
        sel.append(sin);
        for (const c of API() ? API().torneos() : []) {
            const op = document.createElement("option");
            op.value = c.tnr;
            op.textContent = c.nombre;
            sel.append(op);
        }
    }

    // Una mesa de una categoría, un tablero: si la tenía otro, la suelta.
    function asignar(dir, tnr, mesa) {
        if (tnr && mesa) {
            for (const [d, a] of Object.entries(estado.asignadas)) if (Number(d) !== dir && a.tnr === tnr && a.mesa === mesa) delete estado.asignadas[d];
            estado.asignadas[dir] = { tnr, mesa };
        } else delete estado.asignadas[dir];
    }

    function despuesDeAsignar() {
        guardar();
        for (const t of tableros.values()) { alDia(t); anotarJuego(t); }
        pintarTableros();
        empujar();
    }

    function pintarTableros() {
        const tb = $("directo-tableros");
        const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.foco : null;
        tb.textContent = "";
        for (const t of [...tableros.values()].sort((a, b) => a.dir - b.dir)) {
            const tr = document.createElement("tr");
            tr.className = "border-t border-brand-100 dark:border-brand-800";
            const td = () => { const c = document.createElement("td"); c.className = "py-1 pr-3 align-middle"; tr.append(c); return c; };
            const th = document.createElement("th");
            th.scope = "row";
            th.className = "py-1 pr-3 font-mono font-semibold";
            th.textContent = String(t.dir);
            tr.append(th);
            const a = asignacion(t.dir);

            const cat = document.createElement("select");
            cat.className = CLASE_CAMPO + " max-w-[12rem]";
            cat.setAttribute("aria-label", "Categoría del tablero " + t.dir);
            cat.dataset.foco = "cat-" + t.dir;
            opcionesCategoria(cat);
            cat.value = a ? a.tnr : "";
            td().append(cat);

            const mesa = document.createElement("input");
            mesa.type = "number";
            mesa.min = "1";
            mesa.max = "999";
            mesa.inputMode = "numeric";
            mesa.className = CLASE_CAMPO + " w-20";
            mesa.setAttribute("aria-label", "Mesa del tablero " + t.dir);
            mesa.dataset.foco = "mesa-" + t.dir;
            mesa.value = a ? String(a.mesa) : "";
            td().append(mesa);
            const cambiar = () => {
                const n = Math.floor(Number(mesa.value));
                asignar(t.dir, cat.value, cat.value && n >= 1 ? n : 0);
                despuesDeAsignar();
            };
            cat.addEventListener("change", () => { if (cat.value && !mesa.value) mesa.value = "1"; cambiar(); });
            mesa.addEventListener("change", cambiar);

            t.celdas = { partida: td(), jugadas: td(), reloj: td() };
            const res = document.createElement("select");
            res.className = CLASE_CAMPO;
            res.setAttribute("aria-label", "Resultado del tablero " + t.dir);
            res.dataset.foco = "res-" + t.dir;
            for (const [v, txt] of [["*", "En juego"], ["1-0", "1-0"], ["0-1", "0-1"], ["1/2-1/2", "½-½"]]) {
                const op = document.createElement("option");
                op.value = v;
                op.textContent = txt;
                res.append(op);
            }
            res.addEventListener("change", () => { if (!t.juego) return; t.juego.partida.ponerResultado(res.value); despues(t); pintarFila(t); empujar(); });
            td().append(res);
            t.celdas.resultado = res;
            t.fila = tr;
            tb.append(tr);
            if (!t.juego) alDia(t);
            pintarFila(t);
        }
        // La tabla se rehace: quien estaba en un campo lo sigue estando.
        if (foco) { const el = tb.querySelector("[data-foco='" + foco + "']"); if (el) el.focus(); }
        pintarCategorias();
        pintarEstado();
    }

    function pintarCategorias() {
        const sel = $("directo-categoria");
        const antes = sel.value;
        sel.textContent = "";
        const lista = API() ? API().torneos() : [];
        for (const c of lista) {
            const op = document.createElement("option");
            op.value = c.tnr;
            op.textContent = c.nombre;
            sel.append(op);
        }
        if (!lista.length) { const op = document.createElement("option"); op.value = ""; op.textContent = "Agrega las categorías en el paso 1"; sel.append(op); }
        sel.value = lista.some((c) => c.tnr === antes) ? antes : lista.length ? lista[0].tnr : "";
        $("btn-directo-asignar").disabled = !lista.length;
    }

    // «Del tablero 10001 al 10020, a Sub-12, desde la mesa 1»: los tableros
    // conectados de ese tramo, en orden, a mesas seguidas.
    function asignarVarios(ev) {
        ev.preventDefault();
        $("directo-asignar-error").textContent = "";
        const desde = Number($("directo-desde").value), hasta = Number($("directo-hasta").value) || desde;
        const tnr = $("directo-categoria").value;
        const primera = Math.floor(Number($("directo-mesa1").value)) || 1;
        if (!desde || hasta < desde) { $("directo-asignar-error").textContent = "Escribe el número del primer tablero y del último (el que dice cada uno en la tabla)."; $("directo-desde").focus(); return; }
        if (!tnr) { $("directo-asignar-error").textContent = "Primero agrega la categoría en el paso 1."; return; }
        const dirs = [...tableros.keys()].filter((d) => d >= desde && d <= hasta).sort((a, b) => a - b);
        if (!dirs.length) { $("directo-asignar-error").textContent = "No hay tableros conectados entre el " + desde + " y el " + hasta + "."; return; }
        dirs.forEach((d, i) => asignar(d, tnr, primera + i));
        despuesDeAsignar();
        API().anotar(nombreDe(tnr) + ": " + dirs.length + " tablero" + (dirs.length === 1 ? "" : "s") + " (" + dirs[0] + (dirs.length > 1 ? "–" + dirs[dirs.length - 1] : "") + ") en las mesas " + primera + (dirs.length > 1 ? " a " + (primera + dirs.length - 1) : "") + ".");
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (!$("btn-directo-puerto")) return;
        $("btn-directo-puerto").addEventListener("click", conectar);
        $("form-directo-asignar").addEventListener("submit", asignarVarios);
        if (!navigator.serial) {
            $("btn-directo-puerto").disabled = true;
            $("directo-error").textContent = "Este navegador no puede usar puertos COM. Usa Chrome o Edge en la computadora.";
        }
        // Cambió una categoría, una ronda o Lichess (js/pareo-dgt.js): los
        // tableros pasan solos a la ronda nueva y se rehace la tabla solo si
        // cambió algo de lo que muestra (si no, quien está en un campo perdería
        // lo que escribe cada 30 segundos).
        let antes = "";
        document.addEventListener("pareo-dgt:cambio", () => {
            const lista = API() ? API().torneos() : [];
            const ahora = lista.map((c) => { const r = API().ronda(c.tnr); return c.tnr + ":" + c.nombre + ":" + (r ? r.ronda + ":" + !!r.lichess + ":" + PareoDGT.firma(r.pareo) : ""); }).join("|");
            for (const t of tableros.values()) { alDia(t); despues(t); }
            if (ahora !== antes) { antes = ahora; pintarTableros(); } else pintarEstado();
            empujar();
        });
        pintarCategorias();
        pintarEstado();
    });
})();
