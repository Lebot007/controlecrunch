/**
 * Camada de autenticação (Supabase Auth).
 * Só o UID abaixo recebe os controles de admin na interface.
 * A proteção REAL de escrita continua sendo o RLS no banco.
 */
const AuthService = (() => {
  const ADMIN_UID = "ebc303c9-2dde-4d65-8200-9fe87901eacd";
  let usuario = null;
  const ouvintes = [];

  function clienteOk() {
    try { getSupabase(); return true; } catch { return false; }
  }
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
    disponivel: clienteOk,
    usuarioAtual: () => usuario,

    /** Restaura a sessão existente e observa mudanças de autenticação. */
    async inicializar() {
      if (!clienteOk()) return;
      const cliente = getSupabase();
      try {
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
    },

    async entrar(email, senha) {
      const { data, error } = await getSupabase().auth.signInWithPassword({
        email: email,
        password: senha
      });
      if (error) throw error;
      return data.user;
    },

    async sair() {
      if (!clienteOk()) return;
      const { error } = await getSupabase().auth.signOut();
      if (error) throw error;
    }
  };
})();
