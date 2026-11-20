/* El código de maestros-dijeron.html (la parte pura está en
   js/maestros-dijeron.js). Ver «100 maestros dijeron» en
   docs/decisiones/clase-en-vivo.md. */
(function () {
    "use strict";
    const M = window.MaestrosDijeron;
    const $ = (id) => document.getElementById(id);
    const ver = (id, si) => $(id).classList.toggle("hidden", !si);
    const anunciar = (t) => { $("anuncio").textContent = ""; setTimeout(() => { $("anuncio").textContent = t; }, 30); };

    let juego = null;
    let cola = [];        // las aperturas que faltan, ya barajadas
    let rondas = 5;
    const datosGuardados = new Map();

    async function init() {
        const { data } = await sb.auth.getSession();
        if (!data.session) { location.href = "login.html?next=maestros-dijeron.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("role, is_admin").eq("id", data.session.user.id).single();
        $("loading").classList.add("hidden");
        $("app").classList.remove("hidden");
        if (!perfil || !(perfil.role === "profesor" || perfil.is_admin === true)) { ver("sin-permiso", true); return; }
        pintarEquipos();
        ver("armar", true);
        $("cuantos-equipos").addEventListener("change", pintarEquipos);
        $("empezar").addEventListener("click", empezar);
        $("adivinar").addEventListener("submit", (ev) => { ev.preventDefault(); probar(); });
        $("mostrar-todas").addEventListener("click", mostrarTodas);
        $("siguiente").addEventListener("click", siguiente);
        $("terminar").addEventListener("click", terminar);
        $("otro").addEventListener("click", () => { juego = null; ver("podio", false); ver("armar", true); $("armar-titulo").focus(); });
    }

    function pintarEquipos() {
        const n = Number($("cuantos-equipos").value) || 2;
        const caja = $("nombres-equipos");
        const antes = [...caja.querySelectorAll("input")].map((i) => i.value);
        caja.replaceChildren();
        for (let i = 0; i < n; i++) {
            const d = document.createElement("div");
            const l = document.createElement("label");
            l.htmlFor = "equipo-" + i;
            l.className = "block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1";
            l.textContent = "Nombre del equipo " + (i + 1);
            const inp = document.createElement("input");
            inp.id = "equipo-" + i;
            inp.maxLength = 30;
            inp.value = antes[i] || "Equipo " + (i + 1);
            inp.className = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            d.append(l, inp);
            caja.appendChild(d);
        }
    }

    function barajar(lista) {
        const a = lista.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }

    async function empezar() {
        const nombres = [...$("nombres-equipos").querySelectorAll("input")].map((i, k) => i.value.trim() || "Equipo " + (k + 1));
        juego = M.nuevoJuego(nombres);
        rondas = Number($("rondas").value) || 5;
        // Solo las que se pueden jugar con chess.js: ninguna posición se inventa.
        cola = barajar(M.APERTURAS.filter((a) => M.posicion(Chess, a.jugadas)));
        ver("armar", false);
        ver("juego", true);
        await siguiente();
    }

    /* Pide los datos de los maestros de la posición. La Edge Function guarda
       lo que contesta Lichess: la misma apertura no se vuelve a pedir. */
    async function datosDe(fen) {
        const clave = fen.split(" ").slice(0, 4).join(" ");
        if (datosGuardados.has(clave)) return { datos: datosGuardados.get(clave) };
        let res;
        try { res = await sb.functions.invoke("explorador-maestros", { body: { fens: [clave] } }); } catch (e) { res = { error: e }; }
        const d = res && res.data;
        const datos = d && d.posiciones && d.posiciones[clave];
        if (res.error || !datos) return { motivo: (d && d.motivo) || "error" };
        datosGuardados.set(clave, datos);
        return { datos };
    }

    async function siguiente() {
        if (juego.jugadas >= rondas || !cola.length) { terminar(true); return; }
        ver("siguiente", false);
        ver("mostrar-todas", true);
        ver("adivinar", true);
        $("ronda-titulo").textContent = "Buscando la posición…";
        $("respuestas").replaceChildren();
        let apertura = null, pos = null, resp = [];
        // Se salta una posición que no traiga al menos tres respuestas.
        while (cola.length) {
            apertura = cola.shift();
            pos = M.posicion(Chess, apertura.jugadas);
            const r = await datosDe(pos.fen);
            if (!r.datos) {
                $("ronda-titulo").textContent = r.motivo === "sin_token"
                    ? "El explorador no está configurado: falta el token de Lichess en el servidor (lo agrega quien administra)."
                    : "El explorador de maestros no contestó. Vuelve a intentarlo en un momento.";
                ver("mostrar-todas", false);
                ver("adivinar", false);
                return;
            }
            resp = M.respuestas(r.datos);
            if (resp.length >= 3) break;
            resp = [];
        }
        if (!resp.length) { terminar(true); return; }
        M.nuevaRonda(juego, apertura, pos, resp);
        pintarRonda();
        $("ronda-titulo").focus();
        anunciar("Posición " + (juego.jugadas + 1) + ": " + apertura.nombre + ". Le toca a " + juego.equipos[juego.turno].nombre + ".");
    }

    function pintarTablero(fen) {
        const caja = $("tablero");
        caja.replaceChildren();
        caja.style.setProperty("--piece-white", "#ffffff");
        caja.style.setProperty("--piece-black", "#1f2933");
        const filas = fen.split(" ")[0].split("/");
        filas.forEach((fila, f) => {
            let c = 0;
            for (const ch of fila) {
                if (/\d/.test(ch)) { for (let k = 0; k < Number(ch); k++) casilla(caja, f, c++, null); }
                else casilla(caja, f, c++, ch);
            }
        });
        const r = juego.ronda;
        caja.setAttribute("aria-label", "Posición después de " + (r.linea || "ninguna jugada (la inicial)") + ". Juegan " + (r.turnoBlancas ? "blancas" : "negras") + ".");
    }
    function casilla(caja, f, c, pieza) {
        const d = document.createElement("div");
        d.style.background = (f + c) % 2 === 0 ? "#f0d9b5" : "#b58863";
        d.className = "flex items-center justify-center";
        if (pieza && window.ChessPieceSVG) {
            d.innerHTML = ChessPieceSVG.markup(pieza.toLowerCase(), pieza === pieza.toUpperCase() ? "w" : "b");
            const svg = d.firstElementChild;
            if (svg) { svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%"); svg.setAttribute("aria-hidden", "true"); }
        }
        caja.appendChild(d);
    }

    function pintarMarcador() {
        const caja = $("marcador");
        caja.replaceChildren();
        juego.equipos.forEach((e, i) => {
            const s = document.createElement("span");
            const turno = i === juego.turno;
            s.className = "rounded-xl px-4 py-2 font-semibold " + (turno ? "bg-accent-500 text-brand-900" : "bg-white dark:bg-brand-900 text-brand-800 dark:text-white");
            s.textContent = e.nombre + ": " + e.puntos + " pts" + (turno ? " · le toca" : "");
            caja.appendChild(s);
        });
    }

    function pintarRonda() {
        const r = juego.ronda;
        pintarMarcador();
        pintarTablero(r.fen);
        $("ronda-donde").textContent = "Posición " + (juego.jugadas + 1) + " de " + rondas + " · " + r.apertura.nombre;
        $("ronda-titulo").textContent = "¿Qué jugaron los maestros? Juegan " + (r.turnoBlancas ? "blancas" : "negras") + ".";
        $("linea").textContent = r.linea ? "Después de " + r.linea : "La posición inicial";
        $("fallos").textContent = r.fallos ? "Fallos: " + "✗ ".repeat(r.fallos).trim() + " (" + r.fallos + " de " + M.FALLOS + ")" : "";
        const ol = $("respuestas");
        ol.replaceChildren();
        r.respuestas.forEach((x, i) => {
            const li = document.createElement("li");
            const vista = r.reveladas.includes(i);
            li.className = "flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-lg font-semibold " + (vista ? "bg-accent-50 dark:bg-brand-800 text-brand-800 dark:text-white" : "bg-brand-800 text-white");
            li.dataset.respuesta = String(i);
            const a = document.createElement("span");
            a.textContent = (i + 1) + ". " + (vista ? M.sanEs(x.san) : "?");
            const b = document.createElement("span");
            b.className = "tabular-nums";
            b.textContent = vista ? x.pct + " de cada 100" : "";
            li.append(a, b);
            ol.appendChild(li);
        });
    }

    function probar() {
        const campo = $("adivinar-texto");
        const texto = campo.value;
        if (!texto.trim() || !juego.ronda) return;
        const equipo = juego.equipos[juego.turno].nombre;
        const r = M.adivinar(juego, texto);
        campo.value = "";
        if (r.tipo === "acierto") {
            anunciar("¡Sí! " + M.sanEs(juego.ronda.respuestas[r.indice].san) + ": " + r.puntos + " de cada 100. " + equipo + " suma " + r.puntos + ".");
        } else if (r.tipo === "repetida") {
            anunciar("Esa ya salió.");
        } else if (r.tipo === "fallo") {
            anunciar("No está. Fallo " + r.fallos + " de " + M.FALLOS + ".");
        } else if (r.tipo === "pasa") {
            anunciar("Tercer fallo: el turno pasa a " + juego.equipos[r.a].nombre + ".");
        }
        pintarRonda();
        if (juego.ronda.reveladas.length === juego.ronda.respuestas.length) mostrarTodas();
        else campo.focus();
    }

    function mostrarTodas() {
        M.cerrarRonda(juego);
        pintarRonda();
        ver("adivinar", false);
        ver("mostrar-todas", false);
        ver("siguiente", true);
        $("siguiente").focus();
    }

    async function terminar(sinPreguntar) {
        if (sinPreguntar !== true && juego && juego.jugadas < rondas
            && !(await Avisos.confirmar("Quedan posiciones sin jugar.", { titulo: "¿Terminar el juego ahora?", aceptar: "Terminar y ver el podio" }))) return;
        ver("juego", false);
        ver("podio", true);
        const ol = $("podio-lista");
        ol.replaceChildren();
        const MEDALLA = { 1: "🥇", 2: "🥈", 3: "🥉" };
        M.podio(juego.equipos).forEach((e) => {
            const li = document.createElement("li");
            li.className = "flex items-center justify-between gap-3 rounded-xl px-4 py-3 " + (e.puesto === 1 ? "bg-accent-500 text-brand-900" : "bg-brand-50 dark:bg-brand-800");
            const n = document.createElement("span");
            n.className = "font-semibold text-lg";
            const m = document.createElement("span");
            m.setAttribute("aria-hidden", "true");
            m.textContent = (MEDALLA[e.puesto] || "") + " ";
            n.append(m, document.createTextNode(e.puesto + ".º " + e.nombre));
            const p = document.createElement("span");
            p.className = "font-bold tabular-nums text-lg";
            p.textContent = e.puntos + " pts";
            li.append(n, p);
            ol.appendChild(li);
        });
        $("podio-titulo").focus();
    }

    init();
})();

/*! rev bfb5bbb0d2d82f9f */
