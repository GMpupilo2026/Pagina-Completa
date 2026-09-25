// A qué profesor queda asignado un alumno nuevo. Lo usan las dos puertas de
// alta: inscribir-alumno (una respuesta de formulario) y create-student
// («＋ Alumno nuevo» y la invitación desde la clase).
//
// SIN ELEGIR: queda de quien lo da de alta, si da clase (role = 'profesor').
// Quien administra sin ser profesor no da clase, y el alumno queda sin
// profesor: la pantalla lo dice y Administración ya avisa de esos alumnos.
//
// ELIGIENDO: solo quien administra o supervisa, y solo un profesor de su
// alcance. El alcance lo contesta bajo_mi_coordinacion() llamada con el JWT de
// quien pide —la misma regla que el resto de coordinación—, no una lista
// armada acá: quien administra alcanza a todos, quien supervisa a los suyos.
// Un id elegido desde la consola que no cumpla se rechaza ANTES de gastar el
// cupo y de invitar a nadie.

// Los dos clientes de supabase-js (el de quien llama y el de la service role).
// deno-lint-ignore no-explicit-any
type Cliente = any;

export type Quien = { role?: string | null; is_admin?: boolean | null; es_supervisor?: boolean | null } | null;

export async function profesorElegido(
  callerClient: Cliente,
  adminClient: Cliente,
  quien: Quien,
  quienInvita: string,
  pedido: string | null,
): Promise<{ id: string | null; error?: string }> {
  const porDefecto = quien?.role === "profesor" ? quienInvita : null;
  if (!pedido || pedido === quienInvita) {
    return { id: porDefecto };
  }
  if (!(quien?.is_admin || quien?.es_supervisor)) {
    return { id: null, error: "Solo quien administra o supervisa puede elegir el profesor del alumno" };
  }
  const { data: alcanza } = await callerClient.rpc("bajo_mi_coordinacion", { p_persona: pedido });
  const { data: prof } = await adminClient
    .from("profiles").select("role").eq("id", pedido).maybeSingle();
  if (alcanza !== true || prof?.role !== "profesor") {
    return { id: null, error: "Ese profesor no está bajo tu supervisión" };
  }
  return { id: pedido };
}
