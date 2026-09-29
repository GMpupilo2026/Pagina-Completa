-- Los invitados de una clase (clase_espectadores, con su IP en interno) se
-- borran a los dos días aunque nadie más entre con ese enlace: la política de
-- privacidad lo promete, y la limpieza de clase_invitado_entrar solo corre
-- cuando entra alguien nuevo. Una vez por día, a la 1:20 a.m. de Costa Rica.
-- Ver «La clase vista por invitados sin cuenta» en docs/decisiones/clase-en-vivo.md.
select cron.schedule('limpiar-invitados-de-clase', '20 7 * * *',
  $$delete from public.clase_espectadores where entro_at < now() - interval '2 days'$$);
