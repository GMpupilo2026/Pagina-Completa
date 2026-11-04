/* «Mis pareos»: lo que abren el logo de Ajedrez Integral y la «Ronda abierta» de la página del árbitro (centroamericano-arbitro.html).

   Muestra los pareos de SUS mesas —las de su enlace y las de sus otros enlaces, nada de las demás mesas ni categorías— de TODAS las rondas,
   con el resultado: se elige la ronda (1, 2, 3…; las que todavía no se emparejan no se pueden elegir) y salen, por torneo, las mesas con
   quién juega con blancas, con negras y cómo terminó. Sirve para recordar o ayudar a un atleta con una ronda anterior sin salirse de la
   página. Se pone al día sola cada 30 s mientras está abierta (la ronda abierta sale de la copia compartida de chess-results; las anteriores,
   de lo que guarda el sorteo de Fair Play).

   Lo pide a la Edge Function centroamericano-mesa (acción «mis_pareos»), que solo contesta lo de SUS mesas. Todo texto que viene de
   chess-results va por textContent. Ver «Mis pareos» en docs/decisiones/juegos-y-torneos.md. */
(function (global) {
    "use strict";

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

    const REFRESCO_MS = 30000;

    // Las rondas que hay en algún torneo suyo (1 hasta la más alta emparejada), en orden.
    function rondasDe(torneos) {
        const maxima = Math.max(0, ...(torneos || []).map((t) => Math.max(t.abierta || 0, ...(t.rondas || []).map((r) => r.ronda))));
        return Array.from({ length: maxima }, (_, i) => i + 1);
    }
    // Lo que un torneo tiene en una ronda: sus mesas y si es la abierta (en vivo), o null si todavía no hay nada.
    const deRonda = (t, n) => (t.rondas || []).find((r) => r.ronda === n) || null;

    let ultima = null;   // { datos, cuando }: vale para todas las veces que se abra
    let trayendo = null;
    async function traer(pedir, ahora = () => Date.now()) {
        if (trayendo) return trayendo;
        trayendo = (async () => {
            try { const d = await pedir({}); ultima = { datos: d, cuando: ahora() }; return ultima; }
            finally { trayendo = null; }
        })();
        return trayendo;
    }

    /* `pedir(cuerpo)` manda el pedido a la función y devuelve su respuesta (o lanza un Error con el mensaje). `ronda` es la que se muestra al
       abrir (la abierta). `ahora()` es solo para las pruebas. */
    function abrir({ pedir, ronda, ahora = () => Date.now() }) {
        const previo = document.getElementById("mis-pareos"); if (previo) previo.remove();
        let elegida = ronda || 0, reloj = null, sinSenal = false;

        const dialogo = el("dialog", { id: "mis-pareos", class: "cam-dj cam-mp", "aria-labelledby": "mp-titulo" });
        const cerrar = el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "cerrar-mp" }, "Cerrar");
        const chips = el("div", { class: "cam-dj-chips", role: "group", "aria-label": "Rondas" });
        const estadoP = el("p", { id: "mp-estado", class: "cam-dj-estado", role: "status" });
        const reintentar = el("button", { type: "button", class: "cam-btn cam-btn-chico", hidden: true }, "Intentar de nuevo");
        const cuerpo = el("div", { class: "cam-mp-cuerpo" });
        dialogo.append(
            el("div", { class: "cam-dj-cabeza" }, el("h2", { id: "mp-titulo", class: "font-serif text-xl font-bold" }, el("span", { "aria-hidden": "true", texto: "🗂 " }), "Mis pareos"), cerrar),
            el("p", { class: "text-sm", texto: "Los pareos de tus mesas, ronda por ronda, con el resultado. Se actualiza solo." }),
            chips, estadoP, reintentar, cuerpo);
        document.body.append(dialogo);

        const decir = (t, error) => { estadoP.textContent = t; estadoP.className = "cam-dj-estado" + (error ? " cam-fallo" : ""); };
        const hace = (t) => { const s = Math.max(0, Math.round((ahora() - t) / 1000)); return s < 60 ? "hace " + s + " s" : "hace " + Math.round(s / 60) + " min"; };

        function pintar() {
            if (!ultima) return;
            const torneos = ultima.datos.torneos || [];
            const rondas = rondasDe(torneos);
            if (!rondas.includes(elegida)) elegida = rondas.length ? rondas[rondas.length - 1] : 0;
            const abierta = Math.max(0, ...torneos.map((t) => t.abierta || 0));
            chips.replaceChildren(...rondas.map((n) => el("button", {
                type: "button", class: "cam-pestana", "data-ronda": String(n), "aria-pressed": String(n === elegida),
                onclick: () => { elegida = n; pintar(); },
            }, "Ronda " + n + (n === abierta ? " · abierta" : ""))));
            const bloques = torneos.map((t) => {
                const r = deRonda(t, elegida);
                const titulo = el("h3", { class: "cam-mp-titulo", texto: t.nombre + " · mesas " + t.desde + " a " + t.hasta });
                if (!r || !r.mesas.length) return el("section", { class: "cam-mp-torneo", "data-tnr": t.tnr }, titulo, el("p", { class: "cam-dj-vacio", texto: "Esta ronda todavía no tiene pareo guardado para tus mesas." }));
                const tabla = el("table", { class: "cam-tabla cam-mp-tabla" },
                    el("caption", { class: "sr-only", texto: "Pareos de " + t.nombre + ", ronda " + elegida }),
                    el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: "Mesa" }), el("th", { scope: "col", texto: "Blancas" }), el("th", { scope: "col", texto: "Negras" }), el("th", { scope: "col", texto: "Resultado" }))),
                    el("tbody", {}, ...r.mesas.map((m) => el("tr", { "data-mesa": String(m.mesa) },
                        el("th", { scope: "row", texto: String(m.mesa) }), el("td", { texto: m.blancas }), el("td", { texto: m.negras }),
                        el("td", { class: "cam-mp-res", "data-vacio": m.resultado ? null : "si", texto: m.resultado || (r.vivo ? "sin resultado" : "—") })))));
                return el("section", { class: "cam-mp-torneo", "data-tnr": t.tnr }, titulo, el("div", { class: "cam-tabla-envoltura" }, tabla));
            });
            cuerpo.replaceChildren(...(bloques.length ? bloques : [el("p", { class: "cam-dj-vacio", texto: "Todavía no hay pareos de tus mesas." })]));
            decir((sinSenal ? "Sin señal: son los pareos de " : "Actualizado ") + hace(ultima.cuando), sinSenal);
        }

        async function actualizar() {
            try { await traer(pedir, ahora); sinSenal = false; reintentar.hidden = true; pintar(); }
            catch (e) {
                if (ultima) { sinSenal = true; pintar(); return; }
                decir("No se pudieron leer los pareos: " + (e && e.message ? e.message : "revisa la conexión."), true);
                reintentar.hidden = false; reintentar.onclick = () => { decir("Leyendo…"); actualizar(); };
            }
        }

        cerrar.addEventListener("click", () => dialogo.close());
        dialogo.addEventListener("close", () => { clearInterval(reloj); dialogo.remove(); });
        try { dialogo.showModal(); } catch (e) { dialogo.setAttribute("open", ""); }
        cerrar.focus();
        pintar();
        if (!ultima) decir("Leyendo tus pareos…");
        actualizar();
        reloj = setInterval(() => { if (!document.hidden) actualizar(); }, REFRESCO_MS);
        return dialogo;
    }

    global.CentroamericanoMisPareos = { abrir, rondasDe, deRonda, estado: () => ultima };
})(window);
