/* «Todas las mesas»: lo que se abre al tocar el pizote de la página del árbitro (centroamericano-arbitro.html).

   Un atleta le pregunta al árbitro dónde se sienta (a veces de otra categoría u otra ronda): el árbitro toca el
   animalito y ve los emparejamientos de la ronda abierta de CADA categoría del torneo, elige la categoría y busca
   por nombre o por número de mesa. También puede buscar en todas las categorías a la vez cuando el atleta no sabe
   en cuál juega.

   Esta página no lee chess-results: se lo pide a la Edge Function centroamericano-mesa (acción «emparejamientos»),
   que usa la misma lectura compartida de los árbitros y solo trae los nombres y la mesa, sin resultados. Todo texto
   que viene de chess-results va por textContent. Ver «Todas las mesas desde el pizote» en
   docs/decisiones/juegos-y-torneos.md. */
(function (global) {
    "use strict";

    // «María José» y «maria jose» son lo mismo para buscar.
    const normalizar = (t) => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

    // Las mesas que responden a lo escrito: un número es una mesa (la 5, no la 15); las palabras tienen que estar todas
    // en el nombre de las blancas o de las negras, en cualquier orden («Pérez Ana» encuentra «Pérez, Ana María»).
    function filtrar(mesas, texto) {
        const q = normalizar(texto).replace(/[,.;]/g, " ").replace(/\s+/g, " ").trim();
        if (!q) return mesas.slice();
        if (/^\d+$/.test(q)) return mesas.filter((m) => m.mesa === Number(q));
        const palabras = q.split(" ");
        return mesas.filter((m) => {
            const jugadores = normalizar(m.blancas + " " + m.negras).replace(/[,.;]/g, " ");
            return palabras.every((p) => jugadores.includes(p));
        });
    }

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

    const VIGENCIA_MS = 30000; // una categoría ya leída se reutiliza medio minuto antes de volver a pedirla

    /* `pedir(cuerpo)` manda un pedido a la función y devuelve su respuesta (o lanza un Error con el mensaje).
       `ahora()` es solo para las pruebas. */
    function abrir({ pedir, ahora = () => Date.now() }) {
        const previo = document.getElementById("todas-las-mesas");
        if (previo) previo.remove();

        let categorias = [];
        let actual = null;       // el tnr que se está viendo
        let tuyo = null;         // el torneo de este árbitro
        let modoTodas = false;   // buscando en todas las categorías
        const leidas = new Map(); // tnr → { cuando, datos }
        let secuencia = 0;       // descarta respuestas de una pantalla que ya cambió

        const dialogo = el("dialog", { id: "todas-las-mesas", class: "cam-todas", "aria-labelledby": "tlm-titulo" });
        const cerrar = el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "cerrar-todas" }, "Cerrar");
        const chips = el("div", { class: "cam-todas-chips", role: "group", "aria-label": "Categorías" });
        const campo = el("input", { id: "tlm-buscar", type: "search", class: "cam-campo", autocomplete: "off", placeholder: "Nombre del atleta o número de mesa", "aria-describedby": "tlm-estado" });
        const todas = el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "buscar-todas", "aria-pressed": "false" }, "Buscar en todas las categorías");
        const estadoP = el("p", { id: "tlm-estado", class: "cam-todas-estado", role: "status" });
        const reintentar = el("button", { type: "button", class: "cam-btn cam-btn-chico", hidden: true }, "Intentar de nuevo");
        const filas = el("tbody", { id: "tlm-filas" });
        const encabezadoCat = el("th", { scope: "col", class: "cam-todas-col-cat", hidden: true }, "Categoría");
        const tabla = el("table", { class: "cam-tabla cam-todas-tabla" },
            el("caption", { class: "sr-only", texto: "Emparejamientos de la ronda abierta" }),
            el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: "Mesa" }), el("th", { scope: "col", texto: "Blancas" }), el("th", { scope: "col", texto: "Negras" }), encabezadoCat)),
            filas);

        dialogo.append(
            el("div", { class: "cam-todas-cabeza" },
                el("h2", { id: "tlm-titulo", class: "font-serif text-xl font-bold", texto: "Todas las mesas" }), cerrar),
            el("p", { class: "text-sm", texto: "Los emparejamientos de la ronda abierta de cada categoría. Toca una categoría y busca el nombre del atleta o su mesa para decirle dónde sentarse." }),
            chips,
            el("div", { class: "cam-todas-buscar" }, el("label", { for: "tlm-buscar", class: "sr-only", texto: "Buscar atleta o mesa" }), campo, todas),
            estadoP, reintentar,
            el("div", { class: "cam-tabla-envoltura" }, tabla));
        document.body.append(dialogo);

        const decir = (texto, error) => { estadoP.textContent = texto; estadoP.className = "cam-todas-estado" + (error ? " cam-fallo" : ""); };
        const hace = (iso) => { const s = Math.max(0, Math.round((ahora() - new Date(iso).getTime()) / 1000)); return s < 60 ? "hace " + s + " s" : "hace " + Math.round(s / 60) + " min"; };
        const nombreDe = (tnr) => { const c = categorias.find((x) => x.tnr === tnr); return c ? c.nombre : tnr; };

        function pintarChips() {
            chips.replaceChildren(...categorias.map((c) => el("button", {
                type: "button", class: "cam-pestana", "data-tnr": c.tnr, "aria-pressed": String(!modoTodas && c.tnr === actual),
                onclick: () => elegir(c.tnr),
            }, c.nombre + (c.tnr === tuyo ? " (la tuya)" : ""))));
        }

        function pintarFilas(lista) {
            encabezadoCat.hidden = !modoTodas;
            if (!lista.length) { filas.replaceChildren(el("tr", {}, el("td", { colspan: modoTodas ? "4" : "3", class: "cam-todas-vacio", texto: campo.value.trim() ? "Nadie coincide con lo que escribiste." : "Todavía no hay mesas en esta categoría." }))); return; }
            filas.replaceChildren(...lista.map((m) => el("tr", { "data-mesa": String(m.mesa) },
                el("th", { scope: "row", class: "cam-todas-mesa", texto: String(m.mesa) }),
                el("td", { texto: m.blancas }), el("td", { texto: m.negras }),
                modoTodas ? el("td", { class: "cam-todas-col-cat", texto: nombreDe(m.tnr) }) : null)));
        }

        async function traer(tnr) {
            const previa = leidas.get(tnr);
            if (previa && ahora() - previa.cuando < VIGENCIA_MS) return previa.datos;
            const datos = await pedir({ tnr });
            leidas.set(tnr, { cuando: ahora(), datos });
            return datos;
        }

        function repintar() {
            if (modoTodas) return buscarTodas();
            const d = leidas.get(actual) && leidas.get(actual).datos;
            if (!d) return;
            const lista = filtrar(d.mesas, campo.value);
            pintarFilas(lista);
            decir("Ronda " + d.ronda + " · " + (campo.value.trim() ? lista.length + " de " + d.mesas.length : d.mesas.length) + (d.mesas.length === 1 ? " mesa" : " mesas")
                + " · leído " + hace(d.datos.desde) + (d.datos.viejo ? " (chess-results no contestó: son las últimas mesas que hubo)" : ""));
        }

        async function elegir(tnr) {
            modoTodas = false; todas.setAttribute("aria-pressed", "false");
            actual = tnr; reintentar.hidden = true;
            const mia = ++secuencia;
            pintarChips();
            const previa = leidas.get(tnr);
            if (!previa) { filas.replaceChildren(); decir("Leyendo " + nombreDe(tnr) + "…"); }
            try {
                await traer(tnr);
                if (mia !== secuencia) return;
                repintar();
            } catch (e) {
                if (mia !== secuencia) return;
                decir("No se pudo leer " + nombreDe(tnr) + ": " + (e && e.message ? e.message : "intenta de nuevo."), true);
                reintentar.hidden = false;
                reintentar.onclick = () => { leidas.delete(tnr); elegir(tnr); };
            }
        }

        // Todas las categorías, una por una (cada una usa la copia compartida): se van sumando a la tabla.
        async function buscarTodas() {
            const q = campo.value.trim();
            modoTodas = true; todas.setAttribute("aria-pressed", "true");
            const mia = ++secuencia;
            pintarChips();
            if (!q) { filas.replaceChildren(); decir("Escribe el nombre del atleta o su mesa para buscarlo en todas las categorías."); return; }
            const acumulado = []; let faltan = 0;
            for (let i = 0; i < categorias.length; i++) {
                const c = categorias[i];
                decir("Buscando en " + c.nombre + " (" + (i + 1) + " de " + categorias.length + ")…");
                try {
                    const d = await traer(c.tnr);
                    if (mia !== secuencia) return;
                    acumulado.push(...filtrar(d.mesas, q).map((m) => Object.assign({ tnr: c.tnr }, m)));
                    pintarFilas(acumulado);
                } catch (e) { faltan++; }
            }
            if (mia !== secuencia) return;
            decir(acumulado.length + (acumulado.length === 1 ? " resultado" : " resultados") + " en " + (categorias.length - faltan) + " de " + categorias.length + " categorías"
                + (faltan ? " (" + faltan + " no se pudieron leer: toca «Buscar en todas» otra vez)" : "") + ".", faltan > 0);
        }

        let esperaBuscar = null;
        campo.addEventListener("input", () => {
            clearTimeout(esperaBuscar);
            // Buscando en una categoría, filtra al instante; en todas, espera a que termine de escribir.
            if (modoTodas) esperaBuscar = setTimeout(buscarTodas, 450); else repintar();
        });
        todas.addEventListener("click", () => { if (modoTodas) { modoTodas = false; elegir(actual || (categorias[0] && categorias[0].tnr)); } else buscarTodas(); });
        cerrar.addEventListener("click", () => dialogo.close());
        dialogo.addEventListener("close", () => { secuencia++; dialogo.remove(); });

        try { dialogo.showModal(); } catch (e) { dialogo.setAttribute("open", ""); }
        decir("Cargando las categorías…");
        pedir({}).then((d) => {
            categorias = d.categorias || [];
            tuyo = d.actual;
            if (!categorias.length) { decir("No hay categorías cargadas.", true); return; }
            const inicial = categorias.some((c) => c.tnr === d.actual) ? d.actual : categorias[0].tnr;
            elegir(inicial);
        }).catch((e) => {
            decir("No se pudieron cargar las categorías: " + (e && e.message ? e.message : "revisa la conexión."), true);
            reintentar.hidden = false;
            reintentar.onclick = () => { dialogo.remove(); abrir({ pedir, ahora }); };
        });
        return dialogo;
    }

    global.CentroamericanoEmparejamientos = { abrir, filtrar, normalizar };
})(window);
