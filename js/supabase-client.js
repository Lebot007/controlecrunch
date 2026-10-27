/**
 * Configuração do cliente Supabase (frontend).
 * Use SOMENTE a URL do projeto e a chave publishable.
 * NUNCA coloque service_role ou segredos aqui.
 */
const SUPABASE_CONFIG = {
  url: "https://nxkolopzwtbtnfbryfut.supabase.co",
  anonKey: "sb_publishable_BEAyL4CwDIUE1S_IezxudA_GcR9CeZr",
  /** Tabela principal (usada também pela leitura direta via PostgREST). */
  tabela: "pagamentos",
  /** Prazo das leituras de rede, em ms. */
  tempoLimiteMs: 15000
};

function supabaseConfigurado() {
  return SUPABASE_CONFIG.url.startsWith("https://") &&
    !SUPABASE_CONFIG.url.includes("COLE_AQUI") &&
    SUPABASE_CONFIG.anonKey.length > 20 &&
    !SUPABASE_CONFIG.anonKey.includes("COLE_AQUI");
}

/**
 * O SDK é carregado com `async` no index.html para não atrasar a primeira
 * pintura (são ~218 KB). Esta promise resolve assim que `window.supabase`
 * existir — ou com null após ~15 s, para o app seguir em modo offline.
 */
const supabasePronto = new Promise((resolver) => {
  if (window.supabase) { resolver(window.supabase); return; }
  let tentativas = 0;
  const timer = setInterval(() => {
    tentativas += 1;
    if (window.supabase) {
      clearInterval(timer);
      resolver(window.supabase);
    } else if (tentativas >= 500) {
      clearInterval(timer);
      resolver(null);
    }
  }, 30);
});

/** Cliente já inicializado (síncrono). Lança erro se o SDK ainda não chegou. */
function getSupabase() {
  if (!supabaseConfigurado()) {
    throw new Error("Supabase não configurado: edite js/supabase-client.js");
  }
  if (!window.supabase) {
    throw new Error("Biblioteca do Supabase não carregou (verifique a conexão).");
  }
  if (!getSupabase._cliente) {
    getSupabase._cliente = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );
  }
  return getSupabase._cliente;
}

/** Versão assíncrona de getSupabase(): espera o SDK carregar. */
async function supabaseAsync() {
  if (!supabaseConfigurado()) {
    throw new Error("Supabase não configurado: edite js/supabase-client.js");
  }
  const biblioteca = await supabasePronto;
  if (!biblioteca) {
    throw new Error("Biblioteca do Supabase não carregou (verifique a conexão).");
  }
  return getSupabase();
}

/** AbortSignal com tempo limite, com fallback para navegadores antigos. */
function sinalDeTempoLimite(ms = SUPABASE_CONFIG.tempoLimiteMs) {
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(ms);
    }
  } catch { /* ignora */ }
  return undefined;
}

/**
 * Cabeçalhos de leitura pública (RLS libera o SELECT para anônimos).
 * A chave publishable/anon é pública por natureza — a proteção de escrita
 * continua sendo o RLS do banco.
 */
function cabecalhosAnonimos() {
  return {
    "apikey": SUPABASE_CONFIG.anonKey,
    "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
    "Accept": "application/json"
  };
}
