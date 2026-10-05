-- Unas palabras del profe en el informe que llega a la casa, y sus plantillas.
--
-- El informe a la casa lo arma el sitio solo; lo único escrito a mano era la
-- nota del plan, que vale cuatro semanas y solo si el plan está compartido.
-- Ahora el profe puede dejar un mensaje para la casa que sale en el PRÓXIMO
-- informe de cada encargado, y lo arma a partir de frases listas según cómo
-- viene el alumno (las del sitio están en js/plantillas-casa.js; las suyas, en
-- `plantillas_casa`).
--
-- - Qué mensajes van en un informe NO se guarda: se calcula. Van los que se
--   escribieron dentro del periodo que cubre ese informe (el semanal, los de la
--   semana), así cada encargado recibe el mensaje una vez, con su frecuencia.
-- - Los cuenta una función SECURITY DEFINER, como resumen_tareas_examenes(): la
--   tanda de pg_cron, la vista previa del profesor y la de quien supervisa
--   tienen que ver EXACTAMENTE el mismo informe.
-- Ver «Unas palabras de su profe» en docs/decisiones/informes.md.

create table public.mensajes_casa (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 800),
  created_at timestamptz not null default now()
);
create index mensajes_casa_alumno on public.mensajes_casa (alumno_id, created_at desc);
create index mensajes_casa_autor on public.mensajes_casa (autor_id);

alter table public.mensajes_casa enable row level security;

-- Lo escribe quien da clase al alumno (o administración), siempre a su nombre.
create policy mensajes_casa_insert on public.mensajes_casa for insert to authenticated
  with check (autor_id = (select auth.uid())
              and ((select mp.is_admin from public.my_profile() mp)
                   or alumno_id in (select interno.alumnos_de((select auth.uid())))));
-- Lo ven quien lo escribió, los profesores del alumno, administración y el
-- propio alumno (es lo que le llega a su casa: no hay nada que esconderle).
create policy mensajes_casa_select on public.mensajes_casa for select to authenticated
  using (autor_id = (select auth.uid())
         or alumno_id = (select auth.uid())
         or (select mp.is_admin from public.my_profile() mp)
         or alumno_id in (select interno.alumnos_de((select auth.uid()))));
-- Quitarlo lo saca de los informes que todavía no salieron. Solo su autor.
create policy mensajes_casa_delete on public.mensajes_casa for delete to authenticated
  using (autor_id = (select auth.uid()));

-- La fecha la pone la base (decide en qué informe sale) y hay un tope: es un
-- mensaje para la familia, no un chat.
create or replace function interno.mensajes_casa_al_crear()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.created_at := now();
  new.texto := btrim(new.texto);
  if (select count(*) from public.mensajes_casa m
       where m.alumno_id = new.alumno_id and m.created_at > now() - interval '1 day') >= 5 then
    raise exception 'Ya hay 5 mensajes para la casa de este alumno hoy.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function interno.mensajes_casa_al_crear() from public, anon, authenticated;
create trigger mensajes_casa_al_crear before insert on public.mensajes_casa
  for each row execute function interno.mensajes_casa_al_crear();

revoke all on public.mensajes_casa from anon;
revoke update, truncate on public.mensajes_casa from authenticated;
grant select, insert, delete on public.mensajes_casa to authenticated;

-- Las plantillas propias de cada profe: solo las ve y las toca él.
create table public.plantillas_casa (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  situacion text not null check (situacion in ('bien', 'poco', 'no_entro', 'vencido', 'todas')),
  texto text not null check (char_length(btrim(texto)) between 1 and 800),
  created_at timestamptz not null default now(),
  unique (profesor_id, situacion, texto)
);
alter table public.plantillas_casa enable row level security;
create policy plantillas_casa_propias on public.plantillas_casa for all to authenticated
  using (profesor_id = (select auth.uid()))
  with check (profesor_id = (select auth.uid()));

create or replace function interno.plantillas_casa_tope()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (select count(*) from public.plantillas_casa p where p.profesor_id = new.profesor_id) >= 60 then
    raise exception 'Ya tienes 60 plantillas: borra alguna para guardar otra.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function interno.plantillas_casa_tope() from public, anon, authenticated;
create trigger plantillas_casa_tope before insert on public.plantillas_casa
  for each row execute function interno.plantillas_casa_tope();

revoke all on public.plantillas_casa from anon;
grant select, insert, update, delete on public.plantillas_casa to authenticated;

-- Los mensajes de un periodo, para el informe. Los tres últimos, en el orden
-- en que se escribieron. Mismo permiso que resumen_tareas_examenes():
-- auth.uid() nulo es la tanda (service role).
create or replace function public.mensajes_casa_de(p_alumno uuid, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_yo uuid := auth.uid();
  v_admin boolean := false;
  v_lista jsonb;
begin
  if v_yo is not null then
    select coalesce(pr.is_admin, false) into v_admin from public.profiles pr where pr.id = v_yo;
    if not coalesce(p_alumno = v_yo or v_admin or public.soy_profesor_de(p_alumno)
                    or public.supervisado_por_mi(p_alumno), false) then
      raise exception 'No puedes ver los mensajes de ese alumno.';
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('texto', x.texto, 'autor', x.autor, 'fecha', x.created_at)
                            order by x.created_at), '[]'::jsonb)
    into v_lista
    from (select m.texto, m.created_at, p.full_name as autor
            from public.mensajes_casa m
            join public.profiles p on p.id = m.autor_id
           where m.alumno_id = p_alumno and m.created_at >= p_desde and m.created_at < p_hasta
           order by m.created_at desc
           limit 3) x;
  return jsonb_build_object('mensajes', v_lista);
end $$;
revoke execute on function public.mensajes_casa_de(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.mensajes_casa_de(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- Se suma a la cola de informe_de_alumno() a partir de su definición vigente,
-- como el Elo y la comparación: no se copia a mano la función entera.
do $$
declare
  d text := pg_get_functiondef('public.informe_de_alumno(uuid, timestamptz, timestamptz)'::regprocedure);
  viejo text := '|| public.elo_de_alumno(p_alumno)';
begin
  if position(viejo in d) = 0 then
    raise exception 'informe_de_alumno() ya no termina como se esperaba';
  end if;
  if position('mensajes_casa_de' in d) = 0 then
    execute replace(d, viejo, viejo || E'\n|| public.mensajes_casa_de(p_alumno, p_desde, p_hasta)');
  end if;
end $$;
