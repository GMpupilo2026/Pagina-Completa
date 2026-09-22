-- La sesión en vivo del alumno se abre cuando el profesor ABRE la clase, no antes.
--
-- Hasta acá, el tablero en vivo de un profesor se lo entregaba la RLS a
-- cualquiera de sus alumnos a cualquier hora: entraban, veían la posición que
-- hubiera quedado de la clase anterior y no había forma de saber si había clase
-- o no. Peor: la clase se abría SOLA cuando un alumno se conectaba al canal de
-- presencia, así que un alumno asomándose un domingo le dejaba al profesor una
-- clase abierta en el registro, con su fecha y su hora, que además crecía sola
-- hasta que alguien la cerrara.
--
-- Ahora la clase existe porque el profesor la abrió —con el botón o mandando
-- una posición—, y hasta entonces el alumno no recibe el tablero. El candado lo
-- hace cumplir la base y no la pantalla: la misma regla que ya acotaba el
-- enlace de la videollamada (`clase_abierta_de`), aplicada a lo que de verdad
-- ES la clase.
--
-- Quien administra sigue viéndolo todo (la regla permanente) y el profesor sigue
-- viendo SU fila siempre: él entra ANTES de abrir la clase, así que un candado
-- ahí le cerraría la puerta por la que tiene que entrar primero.

drop policy if exists game_state_select on public.game_state;
create policy game_state_select on public.game_state for select using (
    (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or owner_id = auth.uid()
    or (public.es_mi_profesor(owner_id) and public.clase_abierta_de(owner_id))
);

-- Las variantes de la pizarra cuelgan del mismo tablero: dejarlas abiertas
-- mientras el tablero está cerrado no rompería nada a la vista, pero seguiría
-- entregándole al alumno lo que se trabajó en la clase anterior.
drop policy if exists variant_nodes_select on public.variant_nodes;
create policy variant_nodes_select on public.variant_nodes for select using (
    (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or teacher_id = auth.uid()
    or (public.es_mi_profesor(teacher_id) and public.clase_abierta_de(teacher_id))
);