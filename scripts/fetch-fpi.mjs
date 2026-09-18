// Fetches ESPN's NFL FPI page and extracts each team's FPI/offense/defense
// ratings from the server-rendered `__espnfitt__` JSON blob embedded in the
// page HTML (no headless browser needed - it's plain SSR data).

import fs from 'fs';
import path from 'path';
import { dataDir } from './lib/paths.mjs';

const FPI_URL = 'https://www.espn.com/nfl/fpi';

// ESPN's FPI-page abbreviations that differ from our docs/data/teams.json keys.
const ABBREV_ALIASES = {
  WAS: 'WSH',
  LA: 'LAR',
  JAC: 'JAX',
};

async function main() {
  const res = await fetch(FPI_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; nfl-season-sim data fetch)' },
  });
  if (!res.ok) throw new Error(`ESPN FPI fetch failed: ${res.status}`);
  const html = await res.text();

  const match = html.match(/window\['__espnfitt__'\]\s*=\s*({.*?});\s*<\/script>/s);
  if (!match) throw new Error('Could not find __espnfitt__ blob in ESPN FPI page');

  const fitt = JSON.parse(match[1]);
  const table = fitt.page.content.table;

  const ratings = {};
  for (const row of table.stats) {
    let abbrev = row.team.abbrev.toUpperCase();
    abbrev = ABBREV_ALIASES[abbrev] || abbrev;

    const statByName = Object.fromEntries(row.stats.map((s) => [s.name, s.value]));
    ratings[abbrev] = {
      fpi: Number(statByName.fpi),
      off: Number(statByName.epaoffense),
      def: Number(statByName.epadefense),
    };
  }

  if (Object.keys(ratings).length < 32) {
    throw new Error(`Expected 32 teams, got ${Object.keys(ratings).length}`);
  }

  const out = { updatedAt: new Date().toISOString(), source: FPI_URL, ratings };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'fpi.json'), JSON.stringify(out, null, 2));
  console.log(`Wrote FPI ratings for ${Object.keys(ratings).length} teams.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
