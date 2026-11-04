create function public.centroamericano_vivo_leer()
returns table (enlace text, token text, actualizado timestamptz)
language sql stable security definer set search_path = '' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'centroamericano_vivo_enlace'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'centroamericano_vivo_token'),
    (select updated_at from vault.secrets where name = 'centroamericano_vivo_token');
$$;
revoke all on function public.centroamericano_vivo_leer() from public, anon, authenticated;
grant execute on function public.centroamericano_vivo_leer() to service_role;

create function public.centroamericano_vivo_guardar(p_enlace text, p_token text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if coalesce(p_enlace, '') !~ '^[A-Za-z0-9]{8}$' then
    raise exception 'El enlace no es el de una transmisión de Lichess' using errcode = '22023';
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

create function public.centroamericano_vivo_quitar()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'centroamericano_vivo_token';
  if v_id is not null then perform vault.update_secret(v_id, ''); end if;
end;
$$;
revoke all on function public.centroamericano_vivo_quitar() from public, anon, authenticated;
grant execute on function public.centroamericano_vivo_quitar() to service_role;