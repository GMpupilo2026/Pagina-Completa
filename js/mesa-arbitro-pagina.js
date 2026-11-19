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
    let planillas = []; // las fotos de las planillas del torneo que se mira (arbitro_planillas)
    let tnrPlanillas = "";
    const subiendo = new Set(); // las mesas con una foto subiendo

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

    const BTN_CHICO = "bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-2.5 py-1 rounded-lg text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50";
    let ocupada = null; // la mesa que se está guardando o anotando: sus botones se apagan mientras tanto

    // Las marcas de la ronda en pantalla (sin lo anulado), leídas de la bitácora de ESE torneo: al cambiar de
    // torneo, la bitácora del anterior puede seguir cargada un momento y no debe contar.
    const marcasDeAhora = () => (pantalla ? M.marcas(lineas.filter((l) => l.tnr === String(pantalla.tnr))) : {});
    function marcaDe(mesa, color) {
        const t = pantalla ? marcasDeAhora()[M.claveMarca(pantalla.ronda, mesa, color)] : null;
        return t || { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null };
    }
    const nombreDe = (m, color) => (color === "negras" ? m.negras : m.blancas) || (color === "negras" ? "Las negras" : "Las blancas");

    // La celda de un jugador: su nombre, sus marcas escritas (nunca solo con color) y sus botones.
    function celdaJugador(m, color) {
        const k = marcaDe(m.mesa, color);
        const nombre = nombreDe(m, color);
        const apagar = ocupada === m.mesa;
        const marcas = [];
        if (k.ilegales) marcas.push(el("span", { "data-marca": "ilegal", class: "font-semibold text-red-700 dark:text-red-300", texto: k.ilegales === 1 ? "1 ilegal" : k.ilegales + " ilegales" }));
        if (k.irregularidades) marcas.push(el("span", { "data-marca": "irregularidad", class: "font-semibold", texto: k.irregularidades === 1 ? "1 irregularidad" : k.irregularidades + " irregularidades" }));
        const boton = (accion, texto, etiqueta, fn) => el("button", { type: "button", "data-accion": accion, "data-color": color, class: BTN_CHICO, "aria-label": etiqueta, disabled: apagar, onclick: fn }, texto);
        const botones = [
            boton("ilegal", "Ilegal", "Jugada ilegal de " + nombre + " (mesa " + m.mesa + ")", () => ilegal(m, color)),
            boton("irregularidad", "Irregularidad", "Irregularidad de " + nombre + " (mesa " + m.mesa + ")", () => irregularidad(m, color)),
        ];
        if (k.ultima_ilegal) botones.push(boton("anular-ilegal", "Anular la última ilegal", "Anular la última jugada ilegal de " + nombre, () => anular(m, color, "ilegal", k.ultima_ilegal)));
        if (k.ultima_irregularidad) botones.push(boton("anular-irregularidad", "Anular la última irregularidad", "Anular la última irregularidad de " + nombre, () => anular(m, color, "irregularidad", k.ultima_irregularidad)));
        return el("td", { class: "py-2 pr-3 align-top", "data-jugador": color },
            el("p", { texto: nombre }),
            marcas.length ? el("p", { class: "text-xs mt-0.5 flex flex-wrap gap-x-2" }, marcas) : null,
            el("div", { class: "flex flex-wrap gap-1 mt-1" }, botones));
    }

    // La foto de las dos planillas de la mesa: tomarla y, si ya hay, verlas. chess-results no tiene dónde adjuntar nada: la foto queda
    // en la Mesa del árbitro (privada) y, si se quiere, en el PDF y el Word de la bitácora. El estado va escrito, no solo con color.
    function filaDeFotos(m) {
        const fotos = M.planillasDeMesa(planillas, pantalla.ronda, m.mesa);
        const sube = subiendo.has(m.mesa);
        return el("div", { class: "flex flex-wrap items-center gap-2 mt-2", "data-fotos": String(fotos.length) },
            el("button", {
                type: "button", "data-accion": "planilla", class: BTN_CHICO, disabled: sube || ocupada === m.mesa,
                "aria-label": (fotos.length ? "Tomar otra foto" : "Tomar la foto") + " de las dos planillas de la mesa " + m.mesa + " (las dos juntas)",
            }, el("span", { "aria-hidden": "true", texto: "📷 " }), sube ? "Subiendo…" : (fotos.length ? "Otra foto de las planillas" : "Foto de las planillas")),
            fotos.length ? el("button", { type: "button", "data-accion": "ver-planilla", class: BTN_CHICO, "aria-label": "Ver " + (fotos.length === 1 ? "la foto" : "las " + fotos.length + " fotos") + " de las planillas de la mesa " + m.mesa }, fotos.length === 1 ? "Ver la foto" : "Ver las " + fotos.length + " fotos") : null,
            fotos.length ? el("span", { class: "text-xs text-emerald-800 dark:text-emerald-300 font-semibold", texto: "Foto guardada" + (fotos.length > 1 ? " (" + fotos.length + ")" : "") }) : null);
    }

    function pintarMesas() {
        const cuerpo = $("m-mesas");
        cuerpo.replaceChildren();
        if (!pantalla) return;
        const q = sinTildes($("m-buscar").value).trim();
        const faltan = $("m-faltan").checked;
        const todas = marcasDeAhora();
        let vistas = 0;
        for (const m of pantalla.mesas) {
            if (faltan && m.valor !== "0") continue;
            if (q && !sinTildes(m.blancas + " " + m.negras).includes(q)) continue;
            vistas++;
            const sel = el("select", {
                id: "m-sel-" + m.mesa, "data-mesa": String(m.mesa), "aria-label": "Resultado de la mesa " + m.mesa + ": " + m.blancas + " contra " + m.negras,
                class: "px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:ring-2 focus:ring-accent-500 outline-none",
                onchange: (e) => { elegido[m.mesa] = e.target.value; pintarMesas(); },
            }, opcionesDe(m));
            sel.value = elegido[m.mesa] || "";
            // «Guardar» en la misma fila: manda solo esta mesa (pedido del dueño en el Centroamericano: no al final de la página).
            const cambio = M.cambios([m], elegido);
            const guardarFila = el("button", {
                type: "button", "data-accion": "guardar-mesa", disabled: !cambio.length || ocupada === m.mesa,
                "aria-label": "Guardar en chess-results el resultado de la mesa " + m.mesa,
                class: "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50",
                onclick: () => guardar(cambio),
            }, "Guardar");
            // Banda roja y aviso escrito: un jugador lleva dos ilegales en esta partida y la mesa no tiene resultado.
            const b = todas[M.claveMarca(pantalla.ronda, m.mesa, "blancas")], n = todas[M.claveMarca(pantalla.ronda, m.mesa, "negras")];
            const pierde = m.valor === "0" && ((b && b.ilegales >= 2) || (n && n.ilegales >= 2));
            const celdaMesa = el("td", { class: "py-2 pr-3 align-top font-semibold" + (pierde ? " border-l-4 border-red-600 pl-3" : "") }, String(m.mesa),
                pierde ? el("p", { "data-pierde": "si", class: "text-xs font-semibold text-red-700 dark:text-red-300 mt-1", texto: "Segunda ilegal: decide el resultado" }) : null);
            cuerpo.append(el("tr", { "data-mesa": String(m.mesa), "data-estado": pierde ? "pierde" : (m.valor !== "0" ? "con-resultado" : "libre"), class: "border-t border-brand-100 dark:border-brand-800" },
                celdaMesa, celdaJugador(m, "blancas"), celdaJugador(m, "negras"), celda(M.textoResultado(m.valor), m.valor === "0" ? "text-brand-500 dark:text-brand-300" : "font-semibold"),
                el("td", { class: "py-2 align-top" }, el("div", { class: "flex flex-wrap items-center gap-2" }, sel, guardarFila), filaDeFotos(m),
                    el("div", { class: "mt-2" }, el("button", { type: "button", "data-accion": "reloj", class: BTN_CHICO, disabled: ocupada === m.mesa, "aria-label": "Corregir el reloj de la mesa " + m.mesa, onclick: () => corregirReloj(m) },
                        el("span", { "aria-hidden": "true", texto: "⏱ " }), "Reloj")))));
        }
        for (const fila of cuerpo.querySelectorAll("tr[data-mesa]")) {
            const m = pantalla.mesas.find((x) => String(x.mesa) === fila.getAttribute("data-mesa"));
            const bf = fila.querySelector('[data-accion="planilla"]'), bv = fila.querySelector('[data-accion="ver-planilla"]');
            if (bf) bf.addEventListener("click", () => fotografiar(m));
            if (bv) bv.addEventListener("click", () => verFotos(m));
        }
        $("m-cuenta").textContent = "Se ven " + vistas + " de " + pantalla.mesas.length + " mesas.";
        actualizarBotones();
    }

    // ------------------------------------------------------------- las fotos de las planillas

    async function cargarPlanillas(tnr) {
        tnrPlanillas = tnr;
        const todas = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.from("arbitro_planillas").select("*").eq("tnr", tnr).order("subida", { ascending: true }).range(desde, desde + 999);
            if (error) { avisar("No se pudieron leer las fotos de las planillas: " + error.message, true); break; }
            todas.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        if (tnrPlanillas !== tnr) return; // el árbitro ya abrió otro torneo
        planillas = todas;
        $("b-fotos-zona").classList.toggle("hidden", !planillas.length);
        $("b-fotos-texto").textContent = "Incluir las " + planillas.length + (planillas.length === 1 ? " foto de planilla" : " fotos de planillas") + " en el PDF y el Word (el archivo pesa más)";
        pintarMesas();
    }

    // Una foto de data: a un Blob sin pasar por fetch (la política de la página no deja pedir data:).
    function dataUrlABlob(url) {
        const m = /^data:([^;,]+);base64,(.*)$/.exec(url || "");
        if (!m) return null;
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: m[1] });
    }

    // La foto se pasa a JPG y se achica en el aparato: sube rápido aunque la señal del salón sea mala.
    async function achicar(archivo, ladoMax, calidad) {
        const bmp = await createImageBitmap(archivo);
        const esc = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * esc));
        c.height = Math.max(1, Math.round(bmp.height * esc));
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        if (bmp.close) bmp.close();
        const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", calidad));
        if (!blob) throw new Error("No se pudo preparar la foto.");
        return { blob, ancho: c.width, alto: c.height };
    }

    // La cámara de siempre del aparato (o una foto ya hecha): un campo de archivo que pide la cámara de atrás.
    function elegirFoto() {
        return new Promise((resolver) => {
            const campo = el("input", { type: "file", accept: "image/*", capture: "environment", class: "sr-only", "aria-hidden": "true", tabindex: "-1" });
            let listo = false;
            const fin = (v) => { if (!listo) { listo = true; campo.remove(); resolver(v); } };
            campo.addEventListener("change", () => fin(campo.files && campo.files[0] ? campo.files[0] : null));
            campo.addEventListener("cancel", () => fin(null));
            document.body.append(campo);
            campo.click();
        });
    }

    async function fotografiar(m) {
        if (!pantalla || subiendo.has(m.mesa)) return;
        let foto = null;
        const G = window.GuiaPlanillas;
        // Primero la cámara CON GUÍA (dos marcos para acomodar las planillas; js/guia-planillas.js); si el aparato no la da, o prefieres la
        // tuya, la cámara de siempre. Nunca se queda sin poder subir la foto.
        if (G && G.disponible()) {
            const r = await G.abrir({ titulo: "Foto de las planillas · Mesa " + m.mesa, rotulos: ["Blancas · " + (m.blancas || ""), "Negras · " + (m.negras || "")] });
            if (r.imagen) foto = dataUrlABlob(r.imagen);
            else if (r.cancelado) return;
            else if (!r.elegida && r.motivo) avisar(r.motivo + " Se usa la cámara del aparato.", true);
        }
        if (!foto) foto = await elegirFoto();
        if (!foto) return;
        await subirPlanilla(m, foto);
    }

    async function subirPlanilla(m, original) {
        subiendo.add(m.mesa);
        pintarMesas();
        const tnr = String(pantalla.tnr), ronda = pantalla.ronda, torneo = pantalla.torneo || "";
        try {
            const { blob } = await achicar(original, M.LADO_PLANILLA, 0.82);
            const { data: { session } } = await sb.auth.getSession();
            const ruta = M.rutaPlanilla(session.user.id, tnr, crypto.randomUUID());
            const arriba = await sb.storage.from(M.BUCKET_PLANILLAS).upload(ruta, blob, { contentType: "image/jpeg", upsert: false });
            if (arriba.error) throw new Error("No se pudo subir la foto: " + arriba.error.message);
            const fila = await sb.from("arbitro_planillas").insert([{ tnr, ronda, mesa: m.mesa, blancas: (m.blancas || "").slice(0, 120), negras: (m.negras || "").slice(0, 120), ruta, bytes: blob.size }]);
            if (fila.error) throw new Error("La foto subió, pero no quedó registrada: " + fila.error.message);
            // Queda también una línea en la bitácora, con su hora: el documento dice cuándo se fotografió la planilla.
            try { await escribirBitacora([{ tnr, torneo, ronda, mesa: m.mesa, tipo: "nota", resultado: null, anterior: null, articulo: "", texto: "Foto de las dos planillas guardada.", enviado: false }]); }
            catch (e) { avisar("La foto quedó guardada, pero " + e.message, true); }
            await cargarPlanillas(tnr);
            await cargarBitacora(tnr);
            avisar("Foto de las planillas de la mesa " + m.mesa + " guardada.");
        } catch (e) {
            avisar(e.message || String(e), true);
        } finally {
            subiendo.delete(m.mesa);
            pintarMesas();
        }
    }

    // Ver las fotos de una mesa en una ventana: la dirección firmada dura pocos minutos (la foto es privada).
    async function verFotos(m) {
        const fotos = M.planillasDeMesa(planillas, pantalla.ronda, m.mesa);
        if (!fotos.length) return;
        const antes = document.activeElement;
        const cerrar = el("button", { type: "button", "data-accion": "cerrar-fotos", class: "bg-brand-700 hover:bg-brand-800 text-white font-semibold px-4 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, "Cerrar");
        const cuerpo = el("div", { class: "space-y-4 mt-3" });
        const dlg = el("dialog", { id: "m-fotos-ventana", "aria-labelledby": "m-fotos-titulo", class: "w-[95vw] max-w-4xl rounded-2xl p-5 bg-white dark:bg-brand-900 text-brand-900 dark:text-white backdrop:bg-black/60" },
            el("div", { class: "flex items-start justify-between gap-3" },
                el("h2", { id: "m-fotos-titulo", class: "font-serif text-lg font-bold", texto: "Planillas de la mesa " + m.mesa + " · ronda " + pantalla.ronda }), cerrar),
            cuerpo);
        cerrar.addEventListener("click", () => dlg.close());
        dlg.addEventListener("close", () => { dlg.remove(); if (antes && antes.focus && document.contains(antes)) antes.focus(); });
        document.body.append(dlg);
        try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); }
        cerrar.focus();
        for (const f of fotos) {
            const { data, error } = await sb.storage.from(M.BUCKET_PLANILLAS).createSignedUrl(f.ruta, 300);
            cuerpo.append(el("figure", { "data-foto": f.id },
                error || !data ? el("p", { class: "text-sm text-red-700 dark:text-red-300 font-semibold", texto: "No se pudo abrir esta foto: " + (error ? error.message : "sin dirección") }) : el("img", { src: data.signedUrl, alt: "Foto de las planillas de la mesa " + m.mesa + ", subida el " + window.HoraCR.fechaHora(f.subida), class: "w-full h-auto rounded-lg border border-brand-200 dark:border-brand-700" }),
                el("figcaption", { class: "text-xs text-brand-500 dark:text-brand-300 mt-1", texto: M.pieDePlanilla(f, (x) => window.HoraCR.fechaHora(x)) })));
        }
    }

    // Las fotos que van al PDF y al Word: se bajan (son privadas) y se achican más, para que el archivo no pese 50 MB.
    async function fotosDelDocumento() {
        const lista = [];
        let faltan = 0;
        for (const p of planillas) {
            try {
                const { data, error } = await sb.storage.from(M.BUCKET_PLANILLAS).download(p.ruta);
                if (error || !data) throw new Error("sin foto");
                const r = await achicar(data, 1400, 0.78);
                lista.push(Object.assign({}, p, { foto: { jpeg: new Uint8Array(await r.blob.arrayBuffer()), ancho: r.ancho, alto: r.alto } }));
            } catch (e) { faltan++; }
        }
        return { lista, faltan };
    }

    // ------------------------------------------------------------- ilegales e irregularidades

    // Ilegal e irregularidad se eligen de una lista (la misma del Centroamericano) y la bitácora queda sola: el
    // tipo, el artículo si lo hay y lo que quiera agregar el árbitro. «Otra» viene elegida: lo que se escriba
    // queda tal cual. Con «Otra» y sin escribir nada, el cuadro vuelve a abrirse con lo que ya tenía.
    async function elegirTipo(titulo, texto, lista, etiqueta, aceptar, peligro) {
        let previo = { tipo: lista[0].id, nota: null };
        for (;;) {
            const r = await Avisos.formulario({
                titulo, aceptar, peligro,
                texto: previo.falta ? "Escribe qué pasó: con «Otra» es obligatorio. " + texto : texto,
                campos: [
                    { nombre: "tipo", etiqueta, tipo: "select", valor: previo.tipo, opciones: lista.map((t) => [t.id, t.texto]) },
                    { nombre: "nota", etiqueta: "Qué pasó (obligatorio con «Otra»; opcional si eliges uno de la lista)", tipo: "textarea", max: 500, valor: previo.nota },
                ],
            });
            if (r === null) return null;
            const t = M.textoTipo(lista, r.tipo, r.nota);
            if (t) return Object.assign(t, { tipo: r.tipo });
            previo = { tipo: r.tipo, nota: r.nota || null, falta: true };
        }
    }

    function lineaDeJugador(m, color, tipo, extra) {
        return Object.assign({
            tnr: String(pantalla.tnr), torneo: pantalla.torneo || "", ronda: pantalla.ronda, mesa: m.mesa, tipo, color, jugador: nombreDe(m, color).slice(0, 120),
            resultado: null, anterior: null, articulo: "", texto: "", enviado: false,
        }, extra);
    }

    async function anotarDeJugador(m, linea) {
        ocupada = m.mesa;
        pintarMesas();
        try {
            await escribirBitacora([linea]);
            await cargarBitacora(pantalla.tnr);
            return true;
        } catch (e) {
            avisar(e.message || String(e), true);
            return false;
        } finally {
            ocupada = null;
            pintarMesas();
        }
    }

    async function ilegal(m, color) {
        if (!pantalla) return;
        const nombre = nombreDe(m, color);
        const segunda = marcaDe(m.mesa, color).ilegales >= 1;
        const minutos = minutosDeIlegal();
        const rapidas = M.modalidad(ritmoDe()) !== "clasico";
        const t = await elegirTipo("Jugada ilegal de " + nombre + " (mesa " + m.mesa + ")",
            (segunda
                ? "Esta sería la SEGUNDA jugada ilegal de " + nombre + " en esta partida: pierde la partida (art. " + M.ARTICULO_ILEGAL + ")."
                : "Elige qué jugada ilegal fue: queda en la bitácora. Es la primera de " + nombre + ": se le " + (minutos === 1 ? "da 1 minuto" : "dan 2 minutos") + " más a su rival (art. " + M.ARTICULO_ILEGAL + (minutos === 1 ? " y apéndice A.3" : "") + ").")
                + (rapidas ? " En rápidas y blitz sin un árbitro cada pocas mesas (A.5.2), solo se corrige si su rival todavía no hizo la jugada siguiente." : ""),
            M.TIPOS_ILEGAL, "¿Qué jugada ilegal fue?", segunda ? "Anotar la SEGUNDA ilegal" : "Anotar la ilegal", segunda);
        if (!t) return;
        if (!await anotarDeJugador(m, lineaDeJugador(m, color, "ilegal", { texto: t.texto, articulo: M.ARTICULO_ILEGAL }))) return;
        // La cuenta sale de lo que la base tiene ahora (otra pestaña pudo anotar también), no de un contador de la página.
        const a = M.avisoIlegal(marcaDe(m.mesa, color).ilegales, nombre, color, minutos);
        if (a.nivel === "pierde") {
            // Se PROPONE el resultado en el desplegable; no se guarda solo: el árbitro lo revisa (puede ser tablas) y toca «Guardar».
            if (m.valor === "0") { elegido[m.mesa] = a.resultado; pintarMesas(); }
            await Avisos.alerta(a.texto + (m.valor === "0" ? " Dejé propuesto «" + M.textoResultado(a.resultado) + "» en la mesa " + m.mesa + "; toca «Guardar» si es lo que corresponde." : ""), { titulo: a.titulo });
            const s = $("m-sel-" + m.mesa); if (s) s.focus();
        } else avisar(a.texto);
    }

    async function irregularidad(m, color) {
        if (!pantalla) return;
        const nombre = nombreDe(m, color);
        const t = await elegirTipo("Irregularidad de " + nombre + " (mesa " + m.mesa + ")", "Elige qué fue. Antes de anotarla te digo lo que dicen las Leyes y qué sanción corresponde.", M.TIPOS_IRREGULARIDAD, "¿Qué irregularidad fue?", "Ver lo que dice el reglamento", false);
        if (!t) return;
        // El segundo paso: lo que dicen las Leyes de ESA irregularidad, la cuenta de las de este jugador y la sanción, ya elegida
        // la que dicen las Leyes (o la más suave cuando la dejan al árbitro). Ver «Mesa del árbitro: el reloj y lo que dice el reglamento».
        const regla = M.reglaIrregularidad(t.tipo, { modalidad: M.modalidad(ritmoDe()), previas: marcaDe(m.mesa, color).irregularidades });
        let previo = { sancion: regla.sugerida, otra: "" }, sancion = null;
        for (;;) {
            const r = await Avisos.formulario({
                titulo: "Irregularidad de " + nombre + " (mesa " + m.mesa + ")",
                texto: (previo.falta ? "Escribe cuál fue la sanción: con «Otra» es obligatorio.\n\n" : "") + regla.texto,
                campos: [
                    { nombre: "sancion", etiqueta: "Sanción", tipo: "select", valor: previo.sancion, opciones: M.SANCIONES.map((x) => [x.id, x.texto]) },
                    { nombre: "otra", etiqueta: "Cuál (solo con «Otra»)", tipo: "textarea", max: 300, valor: previo.otra },
                ],
                aceptar: "Anotar la irregularidad",
            });
            if (r === null) return;
            sancion = M.textoSancion(t.tipo, r.sancion, r.otra);
            if (sancion) break;
            previo = { sancion: r.sancion, otra: r.otra || "", falta: true };
        }
        if (!await anotarDeJugador(m, lineaDeJugador(m, color, "irregularidad", { texto: (t.texto + sancion.texto).slice(0, 2000), articulo: regla.articulo }))) return;
        if (sancion.pierde) {
            // Igual que la segunda ilegal: se PROPONE el resultado, no se guarda solo.
            const resultado = color === "blancas" ? "3" : "1";
            if (m.valor === "0") { elegido[m.mesa] = resultado; pintarMesas(); }
            await Avisos.alerta(nombre + " pierde la partida y su rival gana." + (m.valor === "0" ? " Dejé propuesto «" + M.textoResultado(resultado) + "» en la mesa " + m.mesa + "; toca «Guardar» si es lo que corresponde." : ""), { titulo: "Irregularidad anotada" });
            const s = $("m-sel-" + m.mesa); if (s) s.focus();
        } else if (sancion.tiempo) {
            const quien = sancion.tiempo.a === "rival" ? "a su rival" : "a " + nombre;
            avisar("Irregularidad anotada. Ajusta el reloj ahora: " + (sancion.tiempo.segundos > 0 ? "súmale " : "réstale ") + M.formatoTiempo(Math.abs(sancion.tiempo.segundos)) + " " + quien + ".");
        } else avisar("Irregularidad de " + nombre + " anotada en la bitácora.");
    }

    // ------------------------------------------------------------- el ritmo del torneo y el reloj

    // El ritmo es de cada torneo y lo escribe el árbitro (chess-results no lo da en «Enter Results Online»). Se recuerda en
    // este aparato (localStorage, por código de torneo): es una comodidad, no un dato que deba durar; si no está, el de
    // siempre (90 min + 30 s) y se dice que no está confirmado.
    const CLAVE_RITMO = "mesa_arbitro_ritmo_v1";
    let ritmoEnMemoria = null; // si este aparato no deja guardar (ventana privada), el ritmo vale mientras la página esté abierta
    function ritmosGuardados() {
        try { const x = JSON.parse(localStorage.getItem(CLAVE_RITMO) || "{}"); return x && typeof x === "object" ? x : {}; } catch (e) { return {}; }
    }
    const claveTorneo = () => (pantalla ? String(pantalla.tnr) : (tnrEscrito() || "general"));
    function ritmoGuardado() { return M.ritmoValido(ritmosGuardados()[claveTorneo()]) || ritmoEnMemoria; }
    const ritmoDe = () => ritmoGuardado() || M.RITMO_POR_DEFECTO;
    const minutosDeIlegal = () => M.minutosIlegal(M.modalidad(ritmoDe()));
    function pintarRitmo() {
        const r = ritmoGuardado();
        $("m-ritmo").textContent = "Ritmo del torneo: " + M.textoRitmo(ritmoDe()) + (r ? "" : " (sin confirmar: toca «Cambiar el ritmo» y escribe el de tu torneo)");
        $("m-regla-ilegal").textContent = minutosDeIlegal() === 1 ? "1 minuto" : "2 minutos";
    }
    const enteroDe = (v) => (String(v == null ? "" : v).trim() === "" ? null : /^\d{1,4}$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN);
    async function cambiarRitmo() {
        const r = ritmoDe();
        let previo = { inicial: String(r.inicial / 60), incremento: String(r.incremento), jugada: r.control ? String(r.control.jugada) : "", agrega: r.control ? String(r.control.agrega / 60) : "" }, error = "";
        for (;;) {
            const v = await Avisos.formulario({
                titulo: "Ritmo del torneo",
                texto: (error ? error + "\n\n" : "") + "Con el ritmo se calcula el reloj y el tiempo que da una jugada ilegal (2 minutos en clásico; 1 en rápidas y blitz, apéndice A.3). Queda recordado en este aparato para este torneo.",
                campos: [
                    { nombre: "inicial", etiqueta: "Tiempo inicial (minutos)", inputmode: "numeric", valor: previo.inicial },
                    { nombre: "incremento", etiqueta: "Incremento por jugada (segundos; 0 si no hay)", inputmode: "numeric", valor: previo.incremento },
                    { nombre: "jugada", etiqueta: "Segundo período: al completar la jugada… (vacío si no hay)", inputmode: "numeric", valor: previo.jugada },
                    { nombre: "agrega", etiqueta: "…se suman (minutos)", inputmode: "numeric", valor: previo.agrega },
                ],
                aceptar: "Guardar el ritmo",
            });
            if (v === null) return;
            previo = v;
            const ini = enteroDe(v.inicial), inc = enteroDe(v.incremento) == null ? 0 : enteroDe(v.incremento), jug = enteroDe(v.jugada), agr = enteroDe(v.agrega);
            const control = jug == null && agr == null ? null : { jugada: jug, agrega: agr == null || Number.isNaN(agr) ? NaN : agr * 60 };
            const nuevo = M.ritmoValido({ inicial: ini == null ? NaN : ini * 60, incremento: inc, control });
            if (!nuevo) { error = control && (control.jugada == null || Number.isNaN(control.agrega)) ? "Para el segundo período hacen falta las dos cosas: la jugada y los minutos que se suman." : "Revisa los números: el tiempo inicial va de 1 a 360 minutos y el incremento de 0 a 600 segundos."; continue; }
            const todos = ritmosGuardados();
            todos[claveTorneo()] = nuevo;
            try { localStorage.setItem(CLAVE_RITMO, JSON.stringify(todos)); } catch (e) { avisar("No se pudo recordar el ritmo en este aparato: se usa solo mientras la página esté abierta.", true); ritmoEnMemoria = nuevo; }
            pintarRitmo();
            pintarMesas();
            avisar("Ritmo guardado: " + M.textoRitmo(nuevo) + ".");
            return;
        }
    }
    // Un tiempo escrito: «1240», «12:40» o «1:05:30» (los dos puntos se ponen solos, como en el Centroamericano).
    const tiempoDe = (v) => (String(v || "").trim() === "" ? null : M.leerTiempo(M.ponerDosPuntos(v)));
    // «9:05» → la hora de hoy en Costa Rica, en milisegundos (Costa Rica no cambia de hora: siempre −06:00).
    function horaDeHoy(v) {
        const x = /^(\d{1,2}):?(\d{2})$/.exec(String(v || "").trim());
        if (!x || Number(x[1]) > 23 || Number(x[2]) > 59) return null;
        return Date.parse(window.HoraCR.hoy() + "T" + x[1].padStart(2, "0") + ":" + x[2] + ":00-06:00");
    }

    // Corregir el reloj de una mesa (o, sin mesa, solo consultar). Tres pasos: qué pasó, los datos y el resultado, que
    // el árbitro puede ajustar antes de anotarlo. Lo que se anota es una «incidencia» con el artículo (6.10.1 o 6.10.2).
    async function corregirReloj(m) {
        const donde = m ? " · mesa " + m.mesa : "";
        const c = await Avisos.formulario({
            titulo: "Corregir el reloj" + donde,
            texto: "Ritmo: " + M.textoRitmo(ritmoDe()) + (ritmoGuardado() ? "" : " (sin confirmar: cámbialo abajo de «Mesas» si no es el de tu torneo)") + ".\n\nLas Leyes dejan los tiempos al mejor criterio del árbitro (art. 6.10): te doy un número con las cuentas a la vista, y lo puedes cambiar antes de anotarlo.",
            campos: [{ nombre: "caso", etiqueta: "¿Qué pasó con el reloj?", tipo: "select", valor: "control", opciones: M.CASOS_RELOJ.map((x) => [x.id, x.texto]) }],
            aceptar: "Seguir",
        });
        if (c === null) return;
        const caso = c.caso;
        const AYUDA_T = "Como se lee en el reloj: 1240 o 12:40; 1:05:30 si pasa de una hora.";
        const campos = (v) => {
            const lista = [];
            if (caso === "apagado") lista.push({ nombre: "inicio", etiqueta: "Hora en que empezó la ronda (hora de Costa Rica)", inputmode: "numeric", valor: v.inicio, ayuda: "Por ejemplo 9:00 o 14:30." });
            lista.push({ nombre: "jb", etiqueta: "Jugadas completadas por las blancas", inputmode: "numeric", valor: v.jb },
                { nombre: "jn", etiqueta: "Jugadas completadas por las negras", inputmode: "numeric", valor: v.jn, ayuda: "Las que ya pulsaron el reloj. Las blancas llevan las mismas que las negras o una más." });
            if (caso === "apagado") {
                lista.push({ nombre: "tb", etiqueta: "Si todavía se lee: reloj de las blancas (vacío si no)", inputmode: "numeric", valor: v.tb, ayuda: AYUDA_T },
                    { nombre: "tn", etiqueta: "Si todavía se lee: reloj de las negras (vacío si no)", inputmode: "numeric", valor: v.tn });
            } else {
                lista.push({ nombre: "tb", etiqueta: "Lo que marca ahora el reloj de las blancas", inputmode: "numeric", valor: v.tb, ayuda: AYUDA_T },
                    { nombre: "tn", etiqueta: "Lo que marca ahora el reloj de las negras", inputmode: "numeric", valor: v.tn });
            }
            if (caso === "programado") lista.push({ nombre: "pini", etiqueta: "Tiempo inicial que se programó (minutos)", inputmode: "numeric", valor: v.pini },
                { nombre: "pinc", etiqueta: "Incremento que se programó (segundos; 0 si no había)", inputmode: "numeric", valor: v.pinc });
            return lista;
        };
        let v = { inicio: "", jb: "", jn: "", tb: "", tn: "", pini: "", pinc: "0" }, error = "", res = null;
        for (;;) {
            const r = await Avisos.formulario({ titulo: (M.CASOS_RELOJ.find((x) => x.id === caso) || {}).texto + donde, texto: error || "Escribe lo que ves en la mesa.", campos: campos(v), aceptar: "Calcular" });
            if (r === null) return;
            v = Object.assign(v, r);
            const jB = enteroDe(r.jb), jN = enteroDe(r.jn);
            const datos = { ritmo: ritmoDe(), jBlancas: jB == null ? NaN : jB, jNegras: jN == null ? NaN : jN };
            if (caso === "apagado") {
                const ahora = Date.now(), inicio = horaDeHoy(r.inicio);
                if (inicio == null) { error = "Escribe la hora de inicio como 9:00 o 14:30."; continue; }
                if (inicio > ahora) { error = "Esa hora todavía no llega hoy: revisa la hora de inicio."; continue; }
                const lb = tiempoDe(r.tb), ln = tiempoDe(r.tn);
                if ((String(r.tb || "").trim() && lb == null) || (String(r.tn || "").trim() && ln == null)) { error = "No entendí lo que marca el reloj. " + AYUDA_T; continue; }
                const lineasMesa = m && pantalla ? lineas.filter((l) => l.tnr === String(pantalla.tnr)) : [];
                Object.assign(datos, { inicioMs: inicio, ahoraMs: ahora, bonos: m && pantalla ? M.bonosDeMesa(lineasMesa, pantalla.ronda, m.mesa, minutosDeIlegal()) : [],
                    visto: lb != null || ln != null ? { blancas: lb == null ? NaN : lb, negras: ln == null ? NaN : ln } : null });
            } else {
                Object.assign(datos, { tBlancas: tiempoDe(r.tb), tNegras: tiempoDe(r.tn) });
                if (datos.tBlancas == null || datos.tNegras == null) { error = "No entendí lo que marca el reloj. " + AYUDA_T; continue; }
                if (caso === "programado") datos.programado = { inicial: enteroDe(r.pini) == null || Number.isNaN(enteroDe(r.pini)) ? NaN : enteroDe(r.pini) * 60, incremento: enteroDe(r.pinc) == null ? 0 : enteroDe(r.pinc) };
            }
            res = M.corregirReloj(caso, datos);
            if (res.error) { error = res.error; continue; }
            break;
        }
        const anotable = !!(m && pantalla);
        const texto = ["Pon blancas " + M.formatoTiempo(res.blancas) + " y negras " + M.formatoTiempo(res.negras) + " (art. " + res.articulo + ").", "Cómo se calculó:", ...res.pasos.map((x) => "• " + x)]
            .concat(res.avisos.length ? ["", ...res.avisos.map((x) => "⚠ " + x)] : []).join("\n");
        let vista = { tb: M.formatoTiempo(res.blancas), tn: M.formatoTiempo(res.negras) }, problema = "";
        for (;;) {
            const f = await Avisos.formulario({
                titulo: "El reloj" + donde, texto: (problema ? problema + "\n\n" : "") + texto,
                campos: [{ nombre: "tb", etiqueta: "Blancas (cámbialo si tu criterio es otro)", inputmode: "numeric", valor: vista.tb, ayuda: AYUDA_T },
                    { nombre: "tn", etiqueta: "Negras", inputmode: "numeric", valor: vista.tn }],
                aceptar: anotable ? "Anotar en la bitácora" : "Listo", cancelar: anotable ? "Cerrar sin anotar" : false,
            });
            if (f === null || !anotable) return;
            const b = tiempoDe(f.tb), n = tiempoDe(f.tn);
            vista = f;
            if (b == null || n == null) { problema = "No entendí uno de los tiempos. " + AYUDA_T; continue; }
            const ajustado = b !== res.blancas || n !== res.negras;
            const linea = ajustado
                ? res.resumen.replace(/: blancas .*?, negras .*?,/, ": blancas " + M.formatoTiempo(b) + ", negras " + M.formatoTiempo(n) + ",") + " Ajustado por el árbitro; el cálculo daba blancas " + M.formatoTiempo(res.blancas) + " y negras " + M.formatoTiempo(res.negras) + "."
                : res.resumen;
            ocupada = m.mesa;
            pintarMesas();
            try {
                await escribirBitacora([{ tnr: String(pantalla.tnr), torneo: pantalla.torneo || "", ronda: pantalla.ronda, mesa: m.mesa, tipo: "incidencia", resultado: null, anterior: null, articulo: res.articulo, texto: linea.slice(0, 2000), enviado: false }]);
                await cargarBitacora(String(pantalla.tnr));
                avisar("Reloj de la mesa " + m.mesa + " anotado en la bitácora.");
            } catch (e) {
                avisar(e.message || String(e), true);
            } finally {
                ocupada = null;
                pintarMesas();
            }
            return;
        }
    }

    // Consultar el reglamento sin anotar nada: un árbitro auxiliar que solo quiere confirmar una regla.
    async function consultarIrregularidad() {
        const r = await Avisos.formulario({ titulo: "Lo que dice el reglamento", texto: "Elige la irregularidad. No se anota nada.", campos: [{ nombre: "tipo", etiqueta: "¿Qué pasó?", tipo: "select", valor: "otra", opciones: M.TIPOS_IRREGULARIDAD.map((t) => [t.id, t.id === "otra" ? "Otra (la escala de sanciones del 12.9)" : t.texto]) }], aceptar: "Ver lo que dice" });
        if (r === null) return;
        const regla = M.reglaIrregularidad(r.tipo, { modalidad: M.modalidad(ritmoDe()) });
        const s = M.SANCIONES.find((x) => x.id === regla.sugerida);
        await Avisos.alerta(regla.texto + "\n\nLo que se suele aplicar: " + (s ? s.texto : "el árbitro decide") + ".", { titulo: (M.TIPOS_IRREGULARIDAD.find((t) => t.id === r.tipo) || {}).texto || "Irregularidad" });
    }

    // Un toque por error no se borra: se anula con otra línea que apunta a la anulada (la base comprueba que sea tuya y de esta partida).
    async function anular(m, color, tipo, id) {
        const nombre = nombreDe(m, color);
        const sigue = await Avisos.confirmar("¿Anular la última " + (tipo === "ilegal" ? "jugada ilegal" : "irregularidad") + " de " + nombre + " en la mesa " + m.mesa + "? Quedan las dos anotaciones en la bitácora, y la anulada deja de contar.", { titulo: "Anular una anotación", aceptar: "Sí, anularla" });
        if (!sigue) return;
        if (await anotarDeJugador(m, lineaDeJugador(m, color, "anulacion", { anula: id, texto: tipo === "ilegal" ? "jugada ilegal anotada por error" : "irregularidad anotada por error" }))) avisar("Anulada. Sigue en la bitácora, pero ya no cuenta.");
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
        // Mientras se lee no se puede elegir otro torneo del grupo: dos lecturas a la vez podían dejar la pantalla con el equivocado.
        $("m-leer").disabled = true;
        $("m-ligados").disabled = true;
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
            pintarRitmo();
            pintarMesas();
            await cargarBitacora(d.tnr);
            // Queda en «Mis torneos» (con el nombre que trae chess-results).
            sb.rpc("arbitro_torneo_visto", { p_tnr: d.tnr, p_torneo: d.torneo || "" }).then(cargarMisTorneos, () => {});
        } catch (e) {
            $("m-estado").textContent = "";
            avisar(e.message || String(e), true);
            // Si no se pudo abrir el torneo elegido, el desplegable vuelve al que sigue en pantalla.
            if (pantalla && $("m-ligados").querySelector('option[value="' + pantalla.tnr + '"]')) $("m-ligados").value = pantalla.tnr;
        } finally {
            $("m-leer").disabled = false;
            $("m-ligados").disabled = false;
        }
    }

    // ------------------------------------------------------------- mis torneos

    let misTorneos = [];

    async function cargarMisTorneos() {
        const { data, error } = await sb.rpc("arbitro_torneos_mis");
        if (error) { $("mt-vacio").hidden = false; $("mt-vacio").textContent = "No se pudo leer tu lista de torneos: " + error.message; return; }
        misTorneos = data || [];
        pintarMisTorneos();
    }

    // Abrir un torneo de la lista: se ve su bitácora y queda listo para corregir (hace falta la clave, que nunca se guarda).
    async function abrirDeLaLista(t) {
        $("m-tnr").value = t.tnr;
        $("m-estado").textContent = "Abierto «" + t.nombre + "». Estás viendo su bitácora; para leer la ronda y corregir en chess-results, escribe la clave (SID) y toca «Leer la ronda».";
        await cargarBitacora(t.tnr);
        $("t-torneo").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        $("m-sid").focus({ preventScroll: true });
    }

    async function renombrarTorneo(t) {
        const n = await Avisos.pedir("Ponle un nombre a este torneo para reconocerlo en tu lista. Déjalo vacío para usar el de chess-results.", { titulo: "Nombre del torneo", etiqueta: "Nombre", valor: t.nombre_propio || "", aceptar: "Guardar el nombre" });
        if (n === null) return;
        const { error } = await sb.rpc("arbitro_torneo_ajustar", { p_tnr: t.tnr, p_nombre: n, p_archivado: null });
        if (error) { avisar("No se pudo guardar el nombre: " + error.message, true); return; }
        await cargarMisTorneos();
        avisar("Nombre guardado.");
    }

    async function archivarTorneo(t, archivar) {
        const { error } = await sb.rpc("arbitro_torneo_ajustar", { p_tnr: t.tnr, p_nombre: null, p_archivado: archivar });
        if (error) { avisar("No se pudo " + (archivar ? "archivar" : "restaurar") + ": " + error.message, true); return; }
        await cargarMisTorneos();
        avisar(archivar ? "«" + t.nombre + "» quedó archivado. Lo ves con «Mostrar los archivados»." : "«" + t.nombre + "» volvió a tu lista.");
    }

    function pintarMisTorneos() {
        const verArchivados = $("mt-archivados").checked;
        const lista = misTorneos.filter((t) => verArchivados || !t.archivado);
        const archivados = misTorneos.filter((t) => t.archivado).length;
        $("mt-vacio").hidden = lista.length > 0;
        if (!lista.length) $("mt-vacio").textContent = misTorneos.length
            ? "No hay torneos sin archivar. Tienes " + archivados + " archivado" + (archivados === 1 ? "" : "s") + ": márcalos con «Mostrar los archivados»."
            : "Todavía no has abierto ningún torneo. Escribe abajo su código y la clave (SID) y toca «Leer la ronda»: quedará aquí.";
        $("mt-lista").replaceChildren(...lista.map((t) => {
            const partes = ["chess-results " + t.tnr, "último uso: " + window.HoraCR.fechaHora(new Date(t.ultima))];
            if (t.resultados) partes.push(t.resultados + (t.resultados === 1 ? " resultado" : " resultados"));
            if (t.incidencias) partes.push(t.incidencias + (t.incidencias === 1 ? " incidencia" : " incidencias"));
            if (!t.lineas) partes.push("sin anotaciones todavía");
            const boton = (accion, texto, fn, clase) => el("button", { type: "button", "data-accion": accion, class: clase || "bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-3 py-1.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", onclick: fn }, texto);
            return el("li", { "data-tnr": t.tnr, "data-archivado": t.archivado ? "si" : "no", class: "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 dark:border-brand-800 px-3 py-2" },
                el("div", { class: "min-w-0" },
                    el("p", { class: "font-semibold break-words", texto: t.nombre + (t.archivado ? " (archivado)" : "") }),
                    el("p", { class: "text-xs text-brand-500 dark:text-brand-300", texto: partes.join(" · ") + (t.nombre_propio && t.torneo ? " · en chess-results: " + t.torneo : "") })),
                el("div", { class: "flex flex-wrap gap-2" },
                    boton("abrir", "Abrir", () => abrirDeLaLista(t), "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"),
                    boton("renombrar", "Ponerle nombre", () => renombrarTorneo(t)),
                    boton(t.archivado ? "restaurar" : "archivar", t.archivado ? "Restaurar" : "Archivar", () => archivarTorneo(t, !t.archivado))));
        }));
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

    // `deUna`: el «Guardar» de una fila manda solo esa mesa (y no pregunta: el botón está en la fila y dice qué guarda).
    // El de abajo manda todas las pendientes y pregunta antes.
    async function guardar(deUna) {
        const fila = Array.isArray(deUna);
        const cs = fila ? deUna : pendientes();
        if (!cs.length || !pantalla) return;
        const sid = $("m-sid").value.trim();
        if (!sid) { avisar("Falta el SID (la clave del torneo). Escríbela arriba: no se guarda en ningún lado.", true); $("m-sid").focus(); return; }
        const n = cs.length;
        if (!fila) {
            const sigue = await Avisos.confirmar(
                "Vas a mandar " + n + (n === 1 ? " resultado" : " resultados") + " de la ronda " + pantalla.ronda + " de «" + (pantalla.torneo || pantalla.tnr) + "» a chess-results. Se ven al instante en la página pública del torneo.",
                { titulo: "Guardar en chess-results", aceptar: "Guardar " + n + (n === 1 ? " resultado" : " resultados") });
            if (!sigue) return;
        }
        if (fila) { ocupada = cs[0].mesa; pintarMesas(); }
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
            if (fila) { ocupada = null; pintarMesas(); } else actualizarBotones();
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
        if (tnrPlanillas !== tnr) await cargarPlanillas(tnr);
        // Las marcas de cada jugador salen de la bitácora: al leerla, las mesas se vuelven a pintar.
        if (pantalla && pantalla.tnr === tnr) pintarMesas();
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
            let fotos = [], faltan = 0;
            if (planillas.length && tnrPlanillas === tnrBitacora && $("b-fotos").checked) {
                $("b-estado").textContent = "Preparando las fotos de las planillas…";
                ({ lista: fotos, faltan } = await fotosDelDocumento());
            }
            const doc = M.documento(torneo, lineas, $("b-arbitro").value.trim(), (x) => window.HoraCR.fechaHora(x), fotos);
            let blob;
            if (cual === "docx") {
                try { doc.marca = await window.MarcaAgua.preparar(); } catch (e) { /* sin conexión: sin marca */ }
                blob = window.ReporteDOCX.generar(doc);
            } else blob = await window.ReportePDF.generar(doc);
            bajarBlob(blob, nombreArchivo(cual));
            $("b-estado").textContent = "Listo, se bajó en " + (cual === "docx" ? "Word" : "PDF") + (fotos.length ? " con " + fotos.length + (fotos.length === 1 ? " foto de planilla" : " fotos de planillas") : "") + "." + (faltan ? " No se pudieron bajar " + faltan + (faltan === 1 ? " foto" : " fotos") + "." : "");
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
        $("mt-archivados").addEventListener("change", pintarMisTorneos);
        cargarMisTorneos();
        $("m-buscar").addEventListener("input", pintarMesas);
        $("m-faltan").addEventListener("change", pintarMesas);
        $("m-guardar").addEventListener("click", guardar);
        $("m-anotar").addEventListener("click", anotar);
        $("m-copiar").addEventListener("click", copiar);
        $("b-agregar").addEventListener("click", agregar);
        $("m-ritmo-cambiar").addEventListener("click", cambiarRitmo);
        $("c-reloj").addEventListener("click", () => corregirReloj(null));
        $("c-reglamento").addEventListener("click", consultarIrregularidad);
        pintarRitmo();
        $("b-pdf").addEventListener("click", () => bajar("pdf"));
        $("b-docx").addEventListener("click", () => bajar("docx"));
        pintarBitacora();
    }

    init().catch((e) => { $("loading").classList.add("hidden"); avisar("No se pudo abrir la herramienta: " + (e.message || e), true); });
})();

/*! rev bfb5bbb0d2d82f9f */
