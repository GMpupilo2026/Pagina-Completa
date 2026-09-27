-- El ambiente con que abre una sala de torneo.
--
-- La sala de las transmisiones (transmision.html) se puede ver como cine,
-- teatro, salón de actos, estadio, club clásico, planetario o arcade. Quien
-- administra elige en admin.html#torneos con cuál abre cada sala; quien mira
-- puede cambiarlo desde la sala y su elección se queda en su navegador.
--
-- La lista de ambientes vive en js/escenarios-sala.js; esta restricción repite
-- los mismos id y herramientas/verificar-escenarios-sala.js comprueba que
-- coincidan. Un ambiente nuevo va en los dos lados.
--
-- Ver «Los ambientes de la sala» en docs/decisiones/juegos-y-torneos.md.

alter table public.salas_torneo
  add column tema text not null default 'cine'
  check (tema in ('cine', 'teatro', 'salon', 'estadio', 'club', 'planetario', 'arcade'));
