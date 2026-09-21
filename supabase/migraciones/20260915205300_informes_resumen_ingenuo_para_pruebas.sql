-- SOLO PARA PRUEBAS. Copia fiel, fila por fila, del algoritmo que hacía
-- informes.html en el navegador (minutesFromPresenceRows y
-- summarizeTrainingProgress). Sirve para comprobar que
-- informes_resumen_alumnos(), que hace lo mismo con agregados, da exactamente
-- los mismos números. Se borra al terminar la comprobación.
create or replace function public._prueba_resumen_ingenuo()
returns table (
  id uuid, respuestas int, correctas int, calificadas int, clases_asistidas int,
  minutos_clase double precision, minutos_ejercicios double precision,
  puzzles int, lecciones int, mejor_coord int,
  practicar_series int, practicar_estrellas int,
  mate1 int, mate2 int, mate3 int, tactica int, concentracion int, cursos_temas int
)
language plpgsql
stable
as $$
declare
  al record;
  r record;
  -- conjuntos como arreglos de texto, igual que los Set del JavaScript
  s_puzzles text[]; s_lessons text[]; s_m1 text[]; s_m2 text[]; s_m3 text[];
  s_tac text[]; s_con text[]; s_cur text[];
  v_coord numeric;
  v_sets text[]; v_stars numeric[]; v_pos int;
  cur_start timestamptz; cur_end timestamptz; total_ms double precision;
  v_ini timestamptz; v_fin timestamptz;
  origen text;
  minutos double precision[];
begin
  for al in select p.id from public.profiles p where p.role = 'alumno' loop
    id := al.id;

    select count(*)::int, count(*) filter (where qa.is_correct)::int,
           count(*) filter (where qa.is_correct is not null)::int
      into respuestas, correctas, calificadas
      from public.question_answers qa where qa.student_id = al.id;

    clases_asistidas := 0;
    for r in select ca.session_id from public.class_attendance ca where ca.student_id = al.id loop
      if exists (select 1 from public.class_sessions cs where cs.id = r.session_id and cs.ended_at is not null) then
        clases_asistidas := clases_asistidas + 1;
      end if;
    end loop;

    -- El bucle de minutesFromPresenceRows, tal cual, para cada uno de los dos registros.
    minutos := array[0, 0];
    foreach origen in array array['clase', 'ejercicios'] loop
      cur_start := null; cur_end := null; total_ms := 0;
      for r in
        select t.joined_at, t.left_at from (
          select cpl.joined_at, cpl.left_at from public.class_presence_log cpl
           where cpl.student_id = al.id and origen = 'clase'
          union all
          select pal.joined_at, pal.left_at from public.platform_activity_log pal
           where pal.student_id = al.id and origen = 'ejercicios'
        ) t order by t.joined_at
      loop
        v_ini := r.joined_at;
        v_fin := coalesce(r.left_at, least(now(), r.joined_at + interval '20 seconds'));
        if v_fin < v_ini then v_fin := v_ini; end if;
        if cur_start is null then
          cur_start := v_ini; cur_end := v_fin;
        elsif v_ini <= cur_end then
          cur_end := greatest(cur_end, v_fin);
        else
          total_ms := total_ms + extract(epoch from (cur_end - cur_start));
          cur_start := v_ini; cur_end := v_fin;
        end if;
      end loop;
      if cur_start is not null then
        total_ms := total_ms + extract(epoch from (cur_end - cur_start));
      end if;
      minutos[case when origen = 'clase' then 1 else 2 end] := total_ms / 60.0;
    end loop;
    minutos_clase := minutos[1];
    minutos_ejercicios := minutos[2];

    -- El bucle de summarizeTrainingProgress, tal cual.
    s_puzzles := '{}'; s_lessons := '{}'; s_m1 := '{}'; s_m2 := '{}'; s_m3 := '{}';
    s_tac := '{}'; s_con := '{}'; s_cur := '{}';
    v_coord := 0; v_sets := '{}'; v_stars := '{}';
    for r in select tp.activity, tp.detail from public.training_progress tp where tp.student_id = al.id loop
      if r.activity = 'curso' and coalesce(r.detail->>'curso','') <> '' and coalesce(r.detail->>'leccion','') <> '' then
        if not ((r.detail->>'curso') || '/' || (r.detail->>'leccion') = any (s_cur)) then
          s_cur := s_cur || ((r.detail->>'curso') || '/' || (r.detail->>'leccion'));
        end if;
      elsif r.activity = '4x4' and coalesce(r.detail->>'puzzle_id','') <> '' then
        if not (r.detail->>'puzzle_id' = any (s_puzzles)) then s_puzzles := s_puzzles || (r.detail->>'puzzle_id'); end if;
      elsif r.activity = 'aprender' and coalesce(r.detail->>'lesson_id','') <> '' then
        if not (r.detail->>'lesson_id' = any (s_lessons)) then s_lessons := s_lessons || (r.detail->>'lesson_id'); end if;
      elsif r.activity = 'coordenadas' and jsonb_typeof(r.detail->'score') = 'number' then
        v_coord := greatest(v_coord, (r.detail->>'score')::numeric);
      elsif r.activity = 'practicar' and coalesce(r.detail->>'set_id','') <> '' and jsonb_typeof(r.detail->'stars') = 'number' then
        v_pos := array_position(v_sets, r.detail->>'set_id');
        if v_pos is null then
          v_sets := v_sets || (r.detail->>'set_id');
          v_stars := v_stars || (r.detail->>'stars')::numeric;
        else
          v_stars[v_pos] := greatest(v_stars[v_pos], (r.detail->>'stars')::numeric);
        end if;
      elsif r.activity = 'mates' and coalesce(r.detail->>'puzzle_id','') <> '' and r.detail->>'category' in ('mate1','mate2','mate3') then
        if r.detail->>'category' = 'mate1' and not (r.detail->>'puzzle_id' = any (s_m1)) then s_m1 := s_m1 || (r.detail->>'puzzle_id');
        elsif r.detail->>'category' = 'mate2' and not (r.detail->>'puzzle_id' = any (s_m2)) then s_m2 := s_m2 || (r.detail->>'puzzle_id');
        elsif r.detail->>'category' = 'mate3' and not (r.detail->>'puzzle_id' = any (s_m3)) then s_m3 := s_m3 || (r.detail->>'puzzle_id');
        end if;
      elsif r.activity = 'tactica' and coalesce(r.detail->>'puzzle_id','') <> '' then
        if not (r.detail->>'puzzle_id' = any (s_tac)) then s_tac := s_tac || (r.detail->>'puzzle_id'); end if;
      elsif r.activity = 'concentracion' and coalesce(r.detail->>'nivel','') <> '' and coalesce(r.detail->>'ejercicio','') <> '' then
        if not ((r.detail->>'nivel') || '/' || (r.detail->>'ejercicio') = any (s_con)) then
          s_con := s_con || ((r.detail->>'nivel') || '/' || (r.detail->>'ejercicio'));
        end if;
      end if;
    end loop;

    puzzles := coalesce(array_length(s_puzzles,1),0);
    lecciones := coalesce(array_length(s_lessons,1),0);
    mejor_coord := v_coord::int;
    practicar_series := coalesce(array_length(v_sets,1),0);
    select coalesce(sum(x),0)::int into practicar_estrellas from unnest(v_stars) x;
    mate1 := coalesce(array_length(s_m1,1),0);
    mate2 := coalesce(array_length(s_m2,1),0);
    mate3 := coalesce(array_length(s_m3,1),0);
    tactica := coalesce(array_length(s_tac,1),0);
    concentracion := coalesce(array_length(s_con,1),0);
    cursos_temas := coalesce(array_length(s_cur,1),0);
    return next;
  end loop;
end;
$$;