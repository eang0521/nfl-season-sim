// Runs the all-time Elo engine over docs/data/elo/games.json and writes
// docs/data/elo/ratings.json: current ratings for every team code plus each
// team's full rating trajectory (for charting).

import fs from 'fs';
import path from 'path';
import { dataDir } from './lib/paths.mjs';
import { computeEloHistory } from '../docs/elo/engine.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Assigns each game a "week" number counted from that season's first game
// (so it lines up with real NFL week numbers regardless of era-specific
// schedule length or bye weeks), plus a continuous "global" week index with
// seasons laid back-to-back and no off-season gap - season S+1's week 1
// immediately follows season S's final (e.g. Super Bowl) week.
function computeWeekIndices(games) {
  const seasonMinTs = {};
  for (const g of games) {
    const ts = new Date(g.date).getTime();
    if (!(g.season in seasonMinTs) || ts < seasonMinTs[g.season]) seasonMinTs[g.season] = ts;
  }

  const weekInSeasonByGame = games.map((g) => {
    const ts = new Date(g.date).getTime();
    return Math.floor((ts - seasonMinTs[g.season]) / (7 * DAY_MS)) + 1;
  });

  const maxWeekBySeason = {};
  games.forEach((g, i) => {
    const w = weekInSeasonByGame[i];
    if (!(g.season in maxWeekBySeason) || w > maxWeekBySeason[g.season]) maxWeekBySeason[g.season] = w;
  });

  const seasons = Object.keys(maxWeekBySeason).map(Number).sort((a, b) => a - b);
  const seasonStartOffset = {};
  let cumulative = 0;
  for (const s of seasons) {
    seasonStartOffset[s] = cumulative;
    cumulative += maxWeekBySeason[s];
  }

  const weekIndexByGame = games.map((g, i) => seasonStartOffset[g.season] + weekInSeasonByGame[i]);

  return { weekInSeasonByGame, weekIndexByGame, seasonStartOffset };
}

function main() {
  const gamesFile = path.join(dataDir, 'elo', 'games.json');
  const { games } = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));

  const { ratings, history } = computeEloHistory(games);
  const { weekInSeasonByGame, weekIndexByGame, seasonStartOffset } = computeWeekIndices(games);

  const trajectories = {};
  const current = {};
  for (const code of Object.keys(ratings)) {
    trajectories[code] = [];
    current[code] = { elo: Math.round(ratings[code] * 10) / 10, peakElo: -Infinity, peakDate: null, gamesPlayed: 0, lastDate: null, lastSeason: null, firstSeason: null };
  }

  history.forEach((g, i) => {
    const week = weekIndexByGame[i];
    const weekInSeason = weekInSeasonByGame[i];
    for (const [code, eloPost] of [[g.team1, g.elo1Post], [g.team2, g.elo2Post]]) {
      const rounded = Math.round(eloPost * 10) / 10;
      trajectories[code].push({ date: g.date, season: g.season, weekInSeason, week, elo: rounded });
      const c = current[code];
      c.gamesPlayed++;
      c.lastDate = g.date;
      c.lastSeason = g.season;
      if (c.firstSeason === null) c.firstSeason = g.season;
      if (rounded > c.peakElo) { c.peakElo = rounded; c.peakDate = g.date; }
    }
  });

  const out = {
    updatedAt: new Date().toISOString(),
    gameCount: games.length,
    current,
    trajectories,
    seasonStartOffset, // { season: global week index of that season's week 1 } - for axis year labels
  };

  fs.writeFileSync(path.join(dataDir, 'elo', 'ratings.json'), JSON.stringify(out));
  console.log(`Computed Elo for ${Object.keys(ratings).length} team codes across ${games.length} games.`);
}

main();
