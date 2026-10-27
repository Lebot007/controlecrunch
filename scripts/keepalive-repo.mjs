#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────
 *  KEEP-ALIVE DO AGENDAMENTO · evita o GitHub desligar o cron
 * ─────────────────────────────────────────────────────────────
 *  O GitHub DESATIVA automaticamente workflows `schedule:` em
 *  repositórios sem atividade por 60 dias. Sem isto, o ping do
 *  Supabase pararia em silêncio depois de dois meses — e o banco
 *  seria pausado logo em seguida.
 *
 *  Solução: gravar/atualizar um arquivo minúsculo (.keepalive/
 *  heartbeat.json) uma vez por mês. Commit conta como atividade
 *  do repositório e mantém o agendamento ligado.
 *
 *  Requer (o Actions já fornece):
 *    GITHUB_TOKEN       token padrão do workflow (permissão contents: write)
 *    GITHUB_REPOSITORY  "dono/nome"
 *  Opcionais:
 *    COMMIT_AUTHOR_NAME / COMMIT_AUTHOR_EMAIL
 *    KEEPALIVE_ARQUIVO  (padrão .keepalive/heartbeat.json)
 * ─────────────────────────────────────────────────────────────
 */

const ARQUIVO = process.env.KEEPALIVE_ARQUIVO || ".keepalive/heartbeat.json";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const BRANCH = process.env.GITHUB_REF_NAME || "main";

if (!TOKEN || !REPO) {
  console.error("[heartbeat] faltou GITHUB_TOKEN ou GITHUB_REPOSITORY no ambiente.");
  process.exit(1);
}

const API = `https://api.github.com/repos/${REPO}`;
const CABECALHOS = {
  "Authorization": `Bearer ${TOKEN}`,
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "tsuki-keepalive"
};

async function chamar(url, opcoes = {}) {
  const resposta = await fetch(url, {
    ...opcoes,
    headers: { ...CABECALHOS, ...(opcoes.headers || {}) }
  });
  const texto = await resposta.text();
  let dados = null;
  try { dados = JSON.parse(texto); } catch { /* respostas não-JSON */ }
  return { status: resposta.status, dados, texto };
}

/** Autor do commit: o dono do repositório, com o e-mail noreply oficial. */
async function resolverAutor() {
  const padrao = { name: "github-actions[bot]", email: "41898282+github-actions[bot]@users.noreply.github.com" };
  if (process.env.COMMIT_AUTHOR_NAME && process.env.COMMIT_AUTHOR_EMAIL) {
    return { name: process.env.COMMIT_AUTHOR_NAME, email: process.env.COMMIT_AUTHOR_EMAIL };
  }
  const dono = REPO.split("/")[0];
  try {
    const { status, dados } = await chamar(`https://api.github.com/users/${dono}`);
    if (status === 200 && dados?.id) {
      return { name: dono, email: `${dados.id}+${dono}@users.noreply.github.com` };
    }
  } catch (erro) {
    console.warn(`[heartbeat] não consegui resolver o autor (${erro?.message}); usando o padrão.`);
  }
  return padrao;
}

async function principal() {
  const autor = await resolverAutor();

  // SHA atual do arquivo (só existe depois do primeiro heartbeat)
  const atual = await chamar(`${API}/contents/${ARQUIVO}?ref=${encodeURIComponent(BRANCH)}`);
  const sha = atual.status === 200 ? atual.dados?.sha : undefined;

  const conteudo = JSON.stringify({
    ultimoHeartbeat: new Date().toISOString(),
    motivo: "Commit automático mensal: mantém o workflow agendado ativo (o GitHub desativa crons após 60 dias sem atividade no repositório)."
  }, null, 2) + "\n";

  const corpo = {
    message: `chore(keep-alive): heartbeat ${new Date().toISOString().slice(0, 10)} [skip ci]`,
    content: Buffer.from(conteudo, "utf8").toString("base64"),
    branch: BRANCH,
    author: autor,
    committer: autor
  };
  if (sha) corpo.sha = sha;

  const r = await chamar(`${API}/contents/${ARQUIVO}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  });

  if (r.status === 200 || r.status === 201) {
    console.log(`[heartbeat] ✅ ${ARQUIVO} atualizado em ${BRANCH} como ${autor.name} <${autor.email}>`);
    console.log(`[heartbeat]    commit: ${r.dados?.commit?.sha?.slice(0, 7) ?? "?"}`);
    process.exit(0);
  }

  console.error(`[heartbeat] ❌ HTTP ${r.status} ao gravar ${ARQUIVO}: ${r.texto.slice(0, 400)}`);
  if (r.status === 403) {
    console.error("[heartbeat]    Provável causa: permission 'contents: write' ausente ou branch protegida.");
  }
  process.exit(1);
}

principal();
