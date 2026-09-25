/* El código de inscripcion.html.

   Vivía escrito dentro de la página, en un <script> de 4 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        const SUPABASE_URL = 'https://prcfbzvshnusisczlpxl.supabase.co';
        const SUPABASE_ANON_KEY = 'sb_publishable_jZ-HV-E6d8zUfeA5ruTLvg_tHsYYllZ';
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Función que verifica Turnstile y guarda la inscripción con permisos elevados.
        // OJO: si renombras la función en Supabase, actualiza esta URL (ahora mismo apunta a "smart-function").
        const EDGE_FUNCTION_REGISTRAR_URL = `${SUPABASE_URL}/functions/v1/smart-function`;

        const TABLA_INSTITUCIONES = 'Coles';
        const COL_NOMBRE = 'NOMBRE';
        const COL_PROVINCIA = 'PROVINCIA';
        const COL_CANTON = 'CANTON';
        const COL_ZONA = 'ZONA';
        const COL_TIPO = 'TIPO DE CENTRO EDUCATIVO';
        const COL_MODALIDAD = 'MODALIDAD DE CENTRO EDUCATIVO';
        const COL_DIRECCION_REGIONAL = 'DIRECCIÓN REGIONAL';
        const COL_CIRCUITO = 'CIRCUITO';

        // Tamaño de página que usa Supabase por defecto para limitar cada respuesta.
        const TAMANO_PAGINA = 1000;

        // Tope de seguridad total (evita bucles infinitos si algo sale mal).
        const LIMITE_FILAS = 20000;

        function ordenarTexto(a, b) {
            return a.localeCompare(b, 'es', { sensitivity: 'base' });
        }

        function valoresUnicos(filas, columna) {
            const set = new Set();
            filas.forEach(f => {
                const v = (f[columna] || '').toString().trim();
                if (v) set.add(v);
            });
            return Array.from(set).sort(ordenarTexto);
        }

        // Envuelve un nombre de columna entre comillas dobles, como lo exige
        // PostgREST para identificadores con espacios (ej. "TIPO DE CENTRO EDUCATIVO").
        function col(nombreColumna) {
            return `"${nombreColumna}"`;
        }

        // Caché en memoria: mientras la persona llena el formulario, los datos de
        // Coles no cambian, así que evitamos volver a pedir lo mismo por la red
        // si va y viene entre las opciones (ej. cambia de cantón y regresa).
        const cacheConsultas = new Map();

        // Consulta genérica a Supabase con filtro flexible por tipo de centro.
        // Pagina con .range() para traer TODAS las filas que coincidan, sin importar
        // cuántas sean (Supabase limita cada respuesta individual a ~1000 filas).
        async function consultarColegios({ tipoCentro, provincia, canton, columnas }) {
            const claveCache = JSON.stringify({ tipoCentro, provincia, canton, columnas });
            if (cacheConsultas.has(claveCache)) {
                return cacheConsultas.get(claveCache);
            }

            let todasLasFilas = [];
            let desde = 0;
            let huboError = false;

            while (true) {
                let query = supabaseClient
                    .from(TABLA_INSTITUCIONES)
                    .select(columnas)
                    .range(desde, desde + TAMANO_PAGINA - 1);

                if (tipoCentro) {
                    // ilike es flexible: "Colegio" también encuentra "Colegio Técnico Profesional", etc.
                    query = query.ilike(COL_TIPO, `%${tipoCentro}%`);
                }
                if (provincia) query = query.eq(COL_PROVINCIA, provincia);
                if (canton) query = query.eq(COL_CANTON, canton);

                const { data, error } = await query;

                if (error) {
                    console.error('Error consultando Supabase:', error);
                    huboError = true;
                    break;
                }
                if (!data || data.length === 0) break;

                todasLasFilas = todasLasFilas.concat(data);

                if (data.length < TAMANO_PAGINA) break; // ya no hay más páginas
                if (todasLasFilas.length >= LIMITE_FILAS) break; // tope de seguridad

                desde += TAMANO_PAGINA;
            }

            // Solo guardamos en caché resultados que sí se completaron bien;
            // un error transitorio de red no debería quedar "pegado".
            if (!huboError) {
                cacheConsultas.set(claveCache, todasLasFilas);
            }

            return todasLasFilas;
        }
    