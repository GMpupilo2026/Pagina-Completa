# Punto de restauración de la plataforma

Qué hacer si algo falla y hay que reconstruir Ajedrez Integral. Lo primero, el
mapa de dónde vive cada cosa, porque no todo se recupera del mismo lado:

| pieza | dónde está respaldada | se recupera |
|---|---|---|
| el sitio (HTML, JS, CSS, PDF, imágenes) | este repositorio | `git checkout <etiqueta>` |
| el esquema de las dos bases | `supabase/migraciones*/` | aplicando las migraciones |
| las 14 Edge Functions | `supabase/functions/` | desplegándolas |
| la configuración de Cloudflare | `worker.js`, `_headers`, `_redirects`, `wrangler.jsonc` | `wrangler deploy` |
| **los datos de la gente** | **en ninguna parte todavía** | **ver abajo — esto es lo urgente** |
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

## Lo urgente: los datos no tienen red

El esquema entero está respaldado, así que una base vacía se reconstruye en
minutos. Lo que no se reconstruye es lo que la gente hizo adentro: los 105
perfiles, las 3.976 filas de progreso, los 80 encargados a los que llegan los
informes, los 53 planes de clase, la bitácora, los cobros.

**La organización de Supabase está en el plan gratuito, que no hace copias
automáticas de la base.** O sea que hoy, debajo de esos datos, no hay nada. Lo
que se borre, se borró. Hay dos salidas y conviene tomar las dos:

1. **Correr el volcado a mano**, cada tanto y sobre todo antes de cualquier
   migración que toque datos:

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

2. **Pagar el plan Pro**, que trae copias diarias automáticas con siete días de
   ventana (y de paso habilita la protección contra contraseñas filtradas que
   CLAUDE.md tiene anotada como pendiente por lo mismo). Un respaldo que
   depende de que alguien se acuerde de correrlo, tarde o temprano no se corre.

Y en los dos casos: **la copia va fuera de esta computadora.** Un respaldo que
vive en el mismo lugar que lo respaldado no es un respaldo.

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

- Academia: `supabase/migraciones/` — 206 migraciones.
- Inscripciones: `supabase/migraciones-colegios/` — 5.

**Después de aplicarlas, comparar contra el retrato** que está en
`supabase/esquema/inventario-academia.txt`: 64 tablas, 115 funciones, 186
políticas, 21 triggers, 133 índices, 15 tablas en Realtime, 4 tareas de cron.
Si falta una política, nadie se entera hasta que a alguien se le abre algo que
no debía, o se le cierra algo que sí. La consulta que arma ese inventario está
en `herramientas/verificar-punto-restauracion.js`.

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
