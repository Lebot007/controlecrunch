# TSUKI · controle de mensalidades

Site estático (HTML + CSS + JS puro) para marcar quem já pagou a mensalidade do
mês. Visitantes só visualizam; apenas o admin altera. Dados no **Supabase**
(Postgres + Auth + RLS), com fallback automático para `localStorage` se o
Supabase não estiver configurado.

🔗 **No ar:** <https://lebot007.github.io/controlecrunch/>

---

## ⚠️ Depois de atualizar o site, rode estes 2 SQL no Supabase

Dashboard → **SQL Editor** → *New query* → colar → **Run**:

| Arquivo | Para quê | Urgência |
|---------|----------|----------|
| [`supabase/sql/0001_renomear_pessoas.sql`](supabase/sql/0001_renomear_pessoas.sql) | Renomeia `Lucas → Clarinha` no banco (mantendo o histórico) e retira a vaga `Pedro → Ausente`, com backup | Média — o site já converte os nomes antigos sozinho |
| [`supabase/sql/0002_keep_alive_cron.sql`](supabase/sql/0002_keep_alive_cron.sql) | Camada interna contra a pausa do plano Free | Opcional (o GitHub Actions já cobre) |

Ambos são **idempotentes**: podem ser executados mais de uma vez.

---

## O grupo

| # | Cartão | Conta nas estatísticas? |
|---|--------|--------------------------|
| 01 | Vinicius | ✅ |
| 02 | **Ausente** *(vaga)* | ❌ esmaecido, não clicável, sem switch |
| 03 | Matheus | ✅ |
| 04 | Clarinha | ✅ |
| 05 | João | ✅ |

Total: **4 mensalistas** em 5 cartões — por isso o anel consegue chegar a 100%.

### Trocar nomes / abrir ou fechar uma vaga

Tudo fica em [`js/config.js`](js/config.js):

```js
const LISTA_PESSOAS = ["Vinicius", "Ausente", "Matheus", "Clarinha", "João"];
const LISTA_VAGAS   = ["Ausente"];                 // quem é vaga (não conta)
const NOMES_LEGADOS = { "Pedro": "Ausente", "Lucas": "Clarinha" };
```

- **Renomear alguém:** troque o nome em `LISTA_PESSOAS` e adicione o antigo em
  `NOMES_LEGADOS`. O histórico continua aparecendo na hora (a leitura traduz o
  nome antigo) e, para o banco ficar limpo, rode um SQL de `update`.
- **Fechar uma vaga** (chegou alguém): tire o nome de `LISTA_VAGAS` e coloque o
  nome novo em `LISTA_PESSOAS` — o cartão volta a ser clicável e a contar.
- Nomes com acento funcionam normalmente (`João`).

---

## Arquitetura

```
index.html            estrutura + boot inline
css/style.css         tema TSUKI (laranja/preto), animações, vaga e esqueleto
js/config.js          nomes, vagas, nomes legados, meses
js/supabase-client.js URL + chave publishable, SDK assíncrono, helpers de rede
js/auth.js            Supabase Auth (admin = UID fixo)
js/storage.js         adapters: Supabase (REST direto) / localStorage + cache
js/service.js         regras de negócio (contagens, alternância, assinatura)
js/ui.js              renderização, meses, resumo, login, toasts
js/fx.js              brasas em canvas (pausa com a aba oculta)
js/app.js             orquestra a inicialização
scripts/              keep-alive do Supabase e do agendamento do GitHub
supabase/sql/         scripts para rodar no SQL Editor
.github/workflows/    keep-alive agendado (a cada 4 h)
```

Camadas: **UI → Service → Storage adapter**. A interface nunca fala direto com o
Supabase, então trocar o backend é trocar um adapter.

Segurança: a trava de admin na interface é só cosmética — **quem garante a
escrita é o RLS no banco**.

### Estrutura esperada no Supabase (referência)

O projeto já está configurado; isto documenta o que ele espera:

```sql
create table if not exists public.pagamentos (
  id     bigint generated always as identity primary key,
  pessoa text    not null,
  mes    integer not null check (mes between 0 and 11),  -- 0 = janeiro
  ano    integer not null,
  pago   boolean not null default true,
  unique (pessoa, mes, ano)
);

alter table public.pagamentos enable row level security;

-- leitura pública (visitantes veem o quadro)
create policy "leitura publica" on public.pagamentos
  for select using (true);

-- escrita só para o admin autenticado
create policy "escrita admin" on public.pagamentos
  for all using (auth.uid() = 'ebc303c9-2dde-4d65-8200-9fe87901eacd')
  with check (auth.uid() = 'ebc303c9-2dde-4d65-8200-9fe87901eacd');
```

---

## Primeira carga rápida

O app foi montado para **não esperar rede para aparecer**:

1. **SDK do Supabase em `async` e com versão fixada** (`2.118.0`) — são ~218 KB
   que não bloqueiam mais o `DOMContentLoaded`.
2. **Leitura inicial por `fetch` direto no PostgREST**, sem depender do SDK. O
   site mostra os dados mesmo que o CDN esteja lento ou fora do ar.
3. **`stale-while-revalidate`**: pinta na hora com o último estado salvo no
   navegador (`tsuki.cache.v1`) e corrige quando o servidor responde.
4. **Auth e dados em paralelo** (`Promise.allSettled`), nunca em série.
5. **`preconnect`** para Supabase, CDN e fontes; **fontes não bloqueantes**.
6. **CSS de boot inline** + overlay `carregando…`: nunca aparece tela branca.
7. **Esqueleto** na 1ª visita e **bloco de falha com "tentar novamente"** quando
   não há cache nem servidor.
8. **Canvas adiado** para `requestIdleCallback`; re-renderização só quando os
   dados realmente mudam (sem re-animar a tela à toa).

Medido contra o Supabase real (jsdom): primeira pintura **2,67 s → 1,66 s**. No
navegador o ganho é maior, porque `async` não espera o download do CDN.

---

## Keep-alive (o plano Free pausa o banco)

O Supabase pausa projetos Free após ~7 dias sem atividade. Este repositório tem
**3 camadas** contra isso — GitHub Actions a cada 4 h (com retry e aviso de
falha), pg_cron interno e instruções para um cron externo de backup.

👉 Detalhes, como conferir e o que fazer se pausar: **[`KEEP-ALIVE.md`](KEEP-ALIVE.md)**

---

## Rodar localmente

Não há build nem dependências. Qualquer servidor estático serve:

```bash
python3 -m http.server 8080
# http://localhost:8080
```

O keep-alive também roda direto:

```bash
node scripts/keep-alive.mjs
```

---

## Publicação

GitHub Pages apontando para a raiz da branch `main`. Cada push publica sozinho
(o Actions só cuida do keep-alive; não há etapa de build).
