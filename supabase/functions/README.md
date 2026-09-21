# Las Edge Functions, versionadas

Estas funciones corren en Supabase (proyecto **AjedrezIntegral**), no en
Cloudflare. Hasta ahora su código vivía **solo allá**: no se podía leer en un
diff, ni revisar en un PR, ni saber qué cambió entre dos despliegues. Esta
carpeta es la fuente; lo que corre en Supabase es su despliegue.

> Ojo: por ahora aquí están **solo las funciones que se han tocado desde que
> existe esta carpeta**. Las demás siguen viviendo únicamente en Supabase. Al
> tocar una, se baja primero su código de allá y se agrega aquí — si no, la
> carpeta empieza a mentir sobre lo que hay desplegado.

## Cómo se arma un despliegue

Cada función se despliega con SUS archivos y no puede importar de una carpeta
hermana, así que lo compartido se copia al armar:

    node herramientas/funciones-armar.js          # deja los archivos listos
    node herramientas/funciones-armar.js --json   # lo que hay que subir

`_compartido/` es la única copia de lo que usan varias funciones. Hoy son dos:

- `invitacion-email.ts` — el correo de bienvenida que mandan las dos puertas de
  alta: el formulario de inscripción y la invitación directa del profesor.
- `usuario-alumno.ts` — el usuario de un alumno sin correo propio y el dominio
  interno. Lo usan las dos puertas de alta y `recuperar-acceso`.

## `recuperar-acceso` va con `verify_jwt` en **false**

Quien olvidó su contraseña, por definición, no tiene sesión. A cambio la
función no dice nunca si la cuenta existe: contesta lo mismo en todos los
casos. Al desplegarla hay que dejar esa casilla desmarcada — con `verify_jwt`
en true, el olvido de contraseña de los alumnos sin buzón deja de funcionar y
la página no lo nota: sigue diciendo que el correo salió.

## Los secretos

No están aquí ni pueden estarlo: viven en los secretos del proyecto de
Supabase. Los que usan estas funciones son `RESEND_API_KEY` y, opcionalmente,
`RESEND_FROM` (por omisión, `informes@ajedrez-integral.com`, que es el dominio
verificado). **Sin `RESEND_API_KEY` la invitación sigue saliendo**, solo que la
manda Supabase con su propia plantilla en vez del correo de bienvenida.
