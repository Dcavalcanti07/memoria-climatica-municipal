/**
 * Calcula métricas a partir das saídas (validação determinística) e da avaliação por rubrica.
 * Uso: npx tsx scripts/score.ts --tag eval_v1 [--out results/eval_v1]
 */
import fs from 'node:fs';
import path from 'node:path';
import { root, readJSON, arg } from './util';
import { validateAnalysis } from '../src/core/validate';

const tag = arg('tag', 'dev');
const outDir = path.join(root, arg('out', `results/${tag}`));
fs.mkdirSync(outDir, { recursive: true });
const runDir = path.join(root, 'runs', tag);
const files = fs.readdirSync(runDir).filter((f) => /_[AB]U?_r\d+\.json$/.test(f)).sort();

const sc = (r: string) => (r === 'atendido' || r === 'correto' ? 1 : r === 'parcial' ? 0.5 : 0);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);

type Row = Record<string, any>;
const rows: Row[] = [];
const itemRows: Row[] = [];

for (const f of files) {
  const run = readJSON(path.join(runDir, f));
  const jf = path.join(runDir, arg('judge-dir', 'judge'), f);
  if (!fs.existsSync(jf)) { console.warn('sem avaliação:', f); continue; }
  const j = readJSON(jf).judgement;
  const gold = readJSON(path.join(root, `data/gold/${run.meta.scenario}.json`));
  const byId = (arr: any[]) => new Map(arr.map((x: any) => [x.id, x]));
  const gC = byId(gold.checks), gD = byId(gold.dependencias ?? []), gT = byId(gold.temporal ?? []);

  const checkScores = j.gold_checks.filter((x: any) => gC.has(x.id)).map((x: any) => ({ ...x, requer: gC.get(x.id).requer, s: sc(x.resultado) }));
  const depScores = j.gold_dependencias.filter((x: any) => gD.has(x.id)).map((x: any) => ({ ...x, requer: gD.get(x.id).requer, s: sc(x.resultado) }));
  const tmpScores = j.gold_temporal.filter((x: any) => gT.has(x.id)).map((x: any) => ({ ...x, requer: gT.get(x.id).requer, s: sc(x.resultado) }));
  // itens do gabarito que o avaliador esqueceu de listar contam como ausentes (e são registrados)
  const missing = [...gC.keys()].filter((id) => !checkScores.find((x: any) => x.id === id));
  for (const id of missing) checkScores.push({ id, resultado: 'ausente', requer: gC.get(id).requer, s: 0, ids_saida: [], justificativa: '(não avaliado pelo avaliador)' });

  const prods = j.verificacoes_produzidas as any[];
  const nV = run.output.verificacoes.length;
  const cls = (c: string) => prods.filter((p) => p.classificacao === c).length;
  const corr = cls('corresponde_gabarito'), pert = cls('pertinente_nao_prevista');
  const falsos = cls('irrelevante') + cls('sem_respaldo') + cls('baseada_em_info_superada');
  const precision = nV ? (corr + pert) / nV : NaN;
  const recall = checkScores.length ? sum(checkScores.map((x: any) => x.s)) / checkScores.length : NaN;
  // revalida com o validador atual (determinístico), a partir dos documentos efetivamente enviados
  const scen = readJSON(path.join(root, `data/scenarios/${run.meta.scenario}.json`));
  const sent = [...scen.docs, ...(scen.atualizacao ?? [])].filter((d: any) => run.meta.docs_fornecidos.includes(d.id));
  const v = validateAnalysis(run.output, sent);
  const row: Row = {
    file: f, scenario: run.meta.scenario, categoria: gold.categoria, cond: run.meta.condicao + (run.meta.com_atualizacao ? 'U' : ''), rep: run.meta.rep,
    n_verificacoes: nV,
    recall_checks: recall,
    recall_checks_atual: mean(checkScores.filter((x: any) => x.requer === 'atual').map((x: any) => x.s)),
    recall_checks_memoria: mean(checkScores.filter((x: any) => x.requer === 'memoria').map((x: any) => x.s)),
    pts_checks: sum(checkScores.map((x: any) => x.s)), n_checks: checkScores.length,
    pts_checks_atual: sum(checkScores.filter((x: any) => x.requer === 'atual').map((x: any) => x.s)), n_checks_atual: checkScores.filter((x: any) => x.requer === 'atual').length,
    pts_checks_memoria: sum(checkScores.filter((x: any) => x.requer === 'memoria').map((x: any) => x.s)), n_checks_memoria: checkScores.filter((x: any) => x.requer === 'memoria').length,
    pts_dep: sum(depScores.map((x: any) => x.s)), n_dep: depScores.length,
    pts_dep_memoria: sum(depScores.filter((x: any) => x.requer === 'memoria').map((x: any) => x.s)), n_dep_memoria: depScores.filter((x: any) => x.requer === 'memoria').length,
    pts_temporal: sum(tmpScores.map((x: any) => x.s)), n_temporal: tmpScores.length,
    n_temporal_incorreto: tmpScores.filter((x: any) => x.resultado === 'incorreto').length,
    n_insuf: j.gold_insuficiente.length, n_insuf_ok: j.gold_insuficiente.filter((x: any) => x.resultado === 'reconhecido').length,
    n_proibidos: j.proibidos.length, n_violacoes: j.proibidos.filter((x: any) => x.violado).length,
    corresponde: corr, pertinente: pert, redundante: cls('redundante'), generica: cls('generica'),
    irrelevante: cls('irrelevante'), sem_respaldo: cls('sem_respaldo'), superada: cls('baseada_em_info_superada'),
    falsos_alarmes: falsos,
    precision, f1: precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0,
    afirmacoes_sem_respaldo: j.afirmacoes_sem_respaldo.length,
    n_citacoes: v.n_citacoes, n_citacoes_literais: v.n_citacoes_literais, n_citacoes_doc_invalido: v.n_citacoes_doc_invalido,
    relacoes_orfas: v.relacoes_orfas.length, n_entidades: v.n_entidades, n_relacoes: v.n_relacoes, n_temporais: v.n_temporais,
    latency_ms: run.latency_ms, input_tokens: run.usage.input_tokens, output_tokens: run.usage.output_tokens, reasoning_tokens: run.usage.reasoning_tokens,
  };
  rows.push(row);
  for (const x of checkScores) itemRows.push({ scenario: row.scenario, cond: row.cond, rep: row.rep, tipo: 'check', id: x.id, requer: x.requer, resultado: x.resultado, ids_saida: (x.ids_saida ?? []).join(' '), justificativa: x.justificativa });
  for (const x of tmpScores) itemRows.push({ scenario: row.scenario, cond: row.cond, rep: row.rep, tipo: 'temporal', id: x.id, requer: x.requer, resultado: x.resultado, ids_saida: (x.ids_saida ?? []).join(' '), justificativa: x.justificativa });
  for (const x of j.proibidos) itemRows.push({ scenario: row.scenario, cond: row.cond, rep: row.rep, tipo: 'proibido', id: x.id, requer: '', resultado: x.violado ? 'violado' : 'ok', ids_saida: x.onde, justificativa: x.justificativa });
}

function aggregate(rs: Row[]) {
  const S = (k: string) => sum(rs.map((r) => r[k] ?? 0));
  return {
    n_execucoes: rs.length,
    recall_verificacoes: S('pts_checks') / S('n_checks'),
    recall_verificacoes_atual: S('pts_checks_atual') / S('n_checks_atual'),
    recall_verificacoes_memoria: S('pts_checks_memoria') / S('n_checks_memoria'),
    recall_dependencias: S('pts_dep') / S('n_dep'),
    recall_dependencias_memoria: S('pts_dep_memoria') / S('n_dep_memoria'),
    interpretacao_temporal: S('pts_temporal') / S('n_temporal'),
    temporal_incorreto: S('n_temporal_incorreto'),
    insuficiencia_reconhecida: S('n_insuf_ok') / S('n_insuf'),
    verificacoes_total: S('n_verificacoes'),
    verificacoes_media: S('n_verificacoes') / rs.length,
    precisao_pertinente: (S('corresponde') + S('pertinente')) / S('n_verificacoes'),
    precisao_gabarito: S('corresponde') / S('n_verificacoes'),
    taxa_falsos_alarmes: S('falsos_alarmes') / S('n_verificacoes'),
    genericas: S('generica'), redundantes: S('redundante'), irrelevantes: S('irrelevante'), sem_respaldo: S('sem_respaldo'), baseada_em_superada: S('superada'),
    f1_medio: mean(rs.map((r) => r.f1)),
    violacoes_proibidos: S('n_violacoes'), itens_proibidos: S('n_proibidos'),
    execucoes_com_violacao: rs.filter((r) => r.n_violacoes > 0).length,
    afirmacoes_sem_respaldo: S('afirmacoes_sem_respaldo'),
    fidelidade_citacoes: S('n_citacoes_literais') / S('n_citacoes'),
    citacoes_total: S('n_citacoes'), citacoes_doc_invalido: S('n_citacoes_doc_invalido'),
    relacoes_orfas: S('relacoes_orfas'),
    entidades_media: S('n_entidades') / rs.length, relacoes_media: S('n_relacoes') / rs.length,
    latencia_mediana_ms: median(rs.map((r) => r.latency_ms)),
    tokens_entrada_medio: S('input_tokens') / rs.length, tokens_saida_medio: S('output_tokens') / rs.length,
  };
}
function median(a: number[]) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; }

// bootstrap pareado por cenário (diferença B − A), semente fixa
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296); }
function pairedBootstrap(pairs: [number, number][], B = 10000) {
  const r = rng(42); const d = pairs.map(([a, b]) => b - a); const n = d.length; const means: number[] = [];
  for (let i = 0; i < B; i++) { let s = 0; for (let k = 0; k < n; k++) s += d[Math.floor(r() * n)]; means.push(s / n); }
  means.sort((x, y) => x - y);
  return { diff_media: mean(d), ic95: [means[Math.floor(0.025 * B)], means[Math.floor(0.975 * B)]], b_melhor: d.filter((x) => x > 0).length, empate: d.filter((x) => x === 0).length, a_melhor: d.filter((x) => x < 0).length };
}

const r1 = rows.filter((r) => r.rep === 1);
const byCond = (c: string, rs = r1) => rs.filter((r) => r.cond === c);
const summary: any = { tag, gerado_em: new Date().toISOString(), por_condicao: {} as any };
for (const c of [...new Set(rows.map((r) => r.cond))]) summary.por_condicao[c] = aggregate(byCond(c));

const sids = [...new Set(r1.map((r) => r.scenario))];
const pair = (k: string) => sids.map((s) => [byCond('A').find((r) => r.scenario === s)?.[k], byCond('B').find((r) => r.scenario === s)?.[k]] as [number, number]).filter(([a, b]) => a != null && b != null && !Number.isNaN(a) && !Number.isNaN(b));
summary.comparacao_pareada_B_menos_A = {
  recall_checks: pairedBootstrap(pair('recall_checks')),
  recall_checks_memoria: pairedBootstrap(pair('recall_checks_memoria')),
  recall_checks_atual: pairedBootstrap(pair('recall_checks_atual')),
  falsos_alarmes: pairedBootstrap(pair('falsos_alarmes')),
  n_violacoes: pairedBootstrap(pair('n_violacoes')),
  precision: pairedBootstrap(pair('precision')),
  n_verificacoes: pairedBootstrap(pair('n_verificacoes')),
};
// por categoria
const cats = [...new Set(r1.map((r) => r.categoria))];
summary.por_categoria = Object.fromEntries(cats.map((c) => [c, Object.fromEntries(['A', 'B'].map((cond) => {
  const rs = byCond(cond).filter((r) => r.categoria === c);
  return [cond, rs.length ? { recall: aggregate(rs).recall_verificacoes, falsos: sum(rs.map((r) => r.falsos_alarmes)), violacoes: sum(rs.map((r) => r.n_violacoes)), verif: sum(rs.map((r) => r.n_verificacoes)) } : null];
}))]));
// estabilidade (repetições)
const repScen = [...new Set(rows.filter((r) => r.rep > 1).map((r) => r.scenario))];
if (repScen.length) {
  summary.estabilidade = {};
  for (const c of ['A', 'B']) {
    const per = repScen.map((s) => rows.filter((r) => r.scenario === s && r.cond === c).map((r) => r.recall_checks));
    const ranges = per.filter((p) => p.length > 1).map((p) => Math.max(...p) - Math.min(...p));
    const itemAgree = repScen.flatMap((s) => {
      const its = itemRows.filter((x) => x.scenario === s && x.cond === c && x.tipo === 'check');
      const ids = [...new Set(its.map((x) => x.id))];
      return ids.map((id) => new Set(its.filter((x) => x.id === id).map((x) => x.resultado)).size === 1 ? 1 : 0);
    });
    summary.estabilidade[c] = { cenarios: repScen.length, execucoes_por_cenario: mean(per.map((p) => p.length)), amplitude_media_recall: mean(ranges), itens_gabarito_com_resultado_identico: mean(itemAgree), recall_por_rep: [...new Set(rows.map((r) => r.rep))].map((rep) => aggregate(rows.filter((r) => r.cond === c && r.rep === rep && repScen.includes(r.scenario))).recall_verificacoes) };
  }
}

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, 'per_run.json'), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(outDir, 'per_item.json'), JSON.stringify(itemRows, null, 2));
const toCsv = (rs: Row[]) => [Object.keys(rs[0]).join(','), ...rs.map((r) => Object.values(r).map((v) => typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v).join(','))].join('\n');
if (rows.length) fs.writeFileSync(path.join(outDir, 'per_run.csv'), toCsv(rows));
if (itemRows.length) fs.writeFileSync(path.join(outDir, 'per_item.csv'), toCsv(itemRows));
console.log(JSON.stringify(summary.por_condicao, null, 1));
console.log(JSON.stringify(summary.comparacao_pareada_B_menos_A, null, 1));
