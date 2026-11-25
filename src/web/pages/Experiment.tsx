import { useEffect, useState } from 'react';
import { CATEGORIA_LABEL, loadIndex, pct, type IndexView } from '../lib/data';

const ROWS: [string, string, 'pct' | 'num', boolean][] = [
  ['recall_verificacoes', 'Verificações esperadas encontradas (recall)', 'pct', true],
  ['recall_verificacoes_atual', '… que dependem só do contexto atual', 'pct', true],
  ['recall_verificacoes_memoria', '… que dependem do histórico', 'pct', true],
  ['recall_dependencias', 'Dependências esperadas identificadas', 'pct', true],
  ['interpretacao_temporal', 'Interpretações temporais corretas', 'pct', true],
  ['insuficiencia_reconhecida', 'Informações insuficientes reconhecidas', 'pct', true],
  ['precisao_pertinente', 'Precisão (verificações pertinentes / total)', 'pct', true],
  ['taxa_falsos_alarmes', 'Falsos alarmes (irrelevantes, sem respaldo ou superadas)', 'pct', false],
  ['verificacoes_media', 'Verificações por cenário (média)', 'num', false],
  ['violacoes_proibidos', 'Afirmações proibidas produzidas', 'num', false],
  ['temporal_incorreto', 'Interpretações temporais invertidas', 'num', false],
  ['afirmacoes_sem_respaldo', 'Afirmações sem respaldo documental', 'num', false],
  ['fidelidade_citacoes', 'Citações encontradas literalmente', 'pct', true],
  ['latencia_mediana_ms', 'Latência mediana por análise (s)', 'num', false],
];

export function Experiment() {
  const [ix, setIx] = useState<IndexView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadIndex().then(setIx).catch((e) => setErr(String(e))); }, []);
  if (err) return <div className="wrap" style={{ padding: 40 }}><p>{err}</p></div>;
  if (!ix) return <div className="wrap" style={{ padding: 40 }}><p className="eyebrow">Carregando resultados…</p></div>;
  const S = ix.summary;
  if (!S?.por_condicao?.A) return <div className="wrap" style={{ padding: 40 }}><h2>Resultados ainda não publicados</h2></div>;
  const A = S.por_condicao.A, B = S.por_condicao.B;
  const evals = ix.scenarios.filter((s) => s.split === 'eval');
  const fmt = (k: string, v: number, t: string) => (k === 'latencia_mediana_ms' ? (v / 1000).toFixed(1) : t === 'pct' ? pct(v) : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const cmp = S.comparacao_pareada_B_menos_A;

  // gráfico de halteres por cenário
  const rows = evals.map((s) => ({ s, a: s.metrics?.A?.recall_checks, b: s.metrics?.B?.recall_checks, fa: s.metrics?.A?.falsos_alarmes, fb: s.metrics?.B?.falsos_alarmes, va: s.metrics?.A?.n_violacoes, vb: s.metrics?.B?.n_violacoes }))
    .sort((x, y) => (y.b - y.a) - (x.b - x.a) || y.b - x.b);
  const W = 760, rowH = 24, left = 250, right = 120, top = 30;
  const x = (v: number) => left + v * (W - left - right);
  return (
    <div className="wrap" style={{ padding: '36px 20px 80px' }}>
      <div className="eyebrow">Experimento A × B</div>
      <h1 style={{ fontSize: 38, maxWidth: 820 }}>O que a memória institucional acrescentou — e onde atrapalhou</h1>
      <p className="prose" style={{ color: 'var(--ink-2)', fontSize: 16.5 }}>
        Mesmo modelo, mesmas instruções e mesmo formato de resposta, em chamadas independentes. A única diferença: em B o modelo também recebeu relatórios e atas de eventos anteriores.
        {` ${evals.length} cenários de avaliação, ${A.n_execucoes + B.n_execucoes} execuções na comparação principal.`} Gabaritos escritos e congelados antes das execuções.
      </p>

      <div className="card" style={{ padding: '8px 18px', marginTop: 22 }}>
        <div className="metric-row h"><div>Métrica</div><div>A · só atual</div><div>B · + memória</div><div>Diferença pareada B−A (IC 95%)</div></div>
        {ROWS.map(([k, l, t]) => (
          <div className="metric-row" key={k}>
            <div>{l}</div>
            <div className="a">{fmt(k, A[k], t)}</div>
            <div className="b">{fmt(k, B[k], t)}</div>
            <div className="mono muted" style={{ fontSize: 12 }}>
              {k === 'recall_verificacoes' && cmp?.recall_checks ? `${(cmp.recall_checks.diff_media * 100).toFixed(0)} p.p. [${(cmp.recall_checks.ic95[0] * 100).toFixed(0)}; ${(cmp.recall_checks.ic95[1] * 100).toFixed(0)}] · B melhor em ${cmp.recall_checks.b_melhor}, A em ${cmp.recall_checks.a_melhor}` : ''}
              {k === 'recall_verificacoes_memoria' && cmp?.recall_checks_memoria ? `${(cmp.recall_checks_memoria.diff_media * 100).toFixed(0)} p.p. [${(cmp.recall_checks_memoria.ic95[0] * 100).toFixed(0)}; ${(cmp.recall_checks_memoria.ic95[1] * 100).toFixed(0)}]` : ''}
              {k === 'recall_verificacoes_atual' && cmp?.recall_checks_atual ? `${(cmp.recall_checks_atual.diff_media * 100).toFixed(0)} p.p. [${(cmp.recall_checks_atual.ic95[0] * 100).toFixed(0)}; ${(cmp.recall_checks_atual.ic95[1] * 100).toFixed(0)}]` : ''}
              {k === 'precisao_pertinente' && cmp?.precision ? `${(cmp.precision.diff_media * 100).toFixed(0)} p.p. [${(cmp.precision.ic95[0] * 100).toFixed(0)}; ${(cmp.precision.ic95[1] * 100).toFixed(0)}]` : ''}
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>Recall: atendido = 1, parcial = 0,5. Em A, itens que dependem do histórico são uma limitação legítima de acesso, não uma omissão. Intervalos por bootstrap pareado por cenário (10 mil reamostras). Classificações semânticas atribuídas por IA avaliadora cega à condição, com auditoria manual de amostra.</p>

      <h2 style={{ marginTop: 40 }}>Cenário a cenário</h2>
      <p className="muted">Proporção das verificações esperadas encontradas em A (<span style={{ color: 'var(--water)' }}>●</span>) e B (<span style={{ color: 'var(--memory)' }}>●</span>). À direita, falsos alarmes e afirmações proibidas (A/B). Clique para abrir o cenário.</p>
      <div className="card" style={{ padding: 10, overflowX: 'auto' }}>
        <svg className="dumbbell" viewBox={`0 0 ${W} ${top + rows.length * rowH + 10}`} style={{ width: '100%', minWidth: 620 }}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={top - 8} y2={top + rows.length * rowH} stroke="var(--rule)" strokeDasharray="2 4" /><text className="ax" x={x(v)} y={top - 12} textAnchor="middle">{v * 100}%</text></g>)}
          <text className="ax" x={W - right + 10} y={top - 12}>falsos · proib.</text>
          {rows.map((r, i) => {
            const y = top + i * rowH + rowH / 2;
            return (
              <a key={r.s.id} href={`#/cenario/${r.s.id}`}>
                <g className="row">
                  <rect className="bg" x={0} y={y - rowH / 2} width={W} height={rowH} fill="transparent" />
                  <text x={8} y={y + 4}>{r.s.id} · {(CATEGORIA_LABEL[r.s.categoria] ?? r.s.categoria).slice(0, 30)}</text>
                  {r.a != null && r.b != null && <line x1={x(r.a)} x2={x(r.b)} y1={y} y2={y} stroke={r.b >= r.a ? 'var(--memory)' : 'var(--contra)'} strokeWidth={2.5} opacity={0.6} />}
                  {r.a != null && <circle cx={x(r.a)} cy={y} r={5.5} fill="var(--water)" />}
                  {r.b != null && <circle cx={x(r.b)} cy={y} r={5.5} fill="var(--memory)" stroke="var(--paper)" />}
                  <text x={W - right + 10} y={y + 4} className="ax">{r.fa ?? '—'}/{r.fb ?? '—'} · {r.va ?? '—'}/{r.vb ?? '—'}</text>
                </g>
              </a>
            );
          })}
        </svg>
      </div>

      <h2 style={{ marginTop: 40 }}>Por tipo de situação</h2>
      <div className="card" style={{ padding: 10, overflowX: 'auto' }}>
        <table className="t">
          <thead><tr><th>Situação</th><th>Cenários</th><th>Recall A</th><th>Recall B</th><th>Falsos alarmes A/B</th><th>Proibidas A/B</th></tr></thead>
          <tbody>
            {Object.entries(S.por_categoria as Record<string, any>).map(([c, v]) => (
              <tr key={c}><td>{CATEGORIA_LABEL[c] ?? c}</td><td>{evals.filter((s) => s.categoria === c).length}</td><td>{pct(v.A?.recall)}</td><td>{pct(v.B?.recall)}</td><td>{v.A?.falsos}/{v.B?.falsos}</td><td>{v.A?.violacoes}/{v.B?.violacoes}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {S.estabilidade && (
        <>
          <h2 style={{ marginTop: 40 }}>Estabilidade em repetições</h2>
          <p className="prose" style={{ color: 'var(--ink-2)' }}>
            {S.estabilidade.A.cenarios} cenários foram executados {S.estabilidade.A.execucoes_por_cenario.toFixed(0)} vezes em cada condição.
            Em A, {pct(S.estabilidade.A.itens_gabarito_com_resultado_identico)} dos itens do gabarito tiveram o mesmo resultado em todas as repetições; em B, {pct(S.estabilidade.B.itens_gabarito_com_resultado_identico)}.
            Recall por repetição — A: {S.estabilidade.A.recall_por_rep.map((v: number) => pct(v)).join(' · ')}; B: {S.estabilidade.B.recall_por_rep.map((v: number) => pct(v)).join(' · ')}.
          </p>
        </>
      )}

      {S.casos && (
        <>
          <h2 style={{ marginTop: 40 }}>Casos para olhar de perto</h2>
          <div className="exp-grid" style={{ marginTop: 12 }}>
            {S.casos.map((c: any) => (
              <a key={c.id + c.titulo} className="card" href={`#/cenario/${c.id}`} style={{ padding: 16, textDecoration: 'none', color: 'inherit' }}>
                <span className={`chip ${c.tipo === 'falha' ? 'contra' : c.tipo === 'sucesso' ? 'moss' : 'memory'}`}>{c.tipo}</span>
                <h3 style={{ fontSize: 17, margin: '8px 0 6px' }}>{c.id} · {c.titulo}</h3>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{c.texto}</p>
              </a>
            ))}
          </div>
        </>
      )}
      {S.auditoria && (
        <>
          <h2 style={{ marginTop: 40 }}>Auditoria do avaliador</h2>
          <p className="prose" style={{ color: 'var(--ink-2)' }}>{S.auditoria.texto}</p>
        </>
      )}
    </div>
  );
}
