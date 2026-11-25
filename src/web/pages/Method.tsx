import { useEffect, useState } from 'react';
import { loadMethod } from '../lib/data';

const FLOW = [
  { n: '1', t: 'Reunir os documentos', leigo: 'Plano de contingência, alerta, ofícios e, quando houver, relatórios e atas de eventos anteriores.', tec: '3 a 6 documentos fictícios por caso, com código (D1, D2…), enviados em ordem de data.', tone: 'water' },
  { n: '2', t: 'A IA lê e organiza', leigo: 'Um modelo de linguagem lê tudo de uma vez e devolve uma ficha organizada: o que existe, como se liga e o que conferir.', tec: 'gpt-6-luna, uma chamada por análise, resposta em JSON Schema estrito: entidades, relações, mudanças no tempo e verificações.', tone: 'ink' },
  { n: '3', t: 'O sistema confere a IA', leigo: 'Antes de mostrar, o sistema checa se cada trecho citado existe mesmo no documento indicado.', tec: 'Validação determinística: citação literal, código de documento válido, relação ligada a entidade existente.', tone: 'ink' },
  { n: '4', t: 'Mapa e pauta', leigo: 'As ligações viram um mapa navegável e as perguntas viram uma pauta para a reunião.', tec: 'O grafo é montado só com a resposta do modelo. Não há GraphRAG, banco vetorial ou embeddings.', tone: 'memory' },
  { n: '5', t: 'A equipe decide', leigo: 'A equipe marca o que confirmou, anota e exporta. A IA sugere; quem decide é a prefeitura.', tec: 'Revisão por pergunta (revisada, precisa confirmar, não se aplica) e exportação em Markdown.', tone: 'moss' },
];
const EVAL = [
  { t: 'Respostas esperadas', d: 'Escritas e congeladas antes dos testes (hash SHA-256 no git).' },
  { t: 'Duas versões', d: 'Mesmo caso analisado só com o atual (A) e com a memória (B).' },
  { t: 'Correção às cegas', d: 'Outro modelo (gpt-6.1-terra) compara com o esperado sem saber se é A ou B.' },
  { t: 'Segundo corretor', d: 'Numa rodada anterior, dois corretores diferentes concordaram em 92% das decisões. Não substitui especialistas.' },
];

function Arch() {
  return (
    <div className="arch">
      <ol className="arch-flow" aria-label="Como uma análise acontece, em cinco etapas">
        {FLOW.map((f) => (
          <li key={f.n} className={`arch-step tone-${f.tone}`}>
            <span className="arch-n" aria-hidden="true">{f.n}</span>
            <h3>{f.t}</h3>
            <p className="arch-plain">{f.leigo}</p>
            <p className="arch-tech"><span>Por dentro</span>{f.tec}</p>
          </li>
        ))}
      </ol>
      <div className="arch-eval">
        <div className="arch-eval-h"><b>Como o experimento foi avaliado</b><span>fora do uso do dia a dia</span></div>
        <ol>{EVAL.map((e) => <li key={e.t}><b>{e.t}</b><span>{e.d}</span></li>)}</ol>
      </div>
    </div>
  );
}

export function Method() {
  const [m, setM] = useState<any>(null);
  useEffect(() => { loadMethod().then(setM).catch(() => setM(null)); }, []);
  return (
    <div className="wrap editorial-page method-page">
      <header className="editorial-head prose">
        <div className="eyebrow">Método</div>
        <h1 className="editorial-title">Como o protótipo funciona e como foi avaliado</h1>
        <p style={{ fontSize: 16.5 }}>Esta página reúne a camada técnica: arquitetura, modelo, instruções, formato de saída, desenho experimental, métricas, limitações e uma versão simplificada da metodologia que qualquer equipe pode repetir sem programar.</p>
      </header>

      <nav className="method-index" aria-label="Nesta página">
        {['Arquitetura', 'Métricas', 'Oficina', 'Limitações'].map((label) => <button type="button" key={label} onClick={() => {
          const heading = document.getElementById(label);
          heading?.scrollIntoView({ block: 'start' });
          heading?.focus({ preventScroll: true });
        }}>{label}</button>)}
      </nav>

      <h2 id="Arquitetura" tabIndex={-1}>Arquitetura</h2>
      <Arch />

      <div className="prose">
        <h2>Modelo e configuração</h2>
        {m ? <pre className="code">{JSON.stringify(m.config, null, 2)}</pre> : <p className="muted">Carregando…</p>}
        <p>A mesma configuração foi usada nas duas condições. Cada análise é uma chamada independente, sem histórico de conversa. Os documentos são enviados em ordem cronológica, com o mesmo cabeçalho; nada é truncado (o maior contexto do experimento ficou bem abaixo do limite do modelo).</p>

        <h2>Instruções ao modelo</h2>
        <p>Resumo: ler os documentos, extrair entidades e relações com citação literal, distinguir fato, inferência, hipótese, contradição, informação superada e insuficiente, interpretar datas e vigências, e gerar até 8 verificações para revisão humana, sem emitir alertas, prever desastres ou recomendar evacuação.</p>
        {m && <details><summary>Ver o texto completo ({m.prompt_file})</summary><pre className="code">{m.prompt}</pre></details>}
        {m && <details><summary>Ver o formato de saída (JSON Schema)</summary><pre className="code">{JSON.stringify(m.schema, null, 2)}</pre></details>}

        <h2>Desenho experimental</h2>
        <ul>
          <li><b>Hipótese:</b> com o contexto atual e a memória de eventos anteriores, a IA identifica dependências e verificações relevantes que passariam despercebidas só com as informações atuais.</li>
          <li><b>Condição A:</b> plano vigente, cenário de alerta e informações atuais.</li>
          <li><b>Condição B:</b> os mesmos documentos + registros históricos.</li>
          <li><b>Amostra:</b> 36 cenários fictícios (6 de desenvolvimento, usados para ajustar instruções; 30 de avaliação final), 3 a 6 documentos cada. Inclui casos em que a memória ajuda, é irrelevante, já foi superada, traz contradições ou pode induzir exagero.</li>
          <li><b>Gabaritos:</b> escritos antes das execuções finais e congelados com hash SHA-256 em commit no repositório. Cada item indica se depende do contexto atual ou da memória, o que separa omissão de limitação legítima de acesso.</li>
          <li><b>Duas rodadas:</b> a principal usa gpt-6-luna para analisar e gpt-6.1-terra para corrigir. Uma rodada anterior, com gpt-5.4-mini e gpt-5.4 e com repetições para observar estabilidade, fica registrada como comparação.</li>
        </ul>

        <h2 id="Métricas" tabIndex={-1}>Métricas</h2>
        <div className="table-scroll" role="region" aria-label="Definições das métricas" tabIndex={0}><table className="t method-table">
          <thead><tr><th>Métrica</th><th>Cálculo</th><th>Tipo</th></tr></thead>
          <tbody>
            <tr><td>Recall de verificações</td><td>soma (atendido = 1, parcial = 0,5) ÷ itens do gabarito; separado em itens “atuais” e “de memória”</td><td>rubrica</td></tr>
            <tr><td>Recall de dependências</td><td>idem, para as cadeias de dependência do gabarito</td><td>rubrica</td></tr>
            <tr><td>Precisão</td><td>verificações que correspondem ao gabarito ou são pertinentes e sustentadas ÷ total produzido</td><td>rubrica</td></tr>
            <tr><td>Falsos alarmes</td><td>verificações irrelevantes, sem respaldo ou baseadas em informação superada</td><td>rubrica</td></tr>
            <tr><td>F1</td><td>média harmônica de precisão e recall, por execução</td><td>derivada</td></tr>
            <tr><td>Interpretação temporal</td><td>correto = 1, parcial = 0,5; “incorreto” (inverter o sentido) contado à parte</td><td>rubrica</td></tr>
            <tr><td>Afirmações proibidas</td><td>itens “não deveria afirmar” do gabarito violados</td><td>rubrica</td></tr>
            <tr><td>Fidelidade das citações</td><td>trecho citado aparece literalmente no documento indicado (normalização só de espaços, aspas e caixa)</td><td>determinística</td></tr>
            <tr><td>Integridade</td><td>documentos citados existem no conjunto enviado; relações apontam para entidades existentes</td><td>determinística</td></tr>
            <tr><td>Latência e tokens</td><td>medidos em cada chamada</td><td>determinística</td></tr>
          </tbody>
        </table></div>
        <p>A avaliação semântica foi feita por um segundo modelo com rubrica explícita, sem saber a condição. Uma amostra de decisões foi conferida item a item com o assistente de IA usado no projeto. Isso não equivale à validação por servidores ou especialistas em Defesa Civil.</p>

        <h2>Indicador de produtividade: TCPM</h2>
        <p><b>Tempo de Consolidação da Prontidão Municipal</b>: tempo para transformar os documentos disponíveis em uma pauta preventiva revisada. A meta exploratória é reduzir esse tempo em pelo menos 30% sem perder qualidade. É uma hipótese: não foi medida com pessoas neste protótipo, e a latência da IA não serve como evidência de economia de tempo.</p>
        <p>Como validar: duas pessoas da equipe, conjuntos de documentos fictícios equivalentes e sorteados; cada uma prepara uma pauta do jeito habitual e outra com apoio da IA (ordem alternada). Medir tempo total (inclui ler, conferir as fontes e corrigir a IA), itens relevantes encontrados, erros que passaram e confiança declarada. Só avançar se o tempo cair sem aumentar erros graves.</p>

        <h2 id="Oficina" tabIndex={-1}>Versão sem programação, para as equipes</h2>
        <ol>
          <li>Escolham um alerta fictício e reúnam 3 a 5 documentos: o plano vigente e 1 ou 2 registros de eventos anteriores (relatório, ata).</li>
          <li>Antes de usar IA, a equipe lista em 10 minutos o que verificaria. Essa lista é o “gabarito” da oficina.</li>
          <li>Numa ferramenta de IA autorizada pela prefeitura, colem os documentos com identificadores (D1, D2…) e peçam: “Liste até 8 perguntas para confirmar antes do evento. Para cada uma: por que importa, trecho literal que a sustenta (com o código do documento), o que ainda não se sabe e quem poderia confirmar. Separe fato, inferência e hipótese. Não recomende evacuação nem defina risco.”</li>
          <li>Repitam só com o plano e o alerta, sem os registros antigos, e comparem as duas listas.</li>
          <li>Confiram cada citação no documento original. Marquem: útil, já sabíamos, errada, sem fonte.</li>
          <li>Conversem: o que a memória trouxe? Onde ela confundiu? O que falta registrar melhor nos próximos eventos?</li>
        </ol>
        <p>O aplicativo é uma demonstração mais avançada; a oficina funciona sem ele.</p>

        <h2 id="Limitações" tabIndex={-1}>Limitações</h2>
        <ul>
          <li>Documentos e gabaritos foram escritos pela mesma equipe do protótipo; o recorte pode favorecer casos “legíveis” e não reflete a bagunça de arquivos reais (PDFs escaneados, planilhas, mensagens).</li>
          <li>Cenários curtos (3 a 6 documentos). Com dezenas de documentos, seria preciso estratégia de seleção ou recuperação de contexto.</li>
          <li>Avaliação semântica automatizada, com conferência item a item de uma amostra; sem participação de especialistas municipais.</li>
          <li>Um único modelo testado; resultados podem mudar com outros modelos ou versões.</li>
          <li>O grafo depende da saída de cada execução; nomes de entidades variam entre execuções. O mapa aproxima nomes da mesma coluna por similaridade textual, e compara relações pela direção e pelo tipo.</li>
        </ul>

        <h2>Antes de um piloto real, precisaríamos conhecer</h2>
        <ul>
          <li>Como a equipe hoje prepara a resposta a um alerta, quanto tempo leva e onde trava.</li>
          <li>Quais documentos existem de fato, em que formato e quem os guarda.</li>
          <li>Quais protocolos estão vigentes e quem responde por cada verificação.</li>
          <li>Que ferramentas de IA a prefeitura autoriza e quais regras de proteção de dados se aplicam.</li>
          <li>A maturidade digital da equipe e quem teria tempo para revisar as sugestões.</li>
          <li>Como registrar a decisão humana sobre cada verificação, para a memória melhorar a cada evento.</li>
        </ul>

        <h2>Referências de contexto</h2>
        <ul>
          <li>Lei nº 12.608/2012 (Política Nacional de Proteção e Defesa Civil) e Lei nº 14.750/2023, que atualizou a definição de plano de contingência. <a href="https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14750.htm">planalto.gov.br</a></li>
          <li>Cemaden/USP/Inpe, “Water-related disasters in Brazil: an assessment from 1991 to 2024”: 91,5% dos municípios registraram ao menos um desastre no período. <a href="https://agencia.fapesp.br/58646">Agência FAPESP</a></li>
          <li>Ipea: nota técnica sobre as inundações de 2024 no RS: 418 municípios em calamidade ou emergência (Portaria 1.802/2024). <a href="https://repositorio.ipea.gov.br/bitstream/11058/14337/1/NT_CGDTI_02_Publicacao_Expressa.pdf">repositorio.ipea.gov.br</a></li>
          <li>Cemaden: nota técnica sobre o El Niño 2026-2027. o fenômeno não causa desastres sozinho, mas aumenta a probabilidade de eventos extremos no Sul. <a href="https://www.gov.br/cemaden/pt-br/cemaden-lidera-elaboracao-de-nota-tecnica-sobre-possiveis-impactos-do-el-nino-2026-27-no-rs">gov.br/cemaden</a></li>
          <li>INMET: como foi a atuação do El Niño 2023-2024 no Brasil. <a href="https://portal.inmet.gov.br/noticias/el-nino-saiba-como-foi-a-atuacao-do-fenomeno-no-brasil">portal.inmet.gov.br</a></li>
        </ul>

        <h2>Uso de IA na construção</h2>
        <p>{m?.uso_ia ?? 'O protótipo, os documentos fictícios, os gabaritos e a documentação foram produzidos com apoio de um assistente de IA para programação, com revisão e decisões registradas no diário de experimentação.'}</p>
      </div>
    </div>
  );
}
