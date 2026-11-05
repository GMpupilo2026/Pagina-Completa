/* «Leer la partida» de cada foto en «Planillas y Drive» (centroamericano-mesas.html):
   de la foto de las dos planillas de una mesa a la partida, para reproducirla en
   un tablero y bajarla en PGN.

   1. Baja la foto del bucket privado (URL firmada de 2 minutos).
   2. La lee Google Vision por la Edge Function ocr-scoresheet (gasta un uso del
      tope diario del lector, como el Lector de planilla).
   3. js/planilla-reconstruir.js: las celdas de cada planilla (por los números
      impresos 1–60) y la partida legal que mejor explica las DOS a la vez, en su
      propio hilo (js/planilla-reconstruir-worker.js).
   4. Se muestra todo lo que se pudo salvar: cada jugada dice si se leyó tal cual,
      si se corrigió o si es dudosa (con lo que dice cada planilla), y, si desde
      un punto ya no hubo salida, «Ilegible desde la jugada N» con lo que está
      escrito de ahí en adelante, sin inventarle jugadas.

   Lo leído se guarda en este navegador (por foto): volver a abrirla no gasta otra
   lectura. «Volver a leer» sí. Nada se anota en ningún resultado: es para revisar.
   Ver «Leer la partida de las planillas» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";

    const CLAVE = "cam-partida-leida:";
    const ESTADO_TXT = { leida: "leída tal cual", corregida: "corregida", dudosa: "dudosa" };
    const MARCA = { leida: "", corregida: " *", dudosa: " ?" };
    const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
    const enEspanol = (san) => String(san).replace(/^[KQRBN]/, (p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]);
    const numero = (i) => Math.floor(i / 2) + 1 + (i % 2 ? "…" : ".");
    const deQuien = (i) => "jugada " + (Math.floor(i / 2) + 1) + (i % 2 ? " de las negras" : " de las blancas");

    function guardado(p) {
        try { const x = JSON.parse(localStorage.getItem(CLAVE + p.ruta) || "null"); return x && x.subida === p.subida ? x : null; } catch (e) { return null; }
    }
    function guardar(p, datos) {
        try { localStorage.setItem(CLAVE + p.ruta, JSON.stringify(Object.assign({ subida: p.subida }, datos))); } catch (e) { /* sin espacio: se vuelve a leer */ }
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

    async function leer(p, decir) {
        decir("Bajando la foto…");
        const { data, error } = await window.sb.storage.from("centroamericano-planillas").createSignedUrl(p.ruta, 120);
        if (error || !data) throw new Error("No se pudo abrir la foto" + (error ? ": " + error.message : "."));
        const res = await fetch(data.signedUrl);
        if (!res.ok) throw new Error("No se pudo bajar la foto.");
        const foto = await res.blob();
        const { data: { session } } = await window.sb.auth.getSession();
        if (!session) throw new Error("Se cerró la sesión. Vuelve a entrar.");
        decir("Leyendo la letra de las planillas…");
        const { words } = await window.PlanillaOcr.leerFoto(foto, session.access_token, { maxLado: 2600 });
        const { hojas, metodo } = window.PlanillaReconstruir.hojasDeLaFoto(words);
        if (!hojas.length) throw new Error("No se encontró nada escrito en la foto.");
        decir("Armando la partida… 0 %");
        const resultado = await reconstruirEnHilo(hojas, (x) => decir("Armando la partida… " + Math.round(x * 100) + " %"));
        const datos = { hojas, metodo, resultado, leida: new Date().toISOString() };
        guardar(p, datos);
        return datos;
    }

    function pgnDe(p, datos, ctx) {
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

    function pintar(caja, p, datos, ctx, volverALeer) {
        const { el } = ctx;
        const r = datos.resultado;
        const js = r.jugadas;
        const cuenta = (e) => js.filter((j) => j.estado === e).length;
        caja.replaceChildren();

        const resumen = el("div", { class: "cam-lp-resumen" },
            el("p", { class: "cam-lp-titular", texto: r.ilegibleDesde === null
                ? "Se reprodujo la partida entera: " + js.length + " medias jugadas."
                : js.length ? "Se pudieron salvar " + js.length + " medias jugadas, hasta la " + deQuien(js.length - 1) + "." : "No se pudo reproducir ninguna jugada." }),
            el("p", { texto: cuenta("leida") + " leídas tal cual · " + cuenta("corregida") + " corregidas (*) · " + cuenta("dudosa") + " dudosas (?)" + (r.hojas === 2 ? " · se leyeron las dos planillas" : r.hojas === 1 ? " · se leyó una sola planilla" : "") }),
            datos.metodo === "filas" ? el("p", { texto: "No se encontraron los números impresos de la planilla: se leyó por filas, que es menos seguro." }) : null);
        caja.append(resumen);

        if (r.ilegibleDesde !== null) {
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
        const botones = js.map((j, i) => el("button", {
            type: "button", class: "cam-lp-jugada cam-lp-" + j.estado, "data-ply": String(i),
            title: ESTADO_TXT[j.estado] + (j.escrito && j.escrito.length ? " · escrito: " + j.escrito.join(" | ") : ""),
            onclick: () => ir(i + 1),
        }, enEspanol(j.san) + MARCA[j.estado]));
        for (let i = 0; i < botones.length; i += 2) {
            lista.append(el("li", {}, el("span", { class: "cam-lp-num", texto: (i / 2 + 1) + "." }), botones[i], botones[i + 1] || null));
        }
        function ir(n) {
            pos = Math.max(0, Math.min(js.length, n));
            window.TableroFen.dibujar(tablero, fens[pos], ucis[pos], {});
            tablero.setAttribute("aria-label", "Tablero. " + window.TableroFen.describir(fens[pos]));
            botones.forEach((b, i) => b.setAttribute("aria-current", i === pos - 1 ? "true" : "false"));
            if (pos) botones[pos - 1].scrollIntoView({ block: "nearest" });
            if (!pos) { linea.textContent = "Posición inicial."; return; }
            const j = js[pos - 1];
            linea.textContent = numero(pos - 1) + " " + enEspanol(j.san) + " — " + ESTADO_TXT[j.estado]
                + (j.escrito && j.escrito.length ? ". En la planilla: «" + j.escrito.join("» y «") + "»" : "")
                + (j.alternativa ? ". También podría ser " + enEspanol(j.alternativa) : "") + ".";
        }
        const ctl = (texto, etiqueta, f) => el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "aria-label": etiqueta, onclick: f }, texto);
        const controles = el("div", { class: "cam-lp-controles" },
            ctl("⏮", "Al inicio", () => ir(0)), ctl("◀", "Jugada anterior", () => ir(pos - 1)),
            ctl("▶", "Jugada siguiente", () => ir(pos + 1)), ctl("⏭", "Al final", () => ir(js.length)));
        const zona = el("div", { class: "cam-lp-zona" },
            el("div", { class: "cam-lp-izq" }, el("div", { class: "cine-tablero-marco cam-lp-marco" }, tablero), controles, linea),
            el("div", { class: "cam-lp-der" }, el("p", { class: "cam-lp-leyenda", texto: "Sin marca: leída tal cual · * corregida · ? dudosa (revísala en la foto)" }), lista));
        zona.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); ir(pos - 1); }
            if (e.key === "ArrowRight") { e.preventDefault(); ir(pos + 1); }
        });
        caja.append(zona);

        const pgn = pgnDe(p, datos, ctx);
        // sin tildes ni eñes en el NOMBRE del archivo (algunos navegadores lo cambian por «download»); dentro, tal cual
        const nombre = ("Mesa " + String(p.mesa).padStart(2, "0") + " - Ronda " + p.ronda + " - " + ctx.enfrentamiento(p))
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w .,()-]/g, "") + ".pgn";
        caja.append(el("div", { class: "cam-acciones cam-lp-acciones" },
            el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "bajar-pgn", onclick: () => {
                // el enlace va DENTRO de la ventanita: con el modal abierto, el resto de la página queda inerte
                const a = el("a", { href: URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" })), download: nombre, hidden: true });
                caja.append(a); a.click(); a.remove();
            } }, "Descargar el PGN"),
            el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: async (e) => {
                try { await navigator.clipboard.writeText(pgn); e.currentTarget.textContent = "PGN copiado ✓"; } catch (err) { ctx.avisar("No se pudo copiar: bájalo con «Descargar el PGN».", true); }
            } }, "Copiar el PGN"),
            el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "volver-a-leer", onclick: volverALeer }, "Volver a leer la foto")),
            el("p", { class: "cam-lp-nota", texto: "Leída " + window.HoraCR.fechaHora(datos.leida) + ". Es una ayuda para revisar: nada de esto cambia ningún resultado. «Volver a leer» gasta otra lectura." }));
        ir(js.length);
    }

    /* ctx: { el, ventanita, nombreTorneo, enfrentamiento, avisar } de la página. */
    function abrir(p, ctx) {
        const { el } = ctx;
        const estado = el("p", { class: "cam-lp-estado", role: "status" });
        const caja = el("div", { class: "cam-lp" }, estado);
        const d = ctx.ventanita("Leer la partida · Mesa " + p.mesa + " · " + ctx.enfrentamiento(p), caja);
        d.classList.add("cam-dialogo-ancho");
        const decir = (t) => { estado.textContent = t; };
        const correr = async () => {
            caja.replaceChildren(estado);
            try {
                const datos = await leer(p, decir);
                if (d.open) pintar(caja, p, datos, ctx, correr);
            } catch (e) {
                decir("No se pudo leer: " + (e.message || e));
            }
        };
        const ya = guardado(p);
        if (ya) pintar(caja, p, ya, ctx, correr); else correr();
    }

    window.CentroamericanoLeerPartida = { abrir };
})();
