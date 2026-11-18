/* Comprueba la llamada de voz de la clase en vivo (js/clase-llamada.js,
   sesion.html, la Edge Function clase-llamada). Ver «La llamada de voz de la
   clase» en docs/decisiones/clase-en-vivo.md.

   Lo que se rompe callado acá:

   1. QUE LA PALABRA SIGA AL TURNO DE LA CLASE. Si sesion.js deja de llamar a
      `llamada.sincronizar()` después de dar o terminar un turno (o clase-sacar
      después de sacar), la llamada se ve perfecta y el alumno al que le dieron
      la palabra no puede hablar —o el que terminó sigue hablando—.
   2. QUE QUIEN DECIDE SEA LA BASE CON EL TOKEN DE QUIEN PIDE: la función no
      puede usar la clave de servicio (se saltaría la RLS y la verificación en
      dos pasos), y la función de la base no puede quedar para `anon`.
   3. QUE EL MICRÓFONO SEA SOLO DE LA CLASE: `microphone=(self)` en /sesion y
      en ningún otro lado, y LiveKit en connect-src (sin eso no conecta, sin
      ningún error en la caja salvo «no se pudo entrar»).
   4. LA CAJA, EN UN NAVEGADOR, con un LiveKit y una función de mentira: lo que
      se anuncia, el micrófono bloqueado sin la palabra, la palabra dada y
      quitada, los atajos y el aviso de cuando no está configurada. Se mide si
      un botón se ve con checkVisibility(), no por el atributo.

   No necesita el sitio servido: la caja se arma con el HTML de sesion.html.
   Uso:  node herramientas/verificar-clase-llamada.js                           */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
// Sin los \r de Windows (core.autocrlf): las expresiones buscan "\n".
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8").replace(/\r\n/g, "\n");
let fallos = 0;
const bien = (m) => console.log("  ✓ " + m);
const mal = (m) => { fallos++; console.log("  ✗ " + m); };
const si = (cond, m) => (cond ? bien(m) : mal(m));

/* ------------------------------------------------------------------ 1-3 */

console.log("=== Los enganches de la clase ===");
{
  const sesion = leer("js/sesion.js");
  const darTurno = (sesion.match(/async function darTurno\([\s\S]*?\n        }\n/) || [""])[0];
  const terminar = (sesion.match(/async function terminarElegido\([\s\S]*?\n        }\n/) || [""])[0];
  si(/llamada\.sincronizar\(\)/.test(darTurno), "darTurno() acomoda la llamada (puede hablar quien recibe el turno)");
  si(/llamada\.sincronizar\(\)/.test(terminar), "terminarElegido() acomoda la llamada (se le apaga el micrófono)");
  si(/ClaseLlamada\.montar\(/.test(sesion), "sesion.js monta la llamada");
  const montaje = (sesion.match(/if \(window\.ClaseLlamada[\s\S]*?\n            }\n/) || [""])[0];
  si(/!esObservador/.test(montaje) && /!vistaPrevia/.test(montaje) && /!modoProyector/.test(montaje) && /!modoControl/.test(montaje),
    "…pero no para quien observa, la vista previa, el proyector ni el control remoto");
  si(/profile\.role === "profesor"/.test(montaje), "…y del lado del profe, solo quien da clase (no quien administra)");
  si(/alternarMano:[^\n]*setHandRaised\(!handRaised\)/.test(montaje), "la mano de la llamada es la mano de la clase (setHandRaised)");
  si(/update\(\{ llamada_sesion: valor \}\)/.test(montaje) && /abrirla \? currentOpenSessionId : null/.test(montaje), "el profe abre la llamada en ESTA clase (llamada_sesion = la clase abierta) y la termina con null");
  const aplicar = (sesion.match(/function applyGameStateRow\(row\) \{[\s\S]*?\n        }\n/) || [""])[0];
  si(/llamadaSesion = row\.llamada_sesion/.test(aplicar) && /llamada\.estado\(llamadaAbierta\(\)\)/.test(aplicar), "cada cambio de game_state le dice a la caja si la llamada está abierta (al alumno le aparece y desaparece solo)");
  si(/llamadaSesion === currentOpenSessionId/.test(sesion), "…y abierta es SOLO en la clase de ahora (la de ayer no cuenta)");
  const sacar = (leer("js/clase-sacar.js").match(/async function sacarDeLaClase\([\s\S]*?\n}\n/) || [""])[0];
  si(/llamada\.sincronizar\(\)/.test(sacar), "sacar a alguien de la clase lo saca también de la llamada");
  const html = leer("sesion.html");
  const iLlamada = html.indexOf('src="js/clase-llamada.js"'), iSesion = html.indexOf('src="js/sesion.js"');
  si(iLlamada > 0 && iLlamada < iSesion, "js/clase-llamada.js carga antes que sesion.js");
}

console.log("\n=== La base y la función ===");
{
  // La ÚLTIMA migración que define la función es la que vale en la base.
  const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).sort().filter((f) =>
    /create or replace function public\.llamada_de_la_clase/.test(leer("supabase/migraciones/" + f))).pop();
  const sql = mig ? leer("supabase/migraciones/" + mig) : "";
  /* Los permisos y el trigger no tienen por qué repetirse en la última: un
     `create or replace` conserva el execute de la función, y el trigger vive
     aparte. Se buscan en TODAS las migraciones que tocan la llamada
     (clase_solo_asignados redefine la función solo para pedir la lista). */
  const todas = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).sort()
    .map((f) => leer("supabase/migraciones/" + f))
    .filter((t) => /llamada_de_la_clase|llamada_sesion/.test(t)).join(" ");
  si(Boolean(mig), "la migración llamada_de_la_clase está guardada");
  si(/revoke execute on function public\.llamada_de_la_clase\(uuid\) from public, anon/.test(todas), "llamada_de_la_clase() se le quita a public y anon (es una API)");
  si(/grant execute on function public\.llamada_de_la_clase\(uuid\) to authenticated/.test(todas), "…y se deja a authenticated");
  si(/clase_sacados/.test(sql) && /devuelto_at is null/.test(sql), "quien el profe sacó no entra");
  si(/role = 'profesor'/.test(sql), "el profe tiene que ser profesor (quien administra no da clase)");
  si(/if v_rol = 'alumno' and not v_abierta then\s+return null;/.test(sql), "el alumno no recibe pase si el profe no abrió la llamada en esta clase");
  si(/new\.llamada_sesion := old\.llamada_sesion;/.test(todas), "solo el profe abre o termina la llamada (protect_game_state_teacher_columns)");
  const fn = leer("supabase/functions/clase-llamada/index.ts");
  si(!/SERVICE_ROLE/.test(fn), "la función no usa la clave de servicio");
  si(/global: \{ headers: \{ Authorization: autorizacion \} \}/.test(fn) && /rpc\("llamada_de_la_clase"/.test(fn), "…pregunta a la base con el token de quien llama");
  si(/canPublishSources: \[fuente\]/.test(fn) && /permisos\(hablar, "microphone"\)/.test(fn) && /permisos\(hablar, "MICROPHONE"\)/.test(fn), "solo voz: el pase y el cambio de permiso dejan publicar únicamente el micrófono");
  si(/ll\.rol === "profe" \|\| ll\.elegido === ll\.yo/.test(fn), "en el pase, habla el profe o quien tiene el turno");
  si(/if \(ll\.rol !== "profe"\)/.test(fn), "solo el profe sincroniza");
  si(/can_publish \?\? p\.permission\?\.canPublish/.test(fn), "lee el permiso como lo contesta LiveKit (snake_case)");
  si(/sacados\.has\(p\.identity\) \|\| !ll\.abierta/.test(fn), "con la llamada terminada, «sincronizar» saca a todos menos al profe");
  si(/^clase-llamada\s+true\s/m.test(leer("supabase/esquema/funciones-desplegadas.txt")), "está en funciones-desplegadas.txt con verify_jwt en true");
  si(/"clase-llamada": \[\]/.test(leer("herramientas/funciones-armar.js")), "está en la lista de funciones-armar.js (se despliega sola)");
}

console.log("\n=== Las cabeceras y la privacidad ===");
{
  const h = leer("_headers");
  const csp = (h.match(/Content-Security-Policy:[^\n]*/) || [""])[0];
  const connect = ((csp.match(/connect-src ([^;]*)/) || [])[1] || "").split(/\s+/);
  si(connect.includes("wss://*.livekit.cloud") && connect.includes("https://*.livekit.cloud"), "connect-src deja pasar a LiveKit (wss y https)");
  // Cada bloque de rutas con su Permissions-Policy.
  const bloques = h.split(/\n(?=\/)/).map((b) => ({ ruta: b.split("\n")[0].trim(), pp: (b.match(/Permissions-Policy: ([^\n]*)/) || [])[1] || "" }));
  const conMic = bloques.filter((b) => /microphone=\(self\)/.test(b.pp)).map((b) => b.ruta).sort();
  si(JSON.stringify(conMic) === JSON.stringify(["/sesion", "/sesion.html"]), "el micrófono se permite SOLO en /sesion y /sesion.html (" + conMic.join(", ") + ")");
  const deSesion = bloques.filter((b) => b.ruta === "/sesion" || b.ruta === "/sesion.html");
  si(deSesion.length === 2 && deSesion.every((b) => /! Permissions-Policy/.test(h.split(b.ruta + "\n")[1].split("\n\n")[0])),
    "…quitando antes la regla de /* (si no, Cloudflare las junta y queda microphone=())");
  si(/<strong>LiveKit:<\/strong>[^<]*voz/.test(leer("privacidad.html")), "LiveKit está en la lista de proveedores de privacidad.html");
}

/* ------------------------------------------------------------------ 4 */

// La caja, tal cual está en sesion.html.
function cajaDeSesion() {
  const html = leer("sesion.html");
  const m = html.match(/<section id="llamada"[\s\S]*?<\/section>/);
  if (!m) throw new Error("no encontré <section id=\"llamada\"> en sesion.html");
  return m[0];
}

/* Un LiveKit de mentira: una sala con un profe ya conectado, eventos que la
   prueba dispara a mano y un micrófono que solo se enciende si el permiso lo
   deja, como el de verdad. */
const LIVEKIT_FALSO = `
(function () {
  const RoomEvent = {};
  ["ParticipantConnected","ParticipantDisconnected","TrackSubscribed","TrackUnsubscribed","ParticipantPermissionsChanged",
   "LocalTrackPublished","LocalTrackUnpublished","ConnectionQualityChanged","Reconnecting","Reconnected","Disconnected","ActiveSpeakersChanged"].forEach((k) => { RoomEvent[k] = k; });
  class Room {
    constructor() {
      this.state = "disconnected";
      this.handlers = {};
      this.remoteParticipants = new Map();
      this.activeSpeakers = [];
      const yo = this;
      this.localParticipant = {
        permissions: { canPublish: false },
        isMicrophoneEnabled: false,
        isSpeaking: false,
        async setMicrophoneEnabled(v) {
          if (v && !this.permissions.canPublish) throw new Error("sin permiso");
          this.isMicrophoneEnabled = v;
          yo.emit(v ? "LocalTrackPublished" : "LocalTrackUnpublished");
        },
      };
      window.__sala = this;
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, ...a) { (this.handlers[ev] || []).forEach((fn) => fn(...a)); }
    async connect(url, token) {
      window.__conecto = { url, token };
      this.state = "connected";
      this.localParticipant.permissions.canPublish = token === "pase-con-palabra";
      // Entran desordenados: la lista tiene que salir igual (tú, el profe, los demás por nombre).
      const p = (name, rol, habla) => ({ name, attributes: { rol }, permissions: { canPublish: habla }, isSpeaking: false, audioTrackPublications: new Map() });
      this.remoteParticipants.set("zoe", p("Zoe Álvarez", "alumno", false));
      this.remoteParticipants.set("profe", p("Karina Rojas", "profe", true));
      this.remoteParticipants.set("ana", p("ana Mora", "alumno", true));
    }
    async startAudio() {}
    async disconnect() { this.state = "disconnected"; this.emit("Disconnected", 1); }
    // Lo que hace el servidor al cambiarle el permiso a alguien.
    __permiso(v) {
      const antes = { ...this.localParticipant.permissions };
      this.localParticipant.permissions = { canPublish: v };
      if (!v && this.localParticipant.isMicrophoneEnabled) { this.localParticipant.isMicrophoneEnabled = false; this.emit("LocalTrackUnpublished"); }
      this.emit("ParticipantPermissionsChanged", antes, this.localParticipant);
    }
  }
  window.LivekitClient = { Room, RoomEvent, ConnectionQuality: { Poor: "poor" }, DisconnectReason: { PARTICIPANT_REMOVED: 4 } };
})();`;

function sbFalso(respuesta) {
  return `
window.__pedidos = [];
window.__sb = { functions: { async invoke(nombre, op) {
  window.__pedidos.push({ nombre, body: op.body });
  const r = ${JSON.stringify(respuesta)};
  if (r.status !== 200) return { data: null, error: { context: { json: async () => r.cuerpo } } };
  return { data: r.cuerpo, error: null };
} } };`;
}

async function abrir(browser, { esProfe = false, respuesta, abierta = true }) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.setContent(`<!doctype html><html lang="es"><body>${cajaDeSesion()}</body></html>`);
  await page.addScriptTag({ content: LIVEKIT_FALSO });
  await page.addScriptTag({ content: sbFalso(respuesta) });
  await page.addScriptTag({ path: path.join(RAIZ, "js/clase-llamada.js") });
  await page.evaluate(({ esProfe, abierta }) => {
    window.__manos = [];
    window.__abrir = [];
    window.__fuera = [];
    let mano = false;
    window.__llamada = ClaseLlamada.montar({
      sb: window.__sb, profesorId: "u-profe", esProfe, miNombre: "Luis Pérez",
      alternarMano: async () => { mano = !mano; window.__manos.push(mano); return mano; },
      abrir: async (v) => { window.__abrir.push(v); window.__llamada.estado(v); return ""; },
      anunciarFuera: (t) => window.__fuera.push(t),
    });
    window.__llamada.estado(abierta);
  }, { esProfe, abierta });
  return { ctx, page, errores };
}

const anuncio = async (page) => { await page.waitForTimeout(150); return page.textContent("#llamada-estado"); };
const visible = (page, sel) => page.$eval(sel, (el) => el.checkVisibility());
const PASE = (token) => ({ status: 200, cuerpo: { url: "wss://x.livekit.cloud", token, sala: "clase-1", rol: "alumno", yo: "u-ana", puede_hablar: token === "pase-con-palabra" } });

async function pruebas(browser) {
  console.log("\n=== La caja, en un navegador ===");

  // Sin la llamada abierta, al alumno no le sale nada; le aparece cuando el profe la abre.
  let r = await abrir(browser, { respuesta: PASE("pase-sin-palabra"), abierta: false });
  si(!(await visible(r.page, "#llamada")), "sin la llamada abierta, al alumno no le sale la caja");
  await r.page.evaluate(() => window.__llamada.estado(true));
  si(await visible(r.page, "#llamada") && /Tu profe abrió la llamada de la clase/.test(await anuncio(r.page)), "cuando el profe la abre, le aparece y se lo dice");
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  await r.page.evaluate(() => window.__llamada.estado(false));
  await r.page.waitForTimeout(150);
  si(!(await visible(r.page, "#llamada")), "cuando el profe la termina, la caja se le esconde");
  si(await r.page.evaluate(() => window.__sala.state) === "disconnected", "…y sale de la sala aunque el servidor tarde");
  si(/Tu profe terminó la llamada de la clase\. Saliste de la llamada\./.test((await r.page.evaluate(() => window.__fuera)).join(" ")), "…y se lo dice fuera de la caja (su región viva se fue con ella)");
  await r.ctx.close();

  // El alumno sin la palabra.
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  si(await visible(r.page, "#llamada"), "la caja se ve al montarla");
  si(await visible(r.page, "#llamada-entrar") && !(await visible(r.page, "#llamada-mic")), "antes de entrar: «Entrar a la llamada», sin el botón del micrófono");
  await r.page.click("#llamada-entrar");
  let a = await anuncio(r.page);
  si(/Entraste a la llamada; hay 3 personas más/.test(a) && /levanta la mano con Alt Y/.test(a), "al entrar dice cuántos hay y cómo pedir la palabra: «" + a + "»");
  si(await visible(r.page, "#llamada-lista"), "ya dentro se ve la lista de quiénes están");
  si(await r.page.textContent("#llamada-gente-titulo") === "En la llamada (4)", "…con cuántos son, contándote");
  const nombres = await r.page.$$eval("#llamada-lista li", (lis) => lis.map((li) => li.children[0].textContent));
  si(JSON.stringify(nombres) === JSON.stringify(["Luis Pérez", "Karina Rojas", "ana Mora", "Zoe Álvarez"]),
    "…en orden: tú, el profe y los demás por nombre, sin importar mayúsculas ni el orden en que entraron (" + nombres.join(", ") + ")");
  const detalles = await r.page.$$eval("#llamada-lista li", (lis) => lis.map((li) => li.children[1].textContent));
  si(detalles[0] === "tú" && detalles[1] === "profe" && detalles[2] === "con la palabra" && detalles[3] === "", "…diciendo escrito quién es el profe y quién tiene la palabra (" + detalles.join(" | ") + ")");
  si(await r.page.getAttribute("#llamada-gente", "aria-live") === null, "…y la lista no es región viva (lo que cambia ya se anuncia aparte)");
  await r.page.evaluate(() => { const z = window.__sala.remoteParticipants.get("zoe"); z.isSpeaking = true; window.__sala.activeSpeakers = [z]; window.__sala.emit("ActiveSpeakersChanged", [z]); });
  si(/hablando/.test(await r.page.textContent("#llamada-lista li:nth-child(4)")), "quien habla lo dice la lista, sin anunciarlo");
  const pedido = await r.page.evaluate(() => window.__pedidos[0]);
  si(pedido && pedido.nombre === "clase-llamada" && pedido.body.accion === "pase" && pedido.body.profesor === "u-profe", "pide el pase a clase-llamada con el profesor de la clase");
  si(await visible(r.page, "#llamada-mic") && !(await visible(r.page, "#llamada-entrar")), "ya dentro: el micrófono a la vista y «Entrar» no");
  si(await r.page.evaluate(() => document.activeElement.id) === "llamada-mic", "el foco queda en el micrófono");
  await r.page.keyboard.press("Alt+KeyM");
  a = await anuncio(r.page);
  si(/Todavía no tienes la palabra/.test(a), "Alt+M sin la palabra no enciende nada y lo dice");
  si(await r.page.getAttribute("#llamada-mic", "aria-pressed") === "false", "…y el micrófono sigue apagado (aria-pressed)");
  await r.page.keyboard.press("Alt+KeyY");
  a = await anuncio(r.page);
  si(JSON.stringify(await r.page.evaluate(() => window.__manos)) === "[true]" && /Levantaste la mano/.test(a), "Alt+Y levanta la mano DE LA CLASE y lo dice");
  await r.page.evaluate(() => window.__sala.__permiso(true));
  a = await anuncio(r.page);
  si(/Tu profe te dio la palabra: enciende el micrófono con Alt M/.test(a), "cuando el servidor le da la palabra, se dice");
  si(await r.page.getAttribute("#llamada-mic", "aria-pressed") === "false", "…pero el micrófono NO se enciende solo");
  await r.page.keyboard.press("Alt+KeyM");
  a = await anuncio(r.page);
  si(/Micrófono encendido/.test(a) && await r.page.getAttribute("#llamada-mic", "aria-pressed") === "true", "con la palabra, Alt+M lo enciende (aria-pressed y anuncio)");
  si(/encendido/.test(await r.page.textContent("#llamada-mic")), "…y el botón lo dice escrito, no solo con el color");
  await r.page.evaluate(() => window.__sala.__permiso(false));
  a = await anuncio(r.page);
  si(/Se terminó tu turno: tu micrófono se apagó/.test(a) && await r.page.getAttribute("#llamada-mic", "aria-pressed") === "false", "al terminar el turno se apaga y se dice");
  await r.page.keyboard.press("Alt+KeyQ");
  a = await anuncio(r.page);
  si(/^En la llamada hay 4 contigo: Karina Rojas, el profe; ana Mora, con la palabra; Zoe Álvarez\.$/.test(a), "Alt+Q dice quién está, en el mismo orden que la lista: «" + a + "»");
  await r.page.keyboard.press("Alt+KeyW");
  si(/Está hablando Zoe Álvarez/.test(await anuncio(r.page)), "Alt+W dice quién habla");
  await r.page.evaluate(() => window.__sala.emit("Disconnected", 4));
  a = await anuncio(r.page);
  si(/Tu profe te sacó de la llamada/.test(a), "si el servidor lo saca, se lo dice");
  si(await visible(r.page, "#llamada-entrar") && await r.page.evaluate(() => document.activeElement.id) === "llamada-entrar", "…y vuelve a «Entrar», con el foco ahí");
  si(!(await visible(r.page, "#llamada-gente")), "…y la lista se esconde");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // El alumno que ya tenía el turno al entrar.
  r = await abrir(browser, { respuesta: PASE("pase-con-palabra") });
  await r.page.click("#llamada-entrar");
  si(/Tienes la palabra: enciende el micrófono/.test(await anuncio(r.page)), "quien entra con el turno se entera al entrar");
  si(await r.page.isHidden("#llamada-atajo-mano") === false, "al alumno se le muestra el atajo de la mano");
  await r.ctx.close();

  // El profe: entra, y al entrar acomoda la sala.
  r = await abrir(browser, { esProfe: true, abierta: false, respuesta: { status: 200, cuerpo: { url: "wss://x", token: "pase-con-palabra", sala: "clase-1", rol: "profe", yo: "u-profe", puede_hablar: true } } });
  si(await visible(r.page, "#llamada") && /Abrir la llamada a la clase/.test(await r.page.textContent("#llamada-entrar")), "al profe la caja le sale siempre, con «Abrir la llamada a la clase»");
  si(!(await visible(r.page, "#llamada-atajo-mano")), "al profe no se le muestra el atajo de la mano");
  await r.page.click("#llamada-entrar");
  await r.page.waitForTimeout(200);
  const acciones = await r.page.evaluate(() => window.__pedidos.map((p) => p.body.accion));
  si(JSON.stringify(acciones) === JSON.stringify(["pase", "sincronizar"]), "el profe al entrar pide su pase y acomoda la sala (" + acciones.join(", ") + ")");
  si(JSON.stringify(await r.page.evaluate(() => window.__abrir)) === "[true]", "…abriendo antes la llamada a la clase");
  si(await r.page.textContent("#llamada-salir") === "Terminar la llamada", "el profe no «sale»: «Terminar la llamada»");
  await r.page.keyboard.press("Alt+KeyY");
  await r.page.waitForTimeout(100);
  si(JSON.stringify(await r.page.evaluate(() => window.__manos)) === "[]", "Alt+Y no hace nada al profe");
  await r.page.evaluate(() => window.__llamada.sincronizar());
  si(await r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "sincronizar").length) === 2, "sincronizar() del profe le pide a la función que acomode la sala");
  await r.page.click("#llamada-salir");
  await r.page.waitForTimeout(200);
  si(JSON.stringify(await r.page.evaluate(() => window.__abrir)) === "[true,false]" && await r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "sincronizar").length) === 3,
    "«Terminar la llamada» la cierra para todos (llamada_sesion en null) y le pide al servidor que saque a los demás");
  si(/Terminaste la llamada para toda la clase/.test(await anuncio(r.page)) && await r.page.evaluate(() => window.__sala.state) === "disconnected", "…sale de la sala y lo dice");
  await r.ctx.close();

  // Sin la llamada configurada.
  r = await abrir(browser, { respuesta: { status: 503, cuerpo: { error: "La llamada de la clase todavía no está disponible.", sin_configurar: true } } });
  await r.page.click("#llamada-entrar");
  a = await anuncio(r.page);
  si(/todavía no está disponible/.test(a), "sin configurar dice que todavía no está disponible: «" + a + "»");
  si(await visible(r.page, "#llamada-entrar") && !(await r.page.isDisabled("#llamada-entrar")), "…y deja «Entrar» listo para intentar otra vez");
  await r.ctx.close();

  // El alumno no sincroniza nada aunque se llame.
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  await r.page.evaluate(() => window.__llamada.sincronizar());
  si(await r.page.evaluate(() => window.__pedidos.length) === 0, "sincronizar() de un alumno no pide nada");
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try { await pruebas(browser); } finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien: la llamada sigue al turno de la clase.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
