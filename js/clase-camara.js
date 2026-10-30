/* El código de sesion.html.

   La cámara en la clase en vivo: el profe juega (o muestra) en su tablero de
   verdad, con el celular encima en camara-tablero.html transmitiendo, y cada
   jugada que la cámara anota se juega sola en el tablero de la clase. Entra
   por board.jugar(), la MISMA puerta que el clic del profe: queda en la
   partida de la clase (game_state, la planilla, el PGN, la evaluación) igual
   que si la hubiera hecho a mano.

   - Por el canal de Broadcast de la cámara (el código de 8 letras que da
     «Transmitir en vivo»), como tablero-vivo.html: solo se escucha, nunca se
     le manda nada a la cámara salvo «pedir» la partida al conectarse.
   - Solo se juega lo que ALARGA la partida de la clase: si la cámara tiene
     otra partida (el profe armó otra posición, o la cámara empezó otra), no
     se toca nada y se dice qué hacer.
   - Mientras el profe repasa una jugada vieja o arma una posición, las
     jugadas esperan: entrar ahí sería crear una variante.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js. Ver «La cámara en la clase en vivo»
   en docs/decisiones/clase-en-vivo.md. */

const ClaseCamara = (function () {
    let sb = null, tablero = null, canal = null, partida = null, panel = null, boton = null, espera = null;
    const $ = (id) => document.getElementById(id);

    function cargar(src) {
        if (src === "js/partida-en-vivo.js" && window.PartidaEnVivo) return Promise.resolve();
        return new Promise((ok, mal) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(new Error(src)); document.head.append(s); });
    }

    const es = (san) => (window.ComandosTablero ? window.ComandosTablero.jugadaParaMostrar(san) : san);
    function decir(texto) { const m = $("camara-clase-msg"); if (m) m.textContent = texto; }

    /* Lo que trae la cámara contra lo que tiene la clase: las jugadas que
       faltan (si la de la clase es el principio de la de la cámara), [] si ya
       están, o null si son partidas distintas. */
    function faltan(clase, cam) {
        const inicioClase = clase.startFen ? new Chess(clase.startFen).fen() : new Chess().fen();
        const inicioCam = window.PartidaEnVivo.hasta(cam, 0).fen();
        if (inicioClase.split(" ").slice(0, 4).join(" ") !== inicioCam.split(" ").slice(0, 4).join(" ")) return null;
        const a = clase.game.history(), b = cam.history({ verbose: true });
        if (a.length > b.length) return a.slice(0, b.length).join(" ") === b.map((m) => m.san).join(" ") ? [] : null;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i].san) return null;
        return b.slice(a.length);
    }

    function aplicar() {
        clearTimeout(espera);
        const b = tablero();
        if (!b || !partida) return;
        const lista = faltan(b, partida.juego);
        if (lista === null) {
            decir("La cámara tiene otra partida que la clase. Pon la clase en la misma posición (o en la inicial y calibra la cámara con la inicial) para que sus jugadas entren.");
            return;
        }
        if (!lista.length) { decir("Conectada: la clase está al día con la cámara (" + b.game.history().length + " medias jugadas)."); return; }
        if (b.freeMode || b.isViewingHistory()) {
            decir("La cámara tiene " + lista.length + (lista.length === 1 ? " jugada nueva" : " jugadas nuevas") + ": entran cuando vuelvas a la partida en vivo.");
            espera = setTimeout(aplicar, 1500);
            return;
        }
        for (const m of lista) if (!b.jugar({ from: m.from, to: m.to, promotion: m.promotion })) { decir("Una jugada de la cámara no se pudo jugar en la clase (" + es(m.san) + ")."); return; }
        decir((lista.length === 1 ? "Entró la jugada " + es(lista[0].san) : "Entraron " + lista.length + " jugadas") + " de la cámara.");
    }

    function recibir(p) {
        const V = window.PartidaEnVivo;
        const d = V.leer(p, partida);
        if (!d) return;
        if (d.falta) { canal.send({ type: "broadcast", event: "pedir", payload: {} }); return; }
        if (d.torneo) return; // una cámara de torneo no es la del profe
        partida = d;
        aplicar();
    }

    async function conectar(codigo) {
        try { await cargar("js/partida-en-vivo.js"); } catch (e) { decir("No se pudo cargar lo de la cámara. Revisa la conexión."); return; }
        const V = window.PartidaEnVivo;
        codigo = String(codigo || "").trim().toLowerCase();
        if (!V.codigoValido(codigo)) { decir("Ese código no es de la cámara: son 8 letras y números, como los muestra «Transmitir en vivo»."); return; }
        desconectar(true);
        partida = null;
        canal = sb.channel(V.canal(codigo));
        canal.on("broadcast", { event: "estado" }, (msg) => recibir(msg.payload || {}));
        canal.subscribe((st) => {
            if (st === "SUBSCRIBED") { canal.send({ type: "broadcast", event: "pedir", payload: {} }); decir("Conectada a la cámara " + codigo + ". Esperando su partida…"); }
        });
        try { localStorage.setItem("clase_camara_codigo_v1", codigo); } catch (e) { /* solo esta vez */ }
        pintar();
    }

    function desconectar(callado) {
        clearTimeout(espera);
        if (canal) { try { sb.removeChannel(canal); } catch (e) { /* ya cerrado */ } }
        canal = null; partida = null;
        if (!callado) decir("Desconectada: las jugadas de la cámara ya no entran a la clase.");
        pintar();
    }

    function pintar() {
        if (!panel) return;
        $("camara-clase-conectar").hidden = !!canal;
        $("camara-clase-dejar").hidden = !canal;
        if (boton) boton.setAttribute("aria-pressed", String(!!canal));
    }

    function armarPanel() {
        const clsBoton = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-2 rounded-lg text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        panel = document.createElement("div");
        panel.id = "camara-clase-panel";
        panel.className = "hidden fixed z-40 bg-white dark:bg-brand-900 rounded-xl shadow-2xl p-4 w-[min(92vw,360px)] max-h-[80vh] overflow-y-auto";
        panel.style.top = "88px"; panel.style.right = "16px";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-labelledby", "camara-clase-titulo");
        panel.innerHTML =
            '<div class="flex items-center justify-between gap-2 mb-2">' +
            '<h2 id="camara-clase-titulo" class="font-serif font-bold text-brand-800 dark:text-white text-sm"><span aria-hidden="true">🎥</span> Tu tablero de verdad, con la cámara</h2>' +
            '<button type="button" id="camara-clase-cerrar" class="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-brand-400 hover:text-brand-700 dark:hover:text-brand-200 hover:bg-brand-100 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" aria-label="Cerrar"><span aria-hidden="true">✕</span></button></div>' +
            '<ol class="text-xs text-brand-600 dark:text-brand-300 list-decimal pl-4 space-y-1">' +
            '<li>En tu celular, abre <a href="camara-tablero.html" target="_blank" rel="noopener" class="underline font-semibold">Notara, la cámara que lee el tablero</a>, ponlo encima de tu tablero y calibra con la posición inicial.</li>' +
            '<li>Toca «Transmitir en vivo» y escribe aquí el código de 8 letras que aparece.</li>' +
            '<li>Juega en tu tablero: cada jugada que anote la cámara se juega sola en el tablero de la clase.</li></ol>' +
            '<form id="camara-clase-conectar" class="mt-3 flex gap-2" novalidate>' +
            '<label for="camara-clase-codigo" class="sr-only">Código de la cámara</label>' +
            '<input id="camara-clase-codigo" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="8" placeholder="Código de 8 letras" class="flex-1 min-w-0 bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">' +
            '<button type="submit" class="' + clsBoton + '">Conectar</button></form>' +
            '<button type="button" id="camara-clase-dejar" hidden class="mt-3 bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-3 py-2 rounded-lg text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Desconectar la cámara</button>' +
            '<p id="camara-clase-msg" role="status" aria-live="polite" class="text-xs text-brand-700 dark:text-brand-200 mt-2"></p>';
        document.body.append(panel);
        $("camara-clase-cerrar").addEventListener("click", () => abrir(false));
        $("camara-clase-conectar").addEventListener("submit", (e) => { e.preventDefault(); conectar($("camara-clase-codigo").value); });
        $("camara-clase-dejar").addEventListener("click", () => desconectar(false));
        try { $("camara-clase-codigo").value = localStorage.getItem("clase_camara_codigo_v1") || ""; } catch (e) { /* nada guardado */ }
        pintar();
    }

    function abrir(si) {
        if (!panel) armarPanel();
        panel.classList.toggle("hidden", !si);
        if (boton) boton.setAttribute("aria-expanded", String(si));
        if (si) $("camara-clase-codigo").focus();
    }

    /* opts: { sb, tablero: () => board, boton } */
    function montar(opts) {
        sb = opts.sb; tablero = opts.tablero; boton = opts.boton;
        if (!boton) return;
        boton.hidden = false;
        boton.setAttribute("aria-expanded", "false");
        boton.setAttribute("aria-controls", "camara-clase-panel");
        boton.addEventListener("click", () => abrir(!panel || panel.classList.contains("hidden")));
    }

    return { montar, faltan };
})();
window.ClaseCamara = ClaseCamara;
