-- centroamericano_seguir() también lleva a un tramo que «terminó sus labores» (prefiere uno abierto).
-- Ver «El reparto de los árbitros desde el plano» en docs/decisiones/juegos-y-torneos.md.
--
-- Desde centroamericano_labores_por_ronda, «Ya terminé mis labores» vale por ronda y el enlace se reabre solo al
-- empezar la siguiente. El reparto desde el plano se aprueba justo entre rondas, cuando muchos árbitros tienen sus
-- tramos «terminados»: si seguir() se saltara esos, la tablet de un árbitro al que le apagaron el tramo abierto no
-- tendría a dónde ir. Ahora va primero a uno abierto y, si no hay, a uno terminado (que se reabre con la ronda).

create or replace function public.centroamericano_seguir(p_token text)
returns text
language sql stable security definer set search_path = public
as $$
  select h.token
  from public.centroamericano_asignaciones a
  join public.centroamericano_asignaciones h on h.persona = a.persona and h.id <> a.id
  where a.token = p_token
    and length(coalesce(p_token, '')) >= 32
    and a.persona is not null
    and a.revocada and a.reemplazada_en is not null and a.reemplazada_en > now() - interval '24 hours'
    and not h.revocada and h.vence > now()
  order by (h.concluyo_en is null) desc, (h.tnr = a.tnr) desc, h.creada desc
  limit 1;
$$;
revoke execute on function public.centroamericano_seguir(text) from public;
grant execute on function public.centroamericano_seguir(text) to anon, authenticated;
