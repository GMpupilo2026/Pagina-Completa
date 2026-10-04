-- Mis partidas de torneo (2 de 2): quién puede qué. Una tabla nueva trae
-- todos los permisos para anon y authenticated; no se edita (se borra y se
-- vuelve a anotar).
revoke all on public.partidas_torneo from anon;
revoke update, truncate, references, trigger on public.partidas_torneo from authenticated;
grant select, insert, delete on public.partidas_torneo to authenticated;