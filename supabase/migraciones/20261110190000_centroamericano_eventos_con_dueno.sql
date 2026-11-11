-- Cada evento de la Mesa del árbitro tiene dueño.
--
-- La versión del Centroamericano de la Mesa del árbitro se armó para UN evento:
-- todas sus políticas decían solo «tiene la licencia mesa-arbitro», así que
-- cualquiera con esa licencia —un organizador cualquiera, o un árbitro al que
-- se la dieran (ver «Las cuentas de árbitro»)— veía los torneos, los enlaces de
-- los árbitros, lo anotado, los avisos y el Fair Play de todos los eventos,
-- podía archivar el evento de otro y, con centroamericano_torneos_agregar(),
-- quitarle un torneo (su on conflict cambiaba el evento). Lo pidió el dueño
-- (10/11/2026) para poder ofrecer la herramienta a cualquier organizador.
--
-- Lo que cambia:
--
-- 1. centroamericano_eventos (cada evento con su dueño) y
--    centroamericano_evento_equipo (los colegas que trabajan en él). Sin
--    política de escritura; con la bitácora. Los dos eventos que ya existían
--    («Centroamericano 2026» y «Blitz») quedan de administración, con equipo
--    = quien hoy tiene una licencia PROPIA de mesa-arbitro o de «todas»: así
--    nadie pierde lo que hoy ve.
-- 2. «Mis eventos» lo dice la base: interno.ca_mis_eventos() (administración
--    y la clave de servicio, todos; los demás, con la licencia, los que son
--    suyos o de su equipo), y de ahí ca_mis_tnr(), ca_mis_asignaciones() y
--    ca_puede_tnr(). Cada política de una tabla de un evento arma el conjunto
--    una vez (`tnr in (select interno.ca_mis_tnr())`), nunca fila por fila.
-- 3. Lo que hoy es UNO SOLO para todo (Fair Play y su modelo, la
--    transmisión, el Drive, LiveChess, la copia de seguridad, el inicio de
--    ronda, los enlaces de los encargados) queda para «la casa»:
--    interno.ca_casa() = administración o quien está en el equipo de un
--    evento de administración. Partirlo por evento es el paso siguiente; hasta
--    entonces un organizador de afuera tiene su evento, sus árbitros y lo que
--    anotan, sin Fair Play ni transmisión. interno.fp_puede(), por donde pasa
--    todo Fair Play, ahora pregunta eso.
-- 4. Las funciones de la organización que decidían solas (actividad, hojas,
--    quitar un enlace, reabrir labores, renombrar un torneo, archivar un
--    evento, agregar torneos) miran que el torneo, el enlace o el evento sean
--    suyos. Agregar torneos crea el evento a nombre de quien lo crea, no deja
--    ampliar el evento de otro con el mismo nombre y no deja tomar un torneo
--    que ya está en un evento ajeno.
--
-- Las Edge Functions de la organización (centroamericano-clave,
-- -fair-play, -transmision, -mesas-vivo) y la del árbitro (centroamericano-mesa,
-- «¿Dónde juega?» solo de su evento) se cambian en el mismo PR.
-- Ver «Cada evento de la Mesa del árbitro tiene dueño» en
-- docs/decisiones/juegos-y-torneos.md.

-- ---------------------------------------------------------------- 1. los eventos y su equipo
create table public.centroamericano_eventos (
  evento text primary key check (length(btrim(evento)) between 1 and 80),
  dueno_id uuid references public.profiles(id) on delete set null,
  creado_en timestamptz not null default now()
);
comment on table public.centroamericano_eventos is
  'Cada evento de la Mesa del árbitro con su dueño (quien lo creó). Lo crea centroamericano_torneos_agregar(); sin política de escritura.';
create index centroamericano_eventos_dueno_idx on public.centroamericano_eventos (dueno_id);

create table public.centroamericano_evento_equipo (
  evento text not null references public.centroamericano_eventos(evento) on update cascade on delete cascade,
  persona_id uuid not null references public.profiles(id) on delete cascade,
  agregado_por uuid references public.profiles(id) on delete set null,
  agregado_en timestamptz not null default now(),
  primary key (evento, persona_id)
);
comment on table public.centroamericano_evento_equipo is
  'Los colegas de cada evento de la Mesa del árbitro: ven y trabajan el evento como su dueño (con la licencia). Sin política de escritura.';
create index centroamericano_evento_equipo_persona_idx on public.centroamericano_evento_equipo (persona_id);

insert into public.centroamericano_eventos (evento, dueno_id)
select distinct t.evento, (select p.id from public.profiles p where p.is_admin order by p.created_at limit 1)
  from public.centroamericano_torneos t
 where t.evento is not null
on conflict do nothing;

insert into public.centroamericano_evento_equipo (evento, persona_id)
select e.evento, l.persona_id
  from public.centroamericano_eventos e
 cross join (select distinct l.persona_id
               from public.licencias_herramientas l
               join public.profiles p on p.id = l.persona_id
              where l.herramienta in ('mesa-arbitro', 'todas') and l.otorgada_por is null and not l.revocada
                and l.activada_en is not null and (l.vence is null or l.vence > now())
                and not coalesce(p.is_admin, false)) l
on conflict do nothing;

alter table public.centroamericano_torneos
  add constraint centroamericano_torneos_evento_fk foreign key (evento)
  references public.centroamericano_eventos(evento) on update cascade;

-- ---------------------------------------------------------------- 2. mis eventos
create or replace function interno.ca_mis_eventos()
 returns setof text
 language sql
 stable security definer
 set search_path to ''
as $function$
  with yo as (
    select (select auth.uid()) uid,
           coalesce((select auth.jwt() ->> 'role'), '') = 'service_role' or coalesce(public.soy_admin(), false) todo,
           coalesce(public.tengo_herramienta('mesa-arbitro'), false) licencia
  )
  select e.evento
    from public.centroamericano_eventos e, yo
   where yo.todo
      or (yo.licencia and (e.dueno_id = yo.uid
          or exists (select 1 from public.centroamericano_evento_equipo q where q.evento = e.evento and q.persona_id = yo.uid)));
$function$;

create or replace function interno.ca_mis_tnr()
 returns setof text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select t.tnr from public.centroamericano_torneos t where t.evento in (select interno.ca_mis_eventos());
$function$;

create or replace function interno.ca_mis_asignaciones()
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select a.id from public.centroamericano_asignaciones a where a.tnr in (select interno.ca_mis_tnr());
$function$;

create or replace function interno.ca_puede_tnr(p_tnr text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(p_tnr in (select interno.ca_mis_tnr()), false);
$function$;

-- La casa: lo que hoy es uno solo para todo el sitio (ver la cabecera, punto 3).
create or replace function interno.ca_casa()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(
    coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
    or coalesce(public.soy_admin(), false)
    or (coalesce(public.tengo_herramienta('mesa-arbitro'), false)
        and exists (select 1 from public.centroamericano_evento_equipo q
                      join public.centroamericano_eventos e on e.evento = q.evento
                      join public.profiles d on d.id = e.dueno_id
                     where q.persona_id = (select auth.uid()) and coalesce(d.is_admin, false))), false);
$function$;

-- Las usan las políticas: las ejecuta quien pregunta (y solo contestan sobre él).
revoke execute on function interno.ca_mis_eventos() from public, anon;
revoke execute on function interno.ca_mis_tnr() from public, anon;
revoke execute on function interno.ca_mis_asignaciones() from public, anon;
revoke execute on function interno.ca_puede_tnr(text) from public, anon;
revoke execute on function interno.ca_casa() from public, anon;
grant execute on function interno.ca_mis_eventos() to authenticated, service_role;
grant execute on function interno.ca_mis_tnr() to authenticated, service_role;
grant execute on function interno.ca_mis_asignaciones() to authenticated, service_role;
grant execute on function interno.ca_puede_tnr(text) to authenticated, service_role;
grant execute on function interno.ca_casa() to authenticated, service_role;

-- Fair Play entero pasa por acá: ahora es de la casa.
create or replace function interno.fp_puede()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((select interno.ca_casa()), false);
$function$;

-- Para la página y las Edge Functions de la organización.
create or replace function public.centroamericano_soy_casa()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((select interno.ca_casa()), false);
$function$;
revoke execute on function public.centroamericano_soy_casa() from public, anon;
grant execute on function public.centroamericano_soy_casa() to authenticated, service_role;

create or replace function public.centroamericano_mis_eventos()
 returns table (evento text, soy_dueno boolean, dueno text, equipo integer, torneos integer, archivado boolean)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select e.evento, e.dueno_id = (select auth.uid()), d.full_name,
         (select count(*)::int from public.centroamericano_evento_equipo q where q.evento = e.evento),
         (select count(*)::int from public.centroamericano_torneos t where t.evento = e.evento and not t.prueba),
         coalesce((select bool_and(t.archivado) from public.centroamericano_torneos t where t.evento = e.evento and not t.prueba), false)
    from public.centroamericano_eventos e
    left join public.profiles d on d.id = e.dueno_id
   where e.evento in (select interno.ca_mis_eventos())
   order by e.creado_en desc;
$function$;
revoke execute on function public.centroamericano_mis_eventos() from public, anon;
grant execute on function public.centroamericano_mis_eventos() to authenticated, service_role;

-- Los eventos y su equipo: se leen solo los propios.
alter table public.centroamericano_eventos enable row level security;
alter table public.centroamericano_evento_equipo enable row level security;
revoke all on public.centroamericano_eventos from public, anon, authenticated;
revoke all on public.centroamericano_evento_equipo from public, anon, authenticated;
grant select on public.centroamericano_eventos to authenticated;
grant select on public.centroamericano_evento_equipo to authenticated;
create policy centroamericano_eventos_ver on public.centroamericano_eventos
  for select to authenticated using (evento in (select interno.ca_mis_eventos()));
create policy centroamericano_evento_equipo_ver on public.centroamericano_evento_equipo
  for select to authenticated using (persona_id = (select auth.uid()) or evento in (select interno.ca_mis_eventos()));
create trigger auditar after insert or update or delete on public.centroamericano_eventos
  for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.centroamericano_evento_equipo
  for each row execute function interno.auditar();

-- ---------------------------------------------------------------- 3. las políticas
-- De un torneo de mis eventos.
drop policy centroamericano_torneos_ver on public.centroamericano_torneos;
create policy centroamericano_torneos_ver on public.centroamericano_torneos
  for select to authenticated using (tnr in (select interno.ca_mis_tnr()));

drop policy centroamericano_asignaciones_ver on public.centroamericano_asignaciones;
drop policy centroamericano_asignaciones_apagar on public.centroamericano_asignaciones;
drop policy centroamericano_asignaciones_crear on public.centroamericano_asignaciones;
create policy centroamericano_asignaciones_ver on public.centroamericano_asignaciones
  for select to authenticated using (tnr in (select interno.ca_mis_tnr()));
create policy centroamericano_asignaciones_apagar on public.centroamericano_asignaciones
  for update to authenticated using (tnr in (select interno.ca_mis_tnr())) with check (tnr in (select interno.ca_mis_tnr()));
create policy centroamericano_asignaciones_crear on public.centroamericano_asignaciones
  for insert to authenticated with check (creada_por = (select auth.uid()) and tnr in (select interno.ca_mis_tnr()));

drop policy centroamericano_registro_ver on public.centroamericano_registro;
create policy centroamericano_registro_ver on public.centroamericano_registro
  for select to authenticated using (tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_presencia_ver on public.centroamericano_presencia;
create policy centroamericano_presencia_ver on public.centroamericano_presencia
  for select to authenticated using (tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_planillas_ver on public.centroamericano_planillas;
create policy centroamericano_planillas_ver on public.centroamericano_planillas
  for select to authenticated using (tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_salidas_ver on public.centroamericano_salidas;
create policy centroamericano_salidas_ver on public.centroamericano_salidas
  for select to authenticated using (tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_tiempos_ver on public.centroamericano_tiempos;
create policy centroamericano_tiempos_ver on public.centroamericano_tiempos
  for select to authenticated using (tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_inicios_torneo_ver on public.centroamericano_inicios_torneo;
create policy centroamericano_inicios_torneo_ver on public.centroamericano_inicios_torneo
  for select to authenticated using (tnr in (select interno.ca_mis_tnr()));

-- De un enlace de árbitro de mis eventos.
drop policy centroamericano_avisos_ver on public.centroamericano_avisos;
drop policy centroamericano_avisos_atender on public.centroamericano_avisos;
drop policy centroamericano_avisos_enviar on public.centroamericano_avisos;
create policy centroamericano_avisos_ver on public.centroamericano_avisos
  for select to authenticated using (asignacion_id in (select interno.ca_mis_asignaciones()));
create policy centroamericano_avisos_atender on public.centroamericano_avisos
  for update to authenticated
  using (de = 'arbitro' and asignacion_id in (select interno.ca_mis_asignaciones()))
  with check (de = 'arbitro' and asignacion_id in (select interno.ca_mis_asignaciones()));
create policy centroamericano_avisos_enviar on public.centroamericano_avisos
  for insert to authenticated
  with check (de = 'organizacion' and creado_por = (select auth.uid()) and asignacion_id in (select interno.ca_mis_asignaciones()));
drop policy centroamericano_finales_ver on public.centroamericano_finales;
drop policy centroamericano_finales_reabrir on public.centroamericano_finales;
create policy centroamericano_finales_ver on public.centroamericano_finales
  for select to authenticated using (asignacion_id in (select interno.ca_mis_asignaciones()));
create policy centroamericano_finales_reabrir on public.centroamericano_finales
  for update to authenticated
  using (asignacion_id in (select interno.ca_mis_asignaciones())) with check (asignacion_id in (select interno.ca_mis_asignaciones()));
drop policy centroamericano_listas_ver on public.centroamericano_listas;
create policy centroamericano_listas_ver on public.centroamericano_listas
  for select to authenticated using (asignacion_id in (select interno.ca_mis_asignaciones()));
drop policy centroamericano_progreso_ver on public.centroamericano_progreso;
create policy centroamericano_progreso_ver on public.centroamericano_progreso
  for select to authenticated using (asignacion_id in (select interno.ca_mis_asignaciones()));

-- Fair Play: de la casa, y del torneo.
drop policy centroamericano_fair_play_ver on public.centroamericano_fair_play;
create policy centroamericano_fair_play_ver on public.centroamericano_fair_play
  for select to authenticated using ((select interno.ca_casa()) and tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_fp_analisis_ver on public.centroamericano_fp_analisis;
create policy centroamericano_fp_analisis_ver on public.centroamericano_fp_analisis
  for select to authenticated using ((select interno.ca_casa()) and tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_fp_indice_ver on public.centroamericano_fp_indice;
create policy centroamericano_fp_indice_ver on public.centroamericano_fp_indice
  for select to authenticated using ((select interno.ca_casa()) and tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_fp_jugadas_ver on public.centroamericano_fp_jugadas;
create policy centroamericano_fp_jugadas_ver on public.centroamericano_fp_jugadas
  for select to authenticated using ((select interno.ca_casa()) and tnr in (select interno.ca_mis_tnr()));
drop policy centroamericano_fp_partidas_ver on public.centroamericano_fp_partidas;
create policy centroamericano_fp_partidas_ver on public.centroamericano_fp_partidas
  for select to authenticated using ((select interno.ca_casa()) and tnr in (select interno.ca_mis_tnr()));

-- Lo que es uno solo para todo: de la casa.
drop policy centroamericano_fp_modelo_ver on public.centroamericano_fp_modelo;
create policy centroamericano_fp_modelo_ver on public.centroamericano_fp_modelo
  for select to authenticated using ((select interno.ca_casa()));
drop policy centroamericano_fp_referencia_ver on public.centroamericano_fp_referencia;
create policy centroamericano_fp_referencia_ver on public.centroamericano_fp_referencia
  for select to authenticated using ((select interno.ca_casa()));
drop policy centroamericano_copias_ver on public.centroamericano_copias;
create policy centroamericano_copias_ver on public.centroamericano_copias
  for select to authenticated using ((select interno.ca_casa()));
drop policy centroamericano_inicios_ronda_ver on public.centroamericano_inicios_ronda;
create policy centroamericano_inicios_ronda_ver on public.centroamericano_inicios_ronda
  for select to authenticated using ((select interno.ca_casa()));
drop policy centroamericano_fp_enlaces_ver on public.centroamericano_fp_enlaces;
drop policy centroamericano_fp_enlaces_cambiar on public.centroamericano_fp_enlaces;
drop policy centroamericano_fp_enlaces_crear on public.centroamericano_fp_enlaces;
create policy centroamericano_fp_enlaces_ver on public.centroamericano_fp_enlaces
  for select to authenticated using ((select interno.ca_casa()));
create policy centroamericano_fp_enlaces_cambiar on public.centroamericano_fp_enlaces
  for update to authenticated using ((select interno.ca_casa())) with check ((select interno.ca_casa()));
create policy centroamericano_fp_enlaces_crear on public.centroamericano_fp_enlaces
  for insert to authenticated with check (creada_por = (select auth.uid()) and (select interno.ca_casa()));
drop policy centroamericano_tx_enlaces_ver on public.centroamericano_tx_enlaces;
drop policy centroamericano_tx_enlaces_cambiar on public.centroamericano_tx_enlaces;
drop policy centroamericano_tx_enlaces_crear on public.centroamericano_tx_enlaces;
create policy centroamericano_tx_enlaces_ver on public.centroamericano_tx_enlaces
  for select to authenticated using ((select interno.ca_casa()));
create policy centroamericano_tx_enlaces_cambiar on public.centroamericano_tx_enlaces
  for update to authenticated using ((select interno.ca_casa())) with check ((select interno.ca_casa()));
create policy centroamericano_tx_enlaces_crear on public.centroamericano_tx_enlaces
  for insert to authenticated with check (creada_por = (select auth.uid()) and (select interno.ca_casa()));

-- ---------------------------------------------------------------- 4. las funciones que decidían solas
create or replace function public.centroamericano_actividad(p_tnr text default null, p_desde timestamptz default null, p_limite integer default 600)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cuando', e.cuando, 'tnr', e.tnr, 'torneo', coalesce(t.nombre, e.tnr), 'arbitro', e.arbitro,
      'ronda', e.ronda, 'mesa', e.mesa, 'tipo', e.tipo, 'detalle', e.detalle) order by e.cuando desc)
    from (
      select * from (
        -- lo que ya estaba en la bitácora
        select r.ocurrio as cuando, r.tnr, r.arbitro, r.ronda, r.mesa,
               case when r.tipo = 'nota' and r.articulo = 'Levantó' then 'levanto' else r.tipo end,
               case r.tipo
                 when 'resultado' then coalesce(r.jugador, '') || ' → ' || coalesce(r.resultado, '')
                 when 'correccion' then coalesce(r.jugador, '') || ' → ' || coalesce(r.resultado, '') || coalesce(' (antes ' || r.anterior || ')', '')
                 when 'ilegal' then coalesce(r.jugador, '') || ' (' || coalesce(r.color, '') || ')' || case when r.texto <> '' then ': ' || r.texto else '' end
                 when 'irregularidad' then coalesce(r.jugador, '') || ' (' || coalesce(r.color, '') || ')' || case when r.texto <> '' then ': ' || r.texto else '' end
                 when 'anulacion' then 'anuló una anotación de ' || coalesce(r.jugador, '')
                 when 'nota' then case when r.articulo = 'Levantó' then coalesce(r.jugador, '') || ' (' || coalesce(r.color, '') || ') se levantó de la mesa' else r.texto end
                 else r.texto end as detalle
          from public.centroamericano_registro r
        union all
        select p.marcada, p.tnr, p.arbitro, p.ronda, p.mesa, 'presencia',
               coalesce(p.jugador, '') || ' (' || p.color || '): ' || case when p.presente then 'llegó' else 'no ha llegado' end
          from public.centroamericano_presencia p
        union all
        select p.subida, p.tnr, p.arbitro, p.ronda, p.mesa, 'planilla',
               'Foto de las planillas' || case when p.drive_ok then ' (ya está en el Drive)' else ' (todavía no pasa al Drive)' end
          from public.centroamericano_planillas p
        union all
        select l.aprobada_en, a.tnr, a.arbitro, l.ronda, null::integer, 'lista',
               'Aprobó el paso «' || l.paso || '» de la revisión previa'
          from public.centroamericano_listas l join public.centroamericano_asignaciones a on a.id = l.asignacion_id
        union all
        select f.finalizada_en, a.tnr, a.arbitro, f.ronda, null::integer, 'finalizo', 'Finalizó la ronda ' || f.ronda
          from public.centroamericano_finales f join public.centroamericano_asignaciones a on a.id = f.asignacion_id
        union all
        select v.creado, a.tnr, a.arbitro, v.ronda, v.mesa,
               case v.tipo when 'termino' then 'termino' else 'ayuda' end,
               case v.tipo when 'termino' then 'Terminó sus mesas' else 'Pidió ayuda' || case when v.texto <> '' then ': ' || v.texto else '' end end
          from public.centroamericano_avisos v join public.centroamericano_asignaciones a on a.id = v.asignacion_id
         where v.de = 'arbitro' and v.tipo in ('ayuda', 'termino')
        union all
        select a.concluyo_en, a.tnr, a.arbitro, null::integer, null::integer, 'concluyo', 'Concluyó sus labores: ya no puede anotar ni guardar'
          from public.centroamericano_asignaciones a
         where a.concluyo_en is not null
        union all
        select i.inicio, i.tnr, i.arbitro, i.ronda, null::integer, 'inicio',
               'Inició la ronda ' || i.ronda || ' en su categoría: desde ahí corre el tiempo de espera'
          from public.centroamericano_inicios_torneo i
        union all
        select s.salio, s.tnr, s.arbitro, null::integer, null::integer, 'salida',
               'Salió de la pantalla (' || case s.motivo when 'oculta' then 'cambió de pestaña o de aplicación' when 'pantalla_completa' then 'salió de la pantalla completa' else 'perdió el foco' end || ')'
               || case when s.volvio is null then ': sigue fuera' else ': volvió a los ' || coalesce(s.segundos, 0) || ' s' end
          from public.centroamericano_salidas s
        union all
        select v.leido_en, a.tnr, a.arbitro, v.ronda, v.mesa, 'leyo', 'Leyó el aviso de la organización: «' || left(v.texto, 120) || '»'
          from public.centroamericano_avisos v join public.centroamericano_asignaciones a on a.id = v.asignacion_id
         where v.de = 'organizacion' and v.leido_en is not null
      ) u
      where u.cuando is not null
        and (p_tnr is null or p_tnr = '' or u.tnr = p_tnr)
        and u.tnr in (select interno.ca_mis_tnr())
        and (p_desde is null or u.cuando >= p_desde)
      order by u.cuando desc
      limit least(greatest(coalesce(p_limite, 600), 1), 2000)
    ) e
    left join public.centroamericano_torneos t on t.tnr = e.tnr
  ), '[]'::jsonb);
end;
$$;

create or replace function public.centroamericano_hojas()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'asignacion', a.id, 'arbitro', a.arbitro, 'tnr', a.tnr, 'torneo', t.nombre, 'categoria', t.categoria, 'rama', t.rama,
      'mesa_desde', a.mesa_desde, 'mesa_hasta', a.mesa_hasta, 'ronda', l.ronda, 'leida', l.leida,
      'mesas', (select coalesce(jsonb_agg(m order by (m->>'mesa')::int), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(l.mesas, '[]'::jsonb)) m
                 where (m->>'mesa')::int between a.mesa_desde and a.mesa_hasta)
    ) order by t.nombre, a.mesa_desde)
    from public.centroamericano_asignaciones a
    join public.centroamericano_torneos t on t.tnr = a.tnr
    left join public.centroamericano_lecturas l on l.tnr = a.tnr and l.ronda > 0
   where not a.revocada and a.vence > now()
     and a.tnr in (select interno.ca_mis_tnr())
  ), '[]'::jsonb);
end;
$$;

create or replace function public.centroamericano_copia_manual()
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select interno.ca_casa()), false) then
    raise exception 'Esto es de la organización del Centroamericano: tu cuenta no lo tiene' using errcode = '42501';
  end if;
  return interno.centroamericano_hacer_copia('m', true);
end;
$$;

create or replace function public.centroamericano_inicio_ronda(p_ronda integer, p_prueba boolean, p_inicio timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select interno.ca_casa()), false) then
    raise exception 'Esto es de la organización del Centroamericano: tu cuenta no lo tiene' using errcode = '42501';
  end if;
  if p_ronda is null or p_ronda < 1 or p_ronda > 99 then
    raise exception 'La ronda no es válida' using errcode = '22023';
  end if;
  if p_inicio is null then
    delete from public.centroamericano_inicios_ronda where ronda = p_ronda and prueba = coalesce(p_prueba, false);
    return jsonb_build_object('ronda', p_ronda, 'inicio', null);
  end if;
  if p_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede ser del futuro' using errcode = '22023';
  end if;
  if p_inicio < now() - interval '24 hours' then
    raise exception 'La hora de inicio tiene que ser de las últimas 24 horas' using errcode = '22023';
  end if;
  insert into public.centroamericano_inicios_ronda (ronda, prueba, inicio, puesto_en)
  values (p_ronda, coalesce(p_prueba, false), p_inicio, now())
  on conflict (ronda, prueba) do update set inicio = excluded.inicio, puesto_en = now();
  return jsonb_build_object('ronda', p_ronda, 'inicio', p_inicio);
end;
$$;

create or replace function public.centroamericano_restaurar(p_copia jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := (select auth.uid());
  v_a integer; v_r integer; v_v integer; v_p integer; v_f integer; v_l integer; v_n integer; v_s integer; v_t integer;
begin
  if not coalesce((select interno.ca_casa()), false) then
    raise exception 'Esto es de la organización del Centroamericano: tu cuenta no lo tiene' using errcode = '42501';
  end if;
  if p_copia is null or jsonb_typeof(p_copia) <> 'object' or (p_copia->>'version') is distinct from '1' or p_copia->>'evento' is distinct from 'Centroamericano 2026' then
    raise exception 'Ese archivo no es una copia del Centroamericano 2026' using errcode = '22023';
  end if;

  insert into public.centroamericano_asignaciones (id, token, tnr, arbitro, nombrado, persona, mesa_desde, mesa_hasta, vence, revocada, creada_por, creada, ultimo_uso)
  select r.id, r.token, r.tnr, r.arbitro, r.nombrado, r.persona, r.mesa_desde, r.mesa_hasta, r.vence, r.revocada, v_yo, r.creada, r.ultimo_uso
    from jsonb_populate_recordset(null::public.centroamericano_asignaciones, p_copia->'asignaciones') r
  on conflict do nothing;
  get diagnostics v_a = row_count;

  insert into public.centroamericano_registro (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, tipo, resultado, anterior, articulo, texto, enviado, anula)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.tipo, r.resultado, r.anterior, r.articulo, r.texto, r.enviado, null
    from jsonb_populate_recordset(null::public.centroamericano_registro, p_copia->'registro') r
   where r.anula is null
  on conflict do nothing;
  get diagnostics v_r = row_count;
  insert into public.centroamericano_registro (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, tipo, resultado, anterior, articulo, texto, enviado, anula)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.tipo, r.resultado, r.anterior, r.articulo, r.texto, r.enviado, r.anula
    from jsonb_populate_recordset(null::public.centroamericano_registro, p_copia->'registro') r
   where r.anula is not null
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_r := v_r + v_n;

  insert into public.centroamericano_avisos (id, creado, de, asignacion_id, mesa, texto, estado, atendido_en, leido_en, creado_por, tipo, ronda)
  select r.id, r.creado, r.de, r.asignacion_id, r.mesa, r.texto, r.estado, r.atendido_en, r.leido_en, v_yo, r.tipo, r.ronda
    from jsonb_populate_recordset(null::public.centroamericano_avisos, p_copia->'avisos') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_v = row_count;

  insert into public.centroamericano_progreso (asignacion_id, ronda, total, con_resultado, pendientes, actualizado)
  select r.asignacion_id, r.ronda, r.total, r.con_resultado, r.pendientes, r.actualizado
    from jsonb_populate_recordset(null::public.centroamericano_progreso, p_copia->'progreso') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_p = row_count;

  insert into public.centroamericano_finales (id, asignacion_id, ronda, finalizada_en, revision, reabierta)
  select r.id, r.asignacion_id, r.ronda, r.finalizada_en, r.revision, r.reabierta
    from jsonb_populate_recordset(null::public.centroamericano_finales, p_copia->'finales') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_f = row_count;

  insert into public.centroamericano_planillas (id, asignacion_id, arbitro, tnr, ronda, mesa, lado, jugador, rival, ruta, subida, bytes, drive_ok, drive_en, drive_error)
  select r.id, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.lado, r.jugador, r.rival, r.ruta, r.subida, r.bytes, r.drive_ok, r.drive_en, r.drive_error
    from jsonb_populate_recordset(null::public.centroamericano_planillas, p_copia->'planillas') r
  on conflict do nothing;
  get diagnostics v_l = row_count;

  insert into public.centroamericano_presencia (id, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, presente, marcada)
  select r.id, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.presente, r.marcada
    from jsonb_populate_recordset(null::public.centroamericano_presencia, p_copia->'presencia') r
  on conflict do nothing;
  get diagnostics v_s = row_count;

  insert into public.centroamericano_tiempos (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, blancas, negras, jugada, j_blancas, j_negras, turno, t_blancas, t_negras, nota)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.blancas, r.negras, r.jugada, r.j_blancas, r.j_negras, r.turno, r.t_blancas, r.t_negras, r.nota
    from jsonb_populate_recordset(null::public.centroamericano_tiempos, p_copia->'tiempos') r
  on conflict do nothing;
  get diagnostics v_t = row_count;

  return jsonb_build_object('asignaciones', v_a, 'registro', v_r, 'avisos', v_v, 'progreso', v_p, 'finales', v_f, 'planillas', v_l, 'presencia', v_s, 'tiempos', v_t);
end;
$$;

create or replace function public.centroamericano_quitar_enlace(p_id uuid, p_borrar boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
  v_reg int; v_tie int; v_pre int; v_pla int;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if not exists (select 1 from public.centroamericano_asignaciones x where x.id = p_id and x.tnr in (select interno.ca_mis_tnr())) then
    raise exception 'Ese enlace no es de tus eventos' using errcode = '42501';
  end if;
  select id, arbitro, tnr into v_a from public.centroamericano_asignaciones where id = p_id;
  if not found then raise exception 'Ese enlace ya no existe' using errcode = 'P0002'; end if;
  select count(*) into v_reg from public.centroamericano_registro where asignacion_id = p_id;
  select count(*) into v_tie from public.centroamericano_tiempos where asignacion_id = p_id;
  select count(*) into v_pre from public.centroamericano_presencia where asignacion_id = p_id;
  select count(*) into v_pla from public.centroamericano_planillas where asignacion_id = p_id;
  if coalesce(p_borrar, false) then
    delete from public.centroamericano_asignaciones where id = p_id;
  end if;
  return jsonb_build_object('arbitro', v_a.arbitro, 'tnr', v_a.tnr, 'borrado', coalesce(p_borrar, false),
    'anotaciones', v_reg, 'tiempos', v_tie, 'presencia', v_pre, 'planillas', v_pla);
end;
$$;

create or replace function public.centroamericano_reabrir_labores(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_persona uuid; v_arbitro text; v_n integer;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if not exists (select 1 from public.centroamericano_asignaciones x where x.id = p_id and x.tnr in (select interno.ca_mis_tnr())) then
    raise exception 'Ese enlace no es de tus eventos' using errcode = '42501';
  end if;
  select persona, arbitro into v_persona, v_arbitro from public.centroamericano_asignaciones where id = p_id;
  if not found then raise exception 'Ese enlace ya no existe' using errcode = 'P0002'; end if;
  update public.centroamericano_asignaciones set concluyo_en = null
   where concluyo_en is not null and (id = p_id or (v_persona is not null and persona = v_persona))
     and tnr in (select interno.ca_mis_tnr());
  get diagnostics v_n = row_count;
  return jsonb_build_object('arbitro', v_arbitro, 'reabiertos', v_n);
end;
$$;

create or replace function public.centroamericano_torneo_renombrar(p_tnr text, p_nombre text, p_categoria text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_cat text := nullif(btrim(coalesce(p_categoria, '')), '');
  v_ritmo text;
  v_dice text;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Hace falta la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if not coalesce(interno.ca_puede_tnr(p_tnr), false) then
    raise exception 'Ese torneo no es de tus eventos' using errcode = '42501';
  end if;
  if length(v_nombre) not between 1 and 80 then
    raise exception 'El nombre tiene que tener entre 1 y 80 caracteres' using errcode = '22023';
  end if;
  if v_cat is not null and length(v_cat) > 40 then
    raise exception 'La categoría puede tener hasta 40 caracteres' using errcode = '22023';
  end if;
  select coalesce(t.ritmo, 'clasico') into v_ritmo from public.centroamericano_torneos t where t.tnr = p_tnr;
  if not found then
    raise exception 'No existe ese torneo' using errcode = 'P0002';
  end if;
  v_dice := case when v_nombre ~* '\mblitz\M' then 'blitz'
                 when v_nombre ~* '\mr[aá]pid[oa]s?\M' or v_nombre ~* '\mrapid\M' then 'rapido'
                 else 'clasico' end;
  if v_dice <> v_ritmo then
    raise exception 'El nombre de un torneo % tiene que seguir diciéndolo (la tablet del árbitro lo reconoce por el nombre)',
      case v_ritmo when 'blitz' then 'Blitz' when 'rapido' then 'Rápido' else 'Clásico (sin «Blitz» ni «Rápido»)' end using errcode = '22023';
  end if;
  update public.centroamericano_torneos set nombre = v_nombre, categoria = coalesce(v_cat, categoria) where tnr = p_tnr;
end;
$$;

create or replace function public.centroamericano_evento_archivar(p_evento text, p_archivar boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Hace falta la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if not coalesce(p_evento in (select interno.ca_mis_eventos()), false) then
    raise exception 'Ese evento no es tuyo' using errcode = '42501';
  end if;
  update public.centroamericano_torneos t set archivado = coalesce(p_archivar, true)
   where t.evento = p_evento and not t.prueba and t.archivado is distinct from coalesce(p_archivar, true);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.centroamericano_torneos_agregar(p_evento text, p_torneos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_orden integer;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Hace falta la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_evento, ''))) not between 1 and 80 then raise exception 'Falta el nombre del evento' using errcode = '22023'; end if;
  if jsonb_typeof(p_torneos) <> 'array' or jsonb_array_length(p_torneos) not between 1 and 60 then
    raise exception 'Hace falta entre 1 y 60 torneos' using errcode = '22023';
  end if;
  -- El evento es de quien lo crea; uno que ya existe solo lo amplía su dueño o su equipo (ver «Cada evento de la Mesa del árbitro tiene dueño»).
  if exists (select 1 from public.centroamericano_eventos e where e.evento = btrim(p_evento)) then
    if not coalesce(btrim(p_evento) in (select interno.ca_mis_eventos()), false) then
      raise exception 'Ya hay un evento con ese nombre y no es tuyo: ponle otro nombre' using errcode = '42501';
    end if;
  else
    insert into public.centroamericano_eventos (evento, dueno_id) values (btrim(p_evento), (select auth.uid()));
  end if;
  if exists (select 1 from public.centroamericano_torneos t
              join jsonb_to_recordset(p_torneos) as x(tnr text) on x.tnr = t.tnr
             where not coalesce(t.evento in (select interno.ca_mis_eventos()), false)) then
    raise exception 'Uno de esos torneos ya está en el evento de otro organizador' using errcode = '42501';
  end if;
  select coalesce(max(t.orden) filter (where not t.prueba and t.orden < 900), 0) into v_orden from public.centroamericano_torneos t;
  insert into public.centroamericano_torneos (tnr, nombre, categoria, rama, orden, evento, ritmo, menores, prueba, archivado)
  select x.tnr, left(btrim(x.nombre), 80), left(coalesce(nullif(btrim(x.categoria), ''), 'Abierto'), 40),
         case when x.rama in ('Absoluto', 'Femenino', 'Mixto') then x.rama else 'Absoluto' end,
         v_orden + x.n::integer, btrim(p_evento),
         case when x.ritmo in ('clasico', 'rapido', 'blitz') then x.ritmo else 'clasico' end, x.menores, false, false
    from rows from (jsonb_to_recordset(p_torneos) as (tnr text, nombre text, categoria text, rama text, ritmo text, menores boolean))
         with ordinality as x(tnr, nombre, categoria, rama, ritmo, menores, n)
   where x.tnr ~ '^[0-9]{1,7}$' and length(btrim(coalesce(x.nombre, ''))) between 1 and 80
  on conflict (tnr) do update set evento = excluded.evento, nombre = excluded.nombre, categoria = excluded.categoria, rama = excluded.rama,
                                  ritmo = excluded.ritmo, menores = excluded.menores, archivado = false;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
