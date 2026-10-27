/**
 * CAMADA DE SERVIÇO (regras de negócio).
 * A interface fala somente com o PaymentService — nunca com o adapter.
 * Trocar localStorage por Supabase = trocar o StorageAdapter.
 *
 * Vagas sem pessoa (APP_CONFIG.vagas) não entram nas contagens nem são gravadas.
 */
const PaymentService = (() => {
  const ANO_ATUAL = new Date().getFullYear(); // futuro: suportará outros anos
  const registros = new Map(); // "ano|mes|pessoa" -> registro

  const chaveDe = (ano, mes, pessoa) => `${ano}|${mes}|${pessoa}`;
  const membros = () => APP_CONFIG.ativos;

  return {
    anoAtual: ANO_ATUAL,

    /** Carrega os dados persistidos. Meses sem registros = todos pendentes. */
    async inicializar() {
      const salvos = await StorageAdapter.carregar();
      registros.clear();
      for (const r of salvos) {
        if (ehVaga(r.pessoa)) continue; // defensivo: vaga não tem pagamento
        registros.set(chaveDe(r.ano, r.mes, r.pessoa), { ...r });
      }
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
      const pago = !registros.has(chave);

      if (pago) registros.set(chave, { pessoa, mes, ano, pago: true });
      else registros.delete(chave);

      await StorageAdapter.salvar([...registros.values()]);
      return { pago };
    }
  };
})();
