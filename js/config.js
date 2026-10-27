/** Dados fixos da aplicação. */

/** Nomes exibidos, na ordem dos cartões. */
const LISTA_PESSOAS = ["Vinicius", "Ausente", "Matheus", "Clarinha", "João"];

/**
 * Vagas sem pessoa: aparecem na lista, mas ficam esmaecidas, não podem ser
 * marcadas como pagas e NÃO entram na contagem total (o mês pode fechar em 100%).
 */
const LISTA_VAGAS = ["Ausente"];

/**
 * Nomes antigos que ainda podem existir gravados no Supabase.
 * A leitura converte automaticamente para o nome atual, então o histórico
 * não se perde mesmo que a migração ainda não tenha sido rodada.
 * Migração definitiva: supabase/migrations/0002_renomear_pessoas.sql
 */
const NOMES_LEGADOS = Object.freeze({
  "Pedro": "Ausente",
  "Lucas": "Clarinha"
});

const APP_CONFIG = Object.freeze({
  nomeApp: "TSUKI",
  versaoDados: 2,
  pessoas: Object.freeze(LISTA_PESSOAS),
  vagas: Object.freeze(LISTA_VAGAS),
  /** Quem realmente conta nas estatísticas (5 cartões, 4 mensalistas). */
  ativos: Object.freeze(LISTA_PESSOAS.filter((nome) => !LISTA_VAGAS.includes(nome))),
  nomesLegados: NOMES_LEGADOS,
  meses: Object.freeze([
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ]),
  mesesCurtos: Object.freeze([
    "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
    "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"
  ])
});

/**
 * Traduz um nome vindo do banco para o nome atual.
 * Devolve null quando o nome não pertence mais ao grupo (registro órfão).
 */
function nomeAtual(nome) {
  if (typeof nome !== "string" || !nome) return null;
  const traduzido = Object.prototype.hasOwnProperty.call(NOMES_LEGADOS, nome)
    ? NOMES_LEGADOS[nome]
    : nome;
  return LISTA_PESSOAS.includes(traduzido) ? traduzido : null;
}

/** É uma vaga sem pessoa (não conta, não é clicável, não é gravada)? */
function ehVaga(nome) {
  return LISTA_VAGAS.includes(nome);
}
