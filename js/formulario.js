/* El código de formulario.html.

   Vivía escrito dentro de la página, en un <script> de 10 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* El lado público de un formulario de inscripción: lo abre cualquiera con el
   enlace, sin cuenta.
 *
 * La página no toca las tablas. Lee con public.formulario_publico(slug) —que
 * solo devuelve los formularios abiertos, y ni quién lo creó ni cuándo— y
 * escribe con public.responder_formulario(), que valida del lado del servidor.
 * Es el mismo camino que usa nivel-de-arbitraje.html: lo que el cliente no
 * tiene permiso de hacer directo, lo hace una función que valida.
 *
 * Por eso mismo, lo que se compruebe acá es solo cortesía —decirle a la persona
 * qué le falta antes de mandar—; quien de verdad decide es la función. */
const slug = new URLSearchParams(location.search).get("f") || "";
let campos = [];
let formularioId = "";   // la carpeta de Storage donde van sus imágenes

/* Los selectores de archivos, por pregunta (los arma js/adjuntos.js). */
const selectores = {};
const esAdjunto = (c) => c.tipo === "imagen" || c.tipo === "archivo";

const escapar = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TIPO_INPUT = { texto: "text", numero: "number", fecha: "date", correo: "email", telefono: "tel" };

function pintarCampo(c, i) {
    const caja = document.createElement("div");
    const idHtml = "campo-" + i;
    const marca = c.requerido ? ' <span class="text-red-600 dark:text-red-400" aria-hidden="true">*</span>' : "";
    const clasesEntrada = "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2.5 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

    let control = "";
    if (esAdjunto(c)) {
        const soloImagen = c.tipo === "imagen";
        control = `<input type="file" id="${idHtml}" accept="${Adjuntos.aceptar(soloImagen)}" multiple aria-describedby="${idHtml}-formatos ${idHtml}-estado" class="block w-full text-sm text-brand-700 dark:text-brand-200 file:mr-3 file:bg-accent-500 file:text-brand-900 file:font-semibold file:border-0 file:rounded-lg file:px-4 file:py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded-lg">
            <p id="${idHtml}-formatos" class="text-xs text-brand-450 dark:text-brand-350 mt-1">${Adjuntos.textoFormatos(soloImagen)}</p>
            <p id="${idHtml}-estado" class="text-xs text-brand-600 dark:text-brand-300 mt-1" role="status"></p>
            <ul id="${idHtml}-lista" class="flex flex-wrap gap-3 mt-2" aria-label="Archivos elegidos"></ul>`;
    } else if (c.tipo === "parrafo") {
        control = `<textarea id="${idHtml}" rows="4" maxlength="2000" class="${clasesEntrada}"></textarea>`;
    } else if (c.tipo === "opcion") {
        control = `<select id="${idHtml}" class="${clasesEntrada}">
            <option value="">— Elige una —</option>
            ${(c.opciones || []).map((o) => `<option value="${escapar(o)}">${escapar(o)}</option>`).join("")}
        </select>`;
    } else if (c.tipo === "varias") {
        control = `<fieldset id="${idHtml}" class="space-y-1.5">
            ${(c.opciones || []).map((o, j) => `
                <label class="flex items-center gap-2 text-sm text-brand-700 dark:text-brand-200">
                    <input type="checkbox" value="${escapar(o)}" class="rounded border-brand-300 text-accent-500 focus:ring-accent-400">
                    ${escapar(o)}
                </label>`).join("")}
        </fieldset>`;
    } else if (c.tipo === "si_no") {
        control = `<label class="flex items-center gap-2 text-sm text-brand-700 dark:text-brand-200">
            <input type="checkbox" id="${idHtml}" class="rounded border-brand-300 text-accent-500 focus:ring-accent-400">
            Sí
        </label>`;
    } else {
        control = `<input type="${TIPO_INPUT[c.tipo] || "text"}" id="${idHtml}" maxlength="2000" class="${clasesEntrada}">`;
    }

    // Un <fieldset> se rotula con <legend>, no con <label for>: un label
    // apuntando a un grupo no lo anuncia bien ningún lector de pantalla.
    const rotulo = c.tipo === "varias"
        ? `<legend class="block text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1">${escapar(c.etiqueta)}${marca}</legend>`
        : `<label for="${idHtml}" class="block text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1">${escapar(c.etiqueta)}${marca}</label>`;
    const ayuda = c.ayuda ? `<p class="text-xs text-brand-450 dark:text-brand-350 mb-1.5">${escapar(c.ayuda)}</p>` : "";

    caja.innerHTML = c.tipo === "varias"
        ? control.replace('<fieldset id="' + idHtml + '" class="space-y-1.5">',
                          '<fieldset id="' + idHtml + '" class="space-y-1.5">' + rotulo + ayuda)
        : rotulo + ayuda + control;
    return caja;
}

function leerCampo(c, i) {
    const el = document.getElementById("campo-" + i);
    if (!el) return null;
    if (c.tipo === "varias") {
        return [...el.querySelectorAll("input:checked")].map((x) => x.value);
    }
    if (c.tipo === "si_no") return el.checked;
    if (esAdjunto(c)) return selectores[c.id] && selectores[c.id].cantidad() ? ["pendiente"] : [];
    if (c.tipo === "numero") {
        const v = el.value.trim();
        return v === "" ? null : Number(v);
    }
    return el.value.trim();
}

function vacio(v) {
    return v === null || v === undefined || v === "" || v === false
        || (Array.isArray(v) && !v.length) || (typeof v === "number" && !Number.isFinite(v));
}

document.getElementById("formulario").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("enviar");
    const msg = document.getElementById("msg");

    const respuestas = {};
    for (let i = 0; i < campos.length; i += 1) {
        const c = campos[i];
        const v = leerCampo(c, i);
        if (c.requerido && vacio(v)) {
            msg.textContent = "Falta llenar: " + c.etiqueta;
            msg.className = "text-sm text-red-600 dark:text-red-400";
            const el = document.getElementById("campo-" + i);
            if (el && el.focus) el.focus();
            return;
        }
        if (!vacio(v) && !esAdjunto(c)) respuestas[c.id] = v;
    }
    const acepto = document.getElementById("acepto-datos");
    if (!acepto.checked) {
        msg.textContent = "Falta aceptar el uso de los datos (la casilla de la Política de privacidad).";
        msg.className = "text-sm text-red-600 dark:text-red-400";
        acepto.focus();
        return;
    }

    btn.disabled = true;
    msg.className = "text-sm text-brand-500 dark:text-brand-300";
    try {
        const carpeta = sb.storage.from("formulario-adjuntos");
        for (const c of campos) {
            if (!esAdjunto(c) || !selectores[c.id].cantidad()) continue;
            respuestas[c.id] = await selectores[c.id].subirTodo(carpeta, formularioId, (t) => { msg.textContent = t; });
        }
    } catch (err) {
        msg.textContent = err.message;
        msg.className = "text-sm text-red-600 dark:text-red-400";
        btn.disabled = false;
        return;
    }
    msg.textContent = "Enviando…";
    const { data, error } = await sb.rpc("responder_formulario", {
        p_slug: slug, p_respuestas: respuestas,
        // Qué versión de la política aceptó: la base la guarda con la hora.
        p_version_privacidad: window.LegalVersion.PRIVACIDAD,
    });
    if (error || !data || !data.ok) {
        msg.textContent = (data && data.error) || (error && error.message) || "No se pudo enviar. Vuelve a intentarlo.";
        msg.className = "text-sm text-red-600 dark:text-red-400";
        btn.disabled = false;
        return;
    }
    document.getElementById("formulario").classList.add("hidden");
    document.getElementById("listo").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
});

/* La marca de la academia del formulario: su nombre, su logo y su color, en
   una franja arriba de la tarjeta. El color solo se usa si da 4.5 contra el
   texto blanco (la base ya lo exige al guardarlo; acá se vuelve a mirar por
   si acaso). Sin academia, la tarjeta queda como siempre. */
function pintarMarca(f) {
    if (!f.academia_nombre) return;
    const caja = document.getElementById("marca");
    document.getElementById("marca-nombre").textContent = f.academia_nombre;
    const url = window.MarcaAcademia ? MarcaAcademia.urlDelLogo(f.academia_logo) : "";
    const img = document.getElementById("marca-logo");
    if (url) {
        img.src = url;
        img.hidden = false;
        img.addEventListener("error", () => { img.hidden = true; });
    }
    const c = window.MarcaAcademia ? MarcaAcademia.contrasteConBlanco(f.academia_color) : null;
    if (c != null && c >= 4.5) caja.style.backgroundColor = f.academia_color;
    caja.hidden = false;
}

async function init() {
    const noEsta = () => {
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("no-esta").classList.remove("hidden");
    };
    if (!slug) { noEsta(); return; }

    const { data, error } = await sb.rpc("formulario_publico", { p_slug: slug });
    const f = Array.isArray(data) ? data[0] : data;
    if (error || !f) { noEsta(); return; }

    formularioId = f.id || "";
    document.title = f.titulo + " — " + (f.academia_nombre || "Ajedrez Integral");
    pintarMarca(f);
    document.getElementById("titulo").textContent = f.titulo;
    if (f.grupo) {
        const g = document.getElementById("equipo");
        g.textContent = f.grupo;
        g.classList.remove("hidden");
    }
    if (f.descripcion) {
        const d = document.getElementById("descripcion");
        d.textContent = f.descripcion;
        d.classList.remove("hidden");
    }
    if (f.cierra_el) {
        const c = document.getElementById("cierre");
        c.textContent = "Se puede llenar hasta el " +
            new Date(f.cierra_el).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" }) + ".";
        c.classList.remove("hidden");
    }

    campos = (f.campos || []).filter((c) => c && c.id && c.etiqueta);
    const caja = document.getElementById("campos");
    campos.forEach((c, i) => caja.appendChild(pintarCampo(c, i)));
    campos.forEach((c, i) => {
        if (!esAdjunto(c)) return;
        const id = "campo-" + i;
        selectores[c.id] = Adjuntos.montarSelector(document.getElementById(id),
            document.getElementById(id + "-lista"), document.getElementById(id + "-estado"), {
                soloImagen: c.tipo === "imagen",
                alError: (t) => {
                    const msg = document.getElementById("msg");
                    msg.textContent = "En «" + c.etiqueta + "»: " + t;
                    msg.className = "text-sm text-red-600 dark:text-red-400";
                },
            });
    });

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("formulario").classList.remove("hidden");
}
init();
    