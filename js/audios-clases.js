/* El código de audios-clases.html: «Audios de las clases».

   El audio de cada clase que ya se dio, para volver a escucharla. Lo pidió el
   dueño para el grupo de ADAES, que es de alumnos ciegos: por eso cada clase es
   un encabezado (con el lector de pantalla se pasa de una a otra con la H), el
   reproductor es el del navegador (se maneja con el teclado y el lector lo
   conoce), la velocidad se elige en una lista, el audio sigue donde quedó la
   vez anterior y lo que se dijo está escrito al lado, para leerlo o buscarlo.

   Quién ve qué lo decide la base (public.audios_clase y el bucket audios-clase,
   migración 20261111195552): la gente de la academia y quien administra. Quien
   puede subir (administración, el supervisor o un profe de esa academia) ve
   además «Subir audios»; la base lo vuelve a comprobar al subir.

   Ver «Los audios de las clases» en docs/decisiones/accesibilidad.md. */
(function () {
    const BUCKET = "audios-clase";
    const MAX_BYTES = 50 * 1024 * 1024;
    const VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2];
    const CLAVE_POS = "audios_clase_pos_v1";
    const CLAVE_VEL = "audios_clase_vel_v1";
    let puedeSubir = false;

    function el(tag, clase, texto) {
        const n = document.createElement(tag);
        if (clase) n.className = clase;
        if (texto != null) n.textContent = texto;
        return n;
    }
    function leer(clave, def) {
        try { const v = JSON.parse(localStorage.getItem(clave)); return v == null ? def : v; } catch (e) { return def; }
    }
    function guardar(clave, valor) {
        try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento: no pasa nada */ }
    }
    function avisar(texto, tipo) {
        const a = document.getElementById("aviso");
        a.textContent = texto;
        a.className = "mb-6 rounded-xl px-4 py-3 text-sm " + (tipo === "error"
            ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            : "bg-white text-brand-700 dark:bg-brand-900 dark:text-brand-200");
    }

    /* «Martes 10 de noviembre de 2026»: el día se lee en hora de Costa Rica. */
    function diaLargo(fecha) {
        /* Sin la coma que pone el navegador después del día («martes, 10»):
           el lector de pantalla la lee como una pausa en medio de la fecha. */
        const t = HoraCR.fecha(fecha, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^([^\s,]+),/, "$1");
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
    function horaLarga(hora) {
        if (!hora) return "";
        const [h, m] = hora.split(":").map(Number);
        const h12 = h % 12 || 12;
        return h12 + ":" + String(m).padStart(2, "0") + (h < 12 ? " a. m." : " p. m.");
    }
    /* La duración dicha como se dice: «1 hora y 15 minutos». */
    function duracionDicha(seg) {
        if (!seg) return "";
        const min = Math.round(seg / 60), h = Math.floor(min / 60), m = min % 60;
        const partes = [];
        if (h) partes.push(h + (h === 1 ? " hora" : " horas"));
        if (m || !h) partes.push(m + (m === 1 ? " minuto" : " minutos"));
        return partes.join(" y ");
    }
    function megas(bytes) { return bytes ? Math.round(bytes / 1048576) + " MB" : ""; }

    /* La fecha y la hora de la clase, del nombre del archivo de Meet:
       «… - 2026_11_10 19_25 CST - Recording». También 2026-11-10 y 19:25. */
    function datosDelNombre(nombre) {
        const base = nombre.replace(/\.[^.]+$/, "");
        const m = base.match(/(\d{4})[_-](\d{2})[_-](\d{2})(?:[ _T]+(\d{1,2})[_:.h](\d{2}))?/);
        if (!m) return null;
        const fecha = m[1] + "-" + m[2] + "-" + m[3];
        if (isNaN(new Date(fecha + "T12:00:00-06:00"))) return null;
        const hora = m[4] != null && +m[4] < 24 && +m[5] < 60 ? m[4].padStart(2, "0") + ":" + m[5] + ":00" : null;
        let titulo = base.slice(0, m.index).replace(/[\s\-_–—]+$/, "").trim();
        if (!titulo) titulo = "Clase";
        return { fecha, hora, titulo: titulo.slice(0, 120), base };
    }

    /* La transcripción de Whisper repite renglones cuando hay silencio o ruido
       («no», «no», «no»…): se juntan los repetidos seguidos. */
    function parrafos(texto) {
        const salida = [];
        String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
            if (salida.length && salida[salida.length - 1] === l) return;
            salida.push(l);
        });
        return salida;
    }

    /* ---------- La lista ---------- */
    async function cargarLista() {
        const lista = document.getElementById("lista");
        const { data, error } = await sb.from("audios_clase")
            .select("id, academia_id, fecha, hora, titulo, archivo, duracion_seg, bytes, con_transcripcion")
            .order("fecha", { ascending: false }).order("hora", { ascending: false, nullsFirst: false })
            .range(0, 499);
        lista.innerHTML = "";
        if (error) { avisar("No se pudieron leer los audios. Vuelve a intentarlo en un momento.", "error"); return; }
        if (!data.length) {
            avisar(puedeSubir ? "Todavía no hay audios. Súbelos con «Subir audios»." : "Todavía no hay audios de tus clases. Cuando tu profe suba uno, aparece acá.");
            return;
        }
        document.getElementById("aviso").className = "hidden";
        const rutas = data.map((a) => a.archivo);
        const [oir, bajar] = await Promise.all([
            sb.storage.from(BUCKET).createSignedUrls(rutas, 6 * 3600),
            sb.storage.from(BUCKET).createSignedUrls(rutas, 6 * 3600, { download: true }),
        ]);
        const url = (r, ruta) => {
            const f = r && r.data && r.data.find((x) => x.path === ruta);
            return f && !f.error ? f.signedUrl : null;
        };
        data.forEach((a) => lista.append(tarjeta(a, url(oir, a.archivo), url(bajar, a.archivo))));
    }

    function tarjeta(a, urlOir, urlBajar, estudio, sinRecordar) {
        const art = el("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
        const idTitulo = "clase-" + a.id;
        art.setAttribute("aria-labelledby", idTitulo);
        const dia = diaLargo(a.fecha);
        const h = el(estudio ? "h2" : "h3", "font-serif text-xl font-bold text-brand-800 dark:text-white", dia);
        h.id = idTitulo;
        art.append(h);
        const detalle = [a.titulo, horaLarga(a.hora), duracionDicha(a.duracion_seg)].filter(Boolean).join(" · ");
        art.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mt-1", detalle));

        if (!urlOir) {
            art.append(el("p", "text-sm text-red-700 dark:text-red-300 mt-3", "Este audio no se pudo abrir. Avísale a tu profe."));
            return art;
        }
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = urlOir;
        audio.className = "w-full mt-4";
        audio.setAttribute("aria-label", "Audio de la clase del " + dia);
        art.append(audio);
        if (!sinRecordar) recordarPosicion(audio, a.id, art);
        art.append(AudiosGuia.controles(audio, { indice: a.indice }));

        const fila = el("div", "flex flex-wrap items-center gap-x-5 gap-y-3 mt-3");
        const idVel = "vel-" + a.id;
        const lab = el("label", "text-sm font-semibold text-brand-700 dark:text-brand-200", "Velocidad");
        lab.htmlFor = idVel;
        const sel = el("select", "ml-2 bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        sel.id = idVel;
        const velGuardada = leer(CLAVE_VEL, 1);
        VELOCIDADES.forEach((v) => {
            const o = el("option", null, v === 1 ? "Normal" : String(v).replace(".", ",") + " veces");
            o.value = String(v);
            if (v === velGuardada) o.selected = true;
            sel.append(o);
        });
        audio.playbackRate = velGuardada;
        audio.addEventListener("loadedmetadata", () => { audio.playbackRate = +sel.value; });
        sel.addEventListener("change", () => { audio.playbackRate = +sel.value; guardar(CLAVE_VEL, +sel.value); });
        const cajaVel = el("div");
        cajaVel.append(lab, sel);
        fila.append(cajaVel);

        if (urlBajar) {
            const d = el("a", "text-sm font-semibold text-brand-700 dark:text-accent-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                "Descargar el audio" + (a.bytes ? " (" + megas(a.bytes) + ")" : ""));
            d.href = urlBajar;
            d.setAttribute("aria-label", "Descargar el audio de la clase del " + dia + (a.bytes ? ", " + megas(a.bytes) : ""));
            fila.append(d);
        }
        if (puedeSubir && !estudio) fila.append(botonQuitar(a, dia));
        art.append(fila);

        if (estudio) return art;
        const est = el("a", "inline-block mt-4 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
            "Estudiar esta clase");
        est.href = "audios-clases.html?clase=" + encodeURIComponent(a.id);
        est.setAttribute("aria-label", "Estudiar la clase del " + dia + ": temas, buscar, partidas, preguntas y marcas");
        art.append(est);
        if (a.con_transcripcion) art.append(transcripcion(a, dia));
        return art;
    }

    /* Sigue donde quedó: la posición se guarda en este navegador cada pocos
       segundos y, al volver, el audio arranca ahí (salvo al principio o al
       final, donde no vale la pena). Se dice en voz: el cambio no se ve. */
    function recordarPosicion(audio, id, art) {
        const pos = leer(CLAVE_POS, {});
        let ultimo = 0;
        audio.addEventListener("loadedmetadata", () => {
            const t = +pos[id] || 0;
            if (t > 30 && (!audio.duration || t < audio.duration - 30)) {
                audio.currentTime = t;
                const aviso = el("p", "text-sm text-brand-600 dark:text-brand-300 mt-2", "Sigue donde lo dejaste: minuto " + Math.floor(t / 60) + ".");
                aviso.setAttribute("role", "status");
                audio.after(aviso);
            }
        }, { once: true });
        audio.addEventListener("timeupdate", () => {
            if (Math.abs(audio.currentTime - ultimo) < 5) return;
            ultimo = audio.currentTime;
            const p = leer(CLAVE_POS, {});
            p[id] = Math.floor(audio.currentTime);
            guardar(CLAVE_POS, p);
        });
        audio.addEventListener("ended", () => {
            const p = leer(CLAVE_POS, {});
            delete p[id];
            guardar(CLAVE_POS, p);
        });
    }

    /* La transcripción se pide al abrirla: son unos 35 KB por clase. */
    function transcripcion(a, dia) {
        const det = el("details", "mt-4 group");
        const sum = el("summary", "cursor-pointer text-sm font-semibold text-brand-700 dark:text-accent-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Leer lo que se dijo en la clase");
        sum.setAttribute("aria-label", "Leer lo que se dijo en la clase del " + dia);
        const cuerpo = el("div", "mt-3 space-y-2 text-brand-800 dark:text-brand-100 leading-relaxed");
        det.append(sum, cuerpo);
        let cargada = false;
        det.addEventListener("toggle", async () => {
            if (!det.open || cargada) return;
            cargada = true;
            cuerpo.append(el("p", "text-sm text-brand-500 dark:text-brand-300", "Cargando…"));
            const { data, error } = await sb.from("audios_clase").select("transcripcion").eq("id", a.id).maybeSingle();
            cuerpo.innerHTML = "";
            if (error || !data || !data.transcripcion) {
                cargada = false;
                cuerpo.append(el("p", "text-sm text-red-700 dark:text-red-300", "No se pudo abrir la transcripción. Ciérrala y vuelve a abrirla."));
                return;
            }
            cuerpo.append(el("p", "text-xs text-brand-500 dark:text-brand-300", "La escribió una computadora a partir del audio: puede tener palabras equivocadas, sobre todo en las jugadas."));
            parrafos(data.transcripcion).forEach((l) => cuerpo.append(el("p", null, l)));
        });
        return det;
    }

    function botonQuitar(a, dia) {
        const b = el("button", "text-sm font-semibold text-red-700 dark:text-red-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Quitar este audio");
        b.type = "button";
        b.setAttribute("aria-label", "Quitar el audio de la clase del " + dia);
        b.addEventListener("click", async () => {
            const ok = await Avisos.confirmar("¿Quitar el audio de la clase del " + dia + "? Los alumnos ya no lo podrán escuchar.", { aceptar: "Quitar el audio", peligro: true });
            if (!ok) return;
            b.disabled = true;
            const { error } = await sb.from("audios_clase").delete().eq("id", a.id);
            if (error) { b.disabled = false; Avisos.avisar("No se pudo quitar el audio.", { tipo: "error" }); return; }
            await sb.storage.from(BUCKET).remove([a.archivo]);
            await cargarLista();
            /* El botón ya no existe: el foco va al título de la página, y no
               se pierde al principio del documento. */
            const h1 = document.querySelector("#app h1");
            h1.setAttribute("tabindex", "-1");
            h1.focus();
            Avisos.avisar("Se quitó el audio de la clase del " + dia + ".");
        });
        return b;
    }

    /* ---------- Subir ---------- */
    async function prepararSubir() {
        const { data, error } = await sb.rpc("mis_academias_audios");
        if (error || !data || !data.length) return;
        puedeSubir = true;
        const sel = document.getElementById("subir-academia");
        data.forEach((x) => { const o = el("option", null, x.nombre); o.value = x.id; sel.append(o); });
        document.getElementById("subir").classList.remove("hidden");
        document.getElementById("subir-boton").addEventListener("click", subir);
    }

    function duracionDe(archivo) {
        return new Promise((ok) => {
            const url = URL.createObjectURL(archivo);
            const au = new Audio();
            const fin = (v) => { URL.revokeObjectURL(url); ok(v); };
            au.preload = "metadata";
            au.addEventListener("loadedmetadata", () => fin(isFinite(au.duration) ? Math.round(au.duration) : null), { once: true });
            au.addEventListener("error", () => fin(null), { once: true });
            setTimeout(() => fin(null), 15000);
            au.src = url;
        });
    }

    async function subir() {
        const boton = document.getElementById("subir-boton");
        const estado = document.getElementById("subir-estado");
        const academia = document.getElementById("subir-academia").value;
        const archivos = Array.from(document.getElementById("subir-archivos").files || []);
        const mp3 = archivos.filter((f) => /\.mp3$/i.test(f.name));
        const txt = new Map(archivos.filter((f) => /\.txt$/i.test(f.name)).map((f) => [f.name.replace(/\.txt$/i, "").toLowerCase(), f]));
        const guias = archivos.filter((f) => /\.json$/i.test(f.name));
        if (!mp3.length && !guias.length) { estado.textContent = "Elige al menos un archivo MP3 o una guía (.json)."; return; }
        boton.disabled = true;
        const informe = [];
        for (let i = 0; i < mp3.length; i++) {
            const f = mp3[i];
            estado.textContent = "Subiendo " + (i + 1) + " de " + mp3.length + ": " + f.name + "…";
            const d = datosDelNombre(f.name);
            if (!d) { informe.push(f.name + ": el nombre no trae la fecha (por ejemplo 2026_11_10)."); continue; }
            if (f.size > MAX_BYTES) { informe.push(f.name + ": pesa " + megas(f.size) + " y el máximo es 50 MB."); continue; }
            const ruta = academia + "/" + d.fecha + "_" + (d.hora ? d.hora.slice(0, 5).replace(":", "") : "0000") + "_" + Math.random().toString(36).slice(2, 8) + ".mp3";
            const t = txt.get(d.base.toLowerCase());
            const [duracion, texto] = await Promise.all([duracionDe(f), t ? t.text() : Promise.resolve(null)]);
            const up = await sb.storage.from(BUCKET).upload(ruta, f, { contentType: "audio/mpeg", upsert: false });
            if (up.error) { informe.push(f.name + ": no se pudo subir el archivo."); continue; }
            const { data: yo } = await sb.auth.getUser();
            const ins = await sb.from("audios_clase").insert({
                academia_id: academia, fecha: d.fecha, hora: d.hora, titulo: d.titulo, archivo: ruta,
                duracion_seg: duracion, bytes: f.size, transcripcion: texto && texto.trim() ? texto.slice(0, 300000) : null,
                puesto_por: yo && yo.user ? yo.user.id : null,
            });
            if (ins.error) {
                await sb.storage.from(BUCKET).remove([ruta]);
                informe.push(f.name + ": " + (ins.error.code === "23505" ? "ya hay un audio de esa clase." : "no se pudo guardar."));
                continue;
            }
            informe.push(f.name + ": listo (" + diaLargo(d.fecha) + (texto ? ", con transcripción" : "") + ").");
        }
        for (let i = 0; i < guias.length; i++) {
            estado.textContent = "Poniendo la guía " + (i + 1) + " de " + guias.length + ": " + guias[i].name + "…";
            informe.push(await ponerGuia(academia, guias[i]));
        }
        boton.disabled = false;
        document.getElementById("subir-archivos").value = "";
        estado.textContent = informe.join(" ");
        await cargarLista();
    }

    /* ---------- Las guías de estudio ---------- */
    /* Un .json por clase, con el mismo nombre que su MP3 (de ahí salen la fecha
       y la hora): las frases con su segundo, el resumen, los temas, las
       preguntas y las partidas. Se guardan en la clase que ya está subida. Las
       partidas se vuelven a comprobar con chess.js y llegan sin publicar. */
    async function ponerGuia(academia, f) {
        const d = datosDelNombre(f.name);
        if (!d) return f.name + ": el nombre no trae la fecha.";
        let obj;
        try { obj = JSON.parse(await f.text()); } catch (e) { return f.name + ": no es un archivo de guía válido."; }
        let q = sb.from("audios_clase").select("id, duracion_seg, indice").eq("academia_id", academia).eq("fecha", d.fecha);
        q = d.hora ? q.eq("hora", d.hora) : q.is("hora", null);
        const { data: filas, error } = await q.range(0, 1);
        if (error) return f.name + ": no se pudo buscar la clase.";
        if (!filas || !filas.length) return f.name + ": todavía no hay audio de esa clase; sube primero el MP3.";
        const id = filas[0].id;
        const whisper = AudiosGuia.deWhisper(obj);
        if (whisper) return ponerMinutos(f.name, filas[0], whisper);
        const g = AudiosGuia.leerGuia(obj);
        const cambios = { resumen: g.resumen, indice: g.indice.length ? g.indice : null };
        if (g.segmentos.length) {
            cambios.segmentos = g.segmentos;
            cambios.transcripcion = g.segmentos.map((s) => s[1]).join("\n").slice(0, 300000);
            cambios.minutos_aproximados = false;
        }
        const up = await sb.from("audios_clase").update(cambios).eq("id", id);
        if (up.error) return f.name + ": no se pudo guardar la guía.";
        const del = await Promise.all([
            sb.from("audios_clase_preguntas").delete().eq("audio_id", id),
            sb.from("audios_clase_partidas").delete().eq("audio_id", id),
        ]);
        if (del.some((r) => r.error)) return f.name + ": se guardó el texto, pero no se pudieron cambiar las preguntas ni las partidas.";
        const ins = await Promise.all([
            g.preguntas.length ? sb.from("audios_clase_preguntas").insert(g.preguntas.map((x) => Object.assign({ audio_id: id }, x))) : { error: null },
            g.partidas.length ? sb.from("audios_clase_partidas").insert(g.partidas.map((x) => Object.assign({ audio_id: id }, x))) : { error: null },
        ]);
        if (ins.some((r) => r.error)) return f.name + ": se guardó el texto, pero faltaron preguntas o partidas.";
        return f.name + ": guía lista (" + g.indice.length + " temas, " + g.preguntas.length + " preguntas, " + g.partidas.length + " partidas sin publicar).";
    }

    /* La transcripción de Whisper con sus minutos (el .json que deja
       «whisper --output_format json», con el mismo nombre que el MP3): cambia
       el texto y los minutos aproximados de la clase por los exactos, y vuelve
       a encontrar el minuto de cada tema por su cita (lo que se dijo ahí). Las
       partidas se mueven lo mismo que el tema más cercano. */
    async function ponerMinutos(nombre, clase, segmentos) {
        if (!segmentos.length) return nombre + ": la transcripción viene vacía.";
        const r = AudiosGuia.reanclar(clase.indice, segmentos, clase.duracion_seg);
        const up = await sb.from("audios_clase").update({
            segmentos, transcripcion: segmentos.map((x) => x[1]).join("\n").slice(0, 300000),
            indice: r.indice.length ? r.indice : null, minutos_aproximados: false,
        }).eq("id", clase.id);
        if (up.error) return nombre + ": no se pudieron guardar los minutos.";
        const { data: ps } = await sb.from("audios_clase_partidas").select("id, seg").eq("audio_id", clase.id).range(0, 49);
        for (const p of ps || []) {
            const nuevo = AudiosGuia.moverSeg(p.seg, r.movidas);
            if (nuevo !== p.seg) await sb.from("audios_clase_partidas").update({ seg: nuevo }).eq("id", p.id);
        }
        const total = (clase.indice || []).length;
        return nombre + ": minutos exactos puestos" + (total ? " (" + r.encontrados + " de " + total + " temas encontrados en su minuto)" : "") + ".";
    }

    /* ---------- Los conceptos de todas las clases ---------- */
    async function verConceptos() {
        document.getElementById("subir").classList.add("hidden");
        document.getElementById("lista-titulo").textContent = "Conceptos de todas las clases";
        document.getElementById("lista-titulo").className = "font-serif text-2xl font-bold text-brand-800 dark:text-white mb-2";
        document.title = "Conceptos de todas las clases · Audios de las clases";
        const lista = document.getElementById("lista");
        const volver = el("a", "inline-block mb-4 text-sm font-semibold text-brand-700 dark:text-accent-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "← Todas las clases");
        volver.href = "audios-clases.html";
        document.getElementById("lista-titulo").before(volver);
        const { data, error } = await sb.from("audios_clase").select("id, fecha, indice, minutos_aproximados")
            .order("fecha", { ascending: true }).range(0, 499);
        if (error) { avisar("No se pudieron leer las clases. Vuelve a intentarlo en un momento.", "error"); return; }
        const grupos = AudiosGuia.conceptos(data);
        if (!grupos.length) { avisar("Todavía ninguna clase tiene sus temas. Cuando tu profe suba las guías, aparecen acá."); return; }
        lista.before(el("p", "text-brand-600 dark:text-brand-300 mb-6",
            grupos.length + " conceptos, cada uno con las clases en que se vio, de la más vieja a la más reciente. Con el lector de pantalla, cada concepto es un encabezado (tecla H). Toca un tema para abrir esa clase en ese minuto."
            + (data.some((c) => c.minutos_aproximados) ? " Algunos minutos son aproximados." : "")));
        grupos.forEach((g) => {
            const sec = el("section", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
            const idH = "concepto-" + AudiosGuia.normal(g.concepto).replace(/[^a-z0-9]+/g, "-");
            const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white", g.concepto);
            h.id = idH;
            sec.setAttribute("aria-labelledby", idH);
            const n = new Set(g.temas.map((t) => t.audio)).size;
            sec.append(h, el("p", "text-sm text-brand-600 dark:text-brand-300 mt-1", n === 1 ? "En 1 clase." : "En " + n + " clases."));
            const ul = el("ul", "space-y-2 mt-3");
            g.temas.forEach((t) => {
                const li = el("li");
                const dia = diaLargo(t.fecha);
                const a = el("a", "text-brand-700 dark:text-accent-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
                    dia + ", " + AudiosGuia.reloj(t.seg) + ": " + t.titulo);
                a.href = "audios-clases.html?clase=" + encodeURIComponent(t.audio) + "&t=" + t.seg;
                a.setAttribute("aria-label", dia + ", " + AudiosGuia.relojDicho(t.seg) + ": " + t.titulo);
                li.append(a);
                ul.append(li);
            });
            sec.append(ul);
            lista.append(sec);
        });
    }

    /* ---------- Estudiar una clase ---------- */
    let anuncio = () => {};
    async function estudiar(id, desde) {
        document.getElementById("subir").classList.add("hidden");
        document.getElementById("lista-titulo").textContent = "La clase";
        const volver = el("a", "inline-block mb-4 text-sm font-semibold text-brand-700 dark:text-accent-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "← Todas las clases");
        volver.href = "audios-clases.html";
        document.getElementById("lista").before(volver);
        const lista = document.getElementById("lista");
        const { data: a, error } = await sb.from("audios_clase")
            .select("id, academia_id, fecha, hora, titulo, archivo, duracion_seg, bytes, con_transcripcion, resumen, indice, segmentos, minutos_aproximados")
            .eq("id", id).maybeSingle();
        if (error || !a) { avisar("No se encontró esa clase. Vuelve a la lista de clases.", "error"); return; }
        document.getElementById("aviso").className = "hidden";
        const [oir, bajar] = await Promise.all([
            sb.storage.from(BUCKET).createSignedUrls([a.archivo], 6 * 3600),
            sb.storage.from(BUCKET).createSignedUrls([a.archivo], 6 * 3600, { download: true }),
        ]);
        const url = (r) => { const x = r && r.data && r.data[0]; return x && !x.error ? x.signedUrl : null; };
        const art = tarjeta(a, url(oir), url(bajar), true, desde != null);
        lista.append(art);
        document.title = "Clase del " + diaLargo(a.fecha) + " · Audios de las clases";
        const audio = art.querySelector("audio");
        if (!audio) return;
        const ayuda = el("p", "text-sm text-brand-600 dark:text-brand-300 mt-3",
            "Atajos: Alt+Mayúscula+flecha izquierda o derecha salta 15 segundos (con Control, 1 minuto); Alt+Mayúscula+flecha abajo pausa o sigue; Alt+Mayúscula+T dice en qué minuto vas; Alt+Mayúscula+M marca el momento.");
        art.append(ayuda);
        const guia = el("div");
        lista.append(guia);
        /* Al publicar o quitar una partida se vuelve a armar la guía, y el foco
           va al título de las partidas: el botón tocado ya no existe. */
        const opciones = { puedeSubir, anunciar: anuncio, recargar: async () => {
            guia.textContent = "";
            await AudiosGuia.montar(guia, a, audio, opciones);
            const h = document.getElementById("partidas");
            if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
        } };
        await AudiosGuia.montar(guia, a, audio, opciones);
        /* Desde el índice de conceptos: la clase queda lista en ese minuto. */
        if (desde != null) {
            AudiosGuia.ir(audio, desde, false);
            const t = AudiosGuia.temaEn(a.indice, desde);
            const aviso = el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200 mt-2",
                "Listo para escuchar desde el " + AudiosGuia.relojDicho(desde) + (t ? ": " + t.titulo : "") + ". Dale play al audio.");
            aviso.setAttribute("role", "status");
            audio.after(aviso);
        }
    }

    async function init() {
        const { data } = await sb.auth.getSession();
        if (!data.session) { location.href = "login.html?next=audios-clases.html"; return; }
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
        const voz = document.getElementById("anuncio");
        /* Se vacía y se vuelve a escribir: el mismo texto dos veces seguidas
           («Atrás 15 segundos») el lector no lo repite si no cambia. */
        anuncio = (t) => { voz.textContent = ""; setTimeout(() => { voz.textContent = t; }, 50); };
        AudiosGuia.anunciarCon(anuncio);
        await prepararSubir();
        const id = new URLSearchParams(location.search).get("clase");
        const params = new URLSearchParams(location.search);
        const t = params.get("t");
        if (id && /^[0-9a-z-]{1,64}$/i.test(id)) { await estudiar(id, /^\d{1,5}$/.test(t || "") ? +t : null); return; }
        if (params.has("conceptos")) { await verConceptos(); return; }
        AudiosGuia.atajos({});
        const repaso = document.getElementById("repaso");
        const ir = el("p", "mb-6");
        const conc = el("a", "inline-block bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-4 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
            "Conceptos de todas las clases");
        conc.href = "audios-clases.html?conceptos";
        conc.setAttribute("aria-label", "Conceptos de todas las clases: cada concepto con las clases y el minuto en que se vio");
        ir.append(conc);
        repaso.append(ir);
        await AudiosGuia.repasoDeHoy(repaso);
        await cargarLista();
    }

    window.AudiosClases = { datosDelNombre, parrafos, duracionDicha, horaLarga };
    if (window.sb) init();
})();

/*! rev bfb5bbb0d2d82f9f */
