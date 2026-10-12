/* El código de sesion.html.

   La planilla en vivo: al lado del tablero de la clase, la planilla de torneo
   que se llena sola con cada jugada, en algebraica española. Sirve para
   enseñar cómo se anota una partida (art. 8): qué va en cada renglón, cómo se
   escriben la captura, el jaque, el mate, el enroque, la coronación y la
   captura al paso, dónde va la oferta de tablas (=) y cómo se cierra con el
   resultado. Debajo, un cartel dice cómo se lee la última jugada.

   Las jugadas NO se guardan aparte: salen de las de la clase (board.moves() y
   board.startFen, lo mismo que el tablero), así que la planilla nunca dice otra
   cosa que el tablero. Lo único que el profe le agrega va en
   game_state.planilla (null = no se muestra): los nombres de los jugadores, las
   ofertas de tablas (el número de la media jugada) y el resultado. Va en la
   base por lo mismo que la presentación: quien entra tarde o recarga la ve
   igual. Solo el profe la cambia (protect_game_state_teacher_columns) y el
   CHECK game_state_planilla_forma rechaza otra forma. Ver «La planilla en
   vivo» en docs/decisiones/clase-en-vivo.md.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js solo dentro de
   funciones. */

const PlanillaClase = (function () {
    const LETRA = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
    const NOMBRE = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
    const RESULTADOS = ["1-0", "0-1", "½-½"];

    // La jugada como se escribe en la planilla: «Cf3», «Axf7+», «e8=D», «O-O»,
    // «exd6 a.p.» (la captura al paso se marca, como enseña el curso).
    function escrita(mov) {
        return mov.san.replace(/[KQRBN]/g, (l) => LETRA[l]) + (mov.flags.indexOf("e") >= 0 ? " a.p." : "");
    }

    // Cómo se lee, para el cartel: «Alfil (A) captura en f7 (x), jaque (+).»
    function leida(mov, jaque, mate) {
        if (mov.flags.indexOf("k") >= 0) return "Enroque corto: se anota O-O" + (mate ? "#" : jaque ? "+" : "") + ".";
        if (mov.flags.indexOf("q") >= 0) return "Enroque largo: se anota O-O-O" + (mate ? "#" : jaque ? "+" : "") + ".";
        let t = mov.piece === "p" ? "Peón (sin letra)" : NOMBRE[mov.piece][0].toUpperCase() + NOMBRE[mov.piece].slice(1) + " (" + LETRA[mov.piece.toUpperCase()] + ")";
        t += mov.captured ? " captura en " + mov.to + " (x)" : " va a " + mov.to;
        if (mov.flags.indexOf("e") >= 0) t += ", al paso (a.p.)";
        if (mov.promotion) t += " y corona " + NOMBRE[mov.promotion] + " (=" + LETRA[mov.promotion.toUpperCase()] + ")";
        if (mate) t += ", jaque mate (#)";
        else if (jaque) t += ", jaque (+)";
        return t + ".";
    }

    /* Las jugadas de la línea principal, con lo que hace falta para la planilla:
       el número de cada una (sigue el del FEN: una clase que arranca en la
       jugada 30 con negras empieza en «30. … h6»), el color y si fue jaque o
       mate. Una jugada que chess.js no acepta corta la lista: más vale una
       planilla corta que una que dice otra cosa. */
    function jugadas(sans, inicio) {
        let g;
        try { g = inicio ? new Chess(inicio) : new Chess(); } catch (e) { return { lista: [], fin: null }; }
        const partes = (inicio || "").split(" ");
        let numero = parseInt(partes[5], 10) || 1;
        const lista = [];
        for (const san of sans || []) {
            const mov = g.move(san);
            if (!mov) break;
            lista.push({ numero, color: mov.color, texto: escrita(mov), leida: leida(mov, g.in_check(), g.in_checkmate()) });
            if (mov.color === "b") numero++;
        }
        let fin = null;
        if (g.in_checkmate()) fin = g.turn() === "w" ? "0-1" : "1-0";
        else if (g.in_stalemate() || g.insufficient_material()) fin = "½-½";
        return { lista, fin };
    }

    /* Los renglones: [número, blancas, negras], cada jugada con su índice de
       media jugada (1, 2, 3…) para marcar la oferta de tablas. Si la partida
       arranca con negras, el primer renglón lleva «…» en la columna de blancas. */
    function renglones(lista) {
        const filas = [];
        lista.forEach((j, i) => {
            const celda = { texto: j.texto, ply: i + 1 };
            if (j.color === "w" || !filas.length || filas[filas.length - 1].numero !== j.numero) {
                filas.push({ numero: j.numero, blancas: j.color === "w" ? celda : { texto: "…", ply: 0 }, negras: null });
            }
            if (j.color === "b") filas[filas.length - 1].negras = celda;
        });
        return filas;
    }

    function forma(p) {
        if (!p || typeof p !== "object" || Array.isArray(p)) return null;
        const f = {};
        f.blancas = typeof p.blancas === "string" ? p.blancas.slice(0, 60) : "";
        f.negras = typeof p.negras === "string" ? p.negras.slice(0, 60) : "";
        f.tablas = Array.isArray(p.tablas) ? p.tablas.filter((n) => Number.isInteger(n) && n > 0).slice(0, 100) : [];
        f.resultado = RESULTADOS.indexOf(p.resultado) >= 0 ? p.resultado : "";
        return f;
    }

    return { escrita, leida, jugadas, renglones, forma, RESULTADOS };
})();
window.PlanillaClase = PlanillaClase;

let planillaActual = null;
let planillaEnviada = null, planillaEnviadaEn = 0;

/* Pinta lo que dice game_state.planilla. `propia` = lo acaba de cambiar el
   profe en esta página: los ecos de Realtime de cambios anteriores llegan
   después y lo devolverían atrás, así que por unos segundos solo vale lo suyo. */
function pintarPlanilla(p, propia) {
    const caja = document.getElementById("planilla-caja");
    if (!caja) return;
    const nueva = PlanillaClase.forma(p);
    if (!propia && isTeacher && Date.now() - planillaEnviadaEn < 3000 && JSON.stringify(nueva) !== planillaEnviada) return;
    planillaActual = nueva;
    caja.hidden = !nueva;
    document.getElementById("tablero-y-planilla")?.classList.toggle("con-planilla", !!nueva);
    const btn = document.getElementById("planilla-btn");
    if (btn) btn.setAttribute("aria-pressed", nueva ? "true" : "false");
    anunciarALaClase("planilla", nueva ? "abierta" : null,
        "Tu profe abrió la planilla de torneo al lado del tablero: se llena sola con cada jugada.");
    if (!nueva) return;
    // Los nombres: el cuadro del profe solo se rellena si no lo está editando.
    ["blancas", "negras"].forEach((lado) => {
        const ver = document.getElementById("planilla-" + lado);
        ver.textContent = nueva[lado] || (lado === "blancas" ? "Blancas" : "Negras");
        const input = document.getElementById("planilla-" + lado + "-input");
        if (input && document.activeElement !== input) input.value = nueva[lado];
    });
    document.getElementById("planilla-profe").hidden = !isTeacher || modoProyector || modoControl;
    pintarPlanillaJugadas();
}

/* Las jugadas, desde las de la clase. La llama renderMoveList() de sesion.js,
   que corre con cada jugada (propia o que llega por Realtime). */
function pintarPlanillaJugadas() {
    const caja = document.getElementById("planilla-caja");
    if (!caja || caja.hidden || !planillaActual) return;
    const { lista, fin } = PlanillaClase.jugadas(board.moves(), board.startFen);
    const tablas = new Set(planillaActual.tablas);
    const cuerpo = document.getElementById("planilla-jugadas");
    cuerpo.replaceChildren();
    const filas = PlanillaClase.renglones(lista);
    // Como en una planilla de papel, los renglones vacíos también se ven.
    const total = Math.max(12, filas.length + 2);
    const ultima = lista.length;
    // Los renglones van seguidos: el primero es el de la primera jugada (o el
    // del FEN de arranque, si todavía no hay ninguna).
    const primero = filas.length ? filas[0].numero : (parseInt((board.startFen || "").split(" ")[5], 10) || 1);
    for (let i = 0; i < total; i++) {
        const f = filas[i];
        const tr = document.createElement("tr");
        const n = document.createElement("td");
        n.className = "planilla-n";
        n.textContent = primero + i;
        tr.appendChild(n);
        [f && f.blancas, f && f.negras].forEach((c) => {
            const td = document.createElement("td");
            if (c) {
                td.textContent = c.texto + (tablas.has(c.ply) ? " (=)" : "");
                if (c.ply === ultima) td.classList.add("planilla-ultima");
            }
            tr.appendChild(td);
        });
        cuerpo.appendChild(tr);
    }
    const resultado = planillaActual.resultado || fin || "";
    document.getElementById("planilla-resultado").textContent = resultado || " ";
    const cartel = document.getElementById("planilla-cartel");
    const j = lista[lista.length - 1];
    cartel.textContent = j
        ? j.numero + (j.color === "w" ? ". " : "… ") + j.texto + (tablas.has(ultima) ? " (=)" : "") + " — " + j.leida
            + (tablas.has(ultima) ? " Ofreció tablas: se anota (=) junto a su jugada (9.1)." : "")
        : "Cuando se mueva una pieza, la jugada se anota sola en la planilla.";
    // El renglón de la última jugada, a la vista. Se mueve solo la barra de la
    // planilla: scrollIntoView movería también la página, y con cada jugada.
    const marco = cuerpo.closest(".planilla-tabla"), fila = cuerpo.querySelector(".planilla-ultima");
    if (marco && fila) {
        const arriba = fila.offsetTop - marco.clientHeight / 2;
        marco.scrollTop = Math.max(0, arriba);
    }
    document.querySelectorAll("#planilla-resultados button").forEach((b) => {
        b.setAttribute("aria-pressed", b.dataset.resultado === planillaActual.resultado ? "true" : "false");
    });
    const ofrecer = document.getElementById("planilla-tablas-btn");
    if (ofrecer) {
        ofrecer.disabled = !ultima;
        ofrecer.setAttribute("aria-pressed", tablas.has(ultima) ? "true" : "false");
    }
}

async function guardarPlanilla(nueva) {
    if (!isTeacher || !myGameStateId) return;
    const f = PlanillaClase.forma(nueva);
    planillaEnviada = JSON.stringify(f);
    planillaEnviadaEn = Date.now();
    pintarPlanilla(f, true);
    const { error } = await sb.from("game_state").update({ planilla: f }).eq("id", myGameStateId);
    if (error) {
        console.error("No se pudo guardar la planilla:", error);
        setStatus("No se pudo guardar la planilla. Revisa tu conexión e inténtalo otra vez.", true);
    }
}

document.getElementById("planilla-btn")?.addEventListener("click", () => {
    guardarPlanilla(planillaActual ? null : { blancas: "", negras: "", tablas: [], resultado: "" });
});
document.getElementById("planilla-cerrar-btn")?.addEventListener("click", () => guardarPlanilla(null));
["blancas", "negras"].forEach((lado) => {
    document.getElementById("planilla-" + lado + "-input")?.addEventListener("change", (e) => {
        if (planillaActual) guardarPlanilla({ ...planillaActual, [lado]: e.target.value.trim() });
    });
});
document.getElementById("planilla-tablas-btn")?.addEventListener("click", () => {
    if (!planillaActual) return;
    const ultima = board.moves().length;
    if (!ultima) return;
    const tablas = planillaActual.tablas.filter((n) => n !== ultima);
    if (tablas.length === planillaActual.tablas.length) tablas.push(ultima);
    guardarPlanilla({ ...planillaActual, tablas });
});
document.getElementById("planilla-resultados")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-resultado]");
    if (!b || !planillaActual) return;
    // Volver a tocar el mismo lo quita.
    guardarPlanilla({ ...planillaActual, resultado: planillaActual.resultado === b.dataset.resultado ? "" : b.dataset.resultado });
});
document.getElementById("planilla-limpiar-btn")?.addEventListener("click", () => {
    if (planillaActual) guardarPlanilla({ ...planillaActual, tablas: [], resultado: "" });
});
