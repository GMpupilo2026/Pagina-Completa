-- Cargar los temas y sus ejercicios (interno.premio_temas e
-- interno.premio_tema_items) desde entreno/data/premio-temas.json, que arma
-- herramientas/premio-temas.py. Son unos 160 KB: pasarlos dentro de una
-- migración no cabe, así que la base se baja el archivo publicado con pg_net
-- y lo carga. Ver «Terminar un tema: el doble, hasta 500» en
-- docs/decisiones/puntos-y-premios.md, que trae los dos pasos.
--
-- Solo agrega y pone al día los totales: no quita nada (un ejercicio que
-- salga de un tema se quita a mano). Nadie la puede llamar desde la web: se
-- corre en el editor SQL o con execute_sql.

create or replace function interno.premio_temas_cargar(p_datos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items integer;
begin
  if jsonb_typeof(p_datos->'temas') <> 'array' then
    raise exception 'El archivo no trae la lista de temas.';
  end if;
  insert into interno.premio_temas (grupo, tema, nombre, total)
  select t->>'grupo', t->>'tema', t->>'nombre', jsonb_array_length(t->'items')
    from jsonb_array_elements(p_datos->'temas') t
  on conflict (grupo, tema) do update set nombre = excluded.nombre, total = excluded.total;
  insert into interno.premio_tema_items (grupo, tema, item)
  select t->>'grupo', t->>'tema', i
    from jsonb_array_elements(p_datos->'temas') t, jsonb_array_elements_text(t->'items') i
  on conflict do nothing;
  select count(*) into v_items from interno.premio_tema_items;
  return v_items;
end;
$$;
revoke execute on function interno.premio_temas_cargar(jsonb) from public, anon, authenticated;

-- Paso 1: pedir el archivo. Devuelve el id del pedido de pg_net.
create or replace function interno.premio_temas_pedir(p_url text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_get(p_url, timeout_milliseconds => 20000);
$$;
revoke execute on function interno.premio_temas_pedir(text) from public, anon, authenticated;

-- Paso 2: con la respuesta ya llegada, cargarla.
create or replace function interno.premio_temas_cargar_respuesta(p_pedido bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado integer;
  v_cuerpo text;
begin
  select r.status_code, r.content into v_estado, v_cuerpo from net._http_response r where r.id = p_pedido;
  if v_estado is null then
    raise exception 'Todavía no llegó la respuesta del pedido %.', p_pedido;
  end if;
  if v_estado <> 200 then
    raise exception 'El archivo respondió %.', v_estado;
  end if;
  return interno.premio_temas_cargar(v_cuerpo::jsonb);
end;
$$;
revoke execute on function interno.premio_temas_cargar_respuesta(bigint) from public, anon, authenticated;
