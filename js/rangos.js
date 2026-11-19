/* Los rangos: se ganan aprobando un examen.

   Peón → Caballo (1000) → Alfil (3000) → Torre (7000) → Dama o Rey (15 000,
   el alumno elige el nombre) → Dragón (30 000). Al juntar los puntos GANADOS
   del siguiente rango, la base le arma SOLA el examen de ese rango; se
   aprueba con el 90 % (y en Caballo, dando los dos mates básicos). Si lo
   aprueba sube y recibe su diploma; si no, se le restan 500 puntos del avance
   y, al volver a juntarlos, le sale otra vez. Todo eso lo decide la base
   (migraciones rangos_con_examen y rangos_examen_mates); esta página pinta lo
   que devuelve public.mi_rango(). Ver «Los rangos se ganan con un examen» en
   docs/decisiones/puntos-y-premios.md.

   Los umbrales están también en interno.umbral_rango(): verificar-rangos-examen.js
   compara las dos copias.

   Rangos.pintar(caja, estado, { sb, alCambiar }) con el renglón de mi_rango(). */
(function (raiz) {
    "use strict";

    const RANGOS = [
        { id: "peon", nombre: "Peón", pieza: "♙", desde: 0 },
        { id: "caballo", nombre: "Caballo", pieza: "♘", desde: 1000 },
        { id: "alfil", nombre: "Alfil", pieza: "♗", desde: 3000 },
        { id: "torre", nombre: "Torre", pieza: "♖", desde: 7000 },
        { id: "dama_rey", nombre: "Dama o Rey", pieza: "♕", desde: 15000 },
        { id: "dragon", nombre: "Dragón", pieza: "🐉", desde: 30000 },
    ];
    const PIEZA_TITULO = { dama: "♕", rey: "♔" };

    const fmt = (n) => new Intl.NumberFormat("es-CR").format(n);
    const rango = (id) => RANGOS.find((r) => r.id === id) || RANGOS[0];

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    function pintar(caja, estado, opciones) {
        const op = opciones || {};
        const r = rango(estado && estado.rango);
        caja.replaceChildren();
        const fila = el("div", "flex items-center gap-4");
        const pieza = el("span", "text-5xl leading-none text-brand-800 dark:text-white", (estado && PIEZA_TITULO[estado.titulo]) || r.pieza);
        pieza.setAttribute("aria-hidden", "true");
        const texto = el("div", "min-w-0 flex-1");
        const nombre = el("p", "text-xl font-bold text-brand-800 dark:text-white", "Rango: " + ((estado && estado.nombre) || r.nombre));
        nombre.setAttribute("data-rango", r.id);
        texto.appendChild(nombre);

        const puntos = (estado && estado.puntos) || 0;
        const detalle = el("p", "text-sm text-brand-600 dark:text-brand-200");
        detalle.setAttribute("data-rango-detalle", "");
        if (estado && estado.examen_id) {
            detalle.textContent = "Juntaste los puntos para " + estado.siguiente_nombre + ": te toca el examen.";
        } else if (estado && estado.siguiente) {
            detalle.textContent = fmt(puntos) + " puntos hacia el examen de " + estado.siguiente_nombre + ": te faltan "
                + fmt(Math.max(0, estado.umbral_siguiente - puntos)) + ".";
        } else {
            detalle.textContent = "Llegaste al rango más alto.";
        }
        texto.appendChild(detalle);

        if (estado && estado.siguiente && !estado.examen_id) {
            const desde = rango(estado.rango).desde;
            const barra = el("progress", "mt-2 w-full h-2 accent-accent-500");
            barra.max = Math.max(1, estado.umbral_siguiente - desde);
            barra.value = Math.max(0, Math.min(barra.max, puntos - desde));
            barra.setAttribute("aria-label", "Camino al examen de " + estado.siguiente_nombre);
            texto.appendChild(barra);
        }
        fila.append(pieza, texto);
        caja.appendChild(fila);

        // El examen que le toca.
        if (estado && estado.examen_id) {
            const ex = el("div", "mt-4 rounded-xl border-l-4 border-accent-500 bg-accent-50 dark:bg-brand-800 p-3");
            const vence = estado.examen_vence ? new Date(estado.examen_vence).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" }) : "";
            ex.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-100",
                "Examen de rango " + estado.siguiente_nombre + ": se aprueba con el 90 %" + (estado.siguiente === "caballo" ? ", y dando los dos mates (dama y dos torres)" : "") +
                (vence ? ". Tienes hasta el " + vence + "." : ".")));
            const a = el("a", "inline-block mt-2 text-sm font-semibold px-4 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                estado.examen_estado === "en_curso" ? "Seguir el examen" : "Rendir el examen");
            a.href = "examen.html?id=" + encodeURIComponent(estado.examen_id);
            ex.appendChild(a);
            caja.appendChild(ex);
        }

        // Dama o Rey: lo elige el alumno.
        if (estado && estado.rango === "dama_rey" && op.sb) {
            const elegir = el("div", "mt-4");
            elegir.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-100",
                estado.titulo ? "Puedes cambiar el nombre de tu rango:" : "Llegaste al rango Dama o Rey: elige con cuál nombre quedarte."));
            const botones = el("div", "flex gap-2 mt-2");
            botones.setAttribute("role", "group");
            botones.setAttribute("aria-label", "Nombre de tu rango");
            [["dama", "♕ Dama"], ["rey", "♔ Rey"]].forEach(([id, txt]) => {
                const b = el("button", "text-sm font-semibold px-4 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
                    + (estado.titulo === id ? "bg-accent-500 text-brand-900" : "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200"), txt);
                b.type = "button";
                b.setAttribute("aria-pressed", estado.titulo === id ? "true" : "false");
                b.addEventListener("click", async () => {
                    const { error } = await op.sb.rpc("elegir_titulo_rango", { p_titulo: id });
                    if (error) { if (window.Avisos) Avisos.avisar("No se pudo guardar: " + error.message, { tipo: "error" }); return; }
                    if (op.alCambiar) op.alCambiar();
                });
                botones.appendChild(b);
            });
            elegir.appendChild(botones);
            caja.appendChild(elegir);
        }

        // El diploma del rango que tiene.
        if (estado && estado.diploma) {
            const d = el("a", "inline-block mt-3 text-sm font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                "📜 Ver tu diploma de " + estado.nombre);
            d.href = "certificado.html?c=" + encodeURIComponent(estado.diploma);
            caja.appendChild(d);
        }

        const escala = el("p", "text-xs text-brand-500 dark:text-brand-300 mt-3",
            "Los rangos: " + RANGOS.map((x) => x.nombre + " (" + fmt(x.desde) + ")").join(" · ") +
            ". Al juntar los puntos ganados del siguiente, te sale su examen: se aprueba con el 90 %. Si no lo apruebas, se te restan 500 del avance y lo vuelves a intentar al juntarlos." +
            (estado && estado.reprobados ? " Exámenes de rango no aprobados: " + estado.reprobados + "." : ""));
        caja.appendChild(escala);
        return r;
    }

    raiz.Rangos = { RANGOS, rango, pintar };
    if (typeof module !== "undefined" && module.exports) module.exports = raiz.Rangos;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
