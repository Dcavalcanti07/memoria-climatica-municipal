import { useMemo } from 'react';
import { LANES, type GEdge, type GNode, type UnionGraph } from '../lib/graph';

type Props = {
  g: UnionGraph;
  width: number;
  height: number;
  run: string; // execução exibida
  base?: string | null; // execução de comparação (destaca o que é novo)
  cutoff?: string | null; // data limite (linha do tempo)
  highlightNodes?: Set<string>;
  highlightEdges?: Set<string>;
  selectedEdge?: string | null;
  onEdge?: (e: GEdge) => void;
  onNode?: (n: GNode) => void;
  hover?: string | null;
  onHover?: (k: string | null) => void;
};

const MARK: Record<string, string> = { hipotese: '?', contradicao: '≠', superado: '×', informacao_insuficiente: '…' };

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
function curve(a: GNode, b: GNode) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(40, len * 0.18);
  const cx = mx - (dy / len) * k, cy = my + (dx / len) * k;
  return { d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`, mx: (a.x + 2 * cx + b.x) / 4, my: (a.y + 2 * cy + b.y) / 4 };
}

export function Graph({ g, width, height, run, base, cutoff, highlightNodes, highlightEdges, selectedEdge, onEdge, onNode, hover, onHover }: Props) {
  const nodeMap = useMemo(() => new Map(g.nodes.map((n) => [n.key, n])), [g]);
  const visibleNode = (n: GNode) => !!n.ids[run] && (!cutoff || n.firstDate <= cutoff);
  const visibleEdge = (e: GEdge) => !!e.byRun[run] && (!cutoff || e.firstDate <= cutoff);
  const hasHl = (highlightNodes?.size ?? 0) > 0 || (highlightEdges?.size ?? 0) > 0;
  const hoverNbrs = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    for (const e of g.edges) if (e.byRun[run] && (e.s === hover || e.t === hover)) { s.add(e.s); s.add(e.t); }
    return s;
  }, [hover, g, run]);
  const padX = 90, laneW = (width - padX * 2) / (LANES.length - 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafo de conhecimento construído a partir da análise da IA">
      <defs>
        <pattern id="topo" width="160" height="160" patternUnits="userSpaceOnUse">
          <path d="M0 40 Q40 20 80 40 T160 40 M0 100 Q40 80 80 100 T160 100" fill="none" stroke="var(--rule)" strokeWidth="0.6" opacity="0.5" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#topo)" />
      {LANES.map((l, i) => (
        <g key={l.key}>
          <line className="lane-line" x1={padX + i * laneW} x2={padX + i * laneW} y1={30} y2={height - 10} />
          <text className="lane-label" x={padX + i * laneW} y={20} textAnchor="middle">{l.label}</text>
        </g>
      ))}
      <g>
        {g.edges.map((e) => {
          const a = nodeMap.get(e.s)!, b = nodeMap.get(e.t)!;
          const info = e.byRun[run] ?? (base ? e.byRun[base] : undefined) ?? Object.values(e.byRun)[0];
          const vis = visibleEdge(e);
          const isNew = !!base && vis && !e.byRun[base];
          const changed = !!base && vis && !!e.byRun[base] && e.byRun[base].status !== e.byRun[run]?.status;
          const hl = highlightEdges?.has(e.key) || selectedEdge === e.key;
          const dim = vis && ((hasHl && !hl) || (hoverNbrs && !(hoverNbrs.has(e.s) && hoverNbrs.has(e.t))));
          const { d, mx, my } = curve(a, b);
          const mark = MARK[info.status];
          return (
            <g key={e.key} className={`edge-g ${vis ? '' : 'gone'} ${dim ? 'dim' : ''} ${hl ? 'hl' : ''} ${changed ? 'changed' : ''}`}>
              <path className={`edge-under ${isNew || (base && e.mem && isNew) ? 'mem' : ''}`} d={d} />
              <path className={`edge ${info.status}`} d={d} />
              {mark && <text className="edge-mark" x={mx} y={my + 4} textAnchor="middle" fill={info.status === 'contradicao' ? 'var(--contra)' : info.status === 'hipotese' ? 'var(--hyp)' : 'var(--ink-3)'}>{mark}</text>}
              <path className="edge-hit" d={d} onClick={() => vis && onEdge?.(e)}>
                <title>{info.rotulo}</title>
              </path>
            </g>
          );
        })}
      </g>
      <g>
        {g.nodes.map((n) => {
          const vis = visibleNode(n);
          const isNew = !!base && vis && !n.ids[base];
          const hl = highlightNodes?.has(n.key);
          const dim = vis && ((hasHl && !hl) || (hoverNbrs && !hoverNbrs.has(n.key)));
          const r = 7 + Math.min(n.degree, 6) * 1.2;
          const label = n.label.length > 34 ? n.label.slice(0, 32) + '…' : n.label;
          return (
            <g
              key={n.key}
              className={`node ${vis ? '' : 'gone'} ${isNew ? 'mem new' : ''} ${hl ? 'hl' : ''} ${dim ? 'dim' : ''}`}
              transform={`translate(${n.x},${n.y})`}
              onClick={() => vis && onNode?.(n)}
              onMouseEnter={() => vis && onHover?.(n.key)}
              onMouseLeave={() => onHover?.(null)}
              tabIndex={vis ? 0 : -1}
              role="button"
              aria-label={`${n.label} (${n.tipo})`}
              onKeyDown={(ev) => { if (ev.key === 'Enter') onNode?.(n); }}
            >
              <circle className="halo" r={r + 9} />
              <Glyph tipo={n.tipo} r={r} />
              <text className="label" y={r + 14} textAnchor="middle">{label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function Legend() {
  const line = (cls: string, color: string, dash?: string) => (
    <svg viewBox="0 0 28 8"><line x1="0" y1="4" x2="28" y2="4" stroke={color} strokeWidth={cls === 'contra' ? 2 : 1.6} strokeDasharray={dash} strokeLinecap="round" /></svg>
  );
  return (
    <details className="legend" open>
      <summary>Como ler</summary>
      <div>{line('f', 'var(--ink-2)')}Fato documentado</div>
      <div>{line('i', 'var(--water)', '1.5 3.5')}Inferência da IA</div>
      <div>{line('h', 'var(--hyp)', '6 4')}Hipótese (?)</div>
      <div>{line('contra', 'var(--contra)')}Contradição (≠)</div>
      <div>{line('s', 'var(--superseded)', '2 3')}Superado (×)</div>
      <div><svg viewBox="0 0 28 8"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--memory-glow)" strokeWidth="7" /></svg>Revelado pela memória</div>
    </details>
  );
}
