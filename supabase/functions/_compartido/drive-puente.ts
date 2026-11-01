// El puente con el Drive del Centroamericano: un Apps Script que corre como la dueña del Drive
// (documentos/centroamericano/puente-drive.gs). Lo llaman centroamericano-mesa (la foto de
// cada planilla, al subirla) y centroamericano-clave (probar la conexión y reintentar lo que
// no llegó). La dirección y el secreto viven en la bóveda (centroamericano_drive_leer()); acá
// nunca se imprimen ni se devuelven. Se copia a cada función al armarla.

export type RespuestaPuente = { ok: boolean; error?: string; [k: string]: unknown };

export async function llamarPuente(url: string, secreto: string, cuerpo: Record<string, unknown>, ms = 40000): Promise<RespuestaPuente> {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url)) return { ok: false, error: "La dirección del Drive no es válida." };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...cuerpo, secreto }),
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
    });
    const texto = await res.text();
    try {
      const d = JSON.parse(texto);
      return d && typeof d === "object" ? d : { ok: false, error: "El Drive contestó algo raro." };
    } catch {
      return { ok: false, error: "El Drive no contestó lo esperado (¿la implementación está para «Cualquier persona»?)." };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "El Drive tardó demasiado." : "No se pudo hablar con el Drive." };
  }
}

export function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function deBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
