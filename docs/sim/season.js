// Orchestrates one full season simulation: fills in every not-yet-played
// regular season game, computes final standings, then simulates the playoffs.

import { simulateFullGame } from './engine.js';
import { buildStandings } from './standings.js';
import { simulatePlayoffs } from './playoffs.js';

// (homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, neutral, allowTie) => {homeScore, awayScore}
function defaultGameSim(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, neutral, allowTie) {
  return simulateFullGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, { neutral, allowTie });
}

// schedule: { season, games: [{ id, week, seasonType, date, home, away, completed, homeScore, awayScore }] }
// ratings: rating-system-specific shape consumed by gameSimFn (FPI: { [abbrev]: { off, def } }; Elo: { [abbrev]: number })
// gameSimFn: optional pluggable game simulator (see docs/sim/playoffs.js); defaults to the FPI model.
export function simulateSeason(schedule, ratings, scoreSampler, rng, teams, gameSimFn = defaultGameSim) {
  const games = schedule.games.map((g) => ({ ...g }));

  for (const g of games) {
    if (g.seasonType === 'REG' && !g.completed) {
      const { homeScore, awayScore } = gameSimFn(g.home, g.away, ratings, scoreSampler, rng, false, true);
      g.homeScore = homeScore;
      g.awayScore = awayScore;
      g.completed = true;
      g.simulated = true;
    }
  }

  const standings = buildStandings(games, teams);
  const playoffs = simulatePlayoffs(standings, teams, ratings, scoreSampler, rng, gameSimFn);

  return { games, standings, playoffs };
}
