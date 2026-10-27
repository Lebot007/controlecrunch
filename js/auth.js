/**
 * Camada de autenticação (Supabase Auth).
 * Só o UID abaixo recebe os controles de admin na interface.
 * A proteção REAL de escrita continua sendo o RLS no banco.
 */
const AuthService = (() => {
  const ADMIN_UID = "ebc303c9-2dde-4d65-8200-9fe87901eacd";
  let usuario = null;
  let inicializacao = null; // promise única: inicializar() é idempotente
  const ouvintes = [];

  function ehAdmin() {
    return !!usuario && usuario.id === ADMIN_UID;
  }
  function notificar() {
    const admin = ehAdmin();
    ouvintes.forEach((cb) => {
      try { cb(admin, usuario); } catch (erro) { console.error(erro); }
    });
  }

  return {
    aoMudar(cb) { ouvintes.push(cb); },
    ehAdmin,
    /** Basta o Supabase estar configurado: o SDK pode ainda estar baixando. */
    disponivel: () => supabaseConfigurado(),
    usuarioAtual: () => usuario,

    /** Restaura a sessão existente e observa mudanças de autenticação. */
    inicializar() {
      if (!supabaseConfigurado()) return Promise.resolve();
      if (!inicializacao) {
        inicializacao = (async () => {
          let cliente;
          try {
            cliente = await supabaseAsync();
          } catch (erro) {
            console.warn("TSUKI: SDK do Supabase indisponível; modo visitante.", erro);
            inicializacao = null; // permite tentar de novo depois
            return;
          }
          try {
            // getSession() lê do armazenamento local (sem ida à rede),
            // então reconhecer o admin não atrasa a primeira pintura.
            const { data } = await cliente.auth.getSession();
            usuario = data?.session?.user ?? null;
          } catch (erro) {
            console.warn("TSUKI: não foi possível restaurar a sessão.", erro);
            usuario = null;
          }
          cliente.auth.onAuthStateChange((evento, sessao) => {
            if (evento === "INITIAL_SESSION") return;
            const novo = sessao?.user ?? null;
            const mudou = (usuario?.id ?? null) !== (novo?.id ?? null);
            usuario = novo;
            if (mudou) notificar();
          });
        })();
      }
      return inicializacao;
    },

    async entrar(email, senha) {
      const { data, error } = await (await supabaseAsync()).auth.signInWithPassword({
        email: email,
        password: senha
      });
      if (error) throw error;
      return data.user;
    },

    async sair() {
      if (!supabaseConfigurado()) return;
      const { error } = await (await supabaseAsync()).auth.signOut();
      if (error) throw error;
    }
  };
})();
