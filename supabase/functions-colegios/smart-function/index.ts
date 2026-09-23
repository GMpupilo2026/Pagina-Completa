// Edge Function: registrar-inscripcion (desplegada como "smart-function" en el
// proyecto "Base de Colegios").
// Recibe los datos del formulario + un token de Cloudflare Turnstile.
// Verifica el token del lado del servidor (nunca confiar solo en el navegador)
// y, si es válido, guarda la inscripción usando la service role key.
// Con esto, la clave pública del formulario deja de tener permiso de
// escritura en "inscripciones" — solo esta función puede insertar.
//
// ARCHIVOS ADJUNTOS: el navegador los sube ANTES a la carpeta "pendientes/" del
// bucket privado "inscripcion-adjuntos" (la única donde anon puede escribir, y
// sin poder leer) y acá llegan solo sus rutas. Cada ruta se comprueba —que
// tenga la forma que arma js/adjuntos.js y que el archivo EXISTA—: si no, una
// inscripción podría guardar una ruta inventada, y en la lista se vería un
// adjunto roto sin que nada avisara.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const BUCKET_ADJUNTOS = 'inscripcion-adjuntos';
const MAX_ADJUNTOS = 5;
const RUTA_ADJUNTO = /^pendientes\/([a-z0-9-]{8,64})\/([A-Za-z0-9._-]{1,70}\.(jpg|png|webp|pdf|doc|docx|xls|xlsx))$/;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function verificarTurnstile(token, ip) {
  const form = new FormData();
  form.append('secret', TURNSTILE_SECRET_KEY ?? '');
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!data.success) {
    console.error('Turnstile rechazó el token:', JSON.stringify(data));
  }
  return data.success === true;
}

function calcularEdad(fechaNacimientoStr) {
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimientoStr);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad;
}

// Quita tildes/diéresis (José -> Jose, Ángulo -> Angulo) para que "usuario"
// quede siempre limpio, sin importar cómo haya escrito su nombre la persona.
function quitarTildes(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function primeraPalabra(s) {
  return String(s).trim().split(/\s+/)[0] || '';
}

// "usuario" autogenerado: PrimerNombre_PrimerApellido_LetraDelSegundoApellido
// (ej. Oscar Angulo Cascante -> "Oscar_Angulo_C"). Nombre y primer apellido usan
// solo la primera palabra por si alguien escribió un nombre compuesto.
function generarUsuario(nombre, apellido1, apellido2) {
  const n = quitarTildes(primeraPalabra(nombre));
  const a1 = quitarTildes(primeraPalabra(apellido1));
  const letra = quitarTildes(String(apellido2 ?? '').trim().charAt(0)).toUpperCase();
  return [n, a1, letra].filter(Boolean).join('_');
}

/* Devuelve las rutas válidas, o un texto de error. */
async function comprobarAdjuntos(supabaseAdmin, adjuntos) {
  if (adjuntos === undefined || adjuntos === null) return [];
  if (!Array.isArray(adjuntos) || adjuntos.length > MAX_ADJUNTOS) {
    return `Se pueden adjuntar hasta ${MAX_ADJUNTOS} archivos.`;
  }
  const rutas = [];
  for (const ruta of adjuntos) {
    const m = typeof ruta === 'string' ? RUTA_ADJUNTO.exec(ruta) : null;
    if (!m) return 'Un archivo adjunto no se subió bien. Vuelve a elegirlo e intenta de nuevo.';
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_ADJUNTOS)
      .list('pendientes/' + m[1], { limit: 10, search: m[2] });
    if (error || !(data || []).some((o) => o.name === m[2])) {
      return 'Un archivo adjunto no se subió bien. Vuelve a elegirlo e intenta de nuevo.';
    }
    rutas.push(ruta);
  }
  return rutas;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { turnstileToken, adjuntos, ...datos } = body;

    if (!turnstileToken) {
      return jsonResponse({ error: 'Falta la verificación de seguridad. Recarga la página e intenta de nuevo.' }, 400);
    }

    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || undefined;
    const turnstileValido = await verificarTurnstile(turnstileToken, ip);
    if (!turnstileValido) {
      return jsonResponse({ error: 'No se pudo verificar que eres una persona real. Recarga la página e intenta de nuevo.' }, 403);
    }

    // Validaciones básicas del lado del servidor (respaldo de las del navegador;
    // alguien podría llamar a esta función saltándose el formulario y el JS del navegador).
    const camposRequeridos = ['id', 'nombre', 'apellido1', 'apellido2', 'fechaNacimiento', 'genero', 'contacto', 'correo', 'tipoCentro', 'provincia', 'canton', 'centro', 'grado'];
    for (const campo of camposRequeridos) {
      if (!datos[campo] || String(datos[campo]).trim() === '') {
        return jsonResponse({ error: `Falta el campo requerido: ${campo}` }, 400);
      }
    }

    const correo = String(datos.correo).trim();
    const formatoCorreoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
    if (!formatoCorreoValido) {
      return jsonResponse({ error: 'El correo electrónico no tiene un formato válido.' }, 400);
    }
    if (correo.toLowerCase().endsWith('@mep.go.cr')) {
      return jsonResponse({ error: 'No se permiten correos @mep.go.cr.' }, 400);
    }

    const edad = calcularEdad(datos.fechaNacimiento);
    if (isNaN(edad) || edad < 11 || edad > 19) {
      return jsonResponse({ error: 'La persona inscrita debe tener entre 11 y 19 años cumplidos.' }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const rutas = await comprobarAdjuntos(supabaseAdmin, adjuntos);
    if (typeof rutas === 'string') return jsonResponse({ error: rutas }, 400);

    const { error } = await supabaseAdmin.from('inscripciones').insert([{
      cedula: datos.id,
      nombre: datos.nombre,
      apellido1: datos.apellido1,
      apellido2: datos.apellido2,
      usuario: generarUsuario(datos.nombre, datos.apellido1, datos.apellido2),
      fecha_nacimiento: datos.fechaNacimiento,
      edad,
      genero: datos.genero,
      contacto: datos.contacto,
      correo,
      tipo_centro: datos.tipoCentro,
      provincia: datos.provincia,
      canton: datos.canton,
      centro: datos.centro,
      direccion_regional: datos.direccionRegional || null,
      circuito: datos.circuito ? parseInt(datos.circuito, 10) : null,
      zona: datos.zona || null,
      modalidad: datos.modalidad || null,
      grado: datos.grado,
      acepto_datos: datos.aceptoDatos === true || datos.aceptoDatos === 'on',
      adjuntos: rutas,
    }]);

    if (error) {
      console.error('Error insertando inscripción:', error);
      if (error.code === '23505') {
        return jsonResponse({ error: 'Esta cédula ya está inscrita en este evento.', code: 'duplicate' }, 409);
      }
      return jsonResponse({ error: error.message || 'No se pudo guardar la inscripción.' }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'Error interno del servidor.' }, 500);
  }
});
