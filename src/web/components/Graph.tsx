import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { STATUS_LABEL } from '../lib/data';
import { LANES, MAP_WIDTH, NODE_HEIGHT, NODE_WIDTH, laneCenter, routeEdge, type GEdge, type GNode, type UnionGraph } from '../lib/graph';

type Props = {
  g: UnionGraph;
  run: string;
  base: string | null;
  cutoff: number | null;
  highlightNodes: Set<string>;
  highlightEdges: Set<string>;
  selectedEdge?: string;
  selectedNode?: string;
  onEdge: (e: GEdge) => void;
  onNode: (n: GNode) => void;
};

const MARK: Record<string, string> = { hipotese: '?', contradicao: '≠', superado: '×', informacao_insuficiente: '…' };
const STATUSES = Object.keys(STATUS_LABEL);

function activate(event: KeyboardEvent, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function wrapLabel(label: string) {
  const lines = [''];
  for (const word of label.split(/\s+/)) {
    const last = lines.length - 1;
    const candidate = `${lines[last]} ${word}`.trim();
    if (lines[last] && candidate.length > 19 && lines.length < 3) lines.push(word);
    else lines[last] = candidate;
  }
  return lines.map((line) => line.length > 20 ? `${line.slice(0, 19)}…` : line);
}

function Glyph({ tipo, r }: { tipo: string; r: number }) {
  switch (tipo) {
    case 'evento': return <path className="glyph" d={`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0Z`} />;
    case 'infraestrutura': return <rect className="glyph" x={-r * 0.85} y={-r * 0.85} width={r * 1.7} height={r * 1.7} rx={2} />;
    case 'local': return <path className="glyph" d={`M0 ${r} C ${-r} ${-r * 0.1}, ${-r * 0.8} ${-r}, 0 ${-r} C ${r * 0.8} ${-r}, ${r} ${-r * 0.1}, 0 ${r}Z`} />;
    case 'equipamento': return <path className="glyph" d={hex(r)} />;
    case 'recurso': return <path className="glyph" d={`M0 ${-r} L${r} ${r * 0.8} L${-r} ${r * 0.8}Z`} />;
    case 'grupo_populacional': return <g><circle className="glyph" r={r} /><circle className="glyph" r={r * 0.45} /></g>;
    case 'setor': case 'funcao_responsavel': return <rect className="glyph" x={-r * 1.1} y={-r * 0.7} width={r * 2.2} height={r * 1.4} rx={r * 0.7} />;
    case 'norma_documento': return <path className="glyph" d={`M${-r * 0.75} ${-r} H${r * 0.35} L${r * 0.75} ${-r * 0.6} V${r} H${-r * 0.75}Z`} />;
    default: return <circle className="glyph" r={r} />;
  }
}
function hex(r: number) {
  const p = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`; });
  return `M${p.join(' L')}Z`;
}
export function Graph({ g, run, base, cutoff, highlightNodes, highlightEdges, selectedEdge, selectedNode, onEdge, onNode }: Props) {
  const svgId = useId();
  const mapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const previous = useRef(run);
  const [lastRun, setLastRun] = useState(run);
  useEffect(() => {
    setHover(null);
    setFocus(null);
    setLastRun(previous.current);
    previous.current = run;
  }, [run]);

  const nodeMap = useMemo(() => new Map(g.nodes.map((n) => [n.key, n])), [g]);
  const routes = useMemo(() => {
    const ports = new Map<string, { edge: GEdge; end: 's' | 't'; peer: GNode }[]>();
    for (const edge of g.edges) {
      const from = nodeMap.get(edge.s)!, to = nodeMap.get(edge.t)!;
      const forward = to.lane > from.lane || (to.lane === from.lane && from.lane < g.lanes.length - 1);
      const sameLane = from.lane === to.lane;
      const fromPort = `${edge.s}:${forward}`, toPort = `${edge.t}:${sameLane ? forward : !forward}`;
      if (!ports.has(fromPort)) ports.set(fromPort, []);
      if (!ports.has(toPort)) ports.set(toPort, []);
      ports.get(fromPort)!.push({ edge, end: 's', peer: to });
      ports.get(toPort)!.push({ edge, end: 't', peer: from });
    }
    const offsets = new Map<string, number>();
    for (const entries of ports.values()) {
      entries.sort((a, b) => a.peer.y - b.peer.y || a.peer.x - b.peer.x || a.edge.key.localeCompare(b.edge.key));
      entries.forEach(({ edge, end }, i) => offsets.set(`${edge.key}:${end}`, (i - (entries.length - 1) / 2) * Math.min(7, 36 / entries.length)));
    }
    return new Map(g.edges.map((edge, i) => [edge.key, routeEdge(
      nodeMap.get(edge.s)!, nodeMap.get(edge.t)!, offsets.get(`${edge.key}:s`)!, offsets.get(`${edge.key}:t`)!, (i % 5 - 2) * 3, g.lanes.length,
    )]));
  }, [g, nodeMap]);

  const visible = (item?: { firstDoc: number }) => !!item && (cutoff === null || item.firstDoc <= cutoff);
  const active = hover ?? focus;
  const hoveredNode = active ? nodeMap.get(active) : undefined;
  const activeEdge = g.edges.find((e) => (e.key === active || (!active && e.key === selectedEdge)) && visible(e.byRun[run]));
  const neighbors = new Set<string>();
  if (hoveredNode && visible(hoveredNode.byRun[run])) {
    neighbors.add(hoveredNode.key);
    for (const e of g.edges) {
      if (visible(e.byRun[run]) && (e.s === active || e.t === active)) {
        neighbors.add(e.s);
        neighbors.add(e.t);
      }
    }
  }
  const checkActive = g.nodes.some((node) => visible(node.byRun[run]) && highlightNodes.has(node.key)) || g.edges.some((edge) => visible(edge.byRun[run]) && highlightEdges.has(edge.key));
  const compareFrom = previous.current === run ? lastRun : previous.current;
  const accent = run === 'BU' ? 'update' : run === 'B' ? 'memory' : 'current';
  const laneW = MAP_WIDTH / g.lanes.length;
  const enabledLanes = g.lanes.map((_, i) => g.nodes.some((node) => node.lane === i && node.byRun[run]));
  const firstLane = enabledLanes.findIndex(Boolean);
  useEffect(() => {
    const map = mapRef.current;
    if (map && firstLane >= 0 && map.scrollWidth > map.clientWidth) {
      map.scrollLeft = firstLane * map.scrollWidth / g.lanes.length;
    }
  }, [firstLane]);
  // ao destacar o caminho de uma verificação, traz o trecho destacado para a área visível do mapa
  const hlKey = [...highlightNodes].sort().join(',');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hlKey) return;
    const els = hlKey.split(',').map((k) => map.querySelector<SVGGElement>(`[data-node="${k}"]`)).filter(Boolean) as SVGGElement[];
    if (!els.length) return;
    const box = map.getBoundingClientRect();
    const rects = els.map((el) => el.getBoundingClientRect());
    const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
    if (top >= box.top && bottom <= box.bottom) return;
    map.scrollTo({ top: map.scrollTop + (top + bottom) / 2 - (box.top + box.bottom) / 2, behavior: 'smooth' });
  }, [hlKey]);
  const interactions = (key: string, shown: boolean, action: () => void) => ({
    role: 'button',
    tabIndex: shown ? 0 : -1,
    'aria-hidden': !shown || undefined,
    onClick: () => shown && action(),
    onKeyDown: (event: KeyboardEvent) => shown && activate(event, action),
    onMouseEnter: () => shown && setHover(key),
    onMouseLeave: () => setHover(null),
    onFocus: () => setFocus(key),
    onBlur: () => setFocus(null),
  });
  return (
    <>
      <div className="map-jump" role="group" aria-label="Ir para uma coluna do mapa">
        {g.lanes.map((lane, i) => enabledLanes[i] && <button type="button" key={lane.key} onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          map.scrollLeft = i * map.scrollWidth / g.lanes.length;
          const first = g.nodes.filter((node) => node.lane === i && visible(node.byRun[run])).sort((a, b) => a.y - b.y)[0];
          if (first) map.querySelector<SVGGElement>(`[data-node="${first.key}"]`)?.focus();
        }}>{lane.label}</button>)}
      </div>
      <div className="map-scroll" ref={mapRef} role="region" aria-label="Mapa rolável de entidades e relações" tabIndex={0}>
        <svg className="knowledge-map" viewBox={`0 0 ${MAP_WIDTH} ${g.height}`} role="group" aria-label="Mapa de conhecimento">
          <defs>
            <pattern id={`${svgId}-contours`} width="240" height="120" patternUnits="userSpaceOnUse">
              <path d="M-30 32C40 8 53 58 120 36S211 12 270 40M-30 46C40 22 53 72 120 50S211 26 270 54M-30 60C40 36 53 86 120 64S211 40 270 68" fill="none" stroke="var(--rule)" strokeWidth=".65" />
            </pattern>
            {STATUSES.map((status) => <marker key={status} id={`${svgId}-${status}`} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path className={`arrow ${status}`} d="M0 0 8 4 0 8 2.5 4Z" /></marker>)}
          </defs>
          <rect width={MAP_WIDTH} height={g.height} fill={`url(#${svgId}-contours)`} opacity=".42" />
          {g.lanes.map((lane, i) => (
            <g key={lane.key} aria-hidden="true">
              <rect className="lane-band" x={i * laneW + 9} y={12} width={laneW - 18} height={g.height - 24} rx={5} />
              <path className="lane-rule" d={`M${i * laneW + 23} 52h${laneW - 46}`} />
              <text className="lane-label" x={laneCenter(i, g.lanes.length)} y={36} textAnchor="middle">{lane.label}</text>
            </g>
          ))}
          {g.edges.map((e) => {
            const info = e.byRun[run] ?? e.byRun[compareFrom] ?? Object.values(e.byRun)[0];
            const shown = visible(e.byRun[run]);
            const isNew = !!base && shown && !e.byRun[base];
            const entered = !!compareFrom && compareFrom !== run && !e.byRun[compareFrom];
            const changed = shown && [base, compareFrom].some((from) => from && e.byRun[from] && e.byRun[from].status_epistemico !== info.status_epistemico);
            const path = highlightEdges.has(e.key);
            const emphasized = path || activeEdge?.key === e.key || (neighbors.size > 0 && (e.s === active || e.t === active));
            const dim = !emphasized && (checkActive || neighbors.size > 0 || !!activeEdge);
            const route = routes.get(e.key)!;
            const status = info.status_epistemico;
            return (
              <g key={e.key} className={`edge-g ${shown ? '' : 'gone'} ${isNew ? accent : ''} ${dim ? 'dim' : ''} ${emphasized ? 'hl' : ''}`}
                {...interactions(e.key, shown, () => onEdge(e))}
                aria-label={`${STATUS_LABEL[status]}. ${info.rotulo}`}>
                <title>{info.rotulo}</title>
                {(isNew || entered) && shown && <path key={run} className={`edge-under ${accent} ${isNew ? 'persistent' : ''}`} d={route.d} />}
                <path key={entered && shown ? run : 'edge'} className={`edge ${status} ${entered && shown ? 'edge-arriving' : ''}`} d={route.d} markerEnd={`url(#${svgId}-${status})`} />
                {changed && <path key={run} className={`edge-pulse ${accent}`} d={route.d} />}
                {path && <path className="edge-flow" d={route.d} />}
                {MARK[status] && <g className={`edge-mark ${status}`} transform={`translate(${route.x},${route.y})`} aria-hidden="true"><circle r="8" /><text textAnchor="middle" y="4">{MARK[status]}</text></g>}
                <path className="edge-hit" d={route.d} />
              </g>
            );
          })}
          {g.nodes.map((node) => {
            const info = node.byRun[run] ?? node.byRun[compareFrom] ?? Object.values(node.byRun)[0];
            const shown = visible(node.byRun[run]);
            const isNew = !!base && shown && !node.byRun[base];
            const entered = !!compareFrom && compareFrom !== run && !node.byRun[compareFrom];
            const emphasized = highlightNodes.has(node.key) || selectedNode === node.key || neighbors.has(node.key) || activeEdge?.s === node.key || activeEdge?.t === node.key;
            const dim = !emphasized && (checkActive || neighbors.size > 0 || !!activeEdge);
            const lines = wrapLabel(info.nome);
            return (
              <g key={node.key} data-node={node.key} transform={`translate(${node.x},${node.y})`} className={`node ${shown ? '' : 'gone'} ${isNew ? accent : ''} ${dim ? 'dim' : ''} ${emphasized ? 'hl' : ''}`}
                {...interactions(node.key, shown, () => onNode(node))} aria-label={info.nome}>
                <title>{info.nome}</title>
                <g key={shown ? run : undefined} className={`node-face ${shown && (isNew || entered || cutoff !== null) ? 'arriving' : ''}`}>
                  {shown && (isNew || entered) && <rect className={`node-under ${accent} ${isNew ? 'persistent' : ''}`} x={-NODE_WIDTH / 2 - 3} y={-NODE_HEIGHT / 2 - 3} width={NODE_WIDTH + 6} height={NODE_HEIGHT + 6} rx={8} />}
                  <rect className="node-paper" x={-NODE_WIDTH / 2} y={-NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx={5} />
                  <g transform="translate(-59,0)" aria-hidden="true"><Glyph tipo={info.tipo} r={7} /></g>
                  <text className="label" x={-44} y={4 - (lines.length - 1) * 7.5} aria-hidden="true">{lines.map((line, i) => <tspan key={i} x={-44} dy={i ? 15 : 0}>{line}</tspan>)}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="map-caption">
        {activeEdge ? <><b>{STATUS_LABEL[activeEdge.byRun[run].status_epistemico]}</b> · {activeEdge.byRun[run].rotulo}</>
          : hoveredNode && visible(hoveredNode.byRun[run]) ? hoveredNode.byRun[run].nome
          : checkActive ? 'Caminho da verificação em destaque' : 'Selecione um ponto ou uma linha para ler as evidências. Role para explorar o mapa.'}
      </div>
    </>
  );
}

export function Legend() {
  return (
    <details className="legend">
      <summary>Legenda do mapa</summary>
      <div className="legend-key">
        {STATUSES.map((status) => <div key={status}><svg viewBox="0 0 38 12" aria-hidden="true"><path className={`edge ${status}`} d="M1 6H24" /><text x="29" y="10">{MARK[status]}</text></svg>{STATUS_LABEL[status]}</div>)}
        <div><span className="key-swatch memory" />Novo na condição com memória</div>
        <div><span className="key-swatch moss" />Novo na condição com atualização</div>
      </div>
    </details>
  );
}
