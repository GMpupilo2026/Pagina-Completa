-- El lector de planilla (Edge Function ocr-scoresheet) le manda cada foto a
-- Google Vision, y cada foto se paga. Lo podía usar cualquier cuenta con
-- sesión, sin límite: un script con una sesión de alumno gastaba lo que
-- quisiera. Ahora cada uso se cuenta en la base, en el día de Costa Rica:
--   · por persona: 30 fotos al día (una planilla es una foto; alcanza para
--     pasar en limpio una ronda entera de un torneo). Quien administra no
--     tiene tope personal.
--   · en total: 500 al día, el techo si alguien reparte el gasto entre muchas
--     cuentas. Ese también vale para quien administra.
-- El conteo de la persona lo garantiza la base y no un `if`: el upsert solo
-- suma si todavía no llegó al tope, así que dos fotos a la vez no se cuelan.

create table if not exists interno.lector_planilla_uso (
  persona uuid not null references auth.users (id) on delete cascade,
  dia     date not null,
  usos    integer not null default 1 check (usos >= 0),
  primary key (persona, dia)
);
create index if not exists lector_planilla_uso_dia on interno.lector_planilla_uso (dia);
alter table interno.lector_planilla_uso enable row level security;
revoke all on interno.lector_planilla_uso from public, anon, authenticated;

-- Gasta un uso de quien llama. Devuelve NULL si pasa, o el mensaje para la
-- persona. La llama la Edge Function con el token de quien sube la foto (pasa
-- por PostgREST, y con eso por la verificación en dos pasos).
create or replace function public.lector_planilla_gastar()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := (select auth.uid());
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_admin boolean;
  v_usos integer;
  tope_persona constant integer := 30;
  tope_total constant integer := 500;
begin
  if v_yo is null then
    return 'Hace falta iniciar sesión para usar el lector de planilla.';
  end if;
  v_admin := coalesce((select is_admin from public.profiles where id = v_yo), false);

  if coalesce((select sum(usos) from interno.lector_planilla_uso where dia = v_hoy), 0) >= tope_total then
    return 'El lector de planilla llegó a su tope de hoy. Vuelve a intentarlo mañana.';
  end if;

  insert into interno.lector_planilla_uso as u (persona, dia, usos)
  values (v_yo, v_hoy, 1)
  on conflict (persona, dia) do update set usos = u.usos + 1
    where u.usos < tope_persona or v_admin
  returning u.usos into v_usos;

  if v_usos is null then
    return 'Ya leíste ' || tope_persona || ' planillas hoy, que es el máximo por día. Mañana puedes seguir.';
  end if;
  return null;
end;
$$;

revoke execute on function public.lector_planilla_gastar() from public, anon;
grant execute on function public.lector_planilla_gastar() to authenticated;
