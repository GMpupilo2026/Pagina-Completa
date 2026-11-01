-- Centroamericano 2026: torneos LIGADOS en un grupo de chess-results. Cuando los
-- torneos están ligados, se entra a la pantalla de ingreso con el código del GRUPO
-- y una sola clave (SID) abre todos: un desplegable cambia de torneo. Ver
-- «Torneos ligados en un grupo» en docs/decisiones/juegos-y-torneos.md.
--
-- Por eso la clave ya no es «de un torneo»: se guarda UNA vez, en la bóveda, con el
-- nombre del código de acceso (centroamericano_sid_<acceso>), y cada torneo que esa
-- clave abre anota con qué código se entra (acceso_tnr). Un torneo que no está
-- ligado con otro se entra con su propio código, y su acceso es él mismo.
--
-- Se reemplazan las dos funciones de la migración anterior (centroamericano_guardar_sid
-- y centroamericano_sid), que ninguna Edge Function había llegado a usar. Las nuevas
-- siguen siendo solo del servicio: ni quien organiza ni nadie desde el navegador
-- puede leer una clave.

alter table public.centroamericano_torneos
  add column acceso_tnr text check (acceso_tnr ~ '^[0-9]{1,7}$');
comment on column public.centroamericano_torneos.acceso_tnr is
  'El código con el que se entra a la pantalla de ingreso de chess-results para este torneo: el suyo, o el del GRUPO si los torneos están ligados. La clave (SID) está en la bóveda con el nombre centroamericano_sid_<acceso_tnr>.';

drop function public.centroamericano_guardar_sid(text, text, uuid);
drop function public.centroamericano_sid(text);

-- Guarda la clave de un código de acceso y marca todos los torneos que abre.
-- Devuelve cuántos torneos del Centroamericano quedaron con clave.
create function public.centroamericano_guardar_acceso(p_acceso text, p_sid text, p_tnrs text[], p_persona uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := 'centroamericano_sid_' || p_acceso;
  v_id uuid;
  v_n integer;
begin
  if p_acceso !~ '^[0-9]{1,7}$' or p_sid !~ '^[A-Za-z0-9]{8,32}$' then
    raise exception 'código o clave con forma no válida' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_tnrs), 0) not between 1 and 12 then
    raise exception 'tiene que haber entre 1 y 12 torneos' using errcode = '22023';
  end if;
  if not exists (select 1 from public.centroamericano_torneos where tnr = any (p_tnrs)) then
    raise exception 'ninguno de esos torneos es del Centroamericano' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = v_nombre;
  if v_id is null then
    perform vault.create_secret(p_sid, v_nombre, 'SID de chess-results del código de acceso ' || p_acceso);
  else
    perform vault.update_secret(v_id, p_sid, v_nombre, 'SID de chess-results del código de acceso ' || p_acceso);
  end if;
  update public.centroamericano_torneos
     set acceso_tnr = p_acceso, sid_en_boveda = true, clave_puesta = now(), clave_puesta_por = p_persona
   where tnr = any (p_tnrs);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.centroamericano_guardar_acceso(text, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.centroamericano_guardar_acceso(text, text, text[], uuid) to service_role;

-- Con qué código y qué clave se entra a un torneo (ninguna fila si no tiene clave).
create function public.centroamericano_acceso(p_tnr text)
returns table (acceso text, sid text)
language sql
security definer
stable
set search_path = ''
as $$
  select t.acceso_tnr, s.decrypted_secret
    from public.centroamericano_torneos t
    join vault.decrypted_secrets s on s.name = 'centroamericano_sid_' || t.acceso_tnr
   where t.tnr = p_tnr and t.sid_en_boveda;
$$;
revoke all on function public.centroamericano_acceso(text) from public, anon, authenticated;
grant execute on function public.centroamericano_acceso(text) to service_role;

grant select (acceso_tnr) on public.centroamericano_torneos to authenticated;

-- La auditoría anota también con qué código se entra (nunca la clave).
drop trigger auditar on public.centroamericano_torneos;
create trigger auditar after insert or update or delete on public.centroamericano_torneos
  for each row execute function interno.auditar('tnr', 'sid_en_boveda', 'clave_puesta', 'acceso_tnr');
