/* El código de informe-mensual.html.

   Vivía escrito dentro de la página, en un <script> de 10 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Informe mensual — lo que cada profesor le cuenta a su supervisión.
 *
 * Nada de esto se escribe directo en la tabla: `informes_profesor` no tiene
 * ninguna política de escritura. Guarda `guardar_informe_mensual()`, que es la
 * que decide lo que no puede quedar en manos de la pantalla:
 *   · un informe ENVIADO ya no se cambia (es lo que la supervisión leyó);
 *   · los números que viajan con él son una foto tomada al enviar, de la misma
 *     `actividad_profesor()` que se pinta acá — no los que diga el navegador;
 *   · no se informa de un mes que todavía no empieza.
 */
const CAMPOS_TEXTO = ["resumen", "logros", "dificultades", "proximo"];
let session = null;
let informes = [];          // los propios, de todos los meses
let mes = null;             // "AAAA-MM-01"
let confirmandoEnvio = false;

/* Los mensajes salen por js/avisos.js, como en todo el sitio: arriba, se
   ven aunque uno haya bajado en la página, y los de error no se van solos
   (ver «Los avisos son de la página, no del navegador»). */
function avisar(texto, malo) { Avisos.avisar(texto, { tipo: malo ? "error" : "ok" }); }

function informeDelMes() { return informes.find((i) => i.periodo === mes) || null; }

async function cargarInformes() {
    const { data, error } = await sb.from("informes_profesor")
        .select("id, periodo, resumen, logros, dificultades, proximo_mes, datos, estado, enviado_at, leido_at, comentario, comentario_at")
        .eq("profesor_id", session.user.id)
        .order("periodo", { ascending: false });
    // Una lista que no se pudo leer y una lista vacía se ven igual: se dice.
    if (error) { avisar("No se pudieron cargar tus informes: " + error.message, true); return; }
    informes = data || [];
}

async function pintarNumeros() {
    const caja = document.getElementById("numeros");
    const sub = document.getElementById("numeros-sub");
    const inf = informeDelMes();
    caja.innerHTML = "";
    if (inf && inf.estado === "enviado" && inf.datos) {
        // Enviado: se enseña lo que se mandó, no lo de hoy. Si después se
        // corrige una clase, la supervisión sigue leyendo la foto de aquel día.
        sub.textContent = "Los números que se enviaron con el informe, tal como estaban el " + ActividadProfesor.fecha(inf.enviado_at) + ".";
        caja.appendChild(ActividadProfesor.tarjetas(inf.datos));
        return;
    }
    sub.textContent = "Salen solos de lo que pasó en la plataforma en " + ActividadProfesor.textoMes(mes) + ". Van con el informe tal como estén el día que lo envíes.";
    const { data, error } = await sb.rpc("actividad_profesor", { p_profesor: session.user.id, p_periodo: mes });
    if (error) { sub.textContent = "No se pudieron contar tus números: " + error.message; return; }
    caja.appendChild(ActividadProfesor.tarjetas((data && data[0]) || null));
}

/* Cada clase y cada estudiante del mes, en línea y presencial juntos. Igual
   que los números: si ya se envió, la foto que viajó; si no, el de hoy. */
async function pintarDetalle() {
    const caja = document.getElementById("detalle");
    const sub = document.getElementById("detalle-sub");
    const inf = informeDelMes();
    const enviado = !!(inf && inf.estado === "enviado");
    caja.replaceChildren();
    sub.textContent = enviado
        ? "Clase por clase y estudiante por estudiante, tal como iban con el informe."
        : "Clase por clase y estudiante por estudiante. Va con el informe tal como esté el día que lo envíes.";
    const { data, error } = enviado
        ? await sb.rpc("detalle_informe_mensual", { p_informe: inf.id })
        : await sb.rpc("detalle_mensual_profesor", { p_profesor: session.user.id, p_periodo: mes });
    if (error) { sub.textContent = "No se pudo armar el detalle del mes: " + error.message; return; }
    DetalleMensual.pintar(caja, data, { archivo: "mi-informe" });
}

function pintarFormulario() {
    const inf = informeDelMes();
    const enviado = !!(inf && inf.estado === "enviado");
    const valores = { resumen: inf ? inf.resumen : "", logros: inf ? inf.logros : "",
                      dificultades: inf ? inf.dificultades : "", proximo: inf ? inf.proximo_mes : "" };
    CAMPOS_TEXTO.forEach((c) => {
        const t = document.getElementById(c);
        t.value = valores[c] || "";
        // readOnly y NO disabled: un campo desactivado sale del recorrido del
        // teclado y quien usa lector de pantalla no se enteraría de lo que mandó.
        t.readOnly = enviado;
    });
    document.getElementById("botones").hidden = enviado;
    confirmandoEnvio = false;
    document.getElementById("enviar").textContent = "Enviar a supervisión";

    const estado = document.getElementById("estado");
    if (enviado) {
        estado.textContent = "✅ Enviado el " + ActividadProfesor.fecha(inf.enviado_at) +
            (inf.leido_at ? " · tu supervisión ya lo leyó" : " · todavía sin leer");
    } else if (inf) {
        estado.textContent = "📝 Borrador guardado: todavía no lo ve nadie.";
    } else {
        estado.textContent = "Todavía no has escrito nada de este mes.";
    }

    const caja = document.getElementById("comentario-caja");
    if (enviado && inf.comentario) {
        document.getElementById("comentario").textContent = inf.comentario;
        caja.hidden = false;
    } else {
        caja.hidden = true;
    }
}

function pintarHistorial() {
    const ul = document.getElementById("historial");
    ul.innerHTML = "";
    if (!informes.length) {
        const li = document.createElement("li");
        li.className = "text-sm text-brand-450 dark:text-brand-350";
        li.textContent = "Todavía no has enviado ningún informe.";
        ul.appendChild(li);
        return;
    }
    informes.forEach((i) => {
        const li = document.createElement("li");
        li.className = "bg-white dark:bg-brand-900 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-2";
        const nombre = document.createElement("button");
        nombre.type = "button";
        nombre.className = "font-semibold text-brand-800 dark:text-white hover:text-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
        nombre.textContent = ActividadProfesor.textoMes(i.periodo);
        nombre.addEventListener("click", () => elegirMes(i.periodo));
        const est = document.createElement("span");
        est.className = "text-xs text-brand-500 dark:text-brand-300";
        est.textContent = i.estado !== "enviado" ? "Borrador"
            : i.comentario ? "Enviado · con comentario"
            : i.leido_at ? "Enviado · leído" : "Enviado · sin leer";
        li.append(nombre, est);
        ul.appendChild(li);
    });
}

async function elegirMes(valor) {
    mes = valor;
    document.getElementById("mes").value = valor;
    pintarFormulario();
    await Promise.all([pintarNumeros(), pintarDetalle()]);
}

async function guardar(enviar) {
    const b = {};
    CAMPOS_TEXTO.forEach((c) => { b[c] = document.getElementById(c).value.trim(); });
    if (enviar && b.resumen.length < 20) {
        avisar("Escribe un resumen de lo que hiciste en el mes (unas pocas líneas) antes de enviarlo.", true);
        document.getElementById("resumen").focus();
        return;
    }
    const { error } = await sb.rpc("guardar_informe_mensual", {
        p_periodo: mes, p_resumen: b.resumen, p_logros: b.logros,
        p_dificultades: b.dificultades, p_proximo: b.proximo, p_enviar: !!enviar,
    });
    // El mensaje de la base es el que dice qué arreglar («ya se envió»): se
    // enseña tal cual en vez de un «no se pudo» a secas.
    if (error) { avisar(error.message, true); return; }
    await cargarInformes();
    pintarFormulario();
    pintarHistorial();
    await Promise.all([pintarNumeros(), pintarDetalle()]);
    avisar(enviar
        ? "✅ Informe de " + ActividadProfesor.textoMes(mes) + " enviado a tu supervisión."
        : "Borrador guardado. Todavía no lo ve nadie: cuando esté listo, apreta «Enviar a supervisión».");
}

async function pintarDestino() {
    const p = document.getElementById("destino");
    const { data, error } = await sb.rpc("mis_supervisores");
    if (error) { p.textContent = ""; return; }
    const nombres = (data || []).map((s) => s.nombre).filter(Boolean);
    p.textContent = nombres.length
        ? "Lo recibe: " + nombres.join(", ") + "."
        : "Todavía no tienes una supervisora o un supervisor asignado: tus informes los lee quien administra.";
}

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { location.href = "login.html?next=informe-mensual.html"; return; }
    const { data: perfil } = await sb.from("profiles").select("role, is_admin").eq("id", session.user.id).maybeSingle();
    document.getElementById("loading").classList.add("hidden");
    if (!perfil || !(perfil.role === "profesor" || perfil.is_admin)) {
        document.getElementById("denegado").classList.remove("hidden");
        return;
    }
    const sel = document.getElementById("mes");
    ActividadProfesor.meses(12).forEach((m) => {
        const o = document.createElement("option");
        o.value = m.valor;
        o.textContent = m.texto.charAt(0).toUpperCase() + m.texto.slice(1);
        sel.appendChild(o);
    });
    sel.addEventListener("change", () => elegirMes(sel.value));
    document.getElementById("guardar").addEventListener("click", () => guardar(false));
    /* Enviar pide dos toques en el propio botón, no un diálogo del navegador:
       después de enviado no se puede cambiar, y esto se toca desde el celular. */
    document.getElementById("enviar").addEventListener("click", () => {
        const b = document.getElementById("enviar");
        if (!confirmandoEnvio) {
            confirmandoEnvio = true;
            b.textContent = "Sí, enviarlo — después ya no se puede cambiar";
            return;
        }
        confirmandoEnvio = false;
        b.textContent = "Enviar a supervisión";
        guardar(true);
    });

    document.getElementById("app").classList.remove("hidden");
    // «Mejorar informe»: solo aparece si la academia tiene IA y le queda presupuesto.
    MejorarInforme.montar({ sb, campo: document.getElementById("resumen"), tipo: "informe_mensual" });
    await Promise.all([cargarInformes(), pintarDestino()]);
    pintarHistorial();
    await elegirMes(ActividadProfesor.mesPorOmision());
}

init();
    