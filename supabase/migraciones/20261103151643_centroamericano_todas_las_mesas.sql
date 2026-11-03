-- «Todas las mesas»: la administración habilita o deshabilita, por enlace, que el árbitro vea los emparejamientos de las demás categorías.
--
-- El pizote de la página del árbitro abre los emparejamientos de la ronda abierta de CADA categoría para ayudar a un atleta a encontrar su
-- mesa. Quien decide si un árbitro (o todos) lo tiene es la organización: esta columna lo guarda por enlace. Viene ENCENDIDA (default true) y
-- la organización la apaga donde no quiera que se vea. Lo hace cumplir la función centroamericano-mesa (la acción «emparejamientos» contesta
-- 403 si está apagada), no solo la pantalla: la tablet solo esconde el botón.
--
-- Mismo permiso que `concentracion`: update solo de esa columna para la cuenta de la organización. Sin ningún `drop`.

alter table public.centroamericano_asignaciones add column todas_las_mesas boolean not null default true;
comment on column public.centroamericano_asignaciones.todas_las_mesas is
  'Si el árbitro puede abrir «Todas las mesas» (los emparejamientos de todas las categorías). Lo habilita o deshabilita la organización; la función lo hace cumplir.';
grant update (todas_las_mesas) on public.centroamericano_asignaciones to authenticated;
