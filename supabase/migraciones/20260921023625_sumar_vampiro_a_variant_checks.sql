alter table public.game_rooms drop constraint game_rooms_variant_check;
alter table public.game_rooms add constraint game_rooms_variant_check
  check (variant = any (array['crazyhouse','cartas','duelo','niebla','estandar','abrazos','camaleon','ciegas','vampiro']));

alter table public.desafios drop constraint desafios_modalidad;
alter table public.desafios add constraint desafios_modalidad
  check (modalidad = any (array['estandar','crazyhouse','cartas','duelo','niebla','abrazos','camaleon','ciegas','vampiro']));