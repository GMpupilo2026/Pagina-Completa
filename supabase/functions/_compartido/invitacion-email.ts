// El correo de bienvenida que recibe un alumno nuevo — y la invitación misma.
//
// POR QUÉ ESTO ESTÁ EN UN SOLO ARCHIVO
// Hay DOS puertas para dar de alta a un alumno: el formulario de inscripción
// (`inscribir-alumno`) y la invitación directa del profesor desde la clase en
// vivo (`create-student`). Las dos mandan el mismo correo. Escrito dos veces,
// se iría separando a la primera corrección y la mitad de las familias
// recibiría la versión vieja sin que nadie se entere. Lo despliega en las dos
// funciones `node herramientas/funciones-armar.js`.
//
// QUÉ CAMBIÓ Y POR QUÉ
// Antes salían DOS correos: el de invitación que arma Supabase (con el enlace,
// en inglés y sin explicar nada) y otro nuestro con el PDF de instrucciones.
// El alumno entraba ya autenticado y su contraseña quedaba sin poner — para
// volver al día siguiente tenía que adivinar cómo. Ahora sale UNO solo: el
// enlace lo generamos nosotros (`generateLink`, que crea la cuenta pero NO
// manda correo) y lo mandamos dentro de un correo que pide crear la contraseña
// y explica, paso por paso, cómo se entra de aquí en adelante.
//
// EL CAMINO DE RESPALDO NO ES UN ADORNO
// Si no hay RESEND_API_KEY no se usa `generateLink`: se invita como siempre con
// `inviteUserByEmail`, y el correo lo manda Supabase. Así, un proyecto sin
// Resend configurado sigue dando de alta alumnos en vez de crear cuentas a las
// que no les llega nada. Y si el envío falla DESPUÉS de haber creado la cuenta,
// se dice — `correo_enviado: false` sube hasta la pantalla de quien invitó, en
// vez de dejar una cuenta muda de la que nadie se entera hasta que alguien
// pregunta por qué ese alumno nunca entró.

const SITE_URL = "https://ajedrez-integral.com";
const PDF_URL = `${SITE_URL}/instrucciones-adaptadas.pdf`;
const DESTINO = `${SITE_URL}/bienvenida.html`;
const WHATSAPP = "https://wa.me/50683092291";

export type ResultadoInvitacion = {
  user: { id: string; email?: string } | null;
  error: string | null;
  correoEnviado: boolean;
  via: "propio" | "supabase";
};

/** Invita a alguien y le manda el correo de bienvenida. Devuelve además si el
 *  correo salió de verdad, que es lo que la pantalla tiene que poder decir. */
export async function invitarConBienvenida(
  adminClient: {
    auth: {
      admin: {
        inviteUserByEmail: (email: string, opts: unknown) => Promise<{ data: { user: unknown } | null; error: { message: string } | null }>;
        generateLink: (opts: unknown) => Promise<{ data: { user: unknown; properties?: { action_link?: string } } | null; error: { message: string } | null }>;
      };
    };
  },
  email: string,
  fullName?: string | null,
): Promise<ResultadoInvitacion> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const opciones = {
    redirectTo: DESTINO,
    data: fullName ? { full_name: fullName } : undefined,
  };

  // Sin Resend no hay forma de mandar el correo nuestro: se invita como siempre
  // y lo manda Supabase. Peor sería crear la cuenta y que no salga nada.
  if (!apiKey) {
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, opciones);
    return {
      user: (data?.user as ResultadoInvitacion["user"]) ?? null,
      error: error?.message ?? null,
      correoEnviado: !error,
      via: "supabase",
    };
  }

  // Crea la cuenta y devuelve el enlace SIN mandar ningún correo: el correo lo
  // armamos nosotros abajo, con la explicación adentro.
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: opciones,
  });

  if (error || !data?.user) {
    return { user: null, error: error?.message ?? "No se pudo invitar al alumno", correoEnviado: false, via: "propio" };
  }

  const enlace = data.properties?.action_link;
  if (!enlace) {
    return {
      user: data.user as ResultadoInvitacion["user"],
      error: null,
      correoEnviado: false,
      via: "propio",
    };
  }

  const correoEnviado = await enviarBienvenida(email, enlace, fullName ?? undefined);
  return { user: data.user as ResultadoInvitacion["user"], error: null, correoEnviado, via: "propio" };
}

/** Manda el correo. Devuelve si salió; nunca lanza — la cuenta ya está creada
 *  cuando se llega aquí y tumbar el alta por un correo sería peor. */
export async function enviarBienvenida(
  email: string,
  enlace: string,
  fullName?: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;

  try {
    const from = Deno.env.get("RESEND_FROM") || "Ajedrez Integral <informes@ajedrez-integral.com>";
    const adjuntos = await adjuntoInstrucciones();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Tu cuenta de Ajedrez Integral: crea tu contraseña",
        html: cuerpoBienvenida(email, enlace, fullName),
        ...(adjuntos.length ? { attachments: adjuntos } : {}),
      }),
    });

    if (!res.ok) {
      console.error("Resend rechazó el correo de bienvenida:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error enviando el correo de bienvenida:", err);
    return false;
  }
}

async function adjuntoInstrucciones() {
  // El PDF se sirve como archivo estático del sitio y se descarga en cada
  // envío en vez de guardarlo embebido: así basta con reemplazar ese archivo
  // para actualizarlo, sin volver a desplegar la función.
  try {
    const pdfRes = await fetch(PDF_URL);
    if (!pdfRes.ok) {
      console.error("No se pudo descargar instrucciones-adaptadas.pdf:", pdfRes.status);
      return [];
    }
    const bytes = new Uint8Array(await pdfRes.arrayBuffer());
    let binario = "";
    for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
    return [{ filename: "instrucciones-adaptadas.pdf", content: btoa(binario) }];
  } catch (err) {
    console.error("Error adjuntando instrucciones adaptadas:", err);
    return [];
  }
}

/* Los estilos van A MANO en cada etiqueta, no en una hoja aparte: Gmail
   descarta el <style> del <head>, así que un CSS bonito se vería perfecto en el
   navegador y roto en el correo, que es donde de verdad se lee. Misma decisión
   que informe-html.ts. */
function paso(numero: number, texto: string) {
  return (
    `<tr>` +
    `<td style="width:28px;vertical-align:top;padding:0 10px 12px 0;">` +
    `<span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;` +
    `background:#f0b429;color:#102a43;border-radius:12px;font-weight:bold;font-size:13px;">${numero}</span>` +
    `</td>` +
    `<td style="vertical-align:top;padding:0 0 12px 0;color:#334e68;font-size:15px;line-height:1.5;">${texto}</td>` +
    `</tr>`
  );
}

export function cuerpoBienvenida(email: string, enlace: string, fullName?: string): string {
  const nombre = fullName ? fullName.trim().split(/\s+/)[0] : "";
  const saludo = nombre ? `¡Hola ${escapar(nombre)}!` : "¡Hola!";
  const correo = escapar(email);

  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#334e68;">` +

    `<h1 style="font-size:22px;color:#102a43;margin:0 0 6px;">${saludo}</h1>` +
    `<p style="font-size:16px;line-height:1.6;margin:0 0 18px;">` +
    `Ya tienes tu cuenta en la <strong>Academia de Ajedrez Integral</strong>. ` +
    `Solo falta un paso: <strong>crear tu contraseña</strong>.</p>` +

    `<p style="margin:0 0 8px;">` +
    `<a href="${enlace}" style="display:inline-block;background:#f0b429;color:#102a43;` +
    `font-weight:bold;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:10px;">` +
    `Crear mi contraseña y entrar</a></p>` +
    `<p style="font-size:13px;color:#627d98;margin:0 0 22px;">` +
    `Ese botón te lleva a una página donde eliges tu contraseña. El enlace se usa una sola vez y dura poco, ` +
    `así que conviene abrirlo hoy mismo. Si se te vence, en esa misma página puedes pedir otro.</p>` +

    `<h2 style="font-size:17px;color:#102a43;margin:0 0 12px;">Así entras de aquí en adelante</h2>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 6px;">` +
    paso(1, `Entra a <a href="${SITE_URL}" style="color:#b44d12;">ajedrez-integral.com</a> desde el celular o la computadora.`) +
    paso(2, `Toca <strong>«Academia»</strong> en el menú de arriba.`) +
    paso(3, `Escribe tu correo —<strong>${correo}</strong>— y la contraseña que acabas de crear.`) +
    paso(4, `Ahí está tu panel: las clases en vivo, los cursos, el entrenamiento y tus tareas.`) +
    `</table>` +

    `<p style="font-size:14px;line-height:1.6;background:#f0f4f8;border-radius:10px;padding:14px 16px;margin:14px 0 18px;">` +
    `<strong style="color:#102a43;">¿Se te olvida la contraseña?</strong> ` +
    `En la pantalla de inicio de sesión toca «¿Olvidaste tu contraseña?» y te llega un correo para poner una nueva. ` +
    `Nadie más la conoce, ni tu profesor.</p>` +

    `<p style="font-size:14px;line-height:1.6;margin:0 0 18px;">` +
    `Te adjuntamos también el PDF <strong>Instrucciones adaptadas</strong>: una guía accesible con los pasos ` +
    `para usar todo el sitio con lector de pantalla. También puedes descargarlo ` +
    `<a href="${PDF_URL}" style="color:#b44d12;">aquí</a>.</p>` +

    `<p style="font-size:14px;line-height:1.6;margin:0 0 6px;">` +
    `Cualquier duda, escríbenos por WhatsApp al ` +
    `<a href="${WHATSAPP}" style="color:#b44d12;">+506 8309-2291</a>. ¡Nos vemos en el tablero!</p>` +

    `<p style="font-size:12px;color:#829ab1;margin:22px 0 0;border-top:1px solid #d9e2ec;padding-top:12px;">` +
    `Academia de Ajedrez Integral · Oscar Angulo Cubero</p>` +

    `</div>`
  );
}

function escapar(texto: string) {
  return texto
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
