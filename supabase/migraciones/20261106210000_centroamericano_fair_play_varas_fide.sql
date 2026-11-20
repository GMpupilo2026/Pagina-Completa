-- Fair Play: las varas del índice, las de FIDE. Ver «Las varas de FIDE» en docs/decisiones/juegos-y-torneos.md.
--
-- En el seminario de Fair Play de FIDE (Costa Rica, noviembre de 2026; «Understanding Chess Statistics», Andy Howie) el
-- índice (ROI) se lee así: de 40 a 64 es normal, de 65 a 69 se vigila al jugador mientras juega y desde 70 se lo sigue y
-- se prepara para actuar. Aquí se usaba 60 para «a mirar» y 62,5 para «muy alta», más estricto que FIDE: marcaba a
-- jugadores limpios. Ahora, en el índice de cada partida (centroamericano_fp_calibrar) y en el peso del sorteo
-- (centroamericano_fp_candidatas): 65 es «a mirar» y suma 1 al peso; 70 es «muy alta» y suma 1,5.
--
-- Cada función se toma tal como está en la base y se cambian solo las varas: si alguna no aparece exactamente una vez,
-- la migración se detiene sin cambiar nada (la función habría cambiado por otro lado y hay que mirarla).

do $migracion$
declare
  d text;
  cambio record;
begin
  -- El sorteo con peso.
  d := pg_get_functiondef('public.centroamericano_fp_candidatas(text, integer)'::regprocedure);
  for cambio in select * from (values
      ('el índice del modelo de cada jugador, sumadas sus partidas del torneo (como FIDE: desde 60 se mira)',
       'el índice del modelo de cada jugador, sumadas sus partidas del torneo (como FIDE: desde 65 se vigila)'),
      ('i.roi >= 60 and i.jugadas >= 30', 'i.roi >= 65 and i.jugadas >= 30'),
      ('coalesce(s.roi_n, 0)) >= 62.5 then 1.5', 'coalesce(s.roi_n, 0)) >= 70 then 1.5'),
      ('coalesce(s.roi_n, 0)) >= 60 then 1 else 0 end', 'coalesce(s.roi_n, 0)) >= 65 then 1 else 0 end')
    ) as x(viejo, nuevo)
  loop
    if (length(d) - length(replace(d, cambio.viejo, ''))) / length(cambio.viejo) <> 1 then
      raise exception 'centroamericano_fp_candidatas: no aparece una sola vez «%»', cambio.viejo;
    end if;
    d := replace(d, cambio.viejo, cambio.nuevo);
  end loop;
  execute d;

  -- El nivel de cada partida medida.
  d := pg_get_functiondef('public.centroamericano_fp_calibrar()'::regprocedure);
  for cambio in select * from (values
      ('62,5 o más (2,5 desviaciones) es «muy alta»;', '70 o más (4 desviaciones) es «muy alta»;'),
      ('-- 60 o más, «a mirar».', '-- 65 o más (3 desviaciones), «a mirar»: las varas de FIDE.'),
      ('when an.roi >= 62.5 then ''alta'' when an.roi >= 60 then ''a_mirar''', 'when an.roi >= 70 then ''alta'' when an.roi >= 65 then ''a_mirar''')
    ) as x(viejo, nuevo)
  loop
    if (length(d) - length(replace(d, cambio.viejo, ''))) / length(cambio.viejo) <> 1 then
      raise exception 'centroamericano_fp_calibrar: no aparece una sola vez «%»', cambio.viejo;
    end if;
    d := replace(d, cambio.viejo, cambio.nuevo);
  end loop;
  execute d;
end;
$migracion$;

-- Las partidas ya medidas toman su nivel nuevo la próxima vez que la pantalla de Fair Play recalcule (cada 90 s mientras
-- está abierta): centroamericano_fp_calibrar() exige el permiso de Fair Play y no se llama desde el editor de SQL.
