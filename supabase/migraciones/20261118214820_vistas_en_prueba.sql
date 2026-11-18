-- Vistas en prueba: una forma nueva de una pantalla, solo para las cuentas
-- que se anotan aquí.
--
-- La primera es «panel_jornada»: el panel del alumno (clases.html) con la
-- forma de Chessgora —cinco pestañas abajo en el celular (Inicio, Clases,
-- Entrenar, Jugar, Perfil) y menú lateral en la computadora—. No es otro
-- panel: son las mismas secciones y tarjetas de siempre, con sus datos
-- reales, repartidas por pestaña (js/panel-jornada.js). Se prueba primero
-- con una sola cuenta de alumno, «Oscarov», antes de dársela a nadie más.
--
-- Decisiones:
--
-- * Una tabla y no una columna de profiles: profiles tiene su trigger de
--   identidad y sus políticas, y una preferencia de pantalla no tiene por qué
--   pasar por ahí. Mañana puede haber otra vista en prueba sin tocar nada:
--   se agrega su nombre al check.
-- * SIN política de escritura: las cuentas se anotan desde SQL (quien
--   administra la base). No reparte permisos ni datos —quien la tiene ve SUS
--   mismos datos, acomodados de otra forma, y todo sigue pasando por la RLS
--   de cada tabla—, así que no lleva auditoría.
-- * Cada quien lee solo sus filas, con `(select auth.uid())` envuelto.
--   «Ver como» no la hereda: quien administra mira con SU sesión, y su cuenta
--   no está anotada, así que ve el panel de siempre.
-- * Para sacar a alguien de la prueba basta borrar su fila.

create table public.vistas_en_prueba (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  vista       text not null check (vista in ('panel_jornada')),
  created_at  timestamptz not null default now(),
  primary key (profile_id, vista)
);
comment on table public.vistas_en_prueba is
  'Cuentas que prueban una forma nueva de una pantalla (panel_jornada: el panel del alumno con pestañas, js/panel-jornada.js). Sin política de escritura: se anotan desde SQL. Cada quien lee solo las suyas.';

alter table public.vistas_en_prueba enable row level security;

create policy vistas_en_prueba_propias on public.vistas_en_prueba
  for select to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.vistas_en_prueba from anon;
grant select on public.vistas_en_prueba to authenticated;

-- La primera cuenta: Oscarov, alumno del grupo SJ.
insert into public.vistas_en_prueba (profile_id, vista)
values ('4a921f0c-d6c3-4b59-b488-aa7c87d6c399', 'panel_jornada');
