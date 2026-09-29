-- ============================================================================
-- El aviso de racha: por la tarde, a quien tiene racha y todavía no hizo los
-- ejercicios del día, un aviso en el celular antes de que se le corte.
--
-- La racha es la de Logros (progreso_dias_y_racha(): días seguidos con al
-- menos 5 ejercicios, en hora de Costa Rica). Hasta ahora solo se veía
-- entrando a la plataforma: quien no entraba un día perdía la racha sin
-- enterarse, y ese es justo el día en que un aviso sirve.
--
--  * Sale una vez por día y por alumno (avisos_racha), aunque el cron corra
--    de nuevo o se dispare a mano.
--  * Solo a quien tiene racha (racha_actual >= 1) y hoy lleva menos de 5.
--  * Se apaga por persona en Configuración (preferencias_avisos.racha); sin
--    fila, está encendido. Los otros avisos (clase abierta, retos) no cambian.
--  * Solo a alumnos con un aparato con avisos encendidos: a los demás
--    avisar_push() no les llegaría igual, y así no se marca como avisado a
--    quien no recibió nada.
-- ============================================================================

create table if not exists public.preferencias_avisos (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  racha      boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table public.preferencias_avisos is
  'Qué avisos push quiere cada persona. Sin fila, todos encendidos.';
alter table public.preferencias_avisos enable row level security;
revoke all on public.preferencias_avisos from anon;
drop policy if exists preferencias_avisos_lee on public.preferencias_avisos;
create policy preferencias_avisos_lee on public.preferencias_avisos
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists preferencias_avisos_agrega on public.preferencias_avisos;
create policy preferencias_avisos_agrega on public.preferencias_avisos
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists preferencias_avisos_cambia on public.preferencias_avisos;
create policy preferencias_avisos_cambia on public.preferencias_avisos
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.avisos_racha (
  student_id uuid not null references public.profiles(id) on delete cascade,
  fecha      date not null,
  racha      int not null,
  faltan     int not null,
  created_at timestamptz not null default now(),
  primary key (student_id, fecha)
);
comment on table public.avisos_racha is
  'A quién se le avisó que su racha estaba en juego, y qué día: uno por día y por alumno.';
alter table public.avisos_racha enable row level security;
revoke all on public.avisos_racha from anon, authenticated;

create or replace function public.avisar_rachas()
returns int
language plpgsql security definer set search_path to 'public' set row_security to off
as $$
declare
  v_hoy  date := (now() at time zone 'America/Costa_Rica')::date;
  v_meta constant int := 5;   -- la meta diaria de Logros (js/logros.js, META_DIARIA)
  v_n    int := 0;
  r      record;
  s      record;
begin
  for r in
    select distinct p.id
      from public.profiles p
      join public.push_suscripciones ps on ps.user_id = p.id and ps.activa
      left join public.preferencias_avisos pa on pa.user_id = p.id
     where p.role = 'alumno'
       and coalesce(pa.racha, true)
       and not exists (select 1 from public.avisos_racha ar where ar.student_id = p.id and ar.fecha = v_hoy)
  loop
    select * into s from public.progreso_dias_y_racha(r.id);
    continue when s is null or s.racha_actual < 1 or s.hoy_ejercicios >= v_meta;
    insert into public.avisos_racha (student_id, fecha, racha, faltan)
    values (r.id, v_hoy, s.racha_actual, v_meta - s.hoy_ejercicios)
    on conflict do nothing;
    continue when not found;
    begin
      perform public.avisar_push(array[r.id],
        '🔥 Tu racha de ' || s.racha_actual || case when s.racha_actual = 1 then ' día' else ' días' end || ' está en juego',
        case when s.hoy_ejercicios = 0
             then 'Hoy todavía no entrenaste: con ' || v_meta || ' ejercicios la salvas.'
             else 'Te ' || case when v_meta - s.hoy_ejercicios = 1 then 'falta 1 ejercicio' else 'faltan ' || (v_meta - s.hoy_ejercicios) || ' ejercicios' end
                  || ' para que hoy cuente.' end,
        '/entreno/index.html',
        'racha:' || v_hoy);
    exception when others then null;
    end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.avisar_rachas() from public, anon, authenticated;

-- 6:05 p. m. en Costa Rica (UTC-6, sin horario de verano): después del
-- colegio y con tiempo de sobra para cinco ejercicios antes de dormir.
select cron.unschedule('avisar-rachas') where exists (select 1 from cron.job where jobname = 'avisar-rachas');
select cron.schedule('avisar-rachas', '5 0 * * *', 'select public.avisar_rachas();');
