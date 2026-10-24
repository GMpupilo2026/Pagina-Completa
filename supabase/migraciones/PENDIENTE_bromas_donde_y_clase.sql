-- Las bromas se mandan a un lugar: el panel, Entrenamiento o la clase en vivo.
-- Lo pidió el dueño del sitio. Ver «Dónde cae una broma y la clase en vivo» en
-- docs/decisiones/puntos-y-premios.md.
--
-- 1. bromas.donde: lo elige quien la manda. Queda programada: sale cuando
--    quien la recibe está en ese lugar haciendo un ejercicio (js/bromas.js).
--    El gorro de payaso no tiene lugar (es la foto, en todas partes); el
--    patito, el arcoíris y el ovni necesitan un tablero: Entrenamiento o clase.
-- 2. bromas.con_sonido: quien la manda elige si suena o solo se ve.
-- 3. bromas_clase: en la clase en vivo las bromas vienen APAGADAS y el profe
--    las enciende para su clase (tres horas, o hasta que las apague). Antes
--    no llegaban nunca a la clase; ahora sí, salvo que el profe no quiera. Lo
--    mira la página de quien recibe: solo se puede saltar el candado contra
--    sí mismo. En exámenes y torneos siguen sin cargarse.
-- 4. Topes del día: 10 que manda cada uno y 10 que recibe; 3 por pareja.
-- 5. Precios: todo cuesta el triple.
--
-- mandar_broma() y mis_bromas() cambian de firma: se borran y se vuelven a
-- crear con los mismos permisos.

alter table public.bromas
  add column donde text not null default 'panel' check (donde in ('panel', 'entreno', 'clase')),
  add column con_sonido boolean not null default true;
update public.bromas set donde = 'entreno' where tipo in ('patito', 'arcoiris', 'ovni');

create table public.bromas_clase (
  profesor_id uuid primary key references public.profiles(id) on delete cascade,
  hasta timestamptz not null,
  updated_at timestamptz not null default now()
);
comment on table public.bromas_clase is
  'Clases en vivo con las bromas encendidas por su profe, hasta la hora que dice. Solo la escribe bromas_en_esta_clase().';
alter table public.bromas_clase enable row level security;
revoke all on public.bromas_clase from public, anon, authenticated;
grant select on public.bromas_clase to authenticated;
create policy bromas_clase_ver on public.bromas_clase for select to authenticated using (
  profesor_id = (select auth.uid())
  or (select public.soy_admin())
  or profesor_id in (select interno.profesores_de((select auth.uid())))
);

create or replace function public.bromas_en_esta_clase(p_encender boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hasta timestamptz;
begin
  if not coalesce(public.soy_admin() or (select mp.role from public.my_profile() mp) = 'profesor', false) then
    raise exception 'Solo un profesor puede cambiar esto.' using errcode = '42501';
  end if;
  if coalesce(p_encender, false) then
    insert into public.bromas_clase (profesor_id, hasta, updated_at)
    values (auth.uid(), now() + interval '3 hours', now())
    on conflict (profesor_id) do update set hasta = excluded.hasta, updated_at = now()
    returning hasta into v_hasta;
    return v_hasta;
  end if;
  delete from public.bromas_clase where profesor_id = auth.uid();
  return null;
end;
$$;
revoke execute on function public.bromas_en_esta_clase(boolean) from public, anon;
grant execute on function public.bromas_en_esta_clase(boolean) to authenticated;

drop function public.mandar_broma(uuid, uuid, text);
create function public.mandar_broma(p_premio_id uuid, p_para uuid, p_frase text default null,
                                    p_donde text default null, p_con_sonido boolean default true)
returns table (broma_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_premio record;
  v_tipo text;
  v_donde text;
  v_saldo integer;
  v_hoy timestamptz := (now() at time zone 'America/Costa_Rica')::date::timestamp at time zone 'America/Costa_Rica';
  v_id uuid;
  v_nombre_para text;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  if p_para is null or p_para = v_yo then
    raise exception 'Elige a un compañero.' using errcode = '22023';
  end if;
  if not coalesce(public.es_companero(p_para), false) then
    raise exception 'Solo se le pueden mandar bromas a un compañero de clase.' using errcode = '42501';
  end if;

  select * into v_premio from public.premios_catalogo where id = p_premio_id and activo and categoria = 'broma';
  if v_premio.id is null then
    raise exception 'Esa broma ya no está disponible.' using errcode = '22023';
  end if;
  v_tipo := v_premio.parametros->>'tipo';
  if v_tipo = 'globo' then
    if p_frase is null or not exists (select 1 from public.frases_regalo f where f.clave = p_frase and f.uso = 'broma') then
      raise exception 'Elige una frase de la lista.' using errcode = '22023';
    end if;
  else
    p_frase := null;
  end if;

  -- Dónde cae. Las que necesitan un tablero no van al panel.
  if v_tipo = 'payaso' then
    v_donde := 'panel';
  elsif v_tipo in ('patito', 'arcoiris', 'ovni') then
    v_donde := coalesce(p_donde, 'entreno');
    if v_donde not in ('entreno', 'clase') then
      raise exception 'Esa broma necesita un tablero: elige Entrenamiento o la clase.' using errcode = '22023';
    end if;
  else
    v_donde := coalesce(p_donde, 'panel');
    if v_donde not in ('panel', 'entreno', 'clase') then
      raise exception 'Elige dónde le cae la broma.' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('puntos:' || v_yo::text));
  perform pg_advisory_xact_lock(hashtext('bromas:' || p_para::text));

  -- Lo de quien la recibe va con UN solo mensaje, sin decir el porqué: la
  -- visión de una persona es un dato de salud, y un bloqueo no se anuncia.
  if exists (select 1 from public.vision_personas v where v.persona_id = p_para)
     or exists (select 1 from public.bromas_preferencias bp where bp.alumno_id = p_para and bp.no_recibir)
     or exists (select 1 from public.bromas_bloqueos bb where bb.alumno_id = p_para and bb.bloqueado_id = v_yo)
     or exists (select 1 from public.bromas_apagadas ba
                 where ba.profesor_id in (select interno.profesores_de(p_para) union select interno.profesores_de(v_yo))) then
    raise exception 'A ese compañero no se le pueden mandar bromas ahora.' using errcode = '22023';
  end if;

  if (select count(*) from public.bromas b where b.de_id = v_yo and b.para_id = p_para and b.created_at >= v_hoy) >= 3 then
    raise exception 'Ya le mandaste 3 bromas hoy. Mañana puedes otra.' using errcode = '22023';
  end if;
  if (select count(*) from public.bromas b where b.de_id = v_yo and b.created_at >= v_hoy) >= 10 then
    raise exception 'Ya mandaste 10 bromas hoy. Mañana puedes seguir.' using errcode = '22023';
  end if;
  if (select count(*) from public.bromas b where b.para_id = p_para and b.created_at >= v_hoy) >= 10 then
    raise exception 'Tu compañero ya recibió muchas bromas hoy. Prueba mañana.' using errcode = '22023';
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  if v_saldo < v_premio.costo_puntos then
    raise exception 'Te faltan % puntos para esta broma.', (v_premio.costo_puntos - v_saldo) using errcode = '22023';
  end if;

  select coalesce(full_name, 'tu compañero') into v_nombre_para from public.profiles where id = p_para;
  perform interno.otorgar_puntos(v_yo, -v_premio.costo_puntos, 'broma',
    'Broma para ' || v_nombre_para || ': ' || v_premio.nombre, 'broma:' || gen_random_uuid()::text);

  insert into public.bromas (de_id, para_id, tipo, frase, vence_at, donde, con_sonido)
  values (v_yo, p_para, v_tipo, p_frase,
          now() + make_interval(hours => coalesce((v_premio.parametros->>'horas')::int, 24)),
          v_donde, coalesce(p_con_sonido, true))
  returning id into v_id;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  return query select v_id, v_saldo;
end;
$$;
revoke execute on function public.mandar_broma(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.mandar_broma(uuid, uuid, text, text, boolean) to authenticated;

-- Las que me tocan ahora, con su lugar y si suenan. Las de duración (payaso,
-- patito, arcoíris) mientras duran; las de una vez, hasta que las vea.
drop function public.mis_bromas();
create function public.mis_bromas()
returns table (id uuid, tipo text, de_nombre text, frase text, vence_at timestamptz, created_at timestamptz,
               donde text, con_sonido boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select b.id, b.tipo, coalesce(p.full_name, 'Un compañero'), f.texto, b.vence_at, b.created_at, b.donde, b.con_sonido
    from public.bromas b
    left join public.profiles p on p.id = b.de_id
    left join public.frases_regalo f on f.clave = b.frase
   where b.para_id = (select auth.uid())
     and b.vence_at > now()
     and (b.tipo in ('payaso', 'patito', 'arcoiris') or b.visto_at is null)
   order by b.created_at;
$$;
revoke execute on function public.mis_bromas() from public, anon;
grant execute on function public.mis_bromas() to authenticated;

update public.premios_catalogo set costo_puntos = costo_puntos * 3 where categoria = 'broma';
update public.premios_catalogo
   set descripcion = 'Un ovni se lleva una pieza de su tablero cuando está en un ejercicio: tiene que acordarse de cuál era, y en un minuto se la devuelve.'
 where clave = 'broma_ovni';
update public.premios_catalogo
   set descripcion = 'Unas gallinas corren por toda su pantalla con tu nombre.'
 where clave = 'broma_gallinas';
update public.premios_catalogo
   set descripcion = 'Le aparece un globo con una frase de la lista.'
 where clave = 'broma_globo';
update public.premios_catalogo
   set descripcion = 'Le cae confeti con tu nombre.'
 where clave = 'broma_confeti';
update public.premios_catalogo
   set descripcion = 'Durante una hora, un patito cruza su pantalla de vez en cuando mientras hace ejercicios.'
 where clave = 'broma_patito';
update public.premios_catalogo
   set descripcion = 'Durante una hora, las casillas de sus tableros cambian de color.'
 where clave = 'broma_arcoiris';
