// A nombre de quién sale un correo a la familia de un alumno, y a dónde contesta.
//
// Sale siempre desde el dominio verificado (el de DE). Lo que cambia es el
// NOMBRE que ve la familia —el de la academia del alumno— y el reply_to: la
// respuesta le llega al supervisor de esa academia, no a una bandeja común.
//
// - Un alumno en una sola academia: sale con su nombre.
// - En dos o más: sale como siempre, y la respuesta va a los supervisores de
//   todas (el informe es uno solo, con la suma de lo que entrenó).
// - Sin academia o sin supervisor: sale como siempre y la respuesta cae en
//   informes@, que Cloudflare reenvía. Nunca se pierde.
//
// Si la consulta falla, el correo sale igual con el remitente de siempre: un
// nombre de más no justifica dejar a una familia sin su informe.

type ConRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type Remitente = { from: string; replyTo: string[] };

export async function remitenteDe(
  admin: ConRpc,
  alumnoId: string | null | undefined,
  deBase: string,
): Promise<Remitente> {
  const base: Remitente = { from: deBase, replyTo: [] };
  if (!alumnoId) return base;
  try {
    const { data, error } = await admin.rpc("correos_de_supervision", { p_alumno: alumnoId });
    if (error || !Array.isArray(data) || !data.length) return base;
    const filas = data as { academia?: string; correo?: string }[];
    const replyTo = [...new Set(filas.map((f) => String(f.correo ?? "").trim().toLowerCase()).filter(Boolean))];
    const academias = [...new Set(filas.map((f) => String(f.academia ?? "").trim()).filter(Boolean))];
    const direccion = (deBase.match(/<([^>]+)>/)?.[1] ?? deBase).trim();
    // Comillas, ángulos o saltos de línea en el nombre romperían la cabecera.
    const nombre = academias.length === 1 ? academias[0].replace(/["<>\r\n]/g, "").slice(0, 80).trim() : "";
    return { from: nombre ? `${nombre} <${direccion}>` : deBase, replyTo };
  } catch {
    return base;
  }
}
