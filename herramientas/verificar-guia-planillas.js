/* La cámara con guía para la foto de las dos planillas (js/guia-planillas.js, en la Mesa del árbitro del
   Centroamericano: centroamericano-arbitro.html). Ver «La cámara con guía para las planillas» en
   docs/decisiones/juegos-y-torneos.md.

   Parte 1, sin navegador: la detección. Se arman cuadros sintéticos (una mesa oscura con dos hojas con
   renglones) y se comprueba que las hojas bien puestas salen «bien», y que cada defecto sale con SU
   palabra: chueca desde 5°, muy chica, muy grande, corrida, que falte una, sin contraste. Y que el verde
   no parpadee (3 buenas seguidas para entrar, 2 malas para salir).

   Parte 2, con navegador y una CÁMARA SIMULADA (Chromium reproduce un video que se arma acá mismo):
   - con las planillas bien puestas, los marcos pasan a verde, el texto lo dice y la foto sale como JPG
     con las dos hojas; se revisa y se usa → la función recibe UNA foto de la mesa;
   - con las planillas chuecas NO se pone verde, el texto dice qué corregir, y aun así se puede tomar la
     foto (la guía ayuda, nunca bloquea);
   - con el celular parado pide girar y no deja tomar la foto; con ✕ o Escape se cierra, apaga la
     cámara y no manda nada; «Repetir la foto» vuelve a la cámara;
   - sin permiso para la cámara, o eligiendo «Usar la cámara del aparato», se abre la cámara de siempre
     (nunca se queda sin poder subir la foto).

       node herramientas/verificar-todo.js guia-planillas */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { TOKEN, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");
const G = require("../js/guia-planillas.js");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

// ------------------------------------------------------------- las escenas (mesa oscura, dos hojas con renglones)

// Un cuadro en escala de grises: `hojas` son rectángulos (x, y, w, h en fracción del cuadro, rot en grados).
function escena(W, H, hojas, { mesa = 45, papel = 225 } = {}) {
  const lum = new Uint8Array(W * H).fill(mesa);
  for (const r of hojas) {
    const rad = (r.rot || 0) * Math.PI / 180, c = Math.cos(-rad), s = Math.sin(-rad);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x / W - cx) * W, dy = (y / H - cy) * H;
      const rx = (dx * c - dy * s) / W, ry = (dx * s + dy * c) / H;
      if (Math.abs(rx) <= r.w / 2 && Math.abs(ry) <= r.h / 2) lum[y * W + x] = papel - ((Math.round(y / (H / 90)) % 4 === 0) ? 35 : 0);
    }
  }
  return lum;
}
const aRgba = (lum) => { const d = new Uint8ClampedArray(lum.length * 4); for (let i = 0; i < lum.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = lum[i]; d[i * 4 + 3] = 255; } return d; };
const hoja = (m, o = {}) => ({ x: m.x + (o.dx || 0), y: m.y + (o.dy || 0), w: m.w * (o.e || 0.97), h: m.h * (o.e || 0.97), rot: o.rot || 0 });
// Un video Y4M (lo que Chromium reproduce como cámara): los mismos cuadros una y otra vez.
function escribirY4M(ruta, W, H, lum) {
  const cab = Buffer.from("YUV4MPEG2 W" + W + " H" + H + " F10:1 Ip A1:1 C420jpeg\n");
  const marco = Buffer.concat([Buffer.from("FRAME\n"), Buffer.from(lum), Buffer.alloc((W / 2) * (H / 2) * 2, 128)]);
  fs.writeFileSync(ruta, Buffer.concat([cab, ...Array(6).fill(marco)]));
}

(async () => {
  // ----------------------------------------------------------- 1. la detección, sin navegador
  console.log("\n=== Los marcos y la detección ===");
  const W = 160, H = 90, M = G.marcosGuia(W / H);
  const mira = (hojas, o) => G.analizar(aRgba(escena(W, H, hojas, o)), W, H, M);
  const dos = (o = {}) => [hoja(M[0], o), hoja(M[1], o)];

  igual("los dos marcos caben en el cuadro, con margen, y son hojas verticales (A4)", [16 / 9, 4 / 3, 1.2].map((a) => { const m = G.marcosGuia(a); const ancho = (m[1].x + m[1].w) - m[0].x; return [m[0].x > 0.01 && m[1].x + m[1].w < 0.99 && ancho <= 0.93, Math.abs((m[0].w * a) / m[0].h - G.HOJA) < 0.01, m[0].y > 0.02]; }), [[true, true, true], [true, true, true], [true, true, true]]);
  igual("bien puestas: todo en orden", mira(dos()).motivo, "ok");
  igual("bien puestas, un poco más chicas que el marco (como las pone una persona)", mira(dos({ e: 0.9 })).motivo, "ok");
  igual("hasta 4° de giro todavía vale", [0, 2, 4].map((g) => mira([hoja(M[0], { rot: g }), hoja(M[1], { rot: -g })]).motivo), ["ok", "ok", "ok"]);
  igual("desde 5° de giro dice «chueca» de la hoja que es", [5, 8].map((g) => mira([hoja(M[0], { rot: g }), hoja(M[1])]).motivo), ["chueca_blancas", "chueca_blancas"]);
  igual("la hoja de las negras chueca se dice de las negras", mira([hoja(M[0]), hoja(M[1], { rot: -9 })]).motivo, "chueca_negras");
  igual("muy lejos (las hojas se ven chicas) dice que se acerque", mira(dos({ e: 0.72 })).motivo, "lejos");
  igual("muy cerca (las hojas se salen) dice que se aleje o se acomode", mira(dos({ e: 1.2 })).motivo.split("_")[0] === "grande" || mira(dos({ e: 1.2 })).motivo === "cerca", true);
  igual("una hoja que falta se dice de cuál", [mira([hoja(M[1])]).motivo, mira([hoja(M[0])]).motivo], ["falta_blancas", "falta_negras"]);
  igual("sin hojas y con la mesa clara no se afirma nada (poco contraste)", [mira([]).motivo, mira(dos(), { mesa: 205, papel: 235 }).motivo], ["contraste", "contraste"]);
  igual("las dos corridas bastante hacia un lado no pasan", mira(dos({ dx: 0.07 })).ok, false);
  igual("cada motivo tiene su frase (siempre con palabras, el color no va solo)", ["ok", "contraste", "falta_blancas", "chueca_negras", "chica_blancas", "grande_negras", "centrar_blancas", "lejos", "cerca"].map((m) => G.textoGuia(m)),
    ["✓ Se ven las dos planillas. ¡Toma la foto!", "Acomoda las dos planillas dentro de los marcos", "Falta la planilla de las blancas: ponla dentro de su marco", "Endereza la planilla de las negras: está chueca", "Acerca la planilla de las blancas a su marco: se ve chica", "La planilla de las negras se sale de su marco: acomódala o aleja un poco el aparato", "Centra la planilla de las blancas en su marco", "Acerca el aparato: las planillas se ven chicas", "Aleja un poco el aparato: las hojas se salen de los marcos"]);
  let e = { verde: false, buenas: 0, malas: 0 };
  const paso = (ok) => { e = G.siguiente(e, { ok }); return e.verde; };
  igual("el verde no parpadea: entra con 3 buenas seguidas y sale con 2 malas seguidas", [paso(true), paso(true), paso(true), paso(false), paso(true), paso(false), paso(false)], [false, false, true, true, true, true, false]);

  // ----------------------------------------------------------- 2. la cámara en la página, con un video simulado
  console.log("\n=== La cámara con guía en la página (con una cámara simulada) ===");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guia-planillas-"));
  const VW = 640, VH = 360, MV = G.marcosGuia(VW / VH);
  const bien = path.join(dir, "bien.y4m"), chueca = path.join(dir, "chueca.y4m");
  escribirY4M(bien, VW, VH, escena(VW, VH, [hoja(MV[0]), hoja(MV[1])]));
  escribirY4M(chueca, VW, VH, escena(VW, VH, [hoja(MV[0], { rot: 9 }), hoja(MV[1], { rot: -7, dx: 0.02 })]));

  const navegador = (video) => chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--use-file-for-fake-video-capture=" + video, "--autoplay-policy=no-user-gesture-required"] });
  async function abrir(browser, { ancho = 1180, alto = 820, init = "" } = {}) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: alto }, permissions: ["camera"] });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: dobleArbitro() }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    // Anota las pistas de la cámara para comprobar que se apagan al cerrar.
    await ctx.addInitScript(() => {
      window.__pistas = [];
      const orig = navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      if (orig) navigator.mediaDevices.getUserMedia = async (c) => { const s = await orig(c); window.__pistas.push(...s.getTracks()); return s; };
    });
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (x) => errores.push(x.message));
    await p.goto(BASE + "/centroamericano-arbitro.html#" + TOKEN, { waitUntil: "load" });
    await p.waitForSelector("#app:not([hidden]) .cam-mesa");
    return { ctx, p, errores };
  }
  const camarita = (p) => p.locator('.cam-mesa[data-mesa="2"] [data-accion="planilla"]');
  const llamadasPlanilla = (p) => p.evaluate(() => window.__llamadas.filter((l) => l.body.action === "planilla").map((l) => [l.body.mesa, "lado" in l.body, l.body.imagen.startsWith("data:image/jpeg;base64,"), l.body.imagen.length > 8000]));
  const pistasVivas = (p) => p.evaluate(() => window.__pistas.filter((t) => t.readyState === "live").length);

  // --- planillas bien puestas
  let nav = await navegador(bien);
  let { ctx, p, errores } = await abrir(nav);
  await camarita(p).click();
  await p.waitForSelector(".cam-guia[data-listo=\"si\"]");
  igual("la camarita abre la cámara dentro de la página: pantalla completa, con sus dos marcos rotulados con los jugadores", await p.evaluate(() => [document.querySelector(".cam-guia").getAttribute("role"), document.querySelector(".cam-guia").getAttribute("aria-modal"), getComputedStyle(document.querySelector(".cam-guia")).position, [...document.querySelectorAll(".cam-guia-rotulo")].map((r) => r.textContent), document.querySelectorAll(".cam-guia-marco").length]),
    ["dialog", "true", "fixed", ["Blancas · Harvey Ian", "Negras · Acuña Porras Fabio"], 2]);
  await p.waitForSelector('.cam-guia[data-verde="si"]', { timeout: 15000 });
  igual("con las dos planillas dentro de los marcos se pone verde, y lo dice con palabras (no solo con el color)", await p.evaluate(() => [document.querySelector(".cam-guia-estado").textContent, getComputedStyle(document.querySelector(".cam-guia-marco")).borderStyle, document.querySelector(".cam-guia-estado").getAttribute("aria-live")]), ["✓ Se ven las dos planillas. ¡Toma la foto!", "solid", "polite"]);
  igual("los marcos caen donde el video muestra las hojas (dentro del cuadro de la cámara) y la cámara está encendida", await p.evaluate(() => { const v = document.querySelector(".cam-guia-video").getBoundingClientRect(); const m = [...document.querySelectorAll(".cam-guia-marco")].map((x) => x.getBoundingClientRect()); return [m.every((r) => r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom), m[0].right < m[1].left, window.__pistas.filter((t) => t.readyState === "live").length > 0]; }), [true, true, true]);
  await p.click(".cam-guia-disparador");
  await p.waitForSelector(".cam-guia-revision:not([hidden])");
  igual("al tomar la foto se REVISA antes de mandarla: la foto, «Repetir la foto» y «Usar esta foto»", await p.evaluate(() => [document.querySelector(".cam-guia-foto").src.startsWith("data:image/jpeg;base64,"), document.querySelector(".cam-guia-foto").naturalWidth > 100, [...document.querySelectorAll(".cam-guia-revision button")].map((b) => b.textContent), document.querySelector(".cam-guia-revision strong").textContent]),
    [true, true, ["Repetir la foto", "Usar esta foto"], "¿Se ven bien las dos planillas?"]);
  igual("todavía no se mandó nada", (await llamadasPlanilla(p)).length, 0);
  await p.click('.cam-guia-revision [data-accion="repetir"]');
  await p.waitForSelector(".cam-guia-vivo:not([hidden])");
  igual("«Repetir la foto» vuelve a la cámara, sin mandar nada", [await p.evaluate(() => document.querySelector(".cam-guia-revision").hidden), (await llamadasPlanilla(p)).length], [true, 0]);
  await p.waitForSelector('.cam-guia[data-verde="si"]', { timeout: 15000 });
  await p.click(".cam-guia-disparador");
  await p.waitForSelector(".cam-guia-revision:not([hidden])");
  await p.click('.cam-guia-revision [data-accion="usar"]');
  await p.waitForSelector(".cam-guia", { state: "detached" });
  await p.waitForSelector('.cam-mesa[data-mesa="2"] [data-accion="planilla"][data-hecho="si"]');
  igual("«Usar esta foto» manda UNA foto JPG de esa mesa, sin decir de qué lado, y la camarita se marca", [await llamadasPlanilla(p), await pistasVivas(p), await p.evaluate(() => document.body.classList.contains("cam-guia-abierta"))], [[[2, false, true, true]], 0, false]);
  igual("al terminar la cámara se apaga (no gasta batería) y el foco vuelve a la camarita", await p.evaluate(() => document.activeElement && document.activeElement.dataset.accion), "planilla");
  igual("sin errores de JavaScript", errores, []);
  await ctx.close();

  // --- ✕ y Escape cierran sin mandar nada y apagan la cámara
  ({ ctx, p, errores } = await abrir(nav));
  await camarita(p).click();
  await p.waitForSelector('.cam-guia[data-listo="si"]');
  await p.click(".cam-guia-cerrar");
  await p.waitForSelector(".cam-guia", { state: "detached" });
  igual("la ✕ cierra, apaga la cámara y no manda nada", [(await llamadasPlanilla(p)).length, await pistasVivas(p)], [0, 0]);
  await camarita(p).click();
  await p.waitForSelector('.cam-guia[data-listo="si"]');
  await p.keyboard.press("Escape");
  await p.waitForSelector(".cam-guia", { state: "detached" });
  igual("Escape también cierra y apaga la cámara", [(await llamadasPlanilla(p)).length, await pistasVivas(p)], [0, 0]);
  // «Usar la cámara del aparato»: se abre la de siempre
  await camarita(p).click();
  await p.waitForSelector('.cam-guia[data-listo="si"]');
  const [selector] = await Promise.all([p.waitForEvent("filechooser"), p.click(".cam-guia-enlace")]);
  igual("«Usar la cámara del aparato» abre la de siempre (nunca se queda sin poder subir la foto) y apaga la de la página", [typeof selector.isMultiple(), await pistasVivas(p), await p.evaluate(() => !!document.querySelector(".cam-guia"))], ["boolean", 0, false]);
  igual("sin errores de JavaScript (cerrar)", errores, []);
  await ctx.close();

  // --- el celular parado: pide girar
  ({ ctx, p, errores } = await abrir(nav, { ancho: 390, alto: 844 }));
  await camarita(p).click();
  await p.waitForSelector('.cam-guia[data-listo="si"]');
  igual("con el celular parado pide girarlo, esconde los marcos y no deja tomar la foto", await p.evaluate(() => [document.querySelector(".cam-guia-girar").hidden, document.querySelector(".cam-guia-girar-titulo").textContent, getComputedStyle(document.querySelector(".cam-guia-marco")).display, getComputedStyle(document.querySelector(".cam-guia-disparador")).pointerEvents]), [false, "Gira el aparato a lo ancho", "none", "none"]);
  await p.setViewportSize({ width: 844, height: 390 });
  await p.waitForFunction(() => document.querySelector(".cam-guia-girar").hidden);
  igual("al girarlo la guía se quita sola y salen los marcos", await p.evaluate(() => [document.querySelector(".cam-guia-girar").hidden, getComputedStyle(document.querySelector(".cam-guia-marco")).display]), [true, "block"]);
  await ctx.close();
  await nav.close();

  // --- planillas chuecas: no se pone verde, dice qué corregir y aun así se puede tomar la foto
  nav = await navegador(chueca);
  ({ ctx, p, errores } = await abrir(nav));
  await camarita(p).click();
  await p.waitForSelector('.cam-guia[data-listo="si"]');
  await p.waitForFunction(() => /chueca|Endereza|Acomoda|Centra/.test(document.querySelector(".cam-guia-estado").textContent) && document.querySelector(".cam-guia-estado").textContent !== "Abriendo la cámara…", null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  igual("con las hojas chuecas NO se pone verde: los marcos siguen discontinuos y el texto dice qué corregir", await p.evaluate(() => [document.querySelector(".cam-guia").dataset.verde, getComputedStyle(document.querySelector(".cam-guia-marco")).borderStyle, /^Endereza la planilla de las (blancas|negras): está chueca$/.test(document.querySelector(".cam-guia-estado").textContent)]), ["no", "dashed", true]);
  await p.click(".cam-guia-disparador");
  await p.waitForSelector(".cam-guia-revision:not([hidden])");
  igual("aun chuecas se puede tomar la foto (la guía ayuda, nunca bloquea): se ve para revisarla", await p.evaluate(() => document.querySelector(".cam-guia-foto").src.startsWith("data:image/jpeg")), true);
  await p.click('.cam-guia-revision [data-accion="usar"]');
  await p.waitForSelector(".cam-guia", { state: "detached" });
  igual("y se manda como cualquier otra", (await llamadasPlanilla(p)).length, 1);
  igual("sin errores de JavaScript (chuecas)", errores, []);
  await ctx.close();

  // --- sin permiso para la cámara: la de siempre
  ({ ctx, p, errores } = await abrir(nav, { init: "navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));" }));
  const [selector2] = await Promise.all([p.waitForEvent("filechooser"), camarita(p).click()]);
  igual("sin permiso se abre la cámara de siempre y se le dice por qué", await p.evaluate(() => [!!document.querySelector(".cam-guia"), document.querySelector("#avisos, .cam-aviso, [role=status], [role=alert]") ? [...document.querySelectorAll("[role=status], [role=alert]")].some((x) => x.textContent.includes("No diste permiso para usar la cámara en esta página.")) : false]), [false, true]);
  void selector2;
  await ctx.close();
  await nav.close();

  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
