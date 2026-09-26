-- Las insignias de la clase: premios que el profesor entrega a mano.
--
-- Además de los trofeos (una respuesta ✅ = un trofeo, ver
-- 20260926195531_trofeos_de_la_clase), el profesor quiere premiar lo que no
-- da trofeo: un buen comentario, un ejercicio de la pizarra bien resuelto, la
-- actitud. Son insignias: «Estrella de buen estudiante», «Buena respuesta»…
--
-- El catálogo vive en insignias_tipos y no en el código: lo leen la clase,
-- Logros, Informes y el correo a la casa (una Edge Function), y dos copias del
-- nombre de una insignia se irían separando.
--
-- QUIÉN DA: su profesor o quien administra, por otorgar_insignia(). QUIÉN
-- QUITA: quien la dio o quien administra (quitar_insignia()), para deshacer un
-- toque equivocado. Ninguna de las dos tablas tiene política de escritura.
--
-- premios_de_alumno(alumno, desde, hasta) cuenta trofeos e insignias del
-- periodo y del total. Es SECURITY DEFINER con el mismo criterio que
-- resumen_tareas_examenes(): auth.uid() nulo es la tanda de pg_cron (a anon se
-- le revoca el execute), y así la tanda, la vista previa del profesor y el
-- propio alumno ven exactamente lo mismo. Se suma a informe_de_alumno() con
-- `||`, así los premios llegan al correo a la casa.
--
-- Ver «Las insignias de la clase» en docs/decisiones/entrenamiento.md.

create table public.insignias_tipos (
  tipo text primary key,
  nombre text not null,
  emoji text not null,
  descripcion text not null,
  orden smallint not null
);
comment on table public.insignias_tipos is
  'Catálogo de insignias que el profesor entrega a mano en clase. Una sola copia: la leen sesion.html, logros.html, informes.html y el correo a la casa (premios_de_alumno()).';
alter table public.insignias_tipos enable row level security;
revoke all on public.insignias_tipos from public, anon, authenticated;
grant select on public.insignias_tipos to authenticated;
create policy insignias_tipos_ver on public.insignias_tipos for select to authenticated using (true);

insert into public.insignias_tipos (tipo, nombre, emoji, descripcion, orden) values
  ('buen_estudiante', 'Estrella de buen estudiante', '⭐', 'Por su actitud en clase: atento, puntual, con ganas.', 1),
  ('buena_respuesta', 'Buena respuesta', '💡', 'Por resolver bien algo que no daba trofeo: una pregunta en voz alta, un ejercicio de la pizarra.', 2),
  ('buen_comentario', 'Buen comentario', '💬', 'Por un comentario o una pregunta que hizo pensar a toda la clase.', 3),
  ('gran_esfuerzo', 'Gran esfuerzo', '💪', 'Por no rendirse con algo difícil.', 4),
  ('buen_companero', 'Buen compañerismo', '🤝', 'Por ayudar o animar a un compañero.', 5),
  ('idea_creativa', 'Idea creativa', '🎨', 'Por encontrar una idea original en el tablero.', 6);

create table public.insignias (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null references public.insignias_tipos(tipo),
  motivo text not null default '' check (char_length(motivo) <= 200),
  otorgada_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.insignias is
  'Insignias que el profesor entrega a mano en clase (buen estudiante, buena respuesta...). Solo la escriben otorgar_insignia() y quitar_insignia().';
create index insignias_alumno on public.insignias (alumno_id, created_at desc);

alter table public.insignias enable row level security;
revoke all on public.insignias from public, anon, authenticated;
grant select on public.insignias to authenticated;

create policy insignias_ver on public.insignias
  for select to authenticated
  using (
    alumno_id = (select auth.uid())
    or (select public.soy_admin())
    or alumno_id in (select interno.alumnos_de((select auth.uid())))
    or ((select public.soy_supervisor())
        and alumno_id in (select interno.supervisados_por_mi()))
  );

create or replace function public.otorgar_insignia(p_alumno uuid, p_tipo text, p_motivo text default '')
 returns setof public.insignias
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_yo uuid := auth.uid();
  v_id uuid;
begin
  if not coalesce(
       v_yo is not null and p_alumno is not null and p_alumno <> v_yo
       and (public.soy_admin() or public.soy_profesor_de(p_alumno)), false) then
    raise exception 'Solo su profesor puede darle insignias a este alumno.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.insignias_tipos t where t.tipo = p_tipo) then
    raise exception 'Esa insignia no existe.' using errcode = '22023';
  end if;
  insert into public.insignias (alumno_id, tipo, motivo, otorgada_por)
  values (p_alumno, p_tipo, left(btrim(coalesce(p_motivo, '')), 200), v_yo)
  returning id into v_id;
  return query select * from public.insignias i where i.id = v_id;
end;
$function$;
revoke execute on function public.otorgar_insignia(uuid, text, text) from public, anon;
grant execute on function public.otorgar_insignia(uuid, text, text) to authenticated;

create or replace function public.quitar_insignia(p_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_yo uuid := auth.uid();
  v_borradas integer;
begin
  delete from public.insignias i
   where i.id = p_id
     and coalesce(v_yo is not null and (i.otorgada_por = v_yo or public.soy_admin()), false);
  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then
    raise exception 'Solo quien dio la insignia puede quitarla.' using errcode = '42501';
  end if;
  return true;
end;
$function$;
revoke execute on function public.quitar_insignia(uuid) from public, anon;
grant execute on function public.quitar_insignia(uuid) to authenticated;

create or replace function public.premios_de_alumno(
  p_alumno uuid,
  p_desde timestamptz default '-infinity',
  p_hasta timestamptz default 'infinity')
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_yo uuid := auth.uid();
  v_clase_total integer;
  v_clase_periodo integer;
  v_aj_total integer;
  v_aj_periodo integer;
  v_tipos jsonb;
  v_ultimas jsonb;
begin
  if v_yo is not null and not coalesce(
       p_alumno is not null and (
         p_alumno = v_yo
         or public.soy_admin()
         or public.soy_profesor_de(p_alumno)
         or (public.soy_supervisor() and p_alumno in (select interno.supervisados_por_mi()))
       ), false) then
    raise exception 'No puedes ver los premios de esta persona.' using errcode = '42501';
  end if;

  select count(*)::integer,
         (count(*) filter (where qa.created_at >= p_desde and qa.created_at < p_hasta))::integer
    into v_clase_total, v_clase_periodo
    from public.question_answers qa
   where qa.student_id = p_alumno and qa.is_correct is true;
  select coalesce(sum(t.cantidad), 0)::integer,
         coalesce(sum(t.cantidad) filter (where t.created_at >= p_desde and t.created_at < p_hasta), 0)::integer
    into v_aj_total, v_aj_periodo
    from public.trofeos_ajustes t
   where t.alumno_id = p_alumno;

  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', x.tipo, 'nombre', x.nombre, 'emoji', x.emoji,
           'periodo', x.periodo, 'total', x.total) order by x.orden), '[]'::jsonb)
    into v_tipos
    from (select it.tipo, it.nombre, it.emoji, it.orden,
                 count(i.id) filter (where i.created_at >= p_desde and i.created_at < p_hasta)::integer as periodo,
                 count(i.id)::integer as total
            from public.insignias_tipos it
            left join public.insignias i on i.tipo = it.tipo and i.alumno_id = p_alumno
           group by it.tipo, it.nombre, it.emoji, it.orden) x
   where x.total > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'tipo', u.tipo, 'nombre', u.nombre, 'emoji', u.emoji,
           'motivo', u.motivo, 'fecha', u.created_at) order by u.created_at desc), '[]'::jsonb)
    into v_ultimas
    from (select i.id, i.tipo, it.nombre, it.emoji, i.motivo, i.created_at
            from public.insignias i join public.insignias_tipos it on it.tipo = i.tipo
           where i.alumno_id = p_alumno and i.created_at >= p_desde and i.created_at < p_hasta
           order by i.created_at desc
           limit 5) u;

  return jsonb_build_object('premios', jsonb_build_object(
    'trofeos_periodo', greatest(0, v_clase_periodo + v_aj_periodo),
    'trofeos_total', greatest(0, v_clase_total + v_aj_total),
    'insignias_periodo', coalesce((select sum((e->>'periodo')::int) from jsonb_array_elements(v_tipos) e), 0),
    'insignias_total', coalesce((select sum((e->>'total')::int) from jsonb_array_elements(v_tipos) e), 0),
    'insignias', v_tipos,
    'ultimas', v_ultimas));
end;
$function$;
revoke execute on function public.premios_de_alumno(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.premios_de_alumno(uuid, timestamptz, timestamptz) to authenticated;

alter publication supabase_realtime add table public.insignias;

-- informe_de_alumno() lleva los premios del periodo. Se reescribe a partir de
-- su definición vigente, cambiando SOLO la cola: así no se copia a mano una
-- función de cien líneas (y no se pisa nada que otra migración le haya
-- cambiado).
do $$
declare
  d text := pg_get_functiondef('public.informe_de_alumno(uuid, timestamptz, timestamptz)'::regprocedure);
  viejo text := '|| public.resumen_tareas_examenes(p_alumno, p_desde, p_hasta)';
begin
  if position(viejo in d) = 0 then
    raise exception 'informe_de_alumno() ya no termina como se esperaba';
  end if;
  if position('premios_de_alumno' in d) = 0 then
    execute replace(d, viejo, viejo || E'\n|| public.premios_de_alumno(p_alumno, p_desde, p_hasta)');
  end if;
end $$;