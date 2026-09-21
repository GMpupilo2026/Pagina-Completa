-- Sin esto los retos no llegan solos: la página escucha `desafios` por Realtime
-- y Postgres no publica los cambios de una tabla que no esté en la publicación.
alter publication supabase_realtime add table public.desafios;