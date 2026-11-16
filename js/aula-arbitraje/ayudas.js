/* Aula de Arbitraje — las ayudas de cálculo de cada ejercicio.
   Pedido del dueño: que los árbitros hagan las cuentas dentro de la
   plataforma, sin salir a buscar una calculadora o una tabla. La regla es
   que estas ayudas hacen las CUENTAS, nunca las REGLAS: qué partidas se dejan
   afuera, a quién se sube al piso, cómo se redondea o qué rivales cuentan lo
   sigue decidiendo el árbitro (si la plataforma lo hiciera, el ejercicio ya
   no enseñaría nada).

   Cuatro piezas, que usa js/aula-arbitraje-pagina.js:
   - evaluar(texto): la cuenta que escribe la persona («(2188+2405)/2»,
     «9½ + 1,25», «2½», y con tiempos «1:12:40 − 0:05:00»), con un analizador propio (sin eval: la CSP no lo
     deja y no hace falta). Devuelve el número o null.
   - campos(cont): los campos con data-calc aceptan una cuenta y muestran el
     resultado al lado mientras se escribe.
   - barra(cont, opc): los botones (opc.antes: delante de qué elemento van) «Calculadora», «Tablas de FIDE» y «¿Cómo
     se calcula?» de un ejercicio. La pista avisa (opc.alUsarPista) la primera
     vez que se abre, para que el avance diga «con pista».
   - Las tablas salen del mismo código que hace el cálculo (NormasTitulo.DP y
     NORMAS, PareoDesempates.CATALOGO y dpDeP): una sola copia.
   Lo revisan verificar-aula-arbitraje.js (evaluar) y
   verificar-aula-arbitraje-pagina.js (la pantalla). Ver «Las ayudas de cálculo
   de los ejercicios» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
    "use strict";

    /* ---------- evaluar: + − × ÷, paréntesis, decimales con coma o punto y ½ ¼ ¾ ---------- */
    const FRACCION = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
    function fichas(texto) {
        const s = String(texto == null ? "" : texto).replace(/\s+/g, "").replace(/[×xX*]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-");
        const out = [];
        let i = 0;
        while (i < s.length) {
            const c = s[i];
            if (/[0-9.,½¼¾]/.test(c)) {
                let num = "", extra = 0;
                while (i < s.length && /[0-9.,]/.test(s[i])) num += s[i++];
                while (i < s.length && FRACCION[s[i]] != null) extra += FRACCION[s[i++]];
                /* La coma o el punto es decimal; «2.405» o «2,405» con tres cifras después, si no hay otro separador, es un millar mal escrito: se lee como decimal igual. */
                const limpio = num.replace(",", ".");
                if ((limpio.match(/\./g) || []).length > 1) return null;
                const v = limpio === "" ? 0 : Number(limpio);
                if (isNaN(v)) return null;
                out.push({ t: "n", v: v + extra });
            } else if ("+-*/()".includes(c)) { out.push({ t: c }); i++; }
            else return null;
        }
        return out;
    }
    function evaluar(texto) {
        const f = fichas(texto);
        if (!f || !f.length) return null;
        let k = 0;
        const ver = () => f[k] && f[k].t;
        function expr() {
            let v = termino();
            while (v !== null && (ver() === "+" || ver() === "-")) { const op = f[k++].t; const w = termino(); if (w === null) return null; v = op === "+" ? v + w : v - w; }
            return v;
        }
        function termino() {
            let v = factor();
            while (v !== null && (ver() === "*" || ver() === "/")) { const op = f[k++].t; const w = factor(); if (w === null) return null; if (op === "/" && w === 0) return null; v = op === "*" ? v * w : v / w; }
            return v;
        }
        function factor() {
            if (ver() === "-") { k++; const v = factor(); return v === null ? null : -v; }
            if (ver() === "+") { k++; return factor(); }
            if (ver() === "(") { k++; const v = expr(); if (ver() !== ")") return null; k++; return v; }
            if (ver() === "n") return f[k++].v;
            return null;
        }
        const v = expr();
        return v === null || k !== f.length || !isFinite(v) ? null : v;
    }
    /* Una lista de números: se separan con espacios, punto y coma o «, ». Una
       coma pegada entre cifras es decimal (9,25), salvo que después vengan 4
       cifras o más (2188,2405: dos Elo), que es lo que se escribe con los Elo. */
    function separarLista(texto) {
        return String(texto || "").replace(/,(?=\d{4})/g, " ").split(/;|\s+|,\s+/).map((x) => x.trim()).filter(Boolean);
    }
    /* ¿El texto es una cuenta (no solo un número)? */
    const esCuenta = (texto) => /[0-9½¼¾)]\s*[+\-×xX*÷/−–]\s*[0-9½¼¾(]/.test(String(texto || "")) || /^\s*\(/.test(String(texto || ""));
    /* El número como se escribe en Costa Rica: coma decimal, hasta 4 decimales. */
    function formato(v) {
        if (v == null || !isFinite(v)) return "";
        const r = Math.round(v * 10000) / 10000;
        return String(r).replace(".", ",");
    }

    /* ---------- cuentas con tiempos (los relojes) ----------
       En una cuenta con «h:mm:ss» o «m:ss», cada tiempo se pasa a segundos y
       un número suelto también son segundos: «1:12:40 − 0:05:00»,
       «0:30 × 12» (doce incrementos de 30 s), «1:10:00 × 9 ÷ 12». El
       resultado vuelve a h:mm:ss. Es la misma lectura que AulaAjuste.leerTiempo. */
    const TIEMPO = /\d+(?::\d{1,2}){1,2}/g;
    const esTiempo = (texto) => /\d:\d{1,2}/.test(String(texto || ""));
    function aSegundos(t) {
        const p = t.split(":").map(Number);
        return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    }
    /* La cuenta con tiempos, en segundos (o null). */
    function evaluarTiempo(texto) {
        if (!esTiempo(texto)) return null;
        return evaluar(String(texto).replace(TIEMPO, (t) => String(aSegundos(t))));
    }
    /* Segundos → «h:mm:ss» (redondeado al segundo; con signo si es negativo). */
    function formatoTiempo(seg) {
        if (seg == null || !isFinite(seg)) return "";
        const neg = seg < 0, x = Math.round(Math.abs(seg));
        const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), ss = x % 60;
        return (neg ? "−" : "") + h + ":" + String(m).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
    }
    /* Lo que escribió la persona en un campo de tiempo, en milisegundos, si es una cuenta (si no, null: lo lee leerTiempo). */
    function tiempoDeCuenta(texto) {
        if (!esCuenta(texto)) return null;
        const v = evaluarTiempo(texto);
        return v === null || v < 0 ? null : Math.round(v) * 1000;
    }

    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    let serie = 0;

    /* ---------- los campos que aceptan una cuenta ---------- */
    function campos(cont) {
        cont.querySelectorAll("input[data-calc]").forEach((inp) => {
            if (inp.dataset.calcListo) return;
            inp.dataset.calcListo = "1";
            const sal = document.createElement("output");
            sal.className = "aula-calc-eco";
            sal.id = (inp.id || "aula-campo-" + (++serie)) + "-eco";
            sal.setAttribute("for", inp.id || "");
            sal.setAttribute("aria-live", "polite");
            inp.insertAdjacentElement("afterend", sal);
            const describir = (inp.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
            describir.push(sal.id);
            inp.setAttribute("aria-describedby", describir.join(" "));
            const deTiempo = inp.dataset.calc === "tiempo";
            const pintar = () => {
                const t = inp.value;
                if (!esCuenta(t)) { sal.textContent = ""; return; }
                if (deTiempo) { const v = evaluarTiempo(t); sal.textContent = v === null ? "La cuenta no está completa (escribe los tiempos como h:mm:ss)" : "= " + formatoTiempo(v); return; }
                const v = evaluar(t);
                sal.textContent = v === null ? "La cuenta no está completa" : "= " + formato(v);
            };
            inp.addEventListener("input", pintar);
            pintar();
        });
    }

    /* ---------- las tablas de FIDE ---------- */
    /* La tabla del dp, de 0 a 100 %, con el dp que da `dpDe(porcentaje)`. */
    function tablaDpCon(dpDe, titulo, nota) {
        let filas = "";
        const signo = (v) => (v > 0 ? "+" + v : v < 0 ? "−" + Math.abs(v) : "0");
        for (let p = 0; p <= 50; p++) {
            const q = 100 - p;
            filas += "<tr><td>" + p + " %</td><td>" + signo(dpDe(p)) + "</td><td>" + q + " %</td><td>" + signo(dpDe(q)) + "</td></tr>";
        }
        return '<h4 class="aula-ay-tit">' + titulo + '</h4><p class="aula-nota">' + nota + "</p>" +
            '<div class="aula-tabla aula-ay-dp"><table><caption class="sr-only">Porcentaje de puntos y su dp</caption><thead><tr><th scope="col">%</th><th scope="col">dp</th><th scope="col">%</th><th scope="col">dp</th></tr></thead><tbody>' + filas + "</tbody></table></div>";
    }
    /* Para las normas: la de js/normas-titulo.js, con el porcentaje redondeado (1.4.9). */
    function tablaDp() {
        const N = raiz.NormasTitulo;
        if (!N) return "";
        return tablaDpCon((p) => N.DP[p], "Tabla del dp (B.01, 1.4.9)", "El porcentaje se redondea al entero (0,5 hacia arriba) antes de buscarlo. Rp = Ra + dp.");
    }
    /* Para el desempate por rendimiento (TPR, APRO): la del motor de Pareo
       Integral (js/pareo/desempates.js, tabla 8.1b de B.02), que con un
       porcentaje que no está en la tabla interpola entre los dos vecinos. */
    function tablaDpDesempate() {
        const P = raiz.PareoDesempates;
        if (!P || !P.dpDeP) return "";
        return tablaDpCon((p) => P.dpDeP(p / 100), "Tabla del dp para el rendimiento (B.02, tabla 8.1b)",
            "TPR = Elo medio de los rivales (ARO) + dp, redondeado al entero. Si el porcentaje no está en la tabla (por ejemplo 61,1 %), el dp se interpola entre los dos valores vecinos.");
    }
    function tablaNormas() {
        const N = raiz.NormasTitulo;
        if (!N) return "";
        return '<h4 class="aula-ay-tit">Lo que pide cada norma (B.01)</h4><div class="aula-tabla"><table><caption class="sr-only">Mínimos de cada norma de título</caption><thead><tr><th scope="col">Norma</th><th scope="col">Piso del rival más bajo (1.4.6)</th><th scope="col">Ra mínimo (1.4.8)</th><th scope="col">Rp mínimo (1.4.8)</th></tr></thead><tbody>' +
            Object.keys(N.NORMAS).map((k) => { const x = N.NORMAS[k]; return "<tr><td>" + esc(x.nombre) + "</td><td>" + x.piso + "</td><td>" + x.promedio + "</td><td>" + x.rp + "</td></tr>"; }).join("") +
            '</tbody></table></div><p class="aula-nota">Además: al menos 9 partidas y el 35 % de los puntos; un rival sin Elo cuenta 1400; al menos dos federaciones distintas de la del jugador, la mitad de los rivales con título y un tercio (mínimo 3) con el título de la norma o uno mayor (1.4.1 a 1.4.5).</p>';
    }
    function tablaDesempates(codigos) {
        const P = raiz.PareoDesempates;
        if (!P) return "";
        const lista = P.CATALOGO.filter((c) => !codigos || codigos.includes(c.codigo));
        return '<h4 class="aula-ay-tit">Los desempates (C.07, 2026)</h4><ul class="aula-pasos">' + lista.map((c) => "<li><b>" + esc(c.codigo) + "</b>: " + esc(c.es) + "</li>").join("") + "</ul>" +
            '<p class="aula-nota">Cada desempate se calcula solo para los que siguen empatados (art. 4.2). Las rondas no jugadas cuentan como dicen los arts. 15 y 16.</p>';
    }
    const TABLAS = { dp: tablaDp, "dp-desempate": tablaDpDesempate, normas: tablaNormas, desempates: tablaDesempates };

    /* ---------- la calculadora de bolsillo ---------- */
    function calculadoraHTML(id) {
        return '<div class="aula-ay-calc"><label for="' + id + '-ex">Escribe la cuenta<input id="' + id + '-ex" autocomplete="off" inputmode="decimal" placeholder="por ejemplo (2188 + 2405 + 2444) / 3"></label>' +
            '<div class="aula-fila-ctrl"><button type="button" class="aula-btn aula-btn-pri" data-ay="igual">Calcular</button><button type="button" class="aula-btn aula-btn-sec" data-ay="borrar">Borrar</button></div>' +
            '<p class="aula-ay-res" aria-live="polite" data-ay="res"></p>' +
            '<label for="' + id + '-lista">Promedio de una lista (separa los números con comas o espacios)<input id="' + id + '-lista" autocomplete="off" inputmode="decimal" placeholder="2188, 2405, 2444, 2320"></label>' +
            '<p class="aula-ay-res" aria-live="polite" data-ay="prom"></p>' +
            '<details class="aula-detalle"><summary>Lo que ya calculaste</summary><ol class="aula-ay-hist" data-ay="hist"></ol></details>' +
            '<p class="aula-nota">Acepta + − × ÷ (también * y /), paréntesis, coma o punto decimal, y ½, ¼, ¾ (por ejemplo 9½). También tiempos: «1:12:40 − 0:05:00» o «0:30 × 12»; en una cuenta con tiempos, un número suelto son segundos.</p></div>';
    }
    function activarCalculadora(caja) {
        const ex = caja.querySelector("input[id$='-ex']"), lista = caja.querySelector("input[id$='-lista']");
        const res = caja.querySelector("[data-ay=res]"), prom = caja.querySelector("[data-ay=prom]"), hist = caja.querySelector("[data-ay=hist]");
        const calcular = () => {
            const conTiempo = esTiempo(ex.value);
            const v = conTiempo ? evaluarTiempo(ex.value) : evaluar(ex.value);
            if (v === null) { res.textContent = ex.value.trim() ? "Revisa la cuenta: hay algo que no se entiende." : ""; return; }
            const texto = conTiempo ? formatoTiempo(v) + " (" + formato(Math.round(v)) + " s)" : formato(v);
            res.textContent = ex.value.trim() + " = " + texto;
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button"; b.className = "aula-ay-reusar";
            b.textContent = ex.value.trim() + " = " + texto;
            b.addEventListener("click", () => { ex.value = conTiempo ? formatoTiempo(v) : formato(v); ex.focus(); });
            li.appendChild(b); hist.prepend(li);
        };
        caja.querySelector("[data-ay=igual]").addEventListener("click", calcular);
        ex.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); calcular(); } });
        caja.querySelector("[data-ay=borrar]").addEventListener("click", () => { ex.value = ""; res.textContent = ""; ex.focus(); });
        lista.addEventListener("input", () => {
            const partes = separarLista(lista.value);
            const vals = partes.map(evaluar);
            if (!partes.length) { prom.textContent = ""; return; }
            if (vals.some((v) => v === null)) { prom.textContent = "Hay un número que no se entiende."; return; }
            const suma = vals.reduce((a, b) => a + b, 0);
            prom.textContent = vals.length + " números · suma " + formato(suma) + " · promedio " + formato(suma / vals.length);
        });
    }

    /* ---------- la barra de un ejercicio ---------- */
    function barra(cont, opc) {
        const o = opc || {};
        const id = "aula-ay" + (++serie);
        const botones = [["calc", "🧮", "Calculadora"]];
        if (o.tablas && o.tablas.length) botones.push(["tablas", "📋", "Tablas de FIDE"]);
        if (o.pista) botones.push(["pista", "💡", "¿Cómo se calcula?"]);
        const nav = document.createElement("div");
        nav.className = "aula-ayudas";
        nav.innerHTML = '<div class="aula-fila-ctrl" role="group" aria-label="Ayudas para calcular">' +
            botones.map((b) => '<button type="button" class="aula-btn aula-btn-sec aula-ay-btn" aria-expanded="false" aria-controls="' + id + "-" + b[0] + '" data-panel="' + b[0] + '"><span aria-hidden="true">' + b[1] + "</span> " + b[2] + "</button>").join("") + "</div>" +
            '<div id="' + id + '-calc" class="aula-ay-panel" hidden>' + calculadoraHTML(id) + "</div>" +
            (o.tablas && o.tablas.length ? '<div id="' + id + '-tablas" class="aula-ay-panel" hidden>' + o.tablas.map((t) => (typeof t === "string" ? (TABLAS[t] ? TABLAS[t]() : "") : TABLAS[t.tipo](t.codigos))).join("") + "</div>" : "") +
            (o.pista ? '<div id="' + id + '-pista" class="aula-ay-panel" hidden><h4 class="aula-ay-tit">Cómo se calcula</h4>' + o.pista + '<p class="aula-nota">Usar la pista no te quita el ejercicio, pero queda anotado como resuelto con pista.</p></div>' : "");
        /* Va justo antes de lo que se calcula (opc.antes), para no separar el enunciado de sus datos. */
        const antes = o.antes ? cont.querySelector(o.antes) : null;
        if (antes) antes.insertAdjacentElement("beforebegin", nav); else cont.prepend(nav);
        activarCalculadora(nav.querySelector("#" + id + "-calc"));
        let pistaUsada = false;
        nav.querySelectorAll(".aula-ay-btn").forEach((b) => b.addEventListener("click", () => {
            const panel = nav.querySelector("#" + b.getAttribute("aria-controls"));
            const abrir = panel.hidden;
            panel.hidden = !abrir;
            b.setAttribute("aria-expanded", String(abrir));
            if (abrir && b.dataset.panel === "calc") nav.querySelector("input[id$='-ex']").focus();
            if (abrir && b.dataset.panel === "pista" && !pistaUsada) { pistaUsada = true; if (o.alUsarPista) o.alUsarPista(); }
        }));
        campos(cont);
        return { conPista: () => pistaUsada };
    }

    const api = { evaluar, esCuenta, formato, separarLista, esTiempo, evaluarTiempo, formatoTiempo, tiempoDeCuenta, campos, barra, tablaDp, tablaDpDesempate, tablaNormas, tablaDesempates };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    raiz.AulaAyudas = api;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
