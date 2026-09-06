// ===== Worker de inscripciones — Ajedrez Integral =====
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') { return new Response(null, { status: 204, headers: corsHeaders }); }
    if (request.method === 'GET') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.ADMIN_KEY}`) { return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
      const { results } = await env.DB.prepare('SELECT * FROM inscripciones ORDER BY created_at DESC').all();
      return new Response(JSON.stringify(results), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (request.method === 'POST') {
      try {
        const data = await request.json();
        const required = ['nombre', 'apellido1', 'apellido2', 'correo', 'contacto', 'tipoCentro', 'centro', 'edad', 'grado'];
        for (const field of required) {
          if (!data[field] || String(data[field]).trim() === '') { return new Response(JSON.stringify({ error: `Falta el campo: ${field}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
        }
        const email = String(data.correo).toLowerCase().trim();
        const blockedDomains = ['.edu', '.edu.mx', '.edu.co', '.edu.ar', '.edu.es', '.gob', '.org.mx', 'escuela', 'colegio', 'institucion'];
        const domain = email.split('@')[1] || '';
        if (blockedDomains.some(d => domain.includes(d))) { return new Response(JSON.stringify({ error: 'Usa un correo personal (no institucional)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
        const { meta } = await env.DB.prepare('INSERT INTO inscripciones (nombre, apellido1, apellido2, correo, contacto, tipo_centro, centro, edad, grado, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(String(data.nombre).trim(), String(data.apellido1).trim(), String(data.apellido2).trim(), email, String(data.contacto).trim(), String(data.tipoCentro).trim(), String(data.centro).trim(), parseInt(data.edad, 10), String(data.grado).trim(), new Date().toISOString()).run();
        return new Response(JSON.stringify({ success: true, id: meta.last_row_id }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) { return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    }
    return new Response('Método no permitido', { status: 405, headers: corsHeaders });
  },
};
