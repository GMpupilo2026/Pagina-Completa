// El número al que las familias escriben, leído de la base y no escrito acá.
//
// Estaba puesto a mano en el informe de la casa, en el informe de un examen y
// en el aviso de cobro —tres archivos—, así que cambiarlo era tres ediciones y
// un despliegue, y quien coordina la Academia, que es quien atiende esas
// consultas, no tenía forma de tocarlo. Ahora vive en una sola fila
// (`ajustes_academia`, clave `whatsapp_consultas`) y se cambia desde la página
// de Cobros.
//
// SI NO HAY NÚMERO, NO SE INVENTA NINGUNO. Quien llama recibe `null` y se
// salta el párrafo entero: un correo sin número al que escribir es peor que
// uno con el número de siempre, pero MUCHO mejor que uno con un número que ya
// no atiende nadie. Por eso tampoco hay un valor de respaldo escrito acá: la
// fila se sembró con el número que había, y el único lugar donde vive es ese.

export const CLAVE_WHATSAPP = "whatsapp_consultas";

export type Contacto = { texto: string; enlace: string };

/**
 * El enlace de WhatsApp para un número escrito como lo escribe una persona
 * ("+506 8309-2291", "8309 2291").
 *
 * wa.me quiere solo dígitos y CON código de país: sin él, el enlace abre un
 * chat con un número que no existe y eso no da ningún error — se ve un enlace
 * perfecto que no lleva a ninguna parte. Un número de ocho dígitos es de Costa
 * Rica, que es donde está la Academia, así que se le pone el 506 delante.
 */
export function enlaceWhatsapp(numero: string): string {
  const digitos = String(numero ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return "https://wa.me/" + (digitos.length === 8 ? "506" + digitos : digitos);
}

/** El contacto de consultas, o null si no hay ninguno puesto. */
export async function contactoDeConsultas(
  admin: { from: (t: string) => any },
): Promise<Contacto | null> {
  try {
    const { data } = await admin.from("ajustes_academia")
      .select("valor").eq("clave", CLAVE_WHATSAPP).maybeSingle();
    const texto = String(data?.valor ?? "").trim();
    if (!texto) return null;
    const enlace = enlaceWhatsapp(texto);
    return enlace ? { texto, enlace } : null;
  } catch {
    // Que no se pueda leer un ajuste no puede costar el correo entero: sale
    // sin el párrafo de consultas, que es lo mismo que pasa si está vacío.
    return null;
  }
}
