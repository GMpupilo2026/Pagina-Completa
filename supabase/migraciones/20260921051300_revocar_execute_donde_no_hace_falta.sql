-- Dos funciones de TRIGGER nacieron publicadas en /rest/v1/rpc/, contra la
-- regla que este repositorio ya tiene escrita. Son las dos de la tanda
-- anterior; llamarlas por la API contesta «trigger functions can only be
-- called as triggers», así que no es una fuga — es ruido en el linter, que es
-- justo donde después se pierde el aviso que sí importa.
revoke execute on function public.proteger_ajustes_academia() from public, anon, authenticated;
revoke execute on function public.proteger_cobros_contacto() from public, anon, authenticated;

-- Y estas dos no son API de nadie: las llaman las políticas de RLS. A `anon`
-- no le sirven de nada, y `pueden_jugar_entre_si()` desde que dice "son dos
-- cuentas de la Academia" contestaría, a quien acierte un uuid, si esa cuenta
-- existe. A `authenticated` NO se le quita: una política se evalúa con los
-- privilegios de quien escribe, así que sin el execute `desafios_insert`
-- dejaría de dejar retar a nadie.
revoke execute on function public.pueden_jugar_entre_si(uuid, uuid) from public, anon;
revoke execute on function public.puedo_armar_partida_con(uuid[]) from public, anon;

-- El nombre de un rival no se le pregunta sin sesión.
revoke execute on function public.nombres_de_jugadores(uuid[]) from public, anon;