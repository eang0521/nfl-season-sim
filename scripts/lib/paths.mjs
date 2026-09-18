import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // scripts/lib
export const scriptsDir = path.resolve(__dirname, '..'); // scripts
export const repoRoot = path.resolve(scriptsDir, '..');
export const dataDir = path.join(repoRoot, 'docs', 'data');

export function currentSeasonYear(date = new Date()) {
  const month = date.getUTCMonth() + 1; // 1-12
  const year = date.getUTCFullYear();
  return month < 3 ? year - 1 : year;
}
