-- La bitácora de auditoría: quién cambió permisos, cuentas, accesos y cobros,
-- y cuándo. Ver «La bitácora de auditoría» en docs/decisiones/permisos-y-roles.md.

create table public.auditoria (
  id bigint generated always as identity primary key,
  cuando timestamptz not null default now(),
  quien uuid,
  via text not null,
  tabla text not null,
  operacion text not null check (operacion in ('alta', 'cambio', 'baja')),
  sobre uuid,
  antes jsonb,
  despues jsonb
);
create index auditoria_cuando on public.auditoria (cuando desc);
create index auditoria_tabla_cuando on public.auditoria (tabla, cuando desc);
create index auditoria_sobre on public.auditoria (sobre) where sobre is not null;

alter table public.auditoria enable row level security;
create policy auditoria_select_admin on public.auditoria
  for select to authenticated using ((select public.soy_admin()));

-- Nadie escribe directo: ni la página ni las Edge Functions (service_role).
-- Solo los triggers, que corren como dueño.
revoke all on public.auditoria from anon;
revoke insert, update, delete, truncate on public.auditoria from authenticated, service_role;
grant select on public.auditoria to authenticated;

-- Lo escrito no se cambia ni se borra. La única excepción es la purga por
-- antigüedad, que levanta la marca local ajedrez.purgando_auditoria.
create or replace function interno.auditoria_intocable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('ajedrez.purgando_auditoria', true) = 'si' then
    return old;
  end if;
  raise exception 'La bitácora de auditoría no se cambia ni se borra.';
end;
$$;
revoke execute on function interno.auditoria_intocable() from public, anon, authenticated;

create trigger auditoria_intocable before update or delete on public.auditoria
  for each row execute function interno.auditoria_intocable();
create trigger auditoria_sin_truncate before truncate on public.auditoria
  for each statement execute function interno.auditoria_intocable();

-- El trigger de cada tabla vigilada. Los argumentos, si hay, son las columnas
-- que importan (profiles); sin argumentos, todas menos updated_at. Compartido
-- por muchas tablas: nunca nombra new.<columna>, todo va por to_jsonb.
create or replace function interno.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_fila jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_cols text[] := tg_argv;
  v_antes jsonb;
  v_despues jsonb;
  v_sobre text;
  k text;
begin
  if tg_op = 'UPDATE' then
    v_antes := '{}'::jsonb;
    v_despues := '{}'::jsonb;
    for k in select jsonb_object_keys(v_new) loop
      continue when k = 'updated_at';
      continue when cardinality(v_cols) > 0 and not (k = any (v_cols));
      if v_old -> k is distinct from v_new -> k then
        v_antes := v_antes || jsonb_build_object(k, v_old -> k);
        v_despues := v_despues || jsonb_build_object(k, v_new -> k);
      end if;
    end loop;
    if v_despues = '{}'::jsonb then
      return null;
    end if;
  elsif cardinality(v_cols) > 0 then
    select jsonb_object_agg(key, value) into v_antes
      from jsonb_each(v_fila) where key = any (v_cols) or key = 'id';
    if tg_op = 'INSERT' then
      v_despues := v_antes;
      v_antes := null;
    end if;
  else
    v_antes := v_old;
    v_despues := v_new;
  end if;

  v_sobre := coalesce(v_fila ->> 'student_id', v_fila ->> 'alumno_id', v_fila ->> 'persona_id',
                      v_fila ->> 'profesor_id', v_fila ->> 'teacher_id',
                      case when tg_table_name = 'profiles' then v_fila ->> 'id' end);

  insert into public.auditoria (quien, via, tabla, operacion, sobre, antes, despues)
  values (
    (select auth.uid()),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', session_user::text),
    tg_table_name,
    case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
    case when v_sobre ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_sobre::uuid end,
    v_antes,
    v_despues
  );
  return null;
end;
$$;
revoke execute on function interno.auditar() from public, anon, authenticated;

-- profiles: solo lo que da o quita permisos, y el correo con que se entra.
-- El WHEN evita correr el trigger en cada cambio de nombre o de Elo.
create trigger auditar_alta_baja after insert or delete on public.profiles
  for each row execute function interno.auditar('role', 'is_admin', 'es_coordinador', 'es_supervisor', 'teacher_id', 'email');
create trigger auditar_cambio after update on public.profiles
  for each row
  when (old.role is distinct from new.role
     or old.is_admin is distinct from new.is_admin
     or old.es_coordinador is distinct from new.es_coordinador
     or old.es_supervisor is distinct from new.es_supervisor
     or old.teacher_id is distinct from new.teacher_id
     or old.email is distinct from new.email)
  execute function interno.auditar('role', 'is_admin', 'es_coordinador', 'es_supervisor', 'teacher_id', 'email');

-- Las tablas que reparten permisos, accesos y dinero: todo.
do $$
declare t text;
begin
  foreach t in array array[
    'profile_teachers', 'equipos', 'equipo_alumnos', 'equipo_entrenadores',
    'coordinador_profesores', 'coordinador_funciones_quitadas', 'supervisor_cuentas',
    'academias', 'academia_miembros', 'academia_ia', 'preparacion_rivales_profesores',
    'acceso_config', 'paquetes_acceso', 'paquete_alumnos', 'pruebas_gratis',
    'planes_cobro', 'suscripciones', 'cobros', 'pagos'
  ] loop
    execute format(
      'create trigger auditar after insert or update or delete on public.%I
         for each row execute function interno.auditar()', t);
  end loop;
end $$;

-- Quitarle la verificación en dos pasos a alguien también queda anotado:
-- auth.mfa_factors no es nuestra y no lleva triggers, así que lo escribe la
-- función misma.
create or replace function public.quitar_verificacion_en_dos_pasos(p_persona uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not coalesce(public.soy_admin() and (select auth.jwt()) ->> 'aal' = 'aal2', false) then
    raise exception 'Solo quien administra, entrando con su propio código, puede quitarle la verificación a otra persona.'
      using errcode = '42501';
  end if;
  if p_persona = (select auth.uid()) then
    raise exception 'La tuya se quita desde Configuración.';
  end if;
  delete from auth.mfa_factors where user_id = p_persona;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.auditoria (quien, via, tabla, operacion, sobre, antes, despues)
    values ((select auth.uid()), 'authenticated', 'verificacion_en_dos_pasos', 'baja', p_persona,
            jsonb_build_object('factores', n), null);
  end if;
  return n;
end;
$$;

-- Cuánto se guarda: dos años. La purga corre el día 1 de cada mes.
create or replace function interno.purgar_auditoria()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('ajedrez.purgando_auditoria', 'si', true);
  delete from public.auditoria where cuando < now() - interval '2 years';
  get diagnostics n = row_count;
  perform set_config('ajedrez.purgando_auditoria', '', true);
  return n;
end;
$$;
revoke execute on function interno.purgar_auditoria() from public, anon, authenticated;

select cron.schedule('auditoria-purga', '17 9 1 * *', 'select interno.purgar_auditoria()');