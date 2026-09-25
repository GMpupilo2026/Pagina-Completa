/* El código de tablero-academias.html.

   Vivía escrito dentro de la página, en un <script> de 11 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Tablero por academia.
 *
 * Las cifras las da `tablero_academias()`, que NO cuenta nada por su lado: las
 * clases, las horas y el horario salen de `actividad_profesor()` —la misma
 * cuenta del informe mensual y de supervisión— sumada por profesor. Si esta
 * pantalla sumara por su cuenta, el tablero diría una cosa y la supervisión
 * otra del mismo profesor.
 *
 * Quien administra ve todas las academias y el gasto de IA; un supervisor, la
 * suya y ni una columna de IA: la base se la devuelve en null y acá ni se
 * pinta el encabezado.
 */
let mes = null;
let esAdmin = false;
let filas = [];
let pedido = 0;

function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
}

function avisar(texto) {
    const a = document.getElementById("aviso");
    a.textContent = texto;
    a.className = "mb-6 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
}

function num(v) { return Number(v) || 0; }

/* Cada moneda por su lado: sumar colones con dólares no significa nada. */
function dinero(moneda, monto) {
    try {
        return new Intl.NumberFormat("es-CR", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(num(monto));
    } catch (e) { return moneda + " " + Math.round(num(monto)); }
}

function usd(v) { return "US$" + num(v).toFixed(2); }

/* El mes ya terminó: recién ahí un informe que falta es un informe atrasado. */
function mesCerrado() {
    return mes < ActividadProfesor.hoyCR().slice(0, 7) + "-01";
}

function columnas() {
    const c = [
        { clave: "academia", titulo: "Academia" },
        { clave: "clases", titulo: "Clases del mes" },
        { clave: "horario", titulo: "De su horario" },
        { clave: "alumnos", titulo: "Alumnos" },
        { clave: "informes", titulo: "Informes mensuales" },
    ];
    if (esAdmin) c.push({ clave: "ia", titulo: "Mejorar informe (IA)" });
    c.push({ clave: "cobros", titulo: "Cobros pendientes" });
    return c;
}

/* Una celda es un renglón fuerte y, debajo, el detalle. La alerta va ESCRITA
   —«⚠ 2 sin enviar»—, nunca solo con un color. */
function celda(fuerte, detalle, alerta) {
    const td = el("td", "px-4 py-3 align-top");
    td.appendChild(el("span", "block font-semibold text-brand-800 dark:text-white", fuerte));
    if (detalle) td.appendChild(el("span", "block text-xs text-brand-450 dark:text-brand-350", detalle));
    if (alerta) {
        const s = el("span", "block text-xs font-semibold text-red-700 dark:text-red-400 mt-0.5", "⚠ " + alerta);
        s.dataset.alerta = "si";
        td.appendChild(s);
    }
    return td;
}

function celdasDe(f) {
    const tds = {};
    const clases = num(f.clases_en_linea) + num(f.clases_presenciales);
    tds.clases = celda(clases + (clases === 1 ? " clase" : " clases") + " · " + ActividadProfesor.horas(f.minutos_clase),
        num(f.clases_en_linea) + " en línea · " + num(f.clases_presenciales) + (num(f.clases_presenciales) === 1 ? " presencial" : " presenciales"));
    const prog = num(f.clases_programadas), dadas = num(f.clases_programadas_dadas);
    // Sin horario se dice así, no «0 de 0», que se lee como un mes sin trabajo.
    tds.horario = prog
        ? celda(dadas + " de " + prog, "dadas de las programadas", dadas < prog ? (prog - dadas) + " sin dar" : null)
        : celda("Sin horario", "nadie cargó su horario");
    tds.alumnos = celda(num(f.alumnos_activos) + " de " + num(f.alumnos), "entrenaron este mes");
    const pend = num(f.informes_pendientes);
    tds.informes = num(f.profesores)
        ? celda(num(f.informes_enviados) + " de " + num(f.profesores) + " enviados",
            num(f.profesores) + (num(f.profesores) === 1 ? " profesor" : " profesores"),
            pend ? pend + " sin enviar" + (mesCerrado() ? "" : " (el mes no ha terminado)") : null)
        : celda("Sin profesores", "nadie da clase en esta academia");
    if (esAdmin) {
        const tope = f.ia_tope_usd == null ? null : num(f.ia_tope_usd);
        tds.ia = f.ia_modelo === "suma"
            ? celda(usd(f.ia_gasto_usd), "entre todas")
            : !f.ia_modelo
            ? celda(usd(f.ia_gasto_usd), "sin IA configurada")
            : celda(usd(f.ia_gasto_usd), tope != null ? "de " + usd(tope) + " de tope" : "sin tope",
                tope != null && num(f.ia_gasto_usd) >= tope ? "se acabó el presupuesto" : null);
    }
    const cob = Array.isArray(f.cobros_pendientes) ? f.cobros_pendientes : [];
    if (!cob.length) tds.cobros = celda("Al día", "ningún cobro pendiente");
    else {
        const td = el("td", "px-4 py-3 align-top");
        cob.forEach((c) => {
            td.appendChild(el("span", "block font-semibold text-brand-800 dark:text-white", dinero(c.moneda, c.saldo)));
            td.appendChild(el("span", "block text-xs text-brand-450 dark:text-brand-350", num(c.cobros) + (num(c.cobros) === 1 ? " cobro" : " cobros")));
            if (num(c.vencidos)) {
                const s = el("span", "block text-xs font-semibold text-red-700 dark:text-red-400 mb-1", "⚠ " + num(c.vencidos) + (num(c.vencidos) === 1 ? " vencido" : " vencidos"));
                s.dataset.alerta = "si";
                td.appendChild(s);
            }
        });
        tds.cobros = td;
    }
    return tds;
}

function pintar() {
    const caja = document.getElementById("tabla-caja");
    const vacio = document.getElementById("vacio");
    const nota = document.getElementById("nota");
    document.getElementById("resumen").textContent = filas.length
        ? filas.length + (filas.length === 1 ? " academia" : " academias") + " · " + ActividadProfesor.textoMes(mes)
        : "";
    if (!filas.length) {
        caja.hidden = true; nota.hidden = true;
        // Crear academias es de quien administra: al supervisor no se le ofrece.
        vacio.hidden = !esAdmin;
        return;
    }
    vacio.hidden = true;
    caja.hidden = false;
    const cols = columnas();
    document.getElementById("tabla-titulo").textContent = "Las cifras de " + ActividadProfesor.textoMes(mes) + ", una fila por academia";

    const trh = el("tr");
    cols.forEach((c) => { const th = el("th", "px-4 py-3 font-semibold whitespace-nowrap", c.titulo); th.scope = "col"; trh.appendChild(th); });
    document.getElementById("tabla-cabeza").replaceChildren(trh);

    const cuerpo = document.getElementById("tabla-cuerpo");
    cuerpo.replaceChildren();
    filas.forEach((f) => {
        const tr = el("tr");
        tr.dataset.academia = f.academia_id;
        const th = el("th", "px-4 py-3 align-top font-semibold text-brand-800 dark:text-white");
        th.scope = "row";
        const linea = el("span", "flex items-center gap-2");
        if (/^#[0-9a-f]{6}$/i.test(f.color || "")) {
            const m = el("span", "inline-block w-3 h-3 rounded-full shrink-0");
            m.style.backgroundColor = f.color;
            m.setAttribute("aria-hidden", "true");
            linea.appendChild(m);
        }
        // El nombre y el supervisor los escribe una persona: siempre por textContent.
        linea.appendChild(el("span", null, f.nombre || "Sin nombre"));
        th.appendChild(linea);
        th.appendChild(el("span", "block text-xs font-normal text-brand-450 dark:text-brand-350", "Supervisa: " + (f.supervisor || "nadie")));
        tr.appendChild(th);
        const tds = celdasDe(f);
        cols.slice(1).forEach((c) => { tds[c.clave].dataset.col = c.clave; tr.appendChild(tds[c.clave]); });
        cuerpo.appendChild(tr);
    });

    const pie = document.getElementById("tabla-pie");
    pie.replaceChildren();
    if (filas.length > 1) {
        const suma = (k) => filas.reduce((s, f) => s + num(f[k]), 0);
        const monedas = {};
        filas.forEach((f) => (f.cobros_pendientes || []).forEach((c) => {
            const m = monedas[c.moneda] || (monedas[c.moneda] = { moneda: c.moneda, cobros: 0, vencidos: 0, saldo: 0 });
            m.cobros += num(c.cobros); m.vencidos += num(c.vencidos); m.saldo += num(c.saldo);
        }));
        const total = {
            clases_en_linea: suma("clases_en_linea"), clases_presenciales: suma("clases_presenciales"), minutos_clase: suma("minutos_clase"),
            clases_programadas: suma("clases_programadas"), clases_programadas_dadas: suma("clases_programadas_dadas"),
            alumnos: suma("alumnos"), alumnos_activos: suma("alumnos_activos"), profesores: suma("profesores"),
            informes_enviados: suma("informes_enviados"), informes_pendientes: suma("informes_pendientes"),
            ia_gasto_usd: suma("ia_gasto_usd"), ia_modelo: "suma", ia_tope_usd: null,
            cobros_pendientes: Object.values(monedas).sort((a, b) => a.moneda.localeCompare(b.moneda)),
        };
        const tr = el("tr");
        tr.dataset.total = "si";
        const th = el("th", "px-4 py-3 align-top text-brand-800 dark:text-white", "Suma de las filas");
        th.scope = "row";
        tr.appendChild(th);
        const tds = celdasDe(total);
        cols.slice(1).forEach((c) => { tds[c.clave].dataset.col = c.clave; tr.appendChild(tds[c.clave]); });
        pie.appendChild(tr);
    }
    /* Quien está en dos academias cuenta en las dos: la suma de las filas no
       es la de la plataforma, y hay que decirlo o se lee como tal. */
    nota.textContent = "Cada profesor cuenta con todas sus clases del mes; quien está en dos academias aparece en las dos, así que la suma de las filas puede ser mayor que la de la plataforma. Los cobros pendientes son los de hoy, no los del mes elegido.";
    nota.hidden = false;
}

async function elegirMes(valor) {
    mes = valor;
    const mio = ++pedido;
    document.getElementById("resumen").textContent = "Cargando…";
    const { data, error } = await sb.rpc("tablero_academias", { p_periodo: mes });
    if (mio !== pedido) return; // llegó tarde: ya se pidió otro mes
    if (error) {
        // Una tabla que no se pudo leer y una vacía se ven igual: se dice.
        avisar("No se pudo armar el tablero: " + error.message);
        filas = [];
        document.getElementById("tabla-caja").hidden = true;
        document.getElementById("vacio").hidden = true;
        document.getElementById("resumen").textContent = "";
        return;
    }
    document.getElementById("aviso").className = "hidden";
    filas = data || [];
    pintar();
}

async function init() {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) { location.href = "login.html?next=tablero-academias.html"; return; }
    const { data: perfil } = await sb.from("profiles").select("es_supervisor, is_admin").eq("id", session.user.id).maybeSingle();
    document.getElementById("loading").classList.add("hidden");
    if (!perfil || !(perfil.es_supervisor || perfil.is_admin)) {
        document.getElementById("denegado").classList.remove("hidden");
        return;
    }
    esAdmin = !!perfil.is_admin;
    if (!esAdmin) {
        const { count } = await sb.from("academias").select("id", { count: "exact", head: true }).eq("supervisor_id", session.user.id);
        if (!count) {
            document.getElementById("denegado-texto").textContent = "Todavía no supervisas ninguna academia. Quien administra te la asigna desde Academias.";
            document.getElementById("denegado").classList.remove("hidden");
            return;
        }
        document.getElementById("intro").textContent = "Lo que pasó en el mes en tu academia: las clases y sus horas, cuántas del horario se dieron, cuántos alumnos entrenaron, los informes mensuales y los cobros que siguen pendientes.";
    }
    const sel = document.getElementById("mes");
    ActividadProfesor.meses(12).forEach((m) => {
        const o = document.createElement("option");
        o.value = m.valor;
        o.textContent = m.texto.charAt(0).toUpperCase() + m.texto.slice(1);
        sel.appendChild(o);
    });
    const inicial = ActividadProfesor.mesPorOmision();
    sel.value = inicial;
    sel.addEventListener("change", () => elegirMes(sel.value));
    document.getElementById("app").classList.remove("hidden");
    await elegirMes(inicial);
}

init();
    