/* El código de mesa-arbitro.html: «Mesa del árbitro».

   Lee las mesas de la ronda abierta de un torneo suizo de chess-results con la
   Edge Function `mesa-arbitro` (pidiendo la licencia de «mesa-arbitro»), deja
   anotar el resultado de cada mesa y, si el árbitro lo pide, lo manda a
   chess-results con la misma clave que da el organizador. Cada cosa que se
   hace queda en `arbitro_bitacora` (tabla propia, con RLS y licencia), que se
   baja en PDF o en Word.

   LA CLAVE (SID) NO SE GUARDA: solo está en el campo de la página y viaja en
   el pedido a la función. No va a la bitácora, a localStorage ni a ningún
   archivo.

   UNA LÍNEA DE BITÁCORA «ENVIADO» SOLO SE ESCRIBE CUANDO LA FUNCIÓN VOLVIÓ A
   LEER chess-results y el resultado estaba ahí: nunca por haber mandado el
   envío. Ver «Mesa del árbitro: resultados y bitácora» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const M = window.MesaArbitro;
    const $ = (id) => document.getElementById(id);
    const avisar = (texto, error) => Avisos.avisar(texto, { tipo: error ? "error" : "ok" });

    let pantalla = null; // lo que se leyó: { tnr, torneo, ronda, mesas }
    let elegido = {}; // mesa → valor elegido por el árbitro
    let lineas = []; // la bitácora del torneo que se mira
    let tnrBitacora = "";

    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }

    const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const celda = (texto, clase) => el("td", { class: "py-2 pr-3 align-top " + (clase || ""), texto });

    function tnrEscrito() {
        const t = $("m-tnr").value.trim();
        return /^\d{1,7}$/.test(t) ? t : null;
    }

    // La función contesta con un error legible aun en 4xx/5xx: se lee el cuerpo.
    async function invocar(cuerpo) {
        let { data, error } = await sb.functions.invoke("mesa-arbitro", { body: cuerpo });
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) throw new Error((data && data.error) || (error && error.message) || "chess-results no contestó");
        return data;
    }

    // ------------------------------------------------------------- las mesas

    function opcionesDe(m) {
        const o = [el("option", { value: "", texto: "— sin cambio —" })];
        for (const r of M.RESULTADOS) {
            if (r.valor === "0") continue;
            if (r.valor === "D" && m.valor === "0") continue;
            o.push(el("option", { value: r.valor, texto: r.texto }));
        }
        return o;
    }

    function pintarMesas() {
        const cuerpo = $("m-mesas");
        cuerpo.replaceChildren();
        if (!pantalla) return;
        const q = sinTildes($("m-buscar").value).trim();
        const faltan = $("m-faltan").checked;
        let vistas = 0;
        for (const m of pantalla.mesas) {
            if (faltan && m.valor !== "0") continue;
            if (q && !sinTildes(m.blancas + " " + m.negras).includes(q)) continue;
            vistas++;
            const sel = el("select", {
                id: "m-sel-" + m.mesa, "data-mesa": String(m.mesa), "aria-label": "Resultado de la mesa " + m.mesa + ": " + m.blancas + " contra " + m.negras,
                class: "px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:ring-2 focus:ring-accent-500 outline-none",
                onchange: (e) => { elegido[m.mesa] = e.target.value; actualizarBotones(); },
            }, opcionesDe(m));
            sel.value = elegido[m.mesa] || "";
            cuerpo.append(el("tr", { "data-mesa": String(m.mesa), class: "border-t border-brand-100 dark:border-brand-800" },
                celda(String(m.mesa), "font-semibold"), celda(m.blancas), celda(m.negras), celda(M.textoResultado(m.valor), m.valor === "0" ? "text-brand-500 dark:text-brand-300" : "font-semibold"),
                el("td", { class: "py-2 align-top" }, sel)));
        }
        $("m-cuenta").textContent = "Se ven " + vistas + " de " + pantalla.mesas.length + " mesas.";
        actualizarBotones();
    }

    function pendientes() {
        return pantalla ? M.cambios(pantalla.mesas, elegido) : [];
    }
    function actualizarBotones() {
        const n = pendientes().length;
        ["m-guardar", "m-anotar", "m-copiar"].forEach((b) => { $(b).disabled = n === 0; });
        $("m-guardar").textContent = n ? "Guardar " + n + (n === 1 ? " resultado" : " resultados") + " en chess-results" : "Guardar en chess-results";
        $("m-guardar-estado").textContent = n ? n + (n === 1 ? " mesa con un resultado por guardar." : " mesas con un resultado por guardar.") : "";
    }

    // Los torneos ligados del grupo: si hay más de uno, un desplegable para pasar de uno a otro.
    function pintarLigados(torneos, actual) {
        const sel = $("m-ligados");
        sel.replaceChildren();
        const varios = Array.isArray(torneos) && torneos.length > 1;
        $("m-ligados-zona").classList.toggle("hidden", !varios);
        if (!varios) return;
        for (const t of torneos) sel.append(el("option", { value: t.tnr, texto: (t.nombre || "Torneo") + " · " + t.tnr }));
        sel.value = actual;
    }

    async function leer(destino) {
        const tnr = tnrEscrito();
        const sid = $("m-sid").value.trim();
        if (!tnr) { avisar("El código de la base de datos son hasta 7 números.", true); return; }
        if (!sid) { avisar("Falta el SID (la clave del torneo).", true); return; }
        $("m-leer").disabled = true;
        $("m-estado").textContent = "Entrando a chess-results…";
        try {
            const d = await invocar(Object.assign({ action: "leer", tnr, sid }, typeof destino === "string" && destino ? { destino } : {}));
            pantalla = { acceso: tnr, tnr: d.tnr, torneo: d.torneo, ronda: d.ronda, mesas: d.mesas };
            elegido = {};
            pintarLigados(d.torneos, d.tnr);
            $("m-estado").textContent = d.mesas.length
                ? "Leída la ronda " + d.ronda + ": " + d.mesas.length + " mesas."
                : "Se entró a chess-results, pero la ronda " + d.ronda + " no tiene mesas todavía. ¿Ya emparejaste en Swiss-Manager y subiste el torneo?";
            $("m-torneo").textContent = (d.torneo || "Torneo") + " · ronda " + d.ronda;
            $("t-mesas").textContent = "Mesas de la ronda " + d.ronda;
            $("zona-mesas").classList.toggle("hidden", !d.mesas.length);
            $("m-informe").replaceChildren();
            $("b-ronda").value = d.ronda;
            pintarMesas();
            await cargarBitacora(d.tnr);
        } catch (e) {
            $("m-estado").textContent = "";
            avisar(e.message || String(e), true);
        } finally {
            $("m-leer").disabled = false;
        }
    }

    // ------------------------------------------------------------- guardar

    function informe(resultados, diferencias) {
        const ul = $("m-informe");
        ul.replaceChildren();
        for (const r of resultados) {
            ul.append(el("li", { "data-mesa": String(r.mesa), "data-ok": r.ok ? "si" : "no", class: r.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300 font-semibold" },
                (r.ok ? "✓ Mesa " : "✗ Mesa ") + r.mesa + ": " + (r.ok ? "quedó «" + M.textoResultado(r.quedo) + "» en chess-results." : "se pidió «" + M.textoResultado(r.pedido) + "» pero chess-results tiene «" + (r.quedo == null ? "nada" : M.textoResultado(r.quedo)) + "». No quedó en la bitácora como enviado.")));
        }
        for (const d of diferencias) {
            ul.append(el("li", { "data-diferencia": String(d.mesa), class: "text-red-700 dark:text-red-300 font-semibold" },
                "⚠ La mesa " + d.mesa + " cambió sin que la tocaras: antes «" + M.textoResultado(d.antes) + "», ahora «" + M.textoResultado(d.ahora) + "». Revísala en chess-results."));
        }
    }

    async function escribirBitacora(filas) {
        const { error } = await sb.from("arbitro_bitacora").insert(filas);
        if (error) throw new Error("No se pudo escribir en la bitácora: " + error.message);
    }

    async function guardar() {
        const cs = pendientes();
        if (!cs.length || !pantalla) return;
        const sid = $("m-sid").value.trim();
        if (!sid) { avisar("Falta el SID (la clave del torneo).", true); return; }
        const n = cs.length;
        const sigue = await Avisos.confirmar(
            "Vas a mandar " + n + (n === 1 ? " resultado" : " resultados") + " de la ronda " + pantalla.ronda + " de «" + (pantalla.torneo || pantalla.tnr) + "» a chess-results. Se ven al instante en la página pública del torneo.",
            { titulo: "Guardar en chess-results", aceptar: "Guardar " + n + (n === 1 ? " resultado" : " resultados") });
        if (!sigue) return;
        $("m-guardar").disabled = true;
        $("m-guardar-estado").textContent = "Guardando en chess-results y comprobando lo que quedó…";
        try {
            const d = await invocar({
                action: "guardar", tnr: pantalla.acceso || pantalla.tnr, destino: pantalla.tnr, sid, ronda: pantalla.ronda,
                cambios: cs.map((c) => ({ mesa: c.mesa, blancas: c.blancas, negras: c.negras, valor: c.valor })),
            });
            informe(d.resultados, d.diferencias);
            const bien = cs.filter((c) => (d.resultados.find((r) => r.mesa === c.mesa) || {}).ok);
            // La pantalla vuelve a lo que chess-results tiene de verdad.
            for (const r of d.resultados) {
                const m = pantalla.mesas.find((x) => x.mesa === r.mesa);
                if (m && r.quedo != null) m.valor = r.quedo;
                if (r.ok) delete elegido[r.mesa];
            }
            for (const x of d.diferencias) { const m = pantalla.mesas.find((y) => y.mesa === x.mesa); if (m) m.valor = x.ahora; }
            pintarMesas();
            if (bien.length) {
                try { await escribirBitacora(M.lineasDeCambios(bien, pantalla, true)); await cargarBitacora(pantalla.tnr); }
                catch (e) { avisar("Se guardó en chess-results, pero " + e.message, true); }
            }
            $("m-guardar-estado").textContent = d.ok
                ? "Listo: " + bien.length + (bien.length === 1 ? " resultado guardado" : " resultados guardados") + " y comprobados en chess-results."
                : "Ojo: algo no quedó como se pidió. Mira la lista de abajo.";
            if (!d.ok) avisar("Algo no quedó como se pidió. Revisa la lista debajo de la tabla.", true);
        } catch (e) {
            $("m-guardar-estado").textContent = "";
            avisar(e.message || String(e), true);
        } finally {
            actualizarBotones();
        }
    }

    async function anotar() {
        const cs = pendientes();
        if (!cs.length || !pantalla) return;
        try {
            await escribirBitacora(M.lineasDeCambios(cs, pantalla, false));
            cs.forEach((c) => { delete elegido[c.mesa]; });
            pintarMesas();
            await cargarBitacora(pantalla.tnr);
            $("m-guardar-estado").textContent = "Anotados " + cs.length + (cs.length === 1 ? " resultado" : " resultados") + " en la bitácora, sin mandarlos a chess-results.";
        } catch (e) {
            avisar(e.message || String(e), true);
        }
    }

    async function copiar() {
        const cs = pendientes();
        if (!cs.length) return;
        const texto = M.listaParaTeclear(cs);
        try {
            await navigator.clipboard.writeText(texto);
            avisar("Copiada la lista de " + cs.length + (cs.length === 1 ? " mesa." : " mesas."));
        } catch (e) {
            $("m-informe").replaceChildren(el("li", { class: "whitespace-pre-line", texto }));
            avisar("No se pudo copiar solo; la lista quedó debajo de la tabla.", true);
        }
    }

    // ------------------------------------------------------------- la bitácora

    function pintarBitacora() {
        const cuerpo = $("b-lineas");
        cuerpo.replaceChildren();
        for (const l of lineas) {
            cuerpo.append(el("tr", { "data-tipo": l.tipo, class: "border-t border-brand-100 dark:border-brand-800" },
                celda(window.HoraCR.fechaHora(l.ocurrio)), celda(l.ronda == null ? "" : String(l.ronda)), celda(l.mesa == null ? "" : String(l.mesa)),
                celda(M.TIPOS[l.tipo] || l.tipo, "font-semibold"), celda(M.detalle(l), "whitespace-pre-line"), celda(l.articulo || "")));
        }
        $("b-vacia").classList.toggle("hidden", lineas.length > 0);
        $("b-vacia").textContent = tnrBitacora ? "Todavía no hay nada anotado en este torneo." : "Escribe el código del torneo y toca «Ver solo la bitácora» o «Leer la ronda».";
        ["b-pdf", "b-docx"].forEach((b) => { $(b).disabled = lineas.length === 0; });
    }

    async function cargarBitacora(tnr) {
        tnrBitacora = tnr;
        const todas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from("arbitro_bitacora").select("*").eq("tnr", tnr).order("ocurrio", { ascending: true }).range(desde, desde + 999);
            if (error) { avisar("No se pudo leer la bitácora: " + error.message, true); break; }
            todas.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        lineas = todas;
        pintarBitacora();
    }

    async function agregar() {
        const tnr = (pantalla && pantalla.tnr) || tnrEscrito();
        if (!tnr) { avisar("Escribe primero el código del torneo.", true); return; }
        const texto = $("b-texto").value.trim();
        if (!texto) { avisar("Cuenta qué pasó.", true); return; }
        const entero = (id) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) && v > 0 ? v : null; };
        $("b-agregar").disabled = true;
        try {
            await escribirBitacora([{
                tnr, torneo: (pantalla && pantalla.tnr === tnr ? pantalla.torneo : "") || "", ronda: entero("b-ronda"), mesa: entero("b-mesa"),
                tipo: $("b-tipo").value, resultado: null, anterior: null, articulo: $("b-articulo").value.trim(), texto, enviado: false,
            }]);
            $("b-texto").value = "";
            $("b-articulo").value = "";
            $("b-mesa").value = "";
            $("b-estado").textContent = "Anotado.";
            await cargarBitacora(tnr);
        } catch (e) {
            avisar(e.message || String(e), true);
        } finally {
            $("b-agregar").disabled = false;
        }
    }

    function nombreArchivo(ext) {
        return "bitacora-arbitro-" + tnrBitacora + "." + ext;
    }
    function bajarBlob(blob, nombre) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    async function bajar(cual) {
        if (!lineas.length) return;
        const torneo = { tnr: tnrBitacora, torneo: (pantalla && pantalla.tnr === tnrBitacora && pantalla.torneo) || (lineas.find((l) => l.torneo) || {}).torneo || "" };
        try {
            const doc = M.documento(torneo, lineas, $("b-arbitro").value.trim(), (x) => window.HoraCR.fechaHora(x));
            let blob;
            if (cual === "docx") {
                try { doc.marca = await window.MarcaAgua.preparar(); } catch (e) { /* sin conexión: sin marca */ }
                blob = window.ReporteDOCX.generar(doc);
            } else blob = await window.ReportePDF.generar(doc);
            bajarBlob(blob, nombreArchivo(cual));
            $("b-estado").textContent = "Listo, se bajó en " + (cual === "docx" ? "Word" : "PDF") + ".";
        } catch (e) {
            avisar("No se pudo armar el archivo: " + (e.message || e), true);
        }
    }

    // ------------------------------------------------------------- la entrada

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        $("loading").classList.add("hidden");
        if (!session) { location.href = "login.html?next=mesa-arbitro.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "mesa-arbitro" });
        if (error || puede !== true) { $("denegado").classList.remove("hidden"); return; }
        $("app").classList.remove("hidden");
        $("m-leer").addEventListener("click", () => leer());
        $("m-ligados").addEventListener("change", (e) => { if (e.target.value) leer(e.target.value); });
        $("m-ver-bitacora").addEventListener("click", async () => {
            const tnr = tnrEscrito();
            if (!tnr) { avisar("El código de la base de datos son hasta 7 números.", true); return; }
            await cargarBitacora(tnr);
        });
        $("m-buscar").addEventListener("input", pintarMesas);
        $("m-faltan").addEventListener("change", pintarMesas);
        $("m-guardar").addEventListener("click", guardar);
        $("m-anotar").addEventListener("click", anotar);
        $("m-copiar").addEventListener("click", copiar);
        $("b-agregar").addEventListener("click", agregar);
        $("b-pdf").addEventListener("click", () => bajar("pdf"));
        $("b-docx").addEventListener("click", () => bajar("docx"));
        pintarBitacora();
    }

    init().catch((e) => { $("loading").classList.add("hidden"); avisar("No se pudo abrir la herramienta: " + (e.message || e), true); });
})();
