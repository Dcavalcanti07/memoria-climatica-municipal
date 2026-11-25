/**
 * Avaliação semântica cega por rubrica (LLM-avaliador). Não recebe a condição (A/B).
 * Uso: npx tsx scripts/judge.ts --tag eval_v1
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, root, readJSON, arg, pool } from './util';
import { renderDocs } from '../src/core/prompt';
import { callStructured, type LLMConfig } from '../src/core/llm';
import { JUDGE_SCHEMA } from '../src/core/judge-schema';
import type { Scenario } from '../src/core/schema';

loadEnv();
const cfgAll = readJSON(path.join(root, 'config', arg('config', 'experiment.json')));
const cfg: LLMConfig = cfgAll.judge;
const system = fs.readFileSync(path.join(root, 'prompts', cfgAll.judge_prompt_file), 'utf8');
const tag = arg('tag', 'dev');
const concurrency = Number(arg('concurrency', '4'));
const runDir = path.join(root, 'runs', tag);
const outDir = path.join(runDir, arg('judge-dir', 'judge'));
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(runDir).filter((f) => /_[AB]U?_r\d+\.json$/.test(f)).sort();

function outputForJudge(o: any) {
  // remove metadados que poderiam revelar a condição; mantém o conteúdo avaliável
  return {
    resumo_situacao: o.resumo_situacao,
    verificacoes: o.verificacoes,
    achados_temporais: o.achados_temporais,
    relacoes: o.relacoes.map((r: any) => ({ id: r.id, rotulo: r.rotulo, status_epistemico: r.status_epistemico, periodo: r.periodo })),
    informacoes_ausentes: o.informacoes_ausentes,
    cautelas: o.cautelas,
  };
}

await pool(files, concurrency, async (f) => {
  const out = path.join(outDir, f);
  if (fs.existsSync(out)) return;
  const run = readJSON(path.join(runDir, f));
  const sid = run.meta.scenario;
  const s = readJSON(path.join(root, `data/scenarios/${sid}.json`)) as Scenario;
  const gold = readJSON(path.join(root, `data/gold/${sid}.json`));
  const allDocs = [...s.docs, ...(run.meta.com_atualizacao ? s.atualizacao ?? [] : [])].sort((a, b) => a.data.localeCompare(b.data));
  const goldForJudge = {
    gold_checks: gold.checks, gold_dependencias: gold.dependencias, gold_temporal: gold.temporal,
    gold_insuficiente: gold.insuficiente, proibidos: gold.proibido,
  };
  const user = [
    `Data de referência: ${s.alerta_data}`,
    '## DOCUMENTOS (todos os documentos do cenário)', renderDocs(allDocs),
    '## GABARITO', JSON.stringify(goldForJudge, null, 1),
    '## SAÍDA A AVALIAR', JSON.stringify(outputForJudge(run.output), null, 1),
    'Avalie TODOS os itens do gabarito e TODAS as verificações da saída.',
  ].join('\n\n');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await callStructured(cfg, system, user, 'avaliacao', JUDGE_SCHEMA);
      fs.writeFileSync(out, JSON.stringify({ run_file: f, judge_config: cfg, response_id: r.response_id, model_reported: r.model_reported, usage: r.usage, latency_ms: r.latency_ms, judgement: r.parsed }, null, 2));
      console.log(`judge ${f} ok`);
      return;
    } catch (e: any) {
      console.warn(`judge ${f} #${attempt}: ${e.message?.slice(0, 200)}`);
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
});
