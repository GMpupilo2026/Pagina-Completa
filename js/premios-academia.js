/* Los premios de cada academia: la parte del alumno (en la tienda de puntos)
   y la de quien los maneja (premios-academia.html).

   Los pone el supervisor de la academia (o quien administra): una clase
   extra, una camiseta, elegir la apertura de la clase. El alumno los canjea
   con sus Puntos Ajedrez y el supervisor se los entrega en persona y lo marca;
   si lo cancela, se le devuelven los puntos. Todo lo que cuenta lo decide la
   base (premio_academia_guardar, canjear_premio_academia,
   canje_academia_resolver): esta página solo pinta y pide. La idea es de
   Chessgora. Ver «Los premios de cada academia» en
   docs/decisiones/puntos-y-premios.md.

   Lo que escribió una persona (nombre y descripción de un premio, nombres de
   alumnos) va siempre por textContent. */
window.PremiosAcademia = (function () {
    "use strict";

    const fmt = (n) => new Intl.NumberFormat("es-CR").format(n);
    const BOTON = "text-sm font-semibold px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    const PRIMARIO = BOTON + " bg-accent-500 hover:bg-accent-600 text-brand-900 disabled:opacity-50 disabled:cursor-not-allowed";
    const SECUNDARIO = BOTON + " bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";
    const ESTADO = { pendiente: "⏳ Por entregar", entregado: "✅ Entregado", cancelado: "↩️ Cancelado (puntos devueltos)" };
    const fecha = (iso) => window.HoraCR ? HoraCR.fecha(iso, { day: "numeric", month: "short" })
        : new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    /* ---------- El alumno: en la tienda de puntos ---------- */
    async function montarAlumno(seccion, opciones) {
        const { sb, alumnoId, alCanjear } = opciones;
        const lista = seccion.querySelector("[data-premios-lista]");
        const mios = seccion.querySelector("[data-premios-mios]");
        const aviso = seccion.querySelector("[data-premios-aviso]");

        async function cargar() {
            /* Solo los de SUS academias (de las que es miembro): quien administra
               o supervisa ve por la RLS los de otras, pero canjear es de los
               miembros, y la base lo rechazaría. */
            const { data: miembro } = await sb.from("academia_miembros").select("academia_id").eq("persona_id", alumnoId);
            const suyas = (miembro || []).map((m) => m.academia_id);
            if (!suyas.length) { seccion.hidden = true; return; }
            const [{ data: premios }, { data: canjes }, { data: academias }, saldo] = await Promise.all([
                sb.from("premios_academia").select("id, academia_id, nombre, descripcion, emoji, costo_puntos, existencias, limite_por_alumno, activo")
                    .eq("activo", true).in("academia_id", suyas).order("costo_puntos"),
                sb.from("premios_academia_canjes").select("id, premio_id, nombre, costo_pagado, estado, created_at, resuelto_at")
                    .eq("alumno_id", alumnoId).order("created_at", { ascending: false }).range(0, 49),
                sb.from("academias").select("id, nombre"),
                sb.rpc("saldo_de_puntos", { p_alumno: alumnoId }).then((r) => r.data),
            ]);
            const p = premios || [], c = canjes || [];
            seccion.hidden = !p.length && !c.length;
            if (seccion.hidden) return;
            const nombreAc = (id) => ((academias || []).find((a) => a.id === id) || {}).nombre || "";
            const variasAcademias = new Set(p.map((x) => x.academia_id)).size > 1;

            lista.replaceChildren();
            p.forEach((premio) => {
                const li = el("li", "rounded-xl border border-brand-100 dark:border-brand-800 p-4 flex flex-col gap-2");
                const tit = el("p", "font-semibold text-brand-800 dark:text-white");
                const emoji = el("span", null, premio.emoji + " ");
                emoji.setAttribute("aria-hidden", "true");
                tit.append(emoji, document.createTextNode(premio.nombre));
                li.appendChild(tit);
                if (premio.descripcion) li.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300", premio.descripcion));
                const datos = [fmt(premio.costo_puntos) + " puntos"];
                if (premio.existencias != null) datos.push(premio.existencias === 0 ? "se acabaron" : "quedan " + premio.existencias);
                if (variasAcademias) datos.push(nombreAc(premio.academia_id));
                li.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300", datos.join(" · ")));
                const veces = c.filter((x) => x.premio_id === premio.id && x.estado !== "cancelado").length;
                const tope = premio.limite_por_alumno != null && veces >= premio.limite_por_alumno;
                const falta = saldo != null && saldo < premio.costo_puntos;
                const b = el("button", PRIMARIO + " self-start mt-1",
                    tope ? "Ya lo canjeaste" : premio.existencias === 0 ? "Se acabaron" : falta ? `Te faltan ${fmt(premio.costo_puntos - saldo)} puntos` : `Canjear por ${fmt(premio.costo_puntos)} puntos`);
                b.type = "button";
                b.disabled = tope || premio.existencias === 0 || falta;
                b.setAttribute("aria-label", b.textContent + ": " + premio.nombre);
                b.addEventListener("click", () => canjear(premio));
                li.appendChild(b);
                lista.appendChild(li);
            });
            if (!p.length) lista.appendChild(el("li", "text-sm text-brand-500 dark:text-brand-300", "Tu academia todavía no tiene premios para canjear."));

            mios.replaceChildren();
            c.forEach((x) => {
                const li = el("li", "flex flex-wrap justify-between gap-2 text-sm border-l-2 pl-3 "
                    + (x.estado === "pendiente" ? "border-accent-500" : x.estado === "entregado" ? "border-green-500" : "border-brand-200 dark:border-brand-700"));
                li.append(el("span", "text-brand-700 dark:text-brand-100", x.nombre + " · " + fmt(x.costo_pagado) + " puntos · " + fecha(x.created_at)),
                    el("span", "font-semibold text-brand-600 dark:text-brand-200", ESTADO[x.estado] || x.estado));
                mios.appendChild(li);
            });
            mios.parentElement.hidden = !c.length;
        }

        async function canjear(premio) {
            if (!(await Avisos.confirmar(`Se te descuentan ${fmt(premio.costo_puntos)} puntos. Tu supervisor te lo entrega en persona; si no te lo puede dar, te devuelve los puntos.`,
                { titulo: "¿Canjear «" + premio.nombre + "»?", aceptar: "Canjear" }))) return;
            const { data, error } = await sb.rpc("canjear_premio_academia", { p_premio: premio.id });
            if (error) { Avisos.avisar("No se pudo canjear: " + error.message, { tipo: "error" }); return; }
            const fila = Array.isArray(data) ? data[0] : data;
            aviso.textContent = "¡Listo! Canjeaste «" + premio.nombre + "»." + (fila && fila.saldo_restante != null ? " Te quedan " + fmt(fila.saldo_restante) + " puntos." : "");
            await cargar();
            if (alCanjear) alCanjear();
        }

        await cargar();
        return { recargar: cargar };
    }

    return { montarAlumno, fmt, el, ESTADO, PRIMARIO, SECUNDARIO, fecha };
})();

/*! rev bfb5bbb0d2d82f9f */
