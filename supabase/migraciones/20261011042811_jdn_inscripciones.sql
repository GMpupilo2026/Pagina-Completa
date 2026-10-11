-- «Proyección JDN por comité» (jdn-proyeccion.html, solo para quien administra).
--
-- Cada fila es una persona inscrita en una fase de los Juegos Deportivos y
-- Paradeportivos Nacionales, tal como lo exporta el propio sistema de
-- inscripciones del ICODER (no chess-results): su comité (Agrupación
-- Deportiva), su categoría y en qué paso del trámite de inscripción quedó.
-- Sirve para ver, comité por comité, quién sigue en carrera para la próxima
-- eliminatoria y cruzarlo con su actividad reciente en chess-results.
--
-- SIN CÉDULA NI FECHA DE NACIMIENTO: el export del ICODER trae identificación,
-- nacionalidad y fecha de nacimiento de cada persona (muchas menores de edad);
-- acá solo se guarda lo que la herramienta usa (nombre, comité, categoría,
-- tipo de inscripción y estado del trámite), para no tener en la base más
-- datos personales de los necesarios.
--
-- EL CANDADO ES LA BASE: solo lee quien administra (soy_admin()), igual que
-- auditoria o arbitraje_consulta_config. No es una herramienta con licencia:
-- es para la planificación interna del dueño del sitio, no se vende. No hay
-- política de escritura: se llena a mano desde la base cada vez que hay un
-- export nuevo del ICODER (herramientas/jdn-proyeccion/preparar.py).
-- Ver «Proyección JDN por comité» en docs/decisiones/juegos-y-torneos.md.

create table public.jdn_inscripciones (
  id bigint generated always as identity primary key,
  edicion text not null check (char_length(edicion) between 1 and 40),
  comite text not null check (char_length(comite) between 1 and 80),
  tipo text not null check (tipo in ('Atleta', 'Entrenador', 'Asistente', 'Chaperona')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  categoria text not null check (char_length(categoria) between 1 and 40),
  estado text not null check (estado in ('REGISTRADO', 'APROBADO ICODER', 'PASE CANTONAL', 'DEBEN CORREGIR LO SOLICITADO', 'NO CONVOCATORIA'))
);
comment on table public.jdn_inscripciones is
  'Inscritos a una fase de los JDN(P) tal como los exporta el sistema del ICODER, sin cédula ni fecha de nacimiento: comité, categoría y estado del trámite. Solo la lee quien administra. Se llena a mano con cada export nuevo (herramientas/jdn-proyeccion/preparar.py).';

create index jdn_inscripciones_edicion_comite on public.jdn_inscripciones (edicion, comite);

alter table public.jdn_inscripciones enable row level security;
revoke all on public.jdn_inscripciones from anon;
revoke insert, update, delete, truncate on public.jdn_inscripciones from authenticated;
grant select on public.jdn_inscripciones to authenticated;

create policy jdn_inscripciones_admin on public.jdn_inscripciones
  for select to authenticated
  using ((select public.soy_admin()));
