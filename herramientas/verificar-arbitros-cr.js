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
   - las tablas se piden de mil en mil (range).

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
      seminarios: [{ tipo: "IA", seminario: "18th IACS Internet Based Aug 2025 (ARB)", mes: "2025-09", fecha: "2025-09-09", fuente: "https://arbiters.fide.com/informe-2.pdf" }] },
    { fide_id: 6500002, titulo: "FA", inactivo: true, categoria: "D", licencia: "No", af_fecha: null, af_consejo: "", ia_fecha: null, ia_consejo: "", lista: "2026-10-12", solicitudes: [], seminarios: [] },
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
    { clave: 900006, nombre: "Nacional Sub-16 2024", inicio: "2024-05-01", fin: "2024-05-03", lugar: "San José", control: "60 min", rondas: 7, jugadores: 18, fide_torneo: null },
    // En el extranjero: sale de chess-results, sin cruzar con FIDE.
    { clave: 900007, nombre: "Abierto Internacional de Panamá 2024", inicio: "2024-11-10", fin: "2024-11-15", lugar: "Ciudad de Panamá", control: "90 min + 30 s", rondas: 9, jugadores: 60, fide_torneo: null, pais: "PAN" },
    { clave: 900005, nombre: "Torneo que no se jugó 2024", inicio: "2024-09-01", fin: "2024-09-01", lugar: "", control: "", rondas: 0, jugadores: 10, fide_torneo: null },
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

function doble(tieneLicencia) {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const TABLAS = ${JSON.stringify({ arbitros_cr: ARBITROS, arbitros_cr_torneos: TORNEOS, arbitros_cr_cargos: CARGOS, arbitros_cr_cr: CR.map((c) => ({ pais: "CRC", ...c })), arbitros_cr_cr_cargos: CR_CARGOS, arbitros_cr_fide: ARBITROS_FIDE, arbitros_cr_sin_id: SIN_ID })};
  const LICENCIA = ${tieneLicencia ? "true" : "false"};
  window.__pedidos = [];
  function respuesta(data, error) { return Promise.resolve({ data, error: error || null }); }
  TABLAS.arbitros_cr_normas_revision = [];
  window.__archivos = {};
  let nuevas = 0;
  function consulta(tabla) {
    // Los filtros se anotan y se aplican en el RESOLVER, de verdad.
    const q = { _desde: 0, _hasta: 999, _filtros: [], _op: "select" };
    ["select", "order", "in", "limit"].forEach((m) => { q[m] = () => q; });
    q.eq = (c, v) => { q._filtros.push([c, v]); return q; };
    q.insert = (fila) => { q._op = "insert"; q._fila = fila; return q; };
    q.delete = () => { q._op = "delete"; return q; };
    q.single = () => { q._single = true; return q; };
    q.range = (a, b) => { q._desde = a; q._hasta = b; return q; };
    q.then = (ok, mal) => {
      window.__pedidos.push(tabla + " " + (q._op === "select" ? q._desde + "-" + q._hasta : q._op));
      const pasa = (f) => q._filtros.every(([c, v]) => f[c] === v);
      let r;
      if (!LICENCIA) r = { data: q._op === "select" ? [] : null, error: q._op === "select" ? null : { message: "sin permiso" } };   // la RLS
      else if (q._op === "insert") {
        const fila = { id: "n" + (++nuevas), creada_por: "yo", creada: "2026-10-16T04:00:00Z", firmante_fide_id: null, firmante_nombre: "", archivo: null, nombre_archivo: "", ...q._fila };
        const rep = TABLAS[tabla].some((f) => ["creada_por", "fide_id", "cual", "torneo_id"].every((k) => f[k] === fila[k]));
        // Como el trigger de la base: sin la versión de la privacidad, no entra.
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(fila.privacidad_version || "")) r = { data: null, error: { message: "Para subir una norma hay que aceptar la Política de privacidad.", code: "23514" } };
        else if (rep) r = { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        else { TABLAS[tabla].push(fila); r = { data: q._single ? fila : [fila], error: null }; }
      } else if (q._op === "delete") { TABLAS[tabla] = TABLAS[tabla].filter((f) => !pasa(f)); r = { data: null, error: null }; }
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
      if (nombre === "soy_admin") return respuesta(false);
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

async function abrir(browser, ruta, tieneLicencia) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(tieneLicencia) }));
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
    igual("pide cada tabla de mil en mil", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("arbitros_cr")).sort()),
        ["arbitros_cr 0-999", "arbitros_cr_cargos 0-999", "arbitros_cr_cr 0-999", "arbitros_cr_cr_cargos 0-999", "arbitros_cr_fide 0-999", "arbitros_cr_sin_id 0-999", "arbitros_cr_torneos 0-999"]);
    let m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("los cinco árbitros salen (todos los años), también quien solo está en chess-results", Object.keys(m).sort(),
        ["Ángulo Prueba, Óscar", "Quiros Prueba, Eduardo", "Rojas Prueba, Luis", "Soto Prueba, Ana", "Viejo Prueba, Juan"].sort());
    // Óscar: 4 de FIDE (el 900001 es el mismo que el 101: no suma) y 2 que no (900002, director; 900006, árbitro); el 900005 no se jugó.
    // AF del Consejo el 15/04/2024: el de 2023 no cuenta para AI; el del 01/05/2024 queda para revisar; el de 2025 vale para AI y ya no para AF.
    igual("Óscar: activo, 6 torneos (4 FIDE, 2 no), 2 principal, 1 adjunto, 2 árbitro, AF 2, AI 2 (1 para revisar: el de 16 días después del Consejo), del 01/03/2023 al 10/01/2025",
        m["Ángulo Prueba, Óscar"].slice(1), ["IA", "2024", "2026", "Activo", "6", "4", "2", "0", "2", "1", "2", "2", "2 (1)", "Ya es AF", "Ya es AI", "01/03/2023", "10/01/2025"]);
    // Eduardo: el 900004 es el 102 de FIDE (vale, pero no figura en la ficha de FIDE: revisar); 900002 y 900003 no son de FIDE.
    igual("Eduardo: 3 torneos (1 FIDE para revisar, 2 no), sin AF no le vale ninguno para AI, último 10/07/2024",
        m["Quiros Prueba, Eduardo"].slice(1), ["—", "—", "—", "No figura", "3", "1", "2", "0", "1", "0", "2", "1 (1)", "0", "0 de 3", "0 de 4", "01/05/2019", "10/07/2024"]);
    igual("Ana: el asistente no vale, el de pareos queda para revisar (AF 1 (1), AI 1 (1)) y su torneo en Panamá cuenta en el extranjero",
        m["Soto Prueba, Ana"].slice(1), ["FA", "2024", "—", "Inactivo", "3", "2", "1", "1", "0", "0", "1", "1 (1)", "1 (1)", "Ya es AF", "0 de 4", "01/05/2024", "10/01/2025"]);
    const luis = porNombre(await filas(p, "#tabla-arbitros"))["Rojas Prueba, Luis"];
    igual("Luis: Árbitro Nacional por la lista de FIDE (su perfil no lo dice), categoría B por la de la Federación, activo, «Hoy para AF» 1 de 3", [luis[1], luis[2], luis[4], luis[14]], ["AN-B", "—", "Activo", "1 de 3"]);
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
    igual("«La actividad en FIDE»: Ana inactiva primero, Óscar activo por lo menos hasta cuatro años después de su seminario de AI", await filas(p, "#tabla-actividad-fide"),
        [["Soto Prueba, Ana", "FA", "Inactivo", "—"], ["Ángulo Prueba, Óscar", "IA", "Activo", "09/09/2029"]]);
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
        ["2025", [["1.º", "Ángulo Prueba, Óscar", "1", "1", "1", "0", "0", "Igual (1.º)"], ["1.º", "Soto Prueba, Ana", "1", "0", "1", "0", "0", "Sube 1 (era 2.º)"]]]);
    await p.selectOption("#ranking-anio", "2024");
    await p.selectOption("#ranking-por", "principal");
    igual("2024 por «como principal»: Óscar y Eduardo con 1, y en 2023 nadie", (await filas(p, "#tabla-ranking")).map((f) => [f[0], f[1], f[3], f[7]]),
        [["1.º", "Ángulo Prueba, Óscar", "1", "No figuraba en 2023"], ["1.º", "Quiros Prueba, Eduardo", "1", "No figuraba en 2023"]]);
    igual("la columna elegida lo dice (aria-sort) y la cuenta también", [await p.$eval("#tabla-ranking th[data-col=principal]", (e) => e.getAttribute("aria-sort")),
        await p.$eval("#ranking-cuenta", (e) => e.textContent)], ["descending", "2 árbitros con torneos como principal en 2024."]);
    await p.selectOption("#ranking-por", "torneos");
    igual("2024 por torneos: los empates comparten el puesto y el siguiente salta (1, 2, 2)", (await filas(p, "#tabla-ranking")).map((f) => [f[0], f[1], f[2]]),
        [["1.º", "Ángulo Prueba, Óscar", "4"], ["2.º", "Quiros Prueba, Eduardo", "2"], ["2.º", "Soto Prueba, Ana", "2"]]);
    await p.selectOption("#ranking-anio", "2015");
    igual("el primer año no tiene año anterior", (await filas(p, "#tabla-ranking")).map((f) => f[7]), ["—"]);
    igual("la lista va ordenada por cantidad de torneos", (await filas(p, "#tabla-arbitros")).map((f) => f[0])[0], "Ángulo Prueba, Óscar");

    await p.selectOption("#tipo", "nofide");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«No FIDE»: solo quienes tienen torneos que no son de FIDE, con esos", [Object.keys(m).sort(), m["Ángulo Prueba, Óscar"][5], m["Quiros Prueba, Eduardo"][5]],
        [["Quiros Prueba, Eduardo", "Soto Prueba, Ana", "Ángulo Prueba, Óscar"].sort(), "2", "2"]);
    await p.selectOption("#tipo", "fide");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«Solo FIDE»: Óscar con 4 y Eduardo con 1", [m["Ángulo Prueba, Óscar"][5], m["Quiros Prueba, Eduardo"][5]], ["4", "1"]);
    await p.selectOption("#tipo", "");

    await p.selectOption("#donde", "fuera");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«En el extranjero»: solo Ana, con su torneo en Panamá", [Object.keys(m), m["Soto Prueba, Ana"][5]], [["Soto Prueba, Ana"], "1"]);
    await p.selectOption("#donde", "cr");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«En Costa Rica»: Ana sin el de Panamá, Óscar igual", [m["Soto Prueba, Ana"][5], m["Soto Prueba, Ana"][8], m["Ángulo Prueba, Óscar"][5]], ["2", "0", "6"]);
    await p.selectOption("#donde", "");

    const cuentaGeneral = () => p.$eval("#cuenta", (e) => e.textContent);
    igual("cada torneo cuenta aparte", /con 9 torneos \(5 de FIDE y 4 que no; 1 en el extranjero\)/.test(await cuentaGeneral()), true);
    await p.selectOption("#contar", "festival");
    m = porNombre(await filas(p, "#tabla-arbitros"));
    igual("«Festivales como uno»: el 102 y el 900006 (mismo día) cuentan como uno de FIDE para Óscar; 2 principal y 2 árbitro siguen",
        m["Ángulo Prueba, Óscar"].slice(1), ["IA", "2024", "2026", "Activo", "5", "4", "1", "0", "2", "1", "2", "2", "2 (1)", "Ya es AF", "Ya es AI", "01/03/2023", "10/01/2025"]);
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
        [["10/01/2025", "Sí", "Árbitro principal"], ["01/08/2024", "Sí", "Árbitro adjunto principal"], ["10/07/2024", "No", "Director del torneo"],
         ["01/05/2024", "Sí", "Árbitro principal"], ["01/05/2024", "No", "Árbitro"], ["01/03/2023", "Sí", "Árbitro"]]);
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
         /Árbitro Nacional categoría B según la lista de la Federación Central de Ajedrez \(leída el 16\/10\/2026\)/.test(await p.$eval("#ficha-fide", (e) => e.textContent))], [true, true]);
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
        "Activo en la lista de árbitros de FIDE del 12/10/2026, licencia IA-D. AF aprobado por el Consejo el 15/04/2024 (2.ª reunión del Consejo de FIDE de 2024 (en línea)). La fecha oficial es la que FIDE anota en su perfil, de dos a cinco semanas después: hasta tenerla, lo que empezó en los 60 días siguientes queda para revisar."
        + " Sigue activo por lo menos hasta el 09/09/2029: cuatro años desde su seminario de AI (B.06.3, 2). Un curso de actualización después lo corre.");
    const hist = await p.$$eval("#ficha-historial > ul > li", (ls) => ls.map((l) => l.querySelector("strong").textContent));
    igual("su historial en FIDE: las solicitudes, la más nueva primero, y el seminario", hist,
        ["23/08/2026 · Solicitud de AI: Aprobada", "02/04/2025 · Solicitud de AI: Rechazada", "09/09/2025 · Seminario de AI: 18th IACS Internet Based Aug 2025 (ARB)"]);
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

    console.log("\n=== Revisar normas antes de mandarlas ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500003", true));
    await p.waitForFunction(() => document.getElementById("revision").checkVisibility());
    igual("Luis (AN) arranca en la solicitud de AF, con sus torneos de FIDE para elegir y nada subido",
        [await p.$eval("#revision-cual", (e) => e.value), await p.$$eval("#revision-torneo option", (os) => os.map((o) => o.textContent)),
         await p.$$eval("#revision-lista > li", (ls) => ls.length), await visible(p, "#revision-solicitud")],
        ["af", ["Elegir el torneo", "01/03/2023 · Internacional con titulados 2023"], 0, false]);
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
    igual("la solicitud de AF con una sola norma: todavía no (le faltan 2)",
        [await p.$eval("#revision-solicitud .of-estado", (e) => e.textContent), /Normas de torneo: junta 1 de las 3; le faltan 2/.test(await p.textContent("#revision-solicitud"))],
        ["Todavía no: FIDE la rechazaría", true]);
    igual("después de subir, la casilla vuelve a quedar sin marcar (va con cada certificado)", await p.$eval("#revision-acepto", (e) => e.checked), false);
    await p.selectOption("#revision-torneo", "104");
    await p.setInputFiles("#revision-archivo", certificado);
    await p.check("#revision-acepto");
    await p.click("#revision-subir");
    igual("la misma norma dos veces no se sube", [await p.$$eval("#revision-lista > li", (ls) => ls.length), /ya está subida/.test(await p.textContent("body"))], [1, true]);
    await p.click("#revision-lista button:text-is('Quitar esta norma')");
    await p.click("button:text-is('Quitar la norma')");
    await p.waitForFunction(() => document.querySelectorAll("#revision-lista > li").length === 0);
    igual("«Quitar esta norma» la borra con su archivo y la solicitud desaparece",
        [Object.keys(await p.evaluate(() => window.__archivos)).length, await visible(p, "#revision-solicitud")], [0, false]);
    await ctx.close();

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

    console.log("\n=== Quien solo está en chess-results ===");
    ({ ctx, p } = await abrir(browser, "arbitros-cr.html#6500005", true));
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("la ficha dice que no figura en FIDE", /No figura como árbitro en ninguna ficha de FIDE/.test(await p.$eval("#ficha-sub", (e) => e.textContent)), true);
    const e = await filas(p, "#tabla-torneos");
    igual("sus tres torneos (el que no se jugó, fuera), con los dos roles juntos", e.map((f) => [f[2], f[3]]),
        [["No", "Árbitro principal, Director del torneo"], ["Sí", "Árbitro"], ["No", "Árbitro"]]);
    igual("en un torneo de FIDE donde arbitró sin figurar en su ficha: revisar", [e[1][8].startsWith("Revisar"), /no figura como árbitro; sí en chess-results/.test(e[1][8])], [true, true]);
    igual("el que no es de FIDE enlaza a chess-results", await p.$eval("#tabla-torneos tbody tr:first-child a", (a) => a.href), "https://chess-results.com/tnr900002.aspx?lan=2");
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
