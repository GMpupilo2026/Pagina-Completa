/* Aula de Arbitraje (aula-arbitraje.html): estudiar el reglamento y ponerlo
   en práctica.

   Cuatro partes, cada una con su dirección para mandar el enlace ya abierto
   (#estudiar, #ficha-<id>, #practicar-<tipo>, #casos, #caso-<id>, #reloj):
   - Estudiar: las fichas de js/aula-arbitraje/contenido.js.
   - Practicar: preguntas, ajustes de reloj y Koya generados al azar (nunca se
     acaban), y repeticiones analizadas con js/reclamos-tablas.js (chess.js),
     también con una partida propia.
   - Casos: una situación de sala, la decisión y el reloj de
     js/aula-arbitraje/reloj.js para dejarlo como debe quedar; al dictaminar
     dice si es la solución recomendada, una válida o un error, y por qué.
   - Reloj: el reloj suelto y la calculadora del método proporcional, que le
     manda el resultado.
   El avance se guarda solo en este aparato (localStorage), como una
   comodidad: no es una nota ni la ve nadie más. Ver «Aula de Arbitraje» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const D = window.AULA_CONTENIDO, A = window.AulaAjuste, Reloj = window.AulaReloj;
    const $vista = document.getElementById("aula-vista");
    if (!$vista || !D || !A || !Reloj) return;
    let relojActivo = null;
    let filtroPreguntas = "";

    /* ---------- utilidades ---------- */
    function esc(t) { return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function q(s, el) { return (el || $vista).querySelector(s); }
    function qa(s, el) { return Array.from((el || $vista).querySelectorAll(s)); }
    function azar(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function barajar(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function leerPuntos(t) { const v = parseFloat(String(t).trim().replace("½", ".5").replace(",", ".").replace(/\s/g, "")); return isNaN(v) ? null : v; }
    const ficha = (id) => D.fichas.find((f) => f.id === id);
    function pintar(html) {
        $vista.innerHTML = html;
        const h = $vista.querySelector("h2");
        if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }

    /* ---------- avance (solo en este aparato) ---------- */
    const CLAVE = "aula_arbitraje_avance_v1";
    function avance() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }
    function guardar(p) { try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch (e) { /* sin almacenamiento: se practica igual */ } }
    function anotar(tipo, id, valor) { const p = avance(); p[tipo] = p[tipo] || {}; p[tipo][id] = valor; guardar(p); }
    function contar(tipo, ok) { const p = avance(); p.gen = p.gen || {}; const g = p.gen[tipo] = p.gen[tipo] || { ok: 0, total: 0 }; g.total++; if (ok) g.ok++; guardar(p); return g; }
    function marcador(tipo) { const g = (avance().gen || {})[tipo]; return g ? "Correctos: " + g.ok + " de " + g.total : ""; }

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
        if (r === "reloj") return vistaReloj();
        return vistaEstudiar();
    }
    window.addEventListener("hashchange", ruta);

    /* ---------- ESTUDIAR ---------- */
    function vistaEstudiar() {
        const p = avance(), preg = p.preg || {}, casos = p.casos || {}, gen = p.gen || {};
        const aciertos = Object.keys(preg).filter((k) => preg[k]).length;
        const casosOk = Object.keys(casos).filter((k) => casos[k] !== "fallo").length;
        const generados = ["relojes", "koya", "rep"].reduce((s, k) => s + ((gen[k] || {}).total || 0), 0);
        let html = '<h2 class="aula-titulo">Fichas de estudio</h2><p class="aula-intro">Cada ficha resume un tema del reglamento de FIDE vigente. Cuando termines de leerla, practica con preguntas, ejercicios que se generan al azar y casos de sala con reloj.</p>' +
            '<div class="aula-datos aula-avance"><div class="aula-dato"><span>Preguntas acertadas</span><b>' + aciertos + " de " + D.preguntas.length + '</b></div>' +
            '<div class="aula-dato"><span>Casos resueltos</span><b>' + casosOk + " de " + D.casos.length + '</b></div>' +
            '<div class="aula-dato"><span>Ejercicios generados</span><b>' + generados + "</b></div></div>" +
            '<p class="aula-nota">Tu avance se guarda solo en este aparato.</p>';
        D.colecciones.forEach((c) => {
            html += '<section class="aula-coleccion" aria-label="' + esc(c.titulo) + '"><div class="aula-coleccion-cab"><h3>' + c.titulo + "</h3><span>" + (c.nota || "") + '</span></div><div class="aula-rejilla">';
            D.fichas.filter((f) => f.coleccion === c.id).forEach((f) => {
                const np = D.preguntas.filter((x) => x.ficha === f.id).length;
                const nc = D.casos.filter((x) => x.ficha === f.id).length;
                html += '<article class="aula-tarjeta"><span class="aula-art">' + f.articulos + "</span><h4>" + f.titulo + "</h4><p>" + f.resumen + "</p>" +
                    '<div class="aula-pie"><a class="aula-btn aula-btn-pri" href="#ficha-' + f.id + '">Estudiar</a><span class="aula-chip">' + np + " preguntas</span>" +
                    (nc ? '<span class="aula-chip">' + nc + " casos</span>" : "") + "</div></article>";
            });
            html += "</div></section>";
        });
        pintar(html);
    }

    function vistaFicha(id) {
        const f = ficha(id);
        if (!f) return vistaEstudiar();
        const col = D.colecciones.find((c) => c.id === f.coleccion) || {};
        const np = D.preguntas.filter((x) => x.ficha === id).length;
        const casos = D.casos.filter((x) => x.ficha === id);
        const gen = { relojes: ["practicar-relojes", "Ejercicios de ajuste de relojes"], koya: ["practicar-koya", "Ejercicios de Koya"], repeticion: ["practicar-posiciones", "Ejercicios de posiciones idénticas"] }[id];
        pintar('<p class="aula-eyebrow"><a href="#estudiar">Fichas</a> · ' + (col.titulo || "") + '</p><h2 class="aula-titulo">' + f.titulo + '</h2><p class="aula-intro">' + f.articulos + "</p>" +
            '<div class="aula-ficha"><article class="aula-hoja">' + f.contenido + "</article><aside class=\"aula-lateral\">" +
            '<div class="aula-claves"><h3>Ideas clave</h3><ul>' + f.claves.map((k) => "<li>" + k + "</li>").join("") + "</ul></div>" +
            '<div class="aula-claves"><h3>Ponlo en práctica</h3><div class="aula-columna">' +
            '<a class="aula-btn aula-btn-pri" href="#practicar-preguntas" data-filtro="' + id + '">Preguntas de esta ficha (' + np + ")</a>" +
            (gen ? '<a class="aula-btn aula-btn-sec" href="#' + gen[0] + '">' + gen[1] + "</a>" : "") +
            casos.map((c) => '<a class="aula-btn aula-btn-sec" href="#caso-' + c.id + '">Caso: ' + c.titulo + "</a>").join("") +
            "</div></div></aside></div>");
        const a = q("[data-filtro]");
        if (a) a.addEventListener("click", () => { filtroPreguntas = id; });
    }

    /* ---------- PRACTICAR ---------- */
    function vistaPracticar(sub) {
        const subs = [["preguntas", "Preguntas"], ["relojes", "Ajuste de relojes"], ["koya", "Desempate Koya"], ["posiciones", "Posiciones idénticas"]];
        if (!subs.some((s) => s[0] === sub)) sub = "preguntas";
        pintar('<h2 class="aula-titulo">Practicar</h2><p class="aula-intro">Las preguntas salen de las fichas; los ejercicios de relojes y de Koya se generan al azar cada vez, así que nunca se acaban.</p>' +
            '<div class="aula-subtabs" role="group" aria-label="Tipo de ejercicio">' + subs.map((s) => '<button type="button" data-sub="' + s[0] + '" aria-pressed="' + (s[0] === sub) + '">' + s[1] + "</button>").join("") +
            '</div><div id="aula-zona"></div>');
        qa("[data-sub]").forEach((b) => b.addEventListener("click", () => { location.hash = "practicar-" + b.dataset.sub; }));
        ({ preguntas: practicaPreguntas, relojes: practicaRelojes, koya: practicaKoya, posiciones: practicaPosiciones })[sub](q("#aula-zona"));
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
        const lista = D.preguntas.map((p, i) => Object.assign({ idx: i }, p));
        z.innerHTML = '<div class="aula-panel-ej"><div class="aula-fila-ctrl"><label for="aula-filtro" class="aula-en-linea">Ficha <select id="aula-filtro"><option value="">Todas</option>' +
            D.fichas.map((f) => '<option value="' + f.id + '"' + (f.id === filtroPreguntas ? " selected" : "") + ">" + f.titulo + "</option>").join("") +
            '</select></label></div><div id="aula-preg" class="aula-columna"></div></div>';
        const caja = q("#aula-preg", z);
        function arrancar() {
            const orden = barajar(lista.filter((p) => !filtroPreguntas || p.ficha === filtroPreguntas));
            let pos = 0, buenas = 0;
            function siguiente() {
                if (pos >= orden.length) {
                    caja.innerHTML = '<h3>Terminaste</h3><p class="aula-enunciado">Acertaste ' + buenas + " de " + orden.length + '.</p><div><button type="button" class="aula-btn aula-btn-pri" id="aula-otra">Repetir en otro orden</button></div>';
                    q("#aula-otra", caja).addEventListener("click", arrancar);
                    return;
                }
                const p = orden[pos], f = ficha(p.ficha);
                caja.innerHTML = '<div class="aula-fila-ctrl"><span class="aula-chip">' + (f ? f.titulo : "") + '</span><span class="aula-marcador">Pregunta ' + (pos + 1) + " de " + orden.length + " · aciertos: " + buenas + "</span></div>" +
                    '<p class="aula-enunciado">' + p.texto + '</p><div class="aula-opciones">' + p.opciones.map((o, i) => '<button type="button" data-i="' + i + '">' + o + "</button>").join("") + '</div><div id="aula-fb" aria-live="polite"></div>';
                qa(".aula-opciones button", caja).forEach((b) => b.addEventListener("click", () => {
                    const i = Number(b.dataset.i), ok = i === p.correcta;
                    if (ok) buenas++;
                    anotar("preg", p.idx, ok);
                    elegirOpcion(caja, p.correcta, i);
                    q("#aula-fb", caja).innerHTML = '<div class="aula-fb ' + (ok ? "ok" : "mal") + '"><p><b>' + (ok ? "Correcto." : "No es correcto.") + "</b> " + p.explicacion + "</p></div>" +
                        '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-sig">Siguiente</button></div>';
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
            q("#aula-comp", z).addEventListener("click", () => {
                const uw = A.leerTiempo(q("#aula-iw", z).value), ub = A.leerTiempo(q("#aula-ib", z).value);
                const ujw = Number(q("#aula-ijw", z).value), ujb = Number(q("#aula-ijb", z).value);
                if (uw == null || ub == null) { q("#aula-fb", z).innerHTML = '<div class="aula-fb aviso"><p>Escribe los dos tiempos como h:mm:ss (por ejemplo 0:52:32).</p></div>'; return; }
                const okT = Math.abs(uw - ew) <= 30000 && Math.abs(ub - eb) <= 30000, okJ = ujw === lw && ujb === lb;
                contar("relojes", okT && okJ);
                q("#aula-mc", z).textContent = marcador("relojes");
                const titulo = okT && okJ ? "Correcto." : okT ? "Los tiempos están bien; revisa las jugadas completadas." : okJ ? "Las jugadas están bien, pero los tiempos no coinciden." : "No coincide.";
                q("#aula-fb", z).innerHTML = '<div class="aula-fb ' + (okT && okJ ? "ok" : okT || okJ ? "aviso" : "mal") + '"><p><b>' + titulo + "</b> La solución: blancas <b>" + A.tiempo(ew) + "</b>, negras <b>" + A.tiempo(eb) + "</b>; jugadas completadas " + lw + " / " + lb + "; juegan las " + (quien === "w" ? "blancas" : "negras") + ".</p>" +
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
                '<div class="aula-entradas">' + grupo.map((i, c) => '<label for="aula-k' + c + '">KS de ' + nombres[i] + '<input id="aula-k' + c + '" inputmode="decimal" placeholder="por ejemplo 2½" autocomplete="off"></label>').join("") + "</div>" +
                '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-comp">Comprobar</button><button type="button" class="aula-btn aula-btn-sec" id="aula-nuevo">Otro torneo</button></div><div id="aula-fb" aria-live="polite"></div>';
            q("#aula-nuevo", z).addEventListener("click", nuevo);
            q("#aula-comp", z).addEventListener("click", () => {
                let todo = true;
                const filas = grupo.map((i, c) => {
                    const v = leerPuntos(q("#aula-k" + c, z).value), real = A.koya(m, i), ok = v !== null && Math.abs(v - real) < 1e-9;
                    if (!ok) todo = false;
                    const det = [];
                    for (let j = 0; j < n; j++) if (j !== i && pts[j] >= lim) det.push(A.medio(m[i][j]) + " contra " + nombres[j]);
                    return "<li><b>" + nombres[i] + "</b>: " + det.join(" + ") + " = <b>" + A.medio(real) + "</b> " + (ok ? '<span class="aula-chip ok">bien</span>' : '<span class="aula-chip mal">pusiste: ' + (v === null ? "nada" : A.medio(v)) + "</span>") + "</li>";
                }).join("");
                contar("koya", todo);
                q("#aula-mc", z).textContent = marcador("koya");
                const ks = (i) => A.koya(m, i);
                const porKs = grupo.slice().sort((a, b) => ks(b) - ks(a));
                const siguen = porKs.filter((i) => porKs.some((j) => j !== i && ks(j) === ks(i)));
                q("#aula-fb", z).innerHTML = '<div class="aula-fb ' + (todo ? "ok" : "mal") + '"><p><b>' + (todo ? "Correcto." : "Revisa los valores marcados.") + "</b> Límite: el 50 % de " + max + " = <b>" + A.medio(lim) + "</b> puntos. Cuentan los rivales con " + A.medio(lim) + " o más (marcados en la tabla).</p><ol class=\"aula-pasos\">" + filas + "</ol>" +
                    "<p>Orden por Koya: " + porKs.map((i) => nombres[i] + " (" + A.medio(ks(i)) + ")").join(" › ") + "." + (siguen.length ? " Siguen empatados " + siguen.map((i) => nombres[i]).join(" y ") + ": se aplica el siguiente desempate de las bases solo a ellos (art. 4.2)." : "") + "</p></div>";
                const t = q(".aula-cruzada", z);
                qa("thead th", t).forEach((th, c) => { if (c >= 2 && c < 2 + n && pts[orden[c - 2]] >= lim) { th.classList.add("top"); th.insertAdjacentHTML("beforeend", '<span class="sr-only"> (cuenta)</span>'); } });
                qa("tbody tr", t).forEach((tr) => Array.from(tr.children).forEach((td, c) => { if (c >= 2 && c < 2 + n && pts[orden[c - 2]] >= lim && !td.classList.contains("x")) td.classList.add("top"); }));
            });
        }
        q("#aula-nj", z).addEventListener("change", nuevo);
        nuevo();
    }

    /* Posiciones idénticas: el análisis es el de js/reclamos-tablas.js. */
    function analizarSecuencia(fen, jugadas) {
        const pgn = (fen && fen.trim() ? '[SetUp "1"]\n[FEN "' + fen.trim().replace(/"/g, "") + '"]\n\n' : "") + jugadas;
        return window.ReclamosTablas.analizar(pgn);
    }
    /* chess.js anota en inglés (Nf3); en el sitio se lee en español (Cf3). */
    const EN_A_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
    function espanol(san) { return String(san || "").replace(/^[KQRBN]/, (p) => EN_A_ES[p]).replace(/=([QRBN])/, (m, p) => "=" + EN_A_ES[p]); }
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
    function practicaPosiciones(z) {
        z.innerHTML = '<div class="aula-panel-ej"><div class="aula-fila-ctrl"><label for="aula-ejsel" class="aula-en-linea">Ejercicio <select id="aula-ejsel">' +
            D.repeticiones.map((r, i) => '<option value="' + i + '">' + r.titulo + "</option>").join("") + '<option value="propio">Analizar una partida propia…</option></select></label><span class="aula-marcador" id="aula-mc">' + marcador("rep") + '</span></div><div id="aula-ej"></div></div>';
        function cargar(cont, fen, jugadas, titulo, propio) {
            const a = analizarSecuencia(fen, jugadas);
            if (a.error) { cont.insertAdjacentHTML("beforeend", '<div class="aula-fb mal"><p>' + esc(a.error) + "</p></div>"); return; }
            const P = a.posiciones;
            const fotos = {};
            P.forEach((p, k) => { const f = p.fen.split(" ")[0]; (fotos[f] = fotos[f] || []).push(k); });
            const foto = Object.keys(fotos).sort((x, y) => fotos[y].length - fotos[x].length || fotos[x][0] - fotos[y][0])[0];
            const marcadas = fotos[foto];
            const triple = a.repeticiones[0] || null;
            let cur = 0;
            cont.innerHTML = (propio ? "" : '<h3 class="aula-sub">' + esc(titulo) + "</h3>") +
                '<div class="aula-tablero-zona"><div><div class="example-board aula-tablero"></div>' +
                '<div class="aula-navegar"><button type="button" class="aula-btn aula-btn-sec" data-n="ini" aria-label="Ir a la posición inicial">|◀</button><button type="button" class="aula-btn aula-btn-sec" data-n="-1" aria-label="Jugada anterior">◀</button><button type="button" class="aula-btn aula-btn-sec" data-n="1" aria-label="Jugada siguiente">▶</button><button type="button" class="aula-btn aula-btn-sec" data-n="fin" aria-label="Ir a la última jugada">▶|</button></div>' +
                '<p class="aula-nota" id="aula-tt" aria-live="polite"></p></div>' +
                '<div class="aula-columna"><div class="aula-lista-jug" role="group" aria-label="Jugadas de la secuencia"></div>' +
                (propio ? "" : '<p class="aula-enunciado">Recorre la secuencia. ¿Hay en algún momento una <b>triple repetición válida</b> (art. 9.2)?</p><div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-sec" data-r="si">Sí, se pueden reclamar tablas</button><button type="button" class="aula-btn aula-btn-sec" data-r="no">No hay triple repetición</button></div>') +
                '<div class="aula-fb-zona" aria-live="polite"></div></div></div>';
            const lj = q(".aula-lista-jug", cont);
            lj.innerHTML = '<button type="button" data-p="0">Inicio</button>' + P.slice(1).map((p, i) => '<button type="button" data-p="' + (i + 1) + '">' + esc(etiqueta(a, i + 1).replace("Tras ", "")) + "</button>").join("");
            const tablero = q(".aula-tablero", cont);
            function ir(n) {
                cur = Math.max(0, Math.min(P.length - 1, n));
                tablero.replaceChildren();
                try { window.ExampleBoard.render(tablero, new window.Chess(P[cur].fen)); } catch (e) { /* sin diagrama, queda el texto */ }
                q("#aula-tt", cont).textContent = etiqueta(a, cur) + " · juegan las " + (P[cur].turno === "w" ? "blancas" : "negras");
                qa("button[data-p]", lj).forEach((b) => { const act = Number(b.dataset.p) === cur; b.classList.toggle("act", act); if (act) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
            }
            qa("button[data-p]", lj).forEach((b) => b.addEventListener("click", () => ir(Number(b.dataset.p))));
            qa("[data-n]", cont).forEach((b) => b.addEventListener("click", () => { const v = b.dataset.n; ir(v === "ini" ? 0 : v === "fin" ? P.length - 1 : cur + Number(v)); }));
            ir(propio ? P.length - 1 : 0);
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
                if (ok !== null) { contar("rep", ok); q("#aula-mc", z).textContent = marcador("rep"); }
                q(".aula-fb-zona", cont).innerHTML = '<div class="aula-fb ' + (ok === false ? "mal" : "ok") + '"><p><b>' + (ok === null ? "Análisis." : ok ? "Correcto." : "No es correcto.") + "</b> " + esc(veredicto) + (a.cincoVeces ? " Además se llega a cinco veces: tablas automáticas (art. 9.6.1)." : "") + "</p>" +
                    '<div class="aula-tabla"><table><thead><tr><th scope="col">Aparición</th><th scope="col">Piezas</th><th scope="col">Movimientos especiales</th><th scope="col">Turno</th></tr></thead><tbody>' + filas + "</tbody></table></div>" +
                    '<p class="aula-nota">Lo marcado como «distinto» no coincide con la primera aparición. Las jugadas resaltadas en la lista llevan a cada aparición.</p></div>';
            }
            qa("[data-r]", cont).forEach((b) => b.addEventListener("click", () => { qa("[data-r]", cont).forEach((x) => { x.disabled = true; }); resolver(b.dataset.r); }));
            if (propio) resolver(null);
        }
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
                    cargar(res, q("#aula-pfen", cont).value, q("#aula-pjug", cont).value, "", true);
                });
                return;
            }
            const r = D.repeticiones[Number(v)];
            cargar(cont, r.fen, r.jugadas, r.titulo, false);
        }
        q("#aula-ejsel", z).addEventListener("change", elegir);
        elegir();
    }

    /* ---------- CASOS ---------- */
    function vistaCasos() {
        const p = avance().casos || {};
        pintar('<h2 class="aula-titulo">Casos de sala</h2><p class="aula-intro">Lee la situación, toma la decisión y deja el reloj como debe quedar. Al dictaminar ves si tu solución es la recomendada, una válida o un error, con la explicación.</p>' +
            '<div class="aula-rejilla">' + D.casos.map((c) => {
                const f = ficha(c.ficha), st = p[c.id];
                const chip = st === "optima" ? '<span class="aula-chip ok">Resuelto</span>' : st === "valida" ? '<span class="aula-chip aviso">Válido</span>' : st === "fallo" ? '<span class="aula-chip mal">Para repasar</span>' : "";
                const corto = c.escena.replace(/<[^>]+>/g, "");
                return '<article class="aula-tarjeta"><span class="aula-art">' + (f ? f.titulo : "") + "</span><h3>" + c.titulo + "</h3><p>" + (corto.length > 150 ? corto.slice(0, 150).replace(/\s+\S*$/, "") + "…" : corto) + "</p>" +
                    '<div class="aula-pie"><a class="aula-btn aula-btn-pri" href="#caso-' + c.id + '">Resolver</a><span class="aula-chip">' + c.nivel + "</span>" + (c.ritmo ? '<span class="aula-chip">Con reloj</span>' : "") + chip + "</div></article>";
            }).join("") + "</div>");
    }

    function vistaCaso(id) {
        const c = D.casos.find((x) => x.id === id);
        if (!c) return vistaCasos();
        const R = c.ritmo ? Reloj.RITMOS[c.ritmo] : null;
        const dec = c.decision;
        pintar('<p class="aula-eyebrow"><a href="#casos">Casos de sala</a> · ' + c.nivel + '</p><h2 class="aula-titulo">' + c.titulo + "</h2>" + (R ? '<p class="aula-intro">Ritmo: ' + R.nombre + "</p>" : "") +
            '<div class="aula-caso' + (R ? "" : " sin-reloj") + '"><section class="aula-escena" aria-label="La situación"><p class="aula-relato">' + c.escena + "</p>" +
            (dec ? '<div class="aula-paso"><h3>' + (R ? "1. " : "") + 'La decisión</h3><p>' + dec.texto + '</p><div class="aula-opciones">' + dec.opciones.map((o, i) => '<button type="button" data-i="' + i + '">' + o + "</button>").join("") + '</div><div id="aula-fbd" aria-live="polite"></div></div>' : "") +
            (R ? '<div class="aula-paso"><h3>' + (dec ? "2. " : "") + "El reloj</h3><p>" + (c.tarea || "") + '</p><p class="aula-nota">Usa el panel «Ajuste del árbitro» del reloj, pulsa «Aplicar el ajuste» y después dictamina.</p>' +
                '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" id="aula-dict">Dictaminar</button><button type="button" class="aula-btn aula-btn-sec" id="aula-rein">Empezar el caso de nuevo</button></div><div id="aula-fbr" aria-live="polite"></div></div>' : "") +
            "</section>" + (R ? '<section id="aula-zr" aria-label="El reloj"></section>' : "") + "</div>");
        let decision = null;
        if (dec) {
            qa(".aula-opciones button").forEach((b) => b.addEventListener("click", () => {
                const i = Number(b.dataset.i), ok = i === dec.correcta;
                decision = ok;
                elegirOpcion($vista, dec.correcta, i);
                q("#aula-fbd").innerHTML = '<div class="aula-fb ' + (ok ? "ok" : "mal") + '"><p><b>' + (ok ? "Correcto." : "No es correcto.") + "</b> " + dec.explicacion + "</p></div>";
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

    /* ---------- RELOJ Y CALCULADORA ---------- */
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
