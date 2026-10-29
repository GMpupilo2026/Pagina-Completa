/* Pareo Integral recibe de las cámaras de las mesas (js/pareo/pagina.js,
 * «Las cámaras de las mesas»; la cámara es camara-tablero.html):
 *
 *   - con el código de las cámaras, la pestaña del principal escucha el canal
 *     `tablero-vivo-<código>` y pide lo que ya tienen;
 *   - la partida de cada mesa entra sola (`m.pgn`) y sale en el torneo
 *     publicado, pero nunca pisa una escrita a mano;
 *   - lo de otro torneo o de otra ronda no entra;
 *   - el resultado NUNCA se anota solo: queda en «Resultados para
 *     confirmar», con «Anotar» y «Descartar» (y si ya había otro, cambiarlo
 *     pide confirmarlo y deja la constancia);
 *   - una jugada nueva no vuelve a pintar la ronda (no le mueve la página a
 *     quien anota), y no ensucia el historial de cambios.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-camaras.js
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const dialogo = "dialog[data-avisos][open]";
const ID = "0b9f3c2e-7a41-4d8e-9c55-1f2a3b4c5d6e";
const CODIGO = "k7mq2xpa";
const CANAL = "tablero-vivo-" + CODIGO;

function torneo() {
  const t = T.nuevo({ nombre: "PRUEBA CÁMARAS", arbitro: "PRUEBA PRINCIPAL", rondasTotales: 3,
    jugadores: ["a", "b", "c", "d", "e", "f"].map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), elo: 1800 - 50 * k, retiradoDespuesDe: null })) });
  T.fijarNumeracion(t);
  // La mesa 1 ya tiene resultado; la 3, una partida escrita a mano.
  t.rondas = [{ mesas: [{ b: "a", n: "d", r: "0-1" }, { b: "e", n: "b", r: null }, { b: "c", n: "f", r: null, pgn: "1. d4 d5" }], ausencias: {} }];
  t.publicado = { id: ID, clave: "clave-de-prueba", hora: 1 };
  return t;
}

(async () => {
  const fs = require("fs");
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const { page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    await p.addInitScript(() => { window.__sinAutoConfirmar = true; });
    // Publicar no sale a la red: se contesta que está bien.
    await p.route("**/functions/v1/pareo-publicar", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"ok":true}' }));
    await p.addInitScript((x) => {
      if (localStorage.getItem("pareo_lista_v1")) return;
      localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1 }]));
      localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
      localStorage.setItem("pareo_abierto_v1", "tp");
    }, torneo());
  });
  const guardado = () => P.leerTodos(page).then((l) => l[0]);

  console.log("\n=== Conectarse con el código de las cámaras ===");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-camaras");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="codigo"]', "abc");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => /Ese código no es válido/.test(document.body.textContent)).catch(() => {});
  ok(/Ese código no es válido/.test(await page.textContent("body")), "un código que no es válido se dice");
  await page.click("#pi-camaras");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="codigo"]', CODIGO.toUpperCase());
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "pedir"), CANAL, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate((c) => window.__enviados.some((x) => x.canal === c && x.evento === "pedir"), CANAL), "escucha el canal de las cámaras y les pide lo que ya tienen");
  igual("queda guardado en el torneo", (await guardado()).camaras, { codigo: CODIGO, activo: true });
  ok(await P.vis(page, "#pi-camaras-caja"), "arriba de la ronda dice que está recibiendo");

  // Lo que manda una cámara: lo arma la misma PartidaEnVivo de la cámara.
  const manda = (o) => page.evaluate(([c, o]) => {
    const j = new window.Chess();
    o.jugadas.forEach((x) => j.move(x));
    const p = window.PartidaEnVivo.estado(j, { blancas: "X", negras: "Y" }, { torneo: o.torneo, ronda: o.ronda, mesa: o.mesa }, o.resultado, { tiempos: o.tiempos });
    window.__llega(c, "estado", p);
  }, [CANAL, Object.assign({ torneo: ID, ronda: 1, jugadas: [] }, o)]);

  console.log("\n=== La partida de cada mesa entra sola ===");
  await page.evaluate(() => { document.getElementById("pi-buscar-mesa").dataset.marca = "sigue"; document.getElementById("pi-buscar-mesa").focus(); });
  const antesDeLaJugada = await page.evaluate(() => localStorage.getItem("pareo_torneo_v1_tp"));
  await manda({ mesa: 2, jugadas: ["e4", "e5", "Nf3"], tiempos: [5000, 12000, 83000] });
  let g = await P.esperarGuardado(page, (l) => /1\. e4 .*e5 .*2\. Nf3/.test(l[0].rondas[0].mesas[1].pgn || "")).then((l) => l[0]);
  igual("la partida de la mesa 2 queda en la mesa, marcada como de la cámara", [/1\. e4 .*e5 .*2\. Nf3/.test(g.rondas[0].mesas[1].pgn), g.rondas[0].mesas[1].pgnCamara], [true, true]);
  igual("sin anotar ningún resultado", g.rondas[0].mesas[1].r, null);
  igual("con lo que pensó cada jugada, como lo escribe Lichess", /1\. e4 \{\[%emt 0:00:05\]\} e5 \{\[%emt 0:00:12\]\} 2\. Nf3 \{\[%emt 0:01:23\]\}/.test(g.rondas[0].mesas[1].pgn), true);
  igual("y sin volver a pintar la ronda: quien estaba escribiendo sigue ahí", await page.evaluate(() => [document.getElementById("pi-buscar-mesa").dataset.marca, document.activeElement && document.activeElement.id]), ["sigue", "pi-buscar-mesa"]);
  await page.waitForFunction(() => /Mesas con cámara: 2\./.test(document.getElementById("pi-camaras-mesas").textContent)).catch(() => {});
  igual("dice qué mesas tienen cámara", await page.textContent("#pi-camaras-mesas"), "Mesas con cámara: 2.");
  ok((await page.textContent('#pi-ronda [data-pgn="1"]')).startsWith("✓"), "el botón de la partida de la mesa dice que ya la tiene");
  const pub = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem("pareo_torneo_v1_tp"));
    return window.PareoPublicar.datosPublicos(t).rondas[0].mesas[1];
  });
  igual("sale en el torneo publicado (sin la marca interna)", [/1\. e4 .*e5 .*2\. Nf3/.test(pub.pgn), "pgnCamara" in pub], [true, false]);
  // El historial anota lo que describe PareoHistorial: una partida que llega no es un cambio para deshacer.
  igual("una jugada no ensucia el historial de cambios", await page.evaluate((a) => window.PareoHistorial.describir(JSON.parse(a), JSON.parse(localStorage.getItem("pareo_torneo_v1_tp"))), antesDeLaJugada), []);

  console.log("\n=== Lo nuevo se pega a la partida que ya llegó ===");
  // La cámara manda la entera una vez (con el id de su partida) y después solo lo nuevo.
  await page.evaluate((c) => {
    const j = new window.Chess(); ["e4", "e5", "Nf3"].forEach((x) => j.move(x));
    window.__llega(c, "estado", window.PartidaEnVivo.estado(j, { blancas: "X", negras: "Y" }, { torneo: "0b9f3c2e-7a41-4d8e-9c55-1f2a3b4c5d6e", ronda: 1, mesa: 2 }, null, { tiempos: [5000, 12000, 83000], id: "k1-0" }));
  }, CANAL);
  const nuevo = (desde, jugadas) => page.evaluate(([c, desde, jugadas]) => {
    const j = new window.Chess(); jugadas.forEach((x) => j.move(x));
    const p = window.PartidaEnVivo.loNuevo("k1-0", j, desde, { torneo: "0b9f3c2e-7a41-4d8e-9c55-1f2a3b4c5d6e", ronda: 1, mesa: 2 }, null, { tiempos: jugadas.map(() => 7000) });
    window.__llega(c, "estado", p);
    return JSON.stringify(p).length;
  }, [CANAL, desde, jugadas]);
  const pesa = await nuevo(3, ["e4", "e5", "Nf3", "Nc6"]);
  g = await P.esperarGuardado(page, (l) => /Nc6/.test(l[0].rondas[0].mesas[1].pgn || "")).then((l) => l[0]);
  igual("solo la jugada nueva (" + pesa + " bytes) se pega a la partida de la mesa, con su tiempo",
    /1\. e4 \{\[%emt 0:00:05\]\} e5 .*2\. Nf3 \{\[%emt 0:01:23\]\} Nc6 \{\[%emt 0:00:07\]\}/.test(g.rondas[0].mesas[1].pgn), true);
  ok(pesa < 250, "y pesa poco", pesa);
  await page.evaluate(() => { window.__enviados.length = 0; });
  await nuevo(6, ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4"]);
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "pedir"), CANAL, { timeout: 4000 }).catch(() => {});
  igual("si no calza (se perdió un mensaje), no lo pega y le pide a esa mesa la partida entera",
    [/Bb5/.test((await guardado()).rondas[0].mesas[1].pgn), await page.evaluate((c) => (window.__enviados.find((x) => x.canal === c && x.evento === "pedir") || {}).payload, CANAL)], [false, { mesa: 2 }]);

  console.log("\n=== Lo que no entra ===");
  await manda({ mesa: 3, jugadas: ["c4"] });
  await manda({ mesa: 2, jugadas: ["d4"], torneo: "5d6e0b9f-3c2e-4d8e-9c55-7a411f2a3b4c" });
  await manda({ mesa: 2, jugadas: ["d4"], ronda: 2 });
  await manda({ mesa: 9, jugadas: ["d4"] });
  await page.evaluate((c) => window.__llega(c, "estado", { v: 1, pgn: "1. e4 e5 2. Ke3 Ke6 3. Qh8", mesa: 2, ronda: 1, torneo: "0b9f3c2e-7a41-4d8e-9c55-1f2a3b4c5d6e", t: Date.now() }), CANAL);
  await page.waitForTimeout(400);
  g = await guardado();
  igual("la partida escrita a mano no se pisa", g.rondas[0].mesas[2].pgn, "1. d4 d5");
  ok(/1\. e4 .*e5 .*2\. Nf3/.test(g.rondas[0].mesas[1].pgn), "ni la de otro torneo, ni la de otra ronda, ni una ilegal cambian la mesa 2", g.rondas[0].mesas[1].pgn);

  console.log("\n=== El resultado: para confirmar, nunca solo ===");
  await manda({ mesa: 2, jugadas: ["e4", "e5", "Nf3"], resultado: "1-0" });
  g = await P.esperarGuardado(page, (l) => (l[0].rondas[0].deCamaras || []).length === 1).then((l) => l[0]);
  igual("el resultado de la cámara no se anota", g.rondas[0].mesas[1].r, null);
  await page.waitForSelector("#pi-confirmar [data-camara-anotar]");
  ok(/Mesa 2: la cámara dice 1-0/.test(await page.textContent("#pi-confirmar")), "queda en «Resultados para confirmar»", await page.textContent("#pi-confirmar"));
  ok(/\[Result "1-0"\]/.test(g.rondas[0].mesas[1].pgn), "y la partida lleva su resultado en el PGN");
  await manda({ mesa: 2, jugadas: ["e4", "e5", "Nf3"], resultado: "1-0" });
  await page.waitForTimeout(300);
  igual("el mismo resultado otra vez no se repite", ((await guardado()).rondas[0].deCamaras || []).filter((x) => !x.resuelta).length, 1);
  await page.click("#pi-confirmar [data-camara-anotar]");
  g = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[1].r === "1-0").then((l) => l[0]);
  igual("«Anotar» lo anota, y deja de estar para confirmar", [g.rondas[0].mesas[1].r, g.rondas[0].deCamaras[0].resuelta], ["1-0", "anotado"]);

  // La mesa 1 ya tiene 0-1: la cámara dice otra cosa.
  await manda({ mesa: 1, jugadas: ["d4", "Nf6"], resultado: "1-0" });
  await page.waitForSelector("#pi-confirmar [data-camara-descartar]");
  ok(/Mesa 1: la cámara dice 1-0, pero acá está 0-1/.test(await page.textContent("#pi-confirmar")), "si ya había otro resultado, lo dice");
  await page.click("#pi-confirmar [data-camara-anotar]");
  await page.waitForSelector(dialogo);
  ok(/Cambiar el resultado de la mesa 1/.test(await page.textContent(dialogo)), "cambiarlo pide confirmarlo", await page.textContent(dialogo));
  await page.click(dialogo + " [data-avisos-aceptar]");
  g = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[0].r === "1-0").then((l) => l[0]);
  ok((g.rondas[0].incidencias || []).some((x) => x.tipo === "correccion" && /Según la cámara de la mesa/.test(x.texto)), "y queda la constancia en las incidencias", JSON.stringify(g.rondas[0].incidencias));

  await manda({ mesa: 3, jugadas: ["c4"], resultado: "=" });
  await page.waitForSelector("#pi-confirmar [data-camara-descartar]");
  await page.click("#pi-confirmar [data-camara-descartar]");
  g = await P.esperarGuardado(page, (l) => (l[0].rondas[0].deCamaras || []).every((x) => x.resuelta)).then((l) => l[0]);
  igual("«Descartar» lo quita sin anotar nada", g.rondas[0].mesas[2].r, null);

  console.log("\n=== Una posible jugada ilegal ===");
  const alerta = (o) => page.evaluate(([c, o]) => window.__llega(c, "alerta", o), [CANAL, Object.assign({ v: 1, torneo: ID, ronda: 1, t: Date.now() }, o)]);
  await alerta({ mesa: 9 });
  await alerta({ mesa: 2, torneo: "5d6e0b9f-3c2e-4d8e-9c55-7a411f2a3b4c" });
  await page.waitForTimeout(300);
  ok(!(await page.$("#pi-camaras-alertas")), "la de otro torneo o de una mesa que no está, no");
  await alerta({ mesa: 3 });
  await page.waitForSelector("#pi-camaras-alertas [data-alerta=\"3\"]");
  ok(/Mesa 3: posible jugada ilegal/.test(await page.textContent("#pi-camaras-alertas")), "la de la mesa 3 le llega al árbitro, arriba de la ronda");
  ok(/La cámara de la mesa 3 ve algo que no es una jugada legal/.test(await page.textContent("body")), "con un aviso");
  await alerta({ mesa: 3 });
  const avisosDe3 = () => page.evaluate(() => [...document.querySelectorAll(".avisos-mensaje")].filter((x) => /La cámara de la mesa 3 ve algo/.test(x.textContent)).length);
  igual("la misma mesa otra vez enseguida no se repite (ni en la lista ni en los avisos)", [await page.locator("#pi-camaras-alertas li").count(), await avisosDe3()], [1, 1]);
  await alerta({ mesa: 3, tipo: "repeticion3" });
  await page.waitForSelector("#pi-camaras-alertas [data-tipo=repeticion3]");
  igual("la triple repetición llega aparte, sin tapar la jugada ilegal de la misma mesa",
    [await page.locator("#pi-camaras-alertas li").count(), /Mesa 3: triple repetición, se pueden reclamar tablas/.test(await page.textContent("#pi-camaras-alertas")), /la misma posición se repitió tres veces/.test(await page.textContent("body"))], [2, true, true]);
  await alerta({ mesa: 3, tipo: "lo-que-sea" });
  igual("un tipo que no se conoce cuenta como jugada ilegal (y no se repite)", await page.locator("#pi-camaras-alertas li").count(), 2);

  // La foto del tablero que manda la cámara con el aviso.
  const fotoJpeg = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 16; const g = c.getContext("2d"); g.fillStyle = "#c33"; g.fillRect(0, 0, 16, 16); return c.toDataURL("image/jpeg", 0.7); });
  const fotoLlega = (o) => page.evaluate(([c, o]) => window.__llega(c, "foto", o), [CANAL, Object.assign({ v: 1, torneo: ID, ronda: 1, mesa: 3, motivo: "ilegal", img: fotoJpeg, t: Date.now() }, o)]);
  await fotoLlega({ img: "data:image/png;base64,AAAA" });
  await fotoLlega({ img: "data:image/jpeg;base64," + "A".repeat(130000) });
  await fotoLlega({ motivo: "cualquiera" });
  await fotoLlega({ torneo: "5d6e0b9f-3c2e-4d8e-9c55-7a411f2a3b4c" });
  await page.waitForTimeout(300);
  ok(!(await page.$("#pi-camaras-alertas [data-foto]")), "una foto que no es JPEG, es enorme, trae otro motivo o es de otro torneo no se muestra");
  await fotoLlega({});
  await page.waitForSelector("#pi-camaras-alertas [data-alerta=\"3\"] [data-foto]");
  ok(true, "la foto de la cámara aparece junto al aviso de la mesa 3: «Ver foto»");
  await page.click("#pi-camaras-alertas [data-alerta=\"3\"][data-tipo=ilegal] [data-foto]");
  await page.waitForSelector("#pi-foto-dialogo[open] img");
  igual("«Ver foto» la abre en grande, con la mesa y el motivo", [await page.getAttribute("#pi-foto-dialogo img", "src") === fotoJpeg, /Foto del tablero · mesa 3/.test(await page.textContent("#pi-foto-dialogo")),
    /posible jugada ilegal/.test(await page.textContent("#pi-foto-dialogo"))], [true, true, true]);
  await page.click("#pi-foto-pasar");
  g = await P.esperarGuardado(page, (l) => (l[0].rondas[0].incidencias || []).some((x) => x.foto)).then((l) => l[0]);
  const inc = g.rondas[0].incidencias.find((x) => x.foto);
  igual("«Pasar a las incidencias» la deja en la ronda, con su mesa y su foto", [inc.mesa, inc.foto === fotoJpeg, /Foto de la cámara: posible jugada ilegal/.test(inc.texto)], [3, true, true]);
  igual("y lo que se publica del torneo no la lleva", JSON.stringify(require("../js/pareo/publicar.js").datosPublicos(g)).includes("base64"), false);
  await page.waitForSelector("#pi-inc-lista [data-foto-inc]");
  await page.click("#pi-inc-lista [data-foto-inc]");
  await page.waitForSelector("#pi-foto-dialogo[open] img");
  igual("desde las incidencias se vuelve a ver, sin el botón de pasarla", [await page.getAttribute("#pi-foto-dialogo img", "src") === fotoJpeg, await page.$("#pi-foto-pasar")], [true, null]);
  await page.keyboard.press("Escape");

  await page.click("#pi-camaras-alertas [data-tipo=repeticion3] button:not([data-foto])");
  await page.click("#pi-camaras-alertas [data-alerta=\"3\"] button:not([data-foto])");
  ok(!(await page.$("#pi-camaras-alertas")), "«Visto» la quita");

  console.log("\n=== Transmitir a Lichess ===");
  // Lichess, de mentira: se guarda lo que llega y se contesta como Lichess.
  const aLichess = [];
  let lichessContesta = 200;
  await page.context().route("https://lichess.org/api/broadcast/round/*/push", async (r) => {
    const q = r.request();
    if (q.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Authorization, Content-Type", "access-control-allow-methods": "POST" } });
    aLichess.push({ url: q.url(), auth: q.headers()["authorization"], body: q.postData() || "" });
    const juegos = (q.postData() || "").split(/\n\n\n/).filter(Boolean).map(() => ({ tags: {} }));
    await r.fulfill({ status: lichessContesta, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(lichessContesta === 200 ? { games: juegos } : { error: "No such token" }) });
  });
  await page.click("#pi-lichess-conectar");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="clave"]', "lip_PRUEBA");
  await page.fill(dialogo + ' [name="ronda"]', "https://lichess.org/broadcast/prueba-camaras/EUHb3ssn");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => /no es de una ronda/.test(document.body.textContent)).catch(() => {});
  ok(/no es de una ronda/.test(await page.textContent("body")) && !aLichess.length, "el enlace de la transmisión entera (no de una ronda) no sirve, y se dice");
  await page.click("#pi-lichess-conectar");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="clave"]', "lip_PRUEBA");
  await page.fill(dialogo + ' [name="ronda"]', "https://lichess.org/broadcast/prueba-camaras/ronda-1/AbCd1234");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => /Lichess: 3 partidas de la ronda 1/.test((document.getElementById("pi-lichess-estado") || {}).textContent || ""), null, { timeout: 8000 }).catch(() => {});
  const primero = aLichess[0] || { url: "", body: "" };
  igual("manda las partidas a esa ronda, con la clave", [/\/api\/broadcast\/round\/AbCd1234\/push$/.test(primero.url), primero.auth], [true, "Bearer lip_PRUEBA"]);
  ok(/\[White "PRUEBA E"\]\n\[Black "PRUEBA B"\]/.test(primero.body) && /\[Round "1\.2"\]/.test(primero.body) && /1\. e4 .*e5 .*2\. Nf3/.test(primero.body), "cada mesa con sus jugadores, su ronda y sus jugadas", primero.body.slice(0, 400));
  ok(/1\. d4 d5 \*/.test(primero.body), "también la partida escrita a mano, todavía sin resultado", primero.body);
  ok(/\[Result "1-0"\]\n\n1\. d4 Nf6 1-0/.test(primero.body), "y el resultado anotado", primero.body);
  igual("dice qué mandó y cuándo", /^Lichess: 3 partidas de la ronda 1, enviadas a las /.test(await page.textContent("#pi-lichess-estado")), true);
  igual("la clave queda solo en esta computadora: nunca en el torneo (que se exporta y se publica)",
    [JSON.stringify(await guardado()).includes("lip_PRUEBA"), await page.evaluate(() => localStorage.getItem("pareo_lichess_clave_v1"))], [false, "lip_PRUEBA"]);
  await manda({ mesa: 2, jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5"] });
  const antesLichess = aLichess.length;
  await page.waitForTimeout(6500);
  ok(aLichess.length === antesLichess + 1 && /Bb5/.test(aLichess[aLichess.length - 1].body), "una jugada nueva llega a Lichess sola (una vez, a los pocos segundos)", aLichess.length - antesLichess);
  lichessContesta = 401;
  await manda({ mesa: 2, jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"] });
  await page.waitForFunction(() => /Lichess no acepta la clave/.test((document.getElementById("pi-lichess-estado") || {}).textContent || ""), null, { timeout: 9000 }).catch(() => {});
  ok(/Lichess no acepta la clave/.test(await page.textContent("#pi-lichess-estado")), "si Lichess no acepta la clave, lo dice");
  lichessContesta = 200;
  await page.click("#pi-lichess-dejar");
  igual("«Dejar de transmitir a Lichess» borra la clave de esta computadora", await page.evaluate(() => [localStorage.getItem("pareo_lichess_clave_v1"), !!document.getElementById("pi-lichess-conectar")]), [null, true]);

  console.log("\n=== Dejar de recibir ===");
  await page.click("#pi-camaras-dejar");
  g = await P.esperarGuardado(page, (l) => l[0].camaras && l[0].camaras.activo === false).then((l) => l[0]);
  ok(!(await P.vis(page, "#pi-camaras-caja")), "la caja de las cámaras se va");
  await manda({ mesa: 2, jugadas: ["e4", "c5"] });
  await page.waitForTimeout(300);
  ok(/1\. e4 .*e5 .*2\. Nf3/.test((await guardado()).rondas[0].mesas[1].pgn), "y ya no entra nada");

  igual("sin errores en la consola", errores, []);

  console.log("\n=== Un torneo por equipos: una cámara por tablero ===");
  {
    const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
    const ID2 = "4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d";
    let nId = 0;
    const nuevoId = () => "q" + (++nId);
    const gente = ["A", "B"].flatMap((c) => [1, 2, 3, 4].map((k) => ({ id: nuevoId(), nombre: "PRUEBA " + c + k, institucion: "Escuela " + c, elo: 1500 + k, retiradoDespuesDe: null })));
    const eqs = E.armarEquipos(gente, nuevoId);
    const te = T.nuevo({ nombre: "PRUEBA EQUIPOS", arbitro: "PRUEBA PRINCIPAL", tipo: "equipos", tableros: 4, puntos: Object.assign({}, E.PUNTOS_EQUIPOS), rondasTotales: 3, jugadores: eqs });
    T.fijarNumeracion(te);
    te.rondas = [{ mesas: [{ b: eqs[0].id, n: eqs[1].id, r: null }], ausencias: {} }];
    te.publicado = { id: ID2, clave: "clave-de-prueba", hora: 1 };
    const Q = await P.abrirPagina(browser, BASE, "", async (p) => {
      await p.addInitScript(() => { window.__sinAutoConfirmar = true; });
      await p.addInitScript((x) => {
        if (localStorage.getItem("pareo_lista_v1")) return;
        localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "te", nombre: x.nombre, actualizado: 1 }]));
        localStorage.setItem("pareo_torneo_v1_te", JSON.stringify(x));
        localStorage.setItem("pareo_abierto_v1", "te");
      }, te);
    });
    const pq = Q.page;
    await pq.click('[data-ficha="rondas"]');
    await pq.click("#pi-camaras");
    await pq.waitForSelector(dialogo);
    await pq.fill(dialogo + ' [name="codigo"]', CODIGO);
    await pq.click(dialogo + " [data-avisos-aceptar]");
    await pq.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "pedir"), CANAL, { timeout: 8000 }).catch(() => {});
    ok(await P.vis(pq, "#pi-camaras-caja"), "un torneo por equipos también recibe de las cámaras");
    const mandaTablero = (o) => pq.evaluate(([c, o]) => {
      const j = new window.Chess();
      o.jugadas.forEach((x) => j.move(x));
      window.__llega(c, "estado", window.PartidaEnVivo.estado(j, { blancas: "X", negras: "Y" }, { torneo: o.torneo, ronda: 1, mesa: 1, tablero: o.tablero }, o.resultado, {}));
    }, [CANAL, Object.assign({ torneo: ID2 }, o)]);
    const guardadoE = () => P.leerTodos(pq).then((l) => l[0]);
    await mandaTablero({ tablero: 2, jugadas: ["d4", "d5", "c4"] });
    let ge = await P.esperarGuardado(pq, (l) => /c4/.test(((l[0].rondas[0].mesas[0].partidas || [])[1] || {}).pgn || "")).then((l) => l[0]);
    igual("la partida del tablero 2 queda en ese tablero del encuentro, marcada como de la cámara",
      [/1\. d4 d5 2\. c4/.test(ge.rondas[0].mesas[0].partidas[1].pgn), ge.rondas[0].mesas[0].partidas[1].pgnCamara, (ge.rondas[0].mesas[0].partidas[0] || {}).pgn || null], [true, true, null]);
    await pq.waitForFunction(() => /tablero 2/.test(document.getElementById("pi-camaras-mesas").textContent)).catch(() => {});
    igual("dice qué mesa y qué tablero tienen cámara", await pq.textContent("#pi-camaras-mesas"), "Mesas con cámara: 1 · tablero 2.");
    await mandaTablero({ jugadas: ["e4"] });
    await mandaTablero({ tablero: 3, jugadas: ["e4"], torneo: ID });
    await pq.waitForTimeout(300);
    ge = await guardadoE();
    igual("sin tablero, o de otro torneo, no entra", [((ge.rondas[0].mesas[0].partidas || [])[0] || {}).pgn || null, ((ge.rondas[0].mesas[0].partidas || [])[2] || {}).pgn || null], [null, null]);
    await mandaTablero({ tablero: 2, jugadas: ["d4", "d5", "c4"], resultado: "0-1" });
    await pq.waitForSelector("#pi-confirmar [data-camara-anotar]");
    ok(/Mesa 1 · tablero 2: la cámara dice 0-1/.test(await pq.textContent("#pi-confirmar")), "el resultado queda para confirmar, con su tablero", await pq.textContent("#pi-confirmar"));
    await pq.click("#pi-confirmar [data-camara-anotar]");
    ge = await P.esperarGuardado(pq, (l) => ((l[0].rondas[0].mesas[0].partidas || [])[1] || {}).r === "0-1").then((l) => l[0]);
    igual("«Anotar» lo pone en ese tablero; el encuentro todavía no tiene resultado (faltan tableros)", [ge.rondas[0].mesas[0].partidas[1].r, ge.rondas[0].mesas[0].r], ["0-1", null]);
    // Y a Lichess, cada tablero con sus equipos.
    const aL = [];
    await pq.context().route("https://lichess.org/api/broadcast/round/*/push", async (r) => {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Authorization, Content-Type", "access-control-allow-methods": "POST" } });
      aL.push(r.request().postData() || "");
      await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"games":[{},{},{},{}]}' });
    });
    await pq.click("#pi-lichess-conectar");
    await pq.waitForSelector(dialogo);
    await pq.fill(dialogo + ' [name="clave"]', "lip_PRUEBA");
    await pq.fill(dialogo + ' [name="ronda"]', "XyZw5678");
    await pq.click(dialogo + " [data-avisos-aceptar]");
    await pq.waitForFunction(() => /Lichess: 4 partidas/.test((document.getElementById("pi-lichess-estado") || {}).textContent || ""), null, { timeout: 8000 }).catch(() => {});
    const cuerpo = aL[0] || "";
    ok((cuerpo.match(/\[Round "1\.1\.\d"\]/g) || []).length === 4, "a Lichess van los cuatro tableros del encuentro", cuerpo.slice(0, 300));
    ok(/\[Round "1\.1\.2"\]\n\[White "PRUEBA B2"\]\n\[Black "PRUEBA A2"\]\n\[WhiteTeam "Escuela B"\]\n\[BlackTeam "Escuela A"\]/.test(cuerpo)
      && /1\. d4 d5 2\. c4 0-1/.test(cuerpo), "el tablero 2 con los colores de las olimpiadas, sus equipos, sus jugadas y su resultado", cuerpo);
    igual("sin errores en la consola (equipos)", Q.errores, []);
  }

  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nPareo Integral recibe de las cámaras como se pidió.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
