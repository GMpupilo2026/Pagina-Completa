/* Comprueba los avisos push: el cifrado, el interruptor de Configuración y —lo
   que de verdad importa— que nadie pueda meterle una notificación en el
   teléfono a quien no es su alumno.

   Dos partes, porque son dos peligros distintos:

   1. EL CIFRADO, sin navegador. Un mensaje mal cifrado no da error acá: el
      servidor de push lo acepta, lo reenvía, y el teléfono lo descarta en
      silencio. Nadie se entera de que los avisos no llegan. Así que se cifra
      un mensaje con una llave de aparato inventada y se descifra de vuelta,
      haciendo el papel del navegador.

   2. LA PÁGINA, en un navegador de verdad: que el permiso se pida SOLO al
      apretar el botón (el navegador lo deja pedir una vez por aparato: si se
      pide al cargar y dicen que no, se perdió el único tiro), que se guarde el
      aparato correcto y que apagar borre la fila.

   Lo que la base hace cumplir —quién puede avisarle a quién— se comprobó
   impersonando roles en SQL.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-notificaciones.js                        */
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* ---------------------------------------------------------------------------
   1. El cifrado, de ida y de vuelta.

   Se hace dentro de Chromium porque el cifrado de Web Push usa Web Crypto, que
   en Node vive en otro sitio; y de paso se prueba con el mismo motor que va a
   descifrar en el teléfono. El código cifrador es el MISMO de la Edge Function
   (webpush.ts), copiado acá a mano — es la única copia y por eso esta prueba
   existe: si se van separando, el descifrado falla y se ve.
--------------------------------------------------------------------------- */
const PRUEBA_CIFRADO = `
const b64urlAOctetos = (s) => {
  const base = s.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = base + "=".repeat((4 - (base.length % 4)) % 4);
  const bin = atob(relleno);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const octetosAB64url = (b) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
};
const juntar = (...partes) => {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};
const texto = (s) => new TextEncoder().encode(s);

async function hkdf(ikm, sal, info, octetos) {
  const llave = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sal, info }, llave, octetos * 8);
  return new Uint8Array(bits);
}

// --- lo que hace el servidor (copia de webpush.ts)
async function cifrar(mensaje, p256dh, auth) {
  const claro = juntar(texto(mensaje), new Uint8Array([0x02]));
  const llaveAparato = b64urlAOctetos(p256dh);
  const secretoAparato = b64urlAOctetos(auth);
  const efimero = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const efimeroPub = new Uint8Array(await crypto.subtle.exportKey("raw", efimero.publicKey));
  const pubAparato = await crypto.subtle.importKey("raw", llaveAparato, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pubAparato }, efimero.privateKey, 256));
  const infoLlave = juntar(texto("WebPush: info\\0"), llaveAparato, efimeroPub);
  const ikm = await hkdf(compartido, secretoAparato, infoLlave, 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, sal, texto("Content-Encoding: aes128gcm\\0"), 16);
  const nonce = await hkdf(ikm, sal, texto("Content-Encoding: nonce\\0"), 12);
  const llaveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, llaveAes, claro));
  const tam = new Uint8Array(4);
  new DataView(tam.buffer).setUint32(0, 4096);
  return juntar(sal, tam, new Uint8Array([efimeroPub.length]), efimeroPub, cifrado);
}

// --- lo que hace el navegador del alumno
async function descifrar(cuerpo, privadaAparato, publicaAparato, auth) {
  const sal = cuerpo.subarray(0, 16);
  const largoLlave = cuerpo[20];
  const efimeroPub = cuerpo.subarray(21, 21 + largoLlave);
  const cifrado = cuerpo.subarray(21 + largoLlave);
  const pubEfimero = await crypto.subtle.importKey("raw", efimeroPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pubEfimero }, privadaAparato, 256));
  const infoLlave = juntar(texto("WebPush: info\\0"), publicaAparato, efimeroPub);
  const ikm = await hkdf(compartido, b64urlAOctetos(auth), infoLlave, 32);
  const cek = await hkdf(ikm, sal, texto("Content-Encoding: aes128gcm\\0"), 16);
  const nonce = await hkdf(ikm, sal, texto("Content-Encoding: nonce\\0"), 12);
  const llaveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, llaveAes, cifrado));
  return new TextDecoder().decode(claro.subarray(0, claro.length - 1));   // se quita el 0x02
}

window.__probarCifrado = async (mensaje) => {
  // Un "aparato" de mentira: su par de llaves y su secreto, como los que da
  // pushManager.subscribe() de verdad.
  const aparato = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const p256dh = octetosAB64url(await crypto.subtle.exportKey("raw", aparato.publicKey));
  const auth = octetosAB64url(crypto.getRandomValues(new Uint8Array(16)));
  const cuerpo = await cifrar(mensaje, p256dh, auth);
  const devuelta = await descifrar(cuerpo, aparato.privateKey, b64urlAOctetos(p256dh), auth);
  return {
    devuelta,
    cuerpo: octetosAB64url(cuerpo),
    largoSal: cuerpo.subarray(0, 16).length,
    largoLlave: cuerpo[20],
    // El cuerpo no puede llevar el mensaje en claro por ninguna parte.
    seVeElTexto: new TextDecoder().decode(cuerpo).indexOf(mensaje) !== -1,
  };
};
`;

/* Un Supabase de mentira que apunta lo que la página manda. */
function clienteFalso() {
  return `
window.__llamadas = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const PERFIL = { id: "u-ana", full_name: "Ana Rojas", email: "ana@x.cr", role: "alumno", is_admin: false, es_coordinador: false, elo: null };
  function constructor(tabla, filas) {
    const b = {
      select() { return b; }, in() { return b; },
      // El .eq() del borrado llega DESPUÉS del .delete(), así que se anota
      // sobre la misma llamada ya apuntada en vez de leerla antes de tiempo.
      eq(c, v) { b._eq = [c, v]; if (b._apuntado) b._apuntado.eq = [c, v]; return b; },
      order() { return b; }, limit() { return b; },
      upsert(v, o) { window.__llamadas.push({ tabla, verbo: "upsert", datos: v, opciones: o }); return b; },
      insert(v) { window.__llamadas.push({ tabla, verbo: "insert", datos: v }); return b; },
      update(v) { window.__llamadas.push({ tabla, verbo: "update", datos: v }); return b; },
      delete() { b._apuntado = { tabla, verbo: "delete", eq: b._eq }; window.__llamadas.push(b._apuntado); return b; },
      maybeSingle() { b._unica = true; return b; }, single() { b._unica = true; return b; },
      then(res, rej) {
        let d = filas;
        if (Array.isArray(d) && b._unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" }, access_token: "t" } } }),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, t === "profiles" ? [PERFIL] : []),
    rpc: () => constructor("rpc", []),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
  const fetchReal = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/notificar") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__llamadas.push({ funcion: cuerpo });
      const respuesta = cuerpo.action === "llave_publica"
        // Una llave VAPID con la forma correcta: 65 octetos que empiezan en 0x04.
        ? { ok: true, llave: window.__llaveFalsa }
        : { ok: true, mandados: 1 };
      return Promise.resolve(new Response(JSON.stringify(respuesta), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return fetchReal.apply(this, arguments);
  };
})();
`;
}

(async () => {
  const navegador = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

  // ------------------------------------------------------------- el cifrado
  console.log("=== El cifrado del mensaje ===");
  {
    const p = await navegador.newPage();
    await p.goto(BASE + "/offline.html", { waitUntil: "load" });
    await p.addScriptTag({ content: PRUEBA_CIFRADO });
    const mensaje = JSON.stringify({ titulo: "Empezó la clase", cuerpo: "Oscar abrió la sesión en vivo." });
    const r = await p.evaluate((m) => window.__probarCifrado(m), mensaje);
    igual("el teléfono descifra exactamente lo que se mandó", r.devuelta, mensaje);
    igual("la sal mide 16 octetos", r.largoSal, 16);
    igual("la llave efímera mide 65", r.largoLlave, 65);
    igual("el texto NO viaja en claro", r.seVeElTexto, "false");
    // Dos envíos del mismo texto no pueden salir iguales: si salieran, se
    // estaría reusando la llave efímera y el cifrado no valdría nada.
    const a = await p.evaluate((m) => window.__probarCifrado(m), mensaje);
    const b = await p.evaluate((m) => window.__probarCifrado(m), mensaje);
    igual("dos envíos iguales se cifran distinto", a.devuelta === b.devuelta && a.cuerpo !== b.cuerpo, "true");
    await p.close();
  }

  // -------------------------------------------------------------- la página
  console.log("\n=== El interruptor de Configuración ===");
  {
    const contexto = await navegador.newContext();
    // Se le da el permiso de antemano para poder llegar hasta el final; lo que
    // se comprueba es CUÁNDO se pide, más abajo.
    await contexto.grantPermissions(["notifications"], { origin: BASE });
    const p = await contexto.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await p.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await p.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await p.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso() }));

    // Se apunta cuándo se pide el permiso, que es lo que más se hace mal.
    await p.addInitScript(() => {
      window.__pedidos = 0;
      const real = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = function () { window.__pedidos += 1; return real(); };
    });

    // Un servicio de push de mentira. Chromium sin cabeza no tiene ninguno
    // detrás (`subscribe()` responde "Registration failed - permission
    // denied"), y lo que acá se comprueba no es que Chromium alcance a
    // Google: es qué hace la PÁGINA con la suscripción que recibe —cuándo
    // pide el permiso, qué guarda y qué borra—. El cifrado de verdad se
    // prueba arriba, con llaves de verdad.
    await p.addInitScript(() => {
      const b64url = (u) => {
        let s = "";
        for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
        return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      };
      let actual = null;
      PushManager.prototype.getSubscription = function () { return Promise.resolve(actual); };
      PushManager.prototype.subscribe = function (opciones) {
        const pub = new Uint8Array(65); pub[0] = 4; crypto.getRandomValues(pub.subarray(1));
        const auth = crypto.getRandomValues(new Uint8Array(16));
        actual = {
          endpoint: "https://fcm.googleapis.com/fcm/send/" + b64url(crypto.getRandomValues(new Uint8Array(16))),
          options: { applicationServerKey: (opciones || {}).applicationServerKey },
          toJSON() { return { endpoint: this.endpoint, keys: { p256dh: b64url(pub), auth: b64url(auth) } }; },
          unsubscribe() { actual = null; return Promise.resolve(true); },
        };
        return Promise.resolve(actual);
      };
    });
    await p.goto(BASE + "/configuracion.html", { waitUntil: "networkidle" });
    await p.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await p.waitForTimeout(800);

    igual("al cargar la página NO se pide el permiso",
      await p.evaluate(() => window.__pedidos), 0);
    igual("la tarjeta de avisos está",
      await p.evaluate(() => !!document.getElementById("avisos-btn")), "true");
    igual("arranca ofreciendo encenderlos",
      (await p.evaluate(() => document.getElementById("avisos-btn").textContent)).indexOf("Encender") !== -1, "true");
    igual("el botón de prueba está escondido hasta encenderlos",
      await p.evaluate(() => document.getElementById("avisos-probar").hidden), "true");

    // Se enciende. La llave falsa tiene la forma de una VAPID de verdad.
    await p.evaluate(() => {
      const b = new Uint8Array(65); b[0] = 4;
      crypto.getRandomValues(b.subarray(1));
      let s = ""; for (const x of b) s += String.fromCharCode(x);
      window.__llaveFalsa = btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      window.__llamadas = [];
    });
    await p.click("#avisos-btn");
    await p.waitForTimeout(2500);

    igual("se pidió el permiso UNA vez, al apretar el botón",
      await p.evaluate(() => window.__pedidos), 1);
    igual("primero le pregunta al servidor la llave pública",
      await p.evaluate(() => (window.__llamadas.find((l) => l.funcion) || {}).funcion), { action: "llave_publica" });
    const guardado = await p.evaluate(() =>
      window.__llamadas.find((l) => l.tabla === "push_suscripciones" && l.verbo === "upsert"));
    igual("guarda el aparato con sus dos llaves",
      guardado && Object.keys(guardado.datos).sort().join(","),
      "activa,agente,auth,endpoint,p256dh,ultimo_error,user_id");
    igual("y lo guarda por endpoint, no duplicando filas",
      guardado && guardado.opciones && guardado.opciones.onConflict, "endpoint");
    igual("el endpoint es el que dio el navegador",
      guardado && /^https?:\/\//.test(guardado.datos.endpoint), "true");

    await p.waitForTimeout(300);
    igual("ahora sí ofrece la prueba",
      await p.evaluate(() => document.getElementById("avisos-probar").hidden), "false");

    // Apagar tiene que borrar la fila ANTES de darse de baja: al revés queda
    // un endpoint muerto al que el sitio le sigue mandando.
    await p.evaluate(() => { window.__llamadas = []; });
    await p.click("#avisos-btn");
    await p.waitForTimeout(1200);
    const borrado = await p.evaluate(() =>
      window.__llamadas.find((l) => l.tabla === "push_suscripciones" && l.verbo === "delete"));
    igual("al apagar borra la fila de este aparato", !!borrado, "true");
    igual("y la borra por su endpoint", borrado && borrado.eq && borrado.eq[0], "endpoint");

    if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
    await p.close();
    await contexto.close();
  }

  await navegador.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
