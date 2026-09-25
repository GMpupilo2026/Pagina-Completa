/* El código de tienda.html.

   Vivía escrito dentro de la página, en un <script> de 19 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        /* La tienda de materiales. Todo lo que se pinta sale de
           js/tienda-catalogo.js: acá no hay ni un producto, ni un precio, ni
           un número de módulo escrito a mano.

           El candado es `is_admin` a secas, no `soy_coordinador()`: esto no
           es una herramienta de coordinación sino una página de venta que
           todavía no está abierta, y quien decide cuándo abre es quien
           administra. Como todo filtro del sitio, decide qué se PINTA — los
           archivos que vende siguen sirviéndose sin candado, y eso está
           dicho con todas las letras arriba de la página. */
        const T = window.TiendaCatalogo;
        let waBase = null;           // el enlace de WhatsApp, o null si no hay número
        const elegidos = new Set();  // ids marcados, en el orden en que se marcaron

        /* wa.me quiere solo dígitos y CON código de país: sin él el enlace
           abre un chat con un número que no existe, y eso se ve como un
           enlace perfecto. Ocho dígitos es Costa Rica. Es la misma regla que
           ya escribieron cobros.html y _compartido/contacto-academia.ts —son
           tres tiempos de ejecución que no pueden leerse entre sí—. */
        function enlaceWhatsapp(numero) {
            const digitos = String(numero ?? "").replace(/\D/g, "");
            if (!digitos) return null;
            return "https://wa.me/" + (digitos.length === 8 ? "506" + digitos : digitos);
        }

        /* El pedido se arma UNA vez, para el botón del paquete y para el de
           la selección. Escrito dos veces, el día que cambie el precio uno de
           los dos mensajes iría a pedir otra cosa que la que la pantalla
           enseña — y de eso se entera quien ya mandó el mensaje. */
        const CONDICIONES_TIENDA = "https://ajedrez-integral.com/terminos.html#tienda";
        function pedir(titulo, lineas, total) {
            if (!waBase) {
                document.getElementById("sin-whatsapp").classList.remove("hidden");
                document.getElementById("sin-whatsapp").scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }
            const cuerpo = ["Hola, quiero pedir de la tienda de Ajedrez Integral:", "", titulo]
                .concat(lineas.map((l) => "· " + l))
                .concat(["", "Total: " + T.moneda(total)])
                /* La aceptación de las condiciones va escrita en el mismo mensaje:
                   así queda por escrito, con fecha, antes del pago (ver «Las
                   páginas legales» en docs/decisiones/legal.md). */
                .concat(["", "Leí y acepto las condiciones de compra del material digital (una vez entregado no se devuelve): " + CONDICIONES_TIENDA])
                .join("\n");
            window.open(waBase + "?text=" + encodeURIComponent(cuerpo), "_blank", "noopener");
        }

        /* ===================== El anuncio ===================== */
        function pintarAnuncio() {
            document.getElementById("sello-modulos").textContent = T.MODULOS.length;
            document.getElementById("sello-bonos").textContent = T.BONOS.length;
            document.getElementById("bonos-cuantos").textContent = T.BONOS.length;
            document.getElementById("precio-suelto-frase").textContent = T.moneda(T.PRECIO);
            document.getElementById("pack-suelto").textContent = T.moneda(T.precioSuelto());
            document.getElementById("pack-precio").textContent = T.moneda(T.precioPack());
            document.getElementById("pack-ahorro").textContent = T.moneda(T.ahorroPack());
            document.getElementById("pack-que-lleva").textContent =
                "Los " + T.MODULOS.length + " módulos con sus " + T.PRODUCTOS.length +
                " materiales, los " + T.BONOS.length + " bonos y más de " +
                T.totalArchivos().toLocaleString("es-CR") + " archivos listos para dar clase.";
        }

        /* ===================== Los módulos =====================
           Cada tarjeta dice QUÉ LLEVA, con el nombre de cada material dentro.
           Un módulo que solo prometiera ("táctica paso a paso") y no dijera
           de qué cursos sale es exactamente la promesa que la entrega no
           puede cumplir. */
        function pintarModulos() {
            const caja = document.getElementById("modulos");
            caja.innerHTML = "";
            T.MODULOS.forEach((m) => {
                const art = document.createElement("article");
                art.className = "flex flex-col rounded-2xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 shadow-md overflow-hidden";

                const cinta = document.createElement("p");
                cinta.className = "bg-brand-800 dark:bg-brand-950 text-accent-400 text-xs font-bold uppercase tracking-wide px-4 py-2";
                cinta.textContent = "Módulo " + m.numero;

                const cuerpo = document.createElement("div");
                cuerpo.className = "p-5 flex flex-col flex-1";

                const h = document.createElement("h3");
                h.className = "font-serif text-lg font-bold text-brand-800 dark:text-white leading-tight";
                h.textContent = m.titulo;

                const promesa = document.createElement("p");
                promesa.className = "text-accent-700 dark:text-accent-400 text-sm font-semibold mt-1";
                promesa.textContent = m.promesa;

                const detalle = document.createElement("p");
                detalle.className = "text-sm text-brand-500 dark:text-brand-300 mt-2";
                detalle.textContent = m.detalle;

                const lista = document.createElement("ul");
                lista.className = "mt-4 space-y-1.5 text-sm flex-1";
                let piezas = 0;
                m.productos.forEach((id) => {
                    const p = T.producto(id);
                    if (!p) return;              // no puede pasar: lo comprueba el verificador
                    piezas += T.piezasDe(p);
                    const li = document.createElement("li");
                    li.className = "flex items-start gap-2 text-brand-600 dark:text-brand-200";
                    const tic = document.createElement("span");
                    tic.className = "text-accent-600 dark:text-accent-400 shrink-0";
                    tic.setAttribute("aria-hidden", "true");
                    tic.textContent = "✓";
                    const nombre = document.createElement("span");
                    nombre.textContent = p.titulo;
                    li.append(tic, nombre);
                    lista.appendChild(li);
                });

                const pie = document.createElement("p");
                pie.className = "mt-4 pt-3 border-t border-brand-100 dark:border-brand-800 text-xs text-brand-450 dark:text-brand-350";
                pie.textContent = piezas.toLocaleString("es-CR") + " archivos · " +
                    m.productos.length + (m.productos.length === 1 ? " material" : " materiales");

                cuerpo.append(h, promesa, detalle, lista, pie);
                art.append(cinta, cuerpo);
                caja.appendChild(art);
            });
        }

        /* ===================== Los bonos ===================== */
        function pintarBonos() {
            const caja = document.getElementById("bonos");
            caja.innerHTML = "";
            T.BONOS.forEach((b) => {
                const li = document.createElement("li");
                li.className = "flex items-start gap-4 rounded-xl bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-800 p-4";
                const em = document.createElement("span");
                em.className = "text-2xl shrink-0";
                em.setAttribute("aria-hidden", "true");
                em.textContent = b.emoji;
                const texto = document.createElement("div");
                const h = document.createElement("h3");
                h.className = "font-semibold text-brand-800 dark:text-white";
                h.textContent = b.titulo;
                const d = document.createElement("p");
                d.className = "text-sm text-brand-500 dark:text-brand-300 mt-0.5";
                d.textContent = b.detalle;
                texto.append(h, d);
                li.append(em, texto);
                caja.appendChild(li);
            });
        }

        /* ===================== Los materiales sueltos ===================== */
        let filtroActual = "todos";

        function pintarProductos() {
            const caja = document.getElementById("productos");
            caja.innerHTML = "";
            const lista = filtroActual === "todos" ? T.PRODUCTOS : T.porCategoria(filtroActual);
            lista.forEach((p) => caja.appendChild(fichaDe(p)));
        }

        function fichaDe(p) {
            const art = document.createElement("article");
            art.className = "flex flex-col rounded-2xl bg-white dark:bg-brand-900 border-2 border-brand-100 dark:border-brand-800 shadow-md overflow-hidden transition-colors";
            art.dataset.id = p.id;

            const cuerpo = document.createElement("div");
            cuerpo.className = "p-5 flex flex-col flex-1";

            const arriba = document.createElement("div");
            arriba.className = "flex items-start justify-between gap-3";
            const em = document.createElement("span");
            em.className = "text-3xl shrink-0";
            em.setAttribute("aria-hidden", "true");
            em.textContent = p.emoji;
            const nivel = document.createElement("span");
            nivel.className = "text-[0.7rem] font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-brand-800 rounded-full px-2.5 py-1 shrink-0";
            nivel.textContent = p.nivel;
            arriba.append(em, nivel);

            const h = document.createElement("h3");
            h.className = "font-serif text-lg font-bold text-brand-800 dark:text-white mt-3 leading-tight";
            h.textContent = p.titulo;

            const gancho = document.createElement("p");
            gancho.className = "text-sm font-semibold text-brand-700 dark:text-brand-100 mt-2";
            gancho.textContent = p.gancho;

            const resumen = document.createElement("p");
            resumen.className = "text-sm text-brand-500 dark:text-brand-300 mt-2 flex-1";
            resumen.textContent = p.resumen;

            /* Qué trae, contado. Es lo que separa "un curso" de "16
               cuadernillos, 16 hojas de ejercicios y 16 presentaciones", y es
               lo que hace que el precio se lea como poco en vez de como mucho.
               Los números salen del catálogo y el verificador los cuenta
               contra el disco: un número inventado nadie lo revisa, se cree,
               y falta material que se prometió. */
            const piezas = document.createElement("ul");
            piezas.className = "mt-4 flex flex-wrap gap-1.5";
            const NOMBRE = {
                cuadernillos: ["cuadernillo", "cuadernillos"],
                ejercicios: ["hoja de ejercicios", "hojas de ejercicios"],
                presentaciones: ["presentación", "presentaciones"],
                accesibles: ["versión accesible", "versiones accesibles"],
                preguntas: ["pregunta", "preguntas"],
                areas: ["área", "áreas"],
                paginas: ["página", "páginas"],
                capitulos: ["capítulo", "capítulos"],
                apartados: ["apartado", "apartados"],
                laminas: ["lámina", "láminas"],
            };
            Object.entries(p.piezas || {}).forEach(([clave, n]) => {
                if (!n) return;                       // cero no se pinta: "0 versiones accesibles" es ruido
                const li = document.createElement("li");
                li.className = "text-xs bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-200 rounded-md px-2 py-1";
                const nombres = NOMBRE[clave] || [clave, clave];
                li.textContent = n + " " + (n === 1 ? nombres[0] : nombres[1]);
                piezas.appendChild(li);
            });

            const pie = document.createElement("div");
            pie.className = "mt-5 pt-4 border-t border-brand-100 dark:border-brand-800 flex items-center justify-between gap-3";

            const precio = document.createElement("p");
            precio.className = "font-serif text-2xl font-bold text-brand-800 dark:text-white";
            precio.textContent = T.moneda(T.PRECIO);

            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "boton-elegir bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            boton.setAttribute("aria-pressed", "false");
            boton.textContent = "Lo quiero";
            boton.addEventListener("click", () => alternar(p.id, art, boton));

            pie.append(precio, boton);

            /* El "ver el material" SOLO lo ve quien administra, que es quien
               tiene que poder revisar lo que está vendiendo. Va rotulado con
               todas las letras para que no se confunda con algo que reciba
               quien compra — la misma línea que separa el material del
               profesor del de la clase en sesion.html. */
            const ver = document.createElement("a");
            ver.href = T.vistaDe(p);
            ver.target = "_blank";
            ver.rel = "noopener";
            ver.className = "mt-3 block text-xs text-brand-450 dark:text-brand-350 underline hover:text-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
            ver.textContent = "👁 Revisar este material (solo lo ves tú)";

            cuerpo.append(arriba, h, gancho, resumen, piezas, pie, ver);
            art.appendChild(cuerpo);
            if (elegidos.has(p.id)) marcarFicha(art, boton, true);
            return art;
        }

        function marcarFicha(art, boton, activo) {
            art.classList.toggle("border-accent-500", activo);
            art.classList.toggle("border-brand-100", !activo);
            art.classList.toggle("dark:border-brand-800", !activo);
            boton.setAttribute("aria-pressed", activo ? "true" : "false");
            /* El estado va ESCRITO en el botón y no solo en el borde: un
               color solo no se lee con daltonismo y no se anuncia con lector
               de pantalla. Misma regla que las barras de Informes. */
            boton.textContent = activo ? "✓ Agregado" : "Lo quiero";
            boton.classList.toggle("bg-accent-500", !activo);
            boton.classList.toggle("hover:bg-accent-600", !activo);
            boton.classList.toggle("bg-brand-800", activo);
            boton.classList.toggle("text-white", activo);
            boton.classList.toggle("text-brand-900", !activo);
        }

        function alternar(id, art, boton) {
            if (elegidos.has(id)) elegidos.delete(id); else elegidos.add(id);
            marcarFicha(art, boton, elegidos.has(id));
            pintarBarra();
        }

        function pintarBarra() {
            const barra = document.getElementById("barra-seleccion");
            if (!elegidos.size) { barra.classList.add("hidden"); document.body.style.paddingBottom = ""; return; }
            barra.classList.remove("hidden");
            /* La barra tapa el final de la página, así que se le devuelve el
               espacio: sin esto, el último renglón queda debajo de ella y
               parece que la página se cortó. */
            document.body.style.paddingBottom = barra.offsetHeight + "px";
            document.getElementById("sel-conteo").textContent =
                elegidos.size + (elegidos.size === 1 ? " material elegido ·" : " materiales elegidos ·");
            document.getElementById("sel-total").textContent = T.moneda(elegidos.size * T.PRECIO);
        }

        function limpiarSeleccion() {
            elegidos.clear();
            pintarProductos();
            pintarBarra();
        }

        /* ===================== Filtros ===================== */
        function pintarFiltros() {
            document.querySelectorAll(".filtro-tienda").forEach((b) => {
                const activo = b.dataset.cat === filtroActual;
                b.className = "filtro-tienda rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " +
                    (activo
                        ? "bg-brand-800 text-white dark:bg-accent-500 dark:text-brand-900"
                        : "bg-white dark:bg-brand-900 text-brand-600 dark:text-brand-200 border border-brand-200 dark:border-brand-700 hover:border-accent-500");
                b.setAttribute("aria-pressed", activo ? "true" : "false");
            });
        }

        document.querySelectorAll(".filtro-tienda").forEach((b) => {
            b.addEventListener("click", () => { filtroActual = b.dataset.cat; pintarFiltros(); pintarProductos(); });
        });

        document.getElementById("sel-limpiar").addEventListener("click", limpiarSeleccion);
        document.getElementById("sel-pedir").addEventListener("click", () => {
            const lineas = T.PRODUCTOS.filter((p) => elegidos.has(p.id))
                .map((p) => p.titulo + " — " + T.moneda(T.PRECIO));
            pedir(lineas.length === 1 ? "Este material:" : "Estos " + lineas.length + " materiales:", lineas, elegidos.size * T.PRECIO);
        });
        document.getElementById("pack-comprar").addEventListener("click", () => {
            pedir("EL SISTEMA COMPLETO — los " + T.MODULOS.length + " módulos y los " + T.BONOS.length + " bonos:",
                T.MODULOS.map((m) => "Módulo " + m.numero + ": " + m.titulo),
                T.precioPack());
        });

        /* ===================== Arranque ===================== */
        async function init() {
            const { data } = await sb.auth.getSession();
            const session = data.session;
            if (!session) { window.location.href = "login.html?next=tienda.html"; return; }

            const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).single();
            if (!perfil || !perfil.is_admin) {
                document.getElementById("loading").classList.add("hidden");
                document.getElementById("denegado").classList.remove("hidden");
                return;
            }

            /* El número de las consultas sale de la base, no escrito acá: es
               la misma fila que ya usan los informes a la casa y los avisos
               de cobro. Si no hay ninguno, NO se inventa uno —los botones lo
               dicen en vez de abrir un chat con un número que no existe—. */
            try {
                const { data: ajuste } = await sb.from("ajustes_academia")
                    .select("valor").eq("clave", "whatsapp_consultas").maybeSingle();
                waBase = enlaceWhatsapp(ajuste && ajuste.valor);
            } catch (e) {
                waBase = null;
            }
            if (!waBase) document.getElementById("sin-whatsapp").classList.remove("hidden");

            pintarAnuncio();
            pintarModulos();
            pintarBonos();
            pintarFiltros();
            pintarProductos();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    