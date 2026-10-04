do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('class_chat_messages',              'class_chat_messages_sender_id_fkey',               'sender_id',       'cascade'),
      ('class_chat_messages',              'class_chat_messages_student_id_fkey',              'student_id',      'cascade'),
      ('game_rooms',                       'game_rooms_created_by_fkey',                       'created_by',      'cascade'),
      ('platform_activity_log',            'platform_activity_log_student_id_fkey',            'student_id',      'cascade'),
      ('practice_games',                   'practice_games_student_id_fkey',                   'student_id',      'cascade'),
      ('question_answers',                 'question_answers_student_id_fkey',                 'student_id',      'cascade'),
      ('tournament_registrations',         'tournament_registrations_player_id_fkey',          'player_id',       'cascade'),
      ('ajustes_academia',                 'ajustes_academia_actualizado_por_fkey',            'actualizado_por', 'set null'),
      ('class_sessions',                   'class_sessions_created_by_fkey',                   'created_by',      'set null'),
      ('cobros_contacto',                  'cobros_contacto_actualizado_por_fkey',             'actualizado_por', 'set null'),
      ('cobros_recordatorios_programados', 'cobros_recordatorios_programados_creado_por_fkey', 'creado_por',      'set null'),
      ('fourplayer_games',                 'fourplayer_games_created_by_fkey',                 'created_by',      'set null'),
      ('game_state',                       'game_state_updated_by_fkey',                       'updated_by',      'set null'),
      ('practice_sessions',                'practice_sessions_created_by_fkey',                'created_by',      'set null'),
      ('questions',                        'questions_created_by_fkey',                        'created_by',      'set null'),
      ('saved_games',                      'saved_games_created_by_fkey',                      'created_by',      'set null'),
      ('solicitudes_academia',             'solicitudes_academia_revisado_por_fkey',           'revisado_por',    'set null'),
      ('tournaments',                      'tournaments_created_by_fkey',                      'created_by',      'set null'),
      ('tv_settings',                      'tv_settings_updated_by_fkey',                      'updated_by',      'set null'),
      ('variant_nodes',                    'variant_nodes_created_by_fkey',                    'created_by',      'set null'),
      ('tournament_pairings',              'tournament_pairings_white_id_fkey',                'white_id',        'set null'),
      ('tournament_pairings',              'tournament_pairings_black_id_fkey',                'black_id',        'set null'),
      ('tournament_pairings',              'tournament_pairings_advance_id_fkey',              'advance_id',      'set null')
    ) as t(tabla, nombre, col, accion)
  loop
    if r.accion = 'set null' then
      execute format('alter table public.%I alter column %I drop not null', r.tabla, r.col);
    end if;
    execute format('alter table public.%I drop constraint %I', r.tabla, r.nombre);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete %s',
                   r.tabla, r.nombre, r.col, r.accion);
  end loop;
end $$;

do $$
declare n int;
begin
  select count(*) into n
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
     and c.confdeltype in ('a', 'r')
     and c.connamespace = 'public'::regnamespace;
  if n > 0 then
    raise exception 'quedan % claves foráneas a profiles/auth.users sin on delete', n;
  end if;
end $$;