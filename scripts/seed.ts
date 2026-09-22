import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seedDemoData(): Promise<void> {
  const distPath = path.resolve(__dirname, '../dist/seed.js');
  const srcPath = path.resolve(__dirname, '../src/seed.js');

  if (fs.existsSync(distPath)) {
    const mod = await import(distPath);
    return mod.seedDemoData();
  } else {
    const mod = await import(srcPath);
    return mod.seedDemoData();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDemoData();
}
