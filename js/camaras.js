/* El código de camaras.html: varias cámaras de una misma computadora, cada
 * una leyendo su tablero a la vez (para un torneo: una cámara por mesa).
 *
 * Cada cuadrito es camara-tablero.html entera, en un iframe con
 * «?compacto=1&puesto=N»: la misma página de siempre, sin repetir nada de
 * su código. Lo de cada cámara (su dispositivo, su mesa, su partida) lo
 * guarda aparte por puesto; el torneo y su código los comparten, y cuando
 * una cámara elige el torneo, las demás lo toman solas. La página de afuera
 * también tiene la cámara permitida en _headers: sin eso, ningún cuadrito
 * podría usarla.
 *
 * Ver «Varias cámaras en una computadora» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const CANTIDAD = "camaras_cantidad_v1";
    const MAXIMO = 8;

    let cantidad = 2;
    try { cantidad = Math.min(MAXIMO, Math.max(1, Number(localStorage.getItem(CANTIDAD)) || 2)); } catch (e) { /* sin almacenamiento */ }

    /* Agregar o quitar solo toca el último: los cuadritos que ya están no se
     * vuelven a cargar (perderían la cámara abierta y la calibración). */
    function pintar() {
        const caja = $("puestos");
        while (caja.children.length > cantidad) caja.lastElementChild.remove();
        for (let n = caja.children.length + 1; n <= cantidad; n++) {
            const fig = document.createElement("section");
            fig.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-2";
            fig.setAttribute("aria-labelledby", "puesto-titulo-" + n);
            const h = document.createElement("h2");
            h.id = "puesto-titulo-" + n;
            h.className = "font-semibold text-brand-800 dark:text-white px-2 pt-1";
            h.textContent = "Cámara " + n;
            const marco = document.createElement("iframe");
            marco.src = "camara-tablero.html?compacto=1&puesto=" + n;
            marco.title = "Cámara " + n;
            marco.setAttribute("allow", "camera");
            marco.dataset.puesto = String(n);
            marco.className = "w-full h-[1500px] border-0 rounded-xl";
            fig.append(h, marco);
            caja.append(fig);
        }
        $("cantidad").textContent = cantidad === 1 ? "1 cámara" : cantidad + " cámaras";
        $("btn-quitar").disabled = cantidad <= 1;
        $("btn-agregar").disabled = cantidad >= MAXIMO;
        try { localStorage.setItem(CANTIDAD, String(cantidad)); } catch (e) { /* sin almacenamiento */ }
    }

    $("btn-agregar").addEventListener("click", () => { if (cantidad < MAXIMO) { cantidad++; pintar(); } });
    $("btn-quitar").addEventListener("click", () => { if (cantidad > 1) { cantidad--; pintar(); } });

    async function init() {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) { location.href = "login.html?next=camaras.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
        $("loading").classList.add("hidden");
        if (!perfil || !perfil.is_admin) { $("denegado").classList.remove("hidden"); return; }
        $("app").classList.remove("hidden");
        pintar();
    }
    init();
})();
