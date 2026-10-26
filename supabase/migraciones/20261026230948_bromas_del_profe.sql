-- El profe también les puede mandar bromas a sus alumnos. Lo pidió el dueño
-- del sitio el 26/10/2026. Ver «Las bromas del profe» en
-- docs/decisiones/puntos-y-premios.md.
--
-- mandar_broma() conserva su firma (create or replace, sin borrar nada) y
-- suma un camino: si quien la manda es profesor de quien la recibe
-- (soy_profesor_de()), no hace falta que sean compañeros y no cuesta puntos:
-- el profe no junta Puntos Ajedrez. Todo lo demás sigue igual para él:
--   - nunca a quien tiene su visión marcada, ni a quien no quiere recibir
--     bromas o bloqueó a ese profe (con el mismo mensaje, sin decir por qué);
--   - el apagado de otro profe del alumno vale también contra él; el suyo
--     propio no, porque es para las bromas entre sus alumnos;
--   - 3 por día al mismo alumno y 10 que recibe cada alumno por día; lo que
--     manda el profe en un día, hasta 30 (tiene una clase entera).
-- Quien administra no entra por aquí: no da clase (ver «El panel de quien
-- administra no es el de un profesor»).

create or replace function public.mandar_broma(p_premio_id uuid, p_para uuid, p_frase text default null,
                                               p_donde text default null, p_con_sonido boolean default true)
returns table (broma_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_profe boolean;
  v_premio record;
  v_tipo text;
  v_donde text;
  v_saldo integer;
  v_hoy timestamptz := (now() at time zone 'America/Costa_Rica')::date::timestamp at time zone 'America/Costa_Rica';
  v_id uuid;
  v_nombre_para text;
  v_quien text;
  v_tope integer;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  if p_para is null or p_para = v_yo then
    raise exception 'Elige a un compañero.' using errcode = '22023';
  end if;
  v_profe := coalesce(public.soy_profesor_de(p_para), false);
  v_quien := case when v_profe then 'Ese alumno' else 'Ese compañero' end;
  v_tope := case when v_profe then 30 else 10 end;
  if not v_profe and not coalesce(public.es_companero(p_para), false) then
    raise exception 'Solo se le pueden mandar bromas a un compañero de clase o a un alumno tuyo.' using errcode = '42501';
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
  -- Al profe no lo frena su propio apagado (es para las bromas entre sus
  -- alumnos), sí el de otro profe del alumno.
  if exists (select 1 from public.vision_personas v where v.persona_id = p_para)
     or exists (select 1 from public.bromas_preferencias bp where bp.alumno_id = p_para and bp.no_recibir)
     or exists (select 1 from public.bromas_bloqueos bb where bb.alumno_id = p_para and bb.bloqueado_id = v_yo)
     or exists (select 1 from public.bromas_apagadas ba
                 where ba.profesor_id in (select interno.profesores_de(p_para) union select interno.profesores_de(v_yo))
                   and not (v_profe and ba.profesor_id = v_yo)) then
    raise exception 'A % no se le pueden mandar bromas ahora.', lower(v_quien) using errcode = '22023';
  end if;

  if (select count(*) from public.bromas b where b.de_id = v_yo and b.para_id = p_para and b.created_at >= v_hoy) >= 3 then
    raise exception 'Ya le mandaste 3 bromas hoy. Mañana puedes otra.' using errcode = '22023';
  end if;
  if (select count(*) from public.bromas b where b.de_id = v_yo and b.created_at >= v_hoy) >= v_tope then
    raise exception 'Ya mandaste % bromas hoy. Mañana puedes seguir.', v_tope using errcode = '22023';
  end if;
  if (select count(*) from public.bromas b where b.para_id = p_para and b.created_at >= v_hoy) >= 10 then
    raise exception '% ya recibió muchas bromas hoy. Prueba mañana.', v_quien using errcode = '22023';
  end if;

  -- El profe no paga: no junta Puntos Ajedrez.
  if not v_profe then
    select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
    if v_saldo < v_premio.costo_puntos then
      raise exception 'Te faltan % puntos para esta broma.', (v_premio.costo_puntos - v_saldo) using errcode = '22023';
    end if;

    select coalesce(full_name, 'tu compañero') into v_nombre_para from public.profiles where id = p_para;
    perform interno.otorgar_puntos(v_yo, -v_premio.costo_puntos, 'broma',
      'Broma para ' || v_nombre_para || ': ' || v_premio.nombre, 'broma:' || gen_random_uuid()::text);
  end if;

  insert into public.bromas (de_id, para_id, tipo, frase, vence_at, donde, con_sonido)
  values (v_yo, p_para, v_tipo, p_frase,
          now() + make_interval(hours => coalesce((v_premio.parametros->>'horas')::int, 24)),
          v_donde, coalesce(p_con_sonido, true))
  returning id into v_id;

  if v_profe then
    return query select v_id, null::integer;
  else
    select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
    return query select v_id, v_saldo;
  end if;
end;
$$;
revoke execute on function public.mandar_broma(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.mandar_broma(uuid, uuid, text, text, boolean) to authenticated;
