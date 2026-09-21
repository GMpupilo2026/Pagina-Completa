-- Con el search_path abierto, otro esquema podría colarse delante de pg_catalog
-- y cambiar qué significa el cast. Se fija vacío: los tipos básicos viven en
-- pg_catalog, que siempre se busca.
create or replace function public.json_seguro(p_texto text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_texto::jsonb;
exception when others then
  return null;
end;
$$;

create or replace function public.fecha_segura(p_texto text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_texto::timestamptz;
exception when others then
  return null;
end;
$$;

-- No hacen falta desde fuera: solo las usan las funciones de informes, que se
-- ejecutan con el rol de quien llama.
revoke execute on function public.json_seguro(text) from public, anon;
revoke execute on function public.fecha_segura(text) from public, anon;
grant execute on function public.json_seguro(text) to authenticated;
grant execute on function public.fecha_segura(text) to authenticated;