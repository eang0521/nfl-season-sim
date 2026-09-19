// Runs the all-time Elo engine over docs/data/elo/games.json and writes
// docs/data/elo/ratings.json: current ratings for every team code plus each
// team's full rating trajectory (for charting).

import fs from 'fs';
import path from 'path';
import { dataDir } from './lib/paths.mjs';
import { computeEloHistory } from '../docs/elo/engine.js';

function main() {
  const gamesFile = path.join(dataDir, 'elo', 'games.json');
  const { games } = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));

  const { ratings, history } = computeEloHistory(games);

  const trajectories = {};
  const current = {};
  for (const code of Object.keys(ratings)) {
    trajectories[code] = [];
    current[code] = { elo: Math.round(ratings[code] * 10) / 10, peakElo: -Infinity, peakDate: null, gamesPlayed: 0, lastDate: null, lastSeason: null, firstSeason: null };
  }

  for (const g of history) {
    for (const [code, eloPost] of [[g.team1, g.elo1Post], [g.team2, g.elo2Post]]) {
      const rounded = Math.round(eloPost * 10) / 10;
      trajectories[code].push({ date: g.date, season: g.season, elo: rounded });
      const c = current[code];
      c.gamesPlayed++;
      c.lastDate = g.date;
      c.lastSeason = g.season;
      if (c.firstSeason === null) c.firstSeason = g.season;
      if (rounded > c.peakElo) { c.peakElo = rounded; c.peakDate = g.date; }
    }
  }

  const out = {
    updatedAt: new Date().toISOString(),
    gameCount: games.length,
    current,
    trajectories,
  };

  fs.writeFileSync(path.join(dataDir, 'elo', 'ratings.json'), JSON.stringify(out));
  console.log(`Computed Elo for ${Object.keys(ratings).length} team codes across ${games.length} games.`);
}

main();
