-- Vistas en prueba: «rival_profe», el profe Oscar como rival con personalidad
-- en «Jugar contra el bot» (bot.html, js/rival-profe.js).
--
-- El bot de siempre juega igual; lo nuevo es la cara: el avatar del profe al
-- lado del tablero, que cambia de gesto y comenta cada jugada (se burla del
-- regalo, se queja del golpe, se aburre si uno tarda) y, en los niveles
-- bajos, deja de vez en cuando una pieza colgando a propósito y avisa con
-- una pista para que el alumno la castigue. Se prueba primero con la cuenta
-- de Oscarov, igual que el panel jornada.
--
-- No reparte permisos ni datos: cambia cómo se ve una partida que se juega
-- en el navegador y no se guarda. Por eso, como la primera vista, no lleva
-- auditoría ni política de escritura: se anota desde SQL.
alter table public.vistas_en_prueba
  drop constraint vistas_en_prueba_vista_check,
  add constraint vistas_en_prueba_vista_check
    check (vista in ('panel_jornada', 'rival_profe'));

comment on table public.vistas_en_prueba is
  'Cuentas que prueban una forma nueva de una pantalla (panel_jornada: el panel del alumno con pestañas, js/panel-jornada.js; rival_profe: el profe Oscar como rival con personalidad en bot.html, js/rival-profe.js). Sin política de escritura: se anotan desde SQL. Cada quien lee solo las suyas.';

-- La primera cuenta: Oscarov, alumno del grupo SJ.
insert into public.vistas_en_prueba (profile_id, vista)
values ('4a921f0c-d6c3-4b59-b488-aa7c87d6c399', 'rival_profe');