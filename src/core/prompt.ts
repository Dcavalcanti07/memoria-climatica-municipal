import type { Doc, Scenario } from './schema';

export type Condicao = 'A' | 'B';

/** Seleciona documentos por condição. A = atual; B = atual + memória. Ordem cronológica em ambas. */
export function selectDocs(s: Scenario, cond: Condicao, extra: Doc[] = []): Doc[] {
  const base = s.docs.filter((d) => cond === 'B' || d.conjunto === 'atual');
  return [...base, ...extra].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

const TIPO_LABEL: Record<string, string> = {
  plano_de_contingencia: 'Plano de contingência',
  alerta_simulado: 'Cenário de alerta (fictício)',
  atualizacao_secretaria: 'Atualização de secretaria',
  relatorio_de_ocorrencia: 'Relatório de ocorrência',
  ata: 'Ata',
  protocolo: 'Protocolo/norma',
};

export function renderDocs(docs: Doc[]): string {
  return docs
    .map((d) => `### [${d.id}] ${d.titulo}\nTipo: ${TIPO_LABEL[d.tipo] ?? d.tipo} | Fonte: ${d.fonte} | Data: ${d.data}\n\n${d.texto}`)
    .join('\n\n---\n\n');
}

/** Mensagem do usuário: idêntica entre condições, exceto pelos documentos. */
export function buildUserMessage(s: Scenario, docs: Doc[]): string {
  return [
    `Município (fictício): ${s.municipio}`,
    `Data de referência da análise: ${s.alerta_data}`,
    `Documentos disponíveis (${docs.length}), em ordem cronológica:`,
    '',
    renderDocs(docs),
    '',
    'Produza a análise e a pauta de verificações preventivas no formato solicitado.',
  ].join('\n');
}
