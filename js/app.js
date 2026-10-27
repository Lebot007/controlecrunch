/**
 * Ponto de entrada.
 *
 * Ordem pensada para a primeira carga: a rede é disparada imediatamente, a
 * tela pinta com o último estado conhecido (ou com um esqueleto, na 1ª visita)
 * e a resposta do Supabase só atualiza o que mudou. Nada espera os ~218 KB do
 * SDK nem a ida ao banco para aparecer na tela.
 */
(() => {
  /** Intervalo mínimo entre revalidações automáticas (troca de aba, online…). */
  const INTERVALO_REVALIDACAO_MS = 30000;
  let ultimaTentativa = 0;

  /** Agenda trabalho para quando a thread principal estiver livre. */
  function quandoOcioso(cb, prazo = 1200) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(cb, { timeout: prazo });
    } else {
      setTimeout(cb, 220);
    }
  }

  /** Busca sessão + dados em paralelo e reflete o resultado na interface. */
  async function atualizarTudo({ forcar = false } = {}) {
    const agora = Date.now();
    if (!forcar && agora - ultimaTentativa < INTERVALO_REVALIDACAO_MS) return;
    ultimaTentativa = agora;

    UI.definirEstadoRede("sincronizando");

    const [autenticacao, dados] = await Promise.allSettled([
      AuthService.inicializar(),
      PaymentService.sincronizar()
    ]);

    UI.definirModoAdmin(AuthService.ehAdmin());

    if (dados.status === "fulfilled") {
      UI.definirEstadoRede("online");
    } else {
      console.warn("TSUKI: não foi possível sincronizar agora.", dados.reason);
      UI.definirEstadoRede(PaymentService.carregado() ? "offline" : "erro");
    }
    if (autenticacao.status === "rejected") {
      console.warn("TSUKI: autenticação indisponível; modo visitante.", autenticacao.reason);
    }

    UI.sincronizar();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 1) Rede primeiro: a leitura inicial usa fetch direto no PostgREST.
    atualizarTudo({ forcar: true });

    // 2) Pintura imediata com o cache local.
    PaymentService.aplicarCache();
    UI.iniciar();
    UI.definirModoAdmin(AuthService.ehAdmin());
    document.body.classList.add("pronto");

    // 3) Login/logout: re-sincroniza dados e trava/destrava os controles.
    AuthService.aoMudar(async (admin) => {
      try { await PaymentService.sincronizar(); } catch (erro) { console.warn(erro); }
      UI.definirModoAdmin(admin);
      UI.sincronizar();
    });

    // 4) Dados novos vindos do servidor atualizam a tela sozinhos.
    PaymentService.aoMudarDados(() => UI.sincronizar());

    // 5) Efeitos visuais só depois da primeira pintura.
    quandoOcioso(() => FX.iniciar());

    // 6) Revalida quando a aba volta a ficar visível ou a conexão retorna.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) atualizarTudo();
    });
    window.addEventListener("online", () => atualizarTudo({ forcar: true }));
  });
})();
