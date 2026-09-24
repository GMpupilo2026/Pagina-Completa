-- Paquetes de acceso cuyo titular es una academia: los reparte su supervisor,
-- entre los alumnos que son miembros de esa academia.
alter table public.paquetes_acceso
  add column academia_id uuid references public.academias(id) on delete set null;
alter table public.paquetes_acceso
  add constraint paquetes_acceso_un_titular check (titular_id is null or academia_id is null);
create index paquetes_acceso_academia_idx on public.paquetes_acceso(academia_id);

create or replace function public.puede_ver_paquete(p_paquete uuid)
returns boolean language sql stable security definer
set search_path = public set row_security to off as $$
  select exists (
    select 1 from public.paquetes_acceso p
     where p.id = p_paquete
       and (coalesce((select pr.is_admin from public.profiles pr where pr.id = auth.uid()), false)
            or p.titular_id = auth.uid()
            or (p.titular_id is not null and public.bajo_mi_coordinacion(p.titular_id))
            or (p.academia_id is not null and exists (
                  select 1 from public.academias a where a.id = p.academia_id and a.supervisor_id = auth.uid())))
  );
$$;

drop function public.paquete_guardar(uuid, text, uuid, integer, date, date, numeric, text, text);

create or replace function public.paquete_guardar(
  p_id uuid, p_nombre text, p_titular uuid, p_academia uuid, p_cupos integer,
  p_desde date, p_hasta date, p_precio numeric, p_moneda text, p_notas text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_usados integer; v_rol text;
begin
  if not public.soy_admin() then raise exception 'Solo quien administra arma los paquetes de acceso.'; end if;
  if p_titular is not null and p_academia is not null then
    raise exception 'Un paquete tiene un solo titular: una academia o un profesor, no los dos.';
  end if;
  if p_titular is not null then
    select role into v_rol from public.profiles where id = p_titular;
    if v_rol is null or v_rol not in ('profesor','admin') then
      raise exception 'El titular de un paquete tiene que ser del equipo docente.';
    end if;
  end if;
  if p_academia is not null and not exists (select 1 from public.academias where id = p_academia) then
    raise exception 'Esa academia ya no existe.';
  end if;
  if p_id is null then
    insert into public.paquetes_acceso (nombre, titular_id, academia_id, cupos, vigente_desde, vigente_hasta, precio_mensual, moneda, notas)
    values (btrim(p_nombre), p_titular, p_academia, p_cupos,
            coalesce(p_desde, (now() at time zone 'America/Costa_Rica')::date), p_hasta,
            p_precio, coalesce(p_moneda, 'CRC'), nullif(btrim(coalesce(p_notas, '')), ''))
    returning id into v_id;
  else
    select count(*) into v_usados from public.paquete_alumnos where paquete_id = p_id;
    if p_cupos < v_usados then
      raise exception 'El paquete ya tiene % alumnos: no se le pueden dejar % cupos. Quita alumnos primero.', v_usados, p_cupos;
    end if;
    update public.paquetes_acceso set
      nombre = btrim(p_nombre), titular_id = p_titular, academia_id = p_academia, cupos = p_cupos,
      vigente_desde = coalesce(p_desde, vigente_desde), vigente_hasta = p_hasta,
      precio_mensual = p_precio, moneda = coalesce(p_moneda, 'CRC'),
      notas = nullif(btrim(coalesce(p_notas, '')), '')
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Ese paquete ya no existe.'; end if;
  end if;
  return v_id;
end $$;

-- Deja la lista EXACTAMENTE como se mandó, salvo lo que quien llama no alcanza:
-- el titular profesor reparte a sus alumnos; el supervisor de la academia
-- titular, a los alumnos miembros de ella. Lo que ya estaba y no alcanza se conserva.
create or replace function public.paquete_set_alumnos(p_id uuid, p_alumnos uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin boolean := public.soy_admin(); v_p public.paquetes_acceso; v_final uuid[];
        v_malos integer; v_total integer; v_modo text;
begin
  select * into v_p from public.paquetes_acceso where id = p_id;
  if v_p.id is null then raise exception 'Ese paquete ya no existe.'; end if;
  if v_admin then v_modo := 'admin';
  elsif v_p.titular_id is not null and v_p.titular_id = auth.uid() then v_modo := 'profesor';
  elsif v_p.academia_id is not null and exists (
          select 1 from public.academias a where a.id = v_p.academia_id and a.supervisor_id = auth.uid()) then
    v_modo := 'academia';
  else
    raise exception 'Este paquete no es tuyo.';
  end if;
  p_alumnos := coalesce(array(select distinct a from unnest(p_alumnos) a where a is not null), '{}');

  select count(*) into v_malos from unnest(p_alumnos) a
   where not exists (select 1 from public.profiles pr where pr.id = a and pr.role = 'alumno');
  if v_malos > 0 then raise exception 'Solo se ponen cuentas de alumno en un paquete (% no lo son).', v_malos; end if;

  if v_modo = 'profesor' then
    select count(*) into v_malos from unnest(p_alumnos) a where not public.soy_profesor_de(a)
       and not exists (select 1 from public.paquete_alumnos pa where pa.paquete_id = p_id and pa.alumno_id = a);
    if v_malos > 0 then raise exception 'Solo puedes poner a tus propios alumnos (% no lo son).', v_malos; end if;
    v_final := array(select distinct x from (
      select unnest(p_alumnos) x
      union select pa.alumno_id from public.paquete_alumnos pa
       where pa.paquete_id = p_id and not public.soy_profesor_de(pa.alumno_id)) s);
  elsif v_modo = 'academia' then
    select count(*) into v_malos from unnest(p_alumnos) a
     where not exists (select 1 from public.academia_miembros m where m.academia_id = v_p.academia_id and m.persona_id = a)
       and not exists (select 1 from public.paquete_alumnos pa where pa.paquete_id = p_id and pa.alumno_id = a);
    if v_malos > 0 then raise exception 'Solo puedes poner a alumnos de tu academia (% no lo son).', v_malos; end if;
    v_final := array(select distinct x from (
      select unnest(p_alumnos) x
      union select pa.alumno_id from public.paquete_alumnos pa
       where pa.paquete_id = p_id and not exists (
         select 1 from public.academia_miembros m where m.academia_id = v_p.academia_id and m.persona_id = pa.alumno_id)) s);
  else
    v_final := p_alumnos;
  end if;

  v_total := coalesce(array_length(v_final, 1), 0);
  if v_total > v_p.cupos then
    raise exception 'El paquete tiene % cupos y la lista trae % alumnos.', v_p.cupos, v_total;
  end if;

  delete from public.paquete_alumnos where paquete_id = p_id and not (alumno_id = any (v_final));
  insert into public.paquete_alumnos (paquete_id, alumno_id)
  select p_id, a from unnest(v_final) a on conflict do nothing;

  select count(*) into v_total from public.paquete_alumnos where paquete_id = p_id;
  return jsonb_build_object('ok', true, 'total', v_total, 'cupos', v_p.cupos);
end $$;

drop function public.paquetes_con_uso();
create function public.paquetes_con_uso()
returns table (id uuid, nombre text, titular_id uuid, titular_nombre text,
               academia_id uuid, academia_nombre text, academia_supervisor_id uuid, academia_supervisor_nombre text,
               cupos integer, usados integer,
               vigente_desde date, vigente_hasta date, precio_mensual numeric, moneda text, notas text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.nombre, p.titular_id, t.full_name,
         p.academia_id, a.nombre, a.supervisor_id, s.full_name,
         p.cupos,
         (select count(*)::int from public.paquete_alumnos pa where pa.paquete_id = p.id),
         p.vigente_desde, p.vigente_hasta, p.precio_mensual, p.moneda, p.notas
    from public.paquetes_acceso p
    left join public.profiles t on t.id = p.titular_id
    left join public.academias a on a.id = p.academia_id
    left join public.profiles s on s.id = a.supervisor_id
   order by p.vigente_hasta desc, p.nombre;
$$;

revoke execute on function
  public.paquete_guardar(uuid, text, uuid, uuid, integer, date, date, numeric, text, text),
  public.paquetes_con_uso() from public, anon;
grant execute on function
  public.paquete_guardar(uuid, text, uuid, uuid, integer, date, date, numeric, text, text),
  public.paquetes_con_uso() to authenticated;
