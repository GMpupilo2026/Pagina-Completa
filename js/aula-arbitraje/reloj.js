/* Aula de Arbitraje — el reloj de ajedrez para practicar.

   Un reloj digital con periodos y control de jugadas (90/40 + 30), incremento
   desde la primera jugada, contador de jugadas por jugador, bandera, pausa del
   árbitro y velocidad ×10 o ×60 para practicar sin esperar. El panel «Ajuste
   del árbitro» cambia tiempos, jugadas completadas y turno, y suma las
   sanciones de 2 o 1 minuto: es lo que se hace en la sala después de una
   irregularidad (Leyes del Ajedrez 2023, arts. 6.10.2 y 7.1).

   Todo reloj del Aula lleva la marca de Ajedrez Integral: la marca de agua
   en pequeño en el centro de la pantalla, entre los dos tiempos, y la placa
   con el logo en el cuerpo. Es a propósito (lo pidió el dueño): quien
   comparte una captura de lo que practica muestra de dónde estudia.

   El tiempo del periodo siguiente se suma cuando el jugador completa la
   jugada que cierra el control (como los relojes DGT con contador). Todo el
   texto que pinta es del propio reloj: nada de lo que escribe una persona
   entra como HTML. Ver «Aula de Arbitraje» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    if (window.AulaReloj) return;
    const A = window.AulaAjuste;

    const RITMOS = {
        "clasico-inc": { nombre: "90 min/40 + 30 min + 30 s (estándar)", periodos: [{ min: 90, jugadas: 40 }, { min: 30 }], inc: 30 },
        "clasico-sin": { nombre: "2 h/40 + 1 h, sin incremento", periodos: [{ min: 120, jugadas: 40 }, { min: 60 }], inc: 0 },
        "60-30": { nombre: "60 min + 30 s (estándar)", periodos: [{ min: 60 }], inc: 30 },
        "rapida": { nombre: "15 min + 10 s (rápida)", periodos: [{ min: 15 }], inc: 10 },
        "blitz": { nombre: "3 min + 2 s (relámpago)", periodos: [{ min: 3 }], inc: 2 },
    };
    const NOMBRE = { w: "blancas", b: "negras" };

    let cuenta = 0;
    function Reloj(el, opts) {
        opts = opts || {};
        this.el = el;
        this.uid = "aula-reloj-" + (++cuenta);
        this.permitirConfig = opts.permitirConfig !== false;
        this.velocidad = 1;
        this.registro = [];
        this.configurar(opts.ritmo || RITMOS["clasico-inc"], true);
        if (opts.estado) this.fijarEstado(opts.estado, true);
        this.pintarDom();
        this._loop = (ts) => {
            if (this.muerto) return;
            if (this.corriendo && this.ultimo != null) {
                const lado = this.turno;
                this.t[lado] -= (ts - this.ultimo) * this.velocidad;
                if (this.t[lado] <= 0) {
                    this.t[lado] = 0;
                    if (!this.bandera[lado]) { this.bandera[lado] = true; this.anotar("Cae la bandera de las " + NOMBRE[lado] + "."); this.pausar(); }
                }
            }
            this.ultimo = ts;
            this.pintar();
            requestAnimationFrame(this._loop);
        };
        requestAnimationFrame(this._loop);
    }
    Reloj.RITMOS = RITMOS;

    Reloj.prototype.configurar = function (ritmo, callado) {
        this.ritmo = JSON.parse(JSON.stringify(ritmo));
        const base = this.ritmo.periodos[0].min * 60000;
        this.t = { w: base, b: base };
        this.jugadas = { w: 0, b: 0 };
        this.turno = "w";
        this.corriendo = false;
        this.bandera = { w: false, b: false };
        if (!callado) this.anotar("Reloj programado: " + (this.ritmo.nombre || "ritmo propio") + ".");
    };

    Reloj.prototype.pulsar = function (lado) {
        if (!this.corriendo || lado !== this.turno || this.bandera[lado]) return;
        this.jugadas[lado]++;
        this.t[lado] += (this.ritmo.inc || 0) * 1000;
        let acum = 0;
        for (let i = 0; i < this.ritmo.periodos.length - 1; i++) {
            acum += this.ritmo.periodos[i].jugadas || 0;
            if (this.jugadas[lado] === acum) {
                this.t[lado] += this.ritmo.periodos[i + 1].min * 60000;
                this.anotar("Las " + NOMBRE[lado] + " completan la jugada " + acum + ": se suman " + this.ritmo.periodos[i + 1].min + " min.");
            }
        }
        this.turno = lado === "w" ? "b" : "w";
    };
    Reloj.prototype.iniciar = function () {
        if (this.bandera[this.turno] || this.corriendo) return;
        this.corriendo = true; this.ultimo = null; this.anotar("Reloj en marcha.");
    };
    Reloj.prototype.pausar = function () { this.corriendo = false; };

    Reloj.prototype.estado = function () {
        return { w: Math.round(this.t.w), b: Math.round(this.t.b), jw: this.jugadas.w, jb: this.jugadas.b, turno: this.turno };
    };
    Reloj.prototype.fijarEstado = function (e, callado) {
        if (e.w != null) this.t.w = e.w;
        if (e.b != null) this.t.b = e.b;
        if (e.jw != null) this.jugadas.w = e.jw;
        if (e.jb != null) this.jugadas.b = e.jb;
        if (e.turno) this.turno = e.turno;
        this.bandera = { w: this.t.w <= 0, b: this.t.b <= 0 };
        if (!callado) this.anotar("Ajuste del árbitro: blancas " + A.tiempo(this.t.w) + ", negras " + A.tiempo(this.t.b) + ", jugadas " + this.jugadas.w + " / " + this.jugadas.b + ", juegan las " + NOMBRE[this.turno] + ".");
    };
    Reloj.prototype.anotar = function (txt) {
        this.registro.unshift(txt);
        if (this.registro.length > 30) this.registro.pop();
        if (!this.$registro) return;
        this.$registro.replaceChildren(...this.registro.map((r) => { const li = document.createElement("li"); li.textContent = r; return li; }));
    };

    Reloj.prototype.pintarDom = function () {
        const u = this.uid;
        const opciones = Object.keys(RITMOS).map((k) => '<option value="' + k + '">' + RITMOS[k].nombre + "</option>").join("");
        this.el.innerHTML =
            '<div class="aula-reloj">' +
              '<div class="aula-reloj-cuerpo">' +
                '<button type="button" class="aula-palanca" data-lado="w" aria-label="Pulsar el reloj de las blancas"></button>' +
                '<button type="button" class="aula-palanca" data-lado="b" aria-label="Pulsar el reloj de las negras"></button>' +
                '<div class="aula-lcd" role="group" aria-label="Pantalla del reloj">' +
                  '<div class="aula-lado" data-lado="w"><span class="aula-quien">BLANCAS</span><span class="aula-dig" aria-live="off"></span><span class="aula-mov"></span></div>' +
                  '<div class="aula-lado" data-lado="b"><span class="aula-quien">NEGRAS</span><span class="aula-dig" aria-live="off"></span><span class="aula-mov"></span></div>' +
                  '<img class="aula-lcd-marca" src="/img/marca-agua-ajedrez-integral.png" alt="" width="760" height="564">' +
                "</div>" +
                '<div class="aula-reloj-marca"><img src="/img/logo-marca.png" alt="" width="155" height="96"><span>Ajedrez <b>Integral</b></span></div>' +
                '<div class="aula-botonera">' +
                  '<button type="button" data-accion="iniciar"><span aria-hidden="true">▶ </span>Iniciar</button>' +
                  '<button type="button" data-accion="pausa"><span aria-hidden="true">❚❚ </span>Pausa del árbitro</button>' +
                  '<label class="aula-vel" for="' + u + '-vel">Velocidad <select id="' + u + '-vel" data-accion="velocidad"><option value="1">×1, real</option><option value="10">×10</option><option value="60">×60</option></select></label>' +
                "</div>" +
              "</div>" +
              '<p class="aula-pista">Pulsa la palanca del jugador que acaba de mover (o las teclas <kbd>A</kbd> para las blancas y <kbd>L</kbd> para las negras).</p>' +
              (this.permitirConfig ?
                '<details class="aula-panel"><summary>Ritmo de juego</summary><div class="aula-panel-in">' +
                  '<label for="' + u + '-ritmo">Ritmo<select id="' + u + '-ritmo" data-accion="ritmo">' + opciones + '<option value="propio">Uno propio…</option></select></label>' +
                  '<div data-propio hidden class="aula-fila3">' +
                    '<label for="' + u + '-p1">Periodo 1 (min)<input id="' + u + '-p1" type="number" min="1" value="90"></label>' +
                    '<label for="' + u + '-pj">Jugadas del control<input id="' + u + '-pj" type="number" min="0" value="40"></label>' +
                    '<label for="' + u + '-p2">Periodo 2 (min)<input id="' + u + '-p2" type="number" min="0" value="30"></label>' +
                    '<label for="' + u + '-inc">Incremento (s)<input id="' + u + '-inc" type="number" min="0" value="30"></label>' +
                  "</div>" +
                  '<div><button type="button" class="aula-btn aula-btn-sec" data-accion="programar">Programar y poner en cero</button></div>' +
                "</div></details>" : "") +
              '<details class="aula-panel" open><summary>Ajuste del árbitro</summary><div class="aula-panel-in">' +
                '<div class="aula-fila2">' +
                  '<label for="' + u + '-tw">Tiempo de las blancas<input id="' + u + '-tw" data-campo="tw" inputmode="numeric" placeholder="h:mm:ss" autocomplete="off"></label>' +
                  '<label for="' + u + '-tb">Tiempo de las negras<input id="' + u + '-tb" data-campo="tb" inputmode="numeric" placeholder="h:mm:ss" autocomplete="off"></label>' +
                  '<label for="' + u + '-jw">Jugadas completadas de las blancas<input id="' + u + '-jw" data-campo="jw" type="number" min="0"></label>' +
                  '<label for="' + u + '-jb">Jugadas completadas de las negras<input id="' + u + '-jb" data-campo="jb" type="number" min="0"></label>' +
                "</div>" +
                '<label for="' + u + '-turno">Le toca jugar a<select id="' + u + '-turno" data-campo="turno"><option value="w">Las blancas</option><option value="b">Las negras</option></select></label>' +
                '<div class="aula-sanciones">' +
                  '<button type="button" class="aula-btn aula-btn-sec" data-suma="w" data-ms="120000">+2:00 blancas</button>' +
                  '<button type="button" class="aula-btn aula-btn-sec" data-suma="b" data-ms="120000">+2:00 negras</button>' +
                  '<button type="button" class="aula-btn aula-btn-sec" data-suma="w" data-ms="60000">+1:00 blancas</button>' +
                  '<button type="button" class="aula-btn aula-btn-sec" data-suma="b" data-ms="60000">+1:00 negras</button>' +
                "</div>" +
                '<div class="aula-acciones"><button type="button" class="aula-btn aula-btn-sec" data-accion="leer">Leer el reloj</button><button type="button" class="aula-btn aula-btn-pri" data-accion="aplicar">Aplicar el ajuste</button></div>' +
                '<p class="aula-aviso-ajuste" role="status"></p>' +
              "</div></details>" +
              '<details class="aula-panel"><summary>Lo que pasó en el reloj</summary><ul class="aula-registro"></ul></details>' +
            "</div>";
        const q = (s) => this.el.querySelector(s);
        this.$lados = { w: q('.aula-lado[data-lado="w"]'), b: q('.aula-lado[data-lado="b"]') };
        this.$palancas = { w: q('.aula-palanca[data-lado="w"]'), b: q('.aula-palanca[data-lado="b"]') };
        this.$registro = q(".aula-registro");
        this.$aviso = q(".aula-aviso-ajuste");
        this.anotar("Listo.");
        this.$palancas.w.addEventListener("click", () => this.pulsar("w"));
        this.$palancas.b.addEventListener("click", () => this.pulsar("b"));
        q('[data-accion="iniciar"]').addEventListener("click", () => this.iniciar());
        q('[data-accion="pausa"]').addEventListener("click", () => { if (this.corriendo) { this.pausar(); this.anotar("Pausa del árbitro."); } });
        q('[data-accion="velocidad"]').addEventListener("change", (e) => { this.velocidad = Number(e.target.value) || 1; });
        if (this.permitirConfig) {
            const sel = q('[data-accion="ritmo"]');
            sel.addEventListener("change", () => { q("[data-propio]").hidden = sel.value !== "propio"; });
            q('[data-accion="programar"]').addEventListener("click", () => {
                let r;
                if (sel.value === "propio") {
                    const v = (id) => Math.max(0, Number(q("#" + u + "-" + id).value) || 0);
                    const p1 = Math.max(1, v("p1")), pj = v("pj"), p2 = v("p2"), inc = v("inc");
                    r = { nombre: p1 + " min" + (pj && p2 ? "/" + pj + " + " + p2 + " min" : "") + (inc ? " + " + inc + " s" : ""), periodos: pj && p2 ? [{ min: p1, jugadas: pj }, { min: p2 }] : [{ min: p1 }], inc };
                } else r = RITMOS[sel.value];
                this.configurar(r); this.leerAlPanel();
            });
        }
        q('[data-accion="leer"]').addEventListener("click", () => { this.pausar(); this.leerAlPanel(); });
        this.el.querySelectorAll("[data-suma]").forEach((b) => b.addEventListener("click", () => {
            const lado = b.dataset.suma, inp = q('[data-campo="t' + lado + '"]');
            let v = A.leerTiempo(inp.value);
            if (v == null) v = this.t[lado];
            const ms = Number(b.dataset.ms);
            inp.value = A.tiempo(v + ms);
            this.$aviso.textContent = "Se sumaron " + (ms / 60000) + ":00 a las " + NOMBRE[lado] + " en el panel. Pulsa «Aplicar el ajuste» para pasarlo al reloj.";
        }));
        q('[data-accion="aplicar"]').addEventListener("click", () => {
            const tw = A.leerTiempo(q('[data-campo="tw"]').value), tb = A.leerTiempo(q('[data-campo="tb"]').value);
            if (tw == null || tb == null) { this.$aviso.textContent = "Escribe los tiempos como h:mm:ss (por ejemplo 0:52:32)."; return; }
            this.pausar();
            this.fijarEstado({ w: tw, b: tb, jw: Math.max(0, Number(q('[data-campo="jw"]').value) || 0), jb: Math.max(0, Number(q('[data-campo="jb"]').value) || 0), turno: q('[data-campo="turno"]').value });
            this.$aviso.textContent = "Ajuste aplicado. El reloj queda en pausa: pulsa «Iniciar» para seguir.";
        });
        this.leerAlPanel();
        this._teclas = (e) => {
            if (this.muerto || !this.el.isConnected || !this.el.checkVisibility()) return;
            if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA|BUTTON/.test((e.target && e.target.tagName) || "")) return;
            if (e.key === "a" || e.key === "A") this.pulsar("w");
            if (e.key === "l" || e.key === "L") this.pulsar("b");
        };
        document.addEventListener("keydown", this._teclas);
        this.pintar();
    };

    Reloj.prototype.leerAlPanel = function () {
        const q = (s) => this.el.querySelector(s);
        q('[data-campo="tw"]').value = A.tiempo(this.t.w);
        q('[data-campo="tb"]').value = A.tiempo(this.t.b);
        q('[data-campo="jw"]').value = this.jugadas.w;
        q('[data-campo="jb"]').value = this.jugadas.b;
        q('[data-campo="turno"]').value = this.turno;
        this.$aviso.textContent = "";
    };

    Reloj.prototype.pintar = function () {
        if (!this.$lados) return;
        ["w", "b"].forEach((l) => {
            const caja = this.$lados[l];
            caja.querySelector(".aula-dig").textContent = (this.bandera[l] ? "⚑ " : "") + A.tiempo(this.t[l], true);
            caja.querySelector(".aula-mov").textContent = "Jug. " + this.jugadas[l];
            caja.classList.toggle("activo", this.turno === l);
            caja.classList.toggle("corre", this.turno === l && this.corriendo);
            caja.classList.toggle("caida", this.bandera[l]);
            this.$palancas[l].classList.toggle("arriba", this.turno === l);
            this.$palancas[l].setAttribute("aria-pressed", this.turno === l ? "false" : "true");
        });
    };

    Reloj.prototype.destruir = function () {
        document.removeEventListener("keydown", this._teclas);
        this.corriendo = false;
        this.muerto = true;
    };

    window.AulaReloj = Reloj;
})();

/*! rev bfb5bbb0d2d82f9f */
