// El correo que le llega a quien se rechaza desde la bandeja de solicitudes.
// El de bienvenida (usuario, contraseña provisional y el PDF de instrucciones
// adaptadas) ya no vive aquí: es `invitacion-email.ts`, el mismo de
// create-student e inscribir-alumno.

const SITE_URL = "https://ajedrez-integral.com";
const WHATSAPP = "https://wa.me/50683092291";

// El nombre lo escribe quien pide entrar (unirse.html): va escapado, como todo
// texto de una persona. Sin esto, un «nombre» con HTML se pintaba tal cual en
// el correo que manda la Academia.
function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function saludoPara(fullName?: string) {
  const nombre = fullName ? fullName.trim().split(/\s+/)[0] : "";
  return nombre ? `Hola ${escapar(nombre)},` : "Hola,";
}

// Correo que le llega a quien fue rechazado de la Academia gratuita,
// invitándolo a elegir un plan pago en vez de una cuenta de alumno. Mismo
// mecanismo (Resend, HTML con estilos inline porque Gmail recorta un
// <style> en <head>) y el mismo "si falla, no se rompe nada más" que
// el correo de bienvenida — el rechazo ya quedó guardado antes de llamar
// a esto.
//
// NO lleva precios: los tenía escritos a mano y se habían quedado viejos (el
// acceso a la plataforma decía ₡6.900 cuando el sitio cobra otra cosa). Los
// dice elegir-plan.html, que los saca de la única copia (js/precios-acceso.js).
// Y dice los DOS caminos que tiene esa página: con cuenta se inicia sesión y
// se elige ahí; sin cuenta —la mayoría de quienes llegan acá— se sigue por
// WhatsApp (ver «Quien no tiene cuenta» en docs/decisiones/cuentas-y-formularios.md).
export async function sendInvitacionPlan(email: string, fullName: string, solicitudId: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurado: no se envía el correo de invitación a elegir plan.");
    return;
  }

  const saludo = saludoPara(fullName);
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
        subject: "Tu solicitud a Ajedrez Integral — los planes para entrar",
        html:
          `<p>${saludo}</p>` +
          `<p>Gracias por escribirnos para sumarte a la Academia. Por ahora no tenemos cupo gratuito, ` +
          `pero puedes entrar con uno de nuestros planes: acceso a la plataforma, clase grupal o clase individual. ` +
          `Los tres, con sus precios, están en esta página:</p>` +
          `<p><a href=\"${enlace}\" style=\"display:inline-block;background:#102a43;color:#fff;padding:10px 20px;` +
          `border-radius:6px;text-decoration:none;font-weight:bold;\">Ver los planes</a></p>` +
          `<p><strong>Si ya tienes una cuenta en Ajedrez Integral</strong>, entra con ese botón, inicia sesión ` +
          `con la cuenta de este correo y elige tu plan ahí mismo.</p>` +
          `<p><strong>Si todavía no tienes cuenta</strong>, escríbenos por WhatsApp al ` +
          `<a href=\"${WHATSAPP}\">+506 8309-2291</a> con el plan que te interesa y lo coordinamos.</p>` +
          `<p>Si el botón no funciona, copia y pega este enlace: <a href=\"${enlace}\">${enlace}</a></p>`,
      }),
    });

    if (!res.ok) {
      console.error("Resend respondió con error al enviar la invitación a elegir plan:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Error enviando la invitación a elegir plan:", err);
  }
}
