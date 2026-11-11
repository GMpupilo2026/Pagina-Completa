-- Las preguntas que pausan la grabación de una clase. Lo pidió el dueño para
-- el taller «Formación Ajedrez»: que ver la grabación no sea solo mirar la
-- pantalla. Al terminar un tema, el video se detiene y sale una pregunta del
-- banco ya revisado del curso; se contesta, se ve si estuvo bien y se sigue.
--
-- La pregunta (el texto y las cuatro opciones) la publica el sitio junto a la
-- presentación (grabacion.json, que escribe herramientas/formacion-grabaciones.js);
-- cuál es la correcta la sabe SOLO la base: grabacion_preguntas, por video
-- (youtube_id) y número de pregunta. Así quien mira no la encuentra en el
-- archivo, y si se sube otro video a esa clase (otro id), sus preguntas no se
-- le pegan al nuevo. Esa tabla no la lee nadie más que administración.
--
-- Corrige grabacion_pregunta_responder(): pide que la grabación sea de una
-- clase de quien llama (la regla de mis_grabaciones(), con coalesce) y anota
-- en grabacion_respuestas SOLO la primera respuesta de cada pregunta (la llave
-- primaria lo garantiza, no un if): la nota es la de la primera vez, como los
-- cuestionarios del taller. Devuelve la correcta, si acertó y, si ya había
-- contestado, lo que contestó esa primera vez. Quien administra y el profe de
-- la clase pueden probarla (les contesta igual) pero no se les anota nada.
--
-- grabacion_respuestas la leen la persona, el profe de esa clase y quien
-- administra; no tiene política de escritura. La ficha Asesores la pide por
-- taller con asesores_preguntas_video(): por persona y grabación, cuántas
-- preguntas tiene, cuántas contestó y cuántas acertó.
--
-- No reparte permisos, accesos ni dinero: no lleva bitácora. La página de
-- privacidad lo dice en «Lo que haces en la plataforma».
--
-- Ver «Las preguntas dentro del video» en docs/decisiones/paneles.md.

create table public.grabacion_preguntas (
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  n smallint not null check (n between 1 and 50),
  correcta smallint not null check (correcta between 0 and 3),
  primary key (youtube_id, n)
);
comment on table public.grabacion_preguntas is
  'Cuál opción es la correcta de cada pregunta que pausa la grabación de una clase (por video y número). El texto y las opciones van en grabacion.json; la correcta, solo acá.';
alter table public.grabacion_preguntas enable row level security;
revoke all on public.grabacion_preguntas from public, anon, authenticated;
grant select on public.grabacion_preguntas to authenticated;
create policy grabacion_preguntas_ver on public.grabacion_preguntas
  for select to authenticated
  using ((select public.soy_admin()));

create table public.grabacion_respuestas (
  horario_id uuid not null,
  fecha date not null,
  persona_id uuid not null references public.profiles(id) on delete cascade,
  n smallint not null check (n between 1 and 50),
  elegida smallint not null check (elegida between 0 and 3),
  acerto boolean not null,
  respondida_en timestamptz not null default now(),
  primary key (horario_id, fecha, persona_id, n),
  foreign key (horario_id, fecha) references public.grabaciones_clase(horario_id, fecha) on delete cascade
);
comment on table public.grabacion_respuestas is
  'La primera respuesta de cada persona a cada pregunta de la grabación de una clase. La escribe grabacion_pregunta_responder(); la leen la persona, el profe de la clase y administración.';
create index grabacion_respuestas_persona_idx on public.grabacion_respuestas (persona_id);
alter table public.grabacion_respuestas enable row level security;
revoke all on public.grabacion_respuestas from public, anon, authenticated;
grant select on public.grabacion_respuestas to authenticated;
create policy grabacion_respuestas_ver on public.grabacion_respuestas
  for select to authenticated
  using (
    persona_id = (select auth.uid())
    or (select public.soy_admin())
    or horario_id in (select h.id from public.horario_clases h where h.profesor_id = (select auth.uid()))
  );

-- p_n: el número de la pregunta en su video; p_opcion: 0 a 3 (A a D).
create function public.grabacion_pregunta_responder(p_horario uuid, p_fecha date, p_n integer, p_opcion integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_yo uuid := (select auth.uid());
  v_alumno boolean;
  v_video text;
  v_correcta smallint;
  v_elegida smallint;
  v_acerto boolean;
begin
  if p_opcion is null or p_opcion not between 0 and 3 or p_n is null or p_n not between 1 and 50 then
    raise exception 'La respuesta es una opción de la A a la D de una pregunta del video.' using errcode = '22023';
  end if;
  v_alumno := coalesce(v_yo is not null and p_horario in (select interno.horarios_del_alumno(v_yo)), false);
  if not coalesce(v_alumno or public.soy_admin()
                  or exists (select 1 from public.horario_clases h where h.id = p_horario and h.profesor_id = v_yo), false) then
    raise exception 'Esa grabación no es de una clase tuya.' using errcode = '42501';
  end if;
  select g.youtube_id into v_video from public.grabaciones_clase g where g.horario_id = p_horario and g.fecha = p_fecha;
  if v_video is null then
    raise exception 'Esa clase no tiene grabación.' using errcode = '22023';
  end if;
  select q.correcta into v_correcta from public.grabacion_preguntas q where q.youtube_id = v_video and q.n = p_n;
  if v_correcta is null then
    raise exception 'Ese video no tiene esa pregunta.' using errcode = '22023';
  end if;

  if not v_alumno then
    -- Quien administra o el profe de la clase la prueba: se le contesta, no se anota.
    return jsonb_build_object('correcta', v_correcta, 'elegida', p_opcion, 'acerto', p_opcion = v_correcta, 'anotada', false);
  end if;

  insert into public.grabacion_respuestas (horario_id, fecha, persona_id, n, elegida, acerto)
  values (p_horario, p_fecha, v_yo, p_n, p_opcion, p_opcion = v_correcta)
  on conflict (horario_id, fecha, persona_id, n) do nothing;

  -- Lo que vale es la primera vez: se lee de la tabla, no de lo que llegó.
  select r.elegida, r.acerto into v_elegida, v_acerto
    from public.grabacion_respuestas r
   where r.horario_id = p_horario and r.fecha = p_fecha and r.persona_id = v_yo and r.n = p_n;
  return jsonb_build_object('correcta', v_correcta, 'elegida', v_elegida, 'acerto', v_acerto, 'anotada', true,
                            'primera_vez', v_elegida = p_opcion);
end;
$function$;
revoke execute on function public.grabacion_pregunta_responder(uuid, date, integer, integer) from public, anon;
grant execute on function public.grabacion_pregunta_responder(uuid, date, integer, integer) to authenticated;

-- Para la ficha Asesores: cada persona de un taller (sus cuentas temporales
-- abiertas) con cada grabación de sus clases que tiene preguntas: cuántas
-- tiene, cuántas contestó y cuántas acertó (la primera vez). Es SECURITY
-- DEFINER por la misma razón que asesores_grabaciones(): «sus clases» es
-- interno.horarios_del_alumno(). Quien administra recibe todo; cualquier otro,
-- solo sus filas.
create function public.asesores_preguntas_video(p_detalle text)
 returns table(persona_id uuid, horario_id uuid, fecha date, total integer, respondidas integer, aciertos integer)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with gente as (
    select ct.persona_id
      from public.cuentas_temporales ct
     where ct.detalle = p_detalle
       and ct.vence > now()
       and coalesce(public.soy_admin() or ct.persona_id = (select auth.uid()), false)
  ), grabadas as (
    select g.horario_id, g.fecha, count(q.n)::integer as total
      from public.grabaciones_clase g
      join public.grabacion_preguntas q on q.youtube_id = g.youtube_id
     group by g.horario_id, g.fecha
  )
  select p.persona_id, gr.horario_id, gr.fecha, gr.total,
         count(r.n)::integer, count(r.n) filter (where r.acerto)::integer
    from gente p
    join grabadas gr on gr.horario_id in (select interno.horarios_del_alumno(p.persona_id))
    left join public.grabacion_respuestas r
      on r.horario_id = gr.horario_id and r.fecha = gr.fecha and r.persona_id = p.persona_id
   group by p.persona_id, gr.horario_id, gr.fecha, gr.total
   limit 5000;
$function$;
revoke execute on function public.asesores_preguntas_video(text) from public, anon;
grant execute on function public.asesores_preguntas_video(text) to authenticated;

-- Las correctas de las tres grabaciones de Formación Ajedrez (sesiones I a III).
-- Generado por node herramientas/formacion-grabaciones.js --sql: no se edita a mano.
insert into public.grabacion_preguntas (youtube_id, n, correcta) values
  ('3FzX3ksWwro', 1, 2),
  ('3FzX3ksWwro', 2, 2),
  ('3FzX3ksWwro', 3, 1),
  ('3FzX3ksWwro', 4, 3),
  ('3FzX3ksWwro', 5, 1),
  ('3FzX3ksWwro', 6, 0),
  ('3FzX3ksWwro', 7, 0),
  ('3FzX3ksWwro', 8, 0),
  ('3FzX3ksWwro', 9, 3),
  ('3FzX3ksWwro', 10, 1),
  ('KYxPogxcpoA', 1, 1),
  ('KYxPogxcpoA', 2, 3),
  ('KYxPogxcpoA', 3, 0),
  ('KYxPogxcpoA', 4, 3),
  ('KYxPogxcpoA', 5, 2),
  ('KYxPogxcpoA', 6, 1),
  ('KYxPogxcpoA', 7, 2),
  ('KYxPogxcpoA', 8, 0),
  ('KYxPogxcpoA', 9, 1),
  ('KYxPogxcpoA', 10, 0),
  ('kgaq7FK4AnU', 1, 3),
  ('kgaq7FK4AnU', 2, 2),
  ('kgaq7FK4AnU', 3, 1),
  ('kgaq7FK4AnU', 4, 0),
  ('kgaq7FK4AnU', 5, 2),
  ('kgaq7FK4AnU', 6, 0),
  ('kgaq7FK4AnU', 7, 0),
  ('kgaq7FK4AnU', 8, 3),
  ('kgaq7FK4AnU', 9, 1),
  ('kgaq7FK4AnU', 10, 1)
on conflict (youtube_id, n) do update set correcta = excluded.correcta;
delete from public.grabacion_preguntas where youtube_id = '3FzX3ksWwro' and n > 10;
delete from public.grabacion_preguntas where youtube_id = 'KYxPogxcpoA' and n > 10;
delete from public.grabacion_preguntas where youtube_id = 'kgaq7FK4AnU' and n > 10;
