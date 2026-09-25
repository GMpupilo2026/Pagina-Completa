/* El código de reportes.html.

   Vivía escrito dentro de la página, en un <script> de 26 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        /* ===== Reportes de actividades =====
           Los datos salen de public.reporte_actividades(); los archivos se leen
           acá y no se suben a ninguna parte. El contenido se arma una sola vez
           con ReporteArmar y de ahí salen la vista previa, el Word y el PDF. */
        let perfil = null;
        let datos = null;                                   // lo que trajo la base
        const archivos = { fotos: [], hojas: [], grabaciones: [], documentos: [], marca: null };
        const modo = () => document.querySelector('input[name="modo"]:checked').value;

        const $ = (id) => document.getElementById(id);
        const decir = (elemento, texto, malo) => {
            elemento.textContent = texto;
            elemento.className = "text-sm " + (malo
                ? "text-red-600 dark:text-red-400"
                : "text-brand-500 dark:text-brand-300");
        };

        /* ---------- la marca de agua, sacada del logo del sitio ---------- */
        /* La prepara js/marca-agua.js, que comparte con el PDF del diagnóstico
           de un visitante: escrita dos veces se separaría. */
        async function prepararMarca() {
            archivos.marca = await MarcaAgua.preparar();
        }

        /* ---------------------- los archivos que suben ---------------------- */

        /* Toda imagen pasa por un canvas y sale en JPEG: así el PDF y el Word
           reciben siempre lo mismo y no hay que saber decodificar PNG, WebP ni
           lo que traiga el teléfono. De paso se achica: una foto de 12 MP en un
           informe no aporta nada y lo vuelve imposible de mandar por correo. */
        async function prepararFoto(archivo) {
            const url = URL.createObjectURL(archivo);
            try {
                const img = new Image();
                img.src = url;
                await img.decode();
                const MAX = 1400;
                const escala = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
                const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
                const alto = Math.max(1, Math.round(img.naturalHeight * escala));
                const lienzo = document.createElement("canvas");
                lienzo.width = ancho;
                lienzo.height = alto;
                const ctx = lienzo.getContext("2d");
                ctx.fillStyle = "#fff";
                ctx.fillRect(0, 0, ancho, alto);    // un PNG transparente en JPEG sale negro
                ctx.drawImage(img, 0, 0, ancho, alto);
                const blob = await new Promise((r) => lienzo.toBlob(r, "image/jpeg", 0.82));
                return {
                    nombre: archivo.name, tamano: archivo.size, ancho: ancho, alto: alto,
                    jpeg: new Uint8Array(await blob.arrayBuffer()),
                    vista: lienzo.toDataURL("image/jpeg", 0.5),
                };
            } finally { URL.revokeObjectURL(url); }
        }

        /* De una grabación se saca su duración sin reproducirla entera. */
        function duracionDe(archivo) {
            return new Promise((resolver) => {
                const medio = document.createElement(archivo.type.startsWith("video") ? "video" : "audio");
                const url = URL.createObjectURL(archivo);
                const listo = () => {
                    const s = medio.duration;
                    URL.revokeObjectURL(url);
                    if (!isFinite(s)) return resolver("—");
                    const m = Math.floor(s / 60), r = Math.round(s % 60);
                    resolver(m + " min " + String(r).padStart(2, "0") + " s");
                };
                medio.onloadedmetadata = listo;
                medio.onerror = () => { URL.revokeObjectURL(url); resolver("—"); };
                medio.preload = "metadata";
                medio.src = url;
            });
        }

        async function recibir(lista) {
            const estado = $("archivos-estado");
            for (const archivo of lista) {
                try {
                    const nombre = archivo.name.toLowerCase();
                    if (archivo.type.startsWith("image/")) {
                        decir(estado, "Preparando " + archivo.name + "…");
                        archivos.fotos.push(await prepararFoto(archivo));
                    } else if (nombre.endsWith(".xlsx") || nombre.endsWith(".csv")) {
                        decir(estado, "Leyendo " + archivo.name + "…");
                        const hoja = await ReporteExcel.leer(archivo);
                        hoja.tamano = archivo.size;
                        archivos.hojas.push(hoja);
                    } else if (archivo.type.startsWith("video/") || archivo.type.startsWith("audio/")) {
                        decir(estado, "Mirando " + archivo.name + "…");
                        archivos.grabaciones.push({
                            nombre: archivo.name, tamano: archivo.size,
                            clase: archivo.type.startsWith("video") ? "Video de clase" : "Audio de clase",
                            duracion: await duracionDe(archivo),
                            archivo: archivo, transcripcion: "",
                        });
                    } else if (/\.(txt|md|docx|doc)$/.test(nombre)) {
                        decir(estado, "Leyendo " + archivo.name + "…");
                        archivos.documentos.push(await ReporteTextos.leer(archivo));
                    } else {
                        decir(estado, "«" + archivo.name + "» no es un tipo que este informe sepa usar.", true);
                        continue;
                    }
                } catch (e) {
                    decir(estado, "No se pudo leer «" + archivo.name + "»: " + (e.message || e), true);
                    continue;
                }
            }
            if (!estado.textContent.startsWith("No se pudo") && !estado.textContent.includes("no es un tipo")) {
                decir(estado, "");
            }
            pintarArchivos();
            refrescar();
        }

        function pintarArchivos() {
            const ul = $("lista-archivos");
            ul.innerHTML = "";
            const poner = (icono, nombre, detalle, quitar, vista) => {
                const li = document.createElement("li");
                li.className = "flex items-center gap-3 bg-brand-50 dark:bg-brand-800 rounded-lg px-3 py-2";
                li.innerHTML =
                    (vista ? '<img src="' + vista + '" alt="" class="w-10 h-10 rounded object-cover shrink-0">'
                           : '<span class="text-xl shrink-0" aria-hidden="true">' + icono + "</span>") +
                    '<span class="min-w-0 flex-1"><span class="block text-sm text-brand-800 dark:text-white truncate"></span>' +
                    '<span class="block text-xs text-brand-450 dark:text-brand-350"></span></span>';
                li.querySelectorAll("span.block")[0].textContent = nombre;
                li.querySelectorAll("span.block")[1].textContent = detalle;
                const boton = document.createElement("button");
                boton.type = "button";
                boton.className = "text-brand-450 hover:text-red-600 text-lg px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
                boton.textContent = "✕";
                boton.setAttribute("aria-label", "Quitar " + nombre);
                boton.addEventListener("click", () => { quitar(); pintarArchivos(); refrescar(); });
                li.appendChild(boton);
                ul.appendChild(li);
                return li;
            };
            archivos.fotos.forEach((f, i) => {
                const li = poner("🖼️", f.nombre, ReporteArmar._tamanoLegible(f.tamano),
                    () => archivos.fotos.splice(i, 1), f.vista);
                // El pie de foto no es un adorno: es lo ÚNICO que va a oír quien
                // use lector de pantalla, porque la versión adaptada no lleva
                // imágenes. Por eso se pide acá y no en un rincón.
                const caja = document.createElement("div");
                caja.className = "mt-2";
                const id = "pie-foto-" + i;
                caja.innerHTML =
                    '<label class="block text-xs text-brand-450 dark:text-brand-350 mb-1" for="' + id + '">' +
                    "Qué se ve en la foto (va de pie, y es lo que oye quien no la puede ver)</label>";
                const campo = document.createElement("input");
                campo.type = "text";
                campo.id = id;
                campo.value = f.pie || "";
                campo.placeholder = "Los niños del grupo de 7° B en la clase del 14";
                campo.className = "w-full bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-sm text-brand-800 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                campo.addEventListener("input", () => { f.pie = campo.value; refrescar(); });
                caja.appendChild(campo);
                li.parentElement.insertBefore(caja, li.nextSibling);
            });
            archivos.hojas.forEach((h, i) => poner("📊", h.hoja, (h.filas.length - 1) + " filas",
                () => archivos.hojas.splice(i, 1)));
            archivos.documentos.forEach((d, i) => poner("📝", d.nombre,
                d.palabras + " palabras · " + (d.conFechas
                    ? d.conFechas + (d.conFechas === 1 ? " clase reconocida por su fecha" : " clases reconocidas por su fecha")
                    : "sin fechas reconocibles, va como nota suelta"),
                () => archivos.documentos.splice(i, 1)));
            archivos.grabaciones.forEach((g, i) => {
                const li = poner(g.clase.startsWith("Video") ? "🎬" : "🎙️", g.nombre,
                    g.duracion + " · " + ReporteArmar._tamanoLegible(g.tamano),
                    () => archivos.grabaciones.splice(i, 1));
                li.parentElement.insertBefore(cajaDeTranscripcion(g), li.nextSibling);
            });
        }

        /* ---------------------- transcribir una grabación ----------------------
           El audio NO se sube a ningún lado: se decodifica y se transcribe en
           esta misma computadora (ver js/reporte-transcribir.js). Por eso la
           primera vez baja el modelo, y por eso tarda: es el precio de que las
           voces de los niños no salgan de acá. */
        function cajaDeTranscripcion(grabacion) {
            const caja = document.createElement("div");
            caja.className = "mt-2 mb-1";

            const fila = document.createElement("div");
            fila.className = "flex items-center gap-3 flex-wrap";
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "border border-brand-200 dark:border-brand-700 hover:border-accent-400 text-brand-600 dark:text-brand-300 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            boton.textContent = grabacion.transcripcion ? "Transcribir otra vez" : "📝 Transcribir";
            const aviso = document.createElement("p");
            aviso.className = "text-xs text-brand-450 dark:text-brand-350";
            aviso.setAttribute("role", "status");
            aviso.setAttribute("aria-live", "polite");
            aviso.textContent = grabacion.transcripcion
                ? "Transcrita: " + grabacion.transcripcion.split(/\s+/).length + " palabras."
                : "Se transcribe en esta computadora; el audio no se sube a ningún lado.";
            fila.appendChild(boton);
            fila.appendChild(aviso);
            caja.appendChild(fila);

            const barra = document.createElement("div");
            barra.className = "h-1.5 bg-brand-100 dark:bg-brand-800 rounded-full mt-2 overflow-hidden";
            barra.hidden = true;
            const relleno = document.createElement("div");
            relleno.className = "h-full bg-accent-500 rounded-full transition-all";
            relleno.style.width = "0%";
            barra.appendChild(relleno);
            caja.appendChild(barra);

            boton.addEventListener("click", async () => {
                if (!ReporteTranscribir.hayCómo()) {
                    aviso.textContent = "Este navegador no puede transcribir. Prueba con Chrome o Edge en una computadora.";
                    return;
                }
                boton.disabled = true;
                barra.hidden = false;
                try {
                    grabacion.transcripcion = await ReporteTranscribir.transcribir(
                        grabacion.archivo,
                        (a) => {
                            aviso.textContent = a.detalle || "Trabajando…";
                            // Mientras transcribe no hay porcentaje de verdad, así
                            // que la barra se llena de a poco: es para que se note
                            // que sigue viva, no para prometer cuánto falta.
                            if (a.etapa === "transcribiendo" && !a.porcentaje) {
                                const actual = parseFloat(relleno.style.width) || 0;
                                relleno.style.width = Math.min(95, actual + 1.5) + "%";
                            } else {
                                relleno.style.width = (a.porcentaje || 0) + "%";
                            }
                        });
                    relleno.style.width = "100%";
                    aviso.textContent = grabacion.transcripcion
                        ? "Listo: " + grabacion.transcripcion.split(/\s+/).length + " palabras. Ya está en el informe."
                        : "La grabación no trae voz reconocible.";
                    boton.textContent = "Transcribir otra vez";
                    refrescar();
                } catch (e) {
                    aviso.textContent = e.message || String(e);
                    aviso.className = "text-xs text-red-600 dark:text-red-400";
                    barra.hidden = true;
                }
                boton.disabled = false;
            });

            return caja;
        }

        /* ------------------------- la vista previa ------------------------- */
        /* Pinta el MISMO documento que se va a descargar, para que nadie baje un
           archivo a ciegas. */
        function pintarVista(documento) {
            const caja = $("vista");
            caja.innerHTML = "";
            const poner = (etiqueta, texto, clase) => {
                const n = document.createElement(etiqueta);
                n.className = clase;
                n.textContent = texto;
                caja.appendChild(n);
                return n;
            };
            poner("h3", documento.titulo, "font-serif text-2xl font-bold text-brand-800 dark:text-white");
            poner("p", documento.subtitulo, "text-sm text-brand-500 dark:text-brand-300 mb-4");
            for (const b of documento.bloques) {
                if (b.tipo === "titulo") poner("h4", b.texto, "font-serif text-lg font-bold text-brand-800 dark:text-white mt-5 mb-2");
                else if (b.tipo === "subtitulo") poner("h5", b.texto, "font-semibold text-brand-700 dark:text-brand-100 mt-3 mb-1");
                else if (b.tipo === "parrafo") poner("p", b.texto, "text-sm text-brand-600 dark:text-brand-300 mb-2");
                else if (b.tipo === "nota") poner("p", b.texto, "text-xs text-brand-450 dark:text-brand-350 mb-2");
                else if (b.tipo === "lista") {
                    const ul = poner("ul", "", "list-disc pl-5 text-sm text-brand-600 dark:text-brand-300 mb-2");
                    for (const item of b.items) {
                        const li = document.createElement("li");
                        li.textContent = item;
                        ul.appendChild(li);
                    }
                } else if (b.tipo === "tabla") {
                    const tabla = document.createElement("table");
                    tabla.className = "w-full text-xs mb-3 border border-brand-100 dark:border-brand-800";
                    const thead = document.createElement("thead");
                    const tr = document.createElement("tr");
                    for (const h of b.encabezados) {
                        const th = document.createElement("th");
                        th.className = "text-left px-2 py-1 bg-brand-50 dark:bg-brand-800 text-brand-700 dark:text-brand-100";
                        th.textContent = h;
                        tr.appendChild(th);
                    }
                    thead.appendChild(tr);
                    tabla.appendChild(thead);
                    const tbody = document.createElement("tbody");
                    for (const fila of b.filas) {
                        const f = document.createElement("tr");
                        for (const celda of fila) {
                            const td = document.createElement("td");
                            td.className = "px-2 py-1 border-t border-brand-100 dark:border-brand-800 text-brand-600 dark:text-brand-300";
                            td.textContent = celda;
                            f.appendChild(td);
                        }
                        tbody.appendChild(f);
                    }
                    tabla.appendChild(tbody);
                    caja.appendChild(tabla);
                } else if (b.tipo === "foto" && b.foto.vista) {
                    const img = document.createElement("img");
                    img.src = b.foto.vista;
                    img.alt = b.pie || "Fotografía de la clase";
                    img.className = "rounded-lg max-w-[260px] mb-1";
                    caja.appendChild(img);
                    if (b.pie) poner("p", b.pie, "text-xs text-brand-450 dark:text-brand-350 mb-3");
                } else if (b.tipo === "separador") {
                    caja.appendChild(document.createElement("hr")).className = "my-3 border-brand-100 dark:border-brand-800";
                }
            }
        }

        function documentoActual() {
            const comun = {
                autor: perfil && perfil.full_name ? perfil.full_name : "Oscar Angulo Cubero",
                introduccion: $("intro").value,
            };
            if (modo() === "externo") {
                // Sin base de datos: la asistencia se recopila de las hojas y el
                // contenido sale de los documentos.
                if (!archivos.hojas.length && !archivos.documentos.length) return null;
                const asistencia = ReporteAsistencia.recopilar(archivos.hojas);
                return ReporteArmar.armarExterno(asistencia, archivos.documentos, archivos,
                    Object.assign({ academia: "Ajedrez Integral", titulo: $("titulo").value }, comun));
            }
            if (!datos) return null;
            return ReporteArmar.armar(datos, archivos,
                Object.assign({ academia: "Academia Ajedrez Integral" }, comun));
        }

        /* La página cambia de cara según el modo: en el de clases externas no hay
           periodo que pedirle a la base —las fechas salen de las hojas— y lo
           que se sube deja de ser "adjuntos" para ser la fuente del informe. */
        function pintarModo() {
            const externo = modo() === "externo";
            $("paso-periodo").hidden = externo;
            $("campo-titulo").hidden = !externo;
            $("titulo-archivos").textContent = externo
                ? "1. Los archivos de tus clases"
                : "2. Lo que quieras adjuntar";
            $("texto-archivos").innerHTML = externo
                ? "Sube el Excel con la asistencia y los documentos con lo que trabajaste en cada clase. " +
                  "De ahí sale todo el informe: el sitio no consulta nada. " +
                  "<strong class=\"text-brand-600 dark:text-brand-200\">Nada se sube a ningún servidor</strong>: " +
                  "se lee acá, en tu computadora."
                : "Fotos de la clase, hojas de Excel, grabaciones de video o audio. " +
                  "<strong class=\"text-brand-600 dark:text-brand-200\">Nada de esto se sube a ningún servidor</strong>: " +
                  "se lee acá, en tu computadora, para armar el informe.";
            $("zona-tipos").textContent = externo
                ? "Asistencia (XLSX, CSV), contenido (DOCX, TXT, MD), fotos, video y audio"
                : "Fotos (JPG, PNG), hojas (XLSX, CSV), video y audio";
            // El paso del informe se renumera solo, para que no queden dos "2.".
            const paso3 = document.querySelector("#app section:last-of-type h2");
            if (paso3) paso3.textContent = externo ? "2. El informe" : "3. El informe";
            refrescar();
        }

        function refrescar() {
            const documento = documentoActual();
            $("bajar-docx").disabled = !documento;
            $("bajar-pdf").disabled = !documento;
            $("bajar-accesible").disabled = !documento;
            if (documento) pintarVista(documento);
            else if (modo() === "externo") {
                $("vista").innerHTML = "";
                const p = document.createElement("p");
                p.className = "text-brand-450 dark:text-brand-350 text-sm";
                p.textContent = "Sube el Excel con la asistencia —y, si tienes, los documentos con el " +
                    "contenido de las clases— y acá va a aparecer el informe.";
                $("vista").appendChild(p);
            }
        }

        /* --------------------------- traer y bajar --------------------------- */

        async function traer() {
            const estado = $("traer-estado");
            const desde = $("desde").value, hasta = $("hasta").value;
            if (!desde || !hasta) return decir(estado, "Falta decir desde y hasta cuándo.", true);
            if (desde > hasta) return decir(estado, "La fecha de inicio va antes que la de fin.", true);
            decir(estado, "Buscando…");
            const { data, error } = await sb.rpc("reporte_actividades", { p_desde: desde, p_hasta: hasta });
            if (error) return decir(estado, "No se pudieron traer los datos: " + error.message, true);
            datos = data;
            const t = (data && data.totales) || {};
            /* Cuántas son presenciales se dice acá arriba y no solo dentro del
               informe: es lo primero que se mira para saber si la ficha de
               asistencia de la semana pasada llegó de verdad. Sin ese número,
               una ficha que no se guardó se ve igual que una que sí. */
            const presenciales = t.clases_presenciales || 0;
            decir(estado, t.clases
                ? "Listo: " + t.clases + (t.clases === 1 ? " clase" : " clases") +
                  (presenciales ? " (" + presenciales + " presencial" + (presenciales === 1 ? "" : "es") + ")" : "") +
                  " y " + (t.asistencias || 0) + " asistencias."
                : "No hay clases registradas en ese periodo.");
            refrescar();
        }

        function bajar(blob, nombre) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = nombre;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }

        const nombreArchivo = (ext, apellido) =>
            "informe-actividades-" + ($("desde").value || "") + "-a-" + ($("hasta").value || "") +
            (apellido ? "-" + apellido : "") + "." + ext;

        async function descargar(cual) {
            const estado = $("bajar-estado");
            const documento = documentoActual();
            if (!documento) return;
            try {
                decir(estado, "Armando el archivo…");
                const blob = cual === "docx" ? ReporteDOCX.generar(documento)
                    : cual === "html" ? ReporteAccesible.generar(documento)
                    : await ReportePDF.generar(documento);
                const nombres = { docx: "Word", pdf: "PDF", html: "formato adaptado" };
                bajar(blob, cual === "html" ? nombreArchivo("html", "adaptado") : nombreArchivo(cual));
                decir(estado, "Listo, se descargó el " + nombres[cual] + ".");
            } catch (e) {
                decir(estado, "No se pudo armar el archivo: " + (e.message || e), true);
            }
        }

        /* ------------------------------- arranque ------------------------------- */

        function mesActual() {
            const hoy = new Date();
            const p = (n) => String(n).padStart(2, "0");
            const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            const fmt = (d) => d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
            return { desde: fmt(primero), hasta: fmt(hoy) };
        }

        async function init() {
            const { data } = await sb.auth.getSession();
            const sesion = data.session;
            if (!sesion) { window.location.href = "login.html?next=reportes.html"; return; }
            const { data: fila, error } = await sb.from("profiles").select("*").eq("id", sesion.user.id).single();
            $("loading").classList.add("hidden");
            if (error || !fila || !(fila.is_admin || fila.es_coordinador || fila.es_supervisor)) {
                $("denegado").classList.remove("hidden");
                return;
            }
            perfil = fila;
            $("app").classList.remove("hidden");

            const mes = mesActual();
            $("desde").value = mes.desde;
            $("hasta").value = mes.hasta;

            try { await prepararMarca(); } catch (e) { /* sin marca, el informe sale igual */ }

            $("traer").addEventListener("click", traer);
            $("intro").addEventListener("input", refrescar);
            $("titulo").addEventListener("input", refrescar);
            for (const radio of document.querySelectorAll('input[name="modo"]')) {
                radio.addEventListener("change", pintarModo);
            }
            $("archivos").addEventListener("change", (e) => { recibir([...e.target.files]); e.target.value = ""; });
            $("bajar-docx").addEventListener("click", () => descargar("docx"));
            $("bajar-pdf").addEventListener("click", () => descargar("pdf"));
            $("bajar-accesible").addEventListener("click", () => descargar("html"));

            const zona = $("zona");
            ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => {
                e.preventDefault();
                zona.classList.add("border-accent-400");
            }));
            ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => {
                e.preventDefault();
                zona.classList.remove("border-accent-400");
            }));
            zona.addEventListener("drop", (e) => {
                if (e.dataTransfer && e.dataTransfer.files.length) recibir([...e.dataTransfer.files]);
            });

            pintarModo();
            traer();
        }

        init();
    