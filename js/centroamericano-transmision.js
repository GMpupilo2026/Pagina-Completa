/* ===== Centroamericano 2026 — el encargado de transmisión: todos los tableros electrónicos en vivo y sus avisos =====
 *
 * La MISMA pantalla en dos lugares: la del encargado de transmisión (centroamericano-transmision.html, sin cuenta, con
 * el QR que le da el árbitro principal) y la pestaña «Transmisión» de centroamericano-mesas.html (el principal, que
 * además crea y apaga los QR). Los datos los junta la Edge Function centroamericano-transmision (LiveChess sin atraso,
 * los emparejamientos de chess-results y los resultados que anotaron los árbitros); los AVISOS se calculan acá, con
 * chess.js y js/reclamos-tablas.js (las mismas reglas de tablas que la tablet del árbitro).
 *
 * Un tablero con un problema BRILLA (rojo si hay que ir ya, ámbar si hay que mirarlo) y dice qué pasa, por qué importa
 * y qué hacer: el color nunca va solo. Sin sonido: en una sala de juego no hay ruido (vibra, y el título de la pestaña
 * lleva cuántos hay). Ver «El encargado de transmisión (Centroamericano)» en docs/decisiones/juegos-y-torneos.md.
 *
 *   CentroamericanoTransmision.iniciar({ raiz, token?, principal?, enlaces?, contador?, visible?, alFallar? })
 *     enlaces   (principal) dónde armar «Encargados de transmisión» con sus QR
 *     contador  un número que lleva cuántos avisos hay pendientes (la pestaña del principal)
 *     alFallar  (texto) → el enlace no sirve (apagado, vencido o inexistente)
 *   CentroamericanoTransmision.cargar()
 *   Puras (Node): analizar(jugadas, primera), avisos(tablero, categoria, ahora), TIPOS
 */
(function (raiz) {
    "use strict";
    const enNode = typeof module !== "undefined" && module.exports;
    const Vivo = () => raiz.CentroamericanoArbitroVivo || (enNode ? require("./centroamericano-arbitro-vivo.js") : null);
    const ChessCtor = () => raiz.Chess || (enNode ? require("chess.js").Chess : null);

    const LEER_MS = 10000;
    const VENCE_DEFECTO = "2026-11-10T05:59:59Z";   // el final del torneo, como los enlaces de los árbitros
    const MARGEN_RELOJ = 20;                         // s: lo que el reloj puede no cuadrar con lo registrado
    const DETENIDO_S = 60, DETENIDO_URGENTE_S = 300; // el reloj detenido: a mirar al minuto, urgente a los 5
    const QUIETO_S = 25 * 60;                        // nadie mueve en 25 min
    const VIEJA_MS = 10 * 3600 * 1000;               // la primera jugada de hace más de 10 h: es de otra partida

    // Lo que puede pasar, con su nivel. «urgente»: hay que ir a la mesa ya. «revisar»: hay que mirarlo.
    const TIPOS = {
        categoria: "La categoría no transmite",
        sin_ronda: "LiveChess no tiene la ronda",
        desconectado: "El tablero dejó de transmitir",
        sin_pareo: "El tablero no tiene pareo",
        error: "No se pudo leer el tablero",
        nombres: "Otros jugadores en el tablero",
        al_reves: "Colores al revés",
        sin_mesa: "Tablero sin mesa",
        ilegal: "Jugada imposible",
        vieja: "Jugadas de otra partida",
        reloj_apagado: "No llega el reloj",
        reloj_detenido: "Reloj detenido",
        reloj_no_coincide: "El reloj y el tablero no coinciden",
        reloj_config: "Reloj mal configurado",
        reloj_inicio: "El reloj empezó con otro tiempo",
        bandera: "Cayó la bandera",
        quintuple: "Quíntuple repetición",
        setenta_y_cinco: "75 jugadas",
        triple: "Triple repetición",
        cincuenta: "50 jugadas",
        mate: "Mate sin resultado",
        ahogado: "Ahogado",
        muerta: "Posición muerta",
        resultado_distinto: "El resultado no coincide",
        sigue_transmitiendo: "Terminó, pero sigue transmitiendo",
        quieto: "Nadie mueve",
        sin_jugadas: "Sin jugadas",
    };

    // ---------------------------------------------------------------- las jugadas de LiveChess, con chess.js
    // Las jugadas legales (en SAN), la primera que no lo es, la posición, la última jugada (UCI) y cómo quedó.
    // Se recuerda por partida (cada segundo se vuelven a pedir las mismas: chess.js no tiene por qué repetirlo).
    const memo = new Map();
    function analizar(jugadas, primera) {
        const llave = (primera || "") + "|" + (jugadas || []).join(",");
        if (memo.has(llave)) return memo.get(llave);
        const r = analizarSinMemo(jugadas, primera);
        if (memo.size > 400) memo.clear();
        memo.set(llave, r);
        return r;
    }
    const memoTablas = new Map();
    function tablasDe(legales) {
        const llave = legales.join(",");
        if (!memoTablas.has(llave)) { if (memoTablas.size > 400) memoTablas.clear(); memoTablas.set(llave, Vivo().tablas(legales)); }
        return memoTablas.get(llave);
    }
    function analizarSinMemo(jugadas, primera) {
        const V = Vivo();
        const { sans, relojes } = V.leerJugadas(jugadas || [], primera);
        const C = ChessCtor();
        const out = { sans, relojes, legales: [], ilegal: null, fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ultima: "", turno: "blancas", fin: null };
        if (!C) { out.legales = sans.slice(); return out; }
        const c = new C();
        for (let i = 0; i < sans.length; i++) {
            let h = null;
            try { h = c.move(sans[i], { sloppy: true }); } catch (e) { h = null; }
            if (!h) { out.ilegal = { ply: i + 1, jugada: Math.floor(i / 2) + 1 + (i % 2 ? "… " : ". ") + V.esp(sans[i]) }; break; }
            out.legales.push(sans[i]);
            out.ultima = h.from + h.to;
        }
        out.fen = c.fen();
        out.turno = c.turn() === "w" ? "blancas" : "negras";
        const f = (n) => (typeof c[n] === "function" ? c[n]() : false);
        if (f("in_checkmate") || f("isCheckmate")) out.fin = "mate";
        else if (f("in_stalemate") || f("isStalemate")) out.fin = "ahogado";
        else if (f("insufficient_material") || f("isInsufficientMaterial")) out.fin = "muerta";
        return out;
    }

    const RES_LC = { WHITEWIN: "1-0", BLACKWIN: "0-1", DRAW: "½-½" };
    // «1/2», «1/2-1/2», «½-½» → «½-½»; con «f» (sin jugar) o vacío, null.
    function resultadoNormal(r) {
        const t = String(r || "").trim();
        if (!t || t === "*" || /f/i.test(t)) return null;
        if (RES_LC[t]) return RES_LC[t];
        if (/^(1\/2|½)/.test(t)) return "½-½";
        if (/^1-0$/.test(t)) return "1-0";
        if (/^0-1$/.test(t)) return "0-1";
        return null;
    }
    const mins = (s) => { const m = Math.round(s / 60); return m + (m === 1 ? " minuto" : " minutos"); };
    const mediana = (xs) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

    // ---------------------------------------------------------------- los avisos de un tablero
    // `t`: un tablero de la Edge Function; `cat`: su categoría (ritmo, tnr, ronda, los demás tableros); `ahora`: ms.
    // Devuelve [{ tipo, nivel, titulo, texto, clave }], lo urgente primero.
    function avisos(t, cat, ahora) {
        const V = Vivo();
        const out = [];
        const base = cat.tnr + "|" + cat.ronda + "|" + t.tablero + "|";
        const poner = (tipo, nivel, texto, extra) => out.push({ tipo, nivel, titulo: TIPOS[tipo], texto, clave: base + tipo + "|" + (extra == null ? "" : extra) });
        const p = t.partida;
        const mesaTxt = t.cr ? "la mesa " + t.cr.mesa : "este tablero";

        if (t.error) poner("error", "revisar", t.error + " Se vuelve a probar en 10 s.");
        if (!t.lc) {
            poner("sin_pareo", "revisar", "LiveChess no tiene a nadie en el tablero " + t.tablero + " en la ronda " + cat.ronda + ": la computadora de los tableros todavía no cargó el pareo (o esta ronda tiene menos mesas).");
            return ordenar(out);
        }
        // Los jugadores: los de LiveChess contra los de chess-results en esa mesa.
        if (!t.cr) poner("sin_mesa", "revisar", "Este tablero no tiene mesa de chess-results: la suya se pasó a otro tablero. Toca «Cambiar jugadores» y elige qué mesa se juega aquí.");
        else if (!t.cambio && !t.coincide) {
            if (t.al_reves) poner("al_reves", "urgente", "LiveChess tiene a " + t.lc.blancas + " con blancas y a " + t.lc.negras + " con negras; en chess-results es al revés. Mira en la mesa quién juega con qué color: si se sentaron al revés, avísale al árbitro; si es el pareo de LiveChess, avísale al operador de los tableros.", t.lc.blancas);
            else poner("nombres", "urgente", "LiveChess dice " + t.lc.blancas + " – " + t.lc.negras + ", pero en chess-results " + mesaTxt + " es " + t.cr.blancas + " – " + t.cr.negras + "." +
                (t.en_otra_mesa ? " Los de LiveChess son los de la mesa " + t.en_otra_mesa + ": ¿se cambiaron de tablero?" : "") +
                " Si la partida que se juega aquí es otra, toca «Cambiar jugadores» y elígela de la lista.", t.lc.blancas + "/" + t.lc.negras);
        }
        if (!p) return ordenar(out);

        const a = analizar(p.jugadas, p.primera);
        const n = a.sans.length;
        const resLc = resultadoNormal(p.resultado) || resultadoNormal(t.lc.resultado);
        const resArb = t.cr ? resultadoNormal(t.cr.resultado) : null;
        const terminada = !!resLc;
        const ultimo = a.relojes[a.relojes.length - 1];
        const ultimaMs = ultimo && ultimo.ms != null ? ultimo.ms : null;
        const turnoMov = n % 2 === 0 ? "blancas" : "negras";

        // ¿Transmite?
        if (!p.live && !terminada && !resArb && !(a.fin && !a.ilegal)) {
            const empezaron = (cat.tableros || []).some((x) => x.partida && x.partida.jugadas && x.partida.jugadas.length >= 2);
            if (n > 0) poner("desconectado", "urgente", "El tablero " + t.tablero + " dejó de transmitir con la partida en curso (última jugada: " + (Math.ceil(n / 2)) + (n % 2 ? ". " : "… ") + V.esp(a.sans[n - 1]) + "). Revisa el cable o la batería del tablero y la computadora de LiveChess; las jugadas que se hagan mientras tanto se recuperan al volver solo si la posición en el tablero sigue bien.", n);
            else if (empezaron) poner("desconectado", "revisar", "El tablero " + t.tablero + " no está transmitiendo y la ronda ya empezó en los demás. Revisa que esté conectado y encendido.", 0);
        }
        // Una jugada que chess.js no acepta: el tablero leyó algo que no es una jugada.
        if (a.ilegal) poner("ilegal", terminada || resArb ? "revisar" : "urgente", "La transmisión trae una jugada imposible (" + a.ilegal.jugada + "): una pieza quedó mal puesta, se cayó o el tablero leyó mal. Hay que dejar el tablero como está la partida de verdad (lo hace el árbitro, con la planilla); desde ahí no se puede seguir la partida.", a.ilegal.ply);
        // Jugadas de antes de la ronda: el tablero no se reinició.
        const vieja = n > 0 && p.primera && ahora - p.primera > VIEJA_MS && !resLc && !resArb;
        if (vieja) poner("vieja", "urgente", "La primera jugada de este tablero es de hace " + Math.round((ahora - p.primera) / 3600000) + " horas: trae jugadas de otra partida (no se reinició entre rondas). Hay que reiniciar la partida de ese tablero en LiveChess, con las jugadas de la planilla.", p.primera);

        // El final en el tablero.
        if (!a.ilegal && a.fin && !terminada) {
            if (a.fin === "mate") poner("mate", "revisar", "Hay jaque mate en el tablero (" + (a.turno === "blancas" ? "ganan las negras" : "ganan las blancas") + ") y la transmisión todavía no tiene el resultado. Que el árbitro lo confirme y se cierre la partida.", n);
            if (a.fin === "ahogado") poner("ahogado", "urgente", "Ahogado en el tablero: son tablas (art. 5.2.1) y la partida terminó. Que el árbitro detenga los relojes y anote ½-½.", n);
            if (a.fin === "muerta") poner("muerta", "urgente", "Ya nadie puede dar mate con lo que queda en el tablero: son tablas (posición muerta, art. 5.2.2). Que el árbitro detenga los relojes y anote ½-½.", n);
        }
        // Las tablas por repetición y por las 50/75 jugadas (las mismas reglas que la tablet del árbitro).
        if (!a.ilegal && !terminada && n) {
            const tb = tablasDe(a.legales);
            if (tb) {
                if (tb.cinco) poner("quintuple", "urgente", "La misma posición por quinta vez (con " + tb.cinco.jugada + "): son tablas sin que nadie reclame (art. 9.6.1). Que el árbitro detenga los relojes y anote ½-½.", tb.cinco.ply);
                else if (tb.repeticiones.length) { const r = tb.repeticiones[tb.repeticiones.length - 1]; poner("triple", "revisar", "Triple repetición (con " + r.jugada + "): cualquiera de los dos puede reclamar tablas (art. 9.2). Que el árbitro de la mesa lo sepa; si nadie reclama, la partida sigue.", r.ply); }
                if (tb.setentaYCinco) poner("setenta_y_cinco", "urgente", "75 jugadas de cada uno sin mover un peón ni capturar (con " + tb.setentaYCinco.jugada + "): son tablas sin reclamo (art. 9.6.2). Que el árbitro detenga los relojes y anote ½-½.", tb.setentaYCinco.ply);
                else if (tb.cincuenta) poner("cincuenta", "revisar", "50 jugadas de cada uno sin mover un peón ni capturar (con " + tb.cincuenta.jugada + "): cualquiera de los dos puede reclamar tablas (art. 9.3). Si nadie reclama, sigue.", tb.cincuenta.ply);
            }
        }
        // El resultado del tablero contra el del árbitro.
        if (resLc && resArb && resLc !== resArb) poner("resultado_distinto", "urgente", "La transmisión dice " + resLc + " y el árbitro de la mesa anotó " + resArb + ". Hay que ver cuál es el bueno: si es el del árbitro, corrígelo en LiveChess; si es el de la transmisión, avísale al árbitro.", resLc + "/" + resArb);
        if (resArb && !resLc && p.live) poner("sigue_transmitiendo", "revisar", "El árbitro ya anotó " + resArb + ", pero el tablero sigue transmitiendo la partida sin resultado. Pon el resultado en LiveChess (o detén el reloj) para que la transmisión la cierre.", resArb);

        // El reloj.
        const finDePartida = terminada || !!resArb || (a.fin && !a.ilegal);
        const rit = cat.ritmo || {};
        if (n > 0 && !finDePartida) {
            const conReloj = a.relojes.filter((x) => x.reloj != null);
            const ultimasSin = a.relojes.slice(-4).every((x) => x.reloj == null);
            if (!p.reloj && (ultimasSin || !conReloj.length)) poner("reloj_apagado", "urgente", "No llega el reloj del tablero " + t.tablero + ": está apagado, sin batería o desconectado del tablero. Las jugadas se ven, pero sin el tiempo de cada uno (y sin control de tiempos automático).", Math.floor(n / 10));
            else if (ultimasSin && conReloj.length) poner("reloj_apagado", "urgente", "El reloj dejó de llegar desde la jugada " + (Math.floor(a.relojes.indexOf(conReloj[conReloj.length - 1]) / 2) + 1) + ": se desconectó del tablero o se apagó.", conReloj.length);
        }
        if (p.reloj && n > 0 && !finDePartida) {
            const r = p.reloj;
            const desde = r.hora ? Math.max(0, Math.round((ahora - r.hora) / 1000)) : null;
            if (!r.corre && desde != null && desde >= DETENIDO_S) poner("reloj_detenido", desde >= DETENIDO_URGENTE_S ? "urgente" : "revisar", "El reloj está detenido desde hace " + mins(desde) + " (Blancas " + V.hms(r.blancas) + " · Negras " + V.hms(r.negras) + "). Puede ser una pausa del árbitro (una ilegal, un reclamo) o que se apagó: confirma con el árbitro de la mesa.", r.hora);
            // Lo que marca el reloj de quien acaba de jugar tiene que ser lo que se registró con su jugada.
            const quienJugo = n % 2 === 1 ? "blancas" : "negras";
            const reg = a.relojes.filter((x) => x.color === quienJugo && x.reloj != null).pop();
            const ahoraQuien = quienJugo === "blancas" ? r.blancas : r.negras;
            // `corre` dice de quién es el reloj que corre (LiveChess: run true = blancas, false = negras, null = detenido).
            if (r.corre && r.corre === quienJugo && (ultimaMs == null || !r.hora || r.hora >= ultimaMs - 2000)) poner("reloj_no_coincide", "urgente", "El reloj corre para las " + quienJugo + ", pero en el tablero ellas ya jugaron y le toca a las " + turnoMov + ": se hizo una jugada que el tablero no registró (una pieza mal puesta o fuera de su casilla). Hay que acomodar el tablero como está la partida.", n + "c");
            else if (reg && Number.isFinite(ahoraQuien) && (ultimaMs == null || !r.hora || r.hora >= ultimaMs - 2000)) {
                if (ahoraQuien < reg.reloj - MARGEN_RELOJ) poner("reloj_no_coincide", "urgente", "El reloj de las " + quienJugo + " está corriendo (" + V.hms(ahoraQuien) + "), pero el tablero sigue esperando la jugada de las " + turnoMov + ": se hizo una jugada que el tablero no registró (una pieza mal puesta o fuera de su casilla). Hay que acomodar el tablero como está la partida.", n);
                else if (ahoraQuien > reg.reloj + MARGEN_RELOJ + (rit.inc || 0)) poner("reloj_no_coincide", "revisar", "El reloj de las " + quienJugo + " marca " + V.hms(ahoraQuien) + " y con su última jugada marcaba " + V.hms(reg.reloj) + ": se le cambió el tiempo (una sanción, una corrección) o el reloj se reconfiguró. Confírmalo con el árbitro de la mesa.", n);
            }
            // La bandera: a quien le corre el reloj se le acabó.
            const corriendo = r.corre && desde != null ? desde : 0;
            const quedaB = r.blancas - (r.corre === "blancas" ? corriendo : 0), quedaN = r.negras - (r.corre === "negras" ? corriendo : 0);
            if (quedaB <= 0 || quedaN <= 0) poner("bandera", "urgente", "Al reloj de las " + (quedaB <= 0 ? "blancas" : "negras") + " se le acabó el tiempo y la partida sigue sin resultado. Que el árbitro de la mesa lo vea (art. 6.9: pierde, salvo que el rival no pueda dar mate).", quedaB <= 0 ? "b" : "n");
        }
        // El ritmo: el incremento que suma de verdad y el tiempo con que empezó.
        if (n >= 2 && rit.base && !finDePartida) {
            const incs = [];
            for (let i = 2; i < a.relojes.length; i++) {
                const x = a.relojes[i], prev = a.relojes[i - 2];
                if (x.reloj != null && prev.reloj != null && x.gasto != null) incs.push(x.reloj - prev.reloj + x.gasto);
            }
            const med = incs.length >= 3 ? mediana(incs.slice(-10)) : null;
            if (med != null && Math.abs(med - (rit.inc || 0)) > 4) poner("reloj_config", "urgente", "El reloj suma " + Math.round(med) + " s por jugada y el ritmo es " + (rit.texto || (rit.base / 60 + " min + " + rit.inc + " s")) + ": quedó mal configurado. Que el árbitro lo corrija (art. 6.10) con el tiempo que tiene cada uno.", Math.round(med));
            const primB = a.relojes.find((x) => x.color === "blancas" && x.reloj != null), primN = a.relojes.find((x) => x.color === "negras" && x.reloj != null);
            const tope = rit.base + 2 * (rit.inc || 0) + 5;
            const mucho = [primB, primN].filter((x) => x && x === a.relojes.find((y) => y.color === x.color) && x.reloj > tope);
            if (mucho.length) poner("reloj_config", "urgente", "Con su primera jugada, el reloj de las " + mucho.map((x) => x.color).join(" y las ") + " marcaba " + mucho.map((x) => V.hms(x.reloj)).join(" y ") + ": más de lo que da el ritmo (" + (rit.texto || "") + "). Está mal configurado.", "inicio");
            const poco = vieja ? [] : [primB, primN].filter((x) => x && x === a.relojes.find((y) => y.color === x.color) && x.reloj < rit.base - 20 * 60);
            if (poco.length) poner("reloj_inicio", "revisar", "Con su primera jugada, el reloj de las " + poco.map((x) => x.color).join(" y las ") + " marcaba " + poco.map((x) => V.hms(x.reloj)).join(" y ") + ": mucho menos que el ritmo. Si llegó tarde está bien; si no, el reloj quedó con otro tiempo.", "poco");
        }
        // Mucho rato sin jugadas, o sin ninguna cuando los demás ya empezaron.
        if (!finDePartida && !vieja && p.live && n > 0 && ultimaMs && ahora - ultimaMs > QUIETO_S * 1000 && (!p.reloj || p.reloj.corre)) poner("quieto", "revisar", "Nadie mueve desde hace " + mins((ahora - ultimaMs) / 1000) + ". Puede ser una pensada larga; mira que el tablero siga leyendo las jugadas.", n);
        if (!finDePartida && p.live && n === 0) {
            const otros = (cat.tableros || []).filter((x) => x !== t && x.partida);
            const empezaron = otros.filter((x) => (x.partida.jugadas || []).length >= 4).length;
            if (otros.length && empezaron >= Math.ceil(otros.length / 2)) poner("sin_jugadas", "revisar", "Este tablero no tiene ninguna jugada y los demás de la categoría ya empezaron: ¿llegaron los dos jugadores? ¿está bien armada la posición inicial y conectado?", 0);
        }
        return ordenar(out);
    }
    const ordenar = (xs) => xs.sort((x, y) => (x.nivel === y.nivel ? 0 : x.nivel === "urgente" ? -1 : 1));

    // Los avisos de toda una categoría (los de la categoría, sin tablero, van primero).
    function avisosDeCategoria(cat, ahora) {
        const out = [];
        const base = cat.tnr + "|" + cat.ronda + "|0|";
        if (cat.error) out.push({ tipo: "categoria", nivel: "urgente", titulo: TIPOS.categoria, texto: cat.error, clave: base + "categoria|" + Math.floor(ahora / 600000) });
        else if (cat.sin_pareo) out.push({ tipo: "sin_ronda", nivel: "urgente", titulo: TIPOS.sin_ronda, texto: "LiveChess todavía no tiene el pareo de la ronda " + cat.ronda + " de " + cat.nombre + ": la computadora de los tableros no lo cargó. Sin eso, ningún tablero de la categoría transmite.", clave: base + "sin_ronda|" + cat.ronda });
        return out;
    }

    // ---------------------------------------------------------------- en el navegador
    let ctx = null, datos = null, leidaMs = 0, pidiendo = null, dialogo = null;
    const atendidas = new Map();       // clave → { quien, en }
    const vistos = new Set();          // las claves ya avisadas (para vibrar solo con lo nuevo)
    let primera = true;
    const $ = (id) => document.getElementById(id);
    const pref = () => { try { return JSON.parse(localStorage.getItem("cac_tx_pref") || "{}"); } catch (e) { return {}; } };
    const guardarPref = (p) => { try { localStorage.setItem("cac_tx_pref", JSON.stringify(Object.assign(pref(), p))); } catch (e) { /* sin almacenamiento */ } };

    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null && h !== false) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }
    const avisar = (texto, error) => raiz.Avisos.avisar(texto, { tipo: error ? "error" : "ok" });
    const horaS = (ms) => raiz.HoraCR.hora(new Date(ms).toISOString(), { hour: "numeric", minute: "2-digit", second: "2-digit" });

    async function llamar(accion, cuerpo) {
        const body = Object.assign({ action: accion }, ctx.token ? { token: ctx.token } : {}, cuerpo || {});
        let { data, error } = await raiz.sb.functions.invoke("centroamericano-transmision", { body });
        if (error && error.context && typeof error.context.json === "function") {
            const estado = error.context.status;
            try { const j = await error.context.json(); if (j && j.error) error = new Error(j.error); } catch (e) { /* sin cuerpo */ }
            error.estado = estado;
        }
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);
        return data || {};
    }

    function armar() {
        const p = pref();
        ctx.raiz.replaceChildren(...[
            el("div", { class: "tx-barra" },
                el("p", { id: "tx-estado", class: "text-sm", role: "status", texto: "Leyendo los tableros…" }),
                el("div", { class: "tx-controles", role: "toolbar", "aria-label": "Qué mostrar" },
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Categoría" }), el("select", { id: "tx-categoria", class: "cam-select", onchange: () => { guardarPref({ cat: $("tx-categoria").value }); pintar(); } }, el("option", { value: "", texto: "Todas" }))),
                    el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Mostrar" }), el("select", { id: "tx-filtro", class: "cam-select", onchange: () => { guardarPref({ filtro: $("tx-filtro").value }); pintar(); } },
                        el("option", { value: "todos", texto: "Todos los tableros" }), el("option", { value: "avisos", texto: "Solo los que tienen un aviso" }))),
                    el("label", { class: "tx-casilla" }, el("input", { type: "checkbox", id: "tx-grandes", class: "w-4 h-4", onchange: () => { guardarPref({ grandes: $("tx-grandes").checked }); pintar(); } }), " Tableros grandes"),
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => cargar() }, el("span", { "aria-hidden": "true", texto: "🔄 " }), "Leer ahora"))),
            el("section", { id: "tx-resumen", class: "tx-resumen", "aria-labelledby": "tx-t-resumen" },
                el("h3", { id: "tx-t-resumen", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "🚨 " }), "Avisos para revisar ", el("span", { id: "tx-n", class: "cam-contador", hidden: true })),
                el("p", { id: "tx-sin-avisos", class: "tx-todo-bien", texto: "Todo en orden: ningún tablero tiene un problema." }),
                el("ul", { id: "tx-lista", class: "tx-lista" })),
            el("div", { id: "tx-categorias" }),
            el("details", { class: "cam-fp-reglas mt-3" },
                el("summary", { texto: "Qué revisa esta pantalla y qué hacer con cada aviso" }),
                el("ul", {}, ...[
                    ["En rojo (ir ya)", "el tablero o la categoría dejó de transmitir, una jugada que el tablero no registró o que es imposible, el reloj apagado, detenido más de 5 min o mal configurado (no suma el incremento, o empezó con más tiempo), la bandera caída, la quíntuple repetición o las 75 jugadas (tablas sin reclamo), ahogado o posición muerta, otros jugadores o colores al revés y un resultado que no coincide con el del árbitro."],
                    ["En ámbar (mirar)", "la triple repetición y las 50 jugadas (las reclama un jugador), el reloj detenido más de 1 min, un mate sin resultado, un tablero sin jugadas cuando los demás empezaron o en el que nadie mueve hace 25 min, el reloj que empezó con mucho menos tiempo (¿llegó tarde?) y la partida que el árbitro ya cerró y sigue transmitiéndose."],
                    ["«Ya lo revisé»", "apaga el brillo de ese aviso para todos los que miran esta pantalla (queda quién y a qué hora). Si vuelve a pasar algo distinto, brilla de nuevo."],
                    ["«Cambiar jugadores»", "si alguien se cambió de tablero, elige de los emparejamientos de chess-results qué mesa se juega en ese tablero: esta pantalla muestra los nombres buenos y deja de avisar. La transmisión pública de Lichess (y la tablet del árbitro) toman los nombres de LiveChess: el botón «Mensaje para el operador» copia lo que hay que cambiar allá."],
                    ["Sin sonido", "en la sala de juego no hay ruido: vibra (en Android), el título de la pestaña lleva cuántos avisos hay y el tablero brilla."],
                ].map(([t, d]) => el("li", {}, el("strong", { texto: t }), ": " + d)))),
        ]);
        $("tx-filtro").value = p.filtro === "avisos" ? "avisos" : "todos";
        $("tx-grandes").checked = !!p.grandes;
    }

    async function cargar() {
        if (!ctx) return datos;
        if (pidiendo) return pidiendo;
        pidiendo = (async () => {
            try {
                const d = await llamar("leer");
                if (!d || !Array.isArray(d.categorias)) throw new Error("la respuesta no trae los tableros");
                datos = d;
                leidaMs = Date.now();
                atendidas.clear();
                for (const x of d.atendidas || []) atendidas.set(x.clave, x);
                llenarCategorias();
                pintar();
            } catch (e) {
                // Un enlace apagado, vencido o que no existe: no se muestra nada (lo dice la página).
                if (ctx.alFallar && [401, 403, 404, 410].includes(e.estado)) { ctx.parado = true; ctx.alFallar(e.message || "Este enlace no sirve."); return datos; }
                const est = $("tx-estado");
                if (est) est.textContent = "No se pudo leer (" + (e.message || e) + "). " + (datos ? "Lo de abajo es de las " + horaS(leidaMs) + "." : "") + " Se vuelve a probar en 10 s.";
            } finally { pidiendo = null; }
            return datos;
        })();
        return pidiendo;
    }

    function llenarCategorias() {
        const sel = $("tx-categoria");
        if (!sel || !datos) return;
        const actual = sel.value || pref().cat || "";
        sel.replaceChildren(el("option", { value: "", texto: "Todas" }), ...datos.categorias.map((c) => el("option", { value: c.tnr, texto: c.nombre })));
        sel.value = datos.categorias.some((c) => c.tnr === actual) ? actual : "";
    }

    // Todo lo que hay que mostrar: cada categoría con sus tableros y sus avisos.
    function calcular(ahora) {
        return (datos ? datos.categorias : []).map((c) => ({ c, propios: avisosDeCategoria(c, ahora),
            tableros: (c.tableros || []).map((t) => ({ t, av: avisos(t, c, ahora) })) }));
    }
    const pendiente = (x) => !atendidas.has(x.clave);

    function pintar() {
        if (!ctx || !datos) return;
        const ahora = Date.now();
        const todo = calcular(ahora);
        const filtroCat = $("tx-categoria").value, soloAvisos = $("tx-filtro").value === "avisos", grandes = $("tx-grandes").checked;
        // Lo pendiente, para el resumen y el título.
        const lista = [];
        for (const g of todo) {
            for (const x of g.propios) lista.push({ g, t: null, x });
            for (const tt of g.tableros) for (const x of tt.av) lista.push({ g, t: tt.t, x });
        }
        const pend = lista.filter((y) => pendiente(y.x));
        const urg = pend.filter((y) => y.x.nivel === "urgente").length;
        // Vibrar con lo nuevo (no al abrir: al abrir no es «nuevo»).
        const nuevos = pend.filter((y) => !vistos.has(y.x.clave));
        pend.forEach((y) => vistos.add(y.x.clave));
        if (!primera && nuevos.length && navigator.vibrate) { try { navigator.vibrate(nuevos.some((y) => y.x.nivel === "urgente") ? [300, 120, 300, 120, 300] : [200]); } catch (e) { /* sin vibración */ } }
        primera = false;
        document.title = (pend.length ? "(" + pend.length + ") " : "") + document.title.replace(/^\(\d+\) /, "");

        const totalT = todo.reduce((s, g) => s + g.tableros.length, 0);
        const enVivo = todo.reduce((s, g) => s + g.tableros.filter((x) => x.t.partida && x.t.partida.live).length, 0);
        $("tx-estado").textContent = totalT + " tableros en " + todo.length + " categorías · " + enVivo + " transmitiendo · leído a las " + horaS(leidaMs) + " · se actualiza cada 10 s" + (datos.nombre ? " · " + datos.nombre : "");
        $("tx-n").textContent = String(pend.length);
        $("tx-n").hidden = !pend.length;
        $("tx-n").setAttribute("data-urgente", urg ? "si" : "no");
        $("tx-sin-avisos").hidden = pend.length > 0;
        if (ctx.contador) { ctx.contador.textContent = String(pend.length); ctx.contador.hidden = !pend.length; ctx.contador.setAttribute("data-urgente", urg ? "si" : "no"); }
        $("tx-lista").replaceChildren(...pend.map((y) => el("li", { class: "tx-item", "data-nivel": y.x.nivel },
            el("span", { class: "tx-nivel", texto: y.x.nivel === "urgente" ? "Ir ya" : "Mirar" }),
            el("span", { class: "tx-item-texto" }, el("strong", { texto: y.g.c.nombre + (y.t ? " · tablero " + y.t.tablero + (y.t.cr ? " (mesa " + y.t.cr.mesa + ")" : "") : "") + ": " + y.x.titulo }), " — " + y.x.texto),
            el("span", { class: "tx-item-botones" },
                y.t ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => irA(y.g.c.tnr, y.t.tablero) }, "Ver el tablero") : null,
                el("button", { type: "button", class: "cam-btn cam-btn-chico", onclick: () => atender([y.x]) }, "Ya lo revisé")))));

        // Las categorías.
        const secciones = todo.filter((g) => !filtroCat || g.c.tnr === filtroCat).map((g) => {
            const tabs = g.tableros.filter((x) => !soloAvisos || x.av.some(pendiente));
            if (soloAvisos && !tabs.length && !g.propios.some(pendiente)) return null;
            const nivelCat = g.propios.filter(pendiente).some((x) => x.nivel === "urgente") ? "urgente" : null;
            const rl = g.c.ronda_lc;
            return el("section", { class: "tx-categoria", "data-tnr": g.c.tnr, "data-brilla": nivelCat, "aria-labelledby": "tx-c-" + g.c.tnr },
                el("h3", { id: "tx-c-" + g.c.tnr, class: "cam-subtitulo" }, g.c.nombre,
                    el("span", { class: "cam-subtitulo-nota", texto: " · ronda " + g.c.ronda + (g.c.ritmo && g.c.ritmo.texto ? " · " + g.c.ritmo.texto : "") + (rl ? " · " + rl.en_vivo + " de " + rl.partidas + " en vivo en LiveChess" : "") })),
                ...g.propios.map((x) => el("p", { class: "tx-aviso-cat", "data-nivel": x.nivel, role: "alert" }, el("strong", { texto: x.titulo + ": " }), x.texto,
                    pendiente(x) ? el("button", { type: "button", class: "cam-btn cam-btn-chico ml-2", onclick: () => atender([x]) }, "Ya lo revisé") : el("span", { class: "tx-atendido", texto: " ✔ Revisado" }))),
                el("div", { class: "tx-grilla" + (grandes ? " tx-grandes" : "") }, ...tabs.map((x) => tarjeta(g.c, x.t, x.av, ahora))));
        }).filter(Boolean);
        $("tx-categorias").replaceChildren(...(secciones.length ? secciones : [el("p", { class: "cam-herramientas-nota", texto: soloAvisos ? "Ningún tablero tiene avisos pendientes." : "No hay categorías con tableros electrónicos (se cargan en «Clave de chess-results» → «Los tableros electrónicos por LiveChess»)." })]));
    }

    function tarjeta(c, t, av, ahora) {
        const V = Vivo();
        const p = t.partida;
        const a = p ? analizar(p.jugadas, p.primera) : null;
        const pend = av.filter(pendiente);
        const nivel = pend.some((x) => x.nivel === "urgente") ? "urgente" : pend.length ? "revisar" : null;
        const resLc = p ? resultadoNormal(p.resultado) || resultadoNormal(t.lc && t.lc.resultado) : null;
        const estado = !p ? "Sin partida" : resLc ? "Terminó " + resLc : !p.live ? "Sin transmitir" : "En vivo";
        const blancas = t.cr ? t.cr.blancas : t.lc ? t.lc.blancas : "—", negras = t.cr ? t.cr.negras : t.lc ? t.lc.negras : "—";
        const tab = el("div", { class: "cine-tablero tx-tablero", "aria-hidden": "true" });
        if (a && raiz.TableroFen) raiz.TableroFen.dibujar(tab, a.fen, a.ultima, { miniatura: true });
        // Los relojes de ahora: el de quien tiene el turno corre desde la lectura del reloj.
        let relojTxt = "Sin reloj";
        if (p && p.reloj) {
            const r = p.reloj, corre = r.corre && r.hora && !resLc ? Math.max(0, Math.round((ahora - r.hora) / 1000)) : 0;
            const turno = r.corre;
            relojTxt = "Blancas " + V.hms(r.blancas - (turno === "blancas" ? corre : 0)) + " · Negras " + V.hms(r.negras - (turno === "negras" ? corre : 0)) + (r.corre ? "" : " · detenido");
        }
        const n = a ? a.legales.length : 0;
        const jugTxt = !a ? "" : !n ? "Sin jugadas todavía" : "Jugada " + Math.ceil(n / 2) + " (" + Math.ceil(n / 2) + (n % 2 ? ". " : "… ") + V.esp(a.legales[n - 1]) + ")" + (a.ilegal ? " · lo que sigue no se puede leer" : "") + (resLc ? "" : " · le toca a las " + a.turno);
        return el("article", { class: "tx-tarjeta", id: "tx-" + c.tnr + "-" + t.tablero, "data-brilla": nivel, tabindex: "-1", "aria-label": c.nombre + ", tablero " + t.tablero + (nivel ? ", con avisos" : "") },
            el("div", { class: "tx-tarjeta-cabeza" },
                el("strong", { texto: "Tablero " + t.tablero }),
                el("span", { class: "tx-mesa", texto: t.cr ? "mesa " + t.cr.mesa + (t.cambio ? " (cambiado)" : "") : "sin mesa" }),
                el("span", { class: "tx-chip", "data-estado": estado.startsWith("En vivo") ? "vivo" : estado.startsWith("Terminó") ? "fin" : "no", texto: estado })),
            el("p", { class: "tx-jugador" }, el("span", { class: "tx-color", "data-color": "blancas", texto: "Blancas" }), el("span", { texto: blancas })),
            el("p", { class: "tx-jugador" }, el("span", { class: "tx-color", "data-color": "negras", texto: "Negras" }), el("span", { texto: negras })),
            a ? tab : null,
            a && raiz.TableroFen ? el("p", { class: "sr-only", texto: raiz.TableroFen.describir(a.fen) }) : null,
            el("p", { class: "tx-dato", texto: relojTxt }),
            jugTxt ? el("p", { class: "tx-dato", texto: jugTxt }) : null,
            t.cambio ? el("p", { class: "tx-nota", texto: "Cambiado por " + t.cambio.por + " a las " + raiz.HoraCR.hora(t.cambio.actualizado) + (t.lc ? " (LiveChess dice " + t.lc.blancas + " – " + t.lc.negras + ")" : "") }) : null,
            av.length ? el("ul", { class: "tx-avisos" }, ...av.map((x) => {
                const at = atendidas.get(x.clave);
                return el("li", { "data-nivel": x.nivel, "data-atendido": at ? "si" : null },
                    el("strong", { texto: (x.nivel === "urgente" ? "⚠ " : "👁 ") + x.titulo + ": " }), x.texto,
                    at ? el("span", { class: "tx-atendido", texto: " ✔ Revisado por " + at.quien + " a las " + raiz.HoraCR.hora(at.en) }) : null);
            })) : el("p", { class: "tx-ok", texto: "✔ Sin problemas" }),
            el("div", { class: "tx-botones" },
                pend.length ? el("button", { type: "button", class: "cam-btn cam-btn-chico", onclick: () => atender(pend) }, "Ya lo revisé") : null,
                el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => cambiarJugadores(c, t) }, "Cambiar jugadores")));
    }

    function irA(tnr, tablero) {
        const sel = $("tx-categoria");
        if (sel.value && sel.value !== tnr) { sel.value = ""; pintar(); }
        const x = document.getElementById("tx-" + tnr + "-" + tablero);
        if (x) { x.scrollIntoView({ block: "center", behavior: "smooth" }); x.focus({ preventScroll: true }); }
    }

    async function atender(lista) {
        try {
            for (const x of lista) { await llamar("atender", { clave: x.clave }); atendidas.set(x.clave, { quien: (datos && datos.nombre) || "tú", en: new Date().toISOString() }); }
            pintar();
        } catch (e) { avisar("No se pudo marcar: " + (e.message || e), true); }
    }

    // ---------------------------------------------------------------- cambiar los jugadores de un tablero
    function cambiarJugadores(c, t) {
        if (!dialogo) {
            dialogo = el("dialog", { id: "tx-dialogo", class: "cam-dialogo tx-dialogo", "aria-labelledby": "tx-d-titulo" },
                el("div", { class: "cam-dialogo-titulo" }, el("span", { id: "tx-d-titulo" }),
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => dialogo.close() }, "Cerrar")),
                el("div", { class: "cam-dialogo-cuerpo tx-d-cuerpo" }));
            document.body.append(dialogo);
        }
        const quien = document.activeElement;
        dialogo.onclose = () => { if (quien && quien.focus) quien.focus(); };
        $("tx-d-titulo").textContent = c.nombre + " · tablero " + t.tablero;
        const mesas = c.mesas_cr || [];
        const sel = el("select", { id: "tx-d-mesa", class: "cam-select" }, ...mesas.map((m) => el("option", { value: String(m.mesa), texto: "Mesa " + m.mesa + ": " + m.blancas + " (blancas) – " + m.negras + " (negras)" + (t.en_otra_mesa === m.mesa ? "  ← los que dice LiveChess" : "") })));
        sel.value = String(t.en_otra_mesa || (t.cr && t.cr.mesa) || t.tablero);
        const otroTablero = () => {
            const m = Number(sel.value);
            const o = (c.tableros || []).find((x) => x.tablero !== t.tablero && x.cr && x.cr.mesa === m);
            return o ? o.tablero : null;
        };
        const inter = el("input", { type: "checkbox", id: "tx-d-inter", class: "w-4 h-4", checked: true });
        const interCaja = el("label", { class: "tx-casilla" }, inter, el("span", { id: "tx-d-inter-txt" }));
        const refrescar = () => {
            const o = otroTablero();
            interCaja.hidden = o == null || !t.cr;
            $("tx-d-inter-txt") && ($("tx-d-inter-txt").textContent = o != null && t.cr ? " Intercambiar: el tablero " + o + " se queda con la mesa " + t.cr.mesa + " (" + t.cr.blancas + " – " + t.cr.negras + ")" : "");
        };
        sel.addEventListener("change", refrescar);
        const operador = () => {
            const m = mesas.find((x) => x.mesa === Number(sel.value));
            return m ? c.nombre + ", ronda " + c.ronda + ": en el tablero " + t.tablero + " juegan " + m.blancas + " (blancas) contra " + m.negras + " (negras), la mesa " + m.mesa + " de chess-results. Por favor corrige el pareo de ese tablero en LiveChess." : "";
        };
        dialogo.querySelector(".tx-d-cuerpo").replaceChildren(
            el("p", { texto: "LiveChess dice: " + (t.lc ? t.lc.blancas + " (blancas) – " + t.lc.negras + " (negras)" : "nadie") + "." }),
            el("p", { texto: "Elige qué mesa de chess-results se juega de verdad en este tablero (ronda " + c.ronda + "). Los nombres salen de los emparejamientos: no hay que escribir nada." }),
            el("label", { class: "cam-herramientas-campo tx-d-campo" }, el("span", { texto: "Se juega la" }), sel),
            interCaja,
            el("p", { class: "cam-herramientas-nota", texto: "Esto corrige esta pantalla (los nombres y los avisos de ese tablero, para todos los que la miran). La transmisión pública de Lichess y la tablet del árbitro toman los nombres de LiveChess: mándale el mensaje al operador de los tableros para que corrija el pareo allá." }),
            el("div", { class: "tx-botones" },
                el("button", { type: "button", class: "cam-btn", onclick: () => guardarCambio(c, t, Number(sel.value), !interCaja.hidden && inter.checked) }, "Guardar el cambio"),
                el("button", { type: "button", class: "cam-btn cam-btn-claro", onclick: () => { const x = operador(); navigator.clipboard.writeText(x).then(() => avisar("Mensaje copiado: pégalo en el chat del operador.")).catch(() => avisar(x)); } }, "Mensaje para el operador"),
                t.cambio ? el("button", { type: "button", class: "cam-btn cam-btn-claro", onclick: () => guardarCambio(c, t, null, false) }, "Volver a la mesa " + t.tablero) : null));
        refrescar();
        try { dialogo.showModal(); } catch (e) { dialogo.setAttribute("open", ""); }
        sel.focus();
    }

    async function guardarCambio(c, t, mesa, intercambiar) {
        try {
            const r = await llamar("reasignar", { tnr: c.tnr, ronda: c.ronda, tablero: t.tablero, mesa, intercambiar });
            dialogo.close();
            avisar(r.texto || "Listo.");
            await cargar();
        } catch (e) { avisar("No se pudo cambiar: " + (e.message || e), true); }
    }

    // ---------------------------------------------------------------- los QR de los encargados (solo el principal)
    function armarEnlaces(caja) {
        caja.replaceChildren(
            el("h3", { id: "tx-t-encargados", class: "cam-subtitulo" }, el("span", { "aria-hidden": "true", texto: "📡 " }), "Encargados de transmisión"),
            el("p", { class: "cam-herramientas-nota", texto: "Cada encargado entra con su QR, sin cuenta, a su propia pantalla: ve todos los tableros electrónicos en vivo (sin atraso) con sus avisos, puede marcarlos como revisados y cambiar los jugadores de un tablero. Lo que hace queda con su nombre. Es solo para el equipo de transmisión: no lo muestren a jugadores ni a entrenadores." }),
            el("form", { class: "cam-herramientas mt-2", onsubmit: crearEnlace },
                el("label", { class: "cam-herramientas-campo" }, el("span", { texto: "Nombre del encargado" }), el("input", { id: "tx-enlace-nombre", class: "cam-select", maxlength: "80", required: true, autocomplete: "off" })),
                el("button", { type: "submit", class: "cam-btn cam-btn-chico" }, "Crear su QR")),
            el("p", { id: "tx-enlaces-vacio", class: "cam-herramientas-nota", texto: "Todavía no hay encargados de transmisión." }),
            el("div", { id: "tx-enlaces", class: "cam-fp-enlaces" }));
        cargarEnlaces();
    }
    async function cargarEnlaces() {
        const { data, error } = await raiz.sb.from("centroamericano_tx_enlaces").select("id, token, nombre, vence, revocada, creada, ultimo_uso").order("creada", { ascending: true }).range(0, 199);
        if (error || !$("tx-enlaces")) return;
        const base = location.origin + location.pathname.replace(/[^/]*$/, "") + "centroamericano-transmision.html#";
        const vivos = (data || []).filter((x) => !x.revocada);
        $("tx-enlaces-vacio").hidden = vivos.length > 0;
        $("tx-enlaces").replaceChildren(...vivos.map((x) => {
            const url = base + x.token;
            return el("article", { class: "cam-fp-enlace", "data-id": x.id },
                el("div", {},
                    el("p", { class: "font-bold", texto: x.nombre }),
                    el("p", { class: "cam-fp-detalle", texto: x.ultimo_uso ? "Entró por última vez a las " + raiz.HoraCR.hora(x.ultimo_uso) : "Todavía no ha entrado" }),
                    el("div", { class: "cam-fp-acciones mt-1" },
                        el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => { navigator.clipboard.writeText(url).then(() => avisar("Enlace de " + x.nombre + " copiado.")).catch(() => avisar(url)); } }, "Copiar el enlace"),
                        el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: "https://wa.me/?text=" + encodeURIComponent("Tu pantalla de transmisión del Centroamericano 2026 (no la compartas): " + url), target: "_blank", rel: "noopener" }, "Mandar por WhatsApp"),
                        el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "apagar", onclick: () => apagarEnlace(x) }, "Apagar"))),
                raiz.QrSvg ? raiz.QrSvg.dibujar(url, "QR de transmisión de " + x.nombre, { marca: true }) : null);
        }));
    }
    async function crearEnlace(e) {
        e.preventDefault();
        const nombre = $("tx-enlace-nombre").value.trim();
        if (!nombre) return;
        const { error } = await raiz.sb.from("centroamericano_tx_enlaces").insert({ nombre, vence: VENCE_DEFECTO });
        if (error) { avisar("No se pudo crear: " + error.message, true); return; }
        $("tx-enlace-nombre").value = "";
        avisar("Listo: el QR de " + nombre + " está abajo. Con él entra a su pantalla de transmisión, sin cuenta.");
        await cargarEnlaces();
    }
    async function apagarEnlace(x) {
        const ok = await raiz.Avisos.confirmar("El QR de " + x.nombre + " deja de funcionar ya. Lo que hizo queda en el registro.", { titulo: "Apagar el QR de " + x.nombre, aceptar: "Apagar", peligro: true });
        if (!ok) return;
        const { error } = await raiz.sb.from("centroamericano_tx_enlaces").update({ revocada: true }).eq("id", x.id);
        if (error) avisar("No se pudo apagar: " + error.message, true);
        await cargarEnlaces();
    }

    // ---------------------------------------------------------------- arranque
    function iniciar(c) {
        ctx = c;
        armar();
        if (c.principal && c.enlaces) armarEnlaces(c.enlaces);
        if (!c.visible || c.visible()) cargar();
        let ultima = Date.now();
        setInterval(() => {
            if (ctx.parado || document.hidden || (ctx.visible && !ctx.visible())) return;
            if (Date.now() - ultima >= LEER_MS) { ultima = Date.now(); cargar(); }
            else if (datos) latir();
        }, 1000);
    }
    // Cada segundo, solo los relojes (sin repintar bajo el dedo).
    function latir() {
        if (!datos) return;
        const ahora = Date.now();
        for (const c of datos.categorias) for (const t of c.tableros || []) {
            const x = document.getElementById("tx-" + c.tnr + "-" + t.tablero);
            const p = t.partida;
            if (!x || !p || !p.reloj || !p.reloj.corre || resultadoNormal(p.resultado)) continue;
            const r = p.reloj, corre = r.hora ? Math.max(0, Math.round((ahora - r.hora) / 1000)) : 0;
            const d = x.querySelector(".tx-dato");
            const V = Vivo();
            if (d) d.textContent = "Blancas " + V.hms(r.blancas - (r.corre === "blancas" ? corre : 0)) + " · Negras " + V.hms(r.negras - (r.corre === "negras" ? corre : 0));
        }
    }

    const api = { iniciar, cargar, analizar, avisos, avisosDeCategoria, resultadoNormal, TIPOS };
    if (enNode) module.exports = api;
    else raiz.CentroamericanoTransmision = api;
})(typeof self !== "undefined" ? self : this);
