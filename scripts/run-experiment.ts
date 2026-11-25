/**
 * Executa as condições experimentais.
 *   A = plano vigente + alerta + informações atuais
 *   B = A + registros históricos (memória institucional)
 * Uso: npx tsx scripts/run-experiment.ts --tag eval_v1 --split eval --conds A,B --reps 1 [--ids E01,E02] [--rep-start 1]
 * Cada chamada é independente (sem histórico compartilhado). Resultados são retomáveis (arquivos existentes são pulados).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv, root, readJSON, arg, pool } from './util';
import { ANALYSIS_SCHEMA, type Scenario } from '../src/core/schema';
import { buildUserMessage, selectDocs, type Condicao } from '../src/core/prompt';
import { callStructured, type LLMConfig } from '../src/core/llm';
import { assertShape, validateAnalysis } from '../src/core/validate';

loadEnv();
const cfgAll = readJSON(path.join(root, 'config', arg('config', 'experiment.json')));
const cfg: LLMConfig = cfgAll.analysis;
const promptFile = path.join(root, 'prompts', cfgAll.prompt_file);
const system = fs.readFileSync(promptFile, 'utf8');
const promptHash = crypto.createHash('sha256').update(system).digest('hex').slice(0, 12);

const tag = arg('tag', 'dev');
const split = arg('split', 'dev');
const conds = arg('conds', 'A,B').split(',') as Condicao[];
const reps = Number(arg('reps', '1'));
const repStart = Number(arg('rep-start', '1'));
const ids = arg('ids', '');
const withUpdate = arg('with-update', '') === '1';
const concurrency = Number(arg('concurrency', '4'));

const index = readJSON(path.join(root, 'data/index.json')) as any[];
const scenarioIds = ids ? ids.split(',') : index.filter((i) => i.split === split).map((i) => i.id);
const outDir = path.join(root, 'runs', tag);
fs.mkdirSync(outDir, { recursive: true });

type Job = { sid: string; cond: Condicao; rep: number };
const jobs: Job[] = [];
for (let rep = repStart; rep < repStart + reps; rep++) for (const sid of scenarioIds) for (const cond of conds) jobs.push({ sid, cond, rep });

let done = 0, failed = 0;
await pool(jobs, concurrency, async ({ sid, cond, rep }) => {
  const file = path.join(outDir, `${sid}_${cond}${withUpdate ? 'U' : ''}_r${rep}.json`);
  if (fs.existsSync(file)) { done++; return; }
  const s = readJSON(path.join(root, `data/scenarios/${sid}.json`)) as Scenario;
  const docs = selectDocs(s, cond, withUpdate ? s.atualizacao ?? [] : []);
  const user = buildUserMessage(s, docs);
  const meta = {
    scenario: sid, condicao: cond, com_atualizacao: withUpdate, rep, tag,
    config: cfg, prompt_file: cfgAll.prompt_file, prompt_sha12: promptHash,
    docs_fornecidos: docs.map((d) => d.id),
    user_message_chars: user.length,
    user_message_sha12: crypto.createHash('sha256').update(user).digest('hex').slice(0, 12),
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await callStructured(cfg, system, user, 'analise_mcm', ANALYSIS_SCHEMA);
      assertShape(r.parsed);
      const validation = validateAnalysis(r.parsed, docs);
      fs.writeFileSync(file, JSON.stringify({ meta, user_message: user, response_id: r.response_id, model_reported: r.model_reported, usage: r.usage, latency_ms: r.latency_ms, started_at: r.started_at, output: r.parsed, validation, raw: r.raw }, null, 2));
      done++;
      console.log(`[${done}/${jobs.length}] ${sid} ${cond} r${rep} ok ${r.latency_ms}ms verif=${r.parsed.verificacoes.length} cit=${validation.n_citacoes_literais}/${validation.n_citacoes}`);
      return;
    } catch (e: any) {
      console.warn(`${sid} ${cond} r${rep} tentativa ${attempt} falhou: ${e.message?.slice(0, 200)}`);
      fs.appendFileSync(path.join(outDir, 'errors.log'), `${new Date().toISOString()} ${sid} ${cond} r${rep} #${attempt}: ${e.message}\n`);
      if (attempt === 3) failed++;
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
});
console.log(`concluído: ${done} ok, ${failed} falhas`);
