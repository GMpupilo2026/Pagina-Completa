/* El código de inscripciones.html.

   Vivía escrito dentro de la página, en un <script> de 17 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Las inscripciones al torneo en línea, para quien administra o coordina.
 *
 * DE DÓNDE SALEN, que es lo raro de esta página: no del Supabase de la
 * Academia sino del OTRO, el de "Base de Colegios", que es donde
 * inscripcion.html las escribe. Y no se leen directo: `public.inscripciones`
 * tiene RLS y ni una sola política, así que desde el navegador no la lee nadie
 * —son cédulas, fechas de nacimiento y teléfonos de menores, y la clave pública
 * de ese proyecto está escrita dentro de inscripcion.html—. Las trae la Edge
 * Function `inscripciones-torneo`, que lee con la service role y antes le
 * pregunta a la Academia si quien llama administra o coordina (le reenvía la
 * sesión y llama a `public.soy_coordinador()`). O sea: el permiso lo decide la
 * misma regla que decide cobros.html, no un `if` de esta página.
 *
 * Por eso acá no hay ningún `sb.from("inscripciones")` y no lo puede haber.
 *
 * El filtro y el orden sí son del navegador: llegan todas de una (son
 * decenas, no miles) y filtrar acá evita un viaje por cada tecla. Lo que NO se
 * hace acá es cortar la lista a mil filas sin avisar — eso lo resuelve la
 * función, que las pide de mil en mil.
 */
const FUNCION = "https://prcfbzvshnusisczlpxl.supabase.co/functions/v1/inscripciones-torneo";

let inscripciones = [];
/* ruta → URL firmada por una hora, que da la Edge Function ya comprobado el
   permiso. El bucket es privado: sin esto no se abre ningún adjunto. */
let firmas = {};
const POR_PAGINA = 50;
let mostradas = POR_PAGINA;

/* El único camino por el que entra la lista. Está en una función suya para que
   se vea de un golpe que no hay otro: ni un `sb.from("inscripciones")` acá ni
   en ninguna parte. */
async function pedirInscripciones(token) {
    const res = await fetch(FUNCION, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: "{}",
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || "No se pudo leer las inscripciones.");
    firmas = cuerpo.firmas || {};
    return cuerpo.inscripciones || [];
}

function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function sinTildes(t) {
    return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function fmtFecha(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}
function nombreCompleto(i) {
    return [i.nombre, i.apellido1, i.apellido2].filter(Boolean).join(" ") || "(sin nombre)";
}

/* Un adjunto se baja por su URL firmada. Si la firma no llegó —o ya venció,
   después de una hora con la página abierta— se dice en su lugar. */
function bajarAdjunto(ruta) {
    const url = firmas[ruta];
    if (!url) return Promise.reject(new Error("sin firma"));
    return fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); });
}

/* ------------------------------------------------------------ los filtros */

// Cada selector se arma con los valores que DE VERDAD hay, no con una lista
// escrita a mano: el día que entre una provincia nueva aparece sola, y una que
// nadie eligió no ocupa lugar.
function llenarSelector(id, etiquetaTodos, valores) {
    const sel = document.getElementById(id);
    const previo = sel.value;
    const unicos = [...new Set(valores.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es"));
    sel.innerHTML = '<option value="">' + etiquetaTodos + "</option>" +
        unicos.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (previo && unicos.includes(previo)) sel.value = previo;
}

function filtradas() {
    const texto = sinTildes(document.getElementById("buscar").value.trim());
    const provincia = document.getElementById("f-provincia").value;
    const grado = document.getElementById("f-grado").value;
    const centro = document.getElementById("f-centro").value;
    return inscripciones.filter((i) => {
        if (provincia && i.provincia !== provincia) return false;
        if (grado && i.grado !== grado) return false;
        if (centro && i.tipo_centro !== centro) return false;
        if (!texto) return true;
        return sinTildes(nombreCompleto(i)).includes(texto)
            || sinTildes(i.cedula).includes(texto)
            || sinTildes(i.centro).includes(texto)
            || sinTildes(i.correo).includes(texto)
            || sinTildes(i.contacto).includes(texto);
    });
}

/* ------------------------------------------------------------ lo que se ve */

function pintarTotales() {
    const caja = document.getElementById("totales");
    caja.innerHTML = "";
    const centros = new Set(inscripciones.map((i) => i.centro).filter(Boolean)).size;
    const provincias = new Set(inscripciones.map((i) => i.provincia).filter(Boolean)).size;
    const edades = inscripciones.map((i) => Number(i.edad)).filter((n) => n > 0);
    const promedio = edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : null;
    [
        ["🏅", inscripciones.length, inscripciones.length === 1 ? "inscripción" : "inscripciones"],
        ["🏫", centros, centros === 1 ? "centro educativo" : "centros educativos"],
        ["📍", provincias, provincias === 1 ? "provincia" : "provincias"],
        ["🎂", promedio == null ? "—" : promedio, "edad promedio"],
    ].forEach(([emoji, valor, etiqueta]) => {
        const d = document.createElement("div");
        d.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 text-center";
        d.innerHTML = '<p class="text-2xl" aria-hidden="true">' + emoji + "</p>"
            + '<p class="text-2xl font-bold text-brand-800 dark:text-white">' + esc(valor) + "</p>"
            + '<p class="text-xs text-brand-450 dark:text-brand-350 mt-0.5">' + esc(etiqueta) + "</p>";
        caja.appendChild(d);
    });
}

// Lo que no cabe en la fila: se despliega debajo, en vez de estirar la tabla a
// quince columnas que nadie puede leer.
function filaDetalle(i) {
    const tr = document.createElement("tr");
    tr.className = "bg-brand-50 dark:bg-brand-950/60";
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "px-3 py-3";
    const campos = [
        ["Cédula", i.cedula],
        ["Fecha de nacimiento", i.fecha_nacimiento ? fmtFecha(i.fecha_nacimiento) : null],
        ["Género", i.genero],
        ["Teléfono", i.contacto],
        ["Correo", i.correo],
        ["Cantón", i.canton],
        ["Tipo de centro", i.tipo_centro],
        ["Dirección regional", i.direccion_regional],
        ["Circuito", i.circuito],
        ["Zona", i.zona],
        ["Modalidad", i.modalidad],
        ["Usuario", i.usuario],
        ["Aceptó el trato de sus datos", i.acepto_datos ? "Sí" : "No"],
        ["Archivos adjuntos", Array.isArray(i.adjuntos) && i.adjuntos.length ? i.adjuntos : null],
    ];
    const dl = document.createElement("dl");
    dl.className = "grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-xs";
    campos.forEach(([etiqueta, valor]) => {
        const fila = document.createElement("div");
        fila.className = "flex gap-2";
        const dt = document.createElement("dt");
        dt.className = "text-brand-450 dark:text-brand-350 shrink-0";
        dt.textContent = etiqueta + ":";
        const dd = document.createElement("dd");
        dd.className = "text-brand-700 dark:text-brand-200 break-words min-w-0";
        if (etiqueta === "Archivos adjuntos" && valor) {
            fila.className = "flex gap-2 sm:col-span-2 lg:col-span-3";
            dd.appendChild(Adjuntos.celda(valor, bajarAdjunto, nombreCompleto(i), ""));
        } else if (etiqueta === "Correo" && valor) {
            const a = document.createElement("a");
            a.href = "mailto:" + valor; a.textContent = valor;
            a.className = "text-accent-700 dark:text-accent-400 hover:underline";
            dd.appendChild(a);
        } else if (etiqueta === "Teléfono" && valor) {
            const a = document.createElement("a");
            a.href = "https://wa.me/" + String(valor).replace(/[^\d]/g, "");
            a.target = "_blank"; a.rel = "noopener"; a.textContent = valor;
            a.className = "text-accent-700 dark:text-accent-400 hover:underline";
            dd.appendChild(a);
        } else {
            dd.textContent = valor == null || valor === "" ? "—" : String(valor);
        }
        fila.append(dt, dd);
        dl.appendChild(fila);
    });
    td.appendChild(dl);
    tr.appendChild(td);
    return tr;
}

function pintar() {
    const cuerpo = document.getElementById("cuerpo");
    const masBtn = document.getElementById("ver-mas");
    cuerpo.innerHTML = "";
    const encontradas = filtradas();
    const visibles = encontradas.slice(0, mostradas);
    const resumen = document.getElementById("resumen");
    const hayFiltro = !!document.getElementById("buscar").value.trim()
        || !!document.getElementById("f-provincia").value
        || !!document.getElementById("f-grado").value
        || !!document.getElementById("f-centro").value;

    if (!visibles.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 7;
        td.className = "py-6 text-center text-brand-450 dark:text-brand-350";
        td.textContent = inscripciones.length
            ? "Ninguna inscripción coincide con el filtro."
            : "Todavía no ha llegado ninguna inscripción.";
        tr.appendChild(td); cuerpo.appendChild(tr);
        resumen.textContent = td.textContent;
        masBtn.hidden = true;
        return;
    }

    visibles.forEach((i) => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-brand-50 dark:border-brand-800/60 align-middle";

        const tdFecha = document.createElement("td");
        tdFecha.className = "py-2 pr-3 text-xs text-brand-450 dark:text-brand-350 whitespace-nowrap";
        tdFecha.textContent = fmtFecha(i.creado_en);

        const tdPersona = document.createElement("td");
        tdPersona.className = "py-2 pr-3";
        const nom = document.createElement("p");
        nom.className = "font-medium text-brand-800 dark:text-white";
        nom.textContent = nombreCompleto(i);
        const ced = document.createElement("p");
        ced.className = "text-xs text-brand-450 dark:text-brand-350";
        ced.textContent = (i.cedula ? "Cédula " + i.cedula : "—")
            + (Array.isArray(i.adjuntos) && i.adjuntos.length ? " · 📎 " + Adjuntos.contar(i.adjuntos) : "");
        tdPersona.append(nom, ced);

        const tdEdad = document.createElement("td");
        tdEdad.className = "py-2 pr-3 text-brand-600 dark:text-brand-300 whitespace-nowrap";
        tdEdad.textContent = i.edad == null ? "—" : String(i.edad);

        const tdCentro = document.createElement("td");
        tdCentro.className = "py-2 pr-3 text-brand-600 dark:text-brand-300";
        tdCentro.textContent = i.centro || "—";

        const tdGrado = document.createElement("td");
        tdGrado.className = "py-2 pr-3 text-brand-600 dark:text-brand-300 whitespace-nowrap";
        tdGrado.textContent = i.grado || "—";

        const tdProv = document.createElement("td");
        tdProv.className = "py-2 pr-3 text-brand-600 dark:text-brand-300 whitespace-nowrap";
        tdProv.textContent = i.provincia || "—";

        const tdVer = document.createElement("td");
        tdVer.className = "py-2 text-right";
        const ver = document.createElement("button");
        ver.type = "button";
        ver.className = "text-xs font-semibold text-accent-700 dark:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
        ver.textContent = "Ver detalle";
        ver.setAttribute("aria-expanded", "false");
        ver.addEventListener("click", () => {
            const abierto = ver.getAttribute("aria-expanded") === "true";
            if (abierto) {
                if (tr.nextSibling && tr.nextSibling.dataset && tr.nextSibling.dataset.detalle) tr.nextSibling.remove();
                ver.setAttribute("aria-expanded", "false");
                ver.textContent = "Ver detalle";
            } else {
                const det = filaDetalle(i);
                det.dataset.detalle = "1";
                tr.after(det);
                ver.setAttribute("aria-expanded", "true");
                ver.textContent = "Ocultar";
            }
        });
        tdVer.appendChild(ver);

        tr.append(tdFecha, tdPersona, tdEdad, tdCentro, tdGrado, tdProv, tdVer);
        cuerpo.appendChild(tr);
    });

    const total = encontradas.length;
    const cuantas = total === 1 ? "1 inscripción" : total + " inscripciones";
    resumen.textContent = visibles.length < total
        ? "Mostrando " + visibles.length + " de " + cuantas + (hayFiltro ? " que coinciden." : ".")
        : cuantas + (hayFiltro ? " coinciden." : " en total.");
    masBtn.hidden = visibles.length >= total;
}

function refiltrar() { mostradas = POR_PAGINA; pintar(); }

/* CSV con punto y coma y BOM: es lo que Excel en español abre de un doble clic
   sin preguntar nada. Con coma, Excel mete la fila entera en la columna A.
   Baja lo que se está viendo (con su filtro puesto), no siempre todo: si se
   filtró por provincia es porque se quiere esa lista. */
const COLUMNAS_CSV = [
    ["Fecha", (i) => fmtFecha(i.creado_en)],
    ["Nombre", (i) => i.nombre],
    ["Primer apellido", (i) => i.apellido1],
    ["Segundo apellido", (i) => i.apellido2],
    ["Cédula", (i) => i.cedula],
    ["Fecha de nacimiento", (i) => i.fecha_nacimiento],
    ["Edad", (i) => i.edad],
    ["Género", (i) => i.genero],
    ["Teléfono", (i) => i.contacto],
    ["Correo", (i) => i.correo],
    ["Centro educativo", (i) => i.centro],
    ["Tipo de centro", (i) => i.tipo_centro],
    ["Grado", (i) => i.grado],
    ["Provincia", (i) => i.provincia],
    ["Cantón", (i) => i.canton],
    ["Dirección regional", (i) => i.direccion_regional],
    ["Circuito", (i) => i.circuito],
    ["Zona", (i) => i.zona],
    ["Modalidad", (i) => i.modalidad],
    ["Usuario", (i) => i.usuario],
    ["Aceptó el trato de sus datos", (i) => (i.acepto_datos ? "Sí" : "No")],
    ["Archivos adjuntos", (i) => Adjuntos.contar(i.adjuntos)],
];

function bajarCsv() {
    const filas = filtradas();
    const celda = (t) => '"' + String(t == null ? "" : t).replace(/"/g, '""') + '"';
    const lineas = [COLUMNAS_CSV.map((c) => celda(c[0])).join(";")];
    filas.forEach((i) => lineas.push(COLUMNAS_CSV.map((c) => celda(c[1](i))).join(";")));
    const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inscripciones-torneo.csv";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------------------------------------- el arranque */

document.getElementById("buscar").addEventListener("input", () => {
    clearTimeout(window.__buscarTimer);
    window.__buscarTimer = setTimeout(refiltrar, 200);
});
["f-provincia", "f-grado", "f-centro"].forEach((id) =>
    document.getElementById(id).addEventListener("change", refiltrar));
document.getElementById("ver-mas").addEventListener("click", () => {
    mostradas += POR_PAGINA;
    pintar();
});
document.getElementById("csv-btn").addEventListener("click", bajarCsv);

async function init() {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) { window.location.href = "login.html?next=inscripciones.html"; return; }

    /* Este es el filtro de PINTAR: se pregunta acá para poder mostrar el aviso
       de siempre en vez de un error feo. Quien de verdad deja pasar o no es la
       Edge Function, que vuelve a preguntar lo mismo con esta misma sesión. */
    const { data: perfil } = await sb.rpc("soy_coordinador");
    document.getElementById("loading").classList.add("hidden");
    if (perfil !== true) { document.getElementById("denegado").classList.remove("hidden"); return; }
    document.getElementById("app").classList.remove("hidden");

    try {
        inscripciones = await pedirInscripciones(session.access_token);
    } catch (err) {
        // Se dice lo que pasó, en vez de dejar una tabla vacía que se lee como
        // "todavía no se ha inscrito nadie".
        document.getElementById("resumen").textContent = err.message;
        document.getElementById("cuerpo").innerHTML =
            '<tr><td colspan="7" class="py-6 text-center text-red-600 dark:text-red-400">' + esc(err.message) + "</td></tr>";
        return;
    }
    llenarSelector("f-provincia", "Todas las provincias", inscripciones.map((i) => i.provincia));
    llenarSelector("f-grado", "Todos los grados", inscripciones.map((i) => i.grado));
    llenarSelector("f-centro", "Todo tipo de centro", inscripciones.map((i) => i.tipo_centro));
    pintarTotales();
    pintar();
}

init();
    