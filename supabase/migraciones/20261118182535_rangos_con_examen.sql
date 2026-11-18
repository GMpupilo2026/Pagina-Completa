-- Los rangos se ganan con un examen.
--
-- Hasta ahora el rango salía solo de los Puntos Ajedrez ganados (js/rangos.js).
-- Decisión del dueño (18/11/2026): juntar los puntos ya no alcanza. Al llegar a
-- los del siguiente rango, a cada alumno le sale SOLO un examen de ese rango;
-- si lo aprueba sube y recibe su diploma; si no, se le restan 500 puntos del
-- avance, y cuando los vuelve a juntar le sale otra vez. Dama y Rey son UN
-- rango y el alumno elige con cuál nombre quedarse; arriba va Dragón.
--
--   Peón 0 · Caballo 1000 · Alfil 3000 · Torre 7000 · Dama o Rey 15 000 · Dragón 30 000
--
-- Decisiones:
--
-- * El rango SE GUARDA (rangos_alumno): ya no se deduce de los puntos. Quien
--   hoy tiene un rango por puntos lo conserva (se siembra abajo); sin fila,
--   Peón.
-- * Los umbrales viven acá (interno.umbral_rango) y en js/rangos.js, que los
--   pinta; verificar-rangos-examen.js los compara.
-- * El avance hacia el examen es interno.puntos_para_rango(): los ganados
--   menos 500 por cada examen de rango reprobado. La resta NO toca el saldo
--   ni el ledger: un alumno con menos de 500 de saldo quedaría en negativo, y
--   lo que se busca es solo que vuelva a juntar antes de reintentar. Tampoco
--   toca interno.puntos_ganados(), así que las tareas que llegan solas siguen
--   igual.
-- * El examen lo arma la BASE (interno.revisar_examen_rango): 10 preguntas al
--   azar del banco del rango (interno.rango_examen_banco, que llena
--   herramientas/rangos-examen-banco.js con la misma conversión de Exámenes),
--   20 minutos, 2 salidas, 7 días para rendirlo. Va a nombre de un profesor
--   del alumno (examenes.profesor_id es obligatorio, y así el profe lo ve);
--   sin profesor, del supervisor de su academia; sin ninguno, no se arma.
--   Se revisa al ganar puntos (trigger de puntos_ajustes, en un bloque de
--   excepción: una falla no tumba los puntos) y cada vez que el alumno mira
--   su rango (mi_rango), para los que ya tenían los puntos.
-- * UN examen de rango pendiente por alumno, y lo garantiza un índice único
--   parcial, no un if.
-- * Se resuelve al entregarse (trigger de examenes, cuando cerrar_examen()
--   lo pasa a 'entregado' con su porcentaje): 70 % o más aprueba. Uno que
--   vence sin entregarse cuenta como reprobado (si no, el alumno quedaría
--   trabado con un examen abierto para siempre).
-- * Aprobar sube el rango y emite el diploma en `certificados` (la misma
--   tabla y la misma página de comprobar que los certificados de curso, con
--   curso = 'rango:<id>'); certificado_publico() devuelve ahora también
--   `curso`, para que la página diga «aprobó el examen del rango».
-- * Al llegar a Dama o Rey, el alumno elige su nombre (elegir_titulo_rango).

-- ---------------- Umbrales ----------------
create or replace function interno.umbral_rango(p_rango text)
returns integer language sql immutable as $$
  select case p_rango when 'peon' then 0 when 'caballo' then 1000 when 'alfil' then 3000
                      when 'torre' then 7000 when 'dama_rey' then 15000 when 'dragon' then 30000 end;
$$;
create or replace function interno.rango_siguiente(p_rango text)
returns text language sql immutable as $$
  select case p_rango when 'peon' then 'caballo' when 'caballo' then 'alfil' when 'alfil' then 'torre'
                      when 'torre' then 'dama_rey' when 'dama_rey' then 'dragon' end;
$$;
create or replace function interno.nombre_rango(p_rango text, p_titulo text default null)
returns text language sql immutable as $$
  select case p_rango when 'peon' then 'Peón' when 'caballo' then 'Caballo' when 'alfil' then 'Alfil'
                      when 'torre' then 'Torre'
                      when 'dama_rey' then case p_titulo when 'dama' then 'Dama' when 'rey' then 'Rey' else 'Dama o Rey' end
                      when 'dragon' then 'Dragón' end;
$$;
revoke all on function interno.umbral_rango(text), interno.rango_siguiente(text), interno.nombre_rango(text, text) from public, anon, authenticated;

-- ---------------- Las tablas ----------------
create table public.rangos_alumno (
  alumno_id  uuid primary key references public.profiles(id) on delete cascade,
  rango      text not null check (rango in ('peon', 'caballo', 'alfil', 'torre', 'dama_rey', 'dragon')),
  titulo     text check (titulo in ('dama', 'rey')),
  desde      timestamptz not null default now()
);
comment on table public.rangos_alumno is
  'El rango de cada alumno (sin fila = Peón). Se gana aprobando el examen de rango; la escribe interno.resolver_examen_rango(). titulo: Dama o Rey, lo elige el alumno en ese rango.';

create table public.rango_examenes (
  examen_id      uuid primary key references public.examenes(id) on delete cascade,
  alumno_id      uuid not null references public.profiles(id) on delete cascade,
  rango          text not null check (rango in ('caballo', 'alfil', 'torre', 'dama_rey', 'dragon')),
  resultado      text not null default 'pendiente' check (resultado in ('pendiente', 'aprobado', 'reprobado')),
  porcentaje     numeric(5,2),
  resuelto_at    timestamptz,
  certificado_id uuid references public.certificados(id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.rango_examenes is
  'Cada examen de rango: a qué rango apuntaba y cómo terminó. Reprobado resta 500 del avance (interno.puntos_para_rango). Uno pendiente por alumno (índice único parcial).';
create unique index rango_examenes_uno_pendiente on public.rango_examenes (alumno_id) where resultado = 'pendiente';
create index rango_examenes_alumno on public.rango_examenes (alumno_id);

create table interno.rango_examen_banco (
  rango    text not null check (rango in ('caballo', 'alfil', 'torre', 'dama_rey', 'dragon')),
  item_id  text not null,
  item     jsonb not null,
  primary key (rango, item_id)
);
comment on table interno.rango_examen_banco is
  'Las preguntas de los exámenes de rango (con su clave). La llena herramientas/rangos-examen-banco.js; nadie la lee desde afuera.';
revoke all on interno.rango_examen_banco from public, anon, authenticated;

alter table public.rangos_alumno enable row level security;
alter table public.rango_examenes enable row level security;
revoke all on public.rangos_alumno, public.rango_examenes from public, anon, authenticated;
grant select on public.rangos_alumno, public.rango_examenes to authenticated;
-- Lo ven el alumno, sus profesores, quien lo supervisa y administración.
create policy rangos_alumno_ver on public.rangos_alumno for select to authenticated
  using (alumno_id = (select auth.uid()) or (select public.soy_admin())
         or alumno_id in (select interno.alumnos_de((select auth.uid())))
         or alumno_id in (select interno.supervisados_por_mi()));
create policy rango_examenes_ver on public.rango_examenes for select to authenticated
  using (alumno_id = (select auth.uid()) or (select public.soy_admin())
         or alumno_id in (select interno.alumnos_de((select auth.uid())))
         or alumno_id in (select interno.supervisados_por_mi()));

-- Quien hoy tiene un rango por puntos lo conserva.
insert into public.rangos_alumno (alumno_id, rango)
select p.id,
       case when g >= 30000 then 'dragon' when g >= 15000 then 'dama_rey' when g >= 7000 then 'torre'
            when g >= 3000 then 'alfil' else 'caballo' end
  from public.profiles p cross join lateral (select interno.puntos_ganados(p.id) g) x
 where p.role = 'alumno' and x.g >= 1000;

-- ---------------- El avance ----------------
create or replace function interno.puntos_para_rango(p_alumno uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select interno.puntos_ganados(p_alumno)
       - 500 * (select count(*) from public.rango_examenes r where r.alumno_id = p_alumno and r.resultado = 'reprobado')::integer;
$$;
revoke all on function interno.puntos_para_rango(uuid) from public, anon, authenticated;

-- ---------------- Resolver un examen de rango ----------------
create or replace function interno.resolver_examen_rango(p_examen uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  r public.rango_examenes;
  e public.examenes;
  v_aprobo boolean;
  v_cert uuid;
  v_ac record;
  v_codigo text;
begin
  select * into r from public.rango_examenes where examen_id = p_examen and resultado = 'pendiente' for update;
  if r.examen_id is null then return null; end if;
  select * into e from public.examenes where id = p_examen;

  v_aprobo := e.estado = 'entregado' and coalesce(e.porcentaje, 0) >= 70;
  if e.estado <> 'entregado' and e.vence_at > now() then return 'pendiente'; end if;

  if v_aprobo then
    insert into public.rangos_alumno (alumno_id, rango, titulo, desde)
    values (r.alumno_id, r.rango, null, now())
    on conflict (alumno_id) do update set rango = excluded.rango,
      titulo = case when excluded.rango = 'dama_rey' then null else public.rangos_alumno.titulo end,
      desde = now();

    select a.id, a.nombre, a.logo_path into v_ac
      from public.academia_miembros m join public.academias a on a.id = m.academia_id
     where m.persona_id = r.alumno_id order by a.nombre limit 1;
    loop
      v_codigo := substr(md5(gen_random_uuid()::text), 1, 10);
      exit when not exists (select 1 from public.certificados where codigo = v_codigo);
    end loop;
    insert into public.certificados (codigo, student_id, curso, curso_titulo, lecciones, alumno_nombre,
                                     academia_id, academia_nombre, academia_logo_path, profesor_id, profesor_nombre)
    values (v_codigo, r.alumno_id, 'rango:' || r.rango, 'Rango ' || interno.nombre_rango(r.rango), 0,
            coalesce((select full_name from public.profiles where id = r.alumno_id), ''),
            v_ac.id, v_ac.nombre, v_ac.logo_path, e.profesor_id,
            coalesce((select full_name from public.profiles where id = e.profesor_id), 'Ajedrez Integral'))
    returning id into v_cert;
    update public.rango_examenes set resultado = 'aprobado', porcentaje = e.porcentaje, resuelto_at = now(), certificado_id = v_cert
     where examen_id = p_examen;
    return 'aprobado';
  else
    update public.rango_examenes set resultado = 'reprobado', porcentaje = e.porcentaje, resuelto_at = now()
     where examen_id = p_examen;
    return 'reprobado';
  end if;
end;
$$;
revoke all on function interno.resolver_examen_rango(uuid) from public, anon, authenticated;

-- ---------------- Armar el examen cuando toca ----------------
create or replace function interno.revisar_examen_rango(p_alumno uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_pend uuid;
  v_actual text;
  v_sig text;
  v_prof uuid;
  v_examen uuid;
begin
  if p_alumno is null or coalesce((select role from public.profiles where id = p_alumno), '') <> 'alumno' then
    return null;
  end if;
  -- Uno pendiente que venció sin entregarse cuenta como reprobado.
  select examen_id into v_pend from public.rango_examenes where alumno_id = p_alumno and resultado = 'pendiente';
  if v_pend is not null then
    if interno.resolver_examen_rango(v_pend) = 'pendiente' then return v_pend; end if;
  end if;

  v_actual := coalesce((select rango from public.rangos_alumno where alumno_id = p_alumno), 'peon');
  v_sig := interno.rango_siguiente(v_actual);
  if v_sig is null or interno.puntos_para_rango(p_alumno) < interno.umbral_rango(v_sig) then
    return null;
  end if;

  select x into v_prof from interno.profesores_de(p_alumno) x order by x limit 1;
  if v_prof is null then
    select a.supervisor_id into v_prof from public.academia_miembros m join public.academias a on a.id = m.academia_id
     where m.persona_id = p_alumno and a.supervisor_id is not null order by a.nombre limit 1;
  end if;
  if v_prof is null then return null; end if;

  insert into public.examenes (profesor_id, alumno_id, titulo, instrucciones, minutos, vence_at, salidas_permitidas)
  values (v_prof, p_alumno, 'Examen de rango: ' || interno.nombre_rango(v_sig),
          'Juntaste los puntos para subir a ' || interno.nombre_rango(v_sig) || '. Diez ejercicios de táctica: se aprueba con el 70 %. '
          || 'Si lo apruebas, subes de rango y recibes tu diploma. Si no, se te restan 500 puntos del avance y, cuando los vuelvas a juntar, te sale otra vez.',
          20, now() + interval '7 days', 2)
  returning id into v_examen;

  insert into public.examen_items (examen_id, orden, tipo, banco, item_id, area, peso, visible, clave)
  select v_examen, row_number() over () - 1, b.item->>'tipo', b.item->>'banco', b.item_id, b.item->>'area',
         (b.item->>'peso')::integer, b.item->'visible', b.item->'clave'
    from (select * from interno.rango_examen_banco where rango = v_sig order by random() limit 10) b;

  insert into public.rango_examenes (examen_id, alumno_id, rango) values (v_examen, p_alumno, v_sig);
  return v_examen;
end;
$$;
revoke all on function interno.revisar_examen_rango(uuid) from public, anon, authenticated;

-- Al ganar puntos.
create or replace function interno.rango_al_ganar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    perform interno.revisar_examen_rango(new.student_id);
  exception when others then
    raise warning 'rango_al_ganar: no se pudo revisar el examen de %: %', new.student_id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function interno.rango_al_ganar() from public, anon, authenticated;
create trigger rango_al_ganar
  after insert on public.puntos_ajustes
  for each row
  when (new.cantidad > 0 and new.origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal', 'tema'))
  execute function interno.rango_al_ganar();

-- Al entregarse un examen.
create or replace function interno.rango_al_entregar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from public.rango_examenes where examen_id = new.id and resultado = 'pendiente') then
    begin
      perform interno.resolver_examen_rango(new.id);
    exception when others then
      raise warning 'rango_al_entregar: no se pudo resolver el examen %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function interno.rango_al_entregar() from public, anon, authenticated;
create trigger rango_al_entregar
  after update of estado on public.examenes
  for each row
  when (new.estado = 'entregado' and old.estado is distinct from 'entregado')
  execute function interno.rango_al_entregar();

-- ---------------- Lo que pide la pantalla ----------------
create or replace function public.mi_rango(p_alumno uuid default auth.uid())
returns table(rango text, titulo text, nombre text, desde timestamptz, puntos integer,
              siguiente text, siguiente_nombre text, umbral_siguiente integer,
              examen_id uuid, examen_vence timestamptz, examen_estado text,
              reprobados integer, diploma text)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not coalesce(p_alumno = auth.uid() or public.soy_profesor_de(p_alumno) or public.soy_admin(), false) then
    raise exception 'No puedes ver el rango de esa cuenta.' using errcode = '42501';
  end if;
  -- El propio alumno, al mirar su rango, dispara el examen si ya tenía los puntos.
  if p_alumno = auth.uid() then perform interno.revisar_examen_rango(p_alumno); end if;
  return query
  with ra as (select coalesce(x.rango, 'peon') rango, x.titulo, x.desde
                from (select 1) u left join public.rangos_alumno x on x.alumno_id = p_alumno),
       pe as (select r.examen_id, e.vence_at, e.estado from public.rango_examenes r join public.examenes e on e.id = r.examen_id
               where r.alumno_id = p_alumno and r.resultado = 'pendiente')
  select ra.rango, ra.titulo, interno.nombre_rango(ra.rango, ra.titulo), ra.desde,
         interno.puntos_para_rango(p_alumno),
         interno.rango_siguiente(ra.rango), interno.nombre_rango(interno.rango_siguiente(ra.rango)),
         interno.umbral_rango(interno.rango_siguiente(ra.rango)),
         (select pe.examen_id from pe), (select pe.vence_at from pe), (select pe.estado from pe),
         (select count(*)::integer from public.rango_examenes r where r.alumno_id = p_alumno and r.resultado = 'reprobado'),
         (select c.codigo from public.rango_examenes r join public.certificados c on c.id = r.certificado_id
           where r.alumno_id = p_alumno and r.resultado = 'aprobado' and r.rango = ra.rango and c.anulado_at is null
           order by r.resuelto_at desc limit 1)
    from ra;
end;
$$;
revoke execute on function public.mi_rango(uuid) from public, anon;
grant execute on function public.mi_rango(uuid) to authenticated;

create or replace function public.elegir_titulo_rango(p_titulo text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  if p_titulo not in ('dama', 'rey') then raise exception 'Se elige Dama o Rey.'; end if;
  update public.rangos_alumno set titulo = p_titulo
   where alumno_id = auth.uid() and rango = 'dama_rey'
  returning titulo into v;
  if v is null then raise exception 'Eso se elige al llegar al rango Dama o Rey.'; end if;
  return v;
end;
$$;
revoke execute on function public.elegir_titulo_rango(text) from public, anon;
grant execute on function public.elegir_titulo_rango(text) to authenticated;

-- ---------------- El diploma en la página de comprobar ----------------
-- Devuelve también `curso`: con 'rango:…' la página dice «aprobó el examen
-- del rango» en vez de «completó todas las lecciones del curso».
drop function public.certificado_publico(text);
create function public.certificado_publico(p_codigo text)
returns table(alumno_nombre text, curso_titulo text, lecciones integer, academia_nombre text, academia_logo_path text,
              profesor_nombre text, emitido_at timestamptz, anulado boolean, curso text)
language sql stable security definer set search_path to 'public' set row_security to 'off' as $$
  select c.alumno_nombre, c.curso_titulo, c.lecciones, c.academia_nombre, c.academia_logo_path,
         c.profesor_nombre, c.emitido_at, c.anulado_at is not null, c.curso
    from public.certificados c
   where p_codigo ~ '^[0-9a-f]{10}$' and c.codigo = p_codigo;
$$;
grant execute on function public.certificado_publico(text) to anon, authenticated;
