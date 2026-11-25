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
  const delta = (a?: number, b?: number) => a != null && b != null ? b - a : -Infinity;
  const rows = evals.map((s) => ({ s, a: s.metrics?.A?.recall_checks, b: s.metrics?.B?.recall_checks, fa: s.metrics?.A?.falsos_alarmes, fb: s.metrics?.B?.falsos_alarmes, va: s.metrics?.A?.n_violacoes, vb: s.metrics?.B?.n_violacoes }))
    .sort((x, y) => delta(y.a, y.b) - delta(x.a, x.b) || (y.b ?? 0) - (x.b ?? 0));
  const x = (v: number) => 7 + v * 226;
  return (
    <div className="wrap editorial-page experiment-page">
      <header className="editorial-head">
      <div className="eyebrow">Experimento A × B</div>
      <h1 className="editorial-title">O que a memória institucional acrescentou — e onde atrapalhou</h1>
      <p className="prose" style={{ color: 'var(--ink-2)', fontSize: 16.5 }}>
        Mesmo modelo, mesmas instruções e mesmo formato de resposta, em chamadas independentes. A única diferença: em B o modelo também recebeu relatórios e atas de eventos anteriores.
        {` ${evals.length} cenários de avaliação, ${A.n_execucoes + B.n_execucoes} execuções na comparação principal.`} Gabaritos escritos e congelados antes das execuções.
      </p>
      </header>

      <h2>Resultados agregados</h2>
      <div className="table-scroll" role="region" aria-label="Resultados agregados por condição" tabIndex={0}>
        <table className="t metric-table">
          <thead><tr><th scope="col">Métrica</th><th scope="col" className="a">A · Atual</th><th scope="col" className="b">B · Atual + memória</th><th scope="col">Diferença pareada B−A (IC 95%)</th></tr></thead>
          <tbody>
        {ROWS.map(([k, l, t]) => (
          <tr key={k}>
            <th scope="row">{l}</th>
            <td className="a">{A[k] == null ? '—' : fmt(k, A[k], t)}</td>
            <td className="b">{B[k] == null ? '—' : fmt(k, B[k], t)}</td>
            <td className="mono muted" style={{ fontSize: 12 }}>
              {k === 'recall_verificacoes' && cmp?.recall_checks ? `${(cmp.recall_checks.diff_media * 100).toFixed(0)} p.p. [${(cmp.recall_checks.ic95[0] * 100).toFixed(0)}; ${(cmp.recall_checks.ic95[1] * 100).toFixed(0)}] · B melhor em ${cmp.recall_checks.b_melhor}, A em ${cmp.recall_checks.a_melhor}` : ''}
              {k === 'recall_verificacoes_memoria' && cmp?.recall_checks_memoria ? `${(cmp.recall_checks_memoria.diff_media * 100).toFixed(0)} p.p. [${(cmp.recall_checks_memoria.ic95[0] * 100).toFixed(0)}; ${(cmp.recall_checks_memoria.ic95[1] * 100).toFixed(0)}]` : ''}
              {k === 'recall_verificacoes_atual' && cmp?.recall_checks_atual ? `${(cmp.recall_checks_atual.diff_media * 100).toFixed(0)} p.p. [${(cmp.recall_checks_atual.ic95[0] * 100).toFixed(0)}; ${(cmp.recall_checks_atual.ic95[1] * 100).toFixed(0)}]` : ''}
              {k === 'precisao_pertinente' && cmp?.precision ? `${(cmp.precision.diff_media * 100).toFixed(0)} p.p. [${(cmp.precision.ic95[0] * 100).toFixed(0)}; ${(cmp.precision.ic95[1] * 100).toFixed(0)}]` : ''}
            </td>
          </tr>
        ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>Recall: atendido = 1, parcial = 0,5. Em A, itens que dependem do histórico são uma limitação legítima de acesso, não uma omissão. Intervalos por bootstrap pareado por cenário (10 mil reamostras). Classificações semânticas atribuídas por IA avaliadora cega à condição, com auditoria manual de amostra.</p>

      <figure className="scenario-chart">
        <figcaption>
          <h2>Cenário a cenário</h2>
          <p className="muted">Proporção de verificações esperadas encontradas. Os cenários aparecem em ordem de diferença entre B e A, da maior para a menor.</p>
          <div className="conditions"><span className="a"><b>A</b> Só informações atuais</span><span className="b"><b>B</b> Informações atuais + memória</span></div>
        </figcaption>
        <div className="chart-head" aria-hidden="true">
          <span>Cenário</span><span className="chart-scale"><span>0%</span><span>50%</span><span>100%</span></span><span>Verificações</span><span>Falsos alarmes / proibidas</span>
        </div>
        <ul className="dumbbell-list">
          {rows.map((r) => (
            <li key={r.s.id}>
              <a href={`#/cenario/${r.s.id}`} className="chart-row">
                <span className="chart-name"><b>{r.s.id}</b> {CATEGORIA_LABEL[r.s.categoria] ?? r.s.categoria}</span>
                <svg viewBox="0 0 240 28" aria-hidden="true">
                  {[0, .25, .5, .75, 1].map((v) => <line key={v} x1={x(v)} x2={x(v)} y1="0" y2="28" stroke="var(--rule)" strokeDasharray="2 3" />)}
                  {r.a != null && r.b != null && <line x1={x(r.a)} x2={x(r.b)} y1="14" y2="14" stroke="var(--ink-3)" strokeWidth="1.5" />}
                  {r.a != null && <circle cx={x(r.a)} cy="14" r="5.5" fill="var(--paper-3)" stroke="var(--water)" strokeWidth="2" />}
                  {r.b != null && <path d={`M${x(r.b)} 10 l4 4 -4 4 -4 -4Z`} fill="var(--memory)" stroke="var(--paper-3)" />}
                </svg>
                <span className="chart-values"><span className="a">A {pct(r.a)}</span><span className="b">B {pct(r.b)}</span></span>
                <span className="chart-errors"><span>Falsos A/B {r.fa ?? '—'}/{r.fb ?? '—'}</span><span>Proibidas A/B {r.va ?? '—'}/{r.vb ?? '—'}</span></span>
              </a>
            </li>
          ))}
        </ul>
      </figure>

      <h2 style={{ marginTop: 40 }}>Por tipo de situação</h2>
      <div className="table-scroll" role="region" aria-label="Resultados por tipo de situação" tabIndex={0}>
        <table className="t category-table">
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
              <a key={c.id + c.titulo} className="step scenario-link" href={`#/cenario/${c.id}`}>
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
