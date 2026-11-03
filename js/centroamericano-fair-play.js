/* ===== Centroamericano 2026 — el sorteo de Fair Play (pestaña «Fair Play» de centroamericano-mesas.html) =====
 *
 * El árbitro de Fair Play sortea MESAS al azar en cada categoría; de la mesa sorteada se revisa al
 * GANADOR cuando termina la partida (si es tablas, el color que salió en el mismo sorteo). Si aprueba
 * el sorteo, la base le manda el aviso al árbitro de esa mesa para que retenga al jugador y no lo deje
 * salir del local. Después anota cómo terminó la revisión.
 *
 * El azar lo pone la BASE (centroamericano_fair_play_sortear), no este archivo: así nadie puede sortear
 * hasta que salga la mesa que quiere. Una mesa sorteada no vuelve a salir en la ronda, y descartarla pide
 * motivo. Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.
 *
 * La página le pasa lo que ya tiene (iniciar(ctx)): torneos, enlaces, la ronda de cada categoría…
 * Deja window.CentroamericanoFairPlay = { iniciar, cargar, ESTADOS, RESULTADOS }.
 */
(function () {
    "use strict";

    const ESTADOS = { sorteada: "Sorteada: falta decidir", aprobada: "Aprobada: avisado su árbitro", descartada: "Descartada", revisada: "Revisada" };
    const RESULTADOS = { sin_novedad: "Sin novedad", hallazgo: "Hallazgo (se informa al principal)", se_nego: "Se negó a la revisión", no_se_presento: "Se fue sin revisarse" };
    const COLOR = { blancas: "Blancas", negras: "Negras" };

    let ctx = null;
    let filas = [];
    let leidos = {}; // aviso_id → leido_en

    const $ = (id) => document.getElementById(id);

    async function cargar() {
        if (!ctx) return;
        const { data, error } = await window.sb.from("centroamericano_fair_play").select("*").order("creado", { ascending: false }).range(0, 999);
        if (error) { $("fp-estado").textContent = "No se pudo leer el Fair Play: " + error.message; return; }
        filas = (data || []).filter((f) => ctx.dentro(f.tnr));
        const ids = filas.map((f) => f.aviso_id).filter(Boolean);
        leidos = {};
        if (ids.length) {
            const { data: av } = await window.sb.from("centroamericano_avisos").select("id, leido_en").in("id", ids);
            for (const a of av || []) leidos[a.id] = a.leido_en;
        }
        pintar();
    }

    // Las categorías que se pueden sortear: las que tienen árbitros con enlace (del modo actual, real o ensayo).
    function categorias() {
        const con = new Set(ctx.asignaciones().filter((a) => !a.revocada && ctx.dentro(a.tnr)).map((a) => a.tnr));
        return ctx.torneos().filter((t) => con.has(t.tnr));
    }

    function pintarSelect() {
        const sel = $("fp-categoria");
        const antes = sel.value;
        const cats = categorias();
        sel.replaceChildren(ctx.el("option", { value: "", texto: "Todas las categorías (" + cats.length + ")" }),
            ...cats.map((t) => ctx.el("option", { value: t.tnr, texto: t.nombre })));
        if ([...sel.options].some((o) => o.value === antes)) sel.value = antes;
    }

    function pintar() {
        pintarSelect();
        const el = ctx.el;
        const orden = (tnr) => ctx.torneos().findIndex((t) => t.tnr === tnr);
        const lista = [...filas].sort((a, b) => (b.ronda - a.ronda) || (orden(a.tnr) - orden(b.tnr)) || (a.mesa - b.mesa));
        const porDecidir = filas.filter((f) => f.estado === "sorteada").length;
        const porRevisar = filas.filter((f) => f.estado === "aprobada").length;
        $("fp-vacio").hidden = lista.length > 0;
        $("fp-resumen").textContent = lista.length
            ? " — " + lista.length + (lista.length === 1 ? " mesa sorteada" : " mesas sorteadas") + " · " + porDecidir + " por decidir · " + porRevisar + " por revisar"
            : "";
        $("fp-pdf").disabled = lista.length === 0;
        $("fp-lista").replaceChildren(...lista.map((f) => {
            const leido = f.aviso_id ? leidos[f.aviso_id] : null;
            const acciones = f.estado === "sorteada"
                ? [el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "aprobar", onclick: () => aprobar(f) }, "Aprobar y avisar a su árbitro"),
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "descartar", onclick: () => descartar(f) }, "Descartar")]
                : f.estado === "aprobada" || f.estado === "revisada"
                    ? [el("button", { type: "button", class: "cam-btn cam-btn-chico" + (f.estado === "revisada" ? " cam-btn-claro" : ""), "data-accion": "revisar", onclick: () => revisar(f) }, f.estado === "revisada" ? "Corregir la revisión" : "Anotar la revisión")]
                    : [];
            const detalle = f.estado === "descartada" ? "Motivo: " + (f.motivo || "")
                : f.estado === "revisada" ? RESULTADOS[f.resultado] + (f.jugador ? " · " + f.jugador : "") + (f.nota ? " · " + f.nota : "")
                    : f.estado === "aprobada" ? (leido ? "✓ " + (f.arbitro || "Su árbitro") + " lo leyó a las " + window.HoraCR.hora(leido) : "⏳ " + (f.arbitro || "Su árbitro") + " todavía no lo ha leído")
                        : "";
            return el("tr", { "data-id": f.id, "data-estado": f.estado },
                el("td", { texto: ctx.nombreTorneo(f.tnr) }),
                el("td", { texto: String(f.ronda) }),
                el("td", {}, el("strong", { texto: "Mesa " + f.mesa }), el("span", { class: "cam-fp-de", texto: " (de " + f.mesas_en_sorteo + ")" })),
                el("td", { texto: "Ganador · si es tablas: " + COLOR[f.color_si_tablas] }),
                el("td", {}, el("span", { class: "cam-chip", "data-estado": "fp-" + f.estado, texto: ESTADOS[f.estado] }), detalle ? el("span", { class: "cam-fp-detalle", texto: detalle }) : null),
                el("td", { texto: window.HoraCR.hora(f.creado) }),
                el("td", {}, acciones.length ? el("div", { class: "cam-fp-acciones" }, ...acciones) : null));
        }));
    }

    async function sortear() {
        const tnr = $("fp-categoria").value;
        const cats = tnr ? categorias().filter((t) => t.tnr === tnr) : categorias();
        const cantidad = Math.max(1, Math.min(10, Number($("fp-cantidad").value) || 1));
        if (!cats.length) { ctx.avisar("No hay categorías con árbitros: primero se crean los enlaces en «Árbitros y mesas».", true); return; }
        // Cada categoría va con SU ronda (la que tiene abierta); se sortea por grupos de ronda.
        const porRonda = new Map();
        for (const t of cats) {
            const r = ctx.rondaDe(t.tnr);
            if (!r) continue;
            if (!porRonda.has(r)) porRonda.set(r, []);
            porRonda.get(r).push(t.tnr);
        }
        if (!porRonda.size) { ctx.avisar("Todavía no hay una ronda abierta en esas categorías.", true); return; }
        const rondas = [...porRonda.keys()].sort((a, b) => a - b);
        const ok = await Avisos.confirmar(
            "Se van a sortear " + cantidad + (cantidad === 1 ? " mesa" : " mesas") + " en " + (cats.length === 1 ? cats[0].nombre : cats.length + " categorías")
            + " (ronda " + rondas.join(" y ") + "). El sorteo lo hace la base y queda anotado con tu nombre y la hora: una mesa que sale no vuelve a salir en esta ronda, y descartarla pide un motivo. Todavía no se avisa a nadie: eso pasa cuando lo apruebes.",
            { titulo: "Sortear mesas para Fair Play", aceptar: "🎲 Sortear" });
        if (!ok) return;
        $("fp-sortear").disabled = true;
        let salieron = 0;
        try {
            for (const r of rondas) {
                const { data, error } = await window.sb.rpc("centroamericano_fair_play_sortear", { p_ronda: r, p_tnrs: porRonda.get(r), p_cantidad: cantidad });
                if (error) throw error;
                salieron += (data || []).length;
            }
            ctx.avisar(salieron ? "Salieron " + salieron + (salieron === 1 ? " mesa" : " mesas") + ". Revísalas y aprueba las que van." : "No quedaba ninguna mesa por sortear en esa ronda.", !salieron);
        } catch (e) {
            ctx.avisar("No se pudo sortear: " + (e.message || e), true);
        } finally {
            $("fp-sortear").disabled = false;
            await cargar();
        }
    }

    async function aprobar(f) {
        const ok = await Avisos.confirmar("Le llega un aviso al árbitro de la mesa " + f.mesa + " de " + ctx.nombreTorneo(f.tnr) + ": que cuando termine la partida retenga al ganador (si es tablas, a quien jugó con " + COLOR[f.color_si_tablas].toLowerCase() + ") y no lo deje salir del local hasta que llegues.",
            { titulo: "Aprobar la mesa " + f.mesa, aceptar: "Aprobar y avisar" });
        if (!ok) return;
        const { error } = await window.sb.rpc("centroamericano_fair_play_aprobar", { p_id: f.id });
        if (error) ctx.avisar("No se pudo aprobar: " + error.message, true);
        else ctx.avisar("Listo: el árbitro de la mesa " + f.mesa + " ya tiene el aviso.");
        await cargar();
    }

    async function descartar(f) {
        const motivo = await Avisos.pedir("La mesa " + f.mesa + " no vuelve a salir en esta ronda. ¿Por qué se descarta? (queda anotado)", { titulo: "Descartar la mesa " + f.mesa, etiqueta: "Motivo", aceptar: "Descartar" });
        if (motivo === null) return;
        if (!String(motivo).trim()) { ctx.avisar("Para descartar hace falta el motivo.", true); return; }
        const { error } = await window.sb.rpc("centroamericano_fair_play_descartar", { p_id: f.id, p_motivo: String(motivo).trim() });
        if (error) ctx.avisar("No se pudo descartar: " + error.message, true);
        await cargar();
    }

    async function revisar(f) {
        const r = await Avisos.formulario({
            titulo: "Revisión de la mesa " + f.mesa + " (" + ctx.nombreTorneo(f.tnr) + ", ronda " + f.ronda + ")",
            texto: "Se revisa al ganador; si fue tablas, a quien jugó con " + COLOR[f.color_si_tablas].toLowerCase() + ".",
            campos: [
                { nombre: "resultado", etiqueta: "Cómo terminó", tipo: "select", valor: f.resultado || "sin_novedad", opciones: Object.entries(RESULTADOS) },
                { nombre: "jugador", etiqueta: "Jugador revisado", tipo: "text", valor: f.jugador || "", max: 120 },
                { nombre: "nota", etiqueta: "Qué pasó (obligatorio si no fue «Sin novedad»)", tipo: "textarea", valor: f.nota || "", max: 500 },
            ],
            aceptar: "Guardar la revisión",
        });
        if (!r) return;
        const { error } = await window.sb.rpc("centroamericano_fair_play_revisar", { p_id: f.id, p_resultado: r.resultado, p_jugador: r.jugador, p_nota: r.nota });
        if (error) ctx.avisar("No se pudo guardar: " + error.message, true);
        else ctx.avisar("Revisión de la mesa " + f.mesa + " guardada.");
        await cargar();
    }

    async function pdf() {
        const orden = (tnr) => ctx.torneos().findIndex((t) => t.tnr === tnr);
        const lista = [...filas].sort((a, b) => (a.ronda - b.ronda) || (orden(a.tnr) - orden(b.tnr)) || (a.mesa - b.mesa));
        await ctx.descargarPdf({
            titulo: "Fair Play: mesas sorteadas — Centroamericano 2026",
            subtitulo: window.HoraCR.fechaHora(new Date()),
            pie: "Centroamericano 2026 · ajedrez-integral.com · Documento confidencial del equipo de Fair Play",
            bloques: [{ tipo: "tabla", encabezados: ["Categoría", "Ronda", "Mesa", "Si es tablas", "Estado", "Árbitro de la mesa", "Sorteada", "Resultado o motivo"], anchos: [1.6, 0.6, 0.9, 0.9, 1.3, 1.4, 1.2, 3],
                filas: lista.map((f) => [ctx.nombreTorneo(f.tnr), String(f.ronda), f.mesa + " de " + f.mesas_en_sorteo, COLOR[f.color_si_tablas], ESTADOS[f.estado], f.arbitro || "—", window.HoraCR.fechaHora(f.creado),
                    f.estado === "descartada" ? "Descartada: " + (f.motivo || "") : f.estado === "revisada" ? RESULTADOS[f.resultado] + (f.jugador ? " · " + f.jugador : "") + (f.nota ? " · " + f.nota : "") : "—"]) }],
            fotos: [],
        }, "fair-play-centroamericano-2026.pdf");
    }

    function iniciar(contexto) {
        ctx = contexto;
        $("fp-sortear").addEventListener("click", sortear);
        $("fp-actualizar").addEventListener("click", cargar);
        $("fp-pdf").addEventListener("click", pdf);
    }

    window.CentroamericanoFairPlay = { iniciar, cargar, ESTADOS, RESULTADOS };
})();
