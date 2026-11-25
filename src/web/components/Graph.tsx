import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { STATUS_LABEL } from '../lib/data';
import { FAMILIES, LABEL_HEIGHT, labelLines, layoutGraph, type GEdge, type GNode, type UnionGraph } from '../lib/graph';

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

const MARK: Record<string, string> = { hipotese: '?', contradicao: '≠', superado: '×' };
const STATUSES = Object.keys(STATUS_LABEL);
const labelMagnification = (scale: number) => Math.max(1, 9.5 / (11 * scale));
const atCutoff = (item: { firstDoc: number } | undefined, cutoff: number | null) =>
  !!item && (cutoff === null || item.firstDoc <= cutoff);

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Camera = Point & { scale: number };
type Bounds = { left: number; right: number; top: number; bottom: number };

function fit(bounds: Bounds | null, { width, height }: Size): Camera {
  if (!bounds) return { x: width / 2, y: height / 2, scale: 1 };
  const { left, right, top, bottom } = bounds;
  const scale = Math.min(2.1, Math.max(1, width - 34) / (right - left), Math.max(1, height - 64) / (bottom - top));
  return { x: width / 2 - (left + right) / 2 * scale, y: (height - 32) / 2 - (top + bottom) / 2 * scale, scale };
}

function zoom(camera: Camera, from: Point, to: Point, factor: number, min: number): Camera {
  const scale = Math.max(min, Math.min(6, camera.scale * factor));
  return { x: to.x - (from.x - camera.x) * scale / camera.scale, y: to.y - (from.y - camera.y) * scale / camera.scale, scale };
}

function gesture(points: Map<number, Point>) {
  const [a, b] = points.values();
  return b ? { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, spread: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }
    : { center: a, spread: 1 };
}

function activate(event: KeyboardEvent, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export function Graph({ g, run, base, cutoff, highlightNodes, highlightEdges, selectedEdge, selectedNode, onEdge, onNode }: Props) {
  const svgId = useId();
  const svg = useRef<SVGSVGElement>(null);
  const layer = useRef<SVGGElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [ease, setEase] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const moved = useRef(false);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const { positions, routes } = useMemo(() => layoutGraph(g), [g]);

  const scene = useMemo(() => {
    const nodes = g.nodes.filter((node) => node.byRun[run]).map((node) => {
      const lines = labelLines(node.byRun[run].nome);
      return { node, lines, halfLabel: Math.max(...lines.map((line) => line.length)) * 3.05 };
    });
    const edges = g.edges.filter((edge) => edge.byRun[run]);
    return { nodes, edges };
  }, [g, run]);
  const visible = useMemo(() => {
    const nodes = scene.nodes.filter(({ node }) => atCutoff(node.byRun[run], cutoff));
    const keys = new Set(nodes.map(({ node }) => node.key));
    const edges = scene.edges.filter((edge) => atCutoff(edge.byRun[run], cutoff) && keys.has(edge.s) && keys.has(edge.t));
    return { nodes, keys, edges, edgeKeys: new Set(edges.map((edge) => edge.key)) };
  }, [scene, run, cutoff]);
  const pathNodes = new Set(highlightNodes);
  for (const edge of visible.edges) {
    if (highlightEdges.has(edge.key)) { pathNodes.add(edge.s); pathNodes.add(edge.t); }
  }
  const degree = new Map<string, number>();
  const active = hover ?? focus;
  const activeNode = visible.nodes.find(({ node }) => node.key === active)?.node;
  const activeEdge = visible.edges.find((edge) => edge.key === (active ?? selectedEdge));
  const neighbors = new Set(activeNode ? [activeNode.key] : []);
  for (const { s, t } of visible.edges) {
    degree.set(s, (degree.get(s) ?? 0) + 1);
    if (s !== t) degree.set(t, (degree.get(t) ?? 0) + 1);
    if (s === activeNode?.key || t === activeNode?.key) { neighbors.add(s); neighbors.add(t); }
  }
  const checkActive = visible.nodes.some(({ node }) => pathNodes.has(node.key));
  const dimOthers = checkActive || !!activeNode || !!activeEdge;
  const accent = run === 'BU' ? 'update' : run === 'B' ? 'memory' : '';

  function getBounds(nodes: typeof scene.nodes, edges: GEdge[], labelScale: number): Bounds | null {
    if (!nodes.length) return null;
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    function include(x: number, y: number, horizontal: number, above: number, below: number) {
      bounds.left = Math.min(bounds.left, x - horizontal);
      bounds.right = Math.max(bounds.right, x + horizontal);
      bounds.top = Math.min(bounds.top, y - above);
      bounds.bottom = Math.max(bounds.bottom, y + below);
    }
    for (const { node, lines, halfLabel } of nodes) {
      const { x, y, radius } = positions.get(node.key)!;
      include(x, y, Math.max(radius + 5, halfLabel * labelScale), radius + 5, radius + 5 + lines.length * LABEL_HEIGHT * labelScale);
    }
    for (const edge of edges) {
      const { x, y } = routes.get(edge.key)!;
      include(x, y, 9, 9, 9);
    }
    return bounds;
  }

  function frame(nodes: typeof scene.nodes, edges: GEdge[]) {
    let view = fit(getBounds(nodes, edges, 1), size);
    // Reserve room for labels that keep a minimum size at overview zoom.
    for (let i = 0; i < 3 && view.scale < 9.5 / 11 && size.width > 0; i++) {
      view = fit(getBounds(nodes, edges, labelMagnification(view.scale)), size);
    }
    return view;
  }

  const fullFit = frame(scene.nodes, scene.edges);
  const checkFit = checkActive ? frame(
    visible.nodes.filter(({ node }) => pathNodes.has(node.key)),
    visible.edges.filter((edge) => highlightEdges.has(edge.key)),
  ) : fullFit;
  const { x: fitX, y: fitY, scale: fitScale } = checkFit;
  const minScale = Math.min(0.28, fullFit.scale * 0.65);
  const zoomed = camera.scale >= Math.max(0.95, fullFit.scale * 1.45);

  useLayoutEffect(() => {
    const element = svg.current!;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize({ width, height });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // primeiro enquadramento (e ajustes de tamanho) sem animação; troca de condição/verificação com animação
  const framedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    const intent = `${run}|${[...highlightNodes].sort().join(',')}|${[...highlightEdges].sort().join(',')}`;
    setEase(framedFor.current !== null && framedFor.current !== intent);
    framedFor.current = intent;
    setCamera({ x: fitX, y: fitY, scale: fitScale });
  }, [run, fitX, fitY, fitScale, highlightNodes, highlightEdges]);

  useEffect(() => {
    setHover(null);
    setFocus(null);
  }, [run]);

  function currentCamera() {
    const matrix = layer.current?.getCTM();
    return matrix ? { x: matrix.e, y: matrix.f, scale: matrix.a } : camera;
  }

  useEffect(() => {
    const element = svg.current!;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const matrix = layer.current?.getCTM();
      if (!matrix) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      setEase(false);
      setCamera(zoom({ x: matrix.e, y: matrix.f, scale: matrix.a }, point, point, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002)), minScale));
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [minScale]);

  function zoomButton(factor: number) {
    const center = { x: size.width / 2, y: size.height / 2 };
    setEase(true);
    setCamera((view) => zoom(view, center, center, factor, minScale));
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    const points = pointers.current;
    if (!points.size) moved.current = false;
    const onItem = (event.target as Element).closest('[role="button"]');
    if (event.button !== 0 || (event.pointerType !== 'touch' && onItem) || points.size >= 2) return;
    if (!points.size) {
      setCamera(currentCamera());
      setEase(false);
    }
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.size === 2) {
      moved.current = true;
      setDragging(true);
      for (const id of points.keys()) event.currentTarget.setPointerCapture(id);
    } else if (!onItem) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const points = pointers.current;
    const previous = points.get(event.pointerId);
    if (!previous || (!moved.current && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 5)) return;
    const from = gesture(points);
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const to = gesture(points);
    if (!moved.current) {
      moved.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const { left, top } = event.currentTarget.getBoundingClientRect();
    setCamera((view) => zoom(view,
      { x: from.center.x - left, y: from.center.y - top },
      { x: to.center.x - left, y: to.center.y - top },
      to.spread / from.spread, minScale));
  }

  function stop(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (!pointers.current.size) setDragging(false);
  }

  const interactions = (key: string, shown: boolean, action: () => void) => ({
    role: 'button',
    tabIndex: shown ? 0 : -1,
    'aria-hidden': !shown || undefined,
    onClick: () => shown && action(),
    onKeyDown: (event: KeyboardEvent) => shown && activate(event, action),
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && shown) setHover(key);
    },
    onPointerLeave: () => setHover(null),
    onFocus: (event: FocusEvent<SVGGElement>) => {
      if (!shown) return;
      setFocus(key);
      if (!event.currentTarget.matches(':focus-visible')) return;
      const point = positions.get(key) ?? routes.get(key)!;
      const view = currentCamera();
      const x = view.x + point.x * view.scale, y = view.y + point.y * view.scale;
      if (x < 16 || x > size.width - 16 || y < 16 || y > size.height - 42) {
        setEase(true);
        setCamera({ x: size.width / 2 - point.x * view.scale, y: size.height / 2 - point.y * view.scale, scale: view.scale });
      }
    },
    onBlur: () => setFocus(null),
  });

  return (
    <>
      <div className={`graph-canvas ${dragging ? 'dragging' : ''}`}>
        <div className="graph-controls" role="group" aria-label="Controles do mapa">
          <button type="button" onClick={() => zoomButton(1 / 1.3)} aria-label="Diminuir zoom">−</button>
          <button type="button" onClick={() => zoomButton(1.3)} aria-label="Aumentar zoom">+</button>
          <button type="button" onClick={() => {
            setEase(true);
            setCamera(frame(visible.nodes, visible.edges));
          }}>Enquadrar</button>
        </div>
        <svg ref={svg} className="knowledge-map" role="group" aria-label="Grafo interativo de entidades e relações"
          onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={(event) => { if (event.target === event.currentTarget) stop(event); }}
          onClickCapture={(event) => {
            if (event.detail > 0 && moved.current) event.stopPropagation();
          }}>
          <defs>
            {STATUSES.map((status) => (
              <marker key={status} id={`${svgId}-${status}`} viewBox="0 0 7 7" refX="6.5" refY="3.5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
                <path className={`arrow ${status}`} d="M0 0 7 3.5 0 7 1.6 3.5Z" />
              </marker>
            ))}
          </defs>
          <g ref={layer} className={`graph-layer ${ease ? 'easing' : ''} ${zoomed ? 'zoomed' : ''}`}
            style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
            {g.edges.map((edge) => {
              const info = edge.byRun[run] ?? Object.values(edge.byRun)[0];
              const shown = visible.edgeKeys.has(edge.key);
              const isNew = !!base && !edge.byRun[base];
              const path = highlightEdges.has(edge.key);
              const lit = path || edge.key === activeEdge?.key || edge.s === activeNode?.key || edge.t === activeNode?.key;
              const route = routes.get(edge.key)!;
              const status = info.status_epistemico;
              return (
                <g key={edge.key} className={`edge-g ${shown ? '' : 'gone'} ${isNew ? accent : ''} ${lit ? 'hl' : dimOthers ? 'dim' : ''}`}
                  {...interactions(edge.key, shown, () => onEdge(edge))} aria-label={`${STATUS_LABEL[status]}. ${info.rotulo}`}>
                  {isNew && <path className="edge-under" d={route.d} />}
                  <path className={`edge ${status}`} d={route.d} markerEnd={`url(#${svgId}-${status})`} />
                  {path && <path className="edge-flow" d={route.d} />}
                  {MARK[status] && <g className={`edge-mark ${status}`} transform={`translate(${route.x},${route.y})`} aria-hidden="true">
                    <circle r="7" /><text textAnchor="middle" y="3.5">{MARK[status]}</text>
                  </g>}
                  <path className="edge-hit" d={route.d} />
                </g>
              );
            })}
            {g.nodes.map((node) => {
              const info = node.byRun[run] ?? Object.values(node.byRun)[0];
              const shown = visible.keys.has(node.key);
              const { x, y, radius } = positions.get(node.key)!;
              const family = FAMILIES[node.family];
              const isNew = !!base && !node.byRun[base];
              const lit = pathNodes.has(node.key) || selectedNode === node.key || neighbors.has(node.key) || activeEdge?.s === node.key || activeEdge?.t === node.key;
              const prominent = lit || scene.nodes.length <= 26 || (degree.get(node.key) ?? 0) >= 2;
              return (
                <g key={node.key} data-node={node.key} transform={`translate(${x},${y})`}
                  className={`node family-${family.key} ${shown ? '' : 'gone'} ${isNew ? accent : ''} ${lit ? 'hl' : dimOthers ? 'dim' : ''}`}
                  {...interactions(node.key, shown, () => onNode(node))} aria-label={`${info.nome} · ${family.label}`}>
                  <title>{info.nome}</title>
                  <g className="node-face">
                    {isNew && <><circle className="node-halo" r={radius + 5} /><circle className="node-ring" r={radius + 2.8} /></>}
                    <circle className="node-dot" r={radius} />
                  </g>
                  <circle className="node-hit" r={Math.max(14, radius + 5)} />
                  <text className={`node-label ${prominent ? 'prominent' : ''}`} textAnchor="middle" y="9" aria-hidden="true"
                    transform={`translate(0,${radius + 4}) scale(${labelMagnification(camera.scale)})`}>
                    {labelLines(info.nome).map((line, i) => <tspan key={i} x="0" dy={i ? LABEL_HEIGHT : 0}>{line}</tspan>)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {!visible.nodes.length && <span className="graph-empty">Nenhuma entidade neste trecho da análise.</span>}
      </div>
      <div className="map-caption">
        {activeEdge ? <><b>{STATUS_LABEL[activeEdge.byRun[run].status_epistemico]}</b> · {activeEdge.byRun[run].rotulo}</>
          : activeNode ? activeNode.byRun[run].nome
          : checkActive ? 'Caminho da verificação em destaque'
          : 'Selecione um ponto ou uma linha para ler as evidências.'}
      </div>
    </>
  );
}

export function Legend() {
  return (
    <details className="legend">
      <summary>Legenda do mapa</summary>
      <div className="legend-key">
        {FAMILIES.map((family) => <div key={family.key}><svg viewBox="0 0 38 12" aria-hidden="true"><circle className={`family-${family.key}`} cx="13" cy="6" r="4" fill="var(--family)" /></svg>{family.label}</div>)}
        <hr />
        {STATUSES.map((status) => <div key={status}><svg viewBox="0 0 38 12" aria-hidden="true"><path className={`edge ${status}`} d="M1 6H25" /><text className={`edge-mark ${status}`} x="29" y="10">{MARK[status]}</text></svg>{STATUS_LABEL[status]}</div>)}
        <hr />
        <div><svg viewBox="0 0 38 12" aria-hidden="true"><circle className="node-ring memory" cx="13" cy="6" r="4.5" /></svg>Novo na condição com memória</div>
        <div><svg viewBox="0 0 38 12" aria-hidden="true"><circle className="node-ring update" cx="13" cy="6" r="4.5" /></svg>Novo na condição com atualização</div>
      </div>
    </details>
  );
}
