
-- avisos_cobro: hoy cualquier coordinador ve los avisos de pago de CUALQUIER
-- alumno (soy_coordinador() a secas). Se acota igual que pagos/cobros: solo
-- avisos de un cobro cuyo alumno está bajo la propia coordinación.
drop policy if exists avisos_lee_coordinacion on public.avisos_cobro;
create policy avisos_lee_coordinacion on public.avisos_cobro
  for select to authenticated
  using (
    soy_coordinador()
    and exists (
      select 1 from public.cobros c
       where c.id = avisos_cobro.cobro_id
         and bajo_mi_coordinacion(c.student_id)
    )
  );
