/* El plan de clase: la lista ordenada de lo que el profesor va a enseñar,
 * escrita ANTES y no en vivo.
 *
 * Este archivo es lo único que sabe leer y escribir un plan, porque lo usan dos
 * páginas muy distintas:
 *
 *  - `planes.html`, el armador — donde se prepara la clase el día antes;
 *  - `sesion.html`, la clase en vivo — donde se da, con el botón "📥 Al tablero"
 *    de cada renglón.
 *
 * Los TIPOS de renglón no son un catálogo abierto: cada uno existe porque la
 * clase en vivo YA tiene la puerta que lo atiende.
 *
 *   posicion -> aplicarPosicionEnClase(), la misma que el editor, el diagrama
 *               del curso, Táctica y los archivos PGN. Si el renglón trae
 *               `pregunta`, además se ofrece abrirla en el tablero. Ojo: ese
 *               texto NO le llega al alumno — `questions` no tiene enunciado,
 *               el alumno contesta moviendo. Es la chuleta del profesor, para
 *               que no tenga que acordarse de qué iba a preguntar.
 *   leccion  -> abrirLeccionLocal(), que la abre SOLO en su pantalla.
 *   nota     -> no toca el tablero. Es su chuleta: "preguntar quién jugó el
 *               fin de semana", "no pasar de aquí si no entendieron".
 *
 * Añadir un tipo sin su puerta deja un renglón que no hace nada al tocarlo, en
 * medio de la clase y delante de todos, sin dar ningún error.
 */
window.PlanClase = (function () {
    const CAMPOS_PLAN = "id, profesor_id, titulo, notas, compartido_todos, created_at, updated_at";
    const CAMPOS_ITEM = "id, plan_id, orden, tipo, titulo, fen, pregunta, curso, leccion, nota";

    const TIPOS = [
        { id: "posicion", etiqueta: "Posición", icono: "♟️",
          ayuda: "Una posición que se transmite al tablero de la clase." },
        { id: "leccion", etiqueta: "Lección de curso", icono: "📚",
          ayuda: "Se abre solo en tu pantalla, como el PDF." },
        { id: "nota", etiqueta: "Nota", icono: "📝",
          ayuda: "Tu chuleta: no se transmite ni la ve nadie más." },
    ];

    const tipoDe = (id) => TIPOS.find((t) => t.id === id) || TIPOS[2];

    async function listarPlanes(sb, profesorId) {
        const { data, error } = await sb.from("planes_clase").select(CAMPOS_PLAN)
            .eq("profesor_id", profesorId)
            .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async function itemsDe(sb, planId) {
        const { data, error } = await sb.from("plan_items").select(CAMPOS_ITEM)
            .eq("plan_id", planId).order("orden", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async function crearPlan(sb, profesorId, titulo, notas) {
        const { data, error } = await sb.from("planes_clase")
            .insert({ profesor_id: profesorId, titulo, notas: notas || null })
            .select(CAMPOS_PLAN).single();
        if (error) throw error;
        return data;
    }

    async function actualizarPlan(sb, id, campos) {
        const { data, error } = await sb.from("planes_clase").update(campos).eq("id", id)
            .select(CAMPOS_PLAN).single();
        if (error) throw error;
        return data;
    }

    async function borrarPlan(sb, id) {
        // Los renglones se van con el plan: plan_items cuelga con ON DELETE CASCADE.
        const { error } = await sb.from("planes_clase").delete().eq("id", id);
        if (error) throw error;
    }

    async function agregarItem(sb, planId, item) {
        const fila = {
            plan_id: planId,
            orden: item.orden,
            tipo: item.tipo,
            titulo: item.titulo,
            fen: item.fen || null,
            pregunta: item.pregunta || null,
            curso: item.curso || null,
            leccion: (item.leccion === 0 || item.leccion) ? item.leccion : null,
            nota: item.nota || null,
        };
        const { data, error } = await sb.from("plan_items").insert(fila).select(CAMPOS_ITEM).single();
        if (error) throw error;
        return data;
    }

    async function borrarItem(sb, id) {
        const { error } = await sb.from("plan_items").delete().eq("id", id);
        if (error) throw error;
    }

    /* Reordenar manda el `orden` de CADA renglón movido, no solo el que cambió:
       con dos renglones en el mismo número, el orden que sale depende de cómo
       resuelva el empate la base — o sea que el plan se ve distinto cada vez
       sin que nada falle. */
    async function moverItem(sb, items, id, direccion) {
        const i = items.findIndex((x) => x.id === id);
        const j = i + direccion;
        if (i < 0 || j < 0 || j >= items.length) return items;
        const copia = items.slice();
        copia[i] = items[j];
        copia[j] = items[i];
        for (let k = 0; k < copia.length; k += 1) {
            if (copia[k].orden !== k) {
                const { error } = await sb.from("plan_items").update({ orden: k }).eq("id", copia[k].id);
                if (error) throw error;
                copia[k] = Object.assign({}, copia[k], { orden: k });
            }
        }
        return copia;
    }

    /* Duplicar es lo que hace que un plan sea material y no un apunte de un día:
       se da la misma clase al grupo de la tarde y se le cambia lo que haga
       falta, sin tocar el original. */
    async function duplicarPlan(sb, profesorId, plan) {
        const items = await itemsDe(sb, plan.id);
        const copia = await crearPlan(sb, profesorId, "Copia de " + plan.titulo, plan.notas);
        for (let i = 0; i < items.length; i += 1) {
            await agregarItem(sb, copia.id, Object.assign({}, items[i], { orden: i }));
        }
        return copia;
    }

    /* ---- Compartir ------------------------------------------------------
     *
     * Un plan es DE quien lo escribió, y compartirlo no cambia eso: el colega lo
     * ve y lo duplica; editarlo y borrarlo siguen siendo del dueño. Eso no lo
     * decide esta página — lo hace cumplir la base, que solo amplió el `select`.
     *
     * Hay dos formas, y no son la misma:
     *
     *   compartido_todos      -> todo el equipo docente, sin ir nombrando a
     *                            nadie. Es lo que sirve para los planes de
     *                            arranque y para el material de la Academia.
     *   plan_compartidos      -> una fila por profesor elegido. Es "esto es para
     *                            ti", que es lo que se pidió.
     *
     * Las dos se leen en la MISMA lista de "compartidos conmigo": a quien lo
     * recibe le da igual por cuál de las dos le llegó.
     */

    /* Quién hay en el equipo docente, para ofrecérselo en el selector. Va por
       RPC y no por un `select` sobre `profiles` porque la RLS no le deja a un
       profesor ver a sus colegas: solo ve a sus alumnos y a sí mismo. */
    async function equipoDocente(sb) {
        const { data, error } = await sb.rpc("equipo_docente");
        if (error) throw error;
        return data || [];
    }

    /* Los planes que OTROS comparten conmigo, con el nombre de quien los
       escribió — que es el dato que dice si vale la pena abrirlo, y que un
       `select` sobre planes_clase no puede traer por lo mismo de arriba. */
    async function planesCompartidosConmigo(sb) {
        const { data, error } = await sb.rpc("planes_compartidos_conmigo");
        if (error) throw error;
        return data || [];
    }

    /* Con quién está compartido ESTE plan (solo lo puede preguntar su dueño). */
    async function compartidosDe(sb, planId) {
        const { data, error } = await sb.from("plan_compartidos")
            .select("profesor_id").eq("plan_id", planId);
        if (error) throw error;
        return (data || []).map((f) => f.profesor_id);
    }

    async function compartirCon(sb, planId, profesorId) {
        // Compartir dos veces con la misma persona no es un error: es el mismo
        // estado. La llave primaria (plan_id, profesor_id) lo garantiza y el
        // upsert lo deja pasar sin ruido.
        const { error } = await sb.from("plan_compartidos")
            .upsert({ plan_id: planId, profesor_id: profesorId },
                    { onConflict: "plan_id,profesor_id" });
        if (error) throw error;
    }

    async function dejarDeCompartir(sb, planId, profesorId) {
        const { error } = await sb.from("plan_compartidos").delete()
            .eq("plan_id", planId).eq("profesor_id", profesorId);
        if (error) throw error;
    }

    const esMio = (plan, profesorId) => plan.profesor_id === profesorId;

    /* Lo que se lee de un renglón en una línea. Es lo único que el profesor va a
       mirar de reojo mientras da la clase, así que dice el tipo y el título y no
       el FEN, que no se lee de un vistazo. */
    function resumen(item) {
        const t = tipoDe(item.tipo);
        if (item.tipo === "leccion") return t.icono + " " + item.titulo + " · lección " + (item.leccion + 1);
        return t.icono + " " + item.titulo;
    }

    return {
        TIPOS, tipoDe, resumen,
        listarPlanes, itemsDe, crearPlan, actualizarPlan, borrarPlan,
        agregarItem, borrarItem, moverItem, duplicarPlan,
        equipoDocente, planesCompartidosConmigo, compartidosDe,
        compartirCon, dejarDeCompartir, esMio,
    };
})();
