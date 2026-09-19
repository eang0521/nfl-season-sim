// Builds the full 1920-present NFL game history used by the all-time Elo
// viewer, combining two sources:
//   - FiveThirtyEight's historical dataset (1920-2020): already uses stable
//     team codes that track a franchise across relocations/renames, and
//     already includes AAFC (1946-49) and AFL (1960-69) games for franchises
//     that are now part of the NFL.
//   - nflverse's games.csv (2021-present): kept current by the existing data
//     pipeline, used here for everything after 538's dataset ends.
//
// The only code reconciliation needed between the two: 538's dataset still
// labels the Raiders "OAK" through their first Las Vegas season (2020);
// nflverse uses "LV" from 2021 on. We keep "OAK" as the canonical code
// throughout (matching 538's usage for the franchise's entire 1960-2020
// history) and remap nflverse's "LV" down to "OAK" when ingesting.

import fs from 'fs';
import path from 'path';
import { dataDir } from './lib/paths.mjs';

const ELO_538_URL = 'https://raw.githubusercontent.com/fivethirtyeight/nfl-elo-game/master/data/nfl_games.csv';
const NFLVERSE_GAMES_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const LAST_538_SEASON = 2020;

// nflverse -> 538's canonical code for the same franchise.
const CODE_REMAP = { LV: 'OAK', LA: 'LAR', WAS: 'WSH' };

function splitCsvLine(line) {
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

function parseCsv(text) {
  const lines = text.split('\n').filter((l) => l.length > 0);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

async function fetch538Games() {
  const res = await fetch(ELO_538_URL);
  if (!res.ok) throw new Error(`538 Elo data fetch failed: ${res.status}`);
  const rows = parseCsv(await res.text());

  return rows.map((r) => ({
    date: r.date,
    season: Number(r.season),
    neutral: r.neutral === '1',
    playoff: r.playoff === '1',
    team1: CODE_REMAP[r.team1] || r.team1,
    team2: CODE_REMAP[r.team2] || r.team2,
    score1: Number(r.score1),
    score2: Number(r.score2),
  }));
}

async function fetchNflverseGames(minSeason) {
  const res = await fetch(NFLVERSE_GAMES_URL);
  if (!res.ok) throw new Error(`nflverse games.csv fetch failed: ${res.status}`);
  const rows = parseCsv(await res.text());

  const games = [];
  for (const r of rows) {
    const season = Number(r.season);
    if (Number.isNaN(season) || season < minSeason) continue;
    if (r.game_type !== 'REG' && r.game_type !== 'WC' && r.game_type !== 'DIV' && r.game_type !== 'CON' && r.game_type !== 'SB') continue;
    if (r.home_score === '' || r.away_score === '') continue; // not yet played
    const homeScore = Number(r.home_score);
    const awayScore = Number(r.away_score);

    games.push({
      date: r.gameday,
      season,
      neutral: r.location === 'Neutral',
      playoff: r.game_type !== 'REG',
      team1: CODE_REMAP[r.home_team] || r.home_team,
      team2: CODE_REMAP[r.away_team] || r.away_team,
      score1: homeScore,
      score2: awayScore,
    });
  }
  return games;
}

async function main() {
  const [historical, recent] = await Promise.all([
    fetch538Games(),
    fetchNflverseGames(LAST_538_SEASON + 1),
  ]);

  const games = [...historical, ...recent].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const out = {
    updatedAt: new Date().toISOString(),
    sources: [ELO_538_URL, NFLVERSE_GAMES_URL],
    gameCount: games.length,
    seasonRange: [games[0].season, games[games.length - 1].season],
    games,
  };

  const outDir = path.join(dataDir, 'elo');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'games.json'), JSON.stringify(out));
  console.log(`Wrote ${games.length} games (${out.seasonRange[0]}-${out.seasonRange[1]}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
