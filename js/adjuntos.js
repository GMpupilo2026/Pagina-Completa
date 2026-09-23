/* Archivos adjuntos de un formulario: la foto de la cédula, el carné del
 * colegio, un comprobante en PDF.
 *
 * Lo usan las DOS puertas que los reciben —formulario.html (los formularios que
 * arma la coordinación) e inscripcion.html (el torneo en línea)— y las DOS
 * pantallas que los enseñan —formularios.html e inscripciones.html—. Escrito
 * cuatro veces, cada una aceptaría otros formatos y nombraría distinto el
 * archivo: la familia subiría un .docx que una pantalla no sabe enseñar.
 *
 * Lo que acá se comprueba es CORTESÍA (decir antes de subir que un formato no
 * sirve). Quien de verdad decide es el bucket —sus tipos y su tope— y la base,
 * que vuelve a mirar cada ruta antes de guardar la respuesta.
 *
 * La ruta de cada archivo es  <carpeta>/<id al azar>/<nombre-saneado>.<ext>
 * — el nombre original viaja DENTRO de la ruta, así que no hace falta guardarlo
 * aparte y quien descarga recibe «cedula-frente.pdf» y no un uuid. */
(function () {
    "use strict";

    const TIPOS = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const IMAGENES = new Set(["jpg", "png", "webp"]);
    const MAX_BYTES = 10 * 1024 * 1024;   // el tope del bucket
    const LADO_MAX = 1600;
    const MAX_POR_PREGUNTA = 5;

    const extDe = (nombre) => {
        const m = /\.([a-z0-9]{2,5})$/i.exec(String(nombre || ""));
        const e = m ? m[1].toLowerCase() : "";
        return e === "jpeg" ? "jpg" : e;
    };

    /* Un nombre de archivo lo escribe una persona: sin tildes, sin espacios ni
       nada que Storage o un sistema de archivos lea raro. Si no queda nada, se
       llama "archivo". */
    function nombreSeguro(nombre) {
        const base = String(nombre || "").replace(/\.[^.]*$/, "")
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
            .slice(0, 60);
        return base || "archivo";
    }

    function aceptar(soloImagen) {
        return soloImagen ? "image/*" : "image/*,.pdf,.doc,.docx,.xls,.xlsx";
    }
    function textoFormatos(soloImagen) {
        return soloImagen
            ? "Hasta " + MAX_POR_PREGUNTA + " imágenes (JPG, PNG o una foto del celular)."
            : "Hasta " + MAX_POR_PREGUNTA + " archivos: foto, PDF, Word o Excel, de 10 MB como máximo cada uno.";
    }

    const esImagenArchivo = (a) => /^image\//.test(a.type) || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(a.name);

    /* La foto del celular pesa 4-8 MB: se achica a 1600 px en JPEG. De paso
       queda en un formato que abre cualquiera (un HEIC del iPhone, si el
       navegador lo sabe leer, sale como JPG). Un documento va tal cual. */
    async function preparar(archivo, soloImagen) {
        const nombre = nombreSeguro(archivo.name);
        if (esImagenArchivo(archivo)) {
            try {
                const bmp = await createImageBitmap(archivo);
                const k = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
                const lienzo = document.createElement("canvas");
                lienzo.width = Math.max(1, Math.round(bmp.width * k));
                lienzo.height = Math.max(1, Math.round(bmp.height * k));
                const ctx = lienzo.getContext("2d");
                ctx.fillStyle = "#fff";
                ctx.fillRect(0, 0, lienzo.width, lienzo.height);
                ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
                const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
                if (blob) return { blob, nombre: nombre + ".jpg", tipo: "image/jpeg" };
            } catch (e) { /* cae abajo: se sube tal cual si el formato sirve */ }
        }
        const ext = extDe(archivo.name);
        const permitido = soloImagen ? IMAGENES.has(ext) : !!TIPOS[ext];
        if (!permitido) {
            throw new Error("«" + archivo.name + "» no es un formato que se pueda recibir. "
                + (soloImagen ? "Prueba con una foto JPG o PNG." : "Súbelo como foto, PDF, Word o Excel."));
        }
        if (archivo.size > MAX_BYTES) {
            throw new Error("«" + archivo.name + "» pesa más de 10 MB. Prueba con uno más liviano.");
        }
        return { blob: archivo, nombre: nombre + "." + ext, tipo: TIPOS[ext] };
    }

    function idAleatorio() {
        return crypto.randomUUID ? crypto.randomUUID()
            : (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
    }

    /* Sube a <carpeta>/<id>/<nombre> y devuelve la ruta. `storage` es
       sb.storage.from(bucket): cada página trae su propio cliente. */
    async function subir(storage, carpeta, archivo, soloImagen) {
        const p = await preparar(archivo, soloImagen);
        const ruta = carpeta + "/" + idAleatorio() + "/" + p.nombre;
        const { error } = await storage.upload(ruta, p.blob, { contentType: p.tipo, upsert: false });
        if (error) throw new Error("No se pudo subir «" + archivo.name + "»: " + (error.message || error));
        return ruta;
    }

    /* El selector con su lista de elegidos. Devuelve { elegidos(), limpiar(),
       subirTodo(storage, carpeta, avisar) }. Se suben al ENVIAR y no al
       elegirlos —un archivo descartado no queda subido por nada— y la ruta se
       recuerda, así reintentar un envío que falló no lo vuelve a subir. */
    function montarSelector(input, lista, estado, opciones) {
        const soloImagen = !!(opciones && opciones.soloImagen);
        const alError = (opciones && opciones.alError) || (() => {});
        const elegidos = [];

        function pintar() {
            lista.innerHTML = "";
            elegidos.forEach((x, j) => {
                const li = document.createElement("li");
                li.className = "relative";
                if (x.url) {
                    const img = document.createElement("img");
                    img.src = x.url;
                    img.alt = "Archivo " + (j + 1) + ": " + x.archivo.name;
                    img.className = "w-24 h-24 object-cover rounded-lg border border-brand-200 dark:border-brand-700";
                    li.appendChild(img);
                } else {
                    const ficha = document.createElement("span");
                    ficha.className = "flex items-center gap-1.5 max-w-[14rem] h-24 px-3 rounded-lg border border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-950 text-xs text-brand-700 dark:text-brand-200 break-all";
                    ficha.textContent = "📄 " + x.archivo.name;
                    li.appendChild(ficha);
                }
                const quitar = document.createElement("button");
                quitar.type = "button";
                quitar.textContent = "✕";
                quitar.setAttribute("aria-label", "Quitar el archivo " + (j + 1) + " (" + x.archivo.name + ")");
                quitar.className = "absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-600 text-white text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                quitar.addEventListener("click", () => {
                    if (x.url) URL.revokeObjectURL(x.url);
                    elegidos.splice(j, 1);
                    pintar();
                    input.focus();
                });
                li.appendChild(quitar);
                lista.appendChild(li);
            });
            const n = elegidos.length;
            estado.textContent = n ? (n === 1 ? "1 archivo elegido." : n + " archivos elegidos.") : "";
        }

        input.addEventListener("change", () => {
            const nuevos = [...input.files];
            const caben = MAX_POR_PREGUNTA - elegidos.length;
            nuevos.slice(0, Math.max(0, caben)).forEach((archivo) => {
                const muestra = esImagenArchivo(archivo) ? URL.createObjectURL(archivo) : null;
                elegidos.push({ archivo, url: muestra, ruta: null });
            });
            input.value = "";   // así se puede volver a elegir el mismo archivo
            pintar();
            if (nuevos.length > caben) alError("Caben " + MAX_POR_PREGUNTA + " archivos como máximo.");
        });

        return {
            cantidad: () => elegidos.length,
            limpiar() { elegidos.forEach((x) => x.url && URL.revokeObjectURL(x.url)); elegidos.length = 0; pintar(); },
            async subirTodo(storage, carpeta, avisar) {
                for (const x of elegidos) {
                    if (x.ruta) continue;
                    if (avisar) avisar("Subiendo «" + x.archivo.name + "»…");
                    x.ruta = await subir(storage, carpeta, x.archivo, soloImagen);
                }
                return elegidos.map((x) => x.ruta);
            },
        };
    }

    /* ------------------------------------------------------------- mostrar
       `bajar(ruta)` devuelve una promesa de Blob; cada pantalla sabe de dónde
       (Storage con la sesión, o una URL firmada que da una Edge Function). Se
       enseña como blob:, que es lo que la CSP deja pintar: una URL de Supabase
       en un <img> la bloquearía img-src. */
    const cacheBlobs = new Map();
    function urlDe(ruta, bajar) {
        if (!cacheBlobs.has(ruta)) {
            cacheBlobs.set(ruta, Promise.resolve().then(() => bajar(ruta)).then((blob) => {
                if (!blob) throw new Error("vacío");
                return URL.createObjectURL(blob);
            }).catch((e) => { cacheBlobs.delete(ruta); throw e; }));
        }
        return cacheBlobs.get(ruta);
    }
    function soltar() {
        cacheBlobs.forEach((p) => p.then((u) => URL.revokeObjectURL(u)).catch(() => {}));
        cacheBlobs.clear();
    }

    const nombreDeRuta = (ruta) => String(ruta).split("/").pop();
    const esImagenRuta = (ruta) => IMAGENES.has(extDe(ruta));

    /* Una celda con los adjuntos de una respuesta. `quien` va delante del nombre
       del archivo que se descarga: veinte «cedula.jpg» en la carpeta de
       descargas no los distingue nadie. */
    function celda(rutas, bajar, quien, etiqueta) {
        const caja = document.createElement("div");
        const lista = (Array.isArray(rutas) ? rutas : []).filter((x) => typeof x === "string");
        if (!lista.length) return caja;
        caja.className = "flex flex-wrap gap-2 min-w-[7rem]";
        const prefijo = nombreSeguro([quien, etiqueta].filter(Boolean).join(" "));
        lista.forEach((ruta, j) => {
            const original = nombreDeRuta(ruta);
            const fig = document.createElement("figure");
            fig.className = "flex flex-col items-center gap-1 max-w-[9rem]";
            const ver = document.createElement("a");
            ver.target = "_blank"; ver.rel = "noopener";
            ver.setAttribute("aria-label", "Abrir " + (etiqueta ? etiqueta + ", " : "") + "archivo " + (j + 1) + ": " + original);
            if (esImagenRuta(ruta)) {
                ver.className = "block w-16 h-16 rounded-lg overflow-hidden border border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                const img = document.createElement("img");
                img.alt = "";
                img.className = "w-full h-full object-cover";
                ver.appendChild(img);
            } else {
                ver.className = "block text-xs text-brand-700 dark:text-brand-200 break-all underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
                ver.textContent = "📄 " + original;
            }
            const bajarA = document.createElement("a");
            bajarA.textContent = "⬇ Descargar";
            bajarA.download = (prefijo && prefijo !== "archivo" ? prefijo + "-" : "") + original;
            bajarA.setAttribute("aria-label", "Descargar " + original);
            bajarA.className = "text-xs text-brand-600 dark:text-brand-300 underline whitespace-nowrap hover:text-accent-700 dark:hover:text-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
            fig.append(ver, bajarA);
            caja.appendChild(fig);
            urlDe(ruta, bajar).then((u) => {
                const img = ver.querySelector("img");
                if (img) img.src = u;
                ver.href = u; bajarA.href = u;
            }).catch(() => {
                // Se dice, no se deja un cuadro vacío: uno que no se pudo leer
                // y uno que no existe se ven igual y son cosas distintas.
                const aviso = document.createElement("span");
                aviso.className = "text-xs text-red-600 dark:text-red-400";
                aviso.textContent = "No se pudo abrir «" + original + "»";
                ver.replaceWith(aviso);
                bajarA.remove();
            });
        });
        return caja;
    }

    function contar(rutas) {
        const n = Array.isArray(rutas) ? rutas.length : 0;
        return n ? (n === 1 ? "1 archivo adjunto" : n + " archivos adjuntos") : "";
    }

    window.Adjuntos = {
        MAX_POR_PREGUNTA, aceptar, textoFormatos, preparar, nombreSeguro,
        montarSelector, celda, soltar, contar, esImagenRuta, nombreDeRuta,
    };
})();
