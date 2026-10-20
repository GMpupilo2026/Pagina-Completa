/* Los profesores que también son alumnos míos.
 *
 * Un profesor puede estudiar con otro (Ronaldo y Sebastián con Oscar) sin dejar
 * de ser profesor. Las pantallas donde se elige a quién mandarle una tarea, un
 * examen, un plan o una partida piden los perfiles con `role = 'alumno'`, y
 * esos no salen ahí: este módulo los suma a la lista, tal como los entrega la
 * base (`profesores_que_estudian_conmigo()`, que pasa por la RLS). Ver «Un
 * profesor también puede ser alumno de otro» en docs/decisiones/permisos-y-roles.md.
 *
 * Si la llamada falla, la lista queda como estaba: sumar es un extra, no
 * puede dejar la pantalla sin alumnos.
 */
(function () {
    async function sumarProfesores(sb, alumnos) {
        const base = alumnos || [];
        try {
            const { data, error } = await sb.rpc("profesores_que_estudian_conmigo");
            if (error || !data || !data.length) return base;
            const ya = new Set(base.map((a) => a.id));
            const nuevos = data.filter((p) => !ya.has(p.id)).map((p) => ({ id: p.id, full_name: p.full_name, email: p.email, grupo: p.grupo }));
            if (!nuevos.length) return base;
            const nombre = (a) => a.full_name || a.email || "";
            return base.concat(nuevos).sort((a, b) => nombre(a).localeCompare(nombre(b), "es") || (a.id < b.id ? -1 : 1));
        } catch (e) {
            return base;
        }
    }
    /* ¿Esta persona estudia con algún profesor? (mis_clases() trae una fila por
       profesor suyo). Para un profesor que también es alumno: la página le suma
       su lado de alumno —lo que le mandó su profesor— debajo de lo de dar
       clase. Quien administra no es alumno de nadie: da vacío. */
    async function estudioConAlguien(sb) {
        try {
            const { data, error } = await sb.rpc("mis_clases");
            return !error && Array.isArray(data) && data.length > 0;
        } catch (e) {
            return false;
        }
    }
    window.AlumnosMios = { sumarProfesores, estudioConAlguien };
})();
