/**
 * Análise ao vivo (Vercel Function). Executa uma chamada real ao modelo com os documentos de um cenário
 * (condição B) e, opcionalmente, um documento fictício adicional escrito pelo visitante.
 * Proteções: chave só no servidor, validação de entrada, limite por IP e limite diário por instância.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ANALYSIS_SCHEMA, type Doc, type Scenario } from '../src/core/schema.js';
import { buildUserMessage, selectDocs } from '../src/core/prompt.js';
import { callStructured } from '../src/core/llm.js';
import { assertShape, validateAnalysis } from '../src/core/validate.js';

const root = process.cwd();
const hits = new Map<string, number[]>();
let dayCount = 0, day = new Date().toISOString().slice(0, 10);
const PER_IP_HOUR = Number(process.env.MCM_LIVE_PER_IP_HOUR ?? 4);
const DAILY_CAP = Number(process.env.MCM_LIVE_DAILY_CAP ?? 60);

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max).trim();

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (process.env.MCM_LIVE_ENABLED !== '1' || !(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY)) {
    return res.status(503).json({ error: 'Análise ao vivo desativada nesta publicação' });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY_CAP) return res.status(429).json({ error: 'Limite diário de análises ao vivo atingido' });
  const ip = String(req.headers['x-forwarded-for'] ?? 'anon').split(',')[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= PER_IP_HOUR) return res.status(429).json({ error: 'Limite de análises por visitante atingido; tente mais tarde' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  const sid = clean(body.scenario, 8);
  if (!/^(E\d{2}|DV\d)$/.test(sid)) return res.status(400).json({ error: 'Cenário inválido' });
  const file = path.join(root, 'data/scenarios', `${sid}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Cenário não encontrado' });
  const s = JSON.parse(fs.readFileSync(file, 'utf8')) as Scenario;

  const extra: Doc[] = [];
  if (body.extra_doc) {
    const texto = clean(body.extra_doc.texto, 1500);
    if (texto.length < 20) return res.status(400).json({ error: 'Documento muito curto' });
    extra.push({ id: 'N1', conjunto: 'atual', tipo: 'atualizacao_secretaria', titulo: clean(body.extra_doc.titulo, 120) || 'Atualização informada pelo visitante (fictícia)', fonte: 'Visitante da demonstração', data: s.alerta_data, texto });
  }
  // documentos de atualização do cenário entram junto, se existirem
  const docs = selectDocs(s, 'B', [...(s.atualizacao ?? []), ...extra]);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config/experiment.json'), 'utf8'));
  const system = fs.readFileSync(path.join(root, 'prompts', cfg.prompt_file), 'utf8');

  hits.set(ip, [...list, now]); dayCount++;
  try {
    const r = await callStructured(cfg.analysis, system, buildUserMessage(s, docs), 'analise_mcm', ANALYSIS_SCHEMA);
    assertShape(r.parsed);
    return res.status(200).json({
      key: 'LIVE', provenance: 'live', response_id: r.response_id, model: r.model_reported, started_at: r.started_at,
      latency_ms: r.latency_ms, usage: r.usage, docs_fornecidos: docs.map((d) => d.id), extra_docs: extra,
      output: r.parsed, validation: validateAnalysis(r.parsed, docs),
    });
  } catch (e: any) {
    return res.status(502).json({ error: 'Falha na chamada ao modelo: ' + String(e.message ?? e).slice(0, 160) });
  }
}
