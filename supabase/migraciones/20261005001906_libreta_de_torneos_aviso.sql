-- La libreta de torneos (2 de 3): el aviso a sus profesores.
--
-- El navegador del alumno revisa la partida con el motor DESPUÉS de guardarla;
-- cuando termina, llama a esta función con cuántos errores salieron. Va UNA
-- sola vez por partida (avisada_at), solo de su dueño, y le llega al celular a
-- sus profesores con el enlace a su libreta. Un aviso que falla no deshace
-- nada. El número de errores lo dice el navegador: es para el aviso, no para
-- ninguna cuenta.
create or replace function public.avisar_partida_torneo(p_id uuid, p_errores integer)
returns boolean
language plpgsql security definer set search_path to '' as $$
declare
  yo uuid := auth.uid();
  p public.partidas_torneo;
  nombre text;
  destinos uuid[];
  como text;
begin
  if yo is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if p_errores is null or p_errores < 0 or p_errores > 300 then raise exception 'Número de errores inválido.'; end if;
  update public.partidas_torneo
     set errores = p_errores, avisada_at = now()
   where id = p_id and student_id = yo and avisada_at is null
  returning * into p;
  if not found then return false; end if;
  begin
    select coalesce(nullif(btrim(x.full_name), ''), 'Un alumno') into nombre from public.profiles x where x.id = yo;
    select array_agg(distinct d) into destinos from (select interno.profesores_de(yo) as d) z where d is not null and d <> yo;
    como := case when p.resultado = '1/2-1/2' then 'hizo tablas'
                 when p.resultado = '*' then 'jugó'
                 when (p.resultado = '1-0') = (p.color = 'w') then 'ganó'
                 else 'perdió' end
            || case when p.color = 'w' then ' con blancas' else ' con negras' end;
    perform public.avisar_push(destinos, 'Partida de torneo',
      nombre || ' anotó su partida' || coalesce(' de «' || left(p.evento, 60) || '»', '') || ': ' || como || '. '
        || case when p_errores = 0 then 'El motor no encontró errores grandes.'
                when p_errores = 1 then 'El motor encontró 1 error para revisar.'
                else 'El motor encontró ' || p_errores || ' errores para revisar.' end,
      '/libreta-torneos.html?alumno=' || yo::text || '#partida-' || p.id::text,
      'torneo-' || p.id::text);
  exception when others then
    raise warning 'No salió el aviso de la partida de torneo %: %', p_id, sqlerrm;
  end;
  return true;
end;
$$;