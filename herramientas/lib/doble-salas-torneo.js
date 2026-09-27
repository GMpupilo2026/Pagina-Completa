/* Un Supabase de mentira para las salas de torneos (tabla salas_torneo), que
 * usan verificar-transmision.js y verificar-salas-torneo.js.
 *
 * Se sirve EN LUGAR de js/supabase-client.js (ctx.route) y deja un window.sb
 * que se porta como la base de verdad en lo que importa acá:
 *   - la RLS: sin ser admin se ven solo las visibles, y escribir no toca
 *     ninguna fila (update/delete) o da 42501 (insert), igual que PostgREST;
 *   - los check de la tabla y de interno.enlaces_de_sala_validos: una clave
 *     mala, un enlace que no es https o una clave repetida (23505) se
 *     rechazan, así que la prueba nota si el formulario deja pasar algo;
 *   - los filtros se aplican en el RESOLVER (then), no al encadenar.
 * Lo que la página escribe queda en window.__escrituras, y
 * window.__quitarAdmin() le quita el permiso a la cuenta a mitad de camino.
 *
 *   dobleSalas({ salas, admin, falla })  → el texto del script
 *     falla: true hace que leer salas_torneo dé error.
 * Cualquier otra tabla contesta vacío (el panel de admin lee varias al
 * arrancar); profiles contesta la cuenta de quien mira.
 */
function dobleSalas(opciones) {
  const o = opciones || {};
  return `
(function () {
  let ADMIN = ${JSON.stringify(!!o.admin)};
  const FALLA = ${JSON.stringify(!!o.falla)};
  const USUARIO = ADMIN ? { id: "u-admin", is_admin: true, full_name: "Quien Administra", email: "admin@x.cr", role: "profesor" } : null;
  let salas = ${JSON.stringify(o.salas || [])};
  let serie = 100;
  window.__escrituras = [];

  const CLAVE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const URL_OK = /^https:\\/\\/[A-Za-z0-9.-]+(:[0-9]+)?(\\/[^\\s"<>]*)?$/;
  function problema(s) {
    if (!CLAVE.test(s.clave || "") || s.clave.length > 40) return "clave";
    if (!s.nombre || s.nombre.trim().length < 2) return "nombre";
    if (!["lichess", "enlaces"].includes(s.tipo)) return "tipo";
    if (s.lichess_id != null && !/^[A-Za-z0-9]{8}$/.test(s.lichess_id)) return "lichess_id";
    if (s.tipo === "lichess" && !s.lichess_id) return "lichess_con_id";
    const e = s.enlaces || [];
    if (!Array.isArray(e) || e.length > 6) return "enlaces";
    if (s.tipo === "enlaces" && !e.length) return "enlaces_con_alguno";
    for (const x of e) {
      if (!x || typeof x !== "object" || Object.keys(x).length !== 2) return "enlace";
      if (!/^\\S.{0,59}$/.test(x.texto || "") || !URL_OK.test(x.url || "") || x.url.length > 500) return "enlace";
    }
    return null;
  }
  const error = (code, message) => ({ data: null, error: { code, message } });

  function orden(a, b) { return (a.orden - b.orden) || a.nombre.localeCompare(b.nombre); }

  function consulta(tabla) {
    const q = { tabla, op: "select", filtros: [], unica: false, devolver: false, datos: null };
    const b = {
      select() { if (q.op !== "select") q.devolver = true; return b; },
      insert(d) { q.op = "insert"; q.datos = d; return b; },
      update(d) { q.op = "update"; q.datos = d; return b; },
      delete() { q.op = "delete"; return b; },
      eq(col, val) { q.filtros.push([col, val]); return b; },
      in() { return b; }, neq() { return b; }, is() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      order() { return b; }, range() { return b; }, limit() { return b; },
      single() { q.unica = true; return b; },
      maybeSingle() { q.unica = true; return b; },
      then(res, rej) { return Promise.resolve(resolver(q)).then(res, rej); },
    };
    return b;
  }

  function pasa(fila, filtros) { return filtros.every(([c, v]) => String(fila[c]) === String(v)); }

  function resolver(q) {
    if (q.tabla === "profiles") {
      const filas = USUARIO ? [USUARIO].filter((f) => pasa(f, q.filtros)) : [];
      return { data: q.unica ? (filas[0] || null) : filas, error: null };
    }
    if (q.tabla !== "salas_torneo") return { data: q.unica ? null : [], error: null };
    if (q.op === "select") {
      if (FALLA) return error("PGRST000", "caída de prueba");
      const filas = salas.filter((s) => (ADMIN || s.visible) && pasa(s, q.filtros)).sort(orden).map((s) => ({ ...s }));
      return { data: q.unica ? (filas[0] || null) : filas, error: null };
    }
    if (q.op === "insert") {
      if (!ADMIN) return error("42501", "new row violates row-level security policy");
      const nuevas = (Array.isArray(q.datos) ? q.datos : [q.datos]).map((d) => ({ visible: true, orden: 0, descripcion: "", emoji: "🏆", enlaces: [], lichess_id: null, ...d, id: "s-" + (serie++) }));
      for (const n of nuevas) {
        const p = problema(n); if (p) return error("23514", "check " + p);
        if (salas.some((s) => s.clave === n.clave)) return error("23505", "duplicate key salas_torneo_clave_key");
      }
      salas = salas.concat(nuevas);
      window.__escrituras.push({ op: "insert", datos: q.datos });
      return { data: q.devolver ? nuevas.map((n) => ({ id: n.id })) : null, error: null };
    }
    if (q.op === "update") {
      const tocadas = ADMIN ? salas.filter((s) => pasa(s, q.filtros)) : [];
      for (const s of tocadas) {
        const n = { ...s, ...q.datos };
        const p = problema(n); if (p) return error("23514", "check " + p);
        if (salas.some((x) => x.id !== s.id && x.clave === n.clave)) return error("23505", "duplicate key salas_torneo_clave_key");
      }
      salas = salas.map((s) => tocadas.includes(s) ? { ...s, ...q.datos } : s);
      window.__escrituras.push({ op: "update", datos: q.datos, filtros: q.filtros, filas: tocadas.length });
      return { data: q.devolver ? tocadas.map((s) => ({ id: s.id })) : null, error: null };
    }
    if (q.op === "delete") {
      const borradas = ADMIN ? salas.filter((s) => pasa(s, q.filtros)) : [];
      salas = salas.filter((s) => !borradas.includes(s));
      window.__escrituras.push({ op: "delete", filtros: q.filtros, filas: borradas.length });
      return { data: null, error: null };
    }
  }

  window.__salas = () => salas;
  // Como si a la cuenta le quitaran la administración con el panel abierto:
  // la página sigue igual, pero la RLS ya no deja escribir.
  window.__quitarAdmin = () => { ADMIN = false; };
  window.SUPABASE_URL = "https://ejemplo.supabase.co";
  window.SUPABASE_ANON_KEY = "clave-de-mentira";
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: USUARIO ? { user: { id: USUARIO.id }, access_token: "token-de-mentira" } : null } }),
      getUser: () => Promise.resolve({ data: { user: USUARIO ? { id: USUARIO.id } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => consulta(t),
    rpc: (n) => consulta("rpc:" + n),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  };
})();
`;
}

// Las salas con las que arrancan las pruebas: las dos de verdad y una oculta.
const SALAS = [
  { id: "s-1", clave: "cenfotec", nombre: "Desafío Mentes Maestras CENFOTEC 2026", descripcion: "Las partidas del torneo de CENFOTEC.",
    emoji: "🎓", tipo: "lichess", lichess_id: "s7NfNv6H", visible: true, orden: 1,
    enlaces: [{ texto: "Verlo directo en Lichess", url: "https://lichess.org/broadcast/desafio-mentes-maestras-cenfotec-2026/s7NfNv6H" }] },
  { id: "s-2", clave: "utn", nombre: "Torneo UTN 2026", descripcion: "Se transmite en idchess.", emoji: "🎓", tipo: "enlaces", lichess_id: null, visible: true, orden: 2,
    enlaces: [{ texto: "Partida masculina", url: "https://media.idchess.com/en/tournaments/kYfhVJ/utn-2026/desk/eyJpZCI6OTY1OTU2LCJwYXNzd29yZCI6bnVsbH0=" },
              { texto: "Partida femenina", url: "https://media.idchess.com/en/tournaments/b0fhVJ/utn-2026/desk/eyJpZCI6OTY1OTYxLCJwYXNzd29yZCI6bnVsbH0=" }] },
  { id: "s-3", clave: "copa-secreta", nombre: "Copa en preparación", descripcion: "", emoji: "🏆", tipo: "lichess", lichess_id: "Abcd1234", visible: false, orden: 3, enlaces: [] },
];

module.exports = { dobleSalas, SALAS };
