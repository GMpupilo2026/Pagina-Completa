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
    const CAMPOS_PLAN = "id, profesor_id, titulo, notas, created_at, updated_at";
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
    };
})();
