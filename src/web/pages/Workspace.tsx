import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc, Evidencia } from '../../core/schema';
import { Graph, Legend } from '../components/Graph';
import { CheckCard, DocList, DocReader, QuoteBtn } from '../components/Panels';
import { buildUnion, type GEdge, type GNode } from '../lib/graph';
import { CATEGORIA_LABEL, STATUS_LABEL, TEMPORAL_LABEL, alertLevel, fmtDate, loadScenario, type RunView, type ScenarioView } from '../lib/data';
import { useReviews } from '../lib/review';

type Mode = 'A' | 'B' | 'BU' | 'LIVE';
const MODE_LABEL: Record<Mode, string> = { A: 'Só informação atual', B: '+ Memória institucional', BU: '+ Atualização recente', LIVE: 'Análise ao vivo' };

const ENTITY_LABEL: Record<string, string> = {
  evento: 'Evento', norma_documento: 'Norma ou documento', infraestrutura: 'Infraestrutura', local: 'Local',
  servico: 'Serviço', equipamento: 'Equipamento', recurso: 'Recurso', grupo_populacional: 'Grupo populacional',
  setor: 'Setor', funcao_responsavel: 'Função ou responsável',
};

const GUIDE = [
  { t: 'Os documentos do município', p: 'À esquerda está o arquivo fictício: plano de contingência, alerta, ofícios e, em ocre, registros de eventos anteriores. Clique em qualquer um para ler.' },
  { t: 'O que a IA conectou', p: 'No centro, cada ponto é algo que a IA extraiu dos documentos (uma ponte, um abrigo, uma secretaria). As cores agrupam os tipos de entidade. As setas mostram a direção das relações e os traços indicam o grau de certeza.' },
  { t: 'A pauta de verificações', p: 'À direita, as perguntas que a equipe poderia confirmar antes do evento. Clique numa pergunta para ver no mapa o caminho de dependências e as citações literais que a sustentam.' },
  { t: 'Com e sem memória', p: 'No alto, alterne entre a análise feita só com informações atuais e a análise que também recebeu os registros históricos. O contorno ocre indica o que apareceu na condição com memória.' },
];

export function Workspace({ id }: { id: string }) {
  const [sc, setSc] = useState<ScenarioView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('B');
  const [live, setLive] = useState<RunView | null>(null);
  const [livePending, setLivePending] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveDoc, setLiveDoc] = useState<Doc | undefined>();
  const liveRequest = useRef<AbortController | null>(null);
  const [tech, setTech] = useState(false);
  const [selCheck, setSelCheck] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<GEdge | null>(null);
  const [selNode, setSelNode] = useState<GNode | null>(null);
  const [reader, setReader] = useState<{ doc: Doc; focus?: string } | null>(null);
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [guide, setGuide] = useState<number>(() => { if (location.search.includes('tour=0')) return -1; try { return localStorage.getItem('mcm.guide.done') ? -1 : 0; } catch { return 0; } });
  const { reviews, update } = useReviews(id);
  const stageRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const inspectorTrigger = useRef<HTMLElement | SVGElement | null>(null);

  useEffect(() => {
    let mounted = true;
    loadScenario(id).then((scenario) => {
      if (!mounted) return;
      // link direto: ?modo=A|B|BU&v=V2 abre a condição e a verificação indicadas
      const q = new URLSearchParams(location.search);
      const wanted = q.get('modo') as Mode | null;
      setSc(scenario);
      setMode(wanted && scenario.runs[wanted] ? wanted : scenario.runs.B ? 'B' : 'A');
      const v = q.get('v');
      if (v) setSelCheck(v);
    }).catch((e) => { if (mounted) setErr(String(e)); });
    return () => { mounted = false; liveRequest.current?.abort(); };
  }, [id]);

  useEffect(() => {
    if (selEdge || selNode) inspectorRef.current?.focus({ preventScroll: true });
  }, [selEdge, selNode]);

  const runs = useMemo(() => {
    if (!sc) return {} as Record<string, RunView>;
    return { ...sc.runs, ...(live ? { LIVE: live } : {}) } as Record<string, RunView>;
  }, [sc, live]);
  const allDocs = useMemo(() => sc ? [...sc.docs, ...sc.atualizacao, ...(liveDoc ? [liveDoc] : [])]
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id)) : [], [sc, liveDoc]);
  const docMap = useMemo(() => new Map(allDocs.map((d) => [d.id, d])), [allDocs]);
  const union = useMemo(() => sc ? buildUnion(Object.entries(runs).map(([key, r]) => ({ key, out: r.output })), allDocs) : null, [sc, runs, allDocs]);

  const run = runs[mode];
  const base = mode === 'B' && runs.A ? 'A' : mode === 'BU' && runs.B ? 'B' : null;
  const provided = useMemo(() => new Set(run?.docs_fornecidos ?? []), [run]);
  const readingOrder = useMemo(() => allDocs.flatMap((doc, index) => provided.has(doc.id) ? [{ doc, index }] : []), [allDocs, provided]);
  const updateIds = new Set([...(sc?.atualizacao.map((d) => d.id) ?? []), ...(liveDoc ? [liveDoc.id] : [])]);
  const cites = useMemo(() => {
    const m = new Map<string, number>();
    run?.validation?.citacoes?.forEach((c: any) => m.set(c.doc_id, (m.get(c.doc_id) ?? 0) + 1));
    return m;
  }, [run]);
  const literalMap = useMemo(() => new Map<string, boolean>((run?.validation?.citacoes ?? []).map((c: any) => [`${c.doc_id}|${c.trecho}`, c.literal])), [run]);
  const literal = (ev: Evidencia) => literalMap.get(`${ev.doc_id}|${ev.trecho}`);
  const quotesFor = (docId: string) => (run?.validation?.citacoes ?? []).filter((c: any) => c.doc_id === docId);

  // destaque de caminho a partir de uma verificação
  const { hlNodes, hlEdges } = useMemo(() => {
    const hn = new Set<string>(), he = new Set<string>();
    if (!union || !run || !selCheck) return { hlNodes: hn, hlEdges: he };
    const v = run.output.verificacoes.find((x) => x.id === selCheck); if (!v) return { hlNodes: hn, hlEdges: he };
    for (const n of union.nodes) if (v.entidades_relacionadas.includes(n.ids[mode] ?? '')) hn.add(n.key);
    const evDocs = new Set(v.evidencias.map((e) => e.doc_id));
    const seeds = new Set(hn);
    for (const e of union.edges) {
      const info = e.byRun[mode]; if (!info) continue;
      const bothIn = seeds.has(e.s) && seeds.has(e.t);
      const shares = (seeds.has(e.s) || seeds.has(e.t)) && info.evidencias.some((x) => evDocs.has(x.doc_id));
      if (bothIn || shares) { he.add(e.key); hn.add(e.s); hn.add(e.t); }
    }
    return { hlNodes: hn, hlEdges: he };
  }, [union, run, selCheck, mode]);

  useEffect(() => {
    if (!playing) return;
    let step = 0;
    const timer = window.setInterval(() => {
      step++;
      if (step < readingOrder.length) setCutoff(readingOrder[step].index);
      else { setPlaying(false); setCutoff(null); window.clearInterval(timer); }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [playing, readingOrder]);

  function changeMode(next: Mode) {
    setMode(next);
    setSelCheck(null);
    setSelEdge(null);
    setSelNode(null);
    setPlaying(false);
    setCutoff(null);
  }

  function closeInspector() {
    setSelEdge(null);
    setSelNode(null);
    inspectorTrigger.current?.focus({ preventScroll: true });
  }

  function inspect(e: GEdge | null, n: GNode | null) {
    const active = document.activeElement;
    if (active instanceof HTMLElement || active instanceof SVGElement) {
      if (!inspectorRef.current?.contains(active)) inspectorTrigger.current = active;
    }
    setSelEdge(e);
    setSelNode(n);
  }

  function seek(index: number | null) {
    setPlaying(false);
    setCutoff(index);
    setSelEdge(null);
    setSelNode(null);
  }

  const judgeFor = (vid: string) => {
    const j = run?.judge; if (!j) return null;
    const p = j.verificacoes_produzidas?.find((x: any) => x.id === vid);
    const g = j.gold_checks?.filter((x: any) => x.ids_saida?.includes(vid)).map((x: any) => `${x.id} (${x.resultado})`);
    return p ? `${p.classificacao.replace(/_/g, ' ')}${g?.length ? ` · gabarito ${g.join(', ')}` : ''}: ${p.justificativa}` : null;
  };

  async function runLive(extra?: Doc) {
    if (!sc || liveRequest.current) return;
    const request = new AbortController();
    liveRequest.current = request;
    setLivePending(true);
    changeMode('LIVE');
    setLive(null);
    setLiveError(null);
    setLiveDoc(undefined);
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: sc.id, cond: 'B', extra_doc: extra ?? null }), signal: request.signal });
      if (response.status === 503) {
        setLiveError('A análise ao vivo está desativada nesta instalação.');
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '');
      setLiveDoc(result.extra_docs?.[0]);
      setLive(result as RunView);
    } catch {
      if (!request.signal.aborted) setLiveError('A análise ao vivo não pôde ser concluída. Tente novamente mais tarde.');
    } finally {
      liveRequest.current = null;
      if (!request.signal.aborted) setLivePending(false);
    }
  }

  if (err) return <div className="wrap" style={{ padding: 40 }}><h2>Não foi possível carregar o cenário</h2><p className="muted">{err}</p></div>;
  if (!sc || !union) return <div className="wrap" style={{ padding: 40 }} aria-busy="true"><p className="eyebrow">Carregando documentos e análises…</p></div>;

  const out = run?.output;
  const groups = out ? [
    { k: 'registro_historico', t: 'Trazidas pela memória institucional' },
    { k: 'ambos', t: 'Combinam informação atual e memória' },
    { k: 'informacao_atual', t: 'A partir das informações atuais' },
  ].map((g) => ({ ...g, items: out.verificacoes.filter((v) => v.base === g.k) })).filter((g) => g.items.length) : [];
  const reviewKey = (verificationId: string) => mode === 'LIVE'
    ? `LIVE:${run.response_id ?? run.started_at}:${verificationId}`
    : `${mode}:${verificationId}`;
  const nReviewed = out ? out.verificacoes.filter((v) => (reviews[reviewKey(v.id)]?.status ?? 'pendente') !== 'pendente').length : 0;

  function exportMd() {
    if (!out || !sc) return;
    const lines = [`# Pauta de verificações preventivas: ${sc.municipio} (fictício)`, '', `Cenário: ${sc.titulo} · referência ${fmtDate(sc.alerta_data)} · condição: ${MODE_LABEL[mode]}`, `Origem: ${run.provenance === 'live' ? 'análise executada agora' : `execução real armazenada (${run.model})`}`, '', '> Material experimental com dados fictícios, sujeito à revisão humana. Não substitui protocolos oficiais.', ''];
    out.verificacoes.forEach((v, i) => {
      const r = reviews[reviewKey(v.id)];
      lines.push(`## ${i + 1}. ${v.pergunta}`, '', `- Por que importa: ${v.por_que_importa}`, `- O que motivou: ${v.motivacao}`, `- Evidências: ${v.evidencias.map((e) => `[${e.doc_id}] “${e.trecho}”`).join('; ')}`, `- O que ainda não sabemos: ${v.o_que_falta_saber}`, `- Quem poderia confirmar (sujeito à confirmação institucional): ${v.quem_pode_confirmar}`, `- Revisão: ${r?.status ?? 'pendente'}${r?.nota ? `. Observação: ${r.nota}` : ''}`, '');
    });
    if (out.informacoes_ausentes.length) { lines.push('## Informações que faltam', ''); out.informacoes_ausentes.forEach((x) => lines.push(`- ${x.descricao}. Por que importa: ${x.por_que_importa}`)); }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pauta-${sc.id}-${mode}.md`; a.click(); URL.revokeObjectURL(a.href);
  }

  const shownAt = (item?: { firstDoc: number }) => !!item && (cutoff === null || item.firstDoc <= cutoff);
  const edgeInfo = selEdge?.byRun[mode];
  const nodeInfo = selNode?.byRun[mode];
  const baseChecks = base ? runs[base].judge?.gold_checks as { id: string; resultado: string; ids_saida: string[] }[] | undefined : undefined;
  const currentChecks = run?.judge?.gold_checks as typeof baseChecks;
  const newlyCovered = new Set(currentChecks?.filter((g) =>
    g.resultado === 'atendido' && baseChecks?.some((b) => b.id === g.id && b.resultado === 'ausente')
  ).flatMap((g) => g.ids_saida ?? []));
  return (
    <div className="ws">
      <header className="ws-head">
        <div className="ws-heading">
          <div className="ws-title">
            <div className="eyebrow">{sc.id} · {CATEGORIA_LABEL[sc.categoria] ?? sc.categoria} · município fictício</div>
            <h1>{sc.municipio} <span>{sc.titulo}</span></h1>
          </div>
          <span className={`alert-pill ${alertLevel(sc.docs)}`}><span className="dot" />Alerta {alertLevel(sc.docs)} simulado · {fmtDate(sc.alerta_data)}</span>
        </div>
        <div className="ws-controls">
          <div className="seg" role="group" aria-label="Condição da análise">
            {(['A', 'B', 'BU'] as Mode[]).filter((m) => runs[m]).map((m) => (
              <button key={m} className={`mode-${m}`} aria-pressed={mode === m} onClick={() => changeMode(m)}>
                <span className="mode-key">{m === 'BU' ? 'B+' : m}</span>{MODE_LABEL[m]}
              </button>
            ))}
            {(livePending || live || liveError) && <button className="mode-BU" aria-pressed={mode === 'LIVE'} onClick={() => changeMode('LIVE')}>Ao vivo</button>}
          </div>
          <button className="theme-btn technical-toggle" aria-pressed={tech} onClick={() => setTech(!tech)}>Camada técnica</button>
        </div>
      </header>

      <aside className="pane archive-pane">
        <div className="pane-h">
          <h2>Arquivo do município</h2>
          <div className="muted" style={{ fontSize: 12.5 }}>{provided.size} de {allDocs.length - (liveDoc && mode !== 'LIVE' ? 1 : 0)} documentos nesta análise · <span style={{ color: 'var(--water)' }}>■</span> atual <span style={{ color: 'var(--memory)' }}>■</span> histórico {updateIds.size > 0 && <><span style={{ color: 'var(--moss)' }}>■</span> atualização</>}</div>
        </div>
        <DocList docs={allDocs.filter((doc) => mode === 'LIVE' || doc !== liveDoc)} provided={provided} cites={cites} updateIds={updateIds} onOpen={(d) => setReader({ doc: d })} selected={reader?.doc.id} />
        {LIVE_ENABLED ? <LiveBox onRun={runLive} scenario={sc} pending={livePending} /> : <UpdateShortcut hasUpdate={!!runs.BU} active={mode === 'BU'} onShow={() => changeMode('BU')} />}
      </aside>

      <section className="stage" ref={stageRef} tabIndex={-1} aria-label="Mapa de conhecimento">
        <div className="stage-tools">
          <div className="stage-heading">
            <h2>Mapa de conhecimento</h2>
            <Legend />
          </div>
          <div className="stage-actions">
            {run && (
              <span className={`provenance ${run.provenance}`} title={run.response_id ?? ''}>
                <span className="led" /><span><strong>{run.provenance === 'live' ? 'Executada agora' : 'Execução real armazenada'}</strong><span className="run-meta">{run.model ?? 'Modelo indisponível'}</span></span>
              </span>
            )}
            <button className="btn small ghost replay" aria-pressed={playing} disabled={!readingOrder.length} onClick={() => {
              if (playing) seek(null);
              else { seek(readingOrder[0].index); setPlaying(true); }
            }}>{playing ? '■ Parar formação' : '▶ Formação do conhecimento'}</button>
          </div>
          {tech && run && <span className="mono muted stage-stats">{out?.entidades.length} entidades · {out?.relacoes.length} relações · {run.latency_ms ? `${(run.latency_ms / 1000).toFixed(1)} s · ` : ''}tokens {run.usage.input_tokens ?? 'n/d'}/{run.usage.output_tokens ?? 'n/d'}</span>}
        </div>
        <div className="graph-wrap">
          {mode === 'LIVE' && !live && <div className="stage-message" role="status">
            <h3>{liveError ? 'Análise ao vivo indisponível' : 'Analisando agora…'}</h3>
            <p>{liveError ? `${liveError} Consulte as execuções armazenadas nos modos acima.` : 'A chamada ao modelo pode levar até um minuto.'}</p>
          </div>}
          {run && out && <Graph g={union} run={mode} base={base} cutoff={cutoff} highlightNodes={hlNodes} highlightEdges={hlEdges}
            selectedEdge={selEdge?.key} selectedNode={selNode?.key} onEdge={(e) => inspect(e, null)} onNode={(n) => inspect(null, n)} />}
          {((edgeInfo && shownAt(edgeInfo)) || (nodeInfo && shownAt(nodeInfo))) && (
            <section className="inspector card" ref={inspectorRef} tabIndex={-1} aria-label="Detalhes do mapa" onKeyDown={(e) => { if (e.key === 'Escape') closeInspector(); }}>
              <button className="close-x" onClick={closeInspector} aria-label="Fechar detalhes do mapa">×</button>
              {edgeInfo && selEdge && (
                <>
                  <div className="eyebrow">Relação · {STATUS_LABEL[edgeInfo.status_epistemico]}</div>
                  <h3>{edgeInfo.rotulo}</h3>
                  <div className="muted" style={{ fontSize: 13 }}>{union.nodes.find((n) => n.key === selEdge.s)?.byRun[mode]?.nome} → {union.nodes.find((n) => n.key === selEdge.t)?.byRun[mode]?.nome}</div>
                  <p style={{ fontSize: 13 }}>{edgeInfo.periodo.inicio || edgeInfo.periodo.fim
                    ? <><b>Período</b> · {edgeInfo.periodo.inicio ?? 'início sem registro'} → {edgeInfo.periodo.fim ?? 'fim sem registro'}</>
                    : 'Período sem datas registradas.'}{edgeInfo.periodo.observacao ? ` ${edgeInfo.periodo.observacao}` : ''}</p>
                  {edgeInfo.evidencias.filter((ev) => cutoff === null || allDocs.some((doc, index) => doc.id === ev.doc_id && index <= cutoff)).map((ev, i) => <QuoteBtn key={i} ev={ev} doc={docMap.get(ev.doc_id)} literal={literal(ev)} onOpen={() => docMap.get(ev.doc_id) && setReader({ doc: docMap.get(ev.doc_id)!, focus: ev.trecho })} />)}
                  {base && selEdge.byRun[base] && selEdge.byRun[base].status_epistemico !== edgeInfo.status_epistemico && <p className="note" style={{ fontSize: 13 }}>Mudou de <b>{STATUS_LABEL[selEdge.byRun[base].status_epistemico]}</b> para <b>{STATUS_LABEL[edgeInfo.status_epistemico]}</b> em relação a “{MODE_LABEL[base as Mode]}”.</p>}
                  {base && !selEdge.byRun[base] && <p className="note" style={{ fontSize: 13 }}>Relação que não apareceu em “{MODE_LABEL[base as Mode]}”.</p>}
                </>
              )}
              {selNode && nodeInfo && (
                <>
                  <div className="eyebrow">{ENTITY_LABEL[nodeInfo.tipo]}{nodeInfo.setor_responsavel ? ` · ${nodeInfo.setor_responsavel}` : ''}</div>
                  <h3>{nodeInfo.nome}</h3>
                  <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>{nodeInfo.descricao}</p>
                  <div className="eyebrow" style={{ marginTop: 8 }}>Relações</div>
                  {union.edges.filter((e) => shownAt(e.byRun[mode]) && (e.s === selNode.key || e.t === selNode.key)).map((e) => (
                    <button key={e.key} className="quote" onClick={() => inspect(e, null)} style={{ fontFamily: 'var(--sans)', fontSize: 13 }}>{e.byRun[mode].rotulo}<span className="qmeta">{STATUS_LABEL[e.byRun[mode].status_epistemico]}</span></button>
                  ))}
                </>
              )}
            </section>
          )}
          {mode !== 'LIVE' && guide >= 0 && guide < GUIDE.length && (
            <div className="guide card" role="dialog" aria-label="Guia rápido" onKeyDown={(event) => { if (event.key === 'Escape') setGuide(-1); }}>
              <div className="eyebrow">Guia rápido · {guide + 1}/{GUIDE.length}</div>
              <h3>{GUIDE[guide].t}</h3>
              <p>{GUIDE[guide].p}</p>
              <div className="row">
                <div className="pips">{GUIDE.map((_, i) => <span key={i} className={i <= guide ? 'on' : ''} />)}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn small ghost" onClick={() => { setGuide(-1); try { localStorage.setItem('mcm.guide.done', '1'); } catch {} }}>Pular</button>
                  <button className="btn small" onClick={() => { if (guide === GUIDE.length - 1) { setGuide(-1); try { localStorage.setItem('mcm.guide.done', '1'); } catch {} } else { setGuide(guide + 1); if (guide === 1 && out?.verificacoes[0]) setSelCheck(out.verificacoes[0].id); } }}>{guide === GUIDE.length - 1 ? 'Explorar' : 'Próximo'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <Timeline entries={readingOrder} cutoff={cutoff} onSeek={seek} playing={playing} updateIds={updateIds} />
      </section>

      <aside className="pane review-pane">
        <div className="pane-h">
          <div>
            <h2>Pauta preventiva</h2>
            <span className="muted" style={{ fontSize: 12.5 }}>{out?.verificacoes.length ?? 0} verificações · {nReviewed} revisadas</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={exportMd} disabled={!out}>Baixar pauta (.md)</button>
            <button className="btn small ghost" onClick={() => { setGuide(0); stageRef.current?.scrollIntoView({ block: 'start' }); }}>Guia</button>
          </div>
        </div>
        {out && (
          <div className="checks">
            <p style={{ margin: '4px 4px 0', fontSize: 14, color: 'var(--ink-2)', fontFamily: 'var(--serif)' }}>{out.resumo_situacao}</p>
            {groups.map((g) => (
              <div key={g.k} style={{ display: 'contents' }}>
                <div className="group-h">{g.t}</div>
                {g.items.map((v) => (
                  <CheckCard key={`${mode}:${v.id}`} v={v} sel={selCheck === v.id} open={selCheck === v.id}
                    onSelect={() => { setSelCheck(selCheck === v.id ? null : v.id); setSelEdge(null); setSelNode(null); }}
                    review={reviews[reviewKey(v.id)]} onReview={(p) => update(reviewKey(v.id), p)}
                    docs={docMap} literal={literal} onQuote={(ev) => docMap.get(ev.doc_id) && setReader({ doc: docMap.get(ev.doc_id)!, focus: ev.trecho })}
                    comparison={newlyCovered.has(v.id) ? base : null}
                    onMap={selCheck === v.id && hlNodes.size > 0 ? () => {
                      stageRef.current?.scrollIntoView({ block: 'start' });
                      stageRef.current?.focus({ preventScroll: true });
                    } : undefined} judgeNote={judgeFor(v.id)} tech={tech} />
                ))}
              </div>
            ))}
            {out.achados_temporais.length > 0 && (
              <>
                <div className="group-h">O que mudou ao longo do tempo</div>
                {out.achados_temporais.map((t) => (
                  <div key={t.id} className="check" style={{ padding: '10px 12px' }}>
                    <span className={`chip ${t.tipo === 'contradicao' ? 'contra' : t.tipo === 'problema_resolvido' ? 'moss' : t.tipo === 'historico_superado' ? 'grey' : 'memory'}`}>{TEMPORAL_LABEL[t.tipo] ?? t.tipo}</span>
                    <div style={{ fontSize: 14, marginTop: 6 }}>{t.descricao}</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{t.implicacao}</div>
                    {t.evidencias.length > 0 && <details className="temporal-sources">
                      <summary>Fontes do achado</summary>
                      {t.evidencias.map((ev, i) => <QuoteBtn key={i} ev={ev} doc={docMap.get(ev.doc_id)} literal={literal(ev)}
                        onOpen={() => docMap.get(ev.doc_id) && setReader({ doc: docMap.get(ev.doc_id)!, focus: ev.trecho })} />)}
                    </details>}
                  </div>
                ))}
              </>
            )}
            {out.informacoes_ausentes.length > 0 && (
              <>
                <div className="group-h">Informações que faltam</div>
                {out.informacoes_ausentes.map((x, i) => <div key={i} className="check" style={{ padding: '10px 12px', fontSize: 14 }}><b>{x.descricao}</b><div className="muted" style={{ fontSize: 13 }}>{x.por_que_importa}</div></div>)}
              </>
            )}
            {tech && <TechPanel sc={sc} runs={runs} mode={mode} />}
            <p className="muted" style={{ fontSize: 12, margin: '8px 4px' }}>Protótipo experimental com dados fictícios. A IA sugere perguntas para revisão humana. Não emite alertas, prevê desastres ou decide evacuações.</p>
          </div>
        )}
      </aside>
      {reader && <DocReader doc={reader.doc} quotes={quotesFor(reader.doc.id)} focus={reader.focus} onClose={() => setReader(null)} />}
    </div>
  );
}

function Timeline({ entries, cutoff, onSeek, playing, updateIds }: {
  entries: { doc: Doc; index: number }[];
  cutoff: number | null;
  onSeek: (index: number | null) => void;
  playing: boolean;
  updateIds: Set<string>;
}) {
  if (!entries.length) return null;
  const step = entries.findIndex((entry) => entry.index === cutoff);
  const doc = entries[step]?.doc;
  return (
    <div className="timeline">
      <div className="timeline-heading">
        <h3>Linha do tempo</h3><span className="muted">Pela data das fontes da execução</span>
      </div>
      <div className="scrubber">
        <input type="range" min={0} max={entries.length} step={1} value={step < 0 ? entries.length : step}
          aria-label="Limitar o mapa pela ordem dos documentos" aria-valuetext={doc ? `${doc.id}, ${fmtDate(doc.data)}, ${doc.titulo}` : 'Todos os documentos'}
          onChange={(e) => onSeek(entries[e.target.valueAsNumber]?.index ?? null)} />
        <div className="document-ticks">
          {entries.map(({ doc: marker, index }) => (
            <button type="button" key={marker.id} className={updateIds.has(marker.id) ? 'update' : marker.conjunto}
              aria-label={`${marker.id}, ${fmtDate(marker.data)}, ${marker.titulo}`} title={`${fmtDate(marker.data)} · ${marker.titulo}`}
              aria-pressed={cutoff === index} onClick={() => onSeek(cutoff === index ? null : index)}>{marker.id}</button>
          ))}
          <button type="button" className="all-docs" onClick={() => onSeek(null)} aria-pressed={cutoff === null}>Ver tudo</button>
        </div>
      </div>
      <div className="timeline-caption" role="status">
        {doc ? <><b>{playing ? 'Em leitura' : 'Até este documento'} · {doc.id} · {fmtDate(doc.data)}</b><span>{doc.titulo}</span></>
          : <span>{entries.length} documentos em ordem cronológica. Selecione um para limitar o mapa.</span>}
      </div>
    </div>
  );
}

/** Análise ao vivo só aparece quando a publicação a habilita (VITE_LIVE_ENABLED=1 no build). */
const LIVE_ENABLED = import.meta.env.VITE_LIVE_ENABLED === '1';

/** Na versão pública: atalho para a atualização registrada (execução real armazenada). */
function UpdateShortcut({ hasUpdate, active, onShow }: { hasUpdate: boolean; active: boolean; onShow: () => void }) {
  return (
    <div style={{ padding: '6px 12px 24px' }}>
      <div className="card" style={{ padding: 12 }}>
        <div className="eyebrow">Incorporar uma atualização</div>
        {hasUpdate ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '6px 0 8px' }}>Veja como a IA incorporou um ofício novo da Secretaria de Obras, que cadastra a estrada da Granja como rota alternativa. Resultado de uma execução real armazenada.</p>
            <button className="btn small ghost" onClick={onShow} disabled={active} aria-pressed={active}>{active ? 'Atualização em exibição' : 'Ver a atualização registrada'}</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '6px 0 8px' }}>No caso Vila das Águas, dá para ver como a IA incorporou um ofício novo. Resultado de uma execução real armazenada.</p>
            <a className="btn small ghost" href="?modo=BU#/cenario/E01">Ver a atualização em Vila das Águas</a>
          </>
        )}
        <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>Nesta versão pública, a análise ao vivo está desligada. Rodando o projeto com uma chave própria, é possível escrever um documento novo e pedir outra análise.</p>
      </div>
    </div>
  );
}

function LiveBox({ onRun, scenario, pending }: { onRun: (d?: Doc) => void; scenario: ScenarioView; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState('');
  const [titulo, setTitulo] = useState('');
  return (
    <div style={{ padding: '6px 12px 24px' }}>
      <div className="card" style={{ padding: 12 }}>
        <div className="eyebrow">Incorporar uma atualização</div>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '6px 0 8px' }}>Escreva uma informação fictícia nova (ex.: “a ponte foi vistoriada”) e peça uma nova análise real ao modelo, com todos os documentos deste cenário.</p>
        {!open ? <button className="btn small ghost" onClick={() => setOpen(true)}>Adicionar documento</button> : (
          <form onSubmit={(e) => { e.preventDefault(); onRun({ id: 'N1', conjunto: 'atual', tipo: 'atualizacao_secretaria', titulo: titulo || 'Atualização informada pelo visitante (fictícia)', fonte: 'Visitante da demonstração', data: scenario.alerta_data, texto: txt.slice(0, 1500) }); }}>
            <input aria-label="Título" placeholder="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 120))} style={{ width: '100%', marginBottom: 6, padding: 7, border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)' }} />
            <textarea aria-label="Texto da atualização" required minLength={20} maxLength={1500} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Texto fictício (até 1.500 caracteres)" style={{ width: '100%', minHeight: 90, padding: 8, border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn small" type="submit" disabled={pending}>Analisar agora</button>
              <button className="btn small ghost" type="button" disabled={pending} onClick={() => onRun()}>Reanalisar sem documento novo</button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>Não use dados reais ou pessoais. Há limite de uso por visitante.</p>
          </form>
        )}
      </div>
    </div>
  );
}

function TechPanel({ sc, runs, mode }: { sc: ScenarioView; runs: Record<string, RunView>; mode: string }) {
  const r = runs[mode];
  const v = r?.validation;
  return (
    <div className="card" style={{ padding: 12, fontSize: 13 }}>
      <div className="eyebrow">Camada técnica</div>
      <p style={{ margin: '6px 0' }}>Modelo: <span className="mono">{r?.model}</span> · id da chamada: <span className="mono" style={{ wordBreak: 'break-all' }}>{r?.response_id}</span></p>
      <p style={{ margin: '6px 0' }}>Documentos enviados: <span className="mono">{r?.docs_fornecidos.join(', ')}</span></p>
      {v && <p style={{ margin: '6px 0' }}>Citações literais: <b>{v.n_citacoes_literais}/{v.n_citacoes}</b> · relações órfãs: {v.relacoes_orfas?.length ?? 0} · docs inválidos citados: {v.n_citacoes_doc_invalido}</p>}
      {sc.gold && (
        <>
          <div className="eyebrow" style={{ marginTop: 10 }}>Gabarito (definido antes dos testes) × resultado</div>
          <div className="table-scroll" role="region" aria-label="Gabarito e resultados" tabIndex={0}><table className="t">
            <thead><tr><th>Item</th><th>Requer</th>{['A', 'B'].filter((k) => runs[k]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
            <tbody>
              {sc.gold.checks.map((g: any) => (
                <tr key={g.id}><td><b>{g.id}</b> {g.texto}</td><td>{g.requer}</td>
                  {['A', 'B'].filter((k) => runs[k]).map((k) => <td key={k}>{runs[k].judge?.gold_checks?.find((x: any) => x.id === g.id)?.resultado ?? 'n/d'}</td>)}</tr>
              ))}
              {(sc.gold.proibido ?? []).map((g: any) => (
                <tr key={g.id}><td><b>{g.id}</b> Não deveria: {g.texto}</td><td>proibido</td>
                  {['A', 'B'].filter((k) => runs[k]).map((k) => <td key={k}>{(() => { const item = runs[k].judge?.proibidos?.find((x: any) => x.id === g.id); return item ? (item.violado ? 'violou' : 'ok') : 'n/d'; })()}</td>)}</tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: 11.5 }}>Resultados atribuídos por IA avaliadora com rubrica, sem acesso à condição. Não equivalem à validação por especialistas municipais.</p>
        </>
      )}
    </div>
  );
}
