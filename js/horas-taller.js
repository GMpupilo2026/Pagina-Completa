/* «Tus horas del taller»: la barra de lo que lleva cada asesor de las horas
   del taller (hoy 30: «Formación Ajedrez» del MEP) y lo que le falta.

   Las cuentas las hace la base, taller_horas(persona): una fila por sesión con
   lo que dura, el tiempo dentro de la clase en vivo, lo que vio de la
   grabación (la grabación completa vale la sesión entera) y lo que cuenta,
   que nunca pasa de lo que dura la sesión. Acá solo se suma lo que ya
   devolvió la base y se pinta: ni una regla de cuánto vale cada cosa vive en
   el navegador.

   La sesión presencial vale cuando la práctica que se pide está aprobada:
   desde esta misma tarjeta se sube (taller_practica_enviar, los archivos en el
   bucket taller-practicas) y se ve en qué quedó.

   Va aparte de js/clases.js para probarla sin la base: pintar() recibe las
   filas tal cual las devuelve taller_horas(), las de taller_practicas de la
   persona y las grabaciones que tiene (mis_grabaciones), y lo de subir lo
   hace `enviarPractica`. Ver «Las horas del taller» en
   docs/decisiones/paneles.md. */
window.HorasTaller = (function () {
    "use strict";

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    // «17 h 53 min», «4 h», «45 min», «0 min».
    function tiempo(min) {
        min = Math.max(0, Math.round(Number(min) || 0));
        return min ? HoraCR.duracion(min * 60) : "0 min";
    }

    // «Lunes 12 de octubre», sin la coma que pone el navegador.
    function dia(x) {
        const t = HoraCR.fecha(x, { weekday: "long", day: "numeric", month: "long" }).replace(/^(\S+),\s*/, "$1 ");
        return t.charAt(0).toUpperCase() + t.slice(1);
    }

    const num = (x) => Math.max(0, Number(x) || 0);

    function resumir(filas) {
        const lista = Array.isArray(filas) ? filas : [];
        const meta = lista.reduce((a, f) => a + num(f.duracion_min), 0);
        const llevas = lista.reduce((a, f) => a + Math.min(num(f.min_contados), num(f.duracion_min)), 0);
        return { meta, llevas, faltan: Math.max(0, meta - llevas), pct: meta ? Math.min(100, (100 * llevas) / meta) : 0 };
    }

    // Una barra de avance: el dato va escrito al lado; la barra es adorno para
    // la vista, y el lector de pantalla la oye como barra de progreso con su
    // texto (aria-valuetext).
    function barra(pct, texto, alto) {
        const b = el("div", "w-full overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800 " + (alto || "h-2"));
        b.setAttribute("role", "progressbar");
        b.setAttribute("aria-valuemin", "0");
        b.setAttribute("aria-valuemax", "100");
        b.setAttribute("aria-valuenow", String(Math.round(pct)));
        b.setAttribute("aria-valuetext", texto);
        const relleno = el("div", "h-full rounded-full " + (pct >= 100 ? "bg-emerald-700" : "bg-accent-500"));
        relleno.style.width = pct.toFixed(1) + "%";
        b.appendChild(relleno);
        return b;
    }

    /* Lo que se dice debajo de cada sesión: de dónde salió lo que cuenta y,
       si le falta, cómo reponerlo. */
    function detalle(f, ahora, conGrabacion, practica) {
        const dura = num(f.duracion_min), cuenta = Math.min(num(f.min_contados), dura), falta = dura - cuenta;
        const paso = new Date(f.fin) <= ahora, empezo = new Date(f.inicio) <= ahora;
        if (f.modalidad === "presencial") {
            const estado = practica && practica.estado;
            if (estado === "aprobada") return ["✓ Tu práctica está aprobada: cuenta la sesión entera."];
            if (estado === "enviada") return ["Tu práctica está en revisión. Cuando la aprobemos, cuenta la sesión entera."];
            if (estado === "devuelta") return ["Te devolvimos la práctica para que la corrijas. Súbela de nuevo."];
            return ["Esta sesión vale " + tiempo(dura) + " cuando subas la práctica que te vamos a pedir y la aprobemos."];
        }
        if (!empezo) return ["Todavía no ha pasado."];
        if (f.completa_por_asistencia) return ["Te conectaste a la clase: cuenta la sesión entera."];
        const partes = [];
        const deClase = num(f.min_clase), deVideo = num(f.min_grabacion);
        if (deClase || deVideo) {
            partes.push([deClase ? "En la clase: " + tiempo(deClase) : "", deVideo ? "Viendo la grabación: " + tiempo(deVideo) : ""]
                .filter(Boolean).join(" · ") + ".");
        } else if (paso) {
            partes.push("No estuviste en esta sesión.");
        }
        if (falta > 0 && paso) {
            partes.push(conGrabacion
                ? "Te faltan " + tiempo(falta) + ": repónlos viendo la grabación, más abajo. Completa, vale la sesión entera."
                : "Te faltan " + tiempo(falta) + ". Los vas a poder reponer cuando esté la grabación.");
        } else if (!paso) {
            partes.push("La sesión está en curso.");
        }
        return partes;
    }

    /* El formulario de la práctica: los archivos (los mismos formatos que un
       formulario, js/adjuntos.js) y un comentario. Se abre con un botón que
       dice si está abierto. */
    function formularioPractica(f, practica, enviarPractica, alCambiar) {
        const caja = el("div", "mt-3");
        const id = "practica-" + f.horario_id;
        const abrir = el("button", "inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:bg-accent-500 dark:text-brand-900 dark:hover:bg-accent-400",
            practica && practica.estado === "devuelta" ? "Subir la práctica corregida" : (practica ? "Cambiar los archivos" : "Subir la práctica"));
        abrir.type = "button";
        abrir.setAttribute("aria-expanded", "false");
        abrir.setAttribute("aria-controls", id);
        const form = el("form", "mt-3 space-y-3 rounded-xl bg-brand-50 p-4 dark:bg-brand-950");
        form.id = id;
        form.hidden = true;
        form.noValidate = true;

        const etqArch = el("label", "block text-sm font-semibold text-brand-800 dark:text-white", "Archivos de la práctica");
        const input = el("input", "mt-1 block w-full text-sm text-brand-700 dark:text-brand-200 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-white dark:file:bg-accent-500 dark:file:text-brand-900");
        input.type = "file";
        input.multiple = true;
        input.id = id + "-archivos";
        input.accept = Adjuntos.aceptar(false);
        etqArch.htmlFor = input.id;
        const ayuda = el("p", "text-xs text-brand-700 dark:text-brand-200", Adjuntos.textoFormatos(false));
        ayuda.id = id + "-ayuda";
        input.setAttribute("aria-describedby", ayuda.id);
        const lista = el("ul", "flex flex-wrap gap-3");
        const elegidos = el("p", "text-xs text-brand-700 dark:text-brand-200");
        elegidos.setAttribute("aria-live", "polite");

        const etqCom = el("label", "block text-sm font-semibold text-brand-800 dark:text-white", "Comentario (si quieres decirnos algo)");
        const com = el("textarea", "mt-1 block w-full rounded-lg border border-brand-200 bg-white p-2 text-sm text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:border-brand-700 dark:bg-brand-900 dark:text-white");
        com.id = id + "-comentario";
        com.rows = 3;
        com.maxLength = 2000;
        etqCom.htmlFor = com.id;

        const enviar = el("button", "rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60", "Enviar la práctica");
        enviar.type = "submit";
        const estado = el("p", "text-sm text-brand-800 dark:text-white");
        estado.setAttribute("role", "status");

        const selector = Adjuntos.montarSelector(input, lista, elegidos, { alError: (t) => { estado.textContent = t; } });
        form.append(etqArch, input, ayuda, lista, elegidos, etqCom, com, enviar, estado);

        abrir.addEventListener("click", () => {
            const ver = form.hidden;
            form.hidden = !ver;
            abrir.setAttribute("aria-expanded", String(ver));
            if (ver) input.focus();
        });
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!selector.cantidad()) { estado.textContent = "Elige al menos un archivo."; input.focus(); return; }
            enviar.disabled = true;
            try {
                await enviarPractica(f.horario_id, selector, com.value.trim(), (t) => { estado.textContent = t; });
                estado.textContent = "Listo: tu práctica quedó enviada para revisión.";
                selector.limpiar();
                if (alCambiar) alCambiar();
            } catch (err) {
                estado.textContent = "No se pudo enviar: " + ((err && err.message) || "intenta de nuevo.");
            } finally {
                enviar.disabled = false;
            }
        });
        caja.append(abrir, form);
        return caja;
    }

    function pintar(caja, filas, { ahora = new Date(), practicas = [], grabaciones = [], enviarPractica = null, alCambiar = null } = {}) {
        if (!caja) return false;
        const lista = Array.isArray(filas) ? filas : [];
        caja.textContent = "";
        if (!lista.length) { caja.hidden = true; return false; }
        const r = resumir(lista);
        const conGrabacion = new Set((grabaciones || []).map((g) => g.horario_id));
        const practicaDe = new Map((practicas || []).map((p) => [p.horario_id, p]));

        const titulo = el("h2", "text-lg font-bold text-brand-800 dark:text-white", "Tus horas del taller");
        titulo.id = "horas-taller-titulo";
        const cifra = el("p", "mt-1 text-brand-800 dark:text-white");
        const fuerte = el("strong", "text-2xl", tiempo(r.llevas));
        cifra.append("Llevas ", fuerte, " de " + tiempo(r.meta) + ".");
        const texto = "Llevas " + tiempo(r.llevas) + " de " + tiempo(r.meta) + " (" + Math.floor(r.pct) + " %)";
        const falta = el("p", "mt-2 text-sm font-semibold " + (r.faltan ? "text-brand-700 dark:text-brand-200" : "text-emerald-800 dark:text-emerald-300"),
            r.faltan ? "Te faltan " + tiempo(r.faltan) + " para cumplir las " + tiempo(r.meta) + "." : "✓ Cumpliste las " + tiempo(r.meta) + " del taller.");
        const como = el("p", "mt-1 text-xs text-brand-700 dark:text-brand-200",
            "Cuenta el tiempo dentro de cada sesión. Si faltaste o te fuiste antes, lo repones viendo la grabación: completa, vale la sesión entera.");
        caja.append(titulo, cifra, el("div", "mt-3"), falta, como);
        caja.children[2].appendChild(barra(r.pct, texto, "h-3"));

        const ul = el("ul", "mt-5 space-y-4");
        lista.forEach((f) => {
            const dura = num(f.duracion_min), cuenta = Math.min(num(f.min_contados), dura);
            const li = el("li", "border-t border-brand-100 pt-4 dark:border-brand-800");
            li.dataset.sesion = f.horario_id;
            const fila = el("div", "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1");
            const nombre = el("p", "font-semibold text-brand-800 dark:text-white");
            nombre.append(el("span", "", f.titulo || "Sesión"),                     // del profe: textContent
                el("span", "font-normal text-brand-700 dark:text-brand-200", " · " + dia(f.inicio)));
            const valor = el("p", "text-sm font-semibold text-brand-800 dark:text-white", tiempo(cuenta) + " de " + tiempo(dura));
            fila.append(nombre, valor);
            li.appendChild(fila);
            const pct = dura ? (100 * cuenta) / dura : 0;
            const b = el("div", "mt-2");
            b.appendChild(barra(pct, (f.titulo || "Sesión") + ": " + tiempo(cuenta) + " de " + tiempo(dura), "h-1.5"));
            li.appendChild(b);
            const practica = practicaDe.get(f.horario_id) || null;
            detalle(f, ahora, conGrabacion.has(f.horario_id), practica).forEach((t) => {
                li.appendChild(el("p", "mt-1 text-sm text-brand-700 dark:text-brand-200", t));
            });
            if (f.modalidad === "presencial" && practica && practica.estado === "devuelta" && practica.nota_revision) {
                const nota = el("p", "mt-1 rounded-lg bg-brand-50 p-2 text-sm text-brand-800 dark:bg-brand-950 dark:text-white");
                nota.append(el("strong", "", "Lo que te dijimos: "), practica.nota_revision);   // lo escribió una persona: textContent
                li.appendChild(nota);
            }
            if (f.modalidad === "presencial" && enviarPractica && (!practica || practica.estado !== "aprobada")) {
                li.appendChild(formularioPractica(f, practica, enviarPractica, alCambiar));
            }
            ul.appendChild(li);
        });
        caja.appendChild(ul);
        caja.hidden = false;
        return true;
    }

    return { pintar, resumir, tiempo };
})();

/*! rev bfb5bbb0d2d82f9f */
