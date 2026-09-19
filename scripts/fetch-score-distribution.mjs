// Builds an empirical distribution of individual team final scores from
// nflverse's historical game-by-game dataset, restricted to recent seasons
// so the distribution reflects the modern scoring environment.

import fs from 'fs';
import path from 'path';
import { dataDir, currentSeasonYear } from './lib/paths.mjs';

const GAMES_CSV_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const SEASONS_OF_HISTORY = 20;

// Minimal CSV parser: handles quoted fields containing commas, good enough
// for this well-formed dataset.
function parseCsv(text) {
  const lines = text.split('\n').filter((l) => l.length > 0);
  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

function splitLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

async function main() {
  const res = await fetch(GAMES_CSV_URL);
  if (!res.ok) throw new Error(`games.csv fetch failed: ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);

  const minSeason = currentSeasonYear() - SEASONS_OF_HISTORY;
  const counts = {};
  let gamesUsed = 0;

  for (const row of rows) {
    const season = Number(row.season);
    if (Number.isNaN(season) || season < minSeason) continue;
    if (row.home_score === '' || row.away_score === '') continue; // not yet played
    const homeScore = Number(row.home_score);
    const awayScore = Number(row.away_score);

    counts[homeScore] = (counts[homeScore] || 0) + 1;
    counts[awayScore] = (counts[awayScore] || 0) + 1;
    gamesUsed++;
  }

  const out = {
    updatedAt: new Date().toISOString(),
    source: GAMES_CSV_URL,
    seasonsUsed: `${minSeason}-${currentSeasonYear()}`,
    gamesUsed,
    counts,
  };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'score-distribution.json'), JSON.stringify(out, null, 2));
  console.log(`Wrote score distribution from ${gamesUsed} games (seasons ${out.seasonsUsed}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
