/**
 * Separa os arquivos de autoria (data/authoring/*.yaml) em:
 *  - data/scenarios/<id>.json  → entrada do modelo (SEM gabarito)
 *  - data/gold/<id>.json       → gabarito (nunca enviado ao modelo)
 *  - data/gold/MANIFEST.json   → hash SHA-256 de cada gabarito (congelamento)
 * Também valida consistência: ids de documentos citados no gabarito existem.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { load as yamlLoad } from 'js-yaml';

const root = path.resolve(import.meta.dirname, '..');
const authDir = path.join(root, 'data/authoring');
const scenDir = path.join(root, 'data/scenarios');
const goldDir = path.join(root, 'data/gold');
fs.mkdirSync(scenDir, { recursive: true });
fs.mkdirSync(goldDir, { recursive: true });

const files = fs.readdirSync(authDir).filter((f) => f.endsWith('.yaml')).sort();
const manifest: Record<string, string> = {};
const errors: string[] = [];
const index: any[] = [];

for (const f of files) {
  const items = yamlLoad(fs.readFileSync(path.join(authDir, f), 'utf8')) as any[];
  for (const s of items) {
    const { gold, nota_metodologica, ...scenario } = s;
    const allDocs = [...scenario.docs, ...(scenario.atualizacao ?? [])];
    const ids = new Set(allDocs.map((d: any) => d.id));
    if (ids.size !== allDocs.length) errors.push(`${s.id}: ids de documento duplicados`);
    for (const d of allDocs) {
      if (!['atual', 'memoria'].includes(d.conjunto)) errors.push(`${s.id}/${d.id}: conjunto inválido`);
      d.texto = String(d.texto).trim();
    }
    const memIds = new Set(scenario.docs.filter((d: any) => d.conjunto === 'memoria').map((d: any) => d.id));
    for (const sec of ['dependencias', 'checks', 'temporal'] as const) {
      for (const g of gold[sec] ?? []) {
        for (const d of g.docs ?? []) if (!ids.has(d)) errors.push(`${s.id}/${g.id}: doc ${d} inexistente`);
        // coerência: item "atual" não pode depender só de memória
        if (g.requer === 'atual' && (g.docs ?? []).length && (g.docs ?? []).every((d: string) => memIds.has(d)))
          errors.push(`${s.id}/${g.id}: marcado como atual mas só cita documentos de memória`);
      }
    }
    fs.writeFileSync(path.join(scenDir, `${s.id}.json`), JSON.stringify(scenario, null, 2));
    const goldOut = { id: s.id, categoria: s.categoria, nota_metodologica: nota_metodologica ?? null, ...gold };
    const goldStr = JSON.stringify(goldOut, null, 2);
    fs.writeFileSync(path.join(goldDir, `${s.id}.json`), goldStr);
    manifest[s.id] = crypto.createHash('sha256').update(goldStr).digest('hex');
    index.push({
      id: s.id, split: s.split, municipio: s.municipio, categoria: s.categoria, titulo: s.titulo,
      n_docs_atual: scenario.docs.filter((d: any) => d.conjunto === 'atual').length,
      n_docs_memoria: memIds.size,
      n_checks_gold: (gold.checks ?? []).length,
      n_checks_memoria: (gold.checks ?? []).filter((g: any) => g.requer === 'memoria').length,
    });
  }
}

fs.writeFileSync(path.join(goldDir, 'MANIFEST.json'), JSON.stringify({ gerado_em: new Date().toISOString(), sha256: manifest }, null, 2));
fs.writeFileSync(path.join(root, 'data/index.json'), JSON.stringify(index, null, 2));

const ev = index.filter((i) => i.split === 'eval');
console.log(`cenários: ${index.length} (eval ${ev.length}, dev ${index.length - ev.length})`);
console.log(`docs/cenário (eval): média ${(ev.reduce((a, i) => a + i.n_docs_atual + i.n_docs_memoria, 0) / ev.length).toFixed(1)}`);
console.log(`checks gold (eval): ${ev.reduce((a, i) => a + i.n_checks_gold, 0)} | dependem de memória: ${ev.reduce((a, i) => a + i.n_checks_memoria, 0)}`);
const cats: Record<string, number> = {};
for (const i of ev) cats[i.categoria] = (cats[i.categoria] ?? 0) + 1;
console.log('categorias:', cats);
if (errors.length) { console.error('ERROS:\n' + errors.join('\n')); process.exit(1); }
