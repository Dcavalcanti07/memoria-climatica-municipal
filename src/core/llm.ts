/**
 * Cliente mínimo para chamadas com saída estruturada.
 * Provedores: OpenAI (Responses API + json_schema strict) ou Anthropic (tool use forçado).
 * Sempre retorna o bruto da resposta para registro/auditoria.
 */
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type LLMConfig = {
  provider: 'openai' | 'anthropic';
  model: string;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high' | null;
  temperature?: number | null;
  max_output_tokens: number;
};

export type LLMResult = {
  parsed: any;
  raw: any;
  response_id: string | null;
  model_reported: string | null;
  usage: { input_tokens: number | null; output_tokens: number | null; reasoning_tokens: number | null };
  latency_ms: number;
  started_at: string;
};

export async function callStructured(
  cfg: LLMConfig,
  system: string,
  user: string,
  schemaName: string,
  schema: object,
): Promise<LLMResult> {
  const started_at = new Date().toISOString();
  const t0 = performance.now();
  if (cfg.provider === 'openai') {
    const client = new OpenAI({ timeout: 300_000, maxRetries: 2 });
    const body: any = {
      model: cfg.model,
      input: [
        { role: 'developer', content: system },
        { role: 'user', content: user },
      ],
      text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
      max_output_tokens: cfg.max_output_tokens,
      store: false,
    };
    if (cfg.reasoning_effort) body.reasoning = { effort: cfg.reasoning_effort };
    if (cfg.temperature != null) body.temperature = cfg.temperature;
    const r: any = await client.responses.create(body);
    const latency_ms = Math.round(performance.now() - t0);
    if (r.status && r.status !== 'completed') throw Object.assign(new Error(`resposta incompleta: ${r.status} ${JSON.stringify(r.incomplete_details)}`), { raw: r });
    const text = r.output_text ?? '';
    return {
      parsed: JSON.parse(text),
      raw: r,
      response_id: r.id ?? null,
      model_reported: r.model ?? null,
      usage: {
        input_tokens: r.usage?.input_tokens ?? null,
        output_tokens: r.usage?.output_tokens ?? null,
        reasoning_tokens: r.usage?.output_tokens_details?.reasoning_tokens ?? null,
      },
      latency_ms,
      started_at,
    };
  }
  const client = new Anthropic({ timeout: 300_000, maxRetries: 2 });
  const body: any = {
    model: cfg.model,
    max_tokens: cfg.max_output_tokens,
    system,
    messages: [{ role: 'user', content: user }],
    tools: [{ name: schemaName, description: 'Registra a saída estruturada.', input_schema: schema }],
    tool_choice: { type: 'tool', name: schemaName },
  };
  if (cfg.temperature != null) body.temperature = cfg.temperature;
  const r: any = await client.messages.create(body);
  const latency_ms = Math.round(performance.now() - t0);
  const tool = r.content.find((c: any) => c.type === 'tool_use');
  if (!tool) throw Object.assign(new Error('sem tool_use na resposta'), { raw: r });
  if (r.stop_reason === 'max_tokens') throw Object.assign(new Error('resposta truncada (max_tokens)'), { raw: r });
  return {
    parsed: tool.input,
    raw: r,
    response_id: r.id ?? null,
    model_reported: r.model ?? null,
    usage: { input_tokens: r.usage?.input_tokens ?? null, output_tokens: r.usage?.output_tokens ?? null, reasoning_tokens: null },
    latency_ms,
    started_at,
  };
}
