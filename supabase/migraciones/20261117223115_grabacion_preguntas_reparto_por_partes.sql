-- El reparto de la correcta entre A, B, C y D sigue de una parte a la otra de
-- la misma sesión (formacion-grabaciones.js, `desde`): en las partes 2 y 3 de
-- la Sesión V cambia el lugar de la correcta. Las demás quedan iguales. Nadie
-- había contestado esas preguntas todavía (0 filas en grabacion_respuestas).
-- Generado por node herramientas/formacion-grabaciones.js --sql: no se edita a mano.
insert into public.grabacion_preguntas (youtube_id, n, correcta) values
  ('3FzX3ksWwro', 1, 2),
  ('3FzX3ksWwro', 2, 2),
  ('3FzX3ksWwro', 3, 1),
  ('3FzX3ksWwro', 4, 3),
  ('3FzX3ksWwro', 5, 1),
  ('3FzX3ksWwro', 6, 0),
  ('3FzX3ksWwro', 7, 0),
  ('3FzX3ksWwro', 8, 0),
  ('3FzX3ksWwro', 9, 3),
  ('3FzX3ksWwro', 10, 1),
  ('KYxPogxcpoA', 1, 1),
  ('KYxPogxcpoA', 2, 3),
  ('KYxPogxcpoA', 3, 0),
  ('KYxPogxcpoA', 4, 3),
  ('KYxPogxcpoA', 5, 2),
  ('KYxPogxcpoA', 6, 1),
  ('KYxPogxcpoA', 7, 2),
  ('KYxPogxcpoA', 8, 0),
  ('KYxPogxcpoA', 9, 1),
  ('KYxPogxcpoA', 10, 0),
  ('kgaq7FK4AnU', 1, 3),
  ('kgaq7FK4AnU', 2, 2),
  ('kgaq7FK4AnU', 3, 1),
  ('kgaq7FK4AnU', 4, 0),
  ('kgaq7FK4AnU', 5, 2),
  ('kgaq7FK4AnU', 6, 0),
  ('kgaq7FK4AnU', 7, 0),
  ('kgaq7FK4AnU', 8, 3),
  ('kgaq7FK4AnU', 9, 1),
  ('kgaq7FK4AnU', 10, 1),
  ('BuN8MirmKB4', 1, 1),
  ('BuN8MirmKB4', 2, 2),
  ('BuN8MirmKB4', 3, 1),
  ('BuN8MirmKB4', 4, 0),
  ('BuN8MirmKB4', 5, 1),
  ('BuN8MirmKB4', 6, 3),
  ('BuN8MirmKB4', 7, 2),
  ('BuN8MirmKB4', 8, 3),
  ('BuN8MirmKB4', 9, 0),
  ('BuN8MirmKB4', 10, 0),
  ('e5Hs4gTP34M', 1, 0),
  ('e5Hs4gTP34M', 2, 2),
  ('e5Hs4gTP34M', 3, 0),
  ('e5Hs4gTP34M', 4, 3),
  ('e5Hs4gTP34M', 5, 1),
  ('6t0K0EDMHLg', 1, 1),
  ('6t0K0EDMHLg', 2, 2),
  ('yXsurYsu2Fk', 1, 3),
  ('yXsurYsu2Fk', 2, 1),
  ('yXsurYsu2Fk', 3, 0)
on conflict (youtube_id, n) do update set correcta = excluded.correcta;
delete from public.grabacion_preguntas where youtube_id = '3FzX3ksWwro' and n > 10;
delete from public.grabacion_preguntas where youtube_id = 'KYxPogxcpoA' and n > 10;
delete from public.grabacion_preguntas where youtube_id = 'kgaq7FK4AnU' and n > 10;
delete from public.grabacion_preguntas where youtube_id = 'BuN8MirmKB4' and n > 10;
delete from public.grabacion_preguntas where youtube_id = 'e5Hs4gTP34M' and n > 5;
delete from public.grabacion_preguntas where youtube_id = '6t0K0EDMHLg' and n > 2;
delete from public.grabacion_preguntas where youtube_id = 'yXsurYsu2Fk' and n > 3;
