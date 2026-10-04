/* Los retos de ejercicios entre compañeros: lo que comparten la página de los
 * retos (reto-ejercicios.html) y Ejercicios por tema, donde se juegan
 * (entreno/temas.html?reto=<id>).
 *
 * Un alumno reta a un compañero a los MISMOS 5 ejercicios del banco de
 * Ejercicios por tema. Cada uno los juega cuando puede (una semana), con un
 * intento por ejercicio y sin pistas; gana quien resuelve más y, si empatan,
 * quien tarda menos. Las reglas que no se pueden saltar las pone la base
 * (public.retos_ejercicios y sus respuestas): solo entre compañeros, una
 * respuesta por ejercicio, y lo del rival oculto hasta terminar los propios.
 * Ver «Retos de ejercicios entre compañeros» en docs/decisiones/juegos-y-torneos.md.
 *
 *   RetoEjercicios.elegir(puzzles, nivel, azar) → 5 ids del banco
 *   RetoEjercicios.cargar(sb, retoId)          → { reto, contestadas: Set(idx), yo }
 *   RetoEjercicios.responder(sb, retoId, idx, acierto, ms)
 *   RetoEjercicios.empezar(retoId, idx) / abandonado(retoId, contestadas)
 *   RetoEjercicios.estado(fila, ahora)          → { tipo, texto }   (una fila de mis_retos_de_ejercicios)
 */
(function () {
    "use strict";

    // La dificultad, en el rating de Lichess de cada problema.
    const NIVELES = {
        facil: { nombre: "Fácil", desde: 0, hasta: 1199 },
        medio: { nombre: "Media", desde: 1200, hasta: 1599 },
        dificil: { nombre: "Difícil", desde: 1600, hasta: 2100 },
    };
    const CUANTOS = 5;
    const ID_VALIDO = /^[A-Za-z0-9_-]{1,40}$/;

    /* Cinco distintos al azar entre los del nivel. `azar` es una función que
       devuelve [0, 1): Math.random en la página, una fija en las pruebas. */
    function elegir(puzzles, nivel, azar) {
        const n = NIVELES[nivel];
        if (!n || !puzzles) return [];
        const r = azar || Math.random;
        const candidatos = Object.keys(puzzles).filter((id) => {
            const p = puzzles[id];
            return ID_VALIDO.test(id) && p && p.fen && Array.isArray(p.solution) && p.solution.length
                && typeof p.rating === "number" && p.rating >= n.desde && p.rating <= n.hasta;
        });
        const salida = [];
        while (salida.length < CUANTOS && candidatos.length) {
            const i = Math.floor(r() * candidatos.length);
            salida.push(candidatos.splice(i, 1)[0]);
        }
        return salida.length === CUANTOS ? salida : [];
    }

    async function yoMismo(sb) {
        try { const { data } = await sb.auth.getSession(); return data && data.session ? data.session.user.id : null; }
        catch (e) { return null; }
    }

    async function cargar(sb, retoId) {
        const yo = await yoMismo(sb);
        if (!yo) return null;
        const [r, x] = await Promise.all([
            sb.from("retos_ejercicios").select("id, retador_id, rival_id, nivel, ejercicios, vence_at").eq("id", retoId).maybeSingle(),
            sb.from("retos_ejercicios_respuestas").select("idx, acierto, ms").eq("reto_id", retoId).eq("alumno_id", yo),
        ]);
        if (r.error || !r.data) return null;
        const contestadas = new Map(((x && x.data) || []).map((f) => [f.idx, f]));
        let rival = "";
        const otro = r.data.retador_id === yo ? r.data.rival_id : r.data.retador_id;
        try {
            const { data } = await sb.from("profiles").select("full_name").eq("id", otro).maybeSingle();
            rival = (data && data.full_name) || "";
        } catch (e) { rival = ""; }
        return { reto: r.data, contestadas, yo, rival };
    }

    async function responder(sb, retoId, idx, acierto, ms) {
        const fila = { reto_id: retoId, idx, acierto: !!acierto, ms: Math.max(0, Math.min(3600000, Math.round(ms || 0))) };
        const { error } = await sb.from("retos_ejercicios_respuestas").insert(fila);
        olvidar(retoId, idx);
        // Ya estaba contestado (otra pestaña, otro aparato): vale lo primero.
        if (error && !/duplicate|unique|23505/i.test(String(error.message || error.code || ""))) throw error;
        return !error;
    }

    /* Salir a mitad de un ejercicio no lo deja para después: si no, recargar
       la página sería un segundo intento. Se anota en este aparato cuándo
       empezó, y al volver se da por no resuelto. En otro aparato no se sabe:
       es un juego entre compañeros, no un examen (ver el documento). */
    const clave = (retoId) => "reto_ejercicios_en_curso_v1:" + retoId;
    function empezar(retoId, idx) {
        try { localStorage.setItem(clave(retoId), JSON.stringify({ idx, desde: Date.now() })); } catch (e) { /* sin almacenamiento */ }
    }
    function olvidar(retoId, idx) {
        try {
            const a = JSON.parse(localStorage.getItem(clave(retoId)) || "null");
            if (!a || a.idx === idx) localStorage.removeItem(clave(retoId));
        } catch (e) { /* nada */ }
    }
    function abandonado(retoId, contestadas) {
        try {
            const a = JSON.parse(localStorage.getItem(clave(retoId)) || "null");
            if (!a || typeof a.idx !== "number" || contestadas.has(a.idx)) return null;
            return { idx: a.idx, ms: Math.min(Date.now() - (a.desde || Date.now()), 15 * 60000) };
        } catch (e) { return null; }
    }

    function mmss(ms) {
        const s = Math.round((ms || 0) / 1000);
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }

    /* En qué está un reto, visto por mí. Gana quien resuelve más; empatados,
       quien tardó menos; empatados en todo, empate. */
    function estado(f, ahora) {
        const vencido = new Date(f.vence_at) <= (ahora || new Date());
        const rival = f.otro_nombre || "tu compañero";
        if (f.mias < CUANTOS && !vencido) {
            return { tipo: "jugar", texto: f.mias ? `Te faltan ${CUANTOS - f.mias} de ${CUANTOS}` : "Te toca jugar" };
        }
        const otroTermino = f.del_otro >= CUANTOS;
        if (!otroTermino && !vencido) {
            return { tipo: "esperando", texto: `Resolviste ${f.mis_aciertos} de ${CUANTOS} en ${mmss(f.mi_ms)}. Esperando a ${rival} (${f.del_otro} de ${CUANTOS})` };
        }
        const mios = f.mis_aciertos || 0, suyos = f.sus_aciertos || 0;
        const marcador = `${mios} a ${suyos}`;
        if (mios !== suyos) {
            return mios > suyos
                ? { tipo: "ganaste", texto: `Ganaste ${marcador}` }
                : { tipo: "perdiste", texto: `Ganó ${rival}, ${suyos} a ${mios}` };
        }
        if (f.mias >= CUANTOS && otroTermino && f.mi_ms !== f.su_ms) {
            return f.mi_ms < f.su_ms
                ? { tipo: "ganaste", texto: `Ganaste por tiempo: ${marcador}, ${mmss(f.mi_ms)} contra ${mmss(f.su_ms)}` }
                : { tipo: "perdiste", texto: `Ganó ${rival} por tiempo: ${marcador}, ${mmss(f.su_ms)} contra ${mmss(f.mi_ms)}` };
        }
        return { tipo: "empate", texto: vencido && (f.mias < CUANTOS || !otroTermino) ? `Venció el plazo: ${marcador}` : `Empate: ${marcador}` };
    }

    const api = { NIVELES, CUANTOS, elegir, cargar, responder, empezar, abandonado, estado, mmss };
    if (typeof window !== "undefined") window.RetoEjercicios = api;
    if (typeof module !== "undefined") module.exports = api;
})();
