/* «Hablar con el jugador» (Centroamericano 2026, centroamericano-arbitro.html): para el árbitro de mesa que solo habla español cuando
   su jugador habla inglés o francés. Se abre con el botón de la burbuja en la tarjeta de cada mesa y tiene dos pestañas:

   - «Frases»: la lista de frases del arbitraje (js/centroamericano-frases.js) en español. El árbitro toca una y la tablet le muestra al
     jugador la frase en SU idioma, en grande y a pantalla completa (con el original en español abajo, para el árbitro, y «Leer en voz
     alta»). Son textos fijos y revisados: no se traducen al vuelo, así que no pueden decir algo distinto de la regla, y funcionan sin
     internet.
   - «Conversar»: dos mitades frente a frente. Cada uno escribe en su idioma y lee lo del otro en el suyo (la traducción la hace la
     Edge Function centroamericano-traducir; si no hay señal o no está disponible, las frases siguen sirviendo). El jugador también tiene
     botones de respuesta rápida en su idioma, que el árbitro lee en español sin traductor.

   Nada se anota solo: «Anotar en la bitácora» lo toca el árbitro cuando quiere que quede (qué se le dijo, en qué idioma y con el original
   en español; la conversación, con las dos versiones de cada mensaje). Todo texto que escribe una persona o devuelve la traducción va por
   textContent. La traducción es una ayuda, no una traducción oficial, y lo dice en los dos idiomas.

     CentroamericanoHablar.abrir({ mesa, jugadores: [{ color, nombre, fed }], traducir(de, a, texto) → Promise<string>,
                                   anotar(texto, color) → Promise, pedirIdioma(id, nombre) → Promise })

   Ver «Hablar con el jugador» en docs/decisiones/juegos-y-torneos.md. */
(function (global) {
    "use strict";

    const F = () => global.CentroamericanoFrases;

    function el(tag, atributos, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(atributos || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }

    // Lo que dice cada mitad de «Conversar» en el idioma de quien la lee (las dos primeras líneas del jugador).
    const ROTULOS = {
        en: { jugador: "Player", escribe: "Write here in your language", enviar: "Send", rapidas: "Quick answers", aviso: "Automatic translation: an aid, not an official translation.", vacio: "Messages will appear here.", yo: "You", arbitro: "Arbiter" },
        fr: { jugador: "Joueur", escribe: "Écrivez ici dans votre langue", enviar: "Envoyer", rapidas: "Réponses rapides", aviso: "Traduction automatique : une aide, pas une traduction officielle.", vacio: "Les messages apparaîtront ici.", yo: "Vous", arbitro: "Arbitre" },
    };

    const hayVoz = () => typeof global.speechSynthesis !== "undefined" && typeof global.SpeechSynthesisUtterance !== "undefined";
    function leerEnVoz(texto, idioma) {
        if (!hayVoz()) return false;
        try {
            global.speechSynthesis.cancel();
            const u = new global.SpeechSynthesisUtterance(texto);
            const x = F().IDIOMAS.find((i) => i.id === idioma);
            u.lang = x ? x.voz : "en-US";
            u.rate = 0.9;
            global.speechSynthesis.speak(u);
            return true;
        } catch (e) { return false; }
    }

    function abrir(o) {
        const Fr = F();
        for (const id of ["hablar", "hablar-jugador"]) { const previo = document.getElementById(id); if (previo) previo.remove(); }
        const jugadores = (o.jugadores || []).filter((j) => j && j.color);
        let idx = 0, pestana = "frases", frente = true;
        // El idioma sugerido sale del país del jugador; si no hay (o es de habla hispana) se empieza en inglés, que es el que más sirve.
        const sugerido = (j) => { const i = j && j.fed ? Fr.idiomaDeFed(j.fed) : "es"; return i === "es" ? "en" : i; };
        let idioma = sugerido(jugadores[0]);
        const mensajes = [];            // { de: "arbitro" | "jugador", es, otro }
        let traduciendo = false;

        const dialogo = el("dialog", { id: "hablar", class: "cam-dj cam-hb", "aria-labelledby": "hb-titulo" });
        const cerrar = el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "cerrar-hablar", onclick: () => { dialogo.close(); } }, "Cerrar");
        const filaJugador = el("div", { class: "cam-hb-fila", role: "group", "aria-label": "¿A quién le hablas?" });
        const filaIdioma = el("div", { class: "cam-hb-fila", role: "group", "aria-label": "Idioma del jugador" });
        const pestanas = el("div", { class: "cam-pestanas cam-hb-pestanas", role: "tablist" });
        const cuerpo = el("div", { class: "cam-hb-cuerpo" });
        // El aviso va DENTRO del diálogo: una ventana modal tapa los avisos de la página.
        const aviso = el("p", { class: "cam-hb-estado cam-hb-estado-general", role: "status" });
        const decir = (texto, esError) => { aviso.textContent = texto; aviso.dataset.error = esError ? "si" : ""; };
        dialogo.append(
            el("div", { class: "cam-dj-cabeza" }, el("h2", { id: "hb-titulo", class: "font-serif text-xl font-bold" }, el("span", { "aria-hidden": "true", texto: "🗣 " }), "Hablar con el jugador · Mesa " + o.mesa), cerrar),
            filaJugador, filaIdioma, pestanas, aviso, cuerpo);
        document.body.append(dialogo);

        const actual = () => jugadores[idx] || { color: "blancas", nombre: "el jugador", fed: "" };
        const nombreIdioma = (id) => (Fr.IDIOMAS.find((i) => i.id === id) || {}).nombre || id;      // «Français» (como lo lee el jugador)
        const enEspanol = (id) => (Fr.IDIOMAS.find((i) => i.id === id) || {}).enEs || id;           // «francés» (en las frases del árbitro)

        function pintarCabeza() {
            filaJugador.replaceChildren(...jugadores.map((j, i) => {
                const b = el("button", { type: "button", class: "cam-pestana cam-hb-jug", "data-color": j.color, "data-accion": "elegir-jugador", "aria-pressed": String(i === idx), onclick: () => { idx = i; idioma = sugerido(j); pintar(); } },
                    el("span", { class: "cam-color", "data-color": j.color, "aria-hidden": "true" }), el("span", { class: "sr-only", texto: j.color === "blancas" ? "Blancas: " : "Negras: " }), j.nombre || "Jugador",
                    i === idx ? el("span", { "aria-hidden": "true", texto: " ✓" }) : null);
                const bandera = global.CentroamericanoBanderas ? global.CentroamericanoBanderas.de(j.fed) : null;
                if (bandera) b.append(bandera);
                return b;
            }));
            filaIdioma.replaceChildren(el("span", { class: "text-sm font-bold", texto: "Idioma:" }), ...["en", "fr"].map((id) =>
                el("button", { type: "button", class: "cam-pestana cam-hb-idioma", "data-idioma": id, "data-accion": "elegir-idioma", "aria-pressed": String(idioma === id), onclick: () => { idioma = id; pintar(); } },
                    nombreIdioma(id), idioma === id ? el("span", { "aria-hidden": "true", texto: " ✓" }) : null)),
                Fr.idiomaDeFed(actual().fed) !== "es" && actual().fed ? el("span", { class: "text-sm", texto: "(sugerido por su país: " + actual().fed + ")" }) : null,
                o.pedirIdioma ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "pedir-idioma", onclick: async (ev) => {
                    const b = ev.currentTarget; b.disabled = true;
                    try { await o.pedirIdioma(idioma, nombreIdioma(idioma)); decir("✓ El árbitro principal ya sabe que necesitas a alguien que hable " + enEspanol(idioma) + "."); }
                    catch (e) { decir(e.message || "No se pudo avisar.", true); b.disabled = false; }
                } }, "🆘 Necesito un árbitro que hable " + enEspanol(idioma)) : null);
            pestanas.replaceChildren(...[["frases", "Frases"], ["conversar", "Conversar"]].map(([id, t]) =>
                el("button", { type: "button", class: "cam-pestana", role: "tab", "data-pestana": id, "aria-selected": String(pestana === id), onclick: () => { pestana = id; pintar(); } }, t)));
        }

        // ------------------------------------------------------------------------------ Frases
        function pintarFrases() {
            const grupos = Fr.TEMAS.map((t) => {
                const lista = Fr.FRASES.filter((x) => x.tema === t.id);
                if (!lista.length) return null;
                return el("section", { class: "cam-hb-tema", "data-tema": t.id },
                    el("h3", { class: "cam-hb-tema-titulo", texto: t.nombre }),
                    el("div", { class: "cam-hb-frases" }, ...lista.map((f) =>
                        el("button", { type: "button", class: "cam-hb-frase", "data-frase": f.id, onclick: () => mostrarFrase(f) },
                            el("span", { texto: f.es }), f.art ? el("small", { class: "cam-hb-art", texto: "art. " + f.art }) : null))));
            });
            cuerpo.replaceChildren(
                el("p", { class: "text-sm", texto: "Toca una frase: se le muestra al jugador en " + enEspanol(idioma) + ", en grande. Son frases fijas, revisadas: funcionan sin internet." }),
                ...grupos);
        }

        // La pantalla completa para darle la vuelta a la tablet.
        function mostrarFrase(f) {
            const previo = document.getElementById("hablar-jugador"); if (previo) previo.remove();
            const j = actual();
            const texto = f[idioma];
            const p = el("dialog", { id: "hablar-jugador", class: "cam-hb-pantalla", "aria-labelledby": "hbp-texto" });
            const estado = el("p", { class: "cam-hb-estado", role: "status" });
            const cerrarP = () => { if (hayVoz()) { try { global.speechSynthesis.cancel(); } catch (e) { /* nada */ } } p.close(); p.remove(); };
            p.append(
                el("p", { class: "cam-hb-idioma-p", lang: idioma, texto: nombreIdioma(idioma) }),
                el("p", { id: "hbp-texto", class: "cam-hb-grande", lang: idioma, texto }),
                el("p", { class: "cam-hb-original", texto: "Para el árbitro: " + f.es }),
                el("div", { class: "cam-hb-acciones" },
                    hayVoz() ? el("button", { type: "button", class: "cam-hb-boton", "data-accion": "voz", onclick: () => { if (!leerEnVoz(texto, idioma)) estado.textContent = "Este aparato no puede leerla en voz alta."; } }, "🔊 Leer en voz alta") : null,
                    o.anotar ? el("button", { type: "button", class: "cam-hb-boton", "data-accion": "anotar-frase", onclick: async (ev) => {
                        const b = ev.currentTarget; b.disabled = true;
                        try { await o.anotar(Fr.textoComunicado({ jugador: j.nombre, color: j.color, idioma, es: f.es, traducido: texto }), j.color); estado.textContent = "✓ Quedó anotado en la bitácora."; }
                        catch (e) { estado.textContent = e.message || "No se pudo anotar."; b.disabled = false; }
                    } }, "📝 Anotar en la bitácora") : null,
                    el("button", { type: "button", class: "cam-hb-boton cam-hb-listo", "data-accion": "listo", onclick: cerrarP }, "Listo")),
                estado);
            p.addEventListener("cancel", () => { p.remove(); });
            document.body.append(p);
            p.showModal();
            const listo = p.querySelector(".cam-hb-listo"); if (listo) listo.focus();
        }

        // ------------------------------------------------------------------------------ Conversar
        const R = () => ROTULOS[idioma] || ROTULOS.en;

        function lineas(lado) {
            if (!mensajes.length) return [el("p", { class: "cam-hb-vacio", texto: lado === "arbitro" ? "Todavía no hay mensajes." : R().vacio })];
            return mensajes.slice(-5).map((m) => {
                const mio = (lado === "arbitro") === (m.de === "arbitro");
                return el("p", { class: "cam-hb-mensaje", "data-de": m.de, "data-mio": mio ? "si" : "no", lang: lado === "arbitro" ? "es" : idioma },
                    el("small", { class: "cam-hb-quien", texto: lado === "arbitro" ? (m.de === "arbitro" ? "Tú" : "Jugador") : (m.de === "arbitro" ? R().arbitro : R().yo) }),
                    el("span", { texto: lado === "arbitro" ? m.es : m.otro }));
            });
        }

        async function enviar(de, texto) {
            const t = String(texto || "").trim();
            if (!t || traduciendo) return;
            traduciendo = true;
            pintarConversar(true);
            const aviso = cuerpo.querySelector(".cam-hb-error");
            try {
                const origen = de === "arbitro" ? "es" : idioma, destino = de === "arbitro" ? idioma : "es";
                const traducido = await o.traducir(origen, destino, t);
                mensajes.push(de === "arbitro" ? { de, es: t, otro: traducido } : { de, es: traducido, otro: t });
                traduciendo = false;
                pintarConversar(false, true);
            } catch (e) {
                traduciendo = false;
                pintarConversar(false);
                const caja = cuerpo.querySelector(".cam-hb-error");
                if (caja) { caja.hidden = false; caja.textContent = (e && e.message ? e.message : "No se pudo traducir.") + " Usa las frases."; }
                else if (aviso) aviso.textContent = "No se pudo traducir.";
            }
        }

        function lado(clase, lang, hijos) { return el("section", { class: "cam-hb-lado " + clase, lang }, ...hijos); }

        let borradorA = "", borradorJ = "";
        function pintarConversar(ocupado, limpiar) {
            if (limpiar) { borradorA = ""; borradorJ = ""; }
            const r = R();
            const campoA = el("textarea", { id: "hb-arbitro", class: "cam-campo cam-hb-campo", rows: "2", maxlength: "500", "aria-label": "Tu mensaje, en español", placeholder: "Escribe en español…", oninput: (e) => { borradorA = e.target.value; } });
            campoA.value = borradorA;
            const campoJ = el("textarea", { id: "hb-jugador", class: "cam-campo cam-hb-campo", rows: "2", maxlength: "500", lang: idioma, "aria-label": r.escribe, placeholder: r.escribe + "…", oninput: (e) => { borradorJ = e.target.value; } });
            campoJ.value = borradorJ;
            const botonA = el("button", { type: "button", class: "cam-btn", "data-accion": "enviar-arbitro", disabled: !!ocupado, onclick: () => enviar("arbitro", campoA.value) }, ocupado ? "Traduciendo…" : "Traducir y enviar");
            const botonJ = el("button", { type: "button", class: "cam-btn", "data-accion": "enviar-jugador", lang: idioma, disabled: !!ocupado, onclick: () => enviar("jugador", campoJ.value) }, r.enviar);
            const rapidas = el("div", { class: "cam-hb-rapidas", role: "group", "aria-label": r.rapidas, lang: idioma },
                ...Fr.DEL_JUGADOR.map((x) => el("button", { type: "button", class: "cam-hb-rapida", "data-rapida": x.id, lang: idioma, onclick: () => { mensajes.push({ de: "jugador", es: x.es, otro: x[idioma] }); pintarConversar(false, false); } }, x[idioma])));
            const anotarConv = o.anotar ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "anotar-conversacion", disabled: !mensajes.length, onclick: async (ev) => {
                const b = ev.currentTarget; b.disabled = true;
                const j = actual();
                const texto = ("Conversación con " + (j.nombre || "el jugador") + " (" + j.color + ") en " + enEspanol(idioma) + " (traducción de ayuda): "
                    + mensajes.map((m) => (m.de === "arbitro" ? "Árbitro: «" + m.es + "» (" + idioma.toUpperCase() + ": «" + m.otro + "»)" : "Jugador: «" + m.otro + "» (ES: «" + m.es + "»)")).join(" · ")).slice(0, 2000);
                try { await o.anotar(texto, j.color); decir("✓ La conversación quedó anotada en la bitácora."); }
                catch (e) { decir(e.message || "No se pudo anotar.", true); b.disabled = false; }
            } }, "📝 Anotar la conversación en la bitácora") : null;
            const mitadJugador = lado("cam-hb-jugador" + (frente ? " cam-hb-girado" : ""), idioma, [
                el("p", { class: "cam-hb-lado-titulo", texto: r.jugador + " · " + nombreIdioma(idioma) }),
                el("div", { class: "cam-hb-mensajes", "aria-live": "polite" }, ...lineas("jugador")),
                rapidas, campoJ, botonJ, el("p", { class: "cam-hb-aviso", texto: r.aviso })]);
            const mitadArbitro = lado("cam-hb-arbitro", "es", [
                el("p", { class: "cam-hb-lado-titulo", texto: "Árbitro · Español" }),
                el("div", { class: "cam-hb-mensajes", "aria-live": "polite" }, ...lineas("arbitro")),
                el("p", { class: "cam-hb-error", role: "alert", hidden: true }),
                campoA, botonA,
                el("p", { class: "cam-hb-aviso", texto: "Traducción automática: una ayuda, no una traducción oficial. Las frases fijas son las oficiales." }),
                el("div", { class: "cam-hb-acciones-chicas" },
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "girar", "aria-pressed": String(frente), onclick: () => { frente = !frente; pintarConversar(false); } }, frente ? "Mitades frente a frente ✓" : "Mitades en el mismo sentido"),
                    anotarConv)]);
            cuerpo.replaceChildren(el("div", { class: "cam-hb-conversar" }, mitadJugador, mitadArbitro));
        }

        function pintar() {
            pintarCabeza();
            if (pestana === "frases") pintarFrases(); else pintarConversar(false);
        }

        dialogo.addEventListener("close", () => { if (hayVoz()) { try { global.speechSynthesis.cancel(); } catch (e) { /* nada */ } } const p = document.getElementById("hablar-jugador"); if (p) p.remove(); dialogo.remove(); });
        pintar();
        dialogo.showModal();
        return dialogo;
    }

    global.CentroamericanoHablar = { abrir };
})(window);
