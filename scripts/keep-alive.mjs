#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────
 *  KEEP-ALIVE DO SUPABASE · camada externa (a mais importante)
 * ─────────────────────────────────────────────────────────────
 *  Por que existe:
 *    Projetos no plano Free do Supabase são PAUSADOS depois de ~7 dias
 *    sem atividade de banco/API. Depois de pausado, nada que roda DENTRO
 *    do projeto consegue acordá-lo (nem pg_cron) — só o painel. Por isso
 *    o ping tem que vir de fora, como este script faz.
 *
 *  O que faz:
 *    Uma leitura REAL e mínima no PostgREST (`select ... limit=1`), que
 *    chega ao Postgres e conta como atividade. Repete com backoff.
 *
 *  Uso local:  node scripts/keep-alive.mjs
 *  No CI:      chamado por .github/workflows/keep-alive.yml
 *  Saída:      exit 0 = banco acordado | exit 1 = falhou (o job falha e avisa)
 *
 *  Ambiente (tudo opcional):
 *    SUPABASE_URL          URL do projeto   (padrão: a deste repositório)
 *    SUPABASE_ANON_KEY     chave publishable (padrão: a pública do site)
 *    SUPABASE_TABELA       tabela lida      (padrão: pagamentos)
 *    KEEPALIVE_TENTATIVAS  tentativas       (padrão: 4)
 * ─────────────────────────────────────────────────────────────
 */

const URL_PROJETO = (process.env.SUPABASE_URL || "https://nxkolopzwtbtnfbryfut.supabase.co")
  .replace(/\/+$/, "");
const CHAVE =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  "sb_publishable_BEAyL4CwDIUE1S_IezxudA_GcR9CeZr";
const TABELA = process.env.SUPABASE_TABELA || "pagamentos";
const TENTATIVAS = Math.max(1, Number(process.env.KEEPALIVE_TENTATIVAS || 4));

/** Pausa entre tentativas: 0 s, 5 s, 20 s, 60 s… */
const ESPERAS_MS = [0, 5_000, 20_000, 60_000, 120_000];
const TEMPO_LIMITE_MS = 20_000;

const ALVO = `${URL_PROJETO}/rest/v1/${encodeURIComponent(TABELA)}?select=pessoa&limit=1`;

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function sinalDeTempoLimite(ms = TEMPO_LIMITE_MS) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controle = new AbortController();
  setTimeout(() => controle.abort(), ms);
  return controle.signal;
}

async function ping() {
  const inicio = Date.now();
  const resposta = await fetch(ALVO, {
    method: "GET",
    headers: {
      "apikey": CHAVE,
      "Authorization": `Bearer ${CHAVE}`,
      "Accept": "application/json"
    },
    signal: sinalDeTempoLimite(),
    cache: "no-store"
  });
  const corpo = await resposta.text();
  return {
    ok: resposta.ok,
    status: resposta.status,
    ms: Date.now() - inicio,
    corpo: corpo.replace(/\s+/g, " ").slice(0, 200)
  };
}

function dicaPara(status, corpo) {
  if (status === 401 || status === 403) return "Chave anon/publishable inválida ou RLS bloqueando leitura.";
  if (status === 404) return `Tabela "${TABELA}" não existe (ajuste SUPABASE_TABELA).`;
  if (status >= 500) return "Erro no servidor do Supabase — pode ser projeto pausado ou instabilidade.";
  if (/paused|inactive|unavailable/i.test(corpo)) return "O projeto parece PAUSADO: retome no painel do Supabase.";
  return "";
}

async function principal() {
  console.log(`[keep-alive] ${new Date().toISOString()}`);
  console.log(`[keep-alive] alvo: ${ALVO}`);

  for (let i = 1; i <= TENTATIVAS; i++) {
    const espera = ESPERAS_MS[Math.min(i - 1, ESPERAS_MS.length - 1)];
    if (espera) {
      console.log(`[keep-alive] esperando ${espera / 1000}s antes da tentativa ${i}…`);
      await dormir(espera);
    }
    try {
      const r = await ping();
      if (r.ok) {
        console.log(`[keep-alive] ✅ HTTP ${r.status} em ${r.ms} ms — atividade registrada, projeto acordado.`);
        process.exit(0);
      }
      const dica = dicaPara(r.status, r.corpo);
      console.warn(`[keep-alive] tentativa ${i}/${TENTATIVAS}: HTTP ${r.status} em ${r.ms} ms${dica ? " — " + dica : ""}`);
      if (r.corpo) console.warn(`[keep-alive]   resposta: ${r.corpo}`);
    } catch (erro) {
      console.warn(`[keep-alive] tentativa ${i}/${TENTATIVAS}: ${erro?.message || erro}`);
    }
  }

  console.error(`[keep-alive] ❌ falhou após ${TENTATIVAS} tentativas.`);
  console.error("[keep-alive]    Verifique: 1) o projeto existe? 2) a chave é a publishable/anon?");
  console.error("[keep-alive]    3) se estiver pausado: https://supabase.com/dashboard → projeto → Resume project");
  process.exit(1);
}

principal();
