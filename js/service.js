/**
 * CAMADA DE SERVIÇO (regras de negócio).
 * A interface fala somente com o PaymentService — nunca com o adapter.
 * Trocar localStorage por Supabase = trocar o StorageAdapter.
 *
 * Vagas sem pessoa (APP_CONFIG.vagas) não entram nas contagens nem são gravadas.
 *
 * Carregamento em dois tempos (stale-while-revalidate):
 *   aplicarCache()  → síncrono, usa o último estado salvo no navegador
 *   sincronizar()   → assíncrono, busca do Supabase e atualiza o cache
 */
const PaymentService = (() => {
  const ANO_ATUAL = new Date().getFullYear(); // futuro: suportará outros anos
  const registros = new Map(); // "ano|mes|pessoa" -> registro
  const ouvintes = [];

  const chaveDe = (ano, mes, pessoa) => `${ano}|${mes}|${pessoa}`;
  const membros = () => APP_CONFIG.ativos;

  let origem = null;       // { emCache, atualizadoEm }
  let sincronizando = null;

  function preencher(lista) {
    registros.clear();
    for (const r of (lista ?? [])) {
      if (ehVaga(r.pessoa)) continue; // defensivo: vaga não tem pagamento
      registros.set(chaveDe(r.ano, r.mes, r.pessoa), { ...r });
    }
  }

  function avisar() {
    ouvintes.forEach((cb) => {
      try { cb(); } catch (erro) { console.error(erro); }
    });
  }

  return {
    anoAtual: ANO_ATUAL,

    /** Recebe um aviso sempre que os dados vindos do servidor mudam a tela. */
    aoMudarDados(cb) { ouvintes.push(cb); },

    /**
     * Aplica o último estado conhecido (instantâneo, sem rede).
     * Devolve true quando havia cache utilizável.
     */
    aplicarCache() {
      const salvo = typeof StorageAdapter.lerCache === "function" ? StorageAdapter.lerCache() : null;
      if (!salvo || !Array.isArray(salvo.pagamentos)) {
        origem = null;
        return false;
      }
      preencher(salvo.pagamentos.filter(registroValido));
      origem = { emCache: true, atualizadoEm: salvo.atualizadoEm ?? null };
      return true;
    },

    /** Busca os dados no Supabase e atualiza o cache local. */
    sincronizar() {
      if (sincronizando) return sincronizando; // evita consultas duplicadas
      sincronizando = (async () => {
        try {
          const salvos = await StorageAdapter.carregar();
          preencher(salvos);
          origem = { emCache: false, atualizadoEm: new Date().toISOString() };
          avisar();
          return salvos;
        } finally {
          sincronizando = null;
        }
      })();
      return sincronizando;
    },

    /** Compatibilidade com o nome antigo. */
    inicializar() {
      return this.sincronizar();
    },

    /** Já existe algum estado carregado (cache ou sincronização concluída)? */
    carregado() {
      return origem !== null;
    },

    /** De onde vieram os dados exibidos agora. */
    origemDosDados() {
      return origem;
    },

    /** Assinatura estável do estado — usada para evitar re-renderizar à toa. */
    assinatura() {
      return [...registros.keys()].sort().join(",");
    },

    estaPago(mes, pessoa, ano = ANO_ATUAL) {
      return registros.has(chaveDe(ano, mes, pessoa));
    },

    contagemPagos(mes, ano = ANO_ATUAL) {
      return membros().filter((p) => this.estaPago(mes, p, ano)).length;
    },

    /** Total de mensalistas que contam nas estatísticas. */
    totalDePessoas() {
      return membros().length;
    },

    /** Alterna o pagamento de uma pessoa e persiste. Devolve { pago }. */
    async alternar(mes, pessoa, ano = ANO_ATUAL) {
      if (ehVaga(pessoa)) return { pago: false, ignorado: true };

      const chave = chaveDe(ano, mes, pessoa);
      const anterior = registros.get(chave);
      const pago = !anterior;

      // Otimista: atualiza a tela na hora e grava em seguida.
      if (pago) registros.set(chave, { pessoa, mes, ano, pago: true });
      else registros.delete(chave);

      try {
        await StorageAdapter.salvar([...registros.values()]);
      } catch (erro) {
        // Desfaz a mudança local: o estado volta a bater com o banco.
        if (anterior) registros.set(chave, anterior);
        else registros.delete(chave);
        throw erro;
      }

      if (origem) origem = { emCache: false, atualizadoEm: new Date().toISOString() };
      return { pago };
    }
  };
})();
