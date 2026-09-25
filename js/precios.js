/* El código de precios.html.

   Vivía escrito dentro de la página, en un <script> de 6 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

    (function () {
        "use strict";
        const P = window.PreciosAcceso;
        const f = P.formato;
        const $ = (id) => document.getElementById(id);

        $("precio-individual").textContent = f(P.INDIVIDUAL);
        $("precio-individual-ciclo").textContent = f(P.anual(P.INDIVIDUAL));
        $("precio-hero").textContent = f(P.INDIVIDUAL);
        $("precio-cierre").textContent = f(P.INDIVIDUAL);
        $("precio-individual-dia").textContent = f(Math.round(P.INDIVIDUAL / 30));

        // «Quiero mi cuenta»: el WhatsApp de Oscar con la cuenta sola ya
        // escrita. El número se lee de #cta-wa, donde ya está: una sola copia.
        const waBase = ($("cta-wa").getAttribute("href") || "").split("?")[0];
        const waCuenta = waBase + "?text=" + encodeURIComponent(
            `Hola Oscar, quiero una cuenta de la Academia: ${f(P.INDIVIDUAL)} al mes o ${f(P.anual(P.INDIVIDUAL))} al año.` +
            " ¿Me pasas los datos para pagar por SINPE Móvil o transferencia?");
        ["cuenta-pagar", "cierre-pagar"].forEach((id) => { const a = $(id); a.href = waCuenta; a.target = "_blank"; a.rel = "noopener"; });
        // La prueba gratis se pide por WhatsApp: la cuenta la crea quien
        // administra. Sin JavaScript, los enlaces llevan a prueba-gratis.html.
        const waPrueba = waBase + "?text=" + encodeURIComponent(
            "Hola Oscar, me interesa la prueba gratis de 3 días de la Academia de Ajedrez Integral.");
        document.querySelectorAll("[data-pedir-prueba]").forEach((a) => { a.href = waPrueba; a.target = "_blank"; a.rel = "noopener"; });
        $("precio-profesor-extra").textContent = f(P.PROFESOR_EXTRA);
        $("precio-profesor-extra-anual").textContent = f(P.anual(P.PROFESOR_EXTRA));
        document.querySelectorAll(".meses-ciclo").forEach((e) => { e.textContent = P.MESES_CICLO; });
        document.querySelectorAll(".meses-cobrados").forEach((e) => { e.textContent = P.MESES_COBRADOS_CICLO; });

        const tb = $("tabla-tramos");
        P.TRAMOS.forEach((t, i) => {
            const sig = P.TRAMOS[i + 1];
            const tr = document.createElement("tr");
            tr.dataset.tramo = t.id;
            const celdas = [
                t.nombre,
                t.convenio ? t.desde + " o más" : sig ? (t.desde === sig.desde - 1 ? String(t.desde) : t.desde + " a " + (sig.desde - 1)) : t.desde + " o más",
                (t.convenio ? "desde " : "") + f(t.precio),
                (t.convenio ? "desde " : "") + f(t.desde * t.precio),
                (t.convenio ? "desde " : "") + f(P.anual(t.precio)),
                (t.convenio ? "desde " : "") + f(P.anual(t.desde * t.precio)),
                t.profesores == null ? "Los que hagan falta" : t.profesores === 0 ? "—" : String(t.profesores),
                t.coordinacion ? "Incluida" : "—",
            ];
            celdas.forEach((c, j) => {
                const td = document.createElement(j === 0 ? "th" : "td");
                if (j === 0) td.scope = "row";
                td.className = "py-3 pr-4 " + (j === 0 ? "font-semibold text-brand-800 dark:text-white whitespace-nowrap" : "");
                td.textContent = c;
                tr.append(td);
            });
            tb.append(tr);
        });

        function calcular() {
            const n = Math.floor(Number($("calc-n").value));
            const res = $("calc-res");
            res.innerHTML = "";
            if (!n || n < 1) { res.textContent = "Escribe cuántos alumnos son."; $("calc-pagar-caja").replaceChildren(); return; }
            const c = P.cotizar(n);
            const total = document.createElement("p");
            total.innerHTML = '<span class="font-serif text-4xl font-bold text-accent-700 dark:text-accent-400"></span> <span class="text-brand-500 dark:text-brand-300">al mes</span>';
            total.firstChild.textContent = (c.tramo.convenio ? "desde " : "") + f(c.total);
            const det = document.createElement("p");
            det.className = "text-sm text-brand-600 dark:text-brand-300 mt-2";
            det.textContent = `${c.tramo.nombre}: ${f(c.porAlumno)} por alumno` +
                (c.cobrados > n ? `. Con ${n} te sale más barato pagar ${c.cobrados}.` : ".");
            const ciclo = document.createElement("p");
            ciclo.className = "text-sm text-brand-600 dark:text-brand-300 mt-1";
            ciclo.textContent = `Al año: ${c.tramo.convenio ? "desde " : ""}${f(c.ciclo)}, o sea ${f(c.porAlumnoAnual)} por alumno (${P.MESES_CICLO} meses de uso, pagas ${P.MESES_COBRADOS_CICLO}).`;
            // Pagar: abre el WhatsApp de Oscar con lo que se está viendo ya
            // escrito, para que no haya que volver a contar cuántos son ni
            // cuánto sale. El número se lee del botón de abajo (#cta-wa), que
            // es donde ya está escrito: una segunda copia se quedaría vieja.
            const wa = ($("cta-wa").getAttribute("href") || "").split("?")[0];
            const conv = c.tramo.convenio ? "desde " : "";
            const mensaje = `Hola Oscar, quiero pagar el acceso a la Academia para ${n} ${n === 1 ? "alumno" : "alumnos"}` +
                ` (${c.tramo.nombre}): ${conv}${f(c.total)} al mes o ${conv}${f(c.ciclo)} al año.` +
                " ¿Me pasas los datos para pagar por SINPE Móvil o transferencia?";
            const pagar = document.createElement("a");
            pagar.id = "calc-pagar";
            pagar.href = wa + "?text=" + encodeURIComponent(mensaje);
            pagar.target = "_blank";
            pagar.rel = "noopener";
            pagar.className = "mt-5 flex items-center justify-center gap-2 w-full bg-accent-500 hover:bg-accent-600 text-brand-900 font-bold px-6 py-3 rounded-xl transition-colors shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";
            pagar.innerHTML = '<span aria-hidden="true">💬</span> <span>Pagar</span>';
            pagar.setAttribute("aria-describedby", "calc-pagar-opciones");
            const opciones = document.createElement("p");
            opciones.id = "calc-pagar-opciones";
            opciones.className = "text-xs text-brand-500 dark:text-brand-300 mt-2 text-center";
            opciones.innerHTML = 'Por SINPE Móvil o transferencia bancaria. Te abre WhatsApp con Oscar y te pasa los datos. <a href="#formas-de-pago" class="underline font-semibold">Cómo se paga</a>';
            res.append(total, det, ciclo);
            $("calc-pagar-caja").replaceChildren(pagar, opciones);
        }
        $("calc-n").addEventListener("input", calcular);
        calcular();
    })();
    