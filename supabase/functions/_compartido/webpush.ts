// Web Push a mano: firma VAPID y cifrado del mensaje, con Web Crypto y nada
// más. Sin librería a propósito — son cien líneas, no cambian nunca (están
// congeladas en dos RFC) y una dependencia de npm dentro de una Edge Function
// es una cosa más que se puede caer un martes sin que nadie la haya tocado.
//
//   RFC 8292  VAPID: el JWT ES256 que dice quién manda
//   RFC 8291  el cifrado aes128gcm del contenido
//   RFC 8188  el formato del cuerpo cifrado
//
// Lo que hay que entender para tocarlo: el navegador del alumno le da al sitio
// tres cosas —endpoint, p256dh y auth—. El endpoint es a dónde se manda; las
// otras dos son con qué se cifra, y sin ellas el servidor de push (Google,
// Mozilla) reenvía un bulto que no puede leer. Ni el servidor de push ni
// nosotros vemos el texto después: se cifra para ESE aparato.

const b64urlAOctetos = (s: string): Uint8Array => {
  const base = s.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = base + "=".repeat((4 - (base.length % 4)) % 4);
  const bin = atob(relleno);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const octetosAB64url = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const juntar = (...partes: Uint8Array[]): Uint8Array => {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};

const texto = (s: string) => new TextEncoder().encode(s);

// ---------------------------------------------------------------- las llaves
export type LlavesVapid = { publica: string; privada: string };

/* Genera el par VAPID. La privada se guarda como JWK para poder volver a
   importarla; la pública es el punto sin comprimir de 65 octetos, que es lo
   que el navegador espera en applicationServerKey. */
export async function generarLlaves(): Promise<LlavesVapid> {
  const par = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publica = await crypto.subtle.exportKey("raw", par.publicKey);
  const privada = await crypto.subtle.exportKey("jwk", par.privateKey);
  return { publica: octetosAB64url(publica), privada: JSON.stringify(privada) };
}

async function llaveDeFirma(privadaJwk: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk", JSON.parse(privadaJwk),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/* El JWT de VAPID: dice a qué servidor de push va, hasta cuándo vale y a quién
   reclamarle si algo sale mal. Va firmado con la llave privada, y el servidor
   de push lo comprueba contra la pública que el navegador ya conocía. */
async function jwtVapid(endpoint: string, llaves: LlavesVapid, contacto: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const cabecera = octetosAB64url(texto(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cuerpo = octetosAB64url(texto(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,   // 12 h: el máximo es 24
    sub: contacto,
  })));
  const sinFirmar = `${cabecera}.${cuerpo}`;
  const firma = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, await llaveDeFirma(llaves.privada), texto(sinFirmar));
  // Web Crypto ya devuelve r||s en crudo, que es justo lo que pide ES256.
  return `${sinFirmar}.${octetosAB64url(firma)}`;
}

// ------------------------------------------------------------- el cifrado
async function hkdf(ikm: Uint8Array, sal: Uint8Array, info: Uint8Array, octetos: number) {
  const llave = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: sal, info }, llave, octetos * 8);
  return new Uint8Array(bits);
}

/* Cifra el mensaje para UN aparato. Devuelve el cuerpo tal cual va en el POST:
   sal(16) + tamaño de registro(4) + largo de la llave(1) + llave efímera(65) +
   el texto cifrado. */
async function cifrar(mensaje: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const claro = juntar(texto(mensaje), new Uint8Array([0x02]));   // 0x02 = último registro
  const llaveAparato = b64urlAOctetos(p256dh);
  const secretoAparato = b64urlAOctetos(auth);

  // Un par efímero por mensaje: es lo que hace que dos envíos iguales no se
  // cifren igual.
  const efimero = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const efimeroPub = new Uint8Array(await crypto.subtle.exportKey("raw", efimero.publicKey));

  const pubAparato = await crypto.subtle.importKey(
    "raw", llaveAparato, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: pubAparato }, efimero.privateKey, 256));

  const infoLlave = juntar(texto("WebPush: info\0"), llaveAparato, efimeroPub);
  const ikm = await hkdf(compartido, secretoAparato, infoLlave, 32);

  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, sal, texto("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, sal, texto("Content-Encoding: nonce\0"), 12);

  const llaveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 }, llaveAes, claro));

  const tamanoRegistro = new Uint8Array(4);
  new DataView(tamanoRegistro.buffer).setUint32(0, 4096);
  return juntar(sal, tamanoRegistro, new Uint8Array([efimeroPub.length]), efimeroPub, cifrado);
}

// ------------------------------------------------------------------ mandar
export type Suscripcion = { endpoint: string; p256dh: string; auth: string };
export type Resultado = { ok: boolean; estado?: number; caduca?: boolean; error?: string };

/* Manda UN aviso a UN aparato.
   `caduca` en true significa que esa suscripción ya no existe (el aparato se
   desinstaló, el usuario limpió los datos): hay que apagarla, no reintentar. */
export async function mandar(
  sus: Suscripcion, mensaje: unknown, llaves: LlavesVapid, contacto: string,
): Promise<Resultado> {
  try {
    const cuerpo = await cifrar(JSON.stringify(mensaje), sus.p256dh, sus.auth);
    const jwt = await jwtVapid(sus.endpoint, llaves, contacto);
    const res = await fetch(sus.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt}, k=${llaves.publica}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": "86400",
        "Urgency": "normal",
      },
      body: cuerpo,
    });
    if (res.ok) return { ok: true, estado: res.status };
    // 404 y 410 son "esta suscripción ya no existe", no un fallo pasajero.
    const caduca = res.status === 404 || res.status === 410;
    return { ok: false, estado: res.status, caduca, error: (await res.text()).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
