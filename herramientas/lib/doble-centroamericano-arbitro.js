/* El doble de Supabase de la página del árbitro del Centroamericano (centroamericano-arbitro.html): se porta como
   la Edge Function `centroamericano-mesa` (valida el token, cuenta las ilegales por partida, anula, solo anota lo que
   quedó guardado, pide la lista previa antes de guardar). Lo usan verificar-centroamericano-mesas-pagina.js y
   verificar-guia-planillas.js: una sola copia. `dobleArbitro()` devuelve el texto del script que reemplaza a
   js/supabase-client.js dentro del navegador de prueba. */
"use strict";
const TOKEN = "ab12".repeat(16);
const TOKEN_B = "cd34".repeat(16);

const MESAS = [
    { mesa: 1, blancas: "Muñoz Feliz Alejandro", negras: "Gramajo Tovar Marco", valor: "0" },
    { mesa: 2, blancas: "Harvey Ian", negras: "Acuña Porras Fabio", valor: "0" },
    { mesa: 3, blancas: "Hopkins John", negras: "Baquero Graterol", valor: "2" },
];

// El «servidor» del árbitro, dentro del navegador de prueba.
const SERVIDOR_ARBITRO = `
  const TOKEN = ${JSON.stringify(TOKEN)};
  const TOKEN_B = ${JSON.stringify(TOKEN_B)};
  const MESAS = ${JSON.stringify(MESAS)};
  const filas = []; let n = 0;
  const falla = (estado, error) => ({ data: null, error: { context: { status: estado, json: () => Promise.resolve({ error }) } } });
  const marcasDe = () => {
    const anul = new Set(filas.filter((f) => f.tipo === "anulacion").map((f) => f.anula)); const out = {};
    for (const f of filas) { if (!["ilegal", "irregularidad"].includes(f.tipo) || anul.has(f.id)) continue;
      const k = f.mesa + "|" + f.color; const m = out[k] || (out[k] = { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null });
      if (f.tipo === "ilegal") { m.ilegales++; m.ultima_ilegal = f.id; } else { m.irregularidades++; m.ultima_irregularidad = f.id; } }
    return out; };
  const NOMBRE = { "0": "sin resultado", "1": "1-0", "2": "1/2", "3": "0-1", "D": "borrado" };
  // Lo que la organización le mandó y lo que él pidió: la prueba lo cambia desde afuera.
  window.__avisos = { nombrado: true, arbitro: "Ana Árbitra", mensajes: [], ayuda: null, abiertas: [] };
  window.__filas = filas;
  window.__lista = []; window.__planillas = []; window.__finalizada = null; window.__presencia = []; window.__tiempos = []; window.__hermanas = [];
  const PASOS = ["relojes", "tableros"];
  window.__servidor = (b) => {
    if (b.token !== TOKEN && b.token !== TOKEN_B) return falla(404, "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo.");
    if (b.action === "presencia") {
      if (b.mesa < 1 || b.mesa > 3) return falla(403, "La mesa " + b.mesa + " no es de tu rango (1 a 3).");
      window.__presencia = window.__presencia.filter((x) => !(x.mesa === b.mesa && x.color === b.color)).concat([{ mesa: b.mesa, color: b.color, presente: b.presente, marcada: "2026-11-02T15:51:00Z" }]);
      return { data: { ok: true, mesa: b.mesa, color: b.color, presente: b.presente }, error: null }; }
    if (b.action === "tiempo") {
      const yaT = b.id && window.__tiempos.find((x) => x.id === b.id);
      if (yaT) return { data: { ok: true, id: yaT.id, ocurrio: yaT.ocurrio, jugada: yaT.jugada, repetido: true }, error: null };
      const m = MESAS.find((x) => x.mesa === b.mesa); if (!m) return falla(403, "La mesa " + b.mesa + " no es de tu rango (1 a 3).");
      if (m.valor !== "0") return falla(409, "La mesa " + b.mesa + " ya tiene resultado en chess-results.");
      if (![b.j_blancas, b.j_negras].every((j) => Number.isInteger(j) && j >= 0 && j <= 400)) return falla(400, "Las jugadas de cada color van de 0 a 400.");
      const jugada = Math.max(1, b.j_blancas, b.j_negras);
      window.__tiempos.unshift({ id: b.id || "t" + (++n), ocurrio: "2026-11-02T15:55:00Z", mesa: b.mesa, jugada, j_blancas: b.j_blancas, j_negras: b.j_negras, turno: null, t_blancas: b.t_blancas, t_negras: b.t_negras, nota: "" });
      return { data: { ok: true, id: window.__tiempos[0].id, ocurrio: "2026-11-02T15:55:00Z", jugada }, error: null }; }
    if (b.action === "lista") {
      const i = PASOS.indexOf(b.paso); if (i < 0) return falla(400, "Paso no válido.");
      if (PASOS.slice(0, i).some((x) => !window.__lista.includes(x))) return falla(409, "Antes tienes que aprobar el paso anterior de la lista.");
      if (!window.__lista.includes(b.paso)) window.__lista.push(b.paso);
      return { data: { ok: true, lista: PASOS.filter((x) => window.__lista.includes(x)) }, error: null }; }
    if (b.action === "planilla") {
      if (b.mesa < 1 || b.mesa > 3) return falla(403, "La mesa " + b.mesa + " no es de tu rango (1 a 3).");
      if (!/^data:image\\/jpeg;base64,/.test(b.imagen)) return falla(400, "La foto tiene que ser una imagen JPG.");
      window.__planillas = window.__planillas.filter((x) => x.mesa !== b.mesa).concat([{ mesa: b.mesa, lado: "blancas", subida: "2026-11-02T15:50:00Z", drive_ok: false }]);
      return { data: { ok: true, mesa: b.mesa, lado: "ambas", drive: window.__drive || "sin_conectar", subida: "2026-11-02T15:50:00Z" }, error: null }; }
    if (b.action === "finalizar") {
      if (!b.revision.resultados || !b.revision.planillas || !b.revision.firmadas) return falla(400, "Para finalizar tienes que confirmar las tres revisiones.");
      const faltan = MESAS.filter((m) => m.valor === "0").map((m) => m.mesa);
      if (faltan.length) return falla(409, "Todavía faltan resultados en las mesas " + faltan.join(", ") + ".");
      window.__finalizada = "2026-11-02T16:00:00Z"; return { data: { ok: true, finalizada_en: window.__finalizada }, error: null }; }
    if (b.action === "avisos") return { data: Object.assign({ ok: true }, window.__avisos), error: null };
    if (b.action === "ayuda") {
      if (b.mesa != null && (b.mesa < 1 || b.mesa > 3)) return falla(403, "La mesa " + b.mesa + " no es de tu rango (1 a 3).");
      if (window.__avisos.abiertas.includes(b.mesa == null ? null : b.mesa)) return { data: { ok: true, ya: true, id: "ay0", creado: "2026-11-02T15:40:00Z" }, error: null };
      window.__avisos.abiertas.push(b.mesa == null ? null : b.mesa);
      window.__avisos.ayuda = { id: "ay" + (++n), creado: "2026-11-02T15:40:00Z", mesa: b.mesa == null ? null : b.mesa, texto: b.texto || "", estado: "abierto", atendido_en: null };
      return { data: { ok: true, id: window.__avisos.ayuda.id, creado: "2026-11-02T15:40:00Z" }, error: null }; }
    if (b.action === "leido") { window.__avisos.mensajes = window.__avisos.mensajes.filter((m) => m.id !== b.id); return { data: { ok: true, marcados: 1 }, error: null }; }
    if (b.action === "nombre") {
      if (window.__avisos.nombrado) return falla(409, "Este enlace ya tiene nombre. Si hay que cambiarlo, díselo a la organización.");
      window.__avisos.nombrado = true; window.__avisos.arbitro = b.nombre.replace(/\\s+/g, " ").trim(); return { data: { ok: true, arbitro: window.__avisos.arbitro }, error: null }; }
    if (b.action === "leer") return { data: Object.assign({}, window.__avisos, { arbitro: window.__avisos.arbitro, tnr: "1529737", torneo: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino", ronda: 3, desde: 1, hasta: 3, vence: "2026-11-10T05:59:59Z",
      mesas: MESAS.map((m) => Object.assign({}, m)), marcas: marcasDe(), anotaciones: filas.filter((f) => f.tipo !== "anulacion"), anuladas: filas.filter((f) => f.tipo === "anulacion").map((f) => f.anula), lista: window.__lista.slice(), planillas: window.__planillas.slice(), finalizada: window.__finalizada, presencia: window.__presencia.slice(), tiempos: window.__tiempos.slice(), hermanas: window.__hermanas.slice(), leido_en: "2026-11-02T15:30:00Z" }), error: null };
    if (b.action === "guardar") {
      if (window.__lista.length < 2) return falla(409, "Antes de guardar resultados tienes que aprobar la revisión previa de la ronda 3 (relojes y tableros). No se guardó nada.");
      const r = b.cambios.map((c) => { const m = MESAS.find((x) => x.mesa === c.mesa); const malo = window.__falla === true; const esperado = c.valor === "D" ? "0" : c.valor;
        if (!malo) { filas.push({ id: "f" + (++n), ocurrio: "2026-11-02T15:31:00Z", mesa: c.mesa, color: null, jugador: c.blancas + " – " + c.negras, tipo: m.valor !== "0" ? "correccion" : "resultado", resultado: NOMBRE[c.valor], anterior: m.valor !== "0" ? NOMBRE[m.valor] : null, texto: "", articulo: "", enviado: true }); m.valor = esperado; }
        return { mesa: c.mesa, pedido: c.valor, quedo: malo ? m.valor : esperado, ok: !malo }; });
      return { data: { ok: r.every((x) => x.ok), ronda: 3, resultados: r, diferencias: [], leido_en: "2026-11-02T15:31:00Z", registro_error: false }, error: null }; }
    if (b.action === "anotar") {
      const m = MESAS.find((x) => x.mesa === b.mesa); const jugador = b.color === "blancas" ? m.blancas : m.negras;
      // Un reenvío con el mismo id (la tablet no supo si llegó): la base lo reconoce y no lo cuenta dos veces.
      const yaA = b.id && filas.find((x) => x.id === b.id);
      if (yaA) { const marcaA = marcasDe()[b.mesa + "|" + b.color]; return { data: { ok: true, id: yaA.id, jugador, color: b.color, marca: marcaA, aviso: b.tipo === "ilegal" ? (marcaA.ilegales >= 2 ? "segunda" : "primera") : null }, error: null }; }
      const f = { id: b.id || "f" + (++n), ocurrio: "2026-11-02T15:32:00Z", mesa: b.mesa, color: b.color, jugador, tipo: b.tipo, resultado: null, anterior: null, texto: b.texto || "", articulo: b.tipo === "ilegal" ? "7.5.5" : "", enviado: false };
      filas.push(f); const marca = marcasDe()[b.mesa + "|" + b.color];
      return { data: { ok: true, id: f.id, jugador, color: b.color, marca, aviso: b.tipo === "ilegal" ? (marca.ilegales >= 2 ? "segunda" : "primera") : null }, error: null }; }
    if (b.action === "anular") {
      const f = filas.find((x) => x.id === b.id); if (filas.some((x) => x.anula === b.id)) return falla(409, "Esa anotación ya estaba anulada.");
      filas.push({ id: "f" + (++n), ocurrio: "2026-11-02T15:33:00Z", mesa: f.mesa, color: f.color, jugador: f.jugador, tipo: "anulacion", anula: b.id });
      return { data: { ok: true, color: f.color, mesa: f.mesa, marca: marcasDe()[f.mesa + "|" + f.color] || { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null } }, error: null }; }
    return falla(400, "Acción desconocida.");
  };`;

function dobleArbitro() {
    return `(function(){
  window.__llamadas = [];
  try { window.__red = JSON.parse(sessionStorage.getItem("__red") || "null"); } catch (e) { window.__red = null; }
  ${SERVIDOR_ARBITRO}
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  window.sb = {
    auth: { getSession: () => R({ session: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    functions: { invoke: (f, o) => {
      window.__llamadas.push({ f, body: JSON.parse(JSON.stringify(o.body)) });
      // Fallas de la señal para las pruebas: window.__red = { fallar: N | siempre: true, tipo: "red" | "boot" | "h404", accion?, perderRespuesta? }
      // («perderRespuesta»: la función SÍ procesa el pedido pero la respuesta no llega, como un wifi que se cae a medias).
      const m = window.__red;
      if (m && (!m.accion || m.accion === o.body.action) && (m.siempre || m.fallar > 0)) {
        if (!m.siempre) m.fallar--;
        if (m.perderRespuesta) window.__servidor(o.body);
        const t = m.tipo || "red";
        if (t === "boot") return Promise.resolve({ data: null, error: { context: { status: 503, json: () => Promise.resolve({ code: "BOOT_ERROR", message: "Function failed to start (please check logs)" }) } } });
        if (t === "h404") return Promise.resolve({ data: null, error: { context: { status: 404, json: () => Promise.resolve({ error: "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo." }) } } });
        return Promise.resolve({ data: null, error: { message: "Failed to send a request to the Edge Function" } });
      }
      return Promise.resolve(window.__servidor(o.body)); } },
    from: () => { const q = {}; ["select","eq","order","range","insert","update"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

module.exports = { TOKEN, TOKEN_B, MESAS, SERVIDOR_ARBITRO, dobleArbitro };
