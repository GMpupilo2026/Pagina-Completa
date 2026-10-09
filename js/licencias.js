/* El código de licencias.html: quien administra genera las licencias de las
   herramientas de arbitraje y las controla todas.

   Todo pasa por funciones de la base que validan que quien llama administra:
   licencias_generar(), licencias_cambiar() y licencias_admin() (la lista con
   el nombre y el correo de quien tiene cada una). La tabla no tiene política
   de escritura y cada cambio queda en la bitácora de auditoría. Ver
   «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const H = window.HerramientasArbitraje;
    const $ = (id) => document.getElementById(id);
    let licencias = [];
    let personas = [];

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    function avisar(texto, error) { Avisos.avisar(texto, { tipo: error ? "error" : "ok" }); }
    function sinTildes(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

    function estadoDe(l) {
        if (l.revocada) return { clave: "anuladas", texto: "Anulada" };
        if (!l.persona_id) return { clave: "libres", texto: "Sin activar" + (l.dias ? ` · ${l.dias} días al activarla` : " · sin vencimiento") };
        if (l.vence && Date.parse(l.vence) <= Date.now()) return { clave: "vencidas", texto: "Venció el " + HoraCR.fecha(l.vence) };
        return { clave: "vigentes", texto: l.vence ? "Vigente hasta el " + HoraCR.fecha(l.vence) : "Vigente, sin vencimiento" };
    }

    async function cargar() {
        const { data, error } = await sb.rpc("licencias_admin");
        if (error) throw error;
        licencias = data || [];
    }

    function pintar() {
        const q = sinTildes($("buscar").value.trim());
        const filtro = $("filtro").value;
        const ul = $("lista");
        ul.textContent = "";
        const cuenta = { libres: 0, vigentes: 0, vencidas: 0, anuladas: 0 };
        licencias.forEach((l) => { cuenta[estadoDe(l).clave]++; });
        $("resumen").textContent = `${licencias.length} licencias: ${cuenta.vigentes} vigentes, ${cuenta.libres} sin activar, ${cuenta.vencidas} vencidas y ${cuenta.anuladas} anuladas.`;
        const visibles = licencias.filter((l) => {
            if (filtro !== "todas" && estadoDe(l).clave !== filtro) return false;
            if (!q) return true;
            return sinTildes([l.codigo, l.persona_nombre, l.persona_correo, l.nota, H.nombre(l.herramienta)].join(" ")).includes(q);
        });
        $("lista-vacia").classList.toggle("hidden", visibles.length > 0);
        visibles.forEach((l) => ul.appendChild(fila(l)));
    }

    function boton(texto, accion, peligro) {
        const b = el("button", "text-xs font-semibold px-3 py-2 rounded-lg " + (peligro
            ? "bg-red-100 text-red-900 hover:bg-red-200 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
            : "bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700"), texto);
        b.type = "button";
        b.addEventListener("click", accion);
        return b;
    }

    function fila(l) {
        const est = estadoDe(l);
        const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4");
        li.dataset.codigo = l.codigo;
        const arriba = el("div", "flex flex-wrap items-center gap-x-4 gap-y-1");
        arriba.append(el("span", "font-mono font-bold text-brand-800 dark:text-white", l.codigo),
            el("span", "text-sm font-semibold", H.nombre(l.herramienta)),
            el("span", "text-sm text-brand-600 dark:text-brand-300", est.texto));
        li.appendChild(arriba);
        const quien = l.persona_id ? `De: ${l.persona_nombre || "Sin nombre"}${l.persona_correo ? " (" + l.persona_correo + ")" : ""}` +
            (l.activada_en ? ` · activada el ${HoraCR.fecha(l.activada_en)}` : "") : "Todavía no la activó nadie.";
        li.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300 mt-1", quien));
        if (l.nota) li.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300 mt-1", "Nota: " + l.nota));
        const acciones = el("div", "flex flex-wrap gap-2 mt-3");
        acciones.appendChild(boton("Copiar código", () => copiar(l.codigo)));
        if (l.revocada) acciones.appendChild(boton("Reactivar", () => cambiar(l, "reactivar")));
        else acciones.appendChild(boton("Anular", () => cambiar(l, "revocar"), true));
        if (l.persona_id) {
            acciones.appendChild(boton("Cambiar el vencimiento", () => cambiarVence(l)));
            acciones.appendChild(boton("Soltarla de la cuenta", () => cambiar(l, "soltar")));
        }
        acciones.appendChild(boton("Borrar", () => cambiar(l, "borrar"), true));
        li.appendChild(acciones);
        return li;
    }

    async function copiar(texto) {
        try { await navigator.clipboard.writeText(texto); avisar("Copiado."); }
        catch (e) { avisar("No se pudo copiar: selecciónalo y cópialo a mano.", true); }
    }

    const PREGUNTAS = {
        revocar: ["¿Anular la licencia {c}? Quien la tiene deja de usar la herramienta en el momento. Se puede reactivar.", "Anular", true],
        soltar: ["¿Soltar {c} de su cuenta? Queda libre para que otra cuenta la active, con sus días completos.", "Soltar", true],
        borrar: ["¿Borrar {c} para siempre? Si alguien la tiene, pierde el acceso.", "Borrar", true],
    };

    async function cambiar(l, accion, vence) {
        const p = PREGUNTAS[accion];
        if (p && !(await Avisos.confirmar(p[0].replace("{c}", l.codigo), { aceptar: p[1], peligro: p[2] }))) return;
        const { error } = await sb.rpc("licencias_cambiar", { p_id: l.id, p_accion: accion, p_vence: vence || null });
        if (error) { avisar(error.message, true); return; }
        avisar({ revocar: "Licencia anulada.", reactivar: "Licencia reactivada.", soltar: "Licencia libre otra vez.", borrar: "Licencia borrada.", vence: "Vencimiento cambiado." }[accion]);
        await recargar();
    }

    async function cambiarVence(l) {
        const actual = l.vence ? HoraCR.dia(l.vence) : "";
        const r = await Avisos.formulario({
            titulo: "Vencimiento de " + l.codigo,
            texto: "El último día que la licencia sirve (en hora de Costa Rica). Vacío: sin vencimiento.",
            campos: [{ nombre: "dia", etiqueta: "Vale hasta el (AAAA-MM-DD)", valor: actual, max: 10 }],
            aceptar: "Guardar",
        });
        if (!r) return;
        const dia = String(r.dia || "").trim();
        if (dia && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) { avisar("La fecha va como AAAA-MM-DD, por ejemplo 2026-12-31.", true); return; }
        if (!dia) { await cambiar(l, "vence", null); return; }
        await cambiar(l, "vence", dia + "T23:59:59-06:00");
    }

    async function recargar() {
        try { await cargar(); } catch (e) { avisar("No se pudo volver a leer la lista: " + (e.message || e), true); }
        pintar();
    }

    async function generar(e) {
        e.preventDefault();
        const msg = $("f-msg");
        const cantidad = Number($("f-cantidad").value);
        const diasTxt = $("f-dias").value.trim();
        const dias = diasTxt ? Number(diasTxt) : null;
        const quien = $("f-persona").value.trim();
        let persona = null;
        if (quien) {
            persona = personas.find((p) => etiqueta(p) === quien) || null;
            if (!persona) { msg.textContent = "Elige la cuenta de la lista (escribe y toca una de las sugerencias)."; return; }
            if (cantidad !== 1) { msg.textContent = "A una cuenta se le pone una licencia por vez: deja la cantidad en 1."; return; }
        }
        if (!(cantidad >= 1 && cantidad <= 200)) { msg.textContent = "La cantidad va de 1 a 200."; return; }
        if (dias != null && !(dias >= 1 && dias <= 3660)) { msg.textContent = "Los días van de 1 a 3660, o vacío para que no venza."; return; }
        $("f-generar").disabled = true;
        msg.textContent = "Generando…";
        const { data, error } = await sb.rpc("licencias_generar", {
            p_herramienta: $("f-herramienta").value, p_cantidad: cantidad, p_dias: dias,
            p_nota: $("f-nota").value.trim() || null, p_persona: persona ? persona.id : null,
        });
        $("f-generar").disabled = false;
        if (error) { msg.textContent = ""; avisar(error.message, true); return; }
        msg.textContent = "";
        const codigos = (data || []).map((l) => l.codigo);
        $("recien-lista").textContent = codigos.join("\n");
        $("recien").classList.remove("hidden");
        avisar(persona ? `Licencia puesta en la cuenta de ${persona.full_name || persona.email}.` : `${codigos.length} licencia(s) generada(s).`);
        $("f-persona").value = "";
        await recargar();
    }

    function etiqueta(p) { return `${p.full_name || "Sin nombre"} — ${p.email || ""}`; }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=licencias.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("id, is_admin").eq("id", session.user.id).single();
        $("loading").classList.add("hidden");
        if (!perfil || !perfil.is_admin) { $("denegado").classList.remove("hidden"); return; }
        try {
            await cargar();
            for (let i = 0; ; i += 1000) {
                const { data, error } = await sb.from("profiles").select("id, full_name, email").order("full_name").range(i, i + 999);
                if (error) throw error;
                personas.push(...(data || []));
                if (!data || data.length < 1000) break;
            }
        } catch (e) {
            $("loading").classList.remove("hidden");
            $("loading").textContent = "No se pudo cargar: " + (e.message || e);
            return;
        }
        const sel = $("f-herramienta");
        [{ id: "todas", nombre: H.nombre("todas") }].concat(H.LISTA).forEach((h) => {
            const o = el("option", "", h.nombre + (h.disponible === false ? " (próximamente)" : ""));
            o.value = h.id;
            sel.appendChild(o);
        });
        sel.value = "seleccion-codicader";
        const dl = $("f-personas");
        personas.forEach((p) => { const o = el("option"); o.value = etiqueta(p); dl.appendChild(o); });
        document.querySelectorAll(".f-dias").forEach((b) => b.addEventListener("click", () => { $("f-dias").value = b.dataset.dias; }));
        $("form").addEventListener("submit", generar);
        $("recien-copiar").addEventListener("click", () => copiar($("recien-lista").textContent));
        $("buscar").addEventListener("input", pintar);
        $("filtro").addEventListener("change", pintar);
        $("app").classList.remove("hidden");
        pintar();
    }
    init();
})();
