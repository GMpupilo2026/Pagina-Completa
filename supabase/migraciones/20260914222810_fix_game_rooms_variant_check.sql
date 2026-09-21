-- BUG: game_rooms_variant_check quedó fijo en 'crazyhouse' desde que se creó
-- la tabla — nunca se actualizó al agregar Ajedrez de Cartas, Duelo
-- Simultáneo ni Niebla de Guerra (las tres migraciones que siguieron solo
-- agregaron columnas de estado, sin tocar este CHECK). En producción, crear
-- una sala de cualquiera de esas 3 variantes falla ahora mismo con una
-- violación de esta restricción — nadie lo notó porque las pruebas de esas
-- entregas usaron un cliente de Supabase simulado, no la base real.
alter table public.game_rooms drop constraint game_rooms_variant_check;
alter table public.game_rooms add constraint game_rooms_variant_check
  check (variant in ('crazyhouse','cartas','duelo','niebla','estandar'));
