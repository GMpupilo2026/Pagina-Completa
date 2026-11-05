-- Fair Play para todos los torneos: más partidas medidas y más señales. Ver en docs/decisiones/juegos-y-torneos.md:
-- «Las mesas sin tablero electrónico: de la foto de las planillas», «Cómo viene su Elo en FIDE», «Las rachas: el
-- motor solo en el momento decisivo», «El índice en el sorteo» y «Un torneo nuevo sin tocar código».
--
-- 1. centroamericano_torneos: el evento al que pertenece cada torneo (un evento son los torneos ligados de un mismo
--    campeonato), su ritmo (clásico, rápido o blitz), si es de menores y si ya se archivó (un evento terminado deja de
--    verse en la organización y en Fair Play, pero lo medido queda: sirve de historia y de ajuste para el siguiente).
--    La categoría deja de ser solo «Sub-8 … Sub-18»: puede ser «Abierto», «Primera», «Senior»… Las de ahora quedan en
--    el evento «Centroamericano 2026», con su ritmo y de menores.
-- 2. centroamericano_torneos_agregar(evento, torneos) y centroamericano_evento_archivar(evento, archivar): agregar los
--    torneos que abre la clave de un grupo de chess-results y archivar un evento, con la licencia de «mesa-arbitro».
--    Nada de escribir en la tabla desde afuera (como antes: no tiene política de escritura) y queda en la auditoría.
-- 3. centroamericano_fp_planillas: la partida de una mesa sin tablero electrónico leída de la foto de sus planillas
--    (las jugadas, cuáles quedaron dudosas). Solo la clave de servicio.
-- 4. centroamericano_fp_fide y centroamericano_fp_elo_fide: el ID FIDE de cada jugador (de la lista inicial de
--    chess-results) y su Elo de cada mes en FIDE (públicos los dos; la tendencia del modelo). Solo la clave de servicio.
-- 5. centroamericano_fp_analisis.fuente admite «planilla».
-- 6. centroamericano_fp_indice: la tendencia de su Elo y las rachas; centroamericano_fp_modelo_guardar las escribe.
-- 7. centroamericano_fp_rondas sin los torneos archivados.
-- 8. centroamericano_fp_candidatas: el índice del modelo de cada jugador pesa en el sorteo (desde 60, +1; desde 62,5,
--    +1,5; el tope de 4 sigue), con su motivo escrito. El resto de la función no cambia.

-- ---------------------------------------------------------------- 1. los torneos, por evento
alter table public.centroamericano_torneos drop constraint if exists centroamericano_torneos_categoria_check;
alter table public.centroamericano_torneos
  add constraint centroamericano_torneos_categoria_check check (length(categoria) between 1 and 40),
  add column evento text not null default 'Centroamericano 2026' check (length(evento) between 1 and 80),
  add column ritmo text check (ritmo in ('clasico', 'rapido', 'blitz')),
  add column menores boolean,
  add column archivado boolean not null default false;
alter table public.centroamericano_torneos alter column evento drop default;
update public.centroamericano_torneos set ritmo = case when nombre ~* 'r[aá]pid' then 'rapido' when nombre ~* 'blitz' then 'blitz' else 'clasico' end, menores = true;
comment on column public.centroamericano_torneos.evento is 'El campeonato al que pertenece (los torneos ligados de un mismo grupo de chess-results). Fair Play mide la historia de cada jugador en los eventos anteriores.';
comment on column public.centroamericano_torneos.ritmo is 'clasico, rapido o blitz: cada ritmo tiene su propio ajuste del modelo de Fair Play (el blitz va con las rápidas). Sin ritmo, se deduce del nombre.';
comment on column public.centroamericano_torneos.menores is 'Si es de menores: a un menor se le reconoce más de lo que rinde por encima de su Elo (se atrasa más). Sin dato, se deduce del nombre («Sub-12»).';
comment on column public.centroamericano_torneos.archivado is 'Evento terminado: no se ve en la organización ni en Fair Play; lo medido queda como historia y para el ajuste.';

create function public.centroamericano_torneos_agregar(p_evento text, p_torneos jsonb)
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
revoke execute on function public.centroamericano_torneos_agregar(text, jsonb) from public, anon;
grant execute on function public.centroamericano_torneos_agregar(text, jsonb) to authenticated, service_role;

create function public.centroamericano_evento_archivar(p_evento text, p_archivar boolean)
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
  update public.centroamericano_torneos t set archivado = coalesce(p_archivar, true)
   where t.evento = p_evento and not t.prueba and t.archivado is distinct from coalesce(p_archivar, true);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.centroamericano_evento_archivar(text, boolean) from public, anon;
grant execute on function public.centroamericano_evento_archivar(text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------- 3. las planillas
create table public.centroamericano_fp_planillas (
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  jugadas text[] not null check (cardinality(jugadas) between 20 and 600),
  dudosas integer[] not null default '{}',
  cargado_por text not null default '' check (length(cargado_por) <= 120),
  cargado timestamptz not null default now(),
  primary key (tnr, ronda, mesa)
);
alter table public.centroamericano_fp_planillas enable row level security;
revoke all on table public.centroamericano_fp_planillas from anon, authenticated;
comment on table public.centroamericano_fp_planillas is 'Fair Play: la partida de una mesa sin tablero electrónico, leída de la foto de sus dos planillas en la organización (las jugadas en SAN, comprobadas con chess.js en la función; dudosas: las medias jugadas, desde 0, que la lectura dejó dudosas y no se miden). Solo la clave de servicio.';

-- ---------------------------------------------------------------- 4. el Elo de cada mes en FIDE
create table public.centroamericano_fp_fide (
  tnr text not null references public.centroamericano_torneos(tnr),
  clave text not null check (length(clave) between 1 and 120),
  nombre text not null check (length(nombre) <= 120),
  fide_id text not null check (fide_id ~ '^[0-9]{3,10}$'),
  leido timestamptz not null default now(),
  primary key (tnr, clave)
);
alter table public.centroamericano_fp_fide enable row level security;
revoke all on table public.centroamericano_fp_fide from anon, authenticated;
comment on table public.centroamericano_fp_fide is 'Fair Play: el ID FIDE de cada jugador de una categoría (de la lista inicial pública de chess-results), por la clave de su nombre (interno.fp_clave). Solo la clave de servicio.';

create table public.centroamericano_fp_elo_fide (
  fide_id text primary key check (fide_id ~ '^[0-9]{3,10}$'),
  historial jsonb,
  leido timestamptz not null default now()
);
alter table public.centroamericano_fp_elo_fide enable row level security;
revoke all on table public.centroamericano_fp_elo_fide from anon, authenticated;
comment on table public.centroamericano_fp_elo_fide is 'Fair Play: el Elo de cada mes de un jugador en FIDE (su ficha pública, ratings.fide.com/profile/<id>/chart): [{periodo, std, rpd, blz}]. null: FIDE no contestó (se vuelve a probar al otro día). Para la tendencia del modelo. Solo la clave de servicio.';

-- ---------------------------------------------------------------- 5. la fuente «planilla»
alter table public.centroamericano_fp_analisis drop constraint if exists centroamericano_fp_analisis_fuente_check;
alter table public.centroamericano_fp_analisis add constraint centroamericano_fp_analisis_fuente_check check (fuente in ('lichess', 'livechess', 'planilla'));

-- ---------------------------------------------------------------- 6. la tendencia y las rachas en el índice
alter table public.centroamericano_fp_indice
  add column elo_tendencia integer,
  add column tendencia_mes numeric(5, 1),
  add column racha_largo integer,
  add column racha_log10 numeric(5, 1),
  add column crit_z numeric(5, 2),
  add column facil_z numeric(5, 2),
  add column contraste_z numeric(5, 2);
comment on column public.centroamericano_fp_indice.elo_tendencia is 'Lo que se le reconoce por cómo viene subiendo su Elo en FIDE (la pendiente de su último año por 3 meses; tope 150 a un menor y 75 a los demás; nunca negativo). Ya va sumado en elo_usado.';
comment on column public.centroamericano_fp_indice.contraste_z is 'Cuánto más alto sale en las posiciones difíciles para su nivel (crit_z) que en las fáciles (facil_z): el motor solo en el momento decisivo. Señal para explicar; no entra en el índice.';
comment on column public.centroamericano_fp_indice.racha_log10 is 'La racha más rara: racha_largo jugadas difíciles seguidas de una partida, todas la primera del motor; su probabilidad para su nivel es 10^racha_log10.';

create or replace function public.centroamericano_fp_modelo_guardar(p_juegos jsonb, p_indice jsonb, p_modelo jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  update public.centroamericano_fp_analisis an
     set m_jugadas = x.m_jugadas, m_t1 = x.m_t1, m_e_t1 = x.m_e_t1, m_dj = x.m_dj, m_e_dj = x.m_e_dj,
         m_z_t1 = x.m_z_t1, m_z_dj = x.m_z_dj, m_z_dif = x.m_z_dif, z_modelo = x.z_modelo, roi = x.roi
    from jsonb_to_recordset(coalesce(p_juegos, '[]'::jsonb)) as x(tnr text, ronda integer, mesa integer, color text, m_jugadas integer, m_t1 integer,
         m_e_t1 numeric, m_dj numeric, m_e_dj numeric, m_z_t1 numeric, m_z_dj numeric, m_z_dif numeric, z_modelo numeric, roi numeric)
   where an.tnr = x.tnr and an.ronda = x.ronda and an.mesa = x.mesa and an.color = x.color;
  get diagnostics v_n = row_count;
  delete from public.centroamericano_fp_indice i
   where i.tnr in (select distinct x.tnr from jsonb_to_recordset(coalesce(p_indice, '[]'::jsonb)) as x(tnr text));
  insert into public.centroamericano_fp_indice (tnr, clave, jugador, elo, comparado, partidas, jugadas, t1, e_t1, dj, e_dj, dificiles, t1_dif, e_t1_dif,
                                                z_t1, z_dj, z_dif, z, roi, rondas, ritmo, elo_usado, rendimiento, rendimiento_partidas,
                                                hist_partidas, hist_roi, tiempo_rho, tiempo_z, tiempo_jugadas, elo_tendencia, tendencia_mes,
                                                racha_largo, racha_log10, crit_z, facil_z, contraste_z)
  select x.tnr, left(x.clave, 120), left(coalesce(x.jugador, ''), 120), x.elo, x.comparado, x.partidas, x.jugadas, x.t1, x.e_t1, x.dj, x.e_dj,
         coalesce(x.dificiles, 0), coalesce(x.t1_dif, 0), coalesce(x.e_t1_dif, 0), x.z_t1, x.z_dj, x.z_dif, x.z, x.roi, left(coalesce(x.rondas, ''), 60),
         case when x.ritmo in ('clasico', 'rapido') then x.ritmo end, x.elo_usado, x.rendimiento, x.rendimiento_partidas,
         x.hist_partidas, x.hist_roi, x.tiempo_rho, x.tiempo_z, x.tiempo_jugadas, x.elo_tendencia, x.tendencia_mes,
         x.racha_largo, x.racha_log10, x.crit_z, x.facil_z, x.contraste_z
    from jsonb_to_recordset(coalesce(p_indice, '[]'::jsonb)) as x(tnr text, clave text, jugador text, elo integer, comparado text, partidas integer,
         jugadas integer, t1 integer, e_t1 numeric, dj numeric, e_dj numeric, dificiles integer, t1_dif integer, e_t1_dif numeric, z_t1 numeric,
         z_dj numeric, z_dif numeric, z numeric, roi numeric, rondas text, ritmo text, elo_usado integer, rendimiento integer,
         rendimiento_partidas integer, hist_partidas integer, hist_roi numeric, tiempo_rho numeric, tiempo_z numeric, tiempo_jugadas integer,
         elo_tendencia integer, tendencia_mes numeric, racha_largo integer, racha_log10 numeric, crit_z numeric, facil_z numeric, contraste_z numeric);
  if p_modelo is not null then
    insert into public.centroamericano_fp_modelo (id, a, b, c, centro, factor, movimientos, jugadores, referencia, validacion, ajustado, calculado)
    values ('actual', (p_modelo->>'a')::numeric, (p_modelo->>'b')::numeric, (p_modelo->>'c')::numeric,
            coalesce((p_modelo->>'centro')::numeric, 0), coalesce((p_modelo->>'factor')::numeric, 1),
            coalesce((p_modelo->>'movimientos')::integer, 0), coalesce((p_modelo->>'jugadores')::integer, 0),
            coalesce((p_modelo->>'referencia')::integer, 0), p_modelo->'validacion', (p_modelo->>'ajustado')::timestamptz, now())
    on conflict (id) do update set a = excluded.a, b = excluded.b, c = excluded.c, centro = excluded.centro, factor = excluded.factor,
      movimientos = excluded.movimientos, jugadores = excluded.jugadores, referencia = excluded.referencia, validacion = excluded.validacion,
      ajustado = excluded.ajustado, calculado = excluded.calculado;
  end if;
  perform public.centroamericano_fp_calibrar();
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- 7. sin los torneos archivados
create or replace function public.centroamericano_fp_rondas()
returns table (tnr text, nombre text, prueba boolean, ronda integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  return query
  with cat as (
    select t.tnr, t.nombre, coalesce(t.prueba, false) prueba,
           greatest(
             coalesce((select max(p.ronda) from public.centroamericano_progreso p join public.centroamericano_asignaciones a on a.id = p.asignacion_id where a.tnr = t.tnr), 0),
             coalesce((select l.ronda from public.centroamericano_lecturas l where l.tnr = t.tnr), 0),
             coalesce((select max(i.ronda) from public.centroamericano_inicios_torneo i where i.tnr = t.tnr), 0),
             coalesce((select max(f.ronda) from public.centroamericano_fp_partidas f where f.tnr = t.tnr), 0)) r
      from public.centroamericano_torneos t
     where not t.archivado
       and exists (select 1 from public.centroamericano_asignaciones a where a.tnr = t.tnr and not a.revocada and a.vence > now())
  )
  select c.tnr, c.nombre, c.prueba, (max(c.r) over (partition by c.prueba))::integer
    from cat c;
end;
$$;

-- ---------------------------------------------------------------- 8. el índice en el sorteo
create or replace function public.centroamericano_fp_candidatas(p_tnr text, p_ronda integer)
returns table (mesa integer, blancas text, negras text, snr_b integer, snr_n integer, elo_b integer, elo_n integer,
               peso numeric, motivos text[], aplica_blancas boolean, aplica_negras boolean, no_aplica text, excluida text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  return query
  with mesas as (
    select distinct m::integer mesa
      from public.centroamericano_asignaciones a, generate_series(a.mesa_desde, a.mesa_hasta) m
     where a.tnr = p_tnr and not a.revocada and a.vence > now()
  ),
  leida as (   -- la lectura compartida de los árbitros, si es de esta ronda (sin Elo)
    select (x->>'mesa')::integer mesa, x->>'blancas' blancas, x->>'negras' negras
      from public.centroamericano_lecturas l, jsonb_array_elements(l.mesas) x
     where l.tnr = p_tnr and l.ronda = p_ronda and (x->>'mesa') ~ '^\d+$'
  ),
  par as (
    select m.mesa,
           coalesce(nullif(p.blancas, ''), le.blancas, '') blancas, coalesce(nullif(p.negras, ''), le.negras, '') negras,
           p.snr_b, p.snr_n, p.elo_b, p.elo_n
      from mesas m
      left join public.centroamericano_fp_partidas p on p.tnr = p_tnr and p.ronda = p_ronda and p.mesa = m.mesa
      left join leida le on le.mesa = m.mesa
  ),
  reg as (     -- lo que anotan los árbitros, sin lo anulado
    select r.* from public.centroamericano_registro r
     where r.tnr = p_tnr
       and not exists (select 1 from public.centroamericano_registro an where an.tipo = 'anulacion' and an.anula = r.id)
  ),
  previas as ( -- quién le ganó a alguien con 200 o más de Elo en rondas anteriores
    select q.snr, count(*)::integer n, string_agg('ronda ' || q.ronda, ', ' order by q.ronda) rondas
      from (
        select f.ronda, f.snr_b snr from public.centroamericano_fp_partidas f
         where f.tnr = p_tnr and f.ronda < p_ronda and f.resultado ~ '^1\s*-\s*0' and f.elo_n - f.elo_b >= 200
        union all
        select f.ronda, f.snr_n from public.centroamericano_fp_partidas f
         where f.tnr = p_tnr and f.ronda < p_ronda and f.resultado ~ '^0\s*-\s*1' and f.elo_b - f.elo_n >= 200
      ) q where q.snr is not null group by q.snr
  ),
  revisados as ( -- a quién ya se revisó (o se va a revisar): el ganador anotado o, si falta, los dos de la mesa
    select fp.ronda, x.snr, x.clave
      from public.centroamericano_fair_play fp,
           lateral (
             select fp.jugador_snr snr, interno.fp_clave(fp.jugador) clave where fp.estado = 'revisada'
             union all select fp.snr_b, interno.fp_clave(fp.blancas) where fp.estado = 'aprobada' and coalesce(fp.revisar_color, 'blancas') = 'blancas'
             union all select fp.snr_n, interno.fp_clave(fp.negras) where fp.estado = 'aprobada' and coalesce(fp.revisar_color, 'negras') = 'negras'
           ) x
     where fp.tnr = p_tnr and fp.estado in ('aprobada', 'revisada') and fp.ronda <= p_ronda
  ),
  alertas as ( -- precisión muy alta en rondas anteriores, todavía sin mirar o marcada «seguir»
    select interno.fp_clave(an.jugador) clave, string_agg('ronda ' || an.ronda || ', ' || round(an.precision) || ' %', '; ' order by an.ronda) cuales
      from public.centroamericano_fp_analisis an
     where an.tnr = p_tnr and an.ronda < p_ronda and an.jugador <> ''
       and ((an.nivel <> 'normal' and an.estado = 'nueva') or an.estado = 'seguir')
     group by 1
    union all    -- o, sumadas sus partidas del torneo, muy por encima de lo esperable (con alguna todavía sin mirar)
    select ac.clave, 'sumadas sus ' || ac.partidas || ' partidas de las rondas ' || ac.rondas
      from public.centroamericano_fp_acumulado(p_tnr, p_ronda) ac
     where ac.nivel <> 'normal' and ac.sin_mirar > 0
  ),
  hallazgos as ( -- un hallazgo en una revisión anterior (sorteada o anotada a mano): pesa en los sorteos siguientes
    select x.clave, string_agg('ronda ' || x.ronda, ', ' order by x.ronda) cuales
      from (select fp.ronda, coalesce(nullif(interno.fp_clave(fp.jugador), ''), '') clave, fp.jugador_snr snr
              from public.centroamericano_fair_play fp
             where fp.tnr = p_tnr and fp.estado = 'revisada' and fp.resultado = 'hallazgo' and fp.ronda < p_ronda) x
     where x.clave <> '' group by x.clave
  ),
  indice as ( -- el índice del modelo de cada jugador, sumadas sus partidas del torneo (como FIDE: desde 60 se mira)
    select i.clave, max(i.roi) roi from public.centroamericano_fp_indice i
     where i.tnr = p_tnr and i.roi >= 60 and i.jugadas >= 30 group by i.clave
  ),
  senal as (
    select pa.*,
           (select ix.roi from indice ix where ix.clave = interno.fp_clave(pa.blancas) and pa.blancas <> '') roi_b,
           (select ix.roi from indice ix where ix.clave = interno.fp_clave(pa.negras) and pa.negras <> '') roi_n,
           (select string_agg(h.cuales, '; ') from hallazgos h where h.clave in (interno.fp_clave(pa.blancas), interno.fp_clave(pa.negras))) hallazgo,
           (select string_agg(al.cuales, '; ') from alertas al where al.clave in (interno.fp_clave(pa.blancas), interno.fp_clave(pa.negras))) alerta,
           case when pa.elo_b > 0 and pa.elo_n > 0 then abs(pa.elo_b - pa.elo_n) end dif,
           (select count(*) from reg r where r.ronda = p_ronda and r.mesa = pa.mesa and r.tipo = 'nota' and r.articulo = 'Levantó')::integer lev,
           (select count(*) from reg r where r.ronda = p_ronda and r.mesa = pa.mesa and r.tipo in ('ilegal', 'irregularidad'))::integer irr,
           (select coalesce(sum(pv.n), 0) from previas pv where pv.snr in (pa.snr_b, pa.snr_n))::integer sorpresas,
           (select string_agg(pv.rondas, '; ') from previas pv where pv.snr in (pa.snr_b, pa.snr_n)) sorpresas_rondas,
           (select count(*) from reg r where r.ronda < p_ronda and r.tipo = 'nota' and r.articulo = 'Levantó'
              and interno.fp_clave(r.jugador) in (interno.fp_clave(pa.blancas), interno.fp_clave(pa.negras)) and r.jugador <> '')::integer lev_antes,
           (select max(rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_b) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.blancas))) ult_b,
           (select max(rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_n) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.negras))) ult_n,
           (select count(distinct rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_b) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.blancas)))::integer veces_b,
           (select count(distinct rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_n) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.negras)))::integer veces_n
      from par pa
  ),
  aplica as (  -- por qué uno de los dos no aplica: 3 revisiones en el torneo, o se revisó hace menos de 3 rondas
    select se.*,
           case when se.veces_b >= 3 then 'ya tuvo 3 revisiones en el torneo'
                when se.ult_b is not null and se.ult_b >= p_ronda - 2 then 'se revisó en la ronda ' || se.ult_b end no_b,
           case when se.veces_n >= 3 then 'ya tuvo 3 revisiones en el torneo'
                when se.ult_n is not null and se.ult_n >= p_ronda - 2 then 'se revisó en la ronda ' || se.ult_n end no_n
      from senal se
  )
  select s.mesa, nullif(s.blancas, ''), nullif(s.negras, ''), s.snr_b, s.snr_n, s.elo_b, s.elo_n,
         least(4, 1
           + case when s.dif >= 400 then 1 when s.dif >= 200 then 0.5 else 0 end
           + least(1.5, 0.5 * s.lev)
           + case when s.irr > 0 then 0.5 else 0 end
           + least(1, 0.5 * s.sorpresas)
           + case when s.lev_antes >= 3 then 0.5 else 0 end
           + case when s.alerta is not null then 1 else 0 end
           + case when s.hallazgo is not null then 1 else 0 end
           + case when greatest(coalesce(s.roi_b, 0), coalesce(s.roi_n, 0)) >= 62.5 then 1.5
                  when greatest(coalesce(s.roi_b, 0), coalesce(s.roi_n, 0)) >= 60 then 1 else 0 end)::numeric,
         array_remove(array[
           case when s.dif >= 200 then 'Diferencia de ' || s.dif || ' de Elo' end,
           case when s.lev > 0 then 'Se levantó ' || s.lev || (case when s.lev = 1 then ' vez' else ' veces' end) || ' en esta ronda' end,
           case when s.irr > 0 then 'Ilegal o irregularidad en esta ronda' end,
           case when s.sorpresas > 0 then 'Le ganó a alguien con 200 o más de Elo (' || s.sorpresas_rondas || ')' end,
           case when s.lev_antes >= 3 then 'Se levanta seguido (' || s.lev_antes || ' veces antes)' end,
           case when s.alerta is not null then 'Precisión muy alta para su Elo (' || s.alerta || ')' end,
           case when s.hallazgo is not null then 'Hallazgo en una revisión anterior (' || s.hallazgo || ')' end,
           case when s.roi_b is not null or s.roi_n is not null then 'Índice del modelo alto, sumadas sus partidas (' || concat_ws('; ',
             case when s.roi_b is not null then coalesce(nullif(s.blancas, ''), 'Blancas') || ': ' || replace(to_char(s.roi_b, 'FM990.0'), '.', ',') end,
             case when s.roi_n is not null then coalesce(nullif(s.negras, ''), 'Negras') || ': ' || replace(to_char(s.roi_n, 'FM990.0'), '.', ',') end) || ')' end], null),
         s.no_b is null, s.no_n is null,
         nullif(concat_ws('; ',
           case when s.no_b is not null then coalesce(nullif(s.blancas, ''), 'Blancas') || ' no aplica: ' || s.no_b end,
           case when s.no_n is not null then coalesce(nullif(s.negras, ''), 'Negras') || ' no aplica: ' || s.no_n end), ''),
         case
           when exists (select 1 from public.centroamericano_fair_play f where f.tnr = p_tnr and f.ronda = p_ronda and f.mesa = s.mesa) then 'Ya salió en esta ronda'
           when s.blancas <> '' and s.negras = '' then 'Sin partida (bye)'
           when s.no_b is not null and s.no_n is not null then 'Ninguno de los dos aplica'
         end
    from aplica s
   order by s.mesa;
end;
$$;
