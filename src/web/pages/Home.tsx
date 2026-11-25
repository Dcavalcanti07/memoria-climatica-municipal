import { useEffect, useRef, useState } from 'react';
import { CATEGORIA_LABEL, loadIndex, pct, type IndexView } from '../lib/data';

/** Ilustração: documentos soltos que se reorganizam em conhecimento conectado. Exemplo ilustrativo. */
/** Exemplo ilustrativo em vídeo (feito com HyperFrames). Respeita quem prefere menos movimento. */
function HeroFilm() {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduce] = useState(() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } });
  const [playing, setPlaying] = useState(!reduce);
  function toggle() {
    const v = ref.current; if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }
  return (
    <figure className="hero-map hero-film">
      <figcaption><span>exemplo ilustrativo</span><button type="button" onClick={toggle}>{playing ? 'Pausar' : 'Reproduzir'}</button></figcaption>
      <video ref={ref} autoPlay={!reduce} muted loop playsInline preload="metadata" poster="/video/memoria-hero-poster.jpg"
        aria-label="Animação ilustrativa: quatro documentos fictícios viram um mapa de relações. O relatório de 2024 mostra que a Ponte dos Tropeiros era o único acesso ao abrigo da Escola Lírio do Vale, e o sistema sugere a pergunta: a ponte continua sendo o único acesso? Existe rota alternativa?">
        <source src="/video/memoria-hero.webm" type="video/webm" />
        <source src="/video/memoria-hero.mp4" type="video/mp4" />
      </video>
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
            <p className="lead">Relatórios de ocorrência, atas e planos ficam espalhados entre secretarias e se perdem com a troca de equipes. Este protótipo usa IA para ler esses documentos, conectar o que está disperso e montar uma pauta de verificações preventivas, com as fontes à vista, para a equipe revisar.</p>
            <div className="hero-actions">
              <a className="btn" href="#/cenario/E01">Explorar Vila das Águas →</a>
              <a className="btn ghost" href="#/experimento">Ver o experimento</a>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>Municípios, documentos e alertas são fictícios. A IA não emite alertas, não prevê desastres e não decide nada: ela sugere perguntas para revisão humana.</p>
          </div>
          <HeroFilm />
        </div>
      </section>

      <section className="map-reading">
        <div className="wrap reading-inner">
          <h2>Como ler o mapa</h2>
          <div><svg className="reading-families" viewBox="0 0 29 10" aria-hidden="true">
            <circle cx="4" cy="5" r="4" fill="var(--graph-event)" /><circle cx="14" cy="5" r="4" fill="var(--graph-infra)" /><circle cx="24" cy="5" r="4" fill="var(--graph-place)" />
          </svg>Cores dos pontos <span>Famílias de entidades</span></div>
          <div><span className="key-swatch memory" aria-hidden="true" />Ocre <span>O que apareceu com a memória</span></div>
          <div><span className="reading-mark" aria-hidden="true">? ≠</span>Marcas <span>Hipóteses e contradições</span></div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="eyebrow">Como funciona</div>
          <h2>De documentos soltos a uma pauta que a equipe pode revisar</h2>
          <div className="steps">
            <div className="step"><h3>Reunir o que existe</h3><p>Plano de contingência vigente, o cenário de alerta, ofícios recentes e, quando houver, relatórios e atas de eventos anteriores.</p></div>
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
          <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Avaliação automatizada por rubrica, com conferência item a item de uma amostra. Não substitui validação com servidores e especialistas municipais.</p>
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
