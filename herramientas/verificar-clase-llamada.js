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
  si(/update\(\{ llamada_sesion: valor, llamada_modo: "turno", llamada_grabando: Boolean\(abrirla\) \}\)/.test(montaje) && /abrirla \? currentOpenSessionId : null/.test(montaje), "el profe abre la llamada en ESTA clase (llamada_sesion = la clase abierta) y la termina con null; las dos veces vuelve al turno, y al abrirla se graba sola");
  si(/update\(\{ llamada_grabando: Boolean\(encender\) \}\)/.test(montaje), "pausar o volver a grabar lo guarda el profe en game_state.llamada_grabando");
  si(/storage\.from\("clase-grabaciones"\)\.upload\(ruta, blob/.test(montaje) && /rpc\("guardar_parte_grabacion"/.test(montaje), "cada parte se sube al almacenamiento privado y se anota con guardar_parte_grabacion()");
  si(/const ruta = profile\.id \+ "\/" \+ clase \+ "\/"/.test(montaje), "…en la carpeta del profe y de ESA clase (la que traía la parte, no la abierta de ahora)");
  si(/update\(\{ llamada_modo: modo \}\)/.test(montaje), "quién puede hablar lo guarda el profe en game_state.llamada_modo");
  const aplicar = (sesion.match(/function applyGameStateRow\(row\) \{[\s\S]*?\n        }\n/) || [""])[0];
  si(/llamadaSesion = row\.llamada_sesion/.test(aplicar) && /llamada\.estado\(llamadaAbierta\(\), llamadaModo, llamadaGrabando\)/.test(aplicar) && /llamadaModo = row\.llamada_modo/.test(aplicar) && /llamadaGrabando = Boolean\(row\.llamada_grabando\)/.test(aplicar), "cada cambio de game_state le dice a la caja si la llamada está abierta (al alumno le aparece y desaparece solo)");
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
  si(Boolean(mig), "la migración llamada_de_la_clase está guardada");
  si(/revoke execute on function public\.llamada_de_la_clase\(uuid\) from public, anon/.test(sql), "llamada_de_la_clase() se le quita a public y anon (es una API)");
  si(/grant execute on function public\.llamada_de_la_clase\(uuid\) to authenticated/.test(sql), "…y se deja a authenticated");
  si(/clase_sacados/.test(sql) && /devuelto_at is null/.test(sql), "quien el profe sacó no entra");
  si(/role = 'profesor'/.test(sql), "el profe tiene que ser profesor (quien administra no da clase)");
  si(/if v_rol = 'alumno' and not v_abierta then\s+return null;/.test(sql), "el alumno no recibe pase si el profe no abrió la llamada en esta clase");
  si(/new\.llamada_sesion := old\.llamada_sesion;/.test(sql) && /new\.llamada_modo := old\.llamada_modo;/.test(sql), "solo el profe abre o termina la llamada y elige quién habla (protect_game_state_teacher_columns)");
  si(/v_modo := case when v_abierta then coalesce\(v_modo, 'turno'\) else 'turno' end;/.test(sql), "quién puede hablar solo vale con la llamada abierta en esta clase");
  const fn = leer("supabase/functions/clase-llamada/index.ts");
  si(!/SERVICE_ROLE/.test(fn), "la función no usa la clave de servicio");
  si(/global: \{ headers: \{ Authorization: autorizacion \} \}/.test(fn) && /rpc\("llamada_de_la_clase"/.test(fn), "…pregunta a la base con el token de quien llama");
  si(/canPublishSources: \[fuente\]/.test(fn) && /permisos\(hablar, "microphone"\)/.test(fn) && /permisos\(hablar, "MICROPHONE"\)/.test(fn), "solo voz: el pase y el cambio de permiso dejan publicar únicamente el micrófono");
  si(/ll\.rol === "profe" \|\| puedeHablar\(ll, ll\.yo, ll\.permiso_voz === true\)/.test(fn) && /const hablar = puedeHablar\(ll, p\.identity, conPermiso\.has\(p\.identity\)\)/.test(fn), "el pase y «sincronizar» deciden quién habla con la misma regla");
  si(/if \(ll\.grabando && !conPermiso\) return false;/.test(fn), "mientras se graba, el alumno sin permiso de su familia no habla nunca (lo diga el turno o «Todos»)");
  si(/if \(ll\.modo === "libre"\) return true;/.test(fn) && /if \(ll\.modo === "bloqueada"\) return false;/.test(fn) && /return identidad === ll\.elegido;/.test(fn), "…con turno habla quien lo tiene, con «Todos» cualquiera y con «Nadie» ningún alumno");
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
  const priv = leer("privacidad.html");
  si(/<strong>Grabación de la clase en vivo:<\/strong>/.test(priv) && /Se borra sola a los 90 días/.test(priv) && /no puede encender el micrófono mientras se graba/.test(priv),
    "privacidad.html dice que se graba, quién escucha, que se borra a los 90 días y que sin permiso no se habla");
  si(!/Grabación de la clase en vivo[^\n]*(Supabase|informe)/i.test(priv), "…sin nombrar el servicio de almacenamiento ni los informes (lo pidió el dueño)");
  si(/<strong>LiveKit no graba ni guarda la voz<\/strong>/.test(priv), "…y la línea de LiveKit ya no promete que la voz no se graba");

  console.log("\n=== La grabación: el permiso y escucharla ===");
  const conf = leer("js/configuracion.js");
  si(/rpc\("dar_permiso_grabar_voz", \{ p_version_privacidad: window\.LegalVersion\.PRIVACIDAD \}\)/.test(conf) && /rpc\("quitar_permiso_grabar_voz"\)/.test(conf),
    "Configuración da el permiso con la versión de la privacidad y lo quita");
  si(/profile\.role === "alumno" && !profile\.is_admin && !profile\._persona\) pintarPermisoVoz\(\)/.test(conf), "…solo el alumno, y no en «Ver como»");
  const confHtml = leer("configuracion.html");
  si(/id="voz-acepto"/.test(confHtml) && /href="privacidad\.html"/.test(confHtml.split('id="voz-permiso"')[1] || ""), "la casilla del permiso enlaza a la Política de privacidad");
  const rep = leer("js/repasar-clases.js");
  si(/from\('clase_grabaciones'\)/.test(rep) && /createSignedUrls\(/.test(rep) && /cargarGrabacion\(p\.class_session_id\)/.test(rep), "«Repasar mis clases» trae la grabación de la clase que se abre (firmada por una hora)");
  si(/catch \(e\) \{ console\.warn\('La grabación de la clase no se pudo cargar/.test(rep), "…y si falla, el visor sigue igual");
  si(/select\('ruta, parte, segundos, marcas'\)/.test(rep) && /addEventListener\('timeupdate', seguir\)/.test(rep) && /addEventListener\('seeked', seguir\)/.test(rep),
    "al escucharla, el tablero sigue a la grabación (también al saltar a otro minuto)");
  const seguir = (rep.match(/function seguirGrabacion\(marcas, t\)\{[\s\S]*?\n\}/) || [""])[0];
  si(/visor-grabacion-decir'\)\.checked/.test(seguir) && /if \(decir\) \{ mirar\(n\); return; \}/.test(seguir), "…y dice las jugadas solo si se marcó «Decir las jugadas mientras escucho»");
  si(/p_marcas: marcas && marcas\.length \? marcas : null/.test(leer("js/sesion.js")), "las marcas viajan con la parte a guardar_parte_grabacion()");
  const limp = leer("supabase/functions/clase-grabaciones-limpiar/index.ts");
  si(/rpc\("secreto_grabaciones_limpiar"\)/.test(limp) && /\.remove\(rutas\)/.test(limp) && limp.indexOf(".remove(rutas)") < limp.indexOf(".delete()"),
    "el borrado de los 90 días exige el secreto y borra primero el archivo y después la fila");
  si(/^clase-grabaciones-limpiar\s+false\s/m.test(leer("supabase/esquema/funciones-desplegadas.txt")) && /^limpiar-grabaciones\s+40 7 \* \* \*/m.test(leer("supabase/esquema/cron.txt")),
    "…está anotada (verify_jwt en false) y la tarea de pg_cron también");
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
        audioTrackPublications: new Map(),
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
      const p = (name, rol, habla, identity) => ({ name, identity, attributes: { rol }, permissions: { canPublish: habla }, isSpeaking: false, audioTrackPublications: new Map() });
      this.remoteParticipants.set("zoe", p("Zoe Álvarez", "alumno", false, "u-zoe"));
      this.remoteParticipants.set("profe", p("Karina Rojas", "profe", true, "u-karina"));
      this.remoteParticipants.set("ana", p("ana Mora", "alumno", true, "u-ana2"));
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

async function abrir(browser, { esProfe = false, respuesta, abierta = true, grabando = false }) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.setContent(`<!doctype html><html lang="es"><body>${cajaDeSesion()}</body></html>`);
  await page.addScriptTag({ content: LIVEKIT_FALSO });
  await page.addScriptTag({ content: sbFalso(respuesta) });
  await page.addScriptTag({ path: path.join(RAIZ, "js/clase-llamada.js") });
  await page.evaluate(({ esProfe, abierta, grabando }) => {
    window.__manos = [];
    window.__abrir = [];
    window.__fuera = [];
    window.__modos = [];
    window.__grabar = [];
    window.__partes = [];
    window.__fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    let mano = false;
    window.__llamada = ClaseLlamada.montar({
      sb: window.__sb, profesorId: "u-profe", esProfe, miNombre: "Luis Pérez",
      alternarMano: async () => { mano = !mano; window.__manos.push(mano); return mano; },
      // Como sesion.js: abrir la llamada la deja grabando; terminarla, no.
      abrir: async (v) => { window.__abrir.push(v); window.__llamada.estado(v, "turno", v); return ""; },
      modo: async (m) => { window.__modos.push(m); return ""; },
      grabar: async (v) => { window.__grabar.push(v); return ""; },
      claseActual: () => "clase-1",
      // Ana tiene el permiso de su familia; Zoe no.
      permisosDeVoz: async (ids) => { window.__permisosPedidos = ids; return new Set(["u-ana2"]); },
      subirParte: async (blob, segundos, tipo, clase, marcas) => { window.__partes.push({ bytes: blob.size, tipo, clase, marcas }); return ""; },
      // La posición que ve la clase: la prueba la cambia mientras se graba.
      posicion: () => window.__fen,
      anunciarFuera: (t) => window.__fuera.push(t),
    });
    window.__llamada.estado(abierta, "turno", abierta && grabando);
  }, { esProfe, abierta, grabando });
  return { ctx, page, errores };
}

const anuncio = async (page) => { await page.waitForTimeout(150); return page.textContent("#llamada-estado"); };
const visible = (page, sel) => page.$eval(sel, (el) => el.checkVisibility());
const PASE = (token, permiso_voz = true) => ({ status: 200, cuerpo: { url: "wss://x.livekit.cloud", token, sala: "clase-1", rol: "alumno", yo: "u-ana", puede_hablar: token === "pase-con-palabra", permiso_voz } });

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
  si(!(await visible(r.page, "#llamada-modos")), "al alumno no se le muestra «Quién puede hablar»");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // El alumno sin permiso de su familia, con la clase grabándose.
  r = await abrir(browser, { respuesta: PASE("pase-con-palabra", false), grabando: true });
  si(await visible(r.page, "#llamada-grabando"), "al alumno también le sale «Se está grabando la clase»");
  await r.page.click("#llamada-entrar");
  a = await anuncio(r.page);
  si(/Esta clase se está grabando\. Mientras se graba no puedes encender el micrófono: tu familia todavía no dio permiso/.test(a), "al entrar sin permiso se le dice que se graba y por qué no puede hablar");
  si(!(await visible(r.page, "#llamada-grabar")), "al alumno no se le muestra «Pausar la grabación»");
  si(!/sin permiso de grabación/.test(await r.page.textContent("#llamada-lista")), "…ni quién tiene o no el permiso de grabación (eso es solo para el profe)");
  await r.page.evaluate(() => window.__sala.__permiso(false));
  await r.page.keyboard.press("Alt+KeyM");
  si(/tu familia todavía no dio permiso/.test(await anuncio(r.page)), "Alt+M se lo recuerda");
  await r.page.evaluate(() => window.__llamada.estado(true, "turno", false));
  si(/Se pausó la grabación de la clase/.test(await anuncio(r.page)) && !(await visible(r.page, "#llamada-grabando")), "cuando el profe pausa, se le dice y el aviso se quita");
  await r.ctx.close();

  // El alumno se entera de quién puede hablar.
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  await r.page.evaluate(() => window.__llamada.estado(true, "bloqueada"));
  si(/Tu profe bloqueó los micrófonos/.test(await anuncio(r.page)), "cuando el profe bloquea, el alumno lo oye");
  await r.page.keyboard.press("Alt+KeyM");
  si(/bloqueó los micrófonos/.test(await anuncio(r.page)), "…y Alt+M le recuerda por qué no puede hablar");
  await r.page.evaluate(() => window.__llamada.estado(true, "libre"));
  si(/Tu profe abrió el micrófono para todos/.test(await anuncio(r.page)), "cuando abre el micrófono para todos, también");
  await r.page.evaluate(() => window.__llamada.estado(true, "turno"));
  si(/Tu profe volvió al turno/.test(await anuncio(r.page)), "…y cuando vuelve al turno");
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
  await r.page.waitForTimeout(600);
  const filaZoe = await r.page.$$eval("#llamada-lista li", (lis) => (lis.find((li) => /Zoe/.test(li.textContent)) || {}).textContent || "");
  const filaAna = await r.page.$$eval("#llamada-lista li", (lis) => (lis.find((li) => /ana Mora/.test(li.textContent)) || {}).textContent || "");
  si(/sin permiso de grabación: no puede hablar/.test(filaZoe) && !/sin permiso/.test(filaAna), "el profe ve quién no tiene permiso de grabación, y que mientras se graba no puede hablar («" + filaZoe + "»)");
  si(JSON.stringify((await r.page.evaluate(() => window.__permisosPedidos)).sort()) === JSON.stringify(["u-ana2", "u-zoe"]), "…preguntando por los alumnos de la llamada, no por el profe");
  si(await visible(r.page, "#llamada-grabando") && await r.page.textContent("#llamada-grabar") === "⏸ Pausar la grabación", "al abrirla se graba sola: «Se está grabando la clase» a la vista y «Pausar la grabación»");
  await r.page.waitForTimeout(300);
  await r.page.evaluate(() => { window.__fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"; });
  await r.page.waitForTimeout(1300);
  await r.page.click("#llamada-grabar");
  await r.page.waitForTimeout(600);
  const partes = await r.page.evaluate(() => window.__partes);
  const marcas = (partes[0] && partes[0].marcas) || [];
  si(marcas.length === 2 && marcas[0].s === 0 && marcas[0].fen === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" && marcas[1].fen === "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" && marcas[1].s > 0.5 && marcas[1].s < 2.5,
    "la parte se sube con las posiciones del tablero y el segundo de cada una (" + JSON.stringify(marcas.map((m) => m.s)) + ")");
  si(JSON.stringify(await r.page.evaluate(() => window.__grabar)) === "[false]" && partes.length === 1 && partes[0].bytes > 0 && partes[0].clase === "clase-1" && /^audio\//.test(partes[0].tipo),
    "pausar guarda la parte grabada (" + JSON.stringify(partes) + ") y lo anota para todos");
  si(!(await visible(r.page, "#llamada-grabando")) && await r.page.textContent("#llamada-grabar") === "⏺ Volver a grabar" && /Pausaste la grabación/.test(await anuncio(r.page)), "…el aviso se quita, el botón dice «Volver a grabar» y se dice");
  await r.page.click("#llamada-grabar");
  await r.page.waitForTimeout(300);
  si(JSON.stringify(await r.page.evaluate(() => window.__grabar)) === "[false,true]" && await visible(r.page, "#llamada-grabando"), "volver a grabar lo anota y vuelve el aviso");
  si(await r.page.textContent("#llamada-salir") === "Terminar la llamada", "el profe no «sale»: «Terminar la llamada»");
  await r.page.keyboard.press("Alt+KeyY");
  await r.page.waitForTimeout(100);
  si(JSON.stringify(await r.page.evaluate(() => window.__manos)) === "[]", "Alt+Y no hace nada al profe");
  const cuentaSinc = () => r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "sincronizar").length);
  const antesSinc = await cuentaSinc();
  await r.page.evaluate(() => window.__llamada.sincronizar());
  si(await cuentaSinc() === antesSinc + 1, "sincronizar() del profe le pide a la función que acomode la sala");
  si(await visible(r.page, "#llamada-modos"), "dentro de la llamada, el profe ve «Quién puede hablar»");
  si(await r.page.textContent('[data-modo="turno"]') === "✓ Con turno" && await r.page.getAttribute('[data-modo="turno"]', "aria-pressed") === "true", "…empieza «Con turno», marcado con aria-pressed y escrito («✓»)");
  await r.page.click('[data-modo="bloqueada"]');
  await r.page.waitForTimeout(200);
  si(JSON.stringify(await r.page.evaluate(() => window.__modos)) === '["bloqueada"]' && await cuentaSinc() === antesSinc + 2,
    "«Nadie» lo guarda y le pide al servidor que les quite la palabra");
  si(/Micrófonos bloqueados: solo hablas tú/.test(await anuncio(r.page)) && await r.page.getAttribute('[data-modo="bloqueada"]', "aria-pressed") === "true", "…y lo dice");
  await r.page.click('[data-modo="libre"]');
  await r.page.waitForTimeout(200);
  si(/Micrófono libre: todos pueden hablar/.test(await anuncio(r.page)) && await r.page.textContent('[data-modo="libre"]') === "✓ Todos", "«Todos» también");
  await r.page.click("#llamada-salir");
  await r.page.waitForTimeout(200);
  si(JSON.stringify(await r.page.evaluate(() => window.__abrir)) === "[true,false]" && await cuentaSinc() === antesSinc + 4,
    "«Terminar la llamada» la cierra para todos (llamada_sesion en null) y le pide al servidor que saque a los demás");
  si((await r.page.evaluate(() => window.__partes)).length === 2, "al terminar la llamada se sube la última parte");
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
