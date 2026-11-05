/* El candado de las herramientas con licencia que trabajan en el navegador.

   Pareo Integral, Notara, los reclamos de tablas, las bases del torneo, la
   inscripción de los JDE, las páginas de los juegos estudiantiles y la lista
   de árbitros eran gratis y sin cuenta; el dueño del sitio pidió que todas las
   herramientas lleven su licencia (ver «Todas las herramientas llevan
   licencia» en docs/decisiones/juegos-y-torneos.md). Esas páginas hacen todo
   en el navegador: no hay un servidor que pueda negar los datos, así que el
   candado es este, el mismo que ya tenían desempates.html o
   variacion-elo.html: preguntarle a la base tengo_herramienta() y no mostrar
   la herramienta sin licencia.

   Uso: en el <head>, sin defer, con el id de js/herramientas-arbitraje.js:

     <script src="js/candado-herramienta.js" data-herramienta="pareo"></script>

   No cambia el código de la página: tapa #main-content desde antes de que se
   pinte y, en su lugar, dice qué falta (iniciar sesión o la licencia). Con la
   licencia, lo destapa. Quien administra tiene todas (tengo_herramienta()).

   Lo que ve el PÚBLICO de una herramienta sigue abierto (lo decidió el dueño):
   el enlace de solo lectura de Pareo Integral, el del adjunto o el capitán, el
   QR de una mesa de Notara… La página, cuando entra por ahí, llama a
   CandadoHerramienta.liberar() y se ve sin licencia.

   Sin internet: Pareo Integral y Notara se usan sin conexión. La última
   respuesta que dijo que sí se guarda en el aparato, por cuenta y por
   herramienta, y vale VALE_DIAS días mientras la base no conteste; cuando
   contesta, decide ella. */
(function () {
    "use strict";
    if (window.CandadoHerramienta) return;

    const yo = document.currentScript;
    const herramienta = (yo && yo.dataset.herramienta) || "";
    const VALE_DIAS = 7;
    const GUARDADO = "candado_herramienta_v1";

    let estado = "revisando"; // "revisando" | "abierta" | "libre" | "cerrada"
    let avisar = null;
    const listo = new Promise((r) => { avisar = r; });

    const raiz = document.documentElement;
    raiz.classList.add("candado-cerrado");
    const estilo = document.createElement("style");
    estilo.textContent = "html.candado-cerrado #main-content{display:none!important}";
    (document.head || raiz).appendChild(estilo);

    function quitarPanel() {
        const p = document.getElementById("candado-herramienta");
        if (p) p.remove();
    }
    function destapar(como) {
        if (estado === "abierta" || estado === "libre") return;
        estado = como;
        raiz.classList.remove("candado-cerrado");
        quitarPanel();
        avisar(true);
    }

    /* La entrada pública de una herramienta (ver arriba): sin licencia. */
    function liberar() { destapar("libre"); }

    function nombreHerramienta() {
        const H = window.HerramientasArbitraje;
        const h = H && H.porId && H.porId.get(herramienta);
        return h ? (h.corto || h.nombre) : "esta herramienta";
    }
    function temaHerramienta() {
        const H = window.HerramientasArbitraje;
        const h = H && H.porId && H.porId.get(herramienta);
        return h && h.tema ? h.tema : "";
    }

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto) e.textContent = texto;
        return e;
    }
    const BOTON = "inline-flex items-center justify-center rounded-lg px-4 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";

    /* El panel va en el lugar de #main-content. */
    function panel() {
        let p = document.getElementById("candado-herramienta");
        if (p) return p;
        p = el("section", "max-w-2xl mx-auto px-4 sm:px-6 py-12");
        p.id = "candado-herramienta";
        p.setAttribute("aria-live", "polite");
        const main = document.getElementById("main-content");
        if (main && main.parentNode) main.parentNode.insertBefore(p, main);
        else document.body.appendChild(p);
        return p;
    }
    function pintar(titulo, texto, botones) {
        if (estado === "abierta" || estado === "libre") return;
        const p = panel();
        const caja = el("div", "rounded-2xl border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-900 p-6 shadow-sm");
        const h = el("h1", "font-serif text-2xl font-bold text-brand-800 dark:text-white");
        h.append(el("span", "", "🔒 "), document.createTextNode(titulo));
        h.firstChild.setAttribute("aria-hidden", "true");
        caja.append(h, el("p", "mt-3 text-brand-600 dark:text-brand-200", texto));
        if (botones && botones.length) {
            const fila = el("div", "mt-5 flex flex-wrap gap-3");
            for (const b of botones) {
                // Los mismos colores que los botones de la vitrina (herramientas-arbitraje-pagina.js).
                const a = el("a", BOTON + (b.principal
                    ? " bg-accent-500 hover:bg-accent-600 text-brand-900"
                    : " bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 text-brand-800 dark:text-brand-100"), b.texto);
                a.href = b.href;
                fila.append(a);
            }
            caja.append(fila);
        }
        p.replaceChildren(caja);
    }

    function aqui() {
        let p = location.pathname.replace(/^\/+/, "");
        if (!p || /\/$/.test(p)) p += "index.html";
        else if (!/\.html$/.test(p)) p += ".html";
        return p;
    }
    function vitrina() {
        const t = temaHerramienta();
        return "herramientas-arbitraje.html" + (t ? "#" + t : "");
    }

    function leerGuardado() {
        try { return JSON.parse(localStorage.getItem(GUARDADO) || "{}") || {}; } catch (e) { return {}; }
    }
    function guardar(cuenta, si) {
        try {
            const g = leerGuardado();
            const clave = cuenta + "|" + herramienta;
            if (si) g[clave] = Date.now(); else delete g[clave];
            localStorage.setItem(GUARDADO, JSON.stringify(g));
        } catch (e) { /* sin almacenamiento */ }
    }
    function guardadoVigente(cuenta) {
        const t = leerGuardado()[cuenta + "|" + herramienta];
        return typeof t === "number" && Date.now() - t < VALE_DIAS * 24 * 60 * 60 * 1000;
    }

    /* El mismo cargador de js/pareo/ver.js: la librería y el cliente de la
       Academia, solo si la página no los trae. */
    function cargar(src) {
        return new Promise((bien, mal) => {
            const s = document.createElement("script");
            s.src = src;
            s.addEventListener("load", bien);
            s.addEventListener("error", () => mal(new Error("No cargó " + src)));
            document.head.appendChild(s);
        });
    }
    async function cliente() {
        if (window.sb) return window.sb;
        if (!window.supabase) await cargar("js/vendor/supabase.js");
        if (!window.sb) await cargar("js/supabase-client.js");
        return window.sb;
    }

    function sinLicencia() {
        estado = "cerrada";
        const n = nombreHerramienta();
        pintar("Hace falta la licencia",
            "Tu cuenta todavía no tiene la licencia de " + n + ". Las herramientas se usan con una licencia: si ya tienes el código, actívalo en Herramientas; si no, ahí mismo dice cómo pedirlo.",
            [{ texto: "Activar o pedir la licencia", href: vitrina(), principal: true }]);
        avisar(false);
    }

    async function revisar() {
        if (!herramienta) { sinLicencia(); return; }
        // El nombre y el tema de la herramienta, de la misma lista que la vitrina.
        if (!window.HerramientasArbitraje) { try { await cargar("js/herramientas-arbitraje.js"); } catch (e) { /* sin el nombre, «esta herramienta» */ } }
        if (estado !== "revisando") return;
        pintar("Revisando tu licencia…", "Un momento: se revisa que tu cuenta tenga la licencia de " + nombreHerramienta() + ".");
        let sb;
        try { sb = await cliente(); } catch (e) { sb = null; }
        if (estado !== "revisando") return;
        if (!sb || !sb.auth) {
            pintar("No se pudo revisar la licencia", "Revisa la conexión y vuelve a cargar la página.",
                [{ texto: "Volver a cargar", href: location.href, principal: true }]);
            return;
        }
        let sesion = null;
        try { const r = await sb.auth.getSession(); sesion = r && r.data && r.data.session; } catch (e) { sesion = null; }
        if (estado !== "revisando") return;
        if (!sesion) {
            estado = "cerrada";
            pintar("Inicia sesión para usar " + nombreHerramienta(),
                "Esta herramienta se usa con una licencia, que va con tu cuenta. Inicia sesión con la cuenta que tiene la licencia.",
                [{ texto: "Iniciar sesión", href: "login.html?next=" + encodeURIComponent(aqui()), principal: true },
                    { texto: "Ver las herramientas", href: vitrina() }]);
            avisar(false);
            return;
        }
        const cuenta = sesion.user && sesion.user.id || "";
        let r;
        try { r = await sb.rpc("tengo_herramienta", { p_herramienta: herramienta }); } catch (e) { r = { error: e }; }
        if (estado !== "revisando") return;
        if (!r || r.error) {
            // Sin respuesta de la base (sin internet): vale la última que dijo que sí.
            if (guardadoVigente(cuenta)) { destapar("abierta"); return; }
            pintar("No se pudo revisar la licencia", "Revisa la conexión y vuelve a cargar la página. Sin internet, la herramienta se abre solo en un aparato donde ya se usó con tu licencia en los últimos " + VALE_DIAS + " días.",
                [{ texto: "Volver a cargar", href: location.href, principal: true }]);
            return;
        }
        if (r.data === true) { guardar(cuenta, true); destapar("abierta"); return; }
        guardar(cuenta, false);
        sinLicencia();
    }

    window.CandadoHerramienta = {
        herramienta,
        liberar,
        listo,
        get estado() { return estado; },
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", revisar);
    else revisar();
})();
