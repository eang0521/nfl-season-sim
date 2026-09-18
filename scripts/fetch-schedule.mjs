// Fetches the real 18-week regular season schedule and any already-completed
// results from ESPN's public scoreboard API, one week at a time.

import fs from 'fs';
import path from 'path';
import { dataDir, currentSeasonYear } from './lib/paths.mjs';

const WEEKS = 18;

const ABBREV_ALIASES = {
  WAS: 'WSH',
  LA: 'LAR',
  JAC: 'JAX',
};

function normalize(abbrev) {
  const a = abbrev.toUpperCase();
  return ABBREV_ALIASES[a] || a;
}

async function fetchWeek(season, week) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&year=${season}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scoreboard fetch failed for week ${week}: ${res.status}`);
  const data = await res.json();

  const games = [];
  for (const event of data.events || []) {
    const comp = event.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
    const completed = Boolean(comp.status.type.completed);

    games.push({
      id: `${season}_${String(week).padStart(2, '0')}_${normalize(away.team.abbreviation)}_${normalize(home.team.abbreviation)}`,
      week,
      seasonType: 'REG',
      date: event.date,
      home: normalize(home.team.abbreviation),
      away: normalize(away.team.abbreviation),
      completed,
      homeScore: completed ? Number(home.score) : null,
      awayScore: completed ? Number(away.score) : null,
    });
  }
  return games;
}

async function main() {
  const season = Number(process.env.NFL_SEASON) || currentSeasonYear();
  const allGames = [];
  for (let week = 1; week <= WEEKS; week++) {
    const games = await fetchWeek(season, week);
    allGames.push(...games);
    console.log(`Week ${week}: ${games.length} games (${games.filter((g) => g.completed).length} completed)`);
  }

  const out = {
    season,
    updatedAt: new Date().toISOString(),
    games: allGames,
  };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'schedule.json'), JSON.stringify(out, null, 2));
  console.log(`Wrote ${allGames.length} games for the ${season} season.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
