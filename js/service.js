/**
 * CAMADA DE SERVIÇO (regras de negócio).
 * A interface fala somente com o PaymentService — nunca com o adapter.
 * Trocar localStorage por Supabase = trocar o StorageAdapter.
 */
const PaymentService = (() => {
  const ANO_ATUAL = new Date().getFullYear(); // futuro: suportará outros anos
  const registros = new Map(); // "ano|mes|pessoa" -> registro

  const chaveDe = (ano, mes, pessoa) => `${ano}|${mes}|${pessoa}`;

  return {
    anoAtual: ANO_ATUAL,

    /** Carrega os dados persistidos. Meses sem registros = todos pendentes. */
    async inicializar() {
      const salvos = await StorageAdapter.carregar();
      registros.clear();
      for (const r of salvos) {
        registros.set(chaveDe(r.ano, r.mes, r.pessoa), { ...r });
      }
    },

    estaPago(mes, pessoa, ano = ANO_ATUAL) {
      return registros.has(chaveDe(ano, mes, pessoa));
    },

    contagemPagos(mes, ano = ANO_ATUAL) {
      return APP_CONFIG.pessoas.filter((p) => this.estaPago(mes, p, ano)).length;
    },

    totalDePessoas() {
      return APP_CONFIG.pessoas.length;
    },

    /** Alterna o pagamento de uma pessoa e persiste. Devolve { pago }. */
    async alternar(mes, pessoa, ano = ANO_ATUAL) {
      const chave = chaveDe(ano, mes, pessoa);
      const pago = !registros.has(chave);

      if (pago) registros.set(chave, { pessoa, mes, ano, pago: true });
      else registros.delete(chave);

      await StorageAdapter.salvar([...registros.values()]);
      return { pago };
    }
  };
})();