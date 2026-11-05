/* «Generar PGN» de cada foto en «Planillas y Drive» (centroamericano-mesas.html): la partida
   de esa mesa, ahí mismo, en una fila debajo de la foto, con su vista previa en un tablero y
   la descarga del PGN.

   De dónde sale la partida:
   - **Si la mesa se transmite en vivo** (la sala de Lichess del Centroamericano), de la
     transmisión: sus jugadas son las del tablero electrónico, no hace falta leer la letra de
     nadie y no se gasta el lector. Se averigua sola al pintar la tabla (por los dos nombres
     y la ronda, CentroamericanoTransmisionReloj.buscarPartida) y la fila lo dice.
   - **Si no se transmite**, de la foto de las dos planillas: Google Vision por la Edge
     Function ocr-scoresheet (gasta un uso del tope diario del lector) y
     js/planilla-reconstruir.js en su propio hilo (js/planilla-reconstruir-worker.js), que
     salva todo lo que puede y deja «Ilegible desde la jugada N» lo que ya no tiene salida,
     sin inventarle jugadas. Cada jugada dice si se leyó tal cual, se corrigió o es dudosa.

   Lo leído de una foto se guarda en este navegador (por foto): volver a abrirla no gasta otra
   lectura; «Volver a leer la foto» sí. «Descargar la lectura» baja lo que devolvió Vision y lo que
   salió de eso, para afinar el corrector con lecturas de verdad. Una partida de la transmisión que ya terminó también se
   guarda; la que sigue en juego se vuelve a pedir. Nada de esto anota ni cambia ningún
   resultado: es para revisar. Ver «Leer la partida de las planillas» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";

    const CLAVE = "cam-partida-leida:";
    const ESTADO_TXT = { leida: "leída tal cual", corregida: "corregida", dudosa: "dudosa" };
    const MARCA = { leida: "", corregida: " *", dudosa: " ?" };
    const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
    const enEspanol = (san) => String(san).replace(/^[KQRBN]/, (p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]);
    const numero = (i) => Math.floor(i / 2) + 1 + (i % 2 ? "…" : ".");
    const deQuien = (i) => "jugada " + (Math.floor(i / 2) + 1) + (i % 2 ? " de las negras" : " de las blancas");
    const FUENTE_MS = 10 * 60 * 1000;  // cada cuánto se vuelve a preguntar si una mesa está en la transmisión
    const FUENTE_ERROR_MS = 60 * 1000;  // si Lichess no contestó, se vuelve a probar al minuto

    const fuentes = new Map();   // ruta → { estado: "buscando" | "transmision" | "foto" | "error", h, cuando, texto }
    const abiertos = new Map();  // ruta → la fila de debajo, con la partida (se conserva al repintar la tabla)

    function guardado(p) {
        try { const x = JSON.parse(localStorage.getItem(CLAVE + p.ruta) || "null"); return x && x.subida === p.subida ? x : null; } catch (e) { return null; }
    }
    function guardar(p, datos) {
        const texto = JSON.stringify(Object.assign({ subida: p.subida }, datos));
        try { localStorage.setItem(CLAVE + p.ruta, texto); return; } catch (e) { /* sin espacio: se hace lugar abajo */ }
        // sin espacio: se borran las lecturas guardadas de las otras fotos (se pueden volver a leer) y se prueba otra vez
        try {
            Object.keys(localStorage).filter((k) => k.indexOf(CLAVE) === 0 && k !== CLAVE + p.ruta).forEach((k) => localStorage.removeItem(k));
            localStorage.setItem(CLAVE + p.ruta, texto);
        } catch (e) { /* tampoco: esta se volverá a leer */ }
    }

    // ------------------------------------------------------------------ de dónde sale

    function fuenteDe(p, ctx) {
        const f = fuentes.get(p.ruta);
        if (f && (f.promesa || Date.now() - f.cuando < (f.estado === "error" ? FUENTE_ERROR_MS : FUENTE_MS))) return f.promesa || Promise.resolve(f);
        const [blancas, negras] = ctx.enfrentamiento(p).split(" vs ");
        const nueva = { estado: "buscando", cuando: Date.now() };
        fuentes.set(p.ruta, nueva);
        const TX = window.CentroamericanoTransmisionReloj;
        nueva.promesa = (TX ? TX.buscarPartida({ blancas, negras, ronda: p.ronda, torneo: ctx.nombreTorneo(p.tnr) }) : Promise.resolve({ error: "Esta página no puede leer la transmisión.", noSeTransmite: true }))
            .then((h) => {
                const f2 = { cuando: Date.now(), h };
                if (!h.error) f2.estado = "transmision";
                else if (h.noSeTransmite || h.alReves) { f2.estado = "foto"; f2.texto = h.alReves ? h.error : ""; }
                else { f2.estado = "error"; f2.texto = h.error; }
                fuentes.set(p.ruta, f2);
                return f2;
            });
        return nueva.promesa;
    }

    const ROTULO = {
        buscando: "Buscando si se transmite…",
        transmision: "📡 Se transmite: sale de Lichess",
        foto: "📷 Sin transmisión: sale de la foto",
        error: "No se pudo ver la transmisión",
    };

    function pintarRotulo(p) {
        const f = fuentes.get(p.ruta);
        document.querySelectorAll(".cam-lp-fuente").forEach((s) => {
            if (s.dataset.fuenteDe !== p.ruta) return;
            s.textContent = f ? ROTULO[f.estado] : "";
            s.dataset.fuente = f ? f.estado : "";
            s.title = f && f.texto ? f.texto : "";
        });
    }

    /* Se llama después de pintar la tabla: averigua, de a una (todas comparten la misma ronda de
       Lichess, que queda guardada), cuáles mesas se transmiten. */
    let revisando = false;
    async function revisarFuentes(lista, ctx) {
        lista.forEach(pintarRotulo);
        if (revisando) return;
        revisando = true;
        try {
            for (const p of lista) {
                const f = fuentes.get(p.ruta);
                if (f && f.estado !== "buscando" && Date.now() - f.cuando < (f.estado === "error" ? FUENTE_ERROR_MS : FUENTE_MS)) continue;
                const promesa = fuenteDe(p, ctx);
                pintarRotulo(p);
                await promesa;
                pintarRotulo(p);
            }
        } finally { revisando = false; }
    }

    // ------------------------------------------------------------------ leer

    // La partida de la transmisión: el PGN de la ronda de Lichess, solo el bloque de esa partida (con sus relojes).
    async function deLaTransmision(f) {
        const L = window.LichessTransmision, TX = window.CentroamericanoTransmisionReloj;
        const texto = await L.pgn(f.h.idRonda);
        const bloques = String(texto || "").replace(/\r/g, "").split(/\n\s*\n(?=\[)/).filter((b) => /\[\w+\s+"/.test(b));
        const id = f.h.g.id;
        const pl = f.h.g.players || [];
        const bloque = bloques.find((b) => id && new RegExp("\\[(?:GameURL|Site) \"[^\"]*/" + id + "\"\\]").test(b))
            || bloques.find((b) => { const t = L.leerPgn(b, window.Chess)[0]; return t && pl[0] && pl[1] && TX.mismoJugador(t.blancas.nombre, pl[0].name) && TX.mismoJugador(t.negras.nombre, pl[1].name); });
        if (!bloque) throw new Error("La transmisión no trae las jugadas de esta partida todavía.");
        const partida = L.leerPgn(bloque, window.Chess)[0];
        const enCurso = !partida.tags.Result || partida.tags.Result === "*";
        return {
            fuente: "transmision", url: partida.url || f.h.url, enCurso, resultadoTxt: partida.tags.Result || "*",
            pgnTexto: bloque.trim() + "\n",
            resultado: { jugadas: partida.jugadas.map((j) => ({ san: j.san, estado: "leida", escrito: [] })), ilegibleDesde: null, resto: [], hojas: 0 },
            leida: new Date().toISOString(),
        };
    }

    let hilo = null, pedido = 0;
    function reconstruirEnHilo(hojas, alProgresar) {
        if (!hilo) hilo = new Worker("js/planilla-reconstruir-worker.js");
        const id = ++pedido;
        return new Promise((resolve, reject) => {
            const oir = (e) => {
                if (e.data.id !== id) return;
                if (e.data.progreso !== undefined) { alProgresar(e.data.progreso); return; }
                hilo.removeEventListener("message", oir);
                if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.resultado);
            };
            hilo.addEventListener("message", oir);
            hilo.postMessage({ id, hojas });
        });
    }

    async function deLaFoto(p, decir) {
        decir("Bajando la foto…");
        const { data, error } = await window.sb.storage.from("centroamericano-planillas").createSignedUrl(p.ruta, 120);
        if (error || !data) throw new Error("No se pudo abrir la foto" + (error ? ": " + error.message : "."));
        const res = await fetch(data.signedUrl);
        if (!res.ok) throw new Error("No se pudo bajar la foto.");
        const foto = await res.blob();
        decir("Leyendo la letra de las planillas…");
        // el token se pide en el momento (js/token-sesion.js): el de cuando se abrió la página vence a la hora
        let words;
        try {
            ({ words } = await window.PlanillaOcr.leerFoto(foto, await window.tokenDeSesion(), { maxLado: 2600 }));
        } catch (e) {
            // «Failed to fetch»: la función no contestó (se cayó, se pasó de tiempo o le falta la clave de Google
            // Vision: el 4/11 faltaba). Supabase contesta eso sin el permiso de origen y el navegador solo ve eso.
            if (/failed to fetch|networkerror|load failed/i.test(String(e && e.message))) {
                throw new Error("el lector de planillas no contestó. Puede que el servicio de lectura (Google Vision) no esté configurado o se haya caído: avísale a administración. Las partidas que se transmiten salen igual de Lichess.");
            }
            throw e;
        }
        const { hojas, metodo } = window.PlanillaReconstruir.hojasDeLaFoto(words);
        if (!hojas.length) throw new Error("No se encontró nada escrito en la foto.");
        decir("Armando la partida… 0 %");
        const resultado = await reconstruirEnHilo(hojas, (x) => decir("Armando la partida… " + Math.round(x * 100) + " %"));
        // `palabras`: lo que devolvió Google Vision tal cual (texto y caja de cada palabra), para «Descargar la lectura»
        // compactas ([texto, x0, y0, x1, y1]): se guardan en el navegador con la lectura, y así caben cien fotos
        const palabras = (words || []).map((w) => [w.text, w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1]);
        return { fuente: "foto", hojas, metodo, resultado, palabras, leida: new Date().toISOString() };
    }

    function pgnDe(p, datos, ctx) {
        if (datos.fuente === "transmision") return datos.pgnTexto;
        const enfrentamiento = ctx.enfrentamiento(p).split(" vs ");
        const g = new window.Chess();
        datos.resultado.jugadas.forEach((j) => g.move(j.san));
        let resultado = "*";
        if (datos.resultado.ilegibleDesde === null && g.in_checkmate()) resultado = g.turn() === "w" ? "0-1" : "1-0";
        return window.PlanillaReconstruir.aPgn(window.Chess, datos.resultado, {
            Event: ctx.nombreTorneo(p.tnr), Site: "Centroamericano 2026", Round: String(p.ronda),
            // el día de la foto, en hora de Costa Rica (AAAA.MM.DD)
            Date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date(p.subida)).replace(/-/g, "."),
            White: enfrentamiento[0] || "?", Black: enfrentamiento[1] || "?", Result: resultado,
            Annotator: "Leída de la foto de las planillas (mesa " + p.mesa + ")",
        });
    }

    // ------------------------------------------------------------------ la vista previa

    function pintar(caja, p, datos, ctx, acciones) {
        const { el } = ctx;
        const r = datos.resultado;
        const js = r.jugadas;
        const deFoto = datos.fuente !== "transmision";
        const cuenta = (e) => js.filter((j) => j.estado === e).length;
        caja.replaceChildren();

        const resumen = el("div", { class: "cam-lp-resumen" });
        // append() escribe «null» si le llega uno: lo que no va se saca antes
        const agregar = (...hijos) => resumen.append(...hijos.filter(Boolean));
        if (deFoto) {
            agregar(
                el("p", { class: "cam-lp-titular", texto: r.ilegibleDesde === null
                    ? "Leída de la foto: la partida entera, " + js.length + " medias jugadas."
                    : js.length ? "Leída de la foto: se pudieron salvar " + js.length + " medias jugadas, hasta la " + deQuien(js.length - 1) + "." : "Leída de la foto: no se pudo reproducir ninguna jugada." }),
                el("p", { texto: cuenta("leida") + " leídas tal cual · " + cuenta("corregida") + " corregidas (*) · " + cuenta("dudosa") + " dudosas (?)" + (r.hojas === 2 ? " · se leyeron las dos planillas" : r.hojas === 1 ? " · se leyó una sola planilla" : "") }),
                datos.metodo === "filas" ? el("p", { texto: "No se encontraron los números impresos de la planilla: se leyó por filas, que es menos seguro." }) : null);
        } else {
            agregar(
                el("p", { class: "cam-lp-titular", texto: "De la transmisión en vivo de Lichess: " + js.length + " medias jugadas" + (datos.enCurso ? "." : " · " + datos.resultadoTxt + ".") }),
                datos.enCurso ? el("p", { texto: "La partida sigue en juego: llega hasta donde va la transmisión (que va con atraso). «Actualizar desde la transmisión» trae lo que siga." }) : null,
                datos.url ? el("p", {}, el("a", { href: datos.url, target: "_blank", rel: "noopener", class: "cam-lp-enlace" }, "Verla en Lichess")) : null);
        }
        caja.append(resumen);

        if (deFoto && r.ilegibleDesde !== null) {
            const resto = (r.resto || []).map((h, k) => h.length ? el("li", { texto: (r.hojas === 2 ? "Planilla " + (k + 1) + ": " : "") + h.join(" · ") }) : null).filter(Boolean);
            caja.append(el("div", { class: "cam-lp-ilegible", role: "note" },
                el("strong", { texto: "⚠ Ilegible desde la " + deQuien(r.ilegibleDesde) + "." }),
                el("p", { texto: "Desde ahí ninguna continuación legal se parece a lo escrito, así que no se le inventan jugadas. Lo que dice la planilla de ahí en adelante:" }),
                resto.length ? el("ul", {}, ...resto) : el("p", { texto: "(nada legible)" })));
        }

        // El tablero y los botones para recorrerla
        let pos = js.length;
        const tablero = el("div", { class: "cine-tablero cam-lp-tablero", role: "img" });
        const linea = el("p", { class: "cam-lp-linea", "aria-live": "polite" });
        const lista = el("ol", { class: "cam-lp-lista", "aria-label": "Jugadas de la partida" });
        const g = new window.Chess();
        const fens = [g.fen()], ucis = [null];
        js.forEach((j) => { const m = g.move(j.san); fens.push(g.fen()); ucis.push(m.from + m.to); });
        const botonesJ = js.map((j, i) => el("button", {
            type: "button", class: "cam-lp-jugada cam-lp-" + j.estado, "data-ply": String(i),
            title: deFoto ? ESTADO_TXT[j.estado] + (j.escrito && j.escrito.length ? " · escrito: " + j.escrito.join(" | ") : "") : null,
            onclick: () => ir(i + 1),
        }, enEspanol(j.san) + MARCA[j.estado]));
        for (let i = 0; i < botonesJ.length; i += 2) {
            lista.append(el("li", {}, el("span", { class: "cam-lp-num", texto: (i / 2 + 1) + "." }), botonesJ[i], botonesJ[i + 1] || null));
        }
        function ir(n) {
            pos = Math.max(0, Math.min(js.length, n));
            window.TableroFen.dibujar(tablero, fens[pos], ucis[pos], {});
            tablero.setAttribute("aria-label", "Tablero. " + window.TableroFen.describir(fens[pos]));
            botonesJ.forEach((b, i) => b.setAttribute("aria-current", i === pos - 1 ? "true" : "false"));
            if (pos) botonesJ[pos - 1].scrollIntoView({ block: "nearest" });
            if (!pos) { linea.textContent = "Posición inicial."; return; }
            const j = js[pos - 1];
            linea.textContent = numero(pos - 1) + " " + enEspanol(j.san)
                + (deFoto ? " — " + ESTADO_TXT[j.estado]
                    + (j.escrito && j.escrito.length ? ". En la planilla: «" + j.escrito.join("» y «") + "»" : "")
                    + (j.alternativa ? ". También podría ser " + enEspanol(j.alternativa) : "") : "") + ".";
        }
        const ctl = (texto, etiqueta, f) => el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "aria-label": etiqueta, onclick: f }, texto);
        const controles = el("div", { class: "cam-lp-controles" },
            ctl("⏮", "Al inicio", () => ir(0)), ctl("◀", "Jugada anterior", () => ir(pos - 1)),
            ctl("▶", "Jugada siguiente", () => ir(pos + 1)), ctl("⏭", "Al final", () => ir(js.length)));
        const zona = el("div", { class: "cam-lp-zona" },
            el("div", { class: "cam-lp-izq" }, el("div", { class: "cine-tablero-marco cam-lp-marco" }, tablero), controles, linea),
            el("div", { class: "cam-lp-der" }, deFoto ? el("p", { class: "cam-lp-leyenda", texto: "Sin marca: leída tal cual · * corregida · ? dudosa (revísala en la foto)" }) : null, lista));
        zona.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); ir(pos - 1); }
            if (e.key === "ArrowRight") { e.preventDefault(); ir(pos + 1); }
        });
        caja.append(zona);

        const pgn = pgnDe(p, datos, ctx);
        // sin tildes ni eñes en el NOMBRE del archivo (algunos navegadores lo cambian por «download»); dentro, tal cual
        const nombre = ("Mesa " + String(p.mesa).padStart(2, "0") + " - Ronda " + p.ronda + " - " + ctx.enfrentamiento(p))
            .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .,()-]/g, "") + ".pgn";
        // el enlace va DENTRO de la fila (con un modal abierto en la página, lo de afuera queda inerte)
        const bajar = (texto, tipo, archivo) => {
            const a = el("a", { href: URL.createObjectURL(new Blob([texto], { type: tipo })), download: archivo, hidden: true });
            caja.append(a); a.click(); a.remove();
        };
        caja.append(el("div", { class: "cam-acciones cam-lp-acciones" },
            el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "bajar-pgn", onclick: () => bajar(pgn, "application/x-chess-pgn", nombre) }, "Descargar el PGN"),
            el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: async (e) => {
                const b = e.currentTarget;
                try { await navigator.clipboard.writeText(pgn); b.textContent = "PGN copiado ✓"; } catch (err) { ctx.avisar("No se pudo copiar: bájalo con «Descargar el PGN».", true); }
            } }, "Copiar el PGN"),
            deFoto ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "bajar-lectura", onclick: () => {
                if (!datos.palabras) { ctx.avisar("Esta lectura se guardó antes de que se pudiera descargar: toca «Volver a leer la foto» y después descárgala.", true); return; }
                bajar(JSON.stringify(lecturaParaRevisar(p, datos, ctx), null, 1), "application/json", "lectura-mesa-" + String(p.mesa).padStart(2, "0") + "-ronda-" + p.ronda + "-" + p.tnr + ".json");
            } }, "Descargar la lectura") : null,
            deFoto
                ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "volver-a-leer", onclick: acciones.leerFoto }, "Volver a leer la foto")
                : el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "actualizar-transmision", onclick: acciones.generar }, "Actualizar desde la transmisión")),
            el("p", { class: "cam-lp-nota", texto: deFoto
                ? "Leída " + window.HoraCR.fechaHora(datos.leida) + ". Es una ayuda para revisar: nada de esto cambia ningún resultado. «Volver a leer» gasta otra lectura."
                : "Traída " + window.HoraCR.fechaHora(datos.leida) + " de la transmisión: son las jugadas del tablero electrónico, sin leer ninguna planilla." }));
        ir(js.length);
    }

    /* «Descargar la lectura»: lo que leyó Google Vision de la foto (cada palabra con su caja) y lo que salió de eso
       (las celdas de cada planilla y la partida), para revisar con datos de verdad por qué una partida se leyó mal y
       afinar js/planilla-reconstruir.js. Trae lo que está escrito en la planilla, también los nombres del
       encabezado: es para quien organiza y para revisar, nunca para el repositorio. */
    function lecturaParaRevisar(p, datos, ctx) {
        const r = datos.resultado;
        return {
            que: "Lectura de la foto de las planillas («Generar PGN», Centroamericano 2026)",
            version: 1,
            torneo: ctx.nombreTorneo(p.tnr), tnr: p.tnr, ronda: p.ronda, mesa: p.mesa,
            subida: p.subida, leida: datos.leida,
            metodo: datos.metodo,
            hojas: datos.hojas,
            partida: {
                jugadas: r.jugadas.map((j) => ({ san: j.san, estado: j.estado, escrito: j.escrito || [], alternativa: j.alternativa || null })),
                ilegibleDesde: r.ilegibleDesde, resto: r.resto || [], costo: r.costo,
            },
            // como las devuelve ocr-scoresheet: se pueden pasar tal cual a PlanillaReconstruir.hojasDeLaFoto()
            palabras: datos.palabras.map((w) => ({ text: w[0], bbox: { x0: w[1], y0: w[2], x1: w[3], y1: w[4] } })),
        };
    }

    async function generar(p, caja, ctx, opciones) {
        const o = opciones || {};
        const { el } = ctx;
        const estado = el("p", { class: "cam-lp-estado", role: "status" });
        caja.replaceChildren(estado);
        const decir = (t) => { estado.textContent = t; };
        const acciones = { generar: () => generar(p, caja, ctx, { sinGuardado: true }), leerFoto: () => generar(p, caja, ctx, { foto: true, sinGuardado: true }) };
        try {
            const ya = !o.sinGuardado && guardado(p);
            if (ya) { pintar(caja, p, ya, ctx, acciones); return; }
            let datos;
            if (!o.foto) {
                decir("Buscando la mesa en la transmisión de Lichess…");
                if (o.sinGuardado) fuentes.delete(p.ruta);
                const f = await fuenteDe(p, ctx);
                pintarRotulo(p);
                if (f.estado === "transmision") {
                    decir("Trayendo la partida de la transmisión…");
                    datos = await deLaTransmision(f);
                    if (!datos.enCurso) guardar(p, datos);
                } else if (f.estado === "error") {
                    // no se sabe si se transmite: no se gasta una lectura sin preguntar
                    caja.replaceChildren(el("p", { class: "cam-lp-estado", role: "status", texto: f.texto }),
                        el("div", { class: "cam-acciones" },
                            el("button", { type: "button", class: "cam-btn cam-btn-chico", onclick: () => { fuentes.delete(p.ruta); generar(p, caja, ctx, o); } }, "Probar otra vez"),
                            el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "leer-foto", onclick: acciones.leerFoto }, "Leer la foto de todos modos")));
                    return;
                }
            }
            if (!datos) {
                datos = await deLaFoto(p, decir);
                guardar(p, datos);
            }
            pintar(caja, p, datos, ctx, acciones);
        } catch (e) {
            decir("No se pudo generar el PGN: " + (e.message || e));
        }
    }

    // ------------------------------------------------------------------ en la tabla

    /* El botón de la fila y su rótulo de dónde sale la partida. */
    function botones(p, ctx, columnas) {
        const { el } = ctx;
        const abierto = abiertos.has(p.ruta);
        const id = "lp-" + p.ruta.replace(/[^A-Za-z0-9]/g, "-");
        const b = el("button", {
            type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "generar-pgn",
            "aria-expanded": abierto ? "true" : "false", "aria-controls": id,
            onclick: () => alternar(p, ctx, columnas, b, id),
        }, abierto ? "Ocultar la partida" : "Generar PGN");
        const rotulo = el("span", { class: "cam-lp-fuente" });
        rotulo.dataset.fuenteDe = p.ruta;
        return [b, rotulo];
    }

    function alternar(p, ctx, columnas, b, id) {
        if (abiertos.has(p.ruta)) {
            abiertos.get(p.ruta).remove();
            abiertos.delete(p.ruta);
            b.setAttribute("aria-expanded", "false");
            b.textContent = "Generar PGN";
            return;
        }
        const caja = ctx.el("div", { class: "cam-lp" });
        const fila = ctx.el("tr", { class: "cam-lp-fila", id }, ctx.el("td", { colspan: String(columnas) }, caja));
        b.closest("tr").after(fila);
        abiertos.set(p.ruta, fila);
        b.setAttribute("aria-expanded", "true");
        b.textContent = "Ocultar la partida";
        generar(p, caja, ctx);
    }

    /* El enlace directo al PGN de todas las partidas transmitidas de una categoría y una ronda, para recolectarlas de
       una vez: va en el encabezado de cada torneo y ronda de la tabla (`.cam-pl-tx`, con data-tnr y data-ronda). */
    const rondas = new Map();   // "tnr|ronda" → { cuando, r } (r: la ronda transmitida o null)
    let revisandoGrupos = false;
    async function revisarGrupos(ctx) {
        if (revisandoGrupos || !window.CentroamericanoTransmisionReloj) return;
        revisandoGrupos = true;
        try {
            for (const s of [...document.querySelectorAll(".cam-pl-tx")]) {
                const clave = s.dataset.tnr + "|" + s.dataset.ronda;
                let x = rondas.get(clave);
                if (!x || Date.now() - x.cuando > FUENTE_MS) {
                    let r = null;
                    try { r = await window.CentroamericanoTransmisionReloj.rondaTransmitida({ torneo: ctx.nombreTorneo(s.dataset.tnr), ronda: Number(s.dataset.ronda) }); } catch (e) { r = null; }
                    x = { cuando: Date.now(), r };
                    rondas.set(clave, x);
                }
                document.querySelectorAll('.cam-pl-tx[data-tnr="' + CSS.escape(s.dataset.tnr) + '"][data-ronda="' + CSS.escape(s.dataset.ronda) + '"]').forEach((t) => {
                    t.replaceChildren();
                    if (!x.r) return;
                    t.append(" · ", ctx.el("a", { href: x.r.pgn, class: "cam-pl-tx-enlace", rel: "noopener", "data-accion": "pgn-ronda" },
                        "📡 PGN de las " + x.r.partidas + " partidas transmitidas"), " · ",
                        ctx.el("a", { href: x.r.url, class: "cam-pl-tx-enlace", target: "_blank", rel: "noopener" }, "verlas en Lichess"));
                });
            }
        } finally { revisandoGrupos = false; }
    }

    /* La fila abierta de esta foto (la misma, con lo que ya tenía), para volver a ponerla al repintar. */
    const detalle = (p) => abiertos.get(p.ruta) || null;

    window.CentroamericanoLeerPartida = { botones, detalle, revisarFuentes, revisarGrupos };
})();
