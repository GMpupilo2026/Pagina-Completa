/* La copia de seguridad de la tablet del árbitro (centroamericano-arbitro.html): un archivo que la tablet arma SOLA, sin internet,
   con lo que todavía no salió y con las mesas de la ronda como las ve. Ver «La copia de seguridad de la tablet» en
   docs/decisiones/juegos-y-torneos.md.

   POR QUÉ: lo pendiente de enviar vive solo dentro del navegador de la tablet (IndexedDB). Si en un corte de luz o de internet la
   tablet se apaga sin batería, se le borran los datos del navegador o hay que cambiarla por otra, esas anotaciones se perderían. Un
   archivo bajado a la tablet (o enviado por Bluetooth, AirDrop o cable a otro aparato) lo evita, y bajarlo no pide internet:
   lo arma esta página en el aparato.

   EL ARCHIVO es de texto (.txt) para que cualquier aparato lo abra y una persona lo lea:
     1. arriba, en palabras: qué quedó pendiente de enviar y cómo están las mesas de la ronda (para pasarlo a mano si hiciera falta);
     2. abajo, tras una línea marcada, los datos exactos para volver a cargarlo en la tablet (JSON).
   NUNCA lleva el token del enlace: solo la «huella» corta y no reversible que ya usa la cola, para que una copia no se cargue con el enlace
   de otro torneo. Lo que se vuelve a cargar solo puede ser de las acciones que la tablet sabe anotar (`PERMITIDAS`): un archivo cambiado
   a mano no puede mandar otra cosa. Cargar una copia no duplica nada: cada anotación lleva su `id` y la base reconoce las repetidas.

   Sin nada de navegador para que herramientas/verificar-centroamericano-respaldo.js lo pruebe con node.
   Escrito en JavaScript sencillo: la tablet puede ser vieja (js/modo-liviano.js). */
(function (raiz) {
    "use strict";

    const FORMATO = "ca-respaldo", VERSION = 1;
    const MARCA = "=== DATOS PARA VOLVER A CARGAR EN LA TABLET (no los cambies) ===";
    // Las acciones que la tablet anota por la cola (las de `escribir(...)` en js/centroamericano-arbitro.js; lo comprueba el verificador).
    const PERMITIDAS = ["planilla", "presencia_todos", "presencia", "tiempo", "presencia_ausentes", "inicio", "guardar", "anotar"];
    const MAX_ITEMS = 500;

    const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
    const dosDig = (n) => (n < 10 ? "0" : "") + n;
    const veces = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);

    /* `datos`: {
         items: la lista de la cola ({id, accion, cuerpo, etiqueta, meta, creado}),
         dueno: la huella del enlace,
         ronda, mesas: [{mesa, blancas, negras, resultado, pendiente?}] («pendiente»: el resultado que aún no salió), categoria, ahora: ms,
       }
       `fmt.fechaHora(ms)` y `fmt.hora(ms)` dan la hora en hora de Costa Rica (la página los pasa; sin ellos, se usa UTC y lo dice). */
    function armar(datos, fmt) {
        const d = datos || {};
        // En el orden en que se anotó (la cola ya los da así; aquí se asegura para que lo escrito y lo que se vuelve a cargar coincidan).
        const items = (Array.isArray(d.items) ? d.items.slice() : []).sort((x, y) => (x.creado || 0) - (y.creado || 0));
        const ahora = d.ahora || Date.now();
        const f = fmt || {};
        const fechaHora = f.fechaHora || ((ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC");
        const hora = f.hora || ((ms) => new Date(ms).toISOString().slice(11, 16) + " UTC");

        const L = [];
        L.push("COPIA DE SEGURIDAD DE LA TABLET DEL ÁRBITRO");
        L.push("Centroamericano 2026" + (d.categoria ? " · " + d.categoria : "") + (d.ronda ? " · Ronda " + d.ronda : ""));
        L.push("Hecha el " + fechaHora(ahora));
        L.push("");
        L.push("== LO QUE TODAVÍA NO SALIÓ DE ESTA TABLET (" + items.length + ") ==");
        if (!items.length) L.push("Nada: todo lo que anotaste ya salió.");
        else {
            L.push("Si vuelve la señal, se manda solo. Si hubiera que pasarlo a mano, esto es lo que falta:");
            items.forEach((x, i) => L.push((i + 1) + ". " + hora(x.creado || ahora) + " — " + String(x.etiqueta || x.accion)));
        }
        L.push("");
        if (Array.isArray(d.mesas) && d.mesas.length) {
            L.push("== TUS MESAS" + (d.ronda ? " DE LA RONDA " + d.ronda : "") + ", COMO LAS VE ESTA TABLET ==");
            for (const m of d.mesas) {
                L.push("Mesa " + m.mesa + ": " + m.blancas + " – " + m.negras + " — " + (m.pendiente ? m.pendiente + " (pendiente de enviar)" : (m.resultado || "sin resultado")));
            }
            L.push("");
        }
        L.push(MARCA);
        L.push(JSON.stringify({ formato: FORMATO, version: VERSION, hecha: new Date(ahora).toISOString(), dueno: String(d.dueno || ""), items: items.map((x) => ({
            id: x.id, accion: x.accion, cuerpo: x.cuerpo, etiqueta: x.etiqueta, meta: x.meta || {}, creado: x.creado,
        })) }));
        return L.join("\n") + "\n";
    }

    // «respaldo-mesas-20261106-2142.txt» (UTC: el nombre solo tiene que ser distinto cada vez).
    function nombreArchivo(ahora) {
        const t = new Date(ahora || Date.now());
        return "respaldo-mesas-" + t.getUTCFullYear() + dosDig(t.getUTCMonth() + 1) + dosDig(t.getUTCDate()) + "-" + dosDig(t.getUTCHours()) + dosDig(t.getUTCMinutes()) + ".txt";
    }

    // Lee lo que armó `armar`. Devuelve { ok: true, items, dueno } o { ok: false, error } (con palabras para el árbitro).
    function leer(texto) {
        const t = String(texto == null ? "" : texto);
        const i = t.indexOf(MARCA);
        if (i < 0) return { ok: false, error: "Este archivo no es una copia de esta tablet: no trae los datos para volver a cargarla." };
        let d;
        try { d = JSON.parse(t.slice(i + MARCA.length).trim()); }
        catch (e) { return { ok: false, error: "La copia está incompleta o cambiada: no se puede leer. Usa otra copia." }; }
        if (!esObjeto(d) || d.formato !== FORMATO) return { ok: false, error: "Este archivo no es una copia de esta tablet." };
        if (d.version !== VERSION) return { ok: false, error: "La copia es de otra versión de la página y no se puede cargar." };
        if (typeof d.dueno !== "string" || !d.dueno) return { ok: false, error: "La copia no dice de qué enlace es." };
        if (!Array.isArray(d.items)) return { ok: false, error: "La copia no trae lista de pendientes." };
        if (d.items.length > MAX_ITEMS) return { ok: false, error: "La copia trae demasiadas anotaciones (" + d.items.length + ")." };
        const items = [];
        for (const x of d.items) {
            const bien = esObjeto(x) && typeof x.id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(x.id) && PERMITIDAS.indexOf(x.accion) >= 0
                && esObjeto(x.cuerpo) && typeof x.etiqueta === "string" && x.etiqueta.length <= 300 && (x.meta === undefined || esObjeto(x.meta));
            if (!bien) return { ok: false, error: "La copia trae una anotación que esta tablet no reconoce. No se cargó nada." };
            items.push({ id: x.id, accion: x.accion, cuerpo: x.cuerpo, etiqueta: x.etiqueta, meta: x.meta || {}, creado: typeof x.creado === "number" ? x.creado : 0 });
        }
        items.sort((a, b) => a.creado - b.creado);
        return { ok: true, items, dueno: d.dueno };
    }

    // Qué dice el aviso tras cargar: cuántas se sumaron y cuántas ya estaban.
    function resumenCarga(sumadas, repetidas) {
        if (!sumadas && !repetidas) return "La copia no traía nada pendiente.";
        if (!sumadas) return "Esas " + veces(repetidas, "anotación", "anotaciones") + " ya estaban en la tablet: no se sumó nada.";
        return "Se cargaron " + veces(sumadas, "anotación", "anotaciones") + (repetidas ? " (" + veces(repetidas, "ya estaba", "ya estaban") + ")" : "") + ". Se mandan solas cuando haya señal.";
    }

    const api = { FORMATO, VERSION, MARCA, PERMITIDAS, armar, leer, nombreArchivo, resumenCarga };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    raiz.CentroamericanoRespaldo = api;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
