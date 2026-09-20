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

`_compartido/` es la única copia de lo que usan varias funciones. Hoy es el
correo de bienvenida (`invitacion-email.ts`), que mandan las dos puertas de
alta: el formulario de inscripción y la invitación directa del profesor.

## Los secretos

No están aquí ni pueden estarlo: viven en los secretos del proyecto de
Supabase. Los que usan estas funciones son `RESEND_API_KEY` y, opcionalmente,
`RESEND_FROM` (por omisión, `informes@ajedrez-integral.com`, que es el dominio
verificado). **Sin `RESEND_API_KEY` la invitación sigue saliendo**, solo que la
manda Supabase con su propia plantilla en vez del correo de bienvenida.
