/* El código de sesion.html.

   El explorador de aperturas al lado del tablero del profesor: qué jugaron los
   maestros en la posición que tiene la clase, cuántas veces y cómo les fue. La
   idea salió de Chessgora («el tablero del maestro, con explorador de aperturas
   a un lado»). Ver «El explorador de aperturas en la clase» en
   docs/decisiones/clase-en-vivo.md.

   - Solo lo ve el profesor, como el motor: a los alumnos no les llega nada.
   - Arranca APAGADO y se enciende con su botón: cada posición nueva es un
     pedido a la Edge Function explorador-maestros (que guarda lo que contesta
     Lichess), y la mayoría de las clases no son de aperturas.
   - Se pregunta UNA posición por vez, la del tablero, con una espera corta
     para no pedir cada jugada de una línea que el profe recorre rápido. Lo que
     ya se preguntó en la clase se guarda acá y no se vuelve a pedir.
   - Las cifras van escritas («38 % ganan blancas»): la barrita de colores
     es un adorno (aria-hidden) y el dato nunca depende de ella.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js. sesion.js le avisa cada posición nueva
   con ClaseExplorador.posicion(fen), en el mismo lugar donde avisa al motor. */

(function (raiz, fabrica) {
    "use strict";
    const api = fabrica();
    if (typeof module === "object" && module.exports) module.exports = api;
    else raiz.ClaseExplorador = api;
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const ESPERA_MS = 450;
    const MAX_JUGADAS = 8;

    const MOTIVOS = {
        sin_token: "El explorador no está configurado todavía: falta el token de Lichess en el servidor (LICHESS_TOKEN). Lo agrega quien administra.",
        token_invalido: "Lichess no aceptó el token del servidor (LICHESS_TOKEN): hay que cambiarlo.",
        limitado: "Lichess pidió esperar un momento. Vuelve a mover en unos segundos.",
        error: "El explorador de maestros no contestó. Vuelve a intentarlo en un momento.",
        sigue: "El explorador no alcanzó a contestar. Vuelve a intentarlo en un momento.",
    };

    // Los cuatro campos que dicen qué posición es (como la Edge Function):
    // los contadores de jugadas no cambian nada y partirían lo guardado.
    function clave(fen) {
        return String(fen || "").trim().split(/\s+/).slice(0, 4).join(" ");
    }

    const suma = (x) => (x ? (x.w || 0) + (x.d || 0) + (x.b || 0) : 0);
    const pct = (n, total) => (total ? Math.round((100 * n) / total) : 0);
    const miles = (n) => new Intl.NumberFormat("es-CR").format(n);

    /* Lo que se muestra de una respuesta, sin tocar el DOM (así se prueba en
       Node): la apertura, el total y las jugadas más jugadas con su reparto. */
    function resumen(datos) {
        const total = suma(datos);
        const jugadas = ((datos && datos.jugadas) || [])
            .map((j) => {
                const n = suma(j);
                return {
                    san: j.san,
                    uci: j.uci || null,
                    partidas: n,
                    reparto: n ? pct(n, total) : 0,
                    blancas: pct(j.w || 0, n),
                    tablas: pct(j.d || 0, n),
                    negras: pct(j.b || 0, n),
                    elo: j.elo || null,
                };
            })
            .filter((j) => j.partidas > 0)
            .sort((a, b) => b.partidas - a.partidas)
            .slice(0, MAX_JUGADAS);
        const ap = datos && datos.apertura;
        return {
            total,
            apertura: ap && ap.nombre ? (ap.eco ? ap.eco + " · " : "") + ap.nombre : "",
            jugadas,
        };
    }

    // La frase de una jugada, completa: es lo que lee el lector de pantalla y
    // lo que se ve. Nada depende del color de la barrita.
    function frase(j) {
        return miles(j.partidas) + (j.partidas === 1 ? " partida" : " partidas") +
            " · ganan blancas " + j.blancas + " % · tablas " + j.tablas + " % · ganan negras " + j.negras + " %";
    }

    function montar(opciones) {
        const o = opciones || {};
        const doc = o.document || document;
        const panel = doc.getElementById("explorador-panel");
        if (!panel) return null;
        const boton = doc.getElementById("explorador-toggle-btn");
        const estado = doc.getElementById("explorador-estado");
        const salida = doc.getElementById("explorador-salida");
        const titulo = doc.getElementById("explorador-apertura");
        const lista = doc.getElementById("explorador-jugadas");
        const pedir = o.pedir || ((fens) => window.sb.functions.invoke("explorador-maestros", { body: { fens } }));

        const guardadas = new Map();
        let encendido = false;
        let fenActual = "";
        let pintada = "";
        let espera = null;
        let turno = 0;

        function decir(texto) { estado.textContent = texto; }

        function pintar(fen, datos) {
            pintada = fen;
            const r = resumen(datos);
            titulo.textContent = r.apertura || (r.total ? "Apertura sin nombre en el explorador" : "");
            lista.replaceChildren();
            if (!r.total) {
                decir("Los maestros no llegaron a esta posición: ya está fuera de la teoría.");
                return;
            }
            decir(miles(r.total) + (r.total === 1 ? " partida de maestros" : " partidas de maestros") + " pasaron por esta posición.");
            for (const j of r.jugadas) {
                const li = doc.createElement("li");
                li.className = "rounded-lg border border-brand-100 dark:border-brand-800 px-2 py-1.5";
                const fila = doc.createElement("div");
                fila.className = "flex items-baseline justify-between gap-2";
                const san = doc.createElement("span");
                san.className = "font-semibold text-sm text-brand-800 dark:text-white";
                san.textContent = j.san;
                const rep = doc.createElement("span");
                rep.className = "text-xs text-brand-500 dark:text-brand-300";
                rep.textContent = j.reparto + " % de las veces";
                fila.append(san, rep);
                // La barrita: blancas, tablas y negras. Adorno: el dato va escrito abajo.
                const barra = doc.createElement("div");
                barra.setAttribute("aria-hidden", "true");
                barra.className = "flex h-1.5 w-full rounded-full overflow-hidden my-1 bg-brand-200 dark:bg-brand-700";
                [["bg-white border border-brand-300", j.blancas], ["bg-brand-400", j.tablas], ["bg-brand-900 dark:bg-black", j.negras]].forEach(([cls, v]) => {
                    const s = doc.createElement("span");
                    s.className = cls;
                    s.style.width = v + "%";
                    barra.appendChild(s);
                });
                const det = doc.createElement("p");
                det.className = "text-[0.6875rem] text-brand-500 dark:text-brand-300";
                det.textContent = frase(j) + (j.elo ? " · Elo promedio " + j.elo : "");
                li.append(fila, barra, det);
                lista.appendChild(li);
            }
        }

        async function consultar() {
            const fen = fenActual;
            if (!encendido || !fen || fen === pintada) return;
            if (guardadas.has(fen)) { pintar(fen, guardadas.get(fen)); return; }
            const mio = ++turno;
            decir("Buscando en las partidas de maestros…");
            let res;
            try { res = await pedir([fen]); } catch (e) { res = { error: e }; }
            if (mio !== turno || !encendido) return;   // ya se movió o se apagó mientras contestaba
            const d = res && res.data;
            const datos = d && d.posiciones && d.posiciones[fen];
            if (res.error || !d) {
                const status = res.error && res.error.context && res.error.context.status;
                decir(status === 403 ? "El explorador no está activo para tu cuenta." : MOTIVOS.error);
                return;
            }
            if (!datos) { decir(MOTIVOS[d.motivo] || MOTIVOS.error); return; }
            guardadas.set(fen, datos);
            pintar(fen, datos);
        }

        function posicion(fen) {
            fenActual = clave(fen);
            if (!encendido) return;
            clearTimeout(espera);
            espera = setTimeout(consultar, ESPERA_MS);
        }

        boton.addEventListener("click", () => {
            encendido = !encendido;
            boton.setAttribute("aria-pressed", String(encendido));
            boton.textContent = encendido ? "Desactivar" : "Activar";
            salida.hidden = !encendido;
            if (encendido) {
                pintada = "";
                clearTimeout(espera);
                consultar();
            } else {
                turno++;
                decir("Solo lo ves tú. Muestra qué jugaron los maestros en la posición del tablero.");
            }
        });

        panel.classList.remove("hidden");
        return { posicion, encendido: () => encendido };
    }

    let montado = null;
    return {
        resumen,
        frase,
        clave,
        MOTIVOS,
        montar(o) { montado = montar(o); return montado; },
        posicion(fen) { if (montado) montado.posicion(fen); },
    };
});

/*! rev bfb5bbb0d2d82f9f */
