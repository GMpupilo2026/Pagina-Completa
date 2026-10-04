// ¿El correo salió de verdad, o Resend lo descartó?
//
// POR QUÉ HACE FALTA PREGUNTARLO
// Resend acepta el envío (contesta 200 con un id) aunque la dirección esté en
// su lista de bloqueo: lo descarta después y lo marca «suppressed». A una
// dirección entra a esa lista la primera vez que rebota, y desde ahí NINGÚN
// correo le llega: ni la bienvenida, ni el enlace para la contraseña, ni los
// informes. La pantalla decía «enviado» y nadie se enteraba. El 3 de octubre
// una cuenta de prueba pidió dos enlaces seguidos, y los dos se descartaron
// así, porque la bienvenida había rebotado una semana antes.
//
// Así que después de mandarlo se pregunta en qué terminó (`GET /emails/{id}`,
// su `last_event`), unas pocas veces y con poco tiempo entre una y otra: el
// descarte se marca casi enseguida. Si a los pocos segundos sigue «en camino»,
// se da por bueno: un rebote que llegue más tarde ya no se puede esperar.

/** Los finales en que el correo no le llegó a nadie. */
export const NO_LLEGO = ["suppressed", "bounced", "failed"];

type Opciones = {
  esperas?: number[];
  fetchFn?: typeof fetch;
  dormir?: (ms: number) => Promise<unknown>;
};

/**
 * En qué terminó el envío `id`, solo si terminó mal: devuelve el evento
 * («suppressed», «bounced», «failed») o null si salió o si no se pudo saber.
 * Nunca lanza: si la consulta falla, no se inventa un problema.
 */
export async function envioFallido(
  apiKey: string,
  id: string | null | undefined,
  { esperas = [800, 1500, 2500], fetchFn = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }: Opciones = {},
): Promise<string | null> {
  if (!apiKey || !id) return null;
  for (const ms of esperas) {
    await dormir(ms);
    try {
      const res = await fetchFn(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return null;
      const evento = String((await res.json())?.last_event ?? "");
      if (NO_LLEGO.includes(evento)) return evento;
      if (evento === "delivered") return null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Lo que se le dice a quien mandó el correo cuando no llegó. */
export function motivoNoLlego(evento: string, destino: string): string {
  if (evento === "suppressed") {
    return `El correo a ${destino} no salió: esa dirección rebotó antes y el servicio de correo la tiene ` +
      `bloqueada. Revisa que esté bien escrita; si está bien, hay que pedir que la desbloqueen en Resend.`;
  }
  if (evento === "bounced") {
    return `El correo a ${destino} rebotó: ese buzón no lo aceptó. Revisa que la dirección esté bien escrita.`;
  }
  return `El correo a ${destino} no se pudo entregar.`;
}
