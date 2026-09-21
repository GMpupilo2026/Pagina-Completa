-- Dos ayudas para leer datos guardados por el navegador sin que una fila rota
-- tumbe el informe entero: el espejo de progreso (training_state) guarda el
-- valor tal cual lo escribió localStorage, así que el texto de dentro puede no
-- ser JSON válido y una fecha puede no ser una fecha.
create or replace function public.json_seguro(p_texto text)
returns jsonb
language plpgsql
immutable
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
as $$
begin
  return p_texto::timestamptz;
exception when others then
  return null;
end;
$$;

comment on function public.json_seguro(text) is
  'Convierte texto a jsonb; devuelve NULL en vez de fallar si no es JSON válido.';
comment on function public.fecha_segura(text) is
  'Convierte texto a timestamptz; devuelve NULL en vez de fallar si no es una fecha.';