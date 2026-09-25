/* encuesta-curso.html — la encuesta anónima de un curso, sin cuenta y hecha
 * para contestarse con lector de pantalla.
 *
 * Lo que la hace usable sin ver la pantalla (ver «La encuesta anónima de un
 * curso» en docs/decisiones/cuentas-y-formularios.md):
 *  - cada pregunta es un <fieldset> con su <legend>, que dice el número
 *    («Pregunta 3 de 14») y la pregunta entera: al entrar al grupo, el lector
 *    lee todo eso antes de la primera opción;
 *  - las opciones son radios y casillas de verdad, con su texto completo como
 *    etiqueta (nada de iconos ni colores que digan algo por sí solos);
 *  - las partes llevan un <h2>, para saltar de una a otra con la tecla H;
 *  - si falta algo al enviar, un resumen recibe el foco, dice cuántas faltan
 *    y trae un enlace a cada pregunta; y la leyenda de cada pregunta que falta
 *    lo dice también, porque es lo que se lee al llegar a ella;
 *  - al terminar, el foco va al «¡Gracias!»: si no, quien no ve la pantalla
 *    no se entera de que el envío salió.
 *
 * Nada de esto guarda quién contesta: la base no recibe ni la cuenta (aunque
 * haya sesión) ni la IP con la respuesta. Las preguntas salen de
 * js/encuesta-curso-preguntas.js, la misma copia que lee encuestas-curso.html.
 */
(function () {
    const P = window.EncuestaCursoPreguntas;
    const slug = new URLSearchParams(location.search).get("e") || "";
    const TOTAL = 2 + P.METODOLOGIA.length + 3 + P.TEXTOS.length;   // 14
    const REQUERIDAS = [];   // [{ clave, numero, texto }]
    let enviando = false;

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    const CLASE_OPCION = "flex items-start gap-3 rounded-xl border-2 border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-950 px-4 py-3 cursor-pointer hover:border-accent-500 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50 dark:has-[:checked]:bg-brand-800 has-[:checked]:font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent-400";

    function opcion(tipo, nombre, valor, texto) {
        const label = el("label", CLASE_OPCION);
        const input = el("input", "mt-1.5 w-5 h-5 shrink-0 accent-accent-500");
        input.type = tipo;
        input.name = nombre;
        input.value = valor;
        label.append(input, el("span", "", texto));
        return label;
    }

    /* Una pregunta de opciones: fieldset + legend con el número. `requerida`
       la suma a la lista que se revisa al enviar. */
    function pregunta(numero, clave, texto, opciones, { tipo = "radio", requerida = true, columnas = "" } = {}) {
        const fs = el("fieldset", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6");
        fs.id = "q-" + clave;
        const lg = el("legend", "float-left w-full font-semibold text-brand-800 dark:text-white mb-4");
        lg.appendChild(el("span", "", "Pregunta " + numero + " de " + TOTAL + ". " + texto + (requerida ? "" : " (Opcional.)")));
        // Se llena al enviar si falta: va DENTRO de la leyenda, que es lo que
        // el lector lee al llegar a la pregunta.
        const falta = el("span", "falta block mt-1 text-red-700 dark:text-red-300");
        falta.hidden = true;
        lg.appendChild(falta);
        const grid = el("div", "clear-both grid gap-2 " + columnas);
        opciones.forEach((o) => grid.appendChild(opcion(tipo, clave, o.valor, o.texto)));
        fs.append(lg, grid);
        if (requerida) REQUERIDAS.push({ clave, numero, texto });
        return fs;
    }

    function parte(numero, titulo, ayuda) {
        const s = el("section", "space-y-5");
        const h = el("h2", "font-serif text-2xl font-bold text-brand-800 dark:text-white", "Parte " + numero + " de 4: " + titulo);
        h.id = "parte-" + numero;
        s.setAttribute("aria-labelledby", h.id);
        s.appendChild(h);
        if (ayuda) s.appendChild(el("p", "text-brand-600 dark:text-brand-300", ayuda));
        return s;
    }

    function areaDeTexto(numero, t) {
        const caja = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6");
        const label = el("label", "block font-semibold text-brand-800 dark:text-white", "Pregunta " + numero + " de " + TOTAL + ". " + t.etiqueta + " (Opcional.)");
        label.htmlFor = "t-" + t.clave;
        const ayuda = el("p", "text-base text-brand-600 dark:text-brand-300 mt-1 mb-3", t.ayuda + " Hasta 2000 letras.");
        ayuda.id = "t-" + t.clave + "-ayuda";
        const area = el("textarea", "w-full bg-brand-50 dark:bg-brand-950 border-2 border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-400");
        area.id = "t-" + t.clave;
        area.name = t.clave;
        area.rows = 4;
        area.maxLength = 2000;
        area.setAttribute("aria-describedby", ayuda.id);
        caja.append(label, ayuda, area);
        return caja;
    }

    function armar() {
        const form = document.getElementById("form");
        let n = 1;

        const p1 = parte(1, "Tu asistencia", "Queremos saber si seguiste en el curso y, si lo dejaste, por qué. Nos sirve para que otras personas no lo dejen.");
        p1.appendChild(pregunta(n++, "asistencia", "¿Cómo va tu asistencia al curso?", P.ASISTENCIA));
        const motivos = pregunta(n++, "motivos", "Si dejaste de ir o vas solo a veces, ¿por qué? Puedes marcar varias. Si vas a todas, sáltala.", P.MOTIVOS, { tipo: "checkbox", requerida: false });
        const otro = el("div", "clear-both mt-4");
        const lOtro = el("label", "block font-semibold", "Si marcaste «Otro motivo», ¿cuál fue? (Opcional.)");
        lOtro.htmlFor = "motivo-otro";
        const iOtro = el("input", "mt-2 w-full bg-brand-50 dark:bg-brand-950 border-2 border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-400");
        iOtro.id = "motivo-otro";
        iOtro.type = "text";
        iOtro.maxLength = 500;
        otro.append(lOtro, iOtro);
        motivos.appendChild(otro);
        p1.appendChild(motivos);
        form.appendChild(p1);

        const p2 = parte(2, "La forma de enseñar del profesor", "Seis frases. En cada una, di qué tan de acuerdo estás. Si no llegaste a verlo, elige «" + P.NO_SE + "».");
        const escala = P.ESCALA.map((t, i) => ({ valor: String(i + 1), texto: (i + 1) + ", " + t }))
            .concat([{ valor: "nose", texto: P.NO_SE }]);
        P.METODOLOGIA.forEach((m) => p2.appendChild(pregunta(n++, m.clave, m.texto, escala)));
        form.appendChild(p2);

        const p3 = parte(3, "Lo que aprendiste", null);
        p3.appendChild(pregunta(n++, "aprendizaje", "Empezaste sabiendo 0 de ajedrez. ¿Hasta dónde llegaste?", P.APRENDIZAJE));
        p3.appendChild(pregunta(n++, "suficiente", "¿El curso fue lo suficientemente básico para que pudieras aprender?", P.SUFICIENTE));
        p3.appendChild(pregunta(n++, "recomendaria", "¿Le recomendarías este curso a otra persona que empieza de cero?", P.RECOMENDARIA, { columnas: "sm:grid-cols-3" }));
        form.appendChild(p3);

        const p4 = parte(4, "Lo que esperabas y lo que encontraste", "Estas tres son para escribir, y las tres son opcionales.");
        P.TEXTOS.forEach((t) => p4.appendChild(areaDeTexto(n++, t)));
        form.appendChild(p4);

        // El consentimiento, antes de enviar (Ley 8968): lo exige la base.
        const cons = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6");
        cons.id = "q-consentimiento";
        const lc = el("label", "flex items-start gap-3 cursor-pointer");
        const cc = el("input", "mt-1.5 w-5 h-5 shrink-0 accent-accent-500");
        cc.type = "checkbox";
        cc.id = "acepto-datos";
        const tc = el("span", "");
        tc.append("Acepto que se guarden mis respuestas, de forma anónima, como explica la ");
        const a = el("a", "underline font-semibold rounded focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-400", "Política de privacidad");
        a.href = "privacidad.html";
        a.target = "_blank";
        a.rel = "noopener";
        a.appendChild(el("span", "sr-only", " (se abre en otra pestaña)"));
        tc.append(a, ".");
        lc.append(cc, tc);
        const fc = el("p", "falta mt-2 text-red-700 dark:text-red-300");
        fc.id = "acepto-datos-falta";
        fc.hidden = true;
        cc.setAttribute("aria-describedby", fc.id);
        cons.append(lc, fc);
        form.appendChild(cons);

        const pie = el("div", "flex flex-wrap items-center gap-4");
        const b = el("button", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-bold px-8 py-4 rounded-xl text-lg transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-400 focus-visible:ring-offset-2", "Enviar mis respuestas");
        b.type = "submit";
        b.id = "enviar";
        const vivo = el("p", "text-brand-600 dark:text-brand-300");
        vivo.id = "enviando";
        vivo.setAttribute("aria-live", "polite");
        pie.append(b, vivo);
        form.appendChild(pie);
        form.addEventListener("submit", enviar);
    }

    function valor(nombre) {
        const i = document.querySelector(`#form input[name="${nombre}"]:checked`);
        return i ? i.value : null;
    }

    function limpiarFaltas() {
        document.querySelectorAll("#form .falta").forEach((f) => { f.hidden = true; f.textContent = ""; });
        const caja = document.getElementById("errores");
        caja.hidden = true;
        document.getElementById("errores-lista").replaceChildren();
    }

    /* Lleva el foco Y la pantalla: focus() solo no alcanza, porque con el
       desplazamiento suave del sitio la página se quedaba abajo, junto al
       botón, y el aviso quedaba fuera de la vista para quien ve poco. */
    function llevarA(nodo) {
        nodo.scrollIntoView({ block: "start", behavior: "instant" });
        nodo.focus({ preventScroll: true });
    }

    /* El resumen de arriba: recibe el foco y el lector lo lee entero. */
    function mostrarResumen(titulo, items) {
        const caja = document.getElementById("errores");
        document.getElementById("errores-titulo").textContent = titulo;
        const ul = document.getElementById("errores-lista");
        ul.replaceChildren();
        items.forEach((it) => {
            const li = el("li");
            if (it.destino) {
                const a = el("a", "underline font-semibold rounded focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-400", it.texto);
                a.href = "#" + it.destino;
                a.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    const campo = document.querySelector("#" + it.destino + " input");
                    if (campo) campo.focus();
                });
                li.appendChild(a);
            } else {
                li.textContent = it.texto;
            }
            ul.appendChild(li);
        });
        caja.hidden = false;
        llevarA(caja);
    }

    async function enviar(ev) {
        ev.preventDefault();
        if (enviando) return;
        limpiarFaltas();
        const faltan = REQUERIDAS.filter((q) => !valor(q.clave));
        faltan.forEach((q) => {
            const f = document.querySelector("#q-" + q.clave + " .falta");
            f.textContent = "Falta contestar esta pregunta.";
            f.hidden = false;
        });
        const acepto = document.getElementById("acepto-datos").checked;
        if (!acepto) {
            const f = document.getElementById("acepto-datos-falta");
            f.textContent = "Para enviar, marca la casilla de aceptar.";
            f.hidden = false;
        }
        if (faltan.length || !acepto) {
            const items = faltan.map((q) => ({ texto: "Pregunta " + q.numero + ": " + q.texto, destino: "q-" + q.clave }));
            if (!acepto) items.push({ texto: "La casilla de aceptar el uso de las respuestas", destino: "q-consentimiento" });
            mostrarResumen(items.length === 1 ? "Falta 1 respuesta antes de enviar" : "Faltan " + items.length + " respuestas antes de enviar", items);
            return;
        }

        const r = {
            asistencia: valor("asistencia"),
            motivos: [...document.querySelectorAll('#form input[name="motivos"]:checked')].map((i) => i.value),
            motivo_otro: document.getElementById("motivo-otro").value.trim(),
            aprendizaje: valor("aprendizaje"),
            suficiente: valor("suficiente"),
            recomendaria: valor("recomendaria"),
        };
        // «No sé» viaja como null: no entra en el promedio.
        P.METODOLOGIA.forEach((m) => { const v = valor(m.clave); r[m.clave] = v === "nose" ? null : Number(v); });
        P.TEXTOS.forEach((t) => { r[t.clave] = document.getElementById("t-" + t.clave).value.trim(); });

        enviando = true;
        const boton = document.getElementById("enviar");
        const vivo = document.getElementById("enviando");
        boton.disabled = true;
        vivo.textContent = "Enviando tus respuestas…";
        const { data, error } = await sb.rpc("responder_encuesta_curso", {
            p_slug: slug, p_respuestas: r, p_version_privacidad: window.LegalVersion.PRIVACIDAD,
        });
        enviando = false;
        boton.disabled = false;
        vivo.textContent = "";
        if (error || !data || !data.ok) {
            // El mensaje de la base dice qué pasó («ya no está recibiendo…»).
            mostrarResumen("No se pudo enviar", [{ texto: (data && data.error) || "Revisa tu conexión a internet e intenta de nuevo. Tus respuestas siguen marcadas." }]);
            return;
        }
        document.getElementById("form").hidden = true;
        document.getElementById("gracias").hidden = false;
        llevarA(document.getElementById("gracias-titulo"));
    }

    function sinEncuesta(mensaje) {
        const e = document.getElementById("estado");
        e.textContent = mensaje;
        e.className = "text-xl font-semibold text-brand-800 dark:text-white";
    }

    async function init() {
        if (!slug) { sinEncuesta("Este enlace está incompleto: pídele a la Academia el enlace de la encuesta de tu curso."); return; }
        const { data, error } = await sb.rpc("encuesta_curso_publica", { p_slug: slug });
        if (error) { sinEncuesta("No se pudo abrir la encuesta. Revisa tu conexión a internet y vuelve a cargar la página."); return; }
        const e = (data || [])[0];
        if (!e) { sinEncuesta("No encontramos esta encuesta. Revisa que el enlace esté completo."); return; }
        if (!e.abierta) { sinEncuesta("Esta encuesta ya cerró y no está recibiendo respuestas. ¡Gracias de todos modos!"); return; }
        document.title = "Encuesta anónima: " + e.curso;
        document.getElementById("titulo").textContent = "Encuesta anónima del curso «" + e.curso + "»";
        document.getElementById("subtitulo").textContent = e.profesor
            ? "Sobre las clases con " + e.profesor + ". Tu opinión nos ayuda a enseñar mejor a quienes empiezan de cero."
            : "Tu opinión nos ayuda a enseñar mejor a quienes empiezan de cero.";
        armar();
        document.getElementById("estado").hidden = true;
        document.getElementById("app").hidden = false;
    }

    init();
})();
