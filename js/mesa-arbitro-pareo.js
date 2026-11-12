/* «Mesa del árbitro» con un torneo de Pareo Integral (la sección #zona-pareo
   de mesa-arbitro.html), sin chess-results.

   El árbitro principal crea en Pareo Integral un «Enlace para un árbitro
   adjunto» con un rango de mesas (#adjunto=<código>&m=1-10). Aquí se pega ese
   enlace y la página habla por el MISMO canal en vivo que el celular del
   adjunto (js/pareo/ver.js, iniciarAdjunto; el lado del principal es
   conectarAdjuntos() en js/pareo/pagina.js), con los mismos mensajes:

   - «pedir» → el principal contesta con «estado»: el nombre del torneo, la
     ronda en juego y las mesas (con sus marcas de ilegales e irregularidades).
   - «resultado» { ronda, mesa, r } → DECIDE LA PESTAÑA DEL PRINCIPAL: solo la
     última ronda, una mesa del rango, sin resultado. Contesta con otro
     «estado»; si la mesa trae el resultado que se mandó, quedó.
   - «nota» { mesa, lado, tipo, articulo, texto, autor } → una incidencia en la
     ronda (una ilegal va con el artículo «ilegal»: Pareo la cuenta para la
     marca de la partida y avisa de la segunda).

   LO QUE SE MANDA QUEDA EN LA BASE: cada resultado y cada incidencia van
   primero a la Edge Function pareo-publicar con el código del enlace
   (PareoPublicar.mandarAdjunto, en js/pareo/publicar.js), que los deja en
   pareo_cola hasta que el Pareo del principal los lee; si eso no se puede,
   por el canal como antes. Y si el principal no contesta, las mesas se leen
   del torneo publicado (pareo_publicados, de lectura pública): se puede
   trabajar con su computadora cerrada, y un resultado que ya sale publicado
   es uno que el principal aceptó. Se entra también con el código de 8 letras
   solo, sin el enlace (sin cámara para el QR). Ver «Pareo Integral: lo que
   anotan los adjuntos queda en la base».

   LA BITÁCORA (arbitro_bitacora, con la columna `pareo` = el código del
   enlace): un resultado queda «enviado» SOLO cuando el estado que contesta el
   principal ya lo trae en esa mesa, nunca por haberlo mandado (la misma
   regla que con chess-results). Las ilegales y las irregularidades quedan
   también ahí. El enlace no se guarda en el navegador.

   Ver «La mesa del árbitro con los torneos de Pareo Integral» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const M = window.MesaArbitro;
    const $ = (id) => document.getElementById(id);
    const avisar = (texto, error) => window.Avisos.avisar(texto, { tipo: error ? "error" : "ok" });
    if (!M || !$("zona-pareo")) return;

    // Los artículos de las irregularidades de js/mesa-arbitro.js → la clave de Pareo (ARTICULOS de js/pareo/evento.js).
    const ARTICULO_PAREO = { "4.3": "tocar", "11.3.2": "celular", "11.5": "molestar", "6.7": "tarde" };
    const RAPIDOS = [["1-0", "1-0"], ["=", "½-½"], ["0-1", "0-1"]];
    const OTROS = [["+-", "1-0 por incomparecencia"], ["-+", "0-1 por incomparecencia"], ["--", "0-0 (ninguno se presentó)"]];
    const BTN = "font-semibold px-3 py-1 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50";
    const BTN_CHICO = "bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-2.5 py-1 rounded-lg text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50";

    let canal = null;
    let codigo = "";
    let rango = [1, 999];
    let estado = null; // el último «estado» del principal
    let lineas = [];
    const esperando = new Map(); // mesa → { r, ronda, hora, enBase }: mandado y sin confirmar
    let torneoId = null; // el torneo publicado de este enlace (lo dice la base al entrar con el código)
    let ultimoEnVivo = 0; // la hora del último «estado» que mandó el principal por el canal
    let relojPublicado = null;

    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }

    // «…#adjunto=abcd2345&m=1-10», «adjunto=…» o solo el código, escrito como
    // venga («ABCD-2345», con espacios): el rango, si no viene, lo dice la base.
    function leerEnlace(texto) {
        const s = String(texto || "").trim();
        const m = s.match(/adjunto=([a-z2-9]{8})(?:&m=(\d+)-(\d+))?/);
        if (m) return { codigo: m[1], rango: m[2] ? [Number(m[2]), Number(m[3])] : [1, 999], conRango: !!m[2] };
        const solo = s.replace(/[\s-]/g, "").toLowerCase();
        return /^[a-hjkmnp-z2-9]{8}$/.test(solo) ? { codigo: solo, rango: [1, 999], conRango: false } : null;
    }

    const misMesas = () => ((estado && estado.mesas) || []).filter((m) => m.m >= rango[0] && m.m <= rango[1]);
    const mesaDe = (n) => misMesas().find((m) => m.m === n);
    const nombreTorneo = () => (estado && estado.nombre) || "Torneo de Pareo Integral";
    const autor = () => (estado && estado.arbitro) || "Árbitro adjunto";

    async function escribir(filas) {
        const { error } = await window.sb.from("arbitro_bitacora").insert(filas.map((f) => Object.assign({ pareo: codigo, torneo: nombreTorneo().slice(0, 200), resultado: null, anterior: null, articulo: "", texto: "", enviado: false }, f)));
        if (error) throw new Error("No se pudo escribir en la bitácora: " + error.message);
    }

    async function cargarBitacora() {
        const { data, error } = await window.sb.from("arbitro_bitacora").select("*").eq("pareo", codigo).order("ocurrio", { ascending: true }).range(0, 999);
        if (error) { avisar("No se pudo leer la bitácora: " + error.message, true); return; }
        lineas = data || [];
        pintarBitacora();
    }

    function pintarBitacora() {
        $("p-lineas").replaceChildren(...lineas.map((l) => el("tr", { "data-tipo": l.tipo, class: "border-t border-brand-100 dark:border-brand-800" },
            ...[window.HoraCR.fechaHora(l.ocurrio), l.ronda == null ? "" : String(l.ronda), l.mesa == null ? "" : String(l.mesa), M.TIPOS[l.tipo] || l.tipo, M.detalle(l), l.articulo || ""]
                .map((t, i) => el("td", { class: "py-2 pr-3 align-top" + (i === 3 ? " font-semibold" : "") + (i === 4 ? " whitespace-pre-line" : ""), texto: t })))));
        $("p-vacia").classList.toggle("hidden", lineas.length > 0);
        ["p-pdf", "p-docx"].forEach((b) => { $(b).disabled = !lineas.length; });
    }

    // ------------------------------------------------------------- las mesas

    function celdaJugador(m, lado) {
        const nombre = (lado === "b" ? m.b : m.n) || "—";
        const marca = lado === "b" ? m.mb : m.mn;
        const color = lado === "b" ? "blancas" : "negras";
        return el("td", { class: "py-2 pr-3 align-top", "data-jugador": color },
            el("p", { texto: nombre }),
            marca && marca.t ? el("p", { "data-marca": marca.t, class: "text-xs mt-0.5 font-semibold" + (marca.pierde ? " text-red-700 dark:text-red-300" : ""), texto: textoMarca(marca.t) }) : null,
            m.n == null ? null : el("div", { class: "flex flex-wrap gap-1 mt-1" },
                el("button", { type: "button", "data-accion": "ilegal", "data-color": color, class: BTN_CHICO, "aria-label": "Jugada ilegal de " + nombre + " (mesa " + (m.f || m.m) + ")", onclick: () => ilegal(m, lado) }, "Ilegal"),
                el("button", { type: "button", "data-accion": "irregularidad", "data-color": color, class: BTN_CHICO, "aria-label": "Irregularidad de " + nombre + " (mesa " + (m.f || m.m) + ")", onclick: () => irregularidad(m, lado) }, "Irregularidad")));
    }
    // «ii!» → «2 ilegales, 1 irregularidad»: escrito, no solo con letras.
    function textoMarca(t) {
        const i = (t.match(/i/g) || []).length, x = (t.match(/!/g) || []).length;
        return [i ? i + (i === 1 ? " ilegal" : " ilegales") : "", x ? x + (x === 1 ? " irregularidad" : " irregularidades") : ""].filter(Boolean).join(", ");
    }

    const textoR = (r) => (r ? M.textoResultado(M.valorDePareo(r)) : "Sin resultado");

    function pintarMesas() {
        const mesas = misMesas();
        $("p-zona-mesas").classList.toggle("hidden", !estado);
        if (!estado) return;
        $("p-torneo").textContent = nombreTorneo() + " · ronda " + estado.ronda + " · tus mesas: " + (rango[1] >= 999 ? "todas" : rango[0] + " a " + rango[1]);
        $("p-mesas").replaceChildren(...mesas.map((m) => {
            const espera = esperando.get(m.m);
            const pierde = !m.r && ((m.mb && m.mb.pierde) || (m.mn && m.mn.pierde));
            const anotar = m.n == null ? el("p", { class: "text-sm", texto: "Sin rival (bye)" })
                : m.r ? el("p", { class: "text-sm", texto: m.mia ? "Lo anotaste tú. Para corregirlo, avísale al principal." : "Ya tiene resultado." })
                : el("div", { class: "flex flex-wrap items-center gap-2" },
                    RAPIDOS.map(([r, t]) => el("button", { type: "button", "data-r": r, disabled: !!espera, class: BTN + " border border-brand-300 dark:border-brand-600", "aria-label": "Mesa " + (m.f || m.m) + ": " + M.textoResultado(M.valorDePareo(r)), onclick: () => mandar(m, r) }, t)),
                    el("select", { "data-otros": String(m.m), disabled: !!espera, "aria-label": "Otro resultado de la mesa " + (m.f || m.m), class: "px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm", onchange: (e) => { if (e.target.value) mandar(m, e.target.value); } },
                        el("option", { value: "", texto: "Otro…" }), OTROS.map(([r, t]) => el("option", { value: r, texto: t }))),
                    espera ? el("span", { class: "text-sm", role: "status", texto: espera.enBase ? "Guardado: el principal lo recibe en cuanto se conecte." : "Mandado: esperando al principal…" }) : null);
            return el("tr", { "data-mesa": String(m.m), "data-estado": pierde ? "pierde" : m.r ? "con-resultado" : "libre", class: "border-t border-brand-100 dark:border-brand-800" },
                el("td", { class: "py-2 pr-3 align-top font-semibold" + (pierde ? " border-l-4 border-red-600 pl-3" : "") }, String(m.f || m.m),
                    pierde ? el("p", { "data-pierde": "si", class: "text-xs font-semibold text-red-700 dark:text-red-300 mt-1", texto: "Segunda ilegal: decide el resultado" }) : null),
                celdaJugador(m, "b"), celdaJugador(m, "n"),
                el("td", { class: "py-2 pr-3 align-top" + (m.r ? " font-semibold" : " text-brand-500 dark:text-brand-300"), texto: textoR(m.r) }),
                el("td", { class: "py-2 align-top" }, anotar));
        }));
        const sel = $("p-nota-mesa"), antes = sel.value;
        sel.replaceChildren(el("option", { value: "", texto: "—" }), ...mesas.map((m) => el("option", { value: String(m.m), texto: "Mesa " + (m.f || m.m) })));
        if ([...sel.options].some((o) => o.value === antes)) sel.value = antes;
    }

    // Primero a la base (queda guardado aunque el principal no esté) y, si no
    // se puede, por el canal en vivo como antes.
    async function aLaBase(evento, ronda, payload) {
        if (!window.PareoPublicar) { canal.send({ type: "broadcast", event: evento, payload }); return "canal"; }
        return window.PareoPublicar.mandarAdjunto(canal, codigo, evento, ronda, payload);
    }

    async function mandar(m, r) {
        if (!canal || !estado) return;
        const ronda = estado.ronda;
        esperando.set(m.m, { r, ronda, hora: Date.now() });
        pintarMesas();
        const via = await aLaBase("resultado", ronda, { ronda, mesa: m.m, r });
        const e0 = esperando.get(m.m);
        if (via && via.rechazo) {
            if (e0 && e0.r === r) esperando.delete(m.m);
            pintarMesas();
            avisar("La mesa " + (m.f || m.m) + " no se tomó: " + (via.error || "inténtalo de nuevo."), true);
            return;
        }
        if (via === "base") {
            // Guardado: el principal lo recibe al conectarse; se confirma cuando
            // él lo trae (por el canal o en el torneo publicado).
            if (e0 && e0.r === r) e0.enBase = true;
            pintarMesas();
            return;
        }
        // Solo por el canal: si el principal no contesta (su Pareo cerrado), se dice y se puede volver a mandar.
        setTimeout(() => {
            const e = esperando.get(m.m);
            if (e && e.r === r && !e.enBase && Date.now() - e.hora >= 9000) {
                esperando.delete(m.m);
                pintarMesas();
                avisar("El árbitro principal no contestó por la mesa " + (m.f || m.m) + ": ¿tiene abierto su Pareo Integral? Vuelve a mandarlo.", true);
            }
        }, 10000);
    }

    // Un estado nuevo: lo que se mandó y ya está en la mesa queda en la bitácora como enviado.
    async function alLlegar(d, delPublicado) {
        if (d.apagado) { $("p-estado").textContent = "El árbitro principal apagó este enlace."; desconectar(); return; }
        if (!delPublicado) ultimoEnVivo = Date.now();
        estado = d;
        const confirmadas = [];
        for (const [mesa, e] of esperando) {
            const m = mesaDe(mesa);
            if (!m || d.ronda !== e.ronda) { esperando.delete(mesa); continue; }
            if (m.r === e.r) { confirmadas.push({ ronda: e.ronda, mesa, tipo: "resultado", resultado: M.nombreBitacora(M.valorDePareo(e.r)), enviado: true, texto: (m.b || "") + " – " + (m.n || "") }); esperando.delete(mesa); }
            else if (m.r) { esperando.delete(mesa); avisar("La mesa " + (m.f || m.m) + " ya tenía otro resultado en Pareo («" + textoR(m.r) + "»): no se cambió.", true); }
        }
        $("p-estado").textContent = delPublicado
            ? "El árbitro principal no está conectado: estas son las mesas del torneo publicado. Lo que anotes queda guardado y él lo recibe en cuanto abra su Pareo Integral."
            : "Conectado con el árbitro principal" + (d.principal ? " (" + d.principal + ")" : "") + ".";
        pintarMesas();
        if (confirmadas.length) {
            try { await escribir(confirmadas); await cargarBitacora(); avisar(confirmadas.length === 1 ? "Resultado aceptado por el árbitro principal." : confirmadas.length + " resultados aceptados por el árbitro principal."); }
            catch (e) { avisar("El principal lo aceptó, pero " + e.message, true); }
        }
    }

    // ------------------------------------------------------------- ilegales, irregularidades y notas

    async function elegir(titulo, texto, lista, aceptar, peligro) {
        for (let previo = { tipo: lista[0].id, nota: null };;) {
            const r = await window.Avisos.formulario({ titulo, texto: previo.falta ? "Escribe qué pasó: con «Otra» es obligatorio. " + texto : texto, aceptar, peligro,
                campos: [{ nombre: "tipo", etiqueta: "¿Qué fue?", tipo: "select", valor: previo.tipo, opciones: lista.map((t) => [t.id, t.texto]) },
                    { nombre: "nota", etiqueta: "Qué pasó (obligatorio con «Otra»)", tipo: "textarea", max: 500, valor: previo.nota }] });
            if (r === null) return null;
            const t = M.textoTipo(lista, r.tipo, r.nota);
            if (t) return t;
            previo = { tipo: r.tipo, nota: r.nota || null, falta: true };
        }
    }

    function avisarPrincipal(m, lado, tipo, articulo, texto) {
        aLaBase("nota", estado ? estado.ronda : 0, Object.assign({ mesa: m ? m.m : null, tipo, texto: texto.slice(0, 500), autor: autor().slice(0, 60) }, lado ? { lado } : {}, articulo ? { articulo } : {}))
            .then((via) => { if (via && via.rechazo) avisar("No le llegó al principal: " + (via.error || "inténtalo de nuevo."), true); });
    }

    async function ilegal(m, lado) {
        const nombre = (lado === "b" ? m.b : m.n) || "";
        const marca = lado === "b" ? m.mb : m.mn;
        const segunda = !!(marca && /i/.test(marca.t || ""));
        const t = await elegir("Jugada ilegal de " + nombre + " (mesa " + (m.f || m.m) + ")",
            segunda ? "Esta sería la SEGUNDA jugada ilegal de " + nombre + " en esta partida: pierde la partida (art. " + M.ARTICULO_ILEGAL + "), salvo que su rival no pueda dar mate (tablas). El resultado lo decides tú."
                : "Es la primera de " + nombre + ": se le dan 2 minutos más a su rival (art. " + M.ARTICULO_ILEGAL + "). Le llega al árbitro principal.",
            M.TIPOS_ILEGAL, segunda ? "Anotar la SEGUNDA ilegal" : "Anotar la ilegal", segunda);
        if (!t) return;
        avisarPrincipal(m, lado, "sancion", "ilegal", "Jugada ilegal: " + t.texto);
        try { await escribir([{ ronda: estado.ronda, mesa: m.m, tipo: "ilegal", color: lado === "b" ? "blancas" : "negras", jugador: nombre.slice(0, 120), texto: t.texto, articulo: M.ARTICULO_ILEGAL }]); await cargarBitacora(); }
        catch (e) { avisar(e.message, true); return; }
        avisar(segunda ? "Segunda ilegal anotada: decide el resultado de la mesa " + (m.f || m.m) + "." : "Ilegal anotada y avisada al principal.");
    }

    async function irregularidad(m, lado) {
        const nombre = (lado === "b" ? m.b : m.n) || "";
        const t = await elegir("Irregularidad de " + nombre + " (mesa " + (m.f || m.m) + ")", "Queda en tu bitácora y le llega al árbitro principal.", M.TIPOS_IRREGULARIDAD, "Anotar la irregularidad", false);
        if (!t) return;
        avisarPrincipal(m, lado, "sancion", ARTICULO_PAREO[t.articulo] || "", "Irregularidad: " + t.texto);
        try { await escribir([{ ronda: estado.ronda, mesa: m.m, tipo: "irregularidad", color: lado === "b" ? "blancas" : "negras", jugador: nombre.slice(0, 120), texto: t.texto, articulo: t.articulo || "" }]); await cargarBitacora(); }
        catch (e) { avisar(e.message, true); return; }
        avisar("Irregularidad anotada y avisada al principal.");
    }

    async function nota() {
        if (!canal || !estado) { avisar("Primero conéctate con el enlace de árbitro.", true); return; }
        const texto = $("p-nota-texto").value.trim();
        if (!texto) { avisar("Cuenta qué pasó.", true); return; }
        const mesa = mesaDe(Number($("p-nota-mesa").value)) || null;
        const articulo = $("p-nota-articulo").value.trim();
        avisarPrincipal(mesa, null, "otra", "", (articulo ? "(" + articulo + ") " : "") + texto);
        try {
            await escribir([{ ronda: estado.ronda, mesa: mesa ? mesa.m : null, tipo: $("p-nota-tipo").value, articulo, texto }]);
            $("p-nota-texto").value = ""; $("p-nota-articulo").value = "";
            await cargarBitacora();
            avisar("Anotado en tu bitácora y avisado al árbitro principal.");
        } catch (e) { avisar(e.message, true); }
    }

    // ------------------------------------------------------------- conectar

    function desconectar() {
        if (canal) canal.unsubscribe();
        canal = null;
        clearInterval(relojPublicado);
        relojPublicado = null;
    }

    // Las mesas de la ronda en juego, del torneo publicado: lo que se ve
    // cuando el principal no contesta por el canal. Sin las marcas de las
    // incidencias (no se publican); en equipos, no (los tableros salen del
    // principal).
    async function leerPublicado() {
        if (!torneoId || !canal || Date.now() - ultimoEnVivo < 30000) return;
        // El principal solo manda su estado cuando algo cambia: antes de dar
        // por hecho que no está, se le pregunta.
        const antes = ultimoEnVivo;
        canal.send({ type: "broadcast", event: "pedir", payload: {} });
        await new Promise((listo) => setTimeout(listo, 3000));
        if (ultimoEnVivo !== antes || !canal) return;
        const { data, error } = await window.sb.from("pareo_publicados").select("nombre, datos").eq("id", torneoId).maybeSingle();
        if (error || !data || !data.datos || data.datos.tipo === "equipos" || Date.now() - ultimoEnVivo < 30000) return;
        const t = data.datos, R = (t.rondas || [])[(t.rondas || []).length - 1];
        if (!R) return;
        const nombre = new Map((t.jugadores || []).map((j) => [j.id, j.nombre]));
        alLlegar({
            nombre: t.grupo || t.nombre || data.nombre || "", ronda: t.rondas.length, arbitro: (estado && estado.arbitro) || arbitroBase,
            mesas: (R.mesas || []).map((m, i) => ({ m: i + 1, f: i + 1, b: nombre.get(m.b) || "?", n: m.n == null ? null : nombre.get(m.n) || "?", r: m.r || null })),
        }, true);
    }
    let arbitroBase = "";

    async function conectar() {
        const x = leerEnlace($("p-enlace").value);
        if (!x) { avisar("Ese no es un enlace de árbitro de Pareo Integral: tiene que traer «#adjunto=» y un código de 8 letras.", true); return; }
        desconectar();
        codigo = x.codigo; rango = x.rango; estado = null; esperando.clear();
        torneoId = null; ultimoEnVivo = 0; arbitroBase = "";
        pintarMesas();
        // La base dice de qué torneo es el código y cuáles son sus mesas (si no
        // contesta, se sigue con el enlace, como antes).
        if (window.PareoPublicar) {
            const r = await window.PareoPublicar.entrarAdjunto(codigo);
            if (r.ok) { torneoId = r.id; rango = [r.desde, r.hasta]; arbitroBase = r.arbitro || ""; }
            else if (r.motivo === "apagado" || (r.motivo === "no" && !x.conRango)) { $("p-estado").textContent = r.error; avisar(r.error, true); return; }
        } else if (!x.conRango) { avisar("Con solo el código no se pudo entrar: pega el enlace completo.", true); return; }
        $("p-estado").textContent = "Conectando con el Pareo Integral del árbitro principal…";
        canal = window.sb.channel("pareo-adjunto-" + codigo);
        canal.on("broadcast", { event: "estado" }, (msg) => { alLlegar(msg.payload || {}); });
        canal.subscribe((st) => {
            if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} });
            else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") $("p-estado").textContent = "No se pudo conectar. Revisa la conexión y vuelve a tocar «Conectar».";
        });
        setTimeout(() => {
            if (!canal || estado) return;
            if (torneoId) leerPublicado();
            else $("p-estado").textContent = "Conectado, pero el árbitro principal no contesta: ¿tiene abierto su Pareo Integral con este torneo?";
        }, 8000);
        // Mientras el principal no conteste, el torneo publicado cada 20 segundos.
        if (torneoId) relojPublicado = setInterval(leerPublicado, 20000);
        await cargarBitacora();
    }

    async function bajar(cual) {
        if (!lineas.length) return;
        try {
            const doc = M.documento({ pareo: codigo, torneo: nombreTorneo() }, lineas, autor(), (x) => window.HoraCR.fechaHora(x));
            let blob;
            if (cual === "docx") {
                try { doc.marca = await window.MarcaAgua.preparar(); } catch (e) { /* sin conexión: sin marca */ }
                blob = window.ReporteDOCX.generar(doc);
            } else blob = await window.ReportePDF.generar(doc);
            const a = el("a", { href: URL.createObjectURL(blob), download: "bitacora-arbitro-pareo-" + codigo + "." + cual });
            document.body.append(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        } catch (e) { avisar("No se pudo armar el archivo: " + (e.message || e), true); }
    }

    $("p-conectar").addEventListener("click", conectar);
    $("p-enlace").addEventListener("keydown", (e) => { if (e.key === "Enter") conectar(); });
    $("p-nota-agregar").addEventListener("click", nota);
    $("p-pdf").addEventListener("click", () => bajar("pdf"));
    $("p-docx").addEventListener("click", () => bajar("docx"));
    // Llegó con el enlace en la dirección (mesa-arbitro.html#adjunto=…): se pone solo, sin guardarlo.
    if (/adjunto=/.test(location.hash)) $("p-enlace").value = location.hash.slice(1);

    window.MesaArbitroPareo = { leerEnlace, textoMarca };
})();

/*! rev bfb5bbb0d2d82f9f */
