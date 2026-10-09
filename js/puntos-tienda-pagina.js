/* El código de puntos-tienda.html. Mismo patrón que logros-pagina.js: vive
   en js/ y no en un <script> escrito dentro de la página (ver «El código de
   las páginas sale del HTML» en docs/decisiones/sitio-e-infraestructura.md). */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'puntos-tienda.html';

async function unlock() {
    gate.classList.add("hidden");
    app.classList.remove("hidden");
    const { data } = await sb.auth.getSession();
    const yo = data && data.session ? data.session.user.id : null;
    if (!yo || !window.Puntos) {
        document.getElementById("sin-sesion-aviso").classList.remove("hidden");
        return;
    }
    Puntos.montarTienda(document.getElementById("tienda-puntos"), { sb, alumnoId: yo });
    const filas = await Puntos.historial(sb, yo, 30);
    const ul = document.getElementById("historial-puntos");
    if (!filas.length) {
        ul.innerHTML = "";
        const li = document.createElement("li");
        li.textContent = "Todavía no tienes movimientos.";
        ul.appendChild(li);
    } else {
        Puntos.pintarHistorial(ul, filas);
    }
}

// Igual que Logros: exige sesión iniciada en el sitio, porque el saldo y el
// historial son de cada cuenta, no del aparato.
async function requireLoginThenGate() {
    let hasSession = false;
    try {
        const { data } = await sb.auth.getSession();
        hasSession = !!(data && data.session);
    } catch (e) {
        hasSession = false;
    }
    if (!hasSession) {
        gateChecking.textContent = "Necesitas iniciar sesión en el sitio para ver tu tienda de puntos. Redirigiendo a iniciar sesión…";
        window.location.href = "login.html?next=" + encodeURIComponent(NEXT_PATH);
        return;
    }
    gateChecking.classList.add("hidden");
    unlock();
}

requireLoginThenGate();
