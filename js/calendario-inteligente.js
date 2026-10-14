/* «Mi calendario»: las clases, las tareas y los exámenes en un solo lugar, con
 * lo que conviene hacer cada día para llegar a tiempo.
 *
 * Ver «Mi calendario: clases, tareas y exámenes, con un plan» en
 * docs/decisiones/paneles.md.
 *
 * Este archivo es PURO (sin DOM ni base): recibe las filas tal cual las
 * devuelven mis_clases_proximas(), tareas_con_avance(), examenes_con_nota() y
 * horario_clases, y arma los eventos, los avisos y el plan. Así se prueba sin
 * navegador (herramientas/verificar-calendario-inteligente.js). La página
 * (js/calendario-pagina.js) solo los pinta.
 *
 * - Los días son días de Costa Rica («AAAA-MM-DD»): una tarea que vence a las
 *   11 p. m. del martes vence el martes, aunque en UTC ya sea miércoles.
 * - Lo «inteligente» es una cuenta a la vista, no una caja negra: cada
 *   sugerencia dice por qué («es tu día más libre antes del jueves»).
 *
 *   CalendarioInteligente.eventosAlumno({ clases, tareas, examenes, ahora })
 *   CalendarioInteligente.clasesDelHorario(filas, { desde, dias, nombres })
 *   CalendarioInteligente.eventosProfe({ clases, tareas, examenes, ahora })
 *   CalendarioInteligente.planAlumno({ eventos, tareas, examenes, ahora, dias })
 *   CalendarioInteligente.planProfe({ eventos, ahora })
 *   CalendarioInteligente.avisosAlumno({ eventos, tareas, examenes, ahora })
 *   CalendarioInteligente.avisosProfe({ eventos, tareas, hayHorario, ahora })
 *   CalendarioInteligente.porDia(eventos)          → { "AAAA-MM-DD": [eventos] }
 *   CalendarioInteligente.semanasDelMes("AAAA-MM") → [[7 días], …] (lunes primero)
 */
(function () {
    "use strict";

    const ZONA = "America/Costa_Rica";
    const DIA_MS = 86400000;

    // ---------- Días y horas de Costa Rica ----------
    const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
    const FORMATO_HORA = new Intl.DateTimeFormat("es-CR", { timeZone: ZONA, hour: "numeric", minute: "2-digit" });
    const FORMATO_NOMBRE = new Intl.DateTimeFormat("es-CR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
    const FORMATO_CORTO = new Intl.DateTimeFormat("es-CR", { timeZone: ZONA, weekday: "short", day: "numeric" });
    const FORMATO_MES = new Intl.DateTimeFormat("es-CR", { timeZone: ZONA, month: "long", year: "numeric" });

    const momento = (x) => (x instanceof Date ? x : new Date(x));
    // Un día de calendario se lee al mediodía de Costa Rica: es el mismo día en cualquier zona.
    const mediodia = (d) => new Date(d + "T12:00:00-06:00");

    function dia(x) {
        const d = momento(x);
        return isNaN(d) ? "" : FORMATO_DIA.format(d);
    }
    // Días de calendario: «2026-10-14» + n. Cuenta de calendario pura, en UTC, sin horas que corran.
    function sumarDias(d, n) {
        const [y, m, dd] = String(d).split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);   // calendario en UTC
    }
    function diasEntre(a, b) {
        return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DIA_MS);
    }
    // 0 = domingo … 6 = sábado, como dia_semana de horario_clases.
    const diaSemana = (d) => new Date(d + "T12:00:00Z").getUTCDay();

    // «4:00 p. m.»; las doce del mediodía, «12:00 m. d.», como en el calendario del taller.
    function hora(x) {
        const d = momento(x);
        if (isNaN(d)) return "";
        const t = FORMATO_HORA.format(d);
        return /^12:00\s*p/.test(t) ? "12:00 m. d." : t;
    }
    // La hora en número (0 a 23), en Costa Rica.
    const FORMATO_H = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hour: "numeric", hourCycle: "h23" });
    const horaDelDia = (x) => Number(FORMATO_H.format(momento(x)));
    // «jueves 16 de octubre» (sin la coma que pone el navegador después del día).
    function nombreDia(d) {
        return FORMATO_NOMBRE.format(mediodia(d)).replace(/^(\S+),\s*/, "$1 ");
    }
    // «hoy», «mañana» o «el jueves 16 de octubre».
    function cuando(d, hoy) {
        const n = diasEntre(hoy, d);
        if (n === 0) return "hoy";
        if (n === 1) return "mañana";
        if (n === -1) return "ayer";
        return "el " + nombreDia(d);
    }
    const nombreCorto = (d) => FORMATO_CORTO.format(mediodia(d)).replace(/\.$/, "");
    const nombreMes = (mes) => FORMATO_MES.format(mediodia(mes + "-15"));
    const mayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
    // Termina una frase con punto, sin doblarlo después de «p. m.».
    const conPunto = (t) => (/\.$/.test(t) ? t : t + ".");

    // ---------- Los eventos ----------
    /* Un evento: { tipo: "clase"|"tarea"|"examen", clave, dia, inicio, fin,
       titulo, detalle, href, estado }. `estado` va escrito, nunca solo el
       color: «Ahora», «Vence hoy», «Vencida», «Hecha»… */
    function ordenar(eventos) {
        const peso = { clase: 0, examen: 1, tarea: 2 };
        return eventos.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1
            : (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : peso[a.tipo] - peso[b.tipo])));
    }

    function eventoClase(c, ahora) {
        const inicio = momento(c.inicio), fin = momento(c.fin);
        const enLinea = c.modalidad === "en_linea";
        return {
            tipo: "clase",
            clave: "clase-" + (c.horario_id || c.id || "") + "-" + dia(inicio),
            dia: dia(inicio), inicio: inicio.toISOString(), fin: fin.toISOString(),
            titulo: c.titulo ? "Clase: " + c.titulo : "Clase de ajedrez",
            detalle: hora(inicio) + " a " + hora(fin)
                + (c.modalidad ? (enLinea ? " · En línea" : " · Presencial") : "")
                + (c.profesor ? " · Con " + c.profesor : ""),
            href: "clases.html",
            estado: inicio <= ahora && ahora < fin ? "Ahora" : fin <= ahora ? "Terminó" : "",
        };
    }

    function estadoEntrega(vence, hecha, ahora) {
        if (hecha) return "Hecha";
        if (vence <= ahora) return "Vencida";
        if (dia(vence) === dia(ahora)) return "Vence hoy";
        return "";
    }

    function eventosAlumno({ clases, tareas, examenes, ahora } = {}) {
        ahora = ahora || new Date();
        const ev = [];
        for (const c of clases || []) {
            if (c && c.inicio && c.fin) ev.push(eventoClase(c, ahora));
        }
        for (const t of tareas || []) {
            if (!t || !t.vence_at) continue;
            const vence = momento(t.vence_at);
            const hecha = t.situacion === "completada";
            ev.push({
                tipo: "tarea", clave: "tarea-" + t.id, id: t.id,
                dia: dia(vence), inicio: vence.toISOString(), fin: vence.toISOString(),
                titulo: "Tarea: " + (t.titulo || "sin título"),
                detalle: "Vence a las " + hora(vence) + " · " + (t.cumplidos || 0) + " de " + (t.renglones || 0) + " hechas",
                href: "tareas.html",
                estado: t.situacion === "programada" ? "Programada" : estadoEntrega(vence, hecha, ahora),
            });
        }
        for (const e of examenes || []) {
            if (!e || !e.vence_at) continue;
            const vence = momento(e.vence_at);
            const hecho = e.estado === "entregado" || e.estado === "congelado";
            ev.push({
                tipo: "examen", clave: "examen-" + e.id, id: e.id,
                dia: dia(vence), inicio: vence.toISOString(), fin: vence.toISOString(),
                titulo: "Examen: " + (e.titulo || "sin título"),
                detalle: "Vence a las " + hora(vence) + (e.minutos ? " · " + e.minutos + " minutos" : ""),
                href: "examen.html?id=" + encodeURIComponent(e.id),
                estado: e.estado === "en_curso" ? "Empezado" : estadoEntrega(vence, hecho, ahora),
            });
        }
        return ordenar(ev);
    }

    /* El horario del profe (horario_clases) hecho clases con fecha, del día
       `desde` y `dias` días más. Costa Rica no tiene horario de verano:
       siempre es UTC−6. `nombres` traduce un subgrupo_id a su nombre. */
    function clasesDelHorario(filas, { desde, dias = 42, nombres = {} } = {}) {
        const out = [];
        for (let i = 0; i < dias; i++) {
            const d = sumarDias(desde, i);
            const dow = diaSemana(d);
            for (const h of filas || []) {
                if (!h || h.dia_semana !== dow || (h.desde && h.desde > d) || (h.hasta && h.hasta < d)) continue;
                const inicio = new Date(d + "T" + String(h.hora).slice(0, 5) + ":00-06:00");
                if (isNaN(inicio)) continue;
                const fin = new Date(inicio.getTime() + (h.duracion_min || 60) * 60000);
                const grupo = h.titulo || (h.subgrupo_id && nombres[h.subgrupo_id]) || (h.grupo ? "Grupo " + h.grupo : "");
                out.push({ horario_id: h.id, inicio: inicio.toISOString(), fin: fin.toISOString(), titulo: grupo, modalidad: h.modalidad });
            }
        }
        return out.sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
    }

    /* Las entregas del profe van JUNTAS: una tarea mandada a doce alumnos es
       una sola cosa en su calendario («Vence “Mates”: 4 de 12 sin terminar»),
       no doce renglones. Se agrupan por título y momento de vencimiento. */
    function agrupar(filas, tipo, hecha) {
        const grupos = new Map();
        for (const f of filas || []) {
            if (!f || !f.vence_at) continue;
            const k = (f.titulo || "") + "|" + momento(f.vence_at).toISOString();
            if (!grupos.has(k)) grupos.set(k, { titulo: f.titulo || "sin título", vence: momento(f.vence_at), alumnos: [], pendientes: [] });
            const g = grupos.get(k);
            g.alumnos.push(f.alumno_nombre || "");
            if (!hecha(f)) g.pendientes.push(f.alumno_nombre || "");
        }
        return [...grupos.values()].map((g) => Object.assign(g, { tipo }));
    }

    function eventosProfe({ clases, tareas, examenes, ahora } = {}) {
        ahora = ahora || new Date();
        const ev = [];
        for (const c of clases || []) {
            if (c && c.inicio && c.fin) ev.push(eventoClase(c, ahora));
        }
        const grupos = agrupar(tareas, "tarea", (t) => t.situacion === "completada")
            .concat(agrupar(examenes, "examen", (e) => e.estado === "entregado" || e.estado === "congelado"));
        for (const g of grupos) {
            const nombre = g.tipo === "tarea" ? "Tarea" : "Examen";
            const n = g.pendientes.length, total = g.alumnos.length;
            ev.push({
                tipo: g.tipo, clave: g.tipo + "-" + g.titulo + "-" + g.vence.toISOString(),
                dia: dia(g.vence), inicio: g.vence.toISOString(), fin: g.vence.toISOString(),
                titulo: nombre + ": " + g.titulo,
                detalle: "Vence a las " + hora(g.vence) + " · "
                    + (n === 0 ? "todos listos" : n === 1 ? "sin terminar: " + (g.pendientes[0] || "un alumno")
                        : n === total ? n + " alumnos sin terminar" : n + " de " + total + " alumnos sin terminar"),
                href: g.tipo === "tarea" ? "tareas.html" : "examenes.html",
                estado: n === 0 ? "Todos listos" : g.vence <= ahora ? "Vencida" : dia(g.vence) === dia(ahora) ? "Vence hoy" : "",
                pendientes: g.pendientes, total,
            });
        }
        return ordenar(ev);
    }

    function porDia(eventos) {
        const m = {};
        for (const e of eventos || []) (m[e.dia] = m[e.dia] || []).push(e);
        return m;
    }

    // Las semanas que tocan el mes, de lunes a domingo, con los días de los meses vecinos.
    function semanasDelMes(mes) {
        const primero = mes + "-01";
        const desplazo = (diaSemana(primero) + 6) % 7;   // lunes = 0
        let d = sumarDias(primero, -desplazo);
        const semanas = [];
        do {
            const s = [];
            for (let i = 0; i < 7; i++) { s.push(d); d = sumarDias(d, 1); }
            semanas.push(s);
        } while (d.slice(0, 7) === mes);
        return semanas;
    }
    function mesVecino(mes, n) {
        const [y, m] = mes.split("-").map(Number);
        const t = y * 12 + (m - 1) + n;
        return Math.floor(t / 12) + "-" + String((t % 12) + 1).padStart(2, "0");
    }

    // ---------- El plan del alumno ----------
    /* Qué hacer cada día para llegar a tiempo. Lo pendiente (tareas sin
       terminar y exámenes sin entregar, con fecha por delante) se reparte, de
       la entrega más cercana a la más lejana, en el día con MENOS carga entre
       hoy (o el día en que se abre) y el día en que vence:
       - la carga de un día es lo ya puesto ahí por el plan, más uno si hay
         clase (ese día ya se juega ajedrez) y más uno si vence otra cosa;
       - el mismo día del vencimiento pesa un poco más (dejar todo para el
         final es lo que hace llegar tarde), salvo que no haya otro;
       - una tarea con cuatro o más ejercicios por hacer se parte en dos días;
       - un examen ya empezado va HOY, primero que todo: el reloj corre.
       A igual carga gana el día más temprano. */
    function planAlumno({ eventos, tareas, examenes, ahora, dias = 14 } = {}) {
        ahora = ahora || new Date();
        const hoy = dia(ahora);
        const tope = sumarDias(hoy, dias - 1);
        const carga = {};
        const sumar = (d, n) => { carga[d] = (carga[d] || 0) + n; };
        for (const e of eventos || []) {
            if (e.dia < hoy) continue;
            if (e.tipo === "clase") sumar(e.dia, 1);
            else if (e.estado !== "Hecha") sumar(e.dia, 1);
        }

        const pendientes = [];
        for (const t of tareas || []) {
            if (!t || !t.vence_at || t.situacion === "completada" || t.situacion === "vencida") continue;
            const vence = momento(t.vence_at);
            if (vence <= ahora) continue;
            const faltan = Math.max(1, (t.renglones || 0) - (t.cumplidos || 0));
            pendientes.push({
                tipo: "tarea", id: t.id, titulo: t.titulo || "sin título", vence, faltan,
                abre: t.disponible_desde && momento(t.disponible_desde) > ahora ? dia(t.disponible_desde) : hoy,
                href: "tareas.html",
            });
        }
        for (const e of examenes || []) {
            if (!e || !e.vence_at || (e.estado !== "asignado" && e.estado !== "en_curso")) continue;
            const vence = momento(e.vence_at);
            if (vence <= ahora) continue;
            pendientes.push({
                tipo: "examen", id: e.id, titulo: e.titulo || "sin título", vence, faltan: 1,
                empezado: e.estado === "en_curso",
                abre: e.disponible_desde && momento(e.disponible_desde) > ahora ? dia(e.disponible_desde) : hoy,
                href: "examen.html?id=" + encodeURIComponent(e.id),
            });
        }
        pendientes.sort((a, b) => (b.empezado ? 1 : 0) - (a.empezado ? 1 : 0) || a.vence - b.vence);

        const plan = [];
        for (const p of pendientes) {
            const vence = dia(p.vence);
            const nombre = (p.tipo === "tarea" ? "la tarea" : "el examen") + " «" + p.titulo + "»";
            if (p.empezado) {
                plan.push({ dia: hoy, tipo: p.tipo, id: p.id, href: p.href, urgente: true,
                    texto: "Termina " + nombre, motivo: "Ya lo empezaste y el reloj sigue corriendo." });
                sumar(hoy, 2);
                continue;
            }
            /* Lo que vence temprano en la mañana (antes del mediodía) se hace
               el día anterior: ese mismo día no da tiempo. */
            let ultimo = horaDelDia(p.vence) < 12 ? sumarDias(vence, -1) : vence;
            const desde = p.abre > hoy ? p.abre : hoy;
            if (ultimo < desde) ultimo = desde;
            const candidatos = [];
            for (let d = desde; d <= ultimo; d = sumarDias(d, 1)) candidatos.push(d);
            const partes = p.tipo === "tarea" && p.faltan >= 4 && candidatos.length >= 2 ? 2 : 1;
            const elegidos = [];
            for (let k = 0; k < partes; k++) {
                let mejor = null, costoMejor = Infinity;
                for (const d of candidatos) {
                    if (elegidos.includes(d)) continue;
                    const costo = (carga[d] || 0) + (d === vence && candidatos.length > 1 ? 1.5 : 0);
                    if (costo < costoMejor) { mejor = d; costoMejor = costo; }
                }
                if (!mejor) break;
                elegidos.push(mejor);
                sumar(mejor, 1);
            }
            elegidos.sort();
            elegidos.forEach((d, i) => {
                let texto;
                if (p.tipo === "examen") texto = "Haz " + nombre;
                else if (partes === 2) {
                    const mitad = Math.ceil(p.faltan / 2);
                    texto = (i === 0 ? "Avanza " : "Termina ") + nombre
                        + (i === 0 ? " (" + mitad + " de los " + p.faltan + " ejercicios que te faltan)" : "");
                } else texto = (p.faltan === 1 ? "Haz " : "Termina ") + nombre
                    + (p.faltan > 1 ? " (te faltan " + p.faltan + ")" : "");
                const libre = candidatos.length > 1;
                const motivo = d === vence
                    ? conPunto("Vence ese mismo día a las " + hora(p.vence))
                    : libre ? "Vence " + cuando(vence, d) + " a las " + hora(p.vence) + "; es tu día más libre antes de eso."
                    : conPunto("Vence " + cuando(vence, d) + " a las " + hora(p.vence));
                plan.push({ dia: d, tipo: p.tipo, id: p.id, href: p.href, texto, motivo });
            });
        }
        return plan.filter((x) => x.dia <= tope).sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0)));
    }

    // ---------- Los avisos ----------
    /* Lo que conviene saber antes de mirar el mes: lo que vence hoy, un examen
       empezado, los días con varias entregas juntas, lo vencido sin terminar.
       Cada aviso: { nivel: "alto"|"medio"|"info", texto }. */
    function avisosAlumno({ eventos, tareas, examenes, ahora } = {}) {
        ahora = ahora || new Date();
        const hoy = dia(ahora);
        const out = [];
        for (const e of examenes || []) {
            if (e && e.estado === "en_curso") out.push({ nivel: "alto", texto: "Tienes empezado el examen «" + (e.titulo || "") + "»: termínalo antes de que se acabe el tiempo." });
        }
        const hoyVence = (eventos || []).filter((e) => e.tipo !== "clase" && e.dia === hoy && e.estado === "Vence hoy");
        for (const e of hoyVence) out.push({ nivel: "alto", texto: "Hoy vence " + (e.tipo === "tarea" ? "la tarea" : "el examen") + " «" + e.titulo.replace(/^(Tarea|Examen): /, "") + "», a las " + conPunto(hora(e.fin)) });

        const entregas = {};
        for (const e of eventos || []) {
            if (e.tipo === "clase" || e.dia <= hoy || e.estado === "Hecha" || e.estado === "Programada") continue;
            entregas[e.dia] = (entregas[e.dia] || 0) + 1;
        }
        Object.keys(entregas).sort().forEach((d) => {
            if (entregas[d] >= 2 && diasEntre(hoy, d) <= 14) out.push({ nivel: "medio", texto: mayuscula(cuando(d, hoy)) + " vencen " + entregas[d] + " entregas juntas: el plan reparte el trabajo en los días de antes." });
        });

        const vencidas = (tareas || []).filter((t) => t && t.situacion === "vencida").length;
        if (vencidas) out.push({ nivel: "medio", texto: (vencidas === 1 ? "Tienes 1 tarea vencida sin terminar" : "Tienes " + vencidas + " tareas vencidas sin terminar") + ": todavía puedes hacerla" + (vencidas === 1 ? "" : "s") + " en «Mis tareas»." });

        const proxima = (eventos || []).find((e) => e.tipo === "clase" && momento(e.fin) > ahora);
        if (proxima) out.push({ nivel: "info", texto: conPunto(proxima.estado === "Ahora" ? "Tu clase es ahora, hasta las " + hora(proxima.fin) : "Tu próxima clase es " + cuando(proxima.dia, hoy) + " a las " + hora(proxima.inicio)) });
        return out;
    }

    function avisosProfe({ eventos, tareas, hayHorario, ahora } = {}) {
        ahora = ahora || new Date();
        const hoy = dia(ahora);
        const out = [];
        for (const e of eventos || []) {
            if (e.tipo !== "clase" && e.dia === hoy && e.estado === "Vence hoy") {
                const n = e.pendientes.length;
                out.push({ nivel: "alto", texto: "Hoy vence «" + e.titulo.replace(/^(Tarea|Examen): /, "") + "»: "
                    + (n === 1 ? (e.pendientes[0] || "un alumno") + " todavía no termina." : n + " alumnos todavía no terminan.") });
            }
        }
        /* Un alumno con tres o más entregas tuyas el mismo día: lo más
           probable es que no llegue a todas. */
        const porAlumnoDia = {};
        for (const t of tareas || []) {
            if (!t || !t.vence_at || t.situacion === "completada" || momento(t.vence_at) <= ahora) continue;
            const k = (t.alumno_nombre || "") + "|" + dia(t.vence_at);
            porAlumnoDia[k] = (porAlumnoDia[k] || 0) + 1;
        }
        Object.keys(porAlumnoDia).sort((a, b) => a.split("|")[1].localeCompare(b.split("|")[1])).forEach((k) => {
            const [quien, d] = k.split("|");
            if (porAlumnoDia[k] >= 3 && quien) out.push({ nivel: "medio", texto: quien + " tiene " + porAlumnoDia[k] + " tareas tuyas que vencen " + cuando(d, hoy) + ": quizá convenga correr alguna." });
        });
        if (!hayHorario) out.push({ nivel: "info", texto: "Tu horario está vacío: si das clase en días fijos, ponlos en «Asistencia presencial» y aparecen acá." });
        else {
            const proxima = (eventos || []).find((e) => e.tipo === "clase" && momento(e.fin) > ahora);
            if (proxima) out.push({ nivel: "info", texto: conPunto(proxima.estado === "Ahora" ? "Tu clase es ahora, hasta las " + hora(proxima.fin) : "Tu próxima clase es " + cuando(proxima.dia, hoy) + " a las " + hora(proxima.inicio) + (proxima.titulo !== "Clase de ajedrez" ? " (" + proxima.titulo.replace(/^Clase: /, "") + ")" : "")) });
        }
        return out;
    }

    // ---------- El plan del profe ----------
    /* Para cada entrega que vence en los próximos días con alumnos
       pendientes: en qué clase revisarla (la primera que viene después del
       vencimiento) y, si alguno no la ha terminado, en qué clase
       recordarla (la última antes de que venza, si cae en la semana). */
    function planProfe({ eventos, ahora, dias = 14 } = {}) {
        ahora = ahora || new Date();
        const hoy = dia(ahora);
        const tope = sumarDias(hoy, dias - 1);
        const clases = (eventos || []).filter((e) => e.tipo === "clase" && momento(e.fin) > ahora);
        const plan = [];
        for (const e of eventos || []) {
            if (e.tipo === "clase" || e.dia < hoy || e.dia > tope) continue;
            const nombre = (e.tipo === "tarea" ? "la tarea" : "el examen") + " «" + e.titulo.replace(/^(Tarea|Examen): /, "") + "»";
            const lo = e.tipo === "tarea" ? "la" : "lo";
            const antes = clases.filter((c) => c.fin <= e.inicio).pop();
            if (antes && e.pendientes && e.pendientes.length && diasEntre(antes.dia, e.dia) <= 7) {
                const n = e.pendientes.length;
                plan.push({ dia: antes.dia, tipo: e.tipo, href: e.href,
                    texto: "Recuérdales " + nombre + " en tu clase de las " + hora(antes.inicio),
                    motivo: (n === 1 ? "1 alumno no " + lo + " ha terminado" : n + " alumnos no " + lo + " han terminado") + " y vence " + cuando(e.dia, antes.dia) + "." });
            }
            const despues = clases.find((c) => c.inicio >= e.fin);
            if (despues && despues.dia <= tope) {
                plan.push({ dia: despues.dia, tipo: e.tipo, href: e.href,
                    texto: "Revisa " + nombre + " en tu clase de las " + hora(despues.inicio),
                    motivo: "Es la primera clase después de que vence; lo que costó se repasa fresco." });
            }
        }
        return plan.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
    }

    const api = {
        ZONA, dia, sumarDias, diasEntre, diaSemana, hora, nombreDia, nombreCorto, nombreMes, cuando, mayuscula, conPunto,
        eventosAlumno, eventosProfe, clasesDelHorario, porDia, semanasDelMes, mesVecino,
        planAlumno, planProfe, avisosAlumno, avisosProfe,
    };
    if (typeof window !== "undefined") window.CalendarioInteligente = api;
    if (typeof module !== "undefined") module.exports = api;
})();
