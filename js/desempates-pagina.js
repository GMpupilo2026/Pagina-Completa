/* El código de desempates.html.

   El cálculo de los 26 desempates del C.07 es js/pareo/desempates.js, el
   mismo motor de Pareo Integral (ya comprobado contra chesspairing y los
   ejercicios de FIDE: ver docs/decisiones/juegos-y-torneos.md). Lo que hay
   acá es: leer el torneo con la Edge Function desempates-chess-results
   (solo con licencia), convertirlo con js/desempates-convertir.js, pintar la
   clasificación recalculada y, para dos personas cualquiera, explicar paso a
   paso por qué una queda arriba de la otra con el desglose de
   PareoDesempates.explicar().

   EL AVISO DE ADVERTENCIAS NUNCA SE OCULTA: si el puntaje reconstruido de
   alguien no coincide con el oficial de chess-results, esa persona entra
   igual a la tabla (para no esconder nada) pero con su fila marcada y el
   aviso arriba explicando por qué no hay que confiar en ella para un
   reclamo. */
(function () {
    "use strict";
    const D = window.PareoDesempates;
    const Cv = window.DesempatesConvertir;
    const $ = (id) => document.getElementById(id);

    const DEFECTO = ["BH-C1", "BH", "SB", "DE", "WIN"];
    let desempatesElegidos = DEFECTO.slice();
    let datosCR = null;       // lo que devolvió la Edge Function
    let conv = null;          // { t, nombres, advertencias, posibleTodos }
    let filas = [];           // la clasificación ya calculada
    let todosTocadoAMano = false;

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
    function avisar(texto, error) { Avisos.avisar(texto, { tipo: error ? "error" : "ok" }); }
    function num(x) { return Number(x).toLocaleString("es-CR", { maximumFractionDigits: 2 }); }
    const C = {
        mini: "border border-brand-300 dark:border-brand-600 text-brand-800 dark:text-white px-2 py-1 rounded-md text-xs font-semibold hover:bg-brand-50 dark:hover:bg-brand-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-40 disabled:cursor-not-allowed",
        miniPeligro: "border border-red-700 text-red-700 dark:border-red-400 dark:text-red-300 px-2 py-1 rounded-md text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
        th: "px-3 py-2",
        td: "px-3 py-2 border-t border-brand-100 dark:border-brand-800",
    };

    // ---------------------------------------------------------- las bases: el orden de desempates

    function pintarDesempates() {
        const ol = $("pi-desempates");
        ol.replaceChildren();
        desempatesElegidos.forEach((c, i) => {
            const info = D.CATALOGO.find((x) => x.codigo === c);
            if (!info) return;
            const mover = (d) => () => {
                const [x] = desempatesElegidos.splice(i, 1);
                desempatesElegidos.splice(i + d, 0, x);
                pintarDesempates();
                recalcular();
            };
            ol.append(el("li", { class: "flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-2" },
                el("span", { class: "font-mono text-xs font-bold w-6 text-right", texto: (i + 1) + "." }),
                el("span", { class: "flex-1 min-w-[10rem]" }, el("span", { class: "font-semibold", texto: info.es }), " ",
                    el("span", { class: "text-xs text-brand-600 dark:text-brand-300", texto: "(" + c + ")" })),
                el("button", { type: "button", class: C.mini, disabled: i === 0, "aria-label": "Subir " + info.es, onclick: mover(-1) }, "↑"),
                el("button", { type: "button", class: C.mini, disabled: i === desempatesElegidos.length - 1, "aria-label": "Bajar " + info.es, onclick: mover(1) }, "↓"),
                el("button", { type: "button", class: C.miniPeligro, "aria-label": "Quitar " + info.es, onclick: () => { desempatesElegidos.splice(i, 1); pintarDesempates(); recalcular(); } }, "Quitar")
            ));
        });
        if (!desempatesElegidos.length) ol.append(el("li", { class: "text-sm italic text-brand-500 dark:text-brand-300", texto: "Sin desempates: solo se ordena por puntos." }));
        const s = $("pi-desempate-nuevo");
        s.replaceChildren();
        for (const x of D.CATALOGO) if (!desempatesElegidos.includes(x.codigo)) s.append(el("option", { value: x.codigo, texto: x.es + " (" + x.codigo + ")" }));
        $("pi-desempate-agregar").disabled = !s.options.length;
    }

    // ---------------------------------------------------------- leer chess-results

    async function leerTorneo(url) {
        let { data, error } = await sb.functions.invoke("desempates-chess-results", { body: { url } });
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) throw new Error((data && data.error) || (error && error.message) || "chess-results no contestó");
        return data;
    }

    async function cargarYCalcular() {
        const url = $("c-url").value.trim();
        if (!url) { avisar("Pega el enlace de un torneo de chess-results.", true); return; }
        $("b-calcular").disabled = true;
        $("estado").textContent = "Leyendo chess-results…";
        try {
            datosCR = await leerTorneo(url);
            if (!todosTocadoAMano) {
                const previo = Cv.convertir(datosCR, { todos: false });
                $("c-todos").checked = previo.posibleTodos;
                $("c-todos-aviso").classList.toggle("hidden", !previo.posibleTodos);
            }
            $("estado").textContent = datosCR.viejo ? "Leído hace un rato: chess-results no contestó ahora, se muestra lo último que se guardó." : "Leído.";
            recalcular();
        } catch (e) {
            $("estado").textContent = "";
            avisar(e.message || String(e), true);
        } finally {
            $("b-calcular").disabled = false;
        }
    }

    function recalcular() {
        if (!datosCR) return;
        conv = Cv.convertir(datosCR, { todos: $("c-todos").checked });
        filas = D.clasificacion(conv.t, desempatesElegidos);
        pintarAvisos();
        pintarResultados();
        pintarSelectoresExplicar();
    }

    // ---------------------------------------------------------- avisos de puntaje

    function pintarAvisos() {
        const sec = $("zona-avisos");
        const ul = $("avisos");
        ul.replaceChildren();
        const adv = (conv && conv.advertencias) || [];
        sec.classList.toggle("hidden", adv.length === 0);
        adv.forEach((a) => {
            ul.append(el("li", {}, `${a.nombre}: chess-results dice ${num(a.oficial)} puntos; con las rondas que se pudieron leer sale ${num(a.calculado)}.`));
        });
    }

    // ---------------------------------------------------------- la clasificación

    function nombreDe(id) { return (conv && conv.nombres[id]) || id; }
    function tieneAdvertencia(id) { return (conv.advertencias || []).some((a) => a.id === id); }

    function pintarResultados() {
        const sec = $("zona-resultados");
        sec.classList.toggle("hidden", filas.length === 0);
        if (!filas.length) return;
        $("r-titulo").textContent = (datosCR.titulo || "") + (datosCR.rondasJugadas ? ` · ${datosCR.rondasJugadas} rondas` : "");

        const encabezado = $("r-encabezado");
        encabezado.replaceChildren(
            el("th", { class: C.th, scope: "col", texto: "#" }),
            el("th", { class: C.th, scope: "col", texto: "Jugador" }),
            el("th", { class: C.th + " text-right", scope: "col", texto: "Puntos" }),
            ...desempatesElegidos.map((c) => el("th", { class: C.th + " text-right", scope: "col" },
                el("abbr", { title: (D.CATALOGO.find((x) => x.codigo === c) || {}).es }, c))),
            el("th", { class: C.th, scope: "col" })
        );

        const cuerpo = $("r-filas");
        cuerpo.replaceChildren();
        filas.forEach((f, i) => {
            const fila = el("tr", { class: tieneAdvertencia(f.id) ? "bg-amber-50 dark:bg-amber-950" : "" },
                el("td", { class: C.td, texto: f.puesto }),
                el("td", { class: C.td }, nombreDe(f.id), tieneAdvertencia(f.id) ? el("span", { class: "ml-2 text-amber-700 dark:text-amber-300", title: "El puntaje no coincide con el oficial: ver el aviso de arriba." }, "⚠️") : null),
                el("td", { class: C.td + " text-right font-semibold", texto: num(f.puntos) }),
                ...desempatesElegidos.map((c) => el("td", { class: C.td + " text-right", texto: num(f.valores[c]) })),
                el("td", { class: C.td })
            );
            if (i > 0) {
                const anterior = filas[i - 1];
                fila.lastChild.appendChild(el("button", {
                    type: "button", class: C.mini, onclick: () => {
                        $("e-a").value = anterior.id;
                        $("e-b").value = f.id;
                        explicarPar();
                        $("zona-explicacion").scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                }, "¿Por qué aquí?"));
            }
            cuerpo.appendChild(fila);
        });
    }

    function pintarSelectoresExplicar() {
        ["e-a", "e-b"].forEach((idSel) => {
            const s = $(idSel);
            const anterior = s.value;
            s.replaceChildren();
            filas.forEach((f) => s.append(el("option", { value: f.id, texto: `${f.puesto}. ${nombreDe(f.id)} (${num(f.puntos)} pts)` })));
            if (filas.some((f) => f.id === anterior)) s.value = anterior;
        });
        if (filas.length > 1) { $("e-a").selectedIndex = 0; $("e-b").selectedIndex = 1; }
        $("zona-explicacion").classList.toggle("hidden", filas.length < 2);
    }

    // ---------------------------------------------------------- «por qué»

    function etiquetaRival(id) { return id == null ? "—" : nombreDe(id); }

    function tablaDesglose(desglose) {
        const filasTabla = (desglose.filas || []).map((f) => el("tr", { class: f.incluido === false ? "opacity-50" : "" },
            el("td", { class: C.td, texto: "Ronda " + f.ronda }),
            el("td", { class: C.td, texto: etiquetaRival(f.rivalId) }),
            el("td", { class: C.td, texto: f.resultado || "" }),
            el("td", { class: C.td + " text-right", texto: num(f.valor) }),
            el("td", { class: C.td, texto: f.incluido === false ? ("No cuenta" + (f.motivo ? ": " + f.motivo : "")) : "" })
        ));
        const tabla = el("table", { class: "w-full text-sm mt-2" },
            el("thead", { class: "text-left text-xs uppercase tracking-wide text-brand-500 dark:text-brand-300" },
                el("tr", {}, el("th", { class: C.th }, "Ronda"), el("th", { class: C.th }, desglose.promedio ? "Rival" : "Rival"),
                    el("th", { class: C.th }, "Resultado"), el("th", { class: C.th + " text-right" }, desglose.promedio ? "Su aporte" : "Valor"), el("th", { class: C.th }, ""))),
            el("tbody", {}, filasTabla));
        const partes = [];
        if (desglose.tipo === "formula" && desglose.partes && desglose.partes.length) {
            partes.push(el("ul", { class: "text-sm space-y-1 mt-2" }, desglose.partes.map((p) => el("li", {}, el("span", { class: "font-semibold" }, p.etiqueta + ": "), String(p.valor)))));
        }
        const nota = desglose.nota ? el("p", { class: "text-xs text-brand-500 dark:text-brand-300 mt-2", texto: desglose.nota }) : null;
        return el("div", {}, partes, tabla, nota, el("p", { class: "text-right font-bold mt-1", texto: "Total: " + num(desglose.total) }));
    }

    function explicarPar() {
        const idA = $("e-a").value, idB = $("e-b").value;
        const out = $("e-resultado");
        out.replaceChildren();
        if (!idA || !idB || idA === idB) { out.append(el("p", { class: "text-sm text-brand-500 dark:text-brand-300" }, "Elige dos jugadores distintos.")); return; }
        const fA = filas.find((f) => f.id === idA), fB = filas.find((f) => f.id === idB);
        if (!fA || !fB) return;
        // Si quedaron al revés (B tiene más que A según lo ya calculado), se
        // explican en el orden real: quien de verdad queda arriba, primero.
        const puestoMenor = fA.puesto <= fB.puesto ? fA : fB;
        const puestoMayor = fA.puesto <= fB.puesto ? fB : fA;
        out.append(el("h3", { class: "font-serif text-lg font-bold text-brand-800 dark:text-white" },
            `${nombreDe(puestoMenor.id)} (puesto ${puestoMenor.puesto}) queda arriba de ${nombreDe(puestoMayor.id)} (puesto ${puestoMayor.puesto})`));

        if (puestoMenor.puntos !== puestoMayor.puntos) {
            out.append(el("p", { class: "mt-2" }, `Por los puntos: ${nombreDe(puestoMenor.id)} tiene ${num(puestoMenor.puntos)} y ${nombreDe(puestoMayor.id)} tiene ${num(puestoMayor.puntos)}. No hace falta ningún desempate.`));
            return;
        }
        out.append(el("p", { class: "mt-2" }, `Los dos terminaron con ${num(puestoMenor.puntos)} puntos: se mira el orden de desempates de arriba hacia abajo hasta que uno distinga.`));

        let decidido = false;
        for (const c of desempatesElegidos) {
            const info = D.CATALOGO.find((x) => x.codigo === c) || { es: c };
            const vMenor = puestoMenor.valores[c], vMayor = puestoMayor.valores[c];
            const distinto = vMenor !== vMayor;
            out.append(el("div", { class: "mt-4 pt-4 border-t border-brand-100 dark:border-brand-800" },
                el("p", {}, el("span", { class: "font-semibold" }, info.es + " (" + c + "): "),
                    `${nombreDe(puestoMenor.id)} ${num(vMenor)} — ${nombreDe(puestoMayor.id)} ${num(vMayor)}`,
                    distinto && !decidido ? el("span", { class: "ml-2 font-bold text-accent-600 dark:text-accent-400" }, "← esto decide") : (distinto ? el("span", { class: "ml-2 text-xs text-brand-500 dark:text-brand-300" }, "(ya no hace falta: ya se había decidido antes)") : null))));
            if (distinto && !decidido) {
                decidido = true;
                const grid = el("div", { class: "grid md:grid-cols-2 gap-4 mt-2" },
                    el("div", {}, el("p", { class: "font-semibold" }, nombreDe(puestoMenor.id)), tablaDesglose(D.explicar(conv.t, puestoMenor.id, c))),
                    el("div", {}, el("p", { class: "font-semibold" }, nombreDe(puestoMayor.id)), tablaDesglose(D.explicar(conv.t, puestoMayor.id, c))));
                out.append(grid);
            }
        }
        if (!decidido) {
            out.append(el("p", { class: "mt-4 font-semibold" }, "Quedan empatados en todos los desempates elegidos. Lo que sigue lo dicen las bases del torneo (sorteo, una partida rápida de desempate…), no un número más."));
        }
    }

    // ---------------------------------------------------------- arranque

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        $("loading").classList.add("hidden");
        if (!session) { location.href = "login.html?next=desempates.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "desempates" });
        if (error || puede !== true) { $("denegado").classList.remove("hidden"); return; }
        pintarDesempates();
        $("pi-desempate-agregar").addEventListener("click", () => {
            const c = $("pi-desempate-nuevo").value;
            if (!c) return;
            desempatesElegidos.push(c);
            pintarDesempates();
            recalcular();
        });
        $("b-calcular").addEventListener("click", cargarYCalcular);
        $("c-todos").addEventListener("change", () => { todosTocadoAMano = true; recalcular(); });
        $("e-ver").addEventListener("click", explicarPar);
        $("app").classList.remove("hidden");
    }
    init();
})();
