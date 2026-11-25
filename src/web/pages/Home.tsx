import { useEffect, useState } from 'react';
import { CATEGORIA_LABEL, loadIndex, pct, type IndexView } from '../lib/data';

/** Ilustração: documentos soltos que se reorganizam em conhecimento conectado. Exemplo ilustrativo. */
function Morph() {
  const [k, setK] = useState(0);
  const docs = [
    { x: 40, y: 50, r: -6, t: 'Relatório 2024' }, { x: 250, y: 30, r: 4, t: 'Plano vigente' },
    { x: 70, y: 250, r: 3, t: 'Ata pós-evento' }, { x: 300, y: 240, r: -4, t: 'Alerta (simulado)' },
  ];
  const nodes = [
    { x: 70, y: 200, t: 'Inundação', c: 'var(--water)' }, { x: 175, y: 120, t: 'Ponte A', c: 'var(--ink)' },
    { x: 290, y: 175, t: 'Rota de acesso', c: 'var(--memory)' }, { x: 380, y: 95, t: 'Abrigo A', c: 'var(--ink)' },
  ];
  return (
    <figure className="hero-map">
      <figcaption><span>exemplo ilustrativo</span><button type="button" onClick={() => setK(k + 1)}>Repetir animação <span aria-hidden="true">↻</span></button></figcaption>
      <svg className="morph" viewBox="0 0 460 400" key={k} role="img" aria-label="Quatro documentos se transformam em uma cadeia de dependência entre inundação, ponte, rota de acesso e abrigo.">
      <defs><pattern id="hero-grid" width="23" height="23" patternUnits="userSpaceOnUse"><path d="M23 0H0V23" fill="none" stroke="var(--rule)" strokeWidth=".7" /></pattern></defs>
      <rect width="460" height="400" fill="url(#hero-grid)" opacity=".65" />
      {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M-5 ${37 + i * 24} C130 ${200 + i * 21} 340 ${-57 + i * 19} 465 ${105 + i * 26}`} fill="none" stroke="var(--water)" strokeWidth=".7" opacity=".25" />)}
      <style>{`
        .md { animation: md 1.6s cubic-bezier(.6,0,.3,1) .6s forwards; transform-box: fill-box; transform-origin: center; }
        @keyframes md { to { opacity: 0; transform: scale(.25) rotate(0deg); } }
        .mn { opacity: 0; animation: mn .6s ease forwards; }
        @keyframes mn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .ml { stroke-dasharray: 200; stroke-dashoffset: 200; animation: ml .9s ease forwards; }
        @keyframes ml { to { stroke-dashoffset: 0; } }
        .mq { opacity: 0; animation: mn .6s ease 4.1s forwards; }
        @media (prefers-reduced-motion: reduce) { .md { opacity: 0 } .mn, .mq { opacity: 1 } .ml { stroke-dashoffset: 0 } }
      `}</style>
      {docs.map((d, i) => (
        <g key={i} className="md" style={{ animationDelay: `${0.6 + i * 0.15}s` }} transform={`translate(${d.x},${d.y}) rotate(${d.r})`}>
          <rect width="130" height="150" rx="6" fill="var(--paper-3)" stroke="var(--rule)" />
          <rect x="12" y="14" width="70" height="7" rx="2" fill={i === 0 || i === 2 ? 'var(--memory)' : 'var(--water)'} opacity=".7" />
          {[34, 46, 58, 70, 82, 94, 106].map((y) => <rect key={y} x="12" y={y} width={y % 24 ? 100 : 80} height="4" rx="2" fill="var(--rule)" />)}
          <text x="12" y="134" fontSize="11" fontFamily="var(--mono)" fill="var(--ink-3)">{d.t}</text>
        </g>
      ))}
      {nodes.slice(1).map((n, i) => (
        <line key={i} className="ml" style={{ animationDelay: `${2.4 + i * 0.35}s` }} x1={nodes[i].x} y1={nodes[i].y} x2={n.x} y2={n.y} stroke={i === 1 ? 'var(--memory)' : 'var(--ink-2)'} strokeWidth={i === 1 ? 2.4 : 1.6} />
      ))}
      {nodes.map((n, i) => (
        <g key={i} className="mn" style={{ animationDelay: `${2 + i * 0.3}s` }}>
          {i === 2 && <circle cx={n.x} cy={n.y} r="22" fill="var(--memory-glow)" />}
          <circle cx={n.x} cy={n.y} r="9" fill="var(--paper-3)" stroke={n.c} strokeWidth="2" />
          <text x={n.x} y={n.y + 26} textAnchor="middle" fontSize="13" fontFamily="var(--sans)" fill="var(--ink)">{n.t}</text>
        </g>
      ))}
      <g className="mq">
        <rect x="40" y="300" width="390" height="78" rx="10" fill="var(--paper-3)" stroke="var(--ink)" />
        <text x="58" y="326" fontSize="11" fontFamily="var(--mono)" fill="var(--memory)">VERIFICAÇÃO SUGERIDA · PARA REVISÃO HUMANA</text>
        <text x="58" y="348" fontSize="15" fontFamily="var(--serif)" fill="var(--ink)">A Ponte A continua sendo o único acesso</text>
        <text x="58" y="367" fontSize="15" fontFamily="var(--serif)" fill="var(--ink)">ao abrigo? Existe rota alternativa?</text>
      </g>
      </svg>
    </figure>
  );
}

export function Home() {
  const [ix, setIx] = useState<IndexView | null>(null);
  useEffect(() => { loadIndex().then(setIx).catch(() => setIx(null)); }, []);
  const A = ix?.summary?.por_condicao?.A, B = ix?.summary?.por_condicao?.B;
  const featured = ix?.scenarios.filter((s) => ix.featured.includes(s.id)) ?? [];
  return (
    <>
      <section className="hero">
        <svg className="topo-bg" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 1200 600">
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M0 ${60 + i * 40} C 300 ${20 + i * 42}, 600 ${110 + i * 38}, 1200 ${50 + i * 41}`} fill="none" stroke="var(--rule)" strokeWidth="1" />)}
        </svg>
        <div className="hero-inner">
          <div>
            <div className="eyebrow">Protótipo · preparação municipal para inundações</div>
            <h1>Quando o próximo alerta chegar, o município <em>lembra</em> do que aprendeu?</h1>
            <p className="lead">Relatórios de ocorrência, atas e planos ficam espalhados entre secretarias e se perdem com a troca de equipes. Este protótipo usa IA para ler esses documentos, conectar o que está disperso e montar uma pauta de verificações preventivas — com as fontes à vista, para a equipe revisar.</p>
            <div className="hero-actions">
              <a className="btn" href="#/cenario/E01">Explorar Vila das Águas →</a>
              <a className="btn ghost" href="#/experimento">Ver o experimento</a>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>Municípios, documentos e alertas são fictícios. A IA não emite alertas, não prevê desastres e não decide nada: ela sugere perguntas para revisão humana.</p>
          </div>
          <Morph />
        </div>
      </section>

      <section className="map-reading">
        <div className="wrap reading-inner">
          <h2>Como ler o mapa</h2>
          <div><span className="key-swatch water" aria-hidden="true" />Azul <span>Informação atual</span></div>
          <div><span className="key-swatch memory" aria-hidden="true" />Ocre <span>O que apareceu com a memória</span></div>
          <div><span className="reading-mark" aria-hidden="true">? ≠</span>Marcas <span>Hipóteses e contradições</span></div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="eyebrow">Como funciona</div>
          <h2>De documentos soltos a uma pauta que a equipe pode revisar</h2>
          <div className="steps">
            <div className="step"><h3>Reunir o que existe</h3><p>Plano de contingência vigente, o cenário de alerta, ofícios recentes e — quando houver — relatórios e atas de eventos anteriores.</p></div>
            <div className="step"><h3>A IA lê e conecta</h3><p>Um modelo de linguagem extrai serviços, locais, responsáveis e dependências, separando fato, inferência, hipótese, contradição e informação superada, sempre com a citação literal.</p></div>
            <div className="step"><h3>A equipe revisa</h3><p>Cada verificação diz o que confirmar, por quê, o que ainda não se sabe e quem poderia confirmar. A equipe marca, anota e exporta a pauta para a reunião.</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="eyebrow">O que testamos</div>
          <h2>A memória institucional muda a análise?</h2>
          <p className="prose" style={{ color: 'var(--ink-2)' }}>Em {ix ? `${ix.scenarios.filter((s) => s.split === 'eval').length} ` : ''}cenários fictícios, o mesmo modelo, com as mesmas instruções, analisou cada caso duas vezes: só com as informações atuais (A) e com os registros de eventos anteriores (B). As respostas foram comparadas a gabaritos escritos antes dos testes.</p>
          {A && B ? (
            <div className="result-snapshot">
              <div className="conditions"><span className="a"><b>A</b> Informações atuais</span><span className="b"><b>B</b> Informações atuais + memória</span></div>
              <div className="kpis">
              <div className="kpi"><div className="v"><span style={{ color: 'var(--water)' }}>{pct(A.recall_verificacoes)}</span> → <span style={{ color: 'var(--memory)' }}>{pct(B.recall_verificacoes)}</span></div><div className="l">das verificações esperadas encontradas (A → B)</div></div>
              <div className="kpi"><div className="v"><span style={{ color: 'var(--water)' }}>{pct(A.recall_verificacoes_memoria)}</span> → <span style={{ color: 'var(--memory)' }}>{pct(B.recall_verificacoes_memoria)}</span></div><div className="l">das verificações que dependem do histórico</div></div>
              <div className="kpi"><div className="v">{pct(B.fidelidade_citacoes)}</div><div className="l">das citações da condição B encontradas literalmente nos documentos</div></div>
              <div className="kpi"><div className="v"><span style={{ color: 'var(--water)' }}>{A.violacoes_proibidos}</span> / <span style={{ color: 'var(--memory)' }}>{B.violacoes_proibidos}</span></div><div className="l">afirmações que não deveriam ser feitas (A / B), em {A.itens_proibidos} pontos de controle</div></div>
              </div>
            </div>
          ) : <p className="muted">Resultados ainda não disponíveis nesta versão.</p>}
          <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Avaliação automatizada por rubrica, com auditoria manual de uma amostra. Não substitui validação com servidores e especialistas municipais.</p>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="eyebrow">Cenários para explorar</div>
            <h2>Comece por um destes</h2>
            <div className="steps">
              {featured.map((s) => (
                <a key={s.id} href={`#/cenario/${s.id}`} className="step scenario-link">
                  <div className="eyebrow">{s.id} · {CATEGORIA_LABEL[s.categoria]}</div>
                  <h3>{s.municipio}</h3>
                  <p>{s.titulo}</p>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap">
          <div className="eyebrow">Limites</div>
          <h2>O que este protótipo não é</h2>
          <div className="limits">
            <div>Não é um sistema operacional de Defesa Civil.</div>
            <div>Não emite alertas nem prevê desastres.</div>
            <div>Não define níveis de risco, evacuações ou interdições.</div>
            <div>Não certifica que um município está preparado.</div>
            <div>Não trata registros históricos como vigentes.</div>
            <div>Não foi testado com servidores municipais reais.</div>
          </div>
        </div>
      </section>
      <footer className="footer"><div className="wrap">Memória Climática Municipal · protótipo experimental com dados fictícios · <a href="#/metodo">método, código e limitações</a></div></footer>
    </>
  );
}
