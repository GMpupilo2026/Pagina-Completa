/* Los puntos de la clase en vivo: lo que hizo cada alumno en ESA clase,
 * contado por resumen_de_la_clase (la base), pasado a puntos con una regla
 * que se lee escrita. No se guarda nada: los puntos se derivan de las filas
 * de la clase, y el podio que ve la clase es una foto que manda el profe
 * (game_state.podio).
 *
 * La regla va escrita en un solo lugar y se le muestra al profe tal cual:
 * un puntaje que nadie sabe de dónde sale no motiva a nadie.
 */
window.PuntosClase = (function () {
    /* Las respuestas correctas suman según la dificultad, los intentos y el
       puesto: eso lo cuenta la base (puntos_de_la_clase, en
       `puntos_preguntas`) con la misma cuenta que puntosDeUnaRespuesta. Lo
       demás, por cada vez, en la misma escala (una pregunta media son 25). */
    const REGLAS = [
        { campo: "turnos_bien", puntos: 20, texto: "turno de palabra bien" },
        { campo: "turnos_casi", puntos: 10, texto: "turno de palabra casi" },
        { campo: "ganadas", puntos: 30, texto: "práctica ganada al motor" },
        { campo: "tablas", puntos: 15, texto: "práctica en tablas" },
        { campo: "partidas_ganadas", puntos: 30, texto: "partida ganada a un compañero" },
        { campo: "partidas_tablas", puntos: 15, texto: "partida en tablas con un compañero" },
    ];
    const INTENTOS = [1, 0.6, 0.3];      // a la primera, al 2.º intento, del 3.º en adelante
    const PUESTOS = [0.5, 0.3, 0.15];    // lo que suma de más el 1.º, el 2.º y el 3.º en acertar

    /* Los puntos de UNA respuesta correcta: la misma cuenta que
       interno.puntos_de_una_respuesta en la base (migración puntos_de_la_clase).
       Base de 10 (600 Elo o menos) a 50 (2200 o más); sin dificultad, 25. */
    function puntosDeUnaRespuesta(dificultad, intentos, puesto) {
        const d = dificultad == null ? 1200 : dificultad;
        const base = Math.round(10 + 40 * Math.min(1, Math.max(0, (d - 600) / 1600)));
        const mult = INTENTOS[Math.min(INTENTOS.length, Math.max(1, intentos || 1)) - 1];
        const extra = puesto >= 1 && puesto <= PUESTOS.length ? PUESTOS[puesto - 1] : 0;
        return Math.round(base * mult * (1 + extra));
    }

    function puntos(fila) {
        return (Number(fila && fila.puntos_preguntas) || 0) + (Number(fila && fila.puntos_tandas) || 0)
            + REGLAS.reduce((s, r) => s + (Number(fila && fila[r.campo]) || 0) * r.puntos, 0);
    }

    // De dónde salen: «3 respuestas bien, 2 a la primera y 1 primero en acertar (+96) · 1 × turno de palabra bien (+20)».
    function desglose(fila) {
        const partes = [];
        const bien = Number(fila.correctas) || 0;
        if (bien && Number(fila.puntos_preguntas) > 0) {
            const det = [];
            if (Number(fila.a_la_primera) > 0) det.push(fila.a_la_primera + " a la primera");
            if (Number(fila.primeros) > 0) det.push(fila.primeros + (Number(fila.primeros) === 1 ? " vez primero" : " veces primero") + " en acertar");
            partes.push(bien + (bien === 1 ? " respuesta bien" : " respuestas bien") + (det.length ? " (" + det.join(", ") + ")" : "") + " (+" + fila.puntos_preguntas + ")");
        }
        const tb = Number(fila.tanda_bien) || 0;
        if (tb && Number(fila.puntos_tandas) > 0) {
            const tp = Number(fila.tanda_primeros) || 0;
            partes.push(tb + (tb === 1 ? " ejercicio" : " ejercicios") + " del calentamiento bien"
                + (tp ? " (" + tp + (tp === 1 ? " vez primero" : " veces primero") + ")" : "") + " (+" + fila.puntos_tandas + ")");
        }
        REGLAS.filter((r) => Number(fila[r.campo]) > 0)
            .forEach((r) => partes.push(fila[r.campo] + " × " + r.texto + " (+" + fila[r.campo] * r.puntos + ")"));
        return partes.join(" · ");
    }

    function reglaEscrita() {
        return "cada respuesta bien vale de 10 a 50 puntos según su dificultad; a la primera, todo (al 2.º intento, el 60 %; después, el 30 %); "
            + "el 1.º en acertar suma un 50 % más, el 2.º un 30 % y el 3.º un 15 % · "
            + "cada ejercicio del calentamiento bien, lo mismo según su nivel (en la competencia, también el 1.º, 2.º y 3.º en resolverlo) · "
            + REGLAS.map((r) => r.texto + ": " + r.puntos + " puntos").join(" · ");
    }

    /* Junta a cada fila del resumen sus puntos de preguntas (puntos_de_la_clase /
       puntos_del_mes) y los de los calentamientos (puntos_de_tandas /
       puntos_de_tandas_del_mes). Quien solo hizo el calentamiento también
       aparece: no estaba en el resumen. */
    function juntar(filas, puntosFilas, tandasFilas) {
        const por = new Map((puntosFilas || []).map((p) => [p.student_id, p]));
        const tan = new Map((tandasFilas || []).map((p) => [p.student_id, p]));
        const out = (filas || []).map((f) => {
            const p = por.get(f.student_id) || {}, t = tan.get(f.student_id) || {};
            return Object.assign({}, f, { puntos_preguntas: p.puntos_preguntas || 0, a_la_primera: p.a_la_primera || 0, primeros: p.primeros || 0,
                puntos_tandas: t.puntos || 0, tanda_bien: t.resueltos || 0, tanda_primeros: t.primeros || 0 });
        });
        const ya = new Set(out.map((f) => f.student_id));
        (tandasFilas || []).forEach((t) => {
            if (ya.has(t.student_id)) return;
            out.push({ student_id: t.student_id, nombre: t.nombre || "Alumno", puntos_preguntas: 0, a_la_primera: 0, primeros: 0,
                puntos_tandas: t.puntos || 0, tanda_bien: t.resueltos || 0, tanda_primeros: t.primeros || 0 });
        });
        return out;
    }

    /* Ordenadas de más a menos, con su puesto. Empatados comparten puesto
       («1.º, 1.º, 3.º»): nadie queda segundo por el orden alfabético. */
    function ranking(filas) {
        const conPuntos = (filas || []).map((f) => ({ id: f.student_id, nombre: f.nombre, puntos: puntos(f), fila: f }))
            .sort((a, b) => b.puntos - a.puntos || String(a.nombre).localeCompare(String(b.nombre)));
        let puesto = 0, anterior = null;
        conPuntos.forEach((x, i) => {
            if (x.puntos !== anterior) { puesto = i + 1; anterior = x.puntos; }
            x.puesto = puesto;
        });
        return conPuntos;
    }

    /* La foto del podio que ve la clase (game_state.podio). Sin nombres, cada
       alumno se reconoce por su id y los demás ven solo los puntos. Van todos
       los que sumaron algo, para que cada uno sepa su puesto. */
    function podioParaLaClase(filas, conNombres) {
        return {
            at: new Date().toISOString(),
            con_nombres: !!conNombres,
            lineas: ranking(filas).filter((x) => x.puntos > 0).slice(0, 100)
                .map((x) => ({ id: x.id, nombre: conNombres ? x.nombre : null, puntos: x.puntos, puesto: x.puesto })),
        };
    }

    /* ---------- Los equipos (game_state.equipos) ----------
       Hasta cuatro, cada uno con su nombre y su color (el color nunca va
       solo: el nombre del equipo ES el color escrito). Los puntos de un
       equipo son la suma de los de sus integrantes: no se guardan. */
    const EQUIPOS = [
        { nombre: "Azul", color: "azul" },
        { nombre: "Verde", color: "verde" },
        { nombre: "Naranja", color: "naranja" },
        { nombre: "Rojo", color: "rojo" },
    ];

    // Reparte a los alumnos al azar, de a uno por equipo: quedan parejos (a lo sumo uno de diferencia).
    function repartir(alumnos, cuantos, azar) {
        const n = Math.max(2, Math.min(EQUIPOS.length, cuantos || 2));
        const r = azar || Math.random;
        const mezcla = (alumnos || []).slice();
        for (let i = mezcla.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [mezcla[i], mezcla[j]] = [mezcla[j], mezcla[i]];
        }
        const lista = EQUIPOS.slice(0, n).map((e) => ({ nombre: e.nombre, color: e.color, miembros: [] }));
        mezcla.forEach((a, i) => lista[i % n].miembros.push({ id: a.id, nombre: a.nombre }));
        return { at: new Date().toISOString(), lista };
    }

    function puntosDeEquipos(filas, lista) {
        const porAlumno = new Map((filas || []).map((f) => [f.student_id, puntos(f)]));
        const conPuntos = (lista || []).map((e) => ({
            nombre: e.nombre, color: e.color,
            puntos: (e.miembros || []).reduce((s, m) => s + (porAlumno.get(m.id) || 0), 0),
        })).sort((a, b) => b.puntos - a.puntos);
        let puesto = 0, anterior = null;
        conPuntos.forEach((x, i) => {
            if (x.puntos !== anterior) { puesto = i + 1; anterior = x.puntos; }
            x.puesto = puesto;
        });
        return conPuntos;
    }

    /* ---------- Los puntos del mes ----------
       resumen_del_mes (la base) suma lo de las clases del mes en curso, en
       hora de Costa Rica; los puntos salen de la MISMA regla de arriba. El
       profe pasa su id y ve a sus alumnos; el alumno pasa null y ve lo suyo. */
    async function cargarDelMes(sb, profesorId) {
        const args = { p_profesor: profesorId || null };
        const [r, p, t] = await Promise.all([sb.rpc("resumen_del_mes", args), sb.rpc("puntos_del_mes", args), sb.rpc("puntos_de_tandas_del_mes", args)]);
        if (p.error) console.error(p.error);
        if (t.error) console.error(t.error);
        return { filas: juntar(r.data || [], p.data || [], t.data || []), error: r.error || p.error || t.error };
    }

    function nombreDelMes() {
        try { return new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", month: "long" }).format(new Date()); }
        catch (e) { return "este mes"; }
    }

    // La tarjeta del panel del alumno: sus puntos del mes. Sin clases este mes, no aparece.
    async function pintarDelMesDelAlumno(sb, caja) {
        if (!caja) return;
        const { filas, error } = await cargarDelMes(sb, null);
        const f = !error && filas[0];
        if (!f || !(f.clases > 0)) { caja.hidden = true; return; }
        caja.innerHTML = "";
        const el = (tag, cls, texto) => { const e = document.createElement(tag); e.className = cls; e.textContent = texto; return e; };
        const h2 = el("h2", "font-serif text-lg font-bold text-brand-800 dark:text-white", "");
        h2.id = "puntos-mes-titulo";
        const ic = el("span", "", "🏆 ");
        ic.setAttribute("aria-hidden", "true");
        h2.append(ic, document.createTextNode("Tus puntos de " + nombreDelMes()));
        const n = puntos(f);
        caja.append(h2,
            el("p", "text-2xl font-bold text-brand-800 dark:text-white mt-1", textoPuntos(n) + " en " + f.clases + (f.clases === 1 ? " clase" : " clases")),
            el("p", "text-sm text-brand-600 dark:text-brand-300 mt-1", n ? desglose(f) : "Todavía no sumaste puntos este mes: contesta las preguntas de la clase."),
            el("p", "text-xs text-brand-500 dark:text-brand-300 mt-2", "Cómo se cuentan: " + reglaEscrita() + "."));
        caja.hidden = false;
    }

    function medalla(puesto) { return puesto === 1 ? "🥇" : puesto === 2 ? "🥈" : puesto === 3 ? "🥉" : ""; }
    function textoPuntos(n) { return n + (n === 1 ? " punto" : " puntos"); }

    return { REGLAS, INTENTOS, PUESTOS, puntosDeUnaRespuesta, juntar, puntos, desglose, reglaEscrita, ranking, podioParaLaClase, medalla, textoPuntos,
        EQUIPOS, repartir, puntosDeEquipos, cargarDelMes, nombreDelMes, pintarDelMesDelAlumno };
})();
