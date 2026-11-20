/* La participación de un alumno en la llamada de la clase, mes a mes
   (informes.html: la vista del profe y la del propio alumno). Ver «La
   participación del mes» en docs/decisiones/clase-en-vivo.md.

   Junta dos cosas que ya están guardadas:
   - los minutos que habló en cada clase (llamada_participacion, los mide la
     página del profe mientras está en la llamada);
   - las clases en las que estuvo (class_attendance).
   Una clase sin minutos puede ser una en la que no habló o una sin llamada
   (eso no se guarda), así que no se dice «no habló en 2 clases»: se dice en
   cuántas habló y en cuántas estuvo, y el profe sabe cuáles tuvieron llamada.

   Los meses van en hora de Costa Rica (HoraCR). Los últimos tres meses con
   algo, del más nuevo al más viejo. La RLS decide qué se ve: al alumno, lo
   suyo; al profe, lo de sus alumnos; a administración, todo. */
window.ParticipacionLlamada = (function () {
    "use strict";

    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    function minutos(s) {
        const m = Math.floor((s || 0) / 60);
        return m < 1 ? "menos de un minuto" : m + (m === 1 ? " minuto" : " minutos");
    }
    function nombreDelMes(clave) {
        const [y, m] = String(clave).split("-").map(Number);
        return MESES[m - 1] + " de " + y;
    }

    /* Pura (la prueba el verificador): las clases en que estuvo y lo que habló,
       agrupado por mes. `mesDe` da el mes en Costa Rica de una fecha. */
    function porMes(asistencias, hablado, mesDe) {
        const meses = new Map();
        const delMes = (m) => {
            if (!meses.has(m)) meses.set(m, { mes: m, estuvo: new Set(), clases: [], total: 0 });
            return meses.get(m);
        };
        for (const a of asistencias) if (a.inicio) delMes(mesDe(a.inicio)).estuvo.add(a.clase);
        for (const h of hablado) {
            if (!h.inicio || !(h.segundos > 0)) continue;
            const x = delMes(mesDe(h.inicio));
            x.estuvo.add(h.clase);
            x.clases.push({ clase: h.clase, inicio: h.inicio, segundos: h.segundos });
            x.total += h.segundos;
        }
        return [...meses.values()]
            .sort((a, b) => (a.mes < b.mes ? 1 : -1))
            .slice(0, 3)
            .map((x) => ({ mes: x.mes, estuvo: x.estuvo.size, hablo: x.clases.length, total: x.total,
                clases: x.clases.sort((a, b) => (a.inicio < b.inicio ? -1 : 1)) }));
    }

    async function montar(sb, contenedorId, alumnoId, opciones) {
        const propio = Boolean(opciones && opciones.propio);
        const caja = document.getElementById(contenedorId);
        if (!caja || !sb || !alumnoId) return 0;
        caja.textContent = "";
        // Tres meses atrás, con margen: lo de antes no se muestra.
        const desde = new Date(Date.now() - 100 * 86400000).toISOString();
        const [h, a] = await Promise.all([
            sb.from("llamada_participacion").select("class_session_id, segundos, actualizado, class_sessions(started_at)")
                .eq("persona_id", alumnoId).gte("actualizado", desde).range(0, 999),
            sb.from("class_attendance").select("session_id, joined_at, class_sessions(started_at)")
                .eq("student_id", alumnoId).gte("joined_at", desde).range(0, 999),
        ]);
        if (h.error || !h.data || !h.data.length) return 0;   // sin minutos hablados, no hay nada que mostrar
        const inicioDe = (f, otra) => (f.class_sessions && f.class_sessions.started_at) || otra;
        const meses = porMes(
            (a.error ? [] : a.data || []).map((f) => ({ clase: f.session_id, inicio: inicioDe(f, f.joined_at) })),
            h.data.map((f) => ({ clase: f.class_session_id, inicio: inicioDe(f, f.actualizado), segundos: f.segundos })),
            (x) => HoraCR.mes(x));
        if (!meses.length) return 0;
        for (const m of meses) {
            const sec = document.createElement("section");
            sec.className = "mb-4";
            const h3 = document.createElement("h3");
            h3.className = "text-sm font-semibold text-brand-800 dark:text-white";
            h3.textContent = nombreDelMes(m.mes).replace(/^./, (c) => c.toUpperCase());
            const p = document.createElement("p");
            p.className = "text-sm text-brand-700 dark:text-brand-200";
            p.textContent = (propio ? "Hablaste " : "Habló ") + minutos(m.total) + " en total, en "
                + m.hablo + (m.hablo === 1 ? " clase" : " clases") + " (" + (propio ? "estuviste" : "estuvo") + " en "
                + m.estuvo + (m.estuvo === 1 ? " clase" : " clases") + " ese mes).";
            sec.append(h3, p);
            if (m.clases.length) {
                const ul = document.createElement("ul");
                ul.className = "list-disc pl-5 mt-1 text-sm text-brand-800 dark:text-brand-100";
                for (const c of m.clases) {
                    const li = document.createElement("li");
                    li.textContent = HoraCR.fecha(c.inicio, { weekday: "long", day: "numeric", month: "long" }) + ": " + minutos(c.segundos);
                    ul.appendChild(li);
                }
                sec.appendChild(ul);
            }
            caja.appendChild(sec);
        }
        return meses.length;
    }

    return { montar, porMes };
})();

/*! rev bfb5bbb0d2d82f9f */
