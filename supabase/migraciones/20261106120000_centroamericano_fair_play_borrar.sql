-- Fair Play: borrar una mesa de la lista (sorteada, elegida, descartada o anotada a mano) que no correspondía: una de
-- prueba o puesta por error. Ver «Borrar una mesa que no correspondía» en docs/decisiones/juegos-y-torneos.md.
--
-- Descartar deja la mesa en el acta (y no vuelve a salir en la ronda); borrar la saca del todo: deja de contar para el
-- descanso de 2 rondas y el tope de 3 revisiones, y la mesa puede volver a salir. Por eso pide el motivo y lo que se
-- borra queda copiado entero, con quién y cuándo, en centroamericano_fp_borrados (que nadie lee ni escribe desde afuera).
-- Si su árbitro ya tenía el aviso de retener a alguien, le llega otro: que ya no hace falta.

create table public.centroamericano_fp_borrados (
  id uuid primary key default gen_random_uuid(),
  borrado timestamptz not null default now(),
  borrado_por text,
  motivo text not null check (length(btrim(motivo)) between 1 and 300),
  fila jsonb not null
);
alter table public.centroamericano_fp_borrados enable row level security;
revoke all on public.centroamericano_fp_borrados from anon, authenticated;
comment on table public.centroamericano_fp_borrados is 'Las mesas de Fair Play borradas de la lista (de prueba o puestas por error): la fila entera, quién la borró, cuándo y por qué. Solo la escribe centroamericano_fair_play_borrar().';

create or replace function public.centroamericano_fair_play_borrar(p_id uuid, p_motivo text, p_quien text default null)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
  v_quien text := interno.fp_quien(p_quien);
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 300), '');
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para borrar en Fair Play' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Para borrar una mesa hace falta el motivo: queda anotado'; end if;
  select * into f from public.centroamericano_fair_play where id = p_id for update;
  if not found then raise exception 'Esa mesa ya no está en la lista'; end if;
  -- Su árbitro tenía el aviso de retener a alguien y todavía no se revisó: que sepa que ya no hace falta.
  if f.estado = 'aprobada' and f.asignacion_id is not null then
    insert into public.centroamericano_avisos (de, asignacion_id, mesa, ronda, texto)
      values ('organizacion', f.asignacion_id, f.mesa, f.ronda,
              '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': SE CANCELA. Ya no hay que retener a nadie de esta mesa.');
  end if;
  insert into public.centroamericano_fp_borrados (borrado_por, motivo, fila) values (v_quien, v_motivo, to_jsonb(f));
  delete from public.centroamericano_fair_play where id = f.id;
  return f;
end;
$$;
revoke execute on function public.centroamericano_fair_play_borrar(uuid, text, text) from public, anon;

-- Las 5 mesas de prueba de la ronda 6 (Sub-10 Absoluto mesas 11 y 26; Sub-18 Absoluto mesas 7, 8 y 9), copiadas igual.
with fuera as (
  delete from public.centroamericano_fair_play
   where id in ('9a508658-5b80-48fc-b8d3-141c93c6a036', '0349f064-406b-475d-bf57-19ff644eb496', '19fbb00c-43d7-42fa-b272-09889c1c0402',
                '62e325ce-b57e-42f7-bab8-51388360ee37', '74f243de-930a-470b-a486-17b8e2cee951')
  returning *
)
insert into public.centroamericano_fp_borrados (borrado_por, motivo, fila)
select 'Administrador', 'Mesas de prueba de la ronda 6, borradas a pedido del árbitro principal', to_jsonb(fuera) from fuera;
