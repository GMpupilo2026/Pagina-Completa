-- La revisión de normas (arbitros_cr_normas_revision) sube certificados con
-- firmas y datos personales de otras personas: quien los sube acepta la
-- Política de privacidad y declara que tiene permiso del árbitro. Como en los
-- formularios (ver «El consentimiento queda guardado» en
-- docs/decisiones/legal.md), lo exige la base y queda en la fila: qué versión
-- se aceptó y a qué hora del servidor. La casilla de la página es la cortesía.

alter table public.arbitros_cr_normas_revision
  add column privacidad_version text,
  add column privacidad_aceptada_en timestamptz;

create or replace function interno.arbitros_cr_normas_revision_consentimiento()
returns trigger language plpgsql set search_path to '' as $$
begin
  if not interno.version_legal_valida(new.privacidad_version) then
    raise exception 'Para subir una norma hay que aceptar la Política de privacidad.' using errcode = '23514';
  end if;
  new.privacidad_aceptada_en := now();
  return new;
end;
$$;
revoke execute on function interno.arbitros_cr_normas_revision_consentimiento() from public, anon, authenticated;

create trigger consentimiento before insert on public.arbitros_cr_normas_revision
  for each row execute function interno.arbitros_cr_normas_revision_consentimiento();