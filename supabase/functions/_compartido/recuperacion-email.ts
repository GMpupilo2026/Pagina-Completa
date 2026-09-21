// El correo que lleva el enlace para poner una contraseña nueva.
//
// POR QUÉ ESTO ESTÁ EN UN SOLO ARCHIVO
// Hay DOS puertas que mandan este mismo correo: `recuperar-acceso` (el propio
// alumno, sin sesión, pidiendo "olvidé mi contraseña") y `reenviar-acceso`
// (quien coordina, reenviándoselo a un alumno suyo porque la familia dice que
// nunca le llegó o que la perdió). Escrito dos veces se iría separando a la
// primera corrección, la misma razón por la que `invitacion-email.ts` es
// compartido entre `create-student` e `inscribir-alumno`. Lo despliega en las
// funciones que lo usan `node herramientas/funciones-armar.js`.
//
// EL TEXTO CAMBIA SEGÚN A QUIÉN LE LLEGA
// El enlace puede ir al correo de la PROPIA cuenta (un alumno con correo real)
// o al de la casa (un alumno con usuario de la academia, que no recibe
// correo). Quien lo lee es distinto en cada caso, así que `esCuentaPropia`
// elige entre "tu cuenta" y "la cuenta de tu hijo o hija" — la misma
// distinción que ya hace `cuerpoBienvenidaCasa` en `invitacion-email.ts`.

const WHATSAPP = "https://wa.me/50683092291";

function escapar(texto: string) {
  return texto
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function cuerpoRecuperacion(
  enlace: string,
  usuario: string,
  nombre?: string | null,
  esCuentaPropia = false,
): string {
  const alumno = nombre ? nombre.trim().split(/\s+/)[0] : "";
  const deQuien = alumno ? `de ${escapar(alumno)}` : "de tu hijo o hija";
  const u = escapar(usuario);

  const intro = esCuentaPropia
    ? `Tienes un enlace para poner una contraseña nueva en tu cuenta de la ` +
      `<strong>Academia de Ajedrez Integral</strong>.`
    : `Tienes un enlace para poner una contraseña nueva en la cuenta ${deQuien} en la ` +
      `<strong>Academia de Ajedrez Integral</strong>. Te lo mandamos a ti porque ese usuario ` +
      `no recibe correo.`;

  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#334e68;">` +

    `<h1 style="font-size:22px;color:#102a43;margin:0 0 6px;">Una contraseña nueva</h1>` +
    `<p style="font-size:16px;line-height:1.6;margin:0 0 18px;">${intro}</p>` +

    `<table role="presentation" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;background:#f0f4f8;border-radius:10px;margin:0 0 18px;">` +
    `<tr><td style="padding:16px 18px;">` +
    `<p style="font-size:13px;color:#627d98;margin:0 0 4px;">${esCuentaPropia ? "Tu usuario sigue siendo:" : "El usuario sigue siendo:"}</p>` +
    `<p style="font-size:19px;color:#102a43;font-weight:bold;margin:0;word-break:break-all;">${u}</p>` +
    `</td></tr></table>` +

    `<p style="margin:0 0 8px;">` +
    `<a href="${enlace}" style="display:inline-block;background:#f0b429;color:#102a43;` +
    `font-weight:bold;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:10px;">` +
    `Poner una contraseña nueva</a></p>` +
    `<p style="font-size:13px;color:#627d98;margin:0 0 22px;">` +
    `El enlace se usa una sola vez y dura poco, así que conviene abrirlo hoy mismo. ` +
    `Si se vence, puedes pedir otro desde la misma pantalla de acceso.</p>` +

    `<p style="font-size:14px;line-height:1.6;margin:0 0 18px;">` +
    `<strong style="color:#102a43;">¿No pediste esto?</strong> ` +
    `Entonces no hay nada que hacer: mientras nadie abra ese enlace, la contraseña de antes ` +
    `sigue funcionando igual.</p>` +

    `<p style="font-size:14px;line-height:1.6;margin:0 0 6px;">` +
    `Cualquier duda, escríbenos por WhatsApp al ` +
    `<a href="${WHATSAPP}" style="color:#b44d12;">+506 8309-2291</a>.</p>` +

    `<p style="font-size:12px;color:#829ab1;margin:22px 0 0;border-top:1px solid #d9e2ec;padding-top:12px;">` +
    `Academia de Ajedrez Integral · Oscar Angulo Cubero</p>` +

    `</div>`
  );
}
