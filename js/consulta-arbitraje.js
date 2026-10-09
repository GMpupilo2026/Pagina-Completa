/* Herramientas de arbitraje › Espacio de consultas (herramientas-arbitraje.html).
 *
 * Sin cuenta: manda el formulario a la Edge Function consulta-arbitraje, que
 * hace el freno de los envíos públicos y llama a la IA. Ver
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('consulta-form');
  if (!form) return;

  function mostrarError(mensaje) {
    const error = $('c-error');
    error.textContent = mensaje;
    error.classList.remove('hidden');
    error.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function mostrarResultado(texto) {
    $('c-error').classList.add('hidden');
    const caja = $('c-resultado');
    caja.innerHTML = '';
    const titulo = document.createElement('p');
    titulo.className = 'text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-400 mb-2';
    titulo.textContent = 'Respuesta';
    const cuerpo = document.createElement('p');
    cuerpo.className = 'text-brand-700 dark:text-brand-200 whitespace-pre-line';
    cuerpo.textContent = texto;
    caja.appendChild(titulo);
    caja.appendChild(cuerpo);
    caja.classList.remove('hidden');
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('c-error').classList.add('hidden');

    const nombre = $('c-nombre').value.trim();
    const email = $('c-email').value.trim();
    const pregunta = $('c-pregunta').value.trim();
    const marcado = form.querySelector('input[name="quien"]:checked');
    const quien = marcado ? marcado.value : 'otro';

    if (nombre.length < 2) { mostrarError('Escribe tu nombre.'); return; }
    if (pregunta.length < 10) { mostrarError('Cuenta tu duda con un poco más de detalle.'); return; }

    const boton = $('c-enviar');
    boton.disabled = true;
    const textoOriginal = boton.textContent;
    boton.textContent = 'Consultando…';

    try {
      const res = await fetch(`${window.SUPABASE_URL}/functions/v1/consulta-arbitraje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: window.SUPABASE_ANON_KEY },
        body: JSON.stringify({ nombre, email, quien, pregunta }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok || !datos.ok) throw new Error(datos.error || 'No se pudo enviar la consulta. Intenta de nuevo.');
      mostrarResultado(datos.respuesta);
      form.reset();
      // El radio de «quién pregunta» se queda en «Soy árbitro» por omisión del
      // propio HTML (checked), así que no hace falta volver a marcarlo.
    } catch (err) {
      mostrarError(err.message);
    } finally {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  });
})();
