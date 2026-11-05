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
 *     nodos      cuánto piensa Stockfish en cada posición (por omisión NODOS)
 *
 * Las partidas de los tableros electrónicos salen directo de LiveChess (sin atraso), y LiveChess no trae la evaluación:
 * mientras esta pantalla esté abierta, Stockfish las analiza AQUÍ, en esta computadora, una por una apenas terminan
 * («vivo_pendientes» → evaluar cada posición → «vivo_guardar»). La precisión la calcula la función con la fórmula de
 * siempre. Ver «Las partidas para Fair Play, directo de LiveChess» en docs/decisiones/juegos-y-torneos.md.
 *   CentroamericanoFairPlay.cargar()   vuelve a leer
 */
(function () {
    "use strict";

    const ESTADOS = { sorteada: "Sorteada: falta decidir", aprobada: "Aprobada: avisado su árbitro", descartada: "Descartada", revisada: "Revisada", sin_efecto: "Sin efecto" };
    const RESULTADOS = { sin_novedad: "Sin novedad", hallazgo: "Hallazgo (se informa al principal)", se_nego: "Se negó a la revisión", no_se_presento: "Se fue sin revisarse" };
    const NIVELES = { a_mirar: "A mirar", alta: "Muy alta" };
    const COLOR = { blancas: "Blancas", negras: "Negras" };
    const LEER_MS = 20000, ACTUALIZAR_MS = 120000;
    const VENCE_DIAS = 10;             // un QR de encargado dura 10 días (lo que dura un evento); se apaga antes a mano
    const MOTOR_URL = "js/vendor/stockfish/stockfish-nnue-16-single.js";   // las dos pantallas están en la raíz del sitio
    const NODOS = 150000;              // sin profundidad fija: cuánto piensa en cada posición
    const TOPE_NODOS = 800000;         // con profundidad fija, el tope por si una posición se complica mucho
    const NO_SIGNIFICA = "Una alerta no prueba que haya trampa. Un jugador puede estar en un gran día, haber preparado la apertura o ser más fuerte que su Elo (sobre todo un niño que mejora rápido), y en un torneo grande algunos salen altos por pura casualidad. Para sancionar, FIDE pide pruebas físicas o de conducta: esto sirve para decidir a quién mirar con más cuidado y a quién revisar, nunca para acusar.";
    const MOTOR_CADA_MS = 45000;       // sin nada pendiente, se vuelve a preguntar cada 45 s
    const MOTOR_GUARDADO = "fp_motor_v1";
    // La evaluación en la nube de Lichess: muchas posiciones ya están analizadas allá muy hondo (profundidad 20 o más),
    // gratis. Se pregunta primero; si no la tiene (o no trae todas las opciones que hacen falta), Stockfish la calcula
    // aquí. Si Lichess pide calma (429), se deja de preguntar un minuto.
    const NUBE = "https://lichess.org/api/cloud-eval", NUBE_PROFUNDIDAD = 20;
    const CASTILLO = { e1h1: "e1g1", e1a1: "e1c1", e8h8: "e8g8", e8a8: "e8c8" };

    let ctx = null, datos = null, primera = true, ultimaActualizacion = 0;
    const vistasAlertas = new Set();
    let novedades = [];                 // lo que pasó desde que se abrió la pantalla (lo más nuevo arriba)
    let motor = null, motorArranque = null, analizando = false, ultimoMotor = 0, analizadasAqui = 0, multipvActual = 0;
    let nubePausa = 0, deLaNube = 0, posicionesAqui = 0;
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
    const dos = (x) => Number(x).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const conElo = (nombre, elo) => (nombre || "—") + (elo ? " (" + elo + ")" : "");
    // El evento que se está mirando (lo dice la función, de los torneos): «Centroamericano 2026», «Nacional 2027»…
    const evento = () => (datos && datos.evento) || "Fair Play";
    const archivo = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const clave = (a) => a.tnr + "|" + a.ronda + "|" + a.mesa + "|" + a.color;
    // La clave de un nombre, IGUAL que claveDe() de la función e interno.fp_clave() de la base.
    const claveNombre = (p) => String(p == null ? "" : p).toLowerCase().replace(/[áéíóúüñ,.]/g, (x) => ({ "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n", ",": " ", ".": " " })[x]).replace(/\s+/g, " ").trim();
    const filaIndice = (tnr, jugador) => ((datos && datos.indice) || []).find((x) => x.tnr === tnr && x.clave === claveNombre(jugador)) || null;
    // Lo que el índice tuvo en cuenta de cada jugador, en frases: el Elo que se le reconoció, su historia, el tiempo y el ritmo.
    function notasDe(x) {
        if (!x) return [];
        const out = [];
        if (x.ritmo === "rapido") out.push({ alto: false, texto: "Partidas rápidas: se compara con lo esperable en rápidas, que tienen su propio ajuste." });
        if (x.elo_usado && x.elo && x.elo_usado > x.elo) out.push({ alto: false, texto: "Se lo comparó como un " + x.elo_usado + ": su Elo es " + x.elo
            + (x.elo_tendencia ? ", viene subiendo en FIDE unos " + uno(x.tendencia_mes) + " puntos por mes (se le reconocen " + x.elo_tendencia + " que la lista todavía no refleja)" : "")
            + (x.rendimiento != null && x.rendimiento_partidas ? " y rindió " + x.rendimiento + " en " + x.rendimiento_partidas + (x.rendimiento_partidas === 1 ? " partida" : " partidas") + " del torneo" : "")
            + " (se le reconoce parte de lo que rinde, hasta 200 puntos a los menores y 100 a los demás: el Elo de quien mejora rápido se atrasa)." });
        else if (x.tendencia_mes != null && x.elo) out.push({ alto: false, texto: "Su Elo en FIDE en el último año: " + (Number(x.tendencia_mes) > 0 ? "sube unos " + uno(x.tendencia_mes) + " puntos por mes, pero no lo suficiente para cambiar con quién se compara." : "estable o bajando: se compara con su Elo.") });
        if (x.hist_partidas) out.push({ alto: false, texto: "Su historia: en otras categorías o eventos ya medidos (" + x.hist_partidas + (x.hist_partidas === 1 ? " partida" : " partidas") + ") su índice fue " + (x.hist_roi != null ? uno(x.hist_roi) : "—") + ". Quien siempre juega así no es raro; quien de pronto juega muy por encima de su historia, sí. (Por el nombre: dos personas que se llamen igual se juntan.)" });
        if (x.tiempo_rho != null) out.push(Number(x.tiempo_z) >= 2
            ? { alto: true, texto: "Tiempo: pensó parecido en las jugadas fáciles y en las difíciles (correlación " + dos(x.tiempo_rho) + " en " + x.tiempo_jugadas + " jugadas; " + uno(x.tiempo_z) + " desviaciones por debajo de lo normal en su ritmo). Es típico de quien espera la jugada de afuera, pero hay jugadores de ritmo parejo: es una señal para mirar, no entra en el índice." }
            : { alto: false, texto: "Tiempo: piensa más donde es más difícil, como casi todos (correlación " + dos(x.tiempo_rho) + " en " + x.tiempo_jugadas + " jugadas)." });
        // Las rachas: el motor solo en el momento decisivo (señal para explicar; no entra en el índice).
        const masMenos = (z) => (Number(z) >= 0 ? "+" : "") + uno(z);
        const racha = x.racha_largo && x.racha_log10 != null ? " Su racha más rara: " + x.racha_largo + " jugadas difíciles seguidas de una partida, todas la primera del motor (para su nivel, 1 vez en " + Math.round(Math.pow(10, -Number(x.racha_log10))).toLocaleString("es-CR") + ")." : "";
        if (x.crit_z != null && x.facil_z != null) out.push(Number(x.contraste_z) >= 2 && Number(x.crit_z) >= 2
            ? { alto: true, texto: "Rachas: en las posiciones difíciles para su nivel sale muy alto (" + masMenos(x.crit_z) + " desviaciones) y en las fáciles, normal (" + masMenos(x.facil_z) + "). Es como juega quien usa el motor solo en el momento decisivo; alguien más fuerte que su Elo sale alto en las dos. Señal para mirar: no entra en el índice." + racha }
            : { alto: false, texto: "En las posiciones difíciles para su nivel: " + masMenos(x.crit_z) + " desviaciones; en las fáciles: " + masMenos(x.facil_z) + "." + racha });
        else if (racha) out.push({ alto: false, texto: racha.trim() });
        // Las trampas de la mirada corta: las que parecen buenas a primera vista y son malas.
        if (x.trampas_n) out.push(x.trampas_z != null && Number(x.trampas_z) >= 2
            ? { alto: true, texto: "Trampas: tuvo " + x.trampas_n + " posiciones donde lo que parece mejor a primera vista es malo, y cayó en " + x.trampas_cayo + "; alguien de su nivel caería en unas " + uno(x.trampas_e) + " (" + masMenos(x.trampas_z) + " desviaciones). Esquivarlas así es como juega el motor. Señal para mirar." }
            : { alto: false, texto: "Trampas (lo que parece bueno a primera vista y es malo): cayó en " + x.trampas_cayo + " de " + x.trampas_n + "; se esperaban unas " + uno(x.trampas_e) + (x.trampas_z != null ? " (" + masMenos(x.trampas_z) + ")" : " (pocas para medir)") + "." });
        // Todas las señales en una cuenta, y la vara para el tamaño del torneo.
        if (x.roi_combinado != null) out.push({ alto: Number(x.roi_combinado) >= 60, texto: "Con todas las señales juntas (el índice, el tiempo, las rachas y las trampas, sin contar dos veces lo que dicen igual): " + uno(x.roi_combinado) + "." });
        if (x.umbral_z != null && x.z != null && Number(x.z) >= Number(x.umbral_z)) out.push({ alto: true, texto: "Raro aun para un torneo de este tamaño: pasa la vara de " + uno(50 + 5 * Number(x.umbral_z)) + " (lo que por azar pasaría un jugador de cada 20 torneos así)." + (Number(x.z) >= 4.5 ? " Y llega a lo que FIDE pide para sancionar sin prueba física (4,5 desviaciones)." : "") });
        return out;
    }

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
                el("button", { type: "button", id: "fp-actualizar", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => actualizar(true) }, el("span", { "aria-hidden": "true", texto: "🔄" }), " Leer chess-results ahora")),

            el("section", { id: "fp-novedades-caja", class: "cam-fp-novedades", "aria-labelledby": "fp-t-novedades", hidden: true },
                el("div", { class: "cam-fp-barra" },
                    el("h3", { id: "fp-t-novedades", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "🔔 " }), "Novedades ", el("span", { id: "fp-novedades-n", class: "cam-contador" })),
                    el("button", { type: "button", id: "fp-novedades-listo", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: limpiarNovedades }, "Ya las vi")),
                el("ul", { id: "fp-novedades", class: "cam-fp-novedades-lista", "aria-live": "polite" })),

            el("section", { class: "cam-fp-seccion", "aria-labelledby": "fp-t-alertas" },
                el("h3", { id: "fp-t-alertas", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "📈 " }), "Alertas de los tableros electrónicos ", el("span", { id: "fp-alertas-n", class: "cam-contador", hidden: true })),
                el("p", { class: "cam-herramientas-nota", texto: "Las partidas de los tableros electrónicos, directo de LiveChess y sin atraso: apenas termina una, Stockfish la analiza en esta computadora y sale la precisión de cada jugador (la fórmula de Lichess, sin la apertura ni las posiciones ya decididas), comparada con la esperable para su Elo en este mismo torneo. Es una alerta para mirar, nunca una acusación: «Ya la miré» la cierra; «Seguirlo en los sorteos» hace que sus mesas salgan más seguido." }),
                el("div", { class: "cam-fp-motor" },
                    el("label", { class: "cam-fp-motor-casilla" },
                        el("input", { type: "checkbox", id: "fp-motor-si", onchange: (e) => { try { localStorage.setItem(MOTOR_GUARDADO, e.target.checked ? "si" : "no"); } catch (x) { /* sin almacenamiento */ } if (e.target.checked) { ultimoMotor = 0; analizar(); } else estadoMotor("Apagado en esta computadora: las partidas las analiza otra pantalla de Fair Play que lo tenga encendido."); } }),
                        " Analizar las partidas en esta computadora (Stockfish)"),
                    el("p", { id: "fp-motor-estado", class: "cam-fp-detalle", role: "status", texto: "Preparando Stockfish…" })),
                el("p", { id: "fp-alertas-vacio", class: "cam-herramientas-nota", texto: "Ninguna partida se sale de lo esperable para el Elo de su jugador." }),
                el("h4", { id: "fp-t-acumulado", class: "cam-fp-subtitulo", hidden: true }, "Sumadas todas sus partidas del torneo"),
                el("p", { id: "fp-acumulado-nota", class: "cam-herramientas-nota", hidden: true, texto: "Quien juega un poco por encima de su nivel en cada ronda no salta en ninguna partida sola, pero sí en el conjunto: se suman sus partidas medidas en la categoría (dos partidas a 1,5 desviaciones dan 2,1)." }),
                el("div", { id: "fp-acumulado", class: "cam-fp-alertas" }),
                el("h4", { id: "fp-t-por-partida", class: "cam-fp-subtitulo", hidden: true }, "Partida por partida"),
                el("div", { id: "fp-alertas", class: "cam-fp-alertas" })),

            el("section", { class: "cam-fp-seccion", "aria-labelledby": "fp-t-sortear" },
                el("h3", { id: "fp-t-sortear", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "🎲 " }), "Sortear mesas"),
                el("p", { class: "cam-herramientas-nota" }, "Toda mesa puede salir; algunas salen más seguido (la diferencia de Elo, quien se levantó, una ilegal o irregularidad, quien le ganó a alguien mucho más fuerte, las alertas de los tableros): ninguna señal decide sola y el peso no pasa de 4. De la mesa que sale se revisa al ", el("strong", { texto: "ganador" }), " cuando termina la partida; si es tablas, al color sorteado. Quien se revisó no aplica en las 2 rondas siguientes y nadie pasa de 3 revisiones: si gana quien no aplica, la mesa queda sin efecto y su árbitro recibe el aviso. ", el("strong", { texto: "También se puede elegir una mesa a mano" }), ": la mesa, a quién se revisa (el ganador, el de blancas o el de negras) y el motivo, que queda en el acta."),
                el("div", { class: "cam-herramientas mt-2", role: "toolbar", "aria-label": "Sortear mesas" },
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Categoría" }), el("select", { id: "fp-categoria", class: "cam-select", onchange: () => verMesas() })),
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Mesas por categoría" }), el("select", { id: "fp-cantidad", class: "cam-select" }, [1, 2, 3, 4, 5].map((n) => el("option", { texto: String(n) })))),
                    el("button", { type: "button", id: "fp-sortear", class: "cam-btn cam-btn-chico", onclick: sortear }, el("span", { "aria-hidden": "true", texto: "🎲" }), " Sortear"),
                    el("button", { type: "button", id: "fp-elegir", class: "cam-btn cam-btn-chico", onclick: elegirAMano }, el("span", { "aria-hidden": "true", texto: "✋" }), " Elegir una mesa a mano"),
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

            el("section", { class: "cam-fp-seccion", "aria-labelledby": "fp-t-indice" },
                el("h3", { id: "fp-t-indice", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "📊 " }), "Índice del torneo, jugador por jugador"),
                el("p", { class: "cam-herramientas-nota", texto: "Como el que usa FIDE (el modelo de Ken Regan): en cada posición, la probabilidad de que alguien de su nivel elija cada jugada según lo que pierde con ella; sumando todas sus partidas, cuánto se aparta de eso. 50 es lo normal y cada 5 puntos es una desviación: desde 60 se mira, desde 62,5 es muy alto. Sin Elo, se compara con su categoría. Nunca es una prueba." }),
                el("p", { id: "fp-indice-vacio", class: "cam-herramientas-nota", texto: "Todavía no hay suficientes partidas analizadas para ajustar el modelo." }),
                el("div", { class: "cam-tabla-envoltura mt-2" },
                    el("table", { id: "fp-indice-tabla", class: "cam-tabla cam-rejilla", hidden: true },
                        el("caption", { class: "sr-only", texto: "El índice de cada jugador en el torneo, del más alto al más bajo" }),
                        el("thead", {}, el("tr", {}, ["Jugador", "Categoría", "Partidas", "Índice", "Primera del motor (jugó / esperable)", "Posiciones difíciles (acertó / esperable)", "Qué se tuvo en cuenta"].map((t) => el("th", { scope: "col", texto: t })))),
                        el("tbody", { id: "fp-indice" }))),
                el("details", { id: "fp-confianza", class: "cam-fp-confianza mt-2", hidden: true },
                    el("summary", { texto: "¿Qué tan confiable es?" }),
                    el("div", { id: "fp-confianza-texto" }))),

            ctx.principal ? el("section", { class: "cam-fp-seccion", "aria-labelledby": "fp-t-referencia" },
                el("h3", { id: "fp-t-referencia", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "📚 " }), "Partidas de referencia (para afinar el modelo)"),
                el("p", { class: "cam-herramientas-nota", texto: "Partidas clásicas de otros torneos con el Elo de cada jugador: uno o varios PGN, o el enlace de una transmisión de Lichess (de un torneo entero o de una ronda). Esta computadora analiza cada partida con el mismo motor y se guardan solo las jugadas y el Elo, sin nombres. Con muchas el modelo queda firme desde la ronda 1. Una carga larga se puede cortar: al volver a cargar lo mismo, sigue donde quedó. Las rápidas y relámpago (por su TimeControl) se saltan." }),
                el("form", { id: "fp-form-referencia", class: "cam-herramientas mt-2", onsubmit: cargarReferencia },
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Evento" }), el("input", { id: "fp-ref-evento", class: "cam-select", maxlength: "80", required: true, autocomplete: "off" })),
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Archivos PGN" }), el("input", { id: "fp-ref-archivo", type: "file", accept: ".pgn,text/plain", multiple: true })),
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "o el enlace de una transmisión de Lichess" }), el("input", { id: "fp-ref-enlace", class: "cam-select", type: "url", placeholder: "https://lichess.org/broadcast/…", autocomplete: "off" })),
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Qué partidas son" }),
                        el("select", { id: "fp-ref-tipo", class: "cam-select" },
                            el("option", { value: "normal", texto: "Normales (jugadas limpio): para afinar el modelo" }),
                            el("option", { value: "prueba", texto: "De prueba: se sabe quién usó el motor (etiqueta [Trampa \"Blancas\"] o [Trampa \"Negras\"])" }))),
                    el("button", { type: "submit", id: "fp-ref-cargar", class: "cam-btn cam-btn-chico" }, "Analizar y cargar"),
                    el("button", { type: "button", id: "fp-ref-detener", class: "cam-btn cam-btn-claro cam-btn-chico", hidden: true, onclick: () => { detenerReferencia = true; } }, "Detener")),
                el("p", { id: "fp-ref-estado", class: "cam-fp-detalle", role: "status" })) : null,

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
            if (f.estado === "aprobada" && f.revisar_color && f.resultado_mesa && (v.resultado_mesa !== f.resultado_mesa || v.revisar_color !== f.revisar_color || v.estado !== "aprobada")) out.push({ hora: ahora, fuerte: true, texto: "🛡 " + de(f) + ": terminó (" + (f.resultado_mesa || "") + "). Ve a revisar a " + quien(f) + "." });
            if (f.retenido_en && !v.retenido_en) out.push({ hora: f.retenido_en, fuerte: true, texto: "✋ " + (f.retenido_por || "Su árbitro") + " ya retuvo a " + quien(f) + " (" + de(f) + ")." });
            if (f.estado === "sin_efecto" && v.estado !== "sin_efecto") out.push({ hora: ahora, fuerte: false, texto: "⚪ " + de(f) + ": quedó sin efecto (" + (f.revisar_fijo ? quien(f) + " no se presentó" : f.revisar_color ? "ganó " + quien(f) + ", que no aplica" : "no se jugó") + "). Su árbitro ya tiene el aviso." });
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
        $("fp-estado").textContent = (d.nombre ? (ctx.token ? "Encargado: " : "") + d.nombre + " · " : "") + (d.actualizado ? "chess-results leído a las " + hora(d.actualizado) : "Todavía no se leyó chess-results");
        const sel = $("fp-categoria"), antes = sel.value;
        sel.replaceChildren(el("option", { value: "", texto: "Todas las categorías (" + d.rondas.length + ")" }),
            ...d.rondas.map((r) => el("option", { value: r.tnr, texto: r.nombre + " — ronda " + r.ronda })));
        if ([...sel.options].some((o) => o.value === antes)) sel.value = antes;
        pintarAlertas();
        pintarIndice();
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
            el("p", { class: "cam-fp-resumen", texto: resumenAlerta(a) }),
            el("ul", { class: "cam-fp-por-que", "aria-label": "Por qué" }, explicar(a).map((x) => el("li", { "data-alto": x.alto ? "si" : null, "data-momento": x.momento ? "si" : null }, x.alto ? el("span", { class: "sr-only", texto: "Señal alta: " }) : null, x.texto))),
            el("details", { class: "cam-fp-no-significa" }, el("summary", { texto: "Qué no significa esto" }), el("p", { texto: NO_SIGNIFICA })),
            a.nota || a.vista_por_nombre ? el("p", { class: "cam-fp-detalle", texto: (a.estado === "seguir" ? "En seguimiento" : "Mirada") + (a.vista_por_nombre ? " por " + a.vista_por_nombre : "") + (a.vista_en ? " a las " + hora(a.vista_en) : "") + (a.nota ? ": " + a.nota : "") }) : null,
            el("div", { class: "cam-fp-acciones" },
                a.partida_url ? el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: a.partida_url, target: "_blank", rel: "noopener" }, "Ver la partida") : null,
                a.estado !== "vista" ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "vista", onclick: () => decidirAlerta(a, "vista") }, "Ya la miré") : null,
                a.estado !== "seguir" ? el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "seguir", onclick: () => decidirAlerta(a, "seguir") }, "Seguirlo en los sorteos") : null))));
    }

    // El índice de cada jugador (todas sus partidas del torneo) y lo que dice la validación.
    function pintarIndice() {
        const lista = (datos.indice || []).filter((x) => x.roi != null).sort((a, b) => b.roi - a.roi);
        $("fp-indice-vacio").hidden = lista.length > 0;
        $("fp-indice-tabla").hidden = lista.length === 0;
        const nivel = (r) => (r >= 62.5 ? "alta" : r >= 60 ? "a_mirar" : "normal");
        $("fp-indice").replaceChildren(...lista.slice(0, 60).map((x) => el("tr", { "data-nivel": nivel(x.roi) },
            el("td", {}, el("strong", { texto: conElo(x.jugador, x.elo) }), x.comparado === "categoria" ? el("span", { class: "cam-fp-detalle", texto: "Sin Elo: comparado con su categoría" }) : null,
                el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico cam-fp-informe-jugador", "data-accion": "informe-jugador", onclick: (e) => informeJugador(x, e.currentTarget) },
                    el("span", { "aria-hidden": "true", texto: "📄 " }), "Informe", el("span", { class: "sr-only", texto: " de " + (x.jugador || "este jugador") + " en PDF" }))),
            el("td", { texto: nombreDe(x.tnr) }),
            el("td", { texto: x.partidas + " (rondas " + x.rondas + ") · " + x.jugadas + " jugadas" }),
            el("td", {}, el("strong", { texto: uno(x.roi) }), nivel(x.roi) !== "normal" ? el("span", { class: "cam-chip", "data-estado": "fp-nivel-" + nivel(x.roi), texto: " " + NIVELES[nivel(x.roi)] }) : null),
            el("td", { texto: x.t1 + " / " + uno(x.e_t1) + (x.z_t1 != null ? " (" + (x.z_t1 >= 0 ? "+" : "") + uno(x.z_t1) + ")" : "") }),
            el("td", { texto: x.dificiles ? x.t1_dif + " de " + x.dificiles + " / " + uno(x.e_t1_dif) : "—" }),
            el("td", {}, ...notasDe(x).map((n) => el("span", { class: "cam-fp-detalle", "data-alto": n.alto ? "si" : null }, n.alto ? el("span", { class: "sr-only", texto: "Señal alta: " }) : null, n.texto))))));
        const m = datos.modelo, v = m && m.validacion;
        $("fp-confianza").hidden = !v;
        if (v) {
            const det = (f) => v.deteccion && v.deteccion[f] ? uno(v.deteccion[f].a_mirar) + " % (" + uno(v.deteccion[f].alta) + " % muy alto)" : "—";
            $("fp-confianza-texto").replaceChildren(
                el("p", { texto: "Medido con " + (v.jugadores === 1 ? "el único jugador que tiene" : "los " + v.jugadores + " jugadores que tienen") + " 30 jugadas o más analizadas." }),
                el("p", { texto: "Alarmas falsas: " + uno(v.falsas_a_mirar) + " % pasa de 60 y " + uno(v.falsas_alta) + " % de 62,5. Por pura casualidad se esperaría " + uno(v.esperadas_a_mirar) + " % y " + uno(v.esperadas_alta) + " %. Como casi todos juegan limpio, esto es lo más que se equivoca." }),
                el("p", { texto: "Si alguien usara el motor en 1 de cada 10 jugadas, lo marcaría el " + det("0.1") + " de las veces; en 2 de cada 10, el " + det("0.2") + "; en 3 de cada 10, el " + det("0.3") + "." }),
                v.casos ? el("p", { texto: "Con casos de prueba (partidas donde se sabe quién usó el motor): marcó a " + uno(v.casos.marcados_a_mirar) + " % de los " + v.casos.con_trampa + " que hicieron trampa" + (v.casos.ic_marcados ? " (con estos casos, entre " + uno(v.casos.ic_marcados[0]) + " % y " + uno(v.casos.ic_marcados[1]) + " %)" : "") + ", " + uno(v.casos.marcados_alta) + " % muy alto, y a " + uno(v.casos.falsos_a_mirar) + " % de sus " + v.casos.sin_trampa + " rivales, que jugaron limpio" + (v.casos.ic_falsos ? " (entre " + uno(v.casos.ic_falsos[0]) + " % y " + uno(v.casos.ic_falsos[1]) + " %)" : "") + "." + (v.casos.auc != null ? " Separa a unos de otros con un AUC de " + dos(v.casos.auc) + " (0,5 es al azar; 1, siempre)." : "") }) : el("p", { class: "cam-fp-detalle", texto: "Todavía no hay casos de prueba: se cargan en «Partidas de referencia» como «De prueba»." }),
                v.casos && v.casos.por_porcentaje ? el("p", { texto: "Por cuánto usaron el motor: " + Object.keys(v.casos.por_porcentaje).sort((a, b) => a - b).map((k) => { const x = v.casos.por_porcentaje[k]; return "en " + k + " de cada 100 jugadas, marcó " + uno(x.marcados_a_mirar) + " % de " + x.casos; }).join("; ") + "." }) : null,
                m.validacion.grupos && m.validacion.grupos.clasico && m.validacion.grupos.clasico.umbral ? el("p", { texto: "Con " + m.validacion.grupos.clasico.jugadores + " jugadores medidos en las clásicas, la vara para que sea raro aun por el tamaño del torneo es " + uno(50 + 5 * m.validacion.grupos.clasico.umbral) + "; para sancionar sin prueba física, FIDE pide alrededor de 72,5 (4,5 desviaciones)." }) : null,
                v.rapido ? el("p", { texto: "En las rápidas (con su propio ajuste, " + v.rapido.jugadores + " jugadores): alarmas falsas " + uno(v.rapido.falsas_a_mirar) + " % y " + uno(v.rapido.falsas_alta) + " %." }) : null,
                el("p", { class: "cam-fp-detalle", texto: "El modelo se ajustó con " + m.movimientos + " jugadas de jugadores con Elo" + (m.referencia ? " (" + m.referencia + " de partidas de referencia)" : "") + (m.ajustado ? " a las " + hora(m.ajustado) : "") + ". La gente real varía " + uno(m.factor) + " veces lo que dice el modelo, y la mitad queda en " + uno(50 + 5 * Number(m.centro)) + " antes de centrarla en 50." }));
        }
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
                : f.estado === "sin_efecto" ? (f.revisar_fijo ? quien + " no se presentó" : quien ? "Ganó " + quien + ", que no aplica" : "Nadie (no se jugó)")
                    : quien ? quien + " (" + COLOR[f.revisar_color].toLowerCase() + ")" + (f.revisar_fijo ? ", gane, pierda o empate" : "")
                        : "El ganador · si es tablas: " + COLOR[f.color_si_tablas];
            const detalle = f.estado === "descartada" ? "Motivo: " + (f.motivo || "")
                : f.estado === "revisada" ? (RESULTADOS[f.resultado] || "") + (f.nota ? " · " + f.nota : "") + (f.revisada_por_nombre ? " · " + f.revisada_por_nombre : "")
                    : f.estado === "aprobada" ? (leido ? "✓ " + (f.arbitro || "Su árbitro") + " lo leyó a las " + hora(leido) : "⏳ " + (f.arbitro || "Su árbitro") + " todavía no lo ha leído")
                        + (f.revisar_color && f.resultado_mesa ? (f.retenido_en ? " · ✋ Retenido a las " + hora(f.retenido_en) + (f.retenido_por ? " (" + f.retenido_por + ")" : "") : " · ⏳ Terminó: falta que su árbitro confirme que lo retuvo") : "")
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
                    : f.origen === "elegida" ? el("span", { class: "cam-fp-detalle", texto: "✋ Elegida a mano por " + (f.sorteada_por || "—") + (f.motivo ? " · " + f.motivo : "") })
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
        const ok = await Avisos.confirmar(f.revisar_fijo ? textoAviso(f) : "Le llega un aviso al árbitro de la mesa " + f.mesa + " de " + nombreDe(f.tnr) + ": que cuando termine la partida retenga al ganador (si es tablas, a quien jugó con " + COLOR[f.color_si_tablas].toLowerCase() + ") y no lo deje salir del local hasta que llegues. Su mesa se le marca con un borde dorado." + (f.no_aplica ? " Ojo: " + f.no_aplica + "; si gana esa persona, la mesa queda sin efecto y su árbitro recibe el aviso." : ""),
            { titulo: "Aprobar la mesa " + f.mesa, aceptar: "Aprobar y avisar" });
        if (!ok) return;
        try { await llamar("aprobar", { id: f.id }); avisar("Listo: el árbitro de la mesa " + f.mesa + " ya tiene el aviso."); }
        catch (e) { avisar("No se pudo aprobar: " + (e.message || e), true); }
        await cargar();
    }

    // El aviso que le llega al árbitro de una mesa con el jugador fijo (lo escribe la base; esto lo cuenta antes de mandarlo).
    function textoAviso(f) {
        const nombre = (f.revisar_fijo === "blancas" ? f.blancas : f.negras) || "quien juega con " + COLOR[f.revisar_fijo].toLowerCase();
        return "Le llega un aviso al árbitro de la mesa " + f.mesa + " de " + nombreDe(f.tnr) + ": que cuando termine la partida (gane, pierda o empate) retenga a " + nombre + " (" + COLOR[f.revisar_fijo].toLowerCase() + ") y no lo deje salir del local hasta que llegues. Su mesa se le marca con un borde dorado. Si esa persona no se presenta, la mesa queda sin efecto.";
    }

    // Una mesa elegida a mano, no por sorteo: la categoría, la mesa (de las que tienen árbitro, con sus jugadores), a quién
    // se revisa, el motivo (va al acta) y si se le avisa ya a su árbitro. Lo que no aplica lo rechaza la base, con su porqué.
    async function elegirAMano() {
        if (!datos || !datos.rondas.length) { avisar("No hay categorías con árbitros: primero se crean sus enlaces en «Árbitros y mesas».", true); return; }
        let tnr = $("fp-categoria").value;
        if (!tnr) {
            const a = await Avisos.formulario({ titulo: "Elegir una mesa a mano", texto: "¿De qué categoría?", aceptar: "Ver sus mesas",
                campos: [{ nombre: "tnr", etiqueta: "Categoría", tipo: "select", valor: datos.rondas[0].tnr, opciones: datos.rondas.map((r) => [r.tnr, r.nombre + " (ronda " + r.ronda + ")"]) }] });
            if (!a) return;
            tnr = a.tnr;
        }
        const r = datos.rondas.find((x) => x.tnr === tnr);
        if (!r) return;
        let mesas;
        try { mesas = (await llamar("candidatas", { tnr, ronda: r.ronda })).mesas || []; }
        catch (e) { avisar("No se pudieron leer las mesas: " + (e.message || e), true); return; }
        const libres = mesas.filter((m) => !m.excluida);   // sin las que ya salieron, los bye y donde ninguno aplica
        if (!libres.length) { avisar("En " + r.nombre + " no queda ninguna mesa por elegir en la ronda " + r.ronda + ".", true); return; }
        const b = await Avisos.formulario({
            titulo: "Elegir una mesa a mano · " + r.nombre + ", ronda " + r.ronda,
            texto: "No es un sorteo: queda anotado con tu nombre, la hora y el motivo. Quien se revisó hace poco (o ya tuvo 3 revisiones) no se puede elegir.",
            campos: [
                { nombre: "mesa", etiqueta: "Mesa", tipo: "select", valor: String(libres[0].mesa),
                    opciones: libres.map((m) => [String(m.mesa), "Mesa " + m.mesa + " · " + (m.blancas || "¿?") + " – " + (m.negras || "¿?") + (m.no_aplica ? " (⚠ " + m.no_aplica + ")" : "")]) },
                { nombre: "revisar", etiqueta: "A quién se revisa", tipo: "select", valor: "blancas",
                    opciones: [["blancas", "Al de blancas (gane, pierda o empate)"], ["negras", "Al de negras (gane, pierda o empate)"], ["ganador", "Al ganador (en tablas, al azar entre los dos)"]] },
                { nombre: "motivo", etiqueta: "Motivo (va al acta)", tipo: "textarea", valor: "", max: 300 },
                { nombre: "avisar", etiqueta: "¿Le aviso ya a su árbitro?", tipo: "select", valor: "si",
                    opciones: [["si", "Sí, mandarle el aviso ya"], ["no", "No, la dejo en la lista para aprobarla después"]] },
            ],
            aceptar: "Elegir esta mesa",
        });
        if (!b) return;
        if (!String(b.motivo || "").trim()) { avisar("Una mesa elegida a mano lleva el motivo: queda en el acta.", true); return; }
        const m = libres.find((x) => String(x.mesa) === String(b.mesa));
        const nombre = b.revisar === "ganador" ? "el ganador" : ((b.revisar === "blancas" ? m && m.blancas : m && m.negras) || "quien juega con " + b.revisar) + " (" + b.revisar + ")";
        try {
            const { sorteo } = await llamar("elegir", { tnr, ronda: r.ronda, mesa: Number(b.mesa), revisar: b.revisar, motivo: String(b.motivo).trim(), avisar: b.avisar === "si" });
            avisar(sorteo && sorteo.estado === "aprobada"
                ? "Listo: mesa " + b.mesa + " elegida. Su árbitro (" + (sorteo.arbitro || "el de esa mesa") + ") ya tiene el aviso de retener a " + nombre + "."
                : "Mesa " + b.mesa + " elegida (se revisa a " + nombre + "). Apruébala en la lista para avisarle a su árbitro.");
        } catch (e) { avisar("No se pudo elegir la mesa: " + (e.message || e), true); }
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
        const r = await Avisos.formulario({ titulo: "Revisión de la mesa " + f.mesa + " (" + nombreDe(f.tnr) + ", ronda " + f.ronda + ")", texto: f.revisar_fijo ? "Se revisa a " + ((f.revisar_fijo === "blancas" ? f.blancas : f.negras) || "quien jugó con " + COLOR[f.revisar_fijo].toLowerCase()) + " (" + COLOR[f.revisar_fijo].toLowerCase() + "), elegido a mano." : "Se revisa al ganador; si fue tablas, a quien jugó con " + COLOR[f.color_si_tablas].toLowerCase() + ".", campos, aceptar: "Guardar la revisión" });
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
            if (aMano) avisar(r.saltado ? "Ya se leyó hace menos de un minuto y medio: se muestra eso." : "Leídas " + r.pareos + " mesas de chess-results." + (r.errores && r.errores.length ? " Hubo " + r.errores.length + " problemas: " + r.errores[0] : ""), !!(r.errores && r.errores.length && !r.pareos));
        } catch (e) { if (aMano) avisar("No se pudo leer: " + (e.message || e), true); }
        finally { if (aMano) $("fp-actualizar").disabled = false; await cargar(); }
    }

    async function pdf() {
        const orden = (tnr) => datos.rondas.findIndex((r) => r.tnr === tnr);
        const lista = [...datos.sorteos].sort((a, b) => (a.ronda - b.ronda) || (orden(a.tnr) - orden(b.tnr)) || (a.mesa - b.mesa));
        try {
            const blob = await window.ReportePDF.generar({
                titulo: "Fair Play: mesas sorteadas — " + evento(),
                subtitulo: window.HoraCR.fechaHora(new Date()),
                pie: evento() + " · ajedrez-integral.com · Documento confidencial del equipo de Fair Play",
                bloques: [{ tipo: "tabla", encabezados: ["Categoría", "Ronda", "Mesa", "Peso y por qué", "Jugadores", "Estado", "Sorteó / decidió", "Resultado o motivo"], anchos: [1.4, 0.5, 0.7, 2, 2.2, 1, 1.5, 2.4],
                    filas: lista.map((f) => [nombreDe(f.tnr), String(f.ronda), f.mesa + " de " + f.mesas_en_sorteo, Number(f.peso || 1) + (f.motivos && f.motivos.length ? ": " + f.motivos.join("; ") : ""),
                        conElo(f.blancas, f.elo_b) + " – " + conElo(f.negras, f.elo_n) + (f.no_aplica ? " (" + f.no_aplica + ")" : ""), ESTADOS[f.estado] || f.estado,
                        (f.sorteada_por || "—") + (f.decidida_por_nombre ? " / " + f.decidida_por_nombre : ""),
                        f.estado === "descartada" ? "Descartada: " + (f.motivo || "") : f.estado === "revisada" ? (RESULTADOS[f.resultado] || "") + (f.jugador ? " · " + f.jugador : "") + (f.nota ? " · " + f.nota : "") : f.estado === "sin_efecto" ? "Ganó quien no aplicaba" : "—"]) }],
                fotos: [],
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = "fair-play-" + archivo(evento()) + ".pdf";
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
                "Revisiones hechas: " + revisadas.length + " (" + porResultado.join("; ") + ")" + (todos.some((f) => f.origen === "manual") ? ", de ellas " + todos.filter((f) => f.origen === "manual").length + " anotadas a mano (sin sorteo)" : "") + "." + (todos.some((f) => f.origen === "elegida") ? " Mesas elegidas a mano (no por sorteo), con su motivo: " + todos.filter((f) => f.origen === "elegida").map((f) => nombreDe(f.tnr) + ", ronda " + f.ronda + ", mesa " + f.mesa + " (" + (f.motivo || "—") + ", " + (f.sorteada_por || "—") + ")").join("; ") + "." : ""),
                "Mesas sin efecto (ganó quien no aplicaba, o no se jugó): " + cuenta(todos, "sin_efecto") + ". Por revisar todavía: " + cuenta(todos, "aprobada") + ".",
                "Alertas de los tableros electrónicos: " + alertas.length + " partidas (" + alertas.filter((a) => a.estado === "vista").length + " miradas, " + alertas.filter((a) => a.estado === "seguir").length + " en seguimiento, " + alertas.filter((a) => a.estado === "nueva").length + " sin mirar)" + ((datos.acumulado || []).length ? "; " + datos.acumulado.length + " jugadores por encima de lo esperable sumando sus partidas" : "") + ".",
            ] },
            { tipo: "titulo", texto: "Por categoría" },
            { tipo: "tabla", encabezados: ["Categoría", "Ronda actual", "Sorteadas", "Revisadas", "Sin efecto", "Descartadas", "Por revisar", "Alertas"], anchos: [2.2, 0.9, 0.9, 0.9, 0.9, 1, 0.9, 0.9],
                filas: datos.rondas.map((r) => { const de = todos.filter((f) => f.tnr === r.tnr); return [r.nombre, String(r.ronda), String(de.filter((f) => f.origen !== "manual").length), String(cuenta(de, "revisada")), String(cuenta(de, "sin_efecto")), String(cuenta(de, "descartada")), String(cuenta(de, "aprobada")), String(alertas.filter((a) => a.tnr === r.tnr).length)]; }) },
            { tipo: "titulo", texto: "Las revisiones" },
            revisadas.length ? { tipo: "tabla", encabezados: ["Ronda", "Categoría", "Mesa", "Jugador revisado", "Resultado", "Qué pasó", "Retenido por", "Revisó"], anchos: [0.6, 1.5, 0.6, 1.8, 1.3, 2.4, 1.4, 1.4],
                filas: revisadas.map((f) => [String(f.ronda), nombreDe(f.tnr), String(f.mesa) + (f.origen === "manual" ? " (a mano)" : f.origen === "elegida" ? " (elegida)" : ""), f.jugador || "—", RESULTADOS[f.resultado] || "", f.nota || "—", f.retenido_por ? f.retenido_por + " · " + hora(f.retenido_en) : "—", f.revisada_por_nombre || "—"]) }
                : { tipo: "parrafo", texto: "Todavía no se ha revisado a nadie." },
            { tipo: "titulo", texto: "Las mesas que no llegaron a revisión" },
            todos.some((f) => f.estado === "descartada" || f.estado === "sin_efecto") ? { tipo: "tabla", encabezados: ["Ronda", "Categoría", "Mesa", "Qué pasó", "Decidió"], anchos: [0.6, 1.6, 0.6, 4, 1.6],
                filas: todos.filter((f) => f.estado === "descartada" || f.estado === "sin_efecto").map((f) => [String(f.ronda), nombreDe(f.tnr), String(f.mesa), f.estado === "descartada" ? "Descartada: " + (f.motivo || "") : "Sin efecto: " + (f.revisar_color ? "ganó " + ((f.revisar_color === "blancas" ? f.blancas : f.negras) || COLOR[f.revisar_color]) + ", que no aplicaba (" + (f.no_aplica || "ya se había revisado") + ")" : "no se jugó"), f.decidida_por_nombre || "—"]) }
                : { tipo: "parrafo", texto: "Ninguna." },
            (datos.indice || []).some((x) => x.roi != null) ? { tipo: "titulo", texto: "Índice del torneo, jugador por jugador" } : null,
            (datos.indice || []).some((x) => x.roi != null) ? { tipo: "nota", texto: "Como el que usa FIDE (el modelo de Ken Regan): 50 es lo normal y cada 5 puntos es una desviación; desde 60 se mira. Sin Elo, comparado con su categoría." } : null,
            (datos.indice || []).some((x) => x.roi != null) ? { tipo: "tabla", encabezados: ["Jugador", "Categoría", "Partidas", "Índice", "Primera del motor (jugó / esperable)", "Difíciles (acertó / esperable)"], anchos: [2.2, 1.5, 0.8, 0.8, 1.6, 1.6],
                filas: [...datos.indice].filter((x) => x.roi != null && x.roi >= 55).sort((a, b) => b.roi - a.roi).map((x) => [conElo(x.jugador, x.elo) + (x.comparado === "categoria" ? " (sin Elo)" : ""), nombreDe(x.tnr), String(x.partidas), uno(x.roi), x.t1 + " / " + uno(x.e_t1), x.dificiles ? x.t1_dif + " de " + x.dificiles + " / " + uno(x.e_t1_dif) : "—"]) } : null,
            datos.modelo && datos.modelo.validacion ? { tipo: "nota", texto: "Qué tan confiable es (con " + datos.modelo.validacion.jugadores + " jugadores): alarmas falsas " + datos.modelo.validacion.falsas_a_mirar + " % desde 60 (por azar, 2,3 %); si alguien usara el motor en 2 de cada 10 jugadas, lo marcaría el " + uno(((datos.modelo.validacion.deteccion || {})["0.2"] || {}).a_mirar || 0) + " % de las veces." } : null,
            { tipo: "titulo", texto: "Alertas de los tableros electrónicos" },
            { tipo: "nota", texto: "La precisión de cada jugador en las partidas transmitidas, contra la esperable para su Elo en el mismo torneo. Una alerta es una razón para mirar con más cuidado, nunca una prueba ni una acusación." },
            (datos.acumulado || []).length ? { tipo: "tabla", encabezados: ["Jugador", "Categoría", "Partidas (rondas)", "Precisión media", "Esperable", "Desviaciones", "Decisión"], anchos: [2, 1.5, 1.3, 1, 1, 1, 1.3],
                filas: datos.acumulado.map((x) => [conElo(x.jugador, x.elo), nombreDe(x.tnr), x.partidas + " (" + x.rondas + ")", uno(x.precision_media) + " %", x.esperada_media != null ? uno(x.esperada_media) + " %" : "—", uno(x.z), x.sin_mirar > 0 ? "Sin mirar" : x.seguir ? "En seguimiento" : "Mirado"]) } : null,
            alertas.length ? { tipo: "tabla", encabezados: ["Ronda", "Categoría", "Mesa", "Jugador", "Precisión", "Esperable", "Desviaciones", "Decisión y nota"], anchos: [0.6, 1.4, 0.6, 2, 0.9, 0.9, 0.9, 2.4],
                filas: alertas.map((a) => [String(a.ronda), nombreDe(a.tnr), String(a.mesa), conElo(a.jugador, a.elo) + " (" + COLOR[a.color].toLowerCase() + ")", uno(a.precision) + " %", a.esperada != null ? uno(a.esperada) + " %" : "—", a.z != null ? uno(a.z) : "—", decision(a) + (a.vista_por_nombre ? " (" + a.vista_por_nombre + ")" : "") + (a.nota ? ": " + a.nota : "")]) }
                : { tipo: "parrafo", texto: "Ninguna partida se salió de lo esperable." },
            alertas.filter((a) => a.nivel !== "normal" || a.estado === "seguir").length ? { tipo: "titulo", texto: "Por qué se marcó cada alerta" } : null,
            ...alertas.filter((a) => a.nivel !== "normal" || a.estado === "seguir").flatMap((a) => [
                { tipo: "subtitulo", texto: conElo(a.jugador, a.elo) + " · " + nombreDe(a.tnr) + ", ronda " + a.ronda + ", mesa " + a.mesa + " · " + (NIVELES[a.nivel] || "Seguimiento") },
                { tipo: "parrafo", texto: resumenAlerta(a) },
                { tipo: "lista", items: explicar(a).map((x) => (x.alto ? "[ALTA] " : "") + x.texto) },
            ]),
            { tipo: "nota", texto: "Qué no significa una alerta: " + NO_SIGNIFICA },
            { tipo: "separador" },
            { tipo: "nota", texto: "Cómo se trabajó: las mesas se sortean por categoría con un peso que ninguna señal decide sola (tope 4); de la mesa sorteada se revisa al ganador (en tablas, al color sorteado), en privado y por alguien del mismo sexo (Leyes del Ajedrez, art. 11.3.3). Quien se revisó no aplica en las 2 rondas siguientes y nadie pasa de 3 revisiones. Todo queda anotado con quién y cuándo. Documento confidencial del equipo de Fair Play y del árbitro principal." },
        ].filter(Boolean);
        try {
            const blob = await window.ReportePDF.generar({
                titulo: "Informe de Fair Play — " + evento(),
                subtitulo: "Al " + window.HoraCR.fechaHora(new Date()) + (datos.nombre ? " · lo bajó " + datos.nombre : ""),
                pie: evento() + " · ajedrez-integral.com · Documento confidencial del equipo de Fair Play",
                bloques, fotos: [],
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = "informe-fair-play-" + archivo(evento()) + ".pdf";
            document.body.append(a); a.click(); a.remove();
        } catch (e) { avisar("No se pudo armar el informe: " + (e.message || e), true); }
    }

    // ---------------------------------------------------------------- el informe de UN jugador (para presentar un caso)
    // Lo que pide la Comisión de Fair Play de FIDE para mirar un caso: quién es, contra qué se lo comparó, todas sus partidas
    // medidas con su índice y sus señales, por qué se marcó cada una, el método y qué tan confiable es. Con la marca de agua
    // de Ajedrez Integral (js/reporte-pdf.js) y confidencial. Ver «El informe de un jugador en PDF».
    const FUENTE = { livechess: "Tablero electrónico (LiveChess)", planilla: "Foto de las planillas", lichess: "Lichess" };
    async function informeJugador(x, boton) {
        if (boton) boton.disabled = true;
        try {
            const r = await llamar("jugador", { tnr: x.tnr, clave: x.clave });
            const ix = r.indice || x;
            const partidas = (r.partidas || []).slice().sort((a, b) => (a.ronda - b.ronda) || (a.mesa - b.mesa));
            const m = datos.modelo, v = m && m.validacion;
            const nivel = (z) => (z == null ? "—" : (Number(z) >= 0 ? "+" : "") + uno(z));
            const bloques = [
                { tipo: "titulo", texto: "El jugador" },
                { tipo: "lista", items: [
                    "Jugador: " + (ix.jugador || x.jugador) + " · categoría: " + nombreDe(x.tnr) + ".",
                    ix.elo ? "Elo con que juega el torneo: " + ix.elo + (ix.elo_usado && ix.elo_usado > ix.elo ? "; se lo comparó como un " + ix.elo_usado + " (lo que se le reconoce por cómo viene subiendo y por lo que rindió)." : ".") : "Sin Elo: comparado con el promedio de su categoría, sin él.",
                    "Partidas medidas: " + ix.partidas + " (rondas " + ix.rondas + "), " + ix.jugadas + " jugadas que no eran forzadas ni de teoría.",
                ] },
                { tipo: "titulo", texto: "El índice (como el de FIDE)" },
                { tipo: "lista", items: [
                    "Índice del torneo: " + (ix.roi != null ? uno(ix.roi) : "—") + ". Lo normal es 50 y cada 5 puntos es una desviación; desde 60 se mira y desde 62,5 es muy alto.",
                    "Primera del motor: jugó " + ix.t1 + " de " + ix.jugadas + "; lo esperable para su nivel, " + uno(ix.e_t1) + " (" + nivel(ix.z_t1) + " desviaciones).",
                    "Lo que perdió por jugada: " + uno(ix.dj / Math.max(1, ix.jugadas)) + " puntos de probabilidad de ganar; lo esperable, " + uno(ix.e_dj / Math.max(1, ix.jugadas)) + " (" + nivel(ix.z_dj) + " desviaciones; menos es más preciso).",
                    ix.dificiles ? "Posiciones de una sola jugada buena: acertó " + ix.t1_dif + " de " + ix.dificiles + "; lo esperable, " + uno(ix.e_t1_dif) + " (" + nivel(ix.z_dif) + ")." : "No tuvo posiciones de una sola jugada buena que medir.",
                ] },
                { tipo: "titulo", texto: "Lo que se tuvo en cuenta" },
                { tipo: "lista", items: notasDe(ix).map((n) => (n.alto ? "[ALTA] " : "") + n.texto).concat(notasDe(ix).length ? [] : ["Nada más que su Elo y sus partidas."]) },
                { tipo: "titulo", texto: "Partida por partida" },
                partidas.length ? { tipo: "tabla", encabezados: ["Ronda", "Mesa", "Color", "Rival", "Resultado", "Jugadas", "Primera del motor (jugó / esperable)", "Índice", "De dónde"], anchos: [0.6, 0.6, 0.8, 2, 0.9, 0.8, 1.6, 0.7, 1.6],
                    filas: partidas.map((a) => [String(a.ronda), String(a.mesa), COLOR[a.color] || a.color, conElo(a.rival, a.rival_elo), a.resultado || "—", String(a.m_jugadas || a.jugadas), a.m_jugadas ? a.m_t1 + " / " + uno(a.m_e_t1) : "—", a.roi != null ? uno(a.roi) : "—", FUENTE[a.fuente] || a.fuente || "—"]) }
                    : { tipo: "parrafo", texto: "No hay partidas medidas." },
                ...partidas.filter((a) => a.roi != null && Number(a.roi) >= 55 || a.nivel !== "normal").flatMap((a) => [
                    { tipo: "subtitulo", texto: "Ronda " + a.ronda + ", mesa " + a.mesa + " (" + (COLOR[a.color] || a.color).toLowerCase() + ") contra " + conElo(a.rival, a.rival_elo) },
                    { tipo: "parrafo", texto: resumenAlerta(a) },
                    { tipo: "lista", items: explicar(a).map((y) => (y.alto ? "[ALTA] " : "") + y.texto) },
                ]),
                { tipo: "titulo", texto: "Cómo se midió" },
                { tipo: "parrafo", texto: "Cada jugada desde que termina la teoría (las partidas de maestros) se analiza con Stockfish, o con la evaluación más honda de la nube de Lichess cuando la tiene, y se compara con lo que elegiría alguien de su nivel según un modelo por jugada como el de Ken Regan (el que usa FIDE): en cada posición, la probabilidad de cada jugada según cuánto peor es que la mejor. El modelo se ajusta con las jugadas de los jugadores con Elo del torneo y de partidas de referencia de otros torneos, cada ritmo por separado. No cuentan las jugadas forzadas, las de posiciones ya decididas (6 peones o más) ni, en las partidas leídas de la foto de las planillas, las que la lectura dejó dudosas." },
                v ? { tipo: "parrafo", texto: "Qué tan confiable es, con los " + v.jugadores + " jugadores medidos: alarmas falsas, " + uno(v.falsas_a_mirar) + " % desde 60 (por azar, " + uno(v.esperadas_a_mirar) + " %); si alguien usara el motor en 2 de cada 10 jugadas, lo marcaría el " + uno(((v.deteccion || {})["0.2"] || {}).a_mirar || 0) + " % de las veces." + (v.casos ? " Con " + v.casos.con_trampa + " casos de prueba donde se sabe quién usó el motor, marcó al " + uno(v.casos.marcados_a_mirar) + " %." : "") } : null,
                { tipo: "nota", texto: NO_SIGNIFICA },
                { tipo: "nota", texto: "Documento confidencial del equipo de Fair Play y del árbitro principal. Lo bajó " + (datos.nombre || "—") + " el " + window.HoraCR.fechaHora(new Date()) + "." },
            ].filter(Boolean);
            const blob = await window.ReportePDF.generar({
                titulo: "Fair Play: " + (ix.jugador || x.jugador),
                subtitulo: evento() + " · " + nombreDe(x.tnr) + " · al " + window.HoraCR.fechaHora(new Date()),
                pie: evento() + " · ajedrez-integral.com · Documento confidencial del equipo de Fair Play",
                bloques, fotos: [],
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = "fair-play-" + archivo(ix.jugador || x.jugador || "jugador") + ".pdf";
            document.body.append(a); a.click(); a.remove();
        } catch (e) { avisar("No se pudo armar el informe del jugador: " + (e.message || e), true); }
        finally { if (boton) boton.disabled = false; }
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
                        el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: "https://wa.me/?text=" + encodeURIComponent("Tu pantalla de Fair Play de " + evento() + " (no la compartas): " + url), target: "_blank", rel: "noopener" }, "Mandar por WhatsApp"),
                        el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "apagar", onclick: () => apagarEnlace(x) }, "Apagar"))),
                window.QrSvg ? window.QrSvg.dibujar(url, "QR de Fair Play de " + x.nombre, { marca: true }) : null);
        }));
    }

    async function crearEnlace(e) {
        e.preventDefault();
        const nombre = $("fp-enlace-nombre").value.trim();
        if (!nombre) return;
        const { error } = await window.sb.from("centroamericano_fp_enlaces").insert({ nombre, vence: new Date(Date.now() + VENCE_DIAS * 864e5).toISOString() });
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

    // ---------------------------------------------------------------- por qué: cada señal en una frase
    // De una alerta (centroamericano_fp_analisis), lo que la explica, con su comparación: { alto, texto, momento? }.
    // Una sola copia para la tarjeta y el informe en PDF. Ver «El detector de Fair Play, jugada por jugada».
    const pct = (a, b) => Math.round((100 * a) / b) + " %";
    const seg = (n) => { n = Math.round(Number(n)); return n < 60 ? n + " s" : Math.floor(n / 60) + " min" + (n % 60 ? " " + (n % 60) + " s" : ""); };
    const desv = (z) => (z == null ? "" : " (" + uno(Math.abs(z)) + (Math.abs(Number(z)) === 1 ? " desviación" : " desviaciones") + (z >= 0 ? " arriba" : " abajo") + ")");
    function explicar(a) {
        const out = [];
        const contra = a.comparado === "categoria" ? "el promedio de su categoría (no tiene Elo)" : "lo esperable para su Elo en este torneo";
        const alto = (z) => z != null && Number(z) >= 2;
        const nivelDe = a.comparado === "categoria" ? "alguien de su categoría" : "alguien de su Elo";
        if (a.roi != null) {
            out.push({ alto: Number(a.roi) >= 60, texto: "Índice como el de FIDE: " + uno(a.roi) + " (lo normal es 50; cada 5 puntos es una desviación; desde 60 se mira)." });
            if (a.m_jugadas) out.push({ alto: alto(a.m_z_t1), texto: "Según lo difícil de cada posición, " + nivelDe + " jugaría la primera del motor unas " + uno(a.m_e_t1) + " de " + a.m_jugadas + " veces; la jugó " + a.m_t1 + "." });
            if (a.m_jugadas) out.push({ alto: alto(a.m_z_dj), texto: "Perdió en promedio " + uno(a.m_dj / a.m_jugadas) + " puntos de probabilidad de ganar por jugada; lo esperable para " + nivelDe.replace("alguien de ", "") + ": " + uno(a.m_e_dj / a.m_jugadas) + "." });
        }
        if (a.roi != null) out.push(...notasDe(filaIndice(a.tnr, a.jugador)));
        if (a.desde_jugada) out.push({ alto: false, texto: "Se midió desde la jugada " + a.desde_jugada + ": lo de antes era teoría (partidas de maestros) o apertura." });
        if (a.profunda) out.push({ alto: false, texto: "Confirmado con el análisis hondo (profundidad 20)." });
        out.push({ alto: alto(a.z), texto: "Precisión: " + uno(a.precision) + " % en " + a.jugadas + " jugadas" + (a.esperada != null ? "; " + contra + ": " + uno(a.esperada) + " %" + desv(a.z) : "") + "." });
        if (a.consideradas) {
            out.push({ alto: alto(a.z_t1), texto: "Jugó la primera opción de Stockfish en " + a.t1 + " de " + a.consideradas + " jugadas (" + pct(a.t1, a.consideradas) + ")" + (a.esperada_t1 != null ? "; " + contra + ": " + uno(a.esperada_t1) + " %" + desv(a.z_t1) : "") + ". Una de las tres mejores: " + a.top3 + " de " + a.consideradas + "." });
            out.push(a.dificiles
                ? { alto: alto(a.z_dif), texto: "Posiciones difíciles (una sola jugada buena, que no es jaque ni captura): " + a.dificiles + ", y acertó " + a.dificiles_ok + (a.esperada_dif != null ? "; " + contra + ": " + uno(a.esperada_dif) + " % de acierto" + desv(a.z_dif) : "") + "." }
                : { alto: false, texto: "No tuvo posiciones difíciles que medir (de una sola jugada buena)." });
            if (a.seg_dificil != null && a.seg_resto != null) out.push({ alto: !!a.tiempo_raro, texto: "Tiempo: en las difíciles pensó " + seg(a.seg_dificil) + " en promedio; en las demás, " + seg(a.seg_resto) + "." + (a.tiempo_raro ? " Pensó menos justo donde era más difícil." : "") });
            if (a.tras_levantarse) out.push({ alto: a.tras_levantarse >= 3 && a.tras_levantarse_t1 === a.tras_levantarse, texto: "El árbitro anotó que se levantó de la mesa: en las " + a.tras_levantarse + (a.tras_levantarse === 1 ? " jugada" : " jugadas") + " de los 5 minutos siguientes, jugó la primera del motor " + a.tras_levantarse_t1 + (a.tras_levantarse_t1 === 1 ? " vez." : " veces.") });
            if (a.consideradas < 20) out.push({ alto: false, texto: "Pocas jugadas medidas (" + a.consideradas + "): la medida es menos segura." });
        }
        (a.momentos || []).forEach((m) => out.push({ alto: false, momento: true, texto: "Jugada " + m.jugada + ". " + m.san + ": la única buena de la posición" + (m.segundos != null ? ", en " + seg(m.segundos) : "") + "." }));
        return out;
    }
    // La frase de arriba: cuántas señales salieron altas y cuáles.
    function resumenAlerta(a) {
        const altas = [a.z >= 2 && "precisión", a.z_t1 >= 2 && "primera del motor", a.z_dif >= 2 && "posiciones difíciles"].filter(Boolean);
        if (a.roi != null) return "Índice " + uno(a.roi) + ": " + (Number(a.z_modelo) > 0 ? uno(a.z_modelo) + (Number(a.z_modelo) === 1 ? " desviación" : " desviaciones") + " arriba de lo normal para su nivel" : "dentro de lo normal para su nivel") + "." + (altas.length ? " Otras señales altas: " + altas.join(", ") + "." : "");
        if (a.senales == null && a.consideradas == null) return "Solo con la precisión (analizada antes de las señales jugada por jugada).";
        return (altas.length ? altas.length + (altas.length === 1 ? " señal alta" : " señales altas") + " de 3: " + altas.join(", ") : "Ninguna señal pasa de 2 desviaciones") + (a.tiempo_raro ? ", y el tiempo" : "") + ".";
    }

    // ---------------------------------------------------------------- Stockfish en esta computadora
    const motorEncendido = () => { try { return localStorage.getItem(MOTOR_GUARDADO) !== "no"; } catch (e) { return true; } };
    const estadoMotor = (t) => { const n = $("fp-motor-estado"); if (n) n.textContent = t; };

    function arrancarMotor() {
        if (motor) return Promise.resolve(motor);
        if (motorArranque) return motorArranque;
        motorArranque = new Promise((listo) => {
            let w;
            try { w = new Worker(MOTOR_URL); } catch (e) { motorArranque = null; listo(null); return; }
            const tope = setTimeout(() => { w.terminate(); motorArranque = null; listo(null); }, 30000);
            w.onerror = () => { clearTimeout(tope); w.terminate(); motor = null; motorArranque = null; listo(null); };
            w.onmessage = (e) => {
                if (String(e.data).indexOf("uciok") === -1) return;
                clearTimeout(tope);
                motor = w;
                listo(w);
            };
            w.postMessage("uci");
        });
        return motorArranque;
    }

    // La evaluación de una posición en centipeones PARA LAS BLANCAS (un mate, ±10000), de la última línea «info … score»
    // que dio Stockfish: él la da desde el lado que mueve. «mate 0» es que quien mueve ya está en mate.
    function puntaje(linea, fen) {
        const m = String(linea || "").match(/\bscore (cp|mate) (-?\d+)/);
        if (!m) return null;
        const n = Number(m[2]);
        const v = m[1] === "mate" ? (n > 0 ? 10000 : -10000) : Math.max(-10000, Math.min(10000, n));
        return String(fen).split(" ")[1] === "b" ? -v : v;
    }

    // Las mejores jugadas de una posición (MultiPV), cada una con su evaluación para las blancas, la mejor primero:
    // { cp: la de la mejor, opciones: [[jugada UCI, cp], …] }. En una posición terminada (mate o ahogado), sin opciones.
    function opcionesDe(lineas, ultima, fen) {
        const opciones = Object.keys(lineas).sort((a, b) => a - b)
            .map((k) => [(lineas[k].match(/ pv (\S+)/) || [])[1], puntaje(lineas[k], fen)])
            .filter((o) => o[0] && o[1] != null).slice(0, 20);
        return { cp: opciones.length ? opciones[0][1] : puntaje(ultima, fen), opciones };
    }

    // La posición en la nube de Lichess, en el mismo formato que opcionesDe(): solo si está analizada a 20 o más y trae
    // tantas opciones como se piden (o todas las jugadas legales, si son menos). Las evaluaciones de Lichess ya vienen
    // para las blancas; el enroque puede venir como «el rey a su torre» (e1h1) y se pasa al de siempre (e1g1).
    async function nube(fen, multipv) {
        if (Date.now() < nubePausa || !window.fetch || !window.Chess) return null;
        let juego, legales;
        try { juego = new window.Chess(fen); legales = juego.moves().length; } catch (e) { return null; }
        if (legales <= 1) return null;
        try {
            const corte = typeof AbortController === "function" ? new AbortController() : null;
            const reloj = corte ? setTimeout(() => corte.abort(), 4000) : null;
            const r = await fetch(NUBE + "?multiPv=" + multipv + "&fen=" + encodeURIComponent(fen), corte ? { signal: corte.signal } : {});
            if (reloj) clearTimeout(reloj);
            if (r.status === 429) { nubePausa = Date.now() + 60000; return null; }
            if (!r.ok) return null;
            const d = await r.json();
            // La nube suele guardar 5 opciones: si se piden más (10), con 5 alcanza (lo de más va junto en el modelo).
            if (!d || !(d.depth >= NUBE_PROFUNDIDAD) || !Array.isArray(d.pvs) || d.pvs.length < Math.min(multipv, 5, legales)) return null;
            const opciones = d.pvs.slice(0, multipv).map((pv) => {
                let uci = String(pv.moves || "").split(" ")[0];
                const pieza = uci.length >= 4 ? juego.get(uci.slice(0, 2)) : null;
                if (CASTILLO[uci] && pieza && pieza.type === "k") uci = CASTILLO[uci];
                const cp = pv.mate != null ? (pv.mate > 0 ? 10000 : -10000) : Math.max(-10000, Math.min(10000, Math.round(Number(pv.cp))));
                return [uci, cp];
            }).filter((o) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(o[0]) && Number.isFinite(o[1]));
            if (!opciones.length) return null;
            return { cp: opciones[0][1], opciones };
        } catch (e) { return null; }
    }

    // como: { multipv, profundidad, nodos } (lo dice la función: profundidad fija para que dos computadoras den lo mismo,
    // y la honda para confirmar una alerta). Sin profundidad, por nodos. Primero la nube de Lichess (más honda).
    async function evaluar(fen, como) {
        const c = como || {};
        posicionesAqui++;
        const n = await nube(fen, c.multipv || 3);
        if (n) { deLaNube++; return n; }
        return calcular(fen, c);
    }
    // La mirada corta: lo que parece mejor a primera vista (a poca profundidad), para las trampas. [jugada UCI, cp] o null.
    async function mirada(fen, profundidad) {
        if (!profundidad || !motor) return null;
        const r = await calcular(fen, { multipv: 1, profundidad, nodos: 200000 });
        return r && r.opciones && r.opciones[0] ? r.opciones[0] : null;
    }
    function calcular(fen, c) {
        const multipv = c.multipv || 3;
        if (multipv !== multipvActual) { motor.postMessage("setoption name MultiPV value " + multipv); multipvActual = multipv; }
        return new Promise((listo) => {
            let ultima = null;
            const lineas = {};
            const tope = setTimeout(() => { motor.onmessage = null; listo(null); }, 60000);
            motor.onmessage = (e) => {
                const l = String(e.data);
                if (/^info .*\bscore /.test(l)) {
                    const k = (l.match(/\bmultipv (\d+)/) || [])[1];
                    if (k && / pv \S/.test(l)) lineas[k] = l; else ultima = l;
                } else if (l.startsWith("bestmove")) { clearTimeout(tope); listo(opcionesDe(lineas, ultima, fen)); }
            };
            motor.postMessage("position fen " + fen);
            motor.postMessage(c.profundidad ? "go depth " + c.profundidad + " nodes " + (c.nodos || TOPE_NODOS) : "go nodes " + (c.nodos || ctx.nodos || NODOS));
        });
    }

    // Pide las partidas terminadas que faltan y las analiza una por una, hasta que no quede ninguna (o se apague, o se
    // esconda la pantalla). La función reserva cada partida 3 minutos: dos pantallas abiertas se reparten el trabajo.
    async function analizar() {
        if (analizando || !ctx) return;
        const casilla = $("fp-motor-si");
        if (casilla) casilla.checked = motorEncendido();
        if (!motorEncendido()) { estadoMotor("Apagado en esta computadora: las partidas las analiza otra pantalla de Fair Play que lo tenga encendido."); return; }
        if (ctx.visible && !ctx.visible()) return;
        if (Date.now() - ultimoMotor < MOTOR_CADA_MS) return;
        analizando = true;
        ultimoMotor = Date.now();
        let hechas = 0;
        try {
            if (!(await arrancarMotor())) { estadoMotor("Esta computadora no pudo arrancar Stockfish: las partidas las analiza otra pantalla de Fair Play."); return; }
            for (let vuelta = 0; vuelta < 40; vuelta++) {
                const r = await llamar("vivo_pendientes");
                if (!r.partidas || !r.partidas.length) {
                    estadoMotor(r.conectada === false ? "No hay tableros electrónicos de LiveChess cargados en «Árbitros y mesas»." : "Al día: ninguna partida terminada por analizar" + (analizadasAqui ? " · " + analizadasAqui + " analizadas en esta computadora" : "") + (deLaNube ? " · " + deLaNube + " de " + posicionesAqui + " posiciones salieron de la nube de Lichess (más hondas)" : "") + ". Se vuelve a mirar cada 45 s.");
                    break;
                }
                for (const p of r.partidas) {
                    const evals = p.posiciones.map(() => null), opciones = p.posiciones.map(() => null), superficiales = p.posiciones.map(() => null);
                    const total = Math.ceil(p.posiciones.length / 2);
                    for (let i = p.desde; i < p.posiciones.length; i++) {
                        if (!motorEncendido() || (ctx.visible && !ctx.visible())) { estadoMotor("En pausa: se sigue cuando vuelvas a esta pantalla."); return; }
                        if (i % 6 === p.desde % 6) estadoMotor("🤖 " + (p.honda ? "Confirmando a fondo (alerta) " : "Analizando ") + nombreDe(p.tnr) + ", ronda " + p.ronda + ", mesa " + p.mesa + (p.fuente === "planilla" ? " (de la foto de la planilla)" : "") + " (" + p.blancas + " – " + p.negras + "): jugada " + (Math.floor(i / 2) + 1) + " de " + total + (r.quedan ? " · faltan " + r.quedan + " partidas más" : "") + ".");
                        const ev = await evaluar(p.posiciones[i], { multipv: p.multipv || r.multipv, profundidad: p.profundidad, nodos: r.nodos });   // cuánto pensar lo dice la función
                        if (ev) { evals[i] = ev.cp; opciones[i] = ev.opciones; }
                        if (p.superficial) superficiales[i] = await mirada(p.posiciones[i], p.superficial);
                    }
                    await llamar("vivo_guardar", { tnr: p.tnr, ronda: p.ronda, mesa: p.mesa, evals, opciones, superficiales, honda: !!p.honda });
                    hechas++;
                    analizadasAqui++;
                }
            }
        } catch (e) {
            estadoMotor("No se pudo analizar: " + (e.message || e) + ". Se vuelve a intentar en un momento.");
        } finally {
            analizando = false;
            if (hechas) await cargar();
        }
    }

    // ---------------------------------------------------------------- las partidas de referencia
    // Un PGN con el Elo de cada jugador: cada partida se arma con chess.js (js/vendor/chess.js), se analiza aquí con el
    // mismo motor que las del torneo y se manda a «referencia_guardar» (que la vuelve a armar y la comprueba).
    const huella = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
    let detenerReferencia = false;
    // Clásica según FIDE: 60 minutos o más para 60 jugadas (la base más 60 veces el incremento). «5400+30», «40/5400+30:1800+30».
    // Sin TimeControl (o uno que no se entiende), se toma como clásica.
    function esClasica(tc) {
        const m = String(tc || "").match(/^(?:\d+\/)?(\d+)(?:\+(\d+))?/);
        return !m || Number(m[1]) + 60 * Number(m[2] || 0) >= 3600;
    }
    // Quién hizo trampa en una partida de prueba: la etiqueta [Trampa "Blancas"] (o «White», «Negras», «Black»).
    // [TrampaPorcentaje "30"]: en qué proporción de sus jugadas usó el motor (para medir cuánto marca en cada una).
    const trampaPctDe = (h) => { const n = Math.round(Number(String((h && (h.TrampaPorcentaje || h.CheatPercent)) || "").replace(/[%\s]/g, ""))); return n >= 1 && n <= 100 ? n : null; };
    function trampaDe(h) {
        const t = String((h && (h.Trampa || h.Cheat)) || "").trim().toLowerCase();
        return /^(blancas|white|w)$/.test(t) ? "blancas" : /^(negras|black|b)$/.test(t) ? "negras" : null;
    }
    // Cada partida, con un nombre que no cambia entre cargas (las jugadas y quiénes la jugaron, como huella: los nombres
    // no se guardan). Sin el Elo de ninguno, con menos de 20 jugadas o rápida, no sirve y no se toma.
    function partidasDePgn(texto) {
        return String(texto || "").split(/\r?\n\s*\r?\n(?=\[Event )/).map((bloque) => {
            const juego = new window.Chess();
            if (!juego.load_pgn(bloque, { sloppy: true })) return null;
            const h = juego.header(), jugadas = juego.history();
            const elo_b = Number(h.WhiteElo) || null, elo_n = Number(h.BlackElo) || null;
            if ((!elo_b && !elo_n) || jugadas.length < 20 || !esClasica(h.TimeControl)) return null;
            const repaso = new window.Chess(), posiciones = jugadas.map((m) => { repaso.move(m); return repaso.fen(); });
            return { partida: huella([h.White, h.Black, h.Date, h.Round, jugadas.join(" ")].join("|")), elo_b, elo_n, jugadas, posiciones, trampa: trampaDe(h), trampa_pct: trampaPctDe(h) };
        }).filter(Boolean);
    }
    // El PGN de una transmisión de Lichess: de un torneo entero (lichess.org/broadcast/<nombre>/<id>) o de una ronda
    // (lichess.org/broadcast/<nombre>/<ronda>/<id>).
    async function pgnDeTransmision(enlace) {
        const m = String(enlace).match(/lichess\.org\/broadcast\/([^/?#]+)\/([^/?#]+)(?:\/([^/?#]+))?/);
        if (!m) throw new Error("ese enlace no es de una transmisión de Lichess (lichess.org/broadcast/…)");
        const url = m[3] ? "https://lichess.org/api/broadcast/round/" + m[3] + ".pgn" : "https://lichess.org/api/broadcast/" + m[2] + ".pgn";
        const r = await fetch(url);
        if (!r.ok) throw new Error("Lichess contestó " + r.status + " al pedir la transmisión");
        return r.text();
    }
    async function cargarReferencia(e) {
        e.preventDefault();
        const evento = $("fp-ref-evento").value.trim(), archivos = [...($("fp-ref-archivo").files || [])], enlace = $("fp-ref-enlace").value.trim();
        const prueba = $("fp-ref-tipo").value === "prueba";
        if (!evento || !window.Chess || (!archivos.length && !enlace)) { $("fp-ref-estado").textContent = "Falta el evento y un archivo PGN o el enlace de una transmisión."; return; }
        if (analizando) { avisar("Esta computadora está analizando partidas del torneo: prueba en un momento.", true); return; }
        analizando = true; detenerReferencia = false;
        $("fp-ref-cargar").disabled = true; $("fp-ref-detener").hidden = false;
        let hechas = 0, jugadas = 0, total = 0;
        try {
            const textos = await Promise.all(archivos.map((a) => a.text()));
            if (enlace) { $("fp-ref-estado").textContent = "Pidiendo la transmisión a Lichess…"; textos.push(await pgnDeTransmision(enlace)); }
            let partidas = textos.flatMap(partidasDePgn);
            if (prueba) partidas = partidas.filter((p) => p.trampa);
            if (!partidas.length) { $("fp-ref-estado").textContent = prueba ? "Ninguna partida trae la etiqueta [Trampa \"Blancas\"] o [Trampa \"Negras\"] (con el Elo de los jugadores y 20 jugadas o más)." : "No hay partidas clásicas con el Elo de los jugadores (WhiteElo, BlackElo) y 20 jugadas o más."; return; }
            const ya = new Set((await llamar("referencia_hechas", { evento })).partidas || []);
            const vistas = new Set();
            partidas = partidas.filter((p) => !ya.has(p.partida) && !vistas.has(p.partida) && vistas.add(p.partida));
            total = partidas.length;
            if (!total) { $("fp-ref-estado").textContent = "Todas esas partidas de «" + evento + "» ya estaban cargadas."; }
            if (total && !(await arrancarMotor())) throw new Error("esta computadora no pudo arrancar Stockfish");
            const inicio = Date.now();
            for (const p of partidas) {
                if (detenerReferencia) break;
                const evals = p.posiciones.map(() => null), opciones = p.posiciones.map(() => null), superficiales = p.posiciones.map(() => null);
                for (let i = 15; i < p.posiciones.length; i++) {
                    if (detenerReferencia) break;
                    const ev = await evaluar(p.posiciones[i], { multipv: 10, profundidad: 12 });
                    if (ev) { evals[i] = ev.cp; opciones[i] = ev.opciones; }
                    superficiales[i] = await mirada(p.posiciones[i], 5);
                }
                if (detenerReferencia) break;
                const r = await llamar("referencia_guardar", { evento, partida: p.partida, elo_b: p.elo_b, elo_n: p.elo_n, jugadas: p.jugadas, evals, opciones, superficiales,
                    trampa: prueba ? p.trampa : null, trampa_pct: prueba ? p.trampa_pct : null });
                hechas++; jugadas += r.jugadas || 0;
                const faltan = Math.round(((Date.now() - inicio) / hechas) * (total - hechas) / 60000);
                $("fp-ref-estado").textContent = "Cargadas " + hechas + " de " + total + " (" + jugadas + " jugadas)" + (ya.size ? "; " + ya.size + " ya estaban" : "") + (total > hechas ? " · faltan unos " + faltan + " min" : "") + ".";
            }
            if (!hechas) return;
            const listo = (detenerReferencia ? "Detenido: " : "Listo: ") + hechas + (hechas === 1 ? " partida" : " partidas") + " de «" + evento + "» (" + jugadas + " jugadas)" + (detenerReferencia ? "; para seguir, vuelve a cargar lo mismo" : "") + ". ";
            $("fp-ref-estado").textContent = listo + "Recalculando el modelo…";
            // Se vuelve a ajustar ya (sin esperar a que entre otra partida del torneo), con las referencias nuevas.
            const m = await llamar("modelo", { forzar: true }).catch((err) => ({ error: err.message || String(err) }));
            $("fp-ref-estado").textContent = listo + (m.error ? "No se pudo recalcular el modelo ahora (" + m.error + "): se recalcula solo con la próxima partida del torneo."
                : m.insuficiente ? "El modelo todavía no se ajusta: hay " + (m.movimientos || 0) + " jugadas de jugadores con Elo y hacen falta 600."
                : "El modelo se recalculó con ellas.");
            cargar();
        } catch (err) {
            $("fp-ref-estado").textContent = "Se cortó" + (total ? " en la partida " + (hechas + 1) + " de " + total : "") + ": " + (err.message || err) + ". Lo cargado hasta ahí quedó guardado; si vuelves a cargar lo mismo, sigue donde quedó.";
        } finally { analizando = false; $("fp-ref-cargar").disabled = false; $("fp-ref-detener").hidden = true; }
    }

    // ---------------------------------------------------------------- arranque
    function iniciar(c) {
        ctx = c;
        armar();
        cargar();
        analizar();
        setInterval(() => {
            if (ctx.visible && !ctx.visible()) return;
            if (Date.now() - ultimaActualizacion > ACTUALIZAR_MS) actualizar(false); else cargar();
            analizar();
        }, LEER_MS);
    }

    window.CentroamericanoFairPlay = { iniciar, cargar, ESTADOS, RESULTADOS, puntaje, opcionesDe, explicar, resumenAlerta, partidasDePgn };
})();

/*! rev bfb5bbb0d2d82f9f */
