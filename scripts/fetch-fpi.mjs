// Fetches ESPN's NFL Power Index data from their public "fitt" API.
//
// Note: www.espn.com/nfl/fpi is behind an AWS WAF JS challenge that a plain
// fetch() can't pass (it works from a real browser, not from a script or a
// GitHub Actions runner). This API endpoint serves the same underlying data
// as plain JSON with no such challenge.
//
// The "fpi" category's `values` array isn't self-labeled, but position
// 0-3 are consistently [fpi, offense, defense, specialTeams] - verified by
// checking fpi ≈ offense + defense + specialTeams (asserted below).

import fs from 'fs';
import path from 'path';
import { dataDir } from './lib/paths.mjs';

const FPI_URL = 'https://site.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?limit=1000';

async function main() {
  const res = await fetch(FPI_URL);
  if (!res.ok) throw new Error(`ESPN FPI fetch failed: ${res.status}`);
  const data = await res.json();

  const ratings = {};
  for (const row of data.teams) {
    const abbrev = row.team.abbreviation.toUpperCase();
    const fpiCategory = row.categories.find((c) => c.name === 'fpi');
    const [fpi, off, def, st] = fpiCategory.values;

    if (Math.abs(fpi - (off + def + st)) > 0.05) {
      throw new Error(`FPI sanity check failed for ${abbrev}: ${fpi} != ${off}+${def}+${st}`);
    }

    ratings[abbrev] = { fpi, off, def };
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
