-- «Torneos en Pareo Integral»: el comentario de quien organiza al aceptar o
-- rechazar una inscripción, y si se le avisó por correo a quien la mandó.
--
-- Lo pidió el dueño para la Eliminatoria Cantonal JDN de Pérez Zeledón: al
-- rechazar una inscripción (o al aceptarla) el árbitro escribe por qué, y si
-- quien inscribió dejó un correo como contacto le llega un aviso con ese
-- comentario. Antes rechazar solo cambiaba el estado y nadie se enteraba.
--
-- `comentario` lo escribe el organizador desde Pareo Integral (hasta 300
-- caracteres, como la nota de la inscripción); `avisado` es la hora en que
-- salió el correo, nula si el contacto era un teléfono o si el correo no
-- salió. La tabla sigue sin leerse desde afuera (RLS sin políticas): solo la
-- lee y escribe pareo-publicar con la clave del torneo.
--
-- Ver «Torneos en Pareo Integral: inscripción, anuncios, partidas y
-- estadísticas» en docs/decisiones/juegos-y-torneos.md.

alter table public.pareo_preinscripciones
  add column comentario text not null default '' check (char_length(comentario) <= 300),
  add column avisado timestamptz;

comment on column public.pareo_preinscripciones.comentario is
  'Lo que escribió quien organiza al aceptarla o rechazarla (el motivo, si la rechazó). Va en el correo a quien la mandó.';
comment on column public.pareo_preinscripciones.avisado is
  'Cuándo se le avisó por correo a quien la mandó; nula si su contacto no era un correo o si el correo no salió.';
