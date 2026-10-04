/* «Antes y ahora»: lo que el alumno ya no es.
 *
 * «Cómo viene» (js/evolucion-alumno.js) dice si TRABAJA: ejercicios por
 * semana. Esto dice si SABE más, con dos pruebas que no se pueden inflar
 * entrenando lo que ya se sabía:
 *
 * 1. Su fuerza, diagnóstico a diagnóstico: el Elo que mide la prueba
 *    (detalle.medicion: elo ± error) desde la versión 5. Dos resultados se
 *    comparan SOLO si son de la misma versión de la prueba («Un diagnóstico
 *    nuevo ya no se compara con uno viejo»), y la diferencia se dice «de
 *    verdad» solo si pasa el margen de los dos juntos: dentro del margen, la
 *    prueba no distingue.
 * 2. Lo que antes fallaba y ahora le sale: los ejercicios que entraron a una
 *    cola de «Repasar fallados» (js/repaso-fallados.js) por un error o una
 *    pista, y que salieron con tres repasos limpios seguidos (`fuera: true`).
 *    Es un hecho, no un porcentaje: lo falló y después lo resolvió tres veces
 *    sin ayuda, en días distintos.
 *
 * Todo sale de lo que la RLS ya deja leer (training_progress y el espejo
 * training_state, pocas filas por alumno): el alumno lo suyo, el profe sus
 * alumnos. Ver «Antes y ahora» en docs/decisiones/informes.md.
 *
 *   AntesYAhora.montar(sb, contenedor, alumnoId, { propio, raiz }) → cuántas
 *       cosas pintó (0: la página esconde el bloque).
 *   AntesYAhora.fuerzas(filas)   → [{ fecha, version, elo, error, nivel }]
 *   AntesYAhora.veredicto(lista) → { tipo, texto } | null
 *   AntesYAhora.superados(estados) → [{ seccion, id, extra, ultimo, fallos }]
 */
(function () {
    "use strict";

    // Las colas, con el nombre que ve la gente. Las mismas claves de
    // RepasoFallados.CLAVES (la de la clase no: es «vi la respuesta», no un fallo).
    const COLAS = [
        { clave: "entreno_temas_repaso_v1", seccion: "Ejercicios por tema", href: "entreno/temas.html" },
        { clave: "entreno_mates_repaso_v1", seccion: "Mates", href: "entreno/mates.html" },
        { clave: "entreno_tipos_repaso_v1", seccion: "Habilidades", href: "entreno/tipos.html" },
        { clave: "entreno_finales_repaso_v1", seccion: "Finales", href: "entreno/finales.html" },
        { clave: "entreno_visualizacion_repaso_v1", seccion: "Visualización", href: "entreno/visualizacion.html" },
        { clave: "entreno_practicas_repaso_v1", seccion: "Practicar", href: "entreno/practicas.html" },
    ];
    const MOSTRAR = 6;

    function escapar(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function fecha(iso) {
        return window.HoraCR ? HoraCR.fecha(iso, { day: "numeric", month: "short", year: "numeric" }) : String(iso).slice(0, 10);
    }

    /* Los diagnósticos con fuerza medida, del más viejo al más nuevo. Una
       fila sin `medicion.elo` (versiones 1 a 4) no se inventa: no entra. */
    function fuerzas(filas) {
        return (filas || []).map((f) => {
            const d = f.detail || f.detalle || {};
            const m = d.medicion || {};
            if (typeof m.elo !== "number") return null;
            return {
                fecha: f.created_at || d.fecha,
                version: String(d.version || ""),
                elo: Math.round(m.elo),
                error: typeof m.error === "number" ? Math.round(m.error) : null,
                nivel: d.nivel_etiqueta || "",
            };
        }).filter(Boolean).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    }

    /* El primero y el último de la MISMA versión que el último. La diferencia
       es «de verdad» si pasa el margen de los dos juntos (√(e1² + e2²)): con
       ±84 y ±67, menos de 107 puntos la prueba no los distingue. */
    function veredicto(lista, propio) {
        if (!lista || lista.length < 2) return null;
        const ultimo = lista[lista.length - 1];
        const mismos = lista.filter((x) => x.version === ultimo.version);
        if (mismos.length < 2) return { tipo: "otra-version", texto: (propio ? "Tu diagnóstico anterior" : "Su diagnóstico anterior") + " se hizo con otra versión de la prueba, así que no se comparan los números." };
        const primero = mismos[0];
        const dif = ultimo.elo - primero.elo;
        const margen = (primero.error != null && ultimo.error != null)
            ? Math.round(Math.sqrt(primero.error * primero.error + ultimo.error * ultimo.error)) : null;
        const desde = "del " + fecha(primero.fecha) + " al " + fecha(ultimo.fecha);
        if (margen != null && Math.abs(dif) <= margen) {
            return { tipo: "parejo", dif, margen, texto: `De ${primero.elo} a ${ultimo.elo} (${desde}): dentro del margen de la prueba (±${margen}), así que todavía no se puede decir que cambió.` };
        }
        if (dif > 0) return { tipo: "sube", dif, margen, texto: `${propio ? "Subiste" : "Subió"} ${dif} puntos: de ${primero.elo} a ${ultimo.elo} (${desde}).` + (margen != null ? ` Es más que el margen de la prueba (±${margen}): es de verdad.` : "") };
        return { tipo: "baja", dif, margen, texto: `${propio ? "Bajaste" : "Bajó"} ${-dif} puntos: de ${primero.elo} a ${ultimo.elo} (${desde}).` + (margen != null ? ` Es más que el margen de la prueba (±${margen}).` : "") };
    }

    /* Lo que salió de las colas con tres repasos limpios, del más reciente al
       más viejo. `estados` es { clave → texto guardado (lo de localStorage) }. */
    function superados(estados) {
        const salida = [];
        COLAS.forEach((c) => {
            let cola;
            try { cola = JSON.parse((estados || {})[c.clave] || "{}"); } catch (e) { cola = null; }
            if (!cola || typeof cola !== "object" || Array.isArray(cola)) return;
            Object.keys(cola).forEach((id) => {
                const f = cola[id];
                if (!f || f.fuera !== true) return;
                salida.push({
                    seccion: c.seccion, clave: c.clave, href: c.href, id,
                    extra: f.tema || f.category || f.tipo || f._serie || null,
                    ultimo: f.ultimo || null,
                    fallos: Number(f.fallos) || 0,
                });
            });
        });
        return salida.sort((a, b) => String(b.ultimo || "").localeCompare(String(a.ultimo || "")));
    }

    // Qué ejercicio fue, en palabras: el motivo del tema, «Mate en 2», el tipo, el final.
    function nombreDe(s, nombres) {
        const n = nombres || {};
        if (s.clave === "entreno_temas_repaso_v1" && s.extra && n.temas && n.temas[s.extra]) return n.temas[s.extra];
        if (s.clave === "entreno_mates_repaso_v1") {
            const m = /^mate(\d)/.exec(s.extra || s.id);
            if (m) return "Mate en " + m[1];
        }
        if (s.clave === "entreno_tipos_repaso_v1") {
            const tipo = s.extra || String(s.id).split(":")[0];
            const t = window.TiposCatalogo && TiposCatalogo.tipo(tipo);
            if (t) return t.nombre;
        }
        if (s.clave === "entreno_finales_repaso_v1" && n.finales && n.finales[s.id]) return n.finales[s.id];
        return "";
    }

    async function nombres(raiz) {
        const salida = { temas: null, finales: null };
        const leer = (url) => fetch((raiz || "") + url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const [temas, finales] = await Promise.all([leer("entreno/data/temas-motivos.json"), leer("entreno/data/finales.json")]);
        salida.temas = temas;
        if (finales && typeof finales === "object") {
            salida.finales = {};
            Object.values(finales).forEach((lista) => {
                if (Array.isArray(lista)) lista.forEach((f) => { if (f && f.id) salida.finales[f.id] = f.titulo || f.nombre || ""; });
            });
        }
        return salida;
    }

    function fuerzaHTML(lista, v, propio) {
        if (!lista.length) return "";
        const filas = lista.slice(-6).map((x) =>
            `<li class="flex flex-wrap gap-x-3 text-sm"><span class="text-brand-500 dark:text-brand-300 w-28">${escapar(fecha(x.fecha))}</span>`
            + `<span class="font-semibold text-brand-800 dark:text-white">${x.elo}${x.error != null ? ` <span class="font-normal text-brand-500 dark:text-brand-300">± ${x.error}</span>` : ""}</span>`
            + (x.nivel ? `<span class="text-brand-500 dark:text-brand-300">${escapar(x.nivel)}</span>` : "") + "</li>").join("");
        const tono = !v ? "" : v.tipo === "sube" ? "border-green-600" : v.tipo === "baja" ? "border-red-500" : "border-brand-300 dark:border-brand-600";
        const titulo = !v ? "" : v.tipo === "sube" ? "▲ Sube" : v.tipo === "baja" ? "▼ Baja" : v.tipo === "parejo" ? "= Parejo" : "Otra prueba";
        const frase = v ? `<p class="mt-3 border-l-4 ${tono} pl-3 text-sm text-brand-700 dark:text-brand-200"><strong class="font-semibold">${escapar(titulo)}.</strong> ${escapar(v.texto)}</p>` : "";
        const solo = lista.length === 1
            ? `<p class="mt-2 text-xs text-brand-500 dark:text-brand-300">${propio ? "Con un segundo diagnóstico, acá vas a ver si subiste." : "Con un segundo diagnóstico, acá se ve si subió."}</p>` : "";
        return `<h3 class="font-serif font-bold text-brand-800 dark:text-white mb-1">${propio ? "Tu fuerza" : "Su fuerza"}, diagnóstico a diagnóstico</h3>
            <p class="text-xs text-brand-500 dark:text-brand-300 mb-2">En puntos Elo, con el margen de cada prueba.</p>
            <ul class="space-y-1">${filas}</ul>${frase}${solo}`;
    }

    function superadosHTML(lista, nom, propio) {
        if (!lista.length) return "";
        const porSeccion = {};
        lista.forEach((s) => { porSeccion[s.seccion] = (porSeccion[s.seccion] || 0) + 1; });
        const cuentas = Object.keys(porSeccion).map((k) => `${escapar(k)}: ${porSeccion[k]}`).join(" · ");
        const filas = lista.slice(0, MOSTRAR).map((s) => {
            const que = nombreDe(s, nom);
            return `<li class="text-sm text-brand-700 dark:text-brand-200"><span aria-hidden="true">✅ </span>`
                + `<span class="font-semibold">${escapar(s.seccion)}</span>${que ? " · " + escapar(que) : ""}`
                + (s.ultimo ? ` <span class="text-xs text-brand-500 dark:text-brand-300">(${s.fallos > 1 ? (propio ? "lo fallaste " : "lo falló ") + s.fallos + " veces; " : ""}${propio ? "te sale" : "le sale"} desde el ${escapar(fecha(s.ultimo))})</span>` : "")
                + "</li>";
        }).join("");
        const mas = lista.length > MOSTRAR ? `<p class="mt-1 text-xs text-brand-500 dark:text-brand-300">Y ${lista.length - MOSTRAR} más.</p>` : "";
        const n = lista.length;
        return `<h3 class="font-serif font-bold text-brand-800 dark:text-white mb-1">${propio ? "Lo que antes fallabas y ahora te sale" : "Lo que antes fallaba y ahora le sale"}</h3>
            <p class="text-xs text-brand-500 dark:text-brand-300 mb-2">${n} ${n === 1 ? "ejercicio que" : "ejercicios que"} ${propio ? "fallaste o resolviste con pista, y después resolviste" : "falló o resolvió con pista, y después resolvió"} tres veces seguidas sin ayuda, en días distintos. ${cuentas}.</p>
            <ul class="space-y-1">${filas}</ul>${mas}`;
    }

    async function montar(sb, contenedor, alumnoId, opciones) {
        const o = opciones || {};
        const el = typeof contenedor === "string" ? document.getElementById(contenedor) : contenedor;
        if (!el) return 0;
        el.innerHTML = '<p class="text-sm text-brand-500 dark:text-brand-300">Cargando…</p>';
        const [d, e] = await Promise.all([
            sb.from("training_progress").select("created_at, detail")
                .eq("student_id", alumnoId).eq("activity", "diagnostico")
                .order("created_at", { ascending: false }).limit(12),
            sb.from("training_state").select("key, value")
                .eq("student_id", alumnoId).in("key", COLAS.map((c) => c.clave)),
        ]);
        const lista = d.error ? [] : fuerzas(d.data || []);
        const estados = {};
        if (!e.error) (e.data || []).forEach((f) => { estados[f.key] = f.value && typeof f.value.raw === "string" ? f.value.raw : null; });
        const sup = superados(estados);
        if (!lista.length && !sup.length) {
            el.innerHTML = "";
            return 0;
        }
        const nom = sup.length ? await nombres(o.raiz) : {};
        const partes = [fuerzaHTML(lista, veredicto(lista, o.propio), o.propio), superadosHTML(sup, nom, o.propio)].filter(Boolean);
        el.innerHTML = partes.join('<div class="my-4 border-t border-brand-100 dark:border-brand-800"></div>');
        return lista.length + sup.length;
    }

    const api = { COLAS, fuerzas, veredicto, superados, nombreDe, montar };
    if (typeof window !== "undefined") window.AntesYAhora = api;
    if (typeof module !== "undefined") module.exports = api;
})();
