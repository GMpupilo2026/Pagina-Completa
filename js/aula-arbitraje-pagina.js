/* Aula de Arbitraje (aula-arbitraje.html): estudiar el reglamento y ponerlo
   en práctica.

   Cinco partes, cada una con su dirección para mandar el enlace ya abierto
   (#estudiar, #ficha-<id>, #practicar-<tipo>, #casos, #caso-<id>,
   #calculadoras, #reloj):
   - Estudiar: las fichas (js/aula-arbitraje/contenido*.js) y, al principio
     de cada número de la revista, su portada con el PDF, que se baja solo
     después de estudiar todas sus fichas, acertar todas sus preguntas y
     resolver todos sus casos.
   - Practicar: preguntas, ajustes de reloj, desempates y normas generados al
     azar (nunca se acaban) y repeticiones analizadas con
     js/reclamos-tablas.js (chess.js), también con una partida propia.
   - Casos: una situación de sala y la decisión. Según el caso, además: el
     reloj de js/aula-arbitraje/reloj.js para dejarlo como debe quedar, la
     secuencia de jugadas de una repetición, la tabla de un torneo para
     calcular los desempates o la lista de rivales para calcular una norma.
   - Calculadoras: desempates (el motor de Pareo Integral), normas
     (js/normas-titulo.js) y rendimiento, cada una con su fórmula a la vista.
   - Reloj: el reloj suelto y la calculadora del método proporcional.

   Las preguntas y los casos con «fen» muestran el tablero; los que traen
   «mate» enseñan, después de contestar, la serie de jugadas legales que
   termina en mate (comprobada por herramientas/verificar-aula-arbitraje.js).

   El avance se guarda solo en este aparato (localStorage), como una
   comodidad: no es una nota ni la ve nadie más. Ver «Aula de Arbitraje» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const D = window.AULA_CONTENIDO, A = window.AulaAjuste, Reloj = window.AulaReloj, AY = window.AulaAyudas;
    const $vista = document.getElementById("aula-vista");
    if (!$vista || !D || !A || !Reloj) return;
    const TT = window.AulaTorneoTexto, AD = window.AulaDesempates, PD = window.PareoDesempates;
    let relojActivo = null;
    let filtroPreguntas = "";

    /* ---------- utilidades ---------- */
    function esc(t) { return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function q(s, el) { return (el || $vista).querySelector(s); }
    function qa(s, el) { return Array.from((el || $vista).querySelectorAll(s)); }
    function azar(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function barajar(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function leerPuntos(t) {
        /* Una cuenta («(2188 + 2405) / 2», «9½ + 1») la resuelven las ayudas de cálculo. */
        if (AY && AY.esCuenta(t)) return AY.evaluar(t);
        let s = String(t).trim().replace(/\s/g, "").replace(",", ".");
        const fr = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
        let extra = 0;
        s = s.replace(/[½¼¾]/g, (c) => { extra += fr[c]; return ""; });
        if (!s && extra) return extra;
        const v = parseFloat(s);
        return isNaN(v) ? null : v + extra;
    }
    // 2.75 → «2¾»; 9.25 → «9¼»; 3 → «3».
    function fraccion(x) {
        if (typeof x !== "number") return String(x);
        const e = Math.floor(x + 1e-9), r = Math.round((x - e) * 100);
        const f = { 25: "¼", 50: "½", 75: "¾" }[r];
        if (r === 0) return String(e);
        return f ? (e ? e + f : f) : String(Math.round(x * 100) / 100).replace(".", ",");
    }
    const ficha = (id) => D.fichas.find((f) => f.id === id);
    function pintar(html) {
        $vista.innerHTML = html;
        pintarDiagramas($vista);
        const h = $vista.querySelector("h2");
        if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }

    /* ---------- tableros ---------- */
    const ES_A_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
    function sanIngles(s) { return s.replace(/^[RDTAC]/, (c) => ES_A_EN[c]).replace(/=([DTAC])/, (m, c) => "=" + ES_A_EN[c]); }
    const EN_A_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
    function espanol(san) { return String(san || "").replace(/^[KQRBN]/, (p) => EN_A_ES[p]).replace(/=([QRBN])/, (m, p) => "=" + EN_A_ES[p]); }
    function jugadasDeSerie(serie) { return String(serie).replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(Boolean); }
    function describir(fen) {
        try { return window.BlindNotation ? window.BlindNotation.positionSentence(new window.Chess(fen)) : ""; } catch (e) { return ""; }
    }
    function diagrama(fen, pie) {
        return '<figure class="aula-diagrama" data-fen="' + esc(fen) + '"><div class="example-board aula-tablero-mini"></div>' +
            '<figcaption>' + (pie ? esc(pie) + " " : "") + '<span class="aula-nota">' + esc(describir(fen)) + "</span></figcaption></figure>";
    }
    function pintarDiagramas(el) {
        qa(".aula-diagrama[data-fen]", el).forEach((f) => {
            const b = f.querySelector(".example-board");
            if (!b || b.childElementCount) return;
            try { window.ExampleBoard.render(b, new window.Chess(f.dataset.fen)); } catch (e) { /* queda la descripción */ }
        });
    }
    /* La serie de jugadas legales que termina en mate, para recorrerla. */
    function visorSerie(cont, fen, serie) {
        const g = new window.Chess(fen);
        const fens = [g.fen()], sans = [];
        for (const s of jugadasDeSerie(serie)) { const m = g.move(sanIngles(s), { sloppy: true }); if (!m) break; fens.push(g.fen()); sans.push(espanol(m.san)); }
        let k = fens.length - 1;
        cont.innerHTML = '<div class="aula-serie"><p><b>Una serie de jugadas legales que termina en mate:</b> ' + esc(serie) + '</p><div class="example-board aula-tablero-mini"></div>' +
            '<div class="aula-navegar"><button type="button" class="aula-btn aula-btn-sec" data-s="0" aria-label="Posición del caso">|◀</button><button type="button" class="aula-btn aula-btn-sec" data-s="-1" aria-label="Jugada anterior">◀</button><button type="button" class="aula-btn aula-btn-sec" data-s="1" aria-label="Jugada siguiente">▶</button><button type="button" class="aula-btn aula-btn-sec" data-s="fin" aria-label="El mate">▶|</button></div>' +
            '<p class="aula-nota" aria-live="polite"></p><p class="aula-nota">No hace falta que el mate sea forzado: basta con que la serie exista (arts. 6.9, 7.5.5 y A.5.3).</p></div>';
        const tab = q(".example-board", cont), rot = q(".aula-serie .aula-nota", cont);
        function ir(n) {
            k = Math.max(0, Math.min(fens.length - 1, n));
            tab.replaceChildren();
            try { window.ExampleBoard.render(tab, new window.Chess(fens[k])); } catch (e) { /* sin diagrama */ }
            rot.textContent = k === 0 ? "La posición del caso." : "Después de " + sans.slice(0, k).join(" ") + (k === fens.length - 1 ? ": mate." : ".");
        }
        qa("[data-s]", cont).forEach((b) => b.addEventListener("click", () => { const v = b.dataset.s; ir(v === "0" ? 0 : v === "fin" ? fens.length - 1 : k + Number(v)); }));
        ir(k);
    }
    function pruebaMaterial(obj, caja) {
        if (obj.mate) { const d = document.createElement("div"); caja.appendChild(d); visorSerie(d, obj.fen, obj.mate.serie); }
        else if (obj.sinMate) caja.insertAdjacentHTML("beforeend", '<p class="aula-nota">Comprobado: con ese material las ' + (obj.sinMate === "w" ? "blancas" : "negras") + " no pueden dar mate con ninguna serie de jugadas legales.</p>");
    }

    /* ---------- avance (solo en este aparato) ---------- */
    const CLAVE = "aula_arbitraje_avance_v1";
    function avance() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }
    function guardar(p) { try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch (e) { /* sin almacenamiento: se practica igual */ } }
    function anotar(tipo, id, valor) { const p = avance(); p[tipo] = p[tipo] || {}; p[tipo][id] = valor; guardar(p); }
    function contar(tipo, ok, conPista) { const p = avance(); p.gen = p.gen || {}; const g = p.gen[tipo] = p.gen[tipo] || { ok: 0, total: 0 }; g.total++; if (ok) g.ok++; if (ok && conPista) g.pista = (g.pista || 0) + 1; guardar(p); return g; }
    function marcador(tipo) { const g = (avance().gen || {})[tipo]; return g ? "Correctos: " + g.ok + " de " + g.total + (g.pista ? " (" + g.pista + " con pista)" : "") : ""; }
    /* Las ayudas de cálculo de un ejercicio (js/aula-arbitraje/ayudas.js): la
       calculadora, las tablas de FIDE y la pista. Hacen las cuentas, no las reglas. */
    const PISTA_RELOJ = '<ol class="aula-pasos"><li><b>Consumido</b> = tiempo de los controles alcanzados + jugadas hechas × incremento − lo que marca el reloj.</li><li><b>Consumido ideal</b> = consumido × jugadas que quedan ÷ jugadas hechas.</li><li><b>Reloj</b> = tiempo de los controles que se alcanzan con las jugadas que quedan + jugadas que quedan × incremento − consumido ideal.</li><li>Al rival del que hizo la ilegal, la sanción del art. 7.5.5 (2 minutos en estándar).</li></ol><p class="aula-nota">Las jugadas que quedan son las completadas antes de la jugada ilegal (art. 7.5.1, Leyes 2023). Hazlo para cada reloj por separado.</p>';
    const PISTA_KOYA = '<ol class="aula-pasos"><li>El límite es el 50 % de los puntos posibles: rondas ÷ 2.</li><li>Marca en la tabla a los rivales que llegaron al límite o lo pasaron.</li><li>El KS de cada empatado es la suma de los puntos que hizo contra esos rivales.</li></ol>';
    const PISTA_NORMA = '<ol class="aula-pasos"><li>Cuentan las partidas jugadas en el tablero; en un suizo se pueden dejar afuera las de después de lograr la norma o las ganadas, mientras queden 9 y la mezcla de rivales (1.4.1e y f).</li><li>El Elo de cada rival: sin Elo, 1400; el más bajo, si está por debajo del piso de la norma, sube al piso, y solo ese (1.4.6).</li><li><b>Ra</b> = suma de los Elo ÷ partidas, redondeado (0,5 hacia arriba) (1.4.7).</li><li><b>%</b> = puntos ÷ partidas × 100, redondeado al entero; busca su <b>dp</b> en la tabla (1.4.9).</li><li><b>Rp</b> = Ra + dp, y compáralo con los mínimos de la norma (1.4.8). Revisa también federaciones y títulos (1.4.3 a 1.4.5).</li></ol>';
    function pistaDesempate(codigos) {
        const P = window.PareoDesempates;
        const de = (c) => { const x = P && P.CATALOGO.find((k) => k.codigo === c); return x ? x.es : AD.nombreDe(c); };
        return '<ol class="aula-pasos">' + codigos.map((c) => "<li><b>" + esc(c) + "</b>: " + esc(de(c)) + "</li>").join("") + '</ol><p class="aula-nota">Calcula cada desempate solo para los que siguen empatados después del anterior (art. 4.2). Las rondas no jugadas cuentan como dicen los arts. 15 y 16 del C.07.</p>';
    }
    const chipPista = (usada) => (usada ? ' <span class="aula-chip aviso">resuelto con pista</span>' : "");
    /* Cada pregunta tiene una clave que no cambia aunque se agregue
       contenido: su ficha y su lugar dentro de la ficha. La primera versión
       guardaba el índice global; se pasa una vez a la clave nueva. */
    const porFicha = {};
    D.preguntas.forEach((p, i) => { const n = porFicha[p.ficha] = (porFicha[p.ficha] || 0) + 1; p.clave = p.ficha + "#" + n; p.idx = i; });
    (function migrar() {
        const p = avance();
        if (!p.preg || p.pregV2) return;
        const nuevo = {};
        Object.keys(p.preg).forEach((k) => { const x = D.preguntas[Number(k)]; if (x && /^\d+$/.test(k)) nuevo[x.clave] = p.preg[k]; else nuevo[k] = p.preg[k]; });
        p.preg = nuevo; p.pregV2 = true; guardar(p);
    })();
    function acertada(p, av) { return !!((av.preg || {})[p.clave]); }
    function casoResuelto(c, av) { const st = (av.casos || {})[c.id]; return st === "optima" || st === "valida"; }

    /* ---------- las revistas: progreso y PDF ---------- */
    function numeroDe(col) { const m = /^revista-(\d+)$/.exec(col.id); return m ? Number(m[1]) : null; }
    const dos = (n) => (n < 10 ? "0" : "") + n;
    function progreso(col, av) {
        const fs = D.fichas.filter((f) => f.coleccion === col.id), ids = new Set(fs.map((f) => f.id));
        const ps = D.preguntas.filter((p) => ids.has(p.ficha)), cs = D.casos.filter((c) => ids.has(c.ficha));
        const r = {
            fichas: [fs.filter((f) => (av.vistas || {})[f.id]).length, fs.length],
            preguntas: [ps.filter((p) => acertada(p, av)).length, ps.length],
            casos: [cs.filter((c) => casoResuelto(c, av)).length, cs.length],
        };
        r.completo = ["fichas", "preguntas", "casos"].every((k) => r[k][0] >= r[k][1]);
        return r;
    }
    function tarjetaPortada(col, av) {
        const n = numeroDe(col), pr = progreso(col, av);
        const fila = (txt, par) => '<li class="' + (par[0] >= par[1] ? "hecho" : "falta") + '"><span aria-hidden="true">' + (par[0] >= par[1] ? "✓" : "○") + "</span> " + txt + ": " + par[0] + " de " + par[1] + '<span class="sr-only">' + (par[0] >= par[1] ? " (completo)" : " (falta)") + "</span></li>";
        const archivo = "descargas/aula-arbitraje/revista-" + dos(n) + ".pdf";
        return '<article class="aula-tarjeta aula-portada" data-revista="' + n + '"><img src="img/aula-arbitraje/portada-' + dos(n) + '.jpg" alt="Portada de la revista Arbitraje de Ajedrez N.º ' + n + '" width="360" height="509" loading="lazy">' +
            '<h4>La revista N.º ' + n + ' en PDF</h4><p>Se habilita cuando completas todo lo de este número:</p><ul class="aula-lista-avance">' +
            fila("Fichas estudiadas", pr.fichas) + fila("Preguntas acertadas", pr.preguntas) + fila("Casos resueltos", pr.casos) + "</ul>" +
            '<div class="aula-pie">' + (pr.completo
                ? '<a class="aula-btn aula-btn-pri" href="' + archivo + '" download="Revista-Arbitraje-de-Ajedrez-' + dos(n) + '-Ajedrez-Integral.pdf"><span aria-hidden="true">⬇ </span>Descargar el PDF</a>'
                : '<span class="aula-btn aula-btn-pri aula-apagado" role="link" aria-disabled="true" tabindex="0">Descargar el PDF</span><span class="aula-chip">Bloqueado</span>') +
            "</div></article>";
    }

    /* ---------- direcciones ---------- */
    function ruta() {
        if (relojActivo) { relojActivo.destruir(); relojActivo = null; }
        const r = (location.hash || "#estudiar").slice(1);
        const parte = r.startsWith("ficha-") ? "estudiar" : r.startsWith("caso-") ? "casos" : r.split("-")[0];
        qa("[data-aula-tab]", document).forEach((a) => {
            if (a.dataset.aulaTab === parte) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
        });
        if (r.startsWith("ficha-")) return vistaFicha(r.slice(6));
        if (r.startsWith("caso-")) return vistaCaso(r.slice(5));
        if (r.startsWith("practicar")) return vistaPracticar(r.slice(10) || "preguntas");
        if (r === "casos") return vistaCasos();
        if (r.startsWith("calculadoras")) return vistaCalculadoras(r.slice(13) || "desempates");
        if (r === "reloj") return vistaReloj();
        return vistaEstudiar();
    }
    window.addEventListener("hashchange", ruta);

    /* ---------- ESTUDIAR ---------- */
    function vistaEstudiar() {
        const p = avance(), gen = p.gen || {};
        const aciertos = D.preguntas.filter((x) => acertada(x, p)).length;
        const casosOk = D.casos.filter((c) => casoResuelto(c, p)).length;
        const generados = ["relojes", "koya", "rep", "desempates", "normas"].reduce((s, k) => s + ((gen[k] || {}).total || 0), 0);
        let html = '<h2 class="aula-titulo">Fichas de estudio</h2><p class="aula-intro">Cada ficha resume un tema del reglamento de FIDE vigente. Cuando termines de leerla, practica con preguntas, ejercicios que se generan al azar y casos de sala. Al completar un número de la revista se habilita su PDF.</p>' +
            '<div class="aula-datos aula-avance"><div class="aula-dato"><span>Preguntas acertadas</span><b>' + aciertos + " de " + D.preguntas.length + '</b></div>' +
            '<div class="aula-dato"><span>Casos resueltos</span><b>' + casosOk + " de " + D.casos.length + '</b></div>' +
            '<div class="aula-dato"><span>Ejercicios generados</span><b>' + generados + "</b></div></div>" +
            '<p class="aula-nota">Tu avance se guarda solo en este aparato.</p>';
        // El taller primero: es lo nuevo y lo más práctico.
        const cols = D.colecciones.filter((c) => c.taller).concat(D.colecciones.filter((c) => !c.taller));
        cols.forEach((c) => {
            html += '<section class="aula-coleccion" aria-label="' + esc(c.titulo) + '"><div class="aula-coleccion-cab"><h3>' + c.titulo + "</h3><span>" + (c.nota || "") + '</span></div><div class="aula-rejilla">';
            if (numeroDe(c)) html += tarjetaPortada(c, p);
            D.fichas.filter((f) => f.coleccion === c.id).forEach((f) => {
                const np = D.preguntas.filter((x) => x.ficha === f.id).length;
                const nc = D.casos.filter((x) => x.ficha === f.id).length;
                const vista = (p.vistas || {})[f.id];
                html += '<article class="aula-tarjeta"><span class="aula-art">' + f.articulos + "</span><h4>" + f.titulo + "</h4><p>" + f.resumen + "</p>" +
                    '<div class="aula-pie"><a class="aula-btn aula-btn-pri" href="#ficha-' + f.id + '">Estudiar</a><span class="aula-chip">' + np + " preguntas</span>" +
                    (nc ? '<span class="aula-chip">' + nc + " casos</span>" : "") + (vista ? '<span class="aula-chip ok">Estudiada</span>' : "") + "</div></article>";
            });
            html += "</div></section>";
        });
        pintar(html);
    }

    function vistaFicha(id) {
        const f = ficha(id);
        if (!f) return vistaEstudiar();
        anotar("vistas", id, true);
        const col = D.colecciones.find((c) => c.id === f.coleccion) || {};
        const np = D.preguntas.filter((x) => x.ficha === id).length;
        const casos = D.casos.filter((x) => x.ficha === id);
        const gen = { relojes: ["practicar-relojes", "Ejercicios de ajuste de relojes"], koya: ["practicar-koya", "Ejercicios de Koya"], repeticion: ["practicar-posiciones", "Ejercicios de posiciones idénticas"],
            "taller-repeticion": ["practicar-posiciones", "Ejercicios de posiciones idénticas"], "taller-desempates": ["practicar-desempates", "Ejercicios de desempates al azar"], "taller-normas": ["practicar-normas", "Ejercicios de normas al azar"] }[id];
        const calc = { "taller-desempates": ["calculadoras-desempates", "Calculadora de desempates"], "taller-normas": ["calculadoras-normas", "Calculadora de normas"] }[id];
        pintar('<p class="aula-eyebrow"><a href="#estudiar">Fichas</a> · ' + (col.titulo || "") + '</p><h2 class="aula-titulo">' + f.titulo + '</h2><p class="aula-intro">' + f.articulos + "</p>" +
            '<div class="aula-ficha"><article class="aula-hoja">' + f.contenido + "</article><aside class=\"aula-lateral\">" +
            '<div class="aula-claves"><h3>Ideas clave</h3><ul>' + f.claves.map((k) => "<li>" + k + "</li>").join("") + "</ul></div>" +
            '<div class="aula-claves"><h3>Ponlo en práctica</h3><div class="aula-columna">' +
            '<a class="aula-btn aula-btn-pri" href="#practicar-preguntas" data-filtro="' + id + '">Preguntas de esta ficha (' + np + ")</a>" +
            (gen ? '<a class="aula-btn aula-btn-sec" href="#' + gen[0] + '">' + gen[1] + "</a>" : "") +
            (calc ? '<a class="aula-btn aula-btn-sec" href="#' + calc[0] + '">' + calc[1] + "</a>" : "") +
            casos.map((c) => '<a class="aula-btn aula-btn-sec" href="#caso-' + c.id + '">Caso: ' + c.titulo + "</a>").join("") +
            "</div></div></aside></div>");
        const a = q("[data-filtro]");
        if (a) a.addEventListener("click", () => { filtroPreguntas = id; });
    }

    /* ---------- PRACTICAR ---------- */
    function vistaPracticar(sub) {
        const subs = [["preguntas", "Preguntas"], ["relojes", "Ajuste de relojes"], ["desempates", "Desempates"], ["koya", "Desempate Koya"], ["normas", "Normas de título"], ["posiciones", "Posiciones idénticas"]];
        if (!subs.some((s) => s[0] === sub)) sub = "preguntas";
        pintar('<h2 class="aula-titulo">Practicar</h2><p class="aula-intro">Las preguntas salen de las fichas; los ejercicios de relojes, desempates, Koya y normas se generan al azar cada vez, así que nunca se acaban.</p>' +
            '<div class="aula-subtabs" role="group" aria-label="Tipo de ejercicio">' + subs.map((s) => '<button type="button" data-sub="' + s[0] + '" aria-pressed="' + (s[0] === sub) + '">' + s[1] + "</button>").join("") +
            '</div><div id="aula-zona"></div>');
        qa("[data-sub]").forEach((b) => b.addEventListener("click", () => { location.hash = "practicar-" + b.dataset.sub; }));
        ({ preguntas: practicaPreguntas, relojes: practicaRelojes, desempates: practicaDesempates, koya: practicaKoya, normas: practicaNormas, posiciones: practicaPosiciones })[sub](q("#aula-zona"));
    }

    function elegirOpcion(caja, correcta, elegida) {
        qa(".aula-opciones button", caja).forEach((x) => {
            x.disabled = true;
            const i = Number(x.dataset.i);
            if (i === correcta) { x.classList.add("ok"); x.insertAdjacentText("afterbegin", "✓ "); }
            else if (i === elegida) { x.classList.add("mal"); x.insertAdjacentText("afterbegin", "✗ "); }
        });
    }

    function practicaPreguntas(z) {
        z.innerHTML = '<div class="aula-panel-ej"><div class="aula-fila-ctrl"><label for="aula-filtro" class="aula-en-linea">Ficha <select id="aula-filtro"><option value="">Todas</option>' +
            D.fichas.map((f) => '<option value="' + f.id + '"' + (f.id === filtroPreguntas ? " selected" : "") + ">" + f.titulo + "</option>").join("") +
            '</select></label></div><div id="aula-preg" class="aula-columna"></div></div>';
        const caja = q("#aula-preg", z);
        function arrancar() {
            const orden = barajar(D.preguntas.filter((p) => !filtroPreguntas || p.ficha === filtroPreguntas));
            let pos = 0, buenas = 0;
            function siguiente() {
                if (pos >= orden.length) {
                    caja.innerHTML = '<h3>Terminaste</h3><p class="aula-enunciado">Acertaste ' + buenas + " de " + orden.length + '.</p><div><button type="button" class="aula-btn aula-btn-pri" id="aula-otra">Repetir en otro orden</button></div>';
                    q("#aula-otra", caja).addEventListener("click", arrancar);
                    return;
                }
                const p = orden[pos], f = ficha(p.ficha);
                caja.innerHTML = '<div class="aula-fila-ctrl"><span class="aula-chip">' + (f ? f.titulo : "") + '</span><span class="aula-marcador">Pregunta ' + (pos + 1) + " de " + orden.length + " · aciertos: " + buenas + "</span></div>" +
                    (p.fen ? diagrama(p.fen, p.pie) : "") +
                    '<p class="aula-enunciado">' + p.texto + '</p><div class="aula-opciones">' + p.opciones.map((o, i) => '<button type="button" data-i="' + i + '">' + o + "</button>").join("") + '</div><div id="aula-fb" aria-live="polite"></div>';
                pintarDiagramas(caja);
                qa(".aula-opciones button", caja).forEach((b) => b.addEventListener("click", () => {
                    const i = Number(b.dataset.i), ok = i === p.correcta;
                    if (ok) buenas++;
                    if (ok || !acertada(p, avance())) anotar("preg", p.clave, ok);
                    elegirOpcion(caja, p.correcta, i);
                    const fb = q("#aula-fb", caja);
                    fb.innerHTML = '<div class="aula-fb ' + (ok ? "ok" : "mal") + '"><p><b>' + (ok ? "Correcto." : "No es correcto.") + "</b> " + p.explicacion + "</p></div>";
                    if (p.fen) pruebaMaterial(p, q(".aula-fb", fb));
                    fb.insertAdjacentHTML("beforeend", '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-sig">Siguiente</button></div>');
                    const sig = q("#aula-sig", caja);
                    sig.addEventListener("click", () => { pos++; siguiente(); });
                    sig.focus();
                }));
            }
            siguiente();
        }
        q("#aula-filtro", z).addEventListener("change", (e) => { filtroPreguntas = e.target.value; arrancar(); });
        arrancar();
    }

    function pasosAjuste(o, r) {
        const nom = { w: "Blancas", b: "Negras" };
        return ["w", "b"].map((l) => {
            const x = r[l], inc = o.inc;
            return "<li><b>" + nom[l] + ":</b> consumido = " + x.baseN + (inc ? " + " + x.n + " × " + inc + " s" : "") + " − " + A.minutos(x.reloj) + " = <b>" + A.minutos(x.cons) + "</b>; " +
                "ideal = " + A.minutos(x.cons) + " × " + x.k + " ÷ " + x.n + " = <b>" + A.minutos(x.ideal) + "</b>; " +
                "reloj = " + x.baseK + (inc ? " + " + x.k + " × " + inc + " s" : "") + " − " + A.minutos(x.ideal) + " = " + A.minutos(x.prop) +
                (x.sancion ? " + " + x.sancion + ":00 de sanción" : "") + " → <b>" + A.minutos(x.final) + "</b>" +
                (x.baseK < x.baseN ? ' <span class="aula-chip aviso">vuelve a antes del control: sale el 2.º periodo</span>' : "") + "</li>";
        }).join("");
    }

    function practicaRelojes(z) {
        z.innerHTML = '<div class="aula-panel-ej"><div class="aula-fila-ctrl"><label for="aula-ritmo" class="aula-en-linea">Ritmo <select id="aula-ritmo"><option value="mix">Al azar</option><option value="clasico-sin">2 h/40 + 1 h (sin incremento)</option><option value="clasico-inc">90/40 + 30 + 30 s</option><option value="60-30">60 min + 30 s</option></select></label><span class="aula-marcador" id="aula-mc">' + marcador("relojes") + '</span></div><div id="aula-ej" class="aula-columna"></div></div>';
        function nuevo() {
            let key = q("#aula-ritmo", z).value;
            if (key === "mix") key = ["clasico-sin", "clasico-inc", "60-30"][azar(0, 2)];
            const R = Reloj.RITMOS[key];
            const p1 = R.periodos[0].min, pj = R.periodos[0].jugadas || 0, p2 = R.periodos[1] ? R.periodos[1].min : 0, inc = R.inc;
            const nw = azar(44, 62), ultimasNegras = Math.random() < 0.5, nb = ultimasNegras ? nw : nw - 1;
            const quien = Math.random() < 0.5 ? "w" : "b";
            const maxK = quien === "w" ? nw : nb;
            const k = azar(Math.max(30, maxK - 14), maxK - 1);
            const { lw, lb } = A.jugadasQueQuedan(quien, k);
            // Un ritmo de juego creíble: nadie se queda sin tiempo antes del control.
            const tope = pj ? p1 / pj : p1 / 60;
            const consumo = (n) => Math.round(n * tope * (0.45 + Math.random() * 0.45) * 60) / 60;
            const base = (n) => p1 + (pj && n >= pj ? p2 : 0);
            const w = Math.round((base(nw) + nw * inc / 60 - consumo(nw)) * 60) * 1000;
            const b = Math.round((base(nb) + nb * inc / 60 - consumo(nb)) * 60) * 1000;
            const o = { p1, pj, p2, inc, w, b, nw, nb, lw, lb, sancion: { lado: quien === "w" ? "b" : "w", min: 2 } };
            const r = A.calcularAjuste(o);
            const ew = Math.round(r.w.final * 60) * 1000, eb = Math.round(r.b.final * 60) * 1000;
            q("#aula-ej", z).innerHTML =
                "<h3>Ajuste después de una jugada ilegal</h3>" +
                '<p class="aula-enunciado">Ritmo <b>' + R.nombre + "</b>. La última jugada fue la <b>" + (ultimasNegras ? nb + "…" : nw + ".") + "</b> (" + (ultimasNegras ? "negras" : "blancas") + "). Se comprueba que las <b>" + (quien === "w" ? "blancas" : "negras") + "</b> hicieron una jugada ilegal en la jugada <b>" + k + "</b> (la primera de la partida) y se vuelve a la posición anterior. Aplica el <b>método proporcional</b> y la sanción.</p>" +
                '<div class="aula-datos"><div class="aula-dato"><span>Reloj de las blancas</span><b>' + A.tiempo(w) + '</b></div><div class="aula-dato"><span>Reloj de las negras</span><b>' + A.tiempo(b) + "</b></div>" +
                '<div class="aula-dato"><span>Jugadas completadas</span><b>' + nw + " / " + nb + '</b></div><div class="aula-dato"><span>Incremento</span><b>' + (inc ? inc + " s" : "sin incremento") + "</b></div></div>" +
                '<div class="aula-entradas"><label for="aula-iw">Reloj de las blancas después del ajuste<input id="aula-iw" placeholder="h:mm:ss" inputmode="numeric" autocomplete="off"></label>' +
                '<label for="aula-ib">Reloj de las negras después del ajuste<input id="aula-ib" placeholder="h:mm:ss" inputmode="numeric" autocomplete="off"></label>' +
                '<label for="aula-ijw">Jugadas completadas de las blancas<input id="aula-ijw" type="number" min="0"></label><label for="aula-ijb">Jugadas completadas de las negras<input id="aula-ijb" type="number" min="0"></label></div>' +
                '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-comp">Comprobar</button><button type="button" class="aula-btn aula-btn-sec" id="aula-nuevo">Otro ejercicio</button><span class="aula-nota">Se acepta una diferencia de hasta 30 s.</span></div><div id="aula-fb" aria-live="polite"></div>';
            q("#aula-nuevo", z).addEventListener("click", nuevo);
            const ayuda = AY ? AY.barra(q("#aula-ej", z), { pista: PISTA_RELOJ, antes: ".aula-entradas" }) : { conPista: () => false };
            q("#aula-comp", z).addEventListener("click", () => {
                const uw = A.leerTiempo(q("#aula-iw", z).value), ub = A.leerTiempo(q("#aula-ib", z).value);
                const ujw = Number(q("#aula-ijw", z).value), ujb = Number(q("#aula-ijb", z).value);
                if (uw == null || ub == null) { q("#aula-fb", z).innerHTML = '<div class="aula-fb aviso"><p>Escribe los dos tiempos como h:mm:ss (por ejemplo 0:52:32).</p></div>'; return; }
                const okT = Math.abs(uw - ew) <= 30000 && Math.abs(ub - eb) <= 30000, okJ = ujw === lw && ujb === lb;
                contar("relojes", okT && okJ, ayuda.conPista());
                q("#aula-mc", z).textContent = marcador("relojes");
                const titulo = okT && okJ ? "Correcto." : okT ? "Los tiempos están bien; revisa las jugadas completadas." : okJ ? "Las jugadas están bien, pero los tiempos no coinciden." : "No coincide.";
                q("#aula-fb", z).innerHTML = '<div class="aula-fb ' + (okT && okJ ? "ok" : okT || okJ ? "aviso" : "mal") + '"><p><b>' + titulo + "</b>" + chipPista(ayuda.conPista()) + " La solución: blancas <b>" + A.tiempo(ew) + "</b>, negras <b>" + A.tiempo(eb) + "</b>; jugadas completadas " + lw + " / " + lb + "; juegan las " + (quien === "w" ? "blancas" : "negras") + ".</p>" +
                    '<ol class="aula-pasos">' + pasosAjuste(o, r) + "</ol>" +
                    '<p class="aula-nota">Con la variante de horario (si las bases la prevén): blancas ' + A.minutos(r.w.horario) + ", negras " + A.minutos(r.b.horario) + " (" + A.minutos(r.dif) + " para cada uno).</p></div>";
            });
        }
        q("#aula-ritmo", z).addEventListener("change", nuevo);
        nuevo();
    }

    const NOMBRES = ["Herrera", "Kovács", "Salinas", "Mendoza", "Okafor", "Varga", "Lindqvist", "Torres", "Ibáñez", "Novak", "Rossi", "Tanaka"];
    function practicaKoya(z) {
        z.innerHTML = '<div class="aula-panel-ej"><div class="aula-fila-ctrl"><label for="aula-nj" class="aula-en-linea">Jugadores <select id="aula-nj"><option>6</option><option>8</option><option selected>10</option></select></label><span class="aula-marcador" id="aula-mc">' + marcador("koya") + '</span></div><div id="aula-ej" class="aula-columna"></div></div>';
        function nuevo() {
            const n = Number(q("#aula-nj", z).value);
            let m, pts, grupo = null, intentos = 0;
            do {
                m = Array.from({ length: n }, () => Array(n).fill(null));
                for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
                    const x = Math.random(), r = x < 0.3 ? 1 : x < 0.72 ? 0.5 : 0;
                    m[i][j] = r; m[j][i] = 1 - r;
                }
                pts = A.puntos(m);
                const porPts = {};
                pts.forEach((p, i) => { (porPts[p] = porPts[p] || []).push(i); });
                const claves = Object.keys(porPts).map(Number).sort((a, b) => b - a);
                for (let c = 0; c < claves.length - 1 && !grupo; c++) if (porPts[claves[c]].length >= 2 && porPts[claves[c]].length <= 4) grupo = porPts[claves[c]];
            } while (!grupo && ++intentos < 300);
            const orden = pts.map((_, i) => i).sort((a, b) => pts[b] - pts[a] || a - b);
            const max = n - 1, lim = max / 2;
            const nombres = barajar(NOMBRES).slice(0, n);
            const tabla = '<div class="aula-tabla"><table class="aula-cruzada"><caption class="sr-only">Tabla cruzada del torneo</caption><thead><tr><th scope="col">N.º</th><th scope="col">Jugador</th>' + orden.map((_, c) => '<th scope="col">' + (c + 1) + "</th>").join("") + '<th scope="col">Pts</th></tr></thead><tbody>' +
                orden.map((i, fila) => '<tr class="' + (grupo.includes(i) ? "emp" : "") + '"><td>' + (fila + 1) + '</td><th scope="row" class="nm">' + nombres[i] + (grupo.includes(i) ? " <span class=\"sr-only\">(empatado)</span>" : "") + "</th>" +
                    orden.map((j) => (i === j ? '<td class="x"><span class="sr-only">—</span></td>' : "<td>" + A.medio(m[i][j]) + "</td>")).join("") + "<td><b>" + A.medio(pts[i]) + "</b></td></tr>").join("") +
                "</tbody></table></div>";
            q("#aula-ej", z).innerHTML = "<h3>Calcula el Koya de los empatados</h3>" +
                '<p class="aula-enunciado">Todos contra todos de ' + n + " jugadores a " + max + " rondas. Empatados con <b>" + A.medio(pts[grupo[0]]) + "</b> puntos: " + grupo.map((i) => "<b>" + nombres[i] + "</b>").join(", ") + ". Calcula el KS de cada uno.</p>" +
                '<p class="aula-nota">Las columnas siguen el orden de la clasificación. Identificar qué rivales cuentan es parte del ejercicio; al comprobar se marcan en la tabla.</p>' + tabla +
                '<div class="aula-entradas">' + grupo.map((i, c) => '<label for="aula-k' + c + '">KS de ' + nombres[i] + '<input id="aula-k' + c + '" inputmode="decimal" placeholder="por ejemplo 2½ o 1 + ½ + 1" autocomplete="off" data-calc></label>').join("") + "</div>" +
                '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-comp">Comprobar</button><button type="button" class="aula-btn aula-btn-sec" id="aula-nuevo">Otro torneo</button></div><div id="aula-fb" aria-live="polite"></div>';
            q("#aula-nuevo", z).addEventListener("click", nuevo);
            const ayuda = AY ? AY.barra(q("#aula-ej", z), { pista: PISTA_KOYA, antes: ".aula-entradas" }) : { conPista: () => false };
            q("#aula-comp", z).addEventListener("click", () => {
                let todo = true;
                const filas = grupo.map((i, c) => {
                    const v = leerPuntos(q("#aula-k" + c, z).value), real = A.koya(m, i), ok = v !== null && Math.abs(v - real) < 1e-9;
                    if (!ok) todo = false;
                    const det = [];
                    for (let j = 0; j < n; j++) if (j !== i && pts[j] >= lim) det.push(A.medio(m[i][j]) + " contra " + nombres[j]);
                    return "<li><b>" + nombres[i] + "</b>: " + det.join(" + ") + " = <b>" + A.medio(real) + "</b> " + (ok ? '<span class="aula-chip ok">bien</span>' : '<span class="aula-chip mal">pusiste: ' + (v === null ? "nada" : A.medio(v)) + "</span>") + "</li>";
                }).join("");
                contar("koya", todo, ayuda.conPista());
                q("#aula-mc", z).textContent = marcador("koya");
                const ks = (i) => A.koya(m, i);
                const porKs = grupo.slice().sort((a, b) => ks(b) - ks(a));
                const siguen = porKs.filter((i) => porKs.some((j) => j !== i && ks(j) === ks(i)));
                q("#aula-fb", z).innerHTML = '<div class="aula-fb ' + (todo ? "ok" : "mal") + '"><p><b>' + (todo ? "Correcto." : "Revisa los valores marcados.") + "</b>" + chipPista(ayuda.conPista()) + " Límite: el 50 % de " + max + " = <b>" + A.medio(lim) + "</b> puntos. Cuentan los rivales con " + A.medio(lim) + " o más (marcados en la tabla).</p><ol class=\"aula-pasos\">" + filas + "</ol>" +
                    "<p>Orden por Koya: " + porKs.map((i) => nombres[i] + " (" + A.medio(ks(i)) + ")").join(" › ") + "." + (siguen.length ? " Siguen empatados " + siguen.map((i) => nombres[i]).join(" y ") + ": se aplica el siguiente desempate de las bases solo a ellos (art. 4.2)." : "") + "</p></div>";
                const t = q(".aula-cruzada", z);
                qa("thead th", t).forEach((th, c) => { if (c >= 2 && c < 2 + n && pts[orden[c - 2]] >= lim) { th.classList.add("top"); th.insertAdjacentHTML("beforeend", '<span class="sr-only"> (cuenta)</span>'); } });
                qa("tbody tr", t).forEach((tr) => Array.from(tr.children).forEach((td, c) => { if (c >= 2 && c < 2 + n && pts[orden[c - 2]] >= lim && !td.classList.contains("x")) td.classList.add("top"); }));
            });
        }
        q("#aula-nj", z).addEventListener("change", nuevo);
        nuevo();
    }

    /* ---------- desempates: tabla, pasos y explicación ---------- */
    function tablaTorneo(t, nombres, resaltar) {
        const num = new Map(t.numeracion.map((id, i) => [id, i + 1]));
        const P = window.PareoTorneo;
        const celda = (r, id) => {
            const s = P.situacion(t, r, id);
            if (s.tipo === "bye") return "bye (+)";
            if (s.tipo === "ausente") return s.codigo === "H" ? "bye ½" : s.codigo === "F" ? "bye 1" : "– (0)";
            const res = s.tipo === "incomparecencia" ? (s.codigo === "+" ? "+" : "−") : s.codigo === "=" ? "½" : s.codigo;
            return num.get(s.rival) + (s.color === "w" ? "b" : "n") + " " + res;
        };
        const pts = (id) => P.puntos(t, id);
        return '<div class="aula-tabla"><table class="aula-cruzada aula-torneo"><caption class="sr-only">Tabla del torneo: en cada ronda, el número del rival, el color (b blancas, n negras) y el resultado</caption><thead><tr><th scope="col">N.º</th><th scope="col">Jugador</th><th scope="col">Elo</th>' +
            t.rondas.map((_, r) => '<th scope="col">R' + (r + 1) + "</th>").join("") + '<th scope="col">Pts</th></tr></thead><tbody>' +
            t.numeracion.map((id) => '<tr class="' + (resaltar && resaltar.includes(id) ? "emp" : "") + '"><td>' + num.get(id) + '</td><th scope="row" class="nm">' + esc(nombres[id]) + (resaltar && resaltar.includes(id) ? ' <span class="sr-only">(empatado)</span>' : "") + "</th><td>" + (t.jugadores.find((j) => j.id === id).elo || "—") + "</td>" +
                t.rondas.map((_, r) => "<td>" + celda(r, id) + "</td>").join("") + "<td><b>" + fraccion(pts(id)) + "</b></td></tr>").join("") +
            "</tbody></table></div>";
    }
    function explicacionDesempate(t, nombres, id, codigo, grupo) {
        if (codigo === "DE") {
            const filas = grupo.filter((x) => x !== id).map((r) => {
                const e = []; t.rondas.forEach((R, k) => { const s = window.PareoTorneo.situacion(t, k, id); if (s.rival === r) e.push({ k, s }); });
                if (!e.length) return "<li>Contra " + esc(nombres[r]) + ": no jugaron.</li>";
                return "<li>Contra " + esc(nombres[r]) + ": " + e.map(({ k, s }) => "ronda " + (k + 1) + ", " + (s.tipo === "partida" ? (s.codigo === "=" ? "½" : s.codigo) : (s.codigo === "+" ? "ganó por incomparecencia (no cuenta en un suizo)" : "perdió por incomparecencia (no cuenta en un suizo)"))).join("; ") + ".</li>";
            }).join("");
            return '<ul class="aula-pasos">' + filas + "</ul>";
        }
        const g = PD.explicar(t, id, codigo);
        if (!g) return "";
        if (g.tipo === "formula") return '<ul class="aula-pasos">' + g.partes.map((p) => "<li>" + esc(p.etiqueta) + ": <b>" + esc(String(p.valor)) + "</b></li>").join("") + "</ul>" + (g.nota ? '<p class="aula-nota">' + esc(g.nota) + "</p>" : "");
        return '<div class="aula-tabla"><table><thead><tr><th scope="col">Ronda</th><th scope="col">Rival</th><th scope="col">Resultado</th><th scope="col">Valor</th></tr></thead><tbody>' +
            g.filas.map((f) => '<tr class="' + (f.incluido ? "" : "cortado") + '"><td>' + f.ronda + "</td><td>" + (f.rivalId ? esc(nombres[f.rivalId]) : "—") + "</td><td>" + esc(f.resultado) + "</td><td>" + esc(fraccion(f.valor)) + (f.incluido ? "" : ' <span class="aula-chip aviso">no cuenta</span>') + (f.motivo ? ' <span class="aula-nota">' + esc(f.motivo) + "</span>" : "") + "</td></tr>").join("") +
            "</tbody></table></div><p>Total: <b>" + esc(fraccion(g.total)) + "</b>" + (g.promedio ? " (promedio)" : "") + ".</p>" + (g.nota ? '<p class="aula-nota">' + esc(g.nota) + "</p>" : "");
    }
    function ordenTexto(orden, nombres) { return orden.map((p) => p.map((id) => nombres[id]).join(" = ")).join(" › "); }

    /* Un ejercicio de desempate completo (casos y práctica): pide los
       valores de cada paso y el orden final, corrige y explica. */
    function ejercicioDesempate(cont, t, nombres, bases, alTerminar) {
        const g = AD.grupoEmpatado(t);
        if (!g) { cont.innerHTML = '<p class="aula-nota">En este torneo no hay empates.</p>'; return; }
        const r = AD.desempatar(t, g.ids, bases);
        const plano = r.orden.flat();
        cont.innerHTML = '<p class="aula-enunciado">Empatados con <b>' + fraccion(g.puntos) + "</b> puntos: " + g.ids.map((id) => "<b>" + esc(nombres[id]) + "</b>").join(", ") + ". Bases: " + bases.map((c, i) => (i + 1) + ") <b>" + c + "</b> (" + AD.nombreDe(c) + ")").join(", ") + ".</p>" +
            tablaTorneo(t, nombres, g.ids) +
            '<h3 class="aula-sub">1. Calcula</h3><p class="aula-nota">Calcula cada desempate solo para los que siguen empatados (art. 4.2). Escribe las fracciones como 9½ o 9,25.</p>' +
            r.pasos.map((p, k) => '<fieldset class="aula-paso-calc"><legend>' + p.codigo + " · " + p.nombre + "</legend><div class=\"aula-entradas\">" +
                p.grupo.map((id) => '<label for="aula-d' + k + "-" + id + '">' + esc(nombres[id]) + '<input id="aula-d' + k + "-" + id + '" inputmode="decimal" autocomplete="off" data-calc></label>').join("") + "</div></fieldset>").join("") +
            '<h3 class="aula-sub">2. Decide el orden</h3><div class="aula-entradas">' +
            plano.map((_, k) => '<label for="aula-o' + k + '">' + (k + 1) + '.º lugar del grupo<select id="aula-o' + k + '"><option value="">Elige…</option>' + g.ids.map((id) => '<option value="' + id + '">' + esc(nombres[id]) + "</option>").join("") + "</select></label>").join("") +
            '</div><div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" data-comprobar>Comprobar</button></div><div class="aula-fb-zona" aria-live="polite"></div>';
        const ayuda = AY ? AY.barra(cont, { tablas: [{ tipo: "desempates", codigos: bases }], pista: pistaDesempate(bases), antes: ".aula-sub" }) : { conPista: () => false };
        q("[data-comprobar]", cont).addEventListener("click", () => {
            let okVal = true;
            const lineas = r.pasos.map((p, k) => {
                const filas = p.grupo.map((id) => {
                    const v = leerPuntos(q("#aula-d" + k + "-" + id, cont).value), real = p.valores[id];
                    const ok = v !== null && Math.abs(v - real) < 0.01;
                    if (!ok) okVal = false;
                    return "<li><b>" + esc(nombres[id]) + "</b>: " + fraccion(real) + " " + (ok ? '<span class="aula-chip ok">bien</span>' : '<span class="aula-chip mal">pusiste: ' + (v === null ? "nada" : esc(fraccion(v))) + "</span>") +
                        '<details class="aula-detalle"><summary>De dónde sale</summary>' + explicacionDesempate(t, nombres, id, p.codigo, p.grupo) + "</details></li>";
                }).join("");
                return "<p><b>" + p.codigo + "</b> (" + p.nombre + ") para " + p.grupo.map((id) => esc(nombres[id])).join(", ") + ":</p><ul class=\"aula-pasos\">" + filas + "</ul>" +
                    "<p class=\"aula-nota\">Resultado: " + ordenTexto(p.partes, nombres) + (p.partes.some((x) => x.length > 1) ? " (los que quedan iguales pasan al siguiente desempate)." : ".") + "</p>";
            }).join("");
            const elegido = plano.map((_, k) => q("#aula-o" + k, cont).value);
            // Un puesto compartido (empate que las bases no rompen) acepta cualquier orden dentro.
            let pos = 0, okOrden = true;
            r.orden.forEach((p) => { const tramo = elegido.slice(pos, pos + p.length); if (!p.every((id) => tramo.includes(id))) okOrden = false; pos += p.length; });
            const ok = okVal && okOrden;
            const sinRomper = r.orden.some((p) => p.length > 1);
            q(".aula-fb-zona", cont).innerHTML = '<div class="aula-fb ' + (ok ? "ok" : okOrden || okVal ? "aviso" : "mal") + '"><p><b>' + (ok ? "Correcto." : okOrden ? "El orden está bien; revisa los valores marcados." : okVal ? "Los valores están bien, pero el orden no." : "Revisa los valores y el orden.") + "</b>" + chipPista(ayuda.conPista()) + " Orden final: <b>" + ordenTexto(r.orden, nombres) + "</b>." +
                (sinRomper ? " Las bases no rompen todo el empate: queda el sorteo (art. 4.2), salvo que las bases digan que se comparte el puesto." : "") + "</p>" + lineas + "</div>";
            if (alTerminar) alTerminar(ok, ayuda.conPista());
        });
    }

    function practicaDesempates(z) {
        const SIST = [["azar", "Al azar"], ["BH", "Buchholz (BH)"], ["BH-C1", "Buchholz sin el peor (BH-C1)"], ["BH-M1", "Buchholz mediano (BH-M1)"], ["SB", "Sonneborn-Berger (SB)"], ["DE", "Encuentro directo (DE)"], ["PS", "Progresivo (PS)"], ["WIN", "Victorias (WIN)"], ["WON", "Ganadas en el tablero (WON)"], ["BPG", "Partidas con negras (BPG)"], ["BWG", "Ganadas con negras (BWG)"], ["KS", "Koya (KS)"], ["ARO", "Elo medio de los rivales (ARO)"], ["TPR", "Rendimiento (TPR)"]];
        z.innerHTML = '<div class="aula-panel-ej"><div class="aula-fila-ctrl"><label for="aula-sis" class="aula-en-linea">Desempate <select id="aula-sis">' + SIST.map((s) => '<option value="' + s[0] + '">' + s[1] + "</option>").join("") + '</select></label><span class="aula-marcador" id="aula-mc">' + marcador("desempates") + '</span></div><div id="aula-ej" class="aula-columna"></div><div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-sec" id="aula-nuevo">Otro torneo</button></div></div>';
        function nuevo() {
            let cod = q("#aula-sis", z).value;
            if (cod === "azar") cod = SIST[azar(1, SIST.length - 1)][0];
            let t, g, intentos = 0, r;
            do {
                const todos = cod === "KS" || (!/^BH/.test(cod) && Math.random() < 0.3);
                t = todos ? AD.generarTodos({ jugadores: [6, 8][azar(0, 1)] }) : AD.generarSuizo({ jugadores: azar(8, 10), rondas: azar(5, 6), byesPedidos: Math.random() < 0.4, incomparecencias: cod === "WIN" || cod === "WON" });
                g = AD.grupoEmpatado(t);
                r = g && AD.desempatar(t, g.ids, [cod]);
            } while ((!g || g.ids.length > 4 || r.orden.length < 2) && ++intentos < 120);
            const nombres = {}; t.jugadores.forEach((j) => { nombres[j.id] = j.nombre; });
            const zona = q("#aula-ej", z);
            zona.innerHTML = "<h3>" + AD.nombreDe(cod) + " (" + cod + ")</h3><p class=\"aula-nota\">" + (t.sistema === "todos" ? "Todos contra todos" : "Suizo") + " de " + t.jugadores.length + " jugadores a " + t.rondas.length + " rondas. La fórmula está en la ficha «Los desempates de FIDE».</p><div></div>";
            ejercicioDesempate(zona.lastElementChild, t, nombres, [cod], (ok, conPista) => { contar("desempates", ok, conPista); q("#aula-mc", z).textContent = marcador("desempates"); });
        }
        q("#aula-sis", z).addEventListener("change", nuevo);
        q("#aula-nuevo", z).addEventListener("click", nuevo);
        nuevo();
    }

    /* ---------- normas ---------- */
    const TITULO_ES = { GM: "Gran Maestro (GM)", IM: "Maestro Internacional (MI)", WGM: "Gran Maestra Femenina (WGM)", WIM: "Maestra Internacional Femenina (WIM)" };
    function partidasDe(rivales) {
        return rivales.map((l, i) => {
            const [nombre, titulo, fed, elo, res] = l.split("|").map((x) => x.trim());
            const forf = res === "+" || res === "-";
            return { ronda: i + 1, puntos: res === "1" || res === "+" ? 1 : res === "½" || res === "=" ? 0.5 : 0, jugada: !forf, rival: { nombre, titulo: (titulo || "").toUpperCase(), fed: (fed || "").toUpperCase(), elo: Number(elo) || 0 } };
        });
    }
    function tablaRivales(rivales) {
        return '<div class="aula-tabla"><table><thead><tr><th scope="col">Ronda</th><th scope="col">Rival</th><th scope="col">Título</th><th scope="col">Fed.</th><th scope="col">Elo</th><th scope="col">Resultado</th></tr></thead><tbody>' +
            partidasDe(rivales).map((p) => "<tr><td>" + p.ronda + "</td><td>" + esc(p.rival.nombre) + "</td><td>" + (esc(p.rival.titulo) || "—") + "</td><td>" + esc(p.rival.fed) + "</td><td>" + (p.rival.elo || "sin Elo") + "</td><td>" + (p.jugada ? fraccion(p.puntos) : p.puntos ? "+ (incomparecencia)" : "− (incomparecencia)") + "</td></tr>").join("") +
            "</tbody></table></div>";
    }
    function evaluarNorma(jugador, rivales, sistema) {
        return window.NormasTitulo.evaluar(Object.assign({}, jugador, { partidas: partidasDe(rivales) }), { sistema: sistema || "suizo", rondas: rivales.length });
    }
    function chequeosHTML(t) {
        const m = t.mejor;
        if (!m) return "";
        return "<p><b>" + TITULO_ES[t.titulo] + ":</b> " + (t.norma ? '<span class="aula-chip ok">hay norma</span>' + (m.valeComo ? " Vale como norma de " + m.valeComo + " partidas." : "") : '<span class="aula-chip mal">no hay norma</span>') + "</p>" +
            (m.ignoradas && m.ignoradas.length ? '<p class="aula-nota">Se dejan afuera: ' + m.ignoradas.map((x) => "ronda " + x.ronda + " (" + esc(x.por) + ")").join("; ") + ".</p>" : "") +
            '<ul class="aula-chequeos">' + m.chequeos.map((c) => '<li class="' + (c.ok ? "si" : "no") + '"><span aria-hidden="true">' + (c.ok ? "✓" : "✗") + "</span> <b>" + c.art + "</b> " + esc(c.texto) + '<span class="sr-only">' + (c.ok ? " (se cumple)" : " (no se cumple)") + "</span></li>").join("") + "</ul>";
    }
    /* Un ejercicio de norma (casos y práctica). */
    function ejercicioNorma(cont, datos, alTerminar) {
        const ev = evaluarNorma(datos.jugador, datos.rivales, datos.sistema);
        const titulos = datos.titulos.filter((t) => ev.titulos.some((x) => x.titulo === t));
        const calc = ev.titulos.find((x) => x.titulo === datos.calcula) || ev.titulos.find((x) => x.titulo === titulos[0]);
        cont.innerHTML = tablaRivales(datos.rivales) +
            '<h3 class="aula-sub">1. Calcula para la norma de ' + TITULO_ES[calc.titulo] + '</h3><p class="aula-nota">Con la mezcla de partidas que mejor le sirve al jugador (si en un suizo conviene dejar afuera alguna, déjala).</p>' +
            '<div class="aula-entradas"><label for="aula-nn">Partidas que cuentan<input id="aula-nn" inputmode="numeric" autocomplete="off" data-calc></label><label for="aula-np">Puntos en esas partidas<input id="aula-np" inputmode="decimal" autocomplete="off" data-calc></label>' +
            '<label for="aula-nra">Promedio de los rivales (Ra)<input id="aula-nra" inputmode="decimal" autocomplete="off" placeholder="puedes escribir la cuenta" data-calc></label><label for="aula-nrp">Rendimiento (Rp)<input id="aula-nrp" inputmode="decimal" autocomplete="off" placeholder="Ra + dp" data-calc></label></div>' +
            '<h3 class="aula-sub">2. Decide</h3><fieldset class="aula-paso-calc"><legend>Marca las normas que el jugador consigue (puede ser ninguna)</legend>' +
            titulos.map((t) => '<label class="aula-casilla"><input type="checkbox" value="' + t + '"> Norma de ' + TITULO_ES[t] + "</label>").join("") + "</fieldset>" +
            '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" data-comprobar>Comprobar</button></div><div class="aula-fb-zona" aria-live="polite"></div>';
        const ayuda = AY ? AY.barra(cont, { tablas: ["dp", "normas"], pista: PISTA_NORMA, antes: ".aula-sub" }) : { conPista: () => false };
        q("[data-comprobar]", cont).addEventListener("click", () => {
            const m = calc.mejor;
            /* Ra y Rp se comparan con el número que dio la cuenta, redondeado como pide 1.4.7. */
            const leer = (id) => { const v = leerPuntos(q(id, cont).value); return v === null ? NaN : v; };
            const n = leer("#aula-nn"), pts = leerPuntos(q("#aula-np", cont).value), ra = leer("#aula-nra"), rp = leer("#aula-nrp");
            const okCalc = n === m.n && pts !== null && Math.abs(pts - m.puntos) < 1e-9 && Math.abs(ra - m.ra) <= 1 && Math.abs(rp - m.rp) <= 1;
            const marcadas = qa("input[type=checkbox]:checked", cont).map((x) => x.value);
            const okDec = titulos.every((t) => marcadas.includes(t) === ev.titulos.find((x) => x.titulo === t).norma);
            const ok = okCalc && okDec;
            q(".aula-fb-zona", cont).innerHTML = '<div class="aula-fb ' + (ok ? "ok" : okDec ? "aviso" : "mal") + '"><p><b>' + (ok ? "Correcto." : okDec ? "La decisión es correcta; revisa las cuentas." : "La decisión no es correcta.") + "</b>" + chipPista(ayuda.conPista()) + " Para la norma de " + TITULO_ES[calc.titulo] + ": " + m.n + " partidas, " + fraccion(m.puntos) + " puntos, Ra = <b>" + m.ra + "</b>, " + m.pct + " % → dp = " + (m.rp - m.ra) + ", Rp = <b>" + m.rp + "</b>.</p>" +
                titulos.map((t) => chequeosHTML(ev.titulos.find((x) => x.titulo === t))).join("") +
                '<p class="aula-nota">Además, el árbitro revisa lo que no sale de los resultados: ' + ev.revisar.map(esc).join(" ") + "</p></div>";
            if (alTerminar) alTerminar(ok, ayuda.conPista());
        });
    }

    function practicaNormas(z) {
        z.innerHTML = '<div class="aula-panel-ej"><div class="aula-fila-ctrl"><label for="aula-tit" class="aula-en-linea">Norma <select id="aula-tit"><option value="IM">Maestro Internacional</option><option value="GM">Gran Maestro</option></select></label><span class="aula-marcador" id="aula-mc">' + marcador("normas") + '</span></div><div id="aula-ej" class="aula-columna"></div><div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-sec" id="aula-nuevo">Otro jugador</button></div></div>';
        const FEDS = ["MEX", "COL", "ESP", "CUB", "ARG", "PER", "PAN", "GUA", "VEN", "CHI", "USA"];
        const APELL = ["Ríos", "Paredes", "Llorente", "Quesada", "Duarte", "Salgado", "Benítez", "Ortega", "Mora", "Vega", "Arias", "Cordero", "Villalobos", "Chaves"];
        function nuevo() {
            const T = q("#aula-tit", z).value;
            const base = T === "GM" ? 2440 : 2300;
            const nombres = barajar(APELL);
            const rivales = Array.from({ length: 9 }, (_, i) => {
                let elo = base + azar(-170, 170);
                const titulo = elo >= 2500 ? "GM" : elo >= 2400 ? (Math.random() < 0.7 ? "IM" : "GM") : elo >= 2300 ? (Math.random() < 0.6 ? "FM" : "IM") : (Math.random() < 0.5 ? "CM" : Math.random() < 0.5 ? "FM" : "");
                if (Math.random() < 0.08) elo = 0;
                const fed = Math.random() < 0.3 ? "CRC" : FEDS[azar(0, FEDS.length - 1)];
                const x = Math.random(), res = x < 0.45 ? "1" : x < 0.8 ? "½" : "0";
                return nombres[i] + "|" + titulo + "|" + fed + "|" + elo + "|" + res;
            });
            const zona = q("#aula-ej", z);
            zona.innerHTML = '<h3>¿Hay norma de ' + TITULO_ES[T] + '?</h3><p class="aula-nota">Un jugador de Costa Rica en un abierto suizo a 9 rondas, todas jugadas en el tablero.</p><div></div>';
            ejercicioNorma(zona.lastElementChild, { jugador: { fed: "CRC", sexo: "m" }, rivales, sistema: "suizo", titulos: [T], calcula: T }, (ok, conPista) => { contar("normas", ok, conPista); q("#aula-mc", z).textContent = marcador("normas"); });
        }
        q("#aula-tit", z).addEventListener("change", nuevo);
        q("#aula-nuevo", z).addEventListener("click", nuevo);
        nuevo();
    }

    /* ---------- posiciones idénticas: el análisis es el de js/reclamos-tablas.js ---------- */
    function analizarSecuencia(fen, jugadas) {
        const pgn = (fen && fen.trim() ? '[SetUp "1"]\n[FEN "' + fen.trim().replace(/"/g, "") + '"]\n\n' : "") + jugadas;
        return window.ReclamosTablas.analizar(pgn);
    }
    function etiqueta(a, k) {
        if (k === 0) return "La posición inicial";
        const antes = a.posiciones[k - 1];
        return "Tras " + antes.numero + (antes.turno === "w" ? ". " : "… ") + espanol(a.posiciones[k].san);
    }
    function enroqueTexto(c) {
        const b = [], n = [];
        if (c.includes("K")) b.push("corto"); if (c.includes("Q")) b.push("largo");
        if (c.includes("k")) n.push("corto"); if (c.includes("q")) n.push("largo");
        return "Blancas: " + (b.length ? b.join(" y ") : "sin derecho") + " · Negras: " + (n.length ? n.join(" y ") : "sin derecho");
    }
    /* El visor de una secuencia con su tabla de posiciones idénticas.
       opciones: { titulo, preguntar (botones sí/no), alResponder(ok), propio }.
       Devuelve { resolver } para mostrar el análisis desde afuera. */
    function montarSecuencia(cont, fen, jugadas, opciones) {
        const op = opciones || {};
        const a = analizarSecuencia(fen, jugadas);
        if (a.error) { cont.insertAdjacentHTML("beforeend", '<div class="aula-fb mal"><p>' + esc(a.error) + "</p></div>"); return { resolver() {} }; }
        const P = a.posiciones;
        const fotos = {};
        P.forEach((p, k) => { const f = p.fen.split(" ")[0]; (fotos[f] = fotos[f] || []).push(k); });
        const foto = Object.keys(fotos).sort((x, y) => fotos[y].length - fotos[x].length || fotos[x][0] - fotos[y][0])[0];
        const marcadas = fotos[foto];
        const triple = a.repeticiones[0] || null;
        let cur = 0;
        cont.innerHTML = (op.titulo ? '<h3 class="aula-sub">' + esc(op.titulo) + "</h3>" : "") +
            '<div class="aula-tablero-zona"><div><div class="example-board aula-tablero"></div>' +
            '<div class="aula-navegar"><button type="button" class="aula-btn aula-btn-sec" data-n="ini" aria-label="Ir a la posición inicial">|◀</button><button type="button" class="aula-btn aula-btn-sec" data-n="-1" aria-label="Jugada anterior">◀</button><button type="button" class="aula-btn aula-btn-sec" data-n="1" aria-label="Jugada siguiente">▶</button><button type="button" class="aula-btn aula-btn-sec" data-n="fin" aria-label="Ir a la última jugada">▶|</button></div>' +
            '<p class="aula-nota" data-tt aria-live="polite"></p></div>' +
            '<div class="aula-columna"><div class="aula-lista-jug" role="group" aria-label="Jugadas de la secuencia"></div>' +
            (op.preguntar ? '<p class="aula-enunciado">Recorre la secuencia. ¿Hay en algún momento una <b>triple repetición válida</b> (art. 9.2)?</p><div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-sec" data-r="si">Sí, se pueden reclamar tablas</button><button type="button" class="aula-btn aula-btn-sec" data-r="no">No hay triple repetición</button></div>' : "") +
            '<div class="aula-fb-zona" aria-live="polite"></div></div></div>';
        const lj = q(".aula-lista-jug", cont);
        lj.innerHTML = '<button type="button" data-p="0">Inicio</button>' + P.slice(1).map((p, i) => '<button type="button" data-p="' + (i + 1) + '">' + esc(etiqueta(a, i + 1).replace("Tras ", "")) + "</button>").join("");
        const tablero = q(".aula-tablero", cont);
        function ir(n) {
            cur = Math.max(0, Math.min(P.length - 1, n));
            tablero.replaceChildren();
            try { window.ExampleBoard.render(tablero, new window.Chess(P[cur].fen)); } catch (e) { /* sin diagrama, queda el texto */ }
            q("[data-tt]", cont).textContent = etiqueta(a, cur) + " · juegan las " + (P[cur].turno === "w" ? "blancas" : "negras");
            qa("button[data-p]", lj).forEach((b) => { const act = Number(b.dataset.p) === cur; b.classList.toggle("act", act); if (act) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
        }
        qa("button[data-p]", lj).forEach((b) => b.addEventListener("click", () => ir(Number(b.dataset.p))));
        qa("[data-n]", cont).forEach((b) => b.addEventListener("click", () => { const v = b.dataset.n; ir(v === "ini" ? 0 : v === "fin" ? P.length - 1 : cur + Number(v)); }));
        ir(op.propio ? P.length - 1 : 0);
        function resolver(resp) {
            const ref = P[triple ? triple.apariciones[0].ply : marcadas[0]];
            const rc = ref.clave.split(" ");
            const filas = marcadas.map((k) => {
                const p = P[k], c = p.clave.split(" "), f = p.fen.split(" ");
                const alPaso = c[3] !== "-" ? "sí (" + c[3] + ")" : f[3] !== "-" ? "no (la captura en " + f[3] + " dejaría a su rey en jaque)" : "no";
                const difE = c[2] !== rc[2] || c[3] !== rc[3], difT = c[1] !== rc[1];
                return "<tr><td>" + esc(etiqueta(a, k)) + "</td><td>Iguales</td><td" + (difE ? ' class="dif"' : "") + ">" + enroqueTexto(c[2]) + "<br>Al paso: " + alPaso + (difE ? ' <span class="aula-chip mal">distinto</span>' : "") + "</td>" +
                    "<td" + (difT ? ' class="dif"' : "") + ">" + (p.turno === "w" ? "Blancas" : "Negras") + (difT ? ' <span class="aula-chip mal">distinto</span>' : "") + "</td></tr>";
            }).join("");
            qa("button[data-p]", lj).forEach((b) => { if (marcadas.includes(Number(b.dataset.p))) b.classList.add("marca-rep"); });
            const hay = !!triple;
            const veredicto = hay
                ? "Sí hay triple repetición: " + triple.apariciones.map((x) => (x.ply === 0 ? "la posición inicial" : x.rotulo + " " + espanol(P[x.ply].san))).join(", ") + ". Con la tercera vez pueden reclamar las " + (triple.jugada.color === "w" ? "blancas" : "negras") + ", antes de jugar " + triple.jugada.rotulo + " " + espanol(triple.jugada.san) + ", anotándola en la planilla y declarando que la van a hacer; o las " + (triple.jugada.color === "w" ? "negras" : "blancas") + ", en su turno, apenas apareció la posición."
                : "No hay triple repetición: la posición más repetida aparece " + marcadas.length + " veces «en foto», pero no todas son idénticas según el art. 9.2.3.";
            const ok = resp == null ? null : (resp === "si") === hay;
            if (ok !== null && op.alResponder) op.alResponder(ok);
            q(".aula-fb-zona", cont).innerHTML = '<div class="aula-fb ' + (ok === false ? "mal" : "ok") + '"><p><b>' + (ok === null ? "Análisis." : ok ? "Correcto." : "No es correcto.") + "</b> " + esc(veredicto) + (a.cincoVeces ? " Además se llega a cinco veces: tablas automáticas (art. 9.6.1)." : "") + "</p>" +
                '<div class="aula-tabla"><table><thead><tr><th scope="col">Aparición</th><th scope="col">Piezas</th><th scope="col">Movimientos especiales</th><th scope="col">Turno</th></tr></thead><tbody>' + filas + "</tbody></table></div>" +
                '<p class="aula-nota">Lo marcado como «distinto» no coincide con la primera aparición. Las jugadas resaltadas en la lista llevan a cada aparición.</p></div>';
        }
        qa("[data-r]", cont).forEach((b) => b.addEventListener("click", () => { qa("[data-r]", cont).forEach((x) => { x.disabled = true; }); resolver(b.dataset.r); }));
        if (op.propio) resolver(null);
        return { resolver };
    }
    function practicaPosiciones(z) {
        z.innerHTML = '<div class="aula-panel-ej"><div class="aula-fila-ctrl"><label for="aula-ejsel" class="aula-en-linea">Ejercicio <select id="aula-ejsel">' +
            D.repeticiones.map((r, i) => '<option value="' + i + '">' + r.titulo + "</option>").join("") + '<option value="propio">Analizar una partida propia…</option></select></label><span class="aula-marcador" id="aula-mc">' + marcador("rep") + '</span></div><div id="aula-ej"></div></div>';
        const alResponder = (ok) => { contar("rep", ok); q("#aula-mc", z).textContent = marcador("rep"); };
        function elegir() {
            const v = q("#aula-ejsel", z).value, cont = q("#aula-ej", z);
            if (v === "propio") {
                cont.innerHTML = '<div class="aula-columna"><p class="aula-enunciado">Pega la posición inicial (FEN, si no empieza desde el principio) y las jugadas en algebraica española (R, D, T, A, C) o inglesa. Sale la tabla de posiciones idénticas, útil para resolver un reclamo de verdad.</p>' +
                    '<label for="aula-pfen">Posición inicial (FEN, opcional)<input id="aula-pfen" autocomplete="off" spellcheck="false" placeholder="Vacío = la posición inicial de siempre"></label>' +
                    '<label for="aula-pjug">Jugadas<textarea id="aula-pjug" rows="4" spellcheck="false">1. Cf3 Cf6 2. Cg1 Cg8 3. Cf3 Cf6 4. Cg1 Cg8</textarea></label>' +
                    '<div><button type="button" class="aula-btn aula-btn-pri" id="aula-anal">Analizar</button></div><div id="aula-res"></div></div>';
                q("#aula-anal", cont).addEventListener("click", () => {
                    const res = q("#aula-res", cont);
                    res.replaceChildren();
                    montarSecuencia(res, q("#aula-pfen", cont).value, q("#aula-pjug", cont).value, { propio: true });
                });
                return;
            }
            const r = D.repeticiones[Number(v)];
            montarSecuencia(cont, r.fen, r.jugadas, { titulo: r.titulo, preguntar: true, alResponder });
        }
        q("#aula-ejsel", z).addEventListener("change", elegir);
        elegir();
    }

    /* ---------- CASOS ---------- */
    function vistaCasos() {
        const p = avance().casos || {};
        const orden = D.casos.filter((c) => ficha(c.ficha) && ficha(c.ficha).coleccion === "taller").concat(D.casos.filter((c) => !(ficha(c.ficha) && ficha(c.ficha).coleccion === "taller")));
        const etiquetaTipo = (c) => c.ritmo ? "Con reloj" : c.tipo === "desempate" ? "Desempates" : c.tipo === "norma" ? "Norma" : c.secuencia ? "Repetición" : c.fen ? "Con tablero" : "";
        pintar('<h2 class="aula-titulo">Casos de sala</h2><p class="aula-intro">Lee la situación y toma la decisión. Según el caso, también ajustas el reloj, recorres la secuencia de una repetición, calculas los desempates de un torneo o la norma de un jugador. Al dictaminar ves si acertaste, con la explicación.</p>' +
            '<div class="aula-rejilla">' + orden.map((c) => {
                const f = ficha(c.ficha), st = p[c.id];
                const chip = st === "optima" ? '<span class="aula-chip ok">Resuelto</span>' : st === "valida" ? '<span class="aula-chip aviso">Válido</span>' : st === "fallo" ? '<span class="aula-chip mal">Para repasar</span>' : "";
                const corto = c.escena.replace(/<[^>]+>/g, "");
                const tipo = etiquetaTipo(c);
                return '<article class="aula-tarjeta"><span class="aula-art">' + (f ? f.titulo : "") + "</span><h3>" + c.titulo + "</h3><p>" + (corto.length > 150 ? corto.slice(0, 150).replace(/\s+\S*$/, "") + "…" : corto) + "</p>" +
                    '<div class="aula-pie"><a class="aula-btn aula-btn-pri" href="#caso-' + c.id + '">Resolver</a><span class="aula-chip">' + c.nivel + "</span>" + (tipo ? '<span class="aula-chip">' + tipo + "</span>" : "") + chip + "</div></article>";
            }).join("") + "</div>");
    }

    function vistaCaso(id) {
        const c = D.casos.find((x) => x.id === id);
        if (!c) return vistaCasos();
        if (c.tipo === "desempate" || c.tipo === "norma") return vistaCasoCalculo(c);
        const R = c.ritmo ? Reloj.RITMOS[c.ritmo] : null;
        const dec = c.decision;
        pintar('<p class="aula-eyebrow"><a href="#casos">Casos de sala</a> · ' + c.nivel + '</p><h2 class="aula-titulo">' + c.titulo + "</h2>" + (R ? '<p class="aula-intro">Ritmo: ' + R.nombre + "</p>" : "") +
            '<div class="aula-caso' + (R ? "" : " sin-reloj") + '"><section class="aula-escena" aria-label="La situación"><p class="aula-relato">' + c.escena + "</p>" +
            (c.fen ? diagrama(c.fen, c.pie) : "") +
            (c.secuencia ? '<div class="aula-paso"><h3>La secuencia, según las planillas</h3><div data-secuencia></div></div>' : "") +
            (dec ? '<div class="aula-paso"><h3>' + (R ? "1. " : "") + 'La decisión</h3><p>' + dec.texto + '</p><div class="aula-opciones">' + dec.opciones.map((o, i) => '<button type="button" data-i="' + i + '">' + o + "</button>").join("") + '</div><div id="aula-fbd" aria-live="polite"></div></div>' : "") +
            (R ? '<div class="aula-paso"><h3>' + (dec ? "2. " : "") + "El reloj</h3><p>" + (c.tarea || "") + '</p><p class="aula-nota">Usa el panel «Ajuste del árbitro» del reloj, pulsa «Aplicar el ajuste» y después dictamina.</p>' +
                '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-dict">Dictaminar</button><button type="button" class="aula-btn aula-btn-sec" id="aula-rein">Empezar el caso de nuevo</button></div><div id="aula-fbr" aria-live="polite"></div></div>' : "") +
            "</section>" + (R ? '<section id="aula-zr" aria-label="El reloj"></section>' : "") + "</div>");
        let secuencia = null;
        if (c.secuencia) secuencia = montarSecuencia(q("[data-secuencia]"), c.secuencia.fen, c.secuencia.jugadas, {});
        let decision = null;
        if (dec) {
            qa(".aula-opciones button").forEach((b) => b.addEventListener("click", () => {
                const i = Number(b.dataset.i), ok = i === dec.correcta;
                decision = ok;
                elegirOpcion($vista, dec.correcta, i);
                const fbd = q("#aula-fbd");
                fbd.innerHTML = '<div class="aula-fb ' + (ok ? "ok" : "mal") + '"><p><b>' + (ok ? "Correcto." : "No es correcto.") + "</b> " + dec.explicacion + "</p></div>";
                if (c.fen) pruebaMaterial(c, q(".aula-fb", fbd));
                if (secuencia) secuencia.resolver(null);
                if (!R) anotar("casos", c.id, ok ? "optima" : "fallo");
            }));
        }
        if (!R) return;
        function montar() {
            if (relojActivo) relojActivo.destruir();
            relojActivo = new Reloj(q("#aula-zr"), { ritmo: R, permitirConfig: false, estado: { w: A.leerTiempo(c.reloj.w), b: A.leerTiempo(c.reloj.b), jw: c.reloj.jw, jb: c.reloj.jb, turno: c.reloj.turno } });
            relojActivo.anotar("Cargada la situación del caso (reloj detenido).");
        }
        montar();
        if (AY) AY.barra(q("#aula-dict").closest(".aula-paso"), { pista: PISTA_RELOJ, antes: ".aula-fila-ctrl" });
        q("#aula-rein").addEventListener("click", () => { montar(); q("#aula-fbr").replaceChildren(); });
        q("#aula-dict").addEventListener("click", () => {
            const e = relojActivo.estado(), tol = (c.tolerancia || 60) * 1000, ej = c.esperadoJugadas;
            const okJ = !ej || (e.jw === ej.jw && e.jb === ej.jb && e.turno === ej.turno);
            let mejor = null;
            c.soluciones.forEach((s) => {
                const dw = Math.abs(e.w - A.leerTiempo(s.w)), db = Math.abs(e.b - A.leerTiempo(s.b));
                if (dw <= tol && db <= tol && (!mejor || (s.valor === "optima" && mejor.valor !== "optima"))) mejor = s;
            });
            let clase, titulo;
            if (mejor && okJ && mejor.valor === "optima") { clase = "ok"; titulo = "Dictamen correcto: " + mejor.nombre.toLowerCase() + "."; }
            else if (mejor && okJ) { clase = "aviso"; titulo = "Solución válida (" + mejor.nombre.toLowerCase() + "), aunque no es la recomendada."; }
            else if (mejor) { clase = "aviso"; titulo = "Los tiempos están bien; revisa las jugadas completadas y el turno."; }
            else { clase = "mal"; titulo = "Los tiempos del reloj no coinciden con ninguna solución aceptable."; }
            if (dec && decision === false) { if (clase === "ok") clase = "aviso"; titulo += " La decisión del paso 1 no fue la correcta."; }
            if (dec && decision === null) titulo += " Te falta contestar el paso 1.";
            anotar("casos", c.id, clase === "ok" ? "optima" : clase === "aviso" ? "valida" : "fallo");
            const nom = (t) => (t === "w" ? "las blancas" : "las negras");
            q("#aula-fbr").innerHTML = '<div class="aula-fb ' + clase + '"><p><b>' + titulo + "</b></p>" +
                "<p>Tu reloj: blancas " + A.tiempo(e.w) + ", negras " + A.tiempo(e.b) + "; jugadas " + e.jw + " / " + e.jb + "; juegan " + nom(e.turno) + "." + (ej ? " Lo esperado: jugadas " + ej.jw + " / " + ej.jb + ", juegan " + nom(ej.turno) + "." : "") + "</p>" +
                '<div class="aula-tabla"><table><thead><tr><th scope="col">Solución</th><th scope="col">Blancas</th><th scope="col">Negras</th><th scope="col">Valoración</th></tr></thead><tbody>' +
                c.soluciones.map((s) => "<tr><td><b>" + s.nombre + '</b><br><span class="aula-nota">' + s.comentario + "</span></td><td>" + s.w + "</td><td>" + s.b + '</td><td><span class="aula-chip ' + (s.valor === "optima" ? "ok" : "aviso") + '">' + (s.valor === "optima" ? "Recomendada" : "Válida") + "</span></td></tr>").join("") +
                '</tbody></table></div><p class="aula-nota">Se acepta una diferencia de hasta ' + (c.tolerancia || 60) + " s.</p></div>";
        });
    }

    function vistaCasoCalculo(c) {
        pintar('<p class="aula-eyebrow"><a href="#casos">Casos de sala</a> · ' + c.nivel + '</p><h2 class="aula-titulo">' + c.titulo + "</h2>" +
            '<div class="aula-caso sin-reloj aula-caso-ancho"><section class="aula-escena" aria-label="La situación"><p class="aula-relato">' + c.escena + '</p><div data-ejercicio></div></section></div>');
        const cont = q("[data-ejercicio]");
        const alTerminar = (ok) => anotar("casos", c.id, ok ? "optima" : "fallo");
        if (c.tipo === "desempate") {
            const r = TT.leer(c.torneo.texto, { sistema: c.torneo.sistema, puntos: c.torneo.puntos });
            if (r.errores.length) { cont.innerHTML = '<div class="aula-fb mal"><p>' + r.errores.map(esc).join(" ") + "</p></div>"; return; }
            ejercicioDesempate(cont, r.t, r.nombres, c.bases, alTerminar);
        } else {
            if (!window.NormasTitulo) { cont.innerHTML = '<div class="aula-fb aviso"><p>No se pudo cargar el cálculo de normas. Recarga la página.</p></div>'; return; }
            ejercicioNorma(cont, c, alTerminar);
        }
    }

    /* ---------- CALCULADORAS ---------- */
    function vistaCalculadoras(sub) {
        const subs = [["desempates", "Desempates"], ["normas", "Normas de título"], ["rendimiento", "Rendimiento (TPR)"]];
        if (!subs.some((s) => s[0] === sub)) sub = "desempates";
        pintar('<h2 class="aula-titulo">Calculadoras</h2><p class="aula-intro">Para estudiar y para un torneo de verdad. Cada resultado viene con su fórmula y el paso a paso. Los desempates usan el mismo motor que Pareo Integral; las normas, el Reglamento de Títulos de FIDE vigente.</p>' +
            '<div class="aula-subtabs" role="group" aria-label="Calculadora">' + subs.map((s) => '<button type="button" data-sub="' + s[0] + '" aria-pressed="' + (s[0] === sub) + '">' + s[1] + "</button>").join("") +
            '</div><div id="aula-zona"></div>');
        qa("[data-sub]").forEach((b) => b.addEventListener("click", () => { location.hash = "calculadoras-" + b.dataset.sub; }));
        ({ desempates: calcDesempates, normas: calcNormas, rendimiento: calcRendimiento })[sub](q("#aula-zona"));
    }

    function calcDesempates(z) {
        const ejemplo = (D.casos.find((c) => c.id === "des-bh-c1") || {}).torneo;
        z.innerHTML = '<section class="aula-panel-ej" aria-labelledby="aula-t-cd"><h3 id="aula-t-cd">Calculadora de desempates</h3>' +
            '<p class="aula-nota">Una línea por jugador, en el orden de los números de emparejamiento: <span class="aula-formula">Nombre | Elo | rondas</span>. Cada ronda: <span class="aula-formula">4n1</span> (contra el n.º 4, con negras, ganó; 1, ½ o 0), <span class="aula-formula">4b+</span> o <span class="aula-formula">4b-</span> (incomparecencia ganada o perdida), <span class="aula-formula">BYE</span> (bye del emparejamiento), <span class="aula-formula">H</span> (bye de medio punto), <span class="aula-formula">F</span> (bye de punto entero pedido), <span class="aula-formula">Z</span> (cero o ausente).</p>' +
            '<label for="aula-cdt">El torneo<textarea id="aula-cdt" rows="9" spellcheck="false">' + esc(ejemplo ? ejemplo.texto : "") + "</textarea></label>" +
            '<div class="aula-entradas"><label for="aula-cds">Sistema<select id="aula-cds"><option value="suizo">Suizo</option><option value="todos">Todos contra todos</option></select></label>' +
            '<label for="aula-cdp">Puntuación<select id="aula-cdp"><option value="1">1 · ½ · 0</option><option value="3">3 · 1 · 0</option></select></label>' +
            '<label for="aula-cdb">Bases (en orden, separadas por comas)<input id="aula-cdb" value="BH-C1, BH, SB" autocomplete="off" spellcheck="false"></label></div>' +
            '<details class="aula-detalle"><summary>Los códigos que se pueden usar</summary><ul class="aula-pasos">' + PD.CATALOGO.map((c) => "<li><b>" + c.codigo + "</b>: " + esc(c.es) + "</li>").join("") + "</ul></details>" +
            '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-cdc">Calcular</button></div><div id="aula-cdr" aria-live="polite"></div></section>';
        q("#aula-cdc", z).addEventListener("click", () => {
            const res = q("#aula-cdr", z);
            const puntos = q("#aula-cdp", z).value === "3" ? { victoria: 3, tablas: 1, derrota: 0, bye: 3 } : null;
            const r = TT.leer(q("#aula-cdt", z).value, { sistema: q("#aula-cds", z).value, puntos });
            if (r.errores.length) { res.innerHTML = '<div class="aula-fb mal"><p><b>Revisa el torneo.</b></p><ul class="aula-pasos">' + r.errores.map((e) => "<li>" + esc(e) + "</li>").join("") + "</ul></div>"; return; }
            const conocidos = new Set(PD.CATALOGO.map((c) => c.codigo));
            const bases = q("#aula-cdb", z).value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
            const malos = bases.filter((b) => !conocidos.has(b));
            if (malos.length) { res.innerHTML = '<div class="aula-fb mal"><p>No conozco ' + malos.map((m) => "«" + esc(m) + "»").join(", ") + ". Mira la lista de códigos.</p></div>"; return; }
            const t = r.t, nombres = r.nombres, P = window.PareoTorneo;
            // La clasificación: grupos de puntos, y dentro de cada uno el art. 4.2.
            const pts = new Map(t.jugadores.map((j) => [j.id, P.puntos(t, j.id)]));
            const grupos = [...new Set(pts.values())].sort((a, b) => b - a).map((v) => t.numeracion.filter((id) => pts.get(id) === v));
            const filas = [];
            let puesto = 1;
            grupos.forEach((g) => {
                const orden = g.length > 1 ? AD.desempatar(t, g, bases).orden : [g];
                orden.forEach((parte) => { parte.forEach((id) => filas.push({ id, puesto, grupo: g })); puesto += parte.length; });
            });
            const valor = (id, cod, g) => cod === "DE" ? (g.length > 1 ? AD.sumasDE(t, g).s[id] : 0) : AD.valores(t, cod)[id];
            res.innerHTML = tablaTorneo(t, nombres, null) + '<h3 class="aula-sub">Clasificación</h3><div class="aula-tabla"><table><thead><tr><th scope="col">Puesto</th><th scope="col">Jugador</th><th scope="col">Pts</th>' +
                bases.map((b) => '<th scope="col">' + b + "</th>").join("") + "</tr></thead><tbody>" +
                filas.map((f) => "<tr><td>" + f.puesto + "</td><td>" + esc(nombres[f.id]) + "</td><td>" + fraccion(pts.get(f.id)) + "</td>" +
                    bases.map((b) => '<td><button type="button" class="aula-celda" data-id="' + f.id + '" data-cod="' + b + '" aria-label="' + esc(b + " de " + nombres[f.id] + ": ver de dónde sale") + '">' + fraccion(valor(f.id, b, f.grupo)) + "</button></td>").join("") + "</tr>").join("") +
                '</tbody></table></div><p class="aula-nota">Toca un valor para ver de dónde sale. El encuentro directo se calcula dentro del grupo de empatados en puntos; puestos repetidos son empates que las bases no rompen (sorteo, art. 4.2).</p><div id="aula-cdx" aria-live="polite"></div>';
            qa(".aula-celda", res).forEach((b) => b.addEventListener("click", () => {
                const f = filas.find((x) => x.id === b.dataset.id);
                q("#aula-cdx", res).innerHTML = '<div class="aula-fb ok"><p><b>' + esc(b.dataset.cod) + " de " + esc(nombres[b.dataset.id]) + "</b> (" + esc(AD.nombreDe(b.dataset.cod)) + ")</p>" + explicacionDesempate(t, nombres, b.dataset.id, b.dataset.cod, f.grupo) + "</div>";
            }));
        });
    }

    function calcNormas(z) {
        const ej = (D.casos.find((c) => c.id === "nor-piso") || {}).rivales || [];
        z.innerHTML = '<section class="aula-panel-ej" aria-labelledby="aula-t-cn"><h3 id="aula-t-cn">Calculadora de normas (GM, MI, WGM, WIM)</h3>' +
            '<p class="aula-nota">Una línea por ronda: <span class="aula-formula">Nombre | Título | Federación | Elo | Resultado</span>. Resultado 1, ½ o 0; <span class="aula-formula">+</span> o <span class="aula-formula">-</span> si fue por incomparecencia. Sin Elo: 0 (cuenta como 1400). Título vacío si no tiene.</p>' +
            '<label for="aula-cnt">Los rivales<textarea id="aula-cnt" rows="10" spellcheck="false">' + esc(ej.join("\n")) + "</textarea></label>" +
            '<div class="aula-entradas"><label for="aula-cnf">Federación del jugador<input id="aula-cnf" value="CRC" autocomplete="off"></label>' +
            '<label for="aula-cnx">El jugador es<select id="aula-cnx"><option value="m">Hombre (GM y MI)</option><option value="f">Mujer (también WGM y WIM)</option></select></label>' +
            '<label for="aula-cns">Sistema<select id="aula-cns"><option value="suizo">Suizo</option><option value="todos">Todos contra todos</option></select></label>' +
            '<label class="aula-casilla"><input type="checkbox" id="aula-cne"> Torneo exento del requisito de federaciones (1.4.3a-d)</label></div>' +
            '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-cnc">Calcular</button></div><div id="aula-cnr" aria-live="polite"></div>' +
            '<details class="aula-detalle"><summary>Las fórmulas (B.01, art. 1.4)</summary><ul class="aula-pasos"><li>Ra = Σ Elo de los rivales ÷ partidas, redondeado (0,5 hacia arriba). Sin Elo = 1400; solo el de menos Elo sube al piso (GM 2200, MI 2050, WGM 2000, WIM 1850).</li><li>p = puntos ÷ partidas, en por ciento redondeado al entero.</li><li>Rp = Ra + dp(p). Hace falta GM 2600, MI 2450, WGM 2400, WIM 2250; Ra mínimo GM 2380, MI 2230, WGM 2180, WIM 2030; y al menos el 35 %.</li><li>Federaciones: al menos 2 distintas de la del jugador; máximo 3/5 de la suya y 2/3 de una sola (hacia abajo). Títulos: la mitad con título (sin CM ni WCM) y un tercio, mínimo 3, con el título de la norma o uno mayor.</li></ul>' + tablaDp() + "</details></section>";
        q("#aula-cnc", z).addEventListener("click", () => {
            const res = q("#aula-cnr", z);
            if (!window.NormasTitulo) { res.innerHTML = '<div class="aula-fb aviso"><p>No se pudo cargar el cálculo de normas. Recarga la página.</p></div>'; return; }
            const lineas = q("#aula-cnt", z).value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const malas = lineas.filter((l) => l.split("|").length !== 5 || !/^(1|½|=|0|\+|-)$/.test(l.split("|")[4].trim()));
            if (!lineas.length || malas.length) { res.innerHTML = '<div class="aula-fb mal"><p>Revisa estas líneas (hacen falta 5 partes y un resultado 1, ½, 0, + o -):</p><ul class="aula-pasos">' + (malas.length ? malas : ["(vacío)"]).map((l) => "<li>" + esc(l) + "</li>").join("") + "</ul></div>"; return; }
            const ev = window.NormasTitulo.evaluar({ fed: q("#aula-cnf", z).value.trim().toUpperCase(), sexo: q("#aula-cnx", z).value, partidas: partidasDe(lineas) }, { sistema: q("#aula-cns", z).value, rondas: lineas.length, exentoFederaciones: q("#aula-cne", z).checked });
            res.innerHTML = '<div class="aula-fb ok">' + ev.titulos.map((t) => chequeosHTML(t)).join("") + '<p class="aula-nota">Revísalo tú, porque no sale de los resultados: ' + ev.revisar.map(esc).join(" ") + "</p></div>";
        });
    }
    function dpDe(p) { return window.NormasTitulo ? window.NormasTitulo.DP[p] : null; }
    function tablaDp() {
        if (!window.NormasTitulo) return "";
        const filas = [];
        for (let i = 0; i <= 50; i++) filas.push("<tr><td>" + (50 + i) + " %</td><td>" + dpDe(50 + i) + "</td><td>" + (50 - i) + " %</td><td>" + dpDe(50 - i) + "</td></tr>");
        return '<div class="aula-tabla aula-tabla-dp"><table><caption>Tabla 1.4.9 (la misma de B.02): porcentaje → dp</caption><thead><tr><th scope="col">p</th><th scope="col">dp</th><th scope="col">p</th><th scope="col">dp</th></tr></thead><tbody>' + filas.join("") + "</tbody></table></div>";
    }

    function calcRendimiento(z) {
        z.innerHTML = '<section class="aula-panel-ej" aria-labelledby="aula-t-cr"><h3 id="aula-t-cr">Rendimiento (TPR) y Elo medio (ARO)</h3>' +
            '<p class="aula-nota">Solo cuentan las partidas jugadas en el tablero (C.07, arts. 10.1 y 10.2). Escribe el Elo de cada rival, separados por comas o espacios, y los puntos que hiciste contra ellos.</p>' +
            '<div class="aula-entradas"><label for="aula-cre">Elo de los rivales<input id="aula-cre" value="2310, 2405, 2515, 2290, 2390, 2420, 2335, 2470, 2280" autocomplete="off"></label><label for="aula-crp">Puntos<input id="aula-crp" value="6" inputmode="decimal" autocomplete="off"></label></div>' +
            '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-crc">Calcular</button></div><div id="aula-crr" aria-live="polite"></div>' +
            '<details class="aula-detalle"><summary>La tabla de FIDE: porcentaje → dp</summary>' + tablaDp() + "</details></section>";
        q("#aula-crc", z).addEventListener("click", () => {
            const res = q("#aula-crr", z);
            const elos = q("#aula-cre", z).value.split(/[\s,;]+/).map(Number).filter((x) => x > 0);
            const pts = leerPuntos(q("#aula-crp", z).value);
            if (!elos.length || pts === null || pts < 0 || pts > elos.length) { res.innerHTML = '<div class="aula-fb mal"><p>Revisa los datos: los puntos van de 0 a ' + elos.length + ".</p></div>"; return; }
            const suma = elos.reduce((a, b) => a + b, 0), aro = Math.floor(suma / elos.length + 0.5);
            const pct = Math.floor((pts / elos.length) * 100 + 0.5 + 1e-9), dp = dpDe(pct);
            res.innerHTML = '<div class="aula-fb ok"><ol class="aula-pasos"><li>ARO = ' + suma + " ÷ " + elos.length + " = " + (suma / elos.length).toFixed(2).replace(".", ",") + " → <b>" + aro + "</b> (se redondea, 0,5 hacia arriba).</li>" +
                "<li>p = " + fraccion(pts) + " ÷ " + elos.length + " = " + ((pts / elos.length) * 100).toFixed(1).replace(".", ",") + " % → <b>" + pct + " %</b>.</li>" +
                "<li>dp(" + pct + " %) = <b>" + dp + "</b> (tabla de FIDE).</li>" +
                "<li>TPR = ARO + dp = " + aro + " " + (dp < 0 ? "− " + Math.abs(dp) : "+ " + dp) + " = <b>" + (aro + dp) + "</b>.</li></ol>" +
                '<p class="aula-nota">Para una norma el cálculo es el mismo (Rp = Ra + dp), pero el promedio Ra lleva el piso de Elo y 1400 para los rivales sin Elo: usa la calculadora de normas.</p></div>';
        });
    }

    /* ---------- RELOJ Y CALCULADORA DE AJUSTE ---------- */
    function vistaReloj() {
        pintar('<h2 class="aula-titulo">Reloj y calculadora de ajuste</h2><p class="aula-intro">Practica con un reloj digital: programa el ritmo, juega pulsando las palancas, detenlo y ajusta tiempos, jugadas y sanciones. La calculadora aplica el método proporcional y le manda el resultado al reloj; sirve también en un torneo de verdad.</p>' +
            '<div class="aula-reloj-pagina"><section id="aula-zr" aria-label="El reloj"></section><section class="aula-panel-ej" aria-labelledby="aula-t-calc"><h3 id="aula-t-calc">Calculadora de ajuste después de una irregularidad</h3>' +
            '<div class="aula-entradas">' +
            '<label for="aula-c1">Periodo 1 (min)<input id="aula-c1" type="number" value="90" min="1"></label><label for="aula-c2">Jugadas del control<input id="aula-c2" type="number" value="40" min="0"></label>' +
            '<label for="aula-c3">Periodo 2 (min)<input id="aula-c3" type="number" value="30" min="0"></label><label for="aula-c4">Incremento (s)<input id="aula-c4" type="number" value="30" min="0"></label>' +
            '<label for="aula-c5">Reloj de las blancas ahora<input id="aula-c5" value="0:36:00" autocomplete="off"></label><label for="aula-c6">Reloj de las negras ahora<input id="aula-c6" value="1:00:30" autocomplete="off"></label>' +
            '<label for="aula-c7">Jugadas completadas de las blancas<input id="aula-c7" type="number" value="52" min="0"></label><label for="aula-c8">Jugadas completadas de las negras<input id="aula-c8" type="number" value="51" min="0"></label>' +
            '<label for="aula-c9">Cometió la irregularidad<select id="aula-c9"><option value="b">Las negras</option><option value="w">Las blancas</option></select></label><label for="aula-c10">En la jugada número<input id="aula-c10" type="number" value="43" min="1"></label>' +
            '<label for="aula-c11">Sanción para el rival<select id="aula-c11"><option value="2">2 min (estándar)</option><option value="1">1 min (rápida o relámpago)</option><option value="0">Sin sanción</option></select></label>' +
            '</div><div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-calc">Calcular</button><button type="button" class="aula-btn aula-btn-sec" id="aula-env" disabled>Mandar al reloj</button></div><div id="aula-rc" aria-live="polite"></div>' +
            '<details class="aula-detalle"><summary>Las fórmulas (Leyes, art. 7.1)</summary><ul class="aula-pasos"><li>Consumido = tiempo de los controles alcanzados + jugadas × incremento − reloj.</li><li>Consumido ideal = consumido × jugadas que quedan ÷ jugadas hechas.</li><li>Reloj = tiempo de los controles que se alcanzan con las jugadas que quedan + jugadas que quedan × incremento − consumido ideal, más la sanción del art. 7.5.5.</li></ul></details>' +
            '<p class="aula-nota">Viene cargado el caso B de la revista (ritmo 90/40 + 30 + 30 s).</p></section></div>');
        relojActivo = new Reloj(q("#aula-zr"), { ritmo: Reloj.RITMOS["clasico-inc"] });
        let ultimo = null;
        const num = (id) => Math.max(0, Number(q("#aula-" + id).value) || 0);
        q("#aula-calc").addEventListener("click", () => {
            const w = A.leerTiempo(q("#aula-c5").value), b = A.leerTiempo(q("#aula-c6").value);
            const quien = q("#aula-c9").value, k = num("c10");
            const { lw, lb } = A.jugadasQueQuedan(quien, k);
            if (w == null || b == null || k < 1 || lw > num("c7") || lb > num("c8")) {
                q("#aula-rc").innerHTML = '<div class="aula-fb aviso"><p>Revisa los datos: los tiempos van como h:mm:ss y la jugada de la irregularidad no puede ser posterior a las jugadas completadas.</p></div>';
                return;
            }
            const o = { p1: Math.max(1, num("c1")), pj: num("c2"), p2: num("c3"), inc: num("c4"), w, b, nw: num("c7"), nb: num("c8"), lw, lb, sancion: { lado: quien === "w" ? "b" : "w", min: num("c11") } };
            const r = A.calcularAjuste(o);
            ultimo = { o, estado: { w: Math.round(r.w.final * 60) * 1000, b: Math.round(r.b.final * 60) * 1000, jw: lw, jb: lb, turno: quien } };
            q("#aula-rc").innerHTML = '<div class="aula-fb ok"><p><b>Con el método proporcional:</b> blancas ' + A.minutos(r.w.final) + ", negras " + A.minutos(r.b.final) + "; jugadas completadas " + lw + " / " + lb + "; juegan las " + (quien === "w" ? "blancas" : "negras") + '.</p><ol class="aula-pasos">' + pasosAjuste(o, r) + "</ol>" +
                '<p class="aula-nota">Con la variante de horario: blancas ' + A.minutos(r.w.horario) + ", negras " + A.minutos(r.b.horario) + ". Recuerda que el art. 7.1 también permite no cambiar los relojes.</p></div>";
            q("#aula-env").disabled = false;
        });
        q("#aula-env").addEventListener("click", () => {
            if (!ultimo || !relojActivo) return;
            const o = ultimo.o;
            relojActivo.ritmo = { nombre: "el de la calculadora", periodos: o.pj && o.p2 ? [{ min: o.p1, jugadas: o.pj }, { min: o.p2 }] : [{ min: o.p1 }], inc: o.inc };
            relojActivo.pausar();
            relojActivo.fijarEstado(ultimo.estado);
            relojActivo.leerAlPanel();
            q("#aula-rc").insertAdjacentHTML("beforeend", '<p class="aula-nota">Listo: el reloj quedó con esos tiempos, en pausa. Pulsa «Iniciar» para seguir.</p>');
        });
    }

    ruta();
})();

/*! rev bfb5bbb0d2d82f9f */
