-- La cuenta master no es alumna de nadie.
--
-- `role` solo valía 'profesor' o 'alumno', así que quien administra estaba
-- guardado como ALUMNO con la marca `is_admin` encima. Eso no rompía ningún
-- permiso —`is_admin` va escrito aparte en todas las políticas que le
-- importan— pero la dejaba metida donde no pinta nada: salía en la lista de
-- «para quién» al mandar una tarea o un examen, contaba como alumna en los
-- conteos de la Academia y podía ser «compañera de clase» de cualquiera.
--
-- Ahora hay un tercer valor, 'admin', y quiere decir exactamente eso: ni da
-- clase ni la recibe, administra.
--
-- POR QUÉ ESTO NO ES EL TERCER VALOR CONTRA EL QUE AVISA CLAUDE.md. Aquel
-- aviso era por `es_coordinador`: hacer de "coordinar" un tercer rol habría
-- obligado a revisar las 23 comprobaciones de `role === 'profesor'` del
-- navegador y las 13 de la base, porque quien coordina SÍ tiene que poder
-- todo lo de un profesor. Acá es al revés: la cuenta master ya no cumplía
-- ninguna de esas comprobaciones —era 'alumno'—, así que pasar a 'admin' no
-- le quita ni uno de los permisos que tenía. Lo único que cambia es de qué
-- listas desaparece, que es justo lo que se busca.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['profesor'::text, 'alumno'::text, 'admin'::text]));

-- La marca de coordinación sigue sin poder ir sola, pero ahora también la
-- puede llevar la cuenta master.
alter table public.profiles drop constraint if exists profiles_coordinador_es_profesor;
alter table public.profiles add constraint profiles_coordinador_es_profesor
  check (not es_coordinador or role = any (array['profesor'::text, 'admin'::text]));

-- Las cuentas que administran dejan de figurar como alumnas. El trigger de
-- identidad no revierte nada acá porque esto corre sin sesión de persona.
update public.profiles set role = 'admin' where is_admin and role <> 'admin';