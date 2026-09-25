/* El código de inscripcion.html.

   Vivía escrito dentro de la página, en un <script> de 20 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        const cedulaInput = document.getElementById('cedulaJugador');
        const pNombreInput = document.getElementById('primerNombre');
        const pApellidoInput = document.getElementById('primerApellido');
        const sApellidoInput = document.getElementById('segundoApellido');
        const fechaNacimientoInput = document.getElementById('fechaNacimiento');
        const correoJugadorInput = document.getElementById('correoJugador');
        
        const tipoInstitucionSelect = document.getElementById('tipoInstitucion');
        const provinciaSelect = document.getElementById('provincia');
        const cantonSelect = document.getElementById('canton');
        const institucionSelect = document.getElementById('institucionSelect');
        const direccionRegionalInput = document.getElementById('direccionRegional');
        const circuitoInput = document.getElementById('circuito');
        const zonaInput = document.getElementById('zona');
        const modalidadInput = document.getElementById('modalidad');
        const institucionInfo = document.getElementById('institucion-info');

        const escuelaAviso = document.getElementById('escuela-aviso');

        function resetSelect(select, placeholder, disabled) {
            select.innerHTML = `<option value="">${placeholder}</option>`;
            select.disabled = disabled;
        }

        function poblarSelect(select, valores) {
            valores.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                select.appendChild(opt);
            });
        }

        // Limpia la info derivada de la institución (Zona/Modalidad, Dirección Regional, Circuito).
        // Se usa cada vez que cambia algo "aguas arriba" (tipo, provincia o cantón).
        function limpiarInfoInstitucion() {
            institucionInfo.classList.add('hidden');
            direccionRegionalInput.value = '';
            direccionRegionalInput.placeholder = 'Se autocompletará al elegir la institución';
            circuitoInput.value = '';
            zonaInput.value = '';
            modalidadInput.value = '';
        }

        // Reconsulta Supabase y llena un <select> con los valores únicos de una columna.
        // Centraliza el patrón "mostrar 'Cargando...' -> pedir datos -> poblar" que
        // usan Provincia y Cantón.
        async function cargarValoresUnicosEnSelect(select, columna, filtros, { vacio, listo }) {
            const filas = await consultarColegios({ ...filtros, columnas: col(columna) });
            const valores = valoresUnicos(filas, columna);
            resetSelect(select, valores.length ? listo : vacio, !valores.length);
            poblarSelect(select, valores);
            return valores;
        }

        // Dinámica de Tipo de Centro -> Carga Provincias reales desde Supabase (solo para Colegio por ahora)
        tipoInstitucionSelect.addEventListener('change', async function() {
            resetSelect(cantonSelect, 'Primero provincia...', true);
            resetSelect(institucionSelect, 'Seleccione cantón...', true);
            limpiarInfoInstitucion();
            escuelaAviso.classList.add('hidden');

            if (!this.value) {
                resetSelect(provinciaSelect, 'Primero tipo de centro...', true);
                return;
            }

            // Las escuelas todavía no participan: mostramos el aviso y no consultamos Supabase.
            if (this.value === 'Escuela') {
                escuelaAviso.classList.remove('hidden');
                resetSelect(provinciaSelect, 'Disponible solo para Colegio por ahora', true);
                return;
            }

            resetSelect(provinciaSelect, 'Cargando provincias...', true);
            await cargarValoresUnicosEnSelect(
                provinciaSelect,
                COL_PROVINCIA,
                { tipoCentro: this.value },
                { vacio: 'Sin resultados en la base de datos', listo: 'Seleccione provincia...' }
            );
        });

        // Dinámica de Provincia -> Carga Cantones reales desde Supabase
        provinciaSelect.addEventListener('change', async function() {
            resetSelect(institucionSelect, 'Seleccione cantón...', true);
            limpiarInfoInstitucion();

            if (!this.value) {
                resetSelect(cantonSelect, 'Seleccione provincia...', true);
                return;
            }

            resetSelect(cantonSelect, 'Cargando cantones...', true);
            await cargarValoresUnicosEnSelect(
                cantonSelect,
                COL_CANTON,
                { tipoCentro: tipoInstitucionSelect.value, provincia: this.value },
                { vacio: 'Sin cantones para esta provincia', listo: 'Seleccione cantón...' }
            );
        });

        // Dinámica de Cantón -> Carga Instituciones reales desde Supabase
        cantonSelect.addEventListener('change', async function() {
            limpiarInfoInstitucion();

            if (!this.value) {
                resetSelect(institucionSelect, 'Seleccione cantón...', true);
                return;
            }

            resetSelect(institucionSelect, 'Cargando instituciones...', true);

            const columnasInstitucion = [COL_NOMBRE, COL_ZONA, COL_MODALIDAD, COL_DIRECCION_REGIONAL, COL_CIRCUITO]
                .map(col)
                .join(', ');

            const filas = await consultarColegios({
                tipoCentro: tipoInstitucionSelect.value,
                provincia: provinciaSelect.value,
                canton: this.value,
                columnas: columnasInstitucion
            });

            // Quita duplicados por nombre y ordena
            const vistos = new Set();
            const instituciones = filas.filter(f => {
                const nombre = (f[COL_NOMBRE] || '').trim();
                if (!nombre || vistos.has(nombre)) return false;
                vistos.add(nombre);
                return true;
            }).sort((a, b) => ordenarTexto(a[COL_NOMBRE], b[COL_NOMBRE]));

            resetSelect(institucionSelect, instituciones.length ? 'Seleccione la institución...' : 'Sin instituciones registradas para este cantón', !instituciones.length);

            instituciones.forEach(inst => {
                const opt = document.createElement('option');
                opt.value = inst[COL_NOMBRE];
                opt.textContent = inst[COL_NOMBRE];
                if (inst[COL_ZONA]) opt.dataset.zona = inst[COL_ZONA];
                if (inst[COL_MODALIDAD]) opt.dataset.modalidad = inst[COL_MODALIDAD];
                if (inst[COL_DIRECCION_REGIONAL]) opt.dataset.direccionRegional = inst[COL_DIRECCION_REGIONAL];
                if (inst[COL_CIRCUITO] !== null && inst[COL_CIRCUITO] !== undefined && inst[COL_CIRCUITO] !== '') {
                    opt.dataset.circuito = inst[COL_CIRCUITO];
                }
                institucionSelect.appendChild(opt);
            });
        });

        // Dinámica de Selección de Institución -> Muestra Zona/Modalidad/Dirección Regional/Circuito reales
        institucionSelect.addEventListener('change', function() {
            if (!this.value) {
                limpiarInfoInstitucion();
                return;
            }

            const selectedOption = this.options[this.selectedIndex];
            const zona = selectedOption?.dataset.zona;
            const modalidad = selectedOption?.dataset.modalidad;
            const regional = selectedOption?.dataset.direccionRegional;
            const circuito = selectedOption?.dataset.circuito;

            if (zona || modalidad) {
                institucionInfo.textContent = `ℹ️ ${zona ? 'Zona: ' + zona : ''}${zona && modalidad ? ' · ' : ''}${modalidad ? 'Modalidad: ' + modalidad : ''}`;
                institucionInfo.classList.remove('hidden');
            } else {
                institucionInfo.classList.add('hidden');
            }

            circuitoInput.value = circuito || '';
            zonaInput.value = zona || '';
            modalidadInput.value = modalidad || '';

            // Viene directo de Supabase; el campo es de solo lectura (ver atributo readonly)
            direccionRegionalInput.value = regional || '';
            direccionRegionalInput.placeholder = regional ? '' : 'No registrada para esta institución';
        });

        const correoErrorMsg = document.getElementById('correo-error-jugador');
        const ageErrorMsg = document.getElementById('age-error');
        const tseLoader = document.getElementById('tse-loader');
        const tseStatus = document.getElementById('tse-status');
        // El Worker ahora solo se usa para el autocompletado por cédula (GET).
        // El envío final de la inscripción va directo a Supabase (ver el submit handler).
        const WORKER_URL = 'https://ajedrez-inscripciones.gmpupilo.workers.dev';

        const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Valida formato de correo y bloquea dominios @mep.go.cr.
        // Devuelve { valido, mensaje } — mensaje solo viene lleno cuando valido es false.
        function validarCorreo(email) {
            const valor = email.trim();
            if (!valor) return { valido: true };

            if (!FORMATO_CORREO.test(valor)) {
                return { valido: false, mensaje: '⚠️ Ingresa un correo electrónico válido (ej. nombre@dominio.com).' };
            }
            if (valor.toLowerCase().endsWith('@mep.go.cr')) {
                return { valido: false, mensaje: '⚠️ No se permiten correos @mep.go.cr. Usa un correo personal (Gmail, Outlook, Yahoo, etc.).' };
            }
            return { valido: true };
        }

        function calcularEdad(fechaNacimientoStr) {
            if (!fechaNacimientoStr) return null;
            const hoy = new Date();
            const nacimiento = new Date(fechaNacimientoStr);
            let edad = hoy.getFullYear() - nacimiento.getFullYear();
            const mes = hoy.getMonth() - nacimiento.getMonth();
            if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
                edad--;
            }
            return edad;
        }

        function esEdadValida(fechaNacimientoStr) {
            const edad = calcularEdad(fechaNacimientoStr);
            if (edad === null || isNaN(edad)) return false;
            return edad >= 11 && edad <= 19;
        }

        let lastCedulaConsultada = '';

        cedulaInput.addEventListener('input', async function() {
            const cedula = this.value.trim().replace(/\D/g, '');
            
            if (cedula.length === 9 && cedula !== lastCedulaConsultada) {
                lastCedulaConsultada = cedula;
                tseLoader.classList.remove('hidden');
                tseStatus.textContent = 'Buscando datos de identificación...';
                tseStatus.className = 'text-xs text-brand-600 dark:text-brand-300 font-medium mt-1';

                let obtenido = false;

                try {
                    const res = await fetch(`${WORKER_URL}?cedula=${cedula}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success && data.persona) {
                            pNombreInput.value = data.persona.nombre || '';
                            pApellidoInput.value = data.persona.primerApellido || '';
                            sApellidoInput.value = data.persona.segundoApellido || '';
                            if (data.persona.fechaNacimiento) {
                                fechaNacimientoInput.value = data.persona.fechaNacimiento;
                                fechaNacimientoInput.dispatchEvent(new Event('input'));
                            }
                            obtenido = true;
                        }
                    }
                } catch (e) {
                    console.log('Fallo en Worker, intentando API alternativa...');
                }

                if (!obtenido) {
                    try {
                        const resHacienda = await fetch(`https://api.hacienda.go.cr/fe/ae?identificacion=${cedula}`);
                        if (resHacienda.ok) {
                            const dataH = await resHacienda.json();
                            if (dataH.nombre) {
                                const partes = dataH.nombre.split(' ');
                                if (partes.length >= 3) {
                                    pNombreInput.value = partes.slice(0, partes.length - 2).join(' ');
                                    pApellidoInput.value = partes[partes.length - 2];
                                    sApellidoInput.value = partes[partes.length - 1];
                                } else if (partes.length === 2) {
                                    pNombreInput.value = partes[0];
                                    pApellidoInput.value = partes[1];
                                    sApellidoInput.value = '';
                                } else {
                                    pNombreInput.value = dataH.nombre;
                                }
                                obtenido = true;
                            }
                        }
                    } catch (e) {
                        console.log('Fallo en consulta de Hacienda.');
                    }
                }

                tseLoader.classList.add('hidden');

                if (obtenido) {
                    tseStatus.textContent = '✅ Datos identificados correctamente.';
                    tseStatus.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1';
                } else {
                    tseStatus.textContent = 'ℹ️ No se encontraron los datos automáticamente. Por favor ingresa los campos manualmente.';
                    tseStatus.className = 'text-xs text-amber-600 dark:text-amber-400 font-medium mt-1';
                }

            } else if (cedula.length < 9) {
                tseStatus.textContent = 'Ingresa los 9 dígitos sin guiones para autocompletar.';
                tseStatus.className = 'text-xs text-slate-500 mt-1';
            }
        });

        correoJugadorInput.addEventListener('input', function() {
            const resultado = validarCorreo(this.value);
            if (!resultado.valido) {
                this.classList.add('border-red-500', 'bg-red-50', 'dark:bg-red-950/30');
                this.classList.remove('border-brand-300', 'dark:border-brand-800/60', 'bg-slate-50', 'dark:bg-slate-950');
                correoErrorMsg.textContent = resultado.mensaje;
                correoErrorMsg.classList.remove('hidden');
                this.setCustomValidity(resultado.mensaje);
            } else {
                this.classList.remove('border-red-500', 'bg-red-50', 'dark:bg-red-950/30');
                this.classList.add('border-brand-300', 'dark:border-brand-800/60', 'bg-slate-50', 'dark:bg-slate-950');
                correoErrorMsg.classList.add('hidden');
                this.setCustomValidity('');
            }
        });

        fechaNacimientoInput.addEventListener('input', function() {
            if (this.value && !esEdadValida(this.value)) {
                this.classList.add('border-red-500', 'bg-red-50', 'dark:bg-red-950/30');
                this.classList.remove('border-slate-300', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-950');
                ageErrorMsg.classList.remove('hidden');
                this.setCustomValidity('La persona inscrita debe tener entre 11 y 19 años cumplidos.');
            } else {
                this.classList.remove('border-red-500', 'bg-red-50', 'dark:bg-red-950/30');
                this.classList.add('border-slate-300', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-950');
                ageErrorMsg.classList.add('hidden');
                this.setCustomValidity('');
            }
        });

        document.getElementById('inscription-form').addEventListener('submit', async function(e) {
            e.preventDefault();

            const submitBtn = this.querySelector('button[type="submit"]');
            const successMsg = document.getElementById('form-success');
            const errorMsg = document.getElementById('form-error');
            const honeypot = document.getElementById('sitioWeb');

            // Anti-spam: si el campo trampa viene lleno, es un bot. Simulamos éxito
            // y no escribimos nada en la base de datos.
            if (honeypot && honeypot.value.trim() !== '') {
                console.warn('Envío bloqueado: campo honeypot lleno (probable bot).');
                successMsg.classList.remove('hidden');
                errorMsg.classList.add('hidden');
                this.reset();
                return;
            }

            const correoResultado = validarCorreo(correoJugadorInput.value);
            if (!correoResultado.valido) {
                correoErrorMsg.textContent = correoResultado.mensaje;
                correoErrorMsg.classList.remove('hidden');
                correoJugadorInput.focus();
                return;
            }

            if (!esEdadValida(fechaNacimientoInput.value)) {
                ageErrorMsg.classList.remove('hidden');
                fechaNacimientoInput.focus();
                return;
            }

            const formData = new FormData(this);
            const data = Object.fromEntries(formData);

            const turnstileToken = data['cf-turnstile-response'];
            if (!turnstileToken) {
                errorMsg.textContent = '⚠️ Completa la verificación de seguridad antes de enviar.';
                errorMsg.classList.remove('hidden');
                return;
            }

            data.centro = institucionSelect.value;
            data.direccionRegional = direccionRegionalInput.value;
            delete data.centroSelect;
            delete data.sitioWeb;
            delete data['cf-turnstile-response'];

            const pNombre = pNombreInput.value.trim();
            const pApellido = pApellidoInput.value.trim();
            const sApellido = sApellidoInput.value.trim();
            const nombreCompleto = `${pNombre} ${pApellido} ${sApellido}`.trim();

            data.nombre = nombreCompleto;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando…';

            try {
                const res = await fetch(EDGE_FUNCTION_REGISTRAR_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'apikey': SUPABASE_ANON_KEY
                    },
                    body: JSON.stringify({ ...data, turnstileToken })
                });

                const resultado = await res.json().catch(() => ({}));

                if (res.ok && resultado.success) {
                    successMsg.classList.remove('hidden');
                    errorMsg.classList.add('hidden');
                    this.reset();
                    resetSelect(provinciaSelect, 'Primero tipo de centro...', true);
                    resetSelect(cantonSelect, 'Primero provincia...', true);
                    resetSelect(institucionSelect, 'Seleccione cantón...', true);
                    limpiarInfoInstitucion();
                    escuelaAviso.classList.add('hidden');
                    lastCedulaConsultada = '';
                    tseStatus.textContent = 'Ingresa los 9 dígitos sin guiones para autocompletar.';
                    tseStatus.className = 'text-xs text-slate-500 mt-1';
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    console.error('Error registrando inscripción:', resultado);
                    if (resultado.code === 'duplicate') {
                        errorMsg.textContent = '⚠️ Esta cédula ya está inscrita en este evento. Si crees que es un error, escribe por WhatsApp al 8309-2291 con Oscar Angulo, el organizador.';
                    } else {
                        errorMsg.textContent = '⚠️ ' + (resultado.error || 'No se pudo enviar la inscripción');
                    }
                    errorMsg.classList.remove('hidden');
                    successMsg.classList.add('hidden');
                }
            } catch (err) {
                console.error(err);
                errorMsg.textContent = '⚠️ Error de conexión con el servidor.';
                errorMsg.classList.remove('hidden');
                successMsg.classList.add('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Enviar inscripción';
                if (window.turnstile) window.turnstile.reset();
            }
        });
    