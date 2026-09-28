/* El PGN de la clase en vivo: la partida, SUS VARIANTES y los comentarios.
 *
 * Antes «💾 Guardar PGN» armaba el archivo rehaciendo la línea principal desde
 * la posición inicial estándar, y eso perdía tres cosas sin dar ningún error:
 *
 *  - la posición de arranque: una clase que empezó con una posición de Táctica
 *    o de un diagrama del curso no se podía rehacer desde el inicio, chess.js
 *    rechazaba en silencio la primera jugada y el PGN salía vacío;
 *  - las variantes que el profesor fue armando (`variant_nodes`), que son
 *    justo el trabajo de la clase;
 *  - lo que el profesor dijo de cada jugada (`game_state.comentarios`).
 *
 * Es una función pura —recibe los datos y devuelve el texto— para que la usen
 * igual el botón de la clase y el verificador, y para que la lea quien quiera
 * sin cargar la página.
 *
 * Forma de los datos:
 *   inicio       FEN de arranque (null o vacío = la posición estándar)
 *   jugadas      la línea principal, en SAN
 *   variantes    filas de variant_nodes: {id, parent_id, root_ply, san}, en el
 *                orden en que se crearon. Una raíz (parent_id null) con
 *                root_ply = n es otra jugada en lugar de jugadas[n].
 *   comentarios  {"e4 e5 Nf3": {nag: 1..6|null, texto: "…"}}: la clave es el
 *                camino de jugadas desde `inicio` hasta la jugada comentada,
 *                así que sirve igual para la línea principal y las variantes.
 */
window.PgnClase = (function () {
    const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    // Los seis signos de siempre, con su número de NAG del estándar PGN.
    const SIGNOS = [
        { nag: 1, signo: "!", nombre: "Buena jugada" },
        { nag: 2, signo: "?", nombre: "Error" },
        { nag: 3, signo: "!!", nombre: "Jugada brillante" },
        { nag: 4, signo: "??", nombre: "Error grave" },
        { nag: 5, signo: "!?", nombre: "Jugada interesante" },
        { nag: 6, signo: "?!", nombre: "Jugada dudosa" },
    ];

    function signoDe(nag) {
        const s = SIGNOS.find((x) => x.nag === nag);
        return s ? s.signo : "";
    }

    function nombreDelSigno(nag) {
        const s = SIGNOS.find((x) => x.nag === nag);
        return s ? s.nombre : "";
    }

    function clave(camino) { return camino.join(" "); }

    // Un comentario vacío (sin signo ni texto) no es un comentario.
    function comentarioDe(comentarios, camino) {
        const c = comentarios && comentarios[clave(camino)];
        if (!c) return null;
        const nag = SIGNOS.some((x) => x.nag === c.nag) ? c.nag : null;
        const texto = String(c.texto || "").trim();
        return nag || texto ? { nag, texto } : null;
    }

    // Dentro de un comentario PGN no puede ir «}», que lo cerraría.
    function textoPgn(t) { return String(t).replace(/[{}]/g, "").replace(/\s+/g, " ").trim(); }

    function valorEncabezado(v) { return String(v == null ? "?" : v).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

    // Cuántas medias jugadas van antes de la primera, según el FEN de arranque.
    function mediasAntes(fen) {
        const p = String(fen || INICIAL).split(" ");
        const n = Math.max(1, parseInt(p[5], 10) || 1);
        return (n - 1) * 2 + (p[1] === "b" ? 1 : 0);
    }

    /* El árbol de la partida. Cada nodo es una jugada con su camino; sus
       `hijos[0]` es la continuación y el resto son las otras jugadas posibles
       en ese mismo lugar (las variantes). El nodo raíz no es una jugada. */
    function arbol(jugadas, variantes) {
        const porPadre = new Map();
        const raicesEn = new Map();
        (variantes || []).forEach((v) => {
            if (!v || !v.san) return;
            if (v.parent_id == null) {
                if (!raicesEn.has(v.root_ply)) raicesEn.set(v.root_ply, []);
                raicesEn.get(v.root_ply).push(v);
            } else {
                if (!porPadre.has(v.parent_id)) porPadre.set(v.parent_id, []);
                porPadre.get(v.parent_id).push(v);
            }
        });
        const vistos = new Set();   // una fila con un ciclo no cuelga la página
        function nodoDeVariante(v, caminoPadre) {
            const camino = caminoPadre.concat([v.san]);
            const nodo = { san: v.san, camino, hijos: [] };
            if (vistos.has(v.id)) return nodo;
            vistos.add(v.id);
            (porPadre.get(v.id) || []).forEach((h) => nodo.hijos.push(nodoDeVariante(h, camino)));
            return nodo;
        }
        const raiz = { san: null, camino: [], hijos: [] };
        let padre = raiz;
        for (let i = 0; i <= jugadas.length; i++) {
            const alternativas = (raicesEn.get(i) || []).map((v) => nodoDeVariante(v, jugadas.slice(0, i)));
            if (i < jugadas.length) {
                const nodo = { san: jugadas[i], camino: jugadas.slice(0, i + 1), hijos: [] };
                padre.hijos.push(nodo);
                alternativas.forEach((a) => padre.hijos.push(a));
                padre = nodo;
            } else {
                // Una variante que nace al FINAL de la partida no tiene a qué
                // ser alternativa: es la continuación.
                alternativas.forEach((a) => padre.hijos.push(a));
            }
        }
        return raiz;
    }

    function jugadasPgn(nodoPadre, base, comentarios) {
        const partes = [];
        function jugada(nodo, conNumero) {
            const abs = base + nodo.camino.length - 1;   // media jugada, desde la 1.
            const num = Math.floor(abs / 2) + 1;
            const blancas = abs % 2 === 0;
            let t = blancas ? num + ". " : (conNumero ? num + "... " : "");
            t += nodo.san;
            const c = comentarioDe(comentarios, nodo.camino);
            if (c && c.nag) t += " $" + c.nag;
            if (c && c.texto) t += " {" + textoPgn(c.texto) + "}";
            partes.push(t);
            return !!(c && c.texto);
        }
        function linea(padre, conNumero) {
            while (padre.hijos.length) {
                const [sigue, ...otras] = padre.hijos;
                const comento = jugada(sigue, conNumero);
                otras.forEach((alt) => {
                    partes.push("(");
                    jugada(alt, true);
                    linea(alt, false);
                    partes.push(")");
                });
                conNumero = comento || otras.length > 0;
                padre = sigue;
            }
        }
        linea(nodoPadre, true);
        return partes.join(" ").replace(/\( /g, "(").replace(/ \)/g, ")");
    }

    // Parte el texto en renglones de hasta 80 caracteres, como pide el estándar.
    function envolver(texto) {
        const out = [];
        let linea = "";
        texto.split(" ").forEach((p) => {
            if (linea && (linea + " " + p).length > 80) { out.push(linea); linea = p; }
            else linea = linea ? linea + " " + p : p;
        });
        if (linea) out.push(linea);
        return out.join("\n");
    }

    function armar(datos) {
        const d = datos || {};
        const jugadas = d.jugadas || [];
        const inicio = d.inicio && d.inicio !== INICIAL ? d.inicio : null;
        // La fecha es la de Costa Rica: a las 7 de la noche en UTC ya es mañana.
        const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()).replace(/-/g, ".");
        const enc = Object.assign({
            Event: "Clase de Ajedrez Integral", Site: "Ajedrez Integral", Date: hoy,
            Round: "-", White: "?", Black: "?", Result: "*",
        }, d.encabezados || {});
        if (inicio) { enc.SetUp = "1"; enc.FEN = inicio; }
        const cab = Object.keys(enc).map((k) => "[" + k + ' "' + valorEncabezado(enc[k]) + '"]').join("\n");
        const cuerpo = jugadasPgn(arbol(jugadas, d.variantes), mediasAntes(inicio), d.comentarios || {});
        return cab + "\n\n" + envolver((cuerpo ? cuerpo + " " : "") + (enc.Result || "*")) + "\n";
    }

    // Cuántas jugadas lleva la partida contando las variantes (para el aviso).
    // Lo que lleva el PGN, para decírselo al profesor: solo cuenta los
    // comentarios de jugadas que siguen en el árbol (uno de una línea que ya se
    // borró no viaja).
    function contar(datos) {
        const d = datos || {};
        let comentarios = 0;
        (function recorrer(n) {
            n.hijos.forEach((h) => { if (comentarioDe(d.comentarios, h.camino)) comentarios++; recorrer(h); });
        })(arbol(d.jugadas || [], d.variantes));
        return { jugadas: (d.jugadas || []).length, variantes: (d.variantes || []).length, comentarios };
    }

    // Las claves de todas las jugadas que siguen en el árbol: un comentario de
    // una línea que ya no existe se descarta al guardar, para que la columna no
    // crezca con restos de otras partidas.
    function caminos(jugadas, variantes) {
        const out = new Set();
        (function recorrer(n) { n.hijos.forEach((h) => { out.add(clave(h.camino)); recorrer(h); }); })(arbol(jugadas || [], variantes));
        return out;
    }

    return { armar, contar, caminos, clave, comentarioDe, signoDe, nombreDelSigno, SIGNOS };
})();
