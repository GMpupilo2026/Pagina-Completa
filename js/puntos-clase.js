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
    const REGLAS = [
        { campo: "respondidas", puntos: 1, texto: "pregunta contestada" },
        { campo: "correctas", puntos: 2, texto: "respuesta correcta" },
        { campo: "turnos_bien", puntos: 2, texto: "turno de palabra bien" },
        { campo: "turnos_casi", puntos: 1, texto: "turno de palabra casi" },
        { campo: "ganadas", puntos: 3, texto: "práctica ganada al motor" },
        { campo: "tablas", puntos: 1, texto: "práctica en tablas" },
        { campo: "partidas_ganadas", puntos: 3, texto: "partida ganada a un compañero" },
        { campo: "partidas_tablas", puntos: 1, texto: "partida en tablas con un compañero" },
    ];

    function puntos(fila) {
        return REGLAS.reduce((s, r) => s + (Number(fila && fila[r.campo]) || 0) * r.puntos, 0);
    }

    // De dónde salen: «2 contestadas (+2) · 1 correcta (+2)».
    function desglose(fila) {
        return REGLAS.filter((r) => Number(fila[r.campo]) > 0)
            .map((r) => fila[r.campo] + " × " + r.texto + " (+" + fila[r.campo] * r.puntos + ")")
            .join(" · ");
    }

    function reglaEscrita() {
        return REGLAS.map((r) => r.texto + ": " + r.puntos + (r.puntos === 1 ? " punto" : " puntos")).join(" · ");
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

    function medalla(puesto) { return puesto === 1 ? "🥇" : puesto === 2 ? "🥈" : puesto === 3 ? "🥉" : ""; }
    function textoPuntos(n) { return n + (n === 1 ? " punto" : " puntos"); }

    return { REGLAS, puntos, desglose, reglaEscrita, ranking, podioParaLaClase, medalla, textoPuntos,
        EQUIPOS, repartir, puntosDeEquipos };
})();
