-- El trigger del consentimiento de la revisión de normas corre como quien
-- sube, y authenticated no ejecuta interno.version_legal_valida(): pasa a
-- SECURITY DEFINER, como las demás funciones de trigger (sin execute para
-- nadie de afuera).
alter function interno.arbitros_cr_normas_revision_consentimiento() security definer;
revoke execute on function interno.arbitros_cr_normas_revision_consentimiento() from public, anon, authenticated;