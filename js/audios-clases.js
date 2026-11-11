/* El código de audios-clases.html: «Audios de las clases».

   El audio de cada clase que ya se dio, para volver a escucharla. Lo pidió el
   dueño para el grupo de ADAES, que es de alumnos ciegos: por eso cada clase es
   un encabezado (con el lector de pantalla se pasa de una a otra con la H), el
   reproductor es el del navegador (se maneja con el teclado y el lector lo
   conoce), la velocidad se elige en una lista, el audio sigue donde quedó la
   vez anterior y lo que se dijo está escrito al lado, para leerlo o buscarlo.

   Quién ve qué lo decide la base (public.audios_clase y el bucket audios-clase,
   migración 20261111183000): la gente de la academia y quien administra. Quien
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

    function tarjeta(a, urlOir, urlBajar) {
        const art = el("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
        const idTitulo = "clase-" + a.id;
        art.setAttribute("aria-labelledby", idTitulo);
        const dia = diaLargo(a.fecha);
        const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white", dia);
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
        recordarPosicion(audio, a.id, art);

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
        if (puedeSubir) fila.append(botonQuitar(a, dia));
        art.append(fila);

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
        if (!mp3.length) { estado.textContent = "Elige al menos un archivo MP3."; return; }
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
        boton.disabled = false;
        document.getElementById("subir-archivos").value = "";
        estado.textContent = informe.join(" ");
        await cargarLista();
    }

    async function init() {
        const { data } = await sb.auth.getSession();
        if (!data.session) { location.href = "login.html?next=audios-clases.html"; return; }
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
        await prepararSubir();
        await cargarLista();
    }

    window.AudiosClases = { datosDelNombre, parrafos, duracionDicha, horaLarga };
    if (window.sb) init();
})();

/*! rev bfb5bbb0d2d82f9f */
