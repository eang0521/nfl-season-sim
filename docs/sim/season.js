// Orchestrates one full season simulation: fills in every not-yet-played
// regular season game, computes final standings, then simulates the playoffs.

import { simulateFullGame } from './engine.js';
import { buildStandings } from './standings.js';
import { simulatePlayoffs } from './playoffs.js';

// schedule: { season, games: [{ id, week, seasonType, date, home, away, completed, homeScore, awayScore }] }
// ratings: { [abbrev]: { off, def } }
export function simulateSeason(schedule, ratings, scoreSampler, rng, teams) {
  const games = schedule.games.map((g) => ({ ...g }));

  for (const g of games) {
    if (g.seasonType === 'REG' && !g.completed) {
      const { homeScore, awayScore } = simulateFullGame(g.home, g.away, ratings, scoreSampler, rng, { allowTie: true });
      g.homeScore = homeScore;
      g.awayScore = awayScore;
      g.completed = true;
      g.simulated = true;
    }
  }

  const standings = buildStandings(games, teams);
  const playoffs = simulatePlayoffs(standings, teams, ratings, scoreSampler, rng);

  return { games, standings, playoffs };
}
