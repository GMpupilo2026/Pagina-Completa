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
  // Las banderitas (la federación de cada jugador): solo cuando la prueba enciende window.__feds, para no tocar las demás pruebas.
  const FEDS = { "Muñoz Feliz Alejandro": "CRC", "Gramajo Tovar Marco": "ESA", "Harvey Ian": "JAM", "Acuña Porras Fabio": "GUA", "Hopkins John": "TTO", "Baquero Graterol": "VEN", "Pérez Mora, Ana": "CRC", "Rojas Vega, Lía": "PAN" };
  const conFed = (m) => (window.__feds ? Object.assign({}, m, { fed_b: FEDS[m.blancas] || null, fed_n: FEDS[m.negras] || null }) : m);
  const falla = (estado, error) => ({ data: null, error: { context: { status: estado, json: () => Promise.resolve({ error }) } } });
  const marcasDe = () => {
    const anul = new Set(filas.filter((f) => f.tipo === "anulacion").map((f) => f.anula)); const out = {};
    for (const f of filas) { const lev = f.tipo === "nota" && f.articulo === "Levantó"; if (!(["ilegal", "irregularidad"].includes(f.tipo) || lev) || anul.has(f.id)) continue;
      const k = f.mesa + "|" + f.color; const m = out[k] || (out[k] = { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null, levantadas: 0, ultima_levantada: null });
      if (f.tipo === "ilegal") { m.ilegales++; m.ultima_ilegal = f.id; } else if (lev) { m.levantadas++; m.ultima_levantada = f.id; } else { m.irregularidades++; m.ultima_irregularidad = f.id; } }
    return out; };
  const NOMBRE = { "0": "sin resultado", "1": "1-0", "2": "1/2", "3": "0-1", "D": "borrado" };
  // «window.__recortar»: como la función, que manda solo las últimas 60 anotaciones (la prueba lo baja para ver el aviso).
  // Lo que la organización le mandó y lo que él pidió: la prueba lo cambia desde afuera.
  window.__avisos = { nombrado: true, arbitro: "Ana Árbitra", mensajes: [], ayuda: null, abiertas: [] };
  window.__filas = filas;
  window.__lista = []; window.__planillas = []; window.__finalizada = null; window.__presencia = []; window.__tiempos = []; window.__hermanas = [];
  const PASOS = ["relojes", "tableros"];
  window.__servidor = (b) => {
    if (b.token !== TOKEN && b.token !== TOKEN_B) return falla(404, "Este enlace no es válido. Pídele a la organización que te mande el QR de nuevo.");
    // «Ya terminé mis labores»: con el enlace concluido la función rechaza todo lo que escribe.
    if (window.__concluyo && ["guardar", "anotar", "anular", "lista", "planilla", "finalizar", "presencia", "tiempo", "ayuda", "nombre", "inicio", "presencia_todos", "presencia_ausentes"].includes(b.action)) return falla(409, "Ya concluiste tus labores: ya no puedes anotar ni guardar.");
    // «Inició la ronda» (la categoría del árbitro): como la función, guarda la hora que manda la tablet (no del futuro) o la quita.
    if (b.action === "inicio") {
      window.__inicioArgs = (window.__inicioArgs || []).concat([{ ronda: b.ronda, inicio: b.inicio === undefined ? undefined : b.inicio, quitar: b.quitar === true }]);
      if (b.ronda !== 3) return falla(409, "La ronda abierta en chess-results es la 3, no la " + b.ronda + ". Actualiza la página.");
      if (b.quitar === true) { window.__inicioRonda = null; return { data: { ok: true, ronda: 3, inicio: null }, error: null }; }
      const cuando = Math.min(Date.parse(b.inicio), Date.now());
      if (!Number.isFinite(cuando)) return falla(400, "Falta la hora a la que empezó la ronda.");
      window.__inicioRonda = { ronda: 3, inicio: new Date(cuando).toISOString(), arbitro: window.__avisos.arbitro };
      return { data: { ok: true, ronda: 3, inicio: window.__inicioRonda.inicio, arbitro: window.__avisos.arbitro }, error: null }; }
    // «Mandarme la bitácora por correo»: como la función, solo después de concluir, con un PDF de verdad y tope de dos envíos.
    if (b.action === "bitacora_correo") {
      window.__correoArgs = (window.__correoArgs || []).concat([{ correo: b.correo, pdf: String(b.pdf || "").slice(0, 8), largo: String(b.pdf || "").length }]);
      if (!window.__concluyo) return falla(409, "La bitácora se manda cuando concluyes tus labores.");
      if (!/^[^\\s@<>"',;]+@[^\\s@<>"',;]+\\.[^\\s@<>"',;]+$/.test(String(b.correo || ""))) return falla(400, "Escribe un correo válido.");
      if (window.__correoArgs.length > 2) return falla(429, "Ya mandaste tu bitácora dos veces.");
      return { data: { ok: true }, error: null }; }
    // «Modo concentración»: la tablet avisa cuándo se sale y cuándo vuelve (la función pone la hora con su reloj).
    if (b.action === "salida") { window.__salidasArgs = (window.__salidasArgs || []).concat([{ fase: b.fase, motivo: b.motivo, segundos: b.segundos }]); return { data: { ok: true }, error: null }; }
    // «Mis pareos» (el logo y la «Ronda abierta»): los pareos de SUS mesas (las de su enlace y las de su otro enlace) de todas las rondas.
    // El otro torneo (1529738) solo tiene pareadas las rondas 1 y 2.
    if (b.action === "mis_pareos") {
      window.__misPareosArgs = (window.__misPareosArgs || 0) + 1;
      if (window.__misFalla) return falla(502, "chess-results no contestó.");
      const m = (mesa, bl, ne, res) => conFed({ mesa, blancas: bl, negras: ne, resultado: res });
      return { data: { ok: true, generado: new Date().toISOString(), torneos: [
        { tnr: "1529737", nombre: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino", desde: 1, hasta: 3, abierta: 3, leida: new Date().toISOString(), rondas: [
          { ronda: 1, vivo: false, mesas: [m(1, "Pérez Mora, Ana", "Rojas Vega, Lía", "1-0"), m(2, "Solís Arce, Eva", "Mora Cruz, Isa", "½-½"), m(3, "Vargas Ríos, Zoe", "Núñez Soto, Mía", "0-1")] },
          { ronda: 2, vivo: false, mesas: [m(1, "Rojas Vega, Lía", "Solís Arce, Eva", "1-0"), m(2, "Pérez Mora, Ana", "Vargas Ríos, Zoe", "1-0"), m(3, "Mora Cruz, Isa", "Núñez Soto, Mía", "½-½")] },
          { ronda: 3, vivo: true, mesas: [m(1, "Muñoz Feliz Alejandro", "Gramajo Tovar Marco", ""), m(2, "Harvey Ian", "Acuña Porras Fabio", "1-0"), m(3, "Hopkins John", "Baquero Graterol", "½-½")] }] },
        { tnr: "1529738", nombre: "Sub-12 Absoluto", categoria: "Sub-12", rama: "Absoluto", desde: 5, hasta: 6, abierta: 2, leida: new Date().toISOString(), rondas: [
          { ronda: 1, vivo: false, mesas: [m(5, "Castro Vega, Luis", "Jiménez Mora, Sofía", "0-1"), m(6, "Solano Brenes, Diego", "Mora Ugalde, Camila", "1-0")] },
          { ronda: 2, vivo: true, mesas: [m(5, "Jiménez Mora, Sofía", "Solano Brenes, Diego", ""), m(6, "Mora Ugalde, Camila", "Castro Vega, Luis", "")] }] },
      ] }, error: null }; }
    // «¿Dónde juega?» (la lupa): TODAS las categorías en una sola respuesta. La 1529739 no tiene pareo todavía; la 1529738 trae datos viejos.
    if (b.action === "todas_mesas") {
      window.__todasArgs = (window.__todasArgs || 0) + 1;
      if (window.__avisos.todas_las_mesas === false) return falla(403, "La organización no habilitó «¿Dónde juega?» en tu enlace.");
      if (window.__todasFalla) return falla(502, "chess-results no contestó.");
      const mesas1 = MESAS.map((m) => conFed({ mesa: m.mesa, blancas: m.blancas, negras: m.negras }));
      const otras = [{ mesa: 1, blancas: "Árias Núñez, María José", negras: "Zúñiga Rojas, Pedro" }, { mesa: 2, blancas: "Castro Vega, Luis", negras: "Jiménez Mora, Ana Sofía" }, { mesa: 15, blancas: "Solano Brenes, Diego", negras: "Mora Ugalde, Camila" }];
      const ahora = new Date().toISOString();
      return { data: { ok: true, actual: "1529737", generado: ahora, categorias: [
        { tnr: "1529737", nombre: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino", ronda: 3, desde: ahora, viejo: false, error: null, mesas: mesas1 },
        { tnr: "1529738", nombre: "Sub-12 Absoluto", categoria: "Sub-12", rama: "Absoluto", ronda: 3, desde: ahora, viejo: true, error: null, mesas: otras },
        { tnr: "1529739", nombre: "Sub-14 Femenino", categoria: "Sub-14", rama: "Femenino", ronda: 0, desde: null, viejo: true, error: "Todavía no tiene la clave cargada.", mesas: [] },
      ] }, error: null }; }
    // «Todas las mesas» (el pizote, la acción vieja): la lista de categorías y, con tnr, los emparejamientos de esa categoría. La 1529739 «no tiene clave».
    if (b.action === "emparejamientos") {
      window.__emparejamientosArgs = (window.__emparejamientosArgs || []).concat([b.tnr === undefined ? null : b.tnr]);
      if (window.__avisos.todas_las_mesas === false) return falla(403, "La organización no habilitó «Todas las mesas» en tu enlace.");
      const CATS = [{ tnr: "1529737", nombre: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino" }, { tnr: "1529738", nombre: "Sub-12 Absoluto", categoria: "Sub-12", rama: "Absoluto" }, { tnr: "1529739", nombre: "Sub-14 Femenino", categoria: "Sub-14", rama: "Femenino" }];
      if (!b.tnr) return { data: { ok: true, actual: "1529737", categorias: CATS }, error: null };
      const c = CATS.find((x) => x.tnr === b.tnr);
      if (!c) return falla(404, "Esa categoría no es de este torneo.");
      if (c.tnr === "1529739") return falla(409, "La organización todavía no cargó la clave de " + c.nombre + ". Avísale.");
      const mesas = c.tnr === "1529737" ? MESAS.map((m) => ({ mesa: m.mesa, blancas: m.blancas, negras: m.negras }))
        : [{ mesa: 1, blancas: "Árias Núñez, María José", negras: "Zúñiga Rojas, Pedro" }, { mesa: 2, blancas: "Castro Vega, Luis", negras: "Jiménez Mora, Ana Sofía" }, { mesa: 15, blancas: "Solano Brenes, Diego", negras: "Mora Ugalde, Camila" }];
      return { data: { ok: true, tnr: c.tnr, nombre: c.nombre, categoria: c.categoria, rama: c.rama, ronda: 3, mesas, datos: { desde: new Date().toISOString(), viejo: false } }, error: null }; }
    if (b.action === "concluir") { if (!window.__concluyo) window.__concluyo = "2026-11-02T16:30:00Z"; return { data: { ok: true, concluyo: window.__concluyo }, error: null }; }
    if (b.action === "bitacora") {
      if (!window.__concluyo) return falla(409, "La bitácora se baja cuando concluyes tus labores.");
      return { data: { ok: true, arbitro: window.__avisos.arbitro, concluyo: window.__concluyo, generado: "2026-11-02T16:31:00Z",
        asignaciones: [{ id: "a1", tnr: "1529737", arbitro: "Ana Árbitra", mesa_desde: 1, mesa_hasta: 3 }, { id: "a2", tnr: "1529740", arbitro: "Ana Árbitra", mesa_desde: 4, mesa_hasta: 6 }],
        torneos: [{ tnr: "1529737", nombre: "Sub-10 Femenino" }, { tnr: "1529740", nombre: "Sub-12 Absoluto" }],
        inicios: [{ tnr: "1529737", ronda: 3, inicio: "2026-11-02T16:48:00Z", arbitro: "Ana Árbitra" }],
        registro: filas.map((f) => Object.assign({ tnr: "1529737", ronda: 3, asignacion_id: "a1" }, f)),
        tiempos: window.__tiempos.map((t) => Object.assign({ tnr: "1529737", ronda: 3, blancas: "A", negras: "B", asignacion_id: "a1" }, t)),
        presencia: window.__presencia.map((x) => Object.assign({ tnr: "1529737", ronda: 3, jugador: "Jugador", asignacion_id: "a1" }, x)),
        planillas: [{ tnr: "1529740", ronda: 2, mesa: 5, jugador: "C", rival: "D", subida: "2026-11-02T15:00:00Z", drive_ok: true, asignacion_id: "a2" }],
        finales: [{ ronda: 2, finalizada_en: "2026-11-02T15:40:00Z", reabierta: false, asignacion_id: "a2" }], listas: [], avisos: [] }, error: null }; }
    // «Llegaron todos» / «los ausentes»: como la función. presencia_todos pone «llegó» a todos los que no lo estén; presencia_ausentes pone
    // «no ha llegado» solo a los que no tienen marca (no pisa ninguna).
    if (b.action === "presencia_todos" || b.action === "presencia_ausentes") {
      const todos = b.action === "presencia_todos";
      window[todos ? "__todosArgs" : "__ausentesArgs"] = (window[todos ? "__todosArgs" : "__ausentesArgs"] || []).concat([{ ronda: b.ronda }]);
      if (b.ronda !== 3) return falla(409, "La ronda abierta en chess-results es la 3, no la " + b.ronda + ". Actualiza la página.");
      let n = 0;
      for (const m of MESAS) for (const color of ["blancas", "negras"]) {
        const f = window.__presencia.find((x) => x.mesa === m.mesa && x.color === color);
        if (todos) { if (f && f.presente) continue; if (f) f.presente = true; else window.__presencia.push({ mesa: m.mesa, color, presente: true, marcada: "2026-11-02T15:40:00Z" }); n++; }
        else if (!f) { window.__presencia.push({ mesa: m.mesa, color, presente: false, marcada: "2026-11-02T15:40:00Z" }); n++; }
      }
      return { data: { ok: true, marcados: n }, error: null }; }
    if (b.action === "presencia") {
      if (b.mesa < 1 || b.mesa > 3) return falla(403, "La mesa " + b.mesa + " no es de tu rango (1 a 3).");
      const llegoMs = b.ocurrio ? Date.parse(b.ocurrio) : Date.now();
      window.__presencia = window.__presencia.filter((x) => !(x.mesa === b.mesa && x.color === b.color)).concat([{ mesa: b.mesa, color: b.color, presente: b.presente, marcada: b.ocurrio ? new Date(llegoMs).toISOString() : "2026-11-02T15:51:00Z" }]);
      // «Llegó tarde»: como la función (la nota si llega más de un minuto después del inicio; «no ha llegado» la anula; una sola nota viva).
      const mP = MESAS.find((x) => x.mesa === b.mesa), jugP = b.color === "blancas" ? mP.blancas : mP.negras;
      const vivas = filas.filter((x) => x.tipo === "nota" && x.articulo === "Llegó tarde" && x.mesa === b.mesa && x.color === b.color && !filas.some((y) => y.anula === x.id));
      let tarde = null; const anuladas = [];
      if (b.presente === false) { for (const v of vivas) { filas.push({ id: "f" + (++n), ocurrio: new Date(llegoMs).toISOString(), mesa: b.mesa, color: b.color, jugador: jugP, tipo: "anulacion", anula: v.id }); anuladas.push(v.id); } }
      else if (!vivas.length && b.ocurrio) {
        const ini = window.__inicioRonda ? Date.parse(window.__inicioRonda.inicio) : Date.parse(b.inicio);
        const seg = Math.round((llegoMs - ini) / 1000);
        if (seg >= 60 && seg <= 21600) {
          const mmss = (x) => Math.floor(x / 60) + " min " + (x % 60) + " s", falta = 1800 - seg;
          tarde = { id: "f" + (++n), ocurrio: new Date(llegoMs).toISOString(), arbitro: window.__avisos.arbitro, mesa: b.mesa, color: b.color, jugador: jugP, tipo: "nota", resultado: null, anterior: null, articulo: "Llegó tarde", enviado: false, anula: null,
            texto: jugP + " (" + b.color + ") llegó tarde: " + mmss(seg) + " después del inicio de la ronda (a las 9:22 a. m.; " + (falta > 0 ? "le faltaban " + mmss(falta) + " para la incomparecencia" : "ya había pasado el tiempo de espera de 30 min") + ")." };
          filas.push(tarde);
        }
      }
      return { data: { ok: true, mesa: b.mesa, color: b.color, presente: b.presente, jugador: jugP, tarde, anuladas }, error: null }; }
    if (b.action === "tiempo") {
      const yaT = b.id && window.__tiempos.find((x) => x.id === b.id);
      if (yaT) return { data: { ok: true, id: yaT.id, ocurrio: yaT.ocurrio, jugada: yaT.jugada, repetido: true }, error: null };
      const m = MESAS.find((x) => x.mesa === b.mesa); if (!m) return falla(403, "La mesa " + b.mesa + " no es de tu rango (1 a 3).");
      if (m.valor !== "0") return falla(409, "La mesa " + b.mesa + " ya tiene resultado en chess-results.");
      if (![b.j_blancas, b.j_negras].every((j) => Number.isInteger(j) && j >= 0 && j <= 400)) return falla(400, "Las jugadas de cada color van de 0 a 400.");
      const jugada = Math.max(1, b.j_blancas, b.j_negras);
      window.__tiempos.unshift({ id: b.id || "t" + (++n), ocurrio: b.ocurrio || "2026-11-02T15:55:00Z", mesa: b.mesa, jugada, j_blancas: b.j_blancas, j_negras: b.j_negras, turno: null, t_blancas: b.t_blancas, t_negras: b.t_negras, nota: "" });
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
    if (b.action === "leer") return { data: Object.assign({}, window.__avisos, { concluyo: window.__concluyo || null, arbitro: window.__avisos.arbitro, tnr: "1529737", torneo: "Sub-10 Femenino", categoria: "Sub-10", rama: "Femenino", ronda: 3, desde: 1, hasta: 3, vence: "2026-11-10T05:59:59Z",
      mesas: MESAS.map((m) => conFed(Object.assign({}, m))), marcas: marcasDe(), anotaciones: ((an) => window.__recortar == null ? an : window.__recortar === 0 ? [] : an.slice(-window.__recortar))(filas.filter((f) => f.tipo !== "anulacion")), anuladas: filas.filter((f) => f.tipo === "anulacion").map((f) => f.anula), lista: window.__lista.slice(), planillas: window.__planillas.slice(), finalizada: window.__finalizada, presencia: window.__presencia.slice(), tiempos: window.__tiempos.slice(), hermanas: window.__hermanas.slice(), inicio_ronda: window.__inicioRonda || null, leido_en: "2026-11-02T15:30:00Z" }), error: null };
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
      const f = { id: b.id || "f" + (++n), ocurrio: "2026-11-02T15:32:00Z", mesa: b.mesa, color: b.color, jugador, tipo: b.tipo, resultado: null, anterior: null, texto: b.tipo === "nota" && b.articulo === "Levantó" ? jugador + " (" + b.color + ") se levantó de la mesa" : (b.texto || ""), articulo: b.tipo === "ilegal" ? "7.5.5" : (b.articulo || ""), enviado: false };
      filas.push(f); const marca = marcasDe()[b.mesa + "|" + b.color];
      return { data: { ok: true, id: f.id, jugador, color: b.color, marca, aviso: b.tipo === "ilegal" ? (marca.ilegales >= 2 ? "segunda" : "primera") : null }, error: null }; }
    if (b.action === "anular") {
      const f = filas.find((x) => x.id === b.id); if (filas.some((x) => x.anula === b.id)) return falla(409, "Esa anotación ya estaba anulada.");
      filas.push({ id: "f" + (++n), ocurrio: "2026-11-02T15:33:00Z", mesa: f.mesa, color: f.color, jugador: f.jugador, tipo: "anulacion", anula: b.id });
      return { data: { ok: true, color: f.color, mesa: f.mesa, marca: marcasDe()[f.mesa + "|" + f.color] || { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null, levantadas: 0, ultima_levantada: null } }, error: null }; }
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
