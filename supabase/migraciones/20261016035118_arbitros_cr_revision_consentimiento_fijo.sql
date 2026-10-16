-- La aceptación de la privacidad de una norma subida no se cambia después:
-- un update deja la versión y la hora que quedaron al subirla. La misma
-- función atiende el alta (trigger «consentimiento») y los cambios (trigger
-- «consentimiento_fijo»).
create or replace function interno.arbitros_cr_normas_revision_consentimiento()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'UPDATE' then
    new.privacidad_version := old.privacidad_version;
    new.privacidad_aceptada_en := old.privacidad_aceptada_en;
    return new;
  end if;
  if not interno.version_legal_valida(new.privacidad_version) then
    raise exception 'Para subir una norma hay que aceptar la Política de privacidad.' using errcode = '23514';
  end if;
  new.privacidad_aceptada_en := now();
  return new;
end;
$$;
revoke execute on function interno.arbitros_cr_normas_revision_consentimiento() from public, anon, authenticated;

create trigger consentimiento_fijo before update on public.arbitros_cr_normas_revision
  for each row execute function interno.arbitros_cr_normas_revision_consentimiento();