# Diário de experimentação e decisões

Registro cronológico do que foi feito, por quê, o que deu certo e o que não deu. Os commits citados permitem conferir a ordem dos acontecimentos.

## 1. Entendimento do desafio

- Lidos o enunciado oficial (Parte 2: escolher área, duas oportunidades de IA, escolher uma, prototipar com dados fictícios, avaliar; máximo de duas páginas) e a Parte 1 já escrita.
- Recorte: preparação municipal para inundações. Oportunidade escolhida: **verificações preventivas contextualizadas**, cruzando plano vigente, alerta e registros de eventos anteriores. A segunda oportunidade (exercícios simulados) fica como ambiente seguro de capacitação.
- Pesquisa de contexto (fontes em `docs/referencias.md`). Usada só para justificar o problema; nenhum número real entra nos dados do protótipo.

## 2. Decisões de arquitetura

| Decisão | Motivo |
|---|---|
| Uma chamada por análise, documentos inteiros no contexto, saída em JSON Schema estrito | Cenários pequenos (3 a 6 documentos, ~2 mil tokens). Recuperação de contexto, banco vetorial ou GraphRAG não se justificam. O grafo é construído *a partir* da saída, não usado para recuperar contexto. |
| Validação determinística separada da avaliação semântica | Integridade de ids e citações literais não precisa de IA para ser checada. |
| Grafo construído só com o que o modelo devolveu | Evita apresentar relações feitas à mão como se fossem descobertas da IA. Pareamento de entidades entre execuções (A, B, B+atualização) por similaridade de texto, de forma determinística. |
| Avaliador = outro modelo, cego à condição | Reduz o viés de autoavaliação e o viés a favor de B. Metadados que revelam a condição são removidos antes de enviar ao avaliador. |
| Aplicação estática + função opcional para análise ao vivo | A demonstração principal funciona sem credenciais, a partir de execuções reais armazenadas. |

## 3. Amostra sintética e gabaritos (commit `aea0272`)

- 36 cenários fictícios: 6 de desenvolvimento (DV1 a DV6) e 30 de avaliação final (E01 a E30); 137 documentos; média de 3,8 documentos por cenário na avaliação.
- Situações cobertas: dependência histórica relevante, histórico irrelevante, problema já resolvido, solução parcial, contradições (entre atual e histórico, entre documentos atuais, entre registros históricos), mudança de responsável, alteração de protocolo, informação insuficiente, evidência ambígua, distratores, memória que não acrescenta e memória que pode induzir erro ou exagero. **11 dos 30 cenários** foram desenhados para a memória não ajudar ou poder atrapalhar.
- Gabarito por cenário: verificações esperadas, dependências, interpretações temporais, informações insuficientes e afirmações proibidas. Cada item indica se depende do contexto atual ou da memória (54 verificações esperadas; 26 dependem de memória).
- Gabaritos escritos **antes** de qualquer chamada ao modelo e congelados com hash SHA-256 (`data/gold/MANIFEST.json`) no commit `aea0272`. Nenhum gabarito foi alterado depois.
- Documentos e gabaritos foram redigidos com apoio do assistente de IA usado para programar (Claude), a partir de especificações de cada situação. É uma limitação: quem escreveu os casos também escreveu as respostas esperadas.

## 4. Credenciais

- A chave do ambiente estava inválida e os arquivos de credenciais da máquina estavam vazios. A execução ficou bloqueada até a chave ser fornecida em `mcm/.env` (ignorado pelo git). Nenhuma chave é versionada.

## 5. Escolha do modelo

- Pedido: modelo barato e capaz. Analisador: **`gpt-5.4-mini-2026-03-17`** (versão fixada). Avaliador: **`gpt-5.4-2026-03-05`**, modelo diferente e mais forte.
- Teste inicial (DV1): com raciocínio `medium` o modelo gastou 11,6 mil tokens de raciocínio num caso pequeno e estourou o limite de saída em 3 tentativas (B). Decisão: `reasoning_effort = low` e teto de 32 mil tokens. Essas 4 chamadas de teste não entram em nenhuma métrica.

## 6. Desenvolvimento do prompt (somente DV1 a DV6)

**v1 → v2** (commit `b2e7392`). Problemas vistos em `runs/dev_v1`:

1. Campo `base` usado sem critério (em A, verificações marcadas como "memória" sem haver registro histórico).
2. Memória irrelevante virou verificação (DV3: incêndio de 2023 diante de alerta de chuva) e foi a única violação.
3. Problema resolvido reaberto como dúvida (DV2: gerador já trocado e testado).
4. Perguntas genéricas de disponibilidade.

Mudanças no prompt v2: definição explícita de `base`, regra para eventos de outro tipo/local, regra para problemas resolvidos, desestímulo a perguntas genéricas, preferência por citar o corpo do documento.

Mudança no validador: o modelo também vê o cabeçalho de cada documento (título, fonte, data). Citações desse cabeçalho passaram a contar como literais. Erros reais de citação continuam contando (ex.: "alag ar" no lugar de "alagar").

Resultado no desenvolvimento (A → B): precisão de B 90% → 96%; falsos alarmes de B 6,7% → 3,8%; violações 1 → 0. Prompt v2 congelado antes da avaliação final.

## 7. Avaliação final (commit `05d4c79`)

- 60 execuções da comparação principal (30 cenários × A e B), chamadas independentes, ordem cronológica dos documentos, mesmo prompt e configuração. Nenhuma falha ou truncamento.
- Repetições: 10 cenários × 2 execuções extras × 2 condições = 40 execuções.
- Demonstração da atualização: E01 em B com o memorando de rota alternativa (1 execução).
- Avaliação por rubrica de todas as 101 execuções.
- Total registrado nesta etapa: 250 chamadas reais (125 de análise, 125 de avaliação), ~881 mil tokens de entrada e ~617 mil de saída. Respostas brutas em `runs/`.

Resultados e casos: ver `docs/resultados.md`.

## 8. Conferência das decisões do avaliador

Feita durante o desenvolvimento pelo assistente de IA usado no projeto (Claude Code), lendo saída e decisão lado a lado. Não é validação humana especializada.

12 execuções, 68 decisões sobre itens do gabarito, 65 concordâncias. Discordâncias nos dois sentidos. O avaliador quase não marca verificações como "genéricas", o que infla a precisão nas duas condições. A auditoria não foi cega (eu sabia a condição) e não substitui especialistas.

## 9. Interface

- Primeira versão: colunas semânticas no grafo, pauta com revisão e exportação, leitor com citações destacadas, linha do tempo, modos A/B/atualização, camada técnica com gabarito × resultado.
- Layout de forças (d3-force) amontoou os nós; trocado por colunas com ordenação baricêntrica, determinística.
- A pedido, a camada visual foi refinada com o Codex CLI (OpenAI), com briefing restrito aos arquivos de interface e às regras de honestidade (procedência das execuções, rótulo de exemplo ilustrativo, sem dados inventados).

## 10. Renomeação do cenário E01 (depois do congelamento)

- Pedido da autora: trocar os nomes genéricos do E01 ("Ponte A", "Abrigo Municipal A/B", "Rota Alternativa 2") por nomes fictícios (Ponte dos Tropeiros, Escola Municipal Lírio do Vale, Ginásio Poliesportivo Central, Rota Alternativa da Granja).
- É uma alteração **posterior ao congelamento**, só de nomes; datas, fatos, itens do gabarito e afirmações proibidas não mudaram. Hash do gabarito E01: `9c9d835c…` → `eb65431a…`. Os outros 35 gabaritos mantêm o hash original.
- E01 foi reexecutado (A e B, 3 repetições cada, e a variante com atualização) e reavaliado: 14 chamadas novas. As execuções antigas ficam em `runs/_arquivo_E01_nomes_antigos/`.
- Impacto: recall geral A 63% → 62% e B 93% → 92%; diferença pareada inalterada (+28 p.p.). Total de chamadas reais registradas: 264.

## 11. Grafo no estilo Obsidian

- Depois da revisão visual, a autora pediu um grafo mais próximo da visualização do Obsidian: layout orgânico por forças, nós circulares por grau, vizinhança destacada ao passar o mouse, zoom e arraste. A implementação foi delegada ao Codex com a mesma regra: nós e relações vêm só das saídas do modelo.

## 12. Revisão visual, publicação e PDF

- O Codex não tinha acesso a navegador; a conferência visual foi feita depois, no navegador do app e com capturas do Chrome headless. Problemas encontrados e corrigidos: arestas empacotadas e coluna vazia (layout em colunas), enquadramento inicial animado que podia ser capturado no meio do caminho, nós sem rótulo, imports ESM da função de análise ao vivo.
- Publicação autorizada pela autora: repositório público no GitHub e app na Vercel **sem** análise ao vivo (nenhuma chave enviada à Vercel; a função responde 503 "desativada").
- PDF da submissão (4 páginas A4) gerado fora do repositório. A Parte 1 foi diagramada a partir do texto fornecido e conferida palavra por palavra (978 palavras, sem alteração).

## 13. Revisão da Parte 2 frente ao enunciado

- Revisão crítica contra o enunciado oficial: todos os itens atendidos; riscos de enquadramento corrigidos na Parte 2. Suposições do município explicitadas (inclusive a de que os registros existem), bloco "Como levaria para a equipe" com a oficina sem aplicativo, linguagem de métricas simplificada e figura legível (mapa com o caminho destacado e a mesma pergunta sem e com memória, trechos reais da execução armazenada).
- O app ganhou link direto para uma verificação (`?modo=A|B|BU&v=V2`), usado para gerar a figura.

## 14. O que não foi feito ou ficou limitado

- Nenhum teste com servidores municipais. O indicador TCPM não foi medido; há protocolo proposto.
- Um único modelo de análise. Sem comparação entre provedores.
- Cenários curtos e limpos; documentos reais são mais longos e bagunçados.
- Análise ao vivo depende de chave configurada no servidor; sem ela, a interface mostra que está desativada e mantém as execuções armazenadas.
