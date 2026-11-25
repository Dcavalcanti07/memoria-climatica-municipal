/**
 * Validações determinísticas da saída do modelo:
 *  - integridade de identificadores (entidades citadas existem; doc_ids existem no conjunto fornecido)
 *  - fidelidade literal das citações (trecho aparece no documento citado)
 * Também normaliza a saída (remove relações órfãs do grafo, sem apagar o bruto).
 */
import type { Analise, Doc, Evidencia } from './schema';

export function norm(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[“”«»"]/g, '"')
    .replace(/[‘’`´']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripEdge(s: string) {
  return s.replace(/^[\s"'.…:;,-]+|[\s"'.…:;,-]+$/g, '');
}

export type QuoteCheck = { doc_id: string; trecho: string; doc_valido: boolean; literal: boolean; onde: string };

export function checkQuote(ev: Evidencia, docs: Map<string, Doc>, onde: string): QuoteCheck {
  const doc = docs.get(ev.doc_id);
  if (!doc) return { ...ev, doc_valido: false, literal: false, onde };
  const hay = norm(doc.texto + ' ' + doc.titulo);
  // aceita trechos separados por reticências: cada segmento precisa estar no texto
  const parts = ev.trecho.split(/\.\.\.|…|\[\.\.\.\]/).map((p) => stripEdge(norm(p))).filter((p) => p.length > 0);
  const literal = parts.length > 0 && parts.every((p) => hay.includes(p));
  return { ...ev, doc_valido: true, literal, onde };
}

export type Validation = {
  schema_ok: boolean;
  n_entidades: number; n_relacoes: number; n_verificacoes: number; n_temporais: number;
  relacoes_orfas: string[];
  verificacoes_entidades_invalidas: string[];
  ids_duplicados: string[];
  citacoes: QuoteCheck[];
  n_citacoes: number; n_citacoes_literais: number; n_citacoes_doc_invalido: number;
  verificacoes_sem_evidencia: string[];
};

export function validateAnalysis(a: Analise, provided: Doc[]): Validation {
  const docs = new Map(provided.map((d) => [d.id, d]));
  const ent = new Set(a.entidades.map((e) => e.id));
  const allIds = [...a.entidades, ...a.relacoes, ...a.achados_temporais, ...a.verificacoes].map((x) => x.id);
  const dup = allIds.filter((id, i) => allIds.indexOf(id) !== i);
  const citacoes: QuoteCheck[] = [];
  for (const r of a.relacoes) for (const e of r.evidencias) citacoes.push(checkQuote(e, docs, `relacao:${r.id}`));
  for (const t of a.achados_temporais) for (const e of t.evidencias) citacoes.push(checkQuote(e, docs, `temporal:${t.id}`));
  for (const v of a.verificacoes) for (const e of v.evidencias) citacoes.push(checkQuote(e, docs, `verificacao:${v.id}`));
  return {
    schema_ok: true,
    n_entidades: a.entidades.length, n_relacoes: a.relacoes.length, n_verificacoes: a.verificacoes.length, n_temporais: a.achados_temporais.length,
    relacoes_orfas: a.relacoes.filter((r) => !ent.has(r.origem) || !ent.has(r.destino)).map((r) => r.id),
    verificacoes_entidades_invalidas: a.verificacoes.flatMap((v) => v.entidades_relacionadas.filter((id) => !ent.has(id)).map((id) => `${v.id}:${id}`)),
    ids_duplicados: [...new Set(dup)],
    citacoes,
    n_citacoes: citacoes.length,
    n_citacoes_literais: citacoes.filter((c) => c.literal).length,
    n_citacoes_doc_invalido: citacoes.filter((c) => !c.doc_valido).length,
    verificacoes_sem_evidencia: a.verificacoes.filter((v) => v.evidencias.length === 0).map((v) => v.id),
  };
}

/** Validação estrutural mínima (caso o provedor não garanta o schema). */
export function assertShape(x: any): asserts x is Analise {
  const keys = ['resumo_situacao', 'entidades', 'relacoes', 'achados_temporais', 'verificacoes', 'informacoes_ausentes', 'cautelas'];
  for (const k of keys) if (!(k in x)) throw new Error(`saída sem campo obrigatório: ${k}`);
  for (const k of keys.slice(1)) if (!Array.isArray(x[k])) throw new Error(`campo ${k} deveria ser lista`);
}
