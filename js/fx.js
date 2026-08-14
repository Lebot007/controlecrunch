/** Efeito ambiente: brasas flutuantes em canvas. Leve, pausa quando a aba fica oculta. */
const FX = (() => {
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let canvas, ctx, largura, altura, particulas = [], rafId = null, ativo = false;

  function dimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    largura = window.innerWidth;
    altura = window.innerHeight;
    canvas.width = largura * dpr;
    canvas.height = altura * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function criarParticulas() {
    const alvo = Math.min(40, Math.max(16, Math.round((largura * altura) / 34000)));
    particulas = Array.from({ length: alvo }, () => ({
      x: Math.random() * largura,
      y: Math.random() * altura,
      raio: 0.7 + Math.random() * 1.6,
      vx: -0.05 + Math.random() * 0.1,
      vy: -(0.1 + Math.random() * 0.28),
      alfa: 0.12 + Math.random() * 0.35,
      fase: Math.random() * Math.PI * 2,
      velFase: 0.006 + Math.random() * 0.02
    }));
  }

  function desenhar() {
    ctx.clearRect(0, 0, largura, altura);
    ctx.fillStyle = "#ff8a3c";
    for (const p of particulas) {
      p.x += p.vx; p.y += p.vy; p.fase += p.velFase;
      if (p.y < -10) { p.y = altura + 10; p.x = Math.random() * largura; }
      if (p.x < -10) p.x = largura + 10;
      else if (p.x > largura + 10) p.x = -10;
      ctx.globalAlpha = Math.max(0, p.alfa * (0.55 + 0.45 * Math.sin(p.fase)));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.raio, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(desenhar);
  }

  function pausar() { ativo = false; cancelAnimationFrame(rafId); }
  function retomar() {
    if (!ativo && !reduzido) { ativo = true; rafId = requestAnimationFrame(desenhar); }
  }

  return {
    iniciar() {
      if (reduzido) return;
      canvas = document.getElementById("fx");
      if (!canvas) return;
      ctx = canvas.getContext("2d");
      dimensionar();
      criarParticulas();
      retomar();

      let tempoRedimensionar;
      window.addEventListener("resize", () => {
        clearTimeout(tempoRedimensionar);
        tempoRedimensionar = setTimeout(() => { dimensionar(); criarParticulas(); }, 180);
      });
      document.addEventListener("visibilitychange", () =>
        document.hidden ? pausar() : retomar()
      );
    }
  };
})();