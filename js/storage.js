/**
 * ─────────────────────────────────────────────────────────────
 *  CAMADA DE ARMAZENAMENTO (adapter)
 *  - SupabaseAdapter: usado quando o Supabase está configurado
 *    (js/supabase-client.js). Leitura pública; escrita protegida
 *    pelo RLS (somente o admin autenticado).
 *  - LocalStorageAdapter: reserva automática caso o Supabase ainda
 *    não esteja configurado (o site continua funcional).
 *  A aplicação continua usando apenas carregar(), salvar() e lerCache().
 *
 *  Desempenho: a leitura inicial usa fetch direto no PostgREST, então a
 *  tela não precisa esperar os ~218 KB do SDK baixarem. O resultado fica
 *  no CacheLocal, permitindo pintar tudo antes de qualquer resposta da rede.
 *
 *  Nomes legados (Pedro/Lucas) são convertidos na leitura — veja
 *  NOMES_LEGADOS em js/config.js. Vagas sem pessoa nunca são gravadas.
 * ─────────────────────────────────────────────────────────────
 */

/** Validação comum aos dois adapters (aceita nomes legados já convertidos). */
function registroValido(r) {
  if (!r) return false;
  if (!Number.isInteger(r.mes) || r.mes < 0 || r.mes > 11) return false;
  if (!Number.isInteger(r.ano)) return false;
  if (r.pago !== true) return false;
  const nome = nomeAtual(r.pessoa);
  return nome !== null && !ehVaga(nome);
}

/** Último estado conhecido: permite abrir o site já preenchido, sem rede. */
const CacheLocal = (() => {
  const CHAVE = "tsuki.cache.v1";

  function ler() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return null;
      const dados = JSON.parse(bruto);
      if (!dados || !Array.isArray(dados.pagamentos)) return null;
      return dados;
    } catch {
      return null;
    }
  }

  function gravar(pagamentos) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({
        versao: APP_CONFIG.versaoDados,
        atualizadoEm: new Date().toISOString(),
        pagamentos
      }));
    } catch (erro) {
      console.warn("TSUKI: não foi possível gravar o cache local.", erro);
    }
  }

  return { ler, gravar };
})();

const LocalStorageAdapter = (() => {
  const CHAVE = "tsuki.pagamentos.v1";
  let memoria = [];

  function lerDoNavegador() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return [];
      const dados = JSON.parse(bruto);
      const lista = Array.isArray(dados.pagamentos) ? dados.pagamentos : [];
      return lista
        .filter(registroValido)
        .map((r) => ({ pessoa: nomeAtual(r.pessoa), mes: r.mes, ano: r.ano, pago: true }));
    } catch (erro) {
      console.warn("TSUKI: armazenamento local ilegível, iniciando vazio.", erro);
      return [];
    }
  }

  return {
    lerCache() {
      const lista = lerDoNavegador();
      return lista.length ? { pagamentos: lista, atualizadoEm: null } : null;
    },
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
  const TABELA = SUPABASE_CONFIG.tabela || "pagamentos";
  const CAMPOS = "pessoa,mes,ano,pago";
  /** Cache espelha o banco: pessoa = nome atual; pessoaOriginal = nome gravado. */
  let cache = [];
  const chave = (r) => `${r.pessoa}|${r.mes}|${r.ano}`;

  /** Remove campos internos antes de entregar os dados para a aplicação. */
  const paraApp = (lista) =>
    lista.map(({ pessoa, mes, ano, pago }) => ({ pessoa, mes, ano, pago }));

  /**
   * Leitura direta no PostgREST (sem SDK): é o caminho rápido da 1ª carga.
   * Se o projeto estiver pausado/sem rede, cai no fallback abaixo.
   */
  async function lerViaRest() {
    const resposta = await fetch(
      `${SUPABASE_CONFIG.url}/rest/v1/${TABELA}?select=${CAMPOS}`,
      {
        headers: cabecalhosAnonimos(),
        signal: sinalDeTempoLimite(),
        cache: "no-store",
        credentials: "omit"
      }
    );
    if (!resposta.ok) {
      throw new Error(`Supabase respondeu HTTP ${resposta.status} na leitura de ${TABELA}.`);
    }
    return resposta.json();
  }

  async function buscar() {
    try {
      return await lerViaRest();
    } catch (erro) {
      // Fallback pelo SDK (também produz a mensagem de erro oficial do Supabase).
      const cliente = await supabaseAsync();
      const { data, error } = await cliente.from(TABELA).select(CAMPOS);
      if (error) throw error;
      return data ?? [];
    }
  }

  /** Converte nomes legados, descarta órfãos/vagas e remove duplicados. */
  function normalizar(linhas) {
    const vistos = new Set();
    const normalizados = [];
    for (const bruto of (linhas ?? [])) {
      if (!registroValido(bruto)) continue;
      const registro = {
        pessoa: nomeAtual(bruto.pessoa),
        pessoaOriginal: bruto.pessoa,
        mes: bruto.mes,
        ano: bruto.ano,
        pago: true
      };
      const id = chave(registro);
      if (vistos.has(id)) continue; // nome antigo + novo no mesmo mês: mantém um só
      vistos.add(id);
      normalizados.push(registro);
    }
    return normalizados;
  }

  return {
    lerCache() {
      return CacheLocal.ler();
    },

    async carregar() {
      const linhas = await buscar();
      cache = normalizar(linhas);
      const dados = paraApp(cache);
      CacheLocal.gravar(dados);
      return dados;
    },

    /** Aplica apenas a diferença (1 insert OU 1 delete por alternância). */
    async salvar(pagamentos) {
      const cliente = await supabaseAsync();
      const uteis = pagamentos.filter((r) => !ehVaga(r.pessoa)); // vaga nunca vai ao banco
      const novas = new Set(uteis.map(chave));
      const antigas = new Set(cache.map(chave));
      const origem = new Map(cache.map((r) => [chave(r), r.pessoaOriginal ?? r.pessoa]));

      for (const r of cache) {
        if (novas.has(chave(r))) continue;
        const { error } = await cliente.from(TABELA).delete()
          .eq("pessoa", origem.get(chave(r)) ?? r.pessoa)
          .eq("mes", r.mes).eq("ano", r.ano);
        if (error) throw error;
      }
      for (const r of uteis) {
        if (antigas.has(chave(r))) continue;
        const { error } = await cliente.from(TABELA).insert({
          pessoa: r.pessoa, mes: r.mes, ano: r.ano, pago: true
        });
        if (error) throw error;
      }
      // Mantém o nome realmente gravado no banco (pode ser o legado, pré-migração).
      cache = uteis.map((r) => ({
        pessoa: r.pessoa,
        pessoaOriginal: origem.get(chave(r)) ?? r.pessoa,
        mes: r.mes,
        ano: r.ano,
        pago: true
      }));
      CacheLocal.gravar(paraApp(cache));
    }
  };
})();

/** Escolha do adapter: Supabase se configurado; senão, localStorage. */
const StorageAdapter = supabaseConfigurado() ? SupabaseAdapter : LocalStorageAdapter;
