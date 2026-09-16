# Sacar la app de Android a partir de este sitio

El sitio ya es una PWA instalable (manifest, iconos y service worker). Esto es
lo que falta para que además esté en Google Play, y **todo lo de aquí abajo lo
tiene que hacer una persona**: son trámites y credenciales, no código.

## 1. La cuenta

Google Play Console, **$25 de pago único**, con verificación de identidad.
Antes de empezar, revisá dos requisitos vigentes, porque cambian y afectan el
calendario en semanas:

- el período de **prueba cerrada con testers reales** que Google pide a las
  cuentas personales nuevas antes de publicar en producción;
- la **política de Familias**, que aplica porque el público de la Academia son
  menores: hay que declarar el público objetivo y hay restricciones sobre
  publicidad y recolección de datos. Es lo que más puede frenar la publicación.

También hace falta una **política de privacidad** publicada en el sitio, con su
propia dirección. El formulario de seguridad de datos hay que llenarlo diciendo
la verdad: la Academia guarda correo, nombre y progreso de cada alumno.

## 2. Empaquetar

Con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) o
[PWABuilder](https://www.pwabuilder.com/), apuntando a
`https://ajedrez-integral.com/manifest.json`. Sale un `.aab` para subir.

El nombre del paquete que trae la plantilla de al lado es
`com.ajedrezintegral.academia`. Si se cambia, hay que cambiarlo en los dos
lados.

## 3. Verificar que la app es de este dominio

Sin este paso, la app abre con la barra del navegador encima y no parece una
app. Google Play firma el `.aab` y te da la **huella SHA-256** del certificado
(Play Console › Configuración › Integridad de la app › Firma de apps).

1. Copiá `assetlinks.json` de esta carpeta a `.well-known/assetlinks.json` en
   la raíz del sitio.
2. Pegá la huella donde dice, sin los dos puntos.
3. Publicá y comprobá que `https://ajedrez-integral.com/.well-known/assetlinks.json`
   responde con `Content-Type: application/json`.

**Confirmá que Cloudflare sirve esa carpeta.** Las carpetas que empiezan por
punto a veces quedan fuera del despliegue de archivos estáticos; si el archivo
da 404, hay que servirlo desde `worker.js` a mano.

## 4. Lo que hay que saber después

- **La app se actualiza sola.** Como es una TWA, lo que se ve es el sitio: al
  publicar acá, la app cambia. Solo hay que volver a subir a Play cuando cambie
  el cascarón (icono, nombre, permisos).
- **La sesión se comparte con Chrome.** Quien ya inició sesión en el navegador
  entra directo en la app.
- **Los PDF del material se abren en Chrome**, que es lo que se quiere: son
  archivos protegidos y el visor del sistema los maneja bien.
- **Notificaciones push: no vienen con esto.** Una TWA no las trae. Para eso
  hay que rehacer el cascarón con Capacitor, que es otro trabajo.
