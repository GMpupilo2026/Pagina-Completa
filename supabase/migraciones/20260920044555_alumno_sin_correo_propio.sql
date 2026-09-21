-- Un alumno pequeño no tiene correo, y su familia tiene UNO para varios hijos.
--
-- Supabase Auth exige correo único (users_email_partial_key), así que dos
-- hermanos no pueden compartirlo: es la llave con la que se inicia sesión. Lo
-- que sí se puede es dejar de pedirle un buzón al niño — se le da un USUARIO
-- del dominio de la academia, que nunca recibe correo, y todo lo que el sitio
-- le escribe a esa familia va al correo de la persona encargada.
--
-- Eso separa dos cosas que hasta hoy el sitio confundía:
--   · con qué entra el alumno   → profiles.email (puede ser un usuario interno)
--   · a dónde se le escribe     → correo_de_contacto(), de aquí en adelante
--
-- EL PELIGRO ES MANDARLE CORREO A ESE BUZÓN QUE NO EXISTE
-- No daría ningún error visible: Resend acepta el envío, el correo rebota y la
-- reputación del dominio se va deteriorando sin que nadie se entere — el mismo
-- fallo callado de siempre. Por eso "a dónde se le escribe a un alumno" se
-- pregunta en UN solo lugar, y las funciones que mandan correo lo usan.

-- ---------------------------------------------------------------- el dominio
-- La ÚNICA definición del dominio interno del lado de la base. La otra mitad
-- vive en supabase/functions/_compartido/usuario-alumno.ts (una Edge Function
-- no puede leer esto), y verificar-alumno-sin-correo.js comprueba que las dos
-- digan lo mismo: separadas, el sitio crearía usuarios en un dominio que la
-- base no reconoce como interno y volvería a mandarles correo.
create or replace function public.es_correo_interno(p_email text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(lower(p_email) like '%@alumno.ajedrez-integral.com', false);
$$;

comment on function public.es_correo_interno(text) is
  'Si ese correo es un usuario de la academia (un alumno sin buzón propio) y no una dirección que reciba correo.';

-- ------------------------------------------------- a dónde se le escribe
-- Devuelve el correo de la propia cuenta cuando es una dirección de verdad, y
-- si no, el de su persona encargada activa. NULL quiere decir "a este alumno
-- no hay forma de escribirle": quien llame tiene que decirlo, no callarlo.
--
-- Es SECURITY INVOKER a propósito, como las funciones de informes: quién puede
-- preguntar por quién lo sigue decidiendo la RLS de profiles y encargados.
create or replace function public.correo_de_contacto(p_alumno uuid)
returns text
language sql
stable
set search_path to ''
as $$
  select coalesce(
    (select p.email from public.profiles p
      where p.id = p_alumno and not public.es_correo_interno(p.email)),
    (select e.email from public.encargados e
      where e.student_id = p_alumno and e.activo
      order by e.created_at
      limit 1)
  );
$$;

comment on function public.correo_de_contacto(uuid) is
  'A dónde se le escribe a este alumno: su propio correo, o el de su encargado si su cuenta es un usuario sin buzón. NULL si no hay a dónde.';

-- --------------------------------------------- los avisos de cobro, arreglados
-- Devolvía p.email tal cual, o sea que a un alumno con usuario interno le
-- mandaría el aviso a una dirección que no existe. Ahora devuelve a dónde se
-- le escribe de verdad; si no hay a dónde, NULL — y quien manda los correos ya
-- salta los nulos, igual que hoy salta a un alumno sin encargado.
create or replace function public.cobros_morosos()
returns table(student_id uuid, alumno text, correo text, grupo text, moneda text,
              deuda numeric, cobros bigint, dias_atraso integer, vence_mas_viejo date)
language sql
stable
set search_path to ''
as $$
  select
    v.student_id,
    coalesce(p.full_name, p.email, 'Sin nombre'),
    public.correo_de_contacto(v.student_id),
    p.grupo,
    v.moneda,
    sum(v.saldo)::numeric,
    count(*),
    max(v.dias_atraso),
    min(v.vence)
  from public.cobros_vista v
  join public.profiles p on p.id = v.student_id
  where v.situacion = 'vencido'
  group by v.student_id, p.full_name, p.email, p.grupo, v.moneda
  order by max(v.dias_atraso) desc;
$$;

-- ------------------------------------------ dos alumnos nunca comparten correo
-- auth.users ya lo impide para las cuentas, pero profiles no lo decía, y es
-- sobre profiles que el alta buscaba "¿ya existe alguien con este correo?"
-- para reusar su cuenta. Escrito aquí, un descuido que intente duplicarlo
-- falla en vez de pisar la cuenta de otro alumno en silencio.
create unique index if not exists profiles_email_sin_repetir
  on public.profiles (lower(email))
  where email is not null;