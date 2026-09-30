-- La bitácora: authenticated solo lee. Supabase da por defecto también
-- REFERENCES y TRIGGER, que acá no hacen falta.
revoke all on public.auditoria from authenticated, service_role;
grant select on public.auditoria to authenticated;