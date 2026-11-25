import type { Analise, Doc } from '../../core/schema';

export type RunView = {
  key: string; // A | B | BU | LIVE
  provenance: 'stored' | 'live';
  file?: string;
  response_id: string | null;
  model: string | null;
  started_at: string;
  latency_ms: number;
  usage: { input_tokens: number | null; output_tokens: number | null; reasoning_tokens?: number | null };
  docs_fornecidos: string[];
  output: Analise;
  validation: any;
  judge?: any;
  metrics?: any;
};
export type ScenarioView = {
  id: string; split: string; municipio: string; categoria: string; titulo: string; alerta_data: string;
  docs: Doc[]; atualizacao: Doc[];
  runs: Record<string, RunView>;
  gold: any;
};
export type IndexView = {
  scenarios: { id: string; split: string; municipio: string; categoria: string; titulo: string; alerta: string; n_docs: number; metrics: Record<string, any> }[];
  summary: any;
  featured: string[];
  config: any;
  generated_at: string;
};

const cache = new Map<string, Promise<any>>();
export function getJSON<T>(url: string): Promise<T> {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ao carregar ${url}`); return r.json(); }));
  return cache.get(url)!;
}
export const loadIndex = () => getJSON<IndexView>('/data/index.json');
export const loadScenario = (id: string) => getJSON<ScenarioView>(`/data/scenario/${id}.json`);
export const loadMethod = () => getJSON<any>('/data/method.json');

export const CATEGORIA_LABEL: Record<string, string> = {
  dependencia_historica: 'Dependência histórica',
  intersetorial_saude_energia: 'Saúde × energia',
  intersetorial_agua: 'Água e abastecimento',
  intersetorial_educacao: 'Educação × abrigo',
  intersetorial_energia: 'Energia × abrigo',
  historico_irrelevante: 'Histórico irrelevante',
  problema_solucionado: 'Problema já solucionado',
  contradicao_historico_atual: 'Contradição histórico × atual',
  contradicao_atual: 'Contradição entre documentos atuais',
  contradicao_memoria: 'Registros históricos divergentes',
  mudanca_responsavel: 'Mudança de responsável',
  alteracao_protocolo: 'Alteração de protocolo',
  informacao_insuficiente: 'Informação insuficiente',
  memoria_prejudicial: 'Memória pode atrapalhar',
  memoria_prejudicial_magnitude: 'Memória pode exagerar',
  memoria_nao_acrescenta: 'Memória não acrescenta',
  memoria_com_distratores: 'Memória com distratores',
  evidencia_ambigua: 'Evidência ambígua',
  solucao_parcial: 'Solução parcial',
};
export const STATUS_LABEL: Record<string, string> = {
  fato_documentado: 'Fato documentado',
  inferencia: 'Inferência',
  hipotese: 'Hipótese',
  contradicao: 'Contradição',
  superado: 'Superado',
  informacao_insuficiente: 'Informação insuficiente',
};
export const STATUS_CHIP: Record<string, string> = {
  fato_documentado: '', inferencia: 'water', hipotese: 'hyp', contradicao: 'contra', superado: 'grey', informacao_insuficiente: 'grey',
};
export const BASE_LABEL: Record<string, string> = { informacao_atual: 'Informação atual', registro_historico: 'Memória institucional', ambos: 'Atual + memória' };
export const BASE_CHIP: Record<string, string> = { informacao_atual: 'water', registro_historico: 'memory', ambos: 'both' };
export const TEMPORAL_LABEL: Record<string, string> = {
  atualizacao: 'Atualização', mudanca_responsavel: 'Mudança de responsável', alteracao_protocolo: 'Alteração de protocolo',
  problema_resolvido: 'Problema resolvido', pendencia_historica: 'Pendência histórica', contradicao: 'Contradição',
  historico_superado: 'Histórico superado', vigencia_encerrada: 'Vigência encerrada', solucao_parcial: 'Solução parcial',
};
export const fmtDate = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
export const pct = (x: number | null | undefined, digits = 0) => (x == null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(digits)}%`);
export const alertLevel = (docs: Doc[]) => {
  const a = docs.find((d) => d.tipo === 'alerta_simulado');
  const m = a?.texto.match(/NÍVEL:\s*([A-ZÁÉ]+)/);
  return (m?.[1] ?? 'ALERTA').toLowerCase();
};
