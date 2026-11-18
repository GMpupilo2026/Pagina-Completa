/* El código de tablero-preguntas.html: un juego de categorías para proyectar
   en la clase.

   Cada columna es un cuestionario (de los del profe o de los listos de la
   Academia) y cada casilla una de sus preguntas, de 100 a 500 puntos. Los
   equipos eligen una casilla, contestan en voz alta y el profe da los puntos.
   Es el formato de los concursos de categorías de la tele, con nombre y
   preguntas nuestros; la idea de tenerlo en la clase salió de Chessgora (ver
   «El tablero de preguntas» en docs/decisiones/clase-en-vivo.md).

   Decisiones que no se ven desde acá:
   - No escribe nada en la base: los equipos no son cuentas y los puntos son
     del juego, no Puntos Ajedrez. Solo LEE `cuestionarios`, con la misma RLS
     de Cuestionarios (los del profe y los listos; los alumnos no ven ninguno,
     porque traen las respuestas).
   - Las preguntas con posición se quedan afuera: el tablero se proyecta sin
     un tablero de ajedrez y una pregunta sobre una posición que no se ve no
     se puede contestar. Ninguna posición se inventa.
   - El juego a medias se guarda en el navegador (localStorage, envuelto en
     try/catch): recargar la página en plena clase no lo borra. Es una
     comodidad de esa computadora, nada más.
   - Lo que escribió una persona (títulos, preguntas, nombres de equipos) va
     siempre por textContent. */

(function (raiz) {
    /* ---------- La parte pura (la prueba verificar-tablero-preguntas.js) ---------- */

    const VALOR = 100;
    const MIN_CATEGORIAS = 2, MAX_CATEGORIAS = 6;

    // Las que se pueden jugar: con texto, al menos dos opciones, una correcta y sin posición.
    function preguntasJugables(c) {
        return ((c && c.preguntas) || []).filter((p) => p && !p.fen
            && String(p.texto || "").trim()
            && Array.isArray(p.opciones) && p.opciones.filter((o) => String(o || "").trim()).length >= 2
            && Number.isInteger(p.correcta) && p.correcta >= 0 && p.correcta < p.opciones.length
            && String(p.opciones[p.correcta] || "").trim());
    }

    // Barajar sin sesgo (Fisher-Yates); `azar` se pasa para poder probarlo.
    function barajar(lista, azar) {
        const a = lista.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor((azar || Math.random)() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /* Arma las columnas: de cada cuestionario, `filas` preguntas al azar, la
       primera de 100 y la última de filas×100. Devuelve {error} si algo no
       alcanza, con el texto para el profe. */
    function armar(cuestionarios, filas, azar) {
        if (!Array.isArray(cuestionarios) || cuestionarios.length < MIN_CATEGORIAS) {
            return { error: "Elige al menos " + MIN_CATEGORIAS + " cuestionarios: cada uno es una categoría." };
        }
        if (cuestionarios.length > MAX_CATEGORIAS) {
            return { error: "Son " + MAX_CATEGORIAS + " categorías como máximo: no caben más en la pantalla." };
        }
        const cortos = cuestionarios.filter((c) => preguntasJugables(c).length < filas);
        if (cortos.length) {
            return { error: "«" + cortos[0].titulo + "» tiene " + preguntasJugables(cortos[0]).length
                + " preguntas sin posición, y hacen falta " + filas + "." };
        }
        return {
            categorias: cuestionarios.map((c) => ({
                titulo: String(c.titulo || "Sin título"),
                casillas: barajar(preguntasJugables(c), azar).slice(0, filas).map((p, i) => ({
                    valor: (i + 1) * VALOR,
                    texto: String(p.texto).trim(),
                    opciones: p.opciones.map((o) => String(o || "").trim()),
                    correcta: p.correcta,
                    tiempo: Number(p.tiempo) > 0 ? Number(p.tiempo) : 30,
                    usada: false,
                })),
            })),
        };
    }

    // El podio: de más a menos, con empates en el mismo puesto (1, 1, 3).
    function podio(equipos) {
        const orden = equipos.map((e, i) => ({ nombre: e.nombre, puntos: e.puntos, i }))
            .sort((a, b) => b.puntos - a.puntos || a.i - b.i);
        let puesto = 0;
        return orden.map((e, k) => {
            if (k === 0 || e.puntos !== orden[k - 1].puntos) puesto = k + 1;
            return { puesto, nombre: e.nombre, puntos: e.puntos };
        });
    }

    const quedan = (juego) => juego.categorias.reduce((n, c) => n + c.casillas.filter((x) => !x.usada).length, 0);

    raiz.TableroPreguntas = { VALOR, MIN_CATEGORIAS, MAX_CATEGORIAS, preguntasJugables, barajar, armar, podio, quedan };
    if (typeof module !== "undefined" && module.exports) module.exports = raiz.TableroPreguntas;
})(typeof window !== "undefined" ? window : globalThis);

if (typeof document !== "undefined") (function () {
    const TP = window.TableroPreguntas;
    const $ = (id) => document.getElementById(id);
    const GUARDADO = "tablero_preguntas_v1";
    const LETRAS = ["A", "B", "C", "D", "E", "F"];

    let cuestionarios = [];
    let juego = null;        // {categorias, equipos:[{nombre,puntos}], restar, historial:[{equipo, cambio}]}
    let abierta = null;      // {c, f} de la casilla que se está contestando
    let reloj = null;

    function guardar() {
        try { if (juego) localStorage.setItem(GUARDADO, JSON.stringify(juego)); else localStorage.removeItem(GUARDADO); } catch (e) {}
    }
    function leerGuardado() {
        try {
            const j = JSON.parse(localStorage.getItem(GUARDADO) || "null");
            return j && Array.isArray(j.categorias) && Array.isArray(j.equipos) ? j : null;
        } catch (e) { return null; }
    }
    function anunciar(texto) {
        const a = $("anuncio");
        a.textContent = "";
        setTimeout(() => { a.textContent = texto; }, 50);
    }
    const ver = (id, si) => $(id).classList.toggle("hidden", !si);

    async function init() {
        const { data } = await sb.auth.getSession();
        if (!data.session) { location.href = "login.html?next=tablero-preguntas.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("role, is_admin").eq("id", data.session.user.id).single();
        $("loading").classList.add("hidden");
        $("app").classList.remove("hidden");
        if (!perfil || !(perfil.role === "profesor" || perfil.is_admin === true)) { ver("sin-permiso", true); return; }

        const { data: lista, error } = await sb.from("cuestionarios").select("id, titulo, nivel, listo, preguntas")
            .order("titulo").range(0, 299);
        if (error) { $("armar-estado").textContent = "No se pudieron traer los cuestionarios: " + error.message; }
        cuestionarios = (lista || []).filter((c) => TP.preguntasJugables(c).length >= 3);
        pintarArmar();
        ver("armar", true);

        if (leerGuardado()) ver("seguir", true);
        $("seguir").addEventListener("click", () => { juego = leerGuardado(); if (juego) mostrarJuego(); });
        $("empezar").addEventListener("click", empezar);
        $("cuantos-equipos").addEventListener("change", pintarEquipos);
        $("deshacer").addEventListener("click", deshacer);
        $("terminar").addEventListener("click", terminar);
        $("mostrar").addEventListener("click", mostrarRespuesta);
        $("otro").addEventListener("click", () => { juego = null; guardar(); ver("podio", false); ver("seguir", false); ver("armar", true); $("armar-titulo").scrollIntoView({ block: "start" }); });
    }

    /* ---------- Armar ---------- */
    function pintarArmar() {
        const caja = $("lista-cuestionarios");
        caja.innerHTML = "";
        ver("sin-cuestionarios", !cuestionarios.length);
        const grupos = [
            { nombre: "Tus cuestionarios", lista: cuestionarios.filter((c) => !c.listo) },
            { nombre: "Listos de la Academia", lista: cuestionarios.filter((c) => c.listo) },
        ];
        grupos.forEach((g) => {
            if (!g.lista.length) return;
            const div = document.createElement("div");
            const h = document.createElement("p");
            h.className = "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1";
            h.textContent = g.nombre;
            div.appendChild(h);
            g.lista.forEach((c) => {
                const label = document.createElement("label");
                label.className = "flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-white dark:hover:bg-brand-900 cursor-pointer";
                const input = document.createElement("input");
                input.type = "checkbox";
                input.value = c.id;
                input.className = "rounded border-brand-300 text-accent-500 focus:ring-accent-400 categoria-check";
                const t = document.createElement("span");
                t.textContent = c.titulo + " (" + TP.preguntasJugables(c).length + ")";
                label.append(input, t);
                div.appendChild(label);
            });
            caja.appendChild(div);
        });
        pintarEquipos();
    }

    function pintarEquipos() {
        const n = parseInt($("cuantos-equipos").value, 10) || 2;
        const caja = $("nombres-equipos");
        const antes = [...caja.querySelectorAll("input")].map((i) => i.value);
        caja.innerHTML = "";
        for (let i = 0; i < n; i++) {
            const id = "equipo-" + i;
            const div = document.createElement("div");
            const label = document.createElement("label");
            label.htmlFor = id;
            label.className = "block text-xs font-semibold text-brand-500 dark:text-brand-300 mb-1";
            label.textContent = "Nombre del equipo " + (i + 1);
            const input = document.createElement("input");
            input.id = id;
            input.type = "text";
            input.maxLength = 30;
            input.value = antes[i] != null ? antes[i] : "Equipo " + (i + 1);
            input.className = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 nombre-equipo";
            div.append(label, input);
            caja.appendChild(div);
        }
    }

    function empezar() {
        const ids = [...document.querySelectorAll(".categoria-check:checked")].map((c) => c.value);
        const elegidos = ids.map((id) => cuestionarios.find((c) => c.id === id)).filter(Boolean);
        const armado = TP.armar(elegidos, parseInt($("filas").value, 10) || 5);
        if (armado.error) { $("armar-estado").textContent = armado.error; return; }
        const equipos = [...document.querySelectorAll(".nombre-equipo")].map((i, k) => ({
            nombre: i.value.trim() || "Equipo " + (k + 1), puntos: 0,
        }));
        juego = { categorias: armado.categorias, equipos, restar: $("restar").checked, historial: [] };
        guardar();
        $("armar-estado").textContent = "";
        mostrarJuego();
    }

    /* ---------- El tablero ---------- */
    function mostrarJuego() {
        ver("armar", false);
        ver("podio", false);
        ver("juego", true);
        ver("pregunta", false);
        ver("tablero", true);
        pintarMarcador();
        pintarTablero();
        const primera = $("tablero").querySelector("button[aria-disabled='false']");
        if (primera) primera.focus();
    }

    function pintarMarcador() {
        const caja = $("marcador");
        caja.innerHTML = "";
        juego.equipos.forEach((e) => {
            const div = document.createElement("div");
            div.className = "bg-brand-800 text-white rounded-xl px-4 py-2 min-w-[8rem]";
            const n = document.createElement("p");
            n.className = "text-sm font-semibold";
            n.textContent = e.nombre;
            const p = document.createElement("p");
            p.className = "text-2xl font-bold tabular-nums text-accent-400";
            p.textContent = e.puntos + " pts";
            div.append(n, p);
            caja.appendChild(div);
        });
        $("deshacer").disabled = !juego.historial.length;
        $("deshacer").classList.toggle("opacity-50", !juego.historial.length);
    }

    function pintarTablero() {
        const t = $("tablero");
        t.innerHTML = "";
        t.style.gridTemplateColumns = "repeat(" + juego.categorias.length + ", minmax(0, 1fr))";
        juego.categorias.forEach((c) => {
            const h = document.createElement("div");
            h.className = "bg-brand-900 text-white text-center font-semibold text-sm md:text-base rounded-lg px-2 py-3 flex items-center justify-center min-h-[4rem]";
            h.textContent = c.titulo;
            t.appendChild(h);
        });
        const filas = juego.categorias[0].casillas.length;
        for (let f = 0; f < filas; f++) {
            juego.categorias.forEach((c, ci) => {
                const x = c.casillas[f];
                const b = document.createElement("button");
                b.type = "button";
                b.dataset.c = ci;
                b.dataset.f = f;
                /* Una casilla que ya salió no se puede abrir, pero sigue
                   alcanzándose con Tab y dice que ya salió (aria-disabled,
                   no disabled). El dato va escrito, no solo en el color. */
                b.setAttribute("aria-disabled", x.usada ? "true" : "false");
                b.setAttribute("aria-label", c.titulo + ", " + x.valor + " puntos" + (x.usada ? " (ya salió)" : ""));
                b.className = "rounded-lg min-h-[4.5rem] text-2xl md:text-3xl font-bold tabular-nums transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-400 "
                    + (x.usada ? "bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-300 text-sm md:text-base cursor-default"
                               : "bg-brand-800 hover:bg-brand-700 text-accent-400");
                b.textContent = x.usada ? "Ya salió" : String(x.valor);
                b.addEventListener("click", () => { if (!x.usada) abrir(ci, f); });
                t.appendChild(b);
            });
        }
    }

    /* ---------- Una pregunta ---------- */
    function abrir(ci, f) {
        abierta = { c: ci, f };
        const c = juego.categorias[ci];
        const x = c.casillas[f];
        ver("tablero", false);
        ver("pregunta", true);
        $("pregunta-donde").textContent = c.titulo + " · " + x.valor + " puntos";
        $("pregunta-texto").textContent = x.texto;
        const ol = $("pregunta-opciones");
        ol.innerHTML = "";
        x.opciones.forEach((o, k) => {
            if (!o) return;
            const li = document.createElement("li");
            li.className = "border-2 border-brand-200 dark:border-brand-700 rounded-xl px-4 py-3 text-lg md:text-2xl";
            li.dataset.k = k;
            li.textContent = LETRAS[k] + ". " + o;
            ol.appendChild(li);
        });
        ver("pregunta-antes", true);
        ver("pregunta-despues", false);
        pintarBotonesEquipos();
        empezarReloj(x.tiempo);
        $("pregunta-texto").focus();
        anunciar(c.titulo + " por " + x.valor + " puntos.");
    }

    function empezarReloj(segundos) {
        clearInterval(reloj);
        let quedan = segundos;
        const pintar = () => { $("pregunta-reloj").textContent = quedan > 0 ? "⏱ " + quedan + " s" : "⏱ ¡Tiempo!"; };
        pintar();
        reloj = setInterval(() => {
            quedan -= 1;
            pintar();
            if (quedan <= 0) { clearInterval(reloj); anunciar("Se acabó el tiempo."); }
        }, 1000);
    }

    function boton(texto, clase, alTocar) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "text-sm font-semibold px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " + clase;
        b.textContent = texto;
        b.addEventListener("click", alTocar);
        return b;
    }

    function pintarBotonesEquipos() {
        const x = juego.categorias[abierta.c].casillas[abierta.f];
        const fallos = $("fallos");
        fallos.innerHTML = "";
        if (juego.restar) {
            juego.equipos.forEach((e, i) => fallos.appendChild(boton("Falló " + e.nombre + " (−" + x.valor + ")",
                "bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-800 dark:text-red-200",
                () => sumar(i, -x.valor, false))));
        }
        const aciertos = $("aciertos");
        aciertos.innerHTML = "";
        juego.equipos.forEach((e, i) => aciertos.appendChild(boton("Acertó " + e.nombre + " (+" + x.valor + ")",
            "bg-accent-500 hover:bg-accent-600 text-brand-900", () => sumar(i, x.valor, true))));
        aciertos.appendChild(boton("Nadie acertó", "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200",
            () => cerrar()));
    }

    function mostrarRespuesta() {
        clearInterval(reloj);
        const x = juego.categorias[abierta.c].casillas[abierta.f];
        $("pregunta-opciones").querySelectorAll("li").forEach((li) => {
            const k = Number(li.dataset.k);
            if (k === x.correcta) {
                li.className = "border-4 border-green-600 bg-green-50 dark:bg-green-900/30 rounded-xl px-4 py-3 text-lg md:text-2xl font-bold text-green-900 dark:text-green-100";
                li.textContent = LETRAS[k] + ". " + x.opciones[k] + " ✓ (la correcta)";   // escrita, no solo el color
            } else {
                li.classList.add("opacity-50");
            }
        });
        ver("pregunta-antes", false);
        ver("pregunta-despues", true);
        $("aciertos").querySelector("button").focus();
        anunciar("La correcta es la " + LETRAS[x.correcta] + ": " + x.opciones[x.correcta] + ".");
    }

    function sumar(i, cambio, cierra) {
        juego.equipos[i].puntos += cambio;
        juego.historial.push({ equipo: i, cambio, casilla: cierra ? { c: abierta.c, f: abierta.f } : null });
        anunciar(juego.equipos[i].nombre + (cambio > 0 ? " suma " : " pierde ") + Math.abs(cambio) + ": tiene " + juego.equipos[i].puntos + ".");
        pintarMarcador();
        if (cierra) cerrar(); else guardar();
    }

    function cerrar() {
        clearInterval(reloj);
        const volverA = abierta;
        juego.categorias[abierta.c].casillas[abierta.f].usada = true;
        abierta = null;
        guardar();
        if (!TP.quedan(juego)) { terminar(); return; }
        ver("pregunta", false);
        ver("tablero", true);
        pintarTablero();
        const b = $("tablero").querySelector('button[data-c="' + volverA.c + '"][data-f="' + volverA.f + '"]');
        if (b) b.focus();
    }

    // Deshace el último punto dado; si cerró una casilla, la vuelve a abrir en el tablero.
    function deshacer() {
        const u = juego.historial.pop();
        if (!u) return;
        juego.equipos[u.equipo].puntos -= u.cambio;
        if (u.casilla) juego.categorias[u.casilla.c].casillas[u.casilla.f].usada = false;
        guardar();
        pintarMarcador();
        if (!abierta) pintarTablero();
        anunciar("Se deshizo: " + juego.equipos[u.equipo].nombre + " vuelve a " + juego.equipos[u.equipo].puntos + ".");
    }

    async function terminar() {
        if (TP.quedan(juego) && !(await Avisos.confirmar("Quedan " + TP.quedan(juego) + " casillas sin jugar.",
            { titulo: "¿Terminar el juego ahora?", aceptar: "Terminar y ver el podio" }))) return;
        clearInterval(reloj);
        abierta = null;
        ver("juego", false);
        ver("podio", true);
        const ol = $("podio-lista");
        ol.innerHTML = "";
        const MEDALLA = { 1: "🥇", 2: "🥈", 3: "🥉" };
        TP.podio(juego.equipos).forEach((e) => {
            const li = document.createElement("li");
            li.className = "flex items-center justify-between gap-3 rounded-xl px-4 py-3 " + (e.puesto === 1 ? "bg-accent-500 text-brand-900" : "bg-brand-50 dark:bg-brand-800");
            const n = document.createElement("span");
            n.className = "font-semibold text-lg";
            n.innerHTML = '<span aria-hidden="true">' + (MEDALLA[e.puesto] || "") + " </span>";
            n.appendChild(document.createTextNode(e.puesto + ".º " + e.nombre));
            const p = document.createElement("span");
            p.className = "font-bold tabular-nums text-lg";
            p.textContent = e.puntos + " pts";
            li.append(n, p);
            ol.appendChild(li);
        });
        juego = null;
        guardar();
        $("podio-titulo").focus();
    }

    init();
})();

/*! rev bfb5bbb0d2d82f9f */
