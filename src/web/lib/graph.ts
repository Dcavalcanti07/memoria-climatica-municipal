/**
 * Converte a saída estruturada da IA em um grafo navegável e compara grafos entre execuções
 * (A × B × B+atualização). Nada aqui inventa relações: nós e arestas vêm 100% das saídas do modelo.
 * O pareamento entre execuções é determinístico (similaridade de rótulos).
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { Analise, Doc, Entidade, Relacao } from '../../core/schema';

export const FAMILIES = [
  { key: 'evento', label: 'Eventos e normas', types: ['evento', 'norma_documento'] },
  { key: 'infra', label: 'Infraestrutura', types: ['infraestrutura'] },
  { key: 'local', label: 'Locais e abrigos', types: ['local'] },
  { key: 'serv', label: 'Serviços e recursos', types: ['servico', 'equipamento', 'recurso'] },
  { key: 'pessoas', label: 'Pessoas, setores e grupos', types: ['grupo_populacional', 'setor', 'funcao_responsavel'] },
] as const;
const familyOf = (t: string) => Math.max(0, FAMILIES.findIndex((l) => (l.types as readonly string[]).includes(t)));

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

export type GNode = {
  key: string; family: number; ids: Record<string, string>;
  byRun: Record<string, Entidade & { firstDoc: number }>;
};
export type GEdge = {
  key: string; s: string; t: string; ids: Record<string, string>;
  byRun: Record<string, Relacao & { firstDoc: number }>;
};
export type UnionGraph = { nodes: GNode[]; edges: GEdge[] };

/** Os rótulos e as evidências pertencem a cada execução. */
export function buildUnion(runs: { key: string; out: Analise }[], docs: Doc[]): UnionGraph {
  const docOrder = new Map(docs.map((d, i) => [d.id, i]));
  const firstDoc = (evidence: Relacao['evidencias']) => Math.min(...evidence.map((e) => docOrder.get(e.doc_id) ?? Infinity));
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  for (const { key: run, out } of runs) {
    const local = new Map<string, string>();
    for (const entity of out.entidades) {
      const family = familyOf(entity.tipo);
      let best: GNode | undefined;
      let score = 0.62;
      for (const node of nodes) {
        if (node.ids[run] || node.family !== family) continue;
        const similarity = Math.max(...Object.values(node.byRun).map((other) => sim(other.nome, entity.nome)));
        if (similarity >= score && (!best || similarity > score)) { best = node; score = similarity; }
      }
      if (!best) {
        best = { key: `n${nodes.length}`, family, ids: {}, byRun: {} };
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

  return { nodes, edges };
}

export const LABEL_HEIGHT = 13;

export function labelLines(name: string) {
  const lines: string[] = [];
  for (const word of name.trim().split(/\s+/)) {
    const last = lines.length - 1;
    const joined = last < 0 ? word : `${lines[last]} ${word}`;
    if (last >= 0 && joined.length <= 24) lines[last] = joined;
    else lines.push(word);
  }
  return lines.slice(0, 2).map((line, i) =>
    line.length > 24 || (i === 1 && lines.length > 2) ? `${line.slice(0, 23)}…` : line);
}

export type PositionedNode = { x: number; y: number; radius: number };
type LayoutNode = PositionedNode & { key: string; family: number; spacing: number };

export function layoutGraph({ nodes, edges }: UnionGraph) {
  const degree = new Map(nodes.map((node) => [node.key, 0]));
  for (const { s, t } of edges) {
    degree.set(s, degree.get(s)! + 1);
    if (s !== t) degree.set(t, degree.get(t)! + 1);
  }

  const families = [...new Set(nodes.map((node) => node.family))].sort((a, b) => a - b);
  const centers = new Map(families.map((family, i) => [family, (i - (families.length - 1) / 2) * 104]));
  const points: LayoutNode[] = nodes.map((node, i) => {
    const radius = Math.min(12, 4 + 1.45 * Math.sqrt(degree.get(node.key)!));
    const longest = Math.max(...Object.values(node.byRun).flatMap(({ nome }) => labelLines(nome).map((line) => line.length)));
    return {
      key: node.key, family: node.family, radius,
      spacing: Math.max(27, longest * 2.25 + radius),
      x: centers.get(node.family)! + Math.cos(i * 2.4) * 42,
      y: Math.sin(i * 2.4) * 105,
    };
  });
  const links = edges.map(({ s, t }) => ({ source: s, target: t }));
  // d3-force starts with a fixed random seed. The union and its ordering stay fixed across conditions.
  forceSimulation(points).stop()
    .force('links', forceLink<LayoutNode, typeof links[number]>(links).id((node) => node.key).distance(104).strength(0.38))
    .force('repulsion', forceManyBody().strength(-150))
    .force('collision', forceCollide<LayoutNode>((node) => node.spacing).iterations(3))
    .force('family', forceX<LayoutNode>((node) => centers.get(node.family)!).strength(0.17))
    .force('vertical', forceY<LayoutNode>(0).strength(0.082))
    .tick(300);

  const positions = new Map(points.map((point) => [point.key, point]));
  const groups = new Map<string, GEdge[]>();
  for (const edge of edges) {
    const key = [edge.s, edge.t].sort().join('/');
    const group = groups.get(key);
    if (group) group.push(edge);
    else groups.set(key, [edge]);
  }
  const routes = new Map<string, ReturnType<typeof routeEdge>>();
  for (const group of groups.values()) {
    group.forEach((edge, i) => {
      const bend = (i - (group.length - 1) / 2) * 20 + 6;
      routes.set(edge.key, routeEdge(positions.get(edge.s)!, positions.get(edge.t)!, edge.s <= edge.t ? bend : -bend, i));
    });
  }
  return { positions, routes };
}

function routeEdge(a: PositionedNode, b: PositionedNode, bend: number, loop: number) {
  if (a === b) {
    const reach = a.radius + 23 + loop * 12;
    const dx = a.radius * 0.75;
    return {
      d: `M${a.x - dx},${a.y - dx} C${a.x - reach},${a.y - reach} ${a.x + reach},${a.y - reach} ${a.x + dx},${a.y - dx}`,
      x: a.x, y: a.y - (dx + 3 * reach) / 4,
    };
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const cx = (a.x + b.x) / 2 - dy / length * bend;
  const cy = (a.y + b.y) / 2 + dx / length * bend;
  const boundary = (node: PositionedNode) => {
    const ratio = (node.radius + 2) / (Math.hypot(cx - node.x, cy - node.y) || 1);
    return { x: node.x + (cx - node.x) * ratio, y: node.y + (cy - node.y) * ratio };
  };
  const s = boundary(a), t = boundary(b);
  return { d: `M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`, x: (s.x + 2 * cx + t.x) / 4, y: (s.y + 2 * cy + t.y) / 4 };
}
