import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export const root = path.resolve(import.meta.dirname, '..');

/** Carrega credenciais apenas de mcm/.env (nunca versionado). */
export function loadEnv() {
  dotenv.config({ path: path.join(root, '.env'), override: true, quiet: true } as any);
}

export const readJSON = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

export function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

export async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
