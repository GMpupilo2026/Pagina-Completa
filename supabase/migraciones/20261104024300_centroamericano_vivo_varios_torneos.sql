-- La transmisión sin atraso de los árbitros puede ser varios torneos de Lichess (Pareo para DGT crea uno por
-- categoría; LiveChess suele usar un grupo): el enlace guardado pasa a ser hasta 30 ids separados por comas.
-- Mismos permisos (solo service_role). Ver «La transmisión sin atraso para los árbitros» en
-- docs/decisiones/juegos-y-torneos.md.
create or replace function public.centroamericano_vivo_guardar(p_enlace text, p_token text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if coalesce(p_enlace, '') !~ '^[A-Za-z0-9]{8}(,[A-Za-z0-9]{8}){0,29}$' then
    raise exception 'Los enlaces no son de transmisiones de Lichess' using errcode = '22023';
  end if;
  if coalesce(p_token, '') !~ '^lip_[A-Za-z0-9]{16,64}$' then
    raise exception 'La clave no tiene la forma de una clave de Lichess (lip_…)' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = 'centroamericano_vivo_enlace';
  if v_id is null then perform vault.create_secret(p_enlace, 'centroamericano_vivo_enlace');
  else perform vault.update_secret(v_id, p_enlace); end if;
  select id into v_id from vault.secrets where name = 'centroamericano_vivo_token';
  if v_id is null then perform vault.create_secret(p_token, 'centroamericano_vivo_token');
  else perform vault.update_secret(v_id, p_token); end if;
end;
$$;
revoke all on function public.centroamericano_vivo_guardar(text, text) from public, anon, authenticated;
grant execute on function public.centroamericano_vivo_guardar(text, text) to service_role;
