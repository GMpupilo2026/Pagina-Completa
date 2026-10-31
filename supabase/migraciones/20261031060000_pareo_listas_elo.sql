
                                                                create or replace function public.pareo_listas_frenar(p_ip text)
                                                                returns text
                                                                language plpgsql security definer set search_path = '' as $$
                                                                declare
                                                                  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
                                                                  begin
                                                                    perform pg_advisory_xact_lock(hashtext('envios_publicos:busqueda_lista'));

                                                                      if v_ip is not null and (select count(*) from interno.envios_publicos
                                                                              where tipo = 'busqueda_lista' and ip = v_ip
                                                                                        and creado > now() - interval '1 hour') >= 60 then
                                                                                            return 'Ya buscaste muchas veces en la última hora. Espera un rato e intenta de nuevo.';
                                                                                              end if;

                                                                                                if (select count(*) from interno.envios_publicos
                                                                                                        where tipo = 'busqueda_lista'
                                                                                                                  and creado > now() - interval '1 hour') >= 600 then
                                                                                                                      return 'La búsqueda en las listas de Elo está recibiendo demasiados pedidos en este momento. Intenta de nuevo en una hora.';
                                                                                                                        end if;

                                                                                                                          insert into interno.envios_publicos (tipo, ambito, ip) values ('busqueda_lista', 'pareo-listas-elo', v_ip);
                                                                                                                            -- Lo de hace más de dos días ya no cuenta para ningún tope.
                                                                                                                              delete from interno.envios_publicos where creado < now() - interval '2 days';
                                                                                                                                return null;
                                                                                                                                end;
                                                                                                                                $$;
                                                                                                                                revoke all on function public.pareo_listas_frenar(text) from public, anon, authenticated;
                                                                                                                                grant execute on function public.pareo_listas_frenar(text) to service_role;
                                                                                                                                