// Core scoring model:
//   expected score = 22 + (1 if home else -1) + team's offense FPI - opponent's defense FPI
//   actual score   = nearest-of-10 historical scores to Normal(expected, stdev=8)

import { sampleNormal } from './random.js';
import { resolveOvertime } from './overtime.js';

const HOME_FIELD_ADV = 1;
const SCORE_STDEV = 8;
const BASELINE = 22;

export function expectedScore(offense, opponentDefense, homeAdvantage) {
  return BASELINE + homeAdvantage + offense - opponentDefense;
}

// ratings: { [abbrev]: { off: number, def: number } }
// Pass neutral=true for the Super Bowl, where neither side gets the +1/-1.
export function simulateGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, neutral = false) {
  const home = ratings[homeAbbrev];
  const away = ratings[awayAbbrev];
  const adv = neutral ? 0 : HOME_FIELD_ADV;

  const homeExpected = expectedScore(home.off, away.def, adv);
  const awayExpected = expectedScore(away.off, home.def, -adv);

  const homeTarget = sampleNormal(rng, homeExpected, SCORE_STDEV);
  const awayTarget = sampleNormal(rng, awayExpected, SCORE_STDEV);

  const homeScore = scoreSampler.nearestOfN(homeTarget, rng, 10);
  const awayScore = scoreSampler.nearestOfN(awayTarget, rng, 10);

  return { homeScore, awayScore, homeExpected, awayExpected };
}

// Full game: regulation, then overtime if regulation ends tied.
// allowTie: true for regular season (an OT that's still tied after both
// teams get 2 possessions ends the game in a tie); false for playoffs
// (sudden death keeps going in additional 2-possession blocks).
export function simulateFullGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, { neutral = false, allowTie = true } = {}) {
  const regulation = simulateGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, neutral);
  if (regulation.homeScore !== regulation.awayScore) {
    return { homeScore: regulation.homeScore, awayScore: regulation.awayScore, overtime: false, tied: false };
  }

  const ot = resolveOvertime(
    regulation.homeScore,
    regulation.awayScore,
    regulation.homeExpected,
    regulation.awayExpected,
    rng,
    { allowTie }
  );
  return { homeScore: ot.homeScore, awayScore: ot.awayScore, overtime: true, tied: ot.tied };
}
