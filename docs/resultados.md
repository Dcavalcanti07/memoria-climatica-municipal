# Relatório de resultados — experimento A × B

**Pergunta:** uma IA que recebe o contexto atual e a memória de eventos anteriores identifica dependências e verificações relevantes que passariam despercebidas só com as informações atuais? E quais riscos a memória traz?

**Nota:** o cenário E01 foi renomeado depois do congelamento ("Ponte A" → "Ponte dos Tropeiros", "Abrigo A" → "Escola Municipal Lírio do Vale"), sem mudança de conteúdo, e reexecutado; as execuções antigas estão em `runs/_arquivo_E01_nomes_antigos/`. Com os nomes antigos, o recall geral era 63% (A) e 93% (B).

**Desenho:** 30 cenários fictícios de avaliação. Mesmo modelo (`gpt-5.4-mini-2026-03-17`, raciocínio `low`), mesmo prompt (`prompts/analise_v2.md`), mesmo formato de saída, chamadas independentes. Única variável: em B o modelo também recebe relatórios e atas de eventos anteriores. Gabaritos congelados antes das execuções (commit `aea0272`). Avaliação semântica por rubrica (`gpt-5.4-2026-03-05`, cego à condição) + validações determinísticas.

Dados completos: `results/eval_v1/summary.json`, `per_run.csv`, `per_item.csv`. Respostas brutas: `runs/eval_v1/`.

## Resultados principais (repetição 1, 30 cenários por condição)

| Métrica | A · só atual | B · + memória |
|---|---:|---:|
| Verificações esperadas encontradas (recall; atendido = 1, parcial = 0,5) | 62% | 92% |
| … itens que dependem só do contexto atual | 91% | 89% |
| … itens que dependem da memória | 31%* | 94% |
| Dependências esperadas identificadas | 60% | 94% |
| Interpretações temporais corretas | 38%* | 83% |
| Informações insuficientes reconhecidas | 53% | 80% |
| Precisão (pertinentes ÷ produzidas) | 95% | 96% |
| Falsos alarmes (irrelevantes, sem respaldo ou superadas) | 2,1% (3) | 0% |
| Verificações redundantes | 2 | 5 |
| Verificações por cenário | 4,7 | 5,2 |
| Afirmações proibidas produzidas (40 pontos de controle) | 0 | 1 |
| Interpretações temporais invertidas | 1 | 1 |
| Afirmações sem respaldo apontadas pelo avaliador | 20 | 33 |
| Citações encontradas literalmente | 98,2% de 622 | 99,2% de 787 |
| Citações de documento inexistente | 0 | 0 |
| Relações apontando para entidade inexistente | 0 | 12 (todas em E10) |
| Latência mediana | 22 s | 25 s |
| Tokens de entrada / saída (média) | 2.087 / 3.629 | 2.215 / 4.349 |

\* Em A, itens que dependem do histórico são uma limitação legítima de acesso, não omissão. Os 31% vêm de perguntas que chegaram perto do problema por outro caminho (ex.: "a restrição em pontes afeta o acesso aos abrigos?").

**Diferença pareada B − A (bootstrap por cenário, 10 mil reamostras):**

- Recall geral: **+28 p.p.** [IC 95%: +18; +36]. B melhor em 21 cenários, empate em 8, A melhor em 1.
- Itens de memória: +64 p.p. [+53; +76].
- Itens atuais: −2 p.p. [−8; +4] — sem ganho; leve tendência de perda.
- Precisão: +2 p.p. [−4; +7] — sem diferença.
- Verificações por cenário: +0,6 [+0,2; +0,9].

## Estabilidade

10 cenários executados 3 vezes em cada condição. Recall por repetição: A 47% · 53% · 50%; B 84% · 84% · 87%. Itens do gabarito com o mesmo resultado nas três repetições: 84% em A e 79% em B. A diferença entre condições se manteve em todas as repetições; a variação item a item não é desprezível.

## Por tipo de situação

A memória ajudou de forma consistente quando havia **dependência histórica**, **solução parcial**, **evidência ambígua** e **contradição entre histórico e plano**. Não ajudou quando o histórico era **irrelevante**, quando havia **distratores**, quando a **contradição estava nos documentos atuais** ou entre **dois registros históricos**. Nos cenários em que **a memória não acrescentava** (plano já atualizado), B foi pior que A (75% × 100%).

Nos cenários desenhados para a memória **induzir erro** (abrigo retirado do plano, almoxarifado mudado, cheia histórica muito maior), B não reproduziu a informação superada e não propôs evacuação.

## Casos para olhar de perto

- **E01 (sucesso).** Sem memória: pergunta genérica sobre pontes de pequeno porte. Com memória: "o abrigo da Escola Lírio do Vale tem acesso alternativo definido e utilizável?" e "a estrada da Granja recebeu cascalhamento desde 2024?", tratando a estrada como proposta não executada.
- **E01 com atualização.** Com o memorando de 2026, o modelo perguntou se a Ponte dos Tropeiros continua sendo o único acesso cadastrado e se a rota da Granja pode ser usada em chuva intensa (o trecho do km 1,2 nunca foi avaliado), sem presumir que esteja disponível. Mas classificou o caso como "problema resolvido" nos achados temporais, o que é mais forte do que os documentos sustentam.
- **E03 (falha).** Com memória, o resumo afirmou "há contrato vigente de caminhão-pipa até 31/10/2026", com data de referência 18/11/2026. Sem memória, o vencimento foi reconhecido. Única afirmação proibida da avaliação final.
- **E10 (falha de integridade).** 12 relações usaram códigos de documento como entidades. A validação determinística descartou essas relações do grafo.
- **E29 (limite).** Dois registros históricos se contradizem; B perguntou sobre a estrada, mas não nomeou a contradição.
- **E18 e E30 (limite).** B perdeu parte de verificações atuais que A acertou: mais documentos, menos foco.
- **E27 (sucesso).** A cheia de 12,1 m não virou exagero; B usou só o dado pertinente (casas atingidas a partir de 6,2 m).

## Validade e limitações

- **Avaliação automatizada.** Auditoria manual de 12 execuções: 65 de 68 decisões confirmadas, discordâncias nos dois sentidos. O avaliador raramente marca verificações como genéricas; na amostra, cerca de metade das verificações de A eram perguntas genéricas de disponibilidade, contra menos de um terço em B. A precisão de 95% é teto.
- **Construção da amostra.** Casos e gabaritos escritos pela mesma equipe, com apoio de IA. O gabarito tende a valorizar o que o autor considerou relevante; documentos reais são mais longos, ambíguos e mal organizados.
- **Tamanho.** 30 cenários; intervalos de confiança largos nas métricas por categoria (1 a 7 cenários por categoria).
- **Um modelo.** Resultados podem mudar com outros modelos, versões ou níveis de raciocínio.
- **Produtividade.** Latência não mede economia de tempo da equipe. O TCPM não foi medido.
- **Nada aqui foi validado por servidores ou especialistas em Defesa Civil.**

## O que decidiria se vale avançar

1. Repetir com documentos reais anonimizados de 2 ou 3 municípios, com gabarito feito pela própria equipe municipal antes de ver a IA.
2. Medir o TCPM com servidores: pauta feita do jeito habitual × com apoio da IA, contando o tempo de conferir as fontes.
3. Regra de parada: qualquer afirmação proibida em temas críticos (vigência de contrato, disponibilidade de abrigo, rotas) exige revisão obrigatória antes de qualquer uso.
