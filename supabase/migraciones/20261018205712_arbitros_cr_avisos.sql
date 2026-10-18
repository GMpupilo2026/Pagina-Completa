-- Herramienta «Árbitros de Costa Rica»: el aviso por correo a cada árbitro de
-- lo que se le vence (ver «El aviso por correo de lo que se vence» en
-- docs/decisiones/juegos-y-torneos.md):
-- - una norma de FIDE que deja de contar para su siguiente título (seis años,
--   B.06.1): de AF si no lo tiene, de AI si es AF (solo las posteriores a su AF);
-- - el seminario de FIDE que deja de valer para pedir el título (cuatro años),
--   si tiene alguna norma;
-- - la actividad en la Federación (art. 19): dos años desde su último torneo
--   en Costa Rica válido para Elo o su último curso de actualización.
--
-- El correo de cada árbitro y su autorización van en arbitros_cr_contacto:
-- los registra solo quien administra y no los lee nadie más (son datos
-- personales). Lo que ya se avisó va en arbitros_cr_avisos_enviados, para no
-- repetirlo. El primer día de cada mes pg_cron llama a la Edge Function
-- arbitros-avisos con el secreto de la bóveda, y la función le escribe a cada
-- uno lo que se le vence en los próximos 90 días y todavía no se le avisó.

create table public.arbitros_cr_contacto (
  fide_id integer primary key,
  correo text not null check (length(correo) <= 200 and correo ~ '^[^\s@<>"'',;]+@[^\s@<>"'',;]+\.[^\s@<>"'',;]+$'),
  avisos boolean not null default true,
  autorizo text not null check (length(btrim(autorizo)) between 3 and 200),
  creada_por uuid default auth.uid() references public.profiles(id) on delete set null,
  actualizada timestamptz not null default now()
);
comment on table public.arbitros_cr_contacto is
  'El correo de cada árbitro (fide_id) para los avisos de lo que se le vence, con cómo autorizó recibirlos (autorizo) y si los quiere (avisos). Datos personales: los lee y escribe solo quien administra.';

alter table public.arbitros_cr_contacto enable row level security;
revoke all on public.arbitros_cr_contacto from public, anon, authenticated;
grant select, insert, update, delete on public.arbitros_cr_contacto to authenticated;
create policy arbitros_cr_contacto_admin on public.arbitros_cr_contacto for all to authenticated
  using ((select public.soy_admin())) with check ((select public.soy_admin()));

create table public.arbitros_cr_avisos_enviados (
  fide_id integer not null,
  clave text not null,
  vence date not null,
  enviado timestamptz not null default now(),
  primary key (fide_id, clave)
);
comment on table public.arbitros_cr_avisos_enviados is
  'Lo que ya se le avisó por correo a cada árbitro (clave: norma-af:<torneo>, seminario:<vence>, actividad:<vence>), para no repetirlo. La escribe la Edge Function arbitros-avisos con la service role; la lee quien administra.';
alter table public.arbitros_cr_avisos_enviados enable row level security;
revoke all on public.arbitros_cr_avisos_enviados from public, anon, authenticated;
grant select on public.arbitros_cr_avisos_enviados to authenticated;
create policy arbitros_cr_avisos_enviados_admin on public.arbitros_cr_avisos_enviados for select to authenticated
  using ((select public.soy_admin()));

-- Lo que se le vence a cada árbitro en los próximos p_dias días, con su correo
-- si lo tiene y si ya se le avisó. La usan la Edge Function (service role) y
-- la página, para que administración vea lo que va a salir (soy_admin).
create or replace function public.arbitros_cr_por_vencer(p_dias integer default 90)
returns table (fide_id integer, nombre text, correo text, avisos boolean, clave text, que text, vence date, avisado timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce((select public.soy_admin()) or auth.role() = 'service_role', false) then
    raise exception 'Solo administración ve los avisos de los árbitros' using errcode = '42501';
  end if;
  return query
  with hoy as (select (now() at time zone 'America/Costa_Rica')::date d),
  arb as (
    select f.fide_id, coalesce(a.nombre, f.nombre) nombre, f.titulo, f.fca_leida,
           coalesce(f.af_perfil, f.af_fecha) af_desde, f.seminarios
      from public.arbitros_cr_fide f left join public.arbitros_cr a on a.fide_id = f.fide_id
  ),
  normas as (
    select ar.fide_id, case when ar.titulo = 'FA' then 'ai' else 'af' end cual, t.id, t.nombre torneo, t.inicio::date inicio,
           (t.inicio::date + interval '6 years')::date vence
      from arb ar
      join public.arbitros_cr_cargos c on c.fide_id = ar.fide_id and c.cargo in ('Chief', 'Dep. Chief', 'Arbiter')
      join public.arbitros_cr_torneos t on t.id = c.torneo_id
     where coalesce(ar.titulo, 'NA') <> 'IA'
       and ((ar.titulo = 'FA' and t.ai_estado in ('si', 'una', 'opcion') and t.inicio::date > ar.af_desde)
         or (coalesce(ar.titulo, 'NA') = 'NA' and t.af_estado in ('si', 'una', 'opcion')))
  ),
  sem as (
    select ar.fide_id, s->>'seminario' seminario,
           (coalesce((s->>'fecha')::date, ((s->>'mes') || '-01')::date + interval '1 month' - interval '1 day') + interval '4 years')::date vence,
           row_number() over (partition by ar.fide_id order by coalesce(s->>'fecha', s->>'mes') desc) n
      from arb ar, jsonb_array_elements(coalesce(ar.seminarios, '[]'::jsonb)) s
     where coalesce(ar.titulo, 'NA') <> 'IA' and s->>'tipo' = case when ar.titulo = 'FA' then 'IA' else 'FA' end
  ),
  validos as (
    select c.fide_id, t.inicio::date inicio
      from public.arbitros_cr_cargos c join public.arbitros_cr_torneos t on t.id = c.torneo_id
     where t.pais = 'Costa Rica' and c.cargo in ('Chief', 'Dep. Chief', 'Arbiter')
    union all
    select cc.fide_id, r.inicio::date
      from public.arbitros_cr_cr_cargos cc join public.arbitros_cr_cr r on r.clave = cc.clave
     where coalesce(r.pais, 'CRC') = 'CRC' and r.rondas > 0 and r.jugadores > 0 and cc.rol in ('ap', 'adj', 'arb')
       and (r.fide_torneo is not null
            or exists (select 1 from public.arbitros_cr_cr_elo e
                        where e.clave = r.clave and e.calculo in ('nacional', 'internacional', 'ambos')))
    union all
    select fo.fide_id, fo.fecha from public.arbitros_cr_formacion fo
     where fo.tipo = 'actualizacion' and (fo.nota is null or fo.nota >= 80)
  ),
  actividad as (
    select ar.fide_id, (max(v.inicio) + interval '2 years')::date vence
      from arb ar join validos v on v.fide_id = ar.fide_id
     where ar.fca_leida = (select max(x.fca_leida) from public.arbitros_cr_fide x)
     group by ar.fide_id
  ),
  todo as (
    select n.fide_id, 'norma-' || n.cual || ':' || n.id clave,
           'La norma de ' || case n.cual when 'af' then 'AF' else 'AI' end || ' del torneo «' || n.torneo || '» (' || to_char(n.inicio, 'DD/MM/YYYY')
             || ') deja de contar para pedir el título: una norma vale seis años' que, n.vence
      from normas n
    union all
    select s.fide_id, 'seminario:' || s.vence, 'El seminario «' || s.seminario || '» deja de valer para pedir el título: vale cuatro años', s.vence
      from sem s where s.n = 1 and exists (select 1 from normas n where n.fide_id = s.fide_id)
    union all
    select a.fide_id, 'actividad:' || a.vence,
           'Quedas inactivo en la Federación si para esa fecha no arbitras un torneo válido para Elo ni llevas un curso de actualización (art. 19 del Reglamento para Árbitros)', a.vence
      from actividad a
  )
  select t.fide_id, ar.nombre, co.correo, coalesce(co.avisos, false), t.clave, t.que, t.vence, en.enviado
    from todo t
    join arb ar on ar.fide_id = t.fide_id
    left join public.arbitros_cr_contacto co on co.fide_id = t.fide_id
    left join public.arbitros_cr_avisos_enviados en on en.fide_id = t.fide_id and en.clave = t.clave
    cross join hoy
   where t.vence >= hoy.d and t.vence <= hoy.d + greatest(1, least(coalesce(p_dias, 90), 730))
   order by t.vence, ar.nombre, t.clave;
end;
$$;
revoke execute on function public.arbitros_cr_por_vencer(integer) from public, anon;
grant execute on function public.arbitros_cr_por_vencer(integer) to authenticated, service_role;

-- El secreto con que la base se presenta ante arbitros-avisos. Lo crea la
-- base y no pasa por ningún archivo.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tanda_arbitros_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'tanda_arbitros_secreto');
  end if;
end $$;

create or replace function public.secreto_tanda_arbitros()
returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tanda_arbitros_secreto';
$$;
revoke all on function public.secreto_tanda_arbitros() from public, anon, authenticated;
grant execute on function public.secreto_tanda_arbitros() to service_role;

create or replace function public.disparar_avisos_arbitros()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  secreto text;
begin
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'tanda_arbitros_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de tanda_arbitros: no se mandaron los avisos a los árbitros';
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/arbitros-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('action', 'tanda'),
    timeout_milliseconds := 120000
  );
end;
$$;
-- La corre pg_cron (como postgres). Nadie más.
revoke execute on function public.disparar_avisos_arbitros() from public, anon, authenticated;

-- El día 1 de cada mes a las 8:07 de Costa Rica (14:07 UTC).
select cron.schedule('avisos-arbitros', '7 14 1 * *', 'select public.disparar_avisos_arbitros();');
