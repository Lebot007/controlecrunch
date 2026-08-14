/** Ponto de entrada: autenticação, dados e interface. */
document.addEventListener("DOMContentLoaded", async () => {
  FX.iniciar();

  // 1) Autenticação: restaura sessão existente (se o Supabase estiver configurado)
  try {
    await AuthService.inicializar();
  } catch (erro) {
    console.warn("TSUKI: autenticação indisponível; modo visitante.", erro);
  }

  // 2) Dados
  try {
    await PaymentService.inicializar();
  } catch (erro) {
    console.warn("TSUKI: iniciando sem dados.", erro);
  }

  // 3) Interface
  UI.iniciar();
  UI.definirModoAdmin(AuthService.ehAdmin());

  // 4) Login/logout: re-sincroniza dados e trava/destrava os controles
  AuthService.aoMudar(async (admin) => {
    try { await PaymentService.inicializar(); } catch (erro) { console.warn(erro); }
    UI.definirModoAdmin(admin);
    UI.sincronizar();
  });

  document.body.classList.add("pronto");
});