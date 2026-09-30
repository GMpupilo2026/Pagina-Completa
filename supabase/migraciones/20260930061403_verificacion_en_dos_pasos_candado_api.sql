-- PostgREST corre public.antes_de_cada_pedido() antes de cada pedido.
-- Para apagarlo: alter role authenticator reset pgrst.db_pre_request;
--                notify pgrst, 'reload config';
alter role authenticator set pgrst.db_pre_request = 'public.antes_de_cada_pedido';
notify pgrst, 'reload config';