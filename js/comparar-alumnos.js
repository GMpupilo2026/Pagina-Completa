/* «Comparar alumnos»: dos o tres alumnos lado a lado, área por área, con lo
 * que dijo su último diagnóstico. Sirve para armar grupos de nivel o parejas
 * de práctica: «El perfil de cada alumno» los muestra de a uno, y comparar
 * dos perfiles a ojo, en tarjetas separadas, es justo lo que no se hace.
 *
 * Va en Informes, dentro del diagnóstico de la clase. Recibe los diagnósticos
 * que la página ya tiene (`resumen` de PlanEntrenamiento.resumir): no pide
 * nada a la base. Ver «Comparar alumnos» en docs/decisiones/informes.md.
 *
 * - Hasta tres a la vez: los colores son los tres primeros de la paleta
 *   categórica de referencia, medidos con el validador (se distinguen con
 *   daltonismo contra el fondo claro y el oscuro). Con un cuarto, dos colores
 *   ya no se distinguen.
 * - Cada barra lleva su número escrito y el nombre va en la leyenda: el color
 *   nunca va solo. El verde del primer modo claro no llega a 3:1 contra el
 *   blanco: por eso el número escrito es obligatorio, no un adorno.
 * - Lo que se compara es la NOTA de cada área (rendir lo esperable para su
 *   fuerza es 70), la misma que pintan «Dónde se debe mejorar» y el perfil;
 *   el porcentaje va entre paréntesis.
 *
 *   CompararAlumnos.montar(contenedor, diagnosticos, { escapar })
 *   CompararAlumnos.diferencias(elegidos) → áreas ordenadas por la distancia
 *       entre el más alto y el más bajo
 */
(function () {
    "use strict";

    const MAXIMO = 3;

    function diferencias(elegidos) {
        if (!elegidos || elegidos.length < 2) return [];
        const areas = elegidos[0].resumen.porArea.map((a) => a.id);
        return areas.map((id) => {
            const valores = elegidos.map((d) => {
                const a = d.resumen.porArea.find((x) => x.id === id);
                return { nombre: d.nombre, nota: a ? a.nota : null };
            }).filter((v) => typeof v.nota === "number");
            const orden = valores.slice().sort((x, y) => y.nota - x.nota);
            const area = elegidos[0].resumen.porArea.find((x) => x.id === id);
            return { id, nombre: area.nombre, alto: orden[0], bajo: orden[orden.length - 1],
                     distancia: orden.length > 1 ? orden[0].nota - orden[orden.length - 1].nota : 0 };
        }).sort((x, y) => y.distancia - x.distancia);
    }

    function montar(contenedor, diagnosticos, opciones) {
        const o = opciones || {};
        const esc = o.escapar || ((t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
        const lista = (diagnosticos || []).filter((d) => d && d.resumen && Array.isArray(d.resumen.porArea));
        if (lista.length < 2 || !contenedor) return false;
        let elegidos = lista.slice(0, 2).map((d) => d.id);

        contenedor.innerHTML = `
            <fieldset class="mb-4">
                <legend class="text-sm font-semibold text-brand-700 dark:text-brand-200 mb-2">Elige hasta ${MAXIMO} alumnos</legend>
                <div class="flex flex-wrap gap-x-4 gap-y-2" data-comparar-casillas>
                    ${lista.map((d) => `<label class="inline-flex items-center gap-2 text-sm text-brand-700 dark:text-brand-200 cursor-pointer">
                        <input type="checkbox" value="${esc(d.id)}" class="w-4 h-4 rounded border-brand-300 focus:ring-2 focus:ring-accent-400">${esc(d.nombre)}</label>`).join("")}
                </div>
                <p data-comparar-aviso role="status" class="text-xs text-brand-500 dark:text-brand-300 mt-1"></p>
            </fieldset>
            <div data-comparar-cuerpo></div>`;

        const casillas = [...contenedor.querySelectorAll("[data-comparar-casillas] input")];
        const aviso = contenedor.querySelector("[data-comparar-aviso]");
        const cuerpo = contenedor.querySelector("[data-comparar-cuerpo]");

        function pintar() {
            casillas.forEach((c) => { c.checked = elegidos.includes(c.value); c.disabled = !c.checked && elegidos.length >= MAXIMO; });
            const sel = elegidos.map((id) => lista.find((d) => d.id === id)).filter(Boolean);
            aviso.textContent = elegidos.length >= MAXIMO ? `Ya hay ${MAXIMO}: quita uno para elegir otro.` : "";
            if (sel.length < 2) {
                cuerpo.innerHTML = '<p class="text-sm text-brand-500 dark:text-brand-300">Elige al menos dos para compararlos.</p>';
                return;
            }
            const dif = diferencias(sel);
            const mayor = dif[0];
            const leyenda = sel.map((d, i) => `<li class="inline-flex items-center gap-2 text-sm text-brand-700 dark:text-brand-200">
                    <span class="comparar-muestra comparar-serie-${i + 1}" aria-hidden="true"></span>
                    <span><strong class="font-semibold">${esc(d.nombre)}</strong> · ≈${d.resumen.elo.combinado} · ${esc(d.resumen.nivel.etiqueta)}</span></li>`).join("");
            const filas = sel[0].resumen.porArea.map((a0) => {
                const barras = sel.map((d, i) => {
                    const a = d.resumen.porArea.find((x) => x.id === a0.id) || { nota: 0, porcentaje: 0 };
                    const ancho = Math.max(0, Math.min(100, a.nota));
                    return `<div class="flex items-center gap-2" title="${esc(d.nombre)} · ${esc(a0.nombre)}: ${a.nota} (${a.porcentaje} %)">
                        <div class="flex-1 h-2.5 bg-brand-100 dark:bg-brand-800 rounded-r">
                            <div class="h-full rounded-r comparar-serie-${i + 1}" style="width:${ancho}%"></div>
                        </div>
                        <span class="w-24 shrink-0 text-xs text-brand-600 dark:text-brand-300 tabular-nums"><span class="sr-only">${esc(d.nombre)}: </span>${a.nota} <span class="text-brand-450 dark:text-brand-350">(${a.porcentaje} %)</span></span>
                    </div>`;
                }).join("");
                return `<div data-comparar-area="${esc(a0.id)}">
                    <p class="text-sm font-medium text-brand-700 dark:text-brand-200 mb-1"><span aria-hidden="true">${a0.emoji} </span>${esc(a0.nombre)}</p>
                    <div class="space-y-1">${barras}</div>
                </div>`;
            }).join("");
            cuerpo.innerHTML = `
                <p class="text-sm text-brand-700 dark:text-brand-200 mb-3" data-comparar-resumen>${mayor && mayor.distancia > 0
                    ? `Donde más se separan: <strong class="font-semibold">${esc(mayor.nombre)}</strong> (${esc(mayor.alto.nombre)} ${mayor.alto.nota}, ${esc(mayor.bajo.nombre)} ${mayor.bajo.nota}).`
                    : "Rinden parejo en todas las áreas."}</p>
                <ul class="flex flex-wrap gap-x-5 gap-y-1 mb-4 list-none p-0" aria-label="Quién es cada color">${leyenda}</ul>
                <div class="space-y-4">${filas}</div>
                <p class="text-xs text-brand-450 dark:text-brand-350 mt-3">La nota de cada área compara lo que resolvió con lo esperable para su fuerza (70 es rendir lo esperable); entre paréntesis, el porcentaje de la prueba.</p>`;
        }

        casillas.forEach((c) => c.addEventListener("change", () => {
            if (c.checked && !elegidos.includes(c.value) && elegidos.length < MAXIMO) elegidos.push(c.value);
            if (!c.checked) elegidos = elegidos.filter((x) => x !== c.value);
            pintar();
        }));
        pintar();
        return true;
    }

    const api = { MAXIMO, montar, diferencias };
    if (typeof window !== "undefined") window.CompararAlumnos = api;
    if (typeof module !== "undefined") module.exports = api;
})();
