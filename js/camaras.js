/* El código de camaras.html: varias cámaras de una misma computadora, cada
 * una leyendo su tablero a la vez (para un torneo: una cámara por mesa).
 *
 * Cada cuadrito es camara-tablero.html entera, en un iframe con
 * «?compacto=1&puesto=N»: la misma página de siempre, sin repetir nada de
 * su código. Lo de cada cámara (su dispositivo, su mesa, su partida) lo
 * guarda aparte por puesto; el torneo y su código los comparten, y cuando
 * una cámara elige el torneo, las demás lo toman solas. La página de afuera
 * también tiene la cámara permitida en _headers: sin eso, ningún cuadrito
 * podría usarla.
 *
 * Arriba, «Cómo van las cámaras»: cada segundo se le pregunta a cada
 * cuadrito cómo va (`estadoCamara()`, de js/camara-tablero.js; es la misma
 * página web, así que se puede) y se dice con palabras y con color, con
 * «Ir» para llegar a la que necesita ayuda. Si una pasa a necesitar ayuda
 * (una jugada en duda, un aviso de error, la cámara que se cortó), suena.
 *
 * Ver «Varias cámaras en una computadora» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const CANTIDAD = "camaras_cantidad_v1";
    const MAXIMO = 8;

    let cantidad = 2;
    try { cantidad = Math.min(MAXIMO, Math.max(1, Number(localStorage.getItem(CANTIDAD)) || 2)); } catch (e) { /* sin almacenamiento */ }

    /* Agregar o quitar solo toca el último: los cuadritos que ya están no se
     * vuelven a cargar (perderían la cámara abierta y la calibración). */
    function pintar() {
        const caja = $("puestos");
        while (caja.children.length > cantidad) caja.lastElementChild.remove();
        for (let n = caja.children.length + 1; n <= cantidad; n++) {
            const fig = document.createElement("section");
            fig.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-2";
            fig.setAttribute("aria-labelledby", "puesto-titulo-" + n);
            const h = document.createElement("h2");
            h.id = "puesto-titulo-" + n;
            h.className = "font-semibold text-brand-800 dark:text-white px-2 pt-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            h.tabIndex = -1; // «Ir a la cámara N» la lleva acá
            h.textContent = "Cámara " + n;
            const marco = document.createElement("iframe");
            marco.src = "camara-tablero.html?compacto=1&puesto=" + n;
            marco.title = "Cámara " + n;
            marco.setAttribute("allow", "camera");
            marco.dataset.puesto = String(n);
            marco.className = "w-full h-[1500px] border-0 rounded-xl";
            fig.append(h, marco);
            caja.append(fig);
        }
        $("cantidad").textContent = cantidad === 1 ? "1 cámara" : cantidad + " cámaras";
        $("btn-quitar").disabled = cantidad <= 1;
        $("btn-agregar").disabled = cantidad >= MAXIMO;
        try { localStorage.setItem(CANTIDAD, String(cantidad)); } catch (e) { /* sin almacenamiento */ }
    }

    /* ── Cómo van las cámaras ─────────────────────────────────────────── */
    const SONIDO = "camaras_sonido_v1";
    const NIVEL = {
        ayuda: ["Necesita ayuda", "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"],
        "sin-camara": ["Sin cámara", "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100"],
        "sin-calibrar": ["Falta calibrar", "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100"],
        leyendo: ["Leyendo, sin transmitir", "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100"],
        transmitiendo: ["Transmitiendo", "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"],
    };
    const antes = new Map(); // puesto → { nivel, camara }
    let audio = null;
    // El navegador solo deja sonar después de que la persona tocó algo.
    document.addEventListener("pointerdown", () => {
        if (!audio && (window.AudioContext || window.webkitAudioContext)) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sin sonido */ } }
    }, { once: true });
    function sonar() {
        if (!audio || !$("sonido").checked) return;
        try {
            const o = audio.createOscillator(), g = audio.createGain();
            o.frequency.value = 880; g.gain.value = 0.15;
            o.connect(g); g.connect(audio.destination);
            o.start(); o.stop(audio.currentTime + 0.25);
        } catch (e) { /* sin sonido */ }
    }

    function leerEstado(marco) {
        try { return marco.contentWindow && marco.contentWindow.estadoCamara ? marco.contentWindow.estadoCamara() : null; }
        catch (e) { return null; }
    }
    function nivelDe(n, x) {
        const a = antes.get(n) || {};
        if (!x) return { nivel: "sin-camara", detalle: "Cargando…" };
        if (x.dudas) return { nivel: "ayuda", detalle: "Elegir cuál fue la jugada" };
        if (x.error) return { nivel: "ayuda", detalle: x.error };
        if (!x.camara) return a.camara ? { nivel: "ayuda", detalle: "Se cortó la cámara: revisa el cable y toca «Abrir la cámara»" } : { nivel: "sin-camara", detalle: "Toca «Abrir la cámara»" };
        if (!x.calibrada) return { nivel: "sin-calibrar", detalle: "Busca el tablero y calibra" };
        return { nivel: x.transmitiendo ? "transmitiendo" : "leyendo", detalle: x.jugadas + (x.jugadas === 1 ? " jugada" : " jugadas") + (x.resultado ? " · terminó " + (x.resultado === "=" ? "½-½" : x.resultado) : "") };
    }
    function irA(n) {
        const h = document.getElementById("puesto-titulo-" + n);
        if (!h) return;
        h.scrollIntoView({ block: "start" });
        h.focus();
    }
    function revisarEstados() {
        const lista = $("resumen-lista");
        const marcos = [...document.querySelectorAll("#puestos iframe")];
        const cuenta = {};
        for (const marco of marcos) {
            const n = Number(marco.dataset.puesto);
            const x = leerEstado(marco);
            const { nivel, detalle } = nivelDe(n, x);
            const a = antes.get(n) || {};
            if (nivel === "ayuda" && a.nivel !== "ayuda") sonar();
            antes.set(n, { nivel, camara: (x && x.camara) || (a.camara && !x) });
            cuenta[nivel] = (cuenta[nivel] || 0) + 1;
            let fila = lista.querySelector('[data-puesto="' + n + '"]');
            if (!fila) {
                fila = document.createElement("li");
                fila.dataset.puesto = String(n);
                fila.className = "flex flex-wrap items-center gap-2";
                const quien = document.createElement("span"); quien.className = "font-semibold text-brand-800 dark:text-white"; quien.dataset.quien = "";
                const etiqueta = document.createElement("span"); etiqueta.dataset.nivel = "";
                const det = document.createElement("span"); det.className = "text-brand-600 dark:text-brand-300"; det.dataset.detalle = "";
                const ir = document.createElement("button");
                ir.type = "button";
                ir.className = "ml-auto bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-3 py-1 rounded-lg text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                ir.textContent = "Ir a la cámara " + n;
                ir.addEventListener("click", () => irA(n));
                fila.append(quien, etiqueta, det, ir);
                lista.append(fila);
            }
            fila.querySelector("[data-quien]").textContent = "Cámara " + n + (x && x.mesa ? " · mesa " + x.mesa : "");
            const et = fila.querySelector("[data-nivel]");
            et.textContent = NIVEL[nivel][0];
            et.className = "rounded-full px-2 py-0.5 text-xs font-semibold " + NIVEL[nivel][1];
            fila.dataset.estado = nivel;
            fila.querySelector("[data-detalle]").textContent = detalle;
            const tit = document.getElementById("puesto-titulo-" + n);
            if (tit) tit.dataset.estado = nivel;
        }
        // Las filas de los cuadritos que se quitaron.
        for (const fila of [...lista.children]) if (!marcos.some((m) => m.dataset.puesto === fila.dataset.puesto)) { antes.delete(Number(fila.dataset.puesto)); fila.remove(); }
        const partes = [];
        if (cuenta.transmitiendo) partes.push(cuenta.transmitiendo + " transmitiendo");
        if (cuenta.ayuda) partes.push(cuenta.ayuda + (cuenta.ayuda === 1 ? " necesita ayuda" : " necesitan ayuda"));
        if (cuenta.leyendo) partes.push(cuenta.leyendo + " leyendo sin transmitir");
        const resto = (cuenta["sin-camara"] || 0) + (cuenta["sin-calibrar"] || 0);
        if (resto) partes.push(resto + " sin empezar");
        const texto = partes.join(" · ");
        if ($("resumen-cuentas").textContent !== texto) $("resumen-cuentas").textContent = texto;
    }

    $("btn-agregar").addEventListener("click", () => { if (cantidad < MAXIMO) { cantidad++; pintar(); } });
    $("btn-quitar").addEventListener("click", () => { if (cantidad > 1) { cantidad--; pintar(); } });

    async function init() {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) { location.href = "login.html?next=camaras.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
        $("loading").classList.add("hidden");
        if (!perfil || !perfil.is_admin) { $("denegado").classList.remove("hidden"); return; }
        $("app").classList.remove("hidden");
        try { $("sonido").checked = localStorage.getItem(SONIDO) !== "0"; } catch (e) { $("sonido").checked = true; }
        $("sonido").addEventListener("change", () => { try { localStorage.setItem(SONIDO, $("sonido").checked ? "1" : "0"); } catch (e) { /* sin almacenamiento */ } });
        pintar();
        revisarEstados();
        setInterval(revisarEstados, 1000);
    }
    init();
})();
