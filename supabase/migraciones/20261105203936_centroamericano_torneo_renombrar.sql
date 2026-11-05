-- Cambiar el nombre (y la categoría) de un torneo del Centroamericano desde la organización (docs/decisiones/juegos-y-torneos.md,
-- «Cambiar el nombre de un torneo»). Los torneos que se agregan con la clave del grupo traen el nombre de chess-results, que puede ser
-- larguísimo; la tabla no tiene política de escritura, así que lo cambia esta función, con la licencia de la «mesa-arbitro» (y queda en
-- la auditoría por el trigger de la tabla).
--
-- LA TABLET DEL ÁRBITRO RECONOCE EL RITMO POR EL NOMBRE («Blitz…», «Rápido…»), no por la columna `ritmo`: por eso el nombre nuevo tiene que
-- seguir diciendo lo mismo que el ritmo guardado, o la tablet dejaría de verlo como Blitz o Rápido sin avisar. Si no coincide, se rechaza.
-- (Si algún día la tablet lee la columna, esta regla se puede soltar.)
create function public.centroamericano_torneo_renombrar(p_tnr text, p_nombre text, p_categoria text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_cat text := nullif(btrim(coalesce(p_categoria, '')), '');
  v_ritmo text;
  v_dice text;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Hace falta la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if length(v_nombre) not between 1 and 80 then
    raise exception 'El nombre tiene que tener entre 1 y 80 caracteres' using errcode = '22023';
  end if;
  if v_cat is not null and length(v_cat) > 40 then
    raise exception 'La categoría puede tener hasta 40 caracteres' using errcode = '22023';
  end if;
  select coalesce(t.ritmo, 'clasico') into v_ritmo from public.centroamericano_torneos t where t.tnr = p_tnr;
  if not found then
    raise exception 'No existe ese torneo' using errcode = 'P0002';
  end if;
  v_dice := case when v_nombre ~* '\mblitz\M' then 'blitz'
                 when v_nombre ~* '\mr[aá]pid[oa]s?\M' or v_nombre ~* '\mrapid\M' then 'rapido'
                 else 'clasico' end;
  if v_dice <> v_ritmo then
    raise exception 'El nombre de un torneo % tiene que seguir diciéndolo (la tablet del árbitro lo reconoce por el nombre)',
      case v_ritmo when 'blitz' then 'Blitz' when 'rapido' then 'Rápido' else 'Clásico (sin «Blitz» ni «Rápido»)' end using errcode = '22023';
  end if;
  update public.centroamericano_torneos set nombre = v_nombre, categoria = coalesce(v_cat, categoria) where tnr = p_tnr;
end;
$$;
comment on function public.centroamericano_torneo_renombrar(text, text, text) is
  'Cambia el nombre (1 a 80) y, si se manda, la categoría (hasta 40) de un torneo del Centroamericano. Con la licencia mesa-arbitro. El nombre tiene que seguir diciendo su ritmo (Blitz o Rápido) porque la tablet lo reconoce por el nombre.';
revoke execute on function public.centroamericano_torneo_renombrar(text, text, text) from public, anon;
grant execute on function public.centroamericano_torneo_renombrar(text, text, text) to authenticated, service_role;
