-- ═══════════════════════════════════════════════════════════════════════
--  TSUKI · Keep-alive INTERNO (camada extra, opcional)
-- ═══════════════════════════════════════════════════════════════════════
--  Agenda uma chamada de API de dentro do próprio projeto a cada 3 horas.
--  Isso gera atividade e ajuda a evitar a pausa do plano Free.
--
--  ⚠️  LIMITAÇÃO IMPORTANTE
--      O pg_cron roda DENTRO do banco. Ele evita a pausa enquanto o projeto
--      está ativo, mas NÃO consegue acordá-lo depois de pausado. Por isso a
--      camada principal é a externa: .github/workflows/keep-alive.yml
--      (roda de 4 em 4 horas, com retry, e falha de forma visível).
--
--  ONDE RODAR
--    Supabase Dashboard → SQL Editor → New query → colar tudo → Run
--
--  Se `create extension` falhar: habilite "pg_cron" e "pg_net" em
--  Database → Extensions e rode novamente a partir do cron.schedule().
--
--  A chave abaixo é a publishable/anon — ela já é pública (fica no
--  js/supabase-client.js do site). Nada de chave secreta aqui.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Remove um agendamento anterior com o mesmo nome (torna o script re-executável)
select cron.unschedule(jobid) from cron.job where jobname = 'tsuki-keep-alive';

select cron.schedule(
  'tsuki-keep-alive',
  '23 */3 * * *',   -- a cada 3 horas, no minuto 23 (horário UTC)
  $$
  select net.http_get(
    url := 'https://nxkolopzwtbtnfbryfut.supabase.co/rest/v1/pagamentos?select=pessoa&limit=1',
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'apikey', 'sb_publishable_BEAyL4CwDIUE1S_IezxudA_GcR9CeZr',
      'Authorization', 'Bearer sb_publishable_BEAyL4CwDIUE1S_IezxudA_GcR9CeZr',
      'Accept', 'application/json'
    ),
    timeout_milliseconds := 15000
  ) as request_id;
  $$
);

-- ── Conferir o que ficou agendado ─────────────────────────────────────
select jobid, jobname, schedule, active from cron.job;

-- ── Conferir as últimas respostas (status_code 200 = tudo certo) ──────
-- select id, status_code, error_msg, timed_out, created
--   from net._http_response
--  order by created desc
--  limit 10;

-- ── Remover este keep-alive interno, se quiser ────────────────────────
-- select cron.unschedule(jobid) from cron.job where jobname = 'tsuki-keep-alive';
