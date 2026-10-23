-- Dos nombres del mismo torneo (public.pareo_parecidos, 20261023191012):
-- cada palabra cuenta por sus primeras cinco letras, para que «Rápido» y
-- «Rapid», o «Guarqueño» y «Guarqueños», sean la misma palabra. Se probó con
-- «Torneo Rápido Paquera 2026» de Pareo Integral y «Torneo Rapid Paquera
-- 2026» de ajedrezcostarica.com, el mismo torneo: sin esto no se juntaban.
-- Ver «Torneos en Pareo Integral: un torneo, una sola vez» en
-- docs/decisiones/juegos-y-torneos.md.
create or replace function public.pareo_palabras(p text)
returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(distinct left(w, 5)), '{}') from regexp_split_to_table(public.pareo_clave(p), '[^A-Z0-9]+') as w
   where char_length(w) >= 3 and w not in ('TORNEO', 'DEL', 'LOS', 'LAS', 'PARA', 'CON', 'UNA', 'AJEDREZ', 'CHESS');
$$;
