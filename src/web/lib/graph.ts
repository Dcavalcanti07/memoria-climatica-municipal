/**
 * Converte a saída estruturada da IA em um grafo navegável e compara grafos entre execuções
 * (A × B × B+atualização). Nada aqui inventa relações: nós e arestas vêm 100% das saídas do modelo.
 * O pareamento entre execuções é determinístico (similaridade de rótulos).
 */
import type { Analise, Doc } from '../../core/schema';

export const LANES = [
  { key: 'evento', label: 'Eventos e alertas', types: ['evento', 'norma_documento'] },
  { key: 'infra', label: 'Infraestrutura e locais', types: ['infraestrutura', 'local'] },
  { key: 'serv', label: 'Serviços e recursos', types: ['servico', 'equipamento', 'recurso'] },
  { key: 'pessoas', label: 'Pessoas e setores', types: ['grupo_populacional', 'setor', 'funcao_responsavel'] },
] as const;
export const laneOf = (t: string) => Math.max(0, LANES.findIndex((l) => (l.types as readonly string[]).includes(t)));

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'a', 'o', 'e', 'em', 'na', 'no', 'para', 'por', 'com', 'municipal', 'municipio']);
export function tokens(s: string) {
  return new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t)));
}
export function sim(a: string, b: string) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size) * (inter / Math.max(A.size, B.size)) ** 0.25;
}

export type GNode = { key: string; label: string; tipo: string; lane: number; desc: string; setor: string | null; ids: Record<string, string>; firstDate: string; memoryOnly: boolean; degree: number; x: number; y: number };
export type GEdge = { key: string; s: string; t: string; ids: Record<string, string>; byRun: Record<string, { rotulo: string; status: string; tipo: string; evid: { doc_id: string; trecho: string }[]; periodo: any }>; firstDate: string; mem: boolean };
export type UnionGraph = { nodes: GNode[]; edges: GEdge[]; runs: string[] };

/** Monta um grafo-união das execuções informadas, com layout único (posições estáveis entre modos). */
export function buildUnion(runs: { key: string; out: Analise }[], docs: Doc[], width: number, height: number): UnionGraph {
  const docDate = new Map(docs.map((d) => [d.id, d.data]));
  const docMem = new Map(docs.map((d) => [d.id, d.conjunto === 'memoria']));
  const nodes: GNode[] = [];
  const localToKey: Record<string, Record<string, string>> = {};

  const evidDates = (out: Analise, entId: string) => out.relacoes.filter((r) => r.origem === entId || r.destino === entId).flatMap((r) => r.evidencias.map((e) => docDate.get(e.doc_id) ?? '9999'));

  for (const { key: rk, out } of runs) {
    localToKey[rk] = {};
    for (const e of out.entidades) {
      let best: GNode | null = null, bestS = 0;
      for (const n of nodes) {
        if (n.ids[rk]) continue;
        const s = sim(n.label, e.nome);
        if (s > bestS) { bestS = s; best = n; }
      }
      const dates = evidDates(out, e.id);
      const first = dates.length ? dates.sort()[0] : '9999';
      if (best && bestS >= 0.55) {
        best.ids[rk] = e.id;
        if (first < best.firstDate) best.firstDate = first;
        localToKey[rk][e.id] = best.key;
      } else {
        const key = `n${nodes.length}`;
        nodes.push({ key, label: e.nome, tipo: e.tipo, lane: laneOf(e.tipo), desc: e.descricao, setor: e.setor_responsavel, ids: { [rk]: e.id }, firstDate: first, memoryOnly: false, degree: 0, x: 0, y: 0 });
        localToKey[rk][e.id] = key;
      }
    }
  }

  const edges: GEdge[] = [];
  for (const { key: rk, out } of runs) {
    for (const r of out.relacoes) {
      const s = localToKey[rk][r.origem], t = localToKey[rk][r.destino];
      if (!s || !t || s === t) continue;
      let e = edges.find((x) => !x.ids[rk] && ((x.s === s && x.t === t) || (x.s === t && x.t === s)));
      const info = { rotulo: r.rotulo, status: r.status_epistemico, tipo: r.tipo, evid: r.evidencias, periodo: r.periodo };
      const dates = r.evidencias.map((ev) => docDate.get(ev.doc_id) ?? '9999').sort();
      const mem = r.evidencias.some((ev) => docMem.get(ev.doc_id));
      if (!e) { e = { key: `e${edges.length}`, s, t, ids: {}, byRun: {}, firstDate: dates[0] ?? '9999', mem }; edges.push(e); }
      e.ids[rk] = r.id; e.byRun[rk] = info; e.mem = e.mem || mem;
      if ((dates[0] ?? '9999') < e.firstDate) e.firstDate = dates[0];
    }
  }
  for (const e of edges) { nodes.find((n) => n.key === e.s)!.degree++; nodes.find((n) => n.key === e.t)!.degree++; }

  // layout determinístico em colunas semânticas (eventos → infraestrutura → serviços → pessoas/setores).
  // Dentro de cada coluna, ordenação baricêntrica para reduzir cruzamentos; espaçamento uniforme.
  const padX = 110, laneW = (width - padX * 2) / (LANES.length - 1);
  const top = 56, bottom = height - 40;
  const nbrs = new Map<string, string[]>(nodes.map((n) => [n.key, []]));
  for (const e of edges) { nbrs.get(e.s)!.push(e.t); nbrs.get(e.t)!.push(e.s); }
  const lanes: GNode[][] = LANES.map((_, i) => nodes.filter((n) => n.lane === i).sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label)));
  const place = () => lanes.forEach((ln, li) => {
    const span = bottom - top; const step = span / Math.max(1, ln.length);
    ln.forEach((n, i) => { n.x = padX + li * laneW + (ln.length > 6 ? (i % 2 ? 26 : -26) : 0); n.y = top + step * (i + 0.5); });
  });
  place();
  for (let it = 0; it < 6; it++) {
    for (const ln of lanes) {
      const bc = new Map(ln.map((n) => { const ns = nbrs.get(n.key)!.map((k) => nodes.find((m) => m.key === k)!.y); return [n.key, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : n.y]; }));
      ln.sort((a, b) => bc.get(a.key)! - bc.get(b.key)!);
    }
    place();
  }
  return { nodes, edges, runs: runs.map((r) => r.key) };
}

export type Change = 'new' | 'same' | 'status' | 'gone';
/** Diferença entre duas execuções no grafo-união. */
export function diffEdge(e: GEdge, from: string, to: string): Change | null {
  const a = e.byRun[from], b = e.byRun[to];
  if (!a && !b) return null;
  if (!a && b) return 'new';
  if (a && !b) return 'gone';
  return a!.status === b!.status ? 'same' : 'status';
}
