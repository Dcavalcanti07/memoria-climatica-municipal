/**
 * Converte a saída estruturada da IA em um grafo navegável e compara grafos entre execuções
 * (A × B × B+atualização). Nada aqui inventa relações: nós e arestas vêm 100% das saídas do modelo.
 * O pareamento entre execuções é determinístico (similaridade de rótulos).
 */
import type { Analise, Doc, Entidade, Relacao } from '../../core/schema';

export const LANES = [
  { key: 'evento', label: 'Eventos e alertas', types: ['evento', 'norma_documento'] },
  { key: 'infra', label: 'Infraestrutura', types: ['infraestrutura'] },
  { key: 'local', label: 'Locais e abrigos', types: ['local'] },
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
  return inter / (A.size + B.size - inter);
}

export const MAP_WIDTH = 1060;
export const NODE_WIDTH = 152;
export const NODE_HEIGHT = 58;
const ROW_HEIGHT = 74;
const FIRST_ROW = 100;

export type GNode = {
  key: string; label: string; lane: number; ids: Record<string, string>;
  byRun: Record<string, Entidade & { firstDoc: number }>; x: number; y: number;
};
export type GEdge = {
  key: string; s: string; t: string; ids: Record<string, string>;
  byRun: Record<string, Relacao & { firstDoc: number }>;
};
export type LaneDef = (typeof LANES)[number];
export type UnionGraph = { nodes: GNode[]; edges: GEdge[]; height: number; lanes: LaneDef[] };

export const laneCenter = (lane: number, count: number = LANES.length) => (lane + 0.5) * MAP_WIDTH / count;

/** As posições são compartilhadas. Os rótulos e as evidências pertencem a cada execução. */
export function buildUnion(runs: { key: string; out: Analise }[], docs: Doc[]): UnionGraph {
  const docOrder = new Map(docs.map((d, i) => [d.id, i]));
  const firstDoc = (evidence: Relacao['evidencias']) => Math.min(...evidence.map((e) => docOrder.get(e.doc_id) ?? Infinity));
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  for (const { key: run, out } of runs) {
    const local = new Map<string, string>();
    for (const entity of out.entidades) {
      const lane = laneOf(entity.tipo);
      let best: GNode | undefined;
      let score = 0.62;
      for (const node of nodes) {
        if (node.ids[run] || node.lane !== lane) continue;
        const similarity = Math.max(...Object.values(node.byRun).map((other) => sim(other.nome, entity.nome)));
        if (similarity >= score && (!best || similarity > score)) { best = node; score = similarity; }
      }
      if (!best) {
        best = { key: `n${nodes.length}`, label: entity.nome, lane, ids: {}, byRun: {}, x: laneCenter(lane), y: 0 };
        nodes.push(best);
      }
      const evidence = out.relacoes.filter((r) => r.origem === entity.id || r.destino === entity.id).flatMap((r) => r.evidencias);
      best.ids[run] = entity.id;
      best.byRun[run] = { ...entity, firstDoc: firstDoc(evidence) };
      local.set(entity.id, best.key);
    }

    for (const relation of out.relacoes) {
      const s = local.get(relation.origem), t = local.get(relation.destino);
      if (!s || !t) continue;
      const candidates = edges.filter((e) => e.s === s && e.t === t && !e.ids[run] && Object.values(e.byRun).some((r) => r.tipo === relation.tipo));
      const similarity = (e: GEdge) => Math.max(...Object.values(e.byRun).map((r) => sim(r.rotulo, relation.rotulo)));
      let edge = candidates.sort((a, b) => similarity(b) - similarity(a))[0];
      if (!edge) {
        edge = { key: `e${edges.length}`, s, t, ids: {}, byRun: {} };
        edges.push(edge);
      }
      edge.ids[run] = relation.id;
      edge.byRun[run] = { ...relation, firstDoc: firstDoc(relation.evidencias) };
    }
  }

  // colunas vazias não ocupam espaço: renumera as colunas usadas, mantendo a ordem semântica
  const used = [...new Set(nodes.map((n) => n.lane))].sort((a, b) => a - b);
  for (const n of nodes) { n.lane = used.indexOf(n.lane); n.x = laneCenter(n.lane, used.length); }
  const laneDefs = used.map((i) => LANES[i]);

  const neighbors = new Map(nodes.map((n) => [n.key, [] as GNode[]]));
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  for (const e of edges) {
    neighbors.get(e.s)!.push(byKey.get(e.t)!);
    neighbors.get(e.t)!.push(byKey.get(e.s)!);
  }
  const lanes = laneDefs.map((_, i) => nodes.filter((n) => n.lane === i).sort((a, b) => neighbors.get(b.key)!.length - neighbors.get(a.key)!.length || a.label.localeCompare(b.label, 'pt-BR')));
  const rows = Math.max(1, ...lanes.map((lane) => lane.length));
  const place = () => lanes.forEach((lane) => lane.forEach((node, i) => {
    const row = lane.length === 1 ? Math.floor((rows - 1) / 2) : Math.round(i * (rows - 1) / (lane.length - 1));
    node.y = FIRST_ROW + row * ROW_HEIGHT;
  }));
  place();
  for (let i = 0; i < 5; i++) {
    const center = new Map(nodes.map((n) => {
      const adjacent = neighbors.get(n.key)!;
      return [n.key, adjacent.length ? adjacent.reduce((sum, other) => sum + other.y, 0) / adjacent.length : n.y];
    }));
    for (const lane of lanes) lane.sort((a, b) => center.get(a.key)! - center.get(b.key)!);
    place();
  }
  return { nodes, edges, height: FIRST_ROW + (rows - 1) * ROW_HEIGHT + 56, lanes: laneDefs };
}

type Point = [number, number];

function roundedPath(points: Point[]) {
  const offset = ([x, y]: Point, [tx, ty]: Point) => {
    const distance = Math.hypot(tx - x, ty - y);
    const ratio = distance ? Math.min(12 / distance, 0.45) : 0;
    return [x + (tx - x) * ratio, y + (ty - y) * ratio];
  };
  return `M${points[0]}` + points.slice(1, -1).map((p, i) =>
    `L${offset(p, points[i])}Q${p} ${offset(p, points[i + 2])}`).join('') + `L${points[points.length - 1]}`;
}

/** Curvas suaves entre as laterais dos cartões; laços para relações dentro da mesma coluna. */
export function routeEdge(a: GNode, b: GNode, sourcePort: number, targetPort: number, channel: number, laneCount: number = LANES.length) {
  const direction = b.lane < a.lane || (a.lane === b.lane && a.lane === laneCount - 1) ? -1 : 1;
  const sx = a.x + direction * NODE_WIDTH / 2;
  const tx = b.x + (a.lane === b.lane ? direction : -direction) * NODE_WIDTH / 2;
  const sy = a.y + sourcePort;
  const ty = b.y + targetPort;
  if (a === b) {
    return { d: `M${sx},${sy - 13} C${sx + direction * 43},${sy - 38} ${sx + direction * 43},${sy + 38} ${sx},${sy + 13}`, x: sx + direction * 32, y: sy };
  }
  if (a.lane === b.lane) {
    const bulge = sx + direction * (34 + Math.min(60, Math.abs(ty - sy) * 0.18) + channel);
    return { d: `M${sx},${sy} C${bulge},${sy} ${bulge},${ty} ${tx},${ty}`, x: bulge - direction * 8, y: (sy + ty) / 2 };
  }
  const dx = Math.abs(tx - sx);
  const k = Math.max(40, dx * 0.45);
  const c1 = sx + direction * k, c2 = tx - direction * k;
  return { d: `M${sx},${sy} C${c1},${sy + channel} ${c2},${ty - channel} ${tx},${ty}`, x: (sx + 3 * c1 + 3 * c2 + tx) / 8, y: (sy + ty) / 2 };
}
