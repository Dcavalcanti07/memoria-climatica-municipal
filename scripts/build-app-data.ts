/**
 * Gera os dados estáticos da aplicação (public/data) a partir das execuções REAIS armazenadas.
 * Uso: npx tsx scripts/build-app-data.ts --tag eval_v1 [--update-tag showcase_v1]
 */
import fs from 'node:fs';
import path from 'node:path';
import { root, readJSON, arg } from './util';
import { ANALYSIS_SCHEMA } from '../src/core/schema';

const tag = arg('tag', 'eval_v1');
const devTag = arg('dev-tag', '');
const updTag = arg('update-tag', '');
const out = path.join(root, 'public/data');
fs.mkdirSync(path.join(out, 'scenario'), { recursive: true });
const cfg = readJSON(path.join(root, 'config/experiment.json'));
const index = readJSON(path.join(root, 'data/index.json')) as any[];
const resDir = path.join(root, 'results', tag);
const perRun = fs.existsSync(path.join(resDir, 'per_run.json')) ? (readJSON(path.join(resDir, 'per_run.json')) as any[]) : [];
const summary = fs.existsSync(path.join(resDir, 'summary.json')) ? readJSON(path.join(resDir, 'summary.json')) : null;
const notesFile = path.join(resDir, 'notes.json');
if (summary && fs.existsSync(notesFile)) Object.assign(summary, readJSON(notesFile));

function loadRun(t: string, file: string, key: string) {
  const p = path.join(root, 'runs', t, file);
  if (!fs.existsSync(p)) return null;
  const r = readJSON(p);
  const jp = path.join(root, 'runs', t, 'judge', file);
  const judge = fs.existsSync(jp) ? readJSON(jp).judgement : null;
  return {
    key, provenance: 'stored', file: `runs/${t}/${file}`,
    response_id: r.response_id, model: r.model_reported, started_at: r.started_at, latency_ms: r.latency_ms, usage: r.usage,
    docs_fornecidos: r.meta.docs_fornecidos, output: r.output, validation: r.validation, judge,
    metrics: perRun.find((x) => x.file === file) ?? null,
  };
}

const scenOut: any[] = [];
for (const it of index) {
  const s = readJSON(path.join(root, `data/scenarios/${it.id}.json`));
  const gold = readJSON(path.join(root, `data/gold/${it.id}.json`));
  const t = it.split === 'dev' ? devTag : tag;
  const runs: Record<string, any> = {};
  if (t) for (const c of ['A', 'B']) { const r = loadRun(t, `${it.id}_${c}_r1.json`, c); if (r) runs[c] = r; }
  if (updTag) { const r = loadRun(updTag, `${it.id}_BU_r1.json`, 'BU'); if (r) runs.BU = r; }
  if (!Object.keys(runs).length) continue;
  // só na exibição: pontuação dos títulos sem travessão (o texto enviado ao modelo não muda)
  const tidy = (t: string) => { let n = 0; return t.replace(/ — /g, () => (n++ === 0 ? ': ' : ', ')); };
  const show = (d: any) => ({ ...d, titulo: tidy(d.titulo) });
  fs.writeFileSync(path.join(out, 'scenario', `${it.id}.json`), JSON.stringify({ ...s, docs: s.docs.map(show), atualizacao: (runs.BU ? s.atualizacao ?? [] : []).map(show), runs, gold }));
  const alerta = s.docs.find((d: any) => d.tipo === 'alerta_simulado')?.texto.match(/NÍVEL:\s*([A-ZÁÉ]+)/)?.[1] ?? '';
  scenOut.push({ id: it.id, split: it.split, municipio: it.municipio, categoria: it.categoria, titulo: it.titulo, alerta, n_docs: s.docs.length, metrics: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, r.metrics])) });
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ scenarios: scenOut, summary, featured: cfg.featured ?? ['E01'], config: cfg.analysis, generated_at: new Date().toISOString() }));
fs.writeFileSync(path.join(out, 'method.json'), JSON.stringify({
  config: { analise: cfg.analysis, avaliador: cfg.judge, prompt: cfg.prompt_file, prompt_avaliador: cfg.judge_prompt_file },
  prompt_file: cfg.prompt_file,
  prompt: fs.readFileSync(path.join(root, 'prompts', cfg.prompt_file), 'utf8'),
  schema: ANALYSIS_SCHEMA,
  uso_ia: cfg.uso_ia ?? null,
}));
console.log(`app data: ${scenOut.length} cenários`);
