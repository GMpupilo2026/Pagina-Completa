/* La sala de seminario de arbitraje, en arbitro.html («/arbitro»).

   Lo pidió el dueño (16/11/2026): un espacio para correr el seminario, cerrado
   hasta que el instructor lo abre, donde él decide quién entra. Lo que eligió:
   instructor = administración o un organizador (quien puede dar herramientas);
   entrada = SOLO sala de espera (el árbitro pide, el instructor admite o
   rechaza uno por uno); contenido = las diapositivas del curso, preguntas con
   tiempo y el examen de práctica con su nota.

   Quién ve qué lo decide la base (supabase/migraciones/…_seminario_arbitraje.sql):
   esta página solo pinta. El árbitro que no está admitido no puede leer la
   sala (RLS), y la opción buena de una pregunta no está en la sala hasta que
   el instructor la muestra.

   Dos vistas en la misma sección:
   - Instructor (`arbitros_puedo_dar()` no vacío): abre su sala, elige tema y
     diapositiva, admite o rechaza, lanza preguntas, muestra la respuesta, abre
     el examen y ve las notas.
   - Árbitro: ve las salas abiertas que puede pedir, pide entrar, espera, y ya
     admitido sigue la diapositiva, contesta y hace el examen.

   Realtime escucha siempre con filtro (por sala o por persona). Las salas que
   se abren se buscan cada 20 s mientras la página está a la vista: no hay una
   columna por la que filtrar «salas nuevas para mí».

   Ver «La sala de seminario de arbitraje» en docs/decisiones/permisos-y-roles.md. */
(function () {
    "use strict";
    const C = window.SEMINARIO_CONTENIDO;
    const $ = (id) => document.getElementById(id);
    const EXAMEN_PREGUNTAS = 25;
    const EXAMEN_MINUTOS = 45;

    let yo = null;          // id de la cuenta
    let caja = null;        // la sección
    let canales = [];
    let sondeo = null;
    const relojes = {};     // una cuenta atrás por cosa: la pregunta y el examen corren a la vez

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    function boton(texto, clase, alHacer) {
        const b = el("button", clase || "sem-btn", texto);
        b.type = "button";
        if (alHacer) b.addEventListener("click", alHacer);
        return b;
    }
    function avisar(msg) {
        if (window.Avisos && Avisos.avisar) Avisos.avisar(msg);
    }
    function errorDe(e) { return (e && (e.message || e.error_description)) || String(e); }
    async function rpc(nombre, args) {
        const r = await sb.rpc(nombre, args || {});
        if (r.error) throw r.error;
        return r.data;
    }
    function barajar(n) {
        const a = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }
    function soltarCanales() {
        canales.forEach((c) => { try { sb.removeChannel(c); } catch (e) { /* ya cerrado */ } });
        canales = [];
    }
    // Cada escucha escribe su tabla y su filtro a la vista: así las leen
    // verificar-realtime-publicadas.js y verificar-realtime-filtros.js.
    function escuchar(nombre, cambio, alCambiar) {
        const c = sb.channel(nombre)
            .on("postgres_changes", cambio, alCambiar)
            .subscribe();
        canales.push(c);
        return c;
    }

    // ------------------------------------------------------------ contenido
    const TEMAS = [];
    (C && C.modulos || []).forEach((m) => m.temas.forEach((t) => TEMAS.push(Object.assign({ modulo: m.nombre }, t))));
    const temaPorId = (id) => TEMAS.find((t) => t.id === id) || null;

    function pintarTablero(cont, fen, pie) {
        const fig = el("figure", "sem-diagrama");
        const tab = el("div", "example-board sem-tablero");
        fig.appendChild(tab);
        let lectura = "";
        try {
            const juego = new window.Chess(fen);
            if (window.ExampleBoard) window.ExampleBoard.render(tab, juego);
            if (window.BlindNotation) lectura = window.BlindNotation.positionSentence(juego);
        } catch (e) { /* queda la descripción */ }
        const cap = el("figcaption", "sem-pie");
        if (pie) cap.appendChild(el("span", null, pie + " "));
        if (lectura) cap.appendChild(el("span", "sr-only", lectura));
        fig.appendChild(cap);
        cont.appendChild(fig);
    }

    // Una diapositiva tal como la ven todos (instructor y árbitros).
    function diapositiva(tema, n) {
        const d = tema && tema.diapositivas[n];
        const art = el("article", "sem-diapositiva");
        if (!d) {
            art.appendChild(el("p", "sem-diap-vacia", "El instructor todavía no eligió qué mostrar."));
            return art;
        }
        const txt = el("div", "sem-diap-texto");
        txt.appendChild(el("p", "sem-diap-tema", tema.modulo + " · " + tema.titulo + " · " + (n + 1) + " de " + tema.diapositivas.length));
        const h = el("h3", "sem-diap-titulo");
        if (d.icono) { const ic = el("span", "sem-diap-icono", d.icono + " "); ic.setAttribute("aria-hidden", "true"); h.appendChild(ic); }
        h.appendChild(document.createTextNode(d.titulo));
        txt.appendChild(h);
        (d.parrafos || []).forEach((p) => txt.appendChild(el("p", "sem-diap-p", p)));
        if (d.lista && d.lista.length) {
            const ul = el("ul", "sem-diap-lista");
            d.lista.forEach((x) => ul.appendChild(el("li", null, x)));
            txt.appendChild(ul);
        }
        if (d.articulo) txt.appendChild(el("p", "sem-diap-art", d.articulo));
        art.appendChild(txt);
        if (d.fen) pintarTablero(art, d.fen, d.pie);
        return art;
    }

    function pararReloj(nombre) { clearInterval(relojes[nombre]); delete relojes[nombre]; }
    function cuentaAtras(nombre, destino, hasta, alTerminar) {
        pararReloj(nombre);
        const tic = () => {
            const s = Math.max(0, Math.ceil((new Date(hasta).getTime() - Date.now()) / 1000));
            const m = Math.floor(s / 60);
            destino.textContent = s <= 0 ? "Tiempo terminado" : s >= 60 ? m + " min " + String(s % 60).padStart(2, "0") + " s" : s + " s";
            if (s <= 0) { pararReloj(nombre); if (alTerminar) alTerminar(); }
        };
        tic();
        relojes[nombre] = setInterval(tic, 500);
    }

    // ============================================================ ÁRBITRO
    let salaArbitro = null; // id de la sala donde está (admitido)

    async function vistaArbitro() {
        soltarCanales();
        clearInterval(sondeo);
        caja.textContent = "";
        caja.appendChild(el("h2", "sem-h2", "🎓 Sala de seminario"));
        const lista = el("div", "sem-lista");
        lista.setAttribute("aria-live", "polite");
        caja.appendChild(lista);
        escuchar("sem-yo-" + yo, { event: "*", schema: "public", table: "seminario_participantes", filter: "arbitro_id=eq." + yo }, () => refrescarArbitro(lista));
        await refrescarArbitro(lista);
        sondeo = setInterval(() => { if (!document.hidden && !salaArbitro) refrescarArbitro(lista); }, 20000);
    }

    async function refrescarArbitro(lista) {
        let salas;
        try { salas = (await rpc("seminario_salas_para_mi")) || []; }
        catch (e) { lista.textContent = "No se pudo ver si hay una sala abierta: " + errorDe(e); return; }
        const admitida = salas.find((s) => s.mi_estado === "admitido");
        if (admitida) { if (salaArbitro !== admitida.sala_id) entrarSala(admitida); return; }
        if (salaArbitro) { salaArbitro = null; vistaArbitro(); return; }
        lista.textContent = "";
        if (!salas.length) {
            lista.appendChild(el("p", "sem-nota", "No hay ninguna sala abierta para ti. Cuando tu instructor abra el seminario, aparece aquí y puedes pedir entrar."));
            return;
        }
        salas.forEach((s) => {
            const fila = el("div", "sem-tarjeta");
            fila.appendChild(el("h3", "sem-h3", s.titulo));
            fila.appendChild(el("p", "sem-nota", "Instructor: " + s.instructor));
            if (s.mi_estado === "esperando") {
                fila.appendChild(el("p", "sem-estado", "⏳ Estás en la sala de espera. El instructor te deja entrar en cuanto te vea."));
            } else {
                if (s.mi_estado === "rechazado") fila.appendChild(el("p", "sem-estado", "El instructor no te dejó entrar. Puedes volver a pedirlo."));
                if (s.mi_estado === "sacado") fila.appendChild(el("p", "sem-estado", "El instructor te sacó de la sala. Puedes volver a pedir entrar."));
                fila.appendChild(boton("Pedir entrar", "sem-btn", async (ev) => {
                    ev.currentTarget.disabled = true;
                    try { await rpc("seminario_pedir_entrar", { p_sala: s.sala_id }); }
                    catch (e) { avisar("No se pudo pedir entrar: " + errorDe(e)); }
                    refrescarArbitro(lista);
                }));
            }
            lista.appendChild(fila);
        });
    }

    async function entrarSala(info) {
        salaArbitro = info.sala_id;
        clearInterval(sondeo);
        soltarCanales();
        caja.textContent = "";
        const cab = el("div", "sem-cabecera");
        cab.appendChild(el("h2", "sem-h2", "🎓 " + info.titulo));
        cab.appendChild(el("p", "sem-nota", "Instructor: " + info.instructor + ". Lo que él proyecta aparece aquí."));
        caja.appendChild(cab);
        const vista = el("div", "sem-vista");
        const preg = el("div", "sem-pregunta-caja");
        preg.setAttribute("aria-live", "polite");
        const exam = el("div", "sem-examen-caja");
        caja.append(vista, preg, exam);
        let ultima = null;
        const pintar = async () => {
            const r = await sb.from("seminario_salas").select("*").eq("id", info.sala_id).maybeSingle();
            if (r.error || !r.data || r.data.cerrada_en) { salaArbitro = null; vistaArbitro(); return; }
            const s = r.data;
            if (!ultima || ultima.tema !== s.tema || ultima.diapositiva !== s.diapositiva) {
                vista.replaceChildren(diapositiva(temaPorId(s.tema), s.diapositiva));
            }
            if (!ultima || ultima.pregunta_id !== s.pregunta_id || ultima.correcta !== s.correcta || ultima.pregunta_hasta !== s.pregunta_hasta) {
                await pintarPreguntaArbitro(preg, s);
            }
            if (!ultima || ultima.examen_abierto !== s.examen_abierto) await pintarExamen(exam, s);
            ultima = s;
        };
        escuchar("sem-sala-" + info.sala_id, { event: "*", schema: "public", table: "seminario_salas", filter: "id=eq." + info.sala_id }, pintar);
        // Si lo sacan, su fila cambia: vuelve a la lista.
        escuchar("sem-yo-" + yo, { event: "*", schema: "public", table: "seminario_participantes", filter: "arbitro_id=eq." + yo }, (p) => {
            if (p.new && p.new.sala_id === info.sala_id && p.new.estado !== "admitido") { salaArbitro = null; vistaArbitro(); }
        });
        await pintar();
    }

    async function pintarPreguntaArbitro(cont, s) {
        cont.textContent = "";
        pararReloj("pregunta");
        if (!s.pregunta_id || !s.pregunta) return;
        const mia = await sb.from("seminario_respuestas").select("opcion").eq("sala_id", s.id).eq("pregunta_id", s.pregunta_id).maybeSingle();
        let elegida = mia.data ? mia.data.opcion : null;
        const caja2 = el("div", "sem-tarjeta sem-pregunta");
        const cab = el("div", "sem-fila");
        cab.appendChild(el("h3", "sem-h3", "Pregunta"));
        const tiempo = el("span", "sem-tiempo");
        cab.appendChild(tiempo);
        caja2.appendChild(cab);
        caja2.appendChild(el("p", "sem-diap-p", s.pregunta.texto));
        const ops = el("div", "sem-opciones");
        const abierta = s.correcta == null && new Date(s.pregunta_hasta).getTime() > Date.now();
        const botones = (s.pregunta.opciones || []).map((o, i) => {
            const letra = String.fromCharCode(65 + i);
            const b = boton(letra + ". " + o, "sem-opcion");
            b.setAttribute("aria-pressed", String(elegida === i));
            if (s.correcta != null) {
                if (i === s.correcta) { b.classList.add("sem-bien"); b.textContent += "  ✓ correcta"; }
                else if (i === elegida) { b.classList.add("sem-mal"); b.textContent += "  ✗ tu respuesta"; }
            }
            b.disabled = !abierta;
            b.addEventListener("click", async () => {
                try {
                    await rpc("seminario_responder", { p_sala: s.id, p_pregunta_id: s.pregunta_id, p_opcion: i });
                    elegida = i;
                    botones.forEach((x, k) => x.setAttribute("aria-pressed", String(k === i)));
                    estado.textContent = "Respuesta enviada: " + letra + ". Puedes cambiarla mientras corre el tiempo.";
                } catch (e) { estado.textContent = "No se pudo enviar: " + errorDe(e); }
            });
            ops.appendChild(b);
            return b;
        });
        caja2.appendChild(ops);
        const estado = el("p", "sem-estado");
        caja2.appendChild(estado);
        if (s.correcta != null) {
            estado.textContent = elegida == null ? "No contestaste esta pregunta." : (elegida === s.correcta ? "¡Bien! Acertaste." : "Esta vez no: la correcta está marcada.");
            tiempo.textContent = "Cerrada";
        } else if (abierta) {
            if (elegida != null) estado.textContent = "Respuesta enviada: " + String.fromCharCode(65 + elegida) + ".";
            cuentaAtras("pregunta", tiempo, s.pregunta_hasta, () => { botones.forEach((b) => { b.disabled = true; }); estado.textContent = "Se acabó el tiempo. Espera a que el instructor muestre la respuesta."; });
        } else {
            tiempo.textContent = "Tiempo terminado";
            estado.textContent = "Se acabó el tiempo. Espera a que el instructor muestre la respuesta.";
        }
        cont.appendChild(caja2);
    }

    // ------------------------------------------------------------ examen
    async function pintarExamen(cont, s) {
        cont.textContent = "";
        const hecha = await sb.from("seminario_examenes").select("aciertos,total,nota").eq("sala_id", s.id).eq("arbitro_id", yo).maybeSingle();
        if (hecha.data) {
            const t = el("div", "sem-tarjeta");
            t.appendChild(el("h3", "sem-h3", "Examen de práctica"));
            t.appendChild(el("p", "sem-nota-grande", "Tu nota: " + Number(hecha.data.nota).toFixed(2).replace(".", ",") + " / 100"));
            t.appendChild(el("p", "sem-nota", hecha.data.aciertos + " de " + hecha.data.total + " correctas. " + (Number(hecha.data.nota) >= 80 ? "Aprobado (80 o más)." : "Para aprobar se necesita 80 o más.")));
            cont.appendChild(t);
            return;
        }
        if (!s.examen_abierto) return;
        const t = el("div", "sem-tarjeta");
        t.appendChild(el("h3", "sem-h3", "Examen de práctica"));
        t.appendChild(el("p", "sem-nota", EXAMEN_PREGUNTAS + " preguntas al azar, " + EXAMEN_MINUTOS + " minutos, cada una vale 4 puntos. Se aprueba con 80. Se entrega una sola vez."));
        t.appendChild(boton("Empezar el examen", "sem-btn", () => hacerExamen(cont, s)));
        cont.appendChild(t);
    }

    function hacerExamen(cont, s) {
        const banco = C.examen;
        const elegidas = barajar(banco.length).slice(0, Math.min(EXAMEN_PREGUNTAS, banco.length)).map((i) => {
            const q = banco[i];
            const orden = barajar(q.opciones.length);
            return { q, orden, buena: orden.indexOf(q.correcta), resp: null };
        });
        cont.textContent = "";
        const form = el("form", "sem-tarjeta sem-examen");
        const cab = el("div", "sem-fila");
        cab.appendChild(el("h3", "sem-h3", "Examen de práctica"));
        const tiempo = el("span", "sem-tiempo");
        cab.appendChild(tiempo);
        form.appendChild(cab);
        elegidas.forEach((x, n) => {
            const fs = el("fieldset", "sem-examen-preg");
            fs.appendChild(el("legend", "sem-diap-p", (n + 1) + ". " + x.q.texto));
            x.orden.forEach((oi, k) => {
                const lab = el("label", "sem-examen-op");
                const r = el("input");
                r.type = "radio"; r.name = "p" + n; r.value = String(k);
                r.addEventListener("change", () => { x.resp = k; });
                lab.append(r, document.createTextNode(" " + String.fromCharCode(65 + k) + ". " + x.q.opciones[oi]));
                fs.appendChild(lab);
            });
            form.appendChild(fs);
        });
        const enviar = boton("Entregar el examen", "sem-btn");
        enviar.type = "submit";
        form.appendChild(enviar);
        let entregado = false;
        const entregar = async () => {
            if (entregado) return;
            entregado = true;
            pararReloj("examen");
            enviar.disabled = true;
            const aciertos = elegidas.filter((x) => x.resp === x.buena).length;
            let nota;
            try { nota = await rpc("seminario_entregar_examen", { p_sala: s.id, p_aciertos: aciertos, p_total: elegidas.length }); }
            catch (e) { avisar("No se pudo entregar: " + errorDe(e)); entregado = false; enviar.disabled = false; return; }
            cont.textContent = "";
            const res = el("div", "sem-tarjeta");
            res.appendChild(el("h3", "sem-h3", "Examen de práctica"));
            res.appendChild(el("p", "sem-nota-grande", "Tu nota: " + Number(nota).toFixed(2).replace(".", ",") + " / 100"));
            res.appendChild(el("p", "sem-nota", aciertos + " de " + elegidas.length + " correctas. " + (Number(nota) >= 80 ? "Aprobado." : "Para aprobar se necesita 80 o más.")));
            const ol = el("ol", "sem-revision");
            elegidas.forEach((x) => {
                const li = el("li", x.resp === x.buena ? "sem-bien" : "sem-mal");
                li.appendChild(el("p", null, (x.resp === x.buena ? "✓ " : "✗ ") + x.q.texto));
                li.appendChild(el("p", "sem-nota", "Correcta: " + x.q.opciones[x.q.correcta] + (x.resp != null && x.resp !== x.buena ? " · Tu respuesta: " + x.q.opciones[x.orden[x.resp]] : x.resp == null ? " · Sin responder" : "")));
                if (x.q.explicacion) li.appendChild(el("p", "sem-nota", x.q.explicacion));
                ol.appendChild(li);
            });
            res.appendChild(ol);
            cont.appendChild(res);
        };
        form.addEventListener("submit", (ev) => { ev.preventDefault(); entregar(); });
        cont.appendChild(form);
        cuentaAtras("examen", tiempo, new Date(Date.now() + EXAMEN_MINUTOS * 60000).toISOString(), entregar);
    }

    // ============================================================ INSTRUCTOR
    let sala = null;        // la fila de la sala abierta
    let pregActual = null;  // { id, buena } de la pregunta lanzada (la buena, ya barajada)

    const clave = (id) => "seminario_pregunta_" + id;
    function guardarPregunta() {
        try { if (sala && pregActual) sessionStorage.setItem(clave(sala.id), JSON.stringify(pregActual)); } catch (e) { /* sin almacenamiento */ }
    }
    function leerPregunta() {
        try { return JSON.parse(sessionStorage.getItem(clave(sala.id)) || "null"); } catch (e) { return null; }
    }

    async function vistaInstructor() {
        soltarCanales();
        caja.textContent = "";
        caja.appendChild(el("h2", "sem-h2", "🎓 Sala de seminario"));
        const r = await sb.from("seminario_salas").select("*").eq("instructor_id", yo).is("cerrada_en", null).maybeSingle();
        if (r.data) { sala = r.data; return consola(); }
        sala = null;
        const t = el("div", "sem-tarjeta");
        t.appendChild(el("p", "sem-nota", "La sala está cerrada: nadie la ve. Al abrirla, tus árbitros pueden pedir entrar y tú decides a quién dejas pasar, uno por uno."));
        const lab = el("label", "sem-label", "Nombre del seminario");
        const inp = el("input", "sem-input");
        inp.id = "sem-titulo"; inp.maxLength = 120; inp.value = "Seminario de Árbitro FIDE";
        lab.htmlFor = "sem-titulo";
        t.append(lab, inp);
        t.appendChild(boton("Abrir la sala", "sem-btn", async (ev) => {
            ev.currentTarget.disabled = true;
            try { await rpc("seminario_abrir", { p_titulo: inp.value }); }
            catch (e) { avisar("No se pudo abrir la sala: " + errorDe(e)); }
            vistaInstructor();
        }));
        caja.appendChild(t);
    }

    async function recargarSala() {
        const r = await sb.from("seminario_salas").select("*").eq("id", sala.id).maybeSingle();
        if (r.data) sala = r.data;
    }

    function consola() {
        pregActual = leerPregunta();
        const cab = el("div", "sem-cabecera sem-fila");
        cab.appendChild(el("h3", "sem-h3", "Abierta: " + sala.titulo));
        cab.appendChild(boton("Cerrar la sala", "sem-btn sem-btn-sec", async () => {
            const ok = window.Avisos && Avisos.confirmar
                ? await Avisos.confirmar("Al cerrar la sala, todos salen y nadie puede volver a entrar a esta sala.", { aceptar: "Cerrar la sala", peligro: true })
                : true;
            if (!ok) return;
            try { await rpc("seminario_cerrar", { p_sala: sala.id }); } catch (e) { avisar("No se pudo cerrar: " + errorDe(e)); }
            vistaInstructor();
        }));
        caja.appendChild(cab);

        const grilla = el("div", "sem-consola");
        const izq = el("div", "sem-col-proyecta");
        const der = el("div", "sem-col-gente");
        grilla.append(izq, der);
        caja.appendChild(grilla);

        // Tema y diapositiva.
        const ctrl = el("div", "sem-fila sem-controles");
        const selLab = el("label", "sem-label", "Tema");
        const sel = el("select", "sem-input");
        sel.id = "sem-tema"; selLab.htmlFor = "sem-tema";
        (C.modulos || []).forEach((m) => {
            const g = el("optgroup"); g.label = m.nombre;
            m.temas.forEach((t) => { const o = el("option", null, t.titulo); o.value = t.id; g.appendChild(o); });
            sel.appendChild(g);
        });
        sel.value = sala.tema || TEMAS[0].id;
        const ant = boton("◀ Anterior", "sem-btn sem-btn-sec");
        const sig = boton("Siguiente ▶", "sem-btn sem-btn-sec");
        const proyectar = boton("Proyectar este tema", "sem-btn");
        ctrl.append(selLab, sel, proyectar, ant, sig);
        izq.appendChild(ctrl);
        const vista = el("div", "sem-vista");
        izq.appendChild(vista);
        const pregCaja = el("div", "sem-pregunta-caja");
        izq.appendChild(pregCaja);

        const mostrar = async (tema, n) => {
            try { await rpc("seminario_mostrar", { p_sala: sala.id, p_tema: tema, p_diapositiva: n }); await recargarSala(); }
            catch (e) { avisar("No se pudo proyectar: " + errorDe(e)); }
            pintarVista();
        };
        const pintarVista = () => {
            const t = temaPorId(sala.tema);
            vista.replaceChildren(diapositiva(t, sala.diapositiva));
            ant.disabled = !t || sala.diapositiva <= 0;
            sig.disabled = !t || sala.diapositiva >= t.diapositivas.length - 1;
            pintarPreguntasDelTema(pregCaja);
        };
        proyectar.addEventListener("click", () => mostrar(sel.value, 0));
        ant.addEventListener("click", () => mostrar(sala.tema, sala.diapositiva - 1));
        sig.addEventListener("click", () => mostrar(sala.tema, sala.diapositiva + 1));
        pintarVista();

        // La gente: sala de espera y admitidos.
        const gente = el("div", "sem-gente");
        gente.setAttribute("aria-live", "polite");
        der.appendChild(gente);
        const examen = el("div", "sem-examen-instructor");
        der.appendChild(examen);
        const pintarGente = () => pintarParticipantes(gente);
        escuchar("sem-gente-" + sala.id, { event: "*", schema: "public", table: "seminario_participantes", filter: "sala_id=eq." + sala.id }, pintarGente);
        escuchar("sem-resp-" + sala.id, { event: "*", schema: "public", table: "seminario_respuestas", filter: "sala_id=eq." + sala.id }, () => pintarConteo());
        pintarGente();
        pintarExamenInstructor(examen);
    }

    async function pintarParticipantes(cont) {
        let filas;
        try { filas = (await rpc("seminario_participantes_de", { p_sala: sala.id })) || []; }
        catch (e) { cont.textContent = "No se pudo leer la sala de espera: " + errorDe(e); return; }
        cont.textContent = "";
        const espera = filas.filter((f) => f.estado === "esperando");
        const dentro = filas.filter((f) => f.estado === "admitido");
        const h1 = el("h3", "sem-h3", "Sala de espera (" + espera.length + ")");
        cont.appendChild(h1);
        if (!espera.length) cont.appendChild(el("p", "sem-nota", "Nadie esperando."));
        espera.forEach((f) => {
            const fila = el("div", "sem-persona");
            fila.appendChild(el("span", "sem-persona-nombre", f.nombre));
            fila.appendChild(boton("Dejar entrar", "sem-btn sem-btn-chico", () => decidir(f.arbitro_id, "admitido", cont)));
            const no = boton("Rechazar", "sem-btn sem-btn-sec sem-btn-chico", () => decidir(f.arbitro_id, "rechazado", cont));
            no.setAttribute("aria-label", "Rechazar a " + f.nombre);
            fila.appendChild(no);
            cont.appendChild(fila);
        });
        if (espera.length > 1) {
            cont.appendChild(boton("Dejar entrar a todos los que esperan", "sem-btn sem-btn-sec", async () => {
                for (const f of espera) { try { await rpc("seminario_decidir", { p_sala: sala.id, p_arbitro: f.arbitro_id, p_estado: "admitido" }); } catch (e) { avisar(errorDe(e)); } }
                pintarParticipantes(cont);
            }));
        }
        cont.appendChild(el("h3", "sem-h3 sem-mt", "En la sala (" + dentro.length + ")"));
        if (!dentro.length) cont.appendChild(el("p", "sem-nota", "Todavía no dejaste entrar a nadie."));
        dentro.forEach((f) => {
            const fila = el("div", "sem-persona");
            fila.appendChild(el("span", "sem-persona-nombre", f.nombre));
            const b = boton("Sacar", "sem-btn sem-btn-sec sem-btn-chico", () => decidir(f.arbitro_id, "sacado", cont));
            b.setAttribute("aria-label", "Sacar de la sala a " + f.nombre);
            fila.appendChild(b);
            cont.appendChild(fila);
        });
    }

    async function decidir(arbitro, estado, cont) {
        try { await rpc("seminario_decidir", { p_sala: sala.id, p_arbitro: arbitro, p_estado: estado }); }
        catch (e) { avisar("No se pudo: " + errorDe(e)); }
        pintarParticipantes(cont);
    }

    // Las preguntas del tema que se proyecta, para lanzarlas.
    let conteoCaja = null;
    function pintarPreguntasDelTema(cont) {
        cont.textContent = "";
        const t = temaPorId(sala.tema);
        const vivo = el("div", "sem-pregunta-viva");
        cont.appendChild(vivo);
        conteoCaja = vivo;
        pintarConteo();
        if (!t || !t.preguntas.length) return;
        const det = el("details", "sem-tarjeta");
        det.appendChild(el("summary", "sem-h3", "Preguntas de este tema (" + t.preguntas.length + ")"));
        const segLab = el("label", "sem-label", "Segundos para contestar");
        const seg = el("input", "sem-input sem-input-chico");
        seg.type = "number"; seg.min = "10"; seg.max = "300"; seg.value = "45"; seg.id = "sem-segundos";
        segLab.htmlFor = "sem-segundos";
        det.append(segLab, seg);
        t.preguntas.forEach((q, i) => {
            const fila = el("div", "sem-persona");
            fila.appendChild(el("span", "sem-persona-nombre", (i + 1) + ". " + q.texto));
            fila.appendChild(boton("Lanzar", "sem-btn sem-btn-chico", () => lanzar(t, i, Number(seg.value) || 45)));
            det.appendChild(fila);
        });
        cont.appendChild(det);
    }

    async function lanzar(t, i, segundos) {
        const q = t.preguntas[i];
        const orden = barajar(q.opciones.length);
        const id = t.id + "#" + (i + 1) + "-" + Date.now().toString(36);
        try {
            await rpc("seminario_preguntar", { p_sala: sala.id, p_pregunta_id: id, p_texto: q.texto, p_opciones: orden.map((k) => q.opciones[k]), p_segundos: segundos });
            pregActual = { id, buena: orden.indexOf(q.correcta), explicacion: q.explicacion || "", fen: q.fen || null };
            guardarPregunta();
            await recargarSala();
        } catch (e) { avisar("No se pudo lanzar la pregunta: " + errorDe(e)); }
        pintarConteo();
    }

    async function pintarConteo() {
        const cont = conteoCaja;
        if (!cont || !sala) return;
        await recargarSala();
        cont.textContent = "";
        pararReloj("pregunta");
        if (!sala.pregunta_id || !sala.pregunta) return;
        const t = el("div", "sem-tarjeta sem-pregunta");
        const cab = el("div", "sem-fila");
        cab.appendChild(el("h3", "sem-h3", "Pregunta en curso"));
        const tiempo = el("span", "sem-tiempo");
        cab.appendChild(tiempo);
        t.appendChild(cab);
        t.appendChild(el("p", "sem-diap-p", sala.pregunta.texto));
        const conocida = pregActual && pregActual.id === sala.pregunta_id ? pregActual : null;
        if (conocida && conocida.fen) pintarTablero(t, conocida.fen);
        let resp = [];
        try { resp = (await rpc("seminario_respuestas_de", { p_sala: sala.id, p_pregunta_id: sala.pregunta_id })) || []; } catch (e) { /* sin conteo */ }
        const ops = sala.pregunta.opciones || [];
        const ul = el("ul", "sem-conteo");
        ops.forEach((o, k) => {
            const n = resp.filter((r) => r.opcion === k).length;
            const li = el("li", sala.correcta === k ? "sem-bien" : "");
            li.textContent = String.fromCharCode(65 + k) + ". " + o + " — " + n + (n === 1 ? " respuesta" : " respuestas") +
                (conocida && conocida.buena === k ? "  (correcta)" : "");
            ul.appendChild(li);
        });
        t.appendChild(ul);
        t.appendChild(el("p", "sem-nota", resp.length + (resp.length === 1 ? " persona contestó." : " personas contestaron.")));
        if (sala.correcta != null) {
            tiempo.textContent = "Respuesta mostrada";
            const quien = el("ul", "sem-quien");
            resp.forEach((r) => quien.appendChild(el("li", r.opcion === sala.correcta ? "sem-bien" : "sem-mal", (r.opcion === sala.correcta ? "✓ " : "✗ ") + r.nombre + ": " + String.fromCharCode(65 + r.opcion))));
            t.appendChild(quien);
            if (conocida && conocida.explicacion) t.appendChild(el("p", "sem-nota", conocida.explicacion));
        } else {
            cuentaAtras("pregunta", tiempo, sala.pregunta_hasta);
            if (conocida) {
                t.appendChild(boton("Mostrar la respuesta", "sem-btn", async () => {
                    try { await rpc("seminario_revelar", { p_sala: sala.id, p_correcta: conocida.buena }); } catch (e) { avisar(errorDe(e)); }
                    pintarConteo();
                }));
            } else {
                t.appendChild(el("p", "sem-nota", "Esta pregunta se lanzó desde otra pestaña: vuelve a lanzarla para mostrar la respuesta."));
            }
        }
        t.appendChild(boton("Quitar la pregunta", "sem-btn sem-btn-sec", async () => {
            try { await rpc("seminario_quitar_pregunta", { p_sala: sala.id }); } catch (e) { avisar(errorDe(e)); }
            pintarConteo();
        }));
        cont.appendChild(t);
    }

    async function pintarExamenInstructor(cont) {
        await recargarSala();
        cont.textContent = "";
        cont.appendChild(el("h3", "sem-h3 sem-mt", "Examen de práctica"));
        cont.appendChild(el("p", "sem-nota", EXAMEN_PREGUNTAS + " preguntas al azar del banco del curso, " + EXAMEN_MINUTOS + " minutos, nota sobre 100 (se aprueba con 80)."));
        cont.appendChild(boton(sala.examen_abierto ? "Cerrar el examen" : "Abrir el examen", "sem-btn", async () => {
            try { await rpc("seminario_examen", { p_sala: sala.id, p_abierto: !sala.examen_abierto }); } catch (e) { avisar(errorDe(e)); }
            pintarExamenInstructor(cont);
        }));
        let notas = [];
        try { notas = (await rpc("seminario_examenes_de", { p_sala: sala.id })) || []; } catch (e) { /* sin notas */ }
        if (notas.length) {
            const tabla = el("table", "sem-notas");
            const tr0 = el("tr");
            ["Árbitro", "Correctas", "Nota"].forEach((x) => tr0.appendChild(el("th", null, x)));
            tabla.appendChild(tr0);
            notas.forEach((n) => {
                const tr = el("tr");
                tr.appendChild(el("td", null, n.nombre));
                tr.appendChild(el("td", null, n.aciertos + " / " + n.total));
                tr.appendChild(el("td", null, Number(n.nota).toFixed(2).replace(".", ",") + (Number(n.nota) >= 80 ? " · aprobado" : "")));
                tabla.appendChild(tr);
            });
            cont.appendChild(tabla);
        }
        cont.appendChild(boton("Actualizar las notas", "sem-btn sem-btn-sec", () => pintarExamenInstructor(cont)));
    }

    // ============================================================ arranque
    async function iniciar() {
        caja = $("seminario");
        if (!caja || !C || !window.sb) return;
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (!session) return;
            yo = session.user.id;
            const perfil = await sb.from("profiles").select("role").eq("id", yo).maybeSingle();
            const esArbitro = perfil.data && perfil.data.role === "arbitro";
            if (esArbitro) { $("seminario-caja").hidden = false; return vistaArbitro(); }
            const puede = await sb.rpc("arbitros_puedo_dar");
            if (!puede.error && Array.isArray(puede.data) && puede.data.length) {
                $("seminario-caja").hidden = false;
                return vistaInstructor();
            }
        } catch (e) {
            if (caja) caja.textContent = "No se pudo cargar la sala de seminario: " + errorDe(e);
        }
    }
    window.addEventListener("pagehide", () => { soltarCanales(); clearInterval(sondeo); Object.keys(relojes).forEach(pararReloj); });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

    // Para el verificador.
    window.SeminarioArbitraje = { TEMAS, diapositiva, barajar };
})();

/*! rev bfb5bbb0d2d82f9f */
