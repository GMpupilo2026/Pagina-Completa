/* «¿Dónde juega?»: la lupa de la página del árbitro (centroamericano-arbitro.html) y el pizote de la portada.

   Un atleta le pregunta al árbitro dónde se sienta (a veces de otra categoría): el árbitro toca «🔎 ¿Dónde juega?», escribe el
   apellido o el nombre y salen, de TODAS las categorías a la vez, las tarjetas con la mesa en grande, el color, el rival y la hora.
   Una tarjeta se puede mostrar al atleta a pantalla completa («Mostrar al atleta»): la mesa gigante y el color de su categoría,
   para darle vuelta a la tablet y que el niño no tenga que leer nada más.

   Es rápido porque la función (acción «todas_mesas») manda todas las categorías en UNA respuesta, sacada de la copia compartida de
   chess-results, y esta página la guarda en memoria: se pide al cargar la página (`precargar`), al abrir la lupa y cada 30 s
   mientras está abierta. La búsqueda perdona tildes, mayúsculas, comas, el orden de las palabras y un error de tecleo.
   Todo texto que viene de chess-results va por textContent. Ver «¿Dónde juega?» en docs/decisiones/juegos-y-torneos.md. */
(function (global) {
    "use strict";

    // «María José» y «maria jose» son lo mismo para buscar.
    const normalizar = (t) => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const limpiar = (t) => normalizar(t).replace(/[,.;]/g, " ").replace(/\s+/g, " ").trim();
    const palabras = (s) => limpiar(s).split(" ").filter(Boolean);

    // ¿A lo más un error de tecleo? (una letra de más, de menos, distinta o dos cambiadas de lugar: «moraa», «mra», «mira», «mroa» por «mora»)
    function aUnaLetra(a, b) {
        if (Math.abs(a.length - b.length) > 1) return false;
        let i = 0, j = 0, fallos = 0;
        while (i < a.length && j < b.length) {
            if (a[i] === b[j]) { i++; j++; continue; }
            if (++fallos > 1) return false;
            if (a.length === b.length) {
                if (a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; } else { i++; j++; }   // dos letras cambiadas de lugar: «mroa» por «mora»
            } else if (a.length > b.length) i++; else j++;
        }
        return fallos + (a.length - i) + (b.length - j) <= 1;
    }

    // El color de cada categoría (blanco encima da 4,5:1 o más con todos): los mismos en la tarjeta y en la pantalla completa.
    const PALETA = { "Sub-6": "#7a4a00", "Sub-8": "#1f774c", "Sub-10": "#1e4c8a", "Sub-12": "#8f5200", "Sub-14": "#7b2d8e", "Sub-16": "#ce1328", "Sub-18": "#40478f", "Sub-20": "#00695c" };
    const RESPALDO = ["#40478f", "#1f774c", "#1e4c8a", "#7b2d8e", "#8f5200", "#00695c"];
    function colorDe(categoria) {
        const k = String(categoria || "").trim();
        if (PALETA[k]) return PALETA[k];
        let h = 0;
        for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return RESPALDO[h % RESPALDO.length];
    }

    // Una fila por jugador: «dónde juega» se contesta por jugador, no por mesa.
    function filasDe(categorias) {
        const out = [];
        (categorias || []).forEach((c, orden) => {
            for (const m of c.mesas || []) {
                out.push({ tnr: c.tnr, cat: c.nombre, categoria: c.categoria, orden, ronda: c.ronda, mesa: m.mesa, color: "Blancas", nombre: m.blancas, rival: m.negras });
                out.push({ tnr: c.tnr, cat: c.nombre, categoria: c.categoria, orden, ronda: c.ronda, mesa: m.mesa, color: "Negras", nombre: m.negras, rival: m.blancas });
            }
        });
        return out;
    }

    // Las filas que responden a lo escrito. Un número es una mesa (la 5, no la 15). Cada palabra tiene que estar en el nombre del jugador
    // (entera, al principio o adentro: «mor» encuentra «Mora»); primero salen las coincidencias más exactas. Si no hay ninguna, se perdona un error de tecleo.
    function buscar(filas, texto) {
        const q = limpiar(texto);
        if (!q) return [];
        if (/^\d+$/.test(q)) return filas.filter((f) => f.mesa === Number(q)).sort((a, b) => a.orden - b.orden || a.mesa - b.mesa);
        const toks = q.split(" ");
        const puntuar = (f, tolerante) => {
            const ws = palabras(f.nombre);
            let total = 0;
            for (const t of toks) {
                let mejor = -1;
                for (const w of ws) {
                    let s = -1;
                    if (w === t) s = 3;
                    else if (w.startsWith(t)) s = 2;
                    else if (t.length >= 3 && w.includes(t)) s = 1;
                    else if (tolerante && t.length >= 4 && aUnaLetra(w, t)) s = 0.5;
                    if (s > mejor) mejor = s;
                }
                if (mejor < 0) return -1;
                total += mejor;
            }
            return total;
        };
        let r = filas.map((f) => [f, puntuar(f, false)]).filter((x) => x[1] >= 0);
        if (!r.length) r = filas.map((f) => [f, puntuar(f, true)]).filter((x) => x[1] >= 0);
        r.sort((a, b) => b[1] - a[1] || a[0].orden - b[0].orden || a[0].mesa - b[0].mesa || (a[0].color < b[0].color ? -1 : 1));
        return r.map((x) => x[0]);
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

    const MAX_TARJETAS = 40;
    const REFRESCO_MS = 30000;
    const CLAVE_ULTIMA = "cam-ultima-busqueda";
    const leerUltima = () => { try { return sessionStorage.getItem(CLAVE_ULTIMA) || ""; } catch (e) { return ""; } };
    const guardarUltima = (t) => { try { if (t) sessionStorage.setItem(CLAVE_ULTIMA, t); } catch (e) { /* sin almacenamiento: no pasa nada */ } };

    // Lo último que se leyó (vale para todas las veces que se abra la lupa): así se abre al instante.
    let ultima = null; // { categorias, filas, cuando }
    let trayendo = null;

    async function traer(pedir, ahora = () => Date.now()) {
        if (trayendo) return trayendo;
        trayendo = (async () => {
            try {
                const d = await pedir({});
                ultima = { categorias: d.categorias || [], filas: filasDe(d.categorias), cuando: ahora(), generado: d.generado || null };
                return ultima;
            } finally { trayendo = null; }
        })();
        return trayendo;
    }

    // Se pide una vez al cargar la página, para que la primera vez que se abra la lupa ya esté todo.
    function precargar({ pedir, ahora }) { return traer(pedir, ahora).catch(() => null); }

    /* `pedir(cuerpo)` manda un pedido a la función («todas_mesas») y devuelve su respuesta (o lanza un Error con el mensaje).
       `horaDe(ronda)` dice a qué hora empieza esa ronda (texto) o "". `ahora()` es solo para las pruebas. */
    function abrir({ pedir, horaDe = () => "", ahora = () => Date.now() }) {
        for (const id of ["donde-juega-hoja", "donde-juega-grande"]) { const previo = document.getElementById(id); if (previo) previo.remove(); }

        let chip = "";        // el tnr de la categoría elegida; vacío = todas
        let reloj = null;
        let sinSenal = false;  // la última vez que se pidió no hubo respuesta: se sigue con lo último que se leyó

        const dialogo = el("dialog", { id: "donde-juega-hoja", class: "cam-dj", "aria-labelledby": "dj-titulo" });
        const cerrar = el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "cerrar-dj" }, "Cerrar");
        const campo = el("input", { id: "dj-buscar", type: "search", class: "cam-campo cam-dj-campo", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Escribe el apellido o el nombre…", "aria-describedby": "dj-estado" });
        const chips = el("div", { class: "cam-dj-chips", role: "group", "aria-label": "Categorías" });
        const estadoP = el("p", { id: "dj-estado", class: "cam-dj-estado", role: "status" });
        const reintentar = el("button", { type: "button", class: "cam-btn cam-btn-chico", hidden: true }, "Intentar de nuevo");
        const ultimaBtn = el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", hidden: true, "data-accion": "dj-ultima" });
        const res = el("div", { id: "dj-res", class: "cam-dj-res", role: "list" });

        dialogo.append(
            el("div", { class: "cam-dj-cabeza" }, el("h2", { id: "dj-titulo", class: "font-serif text-xl font-bold" }, el("span", { "aria-hidden": "true", texto: "🔎 " }), "¿Dónde juega?"), cerrar),
            el("label", { for: "dj-buscar", class: "sr-only", texto: "Apellido o nombre del atleta, o número de mesa" }), campo,
            chips, estadoP, el("div", { class: "cam-dj-acciones" }, reintentar, ultimaBtn), res);
        document.body.append(dialogo);

        const decir = (texto, error) => { estadoP.textContent = texto; estadoP.className = "cam-dj-estado" + (error ? " cam-fallo" : ""); };
        const hace = (t) => { const s = Math.max(0, Math.round((ahora() - t) / 1000)); return s < 60 ? "hace " + s + " s" : "hace " + Math.round(s / 60) + " min"; };

        function pintarChips() {
            const cats = ultima ? ultima.categorias : [];
            chips.replaceChildren(...[{ tnr: "", nombre: "Todas" }].concat(cats).map((c) => el("button", {
                type: "button", class: "cam-pestana", "data-tnr": c.tnr, "aria-pressed": String(chip === c.tnr),
                onclick: () => { chip = c.tnr; pintar(); campo.focus(); },
            }, c.nombre)));
        }

        // Cada tarjeta: la mesa en grande, quién es, con qué color, contra quién y a qué hora, y la categoría con su color.
        function tarjeta(f) {
            const hora = horaDe(f.ronda);
            const b = el("button", { type: "button", class: "cam-dj-tarj", role: "listitem", "data-mesa": String(f.mesa), "data-tnr": f.tnr, onclick: () => mostrar(f) });
            b.style.setProperty("--c", colorDe(f.categoria));
            b.append(
                el("span", { class: "cam-dj-num" }, el("small", { texto: "MESA" }), String(f.mesa)),
                el("span", { class: "cam-dj-datos" },
                    el("span", { class: "cam-dj-nombre", texto: f.nombre }),
                    el("span", { class: "cam-dj-sub" }, el("strong", { texto: f.color }), " · contra " + f.rival + " · Ronda " + f.ronda + (hora ? " · " + hora : "")),
                    el("span", { class: "cam-dj-cat", texto: f.cat })),
                el("span", { class: "cam-dj-mostrar", texto: "Mostrar al atleta" }));
            return b;
        }

        // Sin escribir nada y con una categoría elegida: todas sus mesas, como una lista corta (para recorrerla).
        function listaDeCategoria(c) {
            const tabla = el("table", { class: "cam-tabla cam-dj-tabla" },
                el("caption", { class: "sr-only", texto: "Mesas de " + c.nombre }),
                el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: "Mesa" }), el("th", { scope: "col", texto: "Blancas" }), el("th", { scope: "col", texto: "Negras" }))),
                el("tbody", {}, ...(c.mesas || []).map((m) => el("tr", { "data-mesa": String(m.mesa) }, el("th", { scope: "row", texto: String(m.mesa) }), el("td", { texto: m.blancas }), el("td", { texto: m.negras })))));
            return el("div", { class: "cam-tabla-envoltura" }, tabla);
        }

        function pintarEstado(extra) {
            if (!ultima) return;
            const sinPareo = ultima.categorias.filter((c) => !(c.mesas || []).length).map((c) => c.nombre);
            const vieja = ultima.categorias.some((c) => c.viejo && (c.mesas || []).length);
            const partes = [sinSenal ? "Sin señal: son las mesas de " + hace(ultima.cuando) : "", extra, sinSenal ? "" : "Actualizado " + hace(ultima.cuando), vieja ? "algunas categorías con datos de hace unos minutos" : "", sinPareo.length ? "todavía sin pareo: " + sinPareo.join(", ") : ""].filter(Boolean);
            decir(partes.join(" · "), sinSenal);
        }

        function pintar() {
            pintarChips();
            const q = campo.value.trim();
            ultimaBtn.hidden = true;
            if (!ultima) { res.replaceChildren(); return; }
            const filas = chip ? ultima.filas.filter((f) => f.tnr === chip) : ultima.filas;
            if (!q) {
                const guardada = leerUltima();
                if (chip) {
                    const c = ultima.categorias.find((x) => x.tnr === chip);
                    res.replaceChildren(c && (c.mesas || []).length ? listaDeCategoria(c) : el("p", { class: "cam-dj-vacio", texto: "Esta categoría todavía no tiene pareo." }));
                } else {
                    res.replaceChildren(el("p", { class: "cam-dj-vacio", texto: "Escribe el apellido o el nombre del atleta: se busca en todas las categorías a la vez. También sirve el número de mesa." }));
                    if (guardada) { ultimaBtn.hidden = false; ultimaBtn.textContent = "Volver a buscar «" + guardada + "»"; ultimaBtn.onclick = () => { campo.value = guardada; pintar(); campo.focus(); }; }
                }
                pintarEstado();
                return;
            }
            const r = buscar(filas, q);
            if (!r.length) { res.replaceChildren(el("p", { class: "cam-dj-vacio", texto: "Nadie coincide con «" + q + "». Prueba con solo el apellido." })); pintarEstado("0 resultados"); return; }
            res.replaceChildren(...r.slice(0, MAX_TARJETAS).map(tarjeta));
            pintarEstado(r.length + (r.length === 1 ? " resultado" : " resultados") + (r.length > MAX_TARJETAS ? " (se muestran " + MAX_TARJETAS + ": escribe más letras)" : ""));
        }

        // La pantalla completa para el atleta: la mesa gigante en el color de su categoría.
        function mostrar(f) {
            guardarUltima(campo.value.trim());
            const hora = horaDe(f.ronda);
            const g = el("dialog", { id: "donde-juega-grande", class: "cam-dj-grande", "aria-label": "Mesa de " + f.nombre });
            g.style.setProperty("--c", colorDe(f.categoria));
            const listo = el("button", { type: "button", class: "cam-dj-listo", "data-accion": "cerrar-grande" }, "Listo");
            g.append(
                el("span", { class: "cam-dj-gcat", texto: f.cat }),
                el("span", { class: "cam-dj-gmesa-t", texto: "MESA" }),
                el("span", { class: "cam-dj-gmesa", texto: String(f.mesa) }),
                el("span", { class: "cam-dj-ginfo" }, f.nombre + " · " + f.color, el("small", { texto: "Contra " + f.rival + " · Ronda " + f.ronda + (hora ? " · " + hora : "") })),
                listo);
            listo.addEventListener("click", () => g.close());
            g.addEventListener("close", () => g.remove());
            document.body.append(g);
            try { g.showModal(); } catch (e) { g.setAttribute("open", ""); }
            listo.focus();
        }

        async function actualizar(silencioso) {
            try {
                await traer(pedir, ahora);
                sinSenal = false;
                reintentar.hidden = true;
                pintar();
            } catch (e) {
                if (ultima) { sinSenal = true; pintar(); return; }
                decir("No se pudo leer: " + (e && e.message ? e.message : "revisa la conexión."), true);
                reintentar.hidden = false;
                reintentar.onclick = () => { decir("Leyendo…"); actualizar(false); };
            }
        }

        campo.addEventListener("input", () => { pintar(); });
        campo.addEventListener("change", () => guardarUltima(campo.value.trim()));
        cerrar.addEventListener("click", () => dialogo.close());
        dialogo.addEventListener("close", () => { clearInterval(reloj); const g = document.getElementById("donde-juega-grande"); if (g) g.remove(); dialogo.remove(); });

        try { dialogo.showModal(); } catch (e) { dialogo.setAttribute("open", ""); }
        campo.focus();
        pintar();
        if (!ultima) decir("Leyendo las categorías…");
        actualizar(false);
        reloj = setInterval(() => { if (!document.hidden) actualizar(true); }, REFRESCO_MS);
        return dialogo;
    }

    global.CentroamericanoEmparejamientos = { abrir, precargar, buscar, normalizar, colorDe, filasDe, estado: () => ultima };
})(window);
