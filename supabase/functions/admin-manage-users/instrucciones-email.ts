// Envía el correo "Instrucciones adaptadas" con el PDF adjunto, justo
// después de invitar a una persona nueva. Usa Resend (requiere el secreto
// RESEND_API_KEY en el proyecto de Supabase; sin él, no se envía nada pero
// tampoco se rompe la invitación — crear la cuenta es lo importante).
//
// El PDF se sirve como archivo estático del sitio (instrucciones-adaptadas.pdf
// en la raíz) y se descarga aquí en cada envío en vez de guardarlo embebido
// en el código: así basta con reemplazar ese archivo para actualizar el
// contenido del PDF sin tener que volver a desplegar esta función.

const SITE_URL = "https://ajedrez-integral.com";
const PDF_URL = `${SITE_URL}/instrucciones-adaptadas.pdf`;

export async function sendInstruccionesAdaptadas(email: string, fullName?: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurado: no se envía el PDF de instrucciones adaptadas.");
    return;
  }

  try {
    const pdfRes = await fetch(PDF_URL);
    if (!pdfRes.ok) {
      console.error("No se pudo descargar instrucciones-adaptadas.pdf:", pdfRes.status);
      return;
    }
    const pdfBuffer = new Uint8Array(await pdfRes.arrayBuffer());
    let binary = "";
    for (let i = 0; i < pdfBuffer.length; i++) binary += String.fromCharCode(pdfBuffer[i]);
    const pdfBase64 = btoa(binary);

    const nombre = fullName ? fullName.split(" ")[0] : "";
    const saludo = nombre ? `Hola ${nombre},` : "Hola,";
    const from = Deno.env.get("RESEND_FROM") || "Ajedrez Integral <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Instrucciones adaptadas — Ajedrez Integral",
        html:
          `<p>${saludo}</p>` +
          `<p>Junto con tu invitación a Ajedrez Integral, te compartimos el PDF <strong>Instrucciones adaptadas</strong>: ` +
          `una guía en formato accesible con los enlaces y los pasos completos para usar todo el sitio ` +
          `— el tablero, el entrenamiento y el panel de la Academia — en su modo adaptado para lector de pantalla.</p>` +
          `<p>Puedes descargarlo también aquí: <a href=\"${PDF_URL}\">${PDF_URL}</a></p>` +
          `<p>Cualquier duda, escríbenos por WhatsApp: <a href=\"https://wa.me/50683092291\">+506 8309-2291</a>.</p>`,
        attachments: [
          {
            filename: "instrucciones-adaptadas.pdf",
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("Resend respondió con error al enviar instrucciones adaptadas:", res.status, await res.text());
    }
  } catch (err) {
    // Nunca dejamos que un fallo de correo tumbe la invitación real (la cuenta
    // ya se creó con inviteUserByEmail antes de llegar aquí).
    console.error("Error enviando instrucciones adaptadas:", err);
  }
}

// Correo que le llega a quien fue rechazado de la Academia gratuita,
// invitándolo a elegir un plan pago en vez de una cuenta de alumno. Mismo
// mecanismo (Resend, HTML con estilos inline porque Gmail recorta un
// <style> en <head>) y el mismo "si falla, no se rompe nada más" que
// sendInstruccionesAdaptadas — el rechazo ya quedó guardado antes de llamar
// a esto.
export async function sendInvitacionPlan(email: string, fullName: string, solicitudId: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurado: no se envía el correo de invitación a elegir plan.");
    return;
  }

  const nombre = fullName ? fullName.split(" ")[0] : "";
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";
  const from = Deno.env.get("RESEND_FROM") || "Ajedrez Integral <onboarding@resend.dev>";
  const enlace = `${SITE_URL}/elegir-plan.html?s=${encodeURIComponent(solicitudId)}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Tu lugar en Ajedrez Integral — elige un plan",
        html:
          `<p>${saludo}</p>` +
          `<p>Gracias por escribirnos para sumarte a la Academia. Por ahora no tenemos cupo gratuito, ` +
          `pero sí podemos ofrecerte un plan pago para seguir entrenando con nosotros:</p>` +
          `<ul style=\"padding-left:20px;line-height:1.6;\">` +
          `<li><strong>Acceso a la plataforma</strong> — ₡6.900/mes: cursos, tableros interactivos y entrenamiento a tu ritmo.</li>` +
          `<li><strong>Clase grupal</strong> — ₡5.500 por sesión (plan mensual, grupos de hasta 6).</li>` +
          `<li><strong>Clase individual</strong> — ₡18.000 por hora con Oscar Angulo Cubero.</li>` +
          `</ul>` +
          `<p><a href=\"${enlace}\" style=\"display:inline-block;background:#102a43;color:#fff;padding:10px 20px;` +
          `border-radius:6px;text-decoration:none;font-weight:bold;\">Elegir un plan</a></p>` +
          `<p>Si el botón no funciona, copia y pega este enlace: <a href=\"${enlace}\">${enlace}</a></p>` +
          `<p>Cualquier duda, escríbenos por WhatsApp: <a href=\"https://wa.me/50683092291\">+506 8309-2291</a>.</p>`,
      }),
    });

    if (!res.ok) {
      console.error("Resend respondió con error al enviar la invitación a elegir plan:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Error enviando la invitación a elegir plan:", err);
  }
}
