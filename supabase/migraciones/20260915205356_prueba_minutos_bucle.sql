-- SOLO PARA PRUEBAS: el bucle de minutesFromPresenceRows tal cual lo hacía el
-- navegador, para contrastarlo con la versión de ventanas. Se borra al terminar.
create or replace function public._prueba_minutos_bucle(p_ini timestamptz[], p_fin timestamptz[])
returns double precision
language plpgsql
immutable
as $$
declare
  i int;
  cur_start timestamptz; cur_end timestamptz; total double precision := 0;
begin
  for i in 1 .. coalesce(array_length(p_ini, 1), 0) loop
    if cur_start is null then
      cur_start := p_ini[i]; cur_end := p_fin[i];
    elsif p_ini[i] <= cur_end then
      cur_end := greatest(cur_end, p_fin[i]);
    else
      total := total + extract(epoch from (cur_end - cur_start));
      cur_start := p_ini[i]; cur_end := p_fin[i];
    end if;
  end loop;
  if cur_start is not null then
    total := total + extract(epoch from (cur_end - cur_start));
  end if;
  return total / 60.0;
end;
$$;