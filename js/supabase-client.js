/**
 * Configuração do cliente Supabase (frontend).
 * Use SOMENTE a URL do projeto e a chave publishable.
 * NUNCA coloque service_role ou segredos aqui.
 */
const SUPABASE_CONFIG = {
  url: "https://nxkolopzwtbtnfbryfut.supabase.co",
  anonKey: "sb_publishable_BEAyL4CwDIUE1S_IezxudA_GcR9CeZr"
};

function supabaseConfigurado() {
  return SUPABASE_CONFIG.url.startsWith("https://") &&
    !SUPABASE_CONFIG.url.includes("COLE_AQUI") &&
    SUPABASE_CONFIG.anonKey.length > 20 &&
    !SUPABASE_CONFIG.anonKey.includes("COLE_AQUI");
}

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