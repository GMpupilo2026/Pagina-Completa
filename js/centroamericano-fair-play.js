/* ===== Centroamericano 2026 — Fair Play: el sorteo de mesas y las alertas de los tableros electrónicos =====
 *
 * La MISMA pantalla en dos lugares: la del encargado de Fair Play (centroamericano-fair-play.html, sin cuenta,
 * con el QR que le da el árbitro principal) y la pestaña «Fair Play» de centroamericano-mesas.html (el árbitro
 * principal, que además crea y apaga los QR de los encargados). Todo pasa por la Edge Function
 * centroamericano-fair-play, que llama a la base diciendo quién es; el azar, los pesos y la regla contra el acoso
 * los pone la base. Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.
 *
 *   CentroamericanoFairPlay.iniciar({ raiz, token?, principal?, dentro?, visible? })
 *     raiz       el elemento donde se arma todo
 *     token      el del QR del encargado (sin token, la sesión del árbitro principal)
 *     principal  true: también la sección «Encargados de Fair Play»
 *     dentro     (tnr) → si la categoría es del modo que se está mirando (real o ensayo)
 *     visible    () → si la pantalla está a la vista (para no leer de más)
 *   CentroamericanoFairPlay.cargar()   vuelve a leer
 */
(function () {
    "use strict";

    const ESTADOS = { sorteada: "Sorteada: falta decidir", aprobada: "Aprobada: avisado su árbitro", descartada: "Descartada", revisada: "Revisada", sin_efecto: "Sin efecto" };
    const RESULTADOS = { sin_novedad: "Sin novedad", hallazgo: "Hallazgo (se informa al principal)", se_nego: "Se negó a la revisión", no_se_presento: "Se fue sin revisarse" };
    const NIVELES = { a_mirar: "A mirar", alta: "Muy alta" };
    const COLOR = { blancas: "Blancas", negras: "Negras" };
    const LEER_MS = 20000, ACTUALIZAR_MS = 120000;
    const VENCE_DEFECTO = "2026-11-10T05:59:59Z";   // el final del torneo, como los enlaces de los árbitros

    let ctx = null, datos = null, primera = true, ultimaActualizacion = 0;
    const vistasAlertas = new Set();
    let novedades = [];                 // lo que pasó desde que se abrió la pantalla (lo más nuevo arriba)
    const $ = (id) => document.getElementById(id);

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
    const avisar = (texto, error) => Avisos.avisar(texto, { tipo: error ? "error" : "ok" });
    const hora = (iso) => window.HoraCR.hora(iso);
    const nombreDe = (tnr) => ((datos && datos.rondas.find((r) => r.tnr === tnr)) || { nombre: tnr }).nombre;
    const uno = (x) => Number(x).toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const conElo = (nombre, elo) => (nombre || "—") + (elo ? " (" + elo + ")" : "");
    const clave = (a) => a.tnr + "|" + a.ronda + "|" + a.mesa + "|" + a.color;

    async function llamar(accion, cuerpo) {
        const body = Object.assign({ action: accion }, ctx.token ? { token: ctx.token } : {}, cuerpo || {});
        let { data, error } = await window.sb.functions.invoke("centroamericano-fair-play", { body });
        if (error && error.context && typeof error.context.json === "function") {
            try { const j = await error.context.json(); if (j && j.error) error = new Error(j.error); } catch (e) { /* sin cuerpo */ }
        }
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);
        return data || {};
    }

    // ---------------------------------------------------------------- el esqueleto (una sola vez)
    function armar() {
        ctx.raiz.replaceChildren(...[ // sin la sección de los QR (solo del principal): un null suelto se pintaría como texto
            el("div", { class: "cam-fp-barra" },
                el("p", { id: "fp-estado", class: "text-sm", role: "status" }),
                el("button", { type: "button", id: "fp-actualizar", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => actualizar(true) }, el("span", { "aria-hidden": "true", texto: "🔄" }), " Leer chess-results y Lichess ahora")),

            el("section", { id: "fp-novedades-caja", class: "cam-fp-novedades", "aria-labelledby": "fp-t-novedades", hidden: true },
                el("div", { class: "cam-fp-barra" },
                    el("h3", { id: "fp-t-novedades", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "🔔 " }), "Novedades ", el("span", { id: "fp-novedades-n", class: "cam-contador" })),
                    el("button", { type: "button", id: "fp-novedades-listo", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: limpiarNovedades }, "Ya las vi")),
                el("ul", { id: "fp-novedades", class: "cam-fp-novedades-lista", "aria-live": "polite" })),

            el("section", { class: "cam-fp-seccion", "aria-labelledby": "fp-t-alertas" },
                el("h3", { id: "fp-t-alertas", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "📈 " }), "Alertas de los tableros electrónicos ", el("span", { id: "fp-alertas-n", class: "cam-contador", hidden: true })),
                el("p", { class: "cam-herramientas-nota", texto: "Las partidas que se transmiten a Lichess, jugada por jugada: la precisión de cada jugador (la fórmula de Lichess, sin la apertura ni las posiciones ya decididas) contra la esperable para su Elo en este mismo torneo. Es una alerta para mirar, nunca una acusación: «Ya la miré» la cierra; «Seguirlo en los sorteos» hace que sus mesas salgan más seguido." }),
                el("p", { id: "fp-alertas-vacio", class: "cam-herramientas-nota", texto: "Ninguna partida se sale de lo esperable para el Elo de su jugador." }),
                el("h4", { id: "fp-t-acumulado", class: "cam-fp-subtitulo", hidden: true }, "Sumadas todas sus partidas del torneo"),
                el("p", { id: "fp-acumulado-nota", class: "cam-herramientas-nota", hidden: true, texto: "Quien juega un poco por encima de su nivel en cada ronda no salta en ninguna partida sola, pero sí en el conjunto: se suman sus partidas medidas en la categoría (dos partidas a 1,5 desviaciones dan 2,1)." }),
                el("div", { id: "fp-acumulado", class: "cam-fp-alertas" }),
                el("h4", { id: "fp-t-por-partida", class: "cam-fp-subtitulo", hidden: true }, "Partida por partida"),
                el("div", { id: "fp-alertas", class: "cam-fp-alertas" })),

            el("section", { class: "cam-fp-seccion", "aria-labelledby": "fp-t-sortear" },
                el("h3", { id: "fp-t-sortear", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "🎲 " }), "Sortear mesas"),
                el("p", { class: "cam-herramientas-nota" }, "Toda mesa puede salir; algunas salen más seguido (la diferencia de Elo, quien se levantó, una ilegal o irregularidad, quien le ganó a alguien mucho más fuerte, las alertas de los tableros): ninguna señal decide sola y el peso no pasa de 4. De la mesa que sale se revisa al ", el("strong", { texto: "ganador" }), " cuando termina la partida; si es tablas, al color sorteado. Quien se revisó no aplica en las 2 rondas siguientes y nadie pasa de 3 revisiones: si gana quien no aplica, la mesa queda sin efecto y su árbitro recibe el aviso."),
                el("div", { class: "cam-herramientas mt-2", role: "toolbar", "aria-label": "Sortear mesas" },
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Categoría" }), el("select", { id: "fp-categoria", class: "cam-select", onchange: () => verMesas() })),
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Mesas por categoría" }), el("select", { id: "fp-cantidad", class: "cam-select" }, [1, 2, 3, 4, 5].map((n) => el("option", { texto: String(n) })))),
                    el("button", { type: "button", id: "fp-sortear", class: "cam-btn cam-btn-chico", onclick: sortear }, el("span", { "aria-hidden": "true", texto: "🎲" }), " Sortear"),
                    el("button", { type: "button", id: "fp-ver-mesas", class: "cam-btn cam-btn-claro cam-btn-chico", "aria-expanded": "false", "aria-controls": "fp-mesas-caja", onclick: alternarMesas }, "Ver las mesas y su peso")),
                el("div", { id: "fp-mesas-caja", hidden: true },
                    el("p", { id: "fp-mesas-nota", class: "cam-herramientas-nota mt-2" }),
                    el("div", { class: "cam-tabla-envoltura mt-2" },
                        el("table", { class: "cam-tabla cam-rejilla" },
                            el("caption", { class: "sr-only", texto: "Las mesas de la categoría con su peso en el sorteo" }),
                            el("thead", {}, el("tr", {}, ["Mesa", "Blancas", "Negras", "Peso", "Por qué pesa", "Quién no aplica"].map((t) => el("th", { scope: "col", texto: t })))),
                            el("tbody", { id: "fp-mesas" }))))),

            el("section", { class: "cam-fp-seccion", "aria-labelledby": "fp-t-sorteadas" },
                el("h3", { id: "fp-t-sorteadas", class: "cam-subtitulo" }, "Mesas sorteadas", el("span", { id: "fp-resumen", class: "cam-subtitulo-nota" })),
                el("p", { class: "cam-herramientas-nota", texto: "¿Ya se revisó a alguien sin el sorteo (por ejemplo, en las rondas 1 y 2)? Anótalo a mano: cuenta para que esa persona descanse las 2 rondas siguientes y para el tope de 3 revisiones, y un hallazgo hace que sus mesas salgan más seguido." }),
                el("div", { class: "cam-herramientas mt-1", role: "toolbar", "aria-label": "Registro de Fair Play" },
                    el("button", { type: "button", id: "fp-manual", class: "cam-btn cam-btn-chico", onclick: anotarAMano }, el("span", { "aria-hidden": "true", texto: "✍ " }), "Anotar una revisión hecha a mano"),
                    el("button", { type: "button", id: "fp-pdf", class: "cam-btn cam-btn-chico", disabled: true, onclick: pdf }, "Bajar el registro en PDF"),
                    el("button", { type: "button", id: "fp-informe", class: "cam-btn cam-btn-chico", onclick: informe }, el("span", { "aria-hidden": "true", texto: "📄 " }), "Informe de Fair Play del torneo (PDF)")),
                el("p", { id: "fp-vacio", class: "cam-herramientas-nota", texto: "Todavía no se ha sorteado ninguna mesa." }),
                el("div", { class: "cam-tabla-envoltura mt-2" },
                    el("table", { class: "cam-tabla cam-rejilla" },
                        el("caption", { class: "sr-only", texto: "Las mesas sorteadas para Fair Play, con su estado" }),
                        el("thead", {}, el("tr", {}, ["Categoría", "Ronda", "Mesa", "Jugadores", "A quién se revisa", "Estado", "Qué hacer"].map((t) => el("th", { scope: "col", texto: t })))),
                        el("tbody", { id: "fp-lista" })))),

            ctx.principal ? el("section", { class: "cam-fp-seccion", "aria-labelledby": "fp-t-encargados" },
                el("h3", { id: "fp-t-encargados", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "🛡 " }), "Encargados de Fair Play"),
                el("p", { class: "cam-herramientas-nota", texto: "Cada encargado entra con su QR, sin cuenta, a su propia pantalla: ve SOLO lo de Fair Play y puede sortear, aprobar, descartar, anotar la revisión y mirar las alertas. Lo que hace queda con su nombre. Los árbitros de mesa no ven nada de esto: solo el aviso de su mesa." }),
                el("form", { id: "fp-form-enlace", class: "cam-herramientas mt-2", onsubmit: crearEnlace },
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Nombre del encargado" }), el("input", { id: "fp-enlace-nombre", class: "cam-select", maxlength: "80", required: true, autocomplete: "off" })),
                    el("button", { type: "submit", class: "cam-btn cam-btn-chico" }, "Crear su QR")),
                el("p", { id: "fp-enlaces-vacio", class: "cam-herramientas-nota", texto: "Todavía no hay encargados de Fair Play." }),
                el("div", { id: "fp-enlaces", class: "cam-fp-enlaces" })) : null,

            el("details", { class: "cam-fp-reglas mt-3" },
                el("summary", { texto: "Lo que pide FIDE para la revisión" }),
                el("ul", {},
                    el("li", {}, el("strong", { texto: "En privado y por alguien del mismo sexo" }), " (Leyes del Ajedrez, art. 11.3.3): la ropa, el bolso y lo que lleve el jugador. Solo entran quien revisa, el jugador y un testigo del mismo sexo; el jugador puede elegir un segundo testigo (con un menor, su mamá, su papá o su entrenador). El equipo de Fair Play de un abierto lleva al menos un hombre y una mujer."),
                    el("li", {}, el("strong", { texto: "Antes o apenas termina la partida" }), "; durante la partida, solo si la sospecha es muy fuerte o se pueden perder las pruebas (Manual del Árbitro de FIDE)."),
                    el("li", {}, el("strong", { texto: "No hace falta darle un motivo al jugador" }), ", pero las revisiones al azar tienen que estar ", el("strong", { texto: "anunciadas antes en las bases" }), " (Guías antitrampas de FIDE). Que se revisa al ganador y que nadie se puede ir sin revisarse también va en las bases: FIDE no lo fija."),
                    el("li", {}, el("strong", { texto: "Si se niega" }), ", o se va sin revisarse, el árbitro aplica el art. 12.9 (de la advertencia a perder la partida o la expulsión). Anótalo como «Se negó» o «Se fue sin revisarse», con lo que pasó."),
                    el("li", {}, el("strong", { texto: "Una precisión alta no prueba nada" }), ": es una razón para mirar con más cuidado, nunca para acusar. Cada revisión va al informe del torneo con su resultado, y todo lo de Fair Play es confidencial.")))].filter(Boolean));
    }

    // ---------------------------------------------------------------- leer y pintar
    async function cargar() {
        if (!ctx) return;
        try {
            const d = await llamar("leer");
            const dentro = ctx.dentro || (() => true);
            d.rondas = (d.rondas || []).filter((r) => dentro(r.tnr));
            const tnrs = new Set(d.rondas.map((r) => r.tnr));
            d.sorteos = (d.sorteos || []).filter((f) => tnrs.has(f.tnr));
            d.alertas = (d.alertas || []).filter((a) => tnrs.has(a.tnr));
            d.leidos = d.leidos || {};
            d.acumulado = (d.acumulado || []).filter((x) => tnrs.has(x.tnr));
            const nuevas = d.alertas.filter((a) => a.estado === "nueva" && a.nivel !== "normal" && !vistasAlertas.has(clave(a)));
            nuevas.forEach((a) => vistasAlertas.add(clave(a)));
            if (!primera) {
                const hay = novedadesEntre(datos, d, nuevas);
                if (hay.length) {
                    novedades = hay.concat(novedades).slice(0, 30);
                    if (navigator.vibrate) navigator.vibrate(hay.some((n) => n.fuerte) ? [250, 120, 250, 120, 250] : [150, 90, 150]);   // sin sonido: en un torneo no hay ruido
                }
            }
            primera = false;
            datos = d;
            pintarNovedades();
            pintar();
            if (ctx.principal) await cargarEnlaces();
        } catch (e) {
            $("fp-estado").textContent = "No se pudo leer: " + (e.message || e);
        }
    }

    // ---------------------------------------------------------------- las novedades (vibran; sin sonido)
    // Lo que cambió entre dos lecturas: una alerta nueva de los tableros, un acumulado que salta, el resultado que dice a
    // quién revisar, el árbitro que confirma que lo retuvo, una mesa que queda sin efecto y el aviso que su árbitro leyó.
    // «fuerte»: lo que pide moverse ya (ir a revisar a alguien).
    function novedadesEntre(antes, d, nuevas) {
        const out = [], ahora = new Date().toISOString();
        const de = (f) => nombreDe(f.tnr) + ", ronda " + f.ronda + ", mesa " + f.mesa;
        const quien = (f) => (f.revisar_color === "blancas" ? f.blancas : f.negras) || COLOR[f.revisar_color] || "el ganador";
        nuevas.forEach((a) => out.push({ hora: ahora, fuerte: a.nivel === "alta", texto: "📈 Precisión " + (NIVELES[a.nivel] || "").toLowerCase() + ": " + conElo(a.jugador, a.elo) + " (" + nombreDe(a.tnr) + ", ronda " + a.ronda + ", mesa " + a.mesa + ")." }));
        const acAntes = new Map(((antes && antes.acumulado) || []).map((x) => [x.tnr + "|" + x.clave, x]));
        (d.acumulado || []).forEach((x) => {
            const v = acAntes.get(x.tnr + "|" + x.clave);
            if (x.nivel !== "normal" && x.sin_mirar > 0 && (!v || v.nivel === "normal" || v.partidas < x.partidas)) out.push({ hora: ahora, fuerte: false, texto: "📈 Sumadas sus " + x.partidas + " partidas, " + conElo(x.jugador, x.elo) + " está muy por encima de lo esperable (" + nombreDe(x.tnr) + ")." });
        });
        const previos = new Map(((antes && antes.sorteos) || []).map((f) => [f.id, f]));
        (d.sorteos || []).forEach((f) => {
            const v = previos.get(f.id);
            if (!v) return;
            if (f.estado === "aprobada" && f.revisar_color && (v.revisar_color !== f.revisar_color || v.estado !== "aprobada")) out.push({ hora: ahora, fuerte: true, texto: "🛡 " + de(f) + ": terminó (" + (f.resultado_mesa || "") + "). Ve a revisar a " + quien(f) + "." });
            if (f.retenido_en && !v.retenido_en) out.push({ hora: f.retenido_en, fuerte: true, texto: "✋ " + (f.retenido_por || "Su árbitro") + " ya retuvo a " + quien(f) + " (" + de(f) + ")." });
            if (f.estado === "sin_efecto" && v.estado !== "sin_efecto") out.push({ hora: ahora, fuerte: false, texto: "⚪ " + de(f) + ": quedó sin efecto (" + (f.revisar_color ? "ganó " + quien(f) + ", que no aplica" : "no se jugó") + "). Su árbitro ya tiene el aviso." });
            if (f.aviso_id && d.leidos[f.aviso_id] && !(antes.leidos || {})[f.aviso_id]) out.push({ hora: d.leidos[f.aviso_id], fuerte: false, texto: "✓ " + (f.arbitro || "Su árbitro") + " leyó el aviso de la " + de(f) + "." });
        });
        return out;
    }

    function pintarNovedades() {
        $("fp-novedades-caja").hidden = novedades.length === 0;
        $("fp-novedades-n").textContent = String(novedades.length);
        $("fp-novedades").replaceChildren(...novedades.map((n) => el("li", { "data-fuerte": n.fuerte ? "si" : null }, el("span", { class: "cam-fp-de", texto: hora(n.hora) + " · " }), n.texto)));
        document.title = (novedades.length ? "(" + novedades.length + ") " : "") + document.title.replace(/^\(\d+\) /, "");
    }

    function limpiarNovedades() {
        novedades = [];
        pintarNovedades();
    }

    function pintar() {
        const d = datos;
        $("fp-estado").textContent = (d.nombre ? (ctx.token ? "Encargado: " : "") + d.nombre + " · " : "") + (d.actualizado ? "chess-results y Lichess leídos a las " + hora(d.actualizado) : "Todavía no se leyeron chess-results ni Lichess");
        const sel = $("fp-categoria"), antes = sel.value;
        sel.replaceChildren(el("option", { value: "", texto: "Todas las categorías (" + d.rondas.length + ")" }),
            ...d.rondas.map((r) => el("option", { value: r.tnr, texto: r.nombre + " — ronda " + r.ronda })));
        if ([...sel.options].some((o) => o.value === antes)) sel.value = antes;
        pintarAlertas();
        pintarSorteos();
        if (!$("fp-mesas-caja").hidden) verMesas();
    }

    function pintarAlertas() {
        const lista = [...datos.alertas].sort((a, b) => ((a.estado === "nueva" ? 0 : 1) - (b.estado === "nueva" ? 0 : 1)) || ((b.z || 0) - (a.z || 0)));
        const nuevas = lista.filter((a) => a.estado === "nueva").length;
        const pendientes = nuevas + (datos.acumulado || []).filter((x) => x.sin_mirar > 0).length;
        $("fp-alertas-n").hidden = pendientes === 0;
        $("fp-alertas-n").textContent = String(pendientes);
        const acum = [...(datos.acumulado || [])].sort((a, b) => ((a.sin_mirar > 0 ? 0 : 1) - (b.sin_mirar > 0 ? 0 : 1)) || (b.z - a.z));
        $("fp-alertas-vacio").hidden = lista.length > 0 || acum.length > 0;
        $("fp-t-acumulado").hidden = $("fp-acumulado-nota").hidden = acum.length === 0;
        $("fp-t-por-partida").hidden = acum.length === 0 || lista.length === 0;
        $("fp-acumulado").replaceChildren(...acum.map((x) => el("article", { class: "cam-fp-alerta", "data-nivel": x.nivel, "data-estado": x.sin_mirar > 0 ? "nueva" : x.seguir ? "seguir" : "vista", "data-acumulado": x.tnr + "|" + x.clave },
            el("p", { class: "cam-fp-alerta-titulo" },
                el("span", { class: "cam-chip", "data-estado": "fp-nivel-" + x.nivel, texto: NIVELES[x.nivel] || "Seguimiento" }), " ",
                el("strong", { texto: conElo(x.jugador, x.elo) }), " · " + nombreDe(x.tnr)),
            el("p", { texto: x.partidas + " partidas medidas (rondas " + x.rondas + ") · precisión media " + uno(x.precision_media) + " %" + (x.esperada_media != null ? ", la esperable para su Elo: " + uno(x.esperada_media) + " %" : "") + " · juntas, " + uno(x.z) + " desviaciones arriba" }),
            el("p", { class: "cam-fp-detalle", texto: x.sin_mirar > 0 ? x.sin_mirar + (x.sin_mirar === 1 ? " partida sin mirar" : " partidas sin mirar") + ": mientras tanto, sus mesas salen más seguido." : x.seguir ? "En seguimiento: sus mesas salen más seguido." : "Ya se miraron todas sus partidas." }),
            el("div", { class: "cam-fp-acciones" },
                x.sin_mirar > 0 || x.seguir ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "acumulado-vista", onclick: () => decidirAcumulado(x, "vista") }, "Ya lo miré") : null,
                !x.seguir ? el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "acumulado-seguir", onclick: () => decidirAcumulado(x, "seguir") }, "Seguirlo en los sorteos") : null))));
        $("fp-alertas").replaceChildren(...lista.map((a) => el("article", { class: "cam-fp-alerta", "data-nivel": a.nivel, "data-estado": a.estado, "data-clave": clave(a) },
            el("p", { class: "cam-fp-alerta-titulo" },
                el("span", { class: "cam-chip", "data-estado": "fp-nivel-" + a.nivel, texto: NIVELES[a.nivel] || "Seguimiento" }), " ",
                el("strong", { texto: conElo(a.jugador, a.elo) }), " (" + COLOR[a.color].toLowerCase() + ") contra " + conElo(a.rival, a.rival_elo)),
            el("p", { texto: nombreDe(a.tnr) + " · ronda " + a.ronda + ", mesa " + a.mesa + " · resultado " + (a.resultado || "—") }),
            el("p", { texto: "Precisión " + uno(a.precision) + " % en " + a.jugadas + " jugadas" + (a.esperada != null ? " · la esperable para su Elo: " + uno(a.esperada) + " %" : "") + (a.z != null ? " · " + uno(a.z) + " desviaciones arriba" : "") + " · pérdida media " + Math.round(Number(a.acpl)) + " centipeones" }),
            a.nota || a.vista_por_nombre ? el("p", { class: "cam-fp-detalle", texto: (a.estado === "seguir" ? "En seguimiento" : "Mirada") + (a.vista_por_nombre ? " por " + a.vista_por_nombre : "") + (a.vista_en ? " a las " + hora(a.vista_en) : "") + (a.nota ? ": " + a.nota : "") }) : null,
            el("div", { class: "cam-fp-acciones" },
                a.partida_url ? el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: a.partida_url, target: "_blank", rel: "noopener" }, "Ver la partida en Lichess") : null,
                a.estado !== "vista" ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "vista", onclick: () => decidirAlerta(a, "vista") }, "Ya la miré") : null,
                a.estado !== "seguir" ? el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "seguir", onclick: () => decidirAlerta(a, "seguir") }, "Seguirlo en los sorteos") : null))));
    }

    function pintarSorteos() {
        const orden = (tnr) => datos.rondas.findIndex((r) => r.tnr === tnr);
        const lista = [...datos.sorteos].sort((a, b) => (b.ronda - a.ronda) || (orden(a.tnr) - orden(b.tnr)) || (a.mesa - b.mesa));
        $("fp-vacio").hidden = lista.length > 0;
        $("fp-pdf").disabled = lista.length === 0;
        $("fp-resumen").textContent = lista.length ? " — " + lista.length + (lista.length === 1 ? " mesa sorteada" : " mesas sorteadas") + " · " + lista.filter((f) => f.estado === "sorteada").length + " por decidir · " + lista.filter((f) => f.estado === "aprobada").length + " por revisar" : "";
        $("fp-lista").replaceChildren(...lista.map((f) => {
            const leido = f.aviso_id ? datos.leidos[f.aviso_id] : null;
            const quien = f.revisar_color ? ((f.revisar_color === "blancas" ? f.blancas : f.negras) || COLOR[f.revisar_color]) : null;
            const aQuien = f.estado === "revisada" ? (f.jugador || "—")
                : f.estado === "sin_efecto" ? (quien ? "Ganó " + quien + ", que no aplica" : "Nadie (no se jugó)")
                    : quien ? quien + " (" + COLOR[f.revisar_color].toLowerCase() + ")"
                        : "El ganador · si es tablas: " + COLOR[f.color_si_tablas];
            const detalle = f.estado === "descartada" ? "Motivo: " + (f.motivo || "")
                : f.estado === "revisada" ? (RESULTADOS[f.resultado] || "") + (f.nota ? " · " + f.nota : "") + (f.revisada_por_nombre ? " · " + f.revisada_por_nombre : "")
                    : f.estado === "aprobada" ? (leido ? "✓ " + (f.arbitro || "Su árbitro") + " lo leyó a las " + hora(leido) : "⏳ " + (f.arbitro || "Su árbitro") + " todavía no lo ha leído")
                        + (f.revisar_color ? (f.retenido_en ? " · ✋ Retenido a las " + hora(f.retenido_en) + (f.retenido_por ? " (" + f.retenido_por + ")" : "") : " · ⏳ Terminó: falta que su árbitro confirme que lo retuvo") : "")
                        : f.estado === "sin_efecto" ? "Su árbitro ya recibió el aviso" : "";
            const acciones = f.estado === "sorteada"
                ? [el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "aprobar", onclick: () => aprobar(f) }, "Aprobar y avisar a su árbitro"),
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "descartar", onclick: () => descartar(f) }, "Descartar")]
                : f.estado === "aprobada" || f.estado === "revisada"
                    ? [el("button", { type: "button", class: "cam-btn cam-btn-chico" + (f.estado === "revisada" ? " cam-btn-claro" : ""), "data-accion": "revisar", onclick: () => revisar(f) }, f.estado === "revisada" ? "Corregir la revisión" : "Anotar la revisión")]
                    : [];
            return el("tr", { "data-id": f.id, "data-estado": f.estado },
                el("td", { texto: nombreDe(f.tnr) }),
                el("td", { texto: String(f.ronda) }),
                el("td", {}, el("strong", { texto: "Mesa " + f.mesa }),
                    f.origen === "manual" ? el("span", { class: "cam-fp-detalle", texto: "Anotada a mano por " + (f.sorteada_por || "—") })
                        : [el("span", { class: "cam-fp-de", texto: " (de " + f.mesas_en_sorteo + ", peso " + Number(f.peso || 1).toLocaleString("es-CR") + ")" }),
                            f.motivos && f.motivos.length ? el("span", { class: "cam-fp-detalle", texto: f.motivos.join(" · ") }) : null]),
                el("td", {}, el("span", { class: "cam-fp-detalle", texto: "Blancas: " + conElo(f.blancas, f.elo_b) }), el("span", { class: "cam-fp-detalle", texto: "Negras: " + conElo(f.negras, f.elo_n) }),
                    f.no_aplica ? el("span", { class: "cam-fp-detalle cam-fp-no-aplica", texto: "⚠ " + f.no_aplica }) : null),
                el("td", { texto: aQuien }),
                el("td", {}, el("span", { class: "cam-chip", "data-estado": "fp-" + f.estado, texto: ESTADOS[f.estado] || f.estado }), detalle ? el("span", { class: "cam-fp-detalle", texto: detalle }) : null),
                el("td", {}, acciones.length ? el("div", { class: "cam-fp-acciones" }, ...acciones) : null));
        }));
    }

    function alternarMesas() {
        const caja = $("fp-mesas-caja"), abrir = caja.hidden;
        caja.hidden = !abrir;
        $("fp-ver-mesas").setAttribute("aria-expanded", abrir ? "true" : "false");
        if (abrir) verMesas();
    }

    async function verMesas() {
        if ($("fp-mesas-caja").hidden || !datos) return;
        const tnr = $("fp-categoria").value || (datos.rondas[0] || {}).tnr;
        const r = datos.rondas.find((x) => x.tnr === tnr);
        if (!r) { $("fp-mesas").replaceChildren(); $("fp-mesas-nota").textContent = "No hay categorías con árbitros."; return; }
        $("fp-mesas-nota").textContent = "Cargando las mesas de " + r.nombre + "…";
        try {
            const { mesas } = await llamar("candidatas", { tnr, ronda: r.ronda });
            const entran = mesas.filter((m) => !m.excluida), suma = entran.reduce((s, m) => s + Number(m.peso), 0);
            $("fp-mesas-nota").textContent = r.nombre + ", ronda " + r.ronda + ": " + entran.length + " de " + mesas.length + " mesas entran al sorteo. La probabilidad de cada una es su peso entre " + suma.toLocaleString("es-CR") + ".";
            $("fp-mesas").replaceChildren(...mesas.map((m) => el("tr", { "data-mesa": String(m.mesa), "data-excluida": m.excluida ? "si" : null },
                el("td", { texto: String(m.mesa) }),
                el("td", { texto: conElo(m.blancas, m.elo_b) }),
                el("td", { texto: conElo(m.negras, m.elo_n) }),
                el("td", { texto: m.excluida ? "—" : Number(m.peso).toLocaleString("es-CR") + " (" + Math.round(100 * Number(m.peso) / (suma || 1)) + " %)" }),
                el("td", { texto: m.excluida || (m.motivos.length ? m.motivos.join(" · ") : "—") }),
                el("td", { texto: m.no_aplica || "—" }))));
        } catch (e) { $("fp-mesas-nota").textContent = "No se pudieron leer las mesas: " + (e.message || e); }
    }

    // ---------------------------------------------------------------- lo que se decide
    async function sortear() {
        const tnr = $("fp-categoria").value;
        const cats = tnr ? datos.rondas.filter((r) => r.tnr === tnr) : datos.rondas;
        const cantidad = Number($("fp-cantidad").value) || 1;
        if (!cats.length) { avisar("No hay categorías con árbitros: primero se crean sus enlaces en «Árbitros y mesas».", true); return; }
        const porRonda = new Map();
        cats.forEach((r) => { if (!porRonda.has(r.ronda)) porRonda.set(r.ronda, []); porRonda.get(r.ronda).push(r.tnr); });
        const rondas = [...porRonda.keys()].sort((a, b) => a - b);
        const ok = await Avisos.confirmar(
            "Se van a sortear " + cantidad + (cantidad === 1 ? " mesa" : " mesas") + " en " + (cats.length === 1 ? cats[0].nombre : cats.length + " categorías") + " (ronda " + rondas.join(" y ") + "). El sorteo lo hace la base y queda anotado con tu nombre y la hora: una mesa que sale no vuelve a salir en esta ronda, y descartarla pide un motivo. Todavía no se avisa a nadie: eso pasa cuando lo apruebes.",
            { titulo: "Sortear mesas para Fair Play", aceptar: "🎲 Sortear" });
        if (!ok) return;
        $("fp-sortear").disabled = true;
        let salieron = 0;
        try {
            for (const r of rondas) salieron += ((await llamar("sortear", { ronda: r, tnrs: porRonda.get(r), cantidad })).sorteos || []).length;
            avisar(salieron ? "Salieron " + salieron + (salieron === 1 ? " mesa" : " mesas") + ". Revísalas y aprueba las que van." : "No quedaba ninguna mesa por sortear en esa ronda.", !salieron);
        } catch (e) { avisar("No se pudo sortear: " + (e.message || e), true); }
        finally { $("fp-sortear").disabled = false; await cargar(); }
    }

    async function aprobar(f) {
        const ok = await Avisos.confirmar("Le llega un aviso al árbitro de la mesa " + f.mesa + " de " + nombreDe(f.tnr) + ": que cuando termine la partida retenga al ganador (si es tablas, a quien jugó con " + COLOR[f.color_si_tablas].toLowerCase() + ") y no lo deje salir del local hasta que llegues. Su mesa se le marca con un borde dorado." + (f.no_aplica ? " Ojo: " + f.no_aplica + "; si gana esa persona, la mesa queda sin efecto y su árbitro recibe el aviso." : ""),
            { titulo: "Aprobar la mesa " + f.mesa, aceptar: "Aprobar y avisar" });
        if (!ok) return;
        try { await llamar("aprobar", { id: f.id }); avisar("Listo: el árbitro de la mesa " + f.mesa + " ya tiene el aviso."); }
        catch (e) { avisar("No se pudo aprobar: " + (e.message || e), true); }
        await cargar();
    }

    async function descartar(f) {
        const motivo = await Avisos.pedir("La mesa " + f.mesa + " no vuelve a salir en esta ronda. ¿Por qué se descarta? (queda anotado)", { titulo: "Descartar la mesa " + f.mesa, etiqueta: "Motivo", aceptar: "Descartar" });
        if (motivo === null) return;
        if (!String(motivo).trim()) { avisar("Para descartar hace falta el motivo.", true); return; }
        try { await llamar("descartar", { id: f.id, motivo: String(motivo).trim() }); }
        catch (e) { avisar("No se pudo descartar: " + (e.message || e), true); }
        await cargar();
    }

    async function revisar(f) {
        const opciones = [];
        if (f.blancas) opciones.push(["blancas", f.blancas + " (blancas)"]);
        if (f.negras) opciones.push(["negras", f.negras + " (negras)"]);
        const campos = [{ nombre: "resultado", etiqueta: "Cómo terminó", tipo: "select", valor: f.resultado || "sin_novedad", opciones: Object.entries(RESULTADOS) }];
        if (opciones.length) campos.push({ nombre: "color", etiqueta: "A quién se revisó", tipo: "select", valor: f.jugador_color || f.revisar_color || f.color_si_tablas, opciones });
        else campos.push({ nombre: "jugador", etiqueta: "A quién se revisó", tipo: "text", valor: f.jugador || "", max: 120 });
        campos.push({ nombre: "nota", etiqueta: "Qué pasó (obligatorio si no fue «Sin novedad»)", tipo: "textarea", valor: f.nota || "", max: 500 });
        const r = await Avisos.formulario({ titulo: "Revisión de la mesa " + f.mesa + " (" + nombreDe(f.tnr) + ", ronda " + f.ronda + ")", texto: "Se revisa al ganador; si fue tablas, a quien jugó con " + COLOR[f.color_si_tablas].toLowerCase() + ".", campos, aceptar: "Guardar la revisión" });
        if (!r) return;
        try { await llamar("revisar", { id: f.id, resultado: r.resultado, color: r.color || null, jugador: r.jugador || null, nota: r.nota }); avisar("Revisión de la mesa " + f.mesa + " guardada."); }
        catch (e) { avisar("No se pudo guardar: " + (e.message || e), true); }
        await cargar();
    }

    // Una revisión ya hecha sin sorteo (las de las rondas 1 y 2): primero la categoría, la ronda y la mesa; después, con
    // los dos jugadores de esa mesa leídos de chess-results, a quién se revisó, cómo terminó y qué pasó.
    async function anotarAMano() {
        if (!datos || !datos.rondas.length) { avisar("No hay categorías con árbitros.", true); return; }
        const tope = Math.max(...datos.rondas.map((r) => r.ronda));
        const a = await Avisos.formulario({
            titulo: "Anotar una revisión hecha a mano",
            texto: "¿En qué categoría, ronda y mesa fue?",
            campos: [
                { nombre: "tnr", etiqueta: "Categoría", tipo: "select", valor: $("fp-categoria").value || datos.rondas[0].tnr, opciones: datos.rondas.map((r) => [r.tnr, r.nombre]) },
                { nombre: "ronda", etiqueta: "Ronda", tipo: "select", valor: String(Math.max(1, tope - 1)), opciones: Array.from({ length: tope }, (_, i) => [String(i + 1), "Ronda " + (i + 1)]) },
                { nombre: "mesa", etiqueta: "Mesa", tipo: "text", inputmode: "numeric", valor: "", max: 4 },
            ],
            aceptar: "Buscar la mesa",
        });
        if (!a) return;
        const mesa = parseInt(a.mesa, 10), ronda = Number(a.ronda);
        if (!Number.isInteger(mesa) || mesa < 1) { avisar("Escribe el número de la mesa.", true); return; }
        let pareo = null;
        try { pareo = (await llamar("pareo", { tnr: a.tnr, ronda, mesa })).pareo; } catch (e) { /* sin pareo leído: se escribe el nombre */ }
        const campos = [];
        if (pareo && pareo.blancas) {
            campos.push({ nombre: "color", etiqueta: "A quién se revisó", tipo: "select", valor: "blancas",
                opciones: [["blancas", conElo(pareo.blancas, pareo.elo_b) + " (blancas)"]].concat(pareo.negras ? [["negras", conElo(pareo.negras, pareo.elo_n) + " (negras)"]] : []) });
        } else {
            campos.push({ nombre: "jugador", etiqueta: "Nombre del jugador revisado", tipo: "text", valor: "", max: 120 },
                { nombre: "color", etiqueta: "Jugaba con", tipo: "select", valor: "blancas", opciones: [["blancas", "Blancas"], ["negras", "Negras"]] });
        }
        campos.push({ nombre: "resultado", etiqueta: "Cómo terminó", tipo: "select", valor: "sin_novedad", opciones: Object.entries(RESULTADOS) },
            { nombre: "nota", etiqueta: "Qué pasó (obligatorio si no fue «Sin novedad»)", tipo: "textarea", valor: "", max: 500 });
        const b = await Avisos.formulario({
            titulo: nombreDe(a.tnr) + ", ronda " + ronda + ", mesa " + mesa,
            texto: pareo ? "Los jugadores salen de los emparejamientos de chess-results." : "No se encontraron los emparejamientos de esa mesa: escribe el nombre como aparece en chess-results.",
            campos, aceptar: "Guardar la revisión",
        });
        if (!b) return;
        try {
            await llamar("manual", { tnr: a.tnr, ronda, mesa, color: b.color, resultado: b.resultado, jugador: b.jugador || null, nota: b.nota || null });
            avisar("Revisión de la mesa " + mesa + " (ronda " + ronda + ") anotada: ya cuenta para los sorteos.");
        } catch (e) { avisar("No se pudo anotar: " + (e.message || e), true); }
        await cargar();
    }

    async function decidirAlerta(a, estado) {
        const nota = await Avisos.pedir(estado === "seguir" ? "Sus mesas van a salir más seguido en los sorteos siguientes. Si quieres, anota por qué." : "Queda como mirada. Si quieres, anota qué viste.", { titulo: conElo(a.jugador, a.elo), etiqueta: "Nota (opcional)", aceptar: estado === "seguir" ? "Seguirlo" : "Marcar como mirada" });
        if (nota === null) return;
        try { await llamar("alerta", { tnr: a.tnr, ronda: a.ronda, mesa: a.mesa, color: a.color, estado, nota: String(nota).trim() || null }); }
        catch (e) { avisar("No se pudo guardar: " + (e.message || e), true); }
        await cargar();
    }

    async function decidirAcumulado(x, estado) {
        const nota = await Avisos.pedir(estado === "seguir" ? "Todas sus partidas medidas quedan en seguimiento: sus mesas van a salir más seguido. Si quieres, anota por qué." : "Todas sus partidas medidas quedan como miradas. Si quieres, anota qué viste.", { titulo: conElo(x.jugador, x.elo), etiqueta: "Nota (opcional)", aceptar: estado === "seguir" ? "Seguirlo" : "Marcar como mirado" });
        if (nota === null) return;
        try { await llamar("acumulado", { tnr: x.tnr, clave: x.clave, estado, nota: String(nota).trim() || null }); }
        catch (e) { avisar("No se pudo guardar: " + (e.message || e), true); }
        await cargar();
    }

    async function actualizar(aMano) {
        ultimaActualizacion = Date.now();
        if (aMano) $("fp-actualizar").disabled = true;
        try {
            const r = await llamar("actualizar");
            if (aMano) avisar(r.saltado ? "Ya se leyó hace menos de un minuto y medio: se muestra eso." : "Leídos: " + r.pareos + " mesas de chess-results y " + r.analizadas + " jugadores de Lichess." + (r.errores && r.errores.length ? " Hubo " + r.errores.length + " problemas: " + r.errores[0] : ""), !!(r.errores && r.errores.length && !r.analizadas));
        } catch (e) { if (aMano) avisar("No se pudo leer: " + (e.message || e), true); }
        finally { if (aMano) $("fp-actualizar").disabled = false; await cargar(); }
    }

    async function pdf() {
        const orden = (tnr) => datos.rondas.findIndex((r) => r.tnr === tnr);
        const lista = [...datos.sorteos].sort((a, b) => (a.ronda - b.ronda) || (orden(a.tnr) - orden(b.tnr)) || (a.mesa - b.mesa));
        try {
            const blob = await window.ReportePDF.generar({
                titulo: "Fair Play: mesas sorteadas — Centroamericano 2026",
                subtitulo: window.HoraCR.fechaHora(new Date()),
                pie: "Centroamericano 2026 · ajedrez-integral.com · Documento confidencial del equipo de Fair Play",
                bloques: [{ tipo: "tabla", encabezados: ["Categoría", "Ronda", "Mesa", "Peso y por qué", "Jugadores", "Estado", "Sorteó / decidió", "Resultado o motivo"], anchos: [1.4, 0.5, 0.7, 2, 2.2, 1, 1.5, 2.4],
                    filas: lista.map((f) => [nombreDe(f.tnr), String(f.ronda), f.mesa + " de " + f.mesas_en_sorteo, Number(f.peso || 1) + (f.motivos && f.motivos.length ? ": " + f.motivos.join("; ") : ""),
                        conElo(f.blancas, f.elo_b) + " – " + conElo(f.negras, f.elo_n) + (f.no_aplica ? " (" + f.no_aplica + ")" : ""), ESTADOS[f.estado] || f.estado,
                        (f.sorteada_por || "—") + (f.decidida_por_nombre ? " / " + f.decidida_por_nombre : ""),
                        f.estado === "descartada" ? "Descartada: " + (f.motivo || "") : f.estado === "revisada" ? (RESULTADOS[f.resultado] || "") + (f.jugador ? " · " + f.jugador : "") + (f.nota ? " · " + f.nota : "") : f.estado === "sin_efecto" ? "Ganó quien no aplicaba" : "—"]) }],
                fotos: [],
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = "fair-play-centroamericano-2026.pdf";
            document.body.append(a); a.click(); a.remove();
        } catch (e) { avisar("No se pudo armar el PDF: " + (e.message || e), true); }
    }

    // El informe de Fair Play del torneo, para el árbitro principal y el acta (y, si hace falta, la Comisión de Fair
    // Play de FIDE): las cifras, categoría por categoría, cada revisión con su resultado y las alertas con lo que se
    // decidió. Confidencial: los nombres van porque el informe es del equipo de Fair Play y del principal.
    async function informe() {
        if (!datos) return;
        const orden = (tnr) => datos.rondas.findIndex((r) => r.tnr === tnr);
        const todos = [...datos.sorteos].sort((a, b) => (a.ronda - b.ronda) || (orden(a.tnr) - orden(b.tnr)) || (a.mesa - b.mesa));
        const cuenta = (lista, estado) => lista.filter((f) => f.estado === estado).length;
        const sorteo = todos.filter((f) => f.origen !== "manual");
        const revisadas = todos.filter((f) => f.estado === "revisada");
        const porResultado = Object.keys(RESULTADOS).map((k) => RESULTADOS[k] + ": " + revisadas.filter((f) => f.resultado === k).length);
        const alertas = [...datos.alertas].sort((a, b) => (a.ronda - b.ronda) || (orden(a.tnr) - orden(b.tnr)) || (a.mesa - b.mesa));
        const decision = (a) => a.estado === "seguir" ? "En seguimiento" : a.estado === "vista" ? "Mirada" : "Sin mirar";
        const bloques = [
            { tipo: "titulo", texto: "Resumen" },
            { tipo: "lista", items: [
                "Mesas sorteadas: " + sorteo.length + " (aprobadas y avisadas a su árbitro: " + sorteo.filter((f) => f.estado !== "sorteada" && f.estado !== "descartada").length + "; descartadas con su motivo: " + cuenta(sorteo, "descartada") + "; por decidir: " + cuenta(sorteo, "sorteada") + ").",
                "Revisiones hechas: " + revisadas.length + " (" + porResultado.join("; ") + ")" + (todos.some((f) => f.origen === "manual") ? ", de ellas " + todos.filter((f) => f.origen === "manual").length + " anotadas a mano (sin sorteo)" : "") + ".",
                "Mesas sin efecto (ganó quien no aplicaba, o no se jugó): " + cuenta(todos, "sin_efecto") + ". Por revisar todavía: " + cuenta(todos, "aprobada") + ".",
                "Alertas de los tableros electrónicos: " + alertas.length + " partidas (" + alertas.filter((a) => a.estado === "vista").length + " miradas, " + alertas.filter((a) => a.estado === "seguir").length + " en seguimiento, " + alertas.filter((a) => a.estado === "nueva").length + " sin mirar)" + ((datos.acumulado || []).length ? "; " + datos.acumulado.length + " jugadores por encima de lo esperable sumando sus partidas" : "") + ".",
            ] },
            { tipo: "titulo", texto: "Por categoría" },
            { tipo: "tabla", encabezados: ["Categoría", "Ronda actual", "Sorteadas", "Revisadas", "Sin efecto", "Descartadas", "Por revisar", "Alertas"], anchos: [2.2, 0.9, 0.9, 0.9, 0.9, 1, 0.9, 0.9],
                filas: datos.rondas.map((r) => { const de = todos.filter((f) => f.tnr === r.tnr); return [r.nombre, String(r.ronda), String(de.filter((f) => f.origen !== "manual").length), String(cuenta(de, "revisada")), String(cuenta(de, "sin_efecto")), String(cuenta(de, "descartada")), String(cuenta(de, "aprobada")), String(alertas.filter((a) => a.tnr === r.tnr).length)]; }) },
            { tipo: "titulo", texto: "Las revisiones" },
            revisadas.length ? { tipo: "tabla", encabezados: ["Ronda", "Categoría", "Mesa", "Jugador revisado", "Resultado", "Qué pasó", "Retenido por", "Revisó"], anchos: [0.6, 1.5, 0.6, 1.8, 1.3, 2.4, 1.4, 1.4],
                filas: revisadas.map((f) => [String(f.ronda), nombreDe(f.tnr), String(f.mesa) + (f.origen === "manual" ? " (a mano)" : ""), f.jugador || "—", RESULTADOS[f.resultado] || "", f.nota || "—", f.retenido_por ? f.retenido_por + " · " + hora(f.retenido_en) : "—", f.revisada_por_nombre || "—"]) }
                : { tipo: "parrafo", texto: "Todavía no se ha revisado a nadie." },
            { tipo: "titulo", texto: "Las mesas que no llegaron a revisión" },
            todos.some((f) => f.estado === "descartada" || f.estado === "sin_efecto") ? { tipo: "tabla", encabezados: ["Ronda", "Categoría", "Mesa", "Qué pasó", "Decidió"], anchos: [0.6, 1.6, 0.6, 4, 1.6],
                filas: todos.filter((f) => f.estado === "descartada" || f.estado === "sin_efecto").map((f) => [String(f.ronda), nombreDe(f.tnr), String(f.mesa), f.estado === "descartada" ? "Descartada: " + (f.motivo || "") : "Sin efecto: " + (f.revisar_color ? "ganó " + ((f.revisar_color === "blancas" ? f.blancas : f.negras) || COLOR[f.revisar_color]) + ", que no aplicaba (" + (f.no_aplica || "ya se había revisado") + ")" : "no se jugó"), f.decidida_por_nombre || "—"]) }
                : { tipo: "parrafo", texto: "Ninguna." },
            { tipo: "titulo", texto: "Alertas de los tableros electrónicos" },
            { tipo: "nota", texto: "La precisión de cada jugador en las partidas transmitidas, contra la esperable para su Elo en el mismo torneo. Una alerta es una razón para mirar con más cuidado, nunca una prueba ni una acusación." },
            (datos.acumulado || []).length ? { tipo: "tabla", encabezados: ["Jugador", "Categoría", "Partidas (rondas)", "Precisión media", "Esperable", "Desviaciones", "Decisión"], anchos: [2, 1.5, 1.3, 1, 1, 1, 1.3],
                filas: datos.acumulado.map((x) => [conElo(x.jugador, x.elo), nombreDe(x.tnr), x.partidas + " (" + x.rondas + ")", uno(x.precision_media) + " %", x.esperada_media != null ? uno(x.esperada_media) + " %" : "—", uno(x.z), x.sin_mirar > 0 ? "Sin mirar" : x.seguir ? "En seguimiento" : "Mirado"]) } : null,
            alertas.length ? { tipo: "tabla", encabezados: ["Ronda", "Categoría", "Mesa", "Jugador", "Precisión", "Esperable", "Desviaciones", "Decisión y nota"], anchos: [0.6, 1.4, 0.6, 2, 0.9, 0.9, 0.9, 2.4],
                filas: alertas.map((a) => [String(a.ronda), nombreDe(a.tnr), String(a.mesa), conElo(a.jugador, a.elo) + " (" + COLOR[a.color].toLowerCase() + ")", uno(a.precision) + " %", a.esperada != null ? uno(a.esperada) + " %" : "—", a.z != null ? uno(a.z) : "—", decision(a) + (a.vista_por_nombre ? " (" + a.vista_por_nombre + ")" : "") + (a.nota ? ": " + a.nota : "")]) }
                : { tipo: "parrafo", texto: "Ninguna partida se salió de lo esperable." },
            { tipo: "separador" },
            { tipo: "nota", texto: "Cómo se trabajó: las mesas se sortean por categoría con un peso que ninguna señal decide sola (tope 4); de la mesa sorteada se revisa al ganador (en tablas, al color sorteado), en privado y por alguien del mismo sexo (Leyes del Ajedrez, art. 11.3.3). Quien se revisó no aplica en las 2 rondas siguientes y nadie pasa de 3 revisiones. Todo queda anotado con quién y cuándo. Documento confidencial del equipo de Fair Play y del árbitro principal." },
        ].filter(Boolean);
        try {
            const blob = await window.ReportePDF.generar({
                titulo: "Informe de Fair Play — Centroamericano 2026",
                subtitulo: "Al " + window.HoraCR.fechaHora(new Date()) + (datos.nombre ? " · lo bajó " + datos.nombre : ""),
                pie: "Centroamericano 2026 · ajedrez-integral.com · Documento confidencial del equipo de Fair Play",
                bloques, fotos: [],
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = "informe-fair-play-centroamericano-2026.pdf";
            document.body.append(a); a.click(); a.remove();
        } catch (e) { avisar("No se pudo armar el informe: " + (e.message || e), true); }
    }

    // ---------------------------------------------------------------- los QR de los encargados (solo el principal)
    async function cargarEnlaces() {
        const { data, error } = await window.sb.from("centroamericano_fp_enlaces").select("id, token, nombre, vence, revocada, creada, ultimo_uso").order("creada", { ascending: true }).range(0, 199);
        if (error) return;
        const base = location.origin + location.pathname.replace(/[^/]*$/, "") + "centroamericano-fair-play.html#";
        const vivos = (data || []).filter((x) => !x.revocada);
        $("fp-enlaces-vacio").hidden = vivos.length > 0;
        $("fp-enlaces").replaceChildren(...vivos.map((x) => {
            const url = base + x.token;
            return el("article", { class: "cam-fp-enlace", "data-id": x.id },
                el("div", {},
                    el("p", { class: "font-bold", texto: x.nombre }),
                    el("p", { class: "cam-fp-detalle", texto: x.ultimo_uso ? "Entró por última vez a las " + hora(x.ultimo_uso) : "Todavía no ha entrado" }),
                    el("div", { class: "cam-fp-acciones mt-1" },
                        el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "copiar", onclick: () => { navigator.clipboard.writeText(url).then(() => avisar("Enlace de " + x.nombre + " copiado.")).catch(() => avisar(url)); } }, "Copiar el enlace"),
                        el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: "https://wa.me/?text=" + encodeURIComponent("Tu pantalla de Fair Play del Centroamericano 2026 (no la compartas): " + url), target: "_blank", rel: "noopener" }, "Mandar por WhatsApp"),
                        el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "apagar", onclick: () => apagarEnlace(x) }, "Apagar"))),
                window.QrSvg ? window.QrSvg.dibujar(url, "QR de Fair Play de " + x.nombre, { marca: true }) : null);
        }));
    }

    async function crearEnlace(e) {
        e.preventDefault();
        const nombre = $("fp-enlace-nombre").value.trim();
        if (!nombre) return;
        const { error } = await window.sb.from("centroamericano_fp_enlaces").insert({ nombre, vence: VENCE_DEFECTO });
        if (error) { avisar("No se pudo crear: " + error.message, true); return; }
        $("fp-enlace-nombre").value = "";
        avisar("Listo: el QR de " + nombre + " está abajo. Con él entra a su pantalla de Fair Play, sin cuenta.");
        await cargarEnlaces();
    }

    async function apagarEnlace(x) {
        const ok = await Avisos.confirmar("El QR de " + x.nombre + " deja de funcionar ya. Lo que hizo queda en el registro.", { titulo: "Apagar el QR de " + x.nombre, aceptar: "Apagar", peligro: true });
        if (!ok) return;
        const { error } = await window.sb.from("centroamericano_fp_enlaces").update({ revocada: true }).eq("id", x.id);
        if (error) avisar("No se pudo apagar: " + error.message, true);
        await cargarEnlaces();
    }

    // ---------------------------------------------------------------- arranque
    function iniciar(c) {
        ctx = c;
        armar();
        cargar();
        setInterval(() => {
            if (ctx.visible && !ctx.visible()) return;
            if (Date.now() - ultimaActualizacion > ACTUALIZAR_MS) actualizar(false); else cargar();
        }, LEER_MS);
    }

    window.CentroamericanoFairPlay = { iniciar, cargar, ESTADOS, RESULTADOS };
})();
