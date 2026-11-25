const str = { type: 'string' } as const;
const ids = { type: 'array', items: str } as const;
const item = (enumVals: readonly string[]) => ({
  type: 'array',
  items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'resultado', 'ids_saida', 'justificativa'],
    properties: { id: str, resultado: { type: 'string', enum: enumVals }, ids_saida: ids, justificativa: str },
  },
});

export const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['gold_checks', 'gold_dependencias', 'gold_temporal', 'gold_insuficiente', 'proibidos', 'verificacoes_produzidas', 'afirmacoes_sem_respaldo'],
  properties: {
    gold_checks: item(['atendido', 'parcial', 'ausente']),
    gold_dependencias: item(['atendido', 'parcial', 'ausente']),
    gold_temporal: item(['correto', 'parcial', 'ausente', 'incorreto']),
    gold_insuficiente: item(['reconhecido', 'nao_reconhecido']),
    proibidos: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'violado', 'onde', 'justificativa'],
        properties: { id: str, violado: { type: 'boolean' }, onde: str, justificativa: str },
      },
    },
    verificacoes_produzidas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'classificacao', 'justificativa'],
        properties: {
          id: str,
          classificacao: { type: 'string', enum: ['corresponde_gabarito', 'pertinente_nao_prevista', 'redundante', 'generica', 'irrelevante', 'sem_respaldo', 'baseada_em_info_superada'] },
          justificativa: str,
        },
      },
    },
    afirmacoes_sem_respaldo: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['onde', 'afirmacao'], properties: { onde: str, afirmacao: str } },
    },
  },
} as const;
