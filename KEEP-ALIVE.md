# Keep-alive: por que o Supabase "adormece" e como este repositório evita isso

O **TSUKI** usa o plano **Free** do Supabase. Nesse plano, a Supabase **pausa o
projeto automaticamente depois de ~7 dias com pouca atividade de banco/API**
([docs oficiais](https://supabase.com/docs/guides/platform/free-project-pausing)).
Quando isso acontece, o site abre mas não carrega os pagamentos até alguém
retomar o projeto no painel.

Este repositório resolve isso com **três camadas independentes**.

| # | Camada | Onde | Frequência | Acorda um projeto já pausado? |
|---|--------|------|------------|-------------------------------|
| 1 | **GitHub Actions** (principal) | [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) | a cada 4 h + reforço 2x/dia | ✅ sim |
| 2 | **pg_cron dentro do Supabase** | [`supabase/sql/0002_keep_alive_cron.sql`](supabase/sql/0002_keep_alive_cron.sql) | a cada 3 h | ❌ não (morre junto com o banco) |
| 3 | **Serviço externo de cron** (backup) | instruções abaixo | a cada 6–12 h | ✅ sim |

> Só a camada 1 já é suficiente. As outras são redundância — se o GitHub
> atrasar/pular uma execução, as demais cobrem.

---

## 1) GitHub Actions (já está configurado no repositório)

O workflow roda [`scripts/keep-alive.mjs`](scripts/keep-alive.mjs), que faz uma
**leitura real e mínima** no banco (`select pessoa from pagamentos limit 1`).
Leitura via PostgREST chega ao Postgres e **conta como atividade** — é
exatamente o que a Supabase mede.

Detalhes de robustez que já estão prontos:

- **Retry com backoff** (4 tentativas: 0 s, 5 s, 20 s, 60 s) — uma falha
  pontual de rede não desperdiça o ping.
- **Falha visível**: se todas as tentativas falharem, o job termina em erro e o
  GitHub avisa por e-mail (em vez de pausar em silêncio).
- **Dois horários de cron** deslocados, porque o agendador do GitHub pode
  atrasar minutos ou, em pico, pular uma execução.
- **Heartbeat mensal do repositório**: o GitHub **desativa crons após 60 dias
  sem atividade no repo**. No dia 1º de cada mês o workflow grava
  `.keepalive/heartbeat.json`, o que conta como atividade e mantém o
  agendamento ligado. (O commit sai em nome do dono do repositório.)
- `workflow_dispatch` habilitado: dá para testar na hora pelo botão
  **Run workflow**.

**Como conferir se está funcionando**

1. Abra a aba **Actions** do repositório → workflow **keep-alive**.
2. A execução mais recente deve estar verde, com o log:
   `[keep-alive] ✅ HTTP 200 em ... ms — atividade registrada, projeto acordado.`
3. Se aparecer ❌, o log diz o motivo (chave inválida, tabela inexistente,
   projeto pausado…).

**Rodar manualmente no seu computador** (não precisa de nada instalado além do
Node 18+):

```bash
node scripts/keep-alive.mjs
```

**Opcional — usar secrets em vez dos valores públicos**
(Settings → Secrets and variables → Actions → New repository secret):

| Secret | Valor |
|--------|-------|
| `SUPABASE_URL` | `https://nxkolopzwtbtnfbryfut.supabase.co` |
| `SUPABASE_ANON_KEY` | a chave `sb_publishable_...` de `js/supabase-client.js` |

A chave *publishable/anon* é pública por natureza (ela já viaja no JavaScript do
site). Quem protege a escrita é o **RLS** do banco — não essa chave.

---

## 2) pg_cron dentro do Supabase (camada interna)

Rode [`supabase/sql/0002_keep_alive_cron.sql`](supabase/sql/0002_keep_alive_cron.sql)
no **SQL Editor** do Supabase. Ele agenda uma chamada HTTP a cada 3 horas.

⚠️ **Limitação real**: o pg_cron roda *dentro* do banco. Ele ajuda a **evitar** a
pausa, mas **não consegue acordar** um projeto já pausado. Por isso ele é a
camada 2, e não a principal.

Para conferir depois:

```sql
select jobid, jobname, schedule, active from cron.job;
select id, status_code, error_msg, created from net._http_response order by created desc limit 10;
```

---

## 3) Backup externo sem GitHub (opcional, 2 minutos)

Se preferir não depender do GitHub Actions, qualquer agendador HTTP serve.
Exemplo com o **cron-job.org** (gratuito):

1. **New cronjob** → URL:
   `https://nxkolopzwtbtnfbryfut.supabase.co/rest/v1/pagamentos?select=pessoa&limit=1`
2. **Schedule**: a cada 6 horas (ou diário — a janela de pausa é de 7 dias).
3. **Headers**:
   - `apikey: sb_publishable_BEAyL4CwDIUE1S_IezxudA_GcR9CeZr`
   - `Authorization: Bearer sb_publishable_BEAyL4CwDIUE1S_IezxudA_GcR9CeZr`
4. Ative a notificação de falha.

UptimeRobot, Healthchecks.io, Cloudflare Workers Cron e Vercel Cron funcionam
do mesmo jeito.

---

## E se o projeto pausar mesmo assim?

1. Acesse <https://supabase.com/dashboard> → organização → projeto pausado.
2. Clique em **Resume project** e confirme.
3. Dados e configurações voltam como estavam. Há **1 ano** de janela para
   retomar depois da pausa.
4. A Supabase manda **dois e-mails** para o dono do projeto: um aviso ~1 semana
   antes e a confirmação depois. Fique de olho na caixa de spam.

> **Única garantia absoluta** de nunca ser pausado: plano **Pro** (projetos
> pagos não são pausados por inatividade).

---

## Bônus: o próprio site também ajuda

Cada vez que alguém abre o TSUKI, a página faz uma leitura no banco — ou seja,
o uso normal já gera atividade. O problema só existe quando o grupo fica
**semanas sem abrir o site**, que é justamente o que as camadas acima cobrem.
