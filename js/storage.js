/**
 * ─────────────────────────────────────────────────────────────
 *  CAMADA DE ARMAZENAMENTO (adapter)
 *  - SupabaseAdapter: usado quando o Supabase está configurado
 *    (js/supabase-client.js). Leitura pública; escrita protegida
 *    pelo RLS (somente o admin autenticado).
 *  - LocalStorageAdapter: reserva automática caso o Supabase ainda
 *    não esteja configurado (o site continua funcional).
 *  A aplicação continua usando apenas carregar() e salvar().
 * ─────────────────────────────────────────────────────────────
 */

/** Validação comum aos dois adapters. */
function registroValido(r) {
  return r && typeof r.pessoa === "string" &&
    APP_CONFIG.pessoas.includes(r.pessoa) &&
    Number.isInteger(r.mes) && r.mes >= 0 && r.mes <= 11 &&
    Number.isInteger(r.ano) && r.pago === true;
}

const LocalStorageAdapter = (() => {
  const CHAVE = "tsuki.pagamentos.v1";
  let memoria = [];

  function lerDoNavegador() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return [];
      const dados = JSON.parse(bruto);
      const lista = Array.isArray(dados.pagamentos) ? dados.pagamentos : [];
      return lista.filter(registroValido);
    } catch (erro) {
      console.warn("TSUKI: armazenamento local ilegível, iniciando vazio.", erro);
      return [];
    }
  }

  return {
    async carregar() {
      memoria = lerDoNavegador();
      return [...memoria];
    },
    async salvar(pagamentos) {
      memoria = [...pagamentos];
      try {
        localStorage.setItem(CHAVE, JSON.stringify({
          versao: APP_CONFIG.versaoDados,
          atualizadoEm: new Date().toISOString(),
          pagamentos: memoria
        }));
      } catch (erro) {
        console.warn("TSUKI: localStorage indisponível; usando apenas memória.", erro);
      }
    }
  };
})();

const SupabaseAdapter = (() => {
  const TABELA = "pagamentos";
  let cache = [];
  const chave = (r) => `${r.pessoa}|${r.mes}|${r.ano}`;

  return {
    async carregar() {
      const { data, error } = await getSupabase()
        .from(TABELA)
        .select("pessoa, mes, ano, pago");
      if (error) throw error;
      cache = (data ?? [])
        .filter(registroValido)
        .map((r) => ({ pessoa: r.pessoa, mes: r.mes, ano: r.ano, pago: true }));
      return [...cache];
    },

    /** Aplica apenas a diferença (1 insert OU 1 delete por alternância). */
    async salvar(pagamentos) {
      const cliente = getSupabase();
      const novas = new Set(pagamentos.map(chave));
      const antigas = new Set(cache.map(chave));

      for (const r of cache) {
        if (novas.has(chave(r))) continue;
        const { error } = await cliente.from(TABELA).delete()
          .eq("pessoa", r.pessoa).eq("mes", r.mes).eq("ano", r.ano);
        if (error) throw error;
      }
      for (const r of pagamentos) {
        if (antigas.has(chave(r))) continue;
        const { error } = await cliente.from(TABELA).insert({
          pessoa: r.pessoa, mes: r.mes, ano: r.ano, pago: true
        });
        if (error) throw error;
      }
      cache = [...pagamentos];
    }
  };
})();

/** Escolha do adapter: Supabase se configurado; senão, localStorage. */
const StorageAdapter = supabaseConfigurado() ? SupabaseAdapter : LocalStorageAdapter;