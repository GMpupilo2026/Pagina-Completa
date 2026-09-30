# Punto de restauración de la plataforma

Qué hacer si algo falla y hay que reconstruir Ajedrez Integral. Lo primero, el
mapa de dónde vive cada cosa, porque no todo se recupera del mismo lado:

| pieza | dónde está respaldada | se recupera |
|---|---|---|
| el sitio (HTML, JS, CSS, PDF, imágenes) | este repositorio | `git checkout <etiqueta>` |
| el esquema de las dos bases | `supabase/migraciones*/` | aplicando las migraciones |
| las 14 Edge Functions | `supabase/functions/` | desplegándolas |
| la configuración de Cloudflare | `worker.js`, `_headers`, `_redirects`, `wrangler.jsonc` | `wrangler deploy` |
| los datos de la gente | copias diarias de Supabase (plan Pro) + `respaldo-datos.sh` | ver «Los datos de la gente» |
| los archivos subidos (Storage) | `respaldo-storage.js`, a mano (las copias diarias no los traen) | `restaurar-storage.js`, ver «Los archivos de Storage» |
| los secretos (Resend, Vision, VAPID) | en Supabase y Cloudflare | se vuelven a poner a mano |

**El estado bueno es un commit de `main`**, y hoy es
`8488639` (2026-09-21) — el punto de restauración nació en `0e14950` y las
dos correcciones de después (la etiqueta y el puerto del volcado) ya entran
acá. Conviene además ponerle una etiqueta, que es lo que hace que se
encuentre dentro de un año sin tener que leer el historial:

```
git tag -a restauracion-2026-09-21 8488639 -m "Punto de restauración"
git push origin restauracion-2026-09-21
```

Hay que correrlo **desde una máquina con permiso de escribir etiquetas**: las
credenciales de las sesiones de Claude Code en la web empujan ramas pero
reciben un 403 con `refs/tags`, así que esa etiqueta no se creó sola. Las que
existan se listan con `git tag -l 'restauracion-*'`.

---

## Los datos de la gente

El esquema entero está respaldado, así que una base vacía se reconstruye en
minutos. Lo que no se reconstruye es lo que la gente hizo adentro: los
perfiles, el progreso, los encargados a los que llegan los informes, los
planes de clase, la bitácora, los cobros.

**La organización de Supabase está en el plan Pro** (y la base, en tamaño
Small), así que Supabase hace **una copia diaria automática** de la base, cerca
de la medianoche de la región, y guarda las de los **últimos 7 días**. Se ven
y se restauran en **Database › Backups › Scheduled backups**. Comprobado el 30
de setiembre de 2026: había ocho copias seguidas, del 23 al 30, todas
«PHYSICAL». Si esa lista algún día aparece vacía o con huecos, algo cambió en
el plan y hay que mirarlo antes que cualquier otra cosa.

- **Restaurar una copia pisa la base entera** con la de ese día: se pierde
  todo lo que la gente hizo después. Para rescatar una sola tabla o unas
  filas, mejor **«Restore to new project»** (restaura en un proyecto aparte) y
  de ahí se copia lo que haga falta.
- **Con copias diarias, en el peor caso se pierde un día.** Volver a
  cualquier minuto es el complemento **Point in time** (PITR), que se paga
  aparte y hoy no está contratado.

### Lo que las copias diarias no cubren

1. **Los archivos de Storage.** La copia es de la base: de un archivo subido
   guarda la fila que lo describe, no el archivo. Si se borra un archivo,
   restaurar una copia vieja no lo devuelve. `respaldo-datos.sh` tampoco los
   baja: es `pg_dump`, solo la base. Por eso van aparte, con su propio script
   (ver «Los archivos de Storage», más abajo):

   ```
   SUPABASE_URL='https://<ref>.supabase.co' \
   SUPABASE_SERVICE_ROLE_KEY='<la service_role o la secret key>' \
     node herramientas/respaldo-storage.js
   ```

   Se corre **junto con `respaldo-datos.sh`**, así la base y los archivos
   quedan de la misma fecha.
2. **Una copia fuera de Supabase.** Las copias diarias viven en el mismo lugar
   que la base: si se pierde la cuenta o el proyecto, se pierden con él. Por
   eso el volcado a mano sigue valiendo, cada tanto y sobre todo antes de
   cualquier migración que toque datos:

   ```
   PGURL='postgresql://postgres.<ref>:<clave>@<host>:5432/postgres' \
     bash herramientas/respaldo-datos.sh
   ```

   La cadena sale de Supabase › Project Settings › Database › Connection
   string › URI. **Tiene que ser la del puerto 5432** —la conexión directa o
   el *session pooler*—, nunca la del *transaction pooler*, que es la que el
   panel deja más a mano y va en el **6543**: contra esa `pg_dump` no
   funciona, y el error que da no nombra el puerto, así que parece un
   problema de contraseña. El script rechaza el 6543 y lo dice.

   Deja tres archivos en `respaldos/`, que **no se commitea**: ahí adentro van
   cédulas, correos y progreso de menores de edad, y de git no se borra nada.
   **La copia va fuera de esta computadora.** Un respaldo que vive en el mismo
   lugar que lo respaldado no es un respaldo.

---

## Restaurar, pieza por pieza

### 1. El sitio

```
git checkout 8488639                     # o la etiqueta, si ya se creó
npm install tailwindcss@3 && node herramientas/css-construir.js
npx wrangler deploy
```

El CSS se compila: el repositorio guarda cómo se construye, no el resultado de
la última corrida. Si se despliega sin compilar, la página se ve rota sin que
nada falle — la piedra de siempre.

### 2. El esquema de la base

Las migraciones están en orden alfabético, que es el orden en que se aplicaron.
Sobre un proyecto de Supabase nuevo y vacío:

```
supabase link --project-ref <ref-del-proyecto-nuevo>
cp supabase/migraciones/*.sql supabase/migrations/
supabase db push
```

Sin el CLI, se pegan una por una en el editor SQL, **en orden**: varias
dependen de la anterior (la que agrega una columna a una tabla que otra creó).

- Academia: `supabase/migraciones/` — 275 migraciones (septiembre de 2026).
- Inscripciones: `supabase/migraciones-colegios/` — 7.

**Después de aplicarlas, comparar contra el retrato** que está en
`supabase/esquema/inventario-academia.txt` (esquemas `public` e `interno`):
97 tablas, 232 funciones, 267 políticas, 32 triggers, 260 índices, 17 tablas en
Realtime, 6 tareas de cron. Si falta una política, nadie se entera hasta que a
alguien se le abre algo que no debía, o se le cierra algo que sí. Se compara
corriendo `herramientas/inventario-esquema.sql` en la base restaurada: tiene
que salir, línea por línea, lo mismo que el archivo.

**El retrato se vuelve a armar con cada migración** (la misma consulta, y lo
que devuelve va debajo de la cabecera del archivo, con `# al-dia-con:` puesto
en la versión de la última migración). `verificar-punto-restauracion.js` falla
si hay migraciones más nuevas que esa: llegó a decir 186 políticas cuando había
252, y nada lo avisaba.

**Al bajar una migración, el archivo tiene que quedar byte a byte** como
`array_to_string(statements, E'\n\n')` —sin salto de línea al final si el
guardado no lo trae—, o la huella no cuadra aunque el SQL sea el mismo, y una
alarma que siempre suena deja de leerse. El md5 de cada una se pide así:

```sql
select version, md5(array_to_string(statements, E'\n\n'))
from supabase_migrations.schema_migrations order by version desc limit 5;
```

### 3. Los datos

Sobre el esquema ya reconstruido:

```
psql "$PGURL" -f respaldos/datos-<fecha>.sql
```

O el volcado completo de una sola vez, sobre una base vacía:

```
pg_restore -d "$PGURL" --no-owner --no-privileges respaldos/completo-<fecha>.dump
```

**Las cuentas de `auth.users` van aparte**: `pg_dump -n public` no las trae, y
sin ellas `profiles` queda apuntando a gente que no existe y nadie puede
iniciar sesión. Para llevarlas hay que volcar también el esquema `auth`
(`-n auth`), o volver a invitar a todo el mundo, que es peor.

### 4. Las Edge Functions

```
node herramientas/funciones-armar.js     # copia los archivos de _compartido
supabase functions deploy <nombre>
```

`supabase/esquema/funciones-desplegadas.txt` dice cuáles son y —lo que importa—
**cuál va con `verify_jwt` en false**: `informes-encargados`,
`cobros-recordatorios`, `notificar` y `recuperar-acceso`. Desplegar una de esas
con la verificación puesta la deja rechazando a su propio disparador, y eso no
da ningún error: simplemente dejan de llegar los informes.

### 4 bis. Los archivos de Storage

```
SUPABASE_URL='https://<ref>.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='…' \
  node herramientas/restaurar-storage.js respaldos/storage-<fecha>
```

- Crea los buckets que falten **con la misma configuración** del respaldo:
  público o privado, tamaño máximo y tipos permitidos. Un bucket privado
  recreado como público dejaría las justificaciones a la vista de cualquiera
  sin ningún error.
- **No pisa lo que ya está** (si hay un archivo con esa ruta, es más nuevo que
  el respaldo). `--pisar` lo reemplaza.
- Antes de subir nada comprueba el sha256 de cada archivo contra
  `manifiesto.json`: si hay uno dañado, no sube ninguno.
- Las **políticas** de Storage (quién lee qué) no van en este respaldo: son de
  la base y vuelven con las migraciones (paso 2). Por eso este paso va
  después.

Para comprobar, lo que diga `manifiesto.json` tiene que coincidir con:

```sql
select bucket_id, count(*), sum((metadata->>'size')::bigint)
from storage.objects group by 1 order by 1;
```

### 5. Los secretos

No están en el repositorio ni pueden estarlo. Hay que volver a ponerlos:

- **Supabase** (Project Settings › Edge Functions › Secrets): `RESEND_API_KEY`,
  `RESEND_FROM`, `GOOGLE_VISION_API_KEY`.
- **La bóveda de la base** (Vault): `tanda_informes_secreto`,
  `tanda_cobros_secreto`, `tanda_push_secreto`, `push_vapid_publica`,
  `push_vapid_privada`. Los tres secretos de tanda los genera su migración con
  `gen_random_bytes` — si se vuelven a generar, hay que actualizar también la
  llamada de `pg_net` que los manda.
- **Las llaves VAPID se generan solas** la primera vez que alguien enciende los
  avisos… y eso **invalida todas las suscripciones que ya existen**. Quien
  tenga los avisos encendidos deja de recibirlos sin enterarse. Si se están
  restaurando datos viejos, las llaves viejas van con ellos.

**Dos ajustes de Auth que tampoco están en ninguna migración** (detalle en
`permisos-y-roles.md`, «Lo que se hace en el panel, no desde acá»). Un proyecto
nuevo arranca sin ellos y no da ningún error:

- **Authentication › Sign In / Providers › Email** › «Prevent use of leaked
  passwords» encendido, y **Save**.
- **Authentication › Performance › Connection management**: «Allocation
  strategy» en **Percentage**, al **15 %**.

Se comprueba con los avisos de Supabase: no tienen que aparecer
`auth_leaked_password_protection` ni `auth_db_connections_absolute`.

### 6. Cloudflare

`npx wrangler deploy` sube el worker y el sitio. Lo que **no** está en el
repositorio y hay que rehacer a mano en el panel:

- el CNAME `www` → `ajedrez-integral.com` **con el proxy encendido**, y la ruta
  `www.ajedrez-integral.com/*` apuntando al worker, en ese orden (ver CLAUDE.md);
- los registros de correo: los de `send.ajedrez-integral.com` y
  `resend._domainkey` (por donde SALE el correo) y los tres MX, el SPF y el
  DKIM del dominio raíz (por donde ENTRA). Borrar los de `send.` deja al sitio
  sin mandar informes ni avisos de cobro, y eso tampoco da ningún error.

Al tocar `worker.js`: `node herramientas/verificar-worker.js`.

---

## Mantener el punto de restauración al día

Un respaldo viejo es casi tan malo como ninguno, con el agravante de que da
tranquilidad. Después de cualquier migración nueva o de desplegar una función
nueva:

```
node herramientas/verificar-punto-restauracion.js
```

Comprueba que no falte ninguna pieza e imprime la **huella** de las
migraciones. Esa huella se compara contra la base con la consulta que el propio
script imprime: si no coincide, hay migraciones aplicadas que no están
respaldadas, y hay que volver a bajarlas antes de seguir.

Bajar las migraciones que falten (desde una sesión con el MCP de Supabase):

```sql
select version || '|' || name || '|'
       || md5(array_to_string(statements, E'\n\n')) || '|'
       || replace(encode(convert_to(array_to_string(statements, E'\n\n'), 'UTF8'), 'base64'), chr(10), '')
from supabase_migrations.schema_migrations
where version > '<la última que ya está en supabase/migraciones/>'
order by version;
```

Cada línea se decodifica a `supabase/migraciones/<version>_<nombre>.sql` y **se
comprueba su md5**: una migración transcrita a medias se ve igual de bien que
una entera, y la diferencia solo aparece el día que hay que restaurar.
