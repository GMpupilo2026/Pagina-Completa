/* El código de reclamos-tablas.html: pega el PGN, lo revisa
   js/reclamos-tablas.js (ReclamosTablas) y acá se pinta lo que dice.

   Todo pasa en el navegador: la partida no se manda a ningún lado. Las jugadas
   se muestran en algebraica española (o dichas, para quien no ve) con
   ComandosTablero.jugadaParaMostrar, y la posición repetida con el diagrama de
   los artículos (ExampleBoard). Ver «Reclamos de tablas desde el PGN» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const R = window.ReclamosTablas;
    const $ = (id) => document.getElementById(id);
    let analisis = null;

    const EJEMPLO = '[Event "Ejemplo"]\n[White "Blancas"]\n[Black "Negras"]\n[Result "1/2-1/2"]\n\n'
        + "1. e4 e5 2. Cf3 Cc6 3. Ac4 Ac5 4. Cg1 Cb8 5. Cf3 Cc6 6. Cg1 Cb8 7. Cf3 Cc6 1/2-1/2";

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    const jugadaTexto = (j) => j.rotulo + " " + (window.ComandosTablero ? ComandosTablero.jugadaParaMostrar(j.san) : j.san);
    const color = (c) => R.COLOR[c];

    function estado(texto, error) {
        const p = $("rt-estado");
        p.className = "text-sm mt-3" + (error ? " text-red-700 dark:text-red-300 font-semibold" : "");
        p.textContent = texto;
    }

    /* Una fila del resumen: el dato escrito (Sí / No), no solo un color. */
    function fila(titulo, si, detalle) {
        const li = el("li", "rounded-xl border p-4 " + (si
            ? "border-accent-500 bg-accent-50 dark:bg-brand-800"
            : "border-brand-100 dark:border-brand-700"));
        const cab = el("p", "font-semibold text-brand-800 dark:text-white");
        cab.append(el("span", "inline-block min-w-[2.5rem] mr-2 px-2 py-0.5 rounded-full text-xs text-center " + (si
            ? "bg-accent-500 text-brand-900" : "bg-brand-100 text-brand-800 dark:bg-brand-700 dark:text-brand-50"), si ? "Sí" : "No"), titulo);
        li.append(cab, el("p", "text-sm text-brand-600 dark:text-brand-300 mt-1", detalle));
        return li;
    }

    function pintarResumen(a) {
        const t = a.etiquetas;
        const quienes = [t.White, t.Black].filter(Boolean).join(" – ");
        const n = a.jugadas.length;
        $("rt-partida").textContent = (quienes ? quienes + ". " : "") + (n ? "Hasta " + jugadaTexto(a.jugadas[n - 1]) + "." : "Sin jugadas.")
            + (a.espanola ? " Leída en algebraica española." : "");
        const ul = $("rt-resumen");
        ul.textContent = "";
        const r = a.repeticiones;
        ul.appendChild(fila("Triple repetición (art. 9.2)", r.length > 0, r.length
            ? "La primera vez, con " + jugadaTexto(r[0].jugada) + ": la misma posición por tercera vez." + (r.length > 1 ? " En total, " + r.length + " posiciones llegaron a tres veces (abajo, cada una)." : " Abajo, quién podía reclamar.")
            : "Ninguna posición apareció tres veces."));
        const c = a.cincuenta;
        ul.appendChild(fila("50 jugadas sin mover un peón ni capturar (art. 9.3)", !!c, c
            ? "Se completaron con " + jugadaTexto(c.jugada) + (c.desde ? " (sin peón ni captura desde " + jugadaTexto(c.desde) + ")" : "") + ". Desde ahí, quien tenía el turno podía reclamar, mientras no se moviera un peón ni se capturara."
            : "Lo más largo sin mover un peón ni capturar fue " + a.rachaMax.jugadas + (a.rachaMax.jugadas === 1 ? " jugada" : " jugadas") + " de cada uno" + (a.rachaMax.hasta ? ", hasta " + jugadaTexto(a.rachaMax.hasta) : "") + "."));
        const v = a.cincoVeces;
        ul.appendChild(fila("Tablas sin reclamo: la misma posición cinco veces (art. 9.6.1)", !!v, v
            ? "Con " + jugadaTexto(v.jugada) + " la posición apareció por quinta vez: la partida terminó en tablas ahí, aunque nadie reclamara."
            : "Ninguna posición apareció cinco veces."));
        const s = a.setentaYCinco;
        ul.appendChild(fila("Tablas sin reclamo: 75 jugadas sin peón ni captura (art. 9.6.2)", !!s, s
            ? "Con " + jugadaTexto(s.jugada) + " se completaron 75 jugadas de cada uno sin mover un peón ni capturar: la partida terminó en tablas ahí."
            : "No se llegó a 75 jugadas de cada uno sin peón ni captura."));
    }

    function diagrama(fen) {
        const caja = el("div", "w-full max-w-[16rem] shrink-0");
        const tablero = el("div", "example-board");
        caja.appendChild(tablero);
        try { window.ExampleBoard.render(tablero, new Chess(fen)); } catch (e) { /* sin diagrama, queda el texto */ }
        return caja;
    }

    function pintarRepeticiones(a) {
        const ul = $("rt-repeticiones");
        ul.textContent = "";
        $("rt-repeticiones-caja").hidden = !a.repeticiones.length;
        a.repeticiones.forEach((r, i) => {
            const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 md:p-6 flex flex-col sm:flex-row gap-5");
            li.dataset.repeticion = String(i + 1);
            li.appendChild(diagrama(r.fen));
            const txt = el("div", "min-w-0");
            txt.appendChild(el("h3", "font-semibold text-brand-800 dark:text-white", "Por tercera vez con " + jugadaTexto(r.jugada)));
            const donde = el("p", "text-sm text-brand-600 dark:text-brand-300 mt-1");
            donde.textContent = "La misma posición, con " + color(r.jugada.color === "w" ? "b" : "w").toLowerCase() + " al turno: "
                + r.apariciones.map((x) => (x.ply === 0 ? "al empezar" : "después de " + jugadaTexto(x))).join("; ") + ".";
            txt.appendChild(donde);
            txt.appendChild(el("p", "text-sm font-semibold text-brand-800 dark:text-white mt-3", "Podían reclamar las tablas:"));
            const quien = el("ul", "list-disc pl-5 text-sm text-brand-600 dark:text-brand-300 mt-1 space-y-1");
            r.podian.forEach((p) => {
                const cuando = p.cuando.replace(r.jugada.rotulo + " " + r.jugada.san, jugadaTexto(r.jugada));
                quien.appendChild(el("li", "", color(p.color) + ", " + cuando + "."));
            });
            txt.appendChild(quien);
            txt.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-3", "Si quien tenía el turno jugó sin reclamar, perdió ese derecho en ese momento; lo recupera si la posición vuelve a aparecer (art. 9.4)."));
            li.appendChild(txt);
            ul.appendChild(li);
        });
    }

    function revisar() {
        const texto = $("rt-pgn").value;
        const indice = $("rt-elegir-caja").hidden ? 0 : Number($("rt-elegir").value) || 0;
        let a;
        try { a = R.analizar(texto, indice); } catch (e) { a = { error: "No se pudo leer la partida." }; }
        // Varias partidas en el archivo: se elige cuál.
        const lista = R.partidas(texto);
        const sel = $("rt-elegir");
        if (lista.length > 1 && sel.options.length !== lista.length) {
            sel.textContent = "";
            lista.forEach((p, i) => {
                const t = p.match(/\[White\s+"([^"]*)"\][\s\S]*?\[Black\s+"([^"]*)"\]/);
                const o = el("option", "", "Partida " + (i + 1) + (t ? ": " + t[1] + " – " + t[2] : ""));
                o.value = String(i);
                sel.appendChild(o);
            });
        }
        $("rt-elegir-caja").hidden = lista.length < 2;
        if (a.error) {
            analisis = null;
            $("rt-resultado").hidden = true;
            estado(a.error, true);
            return;
        }
        analisis = a;
        estado("");
        pintarResumen(a);
        pintarRepeticiones(a);
        $("rt-veredicto").textContent = "";
        // Por omisión, el reclamo que más se pregunta: la primera repetición, de quien tenía el turno.
        const r = a.repeticiones[0];
        if (r && !$("rt-numero").value) {
            const despues = a.posiciones[r.ply];
            $("rt-numero").value = String(despues.numero);
            $("rt-color").value = despues.turno;
        }
        $("rt-resultado").hidden = false;
    }

    function revisarReclamo(e) {
        e.preventDefault();
        const caja = $("rt-veredicto");
        caja.textContent = "";
        if (!analisis) return;
        const numero = Number($("rt-numero").value);
        if (!Number.isInteger(numero) || numero < 1) {
            caja.appendChild(el("p", "text-sm text-red-700 dark:text-red-300 font-semibold", "Escribe el número de la jugada en que se reclamó."));
            return;
        }
        const v = R.revisarReclamo(analisis, $("rt-tipo").value, numero, $("rt-color").value);
        const div = el("div", "rounded-xl border p-4 " + (v.procede ? "border-accent-500 bg-accent-50 dark:bg-brand-800" : "border-brand-200 dark:border-brand-700"));
        div.dataset.procede = v.procede ? "si" : "no";
        div.appendChild(el("p", "font-semibold text-brand-800 dark:text-white", v.procede ? "El reclamo procedía: tablas." : "El reclamo no procedía."));
        div.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300 mt-1", v.motivo));
        if (!v.procede) div.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-2", "Un reclamo que no procede: el árbitro le suma dos minutos al rival y la partida sigue; si se basaba en una jugada anotada, esa jugada se tiene que hacer (art. 9.5.3)."));
        caja.appendChild(div);
    }

    function abrirArchivo(e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const lector = new FileReader();
        lector.onload = () => {
            $("rt-pgn").value = String(lector.result || "");
            $("rt-elegir").textContent = "";
            $("rt-numero").value = "";
            revisar();
        };
        lector.onerror = () => estado("No se pudo abrir el archivo.", true);
        lector.readAsText(f);
        e.target.value = "";
    }

    $("rt-revisar").addEventListener("click", () => { $("rt-elegir").textContent = ""; $("rt-numero").value = ""; revisar(); });
    $("rt-elegir").addEventListener("change", () => { $("rt-numero").value = ""; revisar(); });
    $("rt-archivo").addEventListener("change", abrirArchivo);
    $("rt-ejemplo").addEventListener("click", () => { $("rt-pgn").value = EJEMPLO; $("rt-elegir").textContent = ""; $("rt-numero").value = ""; revisar(); });
    $("rt-form-reclamo").addEventListener("submit", revisarReclamo);
})();
