/* Comprueba, en un navegador de verdad, las situaciones de árbitro de a una en
   la clase en vivo (la parte de abajo de js/clase-reloj.js): el profe pone una
   situación, a cada alumno le sale sola, cada «Comprobar» del alumno se anota
   en la base y el profe ve el cuadro de quién lleva cuáles.

   Existe porque lo que se rompe acá no da ningún error: si el alumno anotara
   con el envío o la situación equivocados, la base lo rechazaría callada (la
   práctica sigue igual, solo no se cuenta) y el cuadro del profe quedaría
   vacío; si el cuadro sumara mal dos envíos de la misma situación, diría que
   alguien la resolvió a la primera cuando no.

   Monta solo lo que usa clase-reloj.js (las cajas de sesion.html con sus id)
   sobre una página de mentira, con un doble de Supabase que filtra de verdad
   en el resolver (eq, gte, in) y anota cada update y cada rpc.

   Lo que revisa:
   1. El profe con permiso ve la lista de las 12 situaciones.
   2. «Poner esta situación a todos» manda {id, control, situacion} con el
      control de esa situación, y la lista pasa a la siguiente.
   3. El alumno con esa situación puesta anota cada «Comprobar» con el envío y
      la situación de la clase; el profe y quien observa no anotan nada.
   4. El cuadro: una fila por alumno, una columna por situación, «✓ a la
      primera» / «✓ en el intento N» / «✗ N intentos» / «—», el resumen de la
      situación puesta, los nombres por textContent, y dos envíos de la misma
      situación sumados bien. Solo lo de esta clase (owner_id). */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

let fallos = 0;
const ok = (cond, texto) => { console.log((cond ? "  ✓ " : "  ✗ ") + texto); if (!cond) fallos++; };

const CODIGO = fs.readFileSync(path.join(__dirname, "..", "js", "clase-reloj.js"), "utf8");
const PROFE = "11111111-1111-1111-1111-111111111111";
const OTRO_PROFE = "99999999-9999-9999-9999-999999999999";
const ANA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BETO = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const HTML = `<!doctype html><meta charset="utf-8">
<section id="reloj-tarjeta" hidden><div id="reloj-host"></div></section>
<details id="reloj-caja" hidden open>
  <summary>Reloj</summary>
  <select id="reloj-select"></select>
  <button id="reloj-mandar-btn" type="button">Poner el reloj en la clase</button>
  <p id="reloj-enviado"></p>
  <select id="reloj-sit-select"></select>
  <button id="reloj-sit-btn" type="button">Poner esta situación a todos</button>
  <button id="reloj-avance-btn" type="button">Actualizar</button>
  <div id="reloj-avance"></div>
  <button id="reloj-quitar-btn" type="button" hidden>Quitar</button>
  <p id="reloj-aviso"></p>
</details>`;

/* El doble: los filtros se aplican en el resolver (al hacer await), de verdad. */
const DOBLE = `
window.__llamadas = { updates: [], rpcs: [] };
window.__tablas = { reloj_situaciones: [], profiles: [] };
function consulta(tabla) {
  const filtros = []; let cambios = null;
  const q = {
    select() { return q; },
    eq(c, v) { filtros.push((f) => f[c] === v); return q; },
    gte(c, v) { filtros.push((f) => String(f[c]) >= String(v)); return q; },
    in(c, vs) { filtros.push((f) => vs.includes(f[c])); return q; },
    limit() { return q; },
    update(c) { cambios = c; return q; },
    single() { q.uno = true; return q; },
    then(res, rej) {
      if (cambios) {
        window.__llamadas.updates.push({ tabla, cambios: JSON.parse(JSON.stringify(cambios)) });
        return Promise.resolve({ data: q.uno ? cambios : [cambios], error: null }).then(res, rej);
      }
      const filas = (window.__tablas[tabla] || []).filter((f) => filtros.every((fn) => fn(f)));
      return Promise.resolve({ data: q.uno ? filas[0] || null : filas, error: null }).then(res, rej);
    },
  };
  return q;
}
window.sb = {
  from: (t) => consulta(t),
  rpc: (nombre, args) => {
    window.__llamadas.rpcs.push({ nombre, args });
    if (nombre === "puede_bajar") return Promise.resolve({ data: true, error: null });
    return Promise.resolve({ data: null, error: null });
  },
};
var isTeacher = true, esObservador = false, boardOwnerId = "${PROFE}", myGameStateId = 7;
window.__anuncios = [];
function anunciarALaClase(tipo, id, texto) { window.__anuncios.push([tipo, id, texto]); }
`;

(async () => {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.route("http://reloj.test/", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: HTML }));
  await page.goto("http://reloj.test/");
  await page.addScriptTag({ content: DOBLE });
  await page.addScriptTag({ content: CODIGO });

  // 1. El profe con permiso ve la lista.
  await page.evaluate(() => cargarRelojProfe());
  const opciones = await page.evaluate(() => [...document.querySelectorAll("#reloj-sit-select option")].map((o) => o.textContent));
  const N = await page.evaluate(() => RelojPractica.ILEGALES.length);
  ok(opciones.length === N && /^1\. /.test(opciones[0]) && opciones[N - 1].startsWith(N + ". "), `la lista trae las ${N} situaciones, numeradas (${opciones.length})`);
  ok(await page.evaluate(() => document.getElementById("reloj-caja").checkVisibility()), "la caja del reloj se ve para el profe con permiso");

  // 2. Poner la situación 7 (índice 6).
  await page.selectOption("#reloj-sit-select", "6");
  await page.click("#reloj-sit-btn");
  await page.waitForTimeout(200);
  const upd = await page.evaluate(() => window.__llamadas.updates.slice(-1)[0]);
  const ctl6 = await page.evaluate(() => RelojPractica.ILEGALES[6].control);
  ok(upd && upd.tabla === "game_state" && upd.cambios.reloj.situacion === 6 && JSON.stringify(upd.cambios.reloj.control) === JSON.stringify(ctl6)
    && /^[a-z0-9-]{4,40}$/.test(upd.cambios.reloj.id), `manda {id, control de la situación, situacion: 6} (${JSON.stringify(upd && upd.cambios)})`);
  ok(await page.evaluate(() => document.getElementById("reloj-sit-select").value) === "7", "después la lista pasa a la siguiente");
  ok(/situación 7 de/.test(await page.evaluate(() => document.getElementById("reloj-enviado").textContent)), "dice qué situación está puesta");
  const envio = upd.cambios.reloj.id;

  // 3. El alumno anota; el profe y quien observa no.
  await page.evaluate(() => anotarIntento(6, true));
  ok(await page.evaluate(() => !window.__llamadas.rpcs.some((r) => r.nombre === "reloj_situacion_intento")), "el profe no anota intentos");
  await page.evaluate(() => { isTeacher = false; esObservador = true; anotarIntento(6, true); });
  ok(await page.evaluate(() => !window.__llamadas.rpcs.some((r) => r.nombre === "reloj_situacion_intento")), "quien observa tampoco");
  await page.evaluate(() => { esObservador = false; anotarIntento(5, true); anotarIntento(6, false); anotarIntento(6, true); });
  const rpcs = await page.evaluate(() => window.__llamadas.rpcs.filter((r) => r.nombre === "reloj_situacion_intento").map((r) => r.args));
  ok(JSON.stringify(rpcs) === JSON.stringify([{ p_envio: envio, p_situacion: 6, p_logrado: false }, { p_envio: envio, p_situacion: 6, p_logrado: true }]),
    `el alumno anota con el envío y la situación de la clase, y no otra (${JSON.stringify(rpcs)})`);
  // Le llega otro envío (como por Realtime): se le anuncia.
  await page.evaluate((c) => pintarReloj({ id: "nuevo-eeee", control: c, situacion: 6 }), ctl6);
  ok(await page.evaluate(() => window.__anuncios.some(([t, id, txt]) => t === "reloj" && id === "nuevo-eeee" && /situación de árbitro/.test(txt || ""))), "al alumno se le anuncia que tiene una situación");
  ok(await page.evaluate(() => {
    const h = document.getElementById("reloj-host").shadowRoot;
    return h.querySelector(".raiz").classList.contains("solo") && !h.querySelector(".barra").checkVisibility();
  }), "al alumno le sale solo el reloj y la situación");

  // 4. El cuadro del profe.
  const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
  await page.evaluate(({ PROFE, OTRO_PROFE, ANA, BETO, envio, hace }) => {
    isTeacher = true;
    window.__tablas.profiles = [
      { id: ANA, full_name: "Ana <b>Mora</b>", email: "ana@x" },
      { id: BETO, full_name: "Beto Solís", email: "beto@x" },
    ];
    window.__tablas.reloj_situaciones = [
      // Situación 7, ahora: Ana a la primera, Beto todavía no (2 intentos).
      { owner_id: PROFE, student_id: ANA, envio, situacion: 6, intentos: 1, logrado_en: 1, created_at: hace[0] },
      { owner_id: PROFE, student_id: BETO, envio, situacion: 6, intentos: 2, logrado_en: null, created_at: hace[0] },
      // Situación 3 puesta dos veces: Ana falló 2 en la primera y salió al 1.º de la segunda → intento 3.
      { owner_id: PROFE, student_id: ANA, envio: "uno-aaaa", situacion: 2, intentos: 2, logrado_en: null, created_at: hace[1] },
      { owner_id: PROFE, student_id: ANA, envio: "dos-bbbb", situacion: 2, intentos: 1, logrado_en: 1, created_at: hace[2] },
      // De otra clase y de hace dos días: no cuentan.
      { owner_id: OTRO_PROFE, student_id: BETO, envio: "otro-cccc", situacion: 0, intentos: 1, logrado_en: 1, created_at: hace[0] },
      { owner_id: PROFE, student_id: BETO, envio: "viejo-dddd", situacion: 9, intentos: 1, logrado_en: 1, created_at: hace[3] },
    ];
  }, { PROFE, OTRO_PROFE, ANA, BETO, envio, hace: [hace(5), hace(60), hace(40), hace(48 * 60)] });
  await page.click("#reloj-avance-btn");
  await page.waitForTimeout(200);
  const cuadro = await page.evaluate(() => {
    const t = document.querySelector("#reloj-avance table");
    if (!t) return null;
    return {
      cab: [...t.querySelectorAll("thead th")].map((x) => x.textContent),
      filas: [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((x) => x.textContent)),
      negrita: !!t.querySelector("tbody b"),
      resumen: document.querySelector("#reloj-avance p") ? document.querySelector("#reloj-avance p").textContent : "",
    };
  });
  ok(cuadro && JSON.stringify(cuadro.cab) === JSON.stringify(["Alumno", "Sit. 3", "Sit. 7 (puesta)"]),
    `columnas: las situaciones de esta clase en las últimas 12 horas, y cuál está puesta (${cuadro && cuadro.cab.join(" | ")})`);
  ok(cuadro && JSON.stringify(cuadro.filas) === JSON.stringify([
    ["Ana <b>Mora</b>", "✓ en el intento 3", "✓ a la primera"],
    ["Beto Solís", "—", "✗ 2 intentos"],
  ]), `filas: una por alumno, con el dato escrito (${cuadro && JSON.stringify(cuadro.filas)})`);
  ok(cuadro && !cuadro.negrita, "el nombre va por textContent: no se interpreta como HTML");
  ok(cuadro && /Situación 7: 1 de 2 ya la resolvieron/.test(cuadro.resumen), `resumen de la situación puesta: «${cuadro && cuadro.resumen}»`);

  ok(errores.length === 0, "sin errores en la página" + (errores.length ? ": " + errores.join(" | ") : ""));
  await nav.close();
  console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
