import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc, Evidencia } from '../../core/schema';
import { Graph, Legend } from '../components/Graph';
import { CheckCard, DocList, DocReader, QuoteBtn } from '../components/Panels';
import { buildUnion, type GEdge, type GNode } from '../lib/graph';
import { CATEGORIA_LABEL, STATUS_LABEL, TEMPORAL_LABEL, alertLevel, fmtDate, loadScenario, type RunView, type ScenarioView } from '../lib/data';
import { useReviews } from '../lib/review';
import { norm } from '../../core/validate';

type Mode = 'A' | 'B' | 'BU' | 'LIVE';
const MODE_LABEL: Record<Mode, string> = { A: 'Só informação atual', B: '+ Memória institucional', BU: '+ Atualização recente', LIVE: 'Análise ao vivo' };

const GUIDE = [
  { t: 'Os documentos do município', p: 'À esquerda está o arquivo fictício: plano de contingência, alerta, ofícios e, em ocre, registros de eventos anteriores. Clique em qualquer um para ler.' },
  { t: 'O que a IA conectou', p: 'No centro, cada ponto é algo que a IA extraiu dos documentos (uma ponte, um abrigo, uma secretaria). As linhas são relações, com o tipo de certeza: fato, inferência, hipótese, contradição ou informação superada.' },
  { t: 'A pauta de verificações', p: 'À direita, as perguntas que a equipe poderia confirmar antes do evento. Clique numa pergunta para ver no mapa o caminho de dependências e as citações literais que a sustentam.' },
  { t: 'Com e sem memória', p: 'No alto, alterne entre a análise feita só com informações atuais e a análise que também recebeu os registros históricos. O que aparece com halo ocre foi revelado pela memória.' },
];

export function Workspace({ id }: { id: string }) {
  const [sc, setSc] = useState<ScenarioView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('B');
  const [live, setLive] = useState<RunView | null>(null);
  const [tech, setTech] = useState(false);
  const [selCheck, setSelCheck] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<GEdge | null>(null);
  const [selNode, setSelNode] = useState<GNode | null>(null);
  const [reader, setReader] = useState<{ doc: Doc; focus?: string } | null>(null);
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [guide, setGuide] = useState<number>(() => { try { return localStorage.getItem('mcm.guide.done') ? -1 : 0; } catch { return 0; } });
  const [size, setSize] = useState({ w: 900, h: 560 });
  const stageRef = useRef<HTMLDivElement>(null);
  const { reviews, update } = useReviews(`${id}`);

  useEffect(() => { setSc(null); setErr(null); setLive(null); setSelCheck(null); setSelEdge(null); setCutoff(null); loadScenario(id).then((s) => { setSc(s); setMode(s.runs.B ? 'B' : 'A'); }).catch((e) => setErr(String(e))); }, [id]);
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(560, Math.round(e.contentRect.width)), h: Math.max(420, Math.round(e.contentRect.height)) }));
    ro.observe(el); return () => ro.disconnect();
  }, [sc]);

  const runs = useMemo(() => {
    if (!sc) return {} as Record<string, RunView>;
    return { ...sc.runs, ...(live ? { LIVE: live } : {}) } as Record<string, RunView>;
  }, [sc, live]);
  const allDocs = useMemo(() => (sc ? [...sc.docs, ...sc.atualizacao].sort((a, b) => a.data.localeCompare(b.data)) : []), [sc]);
  const docMap = useMemo(() => new Map(allDocs.map((d) => [d.id, d])), [allDocs]);
  const W = size.w, H = size.h;
  const union = useMemo(() => (sc ? buildUnion(Object.entries(runs).map(([key, r]) => ({ key, out: r.output })), allDocs, W, H) : null), [sc, runs, allDocs, H]);

  const run = runs[mode];
  const base = mode === 'B' ? (runs.A ? 'A' : null) : mode === 'BU' ? 'B' : null;
  const provided = new Set(run?.docs_fornecidos ?? []);
  const updateIds = new Set(sc?.atualizacao.map((d) => d.id) ?? []);
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
    for (const e of union.edges) {
      const info = e.byRun[mode]; if (!info) continue;
      const bothIn = hn.has(e.s) && hn.has(e.t);
      const shares = (hn.has(e.s) || hn.has(e.t)) && info.evid.some((x) => evDocs.has(x.doc_id));
      if (bothIn || shares) { he.add(e.key); hn.add(e.s); hn.add(e.t); }
    }
    return { hlNodes: hn, hlEdges: he };
  }, [union, run, selCheck, mode]);

  // formação progressiva: avança a linha do tempo documento a documento
  const dates = useMemo(() => [...new Set(allDocs.filter((d) => provided.has(d.id)).map((d) => d.data))].sort(), [allDocs, run]);
  useEffect(() => {
    if (!playing) return;
    let i = 0; setCutoff(dates[0] ?? null);
    const t = setInterval(() => { i++; if (i >= dates.length) { setPlaying(false); setCutoff(null); clearInterval(t); } else setCutoff(dates[i]); }, 1500);
    return () => clearInterval(t);
  }, [playing, dates]);

  const judgeFor = (vid: string) => {
    const j = run?.judge; if (!j) return null;
    const p = j.verificacoes_produzidas?.find((x: any) => x.id === vid);
    const g = j.gold_checks?.filter((x: any) => x.ids_saida?.includes(vid)).map((x: any) => `${x.id} (${x.resultado})`);
    return p ? `${p.classificacao.replace(/_/g, ' ')}${g?.length ? ` · gabarito ${g.join(', ')}` : ''} — ${p.justificativa}` : null;
  };

  async function runLive(extra?: Doc) {
    if (!sc) return;
    setMode('LIVE'); setLive(null);
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: sc.id, cond: 'B', extra_doc: extra ?? null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `erro ${r.status}`);
      setLive(j as RunView);
    } catch (e: any) {
      setLive({ key: 'LIVE', provenance: 'live', response_id: null, model: null, started_at: new Date().toISOString(), latency_ms: 0, usage: { input_tokens: null, output_tokens: null }, docs_fornecidos: [], output: { resumo_situacao: '', entidades: [], relacoes: [], achados_temporais: [], verificacoes: [], informacoes_ausentes: [], cautelas: [] }, validation: { citacoes: [] }, judge: { erro: String(e.message ?? e) } } as any);
    }
  }

  if (err) return <div className="wrap" style={{ padding: 40 }}><h2>Não foi possível carregar o cenário</h2><p className="muted">{err}</p></div>;
  if (!sc || !union) return <div className="wrap" style={{ padding: 40 }} aria-busy="true"><p className="eyebrow">Carregando documentos e análises…</p></div>;

  const out = run?.output;
  const liveError = mode === 'LIVE' && (live as any)?.judge?.erro;
  const groups = out ? [
    { k: 'registro_historico', t: 'Trazidas pela memória institucional' },
    { k: 'ambos', t: 'Combinam informação atual e memória' },
    { k: 'informacao_atual', t: 'A partir das informações atuais' },
  ].map((g) => ({ ...g, items: out.verificacoes.filter((v) => v.base === g.k) })).filter((g) => g.items.length) : [];
  const nReviewed = out ? out.verificacoes.filter((v) => (reviews[`${mode}:${v.id}`]?.status ?? 'pendente') !== 'pendente').length : 0;

  function exportMd() {
    if (!out || !sc) return;
    const lines = [`# Pauta de verificações preventivas — ${sc.municipio} (fictício)`, '', `Cenário: ${sc.titulo} · referência ${fmtDate(sc.alerta_data)} · condição: ${MODE_LABEL[mode]}`, `Origem: ${run.provenance === 'live' ? 'análise executada agora' : `execução real armazenada (${run.model}, ${run.started_at.slice(0, 10)})`}`, '', '> Material experimental com dados fictícios, sujeito à revisão humana. Não substitui protocolos oficiais.', ''];
    out.verificacoes.forEach((v, i) => {
      const r = reviews[`${mode}:${v.id}`];
      lines.push(`## ${i + 1}. ${v.pergunta}`, '', `- Por que importa: ${v.por_que_importa}`, `- O que motivou: ${v.motivacao}`, `- Evidências: ${v.evidencias.map((e) => `[${e.doc_id}] “${e.trecho}”`).join('; ')}`, `- O que ainda não sabemos: ${v.o_que_falta_saber}`, `- Quem poderia confirmar (sujeito à confirmação institucional): ${v.quem_pode_confirmar}`, `- Revisão: ${r?.status ?? 'pendente'}${r?.nota ? ` — ${r.nota}` : ''}`, '');
    });
    if (out.informacoes_ausentes.length) { lines.push('## Informações que faltam', ''); out.informacoes_ausentes.forEach((x) => lines.push(`- ${x.descricao} — ${x.por_que_importa}`)); }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pauta-${sc.id}-${mode}.md`; a.click(); URL.revokeObjectURL(a.href);
  }

  const edgeInfo = selEdge ? selEdge.byRun[mode] : null;
  return (
    <div className="ws">
      <header className="ws-head">
        <div className="ws-title">
          <div className="eyebrow">{sc.id} · {CATEGORIA_LABEL[sc.categoria] ?? sc.categoria} · município fictício</div>
          <h1>{sc.municipio} — {sc.titulo}</h1>
        </div>
        <span className={`alert-pill ${alertLevel(sc.docs)}`}>● Alerta {alertLevel(sc.docs)} (simulado) · {fmtDate(sc.alerta_data)}</span>
        <div className="seg" role="group" aria-label="Condição da análise" style={{ marginLeft: 'auto' }}>
          {(['A', 'B', 'BU'] as Mode[]).filter((m) => runs[m]).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => { setMode(m); setSelCheck(null); setSelEdge(null); }}>
              <span className="dot" style={{ background: m === 'A' ? 'var(--water)' : m === 'B' ? 'var(--memory)' : 'var(--moss)' }} />{MODE_LABEL[m]}
            </button>
          ))}
          {live && <button aria-pressed={mode === 'LIVE'} onClick={() => setMode('LIVE')}><span className="dot" style={{ background: 'var(--moss)' }} />Ao vivo</button>}
        </div>
        <button className="theme-btn" aria-pressed={tech} onClick={() => setTech(!tech)} title="Mostrar detalhes técnicos">{tech ? '◉' : '○'} Camada técnica</button>
      </header>

      <aside className="pane">
        <div className="pane-h">
          <h2>Arquivo do município</h2>
          <div className="muted" style={{ fontSize: 12.5 }}>{provided.size} de {allDocs.length} documentos nesta análise · <span style={{ color: 'var(--water)' }}>■</span> atual <span style={{ color: 'var(--memory)' }}>■</span> histórico {updateIds.size > 0 && <><span style={{ color: 'var(--moss)' }}>■</span> atualização</>}</div>
        </div>
        <DocList docs={allDocs} provided={provided} cites={cites} updateIds={updateIds} onOpen={(d) => setReader({ doc: d })} selected={reader?.doc.id} />
        <LiveBox onRun={runLive} scenario={sc} />
      </aside>

      <section className="stage">
        <div className="stage-tools">
          {run && (
            <span className={`provenance ${run.provenance}`} title={run.response_id ?? ''}>
              <span className="led" />{run.provenance === 'live' ? 'Executada agora' : 'Execução real armazenada'} · {run.model ?? '—'} · {run.started_at?.slice(0, 10)}
            </span>
          )}
          <button className="btn small ghost" onClick={() => setPlaying(true)} disabled={playing}>▶ Formação do conhecimento</button>
          {base && <span className="chip memory">halo ocre = novo em relação a “{MODE_LABEL[base as Mode]}”</span>}
          {tech && run && <span className="mono muted" style={{ fontSize: 11 }}>{out?.entidades.length} entidades · {out?.relacoes.length} relações · {run.latency_ms ? `${(run.latency_ms / 1000).toFixed(1)} s` : ''} · tokens {run.usage.input_tokens ?? '—'}/{run.usage.output_tokens ?? '—'}</span>}
        </div>
        <div className="graph-wrap" ref={stageRef}>
          {mode === 'LIVE' && !live && <div className="guide card" style={{ bottom: '45%' }}><h3>Analisando agora…</h3><p>Chamada real ao modelo em andamento. Pode levar até um minuto.</p></div>}
          {liveError && <div className="guide card" style={{ bottom: '45%' }}><h3>A análise ao vivo não está disponível</h3><p>{liveError}. As execuções reais armazenadas continuam disponíveis nos outros modos.</p></div>}
          {run && out && (
            <Graph g={union} width={W} height={H} run={mode} base={base} cutoff={cutoff} highlightNodes={hlNodes} highlightEdges={hlEdges}
              selectedEdge={selEdge?.key} hover={hover} onHover={setHover}
              onEdge={(e) => { setSelEdge(e); setSelNode(null); }} onNode={(n) => { setSelNode(n); setSelEdge(null); }} />
          )}
          <Legend />
          {(edgeInfo || selNode) && (
            <div className="inspector card">
              <button className="close-x" onClick={() => { setSelEdge(null); setSelNode(null); }} aria-label="Fechar">×</button>
              {edgeInfo && selEdge && (
                <>
                  <div className="eyebrow">Relação · {STATUS_LABEL[edgeInfo.status]}</div>
                  <h3>{edgeInfo.rotulo}</h3>
                  <div className="muted" style={{ fontSize: 13 }}>{union.nodes.find((n) => n.key === selEdge.s)?.label} → {union.nodes.find((n) => n.key === selEdge.t)?.label}</div>
                  {(edgeInfo.periodo?.inicio || edgeInfo.periodo?.fim || edgeInfo.periodo?.observacao) && <p style={{ fontSize: 13 }}>Período: {edgeInfo.periodo.inicio ?? '?'} → {edgeInfo.periodo.fim ?? 'sem fim registrado'}{edgeInfo.periodo.observacao ? ` · ${edgeInfo.periodo.observacao}` : ''}</p>}
                  {edgeInfo.evid.map((ev, i) => <QuoteBtn key={i} ev={ev} doc={docMap.get(ev.doc_id)} literal={literal(ev)} onOpen={() => docMap.get(ev.doc_id) && setReader({ doc: docMap.get(ev.doc_id)!, focus: ev.trecho })} />)}
                  {base && selEdge.byRun[base] && selEdge.byRun[base].status !== edgeInfo.status && <p className="note" style={{ fontSize: 13 }}>Mudou de <b>{STATUS_LABEL[selEdge.byRun[base].status]}</b> para <b>{STATUS_LABEL[edgeInfo.status]}</b> em relação a “{MODE_LABEL[base as Mode]}”.</p>}
                  {base && !selEdge.byRun[base] && <p className="note" style={{ fontSize: 13 }}>Relação que não apareceu em “{MODE_LABEL[base as Mode]}”.</p>}
                </>
              )}
              {selNode && (
                <>
                  <div className="eyebrow">{selNode.tipo.replace(/_/g, ' ')}{selNode.setor ? ` · ${selNode.setor}` : ''}</div>
                  <h3>{selNode.label}</h3>
                  <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>{selNode.desc}</p>
                  <div className="eyebrow" style={{ marginTop: 8 }}>Relações</div>
                  {union.edges.filter((e) => e.byRun[mode] && (e.s === selNode.key || e.t === selNode.key)).map((e) => (
                    <button key={e.key} className="quote" onClick={() => { setSelEdge(e); setSelNode(null); }} style={{ fontFamily: 'var(--sans)', fontSize: 13 }}>{e.byRun[mode].rotulo}<span className="qmeta">{STATUS_LABEL[e.byRun[mode].status]}</span></button>
                  ))}
                </>
              )}
            </div>
          )}
          {guide >= 0 && guide < GUIDE.length && (
            <div className="guide card" role="dialog" aria-label="Guia rápido">
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
        <Timeline docs={allDocs.filter((d) => provided.has(d.id))} cutoff={cutoff} setCutoff={setCutoff} />
      </section>

      <aside className="pane">
        <div className="pane-h">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h2>Pauta preventiva</h2>
            <span className="muted" style={{ fontSize: 12.5 }}>{out?.verificacoes.length ?? 0} verificações · {nReviewed} revisadas</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={exportMd}>Baixar pauta (.md)</button>
            <button className="btn small ghost" onClick={() => setGuide(0)}>Guia</button>
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
                    review={reviews[`${mode}:${v.id}`]} onReview={(p) => update(`${mode}:${v.id}`, p)}
                    docs={docMap} literal={literal} onQuote={(ev) => docMap.get(ev.doc_id) && setReader({ doc: docMap.get(ev.doc_id)!, focus: ev.trecho })}
                    judgeNote={judgeFor(v.id)} tech={tech} />
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
            <p className="muted" style={{ fontSize: 12, margin: '8px 4px' }}>Verificações geradas por IA para revisão humana. Não são alertas, previsões nem recomendações oficiais. Dados fictícios.</p>
          </div>
        )}
      </aside>
      {reader && <DocReader doc={reader.doc} quotes={quotesFor(reader.doc.id)} focus={reader.focus} onClose={() => setReader(null)} />}
    </div>
  );
}

function Timeline({ docs, cutoff, setCutoff }: { docs: Doc[]; cutoff: string | null; setCutoff: (d: string | null) => void }) {
  if (!docs.length) return null;
  const ts = docs.map((d) => +new Date(d.data));
  const min = Math.min(...ts), max = Math.max(...ts);
  const x = (d: string) => 20 + ((+new Date(d) - min) / Math.max(1, max - min)) * 760;
  const years = [...new Set(docs.map((d) => d.data.slice(0, 4)))];
  return (
    <div className="timeline">
      <span className="eyebrow" style={{ whiteSpace: 'nowrap' }}>Linha do tempo</span>
      <svg viewBox="0 0 800 46" preserveAspectRatio="none" aria-label="Linha do tempo dos documentos; clique para ver o conhecimento disponível em cada data">
        <line className="tl-axis" x1={10} x2={790} y1={22} y2={22} />
        {years.map((y) => <text key={y} className="tl-label" x={x(`${y}-01-01`) < 20 ? 20 : x(`${y}-01-01`)} y={42}>{y}</text>)}
        {docs.map((d) => (
          <g key={d.id} className="tl-tick" onClick={() => setCutoff(cutoff === d.data ? null : d.data)}>
            <circle cx={x(d.data)} cy={22} r={cutoff && d.data <= cutoff ? 6 : 5} fill={d.conjunto === 'memoria' ? 'var(--memory)' : 'var(--water)'} stroke="var(--paper)" strokeWidth={2} opacity={cutoff && d.data > cutoff ? 0.3 : 1}>
              <title>{d.id} · {fmtDate(d.data)} · {d.titulo}</title>
            </circle>
            <text className="tl-label" x={x(d.data)} y={11} textAnchor="middle">{d.id}</text>
          </g>
        ))}
        {cutoff && <line className="tl-cursor" x1={x(cutoff)} x2={x(cutoff)} y1={4} y2={36} />}
      </svg>
      {cutoff ? <button className="btn small ghost" onClick={() => setCutoff(null)}>Ver tudo</button> : <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>clique numa data</span>}
    </div>
  );
}

function LiveBox({ onRun, scenario }: { onRun: (d?: Doc) => void; scenario: ScenarioView }) {
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
              <button className="btn small" type="submit">Analisar agora</button>
              <button className="btn small ghost" type="button" onClick={() => onRun()}>Reanalisar sem novo doc.</button>
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
          <table className="t">
            <thead><tr><th>Item</th><th>Requer</th>{['A', 'B'].filter((k) => runs[k]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
            <tbody>
              {sc.gold.checks.map((g: any) => (
                <tr key={g.id}><td><b>{g.id}</b> {g.texto}</td><td>{g.requer}</td>
                  {['A', 'B'].filter((k) => runs[k]).map((k) => <td key={k}>{runs[k].judge?.gold_checks?.find((x: any) => x.id === g.id)?.resultado ?? '—'}</td>)}</tr>
              ))}
              {(sc.gold.proibido ?? []).map((g: any) => (
                <tr key={g.id}><td><b>{g.id}</b> Não deveria: {g.texto}</td><td>proibido</td>
                  {['A', 'B'].filter((k) => runs[k]).map((k) => <td key={k}>{runs[k].judge?.proibidos?.find((x: any) => x.id === g.id)?.violado ? 'violou' : 'ok'}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11.5 }}>Resultados atribuídos por IA avaliadora com rubrica, sem acesso à condição. Não equivalem à validação por especialistas municipais.</p>
        </>
      )}
    </div>
  );
}
