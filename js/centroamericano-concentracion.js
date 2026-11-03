/* «Modo concentración» de la tablet del árbitro (centroamericano-arbitro.html).

   La organización lo enciende en un enlace (o en todos). Entonces la tablet:
     1. pide pantalla completa (con un toque: un navegador no la da sin un gesto de la persona);
     2. si el árbitro se SALE (cambia de pestaña o de aplicación, minimiza, apaga la pantalla o sale de la pantalla
        completa), le TAPA todo con un aviso y no lo deja usar la página hasta que toca «Volver a la mesa»;
     3. le avisa a la función (acción «salida», fases «sale» y «vuelve») para que la organización lo vea con su hora y
        cuánto duró. La hora y la duración las pone la función con su reloj, no la tablet.

   Una página NO puede bloquear el aparato de verdad: eso es «Fijar pantalla» (Android) o «Acceso guiado» (iPad), y lo dice
   el aviso. Lo que esto hace es tapar y dejar constancia. Sin pantalla completa disponible (un celular de Apple) se
   vigila solo el cambio de pestaña o de aplicación.

   `pausa(ms)`: la cámara del aparato (la foto de las planillas) saca al navegador de la página a propósito; durante esa
   pausa la salida no se cuenta ni se tapa nada (al volver, si hace falta, se pide otro toque para la pantalla completa).
   `pausa(0)` la termina: la página la llama apenas la foto sale de la cámara.

   Sin ruido: en un torneo no suena nada; el aviso es visual. Todo texto va por textContent. Ver «El modo concentración
   de las tablets» en docs/decisiones/juegos-y-torneos.md. */
(function (global) {
    "use strict";

    const TEXTO_MOTIVO = {
        oculta: "Cambiaste de pestaña o de aplicación, o se apagó la pantalla.",
        pantalla_completa: "Saliste de la pantalla completa.",
        sin_foco: "La página perdió el foco.",
    };

    const enPantallaCompleta = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    async function pedirPantallaCompleta() {
        const raiz = document.documentElement;
        const f = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
        if (!f) return false;
        try { await f.call(raiz); return true; } catch (e) { return false; }
    }
    function salirDePantallaCompleta() {
        try { (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document); } catch (e) { /* ya no está */ }
    }

    function el(tag, atributos, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(atributos || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }

    /* `pedir(cuerpo)` manda un pedido a la acción «salida» de la función y devuelve una promesa. `ahora()` es solo para
       las pruebas. */
    function crear({ pedir, ahora = () => Date.now() }) {
        let activo = false;
        let estado = "libre";        // libre | entrar | dentro | fuera
        let conPantallaCompleta = false; // si se logró la pantalla completa (si no, solo se vigila el cambio de pestaña)
        let ignorarHasta = 0;        // la cámara del aparato: hasta cuándo no cuenta salir
        let desde = 0, motivo = "oculta";
        let caja = null, reloj = null;
        let envios = Promise.resolve();
        const pendientes = [];

        // ---- avisarle a la función, en orden y sin perder uno si no hay señal
        function enviar(cuerpo) { pendientes.push(cuerpo); vaciar(); }
        function vaciar() {
            envios = envios.then(async () => {
                while (pendientes.length) {
                    try { await pedir(pendientes[0]); pendientes.shift(); }
                    catch (e) { if (e && (e.http === 404 || e.http === 410 || e.http === 400)) pendientes.shift(); else return; /* sin señal: se reintenta al próximo aviso */ }
                }
            });
        }

        // ---- la pantalla que tapa
        function quitarCaja() {
            clearInterval(reloj); reloj = null;
            if (caja) { caja.remove(); caja = null; }
            for (const n of document.body.children) n.removeAttribute("inert");
        }
        function poner(titulo, parrafos, textoBoton, alPulsar, conTiempo) {
            quitarCaja();
            const tiempo = conTiempo ? el("p", { class: "cam-conc-tiempo", role: "timer", "aria-live": "off" }) : null;
            const boton = el("button", { type: "button", class: "cam-btn cam-btn-claro cam-conc-boton", "data-accion": "conc-boton" }, textoBoton);
            boton.addEventListener("click", alPulsar);
            caja = el("div", { id: "concentracion", class: "cam-conc", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "conc-titulo", "aria-describedby": "conc-texto", "data-estado": estado },
                el("div", { class: "cam-conc-tarjeta" },
                    el("p", { class: "cam-conc-icono", "aria-hidden": "true", texto: "🔒" }),
                    el("h2", { id: "conc-titulo", class: "cam-conc-titulo", texto: titulo }),
                    el("div", { id: "conc-texto" }, parrafos.map((t) => el("p", { texto: t }))),
                    tiempo, boton));
            document.body.append(caja);
            for (const n of document.body.children) if (n !== caja) n.setAttribute("inert", "");
            if (tiempo) {
                const pintar = () => { const s = Math.max(0, Math.round((ahora() - desde) / 1000)); tiempo.textContent = "Llevas " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " fuera de tus mesas."; };
                pintar(); reloj = setInterval(pintar, 1000);
            }
            boton.focus();
        }
        const CONSEJO = "Para bloquear la tablet de verdad, pide «Fijar pantalla» (Android) o «Acceso guiado» (iPad).";
        function mostrarEntrar() {
            estado = "entrar";
            poner("Modo concentración", [
                "La organización activó el modo concentración en tu tablet. Toca «Entrar a la mesa»: pasa a pantalla completa y, si sales de ella, la pantalla se tapa hasta que vuelvas.",
                CONSEJO,
            ], "Entrar a la mesa", entrar, false);
        }
        function mostrarFuera() {
            poner("Saliste de tus mesas", [
                TEXTO_MOTIVO[motivo] || TEXTO_MOTIVO.oculta,
                "La organización lo ve. Toca «Volver a la mesa» para seguir con tus resultados.",
            ], "Volver a la mesa", volver, true);
        }

        async function entrar() {
            conPantallaCompleta = await pedirPantallaCompleta();
            estado = "dentro"; quitarCaja();
        }
        async function volver() {
            const seg = Math.max(0, Math.round((ahora() - desde) / 1000));
            const ok = await pedirPantallaCompleta();
            conPantallaCompleta = ok || conPantallaCompleta;
            estado = "dentro"; quitarCaja();
            enviar({ fase: "vuelve", motivo, segundos: seg });
        }

        function salir(porque) {
            if (!activo || estado !== "dentro" || ahora() < ignorarHasta) return;
            estado = "fuera"; desde = ahora(); motivo = porque;
            mostrarFuera();
            enviar({ fase: "sale", motivo: porque });
        }

        // ---- lo que vigila
        function alCambiarVisibilidad() {
            if (!activo) return;
            if (document.hidden) { salir("oculta"); return; }
            // De vuelta de la cámara del aparato (una pausa legítima) sin la pantalla completa: se pide otro toque, sin anotar nada.
            if (estado === "dentro" && conPantallaCompleta && !enPantallaCompleta()) mostrarEntrar();
        }
        function alCambiarPantallaCompleta() {
            if (!activo || estado !== "dentro" || !conPantallaCompleta || enPantallaCompleta()) return;
            if (ahora() < ignorarHasta) mostrarEntrar(); else salir("pantalla_completa");
        }
        function antesDeCerrar(e) { if (activo && estado !== "libre") { e.preventDefault(); e.returnValue = ""; } }

        function encender() {
            activo = true;
            document.addEventListener("visibilitychange", alCambiarVisibilidad);
            document.addEventListener("fullscreenchange", alCambiarPantallaCompleta);
            document.addEventListener("webkitfullscreenchange", alCambiarPantallaCompleta);
            window.addEventListener("beforeunload", antesDeCerrar);
            if (enPantallaCompleta()) { conPantallaCompleta = true; estado = "dentro"; } else mostrarEntrar();
        }
        function apagar() {
            const estabaFuera = estado === "fuera";
            const seg = Math.max(0, Math.round((ahora() - desde) / 1000));
            activo = false;
            document.removeEventListener("visibilitychange", alCambiarVisibilidad);
            document.removeEventListener("fullscreenchange", alCambiarPantallaCompleta);
            document.removeEventListener("webkitfullscreenchange", alCambiarPantallaCompleta);
            window.removeEventListener("beforeunload", antesDeCerrar);
            if (estabaFuera) enviar({ fase: "vuelve", motivo, segundos: seg });
            estado = "libre"; quitarCaja();
            if (conPantallaCompleta && enPantallaCompleta()) salirDePantallaCompleta();
            conPantallaCompleta = false;
        }

        return {
            // Lo que contestó la función: true enciende el modo (una sola vez), false lo apaga.
            ponerActivo(si) { si = !!si; if (si && !activo) encender(); else if (!si && activo) apagar(); else if (pendientes.length) vaciar(); },
            // La cámara del aparato: durante estos milisegundos salir no cuenta.
            pausa(ms) { ignorarHasta = ms > 0 ? ahora() + ms : 0; },
            estado: () => estado,
        };
    }

    global.CentroamericanoConcentracion = { crear, TEXTO_MOTIVO };
})(window);
