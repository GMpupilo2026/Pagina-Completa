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
// EL ALUMNO SIN CORREO PROPIO: EL CORREO VA A LA CASA
// Un niño de siete años no tiene correo, y su familia tiene UNO para los dos
// hermanos. Esos alumnos entran con un usuario del dominio de la academia
// (ver `usuario-alumno.ts`), que no recibe nada — así que su correo de
// bienvenida se le manda a la persona encargada, con el usuario y la
// explicación escritos para quien va a acompañar al niño a entrar, no para el
// niño. Es el MISMO enlace de siempre: quien lo abre crea la contraseña. Lo
// único que cambia es a qué bandeja llega y cómo está redactado.
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
  /** A qué bandeja salió de verdad. Con un alumno sin buzón propio no es su
   *  correo sino el de la casa, y quien invitó tiene que poder decirlo en
   *  pantalla: "el correo le llegó a la mamá, no al niño". */
  destino: string | null;
};

/** Cómo se le escribe a esta persona. `destino` es a qué bandeja va el correo
 *  —el del alumno, o el de la casa cuando el alumno no tiene buzón— y
 *  `usuario` es lo que el alumno escribe para entrar. */
export type Envio = {
  destino: string;
  usuario: string;
  /** Cierto cuando `destino` NO es del alumno: el correo se redacta para la
   *  familia, que es quien lo va a leer. */
  aLaCasa: boolean;
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
  /** A dónde mandar el correo cuando NO es a `email`: un alumno sin buzón
   *  propio recibe su bienvenida en la bandeja de la casa. Sin esto, se manda
   *  a `email` como siempre. */
  aLaCasa?: { destino: string; nombre?: string | null } | null,
): Promise<ResultadoInvitacion> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const opciones = {
    redirectTo: DESTINO,
    data: fullName ? { full_name: fullName } : undefined,
  };
  const envio: Envio | null = aLaCasa?.destino
    ? { destino: aLaCasa.destino, usuario: email, aLaCasa: true }
    : { destino: email, usuario: email, aLaCasa: false };

  // Sin Resend no hay forma de mandar el correo nuestro: se invita como siempre
  // y lo manda Supabase. Peor sería crear la cuenta y que no salga nada.
  //
  // PERO A UN ALUMNO SIN BUZÓN ESE CAMINO NO LE SIRVE: el correo de Supabase
  // sale hacia la dirección de la cuenta, que acá no existe — se crearía la
  // cuenta y el enlace se perdería sin que nadie se entere. Así que la cuenta
  // se crea igual (nadie se queda sin alta) y se dice que el correo no salió,
  // que es lo que sube hasta la pantalla de quien invitó.
  if (!apiKey) {
    if (envio.aLaCasa) {
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: "invite", email, options: opciones,
      });
      return {
        user: (data?.user as ResultadoInvitacion["user"]) ?? null,
        error: error?.message ?? null,
        correoEnviado: false,
        via: "supabase",
        destino: null,
      };
    }
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, opciones);
    return {
      user: (data?.user as ResultadoInvitacion["user"]) ?? null,
      error: error?.message ?? null,
      correoEnviado: !error,
      via: "supabase",
      destino: error ? null : email,
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
    return {
      user: null, error: error?.message ?? "No se pudo invitar al alumno",
      correoEnviado: false, via: "propio", destino: null,
    };
  }

  const enlace = data.properties?.action_link;
  if (!enlace) {
    return {
      user: data.user as ResultadoInvitacion["user"],
      error: null,
      correoEnviado: false,
      via: "propio",
      destino: null,
    };
  }

  const correoEnviado = await enviarBienvenida(
    envio.destino, enlace, fullName ?? undefined, envio, aLaCasa?.nombre ?? null,
  );
  return {
    user: data.user as ResultadoInvitacion["user"], error: null,
    correoEnviado, via: "propio", destino: correoEnviado ? envio.destino : null,
  };
}

/** Manda el correo. Devuelve si salió; nunca lanza — la cuenta ya está creada
 *  cuando se llega aquí y tumbar el alta por un correo sería peor. */
export async function enviarBienvenida(
  email: string,
  enlace: string,
  fullName?: string,
  envio?: Envio | null,
  nombreEncargado?: string | null,
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
        subject: envio?.aLaCasa
          ? `La cuenta de ${(fullName || "tu hijo o hija").trim().split(/\s+/)[0]} en Ajedrez Integral`
          : "Tu cuenta de Ajedrez Integral: crea tu contraseña",
        html: envio?.aLaCasa
          ? cuerpoBienvenidaCasa(envio.usuario, enlace, fullName, nombreEncargado)
          : cuerpoBienvenida(email, enlace, fullName),
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

/* El mismo correo, pero para quien lo va a leer de verdad cuando el alumno no
   tiene buzón propio: la mamá, el papá o quien esté a cargo. Cambian tres
   cosas, y las tres importan:

   · habla de "la cuenta de Sofía", no de "tu cuenta" — quien abre el correo no
     es la alumna;
   · el USUARIO va grande y aparte, porque es el dato nuevo: no es un correo y
     nadie lo adivina. Si no se ve de una ojeada, el niño no puede entrar y la
     familia escribe preguntando cuál era;
   · dice con todas las letras que ese usuario NO recibe correo y que todo lo
     del sitio va a llegar a esta misma bandeja. Sin eso, lo natural es
     intentar escribirle ahí y que nadie conteste nunca. */
export function cuerpoBienvenidaCasa(
  usuario: string,
  enlace: string,
  fullName?: string,
  nombreEncargado?: string | null,
): string {
  const alumno = fullName ? fullName.trim().split(/\s+/)[0] : "";
  const quien = nombreEncargado ? nombreEncargado.trim().split(/\s+/)[0] : "";
  const saludo = quien ? `¡Hola ${escapar(quien)}!` : "¡Hola!";
  const deQuien = alumno ? `de ${escapar(alumno)}` : "de tu hijo o hija";
  const suyo = alumno ? escapar(alumno) : "tu hijo o hija";
  const u = escapar(usuario);

  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#334e68;">` +

    `<h1 style="font-size:22px;color:#102a43;margin:0 0 6px;">${saludo}</h1>` +
    `<p style="font-size:16px;line-height:1.6;margin:0 0 18px;">` +
    `Ya está lista la cuenta ${deQuien} en la <strong>Academia de Ajedrez Integral</strong>. ` +
    `Como ${suyo} todavía no tiene correo propio, le preparamos un <strong>usuario</strong> ` +
    `y te mandamos todo a ti.</p>` +

    `<table role="presentation" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;background:#f0f4f8;border-radius:10px;margin:0 0 18px;">` +
    `<tr><td style="padding:16px 18px;">` +
    `<p style="font-size:13px;color:#627d98;margin:0 0 4px;">El usuario ${deQuien} es:</p>` +
    `<p style="font-size:19px;color:#102a43;font-weight:bold;margin:0;word-break:break-all;">${u}</p>` +
    `</td></tr></table>` +

    `<p style="margin:0 0 8px;">` +
    `<a href="${enlace}" style="display:inline-block;background:#f0b429;color:#102a43;` +
    `font-weight:bold;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:10px;">` +
    `Crear la contraseña</a></p>` +
    `<p style="font-size:13px;color:#627d98;margin:0 0 22px;">` +
    `Ese botón abre una página donde eliges la contraseña ${deQuien}. El enlace se usa una sola vez ` +
    `y dura poco, así que conviene abrirlo hoy mismo. Si se vence, en esa misma página puedes pedir otro.</p>` +

    `<h2 style="font-size:17px;color:#102a43;margin:0 0 12px;">Así entra ${suyo}</h2>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 6px;">` +
    paso(1, `Entra a <a href="${SITE_URL}" style="color:#b44d12;">ajedrez-integral.com</a> desde el celular o la computadora.`) +
    paso(2, `Toca <strong>«Academia»</strong> en el menú de arriba.`) +
    paso(3, `Escribe el usuario —<strong>${u}</strong>— y la contraseña que acabas de crear.`) +
    paso(4, `Ahí está su panel: las clases en vivo, los cursos, el entrenamiento y sus tareas.`) +
    `</table>` +

    `<p style="font-size:14px;line-height:1.6;background:#fffaf0;border-left:4px solid #f0b429;` +
    `border-radius:6px;padding:14px 16px;margin:14px 0 18px;">` +
    `<strong style="color:#102a43;">Ese usuario no es un correo y no recibe mensajes.</strong> ` +
    `Sirve solo para entrar al sitio. Todo lo que tengamos que contarte —cómo va en clase, los avisos, ` +
    `los recordatorios— te llega <strong>a este mismo correo</strong>.</p>` +

    `<p style="font-size:14px;line-height:1.6;margin:0 0 18px;">` +
    `<strong style="color:#102a43;">¿Tienes otro hijo o hija en la Academia?</strong> ` +
    `Cada uno lleva su propio usuario, para que su progreso no se mezcle — pero los dos correos ` +
    `te llegan aquí, a esta misma dirección.</p>` +

    `<p style="font-size:14px;line-height:1.6;background:#f0f4f8;border-radius:10px;padding:14px 16px;margin:0 0 18px;">` +
    `<strong style="color:#102a43;">¿Se les olvida la contraseña?</strong> ` +
    `En la pantalla de acceso toca «¿Olvidaste tu contraseña?», escribe ese usuario y te mandamos ` +
    `un enlace nuevo <strong>a este correo</strong> para poner otra.</p>` +

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
