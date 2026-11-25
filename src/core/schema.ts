/**
 * Schema de saída estruturada da análise (compatível com JSON Schema "strict" da OpenAI:
 * todas as propriedades obrigatórias, additionalProperties=false, nulos explícitos).
 */
export const STATUS = ['fato_documentado', 'inferencia', 'hipotese', 'contradicao', 'superado', 'informacao_insuficiente'] as const;
export const TIPOS_ENTIDADE = ['servico', 'infraestrutura', 'equipamento', 'local', 'setor', 'evento', 'recurso', 'grupo_populacional', 'norma_documento', 'funcao_responsavel'] as const;
export const TIPOS_RELACAO = ['depende_de', 'acesso_por', 'atende', 'responsavel_por', 'afetado_por', 'abastece', 'localizado_em', 'substitui', 'contradiz', 'comunica', 'armazena', 'outro'] as const;
export const TIPOS_TEMPORAIS = ['atualizacao', 'mudanca_responsavel', 'alteracao_protocolo', 'problema_resolvido', 'pendencia_historica', 'contradicao', 'historico_superado', 'vigencia_encerrada', 'solucao_parcial'] as const;

const str = { type: 'string' } as const;
const nstr = { type: ['string', 'null'] } as const;
const evidencia = {
  type: 'object', additionalProperties: false, required: ['doc_id', 'trecho'],
  properties: { doc_id: str, trecho: str },
} as const;
const evidencias = { type: 'array', items: evidencia } as const;

export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo_situacao', 'entidades', 'relacoes', 'achados_temporais', 'verificacoes', 'informacoes_ausentes', 'cautelas'],
  properties: {
    resumo_situacao: { type: 'string', description: 'Até 3 frases, linguagem simples.' },
    entidades: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'nome', 'tipo', 'setor_responsavel', 'descricao'],
        properties: {
          id: str, nome: str,
          tipo: { type: 'string', enum: TIPOS_ENTIDADE },
          setor_responsavel: nstr,
          descricao: str,
        },
      },
    },
    relacoes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'origem', 'destino', 'tipo', 'rotulo', 'status_epistemico', 'periodo', 'evidencias'],
        properties: {
          id: str, origem: str, destino: str,
          tipo: { type: 'string', enum: TIPOS_RELACAO },
          rotulo: { type: 'string', description: 'Frase curta que descreve a relação.' },
          status_epistemico: { type: 'string', enum: STATUS },
          periodo: {
            type: 'object', additionalProperties: false, required: ['inicio', 'fim', 'observacao'],
            properties: { inicio: nstr, fim: nstr, observacao: nstr },
          },
          evidencias,
        },
      },
    },
    achados_temporais: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'tipo', 'descricao', 'implicacao', 'evidencias'],
        properties: {
          id: str,
          tipo: { type: 'string', enum: TIPOS_TEMPORAIS },
          descricao: str,
          implicacao: str,
          evidencias,
        },
      },
    },
    verificacoes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'pergunta', 'por_que_importa', 'motivacao', 'base', 'entidades_relacionadas', 'setores_relacionados', 'status_epistemico', 'evidencias', 'o_que_falta_saber', 'quem_pode_confirmar', 'prioridade'],
        properties: {
          id: str,
          pergunta: { type: 'string', description: 'O que precisa ser confirmado, em forma de pergunta.' },
          por_que_importa: str,
          motivacao: { type: 'string', description: 'Acontecimentos ou informações que motivaram a verificação.' },
          base: { type: 'string', enum: ['informacao_atual', 'registro_historico', 'ambos'] },
          entidades_relacionadas: { type: 'array', items: str },
          setores_relacionados: { type: 'array', items: str },
          status_epistemico: { type: 'string', enum: STATUS },
          evidencias,
          o_que_falta_saber: str,
          quem_pode_confirmar: str,
          prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        },
      },
    },
    informacoes_ausentes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['descricao', 'por_que_importa'],
        properties: { descricao: str, por_que_importa: str },
      },
    },
    cautelas: { type: 'array', items: str },
  },
} as const;

export type Evidencia = { doc_id: string; trecho: string };
export type Entidade = { id: string; nome: string; tipo: string; setor_responsavel: string | null; descricao: string };
export type Relacao = { id: string; origem: string; destino: string; tipo: string; rotulo: string; status_epistemico: string; periodo: { inicio: string | null; fim: string | null; observacao: string | null }; evidencias: Evidencia[] };
export type AchadoTemporal = { id: string; tipo: string; descricao: string; implicacao: string; evidencias: Evidencia[] };
export type Verificacao = { id: string; pergunta: string; por_que_importa: string; motivacao: string; base: string; entidades_relacionadas: string[]; setores_relacionados: string[]; status_epistemico: string; evidencias: Evidencia[]; o_que_falta_saber: string; quem_pode_confirmar: string; prioridade: string };
export type Analise = { resumo_situacao: string; entidades: Entidade[]; relacoes: Relacao[]; achados_temporais: AchadoTemporal[]; verificacoes: Verificacao[]; informacoes_ausentes: { descricao: string; por_que_importa: string }[]; cautelas: string[] };

export type Doc = { id: string; conjunto: 'atual' | 'memoria'; tipo: string; titulo: string; fonte: string; data: string; texto: string };
export type Scenario = { id: string; split: string; municipio: string; categoria: string; titulo: string; alerta_data: string; docs: Doc[]; atualizacao?: Doc[] };
