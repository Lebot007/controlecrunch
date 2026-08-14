/** Camada de interface: renderização, eventos, microinterações e estado de acesso. */
const UI = (() => {
  const { pessoas, meses, mesesCurtos } = APP_CONFIG;
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ANO = PaymentService.anoAtual;
  const CIRCUNFERENCIA = 2 * Math.PI * 66;
  const CHAVE_UI = "tsuki.ui.v1";

  let mesAtual = new Date().getMonth();
  let ultimoFoco = null; // devolve o foco ao fechar o login
  const chips = [];
  const el = {};

  const REF_IDS = [
    "rail", "railPrev", "railNext", "listaPessoas", "listaContagem",
    "resumoMes", "resumoAno", "ringFill", "barFill", "bar",
    "pctNum", "nPagos", "nPendentes", "resumoTexto",
        "pillResumo", "anoGrande", "toast",
    "btnEntrar", "btnSair", "loginModal", "loginForm",
    "loginEmail", "loginSenha", "loginErro", "loginSubmit", "btnFecharLogin", "btnVerSenha"
  ];

  const ICONE_CHECK =
    `<svg class="ic ic-paga" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
  const ICONE_RELOGIO =
    `<svg class="ic ic-pendente" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`;

  /* ─────────── inicialização ─────────── */
  function iniciar() {
    REF_IDS.forEach((id) => { el[id] = document.getElementById(id); });
    el.anoGrande.textContent = ANO;
    mesAtual = mesPreferido();
    construirChips();
    selecionarMes(mesAtual, { primeiraVez: true });
    ligarEventosGlobais();
    ligarEventosAutenticacao();
  }

  /* ─────────── meses ─────────── */
  function construirChips() {
    meses.forEach((_, i) => {
      const chip = document.createElement("button");
      chip.className = "mes-chip";
      chip.type = "button";
      chip.setAttribute("role", "tab");
      chip.id = `mes-${i}`;
      chip.setAttribute("aria-controls", "listaPessoas");
      chip.innerHTML =
        `<span class="chip-nome">${mesesCurtos[i]}</span>` +
        `<span class="chip-dot" aria-hidden="true"></span>`;
      chip.addEventListener("click", () => selecionarMes(i));
      el.rail.appendChild(chip);
      chips.push(chip);
    });
  }

  function selecionarMes(indice, opcoes = {}) {
    mesAtual = indice;
    salvarMesPreferido(indice);

    chips.forEach((chip, i) => {
      const ativo = i === indice;
      chip.classList.toggle("ativo", ativo);
      chip.setAttribute("aria-selected", ativo ? "true" : "false");
      chip.tabIndex = ativo ? 0 : -1;
    });
    el.listaPessoas.setAttribute("aria-labelledby", `mes-${indice}`);

    el.resumoMes.textContent = meses[indice];
    el.resumoAno.textContent = `· ${ANO}`;
    if (!opcoes.primeiraVez && !reduzido) retrucar(el.resumoMes, "troca");

    renderizarCartoes();
    atualizarResumo();
    atualizarDots();
    atualizarPill();
    rolarChipAtivo(opcoes.primeiraVez);
    document.title = `TSUKI · ${meses[indice]} ${ANO}`;
  }

  function rolarChipAtivo(imediato) {
    chips[mesAtual].scrollIntoView({
      behavior: imediato || reduzido ? "auto" : "smooth",
      inline: "center",
      block: "nearest"
    });
  }

  /* ─────────── cartões ─────────── */
  function renderizarCartoes() {
    const admin = AuthService.ehAdmin();
    const frag = document.createDocumentFragment();

    pessoas.forEach((nome, i) => {
      const pago = PaymentService.estaPago(mesAtual, nome);
      const card = document.createElement("article");
      card.className = "pessoa" + (pago ? " is-paga" : "");
      card.dataset.pessoa = nome;
      card.style.setProperty("--i", i);
      card.innerHTML = `
        <span class="pessoa-num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
        <div class="pessoa-avatar" aria-hidden="true">
          <span>${nome.charAt(0)}</span>
          <span class="av-check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>
        </div>
        <div class="pessoa-info">
          <h3>${nome}</h3>
          <p class="pessoa-status">
            ${ICONE_CHECK}${ICONE_RELOGIO}
            <span class="status-txt">${pago ? "Pagamento confirmado" : "Pagamento pendente"}</span>
          </p>
        </div>
        <button class="switch" type="button" role="switch"
                aria-checked="${pago}"
                aria-disabled="${!admin}"
                aria-label="${rotuloSwitch(nome, pago)}">
          <span class="knob">
            <svg class="knob-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
            <svg class="knob-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>
          </span>
        </button>`;
      card.addEventListener("click", () => alternar(nome, card));
      frag.appendChild(card);
    });

    el.listaPessoas.replaceChildren(frag);
    el.listaContagem.textContent = `${pessoas.length} pessoas · ${meses[mesAtual]}`;
  }

  const rotuloSwitch = (nome, pago) =>
    pago
      ? `Desmarcar pagamento de ${nome} em ${meses[mesAtual]}`
      : `Marcar ${nome} como pago em ${meses[mesAtual]}`;

  /* ─────────── alternância de pagamento ─────────── */
  async function alternar(nome, card) {
    // Visitantes não alteram nada — e o RLS garante isso também no banco
    if (!AuthService.ehAdmin()) {
      avisarBloqueio(card);
      return;
    }

    const estavaPago = card.classList.contains("is-paga");
    aplicarEstado(card, nome, !estavaPago);

    try {
      await PaymentService.alternar(mesAtual, nome);
      atualizarResumo();
      atualizarDots();
      atualizarPill();
    } catch (erro) {
      console.error("TSUKI: falha ao salvar.", erro);
      aplicarEstado(card, nome, estavaPago);
      atualizarResumo();
      atualizarDots();
      atualizarPill();
      mostrarToast("Não foi possível salvar. Alteração desfeita.");
    }
  }

  function avisarBloqueio(card) {
    retrucar(card.querySelector(".switch"), "negar");
    mostrarToast("Faça login para alterar os pagamentos.");
  }

  function aplicarEstado(card, nome, pago) {
    card.classList.toggle("is-paga", pago);
    const botao = card.querySelector(".switch");
    botao.setAttribute("aria-checked", String(pago));
    botao.setAttribute("aria-label", rotuloSwitch(nome, pago));
    card.querySelector(".status-txt").textContent =
      pago ? "Pagamento confirmado" : "Pagamento pendente";

    if (pago && !reduzido) {
      retrucar(card, "flash");
      emitirFaiscas(card, botao);
    }
  }

  function emitirFaiscas(card, origem) {
    const cx = origem.offsetLeft + origem.offsetWidth / 2;
    const cy = origem.offsetTop + origem.offsetHeight / 2;
    for (let i = 0; i < 9; i++) {
      const f = document.createElement("span");
      f.className = "spark";
      const angulo = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
      const dist = 26 + Math.random() * 26;
      f.style.left = `${cx}px`;
      f.style.top = `${cy}px`;
      f.style.setProperty("--dx", `${Math.cos(angulo) * dist}px`);
      f.style.setProperty("--dy", `${Math.sin(angulo) * dist}px`);
      card.appendChild(f);
      f.addEventListener("animationend", () => f.remove());
    }
  }

  /* ─────────── resumo ─────────── */
  function atualizarResumo() {
    const total = pessoas.length;
    const pagos = PaymentService.contagemPagos(mesAtual);
    const pendentes = total - pagos;
    const pct = Math.round((pagos / total) * 100);

    el.ringFill.style.strokeDashoffset = CIRCUNFERENCIA * (1 - pct / 100);
    el.barFill.style.width = `${pct}%`;
    el.bar.setAttribute("aria-valuenow", pct);

    definirNumero(el.pctNum, pct);
    definirNumero(el.nPagos, pagos);
    definirNumero(el.nPendentes, pendentes);

    if (pagos === 0) {
      el.resumoTexto.textContent = "Nenhum pagamento confirmado neste mês.";
    } else if (pagos === total) {
      el.resumoTexto.textContent = "Todos os pagamentos confirmados. Mês fechado!";
    } else {
      el.resumoTexto.innerHTML = `<strong>${pagos}</strong> de ${total} pagamentos confirmados.`;
    }
  }

  function definirNumero(elemento, alvo) {
    const atual = Number(elemento.textContent) || 0;
    if (atual === alvo) return;
    if (reduzido) { elemento.textContent = alvo; return; }

    cancelAnimationFrame(elemento._raf);
    const inicio = performance.now();
    const duracao = 480;
    const passo = (agora) => {
      const p = Math.min(1, (agora - inicio) / duracao);
      const suave = 1 - Math.pow(1 - p, 3);
      elemento.textContent = Math.round(atual + (alvo - atual) * suave);
      if (p < 1) elemento._raf = requestAnimationFrame(passo);
    };
    elemento._raf = requestAnimationFrame(passo);
  }

  function atualizarDots() {
    const total = pessoas.length;
    meses.forEach((_, i) => {
      const n = PaymentService.contagemPagos(i);
      chips[i].dataset.nivel = n === 0 ? "nenhum" : n === total ? "completo" : "parcial";
    });
  }

  function atualizarPill() {
    const pagos = PaymentService.contagemPagos(mesAtual);
    el.pillResumo.innerHTML =
      `${mesesCurtos[mesAtual]} · <b>${pagos}/${pessoas.length}</b> pagos`;
  }

  /* ─────────── modo admin / visitante ─────────── */
  function definirModoAdmin(ativo) {
    document.body.classList.toggle("modo-admin", ativo);
    document.body.classList.toggle("modo-visitante", !ativo);
    document.querySelectorAll(".switch").forEach((s) =>
      s.setAttribute("aria-disabled", String(!ativo))
    );
  }

  /** Re-renderiza tudo com os dados recém-carregados (login/logout). */
  function sincronizar() {
    renderizarCartoes();
    atualizarResumo();
    atualizarDots();
    atualizarPill();
  }

  /* ─────────── autenticação (interface) ─────────── */
  function ligarEventosAutenticacao() {
    el.btnEntrar.addEventListener("click", abrirLogin);
    el.btnFecharLogin.addEventListener("click", fecharLogin);
    el.btnSair.addEventListener("click", sairDaConta);
    el.loginModal.addEventListener("click", (e) => {
      if (e.target === el.loginModal) fecharLogin();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.loginModal.classList.contains("aberto")) fecharLogin();
    });
        el.loginForm.addEventListener("submit", enviarLogin);

    el.btnVerSenha.addEventListener("click", () => {
      const mostrando = el.loginSenha.type === "text";
      el.loginSenha.type = mostrando ? "password" : "text";
      el.btnVerSenha.classList.toggle("mostrando", !mostrando);
      el.btnVerSenha.setAttribute("aria-pressed", String(!mostrando));
      el.btnVerSenha.setAttribute("aria-label", mostrando ? "Mostrar senha" : "Ocultar senha");
      el.loginSenha.focus();
    });
  }
  }

  function abrirLogin() {
    ultimoFoco = document.activeElement;
    el.loginErro.textContent = "";
    el.loginModal.classList.add("aberto");
    setTimeout(() => el.loginEmail.focus(), 80);
  }

  function fecharLogin() {
    el.loginModal.classList.remove("aberto");
    if (ultimoFoco && typeof ultimoFoco.focus === "function") ultimoFoco.focus();
  }

  async function enviarLogin(e) {
    e.preventDefault();
    const email = el.loginEmail.value.trim();
    const senha = el.loginSenha.value;
    if (!email || !senha) {
      el.loginErro.textContent = "Informe e-mail e senha.";
      return;
    }
    el.loginSubmit.disabled = true;
    el.loginSubmit.textContent = "Entrando…";
    el.loginErro.textContent = "";
    try {
      await AuthService.entrar(email, senha);
      el.loginForm.reset();
      fecharLogin();
      mostrarToast("Bem-vindo, administrador.");
    } catch (erro) {
      el.loginErro.textContent = mensagemErroLogin(erro);
    } finally {
      el.loginSubmit.disabled = false;
      el.loginSubmit.textContent = "Entrar";
    }
  }

  function mensagemErroLogin(erro) {
    const msg = erro?.message || "";
    if (msg.includes("não configurado")) return "Supabase ainda não configurado (js/supabase-client.js).";
    if (msg.includes("Invalid login credentials")) return "E-mail ou senha inválidos.";
    if (msg.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
    if (msg.includes("rate limit")) return "Muitas tentativas. Aguarde um instante.";
    return "Não foi possível entrar. Tente novamente.";
  }

  async function sairDaConta() {
    try {
      await AuthService.sair();
      mostrarToast("Sessão encerrada.");
    } catch (erro) {
      console.error(erro);
      mostrarToast("Não foi possível sair.");
    }
  }

  /* ─────────── utilidades ─────────── */
  function retrucar(elemento, classe) {
    elemento.classList.remove(classe);
    void elemento.offsetWidth;
    elemento.classList.add(classe);
  }

  function mostrarToast(mensagem) {
    el.toast.textContent = mensagem;
    el.toast.classList.add("visivel");
    clearTimeout(el.toast._tempo);
    el.toast._tempo = setTimeout(() => el.toast.classList.remove("visivel"), 2600);
  }

  function mesPreferido() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_UI));
      if (salvo && Number.isInteger(salvo.mes) && salvo.mes >= 0 && salvo.mes <= 11) {
        return salvo.mes;
      }
    } catch { /* ignora */ }
    return new Date().getMonth();
  }

  function salvarMesPreferido(mes) {
    try { localStorage.setItem(CHAVE_UI, JSON.stringify({ mes })); } catch { /* ignora */ }
  }

  /* ─────────── rail: setas + teclado ─────────── */
  let setasAgendadas = false;

  function ligarEventosGlobais() {
    el.railPrev.addEventListener("click", () => deslocarRail(-1));
    el.railNext.addEventListener("click", () => deslocarRail(1));
    el.rail.addEventListener("scroll", agendarSetas, { passive: true });
    window.addEventListener("resize", atualizarSetas);
    window.addEventListener("load", atualizarSetas);

    el.rail.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const passo = e.key === "ArrowRight" ? 1 : -1;
      const alvo = (mesAtual + passo + 12) % 12;
      selecionarMes(alvo);
      chips[alvo].focus();
    });

    atualizarSetas();
  }

  function deslocarRail(direcao) {
    el.rail.scrollBy({ left: direcao * 260, behavior: reduzido ? "auto" : "smooth" });
  }

  function agendarSetas() {
    if (setasAgendadas) return;
    setasAgendadas = true;
    requestAnimationFrame(() => { atualizarSetas(); setasAgendadas = false; });
  }

  function atualizarSetas() {
    const rola = el.rail.scrollWidth > el.rail.clientWidth + 4;
    el.railPrev.disabled = !rola || el.rail.scrollLeft <= 4;
    el.railNext.disabled = !rola || el.rail.scrollLeft + el.rail.clientWidth >= el.rail.scrollWidth - 4;
  }

  return { iniciar, definirModoAdmin, sincronizar };
})();
