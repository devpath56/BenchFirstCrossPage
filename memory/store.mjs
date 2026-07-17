import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');

// The durable memory: { [signature]: { winner, candidates: {strat:{deltaPct,beat}}, ... } }
export function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function save(mem) {
  fs.writeFileSync(FILE, JSON.stringify(mem, null, 2) + '\n');
}

export function reset() {
  save({});
}

export const FILE_PATH = FILE;
