/* La cola de lo que no pudo salir de la tablet del árbitro (centroamericano-arbitro.html). Ver «La tablet del
   árbitro no pierde nada cuando falla la señal» en docs/decisiones/juegos-y-torneos.md.

   POR QUÉ: en el torneo hay 15 a 20 tablets (iPad o Android) en una sala con mucha gente: el wifi se cae, el
   servidor tarda en arrancar, un pedido se queda a medias. Si una anotación no llega, no puede perderse ni
   quedar a medias: se guarda EN LA TABLET (IndexedDB) y se manda sola cuando vuelve la señal, en el orden
   en que se hizo. Reenviar no duplica nada: cada anotación lleva su `id` (lo reconoce la base), y guardar
   un resultado, marcar presencia y subir la foto son idempotentes por su forma.

   QUÉ NO GUARDA: nunca el token del enlace. Cada pendiente se marca con una «huella» del enlace (un hash
   corto, no reversible) para que no se mande con el enlace de otro torneo. Lo que se guarda son las cosas
   que el árbitro anotó (mesa, resultado, foto…), y la última lectura de sus mesas para poder abrir la
   página sin señal.

   Si el aparato no deja usar IndexedDB (navegación privada), se usa la memoria y se avisa antes de cerrar
   la página con algo sin enviar. Lo prueba verificar-centroamericano-cola.js. */
(function (raiz) {
    "use strict";

    const BD = "centroamericano-cola", ALMACEN = "pendientes";
    // Qué errores son de la red (se reintentan y, si no hay caso, quedan en la cola) y cuáles son un «no»
    // de verdad de la función (enlace vencido, mesa fuera del rango…: no se reintentan).
    const HTTP_DE_RED = [0, 408, 425, 429, 500, 502, 503, 504, 520, 522, 524, 546];
    const esDeRed = (e) => !e || e.red === true || e.http == null || HTTP_DE_RED.includes(e.http);

    function uuid() {
        try { if (raiz.crypto && raiz.crypto.randomUUID) return raiz.crypto.randomUUID(); } catch (e) { /* Safari viejo */ }
        const b = new Uint8Array(16);
        try { raiz.crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
        return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
    }

    // Una huella corta y no reversible del enlace.
    async function huella(texto) {
        try {
            const d = await raiz.crypto.subtle.digest("SHA-256", new TextEncoder().encode("ca-cola|" + texto));
            return [...new Uint8Array(d)].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
        } catch (e) {
            let h = 5381;
            for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
            return "h" + h.toString(16);
        }
    }

    // ------------------------------------------------------------- el almacén (IndexedDB, o la memoria)

    function abrirBD() {
        return new Promise((ok) => {
            try {
                const idb = raiz.indexedDB;
                if (!idb) { ok(null); return; }
                const pedido = idb.open(BD, 1);
                pedido.onupgradeneeded = () => { pedido.result.createObjectStore(ALMACEN, { keyPath: "id" }); };
                pedido.onsuccess = () => ok(pedido.result);
                pedido.onerror = () => ok(null);
                pedido.onblocked = () => ok(null);
            } catch (e) { ok(null); }
        });
    }
    const pedir = (req) => new Promise((ok, mal) => { req.onsuccess = () => ok(req.result); req.onerror = () => mal(req.error); });

    function crearAlmacen(bd) {
        const memoria = new Map();
        const usaMemoria = !bd;
        const tx = (modo) => bd.transaction(ALMACEN, modo).objectStore(ALMACEN);
        return {
            usaMemoria,
            async todos() { if (usaMemoria) return [...memoria.values()]; return await pedir(tx("readonly").getAll()); },
            async poner(x) { if (usaMemoria) { memoria.set(x.id, x); return; } await pedir(tx("readwrite").put(x)); },
            async quitar(id) { if (usaMemoria) { memoria.delete(id); return; } await pedir(tx("readwrite").delete(id)); },
        };
    }

    // ------------------------------------------------------------- la cola

    /* opc.dueno: la huella del enlace.
       opc.enviar(accion, cuerpo): manda UN pedido (con sus reintentos); lanza un Error con `http` o `red`.
       opc.alCambiar(lista), opc.alEnviado(item, respuesta), opc.alRechazado(item, error). */
    async function crear(opc) {
        const almacen = crearAlmacen(await abrirBD());
        let lista = [];
        let vaciando = false;
        let temporizador = null;
        const aviso = () => { try { if (opc.alCambiar) opc.alCambiar(lista.slice()); } catch (e) { /* la pantalla no frena la cola */ } };

        async function cargar() {
            const todos = await almacen.todos();
            lista = todos.filter((x) => x.dueno === opc.dueno).sort((a, b) => a.creado - b.creado);
            aviso();
            return lista.slice();
        }

        // `item`: { id?, accion, cuerpo, etiqueta, meta }. El id es también el id de la anotación en la base.
        async function agregar(item) {
            const x = { id: item.id || uuid(), dueno: opc.dueno, accion: item.accion, cuerpo: item.cuerpo, etiqueta: item.etiqueta || item.accion, meta: item.meta || {}, creado: Date.now(), intentos: 0 };
            lista.push(x);
            try { await almacen.poner(x); } catch (e) { /* queda al menos en la memoria de esta página */ }
            aviso();
            return x;
        }

        // Manda lo pendiente en orden. Se detiene en el primer fallo de red: lo demás espera su turno.
        async function vaciar() {
            if (vaciando || !lista.length) return { enviados: 0, rechazados: 0, quedan: lista.length };
            vaciando = true;
            let enviados = 0, rechazados = 0;
            try {
                while (lista.length) {
                    const x = lista[0];
                    try {
                        const r = await opc.enviar(x.accion, x.cuerpo);
                        lista.shift();
                        try { await almacen.quitar(x.id); } catch (e) { /* si no se pudo quitar, lo manda otra vez: es idempotente */ }
                        enviados++;
                        aviso();
                        try { if (opc.alEnviado) opc.alEnviado(x, r); } catch (e) { /* idem */ }
                    } catch (e) {
                        if (esDeRed(e)) { x.intentos++; try { await almacen.poner(x); } catch (e2) { /* idem */ } break; }
                        // Un «no» de verdad de la función: reintentar no cambia nada.
                        lista.shift();
                        try { await almacen.quitar(x.id); } catch (e2) { /* idem */ }
                        rechazados++;
                        aviso();
                        try { if (opc.alRechazado) opc.alRechazado(x, e); } catch (e2) { /* idem */ }
                    }
                }
            } finally { vaciando = false; }
            return { enviados, rechazados, quedan: lista.length };
        }

        // Cada 10 s, al volver la señal y al volver a la página.
        function iniciar() {
            if (temporizador) return;
            temporizador = setInterval(() => { if (lista.length) vaciar(); }, 10000);
            raiz.addEventListener("online", () => { vaciar(); });
        }

        return { cargar, agregar, vaciar, iniciar, lista: () => lista.slice(), usaMemoria: almacen.usaMemoria };
    }

    // ------------------------------------------------------------- la última lectura (para abrir sin señal)

    const claveEstado = (dueno) => "ca-ultima-lectura-" + dueno;
    function guardarEstado(dueno, estado) {
        try { raiz.localStorage.setItem(claveEstado(dueno), JSON.stringify({ guardado: new Date().toISOString(), estado })); } catch (e) { /* sin espacio o sin permiso: no pasa nada */ }
    }
    function leerEstado(dueno) {
        try {
            const x = JSON.parse(raiz.localStorage.getItem(claveEstado(dueno)) || "null");
            return x && x.estado && x.estado.mesas ? x : null;
        } catch (e) { return null; }
    }

    // ------------------------------------------------------------- reintentos de un pedido

    const ESPERAS_MS = [0, 1500, 4000]; // antes del 1.º, 2.º y 3.º intento
    const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
    async function conReintentos(hacer, { esperas = ESPERAS_MS } = {}) {
        let ultimo;
        for (let i = 0; i < esperas.length; i++) {
            if (esperas[i]) await pausa(esperas[i]);
            try { return await hacer(); } catch (e) { ultimo = e; if (!esDeRed(e)) throw e; }
        }
        throw ultimo;
    }

    const api = { crear, huella, uuid, esDeRed, conReintentos, guardarEstado, leerEstado, ESPERAS_MS };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    raiz.CentroamericanoCola = api;
})(typeof window !== "undefined" ? window : globalThis);
