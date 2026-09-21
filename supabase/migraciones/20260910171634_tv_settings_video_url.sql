-- El profesor también puede enlazar un video de comentaristas (YouTube o Twitch en
-- vivo) que se muestra junto al torneo en la página TV.
alter table tv_settings add column if not exists video_url text;