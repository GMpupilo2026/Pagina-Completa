/* «Mi cuaderno»: las posiciones que el alumno guarda, con su nota.
 *
 * La bitácora es del profesor; esto es del alumno. Lo escribe, lo cambia y lo
 * borra solo él (la RLS de public.cuaderno), y su profe lo ve solo si lo
 * marca como compartido. Ver «Mi cuaderno» en
 * docs/decisiones/seguimiento-del-alumno.md.
 *
 *   Cuaderno.guardar({ fen, jugadas, origen, enlace })
 *       Abre la ventana de guardar (título, nota y si lo ve el profe). Una
 *       posición ya guardada se abre con lo que tenía: guardar otra vez la
 *       misma posición cambia la nota, no la duplica (índice único en la base).
 *       Devuelve la fila guardada, o null si se canceló o falló.
 *   Cuaderno.boton({ fen, jugadas, origen, enlace }) → <button>
 *       El botón «📓 Guardar en mi cuaderno», para ponerlo donde haga falta.
 *   Cuaderno.enlaceDeAqui() → la dirección de esta página desde la raíz del
 *       sitio («entreno/temas.html?tema=pin»), que es lo que la base acepta.
 *
 * Necesita `sb` (supabase-client.js) y js/avisos.js.
 */
(function () {
    "use strict";

    const TOPE_NOTA = 2000, TOPE_TITULO = 120;

    function enlaceDeAqui() {
        const ruta = location.pathname.replace(/^\/+/, "") || "index.html";
        const e = ruta + location.search;
        return /^[a-z0-9][a-z0-9/_.-]*\.html([?#][^\s<>"']*)?$/.test(e) && e.length <= 300 ? e : null;
    }

    async function guardar(o) {
        const datos = o || {};
        if (!window.sb || !datos.fen) return null;
        const fen = String(datos.fen).trim();
        let antes = null, yo = null;
        try { const { data } = await sb.auth.getSession(); yo = data && data.session && data.session.user && data.session.user.id; } catch (e) { yo = null; }
        if (!yo) return null;
        try {
            /* Con su id: a un profe que guarda una posición, la RLS también le
               deja ver las compartidas de sus alumnos, y no son suyas. */
            const { data } = await sb.from("cuaderno").select("id, titulo, nota, compartida").eq("alumno_id", yo).eq("fen", fen).limit(1);
            antes = data && data[0] ? data[0] : null;
        } catch (e) { antes = null; }

        const r = await Avisos.formulario({
            titulo: antes ? "Esta posición ya está en tu cuaderno" : "Guardar en mi cuaderno",
            texto: antes ? "Puedes cambiarle el título, la nota o quién la ve." : "Anota qué quieres recordar de esta posición.",
            campos: [
                { nombre: "titulo", etiqueta: "Título", valor: (antes && antes.titulo) || datos.origen || "", max: TOPE_TITULO },
                { nombre: "nota", etiqueta: "Tu nota", tipo: "textarea", valor: (antes && antes.nota) || "", max: TOPE_NOTA,
                  ayuda: "Por ejemplo: «No vi que el caballo también defendía e5»." },
                { nombre: "compartida", etiqueta: "¿Quién la ve?", tipo: "select",
                  valor: antes && antes.compartida ? "si" : "no",
                  opciones: [["no", "Solo yo"], ["si", "Yo y mi profe"]] },
            ],
            aceptar: antes ? "Guardar los cambios" : "Guardar en mi cuaderno",
        });
        if (!r) return null;

        const fila = {
            fen,
            titulo: r.titulo.trim().slice(0, TOPE_TITULO) || null,
            nota: r.nota.trim().slice(0, TOPE_NOTA) || null,
            compartida: r.compartida === "si",
        };
        if (datos.origen) fila.origen = String(datos.origen).slice(0, 160);
        const enlace = datos.enlace === undefined ? enlaceDeAqui() : datos.enlace;
        if (enlace) fila.enlace = enlace;
        if (Array.isArray(datos.jugadas) && datos.jugadas.length) fila.jugadas = datos.jugadas.slice(0, 60).map(String);

        /* Lo que ya estaba se cambia por su id (update), lo nuevo se inserta:
           la base dice que no se repite (alumno, posición). Un upsert pisaría
           la fecha de creación y no dejaría distinguir «guardado» de «cambiado». */
        const pedido = antes
            ? sb.from("cuaderno").update(fila).eq("id", antes.id).select().maybeSingle()
            : sb.from("cuaderno").insert(fila).select().maybeSingle();
        const { data, error } = await pedido;
        if (error) {
            Avisos.avisar(/500 posiciones/.test(error.message || "") ? error.message : "No se pudo guardar en tu cuaderno. Vuelve a intentarlo.", { tipo: "error" });
            return null;
        }
        Avisos.avisar(antes ? "Listo: cambiaste la posición en tu cuaderno." : "Listo: la posición quedó en tu cuaderno.");
        return data || fila;
    }

    function boton(o) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "bctrl";
        b.dataset.cuaderno = "";
        const ic = document.createElement("span");
        ic.setAttribute("aria-hidden", "true");
        ic.textContent = "📓 ";
        b.append(ic, document.createTextNode("Guardar en mi cuaderno"));
        b.addEventListener("click", () => guardar(typeof o === "function" ? o() : o));
        return b;
    }

    window.Cuaderno = { guardar, boton, enlaceDeAqui };
})();
