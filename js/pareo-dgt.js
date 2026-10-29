/* El código de pareo-dgt.html: «Pareo para DGT».

   Se sube la ronda a chess-results como siempre; esta página la ve salir
   (Edge Function pareo-dgt, cada 30 s mientras vigila) y:
   - arma el PGN de la ronda para importar en DGT LiveChess (js/pareo/dgt.js)
     y lo guarda en la carpeta elegida, o lo baja a Descargas;
   - si hay un token de Lichess, crea el torneo de la transmisión (uno por
     torneo de chess-results) y cada ronda, y le empuja el mismo PGN para
     que el pareo se vea antes de la primera jugada. Las jugadas las sube
     Lichess Broadcaster desde la carpeta de LiveChess.

   Lo que ya se hizo con cada torneo (qué rondas tienen archivo, sus ids en
   Lichess) queda en localStorage de esta computadora: al recargar no se
   repite nada ni se crea una ronda dos veces en Lichess. El token de
   Lichess va en sessionStorage, o en localStorage si se pide recordarlo; a
   Ajedrez Integral no se manda nunca: la página habla con lichess.org
   directo (la API manda Access-Control-Allow-Origin: *).

   Ver «Pareo para DGT» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";

    const CLAVE = "pareo-dgt";
    const CLAVE_TOKEN = "pareo-dgt-token";
    const CADA_MS = 30_000;
    const LICHESS = "https://lichess.org";
    const FUNCION = window.SUPABASE_URL + "/functions/v1/pareo-dgt";
    const $ = (id) => document.getElementById(id);

    // ------------------------------------------------------------ estado

    function leerEstado() {
        try {
            const e = JSON.parse(localStorage.getItem(CLAVE) || "{}");
            return { torneos: Array.isArray(e.torneos) ? e.torneos : [], sinTildes: !!e.sinTildes, ritmo: e.ritmo || "blitz",
                     visibilidad: e.visibilidad || "public", lugar: e.lugar || "", crearRondas: e.crearRondas !== false };
        } catch (_) {
            return { torneos: [], sinTildes: false, ritmo: "blitz", visibilidad: "public", lugar: "", crearRondas: true };
        }
    }
    const estado = leerEstado();
    function guardar() {
        try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (_) { /* sin almacenamiento: sigue en memoria */ }
    }

    function leerToken() {
        try { return sessionStorage.getItem(CLAVE_TOKEN) || localStorage.getItem(CLAVE_TOKEN) || ""; } catch (_) { return ""; }
    }
    let token = leerToken();
    let usuarioLichess = "";
    let carpeta = null;          // FileSystemDirectoryHandle: no sobrevive a recargar
    let vigilando = null;        // el setInterval
    let revisando = false;

    // ------------------------------------------------------------ la bitácora

    function anotar(texto, opciones) {
        const o = opciones || {};
        const li = document.createElement("li");
        li.className = "rounded-lg px-3 py-2 " + (o.importante ? "bg-accent-100 text-brand-900 dark:bg-brand-800 dark:text-white font-semibold" : o.error ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-100");
        const hora = document.createElement("span");
        hora.className = "font-mono mr-2";
        hora.textContent = HoraCR.hora(new Date(), { hour: "numeric", minute: "2-digit", second: "2-digit" });
        li.append(hora, document.createTextNode(texto));
        for (const b of o.botones || []) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ml-2 underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            btn.textContent = b.texto;
            btn.addEventListener("click", b.accion);
            li.append(btn);
        }
        for (const e of o.enlaces || []) {
            const a = document.createElement("a");
            a.href = e.href;
            a.target = "_blank";
            a.rel = "noopener";
            a.className = "ml-2 underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            a.textContent = e.texto;
            li.append(a);
        }
        $("bitacora").prepend(li);
        $("bitacora-vacia").hidden = true;
        while ($("bitacora").children.length > 200) $("bitacora").lastElementChild.remove();
    }

    // ------------------------------------------------------------ chess-results

    async function leerPareo(tnr, rd) {
        const res = await fetch(FUNCION, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + await window.tokenDeSesion(), "apikey": window.SUPABASE_ANON_KEY },
            body: JSON.stringify(rd ? { tnr, rd } : { tnr }),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok || r.error) throw new Error(window.errorDeFuncion(res, r));
        return r;
    }

    // ------------------------------------------------------------ los archivos

    async function elegirCarpeta() {
        if (!window.showDirectoryPicker) {
            await Avisos.alerta("Este navegador no deja elegir una carpeta. Los archivos se bajan a Descargas: ábrela desde LiveChess al importar. Para elegir la carpeta, usa Chrome o Edge en la computadora.", { titulo: "Sin carpeta" });
            return;
        }
        try {
            carpeta = await window.showDirectoryPicker({ id: "pareo-dgt", mode: "readwrite" });
            $("carpeta-texto").textContent = "Los archivos se guardan en la carpeta «" + carpeta.name + "». Al recargar la página hay que volver a elegirla.";
            anotar("Carpeta elegida: «" + carpeta.name + "».");
        } catch (e) {
            if (e && e.name !== "AbortError") anotar("No se pudo usar esa carpeta: " + e.message, { error: true });
        }
    }

    function bajar(nombre, textoPgn) {
        const url = URL.createObjectURL(new Blob([textoPgn], { type: "application/x-chess-pgn" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }

    // Lo deja en la carpeta (reemplazando el que se llame igual) o lo baja.
    async function guardarArchivo(nombre, textoPgn) {
        if (carpeta) {
            try {
                if ((await carpeta.queryPermission({ mode: "readwrite" })) !== "granted") throw new Error("sin permiso");
                const f = await carpeta.getFileHandle(nombre, { create: true });
                const w = await f.createWritable();
                await w.write(textoPgn);
                await w.close();
                return "en la carpeta «" + carpeta.name + "»";
            } catch (e) {
                anotar("No se pudo escribir en la carpeta (" + e.message + "): se baja a Descargas.", { error: true });
            }
        }
        bajar(nombre, textoPgn);
        return "en Descargas";
    }

    // ------------------------------------------------------------ Lichess

    async function lichess(ruta, opciones) {
        const o = opciones || {};
        const headers = { Authorization: "Bearer " + token };
        let body;
        if (o.form) { body = new URLSearchParams(o.form); }
        else if (o.texto !== undefined) { body = o.texto; headers["Content-Type"] = "text/plain; charset=utf-8"; }
        const res = await fetch(LICHESS + ruta, { method: o.method || (body ? "POST" : "GET"), headers, body });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (res.status === 401) throw new Error("Lichess no aceptó el token (¿lo copiaste entero? ¿tiene el permiso de transmisiones?)");
            if (res.status === 429) throw new Error("Lichess pide esperar un minuto antes de seguir");
            const err = typeof r.error === "string" ? r.error : r.error ? JSON.stringify(r.error) : "respondió " + res.status;
            throw new Error("Lichess: " + err);
        }
        return r;
    }

    async function conectar(nuevo) {
        token = nuevo;
        try {
            const cuenta = await lichess("/api/account");
            usuarioLichess = cuenta.username || cuenta.id || "";
            try {
                sessionStorage.setItem(CLAVE_TOKEN, token);
                if ($("recordar-token").checked) localStorage.setItem(CLAVE_TOKEN, token);
                else localStorage.removeItem(CLAVE_TOKEN);
            } catch (_) { /* sin almacenamiento: queda en memoria */ }
            pintarLichess();
            return true;
        } catch (e) {
            token = "";
            usuarioLichess = "";
            pintarLichess(e.message);
            return false;
        }
    }

    function desconectar() {
        token = "";
        usuarioLichess = "";
        try { sessionStorage.removeItem(CLAVE_TOKEN); localStorage.removeItem(CLAVE_TOKEN); } catch (_) { /* nada */ }
        $("token").value = "";
        pintarLichess();
    }

    function pintarLichess(error) {
        const conectado = !!(token && usuarioLichess);
        $("lichess-estado").textContent = error ? "No se conectó: " + error + "." : conectado ? "Conectado a Lichess como " + usuarioLichess + "." : "Sin conectar.";
        $("lichess-estado").className = "text-sm font-semibold mt-2 " + (error ? "text-red-700 dark:text-red-300" : "text-brand-700 dark:text-brand-200");
        $("btn-desconectar").hidden = !conectado;
        $("btn-crear-torneos").disabled = !conectado || !estado.torneos.length;
    }

    // El torneo en Lichess, si todavía no está. Devuelve su id, o null.
    async function torneoLichess(t) {
        if (t.lichess && t.lichess.id) return t.lichess.id;
        if (!token || !usuarioLichess) return null;
        const r = await lichess("/broadcast/new", { form: PareoDGT.formTorneo({
            nombre: t.nombre, ritmo: estado.ritmo, visibilidad: estado.visibilidad, lugar: estado.lugar, tnr: t.tnr,
            descripcion: "Pareo y clasificación oficiales en [chess-results](https://chess-results.com/tnr" + t.tnr + ".aspx?lan=2).",
        }) });
        t.lichess = { id: r.tour.id, url: r.tour.url };
        guardar();
        pintarTorneos();
        anotar("«" + t.nombre + "»: torneo creado en Lichess.", { enlaces: [{ href: r.tour.url, texto: "Verlo en Lichess" }] });
        return t.lichess.id;
    }

    async function crearTorneos() {
        $("btn-crear-torneos").disabled = true;
        for (const t of estado.torneos) {
            try {
                if (t.lichess && t.lichess.id) { anotar("«" + t.nombre + "» ya estaba en Lichess.", { enlaces: [{ href: t.lichess.url, texto: "Verlo en Lichess" }] }); continue; }
                await torneoLichess(t);
            } catch (e) {
                anotar("«" + t.nombre + "»: no se pudo crear en Lichess. " + e.message + ".", { error: true });
            }
        }
        pintarLichess();
    }

    // La ronda en Lichess, con el pareo empujado. Una sola vez por ronda.
    async function rondaLichess(t, datos, pgn) {
        const r = t.rondas[String(datos.ronda)];
        if (r.lichess && r.empujada) return;
        if (r.lichess) {
            // La ronda se creó pero el pareo no llegó: solo falta empujarlo.
            await lichess("/api/broadcast/round/" + r.lichess.id + "/push", { texto: pgn });
            r.empujada = true;
            anotar("«" + t.nombre + "», ronda " + datos.ronda + ": pareo mandado a Lichess.", { enlaces: [{ href: r.lichess.url, texto: "Ver la ronda" }] });
            return;
        }
        const idTorneo = await torneoLichess(t);
        if (!idTorneo) return;
        const nueva = await lichess("/broadcast/" + idTorneo + "/new", { form: PareoDGT.formRonda({ ronda: datos.ronda, inicio: PareoDGT.inicioRonda(datos.fecha, datos.hora) }) });
        r.lichess = { id: nueva.round.id, url: nueva.round.url };
        guardar();
        await lichess("/api/broadcast/round/" + nueva.round.id + "/push", { texto: pgn });
        r.empujada = true;
        anotar("«" + t.nombre + "», ronda " + datos.ronda + ": creada en Lichess con su pareo. En Lichess Broadcaster, elige esta ronda.", { enlaces: [{ href: nueva.round.url, texto: "Ver la ronda" }] });
    }

    // Si Lichess falla (sin red, el límite de pedidos), la ronda queda
    // pendiente y se vuelve a intentar en la revisión siguiente.
    async function intentarLichess(t, datos, pgn) {
        const r = t.rondas[String(datos.ronda)];
        try {
            await rondaLichess(t, datos, pgn);
            delete r.lichessPendiente;
        } catch (e) {
            r.lichessPendiente = true;
            anotar("«" + t.nombre + "», ronda " + datos.ronda + ": no se pudo crear en Lichess. " + e.message + ". Se vuelve a intentar en la próxima revisión.", { error: true });
        }
        guardar();
    }

    async function reenviarPareo(t, ronda) {
        const r = t.rondas[String(ronda)];
        if (!r || !r.lichess || !token) return;
        const ok = await Avisos.confirmar("Se le manda a Lichess el pareo corregido de la ronda " + ronda + ". Si las partidas ya empezaron, lo que se ve en Lichess puede volver al principio hasta que llegue la jugada siguiente.", { titulo: "Mandar el pareo corregido", aceptar: "Mandarlo a Lichess" });
        if (!ok) return;
        try {
            await lichess("/api/broadcast/round/" + r.lichess.id + "/push", { texto: r.pgn });
            anotar("«" + t.nombre + "», ronda " + ronda + ": pareo corregido mandado a Lichess.");
        } catch (e) {
            anotar("«" + t.nombre + "», ronda " + ronda + ": no se pudo mandar a Lichess. " + e.message + ".", { error: true });
        }
    }

    // ------------------------------------------------------------ una revisión

    async function revisarTorneo(t, opciones) {
        const datos = await leerPareo(t.tnr);
        if (datos.torneo && (!t.nombre || t.nombre === "tnr" + t.tnr)) { t.nombre = datos.torneo; guardar(); pintarTorneos(); }
        t.ultima = { ronda: datos.ronda, leido: datos.leido_en, viejo: !!datos.viejo };
        t.rondas = t.rondas || {};
        const que = PareoDGT.decidir(t, datos);
        const yaHecha = t.rondas[String(datos.ronda)];
        if (que === "igual" && yaHecha.lichessPendiente && estado.crearRondas && token && usuarioLichess) {
            await intentarLichess(t, datos, yaHecha.pgn);
        }
        if (que === "esperar" || que === "igual") {
            if (opciones && opciones.contar) anotar("«" + t.nombre + "»: " + (que === "esperar" ? "todavía no hay ronda emparejada." : "nada nuevo (ronda " + datos.ronda + ")."));
            pintarTorneos();
            return;
        }
        const pgn = PareoDGT.pgn(datos, { desde: t.desde, hasta: t.hasta, sinTildes: estado.sinTildes, sitio: estado.lugar || undefined });
        const n = PareoDGT.partidas(datos, { desde: t.desde, hasta: t.hasta }).length;
        const nombre = PareoDGT.nombreArchivo(t.nombre, datos.ronda);
        const anterior = t.rondas[String(datos.ronda)];
        t.rondas[String(datos.ronda)] = Object.assign({}, anterior, { firma: PareoDGT.firma(datos), pgn, archivo: nombre, mesas: n });
        guardar();
        const donde = await guardarArchivo(nombre, pgn);
        const bajarOtra = { texto: "Bajarlo otra vez", accion: () => bajar(nombre, pgn) };
        if (que === "nueva") {
            anotar("«" + t.nombre + "», ronda " + datos.ronda + ": " + n + " partida" + (n === 1 ? "" : "s") + " en " + nombre + ", " + donde + ". Impórtalo en LiveChess.", { importante: true, botones: [bajarOtra] });
            document.title = "Ronda " + datos.ronda + " lista — Pareo para DGT";
            if (estado.crearRondas && token && usuarioLichess) await intentarLichess(t, datos, pgn);
        } else {
            const botones = [bajarOtra];
            if (anterior && anterior.lichess) botones.push({ texto: "Mandarlo a Lichess", accion: () => reenviarPareo(t, datos.ronda) });
            anotar("«" + t.nombre + "», ronda " + datos.ronda + ": el pareo cambió en chess-results. Se volvió a armar " + nombre + " (" + donde + "): vuelve a importarlo en LiveChess.", { importante: true, botones });
            document.title = "Pareo cambiado — Pareo para DGT";
        }
        pintarTorneos();
    }

    async function revisar(opciones) {
        if (revisando || !estado.torneos.length) return;
        revisando = true;
        $("btn-revisar").disabled = true;
        try {
            for (const t of estado.torneos) {
                try { await revisarTorneo(t, opciones); }
                catch (e) { anotar("«" + (t.nombre || t.tnr) + "»: " + e.message, { error: true }); }
            }
            $("vigilar-estado").textContent = (vigilando ? "Vigilando. " : "Detenido. ") + "Última revisión: " + HoraCR.hora(new Date(), { hour: "numeric", minute: "2-digit", second: "2-digit" }) + ".";
        } finally {
            revisando = false;
            $("btn-revisar").disabled = false;
        }
    }

    function vigilar(encender) {
        clearInterval(vigilando);
        vigilando = encender ? setInterval(() => revisar(), CADA_MS) : null;
        $("btn-vigilar").setAttribute("aria-pressed", encender ? "true" : "false");
        $("btn-vigilar").textContent = encender ? "Dejar de vigilar" : "Empezar a vigilar";
        $("vigilar-estado").textContent = encender ? "Vigilando: revisa cada 30 segundos." : "Detenido.";
        if (encender) revisar();
    }

    // ------------------------------------------------------------ los torneos

    function pintarTorneos() {
        const ul = $("torneos");
        ul.textContent = "";
        $("torneos-vacio").hidden = estado.torneos.length > 0;
        for (const t of estado.torneos) {
            const li = document.createElement("li");
            li.className = "rounded-xl border border-brand-200 dark:border-brand-700 p-3";
            const arriba = document.createElement("div");
            arriba.className = "flex flex-wrap items-center justify-between gap-2";
            const nombre = document.createElement("p");
            nombre.className = "font-semibold text-brand-800 dark:text-white";
            nombre.textContent = t.nombre || "tnr" + t.tnr;
            const acciones = document.createElement("div");
            acciones.className = "flex flex-wrap gap-2";
            const quitar = document.createElement("button");
            quitar.type = "button";
            quitar.className = "bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            quitar.textContent = "Quitar";
            quitar.setAttribute("aria-label", "Quitar " + (t.nombre || "el torneo"));
            quitar.addEventListener("click", () => quitarTorneo(t));
            acciones.append(quitar);
            arriba.append(nombre, acciones);

            const datos = document.createElement("p");
            datos.className = "text-sm text-brand-600 dark:text-brand-300 mt-1";
            const rango = "mesas " + (t.desde || 1) + (t.hasta ? " a " + t.hasta : " en adelante");
            const ult = t.ultima ? (t.ultima.ronda ? "en chess-results va la ronda " + t.ultima.ronda : "sin ronda emparejada todavía") + (t.ultima.viejo ? " (chess-results no contesta: es lo último que se leyó)" : "") : "sin revisar todavía";
            datos.textContent = "tnr" + t.tnr + " · " + rango + " · " + ult + ".";

            const enlaces = document.createElement("p");
            enlaces.className = "text-sm mt-1 flex flex-wrap gap-x-4";
            const cr = document.createElement("a");
            cr.href = "https://chess-results.com/tnr" + t.tnr + ".aspx?lan=2&art=2";
            cr.target = "_blank";
            cr.rel = "noopener";
            cr.className = "text-brand-800 dark:text-white underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            cr.textContent = "Pareo en chess-results";
            enlaces.append(cr);
            if (t.lichess && t.lichess.url) {
                const li2 = cr.cloneNode(false);
                li2.href = t.lichess.url;
                li2.textContent = "Transmisión en Lichess";
                enlaces.append(li2);
            }

            li.append(arriba, datos, enlaces);
            const rondas = Object.keys(t.rondas || {}).map(Number).sort((a, b) => b - a);
            if (rondas.length) {
                const lista = document.createElement("ul");
                lista.className = "mt-2 flex flex-wrap gap-2";
                for (const n of rondas) {
                    const r = t.rondas[String(n)];
                    if (!r.pgn) continue;
                    const item = document.createElement("li");
                    const b = document.createElement("button");
                    b.type = "button";
                    b.className = "bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-brand-800 dark:text-brand-100 px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                    b.textContent = "Ronda " + n + " (" + r.mesas + " partida" + (r.mesas === 1 ? "" : "s") + ")" + (r.lichess ? " · en Lichess" : "");
                    b.setAttribute("aria-label", "Bajar el archivo de la ronda " + n);
                    b.addEventListener("click", () => bajar(r.archivo, r.pgn));
                    item.append(b);
                    lista.append(item);
                }
                li.append(lista);
            }
            ul.append(li);
        }
        $("btn-crear-torneos").disabled = !(token && usuarioLichess) || !estado.torneos.length;
    }

    async function agregarTorneo(ev) {
        ev.preventDefault();
        const tnr = PareoDGT.tnrDe($("tnr").value);
        const desde = Number($("desde").value) || 1;
        const hasta = $("hasta").value ? Number($("hasta").value) : null;
        $("torneo-error").textContent = "";
        if (!tnr) { $("torneo-error").textContent = "Pega la dirección del torneo en chess-results (…chess-results.com/tnr123456.aspx) o solo su número."; $("tnr").focus(); return; }
        if (estado.torneos.some((t) => t.tnr === tnr)) { $("torneo-error").textContent = "Ese torneo ya está en la lista."; $("tnr").focus(); return; }
        if (desde < 1 || (hasta !== null && hasta < desde)) { $("torneo-error").textContent = "«Hasta la mesa» tiene que ser igual o mayor que «Desde la mesa»."; $("hasta").focus(); return; }
        const t = { tnr, nombre: "tnr" + tnr, desde, hasta, rondas: {} };
        estado.torneos.push(t);
        guardar();
        $("tnr").value = "";
        pintarTorneos();
        anotar("Torneo agregado: tnr" + tnr + ".");
        try { await revisarTorneo(t, { contar: true }); }
        catch (e) { anotar("tnr" + tnr + ": " + e.message, { error: true }); }
    }

    async function quitarTorneo(t) {
        const ok = await Avisos.confirmar("Se deja de vigilar «" + t.nombre + "» y se olvidan sus rondas en esta computadora. En chess-results y en Lichess no se borra nada.", { titulo: "Quitar el torneo", aceptar: "Quitarlo de la lista", peligro: true });
        if (!ok) return;
        estado.torneos = estado.torneos.filter((x) => x !== t);
        guardar();
        pintarTorneos();
    }

    // ------------------------------------------------------------ arranque

    function enlazar() {
        $("form-torneo").addEventListener("submit", agregarTorneo);
        $("btn-carpeta").addEventListener("click", elegirCarpeta);
        $("sin-tildes").checked = estado.sinTildes;
        $("sin-tildes").addEventListener("change", () => { estado.sinTildes = $("sin-tildes").checked; guardar(); });
        $("ritmo").value = estado.ritmo;
        $("ritmo").addEventListener("change", () => { estado.ritmo = $("ritmo").value; guardar(); });
        $("visibilidad").value = estado.visibilidad;
        $("visibilidad").addEventListener("change", () => { estado.visibilidad = $("visibilidad").value; guardar(); });
        $("lugar").value = estado.lugar;
        $("lugar").addEventListener("change", () => { estado.lugar = $("lugar").value.trim(); guardar(); });
        $("crear-rondas").checked = estado.crearRondas;
        $("crear-rondas").addEventListener("change", () => { estado.crearRondas = $("crear-rondas").checked; guardar(); });
        try { $("recordar-token").checked = !!localStorage.getItem(CLAVE_TOKEN); } catch (_) { /* nada */ }
        $("recordar-token").addEventListener("change", () => {
            try {
                if ($("recordar-token").checked && token) localStorage.setItem(CLAVE_TOKEN, token);
                if (!$("recordar-token").checked) localStorage.removeItem(CLAVE_TOKEN);
            } catch (_) { /* nada */ }
        });
        $("form-lichess").addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const nuevo = $("token").value.trim();
            if (!nuevo) { pintarLichess("falta pegar el token"); $("token").focus(); return; }
            $("lichess-estado").textContent = "Conectando…";
            if (await conectar(nuevo)) { $("token").value = ""; anotar("Conectado a Lichess como " + usuarioLichess + "."); }
        });
        $("btn-desconectar").addEventListener("click", desconectar);
        $("btn-crear-torneos").addEventListener("click", crearTorneos);
        $("btn-vigilar").addEventListener("click", () => vigilar(!vigilando));
        $("btn-revisar").addEventListener("click", () => revisar({ contar: true }));
        if (!window.showDirectoryPicker) $("carpeta-texto").textContent = "Este navegador baja cada archivo a Descargas. Con Chrome o Edge en la computadora se puede elegir una carpeta.";
        window.addEventListener("focus", () => { if (/^(Ronda|Pareo cambiado)/.test(document.title)) document.title = "Pareo para DGT — Ajedrez Integral"; });
        window.addEventListener("beforeunload", (ev) => { if (vigilando) { ev.preventDefault(); ev.returnValue = ""; } });
        pintarTorneos();
        pintarLichess();
        if (token) conectar(token);
    }

    async function init() {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) { window.location.href = "login.html"; return; }
        const { data: perfil, error } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).single();
        $("loading").classList.add("hidden");
        if (error || !perfil || !perfil.is_admin) { $("denied").classList.remove("hidden"); return; }
        $("app").classList.remove("hidden");
        enlazar();
    }

    init();
})();
