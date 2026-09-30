// El correo que le llega a quien administra cuando la base se está quedando
// sin aire. Lo manda alerta-base (ver su cabecera), disparada por
// public.vigilar_base() cada cinco minutos. Lo prueba
// herramientas/verificar-alerta-base.js.
//
// Todo lo que trae son números que midió la base, pero igual se escapan: el
// cuerpo del pedido lo arma la base, y un correo no confía en lo que le llega.

export type Pulso = {
  pulso_ms: number;       // lo que tardó una consulta que suele tardar 0-3 ms
  lentas: number;         // consultas de la web llevando más de 3 s
  cron_fallidos: number;  // tareas programadas que no llegaron a arrancar (10 min)
  medido_at: string;      // ISO
};

const PANEL = "https://supabase.com/dashboard/project/bgtijpimpcokxatxxbki";

function escapar(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const entero = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/** La hora en Costa Rica, que es la que tiene en la cabeza quien lo lee. */
export function horaCR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CR", {
    timeZone: "America/Costa_Rica", hour: "numeric", minute: "2-digit", day: "numeric", month: "long",
  });
}

/** Qué vio la base, en palabras. Una línea por señal encendida. */
export function senales(p: Pulso): string[] {
  const out: string[] = [];
  const ms = entero(p.pulso_ms), lentas = entero(p.lentas), cron = entero(p.cron_fallidos);
  if (ms >= 250) out.push(`Una consulta de prueba que suele tardar menos de 5 ms tardó ${ms} ms.`);
  if (lentas >= 3) out.push(`Había ${lentas} consultas de la plataforma llevando más de 3 segundos.`);
  if (cron >= 1) out.push(`${cron === 1 ? "Una tarea programada no llegó" : `${cron} tareas programadas no llegaron`} a arrancar en los últimos 10 minutos.`);
  return out;
}

/** `cabeceraHtml` llega armada (cabeceraCorreo): este archivo no importa el
    compartido, así lo corren las pruebas con Node. */
export function cuerpoAlerta(p: Pulso, cabeceraHtml: string): string {
  const lista = senales(p).map((s) => `<li style="margin:0 0 6px">${escapar(s)}</li>`).join("");
  const cuando = horaCR(p.medido_at);
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
${cabeceraHtml}
<tr><td style="padding:24px;color:#102a43;font-size:15px;line-height:1.5">
  <p style="margin:0 0 12px">La base de datos de la plataforma está al límite${cuando ? ` (medido el ${escapar(cuando)}, hora de Costa Rica)` : ""}. Si hay clases en este momento, es probable que a algunos alumnos el panel o la clase no les cargue.</p>
  <p style="margin:0 0 6px;font-weight:700">Lo que se midió</p>
  <ul style="margin:0 0 16px;padding-left:20px">${lista}</ul>
  <p style="margin:0 0 6px;font-weight:700">Qué hacer</p>
  <ul style="margin:0 0 16px;padding-left:20px">
    <li style="margin:0 0 6px">Ahora: no hay nada que reiniciar. La base se recupera sola cuando baja la carga; mientras tanto, las páginas cargan con lo que alcanzan a traer.</li>
    <li style="margin:0 0 6px">Si pasa seguido, a la base le quedó chico su tamaño: se sube en Supabase (Settings → Compute and Disk). Desde el 30/9 está en Small.</li>
  </ul>
  <p style="margin:0 0 20px"><a href="${PANEL}" style="display:inline-block;background:#102a43;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px">Abrir el proyecto en Supabase</a></p>
  <p style="margin:0;color:#486581;font-size:13px">Este aviso lo manda la propia base cada vez que lo detecta, como mucho uno cada dos horas.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}
