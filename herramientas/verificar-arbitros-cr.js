/* Comprueba en el navegador arbitros-cr.html (los árbitros de Costa Rica en
   FIDE y en chess-results), con un doble de Supabase y datos inventados de
   arbitros_cr, arbitros_cr_torneos, arbitros_cr_cargos, arbitros_cr_cr y
   arbitros_cr_cr_cargos:

   - sin licencia se ve el candado y no se piden las tablas;
   - con licencia, la lista de árbitros cuenta bien sus torneos, sus cargos
     y cuántos valen para AF y AI (con los de revisar entre paréntesis), y
     un árbitro sin torneos en los años elegidos no sale;
   - la norma por cargo: el principal, el adjunto y el árbitro llevan la del
     torneo; el asistente no vale (B.06.1, 2.4.4); el de pareos queda para
     revisar si el torneo valdría;
   - los años y el título filtran; el buscador encuentra sin tildes y por ID;
   - la ficha de un árbitro: el enlace lleva su ID, cada torneo enlaza a FIDE,
     la norma va escrita con su porqué, y el filtro de norma recorta la
     tabla;
   - chess-results: cada torneo sale una vez (el que es el mismo que uno de
     FIDE va dentro de él, con los dos enlaces), el filtro «FIDE / No FIDE»
     en la lista y en la ficha, quien solo figura en chess-results sale
     igual, quien arbitró un torneo de FIDE sin figurar en su ficha queda
     para revisar, y el que no se jugó (sin rondas) no se muestra;
   - el ranking del año: el puesto con empates, cómo le fue el año anterior
     y «Ordenar por»;
   - comparar dos árbitros: dato por dato, por año, los torneos juntos con
     el cargo de cada uno, y la dirección lleva a los dos;
   - lo que dice FIDE (arbitros_cr_fide): activo, inactivo o no figura, el
     filtro «En FIDE», el AN que el perfil no dice, y la fecha exacta del AF:
     desde ella sus torneos cuentan para AI y ya no para AF (con solo el año,
     el mismo año queda para revisar);
   - «Para pedir el título» (la ruta de B.06.1 punto por punto) y su Excel,
     «Quiénes pueden pedir el título», el historial en FIDE (solicitudes y
     seminarios), «La actividad en FIDE» y «Por identificar»;
   - «Solo con Elo nacional»: el ritmo que la ficha no dice sale del texto
     del control de tiempo (js/ritmo-control.js, probado con veinte textos de
     verdad), la columna «Elo nacional» de cada árbitro y en el ranking, y
     los ritmos por revisar a mano (herramientas/arbitros-cr/ritmos-raros.js,
     con sus correcciones bien escritas);
   - «Por vencer»: hoy vacía, y con el reloj en julio de 2028 la norma y el
     seminario de Luis, lo que vence antes primero;
   - las tablas se piden de mil en mil (range), y la lista de árbitros cabe
     a lo ancho en 1280 px.

   Ver «Árbitros de Costa Rica en FIDE» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-arbitros-cr.js   (con el sitio en el 8777) */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

const ARBITROS = [
    // El Consejo le aprobó el AF a Óscar el 15/04/2024 (ARBITROS_FIDE): su
    // norma de AI de 2023 no cuenta, la del 01/05/2024 (16 días después,
    // antes de la fecha que FIDE anota en el perfil) queda para revisar y la
    // de 2025 sí (y esa ya no cuenta para AF).
    { fide_id: 6500001, nombre: "Ángulo Prueba, Óscar", titulo: "IA", titulo_detalle: "Árbitro FIDE (2024), Árbitro Internacional (2026)" },
    // De Ana solo se sabe el año del AF: lo de 2024 queda para revisar.
    { fide_id: 6500002, nombre: "Soto Prueba, Ana", titulo: "FA", titulo_detalle: "Árbitro FIDE (2024), categoría D" },
    { fide_id: 6500003, nombre: "Rojas Prueba, Luis", titulo: "", titulo_detalle: "" },
    { fide_id: 6500004, nombre: "Viejo Prueba, Juan", titulo: "AN", titulo_detalle: "" },
    { fide_id: 6500005, nombre: "Quiros Prueba, Eduardo", titulo: "", titulo_detalle: "", solo_chess_results: true },
];
// La lista oficial de árbitros de FIDE: Óscar activo con la fecha de su AF,
// Ana inactiva y sin licencia, Luis como Árbitro Nacional (su perfil no lo
// dice); Juan y Eduardo no figuran.
const ARBITROS_FIDE = [
    { fide_id: 6500001, titulo: "IA", inactivo: false, categoria: "D", licencia: "IA-D", af_fecha: "2024-04-15", af_consejo: "2.ª reunión del Consejo de FIDE de 2024 (en línea)", af_perfil: null, ia_fecha: null, ia_consejo: "", lista: "2026-10-12",
      // Una solicitud de AI rechazada y otra aprobada, y su seminario de AI.
      solicitudes: [
          { titulo: "IA", fecha: "2025-04-02", consejo: "1.ª reunión del Consejo de FIDE de 2025 (en línea)", veredicto: "rechazada", motivo: "Only 3 tournament norms",
            torneos: ["30.08-09.09.24 18th IA Seminar", "26.12-30.12.24 San Jose CRC Metropolitano SS 110 157 9 8 01.25"], fuente: "https://arbiters.fide.com/informe-1.pdf" },
          { titulo: "IA", fecha: "2026-08-23", consejo: "2.ª reunión del Consejo de FIDE de 2026 (en línea)", veredicto: "aprobada", motivo: "",
            torneos: ["30.08-09.09.25 18th IA Seminar"], fuente: "https://arbiters.fide.com/informe-2.pdf" },
      ],
      seminarios: [{ tipo: "IA", seminario: "18th IACS Internet Based Aug 2025 (ARB)", mes: "2025-09", fecha: "2025-09-09", fuente: "https://arbiters.fide.com/informe-2.pdf",
        evento: "https://arbiters.fide.com/news/event/18th-iacs" },
        // Uno viejo de AF que sale solo del informe del seminario (sin informe al Consejo).
        { tipo: "FA", seminario: "44th Internet Based Dec 2015 (CCA)", mes: "2015-12", fecha: "2015-12-06", informe: "https://arbiters.fide.com/news/1896" }] },
    // Pedro está en la lista de la Federación y nunca arbitró: no sale en la
    // lista de la herramienta, sí en la comparación con la Federación.
    { fide_id: 6500006, nombre: "Nuevo Prueba, Pedro", titulo: "NA", inactivo: false, categoria: "", licencia: "NA", categoria_nacional: "C", fca_leida: "2026-10-16", af_fecha: null, af_consejo: "", ia_fecha: null, ia_consejo: "", lista: "2026-10-12", solicitudes: [], seminarios: [] },
    // Ana figuraba en una lista vieja de la Federación: ya no está en ella.
    { fide_id: 6500002, titulo: "FA", inactivo: true, categoria: "D", licencia: "No", fca_leida: "2025-01-01", af_fecha: null, af_consejo: "", ia_fecha: null, ia_consejo: "", lista: "2026-10-12", solicitudes: [], seminarios: [] },
    // Luis tiene su seminario de AF (vale cuatro años) y una norma de las tres.
    { fide_id: 6500003, titulo: "NA", inactivo: false, categoria: "", licencia: "NA", categoria_nacional: "B", fca_leida: "2026-10-16", af_fecha: null, af_consejo: "", ia_fecha: null, ia_consejo: "", lista: "2026-10-12", solicitudes: [],
      seminarios: [{ tipo: "FA", seminario: "189th Internet Based Jun 2025 (CCA)", mes: "2025-06", fecha: "2025-06-29", fuente: "https://arbiters.fide.com/informe-3.pdf" }] },
];
// Las celdas de chess-results en que no se reconoce a nadie.
const SIN_ID = [
    { texto: "AF Josué Prueba", roles: ["ap", "arb"], torneos: 3, primero: "2011-05-09", ultimo: "2016-08-27", claves: [236537, 236115], ids: [] },
    { texto: "AI Fulano Prueba (8400687)", roles: ["ap"], torneos: 1, primero: "2017-07-01", ultimo: "2017-07-01", claves: [292598], ids: ["8400687"] },
];
const T = (id, nombre, inicio, af, ai) => ({
    id, nombre, ciudad: "San José", pais: "Costa Rica", inicio, fin: inicio, sistema: "s", ritmo: "Standard",
    jugadores: 40, con_elo: 30, contados: 28, rondas: 9, federaciones: 3, valorado: "enero de 2025",
    af_estado: af, af_detalle: "porque " + af, ai_estado: ai, ai_detalle: "porque " + ai,
});
const TORNEOS = [
    T(101, "Abierto Internacional 2025", "2025-01-10", "si", "opcion"),
    T(102, "Nacional Absoluto 2024", "2024-05-01", "si", "si"),
    T(103, "Blitz de prueba 2024", "2024-08-01", "no", "no"),
    T(104, "Internacional con titulados 2023", "2023-03-01", "si", "revisar"),
    T(105, "Torneo de 2015", "2015-06-01", "si", "no"),
];
const CARGOS = [
    { torneo_id: 101, fide_id: 6500001, cargo: "Chief" },
    { torneo_id: 102, fide_id: 6500001, cargo: "Chief" },
    { torneo_id: 103, fide_id: 6500001, cargo: "Dep. Chief" },
    { torneo_id: 104, fide_id: 6500001, cargo: "Arbiter" },
    { torneo_id: 101, fide_id: 6500002, cargo: "Assistant" },   // el asistente no vale
    { torneo_id: 102, fide_id: 6500002, cargo: "Pairings" },    // el de pareos queda para revisar
    { torneo_id: 104, fide_id: 6500003, cargo: "Dep. Chief" },
    { torneo_id: 105, fide_id: 6500004, cargo: "Chief" },       // solo 2015
];

const CR = [
    // El mismo torneo que el 101 de FIDE: no tiene que salir dos veces.
    { clave: 900001, nombre: "Abierto Internacional 2025 (101)", inicio: "2025-01-10", fin: "2025-01-12", lugar: "San José", control: "90 min", rondas: 9, jugadores: 40, fide_torneo: 101 },
    { clave: 900002, nombre: "Abierto del club 2024", inicio: "2024-07-10", fin: "2024-07-12", lugar: "Heredia", control: "60 min", rondas: 5, jugadores: 22, fide_torneo: null },
    { clave: 900003, nombre: "Torneo escolar 2019", inicio: "2019-05-01", fin: "2019-05-01", lugar: "", control: "", rondas: 5, jugadores: 12, fide_torneo: null },
    // El mismo que el 102, donde Eduardo arbitró sin figurar en la ficha de FIDE.
    { clave: 900004, nombre: "Nacional Absoluto 2024", inicio: "2024-05-01", fin: "2024-05-01", lugar: "San José", control: "90 min", rondas: 9, jugadores: 40, fide_torneo: 102 },
    // Sin rondas: no se jugó y no se muestra.
    // El mismo día que el 102: un festival con él.
    { clave: 900006, nombre: "Nacional Sub-16 2024", inicio: "2024-05-01", fin: "2024-05-03", lugar: "San José", control: "15 min + 10 seg", rondas: 7, jugadores: 18, fide_torneo: null },
    // En el extranjero: sale de chess-results, sin cruzar con FIDE.
    { clave: 900007, nombre: "Abierto Internacional de Panamá 2024", inicio: "2024-11-10", fin: "2024-11-15", lugar: "Ciudad de Panamá", control: "90 min + 30 s", rondas: 9, jugadores: 60, fide_torneo: null, pais: "PAN" },
    { clave: 900005, nombre: "Torneo que no se jugó 2024", inicio: "2024-09-01", fin: "2024-09-01", lugar: "", control: "", rondas: 0, jugadores: 10, fide_torneo: null },
];
// «Cálculo de elo» de chess-results: el del club, solo con el nacional y sin
// el ritmo escrito y un control de 60 minutos (clásico: cuenta); el Sub-16 dice nacional, tampoco
// escribe el ritmo y su control, 15 min + 10 seg, es rápido (no cuenta: el Elo nacional es solo del
// clásico); el 900003 no se leyó (sin dato: no entra en «solo nacional»); el
// de Panamá (afuera) no cuenta. El «sin Elo» va en una prueba aparte.
const ELO_CR = [
    { clave: 900002, calculo: "nacional", ritmo: null }, { clave: 900006, calculo: "nacional", ritmo: null },
    { clave: 900007, calculo: "nacional", ritmo: "clasico" },
];
// La categoría y los cursos que registra administración (arbitros_cr_formacion): vacía de entrada.
const FORMACION = [];
// Los correos para los avisos (solo administración) y lo que se vence en 90 días, como lo da arbitros_cr_por_vencer().
const CONTACTOS = [];
// Quien falleció lleva el lazo de «En memoria» (arbitros_cr_memoria): Juan, solo en su bloque.
const MEMORIA = [];
// Lo que hicieron en un seminario además de aprobarlo (arbitros_cr_seminario_roles):
// Óscar fue conferencista de uno de AI y asistente local de otro; Juan, que no
// está en la lista de árbitros de FIDE, aprobó uno de AF.
const ROLES_SEMINARIO = [
    { fide_id: 6500001, rol: "conferencista", tipo: "IA", seminario: "9th IACS Internet Based Nov 2024 (ARB)", fecha: "2024-11-17", informe: "https://arbiters.fide.com/news/9673", detalle: "con Laurent Freyd (FRA)" },
    { fide_id: 6500001, rol: "asistente", tipo: "FA", seminario: "215th Internet Based Jan 2026 (CRC)", fecha: "2026-01-12", informe: "https://arbiters.fide.com/news/10729", detalle: "local" },
    { fide_id: 6500004, rol: "aprobo", tipo: "FA", seminario: "11th Internet Based Oct 2011 (WOM)", fecha: "2011-10-09", informe: "https://arbiters.fide.com/news/387", detalle: "" },
];
const POR_VENCER = [
    { fide_id: 6500004, nombre: "Viejo Prueba, Juan", correo: null, avisos: false, clave: "actividad:2026-11-20", que: "Quedas inactivo en la Federación", vence: "2026-11-20", avisado: null },
    { fide_id: 6500003, nombre: "Rojas Prueba, Luis", correo: "luis@correo.com", avisos: true, clave: "norma-af:104", que: "La norma de AF deja de contar", vence: "2026-12-01", avisado: null },
    { fide_id: 6500003, nombre: "Rojas Prueba, Luis", correo: "luis@correo.com", avisos: true, clave: "seminario:2026-12-20", que: "El seminario deja de valer", vence: "2026-12-20", avisado: "2026-10-01T14:07:00Z" },
];
const CR_CARGOS = [
    { clave: 900001, fide_id: 6500001, rol: "ap" },
    { clave: 900002, fide_id: 6500001, rol: "dir" },
    { clave: 900002, fide_id: 6500005, rol: "ap" },
    { clave: 900002, fide_id: 6500005, rol: "dir" },
    { clave: 900003, fide_id: 6500005, rol: "arb" },
    { clave: 900004, fide_id: 6500005, rol: "arb" },
    { clave: 900006, fide_id: 6500001, rol: "arb" },
    { clave: 900007, fide_id: 6500002, rol: "arb" },
    { clave: 900005, fide_id: 6500005, rol: "ap" },
    { clave: 900005, fide_id: 6500001, rol: "ap" },
];

function doble(tieneLicencia, admin) {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const TABLAS = ${JSON.stringify({ arbitros_cr: ARBITROS, arbitros_cr_torneos: TORNEOS, arbitros_cr_cargos: CARGOS, arbitros_cr_cr: CR.map((c) => ({ pais: "CRC", ...c })), arbitros_cr_cr_cargos: CR_CARGOS, arbitros_cr_fide: ARBITROS_FIDE, arbitros_cr_sin_id: SIN_ID, arbitros_cr_cr_elo: ELO_CR, arbitros_cr_formacion: FORMACION, arbitros_cr_contacto: CONTACTOS, arbitros_cr_memoria: MEMORIA, arbitros_cr_seminario_roles: ROLES_SEMINARIO })};
  const POR_VENCER = ${JSON.stringify(POR_VENCER)};
  const LICENCIA = ${tieneLicencia ? "true" : "false"};
  window.__pedidos = [];
  function respuesta(data, error) { return Promise.resolve({ data, error: error || null }); }
  TABLAS.arbitros_cr_normas_revision = [];
  TABLAS.arbitros_cr_solicitudes_enviadas = [];
  // Lo que pone la base al insertar, y su índice único, por tabla.
  const ALTA = {
    arbitros_cr_normas_revision: { claves: ["creada_por", "fide_id", "cual", "torneo_id"], omision: { firmante_fide_id: null, firmante_nombre: "", archivo: null, nombre_archivo: "" } },
    arbitros_cr_solicitudes_enviadas: { claves: ["creada_por", "fide_id", "cual", "enviada"], omision: { resultado: "pendiente", consejo: "", motivo: "", normas: [] } },
    // Como el índice único de la base: una fila por categoría y árbitro (los cursos no chocan: su categoría es null).
    arbitros_cr_formacion: { claves: ["fide_id", "categoria", "_categoria"], omision: { categoria: null, horas: null, nota: null, detalle: "" } },
    arbitros_cr_memoria: { claves: ["fide_id"], omision: { nota: "" } },
  };
  const ADMIN = ${admin ? "true" : "false"};
  window.__archivos = {};
  let nuevas = 0;
  function consulta(tabla) {
    // Los filtros se anotan y se aplican en el RESOLVER, de verdad.
    const q = { _desde: 0, _hasta: 999, _filtros: [], _op: "select" };
    ["select", "order", "in", "limit"].forEach((m) => { q[m] = () => q; });
    q.eq = (c, v) => { q._filtros.push([c, v]); return q; };
    q.insert = (fila) => { q._op = "insert"; q._fila = fila; return q; };
    q.delete = () => { q._op = "delete"; return q; };
    q.update = (cambio) => { q._op = "update"; q._cambio = cambio; return q; };
    q.upsert = (fila, opciones) => { q._op = "upsert"; q._fila = fila; q._clave = (opciones && opciones.onConflict || "").split(","); return q; };
    q.single = () => { q._single = true; return q; };
    q.range = (a, b) => { q._desde = a; q._hasta = b; return q; };
    q.then = (ok, mal) => {
      window.__pedidos.push(tabla + " " + (q._op === "select" ? q._desde + "-" + q._hasta : q._op));
      const pasa = (f) => q._filtros.every(([c, v]) => f[c] === v);
      let r;
      if (!LICENCIA) r = { data: q._op === "select" ? [] : null, error: q._op === "select" ? null : { message: "sin permiso" } };   // la RLS
      else if (["arbitros_cr_formacion", "arbitros_cr_memoria"].includes(tabla) && q._op !== "select" && !ADMIN) r = { data: null, error: { message: "new row violates row-level security policy" } };   // solo administración escribe
      else if (q._op === "insert") {
        const alta = ALTA[tabla];
        const fila = { id: "n" + (++nuevas), creada_por: "yo", creada: "2026-10-16T04:00:00Z", ...alta.omision, ...q._fila };
        if (tabla === "arbitros_cr_formacion") fila._categoria = fila.tipo === "categoria" ? "si" : fila.id;
        const rep = TABLAS[tabla].some((f) => alta.claves.every((k) => f[k] === fila[k]));
        // Como el trigger de la base: sin la versión de la privacidad, no entra.
        if (tabla === "arbitros_cr_normas_revision" && !/^\\d{4}-\\d{2}-\\d{2}$/.test(fila.privacidad_version || "")) r = { data: null, error: { message: "Para subir una norma hay que aceptar la Política de privacidad.", code: "23514" } };
        else if (rep) r = { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        else { TABLAS[tabla].push(fila); r = { data: q._single ? fila : [fila], error: null }; }
      } else if (q._op === "upsert") {
        if (tabla === "arbitros_cr_contacto" && !ADMIN) r = { data: null, error: { message: "new row violates row-level security policy" } };
        else { TABLAS[tabla] = (TABLAS[tabla] || []).filter((f) => !q._clave.every((k) => f[k] === q._fila[k])).concat({ ...q._fila }); r = { data: null, error: null }; }
      } else if (q._op === "update") { for (const f of TABLAS[tabla].filter(pasa)) Object.assign(f, q._cambio); r = { data: null, error: null }; }
      else if (q._op === "delete") { TABLAS[tabla] = TABLAS[tabla].filter((f) => !pasa(f)); r = { data: null, error: null }; }
      else r = { data: (TABLAS[tabla] || []).filter(pasa).slice(q._desde, q._hasta + 1), error: null };
      return Promise.resolve(r).then(ok, mal);
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => respuesta({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => respuesta({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => respuesta({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => respuesta({ all: [], totp: [] }) },
    },
    rpc: (nombre, args) => {
      window.__pedidos.push(nombre);
      if (nombre === "tengo_herramienta") return respuesta(LICENCIA && args.p_herramienta === "arbitros-cr");
      if (nombre === "soy_admin") return respuesta(ADMIN);
      if (nombre === "arbitros_cr_por_vencer") return ADMIN ? respuesta(POR_VENCER) : respuesta(null, { message: "Solo administración ve los avisos de los árbitros" });
      return respuesta(null);
    },
    from: (t) => consulta(t),
    storage: { from: (bucket) => ({
      upload: (ruta, archivo) => { window.__archivos[bucket + "/" + ruta] = archivo.name; return respuesta({ path: ruta }); },
      remove: (rutas) => { for (const r of rutas) delete window.__archivos[bucket + "/" + r]; return respuesta([]); },
      createSignedUrl: (ruta) => respuesta({ signedUrl: "about:blank#" + ruta }),
    }) },
    functions: { invoke: () => respuesta(null) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
  };
  window.supabase = { createClient: () => window.sb };
})();`;
}

async function abrir(browser, ruta, tieneLicencia, reloj, admin) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    if (reloj) await ctx.clock.setFixedTime(new Date(reloj));
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(tieneLicencia, admin) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { console.log("  ✗ error en la página: " + e.message); fallos++; });
    await p.goto(BASE + "/" + ruta, { waitUntil: "load" });
    return { ctx, p };
}
const visible = (p, sel) => p.$eval(sel, (e) => e.checkVisibility());
const filas = (p, sel) => p.$$eval(sel + " tbody tr", (trs) => trs.map((t) => [...t.cells].map((c) => c.textContent.replace(/\s+/g, " ").trim())));
const porNombre = (m) => Object.fromEntries(m.map((f) => [f[0], f]));

(async () => {
    console.log("=== El ritmo leído del control de tiempo (js/ritmo-control.js) ===");
    const RitmoControl = require("../js/ritmo-control.js");
    // Textos tal como vienen en chess-results; la cuenta de FIDE: minutos + incremento × 60 jugadas.
    const CONTROLES = [
        ["30 min + 30 s from move 1", "", "clasico"], ["90min+30sec/mov", "", "clasico"], ["2 horas para toda la partida", "", "clasico"],
        ["1:30 +30 sec por jugada", "", "clasico"], ["90+30 min", "", "clasico"], ["30 minutes and 30 minutes increment", "", "clasico"],
        ["30 minutos y 30 segundos", "", "clasico"], ["U18, U16, U14 y U12: 60min + 30 seg; U10 y U8: 30 min + 30 seg", "", "clasico"],
        ["40 min + 30 seg (reloj mecánico 1h + 10 min)", "", "clasico"], ["15 min + 10 seg", "", "rapido"], ["15+30", "", "rapido"],
        ["40 min finish", "", "rapido"], ["20 min por jugador", "", "rapido"], ["3 min + 2 seg", "", "blitz"], ["3+2", "", "blitz"],
        ["cuatro minutos por jugador mas un minuto por categoria", "", "blitz"], ["5 minutos para toda la partida por jugador", "", "blitz"],
        ["Pendiente", "BLITZ Equipo Infantil", "blitz"], [".", "Torneo Rápido de la feria", "rapido"], ["Pendiente", "Eliminatoria JDN 2018", null],
    ];
    igual("cada control sale con su ritmo (y sin tiempo legible, el nombre; sin nada, no sabe)",
        CONTROLES.filter(([c, n, r]) => RitmoControl.deducir(c, n) !== r).map(([c, n]) => [c, RitmoControl.deducir(c, n)]), []);

    console.log("\n=== Los ritmos por revisar a mano (herramientas/arbitros-cr/ritmos-raros.js) ===");
    const { ritmosRaros } = require("./arbitros-cr/ritmos-raros.js");
    const DE_PRUEBA = new Map([
        [1, { nombre: "Ficha blitz, control clásico", control: "30 min + 30 seg", rondas: "7", inicio: "2020/11/21" }],
        [2, { nombre: "Ficha clásico, control blitz", control: "3 min + 2 seg", rondas: "7", inicio: "2021/01/01" }],
        [3, { nombre: "Sin ficha, 15 + 30", control: "15+30", rondas: "5", inicio: "2022/01/01" }],
        [4, { nombre: "Sin ficha ni tiempo", control: "Pendiente", rondas: "5", inicio: "2023/01/01" }],
        [5, { nombre: "Sin ficha, 30 + 30 (clásico sin duda)", control: "30+30", rondas: "5", inicio: "2024/01/01" }],
        [6, { nombre: "Ya revisado", control: "30+30", rondas: "5", inicio: "2025/01/01" }],
        [7, { nombre: "No se jugó", control: "Pendiente", rondas: "0", inicio: "2025/02/01" }],
        [8, { nombre: "Sin Elo nacional", control: "Pendiente", rondas: "5", inicio: "2025/03/01" }],
        [9, { nombre: "Blitz de la feria", control: "Pendiente", rondas: "5", inicio: "2025/04/01" }],
    ]);
    const ELO_PRUEBA = [[1, "nacional", "blitz"], [2, "nacional", "clasico"], [3, "nacional", null], [4, "nacional", null], [5, "nacional", null],
        [6, "nacional", "blitz"], [7, "nacional", null], [8, "ninguno", null], [9, "nacional", null]];
    igual("salen la ficha que contradice al control (en los dos sentidos), el de 40 a 59 minutos sin ficha y el que no se puede leer; no el clásico sin duda, el ya revisado, el que no se jugó, el que no es solo nacional ni el que dice «Blitz» en el nombre",
        ritmosRaros(ELO_PRUEBA, DE_PRUEBA, [6]).map((r) => r.clave), [4, 3, 2, 1]);
    const CORREGIR_RITMO = require("./datos/arbitros-cr-ritmo-corregir.json").corregir;
    const conDatos = new Set(require("./datos/arbitros-cr-calculo-elo.json").torneos.map(([c]) => c));
    igual(`las ${CORREGIR_RITMO.length} correcciones a mano tienen clave de un torneo leído, un ritmo que existe y su motivo, sin repetir`,
        [CORREGIR_RITMO.filter((c) => !Number.isInteger(c.clave) || !conDatos.has(c.clave) || !["clasico", "rapido", "blitz"].includes(c.ritmo) || !(c.motivo || "").trim()).map((c) => c.clave),
         new Set(CORREGIR_RITMO.map((c) => c.clave)).size === CORREGIR_RITMO.length], [[], true]);

    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, "arbitros-cr.html", false);
    await p.waitForFunction(() => !document.getElementById("loading").checkVisibility());
    igual("se ve el candado y no la página", [await visible(p, "#denegado"), await visible(p, "#app")], [true, false]);
    igual("no pide las tablas", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("arbitros_cr")).length), 0);
    await ctx.close();

    console.log("\n=== Con licencia: la lista de árbitros ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    // Con sus 19 columnas, la lista cabe en una portátil (1280 px, el ancho
    // que abre Playwright) sin barra de lado.
    igual("la lista de árbitros cabe a lo ancho en 1280 px", await p.evaluate(() => {
        const t = document.getElementById("tabla-arbitros");
        return window.innerWidth === 1280 && t.scrollWidth <= t.parentElement.clientWidth;
    }), true);
    igual("pide cada tabla de mil en mil", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("arbitros_cr")).sort()),
        ["arbitros_cr 0-999", "arbitros_cr_cargos 0-999", "arbitros_cr_cr 0-999", "arbitros_cr_cr_cargos 0-999", "arbitros_cr_cr_elo 0-999", "arbitros_cr_fide 0-999", "arbitros_cr_formacion 0-999", "arbitros_cr_memoria 0-999", "arbitros_cr_seminario_roles 0-999", "arbitros_cr_sin_id 0-999", "arbitros_cr_torneos 0-999"]);
    let m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("los cinco árbitros salen (todos los años), también quien solo está en chess-results", Object.keys(m).sort(),
        ["Ángulo Prueba, Óscar", "Quiros Prueba, Eduardo", "Rojas Prueba, Luis", "Soto Prueba, Ana", "Viejo Prueba, Juan"].sort());
    // Óscar: 4 de FIDE (el 900001 es el mismo que el 101: no suma) y 2 que no (900002, director; 900006, árbitro); el 900005 no se jugó.
    // AF del Consejo el 15/04/2024: el de 2023 no cuenta para AI; el del 01/05/2024 queda para revisar; el de 2025 vale para AI y ya no para AF.
    igual("Óscar: activo, 6 torneos (4 FIDE, 2 no), 2 principal, 1 adjunto, 2 árbitro, AF 2, AI 2 (1 para revisar: el de 16 días después del Consejo), del 01/03/2023 al 10/01/2025",
        m["Ángulo Prueba, Óscar"].slice(1), ["IA", "2024", "2026", "Activo", "6", "4", "2", "1", "0", "2", "1", "2", "2", "2 (1)", "Ya es AF", "Ya es AI", "01/03/2023", "10/01/2025"]);
    // Eduardo: el 900004 es el 102 de FIDE (vale, pero no figura en la ficha de FIDE: revisar); 900002 y 900003 no son de FIDE.
    igual("Eduardo: 3 torneos (1 FIDE para revisar, 2 no), sin AF no le vale ninguno para AI, último 10/07/2024",
        m["Quiros Prueba, Eduardo"].slice(1), ["—", "—", "—", "No figura", "3", "1", "2", "1", "0", "1", "0", "2", "1 (1)", "0", "0 de 3", "0 de 4", "01/05/2019", "10/07/2024"]);
    igual("Ana: el asistente no vale, el de pareos queda para revisar (AF 1 (1), AI 1 (1)) y su torneo en Panamá cuenta en el extranjero",
        m["Soto Prueba, Ana"].slice(1), ["FA", "2024", "—", "Inactivo", "3", "2", "1", "0", "1", "0", "0", "1", "1 (1)", "1 (1)", "Ya es AF", "0 de 4", "01/05/2024", "10/01/2025"]);
    const luis = porNombre(await filas(p, "#tabla-arbitros"))["Rojas Prueba, Luis"];
    igual("Luis: Árbitro Nacional por la lista de FIDE (su perfil no lo dice), categoría B por la de la Federación, activo, «Hoy para AF» 1 de 3", [luis[1], luis[2], luis[4], luis[15]], ["AN-B", "—", "Activo", "1 de 3"]);
    await p.selectOption("#titulo", "AN-B");
    igual("el filtro «Árbitro Nacional, categoría B» deja solo a Luis", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))), ["Rojas Prueba, Luis"]);
    await p.selectOption("#titulo", "AN-A");
    igual("y con la A, nadie", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))), []);
    await p.selectOption("#titulo", "AN");
    igual("«Árbitro Nacional (AN)» sigue juntando todas las categorías, también a Juan, que no tiene", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))).sort(), ["Rojas Prueba, Luis", "Viejo Prueba, Juan"]);
    await p.selectOption("#titulo", "");
    igual("«AF desde» y «AI desde»: el año de cada título, el de su perfil de FIDE (sin título, «—»)",
        ["Ángulo Prueba, Óscar", "Soto Prueba, Ana", "Rojas Prueba, Luis"].map((n) => m[n].slice(2, 4)), [["2024", "2026"], ["2024", "—"], ["—", "—"]]);
    await p.click("#tabla-arbitros button[data-col='anioAi']");
    igual("ordenada por «AI desde»: el AI primero y los que no lo tienen al final, en los dos sentidos",
        [(await filas(p, "#tabla-arbitros"))[0][0], (await filas(p, "#tabla-arbitros")).at(-1)[3]], ["Ángulo Prueba, Óscar", "—"]);
    await p.click("#tabla-arbitros button[data-col='anioAi']");
    igual("y al revés también", [(await filas(p, "#tabla-arbitros"))[0][0], (await filas(p, "#tabla-arbitros")).at(-1)[3]], ["Ángulo Prueba, Óscar", "—"]);
    await p.click("#tabla-arbitros button[data-col='torneos']");
    await p.selectOption("#en-fide", "inactivo");
    igual("«En FIDE: inactivos» deja solo a Ana", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))), ["Soto Prueba, Ana"]);
    await p.selectOption("#en-fide", "no");
    igual("«No figuran» deja a Juan y Eduardo", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))).sort(), ["Quiros Prueba, Eduardo", "Viejo Prueba, Juan"]);
    await p.selectOption("#en-fide", "");
    igual("«Quiénes pueden pedir el título»: Luis, para el AF, con su seminario y lo que le falta", await filas(p, "#tabla-solicitudes"),
        [["Rojas Prueba, Luis", "AF", "1 de 3", "Vigente hasta 29/06/2029", "Le falta: normas de torneo"]]);
    igual("«Por vencer»: hoy no vence nada en doce meses (la norma de Luis cuenta hasta 2029)", [await filas(p, "#tabla-por-vencer"), await p.$eval("#por-vencer-cuenta", (e) => e.textContent)],
        [[], "Nada de lo que alguien junta para su siguiente título vence en los próximos 12 meses."]);
    igual("«La actividad en FIDE»: Ana inactiva primero, Óscar activo por lo menos hasta cuatro años después de su seminario de AI", await filas(p, "#tabla-actividad-fide"),
        [["Soto Prueba, Ana", "FA", "Inactivo", "—"], ["Ángulo Prueba, Óscar", "IA", "Activo", "09/09/2029"]]);
    igual("«La lista de la Federación»: Luis está en ella y no arbitra desde 2023, y Pedro, que nunca arbitró, también sale; Ana figuraba en una lista vieja y ya no cuenta; nadie arbitra seguido sin estar",
        [await filas(p, "#tabla-fca-quietos"), await filas(p, "#tabla-fca-fuera"), await p.$eval("#fca-cuenta", (e) => e.textContent)],
        [[["Rojas Prueba, Luis", "AN-B", "01/03/2023"], ["Nuevo Prueba, Pedro", "AN-C", "Ninguno"]], [["Nadie arbitra seguido sin estar en la lista."]],
         "Lista de la Federación leída el 16/10/2026: 2 árbitros. 2 no arbitraron en Costa Rica desde 2024; 0 arbitraron 3 o más torneos desde 2025 sin estar en ella."]);
    await p.evaluate(() => { window.TablaExcel.bajar = (nombre, hojas) => { window.__excel = { nombre, hojas }; }; });
    await p.selectOption("#tipo", "nacional");
    await p.click("#lista-excel");
    const excelLista = await p.evaluate(() => window.__excel);
    igual("«Descargar la lista en Excel»: lo que se ve con los filtros (solo Elo nacional: Óscar y Eduardo), con su columna y una hoja con los filtros",
        [excelLista.nombre, excelLista.hojas[0].filas.length, excelLista.hojas[0].filas[0].includes("Solo Elo nacional"),
         excelLista.hojas[0].filas.slice(1).map((f) => [f[0], f[9]]), excelLista.hojas[1].filas.find((f) => f[0] === "Torneos")],
        ["arbitros-cr.xlsx", 3, true, [["Ángulo Prueba, Óscar", 1], ["Quiros Prueba, Eduardo", 1]], ["Torneos", "Solo con Elo nacional"]]);
    await p.selectOption("#tipo", "");
    igual("«Por identificar»: quienes no figuran en FIDE, el de más torneos primero", (await filas(p, "#tabla-no-fide")).map((f) => [f[0], f[3]]), [["Quiros Prueba, Eduardo", "3"], ["Viejo Prueba, Juan", "1"]]);
    igual("y los nombres de chess-results sin reconocer, con su cargo, sus ID y enlaces a los torneos", await filas(p, "#tabla-sin-id"),
        [["AF Josué Prueba", "principal, árbitro", "3", "09/05/2011 al 27/08/2016", "—", "236537 · 236115"], ["AI Fulano Prueba (8400687)", "principal", "1", "01/07/2017 al 01/07/2017", "8400687", "292598"]]);
    igual("los ejemplos enlazan a chess-results", await p.$eval("#tabla-sin-id tbody a", (a) => a.href), "https://chess-results.com/tnr236537.aspx?lan=2");
    const actividad = await filas(p, "#actividad");
    igual("«Torneos por año» en la lista: cada torneo una vez, el año más nuevo primero, con FIDE, no FIDE y extranjero",
        actividad.map((f) => [f[0], f[1].trim(), f[2], f[3], f[4]]),
        [["2025", "1", "1", "0", "0"], ["2024", "5", "2", "3", "1"], ["2023", "1", "1", "0", "0"], ["2019", "1", "0", "1", "0"], ["2015", "1", "1", "0", "0"]]);
    igual("la barra no va sola: el número está escrito y la barra se ve", [await visible(p, "#actividad tbody tr:first-child td span[aria-hidden]")], [true]);
    // El ranking arranca en el último año con torneos (2025): Óscar y Ana
    // empatan con 1; en 2024 Óscar fue 1.º y Ana 2.ª (empatada con Eduardo).
    igual("el ranking arranca en 2025: Óscar y Ana comparten el 1.º, y cómo les fue en 2024",
        [await p.$eval("#ranking-anio", (e) => e.value), await filas(p, "#tabla-ranking")],
        ["2025", [["1.º", "Ángulo Prueba, Óscar", "1", "1", "1", "0", "0", "0", "Igual (1.º)"], ["1.º", "Soto Prueba, Ana", "1", "0", "1", "0", "0", "0", "Sube 1 (era 2.º)"]]]);
    await p.selectOption("#ranking-anio", "2024");
    await p.selectOption("#ranking-por", "principal");
    igual("2024 por «como principal»: Óscar y Eduardo con 1, y en 2023 nadie", (await filas(p, "#tabla-ranking")).map((f) => [f[0], f[1], f[3], f[8]]),
        [["1.º", "Ángulo Prueba, Óscar", "1", "No figuraba en 2023"], ["1.º", "Quiros Prueba, Eduardo", "1", "No figuraba en 2023"]]);
    igual("la columna elegida lo dice (aria-sort) y la cuenta también", [await p.$eval("#tabla-ranking th[data-col=principal]", (e) => e.getAttribute("aria-sort")),
        await p.$eval("#ranking-cuenta", (e) => e.textContent)], ["descending", "2 árbitros con torneos como principal en 2024."]);
    await p.selectOption("#ranking-por", "nacional");
    igual("2024 por «solo Elo nacional»: Óscar y Eduardo, con el del club (el Sub-16, rápido, no cuenta), en su columna",
        [(await filas(p, "#tabla-ranking")).map((f) => [f[0], f[1], f[5]]), await p.$eval("#tabla-ranking th[data-col=nacional]", (e) => e.getAttribute("aria-sort"))],
        [[["1.º", "Ángulo Prueba, Óscar", "1"], ["1.º", "Quiros Prueba, Eduardo", "1"]], "descending"]);
    await p.selectOption("#ranking-por", "torneos");
    igual("2024 por torneos: los empates comparten el puesto y el siguiente salta (1, 2, 2)", (await filas(p, "#tabla-ranking")).map((f) => [f[0], f[1], f[2]]),
        [["1.º", "Ángulo Prueba, Óscar", "4"], ["2.º", "Quiros Prueba, Eduardo", "2"], ["2.º", "Soto Prueba, Ana", "2"]]);
    await p.selectOption("#ranking-anio", "2015");
    igual("el primer año no tiene año anterior", (await filas(p, "#tabla-ranking")).map((f) => f[8]), ["—"]);
    igual("la lista va ordenada por cantidad de torneos", (await filas(p, "#tabla-arbitros")).map((f) => f[0])[0], "Ángulo Prueba, Óscar");

    await p.selectOption("#tipo", "nofide");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«No FIDE»: solo quienes tienen torneos que no son de FIDE, con esos", [Object.keys(m).sort(), m["Ángulo Prueba, Óscar"][5], m["Quiros Prueba, Eduardo"][5]],
        [["Quiros Prueba, Eduardo", "Soto Prueba, Ana", "Ángulo Prueba, Óscar"].sort(), "2", "2"]);
    await p.selectOption("#tipo", "nacional");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«Solo con Elo nacional»: el del club (60 min: clásico) para Óscar y Eduardo; ni el Sub-16 (15 min + 10 seg: rápido), ni el que no se leyó, ni el de Panamá",
        [Object.keys(m).sort(), m["Ángulo Prueba, Óscar"][5], m["Quiros Prueba, Eduardo"][5]],
        [["Quiros Prueba, Eduardo", "Ángulo Prueba, Óscar"].sort(), "1", "1"]);
    await p.selectOption("#tipo", "fide");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«Solo FIDE»: Óscar con 4 y Eduardo con 1", [m["Ángulo Prueba, Óscar"][5], m["Quiros Prueba, Eduardo"][5]], ["4", "1"]);
    await p.selectOption("#tipo", "");

    await p.selectOption("#donde", "fuera");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«En el extranjero»: solo Ana, con su torneo en Panamá", [Object.keys(m), m["Soto Prueba, Ana"][5]], [["Soto Prueba, Ana"], "1"]);
    await p.selectOption("#donde", "cr");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«En Costa Rica»: Ana sin el de Panamá, Óscar igual", [m["Soto Prueba, Ana"][5], m["Soto Prueba, Ana"][9], m["Ángulo Prueba, Óscar"][5]], ["2", "0", "6"]);
    await p.selectOption("#donde", "");

    const cuentaGeneral = () => p.$eval("#cuenta", (e) => e.textContent);
    igual("cada torneo cuenta aparte", /con 9 torneos \(5 de FIDE y 4 que no; 1 en el extranjero\)/.test(await cuentaGeneral()), true);
    await p.selectOption("#contar", "festival");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«Festivales como uno»: el 102 y el 900006 (mismo día) cuentan como uno de FIDE para Óscar; 2 principal y 2 árbitro siguen",
        m["Ángulo Prueba, Óscar"].slice(1), ["IA", "2024", "2026", "Activo", "5", "4", "1", "1", "0", "2", "1", "2", "2", "2 (1)", "Ya es AF", "Ya es AI", "01/03/2023", "10/01/2025"]);
    igual("y Eduardo, que estuvo solo en uno de ese día, no cambia", m["Quiros Prueba, Eduardo"][5], "3");
    igual("la cuenta general junta todo lo del mismo día", /con 8 torneos o festivales \(5 de FIDE y 3 que no; 1 en el extranjero\)/.test(await cuentaGeneral()), true);
    await p.selectOption("#contar", "");

    await p.selectOption("#desde", "2023");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("desde 2023, Juan (solo 2015) ya no sale", "Viejo Prueba, Juan" in m, false);
    igual("desde 2023, Eduardo ya no cuenta su torneo de 2019", m["Quiros Prueba, Eduardo"][5], "2");
    await p.selectOption("#desde", "2015");
    await p.selectOption("#titulo", "-");
    igual("«sin título en FIDE» deja a Eduardo (Luis es AN por la lista de FIDE)", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))).sort(), ["Quiros Prueba, Eduardo"]);
    await p.selectOption("#titulo", "");
    await p.fill("#buscar", "angulo");
    await p.waitForTimeout(400);
    igual("el buscador encuentra sin tildes", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))), ["Ángulo Prueba, Óscar"]);
    await p.fill("#buscar", "6500003");
    await p.waitForTimeout(400);
    igual("y por ID FIDE", Object.keys(porNombre(await filas(p, "#tabla-arbitros"))), ["Rojas Prueba, Luis"]);
    await p.fill("#buscar", "");
    await p.waitForTimeout(400);

    console.log("\n=== La ficha de un árbitro ===");
    await p.click("#tabla-arbitros button:text-is('Soto Prueba, Ana')");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre la ficha y esconde la lista", [await visible(p, "#ficha"), await visible(p, "#general")], [true, false]);
    igual("el enlace lleva su ID FIDE", await p.evaluate(() => location.hash), "#6500002");
    const normas = (cual) => p.$eval(`#ficha-normas [data-norma="${cual}"]`, (e) => [e.querySelector(".of-estado").textContent, e.textContent]);
    let [estAf, txtAf] = await normas("af"), [estAi, txtAi] = await normas("ai");
    igual("Ana (AF): el AF ya lo tiene; para AI no junta ninguna (el de pareos queda para revisar)",
        [estAf, estAi, /1 torneo queda para revisar/.test(txtAi)], ["Ya tiene el título", "Le faltan 4", true]);
    igual("el resumen de normas se ve", await visible(p, "#ficha-normas"), true);
    const ficha = await filas(p, "#tabla-torneos");
    igual("como asistente: «No», con el porqué (2.4.4)", [ficha[0][3], ficha[0][8].startsWith("No"), /2\.4\.4/.test(ficha[0][8])], ["Árbitro asistente", true, true]);
    igual("el de Panamá: «No consta» en FIDE, el país en el lugar y sin norma", [ficha[1][2], ficha[1][3], /Ciudad de Panamá, Panamá/.test(ficha[1][1]), ficha[1].slice(8)],
        ["No consta", "Árbitro", true, ["—", "—"]]);
    igual("como árbitro de pareos: «Revisar» en AF y AI", [ficha[2][3], ficha[2][8].startsWith("Revisar"), ficha[2][9].startsWith("Revisar")], ["Árbitro de pareos", true, true]);
    igual("el torneo que también está en chess-results lleva los dos enlaces", await p.$$eval("#tabla-torneos tbody tr:first-child a", (as) => as.map((a) => a.href)),
        ["https://ratings.fide.com/tournament_information.phtml?event=101", "https://chess-results.com/tnr900001.aspx?lan=2"]);
    await p.selectOption("#norma-ai", "revisar");
    igual("el filtro de norma recorta la tabla", (await filas(p, "#tabla-torneos")).length, 1);
    await p.click("#volver");
    igual("«Ver todos» vuelve a la lista", [await visible(p, "#general"), await p.evaluate(() => location.hash)], [true, ""]);
    await ctx.close();

    console.log("\n=== Un enlace directo a un árbitro ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500001", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre su ficha", await p.$eval("#ficha-titulo", (e) => e.textContent), "Ángulo Prueba, Óscar");
    igual("Óscar (IA) ya tiene los dos títulos", await p.$$eval("#ficha-normas .of-estado", (es) => es.map((e) => e.textContent)), ["Ya tiene el título", "Ya tiene el título"]);
    const o = await filas(p, "#tabla-torneos");
    igual("cada torneo una vez, el más nuevo primero, con FIDE sí o no y su cargo (el 900001 dentro del 101, el 900005 fuera)",
        o.map((f) => [f[0], f[2], f[3]]),
        [["10/01/2025", "Sí", "Árbitro principal"], ["01/08/2024", "Sí", "Árbitro adjunto principal"], ["10/07/2024", "No (Elo nacional)", "Director del torneo"],
         ["01/05/2024", "Sí", "Árbitro principal"], ["01/05/2024", "No", "Árbitro"], ["01/03/2023", "Sí", "Árbitro"]]);
    await p.selectOption("#ficha-tipo", "nacional");
    igual("«Torneos: solo con Elo nacional» en la ficha deja el del club, y el filtro de arriba dice lo mismo",
        [(await filas(p, "#tabla-torneos")).map((f) => [f[0], f[2]]), await p.$eval("#tipo", (e) => e.value)], [[["10/07/2024", "No (Elo nacional)"]], "nacional"]);
    await p.selectOption("#tipo", "");
    igual("y al revés: el de arriba cambia el de la ficha", [await p.$eval("#ficha-tipo", (e) => e.value), (await filas(p, "#tabla-torneos")).length], ["", 6]);
    const conPorque = await p.$eval("#tabla-torneos tbody tr", (tr) => [tr.cells[9].querySelector(".of-estado").textContent, tr.cells[9].querySelector(".of-detalle").textContent]);
    igual("la norma va escrita con su porqué", conPorque, ["Vale una vez", "porque opcion"]);
    igual("un torneo que no es de FIDE no tiene norma", o[2].slice(8), ["—", "—"]);
    await p.selectOption("#tipo", "nofide");
    igual("«No FIDE» deja solo los que no son de FIDE", (await filas(p, "#tabla-torneos")).map((f) => f[1].split(/Heredia|San José/)[0].trim()), ["Abierto del club 2024", "Nacional Sub-16 2024"]);
    await p.selectOption("#tipo", "");
    await p.selectOption("#contar", "festival");
    const fest = await filas(p, "#tabla-torneos");
    igual("con festivales, el del 01/05/2024 es una sola fila", fest.map((f) => f[0]), ["10/01/2025", "01/08/2024", "10/07/2024", "01/05/2024", "01/03/2023"]);
    igual("la fila del festival: sus dos torneos, FIDE sí, los dos cargos, jugadores sumados y la mejor norma con su porqué",
        [fest[3][1].startsWith("Festival de 2 torneos"), /Nacional Absoluto 2024/.test(fest[3][1]), /Nacional Sub-16 2024/.test(fest[3][1]), fest[3][2], fest[3][3], fest[3][7],
         fest[3][8].startsWith("Vale"), /Festival de 2 torneos \(cuenta una vez\)/.test(fest[3][8])],
        [true, true, true, "Sí", "Árbitro principal, Árbitro", "58", true, true]);
    igual("y enlaza a cada torneo", await p.$$eval("#tabla-torneos tbody tr:nth-child(4) a", (as) => as.map((a) => a.href)),
        ["https://ratings.fide.com/tournament_information.phtml?event=102", "https://chess-results.com/tnr900004.aspx?lan=2", "https://chess-results.com/tnr900006.aspx?lan=2"]);
    igual("la cuenta de la ficha dice «torneos o festivales»", /^5 torneos o festivales\./.test(await p.$eval("#ficha-cuenta", (e) => e.textContent)), true);
    await ctx.close();

    console.log("\n=== El resumen de normas ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    const tarjeta = (cual) => p.$eval(`#ficha-normas [data-norma="${cual}"]`, (e) => [e.querySelector(".of-estado").textContent, e.textContent]);
    let [e1, t1] = await tarjeta("af");
    igual("Luis, sin título: 1 norma de AF de las 3 (el internacional de 2023), le faltan 2, y hasta cuándo cuenta", [e1, /Junta 1 de las 3/.test(t1), /01\/03\/2023 · Internacional con titulados 2023 \(Vale\) · cuenta hasta el 01\/03\/2029/.test(t1)],
        ["Le faltan 2", true, true]);
    igual("su ficha trae «Torneos por año»", (await filas(p, "#ficha-actividad")).map((f) => [f[0], f[1].trim()]), [["2023", "1"]]);
    const [eAi, tAi] = await tarjeta("ai");
    igual("y para AI, primero el AF: sin el AF no junta ninguna", [eAi, /hoy no junta ninguna/.test(tAi)], ["Primero el AF", true]);
    const ruta = await p.$$eval("[data-ruta='af'] li", (ls) => ls.map((l) => l.dataset.estado + " " + l.textContent.split(":")[1].trim()));
    igual("«Para pedir el título» del AF: le faltan normas, el seminario está, un año de AN o un torneo más, la norma más vieja vence, y lo que no se ve",
        ruta.map((r) => r.split(" ").slice(0, 3).join(" ")), ["Falta Normas de", "Listo Seminario de", "Revisar Necesita un", "Revisar La norma", "Revisar Lo que"]);
    igual("el seminario vale cuatro años y la norma más vieja seis", [/vale para la solicitud hasta el 29\/06\/2029/.test(await p.$eval("[data-ruta='af']", (e) => e.textContent)),
        /La norma más vieja que junta vence el 01\/03\/2029/.test(await p.$eval("[data-ruta='af']", (e) => e.textContent))], [true, true]);
    const [solicitud] = await Promise.all([p.waitForEvent("download"), p.click("[data-ruta='af'] button")]);
    igual("y el Excel de los torneos para la solicitud", solicitud.suggestedFilename(), "solicitud-af-6500003.xlsx");
    const [informe] = await Promise.all([p.waitForEvent("download"), p.click("[data-ruta='af'] button:text-is('Informe para la comisión (PDF)')")]);
    const inf = require("fs").readFileSync(await informe.path()).toString("latin1");
    igual("el informe para la comisión: lo que pide FIDE, la norma con quién firma y hasta cuándo cuenta, y los riesgos",
        [informe.suggestedFilename(), inf.includes("(Lo que pide FIDE, punto por punto)"), inf.includes("(- Falta: Normas de torneo: junta 1 de las 3; le faltan 2.)"),
         inf.includes("(Internacional con titulados 2023)"), inf.includes("(No consta)"), inf.includes("(01/03/2029)"), inf.includes("(Riesgos de esta solicitud)"),
         inf.includes("(Con lo que se ve desde afuera, ninguno en particular.)")],
        ["informe-af-6500003.pdf", true, true, true, true, true, true, true]);
    igual("su ficha dice la categoría nacional, de la lista de la Federación",
        [/Árbitro Nacional \(AN\), categoría B/.test(await p.$eval("#ficha-sub", (e) => e.textContent)),
         /Árbitro Nacional categoría B según la lista de la Federación Costarricense de Ajedrez \(leída el 16\/10\/2026\)/.test(await p.$eval("#ficha-fide", (e) => e.textContent))], [true, true]);
    igual("su historial: el seminario de AF", await p.$$eval("#ficha-historial > ul > li strong", (s) => s.map((x) => x.textContent)), ["29/06/2025 · Seminario de AF: 189th Internet Based Jun 2025 (CCA)"]);
    const aiLuis = (await filas(p, "#tabla-torneos"))[0][9];
    igual("su torneo que cumple las condiciones de AI no le cuenta: no tiene el AF", [aiLuis.startsWith("No"), /No tiene el título de AF/.test(aiLuis)], [true, true]);
    const [descarga] = await Promise.all([p.waitForEvent("download"), p.click("#pdf")]);
    const pdf = require("fs").readFileSync(await descarga.path()).toString("latin1");
    igual("la ficha en PDF: su nombre, el cuadro de AF, su torneo y la nota de las fuentes",
        [descarga.suggestedFilename(), pdf.slice(0, 5), pdf.includes("(Rojas Prueba, Luis)"), pdf.includes("Le faltan 2."), pdf.includes("(Internacional con titulados 2023)"), pdf.includes("chess-results.com")],
        ["arbitro-6500003.pdf", "%PDF-", true, true, true, true]);
    await p.click("#tabla-torneos details summary");
    igual("el equipo de Costa Rica del torneo: él y Óscar, cada uno con su cargo", await p.$$eval("#tabla-torneos details li", (ls) => ls.map((l) => l.textContent)),
        ["Rojas Prueba, Luis: Árbitro adjunto principal", "Ángulo Prueba, Óscar: Árbitro"]);
    await p.click("#tabla-torneos details li button");
    igual("un nombre del equipo abre su ficha", await p.$eval("#ficha-titulo", (e) => e.textContent), "Ángulo Prueba, Óscar");
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500004", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    [e1, t1] = await tarjeta("af");
    igual("Juan: su norma de 2015 ya no cuenta (más de seis años) y lo dice", [e1, /1 torneo que valía es de antes de los últimos seis años/.test(t1)], ["Le faltan 3", true]);
    await ctx.close();

    console.log("\n=== Las normas de AI, solo después del AF ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500001", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    const ai = Object.fromEntries((await filas(p, "#tabla-torneos")).filter((f) => f[2] === "Sí").map((f) => [f[0].slice(-4), f[9]]));
    igual("Óscar (el Consejo le aprobó el AF el 15/04/2024; no se sabe la fecha de su perfil): para AI, el de 2023 no cuenta, el de 16 días después queda para revisar, el de 2025 vale",
        [ai["2023"].startsWith("No"), /aprobado por el Consejo el 15\/04\/2024/.test(ai["2023"]), ai["2024"].startsWith("Revisar"), /la fecha oficial es la que FIDE anota en su perfil/.test(ai["2024"]), ai["2025"].startsWith("Vale")],
        [true, true, true, true, true]);
    const af = Object.fromEntries((await filas(p, "#tabla-torneos")).filter((f) => f[2] === "Sí").map((f) => [f[0].slice(-4), f[8]]));
    igual("y para AF, el de 2025 ya no cuenta (ya tenía el AF); los de antes sí", [af["2025"].startsWith("No"), /Ya tenía el título de AF \(aprobado el 15\/04\/2024\)/.test(af["2025"]), af["2023"].startsWith("Vale")], [true, true, true]);
    igual("la ficha dice que está activo, su licencia y cuándo se le aprobó el AF", await p.$eval("#ficha-fide", (e) => e.textContent),
        "Activo en la lista de árbitros de FIDE del 12/10/2026, licencia IA-D. AF aprobado por el Consejo el 15/04/2024 (2.ª reunión del Consejo de FIDE de 2024 (en línea)). La fecha oficial es la que FIDE anota en su perfil, de seis días a seis semanas después: hasta tenerla, lo que empezó en los 60 días siguientes queda para revisar."
        + " Sigue activo por lo menos hasta el 09/09/2029: cuatro años desde su seminario de AI (B.06.3, 2). Un curso de actualización después lo corre.");
    const hist = await p.$$eval("#ficha-historial > ul > li", (ls) => ls.map((l) => l.querySelector("strong").textContent));
    igual("su historial en FIDE: las solicitudes, la más nueva primero, y el seminario", hist,
        ["23/08/2026 · Solicitud de AI: Aprobada", "02/04/2025 · Solicitud de AI: Rechazada", "09/09/2025 · Seminario de AI: 18th IACS Internet Based Aug 2025 (ARB)", "06/12/2015 · Seminario de AF: 44th Internet Based Dec 2015 (CCA)",
         "12/01/2026 · Asistente local del seminario de AF: 215th Internet Based Jan 2026 (CRC)", "17/11/2024 · Conferencista del seminario de AI: 9th IACS Internet Based Nov 2024 (ARB)"]);
    igual("el conferencista dice con quién y enlaza el informe del seminario", await p.$eval("#ficha-historial li[data-seminario-rol='conferencista']", (l) => [/\(con Laurent Freyd \(FRA\)\)/.test(l.textContent), l.querySelector("a").getAttribute("href")]),
        [true, "https://arbiters.fide.com/news/9673"]);
    igual("el seminario enlaza al informe y, si se conoce, a su página en el calendario de la Comisión", await p.$eval("#ficha-historial li[data-seminario='IA']", (l) => [...l.querySelectorAll("a")].map((x) => [x.textContent, x.getAttribute("href")])),
        [["informe de la Comisión", "https://arbiters.fide.com/informe-2.pdf"], ["página del seminario", "https://arbiters.fide.com/news/event/18th-iacs"]]);
    igual("el que sale solo del informe del seminario enlaza a ese informe, sin un enlace vacío", await p.$eval("#ficha-historial li[data-seminario='FA']", (l) => [/venció el 06\/12\/2019/.test(l.textContent), [...l.querySelectorAll("a")].map((x) => [x.textContent, x.getAttribute("href")])]),
        [true, [["informe del seminario", "https://arbiters.fide.com/news/1896"]]]);
    igual("la rechazada dice por qué (como lo escribe FIDE) y lo que mandó", await p.$eval("#ficha-historial li[data-solicitud='2025-04-02']", (l) => [/«Only 3 tournament norms»/.test(l.textContent), l.querySelectorAll("details li").length]), [true, 2]);
    igual("quien ya tiene el título no lleva «Para pedir el título»", await p.$$eval("[data-ruta]", (r) => r.length), 0);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500002", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    const ana = (await filas(p, "#tabla-torneos")).find((f) => /Nacional Absoluto/.test(f[1]));
    igual("Ana (de su AF solo se sabe el año, 2024): su torneo de 2024 queda para revisar en AI", [ana[9].startsWith("Revisar"), /mismo año de su título de AF \(2024\)/.test(ana[9])], [true, true]);
    igual("la ruta al AI de Ana: sin normas, sin seminario de AI, y los dos años con el AF por revisar (solo se sabe el año)",
        await p.$$eval("[data-ruta='ai'] li", (ls) => ls.map((l) => l.dataset.estado + " " + l.textContent.split(":")[1].trim().split(" ").slice(0, 2).join(" "))),
        ["Falta Normas de", "Falta Seminario de", "Revisar Pide dos", "Revisar Lo que"]);
    igual("y su ficha dice que está inactiva y sin licencia", /^Inactivo en la lista de árbitros de FIDE del 12\/10\/2026, sin licencia\. De su AF solo se sabe el año/.test(await p.$eval("#ficha-fide", (e) => e.textContent)), true);
    await ctx.close();

    console.log("\n=== La fecha oficial del AF: la del perfil de FIDE ===");
    ARBITROS_FIDE[0].af_perfil = "2024-05-10";
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500001", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    const ai2 = Object.fromEntries((await filas(p, "#tabla-torneos")).filter((f) => f[2] === "Sí").map((f) => [f[0].slice(-4), f[9]]));
    igual("con la fecha del perfil (10/05/2024), el torneo del 01/05/2024 ya no cuenta: es de antes, aunque sea después del Consejo",
        [ai2["2024"].startsWith("No"), /10\/05\/2024 en su perfil de FIDE, la fecha oficial/.test(ai2["2024"]), ai2["2025"].startsWith("Vale")], [true, true, true]);
    igual("y la ficha dice las dos fechas", /AF desde el 10\/05\/2024 según su perfil de FIDE \(la fecha oficial\); el Consejo lo aprobó el 15\/04\/2024/.test(await p.$eval("#ficha-fide", (e) => e.textContent)), true);
    await ctx.close();
    ARBITROS_FIDE[0].af_perfil = null;

    console.log("\n=== Quién firma las normas ===");
    CARGOS.push({ torneo_id: 104, fide_id: 6500005, cargo: "Chief" });   // Eduardo, sin título, de principal
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("si el principal no tenía título, la norma de Luis no vale (2.8)", await p.$$eval("[data-ruta='af'] li[data-estado='Falta']", (ls) => ls.map((l) => l.textContent).filter((t) => /Firmas/.test(t))),
        ["Falta: Firmas: «Internacional con titulados 2023» la firma Quiros Prueba, Eduardo, que entonces no era FA ni IA: FIDE la rechaza (2.8)."]);
    await ctx.close();
    CARGOS[CARGOS.length - 1] = { torneo_id: 104, fide_id: 6500003, cargo: "Chief" };   // Luis mismo de principal
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("si el principal fue él mismo, el certificado lo firma otro", /fue él el árbitro principal; ese certificado no lo puede firmar él \(2\.8\)/.test(await p.$eval("[data-ruta='af']", (e) => e.textContent)), true);
    const [informe2] = await Promise.all([p.waitForEvent("download"), p.click("[data-ruta='af'] button:text-is('Informe para la comisión (PDF)')")]);
    igual("y el informe lo dice en la columna de la firma", require("fs").readFileSync(await informe2.path()).toString("latin1").includes("(Él mismo: firma otro \\(2.8\\))"), true);
    await ctx.close();
    CARGOS.pop();
    // El 104 tiene 40 jugadores: da dos certificados (uno cada 25, 2.7). Con
    // Óscar (entonces sin título) y Ana además de Luis, son tres para dos.
    CARGOS.push({ torneo_id: 104, fide_id: 6500002, cargo: "Arbiter" });
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("si en el torneo hubo más árbitros que certificados posibles, lo pide revisar (2.7)", await p.$$eval("[data-ruta='af'] li[data-estado='Revisar']", (ls) => ls.map((l) => l.textContent).filter((t) => /2\.7/.test(t))),
        ["Revisar: Certificados por torneo (2.7): «Internacional con titulados 2023» da como máximo 2 (40 jugadores, uno cada 25) y lo arbitraron 2 más de la lista sin el título de AI: ver que le hayan dado el suyo."]);
    await ctx.close();
    CARGOS.pop();

    // Ana (FA) arbitra el 101, que vale una sola vez para AI (opción), y en
    // las mismas fechas el 106: el informe avisa de las dos cosas.
    CARGOS.push({ torneo_id: 101, fide_id: 6500002, cargo: "Arbiter" }, { torneo_id: 106, fide_id: 6500002, cargo: "Arbiter" });
    TORNEOS.push(T(106, "Rápido del mismo día", "2025-01-10", "no", "no"));
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500002", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    const [informe3] = await Promise.all([p.waitForEvent("download"), p.click("[data-ruta='ai'] button:text-is('Informe para la comisión (PDF)')")]);
    const inf3 = require("fs").readFileSync(await informe3.path()).toString("latin1");
    igual("el informe de AI de Ana: el 101 vale una sola vez y se tocó con otro torneo (2.10)",
        [informe3.suggestedFilename(), inf3.includes("4.9.1"), inf3.includes("2.10"), inf3.includes("(Riesgos de esta solicitud)")], ["informe-ai-6500002.pdf", true, true, true]);
    await ctx.close();
    CARGOS.splice(-2, 2); TORNEOS.pop();

    console.log("\n=== Para subir de categoría en FIDE (B.06.3) ===");
    // Óscar es IA de 2026 (solo se sabe el año): ningún torneo cuenta todavía y
    // el año con el AI se cumple a más tardar a fin de 2027.
    const RELOJ_CAT = "2026-10-18T12:00:00-06:00";
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500001", true, RELOJ_CAT));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    const catFide = () => p.$eval("[data-categoria-fide]", (c) => [c.querySelector(".of-estado").textContent, [...c.querySelectorAll("li[data-estado]")].map((l) => l.textContent), [...c.querySelectorAll("[data-subir-fide] li")].map((l) => l.textContent)]);
    let [cEst, cPide] = await catFide();
    igual("Óscar (IA de 2026, categoría D): para C le falta el año con el AI y los torneos", [cEst, cPide.slice(0, 3)],
        ["De D a C: Le falta", ["Falta: Cumple 1 año con el AI a más tardar el 31/12/2027 (5.1).", "Listo: Está activo (5.2), por lo menos hasta el 09/09/2029.",
          "Falta: Torneos: tiene 0 torneos de categoría C y 0 torneos de categoría D; pide dos de categoría C, o uno de C y tres de D, como principal o adjunto principal en los últimos cinco años (5.4). Le falta sobre todo uno de categoría C, que en Costa Rica casi no se juega."]]);
    igual("y lo que no se ve lo dice escrito", /evaluación positiva.*sanciones \(5\.3\).*IA3 \(7\.2\)/.test(cPide.at(-1)), true);
    await ctx.close();
    // Con el AI desde junio de 2025: un nacional que da norma de AI (D), un
    // panamericano juvenil (C, por el nombre: revisar) y un blitz que no cuenta.
    ARBITROS_FIDE[0].ia_fecha = "2025-06-01";
    TORNEOS.push(T(201, "Campeonato Nacional Absoluto 2026", "2026-02-01", "si", "si"), T(202, "Panamericano Juvenil 2026", "2026-03-01", "si", "revisar"),
        T(203, "Torneo de 2025 antes del AI", "2025-03-01", "si", "si"), T(206, "Abierto donde solo fue árbitro 2026", "2026-06-01", "si", "si"));
    CARGOS.push({ torneo_id: 201, fide_id: 6500001, cargo: "Chief" }, { torneo_id: 202, fide_id: 6500001, cargo: "Dep. Chief" }, { torneo_id: 203, fide_id: 6500001, cargo: "Chief" },
        { torneo_id: 206, fide_id: 6500001, cargo: "Arbiter" });   // de árbitro, sin ser principal ni adjunto principal: no cuenta
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500001", true, RELOJ_CAT));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    let cTorneos;
    [cEst, cPide, cTorneos] = await catFide();
    igual("con el año cumplido, cuentan los torneos desde el AI, cada uno con su categoría y por qué", [cPide[0], cTorneos],
        ["Listo: Tiene el AI desde el 01/06/2025: más de 1 año (5.1).",
         ["01/03/2026 · Panamericano Juvenil 2026 · Árbitro adjunto principal · categoría C (revisar): por el nombre, un continental de juveniles, escolares, sénior o aficionados (1.3.3.1)",
          "01/02/2026 · Campeonato Nacional Absoluto 2026 · Árbitro principal · categoría D: da para una norma de AI (1.3.4)"]]);
    igual("uno de C para revisar y uno de D: todavía no alcanza", [cEst, /^Falta: Torneos: tiene 0 torneos de categoría C y 1 torneo de categoría D/.test(cPide[2])], ["De D a C: Le falta", true]);
    await ctx.close();
    TORNEOS.push(T(204, "Abierto Internacional 2026", "2026-04-01", "si", "si"), T(205, "Torneo Internacional de Mayo 2026", "2026-05-01", "si", "opcion"));
    CARGOS.push({ torneo_id: 204, fide_id: 6500001, cargo: "Chief" }, { torneo_id: 205, fide_id: 6500001, cargo: "Dep. Chief" });
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500001", true, RELOJ_CAT));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    [cEst, cPide] = await catFide();
    igual("con tres de D y el de C para revisar, alcanza si el de C se confirma", [cEst, /^Revisar: Torneos: seguros, 0 torneos de categoría C y 3 torneos de categoría D; con los que hay que revisar, alcanza/.test(cPide[2])], ["De D a C: Revisar", true]);
    await ctx.close();
    TORNEOS.splice(TORNEOS.findIndex((t) => t.id === 201), 6);
    CARGOS.splice(CARGOS.findIndex((c) => c.torneo_id === 201), 6);
    ARBITROS_FIDE[0].ia_fecha = null;
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500002", true, RELOJ_CAT));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("un FA no lleva «Para subir de categoría en FIDE» (los FA son siempre D)", await p.$$eval("[data-categoria-fide]", (l) => l.length), 0);
    await ctx.close();

    console.log("\n=== Revisar normas antes de mandarlas ===");
    // Un torneo más de Luis (árbitro), con Óscar de principal ya AF: sirve de reserva.
    // Y otro con Juan (AN) de principal: también vale, pero su firma no sirve (va después).
    TORNEOS.push(T(107, "Abierto de reserva 2024", "2024-06-01", "si", "no"), T(108, "Torneo firmado por un AN 2022", "2022-02-01", "si", "no"));
    CARGOS.push({ torneo_id: 107, fide_id: 6500003, cargo: "Arbiter" }, { torneo_id: 107, fide_id: 6500001, cargo: "Chief" },
        { torneo_id: 108, fide_id: 6500003, cargo: "Arbiter" }, { torneo_id: 108, fide_id: 6500004, cargo: "Chief" });
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("revision").checkVisibility());
    igual("Luis (AN) arranca en la solicitud de AF, con sus torneos de FIDE para elegir y nada subido",
        [await p.$eval("#revision-cual", (e) => e.value), await p.$$eval("#revision-torneo option", (os) => os.map((o) => o.textContent)),
         await p.$$eval("#revision-lista > li", (ls) => ls.length), await visible(p, "#revision-solicitud")],
        ["af", ["Elegir el torneo", "01/06/2024 · Abierto de reserva 2024", "01/03/2023 · Internacional con titulados 2023", "01/02/2022 · Torneo firmado por un AN 2022"], 0, false]);
    const certificado = { name: "norma-104.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") };
    await p.selectOption("#revision-torneo", "104");
    await p.click("#revision-subir");
    igual("sin el certificado no sube nada y lo dice", [await p.$$eval("#revision-lista > li", (ls) => ls.length), /Sube el certificado/.test(await p.textContent("body"))], [0, true]);
    await p.selectOption("#revision-cargo", "Dep. Chief");
    await p.selectOption("#revision-firmante", "otro");
    igual("«Otra persona» pide el nombre", await visible(p, "#revision-otro"), true);
    await p.fill("#revision-otro", "Fulano Externo");
    await p.setInputFiles("#revision-archivo", certificado);
    await p.click("#revision-subir");
    igual("sin marcar la casilla de la privacidad no sube ni el archivo, y la casilla enlaza la política",
        [await p.$$eval("#revision-lista > li", (ls) => ls.length), Object.keys(await p.evaluate(() => window.__archivos)).length,
         /marcar la casilla de la Política de privacidad/.test(await p.textContent("body")), await p.$eval("#revision-acepto + span a", (a) => a.getAttribute("href"))],
        [0, 0, true, "privacidad.html"]);
    await p.check("#revision-acepto");
    await p.click("#revision-subir");
    await p.waitForFunction(() => document.querySelectorAll("#revision-lista > li").length === 1);
    const norma = () => p.$eval("#revision-lista > li", (li) => [li.dataset.veredicto, [...li.querySelectorAll("li")].map((x) => x.textContent)]);
    let [ver, mot] = await norma();
    igual("la norma subida: el archivo va a la carpeta de quien la sube; el torneo vale; quien firma no está en la lista: revisar",
        [Object.keys(await p.evaluate(() => window.__archivos))[0].startsWith("normas-arbitros/yo/"), ver,
         mot.some((m) => /^Listo: El torneo: Vale\./.test(m)), mot.some((m) => /^Revisar: Lo firma Fulano Externo, que no está en la lista/.test(m))],
        [true, "Revisar", true, true]);
    igual("la norma para revisar propone con qué reemplazarla, con quién la firmaría",
        await p.$eval("#revision-lista [data-reserva]", (e) => e.textContent),
        "Para reemplazarla: «Abierto de reserva 2024» (01/06/2024); lo firmaría Ángulo Prueba, Óscar (AF).");
    igual("y la solicitud lista lo que podría completarla",
        await p.$eval("#revision-solicitud [data-candidatas]", (e) => e.textContent),
        "Para completarla (le faltan 2) o tener de reserva01/06/2024 · Abierto de reserva 2024 (Vale): lo firmaría Ángulo Prueba, Óscar (AF)."
        + "01/02/2022 · Torneo firmado por un AN 2022 (Vale): el principal, Viejo Prueba, Juan, no tenía el título que hace falta: la rechazarían (2.8).");
    igual("la solicitud de AF con una sola norma: todavía no (le faltan 2)",
        [await p.$eval("#revision-solicitud .of-estado", (e) => e.textContent), /Normas de torneo: junta 1 de las 3; le faltan 2/.test(await p.textContent("#revision-solicitud"))],
        ["Todavía no: FIDE la rechazaría", true]);
    await p.click("#revision-enviada");
    await p.click("button:text-is('Marcar como enviada')");
    await p.waitForFunction(() => document.querySelectorAll("#revision-enviadas > li").length === 1);
    igual("«Marcar como enviada a FIDE» guarda la fecha, lo que dijo la revisión y sus normas",
        [await p.$eval("#revision-enviadas > li", (li) => li.textContent.includes("La revisión dijo: Todavía no: FIDE la rechazaría. FIDE: Pendiente.")),
         await p.evaluate(() => window.sb.from("arbitros_cr_solicitudes_enviadas").select().then((r) => r.data.map((e) => [e.prediccion, e.normas.map((n) => n.torneo_id + " " + n.veredicto)])))],
        [true, [["todavia", ["104 Revisar"]]]]);
    await p.selectOption("#revision-enviadas select", "rechazada");
    await p.fill("#revision-enviadas input", "Consejo de marzo de 2027");
    await p.fill("#revision-enviadas textarea", "Only 1 norm");
    await p.click("#revision-enviadas button:text-is('Guardar el resultado')");
    await p.waitForFunction(() => /La revisión acertó\./.test(document.getElementById("revision-enviadas").textContent));
    igual("con el resultado de FIDE: dijo «Todavía no» y la rechazaron, así que acertó; y la cuenta de aciertos",
        [/FIDE: Rechazada \(Consejo de marzo de 2027\)\./.test(await p.textContent("#revision-enviadas")), await p.textContent("#revision-acierto")],
        [true, "La revisión acertó en 1 de 1 solicitud resuelta (de todos los árbitros; las «Casi» no cuentan)."]);
    igual("después de subir, la casilla vuelve a quedar sin marcar (va con cada certificado)", await p.$eval("#revision-acepto", (e) => e.checked), false);
    await p.selectOption("#revision-torneo", "104");
    await p.setInputFiles("#revision-archivo", certificado);
    await p.check("#revision-acepto");
    await p.click("#revision-subir");
    igual("la misma norma dos veces no se sube", [await p.$$eval("#revision-lista > li", (ls) => ls.length), /ya está subida/.test(await p.textContent("body"))], [1, true]);
    await p.click("#revision-lista button:text-is('Quitar esta norma')");
    await p.click("button:text-is('Quitar la norma')");
    await p.waitForFunction(() => document.querySelectorAll("#revision-lista > li").length === 0);
    igual("«Quitar esta norma» la borra con su archivo y la solicitud desaparece; la enviada queda",
        [Object.keys(await p.evaluate(() => window.__archivos)).length, await visible(p, "#revision-solicitud"), await p.$$eval("#revision-enviadas > li", (ls) => ls.length)], [0, false, 1]);
    // Una norma que no vale (la firma él mismo) no se propone como su propio
    // reemplazo: va el 104 (ya quitado, el más nuevo de los que quedan).
    await p.selectOption("#revision-torneo", "107");
    await p.selectOption("#revision-firmante", "6500003");
    await p.setInputFiles("#revision-archivo", certificado);
    await p.check("#revision-acepto");
    await p.click("#revision-subir");
    await p.waitForFunction(() => document.querySelectorAll("#revision-lista > li").length === 1);
    igual("la que no vale propone otra, no a sí misma",
        [await p.$eval("#revision-lista > li", (li) => li.dataset.veredicto), await p.$eval("#revision-lista [data-reserva]", (e) => e.textContent)],
        ["No vale", "Para reemplazarla: «Internacional con titulados 2023» (01/03/2023); no consta quién fue el principal: ver el certificado."]);
    await ctx.close();
    TORNEOS.splice(-2, 2); CARGOS.splice(-4, 4);

    // Ana (FA) pide el AI con el 101 (vale una vez para AI): el certificado
    // dice «Árbitro» y FIDE la tiene de asistente, y lo firma Óscar, que en
    // enero de 2025 era AF, no AI: FIDE la rechazaría.
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500002", true));
    await p.waitForFunction(() => document.getElementById("revision").checkVisibility());
    igual("Ana (FA) arranca en la solicitud de AI", await p.$eval("#revision-cual", (e) => e.value), "ai");
    await p.selectOption("#revision-torneo", "101");
    await p.selectOption("#revision-firmante", "6500001");
    await p.setInputFiles("#revision-archivo", { name: "norma-101.jpg", mimeType: "image/jpeg", buffer: Buffer.from("foto") });
    await p.check("#revision-acepto");
    await p.click("#revision-subir");
    await p.waitForFunction(() => document.querySelectorAll("#revision-lista > li").length === 1);
    [ver, mot] = await norma();
    igual("no vale: lo firma alguien que entonces no era AI (2.8), y el cargo no coincide con la ficha de FIDE",
        [ver, mot.some((m) => /^No vale: Lo firma Ángulo Prueba, Óscar, que en esa fecha no era AI/.test(m)),
         mot.some((m) => /^Revisar: El certificado dice «Árbitro» y la ficha de FIDE, «Árbitro asistente»/.test(m))],
        ["No vale", true, true]);
    igual("y la solicitud lo dice: una norma que no vale",
        [await p.$eval("#revision-solicitud .of-estado", (e) => e.textContent), /1 norma subida, 1 no vale/.test(await p.textContent("#revision-solicitud"))],
        ["Todavía no: FIDE la rechazaría", true]);
    await ctx.close();

    console.log("\n=== Comparar dos árbitros ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003,6500001", true));
    await p.waitForFunction(() => document.getElementById("comparacion").checkVisibility());
    const dato = async (n) => (await filas(p, "#tabla-comparar")).find((f) => f[0] === n);
    igual("la dirección con dos ID abre la comparación: Luis contra Óscar, dato por dato",
        [await p.$eval("#comparar", (e) => e.value), await p.$$eval("#tabla-comparar thead th", (t) => t.map((x) => x.textContent)), await dato("Torneos"), await dato("Hoy para AF"), await dato("Título"), await dato("AF desde"), await dato("AI desde")],
        ["6500001", ["Dato", "Rojas Prueba, Luis", "Ángulo Prueba, Óscar"], ["Torneos", "1", "6"], ["Hoy para AF", "1 de 3", "Ya es AF"], ["Título", "Árbitro Nacional (AN), categoría B", "Árbitro Internacional (IA)"], ["AF desde", "—", "2024"], ["AI desde", "—", "2026"]]);
    igual("por año, con los que hicieron juntos", (await filas(p, "#comparar-anios")).find((f) => f[0] === "2023"), ["2023", "1", "1", "1"]);
    igual("el torneo que hicieron juntos, con el cargo de cada uno", [await p.$eval("#comparar-juntos-texto", (e) => e.textContent), await filas(p, "#comparar-juntos")],
        ["1 torneo hicieron juntos de 2015 a 2025:", [["01/03/2023", "Internacional con titulados 2023", "Árbitro adjunto principal", "Árbitro"]]]);
    await p.selectOption("#comparar", "6500002");
    igual("con Ana: ningún torneo juntos (sin tabla vacía) y la dirección cambia", [await p.$eval("#comparar-juntos-texto", (e) => e.textContent),
        await visible(p, "#comparar-juntos"), await p.evaluate(() => location.hash)], ["Ningún torneo juntos de 2015 a 2025.", false, "#6500003,6500002"]);
    await p.click("#quitar-comparar");
    igual("«Quitar la comparación» la esconde y deja solo su ID en la dirección", [await visible(p, "#comparacion"), await p.evaluate(() => location.hash)], [false, "#6500003"]);
    await ctx.close();

    console.log("\n=== Por vencer, con el reloj en julio de 2028 ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true, "2028-07-15T12:00:00-06:00"));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("la norma de AF de Luis (cuenta hasta el 01/03/2029) y su seminario (vale hasta el 29/06/2029), lo que vence antes primero; Óscar y Ana ya tienen lo suyo",
        await filas(p, "#tabla-por-vencer"),
        [["Rojas Prueba, Luis", "Norma de AF: Internacional con titulados 2023 (01/03/2023)", "01/03/2029", "Queda con 0 de 3"],
         ["Rojas Prueba, Luis", "Seminario de AF: 189th Internet Based Jun 2025 (CCA)", "29/06/2029", "Sin seminario vigente no puede mandar la solicitud"]]);
    igual("y la cuenta", await p.$eval("#por-vencer-cuenta", (e) => e.textContent), "2 cosas vencen en los próximos 12 meses, de 1 árbitro.");
    await ctx.close();

    console.log("\n=== La lista de la Federación, con el reloj en junio de 2025 ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true, "2025-06-15T12:00:00-06:00"));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("Óscar arbitró 4 torneos desde 2024 (el de 2025 y tres de 2024) y no está en la lista; Eduardo, 2, no llega a 3",
        await filas(p, "#tabla-fca-fuera"), [["Ángulo Prueba, Óscar", "IA", "Activo", "4", "10/01/2025"]]);
    await ctx.close();

    console.log("\n=== Para subir de categoría (reglamento de la Federación), con el reloj en diciembre de 2025 ===");
    const DIC = "2025-12-01T12:00:00-06:00";
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true, DIC));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    // Sin el botón «Norma (PDF)» que lleva cada torneo adelante.
    const lis = (sel) => p.$$eval(sel, (ls) => ls.map((l) => l.textContent.replace(/^Norma \(PDF\) /, "")));
    igual("Luis (AN-B): sin torneos con un principal conocido le faltan dos; el 104 (sin principal en la lista) queda para revisar",
        [await p.$eval("[data-categoria='B'] .of-estado", (e) => e.textContent), (await lis("[data-subir='revisar'] li")).map((t) => t.split(" · ").slice(0, 3).join(" · ")),
         await p.$$eval("[data-subir='firmes']", (x) => x.length)],
        ["De B a A: Le faltan dos", ["01/03/2023 · Internacional con titulados 2023 (clásico, suizo, 9 rondas) · Árbitro adjunto principal"], 0]);
    igual("lo que no se ve lo pide escrito, con el curso de pareo de la A", (await lis("[data-categoria='B'] li[data-estado='Revisar']")).some((t) => /programa de pareo avalado por FIDE de al menos 10 horas y de menos de un año \(art\. 14, e\)/.test(t)), true);
    await ctx.close();
    // Dos torneos con Óscar (IA, activo) de principal: uno blitz y otro clásico,
    // de 7 rondas o más. Uno de 5 rondas no sirve. Y en dos fue principal más
    // allá de lo que deja la B: uno de FIDE y uno nacional de 60 jugadores.
    const blitz = T(109, "Blitz con norma 2025", "2025-08-01", "no", "no"); blitz.ritmo = "Blitz"; blitz.rondas = 7;
    const corto = T(112, "Abierto corto 2025", "2025-07-01", "no", "no"); corto.rondas = 5;
    TORNEOS.push(blitz, T(110, "Abierto clásico 2025", "2025-09-01", "si", "no"), T(111, "Internacional grande 2025", "2025-10-01", "si", "no"), corto);
    CARGOS.push({ torneo_id: 109, fide_id: 6500003, cargo: "Arbiter" }, { torneo_id: 109, fide_id: 6500001, cargo: "Chief" },
        { torneo_id: 110, fide_id: 6500003, cargo: "Arbiter" }, { torneo_id: 110, fide_id: 6500001, cargo: "Chief" },
        { torneo_id: 111, fide_id: 6500003, cargo: "Chief" },
        { torneo_id: 112, fide_id: 6500003, cargo: "Arbiter" }, { torneo_id: 112, fide_id: 6500001, cargo: "Chief" });
    CR.push({ clave: 900008, nombre: "Nacional de Heredia 2025", inicio: "2025-07-20", fin: "2025-07-21", lugar: "Heredia", control: "90 min", rondas: 6, jugadores: 60, fide_torneo: null });
    ELO_CR.push({ clave: 900008, calculo: "nacional", ritmo: "clasico" });
    CR_CARGOS.push({ clave: 900008, fide_id: 6500003, rol: "ap" });
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true, DIC));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("con un blitz y un clásico firmados por Óscar le alcanzarían las normas (el de 5 rondas no cuenta)",
        [await p.$eval("[data-categoria='B'] .of-estado", (e) => e.textContent), await lis("[data-subir='firmes'] li")],
        ["De B a A: Le alcanzaría", ["01/09/2025 · Abierto clásico 2025 (clásico, suizo, 9 rondas) · Árbitro · firmaría Ángulo Prueba, Óscar (IA) · cuenta hasta el 01/09/2028",
            "01/08/2025 · Blitz con norma 2025 (blitz, suizo, 7 rondas) · Árbitro · firmaría Ángulo Prueba, Óscar (IA) · cuenta hasta el 01/08/2028"]]);
    igual("y dice dónde fue principal más allá de lo que deja la B (art. 13)", await lis("[data-subir='fuera'] li"),
        ["01/10/2025 · Internacional grande 2025 · Árbitro principal · de FIDE, 40 jugadores", "20/07/2025 · Nacional de Heredia 2025 · Árbitro principal · solo Elo nacional, 60 jugadores"]);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true, DIC));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("en la lista, «Quiénes pueden subir de categoría»", [await filas(p, "#tabla-subir"), await p.$eval("#subir-cuenta", (e) => e.textContent)],
        [[["Rojas Prueba, Luis", "B a A", "Le alcanzaría", "2", "1", "2"]],
         "1 Árbitro Nacional de categoría C o B tiene algo para mirar; a 1 le alcanzarían las normas para subir (lo demás —el año con la categoría y los cursos— no se ve desde acá)."]);
    await ctx.close();
    // La norma para firmar y el informe para la Junta, con estos mismos torneos.
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true, DIC));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    const [normaFca] = await Promise.all([p.waitForEvent("download"), p.click("[data-norma-fca='f110']")]);
    const normaTxt = require("fs").readFileSync(await normaFca.path()).toString("latin1");
    igual("«Norma (PDF)»: el formulario para firmar, con el aspirante, el torneo y quien firma", [normaFca.suggestedFilename(), normaTxt.includes("Rojas Prueba, Luis"),
        normaTxt.includes("Abierto cl"), normaTxt.includes("6500001"), normaTxt.includes("01/09/2028")], ["norma-6500003-f110.pdf", true, true, true, true]);
    igual("Luis arbitró un torneo válido para Elo en dos años: activo según el art. 19", await p.$eval("#ficha-actividad-fca", (e) => e.textContent),
        "Actividad según el art. 19 del reglamento: Activo (torneo), arbitró un torneo válido para Elo el 01/10/2025 (Internacional grande 2025).");
    igual("sin nada registrado lo dice, y sin ser de administración no hay formulario",
        [await p.$eval("#tabla-formacion tbody", (e) => /No hay nada registrado/.test(e.textContent)), await visible(p, "#formacion-form")], [true, false]);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true, DIC));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("el informe para la Junta arranca en el último cuatrimestre terminado (mayo a agosto de 2025)", [await p.$eval("#informe-cuatrimestre", (e) => e.value),
        await p.$$eval("#informe-cuatrimestre option", (os) => os.map((o) => o.textContent))],
        ["2025-1", ["De setiembre a diciembre de 2025 (en curso)", "De mayo a agosto de 2025", "De enero a abril de 2025"]]);
    const [informeJ] = await Promise.all([p.waitForEvent("download"), p.click("#informe-junta")]);
    const infJ = require("fs").readFileSync(await informeJ.path()).toString("latin1");
    igual("y trae los torneos del cuatrimestre con su principal, quién arbitró, quién puede subir y lo que arbitró de más",
        [informeJ.suggestedFilename(), infJ.includes("Blitz con norma 2025"), infJ.includes("Nacional de Heredia 2025"), infJ.includes("Internacional grande 2025"),
         infJ.includes("Abierto Internacional 2025")], ["informe-arbitraje-2025-05.pdf", true, true, false, false]);
    await p.evaluate(() => { window.TablaExcel.bajar = (nombre, hojas) => { window.__excel = { nombre, hojas }; }; });
    await p.click("#subir-excel");
    const exSubir = await p.evaluate(() => window.__excel);
    igual("«Quiénes pueden subir» en Excel", [exSubir.nombre, exSubir.hojas[0].filas.slice(1).map((f) => [f[0], f[2], f[3], f[5], f[6], f[7], f[8]])],
        ["subir-de-categoria.xlsx", [["Rojas Prueba, Luis", "B", "A", "Le alcanzaría", 2, 1, 2]]]);
    await p.selectOption("#federacion", "mas");
    igual("el filtro «Más de lo que deja su categoría»", (await filas(p, "#tabla-arbitros")).map((f) => f[0]), ["Rojas Prueba, Luis"]);
    await ctx.close();
    // Con su categoría y sus cursos registrados: el 104 (de antes de la B) ya no cuenta, y puede pedirla.
    FORMACION.push({ id: "f1", fide_id: 6500003, tipo: "categoria", categoria: "B", fecha: "2024-01-15", horas: null, nota: null, detalle: "" },
        { id: "f2", fide_id: 6500003, tipo: "intermedio", categoria: null, fecha: "2025-06-01", horas: 20, nota: 90, detalle: "Taller intermedio FCA" },
        { id: "f3", fide_id: 6500003, tipo: "pareo", categoria: null, fecha: "2025-03-01", horas: 10, nota: 85, detalle: "Swiss-Manager" });
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true, DIC));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("con la categoría y los cursos registrados: cumple el año y los dos cursos, y puede pedirla; el 104, de antes de la B, ya no cuenta",
        [await p.$eval("[data-categoria='B'] .of-estado", (e) => e.textContent), await p.$$eval("[data-categoria='B'] li[data-estado]", (ls) => ls.map((l) => l.dataset.estado)),
         await p.$$eval("[data-subir='revisar']", (x) => x.length), await p.$$eval("#tabla-formacion tbody tr", (t) => t.length),
         /\bnull\b/.test(await p.$eval("#ficha-categoria", (e) => e.textContent))],
        ["De B a A: Puede pedirla", ["Normas", "Revisar", "Cumple", "Cumple", "Cumple"], 0, 3, false]);
    await ctx.close();
    FORMACION[0].fecha = "2025-08-15"; FORMACION[2].nota = null;
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true, DIC));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("con la B desde agosto de 2025: le falta el año, solo cuenta el torneo de setiembre, el intermedio de junio ya no sirve (para la A, distinto del de la B) y el de pareo sin nota queda para revisar",
        [await p.$eval("[data-categoria='B'] .of-estado", (e) => e.textContent), await p.$$eval("[data-categoria='B'] li[data-estado]", (ls) => ls.map((l) => l.dataset.estado)),
         (await lis("[data-subir='firmes'] li")).map((t) => t.split(" · ")[1])],
        ["De B a A: Le falta una", ["Normas", "Revisar", "Falta", "Falta", "Revisar"], ["Abierto clásico 2025 (clásico, suizo, 9 rondas)"]]);
    await ctx.close();
    FORMACION.length = 0;
    TORNEOS.splice(-4, 4); CARGOS.splice(-7, 7); CR.pop(); ELO_CR.pop(); CR_CARGOS.pop();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true, DIC));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    await p.selectOption("#federacion", "inactivo");
    igual("el filtro «Sin actividad (art. 19)»: ni curso ni torneo válido para Elo en dos años (Ana fue solo asistente y de pareos)",
        (await filas(p, "#tabla-arbitros")).map((f) => f[0]).sort(), ["Rojas Prueba, Luis", "Soto Prueba, Ana", "Viejo Prueba, Juan"]);
    await ctx.close();
    // Administración registra y quita.
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true, DIC, true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("administración ve el formulario; con «Categoría» no pide horas", [await visible(p, "#formacion-form"), await visible(p, "#formacion-horas")], [true, false]);
    await p.selectOption("#formacion-categoria", "B");
    await p.fill("#formacion-fecha", "2024-01-15");
    await p.click("#formacion-guardar");
    await p.waitForFunction(() => /quedó registrado/.test(document.getElementById("formacion-estado").textContent));
    await p.selectOption("#formacion-tipo", "actualizacion");
    igual("con un curso pide las horas", await visible(p, "#formacion-horas"), true);
    await p.fill("#formacion-fecha", "2025-02-01"); await p.fill("#formacion-horas", "20"); await p.fill("#formacion-nota", "95");
    await p.click("#formacion-guardar");
    await p.waitForFunction(() => document.querySelectorAll("#tabla-formacion tbody tr[data-tipo]").length === 2);
    igual("quedan los dos, el más nuevo primero, y el curso de actualización lo deja activo", [(await filas(p, "#tabla-formacion")).map((f) => f.slice(0, 4)),
        /^Actividad según el art\. 19 del reglamento: Activo \(curso\), 20 horas/.test(await p.$eval("#ficha-actividad-fca", (e) => e.textContent))],
        [[["01/02/2025", "Curso de actualización", "20", "95 %"], ["15/01/2024", "Categoría B", "—", "—"]], true]);
    await p.selectOption("#formacion-tipo", "categoria"); await p.selectOption("#formacion-categoria", "B"); await p.fill("#formacion-fecha", "2024-03-01");
    await p.click("#formacion-guardar");
    await p.waitForFunction(() => /ya está registrada/.test(document.getElementById("formacion-estado").textContent));
    igual("la misma categoría dos veces no entra (el índice único de la base)", (await filas(p, "#tabla-formacion")).length, 2);
    await p.click("#tabla-formacion tbody tr[data-tipo='actualizacion'] button");
    await p.click("button:text-is('Quitarlo')");
    await p.waitForFunction(() => document.querySelectorAll("#tabla-formacion tbody tr[data-tipo]").length === 1);
    igual("«Quitar» pide confirmar y lo quita", (await filas(p, "#tabla-formacion")).map((f) => f[1]), ["Categoría B"]);
    await ctx.close();
    FORMACION.length = 0;

    console.log("\n=== El arbitraje del país en números y las novedades ===");
    // El AF de Ana hace 11 meses (sale) y el AI de Óscar hace 13 (ya no).
    const anaF = ARBITROS_FIDE.find((f) => f.fide_id === 6500002), oscarF = ARBITROS_FIDE.find((f) => f.fide_id === 6500001);
    anaF.af_perfil = "2025-11-01"; oscarF.ia_fecha = "2025-09-01";
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("año por año: quién arbitró en Costa Rica, por primera vez, su último año, torneos, carga, concentración y títulos (2026: solo el AI de Óscar)",
        await filas(p, "#tabla-numeros-anios"),
        [["2026", "0", "0", "0", "0", "0", "0 %", "0", "1"], ["2025", "1", "0", "1", "1", "1", "100 %", "0", "0"], ["2024", "2", "0", "1", "4", "2,5", "60 %", "2", "0"],
         ["2023", "2", "2", "1", "1", "1", "50 %", "0", "0"], ["2019", "1", "1", "0", "1", "1", "100 %", "0", "0"], ["2015", "1", "1", "1", "1", "1", "100 %", "0", "0"]]);
    igual("hoy, los de la lista de la Federación por categoría y cuántos activos (art. 19)", await filas(p, "#tabla-numeros-hoy"), [["AN-B", "1", "0"], ["AN-C", "1", "0"]]);
    igual("las novedades: el AF de Ana de hace 11 meses sí, el AI de Óscar de hace 13 no", await filas(p, "#tabla-novedades"),
        [["01/11/2025", "Soto Prueba, Ana", "Título de Árbitro FIDE"]]);
    await p.evaluate(() => { window.TablaExcel.bajar = (nombre, hojas) => { window.__excel = { nombre, hojas }; }; });
    await p.click("#numeros-excel");
    const exNum = await p.evaluate(() => window.__excel);
    igual("los números en Excel, en dos hojas", [exNum.nombre, exNum.hojas.map((h) => h.nombre), exNum.hojas[1].filas[3]], ["arbitraje-en-numeros.xlsx", ["Hoy", "Año por año"], [2024, 2, 0, 1, 4, 2.5, 60, 2, 0]]);
    await ctx.close();
    delete anaF.af_perfil; oscarF.ia_fecha = null;
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("sin nada en los últimos 12 meses, las novedades lo dicen", await p.$eval("#tabla-novedades tbody", (b) => b.textContent), "Nada nuevo en los últimos 12 meses.");
    await ctx.close();

    console.log("\n=== La categoría sugerida ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("Juan (AN sin categoría): sin normas, C; Luis (B): sus torneos no la respaldan, pero no baja, y ya fue adjunto en uno de FIDE (trabajo de A)",
        (await filas(p, "#tabla-sugerida")).map((f) => f.slice(0, 6)),
        [["Viejo Prueba, Juan", "AN", "—", "C", "C", "A"], ["Rojas Prueba, Luis", "AN", "B", "B (se queda)", "C", "A"]]);
    igual("y la cuenta", await p.$eval("#sugerida-cuenta", (e) => e.textContent),
        "1 árbitro debería tener otra categoría según sus torneos; 1 más arbitra como una categoría mayor sin las normas para tenerla.");
    await ctx.close();
    // Dos pares de normas de Luis firmados por Óscar: uno en 2025 y otro más de un año después. Y Ana (AF) con la C en la lista de la Federación.
    const rapido = (id, nombre, inicio) => { const t = T(id, nombre, inicio, "no", "no"); t.ritmo = "Rapid"; t.rondas = 7; return t; };
    const blitzS = T(109, "Blitz con norma 2025", "2025-08-01", "no", "no"); blitzS.ritmo = "Blitz"; blitzS.rondas = 7;
    TORNEOS.push(blitzS, T(110, "Abierto clásico 2025", "2025-09-01", "si", "no"), rapido(113, "Rápido de setiembre 2026", "2026-09-10"), T(114, "Abierto clásico 2026", "2026-09-20", "si", "no"));
    for (const id of [109, 110, 113, 114]) CARGOS.push({ torneo_id: id, fide_id: 6500003, cargo: "Arbiter" }, { torneo_id: id, fide_id: 6500001, cargo: "Chief" });
    ARBITROS_FIDE.find((f) => f.fide_id === 6500002).categoria_nacional = "C";
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    const sug = porNombre(await filas(p, "#tabla-sugerida"));
    igual("Luis: un par en 2025 (B) y otro un año después (A) → sugerida A; Ana es AF con la C en la lista → A",
        [sug["Rojas Prueba, Luis"].slice(2, 5), /^Para la B: Blitz con norma 2025 \(01\/08\/2025, blitz, suizo\) y Abierto clásico 2025 .*para la A, un año después: Rápido de setiembre 2026/.test(sug["Rojas Prueba, Luis"][6]),
         sug["Soto Prueba, Ana"].slice(1, 4), (await filas(p, "#tabla-sugerida"))[0][0]],
        [["B", "A", "A"], true, ["AF", "C", "A"], "Rojas Prueba, Luis"]);
    await p.evaluate(() => { window.TablaExcel.bajar = (nombre, hojas) => { window.__excel = { nombre, hojas }; }; });
    await p.click("#sugerida-excel");
    const exSug = await p.evaluate(() => window.__excel);
    igual("las novedades: el 20/09/2026 Luis junta las 3 normas para el AF y completa el segundo par, que respalda la A",
        (await filas(p, "#tabla-novedades")).map((f) => f.slice(0, 3)),
        [["20/09/2026", "Rojas Prueba, Luis", "Junta las 3 normas de torneo para pedir el AF (la última, Abierto clásico 2026)"],
         ["20/09/2026", "Rojas Prueba, Luis", "Completa el segundo par de normas, que respalda la categoría A (Abierto clásico 2026)"]]);
    igual("el Excel trae a todos los que tienen título (también los que coinciden)", [exSug.nombre, exSug.hojas[0].filas.slice(1).map((f) => [f[0], f[3], f[4]])],
        ["categoria-sugerida.xlsx", [["Ángulo Prueba, Óscar", "", "A"], ["Rojas Prueba, Luis", "B", "A"], ["Soto Prueba, Ana", "C", "A"], ["Viejo Prueba, Juan", "", "C"]]]);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("y la ficha lo dice en «Para subir de categoría»", await p.$eval("[data-categoria] [data-sugerida]", (e) => [e.dataset.sugerida, /^Categoría sugerida: A\. /.test(e.textContent)]), ["A", true]);
    await ctx.close();
    TORNEOS.splice(-4, 4); CARGOS.splice(-8, 8); delete ARBITROS_FIDE.find((f) => f.fide_id === 6500002).categoria_nacional;
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500004", true, DIC));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("Juan (AN sin categoría en la lista de la Federación): lo dice", /No figura con categoría en la lista de la Federación/.test(await p.$eval("#ficha-categoria", (e) => e.textContent)), true);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500001", true, DIC));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("Óscar (IA): sin la tarjeta de la Federación, solo la de FIDE", await p.$eval("#ficha-categoria", (e) => [...e.children].map((c) => c.hasAttribute("data-categoria-fide"))), [true]);
    await ctx.close();

    console.log("\n=== Lo que registra administración: el Excel, el correo y los avisos ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("sin ser de administración no se ve ni la carga, ni el correo, ni los avisos",
        [await p.$eval("#registro", (e) => e.checkVisibility()), await visible(p, "#contacto-form"), (await p.evaluate(() => window.__pedidos)).includes("arbitros_cr_por_vencer"),
         (await p.evaluate(() => window.__pedidos)).some((x) => x.startsWith("arbitros_cr_contacto"))], [false, false, false, false]);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true, null, true));
    await p.waitForFunction(() => document.querySelectorAll("#tabla-avisos tbody tr").length > 0);
    // «Sale el día 1» es el primer día del mes que viene (hora de Costa Rica): se calcula, no se escribe
    // a mano (escrito «01/11/2026» la prueba se rompió justo el 1 de noviembre).
    const hoyCR = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Costa_Rica" }).format(new Date());
    const mesHoy = +hoyCR.slice(5, 7), anioHoy = +hoyCR.slice(0, 4);
    const proximoDia1 = "01/" + String(mesHoy === 12 ? 1 : mesHoy + 1).padStart(2, "0") + "/" + (mesHoy === 12 ? anioHoy + 1 : anioHoy);
    igual("los avisos: cuándo vence, a quién, y si sale el día 1, no sale (sin correo) o ya se avisó",
        [await filas(p, "#tabla-avisos"), await p.$eval("#avisos-cuenta", (e) => e.textContent)],
        [[["20/11/2026", "Viejo Prueba, Juan", "Quedas inactivo en la Federación", "No sale: no tiene correo"],
          ["01/12/2026", "Rojas Prueba, Luis", "La norma de AF deja de contar", "Sale el " + proximoDia1],
          ["20/12/2026", "Rojas Prueba, Luis", "El seminario deja de valer", "Avisado el 01/10/2026"]],
         "3 cosas se vencen en los próximos 90 días: 1 sale el " + proximoDia1 + " y 1 no sale porque esa persona no tiene correo registrado."]);
    const csv = ["ID FIDE;Nombre;Qué;Categoría;Fecha;Horas;Nota;Detalle;Correo;Autorizó;Avisos",
        "6500003;;Categoría;B;15/01/2024;;;;;;",
        ";Luis Rojas Prueba;Curso intermedio;;01/06/2025;20;90%;Taller FCA;;;",
        "6500003;;;;;;;;Luis@Correo.com;Formulario del curso;sí",
        "9999999;;Categoría;C;01/01/2024;;;;;;",
        "6500004;;Curso intermedio;;01/06/2025;;;;;;",
        ";Nadie Que Exista;Categoría;C;01/01/2024;;;;;;",
        "6500004;;Categoría;D;01/01/2024;;;;;;",
        "6500004;;;;;;;;juan@correo.com;;"].join("\n");
    await p.setInputFiles("#registro-archivo", { name: "registro.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await p.waitForFunction(() => document.querySelectorAll("#tabla-registro tbody tr").length === 8);
    igual("el Excel: fila por fila qué entra y por qué no (por ID o por nombre en cualquier orden)", (await filas(p, "#tabla-registro")).map((f) => [f[0], f[1], f[3].split(":")[0]]),
        [["2", "Rojas Prueba, Luis", "Entra"], ["3", "Rojas Prueba, Luis", "Entra"], ["4", "Rojas Prueba, Luis", "Entra"], ["5", "9999999", "No entra"],
         ["6", "Viejo Prueba, Juan", "No entra"], ["7", "Nadie Que Exista", "No entra"], ["8", "Viejo Prueba, Juan", "No entra"], ["9", "Viejo Prueba, Juan", "No entra"]]);
    igual("y dice el porqué de cada una", (await filas(p, "#tabla-registro")).slice(3).map((f) => f[3]),
        ["No entra: El ID FIDE 9999999 no está en la lista de árbitros de FIDE.", "No entra: Un curso lleva sus horas (de 0,5 a 500).",
         "No entra: No se reconoce ese nombre: ponle el ID FIDE.", "No entra: La categoría tiene que ser A, B o C.",
         "No entra: Con el correo va cómo autorizó recibir los avisos (columna «Autorizó»)."]);
    igual("lo que registra cada fila, en palabras", (await filas(p, "#tabla-registro")).slice(0, 3).map((f) => f[2]),
        ["Categoría B desde el 15/01/2024", "Curso intermedio del 01/06/2025, 20 horas, 90 %", "Correo luis@correo.com"]);
    igual("el botón dice cuántas entran", await p.$eval("#registro-guardar", (b) => b.textContent), "Registrar 3 filas");
    await p.click("#registro-guardar");
    await p.waitForFunction(() => /Listo/.test(document.getElementById("registro-estado").textContent));
    igual("las registra y lo dice", [await p.$eval("#registro-estado", (e) => e.textContent), (await filas(p, "#tabla-registro")).slice(0, 3).map((f) => f[3]), await visible(p, "#registro-guardar")],
        ["Listo: 3 filas registradas.", ["Registrado", "Registrado", "Registrado"], false]);
    await p.evaluate(() => { window.TablaExcel.bajar = (nombre, hojas) => { window.__excel = { nombre, hojas }; }; });
    await p.click("#registro-plantilla");
    igual("la plantilla, con las columnas que lee", await p.evaluate(() => [window.__excel.nombre, window.__excel.hojas[0].filas[0]]),
        ["registro-arbitros.xlsx", ["ID FIDE", "Nombre", "Qué", "Categoría", "Fecha", "Horas", "Nota", "Detalle", "Correo", "Autorizó", "Avisos"]]);
    await p.click("#tabla-arbitros tbody tr th button:text-is('Rojas Prueba, Luis')");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("en la ficha de Luis: lo registrado y su correo, con los avisos encendidos",
        [(await filas(p, "#tabla-formacion")).map((f) => f[1]), await p.$eval("#contacto-correo", (e) => e.value), await p.$eval("#contacto-autorizo", (e) => e.value),
         await p.$eval("#contacto-avisos", (e) => e.checked), await p.$eval("#contacto-estado", (e) => e.textContent)],
        [["Curso intermedio", "Categoría B"], "luis@correo.com", "Formulario del curso", true, "Le llegan los avisos de lo que se le vence."]);
    await p.uncheck("#contacto-avisos");
    await p.click("#contacto-guardar");
    await p.waitForFunction(() => /guardado/.test(document.getElementById("contacto-estado").textContent));
    igual("apagar los avisos y guardar", await p.$eval("#contacto-estado", (e) => e.textContent), "Listo: guardado. Tiene correo, pero los avisos están apagados.");
    await p.fill("#contacto-correo", "no-es-correo");
    await p.click("#contacto-guardar");
    igual("un correo inválido no se guarda", await p.$eval("#contacto-estado", (e) => e.textContent), "Ese correo no parece válido.");
    await p.click("#contacto-quitar");
    await p.click("button:text-is('Sí, quitarlo')");
    await p.waitForFunction(() => /Sin correo/.test(document.getElementById("contacto-estado").textContent));
    igual("«Quitar el correo» pide confirmar y lo quita", [await p.$eval("#contacto-estado", (e) => e.textContent), await visible(p, "#contacto-quitar")],
        ["Sin correo: no le llegan los avisos.", false]);
    await ctx.close();

    console.log("\n=== En memoria ===");
    MEMORIA.push({ fide_id: 6500004 });
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html", true));
    await p.waitForFunction(() => document.querySelectorAll("#tabla-arbitros tbody tr").length > 0);
    igual("en la lista, solo Juan lleva «En memoria», escrito y con el lazo (que el lector de pantalla no lee)",
        await p.$$eval("#tabla-arbitros tbody th", (ths) => ths.filter((th) => th.querySelector("[data-memoria]")).map((th) => {
            const m = th.querySelector("[data-memoria]");
            return [th.querySelector("button").textContent, m.textContent, m.querySelector("svg").getAttribute("aria-hidden"), m.checkVisibility()];
        })), [["Viejo Prueba, Juan", "En memoria", "true", true]]);
    await p.click("#tabla-arbitros tbody th button:text-is('Viejo Prueba, Juan')");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("y en su ficha, junto al nombre", await p.$eval("#ficha-titulo", (e) => [e.firstChild.textContent, e.querySelector("[data-memoria]") && e.querySelector("[data-memoria]").textContent]),
        ["Viejo Prueba, Juan", "En memoria"]);
    await ctx.close();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("quien no está en la tabla no lo lleva", await p.$$eval("#ficha-titulo [data-memoria]", (l) => l.length), 0);
    await ctx.close();
    MEMORIA.pop();
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500004", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("quien no está en la lista de FIDE también lleva el seminario que aprobó", await p.$$eval("#ficha-historial li[data-seminario]", (ls) => ls.map((l) => [l.querySelector("strong").textContent, /Ya no vale/.test(l.textContent)])),
        [["09/10/2011 · Seminario de AF: 11th Internet Based Oct 2011 (WOM)", true]]);
    igual("y sin ser de administración no se ve el botón de «En memoria»", await visible(p, "#memoria-admin"), false);
    await ctx.close();
    // Administración la pone y la quita desde la ficha, confirmando.
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true, null, true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("administración ve «Marcar «En memoria»»", [await visible(p, "#memoria-admin"), await p.$eval("#memoria-boton", (b) => b.textContent)], [true, "Marcar «En memoria»"]);
    await p.click("#memoria-boton");
    await p.click("button:text-is('Sí, marcarlo')");
    await p.waitForFunction(() => document.querySelector("#ficha-titulo [data-memoria]"));
    igual("al marcarla, el lazo sale en su ficha y en la lista, y el botón la deja quitar",
        [await p.$$eval("#tabla-arbitros tbody th", (ths) => ths.filter((th) => th.querySelector("[data-memoria]")).map((th) => th.querySelector("button").textContent)), await p.$eval("#memoria-boton", (b) => b.textContent)],
        [["Rojas Prueba, Luis"], "Quitar «En memoria»"]);
    await p.click("#memoria-boton");
    await p.click("button:text-is('Sí, quitarlo')");
    await p.waitForFunction(() => !document.querySelector("#ficha-titulo [data-memoria]"));
    igual("y al quitarla, se va", await p.$$eval("#tabla-arbitros tbody [data-memoria]", (l) => l.length), 0);
    await ctx.close();

    console.log("\n=== Quien solo está en chess-results ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500005", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("la ficha dice que no figura en FIDE", /No figura como árbitro en ninguna ficha de FIDE/.test(await p.$eval("#ficha-sub", (e) => e.textContent)), true);
    const e = await filas(p, "#tabla-torneos");
    igual("sus tres torneos (el que no se jugó, fuera), con los dos roles juntos", e.map((f) => [f[2], f[3]]),
        [["No (Elo nacional)", "Árbitro principal, Director del torneo"], ["Sí", "Árbitro"], ["No", "Árbitro"]]);
    igual("en un torneo de FIDE donde arbitró sin figurar en su ficha: revisar", [e[1][8].startsWith("Revisar"), /no figura como árbitro; sí en chess-results/.test(e[1][8])], [true, true]);
    igual("el que no es de FIDE enlaza a chess-results", await p.$eval("#tabla-torneos tbody tr:first-child a", (a) => a.href), "https://chess-results.com/tnr900002.aspx?lan=2");
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
