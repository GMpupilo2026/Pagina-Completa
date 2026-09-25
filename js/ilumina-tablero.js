/* El código de ilumina-tablero.html.

   Vivía escrito dentro de la página, en un <script> de 7 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* ===== Ilumina el Tablero — Juegos =====
 *
 * 24 niveles fijos (js/ilumina-niveles.js), agrupados de 6 en 6 por
 * dificultad. El progreso (niveles resueltos y pistas gastadas) se guarda en
 * localStorage y viaja con la cuenta vía js/progreso-usuario.js — mismo
 * patrón que el resto de Entrenamiento, aunque este juego vive en "Juegos".
 *
 * Pistas: se empieza con 3, y se gana 1 más cada 5 niveles resueltos —
 * guardado como dos contadores que solo CRECEN (ganadas y gastadas) en vez
 * de una sola cuenta que sube y baja, para que sincronizar entre dos
 * aparatos nunca "resucite" una pista ya gastada en el otro.
 */
const SOLVED_KEY = "ilumina_solved";
const HINTS_EARNED_KEY = "ilumina_hints_earned";
const HINTS_USED_KEY = "ilumina_hints_used";
const NIVELES = window.ILUMINA_NIVELES;
const GRUPO_NOMBRE = { 1: "Aprende cada pieza", 2: "Dos piezas, un equipo", 3: "Cuidado con las negras", 4: "El reto final" };

let board = null;
let nivelActualIdx = -1;

function leerResueltos() {
    try { return JSON.parse(localStorage.getItem(SOLVED_KEY) || "{}"); } catch (e) { return {}; }
}
function marcarResuelto(id) {
    const r = leerResueltos();
    if (r[id]) return;
    r[id] = true;
    try { localStorage.setItem(SOLVED_KEY, JSON.stringify(r)); } catch (e) {}
}
function contarResueltos() { return Object.keys(leerResueltos()).length; }

function leerNumero(clave) {
    const v = parseInt(localStorage.getItem(clave) || "0", 10);
    return Number.isFinite(v) ? v : 0;
}
function pistasGanadas() { return Math.max(3 + Math.floor(contarResueltos() / 5), leerNumero(HINTS_EARNED_KEY)); }
function pistasGastadas() { return leerNumero(HINTS_USED_KEY); }
function pistasDisponibles() { return Math.max(0, pistasGanadas() - pistasGastadas()); }
function gastarPista() {
    // Ganadas es la meta (3 + una por cada 5 resueltos) — se guarda también
    // como número explícito para que ProgresoUsuario tenga algo que fundir
    // con el otro aparato (fusión "el más alto de los dos").
    try { localStorage.setItem(HINTS_EARNED_KEY, String(pistasGanadas())); } catch (e) {}
    try { localStorage.setItem(HINTS_USED_KEY, String(pistasGastadas() + 1)); } catch (e) {}
}

function nivelDesbloqueado(idx) {
    // Quien administra ve los niveles todos abiertos (js/acceso-admin.js); para
    // el alumno cada uno sigue abriéndose al resolver el anterior.
    if (window.AccesoAdmin && window.AccesoAdmin.esAdmin()) return true;
    if (idx <= 0) return true;
    const resueltos = leerResueltos();
    return !!resueltos[NIVELES[idx - 1].id];
}

function pintarNiveles() {
    document.getElementById("hints-count").textContent = String(pistasDisponibles());
    const cont = document.getElementById("levels-groups");
    cont.innerHTML = "";
    const resueltos = leerResueltos();
    [1, 2, 3, 4].forEach((g) => {
        const wrap = document.createElement("div");
        wrap.className = "mb-6";
        const h2 = document.createElement("h2");
        h2.className = "font-serif text-base font-bold text-brand-700 dark:text-brand-200 mb-2";
        h2.textContent = "Grupo " + g + " — " + GRUPO_NOMBRE[g];
        wrap.appendChild(h2);
        const grid = document.createElement("div");
        grid.className = "grid grid-cols-3 sm:grid-cols-6 gap-2";
        NIVELES.forEach((nivel, idx) => {
            if (nivel.grupo !== g) return;
            const desbloqueado = nivelDesbloqueado(idx);
            const hecho = !!resueltos[nivel.id];
            const btn = document.createElement("button");
            btn.type = "button";
            btn.disabled = !desbloqueado;
            btn.className = "aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-semibold border-2 transition-colors " +
                (hecho ? "bg-accent-500/15 border-accent-500 text-accent-600 dark:text-accent-400"
                    : desbloqueado ? "bg-white dark:bg-brand-900 border-brand-200 dark:border-brand-700 hover:border-accent-400 text-brand-700 dark:text-brand-200"
                        : "bg-brand-100 dark:bg-brand-900/50 border-transparent text-brand-450 dark:text-brand-350 cursor-not-allowed");
            btn.innerHTML = (hecho ? "✅" : desbloqueado ? "▶️" : "🔒") + "<br>" + (idx + 1);
            btn.setAttribute("aria-label", nivel.titulo + (hecho ? " — resuelto" : desbloqueado ? " — sin resolver" : " — bloqueado"));
            if (desbloqueado) btn.addEventListener("click", () => abrirNivel(idx));
            grid.appendChild(btn);
        });
        wrap.appendChild(grid);
        cont.appendChild(wrap);
    });
}

function abrirNivel(idx) {
    nivelActualIdx = idx;
    const nivel = NIVELES[idx];
    document.getElementById("levels-view").classList.add("hidden");
    document.getElementById("game-view").classList.remove("hidden");
    document.getElementById("level-title").textContent = (idx + 1) + ". " + nivel.titulo;
    document.getElementById("level-desc").textContent = nivel.descripcion;
    document.getElementById("solved-banner").classList.add("hidden");
    actualizarPistasUI();

    const figura = IluminaEngine.parseShape(nivel.arte);
    board.loadLevel({ id: nivel.id, figura, piezas: nivel.piezas, negras: nivel.negras, solucion: nivel.solucion });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function actualizarPistasUI() {
    const disp = pistasDisponibles();
    document.getElementById("hints-count").textContent = String(disp);
    document.getElementById("hint-btn-count").textContent = String(disp);
    document.getElementById("hint-btn").disabled = disp <= 0;
}

function onBoardChange(resultado) {
    const nivel = NIVELES[nivelActualIdx];
    document.getElementById("progress-text").textContent = resultado.objetivosIluminados + " / " + resultado.objetivosTotal + " casillas iluminadas";
    const yaEstabaResuelto = !!leerResueltos()[nivel.id];
    document.getElementById("solved-banner").classList.toggle("hidden", !resultado.resuelto);
    if (resultado.resuelto && !yaEstabaResuelto) {
        marcarResuelto(nivel.id);
        if (window.EntrenoProgress) EntrenoProgress.log("ilumina", { nivel_id: nivel.id });
        actualizarPistasUI(); // resolver un nivel puede desbloquear una pista nueva
    }
}

document.getElementById("hint-btn").addEventListener("click", () => {
    if (pistasDisponibles() <= 0) return;
    const r = board.aplicarPista();
    if (!r) return; // no había ninguna pieza pendiente
    gastarPista();
    actualizarPistasUI();
});

document.getElementById("back-to-levels").addEventListener("click", () => {
    document.getElementById("game-view").classList.add("hidden");
    document.getElementById("levels-view").classList.remove("hidden");
    pintarNiveles();
});

document.getElementById("next-level-btn").addEventListener("click", () => {
    const siguiente = nivelActualIdx + 1;
    if (siguiente < NIVELES.length && nivelDesbloqueado(siguiente)) abrirNivel(siguiente);
    else { document.getElementById("game-view").classList.add("hidden"); document.getElementById("levels-view").classList.remove("hidden"); pintarNiveles(); }
});

async function init() {
    let sesion = null;
    try {
        const { data } = await sb.auth.getSession();
        sesion = data && data.session;
    } catch (e) { sesion = null; }
    if (!sesion) {
        document.getElementById("loading").textContent = "Necesitas iniciar sesión para jugar. Redirigiendo…";
        window.location.href = "login.html?next=" + encodeURIComponent("ilumina-tablero.html");
        return;
    }
    await ProgresoUsuario.init();
    if (window.EntrenoProgress) await EntrenoProgress.init();
    if (window.AccesoAdmin) await window.AccesoAdmin.init();

    board = new IluminaBoard(document.getElementById("board"), document.getElementById("tray"), { onChange: onBoardChange });
    pintarNiveles();

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
}
init();
    