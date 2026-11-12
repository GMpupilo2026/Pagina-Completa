-- «Torneos en Pareo Integral»: la inscripción trae también el sexo y la fecha
-- de nacimiento de quien juega.
--
-- Lo pidió el dueño para la Eliminatoria Cantonal JDN de Pérez Zeledón 2026
-- (jdn-pz-2026.html): el formulario de esa página manda cada inscripción al
-- torneo de Pareo de su categoría (U12 o U20), y al aceptarla el jugador entra
-- al torneo con su sexo y su fecha de nacimiento. Sin ellos no había
-- clasificación femenina (cada categoría es Absoluto y Femenino) ni la
-- revisión de la categoría por el año que Pareo hace al agregar a alguien.
--
-- Las dos son opcionales para quien no las mande (el formulario de
-- torneos-pareo.html sigue igual). Son datos personales como el resto de la
-- fila: la tabla sigue sin leerse desde afuera (RLS sin políticas, sin
-- permisos para anon ni authenticated); solo la lee pareo-publicar con la
-- clave del torneo, y se borran con el torneo.
--
-- Ver «La inscripción de la Eliminatoria Cantonal JDN de Pérez Zeledón» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.pareo_preinscripciones
  add column sexo text not null default '' check (sexo in ('', 'M', 'F')),
  add column nacimiento date check (nacimiento is null or nacimiento >= date '1900-01-01');

comment on column public.pareo_preinscripciones.sexo is
  'M o F, como lo pide FIDE en el TRF; vacío si el formulario no lo pidió.';
comment on column public.pareo_preinscripciones.nacimiento is
  'Fecha de nacimiento de quien juega (para la categoría por el año); nula si el formulario no la pidió.';
