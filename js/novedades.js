/* El código de novedades.html.

   Vivía escrito dentro de la página, en un <script> de 6 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Actualizaciones de la plataforma: todo lo que entró a `main` desde el
 * primer commit.
 *
 * La lista la escribe herramientas/novedades-generar.js leyendo la historia
 * de git (data/novedades.json). Esta página no la arma ni la corrige: si una
 * bitácora se escribiera aparte, la primera tanda que se olvidara de anotarse
 * la dejaría mintiendo, y nadie se enteraría.
 *
 * Es solo de quien administra. Como todo filtro del sitio, decide qué se
 * pinta: por eso el archivo trae solo los títulos, nunca el cuerpo de cada
 * cambio.
 */
const REPO = "https://github.com/GMpupilo2026/Pagina-Completa";
let cambios = [];
const abiertos = new Set();

function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
}

/* Sin tildes y en minúscula: «accion» tiene que encontrar «acción». */
function plano(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* La fecha del commit trae su propio huso; el día se cuenta en Costa Rica,
 * como el resto del sitio. */
function diaCR(iso) {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}
function diaLargo(dia) {
    const t = new Date(dia + "T12:00:00-06:00").toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
    return t.charAt(0).toUpperCase() + t.slice(1);
}
function hora(iso) {
    return new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Costa_Rica" });
}
function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

function tarjeta(numero, texto) {
    const c = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4");
    c.append(el("p", "text-2xl font-bold text-brand-800 dark:text-white", numero), el("p", "text-xs text-brand-450 dark:text-brand-350 mt-0.5", texto));
    return c;
}

function pintarResumen() {
    const dias = new Set(cambios.map((c) => diaCR(c.fecha)));
    const primero = cambios[cambios.length - 1], ultimo = cambios[0];
    const caja = document.getElementById("resumen");
    caja.innerHTML = "";
    caja.append(
        tarjeta(String(cambios.length), "cambios en total"),
        tarjeta(String(dias.size), "días con cambios"),
        tarjeta(new Date(primero.fecha).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" }), "el primero · el último fue el " + new Date(ultimo.fecha).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }))
    );
}

function pintarLista() {
    const q = plano(document.getElementById("buscar").value.trim());
    const visibles = q ? cambios.filter((c) => plano(c.titulo).includes(q) || (c.pr && ("#" + c.pr) === q)) : cambios;
    document.getElementById("conteo").textContent = q
        ? (visibles.length ? "Coinciden " + plural(visibles.length, "cambio", "cambios") + " de " + cambios.length + "." : "Ningún cambio coincide con esa búsqueda.")
        : "Mostrando los " + cambios.length + " cambios, agrupados por día.";

    const porDia = new Map();
    visibles.forEach((c) => {
        const d = diaCR(c.fecha);
        if (!porDia.has(d)) porDia.set(d, []);
        porDia.get(d).push(c);
    });

    const lista = document.getElementById("lista");
    lista.innerHTML = "";
    let i = 0;
    porDia.forEach((items, dia) => {
        const det = el("details", "group bg-white dark:bg-brand-900 rounded-2xl shadow-md");
        /* Buscando se abre todo lo que coincide; sin buscar, el día más nuevo
         * y los que se hayan abierto a mano (repintar no los cierra). */
        det.open = q ? true : (abiertos.size ? abiertos.has(dia) : i === 0);
        det.addEventListener("toggle", () => { if (!q) { det.open ? abiertos.add(dia) : abiertos.delete(dia); } });
        const sum = el("summary", "cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        const h = el("h2", "inline font-semibold text-brand-800 dark:text-white", diaLargo(dia));
        const n = el("span", "text-xs text-brand-450 dark:text-brand-350 shrink-0", plural(items.length, "cambio", "cambios"));
        sum.append(h, n);
        const ul = el("ul", "divide-y divide-brand-100 dark:divide-brand-800 border-t border-brand-100 dark:border-brand-800");
        items.forEach((c) => {
            const li = el("li", "px-4 py-2.5 flex items-start gap-3 text-sm");
            li.append(el("span", "text-xs tabular-nums text-brand-450 dark:text-brand-350 pt-0.5 shrink-0 w-12", hora(c.fecha)));
            li.append(el("span", "flex-1 min-w-0 text-brand-700 dark:text-brand-100", c.titulo));
            if (c.pr) {
                const a = el("a", "text-xs font-semibold text-accent-700 dark:text-accent-400 hover:underline shrink-0 pt-0.5", "#" + c.pr);
                a.href = REPO + "/pull/" + c.pr;
                a.target = "_blank";
                a.rel = "noopener";
                a.setAttribute("aria-label", "Cambio número " + c.pr + " en GitHub (se abre en otra pestaña)");
                li.append(a);
            }
            ul.append(li);
        });
        det.append(sum, ul);
        lista.append(det);
        i++;
    });
}

async function init() {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) { location.href = "login.html?next=novedades.html"; return; }
    const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
    document.getElementById("loading").classList.add("hidden");
    if (!perfil || !perfil.is_admin) {
        document.getElementById("denegado").classList.remove("hidden");
        return;
    }
    document.getElementById("app").classList.remove("hidden");
    try {
        const r = await fetch("data/novedades.json", { cache: "no-cache" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        cambios = (await r.json()).cambios || [];
        if (!cambios.length) throw new Error("vacía");
    } catch (e) {
        const a = document.getElementById("aviso");
        a.textContent = "No se pudo leer la lista de actualizaciones. Vuelve a intentarlo en un momento.";
        a.className = "mb-6 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
        return;
    }
    pintarResumen();
    pintarLista();
    document.getElementById("buscar").addEventListener("input", pintarLista);
}

init();
    