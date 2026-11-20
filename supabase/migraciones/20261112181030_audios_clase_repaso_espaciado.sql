-- Audios de las clases (ADAES, alumnos ciegos): los minutos aproximados de una
-- guía y el repaso espaciado («Repaso de hoy»).
-- Ver «Las guías armadas sin los minutos de Whisper» y «El repaso de hoy» en
-- docs/decisiones/accesibilidad.md.

-- Las transcripciones que se subieron primero son texto corrido, sin el segundo
-- de cada frase: la guía se arma igual, con el minuto calculado por la parte del
-- texto en que se dijo, y la página avisa que es aproximado. Cuando se sube la
-- transcripción de Whisper con sus minutos, la página los cambia y esto vuelve
-- a false.
alter table public.audios_clase
  add column if not exists minutos_aproximados boolean not null default false;

-- Las vueltas del repaso: después de la primera respuesta (audios_clase_repasos)
-- la misma pregunta vuelve a los 2 días, luego a los 7 y luego a los 21 (contados
-- desde la vuelta anterior). Si se falla, vuelve al día siguiente. Tres vueltas
-- y la pregunta queda aprendida. Solo las escribe responder_vuelta().
create table if not exists public.audios_clase_vueltas (
  persona_id uuid        not null references public.profiles (id) on delete cascade,
  audio_id   uuid        not null references public.audios_clase (id) on delete cascade,
  n          smallint    not null,
  vuelta     smallint    not null check (vuelta between 1 and 3),
  opcion     smallint    not null,
  acerto     boolean     not null,
  en         timestamptz not null default now(),
  primary key (persona_id, audio_id, n, vuelta)
);
alter table public.audios_clase_vueltas enable row level security;
create policy audios_clase_vueltas_select on public.audios_clase_vueltas for select to authenticated
  using (persona_id = (select auth.uid()));
revoke all on public.audios_clase_vueltas from anon, authenticated;
grant select on public.audios_clase_vueltas to authenticated;

-- Qué vuelta le toca a una persona en una pregunta y desde qué día (en hora de
-- Costa Rica). Nada si todavía no la contestó por primera vez o si ya hizo las
-- tres vueltas.
create or replace function interno.vuelta_que_toca(p_persona uuid, p_audio uuid, p_n integer)
returns table (vuelta smallint, dia date)
language sql stable security definer
set search_path = public
set row_security = off
as $$
  with hechas as (
    select 0 as vuelta, r.acerto, r.en from public.audios_clase_repasos r
     where r.persona_id = p_persona and r.audio_id = p_audio and r.n = p_n
    union all
    select v.vuelta, v.acerto, v.en from public.audios_clase_vueltas v
     where v.persona_id = p_persona and v.audio_id = p_audio and v.n = p_n
  ), ultima as (
    select * from hechas order by vuelta desc limit 1
  )
  select (u.vuelta + 1)::smallint,
         (u.en at time zone 'America/Costa_Rica')::date
           + case when not u.acerto then 1 when u.vuelta = 0 then 2 when u.vuelta = 1 then 7 else 21 end
    from ultima u
   where u.vuelta < 3;
$$;
revoke execute on function interno.vuelta_que_toca(uuid, uuid, integer) from public, anon;
grant execute on function interno.vuelta_que_toca(uuid, uuid, integer) to authenticated, service_role;

-- El repaso de hoy de quien pregunta: las vueltas que ya tocan (vuelta 1 a 3)
-- y las preguntas todavía sin contestar de las clases de las últimas dos
-- semanas (vuelta 0: se contestan con responder_repaso(), que paga la primera
-- vez). Nunca la respuesta buena: esa la da la función después de contestar.
create or replace function public.repaso_de_hoy()
returns table (audio_id uuid, fecha date, n smallint, pregunta text, opciones text[], vuelta smallint)
language sql stable security definer
set search_path = public
set row_security = off
as $$
  with yo as (
    select auth.uid() as id, (now() at time zone 'America/Costa_Rica')::date as hoy
  ), mias as (
    select a.id, a.fecha from public.audios_clase a, yo
     where yo.id is not null and a.academia_id in (select interno.academias_de(yo.id))
  ), todo as (
    select q.audio_id, m.fecha, q.n, q.pregunta, q.opciones, t.vuelta
      from mias m
      join public.audios_clase_preguntas q on q.audio_id = m.id
      cross join yo
      cross join lateral interno.vuelta_que_toca(yo.id, q.audio_id, q.n) t
     where t.dia <= yo.hoy
    union all
    select q.audio_id, m.fecha, q.n, q.pregunta, q.opciones, 0::smallint
      from mias m
      join public.audios_clase_preguntas q on q.audio_id = m.id
      cross join yo
     where m.fecha between yo.hoy - 14 and yo.hoy
       and not exists (select 1 from public.audios_clase_repasos r
                        where r.persona_id = yo.id and r.audio_id = q.audio_id and r.n = q.n)
  )
  select * from todo order by (vuelta = 0), fecha, audio_id, n limit 15;
$$;
revoke execute on function public.repaso_de_hoy() from public, anon;
grant execute on function public.repaso_de_hoy() to authenticated;

-- Contestar una vuelta del repaso: solo la que ya toca (si no, se rechaza). Dice
-- si acertó, cuál era la buena, por qué y cuándo vuelve. Paga 1 Punto Ajedrez a
-- un alumno que acierta; la referencia repaso:<audio>:<n>:v<vuelta> impide
-- cobrar dos veces la misma vuelta.
create or replace function public.responder_vuelta(p_audio uuid, p_n integer, p_opcion integer)
returns table (acerto boolean, correcta integer, explicacion text, puntos integer, vuelta integer, proxima date)
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  v_yo uuid := auth.uid();
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_academia uuid;
  v_fecha date;
  v_q public.audios_clase_preguntas;
  v_vuelta smallint;
  v_dia date;
  v_acerto boolean;
  v_n integer;
  v_puntos integer := 0;
begin
  select a.academia_id, a.fecha into v_academia, v_fecha from public.audios_clase a where a.id = p_audio;
  if not coalesce(v_yo is not null and v_academia is not null
                  and v_academia in (select interno.academias_de(v_yo)), false) then
    raise exception 'No puedes contestar esta pregunta.' using errcode = '42501';
  end if;
  select * into v_q from public.audios_clase_preguntas q where q.audio_id = p_audio and q.n = p_n;
  if not found then
    raise exception 'Esa pregunta no existe.' using errcode = 'P0002';
  end if;
  if p_opcion is null or p_opcion < 1 or p_opcion > array_length(v_q.opciones, 1) then
    raise exception 'Esa opción no existe.' using errcode = '22023';
  end if;
  select t.vuelta, t.dia into v_vuelta, v_dia from interno.vuelta_que_toca(v_yo, p_audio, p_n) t;
  if v_vuelta is null or v_dia > v_hoy then
    raise exception 'Esta pregunta todavía no toca.' using errcode = '22023';
  end if;
  v_acerto := p_opcion = v_q.correcta;
  insert into public.audios_clase_vueltas (persona_id, audio_id, n, vuelta, opcion, acerto)
  values (v_yo, p_audio, p_n, v_vuelta, p_opcion, v_acerto)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 and v_acerto
     and exists (select 1 from public.profiles p where p.id = v_yo and p.role = 'alumno') then
    v_puntos := interno.otorgar_puntos(v_yo, 1, 'entrenamiento',
      'Repaso de la clase del ' || to_char(v_fecha, 'DD/MM/YYYY'),
      'repaso:' || p_audio || ':' || p_n || ':v' || v_vuelta, null);
  end if;
  return query select v_acerto, v_q.correcta::integer, v_q.explicacion, v_puntos, v_vuelta::integer,
    (select t.dia from interno.vuelta_que_toca(v_yo, p_audio, p_n) t);
end;
$$;
revoke execute on function public.responder_vuelta(uuid, integer, integer) from public, anon;
grant execute on function public.responder_vuelta(uuid, integer, integer) to authenticated;
